# Homebase Cycle #14 — Phase 2 Plan: Core Storage & State Engine Extraction (`settings-storage.js`)

**Document:** `docs/cycles/cycle-14/phase-2-plan.md`  
**Date:** October 11, 2026  
**Status:** PROPOSED — AWAITING REVIEW & APPROVAL  
**Cycle Target:** Settings Panel Modularization  
**Phase Focus:** Extract Canonical Storage, Schema & State Engine into `src/newtab/settings/settings-storage.js`  
**Baseline Subsystem Size:** 11 files, 6,752 lines in `src/newtab/settings/`  
**Target Unit Test Status:** 367 / 367 passing (100%), 0 declaration collisions across all deferred scripts  

---

## 1. Executive Summary & Extraction Strategy

Following the approved **Cycle #14 Phase 1 Planning Audit** ([`docs/cycles/cycle-14/phase-1-settings-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-14/phase-1-settings-audit.md)), **Phase 2** decouples the core state, storage schema, and persistence engine from [`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) into a standalone, authoritative module:

$$\textbf{Target Module: } \texttt{src/newtab/settings/settings-storage.js}$$

### 1.1 Core Problems Solved in Phase 2
1. **Elimination of State Fragmentation**: State definitions (`settingsState`), defaults (`defaultSettingsState`), and key constants (`SETTINGS_KEYS`) are currently embedded inside a 1,257-line file alongside DOM form scraping and visual event hooks.
2. **Unified Persistence Pipeline**: Establishes `HomebaseSettingsStorage.save()` as the single canonical batch writer, guaranteeing that persistent storage (`HomebaseStorage.setMany`) and synchronous mirrors (`fast-bg-dim`, `fast-show-sidebar`, `fast-time-format`, `fast-performance-mode`) always update atomically.
3. **Paving the Way for UI Decomposition**: By isolating storage and state in a dedicated startup module, Phase 5 can extract the 1,697-line `settings-ui.js` modal presentation into `settings-panel.js` without any storage logic entanglements.

### 1.2 Phased Sub-Phase Progression
To preserve atomic rollback capabilities and zero regression risk, Phase 2 is structured into four sequential sub-phases:

```text
Phase 2A: Author src/newtab/settings/settings-storage.js
          • Encapsulated IIFE exporting window.HomebaseSettingsStorage
          • Authors keys, default state, reactive state store, batch load/save, and 34 global bridges
      ↓ (Syntax Verification: node --check)
Phase 2B: Integrate Manifest & Refactor settings-preferences.js
          • Register settings-storage.js in src/new-tab.html as Script #46
          • Refactor settings-preferences.js to delegate state & persistence to HomebaseSettingsStorage
          • Update scripts/check-newtab-static.mjs keyExtractedModulePaths
      ↓ (Static Collision & Order Verification)
Phase 2C: Test Suite Harmonization & Coverage Expansion
          • Update tests/unit/settings-storage.test.mjs VM loader to evaluate settings-storage.js
          • Add unit test specs for HomebaseSettingsStorage get, set, save, batch, and fallback
      ↓ (Unit Test Verification: npm.cmd test — 367+ passing)
Phase 2D: End-to-End Build, Smoke Test & Checkpoint Presentation
          • Browser smoke test & dual Chrome/Firefox builds
```

---

## 2. `settings-storage.js` Module Architecture

### 2.1 Mechanical Contract & Encapsulation
- **Execution Mode**: **Startup Deferred** (`<script src="newtab/settings/settings-storage.js" defer></script>`).
- **Position**: Script #46 in `src/new-tab.html` (placed immediately before `settings-preferences.js`).
- **Lexical Isolation**: Encapsulated entirely in an IIFE or module closure. Zero loose top-level `const` or `let` variables in the global declarative record, guaranteeing **0 collision errors**.
- **Namespace Export**: Binds public interface to `window.HomebaseSettingsStorage` with backward-compatible alias `window.HomebaseSettingsPreferences`.

### 2.2 Scope of Transferred Responsibilities

| Responsibility | Current Location | New Canonical Owner (`settings-storage.js`) |
|---|---|---|
| **Storage Key Constants** | `settings-preferences.js` (lines 8–77) | `SETTINGS_KEYS` frozen dictionary + window constant bridges. |
| **Canonical Defaults** | `settings-preferences.js` (lines 80–118) | `defaultSettingsState` frozen dictionary. |
| **In-Memory Reactive State** | `settings-preferences.js` (lines 121–122) | `settingsState` managed via `get()`, `set()`, `getAll()`. |
| **Synchronous Fast-Path Priming** | `settings-preferences.js` (lines 170–187) | `initialize()`: reads `fast-performance-mode` and `fast-bg-dim`. |
| **Persistent Storage Loading** | `settings-preferences.js` (lines 192–392) | `load()`: triggers migrations, queries `HomebaseStorage.getMany()`, populates state, and executes startup visual hooks. |
| **Atomic Transactional Saving** | `settings-preferences.js` (lines 793–857) | `save(updates)`: writes state, syncs fast mirrors, and writes `HomebaseStorage.setMany()`. |
| **Global Preference Bridges** | `settings-preferences.js` (lines 1165–1235) | `definePreferenceBridge()`: binds 34 getter/setters on `window`. |

---

## 3. Existing API Preservation Strategy

To guarantee that zero external consumers or test suites break, Phase 2 maintains 100% backward compatibility through explicit interface bridges:

### 3.1 Dual Controller Namespace Bridging
```javascript
// Expose new canonical controller
window.HomebaseSettingsStorage = HomebaseSettingsStorage;

// Maintain full backward compatibility alias
window.HomebaseSettingsPreferences = HomebaseSettingsStorage;
window.HomebaseSettingsPreferenceController = HomebaseSettingsStorage;
```

### 3.2 Global Preference Accessor Bridges (34 Properties)
All 34 property getters and setters on `window` will be preserved using `Object.defineProperty(window, prop, { get, set })`:
1. `appTimeFormatPreference`
2. `appBackgroundDimPreference`
3. `appShowSidebarPreference`
4. `appShowWeatherPreference`
5. `appShowQuotePreference`
6. `appShowNewsPreference`
7. `appShowTodoPreference`
8. `appNewsSourcePreference`
9. `appMaxTabsPreference`
10. `appAutoClosePreference`
11. `appSingletonModePreference`
12. `appSearchOpenNewTabPreference`
13. `appSearchRememberEnginePreference`
14. `appSearchDefaultEnginePreference`
15. `appSearchMathPreference`
16. `appSearchShowHistoryPreference`
17. `appSearchSuggestionsPreference`
18. `appContainerModePreference`
19. `appContainerNewTabPreference`
20. `appBookmarkOpenNewTabPreference`
21. `appBookmarkTextBgPreference`
22. `appBookmarkTextBgColorPreference`
23. `appBookmarkTextBgOpacityPreference`
24. `appBookmarkTextBgBlurPreference`
25. `appBookmarkFallbackColorPreference`
26. `appBookmarkFolderColorPreference`
27. `appGridAnimationPreference`
28. `appGridAnimationSpeedPreference`
29. `appGridAnimationEnabledPreference`
30. `appGlassStylePreference`
31. `appPerformanceModePreference`
32. `debugPerfOverlayPreference`
33. `appBatteryOptimizationPreference`
34. `appCinemaModePreference`

### 3.3 Legacy Helper Functions
- `window.loadAppSettingsFromStorage()`: delegates to `HomebaseSettingsStorage.load()`.
- Legacy constant names on `window` (`APP_TIME_FORMAT_KEY`, `APP_BACKGROUND_DIM_KEY`, etc.): populated dynamically from `SETTINGS_KEYS`.

---

## 4. Migration Sequence from `settings-preferences.js`

### 4.1 Sub-Phase 2A: Author `src/newtab/settings/settings-storage.js`
1. Create `src/newtab/settings/settings-storage.js` (~380 lines).
2. Define `SETTINGS_KEYS` with all 34 storage keys.
3. Define `defaultSettingsState` with default values.
4. Implement:
   - `initialize()`: fast mirror localStorage readers.
   - `load()`: schema migrations trigger, `HomebaseStorage.getMany()`, runtime callbacks (`applyPerformanceModeState`, `applyGridAnimation`, `applyGlassStyle`, `applyTimeFormatPreference`).
   - `save(updates)`: batch state update, fast mirror writes (`fast-bg-dim`, `fast-show-sidebar`, `fast-time-format`, `fast-performance-mode`), `HomebaseStorage.setMany(storageBatch)`.
   - `get(prop)`, `set(prop, val)`, `getAll()`.
   - `definePreferenceBridge(windowProp, stateProp)` on `window`.
5. Bind `window.HomebaseSettingsStorage` and `window.HomebaseSettingsPreferences`.

### 4.2 Sub-Phase 2B: Refactor `settings-preferences.js` & Manifest
1. In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), insert:
   ```html
   <!-- Settings helpers -->
   <script src="newtab/settings/settings-storage.js" defer></script>
   <script src="newtab/settings/settings-preferences.js" defer></script>
   ```
2. Refactor `settings-preferences.js`:
   - Remove redundant top-level `const APP_*_KEY` declarations that would collide with `settings-storage.js`.
   - Reference `HomebaseSettingsStorage.keys`, `HomebaseSettingsStorage.state`, and `HomebaseSettingsStorage.save()` directly.
   - Keep `syncAppSettingsForm()` (DOM hydration) and `handleSettingsStorageChange()` (storage event listener) in `settings-preferences.js` until Phases 4 & 5.
   - Re-export `HomebaseSettingsPreferences` with merged properties `{ ...HomebaseSettingsStorage, sync: syncAppSettingsForm, handleStorageChange: handleSettingsStorageChange }`.
3. In [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs), add `"newtab/settings/settings-storage.js"` to `keyExtractedModulePaths`.

### 4.3 Sub-Phase 2C: Test Suite Harmonization
1. Update [`tests/unit/settings-storage.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/settings-storage.test.mjs):
   - Add `settingsStorageScriptPath = path.join(rootDir, 'src/newtab/settings/settings-storage.js')`.
   - In `createSettingsTestEnvironment()`, run `settingsStorageScriptCode` in VM context before `settingsPreferencesScriptCode`.
2. Add dedicated test assertions:
   - `HomebaseSettingsStorage.load()` correctly populates `state` and triggers runtime hooks.
   - `HomebaseSettingsStorage.save()` updates in-memory state, fast mirrors, and persistent storage.
   - Direct `window.appTimeFormatPreference = '24-hour'` mutation updates `HomebaseSettingsStorage.state.timeFormat`.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is undefined.

### 4.4 Sub-Phase 2D: End-to-End Verification
1. Run syntax verification: `node --check src/newtab/settings/*.js`.
2. Run static scanner: `node scripts/check-newtab-static.mjs`.
3. Run test pipeline: `npm.cmd test`.
4. Run dual builds: `npm.cmd run build`.
5. Verify protected files diff: `git diff src/preload.js src/instant_load.js manifests/ dist/`.

---

## 5. Script Loading Changes in `src/new-tab.html`

In `src/new-tab.html`, `settings-storage.js` is introduced immediately before `settings-preferences.js`:

```diff
   <!-- Widget helpers -->
   <script src="newtab/widgets/time.js" defer></script>
 
   <!-- Settings helpers -->
+  <script src="newtab/settings/settings-storage.js" defer></script>
   <script src="newtab/settings/settings-preferences.js" defer></script>
   <script src="newtab/settings/visual-effects-runtime.js" defer></script>
   <script src="newtab/settings/cinema-mode-runtime.js" defer></script>
```

### Script Ordering Contract Validation
- `newtab/core/storage-service.js` (Script #27) loads **before** `settings-storage.js` (Script #46), ensuring `HomebaseStorage` is available.
- `newtab/core/host-storage-adapter.js` (Script #32) loads **before** `settings-storage.js`, ensuring fast mirror persistence adapters are available.
- `settings-storage.js` (Script #46) loads **before** `new-tab.js` (Script #66), ensuring `HomebaseSettingsPreferences.initialize()` and `load()` run during `initializePage()` with zero timing disruption.

---

## 6. Static Checker Updates (`scripts/check-newtab-static.mjs`)

The static invariant scanner enforces the presence and ordering of all extracted domain modules.

### Planned Modification:
```diff
 const keyExtractedModulePaths = [
   "newtab/core/perf-report.js",
   "newtab/core/startup-perf-runtime.js",
   "newtab/core/idle-scheduler.js",
   "newtab/core/dialogs.js",
   "newtab/core/utils.js",
   "newtab/core/asset-loader.js",
   "newtab/core/sortable-bridge.js",
   "newtab/core/tab-lifecycle.js",
   "newtab/core/dock-navigation.js",
   "newtab/core/storage-dispatcher.js",
   "newtab/settings/sub-settings-ui.js",
   "newtab/settings/search-engine-settings.js",
+  "newtab/settings/settings-storage.js",
   "newtab/settings/settings-preferences.js",
   "newtab/settings/material-color-picker.js",
   "newtab/settings/backup-import.js",
```

### Static Checker Verification Criteria
- `check-newtab-static.mjs` verifies that all 66 deferred scripts exist on disk.
- Scans AST of all deferred scripts to prove **0 top-level identifier collisions**.
- Verifies that `new-tab.js` remains the final deferred script.

---

## 7. Test Impact Analysis

### 7.1 Existing Test Suite Inventory
All 32 test files in `tests/unit/` (367 passing tests) must continue to pass with 0 failures:

| Test File | Direct Touchpoints with Settings | Expected Impact & Safety Measure |
|---|---|---|
| [`tests/unit/settings-storage.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/settings-storage.test.mjs) | Loads `settings-preferences.js` and `settings-ui.js` | Update VM sandbox to load `settings-storage.js` first. All 24 existing tests pass unmodified. |
| [`tests/unit/phase2c-storage.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/phase2c-storage.test.mjs) | Tests `loadGlassStylePref` and `loadGridAnimationPref` | Unaffected; continues to mock `HomebaseStorage`. |
| [`tests/unit/performance-controller.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/performance-controller.test.mjs) | Reads `appPerformanceModePreference` | Unaffected; accessor bridge preserves exact read/write behavior. |
| [`tests/unit/widget-storage.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/widget-storage.test.mjs) | Reads `appShowSidebarPreference`, `appShowWeatherPreference`, etc. | Unaffected; bridges preserve access. |
| [`tests/unit/diagnostic-ui.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/diagnostic-ui.test.mjs) | Tests diagnostic reporting and storage health | Unaffected; reads `HomebaseStorage.health()`. |
| [`tests/unit/storage-dispatcher.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/storage-dispatcher.test.mjs) | Dispatches to `HomebaseSettingsPreferences.handleStorageChange` | Unaffected; `HomebaseSettingsPreferences` preserves `handleStorageChange`. |

### 7.2 New Test Specifications in `tests/unit/settings-storage.test.mjs`
Add a dedicated test suite verifying `HomebaseSettingsStorage`:
1. `settings-storage: initialize() reads fast mirrors from localStorage into in-memory state`.
2. `settings-storage: load() reads preference keys via HomebaseStorage.getMany and triggers migrations`.
3. `settings-storage: save() atomically updates in-memory state, fast mirrors, and persistent storage`.
4. `settings-storage: getter/setter bridges on window synchronize bidirectionally with state`.
5. `settings-storage: fallback to browser.storage.local when HomebaseStorage is undefined`.

---

## 8. Rollback Strategy & Risk Mitigations

### 8.1 Instant Rollback Command
Because no schema migrations or database changes occur, any unexpected error during implementation can be reverted in one atomic command:

```powershell
# Revert modified files
git checkout -- src/new-tab.html src/newtab/settings/ settings-preferences.js scripts/check-newtab-static.mjs tests/unit/settings-storage.test.mjs

# Remove newly created file if present
Remove-Item -Path src/newtab/settings/settings-storage.js -Force -ErrorAction SilentlyContinue
```

### 8.2 Failure Mode Mitigations
1. **Identifier Collision Failure**:
   - *Risk*: `check-newtab-static.mjs` detects `APP_TIME_FORMAT_KEY` declared in both `settings-storage.js` and `settings-preferences.js`.
   - *Mitigation*: Encapsulate `settings-storage.js` in an IIFE. In `settings-preferences.js`, remove top-level `const` declarations and read keys from `HomebaseSettingsStorage.keys`.
2. **Timing / Cold Boot Failure**:
   - *Risk*: `new-tab.js` calls `HomebaseSettingsPreferences.initialize()` before `settings-storage.js` has finished executing.
   - *Mitigation*: Both scripts load sequentially via `<script defer>`. `settings-storage.js` appears first, guaranteeing synchronous availability.

---

## 9. Commit Boundaries

Cycle #14 Phase 2 will execute across two discrete, reviewable commits:

### Commit 1: Implementation & Static Manifest
- **Message**: `refactor(settings): extract core settings-storage.js engine and state model`
- **Files**:
  - `src/newtab/settings/settings-storage.js` (NEW)
  - `src/newtab/settings/settings-preferences.js` (MODIFIED: refactored to delegate to `HomebaseSettingsStorage`)
  - `src/new-tab.html` (MODIFIED: added script tag for `settings-storage.js`)
  - `scripts/check-newtab-static.mjs` (MODIFIED: registered `settings-storage.js` in static check)
- **Gate Criteria**: `node --check`, `check-newtab-static.mjs` PASS (0 collisions).

### Commit 2: Unit Test Suite & Coverage Expansion
- **Message**: `test(settings): harmonize unit test harness and add HomebaseSettingsStorage specs`
- **Files**:
  - `tests/unit/settings-storage.test.mjs` (MODIFIED: added `settings-storage.js` VM runner and new test specs)
- **Gate Criteria**: `npm.cmd test` PASS (100% pass across all 367+ tests), browser smoke test PASS, dual builds PASS.

---

*End of Cycle #14 Phase 2 Plan.*
