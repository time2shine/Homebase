/**
 * Homebase Bookmark Drag Controller
 * Orchestrates drag-and-drop interactions for the bookmark grid and folder tabs.
 *
 * Phase 3-B: Grid Drag & Drop Extraction
 * Canonical owner for Grid Sortable configuration, pointer movement raycasting,
 * folder hover delay locking, in-memory tree mutation, and drop dispatch.
 */
(function() {
  'use strict';

  // --- Internal Controller State ---
  let _gridSortable = null;
  let _tabsSortable = null;
  let _isGridDragging = false;
  let _isTabDragging = false;
  let _initialized = false;
  let _options = {};

  // --- Grid Hover & Raycasting State ---
  let _activeTabDropTarget = null;
  let _folderHoverTarget = null;
  let _folderHoverStart = 0;
  let _lastGridDragOverItem = null;
  const FOLDER_HOVER_DELAY_MS = 250;

  // --- Pointer Move Throttling State ---
  let _dragMoveScheduled = false;
  let _lastDragX = 0;
  let _lastDragY = 0;
  let _pointerMoveAttached = false;

  // =========================================================================
  // Helper Functions & Dependency Resolvers
  // =========================================================================

  function safeGetPerfMeasureStart() {
    if (typeof getPerfMeasureStart === 'function') return getPerfMeasureStart();
    if (typeof window !== 'undefined' && typeof window.getPerfMeasureStart === 'function') {
      return window.getPerfMeasureStart();
    }
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function safeRecordSortableLibraryAvailability() {
    if (typeof recordSortableLibraryAvailability === 'function') return recordSortableLibraryAvailability();
    if (typeof window !== 'undefined' && typeof window.recordSortableLibraryAvailability === 'function') {
      return window.recordSortableLibraryAvailability();
    }
    return typeof Sortable !== 'undefined';
  }

  function safeRecordSortablePerfTiming(key, start, status) {
    if (typeof recordSortablePerfTiming === 'function') {
      recordSortablePerfTiming(key, start, status);
    } else if (typeof window !== 'undefined' && typeof window.recordSortablePerfTiming === 'function') {
      window.recordSortablePerfTiming(key, start, status);
    }
  }

  function getBrowserApi() {
    if (typeof window !== 'undefined' && window.browser && window.browser.bookmarks) {
      return window.browser;
    }
    if (typeof browser !== 'undefined' && browser.bookmarks) {
      return browser;
    }
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return chrome;
    }
    return null;
  }

  function getBookmarkTreeState() {
    if (typeof window !== 'undefined' && Array.isArray(window.bookmarkTree)) {
      return window.bookmarkTree;
    }
    if (typeof bookmarkTree !== 'undefined' && Array.isArray(bookmarkTree)) {
      return bookmarkTree;
    }
    return null;
  }

  function resolveFindBookmarkNodeById(rootNode, id) {
    if (typeof window !== 'undefined' && typeof window.findBookmarkNodeById === 'function') {
      return window.findBookmarkNodeById(rootNode, id);
    }
    if (typeof findBookmarkNodeById === 'function') {
      return findBookmarkNodeById(rootNode, id);
    }
    return null;
  }

  function resolveGetBookmarkTree(forceRefresh) {
    if (typeof window !== 'undefined' && typeof window.getBookmarkTree === 'function') {
      return window.getBookmarkTree(forceRefresh);
    }
    if (typeof getBookmarkTree === 'function') {
      return getBookmarkTree(forceRefresh);
    }
    return Promise.resolve(null);
  }

  function resolveLoadBookmarks(folderId) {
    if (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function') {
      return window.loadBookmarks(folderId);
    }
    if (typeof loadBookmarks === 'function') {
      return loadBookmarks(folderId);
    }
    return Promise.resolve();
  }

  function getCurrentGridFolderNode() {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getCurrentGridFolderNode === 'function') {
      return window.HomebaseBookmarkGridController.getCurrentGridFolderNode();
    }
    if (typeof window !== 'undefined' && window.currentGridFolderNode) {
      return window.currentGridFolderNode;
    }
    return null;
  }

  function getActiveHomebaseFolderId() {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getActiveHomebaseFolderId === 'function') {
      return window.HomebaseBookmarkGridController.getActiveHomebaseFolderId();
    }
    if (typeof window !== 'undefined' && window.activeHomebaseFolderId) {
      return window.activeHomebaseFolderId;
    }
    return null;
  }

  // =========================================================================
  // Pointer Movement & Tab Hover Tracking
  // =========================================================================

  function attachPointerMoveListener() {
    if (_pointerMoveAttached) return;
    if (typeof window === 'undefined') return;

    _pointerMoveAttached = true;
    window.addEventListener('pointermove', (e) => {
      const isDragging = _isGridDragging || (typeof window !== 'undefined' && Boolean(window.isGridDragging));
      if (!isDragging) return;

      _lastDragX = e.clientX;
      _lastDragY = e.clientY;

      if (!_dragMoveScheduled) {
        _dragMoveScheduled = true;
        requestAnimationFrame(() => {
          handleGridDragPointerMove({ clientX: _lastDragX, clientY: _lastDragY });
          _dragMoveScheduled = false;
        });
      }
    });
  }

  function handleGridDragPointerMove(evt) {
    const isDragging = _isGridDragging || (typeof window !== 'undefined' && Boolean(window.isGridDragging));
    if (!isDragging) {
      if (_activeTabDropTarget) {
        clearTabDropHighlight();
      }
      return;
    }

    if (!evt || typeof evt.clientX !== 'number' || typeof evt.clientY !== 'number') {
      return;
    }

    const hoveredElement = document.elementFromPoint(evt.clientX, evt.clientY);
    if (!hoveredElement) {
      clearTabDropHighlight();
      return;
    }

    const tabCandidate = hoveredElement.closest('.bookmark-folder-tab');
    if (!tabCandidate || !tabCandidate.dataset || !tabCandidate.dataset.folderId) {
      clearTabDropHighlight();
      return;
    }

    if (tabCandidate === _activeTabDropTarget) {
      return;
    }

    if (_activeTabDropTarget) {
      _activeTabDropTarget.classList.remove('drop-target');
    }

    _activeTabDropTarget = tabCandidate;
    _activeTabDropTarget.classList.add('drop-target');
  }

  function clearTabDropHighlight() {
    if (!_activeTabDropTarget) return;
    _activeTabDropTarget.classList.remove('drop-target');
    _activeTabDropTarget = null;
  }

  // =========================================================================
  // Grid Sortable Event Handlers & Hover Lock
  // =========================================================================

  /**
   * Sortable.js `onMove` callback: enforces folder hover delay before locking
   * layout in place to prevent tile shifting while hovering over folders.
   */
  function handleGridMove(evt) {
    const targetItem = evt.related; // Item being hovered over
    const draggedItem = evt.item;   // Item being dragged

    // Only care about folder targets (not the dragged item itself)
    if (targetItem && targetItem.dataset && targetItem.dataset.isFolder === 'true' && targetItem !== draggedItem) {
      const now = Date.now();

      // If we just moved onto a *different* folder, reset the timer
      if (_folderHoverTarget !== targetItem) {
        _folderHoverTarget = targetItem;
        _folderHoverStart = now;
      }

      const hoveredLongEnough = now - _folderHoverStart >= FOLDER_HOVER_DELAY_MS;

      if (hoveredLongEnough) {
        // We've been hovering this folder for a bit:
        //  - highlight it
        //  - return false to "lock" the layout in place
        if (_lastGridDragOverItem && _lastGridDragOverItem !== targetItem) {
          _lastGridDragOverItem.classList.remove('drag-over');
        }
        if (_lastGridDragOverItem !== targetItem) {
          _lastGridDragOverItem = targetItem;
        }
        targetItem.classList.add('drag-over');
        return false; // prevent Sortable from reordering while over this folder
      } else {
        // Still in the "passing through" phase -> allow normal reordering
        if (_lastGridDragOverItem) {
          _lastGridDragOverItem.classList.remove('drag-over');
          _lastGridDragOverItem = null;
        }
        targetItem.classList.remove('drag-over');
        return true;
      }
    }

    // Not over a folder -> reset hover state and allow normal sort
    _folderHoverTarget = null;
    _folderHoverStart = 0;
    if (_lastGridDragOverItem) {
      _lastGridDragOverItem.classList.remove('drag-over');
      _lastGridDragOverItem = null;
    }
    return true;
  }

  /**
   * Optimistically updates the in-memory bookmark tree array to match the visual drop.
   * Prevents needing to re-fetch/re-render the entire grid.
   */
  function moveItemInLocalTree(parentId, oldIndex, newIndex) {
    const tree = getBookmarkTreeState();
    if (!tree || !tree[0]) return;

    const parentNode = resolveFindBookmarkNodeById(tree[0], parentId);
    if (!parentNode || !parentNode.children) return;

    if (oldIndex < 0 || oldIndex >= parentNode.children.length) return;
    if (newIndex < 0 || newIndex >= parentNode.children.length) return;

    const [movedItem] = parentNode.children.splice(oldIndex, 1);
    parentNode.children.splice(newIndex, 0, movedItem);

    parentNode.children.forEach((child, idx) => {
      if (child) child.index = idx;
    });
  }

  /**
   * Unified handler for grid drop (re-ordering or moving into a folder/tab).
   * This is a Sortable.js `onEnd` callback.
   */
  async function handleGridDrop(evt) {
    clearTabDropHighlight();
    const grid = evt.from;

    if (grid) {
      grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
        item.classList.remove('drag-over');
      });
    }

    const dropTargetElement = (evt.originalEvent && typeof evt.originalEvent.clientX === 'number')
      ? document.elementFromPoint(evt.originalEvent.clientX, evt.originalEvent.clientY)
      : null;

    const folderTarget = dropTargetElement
      ? dropTargetElement.closest('.bookmark-item[data-is-folder="true"]')
      : null;
    const tabTarget = dropTargetElement
      ? dropTargetElement.closest('.bookmark-folder-tab')
      : null;
    const backButtonTarget = dropTargetElement
      ? dropTargetElement.closest('.back-button')
      : null;

    const draggedItem = evt.item;
    if (!draggedItem) return;
    const draggedItemId = draggedItem.dataset ? draggedItem.dataset.bookmarkId : null;
    if (!draggedItemId) return;

    // ============================================================
    // CASE A: MOVING INTO A FOLDER (Requires Removal & Transfer)
    // ============================================================
    if ((folderTarget && folderTarget.dataset && folderTarget.dataset.bookmarkId !== draggedItemId) || tabTarget || backButtonTarget) {
      let targetFolderId = null;

      if (tabTarget && tabTarget.dataset) {
        targetFolderId = tabTarget.dataset.folderId;
      } else if (backButtonTarget && backButtonTarget.dataset) {
        targetFolderId = backButtonTarget.dataset.backTargetId;
      } else if (folderTarget && folderTarget.dataset) {
        targetFolderId = folderTarget.dataset.bookmarkId;
      }

      if (!targetFolderId) return;

      // 1. Visual: Remove immediately
      draggedItem.remove();

      // 2. Canonical Virtualizer update
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.syncVirtualizerMove === 'function') {
        window.HomebaseBookmarkGridController.syncVirtualizerMove(draggedItemId, targetFolderId);
      } else if (typeof window !== 'undefined' && typeof window.syncVirtualizerMove === 'function') {
        window.syncVirtualizerMove(draggedItemId, targetFolderId);
      }

      // 3. Data Model Update (Optimistic)
      const tree = getBookmarkTreeState();
      const currentFolderNode = getCurrentGridFolderNode();
      const currentFolderId = (currentFolderNode && currentFolderNode.id) || getActiveHomebaseFolderId();

      if (tree && tree[0]) {
        const sourceParentNode = resolveFindBookmarkNodeById(tree[0], currentFolderId);
        let movedNode = null;

        if (sourceParentNode && sourceParentNode.children) {
          const idx = sourceParentNode.children.findIndex(c => c && c.id === draggedItemId);
          if (idx !== -1) {
            movedNode = sourceParentNode.children[idx];
            sourceParentNode.children.splice(idx, 1);
          }
        }

        if (movedNode) {
          const targetFolderNode = resolveFindBookmarkNodeById(tree[0], targetFolderId);
          if (targetFolderNode) {
            if (!targetFolderNode.children) targetFolderNode.children = [];
            movedNode.parentId = targetFolderId;
            targetFolderNode.children.push(movedNode);
          }
        }
      }

      // 4. WebExtension API Sync in background
      const browserApi = getBrowserApi();
      if (browserApi && browserApi.bookmarks && typeof browserApi.bookmarks.move === 'function') {
        try {
          await browserApi.bookmarks.move(draggedItemId, { parentId: targetFolderId });
          resolveGetBookmarkTree(true).catch(e => console.warn(e));
        } catch (e) {
          console.warn('Move failed', e);
          if (currentFolderNode && currentFolderNode.id) {
            resolveLoadBookmarks(currentFolderNode.id);
          }
        }
      }
      return;
    }

    // ============================================================
    // CASE B: RE-ORDERING (Optimistic - NO RENDER)
    // ============================================================
    if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
      const currentFolderNode = getCurrentGridFolderNode();
      const parentId = (currentFolderNode && currentFolderNode.id) || getActiveHomebaseFolderId();

      const hasBackButton = grid && grid.firstElementChild && grid.firstElementChild.classList.contains('back-button');
      let dataOldIndex = evt.oldIndex;
      let dataNewIndex = evt.newIndex;

      if (hasBackButton) {
        dataOldIndex--;
        dataNewIndex--;
      }

      if (dataOldIndex < 0 || dataNewIndex < 0) return;

      moveItemInLocalTree(parentId, dataOldIndex, dataNewIndex);

      // Canonical Virtualizer reorder
      if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.reorderVirtualizerItems === 'function') {
        window.HomebaseBookmarkGridController.reorderVirtualizerItems(evt.oldIndex, evt.newIndex);
      } else if (typeof window !== 'undefined' && typeof window.reorderVirtualizerItems === 'function') {
        window.reorderVirtualizerItems(evt.oldIndex, evt.newIndex);
      }

      const browserApi = getBrowserApi();
      if (browserApi && browserApi.bookmarks && typeof browserApi.bookmarks.move === 'function') {
        browserApi.bookmarks.move(draggedItemId, { index: dataNewIndex })
          .catch(err => {
            console.error('Move failed, reverting...', err);
            resolveLoadBookmarks(parentId);
          });
      }
    }
  }

  // =========================================================================
  // Public Controller Object
  // =========================================================================

  const HomebaseBookmarkDragController = {
    /**
     * Initializes the bookmark drag controller and attaches pointer listeners.
     * @param {Object} [options={}] Optional dependencies and configuration
     * @returns {Object} The controller instance
     */
    initialize(options = {}) {
      _options = Object.assign({}, options || {});
      attachPointerMoveListener();
      _initialized = true;
      return this;
    },

    /**
     * Initializes Sortable.js on the bookmarks grid.
     *
     * @param {HTMLElement} gridElement The DOM element for the grid
     * @returns {Sortable|null}
     */
    setupGridSortable(gridElement) {
      if (!gridElement) return null;

      const sortableStart = safeGetPerfMeasureStart();
      safeRecordSortableLibraryAvailability();

      if (_gridSortable && typeof _gridSortable.destroy === 'function') {
        _gridSortable.destroy();
      }

      try {
        _gridSortable = Sortable.create(gridElement, {
          animation: 250, // Optimal speed for smoothness
          group: 'bookmarks',
          draggable: '.bookmark-item:not(.back-button)',
          filter: '.grid-item-rename-input',
          preventOnFilter: false,

          // Explicitly tell Sortable which attribute holds the ID
          dataIdAttr: 'data-bookmark-id',

          // Performance Settings
          delay: 150, // Touch-only delay keeps mouse drag responsive; tolerance reduces micro-drag.
          delayOnTouchOnly: true,
          touchStartThreshold: 6,

          ghostClass: 'bookmark-placeholder',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',

          forceFallback: true,
          fallbackClass: 'bookmark-fallback-ghost',
          fallbackOnBody: true,
          fallbackTolerance: 6,

          onClone: (evt) => {
            const clone = evt.clone;
            if (!clone) return;

            clone.classList.add('bookmark-fallback-ghost');

            const fallbackIcon = clone.querySelector('.bookmark-fallback-icon');
            if (fallbackIcon && !fallbackIcon.classList.contains('show-fallback')) {
              clone.classList.add('bookmark-fallback-ghost-hide-fallback');
            }
          },

          onStart: () => {
            HomebaseBookmarkDragController.setGridDragging(true);
            document.body.classList.add('is-dragging-active');

            // Immediately strip the "drop-in" animation class so Sortable can animate positions.
            const animatingItems = gridElement.querySelectorAll('.newly-rendered');
            animatingItems.forEach(el => {
              el.classList.remove('newly-rendered');
              el.style.animationDelay = '';
              el.style.opacity = '1';
              el.style.animation = 'none';
            });
          },

          onEnd: (evt) => {
            document.body.classList.remove('is-dragging-active');
            // Delay clearing the drag flag so the subsequent click event is ignored.
            setTimeout(() => {
              HomebaseBookmarkDragController.setGridDragging(false);
            }, 50);
            handleGridDrop(evt);
          },

          onMove: handleGridMove
        });

        safeRecordSortablePerfTiming('grid', sortableStart, 'done');
        return _gridSortable;
      } catch (err) {
        safeRecordSortablePerfTiming('grid', sortableStart, 'failed');
        throw err;
      }
    },

    /**
     * Initializes Sortable.js on the folder tabs container.
     * In Phase 3-B, delegates to setupTabsSortable in new-tab.js until Phase 3-C.
     *
     * @param {HTMLElement} tabsContainer The DOM element for the tabs container
     * @returns {Sortable|null}
     */
    setupTabsSortable(tabsContainer) {
      if (!tabsContainer) return null;

      if (typeof window !== 'undefined' && typeof window.setupTabsSortable === 'function' && window.setupTabsSortable !== this.setupTabsSortable) {
        return window.setupTabsSortable(tabsContainer);
      }
      return null;
    },

    /**
     * Checks if a grid bookmark drag operation is currently active.
     * @returns {boolean}
     */
    isGridDragging() {
      if (typeof window !== 'undefined' && 'isGridDragging' in window) {
        return Boolean(window.isGridDragging);
      }
      return _isGridDragging;
    },

    /**
     * Sets internal grid dragging state flag.
     * @param {boolean} val
     */
    setGridDragging(val) {
      _isGridDragging = Boolean(val);
      if (typeof window !== 'undefined' && window.isGridDragging !== _isGridDragging) {
        try {
          window.isGridDragging = _isGridDragging;
        } catch (_) {}
      }
    },

    /**
     * Checks if a folder tab drag operation is currently active.
     * @returns {boolean}
     */
    isTabDragging() {
      if (typeof window !== 'undefined' && 'isTabDragging' in window) {
        return Boolean(window.isTabDragging);
      }
      return _isTabDragging;
    },

    /**
     * Sets internal tab dragging state flag.
     * @param {boolean} val
     */
    setTabDragging(val) {
      _isTabDragging = Boolean(val);
      if (typeof window !== 'undefined' && window.isTabDragging !== _isTabDragging) {
        try {
          window.isTabDragging = _isTabDragging;
        } catch (_) {}
      }
    },

    /**
     * Returns the active grid sortable instance.
     * @returns {Sortable|null}
     */
    getGridSortable() {
      return _gridSortable;
    },

    /**
     * Returns the active tabs sortable instance.
     * @returns {Sortable|null}
     */
    getTabsSortable() {
      return _tabsSortable;
    },

    // Handlers exposed for testing and delegation
    handleGridDrop,
    moveItemInLocalTree,
    handleGridMove,
    handleGridDragPointerMove,
    clearTabDropHighlight,

    /**
     * Destroys active sortable instances and cleans up state.
     */
    destroy() {
      if (_gridSortable && typeof _gridSortable.destroy === 'function') {
        _gridSortable.destroy();
      }
      if (_tabsSortable && typeof _tabsSortable.destroy === 'function') {
        _tabsSortable.destroy();
      }
      _gridSortable = null;
      _tabsSortable = null;
      _isGridDragging = false;
      _isTabDragging = false;
      _activeTabDropTarget = null;
      _folderHoverTarget = null;
      _folderHoverStart = 0;
      _lastGridDragOverItem = null;
      _initialized = false;
    }
  };

  // Auto-attach pointermove listener
  attachPointerMoveListener();

  // --- Global Window Export & Backward Compatibility Bridges ---
  if (typeof window !== 'undefined') {
    window.HomebaseBookmarkDragController = HomebaseBookmarkDragController;

    // Define window.isGridDragging bridge
    if (!('isGridDragging' in window)) {
      Object.defineProperty(window, 'isGridDragging', {
        get: () => HomebaseBookmarkDragController.isGridDragging(),
        set: (val) => { HomebaseBookmarkDragController.setGridDragging(val); },
        configurable: true,
        enumerable: true
      });
    }

    // Define window.isTabDragging bridge
    if (!('isTabDragging' in window)) {
      Object.defineProperty(window, 'isTabDragging', {
        get: () => HomebaseBookmarkDragController.isTabDragging(),
        set: (val) => { HomebaseBookmarkDragController.setTabDragging(val); },
        configurable: true,
        enumerable: true
      });
    }

    // Define window.setupGridSortable bridge
    window.setupGridSortable = function(gridElement) {
      return HomebaseBookmarkDragController.setupGridSortable(gridElement);
    };

    // Define window.setupTabsSortable forwarder if not already set
    if (typeof window.setupTabsSortable !== 'function') {
      window.setupTabsSortable = function(tabsContainer) {
        return HomebaseBookmarkDragController.setupTabsSortable(tabsContainer);
      };
    }

    // Direct helper exports for multi-script compatibility
    window.moveItemInLocalTree = moveItemInLocalTree;
    window.clearTabDropHighlight = clearTabDropHighlight;
  }
})();
