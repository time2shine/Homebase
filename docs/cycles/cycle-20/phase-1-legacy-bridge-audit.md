# Cycle #20 Phase 1 — Legacy Global Bridge & Widget Architecture Audit

## 1. Overview & Objectives

Following Cycle #19 (full widget controller encapsulation into `HomebaseWidget*`), all five dashboard widgets (`Time`, `Todo`, `Quote`, `News`, and `Weather`) now operate inside strict IIFE closures. However, multiple backward compatibility bridges, legacy controller aliases (`Homebase*WidgetController`), and procedural helper functions still exist on `window` / `globalScope`.

The goal of Cycle #20 is to:
1. Catalog every remaining widget-related global export and compatibility bridge.
2. Identify all internal and external callers across production code and test suites.
3. Categorize each bridge as **Migratable & Retainable (Contract)**, **Migratable & Prunable (Internal Only)**, or **Dead Code (Removable)**.
4. Establish the migration strategy for transitioning consumers from procedural globals to canonical `HomebaseWidget*` methods.

---

## 2. Comprehensive Inventory of Remaining Widget Globals

### 2.1 Time Widget Subsystem (`src/newtab/widgets/time.js`)

| Exported Symbol | Type | Current Callers (Production) | Current Callers (Tests) | Status & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `HomebaseWidgetTime` | Canonical Controller | `time.js` | `time-todo-encapsulation.test.mjs` | **Canonical** — Keep and expand with domain methods. |
| `HomebaseTimeWidgetController` | Legacy Alias | `src/new-tab.js` | `widget-controller-lifecycle.test.mjs`, `widget-visibility-lifecycle.test.mjs`, `time-todo-encapsulation.test.mjs` | **Required Bridge** — Keep as alias to `HomebaseWidgetTime` for startup and test suite contracts. |
| `updateTime` | Function Bridge | `src/new-tab.js` (fallback), `settings-form-controller.js:308`, `settings-preferences.js:441` | `time-todo-encapsulation.test.mjs` | **Migratable Bridge** — Migrate callers to `HomebaseWidgetTime.update()`; keep bridge function on `window` for test/legacy fallback. |
| `applyTimeFormatPreference` | Function Bridge | `settings-form-controller.js:238`, `settings-preferences.js:438, 615`, `settings-storage.js:258` | `settings-storage.test.mjs`, `widget-consumers-storage.test.mjs`, `time-todo-encapsulation.test.mjs` | **Migratable Bridge** — Expose `HomebaseWidgetTime.applyTimeFormatPreference()`; migrate settings callers; keep bridge for backwards compatibility. |
| `setTimeFormatPreference` | Function Bridge | None in `src/` | `time-todo-encapsulation.test.mjs` | **Unused Bridge** — Alias on `HomebaseWidgetTime`; keep window bridge for tests or prune if tests migrate. |
| `initializeTime` | Legacy Target | None in `src/` | None in `tests/` | **Dead Target** — Replaced by `HomebaseWidgetTime.initialize()`. |

---

### 2.2 Todo Widget Subsystem (`src/newtab/widgets/todo.js`)

| Exported Symbol | Type | Current Callers (Production) | Current Callers (Tests) | Status & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `HomebaseWidgetTodo` | Canonical Controller | `todo.js` | `time-todo-encapsulation.test.mjs` | **Canonical** — Keep and expand with domain methods. |
| `HomebaseTodoWidgetController` | Legacy Alias | `src/newtab/core/startup-hydration.js:143` | `widget-controller-lifecycle.test.mjs`, `time-todo-encapsulation.test.mjs` | **Required Bridge** — Keep as alias for startup and lifecycle tests. |
| `setupTodoWidget` | Function Bridge | `startup-hydration.js:145`, `perf-report.js` (label only) | `time-todo-encapsulation.test.mjs` | **Migratable Bridge** — Migrate `startup-hydration.js` to `HomebaseWidgetTodo.initialize()`. Keep bridge on `window`. |
| `setTodoPreference` | Function Bridge | `settings-preferences.js:164, 510`, `settings-storage.js:302` | `settings-storage.test.mjs`, `time-todo-encapsulation.test.mjs` | **Migratable Bridge** — Add `HomebaseWidgetTodo.setPreference()`; migrate settings callers; keep bridge. |
| `handleTodoStorageChange` | Function Bridge | `src/newtab/core/storage-dispatcher.js:63` | `storage-dispatcher.test.mjs`, `time-todo-encapsulation.test.mjs` | **Migratable Bridge** — Add `HomebaseWidgetTodo.handleStorageChange()`; migrate `storage-dispatcher.js`; keep bridge. |
| `normalizeTodoItems` | Utility Bridge | `src/newtab/core/schema-validator.js:114`, `src/newtab/settings/backup-import.js:95` | `backup-validation.test.mjs`, `time-todo-encapsulation.test.mjs` | **Required Shared Util** — Already exported on `HomebaseWidgetTodo.normalizeTodoItems`. Keep window bridge for schema validator / backup importer. |
| `persistTodoState` | Function Bridge | None in `src/` | `widget-consumers-storage.test.mjs`, `time-todo-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetTodo.persistState()`; keep bridge for test suites. |
| `loadTodoState` | Function Bridge | None in `src/` | `widget-consumers-storage.test.mjs`, `time-todo-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetTodo.loadState()`; keep bridge for test suites. |
| `appShowTodoPreference` | Global Flag | `settings-preferences.js`, `settings-storage.js`, `widget-visibility.js` | `widget-visibility-lifecycle.test.mjs` | **Global State Mirror** — Required for synchronous pre-render visibility checks. |

---

### 2.3 Quote Widget Subsystem (`src/newtab/widgets/quote.js`)

| Exported Symbol | Type | Current Callers (Production) | Current Callers (Tests) | Status & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `HomebaseWidgetQuote` | Canonical Controller | `startup-hydration.js`, `quote.js` | `quote-news-encapsulation.test.mjs` | **Canonical** — Keep as canonical owner. |
| `HomebaseQuoteWidgetController` | Legacy Alias | `startup-hydration.js:99` | `widget-controller-lifecycle.test.mjs`, `quote-news-encapsulation.test.mjs` | **Required Bridge** — Keep as alias for startup and lifecycle tests. |
| `setupQuoteWidget` | Function Bridge | `startup-hydration.js:101`, `perf-report.js` (label only) | `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Migrate `startup-hydration.js` to `HomebaseWidgetQuote.initialize()`. Keep bridge on `window`. |
| `setQuotePreference` | Function Bridge | `settings-form-controller.js:240, 471`, `settings-preferences.js:492`, `settings-storage.js:296` | `settings-storage.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Add `HomebaseWidgetQuote.setPreference()`; migrate settings callers; keep bridge on `window`. |
| `fetchQuote` | Function Bridge | `startup-hydration.js:262` | `widget-controller-lifecycle.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetQuote.fetchQuote`. Migrate `startup-hydration.js`; keep bridge on `window`. |
| `readCachedQuoteState` | Function Bridge | `startup-hydration.js:50, 240` | `widget-consumers-storage.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetQuote.readCachedQuoteState`. Migrate `startup-hydration.js`; keep bridge. |
| `renderCachedQuoteState` | Function Bridge | `startup-hydration.js:254` | `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetQuote.renderCachedQuoteState`. Migrate `startup-hydration.js`; keep bridge. |
| `shouldLoadQuoteCatalog` | Function Bridge | `startup-hydration.js:57, 247` | `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetQuote.shouldLoadQuoteCatalog`. Migrate `startup-hydration.js`; keep bridge. |
| `ensureQuoteIndexBuilt` | Function Bridge | `startup-hydration.js:71` | `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetQuote.ensureQuoteIndexBuilt`. Migrate `startup-hydration.js`; keep bridge. |
| `openQuoteSettingsModal` | Function Bridge | `settings-form-controller.js:541` | None | **Migratable Bridge** — Add `HomebaseWidgetQuote.openQuoteSettingsModal()`; migrate settings; keep bridge. |
| `closeQuoteSettingsModal` | Function Bridge | None in `src/` | None in `tests/` | **Prunable Bridge** — Only invoked internally from quote settings close button. Safe to remove from global window. |
| `appShowQuotePreference` | Global Flag | `settings-preferences.js`, `settings-storage.js`, `widget-visibility.js` | Settings tests | **Global State Mirror** — Required for synchronous pre-render visibility checks. |

---

### 2.4 News Widget Subsystem (`src/newtab/widgets/news.js`)

| Exported Symbol | Type | Current Callers (Production) | Current Callers (Tests) | Status & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `HomebaseWidgetNews` | Canonical Controller | `news.js` | `quote-news-encapsulation.test.mjs` | **Canonical** — Keep as canonical owner. |
| `HomebaseNewsWidgetController` | Legacy Alias | `startup-hydration.js:121` | `widget-controller-lifecycle.test.mjs`, `widget-visibility-lifecycle.test.mjs`, `quote-news-encapsulation.test.mjs` | **Required Bridge** — Keep as alias for startup and tests. |
| `setupNewsWidget` | Function Bridge | `startup-hydration.js:123`, `perf-report.js` (label only) | `backup-roundtrip.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Migrate `startup-hydration.js` to `HomebaseWidgetNews.initialize()`. Keep bridge on `window`. |
| `setNewsPreference` | Function Bridge | `settings-form-controller.js:241, 479`, `settings-preferences.js:501`, `settings-storage.js:299` | `settings-storage.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Add `HomebaseWidgetNews.setPreference()`; migrate settings; keep bridge. |
| `resolveNewsSourceId` | Utility Bridge | `settings-preferences.js:516`, `settings-storage.js:275` | `settings-storage.test.mjs`, `quote-news-encapsulation.test.mjs` | **Migratable Bridge** — Expose on `HomebaseWidgetNews.resolveNewsSourceId()`; migrate settings; keep bridge. |
| `fetchAndRenderNews` | Function Bridge | None in `src/` | `backup-roundtrip.test.mjs`, `quote-news-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetNews.fetchAndRenderNews()`; keep bridge for test suites. |
| `getNewsSourceById` | Utility Bridge | None in `src/` | `quote-news-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetNews.getNewsSourceById()`; keep bridge for test suites. |
| `readFastNewsCache` | Function Bridge | None in `src/` | `widget-consumers-storage.test.mjs`, `quote-news-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetNews.readFastNewsCache()`; keep bridge for test suites. |
| `NEWS_SOURCES` | Constant Bridge | None in `src/` | `quote-news-encapsulation.test.mjs` | **Test-Only Bridge** — Expose on `HomebaseWidgetNews.NEWS_SOURCES`; keep bridge for test suites. |
| `appNewsSourcePreference` | Global Flag | `settings-preferences.js`, `settings-storage.js` | Settings tests | **Global State Mirror** — Required for synchronous news source checks. |
| `appShowNewsPreference` | Global Flag | `settings-preferences.js`, `settings-storage.js`, `widget-visibility.js` | Settings tests | **Global State Mirror** — Required for synchronous pre-render visibility checks. |

---

### 2.5 Weather Widget Subsystem (`src/newtab/widgets/weather.js`)

| Exported Symbol | Type | Current Callers (Production) | Current Callers (Tests) | Status & Classification |
| :--- | :--- | :--- | :--- | :--- |
| `HomebaseWidgetWeather` | Canonical Controller | `weather.js` | `weather-encapsulation.test.mjs` | **Canonical** — Keep as canonical owner. |
| `HomebaseWeatherWidgetController` | Legacy Alias | `startup-hydration.js:192` | `widget-controller-lifecycle.test.mjs`, `widget-visibility-lifecycle.test.mjs`, `weather-encapsulation.test.mjs` | **Required Bridge** — Keep as alias for startup and tests. |
| `setupWeather` | Function Bridge | `startup-hydration.js:194`, `perf-report.js` (label only) | `weather-encapsulation.test.mjs` | **Migratable Bridge** — Migrate `startup-hydration.js` to `HomebaseWidgetWeather.initialize()`. Keep bridge on `window`. |
| `setWeatherPreference` | Function Bridge | `settings-form-controller.js:239, 463`, `settings-preferences.js:483`, `settings-storage.js:293` | `settings-storage.test.mjs`, `weather-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetWeather.setWeatherPreference`. Migrate settings; keep bridge. |
| `loadCachedWeather` | Function Bridge | `startup-hydration.js:32` | `widget-consumers-storage.test.mjs`, `weather-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetWeather.loadCachedWeather`. Migrate `startup-hydration.js`; keep bridge. |
| `openWeatherSettingsModal` | Function Bridge | `settings-form-controller.js:532` | `weather-encapsulation.test.mjs` | **Migratable Bridge** — Already on `HomebaseWidgetWeather.openWeatherSettingsModal`. Migrate settings; keep bridge. |
| `fetchWeather` | Function Bridge | None in `src/` | `weather-encapsulation.test.mjs` | **Test-Only Bridge** — Already on `HomebaseWidgetWeather.fetchWeather`. Keep bridge on `window` for test suite. |
| `updateWeatherUI` | Function Bridge | None in `src/` | `widget-consumers-storage.test.mjs`, `weather-encapsulation.test.mjs` | **Test-Only Bridge** — Already on `HomebaseWidgetWeather.updateWeatherUI`. Keep bridge on `window` for test suite. |
| `getWeatherLocation` | Function Bridge | None in `src/` | `weather-encapsulation.test.mjs` | **Test-Only Bridge** — Already on `HomebaseWidgetWeather.getWeatherLocation`. Keep bridge on `window` for test suite. |
| `closeWeatherSettingsModal` | Function Bridge | None in `src/` | `weather-encapsulation.test.mjs` | **Prunable Bridge** — Internal modal teardown; keep only on `HomebaseWidgetWeather`. |
| `startGeolocation` | Internal Helper | None in `src/` | None in `tests/` | **Prunable Bridge** — Unused outside weather closure. Remove from `window`. |
| `searchForLocation` | Internal Helper | None in `src/` | `weather-encapsulation.test.mjs` (in-flight abort test) | **Bridge to Canonical** — Expose on `HomebaseWidgetWeather.searchForLocation` and migrate test. |
| `getWeatherEmoji` | Internal Helper | None in `src/` (Renderer has local copy) | None | **Prunable Bridge** — Provided canonically by `HomebaseWeatherCardRenderer.getWeatherEmoji`. Remove from `window`. |
| `getWeatherDescription` | Internal Helper | None in `src/` (Renderer has local copy) | None | **Prunable Bridge** — Provided canonically by `HomebaseWeatherCardRenderer.getWeatherDescription`. Remove from `window`. |
| `formatWeatherUpdated` | Internal Helper | None in `src/` (Renderer has local copy) | None | **Prunable Bridge** — Provided canonically by `HomebaseWeatherCardRenderer.formatWeatherUpdated`. Remove from `window`. |
| `getCurrentHourlyWeatherIndex` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `getHourlyValueAtIndex` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `normalizeWeatherDisplay` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Provided canonically by `HomebaseWeatherCardRenderer.normalizeWeatherDisplay`. Remove from `window`. |
| `normalizeWeatherTimestamp` | Internal Helper | None in `src/` (`instant_load.js` has local copy) | None | **Prunable Bridge** — Remove from `window`. |
| `isWeatherCacheStale` | Internal Helper | None in `src/` (`instant_load.js` has local copy) | None | **Prunable Bridge** — Remove from `window`. |
| `getCachedWeatherTimestamp` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `hasUsableCachedWeather` | Internal Helper | None in `src/` (`instant_load.js` has local copy) | None | **Prunable Bridge** — Remove from `window`. |
| `getCachedWeatherDisplayOptions` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `markWeatherAsCachedOrStale` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `showWeatherOfflineNoCache` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `showWeatherSetupUI` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `hideWeatherSetupUI` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `showWeatherError` | Internal Helper | None in `src/` | None | **Prunable Bridge** — Remove from `window`. |
| `appShowWeatherPreference` | Global Flag | `settings-preferences.js`, `settings-storage.js`, `widget-visibility.js` | Settings tests | **Global State Mirror** — Required for synchronous pre-render visibility checks. |

---

## 3. Findings & Categorization

### 3.1 Category A: Canonical Controllers (Keep & Enhance)
These represent the canonical subsystem ownership and are the target destinations for all consumer calls:
1. `window.HomebaseWidgetTime` (add `update`, `applyTimeFormatPreference`)
2. `window.HomebaseWidgetTodo` (add `setPreference`, `handleStorageChange`, `loadState`, `persistState`)
3. `window.HomebaseWidgetQuote` (add `setPreference`, `openQuoteSettingsModal`)
4. `window.HomebaseWidgetNews` (add `fetchAndRenderNews`, `setPreference`, `resolveNewsSourceId`, `getNewsSourceById`, `readFastNewsCache`, `NEWS_SOURCES`)
5. `window.HomebaseWidgetWeather` (add `searchForLocation`, `refresh: resume`)

### 3.2 Category B: Required Backward Compatibility Bridges (Retain on window)
These are called by external code, settings panels, or established test contracts and must continue to exist as thin delegating functions:
- Legacy controller aliases: `HomebaseTimeWidgetController`, `HomebaseTodoWidgetController`, `HomebaseQuoteWidgetController`, `HomebaseNewsWidgetController`, `HomebaseWeatherWidgetController`
- Startup triggers: `setupTodoWidget`, `setupQuoteWidget`, `setupNewsWidget`, `setupWeather`
- Settings preferences bridges: `applyTimeFormatPreference`, `updateTime`, `setTodoPreference`, `setQuotePreference`, `setNewsPreference`, `setWeatherPreference`, `openWeatherSettingsModal`, `openQuoteSettingsModal`, `resolveNewsSourceId`
- Storage & backup bridges: `handleTodoStorageChange`, `normalizeTodoItems`, `fetchAndRenderNews`, `persistTodoState`, `loadTodoState`
- Hydration & cache query bridges: `fetchQuote`, `readCachedQuoteState`, `renderCachedQuoteState`, `shouldLoadQuoteCatalog`, `ensureQuoteIndexBuilt`, `loadCachedWeather`, `updateWeatherUI`, `fetchWeather`

### 3.3 Category C: Dead Internal Helpers (Prune from window)
These are internal helper functions inside widget modules that have no external consumers in `src/` or `tests/`:
- In `weather.js`:
  - `startGeolocation`
  - `getWeatherEmoji` (provided by `HomebaseWeatherCardRenderer`)
  - `getWeatherDescription` (provided by `HomebaseWeatherCardRenderer`)
  - `formatWeatherUpdated` (provided by `HomebaseWeatherCardRenderer`)
  - `getCurrentHourlyWeatherIndex`
  - `getHourlyValueAtIndex`
  - `normalizeWeatherDisplay` (provided by `HomebaseWeatherCardRenderer`)
  - `normalizeWeatherTimestamp`
  - `isWeatherCacheStale`
  - `getCachedWeatherTimestamp`
  - `hasUsableCachedWeather`
  - `getCachedWeatherDisplayOptions`
  - `markWeatherAsCachedOrStale`
  - `showWeatherOfflineNoCache`
  - `showWeatherSetupUI`
  - `hideWeatherSetupUI`
  - `showWeatherError`
  - `closeWeatherSettingsModal`
- In `quote.js`:
  - `closeQuoteSettingsModal`
- In `time.js`:
  - `initializeTime` (dead identifier, not defined or used)

---

## 4. Migration Strategy

### Phase 2: Consumer Migration
1. **`src/new-tab.js`**:
   - Migrate startup clock trigger from `updateTime()` to `window.HomebaseWidgetTime?.initialize()` / `window.HomebaseWidgetTime?.update()`.
2. **`src/newtab/core/startup-hydration.js`**:
   - In `loadCachedWeatherSafe`: call `HomebaseWidgetWeather.loadCachedWeather()`.
   - In `setupWeatherSafe`: call `HomebaseWidgetWeather.initialize()`.
   - In `setupQuoteWidgetSafe`: call `HomebaseWidgetQuote.initialize()`.
   - In `setupNewsWidgetSafe`: call `HomebaseWidgetNews.initialize()`.
   - In `setupTodoWidgetSafe`: call `HomebaseWidgetTodo.initialize()`.
   - In `fetchQuoteSafe` and `buildQuoteIndexSafe`: call `HomebaseWidgetQuote.*`.
3. **`src/newtab/settings/settings-form-controller.js`**:
   - Prioritize `HomebaseWidgetTime.*`, `HomebaseWidgetWeather.*`, `HomebaseWidgetQuote.*`, `HomebaseWidgetNews.*` before global fallback.
4. **`src/newtab/core/storage-dispatcher.js`**:
   - Prioritize `HomebaseWidgetTodo.handleStorageChange()` before `handleTodoStorageChange()`.

### Phase 3: Bridge Reduction
1. In `src/newtab/widgets/weather.js`: Remove the 18 dead internal helper exports from `globalScope` and `window`. Keep only `HomebaseWidgetWeather`, `HomebaseWeatherWidgetController`, `setupWeather`, `setWeatherPreference`, `loadCachedWeather`, `fetchWeather`, `updateWeatherUI`, `getWeatherLocation`, `openWeatherSettingsModal`.
2. In `src/newtab/widgets/quote.js`: Remove `closeQuoteSettingsModal` from window.
3. Keep all required Category B bridges intact as thin delegation bridges on `window` to prevent regressions.

### Phase 4: Static Verification & Tests
1. Update `scripts/check-newtab-static.mjs` to ensure canonical controllers exist and zero collisions exist.
2. Create `tests/unit/widget-legacy-bridge.test.mjs` verifying that:
   - Canonical `HomebaseWidget*` controllers export all primary and domain methods.
   - Consumers can call canonical controller methods directly.
   - Legacy bridges continue to delegate accurately to the canonical controllers.
   - Removed internal dead helpers no longer pollute `window`.
