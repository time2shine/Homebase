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

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  let _performanceMode = readFastPerformanceModePreference();
  let _glassStyle = 'original';
  let _gridAnimation = 'default';
  let _gridAnimationSpeed = 0.3;
  let _gridAnimationEnabled = false;
  let _backgroundDim = 0;
  let _initialized = false;
  let _perfWriteQueue = Promise.resolve();
  let _perfWriteTicket = 0;

  function getStorage() {
    return (typeof window !== 'undefined' && window.HomebaseStorage)
      ? window.HomebaseStorage
      : ((typeof globalScope !== 'undefined' && globalScope.HomebaseStorage) ? globalScope.HomebaseStorage : null);
  }

  function persistPerformanceMode(enabled) {
    const nextVal = enabled === true;
    const ticket = ++_perfWriteTicket;

    const task = async () => {
      if (ticket < _perfWriteTicket) {
        return { success: true, value: nextVal, superseded: true };
      }

      let storageRestored = true;
      let storageError = null;

      try {
        const storage = getStorage();
        if (storage && typeof storage.set === 'function') {
          const res = await storage.set(APP_PERFORMANCE_MODE_KEY, nextVal);
          if (res && res.success === false) {
            storageRestored = false;
            storageError = new Error(res.detail || res.error || 'Failed to persist appPerformanceMode');
          }
        } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          await browser.storage.local.set({ [APP_PERFORMANCE_MODE_KEY]: nextVal });
        } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ [APP_PERFORMANCE_MODE_KEY]: nextVal });
        }
      } catch (err) {
        storageRestored = false;
        storageError = err;
      }

      if (ticket === _perfWriteTicket) {
        syncFastPerformanceModeMirror(nextVal);
      }

      if (!storageRestored) {
        return { success: false, error: storageError };
      }
      return { success: true, value: nextVal };
    };

    _perfWriteQueue = _perfWriteQueue.catch(() => {}).then(task);
    return _perfWriteQueue;
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
      const strVal = enabled === true ? '1' : '0';
      window.localStorage.setItem(FAST_PERFORMANCE_MODE_KEY, strVal);
      window.localStorage.setItem('fast-perf-mode', strVal);
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
      if (document.querySelectorAll) {
        // Ensure already-open, non-closing dialogs stay settled and do not replay entrance animations
        const openModals = document.querySelectorAll(
          '.modal-overlay:not(.hidden):not(.closing), .popover-overlay:not(.hidden):not(.closing)'
        );
        openModals.forEach((m) => {
          if (m && m.classList && !m.classList.contains('closing') && !m.classList.contains('hidden')) {
            m.classList.add('modal-settled');
          }
        });

        // Ensure closing overlays are never marked or retained as settled
        const closingModals = document.querySelectorAll('.modal-overlay.closing, .popover-overlay.closing');
        closingModals.forEach((m) => {
          if (m && m.classList) {
            m.classList.remove('modal-settled');
          }
        });
      }

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

    syncWallpaperTypeControls(isOn, options.wallpaperType);
    setupWallpaperPerfActionListeners();

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

    if (typeof options.onWallpaperRestore === 'function') {
      options.onWallpaperRestore();
    } else {
      const wpType = options.wallpaperType ||
        (typeof wallpaperTypePreference !== 'undefined'
          ? wallpaperTypePreference
          : (typeof window !== 'undefined'
            ? (window.wallpaperTypePreference ||
               (window.HomebaseWallpaperController && typeof window.HomebaseWallpaperController.getWallpaperTypePreferenceState === 'function'
                 ? window.HomebaseWallpaperController.getWallpaperTypePreferenceState()
                 : null))
            : null));

      if (wpType === 'video') {
        const selection = options.wallpaperSelection ||
          (typeof currentWallpaperSelection !== 'undefined'
            ? currentWallpaperSelection
            : (typeof window !== 'undefined'
              ? (window.currentWallpaperSelection ||
                 (window.HomebaseWallpaperController && typeof window.HomebaseWallpaperController.getCurrentWallpaperSelection === 'function'
                   ? window.HomebaseWallpaperController.getCurrentWallpaperSelection()
                   : null))
              : null));

        if (selection) {
          if (typeof applyWallpaperByType === 'function') {
            applyWallpaperByType(selection, 'video');
          } else if (typeof window !== 'undefined' && typeof window.applyWallpaperByType === 'function') {
            window.applyWallpaperByType(selection, 'video');
          } else if (typeof window !== 'undefined' && window.HomebaseWallpaperController && typeof window.HomebaseWallpaperController.applyWallpaperByType === 'function') {
            window.HomebaseWallpaperController.applyWallpaperByType(selection, 'video');
          }
        }
      }
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

  function syncWallpaperTypeControls(perfMode, explicitType) {
    if (typeof document === 'undefined') return;

    const isOn = perfMode !== undefined
      ? !!perfMode
      : isPerformanceModeEnabled();

    const select = document.getElementById('app-wallpaper-type-select');
    const toggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    const noticeSettings = document.getElementById('app-wallpaper-type-perf-notice');
    const noticeGallery = document.getElementById('gallery-wallpaper-type-perf-notice');

    let currentType = explicitType;
    if (!currentType) {
      if (select && select.value) {
        currentType = select.value;
      } else if (toggle) {
        currentType = toggle.checked ? 'video' : 'static';
      } else if (typeof wallpaperTypePreference !== 'undefined') {
        currentType = wallpaperTypePreference;
      } else if (typeof window !== 'undefined' && window.wallpaperTypePreference) {
        currentType = window.wallpaperTypePreference;
      } else {
        currentType = 'video';
      }
    }

    // 1. Inline explanation & action button visibility
    if (noticeSettings) {
      noticeSettings.classList.toggle('hidden', !isOn);
    }
    if (noticeGallery) {
      noticeGallery.classList.toggle('hidden', !isOn);
    }

    // 2. Settings Dropdown
    if (select) {
      const videoOption = select.querySelector('option[value="video"]');
      if (videoOption) {
        // While Performance Mode is ON:
        // Keep Live Video visible, but prevent switching from Static to Live Video.
        // If Live Video was already selected, preserve that preference and allow switching to Static.
        videoOption.disabled = isOn && currentType === 'static';
      }
    }

    // 3. Gallery Binary Switch
    if (toggle) {
      // If Wallpaper Type is a binary switch, disable switching to video while it is set to Static;
      // allow switching an existing Video preference to Static.
      const isStatic = !toggle.checked || currentType === 'static';
      toggle.disabled = isOn && isStatic;
      if (toggle.disabled) {
        toggle.setAttribute('aria-disabled', 'true');
      } else {
        toggle.removeAttribute('aria-disabled');
      }
    }
  }

  function handleTurnOffPerformanceMode() {
    const perfToggle = typeof document !== 'undefined'
      ? document.getElementById('app-performance-mode-toggle')
      : null;

    if (perfToggle) {
      if (perfToggle.checked) {
        perfToggle.checked = false;
        const changeEvt = typeof Event !== 'undefined'
          ? new Event('change', { bubbles: true })
          : { type: 'change', bubbles: true };
        perfToggle.dispatchEvent(changeEvt);
        return;
      }
    }

    applyPerformanceMode(false);
    persistPerformanceMode(false);
  }

  function setupWallpaperPerfActionListeners() {
    if (typeof document === 'undefined') return;

    const attach = (btnId) => {
      const btn = document.getElementById(btnId);
      if (btn && !btn.dataset.perfListenerAttached) {
        btn.dataset.perfListenerAttached = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          handleTurnOffPerformanceMode();
        });
      }
    };

    attach('app-wallpaper-turn-off-perf-btn');
    attach('gallery-wallpaper-turn-off-perf-btn');
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('#app-wallpaper-turn-off-perf-btn, #gallery-wallpaper-turn-off-perf-btn');
      if (btn) {
        e.preventDefault();
        handleTurnOffPerformanceMode();
      }
    });
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

    syncWallpaperTypeControls(_performanceMode, options.wallpaperType);
    setupWallpaperPerfActionListeners();

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
    persistPerformanceMode,
    syncWallpaperTypeControls,
    syncWallpaperTypePerformanceState: syncWallpaperTypeControls,
    handleTurnOffPerformanceMode,
    getPerformanceModeWriteQueue: () => _perfWriteQueue,
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
    window.persistPerformanceMode = persistPerformanceMode;
    window.readFastPerformanceModePreference = readFastPerformanceModePreference;
    window.syncFastPerformanceModeMirror = syncFastPerformanceModeMirror;
    window.disableGridAnimationRuntime = disableGridAnimationRuntime;
    window.disableGlassRuntime = disableGlassRuntime;
    window.enableGlassRuntimeFromPreference = enableGlassRuntimeFromPreference;
    window.syncWallpaperTypeControls = syncWallpaperTypeControls;
    window.syncWallpaperTypePerformanceState = syncWallpaperTypeControls;
    window.handleTurnOffPerformanceMode = handleTurnOffPerformanceMode;
  }

  if (typeof globalScope !== 'undefined') {
    globalScope.HomebasePerformanceController = HomebasePerformanceController;
    globalScope.syncWallpaperTypeControls = syncWallpaperTypeControls;
    globalScope.syncWallpaperTypePerformanceState = syncWallpaperTypeControls;
    globalScope.handleTurnOffPerformanceMode = handleTurnOffPerformanceMode;
  }
})();
