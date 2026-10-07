# Homebase Cycle #12 — Phase 2: Bookmark Drag Controller Interface Contract & Implementation Plan

**Document:** `docs/211-cycle12-phase2-plan.md`  
**Date:** October 8, 2026  
**Status:** COMPLETE (PLANNING ONLY — AWAITING OWNER APPROVAL BEFORE IMPLEMENTATION)  
**Preceding Audit:** [`docs/210-cycle12-phase1-bookmark-drag-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/210-cycle12-phase1-bookmark-drag-audit.md)  
**Target Output Module:** `src/newtab/bookmarks/bookmark-drag-controller.js`  
**Target Monolith:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Current Extraction Scope

### 1.1 Code Moving from `src/new-tab.js` to `src/newtab/bookmarks/bookmark-drag-controller.js`

The entire Drag & Drop subsystem (~745 lines of active code / ~815 lines with comments) will be extracted into the dedicated module `src/newtab/bookmarks/bookmark-drag-controller.js`.

| Category | Functions / Blocks | Current Lines in `new-tab.js` | Target Location in New Module |
|---|---|:---:|---|
| **Shared State & Pointer Tracking** | • `pointermove` throttled listener loop (`dragMoveScheduled`, `lastDragX`, `lastDragY`)<br>• Drag state variables (`isGridDragging`, `isTabDragging`, `activeTabDropTarget`)<br>• Hover delay variables (`folderHoverTarget`, `folderHoverStart`, `lastGridDragOverItem`, `FOLDER_HOVER_DELAY_MS`)<br>• `sortableTimeout` | 406–442<br>462–505 | Private state & `initialize()` method in `bookmark-drag-controller.js` |
| **Grid Drag & Drop** | • `setupGridSortable(gridElement)`<br>• `onClone` callback (ghost fallback styling)<br>• `onStart` callback (body dragging class, animation strip)<br>• `onEnd` callback (click suppression timer, drop dispatch)<br>• `handleGridMove(evt)` (250ms folder hover lock)<br>• `handleGridDragPointerMove(evt)` (raycasting tab drop target)<br>• `clearTabDropHighlight()`<br>• `moveItemInLocalTree(parentId, oldIndex, newIndex)`<br>• `handleGridDrop(evt)` (case A: folder/tab/back move, case B: intra-grid reorder) | 567–649<br>663–759<br>763–831<br>835–843<br>855–866<br>872–994 | Grid Drag Operations in `bookmark-drag-controller.js` |
| **Folder Tabs Drag & Drop** | • `setupTabsSortable(tabsContainer)`<br>• `onStart` callback (`body.is-tab-dragging`)<br>• `onEnd` callback (click suppression, drop dispatch, tab auto-scroll)<br>• `handleTabDrop(evt)` (tab index resolution, `movingDownIntoLast` handling, `browser.bookmarks.move`) | 1012–1088<br>1100–1220 | Tabs Drag Operations in `bookmark-drag-controller.js` |

---

### 1.2 Code Intentionally Remaining in `src/new-tab.js`

To maintain architectural stability and adhere strictly to `AGENTS.md` rules, the following code remains in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
1. **Startup Orchestration (`initializePage`)** (Lines 1307–1735): Coordinates parallel storage loads, settings synchronization, dynamic accent color calculation, and `markPageReadyOnce`.
2. **Idle Task Scheduler** (Lines 25–323): Time-sliced cooperative execution runtime (`runWhenIdle`, `scheduleIdleTask`, `IDLE_TASK_BUDGET_MS = 12`).
3. **Wallpaper Startup Boot Priming** (Lines 327–391): First-frame synchronous poster resolution preventing white flash.
4. **DOM Ready & Load Entry Points** (Lines 1766–1800): `DOMContentLoaded` and `window.load` listeners.
5. **Bookmark Loader Compatibility Bridges** (Lines 1222–1286): Thin delegation wrappers for `processBookmarks`, `loadBookmarks`, `loadBookmarkMetadata`, etc.
6. **Backward Compatibility Bridges for Drag & Drop**: Lightweight global forwarders to `window.HomebaseBookmarkDragController`.

---

## 2. Public API Contract: `window.HomebaseBookmarkDragController`

The new module will expose a clean, comprehensive controller namespace on `window`:

```javascript
window.HomebaseBookmarkDragController = {
  // Lifecycle
  initialize(options = {}): void,
  destroy(): void,

  // Sortable Setup
  setupGridSortable(gridElement: HTMLElement): Sortable | null,
  setupTabsSortable(tabsContainer: HTMLElement): Sortable | null,

  // Drag State Accessors
  isGridDragging(): boolean,
  isTabDragging(): boolean,
  getGridSortable(): Sortable | null,
  getTabsSortable(): Sortable | null,

  // Internal Action Hooks (exposed for testing & delegation)
  handleGridDrop(evt: object): Promise<void>,
  handleTabDrop(evt: object): Promise<void>,
  moveItemInLocalTree(parentId: string, oldIndex: number, newIndex: number): void,
  clearTabDropHighlight(): void
};
```

### Detailed Method Responsibilities

1. **`initialize(options = {})`**:
   - Attaches the throttled `window.addEventListener('pointermove')` listener (using `requestAnimationFrame`).
   - Injects optional dependencies (allows unit testing without a live browser environment):
     - `options.browserApi`: defaults to `window.browser || window.chrome`.
     - `options.getBookmarkTree`: defaults to `window.getBookmarkTree`.
     - `options.loadBookmarks`: defaults to `window.loadBookmarks`.
     - `options.getCurrentGridFolderNode`: defaults to `window.HomebaseBookmarkGridController?.getCurrentGridFolderNode`.
   - Idempotent: Can be called multiple times safely without attaching duplicate event listeners.

2. **`setupGridSortable(gridElement)`**:
   - Validates that `Sortable` is available via `recordSortableLibraryAvailability()`.
   - Destroys existing `gridSortable` instance if already active.
   - Creates new `Sortable` instance on `gridElement` with production configuration:
     - `animation: 250`
     - `group: 'bookmarks'`
     - `draggable: '.bookmark-item:not(.back-button)'`
     - `filter: '.grid-item-rename-input'`
     - `dataIdAttr: 'data-bookmark-id'`
     - `delay: 150`, `delayOnTouchOnly: true`, `touchStartThreshold: 6`
     - `ghostClass: 'bookmark-placeholder'`
     - `chosenClass: 'sortable-chosen'`
     - `dragClass: 'sortable-drag'`
     - `forceFallback: true`, `fallbackClass: 'bookmark-fallback-ghost'`, `fallbackOnBody: true`, `fallbackTolerance: 6`
   - Binds callbacks: `onClone`, `onStart`, `onEnd`, `onMove` (`handleGridMove`).
   - Records performance timing via `recordSortablePerfTiming('grid', ...)`.
   - Returns the created `Sortable` instance.

3. **`setupTabsSortable(tabsContainer)`**:
   - Destroys existing `tabsSortable` instance if active.
   - Creates new `Sortable` instance on `tabsContainer` with configuration:
     - `animation: 350`, `easing: 'cubic-bezier(0.25, 1, 0.5, 1)'`
     - `draggable: '.bookmark-folder-tab'`
     - `filter: '.bookmark-folder-add-btn'`
     - `ghostClass: 'sortable-ghost-tab'`
     - `chosenClass: 'sortable-chosen-tab'`
     - `dragClass: 'sortable-drag-tab'`
     - `forceFallback: true`, `fallbackOnBody: true`, `fallbackClass: 'bookmark-fallback-ghost-tab'`, `fallbackTolerance: 5`
     - `setData: (dt, el) => dt.setData('text/plain', el.dataset.folderId || '')`
   - Binds callbacks: `onStart`, `onEnd`.
   - Records performance timing via `recordSortablePerfTiming('tabs', ...)`.
   - Returns the created `Sortable` instance.

4. **`destroy()`**:
   - Destroys `gridSortable` and `tabsSortable`.
   - Removes `window.pointermove` listener.
   - Clears any pending `requestAnimationFrame` or `setTimeout` handles.
   - Resets state flags (`isGridDragging = false`, `isTabDragging = false`, `activeTabDropTarget = null`).
   - Clears CSS classes from `document.body` (`is-dragging-active`, `is-tab-dragging`).

---

## 3. Backward Compatibility Bridges

Existing modules in the repository rely on global functions and variables. The new module will establish backward compatibility bridges on `window` immediately upon script evaluation:

```javascript
// Global function forwarders
if (typeof window !== 'undefined') {
  window.setupGridSortable = function(gridElement) {
    return window.HomebaseBookmarkDragController.setupGridSortable(gridElement);
  };

  window.setupTabsSortable = function(tabsContainer) {
    return window.HomebaseBookmarkDragController.setupTabsSortable(tabsContainer);
  };

  // Symmetric bidirectional getter/setter bridges
  if (!('isGridDragging' in window)) {
    Object.defineProperty(window, 'isGridDragging', {
      get: () => window.HomebaseBookmarkDragController.isGridDragging(),
      set: (val) => { /* controlled internally */ },
      configurable: true,
      enumerable: true
    });
  }

  if (!('isTabDragging' in window)) {
    Object.defineProperty(window, 'isTabDragging', {
      get: () => window.HomebaseBookmarkDragController.isTabDragging(),
      set: (val) => { /* controlled internally */ },
      configurable: true,
      enumerable: true
    });
  }
}
```

### Analysis of Callers & Bridge Lifespan:
1. **`window.setupGridSortable`**:
   - Caller: [`src/newtab/bookmarks/bookmark-grid-controller.js:799`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L799) (`scheduleSortableReinit`).
   - *Lifespan:* Permanent compatibility bridge until `bookmark-grid-controller.js` is updated in a future cycle.
2. **`window.setupTabsSortable`**:
   - Caller: [`src/newtab/bookmarks/bookmark-grid-controller.js:1901`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1901) (`createFolderTabs`).
   - *Lifespan:* Permanent compatibility bridge.
3. **`window.isGridDragging` & `window.isTabDragging`**:
   - Callers:
     - [`src/newtab/bookmarks/bookmark-tabs-scroll.js:398`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js#L398) (`handleWheel`).
     - [`src/newtab/bookmarks/bookmark-grid-controller.js:809`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L809) (`updateVirtualGrid`).
     - [`src/newtab/bookmarks/bookmark-grid-controller.js:1575`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1575) (`handleTabClick`).
     - [`src/newtab/bookmarks/bookmark-grid-controller.js:1946`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1946) (`handleGridClick`).
   - *Lifespan:* Permanent compatibility bridges.

---

## 4. Dependency Contract

To eliminate hidden coupling and solve the architectural flaws identified in the Phase 1 audit, each dependency is categorized and accessed via a disciplined protocol:

| Dependency | Classification | Protocol & Resolution Strategy |
|---|:---:|---|
| **`browser.bookmarks.move`** | **A & B** (Injectable / Window API) | Defaults to `(typeof browser !== 'undefined' ? browser : chrome).bookmarks.move`. Can be injected via `initialize({ browserApi })` for tests. |
| **`bookmarkTree`** | **B** (Window Bridge) | Accessed as `window.bookmarkTree` (backed by the bidirectional getter/setter in `bookmark-tree-service.js`). |
| **`findBookmarkNodeById`** | **B** (Window Bridge) | Accessed via `(typeof findBookmarkNodeById === 'function' ? findBookmarkNodeById : window.findBookmarkNodeById)`. |
| **`getBookmarkTree`** | **B** (Window Bridge) | Accessed via `(typeof getBookmarkTree === 'function' ? getBookmarkTree : window.getBookmarkTree)`. |
| **`loadBookmarks`** | **B** (Window Bridge) | Accessed via `(typeof loadBookmarks === 'function' ? loadBookmarks : window.loadBookmarks)`. Used exclusively for error rollback. |
| **`currentGridFolderNode`** | **B** (Window Bridge) | **FIX FOR AUDIT FINDING #1:** Instead of relying on a stale local variable, resolve dynamically via `(window.HomebaseBookmarkGridController?.getCurrentGridFolderNode ? window.HomebaseBookmarkGridController.getCurrentGridFolderNode() : window.currentGridFolderNode)`. This guarantees drops inside nested subfolders target the correct subfolder ID! |
| **`activeHomebaseFolderId`** | **B** (Window Bridge) | Resolved dynamically via `(window.HomebaseBookmarkGridController?.getActiveHomebaseFolderId ? window.HomebaseBookmarkGridController.getActiveHomebaseFolderId() : window.activeHomebaseFolderId)`. |
| **`rootDisplayFolderId`** | **B** (Window Bridge) | Resolved dynamically via `(window.HomebaseBookmarkLoader?.getRootDisplayFolderId ? window.HomebaseBookmarkLoader.getRootDisplayFolderId() : window.rootDisplayFolderId)`. |
| **`syncVirtualizerMove`** | **B** (Window Bridge) | **FIX FOR AUDIT FINDING #2:** Delegate to canonical `window.syncVirtualizerMove` or `window.HomebaseBookmarkGridController.syncVirtualizerMove`. Eliminate redundant duplicate closure! |
| **`reorderVirtualizerItems`** | **B** (Window Bridge) | **FIX FOR AUDIT FINDING #2:** Delegate to canonical `window.reorderVirtualizerItems` or `window.HomebaseBookmarkGridController.reorderVirtualizerItems`. Eliminate raw array splicing of `virtualizerState.items`! |
| **`scrollActiveFolderTabIntoView`** | **B** (Window Bridge) | Resolved via `window.scrollActiveFolderTabIntoView`. |
| **`Sortable`** | **B** (Vendor Global) | Loaded by `src/assets/js/Sortable.min.js`. Guarded with `recordSortableLibraryAvailability()`. |
| **`#bookmarks-grid` & `#bookmark-folder-tabs`** | **C** (Moved Ownership) | DOM element instances passed directly as arguments to `setupGridSortable` and `setupTabsSortable`. |

---

## 5. State Ownership Design

All internal drag-related mutable state will be encapsulated inside the module's private closure. **Zero top-level variables will leak into the global lexical environment**, preventing `check-newtab-static.mjs` collision errors:

```javascript
// Inside src/newtab/bookmarks/bookmark-drag-controller.js IIFE:
(function() {
  'use strict';

  // --- Sortable Instances ---
  let _gridSortable = null;
  let _tabsSortable = null;

  // --- Active Drag Flags ---
  let _isGridDragging = false;
  let _isTabDragging = false;

  // --- Drop Target & Hover State ---
  let _activeTabDropTarget = null;
  let _folderHoverTarget = null;
  let _folderHoverStart = 0;
  let _lastGridDragOverItem = null;
  const FOLDER_HOVER_DELAY_MS = 250;

  // --- Pointer Move Throttling State ---
  let _dragMoveScheduled = false;
  let _lastDragX = 0;
  let _lastDragY = 0;
  let _pointerMoveHandler = null;

  // ... implementation functions ...
})();
```

### Complete State Migration Mapping

| Current Monolith Variable in `new-tab.js` | Action in `src/new-tab.js` | Location in New Controller |
|---|---|---|
| `let gridSortable` | **REMOVE** | Private `_gridSortable` |
| `let tabsSortable` | **REMOVE** | Private `_tabsSortable` |
| `let isGridDragging` | **REMOVE** (Replace with `window.isGridDragging` bridge) | Private `_isGridDragging` (mirrored via getter) |
| `let isTabDragging` | **REMOVE** (Replace with `window.isTabDragging` bridge) | Private `_isTabDragging` (mirrored via getter) |
| `let activeTabDropTarget` | **REMOVE** | Private `_activeTabDropTarget` |
| `let folderHoverTarget` | **REMOVE** | Private `_folderHoverTarget` |
| `let folderHoverStart` | **REMOVE** | Private `_folderHoverStart` |
| `let lastGridDragOverItem` | **REMOVE** | Private `_lastGridDragOverItem` |
| `const FOLDER_HOVER_DELAY_MS` | **REMOVE** | Private `FOLDER_HOVER_DELAY_MS` |
| `let lastDragX`, `let lastDragY` | **REMOVE** | Private `_lastDragX`, `_lastDragY` |
| `let dragMoveScheduled` | **REMOVE** | Private `_dragMoveScheduled` |
| `let currentGridFolderNode = null;` | **REMOVE** (Eliminates stale variable) | N/A (Resolved dynamically via bridge) |

---

## 6. Extraction Order & Migration Sequence

To prevent runtime breakage during development, extraction will proceed in strict atomic steps:

```
Step 1: Create Module Shell
   Create src/newtab/bookmarks/bookmark-drag-controller.js
   Define IIFE, HomebaseBookmarkDragController API skeleton, and window bridges.

Step 2: Script Tag Registration
   Add <script src="newtab/bookmarks/bookmark-drag-controller.js" defer></script>
   Insert at line 3358 in src/new-tab.html (immediately after bookmark-grid-controller.js).

Step 3: Move Pointer Tracking & Shared Drag State
   Implement pointermove throttled listener, handleGridDragPointerMove, clearTabDropHighlight.

Step 4: Move Grid Sortable Logic
   Move setupGridSortable, handleGridMove, moveItemInLocalTree, handleGridDrop.
   Integrate canonical syncVirtualizerMove and reorderVirtualizerItems.

Step 5: Move Folder Tabs Sortable Logic
   Move setupTabsSortable, handleTabDrop.

Step 6: Update Monolith (src/new-tab.js)
   Remove extracted functions and state variables from src/new-tab.js.
   Call HomebaseBookmarkDragController.initialize() during initializePage().

Step 7: Static Analysis & Validation
   Update scripts/check-newtab-static.mjs (add new module to keyExtractedModulePaths).
   Run node --check, check-newtab-static.mjs, unit tests, and Chrome build.
```

---

## 7. Testing Plan

### 7.1 Automated Verification Suite

Before each commit, run:
```powershell
node --check src/newtab/bookmarks/bookmark-drag-controller.js
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build:chrome
```

### 7.2 Manual QA Checklist (Chrome & Firefox)

Because this involves DOM events and WebExtension bookmark persistence, manual testing is mandatory across both Chrome and Firefox:

| Test Scenario | Action | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| **1. Grid Tile Reordering** | Drag bookmark item A between B and C in current folder. | Tile snaps smoothly. Local order updates immediately. Bookmark tree order persists after reloading the tab. | No visual flickering; order preserved on reload. |
| **2. Drop into Folder Tile** | Drag bookmark item onto a folder tile in the grid. | "DROP HERE" badge appears on folder. On release, item disappears from current grid and appears inside target folder. | Correct `browser.bookmarks.move({ parentId })` executed. |
| **3. Folder Hover Lock (<250ms)** | Drag item swiftly across multiple folder tiles without lingering. | Normal Sortable tile displacement occurs; folder layout does not prematurely lock. | Smooth transition without layout jerkiness. |
| **4. Folder Hover Lock (>250ms)** | Hover an item over a folder tile for >250ms. | `.drag-over` class applies, layout locks (Sortable does not shuffle tiles around the folder), item is ready to drop into folder. | Layout locked until cursor leaves folder. |
| **5. Drop onto Folder Tab** | Drag bookmark item from the grid up to a folder tab in the top tab track. | Tab highlights with `.drop-target` halo. On release, item moves into that tab's folder. | Item removed from grid; tab highlight clears. |
| **6. Drop onto Back Button** | Inside a subfolder, drag a bookmark item onto the `< Back` tile. | Back button highlights with `.drag-over`. On release, item moves up to the parent folder. | Item leaves subfolder; appears in parent folder. |
| **7. Subfolder Index Offset** | Inside a subfolder (which has a `< Back` tile at index 0), reorder bookmark items. | Items reorder accurately without index off-by-one errors. | Back button index subtracted correctly. |
| **8. Folder Tab Reordering** | Drag folder tab A between tab B and C in horizontal tab track. | Tabs smoothly snap with cubic-bezier easing. Active tab content remains displayed without full page reload. | Tab order persists on new tab reload. |
| **9. Tab Drop to Last Slot** | Drag tab from the left to the rightmost position (`movingDownIntoLast`). | Tab moves to the very end of root folder children. | Reorders properly; no off-by-one clipping. |
| **10. Click Mis-fire Suppression** | Rapidly click-and-drag a bookmark by 10px and immediately release. | Browser does NOT open the link in a new tab or current tab. | Drag release swallows the subsequent `click` event. |
| **11. Virtualizer Stress Test** | In a folder with 200+ bookmarks, reorder items at top, middle, and bottom of scroll range. | Items reorder seamlessly; scrolling does not produce duplicate or blank tiles. | `reorderVirtualizerItems` stays in sync with DOM. |
| **12. Error Rollback Test** | Simulate API rejection on `browser.bookmarks.move`. | UI catches error and reloads bookmarks via `loadBookmarks()`, restoring visual consistency. | Console records warning; no corrupted ghost state. |

---

## 8. Rollback Strategy

If any regression occurs during extraction, the safety protocol specifies:

1. **API Rejection Rollback**:
   - Both `handleGridDrop` and `handleTabDrop` wrap `browser.bookmarks.move` in `try...catch` blocks.
   - If the API rejects, the controller immediately invokes `loadBookmarks(parentId)` to reload the true state from browser storage.
2. **Sortable Lifecycle Failure**:
   - If `Sortable.create` throws or Sortable is missing, `recordSortablePerfTiming(..., 'failed')` logs the diagnostic.
   - The grid remains functional as a standard clickable list (click delegation operates independently).
3. **Emergency Git Rollback**:
   - Because changes are made in atomic phase checkpoints, any step can be reverted cleanly via `git checkout -- <file>` before commit.

---

## 9. Expected Impact & Metrics

### 9.1 Line Count Projections

| Target | Baseline (Start of Cycle #12) | Projected Post-Phase 4 | Expected Difference |
|---|:---:|:---:|:---:|
| `src/new-tab.js` | **1,800 lines** | **~1,020 lines** | **-780 lines (-43.3%)** |
| `src/newtab/bookmarks/bookmark-drag-controller.js` | 0 lines (New) | **~750 lines** | +750 lines |
| **Total Monolith Reduction from Baseline (v0.16.0 pre-Cycle #11):** | 4,341 lines | **~1,020 lines** | **-3,321 lines (-76.5%)** |

---

## 10. Final Recommendation & Stop Condition

**STOP AND WAIT FOR OWNER APPROVAL.**

Do NOT edit source files.  
Do NOT create `src/newtab/bookmarks/bookmark-drag-controller.js`.  
Do NOT commit.  
Do NOT push.  

Wait for the owner's review and approval of this plan ([`docs/211-cycle12-phase2-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/211-cycle12-phase2-plan.md)). Upon approval, proceed to Cycle #12 Phase 3 (Grid Drag & Drop Extraction).
