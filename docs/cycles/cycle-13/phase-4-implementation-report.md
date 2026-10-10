# Homebase Cycle #13 — Phase 4 Implementation Report: Startup Hydration Task Registry Extraction

**Document:** `docs/cycles/cycle-13/phase-4-implementation-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETED & VERIFIED  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 853 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Final Line Count:** **642 lines** (**-211 lines** net reduction from `src/new-tab.js`)  
**Extracted Module:** [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)  
**Canonical Namespace:** `window.HomebaseStartupHydration`  

---

## 1. Executive Summary

In **Cycle #13 Phase 4**, the startup hydration task registry and runners were extracted atomically from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into a dedicated core infrastructure module: [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js).

This refactoring strictly satisfies the architectural principle established in `docs/cycles/cycle-13/phase-4-plan.md`:
> **Primary goal is ownership separation: `new-tab.js` becomes startup orchestration only. Line reduction is a secondary measurement.**

All non-critical dashboard widget startup idle tasks (`Weather`, `Quote`, `News`, `Todo`, `Search`, `App Launcher`) are now canonically owned, instrumented, and error-contained within `HomebaseStartupHydration`. The top-level orchestrator in `new-tab.js` coordinates execution through dependency-injected delegation without maintaining widget-specific implementation closures or label allowlists.

---

## 2. Ownership Changes & Responsibilities

### 2.1 Transferred to `HomebaseStartupHydration`
- **Allowlist Enforcement**: Owns `STARTUP_IDLE_LABELS` (10 permitted task labels) and enforces the `startup:` label prefix requirement.
- **Safe Task Runners**: Owns the 9 error-contained, instrumented idle runners:
  1. `loadCachedWeatherSafe` (cached weather hydration)
  2. `buildQuoteIndexSafe` (quote catalog indexing with skipping logic)
  3. `setupQuoteWidgetSafe` (quote DOM setup)
  4. `setupNewsWidgetSafe` (news DOM setup)
  5. `setupTodoWidgetSafe` (todo async storage setup)
  6. `setupSearchSafe` (search engines & suggestion controller setup)
  7. `setupWeatherSafe` (live weather setup)
  8. `setupAppLauncherSafe` (Google apps grid & click delegation)
  9. `fetchQuoteSafe` (live quote fetching or cached state render)
- **Cooperative Task Scheduler**: Owns `scheduleStartupHydrationTasks(options)`, queueing tasks into the idle budget with individual try/catch error traps and performance markers.

### 2.2 Retained in `src/new-tab.js`
- **Startup Orchestration**: Retains `initializePage()` high-level boot sequence and `markPageReadyOnce()` ready-class toggling.
- **Phase State Tracking**: Retains `STARTUP_PHASE` (`'critical'` $\to$ `'ready'`).
- **Cooperative Dispatch**: Triggers hydration via `runWhenIdle`:
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
- **Idle Engine**: Retains `scheduleIdleTask` and `processIdleTasks` runtime (scheduled for extraction in Phase 5).

---

## 3. Files Changed

| File | Change Type | Lines | Description |
|---|:---:|:---:|---|
| [`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js) | **New File** | +249 lines | Dedicated IIFE-encapsulated module owning `STARTUP_IDLE_LABELS`, the 9 safe runners, defensive DOM resolution, and `scheduleStartupHydrationTasks`. Exports `window.HomebaseStartupHydration`. |
| [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | Modified | +3 lines | Registered `<script src="newtab/core/startup-hydration.js" defer></script>` as Script #64 immediately preceding `new-tab.js` (Script #65). |
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | Modified | -211 lines net | Removed `STARTUP_IDLE_LABELS`, 9 inline runner closures, and old `scheduleStartupHydrationTasks` definition. Delegated scheduling to `HomebaseStartupHydration`. |

---

## 4. Dependency Handling & DOM Safety

### 4.1 Dependency Injection
To prevent hidden couplings to `new-tab.js` runtime internals, `scheduleStartupHydrationTasks` accepts an options object:
- `scheduleTask`: Defaults to `options.scheduleTask` (provided as `scheduleIdleTask` by `new-tab.js`), with fallback to `window.scheduleIdleTask`.
- `getStartupPhase`: Provided by `new-tab.js` as `() => STARTUP_PHASE`, enabling `setupSearchSafe`, `setupWeatherSafe`, and `fetchQuoteSafe` to detect critical-phase leaks without reading private variables.

### 4.2 DOM Safety & Defensive Resolution
To prevent evaluation-order race conditions with DOM elements declared in `new-tab.js`, the extracted module avoids direct naked references and resolves elements defensively:
```javascript
const sForm = (typeof searchForm !== 'undefined' && searchForm) || document.getElementById('search-form');
const sInput = (typeof searchInput !== 'undefined' && searchInput) || document.getElementById('search-input');
const sSelect = (typeof searchSelect !== 'undefined' && searchSelect) || document.getElementById('search-select');
const sPanel = (typeof searchResultsPanel !== 'undefined' && searchResultsPanel) || document.getElementById('search-results-panel');
const sWidget = (typeof searchWidget !== 'undefined' && searchWidget) || document.querySelector('.widget-search');
const appsBtn = (typeof googleAppsBtn !== 'undefined' && googleAppsBtn) || document.getElementById('google-apps-btn');
const appsPanel = (typeof googleAppsPanel !== 'undefined' && googleAppsPanel) || document.getElementById('google-apps-panel');
```
This guarantees zero `ReferenceError` hazards regardless of script parsing or execution dynamics.

### 4.3 Static Invariant Compliance
- The entire module is wrapped in `(function () { 'use strict'; ... })();`.
- **Zero depth-0 lexical declarations** (`const`, `let`, `class`) are introduced in the global declarative environment.
- Only the canonical namespace `window.HomebaseStartupHydration` is exposed.

---

## 5. Verification Results

The extraction passed the mandatory 5-stage verification toolchain with 100% success:

| Verification Suite | Tool / Command | Result | Details |
|---|---|:---:|---|
| **Syntax Validation** | `node --check src/newtab/core/startup-hydration.js`<br/>`node --check src/new-tab.js` | **PASS** | 0 syntax errors across all new and modified JavaScript files. |
| **Static Invariant Scanner** | `node scripts/check-newtab-static.mjs` | **PASS** | 64 deferred scripts verified; 875 declarations; **0 collisions**. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | **367 / 367 tests passed** (0 failures, 0 skipped). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | Page loaded cleanly; required DOM surfaces exist; core controllers active; 0 severe runtime errors. |
| **Dual Build Engine** | `npm.cmd run build` | **PASS** | Built `dist/chrome/` and `dist/firefox/` distributions cleanly. |
| **Protected Files Diff** | `git diff src/preload.js src/instant_load.js manifests/ dist/` | **PASS** | Completely empty diff; protected files 100% untouched. |

---

## 6. Quantitative Results & Monolith Deconstruction Progress

```text
Baseline (Start of Cycle #13): 1,148 lines
After Phase 2 (Bridges & Mirrors): 925 lines  (-223 lines)
After Phase 3 (Wallpaper Priming): 853 lines  (-72 lines)
After Phase 4 (Startup Hydration): 642 lines  (-211 lines)  🎉 Sub-650 Milestone!
```

$$\textbf{Total Cycle #13 Reduction: } \mathbf{-506 \text{ lines}} \quad (1,148 \longrightarrow \mathbf{642 \text{ lines}}, \mathbf{-44.1\%})$$

`src/new-tab.js` is now down to **642 lines**, on track for Phase 5 (Idle Task Scheduler Extraction, ~295 lines) to bring it below the sub-400 line architectural ceiling.

---

## 7. Risks & Discoveries

- **Zero Regressions Discovered**: All 367 unit tests and the full browser smoke test passed on the first run.
- **Zero Declaration Collisions**: Acorn static parser confirmed 875 unique top-level declarations with zero collisions across all 64 deferred scripts.
- **Decoupled Architecture**: Removing the 9 runners from `new-tab.js` makes `initializePage()` significantly cleaner and focused purely on boot coordination.
