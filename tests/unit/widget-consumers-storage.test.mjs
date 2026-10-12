import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const widgetStorageScriptPath = path.join(rootDir, 'src/newtab/widgets/widget-storage.js');
const widgetStorageScriptCode = fs.readFileSync(widgetStorageScriptPath, 'utf8');
const visibilityScriptPath = path.join(rootDir, 'src/newtab/widgets/widget-visibility.js');
const visibilityScriptCode = fs.readFileSync(visibilityScriptPath, 'utf8');
const timeScriptPath = path.join(rootDir, 'src/newtab/widgets/time.js');
const timeScriptCode = fs.readFileSync(timeScriptPath, 'utf8');
const todoScriptPath = path.join(rootDir, 'src/newtab/widgets/todo.js');
const todoScriptCode = fs.readFileSync(todoScriptPath, 'utf8');
const quoteScriptPath = path.join(rootDir, 'src/newtab/widgets/quote.js');
const quoteScriptCode = fs.readFileSync(quoteScriptPath, 'utf8');
const weatherScriptPath = path.join(rootDir, 'src/newtab/widgets/weather.js');
const weatherScriptCode = fs.readFileSync(weatherScriptPath, 'utf8');
const newsScriptPath = path.join(rootDir, 'src/newtab/widgets/news.js');
const newsScriptCode = fs.readFileSync(newsScriptPath, 'utf8');

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

function createDummyEl() {
  const el = {
    classList: createMockClassList(),
    appendChild: () => {},
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dataset: {},
    style: {},
    textContent: '',
    innerHTML: '',
    children: [],
    querySelector: () => createDummyEl(),
    querySelectorAll: () => []
  };
  return el;
}

function createConsumerContext(options = {}) {
  const localStorageStore = new Map();
  const storageData = new Map();

  const mockHomebaseStorage = {
    async get(key, fallback = null) {
      return storageData.has(key) ? storageData.get(key) : fallback;
    },
    async getMany(keys) {
      const result = {};
      for (const k of keys) {
        result[k] = storageData.has(k) ? storageData.get(k) : null;
      }
      return result;
    },
    async set(key, value) {
      storageData.set(key, value);
    },
    async setMany(obj) {
      for (const [k, v] of Object.entries(obj)) {
        storageData.set(k, v);
      }
    }
  };

  const docElement = createDummyEl();
  const docBody = createDummyEl();

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Math,
    console,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    document: {
      documentElement: docElement,
      body: docBody,
      querySelector: () => createDummyEl(),
      querySelectorAll: () => [],
      getElementById: () => createDummyEl(),
      createDocumentFragment: () => ({ appendChild: () => {} }),
      createElement: () => createDummyEl(),
      addEventListener: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
      setItem: (key, val) => localStorageStore.set(key, String(val)),
      removeItem: (key) => localStorageStore.delete(key),
      clear: () => localStorageStore.clear()
    },
    HomebaseStorage: mockHomebaseStorage,
    updateSidebarCollapseState: () => {},
    updateWidgetSettingsUI: () => {},
    ensureSubSettingsInner: () => {},
    applyWidgetVisibility: () => {},
    revealWidget: () => {},
    setText: (el, val) => { if (el) el.textContent = val; },
    setAttr: (el, attr, val) => { if (el) el.setAttribute(attr, val); },
    initUnifiedSortable: () => ({ destroy: () => {} }),
    scheduleIdleTask: (fn) => fn(),
    appShowSidebarPreference: true,
    appShowWeatherPreference: true,
    appShowQuotePreference: true,
    appShowNewsPreference: true,
    appShowTodoPreference: true,
    appNewsSourcePreference: 'top',
    APP_SHOW_SIDEBAR_KEY: 'appShowSidebar',
    APP_SHOW_TODO_KEY: 'appShowTodo',
    APP_SHOW_WEATHER_KEY: 'appShowWeather',
    APP_SHOW_QUOTE_KEY: 'appShowQuote',
    APP_SHOW_NEWS_KEY: 'appShowNews',
    ...options
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(widgetStorageScriptCode, context);
  return { context, localStorageStore, storageData };
}

test('widget-visibility: applySidebarVisibility delegates to HomebaseWidgetStorage', async () => {
  const { context, storageData, localStorageStore } = createConsumerContext();
  vm.runInContext(visibilityScriptCode, context);

  let setSidebarCalled = false;
  const originalSetSidebar = context.HomebaseWidgetStorage.setSidebarVisibility;
  context.HomebaseWidgetStorage.setSidebarVisibility = async (visible) => {
    setSidebarCalled = true;
    return originalSetSidebar(visible);
  };

  context.applySidebarVisibility(false);

  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(setSidebarCalled, true, 'HomebaseWidgetStorage.setSidebarVisibility must be called');
  assert.strictEqual(storageData.get('appShowSidebar'), false);
  assert.strictEqual(localStorageStore.get('fast-show-sidebar'), '0');
});

test('widget-visibility: setWidgetOrderPreference delegates to HomebaseWidgetStorage', async () => {
  const { context, storageData, localStorageStore } = createConsumerContext();
  vm.runInContext(visibilityScriptCode, context);

  let setWidgetOrderCalled = false;
  const originalSetOrder = context.HomebaseWidgetStorage.setWidgetOrder;
  context.HomebaseWidgetStorage.setWidgetOrder = async (order) => {
    setWidgetOrderCalled = true;
    return originalSetOrder(order);
  };

  const newOrder = ['quote', 'weather', 'news', 'todo'];
  context.setWidgetOrderPreference(newOrder, { persist: true });

  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(setWidgetOrderCalled, true, 'HomebaseWidgetStorage.setWidgetOrder must be called');
  assert.deepStrictEqual([...storageData.get('widgetOrder')], newOrder);
  assert.strictEqual(localStorageStore.get('fast-widget-order'), JSON.stringify(newOrder));
});

test('time.js: applyTimeFormatPreference delegates to HomebaseWidgetStorage.setTimeFormat', async () => {
  const { context, storageData, localStorageStore } = createConsumerContext();
  vm.runInContext(timeScriptCode, context);

  let setTimeFormatCalled = false;
  const originalSetTime = context.HomebaseWidgetStorage.setTimeFormat;
  context.HomebaseWidgetStorage.setTimeFormat = async (format) => {
    setTimeFormatCalled = true;
    return originalSetTime(format);
  };

  context.applyTimeFormatPreference('24-hour', { persist: true });

  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(setTimeFormatCalled, true, 'HomebaseWidgetStorage.setTimeFormat must be called');
  assert.strictEqual(storageData.get('appTimeFormatPreference'), '24-hour');
  assert.strictEqual(localStorageStore.get('fast-time-format'), '24-hour');
});

test('todo.js: persistTodoState delegates to HomebaseWidgetStorage.setTodoState', async () => {
  const { context, storageData, localStorageStore } = createConsumerContext();
  vm.runInContext(todoScriptCode, context);

  let setTodoStateCalled = false;
  const originalSetTodo = context.HomebaseWidgetStorage.setTodoState;
  context.HomebaseWidgetStorage.setTodoState = async (state) => {
    setTodoStateCalled = true;
    return originalSetTodo(state);
  };

  context.persistTodoState();

  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(setTodoStateCalled, true, 'HomebaseWidgetStorage.setTodoState must be called');
  assert.strictEqual(storageData.has('todoItems'), true);
  assert.strictEqual(localStorageStore.has('fast-todo'), true);
});

test('todo.js: loadTodoState delegates to HomebaseWidgetStorage.getTodoState', async () => {
  const { context, storageData } = createConsumerContext();
  const sampleItems = [{ id: 't1', text: 'Task 1', done: false, createdAt: Date.now() }];
  storageData.set('todoItems', sampleItems);
  storageData.set('todoHideDone', true);

  vm.runInContext(todoScriptCode, context);

  let getTodoStateCalled = false;
  const originalGetTodo = context.HomebaseWidgetStorage.getTodoState;
  context.HomebaseWidgetStorage.getTodoState = async () => {
    getTodoStateCalled = true;
    return originalGetTodo();
  };

  await context.loadTodoState();

  assert.strictEqual(getTodoStateCalled, true, 'HomebaseWidgetStorage.getTodoState must be called');
});

test('quote.js: readCachedQuoteState reads from HomebaseWidgetStorage fast mirror', () => {
  const { context, localStorageStore } = createConsumerContext();
  localStorageStore.set('fast-quote-v2', JSON.stringify({
    current: { id: 'q1', text: 'Small steps matter', author: 'Unknown' },
    next: null,
    config: { frequency: 'daily' }
  }));

  vm.runInContext(quoteScriptCode, context);

  const state = context.readCachedQuoteState();
  assert.strictEqual(state.current.text, 'Small steps matter');
});

test('quote.js: setQuoteCache is called when caching fallback or fresh state', async () => {
  const { context, localStorageStore } = createConsumerContext();
  vm.runInContext(quoteScriptCode, context);

  let setQuoteCacheCalled = false;
  const originalSetQuote = context.HomebaseWidgetStorage.setQuoteCache;
  context.HomebaseWidgetStorage.setQuoteCache = async (data) => {
    setQuoteCacheCalled = true;
    return originalSetQuote(data);
  };

  await context.HomebaseWidgetStorage.setQuoteCache({
    current: { id: 'q1', text: 'Wisdom', author: 'Sage' },
    config: { frequency: 'daily' }
  });

  assert.strictEqual(setQuoteCacheCalled, true);
  assert.strictEqual(localStorageStore.has('fast-quote-v2'), true);
  assert.strictEqual(localStorageStore.has('fast-quote-state'), true);
});

test('weather.js: loadCachedWeather delegates to HomebaseWidgetStorage.getWeatherCache', async () => {
  const { context, storageData } = createConsumerContext();
  storageData.set('cachedWeatherData', { current: { temperature_2m: 22 } });
  storageData.set('cachedCityName', 'Paris');
  storageData.set('cachedUnits', 'celsius');
  storageData.set('weatherFetchedAt', Date.now());

  vm.runInContext(weatherScriptCode, context);

  let getWeatherCacheCalled = false;
  const originalGetWeather = context.HomebaseWidgetStorage.getWeatherCache;
  context.HomebaseWidgetStorage.getWeatherCache = async () => {
    getWeatherCacheCalled = true;
    return originalGetWeather();
  };

  await context.loadCachedWeather();

  assert.strictEqual(getWeatherCacheCalled, true, 'HomebaseWidgetStorage.getWeatherCache must be called');
});

test('weather.js: updateWeatherUI saves cache via HomebaseWidgetStorage.setWeatherCache', async () => {
  const { context, storageData, localStorageStore } = createConsumerContext();
  vm.runInContext(weatherScriptCode, context);

  let setWeatherCacheCalled = false;
  const originalSetWeather = context.HomebaseWidgetStorage.setWeatherCache;
  context.HomebaseWidgetStorage.setWeatherCache = async (payload) => {
    setWeatherCacheCalled = true;
    return originalSetWeather(payload);
  };

  const sampleData = {
    current: {
      temperature_2m: 20,
      weather_code: 0,
      relative_humidity_2m: 50,
      surface_pressure: 1013,
      cloud_cover: 10
    },
    daily: {
      precipitation_probability_max: [10],
      sunrise: ['2026-10-12T06:00'],
      sunset: ['2026-10-12T18:00']
    }
  };

  context.updateWeatherUI(sampleData, 'Tokyo', 'celsius', Date.now(), { skipCacheSave: false });

  await new Promise((r) => setTimeout(r, 10));

  assert.strictEqual(setWeatherCacheCalled, true, 'HomebaseWidgetStorage.setWeatherCache must be called');
  assert.strictEqual(storageData.get('cachedCityName'), 'Tokyo');
  assert.strictEqual(localStorageStore.has('fast-weather-v2'), true);
  assert.strictEqual(localStorageStore.has('fast-weather'), true);
});

test('news.js: readFastNewsCache reads from HomebaseWidgetStorage mirror', () => {
  const { context, localStorageStore } = createConsumerContext();
  localStorageStore.set('fast-news-v2', JSON.stringify({
    source: 'top',
    items: [{ title: 'Headline 1', link: 'https://example.com' }],
    __timestamp: Date.now()
  }));

  vm.runInContext(newsScriptCode, context);

  const cached = context.readFastNewsCache('top');
  assert.strictEqual(cached.items.length, 1);
  assert.strictEqual(cached.items[0].title, 'Headline 1');
});
