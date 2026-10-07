// =============================================================================
// Homebase Bookmark Action Controller
// Module: src/newtab/bookmarks/bookmark-action-controller.js
// Handles user-initiated bookmark and folder mutation actions: creation,
// deletion, clipboard paste, alphabetical sorting, and context navigation.
// =============================================================================

let isPasteListenerBound = false;

let actionDelegates = {};

function configureBookmarkActionController(delegates = {}) {
  actionDelegates = Object.assign(actionDelegates, delegates);
}

function getActionDelegate(name, fallbackFn) {
  if (typeof actionDelegates[name] === 'function') {
    return actionDelegates[name];
  }
  return fallbackFn;
}

function resolveBookmarkTree() {
  if (typeof actionDelegates.getBookmarkTree === 'function') {
    return actionDelegates.getBookmarkTree();
  }
  if (typeof window !== 'undefined' && window.bookmarkTree) {
    return window.bookmarkTree;
  }
  return typeof bookmarkTree !== 'undefined' ? bookmarkTree : null;
}

function resolveFindBookmarkNodeById(rootNode, id) {
  if (typeof actionDelegates.findBookmarkNodeById === 'function') {
    return actionDelegates.findBookmarkNodeById(rootNode, id);
  }
  if (typeof window !== 'undefined' && typeof window.findBookmarkNodeById === 'function') {
    return window.findBookmarkNodeById(rootNode, id);
  }
  if (typeof findBookmarkNodeById === 'function') {
    return findBookmarkNodeById(rootNode, id);
  }
  return null;
}

async function refreshBookmarkTree(forceRefresh = true) {
  if (typeof actionDelegates.refreshBookmarkTree === 'function') {
    return actionDelegates.refreshBookmarkTree(forceRefresh);
  }
  if (typeof window !== 'undefined' && typeof window.getBookmarkTree === 'function') {
    return window.getBookmarkTree(forceRefresh);
  }
  if (typeof getBookmarkTree === 'function') {
    return getBookmarkTree(forceRefresh);
  }
  return resolveBookmarkTree();
}

function resolveRootDisplayFolderId() {
  if (typeof actionDelegates.getRootDisplayFolderId === 'function') {
    return actionDelegates.getRootDisplayFolderId();
  }
  if (typeof window !== 'undefined' && typeof window.rootDisplayFolderId !== 'undefined') {
    return window.rootDisplayFolderId;
  }
  return typeof rootDisplayFolderId !== 'undefined' ? rootDisplayFolderId : null;
}

function resolveActiveHomebaseFolderId() {
  if (typeof actionDelegates.getActiveHomebaseFolderId === 'function') {
    return actionDelegates.getActiveHomebaseFolderId();
  }
  if (typeof window !== 'undefined' && typeof window.activeHomebaseFolderId !== 'undefined') {
    return window.activeHomebaseFolderId;
  }
  return typeof activeHomebaseFolderId !== 'undefined' ? activeHomebaseFolderId : null;
}

function resolveCurrentGridFolderNode() {
  if (typeof actionDelegates.getCurrentGridFolderNode === 'function') {
    return actionDelegates.getCurrentGridFolderNode();
  }
  if (typeof window !== 'undefined' && typeof window.currentGridFolderNode !== 'undefined') {
    return window.currentGridFolderNode;
  }
  return typeof currentGridFolderNode !== 'undefined' ? currentGridFolderNode : null;
}

function executeRenderBookmarkGrid(folderNode) {
  if (typeof actionDelegates.renderBookmarkGrid === 'function') {
    return actionDelegates.renderBookmarkGrid(folderNode);
  }
  if (typeof window !== 'undefined' && typeof window.renderBookmarkGrid === 'function') {
    return window.renderBookmarkGrid(folderNode);
  }
  if (typeof renderBookmarkGrid === 'function') {
    return renderBookmarkGrid(folderNode);
  }
}

async function executeLoadBookmarks(folderId = null) {
  if (typeof actionDelegates.loadBookmarks === 'function') {
    return actionDelegates.loadBookmarks(folderId);
  }
  if (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function') {
    return window.loadBookmarks(folderId);
  }
  if (typeof loadBookmarks === 'function') {
    return loadBookmarks(folderId);
  }
}

function executeProcessBookmarks(nodes, activeFolderId, rootNodeOverride) {
  if (typeof actionDelegates.processBookmarks === 'function') {
    return actionDelegates.processBookmarks(nodes, activeFolderId, rootNodeOverride);
  }
  if (typeof window !== 'undefined' && typeof window.processBookmarks === 'function') {
    return window.processBookmarks(nodes, activeFolderId, rootNodeOverride);
  }
  if (typeof processBookmarks === 'function') {
    return processBookmarks(nodes, activeFolderId, rootNodeOverride);
  }
}

async function resolveFaviconUrl(rawUrl) {
  if (typeof actionDelegates.getFaviconUrlForRawUrl === 'function') {
    return actionDelegates.getFaviconUrlForRawUrl(rawUrl);
  }
  if (typeof window !== 'undefined' && typeof window.getFaviconUrlForRawUrl === 'function') {
    return window.getFaviconUrlForRawUrl(rawUrl);
  }
  if (typeof getFaviconUrlForRawUrl === 'function') {
    return getFaviconUrlForRawUrl(rawUrl);
  }
  return null;
}

async function executeShowDeleteConfirm(event, options) {
  if (typeof actionDelegates.showDeleteConfirm === 'function') {
    return actionDelegates.showDeleteConfirm(event, options);
  }
  if (typeof window !== 'undefined' && typeof window.showDeleteConfirm === 'function') {
    return window.showDeleteConfirm(event, options);
  }
  if (typeof showDeleteConfirm === 'function') {
    return showDeleteConfirm(event, options);
  }
  return Promise.resolve(false);
}

function executeShowCustomAlert(message) {
  if (typeof actionDelegates.showCustomAlert === 'function') {
    return actionDelegates.showCustomAlert(message);
  }
  if (typeof window !== 'undefined' && typeof window.showCustomAlert === 'function') {
    return window.showCustomAlert(message);
  }
  if (typeof showCustomAlert === 'function') {
    return showCustomAlert(message);
  }
  if (typeof alert === 'function') {
    alert(message);
  }
}

function getBrowserApi() {
  if (typeof browser !== 'undefined' && browser.bookmarks) return browser;
  if (typeof window !== 'undefined' && window.browser && window.browser.bookmarks) return window.browser;
  if (typeof chrome !== 'undefined' && chrome.bookmarks) return chrome;
  if (typeof window !== 'undefined' && window.chrome && window.chrome.bookmarks) return window.chrome;
  return null;
}

/**
 * Helper: Extracts "Github" from "https://github.com/repo"
 */
function getSmartNameFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    let name = hostname.replace(/^www\./i, '').split('.')[0];
    if (!name) {
      return 'New Bookmark';
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (err) {
    return 'New Bookmark';
  }
}

/**
 * Checks whether a bookmark tree node is a folder.
 */
function isBookmarkFolderNode(node) {
  return !!(node && (Array.isArray(node.children) || !node.url));
}

/**
 * Natural-sort comparator for bookmark and folder node titles.
 */
function compareBookmarkNodeTitles(a, b) {
  const titleA = String((a && a.title) || '');
  const titleB = String((b && b.title) || '');
  return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Deletes a bookmark or bookmark folder with user confirmation and coordinates UI refresh.
 */
async function deleteBookmarkOrFolder(id, isFolder, sourceTileEl = null) {
  if (!id) return;

  const browserApi = getBrowserApi();
  if (!browserApi) return;

  const tree = resolveBookmarkTree();
  let node = null;
  if (tree && tree[0]) {
    node = resolveFindBookmarkNodeById(tree[0], id);
  }

  const title =
    node && node.title
      ? node.title
      : isFolder
      ? 'this folder'
      : 'this bookmark';

  let faviconUrl = null;
  if (!isFolder && node && node.url) {
    try {
      faviconUrl = await resolveFaviconUrl(node.url);
    } catch (e) {
      // ignore - will fall back to letter icon
    }
  }

  const confirmed = await executeShowDeleteConfirm(null, {
    title,
    faviconUrl,
    isFolder,
    node,
    sourceTileEl
  });

  if (!confirmed) return;

  try {
    if (isFolder) {
      await browserApi.bookmarks.removeTree(id);
    } else {
      await browserApi.bookmarks.remove(id);
    }

    const newTree = await refreshBookmarkTree(true);
    const currentGrid = resolveCurrentGridFolderNode();
    const activeFolderId = resolveActiveHomebaseFolderId();

    if (currentGrid) {
      const activeGridNode = newTree && newTree[0]
        ? resolveFindBookmarkNodeById(newTree[0], currentGrid.id)
        : null;

      if (activeGridNode) {
        executeRenderBookmarkGrid(activeGridNode);
      } else {
        await executeLoadBookmarks(activeFolderId);
      }
    } else {
      await executeLoadBookmarks(activeFolderId);
    }
  } catch (err) {
    console.error('Error deleting bookmark/folder:', err);
    executeShowCustomAlert('Error: could not delete this item.');
  }
}

/**
 * Creates a new bookmark folder inside the root Homebase folder.
 */
async function createNewBookmarkFolder(name) {
  const rootId = resolveRootDisplayFolderId();
  if (!rootId) {
    console.error("Cannot create folder: 'homebase' folder ID is not set.");
    return;
  }

  const browserApi = getBrowserApi();
  if (!browserApi) return;

  try {
    const newFolderNode = await browserApi.bookmarks.create({
      parentId: rootId,
      title: name
    });

    const tree = await refreshBookmarkTree(true);
    const rootNode = tree && tree[0] ? resolveFindBookmarkNodeById(tree[0], rootId) : null;

    if (rootNode) {
      executeProcessBookmarks([rootNode], newFolderNode.id, rootNode);
    } else {
      await executeLoadBookmarks(newFolderNode.id);
    }
  } catch (err) {
    console.error('Error creating bookmark folder:', err);
  }
}

/**
 * Pastes clipboard URL into the currently active folder.
 */
async function handlePasteBookmark() {
  const browserApi = getBrowserApi();
  if (!browserApi) return;

  try {
    if (typeof window !== 'undefined' && typeof window.focus === 'function') {
      window.focus();
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      executeShowCustomAlert('Clipboard permissions are not supported or available.');
      return;
    }

    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      executeShowCustomAlert('Clipboard is empty.');
      return;
    }

    const isUrl = text.includes('://') || text.includes('www.') || text.includes('.');
    if (!isUrl) {
      executeShowCustomAlert("Clipboard text doesn't look like a URL.");
      return;
    }

    let finalUrl = text.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const smartTitle = getSmartNameFromUrl(finalUrl);
    const currentGrid = resolveCurrentGridFolderNode();
    const activeFolderId = resolveActiveHomebaseFolderId();
    const targetParentId = currentGrid ? currentGrid.id : activeFolderId;

    await browserApi.bookmarks.create({
      parentId: targetParentId,
      title: smartTitle,
      url: finalUrl
    });

    const tree = await refreshBookmarkTree(true);
    const activeNode = tree && tree[0]
      ? resolveFindBookmarkNodeById(tree[0], targetParentId)
      : null;

    if (activeNode) {
      executeRenderBookmarkGrid(activeNode);
    } else {
      await executeLoadBookmarks(activeFolderId);
    }
  } catch (err) {
    console.error('Paste failed:', err);
    executeShowCustomAlert('Please allow clipboard permissions in the extension settings.');
  }
}

/**
 * Sorts the active folder alphabetically (folders first, then bookmarks) and refreshes the grid.
 */
async function sortCurrentFolderByName() {
  const browserApi = getBrowserApi();
  if (!browserApi) return;

  const currentGrid = resolveCurrentGridFolderNode();
  const activeFolderId = resolveActiveHomebaseFolderId();
  const folderId = currentGrid ? currentGrid.id : activeFolderId;
  if (!folderId) return;

  const tree = await refreshBookmarkTree(true);
  const folderNode = tree && tree[0]
    ? resolveFindBookmarkNodeById(tree[0], folderId)
    : null;

  if (!folderNode || !folderNode.children) return;

  const children = [...folderNode.children];
  const folders = children.filter((node) => isBookmarkFolderNode(node));
  const bookmarks = children.filter((node) => !isBookmarkFolderNode(node));
  folders.sort(compareBookmarkNodeTitles);
  bookmarks.sort(compareBookmarkNodeTitles);
  const sortedChildren = [...folders, ...bookmarks];

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i];
    if (child.index !== i) {
      await browserApi.bookmarks.move(child.id, { index: i });
    }
  }

  const newTree = await refreshBookmarkTree(true);
  const activeNode = newTree && newTree[0]
    ? resolveFindBookmarkNodeById(newTree[0], folderId)
    : null;

  if (activeNode) {
    executeRenderBookmarkGrid(activeNode);
  }
}

/**
 * Deletes a bookmark folder subtree and reloads tabs.
 */
async function deleteBookmarkFolder(folderId) {
  const browserApi = getBrowserApi();
  if (!browserApi) return;

  try {
    await browserApi.bookmarks.removeTree(folderId);
    await executeLoadBookmarks();
  } catch (err) {
    console.error('Error deleting folder:', err);
  }
}

/**
 * Opens a bookmark in a background tab via browser.tabs.create.
 */
function openBookmarkInNewTab(bookmarkId) {
  const tree = resolveBookmarkTree();
  if (!tree || !tree[0] || !bookmarkId) return;

  const node = resolveFindBookmarkNodeById(tree[0], bookmarkId);
  if (!node || !node.url) {
    executeShowCustomAlert('This bookmark does not have a valid URL.');
    return;
  }

  const browserApi = getBrowserApi();
  if (browserApi && browserApi.tabs && typeof browserApi.tabs.create === 'function') {
    browserApi.tabs.create({ url: node.url, active: false });
  } else {
    window.open(node.url, '_blank');
  }
}

/**
 * Opens a folder from context menu into the grid.
 */
function openFolderFromContext(folderId) {
  const tree = resolveBookmarkTree();
  if (!tree || !tree[0] || !folderId) return;

  const folderNode = resolveFindBookmarkNodeById(tree[0], folderId);
  if (!folderNode || !folderNode.children) {
    executeShowCustomAlert('Unable to open this folder.');
    return;
  }

  executeRenderBookmarkGrid(folderNode);
}

/**
 * Binds global document paste event listener for clipboard bookmark creation.
 */
function setupPasteListener() {
  if (isPasteListenerBound) return;
  if (typeof document === 'undefined') return;

  isPasteListenerBound = true;
  document.addEventListener('paste', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
      return;
    }
    e.preventDefault();
    handlePasteBookmark();
  });
}

// Controller Object Export
const HomebaseBookmarkActionController = {
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

// Global backward-compatibility bridges on window
if (typeof window !== 'undefined') {
  window.HomebaseBookmarkActionController = HomebaseBookmarkActionController;
  window.deleteBookmarkOrFolder = deleteBookmarkOrFolder;
  window.deleteBookmarkFolder = deleteBookmarkFolder;
  window.createNewBookmarkFolder = createNewBookmarkFolder;
  window.handlePasteBookmark = handlePasteBookmark;
  window.getSmartNameFromUrl = getSmartNameFromUrl;
  window.isBookmarkFolderNode = isBookmarkFolderNode;
  window.compareBookmarkNodeTitles = compareBookmarkNodeTitles;
  window.sortCurrentFolderByName = sortCurrentFolderByName;
  window.openBookmarkInNewTab = openBookmarkInNewTab;
  window.openFolderFromContext = openFolderFromContext;
  window.setupPasteListener = setupPasteListener;
}
