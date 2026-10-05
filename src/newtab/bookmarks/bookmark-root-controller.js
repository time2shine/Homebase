// Bookmark Root Controller
// Manages Homebase root folder discovery, creation, subtree verification,
// root UI controls, browser bookmark event observers, and cache invalidation.

let isRootListenersBound = false;
let lastResolvedSubTree = null;

/**
 * Traverses parent's child list to find a subfolder matching title.
 *
 * @param {Object} parentNode
 * @param {string} titleLower
 * @returns {Object|null}
 */
function findChildFolderByTitle(parentNode, titleLower) {
  if (!parentNode || !parentNode.children) return null;
  return parentNode.children.find(
    (child) => child && child.children && (child.title || '').toLowerCase() === titleLower
  ) || null;
}

/**
 * Finds existing child folder by title or creates one.
 *
 * @param {string} parentId
 * @param {string} title
 * @returns {Promise<Object|null>}
 */
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

/**
 * Finds existing child bookmark by URL/title or creates one.
 *
 * @param {string} parentId
 * @param {string} title
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
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

/**
 * Resolves the "Other Bookmarks" node cross-browser:
 * - Firefox unfiled bookmarks ID: 'unfiled_____'
 * - Chrome other bookmarks ID: '2'
 * - Fallback: folder title matching 'other bookmarks'
 *
 * @param {Array} rootChildren
 * @returns {Object|null}
 */
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

/**
 * Finds the "Homebase" folder located under "Other Bookmarks".
 *
 * @param {Object} treeRoot
 * @returns {Object|null}
 */
function findHomebaseUnderOtherBookmarks(treeRoot) {
  if (!treeRoot || !treeRoot.children) return null;
  const other = getOtherBookmarksNode(treeRoot.children);
  if (!other || !other.children) return null;
  return findChildFolderByTitle(other, 'homebase');
}

/**
 * Helper to read stored Homebase root ID defensively.
 *
 * @returns {Promise<string>}
 */
async function getRootIdStorage() {
  if (typeof getHomebaseRootId === 'function') {
    return await getHomebaseRootId();
  }
  if (typeof window !== 'undefined' && window.HomebaseBookmarkStorage && typeof window.HomebaseBookmarkStorage.getHomebaseRootId === 'function') {
    return await window.HomebaseBookmarkStorage.getHomebaseRootId();
  }
  return '';
}

/**
 * Helper to persist stored Homebase root ID defensively.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
async function setRootIdStorage(id) {
  if (typeof setHomebaseRootId === 'function') {
    return await setHomebaseRootId(id);
  }
  if (typeof window !== 'undefined' && window.HomebaseBookmarkStorage && typeof window.HomebaseBookmarkStorage.setHomebaseRootId === 'function') {
    return await window.HomebaseBookmarkStorage.setHomebaseRootId(id);
  }
}

/**
 * Helper to clear stored Homebase root ID defensively.
 *
 * @returns {Promise<void>}
 */
async function clearRootIdStorage() {
  if (typeof clearHomebaseRootId === 'function') {
    return await clearHomebaseRootId();
  }
  if (typeof window !== 'undefined' && window.HomebaseBookmarkStorage && typeof window.HomebaseBookmarkStorage.clearHomebaseRootId === 'function') {
    return await window.HomebaseBookmarkStorage.clearHomebaseRootId();
  }
}

/**
 * Validates and retrieves stored Homebase root subtree.
 * Clears stored root ID if deleted or invalid.
 *
 * @param {string} storedRootId
 * @param {Object} [options]
 * @returns {Promise<Object|null>} Root node or null
 */
async function getStoredHomebaseRootSubTree(storedRootId, options = {}) {
  const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
  if (!storedRootId || !api || typeof api.getSubTree !== 'function') {
    return null;
  }

  try {
    const subTree = await api.getSubTree(storedRootId);
    const rootNode = Array.isArray(subTree) ? subTree[0] : null;

    if (!rootNode || rootNode.url) {
      await clearRootIdStorage();
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
      // In case bookmarkTree is not in lexical scope
    }
    return rootNode;
  } catch (err) {
    console.warn('Stored Homebase root ID is invalid; falling back to full bookmark tree lookup.', err);
    if (typeof recordPerfFallback === 'function') {
      recordPerfFallback('bookmarks', 'Invalid bookmark root ID');
    } else if (typeof window !== 'undefined' && typeof window.recordPerfFallback === 'function') {
      window.recordPerfFallback('bookmarks', 'Invalid bookmark root ID');
    }
    await clearRootIdStorage();
    return null;
  }
}

/**
 * Creates default "Homebase" folder and starter bookmarks under "Other Bookmarks".
 *
 * @returns {Promise<void>}
 */
async function createHomebaseFolder() {
  const api = typeof browser !== 'undefined' && browser.bookmarks ? browser.bookmarks : null;
  if (!api) {
    if (typeof showBookmarksEmptyState === 'function') {
      showBookmarksEmptyState('Bookmarks permission unavailable.');
    }
    return;
  }

  if (typeof beginBookmarksBoot === 'function') {
    beginBookmarksBoot();
  }

  try {
    const getTree = typeof getBookmarkTree === 'function'
      ? getBookmarkTree
      : (typeof window !== 'undefined' ? window.getBookmarkTree : null);
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

    await setRootIdStorage(homebaseFolder.id);
    if (typeof loadBookmarks === 'function') {
      await loadBookmarks();
    }
  } catch (err) {
    console.warn('Failed to create Homebase folder', err);
    if (typeof showBookmarksEmptyState === 'function') {
      showBookmarksEmptyState('Bookmarks permission unavailable.');
    }
  } finally {
    if (typeof endBookmarksBoot === 'function') {
      endBookmarksBoot();
    }
  }
}

/**
 * Binds click events to the root folder controls.
 */
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

/**
 * Binds browser bookmark mutation listeners (create, change, move, remove)
 * to invalidate the folder index cache and detect root folder deletion.
 */
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
        const storedRootId = await getRootIdStorage();

        if (storedRootId && id === storedRootId) {
          await clearRootIdStorage();
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

/**
 * Handles storage changes to reload bookmarks if root ID changes.
 *
 * @param {Object} changes
 * @param {string} area
 */
function handleStorageChange(changes, area) {
  if (area && area !== 'local') return;
  const rootKey = (typeof window !== 'undefined' && window.HOMEBASE_BOOKMARK_ROOT_ID_KEY) || 'homebaseBookmarkRootId';
  if (changes && changes[rootKey]) {
    if (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function') {
      window.loadBookmarks();
    } else if (typeof loadBookmarks === 'function') {
      loadBookmarks();
    } else if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
      window.HomebaseBookmarkLoader.loadBookmarks();
    }
  }
}

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
    getLastResolvedSubTree: () => lastResolvedSubTree,
    isRootListenersBound: () => isRootListenersBound
  };
}
