// =============================================================================
// Homebase - Settings Form Controller (settings-form-controller.js)
// Extracted from monolithic settings-ui.js (Cycle #14 Phase 3C)
//
// Canonical Owner for:
// - Form element scraping and preference value normalization
// - Preference input change and preview slider bindings
// - Delegation of persistence exclusively to HomebaseSettingsStorage.save()
// - Post-save side effects (perf overlay, wallpaper changes, search engine cleanup)
// - Settings reset to defaults
// - Tips toggle synchronization
// =============================================================================

(() => {
  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  const HOMEBASE_TIPS_DISABLED_KEY = 'homebaseTipsDisabled';
  let formListenersAttached = false;
  let tipsListenerAttached = false;
  let initialWallpaperStateSnapshot = null;

  // =============================================================================
  // WALLPAPER STATE SNAPSHOT
  // =============================================================================

  function snapshotInitialWallpaperState() {
    if (typeof document === 'undefined') return;
    const appDailyToggle = document.getElementById('app-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');

    initialWallpaperStateSnapshot = {
      daily: appDailyToggle ? appDailyToggle.checked : globalScope.dailyRotationPreference,
      type: appWallpaperTypeSelect ? appWallpaperTypeSelect.value : (globalScope.wallpaperTypePreference || 'video'),
      quality: appWallpaperQualitySelect ? appWallpaperQualitySelect.value : (globalScope.wallpaperQualityPreference || 'low')
    };

    if ('initialWallpaperState' in globalScope) {
      globalScope.initialWallpaperState = initialWallpaperStateSnapshot;
    }
  }

  function getInitialWallpaperState() {
    return initialWallpaperStateSnapshot || globalScope.initialWallpaperState || {};
  }

  // =============================================================================
  // TIPS TOGGLE HANDLING
  // =============================================================================

  function syncTipsToggle() {
    if (typeof document === 'undefined') return;
    const appHomebaseTipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    if (!appHomebaseTipsToggle) return;

    try {
      if (globalScope.localStorage) {
        appHomebaseTipsToggle.checked = globalScope.localStorage.getItem(HOMEBASE_TIPS_DISABLED_KEY) !== 'true';
      } else {
        appHomebaseTipsToggle.checked = true;
      }
    } catch (_) {
      appHomebaseTipsToggle.checked = true;
    }
  }

  function setTipsEnabled(enabled) {
    try {
      if (globalScope.localStorage) {
        if (enabled) {
          globalScope.localStorage.removeItem(HOMEBASE_TIPS_DISABLED_KEY);
        } else {
          globalScope.localStorage.setItem(HOMEBASE_TIPS_DISABLED_KEY, 'true');
        }
      }
    } catch (_) {}

    if (typeof globalScope.renderTipOfDay === 'function') {
      globalScope.renderTipOfDay();
    }
  }

  function setupTipsToggle() {
    if (typeof document === 'undefined') return;
    const appHomebaseTipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    if (!appHomebaseTipsToggle || tipsListenerAttached) return;

    tipsListenerAttached = true;
    appHomebaseTipsToggle.addEventListener('change', (e) => {
      setTipsEnabled(e.target.checked);
    });
  }

  // =============================================================================
  // FORM VALUE SCRAPING & NORMALIZATION
  // =============================================================================

  function scrapeFormValues() {
    if (typeof document === 'undefined') return { updates: {}, legacyBatch: {} };

    const appTimeFormatSelect = document.getElementById('app-time-format-select');
    const appSidebarToggle = document.getElementById('app-show-sidebar-toggle');
    const appMaxTabsSelect = document.getElementById('app-max-tabs-select');
    const appAutoCloseSelect = document.getElementById('app-autoclose-select');
    const appDimSlider = document.getElementById('app-background-dim-slider');
    const appSearchOpenNewTabToggle = document.getElementById('app-search-open-new-tab-toggle');
    const appSearchRememberEngineToggle = document.getElementById('app-search-remember-engine-toggle');
    const appSearchDefaultEngineSelect = document.getElementById('app-search-default-engine-select');
    const appSearchMathToggle = document.getElementById('app-search-math-toggle');
    const appSearchHistoryToggle = document.getElementById('app-search-history-toggle');
    const appSearchSuggestionsToggle = document.getElementById('app-search-suggestions-toggle');
    const appWeatherToggle = document.getElementById('app-show-weather-toggle');
    const appQuoteToggle = document.getElementById('app-show-quote-toggle');
    const appNewsToggle = document.getElementById('app-show-news-toggle');
    const appDailyToggle = document.getElementById('app-daily-rotation-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('wallpaper-quality-toggle');

    const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';
    const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;
    const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;
    const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;
    const nextBackgroundDim = appDimSlider ? parseInt(appDimSlider.value, 10) || 0 : 0;
    const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;
    const nextBookmarkNewTab = document.getElementById('app-bookmark-open-new-tab-toggle')?.checked || false;
    const nextBookmarkTextBg = document.getElementById('app-bookmark-text-bg-toggle')?.checked || false;
    const nextShowWeather = appWeatherToggle ? appWeatherToggle.checked : true;
    const nextShowQuote = appQuoteToggle ? appQuoteToggle.checked : true;
    const nextShowNews = appNewsToggle ? appNewsToggle.checked : false;
    const nextContainerMode = document.getElementById('app-container-mode-toggle')?.checked ?? true;
    const radioKeepBehavior = document.querySelector('input[name="container-behavior"][value="keep"]');
    const nextContainerNewTab = radioKeepBehavior ? radioKeepBehavior.checked : globalScope.appContainerNewTabPreference;
    const nextDailyRotation = appDailyToggle ? appDailyToggle.checked : (galleryDailyToggle ? galleryDailyToggle.checked : globalScope.dailyRotationPreference !== false);
    const nextWallpaperType = (() => {
      const raw = appWallpaperTypeSelect?.value || (wallpaperTypeToggle ? (wallpaperTypeToggle.checked ? 'video' : 'static') : globalScope.wallpaperTypePreference);
      return raw === 'static' ? 'static' : 'video';
    })();
    const nextWallpaperQuality = (() => {
      const raw = appWallpaperQualitySelect?.value || (wallpaperQualityToggle ? (wallpaperQualityToggle.checked ? 'high' : 'low') : globalScope.wallpaperQualityPreference);
      return raw === 'high' ? 'high' : 'low';
    })();

    const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');
    const nextTextBgColor = textBgColorTrigger ? (textBgColorTrigger.dataset.value || textBgColorTrigger.style.backgroundColor) : '#2CA5FF';
    const nextOpacity = parseFloat(document.getElementById('app-bookmark-text-opacity-slider')?.value || 0.65);
    const nextBlur = parseInt(document.getElementById('app-bookmark-text-blur-slider')?.value || 4, 10);
    const nextGridAnimEnabled = document.getElementById('app-grid-animation-toggle')?.checked || false;
    const nextSpeed = parseFloat(document.getElementById('app-grid-animation-speed-slider')?.value || 0.3);
    const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');
    const nextFallbackColor = colorTrigger ? (colorTrigger.dataset.value || colorTrigger.style.backgroundColor) : '#00b8d4';
    const folderTrigger = document.getElementById('app-bookmark-folder-color-trigger');
    const nextFolderColor = folderTrigger ? (folderTrigger.dataset.value || folderTrigger.style.backgroundColor) : '#FFFFFF';
    const nextPerformanceMode = document.getElementById('app-performance-mode-toggle')?.checked || false;
    const nextDebugPerfOverlay = document.getElementById('app-perf-debug-overlay-toggle')?.checked || false;
    const prevDebugPerfOverlay = globalScope.debugPerfOverlayPreference;
    const perfOverlayChanged = nextDebugPerfOverlay !== prevDebugPerfOverlay;
    const nextBatteryOptimization = document.getElementById('app-battery-optimization-toggle')?.checked || false;
    const nextCinemaMode = document.getElementById('app-cinema-mode-toggle')?.checked || false;
    const nextSingletonMode = (() => {
      const toggle = document.getElementById('app-singleton-mode-toggle');
      return toggle ? toggle.checked : false;
    })();
    const nextRememberEngine = appSearchRememberEngineToggle ? appSearchRememberEngineToggle.checked : true;
    const nextDefaultEngine = appSearchDefaultEngineSelect && appSearchDefaultEngineSelect.value ? appSearchDefaultEngineSelect.value : globalScope.appSearchDefaultEnginePreference;
    const nextMath = appSearchMathToggle ? appSearchMathToggle.checked : true;
    const nextSearchHistory = appSearchHistoryToggle ? appSearchHistoryToggle.checked : false;
    const nextSearchSuggestions = appSearchSuggestionsToggle ? appSearchSuggestionsToggle.checked : true;

    const updates = {
      timeFormat: nextFormat,
      showSidebar: nextSidebarVisible,
      maxTabs: nextMaxTabs,
      autoClose: nextAutoClose,
      backgroundDim: nextBackgroundDim,
      searchOpenNewTab: nextSearchOpenNewTab,
      bookmarkOpenNewTab: nextBookmarkNewTab,
      bookmarkTextBg: nextBookmarkTextBg,
      showWeather: nextShowWeather,
      showQuote: nextShowQuote,
      showNews: nextShowNews,
      containerMode: nextContainerMode,
      containerNewTab: nextContainerNewTab,
      dailyRotation: nextDailyRotation,
      wallpaperType: nextWallpaperType,
      wallpaperQuality: nextWallpaperQuality,
      bookmarkTextBgColor: nextTextBgColor,
      bookmarkTextBgOpacity: nextOpacity,
      bookmarkTextBgBlur: nextBlur,
      gridAnimationEnabled: nextGridAnimEnabled,
      gridAnimationSpeed: nextSpeed,
      bookmarkFallbackColor: nextFallbackColor,
      bookmarkFolderColor: nextFolderColor,
      performanceMode: nextPerformanceMode,
      debugPerfOverlay: nextDebugPerfOverlay,
      batteryOptimization: nextBatteryOptimization,
      cinemaMode: nextCinemaMode,
      singletonMode: nextSingletonMode,
      searchRememberEngine: nextRememberEngine,
      searchDefaultEngine: nextDefaultEngine,
      searchMath: nextMath,
      searchShowHistory: nextSearchHistory,
      searchSuggestions: nextSearchSuggestions
    };

    let updatedWallpaperSelection = typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : null;
    const initialWp = getInitialWallpaperState();
    const nextWp = {
      daily: nextDailyRotation,
      type: nextWallpaperType,
      quality: nextWallpaperQuality
    };
    const wallpaperChanged = JSON.stringify(initialWp) !== JSON.stringify(nextWp);

    return {
      updates,
      perfOverlayChanged,
      wallpaperChanged,
      updatedWallpaperSelection,
      nextDebugPerfOverlay,
      nextWallpaperType,
      nextRememberEngine,
      nextDefaultEngine,
      nextSingletonMode
    };
  }

  // =============================================================================
  // LIVE APPLICATION OF VALUES TO IN-MEMORY STATE & UI
  // =============================================================================

  function applyFormValuesLive(values) {
    if (!values || !values.updates) return;
    const u = values.updates;

    const applyTimeFormat = (globalScope.HomebaseWidgetTime && typeof globalScope.HomebaseWidgetTime.applyTimeFormatPreference === 'function')
      ? (fmt) => globalScope.HomebaseWidgetTime.applyTimeFormatPreference(fmt)
      : (typeof globalScope.applyTimeFormatPreference === 'function' ? globalScope.applyTimeFormatPreference : null);
    if (applyTimeFormat) applyTimeFormat(u.timeFormat);

    const setWeather = (globalScope.HomebaseWidgetWeather && typeof globalScope.HomebaseWidgetWeather.setWeatherPreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetWeather.setWeatherPreference(val, opt)
      : (typeof globalScope.setWeatherPreference === 'function' ? globalScope.setWeatherPreference : null);
    if (setWeather) setWeather(u.showWeather, { applyVisibility: false, updateUI: false });

    const setQuote = (globalScope.HomebaseWidgetQuote && typeof globalScope.HomebaseWidgetQuote.setQuotePreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetQuote.setQuotePreference(val, opt)
      : (typeof globalScope.setQuotePreference === 'function' ? globalScope.setQuotePreference : null);
    if (setQuote) setQuote(u.showQuote, { applyVisibility: false, updateUI: false });

    const setNews = (globalScope.HomebaseWidgetNews && typeof globalScope.HomebaseWidgetNews.setNewsPreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetNews.setNewsPreference(val, opt)
      : (typeof globalScope.setNewsPreference === 'function' ? globalScope.setNewsPreference : null);
    if (setNews) setNews(u.showNews, { applyVisibility: false, updateUI: false });

    if (typeof globalScope.applySidebarVisibility === 'function') globalScope.applySidebarVisibility(u.showSidebar);
    if (typeof globalScope.applyWidgetVisibility === 'function') globalScope.applyWidgetVisibility();

    globalScope.appMaxTabsPreference = u.maxTabs;
    globalScope.appAutoClosePreference = u.autoClose;

    if (typeof globalScope.applyBackgroundDim === 'function') globalScope.applyBackgroundDim(u.backgroundDim);
    const appDimSlider = document.getElementById('app-background-dim-slider');
    const appDimLabel = document.getElementById('app-background-dim-label');
    if (appDimSlider && appDimSlider.value !== String(u.backgroundDim)) {
      appDimSlider.value = u.backgroundDim;
    }
    if (appDimLabel) {
      appDimLabel.textContent = `${u.backgroundDim}%`;
    }

    globalScope.appSearchOpenNewTabPreference = u.searchOpenNewTab;
    globalScope.appSearchRememberEnginePreference = u.searchRememberEngine;
    globalScope.appSearchDefaultEnginePreference = u.searchDefaultEngine;
    globalScope.appSearchMathPreference = u.searchMath;
    globalScope.appSearchShowHistoryPreference = u.searchShowHistory;
    globalScope.appSearchSuggestionsPreference = u.searchSuggestions;
    if (typeof globalScope.setSearchSuggestionsPreference === 'function') {
      globalScope.setSearchSuggestionsPreference(u.searchSuggestions);
    }
    globalScope.appContainerModePreference = u.containerMode;
    globalScope.appContainerNewTabPreference = u.containerNewTab;
    globalScope.dailyRotationPreference = u.dailyRotation;
    globalScope.wallpaperTypePreference = u.wallpaperType;
    globalScope.wallpaperQualityPreference = u.wallpaperQuality;

    const appDailyToggle = document.getElementById('app-daily-rotation-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('wallpaper-quality-toggle');

    if (appDailyToggle) appDailyToggle.checked = u.dailyRotation;
    if (galleryDailyToggle) galleryDailyToggle.checked = u.dailyRotation;
    if (appWallpaperTypeSelect) appWallpaperTypeSelect.value = u.wallpaperType;
    if (wallpaperTypeToggle) wallpaperTypeToggle.checked = u.wallpaperType === 'video';
    if (appWallpaperQualitySelect) appWallpaperQualitySelect.value = u.wallpaperQuality;
    if (wallpaperQualityToggle) wallpaperQualityToggle.checked = u.wallpaperQuality === 'high';

    globalScope.appBookmarkOpenNewTabPreference = u.bookmarkOpenNewTab;
    if (typeof globalScope.applyBookmarkTextBg === 'function') globalScope.applyBookmarkTextBg(u.bookmarkTextBg);
    if (typeof globalScope.applyBookmarkTextBgOpacity === 'function') globalScope.applyBookmarkTextBgOpacity(u.bookmarkTextBgOpacity);
    if (typeof globalScope.applyBookmarkTextBgBlur === 'function') globalScope.applyBookmarkTextBgBlur(u.bookmarkTextBgBlur);
    if (typeof globalScope.applyBookmarkTextBgColor === 'function') globalScope.applyBookmarkTextBgColor(u.bookmarkTextBgColor);
    if (typeof globalScope.applyGridAnimationSpeed === 'function') globalScope.applyGridAnimationSpeed(u.gridAnimationSpeed);

    globalScope.appBookmarkFallbackColorPreference = u.bookmarkFallbackColor;
    globalScope.appBookmarkFolderColorPreference = u.bookmarkFolderColor;
    globalScope.appPerformanceModePreference = u.performanceMode;
    globalScope.debugPerfOverlayPreference = u.debugPerfOverlay;
    globalScope.appBatteryOptimizationPreference = u.batteryOptimization;
    globalScope.appCinemaModePreference = u.cinemaMode;
    globalScope.appSingletonModePreference = u.singletonMode;

    if (typeof globalScope.applyBookmarkFallbackColor === 'function') globalScope.applyBookmarkFallbackColor(u.bookmarkFallbackColor);
    if (typeof globalScope.applyBookmarkFolderColor === 'function') globalScope.applyBookmarkFolderColor(u.bookmarkFolderColor);
    if (typeof globalScope.applyPerformanceModeState === 'function') globalScope.applyPerformanceModeState(u.performanceMode);
    if (typeof globalScope.setupCinemaModeListeners === 'function') globalScope.setupCinemaModeListeners();
    if (typeof globalScope.resetCinemaMode === 'function') globalScope.resetCinemaMode();
    if (typeof globalScope.applyGridAnimationEnabled === 'function') globalScope.applyGridAnimationEnabled(u.gridAnimationEnabled);
    const timeUpdate = (globalScope.HomebaseWidgetTime && typeof globalScope.HomebaseWidgetTime.update === 'function')
      ? () => globalScope.HomebaseWidgetTime.update()
      : (typeof globalScope.updateTime === 'function' ? globalScope.updateTime : null);
    if (timeUpdate) timeUpdate();
  }

  // =============================================================================
  // SAVE BUTTON HANDLER & PERSISTENCE DELEGATION
  // =============================================================================

  async function handleSaveSettings() {
    const values = scrapeFormValues();
    applyFormValuesLive(values);

    try {
      // 1. Delegate core preference persistence to HomebaseSettingsStorage.save()
      if (globalScope.HomebaseSettingsStorage && typeof globalScope.HomebaseSettingsStorage.save === 'function') {
        await globalScope.HomebaseSettingsStorage.save(values.updates);
      } else if (typeof globalScope.HomebaseStorage !== 'undefined' && globalScope.HomebaseStorage.setMany) {
        await globalScope.HomebaseStorage.setMany(values.updates);
      } else if (typeof browser !== 'undefined' && browser.storage?.local) {
        await browser.storage.local.set(values.updates);
      }

      // 2. Performance overlay update
      if (values.perfOverlayChanged && typeof globalScope.setPerfOverlayEnabled === 'function') {
        globalScope.setPerfOverlayEnabled(values.nextDebugPerfOverlay);
      }

      // 3. Wallpaper selection & playback updates
      if (values.wallpaperChanged && values.updatedWallpaperSelection) {
        const wpKey = typeof globalScope.WALLPAPER_SELECTION_KEY !== 'undefined' ? globalScope.WALLPAPER_SELECTION_KEY : 'wallpaperSelection';
        if (typeof globalScope.HomebaseStorage !== 'undefined' && globalScope.HomebaseStorage.set) {
          await globalScope.HomebaseStorage.set(wpKey, values.updatedWallpaperSelection);
        } else if (typeof browser !== 'undefined' && browser.storage?.local) {
          await browser.storage.local.set({ [wpKey]: values.updatedWallpaperSelection });
        }
        if (typeof globalScope.applyWallpaperByType === 'function') {
          await globalScope.applyWallpaperByType(values.updatedWallpaperSelection, values.nextWallpaperType);
        }
      }

      // 4. Search engine cleanup if not remembered
      if (!values.nextRememberEngine) {
        if (typeof globalScope.HomebaseStorage !== 'undefined' && globalScope.HomebaseStorage.remove) {
          await globalScope.HomebaseStorage.remove('currentSearchEngineId');
        } else if (typeof browser !== 'undefined' && browser.storage?.local) {
          await browser.storage.local.remove('currentSearchEngineId');
        }
        if (typeof globalScope.updateSearchUI === 'function') {
          globalScope.updateSearchUI(values.nextDefaultEngine);
        }
      }
    } catch (err) {
      console.warn('Failed to save app settings', err);
    }

    // 5. Singleton mode handling
    if (values.nextSingletonMode && typeof globalScope.handleSingletonMode === 'function') {
      await globalScope.handleSingletonMode();
    }

    // 6. Refresh daily wallpaper if changed
    if (values.wallpaperChanged && typeof globalScope.ensureDailyWallpaper === 'function') {
      try {
        await globalScope.ensureDailyWallpaper(false);
      } catch (err) {
        console.warn('Failed to refresh wallpaper after saving settings', err);
      }
    }

    // 7. Manage tabs & close modal
    if (typeof globalScope.runWhenIdle === 'function' && typeof globalScope.manageHomebaseTabs === 'function') {
      globalScope.runWhenIdle(() => globalScope.manageHomebaseTabs());
    } else if (typeof globalScope.manageHomebaseTabs === 'function') {
      globalScope.manageHomebaseTabs();
    }

    if (globalScope.HomebaseSettingsPanelController && typeof globalScope.HomebaseSettingsPanelController.closeAppSettingsModal === 'function') {
      globalScope.HomebaseSettingsPanelController.closeAppSettingsModal();
    } else if (typeof globalScope.closeAppSettingsModal === 'function') {
      globalScope.closeAppSettingsModal();
    }
  }

  // =============================================================================
  // RESET TO DEFAULTS
  // =============================================================================

  function resetFormToDefaults() {
    if (typeof document === 'undefined') return {};
    const defaults = (globalScope.HomebaseSettingsStorage && globalScope.HomebaseSettingsStorage.defaults) || {};

    const appTimeFormatSelect = document.getElementById('app-time-format-select');
    const appSidebarToggle = document.getElementById('app-show-sidebar-toggle');
    const appMaxTabsSelect = document.getElementById('app-max-tabs-select');
    const appAutoCloseSelect = document.getElementById('app-autoclose-select');
    const appDimSlider = document.getElementById('app-background-dim-slider');
    const appDimLabel = document.getElementById('app-background-dim-label');
    const appSearchOpenNewTabToggle = document.getElementById('app-search-open-new-tab-toggle');
    const appWeatherToggle = document.getElementById('app-show-weather-toggle');
    const appQuoteToggle = document.getElementById('app-show-quote-toggle');
    const appNewsToggle = document.getElementById('app-show-news-toggle');

    if (appTimeFormatSelect && defaults.timeFormat) appTimeFormatSelect.value = defaults.timeFormat;
    if (appSidebarToggle && defaults.showSidebar !== undefined) appSidebarToggle.checked = defaults.showSidebar;
    if (appMaxTabsSelect && defaults.maxTabs !== undefined) appMaxTabsSelect.value = String(defaults.maxTabs);
    if (appAutoCloseSelect && defaults.autoClose !== undefined) appAutoCloseSelect.value = String(defaults.autoClose);
    if (appDimSlider && defaults.backgroundDim !== undefined) {
      appDimSlider.value = String(defaults.backgroundDim);
      if (appDimLabel) appDimLabel.textContent = `${defaults.backgroundDim}%`;
    }
    if (appSearchOpenNewTabToggle && defaults.searchOpenNewTab !== undefined) appSearchOpenNewTabToggle.checked = defaults.searchOpenNewTab;
    if (appWeatherToggle && defaults.showWeather !== undefined) appWeatherToggle.checked = defaults.showWeather;
    if (appQuoteToggle && defaults.showQuote !== undefined) appQuoteToggle.checked = defaults.showQuote;
    if (appNewsToggle && defaults.showNews !== undefined) appNewsToggle.checked = defaults.showNews;

    return defaults;
  }

  // =============================================================================
  // FORM INPUT LISTENERS SETUP
  // =============================================================================

  function setupFormListeners() {
    if (typeof document === 'undefined' || formListenersAttached) return;
    formListenersAttached = true;

    const appSearchRememberEngineToggle = document.getElementById('app-search-remember-engine-toggle');
    const appSidebarToggle = document.getElementById('app-show-sidebar-toggle');
    const appWeatherToggle = document.getElementById('app-show-weather-toggle');
    const appQuoteToggle = document.getElementById('app-show-quote-toggle');
    const appNewsToggle = document.getElementById('app-show-news-toggle');
    const appDimSlider = document.getElementById('app-background-dim-slider');
    const appDimLabel = document.getElementById('app-background-dim-label');
    const appSettingsSaveBtn = document.getElementById('app-settings-save-btn');

    if (appSearchRememberEngineToggle) {
      appSearchRememberEngineToggle.addEventListener('change', () => {
        if (typeof globalScope.updateDefaultEngineVisibilityControl === 'function') {
          globalScope.updateDefaultEngineVisibilityControl();
        }
      });
    }

    if (appSidebarToggle) {
      appSidebarToggle.addEventListener('change', (e) => {
        if (typeof globalScope.applySidebarVisibility === 'function') {
          globalScope.applySidebarVisibility(e.target.checked);
        }
        if (typeof globalScope.applyWidgetVisibility === 'function') {
          globalScope.applyWidgetVisibility();
        }
      });
    }

    if (appWeatherToggle) {
      appWeatherToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetWeather && typeof globalScope.HomebaseWidgetWeather.setWeatherPreference === 'function')
          ? (v) => globalScope.HomebaseWidgetWeather.setWeatherPreference(v)
          : (typeof globalScope.setWeatherPreference === 'function' ? globalScope.setWeatherPreference : null);
        if (fn) fn(e.target.checked);
      });
    }

    if (appQuoteToggle) {
      appQuoteToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetQuote && typeof globalScope.HomebaseWidgetQuote.setQuotePreference === 'function')
          ? (v) => globalScope.HomebaseWidgetQuote.setQuotePreference(v)
          : (typeof globalScope.setQuotePreference === 'function' ? globalScope.setQuotePreference : null);
        if (fn) fn(e.target.checked);
      });
    }

    if (appNewsToggle) {
      appNewsToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetNews && typeof globalScope.HomebaseWidgetNews.setNewsPreference === 'function')
          ? (v) => globalScope.HomebaseWidgetNews.setNewsPreference(v)
          : (typeof globalScope.setNewsPreference === 'function' ? globalScope.setNewsPreference : null);
        if (fn) fn(e.target.checked);
      });
    }

    if (appDimSlider) {
      appDimSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (typeof globalScope.applyBackgroundDim === 'function') {
          globalScope.applyBackgroundDim(val);
        }
        if (appDimLabel) {
          appDimLabel.textContent = `${val}%`;
        }
      });

      appDimSlider.addEventListener('change', async (e) => {
        const val = parseInt(e.target.value, 10);
        if (typeof globalScope.applyBackgroundDim === 'function') {
          globalScope.applyBackgroundDim(val);
        }
        if (appDimLabel) {
          appDimLabel.textContent = `${val}%`;
        }
        if (appDimSlider.value !== String(val)) {
          appDimSlider.value = val;
        }

        try {
          if (globalScope.localStorage) {
            globalScope.localStorage.setItem('fast-bg-dim', String(val));
          }
        } catch (_) {}

        try {
          if (globalScope.HomebaseSettingsStorage && typeof globalScope.HomebaseSettingsStorage.save === 'function') {
            await globalScope.HomebaseSettingsStorage.save({ backgroundDim: val });
          } else if (typeof globalScope.HomebaseStorage !== 'undefined' && globalScope.HomebaseStorage.set) {
            await globalScope.HomebaseStorage.set('appBackgroundDim', val);
          } else if (typeof browser !== 'undefined' && browser.storage?.local) {
            await browser.storage.local.set({ appBackgroundDim: val });
          }
        } catch (err) {
          console.warn('Failed to save background dim preference', err);
        }
      });
    }

    // Configure buttons for weather, quote, news
    const appConfigureWeatherBtn = document.getElementById('app-configure-weather-btn');
    if (appConfigureWeatherBtn) {
      appConfigureWeatherBtn.addEventListener('click', () => {
        const fn = (globalScope.HomebaseWidgetWeather && typeof globalScope.HomebaseWidgetWeather.openWeatherSettingsModal === 'function')
          ? (b) => globalScope.HomebaseWidgetWeather.openWeatherSettingsModal(b)
          : (typeof globalScope.openWeatherSettingsModal === 'function' ? globalScope.openWeatherSettingsModal : null);
        if (fn) fn(appConfigureWeatherBtn);
      });
    }

    const appConfigureQuoteBtn = document.getElementById('app-configure-quote-btn');
    if (appConfigureQuoteBtn) {
      appConfigureQuoteBtn.addEventListener('click', () => {
        const fn = (globalScope.HomebaseWidgetQuote && typeof globalScope.HomebaseWidgetQuote.openQuoteSettingsModal === 'function')
          ? (b) => globalScope.HomebaseWidgetQuote.openQuoteSettingsModal(b)
          : (typeof globalScope.openQuoteSettingsModal === 'function' ? globalScope.openQuoteSettingsModal : null);
        if (fn) fn(appConfigureQuoteBtn);
      });
    }

    const appConfigureNewsBtn = document.getElementById('app-configure-news-btn');
    if (appConfigureNewsBtn) {
      appConfigureNewsBtn.addEventListener('click', () => {
        if (typeof globalScope.openNewsSettingsModal === 'function') {
          globalScope.openNewsSettingsModal(appConfigureNewsBtn);
        }
      });
    }

    // Backup actions
    const appBackupExportBtn = document.getElementById('app-backup-export-btn');
    const appBackupImportBtn = document.getElementById('app-backup-import-btn');
    const appBackupImportFile = document.getElementById('app-backup-import-file');

    if (appBackupExportBtn) {
      appBackupExportBtn.addEventListener('click', async () => {
        if (!globalScope.HomebaseBackup || typeof globalScope.HomebaseBackup.exportState !== 'function') {
          if (typeof globalScope.showCustomDialog === 'function') {
            globalScope.showCustomDialog('Backup unavailable', 'Backup export is unavailable.');
          }
          return;
        }
        try {
          await globalScope.HomebaseBackup.exportState();
          if (typeof globalScope.showCustomDialog === 'function') {
            globalScope.showCustomDialog(
              'Backup started',
              'Homebase backup download has started.\n\nUploaded wallpapers and videos are not included.'
            );
          }
        } catch (err) {
          console.warn('Failed to export backup', err);
          if (typeof globalScope.showCustomDialog === 'function') {
            globalScope.showCustomDialog('Backup failed', 'Backup export failed. Check console for details.');
          }
        }
      });
    }

    if (appBackupImportBtn && appBackupImportFile) {
      appBackupImportBtn.addEventListener('click', () => {
        appBackupImportFile.click();
      });

      appBackupImportFile.addEventListener('change', async () => {
        const file = appBackupImportFile.files && appBackupImportFile.files[0];
        appBackupImportFile.value = '';
        if (!file) return;
        if (!globalScope.HomebaseBackup || typeof globalScope.HomebaseBackup.importState !== 'function') {
          if (typeof globalScope.showCustomDialog === 'function') {
            globalScope.showCustomDialog('Import unavailable', 'Backup import is unavailable.');
          }
          return;
        }
        try {
          await globalScope.HomebaseBackup.importState(file);
        } catch (err) {
          console.warn('Failed to import backup', err);
          if (typeof globalScope.showCustomDialog === 'function') {
            globalScope.showCustomDialog(
              'Import failed',
              err && err.message ? err.message : 'Backup import failed. Check console for details.'
            );
          }
        }
      });
    }

    // Bookmark styling toggles & sliders
    const textBgToggle = document.getElementById('app-bookmark-text-bg-toggle');
    const textBgRow = document.getElementById('app-bookmark-text-bg-color-row');
    const textBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');
    const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');
    const textBgBlurRow = document.getElementById('app-bookmark-text-blur-row');
    const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');

    if (textBgToggle) {
      textBgToggle.addEventListener('change', () => {
        const isHidden = !textBgToggle.checked;
        if (textBgRow) textBgRow.classList.toggle('hidden', isHidden);
        if (textBgOpacityRow) textBgOpacityRow.classList.toggle('hidden', isHidden);
        if (textBgBlurRow) textBgBlurRow.classList.toggle('hidden', isHidden);
      });
    }

    if (textBgOpacitySlider) {
      textBgOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (typeof globalScope.applyBookmarkTextBgOpacity === 'function') {
          globalScope.applyBookmarkTextBgOpacity(val);
        }
      });
    }

    if (textBgBlurSlider) {
      textBgBlurSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (typeof globalScope.applyBookmarkTextBgBlur === 'function') {
          globalScope.applyBookmarkTextBgBlur(val);
        }
      });
    }

    // Grid animation toggle & speed
    const animToggle = document.getElementById('app-grid-animation-toggle');
    if (animToggle) {
      animToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (typeof globalScope.applyGridAnimationEnabled === 'function') {
          globalScope.applyGridAnimationEnabled(isEnabled);
        }
        const gridSubSettings = document.getElementById('grid-animation-sub-settings');
        if (gridSubSettings && typeof globalScope.setSubSettingsExpanded === 'function') {
          globalScope.setSubSettingsExpanded(gridSubSettings, isEnabled, isEnabled ? { scrollIntoView: true } : {});
        }
      });
    }

    const speedSlider = document.getElementById('app-grid-animation-speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        if (typeof globalScope.applyGridAnimationSpeed === 'function') {
          globalScope.applyGridAnimationSpeed(e.target.value);
        }
      });
    }

    // Save button
    if (appSettingsSaveBtn) {
      appSettingsSaveBtn.addEventListener('click', handleSaveSettings);
    }
  }

  // =============================================================================
  // PUBLIC CONTROLLER EXPORT
  // =============================================================================

  const HomebaseSettingsFormController = {
    scrapeFormValues,
    applyFormValuesLive,
    handleSaveSettings,
    setupFormListeners,
    setupTipsToggle,
    syncTipsToggle,
    resetFormToDefaults,
    snapshotInitialWallpaperState,
    getInitialWallpaperState
  };

  globalScope.HomebaseSettingsFormController = HomebaseSettingsFormController;
})();
