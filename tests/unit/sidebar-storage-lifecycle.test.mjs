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
const storageServiceScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/storage-service.js'), 'utf8');
const widgetStorageScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-storage.js'), 'utf8');
const widgetVisibilityScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-visibility.js'), 'utf8');
const settingsStorageScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-storage.js'), 'utf8');
const settingsPreferencesScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-preferences.js'), 'utf8');
const settingsFormControllerScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-form-controller.js'), 'utf8');

class MockElement {
  constructor(tagName = 'DIV', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._classes = new Set();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.listeners = {};
    this.disabled = false;
    this.type = 'button';
    this.checked = false;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';

    const self = this;
    this.classList = {
      add(...classes) {
        classes.forEach((c) => { if (c) self._classes.add(c); });
      },
      remove(...classes) {
        classes.forEach((c) => { self._classes.delete(c); });
      },
      contains(cls) {
        return self._classes.has(cls);
      },
      toggle(cls, force) {
        if (force === true) this.add(cls);
        else if (force === false) this.remove(cls);
        else if (this.contains(cls)) this.remove(cls);
        else this.add(cls);
        return this.contains(cls);
      }
    };
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  addEventListener(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    for (const h of list) {
      h.call(this, { ...event, target: this, currentTarget: this });
    }
    return true;
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    child.parentNode = null;
    child.parentElement = null;
    return child;
  }
}

function createSidebarTestEnvironment(initialStorage = {}) {
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
      storageCalls.set.push({ ...items });
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

  const docElement = new MockElement('HTML', '');
  const docBody = new MockElement('BODY', '');
  const elementMap = new Map();

  function registerElement(id, el) {
    el.id = id;
    elementMap.set(id, el);
    return el;
  }

  const documentMock = {
    documentElement: docElement,
    body: docBody,
    getElementById: (id) => elementMap.get(id) || null,
    querySelector: (sel) => {
      if (sel === 'html') return docElement;
      if (sel === 'body') return docBody;
      if (sel.startsWith('#')) return elementMap.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: (sel) => {
      return [];
    },
    createElement: (tag) => new MockElement(tag),
    createDocumentFragment: () => new MockElement('FRAGMENT'),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Boolean,
    Array,
    Object,
    String,
    Number,
    parseInt,
    parseFloat,
    Set,
    Map,
    Promise,
    document: documentMock,
    localStorage: localStorageMock,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    browser: { storage: { local: storageMock } },
    chrome: { storage: { local: storageMock } },

    // Homebase globals & stubs
    APP_SHOW_SIDEBAR_KEY: 'appShowSidebar',
    APP_TIME_FORMAT_KEY: 'appTimeFormatPreference',
    APP_SHOW_WEATHER_KEY: 'appShowWeather',
    APP_SHOW_QUOTE_KEY: 'appShowQuote',
    APP_SHOW_NEWS_KEY: 'appShowNews',
    APP_SHOW_TODO_KEY: 'appShowTodo',
    WIDGET_ORDER_KEY: 'widgetOrder',
    FAST_SHOW_SIDEBAR_KEY: 'fast-show-sidebar',
    FAST_WIDGET_ORDER_KEY: 'fast-widget-order',
    FAST_TIME_FORMAT_KEY: 'fast-time-format',
    DEFAULT_WIDGET_ORDER: ['weather', 'quote', 'todo', 'news'],

    updateSidebarCollapseState: () => {},
    updateWidgetSettingsUI: () => {},
    applyWidgetVisibility: () => {},
    syncAppSettingsForm: () => {},
    isPerformanceModeEnabled: () => false,
    ensureSubSettingsInner: () => {},
    scheduleIdleTask: (fn) => fn(),
    writeFastWidgetOrderMirror: () => {}
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);

  // Run scripts in dependency order
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);
  vm.runInContext(widgetStorageScriptCode, context);
  vm.runInContext(widgetVisibilityScriptCode, context);
  vm.runInContext(settingsStorageScriptCode, context);
  vm.runInContext(settingsPreferencesScriptCode, context);
  vm.runInContext(settingsFormControllerScriptCode, context);

  return {
    context,
    sandbox,
    storageData,
    localStorageData,
    storageCalls,
    docElement,
    docBody,
    registerElement
  };
}

test('sidebar-storage-lifecycle: Initial settings loading applies sidebar visibility without writing it back', async () => {
  const env = createSidebarTestEnvironment({ appShowSidebar: false });

  // Reset storage set tracking before load
  env.storageCalls.set.length = 0;

  // Initial load from storage
  await env.sandbox.loadAppSettingsFromStorage();

  // 1. UI is updated to reflect hidden sidebar
  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), true, 'documentElement should have sidebar-hidden');
  assert.strictEqual(env.docBody.classList.contains('sidebar-hidden'), true, 'body should have sidebar-hidden');
  assert.strictEqual(env.sandbox.appShowSidebarPreference, false, 'in-memory preference should be false');
  assert.strictEqual(env.sandbox.HomebaseSettingsPreferences.get('showSidebar'), false, 'preferences state should be false');

  // 2. Zero storage writebacks occurred
  const sidebarWrites = env.storageCalls.set.filter(call => 'appShowSidebar' in call);
  assert.strictEqual(sidebarWrites.length, 0, 'Initial load must NOT write appShowSidebar back to storage');
});

test('sidebar-storage-lifecycle: Receiving appShowSidebar through storage.onChanged updates the UI without another storage write', async () => {
  const env = createSidebarTestEnvironment({ appShowSidebar: true });

  // Initial load with visible sidebar
  await env.sandbox.loadAppSettingsFromStorage();
  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), false);
  assert.strictEqual(env.sandbox.appShowSidebarPreference, true);

  // Clear tracking
  env.storageCalls.set.length = 0;

  // External tab changes appShowSidebar from true to false
  env.sandbox.HomebaseSettingsPreferences.handleStorageChange(
    { appShowSidebar: { oldValue: true, newValue: false } },
    'local'
  );

  // 1. UI is updated immediately
  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), true, 'documentElement should gain sidebar-hidden');
  assert.strictEqual(env.docBody.classList.contains('sidebar-hidden'), true, 'body should gain sidebar-hidden');
  assert.strictEqual(env.sandbox.appShowSidebarPreference, false, 'appShowSidebarPreference should update to false');
  assert.strictEqual(env.sandbox.HomebaseSettingsPreferences.get('showSidebar'), false);
  assert.strictEqual(env.localStorageData['fast-show-sidebar'], '0', 'fast mirror updated');

  // 2. Zero storage writebacks triggered by onChanged
  const sidebarWrites = env.storageCalls.set.filter(call => 'appShowSidebar' in call);
  assert.strictEqual(sidebarWrites.length, 0, 'Receiving onChanged must NOT write appShowSidebar back to storage');
});

test('sidebar-storage-lifecycle: A user sidebar change followed by Save persists correctly, including after live preview', async () => {
  const env = createSidebarTestEnvironment({ appShowSidebar: true });

  await env.sandbox.loadAppSettingsFromStorage();

  // Setup DOM elements for settings form
  const sidebarToggle = env.registerElement('app-show-sidebar-toggle', new MockElement('INPUT'));
  sidebarToggle.type = 'checkbox';
  sidebarToggle.checked = true;

  const saveBtn = env.registerElement('app-settings-save', new MockElement('BUTTON'));
  env.registerElement('app-settings-modal', new MockElement('DIV'));

  const formController = env.sandbox.HomebaseSettingsFormController;
  formController.setupFormListeners();
  formController.snapshotInitialSettingsState();

  // Clear storage call records
  env.storageCalls.set.length = 0;

  // 1. User changes the toggle (live preview triggered)
  sidebarToggle.checked = false;
  sidebarToggle.dispatchEvent({ type: 'change' });

  // Live preview applied without storage write
  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), true, 'Live preview should hide sidebar');
  assert.strictEqual(env.sandbox.appShowSidebarPreference, false);
  assert.strictEqual(env.storageCalls.set.length, 0, 'Live preview must NOT write to storage before Save');

  // 2. User clicks Save
  await formController.handleSaveSettings();

  // Persistent storage now contains the updated value
  const sidebarWrites = env.storageCalls.set.filter(call => 'appShowSidebar' in call);
  assert.strictEqual(sidebarWrites.length, 1, 'Save must persist appShowSidebar exactly once');
  assert.strictEqual(sidebarWrites[0].appShowSidebar, false, 'Saved value must be false');
  assert.strictEqual(env.storageData.appShowSidebar, false, 'Underlying storage must have appShowSidebar: false');
  assert.strictEqual(env.localStorageData['fast-show-sidebar'], '0', 'Fast mirror must be updated to 0');
});

test('sidebar-storage-lifecycle: Cancel restores the prior setting without persisting the preview', async () => {
  const env = createSidebarTestEnvironment({ appShowSidebar: true });

  await env.sandbox.loadAppSettingsFromStorage();

  // Setup DOM elements for settings form
  const sidebarToggle = env.registerElement('app-show-sidebar-toggle', new MockElement('INPUT'));
  sidebarToggle.type = 'checkbox';
  sidebarToggle.checked = true;

  env.registerElement('app-settings-modal', new MockElement('DIV'));

  const formController = env.sandbox.HomebaseSettingsFormController;
  formController.setupFormListeners();
  formController.snapshotInitialSettingsState();

  // Clear storage call records
  env.storageCalls.set.length = 0;

  // 1. User toggles to false (live preview)
  sidebarToggle.checked = false;
  sidebarToggle.dispatchEvent({ type: 'change' });

  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), true, 'Live preview applied');
  assert.strictEqual(env.sandbox.appShowSidebarPreference, false);
  assert.strictEqual(env.storageCalls.set.length, 0, 'No storage writes during live preview');

  // 2. User clicks Cancel / Close with discard
  formController.discardSettingsChanges();

  // Controls, DOM, and in-memory state are restored to prior state (true)
  assert.strictEqual(sidebarToggle.checked, true, 'Checkbox must revert to true');
  assert.strictEqual(env.docElement.classList.contains('sidebar-hidden'), false, 'DOM .sidebar-hidden must be removed');
  assert.strictEqual(env.docBody.classList.contains('sidebar-hidden'), false, 'Body .sidebar-hidden must be removed');
  assert.strictEqual(env.sandbox.appShowSidebarPreference, true, 'appShowSidebarPreference must revert to true');

  // Zero storage writes occurred during cancel
  const sidebarWrites = env.storageCalls.set.filter(call => 'appShowSidebar' in call);
  assert.strictEqual(sidebarWrites.length, 0, 'Cancel must NOT persist the discarded preview to storage');
  assert.strictEqual(env.storageData.appShowSidebar, true, 'Storage data remains true');
});
