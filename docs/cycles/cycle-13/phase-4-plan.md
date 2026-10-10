# Homebase Cycle #13 — Phase 4 Plan: Startup Hydration Task Registry Extraction

**Document:** `docs/cycles/cycle-13/phase-4-plan.md`  
**Date:** October 10, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 853 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Target Milestone:** Single Canonical Ownership for Startup Hydration (Line reduction: ~853 $\to$ ~645 lines is secondary measurement)  
**Target Extracted Module:** [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)  
**Canonical Namespace:** `window.HomebaseStartupHydration`  

---

## 1. Executive Summary & Objective

Following the successful completion of **Cycle #13 Phase 2** (pruning bookmark compatibility bridges and dead state mirrors, reducing `new-tab.js` from 1,148 to 925 lines) and **Phase 3** (extracting wallpaper startup priming into `src/newtab/wallpaper/wallpaper-controller.js`, bringing `new-tab.js` to 853 lines), **Phase 4** addresses the widget startup hydration task registry and runners.

Currently, [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) contains:
1. Top-level allowlist `STARTUP_IDLE_LABELS` (lines 46–57).
2. Nine safe error-wrapped task runners for dashboard widgets (`loadCachedWeatherSafe`, `buildQuoteIndexSafe`, `setupQuoteWidgetSafe`, `setupNewsWidgetSafe`, `setupTodoWidgetSafe`, `setupSearchSafe`, `setupWeatherSafe`, `setupAppLauncherSafe`, `fetchQuoteSafe`) occupying lines 531–707 (~177 lines).
3. The scheduler coordinator `scheduleStartupHydrationTasks()` occupying lines 709–735 (~27 lines).

In total, this subsystem occupies **~208 lines** of domain setup logic inside `new-tab.js`. These functions do not belong in the top-level Startup Orchestrator; they represent a distinct concern: the **Startup Hydration Task Registry**.

**Architectural Principle:**
> **Primary goal is ownership separation: `new-tab.js` becomes startup orchestration only. Line reduction is a secondary measurement.**

Extracting this registry into [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js):
- Establishes clean canonical ownership: `HomebaseStartupHydration` owns widget startup scheduling and instrumentation.
- Reduces `src/new-tab.js` from **853 lines $\longrightarrow$ ~645 lines** (-208 lines net reduction as a secondary quantitative metric).
- Decouples widget setup routines from the core bootstrap sequence.
- Preserves the critical **Startup Contract** (no blocking of synchronous paint, deferred cooperative idle execution).
- Sets the stage for **Phase 5** (extraction of the cooperative Idle Task Scheduler into `src/newtab/core/idle-scheduler.js`).

---

## 2. Current Architecture Audit

### 2.1 Current Startup Hydration Responsibilities in `src/new-tab.js`

In `src/new-tab.js`, the startup hydration logic is divided across three locations:

```text
src/new-tab.js
├── Lines 46–57:   STARTUP_IDLE_LABELS (Set of 10 permitted task label strings)
├── Lines 531–707: 9 Safe Widget Idle Task Runners (inside initializePage)
│   ├── loadCachedWeatherSafe()  [lines 531–546]
│   ├── buildQuoteIndexSafe()    [lines 548–574]
│   ├── setupQuoteWidgetSafe()   [lines 576–591]
│   ├── setupNewsWidgetSafe()    [lines 593–608]
│   ├── setupTodoWidgetSafe()    [lines 610–625]
│   ├── setupSearchSafe()        [lines 627–645]
│   ├── setupWeatherSafe()       [lines 647–665]
│   ├── setupAppLauncherSafe()   [lines 667–682]
│   └── fetchQuoteSafe()         [lines 684–707]
├── Lines 709–735: scheduleStartupHydrationTasks() (inside initializePage)
└── Lines 742–744: runWhenIdle(() => { scheduleStartupHydrationTasks(); })
```

### 2.2 Functional Audit of the 9 Task Runners

| Runner Name | Target Widget / Subsystem | Execution Mode | Target Function Called | Guard Conditions | Telemetry Recorded |
|---|---|:---:|---|---|---|
| `loadCachedWeatherSafe` | Weather (`weather.js`) | `async` | `loadCachedWeather()` | `document.body`, `weatherWidget` | `startup:loadCachedWeather`, `loadCachedWeather` (ms) |
| `buildQuoteIndexSafe` | Quote (`quote.js`) | `async` | `ensureQuoteIndexBuilt()` | `document.body`, `shouldLoadQuoteCatalog({ state })` | `startup:quoteIndex`, `quoteIndex` (ms / skipped) |
| `setupQuoteWidgetSafe` | Quote (`quote.js`) | Sync | `setupQuoteWidget()` | `document.body`, `quoteWidget` | `startup:setupQuoteWidget`, `setupQuoteWidget` (ms) |
| `setupNewsWidgetSafe` | News (`news.js`) | Sync | `setupNewsWidget()` | `document.body`, `newsWidget` | `startup:setupNewsWidget`, `setupNewsWidget` (ms) |
| `setupTodoWidgetSafe` | Todo (`todo.js`) | `async` | `setupTodoWidget()` | `document.body`, `todoWidget` | `startup:setupTodoWidget`, `setupTodoWidget` (ms) |
| `setupSearchSafe` | Search (`search-ui-controller.js`) | `async` | `setupSearch()` | `document.body`, `searchForm`, `searchInput`, `searchSelect`, `searchResultsPanel`, `searchWidget` | `startup:setupSearch`, `setupSearch` (ms), critical phase guard |
| `setupWeatherSafe` | Weather (`weather.js`) | `async` | `setupWeather()` | `document.body`, `weatherWidget` | `startup:setupWeather`, `setupWeather` (ms), critical phase guard |
| `setupAppLauncherSafe` | Integrations (`app-launcher.js`) | Sync | `setupAppLauncher()` | `document.body`, `googleAppsBtn`, `googleAppsPanel` | `startup:setupAppLauncher`, `setupAppLauncher` (ms) |
| `fetchQuoteSafe` | Quote (`quote.js`) | Sync | `fetchQuote()` (or cached render) | `document.body`, `quoteText`, `quoteAuthor` | `startup:fetchQuote`, `fetchQuote` (ms), critical phase guard |

### 2.3 The Startup Contract Invariant

The startup hydration block strictly enforces the canonical Homebase Startup Contract defined in lines 366–372:
```javascript
// ===============================================
// STARTUP CONTRACT
// - initializePage must not await non-critical hydration (weather/search/quote/appLauncher)
// - startup hydration must be scheduled only in scheduleStartupHydrationTasks()
// - all startup idle labels must be prefixed with "startup:"
// - ready flip must not wait for hydration
// ===============================================
```

Crucially:
- `initializePage()` marks the page ready (`markPageReadyOnce()`) on line 737 via `requestAnimationFrame`.
- Widget hydration is queued **after** ready flipping via `runWhenIdle(() => { scheduleStartupHydrationTasks(); })` on lines 742–744.
- All tasks are individually wrapped in cooperative idle chunks and error traps so that a failure in one widget (e.g. network failure in weather) never crashes the page or prevents other widgets from initializing.

---

## 3. Related Modules & Directory Evaluation

### 3.1 Audit of Existing Related Directories

Three locations were audited for housing the extracted registry:

1. **`src/newtab/core/` (Recommended Canonical Destination)**:
   - Contains core runtime infrastructure: `perf-report.js`, `startup-perf-runtime.js`, `storage-dispatcher.js`, `dock-navigation.js`, `dialog-controller.js`.
   - `startup-perf-runtime.js` already houses the startup performance instrumentation runtime.
   - Placing `src/newtab/core/startup-hydration.js` in `core/` keeps all startup infrastructure modules cleanly grouped.
   - Recognized and verified by the static invariant scanner (`scripts/check-newtab-static.mjs`).

2. **`src/newtab/startup/` (Evaluated Alternative)**:
   - Does not currently exist in the repository.
   - Creating a new directory just for this single file would fragment core runtime files and require directory updates across build scripts and documentation.
   - **Conclusion:** Rejected. Keep in `src/newtab/core/`.

3. **`src/newtab/widgets/` (Evaluated Alternative)**:
   - Houses individual widget implementations (`weather.js`, `quote.js`, `news.js`, `todo.js`).
   - The startup hydration registry coordinates multiple domains (Weather, News, Quote, Todo, Search, App Launcher). Placing it in `widgets/` would violate domain boundaries.
   - **Conclusion:** Rejected. Belongs in `core/`.

### 3.2 Script Execution Sequence in `src/new-tab.html`

In `src/new-tab.html`, scripts execute in strict document order:

```html
<!-- Line 3323-3324: Core Perf Runtime -->
<script src="newtab/core/perf-report.js" defer></script>
<script src="newtab/core/startup-perf-runtime.js" defer></script>

<!-- Lines 3347-3367: Storage & Bookmarks -->
...

<!-- Line 3371: Search Helpers (Script #45) -->
<script src="newtab/search/search-ui-controller.js" defer></script>

<!-- Line 3393: Todo Widget (Script #55) -->
<script src="newtab/widgets/todo.js" defer></script>

<!-- Line 3401: Integrations (Script #59) -->
<script src="newtab/integrations/app-launcher.js" defer></script>

<!-- Lines 3405-3407: Quotes, Weather, News (Scripts #61, #62, #63) -->
<script src="newtab/widgets/quote.js" defer></script>
<script src="newtab/widgets/weather.js" defer></script>
<script src="newtab/widgets/news.js" defer></script>

<!-- [PROPOSED INJECTION POINT]: Script #64 -->
<!-- <script src="newtab/core/startup-hydration.js" defer></script> -->

<!-- Line 3410: Main new-tab runtime (Script #65) -->
<script src="new-tab.js" defer></script>
```

**Key Finding:** All target widget scripts (`search-ui-controller.js` #45, `todo.js` #55, `app-launcher.js` #59, `quote.js` #61, `weather.js` #62, `news.js` #63) execute **before** line 3409. Injecting `newtab/core/startup-hydration.js` immediately after `news.js` and immediately before `new-tab.js` guarantees that:
1. Every widget function called by the hydration runners is already defined in memory.
2. `startup-hydration.js` evaluates before `new-tab.js`, making `window.HomebaseStartupHydration` immediately available when `initializePage()` executes.

---

## 4. Comprehensive Dependency & Consumer Audit

### 4.1 Functions Suitable for Extraction
- **The 9 Safe Runners**:
  1. `loadCachedWeatherSafe`
  2. `buildQuoteIndexSafe`
  3. `setupQuoteWidgetSafe`
  4. `setupNewsWidgetSafe`
  5. `setupTodoWidgetSafe`
  6. `setupSearchSafe`
  7. `setupWeatherSafe`
  8. `setupAppLauncherSafe`
  9. `fetchQuoteSafe`
- **The Scheduler Coordinator**:
  - `scheduleStartupHydrationTasks()`
- **The Task Allowlist**:
  - `STARTUP_IDLE_LABELS` (Set of 10 labels)

### 4.2 Current Callers
- **`scheduleStartupHydrationTasks`**:
  - Called in exactly **1 location** in the entire codebase: `src/new-tab.js:743` (`runWhenIdle(() => { scheduleStartupHydrationTasks(); });`).
  - Zero external callers. Zero tests directly mocking it.
- **The 9 Safe Runners**:
  - Called **exclusively** inside `scheduleStartupHydrationTasks()`.
  - Zero callers outside `new-tab.js`.

### 4.3 Global Dependencies Audit
The safe runners reference several symbols from the shared execution context:

| Symbol | Type | Originating Module | Accessibility in `startup-hydration.js` |
|---|---|---|---|
| `recordIdleTaskPerf` | Function | `newtab/core/perf-report.js` | Global function (already on `window`) |
| `recordWidgetPerfTiming` | Function | `newtab/core/perf-report.js` | Global function (already on `window`) |
| `DEBUG_IDLE_STARTUP` | Constant | `newtab/core/startup-perf-runtime.js` | Global constant (already in global lexical scope) |
| `DEBUG_STARTUP_GUARDS` | Constant | `newtab/core/startup-perf-runtime.js` | Global constant (already in global lexical scope) |
| `STARTUP_PHASE` | Variable | Local to `initializePage()` in `new-tab.js` | Passed via option or accessor `getStartupPhase()` |
| `scheduleIdleTask` | Function | `new-tab.js` (L184) | Accessed via `scheduleIdleTask` or `window.scheduleIdleTask` |
| `loadCachedWeather` | Function | `newtab/widgets/weather.js` | Global function |
| `setupWeather` | Function | `newtab/widgets/weather.js` | Global function |
| `ensureQuoteIndexBuilt` | Function | `newtab/widgets/quote.js` | Global function |
| `readCachedQuoteState` | Function | `newtab/widgets/quote.js` | Global function |
| `shouldLoadQuoteCatalog`| Function | `newtab/widgets/quote.js` | Global function |
| `setupQuoteWidget` | Function | `newtab/widgets/quote.js` | Global function |
| `fetchQuote` | Function | `newtab/widgets/quote.js` | Global function |
| `renderCachedQuoteState`| Function | `newtab/widgets/quote.js` | Global function |
| `setupNewsWidget` | Function | `newtab/widgets/news.js` | Global function |
| `setupTodoWidget` | Function | `newtab/widgets/todo.js` | Global function |
| `setupSearch` | Function | `newtab/search/search-ui-controller.js`| Global function |
| `setupAppLauncher` | Function | `newtab/integrations/app-launcher.js` | Global function |

### 4.4 DOM Dependencies Audit
The safe runners verify the existence of specific DOM nodes before running setup functions:

| Element Reference | Current Declaration in `new-tab.js` | Extracted Defensive Resolution Strategy |
|---|---|---|
| `weatherWidget` | `const weatherWidget` in `weather.js:8` | Read directly (available globally) or `document.querySelector('.widget-weather')` |
| `quoteWidget` | `const quoteWidget` in `quote.js:7` | Read directly (available globally) or `document.querySelector('.widget-quote')` |
| `quoteText` | `const quoteText` in `quote.js:23` | Read directly (available globally) or `document.getElementById('quote-text')` |
| `quoteAuthor` | `const quoteAuthor` in `quote.js:24` | Read directly (available globally) or `document.getElementById('quote-author')` |
| `newsWidget` | `const newsWidget` in `news.js:8` | Read directly (available globally) or `document.querySelector('.widget-news')` |
| `todoWidget` | `const todoWidget` in `todo.js:8` | Read directly (available globally) or `document.querySelector('.widget-todo')` |
| `searchWidget` | `const searchWidget` in `new-tab.js:15` | Defensive fallback: `typeof searchWidget !== 'undefined' ? searchWidget : document.querySelector('.widget-search')` |
| `searchResultsPanel`| `const searchResultsPanel` in `new-tab.js:17` | Defensive fallback: `typeof searchResultsPanel !== 'undefined' ? searchResultsPanel : document.getElementById('search-results-panel')` |
| `searchForm` | `const searchForm` in `new-tab.js:351` | Defensive fallback: `typeof searchForm !== 'undefined' ? searchForm : document.getElementById('search-form')` |
| `searchInput` | `const searchInput` in `new-tab.js:352` | Defensive fallback: `typeof searchInput !== 'undefined' ? searchInput : document.getElementById('search-input')` |
| `searchSelect` | `const searchSelect` in `new-tab.js:353` | Defensive fallback: `typeof searchSelect !== 'undefined' ? searchSelect : document.getElementById('search-select')` |
| `googleAppsBtn` | `const googleAppsBtn` in `new-tab.js:9` | Defensive fallback: `typeof googleAppsBtn !== 'undefined' ? googleAppsBtn : document.getElementById('google-apps-btn')` |
| `googleAppsPanel` | `const googleAppsPanel` in `new-tab.js:11` | Defensive fallback: `typeof googleAppsPanel !== 'undefined' ? googleAppsPanel : document.getElementById('google-apps-panel')` |

**Defensive Resolution Advantage:** By using dual checks (`typeof el !== 'undefined' ? el : document.getElementById(...)`), the extracted module operates completely decoupled from element declaration order in `new-tab.js`.

### 4.5 Timing Dependencies
- **Evaluation Timing**: In HTML document order, `startup-hydration.js` evaluates after all widgets and before `new-tab.js`.
- **Execution Timing**: The tasks are scheduled only when `runWhenIdle` fires in `initializePage()` (after `markPageReadyOnce()` has scheduled the ready class flip).
- **Idle Slices**: Tasks execute in short cooperative idle time slices (budget: 12ms per slice).

### 4.6 Event Listeners Audit
- The hydration runners do **not** register top-level DOM or window event listeners.
- The sub-widgets attach their own internal event listeners when their setup functions (`setupSearch`, `setupNewsWidget`, etc.) are called.
- Zero event listener footprint for `startup-hydration.js`.

### 4.7 Async Tasks Audit
- 5 async tasks (`loadCachedWeatherSafe`, `buildQuoteIndexSafe`, `setupTodoWidgetSafe`, `setupSearchSafe`, `setupWeatherSafe`) return Promises.
- Handled safely via `scheduleIdleTask(async () => { ... })` with local `try ... catch` wrappers to prevent unhandled rejections.

### 4.8 Storage Dependencies Audit
- No direct storage reads/writes exist in the hydration wrappers.
- The underlying widgets handle their own persistence via `HomebaseStorage`.
- Schema integrity is 100% maintained.

---

## 5. External Symbol Dependency Audit

This section documents every function, variable, constant, and DOM node that `src/newtab/core/startup-hydration.js` will access, detailing its canonical owner, export mechanism, execution order, and access pattern.

### 5.1 Comprehensive Dependency Table

| Symbol Name | Type | Current Owner File | Current Export Mechanism | Script Order (`new-tab.html`) | Window / Global Access Required |
|---|:---:|---|---|:---:|:---:|
| `loadCachedWeather` | Function | [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L312) | Top-level `async function` in global lexical scope | Script #62 | Global function call (`loadCachedWeather()`) |
| `setupWeather` | Function | [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L673) | Top-level `async function` in global lexical scope | Script #62 | Global function call (`setupWeather()`) |
| `weatherWidget` | Element | [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L8) | Top-level `const` in global lexical scope | Script #62 | Global variable or `document.querySelector('.widget-weather')` |
| `ensureQuoteIndexBuilt` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L251) | Top-level `async function` in global lexical scope | Script #61 | Global function call (`ensureQuoteIndexBuilt()`) |
| `readCachedQuoteState` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L56) | Top-level `function` in global lexical scope | Script #61 | Global function call (`readCachedQuoteState()`) |
| `shouldLoadQuoteCatalog` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L156) | Top-level `function` in global lexical scope | Script #61 | Global function call (`shouldLoadQuoteCatalog()`) |
| `setupQuoteWidget` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L777) | Top-level `function` in global lexical scope | Script #61 | Global function call (`setupQuoteWidget()`) |
| `fetchQuote` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L347) | Top-level `function` in global lexical scope | Script #61 | Global function call (`fetchQuote()`) |
| `renderCachedQuoteState` | Function | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L148) | Top-level `function` in global lexical scope | Script #61 | Global function call (`renderCachedQuoteState()`) |
| `quoteWidget` | Element | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L7) | Top-level `const` in global lexical scope | Script #61 | Global variable or `document.querySelector('.widget-quote')` |
| `quoteText` | Element | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L23) | Top-level `const` in global lexical scope | Script #61 | Global variable or `document.getElementById('quote-text')` |
| `quoteAuthor` | Element | [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L24) | Top-level `const` in global lexical scope | Script #61 | Global variable or `document.getElementById('quote-author')` |
| `setupNewsWidget` | Function | [`src/newtab/widgets/news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L692) | Top-level `function` in global lexical scope | Script #63 | Global function call (`setupNewsWidget()`) |
| `newsWidget` | Element | [`src/newtab/widgets/news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L5) | Top-level `const` in global lexical scope | Script #63 | Global variable or `document.querySelector('.widget-news')` |
| `setupTodoWidget` | Function | [`src/newtab/widgets/todo.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L258) | Top-level `async function` in global lexical scope | Script #55 | Global function call (`setupTodoWidget()`) |
| `todoWidget` | Element | [`src/newtab/widgets/todo.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L8) | Top-level `const` in global lexical scope | Script #55 | Global variable or `document.querySelector('.widget-todo')` |
| `setupSearch` | Function | [`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js#L882) | Dual: `window.setupSearch` & `HomebaseSearchUIController.setupSearch` | Script #45 | Window / Global function call |
| `searchWidget` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L15) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.querySelector('.widget-search')` |
| `searchResultsPanel` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L17) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('search-results-panel')` |
| `searchForm` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L351) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('search-form')` |
| `searchInput` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L352) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('search-input')` |
| `searchSelect` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L353) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('search-select')` |
| `setupAppLauncher` | Function | [`src/newtab/integrations/app-launcher.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/app-launcher.js#L119) | Top-level `function` in global lexical scope | Script #59 | Global function call (`setupAppLauncher()`) |
| `googleAppsBtn` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L9) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('google-apps-btn')` |
| `googleAppsPanel` | Element | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11) | Top-level `const` in `new-tab.js` | Script #64 | Defensive query: `document.getElementById('google-apps-panel')` |
| `recordIdleTaskPerf` | Function | [`src/newtab/core/perf-report.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js#L256) | Top-level `function` in global lexical scope | Script #7 | Global function call (`recordIdleTaskPerf()`) |
| `recordWidgetPerfTiming` | Function | [`src/newtab/core/perf-report.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js#L294) | Top-level `function` in global lexical scope | Script #7 | Global function call (`recordWidgetPerfTiming()`) |
| `DEBUG_IDLE_STARTUP` | Constant | [`src/newtab/core/startup-perf-runtime.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-perf-runtime.js#L296) | Top-level `const` in global lexical scope | Script #8 | Global lexical access (`DEBUG_IDLE_STARTUP`) |
| `DEBUG_STARTUP_GUARDS` | Constant | [`src/newtab/core/startup-perf-runtime.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-perf-runtime.js#L297) | Top-level `const` in global lexical scope | Script #8 | Global lexical access (`DEBUG_STARTUP_GUARDS`) |
| `scheduleIdleTask` | Function | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L184) | Top-level `function` in `new-tab.js` | Script #64 | Passed via option `scheduleTask` or `window.scheduleIdleTask` |
| `STARTUP_PHASE` | Variable | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L376) | Local variable in `initializePage()` | Script #64 | Passed via accessor `getStartupPhase: () => STARTUP_PHASE` |

### 5.2 Subsystem-Specific Audits

#### 5.2.1 Weather Widget Functions
- **Functions:** `loadCachedWeather()`, `setupWeather()`.
- **DOM Container:** `weatherWidget` (`.widget-weather`).
- **Owner:** [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js).
- **Evaluation Order:** Evaluates at Script #62, strictly **before** `startup-hydration.js` (Script #64).
- **Access Safety:** In non-module deferred scripts, top-level function declarations populate both the global lexical environment and `window`. Calling `loadCachedWeather()` or `setupWeather()` from `startup-hydration.js` is 100% safe. Element `weatherWidget` is resolved via global binding or direct fallback `document.querySelector('.widget-weather')`.

#### 5.2.2 Quote Widget Functions
- **Functions:** `ensureQuoteIndexBuilt()`, `readCachedQuoteState()`, `shouldLoadQuoteCatalog()`, `setupQuoteWidget()`, `fetchQuote()`, `renderCachedQuoteState()`.
- **DOM Containers:** `quoteWidget` (`.widget-quote`), `quoteText` (`#quote-text`), `quoteAuthor` (`#quote-author`).
- **Owner:** [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js).
- **Evaluation Order:** Evaluates at Script #61, strictly **before** `startup-hydration.js`.
- **Access Safety:** All 6 functions are top-level function declarations in `quote.js`. All DOM element nodes are queried during initial evaluation. The quote catalog skipping logic (`shouldLoadQuoteCatalog({ state })`) operates identically in `startup-hydration.js` without any external dependency.

#### 5.2.3 News Widget Functions
- **Function:** `setupNewsWidget()`.
- **DOM Container:** `newsWidget` (`.widget-news`).
- **Owner:** [`src/newtab/widgets/news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js).
- **Evaluation Order:** Evaluates at Script #63, immediately preceding `startup-hydration.js` (Script #64).
- **Access Safety:** `setupNewsWidget` is a top-level function declaration available globally. Null guard on `newsWidget` ensures zero exceptions if the news DOM node is omitted or hidden.

#### 5.2.4 Todo Widget Functions
- **Function:** `setupTodoWidget()`.
- **DOM Container:** `todoWidget` (`.widget-todo`).
- **Owner:** [`src/newtab/widgets/todo.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js).
- **Evaluation Order:** Evaluates at Script #55, strictly before `startup-hydration.js`.
- **Access Safety:** `setupTodoWidget` is an `async function` returning a promise. Enclosed in `await setupTodoWidget()` inside the task runner with error containment.

#### 5.2.5 Search Widget Functions
- **Function:** `setupSearch()`.
- **DOM Containers:** `searchWidget`, `searchResultsPanel`, `searchForm`, `searchInput`, `searchSelect`.
- **Owner:** [`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) (logic) & `src/new-tab.js` (legacy element `const` declarations).
- **Evaluation Order:** `search-ui-controller.js` is Script #45 (before `startup-hydration.js`). Legacy element declarations in `new-tab.js` are Script #64 (after `startup-hydration.js`).
- **Access Safety:** Because hydration tasks run **cooperatively during idle time** (invoked after `new-tab.js` completes evaluation), the element references in `new-tab.js` already exist by the time `setupSearchSafe` executes. However, to guarantee total architectural decoupling from `new-tab.js`, `startup-hydration.js` will resolve search DOM elements defensively via local query fallbacks:
  ```javascript
  const form = (typeof searchForm !== 'undefined' && searchForm) || document.getElementById('search-form');
  const input = (typeof searchInput !== 'undefined' && searchInput) || document.getElementById('search-input');
  const select = (typeof searchSelect !== 'undefined' && searchSelect) || document.getElementById('search-select');
  const panel = (typeof searchResultsPanel !== 'undefined' && searchResultsPanel) || document.getElementById('search-results-panel');
  const widget = (typeof searchWidget !== 'undefined' && searchWidget) || document.querySelector('.widget-search');
  ```
  This pattern completely eliminates script-order hazard.

#### 5.2.6 App Launcher Functions
- **Function:** `setupAppLauncher()`.
- **DOM Containers:** `googleAppsBtn` (`#google-apps-btn`), `googleAppsPanel` (`#google-apps-panel`).
- **Owner:** [`src/newtab/integrations/app-launcher.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/app-launcher.js).
- **Evaluation Order:** `app-launcher.js` is Script #59 (before `startup-hydration.js`).
- **Access Safety:** Handled with the same defensive resolver strategy:
  ```javascript
  const btn = (typeof googleAppsBtn !== 'undefined' && googleAppsBtn) || document.getElementById('google-apps-btn');
  const panel = (typeof googleAppsPanel !== 'undefined' && googleAppsPanel) || document.getElementById('google-apps-panel');
  ```

---

## 6. Extraction Proposal

### 6.1 Target Module Specification
- **Path:** [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)
- **Module Pattern:** Self-executing IIFE `(function() { 'use strict'; ... })();` to prevent global lexical declaration pollution.
- **Canonical Export:**
  ```javascript
  window.HomebaseStartupHydration = {
    scheduleStartupHydrationTasks,
    STARTUP_IDLE_LABELS,
    loadCachedWeatherSafe,
    buildQuoteIndexSafe,
    setupQuoteWidgetSafe,
    setupNewsWidgetSafe,
    setupTodoWidgetSafe,
    setupSearchSafe,
    setupWeatherSafe,
    setupAppLauncherSafe,
    fetchQuoteSafe
  };
  ```

### 6.2 Functions That Move
- `STARTUP_IDLE_LABELS` (Set of 10 labels)
- `loadCachedWeatherSafe`
- `buildQuoteIndexSafe`
- `setupQuoteWidgetSafe`
- `setupNewsWidgetSafe`
- `setupTodoWidgetSafe`
- `setupSearchSafe`
- `setupWeatherSafe`
- `setupAppLauncherSafe`
- `fetchQuoteSafe`
- `scheduleStartupHydrationTasks`

### 6.3 Functions That Remain in `src/new-tab.js`
- `initializePage()` (retains high-level boot choreography):
  ```javascript
  runWhenIdle(() => {
    if (window.HomebaseStartupHydration && typeof window.HomebaseStartupHydration.scheduleStartupHydrationTasks === 'function') {
      window.HomebaseStartupHydration.scheduleStartupHydrationTasks({
        getStartupPhase: () => STARTUP_PHASE,
        scheduleTask: scheduleIdleTask
      });
    }
  });
  ```
- `markPageReadyOnce()` (retains ready-state class toggling and timing measurement).
- `scheduleIdleTask()` and idle queue engine (retained until Phase 5 extraction).
- `STARTUP_PHASE` state tracking (`'critical'` $\to$ `'ready'`).
- `scheduleIdleTask(() => ensureDailyWallpaper().catch(() => {}), 'startup:ensureDailyWallpaper')`.

### 6.4 Line Count Evolution
```text
Baseline (End of Phase 3):     853 lines
Extracted in Phase 4:         ~208 lines
Projected new-tab.js Size:    ~645 lines
Cumulative Reduction:         -503 lines from 1,148 baseline (-43.8%)
```
*(Line reduction is tracked as a secondary measurement; primary goal is ownership separation).*

---

## 7. Extraction Boundary Rules

To ensure strict decoupling, preserve system stability, and prevent regressions, Phase 4 must adhere to four boundary rules:

### 7.1 Subsystem Ownership Boundary
- **`HomebaseStartupHydration`** owns:
  - Definition and registration of all non-critical dashboard widget startup idle tasks.
  - Verification that every task label starts with `'startup:'` and exists in `STARTUP_IDLE_LABELS`.
  - Individual error containment, safe execution logging, and widget-level timing performance marks.
  - Safe element resolution fallback for widget DOM nodes.
- **`src/new-tab.js`** owns:
  - Top-level startup lifecycle coordination (`initializePage`).
  - Instant preloading coordination and synchronous ready-state flipping (`markPageReadyOnce`).
  - Triggering hydration scheduling cooperatively via `runWhenIdle`.
  - Supplying the active `STARTUP_PHASE` getter to the hydration registry.

### 7.2 Dependency Availability Guarantee
- In `src/new-tab.html`, `newtab/core/startup-hydration.js` must be positioned as a deferred script after all widget scripts (`widgets/news.js`, etc.) and immediately before `new-tab.js`.
- All widget functions and DOM containers must be available before hydration tasks are processed.

### 7.3 Global Scope Cleanliness
- No new depth-0 `const` or `let` variables may be declared in the global lexical scope.
- All internal helper functions and sets must reside inside the module closure.
- The module must export exclusively via `window.HomebaseStartupHydration`.

### 7.4 Defensive DOM Resolution
- The hydration runners must never throw `ReferenceError` if an element variable is absent or declared later.
- Element lookups must use safe element resolvers (`typeof el !== 'undefined' ? el : document.getElementById('...')`).

---

## 8. No Functional Change Rule

Phase 4 is strictly an **ownership relocation**. It must introduce zero behavioral, semantic, or timing changes.

**Critical Invariance Requirements:**
1. **Identical Task Labels & Ordering**:
   - `startup:loadCachedWeather`
   - `startup:quoteIndex`
   - `startup:setupQuoteWidget`
   - `startup:setupNewsWidget`
   - `startup:setupTodoWidget`
   - `startup:setupSearch`
   - `startup:setupWeather`
   - `startup:setupAppLauncher`
   - `startup:fetchQuote`
   Tasks must be enqueued in the exact same sequence with exact label strings.
2. **Identical Performance Telemetry**:
   - `recordIdleTaskPerf(label, 'start')`
   - `recordWidgetPerfTiming(widgetKey, elapsedMs)`
   - `recordIdleTaskPerf(label, 'end', elapsedMs)`
   - Exact debug log formatting (`[startup idle] startup:loadCachedWeather start`, etc.).
3. **Identical Error Containment**:
   - `try ... catch (err)` logging `console.warn('Startup task failed:', label, err)`.
   - Failures in one task must never abort subsequent tasks.
4. **Identical Guard Logic**:
   - `shouldLoadQuoteCatalog({ state: cachedState })` skipping behavior for quotes.
   - Critical phase warnings `if (DEBUG_STARTUP_GUARDS && getStartupPhase() === 'critical')`.
5. **Startup Contract Preservation**:
   - Ready class flip occurs before hydration tasks run.
   - Hydration tasks run inside cooperative idle callbacks, never blocking synchronous paint.

$$\textbf{Core Invariant: } \text{Zero functional, visual, or algorithmic changes. Pure relocation of ownership.}$$

---

## 9. Atomic Extraction Requirement

### 9.1 Static Invariant Scanner Constraints
Homebase enforces static verification via [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs). This scanner parses all deferred scripts in `src/new-tab.html` using Acorn and detects depth-0 declarations:
- If `STARTUP_IDLE_LABELS` is defined at depth-0 in `startup-hydration.js` while also existing in `new-tab.js`, the scanner immediately fails with a declaration collision error.
- If `startup-hydration.js` is added to `new-tab.html` before it is created on disk, the scanner fails with a missing script error.

### 9.2 Atomic Execution Policy
Phase 4 cannot be split into partial "add then remove" states. The extraction must be performed **atomically**:

1. **Step 1:** Create `src/newtab/core/startup-hydration.js` encapsulated in an IIFE, exporting `window.HomebaseStartupHydration`.
2. **Step 2:** Add `<script src="newtab/core/startup-hydration.js" defer></script>` to `src/new-tab.html` immediately before `new-tab.js`.
3. **Step 3:** Remove `STARTUP_IDLE_LABELS`, the 9 safe runners, and `scheduleStartupHydrationTasks` from `src/new-tab.js`, replacing the internal call with `window.HomebaseStartupHydration.scheduleStartupHydrationTasks()`.
4. **Step 4:** Run `node scripts/check-newtab-static.mjs` immediately to prove 0 collisions.

Any intermediate state containing dual declarations or broken script paths is strictly prohibited.

---

## 10. Technical Audit Checklist

### 10.1 DOM Manipulation Audit
- [x] **Element Guards:** All 9 runners begin with `if (!document || !document.body || !targetElement) return;`.
- [x] **Timing Guarantee:** Evaluates after DOM tree construction; runs cooperatively when browser is idle.
- [x] **Zero Null Dereferences:** Defensive element lookups guarantee safety even if DOM containers are missing.

### 10.2 Async Operations Audit
- [x] **Async Invocations:** `loadCachedWeather`, `ensureQuoteIndexBuilt`, `setupTodoWidget`, `setupSearch`, `setupWeather` are awaited inside async idle tasks.
- [x] **Non-Blocking Execution:** All async tasks are scheduled through `scheduleIdleTask` cooperative budgeting (12ms budget per slice).
- [x] **Error Containment:** Enclosed in local `try ... catch` handlers; zero unhandled promise rejections.

### 10.3 Timers & Cooperative Slicing Audit
- [x] **Timer Usage:** Relies on cooperative `requestIdleCallback` (with fallback to `setTimeout` 500ms via `runWhenIdle`).
- [x] **Zero Memory Leaks:** No standing intervals or uncleaned timeout handles created.

### 10.4 Event Listeners Audit
- [x] **Listener Footprint:** Zero event listeners registered by the hydration module itself.

### 10.5 Storage Dependencies Audit
- [x] **Interface Compliance:** Indirect access via widgets; zero raw storage operations in the registry.

---

## 11. Risk Analysis & Mitigation

### 11.1 Script Ordering & Dependency Inversion
- **Risk:** Could widget functions be undefined when `startup-hydration.js` evaluates?
- **Mitigation:** `startup-hydration.js` is registered as script #64, after all widget scripts (#45–#63) and before `new-tab.js` (#65). All widget functions exist in memory prior to `startup-hydration.js`.

### 11.2 Idle Scheduler Availability
- **Risk:** `scheduleIdleTask` is currently defined in `new-tab.js`. Could `startup-hydration.js` try to call it before `new-tab.js` evaluates?
- **Mitigation:** `scheduleStartupHydrationTasks()` is only invoked inside `runWhenIdle()` from `initializePage()`. By the time `runWhenIdle` triggers, `new-tab.js` has already completed its top-level evaluation. Additionally, `scheduleIdleTask` can be passed explicitly into `scheduleStartupHydrationTasks({ scheduleTask })` or resolved defensively from `window.scheduleIdleTask`.

### 11.3 Static Scanner Invariant
- **Risk:** Scanner could flag top-level declaration collision.
- **Mitigation:** The entire `startup-hydration.js` module is wrapped in an IIFE. Only `window.HomebaseStartupHydration` is exposed, guaranteeing 0 depth-0 lexical collisions.

---

## 12. Implementation Roadmap (Phases 4A & 4B)

To maintain rigorous development hygiene:

### Phase 4A: Module Creation & Boundary Preparation
1. Create `src/newtab/core/startup-hydration.js` with complete IIFE encapsulation.
2. Register `<script src="newtab/core/startup-hydration.js" defer></script>` in `src/new-tab.html`.
3. Add `newtab/core/startup-hydration.js` to `keyExtractedModulePaths` in `scripts/check-newtab-static.mjs`.
4. Validate module syntax via `node --check`.

### Phase 4B: Orchestrator Delegation & Monolith Pruning
1. Replace internal runners in `src/new-tab.js` with delegation to `window.HomebaseStartupHydration.scheduleStartupHydrationTasks()`.
2. Remove `STARTUP_IDLE_LABELS` and the 9 safe runners from `src/new-tab.js`.
3. Verify zero declaration collisions with `scripts/check-newtab-static.mjs`.
4. Run full test suite (`npm.cmd test`) and dual build (`npm.cmd run build`).
5. Document results in `docs/cycles/cycle-13/phase-4-implementation-report.md`.

---

## 13. Verification Plan & Success Criteria

The implementation must pass the mandatory 5-stage verification suite:

```powershell
# 1. Syntax checks on modified and new files
node --check src/newtab/core/startup-hydration.js
node --check src/new-tab.js

# 2. Static declaration collision scanner & script manifest validation
node scripts/check-newtab-static.mjs

# 3. 4-Stage Automated Test Suite (All 367 unit tests + headless browser smoke test)
npm.cmd test

# 4. Dual Target Production Build (Chrome & Firefox distributions)
npm.cmd run build

# 5. Protected Files Diff (Must be completely empty)
git diff src/preload.js src/instant_load.js manifests/ dist/
```

### Success Criteria
- **Architectural Primacy**: **Primary goal is ownership separation: `new-tab.js` becomes startup orchestration only. Line reduction is a secondary measurement.**
- **Syntax**: 0 errors across all JavaScript files.
- **Static Invariant Scanner**: 64 deferred scripts verified, 0 duplicate declarations, 0 lexical collisions.
- **Unit Tests**: 367 / 367 tests passing (100%).
- **Browser Smoke Test**: Headless browser boots cleanly with required DOM surfaces, core controllers active, and 0 severe runtime errors.
- **Dual Build**: Clean builds in `dist/chrome/` and `dist/firefox/`.
- **Protected Files**: Empty diff.

---

## 14. Rollback Strategy

If any unexpected regression or verification failure occurs during Phase 4 implementation:
```powershell
# Revert modifications to existing files
git checkout -- src/new-tab.html src/new-tab.js scripts/check-newtab-static.mjs

# Remove untracked new module if created
Remove-Item -Force src/newtab/core/startup-hydration.js
```
This restores the repository immediately to the clean, fully verified state of commit `62fc42f`.
