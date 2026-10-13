import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeGuardScript = fs.readFileSync(path.join(rootDir, 'src/newtab/core/runtime-guard.js'), 'utf8');
const runtimeDiagnosticsScript = fs.readFileSync(path.join(rootDir, 'src/newtab/core/runtime-diagnostics.js'), 'utf8');
const lifecycleScript = fs.readFileSync(path.join(rootDir, 'src/newtab/widgets/widget-lifecycle.js'), 'utf8');

function setupTestEnvironment(options = {}) {
  const classList = new Set(options.classList || ['preload']);

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
    Promise,
    performance: {
      now: () => Date.now(),
      memory: {
        usedJSHeapSize: 12000000,
        totalJSHeapSize: 24000000,
        jsHeapSizeLimit: 64000000
      },
      getEntriesByType: () => []
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      language: 'en-US',
      onLine: true
    },
    document: {
      visibilityState: options.visibilityState || 'visible',
      body: {
        classList: {
          contains: (cls) => classList.has(cls),
          add: (cls) => classList.add(cls),
          remove: (cls) => classList.delete(cls)
        }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  };

  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(runtimeGuardScript, context);
  vm.runInContext(runtimeDiagnosticsScript, context);
  vm.runInContext(lifecycleScript, context);

  return context;
}

// -----------------------------------------------------------------
// 1. Module Export & Core API Surface
// -----------------------------------------------------------------
test('runtime-diagnostics: exports HomebaseRuntimeDiagnostics and HomebasePerformanceMonitor on window', () => {
  const context = setupTestEnvironment();

  assert.ok(context.HomebaseRuntimeDiagnostics, 'HomebaseRuntimeDiagnostics must be exported on window');
  assert.strictEqual(typeof context.HomebaseRuntimeDiagnostics, 'object');

  const requiredDiagMethods = [
    'getHealth',
    'getWidgetStatus',
    'getLifecycleState',
    'getStartupMetrics',
    'getErrorSummary',
    'getReport',
    'exportJSON',
    'addListener',
    'removeListener'
  ];

  requiredDiagMethods.forEach((method) => {
    assert.strictEqual(
      typeof context.HomebaseRuntimeDiagnostics[method],
      'function',
      `HomebaseRuntimeDiagnostics must export method: ${method}`
    );
  });

  assert.ok(context.HomebasePerformanceMonitor, 'HomebasePerformanceMonitor must be exported on window');
  assert.strictEqual(typeof context.HomebasePerformanceMonitor, 'object');
  assert.strictEqual(
    context.HomebaseRuntimeDiagnostics.performanceMonitor,
    context.HomebasePerformanceMonitor,
    'HomebaseRuntimeDiagnostics.performanceMonitor should point to HomebasePerformanceMonitor'
  );

  const requiredPerfMethods = [
    'now',
    'markStartupStart',
    'markStartupReady',
    'getStartupDuration',
    'markHydrationStart',
    'markHydrationComplete',
    'getHydrationDuration',
    'recordWidgetInit',
    'measureWidgetInit',
    'getWidgetInitTimings',
    'recordRender',
    'measureRender',
    'getRenderTimings',
    'recordCleanup',
    'getCleanupEvents',
    'getMemorySnapshot',
    'getMetrics',
    'reset'
  ];

  requiredPerfMethods.forEach((method) => {
    assert.strictEqual(
      typeof context.HomebasePerformanceMonitor[method],
      'function',
      `HomebasePerformanceMonitor must export method: ${method}`
    );
  });
});

// -----------------------------------------------------------------
// 2. Performance Monitoring Tracking
// -----------------------------------------------------------------
test('performance-monitor: tracks startup duration, hydration duration, widget inits, and renders', async () => {
  const context = setupTestEnvironment();
  const perf = context.HomebasePerformanceMonitor;

  perf.reset();

  // 1. Startup timing
  perf.markStartupStart(100);
  perf.markStartupReady(245.5);
  assert.strictEqual(perf.getStartupDuration(), 145.5);

  // 2. Hydration timing
  perf.markHydrationStart(300);
  perf.markHydrationComplete(350);
  assert.strictEqual(perf.getHydrationDuration(), 50);

  // 3. Widget init measurement
  let ranSync = false;
  perf.measureWidgetInit('time', () => {
    ranSync = true;
    return 'ok';
  });
  assert.ok(ranSync);

  let ranAsync = false;
  await perf.measureWidgetInit('weather', async () => {
    ranAsync = true;
    return 'weather-done';
  });
  assert.ok(ranAsync);

  const timings = perf.getWidgetInitTimings();
  assert.ok('time' in timings);
  assert.ok('weather' in timings);
  assert.strictEqual(typeof timings.time.durationMs, 'number');
  assert.strictEqual(typeof timings.weather.durationMs, 'number');

  // 4. Render timing measurement
  perf.recordRender('bookmark-grid', 12.4, { tileCount: 20 });
  const renders = perf.getRenderTimings();
  assert.strictEqual(renders.length, 1);
  assert.strictEqual(renders[0].component, 'bookmark-grid');
  assert.strictEqual(renders[0].durationMs, 12.4);

  // 5. Memory cleanup event tracking
  perf.recordCleanup('weather', { action: 'abort-fetch' });
  const cleanups = perf.getCleanupEvents();
  assert.strictEqual(cleanups.length, 1);
  assert.strictEqual(cleanups[0].component, 'weather');
  assert.strictEqual(cleanups[0].action, 'abort-fetch');

  // 6. Memory snapshot
  const mem = perf.getMemorySnapshot();
  assert.ok(mem);
  assert.strictEqual(mem.usedJSHeapSize, 12000000);

  // 7. Full metrics payload
  const metrics = perf.getMetrics();
  assert.strictEqual(metrics.startup.durationMs, 145.5);
  assert.strictEqual(metrics.hydration.durationMs, 50);
  assert.ok(metrics.widgetInits.time);
  assert.strictEqual(metrics.renders.length, 1);
  assert.strictEqual(metrics.cleanups.length, 1);
});

// -----------------------------------------------------------------
// 3. Lifecycle State Inspection
// -----------------------------------------------------------------
test('runtime-diagnostics: getLifecycleState reflects tab visibility, readiness, and widget records', () => {
  const context = setupTestEnvironment({ classList: ['ready'] });
  const diag = context.HomebaseRuntimeDiagnostics;
  const lifecycle = context.HomebaseWidgetLifecycle;

  lifecycle.registerWidget('mock-w1', { init: () => {} });
  lifecycle.registerWidget('mock-w2', { init: () => {} });
  lifecycle.setWidgetVisibility('mock-w1', true);

  const state = diag.getLifecycleState();
  assert.strictEqual(state.isReady, true);
  assert.strictEqual(state.isPreload, false);
  assert.strictEqual(state.tabVisible, true);
  assert.strictEqual(state.registeredCount, 2);
  assert.strictEqual(state.visibleCount, 1);
});

// -----------------------------------------------------------------
// 4. Widget Status Overview
// -----------------------------------------------------------------
test('runtime-diagnostics: getWidgetStatus identifies canonical widgets and registered state', async () => {
  const context = setupTestEnvironment();
  const diag = context.HomebaseRuntimeDiagnostics;
  const lifecycle = context.HomebaseWidgetLifecycle;

  // Mock canonical controllers on window
  context.HomebaseWidgetTime = { initialize: () => {}, destroy: () => {} };
  context.HomebaseWidgetTodo = { initialize: () => {}, destroy: () => {} };
  context.HomebaseWidgetQuote = { initialize: () => {}, destroy: () => {} };
  context.HomebaseWidgetWeather = { initialize: () => {}, destroy: () => {} };
  context.HomebaseWidgetNews = { initialize: () => {}, destroy: () => {} };

  lifecycle.registerWidget('time', context.HomebaseWidgetTime);
  lifecycle.registerWidget('weather', context.HomebaseWidgetWeather);

  await lifecycle.initializeAll();

  const status = diag.getWidgetStatus();
  assert.strictEqual(status.allRegisteredCount, 2);
  assert.strictEqual(status.canonicalWidgets.time.controllerAvailable, true);
  assert.strictEqual(status.canonicalWidgets.time.registered, true);
  assert.strictEqual(status.canonicalWidgets.time.isInitialized, true);
  assert.strictEqual(status.canonicalWidgets.todo.controllerAvailable, true);
  assert.strictEqual(status.canonicalWidgets.todo.registered, false);
});

// -----------------------------------------------------------------
// 5. Error Summary & Health Assessment
// -----------------------------------------------------------------
test('runtime-diagnostics: correlates captured errors and computes health status', () => {
  const context = setupTestEnvironment({ classList: ['ready'] });
  const diag = context.HomebaseRuntimeDiagnostics;
  const guard = context.HomebaseRuntimeGuard;

  // Set mock canonical controllers so health widget check passes
  context.HomebaseWidgetTime = { initialize: () => {} };
  context.HomebaseWidgetTodo = { initialize: () => {} };
  context.HomebaseWidgetQuote = { initialize: () => {} };
  context.HomebaseWidgetWeather = { initialize: () => {} };
  context.HomebaseWidgetNews = { initialize: () => {} };

  // Initial health with 0 errors
  let health = diag.getHealth();
  assert.strictEqual(health.status, 'healthy');
  assert.strictEqual(health.score, 100);
  assert.strictEqual(health.checks.errors.status, 'pass');

  // Capture a couple isolated errors through HomebaseRuntimeGuard
  guard.capture(new Error('Network glitch'), 'weather:fetch');
  guard.capture(new Error('Quote timeout'), 'quote:fetch');

  const errorSummary = diag.getErrorSummary();
  assert.strictEqual(errorSummary.totalErrors, 2);
  assert.strictEqual(errorSummary.uniqueErrors, 2);
  assert.strictEqual(errorSummary.bySubsystem.weather, 1);
  assert.strictEqual(errorSummary.bySubsystem.quote, 1);
  assert.strictEqual(errorSummary.hasErrors, true);

  health = diag.getHealth();
  assert.strictEqual(health.status, 'degraded');
  assert.ok(health.score < 100);
  assert.strictEqual(health.checks.errors.status, 'warn');
});

// -----------------------------------------------------------------
// 6. Diagnostics Report & JSON Export
// -----------------------------------------------------------------
test('runtime-diagnostics: getReport and exportJSON produce valid structured telemetry', () => {
  const context = setupTestEnvironment({ classList: ['ready'] });
  const diag = context.HomebaseRuntimeDiagnostics;

  let listenerFired = false;
  diag.addListener((report) => {
    listenerFired = true;
    assert.ok(report.environment);
  });

  const report = diag.getReport();
  assert.ok(listenerFired);
  assert.strictEqual(typeof report.timestamp, 'string');
  assert.strictEqual(typeof report.environment.userAgent, 'string');
  assert.ok(report.health);
  assert.ok(report.lifecycle);
  assert.ok(report.widgets);
  assert.ok(report.performance);
  assert.ok(report.errors);

  const jsonStr = diag.exportJSON();
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.environment.platform, 'Win32');
  assert.strictEqual(typeof parsed.health.score, 'number');
});
