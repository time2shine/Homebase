# Homebase Improvement Cycle #11 Phase 3 Checkpoint 3 — Implementation Plan
## Bookmark Grid Virtualization Engine Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 Checkpoint 3  
> **Target Release**: Homebase v0.18.0  
> **Target Files**:  
> - `src/newtab/bookmarks/bookmark-grid-controller.js`  
> - `src/new-tab.js`  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/75-cycle11-phase3-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/75-cycle11-phase3-audit.md), [docs/79-cycle11-phase3-checkpoint2-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/79-cycle11-phase3-checkpoint2-report.md)

---

## 1. Context & Objectives

In Checkpoint 1 and Checkpoint 2 of Cycle #11 Phase 3:
1. `src/newtab/bookmarks/bookmark-grid-controller.js` was created with `virtualizerState` ownership and pure metadata helpers.
2. The entire Bookmark Card Icon & Folder Preview presentation engine was migrated (`renderBookmarkIconInto`, `renderFolderIconInto`, `renderBookmark`, `renderBookmarkFolder`, `ensureBookmarkFallback`, `clearBookmarkImages`).
3. `src/new-tab.js` was reduced from 6,942 to 6,484 lines.

### Checkpoint 3 Objective:
Extract the **Bookmark Grid Virtualization Engine** from `src/new-tab.js` into `src/newtab/bookmarks/bookmark-grid-controller.js`:
- `createBackButton(parentId)`
- `createNodeForVirtualizer(node)`
- `updateElementData(el, node)`
- `findRenderedGridItemById(itemId)`
- `patchActiveGridMetadataItems(activeNode, changedIds)`
- `updateVirtualGrid()`
- `initVirtualizer(allItems)`
- `disableVirtualizer()`
- Virtualizer state synchronization helpers (`syncVirtualizerMove`, `reorderVirtualizerItems`)

---

## 2. Dependency & Architectural Analysis

### A. DOM Ownership
- **Scroll Container**: `.main-content` (retrieved via `getMainContentElement()`).
- **Grid Container**: `#bookmarks-grid` (retrieved via `getGridElement()`).
- **Virtual Slicing**:
  - Dynamically calculates columns based on `gridEl.clientWidth` and `itemWidth` (default `105px`).
  - Sets `gridEl.style.height` to total virtual height.
  - Sets `gridEl.style.paddingTop` to offset top rows before visible window.
  - Recycles existing child DOM nodes using `data-recycling-type` (`back`, `folder`, `bookmark`).
  - Trims excess children past `visibleItems.length`.

### B. State Dependencies
- `virtualizerState`: Already owned by `bookmark-grid-controller.js`.
- `isGridDragging`: Guard in `updateVirtualGrid()` preventing DOM recycling while a Sortable drag is underway. Resolved defensively via `window.isGridDragging` or `typeof isGridDragging !== 'undefined' ? isGridDragging : false`.
- `sortableTimeout`: Drag re-initialization debounce timer. Managed defensively with dedicated timeout in controller while clearing legacy `sortableTimeout` if present.
- `setupGridSortable`: Callback to re-bind Sortable to visible grid elements. Invoked defensively via `typeof setupGridSortable === 'function'` or `window.setupGridSortable`.
- `perfState`: Reporting diagnostics object (`perfState.gridMode`, `perfState.lastVirtualRange`, `perfState.lastGridRenderMs`, etc.). Resolved via `typeof perfState !== 'undefined' ? perfState : window.perfState`.
- Preferences: `appPerformanceModePreference`, `appGridAnimationEnabledPreference`. Resolved safely from global scope / `window`.

### C. Favicon & Presentation Dependencies
- Uses `getIconKeyForNode(node)` to detect whether an item's icon needs re-rendering during DOM recycling.
- Uses `renderFolderIconInto` and `renderBookmarkIconInto` for updating recyled nodes.
- Uses `createBackButton`, `renderBookmarkFolder`, and `renderBookmark` for creating new DOM nodes.
- All of these presentation functions were already migrated into `bookmark-grid-controller.js` in Checkpoint 2!

### D. Compatibility Bridge Plan
1. **Global Window Delegation**:
   - `window.HomebaseBookmarkGridController.initVirtualizer`
   - `window.HomebaseBookmarkGridController.disableVirtualizer`
   - `window.HomebaseBookmarkGridController.updateVirtualGrid`
   - `window.HomebaseBookmarkGridController.createBackButton`
   - `window.HomebaseBookmarkGridController.createNodeForVirtualizer`
   - `window.HomebaseBookmarkGridController.updateElementData`
   - `window.HomebaseBookmarkGridController.findRenderedGridItemById`
   - `window.HomebaseBookmarkGridController.patchActiveGridMetadataItems`
   - `window.HomebaseBookmarkGridController.syncVirtualizerMove`
   - `window.HomebaseBookmarkGridController.reorderVirtualizerItems`
2. **Direct Global Window Helpers**:
   - Attach `initVirtualizer`, `disableVirtualizer`, `updateVirtualGrid`, `createBackButton`, `findRenderedGridItemById`, `updateElementData`, `createNodeForVirtualizer`, `patchActiveGridMetadataItems` directly to `window` for external scripts (e.g., `bookmark-editor.js`).
3. **Delegation Shims in `src/new-tab.js`**:
   - Replace implementations in `src/new-tab.js` with thin delegation wrappers forwarding to `window.HomebaseBookmarkGridController.*`.

---

## 3. Implementation Steps

1. **Implement Virtualization Engine in `src/newtab/bookmarks/bookmark-grid-controller.js`**:
   - Add `createBackButton(parentId)`
   - Add `createNodeForVirtualizer(node)`
   - Add `updateElementData(el, node)`
   - Add `findRenderedGridItemById(itemId)`
   - Add `patchActiveGridMetadataItems(activeNode, changedIds)`
   - Add `updateVirtualGrid()` with DOM recycling, RAF throttling, and perf logging
   - Add `initVirtualizer(allItems)` with scroll listener and `ResizeObserver`
   - Add `disableVirtualizer()` with clean reset of RAF, listeners, observers, and styles
   - Add `syncVirtualizerMove(id)` and `reorderVirtualizerItems(oldIndex, newIndex)`
   - Export all methods on `HomebaseBookmarkGridController` and `window`.

2. **Delegate Functions in `src/new-tab.js`**:
   - Replace original implementations (lines 2620 - 3000) with thin delegation wrappers forwarding to `window.HomebaseBookmarkGridController.*`.

3. **Verification Protocol**:
   - `node --check src/newtab/bookmarks/bookmark-grid-controller.js`
   - `node --check src/new-tab.js`
   - `node scripts/check-newtab-static.mjs`
   - `node scripts/smoke-newtab-file.mjs`
   - `npm.cmd test`
   - `npm.cmd run build`
   - `git diff --check`
   - `git diff src/preload.js src/instant_load.js manifests/ dist/`

4. **Risk Evaluation & Manual Browser Verification Decision**:
   - Analyze risk and state mandatory phrase if automated coverage is sufficient.

5. **Generate Implementation Report**:
   - Create `docs/81-cycle11-phase3-checkpoint3-report.md`.
