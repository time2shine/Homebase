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
})();
