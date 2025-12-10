(function () {
  function applyInitial(url) {
    if (!url) return;

    // 1. Store the raw URL so new-tab.js can compare without CSS normalization
    document.documentElement.dataset.initialWallpaper = url;

    // 2. Make it available to CSS immediately
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${url}")`);

  }

  // Fast path: synchronous localStorage
  let url = '';
  try {
    if (window.localStorage) {
      url = localStorage.getItem('cachedAppliedPosterUrl') || '';
    }
  } catch (e) {
    url = '';
  }

  if (url) {
    applyInitial(url);
  }

  // Fallback: async extension storage
  const browserApi = window.browser || window.chrome;
  if (!browserApi || !browserApi.storage || !browserApi.storage.local) return;

  browserApi.storage.local
    .get('cachedAppliedPosterUrl')
    .then((res) => {
      const asyncUrl = res && res.cachedAppliedPosterUrl;
      // Avoid double-paint if we already used this URL from localStorage
      if (!asyncUrl || asyncUrl === url) return;

      applyInitial(asyncUrl);
      try {
        if (window.localStorage) {
          localStorage.setItem('cachedAppliedPosterUrl', asyncUrl);
        }
      } catch (e) {}
    })
    .catch(() => {});
})();
