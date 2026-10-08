# Homebase Improvement Cycle #11 Phase 2 Checkpoint 4 Report
## Selection Resolution, Preference Management & Daily Rotation Runtime Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 2 Checkpoint 4  
> **Target Release**: Homebase v0.18.0  
> **Target Module**: `src/newtab/wallpaper/wallpaper-controller.js`  
> **Source Target**: `src/new-tab.js`  
> **Status**: Implementation & Automated Verification Complete (Uncommitted, Awaiting Approval)  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/71-cycle11-phase2-remaining-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/71-cycle11-phase2-remaining-audit.md)

---

## 1. Executive Summary

Checkpoint 4 of Cycle #11 Phase 2 extracted the complete **Selection Resolution, Preference Management, and Daily Rotation Runtime** from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js).

All 9 target functions and 2 shared state variables (`dailyRotationPreference`, `initialWallpaperState`) were cleanly migrated, exposed on `window.HomebaseWallpaperController`, and bridged via `Object.defineProperty` to `window` for transparent multi-script backward compatibility.

Line count of [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) decreased from **7,481 to 7,031 lines** (**-450 lines removed in Checkpoint 4**; cumulative reduction of **1,981 lines** across Phase 2).

---

## 2. Functions Extracted

| # | Function | Previous Location in `new-tab.js` | Target Location in `wallpaper-controller.js` | Role & Description |
| :---: | :--- | :---: | :---: | :--- |
| **1** | `buildFallbackSelection(selectedAt)` | L576–L596 | L1325–L1337 | Pure fallback wallpaper factory returning default object structure. |
| **2** | `rebuildCurrentSelectionFromGallery()` | L736–L749 | L1339–L1352 | Reconstructs video and poster URLs for `currentWallpaperSelection` from manifest. |
| **3** | `pickNextWallpaper(manifest)` | L752–L812 | L1354–L1400 | Manifest ID shuffler and selection creator; caches poster and writes to storage. |
| **4** | `schedulePendingDailyRotationAttempt()` | L818–L885 | L1402–L1443 | Schedules debounced timer (`DAILY_ROTATION_SEEN_DELAY_MS`) to trigger rotation when page is active. |
| **5** | `ensureDailyWallpaper(forceNext)` | L887–L1066 | L1445–L1569 | Core daily rotation engine. Verifies local day stamp, battery optimization, deferral flags, calls `applyWallpaperByType()`, and schedules async video caching. |
| **6** | `loadWallpaperTypePreference()` | L6944–L6960 | L1571–L1588 | Reads preference storage and synchronizes DOM checkboxes (`wallpaperTypeToggle`, `appWallpaperTypeSelect`). |
| **7** | `loadCurrentWallpaperSelection()` | L6964–L6980 | L1590–L1600 | Reads selection from storage and hydrates cached object URLs. |
| **8** | `getWallpaperTypePreference()` | L6984–L6994 | L1602–L1607 | Async getter; ensures preference is loaded from storage before returning. |
| **9** | `setWallpaperTypePreference(type)` | L6998–L7043 | L1609–L1637 | Persists type preference ('video'/'static'), re-hydrates current selection, and reapplies wallpaper. |

All 9 functions are bound to `window` and exposed as methods on `window.HomebaseWallpaperController`.

---

## 3. State Ownership Changes

| State Variable | Previous Owner | New Owner | Window Property Bridge | Description |
| :--- | :---: | :---: | :---: | :--- |
| `dailyRotationPreference` | `new-tab.js` (L1264) | `wallpaper-controller.js` (L39) | `Object.defineProperty(window, 'dailyRotationPreference', ...)` | Controls whether daily wallpaper rotation is enabled. Used in gallery context, settings modal, and form synchronization. |
| `initialWallpaperState` | `new-tab.js` (L1265) | `wallpaper-controller.js` (L40) | `Object.defineProperty(window, 'initialWallpaperState', ...)` | Snapshot object `{ type, quality, daily }` initialized and checked in `settings-ui.js` to detect preference changes. |

### Controller State Accessors Added:
- `HomebaseWallpaperController.getDailyRotationPreference()`
- `HomebaseWallpaperController.setDailyRotationPreference(val)`
- `HomebaseWallpaperController.getInitialWallpaperState()`
- `HomebaseWallpaperController.setInitialWallpaperState(val)`
- `HomebaseWallpaperController.getWallpaperTypePreference()` (async getter)
- `HomebaseWallpaperController.setWallpaperTypePreference(type)` (async setter)
- `HomebaseWallpaperController.getWallpaperTypePreferenceState()` (synchronous state accessor)
- `HomebaseWallpaperController.setWallpaperTypePreferenceState(type)` (synchronous state setter)

---

## 4. Line Reduction Trajectory

| Milestone | `src/new-tab.js` Lines | Lines Removed | Module Line Count |
| :--- | :---: | :---: | :---: |
| **Pre-Phase 2 Baseline** | 9,012 | — | 0 |
| **Checkpoint 1** (`379d22d`) | 8,435 | -577 | 370 |
| **Checkpoint 2** (`b8c5ed4`) | 8,204 | -231 | 751 |
| **Checkpoint 3** (`e99c181`) | 7,481 | -723 | 1,444 |
| **Checkpoint 4 (Current)** | **7,031** | **-450** | **1,814** |
| **Cumulative Reduction** | — | **-1,981 lines (-22.0%)** | — |

---

## 5. Verification Results

All static checks, syntax validations, automated unit tests, and build artifacts passed cleanly:

```powershell
node --check src/newtab/wallpaper/wallpaper-controller.js     # PASS
node --check src/new-tab.js                                 # PASS
node scripts/check-newtab-static.mjs                        # PASS (53 scripts, 1,077 unique declarations, 0 collisions)
node scripts/smoke-newtab-file.mjs                          # PASS (CDP browser smoke in 0.68s)
npm.cmd test                                                # PASS (4/4 stages passed, 337/337 unit tests)
npm.cmd run build                                           # PASS (Built dist/chrome and dist/firefox)
git diff --check                                            # PASS
git diff src/preload.js src/instant_load.js manifests/ dist/ # PASS (0 diffs on protected files)
```

---

## 6. Manual Browser Verification Decision

### Decision:
Manual browser verification is **REQUIRED before push / before release** for the completed Cycle #11 Phase 2.

### Justification:
- `ensureDailyWallpaper(forceNext)` drives real visual wallpaper transitions, manifest rotation, and dock button interaction (`#dock-next-wallpaper-btn`).
- `setWallpaperTypePreference(type)` toggles between video and static wallpaper rendering modes in settings.
- The underlying video playback lifecycle, hardware decoding, and crossfade CSS transitions were already verified via Chromium CDP in Checkpoint 3.
- Automated browser smoke testing (`smoke-newtab-file.mjs`) confirmed that the browser successfully booted with all 53 deferred scripts and exposed all controllers with zero `ReferenceError` or severe runtime exceptions.

### Timing Recommendation:
- **Before Commit**: Automated testing is sufficient for Checkpoint 4.
- **Before Push / Release**: Perform manual smoke test in Chrome and Firefox:
  1. Click the "Next wallpaper" button on the dock to verify daily rotation trigger.
  2. Open settings and toggle Wallpaper Type between "Video" and "Static Image".
  3. Verify console has zero errors.

---

*Checkpoint 4 implementation complete. Zero code committed. Zero code pushed. Awaiting owner review and approval.*
