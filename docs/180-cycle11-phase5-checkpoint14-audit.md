# Homebase Cycle #11 Phase 5 — Checkpoint 14 Architecture Audit

**Phase**: Cycle #11 Phase 5  
**Checkpoint**: 14 (Architecture & Extraction Opportunities Audit)  
**Status**: Audit Completed (No files modified, no commits created, STOPPED per instructions)

---

## 1. Current `src/new-tab.js` Metrics

Following the completion of Checkpoints 10 through 13-C, `src/new-tab.js` has broken through multiple milestones:

| Metric | Checkpoint 10 Baseline | After Checkpoint 13-C | Net Reduction |
|---|---|---|---|
| **Total Lines** | 2,336 lines | **1,937 lines** | **-399 lines** (-17.08%) |
| **Top-Level Functions** | 35 | **20** | **-15 functions** |
| **Deferred Script Count** | 60 | **61** | +1 script (`bookmark-loader-service.js`) |
| **Cross-Script Declarations** | 924 | **914 unique declarations** | 0 collisions verified |
| **Unit Test Coverage** | 343 passing | **350 passing** (4/4 stages) | 100% pass |

---

## 2. Structural Breakdown of Remaining `src/new-tab.js`

| Section / Responsibility | Line Range | Line Count | Classification & Risk Level |
|---|---|---|---|
| **Top-Level DOM Handles & Helpers** | L1–36 | 36 lines | Low risk; cleanup candidates |
| **Idle Task Scheduler** | L37–320 | 284 lines | **PROTECTED / HIGH RISK** (per `AGENTS.md`) |
| **Wallpaper Startup Background Priming** | L321–395 | 75 lines | Low/Medium risk |
| **Dock Navigation & Tab Scroll Startup** | L396–404 | 9 lines | Low risk startup calls |
| **Grid Drag PointerMove Throttling** | L405–445 | 41 lines | **HIGH RISK** (Drag & Drop subsystem) |
| **Bookmark State Variables & Quick Buttons** | L446–560 | 115 lines | State ownership & DOM handles |
| **Sortable Grid & Tabs Drag/Drop Handlers** | L561–1220 | 660 lines | **PROTECTED / CRITICAL RISK** (per `AGENTS.md`) |
| **Bookmark Loader Compatibility Bridges** | L1221–1284 | 64 lines | Low/Medium risk compatibility bridges |
| **Search DOM Handles, Bridges & `setupSearch`** | L1285–1322 | 38 lines | Low risk; prime extraction candidate |
| **Page Initialization & Orchestration (`initializePage`)** | L1323–1740 | 418 lines | **PROTECTED / HIGH RISK** (per `AGENTS.md`) |
| **Bookmark Grid Click Delegation (`setupBookmarks`)** | L1741–1834 | 94 lines | Medium risk; action controller candidate |
| **`browser.storage.onChanged` Listener Block** | L1835–1902 | 68 lines | Medium risk; storage sync candidate |
| **DOMContentLoaded & Load Perf Handlers** | L1903–1937 | 35 lines | Low risk; perf runtime candidate |

---

## 3. Candidate Extraction Table

| Candidate | Target Lines in `new-tab.js` | Destination Module | Duplicate / Stale Logic | Est. Reduction | Risk Level | Rec. Order |
|---|---|---|---|---|---|---|
| **14-A: Search Setup & Bridges** | L1285–1322 (38 lines) | `src/newtab/search/search-ui-controller.js` & `search-interaction-controller.js` | Window bridges (`updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`, `setSearchSuggestionsPreference`) are defined in `new-tab.js` rather than search controllers. `setupSearch()` merely awaits both controllers. | ~28–32 lines | **LOW** | **#1** |
| **14-B: App Launcher & Quick Action DOM Handles** | L9–12, L502–506 (13 lines) | `src/newtab/integrations/app-launcher.js` & `src/newtab/bookmarks/quick-actions.js` | `googleAppsBtn`, `googleAppsPanel`, `quickAddBookmarkBtn`, `quickAddFolderBtn`, `quickOpenBookmarksBtn` declared at top-level of `new-tab.js` instead of being queried locally/defensively within their respective modules. | ~10–13 lines | **LOW** | **#2** |
| **14-C: DOMContentLoaded & Load Perf Handlers** | L1903–1937 (35 lines) | `src/newtab/core/startup-perf-runtime.js` | Generic window/document load performance listeners and unused `window.HomebaseStartupPerf` checks live at the tail of `new-tab.js`. | ~30–35 lines | **LOW** | **#3** |
| **14-D: `storage.onChanged` Dispatcher** | L1835–1902 (68 lines) | `src/newtab/core/host-storage-adapter.js` / dedicated storage sync handler | Centralized listener dispatches to search, settings, todo, wallpaper, and bookmark metadata sync. Subsystems already provide `handleStorageChange` methods. | ~55–65 lines | **MEDIUM** | **#4** |
| **14-E: Bookmark Grid Click Delegation** | L1741–1834 (94 lines) | `src/newtab/bookmarks/bookmark-action-controller.js` | Click event delegation on `#bookmarks-grid` for folder opening, URL opening, and back navigation. `bookmark-action-controller.js` already owns action methods. | ~75–85 lines | **MEDIUM–HIGH** | **#5** |

---

## 4. In-Depth Focus Area Analysis

### Focus Area 1: Remaining `src/new-tab.js` Event Listeners
There are four event listener attachments remaining in `src/new-tab.js`:
1. `window.addEventListener('pointermove', ...)` (L416–442):
   - Throttles drag coordinates to `requestAnimationFrame` and invokes `handleGridDragPointerMove`.
   - **Assessment**: Directly tied to Sortable drag/drop internals. Must remain coupled with drag state until full drag subsystem extraction.
2. `bookmarksGrid.addEventListener('click', ...)` (L1746–1817):
   - Handles click delegation for bookmark cards, folders, and back buttons, while blocking clicks when dragging (`isGridDragging`).
   - **Assessment**: Belongs in `bookmark-action-controller.js`, but requires clean integration with `isGridDragging` state.
3. `document.addEventListener('DOMContentLoaded', ...)` (L1903–1914):
   - Fires `hbPerfMark('dom-content-loaded')`.
   - **Assessment**: Cleanly extractable to `startup-perf-runtime.js`.
4. `window.addEventListener('load', ...)` (L1915–1937):
   - Fires `hbPerfMark('window-load')`.
   - **Assessment**: Cleanly extractable to `startup-perf-runtime.js`.

### Focus Area 2: `browser.storage.onChanged` Listener Block
Located at lines 1835–1901 (66 lines):
- Currently handles 5 distinct concerns:
  1. **Wallpaper Sync**: `WALLPAPER_SELECTION_KEY`, `DAILY_ROTATION_KEY` -> `syncWallpaperStartupState`.
  2. **Search Sync**: Calls `window.HomebaseSearchUiController.handleStorageChange`.
  3. **Settings Sync**: Calls `window.HomebaseSettingsPreferences.handleStorageChange`.
  4. **Todo Sync**: Calls `handleTodoStorageChange(changes, area)` in `src/newtab/widgets/todo.js`.
  5. **Bookmark Metadata & Subtree Sync**: Compares `FOLDER_META_KEY` and `BOOKMARK_META_KEY` using `getChangedMetadataIds()`, updates local state, patches grid via `patchActiveGridMetadataItems()`, and handles `LAST_USED_BOOKMARK_FOLDER_KEY` / `HOMEBASE_BOOKMARK_ROOT_ID_KEY`.
- **Assessment**:
  - The storage listener is effectively a cross-subsystem router.
  - Can be modularized cleanly by establishing a listener registration in `host-storage-adapter.js` or a storage sync coordinator that delegates to existing subsystem change handlers.

### Focus Area 3: Search Setup Wrappers & Bridges
Located at lines 1285–1322 (38 lines):
- Top-level handles:
  - `const searchForm = document.getElementById('search-form');`
  - `const searchInput = document.getElementById('search-input');`
  - `const searchSelect = document.getElementById('search-select');`
- Window bridges:
  - Exposes 7 methods onto `window` from `HomebaseSearchUiController` and `HomebaseSearchInteractionController`.
- Wrapper:
  ```javascript
  async function setupSearch() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.initialize === 'function') {
      await window.HomebaseSearchUiController.initialize();
    }
    if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.initialize === 'function') {
      await window.HomebaseSearchInteractionController.initialize({ bindEvents: true });
    }
  }
  ```
- **Assessment**:
  - `search-ui-controller.js` and `search-interaction-controller.js` should attach their own compatibility bridges directly, eliminating 20 redundant assignment lines from `new-tab.js`.
  - `setupSearch()` can either be unified as `HomebaseSearchUiController.setupSearch()` or reduced to a clean 2-line wrapper.
  - `searchForm`, `searchInput`, `searchSelect` are already queried defensively inside `search-interaction-controller.js` and `search-ui-controller.js`.

### Focus Area 4: Remaining Duplicate Ownership between `new-tab.js` and Modules
1. **Google Apps Handles**:
   - `googleAppsBtn` and `googleAppsPanel` (lines 9-11) are declared in `new-tab.js` but used in `app-launcher.js`.
   - `app-launcher.js` should query them directly inside `setupGoogleAppsPanel()`.
2. **Quick Actions Handles**:
   - `quickAddBookmarkBtn`, `quickAddFolderBtn`, `quickOpenBookmarksBtn` (lines 502-506) are declared in `new-tab.js` but used in `quick-actions.js`.
   - `quick-actions.js` should query them directly inside `setupQuickActions()`.
3. **Bookmark Loader Forwarders**:
   - 6 functions at lines 1221–1284 delegate to `HomebaseBookmarkLoader` while keeping local variables (`allBookmarks`, `rootDisplayFolderId`, `bookmarkMetadata`, `folderMetadata`, `lastUsedBookmarkFolderId`, `bookmarkTree`) in sync.
   - These are necessary as long as Sortable drag/drop and grid rendering in `new-tab.js` read those local variables. Once Sortable/grid is extracted or migrated to controllers, these local variables can be phased out.

---

## 5. Protected Subsystems Confirmation

The following subsystems are explicitly confirmed as **STRICTLY PROTECTED** and will **NOT** be modified in Phase 5:
- `src/preload.js`
- `src/instant_load.js`
- `manifests/*`
- `dist/*`
- `initializePage()` startup orchestration sequence (lines 1347–1740)
- Sortable drag/drop handlers and physics (`setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`)
- Idle scheduler (`processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`)

---

## 6. Recommended Next Steps

### Recommended Step: Checkpoint 14-A — Search Setup & Bridge Cleanup
- **Goal**:
  1. Move the search window compatibility bridges into `search-ui-controller.js` and `search-interaction-controller.js`.
  2. Implement canonical `setupSearch()` method on `HomebaseSearchUiController`.
  3. Clean up stale top-level DOM handles (`searchForm`, `searchInput`, `searchSelect`) in `src/new-tab.js`.
- **Expected Impact**:
  - ~28–32 line reduction in `src/new-tab.js`.
  - Establishes canonical self-contained search module ownership.
  - Zero risk to startup orchestration or drag/drop subsystems.

---

**STOPPED per instructions. No source files modified. No commits or pushes created. Awaiting owner instructions.**
