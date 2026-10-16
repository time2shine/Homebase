// Build Target Configuration Service
// Module: src/newtab/core/build-config.js
// Provides explicit distribution build-target metadata and capabilities.
// Generated/overridden per distribution target by scripts/build.mjs.

(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  const DEFAULT_CONFIG = Object.freeze({
    target: 'source',
    browserDefaultSearch: false
  });

  if (!globalScope.HomebaseBuildConfig) {
    globalScope.HomebaseBuildConfig = DEFAULT_CONFIG;
  }

  function isBrowserDefaultSearch() {
    const config = globalScope.HomebaseBuildConfig;
    return Boolean(config && config.browserDefaultSearch);
  }

  function getBuildTarget() {
    const config = globalScope.HomebaseBuildConfig;
    return (config && config.target) || 'source';
  }

  globalScope.isBrowserDefaultSearch = isBrowserDefaultSearch;
  globalScope.getBuildTarget = getBuildTarget;
})();
