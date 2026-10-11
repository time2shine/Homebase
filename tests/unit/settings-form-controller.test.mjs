import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const formControllerScriptPath = path.join(rootDir, 'src/newtab/settings/settings-form-controller.js');
const formControllerScriptCode = fs.readFileSync(formControllerScriptPath, 'utf8');

/**
 * Lightweight mock element supporting standard DOM operations for unit testing.
 */
class MockElement {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
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
    this._textContent = '';
    this._innerHTML = '';

    const self = this;
    this.classList = {
      add(...classes) {
        classes.forEach((c) => {
          if (c) self._classes.add(c);
        });
      },
      remove(...classes) {
        classes.forEach((c) => {
          self._classes.delete(c);
        });
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

  set className(val) {
    this._classes = new Set(String(val || '').trim().split(/\s+/).filter(Boolean));
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
    if (val === '') {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(k, v) {
    this[k] = String(v);
  }

  getAttribute(k) {
    return this[k] || null;
  }

  matches(sel) {
    if (!sel) return false;
    if (sel.startsWith('[')) {
      const match = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (match) {
        const attr = match[1];
        const val = match[2];
        if (attr.startsWith('data-')) {
          const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          return val !== undefined ? this.dataset[key] === val : key in this.dataset;
        }
        return val !== undefined ? this.getAttribute(attr) === val : !!this.getAttribute(attr);
      }
    }
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }

  querySelector(sel) {
    if (!sel) return null;
    for (const child of this.children) {
      if (child.matches && child.matches(sel)) return child;
      if (child.querySelector) {
        const found = child.querySelector(sel);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(sel) {
    const results = [];
    for (const child of this.children) {
      if (child.matches && child.matches(sel)) results.push(child);
      if (child.querySelectorAll) {
        results.push(...child.querySelectorAll(sel));
      }
    }
    return results;
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(sel)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const fns = this.listeners[type] || [];
    for (const fn of fns) {
      fn(event);
    }
  }
}

/**
 * Creates an in-memory VM environment for testing settings-form-controller.js.
 */
function createFormControllerTestEnvironment() {
  const elementsById = new Map();
  const localStorageData = {};
  const savedBatches = [];

  const doc = {
    createElement(tagName) {
      return new MockElement(tagName);
    },
    createDocumentFragment() {
      return new MockElement('FRAGMENT');
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector(sel) {
      for (const el of elementsById.values()) {
        if (el.matches(sel)) return el;
        const sub = el.querySelector(sel);
        if (sub) return sub;
      }
      return null;
    },
    querySelectorAll(sel) {
      const res = [];
      for (const el of elementsById.values()) {
        if (el.matches(sel)) res.push(el);
        res.push(...el.querySelectorAll(sel));
      }
      return res;
    }
  };

  const sandbox = {
    window: null,
    document: doc,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    },
    localStorage: {
      getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
      setItem: (k, v) => { localStorageData[k] = String(v); },
      removeItem: (k) => { delete localStorageData[k]; }
    },
    HomebaseSettingsStorage: {
      defaults: {
        timeFormat: '24-hour',
        showSidebar: true,
        maxTabs: 0,
        autoClose: 0,
        backgroundDim: 20,
        searchOpenNewTab: false,
        showWeather: true,
        showQuote: true,
        showNews: false
      },
      save: async (updates) => {
        savedBatches.push(updates);
      }
    },
    HomebaseSettingsPanelController: {
      closeAppSettingsModal: () => {}
    },
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(formControllerScriptCode, context);

  return {
    sandbox,
    context,
    doc,
    localStorageData,
    savedBatches,
    registerElement(id, el) {
      el.id = id;
      elementsById.set(id, el);
      return el;
    }
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test('settings-form-controller: canonical API surface is defined on window', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  assert.ok(controller, 'HomebaseSettingsFormController must exist on window');
  assert.equal(typeof controller.scrapeFormValues, 'function');
  assert.equal(typeof controller.applyFormValuesLive, 'function');
  assert.equal(typeof controller.handleSaveSettings, 'function');
  assert.equal(typeof controller.setupFormListeners, 'function');
  assert.equal(typeof controller.setupTipsToggle, 'function');
  assert.equal(typeof controller.syncTipsToggle, 'function');
  assert.equal(typeof controller.resetFormToDefaults, 'function');
  assert.equal(typeof controller.snapshotInitialWallpaperState, 'function');
  assert.equal(typeof controller.getInitialWallpaperState, 'function');
});

test('settings-form-controller: scrapeFormValues collects and normalizes form values into updates', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format-select', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  const sidebarToggle = env.registerElement('app-show-sidebar-toggle', new MockElement('INPUT'));
  sidebarToggle.checked = true;

  const dimSlider = env.registerElement('app-background-dim-slider', new MockElement('INPUT'));
  dimSlider.value = '45';

  const weatherToggle = env.registerElement('app-show-weather-toggle', new MockElement('INPUT'));
  weatherToggle.checked = false;

  const result = controller.scrapeFormValues();
  assert.ok(result.updates, 'updates object must be generated');
  assert.equal(result.updates.timeFormat, '12-hour');
  assert.equal(result.updates.showSidebar, true);
  assert.equal(result.updates.backgroundDim, 45);
  assert.equal(result.updates.showWeather, false);
});

test('settings-form-controller: handleSaveSettings delegates exclusively to HomebaseSettingsStorage.save()', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format-select', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  const dimSlider = env.registerElement('app-background-dim-slider', new MockElement('INPUT'));
  dimSlider.value = '35';

  let modalClosed = false;
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal = () => {
    modalClosed = true;
  };

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1, 'Exactly one save batch should be dispatched');
  const batch = env.savedBatches[0];
  assert.equal(batch.timeFormat, '24-hour');
  assert.equal(batch.backgroundDim, 35);
  assert.equal(modalClosed, true, 'Modal should be closed after save');
});

test('settings-form-controller: resetFormToDefaults populates form elements from defaults', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format-select', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  const dimSlider = env.registerElement('app-background-dim-slider', new MockElement('INPUT'));
  dimSlider.value = '80';

  const defaults = controller.resetFormToDefaults();
  assert.ok(defaults);
  assert.equal(timeSelect.value, '24-hour');
  assert.equal(dimSlider.value, '20');
});

test('settings-form-controller: tips toggle synchronization with localStorage', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const tipsToggle = env.registerElement('app-show-homebase-tips-toggle', new MockElement('INPUT'));

  // Initially not disabled in localStorage -> toggle checked
  controller.syncTipsToggle();
  assert.equal(tipsToggle.checked, true);

  // Set disabled in localStorage
  env.localStorageData['homebaseTipsDisabled'] = 'true';
  controller.syncTipsToggle();
  assert.equal(tipsToggle.checked, false);
});
