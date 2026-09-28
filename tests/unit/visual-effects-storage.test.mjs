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
const visualEffectsRuntimeScriptPath = path.join(rootDir, 'src/newtab/settings/visual-effects-runtime.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const visualEffectsRuntimeScriptCode = fs.readFileSync(visualEffectsRuntimeScriptPath, 'utf8');

function createVisualEffectsEnvironment(options = {}) {
  const {
    initialStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = {};
  const storageCalls = { get: [], set: [], remove: [] };

  const storageMock = {
    get: async (keys) => {
      if (failStorage) throw new Error('Storage simulated failure');
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
      if (failStorage) throw new Error('Storage simulated failure');
      storageCalls.set.push(items);
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      if (failStorage) throw new Error('Storage simulated failure');
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

  const elementsById = new Map();

  function createMockElement(tagName, initialId = '') {
    let _id = initialId;
    const el = {
      tagName: tagName.toUpperCase(),
      get id() { return _id; },
      set id(val) {
        if (_id) elementsById.delete(_id);
        _id = val || '';
        if (_id) elementsById.set(_id, el);
      },
      textContent: '',
      style: {
        setProperty: function (prop, val) { this[prop] = String(val); },
        zIndex: ''
      },
      classList: {
        classes: new Set(),
        add: function (c) { this.classes.add(c); },
        remove: function (c) { this.classes.delete(c); },
        contains: function (c) { return this.classes.has(c); },
        toggle: function (c, force) {
          if (force === undefined) force = !this.classes.has(c);
          if (force) this.classes.add(c); else this.classes.delete(c);
          return force;
        }
      },
      children: [],
      appendChild: function (child) {
        this.children.push(child);
        return child;
      },
      prepend: function (child) {
        this.children.unshift(child);
        return child;
      },
      checked: false,
      value: ''
    };
    if (_id) elementsById.set(_id, el);
    return el;
  }

  const documentElement = createMockElement('html');
  documentElement.style = {
    props: new Map(),
    setProperty: function (p, v) { this.props.set(p, String(v)); },
    getPropertyValue: function (p) { return this.props.get(p) || ''; }
  };

  const documentHead = createMockElement('head');
  const documentBody = createMockElement('body');

  const documentMock = {
    documentElement,
    head: documentHead,
    body: documentBody,
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => createMockElement(tag),
    querySelector: () => null
  };

  const sampleGlassStyles = [
    { id: 'original', name: 'Original', css: 'background: rgba(255,255,255,0.1);' },
    { id: 'frosted', name: 'Frosted', css: 'background: rgba(255,255,255,0.25); backdrop-filter: blur(16px);' },
    { id: 'tinted', name: 'Tinted', css: 'background: rgba(0,0,0,0.5);' }
  ];

  const sampleGridAnimations = {
    default: { name: 'Default', css: 'from { opacity: 0; } to { opacity: 1; }' },
    fade: { name: 'Fade', css: 'from { opacity: 0; } to { opacity: 1; }' },
    slide: { name: 'Slide', css: 'from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; }' },
    pop: { name: 'Pop', css: 'from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; }' }
  };

  const sandbox = {
    console,
    window: null,
    document: documentMock,
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
    },
    APP_GLASS_STYLE_KEY: 'appGlassStylePref',
    APP_GRID_ANIMATION_KEY: 'appGridAnimationPref',
    APP_GRID_ANIMATION_SPEED_KEY: 'appGridAnimationSpeed',
    APP_GRID_ANIMATION_ENABLED_KEY: 'appGridAnimationEnabled',
    GLASS_STYLES: sampleGlassStyles,
    GRID_ANIMATIONS: sampleGridAnimations,
    appGlassStylePreference: 'original',
    appGridAnimationPreference: 'default',
    appGridAnimationEnabledPreference: true,
    appGridAnimationSpeedPreference: 0.3,
    appBackgroundDimPreference: 0,
    isPerformanceModeEnabled: () => false,
    setSubSettingsExpanded: () => {}
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

  vm.runInContext(visualEffectsRuntimeScriptCode, context);

  return {
    sandbox,
    context,
    storageData,
    storageCalls,
    elementsById,
    documentElement,
    documentHead,
    documentBody
  };
}

// -------------------------------------------------------------
// Tests for loadGlassStylePref
// -------------------------------------------------------------

test('loadGlassStylePref: reads stored glass style via HomebaseStorage.get', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {
      appGlassStylePref: 'frosted'
    }
  });

  assert.equal(typeof env.sandbox.HomebaseStorage, 'object');
  await env.sandbox.loadGlassStylePref();

  assert.equal(env.sandbox.appGlassStylePreference, 'frosted');
  const styleEl = env.elementsById.get('dynamic-glass-style');
  assert.ok(styleEl, '#dynamic-glass-style should be injected into DOM');
  assert.match(styleEl.textContent, /backdrop-filter: blur\(16px\)/);
});

test('loadGlassStylePref: falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createVisualEffectsEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      appGlassStylePref: 'tinted'
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);
  await env.sandbox.loadGlassStylePref();

  assert.equal(env.sandbox.appGlassStylePreference, 'tinted');
  const styleEl = env.elementsById.get('dynamic-glass-style');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /rgba\(0,0,0,0\.5\)/);
});

test('loadGlassStylePref: uses "original" default when key is missing', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {}
  });

  await env.sandbox.loadGlassStylePref();

  assert.equal(env.sandbox.appGlassStylePreference, 'original');
  const styleEl = env.elementsById.get('dynamic-glass-style');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /rgba\(255,255,255,0\.1\)/);
});

test('loadGlassStylePref: sanitizes invalid style to "original" default via HomebaseStorage', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {
      appGlassStylePref: 'invalid-unknown-style'
    }
  });

  await env.sandbox.loadGlassStylePref();

  assert.equal(env.sandbox.appGlassStylePreference, 'original');
  const styleEl = env.elementsById.get('dynamic-glass-style');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /rgba\(255,255,255,0\.1\)/);
});

test('loadGlassStylePref: handles storage error gracefully and defaults to "original"', async () => {
  const env = createVisualEffectsEnvironment({
    withHomebaseStorage: false,
    failStorage: true
  });

  await env.sandbox.loadGlassStylePref();

  assert.equal(env.sandbox.appGlassStylePreference, 'original');
  const styleEl = env.elementsById.get('dynamic-glass-style');
  assert.ok(styleEl);
});

// -------------------------------------------------------------
// Tests for loadGridAnimationPref
// -------------------------------------------------------------

test('loadGridAnimationPref: reads stored animation via HomebaseStorage.get', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {
      appGridAnimationPref: 'slide'
    }
  });

  assert.equal(typeof env.sandbox.HomebaseStorage, 'object');
  await env.sandbox.loadGridAnimationPref();

  assert.equal(env.sandbox.appGridAnimationPreference, 'slide');
  const styleEl = env.elementsById.get('dynamic-grid-animation');
  assert.ok(styleEl, '#dynamic-grid-animation should be injected into DOM');
  assert.match(styleEl.textContent, /translateY\(12px\)/);
});

test('loadGridAnimationPref: falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createVisualEffectsEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      appGridAnimationPref: 'pop'
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);
  await env.sandbox.loadGridAnimationPref();

  assert.equal(env.sandbox.appGridAnimationPreference, 'pop');
  const styleEl = env.elementsById.get('dynamic-grid-animation');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /scale\(0\.95\)/);
});

test('loadGridAnimationPref: uses "default" default when key is missing', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {}
  });

  await env.sandbox.loadGridAnimationPref();

  assert.equal(env.sandbox.appGridAnimationPreference, 'default');
  const styleEl = env.elementsById.get('dynamic-grid-animation');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /from \{ opacity: 0; \} to \{ opacity: 1; \}/);
});

test('loadGridAnimationPref: sanitizes invalid animation to "default" default via HomebaseStorage', async () => {
  const env = createVisualEffectsEnvironment({
    initialStorage: {
      appGridAnimationPref: 'invalid-animation-key'
    }
  });

  await env.sandbox.loadGridAnimationPref();

  assert.equal(env.sandbox.appGridAnimationPreference, 'default');
  const styleEl = env.elementsById.get('dynamic-grid-animation');
  assert.ok(styleEl);
  assert.match(styleEl.textContent, /from \{ opacity: 0; \} to \{ opacity: 1; \}/);
});

test('loadGridAnimationPref: handles storage error gracefully and defaults to "default"', async () => {
  const env = createVisualEffectsEnvironment({
    withHomebaseStorage: false,
    failStorage: true
  });

  await env.sandbox.loadGridAnimationPref();

  assert.equal(env.sandbox.appGridAnimationPreference, 'default');
  const styleEl = env.elementsById.get('dynamic-grid-animation');
  assert.ok(styleEl);
});

// -------------------------------------------------------------
// Behavioral Regression Tests for Visual Effects Helpers
// -------------------------------------------------------------

test('applyBackgroundDim: parses opacity and prepends overlay to body', () => {
  const env = createVisualEffectsEnvironment();

  env.sandbox.applyBackgroundDim('45');

  assert.equal(env.sandbox.appBackgroundDimPreference, 45);
  assert.equal(env.documentElement.style.props.get('--bg-dim-opacity'), '0.45');
  const overlay = env.elementsById.get('background-dim-overlay');
  assert.ok(overlay);
  assert.equal(env.documentBody.children[0], overlay);
});

test('applyGridAnimationSpeed: clamps speed and sets CSS property', () => {
  const env = createVisualEffectsEnvironment();

  env.sandbox.applyGridAnimationSpeed('0.55');

  assert.equal(env.sandbox.appGridAnimationSpeedPreference, 0.55);
  assert.equal(env.documentElement.style.props.get('--grid-animation-duration'), '0.55s');
});

test('applyGridAnimationEnabled: toggles grid-animation-enabled class on body', () => {
  const env = createVisualEffectsEnvironment();

  env.sandbox.applyGridAnimationEnabled(true);
  assert.ok(env.documentBody.classList.contains('grid-animation-enabled'));

  env.sandbox.applyGridAnimationEnabled(false);
  assert.ok(!env.documentBody.classList.contains('grid-animation-enabled'));
});
