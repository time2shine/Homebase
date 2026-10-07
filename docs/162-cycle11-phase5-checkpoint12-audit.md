# Homebase Cycle #11 Phase 5 - Checkpoint 12 Architecture Audit

**Target File**: `src/new-tab.js`  
**Current Baseline**: 2,167 lines (following Checkpoint 11-C push `7474638`)  
**Status**: Audit & Planning Only (No code modifications, no commits, no pushes)

---

## 1. Executive Summary & Current State

Following the completion of Checkpoints 11-A, 11-B, and 11-C:
- Checkpoint 11-A removed redundant performance compatibility bridge implementations in `src/new-tab.js`.
- Checkpoint 11-B removed redundant search UI forwarders in `src/new-tab.js`.
- Checkpoint 11-C removed redundant favicon pipeline forwarders in `src/new-tab.js`.

The current line count of `src/new-tab.js` is **2,167 lines**.

This audit examines all remaining top-level functions, top-level variables/constants, compatibility wrappers, duplicated controller ownership, and dead DOM handles in `src/new-tab.js`. It establishes a classification framework (Class A: Safe extraction, Class B: Medium risk, Class C: Must remain in `new-tab.js` / Protected) and identifies the optimal candidates for upcoming checkpoints.

---

## 2. Line Count & Architectural Zone Map

| Architectural Zone | Line Range in `src/new-tab.js` | Approx. Lines | Nature & Protection Status |
|---|---|---|---|
| **1. Global Elements / DOM Handles & Shims** | L1 – L65 | 65 | Core DOM references and browser shim (`browser`, search, bookmarks, folder picker, scroll buttons) |
| **2. Idle Task Scheduler Subsystem** | L66 – L354 | 289 | **Protected (Class C)**: Idle task budget, queue, scheduling, chunking engine |
| **3. Bookmark Icon Picker Helper** | L356 – L373 | 18 | **Candidate (Class A)**: Dynamic script loader and bridge to `HomebaseIconPicker` |
| **4. Reveal Widget Helper** | L375 – L385 | 11 | **Candidate (Class A)**: Class toggler (`widget-hidden` -> `widget-visible`) |
| **5. Wallpaper Priming Lifecycle** | L387 – L479 | 93 | **Protected (Class C)**: Instant wallpaper background cache priming |
| **6. Drag State & Sortable Globals** | L480 – L568 | 89 | **Protected (Class C)**: Pointer tracking, hover timers, Sortable instances |
| **7. Context Menu DOM Elements & Forwarders** | L569 – L605 | 37 | **Candidate (Class A)**: Redundant context menu elements and duplicate forwarders |
| **8. Context Menu Tracking State** | L606 – L616 | 11 | **Candidate (Class A)**: Write-only context variables (`currentContextItemId`, etc.) |
| **9. Quick Actions & Settings Elements** | L618 – L641 | 24 | Quick action buttons, dock settings, modal references |
| **10. Favicon Runtime Forwarders** | L643 – L655 | 13 | Minimal alias forwarders to `HomebaseFaviconPipeline` |
| **11. Bookmark Metadata Variables** | L656 – L663 | 8 | State for bookmark metadata, folder metadata, last-used folder |
| **12. Sortable.js Drag & Drop Engine** | L664 – L1342 | 679 | **Protected (Class C)**: Grid sortable (L678–1120), tab sortable (L1121–1342) |
| **13. Bookmark Tree & Loading Pipeline** | L1343 – L1497 | 155 | **Candidate (Class B)**: `processBookmarks`, metadata bridges, `loadBookmarks` |
| **14. Search Bar Elements & Forwarders** | L1499 – L1536 | 38 | Search inputs, search forwarders, `setupSearch` helper |
| **15. Firefox Container Comment** | L1538 – L1543 | 6 | Documentation reference |
| **16. Startup Orchestration (`initializePage`)** | L1545 – L2062 | 518 | **Protected (Class C)**: `logInitSettled` (3L), `initializePage` (501L) |
| **17. Browser Storage Change Listener** | L2064 – L2131 | 68 | **Protected (Class C)**: Cross-subsystem storage synchronization |
| **18. DOM & Window Lifecycle Listeners** | L2133 – L2155 | 23 | **Protected (Class C)**: `DOMContentLoaded`, `load` perf marks, `initializePage()` call |
| **19. Dynamic Accent Startup Trigger** | L2157 – L2168 | 12 | **Protected (Class C)**: Dynamic accent scheduling logic |
| **TOTAL** | **L1 – L2168** | **2,167 lines** | *(Excluding trailing empty newline)* |

---

## 3. Comprehensive Inventory of Top-Level Functions

There are exactly **23 top-level functions** remaining in `src/new-tab.js`:

| # | Function Name | Line Range | Lines | Subsystem | Classification | Notes |
|---|---|---|---|---|---|---|
| 1 | `processIdleTasks` | L91 – L213 | 123 | Idle Scheduler | **Class C** | Protected under AGENTS.md |
| 2 | `scheduleIdleTask` | L216 – L260 | 45 | Idle Scheduler | **Class C** | Protected under AGENTS.md |
| 3 | `scheduleIdleChunkedTask` | L262 – L354 | 93 | Idle Scheduler | **Class C** | Protected under AGENTS.md |
| 4 | `openBookmarkIconPicker` | L356 – L373 | 18 | Dialogs / Bookmarks | **Class A** | Only called by `bookmark-editor-adapter.js` |
| 5 | `revealWidget` | L375 – L385 | 11 | Widgets UI | **Class A** | Called by widgets (`weather.js`, etc.) |
| 6 | `primeWallpaperBackground` | L389 – L453 | 65 | Wallpaper Lifecycle | **Class C** | Protected under AGENTS.md |
| 7 | `setupGridSortable` | L689 – L771 | 83 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 8 | `handleGridMove` | L785 – L881 | 97 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 9 | `handleGridDragPointerMove` | L885 – L953 | 69 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 10 | `clearTabDropHighlight` | L957 – L965 | 9 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 11 | `moveItemInLocalTree` | L977 – L988 | 12 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 12 | `handleGridDrop` | L994 – L1116 | 123 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 13 | `setupTabsSortable` | L1134 – L1210 | 77 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 14 | `handleTabDrop` | L1222 – L1342 | 121 | Sortable Drag/Drop | **Class C** | Protected under AGENTS.md |
| 15 | `processBookmarks` | L1344 – L1358 | 15 | Bookmark Pipeline | **Class B** | Tree flattening & tab instantiation |
| 16 | `loadBookmarkMetadata` | L1362 – L1369 | 8 | Bookmark Storage | **Class B** | Thin wrapper around `HomebaseBookmarkStorage` |
| 17 | `loadLastUsedFolderId` | L1371 – L1378 | 8 | Bookmark Storage | **Class B** | Thin wrapper around `HomebaseBookmarkStorage` |
| 18 | `setLastUsedFolderId` | L1380 – L1391 | 12 | Bookmark Storage | **Class B** | Storage setter & state sync |
| 19 | `loadFolderMetadata` | L1393 – L1400 | 8 | Bookmark Storage | **Class B** | Thin wrapper around `HomebaseBookmarkStorage` |
| 20 | `loadBookmarks` | L1412 – L1497 | 86 | Bookmark Pipeline | **Class B** | Bookmark tree resolution coordinator |
| 21 | `setupSearch` | L1529 – L1536 | 8 | Startup Search | **Class C** | Search controller initializer wrapper |
| 22 | `logInitSettled` | L1547 – L1549 | 3 | Startup Logging | **Class C** | Parallel init promise resolution logger |
| 23 | `initializePage` | L1562 – L2062 | 501 | Page Orchestration | **Class C** | Protected under AGENTS.md |

---

## 4. Comprehensive Inventory of Top-Level Variables & Constants

There are exactly **76 top-level variables and constants** remaining in `src/new-tab.js` (52 `const`, 24 `let`):

| Line | Kind | Identifier | Purpose & Usage Analysis | Classification |
|---|---|---|---|---|
| L7 | `const` | `browser` | Global browser extension API shim (`window.browser \|\| window.chrome`) | **Class C** |
| L9 | `const` | `googleAppsBtn` | DOM button `#google-apps-btn` | **Class B** |
| L11 | `const` | `googleAppsPanel` | DOM panel `#google-apps-panel` | **Class B** |
| L15 | `const` | `searchWidget` | DOM `.widget-search` (handled dynamically in `search-interaction-controller.js`) | **Class A** |
| L17 | `const` | `searchResultsPanel` | DOM `#search-results-panel` (handled dynamically in `search-interaction-controller.js`) | **Class A** |
| L19 | `const` | `bookmarkResultsContainer` | DOM `#bookmark-results-container` (handled dynamically in `search-interaction-controller.js`) | **Class A** |
| L21 | `const` | `suggestionResultsContainer` | DOM `#suggestion-results-container` (handled dynamically in `search-interaction-controller.js`) | **Class A** |
| L25 | `const` | `searchAreaWrapper` | DOM `.search-area-wrapper` (handled dynamically in `search-interaction-controller.js`) | **Class A** |
| L27 | `const` | `bookmarkTabsTrack` | DOM `#bookmark-tabs-track` (handled by `bookmark-ui-state.js` & `bookmark-tabs-scroll.js`) | **Class A** |
| L29 | `const` | `bookmarkBarWrapper` | DOM `.bookmark-bar-wrapper` (handled by `bookmark-ui-state.js`) | **Class A** |
| L31 | `const` | `bookmarksGridEl` | DOM `#bookmarks-grid` (handled by `bookmark-ui-state.js`) | **Class A** |
| L33 | `const` | `bookmarksEmptyState` | DOM `#bookmarks-empty-state` (handled by `bookmark-ui-state.js`) | **Class A** |
| L35 | `const` | `bookmarksEmptyMessage` | DOM `#bookmarks-empty-message` (handled by `bookmark-ui-state.js`) | **Class A** |
| L37 | `const` | `folderPickerModal` | DOM `#folder-picker-modal` (belongs in `folder-picker.js`) | **Class A** |
| L39 | `const` | `folderPickerPanel` | DOM `#folder-picker-panel` (belongs in `folder-picker.js`) | **Class A** |
| L41 | `const` | `folderPickerSearchInput` | DOM `#folder-picker-search` (belongs in `folder-picker.js`) | **Class A** |
| L43 | `const` | `folderPickerList` | DOM `#folder-picker-list` (belongs in `folder-picker.js`) | **Class A** |
| L45 | `const` | `folderPickerBreadcrumb` | DOM `#folder-picker-breadcrumb` (belongs in `folder-picker.js`) | **Class A** |
| L47 | `const` | `folderPickerConfirmBtn` | DOM `#folder-picker-confirm` (belongs in `folder-picker.js`) | **Class A** |
| L49 | `const` | `folderPickerCancelBtn` | DOM `#folder-picker-cancel` (belongs in `folder-picker.js`) | **Class A** |
| L51 | `const` | `folderPickerError` | DOM `#folder-picker-error` (belongs in `folder-picker.js`) | **Class A** |
| L53 | `const` | `tabScrollLeftBtn` | DOM `#tab-scroll-left` (handled in `bookmark-tabs-scroll.js`) | **Class A** |
| L55 | `const` | `tabScrollRightBtn` | DOM `#tab-scroll-right` (handled in `bookmark-tabs-scroll.js`) | **Class A** |
| L57 | `const` | `runWhenIdle` | Idle scheduler callback helper | **Class C** |
| L71 | `const` | `IDLE_TASK_BUDGET_MS` | Idle scheduler frame budget (12ms) | **Class C** |
| L72 | `const` | `idleTaskQueue` | Idle scheduler FIFO queue | **Class C** |
| L73 | `const` | `idleTaskLabels` | Idle scheduler label map | **Class C** |
| L74 | `let` | `idleTaskScheduled` | Idle scheduler event-loop latch | **Class C** |
| L78 | `const` | `STARTUP_IDLE_LABELS` | Idle scheduler deduplication Set | **Class C** |
| L481 | `let` | `dragMoveScheduled` | Pointer drag RAF latch | **Class C** |
| L483 | `let` | `lastDragX` | Pointer drag coordinate | **Class C** |
| L485 | `let` | `lastDragY` | Pointer drag coordinate | **Class C** |
| L519 | `let` | `allBookmarks` | Flattened bookmark node cache | **Class B** |
| L521 | `let` | `suggestionAbortController` | **Dead declaration**: shadowed in `search-interaction-controller.js` | **Class A** |
| L527 | `const` | `bookmarkFolderTabsContainer` | DOM `#bookmark-folder-tabs` | **Class B** |
| L529 | `let` | `rootDisplayFolderId` | ID of root bookmark display folder | **Class B** |
| L531 | `let` | `activeHomebaseFolderId` | ID of active bookmark folder tab | **Class B** |
| L537 | `let` | `currentGridFolderNode` | Active folder node in grid | **Class B** |
| L539 | `let` | `gridSortable` | Sortable instance for grid | **Class C** |
| L541 | `let` | `tabsSortable` | Sortable instance for tabs | **Class C** |
| L543 | `let` | `isGridDragging` | Grid drag state flag | **Class C** |
| L545 | `let` | `isTabDragging` | Tab drag state flag | **Class C** |
| L547 | `let` | `activeTabDropTarget` | Active drop hover highlight target | **Class C** |
| L553 | `let` | `folderHoverTarget` | Hover-to-open target element | **Class C** |
| L555 | `let` | `folderHoverStart` | Hover timestamp | **Class C** |
| L557 | `let` | `lastGridDragOverItem` | Drag over memoization | **Class C** |
| L559 | `const` | `FOLDER_HOVER_DELAY_MS` | Hover delay constant (250ms) | **Class C** |
| L564 | `let` | `sortableTimeout` | **Dead declaration**: never assigned in `new-tab.js` | **Class A** |
| L571 | `const` | `folderContextMenu` | **Dead DOM handle**: never used in `new-tab.js` | **Class A** |
| L573 | `const` | `menuEditBtn` | **Dead DOM handle**: never used in `new-tab.js` | **Class A** |
| L575 | `const` | `menuDeleteBtn` | **Dead DOM handle**: never used in `new-tab.js` | **Class A** |
| L581 | `const` | `gridFolderMenu` | **Dead DOM handle**: never used in `new-tab.js` | **Class A** |
| L583 | `const` | `iconContextMenu` | **Dead DOM handle**: never used in `new-tab.js` | **Class A** |
| L585 | `const` | `gridBlankMenu` | DOM `#bookmark-grid-blank-menu` (used only by `quick-actions.js`) | **Class A** |
| L587 | `const` | `gridMenuCreateBookmarkBtn` | **Dead DOM handle**: handled in `context-menu-controller.js` | **Class A** |
| L589 | `const` | `gridMenuCreateFolderBtn` | **Dead DOM handle**: handled in `context-menu-controller.js` | **Class A** |
| L591 | `const` | `gridMenuManageBtn` | **Dead DOM handle**: handled in `context-menu-controller.js` | **Class A** |
| L593 | `const` | `gridMenuPasteBtn` | **Dead DOM handle**: handled in `context-menu-controller.js` | **Class A** |
| L595 | `const` | `gridMenuSortNameBtn` | **Dead DOM handle**: handled in `context-menu-controller.js` | **Class A** |
| L597 | `const` | `ensureMenuMountedToBody` | **Dead wrapper**: never called in `new-tab.js` or elsewhere | **Class A** |
| L610 | `let` | `currentContextItemId` | **Write-only dead variable**: never read anywhere | **Class A** |
| L612 | `let` | `currentContextIsFolder` | **Write-only dead variable**: never read anywhere | **Class A** |
| L614 | `let` | `currentContextSourceTile` | **Write-only dead variable**: never read anywhere | **Class A** |
| L620 | `const` | `quickAddBookmarkBtn` | DOM `#quick-add-bookmark` (used in `quick-actions.js`) | **Class A** |
| L622 | `const` | `quickAddFolderBtn` | DOM `#quick-add-folder` (used in `quick-actions.js`) | **Class A** |
| L624 | `const` | `quickOpenBookmarksBtn` | DOM `#quick-open-bookmarks` (used in `quick-actions.js`) | **Class A** |
| L626 | `const` | `nextWallpaperBtn` | DOM `#dock-next-wallpaper-btn` (used in `dock-navigation.js`) | **Class A** |
| L628 | `const` | `mainSettingsBtn` | DOM `#main-settings-btn` (used in `dock-navigation.js`) | **Class A** |
| L630 | `const` | `appSettingsModal` | DOM `#app-settings-modal` (used in `settings-ui.js`) | **Class A** |
| L632 | `const` | `appSettingsNav` | DOM `#app-settings-nav` (used in `settings-ui.js`) | **Class A** |
| L657 | `let` | `bookmarkMetadata` | In-memory bookmark metadata cache | **Class B** |
| L659 | `let` | `folderMetadata` | In-memory folder metadata cache | **Class B** |
| L661 | `let` | `lastUsedBookmarkFolderId` | In-memory last-used folder ID | **Class B** |
| L1503 | `const` | `searchForm` | DOM `#search-form` (checked only in startup guard L1809) | **Class B** |
| L1504 | `const` | `searchInput` | DOM `#search-input` (checked only in startup guard L1809) | **Class B** |
| L1505 | `const` | `searchSelect` | DOM `#search-select` (checked only in startup guard L1809) | **Class B** |

---

## 5. Dead / Unreferenced DOM Handles & Compatibility Wrappers

### 5.1 Dead Context Menu DOM Handles (Lines 571–595)
The following 11 DOM variables are declared at lines 571–595:
```javascript
const folderContextMenu = document.getElementById('bookmark-folder-menu');
const menuEditBtn = document.getElementById('menu-edit-btn');
const menuDeleteBtn = document.getElementById('menu-delete-btn');
const gridFolderMenu = document.getElementById('bookmark-grid-folder-menu');
const iconContextMenu = document.getElementById('bookmark-icon-menu');
const gridBlankMenu = document.getElementById('bookmark-grid-blank-menu');
const gridMenuCreateBookmarkBtn = document.getElementById('grid-menu-create-bookmark');
const gridMenuCreateFolderBtn = document.getElementById('grid-menu-create-folder');
const gridMenuManageBtn = document.getElementById('grid-menu-manage');
const gridMenuPasteBtn = document.getElementById('grid-menu-paste');
const gridMenuSortNameBtn = document.getElementById('grid-menu-sort-name');
```
**Audit Finding**:
1. In `src/new-tab.js`, none of these 11 DOM handles are referenced anywhere else.
2. In `src/newtab/core/context-menu-controller.js` (lines 349–387), `context-menu-controller.js` queries its own elements via `document.getElementById` and sets up event listeners autonomously.
3. In `src/newtab/bookmarks/bookmark-grid-controller.js` (lines 1504–1514), fallback resolution to `document.getElementById('bookmark-folder-menu')`, `document.getElementById('menu-edit-btn')`, and `document.getElementById('menu-delete-btn')` already exists.
4. `gridBlankMenu` is referenced in `quick-actions.js` (L13), which can resolve via `document.getElementById('bookmark-grid-blank-menu')`.

### 5.2 Dead Context Menu Forwarders (Lines 597–605 & Lines 1930–1940)
```javascript
// L597-605:
const ensureMenuMountedToBody = (menuEl) => {
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.ensureMenuMountedToBody === 'function') {
    return window.HomebaseContextMenuController.ensureMenuMountedToBody(menuEl);
  }
  if (!menuEl || !(menuEl instanceof HTMLElement)) return;
  if (menuEl.parentElement !== document.body) {
    document.body.appendChild(menuEl);
  }
};

// L1930-1940 (inside initializePage):
const hideAllContextMenus = () => {
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.hide === 'function') {
    return window.HomebaseContextMenuController.hide();
  }
};

const positionContextMenuInViewport = (menuEl, clientX, clientY, opts = {}) => {
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.reposition === 'function') {
    return window.HomebaseContextMenuController.reposition(menuEl, clientX, clientY, opts);
  }
};
```
**Audit Finding**:
- `ensureMenuMountedToBody` is NEVER invoked anywhere in `src/new-tab.js` or across the repository. `window.HomebaseContextMenuController.ensureMenuMountedToBody` is already exposed and called internally by `context-menu-controller.js`.
- `hideAllContextMenus` and `positionContextMenuInViewport` are scoped locally inside `initializePage()` and are **never called** by any code in `initializePage()` or elsewhere. They are pure dead weight.

### 5.3 Write-Only Context State (Lines 610–614 & Lines 1963–1967)
```javascript
// L610-614:
let currentContextItemId = null;
let currentContextIsFolder = false;
let currentContextSourceTile = null;

// L1963-1967 (inside initializePage HomebaseContextMenuController.initialize):
onContextChanged: (data) => {
  currentContextItemId = data.itemId;
  currentContextIsFolder = data.isFolder;
  currentContextSourceTile = data.sourceTile;
}
```
**Audit Finding**:
- `currentContextItemId`, `currentContextIsFolder`, and `currentContextSourceTile` are assigned in `onContextChanged`, but are **never read** anywhere in the entire codebase. `HomebaseContextMenuController` tracks its own active context internally via `_contextData`.

### 5.4 Dead State Variables
- `let suggestionAbortController = null;` (L521): completely unused in `new-tab.js`. `search-interaction-controller.js` has its own internal `let suggestionAbortController = null;`.
- `let sortableTimeout = null;` (L564): never assigned in `new-tab.js`.

---

## 6. Duplicated Ownership with Existing Controllers

| Logic in `src/new-tab.js` | Existing Controller Owner | Redundancy Status |
|---|---|---|
| Context menu positioning, mounting, hiding, and DOM references (L570–605, L1930–1940) | `src/newtab/core/context-menu-controller.js` (`HomebaseContextMenuController`) | 100% duplicate / dead forwarders |
| Bookmark icon picker dialog invocation (L356–373) | `src/newtab/bookmarks/bookmark-editor-adapter.js` & `src/newtab/core/dialogs.js` | Orphaned bridge used only by bookmark editor |
| Widget reveal class toggling (L375–385) | `src/newtab/widgets/widget-visibility.js` | Misplaced widget utility |
| Folder picker modal DOM references (L37–51) | `src/newtab/bookmarks/folder-picker.js` | Residual global bindings from previous extraction |
| Bookmark metadata storage access (`loadBookmarkMetadata`, `loadFolderMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, L1362–1400) | `src/newtab/bookmarks/bookmark-storage.js` (`HomebaseBookmarkStorage`) | Thin pass-through forwarders |
| Search form elements & check guard (L1503–1505, L1809) | `src/newtab/search/search-interaction-controller.js` (`HomebaseSearchInteractionController`) | Residual DOM handles |

---

## 7. Candidate Extraction Table & Classification

| Candidate ID | Name / Scope | Candidate Files / Functions | Estimated Line Reduction | Risk Category | Classification Rationale |
|---|---|---|---|---|---|
| **Candidate 1** | **Context Menu Forwarder & Dead Handle Cleanup** | `ensureMenuMountedToBody`, `hideAllContextMenus`, `positionContextMenuInViewport`, 11 context menu DOM handles, and 3 write-only variables | **~50 lines** | **Class A (Safe)** | Non-breaking cleanup; `HomebaseContextMenuController` fully owns all context menu interactions. Zero behavior changes. |
| **Candidate 2** | **Standalone Dialog & Widget Utility Extraction** | `revealWidget` (-> `widget-visibility.js`), `openBookmarkIconPicker` (-> `bookmark-editor-adapter.js` or `dialogs.js`) | **~35 lines** | **Class A (Safe)** | Self-contained functions with well-defined consumers; preserves `window` compatibility aliases. |
| **Candidate 3** | **Folder Picker DOM Handle Encapsulation** | `folderPickerModal`, `folderPickerPanel`, `folderPickerSearchInput`, `folderPickerList`, `folderPickerBreadcrumb`, `folderPickerConfirmBtn`, `folderPickerCancelBtn`, `folderPickerError` | **~20 lines** | **Class A (Safe)** | Encapsulate DOM handle resolution into `src/newtab/bookmarks/folder-picker.js` where they are consumed. |
| **Candidate 4** | **Bookmark Metadata Storage Bridge Migration** | `loadBookmarkMetadata`, `loadFolderMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`, and metadata variables (`bookmarkMetadata`, `folderMetadata`, `lastUsedBookmarkFolderId`) | **~50 lines** | **Class B (Medium Risk)** | Interacts with `browser.storage.onChanged` listener (L2099–2123) and `initializePage` startup promises (L1577–1607). Requires maintaining backward compatibility on `window`. |
| **Candidate 5** | **Bookmark Tree & Loading Coordinator Extraction** | `processBookmarks`, `loadBookmarks` (-> `src/newtab/bookmarks/bookmark-loader.js`) | **~105 lines** | **Class B (Medium-High Risk)** | High-risk area under AGENTS.md. Coordinates `HomebaseBookmarkRootController`, `HomebaseBookmarkGridController`, and `bookmark-tabs-scroll.js`. |
| **Protected Subsystems** | **Sortable.js Drag/Drop, Idle Scheduler, Startup Orchestration, Wallpaper** | 8 Sortable functions, 3 Idle functions, `primeWallpaperBackground`, `initializePage`, storage listeners, lifecycle listeners | **N/A** | **Class C (Must Remain in `new-tab.js`)** | Explicitly protected under AGENTS.md and user guidelines. Must NOT be moved. |

---

## 8. Subsystem Deep-Dive & Risk Assessment

### 8.1 Idle Task Scheduler (Class C - Protected)
- Functions: `processIdleTasks` (L91), `scheduleIdleTask` (L216), `scheduleIdleChunkedTask` (L262).
- State: `runWhenIdle`, `IDLE_TASK_BUDGET_MS`, `idleTaskQueue`, `idleTaskLabels`, `idleTaskScheduled`, `STARTUP_IDLE_LABELS`.
- **Assessment**: The idle scheduler coordinates critical startup pacing, widget hydration scheduling, and budget enforcement. It must remain in `src/new-tab.js` as specified by AGENTS.md.

### 8.2 Sortable.js Drag & Drop Pipeline (Class C - Protected)
- Functions: `setupGridSortable` (L689), `handleGridMove` (L785), `handleGridDragPointerMove` (L885), `clearTabDropHighlight` (L957), `moveItemInLocalTree` (L977), `handleGridDrop` (L994), `setupTabsSortable` (L1134), `handleTabDrop` (L1222).
- State: `gridSortable`, `tabsSortable`, `isGridDragging`, `isTabDragging`, `activeTabDropTarget`, `folderHoverTarget`, `folderHoverStart`, `lastGridDragOverItem`, `FOLDER_HOVER_DELAY_MS`, `dragMoveScheduled`, `lastDragX`, `lastDragY`.
- **Assessment**: Complex DOM mutation and pointer reordering logic tightly coupled with Sortable.js callbacks and virtualized grid updates. Explicitly marked as high-risk in AGENTS.md. Must remain in `src/new-tab.js`.

### 8.3 Wallpaper Lifecycle (Class C - Protected)
- Function: `primeWallpaperBackground` (L389).
- **Assessment**: Early visual priming path for new-tab instant load. Protected under AGENTS.md.

### 8.4 Startup Orchestration & Page Initialization (Class C - Protected)
- Functions: `logInitSettled` (L1547), `initializePage` (L1562–L2062).
- Listeners: `browser.storage.onChanged` (L2066–L2131), `DOMContentLoaded` (L2134–L2143), `load` (L2145–L2150).
- **Assessment**: Orchestrates parallel promise startup, widget timing, and storage listener dispatching. Explicitly protected under AGENTS.md.

### 8.5 Bookmark Loading Pipeline (Class B - Medium Risk)
- Functions: `processBookmarks` (L1344), `loadBookmarks` (L1412).
- State: `allBookmarks`, `rootDisplayFolderId`, `bookmarkFolderTabsContainer`.
- **Assessment**: Interfaces directly with Chrome/Firefox bookmark permissions, root folder resolution, and UI boot classes. Extraction requires rigorous testing of edge cases (e.g. empty tree, permissions missing, root changes).

---

## 9. Recommended Next Checkpoint Target

### **Recommended: Checkpoint 12-A — Context Menu Forwarder & Stale DOM Handle Cleanup (Candidate 1)**

**Target Scope**:
1. Remove 11 dead context menu DOM constants (`folderContextMenu`, `menuEditBtn`, `menuDeleteBtn`, `gridFolderMenu`, `iconContextMenu`, `gridBlankMenu`, `gridMenuCreateBookmarkBtn`, `gridMenuCreateFolderBtn`, `gridMenuManageBtn`, `gridMenuPasteBtn`, `gridMenuSortNameBtn`) from `src/new-tab.js` (lines 570–595).
2. Remove dead forwarder `ensureMenuMountedToBody` from `src/new-tab.js` (lines 597–605).
3. Remove dead write-only context variables `currentContextItemId`, `currentContextIsFolder`, `currentContextSourceTile` from `src/new-tab.js` (lines 610–614) and their unused assignments in `initializePage` (lines 1963–1967).
4. Remove dead local forwarders `hideAllContextMenus` and `positionContextMenuInViewport` from `src/new-tab.js` (lines 1930–1940).
5. Remove unused dead variables `let suggestionAbortController = null;` (line 521) and `let sortableTimeout = null;` (line 564).
6. Verify `quick-actions.js` fallback resolution for `gridBlankMenu`.

**Expected Line Reduction**: **~55 lines** (bringing `src/new-tab.js` to ~2,112 lines).  
**Risk Level**: **Class A (Safe)** — Zero disruption to startup orchestration, bookmark rendering, Sortable drag/drop, or wallpaper lifecycle.

---

## 10. Audit Sign-off

- [x] Line count verified: exactly 2,167 lines.
- [x] All 23 top-level functions cataloged and classified.
- [x] All 76 top-level variables/constants cataloged and classified.
- [x] Stale/dead DOM handles and compatibility forwarders identified.
- [x] Protected subsystems (Sortable drag/drop, idle scheduler, startup orchestration, wallpaper) preserved and quarantined.
- [x] Next target (Checkpoint 12-A) scoped with zero behavioral risk.
- [x] STOP executed. No code changes, no commit, no push.
