// =============================================================================
// Homebase Bookmark Tree Service
// Module: src/newtab/bookmarks/bookmark-tree-service.js
// Handles bookmark tree fetching, promise deduplication, in-memory tree traversal,
// node searching, in-memory node patching, and hierarchy validation.
// =============================================================================

const serviceState = {
  tree: []
};

let bookmarkTreeFetchPromise = null;

let treeDelegates = {
  getCurrentGridFolderNode: () => (typeof window !== 'undefined' && window.currentGridFolderNode ? window.currentGridFolderNode : null),
  getLastUsedBookmarkFolderId: () => (typeof window !== 'undefined' && window.lastUsedBookmarkFolderId ? window.lastUsedBookmarkFolderId : null),
  getActiveHomebaseFolderId: () => (typeof window !== 'undefined' && window.activeHomebaseFolderId ? window.activeHomebaseFolderId : null)
};

function configureBookmarkTreeService(delegates = {}) {
  treeDelegates = Object.assign(treeDelegates, delegates);
}

function getBookmarkTreeBrowserApi() {
  if (typeof browser !== 'undefined' && browser.bookmarks) return browser;
  if (typeof window !== 'undefined' && window.browser && window.browser.bookmarks) return window.browser;
  if (typeof chrome !== 'undefined' && chrome.bookmarks) return chrome;
  if (typeof window !== 'undefined' && window.chrome && window.chrome.bookmarks) return window.chrome;
  return null;
}

/**
 * Fetches the browser bookmark tree with caching and promise deduplication.
 * @param {boolean} forceRefresh - If true, bypasses cache and re-queries browser bookmarks API.
 * @returns {Promise<Array>}
 */
async function getBookmarkTree(forceRefresh = false) {
  if (serviceState.tree && serviceState.tree.length > 0 && !forceRefresh && !bookmarkTreeFetchPromise) {
    return serviceState.tree;
  }

  if (bookmarkTreeFetchPromise) {
    return bookmarkTreeFetchPromise;
  }

  const browserApi = getBookmarkTreeBrowserApi();
  if (!browserApi) {
    return serviceState.tree || [];
  }

  bookmarkTreeFetchPromise = browserApi.bookmarks.getTree()
    .then((tree) => {
      serviceState.tree = Array.isArray(tree) ? tree : [];
      return serviceState.tree;
    })
    .catch((err) => {
      console.warn('Failed to refresh bookmark tree', err);
      return serviceState.tree || [];
    })
    .finally(() => {
      bookmarkTreeFetchPromise = null;
    });

  return bookmarkTreeFetchPromise;
}

/**
 * Recursively finds a bookmark node (folder or item) by its ID.
 * @param {object|null} rootNode - Root node to search under (defaults to cached tree root).
 * @param {string} id - Bookmark or folder ID.
 * @returns {object|null}
 */
function findBookmarkNodeById(rootNode, id) {
  const root = rootNode || (serviceState.tree && serviceState.tree[0]) || null;
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

/**
 * Searches tree recursively returning { node, parent } pair for structural tree updates.
 * @param {object|null} rootNode - Root node to search under.
 * @param {string} id - Node ID.
 * @param {object|null} parent - Current parent node.
 * @returns {{ node: object, parent: object|null } | null}
 */
function findNodeAndParent(rootNode, id, parent = null) {
  const root = rootNode || (serviceState.tree && serviceState.tree[0]) || null;
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

/**
 * Mutates a node in-memory with updated properties.
 * @param {object|null} rootNode - Root node.
 * @param {string} id - Node ID.
 * @param {object} patch - Property patch ({ title, url }).
 * @returns {object|null}
 */
function updateNodeInTree(rootNode, id, patch) {
  const root = rootNode || (serviceState.tree && serviceState.tree[0]) || null;
  if (!root || !id || !patch) return null;

  const result = findNodeAndParent(root, id);
  if (!result || !result.node) return null;

  if (patch.title !== undefined) {
    result.node.title = patch.title;
  }
  if (patch.url !== undefined) {
    result.node.url = patch.url;
  }
  return result.node;
}

/**
 * Inserts a child node into a parent's children array with normalized indexing.
 * @param {object|null} rootNode - Root node.
 * @param {string} parentId - Parent folder ID.
 * @param {object} newChildNode - Child node to insert.
 * @returns {object|null}
 */
function appendNodeToParent(rootNode, parentId, newChildNode) {
  const root = rootNode || (serviceState.tree && serviceState.tree[0]) || null;
  if (!root || !parentId || !newChildNode) return null;

  const result = findNodeAndParent(root, parentId);
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

/**
 * Traverses a node tree recursively and returns a flat array of all leaf bookmark items.
 * @param {Array|object} nodes - Single node or array of nodes.
 * @returns {Array<{ title: string, url: string }>}
 */
function flattenBookmarks(nodes) {
  let flatList = [];
  const list = Array.isArray(nodes) ? nodes : (nodes ? [nodes] : []);

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

/**
 * Validates whether a folder ID exists and has a children array in the tree.
 * @param {string} folderId - Target folder ID.
 * @param {Array|null} treeOverride - Optional tree to validate against.
 * @returns {string|null}
 */
function getValidFolderId(folderId, treeOverride = null) {
  const tree = treeOverride || serviceState.tree;
  if (!folderId || !tree || !tree[0]) return null;

  const node = findBookmarkNodeById(tree[0], folderId);
  if (node && Array.isArray(node.children)) {
    return node.id;
  }
  return null;
}

/**
 * Resolves the default parent folder ID for bookmark creation.
 * @returns {string|null}
 */
function getDefaultBookmarkParentId() {
  const currentGrid = treeDelegates.getCurrentGridFolderNode ? treeDelegates.getCurrentGridFolderNode() : null;
  if (currentGrid && currentGrid.id) {
    return currentGrid.id;
  }

  const lastUsedId = treeDelegates.getLastUsedBookmarkFolderId ? treeDelegates.getLastUsedBookmarkFolderId() : null;
  const validStored = getValidFolderId(lastUsedId);
  if (validStored) {
    return validStored;
  }

  const activeId = treeDelegates.getActiveHomebaseFolderId ? treeDelegates.getActiveHomebaseFolderId() : null;
  return activeId || null;
}

// Controller Object Export
const HomebaseBookmarkTreeService = {
  state: serviceState,
  configure: configureBookmarkTreeService,
  getBookmarkTree,
  getTree: () => serviceState.tree,
  setTree: (tree) => {
    serviceState.tree = Array.isArray(tree) ? tree : [];
  },
  clearTreeCache: () => {
    serviceState.tree = [];
    bookmarkTreeFetchPromise = null;
  },
  findBookmarkNodeById,
  findNodeAndParent,
  updateNodeInTree,
  appendNodeToParent,
  flattenBookmarks,
  getValidFolderId,
  getDefaultBookmarkParentId
};

// Global backward-compatibility bridges on window
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

  // Bidirectional getter/setter for window.bookmarkTree
  try {
    Object.defineProperty(window, 'bookmarkTree', {
      get: () => serviceState.tree,
      set: (val) => {
        serviceState.tree = Array.isArray(val) ? val : [];
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    window.bookmarkTree = serviceState.tree;
  }
}
