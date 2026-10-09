# Homebase Cycle #13 — Phase 3B Implementation Report: Atomic Wallpaper Startup Priming Extraction

**Document:** `docs/cycles/cycle-13/phase-3b-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 3B (Atomic Wallpaper Startup Priming Extraction)  
**Target Files:**  
- [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)  
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

Phase 3B completes Cycle #13 Phase 3 ("Wallpaper Startup Priming Extraction") by atomically relocating the startup background priming logic from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into its canonical subsystem owner [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js).

This execution strictly adheres to the **Atomic Extraction Requirement** defined in Section 7 of [`docs/cycles/cycle-13/phase-3-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/phase-3-plan.md), ensuring zero intermediate states with duplicate `primeWallpaperBackground` declarations and keeping the static invariant scanner at **0 declaration collisions**.

---

## 2. Extraction Mechanics

### 2.1 Atomic Transfer
In a single coordinated change:
1. **Added to `wallpaper-controller.js`**:
   - Implemented `async function primeWallpaperBackground() { ... }` preserving exact logic.
   - Exported on `window.primeWallpaperBackground`.
   - Exported on `window.HomebaseWallpaperController.primeWallpaperBackground`.
   - Invoked `primeWallpaperBackground();` at the evaluation tail of `wallpaper-controller.js` immediately following `setupWallpaperVisibilityListener();`.
2. **Removed from `new-tab.js`**:
   - Removed lines 324–394 containing the 65-line inline IIFE `(async function primeWallpaperBackground() { ... })();`.

### 2.2 Behavior Preservation Invariant
As required by the "No Functional Change Rule" (Section 6 of the Phase 3 plan), the extraction preserves 100% of runtime semantics:
- **Async Execution**: Identical 6 `await` operations (`getWallpaperRotationState`, `getVideosManifest`, `pickNextWallpaper`, `clearPendingDailyRotation`, `hydrateWallpaperSelection`, `setWallpaperSelectionWithFallback`).
- **Error Boundary**: Identical outer `try { ... } catch (err) { console.warn('primeWallpaperBackground failed:', err); }`.
- **Storage Operations**: Identical reads and writes via `HomebaseStorage` / `browser.storage.local`.
- **Wallpaper Rotation**: Identical `isDailyWallpaperRotationDue` evaluation against `Date.now()`.
- **Fallback Behavior**: Identical `buildFallbackSelection(now)` fallback poster resolution (`assets/fallback.webp`).
- **DOM Side Effects**: Identical `applyWallpaperBackground(poster)` and `setWallpaperFallbackPoster` operations.
- **Timing Advantage**: Running inside `wallpaper-controller.js` (script #49) evaluates ~14 scripts earlier than its prior location in `new-tab.js` (script #63), hydrating the background poster sooner without any risk of unstyled flickers.

---

## 3. Quantitative Impact & Line Reduction

```text
Baseline (Start of Cycle #13): 1,148 lines
After Phase 2 (Bookmark bridges): 925 lines  (-223 lines)
After Phase 3B (Wallpaper prime):  853 lines  (-72 lines net)
```

$$\textbf{Phase 3 Reduction: } \mathbf{-72 \text{ lines}} \quad (925 \longrightarrow \mathbf{853 \text{ lines}})$$
$$\textbf{Cumulative Cycle 13 Reduction: } \mathbf{-295 \text{ lines}} \quad (1,148 \longrightarrow \mathbf{853 \text{ lines}}, \mathbf{-25.7\%})$$

---

## 4. Verification Results

```powershell
node --check src/newtab/wallpaper/wallpaper-controller.js
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
git diff src/preload.js src/instant_load.js manifests/ dist/
```

| Verification Check | Tool / Command | Result | Notes |
|---|---|:---:|---|
| **Syntax Check 1** | `node --check src/newtab/wallpaper/wallpaper-controller.js` | **PASS** | Clean syntax, exit code 0. |
| **Syntax Check 2** | `node --check src/new-tab.js` | **PASS** | Clean syntax, exit code 0. |
| **Static Invariant Scanner** | `node scripts/check-newtab-static.mjs` | **PASS** | 63 scripts checked; 876 declarations; **0 collisions**. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | **367 / 367 tests passed** (100% pass rate). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | DOM surfaces intact, core controllers active. |
| **Dual Build Engine** | `npm.cmd run build` | **PASS** | Built `dist/chrome/` and `dist/firefox/` successfully. |
| **Protected Files Diff** | `git diff src/preload.js ...` | **PASS** | Zero diff; protected files 100% untouched. |

---

## 5. Architectural Milestone Status

With Phase 3 complete:
- `src/new-tab.js` no longer owns any wallpaper domain logic.
- `HomebaseWallpaperController` is the unified, self-contained owner of wallpaper startup background priming, video playback, and daily rotation.
- `src/new-tab.js` has broken down past the 860-line milestone, standing at **853 lines**.
