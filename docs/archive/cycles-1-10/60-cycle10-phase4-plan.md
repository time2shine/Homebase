# Homebase Improvement Cycle #10 Phase 4 Plan: Search Interaction & Suggestions Controller Extraction

**Date:** September 30, 2026  
**Cycle ID:** Cycle #10 — Phase 4 (Search Live Execution, Suggestions, Bangs & Keyboard Navigation)  
**Target Release:** Homebase v0.17.0  
**Baseline Commit:** `41d43db` ("Extract search UI controller")  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/56-cycle10-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/56-cycle10-plan.md)  
**Status:** Planning & Architecture Audit Only — Zero Source Code Modifications  

---

## 1. Executive Summary & Selection Decision

In Phases 1, 2, and 3 of Cycle #10, the following controllers were successfully extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
- **Phase 1**: Performance Mode & Visual Runtime Controller (`src/newtab/settings/performance-controller.js`)
- **Phase 2**: Dialog & Context Menu Controllers (`src/newtab/core/dialog-controller.js`, `src/newtab/core/context-menu-controller.js`)
- **Phase 3**: Search UI & Engine Selector Controller (`src/newtab/search/search-ui-controller.js`)

Following the completion of Phase 3, `src/new-tab.js` has been reduced from **12,261 lines to 11,385 lines**.

### Phase 4 Candidate Evaluation:

Four candidate UI/domain clusters were audited against the 5 strict Selection Criteria:
1. High line reduction
2. Low startup risk
3. Clear ownership boundary
4. Minimal dependency on `new-tab.js` global state
5. Easy rollback

| Candidate Cluster | Existing Source Footprint in `src/new-tab.js` | Startup / Runtime Risk | Architectural Boundary | Projected Line Reduction | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **A. Search Interaction & Suggestions Controller** | **~2,220 lines** (lines 7370–9590; 30 functions) | **Very Low** (Purely interactive; zero execution on boot) | Clean continuation of `src/newtab/search/` (pairs with Phase 3) | **~1,600–1,800 lines** | **SELECTED (Phase 4 Target)** |
| **B. Favicon Pipeline & Resolution Worker** | ~900 lines (lines 2773–4275; 26 functions) | Medium (Touches image hydration during bookmark load) | Independent queue worker under `src/newtab/core/` | ~750 lines | Candidate for Phase 5 |
| **C. Bookmark Drag-and-Drop (Sortable.js)** | ~650 lines (lines 3328–3990; 11 functions) | High (Race conditions with tree mutations and hover timers) | Couples to local bookmark tree state | ~500 lines | Candidate for Phase 6 |
| **D. Wallpaper Playback & Video Lifecycle** | ~1,800 lines (lines 834–2290, 9590–12000; 49 functions) | High (Dual-buffer frame crossfade, startup canvas, offline posters) | Complex media state; high visual regression risk | ~1,500 lines | Candidate for Phase 7/8 |

### Selected Extraction Target:
**Search Interaction & Suggestions Controller**  
- **Target File:** `src/newtab/search/search-interaction-controller.js`  
- **Controller Name:** `window.HomebaseSearchInteractionController`  
- **Scope:** Extract live search input debouncing, keyboard navigation across all 4 result tiers, selection state management, Bang expansion, Calculator/Math evaluation, async search suggestion fetching, request abort/cancellation token management, search result click/mousedown dispatch, and URL execution.

---

## 2. Monolith Audit & Responsibility Analysis

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), the search interaction domain spans lines 7370 to 9590 and encompasses the largest contiguous functional cluster in the monolith:

### A. Functions Involved (30 Functions):
1. **Query & URL Execution (3 functions)**:
   - `openSearchUrl(url, newTab, event)` (lines 7370–7459, 90 lines)
   - `executeSearch(query, engine, newTab)` (lines 7460–7553, 94 lines)
   - `handleSearch(event)` (lines 7952–8003, 52 lines)
2. **Keyboard Context & Focus Helpers (3 functions)**:
   - `isSearchKeyboardContext(event)` (lines 7554–7599, 46 lines)
   - `isSearchInputEmptyAndPassive()` (lines 7616–7625, 10 lines)
   - `syncSearchInputWithItem(item)` (lines 7774–7803, 30 lines)
3. **Result Selection Traversal & Active Class State (9 functions)**:
   - `getCurrentSectionItems()` (lines 7736–7773, 38 lines)
   - `getResultLabelText(item)` (lines 7780–7803, 24 lines)
   - `selectItem(item, explicit)` (lines 7804–7875, 72 lines)
   - `attachHoverSync(item, index, sectionIndex)` (lines 7850–7875, 26 lines)
   - `moveSection(delta)` (lines 7876–7951, 76 lines)
   - `getSelectedResult()` (lines 7900–7920, 21 lines)
   - `getSelectionSnapshot()` (lines 7922–7945, 24 lines)
   - `removeSelectionClasses()` (lines 7740–7760, 21 lines)
   - `clearAllSelections()` (lines 7762–7773, 12 lines)
4. **Event Handlers (4 functions)**:
   - `handleSearchResultMouseDown(event)` (lines 8004–8017, 14 lines)
   - `handleSearchResultClick(event)` (lines 8018–8109, 92 lines)
   - `handleSearchKeydown(event)` (lines 8110–8423, 314 lines)
   - `handleSearchInput(event)` (lines 9112–9590, 479 lines)
5. **Suggestions, Bangs & Query Intelligence (8 functions)**:
   - `restoreSelectionAfterFilter()` (lines 8425–8467, 43 lines)
   - `maybeAutoSelectSuggestion(query, targetEngine)` (lines 8468–8513, 46 lines)
   - `applySelectionToCurrentResults(options)` (lines 8514–8656, 143 lines)
   - `isStaleSearch(token)` (lines 8657–8662, 6 lines)
   - `abortSuggestionFetch()` (lines 8663–8672, 10 lines)
   - `clearExternalSuggestionResults()` (lines 8673–8722, 50 lines)
   - `setSearchSuggestionsPreference(enabled)` (lines 8723–8746, 24 lines)
   - `fetchSearchSuggestions(query, engine)` (lines 8771–8954, 184 lines)
   - `getBangSuggestions(query)` (lines 8955–9016, 62 lines)
6. **DOM Result Hydration (3 functions)**:
   - `updatePanelVisibility()` (lines 9018–9042, 25 lines)
   - `hydrateSearchResultFavicons(container)` (lines 9043–9111, 69 lines)

### B. Mutable State Variables Managed:
- `userIsTyping`: Boolean flag tracking keyboard input.
- `selectionExplicit`: Boolean tracking whether active item selection was driven by user arrow keys.
- `currentSelectionIndex`: Integer index of selected item in current section.
- `currentSectionIndex`: Integer index of active section (0: Bangs/Calc, 1: Bookmarks, 2: Web Suggestions).
- `lastSelectedText`: String representation of the previously selected suggestion for auto-reselection.
- `latestSearchToken`: Monotonically increasing cancellation token to discard stale async suggestion responses.
- `lastBookmarkHtml`: Cached HTML string preventing redundant DOM rebuilds during rapid keystrokes.
- `lastSuggestionHtml`: Cached HTML string for external web suggestion items.
- `suggestionAbortController`: `AbortController` instance cancelling in-flight `fetch` requests on new keystrokes.
- `searchNavigationLocked`: Mutex lock preventing race conditions during fast keyboard selection updates.

### C. DOM Dependencies:
- `#search-input`: Primary search input element.
- `#search-results-panel`: Dropdown panel displaying multi-tier search results.
- `#bookmark-results-container`: Container rendering matching bookmark items.
- `#suggestion-results-container`: Container rendering live web suggestions and Bangs.
- `.widget-search`: Search widget container toggling `.results-open`.
- `.search-area-wrapper`: Wrapper container toggling `.search-focused`.
- `document.body`: Toggling `.search-focus-active`.

---

## 3. Architecture of `window.HomebaseSearchInteractionController`

### Proposed Path:
`src/newtab/search/search-interaction-controller.js`

### Exposed Controller API:
```javascript
window.HomebaseSearchInteractionController = {
  // Primary lifecycle
  initialize(options = {}),
  destroy(),

  // Event dispatchers
  handleInput(event),
  handleKeydown(event),
  handleSubmit(event),
  handleResultClick(event),
  handleResultMouseDown(event),

  // Search execution & navigation
  executeSearch(query, engine = null, newTab = null),
  openSearchUrl(url, newTab = null),

  // Selection & Keyboard navigation
  selectItem(item, explicit = true),
  moveSection(delta),
  clearAllSelections(),
  getCurrentSectionItems(),
  getSelectedResult(),
  getSelectionSnapshot(),
  applySelectionToCurrentResults(options = {}),

  // Suggestions & Intelligence
  fetchSuggestions(query, engine),
  getBangSuggestions(query),
  abortSuggestionFetch(),
  clearExternalSuggestionResults(),
  setSuggestionsPreference(enabled),
  updatePanelVisibility(),
  hydrateSearchResultFavicons(container),

  // State inspection
  getState()
};
```

### Architectural Invariants:
1. **Preserve Cancellation Semantics**: `latestSearchToken` and `suggestionAbortController` must continue cancelling outdated async fetches to prevent out-of-order suggestions rendering.
2. **Preserve 4-Tier Result Selection**: Keyboard arrow navigation order remains:
   - Tier 0: Direct Bangs / Calculator evaluation
   - Tier 1: Matching Bookmarks
   - Tier 2: Web Suggestions (Google, DuckDuckGo, YouTube, etc.)
3. **Preserve URL Opening Logic**: Privileged schemes (`about:`, `view-source:`) use direct `window.location.href`; standard web URLs leverage `browser.tabs.create` or `browser.tabs.update`.
4. **Seamless Integration with `search-ui-controller.js`**: Reads active engine and updates search input placeholder via `HomebaseSearchUiController`.

---

## 4. Functions to Move vs. Compatibility Delegates in `src/new-tab.js`

All 30 functions will have their large implementations removed from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) and replaced with 1–3 line delegating wrappers:

```javascript
// Example delegation in src/new-tab.js:
function handleSearchInput(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleInput === 'function') {
    return window.HomebaseSearchInteractionController.handleInput(event);
  }
}

function handleSearchKeydown(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleKeydown === 'function') {
    return window.HomebaseSearchInteractionController.handleKeydown(event);
  }
}

function executeSearch(query, engine, newTab) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.executeSearch === 'function') {
    return window.HomebaseSearchInteractionController.executeSearch(query, engine, newTab);
  }
}
```

This ensures zero breaking changes for internal callers, keyboard event listeners, and bookmark search hooks.

---

## 5. Script Loading Order in `src/new-tab.html`

`search-interaction-controller.js` will be inserted immediately after `search-ui-controller.js` and before `search-engine-settings.js`:

```html
  <!-- Search helpers -->
  <script src="newtab/search/search-utils.js" defer></script>
  <script src="newtab/search/search-suggestion-cache.js" defer></script>
  <script src="newtab/search/search-ui-controller.js" defer></script>
  <script src="newtab/search/search-interaction-controller.js" defer></script>

  <!-- Settings helpers -->
  <script src="newtab/settings/search-engine-settings.js" defer></script>
```

- Total deferred scripts checked: **51** (will increase by 1).
- `src/preload.js` remains synchronous in `<head>`.
- `src/new-tab.js` remains the final deferred script.

---

## 6. Expected Line Reduction

- **Current `src/new-tab.js` Line Count:** 11,385 lines
- **Lines Targeted for Extraction:** ~2,220 lines
- **Replacement Wrappers Overhead:** ~120 lines
- **Projected Net Reduction:** **~1,650 to 1,800 lines**
- **Projected New `src/new-tab.js` Line Count:** **<9,650 lines** (crossing below the 10,000-line milestone!)

---

## 7. Testing Strategy

### Unit Test File:
`tests/unit/search-interaction-controller.test.mjs`

### Test Coverage Plan (7 Comprehensive Tests):
1. **Controller Exports**: Verify all methods exist on `window.HomebaseSearchInteractionController`.
2. **Query Execution & URL Resolution**: Verify direct queries, URL detection (IPs, localhost, protocols), and Bang query resolution dispatch correct navigation URLs.
3. **Keyboard Navigation & Section Traversal**: Verify `ArrowUp`, `ArrowDown`, `Tab`, and `Enter` traverse sections (Bangs -> Bookmarks -> Suggestions) and sync input text.
4. **Suggestions Fetching & Invalidation**: Verify `latestSearchToken` prevents stale suggestion responses from overriding fresh user queries.
5. **AbortController Request Cancellation**: Verify in-flight requests abort properly when a new search token is generated.
6. **Result Mouse Interaction**: Verify clicking suggestion rows or bookmark items dispatches search/navigation and closes the results panel.
7. **Headless & Missing DOM Resilience**: Verify all methods degrade gracefully when DOM elements or APIs are missing or stubbed.

---

## 8. Rollback Strategy

If any regression occurs during implementation:
1. Revert the script tag addition in `src/new-tab.html`.
2. Revert delegation wrappers in `src/new-tab.js` to restore original inline functions.
3. Remove `src/newtab/search/search-interaction-controller.js` and `tests/unit/search-interaction-controller.test.mjs`.
4. Run `npm.cmd test` and `npm.cmd run build` to verify restoration.
