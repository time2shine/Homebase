// ===================================================================
// Homebase — Storage Event Dispatcher
//
// Canonical listener for browser.storage.onChanged events.
// Normalizes platform events and dispatches storage deltas across
// active dashboard controllers (Search, Settings, Todo) and registered
// subsystem delegates (Wallpaper, Bookmarks).
// ===================================================================

(function() {
  'use strict';

  let _initialized = false;
  const _subscribers = new Set();

  /**
   * Resolves the active browser storage.onChanged event across Chrome and Firefox.
   *
   * @returns {Object|null}
   */
  function getStorageOnChangedApi() {
    if (typeof window !== 'undefined') {
      if (window.browser?.storage?.onChanged?.addListener) {
        return window.browser.storage.onChanged;
      }
      if (window.chrome?.storage?.onChanged?.addListener) {
        return window.chrome.storage.onChanged;
      }
    }

    if (typeof browser !== 'undefined' && browser?.storage?.onChanged?.addListener) {
      return browser.storage.onChanged;
    }
    if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged?.addListener) {
      return chrome.storage.onChanged;
    }

    return null;
  }

  /**
   * Subscribes a custom listener to receive dispatched storage changes.
   *
   * @param {Function} listener
   */
  function addListener(listener) {
    if (typeof listener === 'function') {
      _subscribers.add(listener);
    }
  }

  /**
   * Unsubscribes a custom listener.
   *
   * @param {Function} listener
   */
  function removeListener(listener) {
    _subscribers.delete(listener);
  }

  /**
   * Dispatches storage changes to registered controllers and custom subscribers.
   * Only processes changes originating from the 'local' storage area.
   *
   * @param {Object} changes - Key-value map of storage change objects { oldValue, newValue }
   * @param {string} areaName - Storage area name ('local', 'sync', 'managed')
   */
  function dispatch(changes, areaName) {
    if (areaName !== 'local') return;
    if (!changes || typeof changes !== 'object') return;

    // 1. Search UI Controller
    if (
      typeof window !== 'undefined' &&
      window.HomebaseSearchUiController &&
      typeof window.HomebaseSearchUiController.handleStorageChange === 'function'
    ) {
      try {
        window.HomebaseSearchUiController.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Search storage handler error:', err);
      }
    }

    // 2. Settings Preferences Controller
    if (
      typeof window !== 'undefined' &&
      window.HomebaseSettingsPreferences &&
      typeof window.HomebaseSettingsPreferences.handleStorageChange === 'function'
    ) {
      try {
        window.HomebaseSettingsPreferences.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Settings storage handler error:', err);
      }
    }

    // 3. Todo Widget Handler
    const todoHandler =
      (typeof window !== 'undefined' && typeof window.handleTodoStorageChange === 'function')
        ? window.handleTodoStorageChange
        : (typeof handleTodoStorageChange === 'function' ? handleTodoStorageChange : null);

    if (typeof todoHandler === 'function') {
      try {
        todoHandler(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Todo storage handler error:', err);
      }
    }

    // 4. Bookmark Root Controller
    const rootController =
      (typeof window !== 'undefined' && window.HomebaseBookmarkRootController) ||
      (typeof HomebaseBookmarkRootController !== 'undefined' ? HomebaseBookmarkRootController : null);

    if (rootController && typeof rootController.handleStorageChange === 'function') {
      try {
        rootController.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Bookmark root storage handler error:', err);
      }
    }

    // 5. Bookmark Grid Controller
    const gridController =
      (typeof window !== 'undefined' && window.HomebaseBookmarkGridController) ||
      (typeof HomebaseBookmarkGridController !== 'undefined' ? HomebaseBookmarkGridController : null);

    if (gridController && typeof gridController.handleStorageChange === 'function') {
      try {
        gridController.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Bookmark grid storage handler error:', err);
      }
    }

    // 6. Custom Subscriber Delegates (e.g. Wallpaper & Last Used Folder in new-tab.js)
    _subscribers.forEach((listener) => {
      try {
        listener(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Subscriber storage handler error:', err);
      }
    });
  }

  /**
   * Initializes the storage dispatcher by binding the platform storage.onChanged event.
   *
   * @param {Object|Function} [options] - Optional configuration or direct listener callback
   */
  function initialize(options = {}) {
    if (options) {
      if (typeof options === 'function') {
        addListener(options);
      } else if (typeof options.onStorageChange === 'function') {
        addListener(options.onStorageChange);
      } else if (typeof options.onStorageChanged === 'function') {
        addListener(options.onStorageChanged);
      }
    }

    if (_initialized) return;

    const storageApi = getStorageOnChangedApi();
    if (storageApi && typeof storageApi.addListener === 'function') {
      storageApi.addListener(dispatch);
      _initialized = true;
    }
  }

  const dispatcher = {
    initialize,
    addListener,
    removeListener,
    dispatch,
    isInitialized: () => _initialized,
    getSubscribersCount: () => _subscribers.size,
    resetForTesting: () => {
      _subscribers.clear();
      _initialized = false;
    }
  };

  if (typeof window !== 'undefined') {
    window.HomebaseStorageDispatcher = dispatcher;
  }
})();
