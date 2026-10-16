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
  let initialSettingsSnapshot = null;

  // =============================================================================
  // WALLPAPER & SETTINGS STATE SNAPSHOT & ROLLBACK
  // =============================================================================

  function snapshotInitialWallpaperState() {
    if (typeof document === 'undefined') return;
    const appDailyToggle = document.getElementById('app-daily-toggle') || document.getElementById('app-daily-rotation-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('gallery-wallpaper-quality-toggle') || document.getElementById('wallpaper-quality-toggle');

    const dailyVal = appDailyToggle ? appDailyToggle.checked : (galleryDailyToggle ? galleryDailyToggle.checked : (globalScope.dailyRotationPreference !== false));
    const typeVal = appWallpaperTypeSelect ? appWallpaperTypeSelect.value : (wallpaperTypeToggle ? (wallpaperTypeToggle.checked ? 'video' : 'static') : (globalScope.wallpaperTypePreference || 'video'));
    const qualityVal = appWallpaperQualitySelect ? appWallpaperQualitySelect.value : (wallpaperQualityToggle ? (wallpaperQualityToggle.checked ? 'high' : 'low') : (globalScope.wallpaperQualityPreference || 'low'));

    initialWallpaperStateSnapshot = {
      daily: dailyVal,
      type: typeVal,
      quality: qualityVal,
      selection: globalScope.currentWallpaperSelection ? JSON.parse(JSON.stringify(globalScope.currentWallpaperSelection)) : null
    };

    if ('initialWallpaperState' in globalScope) {
      globalScope.initialWallpaperState = initialWallpaperStateSnapshot;
    }
  }

  function getInitialWallpaperState() {
    return initialWallpaperStateSnapshot || globalScope.initialWallpaperState || {};
  }

  function snapshotInitialSettingsState() {
    const fromStorage = (globalScope.HomebaseSettingsStorage && typeof globalScope.HomebaseSettingsStorage.getAll === 'function')
      ? globalScope.HomebaseSettingsStorage.getAll()
      : ((globalScope.HomebaseSettingsStorage && (globalScope.HomebaseSettingsStorage.state || globalScope.HomebaseSettingsStorage.defaults)) || {});
    const fromForm = (typeof document !== 'undefined') ? (scrapeFormValues().updates || {}) : {};

    let tipsEnabled = true;
    if (typeof document !== 'undefined') {
      const tipsToggle = document.getElementById('app-show-homebase-tips-toggle');
      if (tipsToggle) {
        tipsEnabled = tipsToggle.checked;
      } else {
        try {
          if (globalScope.localStorage) {
            tipsEnabled = globalScope.localStorage.getItem(HOMEBASE_TIPS_DISABLED_KEY) !== 'true';
          }
        } catch (_) {}
      }
    }

    const currentOrder = (globalScope.HomebaseSettingsStorage && typeof globalScope.HomebaseSettingsStorage.get === 'function' && globalScope.HomebaseSettingsStorage.get('widgetOrder'))
      || (Array.isArray(globalScope.widgetOrderPreference) ? globalScope.widgetOrderPreference.slice() : ['weather', 'quote', 'todo', 'news']);

    initialSettingsSnapshot = Object.assign({}, fromStorage, fromForm, {
      showHomebaseTips: tipsEnabled,
      widgetOrder: currentOrder
    });
    snapshotInitialWallpaperState();
    return initialSettingsSnapshot;
  }

  function getInitialSettingsState() {
    return initialSettingsSnapshot;
  }

  function restoreFormControlsFromSnapshot(snapshot) {
    if (!snapshot || typeof document === 'undefined') return;
    const timeEl = document.getElementById('app-time-format') || document.getElementById('app-time-format-select');
    if (timeEl && snapshot.timeFormat) timeEl.value = snapshot.timeFormat;

    const sidebarToggle = document.getElementById('app-show-sidebar-toggle');
    if (sidebarToggle && snapshot.showSidebar !== undefined) sidebarToggle.checked = !!snapshot.showSidebar;

    const weatherToggle = document.getElementById('app-show-weather-toggle');
    if (weatherToggle && snapshot.showWeather !== undefined) weatherToggle.checked = !!snapshot.showWeather;

    const quoteToggle = document.getElementById('app-show-quote-toggle');
    if (quoteToggle && snapshot.showQuote !== undefined) quoteToggle.checked = !!snapshot.showQuote;

    const newsToggle = document.getElementById('app-show-news-toggle');
    if (newsToggle && snapshot.showNews !== undefined) newsToggle.checked = !!snapshot.showNews;

    const todoToggle = document.getElementById('app-show-todo-toggle');
    if (todoToggle && snapshot.showTodo !== undefined) todoToggle.checked = !!snapshot.showTodo;

    const tipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    if (tipsToggle && snapshot.showHomebaseTips !== undefined) tipsToggle.checked = !!snapshot.showHomebaseTips;

    const dimSlider = document.getElementById('app-background-dim-slider') || document.getElementById('app-dim-slider');
    const dimLabel = document.getElementById('app-background-dim-label') || document.getElementById('app-dim-value-label');
    if (dimSlider && snapshot.backgroundDim !== undefined) {
      dimSlider.value = String(snapshot.backgroundDim);
      if (dimLabel) dimLabel.textContent = `${snapshot.backgroundDim}%`;
    }

    const maxTabsSelect = document.getElementById('app-max-tabs-select');
    if (maxTabsSelect && snapshot.maxTabs !== undefined) maxTabsSelect.value = String(snapshot.maxTabs);

    const autoCloseSelect = document.getElementById('app-autoclose-select');
    if (autoCloseSelect && snapshot.autoClose !== undefined) autoCloseSelect.value = String(snapshot.autoClose);

    const perfToggle = document.getElementById('app-performance-mode-toggle');
    if (perfToggle && snapshot.performanceMode !== undefined) perfToggle.checked = !!snapshot.performanceMode;

    const perfDebugToggle = document.getElementById('app-perf-debug-overlay-toggle');
    if (perfDebugToggle && snapshot.debugPerfOverlay !== undefined) perfDebugToggle.checked = !!snapshot.debugPerfOverlay;

    const customBgToggle = document.getElementById('app-bookmark-custom-bg-toggle') || document.getElementById('app-bookmark-text-bg-toggle');
    const transparentBgToggle = document.getElementById('app-bookmark-transparent-bg-toggle');
    const customBgSubSettings = document.getElementById('app-bookmark-custom-bg-sub-settings');
    const textBgRow = document.getElementById('app-bookmark-text-bg-color-row');
    const textBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');
    const textBgBlurRow = document.getElementById('app-bookmark-text-blur-row');
    if (snapshot.bookmarkTextBg !== undefined) {
      const isCustom = !!snapshot.bookmarkTextBg;
      if (customBgToggle) customBgToggle.checked = isCustom;
      if (transparentBgToggle) transparentBgToggle.checked = !isCustom;
      if (customBgSubSettings) {
        if (typeof globalScope.setSubSettingsExpanded === 'function') {
          globalScope.setSubSettingsExpanded(customBgSubSettings, isCustom);
        } else {
          customBgSubSettings.classList.toggle('expanded', isCustom);
        }
        customBgSubSettings.classList.toggle('hidden', !isCustom);
      }
      if (textBgRow) textBgRow.classList.toggle('hidden', !isCustom);
      if (textBgOpacityRow) textBgOpacityRow.classList.toggle('hidden', !isCustom);
      if (textBgBlurRow) textBgBlurRow.classList.toggle('hidden', !isCustom);
    }

    const wpQualitySelect = document.getElementById('app-wallpaper-quality-select');
    if (wpQualitySelect && snapshot.wallpaperQuality) wpQualitySelect.value = snapshot.wallpaperQuality;
    const wpQualityToggle = document.getElementById('gallery-wallpaper-quality-toggle') || document.getElementById('wallpaper-quality-toggle');
    if (wpQualityToggle && snapshot.wallpaperQuality) wpQualityToggle.checked = snapshot.wallpaperQuality === 'high';

    const wpTypeSelect = document.getElementById('app-wallpaper-type-select');
    if (wpTypeSelect && snapshot.wallpaperType) wpTypeSelect.value = snapshot.wallpaperType;
    const wpTypeToggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    if (wpTypeToggle && snapshot.wallpaperType) wpTypeToggle.checked = snapshot.wallpaperType === 'video';

    const dailyToggle = document.getElementById('app-daily-toggle') || document.getElementById('app-daily-rotation-toggle');
    if (dailyToggle && snapshot.dailyRotation !== undefined) dailyToggle.checked = !!snapshot.dailyRotation;
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    if (galleryDailyToggle && snapshot.dailyRotation !== undefined) galleryDailyToggle.checked = !!snapshot.dailyRotation;
  }

  function discardSettingsChanges() {
    if (!initialSettingsSnapshot) return;

    applyFormValuesLive({ updates: initialSettingsSnapshot });
    restoreFormControlsFromSnapshot(initialSettingsSnapshot);

    // Revert tips
    if (initialSettingsSnapshot.showHomebaseTips !== undefined) {
      setTipsEnabled(initialSettingsSnapshot.showHomebaseTips, { persist: false });
      if (typeof globalScope.setHomebaseTipsPreviewOverride === 'function') {
        globalScope.setHomebaseTipsPreviewOverride(null);
      } else {
        globalScope.homebaseTipsPreviewOverride = null;
      }
    }

    // Revert wallpaper preview if initial wallpaper state exists
    if (initialWallpaperStateSnapshot) {
      globalScope.wallpaperQualityPreference = initialWallpaperStateSnapshot.quality;
      globalScope.wallpaperTypePreference = initialWallpaperStateSnapshot.type;
      globalScope.dailyRotationPreference = initialWallpaperStateSnapshot.daily;
      if (typeof globalScope.applyWallpaperByType === 'function') {
        const sel = initialWallpaperStateSnapshot.selection || globalScope.currentWallpaperSelection;
        if (sel) {
          globalScope.applyWallpaperByType(sel, initialWallpaperStateSnapshot.type);
        }
      }
    }

    // Revert widget order
    if (initialSettingsSnapshot.widgetOrder && typeof globalScope.setWidgetOrderPreference === 'function') {
      globalScope.setWidgetOrderPreference(initialSettingsSnapshot.widgetOrder, { persist: false });
    }

    if (initialSettingsSnapshot.timeFormat) {
      const applyFmt = (globalScope.HomebaseWidgetTime && typeof globalScope.HomebaseWidgetTime.applyTimeFormatPreference === 'function')
        ? (fmt, opt) => globalScope.HomebaseWidgetTime.applyTimeFormatPreference(fmt, opt)
        : (typeof globalScope.applyTimeFormatPreference === 'function' ? (fmt, opt) => globalScope.applyTimeFormatPreference(fmt, opt) : null);
      if (applyFmt) {
        applyFmt(initialSettingsSnapshot.timeFormat, { persist: false });
      }
    }

    if (typeof globalScope.syncAppSettingsForm === 'function') {
      try {
        globalScope.syncAppSettingsForm();
      } catch (_) {}
    }
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

  function setTipsEnabled(enabled, options = {}) {
    if (typeof globalScope.setHomebaseTipsPreviewOverride === 'function') {
      globalScope.setHomebaseTipsPreviewOverride(enabled);
    } else {
      globalScope.homebaseTipsPreviewOverride = enabled;
    }

    if (options.persist !== false) {
      try {
        if (globalScope.localStorage) {
          if (enabled) {
            globalScope.localStorage.removeItem(HOMEBASE_TIPS_DISABLED_KEY);
          } else {
            globalScope.localStorage.setItem(HOMEBASE_TIPS_DISABLED_KEY, 'true');
          }
        }
      } catch (_) {}
    }

    const tipCard = (typeof document !== 'undefined') ? document.getElementById('tip-card') : null;
    if (tipCard) {
      if (!enabled) {
        if (typeof globalScope.clearHomebaseTipsCard === 'function') {
          globalScope.clearHomebaseTipsCard(tipCard);
        } else {
          tipCard.classList.remove('is-visible');
          tipCard.setAttribute('hidden', '');
        }
      } else {
        if (typeof globalScope.renderTipOfDay === 'function') {
          globalScope.renderTipOfDay();
        } else {
          tipCard.removeAttribute('hidden');
          tipCard.classList.add('is-visible');
        }
      }
    }
  }

  function setupTipsToggle() {
    if (typeof document === 'undefined') return;
    const appHomebaseTipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    if (!appHomebaseTipsToggle || tipsListenerAttached) return;

    tipsListenerAttached = true;
    appHomebaseTipsToggle.addEventListener('change', (e) => {
      const checked = (e && e.target) ? e.target.checked : appHomebaseTipsToggle.checked;
      setTipsEnabled(checked, { persist: false });
    });
  }

  // =============================================================================
  // FORM VALUE SCRAPING & NORMALIZATION
  // =============================================================================

  function scrapeFormValues() {
    if (typeof document === 'undefined') return { updates: {}, legacyBatch: {} };

    const appTimeFormatSelect = document.getElementById('app-time-format') || document.getElementById('app-time-format-select');
    const appSidebarToggle = document.getElementById('app-show-sidebar-toggle');
    const appMaxTabsSelect = document.getElementById('app-max-tabs-select');
    const appAutoCloseSelect = document.getElementById('app-autoclose-select');
    const appDimSlider = document.getElementById('app-background-dim-slider') || document.getElementById('app-dim-slider');
    const appSearchOpenNewTabToggle = document.getElementById('app-search-open-new-tab-toggle');
    const appSearchRememberEngineToggle = document.getElementById('app-search-remember-engine-toggle');
    const appSearchDefaultEngineSelect = document.getElementById('app-search-default-engine-select');
    const appSearchMathToggle = document.getElementById('app-search-math-toggle');
    const appSearchHistoryToggle = document.getElementById('app-search-history-toggle');
    const appSearchSuggestionsToggle = document.getElementById('app-search-suggestions-toggle');
    const appWeatherToggle = document.getElementById('app-show-weather-toggle');
    const appQuoteToggle = document.getElementById('app-show-quote-toggle');
    const appNewsToggle = document.getElementById('app-show-news-toggle');
    const appTodoToggle = document.getElementById('app-show-todo-toggle');
    const appHomebaseTipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    const appDailyToggle = document.getElementById('app-daily-rotation-toggle') || document.getElementById('app-daily-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('wallpaper-quality-toggle') || document.getElementById('gallery-wallpaper-quality-toggle');

    const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';
    const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;
    const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;
    const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;
    const nextBackgroundDim = appDimSlider ? parseInt(appDimSlider.value, 10) || 0 : 0;
    const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;
    const nextBookmarkNewTab = document.getElementById('app-bookmark-open-new-tab-toggle')?.checked || false;
    const nextBookmarkTextBg = document.getElementById('app-bookmark-custom-bg-toggle')
      ? document.getElementById('app-bookmark-custom-bg-toggle').checked
      : (document.getElementById('app-bookmark-transparent-bg-toggle')
        ? !document.getElementById('app-bookmark-transparent-bg-toggle').checked
        : (document.getElementById('app-bookmark-text-bg-toggle')?.checked || false));
    const nextShowWeather = appWeatherToggle ? appWeatherToggle.checked : true;
    const nextShowQuote = appQuoteToggle ? appQuoteToggle.checked : true;
    const nextShowNews = appNewsToggle ? appNewsToggle.checked : false;
    const nextShowTodo = appTodoToggle ? appTodoToggle.checked : true;
    let nextShowTips = true;
    if (appHomebaseTipsToggle) {
      nextShowTips = appHomebaseTipsToggle.checked;
    } else if (typeof globalScope.homebaseTipsPreviewOverride === 'boolean') {
      nextShowTips = globalScope.homebaseTipsPreviewOverride;
    } else {
      try {
        if (globalScope.localStorage) {
          nextShowTips = globalScope.localStorage.getItem(HOMEBASE_TIPS_DISABLED_KEY) !== 'true';
        }
      } catch (_) {}
    }
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
    const isDefaultSearch = (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) ||
      (typeof globalScope.isBrowserDefaultSearch === 'function' && globalScope.isBrowserDefaultSearch()) ||
      Boolean(globalScope.HomebaseBuildConfig && globalScope.HomebaseBuildConfig.browserDefaultSearch);

    const nextRememberEngine = isDefaultSearch
      ? (globalScope.appSearchRememberEnginePreference !== undefined ? globalScope.appSearchRememberEnginePreference : true)
      : (appSearchRememberEngineToggle ? appSearchRememberEngineToggle.checked : true);
    const nextDefaultEngine = isDefaultSearch
      ? (globalScope.appSearchDefaultEnginePreference || 'google')
      : (appSearchDefaultEngineSelect && appSearchDefaultEngineSelect.value ? appSearchDefaultEngineSelect.value : globalScope.appSearchDefaultEnginePreference);
    const nextMath = appSearchMathToggle ? appSearchMathToggle.checked : true;
    const nextSearchHistory = appSearchHistoryToggle ? appSearchHistoryToggle.checked : false;
    const nextSearchSuggestions = isDefaultSearch
      ? (globalScope.appSearchSuggestionsPreference !== undefined ? globalScope.appSearchSuggestionsPreference : true)
      : (appSearchSuggestionsToggle ? appSearchSuggestionsToggle.checked : true);

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
      showTodo: nextShowTodo,
      showHomebaseTips: nextShowTips,
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
      searchSuggestions: nextSearchSuggestions,
      widgetOrder: (() => {
        const sub = document.getElementById('widget-sub-settings');
        const rows = sub ? Array.from(sub.querySelectorAll('.widget-setting-row')).map((r) => r.dataset.widgetId).filter(Boolean) : [];
        if (rows.length > 0) return rows;
        if (Array.isArray(globalScope.widgetOrderPreference)) return globalScope.widgetOrderPreference.slice();
        if (typeof widgetOrderPreference !== 'undefined' && Array.isArray(widgetOrderPreference)) return widgetOrderPreference.slice();
        return ['weather', 'quote', 'todo', 'news'];
      })()
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
      ? (fmt, opt) => globalScope.HomebaseWidgetTime.applyTimeFormatPreference(fmt, opt)
      : (typeof globalScope.applyTimeFormatPreference === 'function' ? (fmt, opt) => globalScope.applyTimeFormatPreference(fmt, opt) : null);
    if (applyTimeFormat) applyTimeFormat(u.timeFormat, { persist: false });

    const setWeather = (globalScope.HomebaseWidgetWeather && typeof globalScope.HomebaseWidgetWeather.setWeatherPreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetWeather.setWeatherPreference(val, opt)
      : (typeof globalScope.setWeatherPreference === 'function' ? globalScope.setWeatherPreference : null);
    if (setWeather) setWeather(u.showWeather, { applyVisibility: false, updateUI: false, persist: false });

    const setQuote = (globalScope.HomebaseWidgetQuote && typeof globalScope.HomebaseWidgetQuote.setQuotePreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetQuote.setQuotePreference(val, opt)
      : (typeof globalScope.setQuotePreference === 'function' ? globalScope.setQuotePreference : null);
    if (setQuote) setQuote(u.showQuote, { applyVisibility: false, updateUI: false, persist: false });

    const setNews = (globalScope.HomebaseWidgetNews && typeof globalScope.HomebaseWidgetNews.setNewsPreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetNews.setNewsPreference(val, opt)
      : (typeof globalScope.setNewsPreference === 'function' ? globalScope.setNewsPreference : null);
    if (setNews) setNews(u.showNews, { applyVisibility: false, updateUI: false, persist: false });

    const setTodo = (globalScope.HomebaseWidgetTodo && typeof globalScope.HomebaseWidgetTodo.setTodoPreference === 'function')
      ? (val, opt) => globalScope.HomebaseWidgetTodo.setTodoPreference(val, opt)
      : (typeof globalScope.setTodoPreference === 'function' ? globalScope.setTodoPreference : null);
    if (setTodo && u.showTodo !== undefined) setTodo(u.showTodo, { applyVisibility: false, updateUI: false, persist: false });

    if (u.showHomebaseTips !== undefined) {
      setTipsEnabled(u.showHomebaseTips, { persist: false });
    }

    if (typeof globalScope.applySidebarVisibility === 'function') globalScope.applySidebarVisibility(u.showSidebar, { persist: false });
    if (typeof globalScope.applyWidgetVisibility === 'function') globalScope.applyWidgetVisibility();

    globalScope.appMaxTabsPreference = u.maxTabs;
    globalScope.appAutoClosePreference = u.autoClose;

    if (typeof globalScope.applyBackgroundDim === 'function') globalScope.applyBackgroundDim(u.backgroundDim);
    const appDimSlider = document.getElementById('app-background-dim-slider') || document.getElementById('app-dim-slider');
    const appDimLabel = document.getElementById('app-background-dim-label') || document.getElementById('app-dim-value-label');
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

    const appDailyToggle = document.getElementById('app-daily-rotation-toggle') || document.getElementById('app-daily-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('wallpaper-quality-toggle') || document.getElementById('gallery-wallpaper-quality-toggle');

    if (appDailyToggle) appDailyToggle.checked = u.dailyRotation;
    if (galleryDailyToggle) galleryDailyToggle.checked = u.dailyRotation;
    if (appWallpaperTypeSelect) appWallpaperTypeSelect.value = u.wallpaperType;
    if (wallpaperTypeToggle) wallpaperTypeToggle.checked = u.wallpaperType === 'video';
    if (appWallpaperQualitySelect) appWallpaperQualitySelect.value = u.wallpaperQuality;
    if (wallpaperQualityToggle) wallpaperQualityToggle.checked = u.wallpaperQuality === 'high';

    if (u.wallpaperType && typeof globalScope.applyWallpaperByType === 'function') {
      const sel = globalScope.currentWallpaperSelection || (typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : null);
      if (sel) {
        globalScope.applyWallpaperByType(sel, u.wallpaperType);
      }
    }

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

      // 5. Tips preference persistence
      if (values.updates && values.updates.showHomebaseTips !== undefined) {
        try {
          if (globalScope.localStorage) {
            if (values.updates.showHomebaseTips) {
              globalScope.localStorage.removeItem(HOMEBASE_TIPS_DISABLED_KEY);
            } else {
              globalScope.localStorage.setItem(HOMEBASE_TIPS_DISABLED_KEY, 'true');
            }
          }
        } catch (_) {}
        if (typeof globalScope.setHomebaseTipsPreviewOverride === 'function') {
          globalScope.setHomebaseTipsPreviewOverride(null);
        } else {
          globalScope.homebaseTipsPreviewOverride = null;
        }
      }

      // 6. Widget order persistence
      if (values.updates && values.updates.widgetOrder && typeof globalScope.setWidgetOrderPreference === 'function') {
        globalScope.setWidgetOrderPreference(values.updates.widgetOrder, { persist: true });
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

    initialSettingsSnapshot = Object.assign({}, values.updates);
    if (initialWallpaperStateSnapshot && values.updates) {
      initialWallpaperStateSnapshot.daily = values.updates.dailyRotation;
      initialWallpaperStateSnapshot.type = values.updates.wallpaperType;
      initialWallpaperStateSnapshot.quality = values.updates.wallpaperQuality;
    }

    if (globalScope.HomebaseSettingsPanelController && typeof globalScope.HomebaseSettingsPanelController.closeAppSettingsModal === 'function') {
      globalScope.HomebaseSettingsPanelController.closeAppSettingsModal({ saved: true });
    } else if (typeof globalScope.closeAppSettingsModal === 'function') {
      globalScope.closeAppSettingsModal({ saved: true });
    }
  }

  // =============================================================================
  // RESET TO DEFAULTS
  // =============================================================================

  function resetFormToDefaults() {
    if (typeof document === 'undefined') return {};
    const defaults = (globalScope.HomebaseSettingsStorage && globalScope.HomebaseSettingsStorage.defaults) || {};

    const appTimeFormatSelect = document.getElementById('app-time-format') || document.getElementById('app-time-format-select');
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
    const appTodoToggle = document.getElementById('app-show-todo-toggle');
    if (appTodoToggle && defaults.showTodo !== undefined) appTodoToggle.checked = defaults.showTodo;
    const appTipsToggle = document.getElementById('app-show-homebase-tips-toggle');
    if (appTipsToggle) appTipsToggle.checked = true;

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
    const appTodoToggle = document.getElementById('app-show-todo-toggle');
    const appDimSlider = document.getElementById('app-background-dim-slider') || document.getElementById('app-dim-slider');
    const appDimLabel = document.getElementById('app-background-dim-label') || document.getElementById('app-dim-value-label');
    const appSettingsSaveBtn = document.getElementById('app-settings-save') || document.getElementById('app-settings-save-btn');
    const appTimeFormatSelect = document.getElementById('app-time-format') || document.getElementById('app-time-format-select');
    const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');
    const wallpaperQualityToggle = document.getElementById('wallpaper-quality-toggle') || document.getElementById('gallery-wallpaper-quality-toggle');
    const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');
    const wallpaperTypeToggle = document.getElementById('wallpaper-type-toggle') || document.getElementById('gallery-wallpaper-type-toggle');
    const appDailyToggle = document.getElementById('app-daily-rotation-toggle') || document.getElementById('app-daily-toggle');
    const galleryDailyToggle = document.getElementById('gallery-daily-rotation-toggle');

    setupTipsToggle();

    if (appTimeFormatSelect) {
      appTimeFormatSelect.addEventListener('change', (e) => {
        const raw = (e && e.target && e.target.value) || (appTimeFormatSelect && appTimeFormatSelect.value);
        const val = raw === '12-hour' ? '12-hour' : '24-hour';
        const applyFmt = (globalScope.HomebaseWidgetTime && typeof globalScope.HomebaseWidgetTime.applyTimeFormatPreference === 'function')
          ? (fmt, opt) => globalScope.HomebaseWidgetTime.applyTimeFormatPreference(fmt, opt)
          : (typeof globalScope.applyTimeFormatPreference === 'function' ? (fmt, opt) => globalScope.applyTimeFormatPreference(fmt, opt) : null);
        if (applyFmt) {
          applyFmt(val, { persist: false });
        }
      });
    }

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
          globalScope.applySidebarVisibility(e.target.checked, { persist: false });
        }
        if (typeof globalScope.applyWidgetVisibility === 'function') {
          globalScope.applyWidgetVisibility();
        }
      });
    }

    if (appWeatherToggle) {
      appWeatherToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetWeather && typeof globalScope.HomebaseWidgetWeather.setWeatherPreference === 'function')
          ? (v, opt) => globalScope.HomebaseWidgetWeather.setWeatherPreference(v, opt)
          : (typeof globalScope.setWeatherPreference === 'function' ? globalScope.setWeatherPreference : null);
        if (fn) fn(e.target.checked, { persist: false });
      });
    }

    if (appQuoteToggle) {
      appQuoteToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetQuote && typeof globalScope.HomebaseWidgetQuote.setQuotePreference === 'function')
          ? (v, opt) => globalScope.HomebaseWidgetQuote.setQuotePreference(v, opt)
          : (typeof globalScope.setQuotePreference === 'function' ? globalScope.setQuotePreference : null);
        if (fn) fn(e.target.checked, { persist: false });
      });
    }

    if (appNewsToggle) {
      appNewsToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetNews && typeof globalScope.HomebaseWidgetNews.setNewsPreference === 'function')
          ? (v, opt) => globalScope.HomebaseWidgetNews.setNewsPreference(v, opt)
          : (typeof globalScope.setNewsPreference === 'function' ? globalScope.setNewsPreference : null);
        if (fn) fn(e.target.checked, { persist: false });
      });
    }

    if (appTodoToggle) {
      appTodoToggle.addEventListener('change', (e) => {
        const fn = (globalScope.HomebaseWidgetTodo && typeof globalScope.HomebaseWidgetTodo.setTodoPreference === 'function')
          ? (v, opt) => globalScope.HomebaseWidgetTodo.setTodoPreference(v, opt)
          : (typeof globalScope.setTodoPreference === 'function' ? globalScope.setTodoPreference : null);
        if (fn) fn(e.target.checked, { persist: false });
      });
    }

    if (appWallpaperQualitySelect) {
      appWallpaperQualitySelect.addEventListener('change', async (e) => {
        const newQuality = e.target.value === 'high' ? 'high' : 'low';
        globalScope.wallpaperQualityPreference = newQuality;
        if (wallpaperQualityToggle) wallpaperQualityToggle.checked = newQuality === 'high';
        const updatedSelection = typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : globalScope.currentWallpaperSelection;
        if (updatedSelection && typeof globalScope.applyWallpaperByType === 'function') {
          await globalScope.applyWallpaperByType(updatedSelection, globalScope.wallpaperTypePreference || 'video');
        }
      });
    }

    if (wallpaperQualityToggle) {
      wallpaperQualityToggle.addEventListener('change', async (e) => {
        const newQuality = e.target.checked ? 'high' : 'low';
        globalScope.wallpaperQualityPreference = newQuality;
        if (appWallpaperQualitySelect) appWallpaperQualitySelect.value = newQuality;
        const updatedSelection = typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : globalScope.currentWallpaperSelection;
        if (updatedSelection && typeof globalScope.applyWallpaperByType === 'function') {
          await globalScope.applyWallpaperByType(updatedSelection, globalScope.wallpaperTypePreference || 'video');
        }
      });
    }

    if (appWallpaperTypeSelect) {
      appWallpaperTypeSelect.addEventListener('change', async (e) => {
        const newType = e.target.value === 'static' ? 'static' : 'video';
        globalScope.wallpaperTypePreference = newType;
        if (wallpaperTypeToggle) wallpaperTypeToggle.checked = newType === 'video';
        const sel = globalScope.currentWallpaperSelection || (typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : null);
        if (sel && typeof globalScope.applyWallpaperByType === 'function') {
          await globalScope.applyWallpaperByType(sel, newType);
        }
      });
    }

    if (wallpaperTypeToggle) {
      wallpaperTypeToggle.addEventListener('change', async (e) => {
        const newType = e.target.checked ? 'video' : 'static';
        globalScope.wallpaperTypePreference = newType;
        if (appWallpaperTypeSelect) appWallpaperTypeSelect.value = newType;
        const sel = globalScope.currentWallpaperSelection || (typeof globalScope.rebuildCurrentSelectionFromGallery === 'function' ? globalScope.rebuildCurrentSelectionFromGallery() : null);
        if (sel && typeof globalScope.applyWallpaperByType === 'function') {
          await globalScope.applyWallpaperByType(sel, newType);
        }
      });
    }

    if (appDailyToggle) {
      appDailyToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        globalScope.dailyRotationPreference = isEnabled;
        if (galleryDailyToggle) galleryDailyToggle.checked = isEnabled;
      });
    }

    if (galleryDailyToggle) {
      galleryDailyToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        globalScope.dailyRotationPreference = isEnabled;
        if (appDailyToggle) appDailyToggle.checked = isEnabled;
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

      appDimSlider.addEventListener('change', (e) => {
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
    const transparentBgToggle = document.getElementById('app-bookmark-transparent-bg-toggle');
    const customBgToggle = document.getElementById('app-bookmark-custom-bg-toggle') || document.getElementById('app-bookmark-text-bg-toggle');
    const customBgSubSettings = document.getElementById('app-bookmark-custom-bg-sub-settings');
    const textBgRow = document.getElementById('app-bookmark-text-bg-color-row');
    const textBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');
    const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');
    const textBgBlurRow = document.getElementById('app-bookmark-text-blur-row');
    const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');

    const updateBookmarkBgModeUI = (isCustom) => {
      if (transparentBgToggle) transparentBgToggle.checked = !isCustom;
      if (customBgToggle) customBgToggle.checked = isCustom;
      if (customBgSubSettings) {
        if (typeof globalScope.setSubSettingsExpanded === 'function') {
          globalScope.setSubSettingsExpanded(customBgSubSettings, isCustom);
        } else {
          customBgSubSettings.classList.toggle('expanded', isCustom);
        }
        customBgSubSettings.classList.toggle('hidden', !isCustom);
      }
      if (textBgRow) textBgRow.classList.toggle('hidden', !isCustom);
      if (textBgOpacityRow) textBgOpacityRow.classList.toggle('hidden', !isCustom);
      if (textBgBlurRow) textBgBlurRow.classList.toggle('hidden', !isCustom);

      if (typeof globalScope.applyBookmarkTextBg === 'function') {
        globalScope.applyBookmarkTextBg(isCustom);
      }
      if (isCustom) {
        if (typeof globalScope.applyBookmarkTextBgOpacity === 'function' && textBgOpacitySlider) {
          globalScope.applyBookmarkTextBgOpacity(parseFloat(textBgOpacitySlider.value));
        }
        if (typeof globalScope.applyBookmarkTextBgBlur === 'function' && textBgBlurSlider) {
          globalScope.applyBookmarkTextBgBlur(parseInt(textBgBlurSlider.value, 10));
        }
      }
    };

    if (transparentBgToggle) {
      transparentBgToggle.addEventListener('change', () => {
        const isTransparent = transparentBgToggle.checked;
        updateBookmarkBgModeUI(!isTransparent);
      });
    }

    if (customBgToggle) {
      customBgToggle.addEventListener('change', () => {
        const isCustom = customBgToggle.checked;
        updateBookmarkBgModeUI(isCustom);
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
    getInitialWallpaperState,
    snapshotInitialSettingsState,
    getInitialSettingsState,
    restoreFormControlsFromSnapshot,
    discardSettingsChanges
  };

  globalScope.HomebaseSettingsFormController = HomebaseSettingsFormController;
})();
