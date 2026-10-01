// ===================================================================
// Homebase Performance & Visual Runtime Controller
//
// Manages performance mode state, fast mirror synchronization,
// DOM class toggling, and visual effects (glass, animations, background dim)
// runtime adjustments.
// ===================================================================

(function() {
  'use strict';

  const APP_PERFORMANCE_MODE_KEY = 'appPerformanceMode';
  const FAST_PERFORMANCE_MODE_KEY = 'fast-performance-mode';
  const APP_GLASS_STYLE_KEY = 'appGlassStylePref';
  const APP_GRID_ANIMATION_KEY = 'appGridAnimationPref';
  const APP_GRID_ANIMATION_SPEED_KEY = 'appGridAnimationSpeed';
  const APP_GRID_ANIMATION_ENABLED_KEY = 'appGridAnimationEnabled';
  const APP_BACKGROUND_DIM_KEY = 'appBackgroundDimPref';

  let _performanceMode = readFastPerformanceModePreference();
  let _glassStyle = 'original';
  let _gridAnimation = 'default';
  let _gridAnimationSpeed = 0.3;
  let _gridAnimationEnabled = false;
  let _backgroundDim = 0;
  let _initialized = false;

  function getStorage() {
    return (typeof window !== 'undefined' && window.HomebaseStorage) ? window.HomebaseStorage : null;
  }

  function readFastPerformanceModePreference() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      return window.localStorage.getItem(FAST_PERFORMANCE_MODE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function syncFastPerformanceModeMirror(enabled) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(FAST_PERFORMANCE_MODE_KEY, enabled === true ? '1' : '0');
    } catch (e) {}
  }

  function isPerformanceModeEnabled() {
    return _performanceMode === true;
  }

  function disableGridAnimationRuntime() {
    if (typeof document === 'undefined') return;

    if (document.body) {
      document.body.classList.remove('grid-animation-enabled');
    }

    let styleEl = document.getElementById('dynamic-grid-animation');
    if (!styleEl && document.createElement) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-grid-animation';
      if (document.head) document.head.appendChild(styleEl);
    }
    if (styleEl) styleEl.innerHTML = '';

    const container = document.getElementById('grid-animation-sub-settings');
    if (container && typeof setSubSettingsExpanded === 'function') {
      setSubSettingsExpanded(container, false);
    }

    if (document.querySelectorAll) {
      document.querySelectorAll('.bookmark-item.newly-rendered').forEach((item) => {
        item.classList.remove('newly-rendered');
        item.style.animation = 'none';
      });
    }
  }

  function disableGlassRuntime() {
    if (typeof document === 'undefined') return;

    let styleEl = document.getElementById('dynamic-glass-style');
    if (!styleEl && document.createElement) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-glass-style';
      if (document.head) document.head.appendChild(styleEl);
    }
    if (styleEl) styleEl.innerHTML = '';

    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.setProperty('--glass-blur', '0px');
      document.documentElement.style.setProperty('--glass-bg', 'transparent');
      document.documentElement.style.setProperty('--overlay-blur', '0px');
    }
  }

  function enableGlassRuntimeFromPreference(preferredStyle) {
    if (typeof document === 'undefined') return;

    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.removeProperty('--glass-blur');
      document.documentElement.style.removeProperty('--glass-bg');
      document.documentElement.style.removeProperty('--overlay-blur');
    }

    const style = preferredStyle || _glassStyle || 'original';
    if (typeof applyGlassStyle === 'function') {
      applyGlassStyle(style);
    }
  }

  function applyPerformanceMode(enabled, options = {}) {
    const isOn = !!enabled;
    _performanceMode = isOn;
    syncFastPerformanceModeMirror(isOn);

    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.classList.toggle('performance-mode', isOn);
      }

      const perfToggle = document.getElementById('app-performance-mode-toggle');
      if (perfToggle) perfToggle.checked = isOn;

      const rowsToHide = [
        document.getElementById('app-grid-animation-row'),
        document.getElementById('app-glass-style-row'),
        document.getElementById('app-cinema-mode-row'),
        document.getElementById('grid-animation-sub-settings')
      ];

      rowsToHide.forEach((row) => {
        if (row) row.style.display = isOn ? 'none' : '';
      });
    }

    if (typeof appPerformanceModePreference !== 'undefined') {
      appPerformanceModePreference = isOn;
    }
    if (typeof window !== 'undefined') {
      window.appPerformanceModePreference = isOn;
    }

    if (isOn) {
      disableGridAnimationRuntime();
      disableGlassRuntime();
      if (typeof disableCinemaModeRuntime === 'function') {
        disableCinemaModeRuntime();
      }
      if (typeof options.onVideoCleanup === 'function') {
        options.onVideoCleanup();
      } else {
        if (typeof cleanupBackgroundPlayback === 'function') {
          cleanupBackgroundPlayback();
        } else if (typeof window !== 'undefined' && typeof window.cleanupBackgroundPlayback === 'function') {
          window.cleanupBackgroundPlayback();
        }
        if (typeof clearBackgroundVideos === 'function') {
          clearBackgroundVideos();
        } else if (typeof window !== 'undefined' && typeof window.clearBackgroundVideos === 'function') {
          window.clearBackgroundVideos();
        }
      }
      return { performanceMode: true };
    }

    // Turning off performance mode: restore visual effects
    const glassStyle = options.appGlassStylePreference ||
      (typeof appGlassStylePreference !== 'undefined' ? appGlassStylePreference : (typeof window !== 'undefined' ? window.appGlassStylePreference : _glassStyle));
    enableGlassRuntimeFromPreference(glassStyle);

    const gridAnim = options.appGridAnimationPreference ||
      (typeof appGridAnimationPreference !== 'undefined' ? appGridAnimationPreference : (typeof window !== 'undefined' ? window.appGridAnimationPreference : _gridAnimation));
    if (typeof applyGridAnimation === 'function') {
      applyGridAnimation(gridAnim);
    }

    const gridSpeed = options.appGridAnimationSpeedPreference !== undefined
      ? options.appGridAnimationSpeedPreference
      : (typeof appGridAnimationSpeedPreference !== 'undefined' ? appGridAnimationSpeedPreference : (typeof window !== 'undefined' ? window.appGridAnimationSpeedPreference : _gridAnimationSpeed));
    if (typeof applyGridAnimationSpeed === 'function') {
      applyGridAnimationSpeed(gridSpeed);
    } else {
      setGridAnimationSpeed(gridSpeed);
    }

    const gridEnabled = options.appGridAnimationEnabledPreference !== undefined
      ? options.appGridAnimationEnabledPreference
      : (typeof appGridAnimationEnabledPreference !== 'undefined' ? appGridAnimationEnabledPreference : (typeof window !== 'undefined' ? window.appGridAnimationEnabledPreference : _gridAnimationEnabled));
    if (typeof applyGridAnimationEnabled === 'function') {
      applyGridAnimationEnabled(gridEnabled);
    } else {
      setGridAnimationEnabled(gridEnabled);
    }

    if (typeof options.onCinemaModeReset === 'function') {
      options.onCinemaModeReset();
    } else if (typeof resetCinemaMode === 'function') {
      if (typeof setupCinemaModeListeners === 'function') setupCinemaModeListeners();
      resetCinemaMode();
    } else if (typeof window !== 'undefined' && typeof window.resetCinemaMode === 'function') {
      if (typeof window.setupCinemaModeListeners === 'function') window.setupCinemaModeListeners();
      window.resetCinemaMode();
    }

    return { performanceMode: false };
  }

  function setGlassStyle(styleId) {
    const next = styleId || 'original';
    _glassStyle = next;
    if (isPerformanceModeEnabled()) return;
    if (typeof applyGlassStyle === 'function') {
      applyGlassStyle(next);
    }
  }

  function setGridAnimationSpeed(seconds) {
    const valid = parseFloat(seconds) || 0.3;
    _gridAnimationSpeed = valid;
    if (isPerformanceModeEnabled()) return;

    if (typeof document !== 'undefined') {
      if (document.documentElement && document.documentElement.style) {
        document.documentElement.style.setProperty('--grid-animation-duration', `${valid}s`);
        document.documentElement.style.setProperty('--grid-animation-speed', `${valid}s`);
      }
      const label = document.getElementById('app-grid-animation-speed-value');
      const slider = document.getElementById('app-grid-animation-speed-slider');
      if (label) label.textContent = `${valid}s`;
      if (slider) slider.value = valid;
    }
  }

  function setGridAnimationEnabled(enabled) {
    const isOn = !!enabled;
    _gridAnimationEnabled = isOn;
    if (isPerformanceModeEnabled()) return;

    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.classList.toggle('grid-animation-enabled', isOn);
      }
      const toggle = document.getElementById('app-grid-animation-toggle');
      if (toggle) toggle.checked = isOn;
      const container = document.getElementById('grid-animation-sub-settings');
      if (container && typeof setSubSettingsExpanded === 'function') {
        setSubSettingsExpanded(container, isOn);
      }
    }
  }

  function setBackgroundDim(value) {
    const parsed = parseInt(value, 10);
    const nextValue = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 90) : 0;
    _backgroundDim = nextValue;

    if (typeof document !== 'undefined') {
      const opacity = nextValue / 100;
      if (document.documentElement && document.documentElement.style) {
        document.documentElement.style.setProperty('--bg-dim-opacity', opacity);
      }
      let overlay = document.getElementById('background-dim-overlay');
      if (!overlay && document.createElement && document.body) {
        overlay = document.createElement('div');
        overlay.id = 'background-dim-overlay';
        document.body.prepend(overlay);
      }
    }
  }

  function applyVisualEffects(preferences = {}) {
    if (preferences.glassStyle !== undefined) _glassStyle = preferences.glassStyle;
    if (preferences.gridAnimation !== undefined) _gridAnimation = preferences.gridAnimation;
    if (preferences.gridAnimationSpeed !== undefined) _gridAnimationSpeed = preferences.gridAnimationSpeed;
    if (preferences.gridAnimationEnabled !== undefined) _gridAnimationEnabled = preferences.gridAnimationEnabled;
    if (preferences.backgroundDim !== undefined) _backgroundDim = preferences.backgroundDim;

    if (preferences.backgroundDim !== undefined) {
      setBackgroundDim(preferences.backgroundDim);
    }

    if (isPerformanceModeEnabled()) return;

    if (preferences.glassStyle !== undefined) {
      setGlassStyle(preferences.glassStyle);
    }
    if (preferences.gridAnimation !== undefined && typeof applyGridAnimation === 'function') {
      applyGridAnimation(preferences.gridAnimation);
    }
    if (preferences.gridAnimationSpeed !== undefined) {
      setGridAnimationSpeed(preferences.gridAnimationSpeed);
    }
    if (preferences.gridAnimationEnabled !== undefined) {
      setGridAnimationEnabled(preferences.gridAnimationEnabled);
    }
  }

  async function initialize(options = {}) {
    _performanceMode = readFastPerformanceModePreference();
    if (options.initialPerformanceMode !== undefined) {
      _performanceMode = !!options.initialPerformanceMode;
    }

    const storage = getStorage();
    if (options.loadStorage !== false && storage && typeof storage.get === 'function') {
      try {
        const storedPerf = await storage.get(APP_PERFORMANCE_MODE_KEY, _performanceMode);
        if (typeof storedPerf === 'boolean') {
          _performanceMode = storedPerf;
          syncFastPerformanceModeMirror(storedPerf);
        }
      } catch (e) {}
    }

    applyPerformanceMode(_performanceMode, options);

    if (options.visualEffects) {
      applyVisualEffects(options.visualEffects);
    }

    _initialized = true;
    return {
      performanceMode: _performanceMode,
      glassStyle: _glassStyle,
      gridAnimation: _gridAnimation,
      gridAnimationSpeed: _gridAnimationSpeed,
      gridAnimationEnabled: _gridAnimationEnabled,
      backgroundDim: _backgroundDim
    };
  }

  const HomebasePerformanceController = {
    initialize,
    applyPerformanceMode,
    applyPerformanceModeState: applyPerformanceMode,
    applyVisualEffects,
    setGlassStyle,
    setGridAnimationSpeed,
    setGridAnimationEnabled,
    setBackgroundDim,
    isPerformanceModeEnabled,
    readFastPerformanceModePreference,
    syncFastPerformanceModeMirror,
    disableGridAnimationRuntime,
    disableGlassRuntime,
    enableGlassRuntimeFromPreference,
    getPerformanceMode: isPerformanceModeEnabled,
    getState: () => ({
      performanceMode: _performanceMode,
      glassStyle: _glassStyle,
      gridAnimation: _gridAnimation,
      gridAnimationSpeed: _gridAnimationSpeed,
      gridAnimationEnabled: _gridAnimationEnabled,
      backgroundDim: _backgroundDim,
      initialized: _initialized
    })
  };

  if (typeof window !== 'undefined') {
    window.HomebasePerformanceController = HomebasePerformanceController;
    if (typeof window.isPerformanceModeEnabled !== 'function') {
      window.isPerformanceModeEnabled = isPerformanceModeEnabled;
    }
    window.applyPerformanceModeState = applyPerformanceMode;
    window.applyPerformanceMode = applyPerformanceMode;
    window.readFastPerformanceModePreference = readFastPerformanceModePreference;
    window.syncFastPerformanceModeMirror = syncFastPerformanceModeMirror;
    window.disableGridAnimationRuntime = disableGridAnimationRuntime;
    window.disableGlassRuntime = disableGlassRuntime;
    window.enableGlassRuntimeFromPreference = enableGlassRuntimeFromPreference;
  }
})();
