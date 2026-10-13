// ===================================================================
// Homebase — Production Runtime Diagnostics & Performance Monitor
//
// Canonical owner of dashboard health diagnostics, lifecycle
// state inspection, advanced performance monitoring, error
// correlation, and release readiness telemetry.
// ===================================================================

(function () {
  'use strict';

  // -----------------------------------------------------------------
  // 1. Advanced Performance Monitor (HomebasePerformanceMonitor)
  // -----------------------------------------------------------------

  const MAX_RENDER_TIMINGS = 60;
  const MAX_CLEANUP_EVENTS = 60;

  let startupStartTime = null;
  let startupReadyTime = null;
  let hydrationStartTime = null;
  let hydrationCompleteTime = null;

  /**
   * Widget initialization timings map: widgetId -> { durationMs, timestamp, details }
   * @type {Map<string, { durationMs: number, timestamp: number, details: any }>}
   */
  const widgetInitTimings = new Map();

  /**
   * Render timings ring buffer
   * @type {Array<{ component: string, durationMs: number, timestamp: number, details: any }>}
   */
  const renderTimings = [];

  /**
   * Memory & resource cleanup events ring buffer
   * @type {Array<{ component: string, action: string, timestamp: number, details: any }>}
   */
  const cleanupEvents = [];

  /**
   * Safely returns high-resolution time in ms.
   * @returns {number}
   */
  function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      const val = performance.now();
      if (Number.isFinite(val)) return val;
    }
    return Date.now();
  }

  function markStartupStart(timestamp) {
    startupStartTime = Number.isFinite(timestamp) ? timestamp : now();
    return startupStartTime;
  }

  function markStartupReady(timestamp) {
    startupReadyTime = Number.isFinite(timestamp) ? timestamp : now();
    return startupReadyTime;
  }

  function getStartupDuration() {
    if (Number.isFinite(startupStartTime) && Number.isFinite(startupReadyTime)) {
      return Math.max(0, Math.round((startupReadyTime - startupStartTime) * 100) / 100);
    }
    // Fallback: check performance navigation or measure entries if available
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      try {
        const measures = performance.getEntriesByType('measure');
        const readyMeasure = measures.find((m) => m && m.name === 'init-to-ready-class' || m.name === 'script-to-ready-class');
        if (readyMeasure && Number.isFinite(readyMeasure.duration)) {
          return Math.round(readyMeasure.duration * 100) / 100;
        }
      } catch (_) {}
    }
    return null;
  }

  function markHydrationStart(timestamp) {
    hydrationStartTime = Number.isFinite(timestamp) ? timestamp : now();
    return hydrationStartTime;
  }

  function markHydrationComplete(timestamp) {
    hydrationCompleteTime = Number.isFinite(timestamp) ? timestamp : now();
    return hydrationCompleteTime;
  }

  function getHydrationDuration() {
    if (Number.isFinite(hydrationStartTime) && Number.isFinite(hydrationCompleteTime)) {
      return Math.max(0, Math.round((hydrationCompleteTime - hydrationStartTime) * 100) / 100);
    }
    return null;
  }

  function recordWidgetInit(widgetId, durationMs, details = null) {
    if (!widgetId || typeof widgetId !== 'string') return;
    const dur = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs * 100) / 100) : 0;
    widgetInitTimings.set(widgetId, {
      durationMs: dur,
      timestamp: Date.now(),
      details
    });
  }

  function measureWidgetInit(widgetId, fn) {
    if (typeof fn !== 'function') return undefined;
    const start = now();
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.then(
          (val) => {
            recordWidgetInit(widgetId, now() - start);
            return val;
          },
          (err) => {
            recordWidgetInit(widgetId, now() - start, { error: String(err?.message || err) });
            throw err;
          }
        );
      }
      recordWidgetInit(widgetId, now() - start);
      return result;
    } catch (err) {
      recordWidgetInit(widgetId, now() - start, { error: String(err?.message || err) });
      throw err;
    }
  }

  function getWidgetInitTimings() {
    const obj = {};
    widgetInitTimings.forEach((val, key) => {
      obj[key] = { ...val };
    });
    return obj;
  }

  function recordRender(component, durationMs, details = null) {
    if (!component || typeof component !== 'string') return;
    const dur = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs * 100) / 100) : 0;
    renderTimings.push({
      component,
      durationMs: dur,
      timestamp: Date.now(),
      details
    });
    if (renderTimings.length > MAX_RENDER_TIMINGS) {
      renderTimings.splice(0, renderTimings.length - MAX_RENDER_TIMINGS);
    }
  }

  function measureRender(component, fn, details = null) {
    if (typeof fn !== 'function') return undefined;
    const start = now();
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.then(
          (val) => {
            recordRender(component, now() - start, details);
            return val;
          },
          (err) => {
            recordRender(component, now() - start, { ...details, error: String(err?.message || err) });
            throw err;
          }
        );
      }
      recordRender(component, now() - start, details);
      return result;
    } catch (err) {
      recordRender(component, now() - start, { ...details, error: String(err?.message || err) });
      throw err;
    }
  }

  function getRenderTimings() {
    return renderTimings.slice();
  }

  function recordCleanup(component, details = null) {
    if (!component || typeof component !== 'string') return;
    const action = (details && typeof details === 'object' && details.action) ? String(details.action) : 'cleanup';
    cleanupEvents.push({
      component,
      action,
      timestamp: Date.now(),
      details
    });
    if (cleanupEvents.length > MAX_CLEANUP_EVENTS) {
      cleanupEvents.splice(0, cleanupEvents.length - MAX_CLEANUP_EVENTS);
    }
  }

  function getCleanupEvents() {
    return cleanupEvents.slice();
  }

  function getMemorySnapshot() {
    try {
      if (typeof performance !== 'undefined' && performance.memory) {
        const mem = performance.memory;
        return {
          usedJSHeapSize: mem.usedJSHeapSize,
          totalJSHeapSize: mem.totalJSHeapSize,
          jsHeapSizeLimit: mem.jsHeapSizeLimit
        };
      }
    } catch (_) {}
    return null;
  }

  function getPerformanceMetrics() {
    return {
      startup: {
        durationMs: getStartupDuration(),
        startTime: startupStartTime,
        readyTime: startupReadyTime
      },
      hydration: {
        durationMs: getHydrationDuration(),
        startTime: hydrationStartTime,
        completeTime: hydrationCompleteTime
      },
      widgetInits: getWidgetInitTimings(),
      renders: getRenderTimings(),
      cleanups: getCleanupEvents(),
      memory: getMemorySnapshot()
    };
  }

  function resetPerformanceMetrics() {
    startupStartTime = null;
    startupReadyTime = null;
    hydrationStartTime = null;
    hydrationCompleteTime = null;
    widgetInitTimings.clear();
    renderTimings.length = 0;
    cleanupEvents.length = 0;
  }

  const HomebasePerformanceMonitor = {
    now,
    markStartupStart,
    markStartupReady,
    getStartupDuration,
    markHydrationStart,
    markHydrationComplete,
    getHydrationDuration,
    recordWidgetInit,
    measureWidgetInit,
    getWidgetInitTimings,
    recordRender,
    measureRender,
    getRenderTimings,
    recordCleanup,
    getCleanupEvents,
    getMemorySnapshot,
    getMetrics: getPerformanceMetrics,
    reset: resetPerformanceMetrics
  };

  // -----------------------------------------------------------------
  // 2. Runtime Diagnostics Dashboard (HomebaseRuntimeDiagnostics)
  // -----------------------------------------------------------------

  const CANONICAL_WIDGET_IDS = ['time', 'todo', 'quote', 'weather', 'news'];

  /**
   * Diagnostic change listeners
   * @type {Set<Function>}
   */
  const diagnosticListeners = new Set();

  function addListener(listener) {
    if (typeof listener === 'function') {
      diagnosticListeners.add(listener);
    }
  }

  function removeListener(listener) {
    diagnosticListeners.delete(listener);
  }

  function notifyListeners(report) {
    diagnosticListeners.forEach((fn) => {
      try {
        fn(report);
      } catch (err) {
        console.warn('[HomebaseRuntimeDiagnostics] Listener error:', err);
      }
    });
  }

  /**
   * Summarizes all captured errors from HomebaseRuntimeGuard.
   * @returns {{ totalErrors: number, uniqueErrors: number, bySubsystem: object, bySeverity: object, recentErrors: Array, hasErrors: boolean }}
   */
  function getErrorSummary() {
    const guard = (typeof HomebaseRuntimeGuard !== 'undefined') ? HomebaseRuntimeGuard : (typeof window !== 'undefined' ? window.HomebaseRuntimeGuard : null);
    if (!guard || typeof guard.getDiagnostics !== 'function') {
      return {
        totalErrors: 0,
        uniqueErrors: 0,
        bySubsystem: {},
        bySeverity: {},
        recentErrors: [],
        hasErrors: false
      };
    }

    const diagnostics = guard.getDiagnostics();
    const bySubsystem = {};
    const bySeverity = {};
    const seenMessages = new Set();

    diagnostics.forEach((entry) => {
      const sub = entry.subsystem || 'unknown';
      const sev = entry.severity || 'warning';
      bySubsystem[sub] = (bySubsystem[sub] || 0) + 1;
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      if (entry.message) {
        seenMessages.add(entry.message);
      }
    });

    return {
      totalErrors: diagnostics.length,
      uniqueErrors: seenMessages.size,
      bySubsystem,
      bySeverity,
      recentErrors: diagnostics.slice(-10),
      hasErrors: diagnostics.length > 0
    };
  }

  /**
   * Gathers status of all canonical widgets and registered lifecycle records.
   * @returns {object}
   */
  function getWidgetStatus() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const lifecycle = globalScope.HomebaseWidgetLifecycle;
    const registeredWidgets = lifecycle && typeof lifecycle.getAllWidgets === 'function'
      ? lifecycle.getAllWidgets()
      : [];

    const registeredMap = new Map();
    registeredWidgets.forEach((r) => {
      if (r && r.id) registeredMap.set(r.id, r);
    });

    const initTimings = getWidgetInitTimings();
    const widgetStatusMap = {};

    CANONICAL_WIDGET_IDS.forEach((id) => {
      const capName = id.charAt(0).toUpperCase() + id.slice(1);
      const controller = globalScope[`HomebaseWidget${capName}`];
      const record = registeredMap.get(id);

      widgetStatusMap[id] = {
        id,
        controllerAvailable: !!controller,
        registered: !!record,
        isInitialized: record ? !!record.isInitialized : false,
        isVisible: record ? !!record.isVisible : false,
        isActive: record ? !!record.isActive : false,
        isDestroyed: record ? !!record.isDestroyed : false,
        initDurationMs: initTimings[id]?.durationMs ?? null
      };
    });

    return {
      canonicalWidgets: widgetStatusMap,
      allRegisteredCount: registeredWidgets.length,
      allRegistered: registeredWidgets.map((r) => ({
        id: r.id,
        isInitialized: r.isInitialized,
        isVisible: r.isVisible,
        isActive: r.isActive,
        isDestroyed: r.isDestroyed
      }))
    };
  }

  /**
   * Inspects current tab and dashboard lifecycle state.
   * @returns {object}
   */
  function getLifecycleState() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const doc = typeof document !== 'undefined' ? document : null;
    const lifecycle = globalScope.HomebaseWidgetLifecycle;

    const isReady = !!(doc && doc.body && doc.body.classList.contains('ready'));
    const isPreload = !!(doc && doc.body && doc.body.classList.contains('preload'));
    const tabVisible = lifecycle && typeof lifecycle.isTabVisible === 'function'
      ? lifecycle.isTabVisible()
      : (doc ? doc.visibilityState === 'visible' : true);
    const visibilityState = doc ? doc.visibilityState : 'unknown';

    const registered = lifecycle && typeof lifecycle.getAllWidgets === 'function'
      ? lifecycle.getAllWidgets()
      : [];

    const activeCount = registered.filter((r) => r.isActive).length;
    const visibleCount = registered.filter((r) => r.isVisible).length;
    const initializedCount = registered.filter((r) => r.isInitialized).length;

    return {
      isReady,
      isPreload,
      tabVisible,
      visibilityState,
      registeredCount: registered.length,
      activeCount,
      visibleCount,
      initializedCount
    };
  }

  /**
   * Retrieves startup timing metrics from the performance monitor and perf runtime.
   * @returns {object}
   */
  function getStartupMetrics() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const perfStore = Array.isArray(globalScope.__HB_STARTUP_PERF) ? globalScope.__HB_STARTUP_PERF : [];

    return {
      startupDurationMs: getStartupDuration(),
      hydrationDurationMs: getHydrationDuration(),
      widgetInitTimings: getWidgetInitTimings(),
      recentPerfEvents: perfStore.slice(-15)
    };
  }

  /**
   * Calculates overall runtime health and returns an evaluation summary.
   * @returns {{ status: 'healthy'|'degraded'|'critical', score: number, timestamp: number, checks: object }}
   */
  function getHealth() {
    const errorSummary = getErrorSummary();
    const lifecycle = getLifecycleState();
    const widgetStatus = getWidgetStatus();
    const startupDuration = getStartupDuration();

    let score = 100;
    const checks = {};

    // 1. Error boundary check
    if (errorSummary.totalErrors === 0) {
      checks.errors = { status: 'pass', message: 'Zero runtime errors captured', count: 0 };
    } else if (errorSummary.totalErrors <= 3) {
      score -= 20;
      checks.errors = { status: 'warn', message: `${errorSummary.totalErrors} non-critical errors isolated`, count: errorSummary.totalErrors };
    } else {
      score -= 40;
      checks.errors = { status: 'fail', message: `High error volume: ${errorSummary.totalErrors} errors captured`, count: errorSummary.totalErrors };
    }

    // 2. Lifecycle readiness check
    if (lifecycle.isReady) {
      checks.lifecycle = { status: 'pass', message: 'Dashboard reached ready state', isReady: true };
    } else if (lifecycle.isPreload) {
      checks.lifecycle = { status: 'warn', message: 'Dashboard currently booting', isReady: false };
    } else {
      score -= 20;
      checks.lifecycle = { status: 'fail', message: 'Ready state flag not established', isReady: false };
    }

    // 3. Widget subsystem check
    let missingCanonical = 0;
    Object.values(widgetStatus.canonicalWidgets).forEach((w) => {
      if (!w.controllerAvailable) missingCanonical++;
    });

    if (missingCanonical === 0) {
      checks.widgets = { status: 'pass', message: 'All 5 canonical widget controllers available', missing: 0 };
    } else {
      score -= (missingCanonical * 15);
      checks.widgets = { status: 'fail', message: `${missingCanonical} canonical widget controllers missing`, missing: missingCanonical };
    }

    // 4. Performance latency check
    if (startupDuration !== null) {
      if (startupDuration <= 250) {
        checks.performance = { status: 'pass', message: `Optimal startup duration (${startupDuration}ms)`, durationMs: startupDuration };
      } else if (startupDuration <= 600) {
        checks.performance = { status: 'pass', message: `Acceptable startup duration (${startupDuration}ms)`, durationMs: startupDuration };
      } else {
        score -= 10;
        checks.performance = { status: 'warn', message: `Slow startup detected (${startupDuration}ms)`, durationMs: startupDuration };
      }
    } else {
      checks.performance = { status: 'pass', message: 'Startup duration pending or unmeasured', durationMs: null };
    }

    score = Math.max(0, Math.min(100, score));

    let status = 'healthy';
    if (score < 60) {
      status = 'critical';
    } else if (score < 90) {
      status = 'degraded';
    }

    return {
      status,
      score,
      timestamp: Date.now(),
      checks
    };
  }

  /**
   * Generates a comprehensive consolidated diagnostics report.
   * @returns {object}
   */
  function getDiagnosticsReport() {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const nav = typeof navigator !== 'undefined' ? navigator : {};

    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        userAgent: nav.userAgent || 'unknown',
        platform: nav.platform || 'unknown',
        language: nav.language || 'unknown',
        online: nav.onLine !== undefined ? nav.onLine : true
      },
      health: getHealth(),
      lifecycle: getLifecycleState(),
      widgets: getWidgetStatus(),
      performance: getPerformanceMetrics(),
      errors: getErrorSummary()
    };

    notifyListeners(report);
    return report;
  }

  /**
   * Exports full diagnostics report as a JSON string.
   * @param {boolean} [pretty=true]
   * @returns {string}
   */
  function exportJSON(pretty = true) {
    return JSON.stringify(getDiagnosticsReport(), null, pretty ? 2 : 0);
  }

  const HomebaseRuntimeDiagnostics = {
    getHealth,
    getWidgetStatus,
    getLifecycleState,
    getStartupMetrics,
    getErrorSummary,
    getReport: getDiagnosticsReport,
    exportJSON,
    addListener,
    removeListener,
    performanceMonitor: HomebasePerformanceMonitor
  };

  // -----------------------------------------------------------------
  // 3. Exports onto window
  // -----------------------------------------------------------------

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  globalScope.HomebasePerformanceMonitor = HomebasePerformanceMonitor;
  globalScope.HomebaseRuntimeDiagnostics = HomebaseRuntimeDiagnostics;
})();
