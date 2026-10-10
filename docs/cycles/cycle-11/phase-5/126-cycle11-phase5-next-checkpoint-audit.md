# Homebase Cycle #11 Phase 5 — Next Checkpoint Architecture Audit

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Target Milestone**: Checkpoint 6  
**Date**: October 2, 2026  
**Status**: Audit Complete — Awaiting Owner Review  
**Baseline Commit**: `c75a9d8` (`Extract settings preference state controller`)  
**Authority**: [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [`docs/104-cycle11-phase5-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/104-cycle11-phase5-audit.md), [`docs/123-cycle11-phase5-checkpoint5-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/123-cycle11-phase5-checkpoint5-report.md)  

---

## 1. Current `src/new-tab.js` Size & Phase 5 Trajectory

- **Initial Size at Phase 5 Start**: 3,833 lines
- **After Checkpoint 1** (`ecc4cf8` — Wallpaper Visibility Lifecycle): 3,732 lines (-101 lines)
- **After Checkpoint 2** (`6abb63c` — Responsive Layout Collapse): 3,634 lines (-98 lines)
- **After Checkpoint 3** (`f970ac5` — Bookmark Editor Adapter Layer): 3,521 lines (-113 lines)
- **After Checkpoint 4** (`a37a449` — Bookmark Root Controller): 3,324 lines (-197 lines)
- **After Checkpoint 5** (`c75a9d8` — Settings Preference State Controller): **3,162 lines** (-162 lines)
- **Total Phase 5 Reduction to Date**: **-671 net lines**

---

## 2. Remaining Subsystem Inventory in `src/new-tab.js`

An architectural inventory of the remaining 3,162 lines of [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) reveals the following functional groupings:

| Subsystem / Functional Block | Lines | Current Ownership | Extracted Destination Status |
|---|:---:|---|---|
| **1. Global Element References & Initial Hooks** | 1–70 | DOM element handles for search, tabs, grid, modal dialogs, and picker controls. | Partially redundant with extracted modules. |
| **2. Idle Task Scheduler Engine** | 71–355 | `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, `idleTaskQueue`, `idleTaskLabels`, `STARTUP_IDLE_LABELS`. | **PROTECTED** by `AGENTS.md` ("Leave idle scheduler logic in `src/new-tab.js`"). |
| **3. Asset & Script Loading Helpers** | 356–453 | `loadScriptOnce`, `loadStylesheetOnce`, `openBookmarkIconPicker`, `revealWidget`. | Candidate for extraction into `src/newtab/core/`. |
| **4. Startup Wallpaper Background Priming** | 454–520 | `primeWallpaperBackground()` immediate execution. | **PROTECTED** by `AGENTS.md` ("wallpaper/video/cache/startup path"). |
| **5. Bookmark Tabs Scroll & Pointermove Throttling** | 521–583 | Throttled `pointermove` for active drag, scroll controller init, scroll button listeners. | Candidate for consolidation with tabs scroll / drag handling. |
| **6. Bookmark Tree Traversal & Mutation Algorithms** | 584–600, 742–885, 1745–1847 | `getBookmarkTree`, `findBookmarkNodeById`, `findNodeAndParent`, `updateNodeInTree`, `appendNodeToParent`, `getValidFolderId`, `getDefaultBookmarkParentId`, `flattenBookmarks`. | **High Candidate** for extraction into a pure tree service module. |
| **7. Bookmark Drag & Drop (Sortable.js integration)** | 601–635, 886–1550 | `setupGridSortable`, `handleGridMove`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`. | **HIGH RISK** area per `AGENTS.md` ("drag and reorder behavior"). |
| **8. Bookmark CRUD Actions & Clipboard Operations** | 1601–1732, 1915–2095, 3001–3010 | `deleteBookmarkOrFolder`, `deleteBookmarkFolder`, `createNewBookmarkFolder`, `handlePasteBookmark`, `getSmartNameFromUrl`, `sortCurrentFolderByName`, document `paste` listener. | **RECOMMENDED CANDIDATE** for Checkpoint 6 extraction. |
| **9. Bookmark UI Visibility & Boot Orchestration** | 751–836, 2130–2320 | `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `beginBookmarksBoot`, `endBookmarksBoot`, `createFolderTabs`, `processBookmarks`, `loadBookmarks`. | Coordinates grid, tabs, and root state. |
| **10. Performance Mode Compatibility Wrappers** | 2326–2420 | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `applyPerformanceModeState`. | Thin wrappers over `HomebasePerformanceController`. |
| **11. Search UI & Interaction Delegation** | 2422–2488 | `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`. | Thin wrappers over `HomebaseSearchUiController`. |
| **12. Startup Orchestration (`initializePage`) & Event Listeners** | 2506–3126 | `initializePage`, `scheduleStartupHydrationTasks`, `markPageReadyOnce`, context menu binding, grid click listener, `browser.storage.onChanged`, `DOMContentLoaded`. | **PROTECTED** by `AGENTS.md` ("Leave initializePage in `src/new-tab.js`"). |
| **13. Global Context Helpers** | 3127–3163 | `openBookmarkInNewTab`, `openFolderFromContext`. | Belongs with bookmark user action controllers. |

---

## 3. Candidate Extraction Targets

### Candidate A: Bookmark Action Controller (`bookmark-action-controller.js`)
- **Current Location**: `src/new-tab.js` lines 1601–1732, 1915–2095, 3001–3010, 3127–3163 (~380 lines).
- **Responsibility**:
  1. **Bookmark & Folder Deletion**: `deleteBookmarkOrFolder(id, isFolder, sourceTileEl)` and `deleteBookmarkFolder(folderId)`.
  2. **Folder Creation**: `createNewBookmarkFolder(name)`.
  3. **Clipboard Paste Workflow**: `handlePasteBookmark()`, `getSmartNameFromUrl(url)`, and document `paste` event binding.
  4. **Alphabetical Sorting**: `sortCurrentFolderByName()`, `compareBookmarkNodeTitles(a, b)`, `isBookmarkFolderNode(node)`.
  5. **Context Navigation Actions**: `openBookmarkInNewTab(bookmarkId)`, `openFolderFromContext(folderId)`.
- **Proposed Destination Module**: [`src/newtab/bookmarks/bookmark-action-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/)
- **Complexity**: Medium.
- **Risk Level**: Low-to-Medium (interacts with `browser.bookmarks.create/remove/removeTree/move`, clipboard APIs, and confirmation dialogs).
- **Estimated Line Impact**: **-250 to -300 net lines** from `src/new-tab.js`.

### Candidate B: Bookmark Tree Service & Local Tree Mutation (`bookmark-tree-service.js`)
- **Current Location**: `src/new-tab.js` lines 839–879, 1557–1579, 1745–1847 (~175 lines).
- **Responsibility**:
  1. **Tree Fetching & Caching**: `getBookmarkTree(forceRefresh)` with in-flight promise deduplication.
  2. **Tree Traversal Algorithms**: `findBookmarkNodeById(rootNode, id)`, `findNodeAndParent(rootNode, id, parent)`.
  3. **Local Tree Mutation (Optimistic UI)**: `updateNodeInTree(rootNode, id, patch)`, `appendNodeToParent(rootNode, parentId, newChildNode)`, `flattenBookmarks(nodes)`.
  4. **Parent Resolution**: `getValidFolderId(folderId)`, `getDefaultBookmarkParentId()`.
- **Proposed Destination Module**: [`src/newtab/bookmarks/bookmark-tree-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/)
- **Complexity**: Low.
- **Risk Level**: Low (pure recursive tree algorithms and read-only queries).
- **Estimated Line Impact**: **-150 to -180 net lines** from `src/new-tab.js`.

### Candidate C: Resource & Asset Loader Utilities (`resource-loader.js`)
- **Current Location**: `src/new-tab.js` lines 356–453 (~95 lines).
- **Responsibility**:
  - `loadScriptOnce(src)` with caching and error handling.
  - `loadStylesheetOnce(href)` with head deduplication.
  - `openBookmarkIconPicker(context)` lazy loader.
  - `revealWidget(selector)`.
- **Proposed Destination Module**: [`src/newtab/core/resource-loader.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/)
- **Complexity**: Very Low.
- **Risk Level**: Very Low.
- **Estimated Line Impact**: **-75 to -90 net lines** from `src/new-tab.js`.

### Candidate D: Bookmark Boot & Empty State Manager (`bookmark-empty-state.js`)
- **Current Location**: `src/new-tab.js` lines 751–836 (~85 lines).
- **Responsibility**:
  - `setChangeFolderButtonVisibility(visible)`
  - `hideBookmarksUI()`, `showBookmarksUI()`
  - `showBookmarksEmptyState(message)`, `hideBookmarksEmptyState()`
  - `beginBookmarksBoot()`, `endBookmarksBoot()`
- **Proposed Destination Module**: [`src/newtab/bookmarks/bookmark-empty-state.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/)
- **Complexity**: Low.
- **Risk Level**: Low.
- **Estimated Line Impact**: **-70 to -80 net lines** from `src/new-tab.js`.

---

## 4. Protected Areas Strictly Excluded from Extraction

Per [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) high-risk guidelines, the following domains MUST remain untouched:

1. **`initializePage()` & Startup Orchestration** (lines 2506–2920):
   Parallel promise loading, critical/ready phase transitions, performance mark/measure pipeline.
2. **Idle Task Scheduler** (lines 71–355):
   `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`.
3. **Sortable.js Grid & Tab Drag-and-Drop** (lines 601–635, 886–1550):
   Pointermove animation frame throttling, ghost classes, Sortable instance lifecycle, drop coordinate calculations.
4. **Startup Wallpaper Priming** (lines 454–520):
   `primeWallpaperBackground()` immediate runtime path.
5. **Protected Files**:
   `src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`.

---

## 5. Dependency Analysis: Candidate A (Bookmark Action Controller)

### 5.1 Consumers & Callers
- **Context Menus** (`src/newtab/core/context-menu-controller.js`):
  Delegates `deleteBookmarkOrFolder`, `handlePasteBookmark`, `sortCurrentFolderByName`, `openBookmarkInNewTab`, `openFolderFromContext`.
- **Keyboard Shortcuts** (`document.addEventListener('paste', ...)`):
  Directly triggers `handlePasteBookmark()`.
- **Bookmark Folder Tabs** (`createFolderTabs` in `src/new-tab.js`):
  Supplies callbacks for `deleteBookmarkFolder` and `createNewBookmarkFolder`.
- **Quick Action Bar** (`src/newtab/bookmarks/quick-actions.js`):
  Triggers bookmark creation and folder workflows.

### 5.2 Outbound Dependencies of Candidate A
- `browser.bookmarks.create`, `browser.bookmarks.move`, `browser.bookmarks.remove`, `browser.bookmarks.removeTree`.
- `navigator.clipboard.readText`.
- `showDeleteConfirm` (from `bookmark-editor-adapter.js`).
- `showCustomAlert` (from `dialog-controller.js`).
- `renderBookmarkGrid`, `loadBookmarks` (from grid/tab controllers).
- `findBookmarkNodeById`, `getBookmarkTree` (from tree helpers).

### 5.3 Required Backward Compatibility Bridges
Expose on `window.HomebaseBookmarkActionController`:
```javascript
window.HomebaseBookmarkActionController = {
  deleteBookmarkOrFolder,
  deleteBookmarkFolder,
  createNewBookmarkFolder,
  handlePasteBookmark,
  getSmartNameFromUrl,
  sortCurrentFolderByName,
  openBookmarkInNewTab,
  openFolderFromContext,
  setupPasteListener
};
```

Global compatibility functions on `window`:
- `window.deleteBookmarkOrFolder`
- `window.deleteBookmarkFolder`
- `window.createNewBookmarkFolder`
- `window.handlePasteBookmark`
- `window.sortCurrentFolderByName`
- `window.openBookmarkInNewTab`
- `window.openFolderFromContext`

---

## 6. Risk Assessment

| Risk Item | Severity | Mitigation Strategy |
|---|:---:|---|
| **Clipboard permissions error on paste** | Low | Preserve try/catch with user-friendly fallback alert (`showCustomAlert`). |
| **Recursive folder deletion (`removeTree`) failure** | Medium | Retain existing confirmation modal pipeline (`showDeleteConfirm`) and error logging. |
| **Grid reload mismatch after sort/paste** | Medium | Forward active folder ID cleanly to `renderBookmarkGrid` or `loadBookmarks`. |
| **Global lexical scope collisions** | Medium | Check all top-level declaration names via `scripts/check-newtab-static.mjs` before commit. |
| **Context menu wiring breakage** | Low | Retain legacy global function bridges on `window`. |

---

## 7. Recommended Next Checkpoint: Checkpoint 6

### Recommendation: **Bookmark Action Controller Extraction**

**Target Module**: [`src/newtab/bookmarks/bookmark-action-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/)

**Justification**:
1. **High Impact**: Removes **~250 to 300 lines** of user-interaction bookmark logic from `src/new-tab.js`, bringing the monolith down to **~2,880 lines**.
2. **Cohesive Domain**: Consolidates all user-initiated bookmark mutations (create, delete, paste, sort, tab/context navigation) into a single controller.
3. **Complements Existing Modules**: Naturally interfaces with `bookmark-root-controller.js` (Checkpoint 4), `bookmark-editor-adapter.js` (Checkpoint 3), and `context-menu-controller.js`.
4. **Low Inherent Risk**: Does not touch drag-and-drop Sortable logic, startup hydration, or idle scheduling.
5. **Clear Testing Vector**: Easily verified via existing unit tests, CDP browser tests for paste/sort/delete, and extension build checks.

---

## 8. Migration Strategy for Checkpoint 6

1. **Module Creation**:
   Create `src/newtab/bookmarks/bookmark-action-controller.js`.
   Implement:
   - `deleteBookmarkOrFolder(id, isFolder, sourceTileEl)`
   - `deleteBookmarkFolder(folderId)`
   - `createNewBookmarkFolder(name)`
   - `getSmartNameFromUrl(url)`
   - `handlePasteBookmark()`
   - `isBookmarkFolderNode(node)`
   - `compareBookmarkNodeTitles(a, b)`
   - `sortCurrentFolderByName()`
   - `openBookmarkInNewTab(bookmarkId)`
   - `openFolderFromContext(folderId)`
   - `setupPasteListener()`

2. **Public API & Compatibility Layer**:
   Expose `window.HomebaseBookmarkActionController` and attach compatibility bridges to `window`.

3. **Script Registration**:
   Register in [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) after `bookmark-editor-adapter.js` and `bookmark-root-controller.js`.
   Add to `scripts/check-newtab-static.mjs`.

4. **Monolith Extraction**:
   Remove extracted functions from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), replacing them with lightweight delegations where needed.

5. **Verification**:
   Run `node --check`, `scripts/check-newtab-static.mjs`, `smoke-newtab-file.mjs`, `npm.cmd test`, `npm.cmd run build`, and automated CDP browser tests.

---

## 9. Current Status

- Audit completed: **YES**
- Source files modified: **NO** (0 changes)
- Commits created: **NO**
- Ready for owner review: **YES**

*(Stopped as instructed. Awaiting owner instructions to proceed to Checkpoint 6 implementation plan.)*
