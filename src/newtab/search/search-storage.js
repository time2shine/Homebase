// Search Storage Service
// Coordinates current search engine selection, default engine preferences,
// search configuration, and fast-search mirror synchronization via HomebaseStorage
// with defensive fallback to browser.storage.local.

const CURRENT_SEARCH_ENGINE_ID_KEY = 'currentSearchEngineId';
const APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEngine';
const APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEngine';
const SEARCH_ENGINES_PREF_KEY = 'searchEnginesConfig';
const FAST_SEARCH_STORAGE_KEY = 'fast-search';

/**
 * Retrieves the currently selected search engine ID.
 *
 * @returns {Promise<string>} Engine ID (defaults to 'google')
 */
async function getCurrentSearchEngineId() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(CURRENT_SEARCH_ENGINE_ID_KEY, 'google');
      return typeof val === 'string' && val.trim() ? val.trim() : 'google';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(CURRENT_SEARCH_ENGINE_ID_KEY);
      const val = stored && stored[CURRENT_SEARCH_ENGINE_ID_KEY];
      return typeof val === 'string' && val.trim() ? val.trim() : 'google';
    }
    return 'google';
  } catch (err) {
    console.warn('Failed to read current search engine id', err);
    return 'google';
  }
}

/**
 * Persists the current search engine ID and optionally syncs the fast-search mirror.
 *
 * @param {string|Object} engineOrId - Engine ID string or engine object { id, name, ... }
 * @param {Object} [options]
 * @param {Object} [options.engine] - Engine object for fast-search cache sync if id was passed
 * @returns {Promise<string>} Persisted engine ID
 */
async function setCurrentSearchEngine(engineOrId, options = {}) {
  const engineObj = (engineOrId && typeof engineOrId === 'object') ? engineOrId : options.engine;
  const rawId = (engineOrId && typeof engineOrId === 'object') ? engineOrId.id : engineOrId;
  const safeId = typeof rawId === 'string' && rawId.trim() ? rawId.trim().slice(0, 64) : 'google';

  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(CURRENT_SEARCH_ENGINE_ID_KEY, safeId);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [CURRENT_SEARCH_ENGINE_ID_KEY]: safeId });
    }
  } catch (err) {
    console.warn('Failed to persist current search engine', err);
  }

  if (engineObj) {
    writeFastSearchCache(engineObj);
  }

  return safeId;
}

/**
 * Alias for setCurrentSearchEngine.
 */
async function setCurrentSearchEngineId(engineId, options = {}) {
  return setCurrentSearchEngine(engineId, options);
}

/**
 * Retrieves the configured default search engine ID.
 *
 * @returns {Promise<string>} Default engine ID (defaults to 'google')
 */
async function getDefaultSearchEngineId() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(APP_SEARCH_DEFAULT_ENGINE_KEY, 'google');
      return typeof val === 'string' && val.trim() ? val.trim() : 'google';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(APP_SEARCH_DEFAULT_ENGINE_KEY);
      const val = stored && stored[APP_SEARCH_DEFAULT_ENGINE_KEY];
      return typeof val === 'string' && val.trim() ? val.trim() : 'google';
    }
    return 'google';
  } catch (err) {
    console.warn('Failed to read default search engine id', err);
    return 'google';
  }
}

/**
 * Persists the default search engine ID preference.
 *
 * @param {string} engineId
 * @returns {Promise<void>}
 */
async function setDefaultSearchEngineId(engineId) {
  const safeId = typeof engineId === 'string' && engineId.trim() ? engineId.trim().slice(0, 64) : 'google';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(APP_SEARCH_DEFAULT_ENGINE_KEY, safeId);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [APP_SEARCH_DEFAULT_ENGINE_KEY]: safeId });
    }
  } catch (err) {
    console.warn('Failed to persist default search engine', err);
  }
}

/**
 * Retrieves the remember-search-engine preference.
 *
 * @returns {Promise<boolean>}
 */
async function getSearchRememberEnginePreference() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(APP_SEARCH_REMEMBER_ENGINE_KEY, true);
      return typeof val === 'boolean' ? val : true;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(APP_SEARCH_REMEMBER_ENGINE_KEY);
      return stored && typeof stored[APP_SEARCH_REMEMBER_ENGINE_KEY] === 'boolean'
        ? stored[APP_SEARCH_REMEMBER_ENGINE_KEY]
        : true;
    }
    return true;
  } catch (err) {
    console.warn('Failed to read remember search engine preference', err);
    return true;
  }
}

/**
 * Persists the remember-search-engine preference.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
async function setSearchRememberEnginePreference(enabled) {
  const val = Boolean(enabled);
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(APP_SEARCH_REMEMBER_ENGINE_KEY, val);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [APP_SEARCH_REMEMBER_ENGINE_KEY]: val });
    }
  } catch (err) {
    console.warn('Failed to persist remember search engine preference', err);
  }
}

/**
 * Retrieves the search engines configuration array.
 *
 * @returns {Promise<Array>}
 */
async function getSearchEnginesConfig() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(SEARCH_ENGINES_PREF_KEY, []);
      return Array.isArray(val) ? val : [];
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(SEARCH_ENGINES_PREF_KEY);
      const val = stored && stored[SEARCH_ENGINES_PREF_KEY];
      return Array.isArray(val) ? val : [];
    }
    return [];
  } catch (err) {
    console.warn('Failed to read search engines config', err);
    return [];
  }
}

/**
 * Persists the search engines configuration array.
 *
 * @param {Array} config
 * @returns {Promise<void>}
 */
async function setSearchEnginesConfig(config) {
  const val = Array.isArray(config) ? config : [];
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(SEARCH_ENGINES_PREF_KEY, val);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [SEARCH_ENGINES_PREF_KEY]: val });
    }
  } catch (err) {
    console.warn('Failed to persist search engines config', err);
  }
}

/**
 * Loads all search preferences in a single batch read.
 *
 * @returns {Promise<Object>}
 */
async function getSearchPreferences() {
  const keys = [
    SEARCH_ENGINES_PREF_KEY,
    CURRENT_SEARCH_ENGINE_ID_KEY,
    APP_SEARCH_REMEMBER_ENGINE_KEY,
    APP_SEARCH_DEFAULT_ENGINE_KEY
  ];
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
      return await window.HomebaseStorage.getMany(keys);
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return await browser.storage.local.get(keys);
    }
    return {};
  } catch (err) {
    console.warn('Failed to load search preferences', err);
    return {};
  }
}

/**
 * Persists multiple search preferences in a batch.
 *
 * @param {Object} prefs - Key-value map of preferences to update
 * @returns {Promise<void>}
 */
async function setSearchPreferences(prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
      await window.HomebaseStorage.setMany(prefs);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set(prefs);
    }
  } catch (err) {
    console.warn('Failed to persist search preferences batch', err);
  }
}

/**
 * Constructs the fast-search preview payload for instant-load synchronization.
 *
 * @param {Object} engine
 * @returns {Object|null}
 */
function getFastSearchPayload(engine) {
  if (!engine) return null;

  let placeholder = `Search with ${engine.name || ''}`;
  if (typeof searchInput !== 'undefined' && searchInput && searchInput.placeholder) {
    placeholder = searchInput.placeholder;
  } else if (typeof document !== 'undefined') {
    const input = document.getElementById('search-input');
    if (input && input.placeholder) {
      placeholder = input.placeholder;
    }
  }

  return {
    placeholder,
    selectorData: {
      name: engine.name || '',
      color: engine.color || '#333',
      symbolId: engine.symbolId || null,
      fallback: (engine.name || '').charAt(0)
    },
    engineId: engine.id
  };
}

/**
 * Synchronizes the fast-search cache in localStorage.
 *
 * @param {Object} engine
 */
function writeFastSearchCache(engine) {
  const fastSearch = getFastSearchPayload(engine);
  if (!fastSearch) return;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FAST_SEARCH_STORAGE_KEY, JSON.stringify(fastSearch));
    }
  } catch (e) {
    // Ignore storage quota/security errors
  }
}

/**
 * Reads the cached fast-search preview from localStorage.
 *
 * @returns {Object|null}
 */
function getFastSearchCache() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FAST_SEARCH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Clears the fast-search cache from localStorage.
 */
function clearFastSearchCache() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(FAST_SEARCH_STORAGE_KEY);
    }
  } catch (e) {
    // Ignore storage errors
  }
}

// Window & namespace exports
if (typeof window !== 'undefined') {
  window.CURRENT_SEARCH_ENGINE_ID_KEY = CURRENT_SEARCH_ENGINE_ID_KEY;
  window.APP_SEARCH_DEFAULT_ENGINE_KEY = APP_SEARCH_DEFAULT_ENGINE_KEY;
  window.APP_SEARCH_REMEMBER_ENGINE_KEY = APP_SEARCH_REMEMBER_ENGINE_KEY;
  window.SEARCH_ENGINES_PREF_KEY = SEARCH_ENGINES_PREF_KEY;
  window.FAST_SEARCH_STORAGE_KEY = FAST_SEARCH_STORAGE_KEY;

  window.getCurrentSearchEngineId = getCurrentSearchEngineId;
  window.getCurrentSearchEngine = getCurrentSearchEngineId;
  window.setCurrentSearchEngine = setCurrentSearchEngine;
  window.setCurrentSearchEngineId = setCurrentSearchEngineId;

  window.getDefaultSearchEngineId = getDefaultSearchEngineId;
  window.setDefaultSearchEngineId = setDefaultSearchEngineId;
  window.getSearchDefaultEngine = getDefaultSearchEngineId;
  window.setSearchDefaultEngine = setDefaultSearchEngineId;
  window.getSearchEnginePreference = getDefaultSearchEngineId;
  window.setSearchEnginePreference = setDefaultSearchEngineId;

  window.getSearchRememberEnginePreference = getSearchRememberEnginePreference;
  window.setSearchRememberEnginePreference = setSearchRememberEnginePreference;

  window.getSearchEnginesConfig = getSearchEnginesConfig;
  window.setSearchEnginesConfig = setSearchEnginesConfig;

  window.getSearchPreferences = getSearchPreferences;
  window.setSearchPreferences = setSearchPreferences;

  window.getFastSearchPayload = getFastSearchPayload;
  window.writeFastSearchCache = writeFastSearchCache;
  window.getFastSearchCache = getFastSearchCache;
  window.clearFastSearchCache = clearFastSearchCache;

  window.HomebaseSearchStorage = {
    CURRENT_SEARCH_ENGINE_ID_KEY,
    APP_SEARCH_DEFAULT_ENGINE_KEY,
    APP_SEARCH_REMEMBER_ENGINE_KEY,
    SEARCH_ENGINES_PREF_KEY,
    FAST_SEARCH_STORAGE_KEY,
    getCurrentSearchEngineId,
    getCurrentSearchEngine: getCurrentSearchEngineId,
    setCurrentSearchEngine,
    setCurrentSearchEngineId,
    getDefaultSearchEngineId,
    setDefaultSearchEngineId,
    getSearchDefaultEngine: getDefaultSearchEngineId,
    setSearchDefaultEngine: setDefaultSearchEngineId,
    getSearchEnginePreference: getDefaultSearchEngineId,
    setSearchEnginePreference: setDefaultSearchEngineId,
    getSearchRememberEnginePreference,
    setSearchRememberEnginePreference,
    getSearchEnginesConfig,
    setSearchEnginesConfig,
    getSearchPreferences,
    setSearchPreferences,
    getFastSearchPayload,
    writeFastSearchCache,
    getFastSearchCache,
    clearFastSearchCache
  };
}
