# Homebase Improvement Cycle #11 Phase 3 — Checkpoint 1 Plan
## Bookmark Grid Controller Skeleton, Constants, State Bridges & Pure Helpers

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 Checkpoint 1  
> **Target Release**: Homebase v0.18.0  
> **Baseline Commit**: `dbcbaa9` ("Extract wallpaper gallery UI context and lazy loader")  
> **Status**: Planning & Architecture Phase — Awaiting Implementation  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/75-cycle11-phase3-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/75-cycle11-phase3-audit.md)

---

## 1. Objective

Establish the architectural foundation for the **Bookmark Grid Rendering & Virtualization Runtime** extraction.

In Checkpoint 1, we create the new first-party module:
`src/newtab/bookmarks/bookmark-grid-controller.js`

We extract:
1. Controller module skeleton exposing `window.HomebaseBookmarkGridController`.
2. Grid layout & virtualization constants (`METADATA_GRID_PATCH_LIMIT`, default item dimensions).
3. Private ownership of `virtualizerState` with bidirectional window property bridges.
4. State bridges for active folder resolution (`currentGridFolderNode`, `activeHomebaseFolderId`, `allBookmarks`).
5. Pure helper functions (`metadataEntriesEqual`, `getChangedMetadataIds`, `getIconKeyForNode`).
6. Script registration in `src/new-tab.html` preserving classic `<script defer>` execution order.

### Scope Boundaries (What NOT to Touch in Checkpoint 1)
- **DO NOT** move Sortable.js drag-and-drop logic (`setupGridSortable`, `handleGridDrop`, `handleGridMove`).
- **DO NOT** move folder tab navigation (`createFolderTabs`, tab bar DOM).
- **DO NOT** move tree mutation logic (`deleteBookmarkOrFolder`, `createNewBookmarkFolder`).
- **DO NOT** move startup orchestration or bootloader files.

---

## 2. Dependency Review of Target Components

| Component / Function | Location in `src/new-tab.js` | Current Role & Callers | Destination in Checkpoint 1 |
|---|:---:|---|---|
| `virtualizerState` | L773–L788 | State object tracking items, rowHeight, itemWidth, cols, scroll listeners, render range | **Moved** to `bookmark-grid-controller.js` as private state with window property bridge |
| `METADATA_GRID_PATCH_LIMIT` | L790 | Threshold constant (12) for in-place grid patching vs full re-render | **Moved** to `bookmark-grid-controller.js` |
| `metadataEntriesEqual` | L3274–L3289 | Pure equality checker between two bookmark metadata records | **Moved** to `bookmark-grid-controller.js`; shim in `src/new-tab.js` |
| `getChangedMetadataIds` | L3291–L3300 | Pure diffing function returning IDs with modified metadata | **Moved** to `bookmark-grid-controller.js`; shim in `src/new-tab.js` |
| `getIconKeyForNode` | L3203–L3234 | Generates deterministic cache key for bookmark or folder icon | **Moved** to `bookmark-grid-controller.js`; shim in `src/new-tab.js` |
| `currentFolderId` resolution | L1964 | `currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId` | Encapsulated in `getActiveFolderId()` helper |
| `allBookmarks` | L728 | Flattened list of all bookmarks in active tree | Accessible via state bridge `getAllBookmarks()` / `setAllBookmarks()` |
| `renderBookmark` | L2682 | Bookmark DOM node creation | Kept in `new-tab.js` for Checkpoint 1 (target for CP2) |
| `renderBookmarkIconInto` | L2335 | Card icon rendering & favicon integration | Kept in `new-tab.js` for Checkpoint 1 (target for CP2) |
| `updateVirtualGrid` | L3078 | Virtualization slice calculation and DOM pooling | Kept in `new-tab.js` for Checkpoint 1 (target for CP3) |
| `initVirtualizer` | L3358 | Scroll & resize listener attachment | Kept in `new-tab.js` for Checkpoint 1 (target for CP3) |
| `renderBookmarkGrid` | L3474 | Container reconciliation & rendering pass | Kept in `new-tab.js` for Checkpoint 1 (target for CP4) |

---

## 3. Architecture of `bookmark-grid-controller.js`

```javascript
/**
 * Homebase Bookmark Grid Rendering & Virtualization Controller
 * Manages grid layout, viewport virtualization, icon presentation, and DOM reconciliation.
 */
(function() {
  'use strict';

  // --- Constants ---
  const METADATA_GRID_PATCH_LIMIT = 12;
  const DEFAULT_ROW_HEIGHT = 115;
  const DEFAULT_ITEM_WIDTH = 105;

  // --- Private State ---
  let virtualizerState = {
    isEnabled: false,
    items: [],
    rowHeight: DEFAULT_ROW_HEIGHT,
    itemWidth: DEFAULT_ITEM_WIDTH,
    cols: 1,
    totalRows: 0,
    mainContentEl: null,
    gridEl: null,
    scrollListener: null,
    resizeObserver: null,
    updateRafId: 0,
    lastStart: -1,
    lastEnd: -1
  };

  // --- Pure Helpers ---
  function metadataEntriesEqual(previousEntry, nextEntry) { ... }
  function getChangedMetadataIds(previousMetadata, nextMetadata) { ... }
  function getIconKeyForNode(node, options = {}) { ... }

  // --- State Accessors & Bridges ---
  function getVirtualizerState() { return virtualizerState; }
  function setVirtualizerState(next) { virtualizerState = next || virtualizerState; }
  function isVirtualizerEnabled() { return Boolean(virtualizerState && virtualizerState.isEnabled); }
  function getActiveFolderId() { ... }

  // --- Global Export ---
  window.HomebaseBookmarkGridController = {
    METADATA_GRID_PATCH_LIMIT,
    DEFAULT_ROW_HEIGHT,
    DEFAULT_ITEM_WIDTH,
    metadataEntriesEqual,
    getChangedMetadataIds,
    getIconKeyForNode,
    getVirtualizerState,
    setVirtualizerState,
    isVirtualizerEnabled,
    getActiveFolderId
  };

  // --- Bidirectional Window Property Bridges for Compatibility ---
  if (!('virtualizerState' in window)) {
    Object.defineProperty(window, 'virtualizerState', {
      get: () => virtualizerState,
      set: (val) => { virtualizerState = val || virtualizerState; },
      configurable: true,
      enumerable: true
    });
  }
})();
```

---

## 4. Script Ordering & Invariants

In `src/new-tab.html`:
```html
  <!-- Bookmark helpers -->
  <script src="newtab/bookmarks/bookmark-style-runtime.js" defer></script>
  <script src="newtab/bookmarks/grid-reorder-animation.js" defer></script>
  <script src="newtab/bookmarks/quick-actions.js" defer></script>
  <script src="newtab/bookmarks/bookmark-tabs-scroll.js" defer></script>
  <script src="newtab/bookmarks/folder-picker.js" defer></script>
  <script src="newtab/bookmarks/bookmark-grid-controller.js" defer></script> <!-- Added -->
```

Dependencies satisfied:
- Loaded after `Sortable.min.js` and `data.js`.
- Loaded before `src/new-tab.js`.
- Evaluates in classic `<script defer>` mode.

---

## 5. Verification Protocol

Before declaring Checkpoint 1 complete:

1. **Syntax Validation**:
   ```powershell
   node --check src/newtab/bookmarks/bookmark-grid-controller.js
   node --check src/new-tab.js
   ```
2. **Static AST Invariant & Collision Detection**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
   *Must verify 54 deferred scripts, 0 top-level declaration collisions.*
3. **Automated Smoke Test**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
4. **Unit Tests**:
   ```powershell
   npm.cmd test
   ```
5. **Build Invariant**:
   ```powershell
   npm.cmd run build
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```

---

## 6. Manual Browser Verification Assessment

- **Risk Level**: **Low**. Checkpoint 1 introduces the skeleton, constants, pure helpers, and property bridges. No rendering loops, DOM mutation flows, or Sortable drag interactions are altered yet.
- **Decision**: **Manual browser verification is not required for this phase because the changes are isolated and covered by automated validation.**
