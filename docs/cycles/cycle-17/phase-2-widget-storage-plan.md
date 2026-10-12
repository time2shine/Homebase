# Cycle #17 Phase 2 — Canonical Widget Storage Service Plan

## 1. Objective
Establish `HomebaseWidgetStorage` (`src/newtab/widgets/widget-storage.js`) as the single canonical owner of widget persistence and fast mirror synchronization across the Homebase new-tab dashboard.

This phase is **strictly additive**:
- Creates `src/newtab/widgets/widget-storage.js` with the full canonical API.
- Implements comprehensive unit tests in `tests/unit/widget-storage.test.mjs`.
- Registers the script in `src/new-tab.html` and `scripts/check-newtab-static.mjs`.
- Does **not** modify existing widget modules (`weather.js`, `quote.js`, `news.js`, `todo.js`, `time.js`, `widget-visibility.js`) yet. Migration of consumers will take place in Phase 3.
- Protects `src/preload.js`, `src/instant_load.js`, `manifests/`, and `dist/`.

---

## 2. Background & Architectural Rationale

### 2.1 The Problem
In Cycle #17 Phase 1 audit (`docs/cycles/cycle-17/phase-1-newtab-audit.md`), the Widgets subsystem was identified as having the most fragmented storage ownership in the repository:
1. Each widget module independently read from and wrote to `HomebaseStorage`, `browser.storage.local`, and `localStorage`.
2. Fast mirror cache synchronization was repeated with ad-hoc `try/catch` blocks across 6 separate files.
3. Fallback logic when storage APIs failed or returned malformed values was inconsistent across modules.

### 2.2 The Solution: `HomebaseWidgetStorage`
By centralizing all widget persistence operations behind a single service:
- All widgets share a unified storage access pattern:
  1. Primary: `HomebaseStorage.get` / `HomebaseStorage.set`
  2. Secondary fallback: `browser.storage.local.get` / `browser.storage.local.set`
  3. Pre-hydration fast mirrors: `localStorage.setItem` / `localStorage.getItem`
- Mirror keys are preserved exactly without breaking synchronous hydration in `instant_load.js`.
- Error handling and defensive schema normalization are handled in one place.

---

## 3. Storage Rules & Key Mapping

### 3.1 Primary & Fallback Storage
- **Primary**: `window.HomebaseStorage`
- **Fallback**: `(typeof browser !== 'undefined' ? browser : chrome).storage.local`

### 3.2 Key Specifications & Fast Mirrors

| Domain | Storage Key | Fast Mirror Key | Legacy Mirror Key (Hydrator) | Default Value / Schema |
|---|---|---|---|---|
| **Widget Order** | `widgetOrder` | `fast-widget-order` | — | `['time', 'weather', 'quote', 'news', 'todo']` |
| **Sidebar Visibility** | `showSidebar` | `fast-show-sidebar` | — | `true` |
| **Time Format** | `timeFormat` | `fast-time-format` | — | `'12'` |
| **Weather Cache** | `weatherCache` | `fast-weather-v2` | `fast-weather` | `null` (or payload object) |
| **Quote Cache** | `quoteCache` | `fast-quote-v2` | `fast-quote-state` | `null` (or payload object) |
| **News Cache** | `newsCache` | `fast-news-v2` | `fast-news` | `null` (or payload object) |
| **Todo State** | `todoState` / `todos` | — | — | `[]` (array of todo items) |

*Note on Preload Hydration*: `instant_load.js` reads legacy mirror keys (`fast-weather`, `fast-quote-state`, `fast-news`). `HomebaseWidgetStorage` mirrors writes to both the canonical v2 keys and legacy keys simultaneously to ensure instant hydration without modifying protected files.

---

## 4. API Design

`window.HomebaseWidgetStorage` exposes the following asynchronous API:

```javascript
window.HomebaseWidgetStorage = {
  // Widget Order
  getWidgetOrder: async () => string[],
  setWidgetOrder: async (order) => void,

  // Sidebar Visibility
  getSidebarVisibility: async () => boolean,
  setSidebarVisibility: async (visible) => void,

  // Time Format
  getTimeFormat: async () => string,
  setTimeFormat: async (format) => void,

  // Weather Cache
  getWeatherCache: async () => object | null,
  setWeatherCache: async (cacheData) => void,

  // Quote Cache
  getQuoteCache: async () => object | null,
  setQuoteCache: async (cacheData) => void,

  // News Cache
  getNewsCache: async () => object | null,
  setNewsCache: async (cacheData) => void,

  // Todo State
  getTodoState: async () => array,
  setTodoState: async (todos) => void
};
```

---

## 5. Implementation Steps

1. **Module Creation**:
   - Create `src/newtab/widgets/widget-storage.js` wrapped in standard IIFE pattern.
   - Guard globals (`window`, `browser`, `chrome`, `localStorage`).
   - Implement storage helpers: `readStorageValue`, `writeStorageValue`, `readLocalStorage`, `writeLocalStorage`.

2. **Unit Testing**:
   - Create `tests/unit/widget-storage.test.mjs` using `node:test` and `node:assert/strict`.
   - Test suite covering:
     - API shape and existence.
     - `HomebaseStorage` read & write operations.
     - `browser.storage.local` fallback execution when `HomebaseStorage` is absent.
     - `localStorage` fast mirror writes and synchronous recovery.
     - Malformed data fallbacks (corrupt JSON, non-array orders).
     - Backward compatibility and legacy mirror write replication.

3. **Script Manifest & Static Checking**:
   - Register `newtab/widgets/widget-storage.js` in `src/new-tab.html` prior to widget modules (`time.js`, `weather.js`, etc.).
   - Update `scripts/check-newtab-static.mjs` `keyExtractedModulePaths` to include `newtab/widgets/widget-storage.js`.

4. **Verification & Testing**:
   - `node --check src/newtab/widgets/widget-storage.js`
   - `node scripts/check-newtab-static.mjs`
   - `npm.cmd test`
   - `npm.cmd run build`
   - Verify protected files have 0 diff.

---

## 6. Risk Assessment & Mitigation

- **Risk: Global collision or script order violation in `new-tab.html`**:
  - *Mitigation*: Loaded directly after core storage utilities (`wallpaper-storage.js`) and before any widget runtime script. Verified using `check-newtab-static.mjs`.
- **Risk: Disruption to instant hydration in `instant_load.js`**:
  - *Mitigation*: Mirror keys and serialized payload shapes are preserved exactly. Legacy mirror keys (`fast-weather`, `fast-quote-state`, `fast-news`) are maintained.
- **Risk: Existing widgets broken during Phase 2**:
  - *Mitigation*: Zero changes to existing widget modules in Phase 2. Existing code continues using its current paths until Phase 3 migration.
