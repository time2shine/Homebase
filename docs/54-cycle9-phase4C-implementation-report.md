# Homebase Improvement Cycle #9 Phase 4C Implementation Report: Wallpaper State & Rotation Storage Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #9 — Phase 4C (Wallpaper State, Selected Wallpaper Persistence, Rotation Timestamps, Mode Preferences, and Shuffle Pool Persistence)  
**Target Release:** Homebase v0.16.0  
**Baseline Local Commits:**
- `a9aed48` ("Extract bookmark storage service")
- `49d0a94` ("Extract favicon cache storage service")
- `3c952cf` ("Add Cycle 9 monolith storage extraction plan")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/48-cycle9-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/48-cycle9-plan.md)  
**Status:** Completed & Verified  

---

## 1. Overview & Objectives

Phase 4C of Cycle #9 completes the wallpaper storage extraction by migrating:
1. Daily wallpaper rotation state and pending rotation storage (`dailyWallpaperEnabled`, `pendingDailyRotation`, `pendingDailyRotationSince`, `wallpaperStartupState`).
2. Current wallpaper selection persistence (`wallpaperSelection`).
3. Wallpaper mode and quality preference storage (`wallpaperTypePreference`, `wallpaperQualityPreference`).
4. Wallpaper fallback timestamps (`wallpaperFallbackUsedAt`).
5. Wallpaper shuffle pool persistence (`wallpaperPoolIds`).

from `src/new-tab.js` into **`src/newtab/wallpaper/wallpaper-storage.js`**.

### Strict Invariants Maintained:
- **Wallpaper Algorithms Intact:** The wallpaper selection algorithm (`pickNextWallpaper`), daily rotation evaluation (`isDailyWallpaperRotationDue`), fallback selection factory (`buildFallbackSelection`), and startup orchestration (`primeWallpaperBackground`) remain inside `src/new-tab.js`.
- **Rendering & DOM Intact:** `applyWallpaperBackground`, `applyWallpaperByType`, `hydrateWallpaperSelection`, and video playback handlers remain inside `src/new-tab.js`.
- **Primary Interface:** `window.HomebaseStorage` is the primary persistence interface with schema validation and synchronous mirror sync.
- **Defensive Fallback:** `browser.storage.local` / `chrome.storage.local` is maintained defensively whenever `HomebaseStorage` is absent.
- **Zero Modifications to Protected Files:** `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` remain 100% untouched.

---

## 2. Files Changed & Extracted Logic

### 2.1 Extended Service: `src/newtab/wallpaper/wallpaper-storage.js`
- **Constants Added:**
  - `WALLPAPER_POOL_KEY = 'wallpaperPoolIds'`
  - `WALLPAPER_SELECTION_KEY = 'wallpaperSelection'`
  - `WALLPAPER_FALLBACK_USED_KEY = 'wallpaperFallbackUsedAt'`
  - `DAILY_ROTATION_KEY = 'dailyWallpaperEnabled'`
  - `PENDING_DAILY_ROTATION_KEY = 'pendingDailyRotation'`
  - `PENDING_DAILY_ROTATION_SINCE_KEY = 'pendingDailyRotationSince'`
  - `WALLPAPER_STARTUP_STATE_KEY = 'wallpaperStartupState'`
  - `WALLPAPER_TYPE_KEY = 'wallpaperTypePreference'`
  - `WALLPAPER_QUALITY_KEY = 'wallpaperQualityPreference'`
- **Functions Added:**
  - `getWallpaperPool()`: Retrieves shuffle pool IDs array with empty fallback.
  - `setWallpaperPool(pool)`: Persists shuffle pool IDs array.
  - `clearWallpaperPool()`: Removes shuffle pool from storage.
  - `getWallpaperSelection()`: Retrieves active wallpaper selection object.
  - `setWallpaperSelection(selection)`: Persists active wallpaper selection object.
  - `clearWallpaperSelection()`: Removes wallpaper selection from storage.
  - `getWallpaperFallbackUsedAt()`: Retrieves fallback used epoch timestamp.
  - `setWallpaperFallbackUsedAt(timestamp)`: Persists fallback used epoch timestamp.
  - `setWallpaperSelectionWithFallback(selection, fallbackUsedAt)`: Compound setter writing selection and timestamp atomically.
  - `getDailyWallpaperEnabled()`: Reads daily rotation toggle (defaults to `true`).
  - `setDailyWallpaperEnabled(enabled)`: Persists daily rotation toggle.
  - `getPendingDailyRotation()`: Reads pending rotation state (`{ pending, since }`).
  - `setPendingDailyRotation(pending, since)`: Persists pending rotation flag and timestamp.
  - `clearPendingDailyRotation()`: Clears pending rotation keys from storage.
  - `getWallpaperRotationState()`: Compound reader loading all 6 rotation state keys in a single storage query.
  - `syncWallpaperStartupState(selection, allowDailyRotation)`: Synchronizes startup preload mirror into `localStorage`.
  - `getWallpaperStartupState()`: Reads and parses synchronous startup state mirror.
  - `getWallpaperTypePreferenceStorage()`: Reads wallpaper type preference (`'video'` or `'static'`).
  - `setWallpaperTypePreferenceStorage(type)`: Persists wallpaper type preference.
  - `getWallpaperQualityPreferenceStorage()`: Reads wallpaper quality preference (`'high'` or `'low'`).
  - `setWallpaperQualityPreferenceStorage(quality)`: Persists wallpaper quality preference.
- **Exports:** All constants and functions exported globally on `window` and under `window.HomebaseWallpaperStorage`.

### 2.2 Monolith Pruning & Delegation: `src/new-tab.js`
- **Constants Removed from `src/new-tab.js`:**
  - `WALLPAPER_POOL_KEY`, `WALLPAPER_SELECTION_KEY`, `WALLPAPER_FALLBACK_USED_KEY`, `DAILY_ROTATION_KEY`, `PENDING_DAILY_ROTATION_KEY`, `PENDING_DAILY_ROTATION_SINCE_KEY`, `WALLPAPER_STARTUP_STATE_KEY` (lines 74-86).
  - `WALLPAPER_TYPE_KEY`, `WALLPAPER_QUALITY_KEY` (lines 2470-2471).
- **Functions Moved from `src/new-tab.js`:**
  - `syncWallpaperStartupState(selection, allowDailyRotation)` (lines 128-158).
- **Functions Delegating Storage to `wallpaper-storage.js`:**
  - `primeWallpaperBackground()`: Uses `getWallpaperRotationState()`, `clearPendingDailyRotation()`, and `setWallpaperSelectionWithFallback()`.
  - `pickNextWallpaper(manifest)`: Uses `getWallpaperPool()`, `setWallpaperPool(pool)`, and `setWallpaperSelection(selection)`.
  - `schedulePendingDailyRotationAttempt()`: Uses `getWallpaperRotationState()` and `clearPendingDailyRotation()`.
  - `ensureDailyWallpaper(forceNext)`: Uses `getWallpaperRotationState()`, `setWallpaperSelectionWithFallback()`, `setPendingDailyRotation()`, `clearPendingDailyRotation()`, and `setWallpaperSelection()`.
  - `loadWallpaperTypePreference()`: Uses `getWallpaperTypePreferenceStorage()`.
  - `loadCurrentWallpaperSelection()`: Uses `getWallpaperSelection()`.
  - `setWallpaperTypePreference(type)`: Uses `setWallpaperTypePreferenceStorage()`, `getWallpaperSelection()`, `getWallpaperFallbackUsedAt()`, and `setWallpaperSelectionWithFallback()`.

### 2.3 Schema Validation Compatibility: `src/newtab/core/schema-validator.js`
- Updated `pendingDailyRotation` property schema validator to permit both boolean flags (`true`/`false`) as used by `new-tab.js` and plain objects as used by backup/import routines.

---

## 3. Verification & Testing

### 3.1 New Unit Test Suite (`tests/unit/wallpaper-state-storage.test.mjs`)
Implemented 12 unit tests:
1. `getWallpaperPool, setWallpaperPool, clearWallpaperPool roundtrip` (PASSED)
2. `getWallpaperSelection, setWallpaperSelection, clearWallpaperSelection roundtrip` (PASSED)
3. `getWallpaperFallbackUsedAt, setWallpaperFallbackUsedAt, setWallpaperSelectionWithFallback` (PASSED)
4. `getDailyWallpaperEnabled and setDailyWallpaperEnabled` (PASSED)
5. `getPendingDailyRotation, setPendingDailyRotation, clearPendingDailyRotation` (PASSED)
6. `getWallpaperRotationState compound reader` (PASSED)
7. `syncWallpaperStartupState and getWallpaperStartupState mirror` (PASSED)
8. `getWallpaperTypePreferenceStorage and setWallpaperTypePreferenceStorage` (PASSED)
9. `getWallpaperQualityPreferenceStorage and setWallpaperQualityPreferenceStorage` (PASSED)
10. `Defensive fallback when HomebaseStorage is absent` (PASSED)
11. `Fault tolerance on storage failures` (PASSED)
12. `Exports check on window and HomebaseWallpaperStorage` (PASSED)

### 3.2 Regression Verification
- Wallpaper Storage test suites: 38/38 tests passing across `wallpaper-storage.test.mjs`, `wallpaper-asset-storage.test.mjs`, and `wallpaper-state-storage.test.mjs`.
- Full repository test suite (`npm.cmd test`): **267/267 tests passing** across all 4 stages:
  - Stage 1: Syntax Validation (`node --check`) — PASSED
  - Stage 2: Static Invariants (`check-newtab-static.mjs`) — PASSED
  - Stage 3: Unit Tests (`node:test`) — 267/267 PASSED
  - Stage 4: Browser Smoke Test — PASSED
- Distribution build (`npm.cmd run build`): PASSED (Built `dist/chrome` and `dist/firefox`).
- Protected files diff (`git diff src/preload.js src/instant_load.js manifests/`): 0 modifications.
- Whitespace and conflict check (`git diff --check`): Clean.

---

## 4. Next Steps

With Phase 4 (4A, 4B, 4C) fully completed:
- All wallpaper metadata, asset cache lifecycle, and rotation state storage responsibilities are extracted.
- Next: **Cycle #9 Phase 5: Monolith Cleanup & Final Audit**, focusing on removing obsolete local storage adapters and auditing remaining storage operations in `src/new-tab.js`.
