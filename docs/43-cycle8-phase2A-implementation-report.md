# Homebase Improvement Cycle #8 Phase 2A Implementation Report: Tier 1 Widget Storage Migration

**Date:** September 29, 2026  
**Cycle:** Cycle #8 — Phase 2A  
**Branch:** `development`  
**Status:** Implemented & Verified (Awaiting User Review / Pre-Commit State)

---

## 1. Overview & Objectives

In Phase 2A of Cycle #8, all Tier 1 sidebar widgets were migrated from direct `browser.storage.local` reads and writes to the hardened, validated storage facade `window.HomebaseStorage`.

### Core Goals:
1. **Route all Tier 1 widget storage I/O through `HomebaseStorage`**:
   - `HomebaseStorage.get(key, fallback)`
   - `HomebaseStorage.getMany(keys)`
   - `HomebaseStorage.set(key, value)`
   - `HomebaseStorage.setMany(items)`
   - `HomebaseStorage.remove(keys)`
2. **Defensive Fallback Preservation**:
   - If `HomebaseStorage` is undefined or unmounted, seamlessly fall back to `browser.storage.local` with zero regressions.
3. **Strict Behavioral & Contract Preservation**:
   - Unaltered storage keys, schema definitions, UI behaviors, DOM events, and async flows.
   - Synchronous `localStorage` fast-mirror updates (`fast-show-sidebar`, `fast-widget-order`, `fast-time-format`, `fast-show-todo`, `fast-show-quote`, `fast-show-news`, `fast-show-weather`) remain fully consistent with quota containment.
4. **Boundary Invariants**:
   - Zero modifications to `src/new-tab.js`, `src/preload.js`, `src/instant_load.js`, `manifests/*`, or `dist/*`.
   - Classic `<script defer>` architecture preserved without introducing ES modules, bundlers, or new npm dependencies.

---

## 2. Files Changed & Migration Details

### 2.1 `src/newtab/widgets/widget-visibility.js`
- **Functions Migrated:**
  - `applySidebarVisibility(show, options)`: Replaced direct `browser.storage.local.set({ [APP_SHOW_SIDEBAR_KEY]: shouldShow })` with `HomebaseStorage.set(APP_SHOW_SIDEBAR_KEY, shouldShow)`. Retained fallback to `browser.storage.local.set`.
  - `setWidgetOrderPreference(order, options)`: Replaced direct write with `HomebaseStorage.set(WIDGET_ORDER_KEY, nextOrder)`. Retained fallback to `browser.storage.local.set`.
  - `setupWidgetOrderSortable()`: In sortable `onEnd` handler, replaced direct `browser.storage.local.set({ [WIDGET_ORDER_KEY]: newOrder })` with `HomebaseStorage.set(WIDGET_ORDER_KEY, newOrder)`. Retained fallback to `browser.storage.local.set`.
- **Fast-mirror Integration**: Automatically updates `fast-show-sidebar` ('1'/'0') and `fast-widget-order` (JSON string) both directly and via `HomebaseStorage` fast-mirror sync.

### 2.2 `src/newtab/widgets/time.js`
- **Functions Migrated:**
  - Added dedicated `setTimeFormatPreference(format, options)` helper: Replaced uncentralized write points with `HomebaseStorage.set(APP_TIME_FORMAT_KEY, nextFormat)` and synchronous `fast-time-format` mirror write, with defensive fallback to `browser.storage.local.set`.
  - `applyTimeFormatPreference(format, options)`: Delegated to `setTimeFormatPreference()` for persistence and instant fast-mirror sync.
  - Exported `setTimeFormatPreference` to `window` for testability and settings parity.

### 2.3 `src/newtab/widgets/todo.js`
- **Functions Migrated:**
  - `persistTodoState()`: Migrated batch write of `TODO_ITEMS_KEY` and `TODO_HIDE_DONE_KEY` to `HomebaseStorage.setMany({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone })`. Retained fallback to `browser.storage.local.set`.
  - `loadTodoState()`: Migrated batch read to `HomebaseStorage.getMany([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY])` with schema-safe default parsing and item normalization (`normalizeTodoItems`). Retained fallback to `browser.storage.local.get`.
  - `setTodoPreference(show, options)`: Migrated preference write to `HomebaseStorage.set(APP_SHOW_TODO_KEY, shouldShow)` with fallback to `browser.storage.local.set`.

### 2.4 `src/newtab/widgets/quote.js`
- **Functions Migrated:**
  - `ensureQuoteIndexBuilt()`: Migrated cache index read to `HomebaseStorage.get(QUOTE_INDEX_KEY)` and write to `HomebaseStorage.set(QUOTE_INDEX_KEY, newIndex)` with fallback to `browser.storage.local`.
  - `fetchQuote(options)`: Migrated preference reads for `quoteTags` and `QUOTE_FREQUENCY_KEY` to `HomebaseStorage.getMany(['quoteTags', QUOTE_FREQUENCY_KEY])` with fallback.
  - `populateQuoteCategories()`: Migrated category tags read to `HomebaseStorage.get('quoteTags')` with fallback.
  - `openQuoteSettingsModal(triggerSource)`: Migrated frequency read to `HomebaseStorage.get(QUOTE_FREQUENCY_KEY, QUOTE_DEFAULT_FREQUENCY)` with fallback.
  - `setupQuoteWidget()`: Migrated settings save to `HomebaseStorage.setMany({ quoteTags: tagsToSave, [QUOTE_FREQUENCY_KEY]: frequency })` with fallback.
  - `setQuotePreference(show, options)`: Migrated visibility write to `HomebaseStorage.set(APP_SHOW_QUOTE_KEY, shouldShow)` with fallback.

### 2.5 `src/newtab/widgets/news.js`
- **Functions Migrated:**
  - `populateNewsSources()`: Migrated selected source read to `HomebaseStorage.get(NEWS_SOURCE_KEY, NEWS_DEFAULT_SOURCE)` with fallback.
  - `saveNewsSource(source)`: Migrated source persistence to `HomebaseStorage.set(NEWS_SOURCE_KEY, nextSource)` with fallback.
  - `setNewsPreference(show, options)`: Migrated visibility write to `HomebaseStorage.set(APP_SHOW_NEWS_KEY, shouldShow)` with fallback.

### 2.6 `src/newtab/widgets/weather.js`
- **Unified Storage Wrappers Introduced:**
  - `weatherStorageGet(keys)`: Asynchronously routes key lookups through `HomebaseStorage.get` / `HomebaseStorage.getMany`, falling back to `browser.storage.local.get`.
  - `weatherStorageSet(items)`: Asynchronously routes single or multi-key writes through `HomebaseStorage.set` / `HomebaseStorage.setMany`, falling back to `browser.storage.local.set`.
  - `weatherStorageRemove(keys)`: Asynchronously routes key removals through `HomebaseStorage.remove`, falling back to `browser.storage.local.remove`.
- **Call Sites Migrated (15 locations):**
  - `loadCachedWeatherState()`: Migrated cache read to `weatherStorageGet`.
  - `saveCachedWeatherState()`: Migrated cache write to `weatherStorageSet`.
  - `saveGeoLocation()`: Migrated coords write to `weatherStorageSet`.
  - `openWeatherSettingsModal()`: Migrated unit/location/provider reads to `weatherStorageGet`.
  - `saveWeatherSettings()`: Migrated settings update to `weatherStorageSet` and custom location removal to `weatherStorageRemove`.
  - `refreshWeather()` / `clearWeatherLocation()`: Migrated clear operations to `weatherStorageRemove`.
  - `setWeatherPreference(show, options)`: Migrated preference write to `HomebaseStorage.set(APP_SHOW_WEATHER_KEY, shouldShow)` with fallback.

---

## 3. Fallback Strategy

To ensure zero risk of regressions across Chrome and Firefox even if script load orders vary or `HomebaseStorage` is unmounted in isolated contexts:

```javascript
// Pattern for Single Set:
if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
  HomebaseStorage.set(KEY, value).catch((err) => {
    console.warn('Failed to save preference', err);
  });
} else if (browser && browser.storage && browser.storage.local) {
  browser.storage.local.set({ [KEY]: value }).catch((err) => {
    console.warn('Failed to save preference', err);
  });
}

// Pattern for Batch Read:
if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.getMany) {
  const stored = await HomebaseStorage.getMany([KEY_A, KEY_B]);
  // use stored
} else if (typeof browser !== 'undefined' && browser.storage?.local) {
  const stored = await browser.storage.local.get([KEY_A, KEY_B]);
  // use stored
}
```

Every migrated widget was verified in both:
1. Standard mode (`HomebaseStorage` active, validating and syncing mirrors).
2. Fallback mode (`HomebaseStorage` deleted, falling back cleanly to direct `browser.storage.local`).

---

## 4. Test Strategy & Results

A new dedicated test suite was created:  
`tests/unit/widget-storage.test.mjs` (13 tests)

### Test Coverage Breakdown:
1. `widget-visibility`:
   - `applySidebarVisibility` persists via `HomebaseStorage` and synchronizes `fast-show-sidebar` mirror.
   - `setWidgetOrderPreference` persists via `HomebaseStorage` and synchronizes `fast-widget-order` mirror.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.
2. `time`:
   - `setTimeFormatPreference` persists via `HomebaseStorage` and synchronizes `fast-time-format` mirror.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.
3. `todo`:
   - `persistTodoState` writes batch via `HomebaseStorage.setMany`.
   - `loadTodoState` reads batch via `HomebaseStorage.getMany`.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.
4. `quote`:
   - `ensureQuoteIndexBuilt` and `setQuotePreference` persist via `HomebaseStorage`.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.
5. `news`:
   - `setNewsPreference` persists via `HomebaseStorage` and synchronizes `fast-show-news` mirror.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.
6. `weather`:
   - `setWeatherPreference` and cache operations persist via `HomebaseStorage`.
   - `weatherStorageSet`, `weatherStorageGet`, `weatherStorageRemove` verified.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.

### Full Test Suite Results (`npm.cmd test`):
- **Stage 1 Syntax Validation (`node --check`):** PASS (2.29s) across all 41 source scripts.
- **Stage 2 Static Invariants (`check-newtab-static.mjs`):** PASS (0.21s) — all 41 deferred scripts and 87 declarations intact.
- **Stage 3 Unit Tests (`node:test`):** PASS (1.18s) — **155/155 tests passing** (up from 142 baseline, +13 new widget tests).
- **Stage 4 Browser Smoke Test:** PASS (0.06s).

---

## 5. Invariant Verification

| Invariant | Status | Verification Detail |
| :--- | :---: | :--- |
| `src/new-tab.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `src/preload.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `src/instant_load.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `manifests/*` unmodified | **PASSED** | Chrome and Firefox manifests intact. |
| `dist/*` not staged | **PASSED** | Dual-browser build verified clean (`dist/chrome` and `dist/firefox`). |
| Storage keys unchanged | **PASSED** | `appShowSidebar`, `widgetOrder`, `appTimeFormatPreference`, `appShowTodo`, `todoItems`, `todoHideDone`, `appShowQuote`, `quoteTags`, `quoteFrequency`, `appShowNews`, `newsSource`, `appShowWeather`, `cachedWeather*` preserved. |
| Fast mirror sync intact | **PASSED** | `fast-show-sidebar`, `fast-widget-order`, `fast-time-format`, `fast-show-todo`, `fast-show-quote`, `fast-show-news`, `fast-show-weather` confirmed in unit tests. |
| No ES modules / bundlers | **PASSED** | All scripts remain classic defer scripts. |

---

## 6. Pre-Commit Review Summary

- **Modified Files (6):**
  - `src/newtab/widgets/widget-visibility.js`
  - `src/newtab/widgets/time.js`
  - `src/newtab/widgets/todo.js`
  - `src/newtab/widgets/quote.js`
  - `src/newtab/widgets/news.js`
  - `src/newtab/widgets/weather.js`
- **Untracked Documentation & Test Files (2):**
  - `docs/42-cycle8-phase2-plan.md`
  - `docs/43-cycle8-phase2A-implementation-report.md`
  - `tests/unit/widget-storage.test.mjs`
- **Working Tree State:** Clean pre-commit state ready for staging.
