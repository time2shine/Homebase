# Homebase Cycle #11 Phase 5 — Checkpoint 14-D-B Architecture Audit
## Bookmark Storage Ownership & Event Routing

**Date:** October 5, 2026  
**Auditor:** Antigravity  
**Target File:** `src/new-tab.js` (lines 1810–1840)  
**Target Subsystem:** `src/newtab/bookmarks/`  
**Reference Dispatcher:** `src/newtab/core/storage-dispatcher.js`  
**Scope:** Architecture Audit ONLY. Zero source modifications, zero commits, zero pushes.

---

## 1. Executive Summary

Following the successful extraction of `HomebaseStorageDispatcher` in Checkpoint 14-D-A, this audit evaluates the remaining bookmark-related storage handling inside `src/new-tab.js` (lines 1810–1840, 31 lines).

### Key Audit Findings:
1. **Existing Duplicate Handler in Bookmark Root Controller:**
   - `src/newtab/bookmarks/bookmark-root-controller.js` (lines 353–361) already exports `handleStorageChange(changes, area)` which detects `HOMEBASE_BOOKMARK_ROOT_ID_KEY` and invokes `loadBookmarks()`.
   - Lines 1838–1840 in `src/new-tab.js` duplicate this check verbatim.
2. **Misplaced Grid Event Coordination:**
   - Lines 1810–1833 in `src/new-tab.js` coordinate metadata diffing (`getChangedMetadataIds`), DOM card patching (`patchActiveGridMetadataItems`), and full grid re-rendering (`renderBookmarkGrid`).
   - All three functions are defined and exported by `src/newtab/bookmarks/bookmark-grid-controller.js`.
   - `src/new-tab.js` is merely acting as an ad-hoc event adapter between the storage listener and the bookmark grid controller.
3. **Strict Extraction Boundary Adherence:**
   - Per requirements, rendering, DOM patching, drag/drop, and bookmark loading pipelines must **NOT** be moved.
   - All rendering and DOM patching code is *already* in `bookmark-grid-controller.js`. Moving *only storage event ownership* means encapsulating the event response logic into a `handleStorageChange(changes, area)` method on `HomebaseBookmarkGridController` and routing it canonically via `HomebaseStorageDispatcher`.
4. **Estimated Line Reduction:**
   - **~31 lines removed** from `src/new-tab.js`.
   - Leaves only wallpaper synchronization in `handleNewTabStorageChange` in `new-tab.js`.
5. **Risk Assessment: LOW–MEDIUM:**
   - Completely outside `initializePage()` (zero startup critical-path risk).
   - Preserves all existing rendering, patching, and data structures.

---

## 2. Current Bookmark Storage Handling in `src/new-tab.js`

Located at lines 1810–1840 of `src/new-tab.js` within `handleNewTabStorageChange(changes, area)`:

```javascript
  let changedMetadataIds = null;

  if (changes[FOLDER_META_KEY]) {
    const nextFolderMetadata = changes[FOLDER_META_KEY].newValue || {};
    changedMetadataIds = getChangedMetadataIds(changes[FOLDER_META_KEY].oldValue, nextFolderMetadata);
    folderMetadata = nextFolderMetadata;
  }

  if (changes[BOOKMARK_META_KEY]) {
    const nextBookmarkMetadata = changes[BOOKMARK_META_KEY].newValue || {};
    const changedBookmarkIds = getChangedMetadataIds(changes[BOOKMARK_META_KEY].oldValue, nextBookmarkMetadata);
    changedMetadataIds = changedMetadataIds
      ? Array.from(new Set([...changedMetadataIds, ...changedBookmarkIds]))
      : changedBookmarkIds;
    bookmarkMetadata = nextBookmarkMetadata;
  }

  if (changedMetadataIds?.length && currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {
    const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
    if (activeNode && patchActiveGridMetadataItems(activeNode, changedMetadataIds)) {
      renderBookmarkGrid(activeNode);
    }
  }

  if (changes[LAST_USED_BOOKMARK_FOLDER_KEY]) {
    lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
  }

  if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
    loadBookmarks();
  }
```

### Breakdown of Handled Keys:
1. **`FOLDER_META_KEY` (`'folderCustomMetadata'`):**
   - Diffs previous vs next folder metadata via `getChangedMetadataIds`.
   - Mutates `folderMetadata`.
2. **`BOOKMARK_META_KEY` (`'bookmarkCustomMetadata'`):**
   - Diffs previous vs next bookmark metadata via `getChangedMetadataIds`.
   - Merges changed IDs into `changedMetadataIds`.
   - Mutates `bookmarkMetadata`.
3. **Active Grid Patch / Render Trigger:**
   - If `changedMetadataIds` has entries: finds `activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id)`.
   - Calls `patchActiveGridMetadataItems(activeNode, changedMetadataIds)`.
   - If patch returns `true` (indicating changes exceed patch limit or item unrendered), calls `renderBookmarkGrid(activeNode)`.
4. **`LAST_USED_BOOKMARK_FOLDER_KEY` (`'lastUsedBookmarkFolderId'`):**
   - Updates `lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null`.
5. **`HOMEBASE_BOOKMARK_ROOT_ID_KEY` (`'homebaseBookmarkRootId'`):**
   - Re-loads full bookmark tree via `loadBookmarks()`.

---

## 3. Current Architecture Flow

```
[browser.storage.onChanged]
             │
             ▼
[HomebaseStorageDispatcher] (src/newtab/core/storage-dispatcher.js)
   ├── SearchUIController.handleStorageChange()
   ├── SettingsPreferences.handleStorageChange()
   ├── TodoWidget.handleTodoStorageChange()
   └── Subscribers Set
             │
             ▼ (onStorageChange callback)
[src/new-tab.js] -> handleNewTabStorageChange()
   ├── Wallpaper Sync (L1799–1808)
   │
   └── Bookmark Handling (L1810–1840) [MISPLACED IN NEW-TAB.JS]
         ├── Diffs metadata using bookmark-grid-controller.getChangedMetadataIds()
         ├── Mutates local folderMetadata & bookmarkMetadata
         ├── Calls bookmark-grid-controller.patchActiveGridMetadataItems()
         ├── Calls bookmark-grid-controller.renderBookmarkGrid()
         ├── Mutates lastUsedBookmarkFolderId
         └── Calls loadBookmarks() [DUPLICATE of bookmark-root-controller]
```

---

## 4. Evaluation of Existing Ownership Candidates

| Candidate Module | Current Responsibilities | Suitability for Bookmark Storage Handling |
|---|---|---|
| **`src/newtab/bookmarks/bookmark-root-controller.js`** | Root discovery, ensure root folder, root controls, `handleStorageChange` | **IDEAL for `HOMEBASE_BOOKMARK_ROOT_ID_KEY`**.<br>Already defines `handleStorageChange` (L353–361). Simply needs to be invoked by `HomebaseStorageDispatcher`. |
| **`src/newtab/bookmarks/bookmark-grid-controller.js`** | Card rendering, folder tabs, grid virtualizer, `getChangedMetadataIds`, `patchActiveGridMetadataItems`, `renderBookmarkGrid` | **IDEAL for `FOLDER_META_KEY`, `BOOKMARK_META_KEY`, `LAST_USED_BOOKMARK_FOLDER_KEY`**.<br>Already owns the diffing, patching, and grid re-render logic. Adding a `handleStorageChange` method here aligns perfectly with its ownership of grid card state. |
| **`src/newtab/bookmarks/bookmark-loader-service.js`** | Subtree discovery, tree flattening, permissions, metadata loading | **NOT RECOMMENDED**.<br>Loader service handles data retrieval and tree building, not active reactive DOM grid updates. |
| **`src/newtab/bookmarks/bookmark-storage.js`** | Normalization, get/set helpers for storage keys | **NOT RECOMMENDED**.<br>Storage service is a passive CRUD helper, not an active event listener or DOM updater. |
| **`src/newtab/bookmarks/bookmark-ui-state.js`** | Visibility, empty states, boot classes | **NOT RECOMMENDED**.<br>UI state is high-level container visibility, not card-level metadata diffing. |

---

## 5. Duplicate Logic & Inconsistencies Identified

### 1. Root ID Reload Duplication:
- **In `src/newtab/bookmarks/bookmark-root-controller.js:353–361`:**
  ```javascript
  function handleStorageChange(changes, area) {
    if (area && area !== 'local') return;
    const rootKey = (typeof window !== 'undefined' && window.HOMEBASE_BOOKMARK_ROOT_ID_KEY) || 'homebaseBookmarkRootId';
    if (changes && changes[rootKey]) {
      if (typeof loadBookmarks === 'function') {
        loadBookmarks();
      }
    }
  }
  ```
- **In `src/new-tab.js:1838–1840`:**
  ```javascript
  if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
    loadBookmarks();
  }
  ```
- **Finding:** The root ID check in `new-tab.js` is completely redundant.

### 2. External Invocation of Grid Controller Internals:
- `src/new-tab.js` manually invokes three separate methods on `bookmark-grid-controller.js` (`getChangedMetadataIds`, `patchActiveGridMetadataItems`, `renderBookmarkGrid`).
- The coordination logic (calculating the union of changed IDs, resolving the active node, and deciding between in-place DOM patching vs full grid render) is bookmark grid domain logic that belongs inside `bookmark-grid-controller.js`.

---

## 6. Recommended Target Architecture

### Proposed Flow Diagram:

```
[browser.storage.onChanged]
             │
             ▼
[HomebaseStorageDispatcher] (src/newtab/core/storage-dispatcher.js)
   ├── 1. Search:   HomebaseSearchUiController.handleStorageChange(changes, area)
   ├── 2. Settings: HomebaseSettingsPreferences.handleStorageChange(changes, area)
   ├── 3. Todo:     handleTodoStorageChange(changes, area)
   │
   ├── 4. Bookmark Root: HomebaseBookmarkRootController.handleStorageChange(changes, area)
   │      └── Reloads bookmarks if root ID changed
   │
   ├── 5. Bookmark Grid: HomebaseBookmarkGridController.handleStorageChange(changes, area)
   │      ├── Diffs FOLDER_META_KEY & BOOKMARK_META_KEY
   │      ├── Updates folderMetadata & bookmarkMetadata
   │      ├── Patches active DOM cards or triggers renderBookmarkGrid()
   │      └── Updates lastUsedBookmarkFolderId
   │
   └── Subscribers (Subscribers Set)
          └── Wallpaper sync in new-tab.js (temporary until wallpaper extraction)
```

---

## 7. Safe Extraction Boundary Definition

To strictly comply with the rule:
> "Move only bookmark storage event ownership. Do NOT move rendering, DOM patching, drag/drop, bookmark loading pipeline."

### Boundary Specification:
1. **Zero Moves of Rendering or DOM Code:**
   - `renderBookmarkGrid` remains where it is in `bookmark-grid-controller.js`.
   - `patchActiveGridMetadataItems` remains where it is in `bookmark-grid-controller.js`.
   - `loadBookmarks` remains where it is in `bookmark-loader-service.js` / `new-tab.js`.
2. **Move Only Event Handling:**
   - In `src/newtab/bookmarks/bookmark-grid-controller.js`:
     Implement `handleStorageChange(changes, area)`:
     ```javascript
     function handleStorageChange(changes, area) {
       if (area && area !== 'local') return;
       if (!changes || typeof changes !== 'object') return;

       const folderMetaKey = (typeof window !== 'undefined' && window.FOLDER_META_KEY) || 'folderCustomMetadata';
       const bookmarkMetaKey = (typeof window !== 'undefined' && window.BOOKMARK_META_KEY) || 'bookmarkCustomMetadata';
       const lastFolderKey = (typeof window !== 'undefined' && window.LAST_USED_BOOKMARK_FOLDER_KEY) || 'lastUsedBookmarkFolderId';

       let changedMetadataIds = null;

       if (changes[folderMetaKey]) {
         const nextFolderMeta = changes[folderMetaKey].newValue || {};
         changedMetadataIds = getChangedMetadataIds(changes[folderMetaKey].oldValue, nextFolderMeta);
         if (typeof window !== 'undefined') window.folderMetadata = nextFolderMeta;
       }

       if (changes[bookmarkMetaKey]) {
         const nextBookmarkMeta = changes[bookmarkMetaKey].newValue || {};
         const changedBookmarkIds = getChangedMetadataIds(changes[bookmarkMetaKey].oldValue, nextBookmarkMeta);
         changedMetadataIds = changedMetadataIds
           ? Array.from(new Set([...changedMetadataIds, ...changedBookmarkIds]))
           : changedBookmarkIds;
         if (typeof window !== 'undefined') window.bookmarkMetadata = nextBookmarkMeta;
       }

       if (changes[lastFolderKey]) {
         const nextLastFolder = changes[lastFolderKey].newValue || null;
         if (typeof window !== 'undefined') window.lastUsedBookmarkFolderId = nextLastFolder;
       }

       if (changedMetadataIds?.length) {
         const currentFolderNode = getCurrentGridFolderNode();
         const tree = (typeof window !== 'undefined' && window.bookmarkTree) || null;
         const rootNode = tree && tree[0];
         const findNode = (typeof window !== 'undefined' && window.findBookmarkNodeById) || findBookmarkNodeById;

         if (currentFolderNode && rootNode && typeof findNode === 'function') {
           const activeNode = findNode(rootNode, currentFolderNode.id);
           if (activeNode && patchActiveGridMetadataItems(activeNode, changedMetadataIds)) {
             renderBookmarkGrid(activeNode);
           }
         }
       }
     }
     ```
   - Export `handleStorageChange` on `window.HomebaseBookmarkGridController`.
3. **Dispatch Routing in `storage-dispatcher.js`:**
   - In `src/newtab/core/storage-dispatcher.js`, call:
     1. `window.HomebaseBookmarkRootController.handleStorageChange(changes, areaName)`
     2. `window.HomebaseBookmarkGridController.handleStorageChange(changes, areaName)`
4. **Cleanup in `src/new-tab.js`:**
   - Remove lines 1810–1840 from `handleNewTabStorageChange` in `src/new-tab.js`.

---

## 8. Risk Assessment & Mitigations

| Risk Factor | Level | Mitigation Strategy |
|---|---|---|
| **Startup Critical Path** | **NONE** | Storage events are purely asynchronous and never fire during initial page hydration or layout. |
| **Shared Metadata References** | **LOW** | Both `bookmark-grid-controller.js` and other modules already read/write `window.folderMetadata` and `window.bookmarkMetadata`. Synchronization via `window` preserves reference parity. |
| **Grid Re-render Race** | **LOW** | `patchActiveGridMetadataItems` and `renderBookmarkGrid` logic is copied verbatim into the controller method with zero changes to condition branching or limit thresholds. |
| **Cross-Tab Synchronization** | **LOW** | Storage dispatcher routes all local storage changes immediately to the controller with error isolation (`try/catch`). |

---

## 9. Line Reduction Estimates

| File | Change | Lines |
|---|---|---|
| `src/new-tab.js` | Removed bookmark event handling lines (L1810–1840) | **-31 lines** |
| `src/newtab/core/storage-dispatcher.js` | Added calls to Bookmark Root and Bookmark Grid controllers | **+16 lines** |
| `src/newtab/bookmarks/bookmark-grid-controller.js` | Added `handleStorageChange` method & export | **+36 lines** |

- **Net reduction in `src/new-tab.js`:** **31 lines**.
- **Remaining in `handleNewTabStorageChange` in `new-tab.js`:** Only wallpaper synchronization (~10 lines).

---

## 10. Recommendation & Implementation Plan for Checkpoint 14-D-B

### Verdict: **PROCEED WITH EXTRACTION**

### Step-by-Step Implementation Plan:
1. **Update `src/newtab/bookmarks/bookmark-grid-controller.js`:**
   - Add `handleStorageChange(changes, area)`.
   - Export it in `HomebaseBookmarkGridController` object.
2. **Update `src/newtab/core/storage-dispatcher.js`:**
   - Add calls to `HomebaseBookmarkRootController.handleStorageChange(changes, areaName)` and `HomebaseBookmarkGridController.handleStorageChange(changes, areaName)` with defensive try/catch wrappers.
3. **Update `src/new-tab.js`:**
   - Remove lines 1810–1840 from `handleNewTabStorageChange`.
4. **Update Unit Tests (`tests/unit/storage-dispatcher.test.mjs`):**
   - Add test cases verifying dispatch to `HomebaseBookmarkRootController` and `HomebaseBookmarkGridController`.
5. **Run Verification:**
   - `node --check`
   - `node scripts/check-newtab-static.mjs`
   - `node scripts/smoke-newtab-file.mjs`
   - `npm.cmd test`
   - `npm.cmd run build`
   - `git diff --check`

---

## 11. Status Confirmation

- **Source edits performed:** 0
- **Commits:** 0
- **Pushes:** 0
- **Audit completed.** Awaiting your review and approval to proceed with implementation.
