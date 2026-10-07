# Homebase Cycle #11 Phase 5 — Checkpoint 11 Architecture Audit

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 11 — Pre-Planning & Subsystem Architecture Audit  
**Date**: October 3, 2026  
**Status**: Audit Complete — Awaiting Target Selection  

---

## 1. Executive Baseline & Repository State

Following the successful extraction and remote push of **Checkpoint 10** (`5405d18` — Bookmark UI State Controller), the monolith has achieved significant structural clarity:

- **Baseline Monolith Line Count**: **2,321 lines** in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)
  - Down from **3,833 lines** at Phase 5 inception (**-1,512 net lines / -39.4% cumulative reduction**)
- **Remote Synchronization**: `HEAD == origin/development` (`5405d18067a2a8c3a14349c3c7a66f3207b44e77`)
- **Protected Files**: 0 diffs across `src/preload.js`, `src/instant_load.js`, `manifests/`, and `dist/`.
- **Protected Functional Boundaries**: `initializePage()`, startup orchestration, idle scheduler, Sortable.js drag/drop, and wallpaper priming lifecycle remain strictly protected.

```text
git status:
On branch development
Your branch is up to date with 'origin/development'.
Protected files: 0 differences
```

---

## 2. Inventory of Remaining Monolith Sections (`src/new-tab.js`)

| Line Range | Category / Subsystem | Size | Description | Boundary Status |
|---|---|---|---|---|
| **L1–L56** | Core DOM Elements & Pointers | 56 lines | Top-level DOM queries. Contains 16 unused/stale handles whose subsystems have been extracted. | **Eligible for Cleanup** |
| **L57–L355** | Idle Scheduler Engine | 299 lines | `runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`. Core runtime scheduler. | **PROTECTED AREA** |
| **L356–L374** | Bookmark Icon Picker Launcher | 19 lines | `openBookmarkIconPicker`. Lazy-loads icon picker dialog. | Standalone Trigger |
| **L375–L387** | Widget Visibility Helper | 13 lines | `revealWidget`. Low-level DOM class toggler. | Helper |
| **L388–L524** | Wallpaper Priming Lifecycle | 137 lines | `primeWallpaperBackground`, poster fallback, dynamic accent scheduling. | **PROTECTED AREA** |
| **L525–L645** | Bookmark Global State & Menu Wrappers | 121 lines | Top-level bookmark state pointers (`bookmarkTree`, `rootDisplayFolderId`, `activeHomebaseFolderId`, `currentGridFolderNode`) and context menu helper functions. | Inter-module Bridge |
| **L646–L665** | Favicon Pipeline Forwarders | 20 lines | `ensureFaviconObserver`, `getDomainKeyFromUrl`, `getFaviconUrlForRawUrl`. Pass-through wrappers to `HomebaseFaviconPipeline`. | **High-Value Extraction Candidate** |
| **L666–L673** | Bookmark Metadata Storage State | 8 lines | `bookmarkMetadata`, `folderMetadata`, `lastUsedBookmarkFolderId`. | Storage Pointers |
| **L674–L1358** | Sortable.js Grid & Tabs Drag/Drop | 685 lines | `setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`. | **PROTECTED AREA** |
| **L1359–L1364** | Favicon Resolution Forwarder | 6 lines | `resolveFaviconForImageTarget`. Forwarder to `HomebaseFaviconPipeline`. | **High-Value Extraction Candidate** |
| **L1365–L1528** | Bookmark Startup Orchestration | 164 lines | `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks`. | **PROTECTED AREA** (Startup Path) |
| **L1529–L1624** | Performance Mode Compatibility Bridges | 96 lines | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState`. | **Prime Extraction Candidate (Redundant Wrappers)** |
| **L1625–L1691** | Search UI & Interaction Forwarders | 67 lines | `searchForm`, `searchInput`, `searchSelect`, `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`. | **Prime Extraction Candidate** |
| **L1692–L2080** | Page Initialization Orchestration | 389 lines | `initializePage()`, `scheduleStartupHydrationTasks`, widget runner guards. | **PROTECTED AREA** |
| **L2081–L2321** | Event Wiring, Change Listeners & Teardown | 241 lines | Context Menu DI initialization, grid click delegation, storage change listener, DOMContentLoaded lifecycle hooks. | Controller Wiring |

---

## 3. Focus Area 1: Search-Related Ownership Audit

### 3.1 Overview
The search subsystem was previously extracted into two focused modules:
1. [`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) (`window.HomebaseSearchUiController`)
2. [`src/newtab/search/search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) (`window.HomebaseSearchInteractionController`)

Both modules load in `src/new-tab.html` (lines 3367–3368) well before `src/new-tab.js` (line 3407).

### 3.2 Duplicate Forwarders in `src/new-tab.js` (L1635–L1691)

| Function in `new-tab.js` | Implementation Nature | Upstream Controller Target |
|---|---|---|
| `updateSearchUI(engineId, options)` | Pure pass-through | `window.HomebaseSearchUiController.updateSearchUI(engineId, options)` |
| `clearSearchUI(options)` | Pure pass-through | `window.HomebaseSearchUiController.clearSearchUI(options)` |
| `hideSearchResultsPanel()` | Pure pass-through | `window.HomebaseSearchUiController.hideSearchResultsPanel()` |
| `cycleSearchEngine(direction)` | Pure pass-through | `window.HomebaseSearchUiController.cycleSearchEngine(direction)` |
| `setupSearch()` | Compound boot initializer | `HomebaseSearchUiController.initialize()` + `HomebaseSearchInteractionController.initialize({ bindEvents: true })` |
| `setSearchSuggestionsPreference(enabled)` | Pass-through + fallback toggle | `HomebaseSearchInteractionController.setSuggestionsPreference(enabled)` |
| `applySearchEngineConfig(savedConfig)` | Pure pass-through | `HomebaseSearchUiController.applySearchEngineConfig(savedConfig)` |
| `getSafeEnabledSearchEngineId(preferredId)` | Pure pass-through | `HomebaseSearchUiController.getSafeEnabledSearchEngineId(preferredId)` |

### 3.3 Search DOM Handles in `src/new-tab.js` (L1631–L1633)
```javascript
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');
```
These handles are only checked inside `setupSearchSafe` as a startup guard. `HomebaseSearchUiController` and `HomebaseSearchInteractionController` maintain their own internal cached element lookups.

### 3.4 Findings & Opportunities
- `HomebaseSearchUiController` already exposes: `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `applySearchEngineConfig`, and `getSafeEnabledSearchEngineId`.
- `setupSearch()` is an orchestration function that can be exported directly by a composite search controller or bridged via `HomebaseSearchUiController.setupSearch()`.
- Global window bridges (`window.updateSearchUI`, etc.) should be consolidated directly onto the search controllers, permitting the complete elimination of L1630–L1691 from `src/new-tab.js` (-67 lines).

---

## 4. Focus Area 2: Performance-Related Ownership Audit

### 4.1 Overview
The performance subsystem was previously extracted into:  
[`src/newtab/settings/performance-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (`window.HomebasePerformanceController`).

It is registered in `src/new-tab.html` at line 3395 (before `new-tab.js`).

### 4.2 Duplicate Forwarders in `src/new-tab.js` (L1530–L1620)

| Function in `new-tab.js` | Status in `performance-controller.js` | `window` Bridge Already in `performance-controller.js`? |
|---|---|:---:|
| `readFastPerformanceModePreference()` | Fully implemented in controller | **YES** (`window.readFastPerformanceModePreference`) |
| `syncFastPerformanceModeMirror(enabled)` | Fully implemented in controller | **YES** (`window.syncFastPerformanceModeMirror`) |
| `isPerformanceModeEnabled()` | Fully implemented in controller | **YES** (`window.isPerformanceModeEnabled`) |
| `disableGridAnimationRuntime()` | Fully implemented in controller | **YES** (`window.disableGridAnimationRuntime`) |
| `disableGlassRuntime()` | Fully implemented in controller | **YES** (`window.disableGlassRuntime`) |
| `enableGlassRuntimeFromPreference()` | Fully implemented in controller | **YES** (`window.enableGlassRuntimeFromPreference`) |
| `applyPerformanceModeState(enabled)` | Fully implemented in controller | **YES** (`window.applyPerformanceModeState`) |

### 4.3 Redundancy Confirmation
In `src/new-tab.js`:
- `applyPerformanceModeState` is **never called** in `new-tab.js`; it only exists as a wrapper. All callers (`settings-preferences.js`, `settings-ui.js`) call `window.applyPerformanceModeState` or `HomebasePerformanceController.applyPerformanceMode`.
- `isPerformanceModeEnabled()` is only referenced at line 2317 (`if (!isPerformanceModeEnabled()) scheduleIdleTask(...)`), which seamlessly resolves to `window.isPerformanceModeEnabled`.
- `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `disableGridAnimationRuntime`, `disableGlassRuntime`, and `enableGlassRuntimeFromPreference` are only referenced within their own wrapper blocks in `new-tab.js`.

### 4.4 Findings & Opportunities
Lines 1530–1620 in `src/new-tab.js` are **100% redundant boilerplate**. `performance-controller.js` already provides canonical ownership, controller methods, and window bridges. Removing this block eliminates **~96 lines** with zero behavior change and near-zero risk.

---

## 5. Focus Area 3: DOM Handle Cleanup Audit

### 5.1 Top-Level Element Query Inventory (L1–L56)
A systematic audit across all repository files was conducted to cross-reference the 22 DOM element handles declared in `src/new-tab.js`:

| Handle | Source Line in `new-tab.js` | Usages in `new-tab.js` | Usages in Other Files | Status / Subsystem Owner |
|---|:---:|:---:|:---:|---|
| `googleAppsBtn` | L9 | 2 | 4 | In use in `new-tab.js` (L2082 apps dropdown) |
| `googleAppsPanel` | L11 | 2 | 15 | In use in `new-tab.js` (L2082 apps dropdown) |
| `searchWidget` | L15 | 2 | 16 | Only used in startup guard (L1963) |
| `searchResultsPanel` | L17 | 2 | 13 | Only used in startup guard (L1963) |
| `bookmarkResultsContainer` | L19 | **1 (declaration only)** | 6 | **DEAD in `new-tab.js`**. Owned by `search-ui-controller.js`. |
| `suggestionResultsContainer` | L21 | **1 (declaration only)** | 6 | **DEAD in `new-tab.js`**. Owned by `search-ui-controller.js`. |
| `searchAreaWrapper` | L25 | **1 (declaration only)** | 12 | **DEAD in `new-tab.js`**. Owned by search controllers. |
| `bookmarkTabsTrack` | L27 | **1 (declaration only)** | 14 | **DEAD in `new-tab.js`**. Extracted to `bookmark-ui-state.js`. |
| `bookmarkBarWrapper` | L29 | **1 (declaration only)** | 6 | **DEAD in `new-tab.js`**. Extracted to `bookmark-ui-state.js`. |
| `bookmarksGridEl` | L31 | **1 (declaration only)** | 12 | **DEAD in `new-tab.js`**. Extracted to `bookmark-ui-state.js`. |
| `bookmarksEmptyState` | L33 | **1 (declaration only)** | 6 | **DEAD in `new-tab.js`**. Extracted to `bookmark-ui-state.js`. |
| `bookmarksEmptyMessage` | L35 | **1 (declaration only)** | 6 | **DEAD in `new-tab.js`**. Extracted to `bookmark-ui-state.js`. |
| `folderPickerModal` | L37 | **1 (declaration only)** | 10 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerPanel` | L39 | **1 (declaration only)** | 2 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerSearchInput` | L41 | **1 (declaration only)** | 10 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerList` | L43 | **1 (declaration only)** | 9 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerBreadcrumb` | L45 | **1 (declaration only)** | 5 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerConfirmBtn` | L47 | **1 (declaration only)** | 15 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerCancelBtn` | L49 | **1 (declaration only)** | 3 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `folderPickerError` | L51 | **1 (declaration only)** | 9 | **DEAD in `new-tab.js`**. Owned by `folder-picker.js`. |
| `tabScrollLeftBtn` | L53 | 3 | 7 | In use in `new-tab.js` (tabs scroll wiring) |
| `tabScrollRightBtn` | L55 | 3 | 7 | In use in `new-tab.js` (tabs scroll wiring) |

### 5.2 Critical Architectural Finding on `folder-picker.js`
- `folder-picker.js` accesses `folderPickerSearchInput`, `folderPickerConfirmBtn`, `folderPickerError`, etc. directly as global lexical variables without resolving them defensively with `document.getElementById()`.
- Because `folder-picker.js` loads before `new-tab.js`, it currently relies on the top-level `const folderPicker*` declarations evaluated when `new-tab.js` loads.
- **Safety Precaution**: Before removing `folderPicker*` handles from `new-tab.js`, `src/newtab/bookmarks/folder-picker.js` must be updated with defensive element resolvers (or internal queries), following the pattern established in `bookmark-ui-state.js`.

---

## 6. Extraction Candidates Evaluation

### Candidate 1: Performance Mode Compatibility Forwarders Cleanup (Recommended Target for Checkpoint 11)
- **Target Module**: `src/newtab/settings/performance-controller.js` (already existing)
- **Functions to Remove from `new-tab.js`**:
  - `readFastPerformanceModePreference`
  - `syncFastPerformanceModeMirror`
  - `isPerformanceModeEnabled`
  - `disableGridAnimationRuntime`
  - `disableGlassRuntime`
  - `enableGlassRuntimeFromPreference`
  - `applyPerformanceModeState`
- **Dependency Impact**: Zero. `performance-controller.js` already loads before `new-tab.js` and already attaches all 7 functions to `window`.
- **Complexity**: Very Low.
- **Risk Level**: **VERY LOW**. Existing unit test suite (`tests/unit/performance-controller.test.mjs`) already validates all 7 methods.
- **Estimated Monolith Line Reduction**: **-96 lines** (down to ~2,225 lines).

### Candidate 2: Search UI & Interaction Forwarders Consolidation
- **Target Module**: `src/newtab/search/search-ui-controller.js` & `src/newtab/search/search-interaction-controller.js`
- **Functions to Consolidate**:
  - `updateSearchUI`
  - `clearSearchUI`
  - `hideSearchResultsPanel`
  - `cycleSearchEngine`
  - `setupSearch`
  - `setSearchSuggestionsPreference`
  - `applySearchEngineConfig`
  - `getSafeEnabledSearchEngineId`
  - Redundant DOM elements: `searchForm`, `searchInput`, `searchSelect`
- **Dependency Impact**: Low. Ensure `window.*` bridges exist on search controllers before removing from `new-tab.js`.
- **Complexity**: Low.
- **Risk Level**: **LOW**.
- **Estimated Monolith Line Reduction**: **-67 lines** (down to ~2,254 lines).

### Candidate 3: Favicon Pipeline Forwarders Consolidation
- **Target Module**: `src/newtab/core/favicon-pipeline.js`
- **Functions to Consolidate**:
  - `ensureFaviconObserver`
  - `getDomainKeyFromUrl`
  - `getFaviconUrlForRawUrl`
  - `resolveFaviconForImageTarget`
- **Dependency Impact**: Very Low. `favicon-pipeline.js` already provides `ensureObserver`, `getDomainKey`, and `getUrlForRawUrl`. Only needs `resolveForImageTarget` alias exported to `window`.
- **Complexity**: Very Low.
- **Risk Level**: **LOW**.
- **Estimated Monolith Line Reduction**: **-26 lines**.

### Candidate 4: Stale Bookmark & Search DOM Handles Cleanup
- **Target Module**: `src/new-tab.js`
- **Variables to Remove**:
  - `bookmarkResultsContainer`
  - `suggestionResultsContainer`
  - `searchAreaWrapper`
  - `bookmarkTabsTrack`
  - `bookmarkBarWrapper`
  - `bookmarksGridEl`
  - `bookmarksEmptyState`
  - `bookmarksEmptyMessage`
- **Dependency Impact**: Zero. All these elements are now queried dynamically or handled by `bookmark-ui-state.js` and search controllers.
- **Complexity**: Very Low.
- **Risk Level**: **VERY LOW**.
- **Estimated Monolith Line Reduction**: **-16 lines**.

---

## 7. Recommended Plan for Checkpoint 11

### Primary Recommendation: **Candidate 1 — Performance Mode Compatibility Forwarders Cleanup**
1. **Rationale**:
   - `src/newtab/settings/performance-controller.js` was already designed, implemented, and verified to be the single source of truth for all performance and visual runtime adjustments.
   - Lines 1530–1620 of `src/new-tab.js` are pure redundant pass-through forwarders.
   - Removing this block yields an immediate **-96 line reduction** with zero regression risk and zero architectural churn.
2. **Follow-Up (Checkpoint 12+)**:
   - Checkpoint 12: Search UI Forwarders Consolidation (-67 lines)
   - Checkpoint 13: Favicon Pipeline Forwarders & Dead DOM Handles Cleanup (-42 lines)

---

## 8. Verification & Protected Files Confirmation

- **Working Tree**:
  ```text
  On branch development
  Your branch is up to date with 'origin/development'.
  ```
- **Protected Files Integrity**:
  ```text
  git diff origin/development..HEAD src/preload.js src/instant_load.js manifests/ dist/
  (0 differences)
  ```
- **Protected Areas Preservation**:
  `initializePage()`, startup orchestration, idle scheduler, Sortable drag/drop, and wallpaper lifecycle remain completely untouched.

STOP condition reached. No code modified. Awaiting owner review and decision on Checkpoint 11 target.
