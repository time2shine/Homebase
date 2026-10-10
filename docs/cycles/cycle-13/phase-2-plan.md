# Homebase Cycle #13 — Phase 2 Plan: Bookmark Bridges & State Pruning

**Document:** `docs/cycles/cycle-13/phase-2-plan.md`  
**Date:** October 9, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 1,148 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Projected Line Count:** **~961 lines** (~187 lines pruned, crossing the **< 1,000 lines** milestone)  

---

## 1. Executive Summary & Strategy

Following the Phase 1 Architecture Audit ([`docs/cycles/cycle-13/phase-1/architecture-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/phase-1/architecture-audit.md)), Phase 2 eliminates legacy bookmark forwarders, duplicate drag descriptors, and dead mirror state from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

To guarantee safety, maintain atomic rollbacks, and eliminate regressions, Phase 2 is decomposed into four discrete, independently verifiable sub-phases:

```text
Phase 2A: Dead Declarations & Unused Local Mirrors (~25 lines)
      ↓ (Verify & Checkpoint)
Phase 2B: Bookmark Loader Compatibility Wrappers (~65 lines)
      ↓ (Verify & Checkpoint)
Phase 2C: Drag Compatibility Wrappers (~90 lines) → Crosses < 1,000 Milestone!
      ↓ (Verify & Checkpoint)
Phase 2D: Final Cleanup & Full Verification Suite (~7 lines net)
```

---

## 2. Canonical Ownership & Script Execution Contract

Both canonical modules evaluate in [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) **before** `src/new-tab.js`:
1. `HomebaseBookmarkLoader` ([`src/newtab/bookmarks/bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js)) exports all loader functions on `window` (lines 393–398).
2. `HomebaseBookmarkDragController` ([`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js)) exports Sortable methods and getter/setter property descriptors on `window` (lines 786–822).

Because `src/new-tab.js` is the final script loaded, the wrappers in `new-tab.js` are 100% duplicate code that simply overwrite existing canonical pointers on `window`.

---

## 3. Sub-Phase Specifications

### 3.1 Phase 2A: Dead Declarations & Unused Local Mirrors

#### Scope & Actions
Prune write-only and unused local variables in `src/new-tab.js`:
1. Remove `let allBookmarks = [];` (line 410) and dead assignments in loader callbacks (lines 586, 626).
2. Remove `const bookmarkFolderTabsContainer = document.getElementById('bookmark-folder-tabs');` (line 418).
3. Remove `let rootDisplayFolderId = null;` (line 420) and dead assignments (lines 587, 627).
4. Remove `let activeHomebaseFolderId = null;` (line 422).
5. Remove `let bookmarkMetadata = {};` (line 505) and `let folderMetadata = {};` (line 507).
6. Remove `let lastUsedBookmarkFolderId = null;` (line 509).
7. Remove stale mirror block `if (typeof window.bookmarkTree !== 'undefined') bookmarkTree = window.bookmarkTree;` (lines 628–630).

#### Files Affected
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

#### Runtime Risk
- **Risk Level:** **Very Low**
- **Analysis:** None of these variables are read anywhere inside `src/new-tab.js`. External modules already consume `window.allBookmarks`, `window.rootDisplayFolderId`, and `window.activeHomebaseFolderId` directly from their canonical owners (`bookmark-loader-service.js` and `bookmark-grid-controller.js`).

#### Required Verification Commands
```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
```

#### Rollback Strategy
```powershell
git checkout -- src/new-tab.js
```

#### Expected Line Reduction
- **~25 lines pruned** (Baseline: 1,148 $\to$ **~1,123 lines**)

---

### 3.2 Phase 2B: Bookmark Loader Compatibility Wrappers

#### Scope & Actions
Remove redundant loader forwarder functions in `src/new-tab.js` (lines 583–642):
1. Remove `processBookmarks(nodes, activeFolderId, rootNodeOverride)` (lines 583–590).
2. Remove `loadBookmarkMetadata()` (lines 592–598).
3. Remove `loadLastUsedFolderId()` (lines 600–606).
4. Remove `setLastUsedFolderId(id)` (lines 608–613).
5. Remove `loadFolderMetadata()` (lines 615–621).
6. Remove `loadBookmarks(activeFolderId)` (lines 623–633).
7. Remove redundant `window.* = ...` export assignments (lines 635–642).
8. In `initializePage()` (lines 693–783), route boot calls directly to `window.HomebaseBookmarkLoader`:
   - `window.HomebaseBookmarkLoader.loadBookmarkMetadata()`
   - `window.HomebaseBookmarkLoader.loadLastUsedFolderId()`
   - `window.HomebaseBookmarkLoader.loadFolderMetadata()`
   - `window.HomebaseBookmarkLoader.loadBookmarks()`

#### Files Affected
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

#### Runtime Risk
- **Risk Level:** **Low**
- **Analysis:** `bookmark-loader-service.js` already binds `window.loadBookmarks`, `window.processBookmarks`, `window.loadBookmarkMetadata`, `window.loadFolderMetadata`, `window.loadLastUsedFolderId`, and `window.setLastUsedFolderId`. Updating `initializePage()` call sites maintains exact parallel settlement timing (`Promise.allSettled`) and performance measurements (`hbPerfTime`).

#### Required Verification Commands
```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
```

#### Rollback Strategy
```powershell
git checkout -- src/new-tab.js
```

#### Expected Line Reduction
- **~65 lines pruned** (Projected size: 1,123 $\to$ **~1,058 lines**)

---

### 3.3 Phase 2C: Drag Compatibility Wrappers

#### Scope & Actions
Remove duplicate drag state descriptors and Sortable forwarders in `src/new-tab.js`:
1. Remove `isGridDragging` variable and duplicate `Object.defineProperty(window, 'isGridDragging', ...)` (lines 429–451).
2. Remove `isTabDragging` variable and duplicate `Object.defineProperty(window, 'isTabDragging', ...)` (lines 453–475).
3. Remove `setupGridSortable(gridElement)` function and `window.setupGridSortable` export (lines 531–539).
4. Remove `setupTabsSortable(tabsContainer)` function and `window.setupTabsSortable` export (lines 550–558).
5. Remove `handleTabDrop(evt)` function and `window.handleTabDrop` export (lines 567–575).

#### Files Affected
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

#### Runtime Risk
- **Risk Level:** **Low**
- **Analysis:** `HomebaseBookmarkDragController` (`bookmark-drag-controller.js:786–822`) already defines `window.isGridDragging`, `window.isTabDragging`, `window.setupGridSortable`, `window.setupTabsSortable`, and `window.handleTabDrop` prior to `new-tab.js` executing. Pruning duplicate definitions in `new-tab.js` eliminates double-wrapping.

#### Required Verification Commands
```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
```

#### Rollback Strategy
```powershell
git checkout -- src/new-tab.js
```

#### Expected Line Reduction
- **~90 lines pruned** (Projected size: 1,058 $\to$ **~968 lines** — **Crosses the Sub-1,000 Lines Milestone!**)

---

### 3.4 Phase 2D: Final Cleanup & Full Verification

#### Scope & Actions
Polish remaining delegates, storage listeners, and dead comments in `src/new-tab.js`:
1. Update `setupBookmarkEditorAdapter` (line 1052):
   Replace undeclared `getBookmarkTree: () => bookmarkTree` reference with canonical service lookup:
   ```javascript
   getBookmarkTree: () => (window.HomebaseBookmarkTreeService && typeof window.HomebaseBookmarkTreeService.getBookmarkTree === 'function'
     ? window.HomebaseBookmarkTreeService.getBookmarkTree()
     : (typeof window !== 'undefined' ? window.bookmarkTree : null)),
   ```
2. Update `handleNewTabStorageChange` for `LAST_USED_BOOKMARK_FOLDER_KEY` (lines 1100–1105):
   Directly mirror changes to `window.lastUsedBookmarkFolderId` and `window.HomebaseBookmarkLoader.setLastUsedFolderId()`.
3. Clean up orphaned section comments, empty blank line blocks, and headers left by pruned blocks.
4. Run full 5-stage verification suite including dual distribution build and protected files diff check.

#### Files Affected
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

#### Runtime Risk
- **Risk Level:** **Very Low**
- **Analysis:** Eliminates undeclared identifier access on `bookmarkTree` and ensures clean storage synchronization.

#### Required Verification Commands
```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
git diff src/preload.js src/instant_load.js manifests/ dist/
```

#### Rollback Strategy
```powershell
git checkout -- src/new-tab.js
```

#### Expected Line Reduction
- **~7 lines net pruned** (Projected final size: **~961 lines**)

---

## 4. Overall Size & Line Count Progression

| Phase | Focus | Scope | Lines Pruned | Resulting `src/new-tab.js` Size |
|:---:|---|---|:---:|:---:|
| **Baseline** | Initial Cycle #13 state | Current master | — | **1,148 lines** |
| **Phase 2A** | Dead Declarations & Mirrors | Variables, unread locals, dead assignments | ~25 lines | **~1,123 lines** |
| **Phase 2B** | Loader Compatibility Wrappers | 6 loader functions, window exports, boot call sites | ~65 lines | **~1,058 lines** |
| **Phase 2C** | Drag Compatibility Wrappers | Sortable forwarders, `isGridDragging`, `isTabDragging` | ~90 lines | **~968 lines** *(Sub-1,000 Milestone!)* |
| **Phase 2D** | Polish & Full Verification | Adapter tree lookup, storage change handler, formatting | ~7 lines | **~961 lines** |

$$\textbf{Total Phase 2 Reduction: } \mathbf{\sim 187 \text{ lines}} \quad (1,148 \longrightarrow \mathbf{\sim 961 \text{ lines}})$$

---

## 5. Verification Gate & Safety Checklist

Before committing any sub-phase:
1. `node --check src/new-tab.js`: Syntax check must exit code 0.
2. `node scripts/check-newtab-static.mjs`: Must verify 63 deferred scripts, 0 collisions, correct script order.
3. `npm.cmd test`: All 367 unit tests and browser smoke test must pass 100%.
4. Protected files check (`git diff src/preload.js src/instant_load.js manifests/ dist/`): Must be empty.
5. Verification report generated for each sub-phase.
