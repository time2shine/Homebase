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
    const doc = this._ownerDoc;
    if (doc) {
      const setDoc = (node) => {
        node._ownerDoc = doc;
        if (node.children) node.children.forEach(setDoc);
      };
      setDoc(child);
    }
    this.children.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    newChild.parentNode = this;
    newChild.parentElement = this;
    if (this._ownerDoc) newChild._ownerDoc = this._ownerDoc;
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

  hasAttribute(k) {
    return this[k] !== undefined && this[k] !== null;
  }

  focus() {
    this._focused = true;
    if (this._ownerDoc) {
      this._ownerDoc.activeElement = this;
    }
  }

  blur() {
    this._focused = false;
    if (this._ownerDoc && this._ownerDoc.activeElement === this) {
      this._ownerDoc.activeElement = this._ownerDoc.body || null;
    }
  }

  contains(child) {
    if (!child) return false;
    let curr = child;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode || curr.parentElement;
    }
    return false;
  }

  get isConnected() {
    if (!this._ownerDoc || !this._ownerDoc.body) return true;
    return this._ownerDoc.body.contains(this);
  }

  matches(sel) {
    if (!sel) return false;
    if (sel === '*') return true;

    // Handle compound :not(...) like button:not([disabled]) or [tabindex]:not([tabindex="-1"])
    if (sel.includes(':not(')) {
      const idx = sel.indexOf(':not(');
      const base = sel.slice(0, idx);
      const rest = sel.slice(idx + 5, -1);
      return (base ? this.matches(base) : true) && !this.matches(rest);
    }

    // Split selector into parts: attributes and stripped selector
    const attrRegex = /\[([^=\]]+)(?:="([^"]*)")?\]/g;
    let match;
    const attrs = [];
    while ((match = attrRegex.exec(sel)) !== null) {
      attrs.push({ attr: match[1], val: match[2] });
    }
    const stripped = sel.replace(attrRegex, '');

    for (const { attr, val } of attrs) {
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (val !== undefined) {
          if (this.dataset[key] !== val) return false;
        } else if (!(key in this.dataset)) {
          return false;
        }
      } else if (attr === 'disabled') {
        if (this.disabled !== true) return false;
      } else if (attr === 'href') {
        if (this.href === undefined || this.href === null) return false;
      } else {
        const actualVal = this.getAttribute(attr);
        if (val !== undefined) {
          if (actualVal !== val) return false;
        } else if (!actualVal) {
          return false;
        }
      }
    }

    if (!stripped) return true;

    // Now handle tag and classes in stripped
    const parts = stripped.split('.');
    const tag = parts[0];
    if (tag && tag !== '') {
      if (tag.startsWith('#')) {
        if (this.id !== tag.slice(1)) return false;
      } else if (this.tagName.toLowerCase() !== tag.toLowerCase()) {
        return false;
      }
    }
    for (let i = 1; i < parts.length; i++) {
      if (!this.classList.contains(parts[i])) return false;
    }
    return true;
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
    if (sel.includes(',')) {
      const parts = sel.split(',').map((s) => s.trim());
      const results = [];
      const traverse = (node) => {
        for (const child of node.children) {
          if (parts.some((part) => child.matches && child.matches(part))) {
            results.push(child);
          }
          if (child.children && child.children.length) {
            traverse(child);
          }
        }
      };
      traverse(this);
      return results;
    }
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

  const body = new MockElement('BODY');
  const doc = {
    body,
    activeElement: body,
    createElement(tagName) {
      const el = new MockElement(tagName);
      el._ownerDoc = doc;
      return el;
    },
    createDocumentFragment() {
      const frag = new MockElement('FRAGMENT');
      frag._ownerDoc = doc;
      return frag;
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
      const setDoc = (node) => {
        node._ownerDoc = doc;
        if (node.children) node.children.forEach(setDoc);
      };
      setDoc(el);
      elementsById.set(id, el);
      if (!el.parentNode && el !== body) {
        body.appendChild(el);
      }
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

test('settings-panel-controller: setupModalLifecycle attaches close and cancel handlers using canonical production IDs', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  const closeBtn = env.registerElement('app-settings-close', new MockElement('BUTTON'));
  const cancelBtn = env.registerElement('app-settings-cancel', new MockElement('BUTTON'));

  controller.setupModalLifecycle();

  // Test canonical close button (#app-settings-close)
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  closeBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false, 'Clicking #app-settings-close must close modal');

  // Test canonical cancel button (#app-settings-cancel)
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);
  cancelBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false, 'Clicking #app-settings-cancel must close modal');
});

test('settings-panel-controller: Close button discards changes', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  const closeBtn = env.registerElement('app-settings-close', new MockElement('BUTTON'));

  let discardCalled = false;
  env.sandbox.HomebaseSettingsFormController = {
    discardSettingsChanges: () => {
      discardCalled = true;
    },
    snapshotInitialSettingsState: () => {}
  };

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);

  closeBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false, 'Modal must close on Close button click');
  assert.equal(discardCalled, true, 'Close button must invoke discardSettingsChanges');
});

test('settings-panel-controller: Cancel button discards changes', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  const cancelBtn = env.registerElement('app-settings-cancel', new MockElement('BUTTON'));

  let discardCalled = false;
  env.sandbox.HomebaseSettingsFormController = {
    discardSettingsChanges: () => {
      discardCalled = true;
    },
    snapshotInitialSettingsState: () => {}
  };

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('test-btn');
  assert.equal(controller.isModalOpen(), true);

  cancelBtn.dispatchEvent({ type: 'click' });
  assert.equal(controller.isModalOpen(), false, 'Modal must close on Cancel button click');
  assert.equal(discardCalled, true, 'Cancel button must invoke discardSettingsChanges');
});



test('settings-panel-controller: new-tab.html declares proper dialog semantics and labels', () => {
  const htmlPath = path.join(rootDir, 'src/new-tab.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verify dialog attributes
  assert.ok(
    htmlContent.includes('id="app-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="app-settings-title" tabindex="-1"'),
    '#app-settings-dialog must have role="dialog", aria-modal="true", aria-labelledby="app-settings-title", and tabindex="-1"'
  );

  // Verify heading has referenced id
  assert.ok(
    htmlContent.includes('<h3 id="app-settings-title">Settings</h3>'),
    'Settings heading must have id="app-settings-title"'
  );
});

test('settings-panel-controller: initial focus targets active section navigation button or close button', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  const nav = env.registerElement('app-settings-nav', new MockElement('NAV'));
  dialog.appendChild(nav);

  const navBtn1 = new MockElement('BUTTON');
  navBtn1.className = 'app-settings-nav-item is-active';
  navBtn1.dataset.section = 'general';
  nav.appendChild(navBtn1);

  const navBtn2 = new MockElement('BUTTON');
  navBtn2.className = 'app-settings-nav-item';
  navBtn2.dataset.section = 'appearance';
  nav.appendChild(navBtn2);

  const closeBtn = env.registerElement('app-settings-close', new MockElement('BUTTON'));
  dialog.appendChild(closeBtn);

  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(controller.isModalOpen(), true);
  assert.equal(env.doc.activeElement, navBtn1, 'Initial focus must land on active section nav item');

  // Fallback test: when nav items are missing or disabled, falls back to close button
  controller.closeAppSettingsModal();
  navBtn1.disabled = true;
  navBtn2.disabled = true;
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(env.doc.activeElement, closeBtn, 'Initial focus must fall back to close button if nav items are disabled');
});

test('settings-panel-controller: initial focus sequence token prevents stale callback focus theft', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  const nav = env.registerElement('app-settings-nav', new MockElement('NAV'));
  dialog.appendChild(nav);

  const navBtn = new MockElement('BUTTON');
  navBtn.className = 'app-settings-nav-item is-active';
  nav.appendChild(navBtn);

  const externalBtn = env.registerElement('external-btn', new MockElement('BUTTON'));
  externalBtn.focus();
  assert.equal(env.doc.activeElement, externalBtn);

  // Open modal (seq = 1)
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(env.doc.activeElement, navBtn);

  // Close modal immediately
  controller.closeAppSettingsModal();
  assert.equal(controller.isModalOpen(), false);
  externalBtn.focus();
  assert.equal(env.doc.activeElement, externalBtn);

  // Stale callback simulation with old sequence (seq = 1)
  controller.scheduleInitialFocus(1);
  assert.equal(env.doc.activeElement, externalBtn, 'Stale sequence callback must not steal focus when modal is closed');
});

test('settings-panel-controller: Tab containment wraps forward and Shift+Tab wraps backward', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  const closeBtn = env.registerElement('app-settings-close', new MockElement('BUTTON'));
  dialog.appendChild(closeBtn);

  const input1 = new MockElement('INPUT');
  input1.type = 'text';
  dialog.appendChild(input1);

  const saveBtn = env.registerElement('app-settings-save', new MockElement('BUTTON'));
  dialog.appendChild(saveBtn);

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(controller.isModalOpen(), true);

  // Tab forward wrapping: on last control (saveBtn), pressing Tab wraps to first (closeBtn)
  saveBtn.focus();
  assert.equal(env.doc.activeElement, saveBtn);

  let prevented = false;
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true, 'Tab wrap forward must call preventDefault');
  assert.equal(env.doc.activeElement, closeBtn, 'Tab from last element must wrap to first element');

  // Shift+Tab backward wrapping: on first control (closeBtn), pressing Shift+Tab wraps to last (saveBtn)
  closeBtn.focus();
  assert.equal(env.doc.activeElement, closeBtn);

  prevented = false;
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true, 'Shift+Tab wrap backward must call preventDefault');
  assert.equal(env.doc.activeElement, saveBtn, 'Shift+Tab from first element must wrap to last element');
});

test('settings-panel-controller: focus trap dynamically excludes hidden, disabled, inert, and negative-tabindex controls', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const dialog = new MockElement('DIV');

  // Eligible control
  const validBtn = new MockElement('BUTTON');
  dialog.appendChild(validBtn);

  // Eligible link
  const validLink = new MockElement('A');
  validLink.href = 'https://example.com';
  dialog.appendChild(validLink);

  // Disabled control
  const disabledBtn = new MockElement('BUTTON');
  disabledBtn.disabled = true;
  dialog.appendChild(disabledBtn);

  // Negative tabindex control
  const negTabindexBtn = new MockElement('BUTTON');
  negTabindexBtn.setAttribute('tabindex', '-1');
  dialog.appendChild(negTabindexBtn);

  // Control inside inactive section
  const inactiveSection = new MockElement('SECTION');
  inactiveSection.className = 'app-settings-section'; // not active
  const hiddenSectionInput = new MockElement('INPUT');
  inactiveSection.appendChild(hiddenSectionInput);
  dialog.appendChild(inactiveSection);

  // Control inside hidden footer
  const hiddenFooter = new MockElement('DIV');
  hiddenFooter.className = 'app-settings-footer hidden';
  const hiddenFooterBtn = new MockElement('BUTTON');
  hiddenFooter.appendChild(hiddenFooterBtn);
  dialog.appendChild(hiddenFooter);

  // Control inside .hidden element
  const hiddenContainer = new MockElement('DIV');
  hiddenContainer.className = 'hidden';
  const hiddenContainerBtn = new MockElement('BUTTON');
  hiddenContainer.appendChild(hiddenContainerBtn);
  dialog.appendChild(hiddenContainer);

  const focusables = controller.getSettingsFocusableElements(dialog);
  assert.equal(focusables.length, 2, 'Only validBtn and validLink should be considered eligible focusables');
  assert.ok(focusables.includes(validBtn));
  assert.ok(focusables.includes(validLink));
  assert.ok(!focusables.includes(disabledBtn));
  assert.ok(!focusables.includes(negTabindexBtn));
  assert.ok(!focusables.includes(hiddenSectionInput));
  assert.ok(!focusables.includes(hiddenFooterBtn));
  assert.ok(!focusables.includes(hiddenContainerBtn));
});

test('settings-panel-controller: empty focusable fallback focuses dialog container', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');

  let prevented = false;
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true, 'Tab with no focusables must preventDefault');
  assert.equal(env.doc.activeElement, dialog, 'Tab with no focusables must fall back to dialog element');
});

test('settings-panel-controller: focus restoration returns focus to invoking opener element', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  const openerBtn = env.registerElement('custom-settings-trigger', new MockElement('BUTTON'));
  openerBtn.focus();
  assert.equal(env.doc.activeElement, openerBtn);

  // Open using openerBtn
  controller.openAppSettingsModal(openerBtn);
  assert.equal(controller.isModalOpen(), true);

  // Close Settings
  controller.closeAppSettingsModal();
  assert.equal(controller.isModalOpen(), false);
  assert.equal(env.doc.activeElement, openerBtn, 'Focus must return to the custom opener button');

  // Fallback test: when opener becomes disconnected, falls back to #main-settings-btn
  const mainBtn = env.registerElement('main-settings-btn', new MockElement('BUTTON'));
  openerBtn.parentElement.children = openerBtn.parentElement.children.filter(c => c !== openerBtn);
  openerBtn.parentElement = null;
  openerBtn.parentNode = null;

  controller.openAppSettingsModal(openerBtn);
  controller.closeAppSettingsModal();
  assert.equal(env.doc.activeElement, mainBtn, 'Focus must fall back to #main-settings-btn if opener is disconnected');
});

test('settings-panel-controller: Tab trap yields to active nested dialogs', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);
  const closeBtn = env.registerElement('app-settings-close', new MockElement('BUTTON'));
  dialog.appendChild(closeBtn);

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');

  // While Settings is open, user opens a nested modal (e.g. search-engines-modal)
  const nestedModal = env.registerElement('search-engines-modal', new MockElement('DIV'));
  nestedModal.className = 'modal-overlay'; // NOT hidden
  const nestedInput = new MockElement('INPUT');
  nestedModal.appendChild(nestedInput);
  nestedInput.focus();
  assert.equal(env.doc.activeElement, nestedInput);

  let prevented = false;
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, false, 'Settings Tab trap must NOT call preventDefault when nested dialog is active');
  assert.equal(env.doc.activeElement, nestedInput, 'Settings Tab trap must not steal focus from nested dialog');
});

test('settings-panel-controller: Escape coordination isolates nested dialogs and preserves Settings', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  // Nested modal active
  const nestedModal = env.registerElement('folder-picker-modal', new MockElement('DIV'));
  nestedModal.className = 'modal-overlay'; // visible

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(controller.isModalOpen(), true);

  // Escape key when nested dialog is open
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape'
  });
  assert.equal(controller.isModalOpen(), true, 'Settings modal must remain open when nested dialog is visible');

  // Nested modal in closing animation
  nestedModal.classList.add('closing');
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape'
  });
  assert.equal(controller.isModalOpen(), true, 'Settings modal must remain open when nested dialog is closing');

  // Event with e._homebaseHandled
  nestedModal.classList.add('hidden');
  nestedModal.classList.remove('closing');
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape',
    _homebaseHandled: true
  });
  assert.equal(controller.isModalOpen(), true, 'Settings modal must remain open when e._homebaseHandled is true');

  // Event with e.defaultPrevented
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape',
    defaultPrevented: true
  });
  assert.equal(controller.isModalOpen(), true, 'Settings modal must remain open when e.defaultPrevented is true');

  // Normal Settings Escape closes settings
  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape'
  });
  assert.equal(controller.isModalOpen(), false, 'Settings modal must close when no nested dialog handled Escape');
});

test('settings-panel-controller: event-order regression where nested dialog closes before Settings Escape runs', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  const nestedModal = env.registerElement('animation-settings-modal', new MockElement('DIV'));
  nestedModal.className = 'modal-overlay';
  const nestedBtn = new MockElement('BUTTON');
  nestedModal.appendChild(nestedBtn);

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(controller.isModalOpen(), true);

  // Simulate an event originating in the nested dialog where the nested handler closes
  // the dialog synchronously or adds .closing before Settings' document-level handler runs
  const event = {
    type: 'keydown',
    key: 'Escape',
    target: nestedBtn,
    defaultPrevented: false,
    _homebaseHandled: false
  };

  // Nested handler runs first on capture or element:
  nestedModal.classList.add('closing');
  event._homebaseHandled = true;

  // Settings document-level listener runs second:
  env.doc.dispatchDocumentEvent(event);

  assert.equal(controller.isModalOpen(), true, 'Settings must stay open when nested dialog handled Escape first');
});

test('settings-panel-controller: Escape preserves transactional discard of unsaved changes', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const modal = env.registerElement('app-settings-modal', new MockElement('DIV'));
  modal.classList.add('hidden');
  const dialog = env.registerElement('app-settings-dialog', new MockElement('DIV'));
  modal.appendChild(dialog);

  let discardCalled = false;
  env.sandbox.HomebaseSettingsFormController = {
    discardSettingsChanges: () => {
      discardCalled = true;
    },
    snapshotInitialSettingsState: () => {}
  };

  controller.setupModalLifecycle();
  controller.openAppSettingsModal('main-settings-btn');
  assert.equal(controller.isModalOpen(), true);

  env.doc.dispatchDocumentEvent({
    type: 'keydown',
    key: 'Escape'
  });

  assert.equal(controller.isModalOpen(), false, 'Modal must close on Escape');
  assert.equal(discardCalled, true, 'Escape must invoke discardSettingsChanges');
});

test('settings-panel-controller: section switching rescues focus when previous section control is hidden', () => {
  const env = createPanelControllerTestEnvironment();
  const controller = env.sandbox.HomebaseSettingsPanelController;

  const nav = env.registerElement('app-settings-nav', new MockElement('NAV'));
  const genNav = new MockElement('BUTTON');
  genNav.className = 'app-settings-nav-item is-active';
  genNav.dataset.section = 'general';
  nav.appendChild(genNav);

  const backupNav = new MockElement('BUTTON');
  backupNav.className = 'app-settings-nav-item';
  backupNav.dataset.section = 'backup';
  nav.appendChild(backupNav);

  const genSection = new MockElement('SECTION');
  genSection.className = 'app-settings-section active';
  genSection.dataset.section = 'general';
  const genInput = new MockElement('INPUT');
  genSection.appendChild(genInput);

  const backupSection = new MockElement('SECTION');
  backupSection.className = 'app-settings-section';
  backupSection.dataset.section = 'backup';

  const footer = new MockElement('DIV');
  footer.className = 'app-settings-footer';
  const saveBtn = new MockElement('BUTTON');
  footer.appendChild(saveBtn);

  env.registerElement('general-section', genSection);
  env.registerElement('backup-section', backupSection);
  env.registerElement('settings-footer', footer);

  // Focus is inside General section
  genInput.focus();
  assert.equal(env.doc.activeElement, genInput);

  // Switch to backup section (which deactivates general-section and hides footer)
  controller.setActiveAppSettingsSection('backup');

  // Since genInput is now inside an inactive section, focus should be rescued to backupNav
  assert.equal(env.doc.activeElement, backupNav, 'Focus must be rescued to active section nav button');
});
