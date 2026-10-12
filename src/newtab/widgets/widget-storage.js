/**
 * Homebase Widget Storage Service
 * Canonical single owner of widget persistence and fast preload mirror synchronization.
 * Coordinates widget order, sidebar visibility, time format, weather cache,
 * quote state, news cache, and todo items via HomebaseStorage with defensive
 * fallback to browser.storage.local and localStorage fast mirrors.
 */
(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  // Storage Keys (Primary)
  const WIDGET_ORDER_KEY = 'widgetOrder';
  const APP_SHOW_SIDEBAR_KEY = 'appShowSidebar';
  const APP_TIME_FORMAT_KEY = 'appTimeFormatPreference';

  // Weather Keys
  const APP_SHOW_WEATHER_KEY = 'appShowWeather';
  const CACHED_WEATHER_DATA_KEY = 'cachedWeatherData';
  const CACHED_CITY_NAME_KEY = 'cachedCityName';
  const CACHED_UNITS_KEY = 'cachedUnits';
  const WEATHER_FETCHED_AT_KEY = 'weatherFetchedAt';

  // Quote Keys
  const QUOTE_INDEX_KEY = 'quoteLocalIndexV1';
  const QUOTE_TAGS_KEY = 'quoteTags';
  const QUOTE_FREQUENCY_KEY = 'quoteFrequency';

  // News Keys
  const APP_NEWS_SOURCE_KEY = 'appNewsSource';

  // Todo Keys
  const TODO_ITEMS_KEY = 'todoItems';
  const TODO_HIDE_DONE_KEY = 'todoHideDone';

  // Fast Preload Mirror Keys (localStorage)
  const FAST_WIDGET_ORDER_KEY = 'fast-widget-order';
  const FAST_SHOW_SIDEBAR_KEY = 'fast-show-sidebar';
  const FAST_SHOW_WEATHER_KEY = 'fast-show-weather';
  const FAST_TIME_FORMAT_KEY = 'fast-time-format';
  const FAST_WEATHER_KEY = 'fast-weather';
  const FAST_WEATHER_V2_KEY = 'fast-weather-v2';
  const FAST_QUOTE_KEY = 'fast-quote-state';
  const FAST_QUOTE_V2_KEY = 'fast-quote-v2';
  const FAST_NEWS_KEY = 'fast-news';
  const FAST_NEWS_V2_KEY = 'fast-news-v2';
  const FAST_TODO_KEY = 'fast-todo';

  const DEFAULT_WIDGET_ORDER = ['weather', 'quote', 'todo', 'news'];
  const VALID_WIDGET_IDS = new Set(DEFAULT_WIDGET_ORDER);

  // --- Internal Helpers ---

  function normalizeWidgetOrderList(order) {
    if (globalScope && typeof globalScope.normalizeWidgetOrder === 'function') {
      return globalScope.normalizeWidgetOrder(order);
    }
    if (!Array.isArray(order)) return DEFAULT_WIDGET_ORDER.slice();

    const seen = new Set();
    const result = [];
    order.forEach((id) => {
      if (VALID_WIDGET_IDS.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    });

    DEFAULT_WIDGET_ORDER.forEach((id) => {
      if (!seen.has(id)) {
        result.push(id);
      }
    });

    return result;
  }

  function getStorageService() {
    return (globalScope && globalScope.HomebaseStorage) || null;
  }

  function getBrowserStorage() {
    return (globalScope && globalScope.browser && globalScope.browser.storage && globalScope.browser.storage.local) || null;
  }

  function getLocalStorage() {
    try {
      return (globalScope && globalScope.localStorage) || null;
    } catch (_) {
      return null;
    }
  }

  function setFastMirror(key, value) {
    const ls = getLocalStorage();
    if (!ls) return;
    try {
      ls.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (_) {
      // Best-effort cache write; ignore quota or access errors
    }
  }

  function getFastMirror(key) {
    const ls = getLocalStorage();
    if (!ls) return null;
    try {
      return ls.getItem(key);
    } catch (_) {
      return null;
    }
  }

  async function storageGet(key, defaultValue = null) {
    try {
      const storage = getStorageService();
      if (storage && typeof storage.get === 'function') {
        const val = await storage.get(key, defaultValue);
        return val !== undefined && val !== null ? val : defaultValue;
      }
      const browserLocal = getBrowserStorage();
      if (browserLocal && typeof browserLocal.get === 'function') {
        const stored = await browserLocal.get(key);
        return stored && key in stored ? stored[key] : defaultValue;
      }
    } catch (err) {
      console.warn(`[HomebaseWidgetStorage] Failed to read ${key}:`, err);
    }
    return defaultValue;
  }

  async function storageGetMany(keys, defaults = {}) {
    try {
      const storage = getStorageService();
      if (storage && typeof storage.getMany === 'function') {
        const val = await storage.getMany(keys);
        return val && typeof val === 'object' ? { ...defaults, ...val } : defaults;
      }
      const browserLocal = getBrowserStorage();
      if (browserLocal && typeof browserLocal.get === 'function') {
        const stored = await browserLocal.get(keys);
        return stored && typeof stored === 'object' ? { ...defaults, ...stored } : defaults;
      }
    } catch (err) {
      console.warn('[HomebaseWidgetStorage] Failed to read batch:', err);
    }
    return defaults;
  }

  async function storageSet(key, value) {
    try {
      const storage = getStorageService();
      if (storage && typeof storage.set === 'function') {
        await storage.set(key, value);
        return;
      }
      const browserLocal = getBrowserStorage();
      if (browserLocal && typeof browserLocal.set === 'function') {
        await browserLocal.set({ [key]: value });
      }
    } catch (err) {
      console.warn(`[HomebaseWidgetStorage] Failed to write ${key}:`, err);
    }
  }

  async function storageSetMany(items) {
    if (!items || typeof items !== 'object') return;
    try {
      const storage = getStorageService();
      if (storage && typeof storage.setMany === 'function') {
        await storage.setMany(items);
        return;
      }
      const browserLocal = getBrowserStorage();
      if (browserLocal && typeof browserLocal.set === 'function') {
        await browserLocal.set(items);
      }
    } catch (err) {
      console.warn('[HomebaseWidgetStorage] Failed to write batch:', err);
    }
  }

  async function storageRemove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) return;
    try {
      const storage = getStorageService();
      if (storage && typeof storage.remove === 'function') {
        await storage.remove(list);
        return;
      }
      const browserLocal = getBrowserStorage();
      if (browserLocal && typeof browserLocal.remove === 'function') {
        await browserLocal.remove(list);
      }
    } catch (err) {
      console.warn('[HomebaseWidgetStorage] Failed to remove keys:', err);
    }
  }

  // --- Widget Order ---

  async function getWidgetOrder() {
    let order = await storageGet(WIDGET_ORDER_KEY, null);
    if (!order) {
      const mirror = getFastMirror(FAST_WIDGET_ORDER_KEY);
      if (mirror) {
        try {
          const parsed = JSON.parse(mirror);
          if (Array.isArray(parsed)) order = parsed;
        } catch (_) {}
      }
    }
    return normalizeWidgetOrderList(order);
  }

  async function setWidgetOrder(order) {
    const normalized = normalizeWidgetOrderList(order);
    setFastMirror(FAST_WIDGET_ORDER_KEY, JSON.stringify(normalized));
    await storageSet(WIDGET_ORDER_KEY, normalized);
    return normalized;
  }

  // --- Sidebar Visibility ---

  async function getSidebarVisibility() {
    const val = await storageGet(APP_SHOW_SIDEBAR_KEY, null);
    if (val !== null && val !== undefined) {
      return val !== false;
    }
    const mirror = getFastMirror(FAST_SHOW_SIDEBAR_KEY);
    if (mirror !== null) {
      return mirror !== '0';
    }
    return true;
  }

  async function setSidebarVisibility(visible) {
    const isVisible = visible !== false;
    setFastMirror(FAST_SHOW_SIDEBAR_KEY, isVisible ? '1' : '0');
    await storageSet(APP_SHOW_SIDEBAR_KEY, isVisible);
    return isVisible;
  }

  // --- Time Format ---

  async function getTimeFormat() {
    const val = await storageGet(APP_TIME_FORMAT_KEY, null);
    if (val === '12-hour' || val === '24-hour') {
      return val;
    }
    const mirror = getFastMirror(FAST_TIME_FORMAT_KEY);
    if (mirror === '12-hour' || mirror === '24-hour') {
      return mirror;
    }
    return '12-hour';
  }

  async function setTimeFormat(format) {
    const safeFormat = format === '24-hour' ? '24-hour' : '12-hour';
    setFastMirror(FAST_TIME_FORMAT_KEY, safeFormat);
    await storageSet(APP_TIME_FORMAT_KEY, safeFormat);
    return safeFormat;
  }

  // --- Weather Cache ---

  async function getWeatherCache() {
    const stored = await storageGetMany([
      CACHED_WEATHER_DATA_KEY,
      CACHED_CITY_NAME_KEY,
      CACHED_UNITS_KEY,
      WEATHER_FETCHED_AT_KEY
    ]);

    if (stored[CACHED_WEATHER_DATA_KEY]) {
      return {
        data: stored[CACHED_WEATHER_DATA_KEY],
        cityName: stored[CACHED_CITY_NAME_KEY] || '',
        units: stored[CACHED_UNITS_KEY] || 'c',
        fetchedAt: stored[WEATHER_FETCHED_AT_KEY] || 0
      };
    }

    const mirrorV2 = getFastMirror(FAST_WEATHER_V2_KEY) || getFastMirror(FAST_WEATHER_KEY);
    if (mirrorV2) {
      try {
        const parsed = JSON.parse(mirrorV2);
        if (parsed && typeof parsed === 'object') {
          return {
            data: parsed.data || null,
            cityName: parsed.city || parsed.cityName || '',
            units: parsed.units || 'c',
            fetchedAt: parsed.__timestamp || parsed.fetchedAt || 0
          };
        }
      } catch (_) {}
    }

    return {
      data: null,
      cityName: '',
      units: 'c',
      fetchedAt: 0
    };
  }

  async function setWeatherCache(cacheData) {
    const payload = cacheData || {};
    const data = payload.data !== undefined ? payload.data : (payload.cachedWeatherData || null);
    const cityName = String(payload.cityName || payload.cachedCityName || '');
    const units = String(payload.units || payload.cachedUnits || 'c');
    const fetchedAt = Number(payload.fetchedAt || payload.weatherFetchedAt || Date.now());

    await storageSetMany({
      [CACHED_WEATHER_DATA_KEY]: data,
      [CACHED_CITY_NAME_KEY]: cityName,
      [CACHED_UNITS_KEY]: units,
      [WEATHER_FETCHED_AT_KEY]: fetchedAt
    });

    const v2Mirror = {
      data,
      cityName,
      units,
      fetchedAt,
      __timestamp: fetchedAt
    };
    setFastMirror(FAST_WEATHER_V2_KEY, JSON.stringify(v2Mirror));

    // Also mirror to legacy fast-weather for instant_load compatibility
    const legacyMirror = payload.fastWeather || {
      city: cityName,
      temp: payload.temp || payload.temperature || '',
      desc: payload.desc || payload.description || '',
      icon: payload.icon || payload.emoji || '',
      __timestamp: fetchedAt
    };
    setFastMirror(FAST_WEATHER_KEY, JSON.stringify(legacyMirror));

    return { data, cityName, units, fetchedAt };
  }

  async function getWeatherSettings(keys) {
    const defaultKeys = [
      'weatherLat',
      'weatherLon',
      'weatherCityName',
      'weatherUnits',
      'weatherFetchedAt',
      'cachedWeatherData',
      'cachedCityName',
      'cachedUnits'
    ];
    const requestedKeys = Array.isArray(keys)
      ? keys
      : (typeof keys === 'string' ? [keys] : defaultKeys);
    return await storageGetMany(requestedKeys);
  }

  async function setWeatherSettings(settings) {
    if (!settings || typeof settings !== 'object') return {};
    await storageSetMany(settings);
    return settings;
  }

  async function removeWeatherSettings(keys) {
    const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : [
      'weatherLat',
      'weatherLon',
      'weatherCityName'
    ]);
    await storageRemove(list);
  }

  async function getWeatherVisibility() {
    const val = await storageGet(APP_SHOW_WEATHER_KEY, null);
    if (val !== null && val !== undefined) {
      return val !== false;
    }
    const mirror = getFastMirror(FAST_SHOW_WEATHER_KEY);
    if (mirror !== null) {
      return mirror !== '0';
    }
    return true;
  }

  async function setWeatherVisibility(visible) {
    const isVisible = visible !== false;
    setFastMirror(FAST_SHOW_WEATHER_KEY, isVisible ? '1' : '0');
    await storageSet(APP_SHOW_WEATHER_KEY, isVisible);
    return isVisible;
  }

  // --- Quote Cache ---

  async function getQuoteCache() {
    const stored = await storageGetMany([
      QUOTE_INDEX_KEY,
      QUOTE_TAGS_KEY,
      QUOTE_FREQUENCY_KEY
    ]);

    let state = {
      index: typeof stored[QUOTE_INDEX_KEY] === 'number' ? stored[QUOTE_INDEX_KEY] : 0,
      tags: Array.isArray(stored[QUOTE_TAGS_KEY]) ? stored[QUOTE_TAGS_KEY] : [],
      frequency: stored[QUOTE_FREQUENCY_KEY] || 'hourly',
      current: null,
      next: null,
      config: {}
    };

    const mirror = getFastMirror(FAST_QUOTE_V2_KEY) || getFastMirror(FAST_QUOTE_KEY);
    if (mirror) {
      try {
        const parsed = JSON.parse(mirror);
        if (parsed && typeof parsed === 'object') {
          state.current = parsed.current || null;
          state.next = parsed.next || null;
          state.config = parsed.config || {};
        }
      } catch (_) {}
    }

    return state;
  }

  async function setQuoteCache(cacheData) {
    const payload = cacheData || {};
    const toSave = {};

    if (typeof payload.index === 'number') {
      toSave[QUOTE_INDEX_KEY] = payload.index;
    }
    if (Array.isArray(payload.tags)) {
      toSave[QUOTE_TAGS_KEY] = payload.tags;
    }
    if (typeof payload.frequency === 'string' && payload.frequency.trim()) {
      toSave[QUOTE_FREQUENCY_KEY] = payload.frequency.trim();
    }

    if (Object.keys(toSave).length > 0) {
      await storageSetMany(toSave);
    }

    const mirrorData = {
      current: payload.current || null,
      next: payload.next || null,
      config: payload.config || {},
      index: payload.index ?? 0,
      __timestamp: Date.now()
    };
    setFastMirror(FAST_QUOTE_V2_KEY, JSON.stringify(mirrorData));
    setFastMirror(FAST_QUOTE_KEY, JSON.stringify(mirrorData));

    return payload;
  }

  // --- News Cache ---

  async function getNewsCache() {
    const source = await storageGet(APP_NEWS_SOURCE_KEY, 'top');
    const mirror = getFastMirror(FAST_NEWS_V2_KEY) || getFastMirror(FAST_NEWS_KEY);
    let items = [];
    let fetchedAt = 0;

    if (mirror) {
      try {
        const parsed = JSON.parse(mirror);
        if (parsed && typeof parsed === 'object') {
          items = Array.isArray(parsed.items) ? parsed.items : [];
          fetchedAt = parsed.__timestamp || parsed.fetchedAt || 0;
        }
      } catch (_) {}
    }

    return {
      source: source || 'top',
      items,
      fetchedAt
    };
  }

  async function setNewsCache(cacheData) {
    const payload = cacheData || {};
    const source = payload.source || 'top';
    const items = Array.isArray(payload.items) ? payload.items : [];
    const fetchedAt = Number(payload.fetchedAt || Date.now());

    await storageSet(APP_NEWS_SOURCE_KEY, source);

    const mirrorData = {
      source,
      items,
      __timestamp: fetchedAt
    };
    setFastMirror(FAST_NEWS_V2_KEY, JSON.stringify(mirrorData));
    setFastMirror(FAST_NEWS_KEY, JSON.stringify(mirrorData));

    return { source, items, fetchedAt };
  }

  // --- Todo State ---

  async function getTodoState() {
    const stored = await storageGetMany([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY]);
    let items = Array.isArray(stored[TODO_ITEMS_KEY]) ? stored[TODO_ITEMS_KEY] : null;
    let hideDone = stored[TODO_HIDE_DONE_KEY] === true;

    if (!items) {
      const mirror = getFastMirror(FAST_TODO_KEY);
      if (mirror) {
        try {
          const parsed = JSON.parse(mirror);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.items)) items = parsed.items;
            if (parsed.hideDone !== undefined) hideDone = Boolean(parsed.hideDone);
          }
        } catch (_) {}
      }
    }

    return {
      items: items || [],
      hideDone
    };
  }

  async function setTodoState(todoState) {
    const payload = todoState || {};
    const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
    const hideDone = Boolean(payload.hideDone);

    await storageSetMany({
      [TODO_ITEMS_KEY]: items,
      [TODO_HIDE_DONE_KEY]: hideDone
    });

    const mirrorData = {
      items,
      hideDone,
      count: items.length,
      __timestamp: Date.now()
    };
    setFastMirror(FAST_TODO_KEY, JSON.stringify(mirrorData));

    return { items, hideDone };
  }

  // --- Public Service Interface ---

  const service = {
    // Keys
    WIDGET_ORDER_KEY,
    FAST_WIDGET_ORDER_KEY,
    APP_SHOW_SIDEBAR_KEY,
    FAST_SHOW_SIDEBAR_KEY,
    APP_SHOW_WEATHER_KEY,
    FAST_SHOW_WEATHER_KEY,
    APP_TIME_FORMAT_KEY,
    FAST_TIME_FORMAT_KEY,
    CACHED_WEATHER_DATA_KEY,
    CACHED_CITY_NAME_KEY,
    CACHED_UNITS_KEY,
    WEATHER_FETCHED_AT_KEY,
    FAST_WEATHER_KEY,
    FAST_WEATHER_V2_KEY,
    QUOTE_INDEX_KEY,
    QUOTE_TAGS_KEY,
    QUOTE_FREQUENCY_KEY,
    FAST_QUOTE_KEY,
    FAST_QUOTE_V2_KEY,
    APP_NEWS_SOURCE_KEY,
    FAST_NEWS_KEY,
    FAST_NEWS_V2_KEY,
    TODO_ITEMS_KEY,
    TODO_HIDE_DONE_KEY,
    FAST_TODO_KEY,
    DEFAULT_WIDGET_ORDER,

    // Methods
    getWidgetOrder,
    setWidgetOrder,
    getSidebarVisibility,
    setSidebarVisibility,
    getWeatherVisibility,
    setWeatherVisibility,
    getTimeFormat,
    setTimeFormat,
    getWeatherCache,
    setWeatherCache,
    getWeatherSettings,
    setWeatherSettings,
    removeWeatherSettings,
    getQuoteCache,
    setQuoteCache,
    getNewsCache,
    setNewsCache,
    getTodoState,
    setTodoState,
    getFastMirror,
    setFastMirror
  };

  if (typeof window !== 'undefined') {
    window.HomebaseWidgetStorage = service;
  }
  if (globalScope) {
    globalScope.HomebaseWidgetStorage = service;
  }
})();
