# Cycle #16 Phase 4 Search Subsystem Audit

## 1. Executive Summary
Following the extraction of `HomebaseSearchResultsRenderer` in Phases 1–3 of Cycle #16, this Phase 4 audit inspects all 7 modules comprising the search subsystem (`src/newtab/search/`) to identify remaining mixed responsibilities, dead compatibility wrappers, duplicate logic, event listener lifecycle risks, and boundary integrity.

The overall search architecture is significantly more modular than at the start of Cycle #15. The extraction of suggestions into `HomebaseSearchSuggestionService` and DOM rendering into `HomebaseSearchResultsRenderer` has isolated side effects, network requests, and DOM synthesis from the interaction controller.

---

## 2. Inventory of Search Subsystem Modules

| Module File | Current Lines | Canonical Role | Global Export |
|---|---|---|---|
| `search-interaction-controller.js` | 1,605 | Input events, debouncing, keyboard navigation, result selection state, search coordination | `window.HomebaseSearchInteractionController` |
| `search-results-renderer.js` | 566 | Dropdown DOM element creation, icon generation, container clearing, panel visibility | `window.HomebaseSearchResultsRenderer` |
| `search-ui-controller.js` | 943 | Engine selector UI popup, icon rendering, engine cycling, active engine state | `window.HomebaseSearchUiController` |
| `search-storage.js` | 449 | Search engine configurations, active engine ID, fast-search localStorage mirror | `window.HomebaseSearchStorage` |
| `search-suggestion-service.js` | 239 | Remote suggestions fetching, abort lifecycle, payload normalization, bang routing | `window.HomebaseSearchSuggestionService` |
| `search-suggestion-cache.js` | 33 | 150-item in-memory LRU cache map | `window.getSuggestionCacheEntry`, `setSuggestionCacheEntry` |
| `search-utils.js` | 290 | Pure parsing helpers: arithmetic evaluation, unit conversions, URL heuristics | `evaluateMath`, `evaluateUnits`, `isLikelyUrl` |

---

## 3. Detailed Audit Findings

### 3.1 Remaining Mixed Responsibilities
- **`search-interaction-controller.js`**:
  - Primary responsibility: User input flow, debouncing, keyboard navigation (Arrow Up/Down, Enter, Tab, Escape), selection index tracking, query token race protection.
  - Secondary search coordination: Querying `browser.history.search`, filtering bookmarks, invoking math/unit evaluators, calling `HomebaseSearchSuggestionService.fetchSuggestions`.
  - Grid scroll assistance: Tracks pointer hover over the bookmark grid (`isBookmarkGridPointerOver`, `scrollBookmarkGridForKey`) to scroll bookmarks when the search bar is passive. While tightly related to the global keyboard experience, this maintains keyboard accessibility.
  - Conclusion: Responsibilities are appropriately partitioned; no further extractions required in Cycle #16.

### 3.2 Dead Compatibility Wrappers & Unused Code
- **`createSvgIcon(id)` in `search-interaction-controller.js` (lines 305–313)**:
  - Following the extraction of DOM rendering to `HomebaseSearchResultsRenderer`, all internal SVG icon generation now occurs inside `search-results-renderer.js`.
  - `createSvgIcon()` inside `search-interaction-controller.js` is never called internally and is not part of the public `controller` interface. It is dead code.
- **`syncGlobals()` in `search-interaction-controller.js` (lines 315–321)**:
  - This empty helper contains a legacy no-op assignment (`currentSelectionIndex = currentSelectionIndex`). It is never invoked anywhere in the codebase.
- **Action**: Safely remove `createSvgIcon` and `syncGlobals` from `search-interaction-controller.js`.

### 3.3 Storage Boundary Audit
- Confirmed: `search-storage.js` is the **only** module within `src/newtab/search/` that accesses:
  - `HomebaseStorage.set`
  - `HomebaseStorage.setMany`
  - `browser.storage.local.set`
  - `localStorage.setItem(FAST_SEARCH_STORAGE_KEY, ...)`
- Zero storage writes exist in `search-interaction-controller.js`, `search-ui-controller.js`, `search-results-renderer.js`, `search-utils.js`, or `search-suggestion-service.js`.
- The storage boundary is 100% intact and clean.

### 3.4 Event Listener Lifecycle Risks
- **Bookmark Grid Pointer Listeners**:
  - `setupBookmarkGridPointerTracking()` in `search-interaction-controller.js` binds `pointerenter` and `pointerleave` listeners to the bookmarks grid (`#bookmarks-grid`).
  - Currently, anonymous functions are bound without storing references.
  - When `destroy()` is called:
    - Listeners on the bookmarks grid are **not removed**.
    - `bookmarkGridPointerListenersAttached` is **not reset** to `false`.
    - `isBookmarkGridPointerOver` is **not reset** to `false`.
  - If `destroy()` is called and the controller is re-initialized, new listeners would not attach because `bookmarkGridPointerListenersAttached` remained `true`.
- **Action**: Store listener references (`boundGridPointerEnterHandler`, `boundGridPointerLeaveHandler`), remove them in `destroy()`, and reset tracking flags.

### 3.5 Renderer Boundary Validation
- `search-results-renderer.js`:
  - Confirmed: Pure presentation layer.
  - Does NOT access `HomebaseStorage` or `browser.storage`.
  - Does NOT invoke network requests (`fetch`).
  - Does NOT mutate controller state (`currentSelectionIndex`, `latestSearchToken`, etc.).
  - Returns DOM nodes or updates result containers based strictly on passed arguments.
  - Conclusion: Renderer boundaries are strictly adhered to.

### 3.6 Utility Ownership Audit
- `search-utils.js`:
  - Contains `evaluateMath`, `evaluateUnits`, and `isLikelyUrl`.
  - These pure functions do not depend on DOM, storage, or runtime state.
  - They are declared as top-level functions in classic script mode.
  - To align with the Homebase module conventions while preserving top-level declarations, expose `window.HomebaseSearchUtils = { evaluateMath, evaluateUnits, isLikelyUrl }`.

---

## 4. Remediation Plan for Phase 4

1. **`search-interaction-controller.js` Lifecycle Hardening**:
   - Store grid pointer tracking listeners and remove them on `destroy()`.
   - Reset `bookmarkGridPointerListenersAttached` and `isBookmarkGridPointerOver` in `destroy()`.
   - Remove unused functions `createSvgIcon()` and `syncGlobals()`.
   - Verify repeated calls to `initialize()` and `destroy()` remain strictly safe.
2. **`search-utils.js` Namespace Export**:
   - Expose `globalScope.HomebaseSearchUtils` with `evaluateMath`, `evaluateUnits`, `isLikelyUrl`.
3. **Test Expansion**:
   - Test repeated `initialize()` / `destroy()` cycles and ensure grid pointer listeners are cleaned.
   - Test graceful behavior when `HomebaseSearchResultsRenderer` is absent.
   - Test keyboard navigation edge cases (empty sections, section jumping).
   - Test malformed or empty history and bookmark inputs.
4. **Verification**:
   - Run complete suite (`node --check`, static invariant checker, `npm.cmd test`, `npm.cmd run build`, zero protected files diff).
