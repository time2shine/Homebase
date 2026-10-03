// =============================================================================
// Homebase Bookmark Loader Service
// Module: src/newtab/bookmarks/bookmark-loader-service.js
// Handles bookmark subtree discovery, permissions checking, root folder
// fallback resolution, bookmark tree processing, and metadata synchronization.
// =============================================================================

(function() {
  'use strict';

  let _allBookmarks = [];
  let _rootDisplayFolderId = null;
  let _bookmarkMetadata = {};
  let _folderMetadata = {};
  let _lastUsedBookmarkFolderId = null;

  function getBrowserApi() {
    if (typeof browser !== 'undefined' && browser.bookmarks) return browser;
    if (typeof window !== 'undefined' && window.browser && window.browser.bookmarks) return window.browser;
    if (typeof chrome !== 'undefined' && chrome.bookmarks) return chrome;
    if (typeof window !== 'undefined' && window.chrome && window.chrome.bookmarks) return window.chrome;
    return null;
  }

  function resolveUiState() {
    return (typeof window !== 'undefined' && window.HomebaseBookmarkUiState) || null;
  }

  function resolveTreeService() {
    return (typeof window !== 'undefined' && window.HomebaseBookmarkTreeService) || null;
  }

  function resolveRootController() {
    return (typeof window !== 'undefined' && window.HomebaseBookmarkRootController) || null;
  }

  function resolveGridController() {
    return (typeof window !== 'undefined' && window.HomebaseBookmarkGridController) || null;
  }

  function resolveStorage() {
    return (typeof window !== 'undefined' && window.HomebaseBookmarkStorage) || null;
  }

  function recordPerfTime(label, start) {
    if (typeof hbPerfTime === 'function') {
      hbPerfTime(label, start);
    } else if (typeof window !== 'undefined' && typeof window.hbPerfTime === 'function') {
      window.hbPerfTime(label, start);
    }
  }

  function processBookmarks(nodes, activeFolderId = null, rootNodeOverride = null) {
    const rootNode = rootNodeOverride || (nodes && nodes[0]) || null;

    if (!rootNode) {
      console.warn('Bookmark tree is empty or malformed.');
      const uiState = resolveUiState();
      if (uiState && typeof uiState.showBookmarksEmptyState === 'function') {
        uiState.showBookmarksEmptyState();
      } else if (typeof showBookmarksEmptyState === 'function') {
        showBookmarksEmptyState();
      } else if (typeof window !== 'undefined' && typeof window.showBookmarksEmptyState === 'function') {
        window.showBookmarksEmptyState();
      }
      return;
    }

    const treeService = resolveTreeService();
    if (treeService && typeof treeService.flattenBookmarks === 'function') {
      _allBookmarks = treeService.flattenBookmarks([rootNode]);
    } else if (typeof flattenBookmarks === 'function') {
      _allBookmarks = flattenBookmarks([rootNode]);
    } else if (typeof window !== 'undefined' && typeof window.flattenBookmarks === 'function') {
      _allBookmarks = window.flattenBookmarks([rootNode]);
    } else {
      _allBookmarks = [];
    }

    _rootDisplayFolderId = rootNode.id;

    if (typeof window !== 'undefined') {
      window.allBookmarks = _allBookmarks;
      window.rootDisplayFolderId = _rootDisplayFolderId;
    }

    const uiState = resolveUiState();
    if (uiState && typeof uiState.hideBookmarksEmptyState === 'function') {
      uiState.hideBookmarksEmptyState();
    } else if (typeof hideBookmarksEmptyState === 'function') {
      hideBookmarksEmptyState();
    } else if (typeof window !== 'undefined' && typeof window.hideBookmarksEmptyState === 'function') {
      window.hideBookmarksEmptyState();
    }

    if (uiState && typeof uiState.showBookmarksUI === 'function') {
      uiState.showBookmarksUI();
    } else if (typeof showBookmarksUI === 'function') {
      showBookmarksUI();
    } else if (typeof window !== 'undefined' && typeof window.showBookmarksUI === 'function') {
      window.showBookmarksUI();
    }

    const gridController = resolveGridController();
    if (gridController && typeof gridController.createFolderTabs === 'function') {
      gridController.createFolderTabs(rootNode, activeFolderId);
    } else if (typeof createFolderTabs === 'function') {
      createFolderTabs(rootNode, activeFolderId);
    } else if (typeof window !== 'undefined' && typeof window.createFolderTabs === 'function') {
      window.createFolderTabs(rootNode, activeFolderId);
    }
  }

  async function loadBookmarkMetadata() {
    try {
      const storage = resolveStorage();
      if (storage && typeof storage.getBookmarkMetadata === 'function') {
        _bookmarkMetadata = (await storage.getBookmarkMetadata()) || {};
      } else if (typeof getBookmarkMetadata === 'function') {
        _bookmarkMetadata = (await getBookmarkMetadata()) || {};
      } else if (typeof window !== 'undefined' && typeof window.getBookmarkMetadata === 'function') {
        _bookmarkMetadata = (await window.getBookmarkMetadata()) || {};
      } else {
        _bookmarkMetadata = {};
      }
    } catch (e) {
      console.warn('Failed to load bookmark metadata', e);
      _bookmarkMetadata = {};
    }
    if (typeof window !== 'undefined') {
      window.bookmarkMetadata = _bookmarkMetadata;
    }
    return _bookmarkMetadata;
  }

  async function loadLastUsedFolderId() {
    try {
      const storage = resolveStorage();
      if (storage && typeof storage.getLastUsedFolderId === 'function') {
        _lastUsedBookmarkFolderId = (await storage.getLastUsedFolderId()) || null;
      } else if (typeof getLastUsedFolderId === 'function') {
        _lastUsedBookmarkFolderId = (await getLastUsedFolderId()) || null;
      } else if (typeof window !== 'undefined' && typeof window.getLastUsedFolderId === 'function') {
        _lastUsedBookmarkFolderId = (await window.getLastUsedFolderId()) || null;
      } else {
        _lastUsedBookmarkFolderId = null;
      }
    } catch (e) {
      console.warn('Failed to load last used bookmark folder id', e);
      _lastUsedBookmarkFolderId = null;
    }
    if (typeof window !== 'undefined') {
      window.lastUsedBookmarkFolderId = _lastUsedBookmarkFolderId;
    }
    return _lastUsedBookmarkFolderId;
  }

  async function setLastUsedFolderId(id) {
    _lastUsedBookmarkFolderId = id || null;
    if (typeof window !== 'undefined') {
      window.lastUsedBookmarkFolderId = _lastUsedBookmarkFolderId;
    }
    try {
      const storage = resolveStorage();
      if (storage && typeof storage.setLastUsedFolderId === 'function') {
        await storage.setLastUsedFolderId(_lastUsedBookmarkFolderId);
      } else if (typeof setBookmarkLastUsedFolderId === 'function') {
        await setBookmarkLastUsedFolderId(_lastUsedBookmarkFolderId);
      } else if (typeof window !== 'undefined' && typeof window.setBookmarkLastUsedFolderId === 'function') {
        await window.setBookmarkLastUsedFolderId(_lastUsedBookmarkFolderId);
      }
    } catch (e) {
      console.warn('Failed to persist last used folder id', e);
    }
    return _lastUsedBookmarkFolderId;
  }

  async function loadFolderMetadata() {
    try {
      const storage = resolveStorage();
      if (storage && typeof storage.getFolderMetadata === 'function') {
        _folderMetadata = (await storage.getFolderMetadata()) || {};
      } else if (typeof getFolderMetadata === 'function') {
        _folderMetadata = (await getFolderMetadata()) || {};
      } else if (typeof window !== 'undefined' && typeof window.getFolderMetadata === 'function') {
        _folderMetadata = (await window.getFolderMetadata()) || {};
      } else {
        _folderMetadata = {};
      }
    } catch (e) {
      console.warn('Failed to load folder metadata', e);
      _folderMetadata = {};
    }
    if (typeof window !== 'undefined') {
      window.folderMetadata = _folderMetadata;
    }
    return _folderMetadata;
  }

  async function loadBookmarks(activeFolderId = null) {
    const loadBookmarksStart =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;

    const uiState = resolveUiState();
    if (uiState && typeof uiState.beginBookmarksBoot === 'function') {
      uiState.beginBookmarksBoot();
    } else if (typeof beginBookmarksBoot === 'function') {
      beginBookmarksBoot();
    } else if (typeof window !== 'undefined' && typeof window.beginBookmarksBoot === 'function') {
      window.beginBookmarksBoot();
    }

    const browserApi = getBrowserApi();
    if (!browserApi || !browserApi.bookmarks) {
      console.warn('Bookmarks API not available.');
      if (uiState && typeof uiState.showBookmarksEmptyState === 'function') {
        uiState.showBookmarksEmptyState('Bookmarks permission unavailable.');
      } else if (typeof showBookmarksEmptyState === 'function') {
        showBookmarksEmptyState('Bookmarks permission unavailable.');
      } else if (typeof window !== 'undefined' && typeof window.showBookmarksEmptyState === 'function') {
        window.showBookmarksEmptyState('Bookmarks permission unavailable.');
      }
      return;
    }

    try {
      let rootNode = null;
      const rootController = resolveRootController();
      const storage = resolveStorage();

      let storedRootId = null;
      if (storage && typeof storage.getHomebaseRootId === 'function') {
        storedRootId = await storage.getHomebaseRootId();
      } else if (rootController && typeof rootController.getHomebaseRootId === 'function') {
        storedRootId = await rootController.getHomebaseRootId();
      } else if (typeof getHomebaseRootId === 'function') {
        storedRootId = await getHomebaseRootId();
      } else if (typeof window !== 'undefined' && typeof window.getHomebaseRootId === 'function') {
        storedRootId = await window.getHomebaseRootId();
      }

      if (storedRootId) {
        const subTreeStart =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : 0;

        if (rootController && typeof rootController.getStoredHomebaseRootSubTree === 'function') {
          rootNode = await rootController.getStoredHomebaseRootSubTree(storedRootId);
        } else if (typeof getStoredHomebaseRootSubTree === 'function') {
          rootNode = await getStoredHomebaseRootSubTree(storedRootId);
        } else if (typeof window !== 'undefined' && typeof window.getStoredHomebaseRootSubTree === 'function') {
          rootNode = await window.getStoredHomebaseRootSubTree(storedRootId);
        }

        const lastResolvedSubTree = window.HomebaseBookmarkRootController?.getLastResolvedSubTree();
        if (lastResolvedSubTree) {
          try {
            if (typeof bookmarkTree !== 'undefined') {
              bookmarkTree = lastResolvedSubTree;
            }
          } catch (_) {}
          if (typeof window !== 'undefined') {
            window.bookmarkTree = lastResolvedSubTree;
          }
        }
        recordPerfTime('bookmarks getSubTree', subTreeStart);
      }

      if (!rootNode) {
        const treeStart =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : 0;

        let tree = null;
        const treeService = resolveTreeService();
        if (treeService && typeof treeService.getBookmarkTree === 'function') {
          tree = await treeService.getBookmarkTree(true);
        } else if (typeof getBookmarkTree === 'function') {
          tree = await getBookmarkTree(true);
        } else if (typeof window !== 'undefined' && typeof window.getBookmarkTree === 'function') {
          tree = await window.getBookmarkTree(true);
        }
        recordPerfTime('bookmarks getBookmarkTree', treeStart);

        const treeRoot = tree && tree[0];
        if (!treeRoot) {
          console.warn('Bookmark tree is empty.');
          if (uiState && typeof uiState.showBookmarksEmptyState === 'function') {
            uiState.showBookmarksEmptyState();
          } else if (typeof showBookmarksEmptyState === 'function') {
            showBookmarksEmptyState();
          } else if (typeof window !== 'undefined' && typeof window.showBookmarksEmptyState === 'function') {
            window.showBookmarksEmptyState();
          }
          return;
        }

        if (rootController && typeof rootController.findHomebaseUnderOtherBookmarks === 'function') {
          rootNode = rootController.findHomebaseUnderOtherBookmarks(treeRoot);
        } else if (typeof findHomebaseUnderOtherBookmarks === 'function') {
          rootNode = findHomebaseUnderOtherBookmarks(treeRoot);
        } else if (typeof window !== 'undefined' && typeof window.findHomebaseUnderOtherBookmarks === 'function') {
          rootNode = window.findHomebaseUnderOtherBookmarks(treeRoot);
        }

        if (rootNode && rootNode.id) {
          if (storage && typeof storage.setHomebaseRootId === 'function') {
            await storage.setHomebaseRootId(rootNode.id);
          } else if (rootController && typeof rootController.setHomebaseRootId === 'function') {
            await rootController.setHomebaseRootId(rootNode.id);
          } else if (typeof setHomebaseRootId === 'function') {
            await setHomebaseRootId(rootNode.id);
          } else if (typeof window !== 'undefined' && typeof window.setHomebaseRootId === 'function') {
            await window.setHomebaseRootId(rootNode.id);
          }
        } else {
          console.warn('Homebase folder not found under Other Bookmarks.');
        }
      }

      if (!rootNode) {
        if (uiState && typeof uiState.showBookmarksEmptyState === 'function') {
          uiState.showBookmarksEmptyState();
        } else if (typeof showBookmarksEmptyState === 'function') {
          showBookmarksEmptyState();
        } else if (typeof window !== 'undefined' && typeof window.showBookmarksEmptyState === 'function') {
          window.showBookmarksEmptyState();
        }
        return;
      }

      if (uiState && typeof uiState.hideBookmarksEmptyState === 'function') {
        uiState.hideBookmarksEmptyState();
      } else if (typeof hideBookmarksEmptyState === 'function') {
        hideBookmarksEmptyState();
      } else if (typeof window !== 'undefined' && typeof window.hideBookmarksEmptyState === 'function') {
        window.hideBookmarksEmptyState();
      }

      if (uiState && typeof uiState.showBookmarksUI === 'function') {
        uiState.showBookmarksUI();
      } else if (typeof showBookmarksUI === 'function') {
        showBookmarksUI();
      } else if (typeof window !== 'undefined' && typeof window.showBookmarksUI === 'function') {
        window.showBookmarksUI();
      }

      const processStart =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : 0;
      processBookmarks([rootNode], activeFolderId, rootNode);
      recordPerfTime('bookmarks process/render request', processStart);

    } catch (err) {
      console.warn('Failed to load bookmarks', err);
      if (uiState && typeof uiState.showBookmarksEmptyState === 'function') {
        uiState.showBookmarksEmptyState('Bookmarks permission unavailable.');
      } else if (typeof showBookmarksEmptyState === 'function') {
        showBookmarksEmptyState('Bookmarks permission unavailable.');
      } else if (typeof window !== 'undefined' && typeof window.showBookmarksEmptyState === 'function') {
        window.showBookmarksEmptyState('Bookmarks permission unavailable.');
      }
    } finally {
      if (uiState && typeof uiState.endBookmarksBoot === 'function') {
        uiState.endBookmarksBoot();
      } else if (typeof endBookmarksBoot === 'function') {
        endBookmarksBoot();
      } else if (typeof window !== 'undefined' && typeof window.endBookmarksBoot === 'function') {
        window.endBookmarksBoot();
      }
      recordPerfTime('loadBookmarks function total', loadBookmarksStart);
    }
  }

  const HomebaseBookmarkLoader = {
    loadBookmarks,
    processBookmarks,
    loadBookmarkMetadata,
    loadFolderMetadata,
    loadLastUsedFolderId,
    setLastUsedFolderId,
    getAllBookmarks: () => _allBookmarks,
    getRootDisplayFolderId: () => _rootDisplayFolderId
  };

  if (typeof window !== 'undefined') {
    window.HomebaseBookmarkLoader = HomebaseBookmarkLoader;
    window.loadBookmarks = loadBookmarks;
    window.processBookmarks = processBookmarks;
    window.loadBookmarkMetadata = loadBookmarkMetadata;
    window.loadFolderMetadata = loadFolderMetadata;
    window.loadLastUsedFolderId = loadLastUsedFolderId;
    window.setLastUsedFolderId = setLastUsedFolderId;
  }
})();
