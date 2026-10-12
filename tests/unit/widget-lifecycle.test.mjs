import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createLifecycleContext(options = {}) {
  const docListeners = new Map();
  const documentMock = {
    visibilityState: options.visibilityState || 'visible',
    addEventListener: (type, handler) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (docListeners.has(type)) {
        docListeners.get(type).delete(handler);
      }
    },
    _dispatch: (type) => {
      if (docListeners.has(type)) {
        docListeners.get(type).forEach((h) => h());
      }
    }
  };

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    TypeError,
    Promise,
    console: {
      warn: () => {},
      log: () => {},
      error: () => {}
    },
    document: documentMock,
    window: {}
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  return {
    lifecycle: sandbox.HomebaseWidgetLifecycle,
    document: documentMock
  };
}

test('widget-lifecycle: exports complete API surface on window.HomebaseWidgetLifecycle', () => {
  const { lifecycle } = createLifecycleContext();
  assert.ok(lifecycle, 'HomebaseWidgetLifecycle export must exist');
  assert.strictEqual(typeof lifecycle.registerWidget, 'function');
  assert.strictEqual(typeof lifecycle.unregisterWidget, 'function');
  assert.strictEqual(typeof lifecycle.getWidget, 'function');
  assert.strictEqual(typeof lifecycle.getAllWidgets, 'function');
  assert.strictEqual(typeof lifecycle.setWidgetVisibility, 'function');
  assert.strictEqual(typeof lifecycle.initializeAll, 'function');
  assert.strictEqual(typeof lifecycle.destroyAll, 'function');
  assert.strictEqual(typeof lifecycle.createListenerRegistry, 'function');
  assert.strictEqual(typeof lifecycle.onVisibilityChange, 'function');
  assert.strictEqual(typeof lifecycle.isTabVisible, 'function');
});

test('widget-lifecycle: registerWidget and unregisterWidget manage registration and call destroy()', () => {
  const { lifecycle } = createLifecycleContext();

  let destroyedCount = 0;
  const mockController = {
    init: () => {},
    destroy: () => {
      destroyedCount++;
    }
  };

  // Register
  const record = lifecycle.registerWidget('testWidget', mockController);
  assert.strictEqual(record.id, 'testWidget');
  assert.strictEqual(record.controller, mockController);
  assert.strictEqual(record.isInitialized, false);
  assert.strictEqual(record.isVisible, false);
  assert.strictEqual(record.isDestroyed, false);

  assert.strictEqual(lifecycle.getWidget('testWidget'), record);
  assert.strictEqual(lifecycle.getAllWidgets().length, 1);

  // Input validation
  assert.throws(() => lifecycle.registerWidget('', mockController), TypeError);
  assert.throws(() => lifecycle.registerWidget(null, mockController), TypeError);
  assert.throws(() => lifecycle.registerWidget('invalid', null), TypeError);

  // Unregister
  const removed = lifecycle.unregisterWidget('testWidget');
  assert.strictEqual(removed, true);
  assert.strictEqual(destroyedCount, 1, 'destroy() must be called on unregister');
  assert.strictEqual(lifecycle.getWidget('testWidget'), null);
  assert.strictEqual(lifecycle.getAllWidgets().length, 0);

  // Unregister unknown
  assert.strictEqual(lifecycle.unregisterWidget('unknown'), false);
});

test('widget-lifecycle: re-registering existing widget calls destroy() on previous controller', () => {
  const { lifecycle } = createLifecycleContext();

  let destroyedFirst = false;
  const firstController = {
    destroy: () => {
      destroyedFirst = true;
    }
  };
  const secondController = { init: () => {} };

  lifecycle.registerWidget('myWidget', firstController);
  lifecycle.registerWidget('myWidget', secondController);

  assert.strictEqual(destroyedFirst, true, 'Replaced controller destroy() must be called');
  assert.strictEqual(lifecycle.getWidget('myWidget').controller, secondController);
});

test('widget-lifecycle: initializeAll is idempotent and handles async and sync controllers', async () => {
  const { lifecycle } = createLifecycleContext();

  let weatherInits = 0;
  let newsInits = 0;
  let quoteInits = 0;

  const weather = {
    init: async () => {
      weatherInits++;
    }
  };
  const news = {
    initialize: () => {
      newsInits++;
    }
  };
  const quote = () => {
    quoteInits++;
  };

  lifecycle.registerWidget('weather', weather);
  lifecycle.registerWidget('news', news);
  lifecycle.registerWidget('quote', quote);

  await lifecycle.initializeAll();

  assert.strictEqual(weatherInits, 1);
  assert.strictEqual(newsInits, 1);
  assert.strictEqual(quoteInits, 1);

  assert.strictEqual(lifecycle.getWidget('weather').isInitialized, true);
  assert.strictEqual(lifecycle.getWidget('news').isInitialized, true);
  assert.strictEqual(lifecycle.getWidget('quote').isInitialized, true);

  // Second invocation must be a no-op (idempotency)
  await lifecycle.initializeAll();

  assert.strictEqual(weatherInits, 1, 'weather init must not be called again');
  assert.strictEqual(newsInits, 1, 'news init must not be called again');
  assert.strictEqual(quoteInits, 1, 'quote init must not be called again');
});

test('widget-lifecycle: initializeAll is fault-tolerant if a widget fails to initialize', async () => {
  const { lifecycle } = createLifecycleContext();

  let okInitialized = false;
  const failingWidget = {
    init: () => {
      throw new Error('Boom');
    }
  };
  const okWidget = {
    init: () => {
      okInitialized = true;
    }
  };

  lifecycle.registerWidget('failing', failingWidget);
  lifecycle.registerWidget('ok', okWidget);

  await lifecycle.initializeAll();

  assert.strictEqual(lifecycle.getWidget('failing').isInitialized, false);
  assert.strictEqual(lifecycle.getWidget('ok').isInitialized, true);
  assert.strictEqual(okInitialized, true);
});

test('widget-lifecycle: destroyAll tears down all widgets and clears the registry', async () => {
  const { lifecycle } = createLifecycleContext();

  let weatherDestroyed = false;
  let newsDestroyed = false;

  lifecycle.registerWidget('weather', {
    init: () => {},
    destroy: () => {
      weatherDestroyed = true;
    }
  });
  lifecycle.registerWidget('news', {
    init: () => {},
    destroy: () => {
      newsDestroyed = true;
    }
  });

  await lifecycle.initializeAll();
  assert.strictEqual(lifecycle.getAllWidgets().length, 2);

  lifecycle.destroyAll();

  assert.strictEqual(weatherDestroyed, true);
  assert.strictEqual(newsDestroyed, true);
  assert.strictEqual(lifecycle.getAllWidgets().length, 0);

  // Calling destroyAll again is a safe no-op
  assert.doesNotThrow(() => lifecycle.destroyAll());
});

test('widget-lifecycle: setWidgetVisibility updates tracked visibility', () => {
  const { lifecycle } = createLifecycleContext();

  lifecycle.registerWidget('todo', { init: () => {} });
  assert.strictEqual(lifecycle.getWidget('todo').isVisible, false);

  lifecycle.setWidgetVisibility('todo', true);
  assert.strictEqual(lifecycle.getWidget('todo').isVisible, true);

  lifecycle.setWidgetVisibility('todo', false);
  assert.strictEqual(lifecycle.getWidget('todo').isVisible, false);
});

test('widget-lifecycle: createListenerRegistry tracks and cleans up listeners cleanly and idempotently', () => {
  const { lifecycle } = createLifecycleContext();
  const registry = lifecycle.createListenerRegistry();

  const elementListeners = new Map();
  const mockElement = {
    addEventListener: (type, handler) => {
      if (!elementListeners.has(type)) elementListeners.set(type, new Set());
      elementListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (elementListeners.has(type)) {
        elementListeners.get(type).delete(handler);
      }
    }
  };

  const onClick1 = () => {};
  const onClick2 = () => {};
  const onHover = () => {};

  registry.on(mockElement, 'click', onClick1);
  registry.on(mockElement, 'click', onClick2);
  registry.on(mockElement, 'mouseenter', onHover);

  assert.strictEqual(registry.count, 3);
  assert.strictEqual(elementListeners.get('click').size, 2);
  assert.strictEqual(elementListeners.get('mouseenter').size, 1);

  // Remove specific listener
  registry.off(mockElement, 'click', onClick1);
  assert.strictEqual(registry.count, 2);
  assert.strictEqual(elementListeners.get('click').size, 1);
  assert.strictEqual(elementListeners.get('click').has(onClick2), true);

  // Remove all
  registry.removeAll();
  assert.strictEqual(registry.count, 0);
  assert.strictEqual(elementListeners.get('click').size, 0);
  assert.strictEqual(elementListeners.get('mouseenter').size, 0);

  // removeAll is idempotent
  assert.doesNotThrow(() => registry.removeAll());
});

test('widget-lifecycle: onVisibilityChange and isTabVisible coordinate document visibility', () => {
  const { lifecycle, document } = createLifecycleContext({ visibilityState: 'visible' });

  assert.strictEqual(lifecycle.isTabVisible(), true);

  const events = [];
  const unsubscribe1 = lifecycle.onVisibilityChange((isVisible) => {
    events.push({ sub: 1, isVisible });
  });
  const unsubscribe2 = lifecycle.onVisibilityChange((isVisible) => {
    events.push({ sub: 2, isVisible });
  });

  // Simulate tab hide
  document.visibilityState = 'hidden';
  assert.strictEqual(lifecycle.isTabVisible(), false);
  document._dispatch('visibilitychange');

  assert.strictEqual(events.length, 2);
  assert.deepStrictEqual(events[0], { sub: 1, isVisible: false });
  assert.deepStrictEqual(events[1], { sub: 2, isVisible: false });

  // Unsubscribe first
  unsubscribe1();

  // Simulate tab show
  document.visibilityState = 'visible';
  assert.strictEqual(lifecycle.isTabVisible(), true);
  document._dispatch('visibilitychange');

  assert.strictEqual(events.length, 3);
  assert.deepStrictEqual(events[2], { sub: 2, isVisible: true });

  unsubscribe2();
});
