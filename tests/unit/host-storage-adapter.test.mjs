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
const hostStorageAdapterScriptPath = path.join(rootDir, 'src/newtab/core/host-storage-adapter.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const hostStorageAdapterScriptCode = fs.readFileSync(hostStorageAdapterScriptPath, 'utf8');

const toPlain = (v) => (v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined);

function createHostAdapterTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const storageCalls = { get: [], set: [], remove: [] };
  const listeners = [];

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
      if (typeof keys === 'object') {
        const res = { ...keys };
        for (const k of Object.keys(keys)) {
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

  const sandbox = {
    console,
    window: null,
    browser: {
      storage: {
        local: storageMock,
        onChanged: {
          addListener: (l) => { listeners.push(l); }
        }
      }
    },
    chrome: {
      storage: {
        local: storageMock,
        onChanged: {
          addListener: (l) => { listeners.push(l); }
        }
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

  vm.runInContext(hostStorageAdapterScriptCode, context);

  return {
    context,
    storageData,
    storageCalls,
    listeners
  };
}

test('Host Storage Adapter - bridgeStorageGet reads string, array, object with defaults, and null', async () => {
  const env = createHostAdapterTestEnvironment({
    initialStorage: {
      wallpaperTypePreference: 'static',
      dailyWallpaperEnabled: false,
      appTimeFormatPreference: '24h'
    }
  });
  const { bridgeStorageGet } = env.context;

  // 1. Single string key
  const stringRes = await bridgeStorageGet('wallpaperTypePreference');
  assert.deepEqual(toPlain(stringRes), { wallpaperTypePreference: 'static' });

  // 2. Array of keys
  const arrayRes = await bridgeStorageGet(['wallpaperTypePreference', 'dailyWallpaperEnabled']);
  assert.deepEqual(toPlain(arrayRes), {
    wallpaperTypePreference: 'static',
    dailyWallpaperEnabled: false
  });

  // 3. Object with defaults
  const objRes = await bridgeStorageGet({
    wallpaperTypePreference: 'video',
    missingKey: 'defaultMissing'
  });
  assert.deepEqual(toPlain(objRes), {
    wallpaperTypePreference: 'static',
    missingKey: 'defaultMissing'
  });

  // 4. Null / undefined (all keys)
  const allRes = await bridgeStorageGet(null);
  assert.equal(allRes.wallpaperTypePreference, 'static');
  assert.equal(allRes.dailyWallpaperEnabled, false);
});

test('Host Storage Adapter - bridgeStorageSet persists via HomebaseStorage', async () => {
  const env = createHostAdapterTestEnvironment();
  const { bridgeStorageSet, bridgeStorageGet } = env.context;

  await bridgeStorageSet({
    wallpaperTypePreference: 'static',
    dailyWallpaperEnabled: false
  });

  assert.equal(env.storageData.wallpaperTypePreference, 'static');
  assert.equal(env.storageData.dailyWallpaperEnabled, false);

  const readBack = await bridgeStorageGet(['wallpaperTypePreference', 'dailyWallpaperEnabled']);
  assert.deepEqual(toPlain(readBack), {
    wallpaperTypePreference: 'static',
    dailyWallpaperEnabled: false
  });
});

test('Host Storage Adapter - bridgeStorageRemove removes single and multiple keys', async () => {
  const env = createHostAdapterTestEnvironment({
    initialStorage: {
      key1: 'val1',
      key2: 'val2',
      key3: 'val3'
    }
  });
  const { bridgeStorageRemove } = env.context;

  await bridgeStorageRemove('key1');
  assert.equal(env.storageData.key1, undefined);
  assert.equal(env.storageData.key2, 'val2');

  await bridgeStorageRemove(['key2', 'key3']);
  assert.equal(env.storageData.key2, undefined);
  assert.equal(env.storageData.key3, undefined);
});

test('Host Storage Adapter - bridgeStorageAddListener attaches listener to storage.onChanged', () => {
  const env = createHostAdapterTestEnvironment();
  const { bridgeStorageAddListener } = env.context;

  let called = false;
  const listener = () => { called = true; };
  bridgeStorageAddListener(listener);

  assert.equal(env.listeners.length, 1);
  env.listeners[0]();
  assert.equal(called, true);
});

test('Host Storage Adapter - createGalleryStorageBridge provides storageLocalGet, Set, Remove', async () => {
  const env = createHostAdapterTestEnvironment({
    initialStorage: {
      wallpaperTypePreference: 'video'
    }
  });
  const { createGalleryStorageBridge } = env.context;

  const bridge = createGalleryStorageBridge();
  assert.equal(typeof bridge.storageLocalGet, 'function');
  assert.equal(typeof bridge.storageLocalSet, 'function');
  assert.equal(typeof bridge.storageLocalRemove, 'function');

  const res = await bridge.storageLocalGet('wallpaperTypePreference');
  assert.deepEqual(toPlain(res), { wallpaperTypePreference: 'video' });

  await bridge.storageLocalSet({ wallpaperTypePreference: 'static' });
  assert.equal(env.storageData.wallpaperTypePreference, 'static');

  await bridge.storageLocalRemove('wallpaperTypePreference');
  assert.equal(env.storageData.wallpaperTypePreference, undefined);
});

test('Host Storage Adapter - createBookmarkEditorStorageBridge provides storageLocalGet, Set, and listener', async () => {
  const env = createHostAdapterTestEnvironment({
    initialStorage: {
      domainIconMap: { 'example.com': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
    }
  });
  const { createBookmarkEditorStorageBridge } = env.context;

  const bridge = createBookmarkEditorStorageBridge();
  assert.equal(typeof bridge.storageLocalGet, 'function');
  assert.equal(typeof bridge.storageLocalSet, 'function');
  assert.equal(typeof bridge.addStorageChangedListener, 'function');

  const res = await bridge.storageLocalGet('domainIconMap');
  assert.deepEqual(toPlain(res), {
    domainIconMap: { 'example.com': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
  });

  await bridge.storageLocalSet({
    domainIconMap: { 'example.com': 'data:image/png;base64,UPDATED' }
  });
  assert.deepEqual(toPlain(env.storageData.domainIconMap), {
    'example.com': 'data:image/png;base64,UPDATED'
  });

  let called = false;
  bridge.addStorageChangedListener(() => { called = true; });
  assert.equal(env.listeners.length, 1);
  env.listeners[0]();
  assert.equal(called, true);
});

test('Host Storage Adapter - Defensive fallback when HomebaseStorage is absent', async () => {
  const env = createHostAdapterTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      customFallbackKey: 'fallbackVal'
    }
  });
  const { bridgeStorageGet, bridgeStorageSet, bridgeStorageRemove } = env.context;

  assert.equal(env.context.HomebaseStorage, undefined);

  // 1. Get fallback
  const getRes = await bridgeStorageGet('customFallbackKey');
  assert.deepEqual(toPlain(getRes), { customFallbackKey: 'fallbackVal' });

  // 2. Set fallback
  await bridgeStorageSet({ newKey: 'newVal' });
  assert.equal(env.storageData.newKey, 'newVal');

  // 3. Remove fallback
  await bridgeStorageRemove('newKey');
  assert.equal(env.storageData.newKey, undefined);
});

test('Host Storage Adapter - Fault tolerance on storage failure without throwing', async () => {
  const env = createHostAdapterTestEnvironment({ failStorage: true });
  const { bridgeStorageGet, bridgeStorageSet, bridgeStorageRemove } = env.context;

  const getRes = await bridgeStorageGet({ fallbackA: 'defA' });
  assert.deepEqual(toPlain(getRes), { fallbackA: 'defA' });

  await assert.doesNotReject(async () => bridgeStorageSet({ a: 1 }));
  await assert.doesNotReject(async () => bridgeStorageRemove('a'));
});

test('Host Storage Adapter - Exports verification on window and HomebaseHostStorageAdapter', () => {
  const env = createHostAdapterTestEnvironment();
  const { window } = env.context;

  const expectedFunctions = [
    'bridgeStorageGet',
    'bridgeStorageSet',
    'bridgeStorageRemove',
    'bridgeStorageAddListener',
    'createGalleryStorageBridge',
    'createBookmarkEditorStorageBridge'
  ];

  for (const fn of expectedFunctions) {
    assert.equal(typeof window[fn], 'function', `Expected window.${fn} to be a function`);
    assert.equal(typeof window.HomebaseHostStorageAdapter[fn], 'function', `Expected HomebaseHostStorageAdapter.${fn} to be a function`);
  }
});
