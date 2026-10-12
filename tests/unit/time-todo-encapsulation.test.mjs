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
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null)
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
    createDocumentFragment: () => {
      const children = [];
      return {
        appendChild: (child) => { children.push(child); return child; },
        children,
        childNodes: children
      };
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    console,
    document: documentMock,
    addEventListener: () => {},
    removeEventListener: () => {},
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
    revealWidget: () => {},
    getOrCreateEl,
    timers
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(lifecycleScript, sandbox);

  return { sandbox, timers, getOrCreateEl };
}

// ===============================================
// --- TIME WIDGET ENCAPSULATION TESTS ---
// ===============================================

test('Time: strict IIFE encapsulates private state without global scope leakage', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(timeScript, sandbox);

  // Private variables must NOT leak into the global sandbox
  assert.strictEqual(sandbox.timeFormatPreference, undefined, 'timeFormatPreference must be private to IIFE');
  assert.strictEqual(sandbox.timeIntervalId, undefined, 'timeIntervalId must be private to IIFE');
  assert.strictEqual(sandbox.timeInitialized, undefined, 'timeInitialized must be private to IIFE');
  assert.strictEqual(sandbox.domElements, undefined, 'domElements must be private to IIFE');
});

test('Time: canonical HomebaseWidgetTime export and backwards compatibility aliases exist', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(timeScript, sandbox);

  const canonical = sandbox.HomebaseWidgetTime;
  assert.ok(canonical, 'window.HomebaseWidgetTime must exist');
  assert.strictEqual(typeof canonical.initialize, 'function');
  assert.strictEqual(typeof canonical.init, 'function');
  assert.strictEqual(typeof canonical.destroy, 'function');
  assert.strictEqual(typeof canonical.onShow, 'function');
  assert.strictEqual(typeof canonical.onHide, 'function');
  assert.strictEqual(typeof canonical.pause, 'function');
  assert.strictEqual(typeof canonical.resume, 'function');

  // Compatibility alias
  assert.strictEqual(sandbox.HomebaseTimeWidgetController, canonical, 'HomebaseTimeWidgetController must equal HomebaseWidgetTime');

  // Global helper functions
  assert.strictEqual(typeof sandbox.updateTime, 'function');
  assert.strictEqual(typeof sandbox.applyTimeFormatPreference, 'function');
  assert.strictEqual(typeof sandbox.setTimeFormatPreference, 'function');
});

test('Time: automatically registers with HomebaseWidgetLifecycle', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(timeScript, sandbox);

  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('time');
  assert.ok(reg, 'time widget must be registered in HomebaseWidgetLifecycle');
  assert.strictEqual(reg.controller, sandbox.HomebaseWidgetTime);
});

test('Time: interval pause and resume behavior handles timer safely without duplication', () => {
  const { sandbox, timers } = setupTestEnvironment();
  vm.runInContext(timeScript, sandbox);

  const controller = sandbox.HomebaseWidgetTime;
  assert.strictEqual(timers.intervals.size, 0);

  // Initialize starts interval
  controller.initialize();
  assert.strictEqual(timers.intervals.size, 1);

  // Pause clears interval
  controller.pause();
  assert.strictEqual(timers.intervals.size, 0, 'pause must clear interval');

  // Resume restarts interval
  controller.resume();
  assert.strictEqual(timers.intervals.size, 1, 'resume must restart interval');

  // Repeated resume does not create duplicate interval
  controller.resume();
  assert.strictEqual(timers.intervals.size, 1, 'duplicate resume must not duplicate interval');

  controller.destroy();
  assert.strictEqual(timers.intervals.size, 0);
});

test('Time: destroy is idempotent and supports subsequent re-initialization', () => {
  const { sandbox, timers } = setupTestEnvironment();
  vm.runInContext(timeScript, sandbox);

  const controller = sandbox.HomebaseWidgetTime;
  controller.initialize();
  assert.strictEqual(timers.intervals.size, 1);

  // First destroy
  assert.doesNotThrow(() => controller.destroy());
  assert.strictEqual(timers.intervals.size, 0);

  // Idempotent second destroy
  assert.doesNotThrow(() => controller.destroy());
  assert.strictEqual(timers.intervals.size, 0);

  // Re-initialization succeeds
  assert.doesNotThrow(() => controller.initialize());
  assert.strictEqual(timers.intervals.size, 1);
  controller.destroy();
});

test('Time: lazy DOM resolution caches elements on initialize and resets on destroy', () => {
  const { sandbox, getOrCreateEl } = setupTestEnvironment();
  const timeEl = getOrCreateEl('current-time');
  const dateEl = getOrCreateEl('current-date');

  vm.runInContext(timeScript, sandbox);

  sandbox.HomebaseWidgetTime.initialize();
  assert.ok(timeEl.textContent.length > 0, 'time text must be populated');
  assert.ok(dateEl.textContent.length > 0, 'date text must be populated');

  sandbox.HomebaseWidgetTime.destroy();
});

// ===============================================
// --- TODO WIDGET ENCAPSULATION TESTS ---
// ===============================================

test('Todo: strict IIFE encapsulates private state without global scope leakage', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(todoScript, sandbox);

  // Private state must NOT leak into the global sandbox
  assert.strictEqual(sandbox.TODO_ITEMS_KEY, undefined, 'TODO_ITEMS_KEY must be private to IIFE');
  assert.strictEqual(sandbox.TODO_HIDE_DONE_KEY, undefined, 'TODO_HIDE_DONE_KEY must be private to IIFE');
  assert.strictEqual(sandbox.todoItems, undefined, 'todoItems must be private to IIFE');
  assert.strictEqual(sandbox.todoHideDone, undefined, 'todoHideDone must be private to IIFE');
  assert.strictEqual(sandbox.todoListenerRegistry, undefined, 'todoListenerRegistry must be private to IIFE');
  assert.strictEqual(sandbox.todoInitialized, undefined, 'todoInitialized must be private to IIFE');
  assert.strictEqual(sandbox.domElements, undefined, 'domElements must be private to IIFE');
});

test('Todo: canonical HomebaseWidgetTodo export and backwards compatibility aliases exist', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(todoScript, sandbox);

  const canonical = sandbox.HomebaseWidgetTodo;
  assert.ok(canonical, 'window.HomebaseWidgetTodo must exist');
  assert.strictEqual(typeof canonical.initialize, 'function');
  assert.strictEqual(typeof canonical.init, 'function');
  assert.strictEqual(typeof canonical.destroy, 'function');
  assert.strictEqual(typeof canonical.onShow, 'function');
  assert.strictEqual(typeof canonical.onHide, 'function');
  assert.strictEqual(typeof canonical.pause, 'function');
  assert.strictEqual(typeof canonical.resume, 'function');

  // Compatibility alias
  assert.strictEqual(sandbox.HomebaseTodoWidgetController, canonical, 'HomebaseTodoWidgetController must equal HomebaseWidgetTodo');

  // Global helper functions
  assert.strictEqual(typeof sandbox.setupTodoWidget, 'function');
  assert.strictEqual(typeof sandbox.setTodoPreference, 'function');
  assert.strictEqual(typeof sandbox.handleTodoStorageChange, 'function');
  assert.strictEqual(typeof sandbox.persistTodoState, 'function');
  assert.strictEqual(typeof sandbox.loadTodoState, 'function');
  assert.strictEqual(typeof sandbox.normalizeTodoItems, 'function');
});

test('Todo: automatically registers with HomebaseWidgetLifecycle', () => {
  const { sandbox } = setupTestEnvironment();
  vm.runInContext(todoScript, sandbox);

  const reg = sandbox.HomebaseWidgetLifecycle.getWidget('todo');
  assert.ok(reg, 'todo widget must be registered in HomebaseWidgetLifecycle');
  assert.strictEqual(reg.controller, sandbox.HomebaseWidgetTodo);
});

test('Todo: persistence exclusively delegates through HomebaseWidgetStorage', async () => {
  const { sandbox } = setupTestEnvironment();

  let setTodoStateCalled = false;
  let getTodoStateCalled = false;
  let passedState = null;

  sandbox.HomebaseWidgetStorage = {
    setTodoState: async (state) => {
      setTodoStateCalled = true;
      passedState = state;
      return state;
    },
    getTodoState: async () => {
      getTodoStateCalled = true;
      return { items: [{ id: 't1', text: 'Task 1', done: false }], hideDone: true };
    },
    setFastMirror: () => {}
  };

  vm.runInContext(todoScript, sandbox);

  // Test loadTodoState
  await sandbox.loadTodoState();
  assert.strictEqual(getTodoStateCalled, true, 'loadTodoState must delegate to HomebaseWidgetStorage.getTodoState');

  // Test persistTodoState
  sandbox.persistTodoState();
  assert.strictEqual(setTodoStateCalled, true, 'persistTodoState must delegate to HomebaseWidgetStorage.setTodoState');
  assert.ok(passedState, 'passed state must be provided to setTodoState');
  assert.strictEqual(passedState.items.length, 1);
  assert.strictEqual(passedState.hideDone, true);
});

test('Todo: destroy cleans up listener registry, resets initialized state, and is idempotent', async () => {
  const { sandbox, getOrCreateEl } = setupTestEnvironment();
  getOrCreateEl('widget-todo');
  getOrCreateEl('todo-list');
  getOrCreateEl('todo-input');
  const addBtn = getOrCreateEl('todo-add-btn');
  const clearBtn = getOrCreateEl('todo-clear-btn');

  sandbox.HomebaseWidgetStorage = {
    getTodoState: async () => ({ items: [], hideDone: false })
  };

  vm.runInContext(todoScript, sandbox);
  const controller = sandbox.HomebaseWidgetTodo;

  // Initialize attaches listeners
  await controller.initialize();
  assert.strictEqual(addBtn._getListenerCount('click'), 1);
  assert.strictEqual(clearBtn._getListenerCount('click'), 1);

  // Destroy removes all listeners
  controller.destroy();
  assert.strictEqual(addBtn._getListenerCount('click'), 0, 'destroy must clean up click listener');
  assert.strictEqual(clearBtn._getListenerCount('click'), 0, 'destroy must clean up clear listener');

  // Calling destroy again is safe and does not throw
  assert.doesNotThrow(() => controller.destroy());

  // Can re-initialize after destroy
  await controller.initialize();
  assert.strictEqual(addBtn._getListenerCount('click'), 1, 're-initialization attaches listeners again');

  // Repeated initialize() does not duplicate listeners
  await controller.initialize();
  await controller.initialize();
  assert.strictEqual(addBtn._getListenerCount('click'), 1, 'repeated initialize() must not duplicate click listeners');
  assert.strictEqual(clearBtn._getListenerCount('click'), 1, 'repeated initialize() must not duplicate clear listeners');

  controller.destroy();
});

