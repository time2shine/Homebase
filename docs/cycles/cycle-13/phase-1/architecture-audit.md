# Homebase Cycle #13 — Phase 1: New Tab Architecture Audit

**Document:** `docs/cycles/cycle-13/phase-1/architecture-audit.md` (formerly `docs/233-cycle13-phase1-new-tab-architecture-audit.md`)  
**Date:** October 9, 2026  
**Status:** COMPLETE (READ-ONLY AUDIT — NO SOURCE CODE MODIFICATIONS)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Baseline Size: **1,148 lines**)  

---

## 1. Executive Summary

Following the completion of Cycle #12 and the release of **v0.17.0** (which extracted the entire Bookmark Drag & Drop subsystem into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) and reduced [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) from 1,842 to 1,148 lines), Cycle #13 sets the objective of completing the transformation of `src/new-tab.js` from a legacy monolith into a lean, dedicated **Startup Orchestration Coordinator** (~400 lines).

This Phase 1 Read-Only Architecture Audit inspects all 1,148 lines of `src/new-tab.js` to:
1. Quantify remaining responsibilities and categorize code blocks into functional domains.
2. Cross-reference remaining logic against established modules under `src/newtab/`.
3. Identify exact extraction candidates, assessing risk levels and potential line reductions.
4. Establish a structured phase roadmap for Cycle #13.

---

## 2. Current Architecture & Ownership Map

```mermaid
graph TD
    subgraph Legacy Monolith [src/new-tab.js (1,148 lines)]
        IdleSched["Idle Task Scheduler<br/>(lines 25–322: ~298 lines)<br/>• runWhenIdle, processIdleTasks<br/>• scheduleIdleTask, chunking"]
        WallPrime["Wallpaper Priming IIFE<br/>(lines 327–391: ~65 lines)<br/>• primeWallpaperBackground<br/>• rotation check, poster fallback"]
        Bridges["Compatibility Bridges<br/>(lines 426–475, 526–642: ~165 lines)<br/>• drag bridges & flags<br/>• loader bridges & state mirrors"]
        StartupHydr["Startup Hydration Wrappers<br/>(lines 828–1032: ~205 lines)<br/>• 9 safe widget idle runners<br/>• scheduleStartupHydrationTasks"]
        InitCore["Core Startup Orchestrator<br/>(lines 678–826, 1045–1148: ~415 lines)<br/>• initializePage(), markPageReadyOnce<br/>• DOMContentLoaded, controller bootstrap"]
    end

    subgraph Extracted Modules [src/newtab/]
        CoreMod["src/newtab/core/<br/>• startup-perf-runtime.js<br/>• storage-dispatcher.js<br/>• context-menu-controller.js<br/>• dock-navigation.js"]
        WallMod["src/newtab/wallpaper/<br/>• wallpaper-controller.js<br/>• wallpaper-storage.js"]
        BookMod["src/newtab/bookmarks/<br/>• bookmark-drag-controller.js<br/>• bookmark-loader-service.js<br/>• bookmark-grid-controller.js"]
        WidgetMod["src/newtab/widgets/<br/>• weather, news, quote, todo, time"]
    end

    IdleSched -.->|Provides scheduler globally| ExtractedModules
    WallPrime -->|Calls state & poster APIs| WallMod
    Bridges -->|Pure forwarders| BookMod
    StartupHydr -->|Executes in idle slice| WidgetMod
    InitCore -->|Orchestrates bootstrap| ExtractedModules
```

---

## 3. Detailed Responsibility Analysis (Functional Breakdown)

| Domain Group | Line Range | Approx. Lines | Content & Responsibilities | Destination / Status |
|---|:---:|:---:|---|---|
| **A. Startup / Lifecycle** | 678–826, 1006–1042, 1115–1136 | **~245 lines** | `initializePage()`, `markPageReadyOnce()`, parallel storage loads, ready-class flip, DOMContentLoaded, window.load listeners. | **Retain in `new-tab.js`** (Canonical role of the file). |
| **B. Bookmark Coordination** | 410, 418–424, 429–475, 526–642, 1073–1083 | **~187 lines** | Legacy forwarder bridges for drag (`setupGridSortable`, `setupTabsSortable`, `handleTabDrop`, drag flags) and loader (`processBookmarks`, `loadBookmarks`, etc.), unused local mirror state. | **Candidate 1 & 2** (Prune redundant mirrors; extract bridges to `bookmark-compat-bridges.js`). |
| **C. Search System** | 15–17, 412, 648–651, 751, 924–942 | **~27 lines** | DOM element lookups (`searchForm`, `searchInput`, `searchSelect`, `searchResultsPanel`), `suggestionAbortController`, search hydration runner. | Integrated into `src/newtab/search/` controllers. |
| **D. Wallpaper System** | 327–391, 696–700, 754–757, 1035–1037, 1088–1098, 1144–1148 | **~85 lines** | `primeWallpaperBackground()` IIFE, daily rotation trigger, poster fallback application, wallpaper storage change handler. | **Candidate 3** (Move to `src/newtab/wallpaper/wallpaper-controller.js`). |
| **E. Settings / Preferences** | 687–692, 725–752 | **~30 lines** | `HomebaseSettingsPreferences` bootstrap, cinema mode listeners, glass/animation settings wiring, sub-settings loops. | Clean delegations to `settings-preferences.js`. |
| **F. UI Event Handling** | 395–397, 761–768, 1045–1070, 1122–1124 | **~37 lines** | Wiring `HomebaseContextMenuController` and `HomebaseDialogController` adapters, folder picker, quick actions, tips. | Delegate coordinator bindings. |
| **G. Performance Monitoring** | 44, 679–684, 701–711, 723, 781–782, 808–824, 1116–1121 | **~85 lines** | High-precision performance markers (`hbPerfMark`, `hbPerfMeasure`), `DEBUG_STARTUP_PERF` logging, widget execution timing. | Retain in orchestrator. |
| **H. Utility / Scheduler Logic** | 25–322, 739–741, 494–503, 1108–1112 | **~316 lines** | Cooperative idle task scheduler (`runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`), time ticker, favicon delegation. | **Candidate 4** (Extract idle scheduler to `src/newtab/core/idle-scheduler.js`). |

---

## 4. Existing Modules Review & Duplication Avoidance

Before planning extractions, existing modules across `src/newtab/` were evaluated to prevent duplicate controllers:

1. **`src/newtab/bookmarks/` (14 modules)**:
   - Already owns all business logic: `bookmark-drag-controller.js` (drag physics, SortableJS), `bookmark-loader-service.js` (tree parsing, root ID), `bookmark-grid-controller.js` (tile DOM).
   - *Finding:* Lines 526–642 in `src/new-tab.js` are 100% duplicate pass-through forwarders.
2. **`src/newtab/wallpaper/` (4 modules)**:
   - `wallpaper-controller.js` owns playback, poster decoding, and rotation. `wallpaper-storage.js` owns persistence.
   - *Finding:* `primeWallpaperBackground()` in `src/new-tab.js` (lines 327–391) calls functions directly from `wallpaper-controller.js`. It belongs natively in `wallpaper-controller.js`.
3. **`src/newtab/core/` (18 modules)**:
   - Owns storage, navigation, dialogs, and schema migrations.
   - *Finding:* No dedicated module currently owns the cooperative idle task queue. Multiple modules (`wallpaper-controller.js`, `gallery-ui.js`, `news.js`, `settings-ui.js`) currently rely on `scheduleIdleTask` via awkward defensive window checks because `new-tab.js` loads last! Creating `src/newtab/core/idle-scheduler.js` will solve cross-script load-order dependency inversions.

---

## 5. Extraction Candidates Evaluation

### Candidate 1: Bookmark Compatibility Bridges & Dead State
- **Current Location:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L426-L475) & [lines 526–642](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L526-L642)
- **Approximate Size:** ~165 lines
- **Responsibility:** Backward compatibility wrappers (`setupGridSortable`, `setupTabsSortable`, `handleTabDrop`, `processBookmarks`, `loadBookmarks`, etc.) and unread local mirror variables (`allBookmarks`, `rootDisplayFolderId`).
- **Proposed Module:** `src/newtab/bookmarks/bookmark-compat-bridges.js` (or prune dead internal mirrors).
- **Risk Level:** **Low** (Canonical owners already export directly to `window`).
- **Expected Line Reduction:** **~160 lines**.

### Candidate 2: Wallpaper Startup Priming
- **Current Location:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L327-L391)
- **Approximate Size:** ~65 lines
- **Responsibility:** Immediate async wallpaper background resolution, daily rotation check, and poster application during initial boot.
- **Proposed Module:** Move into [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js) (as `HomebaseWallpaperController.primeWallpaperBackground()`).
- **Risk Level:** **Medium** (High visual impact on startup; requires verification that background image applies before first paint).
- **Expected Line Reduction:** **~65 lines**.

### Candidate 3: Startup Hydration Task Registry
- **Current Location:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L828-L1032)
- **Approximate Size:** ~205 lines
- **Responsibility:** Safe error-wrapped execution and instrumentation for the 9 non-critical dashboard widgets (`loadCachedWeatherSafe`, `buildQuoteIndexSafe`, `setupSearchSafe`, etc.) and `scheduleStartupHydrationTasks()`.
- **Proposed Module:** `src/newtab/core/startup-hydration.js`.
- **Risk Level:** **Low–Medium** (Must preserve `startup:` label telemetry allowlist and idle scheduler priority).
- **Expected Line Reduction:** **~200 lines**.

### Candidate 4: Idle Task Scheduler Subsystem
- **Current Location:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L25-L322)
- **Approximate Size:** ~298 lines
- **Responsibility:** Cooperative idle budget scheduler (`processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, `runWhenIdle`).
- **Proposed Module:** `src/newtab/core/idle-scheduler.js`.
- **Risk Level:** **High** (Per `AGENTS.md`, idle scheduler is a high-risk area. Must load early in `src/new-tab.html` so all deferred scripts have immediate access without defensive hacks).
- **Expected Line Reduction:** **~295 lines**.

---

## 6. Line Count Projection for Cycle #13

| Stage / Phase | Scope | Lines Extracted | Projected `src/new-tab.js` Size |
|---|---|:---:|:---:|
| **Baseline (Start of Cycle #13)** | — | — | **1,148 lines** |
| **Phase 2** | Bookmark Bridges & State Pruning | ~160 lines | **~988 lines** (< 1,000 Milestone!) |
| **Phase 3** | Wallpaper Startup Priming | ~65 lines | **~923 lines** |
| **Phase 4** | Startup Hydration Task Registry | ~200 lines | **~723 lines** |
| **Phase 5** | Idle Task Scheduler Subsystem | ~295 lines | **~428 lines** |
| **Phase 6** | Architecture Polish & Final Orchestrator | ~30 lines | **~398 lines (Sub-400 Target Achieved!)** |

---

## 7. Risk Assessment & Mitigations

1. **Idle Scheduler Load Order Inversion**:
   - *Risk:* Moving `scheduleIdleTask` to a separate file could break early scripts if loaded too late.
   - *Mitigation:* Register `src/newtab/core/idle-scheduler.js` near the very top of `<script defer>` tags in `src/new-tab.html`, right after `startup-perf-runtime.js`.
2. **Wallpaper First-Paint Flash**:
   - *Risk:* If `primeWallpaperBackground()` runs later than current inline position, a brief unstyled background flash could occur.
   - *Mitigation:* Ensure `wallpaper-controller.js` invokes priming immediately upon evaluation or in the same tick as current execution.
3. **Startup Contract Invariants**:
   - *Risk:* `initializePage()` must strictly adhere to the startup contract: no awaiting non-critical hydration, all idle labels prefixed with `startup:`, and ready flip must not block on widget loading.
   - *Mitigation:* Keep `initializePage()` orchestration and phase guards directly in `src/new-tab.js`.

---

## 8. Suggested Cycle #13 Roadmap

- **Phase 1 (Complete):** Architecture Audit & Strategy (this report).
- **Phase 2:** Bookmark Compatibility Bridges & Redundant State Pruning (Cross the sub-1,000 lines milestone).
- **Phase 3:** Wallpaper Startup Priming Extraction into `src/newtab/wallpaper/wallpaper-controller.js`.
- **Phase 4:** Startup Hydration Task Registry Extraction into `src/newtab/core/startup-hydration.js`.
- **Phase 5:** Idle Task Scheduler Subsystem Extraction into `src/newtab/core/idle-scheduler.js`.
- **Phase 6:** Final Polish, Verification, Documentation Archive & Release Readiness (Target: `src/new-tab.js` < 400 lines).

---

## 9. Conclusion

Cycle #13 has a clear, low-risk path to achieving the long-standing architectural goal of reducing `src/new-tab.js` below **400 lines**, leaving it as a pure startup orchestrator while maintaining 100% backward compatibility and test stability.

**STOPPED.** READ-ONLY audit complete. No source files modified. No commits created. Awaiting owner review and approval before proceeding to Phase 2.
