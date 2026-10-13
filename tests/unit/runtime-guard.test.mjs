import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeGuardScript = fs.readFileSync(path.join(rootDir, 'src/newtab/core/runtime-guard.js'), 'utf8');
const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');

function setupTestEnvironment() {
  const context = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Error,
    TypeError,
    RangeError,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    document: {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  };

  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(runtimeGuardScript, context);

  return context;
}

// ----------------------------------------------------
// 1. Module Export & Core API Surface
// ----------------------------------------------------
test('runtime-guard: exports canonical HomebaseRuntimeGuard with complete API surface', () => {
  const context = setupTestEnvironment();

  assert.ok(context.HomebaseRuntimeGuard, 'HomebaseRuntimeGuard must be exported on window');
  assert.strictEqual(typeof context.HomebaseRuntimeGuard, 'object');

  const requiredMethods = [
    'capture',
    'wrap',
    'wrapAsync',
    'run',
    'runAsync',
    'getDiagnostics',
    'clearDiagnostics',
    'hasErrors',
    'getErrorCount',
    'addListener',
    'removeListener'
  ];

  requiredMethods.forEach((method) => {
    assert.strictEqual(
      typeof context.HomebaseRuntimeGuard[method],
      'function',
      `HomebaseRuntimeGuard.${method} must be a function`
    );
  });
});

// ----------------------------------------------------
// 2. Synchronous Function Isolation & Fallback
// ----------------------------------------------------
test('runtime-guard: wrap and run catch sync errors, return fallback, and record diagnostics', () => {
  const context = setupTestEnvironment();
  const guard = context.HomebaseRuntimeGuard;

  // 1. Successful execution
  const add = (a, b) => a + b;
  const safeAdd = guard.wrap(add, 'math:add');
  assert.strictEqual(safeAdd(2, 3), 5);
  assert.strictEqual(guard.hasErrors(), false);

  // 2. Failing execution with wrap()
  const thrower = () => {
    throw new Error('Simulated widget sync failure');
  };
  const safeThrower = guard.wrap(thrower, 'widget:todo:render', 'fallback-todo');
  const result = safeThrower();

  assert.strictEqual(result, 'fallback-todo', 'Must return provided fallback value');
  assert.strictEqual(guard.hasErrors(), true);
  assert.strictEqual(guard.getErrorCount(), 1);

  const diagnostics = guard.getDiagnostics();
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].context, 'widget:todo:render');
  assert.strictEqual(diagnostics[0].subsystem, 'todo');
  assert.strictEqual(diagnostics[0].message, 'Simulated widget sync failure');
  assert.strictEqual(diagnostics[0].handled, true);

  // 3. Failing execution with run()
  const runResult = guard.run(() => {
    throw new TypeError('Cannot read properties of null');
  }, 'widget:weather:dom', { defaultWeather: true });

  assert.deepStrictEqual(runResult, { defaultWeather: true });
  assert.strictEqual(guard.getErrorCount(), 2);
  assert.strictEqual(guard.getErrorCount('weather'), 1);
  assert.strictEqual(guard.getErrorCount('todo'), 1);
});

// ----------------------------------------------------
// 3. Asynchronous Function Isolation & Fallback
// ----------------------------------------------------
test('runtime-guard: wrapAsync and runAsync catch rejections and isolate failures', async () => {
  const context = setupTestEnvironment();
  const guard = context.HomebaseRuntimeGuard;

  // 1. Successful async execution
  const asyncSuccess = async () => 'resolved-news';
  const safeAsyncSuccess = guard.wrapAsync(asyncSuccess, 'widget:news:fetch');
  const successRes = await safeAsyncSuccess();
  assert.strictEqual(successRes, 'resolved-news');
  assert.strictEqual(guard.hasErrors(), false);

  // 2. Failing execution with wrapAsync
  const asyncFailing = async () => {
    throw new Error('Network timeout in news fetch');
  };
  const safeAsyncFailing = guard.wrapAsync(asyncFailing, 'widget:news:fetch', ['cached-item']);
  const failRes = await safeAsyncFailing();

  assert.deepStrictEqual(failRes, ['cached-item'], 'Must return provided fallback value');
  assert.strictEqual(guard.hasErrors(), true);
  assert.strictEqual(guard.getErrorCount('news'), 1);

  // 3. Failing execution with runAsync
  const runAsyncRes = await guard.runAsync(async () => {
    throw new Error('Quote catalog parse failure');
  }, 'startup:quoteIndex', null);

  assert.strictEqual(runAsyncRes, null);
  assert.strictEqual(guard.getErrorCount('quote'), 1);
  assert.strictEqual(guard.getErrorCount(), 2);
});

// ----------------------------------------------------
// 4. Diagnostics Ring Buffer & Clearing
// ----------------------------------------------------
test('runtime-guard: respects maximum ring buffer capacity and supports clearDiagnostics', () => {
  const context = setupTestEnvironment();
  const guard = context.HomebaseRuntimeGuard;

  // Insert 120 errors (capacity is 100)
  for (let i = 1; i <= 120; i++) {
    guard.capture(new Error(`Error number ${i}`), `test:error:${i}`);
  }

  const diagnostics = guard.getDiagnostics();
  assert.strictEqual(diagnostics.length, 100, 'Diagnostics store must not exceed 100 entries');
  assert.strictEqual(diagnostics[0].message, 'Error number 21', 'Oldest entries must be discarded');
  assert.strictEqual(diagnostics[99].message, 'Error number 120', 'Latest entry must be preserved');

  // Clear diagnostics
  guard.clearDiagnostics();
  assert.strictEqual(guard.hasErrors(), false);
  assert.strictEqual(guard.getDiagnostics().length, 0);
  assert.strictEqual(guard.getErrorCount(), 0);
});

// ----------------------------------------------------
// 5. Observer Notification Pattern (Listeners)
// ----------------------------------------------------
test('runtime-guard: notifies subscribed error listeners on captured failure', () => {
  const context = setupTestEnvironment();
  const guard = context.HomebaseRuntimeGuard;

  const capturedNotifications = [];
  const unsubscribe = guard.addListener((entry) => {
    capturedNotifications.push(entry);
  });

  guard.capture(new Error('Listener test failure'), 'startup:setupWeather');
  assert.strictEqual(capturedNotifications.length, 1);
  assert.strictEqual(capturedNotifications[0].context, 'startup:setupWeather');
  assert.strictEqual(capturedNotifications[0].subsystem, 'weather');

  // Unsubscribe stops notifications
  unsubscribe();
  guard.capture(new Error('Ignored by listener'), 'startup:setupNews');
  assert.strictEqual(capturedNotifications.length, 1, 'Unsubscribed listener must not receive further notifications');
});

// ----------------------------------------------------
// 6. Subsystem Failure Isolation in Lifecycle Service
// ----------------------------------------------------
test('runtime-guard: isolates broken widget in HomebaseWidgetLifecycle without halting others', async () => {
  const context = setupTestEnvironment();
  vm.runInContext(lifecycleScript, context);

  const guard = context.HomebaseRuntimeGuard;
  const lifecycle = context.HomebaseWidgetLifecycle;

  let widgetAInitialized = false;
  let widgetCInitialized = false;

  const healthyWidgetA = {
    initialize: () => { widgetAInitialized = true; }
  };

  const brokenWidgetB = {
    initialize: () => {
      throw new Error('Fatal error inside widget B initialization');
    }
  };

  const healthyWidgetC = {
    initialize: async () => { widgetCInitialized = true; }
  };

  lifecycle.registerWidget('healthyA', healthyWidgetA);
  lifecycle.registerWidget('brokenB', brokenWidgetB);
  lifecycle.registerWidget('healthyC', healthyWidgetC);

  // Initialize all widgets
  await lifecycle.initializeAll();

  // Widget A and C must successfully initialize despite Widget B throwing
  assert.strictEqual(widgetAInitialized, true, 'Healthy widget A must initialize');
  assert.strictEqual(widgetCInitialized, true, 'Healthy widget C must initialize');

  // Guard must have captured broken widget B failure
  assert.strictEqual(guard.hasErrors(), true);
  const diagnostics = guard.getDiagnostics();
  const widgetBErrors = diagnostics.filter((d) => d.context === 'widget:brokenB:init');
  assert.strictEqual(widgetBErrors.length, 1);
  assert.strictEqual(widgetBErrors[0].message, 'Fatal error inside widget B initialization');
});
