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
const wallpaperStorageScriptPath = path.join(rootDir, 'src/newtab/wallpaper/wallpaper-storage.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const wallpaperStorageScriptCode = fs.readFileSync(wallpaperStorageScriptPath, 'utf8');

const toPlain = (v) => (v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined);

function createWallpaperStateTestEnvironment(options = {}) {
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

  vm.runInContext(wallpaperStorageScriptCode, context);

  return {
    context,
    storageData,
    localStorageData,
    storageCalls
  };
}

test('Wallpaper State Storage - getWallpaperPool, setWallpaperPool, clearWallpaperPool roundtrip', async () => {
  const env = createWallpaperStateTestEnvironment();
  const { getWallpaperPool, setWallpaperPool, clearWallpaperPool } = env.context;

  const emptyPool = await getWallpaperPool();
  assert.deepEqual(toPlain(emptyPool), []);

  await setWallpaperPool(['wp-1', 'wp-2', 'wp-3']);
  const loadedPool = await getWallpaperPool();
  assert.deepEqual(toPlain(loadedPool), ['wp-1', 'wp-2', 'wp-3']);
  assert.deepEqual(toPlain(env.storageData.wallpaperPoolIds), ['wp-1', 'wp-2', 'wp-3']);

  await clearWallpaperPool();
  const clearedPool = await getWallpaperPool();
  assert.deepEqual(toPlain(clearedPool), []);
  assert.equal(env.storageData.wallpaperPoolIds, undefined);
});

test('Wallpaper State Storage - getWallpaperSelection, setWallpaperSelection, clearWallpaperSelection roundtrip', async () => {
  const env = createWallpaperStateTestEnvironment();
  const { getWallpaperSelection, setWallpaperSelection, clearWallpaperSelection } = env.context;

  const empty = await getWallpaperSelection();
  assert.equal(empty, null);

  const sampleSelection = {
    id: 'aurora-borealis',
    title: 'Northern Lights',
    videoUrl: 'https://example.com/aurora.mp4',
    posterUrl: 'https://example.com/aurora.webp',
    selectedAt: 1700000000000
  };

  await setWallpaperSelection(sampleSelection);
  const loaded = await getWallpaperSelection();
  assert.ok(loaded);
  assert.equal(loaded.id, 'aurora-borealis');
  assert.equal(loaded.title, 'Northern Lights');

  await clearWallpaperSelection();
  const cleared = await getWallpaperSelection();
  assert.equal(cleared, null);
  assert.equal(env.storageData.wallpaperSelection, undefined);
});

test('Wallpaper State Storage - getWallpaperFallbackUsedAt, setWallpaperFallbackUsedAt, setWallpaperSelectionWithFallback', async () => {
  const env = createWallpaperStateTestEnvironment();
  const {
    getWallpaperFallbackUsedAt,
    setWallpaperFallbackUsedAt,
    setWallpaperSelectionWithFallback,
    getWallpaperSelection
  } = env.context;

  const empty = await getWallpaperFallbackUsedAt();
  assert.equal(empty, 0);

  const ts = 1712345678900;
  await setWallpaperFallbackUsedAt(ts);
  assert.equal(await getWallpaperFallbackUsedAt(), ts);
  assert.equal(env.storageData.wallpaperFallbackUsedAt, ts);

  const selection = { id: 'fallback-mountain', title: 'Mountain' };
  const fallbackTs = 1712349999999;
  await setWallpaperSelectionWithFallback(selection, fallbackTs);

  const loadedSel = await getWallpaperSelection();
  assert.equal(loadedSel.id, 'fallback-mountain');
  assert.equal(await getWallpaperFallbackUsedAt(), fallbackTs);
  assert.equal(env.storageData.wallpaperFallbackUsedAt, fallbackTs);
});

test('Wallpaper State Storage - getDailyWallpaperEnabled and setDailyWallpaperEnabled', async () => {
  const env = createWallpaperStateTestEnvironment();
  const { getDailyWallpaperEnabled, setDailyWallpaperEnabled } = env.context;

  assert.equal(await getDailyWallpaperEnabled(), true);

  await setDailyWallpaperEnabled(false);
  assert.equal(await getDailyWallpaperEnabled(), false);
  assert.equal(env.storageData.dailyWallpaperEnabled, false);

  await setDailyWallpaperEnabled(true);
  assert.equal(await getDailyWallpaperEnabled(), true);
  assert.equal(env.storageData.dailyWallpaperEnabled, true);
});

test('Wallpaper State Storage - getPendingDailyRotation, setPendingDailyRotation, clearPendingDailyRotation', async () => {
  const env = createWallpaperStateTestEnvironment();
  const {
    getPendingDailyRotation,
    setPendingDailyRotation,
    clearPendingDailyRotation
  } = env.context;

  const initial = await getPendingDailyRotation();
  assert.deepEqual(toPlain(initial), { pending: false, since: 0 });

  const sinceTime = 1720000000123;
  await setPendingDailyRotation(true, sinceTime);

  const pendingState = await getPendingDailyRotation();
  assert.equal(pendingState.pending, true);
  assert.equal(pendingState.since, sinceTime);
  assert.equal(env.storageData.pendingDailyRotation, true);
  assert.equal(env.storageData.pendingDailyRotationSince, sinceTime);

  await clearPendingDailyRotation();
  const cleared = await getPendingDailyRotation();
  assert.deepEqual(toPlain(cleared), { pending: false, since: 0 });
  assert.equal(env.storageData.pendingDailyRotation, undefined);
  assert.equal(env.storageData.pendingDailyRotationSince, undefined);
});

test('Wallpaper State Storage - getWallpaperRotationState compound reader', async () => {
  const env = createWallpaperStateTestEnvironment({
    initialStorage: {
      wallpaperSelection: { id: 'wp-ocean', title: 'Ocean' },
      wallpaperFallbackUsedAt: 1710000000000,
      dailyWallpaperEnabled: true,
      pendingDailyRotation: true,
      pendingDailyRotationSince: 1710000500000,
      wallpaperQualityPreference: 'high'
    }
  });
  const { getWallpaperRotationState } = env.context;

  const state = await getWallpaperRotationState();
  assert.ok(state.selection);
  assert.equal(state.selection.id, 'wp-ocean');
  assert.equal(state.fallbackUsedAt, 1710000000000);
  assert.equal(state.allowDailyRotation, true);
  assert.equal(state.pending, true);
  assert.equal(state.pendingSince, 1710000500000);
  assert.equal(state.quality, 'high');
});

test('Wallpaper State Storage - syncWallpaperStartupState and getWallpaperStartupState mirror', () => {
  const env = createWallpaperStateTestEnvironment();
  const { syncWallpaperStartupState, getWallpaperStartupState } = env.context;

  assert.equal(getWallpaperStartupState(), null);

  syncWallpaperStartupState({ selectedAt: 1730000000000 }, true);
  const mirrored = getWallpaperStartupState();
  assert.deepEqual(toPlain(mirrored), {
    selectedAt: 1730000000000,
    dailyRotationEnabled: true
  });
  assert.ok(env.localStorageData.wallpaperStartupState);

  syncWallpaperStartupState(null, false);
  assert.equal(getWallpaperStartupState(), null);
  assert.equal(env.localStorageData.wallpaperStartupState, undefined);
});

test('Wallpaper State Storage - getWallpaperTypePreferenceStorage and setWallpaperTypePreferenceStorage', async () => {
  const env = createWallpaperStateTestEnvironment();
  const { getWallpaperTypePreferenceStorage, setWallpaperTypePreferenceStorage } = env.context;

  assert.equal(await getWallpaperTypePreferenceStorage(), 'video');

  await setWallpaperTypePreferenceStorage('static');
  assert.equal(await getWallpaperTypePreferenceStorage(), 'static');
  assert.equal(env.storageData.wallpaperTypePreference, 'static');

  await setWallpaperTypePreferenceStorage('video');
  assert.equal(await getWallpaperTypePreferenceStorage(), 'video');
  assert.equal(env.storageData.wallpaperTypePreference, 'video');
});

test('Wallpaper State Storage - getWallpaperQualityPreferenceStorage and setWallpaperQualityPreferenceStorage', async () => {
  const env = createWallpaperStateTestEnvironment();
  const { getWallpaperQualityPreferenceStorage, setWallpaperQualityPreferenceStorage } = env.context;

  assert.equal(await getWallpaperQualityPreferenceStorage(), 'high');

  await setWallpaperQualityPreferenceStorage('low');
  assert.equal(await getWallpaperQualityPreferenceStorage(), 'low');
  assert.equal(env.storageData.wallpaperQualityPreference, 'low');

  await setWallpaperQualityPreferenceStorage('high');
  assert.equal(await getWallpaperQualityPreferenceStorage(), 'high');
  assert.equal(env.storageData.wallpaperQualityPreference, 'high');
});

test('Wallpaper State Storage - Defensive fallback when HomebaseStorage is absent', async () => {
  const env = createWallpaperStateTestEnvironment({ withHomebaseStorage: false });
  const {
    getWallpaperPool,
    setWallpaperPool,
    getWallpaperSelection,
    setWallpaperSelection,
    getDailyWallpaperEnabled,
    setDailyWallpaperEnabled,
    getWallpaperRotationState
  } = env.context;

  assert.equal(env.context.HomebaseStorage, undefined);

  await setWallpaperPool(['def-1', 'def-2']);
  assert.deepEqual(toPlain(await getWallpaperPool()), ['def-1', 'def-2']);

  await setWallpaperSelection({ id: 'fallback-sel', title: 'Fallback' });
  const sel = await getWallpaperSelection();
  assert.equal(sel.id, 'fallback-sel');

  await setDailyWallpaperEnabled(false);
  assert.equal(await getDailyWallpaperEnabled(), false);

  const state = await getWallpaperRotationState();
  assert.equal(state.selection.id, 'fallback-sel');
  assert.equal(state.allowDailyRotation, false);
});

test('Wallpaper State Storage - Fault tolerance on storage failures', async () => {
  const env = createWallpaperStateTestEnvironment({ failStorage: true });
  const {
    getWallpaperPool,
    setWallpaperPool,
    getWallpaperSelection,
    setWallpaperSelection,
    getDailyWallpaperEnabled,
    getWallpaperRotationState
  } = env.context;

  // None of these should throw
  assert.deepEqual(toPlain(await getWallpaperPool()), []);
  await assert.doesNotReject(async () => setWallpaperPool(['a']));

  assert.equal(await getWallpaperSelection(), null);
  await assert.doesNotReject(async () => setWallpaperSelection({ id: 'err' }));

  assert.equal(await getDailyWallpaperEnabled(), true);

  const state = await getWallpaperRotationState();
  assert.deepEqual(toPlain(state), {
    selection: null,
    fallbackUsedAt: 0,
    allowDailyRotation: true,
    pending: false,
    pendingSince: 0,
    quality: null
  });
});

test('Wallpaper State Storage - Exports check on window and HomebaseWallpaperStorage', () => {
  const env = createWallpaperStateTestEnvironment();
  const { window } = env.context;

  const expectedConstants = [
    'WALLPAPER_POOL_KEY',
    'WALLPAPER_SELECTION_KEY',
    'WALLPAPER_FALLBACK_USED_KEY',
    'DAILY_ROTATION_KEY',
    'PENDING_DAILY_ROTATION_KEY',
    'PENDING_DAILY_ROTATION_SINCE_KEY',
    'WALLPAPER_STARTUP_STATE_KEY',
    'WALLPAPER_TYPE_KEY',
    'WALLPAPER_QUALITY_KEY'
  ];

  const expectedFunctions = [
    'getWallpaperPool',
    'setWallpaperPool',
    'clearWallpaperPool',
    'getWallpaperSelection',
    'setWallpaperSelection',
    'clearWallpaperSelection',
    'getWallpaperFallbackUsedAt',
    'setWallpaperFallbackUsedAt',
    'setWallpaperSelectionWithFallback',
    'getDailyWallpaperEnabled',
    'setDailyWallpaperEnabled',
    'getPendingDailyRotation',
    'setPendingDailyRotation',
    'clearPendingDailyRotation',
    'getWallpaperRotationState',
    'syncWallpaperStartupState',
    'getWallpaperStartupState',
    'getWallpaperTypePreferenceStorage',
    'setWallpaperTypePreferenceStorage',
    'getWallpaperQualityPreferenceStorage',
    'setWallpaperQualityPreferenceStorage'
  ];

  for (const c of expectedConstants) {
    assert.ok(window[c], `Expected window.${c} to exist`);
    assert.ok(window.HomebaseWallpaperStorage[c], `Expected HomebaseWallpaperStorage.${c} to exist`);
  }

  for (const fn of expectedFunctions) {
    assert.equal(typeof window[fn], 'function', `Expected window.${fn} to be a function`);
    assert.equal(typeof window.HomebaseWallpaperStorage[fn], 'function', `Expected HomebaseWallpaperStorage.${fn} to be a function`);
  }
});
