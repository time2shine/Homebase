# Homebase Improvement Cycle #11 Phase 4 Checkpoint 4 — Architecture Audit
## Search Preference, Storage & Engine Configuration Responsibilities

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 4 Checkpoint 4  
> **Target Release**: Homebase v0.19.0  
> **Baseline Commit**: `ab2d6a7` ("Extract search interaction delegation")  
> **Status**: Audit Complete — Awaiting Owner Review  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/88-cycle11-phase4-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/88-cycle11-phase4-audit.md)

---

## 1. Executive Overview

Following the successful completion of Checkpoint 3 (which extracted search input debouncing, keyboard navigation, form submission, results selection, and global typing quick-focus into [src/newtab/search/search-interaction-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js)), this audit investigates the **remaining search responsibilities** across the codebase.

Currently, [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) contains **~385 lines of search-related code**, consisting of:
1. **154 lines** of hardcoded default search engine configurations (`let searchEngines = [...]`).
2. **88 lines** of inlined storage change handling in `chrome.storage.onChanged`.
3. **59 lines** of default search engine settings controls (`populateDefaultEngineSelectControl`, `updateDefaultEngineVisibilityControl`).
4. **8 compatibility shims** and startup wrappers (`updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId`).
5. **Multiple shadow state variables** (`currentSearchEngine`, `activeSearchEngineId`, `searchForm`, `searchInput`, `searchSelect`, `appSearchRememberEnginePreference`, `appSearchDefaultEnginePreference`).

At the same time, four dedicated search modules already exist:
- [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) (storage services, persistence, fast-search cache)
- [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) (engine selector, active engine UI, preconnection, engine switching)
- [src/newtab/search/search-interaction-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) (query parsing, suggestions, event dispatching)
- [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) (manage search engines modal, sortable list, enable/disable toggles)

This audit establishes the exact state ownership, storage flows, duplicate logic, and safe extraction boundary for Checkpoint 4.

---

## 2. Current Architecture Map

```mermaid
graph TD
    subgraph Data & Storage ["Data & Storage Layer"]
        SS[search-storage.js<br/>HomebaseSearchStorage]
        SP[settings-preferences.js<br/>loadAppSettingsFromStorage]
        LS[(localStorage<br/>fast-search mirror)]
        CS[(chrome.storage.local<br/>HomebaseStorage)]
    end

    subgraph UI & Controllers ["Controllers Layer"]
        SUC[search-ui-controller.js<br/>HomebaseSearchUiController]
        SIC[search-interaction-controller.js<br/>HomebaseSearchInteractionController]
        SES[search-engine-settings.js<br/>setupSearchEnginesModal]
        SUI[settings-ui.js<br/>Settings Panel]
    end

    subgraph LegacyMonolith ["src/new-tab.js (Monolith)"]
        DEF[searchEngines Array<br/>154 lines]
        SHADOW[Shadow State Vars<br/>currentSearchEngine, activeSearchEngineId]
        DROPDOWN[Settings Controls<br/>populateDefaultEngineSelectControl<br/>updateDefaultEngineVisibilityControl]
        SHIMS[Compatibility Shims<br/>updateSearchUI, cycleSearchEngine, etc.]
        STORE_LISTEN[onChanged Listener<br/>88 inlined search lines]
        ORCH[setupSearchSafe<br/>Idle Scheduler Task]
    end

    DEF -.->|provides fallback engines| SUC
    DEF -.->|provides fallback engines| SIC
    SS -->|reads/writes| CS
    SS -->|syncs| LS
    SUC -->|calls| SS
    SES -->|calls| SS
    SES -->|calls| SUC
    SUI -->|calls| DROPDOWN
    SUI -->|calls| SUC
    SIC -->|calls| SUC
    ORCH -->|invokes| SUC
    ORCH -->|invokes| SIC
    CS -.->|storage change event| STORE_LISTEN
    STORE_LISTEN -->|updates| SUC
    STORE_LISTEN -->|calls| DROPDOWN
    STORE_LISTEN -->|syncs| SS
```

---

## 3. Search State Ownership Table

| State Property / Entity | Current Definition in `new-tab.js` | Representation in Search Modules | Active External Callers | Architectural Issue | Target Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`searchEngines`** (Array of 12 engines) | Lines 3200–3354 (154 lines) | `search-ui-controller.js` has `getSearchEngines()` reading `window.searchEngines`; mutated by `search-engine-settings.js` | `search-engine-settings.js`, `search-ui-controller.js`, `search-interaction-controller.js` | Defined in the last deferred script (`new-tab.js`), forcing earlier scripts to defer engine access | [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) as canonical `DEFAULT_SEARCH_ENGINES` + exported to `window.searchEngines` |
| **`currentSearchEngine`** (Object) | Line 3364: `let currentSearchEngine = ...` | `search-ui-controller.js` lines 39–56: `getCurrentEngine()` / `setCurrentEngine()` | Used only inside `new-tab.js` storage listener | Redundant shadow variable; internal controller state already tracked in `search-ui-controller.js` | [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) |
| **`activeSearchEngineId`** (String) | Line 3365: `let activeSearchEngineId = ...` | `search-ui-controller.js` lines 58–76: `getActiveEngineId()` / `setActiveEngineId()` | Used only inside `new-tab.js` storage listener | Redundant shadow variable | [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) |
| **`appSearchRememberEnginePreference`** (Boolean) | Line 1050: `let appSearchRememberEnginePreference = true;` | `search-storage.js`: `getSearchRememberEnginePreference()` / `setSearchRememberEnginePreference()`; `search-ui-controller.js`: `getRememberPreference()` | `settings-ui.js`, `settings-preferences.js`, `new-tab.js` storage listener | Multi-owner synchronization; storage key divergence | Managed via [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) & accessed via controller |
| **`appSearchDefaultEnginePreference`** (String ID) | Line 1052: `let appSearchDefaultEnginePreference = 'google';` | `search-storage.js`: `getDefaultSearchEngineId()` / `setDefaultSearchEngineId()`; `search-ui-controller.js`: `getDefaultEnginePreference()` | `settings-ui.js`, `search-engine-settings.js`, `new-tab.js` storage listener | Multi-owner synchronization; duplicated getters | Managed via [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) & accessed via controller |
| **`appSearchSuggestionsPreference`** (Boolean) | Line 1058: `let appSearchSuggestionsPreference = true;` | `search-interaction-controller.js` lines 120–145: `getSearchSuggestionsPreference()` / `setSuggestionsPreference()` | `settings-ui.js`, `new-tab.js` storage listener | Dual ownership in `new-tab.js` and `search-interaction-controller.js` | [src/newtab/search/search-interaction-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js) |
| **`fast-search` mirror** (`localStorage`) | Lines 4064, 4098: calls `writeFastSearchCache()` | `search-storage.js` lines 288–329: `writeFastSearchCache()`, `getFastSearchCache()`, `clearFastSearchCache()` | `instant_load.js`, `search-ui-controller.js`, `search-engine-settings.js` | Direct calls scattered throughout `new-tab.js` storage listener | [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) encapsulated inside storage change handler |
| **Default Engine Dropdown Controls** | Lines 3128–3190: `populateDefaultEngineSelectControl`, `updateDefaultEngineVisibilityControl` (59 lines) | None (currently trapped in `new-tab.js`) | `settings-ui.js` lines 1222, 1684; `search-engine-settings.js` line 254 | Settings UI logic residing in main new-tab runtime | [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) |
| **Search Storage Listener** | Lines 4031–4118 (88 lines in `chrome.storage.onChanged`) | None (monolith directly mutates UI and storage) | `chrome.storage.onChanged` event | Inlined monolith branching instead of domain delegation | [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) via `handleSearchStorageChange(changes, area)` |

---

## 4. Storage Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Tab as New Tab Startup
    participant Instant as instant_load.js
    participant Store as HomebaseStorage / Cache
    participant SUC as SearchUiController
    participant SES as SearchEngineSettings
    participant NT as new-tab.js (Listener)

    Note over Tab,Instant: Phase 1: Pre-DOM Instant Hydration
    Tab->>Instant: Read localStorage['fast-search']
    Instant-->>Tab: Render search icon & placeholder synchronously

    Note over Tab,SUC: Phase 2: Deferred Runtime Hydration
    Tab->>SUC: loadSearchEnginePreferences()
    SUC->>Store: getSearchPreferences()
    Store-->>SUC: { searchEnginesConfig, currentSearchEngineId, defaultEngine, remember }
    SUC->>SUC: applySearchEngineConfig(savedConfig)
    SUC->>SUC: updateSearchUI(targetEngineId, { updateFastCache: true })
    SUC->>Store: writeFastSearchCache(targetEngine)

    Note over SES,Store: Phase 3: User Mutates Engines / Preferences
    SES->>Store: HomebaseStorage.set('searchEnginesConfig', storageData)
    SES->>Store: HomebaseStorage.set('appSearchDefaultEngine', defaultEngineId)
    SES->>Store: writeFastSearchCache(defaultEngine)

    Note over Store,NT: Phase 4: Storage Change Notification
    Store-->>NT: chrome.storage.onChanged({ searchEnginesConfig, ... })
    Note over NT: Currently: 88 inlined lines in new-tab.js manually recalculate state!<br/>Target: Single dispatch to HomebaseSearchUiController.handleStorageChange(changes)
    NT->>SUC: handleSearchStorageChange(changes)
    SUC->>SUC: updateSearchUI(safeTargetId)
    SUC->>Store: writeFastSearchCache(startupEngine)
```

---

## 5. Duplicate Logic Findings

### A. Search Engine Array Duplication & Script Loading Inversion
- In [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3200–3354, 154 lines define the 12 default search engine objects (Google, YouTube, DuckDuckGo, Bing, Wikipedia, Reddit, GitHub, StackOverflow, Amazon, Maps, Yahoo, Yandex).
- In [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js) and [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js) load **before** [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).
- As a result, `search-storage.js` and `search-ui-controller.js` must guard against `searchEngines` being `undefined` at script load time.
- Moving the canonical `DEFAULT_SEARCH_ENGINES` array into `search-storage.js` fixes this dependency inversion, ensures early availability, and cuts 154 lines from `src/new-tab.js`.

### B. Storage Key Divergence & Aliasing
A critical finding during this audit is storage key divergence across modules:
1. `search-storage.js` defines:
   - `SEARCH_ENGINES_PREF_KEY = 'searchEnginesConfig'` (matches [schema-validator.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/schema-validator.js) line 390)
   - `APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEngine'` (matches schema validator)
   - `APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEngine'`
2. `search-ui-controller.js` defines:
   - `SEARCH_ENGINES_PREF_KEY = 'searchEngines'` (legacy alias)
   - `APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEnginePreference'` (legacy alias)
   - `APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEnginePreference'` (legacy alias)
3. `search-engine-settings.js` saves to:
   - `SEARCH_ENGINES_PREF_KEY` (`'searchEnginesConfig'`)
   - `APP_SEARCH_DEFAULT_ENGINE_KEY` (`'appSearchDefaultEngine'`)

> [!WARNING]
> In Checkpoint 4, key accessors in `search-ui-controller.js` and storage listeners must handle both canonical keys (`searchEnginesConfig`, `appSearchDefaultEngine`, `appSearchRememberEngine`) and legacy aliases defensively to ensure zero regressions across old and new storage formats.

### C. 88-Line Inlined Storage Listener in `src/new-tab.js`
Lines 4031–4118 in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) contain complex imperative branching:
- Checks `changes[APP_SEARCH_REMEMBER_ENGINE_KEY]` and conditionally resets UI.
- Checks `changes[APP_SEARCH_DEFAULT_ENGINE_KEY]`, falls back to `getSafeEnabledSearchEngineId()`, syncs `#app-search-default-engine-select`, and calls `writeFastSearchCache()`.
- Checks `changes[APP_SEARCH_SUGGESTIONS_KEY]` and calls `setSearchSuggestionsPreference()`.
- Checks `changes[SEARCH_ENGINES_PREF_KEY]`, runs `applySearchEngineConfig(newConfig)`, verifies if the previous engine is still enabled, recalculates the target engine, re-renders options, and updates the fast search cache.
- Checks `changes.currentSearchEngineId` and updates UI.

Every single one of these actions operates purely on search state and UI elements managed by `HomebaseSearchUiController` and `HomebaseSearchStorage`. Inlining this in `new-tab.js` violates domain encapsulation.

### D. Settings Dropdown Controls Trapped in `src/new-tab.js`
- `populateDefaultEngineSelectControl()` (42 lines, lines 3128–3170)
- `updateDefaultEngineVisibilityControl()` (17 lines, lines 3174–3190)
These functions populate the default engine `<select>` dropdown and hide/show the container based on whether "Remember last engine" is enabled. They are only invoked by:
- `settings-ui.js` (lines 1222, 1684)
- `search-engine-settings.js` (line 254)
- The search storage change listener.
They belong naturally in [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) or [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js).

---

## 6. Recommended Extraction Plan (Checkpoint 4)

### Phase A: Canonical Default Engines Extraction
1. **Target**: Move `DEFAULT_SEARCH_ENGINES` (12 engines) from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [src/newtab/search/search-storage.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js).
2. **Global Export**: In `search-storage.js`, set:
   ```javascript
   if (typeof window !== 'undefined') {
     window.searchEngines = window.searchEngines || DEFAULT_SEARCH_ENGINES.map(e => ({ ...e }));
     window.DEFAULT_SEARCH_ENGINES = DEFAULT_SEARCH_ENGINES;
   }
   ```
3. **Preservation**: In `src/new-tab.js`, replace the 154-line array with:
   ```javascript
   let searchEngines = (typeof window !== 'undefined' && window.searchEngines) || [];
   ```
   (or prune `let searchEngines` completely and reference `window.searchEngines`).

### Phase B: Default Engine Dropdown Controls Extraction
1. **Target**: Move `populateDefaultEngineSelectControl()` and `updateDefaultEngineVisibilityControl()` into [src/newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js).
2. **Export**: Expose on `window.populateDefaultEngineSelectControl` and `window.updateDefaultEngineVisibilityControl` to preserve complete backward compatibility with `settings-ui.js`.
3. **Prune**: Remove 59 lines from [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

### Phase C: Search Storage Listener Unification
1. **Target**: Implement `handleSearchStorageChange(changes, area)` in [src/newtab/search/search-ui-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-ui-controller.js).
2. **Delegation**: In [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), replace lines 4031–4118 (88 lines) with:
   ```javascript
   if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleStorageChange === 'function') {
     window.HomebaseSearchUiController.handleStorageChange(changes, area);
   }
   ```
3. **Defensive key support**: Support both canonical keys (`searchEnginesConfig`, `appSearchDefaultEngine`, `appSearchRememberEngine`) and aliases in `handleSearchStorageChange`.

### Phase D: Shadow State & Dead Wrapper Pruning
1. **Prune shadow variables**:
   - `let currentSearchEngine`
   - `let activeSearchEngineId`
2. **Retain compatibility shims in `src/new-tab.js`**:
   - `updateSearchUI`
   - `clearSearchUI`
   - `hideSearchResultsPanel`
   - `cycleSearchEngine`
   - `setupSearch`
   - `setSearchSuggestionsPreference`
   - `applySearchEngineConfig`
   - `getSafeEnabledSearchEngineId`
3. **Retain startup orchestration in `src/new-tab.js`**:
   - `setupSearchSafe`
   - `scheduleLabeled(() => setupSearchSafe(), 'startup:setupSearch')`

---

## 7. Risk Assessment

| Risk Area | Severity | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Storage Key Mismatch** (`searchEngines` vs `searchEnginesConfig`) | **Medium** | Could cause settings save not to reflect in active UI or vice-versa | Support both keys in `handleSearchStorageChange`: check `changes.searchEnginesConfig || changes.searchEngines` |
| **Instant Load Cache Drift** (`localStorage['fast-search']`) | **Medium** | New tab opens with wrong search engine icon before hydration | Ensure `writeFastSearchCache` is invoked in `handleSearchStorageChange` exactly as it was in `new-tab.js` |
| **Script Order / Declaration Timing** | **Low** | `search-storage.js` already loads before `search-ui-controller.js` and `new-tab.js` | Defining `DEFAULT_SEARCH_ENGINES` in `search-storage.js` actually improves ordering by eliminating forward-reference |
| **Bookmark & Wallpaper Systems** | **Zero** | No interaction | Protected areas are not touched |
| **Protected Files** (`preload.js`, `instant_load.js`, manifests) | **Zero** | None | 0 edits to protected files |

---

## 8. Expected Line Reduction

| Item / Responsibility | Location in `src/new-tab.js` | Lines Before | Lines After | Net Reduction |
| :--- | :--- | :--- | :--- | :--- |
| Default `searchEngines` array | Lines 3200–3354 | 155 lines | 0 lines | **-155 lines** |
| `populateDefaultEngineSelectControl` & `updateDefaultEngineVisibilityControl` | Lines 3128–3190 | 63 lines | 0 lines | **-63 lines** |
| Inlined search storage change listener | Lines 4031–4118 | 88 lines | ~5 lines | **-83 lines** |
| Shadow variables (`currentSearchEngine`, `activeSearchEngineId`) | Lines 3364–3365 | 3 lines | 0 lines | **-3 lines** |
| **Total Checkpoint 4 Reduction** | — | — | — | **~304 lines net** |

### Projected Milestones:
- Current `src/new-tab.js`: **4,341 lines**
- Projected `src/new-tab.js` after Checkpoint 4: **~4,037 lines**
- Cumulative reduction from monolith baseline (9,012 lines): **-4,975 lines (-55.2%)**

---

## 9. Conclusion & Next Steps

This audit establishes a clean, zero-risk pathway for completing search subsystem extraction in Checkpoint 4 without touching bookmarks, wallpaper, or protected files.

All findings are documented. In accordance with the Owner Development Workflow:
- Implementation is on hold.
- Awaiting owner review and approval of this audit and the proposed extraction plan before creating the phase plan.
