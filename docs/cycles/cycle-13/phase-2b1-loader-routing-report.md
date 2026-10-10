# Homebase Cycle #13 — Phase 2B-1 Implementation Report: Loader Call Routing

**Document:** `docs/cycles/cycle-13/phase-2b1-loader-routing-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 2B-1 (Route `src/new-tab.js` callers to canonical `HomebaseBookmarkLoader`)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

Phase 2B-1 decouples internal startup callers in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`initializePage()`) from the local compatibility wrapper functions, re-routing all bookmark loader operations directly to the canonical service `window.HomebaseBookmarkLoader`.

Per the phase instructions:
- Internal callers in `initializePage()` have been updated to target `window.HomebaseBookmarkLoader.*`.
- The backward compatibility wrapper functions (lines 560–612) and their `window.*` export assignments remain **intact and unchanged**.
- No external module contracts or script orderings were altered.
- All 367 automated tests and the headless browser smoke test pass cleanly.

---

## 2. Code Changes Detailed

### 2.1 Parallel Storage Loads (`initializePage`)
Updated `bookmarkMetaP` and `lastFolderP` to invoke `window.HomebaseBookmarkLoader` methods directly while preserving the `Promise.allSettled` parallelization pattern and fallback resolutions:

```diff
-    const bookmarkMetaP = loadBookmarkMetadata();
-    const lastFolderP = loadLastUsedFolderId();
+    const bookmarkMetaP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarkMetadata === 'function')
+      ? window.HomebaseBookmarkLoader.loadBookmarkMetadata()
+      : Promise.resolve({});
+    const lastFolderP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadLastUsedFolderId === 'function')
+      ? window.HomebaseBookmarkLoader.loadLastUsedFolderId()
+      : Promise.resolve(null);
```

### 2.2 Folder Metadata Hydration (`initializePage`)
Updated `loadFolderMetadata` execution to route to `window.HomebaseBookmarkLoader.loadFolderMetadata()` with defensive guards while preserving performance telemetry (`hbPerfTime`):

```diff
-    await loadFolderMetadata();
+    if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadFolderMetadata === 'function') {
+      await window.HomebaseBookmarkLoader.loadFolderMetadata();
+    }
     hbPerfTime('loadFolderMetadata', folderMetaStart);
```

### 2.3 Bookmark Tree Load & Render (`initializePage`)
Updated `loadBookmarks` execution to route to `window.HomebaseBookmarkLoader.loadBookmarks()` while preserving performance instrumentation and try/catch error logging:

```diff
-    await loadBookmarks();
+    if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
+      await window.HomebaseBookmarkLoader.loadBookmarks();
+    }
     hbPerfTime('loadBookmarks total', bookmarksStart);
     hbPerfMark('bookmarks-done');
```

---

## 3. Preserved Invariants

1. **Compatibility Wrappers Preserved**: Lines 560–612 in `src/new-tab.js` remain completely in place, continuing to export `window.loadBookmarks`, `window.processBookmarks`, `window.loadBookmarkMetadata`, `window.loadFolderMetadata`, `window.loadLastUsedFolderId`, and `window.setLastUsedFolderId`.
2. **Startup Timing Preserved**: Parallel resolution of settings, bookmark metadata, and last folder ID is maintained via `Promise.allSettled`.
3. **Telemetry & Logging Unaltered**: `logInitSettled` strings, performance marks (`init:parallel-start`, `bookmarks-done`), and timing measures remain identical.
4. **Protected Files Invariant**: Diff against `src/preload.js`, `src/instant_load.js`, `manifests/`, and `dist/` is empty.

---

## 4. Verification Results

All 4 stages of the mandatory verification suite were executed:

```powershell
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
```

| Verification Stage | Tool / Command | Result | Details |
|---|---|:---:|---|
| **Syntax Validation** | `node --check src/new-tab.js` | **PASS** | Clean syntax, zero compilation errors. |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS** | 63 deferred scripts checked; 887 unique declarations; 0 collisions. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | 367/367 tests passed (0 failures, 0 skipped). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | DOM surfaces intact, core controllers active, fast preload verified, 0 ReferenceErrors. |
| **Protected Files Check** | `git diff src/preload.js ...` | **PASS** | Clean; zero diff on protected files. |

---

## 5. Next Steps

With internal callers safely re-routed and verified, the codebase is ready for **Phase 2B-2**:
- Removal of the redundant compatibility wrapper block (lines 560–612 in `src/new-tab.js`).
- Deletion of the redundant `window.* = ...` re-assignments.
- Expected line reduction: **~53 lines** removed from `src/new-tab.js`.
