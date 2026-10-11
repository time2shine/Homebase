import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const panelControllerScriptPath = path.join(rootDir, 'src/newtab/settings/settings-panel-controller.js');
const panelControllerScriptCode = fs.readFileSync(panelControllerScriptPath, 'utf8');

/**
 * Lightweight mock element supporting standard DOM operations for unit testing.
 */
class MockElement {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this._classes = new Set();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.listeners = {};
    this.disabled = false;
    this._className = '';
    this.type = 'button';
    this._textContent = '';
    this._innerHTML = '';

    const self = this;
    this.classList = {
      add(...classes) {
        classes.forEach((c) => {
          if (c) {
            self._classes.add(c);
          }
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

  insertBefore(newChild, refChild) {
    newChild.parentNode = this;
    newChild.parentElement = this;
    const index = this.children.indexOf(refChild);
    if (index === -1) {
      this.children.push(newChild);
    } else {
      this.children.splice(index, 0, newChild);
    }
    return newChild;
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
    if (sel.includes(' ')) {
      const parts = sel.split(/\s+/);
      let curr = this.matches(parts[0]) ? this : this.querySelector(parts[0]);
      if (!curr) return null;
      for (let i = 1; i < parts.length; i++) {
        if (!curr) return null;
        curr = curr.querySelector(parts[i]);
      }
      return curr;
    }
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
 * Creates an in-memory VM environment for testing settings-panel-controller.js.
 */
function createPanelControllerTestEnvironment() {
  const elementsById = new Map();
  const documentListeners = {};

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
    },
    addEventListener(event, fn) {
      if (!documentListeners[event]) documentListeners[event] = [];
      documentListeners[event].push(fn);
    },
    dispatchDocumentEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const fns = documentListeners[type] || [];
      for (const fn of fns) {
        fn(event);
      }
    }
  };

  const sandbox = {
    window: null,
    document: doc,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    HomebaseSettingsContentSections: {
      renderWhatsNewSection: () => {},
      renderProTipsSection: () => {},
      renderDiagnosticsSection: () => {},
      createPrivacyNavItem: () => {
        const el = new MockElement('BUTTON');
        el.className = 'app-settings-nav-item';
        el.dataset.section = 'privacy';
        return el;
      },
      createProTipsNavItem: () => {
        const el = new MockElement('BUTTON');
        el.className = 'app-settings-nav-item';
        el.dataset.section = 'pro-tips';
        return el;
      },
      createDiagnosticsNavItem: () => {
        const el = new MockElement('BUTTON');
        el.className = 'app-settings-nav-item';
        el.dataset.section = 'diagnostics';
        return el;
      },
      createPrivacySection: () => {
        const el = new MockElement('SECTION');
        el.className = 'app-settings-section';
        el.dataset.section = 'privacy';
        return el;
      },
      createProTipsSection: () => {
        const el = new MockElement('SECTION');
        el.className = 'app-settings-section';
        el.dataset.section = 'pro-tips';
        return el;
      },
      createDiagnosticsSection: () => {
        const el = new MockElement('SECTION');
        el.className = 'app-settings-section';
        el.dataset.section = 'diagnostics';
        return el;
      },
      ensureFeedbackDiagnosticButton: () => {}
    },
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(panelControllerScriptCode, context);

  return {
    sandbox,
    context,
    doc,
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

test('settings-panel-controller: canonical API surface is defined on window', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  assert.ok(controller, 'HomebaseSettingsPanelController must exist on window');
  assert.equal(typeof controller.openAppSettingsModal, 'function');
  assert.equal(typeof controller.closeAppSettingsModal, 'function');
  assert.equal(typeof controller.isModalOpen, 'function');
  assert.equal(typeof controller.setupModalLifecycle, 'function');
  assert.equal(typeof controller.addBeforeOpenHook, 'function');
  assert.equal(typeof controller.addAfterCloseHook, 'function');
  assert.equal(typeof controller.setActiveAppSettingsSection, 'function');
  assert.equal(typeof controller.ensureSettingsSectionOrder, 'function');
  assert.equal(typeof controller.setupWidgetOrderSortable, 'function');
  assert.equal(typeof controller.setupWidgetOrderDrag, 'function');
  assert.ok(controller.PANELS_WITHOUT_ACTIONS && typeof controller.PANELS_WITHOUT_ACTIONS.has === 'function');
  assert.equal(controller.PANELS_WITHOUT_ACTIONS.has('backup'), true);
  assert.equal(typeof env.sandbox.setupWidgetOrderSortable, 'function');
});

test('settings-panel-controller: setActiveAppSettingsSection updates active classes and footer visibility', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const navItemGeneral = new MockElement('BUTTON');
  navItemGeneral.className = 'app-settings-nav-item';
  navItemGeneral.dataset.section = 'general';

  const navItemAbout = new MockElement('BUTTON');
  navItemAbout.className = 'app-settings-nav-item';
  navItemAbout.dataset.section = 'about';

  const sectionGeneral = new MockElement('SECTION');
  sectionGeneral.className = 'app-settings-section';
  sectionGeneral.dataset.section = 'general';

  const sectionAbout = new MockElement('SECTION');
  sectionAbout.className = 'app-settings-section';
  sectionAbout.dataset.section = 'about';

  const footer = new MockElement('DIV');
  footer.className = 'app-settings-footer';

  env.registerElement('nav-gen', navItemGeneral);
  env.registerElement('nav-abt', navItemAbout);
  env.registerElement('sec-gen', sectionGeneral);
  env.registerElement('sec-abt', sectionAbout);
  env.registerElement('footer', footer);

  // Switch to general: footer is not hidden
  controller.setActiveAppSettingsSection('general');
  assert.equal(navItemGeneral.classList.contains('is-active'), true);
  assert.equal(navItemAbout.classList.contains('is-active'), false);
  assert.equal(sectionGeneral.classList.contains('active'), true);
  assert.equal(sectionAbout.classList.contains('active'), false);
  assert.equal(footer.classList.contains('hidden'), false);

  // Switch to about (in PANELS_WITHOUT_ACTIONS): footer is hidden
  controller.setActiveAppSettingsSection('about');
  assert.equal(navItemGeneral.classList.contains('is-active'), false);
  assert.equal(navItemAbout.classList.contains('is-active'), true);
  assert.equal(sectionGeneral.classList.contains('active'), false);
  assert.equal(sectionAbout.classList.contains('active'), true);
  assert.equal(footer.classList.contains('hidden'), true);
});

test('settings-panel-controller: ensureSettingsSectionOrder injects missing sections and nav items', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const nav = env.registerElement('app-settings-nav', new MockElement('NAV'));
  const content = env.registerElement('content', new MockElement('DIV'));
  content.className = 'app-settings-content';

  controller.ensureSettingsSectionOrder();

  // Navigation items for privacy, pro-tips, and diagnostics should be appended
  const privacyNav = nav.querySelector('[data-section="privacy"]');
  const proTipsNav = nav.querySelector('[data-section="pro-tips"]');
  const diagNav = nav.querySelector('[data-section="diagnostics"]');

  assert.ok(privacyNav, 'Privacy nav item must be created');
  assert.ok(proTipsNav, 'Pro Tips nav item must be created');
  assert.ok(diagNav, 'Diagnostics nav item must be created');

  // Panels for privacy, pro-tips, and diagnostics should be appended
  const privacyPanel = content.querySelector('[data-section="privacy"]');
  const proTipsPanel = content.querySelector('[data-section="pro-tips"]');
  const diagPanel = content.querySelector('[data-section="diagnostics"]');

  assert.ok(privacyPanel, 'Privacy section must be created');
  assert.ok(proTipsPanel, 'Pro Tips section must be created');
  assert.ok(diagPanel, 'Diagnostics section must be created');
});

test('settings-panel-controller: open and close lifecycle with beforeOpen and afterClose hooks', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');

  let beforeHookRan = false;
  let afterHookRan = false;

  controller.addBeforeOpenHook(() => {
    beforeHookRan = true;
  });
  controller.addAfterCloseHook(() => {
    afterHookRan = true;
  });

  // Open modal
  controller.openAppSettingsModal('test-btn');
  assert.equal(beforeHookRan, true, 'Before-open hook must run');
  assert.equal(controller.isModalOpen(), true, 'Modal should report open');
  assert.equal(modal.classList.contains('hidden'), false);

  // Close modal
  controller.closeAppSettingsModal();
  assert.equal(afterHookRan, true, 'After-close hook must run');
  assert.equal(controller.isModalOpen(), false, 'Modal should report closed');
  assert.equal(modal.classList.contains('hidden'), true);
});

test('settings-panel-controller: setupModalLifecycle attaches backdrop and ESC key dismissals', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  const closeBtn = env.registerElement('app-settings-close-btn', new MockElement('BUTTON'));
  const cancelBtn = env.registerElement('app-settings-cancel-btn', new MockElement('BUTTON'));

  controller.setupModalLifecycle();

  // Test close button
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  closeBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false);

  // Test cancel button
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  cancelBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false);

  // Test backdrop click
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  modal.dispatchEvent({ type: 'click', target: modal });
  assert.equal(controller.isModalOpen(), false);

  // Test ESC key
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  env.doc.dispatchDocumentEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(controller.isModalOpen(), false);
});
