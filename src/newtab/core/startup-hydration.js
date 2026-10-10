// ===================================================================
// Homebase — Startup Hydration Task Registry
//
// Canonical owner of non-critical widget startup idle tasks.
// Coordinates error-contained, cooperative idle hydration for
// dashboard widgets (Weather, Quote, News, Todo, Search, App Launcher).
// ===================================================================

(function () {
  'use strict';

  const STARTUP_IDLE_LABELS = new Set([
    'startup:loadCachedWeather',
    'startup:quoteIndex',
    'startup:setupQuoteWidget',
    'startup:setupNewsWidget',
    'startup:setupTodoWidget',
    'startup:setupSearch',
    'startup:setupWeather',
    'startup:setupAppLauncher',
    'startup:fetchQuote',
    'startup:ensureDailyWallpaper',
  ]);

  const loadCachedWeatherSafe = async () => {
    const wWidget = (typeof weatherWidget !== 'undefined' && weatherWidget) || document.querySelector('.widget-weather');
    if (!document || !document.body || !wWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:loadCachedWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather start');
    try {
      await loadCachedWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:loadCachedWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('loadCachedWeather', elapsedMs);
      recordIdleTaskPerf('startup:loadCachedWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather end in', Math.round(elapsedMs), 'ms');
    }
  };

  const buildQuoteIndexSafe = async () => {
    if (!document || !document.body) return;
    const start = performance.now();
    let quoteIndexSkipped = false;
    recordIdleTaskPerf('startup:quoteIndex', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex skipped');
        quoteIndexSkipped = true;
        recordWidgetPerfTiming('quoteIndex', 0, 'skipped');
        recordIdleTaskPerf('startup:quoteIndex', 'skipped', 0);
        return;
      }
      await ensureQuoteIndexBuilt();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:quoteIndex', err);
    } finally {
      const elapsedMs = performance.now() - start;
      if (!quoteIndexSkipped) {
        recordWidgetPerfTiming('quoteIndex', elapsedMs);
      }
      recordIdleTaskPerf('startup:quoteIndex', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupQuoteWidgetSafe = () => {
    const qWidget = (typeof quoteWidget !== 'undefined' && quoteWidget) || document.querySelector('.widget-quote');
    if (!document || !document.body || !qWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupQuoteWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget start');
    try {
      setupQuoteWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupQuoteWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupQuoteWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupQuoteWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupNewsWidgetSafe = () => {
    const nWidget = (typeof newsWidget !== 'undefined' && newsWidget) || document.querySelector('.widget-news');
    if (!document || !document.body || !nWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupNewsWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget start');
    try {
      setupNewsWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupNewsWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupNewsWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupNewsWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupTodoWidgetSafe = async () => {
    const tWidget = (typeof todoWidget !== 'undefined' && todoWidget) || document.querySelector('.widget-todo');
    if (!document || !document.body || !tWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupTodoWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget start');
    try {
      await setupTodoWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupTodoWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupTodoWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupTodoWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupSearchSafe = async (options = {}) => {
    const sForm = (typeof searchForm !== 'undefined' && searchForm) || document.getElementById('search-form');
    const sInput = (typeof searchInput !== 'undefined' && searchInput) || document.getElementById('search-input');
    const sSelect = (typeof searchSelect !== 'undefined' && searchSelect) || document.getElementById('search-select');
    const sPanel = (typeof searchResultsPanel !== 'undefined' && searchResultsPanel) || document.getElementById('search-results-panel');
    const sWidget = (typeof searchWidget !== 'undefined' && searchWidget) || document.querySelector('.widget-search');

    if (!document || !document.body || !sForm || !sInput || !sSelect || !sPanel || !sWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupSearch', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch start');
    try {
      await setupSearch();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupSearch', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupSearch', elapsedMs);
      recordIdleTaskPerf('startup:setupSearch', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch end in', Math.round(elapsedMs), 'ms');
    }
    const currentPhase = typeof options.getStartupPhase === 'function' ? options.getStartupPhase() : (typeof STARTUP_PHASE !== 'undefined' ? STARTUP_PHASE : '');
    if (DEBUG_STARTUP_GUARDS && currentPhase === 'critical') {
      console.warn('[startup guard] setupSearchSafe ran during critical phase');
    }
  };

  const setupWeatherSafe = async (options = {}) => {
    const wWidget = (typeof weatherWidget !== 'undefined' && weatherWidget) || document.querySelector('.widget-weather');
    if (!document || !document.body || !wWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather start');
    try {
      await setupWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupWeather', elapsedMs);
      recordIdleTaskPerf('startup:setupWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather end in', Math.round(elapsedMs), 'ms');
    }
    const currentPhase = typeof options.getStartupPhase === 'function' ? options.getStartupPhase() : (typeof STARTUP_PHASE !== 'undefined' ? STARTUP_PHASE : '');
    if (DEBUG_STARTUP_GUARDS && currentPhase === 'critical') {
      console.warn('[startup guard] setupWeatherSafe ran during critical phase');
    }
  };

  const setupAppLauncherSafe = () => {
    const appsBtn = (typeof googleAppsBtn !== 'undefined' && googleAppsBtn) || document.getElementById('google-apps-btn');
    const appsPanel = (typeof googleAppsPanel !== 'undefined' && googleAppsPanel) || document.getElementById('google-apps-panel');

    if (!document || !document.body || !appsBtn || !appsPanel) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupAppLauncher', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher start');
    try {
      setupAppLauncher();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupAppLauncher', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupAppLauncher', elapsedMs);
      recordIdleTaskPerf('startup:setupAppLauncher', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher end in', Math.round(elapsedMs), 'ms');
    }
  };

  const fetchQuoteSafe = (options = {}) => {
    const qText = (typeof quoteText !== 'undefined' && quoteText) || document.getElementById('quote-text');
    const qAuthor = (typeof quoteAuthor !== 'undefined' && quoteAuthor) || document.getElementById('quote-author');

    if (!document || !document.body || !qText || !qAuthor) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:fetchQuote', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        renderCachedQuoteState(cachedState);
        return;
      }
      fetchQuote();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:fetchQuote', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('fetchQuote', elapsedMs);
      recordIdleTaskPerf('startup:fetchQuote', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote end in', Math.round(elapsedMs), 'ms');
    }
    const currentPhase = typeof options.getStartupPhase === 'function' ? options.getStartupPhase() : (typeof STARTUP_PHASE !== 'undefined' ? STARTUP_PHASE : '');
    if (DEBUG_STARTUP_GUARDS && currentPhase === 'critical') {
      console.warn('[startup guard] fetchQuoteSafe ran during critical phase');
    }
  };

  const scheduleStartupHydrationTasks = (options = {}) => {
    const scheduleTask = (options && typeof options.scheduleTask === 'function')
      ? options.scheduleTask
      : (typeof scheduleIdleTask === 'function' ? scheduleIdleTask : (typeof window !== 'undefined' ? window.scheduleIdleTask : null));

    if (typeof scheduleTask !== 'function') {
      console.warn('[startup guard] scheduleTask is not available for startup hydration');
      return;
    }

    const scheduleLabeled = (fn, label) => {
      if (!label.startsWith('startup:')) {
        console.warn('[startup guard] startup task label missing prefix', label);
      }
      if (!STARTUP_IDLE_LABELS.has(label)) {
        console.warn('[startup guard] startup task label not in allowlist', label);
      }
      scheduleTask(async () => {
        try {
          await fn();
        } catch (err) {
          console.warn('Startup task failed:', label, err);
        }
      }, label);
    };

    scheduleLabeled(() => loadCachedWeatherSafe(), 'startup:loadCachedWeather');
    scheduleLabeled(() => buildQuoteIndexSafe(), 'startup:quoteIndex');
    scheduleLabeled(() => setupQuoteWidgetSafe(), 'startup:setupQuoteWidget');
    scheduleLabeled(() => setupNewsWidgetSafe(), 'startup:setupNewsWidget');
    scheduleLabeled(() => setupTodoWidgetSafe(), 'startup:setupTodoWidget');
    scheduleLabeled(() => setupSearchSafe(options), 'startup:setupSearch');
    scheduleLabeled(() => setupWeatherSafe(options), 'startup:setupWeather');
    scheduleLabeled(() => setupAppLauncherSafe(), 'startup:setupAppLauncher');
    scheduleLabeled(() => fetchQuoteSafe(options), 'startup:fetchQuote');
  };

  window.HomebaseStartupHydration = {
    scheduleStartupHydrationTasks
  };
})();
