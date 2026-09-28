# Homebase Improvement Cycle #9 Phase 4B Implementation Report: Wallpaper Asset Storage Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 4B (Wallpaper Asset Cache Lifecycle, Video & Poster Asset Persistence, Cache Pruning Operations)  
**Target Release:** Homebase v0.16.0  
**Baseline Local Commits:**
- `a9aed48` ("Extract bookmark storage service")
- `49d0a94` ("Extract favicon cache storage service")
- `3c952cf` ("Add Cycle 9 monolith storage extraction plan")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

In Phase 4B of Cycle #9, wallpaper asset cache lifecycle management, video and poster asset persistence via the Cache Storage API, poster blob resolution, cache signature generation, and video cache pruning operations were extracted from `src/new-tab.js` into **`src/newtab/wallpaper/wallpaper-storage.js`**.

### Invariants Maintained:
- **Wallpaper Rendering & Playback Intact:** Rendering logic, video playback orchestration, and DOM manipulation remain in `src/new-tab.js`.
- **Wallpaper Selection & Rotation Intact:** `pickNextWallpaper`, `isDailyWallpaperRotationDue`, `ensureDailyWallpaper`, and rotation scheduling remain untouched in `src/new-tab.js`.
- **Facade Integration with Defensive Fallbacks:** `cachedGalleryPosters` updates route via `HomebaseStorage.set` with defensive fallback to `browser.storage.local`.
- **Defensive Cache Storage Handling:** Safe encapsulation around `caches.open` and `caches.match` with fallback when the Cache Storage API is unavailable.
- **Zero Modifications to Protected Files:** `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` remain completely untouched.

---

## 2. Files Changed & Extracted Logic

### 2.1 Extended Service: `src/newtab/wallpaper/wallpaper-storage.js`
- **Constants Added:**
  - `WALLPAPER_CACHE_NAME = 'wallpaper-assets'`
  - `GALLERY_POSTERS_CACHE_NAME = 'gallery-posters'`
  - `POSTER_CACHE_CONCURRENCY = 4`
  - `USER_WALLPAPER_CACHE_PREFIX = 'https://user-wallpapers.local/'`
  - `CACHED_APPLIED_POSTER_CACHE_KEY = 'cachedAppliedPoster'`
  - `REMOTE_VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|#|$)/i`
- **Helpers & Cache State:**
  - `isRemoteHttpUrl(url)`: Validates HTTP/HTTPS URLs.
  - `isRemoteVideoUrl(url)`: Validates remote video URLs against `REMOTE_VIDEO_REGEX`.
  - `wallpaperObjectUrlCache = new Map()`: In-memory cache mapping asset keys to active Object URLs.
  - `normalizeWallpaperCacheKey(cacheKey)`: Normalizes local user wallpaper identifiers to canonical cache URLs.
  - `getCacheKeyVariants(cacheKey)`: Produces lookup fallback keys for backward compatibility.
- **Asset Storage & Lifecycle Functions:**
  - `openWallpaperAssetCache()`: Encapsulated Cache Storage opener for `wallpaper-assets`.
  - `openGalleryPostersCache()`: Encapsulated Cache Storage opener for `gallery-posters`.
  - `cacheAsset(url)`: Network fetch and persistence into `wallpaper-assets` cache with deduplication.
  - `getCachedObjectUrl(cacheKey)`: Retrieves or instantiates blob Object URL from `wallpaper-assets` with memory caching.
  - `deleteCachedObject(cacheKey)`: Deletes an asset from `wallpaper-assets` cache across all key variants and revokes the active Object URL.
  - `pruneCachedVideos(keepUrl)`: Prunes obsolete remote video files from `wallpaper-assets` while protecting user uploads and active wallpapers.
  - `getGalleryPosterUrls(manifest)`: Extracts unique poster URLs from manifest items.
  - `getGalleryPosterCacheSignature(manifest)`: Generates deterministic cache signature strings.
  - `cacheGalleryPosters(manifest)`: Caches gallery posters in `gallery-posters` and updates `cachedGalleryPosters` via `HomebaseStorage.set`.
  - `resolvePosterBlob(posterUrl, posterCacheKey)`: Cascading resolution of poster blobs across `wallpaper-assets`, `MyWallpapers`, and network fallback.
  - `clearWallpaperCache()`: Clears `wallpaper-assets` cache and revokes all active Object URLs.
- **Window & Namespace Exports:** Exposes all functions and constants globally on `window` and under `window.HomebaseWallpaperStorage`.

### 2.2 Monolith Pruning & Delegation: `src/new-tab.js`
- Removed duplicate constant declarations:
  - `CACHED_APPLIED_POSTER_CACHE_KEY` (line 78).
  - `WALLPAPER_CACHE_NAME`, `GALLERY_POSTERS_CACHE_NAME`, `POSTER_CACHE_CONCURRENCY`, `USER_WALLPAPER_CACHE_PREFIX`, `REMOTE_VIDEO_REGEX` (lines 89-96).
  - `isRemoteHttpUrl`, `isRemoteVideoUrl` (lines 106-109).
- Removed moved functions and state:
  - `cacheAsset`
  - `getGalleryPosterUrls`
  - `getGalleryPosterCacheSignature`
  - `cacheGalleryPosters`
  - `wallpaperObjectUrlCache`
  - `normalizeWallpaperCacheKey`
  - `getCacheKeyVariants`
  - `getCachedObjectUrl`
  - `deleteCachedObject`
  - `pruneCachedVideos`
  - `resolvePosterBlob`
- Kept orchestration and rendering in place:
  - `warmGalleryPosterHydration()`: Left in `src/new-tab.js` for manifest warmup.
  - `cacheGalleryPostersIfNeeded()`: Left in `src/new-tab.js`, delegating metadata and caching to `wallpaper-storage.js`.
  - `cacheAppliedWallpaperVideo()`: Delegates cache operations to `setCachedAppliedVideoUrl`, `clearCachedAppliedVideoUrl`, `pruneCachedVideos`, and `cacheAsset`.
  - `cacheAppliedWallpaperPoster()`: Delegates poster caching, URL registration, and metadata clearing to `wallpaper-storage.js`.
  - `cleanupUnusedObjectUrls()`: Accesses `wallpaperObjectUrlCache` and `getCacheKeyVariants` from `wallpaper-storage.js`.
  - `pickNextWallpaper`, `ensureDailyWallpaper`, `primeWallpaperBackground`: Fully preserved without modifications.

---

## 3. Verification & Testing

### 3.1 New Unit Test Suite (`tests/unit/wallpaper-asset-storage.test.mjs`)
Implemented 12 unit tests:
1. `normalizeWallpaperCacheKey handles raw and HTTP keys` (PASSED)
2. `getCacheKeyVariants generates correct fallback variants` (PASSED)
3. `openWallpaperAssetCache and openGalleryPostersCache open Cache instances` (PASSED)
4. `cacheAsset fetches and stores video/image in wallpaper-assets cache` (PASSED)
5. `getCachedObjectUrl and deleteCachedObject manage Object URLs and cache lifecycle` (PASSED)
6. `pruneCachedVideos prunes obsolete remote videos and protects active/user assets` (PASSED)
7. `getGalleryPosterUrls and getGalleryPosterCacheSignature` (PASSED)
8. `cacheGalleryPosters downloads posters and updates cachedGalleryPosters storage` (PASSED)
9. `resolvePosterBlob resolves blob from cache or network` (PASSED)
10. `clearWallpaperCache deletes cache and revokes all active object URLs` (PASSED)
11. `Environment with missing caches API fails gracefully without throwing` (PASSED)
12. `Exports check on window and HomebaseWallpaperStorage` (PASSED)

### 3.2 Regression Verification
- Phase 4A unit test suite (`tests/unit/wallpaper-storage.test.mjs`): 14/14 tests passing.
- Full test suite (`npm.cmd test`): **255/255 tests passing** (4/4 stages passed).
- Syntax validation (`node --check`): PASSED on all source and test files.
- Static checks (`node scripts/check-newtab-static.mjs`): PASSED (45 deferred scripts, 87 declarations verified, 0 duplicates).
- Distribution build (`npm.cmd run build`): PASSED (Built `dist/chrome` and `dist/firefox`).
- Protected files diff (`git diff src/preload.js src/instant_load.js manifests/`): 0 modifications.
- Whitespace and conflict check (`git diff --check`): Clean.

---

## 4. Next Steps

With Phase 4B complete:
1. Review and commit Phase 4B.
2. Proceed to Phase 5: Monolith cleanup & removal of remaining legacy storage adapters.
