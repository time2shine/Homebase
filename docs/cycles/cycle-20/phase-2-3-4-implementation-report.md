# Cycle #20 — Legacy Bridge Reduction & Final Widget Architecture Cleanup
## Implementation Report (Phases 1–4)

---

### 1. Executive Summary

Cycle #20 completes the transition from legacy procedural globals to canonical `HomebaseWidget*` controllers across all dashboard widgets (`Time`, `Todo`, `Quote`, `News`, `Weather`). Unnecessary internal helper exports were safely pruned from the global window surface, all internal production callers migrated to canonical controller APIs with backward compatibility fallbacks, and static and dynamic test suites were implemented to enforce architecture boundaries going forward.

---

### 2. Architecture Changes & Subsystem Ownership

#### 2.1 Canonical Widget Controllers (`window.HomebaseWidget*`)
Each widget now exposes a complete domain API surface directly on its canonical controller:
- **`HomebaseWidgetTime`**:
  - Lifecycle: `initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`
  - Domain APIs: `update`, `updateTime`, `applyTimeFormatPreference`, `setTimeFormatPreference`
- **`HomebaseWidgetTodo`**:
  - Lifecycle: `initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`
  - Domain APIs: `setupTodoWidget`, `setPreference`, `setTodoPreference`, `handleStorageChange`, `handleTodoStorageChange`, `persistState`, `persistTodoState`, `loadState`, `loadTodoState`, `normalizeTodoItems`
- **`HomebaseWidgetQuote`**:
  - Lifecycle: `initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`
  - Domain APIs: `fetchQuote`, `readCachedQuoteState`, `renderCachedQuoteState`, `shouldLoadQuoteCatalog`, `ensureQuoteIndexBuilt`, `setupQuoteWidget`, `setPreference`, `setQuotePreference`, `openQuoteSettingsModal`, `closeQuoteSettingsModal`
- **`HomebaseWidgetNews`**:
  - Lifecycle: `initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`
  - Domain APIs: `fetchAndRenderNews`, `setupNewsWidget`, `setPreference`, `setNewsPreference`, `resolveNewsSourceId`, `getNewsSourceById`, `readFastNewsCache`, `NEWS_SOURCES`
- **`HomebaseWidgetWeather`**:
  - Lifecycle: `initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`, `refresh`
  - Domain APIs: `fetchWeather`, `updateWeatherUI`, `loadCachedWeather`, `getWeatherLocation`, `openWeatherSettingsModal`, `closeWeatherSettingsModal`, `searchForLocation`, `setupWeather`, `setPreference`, `setWeatherPreference`

---

### 3. Removed vs. Preserved Global Bridges

#### 3.1 Removed Unused Internal Globals (Category C — Pruned from Window)
Fourteen internal helpers that were previously exposed on `window`/`globalScope` with zero external production or test callers were cleanly pruned:
1. `window.getCurrentHourlyWeatherIndex`
2. `window.getHourlyValueAtIndex`
3. `window.normalizeWeatherDisplay`
4. `window.normalizeWeatherTimestamp`
5. `window.isWeatherCacheStale`
6. `window.getCachedWeatherTimestamp`
7. `window.hasUsableCachedWeather`
8. `window.getCachedWeatherDisplayOptions`
9. `window.markWeatherAsCachedOrStale`
10. `window.showWeatherOfflineNoCache`
11. `window.showWeatherSetupUI`
12. `window.hideWeatherSetupUI`
13. `window.showWeatherError`
14. `window.closeQuoteSettingsModal`

#### 3.2 Preserved Backward Compatibility Contracts (Category B — Retained on Window)
The following bridges remain on `window` to satisfy extension startup contracts, external callers, and existing unit tests:
- **Legacy Controller Aliases**: `HomebaseTimeWidgetController`, `HomebaseTodoWidgetController`, `HomebaseQuoteWidgetController`, `HomebaseNewsWidgetController`, `HomebaseWeatherWidgetController`
- **Startup Functions**: `setupTodoWidget`, `setupQuoteWidget`, `setupNewsWidget`, `setupWeather`
- **Settings & Preferences Bridges**: `updateTime`, `applyTimeFormatPreference`, `setTimeFormatPreference`, `setTodoPreference`, `setQuotePreference`, `setNewsPreference`, `setWeatherPreference`, `resolveNewsSourceId`, `openWeatherSettingsModal`, `openQuoteSettingsModal`
- **Storage & Hydration Bridges**: `fetchQuote`, `readCachedQuoteState`, `renderCachedQuoteState`, `shouldLoadQuoteCatalog`, `ensureQuoteIndexBuilt`, `loadCachedWeather`, `updateWeatherUI`, `fetchWeather`, `handleTodoStorageChange`, `normalizeTodoItems`, `persistTodoState`, `loadTodoState`, `fetchAndRenderNews`, `getNewsSourceById`, `readFastNewsCache`, `NEWS_SOURCES`
- **Test-Required Helpers**: `closeWeatherSettingsModal`, `startGeolocation`, `searchForLocation`, `getWeatherEmoji`, `getWeatherDescription`, `formatWeatherUpdated`, `getWeatherLocation`

---

### 4. Consumer Migrations (Phase 2)

All production consumers in `src/` were updated to prioritize canonical `HomebaseWidget*` methods with fallback chains:
- **`src/new-tab.js`**: Startup clock initialization prioritizes `window.HomebaseWidgetTime.initialize()`.
- **`src/newtab/core/startup-hydration.js`**:
  - `loadCachedWeatherSafe`: Uses `HomebaseWidgetWeather.loadCachedWeather()`.
  - `buildQuoteIndexSafe`: Uses `HomebaseWidgetQuote.readCachedQuoteState()`, `HomebaseWidgetQuote.shouldLoadQuoteCatalog()`, `HomebaseWidgetQuote.ensureQuoteIndexBuilt()`.
  - `setupQuoteWidgetSafe`: Prioritizes `HomebaseWidgetQuote.initialize()`.
  - `setupNewsWidgetSafe`: Prioritizes `HomebaseWidgetNews.initialize()`.
  - `setupTodoWidgetSafe`: Prioritizes `HomebaseWidgetTodo.initialize()`.
  - `setupWeatherSafe`: Prioritizes `HomebaseWidgetWeather.initialize()`.
  - `fetchQuoteSafe`: Uses `HomebaseWidgetQuote.readCachedQuoteState()`, `HomebaseWidgetQuote.shouldLoadQuoteCatalog()`, `HomebaseWidgetQuote.renderCachedQuoteState()`, `HomebaseWidgetQuote.fetchQuote()`.
- **`src/newtab/core/storage-dispatcher.js`**: Dispatches todo changes to `HomebaseWidgetTodo.handleStorageChange()`.
- **`src/newtab/settings/settings-form-controller.js`**: Prioritizes `HomebaseWidgetTime.applyTimeFormatPreference()`, `HomebaseWidgetWeather.setWeatherPreference()`, `HomebaseWidgetQuote.setQuotePreference()`, `HomebaseWidgetNews.setNewsPreference()`, `HomebaseWidgetTime.update()`, and modal opening methods.
- **`src/newtab/settings/settings-preferences.js`**: Prioritizes `HomebaseWidgetTime.applyTimeFormatPreference()`, `HomebaseWidgetTime.update()`, `HomebaseWidgetWeather.setWeatherPreference()`, `HomebaseWidgetQuote.setQuotePreference()`, `HomebaseWidgetNews.setNewsPreference()`, `HomebaseWidgetTodo.setTodoPreference()`, and `HomebaseWidgetNews.resolveNewsSourceId()`.
- **`src/newtab/settings/settings-storage.js`**: Prioritizes canonical `HomebaseWidget*` methods for applying preferences during storage initialization.

---

### 5. Verification & Test Suite Additions

1. **Static Invariant Enforcement (`scripts/check-newtab-static.mjs`)**:
   - Added `verifyCanonicalWidgetControllers()` checking:
     - All 5 canonical controllers (`HomebaseWidgetTime`, `HomebaseWidgetTodo`, `HomebaseWidgetQuote`, `HomebaseWidgetNews`, `HomebaseWidgetWeather`) are defined and exported.
     - All 5 widget controllers register with `HomebaseWidgetLifecycle.registerWidget()`.
     - Strict IIFE closure wrapping and strict mode enforcement.
     - 0 leaked top-level declarations across all widget files.
2. **Dedicated Unit Test Suite (`tests/unit/widget-legacy-bridge.test.mjs`)**:
   - Test 1: Canonical controllers exist on window and expose complete API surfaces (5/5).
   - Test 2: Legacy `Homebase*WidgetController` aliases mirror canonical controllers (5/5).
   - Test 3: Backward compatibility function bridges exist on window and delegate properly.
   - Test 4: Pruned dead helper globals are confirmed NOT exposed on window (14 pruned helpers verified).
   - Test 5: Consumer migration execution paths work (`HomebaseWidgetWeather.refresh()`, `HomebaseWidgetTime.update()`).

---

### 6. Full Verification Results

- `node --check`: PASS (0 errors across all modified files)
- `node scripts/check-newtab-static.mjs`: PASS (12/12 checks passing)
- `npm.cmd test`: PASS (506/506 unit tests passing across all 4 stages)
- `npm.cmd run build`: PASS (clean dual builds in `dist/chrome/` and `dist/firefox/`)
- `npx.cmd web-ext lint --source-dir dist/firefox`: PASS (0 errors, 0 warnings, 0 notices)
- `git diff src/preload.js src/instant_load.js manifests/ dist/`: PASS (0 changes to protected files)
