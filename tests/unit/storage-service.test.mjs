import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorScriptPath = path.join(rootDir, 'src/newtab/core/schema-validator.js');
const migrationsScriptPath = path.join(rootDir, 'src/newtab/core/schema-migrations.js');
const diagnosticsScriptPath = path.join(rootDir, 'src/newtab/core/storage-diagnostics.js');
const storageServiceScriptPath = path.join(rootDir, 'src/newtab/core/storage-service.js');

const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');

/**
 * Creates an in-memory mock of the browser storage.local and window.localStorage APIs.
 *
 * @param {Object} [initialStorage={}]
 * @param {Object} [options={}]
 * @returns {Object} Mock storage instance with call tracking
 */
function createMockStorage(initialStorage = {}, options = {}) {
  const localData = { ...initialStorage };
  const localStorageData = {};
  const calls = {
    get: [],
    set: [],
    remove: [],
    localStorageSet: [],
    localStorageRemove: []
  };

  const storageApi = {
    get: async (keys) => {
      calls.get.push(keys);
      if (options.failGet) {
        throw new Error('Simulated storage.local.get failure');
      }
      if (!keys) return { ...localData };
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        if (localData[k] !== undefined) result[k] = localData[k];
      });
      return result;
    },
    set: async (items) => {
      calls.set.push(items);
      if (options.failSet) {
        throw new Error('Simulated storage.local.set failure');
      }
      Object.assign(localData, items);
    },
    remove: async (keys) => {
      calls.remove.push(keys);
      if (options.failRemove) {
        throw new Error('Simulated storage.local.remove failure');
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        delete localData[k];
      });
    }
  };

  const localStorageMock = {
    getItem: (key) => (localStorageData[key] !== undefined ? localStorageData[key] : null),
    setItem: (key, val) => {
      calls.localStorageSet.push({ key, val });
      if (options.failLocalStorageSet) {
        throw new Error('Simulated QuotaExceededError in localStorage');
      }
      localStorageData[key] = String(val);
    },
    removeItem: (key) => {
      calls.localStorageRemove.push(key);
      delete localStorageData[key];
    },
    _data: localStorageData
  };

  return {
    data: localData,
    localStorageData,
    calls,
    api: storageApi,
    localStorage: localStorageMock
  };
}

/**
 * Sets up an isolated VM execution context with validator, migrations, diagnostics, and storage service.
 *
 * @param {Object} [initialStorage={}]
 * @param {Object} [storageOptions={}]
 * @returns {{ context: Object, storageMock: Object, HomebaseStorage: Object }}
 */
function createStorageEnvironment(initialStorage = {}, storageOptions = {}) {
  const storageMock = createMockStorage(initialStorage, storageOptions);

  const browserApi = {
    storage: {
      local: storageMock.api
    }
  };

  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Boolean,
    Date,
    Math,
    RegExp,
    JSON,
    console,
    localStorage: storageMock.localStorage,
    browser: browserApi,
    chrome: browserApi
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);

  return {
    context,
    storageMock,
    HomebaseStorage: sandbox.window.HomebaseStorage
  };
}

test('storage-service: API export and required methods', () => {
  const { HomebaseStorage } = createStorageEnvironment();

  assert.ok(HomebaseStorage, 'window.HomebaseStorage must be defined');
  assert.equal(typeof HomebaseStorage.get, 'function', 'get must be a function');
  assert.equal(typeof HomebaseStorage.getMany, 'function', 'getMany must be a function');
  assert.equal(typeof HomebaseStorage.set, 'function', 'set must be a function');
  assert.equal(typeof HomebaseStorage.setMany, 'function', 'setMany must be a function');
  assert.equal(typeof HomebaseStorage.remove, 'function', 'remove must be a function');
  assert.equal(typeof HomebaseStorage.snapshot, 'function', 'snapshot must be a function');
  assert.equal(typeof HomebaseStorage.health, 'function', 'health must be a function');
  assert.ok(HomebaseStorage.FAST_MIRROR_MAP, 'FAST_MIRROR_MAP must be exported');
  assert.equal(HomebaseStorage.FAST_MIRROR_MAP.appBackgroundDim, 'fast-bg-dim');
});

test('storage-service: get reads and sanitizes valid value from storage.local', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    appBackgroundDim: 40,
    currentSearchEngineId: 'duckduckgo',
    appGridAnimationSpeed: 0.75
  });

  const dim = await HomebaseStorage.get('appBackgroundDim');
  assert.equal(dim, 40);

  const engine = await HomebaseStorage.get('currentSearchEngineId');
  assert.equal(engine, 'duckduckgo');

  const speed = await HomebaseStorage.get('appGridAnimationSpeed');
  assert.equal(speed, 0.75);
});

test('storage-service: get falls back to schema default when key is missing in storage', async () => {
  const { HomebaseStorage } = createStorageEnvironment({});

  // appBackgroundDim default is 0
  const dim = await HomebaseStorage.get('appBackgroundDim');
  assert.equal(dim, 0);

  // appGridAnimationSpeed default is 0.3
  const speed = await HomebaseStorage.get('appGridAnimationSpeed');
  assert.equal(speed, 0.3);

  // appPerformanceMode default is false
  const perf = await HomebaseStorage.get('appPerformanceMode');
  assert.equal(perf, false);
});

test('storage-service: get returns caller default when key is unknown and fallback passed', async () => {
  const { HomebaseStorage } = createStorageEnvironment({});

  const val = await HomebaseStorage.get('completelyUnknownKey', 'customFallback');
  assert.equal(val, 'customFallback');
});

test('storage-service: get sanitizes corrupted stored values to valid defaults', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    appBackgroundDim: 'completely_corrupted_not_a_number',
    appTimeFormatPreference: 'invalid_format_xyz'
  });

  // Sanitized to schema default 0
  const dim = await HomebaseStorage.get('appBackgroundDim');
  assert.equal(dim, 0);

  // Sanitized to time format default '12-hour'
  const timeFormat = await HomebaseStorage.get('appTimeFormatPreference');
  assert.equal(timeFormat, '12-hour');
});

test('storage-service: get preserves unknown future keys if valid', async () => {
  const futureData = { version: 2, featureEnabled: true };
  const { HomebaseStorage } = createStorageEnvironment({
    futurePluginData: futureData
  });

  const res = await HomebaseStorage.get('futurePluginData');
  assert.deepStrictEqual({ ...res }, futureData);
});

test('storage-service: get guards against prototype pollution keys', async () => {
  const { HomebaseStorage } = createStorageEnvironment({});

  assert.equal(await HomebaseStorage.get('__proto__'), undefined);
  assert.equal(await HomebaseStorage.get('constructor'), undefined);
  assert.equal(await HomebaseStorage.get('prototype'), undefined);
});

test('storage-service: getMany reads and validates multiple keys', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    currentSearchEngineId: 'google',
    appTimeFormatPreference: '24-hour',
    appBackgroundDim: 25
  });

  const res = await HomebaseStorage.getMany(['currentSearchEngineId', 'appTimeFormatPreference', 'appBackgroundDim']);
  assert.deepStrictEqual({ ...res }, {
    currentSearchEngineId: 'google',
    appTimeFormatPreference: '24-hour',
    appBackgroundDim: 25
  });
});

test('storage-service: getMany populates schema defaults for missing requested keys', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    appTimeFormatPreference: '24-hour'
  });

  const res = await HomebaseStorage.getMany(['appTimeFormatPreference', 'appBackgroundDim', 'appGridAnimationSpeed']);
  assert.equal(res.appTimeFormatPreference, '24-hour');
  assert.equal(res.appBackgroundDim, 0); // Schema default
  assert.equal(res.appGridAnimationSpeed, 0.3); // Schema default
});

test('storage-service: getMany reads and sanitizes all keys when null is passed', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    currentSearchEngineId: 'bing',
    appTimeFormatPreference: '12-hour',
    schemaVersion: 1
  });

  const res = await HomebaseStorage.getMany(null);
  assert.equal(res.currentSearchEngineId, 'bing');
  assert.equal(res.appTimeFormatPreference, '12-hour');
  assert.equal(res.schemaVersion, 1);
});

test('storage-service: set validates, normalizes, and writes value with fast mirror sync', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  const res = await HomebaseStorage.set('appBackgroundDim', 45);
  assert.equal(res.success, true);
  assert.equal(res.key, 'appBackgroundDim');
  assert.equal(res.value, 45);

  // Assert browser.storage.local.set was called
  assert.equal(storageMock.data.appBackgroundDim, 45);
  assert.equal(storageMock.calls.set.length, 1);

  // Assert synchronous fast mirror in localStorage was synchronized
  assert.equal(storageMock.localStorageData['fast-bg-dim'], '45');
});

test('storage-service: set normalizes 3-char hex color to 6-char hex before writing', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  const res = await HomebaseStorage.set('appBookmarkFallbackColor', '#abc');
  assert.equal(res.success, true);
  assert.equal(res.value, '#aabbcc');
  assert.equal(storageMock.data.appBookmarkFallbackColor, '#aabbcc');
});

test('storage-service: set clamps numeric values within bounds before writing', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  // appGridAnimationSpeed bounds: min 0.1, max 1.0
  const res = await HomebaseStorage.set('appGridAnimationSpeed', 1.8);
  assert.equal(res.success, true);
  assert.equal(res.value, 1.0); // Clamped to max 1.0
  assert.equal(storageMock.data.appGridAnimationSpeed, 1.0);

  // appBackgroundDim bounds: min 0, max 80
  const resDim = await HomebaseStorage.set('appBackgroundDim', 120);
  assert.equal(resDim.success, true);
  assert.equal(resDim.value, 80); // Clamped to max 80
  assert.equal(storageMock.data.appBackgroundDim, 80);
  assert.equal(storageMock.localStorageData['fast-bg-dim'], '80');
});

test('storage-service: set rejects unrecoverable invalid writes safely without modifying storage', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({
    appBackgroundDim: 20
  });

  // Invalid value: non-finite / string for a bounded integer
  const res = await HomebaseStorage.set('appBackgroundDim', 'completely_invalid');
  assert.equal(res.success, false);
  assert.equal(res.error, 'VALIDATION_FAILED');
  assert.ok(res.detail);

  // Storage MUST NOT be written to
  assert.equal(storageMock.calls.set.length, 0);
  assert.equal(storageMock.data.appBackgroundDim, 20); // Existing value preserved
});

test('storage-service: set rejects prototype pollution properties', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  const res = await HomebaseStorage.set('__proto__', { admin: true });
  assert.equal(res.success, false);
  assert.equal(res.error, 'FORBIDDEN_PROPERTY');
  assert.equal(storageMock.calls.set.length, 0);
});

test('storage-service: setMany writes only valid values and reports rejected keys', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  const batch = {
    appTimeFormatPreference: '24-hour',
    appBookmarkFallbackColor: '#fff',
    appBackgroundDim: 'invalid_dim_value' // should be rejected
  };
  Object.defineProperty(batch, '__proto__', {
    value: { bad: true },
    enumerable: true,
    configurable: true
  });

  const res = await HomebaseStorage.setMany(batch);
  assert.equal(res.success, true);
  assert.deepStrictEqual(Array.from(res.writtenKeys).sort(), ['appBookmarkFallbackColor', 'appTimeFormatPreference']);
  assert.ok(res.rejectedKeys.includes('appBackgroundDim'));
  assert.ok(res.rejectedKeys.includes('__proto__'));
  assert.equal(res.count, 2);

  // Stored values
  assert.equal(storageMock.data.appTimeFormatPreference, '24-hour');
  assert.equal(storageMock.data.appBookmarkFallbackColor, '#ffffff'); // normalized
  assert.equal(storageMock.data.appBackgroundDim, undefined); // not written
});

test('storage-service: setMany rejects completely invalid batch with zero storage writes', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({});

  const res = await HomebaseStorage.setMany({
    appBackgroundDim: 'invalid_val_1',
    appTimeFormatPreference: 'invalid_val_2'
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'NO_VALID_KEYS');
  assert.equal(storageMock.calls.set.length, 0);
});

test('storage-service: remove deletes key and cleans fast mirror', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({
    appBackgroundDim: 30,
    currentSearchEngineId: 'google'
  });
  storageMock.localStorageData['fast-bg-dim'] = '30';

  const res = await HomebaseStorage.remove('appBackgroundDim');
  assert.equal(res.success, true);
  assert.deepStrictEqual(Array.from(res.removedKeys), ['appBackgroundDim']);
  assert.equal(storageMock.data.appBackgroundDim, undefined);
  assert.equal(storageMock.localStorageData['fast-bg-dim'], undefined);
  assert.equal(storageMock.data.currentSearchEngineId, 'google'); // untouched
});

test('storage-service: remove safely deletes multiple keys', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({
    key1: 'val1',
    key2: 'val2',
    key3: 'val3'
  });

  const res = await HomebaseStorage.remove(['key1', 'key2']);
  assert.equal(res.success, true);
  assert.deepStrictEqual(Array.from(res.removedKeys), ['key1', 'key2']);
  assert.equal(storageMock.data.key1, undefined);
  assert.equal(storageMock.data.key2, undefined);
  assert.equal(storageMock.data.key3, 'val3');
});

test('storage-service: snapshot returns an isolated deep clone of storage', async () => {
  const { HomebaseStorage, storageMock } = createStorageEnvironment({
    schemaVersion: 1,
    widgetOrder: ['weather', 'quote', 'todo', 'news']
  });

  const snap = await HomebaseStorage.snapshot();
  assert.equal(snap.schemaVersion, 1);
  assert.deepStrictEqual(Array.from(snap.widgetOrder), ['weather', 'quote', 'todo', 'news']);

  // Modifying snapshot should NOT mutate internal storage
  snap.widgetOrder.push('newWidget');
  assert.equal(storageMock.data.widgetOrder.length, 4);

  // Subsequent snapshot remains clean
  const snap2 = await HomebaseStorage.snapshot();
  assert.equal(snap2.widgetOrder.length, 4);
});

test('storage-service: health reports structural metadata with zero user data (Privacy Guarantee)', async () => {
  const { HomebaseStorage } = createStorageEnvironment({
    schemaVersion: 1,
    currentSearchEngineId: 'google',
    appBookmarkFallbackColor: '#4f46e5',
    bookmarksTree: [{ id: '1', title: 'SECRET_BOOKMARK', url: 'https://secret.com' }],
    todoItems: [{ id: 't1', text: 'SECRET_TODO' }]
  });

  const report = await HomebaseStorage.health();

  assert.equal(report.service, 'HomebaseStorage');
  assert.equal(report.status, 'HEALTHY');
  assert.equal(report.storageAvailable, true);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.totalKeys, 5);
  assert.equal(report.validatorAttached, true);
  assert.equal(report.diagnosticsAttached, true);
  assert.equal(report.fastMirrorsActive, true);
  assert.ok(report.timestamp);

  // PRIVACY VERIFICATION: serialize report and assert ZERO sensitive keywords exist
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('SECRET_BOOKMARK'), false, 'Must not leak bookmark titles');
  assert.equal(serialized.includes('https://secret.com'), false, 'Must not leak URLs');
  assert.equal(serialized.includes('SECRET_TODO'), false, 'Must not leak todo text');
});

test('storage-service: health reports DEGRADED when storage.get fails', async () => {
  const { HomebaseStorage } = createStorageEnvironment({}, { failGet: true });

  const report = await HomebaseStorage.health();
  assert.equal(report.status, 'DEGRADED');
  assert.ok(report.error.includes('Simulated storage.local.get failure'));
});
