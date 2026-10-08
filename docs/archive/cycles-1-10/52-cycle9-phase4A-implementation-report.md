# Homebase Improvement Cycle #9 Phase 4A Implementation Report: Wallpaper Storage Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 4A (Wallpaper Manifest, Metadata Cache & Gallery State Extraction)  
**Target Release:** Homebase v0.16.0  
**Baseline Local Commits:**
- `a9aed48` ("Extract bookmark storage service")
- `49d0a94` ("Extract favicon cache storage service")
- `3c952cf` ("Add Cycle 9 monolith storage extraction plan")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

In Phase 4A of Cycle #9, wallpaper manifest caching, poster cache metadata, gallery persistent state, and applied wallpaper media cache keys were extracted from `src/new-tab.js` into a dedicated service module: **`src/newtab/wallpaper/wallpaper-storage.js`**.

As defined in the Phase 4 scope split:
- **Phase 4A (Executed):** Extract manifest caching, poster cache metadata, gallery favorites, and applied wallpaper poster/video mirrors.
- **Phase 4B (Deferred):** Full wallpaper rendering, video playback orchestration, rotation algorithms, and pool management remain intact in `src/new-tab.js`.

### Core Goals:
1. **Extract Storage Domain Responsibilities:**
   - Wallpaper manifest caching and fetch timestamp management (`getVideosManifestCache`, `setVideosManifestCache`, `clearVideosManifestCache`).
   - Gallery poster cache validation metadata (`getGalleryPostersCacheMetadata`, `setGalleryPostersCacheMetadata`, `getCachedGalleryPosters`, `setCachedGalleryPosters`).
   - Gallery persistent state (`getGalleryFavorites`, `setGalleryFavorites`).
   - Applied video URL caching (`getCachedAppliedVideoUrl`, `setCachedAppliedVideoUrl`, `clearCachedAppliedVideoUrl`).
   - Applied poster URL & data URL caching with synchronous `localStorage` fast-mirror updates (`getCachedAppliedPosterUrl`, `setCachedAppliedPosterUrl`, `clearCachedAppliedPosterUrl`, `getCachedAppliedPosterDataUrl`, `setCachedAppliedPosterDataUrl`, `clearCachedAppliedPosterDataUrl`, `clearAppliedPosterMetadata`).
2. **Facade Integration with Defensive Fallback:**
   - Route primary reads, writes, and batch operations through `window.HomebaseStorage.get()`, `set()`, `getMany()`, `setMany()`, and `remove()`.
   - Enforce schema validation and sanitization defined in `src/newtab/core/schema-validator.js`.
   - Provide resilient defensive fallback to `browser.storage.local` if `HomebaseStorage` is unmounted.
3. **Preserve Rendering & Instant-Load Fast Mirrors:**
   - Synchronously update `localStorage.cachedAppliedPosterUrl` and `localStorage.cachedAppliedPosterDataUrl` alongside storage updates to protect `<head>` instant rendering in `src/preload.js`.
   - Wallpaper rendering, background dimming, crossfade transitions, and rotation algorithms remain 100% untouched.
   - Protected files (`src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`) remain completely unmodified.

---

## 2. Files Changed & Extracted Logic

### 2.1 New Service: `src/newtab/wallpaper/wallpaper-storage.js`
- **Constants Managed:**
  - `VIDEOS_JSON_CACHE_KEY = 'videosManifest'`
  - `VIDEOS_JSON_FETCHED_AT_KEY = 'videosManifestFetchedAt'`
  - `GALLERY_POSTERS_CACHE_KEY = 'cachedGalleryPosters'`
  - `GALLERY_POSTERS_CACHE_CHECKED_AT_KEY = 'galleryPostersCacheCheckedAt'`
  - `GALLERY_POSTERS_CACHE_SIGNATURE_KEY = 'galleryPostersCacheSignature'`
  - `FAVORITES_KEY = 'galleryFavorites'`
  - `CACHED_APPLIED_VIDEO_URL_KEY = 'cachedAppliedVideoUrl'`
  - `CACHED_APPLIED_POSTER_URL_KEY = 'cachedAppliedPosterUrl'`
  - `CACHED_APPLIED_POSTER_DATA_URL_KEY = 'cachedAppliedPosterDataUrl'`
- **Service Functions:**
  - `getVideosManifestCache()`: Reads manifest and fetch timestamp via `HomebaseStorage.getMany`.
  - `setVideosManifestCache(manifest, fetchedAt)`: Persists manifest and timestamp via `HomebaseStorage.setMany`.
  - `clearVideosManifestCache()`: Clears manifest and timestamp via `HomebaseStorage.remove`.
  - `getGalleryPostersCacheMetadata()`: Reads check timestamp and manifest signature via `HomebaseStorage.getMany`.
  - `setGalleryPostersCacheMetadata(signature, checkedAt)`: Persists check metadata via `HomebaseStorage.setMany`.
  - `getCachedGalleryPosters()`: Reads list of cached poster IDs via `HomebaseStorage.get`.
  - `setCachedGalleryPosters(posters)`: Sanitizes and persists cached poster IDs via `HomebaseStorage.set`.
  - `getGalleryFavorites()`: Reads user favorite IDs via `HomebaseStorage.get`.
  - `setGalleryFavorites(favorites)`: Accepts Array or Set (with cross-realm support) and persists via `HomebaseStorage.set`.
  - `getCachedAppliedVideoUrl()`: Reads applied video URL via `HomebaseStorage.get`.
  - `setCachedAppliedVideoUrl(targetUrl)`: Writes or removes applied video URL via `HomebaseStorage`.
  - `clearCachedAppliedVideoUrl()`: Removes applied video URL from storage.
  - `getCachedAppliedPosterUrl()`: Reads applied poster URL via `HomebaseStorage.get`.
  - `setCachedAppliedPosterUrl(url)`: Writes URL to storage and updates `localStorage.cachedAppliedPosterUrl` mirror.
  - `clearCachedAppliedPosterUrl()`: Removes URL from storage and cleans `localStorage.cachedAppliedPosterUrl`.
  - `getCachedAppliedPosterDataUrl()`: Reads poster data URL via `HomebaseStorage.get`.
  - `setCachedAppliedPosterDataUrl(dataUrl)`: Writes data URL to storage and updates `localStorage.cachedAppliedPosterDataUrl` mirror.
  - `clearCachedAppliedPosterDataUrl()`: Removes data URL from storage and cleans `localStorage.cachedAppliedPosterDataUrl`.
  - `clearAppliedPosterMetadata()`: Atomically removes both poster URL and data URL from storage and cleans both mirrors.
- **Global & Namespace Exports:** Exposes all functions and keys globally and under `window.HomebaseWallpaperStorage`.

### 2.2 Script Registration: `src/new-tab.html`
- Registered `<script src="newtab/wallpaper/wallpaper-storage.js" defer></script>` directly after `search-storage.js` (line 3352) and before `src/new-tab.js`.

### 2.3 Monolith Pruning & Delegation: `src/new-tab.js`
- Removed duplicated constant declarations:
  - `CACHED_APPLIED_VIDEO_URL_KEY`, `CACHED_APPLIED_POSTER_URL_KEY`, `CACHED_APPLIED_POSTER_DATA_URL_KEY` (lines 78-81).
  - `VIDEOS_JSON_CACHE_KEY`, `VIDEOS_JSON_FETCHED_AT_KEY`, `GALLERY_POSTERS_CACHE_KEY`, `GALLERY_POSTERS_CACHE_CHECKED_AT_KEY`, `GALLERY_POSTERS_CACHE_SIGNATURE_KEY` (lines 100-108).
  - `FAVORITES_KEY` (line 2845).
- Replaced direct `browser.storage.local.get` in `loadCachedGalleryManifest()` with `await getVideosManifestCache()`.
- Replaced direct `browser.storage.local.set` in `fetchVideosManifestIfNeeded()` with `await setVideosManifestCache(manifest, now)`.
- Replaced direct `browser.storage.local.get` and `set` in `cacheGalleryPostersIfNeeded()` with `getGalleryPostersCacheMetadata()` and `setGalleryPostersCacheMetadata(signature, now)`.
- Replaced 3 inline `browser.storage.local.set/remove` calls in `cacheAppliedWallpaperVideo()` with `setCachedAppliedVideoUrl(targetUrl)` and `clearCachedAppliedVideoUrl()`.
- Replaced 2 inline `browser.storage.local.remove` calls and `localStorage` clear in `cacheAppliedWallpaperPoster()` with `await clearAppliedPosterMetadata()`.
- Replaced direct URL store and mirror sync in `cacheAppliedWallpaperPoster()` with `await setCachedAppliedPosterUrl(urlToStore)`.
- Replaced 2 race guard `browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY)` calls in idle chunked poster task with `await getCachedAppliedPosterUrl()`.
- Replaced data URL store/remove and mirror updates in idle chunked poster task with `await setCachedAppliedPosterDataUrl(state.dataUrl)` and `await clearCachedAppliedPosterDataUrl()`.
- Net result: All 17 direct `storage.local` operations in the wallpaper manifest, metadata, and applied mirrors domain eliminated from `src/new-tab.js`.

---

## 3. Storage Call Reduction in `src/new-tab.js`

| Subsystem in `src/new-tab.js` | Direct `storage.local` Calls Before Phase 1 | After Phase 1 | After Phase 2 | After Phase 3 | After Phase 4A | Net Reduction in Phase 4A |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Favicon Cache & Pruning | 4 | 0 | 0 | 0 | 0 | 0 (Phase 1) |
| Bookmarks & Metadata | 7 | 7 | 0 | 0 | 0 | 0 (Phase 2) |
| Search State & Preferences | 7 | 7 | 7 | 0 | 0 | 0 (Phase 3) |
| **Wallpaper Manifest & Media Metadata** | **38** | **38** | **38** | **38** | **21** | **-17 calls (-44.7%)** |
| Legacy Host Adapters | 5 | 5 | 5 | 5 | 5 | Pending Phase 5 |
| Performance Preference | 1 | 1 | 1 | 1 | 1 | Unchanged |
| **TOTAL in `src/new-tab.js`** | **62** | **58** | **51** | **44** | **27** | **-17 calls (-38.6% this phase, -56.5% cumulative)** |

---

## 4. Verification & Testing

### 4.1 New Unit Test Suite (`tests/unit/wallpaper-storage.test.mjs`)
Implemented 14 comprehensive unit tests:
1. `getVideosManifestCache() returns empty defaults on missing data` (PASSED)
2. `setVideosManifestCache() and getVideosManifestCache() roundtrip` (PASSED)
3. `setVideosManifestCache() normalizes invalid manifest and dates safely` (PASSED)
4. `clearVideosManifestCache() removes manifest and timestamp` (PASSED)
5. `Gallery posters metadata read/write/missing roundtrip` (PASSED)
6. `getCachedGalleryPosters() and setCachedGalleryPosters() sanitize array` (PASSED)
7. `getGalleryFavorites() and setGalleryFavorites() support Array and Set` (PASSED)
8. `Applied video URL get/set/clear operations` (PASSED)
9. `Applied poster URL syncs with synchronous localStorage mirror` (PASSED)
10. `Applied poster data URL syncs with synchronous localStorage mirror` (PASSED)
11. `clearAppliedPosterMetadata() clears both storage and mirrors` (PASSED)
12. `Defensive browser.storage.local fallback works when HomebaseStorage is absent` (PASSED)
13. `Fault tolerance: storage errors return safe fallbacks without throwing` (PASSED)
14. `window and window.HomebaseWallpaperStorage exports exist` (PASSED)

### 4.2 Static & Syntax Checks
- `node --check src/newtab/wallpaper/wallpaper-storage.js src/new-tab.js tests/unit/wallpaper-storage.test.mjs`: PASSED (0 errors).
- `node scripts/check-newtab-static.mjs`: PASSED (45 deferred scripts checked, 87 declarations checked, 0 duplicates).
- `npm.cmd test`: PASSED (243/243 tests passing across all 4 stages).
- `npm.cmd run build`: PASSED (Chrome and Firefox dist packages built cleanly).

### 4.3 Protected Files Integrity
Verified with `git diff src/preload.js src/instant_load.js manifests/`:
- `src/preload.js`: Unchanged (0 diff lines).
- `src/instant_load.js`: Unchanged (0 diff lines).
- `manifests/*`: Unchanged (0 diff lines).

---

## 5. Next Steps

With Phase 4A complete, the repository is ready for:
1. Review and commit of Phase 4A.
2. Phase 4B: Wallpaper lifecycle & rotation extraction (`wallpaper-runtime.js`, `wallpaper-pool.js`).
3. Phase 5: Monolith cleanup & removal of remaining legacy storage adapters.
