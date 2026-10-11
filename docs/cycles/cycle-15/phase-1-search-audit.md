# Cycle #15 Phase 1: Search Subsystem Architecture Audit

**Cycle**: #15 — Search Subsystem Modularization & Decoupling  
**Phase**: Phase 1 — Subsystem Architecture & Boundary Audit  
**Status**: Completed  
**Date**: 2026-10-11  

---

## 1. Executive Summary

The Homebase search subsystem powers the dashboard's instant search bar, multi-engine routing (Google, YouTube, DuckDuckGo, Bing, Wikipedia, etc.), keyword bang navigation (`!g`, `!yt`), in-memory bookmark and browser history searching, instant math & unit conversion chips, and autocomplete suggestion dropdowns.

Currently, the search subsystem comprises 5 files totaling **3,732 lines of code** under [`src/newtab/search/`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/):
1. [`search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) (**1,976 lines**) — Monolithic interaction engine that entangles input debouncing, external HTTP suggestion fetches, history searches, bookmark querying, math/unit chip DOM construction, favicon pipeline hydration, keyboard focus navigation, and bookmark grid pointer tracking.
2. [`search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) (**939 lines**) — Manages search engine icon rendering, carousel cycling, active engine sync, input placeholder formatting, and settings default engine selection.
3. [`search-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) (**477 lines**) — Storage service managing current engine selection, engine config lists, default engine preference, and `fast-search` synchronous `localStorage` preview cache.
4. [`search-utils.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js) (**290 lines**) — Pure utilities for mathematical calculation (`evaluateMath`), unit conversion (`evaluateUnits`), and URL detection (`isLikelyUrl`).
5. [`search-suggestion-cache.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-suggestion-cache.js) (**50 lines**) — LRU-style Map cache for external suggestion responses.

While search functionally operates well, its architecture exhibits high complexity and technical debt:
- **`search-interaction-controller.js` is bloated**: At nearly 2,000 lines and 67 functions, it is the largest single file in the repository after Cycle #14's settings refactoring.
- **Key naming discrepancies**: `search-ui-controller.js` defines dead/mismatched constants (`SEARCH_ENGINES_PREF_KEY = 'searchEngines'` vs canonical `'searchEnginesConfig'` in `search-storage.js`).
- **Split storage writes**: `src/newtab/settings/search-engine-settings.js` issues direct `HomebaseStorage.set()` mutations rather than delegating through `HomebaseSearchStorage`.
- **Global scope exposure**: `search-storage.js`, `search-utils.js`, and `search-suggestion-cache.js` are not encapsulated in IIFEs, exposing top-level declarative variables directly to the shared document record.

---

## 2. File Metrics & Function Inventory

| File | Size (Bytes) | Line Count | Function Count | Direct Storage Calls | Encapsulation |
|---|---|---|---|---|---|
| [`search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) | 72,975 B | 1,976 lines | 67 functions | 0 (Reads preferences from globals) | IIFE Wrapper |
| [`search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) | 32,771 B | 939 lines | 30 functions | 0 (Delegates to storage accessors) | IIFE Wrapper |
| [`search-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) | 16,935 B | 477 lines | 15 functions | 44 (20 `HomebaseStorage`, 21 `browser.storage`, 3 `localStorage`) | None (Top-level scope) |
| [`search-utils.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js) | 4,921 B | 290 lines | 3 functions | 0 | None (Top-level functions) |
| [`search-suggestion-cache.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-suggestion-cache.js) | 972 B | 50 lines | 2 functions | 0 | None (Top-level scope) |
| **Total Subsystem** | **128,574 B** | **3,732 lines** | **117 functions** | **44 calls** | **Mixed** |

---

## 3. Detailed File-by-File Analysis

### 3.1 `src/newtab/search/search-interaction-controller.js` (1,976 lines)
- **Role**: Coordinates all user typing, query processing, suggestion fetching, keyboard navigation, and search execution.
- **Internal Subsystems & Responsibilities**:
  1. *DOM Element Cache & Accessors* (lines 34–90): Cached access to `#search-form`, `#search-input`, `#search-results-panel`, `.results-bookmarks`, `.results-suggestions`, `#search-widget`.
  2. *Preference Bridges* (lines 96–140): Reads `appSearchOpenNewTabPreference`, `appSearchMathPreference`, `appSearchShowHistoryPreference`, `appSearchSuggestionsPreference`.
  3. *Engine & Bang Resolution* (lines 151–210): Reads active engine, maps `!` bang prefixes to target engines (`getBangMap()`).
  4. *Bookmark Grid Scroll Tracking* (lines 304–385): Tracks cursor position over bookmark grid to transparently route PageUp/PageDown/Arrow keys to the grid scroll container when search input is passive.
  5. *Keyboard Navigation & Dropdown Selection* (lines 388–720): Complex cursor state machine (`currentSectionIndex`, `currentItemIndex`, `selectionExplicit`) managing ArrowUp/ArrowDown across calculator, bookmark, bang, history, and search engine suggestion sections.
  6. *Query Routing & Execution* (lines 724–825): `executeSearch(query, engine, newTab)` checks `isLikelyUrl()`, prepends `http://` if necessary, routes to engine query templates, and respects new tab preferences.
  7. *Event Listeners* (lines 829–1070): Form `submit`, result `click`/`mousedown`, and input `keydown`.
  8. *Suggestions & Favicon Pipeline* (lines 1074–1328): AbortController aborts for in-flight suggestion requests, HTTP fetches against engine suggestion URLs, LRU caching, and favicon hydration via `resolveFaviconForImageTarget()`.
  9. *Monster `handleInput` Handler* (lines 1329–1748): Over 418 lines of dense orchestration on every keystroke:
     - Bang code matching and engine icon swapping
     - Math / Unit calculation chip rendering
     - In-memory bookmark substring filtering (up to 5 items)
     - Browser history search (`browser.history.search`, up to 5 items)
     - External suggestion fetch with race condition protection (`currentToken`)
     - Fragment DOM rendering with JSON signature change memoization
  10. *Lifecycle & Teardown* (lines 1750–1976): `initialize({ bindEvents })`, `destroy()`, `getState()`.
- **Public API**: `window.HomebaseSearchInteractionController`, `window.appSearchSuggestionsPreference`, `window.setSearchSuggestionsPreference`, `window.isLikelyUrl`, `window.getSuggestionCacheEntry`, `window.setSuggestionCacheEntry`.

### 3.2 `src/newtab/search/search-ui-controller.js` (939 lines)
- **Role**: Visual presentation and selector carousel controller for the search bar.
- **Responsibilities**:
  1. *Engine Selector Carousel* (lines 104–340): Generates SVG icon buttons for enabled search engines, handles carousel positioning, wheel cycling, and click selection.
  2. *Search UI State Sync* (lines 345–480): Updates input placeholder (`"Search with Google"`), dynamically switches accent colors, and triggers `<link rel="preconnect">` domain warming.
  3. *Settings Integration* (lines 485–560): Populates the Default Search Engine select dropdown (`#app-search-default-engine-select`) and manages its visibility toggle based on "Remember Search Engine" preference.
  4. *Multi-Tab Event Synchronization* (lines 565–600): Listens for WebExtension storage changes to re-render the selector when search settings change in another tab.
  5. *Initialization Orchestrator* (lines 676–887): `setupSearch()` initializes search preferences, builds selector UI, and triggers `HomebaseSearchInteractionController.initialize()`.
- **Public API**: `window.HomebaseSearchUiController`, `window.HomebaseSearchEngineController`, `window.setupSearch`, `window.updateSearchUI`, `window.clearSearchUI`, `window.hideSearchResultsPanel`, `window.cycleSearchEngine`, `window.applySearchEngineConfig`, `window.getSafeEnabledSearchEngineId`, `window.handleSearchStorageChange`.

### 3.3 `src/newtab/search/search-storage.js` (477 lines)
- **Role**: Storage data access layer for search configuration and instant-load fast-search cache.
- **Responsibilities**:
  1. *Authoritative Default Catalog* (lines 12–89): `DEFAULT_SEARCH_ENGINES` containing 12 predefined search engines with search URLs, suggestion URLs, brand colors, and icon symbols.
  2. *CRUD Accessors with Defensive Fallbacks* (lines 91–330):
     - `getCurrentSearchEngineId()` / `setCurrentSearchEngineId()`
     - `getDefaultSearchEngineId()` / `setDefaultSearchEngineId()`
     - `getSearchRememberEnginePreference()` / `setSearchRememberEnginePreference()`
     - `getSearchEnginesConfig()` / `setSearchEnginesConfig()`
     - `getSearchPreferences()` (batch reader) / `setSearchPreferences()` (batch writer)
  3. *Preload Cache Mirror* (lines 331–418): Synchronous `localStorage` mirror (`fast-search`) containing active engine name, symbol, color, and placeholder for synchronous pre-hydration.
- **Direct Storage Usage**:
  - `HomebaseStorage.get`, `.set`, `.getMany`, `.setMany`
  - `browser.storage.local.get`, `.set`
  - `localStorage.getItem`, `.setItem`, `.removeItem`
- **Public API**: `window.HomebaseSearchStorage`, `window.DEFAULT_SEARCH_ENGINES`, `window.searchEngines`, plus 18 individual window functions.

### 3.4 `src/newtab/search/search-utils.js` (290 lines)
- **Role**: Pure utility computation without DOM or storage dependencies.
- **Responsibilities**:
  1. `evaluateMath(query)`: Clean mathematical expression parser supporting `+`, `-`, `*`, `/`, `%`, `^`, operator precedence, parentheses, and leading `=` sign.
  2. `evaluateUnits(query)`: Unit conversion engine supporting weight (kg, lbs), length (m, km, ft, mi), and temperature (c, f).
  3. `isLikelyUrl(query)`: Strict URL and domain detector distinguishing actual web addresses (protocols, localhost, IP addresses, TLD domains, intranet trailing slashes) from search phrases.
- **Packaging**: Unencapsulated classic script declaring top-level functions in global scope.

### 3.5 `src/newtab/search/search-suggestion-cache.js` (50 lines)
- **Role**: In-memory response cache for external suggestion queries.
- **Responsibilities**:
  - Maintains `suggestionCache = new Map()`, capped at `MAX_SUGGESTION_CACHE_ENTRIES = 150`.
  - Implements LRU eviction by deleting and re-inserting accessed keys.
  - Skips caching if `appSearchSuggestionsPreference` is false.
- **Packaging**: Unencapsulated classic script with top-level `const` declarations.

---

## 4. State & Schema Ownership Analysis

### 4.1 Authoritative Search Storage Keys
| Storage Key | Canonical Definition | Consumers |
|---|---|---|
| `currentSearchEngineId` | `search-storage.js` (line 6) | `search-ui-controller.js`, `settings-storage.js`, `backup-import.js` |
| `appSearchDefaultEngine` | `search-storage.js` (line 7) | `search-ui-controller.js`, `settings-storage.js`, `search-engine-settings.js`, `backup-import.js` |
| `appSearchRememberEngine` | `search-storage.js` (line 8) | `search-ui-controller.js`, `settings-storage.js`, `backup-import.js` |
| `searchEnginesConfig` | `search-storage.js` (line 9) | `search-ui-controller.js`, `settings-storage.js`, `search-engine-settings.js`, `backup-import.js` |
| `fast-search` (`localStorage`) | `search-storage.js` (line 10) | `instant_load.js` (head hydrator), `search-storage.js` |

### 4.2 Identified Schema & Key Discrepancies
1. **Dead & Mismatched Key Constants in `search-ui-controller.js`**:
   - Lines 9–11 define:
     ```javascript
     const SEARCH_ENGINES_PREF_KEY = 'searchEngines'; // MISMATCH: canonical key is 'searchEnginesConfig'
     const APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEnginePreference'; // MISMATCH: canonical key is 'appSearchRememberEngine'
     const APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEnginePreference'; // MISMATCH: canonical key is 'appSearchDefaultEngine'
     ```
   - In `loadSearchEnginePreferences()`, reading `stored[SEARCH_ENGINES_PREF_KEY]` fails to locate the saved configuration because `getSearchPreferences()` returns `{ searchEnginesConfig: [...] }` while the UI controller accesses `stored['searchEngines']`.
2. **Duplicate Direct Writes in `src/newtab/settings/search-engine-settings.js`**:
   - Lines 242 and 260 directly invoke `HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY, ...)` and `HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, ...)` instead of delegating to `HomebaseSearchStorage.setSearchEnginesConfig()` and `HomebaseSearchStorage.setDefaultSearchEngineId()`.
   - This bypasses `writeFastSearchCache()` updating when search engines are modified in settings.

---

## 5. Startup & Dependency Profile

### 5.1 Script Loading Order in `src/new-tab.html`
All 5 search modules are loaded as deferred scripts before dashboard startup:
```html
3360: <script src="newtab/search/search-storage.js" defer></script>
...
3370: <script src="newtab/search/search-utils.js" defer></script>
3371: <script src="newtab/search/search-suggestion-cache.js" defer></script>
3372: <script src="newtab/search/search-ui-controller.js" defer></script>
3373: <script src="newtab/search/search-interaction-controller.js" defer></script>
...
3376: <script src="newtab/settings/search-engine-settings.js" defer></script>
```

### 5.2 Startup Execution Flow in `src/new-tab.js`
During `initializePage()`:
1. `window.setupSearch()` is invoked from `src/new-tab.js`.
2. `setupSearch()` calls `HomebaseSearchUiController.initialize()`.
3. `loadSearchEnginePreferences()` reads `getSearchPreferences()`, resolves active engine, populates selector DOM.
4. `setupSearch()` calls `HomebaseSearchInteractionController.initialize({ bindEvents: true })`.
5. Event listeners are bound to `#search-form`, `#search-input`, `#search-results-panel`, and `document` keyboard events.

---

## 6. Public Global Window APIs & Bridges

The search subsystem exposes a wide array of legacy global functions on `window`:
- `window.HomebaseSearchInteractionController`
- `window.HomebaseSearchUiController` / `window.HomebaseSearchEngineController`
- `window.HomebaseSearchStorage`
- `window.setupSearch`
- `window.updateSearchUI`
- `window.clearSearchUI`
- `window.hideSearchResultsPanel`
- `window.cycleSearchEngine`
- `window.applySearchEngineConfig`
- `window.getSafeEnabledSearchEngineId`
- `window.handleSearchStorageChange`
- `window.getCurrentSearchEngineId` / `window.setCurrentSearchEngineId`
- `window.getDefaultSearchEngineId` / `window.setDefaultSearchEngineId`
- `window.getSearchRememberEnginePreference` / `window.setSearchRememberEnginePreference`
- `window.getSearchEnginesConfig` / `window.setSearchEnginesConfig`
- `window.getSearchPreferences` / `window.setSearchPreferences`
- `window.getFastSearchPayload` / `window.writeFastSearchCache` / `window.getFastSearchCache`
- `window.DEFAULT_SEARCH_ENGINES`
- `window.searchEngines`
- `window.evaluateMath` / `window.evaluateUnits` / `window.isLikelyUrl`
- `window.getSuggestionCacheEntry` / `window.setSuggestionCacheEntry`

All public APIs must remain 100% backward-compatible during Cycle #15 refactoring.

---

## 7. Major Architectural Deficiencies & Extraction Opportunities

### 7.1 Monolithic Bloat in `search-interaction-controller.js` (1,976 lines)
`search-interaction-controller.js` has grown into a god-object combining 5 disparate domains:
1. **Dropdown Navigation & Focus State Machine**: Section hopping, item highlighting, hover tracking, keyboard handling.
2. **External Suggestion & Bang Pipeline**: AbortController requests, JSON parsing, LRU caching, bang mapping.
3. **Internal Query Engines**: Math expression evaluation, unit conversions, bookmark filtering, and browser history querying.
4. **Result DOM Rendering & Favicon Hydration**: Building HTML elements for chips, bookmarks, history, and suggestions.
5. **Bookmark Grid Scroll Integration**: Raycasting pointer coordinates to scroll bookmark grids.

### 7.2 Proposed Modularization Decomposition
By extracting discrete domains from `search-interaction-controller.js`, we can achieve a clean, modular architecture:
1. **`search-suggestion-service.js`**: Dedicated engine for external suggestions (`fetchSuggestions`), AbortController lifecycle, stale request token tracking, bang shortcuts mapping (`getBangMap`, `getBangSuggestions`), and cache coordination.
2. **`search-dropdown-controller.js`**: Dedicated manager for dropdown visibility, section/item cursor tracking, keyboard navigation (Arrow keys, Tab, Enter, Escape), selection snapshots, and hover synchronization.
3. **`search-query-service.js`**: Dedicated query resolution coordinator uniting math/unit calculation chips, bookmark search matching, browser history querying, and final query navigation routing (`executeSearch`).
4. **Refactored `search-interaction-controller.js`**: Reduced from 1,976 lines to a lightweight orchestrator connecting DOM events to the services above.
5. **Storage Schema Harmonization**: Resolve mismatched constants in `search-ui-controller.js` and eliminate direct storage writes in `search-engine-settings.js` by delegating to `HomebaseSearchStorage`.
