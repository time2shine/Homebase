// ===================================================================
// Homebase — Canonical Widget Lifecycle Service
//
// Single canonical owner of widget lifecycle coordination,
// teardown tracking, listener cleanup, and tab visibility monitoring.
//
// Rules:
// - Zero storage access (persistence owned by HomebaseWidgetStorage).
// - Zero DOM rendering (presentation owned by widget card renderers).
// - Zero widget-specific business logic.
// ===================================================================

(function () {
  'use strict';

  /**
   * Internal widget registry map: widgetId -> WidgetRecord
   * @type {Map<string, { id: string, controller: object|function, isInitialized: boolean, isVisible: boolean, isActive: boolean, isDestroyed: boolean }>}
   */
  const widgetRegistry = new Map();

  /**
   * Visibility subscribers set: Set<(isVisible: boolean) => void>
   */
  const visibilitySubscribers = new Set();
  let visibilityListenerAttached = false;

  /**
   * Safe helper to invoke optional lifecycle callbacks.
   */
  function safeInvoke(fn, callbackName, widgetId) {
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (err) {
        console.warn(`[HomebaseWidgetLifecycle] Error in ${callbackName} on widget '${widgetId}':`, err);
      }
    }
  }

  /**
   * Internal visibility change handler.
   */
  function handleVisibilityChange() {
    const tabVisible = isTabVisible();

    visibilitySubscribers.forEach((callback) => {
      try {
        callback(tabVisible);
      } catch (err) {
        console.warn('[HomebaseWidgetLifecycle] Visibility callback error:', err);
      }
    });

    widgetRegistry.forEach((record) => {
      if (!record.isInitialized || record.isDestroyed) return;
      if (!record.isVisible) return;

      const prevActive = record.isActive;
      const targetActive = tabVisible;

      if (targetActive && !prevActive) {
        record.isActive = true;
        safeInvoke(record.controller?.resume, 'resume', record.id);
      } else if (!targetActive && prevActive) {
        record.isActive = false;
        safeInvoke(record.controller?.pause, 'pause', record.id);
      }
    });
  }

  /**
   * Ensures the single document visibilitychange listener is attached once.
   */
  function ensureVisibilityListener() {
    if (visibilityListenerAttached) return;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      visibilityListenerAttached = true;
    }
  }

  /**
   * Checks whether the current document / tab is visible.
   * @returns {boolean}
   */
  function isTabVisible() {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  }

  /**
   * Subscribes a callback to document visibility changes.
   * @param {(isVisible: boolean) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  function onVisibilityChange(callback) {
    if (typeof callback !== 'function') return () => {};
    ensureVisibilityListener();
    visibilitySubscribers.add(callback);
    return function unsubscribe() {
      visibilitySubscribers.delete(callback);
    };
  }

  /**
   * Creates an isolated listener registry for a controller or component.
   * Provides tracked event binding and safe, idempotent bulk teardown.
   * @returns {{ on: Function, off: Function, removeAll: Function, count: number }}
   */
  function createListenerRegistry() {
    let listeners = [];

    return {
      on(target, eventType, handler, options) {
        if (!target || typeof target.addEventListener !== 'function') return;
        if (typeof handler !== 'function') return;
        target.addEventListener(eventType, handler, options);
        listeners.push({ target, eventType, handler, options });
      },

      off(target, eventType, handler) {
        if (!target || typeof target.removeEventListener !== 'function') return;
        target.removeEventListener(eventType, handler);
        listeners = listeners.filter(
          (entry) => !(entry.target === target && entry.eventType === eventType && entry.handler === handler)
        );
      },

      removeAll() {
        listeners.forEach(({ target, eventType, handler, options }) => {
          try {
            target.removeEventListener(eventType, handler, options);
          } catch (_) {
            // Ignore teardown errors on already-detached targets
          }
        });
        listeners = [];
      },

      get count() {
        return listeners.length;
      }
    };
  }

  /**
   * Registers a widget controller with the lifecycle service.
   * @param {string} widgetId
   * @param {object|function} controller
   * @returns {{ id: string, controller: object|function, isInitialized: boolean, isVisible: boolean, isActive: boolean, isDestroyed: boolean }}
   */
  function registerWidget(widgetId, controller) {
    if (!widgetId || typeof widgetId !== 'string') {
      throw new TypeError('[HomebaseWidgetLifecycle] widgetId must be a non-empty string');
    }
    if (!controller || (typeof controller !== 'object' && typeof controller !== 'function')) {
      throw new TypeError('[HomebaseWidgetLifecycle] controller must be an object or function');
    }

    ensureVisibilityListener();

    if (widgetRegistry.has(widgetId)) {
      const existing = widgetRegistry.get(widgetId);
      if (!existing.isDestroyed && existing.controller && typeof existing.controller.destroy === 'function') {
        try {
          existing.controller.destroy();
        } catch (err) {
          console.warn('[HomebaseWidgetLifecycle] Error destroying replaced widget controller', widgetId, err);
        }
      }
    }

    const record = {
      id: widgetId,
      controller,
      isInitialized: false,
      isVisible: false,
      isActive: false,
      isDestroyed: false
    };

    widgetRegistry.set(widgetId, record);
    return record;
  }

  /**
   * Unregisters a widget controller, calling its destroy() hook if available.
   * @param {string} widgetId
   * @returns {boolean} True if found and removed
   */
  function unregisterWidget(widgetId) {
    if (!widgetRegistry.has(widgetId)) return false;

    const record = widgetRegistry.get(widgetId);
    if (!record.isDestroyed) {
      if (record.isActive) {
        record.isActive = false;
        safeInvoke(record.controller?.pause, 'pause', widgetId);
      }
      if (record.isVisible) {
        record.isVisible = false;
        safeInvoke(record.controller?.onHide, 'onHide', widgetId);
      }
      if (record.controller && typeof record.controller.destroy === 'function') {
        try {
          record.controller.destroy();
        } catch (err) {
          console.warn('[HomebaseWidgetLifecycle] Error destroying unregistered widget', widgetId, err);
        }
      }
    }

    record.isDestroyed = true;
    record.isInitialized = false;
    record.isVisible = false;
    record.isActive = false;
    widgetRegistry.delete(widgetId);
    return true;
  }

  /**
   * Retrieves a registered widget record.
   * @param {string} widgetId
   * @returns {{ id: string, controller: object|function, isInitialized: boolean, isVisible: boolean, isActive: boolean, isDestroyed: boolean } | null}
   */
  function getWidget(widgetId) {
    return widgetRegistry.get(widgetId) || null;
  }

  /**
   * Returns all currently registered widget records.
   * @returns {Array<{ id: string, controller: object|function, isInitialized: boolean, isVisible: boolean, isActive: boolean, isDestroyed: boolean }>}
   */
  function getAllWidgets() {
    return Array.from(widgetRegistry.values());
  }

  /**
   * Checks if a widget is currently marked as UI visible.
   * @param {string} widgetId
   * @returns {boolean}
   */
  function isWidgetVisible(widgetId) {
    const record = widgetRegistry.get(widgetId);
    return Boolean(record && record.isVisible);
  }

  /**
   * Checks if a widget is currently active (UI visible and tab active).
   * @param {string} widgetId
   * @returns {boolean}
   */
  function isWidgetActive(widgetId) {
    const record = widgetRegistry.get(widgetId);
    return Boolean(record && record.isActive);
  }

  /**
   * Updates a widget's visibility status and triggers lifecycle transition callbacks.
   * @param {string} widgetId
   * @param {boolean} isVisible
   */
  function setWidgetVisibility(widgetId, isVisible) {
    const record = widgetRegistry.get(widgetId);
    if (!record || record.isDestroyed) return;

    const targetVisible = Boolean(isVisible);
    const prevVisible = record.isVisible;
    const tabVisible = isTabVisible();
    const targetActive = targetVisible && tabVisible;
    const prevActive = record.isActive;

    record.isVisible = targetVisible;

    if (record.isInitialized) {
      if (targetVisible && !prevVisible) {
        safeInvoke(record.controller?.onShow, 'onShow', widgetId);
        if (targetActive && !prevActive) {
          record.isActive = true;
          safeInvoke(record.controller?.resume, 'resume', widgetId);
        }
      } else if (!targetVisible && prevVisible) {
        if (prevActive) {
          record.isActive = false;
          safeInvoke(record.controller?.pause, 'pause', widgetId);
        }
        safeInvoke(record.controller?.onHide, 'onHide', widgetId);
      }
    } else {
      record.isActive = false;
    }
  }

  /**
   * Bulk synchronizes visibility states from a key-value map.
   * @param {Record<string, boolean>} visibilityMap
   */
  function syncAllWidgetVisibilities(visibilityMap) {
    if (!visibilityMap || typeof visibilityMap !== 'object') return;
    Object.keys(visibilityMap).forEach((id) => {
      setWidgetVisibility(id, visibilityMap[id]);
    });
  }

  /**
   * Initializes all registered widgets.
   * Prevents duplicate initialization for already-initialized widgets.
   * @returns {Promise<void>}
   */
  async function initializeAll() {
    const records = Array.from(widgetRegistry.values());
    ensureVisibilityListener();

    for (const record of records) {
      if (record.isInitialized || record.isDestroyed) {
        continue;
      }

      try {
        const { controller } = record;
        if (typeof controller.init === 'function') {
          await controller.init();
        } else if (typeof controller.initialize === 'function') {
          await controller.initialize();
        } else if (typeof controller === 'function') {
          await controller();
        }
        record.isInitialized = true;
        record.isDestroyed = false;

        if (record.isVisible) {
          safeInvoke(controller.onShow, 'onShow', record.id);
          if (isTabVisible()) {
            record.isActive = true;
            safeInvoke(controller.resume, 'resume', record.id);
          }
        }
      } catch (err) {
        console.warn('[HomebaseWidgetLifecycle] Failed to initialize widget:', record.id, err);
      }
    }
  }

  /**
   * Destroys all registered widgets and safely clears the registry.
   */
  function destroyAll() {
    const records = Array.from(widgetRegistry.values());

    records.forEach((record) => {
      if (!record.isDestroyed) {
        if (record.isActive) {
          record.isActive = false;
          safeInvoke(record.controller?.pause, 'pause', record.id);
        }
        if (record.isVisible) {
          record.isVisible = false;
          safeInvoke(record.controller?.onHide, 'onHide', record.id);
        }
        if (record.controller && typeof record.controller.destroy === 'function') {
          try {
            record.controller.destroy();
          } catch (err) {
            console.warn('[HomebaseWidgetLifecycle] Error destroying widget during destroyAll:', record.id, err);
          }
        }
      }
      record.isDestroyed = true;
      record.isInitialized = false;
      record.isVisible = false;
      record.isActive = false;
    });

    widgetRegistry.clear();
  }

  /**
   * Public API facade
   */
  const HomebaseWidgetLifecycle = {
    registerWidget,
    unregisterWidget,
    getWidget,
    getAllWidgets,
    isWidgetVisible,
    isWidgetActive,
    setWidgetVisibility,
    syncAllWidgetVisibilities,
    initializeAll,
    destroyAll,
    createListenerRegistry,
    onVisibilityChange,
    isTabVisible
  };

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  globalScope.HomebaseWidgetLifecycle = HomebaseWidgetLifecycle;
})();
