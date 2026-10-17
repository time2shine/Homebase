import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tipsUiScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/tips/homebase-tips-ui.js'), 'utf8');
const tipsDataScriptCode = fs.readFileSync(path.join(rootDir, 'src/tips.js'), 'utf8');
const contentSectionsScriptCode = fs.readFileSync(path.join(rootDir, 'src/newtab/settings/settings-content-sections.js'), 'utf8');

class MockElement {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this._classes = new Set();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.listeners = {};
    this.type = 'button';
    this._textContent = '';
    this.style = {};

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

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((n) => this.appendChild(typeof n === 'string' ? new MockTextNode(n) : n));
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._textContent = '';
    this.append(...nodes);
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }

  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  removeAttribute(k) {
    this.attributes.delete(k);
  }

  hasAttribute(k) {
    return this.attributes.has(k);
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    list.forEach((l) => l(event));
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches && child.matches(selector)) return child;
      if (child.querySelector) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (child.matches && child.matches(selector)) results.push(child);
      if (child.querySelectorAll) results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

class MockTextNode {
  constructor(text) {
    this.textContent = String(text);
  }
}

function createTipsUiEnvironment({ isChromeDefaultSearch = false, hasContainers = false, localStorageState = {} } = {}) {
  const elementsById = new Map();
  const localStorageData = { ...localStorageState };

  const doc = {
    createElement(tag) {
      return new MockElement(tag);
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    }
  };

  const browserMock = hasContainers
    ? { contextualIdentities: { query: async () => [{ name: 'Personal' }] } }
    : {};

  const sandbox = {
    window: null,
    document: doc,
    browser: browserMock,
    chrome: browserMock,
    isBrowserDefaultSearch: () => isChromeDefaultSearch,
    getLocalDayStamp: (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    localStorage: {
      getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
      setItem: (k, v) => { localStorageData[k] = String(v); },
      removeItem: (k) => { delete localStorageData[k]; }
    },
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(tipsUiScriptCode, context);

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
// Test 1: Chrome Default Search Daily Tips
// -----------------------------------------------------------------------------
test('tips-ui: Chrome default-search mode daily tips exclude bangs, engine switching, and remote suggestions', () => {
  const env = createTipsUiEnvironment({ isChromeDefaultSearch: true, hasContainers: false });
  const tips = env.sandbox.HomebaseTipsUI.getEligibleDailyTips();

  // Must not recommend bangs
  const hasBangs = tips.some((t) => /bang/i.test(t.title) || /!\w+/i.test(t.body));
  assert.equal(hasBangs, false, 'Chrome default search must not recommend bangs');

  // Must not recommend remote suggestions
  const hasSuggestions = tips.some((t) => /suggestion/i.test(t.title) || /search suggestions/i.test(t.body));
  assert.equal(hasSuggestions, false, 'Chrome default search must not recommend remote search suggestions');

  // Must provide Chrome tip explaining default search provider
  const defaultSearchTip = tips.find((t) => /default/i.test(t.title) || /default search/i.test(t.body));
  assert.ok(defaultSearchTip, 'Chrome default search mode must include a tip explaining default search');
  assert.ok(defaultSearchTip.body.includes('default search provider'));

  // Must not mention Firefox Containers
  const hasContainers = tips.some((t) => /container/i.test(t.body) || /container/i.test(t.title));
  assert.equal(hasContainers, false, 'Chrome build must not mention Firefox Containers');
});

// -----------------------------------------------------------------------------
// Test 2: Chrome Default Search Onboarding Card
// -----------------------------------------------------------------------------
test('tips-ui: Chrome default-search onboarding card includes default search and excludes bangs and engine switching', () => {
  const env = createTipsUiEnvironment({ isChromeDefaultSearch: true, hasContainers: false });
  const items = env.sandbox.HomebaseTipsUI.getEligibleOnboardingItems();

  const hasBangs = items.some((i) => /bang/i.test(i.text) || /!g/i.test(i.text));
  assert.equal(hasBangs, false, 'Onboarding in Chrome must not recommend bangs');

  const hasAltDown = items.some((i) => /alt\s*\+\s*arrow/i.test(i.text) || /switch between search engines/i.test(i.text));
  assert.equal(hasAltDown, false, 'Onboarding in Chrome must not recommend engine switching shortcuts');

  const defaultSearchItem = items.find((i) => /default search provider/i.test(i.text));
  assert.ok(defaultSearchItem, 'Onboarding in Chrome must explain default search provider');

  const hasContainers = items.some((i) => /container/i.test(i.text));
  assert.equal(hasContainers, false, 'Onboarding in Chrome must not mention containers');
});

// -----------------------------------------------------------------------------
// Test 3: Edge Daily Tips and Onboarding (Multi-engine, No Containers)
// -----------------------------------------------------------------------------
test('tips-ui: Edge preserves bangs and suggestions without Firefox Containers mentions', () => {
  const env = createTipsUiEnvironment({ isChromeDefaultSearch: false, hasContainers: false });
  const tips = env.sandbox.HomebaseTipsUI.getEligibleDailyTips();

  // Preserves bangs
  const bangsTip = tips.find((t) => /bang/i.test(t.title));
  assert.ok(bangsTip, 'Edge must include bangs tip');
  assert.equal(bangsTip.body.includes('Firefox Containers'), false, 'Edge bangs tip must not reference Firefox Containers');

  // Preserves search suggestions
  const suggestionsTip = tips.find((t) => /suggestion/i.test(t.title));
  assert.ok(suggestionsTip, 'Edge must include search suggestions tip');

  // No default search tip
  const defaultSearchTip = tips.find((t) => t.title === 'Browser-default search');
  assert.equal(defaultSearchTip, undefined, 'Edge must not include Chrome-only default search tip');

  // Bookmarks tip should not reference containers
  const bookmarkTip = tips.find((t) => /bookmarks/i.test(t.title));
  assert.ok(bookmarkTip);
  assert.equal(bookmarkTip.body.includes('Firefox Containers'), false, 'Edge bookmark tip must not reference Firefox Containers');

  // Onboarding preserves engine switcher and bangs without containers
  const items = env.sandbox.HomebaseTipsUI.getEligibleOnboardingItems();
  assert.ok(items.some((i) => /bang/i.test(i.text)));
  assert.ok(items.some((i) => /alt\s*\+\s*arrow/i.test(i.text)));
  assert.equal(items.some((i) => /firefox container/i.test(i.text)), false);
});

// -----------------------------------------------------------------------------
// Test 4: Firefox Daily Tips and Onboarding (Multi-engine, With Containers)
// -----------------------------------------------------------------------------
test('tips-ui: Firefox includes bangs, suggestions, and Firefox Containers references', () => {
  const env = createTipsUiEnvironment({ isChromeDefaultSearch: false, hasContainers: true });
  const tips = env.sandbox.HomebaseTipsUI.getEligibleDailyTips();

  const bangsTip = tips.find((t) => /bang/i.test(t.title));
  assert.ok(bangsTip);

  const bookmarkTip = tips.find((t) => /bookmarks/i.test(t.title));
  assert.ok(bookmarkTip);
  assert.ok(bookmarkTip.body.includes('Firefox Containers'), 'Firefox bookmark tip must reference Firefox Containers');

  const items = env.sandbox.HomebaseTipsUI.getEligibleOnboardingItems();
  const containerItem = items.find((i) => /firefox container/i.test(i.text));
  assert.ok(containerItem, 'Firefox onboarding must reference Firefox Containers');
});

// -----------------------------------------------------------------------------
// Test 5: Saved-Index Normalization and Boundary Wrapping
// -----------------------------------------------------------------------------
test('tips-ui: normalizeHomebaseTipIndex handles null, invalid, negative, and wrapping across list size changes', () => {
  const env = createTipsUiEnvironment({ isChromeDefaultSearch: true });
  const normalize = env.sandbox.HomebaseTipsUI.normalizeTipIndex;
  const chromeTips = env.sandbox.HomebaseTipsUI.getEligibleDailyTips();
  const count = chromeTips.length;

  assert.equal(normalize(null, chromeTips), 0);
  assert.equal(normalize(undefined, chromeTips), 0);
  assert.equal(normalize('invalid', chromeTips), 0);
  assert.equal(normalize(-5, chromeTips), 0);
  assert.equal(normalize(0, chromeTips), 0);
  assert.equal(normalize(count - 1, chromeTips), count - 1);
  assert.equal(normalize(count, chromeTips), 0, 'Index equal to count must wrap to 0');
  assert.equal(normalize(count + 2, chromeTips), 2, 'Out of range index must wrap modulo count');

  // Simulating index 6 saved from Firefox (7 tips) loaded into Chrome (6 tips)
  assert.equal(normalize('6', chromeTips), 6 % count);
});

// -----------------------------------------------------------------------------
// Test 6: Next Tip Cycling and LocalStorage Persistence
// -----------------------------------------------------------------------------
test('tips-ui: Next Tip button advances and wraps to 0 at the end of the eligible list', () => {
  const env = createTipsUiEnvironment({
    isChromeDefaultSearch: true,
    localStorageState: {
      homebaseOnboardingDismissed: 'true',
      homebaseTipLastIndex: '0'
    }
  });

  const tipCard = env.registerElement('tip-card', new MockElement('DIV'));
  env.sandbox.HomebaseTipsUI.renderTipOfDay();

  const titleEl = tipCard.querySelector('.homebase-tips-title');
  const actionsEl = tipCard.querySelector('.homebase-tips-actions');
  assert.ok(titleEl);
  assert.ok(actionsEl);

  const nextBtn = actionsEl.children[0];
  assert.ok(nextBtn);

  const eligibleTips = env.sandbox.HomebaseTipsUI.getEligibleDailyTips();
  assert.equal(titleEl.textContent, eligibleTips[0].title);

  // Click next tip
  nextBtn.dispatchEvent({ type: 'click' });
  assert.equal(titleEl.textContent, eligibleTips[1].title);
  assert.equal(env.localStorageData['homebaseTipLastIndex'], '1');

  // Click Next Tip until we reach the last tip
  for (let i = 2; i < eligibleTips.length; i++) {
    nextBtn.dispatchEvent({ type: 'click' });
    assert.equal(titleEl.textContent, eligibleTips[i].title);
    assert.equal(env.localStorageData['homebaseTipLastIndex'], String(i));
  }

  // Next click from last index must wrap around to index 0
  nextBtn.dispatchEvent({ type: 'click' });
  assert.equal(titleEl.textContent, eligibleTips[0].title);
  assert.equal(env.localStorageData['homebaseTipLastIndex'], '0');
});

// -----------------------------------------------------------------------------
// Test 7: Dismissal and Disabled State
// -----------------------------------------------------------------------------
test('tips-ui: renderTipOfDay respects dismissal and disabled-tips flags', () => {
  const env = createTipsUiEnvironment({
    isChromeDefaultSearch: false,
    localStorageState: {
      homebaseOnboardingDismissed: 'true'
    }
  });

  const tipCard = env.registerElement('tip-card', new MockElement('DIV'));
  env.sandbox.HomebaseTipsUI.renderTipOfDay();
  assert.equal(tipCard.hasAttribute('hidden'), false);

  // Dismiss button is third child in actions
  const actionsEl = tipCard.querySelector('.homebase-tips-actions');
  assert.ok(actionsEl);
  const dismissBtn = actionsEl.children[2];
  assert.equal(dismissBtn.textContent, 'Dismiss');
  dismissBtn.dispatchEvent({ type: 'click' });

  assert.ok(env.localStorageData['homebaseTipDismissedDate']);
  assert.equal(tipCard.classList.contains('is-visible'), false);

  // Rerender on the same day -> card stays hidden
  env.sandbox.HomebaseTipsUI.renderTipOfDay();
  assert.equal(tipCard.classList.contains('is-visible'), false);
});

// -----------------------------------------------------------------------------
// Test 8: Settings Pro Tips with Live src/tips.js
// -----------------------------------------------------------------------------
test('settings-pro-tips: respects capabilities for Chrome default-search, Edge, and Firefox', () => {
  function createSettingsEnv({ isChrome = false, hasContainers = false }) {
    const doc = {
      createElement(tag) { return new MockElement(tag); },
      getElementById() { return null; }
    };

    const browserMock = hasContainers ? { contextualIdentities: {} } : {};
    const sandbox = {
      window: null,
      document: doc,
      browser: browserMock,
      chrome: browserMock,
      isBrowserDefaultSearch: () => isChrome,
      HOMEBASE_TIPS: [],
      console,
      setTimeout,
      clearTimeout
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    // Load live tips.js first
    vm.runInContext(tipsDataScriptCode, ctx);
    // Load settings-content-sections.js
    vm.runInContext(contentSectionsScriptCode, ctx);

    return sandbox.HomebaseSettingsContentSections.getFilteredProTips();
  }

  // Chrome test
  const chromeTips = createSettingsEnv({ isChrome: true, hasContainers: false });
  assert.equal(chromeTips.some((t) => t.id === 'bang-search'), false, 'Chrome Pro Tips must exclude bang-search');
  assert.equal(chromeTips.some((t) => t.id === 'search-engines-tidy'), false, 'Chrome Pro Tips must exclude search-engines-tidy');
  assert.equal(chromeTips.some((t) => t.id === 'remember-search-engine'), false, 'Chrome Pro Tips must exclude remember-search-engine');
  assert.equal(chromeTips.some((t) => t.id === 'containers'), false, 'Chrome Pro Tips must exclude containers');
  assert.ok(chromeTips.some((t) => t.id === 'browser-default-search'), 'Chrome Pro Tips must include browser-default-search');

  // Edge test
  const edgeTips = createSettingsEnv({ isChrome: false, hasContainers: false });
  assert.ok(edgeTips.some((t) => t.id === 'bang-search'), 'Edge Pro Tips must include bang-search');
  assert.ok(edgeTips.some((t) => t.id === 'search-engines-tidy'), 'Edge Pro Tips must include search-engines-tidy');
  assert.equal(edgeTips.some((t) => t.id === 'browser-default-search'), false, 'Edge Pro Tips must exclude browser-default-search');
  assert.equal(edgeTips.some((t) => t.id === 'containers'), false, 'Edge Pro Tips must exclude containers');

  // Firefox test
  const firefoxTips = createSettingsEnv({ isChrome: false, hasContainers: true });
  assert.ok(firefoxTips.some((t) => t.id === 'bang-search'), 'Firefox Pro Tips must include bang-search');
  assert.ok(firefoxTips.some((t) => t.id === 'search-engines-tidy'), 'Firefox Pro Tips must include search-engines-tidy');
  assert.equal(firefoxTips.some((t) => t.id === 'browser-default-search'), false, 'Firefox Pro Tips must exclude browser-default-search');
  assert.ok(firefoxTips.some((t) => t.id === 'containers'), 'Firefox Pro Tips must include containers when capability is available');
});
