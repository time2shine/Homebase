# Homebase Cycle #13 — Phase 3 Plan: Wallpaper Startup Priming Extraction

**Document:** `docs/cycles/cycle-13/phase-3-plan.md`  
**Date:** October 10, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Transform `src/new-tab.js` from legacy monolith into lean Startup Orchestrator (< 400 lines)  
**Phase Baseline:** 925 lines ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))  
**Target Milestone:** **~860 lines** (~65 lines pruned from `src/new-tab.js`)  
**Target Module:** [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)  

---

## 1. Executive Summary & Objective

Following the successful completion of **Cycle #13 Phase 2** (which pruned legacy bookmark bridges and dead state mirrors, reducing `src/new-tab.js` by 223 lines to 925 lines), **Phase 3** targets the modularization of wallpaper startup priming logic.

Currently, [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) contains an inline asynchronous Immediately Invoked Function Expression (IIFE):
```javascript
(async function primeWallpaperBackground() { ... })();
```
spanning lines 327–391 (65 lines). This function performs wallpaper rotation evaluation, video manifest loading, fallback generation, poster hydration, and background DOM application.

Every function called by `primeWallpaperBackground()` already resides canonically in either [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js) or [`src/newtab/wallpaper/wallpaper-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-storage.js). Relocating `primeWallpaperBackground()` into `wallpaper-controller.js`:
1. Restores canonical subsystem ownership: all wallpaper lifecycle, rotation, and presentation logic belongs in the wallpaper subsystem.
2. Further deconstructs the `new-tab.js` orchestrator monolith by ~65 lines (bringing it to ~860 lines).
3. Maintains identical synchronous/deferred startup timing without regressions.

---

## 2. Current Architecture Audit

### 2.1 Location of `primeWallpaperBackground()`
- **File:** [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)
- **Lines:** 327–391 (65 lines)
- **Structure:**
  ```javascript
  (async function primeWallpaperBackground() {
    try {
      const stored = await getWallpaperRotationState();
      let selection = stored.selection;
      const now = Date.now();
      const allowDailyRotation = stored.allowDailyRotation;

      if (selection && isDailyWallpaperRotationDue(selection, allowDailyRotation, now)) {
        const manifest = await getVideosManifest();
        const nextSelection = await pickNextWallpaper(manifest);
        if (nextSelection) {
          selection = nextSelection;
          await clearPendingDailyRotation();
        }
      }

      if (selection) {
        syncWallpaperStartupState(selection, allowDailyRotation);
        const hydrated = await hydrateWallpaperSelection(selection);
        const poster = hydrated.posterUrl || 'assets/fallback.webp';
        setWallpaperFallbackPoster(poster, hydrated.posterCacheKey || hydrated.posterUrl || '');
        applyWallpaperBackground(poster);
        return;
      }

      // Only reach here if there is truly no wallpaper set
      const fallbackSelection = buildFallbackSelection(now);
      setWallpaperFallbackPoster(fallbackSelection.posterUrl, fallbackSelection.posterCacheKey || fallbackSelection.posterUrl || '');
      applyWallpaperBackground(fallbackSelection.posterUrl);

      await setWallpaperSelectionWithFallback(fallbackSelection, now);
      syncWallpaperStartupState(fallbackSelection, allowDailyRotation);
    } catch (err) {
      console.warn('primeWallpaperBackground failed:', err);
    }
  })();
  ```

### 2.2 Current Ownership in `new-tab.js`
- `src/new-tab.js` is the top-level **Startup Orchestrator Coordinator**.
- Hosting the priming IIFE directly inside `new-tab.js` violates domain separation:
  - It embeds domain-specific wallpaper rotation, manifest loading, and fallback selection algorithms in the main orchestrator.
  - It creates an artificial architectural coupling between the orchestrator and wallpaper internals.

### 2.3 Related Wallpaper Modules & Script Execution Order
In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), wallpaper subsystem scripts load in the following strict document sequence:

| Script Index | Script File | Canonical Ownership |
|:---:|---|---|
| **#37** | `newtab/wallpaper/wallpaper-storage.js` | Wallpaper settings, IndexedDB/CacheStorage, blob lifecycle, rotation timestamps |
| **#48** | `newtab/wallpaper/dynamic-accent.js` | Palette extraction from active wallpaper |
| **#49** | `newtab/wallpaper/wallpaper-controller.js` | Video playback, crossfades, daily rotation runtime, gallery UI, poster application |
| ... | *(Other widgets and settings)* | ... |
| **#63** | `new-tab.js` | Startup orchestrator |

Because `wallpaper-storage.js` (#37) and `wallpaper-controller.js` (#49) execute **before** `new-tab.js` (#63), all necessary dependencies already exist when `wallpaper-controller.js` evaluates.

---

## 3. Consumer & Dependency Audit

### 3.1 Callers of `primeWallpaperBackground()`
- **External Callers:** 0.
- **Internal Callers in `new-tab.js`:** 0.
- It is solely an anonymous self-invoked function (`(async function ... )()`).
- No unit tests or smoke tests currently mock or directly invoke `window.primeWallpaperBackground`.

### 3.2 Dependencies Called by `primeWallpaperBackground()`

| Invoked Function | Canonical Owner File | Export / Scope Status |
|---|---|---|
| `getWallpaperRotationState()` | `wallpaper-storage.js` (L1182) | Exported on `window` and in global lexical scope |
| `clearPendingDailyRotation()` | `wallpaper-storage.js` (L1156) | Exported on `window` and in global lexical scope |
| `syncWallpaperStartupState(...)` | `wallpaper-storage.js` (L1225) | Exported on `window` and in global lexical scope |
| `setWallpaperSelectionWithFallback(...)` | `wallpaper-storage.js` (L1034) | Exported on `window` and in global lexical scope |
| `isDailyWallpaperRotationDue(...)` | `wallpaper-controller.js` (L55) | Local function in `wallpaper-controller.js` |
| `getVideosManifest()` | `wallpaper-controller.js` (L473) | Local function in `wallpaper-controller.js` |
| `pickNextWallpaper(...)` | `wallpaper-controller.js` (L1401) | Local function in `wallpaper-controller.js` |
| `hydrateWallpaperSelection(...)` | `wallpaper-controller.js` (L707) | Local function in `wallpaper-controller.js` |
| `setWallpaperFallbackPoster(...)` | `wallpaper-controller.js` (L664) | Local function in `wallpaper-controller.js` |
| `applyWallpaperBackground(...)` | `wallpaper-controller.js` (L688) | Local function in `wallpaper-controller.js` |
| `buildFallbackSelection(...)` | `wallpaper-controller.js` (L1374) | Local function in `wallpaper-controller.js` |

**Key Finding:** 7 of the 11 functions are defined directly inside `wallpaper-controller.js` itself! Moving `primeWallpaperBackground()` into `wallpaper-controller.js` allows it to access these functions directly in local closure scope rather than relying on cross-script global exports.

### 3.3 Global / Window References
- `Date.now()`
- `console.warn`
- To preserve maximum backward compatibility and diagnostic access, `primeWallpaperBackground` will also be exposed on `window.HomebaseWallpaperController.primeWallpaperBackground` and `window.primeWallpaperBackground`.

---

## 4. Extraction Proposal

### 4.1 Target Owner Module
[`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)

### 4.2 Functions That Move
- `primeWallpaperBackground`: Extracted from `src/new-tab.js` (lines 327–391) into `src/newtab/wallpaper/wallpaper-controller.js`.
- In `wallpaper-controller.js`:
  1. Define `async function primeWallpaperBackground() { ... }`.
  2. Add `primeWallpaperBackground` to the `HomebaseWallpaperController` export object.
  3. Export `window.primeWallpaperBackground = primeWallpaperBackground;`.
  4. Trigger immediate startup execution at the bottom of `wallpaper-controller.js` (matching the existing self-invoking pattern `setupWallpaperVisibilityListener();` on line 1988).

### 4.3 Functions That Remain in `src/new-tab.js`
- `initializePage()` (lines 452–470): Calls `getWallpaperTypePreference()` and `waitForWallpaperReady(currentWallpaperSelection, type)`. These belong in the orchestrator boot sequence.
- `handleNewTabStorageChange()` (lines 866–875): Storage event listener handling wallpaper selection and rotation preference changes via `syncWallpaperStartupState`.
- `scheduleIdleTask('startup:ensureDailyWallpaper')` (line 811): Idle task scheduler queueing `ensureDailyWallpaper()`.

### 4.4 Projected Line Count Evolution
- **`src/new-tab.js` Baseline:** 925 lines
- **Lines Removed:** ~65 lines (lines 327–391)
- **`src/new-tab.js` Target:** **~860 lines**
- **Cumulative Cycle #13 Reduction:** -288 lines (1,148 $\longrightarrow$ ~860 lines, **-25.1%**)

---

## 5. Extraction Boundary Rules

To ensure architectural integrity, decouple components cleanly, and prevent regressions, the extraction must strictly obey five boundary rules:

### 5.1 Dependency Availability Requirement
- **Rule:** Every function, service, and storage interface invoked during wallpaper priming must be fully declared, initialized, and available in memory **before** `primeWallpaperBackground()` begins evaluation.
- **Enforcement:** In `src/new-tab.html`, `wallpaper-storage.js` is script #37 and `dynamic-accent.js` is script #48. Both execute strictly before `wallpaper-controller.js` (script #49). Therefore, all required storage methods (`getWallpaperRotationState`, `clearPendingDailyRotation`, `syncWallpaperStartupState`, `setWallpaperSelectionWithFallback`) are guaranteed available when `wallpaper-controller.js` runs.

### 5.2 No New Global Dependencies
- **Rule:** The refactoring must introduce **zero** new top-level `const`, `let`, or `var` declarations in the global lexical scope that could conflict across deferred scripts.
- **Enforcement:** `primeWallpaperBackground` is declared as a function within `wallpaper-controller.js` and attached cleanly to the existing namespace object `window.HomebaseWallpaperController` (and mirrored to `window.primeWallpaperBackground` for compatibility). Scanned via `scripts/check-newtab-static.mjs` to prove 0 top-level declaration collisions.

### 5.3 Deterministic Startup Ordering
- **Rule:** The timing of background poster priming must be completely deterministic relative to DOM parsing and `<head>` preloading.
- **Enforcement:** `preload.js` runs synchronously in `<head>` to apply cached `localStorage` posters before DOM construction. During deferred script execution (which runs post-DOM-parsing but pre-`DOMContentLoaded`), `wallpaper-controller.js` (script #49) evaluates and primes the hydrated poster ~14 scripts earlier than `new-tab.js` (script #63), eliminating unstyled background flickers without altering lifecycle promises.

### 5.4 `new-tab.js` Ownership Boundary
- **Rule:** `src/new-tab.js` acts solely as the **Startup Orchestrator Coordinator**.
- **Scope Limit:** `new-tab.js` retains only high-level orchestration calls:
  - Invoking `getWallpaperTypePreference()` and `waitForWallpaperReady()` inside `initializePage()`.
  - Dispatching storage changes via `handleNewTabStorageChange()`.
  - Scheduling low-priority daily rotation checks via `scheduleIdleTask('startup:ensureDailyWallpaper')`.
- `new-tab.js` must **not** contain any rotation calculation, manifest parsing, poster fallback synthesis, or direct background DOM styling.

### 5.5 `wallpaper-controller.js` Ownership Boundary
- **Rule:** `HomebaseWallpaperController` in `src/newtab/wallpaper/wallpaper-controller.js` is the **sole canonical owner** of all wallpaper runtime behavior.
- **Scope Responsibility:** Fully owns:
  - Wallpaper background DOM priming (`primeWallpaperBackground`).
  - Rotation due evaluation (`isDailyWallpaperRotationDue`) and pool shuffling (`pickNextWallpaper`).
  - Fallback selection factory (`buildFallbackSelection`).
  - Video and poster playback lifecycle (`waitForWallpaperReady`, `applyWallpaperByType`, `clearBackgroundVideos`, etc.).
  - Dynamic accent coordination and settings preview.

---

## 6. No Functional Change Rule

Phase 3 is an architectural refactoring focused strictly on canonical subsystem ownership and modularity. It must not alter runtime semantics, algorithms, or visual presentation.

**Critical Invariant:** Phase 3 extraction must not change:
1. **Wallpaper Selection Algorithm**: The algorithm for picking wallpapers (`pickNextWallpaper`), array shuffling, manifest handling, and pool tracking remains 100% identical.
2. **Rotation Timing**: Daily rotation evaluation (`isDailyWallpaperRotationDue`) and timestamp comparison against `Date.now()` remain completely untouched.
3. **Fallback Behavior**: Fallback selection factory logic (`buildFallbackSelection`), default poster resolution (`assets/fallback.webp`), and graceful degradation on storage or network failure remain exactly as implemented.
4. **Storage Schema**: Data models written to or read from `HomebaseStorage` / `browser.storage.local` (`WALLPAPER_SELECTION_KEY`, `DAILY_ROTATION_KEY`, `PENDING_DAILY_ROTATION_KEY`, `fast-wallpaper-selection`, `fast-wallpaper-poster`) remain identical with zero schema changes.
5. **DOM Output**: The elements modified (`document.body.style.backgroundImage`, `#bg-fallback-poster`, `#bg-video`) receive the exact same styles, attributes, and URLs.
6. **Error Handling Behavior**: The outer `try ... catch (err)` block with `console.warn('primeWallpaperBackground failed:', err)` and internal fallbacks are preserved verbatim without altering error containment.
7. **Startup Sequence Semantics**: Cooperative boot timing, non-blocking execution, and startup contract promises remain identical.

$$\textbf{Core Invariant: } \text{Only ownership location changes. Runtime behavior remains 100\% invariant.}$$

---

## 7. Atomic Extraction Requirement

Because the static invariant scanner (`scripts/check-newtab-static.mjs`) detects depth-0 declarations across deferred scripts, Phase 3B must not introduce a second `primeWallpaperBackground` declaration.

The extraction must happen atomically:

1. Add `primeWallpaperBackground` ownership to `wallpaper-controller.js`
2. Remove old `primeWallpaperBackground` ownership from `new-tab.js`
3. Run static scanner immediately (`node scripts/check-newtab-static.mjs`)

An intermediate state with two declarations is strictly prohibited.

**Purpose:** Document why Phase 3B cannot be split into separate add/remove commits and preserve this architectural constraint for future AI contributors.

---

## 8. Technical Audit Checklist

Before and during implementation, each technical facet of `primeWallpaperBackground()` must pass the following audit criteria:

### 8.1 DOM Manipulation Audit
- [x] **Target Elements:** `applyWallpaperBackground(poster)` modifies `document.body.style.backgroundImage`, and `setWallpaperFallbackPoster` configures `#bg-fallback-poster` and `#bg-video`.
- [x] **Timing Guarantee:** Deferred scripts execute after the HTML document tree is parsed. Therefore, `document.body` and all background container elements exist when script #49 evaluates.
- [x] **Zero Null Dereferences:** Both `applyWallpaperBackground` and `setWallpaperFallbackPoster` contain internal null guards (`if (!document.body) return;`).

### 8.2 Async Operations Audit
- [x] **Async Invocations:** The function awaits 6 distinct async operations:
  1. `await getWallpaperRotationState()`
  2. `await getVideosManifest()`
  3. `await pickNextWallpaper(manifest)`
  4. `await clearPendingDailyRotation()`
  5. `await hydrateWallpaperSelection(selection)`
  6. `await setWallpaperSelectionWithFallback(fallbackSelection, now)`
- [x] **Non-Blocking Execution:** The function runs asynchronously and returns a promise; it does not block the browser thread or delay other deferred script evaluation.
- [x] **Error Containment:** The outer `try ... catch (err)` block captures any rejected promise, logs a warning via `console.warn`, and prevents unhandled promise rejections from propagating.

### 8.3 Timers Audit
- [x] **Timer Usage:** `primeWallpaperBackground()` uses `Date.now()` for deterministic timestamp calculations (`now`).
- [x] **No Rogue Timers:** Contains zero `setTimeout`, `setInterval`, or `requestAnimationFrame` calls in its direct execution path.
- [x] **Zero Memory Leaks:** No active timer handles are created or left uncleaned.

### 8.4 Event Listeners Audit
- [x] **Listener Footprint:** `primeWallpaperBackground()` attaches zero DOM or window event listeners.
- [x] **Isolation:** Subsystem visibility listeners (`setupWallpaperVisibilityListener()`) remain separate and idempotent at the tail of `wallpaper-controller.js`.
- [x] **Storage Dispatch:** Subsystem storage listeners remain managed by `HomebaseStorageDispatcher` in `new-tab.js`.

### 8.5 Storage Dependencies Audit
- [x] **Storage Interfaces:** Calls 4 storage methods defined in `wallpaper-storage.js`:
  - `getWallpaperRotationState()`: Reads `WALLPAPER_SELECTION_KEY`, `DAILY_ROTATION_KEY`, and `PENDING_DAILY_ROTATION_KEY`.
  - `clearPendingDailyRotation()`: Clears the rotation lock in `HomebaseStorage`.
  - `syncWallpaperStartupState(selection, allowDailyRotation)`: Synchronizes in-memory mirror and fast-boot `localStorage` mirrors (`fast-wallpaper-selection`, `fast-wallpaper-poster`).
  - `setWallpaperSelectionWithFallback(selection, now)`: Persists synthesized fallback selection.
- [x] **Facade Compliance:** All calls leverage `HomebaseStorage` with automatic fallback to `browser.storage.local`.
- [x] **Schema Integrity:** Data models conform strictly to schema specifications (validated by unit tests in `wallpaper-state-storage.test.mjs`).

---

## 9. Risk Analysis & Mitigation

### 9.1 Startup Timing & First Paint
- **Risk:** Could running `primeWallpaperBackground()` earlier or later cause an unstyled background flash?
- **Analysis & Mitigation:**
  - `preload.js` runs synchronously in `<head>` and applies cached posters from `localStorage` (`fast-wallpaper-poster`), guaranteeing instant first paint before any deferred script runs.
  - Moving `primeWallpaperBackground()` into `wallpaper-controller.js` (script #49) means it executes **14 scripts earlier** than it currently does in `new-tab.js` (script #63).
  - Executing earlier is strictly beneficial: the hydrated poster background is applied to the DOM even faster.

### 9.2 `<script defer>` Execution Ordering
- **Risk:** Could dependencies be missing when `wallpaper-controller.js` runs?
- **Analysis & Mitigation:**
  - `wallpaper-storage.js` is script #37; `dynamic-accent.js` is script #48; `wallpaper-controller.js` is script #49.
  - All storage methods (`getWallpaperRotationState`, `clearPendingDailyRotation`, `syncWallpaperStartupState`, `setWallpaperSelectionWithFallback`) are already declared and evaluated before script #49.
  - Zero dependency inversion risk.

### 9.3 Error Containment
- **Risk:** What happens if manifest fetching or storage fails during priming?
- **Analysis & Mitigation:**
  - The entire function body is wrapped in `try { ... } catch (err) { console.warn('primeWallpaperBackground failed:', err); }`.
  - Storage failures fall back gracefully to `buildFallbackSelection(now)` (`assets/fallback.webp`).
  - No uncaught rejection can escape to block other scripts or halt page initialization.

### 9.4 Cross-Browser Compatibility
- **Risk:** Differences between Chromium and Firefox execution.
- **Analysis & Mitigation:**
  - Both Chromium and Firefox implement identical HTML5 `<script defer>` execution semantics (sequential execution in document tree order prior to `DOMContentLoaded`).
  - Dual builds (`dist/chrome` and `dist/firefox`) will remain fully functional and identical.

---

## 10. Implementation Steps

1. **Step 1: Audit & Preparation** (Completed with this document and Phase 3A report).
2. **Step 2: Atomic Extraction (Phase 3B)**:
   - Add `async function primeWallpaperBackground()` to `src/newtab/wallpaper/wallpaper-controller.js`.
   - Export on `HomebaseWallpaperController` and `window`.
   - Invoke priming at the evaluation tail of `wallpaper-controller.js`.
   - Concurrently remove lines 327–391 from `src/new-tab.js`.
   - Run `check-newtab-static.mjs` immediately to verify 0 declaration collisions.
3. **Step 3: Verify**:
   - `node --check src/new-tab.js`
   - `node --check src/newtab/wallpaper/wallpaper-controller.js`
   - `node scripts/check-newtab-static.mjs`
   - `npm.cmd test`
   - `npm.cmd run build`
   - `git diff src/preload.js src/instant_load.js manifests/ dist/`
4. **Step 4: Document & Report**:
   - Generate `docs/cycles/cycle-13/phase-3b-implementation-report.md`.
5. **Step 5: Commit & Push** (subject to user review & approval).

---

## 11. Verification Plan

```powershell
# 1. Syntax Validation
node --check src/new-tab.js
node --check src/newtab/wallpaper/wallpaper-controller.js

# 2. Static Invariant Scanner
node scripts/check-newtab-static.mjs

# 3. Automated Test Pipeline
npm.cmd test

# 4. Dual Target Build
npm.cmd run build

# 5. Protected Files Diff
git diff src/preload.js src/instant_load.js manifests/ dist/
```

Success criteria:
- Syntax: 0 errors.
- Static Invariants: 63 deferred scripts, 0 declaration collisions.
- Tests: 367 / 367 unit tests pass (100%), browser smoke test passes.
- Build: Clean dual build in `dist/chrome/` and `dist/firefox/`.
- Protected files diff: Completely empty.

---

## 12. Rollback Strategy

If any failure occurs during implementation or verification:
```powershell
git checkout -- src/new-tab.js src/newtab/wallpaper/wallpaper-controller.js
```
The changes are isolated entirely to these two files; reverting restores the exact working tree of commit `dc83823`.
