(function () {
  function applyInitial(url) {
    if (!url) return;

    // 1) Make it available to CSS immediately for first paint
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${url}")`);

    // 2) Push it into the HTML <video> poster as soon as the body exists
    const applyToVideos = () => {
      const videos = document.querySelectorAll('.background-video');
      videos.forEach((v) => {
        v.poster = url;
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyToVideos, { once: true });
    } else {
      applyToVideos();
    }
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
      if (!asyncUrl) return;
      applyInitial(asyncUrl);
      try {
        if (window.localStorage) {
          localStorage.setItem('cachedAppliedPosterUrl', asyncUrl);
        }
      } catch (e) {}
    })
    .catch(() => {});
})();
