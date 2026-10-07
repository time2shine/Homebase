# Homebase Cycle #11 Phase 5 - Checkpoint 12-A Context Menu Cleanup Report

**Subsystem**: Context Menu Forwarders & Stale DOM Handles  
**Primary File**: `src/new-tab.js`  
**Supporting File**: `src/newtab/bookmarks/quick-actions.js`  
**Status**: Implemented & Verified (STOPPED before commit/push per instructions)

---

## 1. Executive Summary

Checkpoint 12-A cleans up redundant context menu DOM handles, obsolete wrapper functions, and write-only context tracking state from `src/new-tab.js`. The canonical owner of all context menu interactions, viewport clamping, mounting, and dismiss lifecycles is `src/newtab/core/context-menu-controller.js` (`window.HomebaseContextMenuController`), which was established earlier in the architecture refactor.

### Metric Reductions
* **Line count before**: 2,168 lines (2,167 content lines + trailing newline)
* **Line count after**: 2,107 lines (2,106 content lines + trailing newline)
* **Net reduction in `src/new-tab.js`**: **61 lines removed**
* **Top-level declarations removed**: 11 DOM constants + 1 function forwarder + 3 write-only variables = **15 top-level declarations eliminated**

---

## 2. Pre-Modification Safety Audit of Every Removal Candidate

Prior to modifying code, an exhaustive reference check across every JavaScript file in `src/`, `scripts/`, and `tests/` was conducted for all 17 removal candidates.

| # | Candidate Identifier | Kind | Location in `src/new-tab.js` | Other References in Repository | Safety Analysis & Resolution |
|---|---|---|---|---|---|
| 1 | `folderContextMenu` | `const` | L571 | `bookmark-grid-controller.js:1504` | **SAFE**. `bookmark-grid-controller.js` guards access with `typeof folderContextMenu !== 'undefined' ? folderContextMenu : document.getElementById('bookmark-folder-menu')`. When removed, the fallback resolves identically. |
| 2 | `menuEditBtn` | `const` | L573 | `bookmark-grid-controller.js:1508` | **SAFE**. `bookmark-grid-controller.js` guards with `typeof menuEditBtn !== 'undefined' ? menuEditBtn : document.getElementById('menu-edit-btn')`. Safe fallback confirmed. |
| 3 | `menuDeleteBtn` | `const` | L575 | `bookmark-grid-controller.js:1512` | **SAFE**. `bookmark-grid-controller.js` guards with `typeof menuDeleteBtn !== 'undefined' ? menuDeleteBtn : document.getElementById('menu-delete-btn')`. Safe fallback confirmed. |
| 4 | `gridFolderMenu` | `const` | L581 | `context-menu-controller.js:372` | **SAFE**. `context-menu-controller.js` declares its own internal `const gridFolderMenu = document.getElementById('bookmark-grid-folder-menu')`. 100% self-contained. |
| 5 | `iconContextMenu` | `const` | L583 | `context-menu-controller.js:387` | **SAFE**. `context-menu-controller.js` declares its own internal `const iconContextMenu = document.getElementById('bookmark-icon-menu')`. 100% self-contained. |
| 6 | `gridBlankMenu` | `const` | L585 | `context-menu-controller.js:327`, `quick-actions.js:13` | **SAFE WITH DEFENSIVE ADAPTER**. `context-menu-controller.js` declares its own local `const gridBlankMenu`. In `quick-actions.js:13`, a defensive fallback `(typeof gridBlankMenu !== 'undefined' && gridBlankMenu) \|\| (typeof document !== 'undefined' ? document.getElementById('bookmark-grid-blank-menu') : null)` was added so `quick-actions.js` does not depend on a global lexical declaration. |
| 7 | `gridMenuCreateBookmarkBtn` | `const` | L587 | `context-menu-controller.js:349` | **SAFE**. `context-menu-controller.js` queries and attaches listeners directly on its own `document.getElementById('grid-menu-create-bookmark')`. |
| 8 | `gridMenuCreateFolderBtn` | `const` | L589 | `context-menu-controller.js:350` | **SAFE**. `context-menu-controller.js` queries and attaches listeners directly on its own `document.getElementById('grid-menu-create-folder')`. |
| 9 | `gridMenuManageBtn` | `const` | L591 | `context-menu-controller.js:351` | **SAFE**. `context-menu-controller.js` queries and attaches listeners directly on its own `document.getElementById('grid-menu-manage')`. |
| 10 | `gridMenuPasteBtn` | `const` | L593 | `context-menu-controller.js:352` | **SAFE**. `context-menu-controller.js` queries and attaches listeners directly on its own `document.getElementById('grid-menu-paste')`. |
| 11 | `gridMenuSortNameBtn` | `const` | L595 | `context-menu-controller.js:353` | **SAFE**. `context-menu-controller.js` queries and attaches listeners directly on its own `document.getElementById('grid-menu-sort-name')`. |
| 12 | `ensureMenuMountedToBody` | `const` (fn) | L597–L605 | `context-menu-controller.js:25,34,426` | **SAFE**. `context-menu-controller.js` defines and exports `HomebaseContextMenuController.ensureMenuMountedToBody`. The forwarder in `new-tab.js` was never called anywhere. |
| 13 | `hideAllContextMenus` | `const` (fn) | L1930–L1934 | None | **SAFE**. Scoped inside `initializePage()`, never referenced or called anywhere. |
| 14 | `positionContextMenuInViewport` | `const` (fn) | L1936–L1940 | None | **SAFE**. Scoped inside `initializePage()`, never referenced or called anywhere. |
| 15 | `currentContextItemId` | `let` | L610, L1964 | None | **SAFE**. Assigned in `onContextChanged`, but never read anywhere in the codebase (`HomebaseContextMenuController` manages its own internal `_contextData`). |
| 16 | `currentContextIsFolder` | `let` | L612, L1965 | None | **SAFE**. Assigned in `onContextChanged`, but never read anywhere in the codebase. |
| 17 | `currentContextSourceTile` | `let` | L614, L1966 | None | **SAFE**. Assigned in `onContextChanged`, but never read anywhere in the codebase. |

---

## 3. Exact Code Changes

### 3.1 `src/new-tab.js`
1. **Removed Context Menu Elements, Forwarder, and Context State Block (formerly L569–L616)**:
   - Removed 11 DOM declarations: `folderContextMenu`, `menuEditBtn`, `menuDeleteBtn`, `gridFolderMenu`, `iconContextMenu`, `gridBlankMenu`, `gridMenuCreateBookmarkBtn`, `gridMenuCreateFolderBtn`, `gridMenuManageBtn`, `gridMenuPasteBtn`, `gridMenuSortNameBtn`.
   - Removed `ensureMenuMountedToBody`.
   - Removed write-only variables: `currentContextItemId`, `currentContextIsFolder`, `currentContextSourceTile`.
2. **Removed Dead Local Forwarders inside `initializePage()` (formerly L1930–L1940)**:
   - Removed `hideAllContextMenus`.
   - Removed `positionContextMenuInViewport`.
3. **Removed Dead Variable Assignments inside `HomebaseContextMenuController.initialize()` (formerly L1963–L1967)**:
   - Removed the dead `onContextChanged` callback which assigned to the removed `currentContext*` variables.

### 3.2 `src/newtab/bookmarks/quick-actions.js`
- Updated lines 13–16 to resolve `blankMenu` with a safe fallback:
  ```javascript
  const blankMenu = (typeof gridBlankMenu !== 'undefined' && gridBlankMenu)
    || (typeof document !== 'undefined' ? document.getElementById('bookmark-grid-blank-menu') : null);

  if (quickOpenBookmarksBtn && blankMenu) {
    const moreBtn = quickOpenBookmarksBtn;
  ```
  This decouples `quick-actions.js` from requiring an undeclared global lexical variable in `new-tab.js`.

---

## 4. Verification Results

All required verification suites were executed on Windows (`pwsh`):

### 4.1 Syntax Validation
```powershell
node --check src/new-tab.js
node --check src/newtab/bookmarks/quick-actions.js
```
* **Result**: `PASS` (zero syntax errors).

### 4.2 Static Checks
```powershell
node scripts/check-newtab-static.mjs
```
* **Result**: `PASS`
  - 60 deferred local scripts checked
  - `preload.js` synchronous and in `<head>`
  - `new-tab.js` remains the last deferred script
  - 40 extracted module paths verified
  - No old flat or stale moved references
  - **923 unique top-level declarations verified with zero collisions** across 60 deferred scripts (decreased cleanly from 938).

### 4.3 Browser Smoke Test (CDP / Edge)
```powershell
node scripts/smoke-newtab-file.mjs
```
* **Result**: `PASS`
  - Browser launched: `msedge.exe`
  - Page loaded: `http://127.0.0.1:58024/new-tab.html`
  - Required DOM surfaces exist
  - Core controllers available
  - Fast-widget-order preload applied
  - **Zero `ReferenceError` or severe runtime errors detected during full startup lifecycle**.

### 4.4 Test Suite
```powershell
npm.cmd test
```
* **Result**: `PASS`
  - Stage 1: Syntax Validation (`node --check`) — PASS
  - Stage 2: Static Invariants (`check-newtab-static.mjs`) — PASS
  - Stage 3: Unit Tests (`node:test`) — 343 / 343 tests passed (0 failures)
  - Stage 4: Browser Smoke Test (`smoke-newtab-file.mjs`) — PASS

### 4.5 Production Extension Build
```powershell
npm.cmd run build
```
* **Result**: `PASS`
  - Chrome build: `dist\chrome` generated successfully
  - Firefox build: `dist\firefox` generated successfully

### 4.6 Diff Invariant & Protected Files Check
```powershell
git diff --check
git diff src/preload.js src/instant_load.js manifests/
```
* **Result**: `PASS` (zero whitespace issues, zero modifications to protected files).

---

## 5. Protected Area Confirmation

As mandated by repository rules and instructions:
* `initializePage()` orchestration, parallel promise settling, and widget hydration: **UNTOUCHED**.
* `window.HomebaseContextMenuController`: **UNTOUCHED**.
* Sortable.js drag-and-drop implementation: **UNTOUCHED**.
* Idle task scheduler: **UNTOUCHED**.
* Wallpaper lifecycle: **UNTOUCHED**.
* Bookmark loading pipeline: **UNTOUCHED**.
* `src/preload.js`, `src/instant_load.js`: **UNTOUCHED**.
* `manifests/*`: **UNTOUCHED**.

---

## 6. Current Repository Status

* **Modified files**:
  - `src/new-tab.js`
  - `src/newtab/bookmarks/quick-actions.js`
* **Documentation files created**:
  - `docs/162-cycle11-phase5-checkpoint12-audit.md`
  - `docs/163-cycle11-phase5-checkpoint12-context-menu-cleanup-report.md`
* **Commit/Push status**:
  - **STOPPED**. No changes staged, committed, or pushed.
  - Ready for review and approval before staging.
