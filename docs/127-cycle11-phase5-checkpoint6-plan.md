# Checkpoint 6 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 6 — Bookmark Action Controller Extraction  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Audit Reference**: [`docs/126-cycle11-phase5-next-checkpoint-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/126-cycle11-phase5-next-checkpoint-audit.md)  
**Target Source**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Goal

Extract user-initiated bookmark and folder actions (creation, deletion, clipboard paste, alphabetical sorting, URL smart naming, and tab/context actions) from the monolith:  
[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

into a dedicated controller module:  
[`src/newtab/bookmarks/bookmark-action-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-action-controller.js).

---

## 2. Current Ownership in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), user action handlers and their supporting helper routines currently occupy ~380 lines across multiple disconnected sections:

| Function / Block | Current Lines | Lines Count | Responsibility |
|---|:---:|:---:|---|
| `deleteBookmarkOrFolder(id, isFolder, sourceTileEl)` | 1601–1729 | 129 lines | Resolves target node and favicon, triggers confirmation modal (`showDeleteConfirm`), executes `remove`/`removeTree`, and coordinates grid refresh. |
| `createNewBookmarkFolder(name)` | 1921–1965 | 45 lines | Verifies root ID, calls `browser.bookmarks.create`, refreshes tree, and reloads tabs/grid. |
| `getSmartNameFromUrl(url)` | 1972–1983 | 12 lines | Extracts clean capitalized hostname base from URLs (e.g., `https://github.com/repo` -> `Github`). |
| `handlePasteBookmark()` | 1988–2031 | 44 lines | Reads clipboard text, validates URL, extracts smart title, creates bookmark under current folder, and refreshes grid. |
| `isBookmarkFolderNode(node)` | 2036–2038 | 3 lines | Distinguishes folder nodes from bookmark leaf nodes. |
| `compareBookmarkNodeTitles(a, b)` | 2040–2044 | 5 lines | Natural-sort string comparator (`localeCompare` with `numeric: true`). |
| `sortCurrentFolderByName()` | 2046–2074 | 29 lines | Partitions children into folders and bookmarks, sorts each group alphabetically, re-indexes via `browser.bookmarks.move`, and refreshes grid. |
| `deleteBookmarkFolder(folderId)` | 2081–2095 | 15 lines | Direct folder subtree deletion via `browser.bookmarks.removeTree` and tab reload. |
| Document `paste` event listener | 3001–3009 | 9 lines | Intercepts keyboard paste events outside text inputs to trigger `handlePasteBookmark()`. |
| `openBookmarkInNewTab(bookmarkId)` | 3128–3144 | 17 lines | Validates URL and opens background tab via `browser.tabs.create`. |
| `openFolderFromContext(folderId)` | 3146–3162 | 17 lines | Validates folder node and triggers grid navigation. |

---

## 3. Exact Functions to Extract

The following functions will be extracted into the new controller module:

1. `deleteBookmarkOrFolder(id, isFolder, sourceTileEl = null)`
2. `deleteBookmarkFolder(folderId)`
3. `createNewBookmarkFolder(name)`
4. `getSmartNameFromUrl(url)`
5. `handlePasteBookmark()`
6. `isBookmarkFolderNode(node)`
7. `compareBookmarkNodeTitles(a, b)`
8. `sortCurrentFolderByName()`
9. `openBookmarkInNewTab(bookmarkId)`
10. `openFolderFromContext(folderId)`
11. `setupPasteListener()` (extracted wrapper for document paste event handling)

---

## 4. New Module Specification

### Destination Path
`src/newtab/bookmarks/bookmark-action-controller.js`

### Implementation Architecture
```javascript
// =============================================================================
// Homebase Bookmark Action Controller
// Module: src/newtab/bookmarks/bookmark-action-controller.js
// Handles user-initiated bookmark actions: creation, deletion, clipboard paste,
// alphabetical sorting, and context navigation.
// =============================================================================

let isPasteListenerBound = false;

// Delegate hooks (initialized via configure() or dynamically resolved)
let actionDelegates = {
  getBookmarkTree: () => (typeof window !== 'undefined' && window.bookmarkTree ? window.bookmarkTree : null),
  findBookmarkNodeById: (root, id) => (typeof window !== 'undefined' && typeof window.findBookmarkNodeById === 'function' ? window.findBookmarkNodeById(root, id) : null),
  getRootDisplayFolderId: () => (typeof window !== 'undefined' && typeof window.rootDisplayFolderId !== 'undefined' ? window.rootDisplayFolderId : null),
  getActiveFolderId: () => (typeof window !== 'undefined' && typeof window.activeHomebaseFolderId !== 'undefined' ? window.activeHomebaseFolderId : null),
  getCurrentGridNode: () => (typeof window !== 'undefined' && typeof window.currentGridFolderNode !== 'undefined' ? window.currentGridFolderNode : null),
  renderBookmarkGrid: (node) => (typeof window !== 'undefined' && typeof window.renderBookmarkGrid === 'function' ? window.renderBookmarkGrid(node) : undefined),
  loadBookmarks: (folderId) => (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function' ? window.loadBookmarks(folderId) : undefined),
  showDeleteConfirm: (event, opts) => (typeof window !== 'undefined' && typeof window.showDeleteConfirm === 'function' ? window.showDeleteConfirm(event, opts) : Promise.resolve(false)),
  showCustomAlert: (msg) => (typeof window !== 'undefined' && typeof window.showCustomAlert === 'function' ? window.showCustomAlert(msg) : alert(msg)),
  getFaviconUrlForRawUrl: (url) => (typeof window !== 'undefined' && typeof window.getFaviconUrlForRawUrl === 'function' ? window.getFaviconUrlForRawUrl(url) : null),
  processBookmarks: (nodes, activeFolderId, rootNode) => (typeof window !== 'undefined' && typeof window.processBookmarks === 'function' ? window.processBookmarks(nodes, activeFolderId, rootNode) : undefined)
};

function configureBookmarkActionController(delegates = {}) {
  actionDelegates = Object.assign(actionDelegates, delegates);
}
```

---

## 5. Detailed Responsibilities

### 5.1 Delete Bookmark or Folder (`deleteBookmarkOrFolder`)
- Resolves node via `findBookmarkNodeById`.
- Resolves favicon for bookmark leaf nodes.
- Prompts user confirmation via `showDeleteConfirm` (modal dialog from `bookmark-editor-adapter.js`).
- Executes deletion via `browser.bookmarks.remove(id)` or `browser.bookmarks.removeTree(id)`.
- Updates `bookmarkTree` via `getBookmarkTree(true)`.
- Re-renders active grid node if present, or falls back to `loadBookmarks(activeHomebaseFolderId)`.

### 5.2 Create Folder Flow (`createNewBookmarkFolder`)
- Verifies active root folder ID (`rootDisplayFolderId`).
- Creates folder via `browser.bookmarks.create({ parentId, title })`.
- Refreshes tree and executes `processBookmarks` or `loadBookmarks(newFolderNode.id)` to focus the newly created folder tab.

### 5.3 Paste Bookmark Flow (`handlePasteBookmark`)
- Intercepts clipboard text via `navigator.clipboard.readText()`.
- Validates URL syntax (`://`, `www.`, `.`).
- Auto-prepends `https://` if protocol is omitted.
- Generates smart title via `getSmartNameFromUrl`.
- Resolves target parent folder ID (`currentGridFolderNode.id` or `activeHomebaseFolderId`).
- Creates bookmark via `browser.bookmarks.create`.
- Refreshes tree and re-renders active grid.
- Catches errors and displays friendly notice (`showCustomAlert`).

### 5.4 Smart URL Naming (`getSmartNameFromUrl`)
- Parses URL hostname.
- Strips `www.`.
- Capitalizes base domain name (e.g. `google.com` -> `Google`, `github.com` -> `Github`).
- Falls back to `'New Bookmark'`.

### 5.5 Alphabetical Sorting (`sortCurrentFolderByName`)
- Identifies target folder ID.
- Fetches fresh tree and extracts folder children.
- Segregates children into folders and bookmarks using `isBookmarkFolderNode`.
- Sorts each sub-list using `compareBookmarkNodeTitles`.
- Merges into: `[...sortedFolders, ...sortedBookmarks]`.
- Re-indexes bookmarks using `browser.bookmarks.move(child.id, { index: i })`.
- Re-renders grid with updated order.

### 5.6 Context Actions
- `openBookmarkInNewTab(bookmarkId)`: Resolves node URL and calls `browser.tabs.create({ url, active: false })`.
- `openFolderFromContext(folderId)`: Resolves folder node and calls `renderBookmarkGrid(folderNode)`.

### 5.7 Paste Event Listener (`setupPasteListener`)
- Attaches to `document` on `paste`.
- Guards against typing inside `INPUT`, `TEXTAREA`, or `contentEditable` elements.
- Prevents default and dispatches `handlePasteBookmark()`.
- Idempotency guarded by `isPasteListenerBound`.

---

## 6. Compatibility Bridges & Global Exports

### Public API Export
```javascript
window.HomebaseBookmarkActionController = {
  configure: configureBookmarkActionController,
  deleteBookmarkOrFolder,
  deleteBookmarkFolder,
  createNewBookmarkFolder,
  handlePasteBookmark,
  getSmartNameFromUrl,
  isBookmarkFolderNode,
  compareBookmarkNodeTitles,
  sortCurrentFolderByName,
  openBookmarkInNewTab,
  openFolderFromContext,
  setupPasteListener,
  isPasteListenerBound: () => isPasteListenerBound
};
```

### Global Backward-Compatibility Bridges on `window`
To avoid regressions in existing consumers (`context-menu-controller.js`, `createFolderTabs`, `setupQuickActions`):
- `window.deleteBookmarkOrFolder = deleteBookmarkOrFolder;`
- `window.deleteBookmarkFolder = deleteBookmarkFolder;`
- `window.createNewBookmarkFolder = createNewBookmarkFolder;`
- `window.handlePasteBookmark = handlePasteBookmark;`
- `window.getSmartNameFromUrl = getSmartNameFromUrl;`
- `window.isBookmarkFolderNode = isBookmarkFolderNode;`
- `window.compareBookmarkNodeTitles = compareBookmarkNodeTitles;`
- `window.sortCurrentFolderByName = sortCurrentFolderByName;`
- `window.openBookmarkInNewTab = openBookmarkInNewTab;`
- `window.openFolderFromContext = openFolderFromContext;`

---

## 7. Dependency Mapping & Integration with Existing Modules

```text
bookmark-editor-adapter.js (showDeleteConfirm)
         ↓
bookmark-root-controller.js (root display folder)
         ↓
bookmark-action-controller.js (NEW)
         ↓
context-menu-controller.js (invokes paste, sort, delete, open actions)
         ↓
new-tab.js (startup orchestration & paste listener bootstrap)
```

1. **`bookmark-editor-adapter.js`**:
   `deleteBookmarkOrFolder` invokes `showDeleteConfirm(null, options)`.
2. **`bookmark-root-controller.js`**:
   Provides `rootDisplayFolderId` used by `createNewBookmarkFolder`.
3. **`context-menu-controller.js`**:
   Wires right-click context menu items (`grid-menu-paste`, `grid-menu-sort-name`, `menu-delete-btn`) to action functions.
4. **`bookmark-grid-controller.js`**:
   Supplies `renderBookmarkGrid` called after paste, sort, and delete.
5. **`dialog-controller.js`**:
   Supplies `showCustomAlert` called on paste error.

---

## 8. Protected Areas (DO NOT TOUCH)

In strict accordance with [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **Do NOT touch Sortable.js drag and drop**: `setupGridSortable`, `handleGridMove`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`.
- **Do NOT touch startup orchestration**: `initializePage()`, `scheduleStartupHydrationTasks()`, `markPageReadyOnce()`.
- **Do NOT touch idle scheduler**: `processIdleTasks()`, `scheduleIdleTask()`, `scheduleIdleChunkedTask()`.
- **Do NOT touch wallpaper lifecycle**: `primeWallpaperBackground()`, `waitForWallpaperReady()`, `applyWallpaperByType()`.
- **Do NOT touch protected files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`.

---

## 9. Migration Execution Phases

### Phase A: Create New Controller Module
- Create `src/newtab/bookmarks/bookmark-action-controller.js`.
- Implement all 11 action functions, delegation hooks, public controller object, and global bridges.

### Phase B: Register Script in HTML
- Update `src/new-tab.html`.
- Add `<script src="newtab/bookmarks/bookmark-action-controller.js" defer></script>` immediately following `bookmark-root-controller.js`.

### Phase C: Update Static Safety Scanner
- Update `scripts/check-newtab-static.mjs`.
- Add `'newtab/bookmarks/bookmark-action-controller.js'` to `keyExtractedModulePaths`.

### Phase D: Remove Extracted Logic from `src/new-tab.js`
- Remove lines 1601–1729 (`deleteBookmarkOrFolder`).
- Remove lines 1921–1965 (`createNewBookmarkFolder`).
- Remove lines 1972–2074 (`getSmartNameFromUrl`, `handlePasteBookmark`, `isBookmarkFolderNode`, `compareBookmarkNodeTitles`, `sortCurrentFolderByName`).
- Remove lines 2081–2095 (`deleteBookmarkFolder`).
- Remove document paste listener from lines 3001–3009, replace with `HomebaseBookmarkActionController.setupPasteListener()`.
- Remove lines 3128–3162 (`openBookmarkInNewTab`, `openFolderFromContext`).
- In `initializePage()`, initialize `HomebaseBookmarkActionController.setupPasteListener()`.

### Phase E: Verification
- Execute full automated validation pipeline.

---

## 10. Verification Plan

1. **Syntax Validation**:
   ```powershell
   node --check src/new-tab.js
   node --check src/newtab/bookmarks/bookmark-action-controller.js
   ```
2. **Static Invariant Scanner**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
   - Verify 0 duplicate declarations, script tag present, and new module in `keyExtractedModulePaths`.
3. **Browser Smoke Test**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
4. **Unit Test Suite**:
   ```powershell
   npm.cmd test
   ```
   - All 343 unit tests must pass.
5. **Extension Build**:
   ```powershell
   npm.cmd run build
   ```
   - Chrome and Firefox extension packages must compile cleanly.
6. **Real-Browser CDP Verification**:
   - Create `verify-cycle11-phase5-cp6-browser.mjs` in the artifact scratch directory.
   - Verify:
     1. `HomebaseBookmarkActionController` object is available and populated on `window`.
     2. Backward compatibility functions exist on `window`.
     3. `getSmartNameFromUrl` parses URLs accurately.
     4. `compareBookmarkNodeTitles` and `isBookmarkFolderNode` correctly sort mixed lists.
     5. `sortCurrentFolderByName` reorders items and invokes `browser.bookmarks.move`.
     6. `createNewBookmarkFolder` invokes `browser.bookmarks.create`.
     7. `deleteBookmarkOrFolder` flow invokes confirmation and `browser.bookmarks.remove/removeTree`.
     8. Document paste listener is bound and handles paste simulation.
     9. Context navigation helpers (`openBookmarkInNewTab`, `openFolderFromContext`) work.
     10. Zero console errors or runtime exceptions.

---

## 11. Expected Outcome

- **`src/new-tab.js` line count**: Reduced from 3,162 lines to **~2,880 lines** (**~280 lines net reduction**).
- **Cumulative Phase 5 reduction**: Exceeds **-950 net lines** (down from 3,833 lines at Phase 5 start).
- **Subsystem encapsulation**: All user bookmark actions decoupled from `new-tab.js` into an isolated, testable controller module.

---

## 12. Next Step

Stop and wait for owner review and approval of this plan before modifying any code.
