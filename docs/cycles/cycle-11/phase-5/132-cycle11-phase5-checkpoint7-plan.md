# Checkpoint 7 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 7 — Bookmark Tree Model & Hierarchy Service Extraction  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Audit Reference**: [`docs/131-cycle11-phase5-checkpoint7-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/131-cycle11-phase5-checkpoint7-audit.md)  
**Target Source**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  

---

## 1. Goal

Extract bookmark tree retrieval, in-memory tree caching, promise deduplication, recursive node querying, in-memory node mutation, hierarchy validation, and default parent resolution from the legacy monolith:  
[`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)

into a dedicated service module:  
[`src/newtab/bookmarks/bookmark-tree-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tree-service.js).

Additionally, clean up 12 duplicate pass-through forwarding wrappers in `src/new-tab.js` that are already declared and exposed directly on `window` by [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js).

---

## 2. Current Ownership in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (currently 2,787 lines), tree model operations and duplicate grid forwarders occupy ~290 lines across multiple sections:

| Function / Block | Current Lines | Lines Count | Responsibility |
|---|:---:|:---:|---|
| `let bookmarkTree = [];` | 588 | 1 line | Top-level in-memory cache of the root bookmark array. |
| `let bookmarkTreeFetchPromise = null;` | 750 | 1 line | In-flight promise handle for deduplicating concurrent `getBookmarkTree` calls. |
| `getBookmarkTree(forceRefresh)` | 839–879 | 41 lines | Calls `browser.bookmarks.getTree()`, manages promise deduplication, and caches the result. |
| `flattenBookmarks(nodes)` | 1557–1579 | 23 lines | Traverses tree recursively to collect all bookmark leaf nodes into a flat `{ title, url }` array. |
| `renderBookmarkIconInto` / `renderFolderIconInto` | 1587–1597 | 11 lines | Redundant forwarders to `window.HomebaseBookmarkGridController`. |
| `findBookmarkNodeById(rootNode, id)` | 1605–1634 | 30 lines | Searches tree recursively by node ID; handles deep folder hierarchies. |
| `findNodeAndParent(rootNode, id, parent)` | 1635–1650 | 16 lines | Searches tree recursively returning `{ node, parent }` pair for structural tree updates. |
| `updateNodeInTree(rootNode, id, patch)` | 1651–1661 | 11 lines | Locates target node and mutates its `title` and/or `url` in-memory. |
| `appendNodeToParent(rootNode, parentId, newChildNode)` | 1663–1680 | 18 lines | Inserts child node into parent's `children` array with normalized sibling indices. |
| `getValidFolderId(folderId)` | 1682–1689 | 8 lines | Validates whether a given folder ID exists and contains children in current `bookmarkTree`. |
| `getDefaultBookmarkParentId()` | 1691–1700 | 10 lines | Resolves fallback parent folder (`currentGridFolderNode` -> `lastUsedBookmarkFolderId` -> `activeHomebaseFolderId`). |
| Redundant Grid Controller forwarders | 1702–1740 | 39 lines | `updateElementData`, `getIconKeyForNode`, `getChangedMetadataIds`, `findRenderedGridItemById`, `patchActiveGridMetadataItems`, `disableVirtualizer` (already exported by `bookmark-grid-controller.js`). |
| Redundant Grid & Tab forwarders | 1756–1828 | 73 lines | `renderBookmarkGrid`, `showEditInput`, `showGridItemRenameInput`, `createFolderTabs` (already exported by `bookmark-grid-controller.js`). |

---

## 3. Exact Functions & Declarations to Extract

### 3.1 Functions to Migrate into `bookmark-tree-service.js`
1. `getBookmarkTree(forceRefresh = false)`
2. `findBookmarkNodeById(rootNode, id)`
3. `findNodeAndParent(rootNode, id, parent = null)`
4. `updateNodeInTree(rootNode, id, patch)`
5. `appendNodeToParent(rootNode, parentId, newChildNode)`
6. `flattenBookmarks(nodes)`
7. `getValidFolderId(folderId, treeOverride = null)`
8. `getDefaultBookmarkParentId()`

### 3.2 State Variables to Consolidate into `bookmark-tree-service.js`
1. `bookmarkTree` (encapsulated as internal `cachedBookmarkTree` with bidirectional `window.bookmarkTree` mirror)
2. `bookmarkTreeFetchPromise` (internal promise deduplication)

### 3.3 Redundant Forwarders to Remove from `src/new-tab.js`
(Already exported directly to `window` by `src/newtab/bookmarks/bookmark-grid-controller.js`):
1. `renderBookmarkIconInto`
2. `renderFolderIconInto`
3. `updateElementData`
4. `getIconKeyForNode`
5. `getChangedMetadataIds`
6. `findRenderedGridItemById`
7. `patchActiveGridMetadataItems`
8. `disableVirtualizer`
9. `renderBookmarkGrid`
10. `showEditInput`
11. `showGridItemRenameInput`
12. `createFolderTabs`

---

## 4. New Module Specification: `bookmark-tree-service.js`

### Destination Path
`src/newtab/bookmarks/bookmark-tree-service.js`

### Implementation Architecture
```javascript
// =============================================================================
// Homebase Bookmark Tree Service
// Module: src/newtab/bookmarks/bookmark-tree-service.js
// Handles bookmark tree fetching, promise deduplication, in-memory tree traversal,
// node searching, in-memory node patching, and hierarchy validation.
// =============================================================================

let cachedBookmarkTree = [];
let bookmarkTreeFetchPromise = null;

// Accessor delegates for external contextual state (with safe fallbacks)
let treeDelegates = {
  getCurrentGridFolderNode: () => (typeof window !== 'undefined' && window.currentGridFolderNode ? window.currentGridFolderNode : null),
  getLastUsedBookmarkFolderId: () => (typeof window !== 'undefined' && window.lastUsedBookmarkFolderId ? window.lastUsedBookmarkFolderId : null),
  getActiveHomebaseFolderId: () => (typeof window !== 'undefined' && window.activeHomebaseFolderId ? window.activeHomebaseFolderId : null)
};

function configureBookmarkTreeService(delegates = {}) {
  treeDelegates = Object.assign(treeDelegates, delegates);
}

function getBrowserApi() {
  if (typeof browser !== 'undefined' && browser.bookmarks) return browser;
  if (typeof window !== 'undefined' && window.browser && window.browser.bookmarks) return window.browser;
  if (typeof chrome !== 'undefined' && chrome.bookmarks) return chrome;
  if (typeof window !== 'undefined' && window.chrome && window.chrome.bookmarks) return window.chrome;
  return null;
}
```

### Detailed Method Implementations

#### 4.1 Tree Fetching & Promise Deduplication (`getBookmarkTree`)
```javascript
async function getBookmarkTree(forceRefresh = false) {
  if (cachedBookmarkTree && cachedBookmarkTree.length > 0 && !forceRefresh && !bookmarkTreeFetchPromise) {
    return cachedBookmarkTree;
  }

  if (bookmarkTreeFetchPromise) {
    return bookmarkTreeFetchPromise;
  }

  const browserApi = getBrowserApi();
  if (!browserApi) {
    return cachedBookmarkTree || [];
  }

  bookmarkTreeFetchPromise = browserApi.bookmarks.getTree()
    .then((tree) => {
      cachedBookmarkTree = Array.isArray(tree) ? tree : [];
      syncWindowBookmarkTree();
      return cachedBookmarkTree;
    })
    .catch((err) => {
      console.warn('Failed to refresh bookmark tree', err);
      return cachedBookmarkTree || [];
    })
    .finally(() => {
      bookmarkTreeFetchPromise = null;
    });

  return bookmarkTreeFetchPromise;
}
```

#### 4.2 Recursive Node Search (`findBookmarkNodeById`)
```javascript
function findBookmarkNodeById(rootNode, id) {
  const root = rootNode || (cachedBookmarkTree && cachedBookmarkTree[0]) || null;
  if (!root || !id) return null;

  if (root.id === id) {
    return root;
  }

  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const found = findBookmarkNodeById(child, id);
      if (found) {
        return found;
      }
    }
  }

  return null;
}
```

#### 4.3 Node & Parent Pair Lookup (`findNodeAndParent`)
```javascript
function findNodeAndParent(rootNode, id, parent = null) {
  const root = rootNode || (cachedBookmarkTree && cachedBookmarkTree[0]) || null;
  if (!root || !id) return null;

  if (root.id === id) {
    return { node: root, parent };
  }

  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const found = findNodeAndParent(child, id, root);
      if (found) {
        return found;
      }
    }
  }

  return null;
}
```

#### 4.4 In-Memory Tree Mutation (`updateNodeInTree`, `appendNodeToParent`)
```javascript
function updateNodeInTree(rootNode, id, patch) {
  const result = findNodeAndParent(rootNode, id);
  if (!result || !result.node) return null;

  if (patch.title !== undefined) {
    result.node.title = patch.title;
  }
  if (patch.url !== undefined) {
    result.node.url = patch.url;
  }
  return result.node;
}

function appendNodeToParent(rootNode, parentId, newChildNode) {
  const result = findNodeAndParent(rootNode, parentId);
  if (!result || !result.node) return null;

  const parentNode = result.node;
  if (!Array.isArray(parentNode.children)) {
    parentNode.children = [];
  }

  if (!newChildNode.parentId) {
    newChildNode.parentId = parentId;
  }

  parentNode.children.push(newChildNode);

  parentNode.children.forEach((child, idx) => {
    child.index = idx;
  });

  return newChildNode;
}
```

#### 4.5 Flattening & Hierarchy Helpers (`flattenBookmarks`, `getValidFolderId`, `getDefaultBookmarkParentId`)
```javascript
function flattenBookmarks(nodes) {
  let flatList = [];
  const list = Array.isArray(nodes) ? nodes : [nodes];

  for (const node of list) {
    if (!node) continue;
    if (node.url) {
      flatList.push({ title: node.title, url: node.url });
    }
    if (Array.isArray(node.children)) {
      flatList = flatList.concat(flattenBookmarks(node.children));
    }
  }

  return flatList;
}

function getValidFolderId(folderId, treeOverride = null) {
  const tree = treeOverride || cachedBookmarkTree;
  if (!folderId || !tree || !tree[0]) return null;

  const node = findBookmarkNodeById(tree[0], folderId);
  if (node && Array.isArray(node.children)) {
    return node.id;
  }
  return null;
}

function getDefaultBookmarkParentId() {
  const currentGrid = treeDelegates.getCurrentGridFolderNode();
  if (currentGrid && currentGrid.id) {
    return currentGrid.id;
  }

  const lastUsedId = treeDelegates.getLastUsedBookmarkFolderId();
  const validStored = getValidFolderId(lastUsedId);
  if (validStored) {
    return validStored;
  }

  const activeId = treeDelegates.getActiveHomebaseFolderId();
  return activeId || null;
}
```

---

## 5. Public Controller Interface & Compatibility Bridges

### 5.1 Controller Object: `window.HomebaseBookmarkTreeService`
```javascript
const HomebaseBookmarkTreeService = {
  configure: configureBookmarkTreeService,
  getBookmarkTree,
  getTree: () => cachedBookmarkTree,
  setTree: (tree) => {
    cachedBookmarkTree = Array.isArray(tree) ? tree : [];
    syncWindowBookmarkTree();
  },
  clearTreeCache: () => {
    cachedBookmarkTree = [];
    bookmarkTreeFetchPromise = null;
    syncWindowBookmarkTree();
  },
  findBookmarkNodeById,
  findNodeAndParent,
  updateNodeInTree,
  appendNodeToParent,
  flattenBookmarks,
  getValidFolderId,
  getDefaultBookmarkParentId
};
```

### 5.2 Global Backward-Compatibility Bridges on `window`
All 8 functions and the `bookmarkTree` array are bridged to `window`:
```javascript
function syncWindowBookmarkTree() {
  if (typeof window !== 'undefined') {
    window.bookmarkTree = cachedBookmarkTree;
  }
}

if (typeof window !== 'undefined') {
  window.HomebaseBookmarkTreeService = HomebaseBookmarkTreeService;
  window.getBookmarkTree = getBookmarkTree;
  window.findBookmarkNodeById = findBookmarkNodeById;
  window.findNodeAndParent = findNodeAndParent;
  window.updateNodeInTree = updateNodeInTree;
  window.appendNodeToParent = appendNodeToParent;
  window.flattenBookmarks = flattenBookmarks;
  window.getValidFolderId = getValidFolderId;
  window.getDefaultBookmarkParentId = getDefaultBookmarkParentId;

  // Bidirectional accessor for window.bookmarkTree
  try {
    Object.defineProperty(window, 'bookmarkTree', {
      get: () => cachedBookmarkTree,
      set: (val) => {
        cachedBookmarkTree = Array.isArray(val) ? val : [];
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    window.bookmarkTree = cachedBookmarkTree;
  }
}
```

---

## 6. Dependency Migration Map

### 6.1 Required Script Loading Order in `src/new-tab.html`
`bookmark-tree-service.js` will be registered immediately following `bookmark-storage.js`:

```text
  bookmark-storage.js
          ↓
  bookmark-tree-service.js (NEW - authoritative tree caching, findBookmarkNodeById, tree queries)
          ↓
  bookmark-root-controller.js (reads root folder via tree service)
          ↓
  bookmark-action-controller.js (invokes mutations, refreshes tree)
          ↓
  bookmark-editor-adapter.js (updates tree in-memory via updateNodeInTree)
          ↓
  bookmark-grid-controller.js (renders tree nodes into grid & tabs)
          ↓
  new-tab.js (startup orchestration & initial tree hydration)
```

### 6.2 Consumer Callers & Migration Access Matrix

| Consumer File | Functions Used | Previous Resolution Pattern | Checkpoint 7 Migration |
|---|---|---|---|
| `bookmark-action-controller.js` | `findBookmarkNodeById`, `getBookmarkTree` | Defensive fallback via `actionDelegates` | Direct synchronous access to `window.findBookmarkNodeById` / `HomebaseBookmarkTreeService` |
| `bookmark-root-controller.js` | `getBookmarkTree`, `findBookmarkNodeById` | Late global reference | Direct synchronous access to `window.findBookmarkNodeById` and `getBookmarkTree` |
| `bookmark-editor-adapter.js` | `findBookmarkNodeById`, `updateNodeInTree`, `appendNodeToParent`, `getDefaultBookmarkParentId`, `getBookmarkTree` | Injected callback options | Direct global bridges & canonical tree model |
| `bookmark-grid-controller.js` | `findBookmarkNodeById`, `updateNodeInTree`, `getBookmarkTree` | Injected callback options | Direct global bridges & canonical tree model |
| `context-menu-controller.js` | `findBookmarkNodeById`, `getBookmarkTree` | Injected callback options / fallback | Direct global bridges |
| `firefox-containers.js` | `findBookmarkNodeById`, `getBookmarkTree` | Global access | Direct global bridges |
| `perf-report.js` | `getBookmarkTree` | Global access | Direct global bridge |
| `folder-picker.js` | `getBookmarkTree` | Global access | Direct global bridge |
| `material-color-picker.js` | `findBookmarkNodeById` | Global access | Direct global bridge |
| `visual-effects-settings.js` | `findBookmarkNodeById` | Global access | Direct global bridge |
| `new-tab.js` | All 8 functions + `bookmarkTree` | Declared locally (monolith) | Calls migrated to `HomebaseBookmarkTreeService` and global bridges |

---

## 7. Protected Areas & High-Risk Guardrails Confirmation

In strict compliance with [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` will remain completely untouched (0 diffs).
- **Sortable.js Drag & Drop**: Grid drag-and-drop (`setupGridSortable`, `handleGridMove`, `handleGridDrop`) and tab drag-and-drop (`setupTabsSortable`, `handleTabDrop`) will NOT be touched.
- **Startup Orchestration**: `initializePage()`, `scheduleStartupHydrationTasks()`, and `markPageReadyOnce()` will remain in `src/new-tab.js`.
- **Idle Scheduler Engine**: `processIdleTasks()`, `scheduleIdleTask()`, `scheduleIdleChunkedTask()` will NOT be touched.
- **Wallpaper Lifecycle**: `primeWallpaperBackground()` and video caching will NOT be touched.

---

## 8. Step-by-Step Implementation Sequence

### Phase A — Create New Service Module
1. Create `src/newtab/bookmarks/bookmark-tree-service.js`.
2. Implement `cachedBookmarkTree`, `bookmarkTreeFetchPromise`, and `treeDelegates`.
3. Implement `getBookmarkTree(forceRefresh)`.
4. Implement `findBookmarkNodeById(rootNode, id)` and `findNodeAndParent(rootNode, id, parent)`.
5. Implement `updateNodeInTree(rootNode, id, patch)` and `appendNodeToParent(rootNode, parentId, newChildNode)`.
6. Implement `flattenBookmarks(nodes)`, `getValidFolderId(folderId)`, and `getDefaultBookmarkParentId()`.
7. Export `window.HomebaseBookmarkTreeService` and define all 8 global bridges and `window.bookmarkTree` accessor.

### Phase B — Register Module
1. In `src/new-tab.html`, insert `<script src="newtab/bookmarks/bookmark-tree-service.js" defer></script>` immediately following `bookmark-storage.js` (line 3354).
2. In `scripts/check-newtab-static.mjs`, append `"newtab/bookmarks/bookmark-tree-service.js"` to `keyExtractedModulePaths`.

### Phase C — Remove Duplication from `src/new-tab.js`
1. Remove `let bookmarkTree = [];` (line 588).
2. Remove `let bookmarkTreeFetchPromise = null;` (line 750).
3. Remove `getBookmarkTree(forceRefresh = false)` (lines 839–879).
4. Remove `flattenBookmarks(nodes)` (lines 1557–1579).
5. Remove redundant forwarders: `renderBookmarkIconInto`, `renderFolderIconInto` (lines 1587–1597).
6. Remove `findBookmarkNodeById(rootNode, id)` (lines 1605–1634).
7. Remove `findNodeAndParent(rootNode, id, parent)` (lines 1635–1650).
8. Remove `updateNodeInTree(rootNode, id, patch)` (lines 1651–1661).
9. Remove `appendNodeToParent(rootNode, parentId, newChildNode)` (lines 1663–1680).
10. Remove `getValidFolderId(folderId)` (lines 1682–1689).
11. Remove `getDefaultBookmarkParentId()` (lines 1691–1700).
12. Remove redundant grid forwarders: `updateElementData`, `getIconKeyForNode`, `getChangedMetadataIds`, `findRenderedGridItemById`, `patchActiveGridMetadataItems`, `disableVirtualizer` (lines 1702–1740).
13. Remove redundant grid & tab forwarders: `renderBookmarkGrid`, `showEditInput`, `showGridItemRenameInput`, `createFolderTabs` (lines 1756–1828).

---

## 9. Verification Checklist

The implementation must pass the entire validation suite:

```powershell
# 1. Syntax checks
node --check src/new-tab.js
node --check src/newtab/bookmarks/bookmark-tree-service.js

# 2. Static invariant scanner (0 collisions, 58 deferred scripts, all key modules exist)
node scripts/check-newtab-static.mjs

# 3. Browser smoke test (DOM surfaces, controllers, startup perf)
node scripts/smoke-newtab-file.mjs

# 4. Unit test suite (all 343 tests must pass)
npm.cmd test

# 5. Extension packaging (Chrome & Firefox distributions)
npm.cmd run build

# 6. Whitespace check
git diff --check

# 7. Protected files check (exactly 0 modifications)
git diff src/preload.js src/instant_load.js manifests/ dist/

# 8. Real Browser CDP Verification Suite
node scratch/verify-cycle11-phase5-cp7-browser.mjs
```

### Real Browser CDP Verification Items (`verify-cycle11-phase5-cp7-browser.mjs`):
1. `HomebaseBookmarkTreeService` available on `window` with complete API surface.
2. Global backward-compatibility bridges on `window` (`findBookmarkNodeById`, `getBookmarkTree`, `findNodeAndParent`, etc.).
3. `getBookmarkTree()` retrieval and promise deduplication.
4. `findBookmarkNodeById()` deep recursive search across multiple tree depths.
5. `findNodeAndParent()` correctly resolves parent node references.
6. `updateNodeInTree()` in-memory mutation updates `title` and `url`.
7. `appendNodeToParent()` child insertion with normalized sibling indices.
8. `flattenBookmarks()` flattens multi-level hierarchy into flat array.
9. `getValidFolderId()` folder validation against current tree.
10. `getDefaultBookmarkParentId()` fallback resolution.
11. Bidirectional `window.bookmarkTree` mirror synchronization.
12. Zero console errors, exceptions, or `ReferenceError`s.

---

## 10. Rollback Strategy

If any verification stage fails or regressions are detected:

1. **Immediate Working Copy Revert**:
   ```powershell
   git restore src/new-tab.js src/new-tab.html scripts/check-newtab-static.mjs
   git clean -f src/newtab/bookmarks/bookmark-tree-service.js
   ```
2. **Post-Revert Integrity Check**:
   ```powershell
   node scripts/check-newtab-static.mjs
   npm.cmd test
   git status
   ```
3. **Clean Baseline Guarantee**:
   The working copy will be restored to the clean `04553a6` baseline without impacting history or remote branches.

---

## 11. Expected Outcome & Metric Targets

- **`src/new-tab.js` line count**: Reduced from 2,787 lines down to **~2,497 lines** (**~290 lines net reduction**).
- **Cumulative Phase 5 reduction**: Exceeds **-1,330 net lines** (down from 3,833 lines at Phase 5 start; **~35% total reduction** of the legacy monolith).
- **Subsystem Decoupling**: Foundational tree data structures, traversal, and caching fully consolidated into `bookmark-tree-service.js`.

---

## 12. Next Steps & Stop Condition

- [x] Implementation plan created.
- [ ] Do NOT modify source files.
- [ ] Do NOT create commits.
- **Stop condition reached**: Wait for owner review and approval before beginning Phase A implementation.
