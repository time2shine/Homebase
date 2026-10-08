# Checkpoint 3 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Checkpoint**: Checkpoint 3 — Bookmark Editor Adapter Extraction  
**Date**: October 2, 2026  
**Status**: Ready for Review  

---

## Current Ownership

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), lines 921–1039 (~118 lines) are dedicated to the lazy loading and modal routing of the bookmark editor:

1. **Lazy Loading Runtime** (Lines 925–936):
   - `ensureBookmarkEditor()` loads `assets/js/bookmark-editor.js` via `loadScriptOnce('assets/js/bookmark-editor.js')`.
   - Validates that `window.HomebaseBookmarkEditor` exists and exposes `openAddBookmark`.
2. **Context Dependency Injection** (Lines 938–986):
   - `createBookmarkEditorContext()` constructs a context object containing 30+ getters and helper functions (tree accessors, icon renderers, DOM helpers, and storage bridges) required by the lazy-loaded editor.
3. **Error Reporting & Dispatch Wrapper** (Lines 988–1014):
   - `notifyBookmarkEditorLoadFailure(err)` displays a user alert via `showCustomAlert()` or `alert()`.
   - `callBookmarkEditorMethod(methodName, payload, fallbackValue)` wraps `ensureBookmarkEditor()` and injects the context into each editor call with robust try/catch handling.
4. **Modal Opening Bridges** (Lines 1016–1039):
   - `showAddBookmarkModal()`: Routes to `openAddBookmark`.
   - `showEditBookmarkModal(bookmarkId)`: Routes to `openEditBookmark`.
   - `showAddFolderModal()`: Routes to `openAddFolder`.
   - `showEditFolderModal(folderNode)`: Routes to `openEditFolder`.
   - `openMoveBookmarkModal(itemId, isFolder)`: Routes to `openMoveDialog`.
   - `showDeleteConfirm(message, options)`: Routes to `openDeleteDialog`.

---

## New Module Design

### Destination: `src/newtab/bookmarks/bookmark-editor-adapter.js`

The new module will be responsible for:
1. **Script Lazy-Loading**:
   - `ensureBookmarkEditor()` with in-flight promise caching and failure recovery.
2. **Context Factory**:
   - `createBookmarkEditorContext()` with defensive null/fallback handling for all context getters and callbacks.
3. **Dispatch Wrapper**:
   - `callBookmarkEditorMethod(methodName, payload, fallbackValue)` and `notifyBookmarkEditorLoadFailure(err)`.
4. **Modal Action Bridges**:
   - `showAddBookmarkModal()`, `showEditBookmarkModal()`, `showAddFolderModal()`, `showEditFolderModal()`, `openMoveBookmarkModal()`, and `showDeleteConfirm()`.
5. **Controller & Compatibility APIs**:
   - `window.HomebaseBookmarkEditorAdapter` object interface.
   - Global legacy function bindings for callers expecting top-level declarations.

---

## Dependency Analysis

### 1. Script Loading Order in `src/new-tab.html`
- Line 3328: `newtab/core/utils.js` (provides `loadScriptOnce`)
- Line 3352: `newtab/core/favicon-pipeline.js` (provides `getFaviconUrlForRawUrl`, `getDomainKeyFromUrl`)
- Line 3354: `newtab/bookmarks/bookmark-grid-controller.js` (provides `getCurrentGridFolderNode`)
- Line 3357: `newtab/core/host-storage-adapter.js` (provides `createBookmarkEditorStorageBridge`)
- **Line 3358 (Planned)**: `<script src="newtab/bookmarks/bookmark-editor-adapter.js" defer></script>`
- Line 3401: `new-tab.js` (Final application runtime)

### 2. Upstream Dependencies
- `loadScriptOnce('assets/js/bookmark-editor.js')`: Loads vendor/bundle script on demand.
- Context injection functions:
  - Bookmark tree operations: `findBookmarkNodeById`, `updateNodeInTree`, `appendNodeToParent`, `getDefaultBookmarkParentId`.
  - Grid & rendering: `renderBookmarkGrid`, `loadBookmarks`, `findRenderedGridItemById`, `updateElementData`.
  - Icon rendering: `renderFolderIconInto`, `renderBookmarkIconInto`, `getIconKeyForNode`, `createSvgIconElement`.
  - Storage: `createBookmarkEditorStorageBridge()`, `setLastUsedFolderId`.

### 3. Downstream Callers
- **`src/newtab/core/context-menu-controller.js`**:
  - Calls `showEditFolderModal`, `showEditBookmarkModal`, `openMoveBookmarkModal`, `showAddBookmarkModal`, `showAddFolderModal`.
- **`src/newtab/bookmarks/quick-actions.js`**:
  - `quickAddBookmarkBtn` click -> `showAddBookmarkModal`.
  - `quickAddFolderBtn` click -> `showAddFolderModal`.
- **`src/newtab/core/dialog-controller.js`**:
  - Calls `showDeleteConfirm(message, options)`.
- **`src/newtab/bookmarks/bookmark-grid-controller.js`**:
  - Calls `showDeleteConfirm(message, options)`.
- **`src/new-tab.js`**:
  - Context menu initialization (lines 3387–3393).
  - Tab strip deletion confirmation (line 2522).
  - Single item delete fallback (line 2026).

---

## Migration Steps

### Phase A: Create Adapter Module
Create [`src/newtab/bookmarks/bookmark-editor-adapter.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js):
```javascript
// Bookmark Editor Adapter
// Manages lazy-loading of assets/js/bookmark-editor.js, context construction,
// and modal routing for add, edit, move, and delete dialogs.

let bookmarkEditorPromise = null;

async function ensureBookmarkEditor() {
  if (window.HomebaseBookmarkEditor && typeof window.HomebaseBookmarkEditor.openAddBookmark === 'function') {
    return window.HomebaseBookmarkEditor;
  }

  if (bookmarkEditorPromise) {
    return bookmarkEditorPromise;
  }

  bookmarkEditorPromise = (async () => {
    try {
      if (typeof loadScriptOnce === 'function') {
        await loadScriptOnce('assets/js/bookmark-editor.js');
      } else if (typeof window !== 'undefined' && typeof window.loadScriptOnce === 'function') {
        await window.loadScriptOnce('assets/js/bookmark-editor.js');
      } else {
        throw new Error('loadScriptOnce helper is unavailable');
      }

      if (
        !window.HomebaseBookmarkEditor ||
        typeof window.HomebaseBookmarkEditor.openAddBookmark !== 'function'
      ) {
        throw new Error('HomebaseBookmarkEditor failed to load');
      }

      return window.HomebaseBookmarkEditor;
    } finally {
      bookmarkEditorPromise = null;
    }
  })();

  return bookmarkEditorPromise;
}

function createBookmarkEditorContext() {
  return {
    getActiveHomebaseFolderId: () => (typeof activeHomebaseFolderId !== 'undefined' ? activeHomebaseFolderId : null),
    getRootDisplayFolderId: () => (typeof rootDisplayFolderId !== 'undefined' ? rootDisplayFolderId : null),
    getCurrentGridFolderNode: () => {
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
        return window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
      }
      return typeof currentGridFolderNode !== 'undefined' ? currentGridFolderNode : null;
    },
    getBookmarkTreeState: () => (typeof bookmarkTree !== 'undefined' ? bookmarkTree : null),
    getBookmarkMetadata: () => (typeof bookmarkMetadata !== 'undefined' ? bookmarkMetadata : {}),
    setBookmarkMetadata: (metadata) => { if (typeof bookmarkMetadata !== 'undefined') bookmarkMetadata = metadata || {}; },
    getFolderMetadata: () => (typeof folderMetadata !== 'undefined' ? folderMetadata : {}),
    setFolderMetadata: (metadata) => { if (typeof folderMetadata !== 'undefined') folderMetadata = metadata || {}; },
    isVirtualizerEnabled: () => Boolean(typeof virtualizerState !== 'undefined' && virtualizerState && virtualizerState.isEnabled),
    getBookmarkFolderColorPreference: () => (typeof appBookmarkFolderColorPreference !== 'undefined' ? appBookmarkFolderColorPreference : '#FFFFFF'),
    getBookmarkFallbackColorPreference: () => (typeof appBookmarkFallbackColorPreference !== 'undefined' ? appBookmarkFallbackColorPreference : '#00b8d4'),
    iconCategories: typeof ICON_CATEGORIES !== 'undefined' ? ICON_CATEGORIES : null,
    findBookmarkNodeById: (root, id) => (typeof findBookmarkNodeById === 'function' ? findBookmarkNodeById(root, id) : null),
    updateNodeInTree: (...args) => (typeof updateNodeInTree === 'function' ? updateNodeInTree(...args) : undefined),
    appendNodeToParent: (...args) => (typeof appendNodeToParent === 'function' ? appendNodeToParent(...args) : undefined),
    getDefaultBookmarkParentId: () => (typeof getDefaultBookmarkParentId === 'function' ? getDefaultBookmarkParentId() : null),
    getBookmarkTree: () => (typeof getBookmarkTree === 'function' ? getBookmarkTree() : Promise.resolve([])),
    renderBookmarkGrid: (...args) => (typeof renderBookmarkGrid === 'function' ? renderBookmarkGrid(...args) : undefined),
    loadBookmarks: (...args) => (typeof loadBookmarks === 'function' ? loadBookmarks(...args) : Promise.resolve()),
    findRenderedGridItemById: (...args) => (typeof findRenderedGridItemById === 'function' ? findRenderedGridItemById(...args) : null),
    updateElementData: (...args) => (typeof updateElementData === 'function' ? updateElementData(...args) : undefined),
    getFaviconUrlForRawUrl: (...args) => (typeof getFaviconUrlForRawUrl === 'function' ? getFaviconUrlForRawUrl(...args) : Promise.resolve('')),
    getDomainKeyFromUrl: (...args) => (typeof getDomainKeyFromUrl === 'function' ? getDomainKeyFromUrl(...args) : ''),
    createSvgIconElement: (...args) => (typeof createSvgIconElement === 'function' ? createSvgIconElement(...args) : null),
    tintSvgElement: (...args) => (typeof tintSvgElement === 'function' ? tintSvgElement(...args) : undefined),
    getComplementaryColor: (...args) => (typeof getComplementaryColor === 'function' ? getComplementaryColor(...args) : '#000000'),
    renderFolderIconInto: (...args) => (typeof renderFolderIconInto === 'function' ? renderFolderIconInto(...args) : undefined),
    renderBookmarkIconInto: (...args) => (typeof renderBookmarkIconInto === 'function' ? renderBookmarkIconInto(...args) : undefined),
    getIconKeyForNode: (...args) => (typeof getIconKeyForNode === 'function' ? getIconKeyForNode(...args) : ''),
    openBookmarkIconPicker: (...args) => (typeof openBookmarkIconPicker === 'function' ? openBookmarkIconPicker(...args) : undefined),
    openModalWithAnimation: (...args) => (typeof openModalWithAnimation === 'function' ? openModalWithAnimation(...args) : undefined),
    closeModalWithAnimation: (...args) => (typeof closeModalWithAnimation === 'function' ? closeModalWithAnimation(...args) : undefined),
    openBookmarkEditorColorPicker: (...args) => (typeof openBookmarkEditorColorPicker === 'function' ? openBookmarkEditorColorPicker(...args) : undefined),
    updateBookmark: (id, changes) => (typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks.update(id, changes) : Promise.resolve()),
    createBookmark: (details) => (typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks.create(details) : Promise.resolve()),
    createFolder: (details) => (typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks.create(details) : Promise.resolve()),
    updateFolder: (id, changes) => (typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks.update(id, changes) : Promise.resolve()),
    moveNode: (id, changes) => (typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks.move(id, changes) : Promise.resolve()),
    ...(typeof createBookmarkEditorStorageBridge === 'function' ? createBookmarkEditorStorageBridge() : {}),
    setLastUsedFolderId: (...args) => (typeof setLastUsedFolderId === 'function' ? setLastUsedFolderId(...args) : undefined)
  };
}

function notifyBookmarkEditorLoadFailure(err) {
  console.warn('Failed to open bookmark editor', err);
  const message = 'Could not open the bookmark editor. Please try again.';
  if (typeof showCustomAlert === 'function') {
    showCustomAlert(message);
  } else {
    alert(message);
  }
}

async function callBookmarkEditorMethod(methodName, payload = {}, fallbackValue = null) {
  try {
    const editor = await ensureBookmarkEditor();
    const method = editor && editor[methodName];
    if (typeof method !== 'function') {
      throw new Error(`HomebaseBookmarkEditor.${methodName} is unavailable`);
    }

    return await method({
      ...payload,
      context: createBookmarkEditorContext()
    });
  } catch (err) {
    notifyBookmarkEditorLoadFailure(err);
    return fallbackValue;
  }
}

function showAddBookmarkModal() {
  return callBookmarkEditorMethod('openAddBookmark');
}

function showEditBookmarkModal(bookmarkId) {
  return callBookmarkEditorMethod('openEditBookmark', { bookmarkId });
}

function showAddFolderModal() {
  return callBookmarkEditorMethod('openAddFolder');
}

function showEditFolderModal(folderNode) {
  return callBookmarkEditorMethod('openEditFolder', { folderNode });
}

function openMoveBookmarkModal(itemId, isFolder) {
  return callBookmarkEditorMethod('openMoveDialog', { itemId, isFolder });
}

function showDeleteConfirm(message, options = {}) {
  return callBookmarkEditorMethod('openDeleteDialog', { ...options, message }, false);
}
```

### Phase B: Add Controller APIs & Global Compatibility Bridges
At the end of `src/newtab/bookmarks/bookmark-editor-adapter.js`:
```javascript
if (typeof window !== 'undefined') {
  window.ensureBookmarkEditor = ensureBookmarkEditor;
  window.createBookmarkEditorContext = createBookmarkEditorContext;
  window.callBookmarkEditorMethod = callBookmarkEditorMethod;
  window.notifyBookmarkEditorLoadFailure = notifyBookmarkEditorLoadFailure;
  window.showAddBookmarkModal = showAddBookmarkModal;
  window.showEditBookmarkModal = showEditBookmarkModal;
  window.showAddFolderModal = showAddFolderModal;
  window.showEditFolderModal = showEditFolderModal;
  window.openMoveBookmarkModal = openMoveBookmarkModal;
  window.showDeleteConfirm = showDeleteConfirm;

  window.HomebaseBookmarkEditorAdapter = {
    ensureBookmarkEditor,
    createBookmarkEditorContext,
    callBookmarkEditorMethod,
    notifyBookmarkEditorLoadFailure,
    showAddBookmarkModal,
    showEditBookmarkModal,
    showAddFolderModal,
    showEditFolderModal,
    openMoveBookmarkModal,
    showDeleteConfirm
  };
}
```

### Phase C: Register Script in `src/new-tab.html` and Static Check
1. Add script tag to `src/new-tab.html` after line 3357:
   ```html
   <script src="newtab/bookmarks/bookmark-editor-adapter.js" defer></script>
   ```
2. Add `"newtab/bookmarks/bookmark-editor-adapter.js"` to `keyExtractedModulePaths` in `scripts/check-newtab-static.mjs`.

### Phase D: Refactor `src/new-tab.js`
Remove lines 921–1039 completely from `src/new-tab.js`.
(Since `bookmark-editor-adapter.js` evaluates before `new-tab.js`, the top-level functions `showAddBookmarkModal`, `showEditBookmarkModal`, `showDeleteConfirm`, etc. are already available in the shared execution environment without needing duplicate declaration wrappers.)

### Phase E: Verification
Execute full static, unit, build, and browser verification passes.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|:---:|---|
| **Editor Lazy-Load Race** | Low | Add in-flight promise caching (`bookmarkEditorPromise`) so concurrent triggers share a single load request. |
| **Context Getter Lookups** | Low | All getters use defensive fallbacks (`typeof x !== 'undefined' ? x : null`) to avoid ReferenceErrors if state is uninitialized. |
| **Script Order / Deferred Execution** | Zero | Script loads before `new-tab.js`; editor actions occur exclusively in response to user gestures after full initialization. |
| **Global Declarations Collision** | Zero | All 10 function definitions are completely removed from `src/new-tab.js` to avoid cross-script collisions. |

---

## Expected Line Impact

| File | Current Lines | Expected Lines | Net Delta |
|---|:---:|:---:|:---:|
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | 3,643 | ~3,525 | **-118 lines** |
| [`src/newtab/bookmarks/bookmark-editor-adapter.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js) | 0 | ~135 | +135 lines |
| [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | 3,405 | 3,406 | +1 line |
| [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | 467 | 468 | +1 line |

---

## Verification Plan

### Automated Commands
```powershell
node --check src/new-tab.js
node --check src/newtab/bookmarks/bookmark-editor-adapter.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```

### Real-Browser CDP Verification Plan
Create `scratch/verify-cycle11-phase5-cp3-browser.mjs` using EdgeCore:
1. Verify `window.HomebaseBookmarkEditorAdapter` exists and exports all 10 methods.
2. Verify global bridge functions (`window.showAddBookmarkModal`, `window.showEditBookmarkModal`, `window.showAddFolderModal`, `window.showEditFolderModal`, `window.openMoveBookmarkModal`, `window.showDeleteConfirm`).
3. Verify `createBookmarkEditorContext()` returns a valid context dictionary containing required methods.
4. Verify lazy-loading invocation (`ensureBookmarkEditor`) handles script loading gracefully.
5. Verify 0 console errors and 0 CDP runtime exceptions during initialization and invocation.

---

## Confirmation

- **No source files modified**
- **No git commits created**
- **No git pushes performed**
- **Waiting for owner approval before proceeding with implementation.**
