import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentSectionsScriptPath = path.join(rootDir, 'src/newtab/settings/settings-content-sections.js');
const contentSectionsScriptCode = fs.readFileSync(contentSectionsScriptPath, 'utf8');

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
    this.type = 'button';
    this._textContent = '';
    this._innerHTML = '';

    const self = this;
    this.classList = {
      add(...classes) {
        classes.forEach((c) => {
          if (c) {
            self._classes.add(c);
            self.className = Array.from(self._classes).join(' ');
          }
        });
      },
      remove(...classes) {
        classes.forEach((c) => {
          self._classes.delete(c);
        });
        self.className = Array.from(self._classes).join(' ');
      },
      contains(cls) {
        return self._classes.has(cls) || self.className.split(/\s+/).includes(cls);
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
}

/**
 * Creates an in-memory VM environment for testing settings-content-sections.js.
 */
function createContentSectionsTestEnvironment() {
  const localStorageData = {};
  const elementsById = new Map();

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
    WHATS_NEW: {
      version: '0.18.0',
      date: '2026-10-11',
      items: [
        { type: 'NEW', title: 'Modularized settings panel architecture' },
        { type: 'IMPROVED', title: 'Faster dashboard responsiveness' }
      ]
    },
    HOMEBASE_TIPS: [
      { id: 'tip-1', title: 'Tip 1', body: 'Body 1', settingKeys: [], settingIds: [] },
      { id: 'tip-2', title: 'Tip 2', body: 'Body 2', settingKeys: [], settingIds: [] }
    ],
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(contentSectionsScriptCode, context);

  return {
    sandbox,
    context,
    localStorageData,
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

test('settings-content-sections: canonical API surface is defined on window', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  assert.ok(api, 'HomebaseSettingsContentSections must exist on window');
  assert.equal(typeof api.getWhatsNewData, 'function');
  assert.equal(typeof api.loadWhatsNewChangelog, 'function');
  assert.equal(typeof api.updateWhatsNewNavBadge, 'function');
  assert.equal(typeof api.markWhatsNewSeen, 'function');
  assert.equal(typeof api.renderWhatsNewSection, 'function');
  assert.equal(typeof api.createProTipsNavItem, 'function');
  assert.equal(typeof api.createProTipsSection, 'function');
  assert.equal(typeof api.renderProTipsSection, 'function');
  assert.equal(typeof api.getFilteredProTips, 'function');
  assert.equal(typeof api.ensureDiagnosticUILoaded, 'function');
  assert.equal(typeof api.createDiagnosticsNavItem, 'function');
  assert.equal(typeof api.createDiagnosticsSection, 'function');
  assert.equal(typeof api.renderDiagnosticsSection, 'function');
  assert.equal(typeof api.createPrivacyNavItem, 'function');
  assert.equal(typeof api.createPrivacySection, 'function');
  assert.equal(typeof api.loadPrivacyPolicyInto, 'function');
  assert.equal(typeof api.handlePrivacyPolicyClick, 'function');
  assert.equal(typeof api.getFeedbackStoreUrl, 'function');
  assert.equal(typeof api.openFeedbackUrl, 'function');
  assert.equal(typeof api.shareHomebaseFeedbackLink, 'function');
  assert.equal(typeof api.handleFeedbackAction, 'function');
  assert.equal(typeof api.ensureFeedbackDiagnosticButton, 'function');
});

test('settings-content-sections: What\'s New data resolution and badge marking', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const data = api.getWhatsNewData();
  assert.ok(data);
  assert.equal(data.version, '0.18.0');
  assert.equal(data.items.length, 2);

  const badgeEl = env.registerElement('whats-new-nav-badge', new MockElement('SPAN'));
  badgeEl.classList.add('is-hidden');

  api.updateWhatsNewNavBadge('0.18.0');
  // Since unseen in localStorage, is-hidden is removed
  assert.equal(badgeEl.classList.contains('is-hidden'), false);

  api.markWhatsNewSeen('0.18.0');
  assert.equal(env.localStorageData['lastSeenWhatsNewVersion'], '0.18.0');
  assert.equal(badgeEl.classList.contains('is-hidden'), true);
});

test('settings-content-sections: Pro Tips filtering and DOM item creation', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const tips = api.getFilteredProTips();
  assert.equal(tips.length, 2);
  assert.equal(tips[0].title, 'Tip 1');

  const navItem = api.createProTipsNavItem();
  assert.equal(navItem.dataset.section, 'pro-tips');
  assert.ok(navItem.innerHTML.includes('Pro Tips'));

  const section = api.createProTipsSection();
  assert.equal(section.dataset.section, 'pro-tips');
  assert.ok(section.querySelector('#pro-tips-list'));
});

test('settings-content-sections: Privacy Policy nav and panel creation', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const navItem = api.createPrivacyNavItem();
  assert.equal(navItem.dataset.section, 'privacy');
  assert.ok(navItem.innerHTML.includes('Privacy'));

  const section = api.createPrivacySection();
  assert.equal(section.dataset.section, 'privacy');
  const policyToggle = section.querySelector('.app-settings-privacy-policy-toggle');
  assert.ok(policyToggle, 'Privacy policy toggle button must exist');
  assert.equal(policyToggle.textContent, 'Show');
});

test('settings-content-sections: Feedback store URL returns chrome listing for non-firefox', async () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const storeUrl = await api.getFeedbackStoreUrl();
  assert.ok(storeUrl.includes('chromewebstore.google.com'));
});

test('settings-content-sections: Diagnostics nav and section DOM creation', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const navItem = api.createDiagnosticsNavItem();
  assert.equal(navItem.dataset.section, 'diagnostics');
  assert.ok(navItem.innerHTML.includes('Diagnostics'));

  const section = api.createDiagnosticsSection();
  assert.equal(section.dataset.section, 'diagnostics');
});

test('settings-content-sections: ensureFeedbackDiagnosticButton injects button when absent', () => {
  const env = createContentSectionsTestEnvironment();
  const api = env.sandbox.HomebaseSettingsContentSections;

  const feedbackCard = new MockElement('DIV');
  feedbackCard.className = 'app-settings-feedback-card';
  const bugBtn = new MockElement('BUTTON');
  bugBtn.dataset.feedbackAction = 'bug';
  feedbackCard.appendChild(bugBtn);

  env.registerElement('card', feedbackCard);

  api.ensureFeedbackDiagnosticButton();
  const diagBtn = feedbackCard.querySelector('.app-settings-feedback-diagnostic-btn');
  assert.ok(diagBtn, 'Diagnostic report button should be injected');
  assert.equal(diagBtn.dataset.feedbackAction, 'diagnostic-report');

  // Calling again should not duplicate
  api.ensureFeedbackDiagnosticButton();
  const diagBtns = feedbackCard.querySelectorAll('.app-settings-feedback-diagnostic-btn');
  assert.equal(diagBtns.length, 1);
});
