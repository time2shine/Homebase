# Homebase Improvement Cycle #10 Phase 4 — Implementation Report

**Target Domain:** Search Interaction, Suggestions & Keyboard Navigation  
**Target Module:** `src/newtab/search/search-interaction-controller.js`  
**Global Controller:** `window.HomebaseSearchInteractionController`  
**Status:** Completed & Verified  

---

## 1. Overview & Architecture Goals

Phase 4 of Cycle #10 extracted the search interaction domain from the monolithic `src/new-tab.js` into a dedicated controller: `src/newtab/search/search-interaction-controller.js`.

The controller encapsulates:
- Search input handling & debouncing coordination
- Keyboard navigation (ArrowDown, ArrowUp, Enter, Tab, Escape)
- Result selection state (`currentSelectionIndex`, `currentSectionIndex`, `selectionExplicit`, `lastSelectedText`)
- Selection persistence across query filter changes (`applySelectionToCurrentResults`, `restoreSelectionAfterFilter`)
- Search submission and query execution routing (`handleSubmit`, `executeSearch`, `openSearchUrl`)
- Bang query parsing, matching, and dropdown generation (`!g`, `!d`, `!b`, etc.)
- Calculator & math evaluation routing (`evaluateMath`, `evaluateUnits`)
- Bookmark result selection & rendering integration
- Web suggestion fetching across engines (Google, Bing, DuckDuckGo, Yahoo, Yandex) with OpenSearch format normalization
- Stale search cancellation via `AbortController` and token increments
- Search suggestions user preference toggle and cache clearing
- Result favicon hydration via `resolveFaviconForImageTarget`
- Result panel visibility toggling and active styling
- Bookmark grid scroll pass-through when search input is empty and passive

All original function signatures in `src/new-tab.js` are preserved as lightweight delegates.

---

## 2. Extracted Functions & Responsibilities

The following functions and procedures were extracted into `src/newtab/search/search-interaction-controller.js`:

| Extracted Function | Primary Responsibility |
|---|---|
| `initialize(options)` | Controller initialization, pointer listener setup, and optional event binding |
| `destroy()` | Clean teardown, abort controller cancellation, selection reset, and listener unbinding |
| `handleInput(event)` | Input orchestration: bang icon switching, math/bookmarks/history/suggestions fetching |
| `handleKeydown(event)` | Keyboard navigation across sections, arrow cycling, Enter submission, Escape dismissal |
| `handleSubmit(event)` | Form submission handling, lock management, explicit selection vs query search dispatch |
| `handleResultClick(event)` | Click delegation: copy buttons, bang inserts, URL opening |
| `handleResultMouseDown(event)` | Pointer press tracking, explicit suggestion selection flag |
| `executeSearch(query, engine, newTab)` | Query string resolution, bang stripping, URL detection, search engine dispatch |
| `openSearchUrl(url, newTab)` | Privileged scheme handling (`about:`, `view-source:`), `browser.tabs` navigation |
| `selectItem(items, index, explicit)` / `selectItem(item, explicit)` | Item selection, class toggling, DOM scrolling, input synchronization |
| `moveSection(direction)` | Section cycling (bookmarks <-> suggestions) on Tab / Boundary arrow navigation |
| `clearAllSelections()` | Removes selection classes and resets selection indices |
| `getCurrentSectionItems(sectionIndex)` | Returns array of DOM `.result-item` elements for the active or given section |
| `getSelectedResult()` | Returns the currently selected item element if selection is explicit |
| `getSelectionSnapshot()` | Captures `{ sectionIndex, url, text, itemIndex }` across async re-renders |
| `applySelectionToCurrentResults(snapshot, query)` | Restores selection after result container re-render |
| `restoreSelectionAfterFilter()` | Restores selected item by matching `lastSelectedText` |
| `maybeAutoSelectSuggestion(query)` | Auto-selects first suggestion when no bookmark matches exist |
| `fetchSuggestions(query, engine)` | Async network suggestions with OpenSearch/DDG/Yahoo/Yandex parsers |
| `getBangSuggestions(query)` | Matches bang shortcuts against `bangMap` and `searchEngines` |
| `abortSuggestionFetch()` | Aborts in-flight `AbortController` request |
| `clearExternalSuggestionResults()` | Prunes external suggestion nodes and headers from the DOM |
| `setSuggestionsPreference(enabled)` | Updates preference, toggles UI switch, aborts in-flight fetches, clears cache |
| `updatePanelVisibility()` | Toggles panel `.hidden` and search widget `.results-open` classes |
| `hydrateSearchResultFavicons(container)` | Asynchronously resolves and decodes favicons for search result items |
| `isSearchKeyboardContext(event)` | Validates whether keyboard event originated inside search components |
| `isBookmarkGridScrollKey(key)` | Checks if key is an arrow/page navigation key for grid scrolling |
| `isSearchInputEmptyAndPassive()` | Checks if search input is focused but empty with results hidden |
| `getBookmarkScrollContainer()` | Resolves the scrollable bookmark grid container element |
| `isPointerOverBookmarkGrid()` | Determines whether the cursor is currently over the bookmark grid |
| `scrollBookmarkGridForKey(key)` | Scrolls bookmark grid by keyboard step when search input is passive |
| `setupBookmarkGridPointerTracking()` | Attaches pointerenter/pointerleave listeners on bookmarks grid |
| `attachHoverSync()` | Attaches hover synchronization on result items |
| `isStaleSearch(token, queryLower)` | Guards async search responses against stale race conditions |
| `getState()` | Returns snapshot of internal selection and lock state |

---

## 3. Remaining Wrappers in `src/new-tab.js`

To guarantee 100% backward compatibility with internal callers and existing tests, lightweight delegates remain in `src/new-tab.js`:

```javascript
async function openSearchUrl(url, newTab) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.openSearchUrl === 'function') {
    return window.HomebaseSearchInteractionController.openSearchUrl(url, newTab);
  }
}

function executeSearch(query, engine, newTab) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.executeSearch === 'function') {
    return window.HomebaseSearchInteractionController.executeSearch(query, engine, newTab);
  }
}

function isSearchKeyboardContext(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isSearchKeyboardContext === 'function') {
    return window.HomebaseSearchInteractionController.isSearchKeyboardContext(event);
  }
  return false;
}

function isBookmarkGridScrollKey(key) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isBookmarkGridScrollKey === 'function') {
    return window.HomebaseSearchInteractionController.isBookmarkGridScrollKey(key);
  }
  return false;
}

function isSearchInputEmptyAndPassive() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isSearchInputEmptyAndPassive === 'function') {
    return window.HomebaseSearchInteractionController.isSearchInputEmptyAndPassive();
  }
  return false;
}

function getBookmarkScrollContainer() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getBookmarkScrollContainer === 'function') {
    return window.HomebaseSearchInteractionController.getBookmarkScrollContainer();
  }
  return null;
}

function isPointerOverBookmarkGrid() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isPointerOverBookmarkGrid === 'function') {
    return window.HomebaseSearchInteractionController.isPointerOverBookmarkGrid();
  }
  return false;
}

function scrollBookmarkGridForKey(key) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.scrollBookmarkGridForKey === 'function') {
    return window.HomebaseSearchInteractionController.scrollBookmarkGridForKey(key);
  }
}

function setupBookmarkGridPointerTracking() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.setupBookmarkGridPointerTracking === 'function') {
    return window.HomebaseSearchInteractionController.setupBookmarkGridPointerTracking();
  }
}

function getCurrentSectionItems(sectionIndex = currentSectionIndex) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getCurrentSectionItems === 'function') {
    return window.HomebaseSearchInteractionController.getCurrentSectionItems(sectionIndex);
  }
  return [];
}

function removeSelectionClasses() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.removeSelectionClasses === 'function') {
    return window.HomebaseSearchInteractionController.removeSelectionClasses();
  }
}

function clearAllSelections() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.clearAllSelections === 'function') {
    return window.HomebaseSearchInteractionController.clearAllSelections();
  }
}

function syncSearchInputWithItem(item) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.syncSearchInputWithItem === 'function') {
    return window.HomebaseSearchInteractionController.syncSearchInputWithItem(item);
  }
}

function getResultLabelText(item) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getResultLabelText === 'function') {
    return window.HomebaseSearchInteractionController.getResultLabelText(item);
  }
  return '';
}

function selectItem(items, index) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.selectItem === 'function') {
    return window.HomebaseSearchInteractionController.selectItem(items, index);
  }
}

function attachHoverSync() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.attachHoverSync === 'function') {
    return window.HomebaseSearchInteractionController.attachHoverSync();
  }
}

function moveSection(direction) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.moveSection === 'function') {
    return window.HomebaseSearchInteractionController.moveSection(direction);
  }
}

function getSelectedResult() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getSelectedResult === 'function') {
    return window.HomebaseSearchInteractionController.getSelectedResult();
  }
  return null;
}

function getSelectionSnapshot() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getSelectionSnapshot === 'function') {
    return window.HomebaseSearchInteractionController.getSelectionSnapshot();
  }
  return null;
}

function handleSearch(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleSubmit === 'function') {
    return window.HomebaseSearchInteractionController.handleSubmit(event);
  }
}

function handleSearchResultMouseDown(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleResultMouseDown === 'function') {
    return window.HomebaseSearchInteractionController.handleResultMouseDown(e);
  }
}

function handleSearchResultClick(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleResultClick === 'function') {
    return window.HomebaseSearchInteractionController.handleResultClick(e);
  }
}

function handleSearchKeydown(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleKeydown === 'function') {
    return window.HomebaseSearchInteractionController.handleKeydown(e);
  }
}

function restoreSelectionAfterFilter() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.restoreSelectionAfterFilter === 'function') {
    return window.HomebaseSearchInteractionController.restoreSelectionAfterFilter();
  }
  return false;
}

function maybeAutoSelectSuggestion(query) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.maybeAutoSelectSuggestion === 'function') {
    return window.HomebaseSearchInteractionController.maybeAutoSelectSuggestion(query);
  }
}

function applySelectionToCurrentResults(snapshot = null, query = '') {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.applySelectionToCurrentResults === 'function') {
    return window.HomebaseSearchInteractionController.applySelectionToCurrentResults(snapshot, query);
  }
}

function isStaleSearch(token, queryLower) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isStaleSearch === 'function') {
    return window.HomebaseSearchInteractionController.isStaleSearch(token, queryLower);
  }
  return false;
}

function abortSuggestionFetch() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.abortSuggestionFetch === 'function') {
    return window.HomebaseSearchInteractionController.abortSuggestionFetch();
  }
}

function clearExternalSuggestionResults() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.clearExternalSuggestionResults === 'function') {
    return window.HomebaseSearchInteractionController.clearExternalSuggestionResults();
  }
}

function setSearchSuggestionsPreference(enabled) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.setSuggestionsPreference === 'function') {
    return window.HomebaseSearchInteractionController.setSuggestionsPreference(enabled);
  }
  appSearchSuggestionsPreference = enabled !== false;
  if (appSearchSuggestionsToggle) {
    appSearchSuggestionsToggle.checked = appSearchSuggestionsPreference;
  }
}

async function fetchSearchSuggestions(query, engine) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.fetchSuggestions === 'function') {
    return window.HomebaseSearchInteractionController.fetchSuggestions(query, engine);
  }
  return [];
}

function getBangSuggestions(query) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getBangSuggestions === 'function') {
    return window.HomebaseSearchInteractionController.getBangSuggestions(query);
  }
  return [];
}

function updatePanelVisibility() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.updatePanelVisibility === 'function') {
    return window.HomebaseSearchInteractionController.updatePanelVisibility();
  }
}

function hydrateSearchResultFavicons(container) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.hydrateSearchResultFavicons === 'function') {
    return window.HomebaseSearchInteractionController.hydrateSearchResultFavicons(container);
  }
}

async function handleSearchInput(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleInput === 'function') {
    return window.HomebaseSearchInteractionController.handleInput(event);
  }
}
```

---

## 4. Script Loading & Dependency Notes

### Script Tag Placement
In `src/new-tab.html`:
```html
  <script src="newtab/search/search-utils.js" defer></script>
  <script src="newtab/search/search-suggestion-cache.js" defer></script>
  <script src="newtab/search/search-ui-controller.js" defer></script>
  <script src="newtab/search/search-interaction-controller.js" defer></script>
  <script src="newtab/settings/search-engine-settings.js" defer></script>
```

- Positioned directly after `search-ui-controller.js` so it can access `window.HomebaseSearchUiController`.
- Positioned before `search-engine-settings.js` and `new-tab.js`.
- Preserves synchronous `preload.js` as the sole script in `<head>`.
- Preserves `new-tab.js` as the final deferred runtime script (script 51/51).

---

## 5. Test Coverage

A dedicated unit test suite was implemented in `tests/unit/search-interaction-controller.test.mjs`:

1. **Controller Export Availability**: Confirms `window.HomebaseSearchInteractionController` exists and implements all 24 required API methods.
2. **Lifecycle Management**: Tests `initialize({ bindEvents: true })` and `destroy()` clean state and token resets.
3. **Search Execution Routing**: Validates `executeSearch` handling standard search engine query URLs, URL detection scheme bypasses, and new-tab navigation overrides.
4. **Keyboard Arrow Navigation**: Tests `handleKeydown` ArrowDown, ArrowUp selection movement across items and sections.
5. **Selection State Management**: Tests `selectItem`, `clearAllSelections`, `getSelectionSnapshot`, and explicit selection checks.
6. **Suggestion Cancellation & Preference**: Tests `setSuggestionsPreference(false)` clearing external suggestion items, aborting fetch requests, and cache clearing.
7. **Bang and Math Routing**: Tests `getBangSuggestions` returning matching engines, and `handleInput` evaluating calculator expressions (`24 * 7` -> `168`) into `.calc-item`.
8. **Headless DOM Safety**: Validates all controller methods execute without throwing in a headless environment with missing elements.

### Suite Verification Results
- **Stage 1 (Syntax Validation)**: `node --check` passed on all modified and newly created files.
- **Stage 2 (Static Invariants)**: `node scripts/check-newtab-static.mjs` passed 11/11 invariant checks.
- **Stage 3 (Unit Tests)**: 315/315 tests passed (9 new tests added).
- **Stage 4 (Browser Smoke Test)**: Pre-flight checks passed.

---

## 6. Line Reduction Summary

| File | Before | After | Delta |
|---|---|---|---|
| `src/new-tab.js` | 11,385 lines | 9,424 lines | **-1,961 lines** |
| `src/newtab/search/search-interaction-controller.js` | 0 lines | 1,873 lines | +1,873 lines |
| `src/new-tab.html` | 3,401 lines | 3,402 lines | +1 line |
| `tests/unit/search-interaction-controller.test.mjs` | 0 lines | 599 lines | +599 lines |

**Net codebase impact:**
- Monolith line reduction: **1,961 lines eliminated** from `src/new-tab.js`.
- 100% backward compatibility maintained with zero regressions across 315 test cases.

---

## 7. Protected Boundaries Check

Verification command:
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
```
Output:
```text
(0 diff - clean)
```
Protected files remained untouched.

---

## 8. Rollback Strategy

In case of issues prior to commit:
```powershell
git checkout -- src/new-tab.js src/new-tab.html
rm src/newtab/search/search-interaction-controller.js
rm tests/unit/search-interaction-controller.test.mjs
rm docs/61-cycle10-phase4-implementation-report.md
```
Restores working tree cleanly to commit `41d43db`.
