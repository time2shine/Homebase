# Cycle #11 Phase 5 Checkpoint 10 Architecture Audit

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 10 — Architecture Audit & Candidate Selection  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Current Monolith**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (2,404 lines)  
**Baseline Git State**: `HEAD == origin/development` at commit `e88d066`  
**Previous Reference**: [`docs/147-cycle11-phase5-documentation-archive-push-confirmation.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/147-cycle11-phase5-documentation-archive-push-confirmation.md)  

---

## 1. Executive Summary

Following the extraction of **Asset Loader Service (Checkpoint 9)** and the consolidation of the **Documentation Archive (Commit `e88d066`)**, [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) stands at **2,404 lines** (reduced from its starting size of **3,833 lines**, representing a cumulative net reduction of **1,429 lines** / **-37.3%**).

The working tree is completely clean and synchronized with `origin/development`.

This audit conducts a thorough architectural inspection of all remaining responsibilities, state containers, and functional clusters inside `src/new-tab.js` to identify the **highest-value next extraction target** for Checkpoint 10 while strictly preserving all protected subsystems.

---

## 2. Structural Analysis of Remaining Responsibilities in `src/new-tab.js`

### 2.1 Code Metrics
- **Current Line Count**: 2,404 lines
- **Top-Level Variable Declarations**: 76
- **Top-Level Function Declarations**: 46
- **Explicit Event Listeners**: 6

### 2.2 Functional Groupings & Protected vs. Unprotected Breakdown

| Line Range | Category / Responsibility | Line Count | Status & Protection Scope |
|---|---|:---:|---|
| **L1–L56** | Core DOM Element Handles | 56 lines | Top-level DOM queries (`search-area`, `bookmarks-grid`, tabs, scroll buttons). Low risk, tightly coupled to startup. |
| **L57–L354** | **Idle Task Scheduler Engine** | 298 lines | `runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`. **PROTECTED**. Must not be modified or moved. |
| **L355–L388** | Asset Helpers & Widget Reveal | 34 lines | `openBookmarkIconPicker`, `revealWidget`. Low complexity. |
| **L389–L453** | **Wallpaper Startup Priming Lifecycle** | 65 lines | `primeWallpaperBackground()` IIFE. **PROTECTED** (wallpaper startup path). |
| **L454–L480** | Dock Navigation & Tab Scroll Wireup | 27 lines | `tabsScrollController` initialization and tab scroll arrow event listeners. |
| **L481–L645** | Bookmark Drag State & Context Menu Handles | 165 lines | Drag tracking state, hover targets, orphaned context menu handles, and quick action handles. |
| **L646–L665** | Favicon Runtime Forwarders | 20 lines | `ensureFaviconObserver`, `getDomainKeyFromUrl`, `getFaviconUrlForRawUrl`. 1-to-1 forwarders to `window.HomebaseFaviconPipeline`. |
| **L666–L675** | Metadata State Containers | 10 lines | `bookmarkMetadata`, `folderMetadata`, `lastUsedBookmarkFolderId`. |
| **L683–L770** | **Bookmark UI State & Visibility Controller** | 88 lines | `setChangeFolderButtonVisibility`, `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `hideBookmarksEmptyState`, `beginBookmarksBoot`, `endBookmarksBoot`. **RECOMMENDED CP10 TARGET**. |
| **L781–L1441** | **Sortable.js Drag & Drop Subsystem** | 661 lines | `setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`. **PROTECTED**. Must not be modified. |
| **L1442–L1449** | Favicon Image Resolver Forwarder | 8 lines | `resolveFaviconForImageTarget(options)`. 1-to-1 forwarder to `HomebaseFaviconPipeline`. |
| **L1450–L1615** | Bookmark Hydration & Loading Pipeline | 166 lines | `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks`. Orchestration pipeline. |
| **L1616–L1710** | Performance Mode Compatibility Bridges | 95 lines | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState`. Forwarders to `HomebasePerformanceController`. |
| **L1711–L1783** | Search UI Legacy Forwarders | 73 lines | `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`. Forwarders to search controllers. |
| **L1784–L2302** | **Page Startup Orchestration (`initializePage`)** | 519 lines | Sequential startup hydration, component initialization, startup performance guards. **PROTECTED**. |
| **L2303–L2404** | **Extension Storage Changes & DOM Lifecycle** | 102 lines | `browser.storage.onChanged` listener, `DOMContentLoaded`, `load` hooks. **PROTECTED**. |

### 2.3 Protection Metric
- **Explicitly Protected Code**: **1,625 lines** (~67.6% of `src/new-tab.js`)
  - Sortable.js drag & drop: 661 lines
  - `initializePage()` & startup orchestration: 519 lines
  - Idle task scheduler engine: 298 lines
  - Storage change listeners & lifecycle hooks: 102 lines
  - Wallpaper priming lifecycle: 65 lines
- **Unprotected Extraction / Pruning Scope**: **779 lines** (~32.4% of `src/new-tab.js`)

---

## 3. Review of Existing Extracted Modules & Ownership Boundaries

| Module | Canonical Object | Source File | Confirmed Ownership Boundary |
|---|---|---|---|
| **Settings Preferences** | `window.HomebaseSettingsPreferences` | `src/newtab/settings/settings-preferences.js` | Authoritative state for settings preferences (`fastPerformanceMode`, `glassStyle`, `gridAnimation`, `showSidebar`, `widgetOrder`). Owns storage syncing and event broadcasting. |
| **Bookmark Root Controller** | `window.HomebaseBookmarkRootController` | `src/newtab/bookmarks/bookmark-root-controller.js` | Resolves root folder ID, auto-detects "Homebase" under "Other Bookmarks", caches resolved subtree, and handles root switching. |
| **Bookmark Action Controller** | `window.HomebaseBookmarkActionController` | `src/newtab/bookmarks/bookmark-action-controller.js` | Executes CRUD operations on bookmarks (create link, create folder, edit, delete, batch open, container tabs dispatch). |
| **Bookmark Tree Service** | `window.HomebaseBookmarkTreeService` | `src/newtab/bookmarks/bookmark-tree-service.js` | Owns canonical in-memory bookmark tree state (`serviceState.tree`), promise deduplication, recursive node querying (`findBookmarkNodeById`), in-memory node updates (`updateNodeInTree`), and hierarchy validation. |
| **Asset Loader Service** | `window.HomebaseAssetLoader` | `src/newtab/core/asset-loader.js` | Owns dynamic `<script>` and `<link rel="stylesheet">` loading with Promise deduplication and failure recovery. |
| **Bookmark Grid Controller** | `window.HomebaseBookmarkGridController` | `src/newtab/bookmarks/bookmark-grid-controller.js` | Owns virtualized tile rendering, folder tab generation, icon resolution, card DOM updates, and grid layout animation. |
| **Context Menu Controller** | `window.HomebaseContextMenuController` | `src/newtab/core/context-menu-controller.js` | Owns context menu positioning, viewport edge clamping, dismissal, and action dispatch across tiles and folder tabs. |
| **Weather Module** | `window.HomebaseWeather` / `window` | `src/newtab/widgets/weather.js` | Owns weather API polling, resilient error classification (`isWeatherNetworkError`, `isWeatherAbortError`), offline caching, and widget DOM rendering. |

---

## 4. Cross-Module Dependency & Architectural Gaps

1. **Cross-Module Dependency on Bookmark UI State**:
   - `src/newtab/bookmarks/bookmark-root-controller.js` currently calls `beginBookmarksBoot()`, `endBookmarksBoot()`, and `showBookmarksEmptyState()`.
   - Because these functions currently live in `src/new-tab.js` (which evaluates after `bookmark-root-controller.js`), `bookmark-root-controller.js` must depend on late runtime global lookups.
   - Isolating these 7 functions into `src/newtab/bookmarks/bookmark-ui-state.js` that evaluates *before* `bookmark-root-controller.js` eliminates this cross-module coupling.
2. **Redundant Pass-Through Forwarders**:
   - 8 Search forwarders (L1711–L1783, 73 lines) simply delegate to `window.HomebaseSearchUiController` and `window.HomebaseSearchInteractionController`.
   - 4 Favicon forwarders (28 lines total) simply delegate to `window.HomebaseFaviconPipeline`.
   - 7 Performance mode forwarders (L1616–L1710, 95 lines) simply delegate to `window.HomebasePerformanceController`.
3. **Orphaned Context Menu and Quick Action Declarations**:
   - 15 DOM element handles (L571–L633, ~62 lines) are declared at top level in `src/new-tab.js` but never used anywhere inside `src/new-tab.js` because their features have already been extracted to `quick-actions.js`, `context-menu-controller.js`, and `settings-ui.js`.

---

## 5. Candidate Extraction Matrix for Checkpoint 10

| Metric | Candidate A: Bookmark UI State Controller | Candidate B: Search UI Forwarder Pruning | Candidate C: Performance Bridge Pruning | Candidate D: Orphaned DOM Handles Cleanup | Candidate E: Bookmark Loader Pipeline |
|---|:---:|:---:|:---:|:---:|:---:|
| **Target Module** | `src/newtab/bookmarks/bookmark-ui-state.js` | `src/new-tab.js` (Prune) | `src/new-tab.js` (Prune) | `src/new-tab.js` (Prune) | `src/newtab/bookmarks/bookmark-loader-service.js` |
| **Functions / Scope** | `setChangeFolderButtonVisibility`, `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `hideBookmarksEmptyState`, `beginBookmarksBoot`, `endBookmarksBoot` | `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId` | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState` | `quickAddBookmarkBtn`, `folderContextMenu`, `gridFolderMenu`, `gridMenuCreateBookmarkBtn`, etc. (15 variables) | `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks` |
| **Estimated Net Lines** | **~88 lines** | ~73 lines | ~95 lines | ~62 lines | ~166 lines |
| **Complexity** | **Low-Medium** | Low | Low-Medium | Very Low | High |
| **Regression Risk** | **Low-Medium** | Low | Low-Medium | Very Low | High |
| **Architectural Value** | **VERY HIGH** (completes bookmark UI layer; unblocks CP12 loader extraction) | Medium (reduces boilerplate) | Medium (reduces boilerplate) | Low (dead code cleanup) | Very High (monolith core reduction) |
| **Protected Area Risk** | **Zero** | Zero | Low (video cleanup touches wallpaper elements) | Zero | High (touches startup loading path) |

---

## 6. Recommended Target for Checkpoint 10: Bookmark UI State Controller

### 6.1 Rationale
1. **Logical Progression of Phase 5**:
   - Checkpoint 5 extracted root folder resolution (`bookmark-root-controller.js`).
   - Checkpoint 6 extracted bookmark mutations and actions (`bookmark-action-controller.js`).
   - Checkpoint 7 extracted tree models and hierarchy (`bookmark-tree-service.js`).
   - **Checkpoint 10 cleanly extracts the UI State & Visibility Layer (`bookmark-ui-state.js`)**.
2. **Prerequisite for Checkpoint 12 (Bookmark Loader Service)**:
   Extracting `loadBookmarks()` in a future checkpoint requires clean, established interfaces for toggling container visibility (`showBookmarksUI`, `hideBookmarksUI`), displaying empty messages (`showBookmarksEmptyState`), and setting boot classes (`beginBookmarksBoot`, `endBookmarksBoot`). Extracting `bookmark-ui-state.js` first establishes this clean dependency.
3. **Cross-Module Decoupling**:
   `src/newtab/bookmarks/bookmark-root-controller.js` already calls `beginBookmarksBoot()`, `endBookmarksBoot()`, and `showBookmarksEmptyState()`. Moving these routines to `src/newtab/bookmarks/bookmark-ui-state.js` (loaded immediately before `bookmark-root-controller.js` in `src/new-tab.html`) provides authoritative ownership.
4. **Clean Boundary**:
   Completely avoids touching Sortable drag/drop, idle scheduler, or `initializePage()`.

### 6.2 Proposed Specification for `bookmark-ui-state.js`
- **Path**: `src/newtab/bookmarks/bookmark-ui-state.js`
- **Controller Object**: `window.HomebaseBookmarkUiState`
- **Functions to Migrate**:
  - `setChangeFolderButtonVisibility(visible)`
  - `hideBookmarksUI()`
  - `showBookmarksUI(rootFolderId)`
  - `showBookmarksEmptyState(message)`
  - `hideBookmarksEmptyState()`
  - `beginBookmarksBoot()`
  - `endBookmarksBoot()`
- **Backward-Compatibility Bridges**:
  Preserve `window.setChangeFolderButtonVisibility`, `window.hideBookmarksUI`, `window.showBookmarksUI`, `window.showBookmarksEmptyState`, `window.hideBookmarksEmptyState`, `window.beginBookmarksBoot`, and `window.endBookmarksBoot`.

---

## 7. Protected Guardrails & Invariants

In strict compliance with [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` will remain 100% untouched.
- **Sortable.js Drag & Drop**: Grid and tab drag handlers (`setupGridSortable`, `handleGridMove`, `handleGridDrop`, etc.) will NOT be touched.
- **Startup Orchestration**: `initializePage()`, `scheduleStartupHydrationTasks()`, and startup guards remain in `src/new-tab.js`.
- **Idle Scheduler**: `processIdleTasks()`, `scheduleIdleTask()`, `scheduleIdleChunkedTask()` will NOT be touched.
- **Wallpaper Lifecycle**: `primeWallpaperBackground()` and video playback remain untouched.

---

## 8. Conclusion & Stop Condition

**Stop Condition Reached**:
- Audit document completed.
- No source files have been modified.
- No commits have been made.
- Stopping here to await owner review and approval before creating the Checkpoint 10 implementation plan.
