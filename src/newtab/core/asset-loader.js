// =============================================================================
// Homebase Dynamic Asset Loader Service
// Module: src/newtab/core/asset-loader.js
// Handles deduplicated dynamic script and stylesheet loading with error recovery.
// =============================================================================

const scriptLoadPromises = new Map();
const stylesheetLoadPromises = new Map();

function loadScriptOnce(src) {
  if (!src) {
    return Promise.reject(new Error('Script src is required'));
  }

  if (scriptLoadPromises.has(src)) {
    return scriptLoadPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err || new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  scriptLoadPromises.set(src, promise);

  promise.catch(() => {
    scriptLoadPromises.delete(src);
  });

  return promise;
}

function loadStylesheetOnce(href) {
  if (!href) {
    return Promise.reject(new Error('Stylesheet href is required'));
  }

  if (stylesheetLoadPromises.has(href)) {
    return stylesheetLoadPromises.get(href);
  }

  const promise = new Promise((resolve, reject) => {
    const existingLink = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => link.getAttribute('href') === href);

    if (existingLink) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = (err) => reject(err || new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });

  stylesheetLoadPromises.set(href, promise);

  promise.catch(() => {
    stylesheetLoadPromises.delete(href);
  });

  return promise;
}

const HomebaseAssetLoader = {
  loadScriptOnce,
  loadStylesheetOnce,
  getScriptPromises: () => scriptLoadPromises,
  getStylesheetPromises: () => stylesheetLoadPromises,
  scriptLoadPromises,
  stylesheetLoadPromises
};

if (typeof window !== 'undefined') {
  window.HomebaseAssetLoader = HomebaseAssetLoader;
  window.loadScriptOnce = loadScriptOnce;
  window.loadStylesheetOnce = loadStylesheetOnce;
}
