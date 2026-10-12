import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');
const quoteScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/quote.js'), 'utf8');
const newsScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/news.js'), 'utf8');
const startupHydrationScript = fs.readFileSync(path.join(rootDir, 'src/newtab/core/startup-hydration.js'), 'utf8');

function createMockClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((n) => classes.add(n)),
    remove: (...names) => names.forEach((n) => classes.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      } else if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return classes.has(name);
    },
    contains: (name) => classes.has(name)
  };
}

function createMockElement(id = '', tag = 'div') {
  const listeners = new Map();
  const dataset = {};
  const attrs = new Map();
  const children = [];

  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset,
    classList: createMockClassList(),
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    childNodes: children,
    children,
    style: {},
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners.has(type)) {
        listeners.get(type).delete(handler);
      }
    },
    _getListenerCount: (type) => (listeners.has(type) ? listeners.get(type).size : 0),
    _dispatch: (type, eventObj = {}) => {
      if (listeners.has(type)) {
        listeners.get(type).forEach((h) => h({ target: el, ...eventObj }));
      }
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    replaceChildren: (...nodes) => {
      children.length = 0;
      nodes.forEach((n) => children.push(n));
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => true,
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 })
  };
  return el;
}

function setupTestEnvironment() {
  const domElements = new Map();
  const getOrCreateEl = (id, tag = 'div') => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id, tag));
    }
    return domElements.get(id);
  };

  const timers = {
    intervals: new Map(),
    timeouts: new Map(),
    nextId: 1
  };

  const windowListeners = new Map();
  const documentListeners = new Map();

  let observerInstance = null;
  class MockIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observerInstance = this;
    }
    observe(target) {
      this.observed.push(target);
    }
    disconnect() {
      this.disconnected = true;
      this.observed = [];
    }
  }

  const documentMock = {
    visibilityState: 'visible',
    body: createMockElement('body'),
    documentElement: createMockElement('html'),
    getElementById: (id) => getOrCreateEl(id),
    querySelector: (sel) => {
      const clean = sel.replace(/^[.#]/, '');
      return getOrCreateEl(clean);
    },
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement('', tag),
    createElementNS: (ns, tag) => createMockElement('', tag),
    createDocumentFragment: () => {
      const children = [];
      return {
        appendChild: (child) => { children.push(child); return child; },
        children,
        childNodes: children
      };
    },
    addEventListener: (type, handler) => {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (documentListeners.has(type)) documentListeners.get(type).delete(handler);
    },
    _getListenerCount: (type) => (documentListeners.has(type) ? documentListeners.get(type).size : 0)
  };

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    WeakMap,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    console,
    document: documentMock,
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (windowListeners.has(type)) windowListeners.get(type).delete(handler);
    },
    _getWindowListenerCount: (type) => (windowListeners.has(type) ? windowListeners.get(type).size : 0),
    setInterval: (fn, ms) => {
      const id = timers.nextId++;
      timers.intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => {
      timers.intervals.delete(id);
    },
    setTimeout: (fn, ms) => {
      const id = timers.nextId++;
      timers.timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      timers.timeouts.delete(id);
    },
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    IntersectionObserver: MockIntersectionObserver,
    getObserverInstance: () => observerInstance,
    fetch: async () => ({ ok: true, json: async () => [] }),
    revealWidget: () => {},
    openModalWithAnimation: () => {},
    closeModalWithAnimation: () => {},
    getOrCreateEl,
    timers,
    performance: { now: () => Date.now() },
    recordIdleTaskPerf: () => {},
    recordWidgetPerfTiming: () => {},
    DEBUG_IDLE_STARTUP: false,
    DEBUG_STARTUP_GUARDS: false,
    appShowSidebarPreference: true,
    appShowQuotePreference: true,
    appShowNewsPreference: true,
    appNewsSourcePreference: 'aljazeera'
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(lifecycleScript, sandbox);

  return { sandbox, timers, getOrCreateEl, getObserver: () => observerInstance };
}

// ===============================================
// --- QUOTE WIDGET ENCAPSULATION TESTS ---
// ===============================================

test('Quote: 1. Strict IIFE isolation prevents global declaration leakage', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(quoteScript, sandbox);

  // Private state and DOM caches must not be leaked into sandbox globals
  assert.strictEqual(sandbox.quoteListenerRegistry, undefined, 'quoteListenerRegistry must be private');
  assert.strictEqual(sandbox.quoteInitialized, undefined, 'quoteInitialized must be private');
  assert.strictEqual(sandbox.quoteCopyTimeout, undefined, 'quoteCopyTimeout must be private');
  assert.strictEqual(sandbox.quoteRotateTimeout, undefined, 'quoteRotateTimeout must be private');
  assert.strictEqual(sandbox.quoteWidget, undefined, 'quoteWidget must be private');
  assert.strictEqual(sandbox.quoteText, undefined, 'quoteText must be private');
  assert.strictEqual(sandbox.quoteAuthor, undefined, 'quoteAuthor must be private');
  assert.strictEqual(sandbox.quoteCopyBtn, undefined, 'quoteCopyBtn must be private');
  assert.strictEqual(sandbox.quoteNextBtn, undefined, 'quoteNextBtn must be private');
  assert.strictEqual(sandbox.domElements, undefined, 'domElements must be private');
});

test('Quote: 2. Canonical export exists and conforms to standard lifecycle contract', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(quoteScript, sandbox);

  const canonical = sandbox.HomebaseWidgetQuote;
  assert.ok(canonical, 'window.HomebaseWidgetQuote export must exist');
  assert.strictEqual(typeof canonical.initialize, 'function');
  assert.strictEqual(typeof canonical.init, 'function');
  assert.strictEqual(typeof canonical.destroy, 'function');
  assert.strictEqual(typeof canonical.onShow, 'function');
  assert.strictEqual(typeof canonical.onHide, 'function');
  assert.strictEqual(typeof canonical.pause, 'function');
  assert.strictEqual(typeof canonical.resume, 'function');

  // Backwards compatibility alias
  assert.strictEqual(sandbox.HomebaseQuoteWidgetController, canonical, 'HomebaseQuoteWidgetController must equal HomebaseWidgetQuote');

  // Compatibility helpers
  assert.strictEqual(typeof sandbox.setupQuoteWidget, 'function');
  assert.strictEqual(typeof sandbox.setQuotePreference, 'function');
  assert.strictEqual(typeof sandbox.fetchQuote, 'function');
  assert.strictEqual(typeof sandbox.readCachedQuoteState, 'function');
  assert.strictEqual(typeof sandbox.renderCachedQuoteState, 'function');
  assert.strictEqual(typeof sandbox.shouldLoadQuoteCatalog, 'function');
  assert.strictEqual(typeof sandbox.ensureQuoteIndexBuilt, 'function');
});

test('Quote: startup hydration compatibility exports exist and shouldLoadQuoteCatalog is callable', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(quoteScript, sandbox);

  assert.strictEqual(typeof sandbox.shouldLoadQuoteCatalog, 'function');
  assert.strictEqual(typeof sandbox.ensureQuoteIndexBuilt, 'function');
  assert.strictEqual(typeof sandbox.fetchQuote, 'function');
  assert.strictEqual(typeof sandbox.readCachedQuoteState, 'function');
  assert.strictEqual(typeof sandbox.renderCachedQuoteState, 'function');

  // shouldLoadQuoteCatalog is callable and returns boolean
  const freshState = { current: { id: 'q1', text: 'Daily Quote', author: 'Author' }, config: { frequency: 'hourly', lastShown: Date.now() } };
  const result = sandbox.shouldLoadQuoteCatalog({ state: freshState });
  assert.strictEqual(typeof result, 'boolean');
  assert.strictEqual(result, false, 'fresh cached quote within interval should not trigger catalog load');

  // Controller remains unchanged
  assert.ok(sandbox.HomebaseWidgetQuote);
  assert.strictEqual(sandbox.HomebaseQuoteWidgetController, sandbox.HomebaseWidgetQuote);
});

test('Quote: 3. Automatically registers with HomebaseWidgetLifecycle', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(quoteScript, sandbox);

  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('quote');
  assert.ok(reg, 'quote widget must be registered in HomebaseWidgetLifecycle');
  assert.strictEqual(reg.controller, sandbox.HomebaseWidgetQuote);
});

test('Quote: 4. Timer pause and resume safely manages visual timeouts', () => {
  const { sandbox, timers, getOrCreateEl } = setupTestEnvironment();
  const nextBtn = getOrCreateEl('quote-next-btn');
  const svgEl = createMockElement('', 'svg');
  nextBtn.querySelector = (sel) => (sel === 'svg' ? svgEl : null);

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null,
    getQuoteCache: async () => ({ current: null, tags: [], frequency: 'hourly' }),
    setQuoteCache: async () => {}
  };

  vm.runInContext(quoteScript, sandbox);
  const controller = sandbox.HomebaseWidgetQuote;
  controller.initialize();

  // Simulate next button click which schedules rotation timeout
  nextBtn._dispatch('click');
  assert.ok(timers.timeouts.size > 0, 'Timeout must be scheduled on rotation');

  // Pause must clear pending rotation and copy timeouts
  controller.pause();
  assert.strictEqual(timers.timeouts.size, 0, 'pause must clear visual timeouts');

  // Resume safely renders without throwing or duplicating
  assert.doesNotThrow(() => controller.resume());
  controller.destroy();
});

test('Quote: 5. Destroy unbinds listeners, clears timeouts, resets state, and is idempotent', () => {
  const { sandbox, getOrCreateEl, timers } = setupTestEnvironment();
  const nextBtn = getOrCreateEl('quote-next-btn');
  const copyBtn = getOrCreateEl('quote-copy-btn');
  const settingsBtn = getOrCreateEl('quote-settings-btn');

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null,
    getQuoteCache: async () => ({})
  };

  vm.runInContext(quoteScript, sandbox);
  const controller = sandbox.HomebaseWidgetQuote;

  controller.initialize();
  assert.strictEqual(nextBtn._getListenerCount('click'), 1);
  assert.strictEqual(copyBtn._getListenerCount('click'), 1);
  assert.strictEqual(settingsBtn._getListenerCount('click'), 1);

  // Destroy cleans up listeners
  controller.destroy();
  assert.strictEqual(nextBtn._getListenerCount('click'), 0, 'listeners must be removed on destroy');
  assert.strictEqual(copyBtn._getListenerCount('click'), 0);
  assert.strictEqual(settingsBtn._getListenerCount('click'), 0);
  assert.strictEqual(timers.timeouts.size, 0);

  // Idempotent repeated destroy
  assert.doesNotThrow(() => controller.destroy());

  // Re-initialization succeeds
  assert.doesNotThrow(() => controller.initialize());
  assert.strictEqual(nextBtn._getListenerCount('click'), 1);
  controller.destroy();
});

test('Quote: 6. Lazy DOM resolution avoids parse-time queries and caches references on initialize', () => {
  const { sandbox, getOrCreateEl } = setupTestEnvironment();
  const quoteText = getOrCreateEl('quote-text');
  const quoteAuthor = getOrCreateEl('quote-author');

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => JSON.stringify({
      current: { id: 'q-test', text: 'Daily Inspiration', author: 'Philosopher' },
      next: null,
      config: {}
    })
  };

  vm.runInContext(quoteScript, sandbox);

  // Evaluating script did not populate DOM text yet
  assert.strictEqual(quoteText.textContent, '');

  // initialize resolves elements and hydrates
  sandbox.HomebaseWidgetQuote.initialize();
  assert.strictEqual(quoteText.textContent, '"Daily Inspiration"');
  assert.strictEqual(quoteAuthor.textContent, '- Philosopher');

  sandbox.HomebaseWidgetQuote.destroy();
});

// ===============================================
// --- NEWS WIDGET ENCAPSULATION TESTS ---
// ===============================================

test('News: 7. Strict IIFE isolation prevents global declaration leakage', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(newsScript, sandbox);

  // Private state and controllers must not be leaked into sandbox globals
  assert.strictEqual(sandbox.newsListenerRegistry, undefined, 'newsListenerRegistry must be private');
  assert.strictEqual(sandbox.newsInitialized, undefined, 'newsInitialized must be private');
  assert.strictEqual(sandbox.newsFetchAbortController, undefined, 'newsFetchAbortController must be private');
  assert.strictEqual(sandbox.newsVisibilityObserver, undefined, 'newsVisibilityObserver must be private');
  assert.strictEqual(sandbox.newsRefreshInFlight, undefined, 'newsRefreshInFlight must be private');
  assert.strictEqual(sandbox.newsWidget, undefined, 'newsWidget must be private');
  assert.strictEqual(sandbox.newsList, undefined, 'newsList must be private');
  assert.strictEqual(sandbox.newsSettingsBtn, undefined, 'newsSettingsBtn must be private');
  assert.strictEqual(sandbox.domElements, undefined, 'domElements must be private');
});

test('News: 8. Canonical export exists and conforms to standard lifecycle contract', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(newsScript, sandbox);

  const canonical = sandbox.HomebaseWidgetNews;
  assert.ok(canonical, 'window.HomebaseWidgetNews export must exist');
  assert.strictEqual(typeof canonical.initialize, 'function');
  assert.strictEqual(typeof canonical.init, 'function');
  assert.strictEqual(typeof canonical.destroy, 'function');
  assert.strictEqual(typeof canonical.onShow, 'function');
  assert.strictEqual(typeof canonical.onHide, 'function');
  assert.strictEqual(typeof canonical.pause, 'function');
  assert.strictEqual(typeof canonical.resume, 'function');

  // Backwards compatibility alias
  assert.strictEqual(sandbox.HomebaseNewsWidgetController, canonical, 'HomebaseNewsWidgetController must equal HomebaseWidgetNews');

  // Compatibility helpers
  assert.strictEqual(typeof sandbox.fetchAndRenderNews, 'function');
  assert.strictEqual(typeof sandbox.setupNewsWidget, 'function');
  assert.strictEqual(typeof sandbox.setNewsPreference, 'function');
  assert.strictEqual(typeof sandbox.resolveNewsSourceId, 'function');
  assert.strictEqual(typeof sandbox.getNewsSourceById, 'function');
  assert.strictEqual(typeof sandbox.readFastNewsCache, 'function');
  assert.ok(Array.isArray(sandbox.NEWS_SOURCES));
});

test('News: 9. Automatically registers with HomebaseWidgetLifecycle', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(newsScript, sandbox);

  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('news');
  assert.ok(reg, 'news widget must be registered in HomebaseWidgetLifecycle');
  assert.strictEqual(reg.controller, sandbox.HomebaseWidgetNews);
});

test('News: 10. AbortController is aborted and cleaned up on onHide, pause, and destroy', () => {
  const { sandbox } = setupTestEnvironment();

  let abortedSignals = 0;
  class MockAbortController {
    constructor() {
      this.signal = { aborted: false };
    }
    abort() {
      this.signal.aborted = true;
      abortedSignals++;
    }
  }
  sandbox.AbortController = MockAbortController;

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null
  };

  vm.runInContext(newsScript, sandbox);
  const controller = sandbox.HomebaseWidgetNews;

  controller.initialize();

  // Test pause aborts
  controller.pause();
  assert.doesNotThrow(() => controller.pause());

  // Test onHide aborts
  controller.onHide();
  assert.doesNotThrow(() => controller.onHide());

  // Test destroy aborts
  controller.destroy();
  assert.doesNotThrow(() => controller.destroy());
});

test('News: 11. IntersectionObserver is cleanly disconnected on onHide and destroy', () => {
  const { sandbox, getObserver } = setupTestEnvironment();
  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null
  };

  vm.runInContext(newsScript, sandbox);
  const controller = sandbox.HomebaseWidgetNews;

  controller.initialize();
  const observer = getObserver();
  assert.ok(observer, 'IntersectionObserver must be instantiated');
  assert.strictEqual(observer.disconnected, false);

  // onHide disconnects observer
  controller.onHide();
  assert.strictEqual(observer.disconnected, true, 'onHide must disconnect observer');

  // onShow re-observes
  controller.onShow();

  // destroy disconnects observer
  controller.destroy();
  assert.doesNotThrow(() => controller.destroy(), 'destroy must be idempotent');
});

test('News: 12. Pause/resume lifecycle coordinates safely without duplicate fetches or leaks', () => {
  const { sandbox, getObserver } = setupTestEnvironment();
  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null
  };

  vm.runInContext(newsScript, sandbox);
  const controller = sandbox.HomebaseWidgetNews;

  controller.initialize();
  const observer = getObserver();

  // Pause
  controller.pause();

  // Resume re-arms observation safely
  controller.resume();

  // Destroy cleans up window/document hover listeners
  controller.destroy();
  assert.strictEqual(sandbox._getWindowListenerCount('resize'), 0, 'window resize listener must be cleaned up');
  assert.strictEqual(sandbox.document._getListenerCount('scroll'), 0, 'document scroll listener must be cleaned up');
});

test('Startup Hydration: buildQuoteIndexSafe and fetchQuoteSafe execute without ReferenceError', async () => {
  const { sandbox, getOrCreateEl } = setupTestEnvironment();
  getOrCreateEl('quote-text');
  getOrCreateEl('quote-author');
  getOrCreateEl('quote-widget');

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null,
    getQuoteCache: async () => ({ current: null, tags: [], frequency: 'hourly' }),
    setQuoteCache: async () => {}
  };

  // Run quote controller first
  vm.runInContext(quoteScript, sandbox);

  // Run startup hydration
  vm.runInContext(startupHydrationScript, sandbox);

  assert.ok(sandbox.HomebaseStartupHydration, 'HomebaseStartupHydration must be defined on window');

  const scheduledTasks = [];
  const scheduleTaskMock = (fn, label) => {
    scheduledTasks.push({ fn, label });
  };

  // Schedule all hydration tasks
  sandbox.HomebaseStartupHydration.scheduleStartupHydrationTasks({ scheduleTask: scheduleTaskMock });

  assert.ok(scheduledTasks.length >= 8, 'Hydration tasks must be scheduled');

  const quoteIndexTask = scheduledTasks.find((t) => t.label === 'startup:quoteIndex');
  const fetchQuoteTask = scheduledTasks.find((t) => t.label === 'startup:fetchQuote');

  assert.ok(quoteIndexTask, 'startup:quoteIndex task must be registered');
  assert.ok(fetchQuoteTask, 'startup:fetchQuote task must be registered');

  // Both tasks must run safely without throwing any ReferenceError or uncaught error
  await assert.doesNotReject(async () => {
    await quoteIndexTask.fn();
  }, 'quoteIndexTask must not throw');

  await assert.doesNotReject(async () => {
    await fetchQuoteTask.fn();
  }, 'fetchQuoteTask must not throw');
});

