(function () {
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

  function applyInitial(url) {
    if (!url) return;

    // 1. Store the raw URL so new-tab.js can compare without CSS normalization
    document.documentElement.dataset.initialWallpaper = url;

    // 2. Make it available to CSS immediately
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${url}")`);

  }

  // Fast path: synchronous localStorage
  let url = '';
  let dataUrl = '';
  try {
    if (window.localStorage) {
      dataUrl = localStorage.getItem('cachedAppliedPosterDataUrl') || '';
      url = localStorage.getItem('cachedAppliedPosterUrl') || '';
    }
  } catch (e) {
    url = '';
    dataUrl = '';
  }

  const initial = dataUrl || url;
  if (initial) {
    applyInitial(initial);
  }

  // Fallback: async extension storage
  const browserApi = window.browser || window.chrome;
  if (!browserApi || !browserApi.storage || !browserApi.storage.local) return;

  browserApi.storage.local
    .get(['cachedAppliedPosterDataUrl', 'cachedAppliedPosterUrl'])
    .then((res) => {
      const asyncDataUrl = res && res.cachedAppliedPosterDataUrl;
      const asyncUrl = res && res.cachedAppliedPosterUrl;
      const pick = asyncDataUrl || asyncUrl || '';
      // Avoid double-paint if we already used this value from localStorage
      if (!pick || pick === initial) return;

      applyInitial(pick);
      try {
        if (window.localStorage) {
          if (asyncDataUrl) {
            localStorage.setItem('cachedAppliedPosterDataUrl', asyncDataUrl);
          }
          if (asyncUrl) {
            localStorage.setItem('cachedAppliedPosterUrl', asyncUrl);
          }
        }
      } catch (e) {}
    })
    .catch(() => {});

  const SIDEBAR_PREF_KEY = 'appShowSidebar';
  const WEATHER_PREF_KEY = 'appShowWeather';
  const QUOTE_PREF_KEY = 'appShowQuote';
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
    .get([WEATHER_PREF_KEY, QUOTE_PREF_KEY])
    .then((res) => {
      const storedWeather = res && Object.prototype.hasOwnProperty.call(res, WEATHER_PREF_KEY) ? res[WEATHER_PREF_KEY] : undefined;
      const storedQuote = res && Object.prototype.hasOwnProperty.call(res, QUOTE_PREF_KEY) ? res[QUOTE_PREF_KEY] : undefined;
      const shouldShowWeather = storedWeather !== false;
      const shouldShowQuote = storedQuote !== false;
      const nextFastWeatherState = shouldShowWeather ? '1' : '0';
      const nextFastQuoteState = shouldShowQuote ? '1' : '0';

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
    })
    .catch(() => {});
})();
