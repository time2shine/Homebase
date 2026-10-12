import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');
const timeScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/time.js'), 'utf8');
const todoScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/todo.js'), 'utf8');
const quoteScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/quote.js'), 'utf8');
const weatherScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/weather.js'), 'utf8');
const newsScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/news.js'), 'utf8');

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
    style: {},
    addEventListener: (type, handler, options) => {
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
    focus: () => {},
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null)
  };
  return el;
}

function setupBaseSandbox() {
  const domElements = new Map();
  const getOrCreateEl = (id, tag = 'div') => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id, tag));
    }
    return domElements.get(id);
  };

  const windowListeners = new Map();
  const documentListeners = new Map();

  const timers = {
    intervals: new Map(),
    timeouts: new Map(),
    nextId: 1
  };

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
    createTextNode: (text) => ({ textContent: text }),
    addEventListener: (type, handler) => {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (documentListeners.has(type)) documentListeners.get(type).delete(handler);
    },
    _getListenerCount: (type) => (documentListeners.has(type) ? documentListeners.get(type).size : 0)
  };

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

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    WeakMap,
    String,
    Number,
    Boolean,
    Promise,
    Date,
    Math,
    JSON,
    TypeError,
    Error,
    revealWidget: () => {},
    appShowSidebarPreference: true,
    appShowWeatherPreference: true,
    appShowQuotePreference: true,
    appShowTodoPreference: true,
    appShowNewsPreference: true,
    document: documentMock,
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (windowListeners.has(type)) windowListeners.get(type).delete(handler);
    },
    _getListenerCount: (type) => (windowListeners.has(type) ? windowListeners.get(type).size : 0),
    navigator: {
      clipboard: {
        writeText: async () => {}
      },
      onLine: true
    },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    IntersectionObserver: MockIntersectionObserver,
    getObserverInstance: () => observerInstance,
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
    getOrCreateEl,
    timers
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(lifecycleScript, sandbox);

  return sandbox;
}

test('Time: HomebaseTimeWidgetController initialize starts interval once, destroy clears it', () => {
  const sandbox = setupBaseSandbox();
  vm.runInContext(timeScript, sandbox);

  const controller = sandbox.HomebaseTimeWidgetController;
  assert.ok(controller, 'HomebaseTimeWidgetController export must exist');
  assert.strictEqual(typeof controller.initialize, 'function');
  assert.strictEqual(typeof controller.destroy, 'function');

  // Verify registered in HomebaseWidgetLifecycle
  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('time');
  assert.ok(reg, 'time widget must be registered in HomebaseWidgetLifecycle');
  assert.strictEqual(reg.controller, controller);

  // Initialize
  assert.strictEqual(sandbox.timers.intervals.size, 0);
  controller.initialize();
  assert.strictEqual(sandbox.timers.intervals.size, 1);

  // Idempotency: initialize second time does not duplicate interval
  controller.initialize();
  assert.strictEqual(sandbox.timers.intervals.size, 1, 'Interval must not duplicate on multiple init calls');

  // Destroy: clears interval
  controller.destroy();
  assert.strictEqual(sandbox.timers.intervals.size, 0, 'Interval must be cleared on destroy');

  // Re-initialize after destroy works
  controller.initialize();
  assert.strictEqual(sandbox.timers.intervals.size, 1);
  controller.destroy();
});

test('Todo: HomebaseTodoWidgetController initialize/destroy lifecycle manages listeners cleanly', async () => {
  const sandbox = setupBaseSandbox();
  // Ensure todo DOM nodes exist
  const todoWidget = sandbox.getOrCreateEl('widget-todo');
  const todoList = sandbox.getOrCreateEl('todo-list');
  const todoInput = sandbox.getOrCreateEl('todo-input');
  const todoAddBtn = sandbox.getOrCreateEl('todo-add-btn');
  const todoFilterAll = sandbox.getOrCreateEl('todo-filter-all');

  sandbox.HomebaseWidgetStorage = {
    getTodoState: async () => ({ items: [], hideDone: false })
  };

  vm.runInContext(todoScript, sandbox);

  const controller = sandbox.HomebaseTodoWidgetController;
  assert.ok(controller, 'HomebaseTodoWidgetController export must exist');

  // Register verification
  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('todo');
  assert.ok(reg, 'todo widget must be registered in HomebaseWidgetLifecycle');

  // Initialize
  await controller.initialize();
  assert.strictEqual(todoAddBtn._getListenerCount('click'), 1);
  assert.strictEqual(todoInput._getListenerCount('keydown'), 1);
  assert.strictEqual(todoFilterAll._getListenerCount('click'), 1);

  // Idempotent second init
  await controller.initialize();
  assert.strictEqual(todoAddBtn._getListenerCount('click'), 1, 'Listeners must not duplicate');

  // Destroy
  controller.destroy();
  assert.strictEqual(todoAddBtn._getListenerCount('click'), 0, 'Listeners must be removed on destroy');
  assert.strictEqual(todoInput._getListenerCount('keydown'), 0);
  assert.strictEqual(todoFilterAll._getListenerCount('click'), 0);
});

test('Quote: HomebaseQuoteWidgetController initialize/destroy manages timers and listeners', async () => {
  const sandbox = setupBaseSandbox();
  const quoteNextBtn = sandbox.getOrCreateEl('quote-next-btn');
  const quoteCopyBtn = sandbox.getOrCreateEl('quote-copy-btn');
  const quoteSettingsBtn = sandbox.getOrCreateEl('quote-settings-btn');
  const quoteSettingsModal = sandbox.getOrCreateEl('quote-settings-modal');

  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null,
    getQuoteCache: async () => ({})
  };
  sandbox.openModalWithAnimation = () => {};
  sandbox.closeModalWithAnimation = () => {};
  sandbox.fetchQuote = () => {};

  vm.runInContext(quoteScript, sandbox);

  const controller = sandbox.HomebaseQuoteWidgetController;
  assert.ok(controller, 'HomebaseQuoteWidgetController export must exist');

  // Register verification
  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('quote');
  assert.ok(reg, 'quote widget must be registered in HomebaseWidgetLifecycle');

  // Initialize
  controller.initialize();
  assert.strictEqual(quoteNextBtn._getListenerCount('click'), 1);
  assert.strictEqual(quoteCopyBtn._getListenerCount('click'), 1);
  assert.strictEqual(quoteSettingsBtn._getListenerCount('click'), 1);

  // Idempotent second init
  controller.initialize();
  assert.strictEqual(quoteNextBtn._getListenerCount('click'), 1, 'Listeners must not duplicate');

  // Destroy
  controller.destroy();
  assert.strictEqual(quoteNextBtn._getListenerCount('click'), 0, 'Listeners must be removed on destroy');
  assert.strictEqual(quoteCopyBtn._getListenerCount('click'), 0);
  assert.strictEqual(quoteSettingsBtn._getListenerCount('click'), 0);
});

test('Weather: HomebaseWeatherWidgetController initialize is idempotent and destroy cleans up', async () => {
  const sandbox = setupBaseSandbox();
  const chooseCityBtn = sandbox.getOrCreateEl('weather-choose-city-btn');
  const refreshBtn = sandbox.getOrCreateEl('weather-refresh-btn');
  const locationInput = sandbox.getOrCreateEl('modal-location-input');
  const settingsModal = sandbox.getOrCreateEl('weather-settings-modal');

  sandbox.HomebaseWidgetStorage = {
    getWeatherCache: async () => ({})
  };
  sandbox.openModalWithAnimation = () => {};
  sandbox.closeModalWithAnimation = () => {};
  sandbox.hbDebugInfo = () => {};

  vm.runInContext(weatherScript, sandbox);

  const controller = sandbox.HomebaseWeatherWidgetController;
  assert.ok(controller, 'HomebaseWeatherWidgetController export must exist');

  // Register verification
  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('weather');
  assert.ok(reg, 'weather widget must be registered in HomebaseWidgetLifecycle');

  // Initialize
  await controller.initialize();
  assert.strictEqual(chooseCityBtn._getListenerCount('click'), 1);
  assert.strictEqual(refreshBtn._getListenerCount('click'), 1);
  assert.strictEqual(locationInput._getListenerCount('input'), 1);

  // Idempotent second init
  await controller.initialize();
  assert.strictEqual(chooseCityBtn._getListenerCount('click'), 1, 'Listeners must not duplicate');

  // Destroy
  controller.destroy();
  assert.strictEqual(chooseCityBtn._getListenerCount('click'), 0, 'Listeners must be removed on destroy');
  assert.strictEqual(refreshBtn._getListenerCount('click'), 0);
  assert.strictEqual(locationInput._getListenerCount('input'), 0);
});

test('News: HomebaseNewsWidgetController removes window/document listeners and disconnects observer on destroy', () => {
  const sandbox = setupBaseSandbox();
  const newsList = sandbox.getOrCreateEl('news-list');
  const newsWidget = sandbox.getOrCreateEl('widget-news');
  const newsSettingsBtn = sandbox.getOrCreateEl('news-settings-btn');
  const newsRefreshBtn = sandbox.getOrCreateEl('news-refresh-btn');

  sandbox.appShowNewsPreference = true;
  sandbox.appShowSidebarPreference = true;
  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null
  };
  sandbox.openModalWithAnimation = () => {};
  sandbox.closeModalWithAnimation = () => {};

  vm.runInContext(newsScript, sandbox);

  const controller = sandbox.HomebaseNewsWidgetController;
  assert.ok(controller, 'HomebaseNewsWidgetController export must exist');

  // Register verification
  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('news');
  assert.ok(reg, 'news widget must be registered in HomebaseWidgetLifecycle');

  // Initialize
  controller.initialize();
  assert.strictEqual(sandbox.window._getListenerCount('resize'), 1, 'window resize listener attached');
  assert.strictEqual(sandbox.document._getListenerCount('scroll'), 1, 'document scroll listener attached');
  assert.strictEqual(newsSettingsBtn._getListenerCount('click'), 1);

  const observer = sandbox.getObserverInstance();
  assert.ok(observer, 'IntersectionObserver must be instantiated');
  assert.strictEqual(observer.disconnected, false);

  // Idempotent second init
  controller.initialize();
  assert.strictEqual(sandbox.window._getListenerCount('resize'), 1);
  assert.strictEqual(sandbox.document._getListenerCount('scroll'), 1);

  // Destroy
  controller.destroy();
  assert.strictEqual(sandbox.window._getListenerCount('resize'), 0, 'window resize listener removed on destroy');
  assert.strictEqual(sandbox.document._getListenerCount('scroll'), 0, 'document scroll listener removed on destroy');
  assert.strictEqual(newsSettingsBtn._getListenerCount('click'), 0);
  assert.strictEqual(observer.disconnected, true, 'IntersectionObserver must be disconnected on destroy');
});
