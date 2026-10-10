# Homebase Cycle #12 — Phase 4-A Implementation Report
## Tab Drag Controller Extraction

**Document:** `docs/218-cycle12-phase4a-tab-drag-foundation-report.md`  
**Date:** October 8, 2026  
**Status:** COMPLETE (VERIFICATION PASSED — AWAITING OWNER REVIEW)  
**Target Module:** [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)  
**Monolith Cleaned:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**Audit Reference:** [`docs/217-cycle12-phase4-tab-drag-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/217-cycle12-phase4-tab-drag-audit.md)  

---

## 1. Overview & Objectives

In Phase 4-A of Cycle #12, canonical ownership of the Folder Tab Sortable setup and lifecycle orchestration was successfully extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js).

In accordance with the phase boundary instructions:
- **Extracted:** `tabsSortable` instance ownership, `isTabDragging` state ownership, `setupTabsSortable()` configuration, and SortableJS lifecycle (`onStart`, `onEnd`, drag classes, performance metrics).
- **Intentionally Preserved in `src/new-tab.js`:** `handleTabDrop(evt)` (scheduled for Phase 4-B).
- **Maintained Compatibility:** `window.setupTabsSortable` and `window.isTabDragging` bridges remain fully functional.

---

## 2. Extracted Responsibilities

### 2.1 State & Instance Ownership
- **`_tabsSortable`**: Private controller variable holding the active SortableJS instance for folder tabs. Instance destruction and cleanup are handled automatically upon reinitialization and in `destroy()`.
- **`_isTabDragging`**: Private controller boolean with accessors `isTabDragging()` and `setTabDragging(val)`.
  - **Architecture Fix Applied**: Refactored `isGridDragging()` and `isTabDragging()` accessors in `bookmark-drag-controller.js` to return private state directly rather than querying `window`, completely eliminating getter recursion risks.

### 2.2 Canonical `setupTabsSortable(tabsContainer)` Implementation
Moved into `HomebaseBookmarkDragController`:
- Performance timing hooks (`safeGetPerfMeasureStart`, `safeRecordSortableLibraryAvailability`, `safeRecordSortablePerfTiming('tabs', ...)`).
- Full Sortable options preserved exactly:
  - `animation: 350`
  - `easing: "cubic-bezier(0.25, 1, 0.5, 1)"` (smooth snap effect)
  - `draggable: '.bookmark-folder-tab'`
  - `filter: '.bookmark-folder-add-btn'`
  - CSS classes: `ghostClass: 'sortable-ghost-tab'`, `chosenClass: 'sortable-chosen-tab'`, `dragClass: 'sortable-drag-tab'`, `fallbackClass: 'bookmark-fallback-ghost-tab'`
  - Fallback settings: `forceFallback: true`, `fallbackOnBody: true`, `fallbackTolerance: 5`
  - Data transfer setup: `setData(dataTransfer, dragEl)` sets `text/plain` to `dragEl.dataset.folderId`
- Lifecycle hooks:
  - **`onStart`**: sets `HomebaseBookmarkDragController.setTabDragging(true)` and adds `is-tab-dragging` class to `document.body`.
  - **`onEnd`**: clears `isTabDragging` after a 50ms delay (suppressing click event misfires), removes `is-tab-dragging` from `document.body`, delegates drop processing to `resolveHandleTabDrop(evt)`, and triggers smooth tab alignment via `resolveScrollActiveFolderTabIntoView({ behavior: 'smooth' })`.
  - `preventOnFilter: true`

### 2.3 Subsystem Helper Resolvers
Added helper resolvers in `bookmark-drag-controller.js`:
- `resolveScrollActiveFolderTabIntoView`: Resolves `HomebaseBookmarkTabsScroll.scrollActiveFolderTabIntoView` or `window.scrollActiveFolderTabIntoView`.
- `resolveHandleTabDrop`: Resolves `options.handleTabDrop` or `window.handleTabDrop`.

---

## 3. Responsibilities Remaining in `src/new-tab.js`

In strict adherence to the Phase 4-A boundary:
1. **`handleTabDrop(evt)`**: The bookmark drop algorithm, index calculations, and `browser.bookmarks.move` invocation remain in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (lines 648–768) and will be extracted in Phase 4-B.
2. **`window.handleTabDrop` Export**: Added explicit export `window.handleTabDrop = handleTabDrop;` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) to allow `bookmark-drag-controller.js` to dispatch drop events seamlessly.
3. **`setupTabsSortable` Compatibility Bridge**:
   ```javascript
   function setupTabsSortable(tabsContainer) {
     if (typeof window !== 'undefined' && window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.setupTabsSortable === 'function') {
       return window.HomebaseBookmarkDragController.setupTabsSortable(tabsContainer);
     }
     return null;
   }
   if (typeof window !== 'undefined') {
     window.setupTabsSortable = setupTabsSortable;
   }
   ```
4. **`isTabDragging` Property Bridge**: Symmetrically forwards reads/writes to `window.HomebaseBookmarkDragController.isTabDragging()` / `setTabDragging()`.

---

## 4. Code Metrics & Line Count Reduction

- **[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)**:
  - Previous Line Count: 1,342 lines
  - Current Line Count: **1,277 lines**
  - **Net Reduction:** **65 lines removed** (95 lines deleted, 30 lines of bridge/export added)
- **[`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)**:
  - Previous Line Count: 679 lines
  - Current Line Count: **735 lines** (+56 lines)
- **Global Declarations Check**:
  - `tabsSortable` removed from global declarations.
  - Top-level declarations across 63 deferred scripts dropped from 895 to **894 with 0 collisions**.

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

### 5.3 Full Test Suite (`npm.cmd test`)
```text
========================================
       HOMEBASE TEST SUITE SUMMARY      
========================================
  ✓ PASS  Syntax Validation (node --check) (3.29s)
  ✓ PASS  Static Invariants (check-newtab-static.mjs) (0.11s)
  ✓ PASS  Unit Tests (node:test) (2.77s)
  ✓ PASS  Browser Smoke Test (smoke-newtab-file.mjs) (0.96s)
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

- **Owner Review & Approval**: Review Phase 4-A changes and verification report.
- **Proceed to Phase 4-B**: Extract `handleTabDrop(evt)` into `bookmark-drag-controller.js`, removing the remaining ~120 lines of tab drop logic from `src/new-tab.js`.

---

**STOPPED.** No commits or pushes have been performed. Awaiting owner review.
