async function loadAppSettingsFromStorage() {
  try {
    if (typeof runSchemaMigrations === 'function') {
      await runSchemaMigrations();
    }
  } catch (migErr) {
    console.error('Schema migration run failed safely:', migErr);
  }

  try {

    const stored = await browser.storage.local.get([

      APP_TIME_FORMAT_KEY,

      APP_SHOW_SIDEBAR_KEY,

      APP_SHOW_WEATHER_KEY,

      APP_SHOW_QUOTE_KEY,

      APP_SHOW_NEWS_KEY,

      APP_SHOW_TODO_KEY,

      WIDGET_ORDER_KEY,

      APP_NEWS_SOURCE_KEY,

      APP_MAX_TABS_KEY,

      APP_AUTOCLOSE_KEY,

      APP_SINGLETON_MODE_KEY,

      APP_SEARCH_OPEN_NEW_TAB_KEY,

      APP_SEARCH_REMEMBER_ENGINE_KEY,

      APP_SEARCH_DEFAULT_ENGINE_KEY,

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

      WALLPAPER_QUALITY_KEY,

      WALLPAPER_TYPE_KEY,

      DAILY_ROTATION_KEY

    ]);

    appPerformanceModePreference = stored[APP_PERFORMANCE_MODE_KEY] === true;
    syncFastPerformanceModeMirror(appPerformanceModePreference);
    debugPerfOverlayPreference = stored[APP_DEBUG_PERF_OVERLAY_KEY] === true;
    appBatteryOptimizationPreference = stored[APP_BATTERY_OPTIMIZATION_KEY] === true;
    appCinemaModePreference = stored[APP_CINEMA_MODE_KEY] === true;

    if (appPerformanceModePreference) {
      applyPerformanceModeState(appPerformanceModePreference);
    }

    // Load style preferences from the existing startup settings batch
    appGridAnimationPreference = stored[APP_GRID_ANIMATION_KEY] || 'default';
    appGlassStylePreference = stored[APP_GLASS_STYLE_KEY] || 'original';
    if (!appPerformanceModePreference) {
      applyGridAnimation(appGridAnimationPreference);
      applyGlassStyle(appGlassStylePreference);
    }

    applyTimeFormatPreference(stored[APP_TIME_FORMAT_KEY] || '12-hour');

    const storedShowSidebar = stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true;
    const storedShowWeather = stored.hasOwnProperty(APP_SHOW_WEATHER_KEY) ? stored[APP_SHOW_WEATHER_KEY] !== false : true;
    const storedShowQuote = stored.hasOwnProperty(APP_SHOW_QUOTE_KEY) ? stored[APP_SHOW_QUOTE_KEY] !== false : true;
    const hasStoredNews = stored.hasOwnProperty(APP_SHOW_NEWS_KEY);
    const storedShowNews = hasStoredNews ? stored[APP_SHOW_NEWS_KEY] === true : false;
    const storedShowTodo = stored.hasOwnProperty(APP_SHOW_TODO_KEY) ? stored[APP_SHOW_TODO_KEY] !== false : true;

    appNewsSourcePreference = resolveNewsSourceId(stored[APP_NEWS_SOURCE_KEY]);

    const storedWidgetOrder = stored[WIDGET_ORDER_KEY];
    const orderNormalizer = typeof normalizeWidgetOrder === 'function' ? normalizeWidgetOrder : (typeof window !== 'undefined' ? window.normalizeWidgetOrder : null);
    const orderComparator = typeof areWidgetOrdersEqual === 'function' ? areWidgetOrdersEqual : (typeof window !== 'undefined' ? window.areWidgetOrdersEqual : null);
    const normalizedWidgetOrder = orderNormalizer ? orderNormalizer(storedWidgetOrder) : storedWidgetOrder;
    const shouldPersistWidgetOrder = orderComparator ? !orderComparator(storedWidgetOrder, normalizedWidgetOrder) : false;
    setWidgetOrderPreference(normalizedWidgetOrder, { persist: shouldPersistWidgetOrder });

    setWeatherPreference(storedShowWeather, { persist: false, applyVisibility: false, updateUI: false });
    setQuotePreference(storedShowQuote, { persist: false, applyVisibility: false, updateUI: false });
    setNewsPreference(storedShowNews, { persist: !hasStoredNews, applyVisibility: false, updateUI: false });
    setTodoPreference(storedShowTodo, { persist: false, applyVisibility: false, updateUI: false });
    applySidebarVisibility(storedShowSidebar);
    applyWidgetVisibility();

    appMaxTabsPreference = parseInt(stored[APP_MAX_TABS_KEY] || 0, 10);

    appAutoClosePreference = parseInt(stored[APP_AUTOCLOSE_KEY] || 0, 10);

    appSingletonModePreference = stored[APP_SINGLETON_MODE_KEY] === true;

    appSearchOpenNewTabPreference = stored[APP_SEARCH_OPEN_NEW_TAB_KEY] === true;

    appSearchRememberEnginePreference = stored[APP_SEARCH_REMEMBER_ENGINE_KEY] !== false;

    if (stored[APP_SEARCH_DEFAULT_ENGINE_KEY]) {

      appSearchDefaultEnginePreference = stored[APP_SEARCH_DEFAULT_ENGINE_KEY];

    }

    appSearchMathPreference = stored[APP_SEARCH_MATH_KEY] !== false;

    appSearchShowHistoryPreference = stored[APP_SEARCH_SHOW_HISTORY_KEY] === true;

    appSearchSuggestionsPreference = stored[APP_SEARCH_SUGGESTIONS_KEY] !== false;

    appBookmarkOpenNewTabPreference = stored[APP_BOOKMARK_OPEN_NEW_TAB_KEY] === true;

    appBookmarkTextBgPreference = stored[APP_BOOKMARK_TEXT_BG_KEY] === true;

    applyBookmarkTextBg(appBookmarkTextBgPreference);

    appBookmarkTextBgOpacityPreference = parseFloat(stored[APP_BOOKMARK_TEXT_OPACITY_KEY] || 0.65);

    applyBookmarkTextBgOpacity(appBookmarkTextBgOpacityPreference);

    appBookmarkTextBgBlurPreference = parseInt(stored[APP_BOOKMARK_TEXT_BLUR_KEY] || 4, 10);

    applyBookmarkTextBgBlur(appBookmarkTextBgBlurPreference);

    appBookmarkTextBgColorPreference = stored[APP_BOOKMARK_TEXT_BG_COLOR_KEY] || '#2CA5FF';

    applyBookmarkTextBgColor(appBookmarkTextBgColorPreference);

    appBookmarkFallbackColorPreference = stored[APP_BOOKMARK_FALLBACK_COLOR_KEY] || '#00b8d4';

    appBookmarkFolderColorPreference = stored[APP_BOOKMARK_FOLDER_COLOR_KEY] || '#FFFFFF';

    // Load Animation enabled toggle (default false)
    const animEnabled = stored[APP_GRID_ANIMATION_ENABLED_KEY] === true;
    appGridAnimationEnabledPreference = animEnabled;
    if (!appPerformanceModePreference) {
      applyGridAnimationEnabled(animEnabled);
    }

    // Load Animation Speed
    const savedSpeed = stored[APP_GRID_ANIMATION_SPEED_KEY];
    appGridAnimationSpeedPreference = parseFloat(savedSpeed !== undefined ? savedSpeed : 0.3) || 0.3;
    if (!appPerformanceModePreference) {
      applyGridAnimationSpeed(appGridAnimationSpeedPreference);
    }

    const savedBackgroundDim = stored.hasOwnProperty(APP_BACKGROUND_DIM_KEY) ? stored[APP_BACKGROUND_DIM_KEY] : 0;

    appContainerModePreference = stored[APP_CONTAINER_MODE_KEY] !== false;

    appContainerNewTabPreference = stored[APP_CONTAINER_NEW_TAB_KEY] !== false;

    wallpaperQualityPreference = stored[WALLPAPER_QUALITY_KEY] === 'high' ? 'high' : 'low';
    wallpaperTypePreference = stored[WALLPAPER_TYPE_KEY] === 'static' ? 'static' : 'video';
    dailyRotationPreference = stored.hasOwnProperty(DAILY_ROTATION_KEY) ? stored[DAILY_ROTATION_KEY] !== false : true;

    if (wallpaperTypeToggle) {
      wallpaperTypeToggle.checked = wallpaperTypePreference === 'video';
    }

    if (galleryDailyToggle) {
      galleryDailyToggle.checked = dailyRotationPreference;
    }

    applyBookmarkFallbackColor(appBookmarkFallbackColorPreference);

    applyBookmarkFolderColor(appBookmarkFolderColorPreference);

    if (!appPerformanceModePreference) {
      applyPerformanceModeState(appPerformanceModePreference);
    }
    setPerfOverlayEnabled(debugPerfOverlayPreference || isStartupPerfDebugEnabled());
    resetCinemaMode();

    applyBackgroundDim(savedBackgroundDim);
    // Keep preload fast path in sync even if Settings UI is never opened
    try {
      if (window.localStorage) {
        localStorage.setItem('fast-bg-dim', String(appBackgroundDimPreference));
      }
    } catch (err) {
      // Ignore; best-effort mirror only
    }

    if (appDimSlider) {
      appDimSlider.value = appBackgroundDimPreference;
    }

    if (appDimLabel) {
      appDimLabel.textContent = `${appBackgroundDimPreference}%`;
    }

    updateWidgetSettingsUI();



    if (appSingletonModePreference) {

      await handleSingletonMode();

    }



    runWhenIdle(() => manageHomebaseTabs());

  } catch (err) {

    console.warn('Failed to load app settings', err);

  }

}


function syncAppSettingsForm() {

  if (appTimeFormatSelect) {

    appTimeFormatSelect.value = timeFormatPreference;

  }

  if (appDimSlider) {

    appDimSlider.value = appBackgroundDimPreference;

  }

  if (appDimLabel) {

    appDimLabel.textContent = `${appBackgroundDimPreference}%`;

  }

  if (appSidebarToggle) {

    appSidebarToggle.checked = appShowSidebarPreference;

  }

  if (appWeatherToggle) {

    appWeatherToggle.checked = appShowWeatherPreference;

  }

  if (appQuoteToggle) {

    appQuoteToggle.checked = appShowQuotePreference;

  }

  if (appNewsToggle) {

    appNewsToggle.checked = appShowNewsPreference;

  }

  if (appTodoToggle) {

    appTodoToggle.checked = appShowTodoPreference;

    if (!appTodoToggle.dataset.listenerAttached) {

      appTodoToggle.dataset.listenerAttached = 'true';

      appTodoToggle.addEventListener('change', (e) => {

        setTodoPreference(e.target.checked);

      });

    }

  }

  if (appMaxTabsSelect) {

    appMaxTabsSelect.value = appMaxTabsPreference;

  }

  if (appAutoCloseSelect) {

    appAutoCloseSelect.value = appAutoClosePreference;

  }

  if (appSearchOpenNewTabToggle) {

    appSearchOpenNewTabToggle.checked = appSearchOpenNewTabPreference;

  }

  if (appSearchRememberEngineToggle) {

    appSearchRememberEngineToggle.checked = appSearchRememberEnginePreference;

  }

  if (appSearchMathToggle) {

    appSearchMathToggle.checked = appSearchMathPreference;

  }

  if (appSearchHistoryToggle) {

    appSearchHistoryToggle.checked = appSearchShowHistoryPreference;

  }

  if (appSearchSuggestionsToggle) {

    appSearchSuggestionsToggle.checked = appSearchSuggestionsPreference;

  }

  const containerModeToggle = document.getElementById('app-container-mode-toggle');
  const containerSubSettings = document.getElementById('container-sub-settings');
  const containerBehaviorRow = document.getElementById('app-container-behavior-row');

  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');

  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');

  if (containerModeToggle) {

    containerModeToggle.checked = appContainerModePreference;

  }

  if (containerSubSettings) {

    setSubSettingsExpanded(containerSubSettings, appContainerModePreference);

  }

  if (containerBehaviorRow) {

    containerBehaviorRow.style.display = appContainerModePreference ? 'flex' : 'none';

  }

  if (radioKeep && radioClose) {

    if (appContainerNewTabPreference) {

      radioKeep.checked = true;

    } else {

      radioClose.checked = true;

    }

  }

  if (appDailyToggle) {
    appDailyToggle.checked = dailyRotationPreference !== false;
  }

  if (appWallpaperTypeSelect) {
    appWallpaperTypeSelect.value = wallpaperTypePreference === 'static' ? 'static' : 'video';
  }

  if (appWallpaperQualitySelect) {
    appWallpaperQualitySelect.value = wallpaperQualityPreference === 'high' ? 'high' : 'low';
  }

  if (wallpaperTypeToggle) {
    wallpaperTypeToggle.checked = (wallpaperTypePreference || 'video') === 'video';
  }

  if (galleryDailyToggle) {
    galleryDailyToggle.checked = dailyRotationPreference !== false;
  }

  if (wallpaperQualityToggle) {
    wallpaperQualityToggle.checked = wallpaperQualityPreference === 'high';
  }

  const bookmarkNewTabToggle = document.getElementById('app-bookmark-open-new-tab-toggle');

  if (bookmarkNewTabToggle) {

    bookmarkNewTabToggle.checked = appBookmarkOpenNewTabPreference;

  }

  const bookmarkTextBgToggle = document.getElementById('app-bookmark-text-bg-toggle');

  const bookmarkTextBgColorRow = document.getElementById('app-bookmark-text-bg-color-row');

  const bookmarkTextBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');

  const bookmarkTextBgBlurRow = document.getElementById('app-bookmark-text-blur-row');

  if (bookmarkTextBgToggle) {

    bookmarkTextBgToggle.checked = appBookmarkTextBgPreference;

    if (bookmarkTextBgColorRow) {

      bookmarkTextBgColorRow.classList.toggle('hidden', !appBookmarkTextBgPreference);

    }

    if (bookmarkTextBgOpacityRow) {

      bookmarkTextBgOpacityRow.classList.toggle('hidden', !appBookmarkTextBgPreference);

    }

    if (bookmarkTextBgBlurRow) {

      bookmarkTextBgBlurRow.classList.toggle('hidden', !appBookmarkTextBgPreference);

    }

  }

  const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');

  if (textBgColorTrigger) {

    updateColorTrigger(textBgColorTrigger, appBookmarkTextBgColorPreference);

    textBgColorTrigger.dataset.value = appBookmarkTextBgColorPreference;

  }

  const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');

  const textBgOpacityValue = document.getElementById('app-bookmark-text-opacity-value');

  if (textBgOpacitySlider) {

    textBgOpacitySlider.value = appBookmarkTextBgOpacityPreference;

  }

  if (textBgOpacityValue) {

    textBgOpacityValue.textContent = `${Math.round(appBookmarkTextBgOpacityPreference * 100)}%`;

  }

  const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');

  const textBgBlurValue = document.getElementById('app-bookmark-text-blur-value');

  if (textBgBlurSlider) {

    textBgBlurSlider.value = appBookmarkTextBgBlurPreference;

  }

  if (textBgBlurValue) {

    textBgBlurValue.textContent = `${appBookmarkTextBgBlurPreference}px`;

  }

  const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');

  if (colorTrigger) {

    updateColorTrigger(colorTrigger, appBookmarkFallbackColorPreference);

    colorTrigger.dataset.value = appBookmarkFallbackColorPreference;

  }

  const folderColorTrigger = document.getElementById('app-bookmark-folder-color-trigger');

  if (folderColorTrigger) {

    updateColorTrigger(folderColorTrigger, appBookmarkFolderColorPreference);

    folderColorTrigger.dataset.value = appBookmarkFolderColorPreference;

  }

  // Sync Animation Speed slider/label
  const speedSlider = document.getElementById('app-grid-animation-speed-slider');
  const speedLabel = document.getElementById('app-grid-animation-speed-value');
  if (speedSlider) {
    speedSlider.value = appGridAnimationSpeedPreference;
  }
  if (speedLabel) {
    speedLabel.textContent = `${appGridAnimationSpeedPreference}s`;
  }

  // Sync Animation Toggle/Sub-settings UI
  updateGridAnimationSettingsUI();

  const perfToggle = document.getElementById('app-performance-mode-toggle');

  if (perfToggle) {

    perfToggle.checked = appPerformanceModePreference;

    // Toggle visibility of animation settings based on performance mode
    // (CSS also handles this via body.performance-mode selector)
    perfToggle.addEventListener('change', async () => {
      const nextValue = perfToggle.checked;
      syncFastPerformanceModeMirror(nextValue);
      applyPerformanceModeState(nextValue);
      try {
        await browser.storage.local.set({ [APP_PERFORMANCE_MODE_KEY]: nextValue });
      } catch (err) {
        console.warn('Failed to persist performance mode toggle', err);
      }
    });

  }

  const perfDebugToggle = document.getElementById('app-perf-debug-overlay-toggle');

  if (perfDebugToggle) {

    perfDebugToggle.checked = debugPerfOverlayPreference;

    if (!perfDebugToggle.dataset.listenerAttached) {

      perfDebugToggle.dataset.listenerAttached = 'true';

      perfDebugToggle.addEventListener('change', async () => {

        const nextValue = perfDebugToggle.checked;

        setPerfOverlayEnabled(nextValue);

        try {

          await browser.storage.local.set({ [APP_DEBUG_PERF_OVERLAY_KEY]: nextValue });

        } catch (err) {

          console.warn('Failed to persist perf overlay toggle', err);

        }

      });

    }

  }

  const batteryToggle = document.getElementById('app-battery-optimization-toggle');

  if (batteryToggle) {

    batteryToggle.checked = appBatteryOptimizationPreference;

    if (!('getBattery' in navigator)) {

      const row = batteryToggle.closest('.app-setting-row');

      if (row) {

        row.style.display = 'none';

      }

    }

  }

  const cinemaToggle = document.getElementById('app-cinema-mode-toggle');
  if (cinemaToggle) {
    cinemaToggle.checked = appCinemaModePreference;
  }

  updateWidgetSettingsUI();

  updateDefaultEngineVisibilityControl();

  const singletonToggle = document.getElementById('app-singleton-mode-toggle');

  if (singletonToggle) {

    singletonToggle.checked = appSingletonModePreference;

  }

}
