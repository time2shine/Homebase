# Homebase Cycle #12 — Phase 3-B Implementation Report
## Grid Drag & Drop Extraction

**Document:** `docs/213-cycle12-phase3b-grid-drag-extraction-report.md`  
**Date:** October 8, 2026  
**Status:** COMPLETE (VERIFICATION PASSED — AWAITING OWNER REVIEW)  
**Target Module:** [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)  
**Monolith Cleaned:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**HTML Registration:** [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)  
**Static Checker:** [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs)  

---

## 1. Overview & Objectives

In Phase 3-B of Cycle #12, canonical ownership of the Bookmark Grid Drag & Drop subsystem was successfully extracted from the legacy monolith [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) in accordance with [`docs/211-cycle12-phase2-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/211-cycle12-phase2-plan.md).

### Objectives Accomplished:
1. **Extracted Grid Sortable Ownership**: Moved `setupGridSortable`, full SortableJS configuration, and lifecycle callbacks (`onClone`, `onStart`, `onEnd`, `onMove`) into `HomebaseBookmarkDragController`.
2. **Extracted Pointer Movement & Raycasting**: Moved `pointermove` throttling (`requestAnimationFrame`), element raycasting via `document.elementFromPoint`, and tab drop target highlighting (`handleGridDragPointerMove`, `clearTabDropHighlight`).
3. **Extracted Folder Hover Delay Mechanism**: Transferred the 250ms folder hover lock (`FOLDER_HOVER_DELAY_MS`) in `handleGridMove`, preserving layout freezing when hovering over destination folders.
4. **Extracted In-Memory Tree Mutation & Drop Execution**: Transferred `moveItemInLocalTree` and `handleGridDrop` (handling Case A: folder/tab/back-button transfer and Case B: in-grid reordering).
5. **Applied Key Architecture Fixes**:
   - Replaced stale/shadowed `currentGridFolderNode` with dynamic resolution via `window.HomebaseBookmarkGridController.getCurrentGridFolderNode()`.
   - Replaced duplicate virtualizer mutation code with canonical calls to `window.HomebaseBookmarkGridController.syncVirtualizerMove` and `window.HomebaseBookmarkGridController.reorderVirtualizerItems`.
6. **Maintained Compatibility Bridges**: Retained `window.setupGridSortable` as a transparent bridge delegating to `window.HomebaseBookmarkDragController.setupGridSortable`.
7. **Preserved Safety Invariants**: Kept `setupTabsSortable` and `handleTabDrop` untouched in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) for extraction in Phase 4.

---

## 2. Files Modified & Created

| File | Status | Description |
|---|:---:|---|
| [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) | **Populated** | Full Grid Drag implementation (~679 lines): Sortable setup, event handlers, pointer tracking, hover lock, local tree mutation, and drop dispatch. |
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | **Reduced** | Removed ~500 lines of dead/extracted grid drag logic. Added lightweight bridge for `setupGridSortable`. |
| [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | **Verified** | Registered script tag `<script src="newtab/bookmarks/bookmark-drag-controller.js" defer></script>` in correct order (after `bookmark-grid-controller.js`). |
| [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | **Verified** | Includes `newtab/bookmarks/bookmark-drag-controller.js` in `keyExtractedModulePaths`. |

---

## 3. Detailed Scope of Extraction

### 3.1 Functions & Logic Moved to `bookmark-drag-controller.js`

1. **`setupGridSortable(gridElement)`**:
   - Performance instrumentation hooks (`getPerfMeasureStart`, `recordSortableLibraryAvailability`, `recordSortablePerfTiming`).
   - Sortable options: `animation: 250`, `group: 'bookmarks'`, `draggable: '.bookmark-item:not(.back-button)'`, `filter: '.grid-item-rename-input'`.
   - Performance & fallback settings: `delay: 150`, `delayOnTouchOnly: true`, `touchStartThreshold: 6`, `forceFallback: true`, `fallbackTolerance: 6`.
   - CSS classes: `ghostClass: 'bookmark-placeholder'`, `chosenClass: 'sortable-chosen'`, `dragClass: 'sortable-drag'`, `fallbackClass: 'bookmark-fallback-ghost'`.
2. **`onClone(evt)`**:
   - Manages fallback ghost icon display (`bookmark-fallback-ghost-hide-fallback`).
3. **`onStart()`**:
   - Sets `isGridDragging` to `true`.
   - Adds `is-dragging-active` to `document.body`.
   - Strips `.newly-rendered` animation class from active tiles.
4. **`onEnd(evt)`**:
   - Removes `is-dragging-active` from `document.body`.
   - Delays clearing `isGridDragging` by 50ms to suppress click events.
   - Dispatches `handleGridDrop(evt)`.
5. **`handleGridMove(evt)`**:
   - Detects hover over folder tiles (`data-is-folder="true"`).
   - Enforces 250ms hover delay (`FOLDER_HOVER_DELAY_MS`) before applying `drag-over` CSS class and returning `false` to lock tile positions.
6. **`handleGridDragPointerMove(evt)`**:
   - Coordinates raycasting with `document.elementFromPoint(clientX, clientY)`.
   - Highlights folder tabs (`.bookmark-folder-tab`) with `.drop-target`.
7. **`clearTabDropHighlight()`**:
   - Cleans up `.drop-target` from previously hovered tab element.
8. **`moveItemInLocalTree(parentId, oldIndex, newIndex)`**:
   - Mutates in-memory `window.bookmarkTree` array to reflect new tile positions optimistically without re-fetching.
9. **`handleGridDrop(evt)`**:
   - Handles dropping bookmark onto folder tile, tab element, or back button (`browser.bookmarks.move({ parentId })`).
   - Handles in-grid reordering (`browser.bookmarks.move({ index })`).

---

## 4. Architecture Fixes Implemented

### 4.1 Resolution of Stale `currentGridFolderNode` Shadowing
- **Audit Finding**: In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), `currentGridFolderNode` was a top-level module variable that became desynchronized after grid controller extraction because only `HomebaseBookmarkGridController` maintained active folder state.
- **Resolution**: `bookmark-drag-controller.js` now uses dynamic folder resolution:
  ```javascript
  function getCurrentGridFolderNode() {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
      return window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
    }
    if (typeof window !== 'undefined' && window.currentGridFolderNode) {
      return window.currentGridFolderNode;
    }
    return null;
  }
  ```
  This resolves subfolder drop targeting bugs where items dropped onto back buttons or subfolder tabs used stale parent IDs.

### 4.2 Canonical Virtualizer Synchronization
- **Audit Finding**: Monolith had duplicated virtualizer array manipulation in `handleGridDrop`.
- **Resolution**: Replaced ad-hoc mutations with canonical grid controller methods:
  - `window.HomebaseBookmarkGridController.syncVirtualizerMove(draggedItemId, targetFolderId)`
  - `window.HomebaseBookmarkGridController.reorderVirtualizerItems(oldIndex, newIndex)`

---

## 5. Functions Intentionally Left in Place

In strict adherence to the Phase 3-B boundary:
1. **`setupTabsSortable(tabsContainer)`**: Remains in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js). (Scheduled for Phase 4).
2. **`handleTabDrop(evt)`**: Remains in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js). (Scheduled for Phase 4).
3. **`isTabDragging`**: Flag maintained in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) with bridge synchronized to `HomebaseBookmarkDragController`.

---

## 6. Monolith Metrics & Line Count Reduction

- **Previous [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) Line Count:** ~1,842 lines
- **Current [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) Line Count:** 1,342 lines
- **Net Reduction:** **~500 lines removed from monolith**
- **Git Diff Summary:**
  ```text
  scripts/check-newtab-static.mjs |   1 +
  src/new-tab.html                |   1 +
  src/new-tab.js                  | 542 ++++------------------------------------
  3 files changed, 44 insertions(+), 500 deletions(-)
  ```

---

## 7. Verification Results

All automated checks passed without warnings or regressions.

### 7.1 Syntax Validation (`node --check`)
```powershell
node --check src/newtab/bookmarks/bookmark-drag-controller.js
# Output: Exit code 0 (PASS)

node --check src/new-tab.js
# Output: Exit code 0 (PASS)
```

### 7.2 Static Invariants Check (`node scripts/check-newtab-static.mjs`)
```text
Homebase new-tab static check
PASS deferred local script files exist - 63 deferred local scripts checked
PASS preload.js script tag exists once - 1 found
PASS preload.js remains in head - head script preserved
PASS preload.js remains synchronous - no defer/async/module
PASS preload.js file exists - src\preload.js
PASS new-tab.js is last deferred runtime script - last deferred script: new-tab.js
PASS key extracted module paths exist - 43 module paths checked
PASS no old flat newtab/*.js path references - none found
PASS no root-level src/newtab/*.js module files - none found
PASS no stale moved lazy-load path references - none found
PASS no cross-script top-level declaration collisions - 895 unique top-level declarations verified across 63 deferred scripts
```

### 7.3 Test Suite (`npm.cmd test`)
```text
✔ 367 unit tests passed (node:test)
✔ Browser Smoke Test (smoke-newtab-file.mjs) passed:
  - msedge.exe launched
  - http://127.0.0.1:50061/new-tab.html loaded
  - required DOM surfaces exist
  - core controllers are available
  - startup perf helpers are available
  - fast-widget-order preload applied
  - no ReferenceError or severe runtime errors
Total: 4/4 stages passed.
```

### 7.4 Extension Build (`npm.cmd run build`)
```text
Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

### 7.5 Protected Files Check
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
# Output: empty (Zero modifications to protected boot files)
```

---

## 8. Manual Browser Verification Assessment

### Why Manual Verification Is Recommended
Grid drag & drop involves real DOM interactions via SortableJS, synthetic ghost tile positioning, mouse pointer raycasting (`elementFromPoint`), and asynchronous calls to the browser extension bookmark APIs (`chrome.bookmarks.move` / `browser.bookmarks.move`).

### Timing:
Recommended **after commit / before merge to main**.

### Verification Checklist:

#### Chrome:
1. Load unpacked extension from `dist/chrome` (or run dev reload).
2. Open a new tab.
3. **In-grid reorder**: Drag a bookmark item tile to another position. Confirm tile snaps cleanly, no flicker, and reordering persists after refreshing.
4. **Drop into folder**: Drag a bookmark item over a folder tile in the grid. Wait 250ms — verify the folder tile receives `.drag-over` highlighting and does not shift. Drop into the folder — verify tile disappears from grid and enters folder.
5. **Drop into tab**: Drag a bookmark item over a folder tab at the top. Verify the tab receives `.drop-target` highlight. Drop into tab — verify bookmark is moved into that folder.
6. Open DevTools Console: Confirm **zero** `ReferenceError`, `TypeError`, or unhandled promise rejections.

#### Firefox:
1. Load temporary add-on from `dist/firefox`.
2. Open a new tab.
3. Test bookmark drag reorder in grid.
4. Test dropping bookmark into a folder tab.
5. Check Browser Console for any warnings or errors.

---

## 9. Next Steps

- **Owner Review & Approval**: Review Phase 3-B changes and test report.
- **Commit Phase 3-B**: `feat(bookmarks): extract grid drag controller from new-tab monolith (Cycle #12 Phase 3-B)`
- **Proceed to Phase 4 (Phase 3-C)**: Extract Tab Drag & Drop (`setupTabsSortable`, `handleTabDrop`) into `bookmark-drag-controller.js`.
