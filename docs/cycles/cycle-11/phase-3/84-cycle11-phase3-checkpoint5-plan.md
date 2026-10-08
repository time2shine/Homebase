# Homebase Improvement Cycle #11 Phase 3 Checkpoint 5 — Implementation Plan
## Bookmark Folder Tabs & Navigation Runtime Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 Checkpoint 5  
> **Target Release**: Homebase v0.18.0  
> **Target Files**:  
> - `src/newtab/bookmarks/bookmark-grid-controller.js`  
> - `src/new-tab.js`  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/75-cycle11-phase3-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/75-cycle11-phase3-audit.md), [docs/83-cycle11-phase3-checkpoint4-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/83-cycle11-phase3-checkpoint4-report.md)

---

## 1. Context & Objectives

Across Checkpoints 1 through 4 of Cycle #11 Phase 3:
1. `src/newtab/bookmarks/bookmark-grid-controller.js` was created and systematically populated with controller state, metadata diffing, card/folder presentation, grid virtualization, grid reconciliation, and rename/edit UI.
2. `src/new-tab.js` was reduced from 6,942 lines down to 5,738 lines.
3. Tooling and documentation through Checkpoint 4 was consolidated in commit `ff13fd6`.

### Checkpoint 5 Objective:
Extract the **Bookmark Folder Tabs & Navigation Runtime** into `src/newtab/bookmarks/bookmark-grid-controller.js`:
- `createFolderTabs(homebaseFolder, activeFolderId = null, options = {})`
- `setupBookmarkFolderAddTooltip(addButton, addTooltip)`
- Active folder state management (`getActiveHomebaseFolderId()`, `setActiveHomebaseFolderId(id)`)
- Tab rendering, selection, activation, and DOM reconciliation
- Tab event handlers (click, double click rename, context menu edit/delete)
- Add button inline folder creation workflow (`.bookmark-folder-inline-editor`, animation lifecycle, save/cancel actions)
- Integration with tab overflow updates and smooth scroll (`updateBookmarkTabOverflow`, `scrollActiveFolderTabIntoView`)

---

## 2. Dependency & Architectural Boundaries

### A. DOM Ownership
- **Folder Tabs Container**: `#bookmark-folder-tabs` (`getBookmarkFolderTabsContainer()`).
- **Tabs Track Container**: `#bookmark-tabs-track` (`getBookmarkTabsTrack()`).
- **Tabs Wrapper**: `.bookmark-tabs-wrapper`.
- **Inline Editor Host**: Host element containing `.bookmark-folder-inline-editor`.
- **Context Menu Elements**: `#bookmark-folder-menu`, `#menu-edit-btn`, `#menu-delete-btn`.

### B. State Management
- `activeHomebaseFolderId`: Encapsulated in `bookmark-grid-controller.js` with accessors `getActiveHomebaseFolderId` and `setActiveHomebaseFolderId`. Bidirectionally synced with `window.activeHomebaseFolderId` and lexical state in `src/new-tab.js`.
- `isTabDragging`: Guard preventing click/double-click action while dragging tabs. Resolved defensively.

### C. Service Integration
- `renderBookmarkGrid`: Already owned by `bookmark-grid-controller.js`.
- `showEditInput`: Already owned by `bookmark-grid-controller.js`.
- `createSvgIconElement`: Theme/SVG icon generator from `src/data.js`.
- `createNewBookmarkFolder`: Folder creation dispatcher.
- `deleteBookmarkFolder` & `showDeleteConfirm`: Deletion confirmation and handler.
- `setupTabsSortable`: Sortable.js tab drag-and-drop initializer (kept in `src/new-tab.js` per high-risk boundary rules, invoked safely via callback or window reference).
- `updateBookmarkTabOverflow` & `scrollActiveFolderTabIntoView`: Tab scroll layout runtime from `src/newtab/bookmarks/bookmark-tabs-scroll.js`.

### D. Compatibility Bridge Plan
1. **Global Controller Surface**:
   - `window.HomebaseBookmarkGridController.createFolderTabs`
   - `window.HomebaseBookmarkGridController.setupBookmarkFolderAddTooltip`
   - `window.HomebaseBookmarkGridController.getActiveHomebaseFolderId`
   - `window.HomebaseBookmarkGridController.setActiveHomebaseFolderId`
2. **Direct Global Window Exports**:
   - `window.createFolderTabs = createFolderTabs`
   - `window.setupBookmarkFolderAddTooltip = setupBookmarkFolderAddTooltip`
3. **Delegation Wrappers in `src/new-tab.js`**:
   - Backward-compatibility shims forwarding to controller methods while synchronizing lexical variables.

---

## 3. Implementation Steps

1. **Implement in `src/newtab/bookmarks/bookmark-grid-controller.js`**:
   - Add `activeHomebaseFolderId` state and accessors.
   - Implement `setupBookmarkFolderAddTooltip(addButton, addTooltip)`.
   - Implement `createFolderTabs(homebaseFolder, activeFolderId, options)`.
   - Register new methods on `HomebaseBookmarkGridController` and `window`.

2. **Delegate in `src/new-tab.js`**:
   - Replace `setupBookmarkFolderAddTooltip` (lines 2902-2951) with delegation shim.
   - Replace `createFolderTabs` (lines 2953-3400) with delegation shim.

3. **Verify**:
   - `node --check` on both files.
   - Static invariants check (`scripts/check-newtab-static.mjs`).
   - Browser smoke test (`scripts/smoke-newtab-file.mjs`).
   - Full test suite (`npm.cmd test`).
   - Build distributions (`npm.cmd run build`).
   - Diff check (`git diff --check`).
   - Verify protected files untouched.

4. **Document & Report**:
   - Generate `docs/85-cycle11-phase3-checkpoint5-report.md`.
