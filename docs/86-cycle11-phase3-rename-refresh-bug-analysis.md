# Homebase Bug Fix Investigation — Bookmark Rename UI Refresh Issue
## Data Flow Analysis & UI Synchronization Report

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 (Post-Checkpoint 5)  
> **Status**: Investigation Complete — Ready for Review  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/84-cycle11-phase3-checkpoint5-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/84-cycle11-phase3-checkpoint5-plan.md), [docs/85-cycle11-phase3-checkpoint5-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/85-cycle11-phase3-checkpoint5-report.md)

---

## 1. Problem Description

Following Cycle #11 Phase 3 Checkpoint 5, a UI synchronization defect was identified when renaming items:

- **Renaming a bookmark card from the grid**:
  - The rename save operation succeeds.
  - Browser bookmark storage updates correctly.
  - The UI grid card **still displays the old name**.
  - A page reload / opening a new tab is required to display the updated name.
- **Renaming a folder tab**:
  - The rename save operation succeeds.
  - The folder tab and grid **update immediately in the UI**.

---

## 2. Comparative Data Flow Investigation

### A. Folder Tab Rename Update Path (`showEditInput`)

Located in [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) (lines 1163–1216):

```javascript
const saveAction = async () => {
  const newName = input.value.trim();
  if (newName && newName !== folderNode.title) {
    try {
      await browser.bookmarks.update(folderNode.id, { title: newName });
      const load = (typeof loadBookmarks === 'function')
        ? loadBookmarks
        : (typeof window !== 'undefined' ? window.loadBookmarks : null);
      if (load) {
        load(folderNode.id);
      }
    } catch (err) {
      console.error("Error updating folder:", err);
      cleanup();
    }
  } else {
    cleanup();
  }
};
```

#### What happens in Folder Tab Rename:
1. `browser.bookmarks.update` updates persistent extension storage.
2. `loadBookmarks(folderNode.id)` is called immediately.
3. `loadBookmarks` orchestrates a comprehensive synchronization pass:
   - Fetches the fresh bookmark tree from storage (`browser.bookmarks.getTree()` / `getBookmarkTree(true)`).
   - Re-synthesizes all folder tabs via `createFolderTabs`, displaying the new title in the DOM.
   - Calls `renderBookmarkGrid(folderNode)`, re-rendering the grid with updated nodes.
   - Re-attaches Sortable drag-and-drop.
4. **Outcome**: The UI immediately reflects the new name.

---

### B. Bookmark Card Rename Update Path (`showGridItemRenameInput`)

Located in [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js) (lines 1218–1324):

```javascript
function showGridItemRenameInput(gridItem, bookmarkNode) {
  if (!gridItem || !bookmarkNode) return;

  const titleSpan = gridItem.querySelector('span');
  if (!titleSpan) return;

  titleSpan.style.display = 'none';
  gridItem.classList.add('is-renaming');

  const input = document.createElement('textarea');
  input.className = 'grid-item-rename-input';
  input.value = bookmarkNode.title || '';
  input.rows = 1;
  ...
  gridItem.appendChild(input);
  ...
  const cleanup = () => {
    gridItem.classList.remove('is-renaming');
    input.remove();
    titleSpan.style.display = '-webkit-box';
  };

  const saveAction = async () => {
    const newName = input.value.trim();
    if (newName && newName !== bookmarkNode.title) {
      try {
        await browser.bookmarks.update(bookmarkNode.id, { title: newName });

        const tree = (typeof bookmarkTree !== 'undefined')
          ? bookmarkTree
          : (typeof window !== 'undefined' ? window.bookmarkTree : null);

        const updateNode = (typeof updateNodeInTree === 'function')
          ? updateNodeInTree
          : (typeof window !== 'undefined' ? window.updateNodeInTree : null);

        const getTree = (typeof getBookmarkTree === 'function')
          ? getBookmarkTree
          : (typeof window !== 'undefined' ? window.getBookmarkTree : null);

        const findNode = (typeof findBookmarkNodeById === 'function')
          ? findBookmarkNodeById
          : (typeof window !== 'undefined' ? window.findBookmarkNodeById : null);

        let treePatched = false;
        if (tree && tree[0] && updateNode) {
          treePatched = Boolean(updateNode(tree[0], bookmarkNode.id, { title: newName }));
        }

        if (!treePatched && getTree) {
          await getTree(true);
        }

        const activeTree = (typeof bookmarkTree !== 'undefined')
          ? bookmarkTree
          : (typeof window !== 'undefined' ? window.bookmarkTree : null);

        const updatedNode = (activeTree && activeTree[0] && findNode)
          ? findNode(activeTree[0], bookmarkNode.id)
          : null;

        if (updatedNode) {
          updateElementData(gridItem, updatedNode);
        }
        cleanup();
      } catch (err) {
        console.error('Error updating bookmark:', err);
        cleanup();
      }
    } else {
      cleanup();
    }
  };

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveAction();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  });

  input.addEventListener('blur', saveAction);
}
```

---

## 3. Post-Rename Lifecycle & Reconciliation Check

| Candidate Call | Called in `showGridItemRenameInput`? | Status / Impact |
|---|---|---|
| `patchActiveGridMetadataItems()` | **NO** | Not called. |
| `renderBookmark()` | **NO** | Not called. |
| `renderBookmarkGrid()` | **NO** | Not called. Grid is never re-rendered. |
| `updateVirtualGrid()` | **NO** | Not called. Virtualization pool is never synchronized. |
| Any metadata reconciliation function | **NO** | Not called. |
| `loadBookmarks()` | **NO** | Not called (unlike folder tab rename). |

---

## 4. Root Cause Analysis

### Primary Root Cause: The In-Place DOM Mutation Failure & Scope Boundary Breakdown

1. **Missing Direct Title Update on the Captured `titleSpan`**:
   - When entering edit mode, `titleSpan` (the `<span>` inside `gridItem`) is hidden (`titleSpan.style.display = 'none'`).
   - In `saveAction()`, `titleSpan.textContent` is **never directly assigned `newName`**.
   - Instead, the function relies exclusively on:
     ```javascript
     if (updatedNode) {
       updateElementData(gridItem, updatedNode);
     }
     cleanup();
     ```
   - If `updatedNode` is null, or if `updateElementData` does not locate the target span, `cleanup()` executes:
     ```javascript
     titleSpan.style.display = '-webkit-box';
     ```
   - Because `titleSpan.textContent` was never modified, it re-displays the **original, stale text**.

2. **`bookmarkTree` Scope Boundary Breakdown in `bookmark-grid-controller.js`**:
   - `showGridItemRenameInput(gridItem, bookmarkNode)` in `src/new-tab.js` forwards arguments without passing an options context:
     ```javascript
     function showGridItemRenameInput(gridItem, bookmarkNode) {
       if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.showGridItemRenameInput === 'function') {
         return window.HomebaseBookmarkGridController.showGridItemRenameInput(gridItem, bookmarkNode);
       }
     }
     ```
   - In `src/new-tab.js`, `bookmarkTree` is declared as `let bookmarkTree = [];` and is **never assigned to `window.bookmarkTree`**.
   - In `bookmark-grid-controller.js`:
     ```javascript
     const tree = (typeof bookmarkTree !== 'undefined')
       ? bookmarkTree
       : (typeof window !== 'undefined' ? window.bookmarkTree : null);
     ```
   - When `treePatched` evaluates to false, it falls back to `await getTree(true);`.
   - `getBookmarkTree(true)` returns the freshly fetched tree, but `showGridItemRenameInput` **discards the return value**:
     ```javascript
     if (!treePatched && getTree) {
       await getTree(true); // Return value is discarded!
     }
     const activeTree = (typeof bookmarkTree !== 'undefined')
       ? bookmarkTree
       : (typeof window !== 'undefined' ? window.bookmarkTree : null);
     ```
   - Consequently, `activeTree` is still unresolved/stale, `updatedNode` is `null`, and `updateElementData(gridItem, updatedNode)` **is skipped completely**.

3. **Virtualization and `currentGridFolderNode` Desynchronization**:
   - If the folder contains more than 150 items or virtualization is enabled:
     - `gridItem` in the DOM is an element from `itemPool`.
     - Virtualization reads from `currentGridFolderNode.children`.
     - Because `currentGridFolderNode.children` is not updated with the new title, and neither `renderBookmarkGrid(currentGridFolderNode)` nor `updateVirtualGrid()` is called, any virtual scrolling or re-layout re-reads the old name.

4. **Double Save / Race Condition on `blur`**:
   - Unlike `createFolderTabs` (which enforces an `actionCompleted` boolean guard), `showGridItemRenameInput` has both an `Enter` key listener and a `blur` listener attached to the same `saveAction`.
   - When `Enter` is pressed, `saveAction()` begins asynchronous execution (`await browser.bookmarks.update`).
   - When `cleanup()` removes `input` from the DOM (`input.remove()`), the browser fires an asynchronous or synchronous `blur` event on the detached input, triggering `saveAction` a second time while in an invalid/detached DOM state.

---

## 5. Safest Minimal Fix Location & Strategy

### A. Location 1: `src/new-tab.js` — Wrapper Options Delegation
Update `showGridItemRenameInput` in `src/new-tab.js` to provide lexical references via an options parameter, matching the pattern established for `renderBookmarkGrid` and `createFolderTabs`:

```javascript
function showGridItemRenameInput(gridItem, bookmarkNode) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.showGridItemRenameInput === 'function') {
    return window.HomebaseBookmarkGridController.showGridItemRenameInput(gridItem, bookmarkNode, {
      bookmarkTree,
      currentGridFolderNode,
      renderBookmarkGrid,
      findBookmarkNodeById,
      updateNodeInTree,
      getBookmarkTree
    });
  }
}
```

### B. Location 2: `src/newtab/bookmarks/bookmark-grid-controller.js` — Direct & Defensive Synchronization
In `showGridItemRenameInput(gridItem, bookmarkNode, options = {})`:

1. **Guard against double invocation**:
   ```javascript
   let actionCompleted = false;
   const markActionComplete = () => {
     if (actionCompleted) return false;
     actionCompleted = true;
     return true;
   };
   ```

2. **Optimistic Direct DOM Update**:
   Update `titleSpan.textContent = newName;` immediately upon save:
   ```javascript
   titleSpan.textContent = newName;
   bookmarkNode.title = newName;
   ```

3. **Capture Return Value from `getBookmarkTree`**:
   ```javascript
   let activeTree = (options && options.bookmarkTree) ||
     (typeof bookmarkTree !== 'undefined' ? bookmarkTree : (typeof window !== 'undefined' ? window.bookmarkTree : null));

   if (activeTree && activeTree[0] && updateNode) {
     updateNode(activeTree[0], bookmarkNode.id, { title: newName });
   } else if (getTree) {
     const refreshedTree = await getTree(true);
     if (refreshedTree && refreshedTree[0]) {
       activeTree = refreshedTree;
     }
   }
   ```

4. **Update `currentGridFolderNode` & Virtualization Reconciliation**:
   ```javascript
   const currentFolder = getCurrentGridFolderNode() || (options && options.currentGridFolderNode);
   if (currentFolder && Array.isArray(currentFolder.children)) {
     const childMatch = currentFolder.children.find((c) => c && c.id === bookmarkNode.id);
     if (childMatch) {
       childMatch.title = newName;
     }
   }

   const updatedNode = (activeTree && activeTree[0] && findNode)
     ? findNode(activeTree[0], bookmarkNode.id)
     : bookmarkNode;

   if (updatedNode) {
     updateElementData(gridItem, updatedNode);
   }

   if (virtualizerState && virtualizerState.isEnabled) {
     updateVirtualGrid();
   }
   ```

5. **Execute `cleanup()` safely**:
   Unhides `titleSpan`, removes `input`, and removes `.is-renaming`.

---

## 6. Verification Status

- Source files remain untouched during this investigation.
- No git commits or pushes have been executed.
- Awaiting owner review and approval before implementing the fix.
