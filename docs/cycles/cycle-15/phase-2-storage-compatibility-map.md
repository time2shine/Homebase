# Cycle #15 Phase 2: Search Storage Compatibility & Harmonization Map

**Cycle**: #15 — Search Subsystem Modularization & Decoupling  
**Phase**: Phase 2 — Search Storage Schema Harmonization & Encapsulation  
**Status**: Active Specification  
**Date**: 2026-10-11  

---

## 1. Overview & Objectives

In Cycle #15 Phase 2, storage boundaries, schema keys, and namespace encapsulation are addressed before any UI interaction refactoring.

Primary goals:
1. **Schema Harmonization**: Eliminate discrepancy between legacy key names and canonical WebExtension storage keys.
2. **Encapsulation**: Wrap [`src/newtab/search/search-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) inside an IIFE closure to eliminate top-level declarative collision risks.
3. **Delegation**: Refactor [`src/newtab/settings/search-engine-settings.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) to delegate configuration persistence through `HomebaseSearchStorage` instead of issuing direct `HomebaseStorage.set()` writes.
4. **Preserve Fast-Search Preload Cache**: Maintain the synchronous `localStorage.getItem('fast-search')` contract used by `instant_load.js`.
5. **100% API Compatibility**: Preserve all 18 global window accessors and namespace methods.

---

## 2. Storage Key Harmonization Matrix

| Legacy / Inconsistent Key | Canonical Storage Key | Authoritative Owner | Consumers | Description |
|---|---|---|---|---|
| `searchEngines` | `searchEnginesConfig` | `HomebaseSearchStorage` | `search-storage.js`, `search-ui-controller.js`, `search-engine-settings.js`, `settings-storage.js` | Array of `{ id: string, enabled: boolean }` defining user ordering and enabled status |
| `appSearchRememberEnginePreference` | `appSearchRememberEngine` | `HomebaseSearchStorage` | `search-storage.js`, `search-ui-controller.js`, `settings-storage.js` | Boolean flag indicating whether to restore last selected search engine |
| `appSearchDefaultEnginePreference` | `appSearchDefaultEngine` | `HomebaseSearchStorage` | `search-storage.js`, `search-ui-controller.js`, `search-engine-settings.js`, `settings-storage.js` | Engine ID string (defaults to `'google'`) used when remember engine is disabled |
| `currentSearchEngineId` | `currentSearchEngineId` | `HomebaseSearchStorage` | `search-storage.js`, `search-ui-controller.js`, `search-engine-settings.js`, `settings-storage.js` | Active selected search engine ID string (defaults to `'google'`) |
| `fast-search` | `fast-search` | `HomebaseSearchStorage` | `search-storage.js`, `instant_load.js` | Synchronous `localStorage` cache containing active engine symbol, color, and placeholder |

---

## 3. Public API & Window Compatibility Map

Every function and constant exported by `search-storage.js` is mapped below. All must remain accessible on `window.*` and `window.HomebaseSearchStorage.*`:

### 3.1 Constants & Datastructures
| Name | Target | Value / Type | Purpose |
|---|---|---|---|
| `CURRENT_SEARCH_ENGINE_ID_KEY` | `window` & `HomebaseSearchStorage` | `'currentSearchEngineId'` | Storage key constant |
| `APP_SEARCH_DEFAULT_ENGINE_KEY` | `window` & `HomebaseSearchStorage` | `'appSearchDefaultEngine'` | Storage key constant |
| `APP_SEARCH_REMEMBER_ENGINE_KEY` | `window` & `HomebaseSearchStorage` | `'appSearchRememberEngine'` | Storage key constant |
| `SEARCH_ENGINES_PREF_KEY` | `window` & `HomebaseSearchStorage` | `'searchEnginesConfig'` | Storage key constant |
| `FAST_SEARCH_STORAGE_KEY` | `window` & `HomebaseSearchStorage` | `'fast-search'` | localStorage key constant |
| `DEFAULT_SEARCH_ENGINES` | `window` & `HomebaseSearchStorage` | Array of 12 engine objects | Authoritative engine catalog |
| `searchEngines` | `window` | Array of engine objects | In-memory active search engine list bridge |

### 3.2 Methods & Storage Accessors
| API Method | `HomebaseSearchStorage` | `window` Alias | Return Type | Underlying Storage Operation |
|---|---|---|---|---|
| `getCurrentSearchEngineId()` | Yes | Yes (`getCurrentSearchEngineId`, `getCurrentSearchEngine`) | `Promise<string>` | `HomebaseStorage.get(CURRENT_SEARCH_ENGINE_ID_KEY)` |
| `setCurrentSearchEngine(engineOrId)` | Yes | Yes (`setCurrentSearchEngine`, `setCurrentSearchEngineId`) | `Promise<void>` | `HomebaseStorage.set()` + `writeFastSearchCache()` |
| `getDefaultSearchEngineId()` | Yes | Yes (`getDefaultSearchEngineId`, `getSearchDefaultEngine`, `getSearchEnginePreference`) | `Promise<string>` | `HomebaseStorage.get(APP_SEARCH_DEFAULT_ENGINE_KEY)` |
| `setDefaultSearchEngineId(engineId)` | Yes | Yes (`setDefaultSearchEngineId`, `setSearchDefaultEngine`, `setSearchEnginePreference`) | `Promise<void>` | `HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY)` |
| `getSearchRememberEnginePreference()` | Yes | Yes | `Promise<boolean>` | `HomebaseStorage.get(APP_SEARCH_REMEMBER_ENGINE_KEY)` |
| `setSearchRememberEnginePreference(enabled)` | Yes | Yes | `Promise<void>` | `HomebaseStorage.set(APP_SEARCH_REMEMBER_ENGINE_KEY)` |
| `getSearchEnginesConfig()` | Yes | Yes | `Promise<Array>` | `HomebaseStorage.get(SEARCH_ENGINES_PREF_KEY)` |
| `setSearchEnginesConfig(config)` | Yes | Yes | `Promise<void>` | `HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY)` |
| `getSearchPreferences()` | Yes | Yes | `Promise<Object>` | Batch `HomebaseStorage.getMany()` |
| `setSearchPreferences(prefs)` | Yes | Yes | `Promise<void>` | Batch `HomebaseStorage.setMany()` |
| `getFastSearchPayload(engine)` | Yes | Yes | `Object\|null` | Formats preview payload for instant-load |
| `writeFastSearchCache(engine)` | Yes | Yes | `void` | `localStorage.setItem('fast-search', ...)` |
| `getFastSearchCache()` | Yes | Yes | `Object\|null` | `localStorage.getItem('fast-search')` |
| `clearFastSearchCache()` | Yes | Yes | `void` | `localStorage.removeItem('fast-search')` |
| `getDefaultSearchEngines()` | Yes | No | `Array` | Returns cloned copy of `DEFAULT_SEARCH_ENGINES` |

---

## 4. Consumer Migration & Refactoring Plan

### 4.1 `src/newtab/search/search-ui-controller.js`
- **Issue**: Defines local constants using obsolete key names (`'searchEngines'`, `'appSearchRememberEnginePreference'`, `'appSearchDefaultEnginePreference'`), preventing `loadSearchEnginePreferences()` from reading canonical values.
- **Remediation**:
  - Update constants to canonical keys:
    ```javascript
    const SEARCH_ENGINES_PREF_KEY = (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.SEARCH_ENGINES_PREF_KEY) || 'searchEnginesConfig';
    const APP_SEARCH_REMEMBER_ENGINE_KEY = (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.APP_SEARCH_REMEMBER_ENGINE_KEY) || 'appSearchRememberEngine';
    const APP_SEARCH_DEFAULT_ENGINE_KEY = (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.APP_SEARCH_DEFAULT_ENGINE_KEY) || 'appSearchDefaultEngine';
    ```
  - In `loadSearchEnginePreferences()`, support both canonical key and legacy fallback key for seamless upgrade path.

### 4.2 `src/newtab/settings/search-engine-settings.js`
- **Issue**: Lines 242 and 260 issue direct `HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY, ...)` and `HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, ...)` calls, bypassing the search storage service.
- **Remediation**:
  - Delegate configuration save:
    ```javascript
    if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setSearchEnginesConfig) {
      await HomebaseSearchStorage.setSearchEnginesConfig(storageData);
    } else if (typeof setSearchEnginesConfig === 'function') {
      await setSearchEnginesConfig(storageData);
    }
    ```
  - Delegate default engine save:
    ```javascript
    if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setDefaultSearchEngineId) {
      await HomebaseSearchStorage.setDefaultSearchEngineId(defaultEngineId);
    } else if (typeof setDefaultSearchEngineId === 'function') {
      await setDefaultSearchEngineId(defaultEngineId);
    }
    ```

### 4.3 `src/newtab/search/search-storage.js`
- **Issue**: Currently unencapsulated at the script root level, exposing top-level variables and functions to the shared document record.
- **Remediation**:
  - Encapsulate in `(function () { 'use strict'; ... })();`.
  - Preserve all exports on `window` and `window.HomebaseSearchStorage`.

---

## 5. Verification Requirements

1. `node --check src/newtab/search/search-storage.js src/newtab/search/search-ui-controller.js src/newtab/settings/search-engine-settings.js`
2. `node scripts/check-newtab-static.mjs`
3. `npm.cmd test` (All 387 tests passing)
4. `npm.cmd run build`
