# Homebase Improvement Cycle #11 Phase 2 Dependency Map
## Wallpaper & Background Video Runtime Controller

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 2 Dependency Mapping Pass  
> **Target Release**: Homebase v0.18.0  
> **Module Path**: `src/newtab/wallpaper/wallpaper-controller.js`  
> **Global Namespace**: `window.HomebaseWallpaperController`  
> **Status**: Architecture Audit & Dependency Map (Zero Source Code Modified)  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/66-cycle11-phase2-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/66-cycle11-phase2-plan.md)

---

## 1. Executive Summary

This document maps all functions, global variables, DOM elements, storage APIs, browser APIs, and inter-module dependencies associated with the **Wallpaper & Background Video Runtime** currently residing inside [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

The objective is to establish an airtight extraction boundary for `src/newtab/wallpaper/wallpaper-controller.js` that:
1. Prevents top-level declaration collisions (`const`/`let`/`class`/`function`) in `<script defer>` shared global scope.
2. Ensures all external callers ([gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js), [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js), [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js)) retain seamless backward compatibility.
3. Preserves startup orchestration and idle scheduler hooks in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

---

## 2. Complete Inventory of Wallpaper/Video Functions (46 Functions)

Below is the complete catalog of all 46 functions in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) directly involved in wallpaper and background video runtime, categorized by responsibility.

| Function Name | Line Range | Lines | Responsibility | External Callers | Global Variables Accessed |
|---|:---:|:---:|---|---|---|
| `getLocalDayStamp` | L88–L100 | 13 | Local ISO date stamp calculation | None | None |
| `isNewLocalDay` | L102–L106 | 5 | Day change detection | None | None |
| `isDailyWallpaperRotationDue` | L108–L116 | 9 | Checks if 24h/calendar day elapsed | None | None |
| `ensureGalleryUi` | L503–L515 | 13 | Dynamic loader for gallery CSS/JS | None | None |
| `createGalleryContext` | L517–L572 | 56 | Bridges runtime API to gallery UI | `gallery-ui.js` | `currentWallpaperSelection`, `wallpaperTypePreference`, `wallpaperQualityPreference`, `dailyRotationPreference` |
| `notifyGalleryUiLoadFailure` | L574–L582 | 9 | Error alert on gallery script failure | None | None |
| `openWallpaperGallery` | L584–L595 | 12 | Lazy opens wallpaper gallery modal | `dock-navigation.js` | None |
| `setWallpaperFallbackPoster` | L680–L696 | 17 | Applies fallback poster and queues cache | `gallery-ui.js` | None |
| `hasUsableGalleryManifest` | L834–L840 | 7 | Manifest array validation | None | None |
| `getGalleryManifestTimestamp` | L842–L852 | 11 | Normalizes manifest timestamp | None | None |
| `loadCachedGalleryManifest` | L854–L876 | 23 | Reads manifest from storage cache | None | None |
| `fetchGalleryManifestWithTimeout` | L878–L918 | 41 | Fetch with abort controller timeout | None | None |
| `refreshGalleryManifestInBackground` | L920–L946 | 27 | Background network fetch + poster cache | None | None |
| `fetchVideosManifestIfNeeded` | L948–L994 | 47 | In-memory deduped manifest fetch | None | `videosManifestPromise` |
| `getVideosManifest` | L996–L1032 | 37 | High-level manifest loader with refresh | `gallery-ui.js` | None |
| `cacheGalleryPostersIfNeeded` | L1034–L1055 | 22 | Batched poster caching pass | None | None |
| `warmGalleryPosterHydration` | L1062–L1082 | 21 | Idle poster warming pass | None | `galleryHydrationWarmPromise` |
| `cacheAppliedWallpaperVideo` | L1084–L1131 | 48 | Cache Storage persistence for video | `gallery-ui.js` | None |
| `cacheAppliedWallpaperPoster` | L1135–L1237 | 103 | Cache Storage & localStorage data URL | `gallery-ui.js` | `TARGET_STARTUP_POSTER_DATA_URL_LENGTH` |
| `createOptimizedPosterDataUrl` | L1243–L1345 | 103 | Canvas compression for startup poster | None | None |
| `createStartupPosterDataUrl` | L1349–L1375 | 27 | Dimension/quality fallbacks for poster | None | `STARTUP_POSTER_MAX_DIM_SEQUENCE`, `STARTUP_POSTER_QUALITY_SEQUENCE` |
| `buildVideoPosterFromFile` | L1379–L1467 | 89 | Canvas snapshot from user video file | `gallery-ui.js` | None |
| `hydrateWallpaperSelection` | L1471–L1529 | 59 | Resolves blob object URLs from cache | `gallery-ui.js` | None |
| `setBackgroundVideoSources` | L1533–L1612 | 80 | Sets video/source src and poster attributes | None | `backgroundVideoSourceLoadPromise`, `backgroundVideoSourceLoadGeneration` |
| `startBackgroundVideosAfterSourceLoad` | L1614–L1652 | 39 | Awaits source load before play/crossfade | None | `wallpaperVideoStartSequence`, `currentWallpaperSelection`, `lastAppliedWallpaper`, `backgroundVideoCrossfadeSetupKey` |
| `applyWallpaperBackground` | L1654–L1671 | 18 | Applies CSS custom property `--initial-wallpaper` | `gallery-ui.js` | None |
| `getWallpaperUrls` | L1675–L1695 | 21 | Generates CDN URLs (720p/1080p) from ID | `gallery-ui.js`, `wallpaper-storage.js` | `wallpaperQualityPreference`, `GALLERY_ASSETS_BASE_URL` |
| `isUserUploadSelection` | L1697–L1707 | 11 | Detects custom user-uploaded wallpaper | None | `USER_WALLPAPER_CACHE_PREFIX` |
| `isGallerySelection` | L1709–L1722 | 14 | Validates gallery ID vs external URL | `gallery-ui.js`, `wallpaper-storage.js` | `GALLERY_ASSETS_BASE_URL` |
| `getGalleryUrlsOrNull` | L1724–L1729 | 6 | Returns URLs if selection is gallery | None | None |
| `rebuildCurrentSelectionFromGallery` | L1731–L1744 | 14 | Syncs active selection with quality pref | `settings-ui.js`, `gallery-ui.js` | `currentWallpaperSelection` |
| `pickNextWallpaper` | L1747–L1807 | 61 | Selects next wallpaper from shuffled pool | None | None |
| `checkBatteryStatus` | L1811–L1837 | 27 | Battery API power saving check | None | None |
| `schedulePendingDailyRotationAttempt` | L1841–L1909 | 69 | Retry timer for daily rotation on idle | None | `pendingDailyRotationTimer`, `DAILY_ROTATION_SEEN_DELAY_MS` |
| `ensureDailyWallpaper` | L1911–L2090 | 180 | Master rotation, hydration, and apply pass | `dock-navigation.js`, `settings-ui.js`, `gallery-ui.js` | `currentWallpaperSelection`, `wallpaperTypePreference`, `wallpaperQualityPreference`, `appBatteryOptimizationPreference`, `DEBUG_IDLE_STARTUP` |
| `setNextWallpaperButtonLoading` | L2686–L2704 | 19 | Controls dock button spinner and aria | `dock-navigation.js` | `nextWallpaperBtn`, `NEXT_WALLPAPER_TOOLTIP_LOADING`, `NEXT_WALLPAPER_TOOLTIP_DEFAULT` |
| `waitForWallpaperReady` | L2708–L2774 | 67 | Buffers video before showing UI | `dock-navigation.js` | None |
| `cleanupBackgroundPlayback` | L7210–L7214 | 5 | Aborts video playback controller | None | `videoPlaybackController`, `backgroundCrossfadeTimeout` |
| `setupBackgroundVideoCrossfade` | L7219–L7367 | 149 | Dual video element crossfade lifecycle | None | `videoPlaybackController`, `backgroundCrossfadeTimeout`, `appPerformanceModePreference`, `appBatteryOptimizationPreference` |
| `loadWallpaperTypePreference` | L8533–L8549 | 17 | Reads type preference ('video'/'static') | `gallery-ui.js` | `wallpaperTypePreference`, `wallpaperTypeToggle`, `appWallpaperTypeSelect` |
| `loadCurrentWallpaperSelection` | L8553–L8569 | 17 | Hydrates selection from storage | `gallery-ui.js` | `currentWallpaperSelection` |
| `getWallpaperTypePreference` | L8573–L8583 | 11 | Getter with lazy storage hydration | `dock-navigation.js`, `gallery-ui.js` | `wallpaperTypePreference` |
| `setWallpaperTypePreference` | L8587–L8632 | 46 | Setter with instant visual re-apply | `gallery-ui.js` | `wallpaperTypePreference`, `currentWallpaperSelection` |
| `cleanupUnusedObjectUrls` | L8716–L8771 | 56 | Revokes stale blob URLs to prevent memory leak | None | `DEBUG_HOMEBASE_LOGS` |
| `applyWallpaperByType` | L8775–L8914 | 140 | Applies static image, video, or accent | `settings-ui.js`, `gallery-ui.js` | `currentWallpaperSelection`, `lastAppliedWallpaper`, `wallpaperVideoStartSequence` |
| `clearBackgroundVideos` | L8918–L8944 | 27 | Clears and unloads video elements | `gallery-ui.js` | `backgroundVideoSourceLoadGeneration`, `backgroundVideoCrossfadeSetupKey` |
| `startBackgroundVideos` | L8948–L8971 | 24 | Primes video playback settings | None | None |
| `updateSettingsPreview` | L8977–L8990 | 14 | Notifies open gallery modal of change | `gallery-ui.js` | None |
| `ensurePlayableSelection` | L8997–L9012 | 16 | Resolves cached video blob before play | `gallery-ui.js` | None |

---

## 3. Global Variables, Constants & State Inventory

### Top-Level Constants to Move into `wallpaper-controller.js`:
- `TARGET_STARTUP_POSTER_DATA_URL_LENGTH = 240000;`
- `STARTUP_POSTER_MAX_DIM_SEQUENCE = [1280, 960, 720];`
- `STARTUP_POSTER_QUALITY_SEQUENCE = [0.76, 0.68, 0.6];`
- `DAILY_ROTATION_SEEN_DELAY_MS = 8000;`
- `VIDEOS_JSON_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/manifest.json';`
- `GALLERY_ASSETS_BASE_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/v/';`
- `VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000;`
- `GALLERY_MANIFEST_FETCH_TIMEOUT_MS = 7000;`
- `GALLERY_POSTERS_CACHE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;`
- `NEXT_WALLPAPER_TOOLTIP_DEFAULT = ...;`
- `NEXT_WALLPAPER_TOOLTIP_LOADING = 'Downloading...';`

### Runtime State Variables to Relocate into `wallpaper-controller.js`:
- `videosManifestPromise = null;`
- `pendingDailyRotationTimer = null;`
- `galleryHydrationWarmPromise = null;`
- `lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };`
- `backgroundVideoSourceLoadPromise = Promise.resolve();`
- `backgroundVideoSourceLoadGeneration = 0;`
- `wallpaperVideoStartSequence = 0;`
- `backgroundVideoCrossfadeSetupKey = '';`
- `videoPlaybackController = null;`
- `backgroundCrossfadeTimeout = null;`
- `currentWallpaperSelection = null;`
- `wallpaperTypePreference = null;`
- `wallpaperQualityPreference = 'low';`

### Variables Maintained in `src/new-tab.js` (Orchestration & UI Preferences):
- `dailyRotationPreference` (general app setting)
- `appPerformanceModePreference` (queried via `isPerformanceModeEnabled()`)
- `appBatteryOptimizationPreference`
- `DEBUG_IDLE_STARTUP`, `DEBUG_HOMEBASE_LOGS`

---

## 4. DOM Elements Accessed

| DOM Element / Selector | Accessed By Functions | Usage in Controller |
|---|---|---|
| `.background-video` | `setupBackgroundVideoCrossfade`, `clearBackgroundVideos`, `startBackgroundVideos`, `setBackgroundVideoSources`, `waitForWallpaperReady` | Queried dynamically via `document.querySelectorAll('.background-video')` |
| `source` (inside `.background-video`) | `setBackgroundVideoSources`, `clearBackgroundVideos` | Managed dynamically inside video element |
| `document.documentElement` | `applyWallpaperBackground`, `setWallpaperFallbackPoster` | Sets CSS custom property `--initial-wallpaper` and `dataset.initialWallpaper` |
| `#dock-next-wallpaper-btn` | `setNextWallpaperButtonLoading` | Queried dynamically or referenced via parameter |
| `#gallery-wallpaper-type-toggle` | `loadWallpaperTypePreference` | Updated when type preference is loaded |
| `#app-wallpaper-type-select` | `loadWallpaperTypePreference` | Updated in settings UI when preference is loaded |
| `#gallery-wallpaper-quality-toggle` | `createGalleryContext` | Read/written via context bridge |
| `#app-wallpaper-quality-select` | `createGalleryContext` | Read/written via context bridge |

---

## 5. Storage & Shared Infrastructure Dependencies

### APIs Provided by `src/newtab/wallpaper/wallpaper-storage.js`:
The new controller will consume these existing exports from `HomebaseWallpaperStorage`:
- `getVideosManifestCache`, `setVideosManifestCache`, `clearVideosManifestCache`
- `getCachedAppliedVideoUrl`, `setCachedAppliedVideoUrl`, `clearCachedAppliedVideoUrl`
- `getCachedAppliedPosterUrl`, `setCachedAppliedPosterUrl`, `clearCachedAppliedPosterUrl`
- `getCachedAppliedPosterDataUrl`, `setCachedAppliedPosterDataUrl`, `clearCachedAppliedPosterDataUrl`
- `clearAppliedPosterMetadata`
- `getWallpaperPool`, `setWallpaperPool`, `clearWallpaperPool`
- `getWallpaperSelection`, `setWallpaperSelection`, `clearWallpaperSelection`
- `getWallpaperFallbackUsedAt`, `setWallpaperFallbackUsedAt`, `setWallpaperSelectionWithFallback`
- `getDailyWallpaperEnabled`, `setDailyWallpaperEnabled`
- `getPendingDailyRotation`, `setPendingDailyRotation`, `clearPendingDailyRotation`
- `getWallpaperRotationState`, `syncWallpaperStartupState`, `getWallpaperStartupState`
- `getWallpaperTypePreferenceStorage`, `setWallpaperTypePreferenceStorage`
- `getWallpaperQualityPreferenceStorage`, `setWallpaperQualityPreferenceStorage`
- `cacheAsset`, `getCachedObjectUrl`, `deleteCachedObject`, `pruneCachedVideos`, `resolvePosterBlob`
- `normalizeWallpaperCacheKey`, `getCacheKeyVariants`, `wallpaperObjectUrlCache`
- `USER_WALLPAPER_CACHE_PREFIX`, `isRemoteHttpUrl`, `isRemoteVideoUrl`

### APIs Provided by `src/newtab/core/`:
- `recordStartupPerfEvent` (`HomebasePerf`)
- `recordIdleTaskPerf` (`HomebasePerf`)
- `recordObjectUrlCleanup` (`HomebaseStorageDiagnostics`)
- `scheduleIdleTask`, `scheduleIdleChunkedTask` (`src/new-tab.js` idle scheduler)
- `runAfterNextPaint` (`src/new-tab.js`)
- `isPerformanceModeEnabled` (`HomebasePerformanceController`)

---

## 6. External Caller Mapping & Backward Compatibility Matrix

| Calling File | Function / Global Called | Purpose in Caller | Extraction Strategy |
|---|---|---|---|
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `openWallpaperGallery` | Dock gallery button click | Preserve delegation shim `window.openWallpaperGallery` |
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `setNextWallpaperButtonLoading` | Dock next button loading state | Preserve delegation shim `window.setNextWallpaperButtonLoading` |
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `ensureDailyWallpaper(true)` | Dock next wallpaper trigger | Preserve delegation shim `window.ensureDailyWallpaper` |
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `currentWallpaperSelection` | Inspect selection after rotation | Expose getter on controller & preserve variable in `new-tab.js` |
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `getWallpaperTypePreference()` | Inspect type after rotation | Preserve delegation shim `window.getWallpaperTypePreference` |
| [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | `waitForWallpaperReady()` | Await video buffer | Preserve delegation shim `window.waitForWallpaperReady` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `applyWallpaperByType` | User selects wallpaper card | Preserve delegation shim `window.applyWallpaperByType` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `ensureDailyWallpaper` | User toggles daily rotation | Preserve delegation shim `window.ensureDailyWallpaper` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `getWallpaperTypePreference` | Reads active mode in modal | Preserve delegation shim `window.getWallpaperTypePreference` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `setWallpaperTypePreference` | User switches video/static toggle | Preserve delegation shim `window.setWallpaperTypePreference` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `cacheAppliedWallpaperVideo` | Pre-caches video on select | Preserve delegation shim `window.cacheAppliedWallpaperVideo` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `cacheAppliedWallpaperPoster` | Pre-caches poster on select | Preserve delegation shim `window.cacheAppliedWallpaperPoster` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `clearBackgroundVideos` | Clears video on static mode | Preserve delegation shim `window.clearBackgroundVideos` |
| [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | `buildVideoPosterFromFile` | Generates poster for user video | Preserve delegation shim `window.buildVideoPosterFromFile` |
| [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) | `applyWallpaperByType` | Settings preview update | Preserve delegation shim `window.applyWallpaperByType` |
| [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) | `ensureDailyWallpaper` | Daily toggle in settings modal | Preserve delegation shim `window.ensureDailyWallpaper` |
| [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) | `rebuildCurrentSelectionFromGallery` | Quality toggle change | Preserve delegation shim `window.rebuildCurrentSelectionFromGallery` |
| [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`initializePage`) | `getWallpaperTypePreference()` | Reads mode during boot | Delegates to `HomebaseWallpaperController` |
| [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`initializePage`) | `waitForWallpaperReady()` | Buffers video before UI unlock | Delegates to `HomebaseWallpaperController` |
| [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`initializePage`) | `ensureDailyWallpaper()` | Idle daily wallpaper check | Delegates to `HomebaseWallpaperController` |
| [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (`onChanged`) | `currentWallpaperSelection` | Syncs storage state on change | Synced via controller getter/setter |

---

## 7. Script Loading Order in `src/new-tab.html`

The script order in [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) must be updated to insert `wallpaper-controller.js` directly after `dynamic-accent.js` and before the bookmark modules and `new-tab.js`:

```html
<!-- Wallpaper Modules -->
<script defer src="newtab/wallpaper/wallpaper-storage.js"></script>
<script defer src="newtab/wallpaper/dynamic-accent.js"></script>
<script defer src="newtab/wallpaper/wallpaper-controller.js"></script>
```

### Dependency Validation:
1. `wallpaper-storage.js` evaluates first: exports `window.HomebaseWallpaperStorage` and cache functions.
2. `dynamic-accent.js` evaluates second: handles dominant color accent styling.
3. `wallpaper-controller.js` evaluates third: registers `window.HomebaseWallpaperController` using storage APIs.
4. `src/new-tab.js` evaluates last (#54): binds startup orchestration, hooks into `initializePage`, and exposes backward-compatibility shims.

---

## 8. Lexical Scope & Declaration Collision Protection

Under `<script defer>`, scripts share the global declarative environment. To prevent fatal `Uncaught SyntaxError` freezes:

1. **Zero Duplicate Declarations**:
   Any variable or function moved to `wallpaper-controller.js` must be removed from top-level scope in `src/new-tab.js`.
2. **Re-use Existing Storage Constants**:
   Constants already declared in `wallpaper-storage.js` (`USER_WALLPAPER_CACHE_PREFIX`, `isRemoteHttpUrl`, `isRemoteVideoUrl`, `normalizeWallpaperCacheKey`, `getCacheKeyVariants`, `wallpaperObjectUrlCache`, `syncWallpaperStartupState`) must NOT be declared with `const` or `let` in `wallpaper-controller.js`. They are accessed directly from the shared global scope or via `HomebaseWallpaperStorage`.
3. **Automated Scanner Verification**:
   Before and after implementation, `node scripts/check-newtab-static.mjs` will parse all 54 scripts and verify that zero collisions exist across the entire deferred script pipeline.

---

## 9. Final Proposed Module API: `window.HomebaseWallpaperController`

```javascript
window.HomebaseWallpaperController = {
  // Video playback & crossfading
  setupBackgroundVideoCrossfade,
  clearBackgroundVideos,
  startBackgroundVideos,
  setBackgroundVideoSources,
  startBackgroundVideosAfterSourceLoad,
  cleanupBackgroundPlayback,

  // Wallpaper application & DOM rendering
  applyWallpaperByType,
  applyWallpaperBackground,
  setWallpaperFallbackPoster,
  waitForWallpaperReady,
  hydrateWallpaperSelection,
  cleanupUnusedObjectUrls,
  updateSettingsPreview,

  // Daily rotation & selection
  ensureDailyWallpaper,
  pickNextWallpaper,
  schedulePendingDailyRotationAttempt,
  isDailyWallpaperRotationDue,
  isGallerySelection,
  getGalleryUrlsOrNull,
  rebuildCurrentSelectionFromGallery,
  getWallpaperUrls,
  ensurePlayableSelection,
  checkBatteryStatus,

  // Gallery manifest & poster caching
  getVideosManifest,
  fetchVideosManifestIfNeeded,
  loadCachedGalleryManifest,
  refreshGalleryManifestInBackground,
  cacheAppliedWallpaperVideo,
  cacheAppliedWallpaperPoster,
  buildVideoPosterFromFile,
  createStartupPosterDataUrl,
  createOptimizedPosterDataUrl,
  cacheGalleryPostersIfNeeded,
  warmGalleryPosterHydration,

  // Gallery UI modal integration
  openWallpaperGallery,
  createGalleryContext,
  ensureGalleryUi,

  // State accessors & mutators
  getWallpaperTypePreference,
  setWallpaperTypePreference,
  loadWallpaperTypePreference,
  loadCurrentWallpaperSelection,
  getCurrentWallpaperSelection: () => currentWallpaperSelection,
  setCurrentWallpaperSelection: (selection) => { currentWallpaperSelection = selection; },
  getLastAppliedWallpaper: () => lastAppliedWallpaper,
  setNextWallpaperButtonLoading
};
```

---

*Dependency map complete. Zero source files modified. Awaiting owner approval before proceeding with implementation.*
