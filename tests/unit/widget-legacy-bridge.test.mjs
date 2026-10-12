import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');
const widgetStorageScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-storage.js'), 'utf8');
const timeScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/time.js'), 'utf8');
const todoScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/todo.js'), 'utf8');
const quoteScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/quote.js'), 'utf8');
const newsScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/news.js'), 'utf8');
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
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => true,
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null)
  };
  return el;
}

function setupTestEnvironment() {
  const domElements = new Map();
  const getOrCreateEl = (id, tag = 'div', cls = '') => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id, tag, cls));
    }
    return domElements.get(id);
  };

  // Prepopulate standard widget DOM ids
  getOrCreateEl('current-time', 'div');
  getOrCreateEl('current-date', 'div');
  getOrCreateEl('todo-input', 'input');
  getOrCreateEl('todo-add-btn', 'button');
  getOrCreateEl('todo-list', 'ul');
  getOrCreateEl('todo-clear-btn', 'button');
  getOrCreateEl('todo-filter-all-btn', 'button');
  getOrCreateEl('todo-filter-active-btn', 'button');
  getOrCreateEl('quote-text', 'div');
  getOrCreateEl('quote-author', 'div');
  getOrCreateEl('quote-settings-modal', 'dialog');
  getOrCreateEl('quote-category-select', 'select');
  getOrCreateEl('quote-frequency-select', 'select');
  getOrCreateEl('news-list', 'ul');
  getOrCreateEl('news-source-select', 'select');
  getOrCreateEl('weather-setup', 'div');
  getOrCreateEl('weather-settings-modal', 'dialog');
  getOrCreateEl('modal-location-input', 'input');
  getOrCreateEl('weather-refresh-btn', 'button');

  const documentMock = {
    visibilityState: 'visible',
    documentElement: {
      classList: createMockClassList()
    },
    body: createMockElement('body', 'body'),
    querySelector: (sel) => {
      if (sel.startsWith('.')) return getOrCreateEl(sel.slice(1), 'div', sel.slice(1));
      if (sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
      return null;
    },
    querySelectorAll: () => [],
    getElementById: (id) => getOrCreateEl(id),
    createElement: (tag) => createMockElement('', tag),
    createTextNode: (txt) => ({ nodeType: 3, textContent: txt }),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const storageStore = new Map();
  const localStorageStore = new Map();

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
      clipboard: { writeText: async () => {} },
      geolocation: { getCurrentPosition: (cb) => cb({ coords: { latitude: 0, longitude: 0 } }) }
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    AbortController: globalThis.AbortController,
    localStorage: {
      getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
      setItem: (k, v) => localStorageStore.set(k, String(v)),
      removeItem: (k) => localStorageStore.delete(k),
      has: (k) => localStorageStore.has(k)
    },
    HomebaseStorage: {
      get: async (k) => storageStore.get(k),
      getMany: async (keys) => {
        const res = {};
        keys.forEach((k) => { res[k] = storageStore.get(k); });
        return res;
      },
      set: async (k, v) => { storageStore.set(k, v); },
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
      json: async () => ({ results: [], current_weather: { temperature: 20, weathercode: 1 } })
    })
  };

  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(lifecycleScript, context);
  vm.runInContext(widgetStorageScript, context);
  vm.runInContext(timeScript, context);
  vm.runInContext(todoScript, context);
  vm.runInContext(quoteScript, context);
  vm.runInContext(newsScript, context);
  vm.runInContext(weatherScript, context);

  return { context, storageStore, localStorageStore, domElements };
}

// ----------------------------------------------------
// 1. Canonical Controllers Existence & Full API Surface
// ----------------------------------------------------
test('canonical controllers exist on window and expose complete API surfaces', () => {
  const { context } = setupTestEnvironment();

  // Time
  assert.ok(context.HomebaseWidgetTime, 'HomebaseWidgetTime must exist');
  assert.strictEqual(typeof context.HomebaseWidgetTime.initialize, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.destroy, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.pause, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.resume, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.update, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.applyTimeFormatPreference, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTime.setTimeFormatPreference, 'function');

  // Todo
  assert.ok(context.HomebaseWidgetTodo, 'HomebaseWidgetTodo must exist');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.initialize, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.destroy, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.setupTodoWidget, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.setPreference, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.handleStorageChange, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.persistState, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.loadState, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetTodo.normalizeTodoItems, 'function');

  // Quote
  assert.ok(context.HomebaseWidgetQuote, 'HomebaseWidgetQuote must exist');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.initialize, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.destroy, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.fetchQuote, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.readCachedQuoteState, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.renderCachedQuoteState, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.shouldLoadQuoteCatalog, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.ensureQuoteIndexBuilt, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.setupQuoteWidget, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.setPreference, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetQuote.openQuoteSettingsModal, 'function');

  // News
  assert.ok(context.HomebaseWidgetNews, 'HomebaseWidgetNews must exist');
  assert.strictEqual(typeof context.HomebaseWidgetNews.initialize, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.destroy, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.fetchAndRenderNews, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.setupNewsWidget, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.setPreference, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.resolveNewsSourceId, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.getNewsSourceById, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetNews.readFastNewsCache, 'function');
  assert.ok(Array.isArray(context.HomebaseWidgetNews.NEWS_SOURCES));

  // Weather
  assert.ok(context.HomebaseWidgetWeather, 'HomebaseWidgetWeather must exist');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.initialize, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.destroy, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.refresh, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.fetchWeather, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.updateWeatherUI, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.loadCachedWeather, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.getWeatherLocation, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.openWeatherSettingsModal, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.searchForLocation, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.setupWeather, 'function');
  assert.strictEqual(typeof context.HomebaseWidgetWeather.setPreference, 'function');
});

// ----------------------------------------------------
// 2. Legacy Aliases Mirror Canonical Controllers
// ----------------------------------------------------
test('legacy Homebase*WidgetController aliases point to canonical controllers', () => {
  const { context } = setupTestEnvironment();

  assert.strictEqual(context.HomebaseTimeWidgetController, context.HomebaseWidgetTime);
  assert.strictEqual(context.HomebaseTodoWidgetController, context.HomebaseWidgetTodo);
  assert.strictEqual(context.HomebaseQuoteWidgetController, context.HomebaseWidgetQuote);
  assert.strictEqual(context.HomebaseNewsWidgetController, context.HomebaseWidgetNews);
  assert.strictEqual(context.HomebaseWeatherWidgetController, context.HomebaseWidgetWeather);
});

// ----------------------------------------------------
// 3. Backward Compatibility Function Bridges
// ----------------------------------------------------
test('backward compatibility function bridges exist on window and delegate properly', () => {
  const { context } = setupTestEnvironment();

  // Time bridges
  assert.strictEqual(typeof context.updateTime, 'function');
  assert.strictEqual(typeof context.applyTimeFormatPreference, 'function');
  assert.strictEqual(typeof context.setTimeFormatPreference, 'function');

  // Todo bridges
  assert.strictEqual(typeof context.setupTodoWidget, 'function');
  assert.strictEqual(typeof context.setTodoPreference, 'function');
  assert.strictEqual(typeof context.handleTodoStorageChange, 'function');
  assert.strictEqual(typeof context.persistTodoState, 'function');
  assert.strictEqual(typeof context.loadTodoState, 'function');
  assert.strictEqual(typeof context.normalizeTodoItems, 'function');

  // Quote bridges
  assert.strictEqual(typeof context.setupQuoteWidget, 'function');
  assert.strictEqual(typeof context.setQuotePreference, 'function');
  assert.strictEqual(typeof context.fetchQuote, 'function');
  assert.strictEqual(typeof context.readCachedQuoteState, 'function');
  assert.strictEqual(typeof context.renderCachedQuoteState, 'function');
  assert.strictEqual(typeof context.shouldLoadQuoteCatalog, 'function');
  assert.strictEqual(typeof context.ensureQuoteIndexBuilt, 'function');
  assert.strictEqual(typeof context.openQuoteSettingsModal, 'function');

  // News bridges
  assert.strictEqual(typeof context.setupNewsWidget, 'function');
  assert.strictEqual(typeof context.setNewsPreference, 'function');
  assert.strictEqual(typeof context.fetchAndRenderNews, 'function');
  assert.strictEqual(typeof context.resolveNewsSourceId, 'function');
  assert.strictEqual(typeof context.getNewsSourceById, 'function');
  assert.strictEqual(typeof context.readFastNewsCache, 'function');
  assert.ok(Array.isArray(context.NEWS_SOURCES));

  // Weather bridges
  assert.strictEqual(typeof context.setupWeather, 'function');
  assert.strictEqual(typeof context.setWeatherPreference, 'function');
  assert.strictEqual(typeof context.fetchWeather, 'function');
  assert.strictEqual(typeof context.updateWeatherUI, 'function');
  assert.strictEqual(typeof context.loadCachedWeather, 'function');
  assert.strictEqual(typeof context.getWeatherLocation, 'function');
  assert.strictEqual(typeof context.openWeatherSettingsModal, 'function');
  assert.strictEqual(typeof context.searchForLocation, 'function');
});

// ----------------------------------------------------
// 4. Pruned Category C Helpers Are Confirmed Absent
// ----------------------------------------------------
test('pruned dead helper globals are no longer exposed on window', () => {
  const { context } = setupTestEnvironment();

  const deadWeatherHelpers = [
    'getCurrentHourlyWeatherIndex',
    'getHourlyValueAtIndex',
    'normalizeWeatherDisplay',
    'normalizeWeatherTimestamp',
    'isWeatherCacheStale',
    'getCachedWeatherTimestamp',
    'hasUsableCachedWeather',
    'getCachedWeatherDisplayOptions',
    'markWeatherAsCachedOrStale',
    'showWeatherOfflineNoCache',
    'showWeatherSetupUI',
    'hideWeatherSetupUI',
    'showWeatherError'
  ];

  deadWeatherHelpers.forEach((helper) => {
    assert.strictEqual(
      context[helper],
      undefined,
      `Dead weather helper "${helper}" must NOT be exposed on window`
    );
  });

  // Quote helper pruned from window
  assert.strictEqual(
    context.closeQuoteSettingsModal,
    undefined,
    'Dead quote helper "closeQuoteSettingsModal" must NOT be exposed on window'
  );
});

// ----------------------------------------------------
// 5. Canonical Consumer Invocation Paths
// ----------------------------------------------------
test('consumer migration: HomebaseWidgetWeather.refresh() and HomebaseWidgetTime.update() function correctly', async () => {
  const { context, domElements } = setupTestEnvironment();

  // Test HomebaseWidgetTime.update()
  context.HomebaseWidgetTime.initialize();
  context.HomebaseWidgetTime.applyTimeFormatPreference('24-hour');
  context.HomebaseWidgetTime.update();

  const timeEl = domElements.get('current-time');
  assert.ok(timeEl.textContent.length > 0, 'Time display element must be populated');

  // Test HomebaseWidgetWeather.refresh() aliases resume
  assert.strictEqual(
    context.HomebaseWidgetWeather.refresh,
    context.HomebaseWidgetWeather.resume,
    'HomebaseWidgetWeather.refresh must alias resume'
  );
});
