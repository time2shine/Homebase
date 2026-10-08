# Homebase Improvement Cycle #11 Phase 3 Checkpoint 4 — Implementation Plan
## Bookmark Grid Reconciliation & Rename/Edit UI Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 Checkpoint 4  
> **Target Release**: Homebase v0.18.0  
> **Target Files**:  
> - `src/newtab/bookmarks/bookmark-grid-controller.js`  
> - `src/new-tab.js`  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/75-cycle11-phase3-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/75-cycle11-phase3-audit.md), [docs/81-cycle11-phase3-checkpoint3-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/81-cycle11-phase3-checkpoint3-report.md)

---

## 1. Context & Objectives

Across Checkpoints 1, 2, and 3 of Cycle #11 Phase 3:
1. `src/newtab/bookmarks/bookmark-grid-controller.js` was established with controller state (`virtualizerState`), layout constants, and pure metadata diffing helpers.
2. The presentation engine for bookmark cards, folders, and icons was extracted (`renderBookmarkIconInto`, `renderFolderIconInto`, `renderBookmark`, `renderBookmarkFolder`, `ensureBookmarkFallback`, `clearBookmarkImages`).
3. The virtualization engine was extracted (`updateVirtualGrid`, `initVirtualizer`, `disableVirtualizer`, `createBackButton`, `createNodeForVirtualizer`, `updateElementData`, `findRenderedGridItemById`, `patchActiveGridMetadataItems`, `syncVirtualizerMove`, `reorderVirtualizerItems`).
4. Monolith `src/new-tab.js` was reduced from 6,942 to 6,171 lines.

### Checkpoint 4 Objective:
Extract the **Bookmark Grid Reconciliation and Rename/Edit UI** into `src/newtab/bookmarks/bookmark-grid-controller.js`:
- `renderBookmarkGrid(folderNode, droppedItemId = null, options = {})`
- `showEditInput(tabButton, folderNode)`
- `showGridItemRenameInput(gridItem, bookmarkNode)`
- `autoResizeTextarea(textarea)`
- Internal state tracking for `currentGridFolderNode` (`getCurrentGridFolderNode`, `setCurrentGridFolderNode`)
- Animation coordination (`captureGridItemPositions`, `animateGridReorder`, CSS animation delays)

---

## 2. Dependency & Architectural Boundaries

### A. DOM Ownership
- **Bookmarks Grid**: `#bookmarks-grid` (`getGridElement()`).
- **Main Content**: `.main-content` (`getMainContentElement()`).
- **Rename Input Elements**:
  - Folder Tab Input: Injected into tab container adjacent to `tabButton`.
  - Grid Item Textarea: Injected into `.bookmark-item`, hides `titleSpan`, manages `.is-renaming` class on container.

### B. State & Context Requirements
- `currentGridFolderNode`: Tracked in `bookmark-grid-controller.js` with accessors (`getCurrentGridFolderNode`, `setCurrentGridFolderNode`).
- `rootDisplayFolderId`: Resolved defensively via `options.rootDisplayFolderId`, lexical fallback, or `window.rootDisplayFolderId`.
- `bookmarkTree`: Resolved defensively via `options.bookmarkTree`, lexical fallback, or `window.bookmarkTree`.
- `findBookmarkNodeById`: Resolved defensively via `options.findBookmarkNodeById`, lexical fallback, or `window.findBookmarkNodeById`.
- `browser.bookmarks.update`: Standard WebExtension API for persisting rename actions.
- `loadBookmarks`: Callback triggered on folder rename save.
- `updateNodeInTree` & `getBookmarkTree`: Cache reconciliation helpers after bookmark rename.

### C. Animation & Drag Integration
- Standard grid mode animations:
  - If `droppedItemId` is passed: Uses `captureGridItemPositions(grid)` and `animateGridReorder(domItems, previousPositions)` from `src/newtab/bookmarks/grid-reorder-animation.js`.
  - Otherwise: Staggered entry animation via `.newly-rendered` class and `animationDelay` (skipped if `appPerformanceModePreference` is enabled).
- Sortable re-initialization:
  - Debounced with `scheduleSortableReinit(grid)` or `setupGridSortable(grid)`.

### D. Compatibility Bridge Plan
1. **Global Controller Registration**:
   - `window.HomebaseBookmarkGridController.renderBookmarkGrid`
   - `window.HomebaseBookmarkGridController.showEditInput`
   - `window.HomebaseBookmarkGridController.showGridItemRenameInput`
   - `window.HomebaseBookmarkGridController.autoResizeTextarea`
   - `window.HomebaseBookmarkGridController.getCurrentGridFolderNode`
   - `window.HomebaseBookmarkGridController.setCurrentGridFolderNode`
2. **Direct Global Window Exports**:
   - `window.renderBookmarkGrid = renderBookmarkGrid`
   - `window.showEditInput = showEditInput`
   - `window.showGridItemRenameInput = showGridItemRenameInput`
   - `window.autoResizeTextarea = autoResizeTextarea`
3. **Delegation Shims in `src/new-tab.js`**:
   - Thin shims forwarding directly to `window.HomebaseBookmarkGridController.*` while updating local references.

---

## 3. Implementation Steps

1. **Add Functions to `src/newtab/bookmarks/bookmark-grid-controller.js`**:
   - Implement `autoResizeTextarea(textarea)`
   - Implement `getCurrentGridFolderNode()` and `setCurrentGridFolderNode(node)`
   - Implement `renderBookmarkGrid(folderNode, droppedItemId, options)`
   - Implement `showEditInput(tabButton, folderNode)`
   - Implement `showGridItemRenameInput(gridItem, bookmarkNode)`
   - Register on `HomebaseBookmarkGridController` and `window`.

2. **Replace Monolith Implementations in `src/new-tab.js`**:
   - Replace `autoResizeTextarea` (lines 2467-2499) with delegation shim.
   - Replace `renderBookmarkGrid` (lines 2703-2850) with delegation shim.
   - Replace `showEditInput` (lines 3046-3144) with delegation shim.
   - Replace `showGridItemRenameInput` (lines 3156-3321) with delegation shim.

3. **Verify**:
   - Run syntax checks (`node --check`).
   - Run static invariant scanner (`scripts/check-newtab-static.mjs`).
   - Run browser smoke test (`scripts/smoke-newtab-file.mjs`).
   - Run unit test suite (`npm.cmd test`).
   - Run build (`npm.cmd run build`).
   - Verify protected files (`git diff src/preload.js src/instant_load.js manifests/ dist/`).

4. **Document & Report**:
   - Write `docs/83-cycle11-phase3-checkpoint4-report.md`.
