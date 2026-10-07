# Homebase Improvement Cycle #9 Phase 2 Implementation Report: Bookmark Storage Service Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 2 (Bookmark Storage Service Extraction)  
**Target Release:** Homebase v0.16.0  
**Baseline Commit:** `49d0a94` ("Extract favicon cache storage service")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

In Phase 2 of Cycle #9, bookmark-related storage responsibilities were extracted from `src/new-tab.js` into a dedicated service module: **`src/newtab/bookmarks/bookmark-storage.js`**.

### Core Goals:
1. **Extract Bookmark Storage Domain Responsibilities:**
   - Root folder ID persistence and clearing (`getHomebaseRootId`, `setHomebaseRootId`, `clearHomebaseRootId`).
   - Custom bookmark metadata persistence (`getBookmarkMetadata`, `setBookmarkMetadata`, `removeBookmarkMetadata`).
   - Custom folder metadata persistence (`getFolderMetadata`, `setFolderMetadata`).
   - Last-used folder state persistence (`getLastUsedFolderId`, `setLastUsedFolderId`).
   - Custom metadata sanitization and normalization (`normalizeBookmarkMetadata`, `normalizeFolderMetadata`).
2. **Facade Integration with Defensive Fallback:**
   - Route primary reads, writes, and deletions through `window.HomebaseStorage.get()`, `set()`, and `remove()`.
   - Ensure schema validation and sanitization defined in `src/newtab/core/schema-validator.js` are enforced.
   - Maintain resilient fallback to `browser.storage.local` if `HomebaseStorage` is unmounted.
3. **Preserve Monolith Invariants:**
   - Bookmark rendering, folder selection, reordering, and editor UI behavior remain completely unchanged.
   - Zero changes to startup orchestration in `src/new-tab.js` (`loadBookmarkMetadata`, `loadLastUsedFolderId`, `loadFolderMetadata` retain their in-memory state coordination roles while delegating persistence).
   - Zero changes to protected paths (`src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`).
   - Classic `<script defer>` architecture maintained without ES modules or bundlers.

---

## 2. Files Changed & Extracted Logic

### 2.1 New Service: `src/newtab/bookmarks/bookmark-storage.js`
- **Constants:**
  - `HOMEBASE_BOOKMARK_ROOT_ID_KEY = 'homebaseBookmarkRootId'`
  - `BOOKMARK_META_KEY = 'bookmarkCustomMetadata'`
  - `FOLDER_META_KEY = 'folderCustomMetadata'`
  - `LAST_USED_BOOKMARK_FOLDER_KEY = 'lastUsedBookmarkFolderId'`
- **Normalization Helpers:**
  - `normalizeBookmarkMetadata(raw)`: Clamps string lengths (icon <= 100k, title <= 300, url <= 4096, containerId <= 64) and removes invalid types.
  - `normalizeFolderMetadata(raw)`: Clamps color strings, icon identifiers, and bounds `customOrder` arrays to 1000 items.
- **Service Functions:**
  - `getHomebaseRootId()`: Reads `homebaseBookmarkRootId` via `HomebaseStorage` (or fallback).
  - `setHomebaseRootId(id)`: Persists root folder ID via `HomebaseStorage`.
  - `clearHomebaseRootId()`: Deletes root folder ID via `HomebaseStorage`.
  - `getBookmarkMetadata()`: Reads and normalizes `bookmarkCustomMetadata`.
  - `setBookmarkMetadata(meta)`: Normalizes and writes `bookmarkCustomMetadata`.
  - `removeBookmarkMetadata(bookmarkId)`: Removes metadata for an individual bookmark or clears all bookmark metadata.
  - `getFolderMetadata()`: Reads and normalizes `folderCustomMetadata`.
  - `setFolderMetadata(meta)`: Normalizes and writes `folderCustomMetadata`.
  - `getLastUsedFolderId()`: Reads `lastUsedBookmarkFolderId`.
  - `setLastUsedFolderId(id)`: Persists `lastUsedBookmarkFolderId`.
- **Global & Namespace Exports:** Exposes functions and keys globally and under `window.HomebaseBookmarkStorage`.

### 2.2 Script Registration: `src/new-tab.html`
- Registered `<script src="newtab/bookmarks/bookmark-storage.js" defer></script>` directly after `favicon-cache.js` (line 3350) and prior to `src/new-tab.js`.

### 2.3 Monolith Pruning: `src/new-tab.js`
- Removed duplicated constants (`BOOKMARK_META_KEY`, `HOMEBASE_BOOKMARK_ROOT_ID_KEY`, `FOLDER_META_KEY`, `LAST_USED_BOOKMARK_FOLDER_KEY`).
- Removed duplicated root ID functions (`getHomebaseRootId`, `setHomebaseRootId`, `clearHomebaseRootId`), allowing callers within `src/new-tab.js` to invoke the global service implementations directly.
- Updated in-memory state loaders and persister:
  - `loadBookmarkMetadata()`: delegates reading to `await getBookmarkMetadata()`.
  - `loadLastUsedFolderId()`: delegates reading to `await getLastUsedFolderId()`.
  - `setLastUsedFolderId(id)`: updates in-memory variable `lastUsedBookmarkFolderId` and delegates persistence to `HomebaseBookmarkStorage.setLastUsedFolderId(id)`.
  - `loadFolderMetadata()`: delegates reading to `await getFolderMetadata()`.
- Net result: All 7 direct `storage.local` operations in the bookmark subsystem removed from `src/new-tab.js`.

---

## 3. Storage Call Reduction in `src/new-tab.js`

| Subsystem in `src/new-tab.js` | Direct `storage.local` Calls Before Phase 1 | After Phase 1 | After Phase 2 | Net Reduction in Phase 2 |
| :--- | :---: | :---: | :---: | :---: |
| Favicon Cache & Pruning | 4 | 0 | 0 | 0 (Eliminated in Phase 1) |
| **Bookmarks & Metadata** | **7** | **7** | **0** | **-7 (100% eliminated)** |
| Wallpaper Lifecycle & Cache | 38 | 38 | 38 | Pending Phase 4 |
| Search State & Preferences | 7 | 7 | 7 | Pending Phase 3 |
| Legacy Host Adapters | 5 | 5 | 5 | Pending Phase 5 |
| Performance Preference | 1 | 1 | 1 | Unchanged |
| **TOTAL in `src/new-tab.js`** | **62** | **58** | **51** | **-7 calls (-12.1% this phase, -17.7% cumulative)** |

---

## 4. Verification & Testing

### 4.1 New Unit Test Suite (`tests/unit/bookmark-storage.test.mjs`)
Implemented 15 unit tests covering the bookmark storage subsystem:
1. `getHomebaseRootId reads valid root ID via HomebaseStorage` (PASSED)
2. `getHomebaseRootId returns empty string for missing key` (PASSED)
3. `setHomebaseRootId and clearHomebaseRootId persist via HomebaseStorage` (PASSED)
4. `root ID methods fall back to browser.storage.local when HomebaseStorage is absent` (PASSED)
5. `getBookmarkMetadata reads and normalizes metadata via HomebaseStorage` (PASSED)
6. `setBookmarkMetadata normalizes and persists via HomebaseStorage` (PASSED)
7. `removeBookmarkMetadata deletes single bookmark or clears all` (PASSED)
8. `bookmark metadata falls back to browser.storage.local when HomebaseStorage is absent` (PASSED)
9. `missing bookmark and folder metadata return empty object` (PASSED)
10. `corrupted bookmark metadata safely normalizes to clean object` (PASSED)
11. `corrupted items within metadata are filtered and clamped` (PASSED)
12. `getFolderMetadata and setFolderMetadata persist via HomebaseStorage` (PASSED)
13. `folder metadata falls back to browser.storage.local when HomebaseStorage is absent` (PASSED)
14. `getLastUsedFolderId and setLastUsedFolderId handle state and fallback` (PASSED)
15. `exports expected functions and keys to window and HomebaseBookmarkStorage` (PASSED)

### 4.2 Automated Invariant & Syntax Checks
- **Syntax Check:** `node --check src/newtab/bookmarks/bookmark-storage.js src/new-tab.js tests/unit/bookmark-storage.test.mjs` -> PASSED
- **Static Invariants:** `node scripts/check-newtab-static.mjs` -> PASSED (43 deferred local scripts checked, zero duplicate declarations)
- **Unit Test Suite:** `npm.cmd test` -> **216 / 216 tests passing** across 4 stages (0 failures, up from 201 tests)
- **Production Bundle Build:** `npm.cmd run build` -> PASSED (`dist\chrome` and `dist\firefox` generated successfully)

### 4.3 Protected Files Integrity
```powershell
git diff src/preload.js src/instant_load.js manifests/
```
- **Result:** 0 changes (strictly untouched).

---

## 5. Next Phase Recommendation

Proceed to **Cycle #9 Phase 3: Search Engine & Search State Storage Extraction**:
- Target: Extract the 7 search-related `storage.local` calls in `src/new-tab.js` (including `currentSearchEngineId` and `appSearchDefaultEngine`) into `src/newtab/search/search-storage.js`.
