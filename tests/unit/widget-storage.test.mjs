import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const widgetStorageScriptPath = path.join(rootDir, 'src/newtab/widgets/widget-storage.js');
const widgetStorageScriptCode = fs.readFileSync(widgetStorageScriptPath, 'utf8');

function createWidgetStorageTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };

  const storageCalls = {
    get: [],
    set: [],
    setMany: [],
    remove: []
  };

  const browserStorageData = { ...initialStorage };

  const mockBrowser = {
    storage: {
      local: {
        get: async (keys) => {
          if (failStorage) throw new Error('Simulated browser.storage failure');
          if (typeof keys === 'string') {
            return { [keys]: browserStorageData[keys] };
          }
          if (Array.isArray(keys)) {
            const res = {};
            for (const k of keys) {
              if (browserStorageData[k] !== undefined) res[k] = browserStorageData[k];
            }
            return res;
          }
          return { ...browserStorageData };
        },
        set: async (items) => {
          if (failStorage) throw new Error('Simulated browser.storage set failure');
          Object.assign(browserStorageData, items);
        }
      }
    }
  };

  const mockLocalStorage = {
    getItem: (key) => (key in localStorageData ? localStorageData[key] : null),
    setItem: (key, val) => {
      localStorageData[key] = String(val);
    },
    removeItem: (key) => {
      delete localStorageData[key];
    }
  };

  const mockHomebaseStorage = withHomebaseStorage ? {
    get: async (key, fallback = null) => {
      if (failStorage) throw new Error('Simulated HomebaseStorage get failure');
      storageCalls.get.push(key);
      return key in storageData ? storageData[key] : fallback;
    },
    getMany: async (keys) => {
      if (failStorage) throw new Error('Simulated HomebaseStorage getMany failure');
      storageCalls.get.push(keys);
      const res = {};
      for (const k of keys) {
        if (k in storageData) res[k] = storageData[k];
      }
      return res;
    },
    set: async (key, val) => {
      if (failStorage) throw new Error('Simulated HomebaseStorage set failure');
      storageCalls.set.push({ key, val });
      storageData[key] = val;
    },
    setMany: async (items) => {
      if (failStorage) throw new Error('Simulated HomebaseStorage setMany failure');
      storageCalls.setMany.push(items);
      Object.assign(storageData, items);
    }
  } : null;

  const sandbox = {
    console,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    browser: mockBrowser,
    localStorage: mockLocalStorage,
    HomebaseStorage: mockHomebaseStorage
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(widgetStorageScriptCode, context);

  return {
    storageService: context.HomebaseWidgetStorage,
    storageData,
    browserStorageData,
    localStorageData,
    storageCalls,
    context
  };
}

test('widget-storage: window.HomebaseWidgetStorage exists and exports complete API', () => {
  const { storageService } = createWidgetStorageTestEnvironment();
  assert.ok(storageService, 'HomebaseWidgetStorage should exist');

  // Verify all required methods
  const methods = [
    'getWidgetOrder',
    'setWidgetOrder',
    'getSidebarVisibility',
    'setSidebarVisibility',
    'getTimeFormat',
    'setTimeFormat',
    'getWeatherCache',
    'setWeatherCache',
    'getQuoteCache',
    'setQuoteCache',
    'getNewsCache',
    'setNewsCache',
    'getTodoState',
    'setTodoState'
  ];

  methods.forEach((m) => {
    assert.strictEqual(typeof storageService[m], 'function', `Method ${m} should be a function`);
  });

  // Verify key constants
  assert.strictEqual(storageService.WIDGET_ORDER_KEY, 'widgetOrder');
  assert.strictEqual(storageService.FAST_WIDGET_ORDER_KEY, 'fast-widget-order');
  assert.strictEqual(storageService.APP_SHOW_SIDEBAR_KEY, 'appShowSidebar');
  assert.strictEqual(storageService.FAST_SHOW_SIDEBAR_KEY, 'fast-show-sidebar');
  assert.strictEqual(storageService.APP_TIME_FORMAT_KEY, 'appTimeFormatPreference');
  assert.strictEqual(storageService.FAST_TIME_FORMAT_KEY, 'fast-time-format');
  assert.strictEqual(storageService.FAST_WEATHER_V2_KEY, 'fast-weather-v2');
  assert.strictEqual(storageService.FAST_QUOTE_V2_KEY, 'fast-quote-v2');
  assert.strictEqual(storageService.FAST_NEWS_V2_KEY, 'fast-news-v2');
  assert.strictEqual(storageService.TODO_ITEMS_KEY, 'todoItems');
});

test('widget-storage: getWidgetOrder and setWidgetOrder roundtrip with fast mirror and normalization', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  // Default order when empty
  const defaultOrder = await storageService.getWidgetOrder();
  assert.deepStrictEqual([...defaultOrder], ['weather', 'quote', 'todo', 'news']);

  // Set reordered widgets
  const newOrder = ['todo', 'news', 'weather'];
  const saved = await storageService.setWidgetOrder(newOrder);

  // Normalization should append missing 'quote'
  assert.deepStrictEqual([...saved], ['todo', 'news', 'weather', 'quote']);
  assert.deepStrictEqual([...storageData.widgetOrder], ['todo', 'news', 'weather', 'quote']);

  // Fast mirror written
  assert.strictEqual(localStorageData['fast-widget-order'], JSON.stringify(['todo', 'news', 'weather', 'quote']));

  // Reader retrieves normalized order
  const readBack = await storageService.getWidgetOrder();
  assert.deepStrictEqual([...readBack], ['todo', 'news', 'weather', 'quote']);
});

test('widget-storage: getSidebarVisibility and setSidebarVisibility roundtrip with fast mirror', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  // Default is true
  const initial = await storageService.getSidebarVisibility();
  assert.strictEqual(initial, true);

  // Set false
  await storageService.setSidebarVisibility(false);
  assert.strictEqual(storageData.appShowSidebar, false);
  assert.strictEqual(localStorageData['fast-show-sidebar'], '0');

  const afterHidden = await storageService.getSidebarVisibility();
  assert.strictEqual(afterHidden, false);

  // Set true
  await storageService.setSidebarVisibility(true);
  assert.strictEqual(storageData.appShowSidebar, true);
  assert.strictEqual(localStorageData['fast-show-sidebar'], '1');
});

test('widget-storage: getTimeFormat and setTimeFormat roundtrip with fast mirror', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  // Default is '12-hour'
  const initial = await storageService.getTimeFormat();
  assert.strictEqual(initial, '12-hour');

  // Change to 24-hour
  await storageService.setTimeFormat('24-hour');
  assert.strictEqual(storageData.appTimeFormatPreference, '24-hour');
  assert.strictEqual(localStorageData['fast-time-format'], '24-hour');

  const updated = await storageService.getTimeFormat();
  assert.strictEqual(updated, '24-hour');

  // Invalid format sanitizes to 12-hour
  await storageService.setTimeFormat('invalid');
  assert.strictEqual(storageData.appTimeFormatPreference, '12-hour');
  assert.strictEqual(localStorageData['fast-time-format'], '12-hour');
});

test('widget-storage: getWeatherCache and setWeatherCache write batch and sync both fast mirrors', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  const mockWeather = {
    data: { current: { temp: 22 } },
    cityName: 'Tokyo',
    units: 'c',
    fetchedAt: 1700000000000,
    temp: '22°',
    desc: 'Clear',
    icon: '☀️'
  };

  await storageService.setWeatherCache(mockWeather);

  // Check primary storage batch
  assert.deepStrictEqual(storageData.cachedWeatherData, { current: { temp: 22 } });
  assert.strictEqual(storageData.cachedCityName, 'Tokyo');
  assert.strictEqual(storageData.cachedUnits, 'c');
  assert.strictEqual(storageData.weatherFetchedAt, 1700000000000);

  // Check both fast-weather-v2 and legacy fast-weather mirrors
  assert.ok(localStorageData['fast-weather-v2']);
  assert.ok(localStorageData['fast-weather']);

  const v2 = JSON.parse(localStorageData['fast-weather-v2']);
  assert.strictEqual(v2.cityName, 'Tokyo');
  assert.strictEqual(v2.units, 'c');

  const legacy = JSON.parse(localStorageData['fast-weather']);
  assert.strictEqual(legacy.city, 'Tokyo');
  assert.strictEqual(legacy.temp, '22°');

  // Read back
  const readBack = await storageService.getWeatherCache();
  assert.deepStrictEqual(readBack.data, { current: { temp: 22 } });
  assert.strictEqual(readBack.cityName, 'Tokyo');
  assert.strictEqual(readBack.units, 'c');
});

test('widget-storage: getQuoteCache and setQuoteCache roundtrip with fast-quote-v2 and fast-quote-state', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  const quotePayload = {
    index: 5,
    tags: ['inspirational', 'coding'],
    frequency: 'daily',
    current: { id: 'q1', text: 'Hello World', author: 'Dev' },
    next: { id: 'q2', text: 'Next Quote', author: 'Author' },
    config: { customQuotesEnabled: true }
  };

  await storageService.setQuoteCache(quotePayload);

  // Storage data updated
  assert.strictEqual(storageData.quoteLocalIndexV1, 5);
  assert.deepStrictEqual(storageData.quoteTags, ['inspirational', 'coding']);
  assert.strictEqual(storageData.quoteFrequency, 'daily');

  // Both fast mirrors written
  assert.ok(localStorageData['fast-quote-v2']);
  assert.ok(localStorageData['fast-quote-state']);

  const parsedMirror = JSON.parse(localStorageData['fast-quote-v2']);
  assert.strictEqual(parsedMirror.current.text, 'Hello World');

  // Read back
  const read = await storageService.getQuoteCache();
  assert.strictEqual(read.index, 5);
  assert.deepStrictEqual(read.tags, ['inspirational', 'coding']);
  assert.strictEqual(read.frequency, 'daily');
  assert.strictEqual(read.current.text, 'Hello World');
});

test('widget-storage: getNewsCache and setNewsCache roundtrip with fast-news-v2 and fast-news', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  const newsPayload = {
    source: 'bbc',
    items: [
      { title: 'Headline One', link: 'https://news.local/1' },
      { title: 'Headline Two', link: 'https://news.local/2' }
    ],
    fetchedAt: 1700000500000
  };

  await storageService.setNewsCache(newsPayload);

  assert.strictEqual(storageData.appNewsSource, 'bbc');
  assert.ok(localStorageData['fast-news-v2']);
  assert.ok(localStorageData['fast-news']);

  const read = await storageService.getNewsCache();
  assert.strictEqual(read.source, 'bbc');
  assert.strictEqual(read.items.length, 2);
  assert.strictEqual(read.items[0].title, 'Headline One');
});

test('widget-storage: getTodoState and setTodoState roundtrip with fast-todo mirror', async () => {
  const { storageService, storageData, localStorageData } = createWidgetStorageTestEnvironment();

  const todoPayload = {
    items: [
      { id: '1', text: 'Buy groceries', completed: false },
      { id: '2', text: 'Walk dog', completed: true }
    ],
    hideDone: true
  };

  await storageService.setTodoState(todoPayload);

  assert.strictEqual(storageData.todoHideDone, true);
  assert.strictEqual(storageData.todoItems.length, 2);
  assert.ok(localStorageData['fast-todo']);

  const parsedMirror = JSON.parse(localStorageData['fast-todo']);
  assert.strictEqual(parsedMirror.hideDone, true);
  assert.strictEqual(parsedMirror.count, 2);

  const read = await storageService.getTodoState();
  assert.strictEqual(read.hideDone, true);
  assert.strictEqual(read.items.length, 2);
  assert.strictEqual(read.items[0].text, 'Buy groceries');
});

test('widget-storage: falls back cleanly to browser.storage.local when HomebaseStorage is absent', async () => {
  const { storageService, browserStorageData, localStorageData } = createWidgetStorageTestEnvironment({
    withHomebaseStorage: false
  });

  // Test setWidgetOrder
  await storageService.setWidgetOrder(['news', 'weather', 'quote', 'todo']);
  assert.deepStrictEqual([...browserStorageData.widgetOrder], ['news', 'weather', 'quote', 'todo']);
  assert.ok(localStorageData['fast-widget-order']);

  // Test setSidebarVisibility
  await storageService.setSidebarVisibility(false);
  assert.strictEqual(browserStorageData.appShowSidebar, false);

  // Test setTimeFormat
  await storageService.setTimeFormat('24-hour');
  assert.strictEqual(browserStorageData.appTimeFormatPreference, '24-hour');

  // Test read back from browser.storage.local
  const order = await storageService.getWidgetOrder();
  assert.deepStrictEqual([...order], ['news', 'weather', 'quote', 'todo']);
});

test('widget-storage: handles storage failures and malformed fast mirrors gracefully without throwing', async () => {
  const { storageService } = createWidgetStorageTestEnvironment({
    failStorage: true,
    initialLocalStorage: {
      'fast-widget-order': 'MALFORMED_JSON_STRING',
      'fast-show-sidebar': 'invalid-bool',
      'fast-weather-v2': 'NOT_A_JSON'
    }
  });

  // None of these should throw
  let order;
  await assert.doesNotReject(async () => {
    order = await storageService.getWidgetOrder();
  });
  assert.deepStrictEqual([...order], ['weather', 'quote', 'todo', 'news']);

  let visibility;
  await assert.doesNotReject(async () => {
    visibility = await storageService.getSidebarVisibility();
  });
  assert.strictEqual(visibility, true);

  let weather;
  await assert.doesNotReject(async () => {
    weather = await storageService.getWeatherCache();
  });
  assert.strictEqual(weather.data, null);

  await assert.doesNotReject(async () => {
    await storageService.setWidgetOrder(['weather']);
  });
});
