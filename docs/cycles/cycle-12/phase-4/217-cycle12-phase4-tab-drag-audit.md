# Homebase Cycle #12 — Phase 4: Tab Drag & Drop Architecture Audit

**Document:** `docs/217-cycle12-phase4-tab-drag-audit.md`  
**Date:** October 8, 2026  
**Status:** COMPLETE (READ-ONLY AUDIT — AWAITING OWNER REVIEW)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**Target Controller:** [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)  
**Reference Modules:** [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js), [`src/newtab/bookmarks/bookmark-tabs-scroll.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js), [`src/newtab/bookmarks/bookmark-tree-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tree-service.js), [`src/newtab/bookmarks/bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js), [`src/assets/js/Sortable.min.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js)  

---

## 1. Executive Summary

With the successful extraction and remote push of the Bookmark Grid Drag & Drop subsystem in Phase 3-B (commits `31329a2` and `7cc7b79`), [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) has been reduced to **1,342 lines**.

The **last remaining piece of drag-and-drop business logic** inside [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) is the **Folder Tab Drag & Drop Subsystem** (~215 lines). It manages:
- Sortable.js initialization on the horizontal bookmark folder tab strip (`setupTabsSortable`).
- Visual states and CSS drag classes (`is-tab-dragging`, `sortable-ghost-tab`, `sortable-chosen-tab`, `sortable-drag-tab`).
- Tab drop handling, child index calculation, and persistent reordering via `browser.bookmarks.move` (`handleTabDrop`).
- Suppression of tab click misfires via `isTabDragging` and post-drop horizontal tab alignment via `scrollActiveFolderTabIntoView`.

Extracting this subsystem into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) will unite both Grid and Tab drag domains into a single canonical controller, completing the modularization of drag interactions and reducing [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) to ~1,137 lines.

---

## 2. Inventory of Remaining Tab Drag Responsibilities in `src/new-tab.js`

### 2.1 State Variables & Top-Level Declarations

1. **`tabsSortable`** (line 427):
   ```javascript
   let tabsSortable = null; // Instance for the folder tabs (managed by setupTabsSortable)
   ```
   Holds the active SortableJS instance for folder tabs.
2. **`isTabDragging`** (lines 453–465):
   ```javascript
   let isTabDragging = false; // Track tab drag state to avoid click misfires
   if (typeof window !== 'undefined') {
     try {
       Object.defineProperty(window, 'isTabDragging', {
         get: () => isTabDragging,
         set: (val) => { isTabDragging = Boolean(val); },
         configurable: true,
         enumerable: true
       });
     } catch (_) {
       window.isTabDragging = isTabDragging;
     }
   }
   ```
   Prevents accidental click navigation or folder tab selection when a drag action finishes.

### 2.2 Functions

1. **`setupTabsSortable(tabsContainer)`** (lines 547–626, ~80 lines):
   - Measures SortableJS startup performance via `getPerfMeasureStart()` and `recordSortablePerfTiming('tabs', start, status)`.
   - Destroys prior instance if `tabsSortable` is present.
   - Instantiates `Sortable.create(tabsContainer, { ... })` with options:
     - `animation: 350`, `easing: "cubic-bezier(0.25, 1, 0.5, 1)"`
     - `draggable: '.bookmark-folder-tab'`, `filter: '.bookmark-folder-add-btn'`
     - `ghostClass: 'sortable-ghost-tab'`, `chosenClass: 'sortable-chosen-tab'`, `dragClass: 'sortable-drag-tab'`
     - `forceFallback: true`, `fallbackOnBody: true`, `fallbackClass: 'bookmark-fallback-ghost-tab'`, `fallbackTolerance: 5`
     - `setData`: sets `text/plain` to `dragEl.dataset.folderId`.
     - `onStart`: sets `isTabDragging = true`, adds `is-tab-dragging` class to `document.body`.
     - `onEnd`: sets 50ms timer to clear `isTabDragging`, removes `is-tab-dragging` from `document.body`, invokes `handleTabDrop(evt)`, and schedules smooth tab scroll via `requestAnimationFrame(() => scrollActiveFolderTabIntoView({ behavior: 'smooth' }))`.
     - `preventOnFilter: true`
   - Global export: `window.setupTabsSortable = setupTabsSortable`.

2. **`handleTabDrop(evt)`** (lines 638–758, ~121 lines):
   - Early exit if `evt.oldIndex === evt.newIndex`.
   - Retrieves `previouslyActiveFolderId` from `activeHomebaseFolderId`.
   - Reads `draggedFolderId = evt.item.dataset.folderId`.
   - Traverses bookmark tree to locate `parentNode` for `rootDisplayFolderId`.
   - Filters child folder nodes (`parentNode.children.filter(node => !node.url && node.children)`).
   - Locates `draggedNode` and records its original index (`draggedNode.index`).
   - Calculates target index:
     - If dragged to the last visible position from the left: `targetBookmarkIndex = parentNode.children.length`.
     - Otherwise: `targetBookmarkIndex = folderNodes[evt.newIndex].index`.
   - Bails out if `targetBookmarkIndex === originalBookmarkIndex`.
   - Dispatches `browser.bookmarks.move(draggedFolderId, { parentId: rootDisplayFolderId, index: targetBookmarkIndex })`.
   - Synchronizes UI:
     - If active folder did not change: fetches fresh tree via `getBookmarkTree(true)` and assigns `bookmarkTree = newTree` (avoiding full grid re-render to eliminate UI flash).
     - If active folder changed: calls `loadBookmarks(folderToKeepOpen)`.
   - Error fallback: catches errors and invokes fallback `loadBookmarks()`.

---

## 3. Responsibility & Dependency Mapping

| Symbol / Logic | Current Location (`src/new-tab.js`) | Dependencies Required | Target Location (`src/newtab/bookmarks/bookmark-drag-controller.js`) |
|---|---|---|---|
| `tabsSortable` instance | Line 427 (module variable) | None | Existing `_tabsSortable` private variable in controller IIFE. |
| `isTabDragging` flag | Lines 453–465 (module variable + getter/setter bridge) | `window.isTabDragging` | Existing `_isTabDragging` private variable and `isTabDragging()` / `setTabDragging()` accessors. |
| `setupTabsSortable` | Lines 547–626 | `Sortable`, perf timing helpers, `scrollActiveFolderTabIntoView`, `handleTabDrop` | Canonical implementation inside `HomebaseBookmarkDragController.setupTabsSortable`. |
| `handleTabDrop` | Lines 638–758 | `bookmarkTree`, `findBookmarkNodeById`, `rootDisplayFolderId`, `activeHomebaseFolderId`, `browser.bookmarks.move`, `getBookmarkTree`, `loadBookmarks` | Private handler inside `bookmark-drag-controller.js`. |
| Compatibility Bridge | New in `src/new-tab.js` | `window.HomebaseBookmarkDragController` | `function setupTabsSortable(tabsContainer) { return window.HomebaseBookmarkDragController.setupTabsSortable(tabsContainer); }` |

---

## 4. Current State of `bookmark-drag-controller.js`

In Phase 3-A and Phase 3-B, placeholder scaffolding for Tab drag was already created in [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js):

1. **State variables present**:
   - `let _tabsSortable = null;` (line 14)
   - `let _isTabDragging = false;` (line 16)
2. **Accessors present**:
   - `isTabDragging()` (lines 570–575)
   - `setTabDragging(val)` (lines 581–588)
   - `getTabsSortable()` (lines 602–604)
   - `destroy()` already destroys `_tabsSortable` (lines 620–624)
3. **Global bridges present**:
   - `Object.defineProperty(window, 'isTabDragging', ...)` (lines 653–660)
   - `window.setupTabsSortable` fallback bridge (lines 668–672)
4. **Placeholder to replace**:
   ```javascript
   // Current placeholder in bookmark-drag-controller.js:
   setupTabsSortable(tabsContainer) {
     if (!tabsContainer) return null;
     if (typeof window !== 'undefined' && typeof window.setupTabsSortable === 'function' && window.setupTabsSortable !== this.setupTabsSortable) {
       return window.setupTabsSortable(tabsContainer);
     }
     return null;
   }
   ```
   This placeholder will be replaced with the full SortableJS initialization and lifecycle orchestration.

---

## 5. Interaction Analysis with Related Subsystems

### 5.1 [`bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js)
- **Call site**: Lines 1901–1909 inside `createFolderTabs(homebaseFolder, activeFolderId, options)`:
  ```javascript
  const setupSortable = (options && typeof options.setupTabsSortable === 'function')
    ? options.setupTabsSortable
    : (typeof setupTabsSortable === 'function'
        ? setupTabsSortable
        : (typeof window !== 'undefined' ? window.setupTabsSortable : null));
  if (setupSortable) {
    setupSortable(tabsContainer);
  }
  ```
- **Analysis**: `createFolderTabs` looks up `setupTabsSortable` via local scope or `window.setupTabsSortable`. By providing both the canonical implementation on `window.HomebaseBookmarkDragController.setupTabsSortable` and a bridge on `window.setupTabsSortable`, tab initialization continues seamlessly without altering `bookmark-grid-controller.js`.

### 5.2 [`bookmark-tabs-scroll.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js)
- **Script loading order**: Loaded at line 3340 of `src/new-tab.html`, before `bookmark-drag-controller.js` (line 3358).
- **Export**: Exposes `window.scrollActiveFolderTabIntoView` and `window.HomebaseBookmarkTabsScroll.scrollActiveFolderTabIntoView`.
- **Usage**: Used in `onEnd` after drop:
  ```javascript
  requestAnimationFrame(() => resolveScrollActiveFolderTabIntoView({ behavior: 'smooth' }));
  ```
- **Resolver Pattern**:
  ```javascript
  function resolveScrollActiveFolderTabIntoView(options = { behavior: 'smooth' }) {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkTabsScroll && typeof window.HomebaseBookmarkTabsScroll.scrollActiveFolderTabIntoView === 'function') {
      return window.HomebaseBookmarkTabsScroll.scrollActiveFolderTabIntoView(options);
    }
    if (typeof window !== 'undefined' && typeof window.scrollActiveFolderTabIntoView === 'function') {
      return window.scrollActiveFolderTabIntoView(options);
    }
    if (typeof scrollActiveFolderTabIntoView === 'function') {
      return scrollActiveFolderTabIntoView(options);
    }
  }
  ```

### 5.3 Root & Active Folder ID Resolution
- `handleTabDrop` requires `rootDisplayFolderId` and `activeHomebaseFolderId`.
- **`activeHomebaseFolderId`**: Already resolved cleanly in `bookmark-drag-controller.js` (line 124) via:
  ```javascript
  function getActiveHomebaseFolderId() {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getActiveHomebaseFolderId === 'function') {
      return window.HomebaseBookmarkGridController.getActiveHomebaseFolderId();
    }
    if (typeof window !== 'undefined' && window.activeHomebaseFolderId) {
      return window.activeHomebaseFolderId;
    }
    return null;
  }
  ```
- **`rootDisplayFolderId`**: Needs a matching dynamic resolver:
  ```javascript
  function getRootDisplayFolderId() {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.getRootDisplayFolderId === 'function') {
      return window.HomebaseBookmarkLoader.getRootDisplayFolderId();
    }
    if (typeof window !== 'undefined' && window.rootDisplayFolderId) {
      return window.rootDisplayFolderId;
    }
    if (typeof rootDisplayFolderId !== 'undefined') {
      return rootDisplayFolderId;
    }
    return null;
  }
  ```
  This eliminates coupling to module-scoped closures in `src/new-tab.js`.

### 5.4 Virtualizer State Impact
- **Finding**: **Zero impact on Virtualizer**.
- Folder tabs are rendered in the top horizontal tab strip element (`#bookmarkFolderTabsContainer`), which is a simple flexbox row outside the virtualized grid container.
- Moving or reordering tabs does not modify grid tiles unless the active folder switches.

### 5.5 Browser API & Bookmark Tree State
- Resolvers for `getBrowserApi()`, `getBookmarkTreeState()`, `resolveFindBookmarkNodeById()`, `resolveGetBookmarkTree()`, and `resolveLoadBookmarks()` **already exist** in `bookmark-drag-controller.js` from Phase 3-B and are ready for reuse by `handleTabDrop`.

---

## 6. Metrics & Impact Estimates

- **Lines Removable from `src/new-tab.js`**: **~215 lines**
  - Declarations & bridge: ~25 lines (lines 427, 453–465)
  - `setupTabsSortable`: ~80 lines (lines 547–626)
  - `handleTabDrop`: ~121 lines (lines 638–758)
  - Retained lightweight bridge: ~10 lines
  - **Net reduction:** **~205 lines**
  - **Resulting `src/new-tab.js` size:** ~1,137 lines.
- **Lines Added to `bookmark-drag-controller.js`**: **~135 lines**
  - `getRootDisplayFolderId` & `resolveScrollActiveFolderTabIntoView`: ~25 lines
  - `handleTabDrop`: ~70 lines
  - Canonical `setupTabsSortable`: ~50 lines
  - **Resulting `bookmark-drag-controller.js` size:** ~814 lines.
- **Risk Level**: **Medium-Low**
  - Simpler than Grid Drag: no element raycasting (`elementFromPoint`), no hover delays, no multi-target heuristics.
  - All shared resolvers and controller infrastructure are already in place and battle-tested.

---

## 7. Migration Plan

```text
Cycle #12 Phase 4 (Tab Drag Extraction):
 ├── Plan / Implementation Preparation
 ├── Implement in src/newtab/bookmarks/bookmark-drag-controller.js
 │    ├── Add getRootDisplayFolderId & resolveScrollActiveFolderTabIntoView
 │    ├── Add handleTabDrop
 │    └── Implement setupTabsSortable
 ├── Update src/new-tab.js
 │    ├── Remove duplicate tabsSortable, isTabDragging definitions
 │    ├── Remove legacy handleTabDrop and setupTabsSortable bodies
 │    └── Add lightweight bridge for setupTabsSortable
 ├── Verification
 │    ├── node --check (both files)
 │    ├── check-newtab-static.mjs
 │    ├── npm.cmd test (367 unit tests + browser smoke test)
 │    └── npm.cmd run build
 └── Reporting & Review
```

---

## 8. Static Invariants & Working Tree Status

Executed static verification:
```powershell
node scripts/check-newtab-static.mjs
# Output:
# PASS deferred local script files exist - 63 deferred local scripts checked
# PASS preload.js script tag exists once - 1 found
# PASS preload.js remains in head - head script preserved
# PASS preload.js remains synchronous - no defer/async/module
# PASS preload.js file exists - src\preload.js
# PASS new-tab.js is last deferred runtime script - last deferred script: new-tab.js
# PASS key extracted module paths exist - 43 module paths checked
# PASS no cross-script top-level declaration collisions - 895 unique top-level declarations verified across 63 deferred scripts
```

`git status` confirms zero unstaged or uncommitted source changes:
```text
On branch development
Your branch is up to date with 'origin/development'.
```

---

## 9. Conclusion & Next Steps

The architecture audit confirms that the Tab Drag & Drop subsystem is completely isolated and ready for extraction into `bookmark-drag-controller.js`.

**STOPPED.** No source files modified. Awaiting owner review and approval before implementation.
