# Homebase Cycle #13 — Phase 2C-2 Implementation Report: Drag Wrapper Removal

**Document:** `docs/cycles/cycle-13/phase-2c2-drag-wrapper-removal-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 2C-2 (Remove obsolete drag compatibility forwarders from `src/new-tab.js`)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

Phase 2C-2 successfully removes the obsolete drag compatibility forwarders (`setupGridSortable`, `setupTabsSortable`, and `handleTabDrop`) and their redundant `window.*` assignments from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

With this removal, `src/new-tab.js` achieves a major milestone in Cycle #13: it officially crosses the **< 1,000 lines milestone**, dropping from 1,025 lines to **977 lines** (-48 lines net in Phase 2C-2, -171 lines cumulative since the cycle baseline of 1,148 lines).

---

## 2. Pre-Edit Verification

Ownership of the three drag methods was verified across the repository:
```powershell
git grep -n "setupGridSortable"
git grep -n "setupTabsSortable"
git grep -n "handleTabDrop"
```

Findings:
1. **Canonical Owner**: [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) is the single source of truth for all drag-and-drop operations:
   - `setupGridSortable(gridElement)` (line 549)
   - `setupTabsSortable(tabsContainer)` (line 637)
   - `handleTabDrop(evt)` (lines 456, 751)
2. **Permanent Window Exports**: `bookmark-drag-controller.js` permanently exports all three functions on `window` upon execution (lines 806–822):
   - `window.setupGridSortable = function(gridElement) { ... };`
   - `window.setupTabsSortable = function(tabsContainer) { ... };`
   - `window.handleTabDrop = function(evt) { ... };`
3. **Consumer Verification**: Consumers (`bookmark-grid-controller.js`) access `window.setupGridSortable` and `window.setupTabsSortable` directly from the canonical service.
4. **Duplicate Forwarders**: In `src/new-tab.js`, the three functions were thin forwarders that merely forwarded to `window.HomebaseBookmarkDragController` and re-assigned `window.*`. None were called internally anywhere in `new-tab.js`.

---

## 3. Scope of Removal

Removed lines 458–509 (48 lines net) from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
- `function setupGridSortable(gridElement)` and `window.setupGridSortable` assignment
- `function setupTabsSortable(tabsContainer)` and `window.setupTabsSortable` assignment
- `function handleTabDrop(evt)` and `window.handleTabDrop` assignment

Replaced with a clean architectural attribution comment.

---

## 4. Invariant Preservation

- **Canonical Ownership Intact**: `bookmark-drag-controller.js` remains the sole canonical owner of all drag logic and exports.
- **Sortable Lifecycles Untouched**: No SortableJS lifecycle options, classes, or pointer event handlers were altered.
- **Static Invariant Improvement**: Static collision scanner verified **876 unique top-level declarations** across 63 deferred scripts with **0 collisions** (reduced from 879, eliminating 3 duplicate top-level function declarations).
- **Protected Files Invariant**: Diff against `src/preload.js`, `src/instant_load.js`, `manifests/`, and `dist/` is empty.

---

## 5. Verification Results

All 4 stages of the test pipeline were run and passed:

```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
git diff src/preload.js src/instant_load.js manifests/ dist/
```

| Verification Check | Tool / Command | Result | Notes |
|---|---|:---:|---|
| **Syntax Validation** | `node --check src/new-tab.js` | **PASS** | Clean syntax, exit code 0. |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS** | 63 deferred scripts checked; 876 unique declarations; 0 collisions. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | 367/367 tests passed (0 failures, 0 skipped). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | DOM surfaces intact, core controllers active, 0 ReferenceErrors. |
| **Protected Files Diff** | `git diff src/preload.js ...` | **PASS** | Zero output; all protected files untouched. |

---

## 6. Line Count Progression & Milestone Achievement

```text
Baseline (Start of Cycle 13): 1,148 lines
After Phase 2A (Dead mirrors): 1,119 lines  (-29 lines)
After Phase 2B (Loader wraps): 1,074 lines  (-45 lines net)
After Phase 2C-1 (Drag state): 1,025 lines  (-49 lines net)
After Phase 2C-2 (Drag wraps):   977 lines  (-48 lines net)  🎉 SUB-1,000 MILESTONE ACHIEVED!
```

$$\textbf{Cumulative Phase 2 Reduction to Date: } \mathbf{-171 \text{ lines}} \quad (1,148 \longrightarrow \mathbf{977 \text{ lines}})$$
