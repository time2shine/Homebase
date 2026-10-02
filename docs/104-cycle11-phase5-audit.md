# Homebase Improvement Cycle #11 — Phase 5 Architecture Audit

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 5 Architecture Audit  
> **Target Release**: Homebase v0.19.0  
> **Baseline Commit**: `22aa5dd` ("Extract performance mode and UI runtime delegation")  
> **Remote Status**: Synchronized with `origin/development` (`22aa5dd`)  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/64-cycle11-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/64-cycle11-plan.md), [docs/103-cycle11-phase4-checkpoint5-push-confirmation.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/103-cycle11-phase4-checkpoint5-push-confirmation.md)

---

## 1. Executive Summary & Progression Baseline

Homebase Improvement Cycle #11 has systematically transformed the monolithic new-tab architecture through phased, zero-regression modular extractions:
1. **Cycle #11 Phase 2 (Wallpaper Controller)**: Decomposed the entire wallpaper subsystem (video playback, canvas postering, daily rotation, manifest caching, and gallery UI context) out of [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js).
2. **Cycle #11 Phase 3 (Bookmark Grid Controller)**: Decomposed bookmark rendering, folder card presentation, grid virtualization, DOM reconciliation, inline item renaming, and folder tabs navigation runtime into [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js).
3. **Cycle #11 Phase 4 (Context Menus, Search & Performance)**: Decomposed the context menu system ([`src/newtab/core/context-menu-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/context-menu-controller.js)), search interaction & engine settings ([`src/newtab/search/search-interaction-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-interaction-controller.js), [`src/newtab/search/search-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-storage.js), [`src/newtab/settings/search-engine-settings.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js)), performance mode runtime ([`src/newtab/settings/performance-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js)), and Firefox container folder batch-opening ([`src/newtab/integrations/firefox-containers.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js)).

### Aggregate Line Count Progression

| Milestone | Total Lines | Executable Lines | Blank / Comment | Phase Delta | Cumulative Reduction |
|---|:---:|:---:|:---:|:---:|:---:|
| **Pre-Cycle #11 Baseline** | 9,012 | ~5,620 | ~3,392 | Baseline | Baseline |
| **Post-Phase 2 (Wallpaper)** | 6,942 | ~4,260 | ~2,682 | -2,070 lines | -23.0% |
| **Post-Phase 3 (Bookmark Grid)** | 5,281 | ~3,136 | ~2,145 | -1,661 lines | -41.4% |
| **Post-Phase 4 (Menus, Search, Perf)** | **3,833** | **~2,240** | **~1,593** | **-1,448 lines** | **-5,179 lines (-57.5%)** |

[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) has been reduced by more than **57%** since project baseline.

---

## 2. Current Monolith Functional Breakdown

A comprehensive structural scan of the remaining 3,833 lines in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) identifies the following primary functional blocks:

| Line Range | Line Count | Primary Responsibility | Key Functions / Symbols |
|---|:---:|---|---|
| **1 – 460** | 460 | Protected Idle Task Scheduler, Dynamic Asset Loaders | `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, `loadScriptOnce`, `loadStylesheetOnce`, `openBookmarkIconPicker` |
| **461 – 638** | 178 | Wallpaper Startup Prime, Responsive Sidebar/Dock Collapse | `primeWallpaperBackground`, `updateSidebarCollapseState`, `debouncedResize`, `tabsScrollController` |
| **639 – 1,000** | 362 | DOM Element Declarations, Favicon Bridges, State Variables | `ensureFaviconObserver`, `getDomainKeyFromUrl`, `getFaviconUrlForRawUrl`, `bookmarkMetadata`, `folderMetadata`, settings preferences |
| **1,001 – 1,119** | 119 | Bookmark Editor Adapter, Context Factory & Modals | `ensureBookmarkEditor`, `createBookmarkEditorContext`, `callBookmarkEditorMethod`, `showAddBookmarkModal`, `showEditBookmarkModal`, `showAddFolderModal`, `showEditFolderModal`, `openMoveBookmarkModal`, `showDeleteConfirm` |
| **1,120 – 1,337** | 218 | Bookmark UI Visibility, Native Tree Queries | `hideBookmarksUI`, `showBookmarksUI`, `showBookmarksEmptyState`, `beginBookmarksBoot`, `findChildFolderByTitle`, `ensureFolder`, `ensureBookmark`, `getOtherBookmarksNode`, `getBookmarkTree`, `getStoredHomebaseRootSubTree` |
| **1,338 – 1,689** | 352 | Grid Sortable.js Drag-and-Drop Handlers | `setupGridSortable`, `handleGridMove`, `handleGridDragPointerMove`, `clearTabDropHighlight`, `moveItemInLocalTree`, `handleGridDrop` |
| **1,690 – 2,053** | 364 | Tab Sortable.js Drag-and-Drop & Icon Delegators | `setupTabsSortable`, `handleTabDrop`, `flattenBookmarks`, `resolveFaviconForImageTarget`, `renderBookmarkIconInto`, `renderFolderIconInto` |
| **2,054 – 2,549** | 496 | Bookmark Item Actions (Delete, Search, Sort, Paste) | `deleteBookmarkOrFolder`, `findBookmarkNodeById`, `findNodeAndParent`, `updateNodeInTree`, `appendNodeToParent`, `getValidFolderId`, `getDefaultBookmarkParentId`, `getSmartNameFromUrl`, `handlePasteBookmark`, `sortCurrentFolderByName`, `deleteBookmarkFolder` |
| **2,550 – 2,895** | 346 | Grid Delegators, Metadata Loaders, Root Folder Setup | `showEditInput`, `showGridItemRenameInput`, `createFolderTabs`, `processBookmarks`, `loadBookmarkMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, `loadFolderMetadata`, `createHomebaseFolder`, `loadBookmarks`, `setupHomebaseRootControls`, `setupHomebaseRootListeners` |
| **2,896 – 3,074** | 179 | Performance Mode & Search Compatibility Bridges | `readFastPerformanceModePreference`, `syncFastPerformanceModeMirror`, `isPerformanceModeEnabled`, `disableGridAnimationRuntime`, `disableGlassRuntime`, `enableGlassRuntimeFromPreference`, `applyPerformanceModeState`, `updateSearchUI`, `clearSearchUI`, `hideSearchResultsPanel`, `cycleSearchEngine`, `setupSearch`, `setSearchSuggestionsPreference`, `applySearchEngineConfig`, `getSafeEnabledSearchEngineId` |
| **3,075 – 3,441** | 367 | Startup Orchestration (`initializePage`) | `initializePage` (Protected core startup orchestration) |
| **3,442 – 3,670** | 229 | DOM Event Wiring & Controller Initializations | Quick actions bar wiring, Context Menu DI initialization, `#bookmarks-grid` click routing |
| **3,671 – 3,833** | 163 | Visibility Lifecycle, Bookmark Tabs Open, Unload Cleanup | `visibilitychange` video play/pause, `openBookmarkInNewTab`, `openFolderFromContext`, window unload handlers, obsolete extraction comments |

---

## 3. High-Priority Extraction Candidates

Following the core principle of prioritizing areas that already have supporting modules, contain duplicate state/logic, and can be isolated without altering runtime contracts:

### Candidate 1: Wallpaper Visibility Lifecycle & Media Cleanup
- **Location**: `src/new-tab.js` lines 3680–3750, 3751–3791, 3831–3833 (~110 lines).
- **Responsibility**: Listens to `document.addEventListener('visibilitychange')` to pause `.background-video` elements when tab is backgrounded and resume the active video on foreground. Also includes dynamic accent idle task and ~60 lines of dead vertical whitespace / historical extraction comments.
- **Target Module**: [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js).
- **Dependencies**: `isPerformanceModeEnabled()`, `searchInput.focus()`.
- **Migration Difficulty**: Low.
- **Risk Level**: Low.
- **Expected Line Reduction**: ~100–110 lines.
- **Verification Strategy**: Headless CDP test toggling `document.hidden` simulation; check video play/pause events.

### Candidate 2: Responsive Layout & Sidebar/Dock Collapse Controller
- **Location**: `src/new-tab.js` lines 470–475, 552–625 (~120 lines).
- **Responsibility**: Responsive width ratio calculations (`SIDEBAR_COLLAPSE_RATIO`, `DOCK_COLLAPSE_RATIO`), toggling `.sidebar-collapsed` and `.dock-collapsed` on `document.body`, moving `timeWidget` into `collapsedClockSlot` or restoring it to `sidebar`, and handling window `resize` with debouncing.
- **Target Module**: [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) or a dedicated layout controller.
- **Dependencies**: `document.body`, `collapsedClockSlot`, `timeWidget`, `sidebar`, `debounce`.
- **Migration Difficulty**: Low.
- **Risk Level**: Low.
- **Expected Line Reduction**: ~100–120 lines.
- **Verification Strategy**: Window resize testing at breakpoint widths (< 49% and < 32% screen width); verify DOM classes and clock placement.

### Candidate 3: Settings Preferences State Synchronization & Shadow Variable Pruning
- **Location**: `src/new-tab.js` lines 940–1089 (~150 lines).
- **Responsibility**: 17 top-level preference variables (`appBackgroundDimPreference`, `appShowSidebarPreference`, `appShowWeatherPreference`, `appShowQuotePreference`, `appShowNewsPreference`, `appShowTodoPreference`, `appNewsSourcePreference`, `appMaxTabsPreference`, `appAutoClosePreference`, `appSingletonModePreference`, `appContainerModePreference`, `appContainerNewTabPreference`, `appBookmarkOpenNewTabPreference`, `appBookmarkFolderColorPreference`, `appBookmarkFallbackColorPreference`, `appBatteryOptimizationPreference`, `appCinemaModePreference`).
- **Target Module**: [`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js).
- **Dependencies**: Loaded during `initializePage()` via `loadAppSettingsFromStorage()`.
- **Migration Difficulty**: Low-to-Medium.
- **Risk Level**: Low-to-Medium (must ensure all external readers can access preferences via window or getter facade).
- **Expected Line Reduction**: ~120–150 lines.
- **Verification Strategy**: Unit tests for `settings-preferences.js`; automated storage roundtrip test; CDP verify settings form sync.

### Candidate 4: Bookmark Editor Lifecycle & Modal Dialog Delegation
- **Location**: `src/new-tab.js` lines 1001–1119 (~119 lines).
- **Responsibility**: Lazy-loading `assets/js/bookmark-editor.js`, assembling `createBookmarkEditorContext()`, forwarding editor modal triggers (`showAddBookmarkModal`, `showEditBookmarkModal`, `showAddFolderModal`, `showEditFolderModal`, `openMoveBookmarkModal`, `showDeleteConfirm`), and error handling (`notifyBookmarkEditorLoadFailure`).
- **Target Module**: [`src/newtab/bookmarks/bookmark-editor-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/) (new adapter module) or integration with [`src/newtab/core/dialog-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dialog-controller.js).
- **Dependencies**: `loadScriptOnce`, context dependency getters (`bookmarkTree`, `bookmarkMetadata`, `folderMetadata`, `browser.bookmarks.*`).
- **Migration Difficulty**: Medium.
- **Risk Level**: Medium (bookmark editor context must supply all 30+ dependency callbacks accurately).
- **Expected Line Reduction**: ~110–120 lines.
- **Verification Strategy**: Trigger add bookmark, edit bookmark, add folder, edit folder, and delete confirm modals via browser harness; verify context callbacks.

### Candidate 5: Bookmark Actions (Clipboard Paste, Folder Sorting & Item Deletion)
- **Location**: `src/new-tab.js` lines 2054–2200 and 2420–2549 (~275 lines).
- **Responsibility**: Clipboard URL pasting (`handlePasteBookmark`), smart title extraction (`getSmartNameFromUrl`), alphabetical folder sorting (`sortCurrentFolderByName`, `compareBookmarkNodeTitles`), and bookmark/folder deletion handling (`deleteBookmarkOrFolder`, `deleteBookmarkFolder`).
- **Target Module**: [`src/newtab/bookmarks/bookmark-actions.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/) or consolidation into [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js).
- **Dependencies**: `browser.bookmarks.create/move/removeTree`, `navigator.clipboard.readText`, `showCustomAlert`, `showDeleteConfirm`, `renderBookmarkGrid`.
- **Migration Difficulty**: Medium.
- **Risk Level**: Medium (context menu depends directly on `handlePasteBookmark` and `sortCurrentFolderByName`).
- **Expected Line Reduction**: ~200–250 lines.
- **Verification Strategy**: Context menu test suite; paste validation; folder sort order check.

### Candidate 6: Bookmark Root Management & Native Storage Observers
- **Location**: `src/new-tab.js` lines 2811–2895 (~85 lines).
- **Responsibility**: `setupHomebaseRootControls` (wires Create Folder and Choose Folder root buttons), and `setupHomebaseRootListeners` (binds `browser.bookmarks.onCreated`, `onChanged`, `onMoved`, `onRemoved` to invalidate caches and trigger UI fallback if the Homebase root folder is deleted).
- **Target Module**: [`src/newtab/bookmarks/bookmark-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-storage.js).
- **Dependencies**: `browser.bookmarks` events, `openFolderPicker`, `createHomebaseFolder`, `clearHomebaseRootId`, `showBookmarksEmptyState`.
- **Migration Difficulty**: Medium.
- **Risk Level**: Medium.
- **Expected Line Reduction**: ~80–85 lines.
- **Verification Strategy**: Simulated `onCreated`/`onRemoved` bookmark events; verify cache invalidation and empty state transitions.

---

## 4. Protected Areas Strictly Excluded from Extraction

In compliance with [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following high-risk domains remain strictly protected inside [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):

1. **`initializePage()`**: Core startup orchestration and parallel promise loading (lines 3075–3441).
2. **Idle Task Scheduler**: `processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask` (lines 90–377).
3. **Sortable.js Grid & Tab Drag-and-Drop Core**: Active grid/tab drag move, throttle, and drop coordination (lines 1338–1689 and 1782–1870).
4. **Protected Core Files**: [`src/preload.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [`src/instant_load.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js), `manifests/*`, and `dist/*`.

---

## 5. Recommended Phase 5 Implementation Roadmap

Checkpoints are ordered strictly from safest / lowest risk to higher complexity:

| Checkpoint | Target Domain | Candidate Focus | Risk Level | Est. Lines Reduced |
|---|---|---|:---:|:---:|
| **Checkpoint 1** | **Wallpaper & Media Lifecycle** | Candidate 1: `visibilitychange` video play/pause & comment pruning | **Low** | ~100–110 lines |
| **Checkpoint 2** | **Layout & Responsive Runtime** | Candidate 2: `updateSidebarCollapseState` & resize handler | **Low** | ~100–120 lines |
| **Checkpoint 3** | **Settings Preferences State** | Candidate 3: Preference variables consolidation & shadow pruning | **Low-Med** | ~120–150 lines |
| **Checkpoint 4** | **Bookmark Editor Adapter** | Candidate 4: `ensureBookmarkEditor`, context creation & modals | **Medium** | ~110–120 lines |
| **Checkpoint 5** | **Bookmark Action Handlers** | Candidate 5: Paste, sort, delete, and title resolution | **Medium** | ~200–250 lines |
| **Checkpoint 6** | **Bookmark Root & Observers** | Candidate 6: Root controls wiring & native bookmark listeners | **Medium** | ~80–85 lines |

### Projected Phase 5 Outcome
- **Current `new-tab.js`**: 3,833 lines
- **Projected Reductions**: ~710–835 lines across 6 checkpoints
- **Target `new-tab.js` Size**: **~3,000–3,100 lines** (overall ~66% reduction from 9,012 baseline)

---

## 6. No-Code-Change Confirmation

As required by Homebase workflow rules for audit phases:
- **No source code files modified**
- **No commits created**
- **No pushes performed**
- **Working tree verified clean**

---

## 7. Next Step

Awaiting owner review and approval of [`docs/104-cycle11-phase5-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/104-cycle11-phase5-audit.md) before drafting the Checkpoint 1 implementation plan.
