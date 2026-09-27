// ===============================================
// Homebase — Unified Storage Service Abstraction
// ===============================================

/**
 * Authoritative storage service for Homebase dashboard.
 * Coordinates browser.storage.local persistence, window.localStorage fast-mirrors,
 * and automated schema validation via HomebaseValidator.
 *
 * Invariants:
 * - Zero network calls
 * - Zero telemetry
 * - No browser.storage.sync
 * - Pure vanilla ES2022+ classic script architecture
 * - Defensive prototype inspection and prototype pollution immunity
 */
(function() {
  'use strict';

  /**
   * Mapping of canonical storage keys to their synchronous localStorage fast mirrors.
   * Read synchronously by src/preload.js during <head> execution to eliminate layout shifts.
   */
  const FAST_MIRROR_MAP = Object.freeze({
    appBackgroundDim: 'fast-bg-dim',
    widgetOrder: 'fast-widget-order',
    clockFormat: 'fast-clock-format',
    appSearchAlignment: 'fast-search-align',
    appBookmarkTextBg: 'fast-bookmark-bg',
    appCustomColor: 'fast-custom-color',
    appPerformanceMode: 'fast-perf-mode'
  });

  /**
   * Resolves the active browser storage.local API across Chrome and Firefox environments.
   *
   * @returns {Object|null}
   */
  function getStorageApi() {
    if (typeof window !== 'undefined') {
      if (window.browser?.storage?.local) return window.browser.storage.local;
      if (window.chrome?.storage?.local) return window.chrome.storage.local;
    }
    return null;
  }

  /**
   * Resolves the HomebaseValidator instance if loaded.
   *
   * @returns {Object|null}
   */
  function getValidator() {
    if (typeof window !== 'undefined' && window.HomebaseValidator) {
      return window.HomebaseValidator;
    }
    return null;
  }

  /**
   * Resolves the HomebaseDiagnostics instance if loaded.
   *
   * @returns {Object|null}
   */
  function getDiagnostics() {
    if (typeof window !== 'undefined' && window.HomebaseDiagnostics) {
      return window.HomebaseDiagnostics;
    }
    return null;
  }

  /**
   * Strict prototype inspection ensuring value is a plain JavaScript object.
   *
   * @param {*} value
   * @returns {boolean}
   */
  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (proto === null) return true;
    return Object.getPrototypeOf(proto) === null;
  }

  /**
   * Synchronizes a key-value pair to its registered localStorage fast-mirror.
   * Contained within try...catch to safely handle QuotaExceededError or private browsing blocks.
   *
   * @param {string} key
   * @param {*} value
   */
  function syncFastMirror(key, value) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const mirrorKey = FAST_MIRROR_MAP[key];
    if (!mirrorKey) return;

    try {
      if (value === undefined || value === null) {
        window.localStorage.removeItem(mirrorKey);
      } else if (typeof value === 'object') {
        window.localStorage.setItem(mirrorKey, JSON.stringify(value));
      } else {
        window.localStorage.setItem(mirrorKey, String(value));
      }
    } catch (_) {
      // Fail-safe: QuotaExceededError or security barrier
    }
  }

  /**
   * Removes a fast-mirror key from localStorage.
   *
   * @param {string} key
   */
  function removeFastMirror(key) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const mirrorKey = FAST_MIRROR_MAP[key];
    if (!mirrorKey) return;

    try {
      window.localStorage.removeItem(mirrorKey);
    } catch (_) {
      // Fail-safe
    }
  }

  /**
   * Reads a single value from browser.storage.local with validation and fallback.
   *
   * @param {string} key - Canonical storage key
   * @param {*} [defaultValue=undefined] - Optional caller fallback
   * @returns {Promise<*>} Validated/sanitized value or fallback
   */
  async function get(key, defaultValue = undefined) {
    if (typeof key !== 'string' || !key.trim()) {
      return defaultValue;
    }
    // Prototype pollution guard
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return defaultValue;
    }

    const storage = getStorageApi();
    if (!storage) {
      return defaultValue;
    }

    try {
      const res = await storage.get(key);
      const storedVal = res ? res[key] : undefined;
      const validator = getValidator();

      if (storedVal !== undefined) {
        if (validator && typeof validator.sanitizeKey === 'function') {
          const sanitized = validator.sanitizeKey(key, storedVal, { fallbackToDefault: true });
          return sanitized !== undefined ? sanitized : (defaultValue !== undefined ? defaultValue : storedVal);
        }
        return storedVal;
      }

      // Key missing in storage: query schema default if validator is available
      if (validator && typeof validator.sanitizeKey === 'function') {
        const schemaDefault = validator.sanitizeKey(key, undefined, { fallbackToDefault: true });
        if (schemaDefault !== undefined) {
          return defaultValue !== undefined ? defaultValue : schemaDefault;
        }
      }

      return defaultValue;
    } catch (_) {
      return defaultValue;
    }
  }

  /**
   * Batch read from browser.storage.local with validation for each key.
   *
   * @param {Array<string>|null} keys - Array of keys, or null for all keys
   * @returns {Promise<Object>} Dictionary of sanitized key-value pairs
   */
  async function getMany(keys = null) {
    const storage = getStorageApi();
    if (!storage) return {};

    let queryKeys = keys;
    if (typeof keys === 'string') {
      queryKeys = [keys];
    } else if (keys !== null && !Array.isArray(keys)) {
      return {};
    }

    try {
      const res = (await storage.get(queryKeys)) || {};
      const validator = getValidator();
      const output = {};

      if (Array.isArray(queryKeys)) {
        for (const k of queryKeys) {
          if (typeof k !== 'string' || !k.trim()) continue;
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;

          const storedVal = res[k];
          if (storedVal !== undefined) {
            if (validator && typeof validator.sanitizeKey === 'function') {
              output[k] = validator.sanitizeKey(k, storedVal, { fallbackToDefault: true });
            } else {
              output[k] = storedVal;
            }
          } else if (validator && typeof validator.sanitizeKey === 'function') {
            const defVal = validator.sanitizeKey(k, undefined, { fallbackToDefault: true });
            if (defVal !== undefined) {
              output[k] = defVal;
            }
          }
        }
      } else {
        // null queryKeys -> all stored keys
        for (const [k, v] of Object.entries(res)) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
          if (validator && typeof validator.sanitizeKey === 'function') {
            const sanitized = validator.sanitizeKey(k, v, { fallbackToDefault: false });
            output[k] = sanitized !== undefined ? sanitized : v;
          } else {
            output[k] = v;
          }
        }
      }

      return output;
    } catch (_) {
      return {};
    }
  }

  /**
   * Writes a single key-value pair with schema validation gating and fast-mirror sync.
   * Rejects invalid writes safely without modifying storage.
   *
   * @param {string} key - Canonical storage key
   * @param {*} value - Candidate value
   * @returns {Promise<{ success: boolean, key?: string, value?: *, error?: string, detail?: string }>}
   */
  async function set(key, value) {
    if (typeof key !== 'string' || !key.trim()) {
      return { success: false, error: 'INVALID_KEY', detail: 'Key must be a non-empty string.' };
    }
    // Prototype pollution guard
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return { success: false, error: 'FORBIDDEN_PROPERTY', detail: 'Forbidden prototype property name.' };
    }

    const storage = getStorageApi();
    if (!storage) {
      return { success: false, error: 'STORAGE_UNAVAILABLE', detail: 'Browser storage API is unavailable.' };
    }

    const validator = getValidator();
    let finalValue = value;

    if (validator) {
      const isValid = typeof validator.validateKey === 'function' ? validator.validateKey(key, value) : true;

      if (!isValid) {
        // Attempt recovery/sanitization (e.g. numeric clamping or hex normalization)
        if (typeof validator.sanitizeKey === 'function') {
          const sanitized = validator.sanitizeKey(key, value, { fallbackToDefault: false });
          if (sanitized !== undefined) {
            finalValue = sanitized;
          } else {
            // Reject unrecoverable invalid write safely
            return {
              success: false,
              key,
              error: 'VALIDATION_FAILED',
              detail: `Value for key '${key}' failed schema validation and cannot be safely sanitized.`
            };
          }
        } else {
          return {
            success: false,
            key,
            error: 'VALIDATION_FAILED',
            detail: `Value for key '${key}' failed schema validation.`
          };
        }
      } else if (typeof validator.sanitizeKey === 'function') {
        // Normalize valid value (e.g. #fff -> #ffffff, or trimmed string)
        const normalized = validator.sanitizeKey(key, value, { fallbackToDefault: false });
        if (normalized !== undefined) {
          finalValue = normalized;
        }
      }
    }

    try {
      await storage.set({ [key]: finalValue });
      syncFastMirror(key, finalValue);
      return { success: true, key, value: finalValue };
    } catch (err) {
      return { success: false, key, error: 'STORAGE_WRITE_FAILED', detail: err.message };
    }
  }

  /**
   * Writes multiple key-value pairs atomically with validation.
   * Only sanitized, valid values are written. Invalid keys are rejected safely.
   *
   * @param {Object} values - Key-value dictionary
   * @returns {Promise<{ success: boolean, writtenKeys: Array<string>, rejectedKeys: Array<string>, count: number, error?: string }>}
   */
  async function setMany(values) {
    if (!isPlainObject(values)) {
      return { success: false, writtenKeys: [], rejectedKeys: [], count: 0, error: 'INVALID_INPUT' };
    }

    const storage = getStorageApi();
    if (!storage) {
      return { success: false, writtenKeys: [], rejectedKeys: [], count: 0, error: 'STORAGE_UNAVAILABLE' };
    }

    const validator = getValidator();
    const validBatch = {};
    const rejectedKeys = [];

    for (const [key, value] of Object.entries(values)) {
      // Prototype pollution guard
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || typeof key !== 'string' || !key.trim()) {
        rejectedKeys.push(key);
        continue;
      }

      let finalValue = value;
      let isValid = true;

      if (validator) {
        isValid = typeof validator.validateKey === 'function' ? validator.validateKey(key, value) : true;
        if (!isValid) {
          if (typeof validator.sanitizeKey === 'function') {
            const sanitized = validator.sanitizeKey(key, value, { fallbackToDefault: false });
            if (sanitized !== undefined) {
              finalValue = sanitized;
              isValid = true;
            } else {
              isValid = false;
            }
          }
        } else if (typeof validator.sanitizeKey === 'function') {
          const normalized = validator.sanitizeKey(key, value, { fallbackToDefault: false });
          if (normalized !== undefined) {
            finalValue = normalized;
          }
        }
      }

      if (isValid && finalValue !== undefined) {
        validBatch[key] = finalValue;
      } else {
        rejectedKeys.push(key);
      }
    }

    const writtenKeys = Object.keys(validBatch);
    if (writtenKeys.length === 0) {
      return {
        success: false,
        writtenKeys: [],
        rejectedKeys,
        count: 0,
        error: 'NO_VALID_KEYS',
        detail: 'None of the provided values passed validation.'
      };
    }

    try {
      await storage.set(validBatch);
      for (const [k, v] of Object.entries(validBatch)) {
        syncFastMirror(k, v);
      }
      return {
        success: true,
        writtenKeys,
        rejectedKeys,
        count: writtenKeys.length
      };
    } catch (err) {
      return {
        success: false,
        writtenKeys: [],
        rejectedKeys,
        count: 0,
        error: 'STORAGE_WRITE_FAILED',
        detail: err.message
      };
    }
  }

  /**
   * Safely removes one or more keys from browser.storage.local and cleans fast mirrors.
   *
   * @param {string|Array<string>} key - Key or array of keys to remove
   * @returns {Promise<{ success: boolean, removedKeys?: Array<string>, error?: string }>}
   */
  async function remove(key) {
    const storage = getStorageApi();
    if (!storage) {
      return { success: false, error: 'STORAGE_UNAVAILABLE' };
    }

    let keysToRemove = [];
    if (typeof key === 'string' && key.trim()) {
      keysToRemove = [key.trim()];
    } else if (Array.isArray(key)) {
      keysToRemove = key.filter((k) => typeof k === 'string' && k.trim());
    } else {
      return { success: false, error: 'INVALID_KEY' };
    }

    // Filter prototype keys
    keysToRemove = keysToRemove.filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype');

    if (keysToRemove.length === 0) {
      return { success: false, error: 'NO_KEYS' };
    }

    try {
      await storage.remove(keysToRemove);
      for (const k of keysToRemove) {
        removeFastMirror(k);
      }
      return { success: true, removedKeys: keysToRemove };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Returns a complete, read-only snapshot of current storage.local state.
   * Deep-cloned to prevent callers from mutating internal state.
   *
   * @returns {Promise<Object>}
   */
  async function snapshot() {
    const storage = getStorageApi();
    if (!storage) return {};

    try {
      const raw = (await storage.get(null)) || {};
      return JSON.parse(JSON.stringify(raw));
    } catch (_) {
      return {};
    }
  }

  /**
   * Returns diagnostic storage service health metadata.
   * Guarantees strict privacy: zero user payloads, bookmark URLs, or personal data exposed.
   *
   * @returns {Promise<Object>}
   */
  async function health() {
    const storage = getStorageApi();
    const validator = getValidator();
    const diagnostics = getDiagnostics();
    const storageAvailable = Boolean(storage);

    let keyCount = 0;
    let schemaVer = null;
    let storageError = null;

    if (storageAvailable) {
      try {
        const all = (await storage.get(null)) || {};
        keyCount = Object.keys(all).length;
        if (all.schemaVersion !== undefined) {
          schemaVer = all.schemaVersion;
        }
      } catch (err) {
        storageError = err.message;
      }
    }

    return {
      service: 'HomebaseStorage',
      status: storageAvailable ? (storageError ? 'DEGRADED' : 'HEALTHY') : 'UNAVAILABLE',
      storageAvailable,
      totalKeys: keyCount,
      schemaVersion: schemaVer,
      validatorAttached: Boolean(validator),
      diagnosticsAttached: Boolean(diagnostics),
      fastMirrorsActive: typeof window !== 'undefined' && Boolean(window.localStorage),
      timestamp: new Date().toISOString(),
      error: storageError
    };
  }

  // Define HomebaseStorage API
  const HomebaseStorage = {
    get,
    getMany,
    set,
    setMany,
    remove,
    snapshot,
    health,
    FAST_MIRROR_MAP
  };

  // Mount to global window namespace
  if (typeof window !== 'undefined') {
    window.HomebaseStorage = Object.freeze(HomebaseStorage);
  }
})();
