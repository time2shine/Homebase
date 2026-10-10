# Homebase Cycle #13 — Phase 5 Plan: Idle Task Scheduler Subsystem Extraction

**Document:** `docs/cycles/cycle-13/phase-5-plan.md`  
**Date:** October 10, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 642 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Target Milestone:** Single Canonical Ownership for Cooperative Idle Scheduling (Line reduction: ~642 $\to$ ~361 lines as secondary measurement)  
**Target Extracted Module:** [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js)  
**Canonical Namespace:** `window.HomebaseIdleScheduler`  

---

## 1. Current Ownership Audit

### 1.1 Overview
In Homebase, non-critical startup and background operations (such as wallpaper prefetching, widget hydration, RSS feed refreshes, dynamic accent calculations, and favicon metadata pruning) are deferred into cooperative idle slices using a custom scheduling engine.

Currently, this entire scheduling engine is implemented directly inside [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), occupying **281 lines** between lines 25 and 310.

### 1.2 Inventory of Scheduler Symbols & Line Ranges

| Symbol | Current Type / Role | Line Range in `src/new-tab.js` | Lines Count | Description |
|---|---|:---:|:---:|---|
| `runWhenIdle` | Arrow Function (`const`) | Lines 25–37 | 13 | Wrapper around `window.requestIdleCallback` with a 500ms `setTimeout` fallback returning simulated `{ didTimeout: true, timeRemaining: () => 0 }`. |
| `IDLE_TASK_BUDGET_MS` | Constant (`const`) | Line 39 | 1 | Maximum duration per idle slice in milliseconds (`12ms`). |
| `idleTaskQueue` | Queue Array (`const`) | Line 40 | 1 | In-memory FIFO queue of task descriptors (`{ fn, label, nextFn, isRunning, isPending }`). |
| `idleTaskLabels` | Map (`const`) | Line 41 | 1 | Deduplication lookup table mapping task label strings to active task descriptors. |
| `idleTaskScheduled` | Boolean Flag (`let`) | Line 42 | 1 | Concurrency guard preventing multiple concurrent `runWhenIdle` loop triggers. |
| `processIdleTasks` | Async Function (`async function`) | Lines 48–170 | 123 | The cooperative drain loop. Evaluates time budget (`12ms` or `timeRemaining <= 1`), executes sync and async tasks, manages promise re-queuing, deduplication cleanup, and schedules subsequent idle slices. |
| `scheduleIdleTask` | Function (`function`) | Lines 173–217 | 45 | Public scheduling entry point. Validates callbacks, performs label deduplication (updating `fn` or chaining `nextFn`), enqueues task, and triggers scheduling loop if idle. |
| `scheduleIdleChunkedTask` | Function (`function`) | Lines 219–310 | 92 | Generator-style chunked worker. Takes `(label, stepFn, initialState)` and yields execution when `timeRemaining() <= 2` or `elapsed >= 10ms`, re-queuing itself until `done: true`. |

*(Note: Line 44 `hbPerfMark('script-start');` is an orchestrator startup performance mark and remains in `src/new-tab.js`.)*

**Total Scheduler Line Footprint:** 13 + 4 + 123 + 45 + 92 = **281 lines**.

### 1.3 Audit of Current Consumers Across Codebase

A repository-wide audit revealed the following consumers of the idle scheduler:

1. **[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)**:
   - Line 444: `scheduleIdleTask(() => warmGalleryPosterHydration(), 'warmGalleryPosterHydration');`
   - Line 460: `scheduleIdleTask(() => pruneFaviconMetaIfNeeded(), 'startup:pruneFaviconMeta');`
   - Line 522: `scheduleIdleTask(() => ensureDailyWallpaper().catch(() => {}), 'startup:ensureDailyWallpaper');`
   - Line 525: `runWhenIdle(() => { window.HomebaseStartupHydration.scheduleStartupHydrationTasks(...) });`
   - Line 528: Dependency injection parameter: `scheduleTask: scheduleIdleTask` passed into `scheduleStartupHydrationTasks`.
   - Line 638: `scheduleIdleTask(() => updateDynamicAccent(), 'startup:updateDynamicAccent');`

2. **[`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)**:
   - Lines 426–429: Defensive check and call: `scheduleIdleTask(() => cacheGalleryPostersIfNeeded(manifest), 'cacheGalleryPostersIfNeeded')`
   - Lines 477–480: Defensive check and call: `scheduleIdleTask(() => cacheGalleryPostersIfNeeded(cached.manifest), 'cacheGalleryPostersIfNeeded')`
   - Lines 495–498: Defensive check and call: `scheduleIdleTask(() => cacheGalleryPostersIfNeeded(fetched), 'cacheGalleryPostersIfNeeded')`
   - Lines 608–611: Chunked background task: `scheduleIdleChunkedTask(...)` for wallpaper manifest indexing
   - Lines 677–679: Resolves `runIdle = typeof scheduleIdleTask === 'function' ? scheduleIdleTask : window.scheduleIdleTask`
   - Lines 1604–1605: `scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydratedSelection), 'cacheAppliedWallpaperVideo')`
   - Line 1808: Passes `scheduleIdleTask` fallback in options dictionary

3. **[`src/newtab/widgets/news.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js)**:
   - Line 476: `scheduleIdleTask(async () => { ... await fetchAndRenderNews({ force: true }); }, 'news:idleRefresh')` inside `scheduleNewsIdleRefresh()`.

4. **[`src/newtab/core/startup-hydration.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-hydration.js)**:
   - Lines 224–226: Resolves `scheduleTask` option or falls back to `typeof scheduleIdleTask === 'function' ? scheduleIdleTask : window.scheduleIdleTask`.

5. **[`src/newtab/wallpaper/gallery-ui.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js)**:
   - Lines 264–265, 1759, 1760, 1818, 1866, 2211, 2905: Lazily invokes `scheduleIdleTask` during user interaction via `getContextCallback('scheduleIdleTask')` / `window.scheduleIdleTask`.

---

## 2. Extraction Boundary Rules

### 2.1 Architectural Principle
> **`src/new-tab.js` should only orchestrate startup. Scheduler implementation belongs to a dedicated core infrastructure module.**

### 2.2 What Moves to `HomebaseIdleScheduler` (`src/newtab/core/idle-scheduler.js`)
All scheduler engine state and algorithms move into the new module:
- Fallback idle callback implementation (`runWhenIdle`)
- Time budget configuration (`IDLE_TASK_BUDGET_MS = 12`)
- Internal queue storage (`idleTaskQueue`, `idleTaskLabels`, `idleTaskScheduled`)
- Task loop execution and promise handling (`processIdleTasks`)
- Public task queueing and deduplication (`scheduleIdleTask`)
- Generator-style chunked worker (`scheduleIdleChunkedTask`)
- Canonical namespace export: `window.HomebaseIdleScheduler`
- Seamless global compatibility bindings: `window.runWhenIdle`, `window.scheduleIdleTask`, `window.scheduleIdleChunkedTask`

### 2.3 What Remains in `src/new-tab.js`
`src/new-tab.js` retains solely startup orchestration:
- `hbPerfMark('script-start')`
- Startup lifecycle coordination (`initializePage`, `markPageReadyOnce`)
- Orchestration calls triggering background tasks:
  - Calling `runWhenIdle(...)` to initiate startup hydration
  - Enqueueing specific startup tasks (`warmGalleryPosterHydration`, `pruneFaviconMetaIfNeeded`, `ensureDailyWallpaper`, `updateDynamicAccent`)
- Event listeners for `DOMContentLoaded` and `window.load`
- Ready class DOM flipping and fallback timer guards

---

## 3. External Dependency Audit

### 3.1 External Symbol Dependency Table

| Symbol | Type / Role | Owner File | Export Mechanism | Script Order | Required Access in `idle-scheduler.js` |
|---|---|---|---|:---:|---|
| `requestIdleCallback` | Native Web API | Browser Runtime (`window`) | Global function on `window` | Pre-existing | Global access; probed via `'requestIdleCallback' in window` |
| `cancelIdleCallback` | Native Web API | Browser Runtime (`window`) | Global function on `window` | Pre-existing | Audited: **Not used**. Homebase uses cooperative yielding and task completion rather than external handle cancellation tokens |
| `scheduleIdleTask` | Core API | Target: [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js) | Canonical export `window.HomebaseIdleScheduler.scheduleIdleTask` & `window.scheduleIdleTask` | Script #9 | Defined and exported by `idle-scheduler.js` |
| `scheduleIdleChunkedTask` | Core API | Target: [`src/newtab/core/idle-scheduler.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/idle-scheduler.js) | Canonical export `window.HomebaseIdleScheduler.scheduleIdleChunkedTask` & `window.scheduleIdleChunkedTask` | Script #9 | Defined and exported by `idle-scheduler.js` |
| `recordIdleTaskPerf` | Telemetry Engine | [`src/newtab/core/perf-report.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js#L256) | Top-level function in global lexical scope | Script #7 | Executed by individual task callbacks (`startup-hydration.js`, `wallpaper-controller.js`), not by scheduler internals |
| `recordWidgetPerfTiming` | Telemetry Engine | [`src/newtab/core/perf-report.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js#L294) | Top-level function in global lexical scope | Script #7 | Executed by individual widget task runners, not by the core scheduler engine |
| `DEBUG_IDLE_STARTUP` | Debug Flag | [`src/newtab/core/startup-perf-runtime.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-perf-runtime.js#L296) | Top-level `const` in global lexical scope | Script #8 | Available globally in lexical scope if logging is enabled |
| `DEBUG_STARTUP_GUARDS` | Debug Flag | [`src/newtab/core/startup-perf-runtime.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-perf-runtime.js#L297) | Top-level `const` in global lexical scope | Script #8 | Available globally in lexical scope; guards critical startup phase transitions in `new-tab.js` |
| `STARTUP_PHASE` | Lifecycle State | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L365) | Local variable in `initializePage()` | Script #65 (Last) | Passed to hydration runners via `getStartupPhase()` getter. Scheduler is phase-agnostic |

### 3.2 Key Dependency Inversion Resolution
Currently, `wallpaper-controller.js` (Script #48) and `news.js` (Script #63) execute **before** `new-tab.js` (Script #64). Consequently:
- `wallpaper-controller.js` had to include defensive checks: `typeof scheduleIdleTask === 'function' ? scheduleIdleTask : window.scheduleIdleTask`.
- `news.js` could not safely invoke `scheduleIdleTask` during script evaluation (only inside later event handlers).

By moving the scheduler to `src/newtab/core/idle-scheduler.js` and inserting it as **Script #9** (immediately following `startup-perf-runtime.js`):
- `scheduleIdleTask`, `scheduleIdleChunkedTask`, and `runWhenIdle` are guaranteed to exist synchronously before **any** widget, controller, or feature module evaluates.
- All awkward load-order defensive workarounds across the codebase become safely redundant.

---

## 4. No Functional Change Rule

Phase 5 is strictly an **ownership relocation**. The extraction must preserve 100% behavioral equivalence:

1. **Task Ordering Invariance**: FIFO task execution queue semantics (`idleTaskQueue.shift()` and `push()`) must remain identical.
2. **Timeout Fallback Behavior**: In browsers or environments without `requestIdleCallback`, `setTimeout` fallback must continue to provide `{ didTimeout: true, timeRemaining: () => 0 }` clamped to `Math.min(timeout, 500)`.
3. **Idle Budget Handling**:
   - Time budget of `12ms` (`IDLE_TASK_BUDGET_MS = 12`) per slice must remain identical.
   - Yield condition `(elapsed >= IDLE_TASK_BUDGET_MS || (hasDeadline && timeRemaining <= 1))` must remain identical.
4. **Cooperative Chunking Behavior**:
   - `scheduleIdleChunkedTask` yield condition `(hasDeadline ? timeRemaining <= 2 : elapsed >= 10)` must remain identical.
   - State passing across chunk slices (`state = newState`) and completion signal (`done === true`) must remain identical.
5. **Deduplication Logic**:
   - Label-based deduplication via `idleTaskLabels.get(label)` must remain identical: updating `fn` for queued tasks, and setting `nextFn` for currently running or pending asynchronous tasks.
6. **Telemetry & Instrumentation**:
   - Individual task duration measurements and `recordIdleTaskPerf` call sites inside task runners must be preserved without modification.
7. **Error Containment**:
   - Synchronous exceptions in `task.fn` must be caught and logged via `console.warn('Idle task failed:', task.label, err)`.
   - Asynchronous rejections in returned promises must be caught via `.catch((err) => console.warn('Idle task failed:', task.label, err))`.
   - Exceptions must never crash the scheduler loop or block subsequent queued tasks.

---

## 5. Atomic Extraction Requirement

### 5.1 Static Scanner Collision Constraint
The project's static verification tool [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) uses Acorn to parse all deferred scripts and detect top-level (depth-0) declarations (`const`, `let`, `var`, `function`, `class`). Any depth-0 collision across two deferred scripts causes an immediate test failure.

In `src/new-tab.js`, the scheduler symbols were previously declared at depth 0:
- `const runWhenIdle = ...`
- `const IDLE_TASK_BUDGET_MS = ...`
- `const idleTaskQueue = ...`
- `const idleTaskLabels = ...`
- `let idleTaskScheduled = ...`
- `async function processIdleTasks(...)`
- `function scheduleIdleTask(...)`
- `function scheduleIdleChunkedTask(...)`

### 5.2 Atomic Extraction Rules
1. **Module IIFE Encapsulation**:
   `src/newtab/core/idle-scheduler.js` must encapsulate all internal variables and functions inside an IIFE:
   ```javascript
   (function () {
     'use strict';
     // Internal variables and functions at depth 1
   })();
   ```
   This ensures that Acorn detects **0 top-level declarations** in `idle-scheduler.js`.
2. **Explicit Window Exports**:
   Exports must be assigned directly to `window`:
   ```javascript
   window.HomebaseIdleScheduler = {
     runWhenIdle,
     scheduleIdleTask,
     scheduleIdleChunkedTask,
     processIdleTasks,
     getQueueLength: () => idleTaskQueue.length,
     isScheduled: () => idleTaskScheduled
   };

   window.runWhenIdle = runWhenIdle;
   window.scheduleIdleTask = scheduleIdleTask;
   window.scheduleIdleChunkedTask = scheduleIdleChunkedTask;
   ```
3. **Atomic Commit & Edit Sequence**:
   - Add `src/newtab/core/idle-scheduler.js`.
   - Remove the old scheduler declarations from `src/new-tab.js`.
   - Add `<script src="newtab/core/idle-scheduler.js" defer></script>` to `src/new-tab.html`.
   - Run `node scripts/check-newtab-static.mjs` immediately.
   - An intermediate state where both files declare depth-0 symbols is strictly prohibited.

---

## 6. Script Ordering Plan

### 6.1 Placement in `src/new-tab.html`
Scripts execute sequentially in document order. The idle scheduler is a fundamental core infrastructure component that all subsequent feature controllers rely upon.

Target insertion point: **Immediately following `src/newtab/core/startup-perf-runtime.js`** (Script #8) and **before `src/newtab/core/dialogs.js`** (Script #9):

```html
  <!-- Core runtime -->
  <script src="newtab/core/perf-report.js" defer></script>
  <script src="newtab/core/startup-perf-runtime.js" defer></script>
  <script src="newtab/core/idle-scheduler.js" defer></script>        <!-- INSERT HERE (Script #9) -->
  <script src="newtab/core/dialogs.js" defer></script>
  <script src="newtab/core/dialog-controller.js" defer></script>
  <script src="newtab/core/context-menu-controller.js" defer></script>
  ...
  <!-- Wallpaper helpers -->
  <script src="newtab/wallpaper/wallpaper-controller.js" defer></script> <!-- Script #49 (Has scheduleIdleTask) -->
  ...
  <!-- Widget helpers -->
  <script src="newtab/widgets/news.js" defer></script>                 <!-- Script #64 (Has scheduleIdleTask) -->
  <!-- Core startup hydration -->
  <script src="newtab/core/startup-hydration.js" defer></script>       <!-- Script #65 (Has scheduleIdleTask) -->
  <!-- Main new-tab runtime -->
  <script src="new-tab.js" defer></script>                             <!-- Script #66 (Startup Orchestrator) -->
```

### 6.2 Structural Execution Hierarchy

```text
1. Browser Preload & Instant Hydration
   ├── preload.js (Head synchronous)
   └── instant_load.js (Body synchronous)
            ↓
2. Core Performance Infrastructure
   ├── perf-report.js (Script #7)
   └── startup-perf-runtime.js (Script #8: DEBUG_IDLE_STARTUP, hbPerfMark)
            ↓
3. Core Task Scheduling Engine
   └── idle-scheduler.js (Script #9: window.HomebaseIdleScheduler)
            ↓
4. Subsystem Controllers & Services
   ├── Core Dialogs, Menus, Storage (Scripts #10–#36)
   ├── Bookmark Controllers & Services (Scripts #37–#46)
   ├── Wallpaper Controller & Storage (Scripts #47–#49)
   ├── Settings Controllers (Scripts #50–#59)
   └── Widget Controllers (Scripts #60–#64: Time, Todo, Quote, Weather, News)
            ↓
5. Startup Hydration Task Registry
   └── startup-hydration.js (Script #65: HomebaseStartupHydration)
            ↓
6. Startup Orchestrator Coordinator
   └── new-tab.js (Script #66: initializePage, markPageReadyOnce)
```

---

## 7. Risk Analysis

| Risk Dimension | Potential Failure Mode | Severity | Probability | Mitigation Strategy |
|---|---|:---:|:---:|---|
| **Timing Regressions** | Moving scheduler increases first paint or page-ready latency. | High | Low | The scheduler only manages background deferred tasks. Preload (`preload.js`), instant DOM render (`instant_load.js`), and synchronous initial paint are completely unaffected. |
| **Idle Starvation** | Background tasks fail to drain if idle budget is miscalculated. | Medium | Low | Exact 12ms budget calculation (`IDLE_TASK_BUDGET_MS = 12`) and fallback `setTimeout` loop are preserved verbatim. |
| **Telemetry Loss** | Task execution durations fail to record in performance state. | Low | Low | Telemetry calls (`recordIdleTaskPerf`) live in task runner callbacks, which remain unchanged and execute transparently. |
| **Duplicate Scheduler Ownership** | Accidental dual scheduler queues running in parallel. | Critical | Low | Complete removal of scheduler queue variables (`idleTaskQueue`, `idleTaskLabels`) from `new-tab.js`. Single canonical owner in `idle-scheduler.js`. |
| **Startup Ordering Issues** | A caller attempts to invoke `scheduleIdleTask` before script loads. | High | Low | Scheduler placed as Script #9 in `src/new-tab.html`, preceding all widgets, controllers, and orchestrators. Zero callers precede Script #9. |

---

## 8. Verification Plan

The Phase 5 extraction must pass the mandatory 5-step verification toolchain:

### Step 1: Syntax Validation
Validate syntax of both the new module and modified orchestrator:
```powershell
node --check src/newtab/core/idle-scheduler.js
node --check src/new-tab.js
```

### Step 2: Static Invariant & Collision Checking
Run static scanner to ensure all 65 deferred scripts are valid and zero lexical collisions exist:
```powershell
node scripts/check-newtab-static.mjs
```
*(Also register `newtab/core/idle-scheduler.js` in `keyExtractedModulePaths` inside `scripts/check-newtab-static.mjs`)*.

### Step 3: Full Automated Test Suite
Run the 4-stage test runner:
```powershell
npm.cmd test
```
Must achieve 100% pass across all 367 unit tests and the headless browser smoke test (`smoke-newtab-file.mjs`).

### Step 4: Dual Browser Distribution Build
Verify clean compilation and packaging for Chromium and Gecko:
```powershell
npm.cmd run build
```

### Step 5: Protected Files Check
Verify that protected files have not been modified:
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
```
Output must be completely empty.

---

## 9. Success Criteria

### 9.1 Primary Goal: Ownership Separation
- **`src/newtab/core/idle-scheduler.js`**: Becomes the single canonical owner of cooperative idle task scheduling, idle queue management, deadline budget handling, timeout fallbacks, and chunked execution.
- **`src/new-tab.js`**: Contains zero queue arrays, zero label maps, zero budget constants, and zero scheduling loops. Acts strictly as the startup lifecycle orchestrator.

### 9.2 Secondary Measurement: Line Reduction
- **Baseline (`src/new-tab.js` before Phase 5)**: 642 lines
- **Lines Extracted**: ~281 lines
- **Target Size (`src/new-tab.js` after Phase 5)**: **~361 lines**
- **Cycle #13 Milestone**: Crosses decisively below the long-standing **< 400 lines** target milestone for the orchestrator!
