# Homebase Cycle #11 Phase 5 — Checkpoint 13 Architecture Audit

**Subsystem**: Architecture Audit & Monolith Decomposition Planning  
**Target File**: `src/new-tab.js`  
**Current State**: 2,017 lines (reduced from 2,168 at start of Checkpoint 12)  
**Status**: Audit Only (NO code modifications, NO commit, NO push)

---

## 1. Executive Summary

Following the successful completions of Checkpoint 10 (Bookmark UI State), Checkpoint 11 (Performance, Search, and Favicon Bridge cleanups), and Checkpoint 12 (Context Menu dead code cleanup and Bookmark Loader Service extraction), `src/new-tab.js` has been reduced to **2,017 lines** containing **22 functions**.

This audit analyzes the remaining responsibilities in `src/new-tab.js`, identifies stale/dead DOM declarations and forwarders, examines candidate extractions, and maps duplicate or overlapping ownership across the codebase.

---

## 2. Current Metrics & Function Inventory

### 2.1 File Metric
* **Current Line Count**: `2,017 lines`

### 2.2 Remaining Functions in `src/new-tab.js` (22 Total)

| # | Line | Function Name | Role / Subsystem | Risk Category |
|---|---|---|---|---|
| 1 | 91 | `processIdleTasks` | Idle Task Scheduler | **PROTECTED / HIGH RISK** |
| 2 | 216 | `scheduleIdleTask` | Idle Task Scheduler | **PROTECTED / HIGH RISK** |
| 3 | 262 | `scheduleIdleChunkedTask` | Idle Task Scheduler | **PROTECTED / HIGH RISK** |
| 4 | 356 | `openBookmarkIconPicker` | Bookmark Icon Picker Modal | **LOW RISK** |
| 5 | 375 | `revealWidget` | Widget UI Transition Helper | **LOW RISK** |
| 6 | 644 | `setupGridSortable` | Bookmarks Grid Drag-and-Drop | **HIGH RISK** |
| 7 | 740 | `handleGridMove` | Bookmarks Grid Drag-and-Drop | **HIGH RISK** |
| 8 | 840 | `handleGridDragPointerMove` | Bookmarks Grid Drag-and-Drop | **HIGH RISK** |
| 9 | 912 | `clearTabDropHighlight` | Bookmarks Tab Drop Target | **HIGH RISK** |
| 10 | 932 | `moveItemInLocalTree` | Bookmark Tree Local Mutation | **HIGH RISK** |
| 11 | 949 | `handleGridDrop` | Bookmarks Grid Drop Handler | **HIGH RISK** |
| 12 | 1089 | `setupTabsSortable` | Folder Tabs Drag-and-Drop | **HIGH RISK** |
| 13 | 1177 | `handleTabDrop` | Folder Tabs Drop Handler | **HIGH RISK** |
| 14 | 1304 | `processBookmarks` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 15 | 1313 | `loadBookmarkMetadata` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 16 | 1321 | `loadLastUsedFolderId` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 17 | 1329 | `setLastUsedFolderId` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 18 | 1336 | `loadFolderMetadata` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 19 | 1344 | `loadBookmarks` | Backward Compatibility Bridge | **LOW RISK (BRIDGE)** |
| 20 | 1395 | `setupSearch` | Search Setup Wrapper | **LOW / MEDIUM RISK** |
| 21 | 1413 | `logInitSettled` | Startup Logging Helper | **LOW RISK** |
| 22 | 1428 | `initializePage` | Startup Orchestrator & Lifecycle | **PROTECTED / HIGH RISK** |

---

## 3. Protected Areas & Architectural Constraints

Per `AGENTS.md` and repository continuity rules, the following subsystems MUST NOT be altered without explicit, isolated instructions:
1. **Startup Orchestration & `initializePage()`** (lines 1428–1912)
2. **Idle Task Scheduler** (`runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, lines 57–354)
3. **Sortable Drag-and-Drop Handlers** (`setupGridSortable`, `handleGridMove`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`, lines 636–1297)
4. **Wallpaper Lifecycle & Startup Path** (`primeWallpaperBackground`, lines 389–453)
5. **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`

---

## 4. Extracted Module Ownership Map

The extracted modules under `src/newtab/` now own the canonical implementations:

| Subsystem | Canonical Module | Window API Export | Status in `src/new-tab.js` |
|---|---|---|---|
| **Bookmark Loader** | `src/newtab/bookmarks/bookmark-loader-service.js` | `window.HomebaseBookmarkLoader` | Lightweight compatibility bridges (L1299–L1363) |
| **Bookmark Tree** | `src/newtab/bookmarks/bookmark-tree-service.js` | `window.HomebaseBookmarkTreeService` | Delegated; bridges removed |
| **Bookmark UI State** | `src/newtab/bookmarks/bookmark-ui-state.js` | `window.HomebaseBookmarkUiState` | Delegated; empty states & boot markers managed |
| **Bookmark Root** | `src/newtab/bookmarks/bookmark-root-controller.js` | `window.HomebaseBookmarkRootController` | Delegated |
| **Bookmark Grid** | `src/newtab/bookmarks/bookmark-grid-controller.js` | `window.HomebaseBookmarkGridController` | Delegated |
| **Search UI** | `src/newtab/search/search-ui-controller.js` | `window.HomebaseSearchUiController` | Forwarder bridges preserved (L1374–L1393) |
| **Search Interaction** | `src/newtab/search/search-interaction-controller.js` | `window.HomebaseSearchInteractionController` | Forwarder bridge preserved |
| **Favicon Pipeline** | `src/newtab/core/favicon-pipeline.js` | `window.HomebaseFaviconPipeline` | Forwarder bridges preserved (L601–L610) |
| **Context Menus** | `src/newtab/core/context-menu-controller.js` | `window.HomebaseContextMenuController` | Dead DOM handles removed in 12-A; initialized in `initializePage` |
| **Settings Prefs** | `src/newtab/settings/settings-preferences.js` | `window.HomebaseSettingsPreferences` | Initialized in `initializePage` |
| **Dock Navigation** | `src/newtab/core/dock-navigation.js` | `window.HomebaseDockNavigation` | Initialized in `initializePage` |
| **Folder Picker** | `src/newtab/bookmarks/folder-picker.js` | Window functions | Unencapsulated handles linger in `new-tab.js` (L37–L51) |
| **Tab Strip Scroll** | `src/newtab/bookmarks/bookmark-tabs-scroll.js` | `initTabsScrollController` | Manual listeners linger in `new-tab.js` (L461–L477) |

---

## 5. Audit of Remaining Areas & Leftovers in `src/new-tab.js`

### 5.1 Stale / Unused DOM Declarations in `src/new-tab.js`

A systematic cross-check of top-level DOM constants revealed 19 declarations in `src/new-tab.js` that are either:
1. **Completely unreferenced** inside `src/new-tab.js`, or
2. Solely consumed by external extracted modules that already have defensive fallbacks.

| Constant in `src/new-tab.js` | Lines | Usage in `src/new-tab.js` | Actual Consumer | Analysis & Cleanup Recommendation |
|---|---|---|---|---|
| `folderPickerModal` | L37 | None | `folder-picker.js:166,216,316` | **STALE DOM HANDLE**. `folder-picker.js` can query `document.getElementById('folder-picker-modal')` directly or encapsulate in `HomebaseFolderPicker`. |
| `folderPickerPanel` | L39 | None | `folder-picker.js:216` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerSearchInput` | L41 | None | `folder-picker.js:203,303` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerList` | L43 | None | `folder-picker.js:77,210` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerBreadcrumb` | L45 | None | `folder-picker.js:137,208` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerConfirmBtn` | L47 | None | `folder-picker.js:308` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerCancelBtn` | L49 | None | `folder-picker.js:312` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `folderPickerError` | L51 | None | `folder-picker.js:44` | **STALE DOM HANDLE**. Can be queried directly in `folder-picker.js`. |
| `bookmarkResultsContainer` | L19 | None | `search-interaction-controller.js:61` | **STALE DOM HANDLE**. `search-interaction-controller.js` already includes fallback `document.getElementById('bookmark-results-container')`. |
| `suggestionResultsContainer` | L21 | None | `search-interaction-controller.js:67` | **STALE DOM HANDLE**. `search-interaction-controller.js` already includes fallback `document.getElementById('suggestion-results-container')`. |
| `searchAreaWrapper` | L25 | None | `search-ui-controller.js:447,484`, `search-interaction-controller.js:79` | **STALE DOM HANDLE**. Both search controllers already declare or query `document.querySelector('.search-area-wrapper')`. |
| `bookmarkBarWrapper` | L29 | None | `bookmark-ui-state.js:12` | **STALE DOM HANDLE**. `bookmark-ui-state.js` already falls back to `document.querySelector('.bookmark-bar-wrapper')`. |
| `bookmarksGridEl` | L31 | None | `search-interaction-controller.js:327`, `bookmark-ui-state.js:19` | **STALE DOM HANDLE**. Both modules already fall back to `document.getElementById('bookmarks-grid')`. |
| `bookmarksEmptyState` | L33 | None | `bookmark-ui-state.js:26` | **STALE DOM HANDLE**. `bookmark-ui-state.js` already falls back to `document.getElementById('bookmarks-empty-state')`. |
| `bookmarksEmptyMessage` | L35 | None | `bookmark-ui-state.js:33` | **STALE DOM HANDLE**. `bookmark-ui-state.js` already falls back to `document.getElementById('bookmarks-empty-message')`. |
| `nextWallpaperBtn` | L581 | None | `wallpaper-controller.js:389`, `dock-navigation.js:104` | **STALE DOM HANDLE**. `wallpaper-controller.js` queries its own handle; `dock-navigation.js` can query directly. |
| `mainSettingsBtn` | L583 | None | `dock-navigation.js:48`, `settings-ui.js:1216` | **STALE DOM HANDLE**. Both modules can query `document.getElementById('main-settings-btn')` directly. |
| `appSettingsModal` | L585 | None | `settings-ui.js:1190,1216,1231` | **STALE DOM HANDLE**. `settings-ui.js` can query directly. |
| `appSettingsNav` | L587 | None | `settings-ui.js:1012,1251` | **STALE DOM HANDLE**. `settings-ui.js` can query directly. |

### 5.2 Widget & Icon Picker Utility Logic
- **`revealWidget(selector)`** (L375–L385, 11 lines): Called by `weather.js`, `todo.js`, `time.js`, `quote.js`, `news.js`, and `search-ui-controller.js`. Belongs logically in `src/newtab/widgets/widget-visibility.js` (which already controls widget visibility).
- **`openBookmarkIconPicker(context)`** (L356–L373, 18 lines): Only called by `src/newtab/bookmarks/bookmark-editor-adapter.js:150`. Belongs logically in `bookmark-editor-adapter.js` or `folder-picker.js`.

### 5.3 Tab Scroll Listener Logic
- Lines 461–477:
  ```javascript
  tabsScrollController = initTabsScrollController();
  updateBookmarkTabOverflow();
  if (tabScrollLeftBtn) {
    tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));
  }
  if (tabScrollRightBtn) {
    tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));
  }
  ```
  These listeners can be wired internally inside `initTabsScrollController()` in `src/newtab/bookmarks/bookmark-tabs-scroll.js`, removing another 17 lines from `src/new-tab.js`.

### 5.4 Drag-and-Drop Sortable Pipeline (661 Lines)
- Lines 636–1297 contain the entire drag-and-drop sortable pipeline (`setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`).
- This is the single largest remaining chunk in `src/new-tab.js` (~33% of the entire file).
- Identified as **High Risk** because drag-and-drop state interacts with Firefox containers, grid repainting, and local bookmark tree mutation.

---

## 6. Candidate Extraction Table & Risk Rankings

| Candidate | Target Module | Estimated Lines Saved | Risk | Recommendation |
|---|---|---|---|---|
| **1. Stale DOM Handle Cleanup (Phase 1)** | `src/new-tab.js` (Removal) + fallback checks | **~35 lines** | **LOW** | **Recommended for Checkpoint 13-A**. Clean up unused `folderPicker*` (8), `bookmarkResultsContainer`, `suggestionResultsContainer`, `searchAreaWrapper`, `bookmarkBarWrapper`, `bookmarksGridEl`, `bookmarksEmptyState`, `bookmarksEmptyMessage`, `nextWallpaperBtn`, `mainSettingsBtn`, `appSettingsModal`, `appSettingsNav`. Eliminates 19 global declarations. |
| **2. Widget Utility Extraction (`revealWidget`)** | `src/newtab/widgets/widget-visibility.js` | **11 lines** | **LOW** | **Recommended for Checkpoint 13-B**. Move `revealWidget` to `widget-visibility.js` where widgets are registered; retain `window.revealWidget` bridge. |
| **3. Icon Picker Helper Extraction (`openBookmarkIconPicker`)** | `src/newtab/bookmarks/bookmark-editor-adapter.js` | **18 lines** | **LOW** | **Recommended for Checkpoint 13-B**. Move into editor adapter; retain `window.openBookmarkIconPicker` bridge. |
| **4. Tab Scroll Click Listener Encapsulation** | `src/newtab/bookmarks/bookmark-tabs-scroll.js` | **17 lines** | **LOW** | **Recommended for Checkpoint 13-C**. Wire button click listeners inside `initTabsScrollController()`. |
| **5. Search Setup Consolidation (`setupSearch`)** | `src/newtab/search/search-ui-controller.js` | **34 lines** | **MEDIUM** | Move `setupSearch()` and bridge definitions into `HomebaseSearchUiController.setupSearch()`. |
| **6. Folder Picker Controller Encapsulation** | `src/newtab/bookmarks/folder-picker.js` | **25 lines** | **MEDIUM** | Formalize `window.HomebaseFolderPicker = { initialize, open, close }`. |
| **7. Storage Listener Event Dispatcher** | `src/newtab/core/storage-dispatcher.js` | **66 lines** | **MEDIUM** | Extract `browser.storage.onChanged` listener (L1916–L1981) into dedicated storage dispatcher. |
| **8. Bookmark Sortable Drag/Drop Extraction** | `src/newtab/bookmarks/bookmark-dnd-controller.js` | **661 lines** | **HIGH** | Requires dedicated cycle/phase plan with manual drag testing across Chrome & Firefox. |
| **9. Startup Hydration Orchestrator Extraction** | `src/newtab/core/startup-hydration.js` | **240 lines** | **HIGH** | Requires isolated startup perf profiling and regression testing. |

---

## 7. Recommended Next Step (Checkpoint 13 Execution Plan)

### Checkpoint 13-A: Stale DOM Handles Cleanup (Low Risk)
Remove 19 unreferenced / redundant DOM constants from `src/new-tab.js`:
- 8 `folderPicker*` constants (guarded inside `folder-picker.js`)
- 3 search container constants (`bookmarkResultsContainer`, `suggestionResultsContainer`, `searchAreaWrapper`)
- 4 bookmark wrapper/state constants (`bookmarkBarWrapper`, `bookmarksGridEl`, `bookmarksEmptyState`, `bookmarksEmptyMessage`)
- 4 dock & settings constants (`nextWallpaperBtn`, `mainSettingsBtn`, `appSettingsModal`, `appSettingsNav`)
- **Impact**: Reduces ~35 lines, eliminates 19 top-level declarations, zero runtime impact.

### Checkpoint 13-B: Utility Extraction (Low Risk)
- Move `revealWidget` to `src/newtab/widgets/widget-visibility.js`
- Move `openBookmarkIconPicker` to `src/newtab/bookmarks/bookmark-editor-adapter.js`
- **Impact**: Reduces ~29 lines, removes 2 top-level functions from `src/new-tab.js`.

---

## 8. Safety & Verification Status

```powershell
git status
```
* **Status**: `On branch development. Your branch is up to date with 'origin/development'.`
* **Untracked**: Documentation reports only.

```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
```
* **Status**: Clean `0 diff`. No source files modified during this audit.
