# Cycle #18 Phase 4 — Widget Visibility Synchronization Plan

## 1. Executive Summary & Goals

Following the successful migration of widget controllers to `HomebaseWidgetLifecycle` in Phase 3, Phase 4 establishes `HomebaseWidgetLifecycle` as the **single canonical coordinator of widget visibility and active state**.

### Primary Goals
1. **Single Canonical Visibility State**: Consolidate widget visibility tracking so `HomebaseWidgetLifecycle` manages UI visibility (sidebar & widget toggles) and tab visibility (`document.visibilityState`).
2. **Standardized Lifecycle Callbacks**: Introduce explicit, uniform hooks across all widget controllers:
   - `onShow()`: Invoked when a widget becomes visible in the UI.
   - `onHide()`: Invoked when a widget is hidden in the UI (`force-hidden` or `sidebar-hidden`).
   - `pause()`: Invoked when the browser tab becomes hidden or when the widget is hidden, halting timers and network requests.
   - `resume()`: Invoked when the browser tab becomes visible and the widget is visible, restarting timers and refreshing stale data.
3. **Resource & Power Efficiency**: Eliminate unmanaged background work:
   - Stop `time.js` 60-second interval execution in background tabs.
   - Abort in-flight network requests (`weather.js`, `news.js`) when widgets are hidden.
   - Consolidate `IntersectionObserver` lazy-loading logic in `news.js` with lifecycle visibility events.
4. **Zero UI Regressions**: Preserve existing fast mirror preload, DOM layout, and preference toggle behavior.

---

## 2. Audit Findings

### 2.1 Current State Audit by Subsystem

| Module | Current Visibility Mechanism | Background Timers / Observers | Issues & Gaps |
|---|---|---|---|
| **`widget-visibility.js`** | `applyWidgetVisibility()` toggles `.force-hidden` based on `appShowSidebarPreference` and `appShow<Widget>Preference`. `applySidebarVisibility()` toggles `.sidebar-hidden`. | None | Does **not** notify `HomebaseWidgetLifecycle`. Does not trigger any controller callbacks. Hidden widgets remain fully active in memory. |
| **`widget-lifecycle.js`** | Has `setWidgetVisibility(id, isVisible)` (stub updating boolean record only). Has `onVisibilityChange(callback)` and `isTabVisible()`. | Single document `visibilitychange` listener attached lazily. | `setWidgetVisibility` does not call controller hooks (`onShow`, `onHide`, `pause`, `resume`). Controllers are not automatically paused on tab hide. |
| **`time.js`** | Heading element `#current-time`. Formatted on startup and updated via 60s `setInterval`. | `timeIntervalId` runs indefinitely once initialized. | Keeps ticking every minute even when tab is in background or hidden. No `pause()` / `resume()` handling. |
| **`weather.js`** | Rendered via `.widget-weather`. `setWeatherPreference` toggles `.weather-hidden` and calls `applyWidgetVisibility()`. | `searchTimeout` (debounce), in-flight `fetchWithTimeout` / `geoAbortController`. | Initializes and fetches weather on startup even if sidebar or weather widget is disabled/hidden. In-flight fetches continue when hidden. |
| **`news.js`** | Rendered via `.widget-news`. `observeNewsWidgetVisibility()` uses `IntersectionObserver` to defer fetch. | `newsVisibilityObserver` (IntersectionObserver), in-flight `newsFetchAbortController`. | Disconnects observer on first trigger. If user re-enables news after hiding, observer is never reattached. Network requests do not abort when widget is hidden. |
| **`quote.js`** | Rendered via `.widget-quote`. `isQuoteWidgetEnabled()` guards initial render and catalog load. | `quoteCopyTimeout`, `quoteRotateTimeout`. | Does not pause or resume based on tab visibility. |
| **`todo.js`** | Rendered via `.widget-todo`. Local state only. | None | Does not react to visibility changes; continues passive DOM retention. |

### 2.2 Duplicated Logic & Gaps Identified
1. **Disconnected Bridge**: `applyWidgetVisibility()` in `widget-visibility.js` manipulates CSS classes on DOM nodes, while `HomebaseWidgetLifecycle` maintains an internal map without being kept in sync.
2. **Missing Tab Inactivity Handling**: No widget stops timers when the user switches to another tab. `document.visibilityState === 'hidden'` is completely unutilized by widgets.
3. **In-Flight Network Waste**: Hiding weather or news does not abort active `fetch` operations or clear debounce timers.
4. **Re-activation Blindspot**: Re-enabling a previously disabled widget in settings toggles the DOM class, but fails to re-trigger lazy-load observers or data hydration.

---

## 3. Proposed Architecture

### 3.1 Two-Tier Visibility Model

Visibility state is factored into two orthogonal dimensions:
1. **Widget UI Visibility (`isUIVisible`)**: Is the widget enabled by user preferences and visible in the layout?
   - Formula: `appShowSidebarPreference && appShow<Widget>Preference` (or `:not(.force-hidden)`).
2. **Document Tab Visibility (`isTabVisible`)**: Is the browser tab currently active/foregrounded?
   - Formula: `document.visibilityState === 'visible'`.
3. **Effective Active State (`isActive`)**:
   - `isActive = isUIVisible && isTabVisible`.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        HomebaseWidgetLifecycle                         │
├────────────────────────────────────────────────────────────────────────┤
│  State Tracking:                                                       │
│  - record.isInitialized (boolean)                                      │
│  - record.isVisible     (boolean: UI enabled)                          │
│  - record.isActive      (boolean: UI enabled && tab active)            │
│                                                                        │
│  Coordination:                                                         │
│  - setWidgetVisibility(widgetId, isVisible)                            │
│  - syncAllWidgetVisibilities()                                         │
│  - handleTabVisibilityChange(isTabVisible)                             │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
       UI Visibility Transition            Tab Visibility Transition
       (onShow / onHide)                   (pause / resume)
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           Widget Controllers                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   time.js    │  │  weather.js  │  │   news.js    │  │  quote.js  │  │
│  │  pause()     │  │  onShow()    │  │  onShow()    │  │  pause()   │  │
│  │  resume()    │  │  onHide()    │  │  onHide()    │  │  resume()  │  │
│  │              │  │  pause()     │  │  pause()     │  │            │  │
│  │              │  │  resume()    │  │  resume()    │  │            │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Standardized Controller Callback Contracts

Each registered widget controller may optionally implement:

```typescript
interface HomebaseWidgetLifecycleController {
  initialize?(): Promise<void> | void;
  destroy?(): void;
  onShow?(): void;    // Called when widget UI transitions hidden -> visible
  onHide?(): void;    // Called when widget UI transitions visible -> hidden
  pause?(): void;     // Called when tab becomes hidden OR widget is hidden
  resume?(): void;    // Called when tab becomes visible AND widget is visible
}
```

### 3.3 Dispatch Rules in `HomebaseWidgetLifecycle`

1. **`setWidgetVisibility(widgetId, isVisible)`**:
   - Updates `record.isVisible = Boolean(isVisible)`.
   - Computes `newActive = isVisible && isTabVisible()`.
   - If `isVisible` changed from `false` to `true`:
     - Calls `controller.onShow?.()`.
     - If `newActive && !record.isActive`: calls `controller.resume?.()`.
   - If `isVisible` changed from `true` to `false`:
     - If `record.isActive`: calls `controller.pause?.()`.
     - Calls `controller.onHide?.()`.
   - Updates `record.isActive = newActive`.

2. **`handleTabVisibilityChange(isTabVisible)`**:
   - For every registered widget where `record.isInitialized && !record.isDestroyed`:
     - If `record.isVisible`:
       - If `isTabVisible && !record.isActive`:
         - `record.isActive = true;`
         - Calls `controller.resume?.()`.
       - If `!isTabVisible && record.isActive`:
         - `record.isActive = false;`
         - Calls `controller.pause?.()`.

3. **Bridge in `applyWidgetVisibility()`**:
   - `applyWidgetVisibility()` toggles `.force-hidden` on DOM elements as before.
   - In addition, it dispatches:
     ```javascript
     if (typeof HomebaseWidgetLifecycle !== 'undefined') {
       HomebaseWidgetLifecycle.setWidgetVisibility('weather', shouldShowWeather);
       HomebaseWidgetLifecycle.setWidgetVisibility('quote', shouldShowQuote);
       HomebaseWidgetLifecycle.setWidgetVisibility('news', shouldShowNews);
       HomebaseWidgetLifecycle.setWidgetVisibility('todo', shouldShowTodo);
       HomebaseWidgetLifecycle.setWidgetVisibility('time', true); // Time always visible unless destroyed
     }
     ```

---

## 4. Implementation Steps (Phase 4 Roadmap)

### Step 1: Enhance `src/newtab/widgets/widget-lifecycle.js`
- Add `isActive` tracking to `WidgetRecord`.
- Implement full `setWidgetVisibility(widgetId, isVisible)` with transition dispatch (`onShow`, `onHide`, `pause`, `resume`).
- Enhance tab visibility handler to loop over registered widgets and trigger `pause()` / `resume()` on active widgets.
- Add `syncAllVisibilities()` helper for bulk state synchronization.
- Ensure fault-tolerant invocation (wrapped in `try/catch` per callback).

### Step 2: Bridge `src/newtab/widgets/widget-visibility.js`
- Update `applyWidgetVisibility()` to forward each widget's calculated visibility (`shouldShowWeather`, etc.) to `HomebaseWidgetLifecycle.setWidgetVisibility()`.
- Update `applySidebarVisibility()` to ensure `applyWidgetVisibility()` is called so all widgets update their active/visible states.

### Step 3: Implement Visibility Callbacks in Widget Controllers
1. **`time.js`**:
   - Add `pause()`: Clears `timeIntervalId` (stops 60s background ticking).
   - Add `resume()`: Calls `updateTime()` immediately, restarts `setInterval(updateTime, 60000)`.
2. **`weather.js`**:
   - Add `onShow()`: If uninitialized or cache expired, fetches weather data.
   - Add `onHide()`: Aborts in-flight `geoAbortController`, clears `searchTimeout`.
   - Add `pause()`: Suspends active timers.
   - Add `resume()`: If weather cache is stale, refreshes.
3. **`news.js`**:
   - Add `onShow()`: If news has not been fetched yet, triggers `observeNewsWidgetVisibility()`.
   - Add `onHide()`: Aborts in-flight `newsFetchAbortController`, disconnects observer.
   - Add `pause()`: Aborts in-flight non-critical fetches.
   - Add `resume()`: Re-arms visibility observer or refreshes if cache is stale.
4. **`quote.js`**:
   - Add `onShow()`: Ensures cached quote is rendered.
   - Add `pause()`: Clears rotation/copy timeouts.
   - Add `resume()`: Checks if daily rotation is due.
5. **`todo.js`**:
   - Add `onShow()`: Ensures todo list is rendered cleanly.

### Step 4: Add Unit Tests
Create `tests/unit/widget-visibility-lifecycle.test.mjs`:
- Test `setWidgetVisibility` transitions:
  - Hidden -> Visible triggers `onShow` and `resume`.
  - Visible -> Hidden triggers `pause` and `onHide`.
- Test Tab visibility transitions:
  - Tab visible -> hidden triggers `pause` on active widgets.
  - Tab hidden -> visible triggers `resume` on visible widgets.
- Test Time controller pauses interval when hidden and restarts on resume.
- Test Weather controller aborts requests on hide.
- Test News controller manages observer on show/hide.

---

## 5. Migration Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Timer duplication on resume** | Calling `resume()` multiple times could create multiple `setInterval` instances in `time.js`. | Guard `resume()` with check `if (!timeIntervalId)` and test idempotency. |
| **Premature fetch aborts** | Aborting in-flight fetch on tab backgrounding could cause errors. | Only abort background network requests if widget UI is hidden (`onHide`), or handle `AbortError` silently during `pause()`. |
| **Startup hydration race** | `applyWidgetVisibility()` running before controllers register could lose visibility status. | `setWidgetVisibility()` records state even if controller is not yet registered; when `registerWidget()` is called, it syncs with the existing record state. |
| **Cross-browser tab visibility differences** | Gecko vs. Chromium handling of `visibilitychange`. | Rely strictly on standard `document.visibilityState === 'visible'`, covered by unit test sandbox and browser smoke test. |

---

## 6. Verification Plan

1. **Syntax Validation**:
   ```powershell
   node --check src/newtab/widgets/widget-lifecycle.js src/newtab/widgets/widget-visibility.js src/newtab/widgets/time.js src/newtab/widgets/weather.js src/newtab/widgets/news.js src/newtab/widgets/quote.js src/newtab/widgets/todo.js
   ```
2. **Static Invariants**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
3. **Unit Tests**:
   ```powershell
   node --test tests/unit/widget-visibility-lifecycle.test.mjs
   npm.cmd test
   ```
4. **Build & Protected Files**:
   ```powershell
   npm.cmd run build
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```
