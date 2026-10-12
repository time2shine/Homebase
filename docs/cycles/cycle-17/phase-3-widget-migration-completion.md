# Cycle #17 Phase 3 — Widget Consumers Storage Migration Completion Report

## 1. Executive Summary
In Cycle #17 Phase 3, all 6 widget consumer modules were migrated to use the canonical `HomebaseWidgetStorage` service (`window.HomebaseWidgetStorage`):
1. `src/newtab/widgets/widget-visibility.js`
2. `src/newtab/widgets/time.js`
3. `src/newtab/widgets/todo.js`
4. `src/newtab/widgets/quote.js`
5. `src/newtab/widgets/weather.js`
6. `src/newtab/widgets/news.js`

Direct calls to `localStorage` for fast pre-hydration mirrors and direct fallback chains to `browser.storage.local` across individual widget files were replaced with delegated calls to `HomebaseWidgetStorage`. All storage schemas, fast-mirror keys, and backward compatibility with `src/instant_load.js` were preserved with zero regressions.

---

## 2. Migrated Modules & Ownership Delegation

### 2.1 `src/newtab/widgets/widget-visibility.js`
- **Replaced**:
  - Direct `localStorage.setItem('fast-show-sidebar', ...)` and `HomebaseStorage.set(APP_SHOW_SIDEBAR_KEY, ...)` / `browser.storage.local.set`.
  - Direct `writeFastWidgetOrderMirror` and `HomebaseStorage.set(WIDGET_ORDER_KEY, ...)` / `browser.storage.local.set`.
- **Delegated To**:
  - `HomebaseWidgetStorage.setSidebarVisibility(visible)`
  - `HomebaseWidgetStorage.setWidgetOrder(order)`

### 2.2 `src/newtab/widgets/time.js`
- **Replaced**:
  - Direct `localStorage.setItem('fast-time-format', ...)` and `HomebaseStorage.set('appTimeFormatPreference', ...)` / `browser.storage.local.set`.
- **Delegated To**:
  - `HomebaseWidgetStorage.setTimeFormat(format)`

### 2.3 `src/newtab/widgets/todo.js`
- **Replaced**:
  - Direct `HomebaseStorage.setMany` / `browser.storage.local.set` of `todoItems` and `todoHideDone`.
  - Direct `HomebaseStorage.getMany` / `browser.storage.local.get` during state loading.
- **Delegated To**:
  - `HomebaseWidgetStorage.getTodoState()`
  - `HomebaseWidgetStorage.setTodoState({ items, hideDone })`

### 2.4 `src/newtab/widgets/quote.js`
- **Replaced**:
  - Direct `localStorage.getItem('fast-quote-state')` in `readCachedQuoteState`.
  - Direct `HomebaseStorage.get(QUOTE_INDEX_KEY)` / `browser.storage.local.get` in `loadQuoteIndex`.
  - Direct `HomebaseStorage.set(QUOTE_INDEX_KEY)` / `browser.storage.local.set` in `persistQuoteIndex`.
  - Direct `localStorage.setItem('fast-quote-state', ...)` in `fetchFreshQuote` and fallback caching.
  - Direct `HomebaseStorage.setMany` / `browser.storage.local.set` in `saveQuoteSettings`.
- **Delegated To**:
  - `HomebaseWidgetStorage.getFastMirror('fast-quote-v2')` / `getFastMirror('fast-quote-state')`
  - `HomebaseWidgetStorage.getQuoteCache()`
  - `HomebaseWidgetStorage.setQuoteCache({ index, tags, frequency, current, next, config })`

### 2.5 `src/newtab/widgets/weather.js`
- **Replaced**:
  - Direct `weatherStorageGet(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt'])` in `loadCachedWeather` and error fallbacks.
  - Direct `weatherStorageSet` + `localStorage.setItem('fast-weather', ...)` in `updateWeatherUI`.
- **Delegated To**:
  - `HomebaseWidgetStorage.getWeatherCache()`
  - `HomebaseWidgetStorage.setWeatherCache({ data, cityName, units, fetchedAt, fastWeather })`

### 2.6 `src/newtab/widgets/news.js`
- **Replaced**:
  - Direct `localStorage.getItem('fast-news')` in `readFastNewsCache`.
  - Direct `localStorage.setItem('fast-news', ...)` in `fetchAndRenderNews`.
  - Direct `HomebaseStorage.set(APP_NEWS_SOURCE_KEY)` / `browser.storage.local.set` + `localStorage.removeItem('fast-news')` in settings save.
- **Delegated To**:
  - `HomebaseWidgetStorage.getFastMirror('fast-news-v2')` / `getFastMirror('fast-news')`
  - `HomebaseWidgetStorage.setNewsCache({ source, items, fetchedAt })`

---

## 3. Storage Ownership & De-duplication Summary

Before Phase 3, widget persistence was fragmented across 6 different modules, with each module implementing its own inconsistent fallback sequence:
```text
[widget] -> try HomebaseStorage -> catch -> try browser.storage.local -> try localStorage mirror
```

Now, all 6 modules route through `HomebaseWidgetStorage`:
```text
┌────────────────────────────────────────────────────────┐
│               Widgets Subsystem (Phase 3)              │
├────────────────────────────────────────────────────────┤
│  widget-visibility.js ──┐                              │
│  time.js              ──┤                              │
│  todo.js              ──┼──> HomebaseWidgetStorage     │
│  quote.js             ──┤     ├── HomebaseStorage      │
│  weather.js           ──┤     ├── browser.storage.local│
│  news.js              ──┘     └── localStorage mirrors │
└────────────────────────────────────────────────────────┘
```

Defensive in-line fallbacks were retained in the consumer modules only as guards in the unlikely event `HomebaseWidgetStorage` is unavailable, ensuring maximum runtime resilience.

---

## 4. Test Count & Verification Summary

### Test Suite Changes
- **Previous unit tests**: 415 tests across 38 suites.
- **New test suite added**: `tests/unit/widget-consumers-storage.test.mjs` (+10 unit tests).
- **Current unit tests**: **425 tests** across 39 suites (100% passing).

### Verification Results
1. **Syntax Check (`node --check`)**:
   - `src/newtab/widgets/widget-visibility.js`: Clean (0 errors).
   - `src/newtab/widgets/time.js`: Clean (0 errors).
   - `src/newtab/widgets/todo.js`: Clean (0 errors).
   - `src/newtab/widgets/quote.js`: Clean (0 errors).
   - `src/newtab/widgets/weather.js`: Clean (0 errors).
   - `src/newtab/widgets/news.js`: Clean (0 errors).
   - `src/newtab/widgets/widget-storage.js`: Clean (0 errors).
   - `tests/unit/widget-consumers-storage.test.mjs`: Clean (0 errors).
2. **Static Check (`node scripts/check-newtab-static.mjs`)**:
   - 69 deferred scripts verified.
   - 54 extracted module paths verified.
   - 813 unique top-level declarations verified.
   - 0 declaration collisions.
3. **Automated Test Suite (`npm.cmd test`)**:
   - Stage 1: Syntax Validation - PASS
   - Stage 2: Static Invariants - PASS
   - Stage 3: Unit Tests (`node:test`) - 425/425 passed (0 failed, 0 skipped)
   - Stage 4: Headless Browser Smoke Test - PASS
4. **Production Dual Build (`npm.cmd run build`)**:
   - `dist/chrome`: Built successfully.
   - `dist/firefox`: Built successfully.
5. **Protected Files Invariant (`git diff src/preload.js src/instant_load.js manifests/ dist/`)**:
   - Zero diff (completely clean).

---

## 5. Remaining Work: Widget Renderer Extraction (Phase 4)

With storage ownership completely consolidated under `HomebaseWidgetStorage`, the widgets subsystem is prepared for renderer extraction:
1. **`weather.js` (1,143 lines)**:
   - Contains extensive inline DOM construction: forecast scroll strips, weather metric cards, hourly graphs, and SVG icons.
   - Extract presentation logic into `src/newtab/widgets/weather-card-renderer.js`.
2. **`news.js` (816 lines)**:
   - Contains headline rendering, source tags, image hydration, and skeleton previews.
   - Extract presentation logic into `src/newtab/widgets/news-card-renderer.js`.
3. **`quote.js` (930 lines)**:
   - Contains quote card layout, author attribution, and category filter modals.
   - Extract presentation logic into `src/newtab/widgets/quote-card-renderer.js`.
