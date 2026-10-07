# Homebase Improvement Cycle #9 Phase 1 Implementation Report: Favicon Cache Service Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 1 (Favicon Cache Storage Service Extraction)  
**Target Release:** Homebase v0.16.0  
**Baseline Commit:** `3c952cf` ("Add Cycle 9 monolith storage extraction plan")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

In Phase 1 of Cycle #9, the first storage domain identified in [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md) was extracted from the monolithic `src/new-tab.js` coordinator into a dedicated service: **`src/newtab/core/favicon-cache.js`**.

### Core Goals:
1. **Extract Favicon Storage Responsibilities:**
   - Metadata key formatting (`getFaviconMetaStorageKey`).
   - Favicon metadata reads (`getFaviconMeta`).
   - Favicon metadata writes (`setFaviconMeta`).
   - Failure backoff incrementation (`bumpFaviconFail`).
   - Metadata staleness validation (`isFaviconMetaStale`).
   - Request blocking rules (`shouldBlockFaviconMeta`).
   - Periodic cache pruning (`pruneFaviconMetaIfNeeded`).
2. **Facade Integration with Defensive Fallback:**
   - Route primary reads and writes through `window.HomebaseStorage.get()`, `set()`, `snapshot()`, and `remove()`.
   - Maintain resilient fallback to `browser.storage.local` if `HomebaseStorage` is unmounted.
3. **Preserve Monolith Invariants:**
   - Zero changes to startup orchestration or idle scheduling (`scheduleIdleTask(() => pruneFaviconMetaIfNeeded(), 'startup:pruneFaviconMeta')` remains intact in `src/new-tab.js`).
   - Zero changes to `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*`.
   - Maintain classic `<script defer>` architecture with zero external dependencies.

---

## 2. Files Changed & Extracted Logic

### 2.1 New Service: `src/newtab/core/favicon-cache.js`
- **Extracted Constants:**
  - `FAVICON_META_PREFIX = 'fav:meta:'`
  - `FAVICON_META_STALE_MS = 30 * 24 * 60 * 60 * 1000`
  - `FAVICON_FAIL_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000`
  - `FAVICON_META_MAX_ENTRIES = 5000`
- **Extracted Functions:**
  - `getFaviconMetaStorageKey(domainKey)`
  - `getFaviconMeta(domainKey)`: Uses `HomebaseStorage.get(key, null)` with fallback to `browser.storage.local.get(key)`.
  - `setFaviconMeta(domainKey, meta)`: Uses `HomebaseStorage.set(key, payload)` with fallback to `browser.storage.local.set({ [key]: payload })`.
  - `bumpFaviconFail(domainKey)`: Atomically increments `failCount` and updates `lastSeen`.
  - `isFaviconMetaStale(meta)`: Verifies if metadata is older than 30 days.
  - `shouldBlockFaviconMeta(meta)`: Blocks domain requests after 3 consecutive failures within 24 hours.
  - `pruneFaviconMetaIfNeeded()`: Discovers keys via `HomebaseStorage.snapshot()`, sorts by `lastSeen`, and deletes oldest entries exceeding limit via `HomebaseStorage.remove(remove)`.
- **Global & Namespace Exports:** Exposes functions globally and under `window.HomebaseFaviconCache`.

### 2.2 Script Registration: `src/new-tab.html`
- Registered `<script src="newtab/core/favicon-cache.js" defer></script>` directly after `storage-service.js` (line 3349) and prior to `src/new-tab.js`.

### 2.3 Monolith Pruning: `src/new-tab.js`
- Removed duplicated constants (`FAVICON_META_PREFIX`, `FAVICON_META_STALE_MS`, `FAVICON_FAIL_RETRY_WINDOW_MS`, `FAVICON_META_MAX_ENTRIES`).
- Removed extracted function implementations (formerly lines 3260–3338), eliminating 4 direct `storage.local` calls.
- Startup wrapper at line 11520 calling `pruneFaviconMetaIfNeeded()` preserved and automatically routes to the new service.

---

## 3. Storage Call Reduction in `src/new-tab.js`

| Subsystem in `src/new-tab.js` | Direct `storage.local` Calls Before Phase 1 | Direct `storage.local` Calls After Phase 1 | Net Reduction |
| :--- | :---: | :---: | :---: |
| **Favicon Cache & Pruning** | **4** | **0** | **-4 (100% eliminated)** |
| Wallpaper Lifecycle & Cache | 38 | 38 | Pending Phase 4 |
| Bookmarks & Metadata | 7 | 7 | Pending Phase 2 |
| Search State & Preferences | 7 | 7 | Pending Phase 3 |
| Legacy Host Adapters | 5 | 5 | Pending Phase 5 |
| Performance Preference | 1 | 1 | Unchanged |
| **TOTAL in `src/new-tab.js`** | **62** | **58** | **-4 calls (-6.5%)** |

---

## 4. Verification & Testing

### 4.1 New Unit Test Suite (`tests/unit/favicon-cache.test.mjs`)
Created 10 comprehensive unit tests:
1. `getFaviconMeta reads valid metadata via HomebaseStorage` (PASSED)
2. `setFaviconMeta persists normalized metadata via HomebaseStorage` (PASSED)
3. `missing key returns null` (PASSED)
4. `corrupted metadata handled safely and returns null` (PASSED)
5. `falls back to browser.storage.local when HomebaseStorage is absent` (PASSED)
6. `bumpFaviconFail increments fail count and records timestamp` (PASSED)
7. `shouldBlockFaviconMeta blocks requests after 3 failures within retry window` (PASSED)
8. `isFaviconMetaStale detects entries older than 30 days` (PASSED)
9. `pruneFaviconMetaIfNeeded does not evict when entry count <= limit` (PASSED)
10. `pruneFaviconMetaIfNeeded evicts oldest entries when exceeding limit` (PASSED)

### 4.2 Automated Invariant & Syntax Checks
- **Syntax Check:** `node --check src/newtab/core/favicon-cache.js` -> PASSED
- **Syntax Check:** `node --check src/new-tab.js` -> PASSED
- **Static Invariants:** `node scripts/check-newtab-static.mjs` -> PASSED (42 deferred local scripts checked, zero duplicate declarations)
- **Unit Test Suite:** `npm.cmd test` -> **201 / 201 tests passing** across 4 stages (0 failures)
- **Production Bundle Build:** `npm.cmd run build` -> PASSED (Chrome and Firefox bundles built)

### 4.3 Protected Files Integrity
```powershell
git diff src/preload.js src/instant_load.js manifests/
```
- **Result:** 0 changes (strictly untouched).

---

## 5. Next Phase Recommendation

Proceed to **Cycle #9 Phase 2: Bookmark Storage Service Extraction**:
- Target: Extract the 7 bookmark metadata/root storage calls in `src/new-tab.js` into `src/newtab/bookmarks/bookmark-storage.js`.
