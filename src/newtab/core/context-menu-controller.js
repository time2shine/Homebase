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
  let _initialized = false;

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

    reposition(menu, clientX, clientY, { ...opts, show: true });
    _activeMenu = menu;
    return menu;
  }

  function handleAction(actionName, payload = {}) {
    hide();
    const handler = _actionHandlers[actionName];
    if (typeof handler === 'function') {
      return handler({ ..._contextData, ...payload });
    }
    return null;
  }

  function registerActionHandler(actionName, handler) {
    if (typeof actionName === 'string' && typeof handler === 'function') {
      _actionHandlers[actionName] = handler;
    }
  }

  function initialize(options = {}) {
    if (typeof window !== 'undefined' && options.bindGlobalListeners !== false) {
      window.addEventListener('click', hide);
      window.addEventListener('blur', hide);
    }

    if (typeof document !== 'undefined') {
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
    getContextData: () => ({ ..._contextData }),
    setContextData: (data) => { Object.assign(_contextData, data); },
    getActiveMenu: () => _activeMenu
  };

  if (typeof window !== 'undefined') {
    window.HomebaseContextMenuController = HomebaseContextMenuController;
  }
})();
