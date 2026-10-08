# Cycle #11 Phase 5 Checkpoint 9 Architecture Audit

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 9 — Extraction Candidate Audit & Architecture Evaluation  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Current Monolith**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (2,469 lines)  
**Previous Checkpoint Reference**: [`docs/139-cycle11-phase5-checkpoint8-push-confirmation.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/139-cycle11-phase5-checkpoint8-push-confirmation.md)  

---

## 1. Executive Summary

Following the extraction of **Bookmark Tree Service (Checkpoint 7)** and the resolution of the **Weather Network Error Handling (Checkpoint 8)**, [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) stands at **2,469 lines** (down from its Phase 5 starting size of **3,833 lines**, representing a cumulative reduction of **1,364 lines** / **-35.6%**).

This audit conducts a systematic architectural inspection of all remaining responsibilities in `src/new-tab.js` to identify the **highest-value, lowest-risk extraction target** for Checkpoint 9 while strictly observing all repository constraints and protected subsystem boundaries.

### Primary Audit Finding
1. **Protected Core**: Approximately **1,636 lines** (~66.3%) of `src/new-tab.js` are protected under [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and owner instructions:
   - Sortable.js drag-and-drop subsystem (661 lines: L846–L1506)
   - `initializePage()` & startup orchestration (507 lines: L1858–L2364)
   - Idle task scheduler engine (298 lines: L57–L354)
   - Extension storage change listeners & DOM ready hooks (103 lines: L2368–L2470)
   - Wallpaper priming & startup lifecycle (67 lines: L454–L520)
2. **Unprotected Core**: Approximately **833 lines** (~33.7%) remain eligible for architectural extraction or pruning.
3. **Key Architectural Inversion**: The core dynamic script and stylesheet loading mechanism (`loadScriptOnce`, `loadStylesheetOnce`, `scriptLoadPromises`, `stylesheetLoadPromises`) remains trapped halfway down `src/new-tab.js` (lines 356–420). However, multiple extracted first-party modules (`settings-ui.js`, `bookmark-editor-adapter.js`, `dock-navigation.js`, and `wallpaper-controller.js`) already rely on this utility. Because `src/new-tab.js` is deferred and loads *last*, extracted modules calling dynamic asset loaders rely on an inverted dependency into the legacy monolith.

---

## 2. Current State of `src/new-tab.js`

### 2.1 Code Metrics
- **Total Lines**: 2,469 lines
- **Top-Level Variable Declarations**: 78
- **Top-Level Function Declarations**: 48
- **Explicit Event Listeners**: 6 (tab scroll left/right, throttled pointermove, grid click delegation, DOMContentLoaded, window load)

### 2.2 Structural Inventory by Code Section

| Line Range | Category / Responsibility | Line Count | Status & Risk Assessment |
|---|---|:---:|---|
| **L1–L56** | Core DOM Elements & Pointers | 56 lines | DOM queries for `search-area`, `bookmarks-grid`, tabs, scroll buttons, and legacy modal handles. |
| **L57–L354** | **Idle Task Scheduler Engine** | 298 lines | `runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`. **PROTECTED**. Must not be moved or modified. |
| **L355–L420** | **Dynamic Asset Loader Service** | 66 lines | `loadScriptOnce(src)`, `loadStylesheetOnce(href)`, `scriptLoadPromises`, `stylesheetLoadPromises`. **PRIME CANDIDATE**. |
| **L421–L453** | Icon Picker Bridge & Widget Reveal | 33 lines | `openBookmarkIconPicker(context)`, `revealWidget(selector)`. Asset helper routines. |
| **L454–L520** | **Wallpaper Priming Lifecycle** | 67 lines | `primeWallpaperBackground()` IIFE. **PROTECTED** (wallpaper startup path). |
| **L521–L553** | Dock Navigation & Tab Scroll Wireup | 33 lines | Initialization of `tabsScrollController` and tab scroll buttons. |
| **L584–L706** | Bookmark Globals & Unused Menu Handles | 123 lines | Context menu handles, quick action handles, dragging state flags. Many variables are unreferenced leftovers. |
| **L708–L730** | Favicon Pipeline Forwarders | 23 lines | `ensureFaviconObserver`, `getDomainKeyFromUrl`, `getFaviconUrlForRawUrl`. 1-to-1 forwarders to `window.HomebaseFaviconPipeline`. |
| **L731–L736** | Metadata State Declarations | 6 lines | `bookmarkMetadata`, `folderMetadata`, `lastUsedBookmarkFolderId`. Set in tree/loading routines. |
| **L748–L834** | Bookmark UI Visibility & Boot State | 87 lines | `setChangeFolderButtonVisibility`, `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `hideBookmarksEmptyState`, `beginBookmarksBoot`, `endBookmarksBoot`. |
| **L846–L1506** | **Sortable.js Drag & Drop Subsystem** | 661 lines | `setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`. **PROTECTED**. Must not be modified. |
| **L1507–L1514** | Favicon Image Resolver Forwarder | 8 lines | `resolveFaviconForImageTarget(options)`. Forwarder to `HomebaseFaviconPipeline`. |
| **L1515–L1676** | Bookmark Hydration & Loading Pipeline | 162 lines | `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks`. |
| **L1677–L1772** | Performance Mode Compatibility Bridges | 96 lines | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState`. Forwarders to `HomebasePerformanceController`. |
| **L1773–L1839** | Search UI Legacy Forwarders | 67 lines | `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`. Forwarders to search controllers. |
| **L1849–L1852** | Startup Settled Logger | 4 lines | `logInitSettled(name, result)`. Diagnostic helper. |
| **L1858–L2364** | **Page Startup Orchestration (`initializePage`)** | 507 lines | Main initialization flow, sequential hydration scheduling, startup guards. **PROTECTED**. |
| **L2368–L2470** | **Extension Storage & DOM Lifecycle** | 103 lines | `browser.storage.onChanged` listener, `DOMContentLoaded`, `load` hooks. **PROTECTED**. |

---

## 3. Cross-Module Dependency & Inversion Analysis

### 3.1 Inverted Dependency: Asset Loader
- **Problem**: `loadScriptOnce` and `loadStylesheetOnce` are declared in `src/new-tab.js` (lines 359–419).
- **Consumers**:
  1. [`src/newtab/bookmarks/bookmark-editor-adapter.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js): calls `loadScriptOnce('assets/js/bookmark-editor.js')`
  2. [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js): calls `loadScriptOnce` and `loadStylesheetOnce`
  3. [`src/newtab/settings/settings-ui.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js): calls `loadScriptOnce`
  4. [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js): calls `loadScriptOnce('assets/js/Sortable.min.js')`
  5. [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js): calls `loadScriptOnce('assets/js/icon-picker.js')`
- **Architectural Impact**: Extracted modules in `src/newtab/` execute before `src/new-tab.js`. They expect `loadScriptOnce` and `loadStylesheetOnce` to be available globally on `window`. Because the loader currently lives in the monolith, it violates the clean layering principle where foundational infrastructure services should load early and independently.

### 3.2 Redundant Forwarding Wrappers
- **Search Wrappers (8 functions, 67 lines)**:
  - `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`.
  - These are pure passthrough functions calling `window.HomebaseSearchUiController` and `window.HomebaseSearchInteractionController`.
- **Favicon Wrappers (4 functions, 31 lines)**:
  - `ensureFaviconObserver`, `getDomainKeyFromUrl`, `getFaviconUrlForRawUrl`, `resolveFaviconForImageTarget`.
  - Passthrough functions calling `window.HomebaseFaviconPipeline`.
- **Performance Wrappers (7 functions, 96 lines)**:
  - `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState`.
  - Passthrough functions calling `window.HomebasePerformanceController`.

### 3.3 Dead / Orphaned DOM Handles
Static analysis confirms that several top-level DOM variables declared in `src/new-tab.js` are never referenced again inside `src/new-tab.js` because their owning features have already been extracted:
- `quickAddBookmarkBtn`, `quickAddFolderBtn`, `quickOpenBookmarksBtn` (extracted to `quick-actions.js`)
- `nextWallpaperBtn` (extracted to `wallpaper-controller.js`)
- `mainSettingsBtn`, `appSettingsModal`, `appSettingsNav` (extracted to `settings-ui.js`)
- `folderContextMenu`, `menuEditBtn`, `menuDeleteBtn`, `gridFolderMenu`, `iconContextMenu`, `gridBlankMenu` (extracted to `context-menu-controller.js`)
- `googleAppsBtn`, `googleAppsPanel` (extracted to `app-launcher.js`)

---

## 4. Extraction Candidates Evaluation Matrix

| Metric | Candidate 1: Dynamic Asset Loader Service | Candidate 2: Bookmark UI State Controller | Candidate 3: Search UI Legacy Wrapper Pruning | Candidate 4: Performance Bridge Pruning | Candidate 5: Bookmark Loader & Hydration Pipeline |
|---|:---:|:---:|:---:|:---:|:---:|
| **Target Module** | `src/newtab/core/asset-loader.js` | `src/newtab/bookmarks/bookmark-ui-state.js` | `src/new-tab.js` (Prune) / `search-ui-controller.js` | `src/new-tab.js` (Prune) / `performance-controller.js` | `src/newtab/bookmarks/bookmark-loader-service.js` |
| **Functions** | `loadScriptOnce`, `loadStylesheetOnce` | `setChangeFolderButtonVisibility`, `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `hideBookmarksEmptyState`, `beginBookmarksBoot`, `endBookmarksBoot` | `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId` | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState` | `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks` |
| **Lines Removed** | **~66 lines** | ~87 lines | ~67 lines | ~96 lines | ~162 lines |
| **Complexity** | **Very Low** | Medium | Low | Low-Medium | High |
| **Regression Risk** | **Very Low** | Low-Medium | Low | Low | High |
| **Dependencies** | Pure DOM (`<script>`, `<link>`) | DOM elements (`grid`, `tabs`, `emptyState`) | `HomebaseSearchUiController`, `HomebaseSearchInteractionController` | `HomebasePerformanceController`, wallpaper cleanup callbacks | `HomebaseBookmarkStorage`, `HomebaseBookmarkTreeService`, `HomebaseBookmarkRootController` |
| **Architectural Value** | **High** (Resolves inverted dependency across 4 extracted modules) | Medium (Encapsulates UI transition states) | Low (Removes duplicate shims) | Low (Removes duplicate shims) | High (Isolates startup loading) |
| **Protected Risk?** | **Zero** | Low (Touches boot classes) | Zero | Low (Touches wallpaper cleanup) | **High** (Startup loading sequence) |

---

## 5. Candidate Deep Dive: Candidate 1 — Dynamic Asset Loader Service

### 5.1 Architecture & Responsibility
- **Target File**: `src/newtab/core/asset-loader.js`
- **Controller Global**: `window.HomebaseAssetLoader`
- **Exports**:
  - `loadScriptOnce(src)`: Deduplicated Promise-cached dynamic `<script>` loader.
  - `loadStylesheetOnce(href)`: Deduplicated Promise-cached dynamic `<link rel="stylesheet">` loader.
  - `scriptLoadPromises`: Internal `Map` tracking pending/settled script promises.
  - `stylesheetLoadPromises`: Internal `Map` tracking pending/settled stylesheet promises.
- **Global Bridges**:
  - `window.loadScriptOnce = HomebaseAssetLoader.loadScriptOnce;`
  - `window.loadStylesheetOnce = HomebaseAssetLoader.loadStylesheetOnce;`

### 5.2 Script Loading Position in `src/new-tab.html`
Currently, `src/new-tab.html` loads core utilities early:
```html
<script src="newtab/core/storage-service.js" defer></script>
<script src="newtab/core/asset-loader.js" defer></script> <!-- NEW: Load immediately following storage-service -->
<script src="newtab/core/perf-budget.js" defer></script>
```
Placing `asset-loader.js` early in the `<head>` ensures that any subsequent script requiring dynamic script or stylesheet injection (`settings-ui.js`, `bookmark-editor-adapter.js`, `dock-navigation.js`, etc.) finds `window.loadScriptOnce` and `window.loadStylesheetOnce` already instantiated.

### 5.3 Safety & Verifiability
1. **Zero External Dependencies**: Operates exclusively with standard DOM APIs (`document.createElement`, `document.head.appendChild`).
2. **Zero Interaction with Protected Areas**: Does not touch `initializePage()`, idle scheduler, Sortable drag/drop, wallpaper lifecycle, or protected files.
3. **Automated Test Coverage**: 100% testable via unit tests with mock DOM and browser CDP verification (testing duplicate calls, rejection recovery, and cache tracking).

---

## 6. Recommended Execution Order for Upcoming Checkpoints

Based on complexity, risk, and architectural priority:

1. **Checkpoint 9 (Current Target)**:
   - **Target**: Dynamic Asset Loader Service (`src/newtab/core/asset-loader.js`)
   - **Outcome**: Isolates `loadScriptOnce` and `loadStylesheetOnce`, solves the cross-module inverted dependency, establishes `window.HomebaseAssetLoader`. Net reduction: ~66 lines.
2. **Checkpoint 10**:
   - **Target**: Bookmark UI State & Visibility Controller (`src/newtab/bookmarks/bookmark-ui-state.js`)
   - **Outcome**: Isolates container visibility, booting classes, and empty state management. Net reduction: ~87 lines.
3. **Checkpoint 11**:
   - **Target**: Search & Performance Compatibility Bridge Pruning & Clean Up
   - **Outcome**: Cleans up 15 redundant forwarder functions and dead DOM handles across search and performance controllers. Net reduction: ~163 lines.
4. **Checkpoint 12**:
   - **Target**: Bookmark Loader & Subtree Orchestration Service (`src/newtab/bookmarks/bookmark-loader-service.js`)
   - **Outcome**: Extracts `loadBookmarks` and metadata loaders into a dedicated subsystem service. Net reduction: ~162 lines.

---

## 7. Protected Guardrails Confirmation

In strict adherence to [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` will remain completely untouched.
- **Sortable.js Drag & Drop**: Grid drag-and-drop (`setupGridSortable`, `handleGridMove`, `handleGridDrop`) and tab drag-and-drop (`setupTabsSortable`, `handleTabDrop`) will NOT be touched.
- **Startup Orchestration**: `initializePage()`, `scheduleStartupHydrationTasks()`, and startup guards remain in `src/new-tab.js`.
- **Idle Scheduler**: `processIdleTasks()`, `scheduleIdleTask()`, `scheduleIdleChunkedTask()` will NOT be touched.
- **Wallpaper Lifecycle**: `primeWallpaperBackground()` and video playback remain untouched.

---

## 8. Conclusion & Stop Condition

**Stop Condition Reached**:
- Audit document completed.
- No source files have been modified.
- No commits have been made.
- Stopping here to await owner review and approval before proceeding to the Checkpoint 9 implementation plan.
