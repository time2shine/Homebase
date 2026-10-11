# Cycle #15 Phase 3 Implementation Plan: Search Suggestion Service Extraction

**Cycle**: #15 — Search Subsystem Modularization & Decoupling  
**Phase**: Phase 3 — Extraction of `search-suggestion-service.js`  
**Status**: Plan Draft (Awaiting Approval)  
**Date**: 2026-10-11  

---

## 1. Current Architecture & Problem Statement

### 1.1 Problem Analysis
In the current search subsystem, [`src/newtab/search/search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) is **1,976 lines** and contains **67 functions**. It acts as a massive god-object entangling four distinct domains:
1. **Input/Event Handling**: Keystroke debouncing, input focus/blur, click/mousedown handlers, bookmark grid raycasting and scroll tracking.
2. **Suggestion & Bang Pipeline**: External HTTP suggestion fetching, `AbortController` cancellation, token race tracking, multi-engine payload parsing (OpenSearch, DuckDuckGo, Yahoo, Yandex), and bang (`!g`, `!yt`) dictionary matching.
3. **UI Rendering**: Constructing DOM nodes for calculator chips, bookmarks, history entries, bang badges, external suggestion items, and managing selection CSS classes.
4. **Storage & History Access**: Querying `browser.history.search`, reading global preference bridges, and interacting with `search-suggestion-cache.js`.

### 1.2 Responsibilities to Extract
The suggestion pipeline is completely decoupled from the DOM. It takes a search query and engine definition as inputs and outputs parsed suggestion strings or bang matches. However, it currently lives directly inside the UI event loop, mixing network I/O, cache queries, and JSON normalization with DOM mutations.

---

## 2. Proposed Target Architecture

We will extract all suggestion retrieval, caching, normalization, and bang mapping logic into a dedicated, DOM-independent service:
[`src/newtab/search/search-suggestion-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-suggestion-service.js).

### 2.1 Interaction & Data Flow Diagram

```text
               [User Keystroke / Input Event]
                             │
                             ▼
            HomebaseSearchInteractionController
              (Input Debouncing & Event Routing)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Local Query Engines]            HomebaseSearchSuggestionService
   • Math / Unit parsing            (Provider Fetching & Caching)
   • Bookmark filtering                      │
   • Browser history search                  ├── 1. Check LRU Cache (search-suggestion-cache.js)
                                             ├── 2. Parse Bang Code (!g, !yt, getBangMap())
                                             ├── 3. Abort Prior In-Flight Request
                                             └── 4. HTTP Fetch & Normalize Provider Format
                                                     (OpenSearch / DDG / Yahoo / Yandex)
                                             │
            ▲                                ▼
            │                     Structured Suggestion Result
            │                     { suggestions: string[], bangs: Object[], token: number }
            │                                │
            └────────────────────────────────┘
                             │
                             ▼
               Search UI / Dropdown Renderer
              (Creates DOM Elements & Favicons)
```

### 2.2 Strict Separation of Concerns
- **`HomebaseSearchSuggestionService` OWNS**:
  - Provider communication: `fetchSuggestions(query, engine)` with AbortController lifecycle.
  - Abort management: `abort()`, preventing orphaned HTTP requests.
  - Provider payload normalization: Transforming OpenSearch arrays (`[query, [s1, s2]]`), DuckDuckGo (`phrase`), Yahoo (`gossip.results`), and Yandex arrays into a clean `string[]`.
  - Cache coordination: Reading and writing to `getSuggestionCacheEntry` / `setSuggestionCacheEntry`.
  - Bang resolution: `getBangMap()`, `getBangSuggestions(query)`.
  - Preference check: Respecting `appSearchSuggestionsPreference`.
- **`HomebaseSearchSuggestionService` DOES NOT OWN**:
  - DOM manipulation or element creation.
  - Keyboard listeners or arrow navigation.
  - Dropdown rendering or `.hidden` toggles.
  - Focus or selection state tracking.

---

## 3. Compatibility & Global Contract Audit

### 3.1 Protected Files Guarantee
- `src/preload.js`: **Untouched** (no search dependencies).
- `src/instant_load.js`: **Untouched** (`fast-search` synchronous `localStorage` format preserved).
- `manifests/*`: **Untouched**.
- `dist/*`: **Untouched** (generated only).

### 3.2 Public Window APIs to Preserve
The extraction must strictly preserve all existing window interfaces:
- `window.HomebaseSearchInteractionController` (lifecycle methods: `.initialize()`, `.destroy()`, `.getState()`, `.setSuggestionsPreference()`).
- `window.appSearchSuggestionsPreference` and `window.setSearchSuggestionsPreference(enabled)`.
- `window.getSuggestionCacheEntry(key)` and `window.setSuggestionCacheEntry(key, val)`.
- `window.bangMap` (default bang dictionary compatibility bridge).
- New public namespace: `window.HomebaseSearchSuggestionService`.

---

## 4. Phased Migration Plan

### Phase 3A: Create `search-suggestion-service.js` (Standalone Service)
1. Author [`src/newtab/search/search-suggestion-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-suggestion-service.js) (~320 lines) encapsulated in an IIFE.
2. Implement:
   - `fetchSuggestions(query, engine, options)`
   - `abort()`
   - `normalizeProviderPayload(engineName, rawData)`
   - `getBangMap()` and `getBangSuggestions(query, engines)`
   - Cache lookup and insertion via `getSuggestionCacheEntry` / `setSuggestionCacheEntry`.
3. Export canonical `window.HomebaseSearchSuggestionService`.
4. Add focused unit test suite [`tests/unit/search-suggestion-service.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/search-suggestion-service.test.mjs).

### Phase 3B: Integration in Dashboard Manifest & Static Scanner
1. Update `src/new-tab.html` to add:
   ```html
   <script src="newtab/search/search-suggestion-service.js" defer></script>
   ```
   immediately after `search-suggestion-cache.js` and before `search-ui-controller.js`.
2. Update `scripts/check-newtab-static.mjs` to add `"newtab/search/search-suggestion-service.js"` to `keyExtractedModulePaths`.
3. Validate static invariants with zero declaration collisions.

### Phase 3C: Refactor `search-interaction-controller.js` to Delegate
1. In `search-interaction-controller.js`:
   - Remove redundant `fetchSuggestions()` implementation.
   - Remove redundant `suggestionAbortController` and `abortSuggestionFetch()`.
   - Remove redundant `getBangMap()` and `getBangSuggestions()`.
   - Delegate suggestion fetching directly to `HomebaseSearchSuggestionService.fetchSuggestions()`.
   - Delegate bang suggestions directly to `HomebaseSearchSuggestionService.getBangSuggestions()`.
2. Maintain input token race condition checking (`isStaleSearch`) inside the interaction controller to safeguard DOM updating.

### Phase 3D: Verification & Stabilization
1. Execute full verification suite (`node --check`, static scanner, unit tests, browser smoke test, dual build).
2. Author `docs/cycles/cycle-15/phase-3-completion-summary.md`.

---

## 5. Risk Analysis & Mitigation Strategies

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Asynchronous Race Conditions** | Outdated suggestion responses overwrite newer queries if slow network responses arrive late. | Keep `latestSearchToken` counter in interaction controller; reject results if `token !== latestSearchToken`. |
| **Provider HTTP Failures** | Network offline, rate-limiting, or CORS issues could throw unhandled rejections. | `fetchSuggestions` wraps all network requests in `try/catch` and gracefully returns an empty array `[]` on error. |
| **AbortError Confusion** | `AbortController.abort()` throws a standard `AbortError` in fetch. | Explicitly catch `err.name === 'AbortError'` and return `null` without logging errors. |
| **Cache Miss/Hit Inconsistency** | Stale cache entries or missing suggestions preference. | Guard cache read/write with `appSearchSuggestionsPreference` check, identical to existing behavior. |
| **Script Loading Order Mismatch** | `HomebaseSearchSuggestionService` referenced before loaded. | Enforce `<script defer>` order in `src/new-tab.html` placing suggestion service before `search-interaction-controller.js`. |

---

## 6. Verification Toolchain

Mandatory checks to run at each verification boundary:
```powershell
node --check src/newtab/search/search-suggestion-service.js src/newtab/search/search-interaction-controller.js
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
git diff src/preload.js src/instant_load.js manifests/ dist/
```
Target: 100% test passage, 0 declaration collisions, clean builds in `dist/chrome/` and `dist/firefox/`.
