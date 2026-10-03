// Bookmark Editor Adapter
// Manages lazy-loading of assets/js/bookmark-editor.js, context construction,
// and modal routing for add, edit, move, and delete dialogs.

let bookmarkEditorPromise = null;

async function ensureBookmarkEditor() {
  if (
    typeof window !== 'undefined' &&
    window.HomebaseBookmarkEditor &&
    typeof window.HomebaseBookmarkEditor.openAddBookmark === 'function'
  ) {
    return window.HomebaseBookmarkEditor;
  }

  if (bookmarkEditorPromise) {
    return bookmarkEditorPromise;
  }

  bookmarkEditorPromise = (async () => {
    if (typeof loadScriptOnce === 'function') {
      await loadScriptOnce('assets/js/bookmark-editor.js');
    } else if (typeof window !== 'undefined' && typeof window.loadScriptOnce === 'function') {
      await window.loadScriptOnce('assets/js/bookmark-editor.js');
    } else if (typeof document !== 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/js/bookmark-editor.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err || new Error('Failed to load bookmark editor script'));
        document.head.appendChild(script);
      });
    }

    if (
      typeof window === 'undefined' ||
      !window.HomebaseBookmarkEditor ||
      typeof window.HomebaseBookmarkEditor.openAddBookmark !== 'function'
    ) {
      throw new Error('HomebaseBookmarkEditor failed to load');
    }

    return window.HomebaseBookmarkEditor;
  })().catch((err) => {
    bookmarkEditorPromise = null;
    throw err;
  });

  return bookmarkEditorPromise;
}

function createBookmarkEditorContext() {
  return {
    getActiveHomebaseFolderId: () => {
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getActiveHomebaseFolderId === 'function') {
        const id = window.HomebaseBookmarkGridController.getActiveHomebaseFolderId();
        if (id) return id;
      }
      if (typeof activeHomebaseFolderId !== 'undefined' && activeHomebaseFolderId) return activeHomebaseFolderId;
      if (typeof window !== 'undefined' && window.activeHomebaseFolderId) return window.activeHomebaseFolderId;
      return null;
    },
    getRootDisplayFolderId: () => {
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getRootDisplayFolderId === 'function') {
        const id = window.HomebaseBookmarkGridController.getRootDisplayFolderId();
        if (id) return id;
      }
      if (typeof rootDisplayFolderId !== 'undefined' && rootDisplayFolderId) return rootDisplayFolderId;
      if (typeof window !== 'undefined' && window.rootDisplayFolderId) return window.rootDisplayFolderId;
      return null;
    },
    getCurrentGridFolderNode: () => {
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
        return window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
      }
      if (typeof currentGridFolderNode !== 'undefined') return currentGridFolderNode;
      if (typeof window !== 'undefined' && typeof window.currentGridFolderNode !== 'undefined') return window.currentGridFolderNode;
      return null;
    },
    getBookmarkTreeState: () => {
      if (typeof bookmarkTree !== 'undefined') return bookmarkTree;
      if (typeof window !== 'undefined' && typeof window.bookmarkTree !== 'undefined') return window.bookmarkTree;
      return null;
    },
    getBookmarkMetadata: () => {
      if (typeof bookmarkMetadata !== 'undefined') return bookmarkMetadata;
      if (typeof window !== 'undefined' && typeof window.bookmarkMetadata !== 'undefined') return window.bookmarkMetadata;
      return {};
    },
    setBookmarkMetadata: (metadata) => {
      const nextMeta = metadata || {};
      try {
        if (typeof bookmarkMetadata !== 'undefined') {
          bookmarkMetadata = nextMeta;
        }
      } catch (_) {}
      if (typeof window !== 'undefined') {
        window.bookmarkMetadata = nextMeta;
      }
    },
    getFolderMetadata: () => {
      if (typeof folderMetadata !== 'undefined') return folderMetadata;
      if (typeof window !== 'undefined' && typeof window.folderMetadata !== 'undefined') return window.folderMetadata;
      return {};
    },
    setFolderMetadata: (metadata) => {
      const nextMeta = metadata || {};
      try {
        if (typeof folderMetadata !== 'undefined') {
          folderMetadata = nextMeta;
        }
      } catch (_) {}
      if (typeof window !== 'undefined') {
        window.folderMetadata = nextMeta;
      }
    },
    isVirtualizerEnabled: () => {
      const state = typeof virtualizerState !== 'undefined' ? virtualizerState : (typeof window !== 'undefined' ? window.virtualizerState : null);
      return Boolean(state && state.isEnabled);
    },
    getBookmarkFolderColorPreference: () => {
      if (typeof appBookmarkFolderColorPreference !== 'undefined') return appBookmarkFolderColorPreference;
      if (typeof window !== 'undefined' && typeof window.appBookmarkFolderColorPreference !== 'undefined') return window.appBookmarkFolderColorPreference;
      return '';
    },
    getBookmarkFallbackColorPreference: () => {
      if (typeof appBookmarkFallbackColorPreference !== 'undefined') return appBookmarkFallbackColorPreference;
      if (typeof window !== 'undefined' && typeof window.appBookmarkFallbackColorPreference !== 'undefined') return window.appBookmarkFallbackColorPreference;
      return '';
    },
    iconCategories: typeof ICON_CATEGORIES !== 'undefined' ? ICON_CATEGORIES : (typeof window !== 'undefined' && typeof window.ICON_CATEGORIES !== 'undefined' ? window.ICON_CATEGORIES : null),
    findBookmarkNodeById: (...args) => (typeof findBookmarkNodeById === 'function' ? findBookmarkNodeById(...args) : (typeof window !== 'undefined' && typeof window.findBookmarkNodeById === 'function' ? window.findBookmarkNodeById(...args) : null)),
    updateNodeInTree: (...args) => (typeof updateNodeInTree === 'function' ? updateNodeInTree(...args) : (typeof window !== 'undefined' && typeof window.updateNodeInTree === 'function' ? window.updateNodeInTree(...args) : null)),
    appendNodeToParent: (...args) => (typeof appendNodeToParent === 'function' ? appendNodeToParent(...args) : (typeof window !== 'undefined' && typeof window.appendNodeToParent === 'function' ? window.appendNodeToParent(...args) : null)),
    getDefaultBookmarkParentId: (...args) => (typeof getDefaultBookmarkParentId === 'function' ? getDefaultBookmarkParentId(...args) : (typeof window !== 'undefined' && typeof window.getDefaultBookmarkParentId === 'function' ? window.getDefaultBookmarkParentId(...args) : null)),
    getBookmarkTree: (...args) => (typeof getBookmarkTree === 'function' ? getBookmarkTree(...args) : (typeof window !== 'undefined' && typeof window.getBookmarkTree === 'function' ? window.getBookmarkTree(...args) : null)),
    renderBookmarkGrid: (...args) => (typeof renderBookmarkGrid === 'function' ? renderBookmarkGrid(...args) : (typeof window !== 'undefined' && typeof window.renderBookmarkGrid === 'function' ? window.renderBookmarkGrid(...args) : null)),
    loadBookmarks: (...args) => (typeof loadBookmarks === 'function' ? loadBookmarks(...args) : (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function' ? window.loadBookmarks(...args) : null)),
    findRenderedGridItemById: (...args) => (typeof findRenderedGridItemById === 'function' ? findRenderedGridItemById(...args) : (typeof window !== 'undefined' && typeof window.findRenderedGridItemById === 'function' ? window.findRenderedGridItemById(...args) : null)),
    updateElementData: (...args) => (typeof updateElementData === 'function' ? updateElementData(...args) : (typeof window !== 'undefined' && typeof window.updateElementData === 'function' ? window.updateElementData(...args) : null)),
    getFaviconUrlForRawUrl: (...args) => (typeof getFaviconUrlForRawUrl === 'function' ? getFaviconUrlForRawUrl(...args) : (typeof window !== 'undefined' && typeof window.getFaviconUrlForRawUrl === 'function' ? window.getFaviconUrlForRawUrl(...args) : '')),
    getDomainKeyFromUrl: (...args) => (typeof getDomainKeyFromUrl === 'function' ? getDomainKeyFromUrl(...args) : (typeof window !== 'undefined' && typeof window.getDomainKeyFromUrl === 'function' ? window.getDomainKeyFromUrl(...args) : '')),
    createSvgIconElement: (...args) => (typeof createSvgIconElement === 'function' ? createSvgIconElement(...args) : (typeof window !== 'undefined' && typeof window.createSvgIconElement === 'function' ? window.createSvgIconElement(...args) : null)),
    tintSvgElement: (...args) => (typeof tintSvgElement === 'function' ? tintSvgElement(...args) : (typeof window !== 'undefined' && typeof window.tintSvgElement === 'function' ? window.tintSvgElement(...args) : null)),
    getComplementaryColor: (...args) => (typeof getComplementaryColor === 'function' ? getComplementaryColor(...args) : (typeof window !== 'undefined' && typeof window.getComplementaryColor === 'function' ? window.getComplementaryColor(...args) : null)),
    renderFolderIconInto: (...args) => (typeof renderFolderIconInto === 'function' ? renderFolderIconInto(...args) : (typeof window !== 'undefined' && typeof window.renderFolderIconInto === 'function' ? window.renderFolderIconInto(...args) : null)),
    renderBookmarkIconInto: (...args) => (typeof renderBookmarkIconInto === 'function' ? renderBookmarkIconInto(...args) : (typeof window !== 'undefined' && typeof window.renderBookmarkIconInto === 'function' ? window.renderBookmarkIconInto(...args) : null)),
    getIconKeyForNode: (...args) => (typeof getIconKeyForNode === 'function' ? getIconKeyForNode(...args) : (typeof window !== 'undefined' && typeof window.getIconKeyForNode === 'function' ? window.getIconKeyForNode(...args) : null)),
    openBookmarkIconPicker: (...args) => (typeof openBookmarkIconPicker === 'function' ? openBookmarkIconPicker(...args) : (typeof window !== 'undefined' && typeof window.openBookmarkIconPicker === 'function' ? window.openBookmarkIconPicker(...args) : null)),
    openModalWithAnimation: (...args) => (typeof openModalWithAnimation === 'function' ? openModalWithAnimation(...args) : (typeof window !== 'undefined' && typeof window.openModalWithAnimation === 'function' ? window.openModalWithAnimation(...args) : null)),
    closeModalWithAnimation: (...args) => (typeof closeModalWithAnimation === 'function' ? closeModalWithAnimation(...args) : (typeof window !== 'undefined' && typeof window.closeModalWithAnimation === 'function' ? window.closeModalWithAnimation(...args) : null)),
    openBookmarkEditorColorPicker: (...args) => (typeof openBookmarkEditorColorPicker === 'function' ? openBookmarkEditorColorPicker(...args) : (typeof window !== 'undefined' && typeof window.openBookmarkEditorColorPicker === 'function' ? window.openBookmarkEditorColorPicker(...args) : null)),
    updateBookmark: (id, changes) => {
      const api = (typeof browser !== 'undefined' && browser.bookmarks) ? browser.bookmarks : (typeof chrome !== 'undefined' && chrome.bookmarks ? chrome.bookmarks : null);
      return api ? api.update(id, changes) : Promise.resolve();
    },
    createBookmark: (details) => {
      const api = (typeof browser !== 'undefined' && browser.bookmarks) ? browser.bookmarks : (typeof chrome !== 'undefined' && chrome.bookmarks ? chrome.bookmarks : null);
      return api ? api.create(details) : Promise.resolve();
    },
    createFolder: (details) => {
      const api = (typeof browser !== 'undefined' && browser.bookmarks) ? browser.bookmarks : (typeof chrome !== 'undefined' && chrome.bookmarks ? chrome.bookmarks : null);
      return api ? api.create(details) : Promise.resolve();
    },
    updateFolder: (id, changes) => {
      const api = (typeof browser !== 'undefined' && browser.bookmarks) ? browser.bookmarks : (typeof chrome !== 'undefined' && chrome.bookmarks ? chrome.bookmarks : null);
      return api ? api.update(id, changes) : Promise.resolve();
    },
    moveNode: (id, changes) => {
      const api = (typeof browser !== 'undefined' && browser.bookmarks) ? browser.bookmarks : (typeof chrome !== 'undefined' && chrome.bookmarks ? chrome.bookmarks : null);
      return api ? api.move(id, changes) : Promise.resolve();
    },
    ...(typeof createBookmarkEditorStorageBridge === 'function'
      ? createBookmarkEditorStorageBridge()
      : (typeof window !== 'undefined' && typeof window.createBookmarkEditorStorageBridge === 'function'
        ? window.createBookmarkEditorStorageBridge()
        : {})),
    setLastUsedFolderId: (...args) => (typeof setLastUsedFolderId === 'function' ? setLastUsedFolderId(...args) : (typeof window !== 'undefined' && typeof window.setLastUsedFolderId === 'function' ? window.setLastUsedFolderId(...args) : null))
  };
}

function notifyBookmarkEditorLoadFailure(err) {
  console.warn('Failed to open bookmark editor', err);
  const message = 'Could not open the bookmark editor. Please try again.';
  if (typeof showCustomAlert === 'function') {
    showCustomAlert(message);
  } else if (typeof window !== 'undefined' && typeof window.showCustomAlert === 'function') {
    window.showCustomAlert(message);
  } else if (typeof alert === 'function') {
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

async function openBookmarkIconPicker(context = {}) {
  try {
    if (typeof loadScriptOnce === 'function') {
      await loadScriptOnce('assets/js/icon-picker.js');
    } else if (typeof window !== 'undefined' && typeof window.loadScriptOnce === 'function') {
      await window.loadScriptOnce('assets/js/icon-picker.js');
    } else if (typeof document !== 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/js/icon-picker.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err || new Error('Failed to load icon picker script'));
        document.head.appendChild(script);
      });
    }

    if (
      typeof window === 'undefined' ||
      !window.HomebaseIconPicker ||
      typeof window.HomebaseIconPicker.open !== 'function'
    ) {
      throw new Error('HomebaseIconPicker failed to load');
    }

    return window.HomebaseIconPicker.open(context);
  } catch (err) {
    console.warn('Failed to open icon picker', err);
    if (typeof alert === 'function') {
      alert('Could not open the icon picker. Please try again.');
    }
    return null;
  }
}

// Controller API and Global Compatibility Bridges
if (typeof window !== 'undefined') {
  window.HomebaseBookmarkEditorAdapter = {
    ensureBookmarkEditor,
    createBookmarkEditorContext,
    notifyBookmarkEditorLoadFailure,
    callBookmarkEditorMethod,
    showAddBookmarkModal,
    showEditBookmarkModal,
    showAddFolderModal,
    showEditFolderModal,
    openMoveBookmarkModal,
    showDeleteConfirm,
    openBookmarkIconPicker
  };

  window.ensureBookmarkEditor = ensureBookmarkEditor;
  window.createBookmarkEditorContext = createBookmarkEditorContext;
  window.notifyBookmarkEditorLoadFailure = notifyBookmarkEditorLoadFailure;
  window.callBookmarkEditorMethod = callBookmarkEditorMethod;
  window.showAddBookmarkModal = showAddBookmarkModal;
  window.showEditBookmarkModal = showEditBookmarkModal;
  window.showAddFolderModal = showAddFolderModal;
  window.showEditFolderModal = showEditFolderModal;
  window.openMoveBookmarkModal = openMoveBookmarkModal;
  window.showDeleteConfirm = showDeleteConfirm;
  window.openBookmarkIconPicker = openBookmarkIconPicker;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ensureBookmarkEditor,
    createBookmarkEditorContext,
    notifyBookmarkEditorLoadFailure,
    callBookmarkEditorMethod,
    showAddBookmarkModal,
    showEditBookmarkModal,
    showAddFolderModal,
    showEditFolderModal,
    openMoveBookmarkModal,
    showDeleteConfirm,
    openBookmarkIconPicker
  };
}
