(function () {
  const WALLPAPER_STARTUP_STATE_KEY = 'wallpaperStartupState';
  const WALLPAPER_SELECTION_KEY = 'wallpaperSelection';
  const DAILY_ROTATION_KEY = 'dailyWallpaperEnabled';
  const CACHED_APPLIED_POSTER_DATA_URL_KEY = 'cachedAppliedPosterDataUrl';
  const FAST_PERFORMANCE_MODE_KEY = 'fast-performance-mode';
  const SKIP_STARTUP_WALLPAPER_FALLBACK_ATTR = 'data-skip-startup-wallpaper-fallback';
  // Refuse oversized data URLs here; new-tab.js must write startup poster data URLs below this limit.
  const MAX_PRELOAD_POSTER_DATA_URL_LENGTH = 250000;

  window.__HB_STARTUP_PERF = window.__HB_STARTUP_PERF || [];

  function hbStartupPerfMark(name, detail) {
    try {
      const entryName = typeof name === 'string' && name ? name : 'unknown';
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      const entry = {
        name: entryName,
        time: Math.round(now)
      };

      if (detail && typeof detail === 'object') {
        entry.detail = detail;
      }

      if (!Array.isArray(window.__HB_STARTUP_PERF)) {
        window.__HB_STARTUP_PERF = [];
      }

      window.__HB_STARTUP_PERF.push(entry);

      if (window.__HB_STARTUP_PERF.length > 80) {
        window.__HB_STARTUP_PERF.splice(0, window.__HB_STARTUP_PERF.length - 80);
      }

      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        performance.mark(`hb:${entryName}`);
      }
    } catch (e) {}
  }

  hbStartupPerfMark('preload:start');

  let fastPerformanceMode = false;
  try {
    fastPerformanceMode = !!(window.localStorage && localStorage.getItem(FAST_PERFORMANCE_MODE_KEY) === '1');
  } catch (e) {
    fastPerformanceMode = false;
  }
  hbStartupPerfMark('preload:performance-mode-fast-path', {
    enabled: fastPerformanceMode ? 'yes' : 'no'
  });

  function getLocalDayStamp(ts) {
    const date = new Date(ts || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDailyRotationDue(selectedAt, allowDailyRotation) {
    const stamp = Number(selectedAt || 0);
    if (allowDailyRotation === false || !Number.isFinite(stamp) || stamp <= 0) return false;
    return getLocalDayStamp(stamp) !== getLocalDayStamp(Date.now());
  }

  function setSkipStartupWallpaperFallback(enabled) {
    document.documentElement.toggleAttribute(SKIP_STARTUP_WALLPAPER_FALLBACK_ATTR, !!enabled);
  }

  function clearInitialWallpaper() {
    document.documentElement.style.removeProperty('--initial-wallpaper');
    delete document.documentElement.dataset.initialWallpaper;
  }

  function removeOversizedCachedPosterDataUrl(browserApi) {
    try {
      if (window.localStorage) {
        const storedDataUrl = localStorage.getItem(CACHED_APPLIED_POSTER_DATA_URL_KEY) || '';
        if (storedDataUrl && storedDataUrl.length > MAX_PRELOAD_POSTER_DATA_URL_LENGTH) {
          localStorage.removeItem(CACHED_APPLIED_POSTER_DATA_URL_KEY);
          hbStartupPerfMark('preload:oversized-data-url-removed', { source: 'localStorage' });
        }
      }
    } catch (e) {}

    try {
      const storage = browserApi && browserApi.storage && browserApi.storage.local;
      if (storage && typeof storage.remove === 'function') {
        const result = storage.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
        hbStartupPerfMark('preload:oversized-data-url-removed', { source: 'storage.local' });
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      }
    } catch (e) {}
  }

  // Instant Background Dim (sync fast path)
  try {
    const raw = (window.localStorage && localStorage.getItem('fast-bg-dim')) || '';
    if (raw !== '') {
      let v = parseInt(raw, 10);
      if (!Number.isFinite(v)) v = 0;
      if (v < 0) v = 0;
      if (v > 90) v = 90;
      const opacity = v / 100;
      document.documentElement.style.setProperty('--bg-dim-opacity', String(opacity));
    }
  } catch (e) {
    // Ignore; dim is optional
  }

  // Instant Sidebar Visibility (sync fast path)
  let fastSidebarState = '';
  try {
    const rawSidebar = (window.localStorage && localStorage.getItem('fast-show-sidebar')) || '';
    if (rawSidebar === '0' || rawSidebar === '1') {
      fastSidebarState = rawSidebar;
      document.documentElement.classList.toggle('sidebar-hidden', rawSidebar === '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  // Instant Weather Visibility (sync fast path)
  let fastWeatherState = '';
  try {
    const rawWeather = (window.localStorage && localStorage.getItem('fast-show-weather')) || '';
    if (rawWeather === '0' || rawWeather === '1') {
      fastWeatherState = rawWeather;
      document.documentElement.classList.toggle('weather-hidden', rawWeather === '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  // Instant Quote Visibility (sync fast path)
  let fastQuoteState = '';
  try {
    const rawQuote = (window.localStorage && localStorage.getItem('fast-show-quote')) || '';
    if (rawQuote === '0' || rawQuote === '1') {
      fastQuoteState = rawQuote;
      document.documentElement.classList.toggle('quote-hidden', rawQuote === '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  // Instant News Visibility (sync fast path)
  let fastNewsState = '';
  try {
    const rawNews = (window.localStorage && localStorage.getItem('fast-show-news')) || '';
    if (rawNews === '0' || rawNews === '1') {
      fastNewsState = rawNews;
      document.documentElement.classList.toggle('news-hidden', rawNews === '0');
    } else {
      fastNewsState = '0';
      document.documentElement.classList.add('news-hidden');
    }
  } catch (e) {
    fastNewsState = '0';
    document.documentElement.classList.add('news-hidden');
  }

  // Instant To-Do Visibility (sync fast path)
  let fastTodoState = '';
  try {
    const rawTodo = (window.localStorage && localStorage.getItem('fast-show-todo')) || '';
    if (rawTodo === '0' || rawTodo === '1') {
      fastTodoState = rawTodo;
      document.documentElement.classList.toggle('todo-hidden', rawTodo === '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  function applyInitial(url) {
    if (!url) return;

    setSkipStartupWallpaperFallback(false);

    // 1. Store the raw URL so new-tab.js can compare without CSS normalization
    document.documentElement.dataset.initialWallpaper = url;

    // 2. Make it available to CSS immediately
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${url}")`);

  }

  // Fast path: synchronous localStorage
  let url = '';
  let dataUrl = '';
  let skipInitialWallpaper = false;
  try {
    if (window.localStorage) {
      dataUrl = fastPerformanceMode ? '' : (localStorage.getItem(CACHED_APPLIED_POSTER_DATA_URL_KEY) || '');
      url = localStorage.getItem('cachedAppliedPosterUrl') || '';
      const startupStateRaw = localStorage.getItem(WALLPAPER_STARTUP_STATE_KEY) || '';
      if (startupStateRaw) {
        const startupState = JSON.parse(startupStateRaw);
        skipInitialWallpaper = isDailyRotationDue(startupState && startupState.selectedAt, startupState && startupState.dailyRotationEnabled);
      }
    }
  } catch (e) {
    url = '';
    dataUrl = '';
    skipInitialWallpaper = false;
  }

  hbStartupPerfMark('preload:localStorage-read-complete', {
    dataUrl: dataUrl ? 'present' : 'none',
    url: url ? 'present' : 'none'
  });

  setSkipStartupWallpaperFallback(skipInitialWallpaper);

  const oversizedDataUrl = dataUrl && dataUrl.length > MAX_PRELOAD_POSTER_DATA_URL_LENGTH;
  if (oversizedDataUrl) {
    removeOversizedCachedPosterDataUrl();
  }

  const safeDataUrl =
    dataUrl && dataUrl.length <= MAX_PRELOAD_POSTER_DATA_URL_LENGTH
      ? dataUrl
      : '';
  const performanceModeInitial = fastPerformanceMode ? (url || 'assets/fallback.webp') : '';
  const initial = skipInitialWallpaper ? '' : (fastPerformanceMode ? performanceModeInitial : (safeDataUrl || url));
  const usedSafeLocalDataUrl = !fastPerformanceMode && !!safeDataUrl && initial === safeDataUrl;
  if (skipInitialWallpaper) {
    hbStartupPerfMark('preload:initial-wallpaper-skipped-daily-rotation');
  }
  if (initial) {
    applyInitial(initial);
    hbStartupPerfMark('preload:initial-wallpaper-applied', {
      source: fastPerformanceMode
        ? (url ? 'performance-mode-url' : 'performance-mode-fallback')
        : (safeDataUrl ? 'localStorage-data-url' : 'localStorage-url')
    });
    if (fastPerformanceMode) {
      hbStartupPerfMark(url
        ? 'preload:performance-mode-poster-url-applied'
        : 'preload:performance-mode-fallback-poster-applied');
    }
  }

  // Fallback: async extension storage
  const browserApi = window.browser || window.chrome;
  if (!browserApi || !browserApi.storage || !browserApi.storage.local) return;

  const wallpaperStorageKeys = fastPerformanceMode
    ? ['cachedAppliedPosterUrl', WALLPAPER_SELECTION_KEY, DAILY_ROTATION_KEY]
    : [CACHED_APPLIED_POSTER_DATA_URL_KEY, 'cachedAppliedPosterUrl', WALLPAPER_SELECTION_KEY, DAILY_ROTATION_KEY];

  browserApi.storage.local
    .get(wallpaperStorageKeys)
    .then((res) => {
      const asyncDataUrl = fastPerformanceMode ? '' : (res && res[CACHED_APPLIED_POSTER_DATA_URL_KEY]);
      hbStartupPerfMark('preload:async-storage-read-complete', {
        dataUrl: asyncDataUrl ? 'present' : 'none',
        url: res && res.cachedAppliedPosterUrl ? 'present' : 'none'
      });

      const selection = res && res[WALLPAPER_SELECTION_KEY];
      const allowDailyRotation = !res || !Object.prototype.hasOwnProperty.call(res, DAILY_ROTATION_KEY) || res[DAILY_ROTATION_KEY] !== false;
      if (isDailyRotationDue(selection && selection.selectedAt, allowDailyRotation)) {
        setSkipStartupWallpaperFallback(true);
        clearInitialWallpaper();
        hbStartupPerfMark('preload:initial-wallpaper-skipped-daily-rotation');
        return;
      }

      setSkipStartupWallpaperFallback(false);

      const asyncUrl = res && res.cachedAppliedPosterUrl;
      if (asyncDataUrl && asyncDataUrl.length > MAX_PRELOAD_POSTER_DATA_URL_LENGTH) {
        removeOversizedCachedPosterDataUrl(browserApi);
      }
      const safeAsyncDataUrl =
        asyncDataUrl && asyncDataUrl.length <= MAX_PRELOAD_POSTER_DATA_URL_LENGTH
          ? asyncDataUrl
          : '';
      const pick = fastPerformanceMode
        ? (asyncUrl || (url ? '' : 'assets/fallback.webp'))
        : (safeAsyncDataUrl || (usedSafeLocalDataUrl ? '' : (asyncUrl || '')));
      // Avoid double-paint if we already used this value from localStorage
      if (!pick || pick === initial) return;

      applyInitial(pick);
      hbStartupPerfMark('preload:async-wallpaper-applied', {
        source: safeAsyncDataUrl ? 'storage.local-data-url' : 'storage.local-url'
      });
      try {
        if (window.localStorage) {
          if (safeAsyncDataUrl) {
            localStorage.setItem(CACHED_APPLIED_POSTER_DATA_URL_KEY, safeAsyncDataUrl);
          }
          if (asyncUrl) {
            localStorage.setItem('cachedAppliedPosterUrl', asyncUrl);
          }
        }
      } catch (e) {}
    })
    .catch(() => {
      hbStartupPerfMark('preload:async-storage-read-complete', { status: 'failed' });
    });

  const SIDEBAR_PREF_KEY = 'appShowSidebar';
  const WEATHER_PREF_KEY = 'appShowWeather';
  const QUOTE_PREF_KEY = 'appShowQuote';
  const NEWS_PREF_KEY = 'appShowNews';
  const TODO_PREF_KEY = 'appShowTodo';
  browserApi.storage.local
    .get([SIDEBAR_PREF_KEY])
    .then((res) => {
      const stored = res && Object.prototype.hasOwnProperty.call(res, SIDEBAR_PREF_KEY) ? res[SIDEBAR_PREF_KEY] : undefined;
      const shouldShowSidebar = stored !== false;
      const nextFastState = shouldShowSidebar ? '1' : '0';
      if (fastSidebarState === nextFastState) return;

      document.documentElement.classList.toggle('sidebar-hidden', !shouldShowSidebar);
      try {
        if (window.localStorage) {
          localStorage.setItem('fast-show-sidebar', nextFastState);
        }
      } catch (e) {}
    })
    .catch(() => {});

  browserApi.storage.local
    .get([WEATHER_PREF_KEY, QUOTE_PREF_KEY, NEWS_PREF_KEY, TODO_PREF_KEY])
    .then((res) => {
      const storedWeather = res && Object.prototype.hasOwnProperty.call(res, WEATHER_PREF_KEY) ? res[WEATHER_PREF_KEY] : undefined;
      const storedQuote = res && Object.prototype.hasOwnProperty.call(res, QUOTE_PREF_KEY) ? res[QUOTE_PREF_KEY] : undefined;
      const storedNews = res && Object.prototype.hasOwnProperty.call(res, NEWS_PREF_KEY) ? res[NEWS_PREF_KEY] : undefined;
      const storedTodo = res && Object.prototype.hasOwnProperty.call(res, TODO_PREF_KEY) ? res[TODO_PREF_KEY] : undefined;
      const shouldShowWeather = storedWeather !== false;
      const shouldShowQuote = storedQuote !== false;
      const shouldShowNews = storedNews === true;
      const shouldShowTodo = storedTodo !== false;
      const nextFastWeatherState = shouldShowWeather ? '1' : '0';
      const nextFastQuoteState = shouldShowQuote ? '1' : '0';
      const nextFastNewsState = shouldShowNews ? '1' : '0';
      const nextFastTodoState = shouldShowTodo ? '1' : '0';

      if (fastWeatherState !== nextFastWeatherState) {
        document.documentElement.classList.toggle('weather-hidden', !shouldShowWeather);
        try {
          if (window.localStorage) {
            localStorage.setItem('fast-show-weather', nextFastWeatherState);
          }
        } catch (e) {}
      }

      if (fastQuoteState !== nextFastQuoteState) {
        document.documentElement.classList.toggle('quote-hidden', !shouldShowQuote);
        try {
          if (window.localStorage) {
            localStorage.setItem('fast-show-quote', nextFastQuoteState);
          }
        } catch (e) {}
      }

      if (fastNewsState !== nextFastNewsState) {
        document.documentElement.classList.toggle('news-hidden', !shouldShowNews);
        try {
          if (window.localStorage) {
            localStorage.setItem('fast-show-news', nextFastNewsState);
          }
        } catch (e) {}
      }

      if (fastTodoState !== nextFastTodoState) {
        document.documentElement.classList.toggle('todo-hidden', !shouldShowTodo);
        try {
          if (window.localStorage) {
            localStorage.setItem('fast-show-todo', nextFastTodoState);
          }
        } catch (e) {}
      }
    })
    .catch(() => {});
})();
