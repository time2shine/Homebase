# Homebase Improvement Cycle #11 Phase 2 State Migration Map
## Declaration Migration, Window Compatibility Bridges & Collision Prevention

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 2 State Migration Map  
> **Target Release**: Homebase v0.18.0  
> **Target Module**: `src/newtab/wallpaper/wallpaper-controller.js`  
> **Global Controller**: `window.HomebaseWallpaperController`  
> **Status**: Architecture Planning & Migration Map (Zero Source Code Modified)  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/66-cycle11-phase2-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/66-cycle11-phase2-plan.md), [docs/67-cycle11-phase2-dependency-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/67-cycle11-phase2-dependency-map.md), [docs/68-cycle11-phase2-state-ownership.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/68-cycle11-phase2-state-ownership.md), [docs/69-cycle11-phase2-extraction-order.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/69-cycle11-phase2-extraction-order.md)

---

## 1. Executive Summary

This document specifies the exact migration plan for **all 13 state variables and 11 constants** governing the Wallpaper & Video runtime.

### Primary Goals:
1. **Prevent Duplicate Top-Level Declarations**: Under classic `<script defer>`, duplicate `const` or `let` declarations across files trigger an uncatchable `Uncaught SyntaxError: Identifier already declared` that freezes startup.
2. **Preserve Runtime Compatibility**: Ensure external modules ([perf-report.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js), [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js), [settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js), [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js)) retain seamless read/write access via non-conflicting `Object.defineProperty(window, ...)` compatibility bridges.
3. **Clean Monolith Deletion**: Provide precise line-by-line removal instructions for [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).
4. **Static Declaration Scanner Verification**: Ensure `node scripts/check-newtab-static.mjs` cleanly passes across all 54 scripts with zero collisions.

---

## 2. Complete State & Constant Migration Table

| Variable / Constant | Current Location in `new-tab.js` | Target Location in `wallpaper-controller.js` | Window Bridge Required? | Private to Controller? | Removal Step in `new-tab.js` | Scanner Impact |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `currentWallpaperSelection` | Line 2617 (`let`) | Top-level `let` | **YES** (`window.currentWallpaperSelection`) | No | Delete declaration at L2617 | 100% collision prevention |
| `wallpaperTypePreference` | Line 2619 (`let`) | Top-level `let` | **YES** (`window.wallpaperTypePreference`) | No | Delete declaration at L2619 | 100% collision prevention |
| `wallpaperQualityPreference` | Line 2620 (`let`) | Top-level `let` | **YES** (`window.wallpaperQualityPreference`) | No | Delete declaration at L2620 | 100% collision prevention |
| `lastAppliedWallpaper` | Line 597 (`let`) | Top-level `let` | **YES** (`window.lastAppliedWallpaper`) | No | Delete declaration at L597 | 100% collision prevention |
| `backgroundVideoSourceLoadPromise` | Line 598 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L598 | Internalized |
| `backgroundVideoSourceLoadGeneration` | Line 599 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L599 | Internalized |
| `wallpaperVideoStartSequence` | Line 600 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L600 | Internalized |
| `backgroundVideoCrossfadeSetupKey` | Line 601 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L601 | Internalized |
| `videoPlaybackController` | Line 604 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L604 | Internalized |
| `backgroundCrossfadeTimeout` | Line 605 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L605 | Internalized |
| `videosManifestPromise` | Line 85 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L85 | Internalized |
| `galleryHydrationWarmPromise` | Line 1058 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L1058 | Internalized |
| `pendingDailyRotationTimer` | Line 86 (`let`) | Module `let` | **NO** | **YES** | Delete declaration at L86 | Internalized |
| `TARGET_STARTUP_POSTER_DATA_URL_LENGTH` | Line 74 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L74 | 100% collision prevention |
| `STARTUP_POSTER_MAX_DIM_SEQUENCE` | Line 75 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L75 | 100% collision prevention |
| `STARTUP_POSTER_QUALITY_SEQUENCE` | Line 76 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L76 | 100% collision prevention |
| `DAILY_ROTATION_SEEN_DELAY_MS` | Line 77 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L77 | 100% collision prevention |
| `VIDEOS_JSON_URL` | Line 79 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L79 | 100% collision prevention |
| `GALLERY_ASSETS_BASE_URL` | Line 80 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L80 | 100% collision prevention |
| `VIDEOS_JSON_TTL_MS` | Line 81 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L81 | 100% collision prevention |
| `GALLERY_MANIFEST_FETCH_TIMEOUT_MS` | Line 82 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L82 | 100% collision prevention |
| `GALLERY_POSTERS_CACHE_CHECK_TTL_MS` | Line 83 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L83 | 100% collision prevention |
| `NEXT_WALLPAPER_TOOLTIP_DEFAULT` | Line 2349 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L2349 | 100% collision prevention |
| `NEXT_WALLPAPER_TOOLTIP_LOADING` | Line 2351 (`const`) | Top-level `const` | **NO** | **YES** | Delete declaration at L2351 | 100% collision prevention |

---

## 3. Deep Dive into Special Attention State Variables

### 1. `currentWallpaperSelection`
1. **Current Declaration Location**: [src/new-tab.js:2617](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L2617) (`let currentWallpaperSelection = null;`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (`let currentWallpaperSelection = null;`).
3. **Current Readers**:
   - `src/new-tab.js`: Lines 519, 1619, 1732, 1736, 1929, 7460 (`waitForWallpaperReady`), 8300 (storage `onChanged`), 8567, 8603, 8840.
   - `src/newtab/core/dock-navigation.js`: Line 116 (`const selection = currentWallpaperSelection;`).
   - `src/newtab/core/perf-report.js`: Line 691 (`if (currentWallpaperSelection && currentWallpaperSelection.videoUrl)`).
4. **Current Writers**:
   - `src/new-tab.js`: Lines 520, 1742 (`rebuildCurrentSelectionFromGallery`), 1958, 1964, 2015, 2040 (`ensureDailyWallpaper`), 8559, 8563 (`loadCurrentWallpaperSelection`), 8620 (`setWallpaperTypePreference`), 8809 (`applyWallpaperByType`).
5. **Window Compatibility Bridge Required**: **YES**.
   ```javascript
   Object.defineProperty(window, 'currentWallpaperSelection', {
     get: () => currentWallpaperSelection,
     set: (val) => { currentWallpaperSelection = val || null; },
     configurable: true
   });
   ```
6. **Whether It Should Remain Private**: **NO**. Must be accessible to `dock-navigation.js` and `perf-report.js`.
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let currentWallpaperSelection = null;` at line 2617.
   - References in `new-tab.js` will resolve to `window.currentWallpaperSelection` seamlessly without name clashing.
8. **Static Declaration Scanner Impact**: Eliminates top-level collision. `check-newtab-static.mjs` verifies `currentWallpaperSelection` is declared only in `wallpaper-controller.js`.

---

### 2. `wallpaperTypePreference`
1. **Current Declaration Location**: [src/new-tab.js:2619](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L2619) (`let wallpaperTypePreference = null;`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (`let wallpaperTypePreference = null;`).
3. **Current Readers**:
   - `src/new-tab.js`: Lines 522, 526, 1928, 8539, 8544, 8547, 8575, 8581.
   - `src/newtab/core/perf-report.js`: Line 690 (`if (wallpaperTypePreference === 'video') return true;`).
   - `src/newtab/settings/settings-preferences.js`: Lines 172, 379, 387.
   - `src/newtab/settings/settings-ui.js`: Lines 1199, 1472, 1543, 1546, 1634.
4. **Current Writers**:
   - `src/new-tab.js`: Lines 528, 8535 (`loadWallpaperTypePreference`), 8591 (`setWallpaperTypePreference`).
   - `src/newtab/settings/settings-preferences.js`: Line 168 (`wallpaperTypePreference = stored[WALLPAPER_TYPE_KEY] === 'static' ? 'static' : 'video';`).
   - `src/newtab/settings/settings-ui.js`: Line 1533 (`wallpaperTypePreference = nextWallpaperType;`).
5. **Window Compatibility Bridge Required**: **YES**.
   ```javascript
   Object.defineProperty(window, 'wallpaperTypePreference', {
     get: () => wallpaperTypePreference,
     set: (val) => { wallpaperTypePreference = val === 'static' ? 'static' : 'video'; },
     configurable: true
   });
   ```
6. **Whether It Should Remain Private**: **NO**. Settings modules mutate it directly.
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let wallpaperTypePreference = null;` at line 2619.
8. **Static Declaration Scanner Impact**: Single declaration in `wallpaper-controller.js`. Zero collisions.

---

### 3. `wallpaperQualityPreference`
1. **Current Declaration Location**: [src/new-tab.js:2620](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L2620) (`let wallpaperQualityPreference = 'low';`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (`let wallpaperQualityPreference = 'low';`).
3. **Current Readers**:
   - `src/new-tab.js`: Lines 523, 530, 1685 (`getWallpaperUrls`).
   - `src/newtab/settings/settings-preferences.js`: Lines 383, 395.
   - `src/newtab/settings/settings-ui.js`: Lines 1200, 1476, 1549, 1552.
4. **Current Writers**:
   - `src/new-tab.js`: Lines 532, 1943 (`ensureDailyWallpaper`).
   - `src/newtab/settings/settings-preferences.js`: Line 167 (`wallpaperQualityPreference = ...;`).
   - `src/newtab/settings/settings-ui.js`: Line 1534 (`wallpaperQualityPreference = ...;`).
5. **Window Compatibility Bridge Required**: **YES**.
   ```javascript
   Object.defineProperty(window, 'wallpaperQualityPreference', {
     get: () => wallpaperQualityPreference,
     set: (val) => { wallpaperQualityPreference = val === 'high' ? 'high' : 'low'; },
     configurable: true
   });
   ```
6. **Whether It Should Remain Private**: **NO**.
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let wallpaperQualityPreference = 'low';` at line 2620.
8. **Static Declaration Scanner Impact**: Single declaration in `wallpaper-controller.js`. Zero collisions.

---

### 4. `lastAppliedWallpaper`
1. **Current Declaration Location**: [src/new-tab.js:597](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L597) (`let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (`let lastAppliedWallpaper = { ... };`).
3. **Current Readers**:
   - `src/new-tab.js`: Lines 1628–1633 (`startBackgroundVideosAfterSourceLoad`), Lines 8797–8805 (`applyWallpaperByType`).
   - `src/newtab/core/perf-report.js`: Line 692 (`return !!(lastAppliedWallpaper && lastAppliedWallpaper.type === 'video' && lastAppliedWallpaper.video);`).
4. **Current Writers**:
   - `src/new-tab.js`: Lines 8820, 8866 (`applyWallpaperByType`).
5. **Window Compatibility Bridge Required**: **YES**.
   ```javascript
   Object.defineProperty(window, 'lastAppliedWallpaper', {
     get: () => lastAppliedWallpaper,
     configurable: true
   });
   ```
6. **Whether It Should Remain Private**: **NO** (needs read access from `perf-report.js`).
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let lastAppliedWallpaper = ...;` at line 597.
8. **Static Declaration Scanner Impact**: Single declaration in `wallpaper-controller.js`. Zero collisions.

---

### 5. `videoPlaybackController`
1. **Current Declaration Location**: [src/new-tab.js:604](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L604) (`let videoPlaybackController = null;`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (module-scoped `let videoPlaybackController = null;`).
3. **Current Readers**:
   - `src/new-tab.js`: Line 612 (`cleanupBackgroundPlayback`), Line 7228 (`setupBackgroundVideoCrossfade`).
4. **Current Writers**:
   - `src/new-tab.js`: Line 616 (`cleanupBackgroundPlayback`), Line 7227 (`setupBackgroundVideoCrossfade`).
5. **Window Compatibility Bridge Required**: **NO**.
6. **Whether It Should Remain Private**: **YES**. Completely internal to video crossfade abort signals.
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let videoPlaybackController = null;` at line 604.
8. **Static Declaration Scanner Impact**: Declared only once in `wallpaper-controller.js`.

---

### 6. `backgroundVideoSourceLoadGeneration`
1. **Current Declaration Location**: [src/new-tab.js:599](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L599) (`let backgroundVideoSourceLoadGeneration = 0;`).
2. **New Owner Location**: `src/newtab/wallpaper/wallpaper-controller.js` (module-scoped `let backgroundVideoSourceLoadGeneration = 0;`).
3. **Current Readers**:
   - `src/new-tab.js`: Line 1579 (source load completion generation check).
4. **Current Writers**:
   - `src/new-tab.js`: Line 608 (`cleanupBackgroundPlayback`), Line 1558 (`setBackgroundVideoSources`), Line 8919 (`clearBackgroundVideos`).
5. **Window Compatibility Bridge Required**: **NO**.
6. **Whether It Should Remain Private**: **YES**. Pure internal race-condition token.
7. **Removal Steps from `src/new-tab.js`**:
   - Delete `let backgroundVideoSourceLoadGeneration = 0;` at line 599.
8. **Static Declaration Scanner Impact**: Single declaration in `wallpaper-controller.js`.

---

## 4. Operational & Promise State Variables (Internal to Controller)

The following 7 variables are completely private to the controller:

1. **`backgroundVideoSourceLoadPromise`**:
   - Declared at `new-tab.js:598` -> Move to `wallpaper-controller.js`, delete from L598. Bridge: **NO**.
2. **`wallpaperVideoStartSequence`**:
   - Declared at `new-tab.js:600` -> Move to `wallpaper-controller.js`, delete from L600. Bridge: **NO**.
3. **`backgroundVideoCrossfadeSetupKey`**:
   - Declared at `new-tab.js:601` -> Move to `wallpaper-controller.js`, delete from L601. Bridge: **NO**.
4. **`backgroundCrossfadeTimeout`**:
   - Declared at `new-tab.js:605` -> Move to `wallpaper-controller.js`, delete from L605. Bridge: **NO**.
5. **`videosManifestPromise`**:
   - Declared at `new-tab.js:85` -> Move to `wallpaper-controller.js`, delete from L85. Bridge: **NO**.
6. **`galleryHydrationWarmPromise`**:
   - Declared at `new-tab.js:1058` -> Move to `wallpaper-controller.js`, delete from L1058. Bridge: **NO**.
7. **`pendingDailyRotationTimer`**:
   - Declared at `new-tab.js:86` -> Move to `wallpaper-controller.js`, delete from L86. Bridge: **NO**.

---

## 5. Wallpaper Constants Migration

The following 11 constants will move to `src/newtab/wallpaper/wallpaper-controller.js` and be removed from `src/new-tab.js`:

```javascript
// Inside src/newtab/wallpaper/wallpaper-controller.js:
const TARGET_STARTUP_POSTER_DATA_URL_LENGTH = 240000;
const STARTUP_POSTER_MAX_DIM_SEQUENCE = [1280, 960, 720];
const STARTUP_POSTER_QUALITY_SEQUENCE = [0.76, 0.68, 0.6];
const DAILY_ROTATION_SEEN_DELAY_MS = 8000;
const VIDEOS_JSON_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/manifest.json';
const GALLERY_ASSETS_BASE_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/v/';
const VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000;
const GALLERY_MANIFEST_FETCH_TIMEOUT_MS = 7000;
const GALLERY_POSTERS_CACHE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const NEXT_WALLPAPER_TOOLTIP_DEFAULT = 'Next Wallpaper';
const NEXT_WALLPAPER_TOOLTIP_LOADING = 'Downloading...';
```

- **Removal from `src/new-tab.js`**:
  - Delete L74: `const TARGET_STARTUP_POSTER_DATA_URL_LENGTH`
  - Delete L75: `const STARTUP_POSTER_MAX_DIM_SEQUENCE`
  - Delete L76: `const STARTUP_POSTER_QUALITY_SEQUENCE`
  - Delete L77: `const DAILY_ROTATION_SEEN_DELAY_MS`
  - Delete L79: `const VIDEOS_JSON_URL`
  - Delete L80: `const GALLERY_ASSETS_BASE_URL`
  - Delete L81: `const VIDEOS_JSON_TTL_MS`
  - Delete L82: `const GALLERY_MANIFEST_FETCH_TIMEOUT_MS`
  - Delete L83: `const GALLERY_POSTERS_CACHE_CHECK_TTL_MS`
  - Delete L2349: `const NEXT_WALLPAPER_TOOLTIP_DEFAULT`
  - Delete L2351: `const NEXT_WALLPAPER_TOOLTIP_LOADING`

---

## 6. Scanner Verification & Invariant Protocol

After the extraction and line deletions are executed:

1. **Static Collision Scan**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
   *The dynamic AST parser will inspect all 54 scripts in sequential order. If any of the 24 moved declarations still exist in `src/new-tab.js`, the scanner will fail with exact file and line numbers.*

2. **Syntax Check**:
   ```powershell
   node --check src/newtab/wallpaper/wallpaper-controller.js
   node --check src/new-tab.js
   ```

3. **Runtime Smoke Assertion**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
   *Asserts `window.HomebaseWallpaperController` exists and is populated, and verifies that `window.currentWallpaperSelection` and `window.wallpaperTypePreference` bridge correctly without throwing `ReferenceError`.*

---

*State migration map complete. Zero source files modified. Awaiting owner review and instruction.*
