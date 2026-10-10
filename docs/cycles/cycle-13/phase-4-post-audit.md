# Homebase Cycle #13 — Phase 4 Post-Extraction Audit

**Document:** `docs/cycles/cycle-13/phase-4-post-audit.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — PHASE 4 FULLY VERIFIED  
**Phase Target:** Cycle #13 Phase 4 (Startup Hydration Task Registry Extraction Post-Audit)  
**Evaluated Modules:**  
- [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)  
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
- [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)  

---

## 1. Summary

The post-extraction audit for **Cycle #13 Phase 4** is complete and validated. Ownership of the Startup Hydration Task Registry (`STARTUP_IDLE_LABELS`, the 9 safe widget idle task runners, and `scheduleStartupHydrationTasks`) has successfully moved from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) to [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js).

All 6 core dimensions of the audit confirmed complete success:
1. **Ownership Separation**: Zero duplicate runner functions, labels, or scheduling logic in `src/new-tab.js`. Single canonical ownership in `HomebaseStartupHydration`.
2. **Dependency Boundary**: Clean dependency injection for `scheduleTask` and `getStartupPhase`; zero direct coupling to `new-tab.js` runtime internals.
3. **DOM Safety**: Defensive element resolvers guarantee zero `ReferenceError` risks regardless of element declaration order.
4. **Script Execution Order**: Strict sequence in `src/new-tab.html`: widget scripts $\longrightarrow$ `startup-hydration.js` $\longrightarrow$ `new-tab.js`.
5. **Static Invariants**: Acorn depth-0 static scanner verified 64 deferred scripts and 875 unique declarations with **0 collisions**.
6. **Runtime & Build Stability**: 100% pass rate across 367 unit tests, headless browser smoke test, and dual Chrome/Firefox distribution builds.

---

## 2. Ownership Table

| Responsibility | Canonical Owner | Export / Scope Mechanism |
|---|---|---|
| **Idle task labels (`STARTUP_IDLE_LABELS`)** | `HomebaseStartupHydration` | Private `Set` inside module IIFE closure |
| **Widget safe runners (9 runners)** | `HomebaseStartupHydration` | Private error-contained closures inside module IIFE |
| **Cooperative task scheduler (`scheduleStartupHydrationTasks`)** | `HomebaseStartupHydration` | Canonical export on `window.HomebaseStartupHydration` |
| **Startup orchestration (`initializePage`, `markPageReadyOnce`)** | `src/new-tab.js` | Top-level startup lifecycle coordinator |
| **Hydration dispatch trigger** | `src/new-tab.js` | `runWhenIdle` delegating to `window.HomebaseStartupHydration` |

---

## 3. Comprehensive Reference & Consumer Audit

A repository-wide symbol audit using `git grep` verified that all 11 extracted symbols exist exclusively within the new canonical owner:

| Symbol Searched | Occurrences in `startup-hydration.js` | Occurrences in `new-tab.js` | Status |
|---|:---:|:---:|:---:|
| `STARTUP_IDLE_LABELS` | Line 12 (definition), Line 237 (check) | **0** | **Single Canonical Owner** |
| `loadCachedWeatherSafe` | Line 25 (definition), Line 249 (call) | **0** | **Single Canonical Owner** |
| `buildQuoteIndexSafe` | Line 42 (definition), Line 250 (call) | **0** | **Single Canonical Owner** |
| `setupQuoteWidgetSafe` | Line 70 (definition), Line 251 (call) | **0** | **Single Canonical Owner** |
| `setupNewsWidgetSafe` | Line 88 (definition), Line 252 (call) | **0** | **Single Canonical Owner** |
| `setupTodoWidgetSafe` | Line 105 (definition), Line 253 (call) | **0** | **Single Canonical Owner** |
| `setupSearchSafe` | Line 122 (definition), Line 254 (call) | **0** | **Single Canonical Owner** |
| `setupWeatherSafe` | Line 149 (definition), Line 255 (call) | **0** | **Single Canonical Owner** |
| `setupAppLauncherSafe` | Line 175 (definition), Line 256 (call) | **0** | **Single Canonical Owner** |
| `fetchQuoteSafe` | Line 194 (definition), Line 257 (call) | **0** | **Single Canonical Owner** |
| `scheduleStartupHydrationTasks` | Line 223 (definition), Line 261 (export) | Lines 526–527 (delegation only) | **Single Canonical Owner** |

**Confirmation:**
- Zero duplicate runners exist in `new-tab.js`.
- Zero duplicate label allowlists exist.
- Zero duplicate scheduler logic exists.
- `new-tab.js` solely delegates:
  ```javascript
  runWhenIdle(() => {
    if (window.HomebaseStartupHydration && typeof window.HomebaseStartupHydration.scheduleStartupHydrationTasks === 'function') {
      window.HomebaseStartupHydration.scheduleStartupHydrationTasks({
        scheduleTask: scheduleIdleTask,
        getStartupPhase: () => STARTUP_PHASE
      });
    }
  });
  ```

---

## 4. Dependency Boundary Audit

The dependency boundary between `src/new-tab.js` and `src/newtab/core/startup-hydration.js` was audited to verify clean decoupling:

1. **Dependency Injection**:
   - `scheduleTask`: Passed explicitly into `scheduleStartupHydrationTasks({ scheduleTask })`. If omitted, falls back gracefully to `typeof scheduleIdleTask === 'function' ? scheduleIdleTask : window.scheduleIdleTask`.
   - `getStartupPhase`: Passed explicitly as `() => STARTUP_PHASE`. The runners call `options.getStartupPhase()` to check for critical-phase leaks (`[startup guard] ran during critical phase`).
2. **No Direct Private Variable Coupling**:
   - `startup-hydration.js` does **not** assume `STARTUP_PHASE` or `scheduleIdleTask` exist in its lexical environment; it accesses them strictly through the injected options object.

---

## 5. Widget Dependency Audit

All sub-widget functions and elements accessed by the 9 safe runners were audited for availability:

### 5.1 Weather Widget
- `loadCachedWeather`: Declared in [`src/newtab/widgets/weather.js:312`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L312) (Script #62). Available globally.
- `setupWeather`: Declared in [`src/newtab/widgets/weather.js:673`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L673) (Script #62). Available globally.
- `weatherWidget`: Declared in [`src/newtab/widgets/weather.js:8`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L8). Resolved globally with defensive fallback `document.querySelector('.widget-weather')`.

### 5.2 Quote Widget
- `ensureQuoteIndexBuilt`: Declared in [`src/newtab/widgets/quote.js:251`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L251) (Script #61). Available globally.
- `readCachedQuoteState`: Declared in [`src/newtab/widgets/quote.js:56`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L56) (Script #61). Available globally.
- `shouldLoadQuoteCatalog`: Declared in [`src/newtab/widgets/quote.js:156`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L156) (Script #61). Available globally.
- `setupQuoteWidget`: Declared in [`src/newtab/widgets/quote.js:777`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L777) (Script #61). Available globally.
- `fetchQuote`: Declared in [`src/newtab/widgets/quote.js:347`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L347) (Script #61). Available globally.
- `renderCachedQuoteState`: Declared in [`src/newtab/widgets/quote.js:148`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L148) (Script #61). Available globally.
- `quoteWidget`, `quoteText`, `quoteAuthor`: Declared in [`src/newtab/widgets/quote.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js) (lines 7, 23, 24). Resolved globally with defensive ID fallbacks.

### 5.3 News Widget
- `setupNewsWidget`: Declared in [`src/newtab/widgets/news.js:692`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L692) (Script #63). Available globally.
- `newsWidget`: Declared in [`src/newtab/widgets/news.js:5`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L5). Resolved globally with fallback `document.querySelector('.widget-news')`.

### 5.4 Todo Widget
- `setupTodoWidget`: Declared in [`src/newtab/widgets/todo.js:258`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L258) (Script #55). Available globally.
- `todoWidget`: Declared in [`src/newtab/widgets/todo.js:8`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L8). Resolved globally with fallback `document.querySelector('.widget-todo')`.

### 5.5 Search Widget
- `setupSearch`: Declared in [`src/newtab/search/search-ui-controller.js:882`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js#L882) (Script #45). Available on `window.setupSearch` and `HomebaseSearchUIController.setupSearch`.
- `searchForm`, `searchInput`, `searchSelect`, `searchResultsPanel`, `searchWidget`: Resolved defensively via `document.getElementById` and `document.querySelector` to eliminate script-order hazards.

### 5.6 App Launcher
- `setupAppLauncher`: Declared in [`src/newtab/integrations/app-launcher.js:119`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/app-launcher.js#L119) (Script #59). Available globally.
- `googleAppsBtn`, `googleAppsPanel`: Resolved defensively via `document.getElementById`.

---

## 6. Script Ordering Verification

In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), script execution follows strict document order:

```text
1. Script #45: newtab/search/search-ui-controller.js
2. Script #55: newtab/widgets/todo.js
3. Script #59: newtab/integrations/app-launcher.js
4. Script #61: newtab/widgets/quote.js
5. Script #62: newtab/widgets/weather.js
6. Script #63: newtab/widgets/news.js
        ↓
7. Script #64: newtab/core/startup-hydration.js (lines 3409–3410)
        ↓
8. Script #65: new-tab.js (lines 3412–3413)
```

**Verification Results:**
- All widget dependencies (Scripts #45 through #63) load and evaluate **before** `startup-hydration.js` (Script #64).
- `startup-hydration.js` evaluates **before** `new-tab.js` (Script #65), ensuring `window.HomebaseStartupHydration` exists when `initializePage()` runs.

---

## 7. Static & Runtime Verification Results

```powershell
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
```

| Verification Check | Tool / Command | Result | Recorded Metrics |
|---|---|:---:|---|
| **Deferred Script Count** | `check-newtab-static.mjs` | **PASS** | **64 deferred scripts** verified |
| **Top-Level Declarations** | `check-newtab-static.mjs` | **PASS** | **875 unique declarations** |
| **Declaration Collisions** | `check-newtab-static.mjs` | **PASS** | **0 collisions** |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | **367 / 367 tests passed** (0 failures, 0 skipped) |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | Required DOM surfaces exist, core controllers available, 0 severe errors |
| **Dual Build Engine** | `npm.cmd run build` | **PASS** | Chrome and Firefox distributions built cleanly |

---

## 8. Size Verification & Deconstruction Progress

```powershell
pwsh -Command "(Get-Content src/new-tab.js).Count"
```

- **Before Phase 4**: 853 lines
- **After Phase 4**: **642 lines** (or 641 lines non-empty)
- **Net Reduction**: **-211 lines** (**-24.7%** in Phase 4)

### Cumulative Cycle #13 Progress
```text
Baseline (Start of Cycle #13): 1,148 lines
After Phase 2 (Bridges & Mirrors): 925 lines  (-223 lines)
After Phase 3 (Wallpaper Priming): 853 lines  (-72 lines)
After Phase 4 (Startup Hydration): 642 lines  (-211 lines)  🎉 Sub-650 Milestone!
```

$$\textbf{Cumulative Cycle #13 Reduction: } \mathbf{-506 \text{ lines}} \quad (1,148 \longrightarrow \mathbf{642 \text{ lines}}, \mathbf{-44.1\%})$$

---

## 9. Risk Assessment

| Risk Dimension | Evaluation | Finding |
|---|:---:|---|
| **Regressions** | Evaluated | **Zero regressions**. 367/367 tests passed; headless browser smoke test passed cleanly. |
| **Duplicate Ownership** | Evaluated | **Zero duplicate ownership**. `new-tab.js` contains 0 runner functions or label allowlists. |
| **Declaration Collisions** | Evaluated | **Zero collisions**. All new code encapsulated in an IIFE; 875 declarations across 64 scripts checked. |
| **Race Conditions** | Evaluated | **Zero race conditions**. Script ordering is deterministic; hydration triggers on idle after ready flip. |
| **DOM Null Dereferences** | Evaluated | **Zero hazards**. Defensive query fallbacks guarantee safety even if container elements are absent. |

---

## 10. Final State & Governance Constraints

- **Final `src/new-tab.js` State**: **642 lines**, focused purely on startup orchestration and coordinator bindings.
- **Constraints Maintained**:
  - Zero source code changes made during this audit.
  - No implementation commits made.
  - Phase 5 has **not** been started.
  - Awaiting review and approval before proceeding to Cycle #13 Phase 5 planning (Idle Task Scheduler Subsystem Extraction).
