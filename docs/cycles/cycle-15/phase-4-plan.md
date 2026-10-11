# Cycle #15 Phase 4 Stabilization Plan

## 1. Executive Summary
Following the successful completion of **Phase 2** (Storage Schema Harmonization & Encapsulation) and **Phase 3** (Search Suggestion Service Extraction & Runtime Integration), Phase 4 focuses on **stabilization, boundary consolidation, and lifecycle hardening** of the search subsystem.

Phase 4 does not introduce risky architectural overhauls; instead, it audits and solidifies the interaction and UI layers, eliminates remaining boundary ambiguities between `search-interaction-controller.js` and `search-ui-controller.js`, validates event teardown and memory hygiene, and produces the definitive Cycle #15 architecture closure report.

---

## 2. Current Search Architecture

The search subsystem resides in `src/newtab/search/` and consists of 6 modular scripts loaded sequentially in classic `<script defer>` mode:

```
src/newtab/search/
├── search-storage.js               (491 lines, 26 functions) - Canonical storage owner
├── search-utils.js                 (290 lines,  3 functions) - Math, units & URL evaluators
├── search-suggestion-cache.js      ( 50 lines,  2 functions) - 150-item LRU response cache
├── search-suggestion-service.js    (284 lines, 10 functions) - Dedicated suggestion pipeline & bangs
├── search-ui-controller.js         (943 lines, 30 functions) - Engine selector popup & visual presentation
└── search-interaction-controller.js (1871 lines, 67 functions) - Input handling, keyboard navigation, result rendering
```

### Module Ownership & Responsibility Matrix

| Module | Canonical Owner Of | Dependencies | Outbound Calls |
| :--- | :--- | :--- | :--- |
| **`search-storage.js`** | Engine presets, persistence, `fast-search` synchronous localStorage mirror | `HomebaseStorage` | `HomebaseStorage.set/setMany`, `localStorage.setItem` |
| **`search-utils.js`** | Pure mathematical evaluation (`evaluateMath`), unit conversions (`evaluateUnits`), URL pattern heuristics (`isLikelyUrl`) | None (Pure stateless helpers) | None |
| **`search-suggestion-cache.js`** | 150-entry LRU Map storage for external queries | None | None |
| **`search-suggestion-service.js`** | HTTP network fetching, AbortController lifecycle, provider normalization (OpenSearch, DDG, Yahoo, Yandex), bang matching (`getBangMap`, `getBangSuggestions`) | `search-suggestion-cache.js`, global fetch | `getSuggestionCacheEntry`, `setSuggestionCacheEntry` |
| **`search-ui-controller.js`** | Search icon UI, engine picker popup menu, position calculation, active engine styling, engine cycling (`cycleSearchEngine`) | `search-storage.js`, `HomebaseStorageDispatcher` | `HomebaseSearchStorage`, `HomebaseSearchInteractionController.setSuggestionsPreference` |
| **`search-interaction-controller.js`** | Search input events, debounced typing, keyboard navigation (Arrow keys, Tab, Enter), stale token race protection, result aggregation (bookmarks, history, math, suggestions), DOM rendering | `search-ui-controller.js`, `search-suggestion-service.js`, `search-utils.js`, `HomebaseFaviconPipeline` | `HomebaseSearchSuggestionService.fetchSuggestions/abort/getBangSuggestions`, `HomebaseSearchUiController.updateSearchUI/hideSearchResultsPanel` |

---

## 3. Remaining Problems & Technical Debt

### 3.1 `search-interaction-controller.js` Footprint (1,871 lines)
While Phase 3 eliminated network fetching, abort orchestration, and provider payload parsing (saving ~114 net lines), the controller remains the largest file in the search subsystem. Its remaining responsibilities span 5 domains:
1. **Event & Keyboard Navigation**: ArrowUp, ArrowDown, Tab, Enter, Escape, selection indexing (~450 lines).
2. **Result Dropdown DOM Construction**: Creating buttons, labels, favicons, headers for bookmarks, history, math, and suggestions (~400 lines).
3. **Bookmarks Tree Filtering**: In-memory score traversal of `window.allBookmarks` (~120 lines).
4. **History Provider Interop**: Asynchronous querying of WebExtension `browser.history` or `chrome.history` with permission safeguards (~90 lines).
5. **Bookmark Grid Scroll Passthrough**: Pointer raycasting and scroll delegation when search input is passive (~120 lines).

### 3.2 Cross-Module Bridges & Global References
- `search-interaction-controller.js` accesses `window.allBookmarks` directly rather than invoking a unified bookmark lookup service.
- Engine preferences and active engine states are read via bridge functions that fall back to global lexical variables (`activeSearchEngineId`, `searchEngines`) if `HomebaseSearchUiController` or `HomebaseSearchStorage` are missing.

### 3.3 Event Listener Lifecycle & Destroy Completeness
- `initialize({ bindEvents: true })` registers multiple listeners across `form`, `input`, `panel`, `document`, and `window`.
- `destroy()` removes event listeners and aborts pending suggestions, but teardown safety under partial initialization needs rigorous test verification.

---

## 4. Proposed Stabilization Tasks

### Task 4.1: Clean Input & Event Teardown Audit
- Verify that `destroy()` resets all internal state (`currentSelectionIndex`, `currentSectionIndex`, `selectionExplicit`, `latestSearchToken`, `lastBookmarkHtml`, `lastSuggestionHtml`).
- Ensure no lingering timeout callbacks or unhandled event listeners remain after `destroy()`.
- Confirm `beforeunload` listener cancels any pending debounced search input handlers.

### Task 4.2: Keyboard Navigation & Section Traversal Validation
- Audit cross-section navigation between Section 0 (Bookmarks, Math, History) and Section 1 (Search Suggestions).
- Verify Tab / Shift+Tab cycling preserves active selection without jumping out of the results panel.
- Ensure Escape key consistently clears selection and closes results panel via `HomebaseSearchUiController.hideSearchResultsPanel()`.
- Validate Enter key execution priority:
  1. Selected result navigation.
  2. Direct URL navigation (if query satisfies `isLikelyUrl`).
  3. Active search engine query template execution.

### Task 4.3: History & Bookmark Search Defensive Guards
- Validate that `chrome.history` / `browser.history` absence (e.g., in Firefox without permissions or in tests) returns `[]` safely without throwing.
- Confirm `allBookmarks` search handles null/empty trees gracefully.

### Task 4.4: Subsystem Boundary Formalization
- Confirm that `HomebaseSearchStorage` remains the sole persistence owner across the repository.
- Confirm that `HomebaseSearchSuggestionService` remains the sole suggestion fetcher across the repository.
- Verify zero circular dependency between `search-ui-controller.js` and `search-interaction-controller.js`.

---

## 5. Migration Strategy

1. **Step 1 (Read-Only Audit)**:
   - Perform static inspections of event bindings and teardown handlers.
   - Verify all bridge functions in `search-interaction-controller.js`.
2. **Step 2 (Defensive Hardening)**:
   - If any missing null checks or unhandled edge cases are found, apply surgical, non-breaking defensive guards.
   - Do NOT refactor working DOM rendering or rewrite keyboard logic.
3. **Step 3 (Comprehensive Testing)**:
   - Add unit tests verifying `destroy()` idempotency, keyboard section transitions, history failure fallbacks, and URL execution priority.
4. **Step 4 (Final Architecture Documentation)**:
   - Author `docs/cycles/cycle-15/cycle-15-final-architecture-summary.md` detailing the fully stabilized search architecture.

---

## 6. Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
| :--- | :--- | :--- | :--- |
| **Breaking Keyboard Navigation** | High | Low | Zero changes to navigation algorithm; only audit and add tests. |
| **DOM Event Leaks** | Medium | Low | Verify `destroy()` unbinds form, input, panel, and document listeners. |
| **History Permission Crash** | Medium | Low | Ensure `typeof chrome !== 'undefined' && chrome.history` guards remain in place. |
| **Regression in Smoke Tests** | High | Low | Run full 4-stage test suite including Microsoft Edge browser smoke test before every commit. |

---

## 7. Verification Plan

Every Phase 4 step must satisfy:
1. **`node --check`**: Clean syntax across all modified and existing JavaScript files.
2. **`node scripts/check-newtab-static.mjs`**: All 67 deferred scripts verified, zero declaration collisions, valid script order.
3. **`npm.cmd test`**: 100% pass across all unit tests and browser smoke test.
4. **`npm.cmd run build`**: Clean dual builds in `dist/chrome/` and `dist/firefox/`.
5. **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/`, `dist/` remain untouched (0 diff).
