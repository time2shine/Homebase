# Homebase Bug Investigation — Right-Click Edit Dialog Rename Not Updating UI
## Bookmark & Folder Modal Save Data Flow & DOM Synchronization Analysis

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 3 (Post-Checkpoint 5 Investigation)  
> **Status**: Investigation Complete — Awaiting Approval Gate  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/86-cycle11-phase3-rename-refresh-bug-analysis.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/86-cycle11-phase3-rename-refresh-bug-analysis.md)

---

## 1. Executive Summary

A critical UI synchronization issue occurs when editing bookmark cards and folder items through the right-click context menu **Edit** dialogs (`showEditBookmarkModal` and `showEditFolderModal`):

### Steps to Reproduce:
1. Open the bookmark grid on the new-tab dashboard.
2. Right-click any bookmark or folder item card in the grid.
3. Select **Edit** from the context menu.
4. The Edit Modal dialog opens (`#add-bookmark-modal` or `#edit-folder-modal`).
5. Change the bookmark or folder title in the input field.
6. Click **Save**.
7. The browser native bookmark storage updates immediately (`chrome.bookmarks.get` / `browser.bookmarks.get` returns the new title).
8. **The UI in the grid card still shows the old title** until the page is reloaded or a new tab is opened.

---

## 2. Complete Execution Trace of the Edit Dialog Save Flow

### Flow A: Edit Bookmark Modal (`handleBookmarkModalSave`)
1. User right-clicks bookmark card -> context menu triggers `showEditBookmarkModal(currentContextItemId)` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).
2. Lazy-loads [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js) and calls `openEditBookmark({ bookmarkId, context: createBookmarkEditorContext() })`.
3. Modal renders `#add-bookmark-modal` with current title and URL.
4. User edits title to `newName` and clicks `#bookmark-save-btn`.
5. Event handler `handleBookmarkModalSave` executes in [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js) (lines 402–452):
   - **Step 1: Native Storage Update**:
     ```javascript
     await context.updateBookmark(bookmarkModalEditingId, { title: name, url: url });
     ```
     Delegates to `browser.bookmarks.update(id, changes)`. **Succeeds**.
   - **Step 2: Custom Metadata Persistence**:
     ```javascript
     await storageLocalSet({ [BOOKMARK_META_KEY]: bookmarkMetadata });
     ```
     Saves custom metadata to storage.
   - **Step 3: In-Memory Tree Mutation**:
     ```javascript
     let treePatched = false;
     const root = getBookmarkTreeRoot();
     if (root) {
       treePatched = Boolean(context.updateNodeInTree(root, bookmarkModalEditingId, { title: name, url: url }));
     }
     if (!treePatched) {
       await refreshBookmarkTree(true);
     }
     ```
     Patches `bookmarkTree[0]` in memory.
   - **Step 4: DOM Grid Item Synchronization**:
     ```javascript
     const currentGridFolderNode = context.getCurrentGridFolderNode();
     const currentRoot = getBookmarkTreeRoot();
     if (currentGridFolderNode && currentRoot) {
       const activeNode = findBookmarkNodeById(currentRoot, currentGridFolderNode.id);
       const updatedBookmarkNode = findBookmarkNodeById(currentRoot, bookmarkModalEditingId);
       const isVisibleActiveChild = activeNode && Array.isArray(activeNode.children)
         && activeNode.children.some((child) => child && child.id === bookmarkModalEditingId);

       if (activeNode && updatedBookmarkNode && isVisibleActiveChild) {
         const itemEl = context.findRenderedGridItemById(bookmarkModalEditingId);
         if (itemEl) {
           context.updateElementData(itemEl, updatedBookmarkNode);
         } else if (!isVirtualizerEnabled()) {
           context.renderBookmarkGrid(activeNode);
         }
       }
     }
     hideAddBookmarkModal();
     ```

---

### Flow B: Edit Folder Modal (`handleEditFolderSave`)
1. User right-clicks folder card in grid -> context menu triggers `showEditFolderModal(folderNode)` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).
2. Calls `openEditFolder({ folderNode, context: createBookmarkEditorContext() })`.
3. Modal renders `#edit-folder-modal` with current folder title.
4. User edits title to `newName` and clicks `#edit-folder-save-btn`.
5. Event handler `handleEditFolderSave` executes in [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js) (lines 1670–1721):
   - **Step 1: Native Storage Update**:
     ```javascript
     await context.updateFolder(editFolderTargetId, { title: newName });
     ```
     Delegates to `browser.bookmarks.update(id, { title: newName })`. **Succeeds**.
   - **Step 2: Custom Metadata Persistence**:
     ```javascript
     await storageLocalSet({ [FOLDER_META_KEY]: folderMetadata });
     ```
   - **Step 3: In-Memory Tree Mutation**:
     ```javascript
     let treePatched = false;
     const currentRoot = getBookmarkTreeRoot();
     if (currentRoot) {
       treePatched = Boolean(context.updateNodeInTree(currentRoot, editFolderTargetId, { title: newName }));
     }
     if (!treePatched) {
       await refreshBookmarkTree(true);
     }
     ```
   - **Step 4: DOM Grid Item Synchronization**:
     ```javascript
     const currentGridFolderNode = context.getCurrentGridFolderNode();
     const updatedRoot = getBookmarkTreeRoot();
     if (nameChanged && currentGridFolderNode && updatedRoot) {
       const activeNode = findBookmarkNodeById(updatedRoot, currentGridFolderNode.id);
       const updatedFolderNode = findBookmarkNodeById(updatedRoot, editFolderTargetId);
       const isVisibleActiveChild = activeNode && Array.isArray(activeNode.children)
         && activeNode.children.some((child) => child && child.id === editFolderTargetId);

       if (activeNode && updatedFolderNode && isVisibleActiveChild) {
         const itemEl = context.findRenderedGridItemById(editFolderTargetId);
         if (itemEl) {
           context.updateElementData(itemEl, updatedFolderNode);
         } else if (!isVirtualizerEnabled()) {
           context.renderBookmarkGrid(activeNode);
         }
       }
     }
     hideEditFolderModal();
     ```

---

## 3. Investigation Findings & Diagnostic Answers

### 1. Where does the save happen?
- The save happens in [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js):
  - For bookmarks: `handleBookmarkModalSave` -> calls `context.updateBookmark()` (line 404).
  - For folders: `handleEditFolderSave` -> calls `context.updateFolder()` (line 1670).
- These delegate directly to `browser.bookmarks.update(id, changes)` via the bridge in `createBookmarkEditorContext()` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (lines 1285 & 1288).

### 2. Does the application receive the bookmark change event?
- **Yes**, the browser fires `browser.bookmarks.onChanged`.
- However, in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (lines 3178–3185), the listener registered for `browser.bookmarks.onChanged` is strictly:
  ```javascript
  const cacheInvalidator = () => {
    invalidateFolderIndexCache();
  };
  bindBookmarkListener(browser.bookmarks.onChanged, cacheInvalidator, 'change');
  ```
- It **only** invalidates `folderIndexCache`. It does **not** update `bookmarkTree`, does **not** refresh the grid, and does **not** patch the DOM.
- When metadata is saved, `browser.storage.onChanged` also fires, but line 5066 of `src/new-tab.js` checks:
  ```javascript
  if (changedMetadataIds?.length && currentGridFolderNode && bookmarkTree && bookmarkTree[0])
  ```
  If only the title was renamed without custom icons or colors, `changedMetadataIds` is empty. Furthermore, as detailed below, `currentGridFolderNode` in `src/new-tab.js` is `null`!

### 3. If the save succeeded, why is the visible DOM not patched?
**This is the core defect.**
In both `handleBookmarkModalSave` and `handleEditFolderSave`, the DOM update logic is guarded by:
```javascript
const currentGridFolderNode = context.getCurrentGridFolderNode();
const currentRoot = getBookmarkTreeRoot();
if (currentGridFolderNode && currentRoot) { ... }
```
When `context.getCurrentGridFolderNode()` is called:
- It evaluates `getCurrentGridFolderNode: () => currentGridFolderNode` from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (line 1254).
- In `src/new-tab.js`, `currentGridFolderNode` was initialized as `let currentGridFolderNode = null;`.
- In Checkpoint 5, when `createFolderTabs` was extracted into `src/newtab/bookmarks/bookmark-grid-controller.js`, tab creation and tab switching call the **local** `renderBookmarkGrid` inside `bookmark-grid-controller.js`.
- That local controller function sets `currentGridFolderNode` inside `bookmark-grid-controller.js` and on `window.currentGridFolderNode`.
- **It never updates the lexical variable `currentGridFolderNode` in `src/new-tab.js`!**
- As confirmed by our live CDP runtime trace:
  ```json
  "windowCurrentGridFolderNode": "6",
  "controllerCurrentGridFolderNode": "6",
  "contextCurrentGridFolderNode": null
  ```
- Because `context.getCurrentGridFolderNode()` returns `null`, the condition `if (currentGridFolderNode && currentRoot)` is **FALSE**.
- **The entire DOM patch block (`findRenderedGridItemById`, `updateElementData`, `renderBookmarkGrid`) is silently skipped!**

### 4. Does bookmarkTree / allBookmarks / currentGridFolderNode contain stale data after update?
- **`currentGridFolderNode` in `src/new-tab.js`**: Completely stale (`null`).
- **`currentGridFolderNode` in `bookmark-grid-controller.js`**: Holds the folder node object, but its `children` array is only updated if `updateNodeInTree` mutated the node in-place. If `refreshBookmarkTree(true)` was required, `currentGridFolderNode` points to the folder from the prior tree instance.
- **`bookmarkTree`**: Updated in-memory via `updateNodeInTree` or `getBookmarkTree(true)`.
- **`allBookmarks`**: Stale until the next background search indexing or page reload.

---

## 4. Root Causes Breakdown

1. **State Desynchronization across the Module Boundary**:
   - `createBookmarkEditorContext()` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) exposes `getCurrentGridFolderNode: () => currentGridFolderNode`.
   - `src/new-tab.js`'s lexical `currentGridFolderNode` variable was decoupled when `renderBookmarkGrid` and `createFolderTabs` were extracted into [`src/newtab/bookmarks/bookmark-grid-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-grid-controller.js).
   - Whenever folder tabs initialize or switch folders, `currentGridFolderNode` is set inside `HomebaseBookmarkGridController` and on `window.currentGridFolderNode`, leaving `currentGridFolderNode` in `src/new-tab.js` as `null`.
2. **Silent Failure in `bookmark-editor.js`**:
   - Because `context.getCurrentGridFolderNode()` returns `null`, lines 435–449 and 1705–1719 in `bookmark-editor.js` evaluate to `false`.
   - No error is thrown, the modal closes normally (`hideAddBookmarkModal()`), but the grid item in the DOM is never updated.
3. **Missing Fallback in `bookmark-editor.js`**:
   - `bookmark-editor.js` had no fallback if `context.getCurrentGridFolderNode()` was null; it did not fall back to `window.currentGridFolderNode` or `window.HomebaseBookmarkGridController.getCurrentGridFolderNode()`.
4. **Folder Tab Labels Not Refreshed on Folder Edit**:
   - When renaming a folder through `showEditFolderModal`, even if the grid item is patched, any corresponding tab in `#bookmark-folder-tabs` is not refreshed unless `createFolderTabs` or `loadBookmarks` is called.

---

## 5. Minimal Fix Plan

### Fix 1: Update `createBookmarkEditorContext()` in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)
Ensure `getCurrentGridFolderNode` defensively resolves from the active controller or window bridge:

```javascript
getCurrentGridFolderNode: () => {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
    const node = window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
    if (node) return node;
  }
  return currentGridFolderNode || (typeof window !== 'undefined' ? window.currentGridFolderNode : null);
},
```

### Fix 2: Keep `currentGridFolderNode` Synchronized in `src/new-tab.js`
In `src/new-tab.js`:
1. In `createFolderTabs` wrapper:
   ```javascript
   if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
     currentGridFolderNode = window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
   }
   ```
2. In `renderBookmarkGrid` wrapper:
   ```javascript
   currentGridFolderNode = folderNode;
   if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.setCurrentGridFolderNode === 'function') {
     window.HomebaseBookmarkGridController.setCurrentGridFolderNode(folderNode);
   }
   ```

### Fix 3: Defensive Fallback in [`src/assets/js/bookmark-editor.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js)
1. In `handleBookmarkModalSave` (lines 433–449):
   - Resolve `currentGridFolderNode = context.getCurrentGridFolderNode() || (typeof window !== 'undefined' ? window.currentGridFolderNode : null) || (window.HomebaseBookmarkGridController?.getCurrentGridFolderNode?.());`.
   - After calling `context.updateElementData(itemEl, updatedBookmarkNode)`, if `isVirtualizerEnabled()` is true, trigger `context.updateVirtualGrid?.() || window.HomebaseBookmarkGridController?.updateVirtualGrid?.()`.
2. In `handleEditFolderSave` (lines 1703–1719):
   - Resolve `currentGridFolderNode` defensively.
   - If folder renamed, also trigger `context.loadBookmarks?.(currentGridFolderNode.id)` or update tab labels so folder tab bar reflects the new folder name.

---

## 6. Verification Status

- Investigation complete using live Chromium CDP trace.
- Zero source code modifications made.
- Awaiting owner approval before implementing the fix.
