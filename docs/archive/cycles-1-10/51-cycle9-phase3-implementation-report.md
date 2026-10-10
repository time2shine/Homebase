# Homebase Improvement Cycle #9 Phase 3 Implementation Report: Search Storage Service Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 3 (Search State & Preference Storage Extraction)  
**Target Release:** Homebase v0.16.0  
**Baseline Commit:** `a9aed48` ("Extract bookmark storage service")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

In Phase 3 of Cycle #9, search-related storage responsibilities were extracted from `src/new-tab.js` into a dedicated service module: **`src/newtab/search/search-storage.js`**.

### Core Goals:
1. **Extract Search Storage Domain Responsibilities:**
   - Current search engine selection persistence (`getCurrentSearchEngineId`, `setCurrentSearchEngine`, `setCurrentSearchEngineId`).
   - Default search engine configuration persistence (`getDefaultSearchEngineId`, `setDefaultSearchEngineId`).
   - Remember search engine preference persistence (`getSearchRememberEnginePreference`, `setSearchRememberEnginePreference`).
   - Search engines configuration list persistence (`getSearchEnginesConfig`, `setSearchEnginesConfig`).
   - Batch search preference loading and saving (`getSearchPreferences`, `setSearchPreferences`).
   - Fast-search mirror cache serialization and synchronization (`getFastSearchPayload`, `writeFastSearchCache`, `getFastSearchCache`, `clearFastSearchCache`).
2. **Facade Integration with Defensive Fallback:**
   - Route primary reads, writes, and batch operations through `window.HomebaseStorage.get()`, `set()`, `getMany()`, and `setMany()`.
   - Ensure schema validation and sanitization defined in `src/newtab/core/schema-validator.js` are enforced.
   - Maintain resilient fallback to `browser.storage.local` if `HomebaseStorage` is unmounted.
3. **Preserve Monolith Invariants:**
   - Search rendering, dropdown selection, instant-load previews, and keyboard navigation remain completely unchanged.
   - Zero changes to protected paths (`src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`).
   - Classic `<script defer>` architecture maintained without ES modules or bundlers.

---

## 2. Files Changed & Extracted Logic

### 2.1 New Service: `src/newtab/search/search-storage.js`
- **Constants:**
  - `CURRENT_SEARCH_ENGINE_ID_KEY = 'currentSearchEngineId'`
  - `APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEngine'`
  - `APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEngine'`
  - `SEARCH_ENGINES_PREF_KEY = 'searchEnginesConfig'`
  - `FAST_SEARCH_STORAGE_KEY = 'fast-search'`
- **Service Functions:**
  - `getCurrentSearchEngineId()`: Reads `currentSearchEngineId` via `HomebaseStorage.get` (default: `'google'`).
  - `setCurrentSearchEngine(engineOrId, options)`: Persists engine ID via `HomebaseStorage.set` and synchronizes the `fast-search` mirror when passed an engine object.
  - `setCurrentSearchEngineId(engineId, options)`: Alias for `setCurrentSearchEngine`.
  - `getDefaultSearchEngineId()`: Reads `appSearchDefaultEngine` via `HomebaseStorage.get` (default: `'google'`).
  - `setDefaultSearchEngineId(engineId)`: Persists default engine ID via `HomebaseStorage.set`.
  - `getSearchRememberEnginePreference()`: Reads boolean preference via `HomebaseStorage.get` (default: `true`).
  - `setSearchRememberEnginePreference(enabled)`: Persists boolean preference via `HomebaseStorage.set`.
  - `getSearchEnginesConfig()`: Reads search engines config array via `HomebaseStorage.get` (default: `[]`).
  - `setSearchEnginesConfig(config)`: Persists search engines config array via `HomebaseStorage.set`.
  - `getSearchPreferences()`: Loads all search-related preferences in a single batch read via `HomebaseStorage.getMany`.
  - `setSearchPreferences(prefs)`: Persists multiple search preferences in a batch via `HomebaseStorage.setMany`.
  - `getFastSearchPayload(engine)`: Constructs instant-load fast search cache preview object.
  - `writeFastSearchCache(engine)`: Serializes fast search cache to `localStorage.setItem('fast-search', ...)`.
  - `getFastSearchCache()`: Safely retrieves and parses fast search cache from `localStorage`.
  - `clearFastSearchCache()`: Clears fast search cache from `localStorage`.
- **Global & Namespace Exports:** Exposes functions and keys globally and under `window.HomebaseSearchStorage`.

### 2.2 Script Registration: `src/new-tab.html`
- Registered `<script src="newtab/search/search-storage.js" defer></script>` directly after `bookmark-storage.js` (line 3351) and prior to `src/new-tab.js`.

### 2.3 Monolith Pruning: `src/new-tab.js`
- Removed duplicated constants (`APP_SEARCH_REMEMBER_ENGINE_KEY`, `APP_SEARCH_DEFAULT_ENGINE_KEY`, `SEARCH_ENGINES_PREF_KEY`).
- Removed `getFastSearchPayload` and `writeFastSearchCache` implementations, using the exported service methods.
- Replaced 3 inline engine selection click and change persistence calls with `setCurrentSearchEngine(...)`.
- Replaced direct batch `browser.storage.local.get` in `loadSearchEnginePreferences()` with `await getSearchPreferences()`.
- Replaced 2 direct `browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: ... })` calls in storage listener with `setDefaultSearchEngineId(...)`.
- Replaced direct `browser.storage.local.set({ currentSearchEngineId: ... })` call in storage listener with `setCurrentSearchEngine(...)`.
- Net result: All 7 direct `storage.local` operations in the search subsystem removed from `src/new-tab.js`.

---

## 3. Storage Call Reduction in `src/new-tab.js`

| Subsystem in `src/new-tab.js` | Direct `storage.local` Calls Before Phase 1 | After Phase 1 | After Phase 2 | After Phase 3 | Net Reduction in Phase 3 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Favicon Cache & Pruning | 4 | 0 | 0 | 0 | 0 (Phase 1) |
| Bookmarks & Metadata | 7 | 7 | 0 | 0 | 0 (Phase 2) |
| **Search State & Preferences** | **7** | **7** | **7** | **0** | **-7 (100% eliminated)** |
| Wallpaper Lifecycle & Cache | 38 | 38 | 38 | 38 | Pending Phase 4 |
| Legacy Host Adapters | 5 | 5 | 5 | 5 | Pending Phase 5 |
| Performance Preference | 1 | 1 | 1 | 1 | Unchanged |
| **TOTAL in `src/new-tab.js`** | **62** | **58** | **51** | **44** | **-7 calls (-13.7% this phase, -29.0% cumulative)** |

---

## 4. Verification & Testing

### 4.1 New Unit Test Suite (`tests/unit/search-storage.test.mjs`)
Implemented 13 unit tests covering search storage and fast-search mirror synchronization:
1. `getCurrentSearchEngineId reads valid engine via HomebaseStorage` (PASSED)
2. `getCurrentSearchEngineId returns "google" when key is missing or invalid` (PASSED)
3. `setCurrentSearchEngine persists string ID and syncs fast-search mirror` (PASSED)
4. `current search engine falls back to browser.storage.local when HomebaseStorage is absent` (PASSED)
5. `getDefaultSearchEngineId and setDefaultSearchEngineId manage default engine` (PASSED)
6. `default search engine falls back to browser.storage.local when HomebaseStorage is absent` (PASSED)
7. `getSearchRememberEnginePreference and setSearchRememberEnginePreference manage boolean preference` (PASSED)
8. `getSearchEnginesConfig and setSearchEnginesConfig handle engine list` (PASSED)
9. `getSearchPreferences loads all search keys in batch` (PASSED)
10. `setSearchPreferences persists multiple search keys in batch` (PASSED)
11. `getFastSearchCache, writeFastSearchCache, and clearFastSearchCache manage mirror` (PASSED)
12. `getFastSearchCache handles corrupted localStorage JSON safely` (PASSED)
13. `exports expected functions and keys to window and HomebaseSearchStorage` (PASSED)

### 4.2 Automated Invariant & Syntax Checks
- **Syntax Check:** `node --check src/newtab/search/search-storage.js src/new-tab.js tests/unit/search-storage.test.mjs` -> PASSED
- **Static Invariants:** `node scripts/check-newtab-static.mjs` -> PASSED (44 deferred local scripts checked, zero duplicate declarations)
- **Unit Test Suite:** `npm.cmd test` -> **229 / 229 tests passing** across 4 stages (0 failures, up from 216 tests)
- **Production Bundle Build:** `npm.cmd run build` -> PASSED (`dist\chrome` and `dist\firefox` generated successfully)

### 4.3 Protected Files Integrity
```powershell
git diff src/preload.js src/instant_load.js manifests/
```
- **Result:** 0 changes (strictly untouched).

---

## 5. Next Phase Recommendation

Proceed to **Cycle #9 Phase 4: Wallpaper & Video Storage Extraction**:
- Target: Extract the 38 wallpaper/video `storage.local` calls in `src/new-tab.js` into `src/newtab/wallpaper/wallpaper-storage.js`.
