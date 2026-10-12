# Cycle #18 Phase 1 — Widget Lifecycle & Performance Architecture Audit

## 1. Executive Summary

Following the completion of Cycle #17 (which established canonical storage ownership in `HomebaseWidgetStorage` and extracted presentation renderers in `HomebaseWeatherCardRenderer`, `HomebaseNewsCardRenderer`, and `HomebaseQuoteCardRenderer`), Cycle #18 focuses on **Widget Lifecycle, Teardown Safety, and Performance Optimization**.

This audit examines the seven widget subsystem modules:
1. `src/newtab/widgets/weather.js`
2. `src/newtab/widgets/news.js`
3. `src/newtab/widgets/quote.js`
4. `src/newtab/widgets/time.js`
5. `src/newtab/widgets/todo.js`
6. `src/newtab/widgets/widget-storage.js`
7. `src/newtab/widgets/widget-visibility.js`
along with the startup pipeline (`src/preload.js`, `src/instant_load.js`, `src/newtab/core/startup-hydration.js`, `src/new-tab.js`).

### Key Findings
- **Zero Teardown Contracts**: Not a single widget controller provides a `destroy()` or cleanup method.
- **Missing Idempotency Guards**: With the exception of `todo.js` (which guards using `data-ready="1"`), calling setup functions (`setupWeather`, `setupNewsWidget`, `setupQuoteWidget`) multiple times accumulates duplicate click, input, scroll, and resize event listeners.
- **Unmanaged Global Timers**: The 60-second clock timer in `src/new-tab.js` runs continuously with no handle retention, no `clearInterval`, and no background tab visibility throttling.
- **Window/Document Listener Leaks in News**: `news.js` registers unthrottled `window: resize` and `document: scroll` listeners for its tooltip positioning without any mechanism to detach them.
- **Duplicate Modal Plumbing**: Weather, News, and Quote widgets independently duplicate modal backdrop click, close button, and cancel button listeners.
- **Lack of Tab Visibility Coordination**: When a new-tab remains open in the background for hours, widgets do not pause timers, nor do they revalidate stale caches when the tab becomes visible again via `document.visibilitychange`.

---

## 2. Module Inventory & Code Metrics

| Module | Lines | Function Count | Exported Globals | Primary Responsibilities |
|---|---|---|---|---|
| `weather.js` | 1,201 | 112 | None (Top-level globals) | Weather API queries (Open-Meteo, OpenWeather), geocoding lookup, geolocation, cache coordination |
| `news.js` | 852 | 110 | `window.fetchAndRenderNews` | RSS/Atom feed fetching, XML parsing, source selection, lazy loading observer |
| `quote.js` | 940 | 88 | None (Top-level globals) | Quote catalog indexing, rotation scheduling, category tag filtering, clipboard copying |
| `time.js` | 68 | 10 | `window.applyTimeFormatPreference`, `window.setTimeFormatPreference` | Clock and date text updates, 12h/24h preference management |
| `todo.js` | 376 | 50 | None (Top-level globals) | Todo item CRUD, filter state (all vs active), storage synchronization |
| `widget-storage.js` | 537 | 65 | `window.HomebaseWidgetStorage` | Canonical persistence facade, schema accessors, fast localStorage mirrors |
| `widget-visibility.js` | 259 | 34 | `window.revealWidget` | Sidebar widget ordering, drag-and-drop sortable, visibility toggle classes |
| `weather-card-renderer.js` | 350 | 34 | `window.HomebaseWeatherCardRenderer` | Presentation DOM generation, metric cards, forecast strip, loading/offline UI |
| `news-card-renderer.js` | 257 | 28 | `window.HomebaseNewsCardRenderer` | Article card DOM generation, source badges, hover preview popup DOM |
| `quote-card-renderer.js` | 186 | 24 | `window.HomebaseQuoteCardRenderer` | Quote typography formatting, category filter pills, copy success feedback |

Total Widget Subsystem: **5,026 lines** across 10 modules.

---

## 3. Lifecycle Ownership Matrix

| Module | Initialize Entry Point | Destroy / Cleanup | Timers (`setInterval` / `setTimeout`) | Event Listeners | Observers | Identified Lifecycle Risks |
|---|---|---|---|---|---|---|
| **Weather** (`weather.js`) | `loadCachedWeather()`, `setupWeather()` | None (0) | 2 `setTimeout` (300ms geocode debounce, 7s fetch watchdog) | 11 `addEventListener` (click, input on modal buttons & fields) | None | No `destroy()`; no idempotency guard in `setupWeather`; listeners multiply if called repeatedly; dead references to `#settings-btn` and `#set-location-btn`. |
| **News** (`news.js`) | `setupNewsWidget()`, `setupNewsHoverPreview()` | None (0) | 1 `setTimeout` (7s fetch watchdog) | 15 `addEventListener` (click on modal, hover tooltips, `window: resize`, `document: scroll`) | 1 `IntersectionObserver` (viewport entry lazy load) | `window: resize` and `document: scroll` listeners attached globally without cleanup; no `destroy()`; no idempotency guard in `setupNewsWidget`. |
| **Quote** (`quote.js`) | `setupQuoteWidget()` | None (0) | 2 `setTimeout` (1.5s copy button reset, 400ms rotation reset) | 9 `addEventListener` (click on next, copy, modal buttons) | None | No `destroy()`; no idempotency guard in `setupQuoteWidget`; rotation only computed at startup; no visibility sync. |
| **Time** (`time.js`) | `updateTime()` | None (0) | None in module (`setInterval` created externally in `src/new-tab.js`) | None | None | External `setInterval(updateTime, 60000)` in `new-tab.js` has no reference, no cleanup, and continues ticking in hidden background tabs. |
| **Todo** (`todo.js`) | `setupTodoWidget()` | None (0) | None | 7 `addEventListener` (click, change, keydown on todo input/list) | None | No `destroy()`; has basic `todoWidget.dataset.ready === '1'` guard, but cannot unbind if widget is rebuilt. |
| **Widget Storage** (`widget-storage.js`) | N/A (Stateless Service) | N/A | None | None | None | Low risk; pure persistence facade. |
| **Widget Visibility** (`widget-visibility.js`) | `setupWidgetOrderSortable()` | `widgetSettingsSortable.destroy()` (partial) | None | Sortable drag handles | None | Sortable instance has internal destroy, but visibility controller has no global teardown. |

---

## 4. Duplicate Logic Audit

### 4.1 Repeated Modal Dialog Event Plumbing
Weather, News, and Quote widgets each implement private settings dialogs with nearly identical DOM binding routines:
```javascript
// Repeated in weather.js, news.js, quote.js:
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
modalEl.addEventListener('click', (e) => {
  if (e.target === modalEl) closeModal();
});
```
This logic duplicates event registration and backdrop-click detection three separate times without utilizing the existing `HomebaseDialogController` abstraction.

### 4.2 Dead Element Queries and Obsolete Bindings
In `weather.js`:
- `const settingsBtn = document.getElementById('settings-btn');` (Element `#settings-btn` does not exist in `src/new-tab.html`).
- `const setLocationBtn = document.getElementById('set-location-btn');` (Element `#set-location-btn` does not exist in `src/new-tab.html`).
- Both elements are queried at script evaluation time and have click listeners bound conditionally if truthy, representing dead code artifacts from earlier UI designs.

### 4.3 Repeated Network Fetch Watchdog Pattern
Both `weather.js` and `news.js` hand-roll a 7-second abort watchdog:
```javascript
// In weather.js & news.js:
const timeoutId = setTimeout(() => {
  isTimeout = true;
  abortController.abort();
}, 7000);
```
Neither module shares an abortable timeout helper, resulting in duplicated timeout clearing, error suppression, and flag tracking across widgets.

### 4.4 Repeated Visibility Persistence Chains
In `news.js:setNewsPreference()` and `todo.js:setTodoPreference()`:
- Identical logic is used to toggle document root classes (`news-hidden`, `todo-hidden`).
- Identical calls update `localStorage` mirrors (`fast-show-news`, `fast-show-todo`).
- Identical calls invoke `applyWidgetVisibility()` and `updateWidgetSettingsUI()`.

---

## 5. Performance & Startup Audit

### 5.1 Startup Execution Pipeline
Homebase executes a 3-tier startup pipeline for widgets:
1. **Tier 1 — Synchronous Head Hydration (<50ms)**:
   - Handled exclusively by `src/instant_load.js`.
   - Reads fast `localStorage` mirrors (`fast-time-format`, `fast-weather`, `fast-search`, `fast-quote-state`, `fast-todo`, `fast-news`).
   - Injects initial text and toggles `.widget-visible` classes before first paint.
   - Guaranteed protected file; zero regressions detected.
2. **Tier 2 — Paint Ready State (Sub-100ms)**:
   - Orchestrated in `src/new-tab.js` (`markPageReadyOnce` via `requestAnimationFrame`).
   - Removes `.preload` class and enables CSS transitions.
3. **Tier 3 — Cooperative Idle Hydration Tasks**:
   - Orchestrated in `src/newtab/core/startup-hydration.js` via `runWhenIdle` / `requestIdleCallback`.
   - Enqueues 9 labeled startup tasks:
     - `startup:loadCachedWeather`
     - `startup:quoteIndex`
     - `startup:setupQuoteWidget`
     - `startup:setupNewsWidget`
     - `startup:setupTodoWidget`
     - `startup:setupSearch`
     - `startup:setupWeather`
     - `startup:setupAppLauncher`
     - `startup:fetchQuote`

### 5.2 Idle Task Redundancies
In `src/newtab/core/startup-hydration.js`:
- `startup:loadCachedWeather` runs `loadCachedWeather()`, which reads the weather cache and renders the card.
- Subsequently, `startup:setupWeather` runs `setupWeather()`, which reads storage **again** (`weatherStorageGet`), evaluates cache freshness **again**, and conditionally renders **again**.
- This performs redundant storage lookups and duplicate rendering passes during idle boot.

### 5.3 Background Tab Resource Drain
- When a new-tab remains open in a background tab:
  - `setInterval(updateTime, 60000)` continues firing every minute.
  - No widget listens to `document.addEventListener('visibilitychange')`.
  - When the user switches back to a tab that has been inactive for hours, weather data and quotes remain stale until manually refreshed or until a full page reload occurs.

---

## 6. Architecture Assessment

```text
                               ┌─────────────────────────────┐
                               │  HomebaseStartupHydration   │
                               └──────────────┬──────────────┘
                                              │ (idle scheduling)
       ┌───────────────────┬──────────────────┼───────────────────┬───────────────────┐
       ▼                   ▼                  ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  weather.js  │    │   news.js    │   │   quote.js   │    │   time.js    │    │   todo.js    │
│  setupWeather│    │setupNewsWidg.│   │setupQuoteWid.│    │ updateTime   │    │setupTodoWidg.│
└──────┬───────┘    └──────┬───────┘   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                  │                   │                   │
       ▼                   ▼                  ▼                   │                   │
┌──────────────┐    ┌──────────────┐   ┌──────────────┐           │                   │
│ WeatherCard  │    │   NewsCard   │   │  QuoteCard   │           │                   │
│   Renderer   │    │   Renderer   │   │   Renderer   │           │                   │
└──────────────┘    └──────────────┘   └──────────────┘           │                   │
       │                   │                  │                   │                   │
       └───────────────────┼──────────────────┴───────────────────┴───────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │    HomebaseWidgetStorage     │
            └──────────────────────────────┘
```

### Identified Need
The widget subsystem currently lacks a **Canonical Widget Lifecycle Service / Abstraction**. Each widget controller is an unencapsulated set of script-scoped functions and variables. Introducing a standardized lifecycle protocol:
1. `initialize()` with idempotency protection.
2. `destroy()` for deterministic event listener and observer cleanup.
3. Centralized `visibilitychange` synchronization (pause background timers, revalidate stale widgets on tab focus).
4. Elimination of dead DOM bindings and redundant idle startup passes.
