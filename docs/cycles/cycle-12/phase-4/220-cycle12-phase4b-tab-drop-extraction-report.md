# Homebase Cycle #12 — Phase 4-B Implementation Report
## Tab Drop Logic Extraction

**Document:** `docs/220-cycle12-phase4b-tab-drop-extraction-report.md`  
**Date:** October 9, 2026  
**Status:** COMPLETE (VERIFICATION PASSED — AWAITING OWNER REVIEW)  
**Target Module:** [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)  
**Monolith Cleaned:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**Audit Reference:** [`docs/217-cycle12-phase4-tab-drag-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/217-cycle12-phase4-tab-drag-audit.md)  

---

## 1. Overview & Objectives

In Phase 4-B of Cycle #12, canonical ownership of the Folder Tab Drop logic (`handleTabDrop`) was successfully extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js).

With this extraction, **100% of the Bookmark Drag & Drop subsystem (both Grid and Tab drag domains) is now unified under `HomebaseBookmarkDragController`**.

### Objectives Accomplished:
1. **Extracted `handleTabDrop` Implementation**: Transferred tab drop boundary calculations, child index resolution, `browser.bookmarks.move` invocation, optimistic in-memory tree mutation, and UI reload logic into `bookmark-drag-controller.js`.
2. **Added Dynamic Root Display Resolution**: Implemented `getRootDisplayFolderId()` resolver inside the drag controller, dynamically resolving from `HomebaseBookmarkLoader.getRootDisplayFolderId()`, `window.rootDisplayFolderId`, or local scope.
3. **Established Compatibility Bridge**: Replaced the ~130-line `handleTabDrop` block in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) with a lightweight bridge delegating to `window.HomebaseBookmarkDragController.handleTabDrop(evt)`.
4. **Exported Public Method**: Added `handleTabDrop` to `HomebaseBookmarkDragController` and `window.handleTabDrop` for testing and multi-script integration.
5. **Preserved Invariants & Invariant Tests**: All SortableJS settings, browser API move arguments, and UI reload paths behave identically to the monolith implementation.

---

## 2. Functions & Responsibilities Moved

### 2.1 Canonical `handleTabDrop(evt)`
Moved from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js):
- **Early Exit Check**: Bails out immediately if `evt.oldIndex === evt.newIndex`.
- **Target Resolution**: Reads `activeHomebaseFolderId` via `getActiveHomebaseFolderId()` and `rootDisplayFolderId` via `getRootDisplayFolderId()`.
- **Child Node Filtering**: Filters parent folder children to folder-only items (`!node.url && node.children`).
- **Index Calculation**:
  - Traverses boundary case: if dragged down to the last visible tab position, maps target to `parentNode.children.length`.
  - Normal case: maps target to the exact bookmark index of the displaced tab node (`targetNode.index`).
- **WebExtension Move**: Dispatches `await browserApi.bookmarks.move(draggedFolderId, { parentId, index })`.
- **Optimistic UI Refresh**:
  - If the active folder is unchanged, fetches fresh tree via `resolveGetBookmarkTree(true)` and updates `window.bookmarkTree` without a full page or grid re-render, eliminating visual flash.
  - If the active folder changed, triggers `resolveLoadBookmarks(folderToKeepOpen)`.
- **Error Handling**: Catches exceptions and triggers fallback `resolveLoadBookmarks()`.

### 2.2 New Resolver Added
- **`getRootDisplayFolderId()`**:
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

---

## 3. Dependency Mapping & Resolution

| Dependency | Original Source in `new-tab.js` | Resolution in `bookmark-drag-controller.js` |
|---|---|---|
| Browser Extension API | `browser.bookmarks.move` | `getBrowserApi().bookmarks.move` (handles Chrome and Firefox) |
| Active Bookmark Tree | `bookmarkTree` | `getBookmarkTreeState()` / `window.bookmarkTree` |
| Tree Node Searching | `findBookmarkNodeById` | `resolveFindBookmarkNodeById(rootNode, id)` |
| Tree Refresh | `getBookmarkTree(true)` | `resolveGetBookmarkTree(true)` |
| Folder Navigation | `loadBookmarks(folderId)` | `resolveLoadBookmarks(folderId)` |
| Selected Folder ID | `activeHomebaseFolderId` | `getActiveHomebaseFolderId()` |
| Root Display Folder ID | `rootDisplayFolderId` | `getRootDisplayFolderId()` |
| Tab Scroll Animation | `scrollActiveFolderTabIntoView` | `resolveScrollActiveFolderTabIntoView({ behavior: 'smooth' })` |

---

## 4. Monolith Code Reduction & Metrics

- **[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)**:
  - Previous Line Count: 1,277 lines
  - Current Line Count: **1,160 lines**
  - **Net Reduction:** **117 lines removed** (125 deletions, 10 bridge lines added)
- **[`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)**:
  - Previous Line Count: 741 lines
  - Current Line Count: **833 lines** (+92 lines)
- **Cycle #12 Cumulative Reduction**:
  - `src/new-tab.js` started Cycle #12 at **1,842 lines**.
  - Current footprint is **1,160 lines** (**682 lines extracted from monolith in Cycle #12**).
- **Global Declarations**: Maintained at **894 declarations across 63 deferred scripts with 0 collisions**.

---

## 5. Automated Verification Results

All automated test suites and validation scripts passed cleanly.

### 5.1 Syntax Check (`node --check`)
```powershell
node --check src/newtab/bookmarks/bookmark-drag-controller.js
# Output: Exit code 0 (PASS)

node --check src/new-tab.js
# Output: Exit code 0 (PASS)
```

### 5.2 Static Invariants Check (`node scripts/check-newtab-static.mjs`)
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
PASS no cross-script top-level declaration collisions - 894 unique top-level declarations verified across 63 deferred scripts
```

### 5.3 Test Suite (`npm.cmd test`)
```text
========================================
       HOMEBASE TEST SUITE SUMMARY      
========================================
  ✓ PASS  Syntax Validation (node --check) (3.54s)
  ✓ PASS  Static Invariants (check-newtab-static.mjs) (0.14s)
  ✓ PASS  Unit Tests (node:test) (2.80s)
  ✓ PASS  Browser Smoke Test (smoke-newtab-file.mjs) (1.01s)
----------------------------------------
Total: 4/4 stages passed (367/367 unit tests passed).
========================================
```

### 5.4 Extension Build (`npm.cmd run build`)
```text
Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

### 5.5 Protected Invariants Check
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
# Output: Empty (0 lines modified)
```

---

## 6. Next Steps

- **Owner Review & Approval**: Review Phase 4-B changes and implementation report.
- **Commit Phase 4-B**: Commit extracted tab drop logic with commit message `Extract bookmark tab drop ownership`.
- **Phase 5**: Subsystem Polish, Final Dead Code Audit, and Documentation Archive.

---

**STOPPED.** No commits or pushes have been performed. Awaiting owner review.
