import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/utils.js'), 'utf8');
const validatorScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/schema-validator.js'), 'utf8');
const migrationsScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/schema-migrations.js'), 'utf8');
const diagnosticsScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/storage-diagnostics.js'), 'utf8');
const storageServiceScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/storage-service.js'), 'utf8');
const performanceControllerScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/performance-controller.js'), 'utf8');
const settingsStorageScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-storage.js'), 'utf8');
const settingsPreferencesScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-preferences.js'), 'utf8');
const formControllerScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-form-controller.js'), 'utf8');
const panelControllerScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-panel-controller.js'), 'utf8');
const dialogsScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/dialogs.js'), 'utf8');

// =============================================================================
// Helper: Video restoration environment
// =============================================================================
function createVideoRestorationEnvironment(options = {}) {
  const {
    initialWallpaperType = 'video',
    initialSelection = { id: 'wp-clouds', videoUrl: 'clouds.mp4', posterUrl: 'clouds.jpg' }
  } = options;

  let activeListeners = 0;
  let activeTimers = 0;
  let videoPaused = false;
  let videoCleanedUp = false;
  let sourcesCleared = false;
  const appliedWallpapers = [];

  const bodyClasses = new Set();
  const doc = {
    body: {
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (bodyClasses.has(c)) bodyClasses.delete(c);
            else bodyClasses.add(c);
          } else if (force) {
            bodyClasses.add(c);
          } else {
            bodyClasses.delete(c);
          }
          return bodyClasses.has(c);
        }
      }
    },
    getElementById: () => null,
    querySelectorAll: () => []
  };

  const sandbox = {
    window: null,
    document: doc,
    localStorage: {
      data: {},
      getItem(k) { return this.data[k] !== undefined ? this.data[k] : null; },
      setItem(k, v) { this.data[k] = String(v); },
      removeItem(k) { delete this.data[k]; }
    },
    wallpaperTypePreference: initialWallpaperType,
    currentWallpaperSelection: initialSelection,
    applyWallpaperByType: (selection, type) => {
      appliedWallpapers.push({ selection, type });
      // Simulate listener and timer attachment
      activeListeners += 2;
      activeTimers += 1;
      videoPaused = false;
      sourcesCleared = false;
    },
    cleanupBackgroundPlayback: () => {
      videoCleanedUp = true;
      videoPaused = true;
      activeListeners = 0;
      activeTimers = 0;
    },
    clearBackgroundVideos: () => {
      sourcesCleared = true;
    },
    console,
    setTimeout: (fn, delay) => { activeTimers++; return 100; },
    clearTimeout: (id) => { if (activeTimers > 0) activeTimers--; }
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(performanceControllerScriptCode, context);

  return {
    context,
    sandbox,
    appliedWallpapers,
    bodyClasses,
    getActiveListeners: () => activeListeners,
    getActiveTimers: () => activeTimers,
    isVideoPaused: () => videoPaused,
    isSourcesCleared: () => sourcesCleared
  };
}

// =============================================================================
// Helper: Settings Modal Persistence Environment
// =============================================================================
class MockDOMElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.value = '';
    this.checked = false;
    this.style = {};
    this.dataset = {};
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this._classes.has(c)) { this._classes.delete(c); return false; }
          this._classes.add(c); return true;
        }
        if (force) { this._classes.add(c); return true; }
        this._classes.delete(c); return false;
      }
    };
    this.listeners = new Map();
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }

  async dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : (evt ? evt.type : '');
    const list = this.listeners.get(type) || [];
    for (const fn of list) {
      await fn(evt);
    }
  }

  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k] !== undefined ? this[k] : null; }
  removeAttribute(k) { delete this[k]; }
  closest(selector) {
    if (typeof selector === 'string') {
      const parts = selector.split(',').map(s => s.trim().replace(/^#/, ''));
      if (parts.includes(this.id)) return this;
    }
    return null;
  }
  querySelector(sel) {
    if (this.options && Array.isArray(this.options)) {
      if (sel === 'option[value="video"]') return this.options.find(o => o.value === 'video') || null;
      if (sel === 'option[value="static"]') return this.options.find(o => o.value === 'static') || null;
    }
    return null;
  }
  querySelectorAll() { return []; }
}

function createSettingsModalEnvironment(options = {}) {
  const {
    initialPerformanceMode = false,
    initialWallpaperType = 'video',
    useRealPanelController = true,
    hasClosingAnimation = false
  } = options;

  const storageData = {
    appPerformanceMode: initialPerformanceMode,
    appWallpaperType: initialWallpaperType,
    wallpaperType: initialWallpaperType
  };
  const localStorageData = {
    'fast-performance-mode': initialPerformanceMode ? '1' : '0',
    'fast-perf-mode': initialPerformanceMode ? '1' : '0'
  };

  const elements = new Map();
  function getOrCreateElement(id, tag = 'div') {
    if (!elements.has(id)) {
      const el = new MockDOMElement(tag);
      el.id = id;
      elements.set(id, el);
    }
    return elements.get(id);
  }

  // Pre-register canonical settings elements
  const perfToggle = getOrCreateElement('app-performance-mode-toggle', 'input');
  perfToggle.checked = initialPerformanceMode;

  getOrCreateElement('app-time-format', 'select').value = '12-hour';
  getOrCreateElement('app-show-sidebar-toggle', 'input').checked = true;
  getOrCreateElement('app-background-dim-slider', 'input').value = '0';
  getOrCreateElement('app-show-weather-toggle', 'input').checked = true;
  getOrCreateElement('app-show-quote-toggle', 'input').checked = true;
  getOrCreateElement('app-show-news-toggle', 'input').checked = false;
  getOrCreateElement('app-show-todo-toggle', 'input').checked = true;
  getOrCreateElement('app-show-homebase-tips-toggle', 'input').checked = true;
  getOrCreateElement('app-daily-rotation-toggle', 'input').checked = true;

  const wpTypeSelect = getOrCreateElement('app-wallpaper-type-select', 'select');
  wpTypeSelect.value = initialWallpaperType;
  const videoOpt = { value: 'video', disabled: false };
  const staticOpt = { value: 'static', disabled: false };
  wpTypeSelect.options = [videoOpt, staticOpt];

  getOrCreateElement('app-wallpaper-quality-select', 'select').value = 'high';

  const galleryToggle = getOrCreateElement('gallery-wallpaper-type-toggle', 'input');
  galleryToggle.checked = initialWallpaperType === 'video';

  const settingsNotice = getOrCreateElement('app-wallpaper-type-perf-notice', 'div');
  settingsNotice.classList.add('hidden');
  const settingsBtn = getOrCreateElement('app-wallpaper-turn-off-perf-btn', 'button');

  const galleryNotice = getOrCreateElement('gallery-wallpaper-type-perf-notice', 'div');
  galleryNotice.classList.add('hidden');
  const galleryBtn = getOrCreateElement('gallery-wallpaper-turn-off-perf-btn', 'button');

  const docClickListeners = [];
  settingsBtn.click = async () => {
    await settingsBtn.dispatchEvent({ type: 'click', target: settingsBtn, preventDefault: () => {} });
    for (const fn of docClickListeners) {
      await fn({ target: settingsBtn, preventDefault: () => {} });
    }
  };
  galleryBtn.click = async () => {
    await galleryBtn.dispatchEvent({ type: 'click', target: galleryBtn, preventDefault: () => {} });
    for (const fn of docClickListeners) {
      await fn({ target: galleryBtn, preventDefault: () => {} });
    }
  };

  const modalEl = getOrCreateElement('app-settings-modal', 'div');
  modalEl.classList.add('modal-overlay');
  modalEl.classList.add('hidden');
  const dialogEl = new MockDOMElement('div');
  dialogEl.classList.add('app-settings-dialog');
  modalEl.querySelector = (sel) => {
    if (sel === '.app-settings-dialog') return dialogEl;
    if (sel === 'input[type="text"]') return null;
    return null;
  };

  const galleryModalEl = getOrCreateElement('gallery-modal', 'div');
  galleryModalEl.classList.add('modal-overlay');
  galleryModalEl.classList.add('hidden');
  const galleryDialogEl = new MockDOMElement('div');
  galleryDialogEl.classList.add('gallery-dialog');
  galleryModalEl.querySelector = (sel) => {
    if (sel === '.gallery-dialog') return galleryDialogEl;
    return null;
  };

  const closeBtn = getOrCreateElement('app-settings-close', 'button');
  const cancelBtn = getOrCreateElement('app-settings-cancel', 'button');
  getOrCreateElement('app-settings-nav', 'nav');

  const bodyClasses = new Set();
  if (initialPerformanceMode) bodyClasses.add('performance-mode');

  const doc = {
    body: {
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (bodyClasses.has(c)) bodyClasses.delete(c);
            else bodyClasses.add(c);
          } else if (force) {
            bodyClasses.add(c);
          } else {
            bodyClasses.delete(c);
          }
          return bodyClasses.has(c);
        }
      }
    },
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel === '.app-settings-dialog') return dialogEl;
      if (sel === '.gallery-dialog') return galleryDialogEl;
      return null;
    },
    querySelectorAll: (sel) => {
      const allModals = [modalEl, galleryModalEl];
      if (sel && (sel.includes('.modal-overlay.closing') || sel.includes('.popover-overlay.closing'))) {
        return allModals.filter(m => m.classList.contains('closing'));
      }
      if (sel && sel.includes(':not(.closing)')) {
        return allModals.filter(m => !m.classList.contains('hidden') && !m.classList.contains('closing'));
      }
      if (sel && sel.includes('.modal-overlay:not(.hidden)')) {
        return allModals.filter(m => !m.classList.contains('hidden'));
      }
      return [];
    },
    addEventListener: (evt, fn) => {
      if (evt === 'click') docClickListeners.push(fn);
    },
    removeEventListener: () => {}
  };

  let storageHook = null;
  const storageMock = {
    get: async (key) => ({ [key]: storageData[key] }),
    getMany: async (keys) => {
      const out = {};
      for (const k of keys) {
        if (storageData[k] !== undefined) out[k] = storageData[k];
      }
      return out;
    },
    set: async (key, val) => {
      if (typeof storageHook === 'function') {
        await storageHook(key, val);
      }
      if (typeof key === 'object') {
        Object.assign(storageData, key);
      } else {
        storageData[key] = val;
      }
    },
    setMany: async (items) => {
      if (typeof storageHook === 'function') {
        await storageHook(items);
      }
      Object.assign(storageData, items);
    },
    remove: async (key) => {
      delete storageData[key];
    }
  };

  let modalClosed = false;
  let lastCloseOptions = null;

  const sandbox = {
    window: null,
    document: doc,
    localStorage: {
      getItem: (k) => localStorageData[k] !== undefined ? localStorageData[k] : null,
      setItem: (k, v) => { localStorageData[k] = String(v); },
      removeItem: (k) => { delete localStorageData[k]; }
    },
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
    wallpaperTypePreference: initialWallpaperType,
    currentWallpaperSelection: { id: 'wp-1', videoUrl: 'video.mp4', posterUrl: 'poster.jpg' },
    applyWallpaperByType: (sel, type) => {
      appliedWallpapers.push({ selection: sel, type });
    },
    cleanupBackgroundPlayback: () => {},
    clearBackgroundVideos: () => {},
    console,
    setTimeout,
    clearTimeout,
    ...(hasClosingAnimation ? {
      getComputedStyle: () => ({
        animationName: 'pickerOut',
        animationDuration: '0.2s',
        animationDelay: '0s'
      })
    } : {}),
    Event: class Event {
      constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = !!opts.bubbles;
      }
    }
  };
  const alertMessages = [];
  const appliedWallpapers = [];
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  // Load stack
  vm.runInContext(dialogsScriptCode, context);
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);
  vm.runInContext(performanceControllerScriptCode, context);
  vm.runInContext(settingsStorageScriptCode, context);
  vm.runInContext(settingsPreferencesScriptCode, context);
  vm.runInContext(formControllerScriptCode, context);

  sandbox.showCustomAlert = (msg) => { alertMessages.push(msg); };
  sandbox.HomebaseDialogController = {
    showAlertDialog: (msg) => { alertMessages.push(msg); }
  };

  if (useRealPanelController) {
    vm.runInContext(panelControllerScriptCode, context);
    const origClose = sandbox.HomebaseSettingsPanelController.closeAppSettingsModal;
    sandbox.HomebaseSettingsPanelController.closeAppSettingsModal = function(opts) {
      modalClosed = true;
      lastCloseOptions = opts;
      return origClose.call(this, opts);
    };
    sandbox.HomebaseSettingsPanelController.setupModalLifecycle();
  } else {
    sandbox.HomebaseSettingsPanelController = {
      closeAppSettingsModal: (opts) => {
        modalClosed = true;
        lastCloseOptions = opts;
        return Promise.resolve({ success: true });
      }
    };
  }

  if (sandbox.HomebaseSettingsStorage) {
    if (typeof sandbox.HomebaseSettingsStorage.initialize === 'function') {
      sandbox.HomebaseSettingsStorage.initialize();
    }
    if (sandbox.HomebaseSettingsStorage.state) {
      sandbox.HomebaseSettingsStorage.state.performanceMode = initialPerformanceMode;
    }
  }
  if (sandbox.settingsState) {
    sandbox.settingsState.performanceMode = initialPerformanceMode;
  }
  if (sandbox.HomebasePerformanceController && typeof sandbox.HomebasePerformanceController.applyPerformanceMode === 'function') {
    sandbox.HomebasePerformanceController.applyPerformanceMode(initialPerformanceMode);
  }
  if (typeof sandbox.syncAppSettingsForm === 'function') {
    sandbox.syncAppSettingsForm();
  }
  if (sandbox.HomebaseSettingsFormController && typeof sandbox.HomebaseSettingsFormController.setupFormListeners === 'function') {
    sandbox.HomebaseSettingsFormController.setupFormListeners();
  }

  return {
    context,
    sandbox,
    storageData,
    localStorageData,
    elements,
    perfToggle,
    bodyClasses,
    modalEl,
    dialogEl,
    galleryModalEl,
    galleryDialogEl,
    closeBtn,
    cancelBtn,
    wpTypeSelect,
    videoOpt,
    staticOpt,
    galleryToggle,
    settingsNotice,
    settingsBtn,
    galleryNotice,
    galleryBtn,
    appliedWallpapers,
    getAlertMessages: () => alertMessages,
    setStorageHook: (fn) => { storageHook = fn; },
    isModalClosed: () => modalEl.classList.contains('hidden') || modalClosed,
    getLastCloseOptions: () => lastCloseOptions
  };
}

// =============================================================================
// TEST SUITE 1: Video Restoration Lifecycle
// =============================================================================

test('video restoration: toggle OFF -> ON -> OFF restores video wallpaper when saved type is video', () => {
  const env = createVideoRestorationEnvironment({ initialWallpaperType: 'video' });
  const ctrl = env.sandbox.HomebasePerformanceController;

  // 1. Initial state: Performance Mode OFF, start video wallpaper
  env.sandbox.applyWallpaperByType(env.sandbox.currentWallpaperSelection, 'video');
  assert.equal(env.appliedWallpapers.length, 1);
  assert.equal(env.appliedWallpapers[0].type, 'video');

  // 2. Toggle Performance Mode ON
  ctrl.applyPerformanceMode(true);
  assert.equal(ctrl.isPerformanceModeEnabled(), true);
  assert.equal(env.bodyClasses.has('performance-mode'), true);
  assert.equal(env.isVideoPaused(), true, 'ON must stop background playback');
  assert.equal(env.getActiveListeners(), 0, 'ON must abort video listeners');
  assert.equal(env.getActiveTimers(), 0, 'ON must clear video timers');

  // 3. Toggle Performance Mode OFF
  ctrl.applyPerformanceMode(false);
  assert.equal(ctrl.isPerformanceModeEnabled(), false);
  assert.equal(env.bodyClasses.has('performance-mode'), false);
  assert.equal(env.appliedWallpapers.length, 2, 'OFF must restore video wallpaper');
  assert.equal(env.appliedWallpapers[1].type, 'video');
  assert.equal(env.appliedWallpapers[1].selection.id, 'wp-clouds');
});

test('video restoration: static wallpaper remains static when performance mode is toggled OFF', () => {
  const env = createVideoRestorationEnvironment({ initialWallpaperType: 'static' });
  const ctrl = env.sandbox.HomebasePerformanceController;

  // Toggle ON
  ctrl.applyPerformanceMode(true);
  assert.equal(ctrl.isPerformanceModeEnabled(), true);

  // Toggle OFF
  ctrl.applyPerformanceMode(false);
  assert.equal(ctrl.isPerformanceModeEnabled(), false);
  assert.equal(env.appliedWallpapers.length, 0, 'Static wallpaper must remain static; video must not be triggered');
});

test('video restoration: repeated toggling does not accumulate duplicate listeners or timers', () => {
  const env = createVideoRestorationEnvironment({ initialWallpaperType: 'video' });
  const ctrl = env.sandbox.HomebasePerformanceController;

  for (let i = 0; i < 5; i++) {
    ctrl.applyPerformanceMode(true);
    assert.equal(env.getActiveListeners(), 0, `Iteration ${i}: Listeners must be 0 when ON`);
    assert.equal(env.getActiveTimers(), 0, `Iteration ${i}: Timers must be 0 when ON`);

    ctrl.applyPerformanceMode(false);
    assert.equal(env.getActiveListeners(), 2, `Iteration ${i}: Fresh listeners should be exactly 2`);
    assert.equal(env.getActiveTimers(), 1, `Iteration ${i}: Fresh timer should be exactly 1`);
  }
});

// =============================================================================
// TEST SUITE 2: Cancel / Close Persistence Lifecycle
// =============================================================================

test('persistence: initially OFF -> toggle to ON -> Cancel restores OFF in UI, runtime, storage, and fast mirror', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  // 1. Snapshot initial state on modal open
  formController.snapshotInitialSettingsState();
  assert.equal(perfController.isPerformanceModeEnabled(), false);
  assert.equal(env.storageData.appPerformanceMode, false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');

  // 2. User toggles Performance Mode ON in settings form
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Verify live preview applied
  assert.equal(perfController.isPerformanceModeEnabled(), true);
  assert.equal(env.bodyClasses.has('performance-mode'), true);

  // 3. User clicks Cancel
  const discardResult = await formController.discardSettingsChanges();
  assert.equal(discardResult.success, true);
  assert.equal(discardResult.restored, true);

  // 4. Verify original state restored everywhere
  assert.equal(env.perfToggle.checked, false, 'UI toggle must be unchecked');
  assert.equal(perfController.isPerformanceModeEnabled(), false, 'Runtime must be OFF');
  assert.equal(env.bodyClasses.has('performance-mode'), false, 'Body class must be removed');
  assert.equal(env.storageData.appPerformanceMode, false, 'Persistent storage must be false');
  assert.equal(env.localStorageData['fast-performance-mode'], '0', 'fast-performance-mode must be 0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0', 'fast-perf-mode must be 0');
});

test('persistence: initially OFF -> toggle to ON -> Close (X) restores OFF in UI, runtime, storage, and fast mirror', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;
  const panelController = env.sandbox.HomebaseSettingsPanelController;

  formController.snapshotInitialSettingsState();

  // Toggle to ON
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Close without saving (Close X)
  const closeResult = await panelController.closeAppSettingsModal({ discard: true });
  assert.equal(closeResult.success, true);

  // Verify restored
  assert.equal(env.isModalClosed(), true);
  assert.equal(env.perfToggle.checked, false);
  assert.equal(perfController.isPerformanceModeEnabled(), false);
  assert.equal(env.storageData.appPerformanceMode, false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

test('persistence: initially ON -> toggle to OFF -> Cancel restores ON in UI, runtime, storage, and fast mirror', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: true });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();
  assert.equal(perfController.isPerformanceModeEnabled(), true);
  assert.equal(env.storageData.appPerformanceMode, true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');

  // Toggle to OFF
  env.perfToggle.checked = false;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Verify live preview applied
  assert.equal(perfController.isPerformanceModeEnabled(), false);

  // User cancels
  const discardResult = await formController.discardSettingsChanges();
  assert.equal(discardResult.success, true);
  assert.equal(discardResult.restored, true);

  // Verify restored to ON
  assert.equal(env.perfToggle.checked, true, 'UI toggle must be checked');
  assert.equal(perfController.isPerformanceModeEnabled(), true, 'Runtime must be ON');
  assert.equal(env.bodyClasses.has('performance-mode'), true, 'Body class must be present');
  assert.equal(env.storageData.appPerformanceMode, true, 'Persistent storage must be true');
  assert.equal(env.localStorageData['fast-performance-mode'], '1', 'fast-performance-mode must be 1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1', 'fast-perf-mode must be 1');
});

test('persistence: initially ON -> toggle to OFF -> Close (X) restores ON in UI, runtime, storage, and fast mirror', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: true });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;
  const panelController = env.sandbox.HomebaseSettingsPanelController;

  formController.snapshotInitialSettingsState();

  // Toggle to OFF
  env.perfToggle.checked = false;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Close modal with Close button
  const closeResult = await panelController.closeAppSettingsModal({ discard: true });
  assert.equal(closeResult.success, true);

  // Verify restored
  assert.equal(env.isModalClosed(), true);
  assert.equal(env.perfToggle.checked, true);
  assert.equal(perfController.isPerformanceModeEnabled(), true);
  assert.equal(env.storageData.appPerformanceMode, true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1');
});

test('persistence: Save retains the newly selected state (OFF -> ON -> Save)', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();

  // Toggle to ON
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Click Save
  await formController.handleSaveSettings();

  // Verify newly selected state retained
  assert.equal(env.isModalClosed(), true);
  assert.equal(env.getLastCloseOptions().saved, true);
  assert.equal(perfController.isPerformanceModeEnabled(), true);
  assert.equal(env.storageData.appPerformanceMode, true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1');
});

test('persistence: Save retains the newly selected state (ON -> OFF -> Save)', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: true });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();

  // Toggle to OFF
  env.perfToggle.checked = false;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // Click Save
  await formController.handleSaveSettings();

  // Verify newly selected state retained
  assert.equal(env.isModalClosed(), true);
  assert.equal(env.getLastCloseOptions().saved, true);
  assert.equal(perfController.isPerformanceModeEnabled(), false);
  assert.equal(env.storageData.appPerformanceMode, false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

test('persistence: reload / new tab retains original state after Cancel (initially OFF)', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;

  formController.snapshotInitialSettingsState();
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });
  await formController.discardSettingsChanges();

  // Simulate opening new tab / reloading: initializeSettingsStorage & loadAppSettingsFromStorage
  await env.sandbox.loadAppSettingsFromStorage();
  const initResult = await env.sandbox.HomebasePerformanceController.initialize();

  assert.equal(initResult.performanceMode, false, 'New tab must initialize Performance Mode as OFF');
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
});

test('persistence: reload / new tab retains original state after Close (initially ON)', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: true });
  const formController = env.sandbox.HomebaseSettingsFormController;

  formController.snapshotInitialSettingsState();
  env.perfToggle.checked = false;
  await env.perfToggle.dispatchEvent({ type: 'change' });
  await formController.discardSettingsChanges();

  // Simulate opening new tab / reloading
  await env.sandbox.loadAppSettingsFromStorage();
  const initResult = await env.sandbox.HomebasePerformanceController.initialize();

  assert.equal(initResult.performanceMode, true, 'New tab must initialize Performance Mode as ON');
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
});

test('persistence: delayed storage write on toggle -> Cancel does NOT overwrite restored state', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();
  assert.equal(env.storageData.appPerformanceMode, false);

  // Setup delay for toggle write
  let resolveToggleWrite;
  const toggleWritePromise = new Promise((resolve) => {
    resolveToggleWrite = resolve;
  });

  let toggleWriteStarted = false;
  env.setStorageHook(async (key, val) => {
    const isPerfTrue = (key === 'appPerformanceMode' && val === true) || (typeof key === 'object' && key.appPerformanceMode === true);
    if (isPerfTrue && !toggleWriteStarted) {
      toggleWriteStarted = true;
      await toggleWritePromise;
    }
  });

  // User toggles ON (this initiates delayed write)
  env.perfToggle.checked = true;
  const toggleDispatchPromise = env.perfToggle.dispatchEvent({ type: 'change' });

  // Live preview applied
  assert.equal(perfController.isPerformanceModeEnabled(), true);

  // While toggle write is in-flight, resolve delayed write after small timer
  setTimeout(() => {
    resolveToggleWrite();
  }, 10);

  // User cancels
  const discardResult = await formController.discardSettingsChanges();
  await toggleDispatchPromise;

  assert.equal(discardResult.success, true);
  assert.equal(discardResult.restored, true);
  assert.equal(env.perfToggle.checked, false, 'UI toggle must be unchecked');
  assert.equal(perfController.isPerformanceModeEnabled(), false, 'Runtime must be restored to OFF');
  assert.equal(env.storageData.appPerformanceMode, false, 'Storage must remain FALSE and not be overwritten by toggle write');
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

test('persistence: delayed storage write on toggle -> Close (X) does NOT overwrite restored state', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: true });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;
  const panelController = env.sandbox.HomebaseSettingsPanelController;

  formController.snapshotInitialSettingsState();
  assert.equal(env.storageData.appPerformanceMode, true);

  // Setup delay for toggle write (turning OFF)
  let resolveToggleWrite;
  const toggleWritePromise = new Promise((resolve) => {
    resolveToggleWrite = resolve;
  });

  let toggleWriteStarted = false;
  env.setStorageHook(async (key, val) => {
    const isPerfFalse = (key === 'appPerformanceMode' && val === false) || (typeof key === 'object' && key.appPerformanceMode === false);
    if (isPerfFalse && !toggleWriteStarted) {
      toggleWriteStarted = true;
      await toggleWritePromise;
    }
  });

  // User toggles OFF
  env.perfToggle.checked = false;
  const toggleDispatchPromise = env.perfToggle.dispatchEvent({ type: 'change' });

  assert.equal(perfController.isPerformanceModeEnabled(), false);

  // While toggle write is pending, resolve delayed write after timer
  setTimeout(() => {
    resolveToggleWrite();
  }, 10);

  // Close modal with discard
  const closeResult = await panelController.closeAppSettingsModal({ discard: true });
  await toggleDispatchPromise;

  assert.equal(closeResult.success, true);
  assert.equal(env.isModalClosed(), true);
  assert.equal(env.perfToggle.checked, true, 'UI toggle must be restored to checked');
  assert.equal(perfController.isPerformanceModeEnabled(), true, 'Runtime must be restored to ON');
  assert.equal(env.storageData.appPerformanceMode, true, 'Storage must remain TRUE and not be overwritten by toggle write');
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1');
});

test('persistence: rejected storage write on toggle -> Cancel proceeds cleanly and restores original state', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();

  // Storage fails when toggling ON
  let toggleAttempted = false;
  env.setStorageHook(async (key, val) => {
    const isPerfTrue = (key === 'appPerformanceMode' && val === true) || (typeof key === 'object' && key.appPerformanceMode === true);
    if (isPerfTrue && !toggleAttempted) {
      toggleAttempted = true;
      throw new Error('IO_FAILURE_ON_TOGGLE');
    }
  });

  // User toggles ON (fails in background storage write)
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });

  // User clicks Cancel
  const discardResult = await formController.discardSettingsChanges();

  // Verify discard caught rejected in-flight promise and succeeded in restoring
  assert.equal(discardResult.success, true);
  assert.equal(discardResult.restored, true);
  assert.equal(env.perfToggle.checked, false);
  assert.equal(perfController.isPerformanceModeEnabled(), false);
  assert.equal(env.storageData.appPerformanceMode, false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

test('persistence: rejected storage write on Cancel/Close restoration returns failure, does NOT claim success, and displays user alert', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const panelController = env.sandbox.HomebaseSettingsPanelController;

  formController.snapshotInitialSettingsState();

  // User toggles ON
  env.perfToggle.checked = true;
  await env.perfToggle.dispatchEvent({ type: 'change' });
  assert.equal(env.storageData.appPerformanceMode, true);

  // Now make storage restoration fail on discard
  env.setStorageHook(async (key, val) => {
    const isPerfRestore = (key === 'appPerformanceMode' && val === false) || (typeof key === 'object' && key.appPerformanceMode === false);
    if (isPerfRestore) {
      throw new Error('IO_FAILURE_ON_RESTORE');
    }
  });

  // Discard directly
  const discardResult = await formController.discardSettingsChanges();
  assert.equal(discardResult.success, false, 'Discard must report success: false on storage write error');
  assert.equal(discardResult.restored, false, 'Discard must report restored: false on storage write error');
  assert.ok(discardResult.error, 'Discard must return the error');
  assert.ok(env.getAlertMessages().length > 0, 'User-visible error alert must be displayed');
  assert.match(env.getAlertMessages()[0], /Unable to revert Performance Mode setting/);

  // Also test through closeAppSettingsModal
  const closeResult = await panelController.closeAppSettingsModal({ discard: true });
  assert.equal(closeResult.success, false, 'closeAppSettingsModal must report failure when discard persistence fails');
  assert.equal(closeResult.restored, false);
  assert.ok(closeResult.error);
  assert.equal(env.isModalClosed(), true, 'Modal UI must still close visually');
});

test('persistence: multiple rapid toggles with earlier write delayed longer than latest write -> Cancel restores original and prevents overwrite', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });
  const formController = env.sandbox.HomebaseSettingsFormController;
  const perfController = env.sandbox.HomebasePerformanceController;

  formController.snapshotInitialSettingsState();
  assert.equal(env.storageData.appPerformanceMode, false);

  // Setup delays:
  // Write 1 (toggle ON: true): delayed by 40ms
  // Write 2 (toggle OFF: false): delayed by 10ms
  // Write 3 (toggle ON: true): delayed by 10ms
  let writeCount = 0;
  env.setStorageHook(async (key, val) => {
    writeCount++;
    const currentWrite = writeCount;
    if (currentWrite === 1) {
      // Earlier write delayed longer (40ms)
      await new Promise(r => setTimeout(r, 40));
    } else {
      // Later writes delay shorter (10ms)
      await new Promise(r => setTimeout(r, 10));
    }
  });

  // Rapid toggles
  // 1. Toggle ON (starts write 1, delayed by 40ms)
  env.perfToggle.checked = true;
  const p1 = env.perfToggle.dispatchEvent({ type: 'change' });

  // 2. Toggle OFF immediately (starts write 2, delayed by 10ms)
  env.perfToggle.checked = false;
  const p2 = env.perfToggle.dispatchEvent({ type: 'change' });

  // 3. Toggle ON immediately (starts write 3, delayed by 10ms)
  env.perfToggle.checked = true;
  const p3 = env.perfToggle.dispatchEvent({ type: 'change' });

  // 4. User clicks Cancel while writes are queued / in-flight
  const discardResult = await formController.discardSettingsChanges();
  await Promise.all([p1, p2, p3]);

  // Verified restored
  assert.equal(discardResult.success, true);
  assert.equal(discardResult.restored, true);
  assert.equal(env.storageData.appPerformanceMode, false, 'Storage must be restored to FALSE');
  assert.equal(perfController.isPerformanceModeEnabled(), false, 'Runtime must be OFF');
  assert.equal(env.perfToggle.checked, false, 'UI toggle must be unchecked');
  assert.equal(env.localStorageData['fast-performance-mode'], '0');

  // Wait additional time (longer than all write delays combined)
  await new Promise(r => setTimeout(r, 60));

  // Verify no pending write overwrote the restored value
  assert.equal(env.storageData.appPerformanceMode, false, 'Storage must STILL be FALSE after all delayed writes settle');
  assert.equal(perfController.isPerformanceModeEnabled(), false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
});

test('fast mirror: storage-service and performance-controller dual-sync both mirror keys', async () => {
  const env = createSettingsModalEnvironment({ initialPerformanceMode: false });

  // 1. Through HomebaseStorage.set
  await env.sandbox.HomebaseStorage.set('appPerformanceMode', true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1');

  await env.sandbox.HomebaseStorage.set('appPerformanceMode', false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');

  // 2. Through HomebasePerformanceController.syncFastPerformanceModeMirror
  env.sandbox.HomebasePerformanceController.syncFastPerformanceModeMirror(true);
  assert.equal(env.localStorageData['fast-performance-mode'], '1');
  assert.equal(env.localStorageData['fast-perf-mode'], '1');

  env.sandbox.HomebasePerformanceController.syncFastPerformanceModeMirror(false);
  assert.equal(env.localStorageData['fast-performance-mode'], '0');
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

// =============================================================================
// TEST SUITE 4: Wallpaper Type Performance Mode Reflection
// =============================================================================

test('wallpaper type: when Performance Mode is ON and wallpaper is Static, Live Video is disabled and notice/action are visible', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'static'
  });

  // Notice and action button must be visible
  assert.equal(env.settingsNotice.classList.contains('hidden'), false, 'Settings perf notice must be visible');
  assert.equal(env.galleryNotice.classList.contains('hidden'), false, 'Gallery perf notice must be visible');

  // Video option in select must be disabled (prevent switching from Static to Live Video)
  assert.equal(env.videoOpt.disabled, true, 'Live Video option must be disabled when wallpaper is static');

  // Binary switch in gallery must be disabled (prevent switching from Static to Live Video)
  assert.equal(env.galleryToggle.checked, false, 'Gallery switch must be unchecked for static');
  assert.equal(env.galleryToggle.disabled, true, 'Gallery switch must be disabled when static and perf mode is ON');

  // Attempting to change select to video while performance mode is ON should be prevented
  env.wpTypeSelect.value = 'video';
  await env.wpTypeSelect.dispatchEvent({ type: 'change', target: env.wpTypeSelect });
  assert.equal(env.wpTypeSelect.value, 'static', 'Select must revert to static when switching to video is attempted');

  // Attempting to check gallery toggle to video while performance mode is ON should be prevented
  env.galleryToggle.checked = true;
  await env.galleryToggle.dispatchEvent({ type: 'change', target: env.galleryToggle });
  assert.equal(env.galleryToggle.checked, false, 'Gallery toggle must revert to false when switching to video is attempted');
});

test('wallpaper type: when Performance Mode is ON and wallpaper is Live Video, Live Video remains selected and can switch to Static', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'video'
  });

  // Notice and action button must be visible
  assert.equal(env.settingsNotice.classList.contains('hidden'), false, 'Settings perf notice must be visible');
  assert.equal(env.galleryNotice.classList.contains('hidden'), false, 'Gallery perf notice must be visible');

  // Value remains 'video' (Live Video preference is preserved)
  assert.equal(env.wpTypeSelect.value, 'video');
  assert.equal(env.galleryToggle.checked, true);

  // Video option is NOT disabled while currently selected, so user can switch to Static
  assert.equal(env.videoOpt.disabled, false, 'Live Video option must not be disabled while currently active');
  assert.equal(env.galleryToggle.disabled, false, 'Gallery toggle must not be disabled while currently active');

  // User switches from Video to Static
  env.wpTypeSelect.value = 'static';
  await env.wpTypeSelect.dispatchEvent({ type: 'change', target: env.wpTypeSelect });

  // Now that it is Static and Performance Mode is ON:
  // Video option and gallery toggle become disabled!
  assert.equal(env.wpTypeSelect.value, 'static');
  assert.equal(env.galleryToggle.checked, false);
  assert.equal(env.videoOpt.disabled, true, 'Live Video option must now be disabled');
  assert.equal(env.galleryToggle.disabled, true, 'Gallery toggle must now be disabled');
  assert.equal(env.settingsNotice.classList.contains('hidden'), false, 'Notice remains visible');
});

test('turn off button: immediately updates Performance Mode toggle and controls, restores video when type is video, hides notice', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'video'
  });

  assert.equal(env.perfToggle.checked, true);
  assert.equal(env.settingsNotice.classList.contains('hidden'), false);

  // Clear previous applied wallpapers tracking
  env.appliedWallpapers.length = 0;

  // Click Turn off Performance Mode button
  await env.settingsBtn.click();

  // 1. Performance Mode toggle immediately becomes unchecked
  assert.equal(env.perfToggle.checked, false, 'Perf toggle must immediately be unchecked');
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false, 'Runtime must be OFF');

  // 2. Video playback restored
  assert.equal(env.appliedWallpapers.length > 0, true, 'Wallpaper playback must be restored');
  assert.equal(env.appliedWallpapers[env.appliedWallpapers.length - 1].type, 'video');

  // 3. Wallpaper Type controls fully enabled
  assert.equal(env.videoOpt.disabled, false);
  assert.equal(env.galleryToggle.disabled, false);

  // 4. Notice and button hidden
  assert.equal(env.settingsNotice.classList.contains('hidden'), true, 'Settings notice must be hidden');
  assert.equal(env.galleryNotice.classList.contains('hidden'), true, 'Gallery notice must be hidden');
});

test('turn off button: keeps static wallpaper static when type was static', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'static'
  });

  assert.equal(env.videoOpt.disabled, true);
  assert.equal(env.galleryToggle.disabled, true);

  env.appliedWallpapers.length = 0;

  // Click Turn off Performance Mode button from gallery
  await env.galleryBtn.click();

  // Performance Mode turns off
  assert.equal(env.perfToggle.checked, false);
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false);

  // Static wallpaper remains static (no video re-application)
  const videoCalls = env.appliedWallpapers.filter(w => w.type === 'video');
  assert.equal(videoCalls.length, 0, 'Must NOT start video playback when wallpaper type is static');

  // Controls now enabled so user can freely choose video
  assert.equal(env.videoOpt.disabled, false, 'Video option must now be enabled');
  assert.equal(env.galleryToggle.disabled, false, 'Gallery toggle must now be enabled');
  assert.equal(env.settingsNotice.classList.contains('hidden'), true);
  assert.equal(env.galleryNotice.classList.contains('hidden'), true);
});

test('cancel restoration: restores initial Performance Mode ON, disabled state, and notice', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'static'
  });

  const formController = env.sandbox.HomebaseSettingsFormController;
  formController.setupFormListeners();
  formController.snapshotInitialSettingsState();

  assert.equal(env.perfToggle.checked, true);
  assert.equal(env.videoOpt.disabled, true);
  assert.equal(env.settingsNotice.classList.contains('hidden'), false);

  // User clicks "Turn off Performance Mode"
  await env.settingsBtn.click();

  assert.equal(env.perfToggle.checked, false);
  assert.equal(env.videoOpt.disabled, false);
  assert.equal(env.settingsNotice.classList.contains('hidden'), true);

  // User clicks Cancel
  await formController.discardSettingsChanges();

  // Must restore Performance Mode ON, disabled state, and notice
  assert.equal(env.perfToggle.checked, true, 'Perf toggle must be restored to checked');
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), true, 'Performance mode must be restored to ON');
  assert.equal(env.videoOpt.disabled, true, 'Video option must be restored to disabled');
  assert.equal(env.settingsNotice.classList.contains('hidden'), false, 'Notice must be restored to visible');
  assert.equal(env.storageData.appPerformanceMode, true, 'Storage must be restored to true');
});

test('save persistence: saves Performance Mode OFF and keeps controls enabled', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true,
    initialWallpaperType: 'video'
  });

  const formController = env.sandbox.HomebaseSettingsFormController;
  formController.setupFormListeners();
  formController.snapshotInitialSettingsState();

  // User clicks Turn off Performance Mode
  await env.settingsBtn.click();

  // Save settings
  await formController.handleSaveSettings();

  assert.equal(env.perfToggle.checked, false);
  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false);
  assert.equal(env.videoOpt.disabled, false);
  assert.equal(env.settingsNotice.classList.contains('hidden'), true);
  assert.equal(env.storageData.appPerformanceMode, false, 'Storage must be saved as false');
});

// =============================================================================
// TEST SUITE 5: Modal Entrance Animation Stability on Performance Mode Toggle
// =============================================================================

test('modal animation: opening Settings with Performance Mode ON marks modal as settled immediately', () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true
  });

  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), true, 'Modal opened in Perf Mode must be immediately marked modal-settled');
});

test('modal animation: turning Performance Mode OFF while Settings is open keeps settled state and prevents animation replay', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true
  });

  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), true);

  // User turns Performance Mode OFF while Settings remains open
  await env.settingsBtn.click();

  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), true, 'Modal must remain modal-settled so CSS animation is none !important');
  assert.equal(env.modalEl.classList.contains('hidden'), false, 'Modal remains open');
});

test('modal animation: closing and reopening Settings with Performance Mode OFF clears settled state and allows opening animation', () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: false
  });

  // Open with Perf Mode OFF
  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  // Before animation completes, modal-settled is not yet added
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Before opening animation ends, modal-settled must not be present');

  // Trigger animationend
  env.dialogEl.dispatchEvent({ type: 'animationend' });
  assert.equal(env.modalEl.classList.contains('modal-settled'), true, 'After animationend, modal-settled must be added');

  // Close modal
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal();
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'On close, modal-settled must be removed');

  // Reopen modal with Perf Mode OFF
  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'On reopen, fresh animation must be permitted');

  // Finish animation
  env.dialogEl.dispatchEvent({ type: 'animationend' });
  assert.equal(env.modalEl.classList.contains('modal-settled'), true);
});

test('modal animation: Wallpaper Gallery action button "Turn off Performance Mode" keeps gallery modal settled', async () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: true
  });

  // Open Gallery modal
  env.sandbox.openModalWithAnimation('gallery-modal', null, '.gallery-dialog');
  assert.equal(env.galleryModalEl.classList.contains('hidden'), false);
  assert.equal(env.galleryModalEl.classList.contains('modal-settled'), true, 'Gallery opened in Perf Mode must be modal-settled');

  // Click Turn off Performance Mode from Gallery
  await env.galleryBtn.click();

  assert.equal(env.sandbox.HomebasePerformanceController.isPerformanceModeEnabled(), false);
  assert.equal(env.galleryModalEl.classList.contains('modal-settled'), true, 'Gallery modal must remain modal-settled');
});

test('modal animation: ignores bubbled child animation events during modal opening', () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: false
  });

  // Open modal with Perf Mode OFF
  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Before animation completes, modal-settled must not be added');

  // Child element inside dialog finishes an animation
  const childEl = new MockDOMElement('span');
  env.dialogEl.dispatchEvent({ type: 'animationend', target: childEl });

  // Bubbled event from child must NOT mark the modal as settled
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Child animation event must be ignored and not mark modal-settled');

  // Dialog itself completes its entrance animation
  env.dialogEl.dispatchEvent({ type: 'animationend', target: env.dialogEl });
  assert.equal(env.modalEl.classList.contains('modal-settled'), true, 'Dialog entrance animation completion must mark modal-settled');
});

test('modal animation: closing before entrance animation finishes cleans up listener and prevents modal-settled', () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: false,
    hasClosingAnimation: true
  });

  // Open modal with Perf Mode OFF
  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  assert.equal(env.modalEl.classList.contains('hidden'), false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), false);
  assert.equal(typeof env.modalEl._hbOpenAnimCleanup, 'function', 'Cleanup hook must be registered while opening');

  // Close modal before opening animation completes
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal();
  assert.equal(env.modalEl.classList.contains('closing'), true, 'Modal is now closing');
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Closing modal must not be modal-settled');
  assert.equal(env.modalEl._hbOpenAnimCleanup, null, 'Opening animation cleanup hook must be cleared when closing starts');

  // If a delayed or stray animationend event fires on dialog while closing
  env.dialogEl.dispatchEvent({ type: 'animationend', target: env.dialogEl });
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Stray animation event must never mark closing modal as settled');

  // When closing animation completes, modal is hidden and closing is removed
  assert.equal(env.modalEl.classList.contains('hidden'), true, 'Modal is hidden after closing animation ends');
  assert.equal(env.modalEl.classList.contains('closing'), false, 'Closing class is removed after closing ends');
});

test('modal animation: toggling Performance Mode while modal is closing does NOT mark closing overlay as settled', () => {
  const env = createSettingsModalEnvironment({
    initialPerformanceMode: false,
    hasClosingAnimation: true
  });

  // Open modal then start closing
  env.sandbox.HomebaseSettingsPanelController.openAppSettingsModal('test-btn');
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal();
  assert.equal(env.modalEl.classList.contains('closing'), true);

  // Toggle Performance Mode ON while modal is in closing state
  env.sandbox.HomebasePerformanceController.applyPerformanceMode(true);
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Closing modal must not receive modal-settled when toggling ON');

  // Toggle Performance Mode OFF while modal is still in closing state
  env.sandbox.HomebasePerformanceController.applyPerformanceMode(false);
  assert.equal(env.modalEl.classList.contains('modal-settled'), false, 'Closing modal must not receive modal-settled when toggling OFF');

  // Complete closing animation
  env.dialogEl.dispatchEvent({ type: 'animationend', target: env.dialogEl });
  assert.equal(env.modalEl.classList.contains('hidden'), true);
});
