# Cycle #16 Phase 1 — Search Results Renderer Audit

## 1. Executive Summary
Following the successful completion of Cycle #15 (which encapsulated search storage and extracted external suggestion networking into `HomebaseSearchSuggestionService`), `HomebaseSearchInteractionController` (`src/newtab/search/search-interaction-controller.js`) remains 1,887 lines long. 

While network calls and persistence writes have been decoupled, the controller currently combines two distinct domains:
1. **Interaction & State Orchestration**: Input debounce, keyboard events, selection tracking, navigation priorities, and search URL execution.
2. **DOM View Rendering**: Manual DOM element creation (`document.createElement`), SVG icon generation, DOM hierarchy assembly, text node assignment, container reconciliation (`replaceChildren`), HTML signature caching, and favicon image hydration.

Over 250 lines within the central `handleInput()` routine are dedicated purely to imperative DOM tree construction for 6 distinct result types (Calculator, Bookmarks, Bang Shortcuts, Recent History, Active Engine Direct Search, and External Suggestions).

The goal of Cycle #16 is to extract these rendering responsibilities into a dedicated, presentation-only view module: `src/newtab/search/search-results-renderer.js`.

---

## 2. Current Controller Analysis

### 2.1 File Metrics
- **File**: [`src/newtab/search/search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js)
- **Line Count**: 1,887 lines
- **Total Functions Identified**: 70 functions
- **Estimated DOM Rendering Footprint**: ~350 lines (DOM creation, signature caching, favicon hydration, and icon markup)

### 2.2 Complete Function Inventory & Classification

Every function in `src/newtab/search/search-interaction-controller.js` is classified into one of four primary architectural categories:

| # | Function | Location (Line) | Category | Core Responsibility |
|---|:---|:---|:---|:---|
| 1 | `isElementOrObject` | 33 | Helper | Type guard for DOM element or node-like object |
| 2 | `getSearchForm` | 40 | DOM Accessor | Retrieves search form DOM element |
| 3 | `getSearchInput` | 46 | DOM Accessor | Retrieves search input element |
| 4 | `getSearchResultsPanel` | 52 | DOM Accessor | Retrieves search results dropdown container |
| 5 | `getBookmarkResultsContainer` | 58 | DOM Accessor | Retrieves upper/top bookmark results container |
| 6 | `getSuggestionResultsContainer` | 64 | DOM Accessor | Retrieves lower suggestion results container |
| 7 | `getSearchWidget` | 70 | DOM Accessor | Retrieves search widget root container |
| 8 | `getSearchAreaWrapper` | 76 | DOM Accessor | Retrieves search area wrapper element |
| 9 | `getSuggestionsToggle` | 82 | DOM Accessor | Retrieves suggestions toggle element |
| 10 | `getResultSections` | 88 | DOM Accessor | Returns array of top and bottom result containers |
| 11 | `getSearchOpenNewTabPreference` | 95 | Prefs / State | Reads new-tab navigation preference |
| 12 | `getSearchMathPreference` | 103 | Prefs / State | Reads math/calculator evaluation preference |
| 13 | `getSearchShowHistoryPreference` | 111 | Prefs / State | Reads recent history display preference |
| 14 | `getSearchSuggestionsPreference` | 119 | Prefs / State | Reads external suggestion fetch preference |
| 15 | `setSuggestionsPreference` | 127 | Prefs / State | Updates external suggestion preference |
| 16 | `getSearchEngines` | 150 | Search Execution | Retrieves configured search engine list |
| 17 | `getCurrentSearchEngine` | 163 | Search Execution | Retrieves active search engine object |
| 18 | `getActiveSearchEngineId` | 177 | Search Execution | Resolves active search engine identifier |
| 19 | `getBangMap` | 187 | Search Execution | Delegates bang prefix map to suggestion service |
| 20 | `getAllBookmarks` | 213 | Search Execution | Retrieves in-memory bookmark tree from `window.allBookmarks` |
| 21 | `callUpdateSearchUI` | 223 | UI Delegation | Calls global `updateSearchUI` |
| 22 | `callClearSearchUI` | 232 | UI Delegation | Calls global `clearSearchUI` |
| 23 | `callHideSearchResultsPanel` | 244 | UI Delegation | Calls global `hideSearchResultsPanel` |
| 24 | `callCycleSearchEngine` | 257 | UI Delegation | Calls global `cycleSearchEngine` |
| 25 | `callHandleSearchChange` | 266 | UI Delegation | Calls global `handleSearchChange` |
| 26 | `checkIsLikelyUrl` | 275 | Search Execution | Regex heuristic testing if query is a direct URL |
| 27 | `getCacheEntry` | 281 | Cache Helper | Local/global suggestion cache reader |
| 28 | `setCacheEntry` | 287 | Cache Helper | Local/global suggestion cache writer |
| 29 | `createSvgIcon` | 292 | **Rendering** | Creates SVG icon DOM element via `createSvgIconElement` |
| 30 | `syncGlobals` | 298 | State Helper | Synchronizes legacy selection global index |
| 31 | `isBookmarkGridScrollKey` | 307 | Input / Events | Checks if key is PageUp/PageDown/Home/End for grid |
| 32 | `isSearchInputEmptyAndPassive` | 316 | Input / Events | Checks if search input is unfocused and empty |
| 33 | `getBookmarkScrollContainer` | 325 | DOM Accessor | Resolves bookmark scroll container element |
| 34 | `isPointerOverBookmarkGrid` | 335 | Input / Events | Raycasts if mouse cursor is over bookmark grid |
| 35 | `scrollBookmarkGridForKey` | 343 | Input / Events | Scrolls bookmark grid when typing in empty passive state |
| 36 | `setupBookmarkGridPointerTracking` | 376 | Input / Events | Sets up pointerover / pointerout grid tracking |
| 37 | `isSearchKeyboardContext` | 391 | Input / Events | Validates if key event originates from search widget |
| 38 | `getCurrentSectionItems` | 423 | State Management | Queries `.result-item` elements in active section |
| 39 | `removeSelectionClasses` | 430 | State Management | Removes `.selected` CSS class from all items |
| 40 | `clearAllSelections` | 440 | State Management | Resets selection index to -1 and explicit flag to false |
| 41 | `syncSearchInputWithItem` | 446 | State Management | Updates input value to match selected result label |
| 42 | `getResultLabelText` | 456 | Helper / Format | Extracts clean text label from `.result-label` |
| 43 | `selectItem` | 463 | State Management | Applies `.selected` class and scrolls item into view |
| 44 | `attachHoverSync` | 512 | Input / Events | Attaches `mouseenter` hover synchronization to result items |
| 45 | `moveSection` | 535 | State Management | Moves selection between top and bottom sections (Tab) |
| 46 | `getSelectedResult` | 554 | State Management | Returns current explicitly selected DOM element |
| 47 | `getSelectionSnapshot` | 563 | State Management | Captures URL/text snapshot before results re-render |
| 48 | `restoreSelectionAfterFilter` | 580 | State Management | Re-applies selection after result list updates |
| 49 | `maybeAutoSelectSuggestion` | 608 | State Management | Auto-selects first suggestion when bookmarks are empty |
| 50 | `applySelectionToCurrentResults` | 641 | State Management | Restores selection snapshot or auto-selection |
| 51 | `openSearchUrl` | 727 | Search Execution | Dispatches URL navigation to `browser.tabs` or window |
| 52 | `clearOnLeave` | 753 | Search Execution | Clears search input on `pagehide` |
| 53 | `executeSearch` | 789 | Search Execution | Constructs engine search URL or executes direct URL |
| 54 | `handleSubmit` | 832 | Input / Events | Handles search form `submit` event |
| 55 | `handleResultMouseDown` | 859 | Input / Events | Prevents blur on mouse down within results |
| 56 | `handleResultClick` | 868 | Input / Events | Handles click delegation on result items and copy buttons |
| 57 | `handleKeydown` | 919 | Input / Events | Handles ArrowUp, ArrowDown, Tab, Enter, Escape keys |
| 58 | `isStaleSearch` | 1077 | State Management | Guards against async search token race conditions |
| 59 | `abortSuggestionFetch` | 1083 | Search Execution | Delegates abort to suggestion service |
| 60 | `clearExternalSuggestionResults` | 1089 | **Rendering** | Mutates DOM to remove external suggestion rows |
| 61 | `fetchSuggestions` | 1124 | Search Execution | Delegates suggestion query to suggestion service |
| 62 | `getBangSuggestions` | 1136 | Search Execution | Delegates bang query to suggestion service |
| 63 | `updatePanelVisibility` | 1143 | **Rendering** | Toggles `.hidden` and `.results-open` based on DOM contents |
| 64 | `hydrateSearchResultFavicons` | 1161 | **Rendering** | Resolves and attaches favicons for rendered rows |
| 65 | `hideImg` | 1175 | **Rendering** | Hides broken favicon `<img>` and releases object URLs |
| 66 | `shouldAbort` | 1202 | **Rendering** | Abort check during async favicon resolution |
| 67 | `handleInput` | 1225 | **Mixed (Exec+Render)** | Coordinates search pipeline, triggers math, bookmarks, bangs, history, suggestions, and constructs full DOM tree |
| 68 | `initialize` | 1657 | Lifecycle | Binds DOM event listeners and initializes pointer tracking |
| 69 | `destroy` | 1742 | Lifecycle | Teardown: detaches listeners, aborts suggestions, resets state |
| 70 | `getState` | 1811 | State Inspection | Exports read-only state snapshot for unit testing |

---

## 3. Rendering Responsibility Inventory

Currently, `handleInput()` contains large inline DOM creation blocks. Below is the breakdown of candidate functions to extract into `HomebaseSearchResultsRenderer`:

| Candidate / Component | Current Location | Proposed Renderer API | Responsibility | Move to Renderer? |
|:---|:---|:---|:---|:---:|
| **Calculator Item** | `handleInput` (L1312–L1355) | `renderCalculatorItem({ query, result })` | Builds `.result-item.calc-item`, `.calc-icon`, `.calc-answer`, `.calc-copy` button | **Yes** |
| **Bookmark Items** | `handleInput` (L1370–L1405) | `renderBookmarkItem(bookmark)` | Builds `.result-item`, `.result-favicon`, label strong tag, datasets | **Yes** |
| **Bang Shortcuts** | `handleInput` (L1412–L1457) | `renderBangItem(bangItem)` / `renderBangEmpty()` | Builds `.bang-badge`, engine SVG icon, label, bang insertion dataset | **Yes** |
| **Recent History Items** | `handleInput` (L1541–L1575) | `renderHistoryItem(historyItem)` | Builds `.result-item-history`, `historyClock` SVG icon, label | **Yes** |
| **Direct Engine Query** | `handleInput` (L1585–L1609) | `renderDirectQueryItem({ engine, query })` | Builds `.result-item-suggestion`, engine `search` SVG icon, label | **Yes** |
| **Suggestion Items** | `handleInput` (L1614–L1635) | `renderSuggestionItem({ engine, suggestion })` | Builds `.result-item-suggestion`, `search` SVG icon, label | **Yes** |
| **Section Headers** | `handleInput` (multiple) | `createSectionHeader(title, options)` | Builds `.result-header` (Bookmarks, Calculator, History, Search) | **Yes** |
| **SVG Icon Builder** | L292–L296 | `createSvgIcon(symbolId)` | Resolves SVG icon element from shared icon sprite | **Yes** |
| **Favicon Hydration** | L1161–L1220 | `hydrateFavicons(container)` | Asynchronous favicon resolution, decoding, loading, and fallback hiding | **Yes** |
| **Favicon Hide / Abort** | L1175–L1202 | Internal to renderer | Revokes object URLs and hides broken favicon `<img>` elements | **Yes** |
| **Clear Suggestions DOM**| L1089–L1122 | `clearSuggestions(container)` | Prunes suggestion DOM elements when suggestions preference disabled | **Yes** |
| **Panel Visibility Sync**| L1143–L1160 | `updatePanelVisibility({ panel, widget, top, bottom })` | Toggles `.hidden` class based on whether containers have children | **Yes** |
| **Top Section Mounting** | L1482–L1496 | `mountTopResults(container, { calc, bookmarks, query })` | Compares JSON signature, mounts DocumentFragment, hydrates favicons | **Yes** |
| **Bottom Section Mounting**| L1636–L1649 | `mountBottomResults(container, { history, suggestions, engine, query })` | Compares JSON signature, mounts DocumentFragment to container | **Yes** |
| **Text Highlighting** | *Not implemented* | `highlightMatch(text, query)` | Candidate feature: Highlight matched query characters inside labels | **Yes (New)** |
| **HTML Escaping** | `.textContent` inline | `escapeHtml(str)` | Standard text safety helper | **Yes** |

---

## 4. Current Flow vs. Proposed Flow

### Current Architecture Flow
```text
User Types Input
       │
       ▼
search-interaction-controller.js
  ├── 1. Debounce & input normalization
  ├── 2. Evaluate math / units
  ├── 3. Filter bookmarks
  ├── 4. Imperative DOM creation (L1312–L1405: Calculator, Bookmarks)
  ├── 5. Query history & suggestions
  ├── 6. Imperative DOM creation (L1541–L1635: History, Engine, Suggestions)
  ├── 7. Replace container children
  ├── 8. Hydrate favicons
  └── 9. Synchronize selection & keyboard focus
```
*Problem*: The controller mixes data fetching, calculations, DOM construction, image lifecycle, and keyboard focus in a monolithic 400-line function.

### Proposed Decoupled Flow
```text
User Types Input
       │
       ▼
search-interaction-controller.js (Controller / Orchestrator)
  ├── 1. Debounce & query normalization
  ├── 2. Evaluate math / units
  ├── 3. Query bookmarks (getAllBookmarks)
  ├── 4. Query history & suggestions (HomebaseSearchSuggestionService)
  │
  │   Passes structured result data
  ▼
search-results-renderer.js (View / DOM Renderer)
  ├── 1. Builds DOM DocumentFragments
  ├── 2. Inserts headers, badges, SVG icons
  ├── 3. Mounts fragments (mountTopResults, mountBottomResults)
  └── 4. Hydrates favicons (hydrateFavicons)
  │
  │   Notifies render complete
  ▼
search-interaction-controller.js (Selection & Interaction)
  ├── 1. Attaches hover listeners (attachHoverSync)
  ├── 2. Restores selection snapshot (applySelectionToCurrentResults)
  └── 3. Updates panel visibility (updatePanelVisibility)
```

---

## 5. Proposed search-results-renderer.js Module Boundary

### 5.1 Canonical Responsibilities (What the Renderer OWNS)
1. **DOM Tree Construction**: Pure functions that take structured data models (`bookmark`, `suggestion`, `historyItem`, `calcResult`) and return HTML elements or `DocumentFragment` instances.
2. **Visual Formatting & Badges**: Creating bang badges (`.bang-badge`), SVG icons (`historyClock`, `search`, engine symbols), and calculator layout (`.calc-left`, `.calc-copy`).
3. **Favicon Image Lifecycle**: Loading, decoding, async resolution via `resolveFaviconForImageTarget`, and fallback hiding.
4. **Signature Comparison & DOM Reconciliation**: Comparing cache signatures to prevent unnecessary DOM reflows when result lists are unchanged.
5. **Panel Visibility Determination**: Checking whether results exist and toggling visibility classes.

### 5.2 Disallowed Responsibilities (What the Renderer MUST NOT OWN)
1. **No Keyboard Navigation**: Keydown dispatch, ArrowUp/ArrowDown selection index tracking, and Enter execution remain exclusively in `search-interaction-controller.js`.
2. **No Direct Search Execution**: URL navigation, opening tabs, and search engine query formation belong in `search-interaction-controller.js`.
3. **No Storage Persistence**: Preferences reading and writing remain in `search-storage.js`.
4. **No Network Requests**: HTTP suggestions fetching remains in `search-suggestion-service.js`.
5. **No State Mutation**: Does not mutate `currentSelectionIndex`, `currentSectionIndex`, `latestSearchToken`, or `userIsTyping`.

### 5.3 Proposed Public Interface (`window.HomebaseSearchResultsRenderer`)
```javascript
window.HomebaseSearchResultsRenderer = {
  // Fragment & Element Builders
  createSectionHeader(title, options),
  createCalculatorItem(calcData),
  createBookmarkItem(bookmark),
  createBangItem(bangItem),
  createBangEmptyItem(),
  createHistoryItem(historyItem),
  createDirectQueryItem(engine, query),
  createSuggestionItem(engine, suggestion),
  createSvgIcon(symbolId),

  // Container Reconciliation & Mounting
  renderTopResults(container, { calc, bookmarks, query }),
  renderBottomResults(container, { history, suggestions, engine, query }),
  renderBangResults(container, bangSuggestions),
  clearSuggestions(container),
  clearAll(topContainer, bottomContainer),

  // Visual Assets & Favicons
  hydrateFavicons(container),
  updatePanelVisibility(options)
};
```

---

## 6. Migration Strategy

The extraction will follow the standard 3-phase Homebase migration pattern:

### Phase 2: Create Renderer Module (Additive Only)
- Create `src/newtab/search/search-results-renderer.js`.
- Wrap in an IIFE, exporting `window.HomebaseSearchResultsRenderer`.
- Register script tag in `src/new-tab.html` immediately before `search-ui-controller.js`.
- Update `scripts/check-newtab-static.mjs` to register the new module in `keyExtractedModulePaths`.
- Write dedicated unit tests in `tests/unit/search-results-renderer.test.mjs`.

### Phase 3: Integrate Renderer into Controller
- Refactor `search-interaction-controller.js` to delegate DOM construction and favicon hydration to `HomebaseSearchResultsRenderer`.
- Remove inline `document.createElement()` routines from `handleInput()`.
- Controller line count will shrink by ~300 lines.
- Run static checks and unit test suite to ensure zero regressions.

### Phase 4: Lifecycle Hardening & Stabilization
- Ensure clean teardown in `destroy()`.
- Add test suites verifying view reconciliation across rapid keystrokes and empty results.
- Perform boundary audits ensuring zero circular dependencies.

---

## 7. Risk Analysis

| Risk | Impact | Mitigation |
|:---|:---|:---|
| **Event Delegation Breaks** | High | Buttons in the dropdown rely on `.dataset.url`, `.dataset.copy`, and `.dataset.bangInsert`. The renderer must produce identical dataset attributes and CSS classes (`result-item`, `selected`, `calc-copy`). |
| **DOM Reflow Inefficiency** | Medium | Maintain the signature check (`lastBookmarkHtml`, `lastSuggestionHtml`) to ensure containers are not cleared/re-mounted on every keypress when data is identical. |
| **Favicon Flashing / Race Conditions** | Medium | Preserve `shouldAbort` token logic and lazy/async decoding attributes in `hydrateFavicons`. |
| **Script Ordering Collision** | High | Ensure `search-results-renderer.js` loads after `search-suggestion-service.js` and before `search-ui-controller.js` / `search-interaction-controller.js`. Static invariant check will enforce this. |

---

## 8. Verification Results

Read-only audit verified:
1. `node scripts/check-newtab-static.mjs`: PASS (67 scripts, 0 collisions).
2. `npm.cmd test`: PASS (400/400 unit tests passing, smoke test passing).
3. `npm.cmd run build`: PASS (clean Chrome and Firefox builds).
4. `git diff src/`: Clean (0 diff, no runtime files modified).
