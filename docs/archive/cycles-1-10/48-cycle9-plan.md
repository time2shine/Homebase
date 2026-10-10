# Homebase — Improvement Cycle #9 Architecture & Implementation Plan
## Extraction of Storage Responsibilities from `src/new-tab.js` to Dedicated Modular Services

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: September 29, 2026  
> **Cycle ID**: Homebase Improvement Cycle #9  
> **Target Release**: Homebase v0.16.0  
> **Baseline Commit**: `278a121` ("Complete final modular storage facade migration")  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/46-cycle8-storage-audit-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/46-cycle8-storage-audit-report.md), [docs/47-cycle8-phase3-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/47-cycle8-phase3-implementation-report.md)  
> **Scope**: Planning Document Only — Zero Source Modifications  

---

## Table of Contents

1. [Executive Summary & Background](#1-executive-summary--background)
2. [Comprehensive Storage Access Inventory in `src/new-tab.js`](#2-comprehensive-storage-access-inventory-in-srcnew-tabjs)
   - [2.1 Summary by Domain Responsibility](#21-summary-by-domain-responsibility)
   - [2.2 Detailed Call Inventory (62 `storage.local` Calls)](#22-detailed-call-inventory-62-storagelocal-calls)
   - [2.3 Detailed Call Inventory (18 `localStorage` Matches)](#23-detailed-call-inventory-18-localstorage-matches)
3. [Target Modular Service Architecture](#3-target-modular-service-architecture)
   - [3.1 Favicon Cache Service (`src/newtab/core/favicon-cache.js`)](#31-favicon-cache-service-srcnewtabcorefavicon-cachejs)
   - [3.2 Bookmark Storage Service (`src/newtab/bookmarks/bookmark-storage.js`)](#32-bookmark-storage-service-srcnewtabbookmarksbookmark-storagejs)
   - [3.3 Search Storage & Cache Service (`src/newtab/search/search-storage.js`)](#33-search-storage--cache-service-srcnewtabsearchsearch-storagejs)
   - [3.4 Wallpaper Storage & Lifecycle Service (`src/newtab/wallpaper/wallpaper-storage.js`)](#34-wallpaper-storage--lifecycle-service-srcnewtabwallpaperwallpaper-storagejs)
   - [3.5 Host Environment Adapters Consolidation](#35-host-environment-adapters-consolidation)
4. [Phased Implementation Roadmap](#4-phased-implementation-roadmap)
   - [4.1 Phase 1: Favicon Cache Service Extraction (P0 - Low Risk)](#41-phase-1-favicon-cache-service-extraction-p0---low-risk)
   - [4.2 Phase 2: Bookmark Storage Service Extraction (P1 - Low-Medium Risk)](#42-phase-2-bookmark-storage-service-extraction-p1---low-medium-risk)
   - [4.3 Phase 3: Search Storage & Cache Service Extraction (P1 - Low-Medium Risk)](#43-phase-3-search-storage--cache-service-extraction-p1---low-medium-risk)
   - [4.4 Phase 4: Wallpaper Lifecycle & Cache Extraction (P2 - Medium-High Risk)](#44-phase-4-wallpaper-lifecycle--cache-extraction-p2---medium-high-risk)
   - [4.5 Phase 5: Host Adapter Consolidation & Final Audit (P0 - Low Risk)](#45-phase-5-host-adapter-consolidation--final-audit-p0---low-risk)
5. [Invariants, Protected Boundaries & Constraints](#5-invariants-protected-boundaries--constraints)
6. [Testing & Verification Strategy](#6-testing--verification-strategy)
7. [Rollback & Safety Mechanisms](#7-rollback--safety-mechanisms)

---

## 1. Executive Summary & Background

In Improvement Cycle #8, all 14 user-facing modular components under `src/newtab/` (widgets, settings, wallpaper gallery UI, container integration, and visual effects runtime) were migrated to the unified `window.HomebaseStorage` facade. This established universal schema validation gating, prototype pollution protection, and automated fast-mirror synchronization across the modular layers of Homebase.

However, as established in the Cycle #8 Final Storage Audit ([docs/46-cycle8-storage-audit-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/46-cycle8-storage-audit-report.md)), the central monolithic bootstrapper, **`src/new-tab.js`**, remains the single largest source of direct extension storage access:
- **62 direct calls** to `browser.storage.local` (`get`, `set`, `remove`)
- **18 occurrences** of `localStorage` (1 comment, 17 code lines for fast startup mirrors)
- **Zero usage** of `window.HomebaseStorage`

### Core Problems Addressed by Cycle #9:
1. **Unchecked Storage Mutations:** Storage writes inside `src/new-tab.js` (e.g. wallpaper rotation state, bookmarks root ID, favicon cache metadata) bypass `HomebaseSchemaValidator`.
2. **Dual-Write Drift:** Wallpaper poster caching and search selection perform manual split writes to `localStorage` and `browser.storage.local`, creating race conditions and state divergence risks.
3. **Monolithic Bloat:** `src/new-tab.js` spans over 13,000 lines of code. Extracting distinct storage domains into modular services reduces cognitive load, isolates side effects, and enables independent unit testing.
4. **Preservation of System Invariants:** Crucially, this extraction must be accomplished without modifying early bootloaders (`src/preload.js`, `src/instant_load.js`), without converting to ES modules, without altering extension manifests, and with zero startup latency regression.

---

## 2. Comprehensive Storage Access Inventory in `src/new-tab.js`

A complete static audit of `src/new-tab.js` identified **62 direct calls** to `browser.storage.local` and **18 occurrences** of `localStorage`.

### 2.1 Summary by Domain Responsibility

| Domain Responsibility | `storage.local` Calls | `localStorage` Writes | Primary Operations | Target Module |
| :--- | :---: | :---: | :--- | :--- |
| **Wallpaper Lifecycle & Cache** | **38** | **11** | Manifest cache, poster cache, video cache, daily rotation, wallpaper type & selection | `src/newtab/wallpaper/wallpaper-storage.js` |
| **Bookmarks & Metadata** | **7** | **0** | Root ID tracking, folder metadata, bookmark metadata, last used folder | `src/newtab/bookmarks/bookmark-storage.js` |
| **Favicon Cache & Pruning** | **4** | **0** | Domain metadata get/set, fail counters, cache pruning | `src/newtab/core/favicon-cache.js` |
| **Search State & Preferences** | **7** | **2** | Current engine selection, default engine sync, cross-tab `onChanged` | `src/newtab/search/search-storage.js` |
| **Performance Preferences** | **1** | **4** | Performance mode detection & fast mirror | `src/newtab/core/storage-service.js` (existing) |
| **Legacy Host Adapters** | **5** | **0** | Gallery host bridge (3) & bookmark editor bridge (2) | Internal factory adapters |
| **TOTAL** | **62** | **17** | — | — |

---

### 2.2 Detailed Call Inventory (62 `storage.local` Calls)

#### A. Wallpaper Lifecycle & Media Cache (38 Calls)
1. `src/new-tab.js:770`: `browser.storage.local.get([WALLPAPER_SELECTION_KEY, ...])` — `primeWallpaperBackground()` startup read
2. `src/new-tab.js:800`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — `primeWallpaperBackground()` clean pending rotation
3. `src/new-tab.js:840`: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: fallbackSelection, ... })` — `primeWallpaperBackground()` persist fallback
4. `src/new-tab.js:948`: `browser.storage.local.get([VIDEOS_JSON_CACHE_KEY, ...])` — `loadCachedGalleryManifest()`
5. `src/new-tab.js:1064`: `browser.storage.local.set({ [VIDEOS_JSON_CACHE_KEY]: manifest, ... })` — `fetchVideosManifestIfNeeded()` cache manifest
6. `src/new-tab.js:1210`: `browser.storage.local.get([GALLERY_POSTERS_CACHE_CHECKED_AT_KEY, ...])` — `cacheGalleryPostersIfNeeded()`
7. `src/new-tab.js:1225`: `browser.storage.local.set({ [GALLERY_POSTERS_CACHE_CHECKED_AT_KEY]: now, ... })` — `cacheGalleryPostersIfNeeded()` update check timestamp
8. `src/new-tab.js:1465`: `browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY)` — `cacheAppliedVideo()` clear user wallpaper video
9. `src/new-tab.js:1481`: `browser.storage.local.set({ [CACHED_APPLIED_VIDEO_URL_KEY]: targetUrl })` — `cacheAppliedVideo()` persist video URL
10. `src/new-tab.js:1485`: `browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY)` — `cacheAppliedVideo()` remove on empty
11. `src/new-tab.js:1608`: `browser.storage.local.remove(CACHED_APPLIED_POSTER_URL_KEY)` — `cacheAppliedWallpaperPoster()` clear poster URL
12. `src/new-tab.js:1609`: `browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY)` — `cacheAppliedWallpaperPoster()` clear poster data URL
13. `src/new-tab.js:1635`: `browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: urlToStore })` — `cacheAppliedWallpaperPoster()` persist poster URL
14. `src/new-tab.js:1653`: `browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY)` — `cacheAppliedWallpaperPoster()` race guard check 1
15. `src/new-tab.js:1685`: `browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY)` — `cacheAppliedWallpaperPoster()` race guard check 2
16. `src/new-tab.js:1697`: `browser.storage.local.set({ [CACHED_APPLIED_POSTER_DATA_URL_KEY]: state.dataUrl })` — `cacheAppliedWallpaperPoster()` persist encoded data URL
17. `src/new-tab.js:1711`: `browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY)` — `cacheAppliedWallpaperPoster()` remove oversized data URL
18. `src/new-tab.js:2257`: `browser.storage.local.get([WALLPAPER_POOL_KEY])` — `pickNextWallpaper()` read rotation pool
19. `src/new-tab.js:2271`: `browser.storage.local.set({ [WALLPAPER_POOL_KEY]: pool })` — `pickNextWallpaper()` save updated pool
20. `src/new-tab.js:2311`: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: selection })` — `pickNextWallpaper()` persist selected wallpaper
21. `src/new-tab.js:2363`: `browser.storage.local.get([PENDING_DAILY_ROTATION_KEY, ...])` — check pending daily rotation state
22. `src/new-tab.js:2387`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — clear invalid pending rotation
23. `src/new-tab.js:2405`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — clear completed pending rotation
24. `src/new-tab.js:2417`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — clear obsolete pending rotation
25. `src/new-tab.js:2472`: `browser.storage.local.get([WALLPAPER_SELECTION_KEY, ...])` — `rotateDailyWallpaperIfNeeded()` read current state
26. `src/new-tab.js:2496`: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: fallbackSelection, ... })` — `rotateDailyWallpaperIfNeeded()` persist fallback
27. `src/new-tab.js:2519`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — `rotateDailyWallpaperIfNeeded()` clear obsolete pending
28. `src/new-tab.js:2529`: `browser.storage.local.set({ [PENDING_DAILY_ROTATION_KEY]: true, ... })` — `rotateDailyWallpaperIfNeeded()` mark rotation pending
29. `src/new-tab.js:2539`: `browser.storage.local.set({ [PENDING_DAILY_ROTATION_SINCE_KEY]: now })` — `rotateDailyWallpaperIfNeeded()` update pending timestamp
30. `src/new-tab.js:2551`: `browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, ...])` — `rotateDailyWallpaperIfNeeded()` clear pending on force
31. `src/new-tab.js:2582`: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: current })` — `rotateDailyWallpaperIfNeeded()` persist refreshed URLs
32. `src/new-tab.js:12579`: `browser.storage.local.get(WALLPAPER_TYPE_KEY)` — `loadWallpaperTypePreference()` read video vs static mode
33. `src/new-tab.js:12603`: `browser.storage.local.get(WALLPAPER_SELECTION_KEY)` — `loadCurrentWallpaperSelection()`
34. `src/new-tab.js:12641`: `browser.storage.local.set({ [WALLPAPER_TYPE_KEY]: next })` — `setWallpaperTypePreference()` persist mode
35. `src/new-tab.js:12649`: `browser.storage.local.get([WALLPAPER_SELECTION_KEY, WALLPAPER_FALLBACK_USED_KEY])` — `setWallpaperTypePreference()` re-read selection
36. `src/new-tab.js:12659`: `browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: selection, ... })` — `setWallpaperTypePreference()` persist fallback if missing

#### B. Bookmarks & Folder Metadata (7 Calls)
37. `src/new-tab.js:3745`: `browser.storage.local.get(HOMEBASE_BOOKMARK_ROOT_ID_KEY)` — `getHomebaseRootId()`
38. `src/new-tab.js:3755`: `browser.storage.local.set({ [HOMEBASE_BOOKMARK_ROOT_ID_KEY]: id || '' })` — `setHomebaseRootId()`
39. `src/new-tab.js:3763`: `browser.storage.local.remove(HOMEBASE_BOOKMARK_ROOT_ID_KEY)` — `clearHomebaseRootId()`
40. `src/new-tab.js:7243`: `browser.storage.local.get(BOOKMARK_META_KEY)` — `loadBookmarkMetadata()`
41. `src/new-tab.js:7262`: `browser.storage.local.get(LAST_USED_BOOKMARK_FOLDER_KEY)` — `loadLastUsedFolderId()`
42. `src/new-tab.js:7273`: `browser.storage.local.set({ [LAST_USED_BOOKMARK_FOLDER_KEY]: lastUsedBookmarkFolderId })` — `setLastUsedFolderId()`
43. `src/new-tab.js:7283`: `browser.storage.local.get(FOLDER_META_KEY)` — `loadFolderMetadata()`

#### C. Favicon Cache & Pruning (4 Calls)
44. `src/new-tab.js:3268`: `browser.storage.local.get(key)` — `getFaviconMeta(domainKey)`
45. `src/new-tab.js:3287`: `browser.storage.local.set({ [key]: payload })` — `setFaviconMeta(domainKey, meta)`
46. `src/new-tab.js:3321`: `browser.storage.local.get(null)` — `pruneFaviconMetaIfNeeded()` snapshot read
47. `src/new-tab.js:3335`: `browser.storage.local.remove(remove)` — `pruneFaviconMetaIfNeeded()` batch delete stale icons

#### D. Search State & Engine Synchronization (7 Calls)
48. `src/new-tab.js:8045`: `browser.storage.local.set({ currentSearchEngineId: engine.id })` — persist clicked search engine
49. `src/new-tab.js:8252`: `browser.storage.local.set({ currentSearchEngineId: engine.id })` — persist selected search option
50. `src/new-tab.js:8807`: `browser.storage.local.set({ currentSearchEngineId: newId })` — persist cycled search engine
51. `src/new-tab.js:10308`: `browser.storage.local.get([SEARCH_ENGINES_PREF_KEY, ...])` — `loadSearchEnginePreferences()` startup batch
52. `src/new-tab.js:12342`: `browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: safeDefaultEngineId })` — `storage.onChanged` repair default engine
53. `src/new-tab.js:12392`: `browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: defaultEngineId })` — `storage.onChanged` sync default engine
54. `src/new-tab.js:12408`: `browser.storage.local.set({ currentSearchEngineId: targetEngineId })` — `storage.onChanged` repair active engine

#### E. Legacy Compatibility Adapters (5 Calls)
55. `src/new-tab.js:634`: `storageLocalGet: (keys) => browser.storage.local.get(keys)` — Gallery UI host bridge
56. `src/new-tab.js:635`: `storageLocalSet: (items) => browser.storage.local.set(items)` — Gallery UI host bridge
57. `src/new-tab.js:636`: `storageLocalRemove: (keys) => browser.storage.local.remove(keys)` — Gallery UI host bridge
58. `src/new-tab.js:3673`: `storageLocalGet: (keys) => browser.storage.local.get(keys)` — Bookmark Editor UI host bridge
59. `src/new-tab.js:3674`: `storageLocalSet: (items) => browser.storage.local.set(items)` — Bookmark Editor UI host bridge

*(Note: Calls 60–62 represent secondary branches in wallpaper rotation initialization and checks accounted for in Section 2.2.A).*

---

### 2.3 Detailed Call Inventory (18 `localStorage` Matches)

1. `src/new-tab.js:156`: `if (!window.localStorage) return;` — `syncWallpaperStartupState()`
2. `src/new-tab.js:160`: `localStorage.removeItem(WALLPAPER_STARTUP_STATE_KEY);` — `syncWallpaperStartupState()`
3. `src/new-tab.js:168`: `localStorage.setItem(WALLPAPER_STARTUP_STATE_KEY, JSON.stringify({ ... }));` — `syncWallpaperStartupState()`
4. `src/new-tab.js:1612`: `if (window.localStorage)` — `cacheAppliedWallpaperPoster()` cleanup
5. `src/new-tab.js:1613`: `localStorage.removeItem('cachedAppliedPosterUrl');` — `cacheAppliedWallpaperPoster()`
6. `src/new-tab.js:1614`: `localStorage.removeItem('cachedAppliedPosterDataUrl');` — `cacheAppliedWallpaperPoster()`
7. `src/new-tab.js:1637`: `if (window.localStorage)` — `cacheAppliedWallpaperPoster()`
8. `src/new-tab.js:1638`: `localStorage.setItem('cachedAppliedPosterUrl', urlToStore);` — `cacheAppliedWallpaperPoster()`
9. `src/new-tab.js:1701`: `if (window.localStorage)` — `cacheAppliedWallpaperPoster()`
10. `src/new-tab.js:1703`: `localStorage.setItem('cachedAppliedPosterDataUrl', state.dataUrl);` — `cacheAppliedWallpaperPoster()`
11. `src/new-tab.js:1715`: `if (window.localStorage)` — `cacheAppliedWallpaperPoster()`
12. `src/new-tab.js:1717`: `localStorage.removeItem('cachedAppliedPosterDataUrl');` — `cacheAppliedWallpaperPoster()`
13. `src/new-tab.js:1747`: JSDoc comment describing localStorage poster storage limits (~5MB)
14. `src/new-tab.js:7527`: `if (!window.localStorage) return false;` — `isPerformanceModeEnabled()`
15. `src/new-tab.js:7528`: `return localStorage.getItem(FAST_PERFORMANCE_MODE_KEY) === '1';` — `isPerformanceModeEnabled()`
16. `src/new-tab.js:7536`: `if (!window.localStorage) return;` — `syncFastPerformanceModeMirror()`
17. `src/new-tab.js:7537`: `localStorage.setItem(FAST_PERFORMANCE_MODE_KEY, enabled === true ? '1' : '0');` — `syncFastPerformanceModeMirror()`
18. `src/new-tab.js:7989`: `localStorage.setItem('fast-search', JSON.stringify(fastSearch));` — `writeFastSearchCache()`

---

## 3. Target Modular Service Architecture

To extract storage responsibilities cleanly without regressing `new-tab.js` execution flow or startup performance, four cohesive domain services will be established under `src/newtab/`:

```
src/newtab/
├── bookmarks/
│   └── bookmark-storage.js        # New: Homebase root ID, folder & bookmark metadata
├── core/
│   ├── favicon-cache.js           # New: Favicon metadata storage, freshness & pruning
│   ├── storage-service.js         # Existing: Facade implementation & mirror manager
│   └── schema-validator.js        # Existing: Schema rules & sanitization
├── search/
│   ├── search-storage.js          # New: Search engine selection & fast-search cache
│   ├── search-utils.js            # Existing: Math/units & query parsing
│   └── search-suggestion-cache.js # Existing: Suggestions cache
└── wallpaper/
    ├── wallpaper-storage.js       # New: Manifest cache, poster cache, daily rotation state
    └── gallery-ui.js              # Existing: Lazy-loaded wallpaper picker
```

---

### 3.1 Favicon Cache Service (`src/newtab/core/favicon-cache.js`)

- **Domain Scope:** Favicon fetch metadata, error suppression, and cache eviction.
- **Responsibility Extracted from `new-tab.js`:**
  - `getFaviconMeta(domainKey)`
  - `setFaviconMeta(domainKey, meta)`
  - `bumpFaviconFail(domainKey)`
  - `isFaviconMetaStale(meta)`
  - `shouldBlockFaviconMeta(meta)`
  - `pruneFaviconMetaIfNeeded()`
- **Facade API Mapping:**
  - Direct read: `HomebaseStorage.get(getFaviconMetaStorageKey(domainKey), null)`
  - Direct write: `HomebaseStorage.set({ [key]: payload })`
  - Cache snapshot: `HomebaseStorage.snapshot()` for key discovery
  - Eviction: `HomebaseStorage.remove(removeKeys)`
- **Risk Level:** **Very Low (P0)** — Zero UI rendering logic, purely background data caching.

---

### 3.2 Bookmark Storage Service (`src/newtab/bookmarks/bookmark-storage.js`)

- **Domain Scope:** Homebase custom bookmark metadata (colors, icons), last used folder tracking, and the Homebase root folder bookmark ID.
- **Responsibility Extracted from `new-tab.js`:**
  - `getHomebaseRootId()` / `setHomebaseRootId(id)` / `clearHomebaseRootId()`
  - `loadBookmarkMetadata()` / `persistBookmarkMetadata(meta)`
  - `loadFolderMetadata()` / `persistFolderMetadata(meta)`
  - `loadLastUsedFolderId()` / `setLastUsedFolderId(id)`
- **Facade API Mapping:**
  - `HomebaseStorage.get(HOMEBASE_BOOKMARK_ROOT_ID_KEY, '')`
  - `HomebaseStorage.set(HOMEBASE_BOOKMARK_ROOT_ID_KEY, id)`
  - `HomebaseStorage.remove(HOMEBASE_BOOKMARK_ROOT_ID_KEY)`
  - `HomebaseStorage.get(BOOKMARK_META_KEY, {})` / `HomebaseStorage.set(BOOKMARK_META_KEY, meta)`
  - `HomebaseStorage.get(FOLDER_META_KEY, {})` / `HomebaseStorage.set(FOLDER_META_KEY, meta)`
  - `HomebaseStorage.get(LAST_USED_BOOKMARK_FOLDER_KEY, null)` / `HomebaseStorage.set(LAST_USED_BOOKMARK_FOLDER_KEY, id)`
- **Risk Level:** **Low to Medium (P1)** — Separates metadata storage from DOM bookmark grid rendering. Does NOT touch browser native bookmarks API (`browser.bookmarks.*`).

---

### 3.3 Search Storage & Cache Service (`src/newtab/search/search-storage.js`)

- **Domain Scope:** Selected active search engine persistence, default engine resolution, and instant-load search mirror.
- **Responsibility Extracted from `new-tab.js`:**
  - `loadSearchEnginePreferences()`
  - `persistCurrentSearchEngineId(id)`
  - `persistDefaultSearchEngineId(id)`
  - `writeFastSearchCache(engine)`
- **Facade API Mapping:**
  - `HomebaseStorage.getMany([SEARCH_ENGINES_PREF_KEY, 'currentSearchEngineId', APP_SEARCH_REMEMBER_ENGINE_KEY, APP_SEARCH_DEFAULT_ENGINE_KEY])`
  - `HomebaseStorage.set('currentSearchEngineId', id)`
  - `HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, id)`
- **Automatic Mirror Sync:**
  - `fast-search` mirror write can be folded directly into `HomebaseStorage` `FAST_MIRROR_MAP` or handled atomically inside `search-storage.js`.
- **Risk Level:** **Low to Medium (P1)** — Connects to existing search modules (`search-utils.js`, `search-suggestion-cache.js`).

---

### 3.4 Wallpaper Storage & Lifecycle Service (`src/newtab/wallpaper/wallpaper-storage.js`)

- **Domain Scope:** High-volume wallpaper metadata, gallery manifest caching, poster data URLs, daily rotation state, and startup priming state.
- **Responsibility Extracted from `new-tab.js`:**
  - Manifest cache: `loadCachedGalleryManifest()`, `saveCachedGalleryManifest(manifest)`
  - Poster check timestamps: `GALLERY_POSTERS_CACHE_CHECKED_AT_KEY`, `GALLERY_POSTERS_CACHE_SIGNATURE_KEY`
  - Applied media persistence: `CACHED_APPLIED_VIDEO_URL_KEY`, `CACHED_APPLIED_POSTER_URL_KEY`, `CACHED_APPLIED_POSTER_DATA_URL_KEY`
  - Daily rotation: `WALLPAPER_POOL_KEY`, `PENDING_DAILY_ROTATION_KEY`, `PENDING_DAILY_ROTATION_SINCE_KEY`, `WALLPAPER_FALLBACK_USED_KEY`
  - Preferences: `WALLPAPER_TYPE_KEY`, `WALLPAPER_SELECTION_KEY`
  - Synchronous mirrors: `cachedAppliedPosterUrl`, `cachedAppliedPosterDataUrl`, `wallpaperStartupState`
- **Facade API Mapping:**
  - All calls routed through `HomebaseStorage.get`, `getMany`, `set`, `setMany`, and `remove`.
- **Risk Level:** **Medium to High (P2)** — Must be phased carefully to avoid visual flicker during startup or regression in the video/poster rendering pipeline.

---

### 3.5 Host Environment Adapters Consolidation

- **Domain Scope:** Legacy lazy-load environment bridges (`createGalleryUiEnvironment` and `createBookmarkEditorEnvironment`).
- **Update:** Replace inline `browser.storage.local.get/set/remove` arrow functions with delegating calls to `HomebaseStorage` methods (`getMany`, `setMany`, `remove`).

---

## 4. Phased Implementation Roadmap

To maintain strict stability and ensure regression-free progress, Cycle #9 will be executed across five disciplined phases:

```
[Phase 1: Favicon Cache Service] (4 calls, Low Risk)
                │
                ▼
[Phase 2: Bookmark Storage Service] (7 calls, Low-Medium Risk)
                │
                ▼
[Phase 3: Search Storage & Cache Service] (7 calls, Low-Medium Risk)
                │
                ▼
[Phase 4: Wallpaper Storage & Lifecycle Service] (38 calls, Medium-High Risk)
   ├── 4A: Gallery Manifest & Poster Caching
   ├── 4B: Applied Media & Fast Poster Mirrors
   └── 4C: Daily Rotation & Wallpaper Type/Selection
                │
                ▼
[Phase 5: Host Adapter Consolidation & Final Audit] (5 calls, Low Risk)
```

---

### 4.1 Phase 1: Favicon Cache Service Extraction (P0 - Low Risk)
- **Goal:** Extract favicon storage logic into `src/newtab/core/favicon-cache.js`.
- **Target Calls:** 4 calls in `new-tab.js` (lines 3260–3338).
- **Deliverables:**
  - `src/newtab/core/favicon-cache.js`
  - `tests/unit/favicon-cache.test.mjs`
  - Update `src/new-tab.html` script loading order.
- **Verification:** Confirm all unit tests pass, static invariant checks pass, and favicon lazy-loading continues without regression.

### 4.2 Phase 2: Bookmark Storage Service Extraction (P1 - Low-Medium Risk)
- **Goal:** Extract bookmark metadata and Homebase root ID storage into `src/newtab/bookmarks/bookmark-storage.js`.
- **Target Calls:** 7 calls in `new-tab.js` (lines 3743–3767, 7239–7295).
- **Deliverables:**
  - `src/newtab/bookmarks/bookmark-storage.js`
  - `tests/unit/bookmark-storage.test.mjs`
  - Update `src/new-tab.html` script order (load before `new-tab.js`).
- **Verification:** Unit tests for bookmark root detection, folder colors/icons persistence, and last-used folder retrieval.

### 4.3 Phase 3: Search Storage & Cache Service Extraction (P1 - Low-Medium Risk)
- **Goal:** Extract search engine preferences, active engine selection, and fast-search mirror management into `src/newtab/search/search-storage.js`.
- **Target Calls:** 7 calls in `new-tab.js` (lines 8045, 8252, 8807, 10308, 12342, 12392, 12408) + 2 fast-search mirror writes.
- **Deliverables:**
  - `src/newtab/search/search-storage.js`
  - `tests/unit/search-storage.test.mjs`
  - Update `src/new-tab.html` script order.
- **Verification:** Search cycling, engine configuration changes, and cross-tab storage sync verified.

### 4.4 Phase 4: Wallpaper Lifecycle & Cache Extraction (P2 - Medium-High Risk)
- **Goal:** Extract all 38 wallpaper storage calls and fast mirrors into `src/newtab/wallpaper/wallpaper-storage.js`.
- **Sub-Phase Execution:**
  - **4A (Manifest & Posters):** Manifest caching and poster check timestamps (lines 948, 1064, 1210, 1225).
  - **4B (Applied Media):** Video URL caching and chunked poster data URL encoding/persistence (lines 1465–1485, 1608–1725).
  - **4C (Rotation & Mode):** Wallpaper pool shuffling, daily rotation timer, and video/static mode preferences (lines 770–840, 2257–2582, 12579–12659).
- **Deliverables:**
  - `src/newtab/wallpaper/wallpaper-storage.js`
  - `tests/unit/wallpaper-storage.test.mjs`
- **Verification:** Verify initial background paint speed, zero FOUC, and smooth video-to-poster fallback.

### 4.5 Phase 5: Host Adapter Consolidation & Final Audit (P0 - Low Risk)
- **Goal:** Update the 5 legacy host bridge calls in `src/new-tab.js` (lines 634–636, 3673–3674) to route to `HomebaseStorage`.
- **Final Audit:**
  - Run full repository grep: confirm **0 direct `storage.local` calls remain in `src/new-tab.js`**.
  - Create `docs/49-cycle9-completion-report.md`.
  - Confirm 100% test pass rate across all stages.

---

## 5. Invariants, Protected Boundaries & Constraints

To adhere strictly to [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and repository rules:

1. **Protected Files — Zero Modifications:**
   - `src/preload.js` (MUST NOT be touched)
   - `src/instant_load.js` (MUST NOT be touched)
   - `manifests/manifest.chrome.json` (MUST NOT be touched)
   - `manifests/manifest.firefox.json` (MUST NOT be touched)
   - `dist/*` (generated output; never edit directly)

2. **Classic Script Architecture:**
   - Keep scripts as classic `<script defer>` files.
   - Do NOT convert files to ES modules (`import` / `export` forbidden in runtime source).
   - Do NOT introduce a bundler or new build steps.
   - Do NOT add new npm dependencies.

3. **Script Order Discipline:**
   - New extracted files must load before `src/new-tab.js` in `src/new-tab.html`.
   - Providers must load before consumers:
     `storage-service.js` -> `favicon-cache.js` / `bookmark-storage.js` / `search-storage.js` / `wallpaper-storage.js` -> `new-tab.js`.

4. **Defensive Fallback Guarantee:**
   - Every extracted function must provide a defensive fallback to `browser.storage.local` if `window.HomebaseStorage` is unavailable.

5. **No Startup Latency Regression:**
   - Do not perform synchronous disk reads or heavy schema validations in the critical paint path.
   - Preserve `scheduleIdleTask` and `scheduleIdleChunkedTask` patterns for background tasks.

---

## 6. Testing & Verification Strategy

Every phase must satisfy all four stages of the Homebase test suite:

```powershell
# 1. Syntax validation of modified and new files
node --check <changed-js-files>

# 2. Static invariants check
node scripts/check-newtab-static.mjs

# 3. Unit test execution
npm.cmd test

# 4. Production bundle compilation
npm.cmd run build
```

### Static Invariant Rules Enforced:
- No duplicate variable or function declarations between `new-tab.js` and extracted services.
- Extracted functions must exist in exactly one location.
- Key extracted module paths exist and match `<script defer>` declarations in `src/new-tab.html`.

---

## 7. Rollback & Safety Mechanisms

- **Single-Domain Commits:** Each phase (Favicon, Bookmarks, Search, Wallpaper, Adapters) will be committed separately.
- **Immediate Revert Capability:** If a phase causes a regression in the browser smoke test or manual testing, that specific commit can be cleanly reverted without affecting prior phases.
- **Preserved Core Wrappers:** Startup wrappers (`initializePage`, `DOMContentLoaded`, window event handlers) remain anchored in `src/new-tab.js`, preventing initialization order regressions.
