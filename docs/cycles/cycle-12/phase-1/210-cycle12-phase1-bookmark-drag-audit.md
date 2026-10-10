# Homebase Cycle #12 — Phase 1: Bookmark Drag & Drop Architecture Audit

**Document:** `docs/210-cycle12-phase1-bookmark-drag-audit.md`  
**Date:** October 8, 2026  
**Status:** COMPLETE (READ-ONLY AUDIT — AWAITING OWNER APPROVAL)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**Reference Modules:** [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js), [`src/newtab/bookmarks/bookmark-tabs-scroll.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js), [`src/newtab/bookmarks/bookmark-tree-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tree-service.js), [`src/newtab/bookmarks/bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js), [`src/assets/js/Sortable.min.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js)  

---

## 1. Executive Summary

Throughout Cycle #11, `src/new-tab.js` underwent extensive modularization, reducing its footprint from **4,341 lines** down to **1,800 lines** (>58.5% reduction) with **42 extracted modules** under `src/newtab/`. All 367 automated tests pass, zero declaration collisions exist across 62 deferred scripts, and all baseline invariants are 100% green.

Following the completion of Cycle #11 Phase 5, the legacy monolith `src/new-tab.js` retains only three primary areas of responsibility:
1. **Startup Orchestration & Boot Priming** (~464 lines) — `initializePage`, storage coordination, wallpaper boot priming.
2. **Idle Task Scheduler** (~299 lines) — `runWhenIdle`, `scheduleIdleTask`, budget slicing.
3. **Bookmark & Folder Tab Drag & Drop Subsystem** (**~745 lines of active logic / ~815 lines total**).

The Bookmark Drag & Drop subsystem is the **single remaining major domain business logic block** inside `src/new-tab.js`. It encapsulates third-party [Sortable.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js) bindings for the bookmark grid and folder tabs, pointer-tracking raycasts, folder hover-delay locking, optimistic in-memory tree manipulation, WebExtension `browser.bookmarks.move` invocations, and virtualizer synchronization.

This audit delivers an exhaustive, read-only architectural investigation of this subsystem in accordance with the `AGENTS.md` Owner Development Workflow (`Audit -> Plan -> Implement -> Verify -> Report -> Approval -> Commit -> Approval -> Push`). **No source files have been modified, and no commits or pushes have been performed.**

---

## 2. Current Architecture

### 2.1 Subsystem Overview

The drag and drop architecture in Homebase operates across two interconnected DOM containers:
- **`#bookmarks-grid`**: The multi-column bookmark container holding bookmarks, folders, and the navigation back-button.
- **`#bookmark-folder-tabs`**: The horizontal tab track holding root folder tabs and the folder creation button.

```
+-------------------------------------------------------------------------+
| #bookmark-folder-tabs (tabsSortable)                                   |
| [ Tab A ]  [ Tab B ]  [ Tab C ]  [ + Add ]                              |
|     ^                                                                   |
|     | (Hover highlight: .drop-target via global pointermove)            |
+-----|-------------------------------------------------------------------+
      |
+-----|-------------------------------------------------------------------+
| #bookmarks-grid (gridSortable)                                          |
| [ < Back ]   [ Item 1 ]   [ Folder X ]   [ Item 2 ]                     |
|                               ^                                         |
|                               | (Hover lock: .drag-over, 250ms delay)   |
+-------------------------------------------------------------------------+
```

### 2.2 Dual SortableJS Instances

Homebase initializes two independent SortableJS instances:

1. **Grid Sortable (`gridSortable`)**:
   - Initialized by `setupGridSortable(gridElement)` inside `src/new-tab.js` (lines 567–649).
   - Re-initialized reactively on DOM updates via debounced `scheduleSortableReinit(gridEl)` in [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L789).
   - Operates in `group: 'bookmarks'` with `draggable: '.bookmark-item:not(.back-button)'`.
   - Filter: `.grid-item-rename-input` (prevents dragging while typing an inline rename).
   - Animation: `250ms`.
   - Touch threshold: `delay: 150ms`, `delayOnTouchOnly: true`, `touchStartThreshold: 6px`.
   - Fallback rendering: `forceFallback: true`, `fallbackOnBody: true`, `fallbackClass: 'bookmark-fallback-ghost'`, `fallbackTolerance: 6px`.

2. **Folder Tabs Sortable (`tabsSortable`)**:
   - Initialized by `setupTabsSortable(tabsContainer)` inside `src/new-tab.js` (lines 1012–1088).
   - Invoked directly by `createFolderTabs` in [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1908).
   - Operates on `draggable: '.bookmark-folder-tab'`.
   - Filter: `.bookmark-folder-add-btn` (prevents dragging the add button).
   - Animation: `350ms` with custom easing `cubic-bezier(0.25, 1, 0.5, 1)` for smooth snapping.
   - Fallback rendering: `forceFallback: true`, `fallbackOnBody: true`, `fallbackClass: 'bookmark-fallback-ghost-tab'`, `fallbackTolerance: 5px`.

### 2.3 Cross-Container Drop Targeting (Grid to Tab)

SortableJS does not natively support dragging an item from a grid and dropping it onto an arbitrary external tab bar without defining a linked two-way group. Homebase solves this with a lightweight **global pointer tracking and raycasting loop**:
- A throttled `window.addEventListener('pointermove')` listener (lines 416–442) fires during active drag (`isGridDragging === true`).
- Coordinated through `requestAnimationFrame` with coordinates `lastDragX` and `lastDragY`.
- Invokes `handleGridDragPointerMove(evt)` which executes `document.elementFromPoint(clientX, clientY)`.
- If the point intersects a `.bookmark-folder-tab`, it assigns `.drop-target` class to highlight the tab and stores `activeTabDropTarget`.
- On release (`handleGridDrop`), `evt.originalEvent.clientX/Y` raycasts the drop target to determine whether the item was dropped onto a folder tab, a back button, or another folder tile.

---

## 3. Function Responsibility Map

| Function | Lines in `new-tab.js` | Responsibility | Inputs / Outputs | Dependencies & Globals | External APIs Used | Other Modules Affected |
|---|:---:|---|---|---|---|---|
| `window.pointermove` listener | 416–442 | Throttles mouse/pointer movement to `requestAnimationFrame` during active grid dragging | In: `PointerEvent`<br>Out: none | Read: `isGridDragging`, `dragMoveScheduled`, `lastDragX`, `lastDragY` | `requestAnimationFrame` | Window / Browser event loop |
| `setupGridSortable` | 567–649 | Configures Sortable.js on `#bookmarks-grid` with fallback ghosts, touch thresholds, and drag callbacks | In: `gridElement` (DOM)<br>Out: none | Mutates: `gridSortable`<br>Calls: `recordSortablePerfTiming`, `handleGridMove`, `handleGridDrop` | `Sortable.create` | [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) (`scheduleSortableReinit`) |
| `onClone` callback | 603–615 | Styles the fallback ghost clone when Sortable creates the synthetic dragging element | In: `evt` (Sortable Event)<br>Out: none | Reads DOM classes (`.bookmark-fallback-icon`, `.show-fallback`) | None | Fallback ghost DOM on `document.body` |
| `onStart` (Grid) callback | 617–629 | Sets dragging flag, applies `body.is-dragging-active`, strips entrance animations (`.newly-rendered`) | In: none<br>Out: none | Mutates: `isGridDragging`<br>Mutates DOM: `document.body` | DOM classList | [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js), [`bookmark-tabs-scroll.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js) |
| `onEnd` (Grid) callback | 631–639 | Removes `body.is-dragging-active`, delays clearing `isGridDragging` by 50ms (suppresses click), invokes `handleGridDrop` | In: `evt`<br>Out: none | Mutates: `isGridDragging`<br>Calls: `handleGridDrop(evt)` | `setTimeout` | [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) (`handleGridClick`) |
| `handleGridMove` | 663–759 | Sortable `onMove` callback: enforces folder hover delay (`FOLDER_HOVER_DELAY_MS = 250ms`) before locking layout and applying `.drag-over` | In: `evt`<br>Out: `boolean` (false locks sort, true permits reorder) | Mutates: `folderHoverTarget`, `folderHoverStart`, `lastGridDragOverItem` | `Date.now()` | SortableJS layout engine |
| `handleGridDragPointerMove` | 763–831 | Raycasts coordinates under cursor during drag to detect and highlight folder tab targets | In: `{ clientX, clientY }`<br>Out: none | Reads: `isGridDragging`<br>Mutates: `activeTabDropTarget` | `document.elementFromPoint` | Tab bar DOM (`.bookmark-folder-tab`) |
| `clearTabDropHighlight` | 835–843 | Clears `.drop-target` visual highlight from currently hovered folder tab | In: none<br>Out: none | Mutates: `activeTabDropTarget` | DOM classList | Tab bar DOM |
| `moveItemInLocalTree` | 855–866 | Optimistically mutates in-memory `bookmarkTree[0]` children array for intra-folder reordering | In: `parentId`, `oldIndex`, `newIndex`<br>Out: none | Mutates: `bookmarkTree[0]`<br>Calls: `findBookmarkNodeById` | None | In-memory bookmark tree cache |
| `syncVirtualizerMove` | 898–905 | Slices moved item from `virtualizerState.items` if moved into a folder | In: `id`, `newParentId`<br>Out: none | Reads/Mutates: `virtualizerState.items` | None | [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) |
| `handleGridDrop` | 872–994 | Main drop dispatcher: detects whether target is folder tile, tab, back-button, or grid index; performs optimistic updates; invokes WebExtension API | In: `evt`<br>Out: `Promise<void>` | Reads: `currentGridFolderNode`, `activeHomebaseFolderId`, `bookmarkTree`<br>Calls: `browser.bookmarks.move`, `getBookmarkTree`, `loadBookmarks` | `document.elementFromPoint`, `browser.bookmarks.move` | Browser bookmark database, UI grid, virtualizer |
| `setupTabsSortable` | 1012–1088 | Configures Sortable.js on `#bookmark-folder-tabs` with snap easing and drag callbacks | In: `tabsContainer` (DOM)<br>Out: none | Mutates: `tabsSortable`<br>Calls: `recordSortablePerfTiming`, `handleTabDrop`, `scrollActiveFolderTabIntoView` | `Sortable.create` | [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) (`createFolderTabs`) |
| `onStart` (Tabs) callback | 1054–1059 | Sets tab dragging flag, applies `body.is-tab-dragging` | In: none<br>Out: none | Mutates: `isTabDragging` | DOM classList | [`bookmark-tabs-scroll.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js), [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) |
| `onEnd` (Tabs) callback | 1063–1076 | Clears body class, delays clearing `isTabDragging` by 50ms, calls `handleTabDrop`, scrolls active tab into view | In: `evt`<br>Out: none | Mutates: `isTabDragging`<br>Calls: `handleTabDrop(evt)`, `scrollActiveFolderTabIntoView` | `setTimeout`, `requestAnimationFrame` | Tab track scroll manager |
| `handleTabDrop` | 1100–1220 | Calculates target bookmark index for tab reordering, invokes `browser.bookmarks.move`, and refreshes bookmark tree | In: `evt`<br>Out: `Promise<void>` | Reads: `activeHomebaseFolderId`, `rootDisplayFolderId`, `bookmarkTree`<br>Calls: `browser.bookmarks.move`, `getBookmarkTree`, `loadBookmarks` | `browser.bookmarks.move` | Browser bookmark database, UI tab track |

---

## 4. Tab Drag & Drop vs Grid Drag & Drop System

### 4.1 How Tab Movement Works

Folder tab reordering is initiated on `#bookmark-folder-tabs`.
1. The user drags a `.bookmark-folder-tab`.
2. SortableJS creates a fallback clone attached to `document.body` (`fallbackOnBody: true`) and applies `.sortable-ghost-tab` to the original position.
3. On drop (`handleTabDrop`):
   - Compares `evt.oldIndex === evt.newIndex`. If equal, bails out immediately.
   - Retrieves `draggedFolderId = evt.item.dataset.folderId`.
   - Locates `parentNode` using `findBookmarkNodeById(bookmarkTree[0], rootDisplayFolderId)`.
   - Filters `parentNode.children` to isolate folder nodes: `folderNodes = parentNode.children.filter(n => !n.url && n.children)`.
   - Determines target index:
     - **Special case (`movingDownIntoLast`)**: If dragging to the last tab from the left (`evt.newIndex === folderNodes.length - 1 && evt.oldIndex < evt.newIndex`), sets `targetBookmarkIndex = parentNode.children.length` to position the folder at the very end of the parent.
     - **Standard case**: Sets `targetBookmarkIndex = targetNode.index`.
   - Compares `targetBookmarkIndex === originalBookmarkIndex`. If identical, bails out.
   - Executes WebExtension API:
     ```javascript
     await browser.bookmarks.move(draggedFolderId, {
       parentId: rootDisplayFolderId,
       index: targetBookmarkIndex
     });
     ```
   - **Optimized UI Refresh**: If the currently active folder tab is not changing (`folderToKeepOpen === activeHomebaseFolderId`), Homebase fetches a background tree refresh (`await getBookmarkTree(true)`) **without calling `loadBookmarks()`**, completely eliminating visible UI flash. If the active tab changed, it calls `loadBookmarks(folderToKeepOpen)`.

### 4.2 How Tab Movement Differs from Grid Movement

| Dimension | Grid Drag & Drop (`setupGridSortable`) | Folder Tabs Drag & Drop (`setupTabsSortable`) |
|---|---|---|
| **Element Count** | Dozens to hundreds (arbitrary scale) | Small finite list (typically 1–15 tabs) |
| **Virtualization** | Integrated with `virtualizerState.items` | No virtualization; direct DOM rendering |
| **Action Types** | Dual: Intra-folder reorder OR Cross-folder move | Single: Intra-root folder reorder only |
| **Drop Targets** | Grid tiles, Folder tiles, Folder tabs, Back-button | Tab positions within the tab track only |
| **External Raycasting** | Yes: Uses `document.elementFromPoint` for tabs/folders | No: Handled entirely within Sortable container |
| **Hover Delay Lock** | Yes: 250ms delay timer prevents tile shuffling over folders | No: Sortable animations handle insertion point directly |
| **Index Offsets** | Must adjust for `.back-button` at index 0 | Must filter non-folder children under root folder |
| **Optimistic Rendering** | Visual drop requires no re-render; modifies memory tree | Non-active tab moves refresh tree in background |

### 4.3 Shared Logic Between Grid & Tab Systems

Despite their structural differences, both drag subsystems share fundamental design patterns:
1. **Sortable Fallback Strategy**: Both configure `forceFallback: true` and `fallbackOnBody: true` to bypass OS/browser drag-and-drop idiosyncrasies across Chrome and Firefox and allow full CSS control over ghost elements.
2. **Click Mis-fire Suppression**: Both use a `setTimeout(..., 50)` delay when resetting `isGridDragging` / `isTabDragging` to prevent the subsequent synthetic `click` event from navigating to a link or switching tabs immediately after a drag gesture finishes.
3. **Body State Classes**: Both toggle body state classes (`body.is-dragging-active`, `body.is-tab-dragging`) to enforce `cursor: grabbing` and suppress unwanted pointer events globally.
4. **WebExtension API Integration**: Both invoke `browser.bookmarks.move` and fallback gracefully to `loadBookmarks()` on API rejection.
5. **Startup Performance Instrumentation**: Both record initialization timings via `recordSortablePerfTiming('grid', ...)` and `recordSortablePerfTiming('tabs', ...)`.

---

## 5. Dependency Graph & Search All Dependencies

### 5.1 Repository-Wide Dependency Matrix

| Symbol / Identifier | Producer(s) | Consumer(s) | Type | Notes & Architectural Boundary Impact |
|---|---|---|---|---|
| `window.isGridDragging`<br>`isGridDragging` | `src/new-tab.js` (L470–481, L618, L635) | • `src/new-tab.js` (L418, L765)<br>• `bookmark-tabs-scroll.js` (L398)<br>• `bookmark-grid-controller.js` (L809, L1946) | Global Variable & Window Property | Defines active grid drag state. Used by scroll controller to block mousewheel scrolling and by grid controller to block bookmark click navigation. |
| `isTabDragging`<br>`window.isTabDragging` | `src/new-tab.js` (L484, L1056, L1066) | • `bookmark-tabs-scroll.js` (L398)<br>• `bookmark-grid-controller.js` (L1575, L1670) | Lexical Global (Missing Window Property!) | Blocks mousewheel scroll and tab click selection during tab drag. **Finding: Not formally mirrored to `window` via `Object.defineProperty`.** |
| `moveItemInLocalTree` | `src/new-tab.js` (L855) | • `src/new-tab.js` (L976) | Lexical Function | Optimistically reorders `parentNode.children` in memory. Pure internal helper. |
| `handleGridDrop` | `src/new-tab.js` (L872) | • `src/new-tab.js` (L637) | Callback | Executed by `gridSortable.onEnd`. Dispatches folder move vs grid reorder. |
| `handleTabDrop` | `src/new-tab.js` (L1100) | • `src/new-tab.js` (L1072) | Callback | Executed by `tabsSortable.onEnd`. Reorders tabs in browser storage. |
| `setupGridSortable` | `src/new-tab.js` (L567) | • `src/new-tab.js` (implicit global)<br>• `bookmark-grid-controller.js` (L799–802) | Global Function | Bound to DOM grid by `scheduleSortableReinit`. Cross-script invocation. |
| `setupTabsSortable` | `src/new-tab.js` (L1012) | • `bookmark-grid-controller.js` (L1901–1909) | Global Function | Bound to DOM tab track by `createFolderTabs`. Cross-script invocation. |
| `Sortable` | `src/assets/js/Sortable.min.js` (L3315 in `new-tab.html`) | • `src/new-tab.js`<br>• `bookmark-grid-controller.js`<br>• `sortable-bridge.js`<br>• `search-engine-settings.js`<br>• `widget-visibility.js` | Third-Party Global Library | Core drag-and-drop engine. Protected vendor asset under `src/assets/js/`. |

---

### 5.2 Critical Architectural Findings & Hidden Coupling

During this audit, four critical hidden couplings and subtle anomalies were discovered:

#### 1. The `currentGridFolderNode` Stale Shadowing Anomaly
In `src/new-tab.js`:
- Line 464 defines `let currentGridFolderNode = null;`.
- When `renderBookmarkGrid` was extracted into [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1058), that module created its own internal `let currentGridFolderNode = null;` and exposed it via `window.currentGridFolderNode = currentGridFolderNode;`.
- **`src/new-tab.js` never updates its own local `currentGridFolderNode` variable.**
- Inside `handleGridDrop` (lines 925, 954, 963):
  ```javascript
  const currentFolderId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;
  ```
  Because `currentGridFolderNode` in `new-tab.js` is always `null`, `currentFolderId` silently falls back to `activeHomebaseFolderId`! While this functions correctly for top-level tabs, if a user navigates into a nested subfolder, dropping an item inside the subfolder relies on `activeHomebaseFolderId` instead of the subfolder ID unless `window.currentGridFolderNode` is queried.
- **Resolution in future controller:** The new controller must resolve `currentGridFolderNode` dynamically from `window.currentGridFolderNode` or `window.HomebaseBookmarkGridController.getCurrentGridFolderNode()`.

#### 2. Duplicate Inline Virtualizer Logic
In `src/new-tab.js`:
- Line 898 defines an inline closure:
  ```javascript
  const syncVirtualizerMove = (id, newParentId = null) => {
    if (!virtualizerState.isEnabled) return;
    if (newParentId) {
      const idx = virtualizerState.items.findIndex(x => x.id === id);
      if (idx !== -1) virtualizerState.items.splice(idx, 1);
    }
  };
  ```
- Lines 978–986 directly splice `virtualizerState.items`:
  ```javascript
  const [movedItem] = virtualizerState.items.splice(evt.oldIndex, 1);
  virtualizerState.items.splice(evt.newIndex, 0, movedItem);
  ```
- **However, [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js#L1038-L1054) ALREADY implements and exports both `syncVirtualizerMove` and `reorderVirtualizerItems`!**
- **Resolution in future controller:** Replace redundant inline code with calls to `window.syncVirtualizerMove` / `window.reorderVirtualizerItems`.

#### 3. Asymmetric Window Property Definition
In `src/new-tab.js`:
- `isGridDragging` has a formal getter/setter on `window` (lines 473–481).
- `isTabDragging` has **no window getter/setter** (line 484 is just `let isTabDragging = false;`).
- Modules like `bookmark-grid-controller.js` must check `(typeof window !== 'undefined' && window.isTabDragging) || (typeof isTabDragging !== 'undefined' && isTabDragging)`.
- **Resolution in future controller:** Expose both `isGridDragging` and `isTabDragging` symmetrically on `window` with getters/setters.

#### 4. The Debounced Re-Initialization Chain
In `bookmark-grid-controller.js`:
- Lines 789–805 implement `scheduleSortableReinit(gridEl)` with a 150ms debounce.
- Called after every viewport render and every full grid render.
- Calls `window.setupGridSortable(gridEl)`.
- If the drag controller is extracted, this interface (`window.setupGridSortable`) must remain 100% backward-compatible.

---

## 6. Ownership Analysis

### 6.1 Current Architecture Boundary Violation

In the current codebase, `src/new-tab.js` violates single-responsibility boundaries:

```
src/new-tab.js (Current Monolithic Entanglement)
    ├── App Startup Orchestrator (initializePage)
    ├── Idle Task Scheduling Engine (runWhenIdle)
    ├── Wallpaper First-Frame Priming (primeWallpaperBackground)
    └── [VIOLATION] Bookmark Drag & Drop Subsystem (~815 lines)
             ├── SortableJS lifecycle management
             ├── Global pointermove coordinate capture
             ├── Drop target raycasting (document.elementFromPoint)
             ├── Hover timer state machine (FOLDER_HOVER_DELAY_MS)
             ├── Optimistic in-memory tree manipulation
             ├── Direct WebExtension browser.bookmarks.move calls
             └── Virtualizer state mutations
```

This violates separation of concerns:
1. `src/new-tab.js` is intended to be a **pure startup and lifecycle orchestrator**.
2. Drag and drop is an **interactive presentation-tier domain controller**.
3. Direct mutations to `virtualizerState.items` and `bookmarkTree[0]` inside `new-tab.js` bypass the dedicated bookmark domain services (`bookmark-grid-controller.js` and `bookmark-tree-service.js`).

---

### 6.2 Proposed Future Architecture

Extracting this subsystem into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) establishes a clean, decoupled boundary:

```
src/new-tab.js (Clean Bootstrapper & Coordinator)
    ├── App Startup Orchestrator (initializePage)
    ├── Idle Task Scheduling Engine (runWhenIdle)
    ├── Wallpaper First-Frame Priming
    └── Initializes HomebaseBookmarkDragController
             │
             ▼
src/newtab/bookmarks/bookmark-drag-controller.js (HomebaseBookmarkDragController)
    ├── State Management:
    │     ├── gridSortable, tabsSortable
    │     ├── isGridDragging, isTabDragging (mirrored to window)
    │     ├── activeTabDropTarget
    │     └── folderHoverTarget, folderHoverStart, lastGridDragOverItem
    ├── Event Listeners:
    │     ├── throttled window pointermove listener
    │     └── Sortable callbacks (onStart, onEnd, onMove, onClone)
    ├── Grid Drag Operations:
    │     ├── setupGridSortable(gridElement)
    │     ├── handleGridMove(evt)
    │     ├── handleGridDragPointerMove(evt)
    │     ├── clearTabDropHighlight()
    │     ├── handleGridDrop(evt)
    │     └── moveItemInLocalTree(parentId, oldIndex, newIndex)
    └── Tab Drag Operations:
          ├── setupTabsSortable(tabsContainer)
          └── handleTabDrop(evt)
```

**Evaluation:** This separation is **100% correct**. It isolates third-party vendor library manipulation into a single domain file and allows `new-tab.js` to shrink to pure orchestration.

---

## 7. Risk Assessment

| Risk Category | Severity | Analysis & Mitigation Strategy |
|---|:---:|---|
| **SortableJS Behavior & Fallback Clones** | **HIGH** | Sortable creates clones attached to `document.body` (`fallbackOnBody: true`). Any discrepancy in class names (`bookmark-fallback-ghost`, `sortable-chosen`) breaks dragging visuals in Firefox and Chrome. Must preserve exact option blocks. |
| **Bookmark Tree Mutation Safety** | **HIGH** | `moveItemInLocalTree` directly mutates `bookmarkTree[0].children`. If index calculation is off by even 1 (e.g. failing to account for `.back-button`), bookmarks will be permanently reordered in the user's browser database to incorrect positions. |
| **Optimistic UI Updates & Rollback** | **HIGH** | If `browser.bookmarks.move` fails or rejects (e.g. disk write failure or permissions glitch), the UI must cleanly revert using `loadBookmarks(folderId)`. Rollback logic must be preserved exactly. |
| **Virtualizer Synchronization** | **HIGH** | Splicing `virtualizerState.items` during drag must stay in perfect sync with live DOM nodes. If DOM indices and virtualizer indices diverge, subsequent scrolling will recycle incorrect elements. |
| **WebExtension API Quirks** | **MEDIUM** | Chrome and Firefox have minor timing differences in `browser.bookmarks.move` promise resolution. Keeping `await browser.bookmarks.move` with `.catch()` guards is mandatory. |
| **Click Suppression on Drop** | **MEDIUM** | When a drag ends, the mouse release fires a native `click` event. The 50ms delay in clearing `isGridDragging` / `isTabDragging` prevents misfiring bookmark navigation. Must not be altered or shortened. |
| **Global `pointermove` Event Loop** | **MEDIUM** | The pointermove listener fires on every mouse movement. Keeping the early `if (!isGridDragging) return;` guard and `requestAnimationFrame` throttle is essential to prevent CPU overhead. |
| **Startup Performance Impact** | **LOW** | Sortable instances are lazily bound upon first render of the grid and tabs track, not during initial synchronous parse. Zero startup performance degradation. |

**Overall Subsystem Risk:** **HIGH**  
*Rationale:* Explicitly designated as high-risk in `AGENTS.md` ("drag and reorder behavior"). Interacts directly with browser storage persistence, physical DOM elements, and WebExtension APIs.

---

## 8. Extraction Recommendation & Roadmap

### 8.1 Recommendation: **A) Extract in Cycle #12 using a disciplined multi-phase approach**

#### Rationale:
1. **Solves the Single Remaining Large Technical Debt**: At ~815 lines, drag & drop is the only non-orchestrator subsystem remaining in `src/new-tab.js`.
2. **Transforms `src/new-tab.js` into a True Bootstrapper**: Shrinks `src/new-tab.js` from 1,800 lines to **~1,000 lines** (a total 77% reduction from the original 4,341 lines).
3. **Fixes Latent Subfolder Drop Coupling**: Moving drag logic into a dedicated controller cleanly resolves the stale `currentGridFolderNode` shadowing anomaly.
4. **Clean Decoupling**: Eliminates duplicate inline virtualizer code and unifies `syncVirtualizerMove` and `reorderVirtualizerItems`.

---

### 8.2 Proposed Multi-Phase Implementation Roadmap for Cycle #12

```
Cycle #12: Bookmark Drag & Drop Modularization
 ├── Phase 1: Architecture Audit (Complete - docs/210-cycle12-phase1-bookmark-drag-audit.md)
 ├── Phase 2: Interface Contract & Plan (docs/211-cycle12-phase2-plan.md)
 ├── Phase 3: Grid Drag & Drop Extraction (src/newtab/bookmarks/bookmark-drag-controller.js)
 ├── Phase 4: Folder Tabs Drag & Drop Extraction
 └── Phase 5: Verification, Static Checks, Dual-Browser QA & Final Report
```

#### Detailed Phase Breakdown:
- **Phase 2: Contract Specification & Detailed Plan**
  - Define `window.HomebaseBookmarkDragController` public API.
  - Define backward compatibility global bridges (`window.setupGridSortable`, `window.setupTabsSortable`, `window.isGridDragging`, `window.isTabDragging`).
  - Plan exact script loading order in `src/new-tab.html`.
- **Phase 3: Grid Drag Controller Implementation**
  - Create `src/newtab/bookmarks/bookmark-drag-controller.js`.
  - Move pointer tracking, `setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop`.
  - Wire backward-compatible bridges in `src/new-tab.js`.
- **Phase 4: Folder Tabs Drag Controller Implementation**
  - Move `setupTabsSortable`, `handleTabDrop`.
  - Wire backward-compatible bridges in `src/new-tab.js`.
- **Phase 5: Final Validation & Integration**
  - Run full automated test suite (node syntax check, `check-newtab-static.mjs`, unit tests, browser smoke test).
  - Execute manual QA in Chrome and Firefox.
  - Document final line metrics and commit.

---

### 8.3 Expected Line Impact

| File | Current Lines | Projected Lines | Net Reduction |
|---|:---:|:---:|:---:|
| `src/new-tab.js` | 1,800 | **~1,020** | **-780 lines (-43.3%)** |
| `src/newtab/bookmarks/bookmark-drag-controller.js` | 0 (New) | ~750 | +750 lines (modularized) |

---

### 8.4 Testing & Verification Strategy

#### Automated Verification Checklist:
1. `node --check src/newtab/bookmarks/bookmark-drag-controller.js`
2. `node --check src/new-tab.js`
3. `node scripts/check-newtab-static.mjs` (verifies zero declaration collisions, valid deferred script order, no stale references)
4. `npm.cmd test` (runs all 367+ automated unit tests)
5. `npm.cmd run build:chrome`

#### Manual QA Checklist (Chrome & Firefox):
- **Grid Reordering**: Drag a bookmark tile between other tiles. Verify it snaps smoothly and persists order on new tab reload.
- **Folder Drop**: Drag a bookmark tile onto a folder tile. Verify it displays "DROP HERE", removes from current grid, and appears inside the folder.
- **Folder Hover Delay**: Drag an item slowly over a folder tile; verify tile layout does not reorder or glitch during the 250ms hover window.
- **Tab Drop**: Drag a bookmark tile from the grid up to a folder tab in the tab track. Verify tab highlights (`.drop-target`) and bookmark moves to that tab's folder.
- **Back-Button Drop**: Inside a subfolder, drag a bookmark tile onto the back-button. Verify it moves up to the parent folder.
- **Subfolder Reordering**: Reorder items inside a subfolder; verify index offset correctly accounts for the `.back-button` tile.
- **Tab Reordering**: Drag a folder tab to reorder tabs in the horizontal track. Verify tab order persists and active tab remains open without UI flash.
- **Click Suppression**: Perform a rapid drag and drop of a bookmark. Verify releasing the mouse does NOT inadvertently open the URL.
- **Virtualizer Stress Test**: With 200+ bookmarks in a folder, reorder tiles at the top, middle, and bottom. Verify no blank spaces or duplicate tiles appear upon scrolling.

---

## 9. Final Recommendation

**STOP AND WAIT FOR OWNER APPROVAL.**

Do NOT edit source files.  
Do NOT commit.  
Do NOT push.  

Wait for the owner's review of this audit document ([`docs/210-cycle12-phase1-bookmark-drag-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/210-cycle12-phase1-bookmark-drag-audit.md)). Upon approval, proceed to Cycle #12 Phase 2 (Implementation Plan & Contract Specification).
