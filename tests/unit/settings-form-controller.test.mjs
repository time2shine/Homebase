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
    const evt = typeof event === 'string' ? { type: event, target: this } : event;
    if (!evt.target) evt.target = this;
    const fns = this.listeners[type] || [];
    for (const fn of fns) {
      fn(evt);
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

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
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

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
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

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
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

test('settings-form-controller: clicking app-settings-save triggers save handler', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const saveBtn = env.registerElement('app-settings-save', new MockElement('BUTTON'));
  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  let modalClosed = false;
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal = () => {
    modalClosed = true;
  };

  controller.setupFormListeners();

  // Dispatch click on the canonical #app-settings-save element
  saveBtn.dispatchEvent({ type: 'click' });

  // Wait a tick for async handleSaveSettings to complete
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(env.savedBatches.length, 1, 'Clicking #app-settings-save must trigger save batch');
  assert.equal(env.savedBatches[0].timeFormat, '12-hour');
  assert.equal(modalClosed, true, 'Modal should close after save triggered by button click');
});

test('settings-form-controller: clicking fallback app-settings-save-btn triggers save handler', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const saveBtn = env.registerElement('app-settings-save-btn', new MockElement('BUTTON'));
  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  let modalClosed = false;
  env.sandbox.HomebaseSettingsPanelController.closeAppSettingsModal = () => {
    modalClosed = true;
  };

  controller.setupFormListeners();

  saveBtn.dispatchEvent({ type: 'click' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(env.savedBatches.length, 1, 'Clicking fallback #app-settings-save-btn must trigger save batch');
  assert.equal(env.savedBatches[0].timeFormat, '24-hour');
  assert.equal(modalClosed, true);
});

test('settings-form-controller: selecting 12-hour and saving persists "12-hour"', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  let appliedFormat = null;
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].timeFormat, '12-hour');
  assert.equal(appliedFormat, '12-hour');
});

test('settings-form-controller: selecting 24-hour persists "24-hour"', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  let appliedFormat = null;
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].timeFormat, '24-hour');
  assert.equal(appliedFormat, '24-hour');
});

test('settings-form-controller: changing dropdown updates HomebaseWidgetTime immediately', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  let appliedFormat = null;
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();

  // Change to 24-hour
  timeSelect.value = '24-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  assert.equal(appliedFormat, '24-hour', 'Changing to 24-hour must immediately update HomebaseWidgetTime');

  // Change to 12-hour
  timeSelect.value = '12-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  assert.equal(appliedFormat, '12-hour', 'Changing to 12-hour must immediately update HomebaseWidgetTime');
});

test('settings-form-controller: resetFormToDefaults updates canonical element', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  env.sandbox.HomebaseSettingsStorage.defaults = { timeFormat: '24-hour' };
  controller.resetFormToDefaults();

  assert.equal(timeSelect.value, '24-hour', 'resetFormToDefaults must update canonical #app-time-format');
});

test('settings-form-controller: fallback app-time-format-select is supported for backward compatibility', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const fallbackSelect = env.registerElement('app-time-format-select', new MockElement('SELECT'));
  fallbackSelect.value = '12-hour';

  let appliedFormat = null;
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();

  fallbackSelect.value = '24-hour';
  fallbackSelect.dispatchEvent({ type: 'change' });
  assert.equal(appliedFormat, '24-hour', 'Fallback element change should trigger live update');

  await controller.handleSaveSettings();
  assert.equal(env.savedBatches[0].timeFormat, '24-hour', 'Fallback element value should be saved');
});

test('settings-form-controller: Modify setting -> Cancel -> storage unchanged', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';
  const sidebarToggle = env.registerElement('app-show-sidebar-toggle', new MockElement('INPUT'));
  sidebarToggle.checked = true;

  let appliedFormat = '12-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();

  // 1. Snapshot original settings state
  controller.snapshotInitialSettingsState();

  // 2. Modify settings (live preview)
  timeSelect.value = '24-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  sidebarToggle.checked = false;
  sidebarToggle.dispatchEvent({ type: 'change' });
  assert.equal(appliedFormat, '24-hour', 'Live preview should update time widget during edit');

  // 3. User cancels / discards changes
  controller.discardSettingsChanges();

  // 4. Assert storage is completely unchanged (zero writes)
  assert.equal(env.savedBatches.length, 0, 'Cancel must not write to persistent storage');

  // 5. Assert form elements and widgets were restored to original snapshot
  assert.equal(timeSelect.value, '12-hour', 'Form timeSelect value must revert to snapshot');
  assert.equal(sidebarToggle.checked, true, 'Form sidebar toggle must revert to snapshot');
  assert.equal(appliedFormat, '12-hour', 'Time widget format must revert to snapshot');
});

test('settings-form-controller: Modify setting -> Close -> storage unchanged', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';
  const dimSlider = env.registerElement('app-background-dim-slider', new MockElement('INPUT'));
  dimSlider.value = '10';
  const dimLabel = env.registerElement('app-background-dim-label', new MockElement('SPAN'));
  dimLabel.textContent = '10%';

  let appliedFormat = '12-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Modify settings
  timeSelect.value = '24-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  dimSlider.value = '60';
  dimSlider.dispatchEvent({ type: 'input' });
  assert.equal(appliedFormat, '24-hour');

  // Close modal without saving (triggers discard)
  controller.discardSettingsChanges();

  assert.equal(env.savedBatches.length, 0, 'Close (X) must not write to persistent storage');
  assert.equal(timeSelect.value, '12-hour', 'Time format should revert to 12-hour');
  assert.equal(dimSlider.value, '10', 'Dim slider should revert to 10');
  assert.equal(appliedFormat, '12-hour', 'Time format widget should revert to 12-hour');
});

test('settings-form-controller: Modify setting -> Save -> storage updated', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';

  let appliedFormat = '12-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Modify setting
  timeSelect.value = '24-hour';
  timeSelect.dispatchEvent({ type: 'change' });

  // Save settings
  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1, 'Save must dispatch updates to storage');
  assert.equal(env.savedBatches[0].timeFormat, '24-hour');
  assert.equal(appliedFormat, '24-hour', 'Saved format should remain active');
});

test('settings-form-controller: Live preview still works before Save', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '12-hour';
  const dimSlider = env.registerElement('app-background-dim-slider', new MockElement('INPUT'));
  dimSlider.value = '0';
  const dimLabel = env.registerElement('app-background-dim-label', new MockElement('SPAN'));

  let appliedDim = 0;
  env.sandbox.applyBackgroundDim = (val) => { appliedDim = val; };

  let appliedFormat = '12-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedFormat = fmt; }
  };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Modify dropdown
  timeSelect.value = '24-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  assert.equal(appliedFormat, '24-hour', 'Live preview must apply time format immediately');

  // Modify slider
  dimSlider.value = '40';
  dimSlider.dispatchEvent({ type: 'input' });
  assert.equal(appliedDim, 40, 'Live preview must apply dim immediately');
  assert.equal(dimLabel.textContent, '40%');

  // Crucial check: storage remains untouched
  assert.equal(env.savedBatches.length, 0, 'Live preview must NOT write to storage before Save');
});

test('settings-form-controller: Show Homebase Tips - Enable -> Cancel -> returns disabled', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;
  env.localStorageData['homebaseTipsDisabled'] = 'true';

  const tipsToggle = env.registerElement('app-show-homebase-tips-toggle', new MockElement('INPUT'));
  tipsToggle.checked = false;

  let previewOverride = null;
  env.sandbox.setHomebaseTipsPreviewOverride = (val) => { previewOverride = val; };

  controller.setupTipsToggle();
  controller.snapshotInitialSettingsState();

  // Enable tips
  tipsToggle.checked = true;
  tipsToggle.dispatchEvent({ type: 'change' });
  assert.equal(previewOverride, true, 'Live preview must show enabled tips');
  assert.equal(env.localStorageData['homebaseTipsDisabled'], 'true', 'Storage must NOT be modified before Save');

  // Cancel
  controller.discardSettingsChanges();

  assert.equal(tipsToggle.checked, false, 'Tips toggle must return disabled');
  assert.equal(env.localStorageData['homebaseTipsDisabled'], 'true', 'Storage must remain disabled');
  assert.equal(previewOverride, null, 'Preview override must be cleared');
  assert.equal(env.savedBatches.length, 0, 'No persistent storage writes');
});

test('settings-form-controller: Show Homebase Tips - Enable -> Close X -> returns disabled', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;
  env.localStorageData['homebaseTipsDisabled'] = 'true';

  const tipsToggle = env.registerElement('app-show-homebase-tips-toggle', new MockElement('INPUT'));
  tipsToggle.checked = false;

  let previewOverride = null;
  env.sandbox.setHomebaseTipsPreviewOverride = (val) => { previewOverride = val; };

  controller.setupTipsToggle();
  controller.snapshotInitialSettingsState();

  // Enable tips
  tipsToggle.checked = true;
  tipsToggle.dispatchEvent({ type: 'change' });
  assert.equal(previewOverride, true);
  assert.equal(env.localStorageData['homebaseTipsDisabled'], 'true', 'Storage must NOT change during edit');

  // Close X
  controller.discardSettingsChanges();

  assert.equal(tipsToggle.checked, false, 'Tips toggle must return disabled');
  assert.equal(env.localStorageData['homebaseTipsDisabled'], 'true', 'Storage must remain disabled');
  assert.equal(previewOverride, null, 'Preview override must be cleared');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Show Homebase Tips - Enable -> Save -> persists', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;
  env.localStorageData['homebaseTipsDisabled'] = 'true';

  const tipsToggle = env.registerElement('app-show-homebase-tips-toggle', new MockElement('INPUT'));
  tipsToggle.checked = false;

  let previewOverride = null;
  env.sandbox.setHomebaseTipsPreviewOverride = (val) => { previewOverride = val; };

  controller.setupTipsToggle();
  controller.snapshotInitialSettingsState();

  // Enable tips
  tipsToggle.checked = true;
  tipsToggle.dispatchEvent({ type: 'change' });

  // Save
  await controller.handleSaveSettings();

  assert.equal(env.localStorageData['homebaseTipsDisabled'], undefined, 'Disabled flag must be removed on save (persists enabled)');
  assert.equal(previewOverride, null, 'Preview override must reset after save');
});

test('settings-form-controller: Quality - Change -> Cancel -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const qualitySelect = env.registerElement('app-wallpaper-quality-select', new MockElement('SELECT'));
  qualitySelect.value = 'low';
  const qualityToggle = env.registerElement('wallpaper-quality-toggle', new MockElement('INPUT'));
  qualityToggle.checked = false;

  let appliedQuality = 'low';
  env.sandbox.applyWallpaperByType = (sel, type) => { appliedQuality = env.sandbox.wallpaperQualityPreference; };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Change Quality to high
  qualitySelect.value = 'high';
  qualitySelect.dispatchEvent({ type: 'change' });
  assert.equal(env.sandbox.wallpaperQualityPreference, 'high', 'Live preview updates in-memory quality');
  assert.equal(env.savedBatches.length, 0, 'No storage writes before Save');

  // Cancel
  controller.discardSettingsChanges();

  assert.equal(qualitySelect.value, 'low', 'Select must revert to low');
  assert.equal(qualityToggle.checked, false, 'Toggle must revert to false');
  assert.equal(env.sandbox.wallpaperQualityPreference, 'low', 'In-memory quality must revert to low');
  assert.equal(env.savedBatches.length, 0, 'Storage remains untouched');
});

test('settings-form-controller: Quality - Change -> Close X -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const qualitySelect = env.registerElement('app-wallpaper-quality-select', new MockElement('SELECT'));
  qualitySelect.value = 'low';

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  qualitySelect.value = 'high';
  qualitySelect.dispatchEvent({ type: 'change' });
  assert.equal(env.sandbox.wallpaperQualityPreference, 'high');

  // Close X
  controller.discardSettingsChanges();

  assert.equal(qualitySelect.value, 'low');
  assert.equal(env.sandbox.wallpaperQualityPreference, 'low');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Quality - Change -> Save -> persists', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const qualitySelect = env.registerElement('app-wallpaper-quality-select', new MockElement('SELECT'));
  qualitySelect.value = 'low';

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  qualitySelect.value = 'high';
  qualitySelect.dispatchEvent({ type: 'change' });

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].wallpaperQuality, 'high');
  assert.equal(env.sandbox.wallpaperQualityPreference, 'high');
});

test('settings-form-controller: Wallpaper Type - Change -> Cancel -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const typeSelect = env.registerElement('app-wallpaper-type-select', new MockElement('SELECT'));
  typeSelect.value = 'static';
  const typeToggle = env.registerElement('wallpaper-type-toggle', new MockElement('INPUT'));
  typeToggle.checked = false;

  let appliedType = 'static';
  env.sandbox.applyWallpaperByType = (sel, type) => { appliedType = type; };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Change to video
  typeSelect.value = 'video';
  typeSelect.dispatchEvent({ type: 'change' });
  assert.equal(env.sandbox.wallpaperTypePreference, 'video');
  assert.equal(env.savedBatches.length, 0, 'No storage writes before Save');

  // Cancel
  controller.discardSettingsChanges();

  assert.equal(typeSelect.value, 'static', 'Type select must revert to static');
  assert.equal(typeToggle.checked, false, 'Type toggle must revert to false');
  assert.equal(env.sandbox.wallpaperTypePreference, 'static', 'In-memory type must revert to static');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Wallpaper Type - Change -> Close X -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const typeSelect = env.registerElement('app-wallpaper-type-select', new MockElement('SELECT'));
  typeSelect.value = 'static';

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  typeSelect.value = 'video';
  typeSelect.dispatchEvent({ type: 'change' });

  // Close X
  controller.discardSettingsChanges();

  assert.equal(typeSelect.value, 'static');
  assert.equal(env.sandbox.wallpaperTypePreference, 'static');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Wallpaper Type - Change -> Save -> persists', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const typeSelect = env.registerElement('app-wallpaper-type-select', new MockElement('SELECT'));
  typeSelect.value = 'static';

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  typeSelect.value = 'video';
  typeSelect.dispatchEvent({ type: 'change' });

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].wallpaperType, 'video');
  assert.equal(env.sandbox.wallpaperTypePreference, 'video');
});

test('settings-form-controller: Time format - Change -> Cancel -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  let appliedTimeFormat = '24-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedTimeFormat = fmt; }
  };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Change to 12-hour
  timeSelect.value = '12-hour';
  timeSelect.dispatchEvent({ type: 'change' });
  assert.equal(appliedTimeFormat, '12-hour', 'Live preview updates time format');
  assert.equal(env.savedBatches.length, 0);

  // Cancel
  controller.discardSettingsChanges();

  assert.equal(timeSelect.value, '24-hour', 'Time select reverts to 24-hour');
  assert.equal(appliedTimeFormat, '24-hour', 'Widget reverts to 24-hour');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Time format - Change -> Close X -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  let appliedTimeFormat = '24-hour';
  env.sandbox.HomebaseWidgetTime = {
    applyTimeFormatPreference: (fmt) => { appliedTimeFormat = fmt; }
  };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  timeSelect.value = '12-hour';
  timeSelect.dispatchEvent({ type: 'change' });

  controller.discardSettingsChanges();

  assert.equal(timeSelect.value, '24-hour');
  assert.equal(appliedTimeFormat, '24-hour');
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Time format - Change -> Save -> persists', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const timeSelect = env.registerElement('app-time-format', new MockElement('SELECT'));
  timeSelect.value = '24-hour';

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  timeSelect.value = '12-hour';
  timeSelect.dispatchEvent({ type: 'change' });

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].timeFormat, '12-hour');
});

test('settings-form-controller: Widget toggles - Toggle -> Cancel -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const weatherToggle = env.registerElement('app-show-weather-toggle', new MockElement('INPUT'));
  weatherToggle.checked = true;
  const quoteToggle = env.registerElement('app-show-quote-toggle', new MockElement('INPUT'));
  quoteToggle.checked = true;
  const newsToggle = env.registerElement('app-show-news-toggle', new MockElement('INPUT'));
  newsToggle.checked = false;
  const todoToggle = env.registerElement('app-show-todo-toggle', new MockElement('INPUT'));
  todoToggle.checked = true;
  const sidebarToggle = env.registerElement('app-show-sidebar-toggle', new MockElement('INPUT'));
  sidebarToggle.checked = true;

  let weatherState = true;
  let quoteState = true;
  let newsState = false;
  let todoState = true;
  let sidebarState = true;

  env.sandbox.HomebaseWidgetWeather = { setWeatherPreference: (v) => { weatherState = v; } };
  env.sandbox.HomebaseWidgetQuote = { setQuotePreference: (v) => { quoteState = v; } };
  env.sandbox.HomebaseWidgetNews = { setNewsPreference: (v) => { newsState = v; } };
  env.sandbox.HomebaseWidgetTodo = { setTodoPreference: (v) => { todoState = v; } };
  env.sandbox.applySidebarVisibility = (v) => { sidebarState = v; };

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  // Toggle widgets
  weatherToggle.checked = false;
  weatherToggle.dispatchEvent({ type: 'change' });
  quoteToggle.checked = false;
  quoteToggle.dispatchEvent({ type: 'change' });
  newsToggle.checked = true;
  newsToggle.dispatchEvent({ type: 'change' });
  todoToggle.checked = false;
  todoToggle.dispatchEvent({ type: 'change' });
  sidebarToggle.checked = false;
  sidebarToggle.dispatchEvent({ type: 'change' });

  assert.equal(weatherState, false);
  assert.equal(quoteState, false);
  assert.equal(newsState, true);
  assert.equal(todoState, false);
  assert.equal(sidebarState, false);
  assert.equal(env.savedBatches.length, 0, 'Zero storage writes during toggling');

  // Cancel
  controller.discardSettingsChanges();

  assert.equal(weatherToggle.checked, true, 'Weather toggle reverts to true');
  assert.equal(quoteToggle.checked, true, 'Quote toggle reverts to true');
  assert.equal(newsToggle.checked, false, 'News toggle reverts to false');
  assert.equal(todoToggle.checked, true, 'Todo toggle reverts to true');
  assert.equal(sidebarToggle.checked, true, 'Sidebar toggle reverts to true');

  assert.equal(weatherState, true);
  assert.equal(quoteState, true);
  assert.equal(newsState, false);
  assert.equal(todoState, true);
  assert.equal(sidebarState, true);
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Widget toggles - Toggle -> Close X -> reverts', () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const weatherToggle = env.registerElement('app-show-weather-toggle', new MockElement('INPUT'));
  weatherToggle.checked = true;
  const newsToggle = env.registerElement('app-show-news-toggle', new MockElement('INPUT'));
  newsToggle.checked = false;
  const todoToggle = env.registerElement('app-show-todo-toggle', new MockElement('INPUT'));
  todoToggle.checked = true;

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  weatherToggle.checked = false;
  weatherToggle.dispatchEvent({ type: 'change' });
  newsToggle.checked = true;
  newsToggle.dispatchEvent({ type: 'change' });
  todoToggle.checked = false;
  todoToggle.dispatchEvent({ type: 'change' });

  // Close X
  controller.discardSettingsChanges();

  assert.equal(weatherToggle.checked, true);
  assert.equal(newsToggle.checked, false);
  assert.equal(todoToggle.checked, true);
  assert.equal(env.savedBatches.length, 0);
});

test('settings-form-controller: Widget toggles - Toggle -> Save -> persists', async () => {
  const env = createFormControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsFormController;

  const weatherToggle = env.registerElement('app-show-weather-toggle', new MockElement('INPUT'));
  weatherToggle.checked = true;
  const newsToggle = env.registerElement('app-show-news-toggle', new MockElement('INPUT'));
  newsToggle.checked = false;
  const todoToggle = env.registerElement('app-show-todo-toggle', new MockElement('INPUT'));
  todoToggle.checked = true;

  controller.setupFormListeners();
  controller.snapshotInitialSettingsState();

  weatherToggle.checked = false;
  weatherToggle.dispatchEvent({ type: 'change' });
  newsToggle.checked = true;
  newsToggle.dispatchEvent({ type: 'change' });
  todoToggle.checked = false;
  todoToggle.dispatchEvent({ type: 'change' });

  await controller.handleSaveSettings();

  assert.equal(env.savedBatches.length, 1);
  assert.equal(env.savedBatches[0].showWeather, false);
  assert.equal(env.savedBatches[0].showNews, true);
  assert.equal(env.savedBatches[0].showTodo, false);
});


