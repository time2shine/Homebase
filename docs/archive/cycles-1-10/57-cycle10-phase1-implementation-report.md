# Homebase Improvement Cycle #10 Phase 1 Implementation Report: Performance & Visual Runtime Controller Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #10 — Phase 1 (Performance Mode and Visual Effects Runtime Extraction)  
**Target Release:** Homebase v0.17.0  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/56-cycle10-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/56-cycle10-plan.md)  
**Status:** Implemented & Verified (Awaiting User Review / Pre-Commit State)  

---

## 1. Overview & Objectives

In Phase 1 of Cycle #10, the **Performance Mode and Visual Effects Runtime** cluster was extracted from the monolithic [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into a dedicated, modular domain controller: **[`src/newtab/settings/performance-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js)**.

### Core Goals:
1. Extract performance mode evaluation, body class toggling, fast mirror synchronization (`fast-performance-mode`), and visual effect runtime adjustments (glass style injection, grid animation keyframes, animation speed, background dimming overlay) into a standalone controller.
2. Expose the standard controller interface:
   ```javascript
   window.HomebasePerformanceController = {
     initialize,
     applyPerformanceMode,
     applyVisualEffects,
     setGlassStyle,
     setGridAnimationSpeed,
     ...
   };
   ```
3. Replace the extracted implementations in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) with delegating calls to preserve backwards compatibility across internal callers and external modules.
4. Maintain classic `<script defer>` script architecture, zero ES modules, zero bundlers, and zero new dependencies.
5. Guarantee that protected files ([`src/preload.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [`src/instant_load.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js), `manifests/*`, `dist/*`) remain 100% untouched.

---

## 2. Extracted Functions

The following 7 functions and their associated DOM and state manipulations were extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):

| Function Name | Original Lines in `src/new-tab.js` | Extracted Responsibility |
| :--- | :---: | :--- |
| `readFastPerformanceModePreference` | 6832–6839 | Reads `localStorage['fast-performance-mode'] === '1'` safely. |
| `syncFastPerformanceModeMirror` | 6841–6846 | Sets `localStorage['fast-performance-mode']` to `'1'` or `'0'`. |
| `isPerformanceModeEnabled` | 6848–6850 | Checks boolean state of active performance mode. |
| `disableGridAnimationRuntime` | 6852–6870 | Clears `#dynamic-grid-animation`, removes `.grid-animation-enabled`, collapses sub-settings, and strips `.newly-rendered`. |
| `disableGlassRuntime` | 6872–6885 | Clears `#dynamic-glass-style`, sets `--glass-blur: 0px`, `--glass-bg: transparent`, `--overlay-blur: 0px`. |
| `enableGlassRuntimeFromPreference` | 6887–6892 | Removes CSS blur overrides and reapplies preferred glass style. |
| `applyPerformanceModeState` | 6894–6949 | Coordinates DOM class toggles, settings row visibility, video cleanup, and visual effect restoration. |

---

## 3. New Controller API (`window.HomebasePerformanceController`)

Implemented in [`src/newtab/settings/performance-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js):

```javascript
window.HomebasePerformanceController = {
  // Primary lifecycle & configuration
  initialize(options = {}),
  applyPerformanceMode(enabled, options = {}),
  applyVisualEffects(preferences = {}),
  setGlassStyle(styleId),
  setGridAnimationSpeed(seconds),
  setGridAnimationEnabled(enabled),
  setBackgroundDim(value),

  // State inspection & fast mirrors
  isPerformanceModeEnabled(),
  getPerformanceMode(),
  readFastPerformanceModePreference(),
  syncFastPerformanceModeMirror(enabled),

  // Granular runtime operations
  disableGridAnimationRuntime(),
  disableGlassRuntime(),
  enableGlassRuntimeFromPreference(preferredStyle),
  getState()
};
```

### Key Architectural Invariants of the Controller:
- **Resilient Fallback**: Operates standalone or with `HomebaseStorage`; handles environments where the DOM or localStorage may be partially mocked or restricted.
- **Microtask & Callback Isolation**: Dispatches video cleanup and cinema mode reset via structured option callbacks (`onVideoCleanup`, `onCinemaModeReset`), maintaining strict separation between visual runtime and video playback.
- **Fast Mirror Consistency**: Reads and writes `localStorage['fast-performance-mode']` in lockstep with memory state to guarantee fast, zero-flicker startup.

---

## 4. Changes in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), the monolithic implementations of the 7 performance functions were replaced with lightweight delegating wrappers:
- `readFastPerformanceModePreference()`: Delegates to `HomebasePerformanceController.readFastPerformanceModePreference()`.
- `syncFastPerformanceModeMirror(enabled)`: Delegates to `HomebasePerformanceController.syncFastPerformanceModeMirror(enabled)`.
- `isPerformanceModeEnabled()`: Delegates to `HomebasePerformanceController.isPerformanceModeEnabled()`.
- `disableGridAnimationRuntime()`: Delegates to `HomebasePerformanceController.disableGridAnimationRuntime()`.
- `disableGlassRuntime()`: Delegates to `HomebasePerformanceController.disableGlassRuntime()`.
- `enableGlassRuntimeFromPreference()`: Delegates to `HomebasePerformanceController.enableGlassRuntimeFromPreference(appGlassStylePreference)`.
- `applyPerformanceModeState(enabled)`: Delegates to `HomebasePerformanceController.applyPerformanceMode(isOn, { ... callbacks })`.

This guarantees that existing internal references throughout `src/new-tab.js` and external references in `settings-preferences.js` and `settings-ui.js` continue to function without any signature or behavior discrepancies.

---

## 5. Script Loading Order in `src/new-tab.html`

The new controller is loaded via `<script defer>` immediately after `visual-effects-settings.js` and before `src/new-tab.js`:

```html
  <!-- Settings helpers -->
  <script src="newtab/settings/backup-import.js" defer></script>
  <script src="newtab/settings/visual-effects-settings.js" defer></script>
  <script src="newtab/settings/performance-controller.js" defer></script>

  <!-- Integrations -->
  <script src="newtab/integrations/app-launcher.js" defer></script>
  ...
  <!-- Main new-tab runtime -->
  <script src="new-tab.js" defer></script>
```

---

## 6. Test Coverage

A comprehensive unit test suite was added in [`tests/unit/performance-controller.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/performance-controller.test.mjs) containing 9 unit tests:
1. `Performance Controller - exports check` — Verifies window exports and function signatures.
2. `Performance Controller - fast mirror read and sync` — Verifies synchronous read/write to `fast-performance-mode` key.
3. `Performance Controller - applyPerformanceMode enables performance mode and mutates DOM` — Verifies DOM classes, toggle inputs, video cleanup callback, and glass disablement.
4. `Performance Controller - applyPerformanceMode disables performance mode and restores visual runtime` — Verifies style re-enabling, grid duration property injection, and cinema reset callback.
5. `Performance Controller - setGlassStyle suppresses in performance mode and applies when off` — Verifies selective style suppression.
6. `Performance Controller - setGridAnimationSpeed sets CSS variables and updates UI slider` — Verifies CSS custom properties and UI slider/label syncing.
7. `Performance Controller - setBackgroundDim clamps values and injects overlay element` — Verifies bounds clamping (0–90) and DOM overlay injection.
8. `Performance Controller - applyVisualEffects applies preferences when performance mode is off` — Verifies multi-preference batch application.
9. `Performance Controller - initialize loads from storage and synchronizes fast mirror` — Verifies end-to-end initialization with schema-validated storage mock.

---

## 7. Verification Results

| Stage | Command | Result |
| :--- | :--- | :---: |
| **Syntax Validation** | `node --check src/newtab/settings/performance-controller.js src/new-tab.js tests/unit/performance-controller.test.mjs` | **PASS** |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS (47 scripts verified)** |
| **Unit Test Suite** | `npm.cmd test` | **PASS (285 / 285 tests passed)** |
| **Extension Builds** | `npm.cmd run build` | **PASS (Chrome & Firefox)** |
| **Whitespace & Formatting** | `git diff --check` | **PASS (0 errors)** |
| **Protected Files** | `git diff src/preload.js src/instant_load.js manifests/ dist/` | **PASS (0 diffs)** |

---

## 8. Risk Assessment & Rollback Notes

- **Risk Level**: **P0 (Low Risk)**. The performance controller operates primarily on DOM classes (`performance-mode`, `grid-animation-enabled`) and CSS variables, with well-defined boundaries.
- **Rollback Procedure**: If any unexpected regression occurs, discarding changes to `src/new-tab.html` and `src/new-tab.js` and removing `src/newtab/settings/performance-controller.js` restores previous behavior cleanly.
