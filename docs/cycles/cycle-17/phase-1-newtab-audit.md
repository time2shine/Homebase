# Cycle #17 Phase 1 — New Tab Subsystem Architecture Audit

## 1. Executive Summary
This architecture audit provides a comprehensive, read-only inspection of the entire `src/newtab/` subsystem, runtime pipeline, and script loading manifest in `src/new-tab.html`. Following the successful stabilization and extraction of the Search subsystem in Cycles #15 and #16, this document inventories all 76 JavaScript runtime modules (totaling ~38,500 lines of code), maps dependencies, audits storage and DOM ownership, identifies remaining architectural debt, and establishes a prioritized migration roadmap for Cycle #17.

---

## 2. Global Runtime & Performance Boundaries

### 2.1 Execution Model Invariant
- **Classic `<script defer>` Scripts**: Homebase loads 68 deferred scripts in document order within a shared global lexical declarative environment record. No ES modules or bundlers are used.
- **Top-Level Declaration Safety**: The static invariant checker (`scripts/check-newtab-static.mjs`) enforces zero duplicate top-level lexical bindings (`const`, `let`, `class`, function declarations) across all 68 deferred scripts (813 unique declarations verified).

### 2.2 Three-Tier Loading Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Synchronous Preload (Head)                                          │
│    src/preload.js (526 lines)                                          │
│    - Blocks first paint for <50ms                                      │
│    - Reads localStorage mirrors: theme, poster, glass style, dim, accent│
│    - Sets initial CSS variables on <html> to prevent FOUC              │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Instant Load & Deferred Pipeline (Body End)                         │
│    src/instant_load.js (480 lines)                                     │
│    - Instant cached DOM hydration: fast-search, fast-widget-order, etc.│
│    68 Deferred Scripts in new-tab.html:                                │
│    - Vendor & Core Infrastructure (Sortable, data, utils, storage)     │
│    - Domain Services (bookmarks, search, wallpaper, widgets, settings) │
│    - Startup Orchestrator: src/new-tab.js (334 lines, runs last)       │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Lazy-Loaded On-Demand Dialogs                                       │
│    src/newtab/settings/settings-ui.js (163 lines -> loads chunks)      │
│    src/newtab/wallpaper/gallery-ui.js (2,986 lines, loaded on click)   │
│    src/assets/js/bookmark-editor.js (2,217 lines, loaded on edit)      │
│    src/assets/js/icon-picker.js (222 lines, loaded in editor)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Metrics & Inventory Overview

| Subsystem | Files | Total Lines | Total Functions | Files >800 Lines | Canonical Controller |
|---|---|---|---|---|---|
| **Settings** | 15 | 7,621 | 153 | 3 | `HomebaseSettingsPanelController` |
| **Wallpaper** | 4 | 6,628 | 264 | 3 | `HomebaseWallpaperController` |
| **Bookmarks** | 14 | 6,286 | 213 | 2 | `HomebaseBookmarkGridController` |
| **Core & Storage** | 17 | 5,595 | 218 | 2 | `HomebaseStorage` / `HomebaseStorageDispatcher` |
| **Search** | 7 | 4,249 | 175 | 2 | `HomebaseSearchInteractionController` |
| **Widgets** | 6 | 3,529 | 118 | 3 | Decentralized (per-widget) |
| **Assets / Modals** | 2 | 2,439 | 101 | 1 | `HomebaseBookmarkEditor` |
| **Startup / Root** | 5 | 2,028 | 41 | 0 | `src/new-tab.js` (orchestrator) |
| **Integrations** | 2 | 785 | 15 | 0 | `HomebaseFirefoxContainers` |
| **Tips** | 1 | 341 | 14 | 0 | `HomebaseTipsUI` |
| **TOTAL** | **76** | **~38,500** | **~1,312** | **16** | — |

---

## 4. Subsystem-by-Subsystem Audit

### 4.1 Wallpaper Subsystem (4 files, 6,628 lines)
- **Files**:
  - `src/newtab/wallpaper/gallery-ui.js` (2,986 lines, 134 fns) — **Largest file in repository**
  - `src/newtab/wallpaper/wallpaper-controller.js` (2,029 lines, 70 fns) — **4th largest file**
  - `src/newtab/wallpaper/wallpaper-storage.js` (1,528 lines, 57 fns) — **7th largest file**
  - `src/newtab/wallpaper/dynamic-accent.js` (85 lines, 3 fns)
- **Role**: Wallpaper playback, video crossfading, poster generation, daily wallpaper rotation, asset caching via Cache API, and full wallpaper gallery modal.
- **Architectural Findings & Debt**:
  1. `gallery-ui.js` (2,986 lines) combines gallery DOM rendering, preview playback, tag filtering, pagination, favorites management, search, and video downloads.
  2. `wallpaper-controller.js` (2,029 lines) mixes DOM video element manipulation with daily rotation timer state, gallery bridge coordination, and offline fallback generation.
  3. Storage boundary: `wallpaper-storage.js` is the primary owner, but `gallery-ui.js` still contains direct writes to `localStorage` (5 writes) and `HomebaseStorage.set` (1 write).

### 4.2 Bookmarks Subsystem (14 files, 6,286 lines + 2,217 lines in editor)
- **Files**:
  - `src/newtab/bookmarks/bookmark-grid-controller.js` (2,141 lines, 65 fns) — **3rd largest file**
  - `src/assets/js/bookmark-editor.js` (2,217 lines, 91 fns) — **2nd largest file**
  - `src/newtab/bookmarks/bookmark-drag-controller.js` (824 lines, 20 fns) — **14th largest file**
  - `src/newtab/bookmarks/bookmark-tabs-scroll.js` (530 lines, 17 fns)
  - `src/newtab/bookmarks/bookmark-action-controller.js` (514 lines, 26 fns)
  - `src/newtab/bookmarks/bookmark-loader-service.js` (401 lines, 13 fns)
  - `src/newtab/bookmarks/bookmark-root-controller.js` (393 lines, 15 fns)
  - `src/newtab/bookmarks/folder-picker.js` (333 lines, 17 fns)
  - `src/newtab/bookmarks/bookmark-storage.js` (320 lines, 12 fns)
  - `src/newtab/bookmarks/bookmark-editor-adapter.js` (316 lines, 11 fns)
  - `src/newtab/bookmarks/bookmark-tree-service.js` (282 lines, 10 fns)
  - `src/newtab/bookmarks/bookmark-ui-state.js` (193 lines, 15 fns)
  - `src/newtab/bookmarks/grid-reorder-animation.js` (156 lines, 3 fns)
  - `src/newtab/bookmarks/bookmark-style-runtime.js` (150 lines, 7 fns)
  - `src/newtab/bookmarks/quick-actions.js` (70 lines, 2 fns)
- **Role**: WebExtension bookmark tree synchronizer, root display resolution, virtualized tile grid rendering, drag-and-drop tile sorting, folder tabs strip overflow, and bookmark editor modal.
- **Architectural Findings & Debt**:
  1. `bookmark-grid-controller.js` (2,141 lines) is heavily overloaded: it owns DOM tile creation, virtualized layout, click delegation, folder opening, tab strip updates, and keyboard navigation.
  2. Tile DOM construction is inlined inside `bookmark-grid-controller.js`, exactly as search DOM construction was inlined before Cycle #16.
  3. `bookmark-editor.js` (2,217 lines) in `assets/js` is a monolithic modal script with form controls, color pickers, and delete dialogs.

### 4.3 Widgets Subsystem (6 files, 3,529 lines)
- **Files**:
  - `src/newtab/widgets/weather.js` (1,143 lines, 34 fns) — **8th largest file**
  - `src/newtab/widgets/quote.js` (911 lines, 23 fns) — **12th largest file**
  - `src/newtab/widgets/news.js` (816 lines, 31 fns) — **16th largest file**
  - `src/newtab/widgets/todo.js` (359 lines, 18 fns)
  - `src/newtab/widgets/widget-visibility.js` (242 lines, 9 fns)
  - `src/newtab/widgets/time.js` (58 lines, 3 fns)
- **Role**: Dashboard productivity widgets: Weather (Open-Meteo), Quote of the Day, News RSS/JSON reader, Todo checklist, Clock, and sidebar toggle.
- **Architectural Findings & Debt**:
  1. **Decentralized Storage**: Unlike search, bookmarks, or wallpaper, there is NO `widget-storage.js`. Every widget implements its own persistence logic, writing to `HomebaseStorage.set`, `browser.storage.local.set`, and `localStorage.setItem` for fast mirrors.
  2. **Monolithic Widget Controllers**: `weather.js` (1,143 lines), `quote.js` (911 lines), and `news.js` (816 lines) each mix network fetching, JSON parsing, storage caching, error retries, and DOM card rendering into single files.
  3. **High Extraction Potential**: Creating a unified `HomebaseWidgetStorage` or extracting presentation renderers from `weather.js` and `news.js` would dramatically clean up this subsystem.

### 4.4 Settings Subsystem (15 files, 7,621 lines)
- **Files**:
  - `src/newtab/settings/diagnostic-ui.js` (1,110 lines, 19 fns) — **9th largest file**
  - `src/newtab/settings/settings-content-sections.js` (1,087 lines, 37 fns) — **10th largest file**
  - `src/newtab/settings/settings-preferences.js` (818 lines, 7 fns) — **15th largest file**
  - `src/newtab/settings/material-color-picker.js` (726 lines, 7 fns)
  - `src/newtab/settings/settings-form-controller.js` (698 lines, 13 fns)
  - `src/newtab/settings/settings-storage.js` (637 lines, 4 fns)
  - `src/newtab/settings/backup-import.js` (631 lines, 8 fns)
  - `src/newtab/settings/search-engine-settings.js` (426 lines, 5 fns)
  - `src/newtab/settings/settings-panel-controller.js` (408 lines, 12 fns)
  - `src/newtab/settings/performance-controller.js` (375 lines, 14 fns)
  - `src/newtab/settings/visual-effects-settings.js` (200 lines, 5 fns)
  - `src/newtab/settings/settings-ui.js` (163 lines, 6 fns)
  - `src/newtab/settings/sub-settings-ui.js` (139 lines, 4 fns)
  - `src/newtab/settings/visual-effects-runtime.js` (132 lines, 8 fns)
  - `src/newtab/settings/cinema-mode-runtime.js` (71 lines, 4 fns)
- **Role**: Settings modal presentation, form synchronization, export/import backups, storage diagnostics, visual effect toggles, and performance presets.
- **Architectural Findings & Debt**:
  1. Storage write fragmentation: 6 different files perform independent storage writes (`settings-storage.js`, `settings-form-controller.js`, `settings-preferences.js`, `backup-import.js`, `search-engine-settings.js`, `visual-effects-settings.js`).
  2. `settings-form-controller.js` exports an unusually large number of global functions and properties (~48 globals) onto `window`.
  3. `settings-content-sections.js` (1,087 lines) builds large DOM trees for settings panels using raw HTML strings.

### 4.5 Core & Storage Subsystem (17 files, 5,595 lines)
- **Files**:
  - `src/newtab/core/perf-report.js` (1,580 lines, 50 fns) — **6th largest file**
  - `src/newtab/core/favicon-pipeline.js` (855 lines, 40 fns) — **13th largest file**
  - `src/newtab/core/storage-service.js` (505 lines, 12 fns)
  - `src/newtab/core/context-menu-controller.js` (437 lines, 9 fns)
  - `src/newtab/core/startup-perf-runtime.js` (407 lines, 20 fns)
  - `src/newtab/core/schema-migrations.js` (348 lines, 6 fns)
  - `src/newtab/core/utils.js` (284 lines, 16 fns)
  - `src/newtab/core/startup-hydration.js` (264 lines, 11 fns)
  - `src/newtab/core/dock-navigation.js` (257 lines, 10 fns)
  - `src/newtab/core/host-storage-adapter.js` (242 lines, 8 fns)
  - `src/newtab/core/storage-dispatcher.js` (190 lines, 5 fns)
  - `src/newtab/core/idle-scheduler.js` (188 lines, 8 fns)
  - `src/newtab/core/dialog-controller.js` (180 lines, 9 fns)
  - `src/newtab/core/tab-lifecycle.js` (158 lines, 2 fns)
  - `src/newtab/core/favicon-cache.js` (138 lines, 7 fns)
  - `src/newtab/core/dialogs.js` (115 lines, 6 fns)
  - `src/newtab/core/asset-loader.js` (86 lines, 2 fns)
  - `src/newtab/core/sortable-bridge.js` (29 lines, 1 fns)
- **Role**: Storage facade (`HomebaseStorage`), schema validation, migration pipeline, favicon resolution, context menus, idle task scheduler, and modal dialog lifecycle.
- **Architectural Findings & Debt**:
  1. `storage-service.js` is the solid unified facade for schema validation and batch writes.
  2. `perf-report.js` (1,580 lines) is disproportionately large for a performance reporting tool, containing extensive internal chart/HTML rendering and CSV export logic.

### 4.6 Search Subsystem (7 files, 4,249 lines)
- **Status**: **Fully stabilized in Cycles #15 and #16**.
- **Role**: Decoupled architecture with clear single-owner boundaries:
  - `search-storage.js` (storage and fast-search mirror)
  - `search-suggestion-cache.js` (LRU cache)
  - `search-suggestion-service.js` (remote suggestions fetch and bang routing)
  - `search-results-renderer.js` (dropdown DOM synthesis)
  - `search-ui-controller.js` (engine picker and icons)
  - `search-interaction-controller.js` (input, debounce, keyboard navigation)
  - `search-utils.js` (math, units, URL heuristics)

---

## 5. Architectural Risk Ranking

| Risk Rank | Subsystem / File | Nature of Risk | Impact | Recommended Remedy |
|---|---|---|---|---|
| **#1 (Highest)** | `src/newtab/wallpaper/gallery-ui.js` (2,986 lines) | Massive monolithic modal file, complex DOM synthesis mixed with video playback, network asset downloads, and storage writes. | Memory leaks, difficult maintenance, sluggish gallery opening. | Extract gallery card renderer and video preview manager into dedicated modules. |
| **#2** | `src/newtab/bookmarks/bookmark-grid-controller.js` (2,141 lines) | Core dashboard tile renderer combines virtualized scrolling, tile DOM generation, folder state, and click delegation. | First-paint risk, drag-and-drop complexity. | Extract bookmark tile renderer (`bookmark-tile-renderer.js`) following Search Results Renderer pattern. |
| **#3** | `src/newtab/widgets/` (`weather.js`, `quote.js`, `news.js`) | No unified widget storage owner; duplicated network fetch, retry, caching, and fast-mirror code in each widget file. | Data inconsistency, maintenance overhead, duplicated code. | Create unified `HomebaseWidgetStorage` and extract widget presentation renderers. |
| **#4** | `src/newtab/wallpaper/wallpaper-controller.js` (2,029 lines) | Large controller managing background `<video>` elements, crossfade, daily rotation timer, fallback poster creation, and gallery bridge. | Video playback leaks, background resource usage. | Extract daily rotation service and poster generation service. |
| **#5** | `src/newtab/settings/settings-content-sections.js` (1,087 lines) | Raw HTML string concatenation for complex multi-tab settings modal. | Maintenance friction, XSS risk if unescaped. | Modularize settings tab panels into individual section components. |
| **#6** | `src/newtab/core/perf-report.js` (1,580 lines) | Disproportionate size for non-critical performance reporting. | Low runtime risk (lazy), but high code bloat. | Separate reporting data aggregator from chart/UI presentation. |

---

## 6. Conclusion
The search subsystem serves as an exemplar for clean modular architecture in Homebase. The primary architectural hotspots remaining in the repository are:
1. **Wallpaper Subsystem** (`gallery-ui.js` + `wallpaper-controller.js` = 5,015 lines)
2. **Bookmarks Subsystem** (`bookmark-grid-controller.js` = 2,141 lines)
3. **Widgets Subsystem** (Fragmented storage across 6 widget modules = 3,529 lines)
