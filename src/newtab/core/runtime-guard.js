// ===================================================================
// Homebase — Centralized Runtime Error Boundary & Diagnostics Guard
//
// Single canonical owner of non-critical failure isolation,
// structured diagnostics logging, and widget error containment.
// Prevents any single subsystem failure from breaking dashboard startup.
// ===================================================================

(function () {
  'use strict';

  const MAX_DIAGNOSTICS_ENTRIES = 100;

  /**
   * Internal ring buffer of captured diagnostic error records.
   * @type {Array<DiagnosticEntry>}
   */
  const diagnosticsStore = [];

  /**
   * Listeners subscribed to captured runtime errors.
   * @type {Set<(entry: DiagnosticEntry) => void>}
   */
  const errorListeners = new Set();

  let nextEntryId = 1;

  /**
   * Infers subsystem classification from context label.
   * @param {string} context
   * @returns {string}
   */
  function inferSubsystem(context) {
    if (!context || typeof context !== 'string') return 'runtime';
    const lower = context.toLowerCase();
    if (lower.includes('weather')) return 'weather';
    if (lower.includes('quote')) return 'quote';
    if (lower.includes('news')) return 'news';
    if (lower.includes('todo')) return 'todo';
    if (lower.includes('time')) return 'time';
    if (lower.includes('search')) return 'search';
    if (lower.includes('bookmark')) return 'bookmarks';
    if (lower.includes('wallpaper')) return 'wallpaper';
    if (lower.includes('settings')) return 'settings';
    if (lower.includes('startup')) return 'startup';
    if (lower.includes('storage')) return 'storage';
    return 'core';
  }

  /**
   * Normalizes arbitrary input into a standardized DiagnosticEntry.
   *
   * @param {Error|any} error
   * @param {string|object} contextOrOptions
   * @returns {DiagnosticEntry}
   */
  function normalizeDiagnostic(error, contextOrOptions) {
    let context = 'unknown';
    let subsystem = 'runtime';
    let severity = 'warning';
    let extraMeta = null;

    if (typeof contextOrOptions === 'string') {
      context = contextOrOptions;
      subsystem = inferSubsystem(context);
    } else if (contextOrOptions && typeof contextOrOptions === 'object') {
      context = String(contextOrOptions.context || contextOrOptions.label || 'unknown');
      subsystem = contextOrOptions.subsystem || inferSubsystem(context);
      severity = contextOrOptions.severity || 'warning';
      extraMeta = contextOrOptions.meta || null;
    }

    const isErrObj = error && (error instanceof Error || (typeof error === 'object' && 'message' in error));
    const message = isErrObj
      ? String(error.message || '')
      : (typeof error === 'string' ? error : (error ? String(error) : 'Unknown error'));

    const name = isErrObj ? (error.name || 'Error') : 'RuntimeError';
    const stack = isErrObj ? (error.stack || null) : null;

    const entry = {
      id: nextEntryId++,
      name,
      message,
      stack,
      context,
      subsystem,
      severity,
      timestamp: Date.now(),
      handled: true
    };

    if (extraMeta) {
      entry.meta = extraMeta;
    }

    return entry;
  }

  /**
   * Captures and records a runtime failure without throwing.
   *
   * @param {Error|any} error - The caught exception or rejection reason
   * @param {string|object} [context='unknown'] - Diagnostic context identifier or options
   * @returns {DiagnosticEntry} The recorded diagnostic payload
   */
  function capture(error, context = 'unknown') {
    const entry = normalizeDiagnostic(error, context);

    diagnosticsStore.push(entry);
    if (diagnosticsStore.length > MAX_DIAGNOSTICS_ENTRIES) {
      diagnosticsStore.splice(0, diagnosticsStore.length - MAX_DIAGNOSTICS_ENTRIES);
    }

    console.warn(`[HomebaseRuntimeGuard] Isolated error in [${entry.context}]:`, entry.message, error);

    errorListeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (listenerErr) {
        console.warn('[HomebaseRuntimeGuard] Error in diagnostics listener:', listenerErr);
      }
    });

    return entry;
  }

  /**
   * Wraps a synchronous function with error boundary isolation.
   *
   * @param {Function} fn - Function to wrap
   * @param {string|object} [context='unknown'] - Context identifier
   * @param {*} [fallback=undefined] - Value or function returned if fn throws
   * @returns {Function} Wrapped safe function
   */
  function wrap(fn, context = 'unknown', fallback = undefined) {
    if (typeof fn !== 'function') return () => fallback;

    return function safeWrapped(...args) {
      try {
        return fn.apply(this, args);
      } catch (err) {
        capture(err, context);
        return typeof fallback === 'function' ? fallback(...args) : fallback;
      }
    };
  }

  /**
   * Wraps an asynchronous function with error boundary isolation.
   *
   * @param {Function} fn - Async function to wrap
   * @param {string|object} [context='unknown'] - Context identifier
   * @param {*} [fallback=undefined] - Value or function returned if fn rejects
   * @returns {Function} Wrapped safe async function
   */
  function wrapAsync(fn, context = 'unknown', fallback = undefined) {
    if (typeof fn !== 'function') return async () => fallback;

    return async function safeWrappedAsync(...args) {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        capture(err, context);
        return typeof fallback === 'function' ? fallback(...args) : fallback;
      }
    };
  }

  /**
   * Immediately runs a synchronous function inside the error boundary.
   *
   * @param {Function} fn - Function to run
   * @param {string|object} [context='unknown'] - Context identifier
   * @param {*} [fallback=undefined] - Fallback value if fn throws
   * @returns {*} Result of fn or fallback
   */
  function run(fn, context = 'unknown', fallback = undefined) {
    if (typeof fn !== 'function') return fallback;
    try {
      return fn();
    } catch (err) {
      capture(err, context);
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }

  /**
   * Immediately runs an asynchronous function inside the error boundary.
   *
   * @param {Function} fn - Async function to run
   * @param {string|object} [context='unknown'] - Context identifier
   * @param {*} [fallback=undefined] - Fallback value if fn rejects
   * @returns {Promise<*>} Result of fn or fallback
   */
  async function runAsync(fn, context = 'unknown', fallback = undefined) {
    if (typeof fn !== 'function') return fallback;
    try {
      return await fn();
    } catch (err) {
      capture(err, context);
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }

  /**
   * Returns a shallow copy of all captured diagnostics.
   * @returns {Array<DiagnosticEntry>}
   */
  function getDiagnostics() {
    return diagnosticsStore.slice();
  }

  /**
   * Clears the in-memory diagnostics buffer.
   */
  function clearDiagnostics() {
    diagnosticsStore.length = 0;
  }

  /**
   * Returns whether any errors have been captured.
   * @returns {boolean}
   */
  function hasErrors() {
    return diagnosticsStore.length > 0;
  }

  /**
   * Returns error count, optionally filtered by subsystem.
   * @param {string} [subsystem]
   * @returns {number}
   */
  function getErrorCount(subsystem) {
    if (!subsystem) return diagnosticsStore.length;
    return diagnosticsStore.filter((d) => d.subsystem === subsystem).length;
  }

  /**
   * Adds a diagnostics listener.
   * @param {(entry: DiagnosticEntry) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  function addListener(listener) {
    if (typeof listener !== 'function') return () => {};
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }

  /**
   * Removes a diagnostics listener.
   * @param {(entry: DiagnosticEntry) => void} listener
   */
  function removeListener(listener) {
    errorListeners.delete(listener);
  }

  const HomebaseRuntimeGuard = {
    capture,
    wrap,
    wrapAsync,
    run,
    runAsync,
    getDiagnostics,
    clearDiagnostics,
    hasErrors,
    getErrorCount,
    addListener,
    removeListener
  };

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope) {
    globalScope.HomebaseRuntimeGuard = HomebaseRuntimeGuard;
  }
  if (typeof window !== 'undefined' && globalScope !== window) {
    window.HomebaseRuntimeGuard = HomebaseRuntimeGuard;
  }
})();
