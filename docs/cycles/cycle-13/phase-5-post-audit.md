# Homebase Cycle #13 — Phase 5 Post-Extraction Audit

**Document:** `docs/cycles/cycle-13/phase-5-post-audit.md`  
**Date:** October 11, 2026  
**Status:** COMPLETE — PHASE 5 FULLY VERIFIED  
**Phase Target:** Cycle #13 Phase 5 (Idle Task Scheduler Subsystem Extraction Post-Audit)  
**Evaluated Modules:**  
- [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js)  
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
- [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)  
- [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs)  

---

## 1. Audit Summary

The post-extraction audit for **Cycle #13 Phase 5** is complete and validated. Ownership of the cooperative Idle Task Scheduler subsystem (`runWhenIdle`, `IDLE_TASK_BUDGET_MS`, `idleTaskQueue`, `idleTaskLabels`, `idleTaskScheduled`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, and diagnostic accessors) has successfully relocated from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js).

All 6 core dimensions of the audit confirmed complete architectural success:
1. **Ownership Separation**: Zero scheduler implementation logic, zero queue arrays, zero label maps, and zero budget constants remain in `src/new-tab.js`. Single canonical ownership resides in `HomebaseIdleScheduler`.
2. **Compatibility & Delegation**: Compatibility bindings (`window.runWhenIdle`, `window.scheduleIdleTask`, `window.scheduleIdleChunkedTask`) ensure seamless resolution across all callers.
3. **Script Execution Order**: Strict sequence in `src/new-tab.html`: `startup-perf-runtime.js` $\longrightarrow$ `idle-scheduler.js` (Script #9) $\longrightarrow$ downstream controllers/widgets $\longrightarrow$ `startup-hydration.js` $\longrightarrow$ `new-tab.js`.
4. **Behavioral Invariance**: 12ms budget, FIFO queue drainage, label deduplication, promise chaining, chunked worker yield limits, and error handling remain byte-for-byte identical.
5. **Static Invariants**: Acorn depth-0 scanner verified 65 deferred scripts and 867 unique declarations with **0 collisions**.
6. **Runtime & Build Stability**: 100% passing across 367 unit tests, headless browser smoke test, and dual Chrome/Firefox distribution builds.
7. **Milestone Achievement**: `src/new-tab.js` reduced from **1,148 lines (baseline) to 356 lines**, beating the `< 400 lines` milestone by 44 lines.

---

## 2. Ownership Verification

A repository-wide symbol audit using `git grep` verified that all scheduler implementation logic exists exclusively within the new canonical module:

| Symbol Searched | Occurrences in `idle-scheduler.js` | Occurrences in `new-tab.js` | Status |
|---|:---:|:---:|---|
| `runWhenIdle` | Line 4 (def), 56, 84, 112 (loop), 176 (export), 184 (bind) | Line 240 (caller only) | **Single Canonical Owner** |
| `scheduleIdleTask` | Line 89 (def), 169 (chunked call), 177 (export), 185 (bind) | Lines 159, 175, 237, 243, 353 (callers only) | **Single Canonical Owner** |
| `scheduleIdleChunkedTask` | Line 116 (def), 178 (export), 186 (bind) | **0** | **Single Canonical Owner** |
| `processIdleTasks` | Line 17 (def), 56, 84, 112 (loop), 179 (export) | **0** | **Single Canonical Owner** |
| `idleTaskQueue` | Line 13 (def), 22, 30, 53, 75, 82, 105, 107, 172 | **0** | **Single Canonical Owner** |
| `idleTaskLabels` | Line 14 (def), 61, 77, 93, 104, 134, 152 | **0** | **Single Canonical Owner** |
| `idleTaskScheduled` | Line 15 (def), 18, 54, 55, 82, 83, 110, 111, 173 | **0** | **Single Canonical Owner** |
| `IDLE_TASK_BUDGET_MS` | Line 12 (def: `12`), 26, 129 | **0** | **Single Canonical Owner** |
| `HomebaseIdleScheduler` | Line 175 (canonical export on `window`) | **0** | **Single Canonical Owner** |

**Confirmation:**
- Zero scheduler engine functions or queue variables remain in `new-tab.js`.
- No duplicate queue state exists anywhere in the repository.
- No duplicate declarations or multiple scheduler instances exist.

---

## 3. Dependency & Compatibility Verification

### 3.1 Global Window Bindings
The following canonical exports and compatibility aliases are exported by `src/newtab/core/idle-scheduler.js`:
- `window.HomebaseIdleScheduler = { runWhenIdle, scheduleIdleTask, scheduleIdleChunkedTask, processIdleTasks, getQueueLength, isScheduled }`
- `window.runWhenIdle = runWhenIdle`
- `window.scheduleIdleTask = scheduleIdleTask`
- `window.scheduleIdleChunkedTask = scheduleIdleChunkedTask`

### 3.2 Consumer Resolution Audit
All existing consumers across the codebase were audited to confirm proper resolution:

1. **[`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)**:
   - Lines 426–429, 477–480, 495–498: Successfully calls `scheduleIdleTask` (now available synchronously).
   - Lines 608–611: Successfully resolves and executes `scheduleIdleChunkedTask` for wallpaper manifest indexing.
   - Lines 1604–1605: Successfully queues video caching via `scheduleIdleTask`.
2. **[`src/newtab/widgets/news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js)**:
   - Line 476: Queues background RSS refreshes via `scheduleIdleTask`.
3. **[`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)**:
   - Line 226: Resolves `scheduleIdleTask` from `options.scheduleTask` or `window.scheduleIdleTask`.
4. **[`src/newtab/wallpaper/gallery-ui.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js)**:
   - Lines 264–265, 1759, 1818, 1866: Lazily invokes `scheduleIdleTask` during user interactions.
5. **[`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js)** & **`settings-ui.js`**:
   - Lines 473–474 / 1664: Resolves `runWhenIdle(() => manageHomebaseTabs())`.
6. **[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)**:
   - Lines 159, 175, 237, 240, 243, 353: Calls `scheduleIdleTask` and `runWhenIdle` without needing local implementations.

---

## 4. Script Ordering Audit

Inspection of [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) confirmed the target execution hierarchy:

```text
1. Browser Preloader & Instant Hydration
   ├── preload.js (Head synchronous)
   └── instant_load.js (Body synchronous)
            ↓
2. Core Performance Infrastructure
   ├── perf-report.js (Script #7)
   └── startup-perf-runtime.js (Script #8: DEBUG_IDLE_STARTUP, hbPerfMark)
            ↓
3. Cooperative Task Scheduler Engine
   └── idle-scheduler.js (Script #9: window.HomebaseIdleScheduler)
            ↓
4. Subsystem Controllers & Services
   ├── Core Dialogs, Menus, Storage (Scripts #10–#36)
   ├── Bookmark Controllers & Services (Scripts #37–#46)
   ├── Wallpaper Controller & Storage (Scripts #47–#49: wallpaper-controller.js)
   ├── Settings Controllers (Scripts #50–#59)
   └── Widget Controllers (Scripts #60–#64: news.js is Script #64)
            ↓
5. Startup Hydration Task Registry
   └── startup-hydration.js (Script #65: HomebaseStartupHydration)
            ↓
6. Startup Orchestrator Coordinator
   └── new-tab.js (Script #66: initializePage, markPageReadyOnce)
```

**Verification:**
- `idle-scheduler.js` executes immediately after `startup-perf-runtime.js` and before `dialogs.js`.
- Zero feature controllers or widgets execute before `idle-scheduler.js`.
- Resolves all historic script-order dependency inversions.

---

## 5. Behavioral Invariance Audit

Comparison between the extracted module and original implementation verified 100% equivalence:

1. **`IDLE_TASK_BUDGET_MS = 12`**: Exact 12ms slice limit preserved.
2. **`requestIdleCallback` & Timeout Fallback**: If `requestIdleCallback` is unsupported, falls back to `setTimeout` with `{ didTimeout: true, timeRemaining: () => 0 }` clamped to `Math.min(timeout, 500)`.
3. **Queue Discipline**: FIFO execution ordering (`idleTaskQueue.shift()` / `push()`) strictly preserved.
4. **Task Deduplication**: Exact same logic for existing tasks: if running or pending, updates `nextFn`; if queued, updates `fn`.
5. **Async Handling**: Promise completion chains `.catch(...)` and `.finally(...)`, handling task requeueing or label cleanup.
6. **Chunked Yielding**: `scheduleIdleChunkedTask` yields when `timeRemaining() <= 2` or `elapsed >= 10ms`, preserving state until `done === true`.
7. **Error Containment**: Traps synchronous and asynchronous errors with `console.warn('Idle task failed:', task.label, err)`.

---

## 6. Static Verification Results

Execution of `node scripts/check-newtab-static.mjs` returned:
- `PASS deferred local script files exist - 65 deferred local scripts checked`
- `PASS preload.js script tag exists once`
- `PASS preload.js remains in head`
- `PASS preload.js remains synchronous`
- `PASS new-tab.js is last deferred runtime script`
- `PASS key extracted module paths exist - 44 module paths checked` (including `newtab/core/idle-scheduler.js`)
- `PASS no cross-script top-level declaration collisions - 867 unique top-level declarations verified across 65 deferred scripts`

**Result: 0 collisions, 0 stale references.**

---

## 7. Runtime Verification Results

1. **Automated Unit Tests (`npm.cmd test` / `node:test`)**:
   - `tests 367`, `pass 367`, `fail 0` (100% passing across all specifications).
2. **Headless Browser Smoke Test (`smoke-newtab-file.mjs`)**:
   - Edge headless browser launched and loaded page.
   - Required DOM surfaces verified.
   - Core controllers and perf helpers verified.
   - Zero `ReferenceError` or runtime exceptions.
3. **Dual Distribution Build (`npm.cmd run build`)**:
   - `Built chrome -> dist\chrome`
   - `Built firefox -> dist\firefox`
4. **Protected Files Invariant (`git diff src/preload.js src/instant_load.js manifests/ dist/`)**:
   - Completely empty output (zero modifications to protected files).

---

## 8. Quantitative Metrics

```text
src/new-tab.js Line Count Progression across Cycle #13:
├── Baseline (Cycle 13 Start):                 1,148 lines
├── Phase 2 (Bookmark Bridges & Mirrors):        925 lines (-223 lines)
├── Phase 3 (Wallpaper Startup Priming):         853 lines (-72 lines)
├── Phase 4 (Hydration Task Registry):           642 lines (-211 lines)
└── Phase 5 (Idle Scheduler Extraction):         356 lines (-286 lines)

Total Cycle #13 Net Reduction to Date: -792 lines (-69.0%)
Milestone Status: < 400 lines target achieved (currently 356 lines)
```

---

## 9. Final Recommendation

**Cycle #13 Phase 5 is fully verified and ready for sign-off.**

The repository is now in an optimal architectural state to proceed to **Cycle #13 Phase 6: Final Orchestrator Polish & Audit** to perform final cleanups, verify startup phase assertions, and conclude Cycle #13.
