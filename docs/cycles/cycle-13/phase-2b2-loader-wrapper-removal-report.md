# Homebase Cycle #13 — Phase 2B-2 Implementation Report: Loader Wrapper Removal

**Document:** `docs/cycles/cycle-13/phase-2b2-loader-wrapper-removal-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 2B-2 (Remove obsolete bookmark loader compatibility wrapper block from `src/new-tab.js`)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

Phase 2B-2 successfully removes the obsolete bookmark loader compatibility wrapper block from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

Following the Phase 2B Consumer Audit ([`docs/cycles/cycle-13/phase-2b-consumer-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/phase-2b-consumer-audit.md)) and the Phase 2B-1 Caller Routing ([`docs/cycles/cycle-13/phase-2b1-loader-routing-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/phase-2b1-loader-routing-report.md)), the duplicate wrapper block in `src/new-tab.js` had zero remaining internal callers.

Canonical module [`src/newtab/bookmarks/bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js) loads before `src/new-tab.js` in [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) and exports both `window.HomebaseBookmarkLoader` and the global `window.*` loader functions. Pruning the duplicate wrapper block eliminates redundant boilerplate, removes 6 top-level lexical function declarations from `src/new-tab.js`, and reduces the file size to **1,074 lines**.

---

## 2. Pre-Edit Verification

Before modifying `src/new-tab.js`, all loader global symbols were verified across the repository:
```powershell
git grep -n "window.loadBookmarks"
git grep -n "window.processBookmarks"
git grep -n "window.loadBookmarkMetadata"
git grep -n "window.loadFolderMetadata"
git grep -n "window.loadLastUsedFolderId"
git grep -n "window.setLastUsedFolderId"
```

All 6 symbols were confirmed to be:
1. Exported on `window` by canonical [`bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js#L393-L398).
2. Fully tested in [`tests/unit/bookmark-loader-service.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/bookmark-loader-service.test.mjs#L78-L85).
3. Redundantly re-assigned in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L605-L611).

---

## 3. Scope of Removal

The 54-line compatibility block (formerly lines 559–612) was removed from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):

### Functions Removed:
1. `processBookmarks(nodes, activeFolderId = null, rootNodeOverride = null)`
2. `async function loadBookmarkMetadata()`
3. `async function loadLastUsedFolderId()`
4. `async function setLastUsedFolderId(id)`
5. `async function loadFolderMetadata()`
6. `async function loadBookmarks(activeFolderId = null)`

### Redundant Window Assignments Removed:
```javascript
if (typeof window !== 'undefined') {
  window.loadBookmarks = loadBookmarks;
  window.processBookmarks = processBookmarks;
  window.loadBookmarkMetadata = loadBookmarkMetadata;
  window.loadFolderMetadata = loadFolderMetadata;
  window.loadLastUsedFolderId = loadLastUsedFolderId;
  window.setLastUsedFolderId = setLastUsedFolderId;
}
```

---

## 4. Invariant Preservation

- **Canonical Exports Intact**: `HomebaseBookmarkLoader` and its `window.*` exports in `bookmark-loader-service.js` remain completely untouched.
- **Script Ordering Intact**: No changes to script tags or defer attributes in `src/new-tab.html`.
- **Zero Collision Impact**: Static declaration collision checker verifies 881 unique top-level declarations across 63 deferred scripts with **0 collisions** (reduced from 887).
- **Protected Files Invariant**: Diff against `src/preload.js`, `src/instant_load.js`, `manifests/`, and `dist/` is empty.

---

## 5. Verification Results

All 4 stages of the test pipeline were run and confirmed passing:

```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
git diff src/preload.js src/instant_load.js manifests/ dist/
```

| Verification Check | Command | Result | Notes |
|---|---|:---:|---|
| **Syntax Validation** | `node --check src/new-tab.js` | **PASS** | Clean syntax, exit code 0. |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS** | 63 deferred scripts checked; 881 unique declarations; 0 collisions. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | 367/367 tests passed (0 failures, 0 skipped). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | DOM surfaces intact, core controllers active, 0 ReferenceErrors. |
| **Protected Files Diff** | `git diff src/preload.js ...` | **PASS** | Zero output; all protected files untouched. |

---

## 6. Line Count Impact

- Baseline at start of Cycle #13: **1,148 lines**
- After Phase 2A (Dead mirrors pruned): **1,119 lines** (-29 lines)
- After Phase 2B (Loader routing & wrapper pruned): **1,074 lines** (-45 lines net in Phase 2B, -74 lines cumulative)
- Approaching the **< 1,000 lines milestone** (Phase 2C Drag compatibility removal targets ~90 lines, which will cross into the 900s).
