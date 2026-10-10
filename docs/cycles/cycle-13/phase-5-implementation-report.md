# Homebase Cycle #13 — Phase 5 Implementation Report: Idle Task Scheduler Subsystem Extraction

**Document:** `docs/cycles/cycle-13/phase-5-implementation-report.md`  
**Date:** October 11, 2026  
**Status:** COMPLETED & VERIFIED  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 642 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Final Line Count:** **356 lines** (**-286 lines** net reduction from `src/new-tab.js`)  
**Extracted Module:** [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js)  
**Canonical Namespace:** `window.HomebaseIdleScheduler`  

---

## 1. Executive Summary

In **Cycle #13 Phase 5**, the cooperative idle task scheduler subsystem was extracted atomically from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into a dedicated core infrastructure module: [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js).

This extraction achieves the primary strategic objective of **Cycle #13**:
> **Primary goal is ownership separation: `new-tab.js` becomes startup orchestration only. Line reduction is a secondary measurement.**

With this extraction, [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) drops from **642 lines to 356 lines**, decisively achieving the long-standing **< 400 lines milestone** (sub-400 startup coordinator) for the entire repository.

---

## 2. Ownership Changes & Responsibilities

### 2.1 Transferred to `HomebaseIdleScheduler` (`src/newtab/core/idle-scheduler.js`)
- **Idle Callback Fallback**: Owns `runWhenIdle(cb, timeout)` with 500ms `setTimeout` fallback returning simulated `{ didTimeout: true, timeRemaining: () => 0 }`.
- **Budget & Concurrency Management**: Owns `IDLE_TASK_BUDGET_MS = 12`, `idleTaskQueue`, `idleTaskLabels`, and `idleTaskScheduled` concurrency guard.
- **Cooperative Drain Loop**: Owns `processIdleTasks(deadline)` managing slice duration budget (`12ms` or `timeRemaining <= 1`), asynchronous promise continuation, label cleanup, and rescheduling.
- **Public Task Queueing & Deduplication**: Owns `scheduleIdleTask(fn, label)` with label deduplication and running/pending chaining via `task.nextFn`.
- **Generator-Style Chunked Worker**: Owns `scheduleIdleChunkedTask(label, stepFn, initialState)` with yield thresholds (`timeRemaining <= 2` or `elapsed >= 10ms`), state continuation, and completion handling.
- **Diagnostic Accessors**: Owns `getQueueLength()` and `isScheduled()`.
- **Canonical API & Global Bindings**:
  - `window.HomebaseIdleScheduler = { runWhenIdle, scheduleIdleTask, scheduleIdleChunkedTask, processIdleTasks, getQueueLength, isScheduled }`
  - Global compatibility bindings: `window.runWhenIdle`, `window.scheduleIdleTask`, `window.scheduleIdleChunkedTask`.

### 2.2 Retained in `src/new-tab.js`
- **Startup Script Perf Mark**: Retains `hbPerfMark('script-start')`.
- **Startup Lifecycle Coordination**: Retains `initializePage()`, `markPageReadyOnce()`, ready-class toggling, and fallback timers.
- **Orchestration Task Dispatches**: Retains background enqueue calls:
  - Calling `runWhenIdle(() => { window.HomebaseStartupHydration.scheduleStartupHydrationTasks(...) })`
  - Enqueueing `warmGalleryPosterHydration`, `pruneFaviconMetaIfNeeded`, `ensureDailyWallpaper`, and `updateDynamicAccent`.
- **Event Coordination**: Retains `DOMContentLoaded` and `window.load` listeners.

---

## 3. Files Changed

| File | Change Type | Lines | Description |
|---|:---:|:---:|---|
| [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js) | **New File** | +187 lines | Dedicated IIFE-encapsulated cooperative idle task scheduling module. Owns queue state, 12ms budget loop, deduplication, chunked worker, and exports `window.HomebaseIdleScheduler` with global convenience bindings. |
| [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | Modified | +1 line | Registered `<script src="newtab/core/idle-scheduler.js" defer></script>` as Script #9 immediately following `startup-perf-runtime.js` and before `dialogs.js`. |
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | Modified | -285 lines net | Removed `runWhenIdle`, `IDLE_TASK_BUDGET_MS`, `idleTaskQueue`, `idleTaskLabels`, `idleTaskScheduled`, `processIdleTasks`, `scheduleIdleTask`, and `scheduleIdleChunkedTask`. Preserved `hbPerfMark('script-start')`. |
| [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | Modified | +1 line | Added `"newtab/core/idle-scheduler.js"` to `keyExtractedModulePaths` to track the new module in static invariant checks. |

---

## 4. Dependency Validation & Script Ordering

### 4.1 Resolution of Load-Order Inversion
Historically, [`wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js) (Script #48) and [`news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) (Script #63) executed before [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Script #64). This required defensive checks such as:
```javascript
const runIdle = typeof scheduleIdleTask === 'function' ? scheduleIdleTask : (window.scheduleIdleTask || null);
```

By placing `idle-scheduler.js` as **Script #9** in `src/new-tab.html`:
1. `perf-report.js` (Script #7) and `startup-perf-runtime.js` (Script #8) load first.
2. `idle-scheduler.js` (Script #9) executes next, establishing `window.HomebaseIdleScheduler`, `window.scheduleIdleTask`, `window.scheduleIdleChunkedTask`, and `window.runWhenIdle`.
3. All feature modules (`storage-service`, `bookmark-drag-controller`, `wallpaper-controller`, `news`, `startup-hydration`, and `new-tab.js`) execute **after** `idle-scheduler.js`.
4. Zero load-order inversions exist.

### 4.2 Static Declaration Invariant Compliance
- `src/newtab/core/idle-scheduler.js` is wrapped in an IIFE `(function () { 'use strict'; ... })();`.
- Internal queue variables (`idleTaskQueue`, `idleTaskLabels`, `idleTaskScheduled`) reside at lexical depth 1.
- Acorn detected **0 depth-0 declarations** introduced by `idle-scheduler.js`.
- Removal of declarations from `src/new-tab.js` reduced unique top-level declarations across the codebase from 875 to 867.
- Static collision scanner reported **0 declaration collisions** across all 65 deferred scripts.

---

## 5. Verification Results

The extraction passed the mandatory verification toolchain with 100% success:

| Verification Suite | Tool / Command | Result | Details |
|---|---|:---:|---|
| **Syntax Check** | `node --check src/newtab/core/idle-scheduler.js src/new-tab.js` | **PASS** | 0 syntax errors across modified/created files. |
| **Static Invariant Scanner** | `node scripts/check-newtab-static.mjs` | **PASS** | 65 deferred scripts verified, 44 key extracted modules checked, 0 collisions across 867 declarations. |
| **Automated Unit Tests** | `npm.cmd test` (Stage 3 `node:test`) | **PASS** | 367 / 367 unit tests passing (0 failures, 0 regressions). |
| **Headless Smoke Test** | `npm.cmd test` (Stage 4 `smoke-newtab-file.mjs`) | **PASS** | Edge headless smoke passed, core controllers available, 0 ReferenceError exceptions. |
| **Dual Distribution Build** | `npm.cmd run build` | **PASS** | Clean builds for Chrome (`dist/chrome`) and Firefox (`dist/firefox`). |
| **Protected Files Diff** | `git diff src/preload.js src/instant_load.js manifests/ dist/` | **PASS** | Output completely empty (zero changes to protected files). |

---

## 6. Milestone & Line Count Impact

```text
Cycle #13 Evolution of src/new-tab.js:
├── Baseline (Start of Cycle 13): 1,148 lines
├── After Phase 2 (Bridges & State Pruning):   925 lines (-223 lines)
├── After Phase 3 (Wallpaper Priming):         853 lines (-72 lines)
├── After Phase 4 (Hydration Registry):        642 lines (-211 lines)
└── After Phase 5 (Idle Scheduler Extraction): 356 lines (-286 lines)  <-- SUB-400 TARGET ACHIEVED!
```

---

## 7. Git & Publication Status

- **Branch:** `development`
- **Commit Message:** `refactor(startup): extract idle scheduler subsystem`
- **Commit Hash:** `7e7ef9c`
- **Remote Push:** `origin/development` (verified)
