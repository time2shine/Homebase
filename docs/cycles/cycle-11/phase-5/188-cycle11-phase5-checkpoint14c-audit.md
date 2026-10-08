# Homebase Cycle #11 Phase 5 — Checkpoint 14-C Architecture Audit
## Startup Performance Listeners and Runtime Markers

**Date:** October 5, 2026  
**Auditor:** Antigravity  
**Target File:** `src/new-tab.js`  
**Reference Runtime:** `src/newtab/core/startup-perf-runtime.js` (and `src/newtab/core/perf-report.js`)  
**Scope:** Architecture Audit ONLY. Zero source file modifications, zero commits, zero pushes.

---

## 1. Executive Summary

This architecture audit analyzes the startup performance listeners, runtime markers, W3C Performance API calls, and startup timing helpers inside `src/new-tab.js`, comparing their ownership, responsibilities, and coupling with `src/newtab/core/startup-perf-runtime.js`.

### Key Audit Findings:
1. **No `HomebaseStartupPerf` Global Exists:**
   - There are **0** references to `HomebaseStartupPerf` in `src/new-tab.js` or across the entire codebase. The performance runtime uses direct global helper functions (`recordStartupPerfEvent`, `hbPerfMark`, `hbPerfMeasure`, `hbPerfTime`, `hbPerfReport`, `window.hbPrintStartupPerf`) rather than a namespaced object.
2. **`DOMContentLoaded` Listener is Coupled with UI Component Initialization:**
   - The `DOMContentLoaded` listener in `src/new-tab.js` (L1866–1875) performs both performance telemetry (`hbPerfMark('dom-content-loaded')`) AND essential page UI initialization (`renderTipOfDay()`, `initAddonStoreDockLink()`). Extracting this listener to `startup-perf-runtime.js` would violate architectural separation by introducing UI dependencies into a core measurement module.
3. **`window load` Listener is Negligible:**
   - The `window` load listener (L1877–1882) is an isolated 6-line debug listener active only when `DEBUG_STARTUP_PERF` is true. Extracting it alone provides negligible reduction and churns script boundaries without architectural improvement.
4. **Duplicate Measurement Implementation in `markPageReadyOnce()`:**
   - An architectural duplication exists between `markPageReadyOnce()` (L1441–1457) in `new-tab.js` and `recordStartupReadyMeasures()` (L120–145) in `startup-perf-runtime.js`. When `DEBUG_STARTUP_PERF` is false, `startup-perf-runtime.js` executes `recordStartupReadyMeasures()`; when true, `new-tab.js` executes an identical measurement and reporting sequence inline.
5. **Startup Instrumentation Belongs in Startup Orchestration:**
   - The markers and measures in `initializePage()` (L1311–1355) and safe hydration wrappers (L1460–1636) are call-site instrumentation points, not runtime implementation. `AGENTS.md` explicitly designates `initializePage()`, startup orchestration, and the idle scheduler as **Current High-Risk Areas** that must not be refactored or destabilized.
6. **Verdict:** **KEEP / DEFER**.
   - Do **NOT** extract startup performance listeners or markers at this time.
   - Retain lifecycle listeners in `src/new-tab.js`.
   - Preserve `initializePage()` startup orchestration untouched.

---

## 2. Complete Inventory of Target Elements in `src/new-tab.js`

### 2.1 `DOMContentLoaded` Listener
- **Location:** `src/new-tab.js`, lines 1866–1875 (10 lines)
- **Code:**
  ```javascript
  document.addEventListener('DOMContentLoaded', () => {
    hbPerfMark('dom-content-loaded');
    hbPerfMeasure(
      'script-to-dom-content-loaded',
      'script-start',
      'dom-content-loaded'
    );
    renderTipOfDay();
    initAddonStoreDockLink();
  });
  ```
- **Responsibilities:**
  1. Performance marking & measurement: `hbPerfMark('dom-content-loaded')`, `hbPerfMeasure('script-to-dom-content-loaded', 'script-start', 'dom-content-loaded')`.
  2. UI Initialization: `renderTipOfDay()` (from `src/newtab/tips/homebase-tips-ui.js`), `initAddonStoreDockLink()` (from `src/newtab/core/dock-navigation.js`).
- **Owner Assessment:** `src/new-tab.js` acts as the root page orchestrator coordinating UI features on DOM ready.

### 2.2 `window` Load Listener
- **Location:** `src/new-tab.js`, lines 1877–1882 (6 lines)
- **Code:**
  ```javascript
  if (DEBUG_STARTUP_PERF) {
    window.addEventListener('load', () => {
      hbPerfMark('window-load');
      hbPerfMeasure('script-to-window-load', 'script-start', 'window-load');
    });
  }
  ```
- **Responsibilities:**
  - Debug-only listener recording `window-load` mark and `script-to-window-load` measure when `DEBUG_STARTUP_PERF` is true.

### 2.3 W3C `performance.mark()` Calls
- **Locations in `src/new-tab.js`:**
  - Line 1315: `performance.mark('init:start');` (inside `initializePage()`)
  - Line 1333: `performance.mark('init:parallel-start');` (inside `initializePage()`)
  - Line 1342: `performance.mark('init:parallel-done');` (inside `initializePage()`)
- **Analysis:**
  - These are raw W3C Performance API markers called directly alongside Homebase's custom `hbPerfMark` equivalents:
    - L1312: `hbPerfMark('init-start')` + L1315: `performance.mark('init:start')`
    - L1334: `hbPerfMark('parallel-start')` + L1333: `performance.mark('init:parallel-start')`
    - L1336: `hbPerfMark('parallel-done')` + L1342: `performance.mark('init:parallel-done')`
  - They represent legacy raw markers that duplicate the Homebase measurement pipeline.

### 2.4 W3C `performance.measure()` Calls
- **Locations in `src/new-tab.js`:**
  - Line 1343: `performance.measure('init:parallel', 'init:parallel-start', 'init:parallel-done');`
- **Analysis:**
  - Duplicates Homebase's `hbPerfMeasure('parallel-storage-loads', 'parallel-start', 'parallel-done')` (L1337–1341).

### 2.5 Homebase Performance Markers & Measures
- **`hbPerfMark(name)` calls:**
  - Line 44: `hbPerfMark('script-start');` (file top-level)
  - Line 1311: `hbPerfMark('newtab:init-start');`
  - Line 1312: `hbPerfMark('init-start');`
  - Line 1334: `hbPerfMark('parallel-start');`
  - Line 1336: `hbPerfMark('parallel-done');`
  - Line 1414: `hbPerfMark('bookmarks-done');`
  - Line 1442: `hbPerfMark('ready-class');` (inside `markPageReadyOnce()`)
  - Line 1448: `hbPerfMark('after-ready-paint');` (inside `markPageReadyOnce()` rAF)
  - Line 1867: `hbPerfMark('dom-content-loaded');`
  - Line 1879: `hbPerfMark('window-load');`
- **`hbPerfMeasure(name, start, end)` calls:**
  - Line 1337: `hbPerfMeasure('parallel-storage-loads', 'parallel-start', 'parallel-done');`
  - Line 1443: `hbPerfMeasure('script-to-ready-class', 'script-start', 'ready-class');`
  - Line 1444: `hbPerfMeasure('init-to-ready-class', 'init-start', 'ready-class');`
  - Line 1449: `hbPerfMeasure('script-to-after-ready-paint', 'script-start', 'after-ready-paint');`
  - Line 1868: `hbPerfMeasure('script-to-dom-content-loaded', 'script-start', 'dom-content-loaded');`
  - Line 1880: `hbPerfMeasure('script-to-window-load', 'script-start', 'window-load');`
- **`hbPerfTime(label, start)` calls:**
  - Line 1355: `hbPerfTime('loadFolderMetadata', folderMetaStart);`
  - Line 1413: `hbPerfTime('loadBookmarks total', bookmarksStart);`
- **`recordStartupPerfEvent` / `recordStartupPerfEventOnce` calls:**
  - Line 1329: `recordStartupPerfEvent('newtab:wallpaper-type-loaded', { type });`
  - Line 1388: `recordStartupPerfEventOnce('newtab:gallery-warmup-skipped-performance-mode');`
  - Line 1440: `recordStartupPerfEvent('newtab:init-ready');`
  - Line 1898: `recordStartupPerfEventOnce('newtab:dynamic-accent-skipped-performance-mode');`
- **`hbPerfReport()` calls:**
  - Line 1454: `hbPerfReport();` (inside `markPageReadyOnce()`)

### 2.6 `HomebaseStartupPerf` References
- **Occurrences in `src/new-tab.js`:** **0**
- **Occurrences across entire repository:** **0** (except reference in prior audit document `docs/180-cycle11-phase5-checkpoint14-audit.md`)
- **Confirmation:** No object named `HomebaseStartupPerf` exists. The runtime relies on individual global functions exported by `src/newtab/core/startup-perf-runtime.js`.

### 2.7 Startup Timing Helpers in `src/new-tab.js`
- **`logInitSettled(name, result)` (L1295–1297):**
  - Logs warnings for rejected promises in parallel startup loading.
- **`markPageReadyOnce()` (L1422–1458):**
  - Switches `document.body` classes from `preload` to `ready`.
  - Dispatches `newtab:init-ready` startup perf event.
  - Measures `script-to-ready-class`, `init-to-ready-class`, and double-frame `script-to-after-ready-paint`.
  - Calls `hbPerfReport()`.
- **Safe Hydration Wrappers (L1460–1636):**
  - 9 safe wrappers: `loadCachedWeatherSafe`, `buildQuoteIndexSafe`, `setupQuoteWidgetSafe`, `setupNewsWidgetSafe`, `setupTodoWidgetSafe`, `setupSearchSafe`, `setupWeatherSafe`, `setupAppLauncherSafe`, `fetchQuoteSafe`.
  - Each instruments task duration using `performance.now()`, `recordIdleTaskPerf()`, and `recordWidgetPerfTiming()`.
- **`scheduleStartupHydrationTasks()` (L1638–1664):**
  - Schedules tasks on idle queue via `scheduleIdleTask` with `STARTUP_IDLE_LABELS` verification.

---

## 3. Comparative Architecture Analysis

| Concern / Component | `src/new-tab.js` Status | `src/newtab/core/startup-perf-runtime.js` Status | Ownership Classification |
|---|---|---|---|
| **Event Storage & Array** | Consumer | **Canonical Owner** (`getStartupPerfStore`, `window.__HB_STARTUP_PERF`) | Correctly owned by `startup-perf-runtime.js` |
| **Debug Flag Detection** | Consumer (`DEBUG_STARTUP_PERF`, `DEBUG_IDLE_STARTUP`, `DEBUG_STARTUP_GUARDS`) | **Canonical Owner** (`HB_PERF_DEBUG_KEY`, `HB_STARTUP_PERF_DEBUG_KEY`) | Correctly owned by `startup-perf-runtime.js` |
| **Mark & Measure Engine** | Consumer (`hbPerfMark`, `hbPerfMeasure`, `hbPerfTime`) | **Canonical Owner** (`hbPerfMark`, `hbPerfMeasure`, `hbPerfTime`, `hbPerfReport`) | Correctly owned by `startup-perf-runtime.js` |
| **Report Generation** | Consumer (`hbPerfReport`) | **Canonical Owner** (`printStartupPerfReport`, `window.hbPrintStartupPerf`) | Correctly owned by `startup-perf-runtime.js` |
| **Ready Measures Logic** | Inline in `markPageReadyOnce()` (L1441–1457) | Defined in `recordStartupReadyMeasures()` (L120–145) | **DUPLICATED** across both files |
| **`DOMContentLoaded` Listener** | Attached at L1866–1875 | Not attached | Owned by `new-tab.js` (Orchestrates UI & Perf) |
| **`window load` Listener** | Attached at L1877–1882 | Not attached | Owned by `new-tab.js` (Debug listener) |
| **`initializePage()` Markers** | Instrumentation call-sites (L1311–1343) | Not present (module cannot know `initializePage` state) | Inherent to `initializePage()` orchestration |
| **Widget/Idle Timing Calls** | Instrumentation call-sites (L1460–1636) | Engine in `perf-report.js` (`recordIdleTaskPerf`, `recordWidgetPerfTiming`) | Correct separation of engine vs call-sites |

---

## 4. Addressing Core Audit Questions (A – E)

### Question A: Does `startup-perf-runtime.js` already own this responsibility?
- **For performance tracking, storage, and calculation:** **YES**.
  - `startup-perf-runtime.js` is the sole engine for storing events, calculating timeline offsets, providing timeline rows for the perf overlay, and printing console reports.
- **For browser lifecycle event listeners (`DOMContentLoaded`, `load`):** **NO**.
  - `startup-perf-runtime.js` does not attach DOMContentLoaded or load listeners.
- **For startup instrumentation:** **NO**.
  - Instrumentation points must exist where the work happens. They are consumers of the perf engine.

### Question B: Are there duplicate implementations?
- **YES, two areas of duplication exist:**
  1. **Ready-class measurement sequence:**
     - `startup-perf-runtime.js:120–145` implements `recordStartupReadyMeasures()`, which marks `hb:ready-class`, measures `script-to-ready-class` and `init-to-ready-class`, schedules double-rAF for `after-ready-paint`, and calls `hbPerfReport()`.
     - `new-tab.js:1441–1457` in `markPageReadyOnce()` duplicates this exact sequence when `DEBUG_STARTUP_PERF` is true.
     - In `startup-perf-runtime.js:105–107`, `recordStartupReadyMeasures()` is called when `!DEBUG_STARTUP_PERF && entryName === 'newtab:init-ready'`. This indicates an earlier incomplete refactor that left the debug branch duplicated in `new-tab.js`.
  2. **Raw W3C marks alongside Homebase marks:**
     - `performance.mark('init:start')` vs `hbPerfMark('init-start')`
     - `performance.mark('init:parallel-start')` vs `hbPerfMark('parallel-start')`
     - `performance.mark('init:parallel-done')` vs `hbPerfMark('parallel-done')`
     - `performance.measure('init:parallel', ...)` vs `hbPerfMeasure('parallel-storage-loads', ...)`

### Question C: Are references in `new-tab.js` only orchestration calls, or actual implementation?
- **The majority are pure orchestration / instrumentation calls:**
  - `hbPerfMark('script-start')`, `hbPerfMark('init-start')`, `hbPerfTime(...)`, and `recordStartupPerfEvent(...)` simply record timestamps into the external runtime.
  - Safe wrappers (`loadCachedWeatherSafe`, etc.) measure the execution time of their wrapped functions and pass metrics to `perf-report.js`.
- **The exception is lines 1441–1457 in `markPageReadyOnce()`:**
  - This block contains explicit measurement implementation (double `requestAnimationFrame`, mark/measure calculations, calling `hbPerfReport()`).

### Question D: Can the code safely move without changing `initializePage()` behavior?
- **NO.**
  - `initializePage()` is Homebase's most sensitive critical path. `AGENTS.md` explicitly lists `initializePage` and startup orchestration under **Current High-Risk Areas** with the directive:
    > "Leave initializePage in src/new-tab.js unless explicitly requested."
    > "Leave startup orchestration in src/new-tab.js unless explicitly requested."
  - Moving the performance markers out of `initializePage()` would require wrapping or decomposing `initializePage()`, which introduces high regression risk for zero behavioral benefit.
  - Furthermore, moving the `DOMContentLoaded` listener is unsafe because it executes UI setup (`renderTipOfDay()`, `initAddonStoreDockLink()`). Splitting the listener across files would increase lifecycle fragmentation.

### Question E: Would extraction improve architecture, or only move code?
- **It would only move code (or degrade architectural boundaries):**
  - Moving the 6-line `window load` listener to `startup-perf-runtime.js` is a trivial code shift with no structural improvement.
  - Moving `DOMContentLoaded` would either pollute `startup-perf-runtime.js` with UI calls (`renderTipOfDay`, `initAddonStoreDockLink`) or require two separate `DOMContentLoaded` handlers across scripts, worsening traceability.
  - Removing instrumentation calls from `initializePage()` would decouple performance telemetry from the actual code execution it monitors.

---

## 5. Dependency Analysis & Script Load Order

In `src/new-tab.html`:
```html
<!-- Core runtime (Early) -->
<script src="newtab/core/perf-report.js" defer></script>             <!-- Line 3323 -->
<script src="newtab/core/startup-perf-runtime.js" defer></script>   <!-- Line 3324 -->
...
<!-- Main new-tab runtime (Last) -->
<script src="new-tab.js" defer></script>                            <!-- Line 3408 -->
```

1. **Execution Order of Deferred Scripts:**
   - Both scripts have the `defer` attribute.
   - Per HTML specifications, deferred scripts execute sequentially in document order after the document parser finishes, but before `DOMContentLoaded`.
   - Therefore, `perf-report.js` and `startup-perf-runtime.js` are guaranteed to evaluate before `new-tab.js`.
2. **Global Availability:**
   - When `new-tab.js` executes its top-level code (`hbPerfMark('script-start')` at L44), `hbPerfMark` is already defined on the global scope by `startup-perf-runtime.js`.
3. **Cross-Subsystem Dependencies:**
   - `renderTipOfDay` is defined in `src/newtab/tips/homebase-tips-ui.js` (L3320).
   - `initAddonStoreDockLink` is defined in `src/newtab/core/dock-navigation.js` (L3347).
   - `startup-perf-runtime.js` (L3324) loads *before* `dock-navigation.js`. If `DOMContentLoaded` were moved into `startup-perf-runtime.js`, it would depend on symbols defined later in document order. While deferred event listener callbacks run after all scripts finish, creating this cross-layer dependency between early telemetry and dock navigation is bad architecture.

---

## 6. Risk Assessment & Estimated Line Reductions

| Candidate Item | Location in `new-tab.js` | Lines | Risk Level | Architectural Justification |
|---|---|---|---|---|
| `DOMContentLoaded` Listener | L1866–1875 | 10 lines | **MEDIUM** | Bound to UI rendering (`renderTipOfDay`, `initAddonStoreDockLink`). Splitting creates multi-handler fragmentation. |
| `window load` Listener | L1877–1882 | 6 lines | **LOW** | Negligible reduction. Moving 6 lines is churn without architectural gain. |
| Raw W3C Marks/Measures | L1315, 1333, 1342, 1343 | 4 lines | **LOW** | Minor redundancy, but located inside protected `initializePage()`. |
| Ready-class duplicated logic | L1441–1457 | 17 lines | **HIGH** | Located inside `markPageReadyOnce()` inside `initializePage()`. Touches page ready flip and frame timing. |
| Call-site instrumentation | L1311–1355, 1460–1636 | ~60 lines | **HIGH** | Inherent to startup orchestration and idle scheduler (explicitly protected in `AGENTS.md`). |

- **Total Potential Line Reduction (if all moved/cleaned):** ~20–35 lines.
- **Risk Assessment:** **HIGH** overall due to intersection with `initializePage()` and page startup sequence.

---

## 7. Recommendation: KEEP / DEFER

### Recommendation:
**KEEP** the performance listeners and markers in `src/new-tab.js` and **DEFER** any changes to this area.

### Justification:
1. **Compliance with `AGENTS.md`:**
   - `AGENTS.md` explicitly lists `initializePage`, startup orchestration, and the idle scheduler under **Current High-Risk Areas** with clear instructions:
     > "Leave initializePage in src/new-tab.js unless explicitly requested."  
     > "Leave startup orchestration in src/new-tab.js unless explicitly requested."
2. **Minimal Line Savings vs High Stability Risk:**
   - Extracting the event listeners at the bottom of `new-tab.js` saves at most 16 lines while risking UI initialization ordering and lifecycle coherence.
3. **Better Candidates Available for Checkpoint 14:**
   - Other areas in `src/new-tab.js` identified in the Checkpoint 14 audit provide substantially greater architectural value with clear component boundaries:
     - **Checkpoint 14-D (`storage.onChanged` Dispatcher):** ~68 lines (L1835–1902) — cleanly delegatable to subsystem storage change handlers or a storage coordinator.
     - **Checkpoint 14-E (Bookmark Grid Click Delegation):** ~94 lines (L1741–1834) — cleanly belongs in `bookmark-action-controller.js`.

---

## 8. Next Steps

1. **Do not modify `src/new-tab.js` for Checkpoint 14-C.**
2. **Recommend proceeding to Checkpoint 14-D (`storage.onChanged` Dispatcher Audit & Extraction)** or **Checkpoint 14-E (Bookmark Grid Click Delegation)** upon user review.
3. **Repository Status:**
   - Working tree clean.
   - Zero source modifications made.
   - Ready for user review.
