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
const searchStorageScriptPath = path.join(rootDir, 'src/newtab/search/search-storage.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const searchStorageScriptCode = fs.readFileSync(searchStorageScriptPath, 'utf8');

function createSearchStorageTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };
  const storageCalls = { get: [], set: [], remove: [] };

  const storageMock = {
    get: async (keys) => {
      if (failStorage) throw new Error('Simulated storage get failure');
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
      if (failStorage) throw new Error('Simulated storage set failure');
      storageCalls.set.push(items);
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      if (failStorage) throw new Error('Simulated storage remove failure');
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

  const sandbox = {
    console,
    window: null,
    localStorage: localStorageMock,
    browser: {
      storage: {
        local: storageMock
      }
    },
    chrome: {
      storage: {
        local: storageMock
      }
    }
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  if (withHomebaseStorage) {
    vm.runInContext(utilsScriptCode, context);
    vm.runInContext(validatorScriptCode, context);
    vm.runInContext(migrationsScriptCode, context);
    vm.runInContext(diagnosticsScriptCode, context);
    vm.runInContext(storageServiceScriptCode, context);
  }

  vm.runInContext(searchStorageScriptCode, context);

  return {
    sandbox,
    context,
    storageData,
    localStorageData,
    storageCalls
  };
}

// -------------------------------------------------------------
// Current Search Engine Selection via HomebaseStorage & Fallback
// -------------------------------------------------------------

test('search-storage: getCurrentSearchEngineId reads valid engine via HomebaseStorage', async () => {
  const env = createSearchStorageTestEnvironment({
    initialStorage: {
      currentSearchEngineId: 'duckduckgo'
    }
  });

  assert.equal(typeof env.sandbox.HomebaseStorage, 'object');
  const engineId = await env.sandbox.getCurrentSearchEngineId();
  assert.equal(engineId, 'duckduckgo');
});

test('search-storage: getCurrentSearchEngineId returns "google" when key is missing or invalid', async () => {
  const env = createSearchStorageTestEnvironment();
  const defaultId = await env.sandbox.getCurrentSearchEngineId();
  assert.equal(defaultId, 'google');

  const envInvalid = createSearchStorageTestEnvironment({
    initialStorage: {
      currentSearchEngineId: '   '
    }
  });
  const sanitizedId = await envInvalid.sandbox.getCurrentSearchEngineId();
  assert.equal(sanitizedId, 'google');
});

test('search-storage: setCurrentSearchEngine persists string ID and syncs fast-search mirror', async () => {
  const env = createSearchStorageTestEnvironment();

  const engine = {
    id: 'bing',
    name: 'Bing',
    color: '#008373',
    symbolId: 'icon-bing'
  };

  await env.sandbox.setCurrentSearchEngine(engine);

  assert.equal(env.storageData.currentSearchEngineId, 'bing');

  // Verify fast-search mirror synchronization
  const fastSearchRaw = env.localStorageData['fast-search'];
  assert.ok(fastSearchRaw, 'fast-search mirror should be written to localStorage');
  const fastSearch = JSON.parse(fastSearchRaw);
  assert.equal(fastSearch.engineId, 'bing');
  assert.equal(fastSearch.selectorData.name, 'Bing');
  assert.equal(fastSearch.selectorData.color, '#008373');
});

test('search-storage: current search engine falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSearchStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      currentSearchEngineId: 'ecosia'
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  // Read via fallback
  const readId = await env.sandbox.getCurrentSearchEngineId();
  assert.equal(readId, 'ecosia');

  // Write via fallback
  await env.sandbox.setCurrentSearchEngine('brave');
  assert.equal(env.storageData.currentSearchEngineId, 'brave');
});

// -------------------------------------------------------------
// Default Search Engine via HomebaseStorage & Fallback
// -------------------------------------------------------------

test('search-storage: getDefaultSearchEngineId and setDefaultSearchEngineId manage default engine', async () => {
  const env = createSearchStorageTestEnvironment();

  // Missing initially defaults to 'google'
  const initial = await env.sandbox.getDefaultSearchEngineId();
  assert.equal(initial, 'google');

  // Persist new default engine
  await env.sandbox.setDefaultSearchEngineId('duckduckgo');
  assert.equal(env.storageData.appSearchDefaultEngine, 'duckduckgo');

  const updated = await env.sandbox.getDefaultSearchEngineId();
  assert.equal(updated, 'duckduckgo');
});

test('search-storage: default search engine falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSearchStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      appSearchDefaultEngine: 'startpage'
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  const read = await env.sandbox.getDefaultSearchEngineId();
  assert.equal(read, 'startpage');

  await env.sandbox.setDefaultSearchEngineId('yahoo');
  assert.equal(env.storageData.appSearchDefaultEngine, 'yahoo');
});

// -------------------------------------------------------------
// Remember Engine Preference via HomebaseStorage & Fallback
// -------------------------------------------------------------

test('search-storage: getSearchRememberEnginePreference and setSearchRememberEnginePreference manage boolean preference', async () => {
  const env = createSearchStorageTestEnvironment();

  // Missing initially defaults to true
  const initial = await env.sandbox.getSearchRememberEnginePreference();
  assert.equal(initial, true);

  // Update to false
  await env.sandbox.setSearchRememberEnginePreference(false);
  assert.equal(env.storageData.appSearchRememberEngine, false);

  const updated = await env.sandbox.getSearchRememberEnginePreference();
  assert.equal(updated, false);

  // Fallback test
  const fbEnv = createSearchStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      appSearchRememberEngine: false
    }
  });
  assert.equal(await fbEnv.sandbox.getSearchRememberEnginePreference(), false);
  await fbEnv.sandbox.setSearchRememberEnginePreference(true);
  assert.equal(fbEnv.storageData.appSearchRememberEngine, true);
});

// -------------------------------------------------------------
// Search Engines Config & Batch Preferences
// -------------------------------------------------------------

test('search-storage: getSearchEnginesConfig and setSearchEnginesConfig handle engine list', async () => {
  const env = createSearchStorageTestEnvironment();

  const empty = await env.sandbox.getSearchEnginesConfig();
  assert.deepEqual(JSON.parse(JSON.stringify(empty)), []);

  const config = [
    { id: 'google', enabled: true },
    { id: 'bing', enabled: false }
  ];
  await env.sandbox.setSearchEnginesConfig(config);

  const stored = env.storageData.searchEnginesConfig;
  assert.ok(Array.isArray(stored));
  assert.equal(stored.length, 2);
  assert.equal(stored[0].id, 'google');
  assert.equal(stored[1].enabled, false);
});

test('search-storage: getSearchPreferences loads all search keys in batch', async () => {
  const env = createSearchStorageTestEnvironment({
    initialStorage: {
      searchEnginesConfig: [{ id: 'google', enabled: true }],
      currentSearchEngineId: 'duckduckgo',
      appSearchRememberEngine: false,
      appSearchDefaultEngine: 'duckduckgo'
    }
  });

  const prefs = await env.sandbox.getSearchPreferences();
  assert.ok(prefs);
  assert.equal(prefs.currentSearchEngineId, 'duckduckgo');
  assert.equal(prefs.appSearchRememberEngine, false);
  assert.equal(prefs.appSearchDefaultEngine, 'duckduckgo');
  assert.equal(prefs.searchEnginesConfig.length, 1);
});

test('search-storage: setSearchPreferences persists multiple search keys in batch', async () => {
  const env = createSearchStorageTestEnvironment();

  await env.sandbox.setSearchPreferences({
    currentSearchEngineId: 'bing',
    appSearchDefaultEngine: 'bing',
    appSearchRememberEngine: true
  });

  assert.equal(env.storageData.currentSearchEngineId, 'bing');
  assert.equal(env.storageData.appSearchDefaultEngine, 'bing');
  assert.equal(env.storageData.appSearchRememberEngine, true);
});

// -------------------------------------------------------------
// Fast-Search Mirror Synchronization Helpers
// -------------------------------------------------------------

test('search-storage: getFastSearchCache, writeFastSearchCache, and clearFastSearchCache manage mirror', () => {
  const env = createSearchStorageTestEnvironment();

  // Initially empty
  assert.equal(env.sandbox.getFastSearchCache(), null);

  const engine = {
    id: 'kagi',
    name: 'Kagi',
    color: '#FFB319',
    symbolId: null
  };

  env.sandbox.writeFastSearchCache(engine);

  const cached = env.sandbox.getFastSearchCache();
  assert.ok(cached);
  assert.equal(cached.engineId, 'kagi');
  assert.equal(cached.selectorData.name, 'Kagi');
  assert.equal(cached.selectorData.color, '#FFB319');
  assert.equal(cached.selectorData.fallback, 'K');

  env.sandbox.clearFastSearchCache();
  assert.equal(env.sandbox.getFastSearchCache(), null);
});

test('search-storage: getFastSearchCache handles corrupted localStorage JSON safely', () => {
  const env = createSearchStorageTestEnvironment({
    initialLocalStorage: {
      'fast-search': '{ not valid json'
    }
  });

  const cached = env.sandbox.getFastSearchCache();
  assert.equal(cached, null);
});

// -------------------------------------------------------------
// Namespace & Window Exports Verification
// -------------------------------------------------------------

test('search-storage: exports expected functions and keys to window and HomebaseSearchStorage', () => {
  const env = createSearchStorageTestEnvironment();

  assert.equal(typeof env.sandbox.getCurrentSearchEngineId, 'function');
  assert.equal(typeof env.sandbox.setCurrentSearchEngine, 'function');
  assert.equal(typeof env.sandbox.getDefaultSearchEngineId, 'function');
  assert.equal(typeof env.sandbox.setDefaultSearchEngineId, 'function');
  assert.equal(typeof env.sandbox.getSearchRememberEnginePreference, 'function');
  assert.equal(typeof env.sandbox.setSearchRememberEnginePreference, 'function');
  assert.equal(typeof env.sandbox.getSearchEnginesConfig, 'function');
  assert.equal(typeof env.sandbox.setSearchEnginesConfig, 'function');
  assert.equal(typeof env.sandbox.getSearchPreferences, 'function');
  assert.equal(typeof env.sandbox.setSearchPreferences, 'function');
  assert.equal(typeof env.sandbox.getFastSearchPayload, 'function');
  assert.equal(typeof env.sandbox.writeFastSearchCache, 'function');

  const namespace = env.sandbox.HomebaseSearchStorage;
  assert.ok(namespace, 'HomebaseSearchStorage namespace should exist');
  assert.equal(typeof namespace.getCurrentSearchEngineId, 'function');
  assert.equal(typeof namespace.setCurrentSearchEngine, 'function');
  assert.equal(typeof namespace.getDefaultSearchEngineId, 'function');
  assert.equal(typeof namespace.setDefaultSearchEngineId, 'function');
  assert.equal(typeof namespace.getSearchRememberEnginePreference, 'function');
  assert.equal(typeof namespace.setSearchRememberEnginePreference, 'function');
  assert.equal(typeof namespace.getSearchEnginesConfig, 'function');
  assert.equal(typeof namespace.setSearchEnginesConfig, 'function');
  assert.equal(typeof namespace.getSearchPreferences, 'function');
  assert.equal(typeof namespace.setSearchPreferences, 'function');
  assert.equal(typeof namespace.writeFastSearchCache, 'function');
});
