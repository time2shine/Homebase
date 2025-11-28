(function() {
  const browserApi = window.browser || window.chrome;
  if (!browserApi || !browserApi.storage || !browserApi.storage.local) return;

  browserApi.storage.local.get('cachedAppliedPosterUrl').then((res) => {
    const url = res && res.cachedAppliedPosterUrl;
    if (!url) return;

    const style = document.createElement('style');
    style.textContent = `:root { --initial-wallpaper: url("${url}"); }`;
    document.head.appendChild(style);
  }).catch(() => {});
})();
