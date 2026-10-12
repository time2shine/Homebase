# Cycle #17 Phase 2 — Widget Storage Completion Report

## 1. Executive Summary
In Cycle #17 Phase 2, the canonical widget persistence service `HomebaseWidgetStorage` was created and integrated into the Homebase architecture.

This service establishes a single canonical owner for all widget storage operations, handling:
- Unified read and write access across primary storage (`HomebaseStorage`) and fallback storage (`browser.storage.local` / `chrome.storage.local`).
- Synchronous fast-mirror caching to `localStorage` for instant pre-hydration (`fast-widget-order`, `fast-show-sidebar`, `fast-time-format`, `fast-weather-v2`, `fast-quote-v2`, `fast-news-v2`).
- Dual-write legacy mirror replication for `fast-weather`, `fast-quote-state`, and `fast-news` to maintain 100% compatibility with synchronous hydrator `src/instant_load.js`.
- Defensive sanitization and schema recovery for malformed or corrupted values.

Existing widget modules were intentionally **not modified** during this phase, ensuring zero runtime risk while introducing the foundational service and test suite.

---

## 2. Artifacts & Changes Created

### 2.1 New Source Module
- **File**: `src/newtab/widgets/widget-storage.js`
- **Pattern**: Standard IIFE attaching `window.HomebaseWidgetStorage`.
- **Exported API**:
  - `getWidgetOrder()`, `setWidgetOrder(order)`
  - `getSidebarVisibility()`, `setSidebarVisibility(visible)`
  - `getTimeFormat()`, `setTimeFormat(format)`
  - `getWeatherCache()`, `setWeatherCache(cacheData)`
  - `getQuoteCache()`, `setQuoteCache(cacheData)`
  - `getNewsCache()`, `setNewsCache(cacheData)`
  - `getTodoState()`, `setTodoState(todos)`

### 2.2 New Test Suite
- **File**: `tests/unit/widget-storage.test.mjs`
- **Coverage**: 10 unit tests executed via `node:test`:
  1. Export verification: exposes complete canonical API on global scope.
  2. `HomebaseStorage` read & write operations.
  3. Fallback to `browser.storage.local` when `HomebaseStorage` is undefined.
  4. LocalStorage fast mirror write synchronization.
  5. Fallback to localStorage fast mirror when storage returns undefined.
  6. Malformed JSON recovery and type validation for widget order.
  7. Weather cache payload round-trip and dual-mirror write verification (`fast-weather-v2` & `fast-weather`).
  8. Quote cache payload round-trip and dual-mirror write verification (`fast-quote-v2` & `fast-quote-state`).
  9. News cache payload round-trip and dual-mirror write verification (`fast-news-v2` & `fast-news`).
  10. Todo state read & write operations with default array fallback.

### 2.3 Script Manifest & Verification Integration
- **`src/new-tab.html`**:
  - Added `<script src="newtab/widgets/widget-storage.js" defer></script>` directly after `wallpaper-storage.js` and prior to widget execution scripts (`time.js`, `weather.js`, etc.).
- **`scripts/check-newtab-static.mjs`**:
  - Added `'newtab/widgets/widget-storage.js'` to `keyExtractedModulePaths`.

---

## 3. Storage Ownership Matrix

| Data Item | Primary Key | Fallback Storage | Fast Mirror Key | Legacy Mirror Key | Default Value |
|---|---|---|---|---|---|
| Widget Order | `widgetOrder` | `browser.storage.local` | `fast-widget-order` | — | `['time', 'weather', 'quote', 'news', 'todo']` |
| Sidebar Visibility | `showSidebar` | `browser.storage.local` | `fast-show-sidebar` | — | `true` |
| Time Format | `timeFormat` | `browser.storage.local` | `fast-time-format` | — | `'12'` |
| Weather Cache | `weatherCache` | `browser.storage.local` | `fast-weather-v2` | `fast-weather` | `null` |
| Quote Cache | `quoteCache` | `browser.storage.local` | `fast-quote-v2` | `fast-quote-state` | `null` |
| News Cache | `newsCache` | `browser.storage.local` | `fast-news-v2` | `fast-news` | `null` |
| Todo State | `todoState` (or `todos`) | `browser.storage.local` | — | — | `[]` |

---

## 4. Verification & Quality Gates

All mandatory verification checks passed with 100% compliance:

```powershell
# 1. Syntax Check
node --check src/newtab/widgets/widget-storage.js
# Output: Clean syntax, exit code 0

# 2. Static Analysis & Script Manifest
node scripts/check-newtab-static.mjs
# Output:
# - Deferred scripts: 69 verified
# - Key extracted modules: 54 verified
# - Unique top-level declarations: 813
# - Declaration collisions: 0 detected
# - Script order verified: HomebaseWidgetStorage available before widget consumers

# 3. Automated Test Suite
npm.cmd test
# Output:
# - 38 test suites passed (including new widget-storage.test.mjs)
# - Total unit tests: 415 passed (0 failed, 0 skipped)
# - Headless smoke test: PASSED (instant load < 100ms, DOM ready, widget container valid)

# 4. Production Dual Build
npm.cmd run build
# Output:
# - Built chrome -> dist\chrome
# - Built firefox -> dist\firefox

# 5. Protected Files Diff
git diff src/preload.js src/instant_load.js manifests/ dist/
# Output: Zero diff (completely clean)
```

---

## 5. Next Steps — Phase 3 Consumer Migration Plan

With `HomebaseWidgetStorage` established and fully validated, Phase 3 will incrementally migrate existing widget consumers to use the canonical service:

1. **`src/newtab/widgets/widget-visibility.js`**:
   - Replace direct `localStorage.getItem('fast-widget-order')` / `HomebaseStorage.get('widgetOrder')` with `HomebaseWidgetStorage.getWidgetOrder()` / `setWidgetOrder()`.
   - Replace direct `localStorage.getItem('fast-show-sidebar')` / `HomebaseStorage.get('showSidebar')` with `HomebaseWidgetStorage.getSidebarVisibility()` / `setSidebarVisibility()`.
2. **`src/newtab/widgets/time.js`**:
   - Replace direct `fast-time-format` storage writes with `HomebaseWidgetStorage.getTimeFormat()` / `setTimeFormat()`.
3. **`src/newtab/widgets/weather.js`**:
   - Replace direct `fast-weather-v2` / `weatherCache` persistence with `HomebaseWidgetStorage.getWeatherCache()` / `setWeatherCache()`.
4. **`src/newtab/widgets/quote.js`**:
   - Replace direct `fast-quote-v2` / `quoteCache` persistence with `HomebaseWidgetStorage.getQuoteCache()` / `setQuoteCache()`.
5. **`src/newtab/widgets/news.js`**:
   - Replace direct `fast-news-v2` / `newsCache` persistence with `HomebaseWidgetStorage.getNewsCache()` / `setNewsCache()`.
6. **`src/newtab/widgets/todo.js`**:
   - Replace direct `todoState` / `todos` persistence with `HomebaseWidgetStorage.getTodoState()` / `setTodoState()`.
