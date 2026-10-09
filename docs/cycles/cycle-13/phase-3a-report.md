# Homebase Cycle #13 — Phase 3A Implementation Report: Ownership Boundary Audit

**Document:** `docs/cycles/cycle-13/phase-3a-report.md`  
**Date:** October 10, 2026  
**Status:** COMPLETE — AWAITING REVIEW & APPROVAL  
**Phase Target:** Cycle #13 Phase 3A (Establish Wallpaper Startup Priming Ownership Boundary)  
**Target Module:** [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)  
**Monolith Target:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Executive Summary

Phase 3A initiates the extraction of the wallpaper startup background priming logic from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) by conducting a comprehensive architecture audit, verifying dependency availability in [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js), and establishing the exact extraction boundary.

Key findings & accomplishments:
1. **Current Ownership Confirmed**: `primeWallpaperBackground()` currently resides as an inline asynchronous IIFE in `src/new-tab.js` (lines 327–391, 65 lines).
2. **Dependency Availability Confirmed**: `wallpaper-controller.js` (script #49) evaluates after `wallpaper-storage.js` (script #37) and before `new-tab.js` (script #63), guaranteeing 100% dependency availability.
3. **11/11 Subsystem Dependencies Verified**: 7 of 11 functions called during priming already reside natively inside `wallpaper-controller.js`, and the remaining 4 reside in `wallpaper-storage.js`.
4. **Critical Static Scanner Invariant Identified**: `scripts/check-newtab-static.mjs` parses `(async function primeWallpaperBackground() {` in `new-tab.js` as a depth-0 declaration. Declaring `async function primeWallpaperBackground()` in `wallpaper-controller.js` while the named IIFE exists in `new-tab.js` triggers a static declaration collision. Therefore, Phase 3B must execute the extraction as an atomic transfer to maintain 0 collisions.

---

## 2. Audit Findings

### 2.1 Audit 1: Current `primeWallpaperBackground` Ownership
- **Location:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 327–391 (65 lines).
- **Construct:** Immediately Invoked Function Expression `(async function primeWallpaperBackground() { ... })();`.
- **Caller Analysis:** Zero external callers. Runs exactly once on script evaluation.
- **Responsibilities:** Evaluates rotation due state, fetches videos manifest, chooses next wallpaper, builds fallback selection if unconfigured, synchronizes startup state, hydrates asset URLs, and styles `document.body.style.backgroundImage`.
- **Architectural Misalignment:** Violates single canonical ownership by placing wallpaper presentation and rotation domain logic inside the top-level startup orchestrator.

### 2.2 Audit 2: `HomebaseWallpaperController` Dependency Availability
In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), scripts evaluate in strict document order:

```text
Line 3360: <script src="newtab/wallpaper/wallpaper-storage.js" defer></script>  (#37)
...
Line 3386: <script src="newtab/wallpaper/dynamic-accent.js" defer></script>      (#48)
Line 3387: <script src="newtab/wallpaper/wallpaper-controller.js" defer></script> (#49)
...
Line 3410: <script src="new-tab.js" defer></script>                             (#63)
```

- When `wallpaper-controller.js` evaluates at script #49, all required storage services from `wallpaper-storage.js` (#37) are already fully defined and available in the shared global lexical environment.
- When `new-tab.js` evaluates at script #63, `wallpaper-controller.js` is already fully initialized.

### 2.3 Audit 3: Required Storage & Controller Dependencies

Every single dependency required by `primeWallpaperBackground()` is confirmed available:

| Dependency | Location | Availability in `wallpaper-controller.js` |
|---|---|:---:|
| `getWallpaperRotationState()` | `wallpaper-storage.js:1182` | **Available** (script #37 global export) |
| `clearPendingDailyRotation()` | `wallpaper-storage.js:1156` | **Available** (script #37 global export) |
| `syncWallpaperStartupState(...)` | `wallpaper-storage.js:1225` | **Available** (script #37 global export) |
| `setWallpaperSelectionWithFallback(...)` | `wallpaper-storage.js:1034` | **Available** (script #37 global export) |
| `isDailyWallpaperRotationDue(...)` | `wallpaper-controller.js:55` | **Native** (same file scope) |
| `getVideosManifest()` | `wallpaper-controller.js:473` | **Native** (same file scope) |
| `pickNextWallpaper(...)` | `wallpaper-controller.js:1401` | **Native** (same file scope) |
| `hydrateWallpaperSelection(...)` | `wallpaper-controller.js:707` | **Native** (same file scope) |
| `setWallpaperFallbackPoster(...)` | `wallpaper-controller.js:664` | **Native** (same file scope) |
| `applyWallpaperBackground(...)` | `wallpaper-controller.js:688` | **Native** (same file scope) |
| `buildFallbackSelection(...)` | `wallpaper-controller.js:1374` | **Native** (same file scope) |

### 2.4 Audit 4: Extraction Boundary & Static Scanner Invariant

Empirical testing during Phase 3A revealed a critical static analysis constraint:
- [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) uses a depth-tracking parser to scan top-level declarations across all 63 deferred scripts.
- Because `(async function primeWallpaperBackground() {` in `src/new-tab.js` has leading parenthesis `(`, the scanner matches it at `depth === 0` and records `primeWallpaperBackground` as a function declaration in `new-tab.js`.
- If `async function primeWallpaperBackground()` is added to `wallpaper-controller.js` while the named IIFE still exists in `new-tab.js`, the static check fails:
  ```text
  FAIL no cross-script top-level declaration collisions - collisions detected: primeWallpaperBackground [newtab\wallpaper\wallpaper-controller.js:1629 (function) vs new-tab.js:327 (function)]
  ```
- **Boundary Strategy for Phase 3B:**
  To maintain the zero-collision invariant, the extraction cannot be a split "duplicate-and-then-remove" across commits. Phase 3B must atomically:
  1. Declare `async function primeWallpaperBackground()` in `src/newtab/wallpaper/wallpaper-controller.js` and export it on `window.HomebaseWallpaperController` and `window`.
  2. Concurrently remove the 65-line IIFE from `src/new-tab.js` (lines 327–391).
  3. Invoke `primeWallpaperBackground()` at the evaluation tail of `wallpaper-controller.js`.

---

## 3. Verification Results

```powershell
node --check src/newtab/wallpaper/wallpaper-controller.js
node scripts/check-newtab-static.mjs
npm.cmd test
```

| Verification Check | Tool / Command | Result | Notes |
|---|---|:---:|---|
| **Syntax Check** | `node --check src/newtab/wallpaper/wallpaper-controller.js` | **PASS** | Clean syntax, exit code 0. |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS** | 63 scripts checked; 876 declarations; **0 collisions**. |
| **Unit Test Suite** | `npm.cmd test` (`node:test`) | **PASS** | **367 / 367 tests passed** (100% pass rate). |
| **Browser Smoke Test** | `smoke-newtab-file.mjs` (Edge Headless) | **PASS** | DOM surfaces intact, core controllers active. |

---

## 4. Next Step: Phase 3B

Phase 3A successfully established the ownership boundary, verified all 11 dependencies, and identified the atomic migration requirement.

Ready to proceed to **Phase 3B: Atomic Wallpaper Startup Priming Extraction**:
- Move `primeWallpaperBackground()` into `src/newtab/wallpaper/wallpaper-controller.js`.
- Export on `HomebaseWallpaperController` and `window`.
- Invoke priming in `wallpaper-controller.js`.
- Delete lines 327–391 from `src/new-tab.js` (-65 lines $\longrightarrow$ ~860 lines).
