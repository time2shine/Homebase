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
const performanceControllerScriptPath = path.join(rootDir, 'src/newtab/settings/performance-controller.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const performanceControllerScriptCode = fs.readFileSync(performanceControllerScriptPath, 'utf8');

const toPlain = (v) => (v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined);

function createPerformanceControllerEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    withHomebaseStorage = true
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };

  const storageMock = {
    get: async (keys) => {
      if (keys === null || keys === undefined) return { ...storageData };
      if (typeof keys === 'string') return { [keys]: storageData[keys] };
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (storageData[k] !== undefined) res[k] = storageData[k];
        }
        return res;
      }
      return { ...storageData };
    },
    set: async (items) => {
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      const toRemove = Array.isArray(keys) ? keys : [keys];
      for (const k of toRemove) delete storageData[k];
    }
  };

  const localStorageMock = {
    getItem: (key) => (localStorageData[key] !== undefined ? localStorageData[key] : null),
    setItem: (key, val) => { localStorageData[key] = String(val); },
    removeItem: (key) => { delete localStorageData[key]; },
    clear: () => {
      for (const k of Object.keys(localStorageData)) delete localStorageData[k];
    }
  };

  // Mock DOM
  const classListSet = new Set();
  const docElementStyles = {};
  const elementsById = {};

  const documentMock = {
    body: {
      classList: {
        add: (cls) => classListSet.add(cls),
        remove: (cls) => classListSet.delete(cls),
        contains: (cls) => classListSet.has(cls),
        toggle: (cls, force) => {
          if (force === undefined) {
            if (classListSet.has(cls)) classListSet.delete(cls);
            else classListSet.add(cls);
          } else if (force) {
            classListSet.add(cls);
          } else {
            classListSet.delete(cls);
          }
          return classListSet.has(cls);
        }
      },
      prepend: (el) => {
        if (el && el.id) elementsById[el.id] = el;
      }
    },
    documentElement: {
      style: {
        setProperty: (prop, val) => { docElementStyles[prop] = String(val); },
        removeProperty: (prop) => { delete docElementStyles[prop]; },
        getPropertyValue: (prop) => docElementStyles[prop] || ''
      }
    },
    head: {
      appendChild: (el) => {
        if (el && el.id) elementsById[el.id] = el;
      }
    },
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        innerHTML: '',
        textContent: '',
        checked: false,
        value: '',
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false
        }
      };
      return el;
    },
    getElementById: (id) => elementsById[id] || null,
    querySelectorAll: (selector) => []
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
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

  vm.runInContext(performanceControllerScriptCode, context);

  return {
    context,
    sandbox,
    storageData,
    localStorageData,
    docElementStyles,
    classListSet,
    elementsById
  };
}

test('Performance Controller - exports check', () => {
  const env = createPerformanceControllerEnvironment();
  assert.ok(env.sandbox.window.HomebasePerformanceController, 'HomebasePerformanceController exists on window');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.initialize, 'function');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.applyPerformanceMode, 'function');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.applyVisualEffects, 'function');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.setGlassStyle, 'function');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.setGridAnimationSpeed, 'function');
  assert.equal(typeof env.sandbox.window.HomebasePerformanceController.isPerformanceModeEnabled, 'function');
  assert.equal(typeof env.sandbox.window.isPerformanceModeEnabled, 'function');
});

test('Performance Controller - fast mirror read and sync', () => {
  const env = createPerformanceControllerEnvironment({
    initialLocalStorage: { 'fast-performance-mode': '1' }
  });
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  assert.equal(ctrl.readFastPerformanceModePreference(), true);

  ctrl.syncFastPerformanceModeMirror(false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(ctrl.readFastPerformanceModePreference(), false);

  ctrl.syncFastPerformanceModeMirror(true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(ctrl.readFastPerformanceModePreference(), true);
});

test('Performance Controller - applyPerformanceMode enables performance mode and mutates DOM', () => {
  const env = createPerformanceControllerEnvironment();
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  let videoCleanedUp = false;
  const toggleEl = env.sandbox.document.createElement('input');
  toggleEl.id = 'app-performance-mode-toggle';
  env.elementsById['app-performance-mode-toggle'] = toggleEl;

  const result = ctrl.applyPerformanceMode(true, {
    onVideoCleanup: () => { videoCleanedUp = true; }
  });

  assert.equal(result.performanceMode, true);
  assert.equal(ctrl.isPerformanceModeEnabled(), true);
  assert.equal(env.classListSet.has('performance-mode'), true);
  assert.equal(toggleEl.checked, true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(videoCleanedUp, true);
  assert.equal(env.docElementStyles['--glass-blur'], '0px');
  assert.equal(env.docElementStyles['--glass-bg'], 'transparent');
});

test('Performance Controller - applyPerformanceMode disables performance mode and restores visual runtime', () => {
  const env = createPerformanceControllerEnvironment({
    initialLocalStorage: { 'fast-performance-mode': '1' }
  });
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  let cinemaReset = false;
  const toggleEl = env.sandbox.document.createElement('input');
  toggleEl.id = 'app-performance-mode-toggle';
  env.elementsById['app-performance-mode-toggle'] = toggleEl;

  ctrl.applyPerformanceMode(true);
  assert.equal(ctrl.isPerformanceModeEnabled(), true);

  const result = ctrl.applyPerformanceMode(false, {
    appGridAnimationSpeedPreference: 0.5,
    onCinemaModeReset: () => { cinemaReset = true; }
  });

  assert.equal(result.performanceMode, false);
  assert.equal(ctrl.isPerformanceModeEnabled(), false);
  assert.equal(env.classListSet.has('performance-mode'), false);
  assert.equal(toggleEl.checked, false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(cinemaReset, true);
  assert.equal(env.docElementStyles['--grid-animation-duration'], '0.5s');
});

test('Performance Controller - setGlassStyle suppresses in performance mode and applies when off', () => {
  const env = createPerformanceControllerEnvironment();
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  let appliedStyle = null;
  env.sandbox.applyGlassStyle = (style) => { appliedStyle = style; };

  // When performance mode is active
  ctrl.applyPerformanceMode(true);
  ctrl.setGlassStyle('frosted');
  assert.equal(appliedStyle, null, 'Glass style injection suppressed during performance mode');

  // When performance mode is disabled
  ctrl.applyPerformanceMode(false);
  ctrl.setGlassStyle('frosted');
  assert.equal(appliedStyle, 'frosted', 'Glass style applied when performance mode is off');
});

test('Performance Controller - setGridAnimationSpeed sets CSS variables and updates UI slider', () => {
  const env = createPerformanceControllerEnvironment();
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  const labelEl = env.sandbox.document.createElement('span');
  labelEl.id = 'app-grid-animation-speed-value';
  env.elementsById['app-grid-animation-speed-value'] = labelEl;

  const sliderEl = env.sandbox.document.createElement('input');
  sliderEl.id = 'app-grid-animation-speed-slider';
  env.elementsById['app-grid-animation-speed-slider'] = sliderEl;

  ctrl.setGridAnimationSpeed(0.45);

  assert.equal(env.docElementStyles['--grid-animation-duration'], '0.45s');
  assert.equal(env.docElementStyles['--grid-animation-speed'], '0.45s');
  assert.equal(labelEl.textContent, '0.45s');
  assert.equal(sliderEl.value, 0.45);
});

test('Performance Controller - setBackgroundDim clamps values and injects overlay element', () => {
  const env = createPerformanceControllerEnvironment();
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  ctrl.setBackgroundDim(40);
  assert.equal(env.docElementStyles['--bg-dim-opacity'], '0.4');
  assert.ok(env.elementsById['background-dim-overlay'], 'Overlay element injected');

  // Clamp over 90
  ctrl.setBackgroundDim(120);
  assert.equal(env.docElementStyles['--bg-dim-opacity'], '0.9');

  // Clamp under 0
  ctrl.setBackgroundDim(-15);
  assert.equal(env.docElementStyles['--bg-dim-opacity'], '0');
});

test('Performance Controller - applyVisualEffects applies preferences when performance mode is off', () => {
  const env = createPerformanceControllerEnvironment();
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  let animApplied = null;
  env.sandbox.applyGridAnimation = (anim) => { animApplied = anim; };

  ctrl.applyVisualEffects({
    glassStyle: 'smoke',
    gridAnimation: 'slide-up',
    gridAnimationSpeed: 0.6,
    gridAnimationEnabled: true,
    backgroundDim: 25
  });

  assert.equal(env.docElementStyles['--bg-dim-opacity'], '0.25');
  assert.equal(env.docElementStyles['--grid-animation-duration'], '0.6s');
  assert.equal(animApplied, 'slide-up');
  assert.equal(env.classListSet.has('grid-animation-enabled'), true);
});

test('Performance Controller - initialize loads from storage and synchronizes fast mirror', async () => {
  const env = createPerformanceControllerEnvironment({
    initialStorage: { appPerformanceMode: true },
    initialLocalStorage: { 'fast-performance-mode': '0' }
  });
  const ctrl = env.sandbox.window.HomebasePerformanceController;

  const result = await ctrl.initialize();

  assert.equal(result.performanceMode, true);
  assert.equal(ctrl.isPerformanceModeEnabled(), true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.classListSet.has('performance-mode'), true);
});
