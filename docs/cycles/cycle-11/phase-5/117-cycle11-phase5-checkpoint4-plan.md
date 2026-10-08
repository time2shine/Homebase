# Checkpoint 4 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Checkpoint**: Checkpoint 4 — Root Management & Bookmark Observer Extraction  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Audit Reference**: [`docs/116-cycle11-phase5-checkpoint4-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/116-cycle11-phase5-checkpoint4-audit.md)  
**Target Source**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Goal

Extract root folder management, bookmark tree discovery/verification, root UI controls, and browser bookmark event listeners from the monolith:  
[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

into a dedicated controller module:  
[`src/newtab/bookmarks/bookmark-root-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-root-controller.js).

---

## 2. Current Ownership & Code to Move

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), the following functions and code blocks will be moved:

### 2.1 Pure Tree Discovery & Traversal Helpers (Lines 1013–1068, 56 lines)
1. `findChildFolderByTitle(parentNode, titleLower)`
2. `ensureFolder(parentId, title)`
3. `ensureBookmark(parentId, title, url)`
4. `getOtherBookmarksNode(rootChildren = [])`
5. `findHomebaseUnderOtherBookmarks(treeRoot)`

### 2.2 Stored Root Subtree Verification (Lines 1112–1134, 23 lines)
6. `getStoredHomebaseRootSubTree(storedRootId)`

### 2.3 Default Root Creation Workflow (Lines 2477–2515, 39 lines)
7. `createHomebaseFolder()`

### 2.4 UI Control Wiring (Lines 2611–2643, 33 lines)
8. `setupHomebaseRootControls()`

### 2.5 Bookmark Event Observers (Lines 2645–2694, 50 lines)
9. `setupHomebaseRootListeners()`

### 2.6 Redundant DOM Element Declarations in `src/new-tab.js` (Lines 36, 38, 40)
- `const appBookmarksChangeRootBtn = document.getElementById('app-bookmarks-change-root-btn');`
- `const homebaseCreateFolderBtn = document.getElementById('homebase-create-folder-btn');`
- `const homebaseChooseFolderBtn = document.getElementById('homebase-choose-folder-btn');`  
*(These will be queried dynamically inside `setupHomebaseRootControls()` with null guards, eliminating top-level scope clutter and early query hazards).*

---

## 3. New Module Specification

### Destination File
`src/newtab/bookmarks/bookmark-root-controller.js`

### Implementation Architecture
```javascript
// Bookmark Root Controller
// Manages Homebase root folder discovery, creation, subtree verification,
// root UI controls, browser bookmark event observers, and cache invalidation.

let isRootListenersBound = false;
let lastResolvedSubTree = null;

function findChildFolderByTitle(parentNode, titleLower) {
  if (!parentNode || !parentNode.children) return null;
  return parentNode.children.find(
    (child) => child && child.children && (child.title || '').toLowerCase() === titleLower
  ) || null;
}

async function ensureFolder(parentId, title) {
  const titleLower = (title || '').toLowerCase();
  try {
    const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
    if (!api || typeof api.getChildren !== 'function' || typeof api.create !== 'function') return null;
    const children = await api.getChildren(parentId);
    const existing = findChildFolderByTitle({ children }, titleLower);
    if (existing) return existing;
    return await api.create({ parentId, title });
  } catch (err) {
    console.warn('Failed to ensure folder', err);
    return null;
  }
}

async function ensureBookmark(parentId, title, url) {
  const desiredUrl = (url || '').trim();
  const normalizedDesiredUrl = desiredUrl.replace(/\/$/, '');
  const titleLower = (title || '').toLowerCase();
  try {
    const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
    if (!api || typeof api.getChildren !== 'function' || typeof api.create !== 'function') return null;
    const children = await api.getChildren(parentId);
    const existing = (children || []).find((child) => {
      const childUrl = (child.url || '').trim().replace(/\/$/, '');
      const titleMatch = (child.title || '').toLowerCase() === titleLower;
      return (!!child.url && (childUrl === normalizedDesiredUrl || titleMatch));
    });
    if (existing) return existing;
    return await api.create({ parentId, title, url: desiredUrl });
  } catch (err) {
    console.warn('Failed to ensure bookmark', err);
    return null;
  }
}

function getOtherBookmarksNode(rootChildren = []) {
  if (!Array.isArray(rootChildren)) return null;
  let node = rootChildren.find((folder) => folder && folder.id === 'unfiled_____');
  if (node) return node;
  node = rootChildren.find((folder) => folder && folder.id === '2');
  if (node) return node;
  return rootChildren.find(
    (folder) => folder && folder.children && (folder.title || '').toLowerCase() === 'other bookmarks'
  ) || null;
}

function findHomebaseUnderOtherBookmarks(treeRoot) {
  if (!treeRoot || !treeRoot.children) return null;
  const other = getOtherBookmarksNode(treeRoot.children);
  if (!other || !other.children) return null;
  return findChildFolderByTitle(other, 'homebase');
}

async function getStoredHomebaseRootSubTree(storedRootId, options = {}) {
  const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
  if (!storedRootId || !api || typeof api.getSubTree !== 'function') {
    return null;
  }

  const clearRoot = typeof clearHomebaseRootId === 'function'
    ? clearHomebaseRootId
    : (window.HomebaseBookmarkStorage?.clearHomebaseRootId || (() => Promise.resolve()));

  try {
    const subTree = await api.getSubTree(storedRootId);
    const rootNode = Array.isArray(subTree) ? subTree[0] : null;

    if (!rootNode || rootNode.url) {
      await clearRoot();
      return null;
    }

    lastResolvedSubTree = subTree;
    if (typeof options.onSubTreeResolved === 'function') {
      options.onSubTreeResolved(subTree);
    }
    try {
      if (typeof bookmarkTree !== 'undefined') {
        bookmarkTree = subTree;
      }
    } catch (e) {
      // In case bookmarkTree is not in scope
    }
    return rootNode;
  } catch (err) {
    console.warn('Stored Homebase root ID is invalid; falling back to full bookmark tree lookup.', err);
    if (typeof recordPerfFallback === 'function') {
      recordPerfFallback('bookmarks', 'Invalid bookmark root ID');
    }
    await clearRoot();
    return null;
  }
}

async function createHomebaseFolder() {
  const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
  if (!api) {
    if (typeof showBookmarksEmptyState === 'function') {
      showBookmarksEmptyState('Bookmarks permission unavailable.');
    }
    return;
  }

  if (typeof beginBookmarksBoot === 'function') beginBookmarksBoot();

  const getTree = typeof getBookmarkTree === 'function' ? getBookmarkTree : null;
  const setRootId = typeof setHomebaseRootId === 'function'
    ? setHomebaseRootId
    : (window.HomebaseBookmarkStorage?.setHomebaseRootId || (() => Promise.resolve()));
  const reloadBookmarks = typeof loadBookmarks === 'function' ? loadBookmarks : (() => Promise.resolve());

  try {
    const tree = getTree ? await getTree(true) : null;
    const root = tree && tree[0];
    const rootChildren = (root && root.children) || [];

    const parentNode = getOtherBookmarksNode(rootChildren) || rootChildren[0] || root;
    if (!parentNode || !parentNode.id) {
      console.warn('Could not resolve Other Bookmarks node to create Homebase.');
      if (typeof showBookmarksEmptyState === 'function') {
        showBookmarksEmptyState('Bookmarks permission unavailable.');
      }
      return;
    }

    const homebaseFolder = await ensureFolder(parentNode.id, 'Homebase');
    if (!homebaseFolder || !homebaseFolder.id) {
      if (typeof showBookmarksEmptyState === 'function') {
        showBookmarksEmptyState('Bookmarks permission unavailable.');
      }
      return;
    }

    const folderOne = await ensureFolder(homebaseFolder.id, 'Folder 1');
    if (folderOne && folderOne.id) {
      await ensureBookmark(folderOne.id, 'Google', 'https://www.google.com');
    }

    await setRootId(homebaseFolder.id);
    await reloadBookmarks();
  } catch (err) {
    console.warn('Failed to create Homebase folder', err);
    if (typeof showBookmarksEmptyState === 'function') {
      showBookmarksEmptyState('Bookmarks permission unavailable.');
    }
  } finally {
    if (typeof endBookmarksBoot === 'function') endBookmarksBoot();
  }
}

function setupHomebaseRootControls() {
  const createFolderBtn = document.getElementById('homebase-create-folder-btn');
  const chooseFolderBtn = document.getElementById('homebase-choose-folder-btn');
  const changeRootBtn = document.getElementById('app-bookmarks-change-root-btn');

  if (createFolderBtn && !createFolderBtn.dataset.homebaseRootBound) {
    createFolderBtn.dataset.homebaseRootBound = 'true';
    createFolderBtn.addEventListener('click', () => {
      createHomebaseFolder();
    });
  }

  if (chooseFolderBtn && !chooseFolderBtn.dataset.homebaseRootBound) {
    chooseFolderBtn.dataset.homebaseRootBound = 'true';
    chooseFolderBtn.addEventListener('click', () => {
      if (typeof openFolderPicker === 'function') {
        openFolderPicker(chooseFolderBtn);
      }
    });
  }

  if (changeRootBtn && !changeRootBtn.dataset.homebaseRootBound) {
    changeRootBtn.dataset.homebaseRootBound = 'true';
    changeRootBtn.addEventListener('click', () => {
      if (typeof openFolderPicker === 'function') {
        openFolderPicker(changeRootBtn);
      }
    });
  }
}

function setupHomebaseRootListeners() {
  if (isRootListenersBound) return;
  const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
  if (!api) return;

  const bindBookmarkListener = (eventTarget, handler, label) => {
    if (!eventTarget || typeof eventTarget.addListener !== 'function') return;
    try {
      eventTarget.addListener(handler);
    } catch (err) {
      console.warn(`Failed to bind bookmark ${label || 'event'} listener`, err);
    }
  };

  const cacheInvalidator = () => {
    if (typeof invalidateFolderIndexCache === 'function') {
      invalidateFolderIndexCache();
    }
  };

  bindBookmarkListener(api.onCreated, cacheInvalidator, 'creation');
  bindBookmarkListener(api.onChanged, cacheInvalidator, 'change');
  bindBookmarkListener(api.onMoved, cacheInvalidator, 'move');

  bindBookmarkListener(
    api.onRemoved,
    async (id) => {
      cacheInvalidator();

      try {
        const getRootId = typeof getHomebaseRootId === 'function'
          ? getHomebaseRootId
          : (window.HomebaseBookmarkStorage?.getHomebaseRootId || (() => Promise.resolve('')));
        const clearRoot = typeof clearHomebaseRootId === 'function'
          ? clearHomebaseRootId
          : (window.HomebaseBookmarkStorage?.clearHomebaseRootId || (() => Promise.resolve()));

        const storedRootId = await getRootId();

        if (storedRootId && id === storedRootId) {
          await clearRoot();
          if (typeof showBookmarksEmptyState === 'function') {
            showBookmarksEmptyState();
          }
        }
      } catch (err) {
        console.warn('Failed to handle bookmark removal', err);
      }
    },
    'removal'
  );

  isRootListenersBound = true;
}

function handleStorageChange(changes, area) {
  if (area && area !== 'local') return;
  const rootKey = window.HOMEBASE_BOOKMARK_ROOT_ID_KEY || 'homebaseBookmarkRootId';
  if (changes && changes[rootKey]) {
    if (typeof loadBookmarks === 'function') {
      loadBookmarks();
    }
  }
}
```

---

## 4. Compatibility Layer

Expose the controller namespace and legacy global function bridges on `window`:

```javascript
if (typeof window !== 'undefined') {
  window.findChildFolderByTitle = findChildFolderByTitle;
  window.ensureFolder = ensureFolder;
  window.ensureBookmark = ensureBookmark;
  window.getOtherBookmarksNode = getOtherBookmarksNode;
  window.findHomebaseUnderOtherBookmarks = findHomebaseUnderOtherBookmarks;
  window.getStoredHomebaseRootSubTree = getStoredHomebaseRootSubTree;
  window.createHomebaseFolder = createHomebaseFolder;
  window.setupHomebaseRootControls = setupHomebaseRootControls;
  window.setupHomebaseRootListeners = setupHomebaseRootListeners;

  window.HomebaseBookmarkRootController = {
    findChildFolderByTitle,
    ensureFolder,
    ensureBookmark,
    getOtherBookmarksNode,
    findHomebaseUnderOtherBookmarks,
    getStoredHomebaseRootSubTree,
    createHomebaseFolder,
    setupHomebaseRootControls,
    setupHomebaseRootListeners,
    handleStorageChange,
    getLastResolvedSubTree: () => lastResolvedSubTree
  };
}
```

---

## 5. Dependency Mapping

```text
┌─────────────────────────────────────────────────────────────┐
│                       UPSTREAM LAYER                        │
├──────────────────────────────┬──────────────────────────────┤
│ bookmark-storage.js          │ folder-picker.js             │
│ - HOMEBASE_BOOKMARK_ROOT_KEY │ - openFolderPicker()         │
│ - getHomebaseRootId()        │ - invalidateFolderIndexCache │
│ - setHomebaseRootId()        │                              │
│ - clearHomebaseRootId()      │                              │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONTROLLER LAYER                       │
│        src/newtab/bookmarks/bookmark-root-controller.js      │
│  - Tree discovery (findChildFolderByTitle, getOtherBookmarks)│
│  - Provisioning (ensureFolder, ensureBookmark, createFolder)│
│  - Subtree verification (getStoredHomebaseRootSubTree)      │
│  - Control binding (setupHomebaseRootControls)              │
│  - Observers (setupHomebaseRootListeners, handleStorage)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONSUMER LAYER                         │
├──────────────────────────────┬──────────────────────────────┤
│ src/new-tab.js               │ DOM Surfaces                 │
│ - loadBookmarks()            │ - #homebase-create-folder-btn│
│ - initializePage()           │ - #homebase-choose-folder-btn│
│ - storage listener           │ - #app-bookmarks-change-root │
│ - showBookmarksEmptyState()  │ - #bookmarks-empty-state     │
└──────────────────────────────┴──────────────────────────────┘
```

### Upstream Dependencies:
1. [`src/newtab/bookmarks/bookmark-storage.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-storage.js):
   - Reads, sets, and clears the stored root folder ID (`getHomebaseRootId`, `setHomebaseRootId`, `clearHomebaseRootId`).
2. [`src/newtab/bookmarks/folder-picker.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js):
   - Invalidation of the folder cache on bookmark events (`invalidateFolderIndexCache()`).
   - Triggering the folder picker dialog (`openFolderPicker()`).

### Consumer Dependencies:
1. `loadBookmarks()` in `src/new-tab.js`:
   - Calls `getStoredHomebaseRootSubTree(storedRootId)` and `findHomebaseUnderOtherBookmarks(treeRoot)`.
2. `initializePage()` in `src/new-tab.js`:
   - Calls `setupHomebaseRootControls()` and `setupHomebaseRootListeners()`.
3. Storage change listener in `src/new-tab.js`:
   - Delegates or invokes `loadBookmarks()` when root changes.

---

## 6. Migration Steps

### Phase A: Create Controller Module
1. Create [`src/newtab/bookmarks/bookmark-root-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-root-controller.js).
2. Implement pure tree discovery, provisioning helpers, subtree validation, control binding, and bookmark event listeners as defined in Section 3.
3. Add namespace export `window.HomebaseBookmarkRootController` and top-level global bridges.

### Phase B: Register Script in `src/new-tab.html`
Place the script tag immediately after `bookmark-editor-adapter.js` (line 3359):
```html
  <script src="newtab/bookmarks/bookmark-editor-adapter.js" defer></script>
  <script src="newtab/bookmarks/bookmark-root-controller.js" defer></script>
```

### Phase C: Static Scanner Registration
Update [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs):
Add `"newtab/bookmarks/bookmark-root-controller.js"` to `keyExtractedModulePaths`.

### Phase D: Refactor `src/new-tab.js`
1. Remove lines 1013–1068 (pure tree helpers: `findChildFolderByTitle`, `ensureFolder`, `ensureBookmark`, `getOtherBookmarksNode`, `findHomebaseUnderOtherBookmarks`).
2. Remove lines 1112–1134 (`getStoredHomebaseRootSubTree`).
3. Remove lines 2477–2515 (`createHomebaseFolder`).
4. Remove lines 2611–2643 (`setupHomebaseRootControls`).
5. Remove lines 2645–2694 (`setupHomebaseRootListeners`).
6. Remove top-level DOM button declarations at lines 36, 38, and 40 (`appBookmarksChangeRootBtn`, `homebaseCreateFolderBtn`, `homebaseChooseFolderBtn`).
7. Update `setChangeFolderButtonVisibility(visible)` (line 929) to query `document.getElementById('app-bookmarks-change-root-btn')` directly so it does not depend on a removed global identifier.
8. Retain calls in `initializePage()`:
   ```javascript
   setupHomebaseRootControls();
   setupHomebaseRootListeners();
   ```
   *(These resolve directly to the global functions exposed by `bookmark-root-controller.js`).*

### Phase E: Verification
Execute full static, unit, build, and browser verification passes.

---

## 7. Expected Line Impact

| File | Current Lines | Expected Lines | Net Delta |
|---|:---:|:---:|:---:|
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | 3,521 | ~3,325 | **-196 lines** |
| [`src/newtab/bookmarks/bookmark-root-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-root-controller.js) | 0 | ~230 | +230 lines |
| [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | 3,406 | 3,407 | +1 line |
| [`scripts/check-newtab-static.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | 468 | 469 | +1 line |

Net estimated size of `src/new-tab.js`: **~3,325 lines** (down from 3,833 lines at the start of Phase 5, total net reduction **-508 lines**).

---

## 8. Regression Risks & Mitigation

| Risk | Severity | Impact | Mitigation Strategy |
|---|:---:|---|---|
| **Subtree state synchronization** | Medium | `bookmarkTree` in `new-tab.js` could become stale if `getStoredHomebaseRootSubTree` does not update it. | The controller updates `bookmarkTree` directly when in scope, and returns `rootNode` while providing `getLastResolvedSubTree()`. |
| **Missing DOM buttons on empty/loaded state transitions** | Low | Calling `addEventListener` on null elements if DOM is unready. | `setupHomebaseRootControls()` queries elements dynamically inside the function with defensive null checks. |
| **Duplicate observer attachment** | Low | Multiple listener registrations causing duplicate cache invalidations. | Idempotency guard `isRootListenersBound` ensures listeners are attached at most once. |
| **Cross-browser folder discovery failure** | Low | Firefox `unfiled_____` vs Chrome `2`. | Preserves exact folder ID resolution logic verified across dual browsers. |
| **Global variable collision** | Zero | SyntaxError from duplicate top-level declaration. | Target declarations are removed completely from `src/new-tab.js`. |

---

## 9. Rollback Strategy

If any verification stage fails or a regression is detected:
1. Discard working tree changes in source files:
   ```powershell
   git checkout HEAD -- src/new-tab.js src/new-tab.html scripts/check-newtab-static.mjs
   ```
2. Remove the newly created module:
   ```powershell
   Remove-Item src/newtab/bookmarks/bookmark-root-controller.js -Force
   ```
3. Run verification to confirm clean state:
   ```powershell
   npm.cmd test
   ```

---

## 10. Verification Checklist

Execute the complete verification sequence before requesting commit approval:

### Automated Validation
- [ ] `node --check src/newtab/bookmarks/bookmark-root-controller.js`
- [ ] `node --check src/new-tab.js`
- [ ] `node scripts/check-newtab-static.mjs`
- [ ] `node scripts/smoke-newtab-file.mjs`
- [ ] `npm.cmd test` (343 tests across all 4 stages)
- [ ] `npm.cmd run build:chrome`
- [ ] `git diff --check`
- [ ] `git diff src/preload.js src/instant_load.js manifests/ dist/` (confirm 0 changes to protected files)

### Real-Browser CDP Verification
Run headless browser automation test (`scratch/verify-cycle11-phase5-cp4-browser.mjs`):
- [ ] `window.HomebaseBookmarkRootController` exists and exports all methods.
- [ ] Global bridges (`window.findChildFolderByTitle`, `window.ensureFolder`, etc.) exist and are callable.
- [ ] Bookmark root buttons wire cleanly without runtime exceptions.
- [ ] 0 console errors and 0 unhandled exceptions during startup.

---

## 11. Confirmation

- **No source files modified**
- **No git commits created**
- **No git pushes performed**
- **Working tree clean**

*Awaiting owner review and approval before beginning implementation of Checkpoint 4.*
