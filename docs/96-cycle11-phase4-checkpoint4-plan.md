# Homebase Improvement Cycle #11 Phase 4 Checkpoint 4 — Implementation Plan
## Search Preference, Storage & Engine Configuration Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 4 Checkpoint 4  
> **Target Release**: Homebase v0.19.0  
> **Baseline Commit**: `ab2d6a7` ("Extract search interaction delegation")  
> **Status**: Planning Complete — Awaiting Owner Approval  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/95-cycle11-phase4-checkpoint4-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/95-cycle11-phase4-checkpoint4-audit.md)

---

## 1. Migration Strategy

### A. Step-by-Step Order of Extraction
The extraction must proceed in five strictly sequenced steps:

1. **Step 1: Canonical Default Engines Definition Migration (`search-storage.js`)**:
   - Define `const DEFAULT_SEARCH_ENGINES = [...]` in [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) and initialize `window.searchEngines = window.searchEngines || DEFAULT_SEARCH_ENGINES.map(e => ({ ...e }))`.
   - *Rationale*: [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) loads at line 3355 of [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), before all other search scripts. Moving the static engine data here ensures that downstream controllers ([src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js), [src/newtab/search/search-interaction-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js), [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js)) and [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) have immediate access to engine metadata without forward-reference hazards.

2. **Step 2: Settings Dropdown Controls Migration (`search-engine-settings.js`)**:
   - Extract `populateDefaultEngineSelectControl()` and `updateDefaultEngineVisibilityControl()` from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js).
   - Expose them on `window.populateDefaultEngineSelectControl` and `window.updateDefaultEngineVisibilityControl`.
   - *Rationale*: [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) already owns `#search-engines-modal`, `#search-engines-modal-list`, and engine toggle states. Placing the default engine dropdown helpers here groups all engine settings logic cohesively.

3. **Step 3: Unified Search Storage Listener Implementation (`search-ui-controller.js`)**:
   - Implement `handleSearchStorageChange(changes, area)` in [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js).
   - Expose as `window.HomebaseSearchUiController.handleStorageChange`.
   - *Rationale*: [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) already controls active engine selection, UI updates, selector carousel positioning, placeholder text, and preconnections. It is the logical domain controller to react to storage changes.

4. **Step 4: Monolith (`src/new-tab.js`) Pruning & Bridge Connection**:
   - Remove the 154-line `let searchEngines = [...]` array from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).
   - Remove shadow state variables (`currentSearchEngine`, `activeSearchEngineId`).
   - Remove `populateDefaultEngineSelectControl()` and `updateDefaultEngineVisibilityControl()`.
   - Replace lines 4031–4118 (88 lines) in `chrome.storage.onChanged` with a single dispatch to `window.HomebaseSearchUiController.handleStorageChange(changes, area)`.
   - Retain 7 active backward-compatibility shims (`updateSearchUI`, `hideSearchResultsPanel`, `clearSearchUI`, `cycleSearchEngine`, `setSearchSuggestionsPreference`, `getSafeEnabledSearchEngineId`, `applySearchEngineConfig`) and idle startup wrapper `setupSearchSafe()`.

5. **Step 5: Automated Verification & Unit Test Suite**:
   - Add unit tests covering `DEFAULT_SEARCH_ENGINES` clone safety and `handleStorageChange` reactions.
   - Run syntax, static AST, unit test, and CDP browser smoke suites.

---

## 2. Search Engine Definition Migration

### A. Current State & Dependency Inversion
- In [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3200–3354, 154 lines define 12 search engine objects: Google, YouTube, DuckDuckGo, Bing, Wikipedia, Reddit, GitHub, StackOverflow, Amazon, Maps, Yahoo, Yandex.
- In [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), script loading order is:
  ```html
  <script src="newtab/search/search-storage.js" defer></script>
  <script src="newtab/search/search-utils.js" defer></script>
  <script src="newtab/search/search-suggestion-cache.js" defer></script>
  <script src="newtab/search/search-ui-controller.js" defer></script>
  <script src="newtab/search/search-interaction-controller.js" defer></script>
  <script src="newtab/settings/search-engine-settings.js" defer></script>
  <script src="newtab/settings/settings-preferences.js" defer></script>
  ...
  <script src="new-tab.js" defer></script>
  ```
- Because deferred scripts evaluate in DOM order, `new-tab.js` evaluates **last**. The controllers in `newtab/search/` currently have to guard with `typeof searchEngines !== 'undefined' ? searchEngines : window.searchEngines`.

### B. Proposed Implementation in `search-storage.js`
In [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js):
```javascript
const DEFAULT_SEARCH_ENGINES = [
  { id: 'google', name: 'Google', color: '#4285F4', enabled: true, url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=', symbolId: 'google' },
  { id: 'youtube', name: 'YouTube', color: '#FF0000', enabled: true, url: 'https://www.youtube.com/results?search_query=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=', symbolId: 'youtube' },
  { id: 'duckduckgo', name: 'DuckDuckGo', color: '#DE5833', enabled: true, url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?type=json&q=', symbolId: 'duckduckgo' },
  { id: 'bing', name: 'Bing', color: '#008373', enabled: true, url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=', symbolId: 'bing' },
  { id: 'wikipedia', name: 'Wikipedia', color: '#000000', enabled: true, url: 'https://en.wikipedia.org/wiki/Special:Search?search=', suggestionUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=', symbolId: 'wikipedia' },
  { id: 'reddit', name: 'Reddit', color: '#FF4500', enabled: false, url: 'https://www.reddit.com/search/?q=', suggestionUrl: '', symbolId: 'reddit' },
  { id: 'github', name: 'GitHub', color: '#0d6efd', enabled: false, url: 'https://github.com/search?q=', suggestionUrl: '', symbolId: 'github' },
  { id: 'stackoverflow', name: 'StackOverflow', color: '#F48024', enabled: false, url: 'https://stackoverflow.com/search?q=', suggestionUrl: '', symbolId: 'stackoverflow' },
  { id: 'amazon', name: 'Amazon', color: '#FF9900', enabled: false, url: 'https://www.amazon.com/s?k=', suggestionUrl: 'https://completion.amazon.com/search/complete?search-alias=aps&client=amazon-search-ui&mkt=1&q=', symbolId: 'amazon' },
  { id: 'maps', name: 'Maps', color: '#34A853', enabled: false, url: 'https://www.google.com/maps/search/', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=', symbolId: 'maps' },
  { id: 'yahoo', name: 'Yahoo', color: '#6001D2', enabled: false, url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://ff.search.yahoo.com/gossip?output=json&command=', symbolId: 'yahoo' },
  { id: 'yandex', name: 'Yandex', color: '#FC3F1D', enabled: false, url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ff.cgi?part=', symbolId: 'yandex' }
];

if (typeof window !== 'undefined') {
  window.DEFAULT_SEARCH_ENGINES = DEFAULT_SEARCH_ENGINES;
  window.searchEngines = window.searchEngines || DEFAULT_SEARCH_ENGINES.map((e) => ({ ...e }));
}
```

### C. AST Collision Prevention & Scope Rules
- `DEFAULT_SEARCH_ENGINES` will be declared once via `const` in [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js).
- `let searchEngines` in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) will be completely removed.
- In JavaScript deferred scripts, `window.searchEngines` is automatically accessible as the global identifier `searchEngines` by downstream code.
- This prevents any top-level duplicate declaration collision in `scripts/check-newtab-static.mjs`.

---

## 3. Settings Control Migration

### A. Functions to Move
Move from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3128–3190 into [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js):
1. `populateDefaultEngineSelectControl()`:
   - Queries enabled engines from `window.searchEngines`.
   - Resolves safe default ID via `getSafeEnabledSearchEngineId(appSearchDefaultEnginePreference)`.
   - Populates `#app-search-default-engine-select` `<option>` elements.
   - Synchronizes select value.
2. `updateDefaultEngineVisibilityControl()`:
   - Calls `populateDefaultEngineSelectControl()`.
   - Reads `#app-search-remember-engine-toggle.checked`.
   - Shows/hides `#app-search-default-engine-container` (`display: none` vs `display: flex`).

### B. Callers & Compatibility Bridge
- **Active Callers**:
  - [src/newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) line 1222: `appSearchRememberEngineToggle.addEventListener('change', updateDefaultEngineVisibilityControl);`
  - [src/newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) line 1684: `updateDefaultEngineVisibilityControl();`
  - [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) line 254: `const defaultEngineId = populateDefaultEngineSelectControl();`
  - Storage change listener in `search-ui-controller.js`.
- **Bridge in `search-engine-settings.js`**:
  ```javascript
  if (typeof window !== 'undefined') {
    window.populateDefaultEngineSelectControl = populateDefaultEngineSelectControl;
    window.updateDefaultEngineVisibilityControl = updateDefaultEngineVisibilityControl;
  }
  ```

---

## 4. Storage Listener Migration

### A. Design of `handleSearchStorageChange(changes, area)`
Add to [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js):

```javascript
function handleSearchStorageChange(changes, area) {
  if (!changes || typeof changes !== 'object') return;

  // 1. Remember engine preference
  const rememberChange = changes.appSearchRememberEngine || changes.appSearchRememberEnginePreference;
  if (rememberChange) {
    const remember = rememberChange.newValue !== false;
    setRememberPreference(remember);
    if (!remember) {
      const defaultId = getDefaultEnginePreference();
      updateSearchUI(defaultId, { updateFastCache: true });
    }
    if (typeof updateDefaultEngineVisibilityControl === 'function') {
      updateDefaultEngineVisibilityControl();
    }
  }

  // 2. Default engine preference
  const defaultChange = changes.appSearchDefaultEngine || changes.appSearchDefaultEnginePreference;
  if (defaultChange) {
    const requestedDefault = defaultChange.newValue || 'google';
    const previousDefault = getDefaultEnginePreference();
    const safeDefaultId = getSafeEnabledSearchEngineId(requestedDefault);
    setDefaultEnginePreference(safeDefaultId);

    if (typeof populateDefaultEngineSelectControl === 'function') {
      populateDefaultEngineSelectControl();
    }

    if (safeDefaultId !== requestedDefault && typeof setDefaultSearchEngineId === 'function') {
      setDefaultSearchEngineId(safeDefaultId);
    }

    if (!getRememberPreference()) {
      const current = getCurrentEngine();
      if (!current || current.id === previousDefault) {
        updateSearchUI(safeDefaultId, { updateFastCache: true, animate: false });
      } else {
        const engines = getSearchEngines();
        const defaultEngine = engines.find(e => e.id === safeDefaultId);
        if (defaultEngine && typeof writeFastSearchCache === 'function') {
          writeFastSearchCache(defaultEngine);
        }
      }
    }
  }

  // 3. Search suggestions preference
  const suggestionsChange = changes.appSearchSuggestionsEnabled || changes.appSearchSuggestionsPreference;
  if (suggestionsChange) {
    const enabled = suggestionsChange.newValue !== false;
    if (window.HomebaseSearchInteractionController?.setSuggestionsPreference) {
      window.HomebaseSearchInteractionController.setSuggestionsPreference(enabled);
    } else if (typeof setSearchSuggestionsPreference === 'function') {
      setSearchSuggestionsPreference(enabled);
    }
  }

  // 4. Search engines configuration
  const enginesChange = changes.searchEnginesConfig || changes.searchEngines;
  if (enginesChange) {
    const newConfig = enginesChange.newValue;
    if (applySearchEngineConfig(newConfig)) {
      const current = getCurrentEngine();
      const previousEngineId = current ? current.id : null;
      const engines = getSearchEngines();
      const previousEngineStillEnabled = Boolean(previousEngineId && engines.find(e => e.id === previousEngineId && e.enabled));

      let defaultEngineId = null;
      if (typeof populateDefaultEngineSelectControl === 'function') {
        defaultEngineId = populateDefaultEngineSelectControl();
      }

      const targetEngineId = getSafeEnabledSearchEngineId(previousEngineId);
      populateSearchOptions({ animate: false });
      updateSearchUI(targetEngineId, { updateFastCache: getRememberPreference(), animate: false });

      if (getRememberPreference() && !previousEngineStillEnabled && typeof setCurrentSearchEngine === 'function') {
        setCurrentSearchEngine(targetEngineId);
      }

      if (!getRememberPreference()) {
        const startupEngineId = defaultEngineId || getSafeEnabledSearchEngineId(getDefaultEnginePreference());
        const startupEngine = engines.find(e => e.id === startupEngineId) || current;
        if (startupEngine && typeof writeFastSearchCache === 'function') {
          writeFastSearchCache(startupEngine);
        }
      }
    }
  }

  // 5. Current search engine selection
  if (changes.currentSearchEngineId) {
    const newId = changes.currentSearchEngineId.newValue;
    const current = getCurrentEngine();
    if (getRememberPreference() && newId && (!current || newId !== current.id)) {
      updateSearchUI(newId, { updateFastCache: true, animate: false });
    }
  }
}
```

### B. Inlined Monolith Replacement
In [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), lines 4031–4118 (88 lines) inside `chrome.storage.onChanged` will be replaced by:
```javascript
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleStorageChange === 'function') {
      window.HomebaseSearchUiController.handleStorageChange(changes, area);
    }
```

---

## 5. State Cleanup

### A. Removal of `currentSearchEngine` and `activeSearchEngineId`
- In [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), lines 3364–3365 declare:
  ```javascript
  let currentSearchEngine = searchEngines.find((engine) => engine.enabled) || searchEngines[0];
  let activeSearchEngineId = currentSearchEngine ? currentSearchEngine.id : null;
  ```
- These two variables were only referenced inside the 88-line storage listener in `new-tab.js`.
- [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) already manages active engine state via `getCurrentEngine()` and `getActiveEngineId()` (with fallback to `window.currentSearchEngine`).
- Removing these variables eliminates duplicate shadowing.

### B. Retained Elements in `src/new-tab.js`
To ensure 100% backward compatibility and prevent regression in active callers:
1. **7 Active Compatibility Shims**:
   - `updateSearchUI(engineId, options)`
   - `clearSearchUI(options)`
   - `hideSearchResultsPanel()`
   - `cycleSearchEngine(direction)`
   - `setSearchSuggestionsPreference(enabled)`
   - `applySearchEngineConfig(savedConfig)`
   - `getSafeEnabledSearchEngineId(preferredId)`
2. **Startup Orchestration Wrapper**:
   - `setupSearch()`
   - `setupSearchSafe()` (idle task orchestrator)
   - `scheduleLabeled(() => setupSearchSafe(), 'startup:setupSearch')`

---

## 6. Verification Strategy

### A. Automated Syntax & Static Checks
```powershell
node --check src/newtab/search/search-storage.js
node --check src/newtab/settings/search-engine-settings.js
node --check src/newtab/search/search-ui-controller.js
node --check src/new-tab.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```

### B. Unit Tests
Add test cases in `tests/unit/search-storage.test.mjs` and `tests/unit/search-ui-controller.test.mjs`:
1. `DEFAULT_SEARCH_ENGINES` exists and clone creates independent objects.
2. `handleSearchStorageChange` updates active engine when `currentSearchEngineId` changes.
3. `handleSearchStorageChange` syncs fast cache when default engine changes.
4. `handleSearchStorageChange` invokes `populateDefaultEngineSelectControl` on engine reordering.

### C. Browser Verification Checklist
Verify via CDP automated test harness:
1. **Change default search engine**:
   - Select another engine in `#app-search-default-engine-select`.
   - Verify storage persists and UI updates.
2. **Enable/disable suggestions**:
   - Toggle `#app-search-suggestions-toggle`.
   - Verify suggestion results stop/start fetching.
3. **Remember engine preference**:
   - Toggle `#app-search-remember-engine-toggle`.
   - Verify `#app-search-default-engine-container` hides/shows immediately.
4. **Switch engine from selector**:
   - Click engine in `#search-engine-selector`.
   - Verify active engine switches and input placeholder updates.
5. **Reload new tab persistence**:
   - Reload page and verify `localStorage['fast-search']` renders matching icon instantly.
6. **Console hygiene**:
   - 0 `ReferenceError`, 0 `TypeError`, 0 unhandled promise rejections.

---

## 7. Risk Assessment

| Risk Area | Severity | Mitigation |
| :--- | :--- | :--- |
| **Storage Key Divergence** | Medium | Support both canonical keys (`searchEnginesConfig`, `appSearchDefaultEngine`, `appSearchRememberEngine`) and aliases (`searchEngines`, etc.) in `handleSearchStorageChange`. |
| **Fast-Search Cache Sync** | Medium | Ensure `writeFastSearchCache()` is called in `handleSearchStorageChange` for both default and current engine changes. |
| **Script Loading Order** | Low | `search-storage.js` evaluates before `search-ui-controller.js` and `new-tab.js`; moving default engines there eliminates race conditions. |
| **Protected Files** | Zero | `src/preload.js`, `src/instant_load.js`, `manifests/`, `dist/` remain untouched. |
| **Bookmark & Wallpaper Modules** | Zero | Unrelated modules are completely untouched. |

---

## 8. Expected Line Reduction

| Item / Responsibility | Location in `src/new-tab.js` | Lines Before | Lines After | Net Reduction |
| :--- | :--- | :--- | :--- | :--- |
| Default `searchEngines` array | Lines 3200–3354 | 155 lines | 0 lines | **-155 lines** |
| `populateDefaultEngineSelectControl` & `updateDefaultEngineVisibilityControl` | Lines 3128–3190 | 63 lines | 0 lines | **-63 lines** |
| Inlined search storage change listener | Lines 4031–4118 | 88 lines | ~5 lines | **-83 lines** |
| Shadow variables (`currentSearchEngine`, `activeSearchEngineId`) | Lines 3364–3365 | 3 lines | 0 lines | **-3 lines** |
| **Total Checkpoint 4 Reduction** | — | — | — | **~304 lines net** |

### Monolith Size Projection:
- Monolith baseline (start of project): **9,012 lines**
- Monolith size after Checkpoint 3: **4,341 lines**
- **Monolith projected size after Checkpoint 4**: **~4,037 lines** (**-4,975 lines / -55.2% cumulative reduction**)

---

## 9. Conclusion

This plan addresses all requirements for Cycle #11 Phase 4 Checkpoint 4.
Implementation will begin immediately upon owner approval.
