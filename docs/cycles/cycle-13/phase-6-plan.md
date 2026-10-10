# Homebase Cycle #13 — Phase 6 Plan: Final Orchestrator Polish & Audit

**Document:** `docs/cycles/cycle-13/phase-6-plan.md`  
**Date:** October 11, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 356 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Target Milestone:** Architectural Finalization & Cycle #13 Closure  
**Goal:** Pure Startup Orchestration with zero dead code, zero obsolete bridges, and verified domain boundaries  

---

## 1. Current `new-tab.js` Ownership Audit

### 1.1 Overview
Following the successful completion of Phases 2, 3, 4, and 5:
- **Phase 2**: Bookmark loader, tree, and drag compatibility bridges pruned (-223 lines).
- **Phase 3**: Wallpaper startup priming extracted into `wallpaper-controller.js` (-72 lines).
- **Phase 4**: Startup hydration task registry extracted into `startup-hydration.js` (-211 lines).
- **Phase 5**: Cooperative idle task scheduler extracted into `idle-scheduler.js` (-286 lines).

[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) has been reduced from **1,148 lines to 356 lines** (a net reduction of 792 lines, or -69.0%). It has decisively crossed below the `< 400 lines` milestone.

### 1.2 Inventory of Remaining Responsibilities in `src/new-tab.js`

| Section / Responsibility | Line Range | Classification | Disposition |
|---|:---:|:---:|---|
| **Global DOM element handles** (`browser`, `googleAppsBtn`, `searchWidget`, etc.) | Lines 1–24 | DOM Handle Bindings | **Retain**: Required by top-level document scope and downstream controllers. |
| **Early script perf mark** (`hbPerfMark('script-start')`) | Line 25 | Startup Telemetry | **Retain**: Canonical start anchor for boot timing. |
| **Early layout & scroll setup** (`setupResponsiveLayoutListener`, `initTabsScrollController`) | Lines 27–33 | Boot Orchestration | **Retain**: Critical layout hydration before paint. |
| **Dead search abort controller** (`let suggestionAbortController = null;`) | Line 35 | **Dead Code Leftover** | **Candidate for Removal in Phase 6**: Encapsulated within `search-interaction-controller.js`. |
| **Favicon runtime delegation bridge** | Lines 38–49 | **Redundant Bridge** | **Candidate for Cleanup**: `favicon-pipeline.js` already exports to `window`. |
| **Search bar element handles** (`searchForm`, `searchInput`, `searchSelect`) | Lines 55–57 | DOM Handle Bindings | **Retain**: Used by global click and keyboard handlers. |
| **Obsolete Firefox Container comment block** | Lines 61–65 | **Obsolete Comment** | **Candidate for Removal**: 5 lines of empty comment headers. |
| **Promise settlement logger** (`logInitSettled`) | Lines 66–68 | Boot Helper | **Retain**: Error reporter for parallel storage initialization. |
| **Startup Contract header & `initializePage()` orchestrator** | Lines 70–292 | **Core Orchestrator** | **Retain**: Canonical boot coordinator. |
| **Cross-tab storage change handler** (`handleNewTabStorageChange`) | Lines 296–320 | Event Orchestrator | **Retain**: Coordinates wallpaper sync & folder state on storage events. |
| **`DOMContentLoaded` & `window.load` event listeners** | Lines 323–339 | Lifecycle Hooks | **Retain**: Coordinates post-DOM tips and addon link initialization. |
| **Bootstrap invocation** (`initializePage()`) | Line 342 | Boot Trigger | **Retain**: Primary entry point execution. |
| **Dynamic accent color idle dispatch** | Lines 352–356 | Background Dispatch | **Retain**: Background aesthetic setup dispatch. |

---

## 2. Top-Level Boot Sequence Review

### 2.1 Chronological Execution Flow
The sequence in `src/new-tab.js` executes as follows:

```text
1. Immediate Execution (Script evaluation)
   ├── Bind global DOM element references (body, search, tabs)
   ├── Record hbPerfMark('script-start')
   ├── Initialize responsive layout listeners (Dock Navigation)
   ├── Initialize tabs scroll controller (Tabs Scroll)
   └── Register storage dispatcher listener (Storage Dispatcher)

2. initializePage() Invocation
   ├── Record init start marks ('newtab:init-start', 'init:start')
   ├── Set STARTUP_PHASE = 'critical'
   ├── Kick off critical parallel loads:
   │   ├── Wallpaper type preference (Storage)
   │   ├── Settings preferences load (Storage)
   │   ├── Bookmark metadata load (Storage)
   │   └── Last used folder ID load (Storage)
   ├── Await wallpaper type → kick off non-blocking video buffering (waitForWallpaperReady)
   ├── Await parallel loads via Promise.allSettled()
   ├── Load bookmark folder metadata
   ├── Synchronize sub-settings DOM & app settings form
   ├── Wire up UI listeners (Cinema mode, containers, time, dock, visual FX)
   ├── Schedule non-critical poster warmup if !performanceMode
   ├── Wire up bookmark controls (Quick actions, folder picker, root controls)
   ├── Load bookmark tree (HomebaseBookmarkLoader.loadBookmarks)
   ├── Flip ready state (markPageReadyOnce via requestAnimationFrame):
   │   ├── Remove 'preload' class, Add 'ready' class to document.body
   │   ├── Set STARTUP_PHASE = 'ready'
   │   └── Record ready-class performance marks
   ├── Enqueue non-critical daily rotation check (scheduleIdleTask)
   ├── Enqueue widget hydration tasks (HomebaseStartupHydration.scheduleStartupHydrationTasks)
   ├── Initialize DialogController & ContextMenuController
   ├── Setup grid click delegation (BookmarkGridController)
   ├── Initialize drag-and-drop (BookmarkDragController)
   └── Setup paste event listeners (QuickActions)

3. DOMContentLoaded Event
   ├── Record hbPerfMark('dom-content-loaded')
   ├── Render tip of the day (HomebaseTipsUI)
   └── Initialize addon store dock link (DockNavigation)

4. Post-Boot Idle
   └── Schedule dynamic accent color calculation (DynamicAccent)
```

### 2.2 Orchestrator Purity Confirmation
[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) no longer contains:
- No bookmark tree traversal algorithms
- No drag-and-drop raycasting or SortableJS instances
- No wallpaper video blob handling or poster caching
- No search engine parsing or suggestion querying
- No widget fetching, parsing, or rendering (Weather, Quote, News, Todo)
- No idle task queue arrays, maps, or drain loops

**Conclusion:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) is now a **pure startup orchestrator**. It coordinates subsystem bootstrapping without owning subsystem logic.

---

## 3. Dead Code & Legacy Reference Audit

The audit identified three clean-up candidates in `src/new-tab.js`:

### 3.1 Dead Variable: `suggestionAbortController` (Line 35)
- **Code:** `let suggestionAbortController = null; // To cancel old requests`
- **Analysis:** `suggestionAbortController` was historically used for cancelling in-flight search suggestion fetch requests. When the search subsystem was modularized into `src/newtab/search/search-interaction-controller.js`, `suggestionAbortController` was reimplemented as an internal closure variable (`search-interaction-controller.js:21`). The declaration in `new-tab.js` is never read or written anywhere in the repository.
- **Action for Phase 6:** Safe to remove.

### 3.2 Redundant Favicon Delegation Bridge (Lines 38–49)
- **Code:**
  ```javascript
  if (typeof window !== 'undefined' && window.HomebaseFaviconPipeline) {
    window.ensureFaviconObserver =
      window.HomebaseFaviconPipeline.ensureFaviconObserver;
    window.getDomainKeyFromUrl =
      window.HomebaseFaviconPipeline.getDomainKeyFromUrl;
    window.getFaviconUrlForRawUrl =
      window.HomebaseFaviconPipeline.getFaviconUrlForRawUrl;
    window.resolveFaviconForImageTarget =
      window.HomebaseFaviconPipeline.resolveFaviconForImageTarget;
  }
  ```
- **Analysis:** `src/newtab/core/favicon-pipeline.js` (Script #24) already exports `window.ensureFaviconObserver`, `window.getDomainKeyFromUrl`, `window.getFaviconUrlForRawUrl`, and `window.buildFaviconCandidates` directly to `window` (lines 848–851). The bridge in `new-tab.js` is redundant.
- **Action for Phase 6:** `resolveFaviconForImageTarget` can be exported directly by `favicon-pipeline.js:852`, allowing the entire bridge block in `new-tab.js` (-12 lines) to be eliminated cleanly.

### 3.3 Obsolete Comment Header (Lines 61–65)
- **Code:**
  ```javascript
  // ===============================================
  // --- FIREFOX CONTAINER LOGIC ---
  // ===============================================
  // Extracted to firefox-containers.js (openFolderAll)
  ```
- **Analysis:** This comment header contains no code.
- **Action for Phase 6:** Safe to remove (-5 lines).

---

## 4. Dependency Boundary Audit

The remaining dependencies invoked by `src/new-tab.js` were audited to confirm proper canonical ownership:

| Invocations in `new-tab.js` | Canonical Owner Module | Script # | Architectural Justification |
|---|---|:---:|---|
| `HomebaseDockNavigation.setupResponsiveLayoutListener()` | `newtab/core/dock-navigation.js` | #17 | Must register resize listener before initial layout paint. |
| `initTabsScrollController()`, `updateBookmarkTabOverflow()` | `newtab/bookmarks/bookmark-tabs-scroll.js` | #13 | Computes folder tab bar scroll boundaries. |
| `HomebaseSettingsPreferences.initialize()`, `.load()`, `.sync()` | `newtab/settings/settings-preferences.js` | #41 | Core user preferences bootstrap; orchestrator passes promise to parallel boot. |
| `HomebaseBookmarkLoader.loadBookmarkMetadata()`, `.loadFolderMetadata()`, `.loadBookmarks()` | `newtab/bookmarks/bookmark-loader-service.js` | #36 | Bookmark data lifecycle coordinator. |
| `waitForWallpaperReady()` | `newtab/wallpaper/wallpaper-controller.js` | #49 | Kicks off wallpaper buffering without blocking UI. |
| `ensureSubSettingsInner()` | `newtab/settings/sub-settings-ui.js` | #10 | Pre-hydrates settings sub-panels. |
| `setupCinemaModeListeners()` | `newtab/settings/cinema-mode-runtime.js` | #44 | Binds keyboard/fullscreen shortcuts. |
| `setupContainerMode()` | `newtab/integrations/firefox-containers.js` | #61 | Initializes Firefox multi-account container support. |
| `updateTime()` | `newtab/widgets/time.js` | #38 | Initial clock paint and tick interval. |
| `setupDockNavigation()`, `setupLazySettingsButton()` | `newtab/core/dock-navigation.js` | #17 | Binds dock icon clicks and modal triggers. |
| `setupAnimationSettings()`, `setupGlassSettings()` | `newtab/settings/visual-effects-runtime.js` | #42 | Applies CSS custom property tokens. |
| `setupMaterialColorPicker()` | `newtab/settings/material-color-picker.js` | #50 | Color picker DOM setup. |
| `setupSearchEnginesModal()` | `newtab/settings/search-engine-settings.js` | #37 | Search engine configuration modal setup. |
| `setupQuickActions()` | `newtab/bookmarks/quick-actions.js` | #12 | Floating quick actions bar setup. |
| `setupFolderPickerModal()` | `newtab/bookmarks/folder-picker.js` | #14 | Folder migration picker setup. |
| `setupHomebaseRootControls()`, `setupHomebaseRootListeners()` | `newtab/bookmarks/bookmark-root-controller.js` | #34 | Native bookmark event sync listeners. |
| `ensureFaviconObserver()`, `pruneFaviconMetaIfNeeded()` | `newtab/core/favicon-pipeline.js`, `favicon-cache.js` | #23, #24 | Favicon lazy loading and quota management. |
| `HomebaseStartupHydration.scheduleStartupHydrationTasks()` | `newtab/core/startup-hydration.js` | #65 | Enqueues deferred widget setup (Weather, News, Quote, Todo). |
| `HomebaseDialogController.initialize()` | `newtab/core/dialog-controller.js` | #11 | Accessible dialog & focus trapping setup. |
| `HomebaseContextMenuController.initialize()` | `newtab/core/context-menu-controller.js` | #12 | Custom context menu setup with DI callbacks. |
| `HomebaseBookmarkGridController.setupGridClickDelegation()` | `newtab/bookmarks/bookmark-grid-controller.js` | #30 | Virtualized bookmark tile grid delegation. |
| `HomebaseBookmarkDragController.initialize()` | `newtab/bookmarks/bookmark-drag-controller.js` | #31 | SortableJS grid drag & folder hover locking. |
| `setupPasteListener()` | `newtab/bookmarks/quick-actions.js` | #12 | Paste-to-save bookmark handler. |
| `HomebaseStorageDispatcher.initialize()` | `newtab/core/storage-dispatcher.js` | #32 | Cross-tab storage change sync pipeline. |
| `renderTipOfDay()`, `initAddonStoreDockLink()` | `newtab/tips/homebase-tips-ui.js`, `dock-navigation.js` | #5, #17 | Non-critical DOMContentLoaded additions. |
| `updateDynamicAccent()` | `newtab/wallpaper/dynamic-accent.js` | #48 | Non-critical dynamic accent color extractor. |

**Assessment:** All 26 dependency call-sites represent genuine **subsystem bootstrap invocations**. None of them implement subsystem domain logic; they merely tell subsystems *when* to initialize relative to the startup contract.

---

## 5. Static Scanner Safety Rules

The static scanner [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) enforces strict constraints:
1. **Depth-0 Collisions**: Any top-level `const`, `let`, `var`, `function`, or `class` declared in more than one deferred script causes fatal verification failure.
2. **Script Ordering**: `new-tab.js` must remain the **last deferred script** in `src/new-tab.html`.
3. **Safety of Removals**: Removing `suggestionAbortController` from `src/new-tab.js` reduces depth-0 declarations from 867 to 866 and cannot cause collisions.
4. **Safety of Delegation**: Removing the redundant favicon bridge in `new-tab.js` removes window re-assignments without modifying depth-0 lexical declarations.

---

## 6. No Functional Change Rule

Phase 6 is strictly **cleanup, documentation, and architectural polish**:
- **Zero Runtime Behavior Changes**: No changes to bookmark rendering, wallpaper rotation, search interaction, or widget behavior.
- **Zero Timing Changes**: `initializePage()`, ready class toggling, and deferred hydration timings remain unchanged.
- **Zero Storage Schema Changes**: Storage keys, migrations, and structures remain identical.
- **Zero Startup Order Alterations**: Subsystem initialization order within `initializePage()` is strictly preserved.

---

## 7. Expected Outcome & Scope Boundaries

### 7.1 What Will Be Cleaned in Phase 6
1. Remove dead declaration `suggestionAbortController` (-1 line).
2. Clean up redundant favicon bridge in `new-tab.js` (-12 lines) and ensure `favicon-pipeline.js` exports `resolveFaviconForImageTarget` directly (+1 line).
3. Remove obsolete Firefox Container comment block (-5 lines).
4. Remove extraneous blank lines and polish section headers (~-15 lines).
5. Add clean architectural header documenting `new-tab.js` as the **Canonical Startup Orchestrator**.

### 7.2 What Must NOT Be Extracted
- **Do NOT extract `initializePage()`**: This is the top-level orchestrator; moving it would simply create an artificial duplicate orchestrator.
- **Do NOT extract `markPageReadyOnce()`**: Directly controls the new-tab ready class flip.
- **Do NOT extract `handleNewTabStorageChange()`**: Cross-cutting storage event coordinator.
- **Do NOT extract event listeners**: `DOMContentLoaded` and `window.load` belong at top-level.

### 7.3 Quantitative Target
- Baseline: 356 lines
- Projected Phase 6 footprint: **~325 lines**
- Overall Cycle #13 reduction: **~823 lines** (-71.7% from 1,148 lines)

---

## 8. Verification Plan

Post-cleanup verification toolchain:
```powershell
node --check src/new-tab.js src/newtab/core/favicon-pipeline.js
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
git diff src/preload.js src/instant_load.js manifests/ dist/
```

Expected standards:
- 0 syntax errors
- 0 static declaration collisions
- 367/367 tests passing (100%)
- Clean dual builds
- Protected files diff completely empty
