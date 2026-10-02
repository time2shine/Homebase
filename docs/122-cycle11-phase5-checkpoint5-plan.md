# Phase 5 Checkpoint 5 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Checkpoint**: Checkpoint 5 — Settings Preference State Synchronization Extraction  
**Date**: October 2, 2026 (Updated)  
**Status**: Pending Owner Review & Approval  
**Target Files**:
- [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)
- [`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js)
- [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)
- [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs)

---

## 1. Executive Summary & Architecture Goals

The goal of Checkpoint 5 is to extract **Settings Preference State Synchronization** from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) while replacing fragile global state variables with a **strictly controlled controller architecture**.

### Core Architecture Rules
1. **No Permanent Window Globals**: Avoid designing the module around 33 permanent mutable globals (e.g., `window.appBackgroundDimPreference`).
2. **Clean Canonical State Model**: State properties use clean, canonical names (e.g. `state.backgroundDim`, `state.performanceMode`, `state.showSidebar`) rather than echoing legacy variable names (`state.appBackgroundDimPreference` is explicitly prohibited).
3. **Controlled Controller Ownership**: Introduce `window.HomebaseSettingsPreferences` as the single authoritative owner of:
   - Storage keys (`HomebaseSettingsPreferences.keys` — deeply immutable via `Object.freeze`)
   - Canonical preference state (`HomebaseSettingsPreferences.state`)
   - Initialization lifecycle (`initialize()`, `load()`, `save()`)
   - Form DOM binding and sync (`sync()`)
   - Live cross-tab synchronization (`handleStorageChange()`)
4. **Minimal, Justified Legacy Compatibility Bridges**: External modules that currently read or write loose preference variables will do so through clearly marked `Object.defineProperty(window, ...)` getters and setters that route directly to `HomebaseSettingsPreferences.state`. Bridges are created **only** for variables that have active external consumers.
5. **Reversed Dependency Direction**:
   - *Before*: `new-tab.js` (declared 176 lines of keys, state, and DOM elements) -> `settings-preferences.js` (functions called later) -> scattered global variables.
   - *After*: `HomebaseSettingsPreferences` (owns keys, state, sync, live updates) -> consumers (`settings-ui.js`, `visual-effects`, `search`, `widgets`) -> `new-tab.js` (pure startup caller via `HomebaseSettingsPreferences.load()`).
6. **Monolith Pruning**: Net removal of **~176 lines** from `src/new-tab.js`, bringing the monolith down from 3,322 lines to **~3,146 lines**.

---

## 2. Dependency Order Verification

### 2.1 Required Dependency Direction
Rather than relying on brittle HTML line numbers, script ordering must follow the verified dependency hierarchy:

```text
bookmark-storage.js
        ↓
settings-preferences.js
        ↓
settings-ui.js (lazy loaded)
        ↓
visual-effects-runtime.js
        ↓
cinema-mode-runtime.js
        ↓
new-tab.js
```

### 2.2 Lesson from Previous Regressions
Previous extraction regressions (notably the `ReferenceError: sidebar is not defined` in `loadAppSettingsFromStorage()` during Checkpoint 2) occurred because hidden global dependencies were overlooked when moving code between scripts. 

To eliminate regression risk in Checkpoint 5:
- All settings consumers across `src/` have been exhaustively scanned.
- All modules reading or writing `app*Preference` variables have been mapped.
- `settings-preferences.js` will declare and register all controller methods and legacy bridges immediately upon script evaluation, **without requiring DOM readiness or executing storage queries at evaluation time**.
- `new-tab.js` orchestrates invocation only after the document is ready.

---

## 3. Exact State Architecture

### 3.1 Immutability of Storage Keys
All storage keys are declared in a deeply frozen dictionary to prevent tampering or unintended mutations across modules:

```javascript
const SETTINGS_KEYS = Object.freeze({
  APP_TIME_FORMAT_KEY: 'appTimeFormatPreference',
  APP_BACKGROUND_DIM_KEY: 'appBackgroundDim',
  APP_SHOW_SIDEBAR_KEY: 'appShowSidebar',
  APP_SHOW_WEATHER_KEY: 'appShowWeather',
  APP_SHOW_QUOTE_KEY: 'appShowQuote',
  APP_SHOW_NEWS_KEY: 'appShowNews',
  APP_SHOW_TODO_KEY: 'appShowTodo',
  APP_NEWS_SOURCE_KEY: 'appNewsSource',
  APP_MAX_TABS_KEY: 'appMaxTabsCount',
  APP_AUTOCLOSE_KEY: 'appAutoCloseMinutes',
  APP_SINGLETON_MODE_KEY: 'appSingletonMode',
  APP_SEARCH_OPEN_NEW_TAB_KEY: 'appSearchOpenNewTab',
  APP_SEARCH_REMEMBER_ENGINE_KEY: 'appSearchRememberEngine',
  APP_SEARCH_DEFAULT_ENGINE_KEY: 'appSearchDefaultEngine',
  APP_SEARCH_MATH_KEY: 'appSearchMath',
  APP_SEARCH_SHOW_HISTORY_KEY: 'appSearchShowHistory',
  APP_SEARCH_SUGGESTIONS_KEY: 'appSearchSuggestionsEnabled',
  APP_CONTAINER_MODE_KEY: 'appContainerMode',
  APP_CONTAINER_NEW_TAB_KEY: 'appContainerNewTab',
  APP_BOOKMARK_OPEN_NEW_TAB_KEY: 'appBookmarkOpenNewTab',
  APP_BOOKMARK_TEXT_BG_KEY: 'appBookmarkTextBg',
  APP_BOOKMARK_TEXT_BG_COLOR_KEY: 'appBookmarkTextBgColor',
  APP_BOOKMARK_TEXT_OPACITY_KEY: 'appBookmarkTextBgOpacity',
  APP_BOOKMARK_TEXT_BLUR_KEY: 'appBookmarkTextBgBlur',
  APP_BOOKMARK_FALLBACK_COLOR_KEY: 'appBookmarkFallbackColor',
  APP_BOOKMARK_FOLDER_COLOR_KEY: 'appBookmarkFolderColor',
  APP_GRID_ANIMATION_KEY: 'appGridAnimationPref',
  APP_GRID_ANIMATION_SPEED_KEY: 'appGridAnimationSpeed',
  APP_GRID_ANIMATION_ENABLED_KEY: 'appGridAnimationEnabled',
  APP_GLASS_STYLE_KEY: 'appGlassStylePref',
  APP_PERFORMANCE_MODE_KEY: 'appPerformanceMode',
  FAST_PERFORMANCE_MODE_KEY: 'fast-performance-mode',
  APP_DEBUG_PERF_OVERLAY_KEY: 'debugPerfOverlay',
  APP_BATTERY_OPTIMIZATION_KEY: 'appBatteryOptimization',
  APP_CINEMA_MODE_KEY: 'appCinemaMode'
});
```

### 3.2 Canonical State Structure
State is normalized and stored with clean, domain-centric property names (no `app*Preference` redundancy):

```javascript
window.HomebaseSettingsPreferences = {
  keys: SETTINGS_KEYS,

  state: {
    // 1. Time & Layout
    timeFormat: '12-hour',
    backgroundDim: 0,
    showSidebar: true,

    // 2. Widget Toggles
    showWeather: true,
    showQuote: true,
    showNews: false,
    showTodo: true,
    newsSource: 'aljazeera',

    // 3. Tab Lifecycle & Windows
    maxTabs: 0,
    autoClose: 0,
    singletonMode: false,

    // 4. Search Behavior
    searchOpenNewTab: false,
    searchRememberEngine: true,
    searchDefaultEngine: 'google',
    searchMath: true,
    searchShowHistory: false,
    searchSuggestions: true,

    // 5. Container Modes
    containerMode: true,
    containerNewTab: true,

    // 6. Bookmarks Appearance & Behavior
    bookmarkOpenNewTab: false,
    bookmarkTextBg: false,
    bookmarkTextBgColor: '#2CA5FF',
    bookmarkTextBgOpacity: 0.65,
    bookmarkTextBgBlur: 4,
    bookmarkFallbackColor: '#00b8d4',
    bookmarkFolderColor: '#FFFFFF',

    // 7. Visual Effects & Performance
    gridAnimation: 'default',
    gridAnimationSpeed: 0.3,
    gridAnimationEnabled: false,
    glassStyle: 'original',
    performanceMode: false,
    debugPerfOverlay: false,
    batteryOptimization: false,
    cinemaMode: false
  },

  // Lifecycle & Synchronization API
  initialize,
  load,
  save,
  sync,
  handleStorageChange,

  // Accessors
  get(prop) {
    return this.state[prop];
  },
  set(prop, value) {
    this.state[prop] = value;
  },
  getAll() {
    return { ...this.state };
  },

  // DOM Form Controls (resolved lazily)
  getElements
};
```

---

## 4. Initialization Timing Protection

To guarantee that script evaluation does not execute premature DOM queries or uncoordinated asynchronous storage reads, initialization is partitioned into two clear stages:

### Stage 1: Synchronous Script Evaluation (`settings-preferences.js`)
- Freezes and exposes `HomebaseSettingsPreferences.keys`.
- Initializes canonical `HomebaseSettingsPreferences.state` with standard defaults.
- Synchronizes fast-path mirrors synchronously if present in `localStorage` (`fast-perf-mode`, `fast-bg-dim`).
- Registers all controller APIs on `window.HomebaseSettingsPreferences`.
- Registers legacy compatibility bridges on `window`.
- **Zero DOM querying and zero asynchronous storage calls at evaluation time**.

### Stage 2: Orchestrated Startup (`new-tab.js`)
During `initializePage()` in `src/new-tab.js`:
```javascript
// 1. Initialize controller internals
HomebaseSettingsPreferences.initialize();

// 2. Load stored settings (parallelized with bookmark metadata and folder state)
const settingsP = HomebaseSettingsPreferences.load();

// ... await parallelResults ...

// 3. Synchronize settings form controls
HomebaseSettingsPreferences.sync();
```

This two-stage separation completely eliminates race conditions and ensures clean, predictable startup execution.

---

## 5. Compatibility Bridge Inventory & Consumer Migration Map

Before implementation, every variable was audited across the entire repository. Bridges are created **only** where external consumers require them.

| Legacy Variable Identifier | Canonical State Property | Verified External Consumers | Access Type | Bridge Required? |
|---|---|---|:---:|:---:|
| `appBackgroundDimPreference` | `state.backgroundDim` | `visual-effects-runtime.js`, `settings-ui.js` | Read/Write | **YES** |
| `appShowSidebarPreference` | `state.showSidebar` | `widget-visibility.js`, `news.js`, `quote.js`, `settings-ui.js` | Read/Write | **YES** |
| `appShowWeatherPreference` | `state.showWeather` | `widget-visibility.js`, `weather.js`, `settings-ui.js` | Read/Write | **YES** |
| `appShowQuotePreference` | `state.showQuote` | `widget-visibility.js`, `quote.js`, `settings-ui.js` | Read/Write | **YES** |
| `appShowNewsPreference` | `state.showNews` | `widget-visibility.js`, `news.js`, `settings-ui.js` | Read/Write | **YES** |
| `appShowTodoPreference` | `state.showTodo` | `widget-visibility.js`, `todo.js`, `settings-ui.js` | Read/Write | **YES** |
| `appNewsSourcePreference` | `state.newsSource` | `news.js` | Read/Write | **YES** |
| `appMaxTabsPreference` | `state.maxTabs` | `tab-lifecycle.js`, `settings-ui.js` | Read/Write | **YES** |
| `appAutoClosePreference` | `state.autoClose` | `tab-lifecycle.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSingletonModePreference` | `state.singletonMode` | `settings-ui.js` | Read/Write | **YES** |
| `appSearchOpenNewTabPreference` | `state.searchOpenNewTab` | `search-interaction-controller.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSearchRememberEnginePreference` | `state.searchRememberEngine` | `search-engine-settings.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSearchDefaultEnginePreference` | `state.searchDefaultEngine` | `search-engine-settings.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSearchMathPreference` | `state.searchMath` | `search-interaction-controller.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSearchShowHistoryPreference` | `state.searchShowHistory` | `search-interaction-controller.js`, `settings-ui.js` | Read/Write | **YES** |
| `appSearchSuggestionsPreference` | `state.searchSuggestions` | `search-suggestion-cache.js`, `search-ui-controller.js`, `search-interaction-controller.js`, `settings-ui.js` | Read/Write | **YES** |
| `appContainerModePreference` | `state.containerMode` | `firefox-containers.js`, `settings-ui.js` | Read/Write | **YES** |
| `appContainerNewTabPreference` | `state.containerNewTab` | `firefox-containers.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkOpenNewTabPreference` | `state.bookmarkOpenNewTab` | `new-tab.js` (link click), `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkTextBgPreference` | `state.bookmarkTextBg` | `bookmark-style-runtime.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkTextBgColorPreference` | `state.bookmarkTextBgColor` | `bookmark-style-runtime.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkTextBgOpacityPreference` | `state.bookmarkTextBgOpacity` | `bookmark-style-runtime.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkTextBgBlurPreference` | `state.bookmarkTextBgBlur` | `bookmark-style-runtime.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkFallbackColorPreference` | `state.bookmarkFallbackColor` | `bookmark-grid-controller.js`, `bookmark-editor-adapter.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBookmarkFolderColorPreference` | `state.bookmarkFolderColor` | `bookmark-grid-controller.js`, `bookmark-editor-adapter.js`, `settings-ui.js` | Read/Write | **YES** |
| `appGridAnimationPreference` | `state.gridAnimation` | `visual-effects-runtime.js`, `visual-effects-settings.js`, `performance-controller.js`, `new-tab.js` | Read/Write | **YES** |
| `appGridAnimationSpeedPreference` | `state.gridAnimationSpeed` | `visual-effects-runtime.js`, `performance-controller.js`, `new-tab.js` | Read/Write | **YES** |
| `appGridAnimationEnabledPreference` | `state.gridAnimationEnabled` | `visual-effects-runtime.js`, `performance-controller.js`, `bookmark-grid-controller.js`, `new-tab.js` | Read/Write | **YES** |
| `appGlassStylePreference` | `state.glassStyle` | `visual-effects-runtime.js`, `visual-effects-settings.js`, `performance-controller.js`, `new-tab.js` | Read/Write | **YES** |
| `appPerformanceModePreference` | `state.performanceMode` | `performance-controller.js`, `bookmark-grid-controller.js`, `new-tab.js`, `settings-ui.js` | Read/Write | **YES** |
| `debugPerfOverlayPreference` | `state.debugPerfOverlay` | `startup-perf-runtime.js`, `perf-report.js`, `settings-ui.js` | Read/Write | **YES** |
| `appBatteryOptimizationPreference` | `state.batteryOptimization` | `wallpaper-controller.js`, `settings-ui.js` | Read/Write | **YES** |
| `appCinemaModePreference` | `state.cinemaMode` | `cinema-mode-runtime.js`, `settings-ui.js` | Read/Write | **YES** |

### 5.1 Legacy Bridge Pattern
```javascript
// =============================================================================
// LEGACY COMPATIBILITY BRIDGES
// =============================================================================
function definePreferenceBridge(windowProp, stateProp) {
  if (!(windowProp in window)) {
    Object.defineProperty(window, windowProp, {
      get() {
        return window.HomebaseSettingsPreferences.state[stateProp];
      },
      set(val) {
        window.HomebaseSettingsPreferences.state[stateProp] = val;
      },
      configurable: true,
      enumerable: true
    });
  }
}
```

### 5.2 Storage Key Constant Bridges
To support consumers that reference `APP_*_KEY` constants:
```javascript
for (const [constName, storageKey] of Object.entries(SETTINGS_KEYS)) {
  window[constName] = storageKey;
}
```

### 5.3 Function Bridges
```javascript
window.loadAppSettingsFromStorage = () => window.HomebaseSettingsPreferences.load();
window.syncAppSettingsForm = () => window.HomebaseSettingsPreferences.sync();
```

---

## 6. Exact Extraction Targets & Code Pruning

### 6.1 Blocks Removed from `src/new-tab.js`

1. **Lines 701–753 (53 lines)**: Settings DOM Element Declarations
   - `appSettingsCloseBtn`, `appSettingsCancelBtn`, `appSettingsSaveBtn`
   - `appTimeFormatSelect`, `appSidebarToggle`, `appWeatherToggle`, `appQuoteToggle`, `appNewsToggle`, `appTodoToggle`
   - `appMaxTabsSelect`, `appAutoCloseSelect`
   - `appSearchOpenNewTabToggle`, `appSearchRememberEngineToggle`, `appSearchMathToggle`, `appSearchHistoryToggle`, `appSearchSuggestionsToggle`
   - `appSearchDefaultEngineContainer`, `appSearchDefaultEngineSelect`
   - `appDimSlider`, `appDimLabel`
   - `appDailyToggle`, `appWallpaperTypeSelect`, `appWallpaperQualitySelect`
   - `wallpaperTypeToggle`, `wallpaperQualityToggle`, `galleryDailyToggle`
   - *Action*: Query dynamically in `settings-preferences.js` inside `getElements()` / `sync()` and expose on `window` for backward compatibility.
2. **Lines 756–816 (61 lines)**: Storage Key Constants
   - All 33 `APP_*_KEY` constants.
   - *Action*: Transferred into immutable `HomebaseSettingsPreferences.keys` and mirrored to `window`.
3. **Lines 852–913 (62 lines)**: Preference State Variables
   - All 33 loose `let app*Preference` declarations.
   - *Action*: Transferred into `HomebaseSettingsPreferences.state` with legacy bridge accessors.
4. **Startup Orchestration in `initializePage()`**:
   - Line 2694: `const settingsP = loadAppSettingsFromStorage();` -> routes through `HomebaseSettingsPreferences.load()`.
   - Line 2731: `syncAppSettingsForm();` -> routes through `HomebaseSettingsPreferences.sync()`.
5. **Cross-Tab Synchronization in `browser.storage.onChanged`**:
   - Add delegation at line 3212:
     ```javascript
     if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.handleStorageChange === 'function') {
       window.HomebaseSettingsPreferences.handleStorageChange(changes, area);
     }
     ```

### 6.2 Line Impact Summary
- `src/new-tab.js`: 3,322 lines -> **~3,146 lines** (**-176 lines**)
- Cumulative Phase 5 reduction: **-687 lines** (from 3,833 lines at phase start)

---

## 7. Static Scanner Updates

In [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs):
1. `newtab/settings/settings-preferences.js` is already present in `keyExtractedModulePaths`.
2. The dynamic collision scanner `verifyCrossScriptDeclarationCollisions()` will verify that the 33 `APP_*_KEY` constants, 33 `app*Preference` variables, and 26 DOM handles exist in `settings-preferences.js` and have been **completely eliminated** from `src/new-tab.js`.
3. Zero duplicate declaration collisions will be statically enforced.

---

## 8. Extended Verification Plan

Following implementation, perform the complete extended verification suite:

### 8.1 Syntax & Static Analysis
```powershell
node --check src/newtab/settings/settings-preferences.js
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
```

### 8.2 Unit Testing
```powershell
npm.cmd test
```
Verify that all unit tests in `tests/unit/settings-storage.test.mjs` pass cleanly with the new controller architecture.

### 8.3 Extension Build
```powershell
npm.cmd run build:chrome
```

### 8.4 Extended Functional & Integration Verification Tests

#### Test A: Settings Persistence Test
1. Load extension new tab in Chrome/CDP.
2. Open Settings modal via the dock button.
3. Change Background Dim slider from `0%` to `40%`.
4. Toggle Sidebar switch to off (`false`).
5. Change Time Format to `24-hour`.
6. Click "Save Settings".
7. Verify `HomebaseSettingsPreferences.state.backgroundDim === 40`.
8. Verify `HomebaseSettingsPreferences.state.showSidebar === false`.
9. Verify `localStorage['fast-bg-dim'] === '40'`.
10. Reload the extension / open a new tab instance.
11. Confirm all settings are restored from storage without regressions.

#### Test B: Cross-Tab Storage Synchronization Test
1. Simulate two open tab contexts (Tab A and Tab B).
2. Tab A executes `HomebaseSettingsPreferences.save({ backgroundDim: 55, showNews: true })`.
3. Trigger `browser.storage.onChanged` event in Tab B.
4. Verify Tab B invokes `HomebaseSettingsPreferences.handleStorageChange(changes, 'local')`.
5. Verify Tab B updates `HomebaseSettingsPreferences.state.backgroundDim` to `55`.
6. Verify Tab B applies CSS variable `--bg-dim-opacity` to `0.55`.
7. Verify Tab B updates `HomebaseSettingsPreferences.state.showNews` to `true` and updates widget visibility live.

#### Test C: Consumer Compatibility Test
Verify that the following external consumers continue to read and write preferences without error:
- `settings-ui.js`: Form population and saving.
- `visual-effects-runtime.js`: Background dim and glass effects.
- `cinema-mode-runtime.js`: Idle cinema mode toggle and listener reset.
- `search-interaction-controller.js` & `search-engine-settings.js`: Default engine and search new-tab behavior.
- `wallpaper-controller.js`: Battery optimization checks.
- `bookmark-grid-controller.js` & `bookmark-editor-adapter.js`: Fallback color and folder color preferences.

### 8.5 Protected Files Safety Check
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
```
Confirm 0 modifications.

---

## 9. Final Pre-Implementation Checklist

Before implementation begins, confirm that each prerequisite is completed:

- [x] Consumer scan completed across all `src/` modules.
- [x] Compatibility bridge inventory completed with verified access types.
- [x] Canonical state mapping finalized (clean domain naming).
- [x] Script dependency order verified (`bookmark-storage` -> `settings-preferences` -> `settings-ui` -> `visual-effects` -> `cinema-mode` -> `new-tab`).
- [x] Initialization flow verified with two-stage timing protection.
- [x] Static collision scanner protection confirmed.
- [x] Extended verification test suite defined.

---

## 10. Conclusion & Awaiting Approval

This revised implementation plan establishes a state-of-the-art controller architecture:
- Eliminates 33 loose global variables from `src/new-tab.js`.
- Implements `window.HomebaseSettingsPreferences` as the single authoritative owner of keys and state.
- Provides minimal, justified legacy bridges using property descriptors.
- Establishes two-stage initialization timing protection.
- **Zero source code modifications** were made in drafting this plan.

Awaiting explicit owner approval before commencing implementation.
