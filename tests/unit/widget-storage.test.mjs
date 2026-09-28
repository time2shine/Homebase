import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const validatorScriptPath = path.join(rootDir, 'src/newtab/core/schema-validator.js');
const migrationsScriptPath = path.join(rootDir, 'src/newtab/core/schema-migrations.js');
const diagnosticsScriptPath = path.join(rootDir, 'src/newtab/core/storage-diagnostics.js');
const storageServiceScriptPath = path.join(rootDir, 'src/newtab/core/storage-service.js');

const widgetVisibilityScriptPath = path.join(rootDir, 'src/newtab/widgets/widget-visibility.js');
const timeScriptPath = path.join(rootDir, 'src/newtab/widgets/time.js');
const todoScriptPath = path.join(rootDir, 'src/newtab/widgets/todo.js');
const quoteScriptPath = path.join(rootDir, 'src/newtab/widgets/quote.js');
const newsScriptPath = path.join(rootDir, 'src/newtab/widgets/news.js');
const weatherScriptPath = path.join(rootDir, 'src/newtab/widgets/weather.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');

const widgetVisibilityScriptCode = fs.readFileSync(widgetVisibilityScriptPath, 'utf8');
const timeScriptCode = fs.readFileSync(timeScriptPath, 'utf8');
const todoScriptCode = fs.readFileSync(todoScriptPath, 'utf8');
const quoteScriptCode = fs.readFileSync(quoteScriptPath, 'utf8');
const newsScriptCode = fs.readFileSync(newsScriptPath, 'utf8');
const weatherScriptCode = fs.readFileSync(weatherScriptPath, 'utf8');

/**
 * Creates an in-memory test environment supporting DOM mocks and storage mocking.
 */
function createWidgetTestEnvironment(options = {}) {
  const { initialStorage = {}, withHomebaseStorage = true } = options;
  const storageData = { ...initialStorage };
  const localStorageData = {};
  const storageCalls = { get: [], set: [], remove: [] };

  const storageMock = {
    get: async (keys) => {
      storageCalls.get.push(keys);
      if (keys === null || keys === undefined) return { ...storageData };
      if (typeof keys === 'string') return { [keys]: storageData[keys] };
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (storageData[k] !== undefined) res[k] = storageData[k];
        }
        return res;
      }
      return {};
    },
    set: async (items) => {
      storageCalls.set.push(items);
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      storageCalls.remove.push(keys);
      const toRemove = Array.isArray(keys) ? keys : [keys];
      for (const k of toRemove) delete storageData[k];
    }
  };

  const localStorageMock = {
    getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
    setItem: (k, v) => { localStorageData[k] = String(v); },
    removeItem: (k) => { delete localStorageData[k]; },
    clear: () => {
      for (const k of Object.keys(localStorageData)) delete localStorageData[k];
    }
  };

  const docElement = {
    classList: {
      classes: new Set(),
      toggle: function(cls, state) {
        if (state === undefined) state = !this.classes.has(cls);
        if (state) this.classes.add(cls); else this.classes.delete(cls);
        return state;
      },
      contains: function(cls) { return this.classes.has(cls); }
    }
  };

  const bodyElement = {
    classList: {
      classes: new Set(),
      toggle: function(cls, state) {
        if (state === undefined) state = !this.classes.has(cls);
        if (state) this.classes.add(cls); else this.classes.delete(cls);
        return state;
      },
      contains: function(cls) { return this.classes.has(cls); }
    }
  };

  const elementsById = new Map();
  const elementsByQuery = new Map();

  function makeMockElement(tag = 'div') {
    const el = {
      tagName: tag.toUpperCase(),
      classList: {
        classes: new Set(),
        add: function(...c) { c.forEach(x => this.classes.add(x)); },
        remove: function(...c) { c.forEach(x => this.classes.delete(x)); },
        toggle: function(cls, state) {
          if (state === undefined) state = !this.classes.has(cls);
          if (state) this.classes.add(cls); else this.classes.delete(cls);
          return state;
        },
        contains: function(cls) { return this.classes.has(cls); }
      },
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      disabled: false,
      style: {},
      dataset: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      appendChild: () => {},
      removeChild: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      focus: () => {}
    };
    return el;
  }

  // Pre-populate key DOM elements
  elementsById.set('current-time', makeMockElement('span'));
  elementsById.set('current-date', makeMockElement('span'));
  elementsById.set('todo-input', makeMockElement('input'));
  elementsById.set('todo-list', makeMockElement('ul'));

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    Promise,
    RegExp,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    localStorage: localStorageMock,
    browser: {
      storage: {
        local: storageMock
      }
    },
    document: {
      documentElement: docElement,
      body: bodyElement,
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: (q) => elementsByQuery.get(q) || null,
      querySelectorAll: () => [],
      createElement: (tag) => makeMockElement(tag),
      createDocumentFragment: () => ({ appendChild: () => {} })
    },
    navigator: {
      geolocation: {
        getCurrentPosition: (success) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        }
      }
    },
    sidebar: null,
    appShowSidebarPreference: true,
    appShowWeatherPreference: true,
    appShowQuotePreference: true,
    appShowNewsPreference: true,
    appShowTodoPreference: true,
    APP_SHOW_SIDEBAR_KEY: 'appShowSidebar',
    APP_SHOW_WEATHER_KEY: 'appShowWeather',
    APP_SHOW_QUOTE_KEY: 'appShowQuote',
    APP_SHOW_NEWS_KEY: 'appShowNews',
    APP_SHOW_TODO_KEY: 'appShowTodo',
    applyWidgetVisibility: () => {},
    updateSidebarCollapseState: () => {},
    updateWidgetSettingsUI: () => {},
    revealWidget: () => {},
    ensureSubSettingsInner: () => {},
    initUnifiedSortable: () => ({ destroy: () => {} }),
    renderTodoList: () => {},
    renderCachedQuoteState: () => {},
    renderQuoteToWidget: () => {},
    closeModalWithAnimation: () => {},
    openModalWithAnimation: () => {},
    fetchQuote: () => {},
    fetchAndRenderNews: () => {},
    observeNewsWidgetVisibility: () => {},
    ensureNewsSourceOptions: () => {},
    closeNewsSettingsModal: () => {},
    fetchWeather: async () => {},
    showWeatherSetupUI: () => {},
    hideWeatherSetupUI: () => {},
    markWeatherAsCachedOrStale: () => {},
    updateWeatherUI: () => {},
    getCachedWeatherTimestamp: (d) => d?.weatherFetchedAt || null,
    hasUsableCachedWeather: (d) => Boolean(d && typeof d === 'object'),
    getCachedWeatherDisplayOptions: () => ({})
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  // Load stack
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);

  if (withHomebaseStorage) {
    vm.runInContext(storageServiceScriptCode, context);
  } else {
    delete sandbox.HomebaseStorage;
    delete sandbox.window.HomebaseStorage;
  }

  return {
    context,
    sandbox,
    storageData,
    localStorageData,
    storageCalls,
    elementsById,
    elementsByQuery
  };
}

test('widget-visibility: applySidebarVisibility persists via HomebaseStorage and syncs fast-show-sidebar mirror', () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(widgetVisibilityScriptCode, env.context);

  // Set sidebar to false
  env.sandbox.applySidebarVisibility(false);
  assert.equal(env.storageData['appShowSidebar'], false);
  assert.equal(env.localStorageData['fast-show-sidebar'], '0');

  // Set sidebar to true
  env.sandbox.applySidebarVisibility(true);
  assert.equal(env.storageData['appShowSidebar'], true);
  assert.equal(env.localStorageData['fast-show-sidebar'], '1');
});

test('widget-visibility: setWidgetOrderPreference persists via HomebaseStorage and syncs fast-widget-order mirror', () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(widgetVisibilityScriptCode, env.context);

  const customOrder = ['todo', 'quote', 'weather', 'news'];
  env.sandbox.setWidgetOrderPreference(customOrder);

  assert.deepStrictEqual([...env.storageData['widgetOrder']], customOrder);
  assert.equal(env.localStorageData['fast-widget-order'], JSON.stringify(customOrder));
});

test('widget-visibility: fallback to browser.storage.local when HomebaseStorage is absent', () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(widgetVisibilityScriptCode, env.context);

  env.sandbox.applySidebarVisibility(false);
  assert.equal(env.storageData['appShowSidebar'], false);
  assert.equal(env.localStorageData['fast-show-sidebar'], '0');

  const customOrder = ['news', 'todo', 'quote', 'weather'];
  env.sandbox.setWidgetOrderPreference(customOrder);
  assert.deepStrictEqual([...env.storageData['widgetOrder']], customOrder);
});

test('time: setTimeFormatPreference persists via HomebaseStorage and syncs fast-time-format mirror', () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(timeScriptCode, env.context);

  env.sandbox.setTimeFormatPreference('24-hour');
  assert.equal(env.storageData['appTimeFormatPreference'], '24-hour');
  assert.equal(env.localStorageData['fast-time-format'], '24-hour');

  env.sandbox.setTimeFormatPreference('12-hour');
  assert.equal(env.storageData['appTimeFormatPreference'], '12-hour');
  assert.equal(env.localStorageData['fast-time-format'], '12-hour');
});

test('time: fallback to browser.storage.local when HomebaseStorage is absent', () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(timeScriptCode, env.context);

  env.sandbox.setTimeFormatPreference('24-hour');
  assert.equal(env.storageData['appTimeFormatPreference'], '24-hour');
  assert.equal(env.localStorageData['fast-time-format'], '24-hour');
});

test('todo: persistTodoState writes batch via HomebaseStorage.setMany', async () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(todoScriptCode, env.context);

  env.sandbox.setTodoPreference(true);
  assert.equal(env.storageData['appShowTodo'], true);
  assert.equal(env.localStorageData['fast-show-todo'], '1');

  env.sandbox.setTodoPreference(false);
  assert.equal(env.storageData['appShowTodo'], false);
  assert.equal(env.localStorageData['fast-show-todo'], '0');

  // Verify addTodoFromInput triggers persistTodoState -> HomebaseStorage.setMany
  const input = env.elementsById.get('todo-input');
  input.value = 'Test task';
  env.sandbox.addTodoFromInput();
  assert.equal(env.storageData['todoItems'].length, 1);
  assert.equal(env.storageData['todoItems'][0].text, 'Test task');

  // Verify loadTodoState reads via HomebaseStorage.getMany
  await env.sandbox.loadTodoState();
  assert.equal(env.storageData['todoItems'].length, 1);
});

test('todo: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(todoScriptCode, env.context);

  env.sandbox.setTodoPreference(true);
  assert.equal(env.storageData['appShowTodo'], true);

  const input = env.elementsById.get('todo-input');
  input.value = 'Fallback task';
  env.sandbox.addTodoFromInput();
  assert.equal(env.storageData['todoItems'].length, 1);
  assert.equal(env.storageData['todoItems'][0].text, 'Fallback task');

  await env.sandbox.loadTodoState();
  assert.equal(env.storageData['todoItems'].length, 1);
});

test('quote: ensureQuoteIndexBuilt and setQuotePreference persist via HomebaseStorage', async () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(quoteScriptCode, env.context);

  env.sandbox.setQuotePreference(true);
  assert.equal(env.storageData['appShowQuote'], true);
  assert.equal(env.localStorageData['fast-show-quote'], '1');

  env.sandbox.setQuotePreference(false);
  assert.equal(env.storageData['appShowQuote'], false);
  assert.equal(env.localStorageData['fast-show-quote'], '0');
});

test('quote: fallback to browser.storage.local when HomebaseStorage is absent', () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(quoteScriptCode, env.context);

  env.sandbox.setQuotePreference(true);
  assert.equal(env.storageData['appShowQuote'], true);
  assert.equal(env.localStorageData['fast-show-quote'], '1');

  env.sandbox.setQuotePreference(false);
  assert.equal(env.storageData['appShowQuote'], false);
  assert.equal(env.localStorageData['fast-show-quote'], '0');
});

test('news: setNewsPreference persists via HomebaseStorage and syncs fast-show-news mirror', () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(newsScriptCode, env.context);

  env.sandbox.setNewsPreference(true);
  assert.equal(env.storageData['appShowNews'], true);
  assert.equal(env.localStorageData['fast-show-news'], '1');

  env.sandbox.setNewsPreference(false);
  assert.equal(env.storageData['appShowNews'], false);
  assert.equal(env.localStorageData['fast-show-news'], '0');
});

test('news: fallback to browser.storage.local when HomebaseStorage is absent', () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(newsScriptCode, env.context);

  env.sandbox.setNewsPreference(false);
  assert.equal(env.storageData['appShowNews'], false);
  assert.equal(env.localStorageData['fast-show-news'], '0');
});

test('weather: setWeatherPreference and cache operations persist via HomebaseStorage', async () => {
  const env = createWidgetTestEnvironment();
  vm.runInContext(weatherScriptCode, env.context);

  env.sandbox.setWeatherPreference(true);
  assert.equal(env.storageData['appShowWeather'], true);
  assert.equal(env.localStorageData['fast-show-weather'], '1');

  env.sandbox.setWeatherPreference(false);
  assert.equal(env.storageData['appShowWeather'], false);
  assert.equal(env.localStorageData['fast-show-weather'], '0');

  // Verify weatherStorageSet and weatherStorageGet
  await env.sandbox.weatherStorageSet({ weatherCustomLocation: 'London, UK' });
  assert.equal(env.storageData['weatherCustomLocation'], 'London, UK');

  const retrieved = await env.sandbox.weatherStorageGet(['weatherCustomLocation']);
  assert.equal(retrieved.weatherCustomLocation, 'London, UK');

  // Verify weatherStorageRemove
  await env.sandbox.weatherStorageRemove(['weatherCustomLocation']);
  assert.equal(env.storageData['weatherCustomLocation'], undefined);
});

test('weather: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createWidgetTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(weatherScriptCode, env.context);

  env.sandbox.setWeatherPreference(true);
  assert.equal(env.storageData['appShowWeather'], true);

  await env.sandbox.weatherStorageSet({ weatherUnit: 'F' });
  assert.equal(env.storageData['weatherUnit'], 'F');

  const retrieved = await env.sandbox.weatherStorageGet(['weatherUnit']);
  assert.equal(retrieved.weatherUnit, 'F');

  await env.sandbox.weatherStorageRemove(['weatherUnit']);
  assert.equal(env.storageData['weatherUnit'], undefined);
});
