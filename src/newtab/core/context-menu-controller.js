// ===================================================================
// Homebase Context Menu Controller
//
// Manages context menu rendering, positioning, viewport boundary
// clamping, action routing, and dismiss lifecycle across bookmark tabs,
// grid cards, and background surface menus.
// ===================================================================

(function() {
  'use strict';

  let _activeMenu = null;
  let _contextData = {
    itemId: null,
    isFolder: false,
    sourceTile: null,
    extra: {}
  };
  let _actionHandlers = {};
  let _defaultActionHandlers = {};
  let _deps = {};
  let _initialized = false;
  let _listenersAttached = false;

  function ensureMenuMountedToBody(menuEl) {
    if (!menuEl) return;
    if (typeof document !== 'undefined' && document.body && menuEl.parentElement !== document.body) {
      document.body.appendChild(menuEl);
    }
  }

  function reposition(menuEl, clientX, clientY, opts = {}) {
    if (!menuEl) return null;
    ensureMenuMountedToBody(menuEl);

    const margin = Number.isFinite(opts.margin) ? opts.margin : 8;
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;
    const viewportWidth = (docEl && docEl.clientWidth) || (typeof window !== 'undefined' ? window.innerWidth : 0) || 0;
    const viewportHeight = (docEl && docEl.clientHeight) || (typeof window !== 'undefined' ? window.innerHeight : 0) || 0;

    const wasHidden = menuEl.classList ? menuEl.classList.contains('hidden') : false;
    const prevVisibility = menuEl.style ? menuEl.style.visibility : '';
    const prevDisplay = menuEl.style ? menuEl.style.display : '';
    const prevPointerEvents = menuEl.style ? menuEl.style.pointerEvents : '';

    if (wasHidden && menuEl.classList) {
      menuEl.classList.remove('hidden');
    }

    if (menuEl.style) {
      menuEl.style.visibility = 'hidden';
      menuEl.style.pointerEvents = 'none';
    }

    const computedDisplay = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(menuEl).display
      : 'flex';
    if (computedDisplay === 'none' && menuEl.style) {
      menuEl.style.display = 'flex';
    }

    const rect = menuEl.getBoundingClientRect ? menuEl.getBoundingClientRect() : { width: 0, height: 0 };
    const menuWidth = rect.width || 0;
    const menuHeight = rect.height || 0;

    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
    const left = Math.min(Math.max(clientX, margin), maxLeft);
    const top = Math.min(Math.max(clientY, margin), maxTop);

    if (menuEl.style) {
      menuEl.style.visibility = prevVisibility;
      menuEl.style.display = prevDisplay;
      menuEl.style.pointerEvents = prevPointerEvents;
      menuEl.style.left = `${left}px`;
      menuEl.style.top = `${top}px`;
    }

    if (opts.show === true && menuEl.classList) {
      menuEl.classList.remove('hidden');
    } else if (wasHidden && menuEl.classList) {
      menuEl.classList.add('hidden');
    }

    return { left, top, width: menuWidth, height: menuHeight };
  }

  function hide() {
    if (typeof document === 'undefined') return;

    const menus = [
      document.getElementById('bookmark-folder-menu'),
      document.getElementById('bookmark-grid-folder-menu'),
      document.getElementById('bookmark-icon-menu'),
      document.getElementById('bookmark-grid-blank-menu')
    ];

    menus.forEach(menu => {
      if (menu && menu.classList) {
        menu.classList.add('hidden');
      }
    });

    if (document.querySelectorAll) {
      document.querySelectorAll('.context-menu:not(.hidden)').forEach(menu => {
        menu.classList.add('hidden');
      });
    }

    _activeMenu = null;
  }

  function show(menuElOrId, clientX, clientY, contextData = {}, opts = {}) {
    hide();

    let menu = null;
    if (typeof menuElOrId === 'string' && typeof document !== 'undefined') {
      menu = document.getElementById(menuElOrId);
    } else if (menuElOrId) {
      menu = menuElOrId;
    }

    if (!menu) return null;

    _contextData = {
      itemId: contextData.itemId !== undefined ? contextData.itemId : null,
      isFolder: contextData.isFolder !== undefined ? contextData.isFolder : false,
      sourceTile: contextData.sourceTile || null,
      extra: contextData.extra || {}
    };

    if (typeof _deps.onContextChanged === 'function') {
      _deps.onContextChanged({ ..._contextData });
    }

    reposition(menu, clientX, clientY, { ...opts, show: true });
    _activeMenu = menu;
    return menu;
  }

  function handleAction(actionName, payload = {}) {
    hide();
    const data = { ..._contextData, ...payload };
    const customHandler = _actionHandlers[actionName];
    if (typeof customHandler === 'function') {
      return customHandler(data);
    }
    const defaultHandler = _defaultActionHandlers[actionName];
    if (typeof defaultHandler === 'function') {
      return defaultHandler(data);
    }
    return null;
  }

  function registerActionHandler(actionName, handler) {
    if (typeof actionName === 'string' && typeof handler === 'function') {
      _actionHandlers[actionName] = handler;
    }
  }

  function setupDefaultActionHandlers() {
    _defaultActionHandlers = {
      'open': ({ itemId }) => {
        if (_deps.openFolderFromContext) {
          return _deps.openFolderFromContext(itemId);
        }
        if (typeof openFolderFromContext === 'function') {
          return openFolderFromContext(itemId);
        }
      },
      'open-all': ({ itemId }) => {
        if (_deps.openFolderAll) {
          return _deps.openFolderAll(itemId);
        }
        if (typeof openFolderAll === 'function') {
          return openFolderAll(itemId);
        }
      },
      'rename': ({ itemId }) => {
        if (typeof document === 'undefined') return;
        const gridItem = document.querySelector(`.bookmark-item[data-bookmark-id="${itemId}"]`);
        const tree = _deps.getBookmarkTree ? _deps.getBookmarkTree() : (typeof bookmarkTree !== 'undefined' ? bookmarkTree : null);
        const findFn = _deps.findBookmarkNodeById || (typeof findBookmarkNodeById === 'function' ? findBookmarkNodeById : null);
        const node = (tree && tree[0] && findFn) ? findFn(tree[0], itemId) : null;
        const renameFn = _deps.showGridItemRenameInput || (typeof showGridItemRenameInput === 'function' ? showGridItemRenameInput : null);
        if (gridItem && node && renameFn) {
          renameFn(gridItem, node);
        }
      },
      'edit': ({ itemId, isFolder }) => {
        if (isFolder) {
          const tree = _deps.getBookmarkTree ? _deps.getBookmarkTree() : (typeof bookmarkTree !== 'undefined' ? bookmarkTree : null);
          const findFn = _deps.findBookmarkNodeById || (typeof findBookmarkNodeById === 'function' ? findBookmarkNodeById : null);
          const folderNode = (tree && tree[0] && findFn) ? findFn(tree[0], itemId) : null;
          const editFolderFn = _deps.showEditFolderModal || (typeof showEditFolderModal === 'function' ? showEditFolderModal : null);
          if (folderNode && editFolderFn) {
            editFolderFn(folderNode);
          }
        } else {
          const editBookmarkFn = _deps.showEditBookmarkModal || (typeof showEditBookmarkModal === 'function' ? showEditBookmarkModal : null);
          if (editBookmarkFn) {
            editBookmarkFn(itemId);
          }
        }
      },
      'delete': ({ itemId, isFolder, sourceTile }) => {
        const deleteFn = _deps.deleteBookmarkOrFolder || (typeof deleteBookmarkOrFolder === 'function' ? deleteBookmarkOrFolder : null);
        if (deleteFn) {
          deleteFn(itemId, isFolder, sourceTile);
        }
      },
      'move': ({ itemId, isFolder }) => {
        const moveFn = _deps.openMoveBookmarkModal || (typeof openMoveBookmarkModal === 'function' ? openMoveBookmarkModal : null);
        if (moveFn) {
          moveFn(itemId, isFolder);
        }
      },
      'open-new-tab': ({ itemId }) => {
        const openTabFn = _deps.openBookmarkInNewTab || (typeof openBookmarkInNewTab === 'function' ? openBookmarkInNewTab : null);
        if (openTabFn) {
          openTabFn(itemId);
        }
      },
      'create-bookmark': () => {
        const fn = _deps.showAddBookmarkModal || (typeof showAddBookmarkModal === 'function' ? showAddBookmarkModal : null);
        if (fn) fn();
      },
      'bookmark': () => {
        const fn = _deps.showAddBookmarkModal || (typeof showAddBookmarkModal === 'function' ? showAddBookmarkModal : null);
        if (fn) fn();
      },
      'create-folder': () => {
        const fn = _deps.showAddFolderModal || (typeof showAddFolderModal === 'function' ? showAddFolderModal : null);
        if (fn) fn();
      },
      'folder': () => {
        const fn = _deps.showAddFolderModal || (typeof showAddFolderModal === 'function' ? showAddFolderModal : null);
        if (fn) fn();
      },
      'paste': () => {
        const fn = _deps.handlePasteBookmark || (typeof handlePasteBookmark === 'function' ? handlePasteBookmark : null);
        if (fn) fn();
      },
      'sort-name': () => {
        const fn = _deps.sortCurrentFolderByName || (typeof sortCurrentFolderByName === 'function' ? sortCurrentFolderByName : null);
        if (fn) fn();
      },
      'manage': () => {}
    };
  }

  function attachEventListeners(options = {}) {
    if (typeof window !== 'undefined' && options.bindGlobalListeners !== false) {
      window.addEventListener('click', hide);
      window.addEventListener('blur', hide);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _activeMenu) {
          hide();
        }
      });
    }

    if (typeof document === 'undefined') return;

    const knownMenus = [
      document.getElementById('bookmark-folder-menu'),
      document.getElementById('bookmark-grid-folder-menu'),
      document.getElementById('bookmark-icon-menu'),
      document.getElementById('bookmark-grid-blank-menu')
    ];

    knownMenus.forEach(menu => {
      if (!menu) return;
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    const bookmarksGrid = document.getElementById('bookmarks-grid');
    if (bookmarksGrid) {
      bookmarksGrid.addEventListener('contextmenu', (e) => {
        if (e.target.closest && e.target.closest('.grid-item-rename-input')) return;
        const item = e.target.closest ? e.target.closest('.bookmark-item') : null;
        if (!item || (item.classList && item.classList.contains('back-button'))) return;

        e.preventDefault();
        e.stopPropagation();
        hide();

        const isFolder = item.dataset && item.dataset.isFolder === 'true';
        const nodeId = (item.dataset && item.dataset.bookmarkId) || null;

        _contextData = {
          itemId: nodeId,
          isFolder,
          sourceTile: item,
          extra: {}
        };

        if (typeof _deps.onContextChanged === 'function') {
          _deps.onContextChanged({ ..._contextData });
        }

        const targetMenuId = isFolder ? 'bookmark-grid-folder-menu' : 'bookmark-icon-menu';
        const targetMenu = document.getElementById(targetMenuId);
        if (!targetMenu) return;

        const isContainerEnabled = typeof _deps.isContainerModeEnabled === 'function'
          ? _deps.isContainerModeEnabled()
          : (typeof appContainerModePreference !== 'undefined' ? Boolean(appContainerModePreference) : false);

        const popContainerFn = _deps.populateContainerMenu || (typeof populateContainerMenu === 'function' ? populateContainerMenu : null);

        if (isContainerEnabled && popContainerFn) {
          popContainerFn(nodeId, isFolder);
        } else {
          const iconGroup = document.getElementById('context-menu-container-group');
          const folderGroup = document.getElementById('folder-context-container-group');
          if (iconGroup && iconGroup.classList) iconGroup.classList.add('hidden');
          if (folderGroup && folderGroup.classList) folderGroup.classList.add('hidden');
        }

        show(targetMenu, e.clientX, e.clientY, _contextData);
      });
    }

    const gridBlankMenu = document.getElementById('bookmark-grid-blank-menu');
    if (gridBlankMenu) {
      document.addEventListener('contextmenu', (e) => {
        if (!e.target || !e.target.closest) return;
        if (
          e.target.closest('.bookmark-item') ||
          e.target.closest('.sidebar') ||
          e.target.closest('.dock') ||
          e.target.closest('.widget-search') ||
          e.target.closest('.search-toolbar-buttons') ||
          e.target.closest('.modal-overlay:not(.hidden)') ||
          ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(e.target.tagName)
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        hide();
        show(gridBlankMenu, e.clientX, e.clientY);
      });

      const gridMenuCreateBookmarkBtn = document.getElementById('grid-menu-create-bookmark');
      const gridMenuCreateFolderBtn = document.getElementById('grid-menu-create-folder');
      const gridMenuManageBtn = document.getElementById('grid-menu-manage');
      const gridMenuPasteBtn = document.getElementById('grid-menu-paste');
      const gridMenuSortNameBtn = document.getElementById('grid-menu-sort-name');

      if (gridMenuCreateBookmarkBtn) {
        gridMenuCreateBookmarkBtn.addEventListener('click', () => handleAction('bookmark'));
      }
      if (gridMenuCreateFolderBtn) {
        gridMenuCreateFolderBtn.addEventListener('click', () => handleAction('folder'));
      }
      if (gridMenuManageBtn) {
        gridMenuManageBtn.addEventListener('click', () => handleAction('manage'));
      }
      if (gridMenuPasteBtn) {
        gridMenuPasteBtn.addEventListener('click', () => handleAction('paste'));
      }
      if (gridMenuSortNameBtn) {
        gridMenuSortNameBtn.addEventListener('click', () => handleAction('sort-name'));
      }
    }

    const gridFolderMenu = document.getElementById('bookmark-grid-folder-menu');
    if (gridFolderMenu) {
      gridFolderMenu.addEventListener('click', (e) => {
        const button = e.target.closest ? e.target.closest('button.menu-item') : null;
        if (!button) return;
        e.stopPropagation();
        const action = button.dataset ? button.dataset.action : null;
        if (action) {
          handleAction(action);
        } else {
          hide();
        }
      });
    }

    const iconContextMenu = document.getElementById('bookmark-icon-menu');
    if (iconContextMenu) {
      iconContextMenu.addEventListener('click', (e) => {
        const button = e.target.closest ? e.target.closest('button.menu-item') : null;
        if (!button) return;
        e.stopPropagation();
        const action = button.dataset ? button.dataset.action : null;
        if (action) {
          handleAction(action);
        } else {
          hide();
        }
      });
    }
  }

  function initialize(options = {}) {
    if (options && typeof options === 'object') {
      Object.assign(_deps, options);
    }

    setupDefaultActionHandlers();

    if (!_listenersAttached) {
      attachEventListeners(options);
      _listenersAttached = true;
    }

    _initialized = true;
    return { initialized: true };
  }

  const HomebaseContextMenuController = {
    initialize,
    show,
    hide,
    reposition,
    handleAction,
    registerActionHandler,
    ensureMenuMountedToBody,
    attachEventListeners,
    getContextData: () => ({ ..._contextData }),
    setContextData: (data) => { Object.assign(_contextData, data); },
    getActiveMenu: () => _activeMenu
  };

  if (typeof window !== 'undefined') {
    window.HomebaseContextMenuController = HomebaseContextMenuController;
  }
})();
