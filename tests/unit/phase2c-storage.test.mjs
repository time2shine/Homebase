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

const diagnosticUiScriptPath = path.join(rootDir, 'src/newtab/settings/diagnostic-ui.js');
const galleryUiScriptPath = path.join(rootDir, 'src/newtab/wallpaper/gallery-ui.js');
const firefoxContainersScriptPath = path.join(rootDir, 'src/newtab/integrations/firefox-containers.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');

const diagnosticUiScriptCode = fs.readFileSync(diagnosticUiScriptPath, 'utf8');
const galleryUiScriptCode = fs.readFileSync(galleryUiScriptPath, 'utf8');
const firefoxContainersScriptCode = fs.readFileSync(firefoxContainersScriptPath, 'utf8');

/**
 * Creates an in-memory test environment supporting DOM mocks and storage mocking for Phase 2C tests.
 */
function createPhase2cEnvironment(options = {}) {
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
    },
    style: { setProperty: () => {} }
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
    },
    prepend: () => {}
  };

  const elementsById = new Map();
  const elementsByQuery = new Map();
  const listenersMap = new Map();

  function makeMockElement(tag = 'div', id = '') {
    const el = {
      tagName: tag.toUpperCase(),
      id,
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
      children: [],
      addEventListener: function(event, fn) {
        if (!listenersMap.has(this)) listenersMap.set(this, {});
        const map = listenersMap.get(this);
        if (!map[event]) map[event] = [];
        map[event].push(fn);
      },
      removeEventListener: function(event, fn) {
        if (!listenersMap.has(this)) return;
        const map = listenersMap.get(this);
        if (map[event]) {
          map[event] = map[event].filter(h => h !== fn);
        }
      },
      triggerEvent: async function(event, eventObj = {}) {
        if (!listenersMap.has(this)) return;
        const map = listenersMap.get(this);
        if (map[event]) {
          for (const fn of map[event]) {
            await fn(eventObj);
          }
        }
      },
      querySelector: (q) => elementsByQuery.get(q) || null,
      querySelectorAll: () => [],
      replaceChildren: function(...children) { this.children = children; },
      appendChild: function(c) { this.children.push(c); },
      removeChild: function(c) { this.children = this.children.filter(x => x !== c); },
      setAttribute: function(k, v) {},
      getAttribute: function(k) { return null; },
      removeAttribute: function(k) {},
      closest: function() { return null; },
      focus: function() {}
    };
    if (id) elementsById.set(id, el);
    return el;
  }

  // Pre-create container elements
  makeMockElement('input', 'app-container-mode-toggle');
  makeMockElement('div', 'container-sub-settings');
  makeMockElement('div', 'app-container-behavior-row');
  const radioKeep = makeMockElement('input');
  radioKeep.value = 'keep';
  const radioClose = makeMockElement('input');
  radioClose.value = 'close';
  elementsByQuery.set('input[name="container-behavior"][value="keep"]', radioKeep);
  elementsByQuery.set('input[name="container-behavior"][value="close"]', radioClose);

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
      },
      contextualIdentities: {},
      runtime: {
        getManifest: () => ({ version: '0.15.0' })
      }
    },
    document: {
      documentElement: docElement,
      body: bodyElement,
      head: { appendChild: () => {} },
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: (q) => elementsByQuery.get(q) || null,
      querySelectorAll: () => [],
      createElement: (tag) => makeMockElement(tag),
      createDocumentFragment: () => ({ appendChild: () => {} })
    },
    navigator: {
      userAgent: 'Mozilla/5.0'
    },
    APP_CONTAINER_MODE_KEY: 'appContainerMode',
    APP_CONTAINER_NEW_TAB_KEY: 'appContainerNewTab',
    appContainerModePreference: false,
    appContainerNewTabPreference: true,
    setSubSettingsExpanded: () => {}
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  // Load core stack
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
    elementsByQuery,
    radioKeep,
    radioClose
  };
}

// -------------------------------------------------------------
// Diagnostic UI Tests
// -------------------------------------------------------------

test('diagnostic-ui: handleAutoRepairStorage reads and repairs storage via HomebaseStorage', async () => {
  const env = createPhase2cEnvironment({
    initialStorage: {
      schemaVersion: 1,
      appBackgroundDim: 250, // Corrupted / out of bounds -> clamps to 80
      clockType: 'analog'
    }
  });
  vm.runInContext(diagnosticUiScriptCode, env.context);

  const button = env.sandbox.document.createElement('button');
  button.textContent = 'Auto-Repair Storage';

  const res = await env.sandbox.HomebaseDiagnosticUI.handleAutoRepairStorage(button);

  assert.equal(res.repaired, true);
  assert.equal(res.count, 1);
  assert.equal(res.patch.appBackgroundDim, 80);
  assert.equal(env.storageData['appBackgroundDim'], 80);
  assert.equal(env.localStorageData['fast-bg-dim'], '80', 'Fast mirror updated via HomebaseStorage.setMany');
  assert.equal(env.storageData['clockType'], 'analog', 'Unchanged key preserved');
});

test('diagnostic-ui: handleAutoRepairStorage falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createPhase2cEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      schemaVersion: 1,
      appBackgroundDim: 150 // Out of bounds -> clamps to 80
    }
  });
  vm.runInContext(diagnosticUiScriptCode, env.context);

  const button = env.sandbox.document.createElement('button');
  const res = await env.sandbox.HomebaseDiagnosticUI.handleAutoRepairStorage(button);

  assert.equal(res.repaired, true);
  assert.equal(res.count, 1);
  assert.equal(env.storageData['appBackgroundDim'], 80);
});

test('diagnostic-ui: getStorageQuotaTelemetry uses HomebaseStorage.snapshot for size calculation', async () => {
  const env = createPhase2cEnvironment({
    initialStorage: {
      schemaVersion: 1,
      itemA: 'hello world',
      itemB: [1, 2, 3]
    }
  });
  vm.runInContext(diagnosticUiScriptCode, env.context);

  const quota = await env.sandbox.HomebaseDiagnosticUI.getStorageQuotaTelemetry();

  assert.ok(quota.bytesUsed > 0);
  assert.ok(typeof quota.percentage === 'number');
  assert.match(quota.formatted, /KB \/ 5\.0 MB/);
});

// -------------------------------------------------------------
// Wallpaper Subsystem (gallery-ui.js) Tests
// -------------------------------------------------------------

test('gallery-ui: storageLocalGet routes through HomebaseStorage.getMany with schema validation', async () => {
  const env = createPhase2cEnvironment({
    initialStorage: {
      wallpaperTypePreference: 'static',
      galleryFavorites: ['fav-1', 'fav-2']
    }
  });
  vm.runInContext(galleryUiScriptCode, env.context);

  const result = await env.sandbox.HomebaseGallery.storageLocalGet('wallpaperTypePreference');
  assert.equal(result.wallpaperTypePreference, 'static');

  const batchResult = await env.sandbox.HomebaseGallery.storageLocalGet(['wallpaperTypePreference', 'galleryFavorites']);
  assert.equal(batchResult.wallpaperTypePreference, 'static');
  assert.deepStrictEqual([...batchResult.galleryFavorites], ['fav-1', 'fav-2']);
});

test('gallery-ui: storageLocalSet routes through HomebaseStorage.setMany and updates storage', async () => {
  const env = createPhase2cEnvironment();
  vm.runInContext(galleryUiScriptCode, env.context);

  await env.sandbox.HomebaseGallery.storageLocalSet({
    wallpaperTypePreference: 'video',
    dailyWallpaperEnabled: true
  });

  assert.equal(env.storageData['wallpaperTypePreference'], 'video');
  assert.equal(env.storageData['dailyWallpaperEnabled'], true);
});

test('gallery-ui: storageLocalRemove routes through HomebaseStorage.remove', async () => {
  const env = createPhase2cEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: 'https://example.com/poster.jpg'
    }
  });
  vm.runInContext(galleryUiScriptCode, env.context);

  await env.sandbox.HomebaseGallery.storageLocalRemove('cachedAppliedPosterUrl');
  assert.equal(env.storageData['cachedAppliedPosterUrl'], undefined);
});

test('gallery-ui: storage fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createPhase2cEnvironment({ withHomebaseStorage: false });
  vm.runInContext(galleryUiScriptCode, env.context);

  await env.sandbox.HomebaseGallery.storageLocalSet({ wallpaperTypePreference: 'static' });
  assert.equal(env.storageData['wallpaperTypePreference'], 'static');

  const read = await env.sandbox.HomebaseGallery.storageLocalGet('wallpaperTypePreference');
  assert.equal(read.wallpaperTypePreference, 'static');

  await env.sandbox.HomebaseGallery.storageLocalRemove('wallpaperTypePreference');
  assert.equal(env.storageData['wallpaperTypePreference'], undefined);
});

// -------------------------------------------------------------
// Firefox Containers Integration Tests
// -------------------------------------------------------------

test('firefox-containers: appContainerMode toggle persists via HomebaseStorage.set', async () => {
  const env = createPhase2cEnvironment();
  vm.runInContext(firefoxContainersScriptCode, env.context);

  env.sandbox.setupContainerMode();
  const toggle = env.elementsById.get('app-container-mode-toggle');

  toggle.checked = true;
  await toggle.triggerEvent('change', { target: { checked: true } });
  assert.equal(env.storageData['appContainerMode'], true);

  toggle.checked = false;
  await toggle.triggerEvent('change', { target: { checked: false } });
  assert.equal(env.storageData['appContainerMode'], false);
});

test('firefox-containers: appContainerNewTab radio persists via HomebaseStorage.set', async () => {
  const env = createPhase2cEnvironment();
  vm.runInContext(firefoxContainersScriptCode, env.context);

  env.sandbox.setupContainerMode();

  env.radioClose.checked = true;
  await env.radioClose.triggerEvent('change', { target: { checked: true, value: 'close' } });
  assert.equal(env.storageData['appContainerNewTab'], false);

  env.radioKeep.checked = true;
  await env.radioKeep.triggerEvent('change', { target: { checked: true, value: 'keep' } });
  assert.equal(env.storageData['appContainerNewTab'], true);
});

test('firefox-containers: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createPhase2cEnvironment({ withHomebaseStorage: false });
  vm.runInContext(firefoxContainersScriptCode, env.context);

  env.sandbox.setupContainerMode();
  const toggle = env.elementsById.get('app-container-mode-toggle');

  toggle.checked = true;
  await toggle.triggerEvent('change', { target: { checked: true } });
  assert.equal(env.storageData['appContainerMode'], true);
});
