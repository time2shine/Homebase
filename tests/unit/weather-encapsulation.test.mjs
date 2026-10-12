import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');
const widgetStorageScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-storage.js'), 'utf8');
const weatherScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/weather.js'), 'utf8');

function createMockClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((n) => classes.add(n)),
    remove: (...names) => names.forEach((n) => classes.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      } else if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return classes.has(name);
    },
    contains: (name) => classes.has(name)
  };
}

function createMockElement(id = '', tag = 'div', className = '') {
  const listeners = new Map();
  const dataset = {};
  const attrs = new Map();
  const children = [];
  const classList = createMockClassList();
  if (className) {
    className.split(/\s+/).filter(Boolean).forEach((c) => classList.add(c));
  }

  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset,
    classList,
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    childNodes: children,
    children,
    style: {},
    focus: () => {},
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners.has(type)) {
        listeners.get(type).delete(handler);
      }
    },
    _getListenerCount: (type) => (listeners.has(type) ? listeners.get(type).size : 0),
    _dispatch: (type, eventObj = {}) => {
      if (listeners.has(type)) {
        listeners.get(type).forEach((h) => h({ target: el, ...eventObj }));
      }
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    replaceChildren: (...nodes) => {
      children.length = 0;
      nodes.forEach((n) => children.push(n));
    },
    querySelector: (sel) => {
      if (sel === '.weather-body') return el._weatherBody || null;
      if (sel === '.weather-footer') return el._weatherFooter || null;
      return null;
    },
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => true,
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null)
  };
  return el;
}

function setupTestEnvironment(customStorage = {}) {
  const domElements = new Map();

  const weatherWidgetEl = createMockElement('', 'div', 'widget-weather');
  const weatherBodyEl = createMockElement('weather-body', 'div');
  const weatherFooterEl = createMockElement('weather-footer', 'div');
  weatherWidgetEl._weatherBody = weatherBodyEl;
  weatherWidgetEl._weatherFooter = weatherFooterEl;

  domElements.set('widget-weather', weatherWidgetEl);
  domElements.set('weather-setup', createMockElement('weather-setup', 'div'));
  domElements.set('weather-choose-city-btn', createMockElement('weather-choose-city-btn', 'button'));
  domElements.set('weather-settings-modal', createMockElement('weather-settings-modal', 'dialog'));
  domElements.set('weather-settings-close-btn', createMockElement('weather-settings-close-btn', 'button'));
  domElements.set('weather-settings-cancel-btn', createMockElement('weather-settings-cancel-btn', 'button'));
  domElements.set('weather-settings-save-btn', createMockElement('weather-settings-save-btn', 'button'));
  domElements.set('modal-temp-unit-toggle', createMockElement('modal-temp-unit-toggle', 'input'));
  domElements.set('modal-location-input', createMockElement('modal-location-input', 'input'));
  domElements.set('modal-location-results', createMockElement('modal-location-results', 'div'));
  domElements.set('modal-set-location-auto-btn', createMockElement('modal-set-location-auto-btn', 'button'));
  domElements.set('weather-refresh-btn', createMockElement('weather-refresh-btn', 'button'));
  domElements.set('weather-updated', createMockElement('weather-updated', 'span'));
  domElements.set('weather-city', createMockElement('weather-city', 'span'));
  domElements.set('weather-temp', createMockElement('weather-temp', 'span'));
  domElements.set('weather-desc', createMockElement('weather-desc', 'span'));
  domElements.set('weather-icon', createMockElement('weather-icon', 'span'));
  domElements.set('weather-pressure', createMockElement('weather-pressure', 'span'));
  domElements.set('weather-humidity', createMockElement('weather-humidity', 'span'));
  domElements.set('weather-cloudcover', createMockElement('weather-cloudcover', 'span'));
  domElements.set('weather-precip-prob', createMockElement('weather-precip-prob', 'span'));
  domElements.set('weather-sunrise', createMockElement('weather-sunrise', 'span'));
  domElements.set('weather-sunset', createMockElement('weather-sunset', 'span'));

  const getOrCreateEl = (id, tag = 'div') => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id, tag));
    }
    return domElements.get(id);
  };

  const timers = {
    timeouts: new Map(),
    nextId: 1
  };

  const storageStore = new Map(Object.entries(customStorage));
  const localStorageStore = new Map();

  const createdControllers = [];
  class TrackingAbortController extends globalThis.AbortController {
    constructor() {
      super();
      createdControllers.push(this);
    }
  }

  const documentMock = {
    visibilityState: 'visible',
    documentElement: {
      classList: createMockClassList()
    },
    querySelector: (sel) => {
      if (sel === '.widget-weather') return weatherWidgetEl;
      return null;
    },
    querySelectorAll: () => [],
    getElementById: (id) => getOrCreateEl(id),
    createElement: (tag) => createMockElement('', tag),
    createTextNode: (txt) => ({ nodeType: 3, textContent: txt }),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const context = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    console,
    document: documentMock,
    navigator: {
      onLine: true,
      geolocation: {
        getCurrentPosition: (cb) => {
          cb({ coords: { latitude: 35.6762, longitude: 139.6503 } });
        }
      }
    },
    setTimeout: (fn, delay = 0) => {
      const id = timers.nextId++;
      timers.timeouts.set(id, fn);
      return id;
    },
    clearTimeout: (id) => {
      timers.timeouts.delete(id);
    },
    AbortController: TrackingAbortController,
    localStorage: {
      getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
      setItem: (key, val) => localStorageStore.set(key, String(val)),
      removeItem: (key) => localStorageStore.delete(key),
      has: (key) => localStorageStore.has(key)
    },
    HomebaseStorage: {
      get: async (key) => storageStore.get(key),
      getMany: async (keys) => {
        const res = {};
        keys.forEach((k) => { res[k] = storageStore.get(k); });
        return res;
      },
      set: async (key, val) => { storageStore.set(key, val); },
      setMany: async (obj) => {
        Object.entries(obj).forEach(([k, v]) => storageStore.set(k, v));
      },
      remove: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((k) => storageStore.delete(k));
      }
    },
    openModalWithAnimation: () => {},
    closeModalWithAnimation: () => {},
    revealWidget: () => {},
    setText: (el, txt) => { if (el) el.textContent = txt; },
    setAttr: (el, k, v) => { if (el) el.setAttribute(k, v); },
    hbDebugInfo: () => {},
    fetch: async () => ({
      ok: true,
      json: async () => ({
        current_weather: { temperature: 20, weathercode: 1, time: '2026-10-13T00:00' },
        hourly: { time: ['2026-10-13T00:00'], relative_humidity_2m: [50], wind_speed_10m: [10], cloudcover: [20], precipitation_probability: [0] },
        daily: { sunrise: ['2026-10-13T06:00'], sunset: ['2026-10-13T18:00'] },
        results: []
      })
    })
  };

  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(lifecycleScript, context);
  vm.runInContext(widgetStorageScript, context);

  return {
    context,
    domElements,
    timers,
    storageStore,
    localStorageStore,
    createdControllers,
    weatherWidgetEl
  };
}

// ----------------------------------------------------
// 1. Strict IIFE Isolation & No Leaked Top-Level Scope
// ----------------------------------------------------
test('weather encapsulation: strict IIFE structure with zero leaked globals', () => {
  const trimmed = weatherScript.trim();
  assert.ok(
    trimmed.includes('(function () {') || trimmed.includes('(function() {'),
    'weather.js must contain an anonymous IIFE wrapper'
  );
  assert.ok(
    trimmed.includes("'use strict';") || trimmed.includes('"use strict";'),
    'weather.js must enforce strict mode'
  );
  assert.ok(
    trimmed.endsWith('})();'),
    'weather.js must end with closed IIFE invocation'
  );

  const { context } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  const privateVariables = [
    'weatherWidget',
    'weatherSetup',
    'weatherChooseCityBtn',
    'weatherSettingsModal',
    'weatherSettingsCloseBtn',
    'weatherSettingsCancelBtn',
    'weatherSettingsSaveBtn',
    'weatherTempUnitToggle',
    'weatherLocationInput',
    'weatherLocationResults',
    'weatherUseCurrentBtn',
    'weatherRefreshBtn',
    'weatherUpdatedEl',
    'weatherBody',
    'weatherFooter',
    'weatherListenerRegistry',
    'weatherInitialized',
    'selectedLocation',
    'searchTimeout',
    'geoAbortController',
    'geoRequestId',
    'weatherAbortController',
    'weatherRefreshInFlight',
    'WEATHER_CACHE_TTL_MS',
    'WEATHER_FETCH_TIMEOUT_MS'
  ];

  privateVariables.forEach((varName) => {
    assert.strictEqual(
      context[varName],
      undefined,
      `Private variable "${varName}" must NOT leak into global lexical scope`
    );
  });
});

// ----------------------------------------------------
// 2. Canonical HomebaseWidgetWeather Controller Export
// ----------------------------------------------------
test('weather encapsulation: canonical HomebaseWidgetWeather export exists', () => {
  const { context } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  assert.ok(context.HomebaseWidgetWeather, 'HomebaseWidgetWeather must be exported on window');
  assert.strictEqual(typeof context.HomebaseWidgetWeather, 'object', 'HomebaseWidgetWeather must be an object');
});

// ----------------------------------------------------
// 3. Lifecycle Methods Contract
// ----------------------------------------------------
test('weather encapsulation: exports full 7-method lifecycle contract and helper APIs', () => {
  const { context } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  const controller = context.HomebaseWidgetWeather;
  const lifecycleMethods = ['initialize', 'init', 'destroy', 'onShow', 'onHide', 'pause', 'resume'];

  lifecycleMethods.forEach((method) => {
    assert.strictEqual(
      typeof controller[method],
      'function',
      `HomebaseWidgetWeather.${method} must be a function`
    );
  });

  assert.strictEqual(controller.init, controller.initialize, 'init should alias initialize');

  const helperMethods = [
    'fetchWeather',
    'updateWeatherUI',
    'loadCachedWeather',
    'getWeatherLocation',
    'openWeatherSettingsModal',
    'closeWeatherSettingsModal',
    'setWeatherPreference'
  ];

  helperMethods.forEach((method) => {
    assert.strictEqual(
      typeof controller[method],
      'function',
      `HomebaseWidgetWeather.${method} helper API must exist`
    );
  });
});

// ----------------------------------------------------
// 4. Automatic Lifecycle Registration
// ----------------------------------------------------
test('weather encapsulation: registers automatically with HomebaseWidgetLifecycle', () => {
  const { context } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  const registered = context.HomebaseWidgetLifecycle.getWidget('weather');
  assert.ok(registered, 'weather widget must be registered with HomebaseWidgetLifecycle');
  assert.strictEqual(
    registered.controller,
    context.HomebaseWidgetWeather,
    'Registered widget controller instance must match HomebaseWidgetWeather'
  );
});

// ----------------------------------------------------
// 5. Storage Boundary: All Persistence via HomebaseWidgetStorage
// ----------------------------------------------------
test('weather encapsulation: persistence delegates cleanly through HomebaseWidgetStorage', async () => {
  const { context } = setupTestEnvironment({
    weatherLat: 40.7128,
    weatherLon: -74.0060,
    weatherCityName: 'New York',
    weatherUnits: 'fahrenheit'
  });

  let getWeatherSettingsCalled = false;
  let getWeatherCacheCalled = false;
  let setWeatherCacheCalled = false;

  const originalGetSettings = context.HomebaseWidgetStorage.getWeatherSettings;
  context.HomebaseWidgetStorage.getWeatherSettings = async (keys) => {
    getWeatherSettingsCalled = true;
    return originalGetSettings(keys);
  };

  const originalGetCache = context.HomebaseWidgetStorage.getWeatherCache;
  context.HomebaseWidgetStorage.getWeatherCache = async () => {
    getWeatherCacheCalled = true;
    return originalGetCache();
  };

  const originalSetCache = context.HomebaseWidgetStorage.setWeatherCache;
  context.HomebaseWidgetStorage.setWeatherCache = async (payload) => {
    setWeatherCacheCalled = true;
    return originalSetCache(payload);
  };

  vm.runInContext(weatherScript, context);

  // 1. Initializing fetches settings via HomebaseWidgetStorage
  await context.HomebaseWidgetWeather.initialize();
  assert.strictEqual(getWeatherSettingsCalled, true, 'getWeatherSettings must be called during initialize');

  // 2. Loading cached weather delegates to HomebaseWidgetStorage.getWeatherCache
  await context.HomebaseWidgetWeather.loadCachedWeather();
  assert.strictEqual(getWeatherCacheCalled, true, 'getWeatherCache must be called by loadCachedWeather');

  // 3. updateWeatherUI saves cache via HomebaseWidgetStorage.setWeatherCache
  const sampleData = {
    current_weather: { temperature: 20, weathercode: 1, time: '2026-10-13T00:00' },
    hourly: { time: ['2026-10-13T00:00'], relative_humidity_2m: [50], wind_speed_10m: [10], cloudcover: [20], precipitation_probability: [0] },
    daily: { sunrise: ['2026-10-13T06:00'], sunset: ['2026-10-13T18:00'] }
  };
  context.HomebaseWidgetWeather.updateWeatherUI(sampleData, 'Paris', 'celsius', Date.now(), { skipCacheSave: false });
  assert.strictEqual(setWeatherCacheCalled, true, 'setWeatherCache must be called by updateWeatherUI');

  // 4. setWeatherPreference writes fast mirror and visibility via HomebaseWidgetStorage
  let setVisibilityCalled = false;
  const originalSetVisibility = context.HomebaseWidgetStorage.setWeatherVisibility;
  context.HomebaseWidgetStorage.setWeatherVisibility = async (vis) => {
    setVisibilityCalled = true;
    return originalSetVisibility(vis);
  };

  context.HomebaseWidgetWeather.setWeatherPreference(false);
  assert.strictEqual(setVisibilityCalled, true, 'setWeatherVisibility must be called by setWeatherPreference');
  assert.strictEqual(context.localStorage.getItem('fast-show-weather'), '0', 'Fast mirror must be updated to 0');
});

// ----------------------------------------------------
// 6. AbortController Cleanup on onHide, pause, destroy
// ----------------------------------------------------
test('weather encapsulation: onHide, pause, and destroy abort active network requests', async () => {
  const { context, timers } = setupTestEnvironment({
    weatherLat: 35.6762,
    weatherLon: 139.6503,
    weatherCityName: 'Tokyo'
  });

  let fetchPendingSignal = null;
  context.fetch = async (url, opts) => {
    fetchPendingSignal = opts?.signal;
    return new Promise(() => {}); // never resolves to keep in flight
  };

  vm.runInContext(weatherScript, context);
  // Trigger fetchWeather directly to test in-flight fetch cancellation
  context.HomebaseWidgetWeather.fetchWeather(35.6762, 139.6503, 'celsius', 'Tokyo');

  // Yield to allow fetchWithTimeout to invoke fetch()
  await new Promise((r) => setImmediate(r));

  assert.ok(fetchPendingSignal, 'Fetch should have received an AbortSignal');
  assert.strictEqual(fetchPendingSignal.aborted, false, 'Signal should not be aborted yet');

  // onHide aborts active request
  context.HomebaseWidgetWeather.onHide();
  assert.strictEqual(fetchPendingSignal.aborted, true, 'onHide must abort in-flight fetch');

  // Trigger search to generate geo request
  fetchPendingSignal = null;
  context.searchForLocation('London');
  // Wait for debounce timer
  timers.timeouts.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));
  assert.ok(fetchPendingSignal, 'Geocoding request should have received an AbortSignal');

  // pause aborts active request
  context.HomebaseWidgetWeather.pause();
  assert.strictEqual(fetchPendingSignal.aborted, true, 'pause must abort in-flight geo request');

  // destroy aborts requests cleanly
  fetchPendingSignal = null;
  context.searchForLocation('Berlin');
  timers.timeouts.forEach((fn) => fn());
  await new Promise((r) => setImmediate(r));
  context.HomebaseWidgetWeather.destroy();
  if (fetchPendingSignal) {
    assert.strictEqual(fetchPendingSignal.aborted, true, 'destroy must abort active requests');
  }
});

// ----------------------------------------------------
// 7. Destroy Idempotency and Listener Teardown
// ----------------------------------------------------
test('weather encapsulation: destroy is idempotent and clears all registered listeners', async () => {
  const { context, domElements } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  await context.HomebaseWidgetWeather.initialize();

  const refreshBtn = domElements.get('weather-refresh-btn');
  const cityBtn = domElements.get('weather-choose-city-btn');
  const inputEl = domElements.get('modal-location-input');

  assert.ok(refreshBtn._getListenerCount('click') > 0, 'Refresh button should have listener attached');
  assert.ok(cityBtn._getListenerCount('click') > 0, 'Choose city button should have listener attached');
  assert.ok(inputEl._getListenerCount('input') > 0, 'Location input should have input listener attached');

  // Destroy once
  assert.doesNotThrow(() => {
    context.HomebaseWidgetWeather.destroy();
  }, 'First destroy() call must succeed');

  assert.strictEqual(refreshBtn._getListenerCount('click'), 0, 'Refresh button listener must be removed on destroy');
  assert.strictEqual(cityBtn._getListenerCount('click'), 0, 'Choose city listener must be removed on destroy');
  assert.strictEqual(inputEl._getListenerCount('input'), 0, 'Location input listener must be removed on destroy');

  // Destroy a second and third time (idempotency check)
  assert.doesNotThrow(() => {
    context.HomebaseWidgetWeather.destroy();
    context.HomebaseWidgetWeather.destroy();
  }, 'Subsequent destroy() calls must be idempotent and never throw');
});

// ----------------------------------------------------
// 8. Resume Refresh Behavior on Stale Cache
// ----------------------------------------------------
test('weather encapsulation: resume safely refreshes when cached weather is stale', async () => {
  const staleTimestamp = Date.now() - (40 * 60 * 1000); // 40 minutes old (TTL is 30m)
  const { context } = setupTestEnvironment({
    weatherLat: 51.5074,
    weatherLon: -0.1278,
    weatherCityName: 'London',
    weatherUnits: 'celsius',
    weatherFetchedAt: staleTimestamp,
    cachedWeatherData: {
      current_weather: { temperature: 15, weathercode: 1, time: '2026-10-13T00:00' },
      hourly: { time: ['2026-10-13T00:00'], relative_humidity_2m: [50], wind_speed_10m: [10], cloudcover: [20], precipitation_probability: [0] },
      daily: { sunrise: ['2026-10-13T06:00'], sunset: ['2026-10-13T18:00'] }
    },
    cachedCityName: 'London',
    cachedUnits: 'celsius'
  });

  let fetchWeatherCalled = false;
  context.fetch = async () => {
    fetchWeatherCalled = true;
    return {
      ok: true,
      json: async () => ({
        current_weather: { temperature: 16, weathercode: 1, time: '2026-10-13T00:00' },
        hourly: { time: ['2026-10-13T00:00'], relative_humidity_2m: [50], wind_speed_10m: [10], cloudcover: [20], precipitation_probability: [0] },
        daily: { sunrise: ['2026-10-13T06:00'], sunset: ['2026-10-13T18:00'] }
      })
    };
  };

  vm.runInContext(weatherScript, context);
  await context.HomebaseWidgetWeather.initialize();

  // Reset flag
  fetchWeatherCalled = false;

  // Calling resume on stale data triggers fetchWeather
  await context.HomebaseWidgetWeather.resume();
  assert.strictEqual(fetchWeatherCalled, true, 'resume must trigger fetchWeather on stale cache');
});

// ----------------------------------------------------
// 9. Backward Compatibility Bridges on window
// ----------------------------------------------------
test('weather encapsulation: backward compatibility aliases on window remain intact', () => {
  const { context } = setupTestEnvironment();
  vm.runInContext(weatherScript, context);

  // Controller alias
  assert.strictEqual(
    context.HomebaseWeatherWidgetController,
    context.HomebaseWidgetWeather,
    'HomebaseWeatherWidgetController must alias HomebaseWidgetWeather'
  );

  // Global functions
  assert.strictEqual(typeof context.setupWeather, 'function');
  assert.strictEqual(typeof context.setWeatherPreference, 'function');
  assert.strictEqual(typeof context.fetchWeather, 'function');
  assert.strictEqual(typeof context.updateWeatherUI, 'function');
  assert.strictEqual(typeof context.loadCachedWeather, 'function');
  assert.strictEqual(typeof context.getWeatherLocation, 'function');
  assert.strictEqual(typeof context.openWeatherSettingsModal, 'function');
  assert.strictEqual(typeof context.closeWeatherSettingsModal, 'function');
  assert.strictEqual(typeof context.startGeolocation, 'function');
  assert.strictEqual(typeof context.searchForLocation, 'function');
  assert.strictEqual(typeof context.getWeatherEmoji, 'function');
  assert.strictEqual(typeof context.getWeatherDescription, 'function');
  assert.strictEqual(typeof context.formatWeatherUpdated, 'function');

  // Test that getWeatherLocation returns current selected location
  assert.strictEqual(context.getWeatherLocation(), null);
});
