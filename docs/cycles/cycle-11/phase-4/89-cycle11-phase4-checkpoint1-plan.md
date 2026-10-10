# Homebase Improvement Cycle #11 Phase 4 Checkpoint 1 — Implementation Plan
## Dead Code Pruning & Redundant Bridge Consolidation

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 4 Checkpoint 1  
> **Target Release**: Homebase v0.19.0  
> **Target File**: `src/new-tab.js`  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/88-cycle11-phase4-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/88-cycle11-phase4-audit.md)

---

## 1. Context & Objectives

Following the modular extraction of the Wallpaper Controller (Phase 2) and Bookmark Grid Controller (Phase 3), the monolithic runtime [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) was reduced from 9,012 lines to 5,281 lines.

As audited in [docs/88-cycle11-phase4-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/88-cycle11-phase4-audit.md), [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) contains orphan functions, stale wrapper shims left behind after earlier extractions, and redundant pass-through favicon forwarders that have no independent logic and no remaining callers in the workspace.

### Checkpoint 1 Objectives:
1. **Remove Confirmed Orphan / Dead Functions**:
   - `bookmarkNodeExists(id)`: 0 callers workspace-wide.
   - `debugFavicon(event, details)`: empty no-op stub.
   - 11 unused bookmark grid wrappers (delegating to `HomebaseBookmarkGridController`) with 0 callers workspace-wide:
     - `ensureBookmarkFallback`
     - `clearBookmarkImages`
     - `renderBookmark`
     - `autoResizeTextarea`
     - `renderBookmarkFolder`
     - `createBackButton`
     - `createNodeForVirtualizer`
     - `metadataEntriesEqual`
     - `updateVirtualGrid`
     - `initVirtualizer`
     - `setupBookmarkFolderAddTooltip`
2. **Remove Pure Redundant Favicon Forwarders**:
   - Prune 21 favicon pass-through wrappers in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) that have zero independent logic and zero active callers across the repository.
3. **Preserve Active Inter-Module Bridges & Startup Flow**:
   - Retain active favicon bridge functions (`ensureFaviconObserver`, `getFaviconUrlForRawUrl`, `getDomainKeyFromUrl`, `buildFaviconCandidates`, `resolveFaviconForImageTarget`, `setFaviconImageSrc`, `revokeFaviconObjectUrl`) to avoid refactoring active callers or disrupting startup / search runtime.
   - Retain active bookmark grid wrappers (`renderBookmarkGrid`, `renderBookmarkIconInto`, `renderFolderIconInto`, `updateElementData`, `getIconKeyForNode`, `getChangedMetadataIds`, `findRenderedGridItemById`, `patchActiveGridMetadataItems`, `disableVirtualizer`, `createFolderTabs`).

---

## 2. Inventory of Target Pruning Items

### A. Confirmed Orphan Functions (2 Items)

| Function | Lines in `new-tab.js` | Callers in `new-tab.js` | Callers Workspace-Wide | Action |
|---|:---:|:---:|:---:|:---:|
| `debugFavicon(event, details)` | L980–982 (3 lines) | 0 | 0 | **Prune** |
| `bookmarkNodeExists(id)` | L1363–1372 (10 lines) | 0 | 0 | **Prune** |

### B. Unused Bookmark Grid Wrappers (11 Items)

All 11 wrappers were provided as backward-compatibility bridges in Phase 3. Each function is already exported directly to `window.*` by `src/newtab/bookmarks/bookmark-grid-controller.js` (which loads at script index 29, prior to `new-tab.js` at script index 54).

| Function | Lines in `new-tab.js` | Callers in `new-tab.js` | Window Export in Controller | Action |
|---|:---:|:---:|:---:|:---:|
| `ensureBookmarkFallback(wrapper, fallbackLetter)` | L2298–2302 (5 lines) | 0 | `window.ensureBookmarkFallback` | **Prune** |
| `clearBookmarkImages(wrapper)` | L2304–2308 (5 lines) | 0 | `window.clearBookmarkImages` | **Prune** |
| `renderBookmark(bookmarkNode)` | L2322–2326 (5 lines) | 0 | `window.renderBookmark` | **Prune** |
| `autoResizeTextarea(textarea)` | L2472–2476 (5 lines) | 0 | `window.autoResizeTextarea` | **Prune** |
| `renderBookmarkFolder(folderNode)` | L2480–2484 (5 lines) | 0 | `window.renderBookmarkFolder` | **Prune** |
| `createBackButton(parentId)` | L2595–2599 (5 lines) | 0 | `window.createBackButton` | **Prune** |
| `createNodeForVirtualizer(node)` | L2601–2605 (5 lines) | 0 | `window.createNodeForVirtualizer` | **Prune** |
| `metadataEntriesEqual(previousEntry, nextEntry)` | L2620–2625 (6 lines) | 0 | `window.metadataEntriesEqual` | **Prune** |
| `updateVirtualGrid()` | L2648–2652 (5 lines) | 0 | `window.updateVirtualGrid` | **Prune** |
| `initVirtualizer(allItems)` | L2654–2658 (5 lines) | 0 | `window.initVirtualizer` | **Prune** |
| `setupBookmarkFolderAddTooltip(addButton, addTooltip)` | L2915–2919 (5 lines) | 0 | `window.setupBookmarkFolderAddTooltip` | **Prune** |

### C. Redundant Favicon Forwarders with Zero Callers (21 Items)

These 21 functions do nothing more than check `window.HomebaseFaviconPipeline` and forward calls. They have zero callers workspace-wide:

| Function | Lines in `new-tab.js` | Controller Method | Callers | Action |
|---|:---:|:---:|:---:|:---:|
| `setFaviconResolved` | L984–988 | `HomebaseFaviconPipeline.setResolvedEntry` | 0 | **Prune** |
| `getFaviconResolvedEntry` | L990–995 | `HomebaseFaviconPipeline.getResolvedEntry` | 0 | **Prune** |
| `getFaviconResolvedUrl` | L997–1002 | `HomebaseFaviconPipeline.getResolvedUrl` | 0 | **Prune** |
| `notifyFaviconWaiters` | L1004–1008 | `HomebaseFaviconPipeline.notifyWaiters` | 0 | **Prune** |
| `runNextFaviconTask` | L1010–1014 | `HomebaseFaviconPipeline.runNextTask` | 0 | **Prune** |
| `enqueueFaviconTask` | L1016–1021 | `HomebaseFaviconPipeline.enqueueTask` | 0 | **Prune** |
| `getFaviconCache` | L1023–1028 | `HomebaseFaviconPipeline.getFaviconCache` | 0 | **Prune** |
| `cacheKeyFor` | L1030–1035 | `HomebaseFaviconPipeline.cacheKeyFor` | 0 | **Prune** |
| `readIconFromCache` | L1037–1042 | `HomebaseFaviconPipeline.readIconFromCache` | 0 | **Prune** |
| `writeIconToCache` | L1044–1049 | `HomebaseFaviconPipeline.writeIconToCache` | 0 | **Prune** |
| `responseToObjectURL` | L1051–1056 | `HomebaseFaviconPipeline.responseToObjectURL` | 0 | **Prune** |
| `xhrFetchBlob` | L1058–1063 | `HomebaseFaviconPipeline.xhrFetchBlob` | 0 | **Prune** |
| `blobToResponse` | L1065–1070 | `HomebaseFaviconPipeline.blobToResponse` | 0 | **Prune** |
| `setFaviconObjectUrlForImage` | L1072–1076 | `HomebaseFaviconPipeline.setObjectUrlForImage` | 0 | **Prune** |
| `loadFaviconObjectUrlIntoImage` | L1090–1095 | `HomebaseFaviconPipeline.loadObjectUrlIntoImage` | 0 | **Prune** |
| `testFaviconCandidateUrl` | L1097–1102 | `HomebaseFaviconPipeline.testCandidateUrl` | 0 | **Prune** |
| `testFaviconCandidateObjectUrl` | L1104–1109 | `HomebaseFaviconPipeline.testCandidateObjectUrl` | 0 | **Prune** |
| `queueFaviconResolution` | L1117–1121 | `HomebaseFaviconPipeline.queueResolution` | 0 | **Prune** |
| `isValidFaviconTargetUrl` | L1123–1128 | `HomebaseFaviconPipeline.isValidTargetUrl` | 0 | **Prune** |
| `applyResolvedFaviconResult` | L2279–2283 | `HomebaseFaviconPipeline.applyResolvedFaviconResult` | 0 | **Prune** |
| `resolveFaviconFromNetwork` | L2285–2290 | `HomebaseFaviconPipeline.resolveFaviconFromNetwork` | 0 | **Prune** |

### D. Functions Intentionally Preserved (7 Favicon Bridges + Active Grid Wrappers)

1. **Favicon Bridges Retained**:
   - `ensureFaviconObserver`: Called at line 4186 inside `initializePage()` (startup sequence).
   - `getFaviconUrlForRawUrl`: Called at line 2368 in `deleteBookmarkOrFolder()` and exported in `createBookmarkEditorContext()` at line 1278.
   - `getDomainKeyFromUrl`: Exported in `createBookmarkEditorContext()` at line 1279, referenced in `search-interaction-controller.js` line 1286.
   - `buildFaviconCandidates`: Referenced in `search-interaction-controller.js` line 1292.
   - `resolveFaviconForImageTarget`: Referenced in `search-interaction-controller.js` line 1299.
   - `setFaviconImageSrc`: Referenced in `search-interaction-controller.js` line 1308.
   - `revokeFaviconObjectUrl`: Referenced in `search-interaction-controller.js` line 1274.
2. **Bookmark Grid Bridges Retained**:
   - `renderBookmarkGrid`: Core rendering dispatcher used across 12 call sites.
   - `renderBookmarkIconInto`: Passed to editor context at line 1284.
   - `renderFolderIconInto`: Used in UI callbacks.
   - `updateElementData`, `getIconKeyForNode`, `getChangedMetadataIds`, `findRenderedGridItemById`, `patchActiveGridMetadataItems`, `disableVirtualizer`, `createFolderTabs`: Active bridges used during drag-and-drop, tab switching, and tree updates.

---

## 3. Implementation Steps

1. **Prune Favicon Forwarders (Lines 980–1076, Lines 1090–1110, Lines 1116–1129) in `src/new-tab.js`**:
   - Remove `debugFavicon` through `setFaviconObjectUrlForImage`.
   - Keep `revokeFaviconObjectUrl` and `setFaviconImageSrc`.
   - Remove `loadFaviconObjectUrlIntoImage`, `testFaviconCandidateUrl`, `testFaviconCandidateObjectUrl`.
   - Keep `ensureFaviconObserver`.
   - Remove `queueFaviconResolution` and `isValidFaviconTargetUrl`.
   - Keep `getDomainKeyFromUrl`, `buildFaviconCandidates`, and `getFaviconUrlForRawUrl`.
2. **Prune Bookmark Orphan & Favicon Network Shims (Lines 1363–1372, Lines 2279–2290) in `src/new-tab.js`**:
   - Remove `bookmarkNodeExists`.
   - Remove `applyResolvedFaviconResult` and `resolveFaviconFromNetwork`.
   - Keep `resolveFaviconForImageTarget`.
3. **Prune Unused Bookmark Grid Wrappers (Lines 2298–2308, Lines 2322–2326, Lines 2472–2484, Lines 2595–2605, Lines 2620–2625, Lines 2648–2658, Lines 2915–2919) in `src/new-tab.js`**:
   - Remove `ensureBookmarkFallback`, `clearBookmarkImages`.
   - Remove `renderBookmark`.
   - Remove `autoResizeTextarea`, `renderBookmarkFolder`.
   - Remove `createBackButton`, `createNodeForVirtualizer`.
   - Remove `metadataEntriesEqual`.
   - Remove `updateVirtualGrid`, `initVirtualizer`.
   - Remove `setupBookmarkFolderAddTooltip`.
4. **Automated Verification**:
   - `node --check src/new-tab.js`
   - `node scripts/check-newtab-static.mjs`
   - `node scripts/smoke-newtab-file.mjs`
   - `npm.cmd test`
   - `npm.cmd run build`
   - `git diff --check`
   - Ensure protected files (`src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`) are untouched.
5. **Documentation & Reporting**:
   - Create `docs/90-cycle11-phase4-checkpoint1-report.md`.
