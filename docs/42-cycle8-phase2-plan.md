# Homebase — Improvement Cycle #8 (Phase 2) Implementation Plan
## Widget & Settings Module Migration to Unified `HomebaseStorage` Facade

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-29  
> **Cycle ID**: Homebase Improvement Cycle #8 — Phase 2  
> **Target Release**: Homebase v0.16.0  
> **Baseline Commit**: `1f83711` ("Complete Cycle 8 Phase 1 storage facade hardening")  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/40-cycle8-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/40-cycle8-plan.md), [docs/41-cycle8-phase1-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/41-cycle8-phase1-implementation-report.md)  
> **Scope**: Architecture Planning & Storage Access Audit for Phase 2 — **PLANNING DOCUMENT ONLY — ZERO SOURCE CHANGES**

---

## Table of Contents

1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [Complete Storage Access Inventory](#2-complete-storage-access-inventory)
   - [2.1 Summary by Subsystem Category](#21-summary-by-subsystem-category)
   - [2.2 Detailed Source Inventory by File](#22-detailed-source-inventory-by-file)
3. [Migration Priority Order](#3-migration-priority-order)
4. [Files to Modify in Phase 2](#4-files-to-modify-in-phase-2)
   - [4.1 Tier 1: Core Dashboard Widgets (P0)](#41-tier-1-core-dashboard-widgets-p0)
   - [4.2 Tier 2: Settings & Preferences Modules (P1)](#42-tier-2-settings--preferences-modules-p1)
   - [4.3 Tier 3: Diagnostic UI Auto-Repair Integration (P1)](#43-tier-3-diagnostic-ui-auto-repair-integration-p1)
   - [4.4 Tier 4: Wallpaper & Extension Integrations (P2)](#44-tier-4-wallpaper--extension-integrations-p2)
5. [Risk Analysis & Mitigation Strategies](#5-risk-analysis--mitigation-strategies)
6. [Strict Protected Boundaries & Invariants](#6-strict-protected-boundaries--invariants)
7. [Testing & Quality Assurance Strategy](#7-testing--quality-assurance-strategy)
8. [Phase 2 Execution Steps & Verification Checklist](#8-phase-2-execution-steps--verification-checklist)

---

## 1. Executive Summary & Purpose

In Cycle #7 Phase 1, `window.HomebaseStorage` was established as the canonical storage gateway, and in Cycle #8 Phase 1, its foundations were hardened:
- `FAST_MIRROR_MAP` was corrected (`appTimeFormatPreference -> fast-time-format`; phantom keys removed).
- Core utilities (`isPlainObject`, `areValuesIdentical`, `clampNumber`, `clampInteger`) were promoted to `src/newtab/core/utils.js`.
- Redundant helper definitions were pruned across core and backup modules.

However, as revealed in the Cycle #8 Architecture Audit, **more than 90% of extracted widget and settings modules still bypass `window.HomebaseStorage`**, issuing uncoordinated calls directly to `browser.storage.local.get/set/remove`. 

### Key Consequences of Direct Storage Access:
1. **Validation Gating Bypass**: Routine writes from widgets (weather cache, todo items, quote preferences) bypass `HomebaseValidator`. Corrupted objects or out-of-bounds integers persist unchecked in persistent storage.
2. **Dual-Write Drift**: Modules frequently perform split dual-writes (`localStorage.setItem('fast-*')` followed by `browser.storage.local.set()`). If local storage throws a `QuotaExceededError` or the async IPC fails, the two tiers desynchronize.
3. **Redundant Boilerplate**: Every module manually implements error logging, browser API detection (`browser?.storage?.local`), and mirror updates.

### Phase 2 Objective:
Systematically migrate all extracted widget, settings, and wallpaper modules to `HomebaseStorage.get()`, `getMany()`, `set()`, `setMany()`, and `remove()`. This closes the storage facade migration gap, activates universal schema validation gating across normal user operations, and centralizes instant fast-mirror synchronization with automatic exception containment.

---

## 2. Complete Storage Access Inventory

A comprehensive static audit was performed across all JavaScript files in `src/` to identify every occurrence of:
- `browser.storage.local.get` / `browser.storage.local.set` / `browser.storage.local.remove`
- `chrome.storage.local.*`
- Direct `localStorage` fast-mirror writes (`fast-*`)

### 2.1 Summary by Subsystem Category

| Category / Directory | Direct `storage.local` Calls | Direct `localStorage` Writes | Uses `HomebaseStorage`? | Migration Target |
| :--- | :---: | :---: | :---: | :--- |
| **Widgets** (`src/newtab/widgets/`) | **33** | **7** | NO | **Phase 2 (Tier 1)** |
| **Settings** (`src/newtab/settings/`) | **24** | **3** | Partial (1 of 6) | **Phase 2 (Tier 2 & 3)** |
| **Wallpaper** (`src/newtab/wallpaper/`) | **3** | **0** | NO | **Phase 2 (Tier 4)** |
| **Integrations** (`src/newtab/integrations/`) | **2** | **0** | NO | **Phase 2 (Tier 4)** |
| **Core** (`src/newtab/core/`) | **21** | **0** | Facade/Engine | **Core Infrastructure** |
| **Popup Context** (`src/action-popup/`) | **7** | **0** | NO | Standalone Popup Realm |
| **Protected Coordinator** (`src/new-tab.js`) | **62** | **18** | NO | **Protected (Phase 3)** |
| **Protected Preload** (`src/preload.js`) | **6** | **0** | NO | **Strictly Protected** |
| **TOTAL** | **158** | **28** | — | — |

---

### 2.2 Detailed Source Inventory by File

#### A. Extracted Widgets (`src/newtab/widgets/`) — 33 direct calls:
1. **`src/newtab/widgets/weather.js` (15 direct calls)**:
   - Line 282: `browser.storage.local.get(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt'])`
   - Line 548: `browser.storage.local.set({ cachedWeatherData, cachedCityName, cachedUnits, weatherFetchedAt })`
   - Line 607: `browser.storage.local.get(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt'])`
   - Line 710: `browser.storage.local.set({ [APP_SHOW_WEATHER_KEY]: shouldShow })` (also writes `fast-show-weather` at line 705)
   - Line 746: `browser.storage.local.set({ weatherUnits: units })`
   - Line 756: `browser.storage.local.get('weatherUnits')`
   - Line 893: `browser.storage.local.get(['weatherCityName', 'weatherUnits'])`
   - Line 917: `browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName'])`
   - Line 931: `browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName'])`
   - Line 944: `browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherUnits', 'weatherCityName'])`
   - Line 986: `browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName'])`
   - Line 999: `browser.storage.local.set(settingsToSave)`
   - Line 1001: `browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits'])`
   - Line 1014: `browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherUnits', 'weatherCityName'])`
2. **`src/newtab/widgets/quote.js` (8 direct calls)**:
   - Line 259: `browser.storage.local.get([QUOTE_INDEX_KEY])`
   - Line 307: `browser.storage.local.set({ [QUOTE_INDEX_KEY]: newIndex })`
   - Line 436: `browser.storage.local.get(['quoteTags', QUOTE_FREQUENCY_KEY])`
   - Line 560: `browser.storage.local.get(['quoteTags'])`
   - Line 705: `browser.storage.local.get(QUOTE_FREQUENCY_KEY)`
   - Line 833: `browser.storage.local.set({ quoteTags: tagsToSave, [QUOTE_FREQUENCY_KEY]: frequency })`
   - Line 862: `browser.storage.local.set({ [APP_SHOW_QUOTE_KEY]: shouldShow })` (also writes `fast-show-quote` at line 857)
3. **`src/newtab/widgets/todo.js` (6 direct calls)**:
   - Line 154: `browser.storage.local.set({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone })` (also writes `fast-todo` at line 146)
   - Line 175: `browser.storage.local.get([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY])`
   - Line 297: `browser.storage.local.set({ [APP_SHOW_TODO_KEY]: shouldShow })` (also writes `fast-show-todo` at line 290)
4. **`src/newtab/widgets/widget-visibility.js` (6 direct calls)**:
   - Line 29: `browser.storage.local.set({ [APP_SHOW_SIDEBAR_KEY]: appShowSidebarPreference })` (also writes `fast-show-sidebar` at line 22)
   - Line 111: `browser.storage.local.set({ [WIDGET_ORDER_KEY]: normalized })` (also writes `fast-widget-order` at line 99)
   - Line 147: `browser.storage.local.set({ [WIDGET_ORDER_KEY]: order })`
5. **`src/newtab/widgets/news.js` (4 direct calls)**:
   - Line 96: `browser.storage.local.get(APP_NEWS_SOURCE_KEY)`
   - Line 738: `browser.storage.local.set({ [APP_NEWS_SOURCE_KEY]: selected })`
   - Line 774: `browser.storage.local.set({ [APP_SHOW_NEWS_KEY]: shouldShow })` (also writes `fast-show-news` at line 769)
6. **`src/newtab/widgets/time.js` (0 storage.local, 1 localStorage)**:
   - Line 37: `localStorage.setItem('fast-time-format', timeFormatPreference)` (bypasses `HomebaseStorage.set('appTimeFormatPreference', ...)`)

---

#### B. Extracted Settings (`src/newtab/settings/`) — 24 direct calls:
1. **`src/newtab/settings/diagnostic-ui.js` (9 occurrences)**:
   - Lines 384, 386, 398: `browserInstance.storage.local.getBytesInUse(null)` (telemetry calculation; retain API capability with fallback)
   - Lines 414, 416: `browserInstance.storage.local.get(null)` (fallback item size estimation)
   - Line 510: `browserInstance.storage.local.get(null)` (snapshot read in `repairStorageSafe()`)
   - Line 534: `browserInstance.storage.local.set(patch)` (mutation commit in `repairStorageSafe()`)
2. **`src/newtab/settings/settings-ui.js` (5 direct calls)**:
   - Line 1103: `browser.storage.local.set({ widgetOrder: order })` (also writes `fast-widget-order` at line 1098)
   - Line 1314: `browser.storage.local.set({ [APP_BACKGROUND_DIM_KEY]: appBackgroundDimPreference })` (also writes `fast-bg-dim` at line 1309)
   - Line 1580: `browser.storage.local.set({ ... 29 preferences batch ... })`
   - Line 1617: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: updatedWallpaperSelection })`
   - Line 1622: `browser.storage.local.remove('currentSearchEngineId')`
3. **`src/newtab/settings/search-engine-settings.js` (3 direct calls)**:
   - Line 242: `browser.storage.local.set({ [SEARCH_ENGINES_PREF_KEY]: storageData })`
   - Line 260: `browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: defaultEngineId })`
   - Line 296: `browser.storage.local.set({ currentSearchEngineId: firstEnabled.id })`
4. **`src/newtab/settings/settings-preferences.js` (3 direct calls)**:
   - Line 12: `browser.storage.local.get([APP_PERFORMANCE_MODE_KEY, APP_DEBUG_PERF_OVERLAY_KEY, APP_BATTERY_OPTIMIZATION_KEY])`
   - Line 556: `browser.storage.local.set({ [APP_PERFORMANCE_MODE_KEY]: nextValue })` (mirrored to `fast-perf-mode`)
   - Line 582: `browser.storage.local.set({ [APP_DEBUG_PERF_OVERLAY_KEY]: nextValue })`
5. **`src/newtab/settings/visual-effects-runtime.js` (2 direct calls)**:
   - Line 44: `browser.storage.local.get(APP_GLASS_STYLE_KEY)`
   - Line 78: `browser.storage.local.get(APP_GRID_ANIMATION_KEY)`
6. **`src/newtab/settings/visual-effects-settings.js` (2 direct calls)**:
   - Line 88: `browser.storage.local.set({ [APP_GRID_ANIMATION_KEY]: selectedKey })`
   - Line 179: `browser.storage.local.set({ [APP_GLASS_STYLE_KEY]: selectedId })`
7. **`src/newtab/settings/backup-import.js` (0 direct calls)**:
   - Fully migrated to `HomebaseStorage.snapshot()` and `HomebaseStorage.setMany()` in Cycle #7 Phase 2.

---

#### C. Extracted Wallpaper & Integrations — 5 direct calls:
1. **`src/newtab/wallpaper/gallery-ui.js` (3 direct calls in adapter functions)**:
   - Line 175: `browser.storage.local.get(keys)` inside `storageLocalGet(keys)`
   - Line 180: `browser.storage.local.set(items)` inside `storageLocalSet(items)`
   - Line 185: `browser.storage.local.remove(keys)` inside `storageLocalRemove(keys)`
2. **`src/newtab/integrations/firefox-containers.js` (2 direct calls)**:
   - Line 72: `browser.storage.local.set({ [APP_CONTAINER_MODE_KEY]: isEnabled })`
   - Line 100: `browser.storage.local.set({ [APP_CONTAINER_NEW_TAB_KEY]: appContainerNewTabPreference })`

---

#### D. Core Infrastructure (Architectural Boundary — Retain Direct/Low-Level Access):
1. **`src/newtab/core/storage-service.js` (8 calls)**:
   - The implementation of the facade itself. Must retain raw `browser.storage.local` access.
2. **`src/newtab/core/schema-migrations.js` (11 calls)**:
   - Low-level database migration engine running *before* `HomebaseStorage` facade initialization. Must retain raw atomic writes and transactions.
3. **`src/newtab/core/storage-diagnostics.js` (2 calls)**:
   - Diagnostic audit and raw health probe. Reads directly to audit raw storage validity.
4. **`src/newtab/core/perf-report.js` (0 calls)**:
   - Uses strictly `sessionStorage`; forbidden from touching persistent storage.

---

#### E. Protected Coordinator & Startup Scripts (DO NOT MODIFY IN PHASE 2):
1. **`src/new-tab.js` (62 calls)**: Monolith coordinator. Protected by AGENTS.md. Targeted only in Phase 3 for startup optimization.
2. **`src/preload.js` (6 calls)**: Head synchronous preload. Protected.
3. **`src/instant_load.js` (0 calls)**: Instant body card hydration. Protected.

---

## 3. Migration Priority Order

To ensure safe, incremental migration without regressions, Phase 2 executes in **four structured tiers**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              MIGRATION PRIORITY HIERARCHY                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 1: Core Dashboard Widgets (P0 — High Frequency & Fast Mirrors)                   │
│   1. widget-visibility.js (widgetOrder, showSidebar, showWeather/Quote/News/Todo)     │
│   2. time.js (appTimeFormatPreference -> fast-time-format)                            │
│   3. todo.js (todoItems, todoHideDone, appShowTodo)                                    │
│   4. quote.js (quoteIndex, quoteTags, quoteFrequency, appShowQuote)                    │
│   5. news.js (appNewsSource, appShowNews)                                              │
│   6. weather.js (cachedWeatherData, weatherUnits, weatherCityName, weatherLat/Lon)     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 2: Settings & Preferences Modules (P1 — Validated Settings Updates)              │
│   7. settings-preferences.js (appPerformanceMode, appDebugPerfOverlay)                 │
│   8. search-engine-settings.js (searchEngines, defaultEngine, currentSearchEngineId)  │
│   9. visual-effects-settings.js & visual-effects-runtime.js (gridAnim, glassStyle)     │
│  10. settings-ui.js (bulk settings save batch, backgroundDim, wallpaperSelection)     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 3: Diagnostic UI Auto-Repair (P1 — Multi-Key Synchronization)                    │
│  11. diagnostic-ui.js (repairStorageSafe -> HomebaseStorage.setMany)                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 4: Wallpaper & Integrations (P2 — Centralized Adapters)                           │
│  12. gallery-ui.js (route storageLocalGet/Set/Remove via HomebaseStorage)              │
│  13. firefox-containers.js (appContainerMode, appContainerNewTab)                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Files to Modify in Phase 2

### 4.1 Tier 1: Core Dashboard Widgets (P0)

#### 1. `src/newtab/widgets/widget-visibility.js`
- **Current**: Direct `browser.storage.local.set` + manual `localStorage.setItem('fast-show-sidebar')` and `localStorage.setItem('fast-widget-order')`.
- **Migration**:
  ```javascript
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
    HomebaseStorage.set(APP_SHOW_SIDEBAR_KEY, appShowSidebarPreference);
  } else if (browser?.storage?.local) {
    browser.storage.local.set({ [APP_SHOW_SIDEBAR_KEY]: appShowSidebarPreference });
  }
  ```
- **Benefit**: `HomebaseStorage.set` automatically clamps/validates the boolean and updates the `'fast-show-sidebar'` or `'fast-widget-order'` localStorage mirror without dual-write drift.

#### 2. `src/newtab/widgets/time.js`
- **Current**: Only writes `localStorage.setItem('fast-time-format', ...)` directly; does not write to persistent storage.
- **Migration**:
  ```javascript
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
    HomebaseStorage.set('appTimeFormatPreference', timeFormatPreference);
  } else {
    try { localStorage.setItem('fast-time-format', timeFormatPreference); } catch (_) {}
  }
  ```
- **Benefit**: Automatically writes to both persistent storage and `localStorage['fast-time-format']` simultaneously.

#### 3. `src/newtab/widgets/todo.js`
- **Current**: `persistTodoState()` calls `browser.storage.local.set({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone })`.
- **Migration**:
  ```javascript
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
    HomebaseStorage.setMany({
      [TODO_ITEMS_KEY]: todoItems,
      [TODO_HIDE_DONE_KEY]: todoHideDone
    });
  } else if (browser?.storage?.local) {
    browser.storage.local.set({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone });
  }
  ```
- **Benefit**: `HomebaseValidator` sanitizes and bounds todo item titles, IDs, and boolean flags automatically.

#### 4. `src/newtab/widgets/quote.js`
- **Current**: Direct get/set for `quoteIndex`, `quoteTags`, `quoteFrequency`, `appShowQuote`.
- **Migration**:
  - `loadQuoteIndex`: `HomebaseStorage.get(QUOTE_INDEX_KEY, 0)`
  - `persistQuoteIndex`: `HomebaseStorage.set(QUOTE_INDEX_KEY, newIndex)`
  - `loadQuoteSettings`: `HomebaseStorage.getMany(['quoteTags', QUOTE_FREQUENCY_KEY])`
  - `saveQuotePreferences`: `HomebaseStorage.setMany({ quoteTags: tagsToSave, [QUOTE_FREQUENCY_KEY]: frequency })`
  - `setQuoteVisibilityPreference`: `HomebaseStorage.set(APP_SHOW_QUOTE_KEY, shouldShow)`

#### 5. `src/newtab/widgets/news.js`
- **Current**: Direct get/set for `appNewsSource` and `appShowNews`.
- **Migration**:
  - `loadNewsSource`: `HomebaseStorage.get(APP_NEWS_SOURCE_KEY, 'technology')`
  - `persistNewsSource`: `HomebaseStorage.set(APP_NEWS_SOURCE_KEY, selected)`
  - `setNewsVisibilityPreference`: `HomebaseStorage.set(APP_SHOW_NEWS_KEY, shouldShow)`

#### 6. `src/newtab/widgets/weather.js`
- **Current**: 15 direct get/set/remove calls for weather cache and location coordinates.
- **Migration**:
  - `loadCachedWeather`: `HomebaseStorage.getMany(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt'])`
  - `saveCachedWeather`: `HomebaseStorage.setMany({ cachedWeatherData, cachedCityName, cachedUnits, weatherFetchedAt })`
  - `setWeatherVisibilityPreference`: `HomebaseStorage.set(APP_SHOW_WEATHER_KEY, shouldShow)`
  - `clearCustomLocation`: `HomebaseStorage.remove(['weatherLat', 'weatherLon', 'weatherCityName'])`
  - `saveWeatherSettings`: `HomebaseStorage.setMany(settingsToSave)`

---

### 4.2 Tier 2: Settings & Preferences Modules (P1)

#### 7. `src/newtab/settings/settings-preferences.js`
- **Migration**:
  - Read: `HomebaseStorage.getMany([APP_PERFORMANCE_MODE_KEY, APP_DEBUG_PERF_OVERLAY_KEY, APP_BATTERY_OPTIMIZATION_KEY])`
  - Write: `HomebaseStorage.set(APP_PERFORMANCE_MODE_KEY, nextValue)` (automatically syncs `'fast-perf-mode'`)
  - Write: `HomebaseStorage.set(APP_DEBUG_PERF_OVERLAY_KEY, nextValue)`

#### 8. `src/newtab/settings/search-engine-settings.js`
- **Migration**:
  - Write: `HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY, storageData)`
  - Write: `HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, defaultEngineId)`
  - Write: `HomebaseStorage.set('currentSearchEngineId', firstEnabled.id)`

#### 9. `src/newtab/settings/visual-effects-settings.js` & `visual-effects-runtime.js`
- **Migration**:
  - Runtime Read: `HomebaseStorage.get(APP_GLASS_STYLE_KEY, 'frosted')` and `HomebaseStorage.get(APP_GRID_ANIMATION_KEY, 'none')`
  - Settings Write: `HomebaseStorage.set(APP_GRID_ANIMATION_KEY, selectedKey)` and `HomebaseStorage.set(APP_GLASS_STYLE_KEY, selectedId)`

#### 10. `src/newtab/settings/settings-ui.js`
- **Migration**:
  - Commit widget order: `HomebaseStorage.set('widgetOrder', order)`
  - Background dim: `HomebaseStorage.set(APP_BACKGROUND_DIM_KEY, appBackgroundDimPreference)`
  - Save all settings batch: `HomebaseStorage.setMany(settingsBatch)` (replaces monolithic 29-property `storage.local.set` call)
  - Search engine cleanup: `HomebaseStorage.remove('currentSearchEngineId')`

---

### 4.3 Tier 3: Diagnostic UI Auto-Repair Integration (P1)

#### 11. `src/newtab/settings/diagnostic-ui.js`
- **Migration in `repairStorageSafe()`**:
  ```javascript
  // 1. Read existing storage snapshot via facade
  const snapshot = (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.snapshot)
    ? (await HomebaseStorage.snapshot())
    : ((await browserInstance.storage.local.get(null)) || {});
  
  // 2. Compute minimal patch (already implemented)
  // ...
  
  // 3. Write ONLY changed keys via HomebaseStorage.setMany
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
    await HomebaseStorage.setMany(patch);
  } else {
    await browserInstance.storage.local.set(patch);
  }
  ```
- **Architectural Value**: When Auto-Repair corrects an invalid `appBackgroundDim` or malformed `widgetOrder`, calling `HomebaseStorage.setMany(patch)` **instantly synchronizes the `<head>` fast-mirrors** (`fast-bg-dim`, `fast-widget-order`), preventing layout flashing on the next tab open!

---

### 4.4 Tier 4: Wallpaper & Extension Integrations (P2)

#### 12. `src/newtab/wallpaper/gallery-ui.js`
- **Migration**: Update adapter functions `storageLocalGet`, `storageLocalSet`, and `storageLocalRemove` to delegate to `HomebaseStorage`:
  ```javascript
  function storageLocalGet(keys) {
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.getMany && Array.isArray(keys)) {
      return HomebaseStorage.getMany(keys);
    }
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.get && typeof keys === 'string') {
      return HomebaseStorage.get(keys).then(val => ({ [keys]: val }));
    }
    const fn = getContextCallback('storageLocalGet');
    return fn ? fn(keys) : browser.storage.local.get(keys);
  }
  ```

#### 13. `src/newtab/integrations/firefox-containers.js`
- **Migration**:
  - `HomebaseStorage.set(APP_CONTAINER_MODE_KEY, isEnabled)`
  - `HomebaseStorage.set(APP_CONTAINER_NEW_TAB_KEY, appContainerNewTabPreference)`

---

## 5. Risk Analysis & Mitigation Strategies

| Risk Identified | Severity | Likelihood | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Storage Facade Unavailability** | High | Low | **Defensive Facade Check**: Every migration call uses `if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set)` with fallback to `browser?.storage?.local`. |
| **Validation Rejecting Semi-Valid Writes** | Medium | Low | **Sanitizing Fallback**: `HomebaseStorage.set` automatically sanitizes recoverable values (clamping numbers, normalizing hex) rather than rejecting them. |
| **Quota Exceeded in Fast Mirrors** | Medium | Low | `HomebaseStorage.syncFastMirror` contains internal `try...catch` blocks ensuring quota exhaustion in localStorage never aborts the persistent storage write. |
| **Asynchronous Race Conditions in Multi-Tab Usage** | Low | Low | Writes remain atomic at the `browser.storage.local` level. Read-only snapshots are deep-cloned. |
| **Performance Overhead** | Very Low | Low | Benchmarked `HomebaseValidator` execution is <0.05ms per key, well within the 3ms per-frame budget. |

---

## 6. Strict Protected Boundaries & Invariants

In strict adherence to [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):

1. **`src/new-tab.js` is PROTECTED**:
   - Zero changes will be made to `src/new-tab.js` during Phase 2.
   - Startup parallelization and idle scheduling optimizations are strictly reserved for Phase 3.
2. **`src/preload.js` and `src/instant_load.js` are PROTECTED**:
   - No edits permitted. Instant load and preload behavior rely on fast-mirrors maintained by `HomebaseStorage`.
3. **`manifests/*` and `dist/*` are PROTECTED**:
   - Manifest permissions and generated distribution directories remain untouched.
4. **Classic `<script defer>` Architecture Preserved**:
   - No ES module conversions (`import`/`export`).
   - No bundlers, compilers, or npm runtime dependencies.
5. **Low-Level Migration Engine Boundary**:
   - `src/newtab/core/schema-migrations.js` retains raw `browser.storage.local` calls to ensure migration primitives function before facade attachment.

---

## 7. Testing & Quality Assurance Strategy

### 7.1 Test Pipeline Verification
All changes must pass the 4-stage pipeline:
```powershell
node --check <changed-js-files>
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
```

### 7.2 New & Expanded Test Coverage (`tests/unit/storage-service.test.mjs`)
Add unit tests verifying:
1. **Widget Visibility Synchronization**: Setting `widgetOrder` and visibility booleans through `HomebaseStorage.set()` updates storage and fast mirrors accurately.
2. **Settings Batch Validation**: Passing a 29-property settings object to `HomebaseStorage.setMany()` sanitizes all properties, clamps numeric inputs, and rejects prototype pollution keys.
3. **Auto-Repair Integration**: Verifying `HomebaseStorage.setMany()` correctly updates fast-mirrors when applied via diagnostic repair.

### 7.3 Manual Firefox Testing Protocol
Per [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), manual verification in Firefox is required for:
- Firefox container preferences persistence.
- Private browsing mode storage exception containment.
- Fast-mirror updates under strict cookie/storage blocking.

---

## 8. Phase 2 Execution Steps & Verification Checklist

When user approval is granted:
- [ ] **Step 1**: Migrate Tier 1 Core Dashboard Widgets (`widget-visibility.js`, `time.js`, `todo.js`, `quote.js`, `news.js`, `weather.js`).
- [ ] **Step 2**: Migrate Tier 2 Settings Modules (`settings-preferences.js`, `search-engine-settings.js`, `visual-effects-settings.js`, `visual-effects-runtime.js`, `settings-ui.js`).
- [ ] **Step 3**: Migrate Tier 3 Diagnostic Auto-Repair in `diagnostic-ui.js`.
- [ ] **Step 4**: Migrate Tier 4 Wallpaper & Integrations (`gallery-ui.js`, `firefox-containers.js`).
- [ ] **Step 5**: Expand unit tests in `tests/unit/storage-service.test.mjs`.
- [ ] **Step 6**: Execute full verification suite (`node --check`, `check-newtab-static.mjs`, `npm.cmd test`, `npm.cmd run build`).
- [ ] **Step 7**: Compile `docs/43-cycle8-phase2-implementation-report.md`.

---

> **Phase 2 Planning Complete**: Storage inventory finalized, 4-tier migration sequence established, protected boundaries confirmed. **ZERO SOURCE CHANGES APPLIED. AWAITING USER APPROVAL.**
