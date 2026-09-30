# Homebase Improvement Cycle #11 Phase 2 State Ownership Audit
## Shared State Analysis for Wallpaper & Background Video Runtime

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 2 State Ownership Audit  
> **Target Release**: Homebase v0.18.0  
> **Module Path**: `src/newtab/wallpaper/wallpaper-controller.js`  
> **Global Controller**: `window.HomebaseWallpaperController`  
> **Status**: Architecture Audit & State Ownership Analysis (Zero Source Code Modified)  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/66-cycle11-phase2-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/66-cycle11-phase2-plan.md), [docs/67-cycle11-phase2-dependency-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/67-cycle11-phase2-dependency-map.md)

---

## 1. Executive Summary

This document performs an exhaustive ownership and mutation audit on the **11 shared state variables** governing wallpaper selection, video playback, preferences, network promises, and timer scheduling.

The goal is to determine the precise ownership boundary between `src/newtab/wallpaper/wallpaper-controller.js` and `src/new-tab.js` to ensure:
1. Every state variable has exactly **one authoritative owner**.
2. **Zero top-level duplicate declaration collisions** occur in classic deferred scripts.
3. External consumers ([perf-report.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js), [dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js), [settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js), [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js)) retain seamless read/write access via explicit window getters/setters.
4. Internal operational counters and promise caches are completely encapsulated inside the new controller.

---

## 2. Shared State Ownership Matrix

| State Variable | Current Owner | Writers | Readers | Move to Controller? | Remain in `new-tab.js`? | Public Controller API? |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `currentWallpaperSelection` | `new-tab.js` (L2617) | 10 sites (rotation, apply, hydration, gallery) | 10 sites in `new-tab.js`, `dock-navigation.js`, `perf-report.js` | **YES** (Authoritative) | Window accessor only | **YES** (`getCurrentWallpaperSelection`, `setCurrentWallpaperSelection`) |
| `wallpaperTypePreference` | `new-tab.js` (L2619) | 3 sites in `new-tab.js`, `settings-preferences.js`, `settings-ui.js` | 8 sites in `new-tab.js`, `perf-report.js`, `settings-ui.js` | **YES** (Authoritative) | Window accessor only | **YES** (`getWallpaperTypePreference`, `setWallpaperTypePreference`) |
| `wallpaperQualityPreference` | `new-tab.js` (L2620) | 2 sites in `new-tab.js`, `settings-preferences.js`, `settings-ui.js` | 3 sites in `new-tab.js`, `settings-preferences.js`, `settings-ui.js` | **YES** (Authoritative) | Window accessor only | **YES** (`getWallpaperQualityPreference`, `setWallpaperQualityPreference`) |
| `lastAppliedWallpaper` | `new-tab.js` (L597) | 2 sites in `applyWallpaperByType` | `startBackgroundVideosAfterSourceLoad`, `applyWallpaperByType`, `perf-report.js` | **YES** (Authoritative) | Window accessor only | **YES** (`getLastAppliedWallpaper`) |
| `backgroundVideoSourceLoadPromise` | `new-tab.js` (L598) | 1 site (`setBackgroundVideoSources`) | 2 sites (`setBackgroundVideoSources`) | **YES** (Internal) | **NO** | **NO** (Private) |
| `backgroundVideoSourceLoadGeneration` | `new-tab.js` (L599) | 3 sites (cleanup, set sources, clear videos) | 1 site (source load race guard) | **YES** (Internal) | **NO** | **NO** (Private) |
| `wallpaperVideoStartSequence` | `new-tab.js` (L600) | 1 site (`applyWallpaperByType`) | 2 sites (playback promise validation) | **YES** (Internal) | **NO** | **NO** (Private) |
| `videoPlaybackController` | `new-tab.js` (L604) | 2 sites (setup crossfade, cleanup playback) | 2 sites (abort signal, abort call) | **YES** (Internal) | **NO** | **NO** (Private) |
| `videosManifestPromise` | `new-tab.js` (L85) | 2 sites (`fetchVideosManifestIfNeeded`) | 2 sites (`fetchVideosManifestIfNeeded`) | **YES** (Internal) | **NO** | **NO** (Private) |
| `galleryHydrationWarmPromise` | `new-tab.js` (L1058) | 1 site (`warmGalleryPosterHydration`) | 2 sites (`warmGalleryPosterHydration`) | **YES** (Internal) | **NO** | **NO** (Private) |
| `pendingDailyRotationTimer` | `new-tab.js` (L86) | 2 sites (`schedulePendingDailyRotationAttempt`) | 1 site (timer guard check) | **YES** (Internal) | **NO** | **NO** (Private) |

---

## 3. Detailed Audit by State Variable

### 1. `currentWallpaperSelection`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 2617: `let currentWallpaperSelection = null;`)
- **Current Writers**:
  - `src/new-tab.js:1742` in `rebuildCurrentSelectionFromGallery`: `currentWallpaperSelection = updated;`
  - `src/new-tab.js:1958` in `ensureDailyWallpaper`: `currentWallpaperSelection = fallbackSelection;`
  - `src/new-tab.js:1964` in `ensureDailyWallpaper`: `currentWallpaperSelection = current;`
  - `src/new-tab.js:2015` in `ensureDailyWallpaper`: `currentWallpaperSelection = nextSelection;`
  - `src/new-tab.js:2040` in `ensureDailyWallpaper`: `currentWallpaperSelection = hydratedSelection;`
  - `src/new-tab.js:8559` in `loadCurrentWallpaperSelection`: `currentWallpaperSelection = await hydrateWallpaperSelection(selection);`
  - `src/new-tab.js:8563` in `loadCurrentWallpaperSelection`: `currentWallpaperSelection = null;`
  - `src/new-tab.js:8620` in `setWallpaperTypePreference`: `currentWallpaperSelection = hydrated;`
  - `src/new-tab.js:8809` in `applyWallpaperByType`: `currentWallpaperSelection = selection;`
  - `src/new-tab.js:520` in `createGalleryContext`: `setCurrentWallpaperSelection: (selection) => { currentWallpaperSelection = selection || null; }`
- **Current Readers**:
  - `src/new-tab.js:519` in `createGalleryContext`: `getCurrentWallpaperSelection: () => currentWallpaperSelection`
  - `src/new-tab.js:1619` in `startBackgroundVideosAfterSourceLoad`: `const current = currentWallpaperSelection || null;`
  - `src/new-tab.js:1732, 1736` in `rebuildCurrentSelectionFromGallery`
  - `src/new-tab.js:1929` in `ensureDailyWallpaper`
  - `src/new-tab.js:7460` in `initializePage`: `waitForWallpaperReady(currentWallpaperSelection, type);`
  - `src/new-tab.js:8300` in storage `onChanged`: `: currentWallpaperSelection;`
  - `src/new-tab.js:8567` in `loadCurrentWallpaperSelection`
  - `src/new-tab.js:8603` in `setWallpaperTypePreference`
  - `src/new-tab.js:8840` in `applyWallpaperByType`
  - `src/newtab/core/dock-navigation.js:116` in dock next wallpaper handler: `const selection = currentWallpaperSelection;`
  - `src/newtab/core/perf-report.js:691` in `isLiveWallpaperActive()`: `if (currentWallpaperSelection && currentWallpaperSelection.videoUrl) return true;`
- **Should Move into `HomebaseWallpaperController`**: **YES**. It is the central domain entity for the active wallpaper.
- **Should Remain in `new-tab.js`**: **NO** as a top-level declaration. A window getter/setter will be bound to ensure `dock-navigation.js`, `perf-report.js`, and `new-tab.js` L7460/8300 maintain unbroken access.
- **Controller API**:
  - `HomebaseWallpaperController.getCurrentWallpaperSelection()`
  - `HomebaseWallpaperController.setCurrentWallpaperSelection(selection)`

---

### 2. `wallpaperTypePreference`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 2619: `let wallpaperTypePreference = null;`)
- **Current Writers**:
  - `src/new-tab.js:528` in `createGalleryContext`
  - `src/new-tab.js:8535` in `loadWallpaperTypePreference`
  - `src/new-tab.js:8591` in `setWallpaperTypePreference`
  - `src/newtab/settings/settings-preferences.js:168` in `loadStoredPreferences`
  - `src/newtab/settings/settings-ui.js:1533` in `applySettings`
- **Current Readers**:
  - `src/new-tab.js:522, 526` in `createGalleryContext`
  - `src/new-tab.js:1928` in `ensureDailyWallpaper`
  - `src/new-tab.js:8539, 8544, 8547` in `loadWallpaperTypePreference`
  - `src/new-tab.js:8575, 8581` in `getWallpaperTypePreference`
  - `src/newtab/core/perf-report.js:690` in `isLiveWallpaperActive()`
  - `src/newtab/settings/settings-preferences.js:172, 379, 387`
  - `src/newtab/settings/settings-ui.js:1199, 1472, 1543, 1546, 1634`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO** as a declaration. `window.wallpaperTypePreference` getter/setter will be provided so external settings modules can mutate/read it transparently.
- **Controller API**:
  - `HomebaseWallpaperController.getWallpaperTypePreference()`
  - `HomebaseWallpaperController.setWallpaperTypePreference(type)`
  - `HomebaseWallpaperController.loadWallpaperTypePreference()`
  - `HomebaseWallpaperController.getWallpaperTypePreferenceState()`
  - `HomebaseWallpaperController.setWallpaperTypePreferenceState(type)`

---

### 3. `wallpaperQualityPreference`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 2620: `let wallpaperQualityPreference = 'low';`)
- **Current Writers**:
  - `src/new-tab.js:532` in `createGalleryContext`
  - `src/new-tab.js:1943` in `ensureDailyWallpaper`
  - `src/newtab/settings/settings-preferences.js:167` in `loadStoredPreferences`
  - `src/newtab/settings/settings-ui.js:1534` in `applySettings`
- **Current Readers**:
  - `src/new-tab.js:523, 530` in `createGalleryContext`
  - `src/new-tab.js:1685` in `getWallpaperUrls`
  - `src/newtab/settings/settings-preferences.js:383, 395`
  - `src/newtab/settings/settings-ui.js:1200, 1476, 1549, 1552`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO** as a declaration. Accessible via `window.wallpaperQualityPreference` accessor.
- **Controller API**:
  - `HomebaseWallpaperController.getWallpaperQualityPreference()`
  - `HomebaseWallpaperController.setWallpaperQualityPreference(quality)`

---

### 4. `lastAppliedWallpaper`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 597: `let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };`)
- **Current Writers**:
  - `src/new-tab.js:8820` in `applyWallpaperByType` (performance mode)
  - `src/new-tab.js:8866` in `applyWallpaperByType` (standard apply)
- **Current Readers**:
  - `src/new-tab.js:1628–1633` in `startBackgroundVideosAfterSourceLoad`
  - `src/new-tab.js:8797–8805` in `applyWallpaperByType`
  - `src/newtab/core/perf-report.js:692` in `isLiveWallpaperActive()`
- **Should Move into `HomebaseWallpaperController`**: **YES**. Authoritative state tracking what media is currently rendering.
- **Should Remain in `new-tab.js`**: **NO** as a declaration. `window.lastAppliedWallpaper` getter provided for `perf-report.js`.
- **Controller API**:
  - `HomebaseWallpaperController.getLastAppliedWallpaper()`

---

### 5. `backgroundVideoSourceLoadPromise`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 598)
- **Current Writers**:
  - `src/new-tab.js:1604` in `setBackgroundVideoSources`
- **Current Readers**:
  - `src/new-tab.js:1553, 1606` in `setBackgroundVideoSources`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

### 6. `backgroundVideoSourceLoadGeneration`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 599)
- **Current Writers**:
  - `src/new-tab.js:608` in `cleanupBackgroundPlayback`
  - `src/new-tab.js:1558` in `setBackgroundVideoSources`
  - `src/new-tab.js:8919` in `clearBackgroundVideos`
- **Current Readers**:
  - `src/new-tab.js:1579` in `setBackgroundVideoSources` inner callback
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

### 7. `wallpaperVideoStartSequence`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 600)
- **Current Writers**:
  - `src/new-tab.js:8787` in `applyWallpaperByType`
- **Current Readers**:
  - `src/new-tab.js:1622` in `startBackgroundVideosAfterSourceLoad`
  - `src/new-tab.js:8843` in `applyWallpaperByType`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

### 8. `videoPlaybackController`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 604)
- **Current Writers**:
  - `src/new-tab.js:616` in `cleanupBackgroundPlayback`
  - `src/new-tab.js:7227` in `setupBackgroundVideoCrossfade`
- **Current Readers**:
  - `src/new-tab.js:612` in `cleanupBackgroundPlayback`
  - `src/new-tab.js:7228` in `setupBackgroundVideoCrossfade`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation, exposed through `cleanupBackgroundPlayback()`).

---

### 9. `videosManifestPromise`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 85)
- **Current Writers**:
  - `src/new-tab.js:952, 986` in `fetchVideosManifestIfNeeded`
- **Current Readers**:
  - `src/new-tab.js:950, 992` in `fetchVideosManifestIfNeeded`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

### 10. `galleryHydrationWarmPromise`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 1058)
- **Current Writers**:
  - `src/new-tab.js:1066` in `warmGalleryPosterHydration`
- **Current Readers**:
  - `src/new-tab.js:1064, 1080` in `warmGalleryPosterHydration`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

### 11. `pendingDailyRotationTimer`
- **Current Owner File**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (Line 86)
- **Current Writers**:
  - `src/new-tab.js:1845, 1847` in `schedulePendingDailyRotationAttempt`
- **Current Readers**:
  - `src/new-tab.js:1843` in `schedulePendingDailyRotationAttempt`
- **Should Move into `HomebaseWallpaperController`**: **YES**.
- **Should Remain in `new-tab.js`**: **NO**.
- **Controller API**: **NO** (Private encapsulation).

---

## 4. Window Bridge Architecture for Backward Compatibility

To maintain strict continuity with existing classic scripts loaded across `src/new-tab.html` without introducing any global lexical redeclarations, `wallpaper-controller.js` will define the authoritative variables and register accessors on `window`:

```javascript
// Inside src/newtab/wallpaper/wallpaper-controller.js:
let currentWallpaperSelection = null;
let wallpaperTypePreference = null;
let wallpaperQualityPreference = 'low';
let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };

// Authoritative Controller Definition
window.HomebaseWallpaperController = {
  getCurrentWallpaperSelection: () => currentWallpaperSelection,
  setCurrentWallpaperSelection: (sel) => { currentWallpaperSelection = sel || null; },

  getWallpaperTypePreference: () => wallpaperTypePreference,
  setWallpaperTypePreference: (type) => { ... },
  getWallpaperTypePreferenceState: () => wallpaperTypePreference,
  setWallpaperTypePreferenceState: (type) => { wallpaperTypePreference = type === 'static' ? 'static' : 'video'; },

  getWallpaperQualityPreference: () => wallpaperQualityPreference,
  setWallpaperQualityPreference: (q) => { wallpaperQualityPreference = q === 'high' ? 'high' : 'low'; },

  getLastAppliedWallpaper: () => lastAppliedWallpaper,
  // ... runtime functions ...
};

// Global backward-compatibility property accessors
Object.defineProperty(window, 'currentWallpaperSelection', {
  get: () => currentWallpaperSelection,
  set: (val) => { currentWallpaperSelection = val || null; },
  configurable: true
});

Object.defineProperty(window, 'wallpaperTypePreference', {
  get: () => wallpaperTypePreference,
  set: (val) => { wallpaperTypePreference = val === 'static' ? 'static' : 'video'; },
  configurable: true
});

Object.defineProperty(window, 'wallpaperQualityPreference', {
  get: () => wallpaperQualityPreference,
  set: (val) => { wallpaperQualityPreference = val === 'high' ? 'high' : 'low'; },
  configurable: true
});

Object.defineProperty(window, 'lastAppliedWallpaper', {
  get: () => lastAppliedWallpaper,
  configurable: true
});
```

### Architectural Benefits:
1. **Single Source of Truth**: State lives strictly inside `wallpaper-controller.js`.
2. **Zero Collision Risk**: `new-tab.js` does NOT declare `let currentWallpaperSelection`, eliminating `SyntaxError: Identifier already declared`.
3. **Transparent External Mutability**: Direct assignments from `settings-preferences.js` (`wallpaperTypePreference = ...`) or reads in `perf-report.js` and `dock-navigation.js` route cleanly through property descriptors without code changes in external files.

---

*State ownership audit complete. Zero source files modified. Awaiting owner review and instruction.*
