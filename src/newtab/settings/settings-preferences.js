// =============================================================================
// Homebase Settings Preference State & Synchronization Controller
// Module: src/newtab/settings/settings-preferences.js
// Single authoritative owner of storage keys, canonical state, and synchronization.
// =============================================================================

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

// Lazy DOM element ID mapping
const SETTINGS_ELEMENT_IDS = Object.freeze({
  appSettingsCloseBtn: 'app-settings-close',
  appSettingsCancelBtn: 'app-settings-cancel',
  appSettingsSaveBtn: 'app-settings-save',
  appTimeFormatSelect: 'app-time-format',
  appSidebarToggle: 'app-show-sidebar-toggle',
  appWeatherToggle: 'app-show-weather-toggle',
  appQuoteToggle: 'app-show-quote-toggle',
  appNewsToggle: 'app-show-news-toggle',
  appTodoToggle: 'app-show-todo-toggle',
  appMaxTabsSelect: 'app-max-tabs-select',
  appAutoCloseSelect: 'app-autoclose-select',
  appSearchOpenNewTabToggle: 'app-search-open-new-tab-toggle',
  appSearchRememberEngineToggle: 'app-search-remember-engine-toggle',
  appSearchMathToggle: 'app-search-math-toggle',
  appSearchHistoryToggle: 'app-search-history-toggle',
  appSearchSuggestionsToggle: 'app-search-suggestions-toggle',
  appSearchDefaultEngineContainer: 'app-search-default-engine-container',
  appSearchDefaultEngineSelect: 'app-search-default-engine-select',
  appDimSlider: 'app-dim-slider',
  appDimLabel: 'app-dim-value-label',
  appDailyToggle: 'app-daily-toggle',
  appWallpaperTypeSelect: 'app-wallpaper-type-select',
  appWallpaperQualitySelect: 'app-wallpaper-quality-select',
  wallpaperTypeToggle: 'gallery-wallpaper-type-toggle',
  wallpaperQualityToggle: 'gallery-wallpaper-quality-toggle',
  galleryDailyToggle: 'gallery-daily-toggle'
});

/**
 * Lazily resolves settings DOM element handles on demand.
 * Avoids any DOM dependencies during script evaluation.
 */
function getSettingsElements() {
  if (typeof document === 'undefined') return {};
  const elements = {};
  for (const [prop, id] of Object.entries(SETTINGS_ELEMENT_IDS)) {
    elements[prop] = document.getElementById(id);
  }
  return elements;
}

/**
 * Initializes controller internals without running async storage queries.
 * Synchronizes fast-path mirrors from localStorage.
 */
function initializeSettingsPreferences() {
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

    const elements = getSettingsElements();
    if (elements.wallpaperTypeToggle) {
      elements.wallpaperTypeToggle.checked = (typeof wallpaperTypePreference !== 'undefined' ? wallpaperTypePreference : 'video') === 'video';
    }
    if (elements.galleryDailyToggle) {
      elements.galleryDailyToggle.checked = typeof dailyRotationPreference !== 'undefined' ? dailyRotationPreference !== false : true;
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

    if (elements.appDimSlider) {
      elements.appDimSlider.value = settingsState.backgroundDim;
    }
    if (elements.appDimLabel) {
      elements.appDimLabel.textContent = `${settingsState.backgroundDim}%`;
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
    console.warn('Failed to load app settings', err);
  }
}

/**
 * Synchronizes the Settings Form DOM controls with in-memory preference state.
 */
function syncAppSettingsForm() {
  if (typeof document === 'undefined') return;

  const elements = getSettingsElements();

  if (elements.appTimeFormatSelect) {
    elements.appTimeFormatSelect.value = typeof timeFormatPreference !== 'undefined'
      ? timeFormatPreference
      : settingsState.timeFormat;
  }

  if (elements.appDimSlider) {
    elements.appDimSlider.value = settingsState.backgroundDim;
  }
  if (elements.appDimLabel) {
    elements.appDimLabel.textContent = `${settingsState.backgroundDim}%`;
  }

  if (elements.appSidebarToggle) {
    elements.appSidebarToggle.checked = settingsState.showSidebar;
  }
  if (elements.appWeatherToggle) {
    elements.appWeatherToggle.checked = settingsState.showWeather;
  }
  if (elements.appQuoteToggle) {
    elements.appQuoteToggle.checked = settingsState.showQuote;
  }
  if (elements.appNewsToggle) {
    elements.appNewsToggle.checked = settingsState.showNews;
  }

  if (elements.appTodoToggle) {
    elements.appTodoToggle.checked = settingsState.showTodo;
    if (!elements.appTodoToggle.dataset.listenerAttached) {
      elements.appTodoToggle.dataset.listenerAttached = 'true';
      elements.appTodoToggle.addEventListener('change', (e) => {
        if (typeof setTodoPreference === 'function') {
          setTodoPreference(e.target.checked);
        }
      });
    }
  }

  if (elements.appMaxTabsSelect) {
    elements.appMaxTabsSelect.value = settingsState.maxTabs;
  }
  if (elements.appAutoCloseSelect) {
    elements.appAutoCloseSelect.value = settingsState.autoClose;
  }

  if (elements.appSearchOpenNewTabToggle) {
    elements.appSearchOpenNewTabToggle.checked = settingsState.searchOpenNewTab;
  }
  if (elements.appSearchRememberEngineToggle) {
    elements.appSearchRememberEngineToggle.checked = settingsState.searchRememberEngine;
  }
  if (elements.appSearchMathToggle) {
    elements.appSearchMathToggle.checked = settingsState.searchMath;
  }
  if (elements.appSearchHistoryToggle) {
    elements.appSearchHistoryToggle.checked = settingsState.searchShowHistory;
  }
  if (elements.appSearchSuggestionsToggle) {
    elements.appSearchSuggestionsToggle.checked = settingsState.searchSuggestions;
  }

  const containerModeToggle = document.getElementById('app-container-mode-toggle');
  const containerSubSettings = document.getElementById('container-sub-settings');
  const containerBehaviorRow = document.getElementById('app-container-behavior-row');
  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');
  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');

  if (containerModeToggle) {
    containerModeToggle.checked = settingsState.containerMode;
  }
  if (containerSubSettings && typeof setSubSettingsExpanded === 'function') {
    setSubSettingsExpanded(containerSubSettings, settingsState.containerMode);
  }
  if (containerBehaviorRow) {
    containerBehaviorRow.style.display = settingsState.containerMode ? 'flex' : 'none';
  }
  if (radioKeep && radioClose) {
    if (settingsState.containerNewTab) {
      radioKeep.checked = true;
    } else {
      radioClose.checked = true;
    }
  }

  const dailyRotVal = typeof dailyRotationPreference !== 'undefined'
    ? dailyRotationPreference !== false
    : true;
  const wpTypeVal = typeof wallpaperTypePreference !== 'undefined'
    ? wallpaperTypePreference
    : 'video';
  const wpQualityVal = typeof wallpaperQualityPreference !== 'undefined'
    ? wallpaperQualityPreference
    : 'low';

  if (elements.appDailyToggle) {
    elements.appDailyToggle.checked = dailyRotVal;
  }
  if (elements.appWallpaperTypeSelect) {
    elements.appWallpaperTypeSelect.value = wpTypeVal === 'static' ? 'static' : 'video';
  }
  if (elements.appWallpaperQualitySelect) {
    elements.appWallpaperQualitySelect.value = wpQualityVal === 'high' ? 'high' : 'low';
  }
  if (elements.wallpaperTypeToggle) {
    elements.wallpaperTypeToggle.checked = (wpTypeVal || 'video') === 'video';
  }
  if (elements.galleryDailyToggle) {
    elements.galleryDailyToggle.checked = dailyRotVal;
  }
  if (elements.wallpaperQualityToggle) {
    elements.wallpaperQualityToggle.checked = wpQualityVal === 'high';
  }

  const bookmarkNewTabToggle = document.getElementById('app-bookmark-open-new-tab-toggle');
  if (bookmarkNewTabToggle) {
    bookmarkNewTabToggle.checked = settingsState.bookmarkOpenNewTab;
  }

  const bookmarkTextBgToggle = document.getElementById('app-bookmark-text-bg-toggle');
  const bookmarkTextBgColorRow = document.getElementById('app-bookmark-text-bg-color-row');
  const bookmarkTextBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');
  const bookmarkTextBgBlurRow = document.getElementById('app-bookmark-text-blur-row');

  if (bookmarkTextBgToggle) {
    bookmarkTextBgToggle.checked = settingsState.bookmarkTextBg;
    if (bookmarkTextBgColorRow) {
      bookmarkTextBgColorRow.classList.toggle('hidden', !settingsState.bookmarkTextBg);
    }
    if (bookmarkTextBgOpacityRow) {
      bookmarkTextBgOpacityRow.classList.toggle('hidden', !settingsState.bookmarkTextBg);
    }
    if (bookmarkTextBgBlurRow) {
      bookmarkTextBgBlurRow.classList.toggle('hidden', !settingsState.bookmarkTextBg);
    }
  }

  const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');
  if (textBgColorTrigger) {
    if (typeof updateColorTrigger === 'function') {
      updateColorTrigger(textBgColorTrigger, settingsState.bookmarkTextBgColor);
    }
    textBgColorTrigger.dataset.value = settingsState.bookmarkTextBgColor;
  }

  const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');
  const textBgOpacityValue = document.getElementById('app-bookmark-text-opacity-value');
  if (textBgOpacitySlider) {
    textBgOpacitySlider.value = settingsState.bookmarkTextBgOpacity;
  }
  if (textBgOpacityValue) {
    textBgOpacityValue.textContent = `${Math.round(settingsState.bookmarkTextBgOpacity * 100)}%`;
  }

  const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');
  const textBgBlurValue = document.getElementById('app-bookmark-text-blur-value');
  if (textBgBlurSlider) {
    textBgBlurSlider.value = settingsState.bookmarkTextBgBlur;
  }
  if (textBgBlurValue) {
    textBgBlurValue.textContent = `${settingsState.bookmarkTextBgBlur}px`;
  }

  const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');
  if (colorTrigger) {
    if (typeof updateColorTrigger === 'function') {
      updateColorTrigger(colorTrigger, settingsState.bookmarkFallbackColor);
    }
    colorTrigger.dataset.value = settingsState.bookmarkFallbackColor;
  }

  const folderColorTrigger = document.getElementById('app-bookmark-folder-color-trigger');
  if (folderColorTrigger) {
    if (typeof updateColorTrigger === 'function') {
      updateColorTrigger(folderColorTrigger, settingsState.bookmarkFolderColor);
    }
    folderColorTrigger.dataset.value = settingsState.bookmarkFolderColor;
  }

  // Sync Animation Speed slider/label
  const speedSlider = document.getElementById('app-grid-animation-speed-slider');
  const speedLabel = document.getElementById('app-grid-animation-speed-value');
  if (speedSlider) {
    speedSlider.value = settingsState.gridAnimationSpeed;
  }
  if (speedLabel) {
    speedLabel.textContent = `${settingsState.gridAnimationSpeed}s`;
  }

  if (typeof updateGridAnimationSettingsUI === 'function') {
    updateGridAnimationSettingsUI();
  }

  const perfToggle = document.getElementById('app-performance-mode-toggle');
  if (perfToggle) {
    perfToggle.checked = settingsState.performanceMode;
    if (!perfToggle.dataset.listenerAttached) {
      perfToggle.dataset.listenerAttached = 'true';
      perfToggle.addEventListener('change', async () => {
        const nextValue = perfToggle.checked;
        settingsState.performanceMode = nextValue;
        if (typeof syncFastPerformanceModeMirror === 'function') {
          syncFastPerformanceModeMirror(nextValue);
        }
        if (typeof applyPerformanceModeState === 'function') {
          applyPerformanceModeState(nextValue);
        }
        try {
          if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
            await HomebaseStorage.set(APP_PERFORMANCE_MODE_KEY, nextValue);
          } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
            await browser.storage.local.set({ [APP_PERFORMANCE_MODE_KEY]: nextValue });
          }
        } catch (err) {
          console.warn('Failed to persist performance mode toggle', err);
        }
      });
    }
  }

  const perfDebugToggle = document.getElementById('app-perf-debug-overlay-toggle');
  if (perfDebugToggle) {
    perfDebugToggle.checked = settingsState.debugPerfOverlay;
    if (!perfDebugToggle.dataset.listenerAttached) {
      perfDebugToggle.dataset.listenerAttached = 'true';
      perfDebugToggle.addEventListener('change', async () => {
        const nextValue = perfDebugToggle.checked;
        settingsState.debugPerfOverlay = nextValue;
        if (typeof setPerfOverlayEnabled === 'function') {
          setPerfOverlayEnabled(nextValue);
        }
        try {
          if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
            await HomebaseStorage.set(APP_DEBUG_PERF_OVERLAY_KEY, nextValue);
          } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
            await browser.storage.local.set({ [APP_DEBUG_PERF_OVERLAY_KEY]: nextValue });
          }
        } catch (err) {
          console.warn('Failed to persist perf overlay toggle', err);
        }
      });
    }
  }

  const batteryToggle = document.getElementById('app-battery-optimization-toggle');
  if (batteryToggle) {
    batteryToggle.checked = settingsState.batteryOptimization;
    if (typeof navigator !== 'undefined' && !('getBattery' in navigator)) {
      const row = batteryToggle.closest('.app-setting-row');
      if (row) {
        row.style.display = 'none';
      }
    }
  }

  const cinemaToggle = document.getElementById('app-cinema-mode-toggle');
  if (cinemaToggle) {
    cinemaToggle.checked = settingsState.cinemaMode;
  }

  if (typeof updateWidgetSettingsUI === 'function') {
    updateWidgetSettingsUI();
  }
  if (typeof updateDefaultEngineVisibilityControl === 'function') {
    updateDefaultEngineVisibilityControl();
  }

  const singletonToggle = document.getElementById('app-singleton-mode-toggle');
  if (singletonToggle) {
    singletonToggle.checked = settingsState.singletonMode;
  }
}

/**
 * Persists updated settings to storage and synchronizes state.
 * @param {Object} updates Dictionary of settings to persist.
 */
async function saveAppSettings(updates = {}) {
  if (!updates || typeof updates !== 'object') return;
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

/**
 * Synchronizes settings changes from browser.storage.onChanged in real time across open tabs.
 */
function handleSettingsStorageChange(changes, area) {
  if (area && area !== 'local') return;
  if (!changes || typeof changes !== 'object') return;

  let stateUpdated = false;

  if (changes[APP_TIME_FORMAT_KEY]) {
    const nextFormat = changes[APP_TIME_FORMAT_KEY].newValue === '24-hour' ? '24-hour' : '12-hour';
    settingsState.timeFormat = nextFormat;
    stateUpdated = true;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('fast-time-format', nextFormat);
      }
    } catch (e) {}
    if (typeof applyTimeFormatPreference === 'function') {
      applyTimeFormatPreference(nextFormat);
    }
    if (typeof updateTime === 'function') {
      updateTime();
    }
  }

  if (changes[APP_BACKGROUND_DIM_KEY]) {
    const nextDim = parseInt(changes[APP_BACKGROUND_DIM_KEY].newValue !== undefined
      ? changes[APP_BACKGROUND_DIM_KEY].newValue
      : defaultSettingsState.backgroundDim, 10) || 0;
    settingsState.backgroundDim = nextDim;
    stateUpdated = true;
    if (typeof applyBackgroundDim === 'function') {
      applyBackgroundDim(nextDim);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('fast-bg-dim', String(nextDim));
      }
    } catch (e) {}
  }

  if (changes[APP_SHOW_SIDEBAR_KEY]) {
    const nextSidebar = changes[APP_SHOW_SIDEBAR_KEY].newValue !== false;
    settingsState.showSidebar = nextSidebar;
    stateUpdated = true;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('fast-show-sidebar', nextSidebar ? '1' : '0');
      }
    } catch (e) {}
    if (typeof applySidebarVisibility === 'function') {
      applySidebarVisibility(nextSidebar);
    }
    if (typeof applyWidgetVisibility === 'function') {
      applyWidgetVisibility();
    }
  }

  if (changes[APP_SHOW_WEATHER_KEY]) {
    const nextWeather = changes[APP_SHOW_WEATHER_KEY].newValue !== false;
    settingsState.showWeather = nextWeather;
    stateUpdated = true;
    if (typeof setWeatherPreference === 'function') {
      setWeatherPreference(nextWeather, { persist: false, applyVisibility: true, updateUI: true });
    }
  }

  if (changes[APP_SHOW_QUOTE_KEY]) {
    const nextQuote = changes[APP_SHOW_QUOTE_KEY].newValue !== false;
    settingsState.showQuote = nextQuote;
    stateUpdated = true;
    if (typeof setQuotePreference === 'function') {
      setQuotePreference(nextQuote, { persist: false, applyVisibility: true, updateUI: true });
    }
  }

  if (changes[APP_SHOW_NEWS_KEY]) {
    const nextNews = changes[APP_SHOW_NEWS_KEY].newValue === true;
    settingsState.showNews = nextNews;
    stateUpdated = true;
    if (typeof setNewsPreference === 'function') {
      setNewsPreference(nextNews, { persist: false, applyVisibility: true, updateUI: true });
    }
  }

  if (changes[APP_SHOW_TODO_KEY]) {
    const nextTodo = changes[APP_SHOW_TODO_KEY].newValue !== false;
    settingsState.showTodo = nextTodo;
    stateUpdated = true;
    if (typeof setTodoPreference === 'function') {
      setTodoPreference(nextTodo, { persist: false, applyVisibility: true, updateUI: true });
    }
  }

  if (changes[APP_NEWS_SOURCE_KEY]) {
    const nextSource = typeof resolveNewsSourceId === 'function'
      ? resolveNewsSourceId(changes[APP_NEWS_SOURCE_KEY].newValue)
      : (changes[APP_NEWS_SOURCE_KEY].newValue || defaultSettingsState.newsSource);
    settingsState.newsSource = nextSource;
    stateUpdated = true;
  }

  if (changes[APP_MAX_TABS_KEY]) {
    settingsState.maxTabs = parseInt(changes[APP_MAX_TABS_KEY].newValue || 0, 10);
    stateUpdated = true;
  }

  if (changes[APP_AUTOCLOSE_KEY]) {
    settingsState.autoClose = parseInt(changes[APP_AUTOCLOSE_KEY].newValue || 0, 10);
    stateUpdated = true;
  }

  if (changes[APP_SINGLETON_MODE_KEY]) {
    settingsState.singletonMode = changes[APP_SINGLETON_MODE_KEY].newValue === true;
    stateUpdated = true;
  }

  if (changes[APP_PERFORMANCE_MODE_KEY]) {
    const nextPerf = changes[APP_PERFORMANCE_MODE_KEY].newValue === true;
    settingsState.performanceMode = nextPerf;
    stateUpdated = true;
    if (typeof syncFastPerformanceModeMirror === 'function') {
      syncFastPerformanceModeMirror(nextPerf);
    }
    if (typeof applyPerformanceModeState === 'function') {
      applyPerformanceModeState(nextPerf);
    }
  }

  if (changes[APP_DEBUG_PERF_OVERLAY_KEY]) {
    const nextDebug = changes[APP_DEBUG_PERF_OVERLAY_KEY].newValue === true;
    settingsState.debugPerfOverlay = nextDebug;
    stateUpdated = true;
    if (typeof setPerfOverlayEnabled === 'function') {
      setPerfOverlayEnabled(nextDebug);
    }
  }

  if (changes[APP_BATTERY_OPTIMIZATION_KEY]) {
    settingsState.batteryOptimization = changes[APP_BATTERY_OPTIMIZATION_KEY].newValue === true;
    stateUpdated = true;
  }

  if (changes[APP_CINEMA_MODE_KEY]) {
    const nextCinema = changes[APP_CINEMA_MODE_KEY].newValue === true;
    settingsState.cinemaMode = nextCinema;
    stateUpdated = true;
    if (typeof resetCinemaMode === 'function') {
      resetCinemaMode();
    }
  }

  if (changes[APP_GRID_ANIMATION_KEY]) {
    const nextAnim = changes[APP_GRID_ANIMATION_KEY].newValue || defaultSettingsState.gridAnimation;
    settingsState.gridAnimation = nextAnim;
    stateUpdated = true;
    if (typeof applyGridAnimation === 'function' && !settingsState.performanceMode) {
      applyGridAnimation(nextAnim);
    }
  }

  if (changes[APP_GRID_ANIMATION_SPEED_KEY]) {
    const nextSpeed = parseFloat(changes[APP_GRID_ANIMATION_SPEED_KEY].newValue !== undefined
      ? changes[APP_GRID_ANIMATION_SPEED_KEY].newValue
      : defaultSettingsState.gridAnimationSpeed) || 0.3;
    settingsState.gridAnimationSpeed = nextSpeed;
    stateUpdated = true;
    if (typeof applyGridAnimationSpeed === 'function' && !settingsState.performanceMode) {
      applyGridAnimationSpeed(nextSpeed);
    }
  }

  if (changes[APP_GRID_ANIMATION_ENABLED_KEY]) {
    const nextEnabled = changes[APP_GRID_ANIMATION_ENABLED_KEY].newValue === true;
    settingsState.gridAnimationEnabled = nextEnabled;
    stateUpdated = true;
    if (typeof applyGridAnimationEnabled === 'function' && !settingsState.performanceMode) {
      applyGridAnimationEnabled(nextEnabled);
    }
  }

  if (changes[APP_GLASS_STYLE_KEY]) {
    const nextGlass = changes[APP_GLASS_STYLE_KEY].newValue || defaultSettingsState.glassStyle;
    settingsState.glassStyle = nextGlass;
    stateUpdated = true;
    if (typeof applyGlassStyle === 'function' && !settingsState.performanceMode) {
      applyGlassStyle(nextGlass);
    }
  }

  if (changes[APP_TIME_FORMAT_KEY]) {
    const nextFormat = changes[APP_TIME_FORMAT_KEY].newValue || defaultSettingsState.timeFormat;
    settingsState.timeFormat = nextFormat;
    stateUpdated = true;
    if (typeof applyTimeFormatPreference === 'function') {
      applyTimeFormatPreference(nextFormat);
    }
  }

  if (changes[APP_BOOKMARK_OPEN_NEW_TAB_KEY]) {
    settingsState.bookmarkOpenNewTab = changes[APP_BOOKMARK_OPEN_NEW_TAB_KEY].newValue === true;
    stateUpdated = true;
  }

  if (changes[APP_BOOKMARK_TEXT_BG_KEY]) {
    const nextTextBg = changes[APP_BOOKMARK_TEXT_BG_KEY].newValue === true;
    settingsState.bookmarkTextBg = nextTextBg;
    stateUpdated = true;
    if (typeof applyBookmarkTextBg === 'function') {
      applyBookmarkTextBg(nextTextBg);
    }
  }

  if (changes[APP_BOOKMARK_TEXT_BG_COLOR_KEY]) {
    const nextColor = changes[APP_BOOKMARK_TEXT_BG_COLOR_KEY].newValue || defaultSettingsState.bookmarkTextBgColor;
    settingsState.bookmarkTextBgColor = nextColor;
    stateUpdated = true;
    if (typeof applyBookmarkTextBgColor === 'function') {
      applyBookmarkTextBgColor(nextColor);
    }
  }

  if (changes[APP_BOOKMARK_TEXT_OPACITY_KEY]) {
    const nextOpacity = parseFloat(changes[APP_BOOKMARK_TEXT_OPACITY_KEY].newValue || defaultSettingsState.bookmarkTextBgOpacity);
    settingsState.bookmarkTextBgOpacity = nextOpacity;
    stateUpdated = true;
    if (typeof applyBookmarkTextBgOpacity === 'function') {
      applyBookmarkTextBgOpacity(nextOpacity);
    }
  }

  if (changes[APP_BOOKMARK_TEXT_BLUR_KEY]) {
    const nextBlur = parseInt(changes[APP_BOOKMARK_TEXT_BLUR_KEY].newValue || defaultSettingsState.bookmarkTextBgBlur, 10);
    settingsState.bookmarkTextBgBlur = nextBlur;
    stateUpdated = true;
    if (typeof applyBookmarkTextBgBlur === 'function') {
      applyBookmarkTextBgBlur(nextBlur);
    }
  }

  if (changes[APP_BOOKMARK_FALLBACK_COLOR_KEY]) {
    const nextFallback = changes[APP_BOOKMARK_FALLBACK_COLOR_KEY].newValue || defaultSettingsState.bookmarkFallbackColor;
    settingsState.bookmarkFallbackColor = nextFallback;
    stateUpdated = true;
    if (typeof applyBookmarkFallbackColor === 'function') {
      applyBookmarkFallbackColor(nextFallback);
    }
  }

  if (changes[APP_BOOKMARK_FOLDER_COLOR_KEY]) {
    const nextFolderColor = changes[APP_BOOKMARK_FOLDER_COLOR_KEY].newValue || defaultSettingsState.bookmarkFolderColor;
    settingsState.bookmarkFolderColor = nextFolderColor;
    stateUpdated = true;
    if (typeof applyBookmarkFolderColor === 'function') {
      applyBookmarkFolderColor(nextFolderColor);
    }
  }

  if (changes[APP_CONTAINER_MODE_KEY]) {
    settingsState.containerMode = changes[APP_CONTAINER_MODE_KEY].newValue !== false;
    stateUpdated = true;
  }

  if (changes[APP_CONTAINER_NEW_TAB_KEY]) {
    settingsState.containerNewTab = changes[APP_CONTAINER_NEW_TAB_KEY].newValue !== false;
    stateUpdated = true;
  }

  if (stateUpdated) {
    syncAppSettingsForm();
  }
}

// Controller Object
const HomebaseSettingsPreferences = {
  keys: SETTINGS_KEYS,
  state: settingsState,
  initialize: initializeSettingsPreferences,
  load: loadAppSettingsFromStorage,
  save: saveAppSettings,
  sync: syncAppSettingsForm,
  handleStorageChange: handleSettingsStorageChange,
  get(prop) {
    return settingsState[prop];
  },
  set(prop, value) {
    settingsState[prop] = value;
  },
  getAll() {
    return Object.assign({}, settingsState);
  },
  getElements: getSettingsElements
};

// =============================================================================
// LEGACY COMPATIBILITY BRIDGES
// =============================================================================
// The following accessors maintain 100% backward compatibility for external
// modules that read/write loose global preference variables.
// Routes directly to HomebaseSettingsPreferences.state.
// =============================================================================
const globalScope = typeof window !== 'undefined'
  ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this);

function definePreferenceBridge(windowProp, stateProp) {
  try {
    Object.defineProperty(globalScope, windowProp, {
      get() {
        return HomebaseSettingsPreferences.state[stateProp];
      },
      set(val) {
        HomebaseSettingsPreferences.state[stateProp] = val;
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    globalScope[windowProp] = HomebaseSettingsPreferences.state[stateProp];
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

// Legacy storage key constant bridges
for (const [constName, storageKey] of Object.entries(SETTINGS_KEYS)) {
  globalScope[constName] = storageKey;
}

// Legacy DOM element bridges (lazy resolution)
for (const [propName, elemId] of Object.entries(SETTINGS_ELEMENT_IDS)) {
  try {
    Object.defineProperty(globalScope, propName, {
      get() {
        return typeof document !== 'undefined' ? document.getElementById(elemId) : null;
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    // Ignore in non-DOM test environments
  }
}

// Legacy function bridges
globalScope.loadAppSettingsFromStorage = () => HomebaseSettingsPreferences.load();
globalScope.syncAppSettingsForm = () => HomebaseSettingsPreferences.sync();

// Window Controller Exports
globalScope.HomebaseSettingsPreferences = HomebaseSettingsPreferences;
globalScope.HomebaseSettingsPreferenceController = HomebaseSettingsPreferences;
