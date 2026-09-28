// ===============================================
// Homebase — Host Storage Adapter & Legacy Bridge
// ===============================================

/**
 * Universal storage adapter bridge for lazy-loaded UI modules
 * (Gallery UI, Bookmark Editor UI, etc.).
 *
 * Ensures all bridge storage requests route primarily through HomebaseStorage
 * (enforcing schema validation, sanitization, and synchronous fast mirrors),
 * while defensively falling back to browser.storage.local or chrome.storage.local
 * when HomebaseStorage is absent or fails.
 */
(function() {
  'use strict';

  /**
   * Resolves the primary HomebaseStorage facade if available.
   *
   * @returns {Object|null}
   */
  function getHomebaseStorage() {
    if (typeof window !== 'undefined' && window.HomebaseStorage) {
      return window.HomebaseStorage;
    }
    return null;
  }

  /**
   * Resolves the underlying browser storage API across Chrome and Firefox.
   *
   * @returns {Object|null}
   */
  function getFallbackStorageApi() {
    if (typeof window !== 'undefined') {
      if (window.browser?.storage?.local) return window.browser.storage.local;
      if (window.chrome?.storage?.local) return window.chrome.storage.local;
    }
    if (typeof browser !== 'undefined' && browser?.storage?.local) return browser.storage.local;
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) return chrome.storage.local;
    return null;
  }

  /**
   * Universal asynchronous key-value read bridge.
   * Supports:
   * - string: returns { [key]: value }
   * - Array<string>: returns { [k1]: v1, [k2]: v2, ... }
   * - Object with defaults: returns { ...defaults, ...retrieved }
   * - null / undefined: returns all stored keys
   *
   * @param {string|Array<string>|Object|null} keys
   * @returns {Promise<Object>}
   */
  async function bridgeStorageGet(keys) {
    const homebase = getHomebaseStorage();

    if (homebase && typeof homebase.getMany === 'function' && typeof homebase.get === 'function') {
      try {
        if (typeof keys === 'string') {
          const val = await homebase.get(keys);
          return { [keys]: val };
        }

        if (Array.isArray(keys)) {
          return await homebase.getMany(keys);
        }

        if (keys && typeof keys === 'object') {
          const result = {};
          for (const [k, defaultVal] of Object.entries(keys)) {
            result[k] = await homebase.get(k, defaultVal);
          }
          return result;
        }

        if (keys === null || keys === undefined) {
          return await homebase.getMany(null);
        }

        return {};
      } catch (err) {
        console.warn('HomebaseStorage read failed in bridge, falling back to storage.local', err);
      }
    }

    const fallback = getFallbackStorageApi();
    if (fallback && typeof fallback.get === 'function') {
      try {
        return await fallback.get(keys);
      } catch (err) {
        console.warn('Fallback storage.local get failed in bridge', err);
        return (keys && typeof keys === 'object' && !Array.isArray(keys)) ? { ...keys } : {};
      }
    }

    return (keys && typeof keys === 'object' && !Array.isArray(keys)) ? { ...keys } : {};
  }

  /**
   * Universal asynchronous batch write bridge.
   *
   * @param {Object} items - Dictionary of key-value pairs to write
   * @returns {Promise<void>}
   */
  async function bridgeStorageSet(items) {
    if (!items || typeof items !== 'object' || Array.isArray(items)) {
      return;
    }

    const homebase = getHomebaseStorage();
    if (homebase && typeof homebase.setMany === 'function') {
      try {
        const res = await homebase.setMany(items);
        if (res && res.success !== false) {
          return;
        }
        console.warn('HomebaseStorage setMany rejected in bridge, falling back to storage.local', res?.error);
      } catch (err) {
        console.warn('HomebaseStorage setMany threw in bridge, falling back to storage.local', err);
      }
    }

    const fallback = getFallbackStorageApi();
    if (fallback && typeof fallback.set === 'function') {
      try {
        await fallback.set(items);
      } catch (err) {
        console.warn('Fallback storage.local set failed in bridge', err);
      }
    }
  }

  /**
   * Universal asynchronous key removal bridge.
   *
   * @param {string|Array<string>} keys - Key or keys to remove
   * @returns {Promise<void>}
   */
  async function bridgeStorageRemove(keys) {
    if (!keys) return;

    const homebase = getHomebaseStorage();
    if (homebase && typeof homebase.remove === 'function') {
      try {
        await homebase.remove(keys);
        return;
      } catch (err) {
        console.warn('HomebaseStorage remove failed in bridge, falling back to storage.local', err);
      }
    }

    const fallback = getFallbackStorageApi();
    if (fallback && typeof fallback.remove === 'function') {
      try {
        await fallback.remove(keys);
      } catch (err) {
        console.warn('Fallback storage.local remove failed in bridge', err);
      }
    }
  }

  /**
   * Registers a listener on the extension storage.onChanged event.
   *
   * @param {Function} listener
   */
  function bridgeStorageAddListener(listener) {
    if (typeof listener !== 'function') return;

    if (typeof window !== 'undefined') {
      if (window.browser?.storage?.onChanged?.addListener) {
        window.browser.storage.onChanged.addListener(listener);
        return;
      }
      if (window.chrome?.storage?.onChanged?.addListener) {
        window.chrome.storage.onChanged.addListener(listener);
        return;
      }
    }

    if (typeof browser !== 'undefined' && browser?.storage?.onChanged?.addListener) {
      browser.storage.onChanged.addListener(listener);
    } else if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener(listener);
    }
  }

  /**
   * Produces the storage bridge methods required by HomebaseGallery context.
   *
   * @returns {{
   *   storageLocalGet: Function,
   *   storageLocalSet: Function,
   *   storageLocalRemove: Function
   * }}
   */
  function createGalleryStorageBridge() {
    return {
      storageLocalGet: bridgeStorageGet,
      storageLocalSet: bridgeStorageSet,
      storageLocalRemove: bridgeStorageRemove
    };
  }

  /**
   * Produces the storage bridge methods required by BookmarkEditor context.
   *
   * @returns {{
   *   storageLocalGet: Function,
   *   storageLocalSet: Function,
   *   addStorageChangedListener: Function
   * }}
   */
  function createBookmarkEditorStorageBridge() {
    return {
      storageLocalGet: bridgeStorageGet,
      storageLocalSet: bridgeStorageSet,
      addStorageChangedListener: bridgeStorageAddListener
    };
  }

  // Window & namespace exports
  if (typeof window !== 'undefined') {
    window.bridgeStorageGet = bridgeStorageGet;
    window.bridgeStorageSet = bridgeStorageSet;
    window.bridgeStorageRemove = bridgeStorageRemove;
    window.bridgeStorageAddListener = bridgeStorageAddListener;
    window.createGalleryStorageBridge = createGalleryStorageBridge;
    window.createBookmarkEditorStorageBridge = createBookmarkEditorStorageBridge;

    window.HomebaseHostStorageAdapter = {
      bridgeStorageGet,
      bridgeStorageSet,
      bridgeStorageRemove,
      bridgeStorageAddListener,
      createGalleryStorageBridge,
      createBookmarkEditorStorageBridge
    };
  }
})();
