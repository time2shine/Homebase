# Homebase Cycle #13 — Monolith Deconstruction & Core Startup Architecture

**Cycle Target:** Transform `src/new-tab.js` from a legacy monolith into a lean, dedicated **Startup Orchestration Coordinator** (< 400 lines).  
**Starting Baseline:** 1,148 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Target Milestone:** < 400 lines (Zero domain logic, pure boot coordination)  
**Status:** In Progress (Phase 1 Audit Complete)  

---

## 1. Cycle Objectives & Strategic Vision

With the completion of Cycle #12 (which decoupled the entire bookmark drag-and-drop subsystem into `bookmark-drag-controller.js`), Cycle #13 addresses the remaining non-startup code embedded in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):

1. **Extract Core Infrastructure**: Extract the ~298-line cooperative idle task scheduler into `src/newtab/core/idle-scheduler.js`, solving script-order dependency inversions.
2. **Modularize Wallpaper Startup**: Relocate `primeWallpaperBackground()` into `src/newtab/wallpaper/wallpaper-controller.js`.
3. **Formalize Startup Hydration**: Extract the ~205-line widget hydration task runners into `src/newtab/core/startup-hydration.js`.
4. **Prune Stale Compatibility Bridges**: Clean up legacy bookmark forwarders and unread mirror state from `src/new-tab.js`.
5. **Preserve Startup Contract**: Ensure the synchronous preloader (`preload.js`), instant UI render, and ready-class flip timings remain sub-100ms.

---

## 2. Phase Roadmap & Tracking

| Phase | Description | Deliverable Document | Target Reduction | Status |
|:---:|---|---|:---:|:---:|
| **Phase 1** | **New Tab Architecture Audit** | [`phase-1/architecture-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/phase-1/architecture-audit.md) | Baseline (1,148 lines) | **COMPLETE** |
| **Phase 2** | **Bookmark Bridges & State Pruning** | `docs/235-cycle13-phase2-bookmark-bridges-plan.md` | -160 lines (~988 lines) | Pending |
| **Phase 3** | **Wallpaper Startup Priming Extraction** | `docs/237-cycle13-phase3-wallpaper-priming-plan.md` | -65 lines (~923 lines) | Pending |
| **Phase 4** | **Startup Hydration Task Registry Extraction** | `docs/239-cycle13-phase4-startup-hydration-plan.md` | -200 lines (~723 lines) | Pending |
| **Phase 5** | **Idle Task Scheduler Subsystem Extraction** | `docs/241-cycle13-phase5-idle-scheduler-plan.md` | -295 lines (~428 lines) | Pending |
| **Phase 6** | **Final Orchestrator Polish & Audit** | `docs/243-cycle13-phase6-final-audit.md` | -30 lines (**~398 lines**) | Pending |

---

## 3. Projected Size Evolution

```text
Baseline (Start of Cycle 13): 1,148 lines
After Phase 2 (Bridges):      ~988 lines  (Crosses < 1,000 Milestone)
After Phase 3 (Wallpaper):    ~923 lines
After Phase 4 (Hydration):    ~723 lines
After Phase 5 (Scheduler):    ~428 lines
After Phase 6 (Final Polish): ~398 lines  (Sub-400 Target Achieved!)
```

---

## 4. Key Rules for Cycle #13

- **Startup Contract Invariant**: `initializePage()` must never await non-critical hydration tasks; ready class flip must occur before widget loading.
- **Static Invariant Protection**: Every new extracted module must be registered in `src/new-tab.html` and verified with `check-newtab-static.mjs` (zero duplicate top-level declarations).
- **Dual Browser Testing**: Automated tests must maintain 100% pass rate (367/367 tests).
- **Collaborative Discipline**: Strictly follow `Audit → Plan → Approval → Implement → Verify → Commit → Push`.
