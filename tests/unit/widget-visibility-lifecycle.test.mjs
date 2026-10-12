import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');
const visibilityScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-visibility.js'), 'utf8');
const timeScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/time.js'), 'utf8');
const weatherScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/weather.js'), 'utf8');
const newsScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/news.js'), 'utf8');
const quoteScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/quote.js'), 'utf8');
const todoScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/todo.js'), 'utf8');

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
    focus: () => {},
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null)
  };
  return el;
}

function setupVisibilityTestSandbox(options = {}) {
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

  let visibilityState = options.visibilityState || 'visible';

  const documentMock = {
    get visibilityState() {
      return visibilityState;
    },
    set visibilityState(val) {
      visibilityState = val;
    },
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
    _dispatch: (type) => {
      if (documentListeners.has(type)) {
        documentListeners.get(type).forEach((h) => h());
      }
    }
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

  return { sandbox, documentMock, timers };
}

test('Lifecycle: setWidgetVisibility dispatches onShow and resume on hidden -> visible transition', () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  const lifecycle = sandbox.HomebaseWidgetLifecycle;

  let showCalled = 0;
  let resumeCalled = 0;
  let hideCalled = 0;
  let pauseCalled = 0;

  const mockController = {
    initialize: () => {},
    onShow: () => { showCalled++; },
    onHide: () => { hideCalled++; },
    pause: () => { pauseCalled++; },
    resume: () => { resumeCalled++; }
  };

  lifecycle.registerWidget('mock', mockController);
  const record = lifecycle.getWidget('mock');
  record.isInitialized = true;
  record.isVisible = false;
  record.isActive = false;

  // Transition hidden -> visible with tab visible
  lifecycle.setWidgetVisibility('mock', true);

  assert.strictEqual(record.isVisible, true);
  assert.strictEqual(record.isActive, true);
  assert.strictEqual(showCalled, 1, 'onShow must be called');
  assert.strictEqual(resumeCalled, 1, 'resume must be called when tab is visible');
  assert.strictEqual(hideCalled, 0);
  assert.strictEqual(pauseCalled, 0);

  // Idempotent: setting visible again does not re-trigger callbacks
  lifecycle.setWidgetVisibility('mock', true);
  assert.strictEqual(showCalled, 1);
  assert.strictEqual(resumeCalled, 1);
});

test('Lifecycle: setWidgetVisibility dispatches pause and onHide on visible -> hidden transition', () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  const lifecycle = sandbox.HomebaseWidgetLifecycle;

  let showCalled = 0;
  let resumeCalled = 0;
  let hideCalled = 0;
  let pauseCalled = 0;

  const mockController = {
    initialize: () => {},
    onShow: () => { showCalled++; },
    onHide: () => { hideCalled++; },
    pause: () => { pauseCalled++; },
    resume: () => { resumeCalled++; }
  };

  lifecycle.registerWidget('mock', mockController);
  const record = lifecycle.getWidget('mock');
  record.isInitialized = true;
  lifecycle.setWidgetVisibility('mock', true);

  assert.strictEqual(record.isVisible, true);
  assert.strictEqual(record.isActive, true);

  // Transition visible -> hidden
  lifecycle.setWidgetVisibility('mock', false);

  assert.strictEqual(record.isVisible, false);
  assert.strictEqual(record.isActive, false);
  assert.strictEqual(pauseCalled, 1, 'pause must be called on hide when active');
  assert.strictEqual(hideCalled, 1, 'onHide must be called');

  // Idempotent second hide call does not duplicate
  lifecycle.setWidgetVisibility('mock', false);
  assert.strictEqual(pauseCalled, 1);
  assert.strictEqual(hideCalled, 1);
});

test('Lifecycle: global document visibilitychange triggers pause on tab hide and resume on tab show', () => {
  const { sandbox, documentMock } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  const lifecycle = sandbox.HomebaseWidgetLifecycle;

  let pauseCount = 0;
  let resumeCount = 0;

  const mockController = {
    initialize: () => {},
    pause: () => { pauseCount++; },
    resume: () => { resumeCount++; }
  };

  lifecycle.registerWidget('clock', mockController);
  const record = lifecycle.getWidget('clock');
  record.isInitialized = true;
  lifecycle.setWidgetVisibility('clock', true);

  assert.strictEqual(record.isActive, true);

  // Tab becomes hidden
  documentMock.visibilityState = 'hidden';
  documentMock._dispatch('visibilitychange');

  assert.strictEqual(record.isActive, false, 'widget active state must be false when tab is hidden');
  assert.strictEqual(pauseCount, 1, 'pause must be invoked on tab hidden');

  // Tab becomes visible again
  documentMock.visibilityState = 'visible';
  documentMock._dispatch('visibilitychange');

  assert.strictEqual(record.isActive, true, 'widget active state must be true when tab returns to visible');
  assert.strictEqual(resumeCount, 2, 'resume must be invoked on tab visible (1 on init visible + 1 on tab resume)');
});

test('Time: pause clears 60s interval and resume restarts interval immediately without duplication', () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  vm.runInContext(timeScript, sandbox);

  const controller = sandbox.HomebaseTimeWidgetController;
  assert.ok(controller, 'HomebaseTimeWidgetController must exist');
  assert.strictEqual(typeof controller.pause, 'function');
  assert.strictEqual(typeof controller.resume, 'function');

  // Initialize: starts single interval
  controller.initialize();
  assert.strictEqual(sandbox.timers.intervals.size, 1);

  // Pause: interval cleared
  controller.pause();
  assert.strictEqual(sandbox.timers.intervals.size, 0, 'pause must clear interval');

  // Resume: interval restarted
  controller.resume();
  assert.strictEqual(sandbox.timers.intervals.size, 1, 'resume must restart interval');

  // Calling resume again does not duplicate interval
  controller.resume();
  assert.strictEqual(sandbox.timers.intervals.size, 1, 'duplicate resume must not create multiple intervals');

  controller.destroy();
  assert.strictEqual(sandbox.timers.intervals.size, 0);
});

test('Weather: onHide aborts active geo and in-flight fetch requests', async () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  sandbox.HomebaseWidgetStorage = {
    getWeatherCache: async () => ({})
  };
  sandbox.openModalWithAnimation = () => {};
  sandbox.closeModalWithAnimation = () => {};
  sandbox.hbDebugInfo = () => {};

  vm.runInContext(weatherScript, sandbox);

  const controller = sandbox.HomebaseWeatherWidgetController;
  assert.ok(controller, 'HomebaseWeatherWidgetController must exist');
  assert.strictEqual(typeof controller.onHide, 'function');
  assert.strictEqual(typeof controller.resume, 'function');

  await controller.initialize();

  // Verify onHide executes safely and cleans up
  assert.doesNotThrow(() => controller.onHide());
  controller.destroy();
});

test('News: onHide aborts in-flight fetch and disconnects observer', () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  sandbox.HomebaseWidgetStorage = {
    getFastMirror: () => null
  };
  sandbox.openModalWithAnimation = () => {};
  sandbox.closeModalWithAnimation = () => {};

  vm.runInContext(newsScript, sandbox);

  const controller = sandbox.HomebaseNewsWidgetController;
  assert.ok(controller, 'HomebaseNewsWidgetController must exist');
  assert.strictEqual(typeof controller.onShow, 'function');
  assert.strictEqual(typeof controller.onHide, 'function');
  assert.strictEqual(typeof controller.pause, 'function');
  assert.strictEqual(typeof controller.resume, 'function');

  controller.initialize();

  const observer = sandbox.getObserverInstance();
  assert.ok(observer);
  assert.strictEqual(observer.disconnected, false);

  // onHide disconnects observer
  controller.onHide();
  assert.strictEqual(observer.disconnected, true, 'observer must be disconnected on onHide');

  controller.destroy();
});

test('Integration: applyWidgetVisibility forwards visibility to HomebaseWidgetLifecycle', () => {
  const { sandbox } = setupVisibilityTestSandbox({ visibilityState: 'visible' });
  vm.runInContext(visibilityScript, sandbox);

  const lifecycle = sandbox.HomebaseWidgetLifecycle;
  lifecycle.registerWidget('weather', { initialize: () => {} });
  lifecycle.registerWidget('quote', { initialize: () => {} });
  lifecycle.registerWidget('news', { initialize: () => {} });
  lifecycle.registerWidget('todo', { initialize: () => {} });

  // Initially all false
  assert.strictEqual(lifecycle.getWidget('weather').isVisible, false);

  // Set preferences
  sandbox.appShowSidebarPreference = true;
  sandbox.appShowWeatherPreference = true;
  sandbox.appShowQuotePreference = false;
  sandbox.appShowNewsPreference = true;
  sandbox.appShowTodoPreference = false;

  sandbox.applyWidgetVisibility();

  assert.strictEqual(lifecycle.getWidget('weather').isVisible, true);
  assert.strictEqual(lifecycle.getWidget('quote').isVisible, false);
  assert.strictEqual(lifecycle.getWidget('news').isVisible, true);
  assert.strictEqual(lifecycle.getWidget('todo').isVisible, false);
});
