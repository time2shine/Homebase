# Homebase Cycle #13 — Phase 2B: Bookmark Loader Compatibility Wrappers Consumer Audit

**Document:** `docs/cycles/cycle-13/phase-2b-consumer-audit.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 2B Preparation (Read-Only Consumer Audit)  
**Target File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

In preparation for **Cycle #13 Phase 2B**, a repository-wide read-only audit was conducted to identify every consumer of the bookmark loader compatibility forwarders in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

The compatibility block in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L560-L612) defines six wrapper functions and binds them to `window`:
1. `processBookmarks(nodes, activeFolderId, rootNodeOverride)`
2. `loadBookmarkMetadata()`
3. `loadLastUsedFolderId()`
4. `setLastUsedFolderId(id)`
5. `loadFolderMetadata()`
6. `loadBookmarks(activeFolderId)`

### Core Architectural Finding
In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html#L3366), canonical module [`src/newtab/bookmarks/bookmark-loader-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-loader-service.js) is loaded via `<script defer>` significantly **before** `src/new-tab.js` (line 3410).

When `bookmark-loader-service.js` executes (lines 380–399), it exports `window.HomebaseBookmarkLoader` **and binds all six methods directly to `window`**:
```javascript
window.HomebaseBookmarkLoader = HomebaseBookmarkLoader;
window.loadBookmarks = loadBookmarks;
window.processBookmarks = processBookmarks;
window.loadBookmarkMetadata = loadBookmarkMetadata;
window.loadFolderMetadata = loadFolderMetadata;
window.loadLastUsedFolderId = loadLastUsedFolderId;
window.setLastUsedFolderId = setLastUsedFolderId;
```

**Key Takeaway:** The wrappers in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) are 100% duplicate boilerplate that merely overwrite pre-existing, functioning canonical references on `window`. Removing them from `src/new-tab.js` introduces **zero breaking changes** to any consumer that relies on `window.<method>` or canonical `HomebaseBookmarkLoader.<method>`.

---

## 2. Comprehensive Consumer Inventory

Every file and consumer referencing these symbols across `src/`, `tests/`, and HTML files was audited:

| # | Consumer File | Symbol(s) Referenced | Invocation Pattern | Depends on `new-tab.js` Wrapper? | Depends on Canonical Service (`bookmark-loader-service.js`)? | Impact of Removing `new-tab.js` Wrapper |
|:---:|---|---|---|:---:|:---:|---|
| **1** | [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | `loadBookmarkMetadata`<br>`loadLastUsedFolderId`<br>`loadFolderMetadata`<br>`loadBookmarks` | Internal calls in `initializePage()` (lines 662, 663, 691, 749) | **Yes (Internal)** | No (Calls wrapper) | **Must route calls to `window.HomebaseBookmarkLoader.*`** |
| **2** | [`src/newtab/bookmarks/bookmark-action-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-action-controller.js) | `loadBookmarks`<br>`processBookmarks` | `actionDelegates` $\to$ `window.loadBookmarks` $\to$ `loadBookmarks` (lines 101–123) | **No** | **Yes** (`window.*`) | **Safe**: `bookmark-loader-service.js` already provides `window.loadBookmarks` and `window.processBookmarks`. |
| **3** | [`src/newtab/bookmarks/bookmark-drag-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-drag-controller.js) | `loadBookmarks` | `window.loadBookmarks(folderId)` $\to$ `loadBookmarks(folderId)` (lines 104–112) | **No** | **Yes** (`window.loadBookmarks`) | **Safe**: Handled by `bookmark-loader-service.js`. |
| **4** | [`src/newtab/bookmarks/bookmark-editor-adapter.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js) | `loadBookmarks`<br>`setLastUsedFolderId` | `window.loadBookmarks`, `window.setLastUsedFolderId` (lines 139, 179) | **No** | **Yes** (`window.*`) | **Safe**: Handled by `bookmark-loader-service.js`. |
| **5** | [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) | `loadBookmarks` | Folder rename: `loadBookmarks` $\to$ `window.loadBookmarks(folderNode.id)` (lines 1275–1279) | **No** | **Yes** (`window.loadBookmarks`) | **Safe**: Handled by `bookmark-loader-service.js`. |
| **6** | [`src/newtab/bookmarks/bookmark-root-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-root-controller.js) | `loadBookmarks` | `ensureDefaultRootFolder` (line 247), `handleStorageChange` (lines 357–363) | **No** | **Yes** (`window.loadBookmarks` / `HomebaseBookmarkLoader.loadBookmarks`) | **Safe**: Resolves via `window.loadBookmarks` or `HomebaseBookmarkLoader`. |
| **7** | [`src/newtab/bookmarks/folder-picker.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js) | `loadBookmarks` | `await loadBookmarks()` on modal confirm (line 295) | **No** | **Yes** (global scope `window.loadBookmarks`) | **Safe**: Global `loadBookmarks` points to `window.loadBookmarks`. |
| **8** | [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js) | `loadBookmarks`<br>`setLastUsedFolderId` | `context.loadBookmarks`, `context.setLastUsedFolderId` (lines 495, 503, 1998) | **No** | Indirect via adapter | **Safe**: Adapter provides `window.loadBookmarks` and `window.setLastUsedFolderId`. |
| **9** | [`src/newtab/bookmarks/bookmark-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-storage.js) | `setLastUsedFolderId` | Implements underlying storage persistence (`setLastUsedFolderIdStorage`, line 262) | **No** | Independent producer | **Safe**: Storage service is the downstream persistence layer called by the loader. |
| **10** | [`src/newtab/core/perf-report.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js) | `'loadFolderMetadata'`<br>`'loadBookmarks total'` | String telemetry labels for performance timing (lines 636, 658, 661) | **No** | Independent observer | **Safe**: Timing calls in `new-tab.js` retain exact same metric string keys. |
| **11** | HTML Files (`src/new-tab.html`) | None | No inline scripts reference any loader functions | **No** | N/A | **Safe**: 0 references. |
| **12** | [`tests/unit/bookmark-loader-service.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/bookmark-loader-service.test.mjs) | All 6 methods | Asserts `sandbox.window.HomebaseBookmarkLoader.*` and verifies `sandbox.window.*` bridges (lines 68–85) | **No** | **Yes (Direct)** | **Safe**: Tests `bookmark-loader-service.js` directly in an isolated VM sandbox; does not load `new-tab.js`. |
| **13** | [`tests/unit/storage-dispatcher.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/storage-dispatcher.test.mjs) | `loadBookmarks` | Mock injected into VM sandbox to test `BookmarkRootController.handleStorageChange` (line 320) | **No** | Mocked | **Safe**: Fully self-contained mock. |
| **14** | [`scripts/smoke-newtab-file.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/smoke-newtab-file.mjs) | `HomebaseBookmarkLoader` | Headless browser smoke test checks `window.HomebaseBookmarkLoader` availability (lines 154, 232) | **No** | **Yes** | **Safe**: Verified on canonical namespace. |
| **15** | [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | Declaration Collision Checker | Verifies zero top-level collisions across 63 deferred scripts | **No** | Independent validator | **Safe**: Removing top-level function declarations from `new-tab.js` further reduces global namespace footprint. |

---

## 3. Deep-Dive Analysis of Consumer Subsystems

### 3.1 `src/new-tab.js` Startup Flow
Inside [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), `initializePage()` contains four invocations:

1. **`loadBookmarkMetadata()`** (line 662):
   ```javascript
   // Current:
   const bookmarkMetaP = loadBookmarkMetadata();
   // Recommended:
   const bookmarkMetaP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarkMetadata === 'function')
     ? window.HomebaseBookmarkLoader.loadBookmarkMetadata()
     : Promise.resolve({});
   ```
2. **`loadLastUsedFolderId()`** (line 663):
   ```javascript
   // Current:
   const lastFolderP = loadLastUsedFolderId();
   // Recommended:
   const lastFolderP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadLastUsedFolderId === 'function')
     ? window.HomebaseBookmarkLoader.loadLastUsedFolderId()
     : Promise.resolve(null);
   ```
3. **`loadFolderMetadata()`** (line 691):
   ```javascript
   // Current:
   await loadFolderMetadata();
   // Recommended:
   if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadFolderMetadata === 'function') {
     await window.HomebaseBookmarkLoader.loadFolderMetadata();
   }
   ```
4. **`loadBookmarks()`** (line 749):
   ```javascript
   // Current:
   await loadBookmarks();
   // Recommended:
   if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
     await window.HomebaseBookmarkLoader.loadBookmarks();
   }
   ```

These calls preserve:
- Parallel execution of `[settingsP, bookmarkMetaP, lastFolderP]` via `Promise.allSettled`.
- Startup logging (`logInitSettled`).
- Performance marks and timing (`hbPerfTime('loadFolderMetadata', folderMetaStart)`, `hbPerfTime('loadBookmarks total', bookmarksStart)`).

### 3.2 External Bookmark Controllers
All external bookmark controllers (`bookmark-action-controller.js`, `bookmark-drag-controller.js`, `bookmark-grid-controller.js`, `bookmark-root-controller.js`, `bookmark-editor-adapter.js`) invoke `window.loadBookmarks` or check `actionDelegates` first. 

Because `bookmark-loader-service.js` binds `window.loadBookmarks = loadBookmarks` directly upon execution, these controllers will continue to receive the exact same function reference without `new-tab.js` re-assigning it.

### 3.3 Folder Picker Dialog
`folder-picker.js` invokes `await loadBookmarks()` at line 295. In browser execution, bare identifier lookups resolve up the scope chain to `window.loadBookmarks`. Since `bookmark-loader-service.js` registers `window.loadBookmarks`, this call resolves safely.

---

## 4. Removal Safety Assessment

| Dimension | Assessment | Details |
|---|:---:|---|
| **External Module Risk** | **ZERO RISK** | All other modules already access `window.loadBookmarks` or `window.HomebaseBookmarkLoader`, which are permanently exported by `bookmark-loader-service.js`. |
| **Startup Performance Risk** | **ZERO RISK** | Startup calls in `initializePage()` continue to run in parallel (`Promise.allSettled`) and retain exact timing hooks (`hbPerfTime`). |
| **Static Collision Risk** | **ZERO RISK** | Removing 6 top-level function declarations (`processBookmarks`, `loadBookmarkMetadata`, etc.) eliminates dead declarations from `new-tab.js` without creating any collisions. |
| **Automated Test Risk** | **ZERO RISK** | `bookmark-loader-service.test.mjs` directly asserts against `sandbox.window.HomebaseBookmarkLoader` and `sandbox.window.*` bridges established by `bookmark-loader-service.js`. |
| **Overall Safety Rating** | **HIGHLY SAFE** | 100% verified duplicate code; direct forwarding is clean and atomic. |

---

## 5. Recommended Implementation Approach for Phase 2B

When authorized to implement Phase 2B:

1. **Update Call Sites in `src/new-tab.js` (`initializePage`)**:
   - Update line 662 to call `window.HomebaseBookmarkLoader.loadBookmarkMetadata()`.
   - Update line 663 to call `window.HomebaseBookmarkLoader.loadLastUsedFolderId()`.
   - Update line 691 to call `window.HomebaseBookmarkLoader.loadFolderMetadata()`.
   - Update line 749 to call `window.HomebaseBookmarkLoader.loadBookmarks()`.
2. **Remove Compatibility Forwarders in `src/new-tab.js`**:
   - Delete lines 560 to 612 (the 53-line compatibility block containing `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `loadBookmarks`, and the `window.* = ...` assignments).
3. **Line Count Impact**:
   - Current line count: **1,119 lines**
   - Lines removed: **~53 lines**
   - Projected post-Phase 2B size: **~1,066 lines**
4. **Mandatory Verification Suite**:
   ```powershell
   node --check src/new-tab.js
   node scripts/check-newtab-static.mjs
   npm.cmd test
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```
5. **Rollback Strategy**:
   If any regression is detected:
   ```powershell
   git checkout -- src/new-tab.js
   ```
   Instantly restores current baseline.

---

## 6. Conclusion & Recommendation

The audit conclusively proves that removing the bookmark loader compatibility wrappers from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) is **safe, clean, and zero-risk**.

Proceed to request user approval for Phase 2B implementation.
