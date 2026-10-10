// =============================================================================
// Homebase Settings Storage & State Engine
// Module: src/newtab/settings/settings-storage.js
// Canonical owner of storage keys, baseline defaults, reactive state store,
// and batch persistence.
// =============================================================================

(function() {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  // --- Storage Key Constants ---
  const APP_TIME_FORMAT_KEY = 'appTimeFormatPreference';
  const APP_BACKGROUND_DIM_KEY = 'appBackgroundDim';
  const APP_SHOW_SIDEBAR_KEY = 'appShowSidebar';
  const APP_SHOW_WEATHER_KEY = 'appShowWeather';
  const APP_SHOW_QUOTE_KEY = 'appShowQuote';
  const APP_SHOW_NEWS_KEY = 'appShowNews';
  const APP_SHOW_TODO_KEY = 'appShowTodo';
  const APP_NEWS_SOURCE_KEY = 'appNewsSource';
  const APP_MAX_TABS_KEY = 'appMaxTabsCount';
  const APP_AUTOCLOSE_KEY = 'appAutoCloseMinutes';
  const APP_SINGLETON_MODE_KEY = 'appSingletonMode';
  const APP_SEARCH_OPEN_NEW_TAB_KEY = 'appSearchOpenNewTab';
  const APP_SEARCH_MATH_KEY = 'appSearchMath';
  const APP_SEARCH_SHOW_HISTORY_KEY = 'appSearchShowHistory';
  const APP_SEARCH_SUGGESTIONS_KEY = 'appSearchSuggestionsEnabled';
  const APP_BOOKMARK_OPEN_NEW_TAB_KEY = 'appBookmarkOpenNewTab';
  const APP_BOOKMARK_TEXT_BG_KEY = 'appBookmarkTextBg';
  const APP_BOOKMARK_TEXT_BG_COLOR_KEY = 'appBookmarkTextBgColor';
  const APP_BOOKMARK_TEXT_OPACITY_KEY = 'appBookmarkTextBgOpacity';
  const APP_BOOKMARK_TEXT_BLUR_KEY = 'appBookmarkTextBgBlur';
  const APP_BOOKMARK_FALLBACK_COLOR_KEY = 'appBookmarkFallbackColor';
  const APP_BOOKMARK_FOLDER_COLOR_KEY = 'appBookmarkFolderColor';
  const APP_PERFORMANCE_MODE_KEY = 'appPerformanceMode';
  const FAST_PERFORMANCE_MODE_KEY = 'fast-performance-mode';
  const APP_DEBUG_PERF_OVERLAY_KEY = 'debugPerfOverlay';
  const APP_BATTERY_OPTIMIZATION_KEY = 'appBatteryOptimization';
  const APP_CINEMA_MODE_KEY = 'appCinemaMode';
  const APP_CONTAINER_MODE_KEY = 'appContainerMode';
  const APP_CONTAINER_NEW_TAB_KEY = 'appContainerNewTab';
  const APP_GRID_ANIMATION_KEY = 'appGridAnimationPref';
  const APP_GRID_ANIMATION_SPEED_KEY = 'appGridAnimationSpeed';
  const APP_GRID_ANIMATION_ENABLED_KEY = 'appGridAnimationEnabled';
  const APP_GLASS_STYLE_KEY = 'appGlassStylePref';

  // Immutable storage keys dictionary
  const SETTINGS_KEYS = Object.freeze({
    APP_TIME_FORMAT_KEY,
    APP_BACKGROUND_DIM_KEY,
    APP_SHOW_SIDEBAR_KEY,
    APP_SHOW_WEATHER_KEY,
    APP_SHOW_QUOTE_KEY,
    APP_SHOW_NEWS_KEY,
    APP_SHOW_TODO_KEY,
    APP_NEWS_SOURCE_KEY,
    APP_MAX_TABS_KEY,
    APP_AUTOCLOSE_KEY,
    APP_SINGLETON_MODE_KEY,
    APP_SEARCH_OPEN_NEW_TAB_KEY,
    APP_SEARCH_MATH_KEY,
    APP_SEARCH_SHOW_HISTORY_KEY,
    APP_SEARCH_SUGGESTIONS_KEY,
    APP_BOOKMARK_OPEN_NEW_TAB_KEY,
    APP_BOOKMARK_TEXT_BG_KEY,
    APP_BOOKMARK_TEXT_BG_COLOR_KEY,
    APP_BOOKMARK_TEXT_OPACITY_KEY,
    APP_BOOKMARK_TEXT_BLUR_KEY,
    APP_BOOKMARK_FALLBACK_COLOR_KEY,
    APP_BOOKMARK_FOLDER_COLOR_KEY,
    APP_PERFORMANCE_MODE_KEY,
    FAST_PERFORMANCE_MODE_KEY,
    APP_DEBUG_PERF_OVERLAY_KEY,
    APP_BATTERY_OPTIMIZATION_KEY,
    APP_CINEMA_MODE_KEY,
    APP_CONTAINER_MODE_KEY,
    APP_CONTAINER_NEW_TAB_KEY,
    APP_GRID_ANIMATION_KEY,
    APP_GRID_ANIMATION_SPEED_KEY,
    APP_GRID_ANIMATION_ENABLED_KEY,
    APP_GLASS_STYLE_KEY
  });

  // Canonical default preference values
  const defaultSettingsState = Object.freeze({
    timeFormat: '12-hour',
    backgroundDim: 0,
    showSidebar: true,
    showWeather: true,
    showQuote: true,
    showNews: false,
    showTodo: true,
    newsSource: 'aljazeera',
    maxTabs: 0,
    autoClose: 0,
    singletonMode: false,
    searchOpenNewTab: false,
    searchRememberEngine: true,
    searchDefaultEngine: 'google',
    searchMath: true,
    searchShowHistory: false,
    searchSuggestions: true,
    containerMode: true,
    containerNewTab: true,
    bookmarkOpenNewTab: false,
    bookmarkTextBg: false,
    bookmarkTextBgColor: '#2CA5FF',
    bookmarkTextBgOpacity: 0.65,
    bookmarkTextBgBlur: 4,
    bookmarkFallbackColor: '#00b8d4',
    bookmarkFolderColor: '#FFFFFF',
    gridAnimation: 'default',
    gridAnimationSpeed: 0.3,
    gridAnimationEnabled: false,
    glassStyle: 'original',
    performanceMode: false,
    debugPerfOverlay: false,
    batteryOptimization: false,
    cinemaMode: false,
    wallpaperType: 'video',
    wallpaperQuality: 'high',
    dailyRotation: true
  });

  // Authoritative in-memory preference state
  const settingsState = Object.assign({}, defaultSettingsState);

  /**
   * Initializes fast-path mirrors from localStorage without running async storage queries.
   */
  function initializeSettingsStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (localStorage.getItem(FAST_PERFORMANCE_MODE_KEY) === '1') {
          settingsState.performanceMode = true;
        }
        const rawDim = localStorage.getItem('fast-bg-dim');
        if (rawDim !== null) {
          const parsedDim = parseInt(rawDim, 10);
          if (Number.isFinite(parsedDim)) {
            settingsState.backgroundDim = Math.min(Math.max(parsedDim, 0), 90);
          }
        }
      }
    } catch (e) {
      // Best-effort local mirror read only
    }
  }

  /**
   * Loads all preferences from persistent storage and applies runtime updates.
   */
  async function loadAppSettingsFromStorage() {
    try {
      if (typeof runSchemaMigrations === 'function') {
        await runSchemaMigrations();
      }
    } catch (migErr) {
      console.error('Schema migration run failed safely:', migErr);
    }

    try {
      const searchRememberKey = typeof APP_SEARCH_REMEMBER_ENGINE_KEY !== 'undefined'
        ? APP_SEARCH_REMEMBER_ENGINE_KEY
        : 'appSearchRememberEngine';
      const searchDefaultKey = typeof APP_SEARCH_DEFAULT_ENGINE_KEY !== 'undefined'
        ? APP_SEARCH_DEFAULT_ENGINE_KEY
        : 'appSearchDefaultEngine';
      const wpQualityKey = typeof WALLPAPER_QUALITY_KEY !== 'undefined'
        ? WALLPAPER_QUALITY_KEY
        : 'wallpaperQualityPreference';
      const wpTypeKey = typeof WALLPAPER_TYPE_KEY !== 'undefined'
        ? WALLPAPER_TYPE_KEY
        : 'wallpaperTypePreference';
      const dailyRotKey = typeof DAILY_ROTATION_KEY !== 'undefined'
        ? DAILY_ROTATION_KEY
        : 'dailyWallpaperEnabled';
      const widgetOrderKey = typeof WIDGET_ORDER_KEY !== 'undefined'
        ? WIDGET_ORDER_KEY
        : 'widgetOrderPreference';

      const preferenceKeys = [
        APP_TIME_FORMAT_KEY,
        APP_SHOW_SIDEBAR_KEY,
        APP_SHOW_WEATHER_KEY,
        APP_SHOW_QUOTE_KEY,
        APP_SHOW_NEWS_KEY,
        APP_SHOW_TODO_KEY,
        widgetOrderKey,
        APP_NEWS_SOURCE_KEY,
        APP_MAX_TABS_KEY,
        APP_AUTOCLOSE_KEY,
        APP_SINGLETON_MODE_KEY,
        APP_SEARCH_OPEN_NEW_TAB_KEY,
        searchRememberKey,
        searchDefaultKey,
        APP_SEARCH_MATH_KEY,
        APP_SEARCH_SHOW_HISTORY_KEY,
        APP_SEARCH_SUGGESTIONS_KEY,
        APP_BOOKMARK_OPEN_NEW_TAB_KEY,
        APP_BOOKMARK_TEXT_BG_KEY,
        APP_BOOKMARK_TEXT_BG_COLOR_KEY,
        APP_BOOKMARK_TEXT_OPACITY_KEY,
        APP_BOOKMARK_TEXT_BLUR_KEY,
        APP_BOOKMARK_FALLBACK_COLOR_KEY,
        APP_BOOKMARK_FOLDER_COLOR_KEY,
        APP_BACKGROUND_DIM_KEY,
        APP_PERFORMANCE_MODE_KEY,
        APP_DEBUG_PERF_OVERLAY_KEY,
        APP_BATTERY_OPTIMIZATION_KEY,
        APP_CINEMA_MODE_KEY,
        APP_CONTAINER_MODE_KEY,
        APP_CONTAINER_NEW_TAB_KEY,
        APP_GRID_ANIMATION_KEY,
        APP_GRID_ANIMATION_ENABLED_KEY,
        APP_GRID_ANIMATION_SPEED_KEY,
        APP_GLASS_STYLE_KEY,
        wpQualityKey,
        wpTypeKey,
        dailyRotKey
      ];

      let stored = {};
      if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.getMany) {
        stored = await HomebaseStorage.getMany(preferenceKeys);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        stored = await browser.storage.local.get(preferenceKeys);
      }

      settingsState.performanceMode = stored[APP_PERFORMANCE_MODE_KEY] === true;
      if (typeof syncFastPerformanceModeMirror === 'function') {
        syncFastPerformanceModeMirror(settingsState.performanceMode);
      }
      settingsState.debugPerfOverlay = stored[APP_DEBUG_PERF_OVERLAY_KEY] === true;
      settingsState.batteryOptimization = stored[APP_BATTERY_OPTIMIZATION_KEY] === true;
      settingsState.cinemaMode = stored[APP_CINEMA_MODE_KEY] === true;

      if (settingsState.performanceMode && typeof applyPerformanceModeState === 'function') {
        applyPerformanceModeState(settingsState.performanceMode);
      }

      // Load style preferences from the existing startup settings batch
      settingsState.gridAnimation = stored[APP_GRID_ANIMATION_KEY] || 'default';
      settingsState.glassStyle = stored[APP_GLASS_STYLE_KEY] || 'original';
      if (!settingsState.performanceMode) {
        if (typeof applyGridAnimation === 'function') {
          applyGridAnimation(settingsState.gridAnimation);
        }
        if (typeof applyGlassStyle === 'function') {
          applyGlassStyle(settingsState.glassStyle);
        }
      }

      settingsState.timeFormat = stored[APP_TIME_FORMAT_KEY] || '12-hour';
      if (typeof applyTimeFormatPreference === 'function') {
        applyTimeFormatPreference(settingsState.timeFormat);
      }

      const storedShowSidebar = stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true;
      const storedShowWeather = stored.hasOwnProperty(APP_SHOW_WEATHER_KEY) ? stored[APP_SHOW_WEATHER_KEY] !== false : true;
      const storedShowQuote = stored.hasOwnProperty(APP_SHOW_QUOTE_KEY) ? stored[APP_SHOW_QUOTE_KEY] !== false : true;
      const hasStoredNews = stored.hasOwnProperty(APP_SHOW_NEWS_KEY);
      const storedShowNews = hasStoredNews ? stored[APP_SHOW_NEWS_KEY] === true : false;
      const storedShowTodo = stored.hasOwnProperty(APP_SHOW_TODO_KEY) ? stored[APP_SHOW_TODO_KEY] !== false : true;

      settingsState.showSidebar = storedShowSidebar;
      settingsState.showWeather = storedShowWeather;
      settingsState.showQuote = storedShowQuote;
      settingsState.showNews = storedShowNews;
      settingsState.showTodo = storedShowTodo;

      settingsState.newsSource = typeof resolveNewsSourceId === 'function'
        ? resolveNewsSourceId(stored[APP_NEWS_SOURCE_KEY])
        : (stored[APP_NEWS_SOURCE_KEY] || 'aljazeera');

      const storedWidgetOrder = stored[widgetOrderKey];
      const orderNormalizer = typeof normalizeWidgetOrder === 'function'
        ? normalizeWidgetOrder
        : (typeof window !== 'undefined' ? window.normalizeWidgetOrder : null);
      const orderComparator = typeof areWidgetOrdersEqual === 'function'
        ? areWidgetOrdersEqual
        : (typeof window !== 'undefined' ? window.areWidgetOrdersEqual : null);
      const normalizedWidgetOrder = orderNormalizer ? orderNormalizer(storedWidgetOrder) : storedWidgetOrder;
      const shouldPersistWidgetOrder = orderComparator ? !orderComparator(storedWidgetOrder, normalizedWidgetOrder) : false;

      if (typeof setWidgetOrderPreference === 'function') {
        setWidgetOrderPreference(normalizedWidgetOrder, { persist: shouldPersistWidgetOrder });
      }

      if (typeof setWeatherPreference === 'function') {
        setWeatherPreference(storedShowWeather, { persist: false, applyVisibility: false, updateUI: false });
      }
      if (typeof setQuotePreference === 'function') {
        setQuotePreference(storedShowQuote, { persist: false, applyVisibility: false, updateUI: false });
      }
      if (typeof setNewsPreference === 'function') {
        setNewsPreference(storedShowNews, { persist: !hasStoredNews, applyVisibility: false, updateUI: false });
      }
      if (typeof setTodoPreference === 'function') {
        setTodoPreference(storedShowTodo, { persist: false, applyVisibility: false, updateUI: false });
      }
      if (typeof applySidebarVisibility === 'function') {
        applySidebarVisibility(storedShowSidebar);
      }
      if (typeof applyWidgetVisibility === 'function') {
        applyWidgetVisibility();
      }

      settingsState.maxTabs = parseInt(stored[APP_MAX_TABS_KEY] || 0, 10);
      settingsState.autoClose = parseInt(stored[APP_AUTOCLOSE_KEY] || 0, 10);
      settingsState.singletonMode = stored[APP_SINGLETON_MODE_KEY] === true;
      settingsState.searchOpenNewTab = stored[APP_SEARCH_OPEN_NEW_TAB_KEY] === true;
      settingsState.searchRememberEngine = stored[searchRememberKey] !== false;

      if (stored[searchDefaultKey]) {
        settingsState.searchDefaultEngine = stored[searchDefaultKey];
      }

      settingsState.searchMath = stored[APP_SEARCH_MATH_KEY] !== false;
      settingsState.searchShowHistory = stored[APP_SEARCH_SHOW_HISTORY_KEY] === true;
      settingsState.searchSuggestions = stored[APP_SEARCH_SUGGESTIONS_KEY] !== false;

      settingsState.bookmarkOpenNewTab = stored[APP_BOOKMARK_OPEN_NEW_TAB_KEY] === true;
      settingsState.bookmarkTextBg = stored[APP_BOOKMARK_TEXT_BG_KEY] === true;
      if (typeof applyBookmarkTextBg === 'function') {
        applyBookmarkTextBg(settingsState.bookmarkTextBg);
      }

      settingsState.bookmarkTextBgOpacity = parseFloat(stored[APP_BOOKMARK_TEXT_OPACITY_KEY] || 0.65);
      if (typeof applyBookmarkTextBgOpacity === 'function') {
        applyBookmarkTextBgOpacity(settingsState.bookmarkTextBgOpacity);
      }

      settingsState.bookmarkTextBgBlur = parseInt(stored[APP_BOOKMARK_TEXT_BLUR_KEY] || 4, 10);
      if (typeof applyBookmarkTextBgBlur === 'function') {
        applyBookmarkTextBgBlur(settingsState.bookmarkTextBgBlur);
      }

      settingsState.bookmarkTextBgColor = stored[APP_BOOKMARK_TEXT_BG_COLOR_KEY] || '#2CA5FF';
      if (typeof applyBookmarkTextBgColor === 'function') {
        applyBookmarkTextBgColor(settingsState.bookmarkTextBgColor);
      }

      settingsState.bookmarkFallbackColor = stored[APP_BOOKMARK_FALLBACK_COLOR_KEY] || '#00b8d4';
      settingsState.bookmarkFolderColor = stored[APP_BOOKMARK_FOLDER_COLOR_KEY] || '#FFFFFF';

      // Load Animation enabled toggle (default false)
      const animEnabled = stored[APP_GRID_ANIMATION_ENABLED_KEY] === true;
      settingsState.gridAnimationEnabled = animEnabled;
      if (!settingsState.performanceMode && typeof applyGridAnimationEnabled === 'function') {
        applyGridAnimationEnabled(animEnabled);
      }

      // Load Animation Speed
      const savedSpeed = stored[APP_GRID_ANIMATION_SPEED_KEY];
      settingsState.gridAnimationSpeed = parseFloat(savedSpeed !== undefined ? savedSpeed : 0.3) || 0.3;
      if (!settingsState.performanceMode && typeof applyGridAnimationSpeed === 'function') {
        applyGridAnimationSpeed(settingsState.gridAnimationSpeed);
      }

      const savedBackgroundDim = stored.hasOwnProperty(APP_BACKGROUND_DIM_KEY) ? stored[APP_BACKGROUND_DIM_KEY] : 0;
      settingsState.backgroundDim = parseInt(savedBackgroundDim, 10) || 0;

      settingsState.containerMode = stored[APP_CONTAINER_MODE_KEY] !== false;
      settingsState.containerNewTab = stored[APP_CONTAINER_NEW_TAB_KEY] !== false;

      // Synchronize wallpaper preferences with wallpaper controller if present
      if (typeof wallpaperQualityPreference !== 'undefined') {
        wallpaperQualityPreference = stored[wpQualityKey] === 'high' ? 'high' : 'low';
      }
      if (typeof wallpaperTypePreference !== 'undefined') {
        wallpaperTypePreference = stored[wpTypeKey] === 'static' ? 'static' : 'video';
      }
      if (typeof dailyRotationPreference !== 'undefined') {
        dailyRotationPreference = stored.hasOwnProperty(dailyRotKey) ? stored[dailyRotKey] !== false : true;
      }

      if (typeof applyBookmarkFallbackColor === 'function') {
        applyBookmarkFallbackColor(settingsState.bookmarkFallbackColor);
      }
      if (typeof applyBookmarkFolderColor === 'function') {
        applyBookmarkFolderColor(settingsState.bookmarkFolderColor);
      }

      if (!settingsState.performanceMode && typeof applyPerformanceModeState === 'function') {
        applyPerformanceModeState(settingsState.performanceMode);
      }

      if (typeof setPerfOverlayEnabled === 'function') {
        const isDebugOn = typeof isStartupPerfDebugEnabled === 'function' ? isStartupPerfDebugEnabled() : false;
        setPerfOverlayEnabled(settingsState.debugPerfOverlay || isDebugOn);
      }

      if (typeof resetCinemaMode === 'function') {
        resetCinemaMode();
      }

      if (typeof applyBackgroundDim === 'function') {
        applyBackgroundDim(savedBackgroundDim);
      }

      // Keep preload fast path in sync even if Settings UI is never opened
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('fast-bg-dim', String(settingsState.backgroundDim));
        }
      } catch (err) {
        // Ignore; best-effort mirror only
      }

      if (typeof updateWidgetSettingsUI === 'function') {
        updateWidgetSettingsUI();
      }

      if (settingsState.singletonMode && typeof handleSingletonMode === 'function') {
        await handleSingletonMode();
      }

      if (typeof runWhenIdle === 'function' && typeof manageHomebaseTabs === 'function') {
        runWhenIdle(() => manageHomebaseTabs());
      }
    } catch (err) {
      console.warn('Failed to load application settings from storage:', err);
    }

    return settingsState;
  }

  /**
   * Persists an object of preference updates atomically across storage and mirrors.
   */
  async function saveAppSettings(updates = {}) {
    const storageBatch = {};
    const propToStorageKey = {
      timeFormat: APP_TIME_FORMAT_KEY,
      backgroundDim: APP_BACKGROUND_DIM_KEY,
      showSidebar: APP_SHOW_SIDEBAR_KEY,
      showWeather: APP_SHOW_WEATHER_KEY,
      showQuote: APP_SHOW_QUOTE_KEY,
      showNews: APP_SHOW_NEWS_KEY,
      showTodo: APP_SHOW_TODO_KEY,
      newsSource: APP_NEWS_SOURCE_KEY,
      maxTabs: APP_MAX_TABS_KEY,
      autoClose: APP_AUTOCLOSE_KEY,
      singletonMode: APP_SINGLETON_MODE_KEY,
      searchOpenNewTab: APP_SEARCH_OPEN_NEW_TAB_KEY,
      searchRememberEngine: typeof APP_SEARCH_REMEMBER_ENGINE_KEY !== 'undefined' ? APP_SEARCH_REMEMBER_ENGINE_KEY : 'appSearchRememberEngine',
      searchDefaultEngine: typeof APP_SEARCH_DEFAULT_ENGINE_KEY !== 'undefined' ? APP_SEARCH_DEFAULT_ENGINE_KEY : 'appSearchDefaultEngine',
      searchMath: APP_SEARCH_MATH_KEY,
      searchShowHistory: APP_SEARCH_SHOW_HISTORY_KEY,
      searchSuggestions: APP_SEARCH_SUGGESTIONS_KEY,
      containerMode: APP_CONTAINER_MODE_KEY,
      containerNewTab: APP_CONTAINER_NEW_TAB_KEY,
      bookmarkOpenNewTab: APP_BOOKMARK_OPEN_NEW_TAB_KEY,
      bookmarkTextBg: APP_BOOKMARK_TEXT_BG_KEY,
      bookmarkTextBgColor: APP_BOOKMARK_TEXT_BG_COLOR_KEY,
      bookmarkTextBgOpacity: APP_BOOKMARK_TEXT_OPACITY_KEY,
      bookmarkTextBgBlur: APP_BOOKMARK_TEXT_BLUR_KEY,
      bookmarkFallbackColor: APP_BOOKMARK_FALLBACK_COLOR_KEY,
      bookmarkFolderColor: APP_BOOKMARK_FOLDER_COLOR_KEY,
      gridAnimation: APP_GRID_ANIMATION_KEY,
      gridAnimationSpeed: APP_GRID_ANIMATION_SPEED_KEY,
      gridAnimationEnabled: APP_GRID_ANIMATION_ENABLED_KEY,
      glassStyle: APP_GLASS_STYLE_KEY,
      performanceMode: APP_PERFORMANCE_MODE_KEY,
      debugPerfOverlay: APP_DEBUG_PERF_OVERLAY_KEY,
      batteryOptimization: APP_BATTERY_OPTIMIZATION_KEY,
      cinemaMode: APP_CINEMA_MODE_KEY,
      wallpaperType: typeof WALLPAPER_TYPE_KEY !== 'undefined' ? WALLPAPER_TYPE_KEY : 'wallpaperTypePreference',
      wallpaperQuality: typeof WALLPAPER_QUALITY_KEY !== 'undefined' ? WALLPAPER_QUALITY_KEY : 'wallpaperQualityPreference',
      dailyRotation: typeof DAILY_ROTATION_KEY !== 'undefined' ? DAILY_ROTATION_KEY : 'dailyWallpaperEnabled'
    };

    for (const [prop, val] of Object.entries(updates)) {
      if (prop in settingsState) {
        settingsState[prop] = val;
      }
      const storageKey = propToStorageKey[prop] || SETTINGS_KEYS[`APP_${prop.replace(/([A-Z])/g, '_$1').toUpperCase()}_KEY`] || prop;
      storageBatch[storageKey] = val;

      if (prop === 'backgroundDim') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('fast-bg-dim', String(val));
          }
        } catch (e) {}
      } else if (prop === 'showSidebar') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('fast-show-sidebar', val !== false ? '1' : '0');
          }
        } catch (e) {}
        if (typeof applySidebarVisibility === 'function') {
          applySidebarVisibility(val !== false);
        }
        if (typeof applyWidgetVisibility === 'function') {
          applyWidgetVisibility();
        }
      } else if (prop === 'timeFormat') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('fast-time-format', String(val === '12-hour' ? '12-hour' : '24-hour'));
          }
        } catch (e) {}
      } else if (prop === 'performanceMode') {
        if (typeof syncFastPerformanceModeMirror === 'function') {
          syncFastPerformanceModeMirror(val === true);
        }
        if (typeof applyPerformanceModeState === 'function') {
          applyPerformanceModeState(val === true);
        }
      }
    }

    if (Object.keys(storageBatch).length > 0) {
      if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
        await HomebaseStorage.setMany(storageBatch);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set(storageBatch);
      }
    }
  }

  // --- Canonical Controller Object ---
  const HomebaseSettingsStorage = {
    keys: SETTINGS_KEYS,
    defaults: defaultSettingsState,
    state: settingsState,
    initialize: initializeSettingsStorage,
    load: loadAppSettingsFromStorage,
    save: saveAppSettings,
    get(prop) {
      return settingsState[prop];
    },
    set(prop, value) {
      settingsState[prop] = value;
    },
    getAll() {
      return Object.assign({}, settingsState);
    }
  };

  // =============================================================================
  // BACKWARD COMPATIBILITY BRIDGES
  // =============================================================================
  function definePreferenceBridge(windowProp, stateProp) {
    if (typeof globalScope[windowProp] !== 'undefined') {
      settingsState[stateProp] = globalScope[windowProp];
    }
    try {
      Object.defineProperty(globalScope, windowProp, {
        get() {
          return settingsState[stateProp];
        },
        set(val) {
          settingsState[stateProp] = val;
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      globalScope[windowProp] = settingsState[stateProp];
    }
  }

  // 1. Time Format, Background Dim & Sidebar
  definePreferenceBridge('appTimeFormatPreference', 'timeFormat');
  definePreferenceBridge('appBackgroundDimPreference', 'backgroundDim');
  definePreferenceBridge('appShowSidebarPreference', 'showSidebar');

  // 2. Widget Toggles
  definePreferenceBridge('appShowWeatherPreference', 'showWeather');
  definePreferenceBridge('appShowQuotePreference', 'showQuote');
  definePreferenceBridge('appShowNewsPreference', 'showNews');
  definePreferenceBridge('appShowTodoPreference', 'showTodo');
  definePreferenceBridge('appNewsSourcePreference', 'newsSource');

  // 3. Tab Lifecycle
  definePreferenceBridge('appMaxTabsPreference', 'maxTabs');
  definePreferenceBridge('appAutoClosePreference', 'autoClose');
  definePreferenceBridge('appSingletonModePreference', 'singletonMode');

  // 4. Search Preferences
  definePreferenceBridge('appSearchOpenNewTabPreference', 'searchOpenNewTab');
  definePreferenceBridge('appSearchRememberEnginePreference', 'searchRememberEngine');
  definePreferenceBridge('appSearchDefaultEnginePreference', 'searchDefaultEngine');
  definePreferenceBridge('appSearchMathPreference', 'searchMath');
  definePreferenceBridge('appSearchShowHistoryPreference', 'searchShowHistory');
  definePreferenceBridge('appSearchSuggestionsPreference', 'searchSuggestions');

  // 5. Container Preferences
  definePreferenceBridge('appContainerModePreference', 'containerMode');
  definePreferenceBridge('appContainerNewTabPreference', 'containerNewTab');

  // 6. Bookmark Style & Behavior
  definePreferenceBridge('appBookmarkOpenNewTabPreference', 'bookmarkOpenNewTab');
  definePreferenceBridge('appBookmarkTextBgPreference', 'bookmarkTextBg');
  definePreferenceBridge('appBookmarkTextBgColorPreference', 'bookmarkTextBgColor');
  definePreferenceBridge('appBookmarkTextBgOpacityPreference', 'bookmarkTextBgOpacity');
  definePreferenceBridge('appBookmarkTextBgBlurPreference', 'bookmarkTextBgBlur');
  definePreferenceBridge('appBookmarkFallbackColorPreference', 'bookmarkFallbackColor');
  definePreferenceBridge('appBookmarkFolderColorPreference', 'bookmarkFolderColor');

  // 7. Visual Effects & Performance
  definePreferenceBridge('appGridAnimationPreference', 'gridAnimation');
  definePreferenceBridge('appGridAnimationSpeedPreference', 'gridAnimationSpeed');
  definePreferenceBridge('appGridAnimationEnabledPreference', 'gridAnimationEnabled');
  definePreferenceBridge('appGlassStylePreference', 'glassStyle');
  definePreferenceBridge('appPerformanceModePreference', 'performanceMode');
  definePreferenceBridge('debugPerfOverlayPreference', 'debugPerfOverlay');
  definePreferenceBridge('appBatteryOptimizationPreference', 'batteryOptimization');
  definePreferenceBridge('appCinemaModePreference', 'cinemaMode');

  // Storage key constant bridges on window
  for (const [constName, storageKey] of Object.entries(SETTINGS_KEYS)) {
    globalScope[constName] = storageKey;
  }

  // Legacy function bridge
  globalScope.loadAppSettingsFromStorage = () => HomebaseSettingsStorage.load();

  // Primary Controller Export
  globalScope.HomebaseSettingsStorage = HomebaseSettingsStorage;

  // Backward compatibility alias: if HomebaseSettingsPreferences is not yet assigned,
  // assign HomebaseSettingsStorage as its baseline
  if (!globalScope.HomebaseSettingsPreferences) {
    globalScope.HomebaseSettingsPreferences = HomebaseSettingsStorage;
  }
  if (!globalScope.HomebaseSettingsPreferenceController) {
    globalScope.HomebaseSettingsPreferenceController = HomebaseSettingsStorage;
  }
})();
