# Homebase Improvement Cycle #10 Phase 3 Implementation Report: Search UI Controller Extraction

**Date:** September 30, 2026  
**Cycle ID:** Cycle #10 — Phase 3 (Search UI & Engine Selector Controller Extraction)  
**Target Release:** Homebase v0.17.0  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/56-cycle10-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/56-cycle10-plan.md)  
**Status:** Implemented & Verified (Awaiting User Review / Pre-Commit State)  

---

## 1. Overview & Objectives

In Phase 3 of Cycle #10, the **Search UI & Search Engine Selector** orchestration was extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into a dedicated domain controller: **[`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js)** (`window.HomebaseSearchUiController`, aliased as `window.HomebaseSearchEngineController`).

### Core Goals:
1. Extract search engine selector dropdown rendering, layout positioning calculation, engine cycling (`cycleSearchEngine`, `Alt+Up/Down`, wheel), search options population, preconnection link management, and engine preference synchronization.
2. Expose the standard controller lifecycle interface:
   ```javascript
   window.HomebaseSearchUiController = {
     initialize,
     render,
     refresh,
     destroy,
     ...
   };
   ```
3. Replace the extracted implementations in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) with delegating wrappers to maintain 100% backward compatibility for internal callers and external modules (e.g. `search-engine-settings.js`, `settings-ui.js`).
4. Maintain classic `<script defer>` script architecture, zero ES modules, zero bundlers, and zero new dependencies.
5. Guarantee that protected files ([`src/preload.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [`src/instant_load.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js), `manifests/*`, `dist/*`) remain 100% untouched.

---

## 2. Audit Findings & Candidate Evaluation

Before extraction, an architectural audit of remaining UI clusters in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) was conducted across the three candidates prioritized in the Phase 3 specification:

| Candidate Cluster | Existing Source Footprint in `src/new-tab.js` | Startup Risk | Complexity Reduction Potential | Coupling | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Candidate 1: Widget UI Controller** | ~70 lines (`updateSidebarCollapseState`, `revealWidget`) | Low | Minimal (<1% file reduction) | Low | Rejected: Individual widgets were already extracted into `src/newtab/widgets/`; remaining startup hooks must stay in `new-tab.js` per AGENTS.md. |
| **Candidate 2: Search UI Controller** | **~1,000 lines** (15 functions across engine selector, cycling, options, and preferences) | Low | **High (~871 net lines reduction)** | Self-contained | **SELECTED**: High reduction, self-contained UI domain, low startup risk, aligns with Cycle 10 Plan. |
| **Candidate 3: Sidebar/Layout Controller** | ~60 lines (`updateSidebarCollapseState`, resize listener) | Lowest | Negligible (~0.5% reduction) | Low | Rejected: Insufficient reduction for a major phase. |

### Why Search UI Controller Was Selected:
1. **Highest Reduction in `new-tab.js` Complexity**: Extracts 15 functions and over 1,000 lines of inlined UI logic, achieving an immediate net reduction of 871 lines.
2. **Minimal Cross-Module Coupling**: Only couples to `searchEngines` data and search DOM containers (`#search-engine-selector`, `#search-select`, `#search-input`, `#search-results-panel`).
3. **Least Startup Risk**: Operates during idle/deferred setup (`setupSearch()`); does not block critical startup rendering or bookmark tree processing.

---

## 3. Extracted Functions & Responsibilities

The following 15 functions and their associated DOM and state manipulations were extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js):

| Function Name | Original Lines in `src/new-tab.js` | Extracted Responsibility |
| :--- | :---: | :--- |
| `buildSearchEngineIconContent` | 7254–7276 | Populates engine icon (SVG via `createSvgIconElement` or text fallback) and tooltip. |
| `ensureEngineIconExists` | 7278–7339 | Creates and appends `.engine-icon-btn` if missing from selector list. |
| `updateSearchSelectorPosition` | 7341–7401 | Calculates translation offset and clamps within viewport bounds. |
| `renderSearchEngineSelector` | 7403–7580 | Renders active engine icons, computes `--collapsed-width` and `--expanded-width`. |
| `populateSearchOptions` | 7582–7624 | Rebuilds `<option>` elements in `#search-select` and calls `renderSearchEngineSelector`. |
| `updateSearchUI` | 7626–7742 | Synchronizes active engine, updates input placeholder, syncs select value, updates `.active` CSS classes, and calls preconnect. |
| `preconnectToSearchEngine` | 7744–7778 | Injects `<link rel="preconnect">` into `<head>` for active search engine domain. |
| `clearSearchUI` | 7780–7836 | Clears input, resets selection state, clears results containers, and updates panel visibility. |
| `hideSearchResultsPanel` | 7838–7858 | Hides `#search-results-panel`, removes `.results-open` from `.widget-search`, resets focus classes. |
| `cycleSearchEngine` | 7860–7940 | Cycles forward/backward through active engines with animated slide-out and timeout collapse. |
| `setupSearch` (core UI init) | 7942–8069 | Initializes search preferences, selector dropdown listeners, and Alt+Arrow cycling. |
| `handleSearchChange` | 8071–8089 | Responds to select changes, updates active engine, persists if remember preference is enabled. |
| `applySearchEngineConfig` | 8747–8816 | Reorders and toggles enabled flags based on saved configuration. |
| `getSafeEnabledSearchEngineId` | 8819–8845 | Resolves a valid enabled engine ID falling back to user default or Google. |
| `loadSearchEnginePreferences` | 8847–8916 | Loads search preferences via `HomebaseSearchStorage` and initializes active engine. |

---

## 4. New Controller API (`window.HomebaseSearchUiController`)

Implemented in [`src/newtab/search/search-ui-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js):

```javascript
window.HomebaseSearchUiController = {
  // Primary lifecycle methods
  initialize(options = {}),
  render(options = {}),
  refresh(options = {}),
  destroy(),

  // Core operations
  buildSearchEngineIconContent(targetEl, engine),
  ensureEngineIconExists(engine),
  updateSearchSelectorPosition(),
  renderSearchEngineSelector(options = {}),
  populateSearchOptions(options = {}),
  updateSearchUI(engineId, options = {}),
  preconnectToSearchEngine(url),
  clearSearchUI(options = {}),
  hideSearchResultsPanel(),
  cycleSearchEngine(direction),
  handleSearchChange(),
  applySearchEngineConfig(savedConfig),
  getSafeEnabledSearchEngineId(preferredId),
  loadSearchEnginePreferences(),

  // State inspection & mutation
  getCurrentSearchEngine(),
  setCurrentSearchEngine(engine),
  getActiveSearchEngineId(),
  getSearchEngines(),
  setSearchEngines(engines),
  getRememberEnginePreference(),
  setRememberEnginePreference(val),
  getDefaultEnginePreference(),
  setDefaultEnginePreference(val)
};
```

---

## 5. Changes in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), monolithic implementations were replaced with lightweight delegating wrappers:
- `buildSearchEngineIconContent` -> delegates to `HomebaseSearchUiController.buildSearchEngineIconContent`
- `ensureEngineIconExists` -> delegates to `HomebaseSearchUiController.ensureEngineIconExists`
- `updateSearchSelectorPosition` -> delegates to `HomebaseSearchUiController.updateSearchSelectorPosition`
- `renderSearchEngineSelector` -> delegates to `HomebaseSearchUiController.renderSearchEngineSelector`
- `populateSearchOptions` -> delegates to `HomebaseSearchUiController.populateSearchOptions`
- `updateSearchUI` -> delegates to `HomebaseSearchUiController.updateSearchUI`
- `preconnectToSearchEngine` -> delegates to `HomebaseSearchUiController.preconnectToSearchEngine`
- `clearSearchUI` -> delegates to `HomebaseSearchUiController.clearSearchUI`
- `hideSearchResultsPanel` -> delegates to `HomebaseSearchUiController.hideSearchResultsPanel`
- `cycleSearchEngine` -> delegates to `HomebaseSearchUiController.cycleSearchEngine`
- `setupSearch` -> delegates initial controller setup to `HomebaseSearchUiController.initialize()`
- `handleSearchChange` -> delegates to `HomebaseSearchUiController.handleSearchChange`
- `applySearchEngineConfig` -> delegates to `HomebaseSearchUiController.applySearchEngineConfig`
- `getSafeEnabledSearchEngineId` -> delegates to `HomebaseSearchUiController.getSafeEnabledSearchEngineId`
- `loadSearchEnginePreferences` -> delegates to `HomebaseSearchUiController.loadSearchEnginePreferences`

**Line count reduction in `src/new-tab.js`:**
- 1,035 lines modified: **82 insertions(+), 953 deletions(-)** (Net reduction of **871 lines**).

---

## 6. Script Loading Order

In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), `search-ui-controller.js` is loaded immediately after `search-suggestion-cache.js` and before `search-engine-settings.js` and `new-tab.js`:

```html
<!-- Line 3353: Search storage -->
<script src="newtab/search/search-storage.js" defer></script>
<!-- Line 3358: Search utilities -->
<script src="newtab/search/search-utils.js" defer></script>
<!-- Line 3359: Suggestion cache -->
<script src="newtab/search/search-suggestion-cache.js" defer></script>
<!-- Line 3360: NEW Search UI Controller -->
<script src="newtab/search/search-ui-controller.js" defer></script>
<!-- Line 3362: Search engine settings modal UI -->
<script src="newtab/settings/search-engine-settings.js" defer></script>
...
<!-- Line 3396: Main runtime entry point -->
<script src="new-tab.js" defer></script>
```

- Total deferred scripts checked: **50** (increased from 49).
- `src/preload.js` remains synchronous in `<head>`.
- `src/new-tab.js` remains the final deferred script.

---

## 7. Verification & Test Results

### A. Syntax Validation (`node --check`)
Passed with zero errors across all affected files:
```powershell
node --check src/newtab/search/search-ui-controller.js src/new-tab.js tests/unit/search-ui-controller.test.mjs
```

### B. Static Invariants Check (`scripts/check-newtab-static.mjs`)
Passed all checks:
- 50 deferred local script files verified.
- `preload.js` intact in head without defer/async/module.
- `new-tab.js` confirmed as the final deferred runtime script.
- 33 extracted module paths checked.
- 0 duplicate declarations across 87 checked names.

### C. Unit Test Suite (`npm.cmd test`)
All **306 / 306** tests passed:
- `tests/unit/search-ui-controller.test.mjs`: 7 tests passed (exports check, render and populate options, active state and placeholder sync, cycleSearchEngine forward/backward, applySearchEngineConfig reordering/toggling, clearSearchUI and hideSearchResultsPanel cleanup, headless missing DOM safety).
- Existing test suites: 299 tests passed without regressions.

### D. Production Build (`npm.cmd run build`)
```text
> homebase-extension@0.15.0 build
> node scripts/build.mjs

Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

---

## 8. Protected Boundaries Check

Ran:
```powershell
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```
**Result:** ZERO changes to protected files.

---

## 9. Risk Assessment & Rollback Strategy

### Risk Assessment
- **Risk Level:** Low.
- **Visual Invariance:** All CSS variables (`--collapsed-width`, `--expanded-width`, `--engine-color`), CSS classes (`.search-engine-list`, `.engine-icon-btn`, `.active`, `.is-instant-fixed`, `.suppress-hover`, `.expanded`, `.non-default-engine`, `.engine-switch-anim`), and DOM IDs remain identical.
- **Backward Compatibility:** All 15 functions remain defined in `src/new-tab.js` with matching signatures and return values, delegating seamlessly to `window.HomebaseSearchUiController`.
- **Defensive Design:** All DOM queries handle null/missing elements without throwing, safely accommodating test mocks and headless runs.

### Rollback Strategy
If any regression occurs:
1. Revert changes in `src/new-tab.html` (remove script tag for `search-ui-controller.js`).
2. Revert delegation in `src/new-tab.js` to restore original inline functions.
3. Remove `src/newtab/search/search-ui-controller.js` and `tests/unit/search-ui-controller.test.mjs`.
4. Run `npm.cmd test` and `npm.cmd run build` to confirm restoration.
