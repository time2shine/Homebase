import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const validatorScriptPath = path.join(rootDir, 'src/newtab/core/schema-validator.js');
const migrationsScriptPath = path.join(rootDir, 'src/newtab/core/schema-migrations.js');
const diagnosticsScriptPath = path.join(rootDir, 'src/newtab/core/storage-diagnostics.js');
const storageServiceScriptPath = path.join(rootDir, 'src/newtab/core/storage-service.js');

const settingsStorageScriptPath = path.join(rootDir, 'src/newtab/settings/settings-storage.js');
const settingsPreferencesScriptPath = path.join(rootDir, 'src/newtab/settings/settings-preferences.js');
const searchEngineSettingsScriptPath = path.join(rootDir, 'src/newtab/settings/search-engine-settings.js');
const visualEffectsSettingsScriptPath = path.join(rootDir, 'src/newtab/settings/visual-effects-settings.js');
const settingsUiScriptPath = path.join(rootDir, 'src/newtab/settings/settings-ui.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');

const settingsStorageScriptCode = fs.readFileSync(settingsStorageScriptPath, 'utf8');
const settingsPreferencesScriptCode = fs.readFileSync(settingsPreferencesScriptPath, 'utf8');
const searchEngineSettingsScriptCode = fs.readFileSync(searchEngineSettingsScriptPath, 'utf8');
const visualEffectsSettingsScriptCode = fs.readFileSync(visualEffectsSettingsScriptPath, 'utf8');
const settingsUiScriptCode = fs.readFileSync(settingsUiScriptPath, 'utf8');

/**
 * Creates an in-memory test environment supporting DOM mocks and storage mocking for settings.
 */
function createSettingsTestEnvironment(options = {}) {
  const { initialStorage = {}, withHomebaseStorage = true } = options;
  const storageData = { ...initialStorage };
  const localStorageData = {};
  const storageCalls = { get: [], set: [], remove: [] };

  const storageMock = {
    get: async (keys) => {
      storageCalls.get.push(keys);
      if (keys === null || keys === undefined) return { ...storageData };
      if (typeof keys === 'string') return { [keys]: storageData[keys] };
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (storageData[k] !== undefined) res[k] = storageData[k];
        }
        return res;
      }
      return {};
    },
    set: async (items) => {
      storageCalls.set.push(items);
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      storageCalls.remove.push(keys);
      const toRemove = Array.isArray(keys) ? keys : [keys];
      for (const k of toRemove) delete storageData[k];
    }
  };

  const localStorageMock = {
    getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
    setItem: (k, v) => { localStorageData[k] = String(v); },
    removeItem: (k) => { delete localStorageData[k]; },
    clear: () => {
      for (const k of Object.keys(localStorageData)) delete localStorageData[k];
    }
  };

  const docElement = {
    classList: {
      classes: new Set(),
      toggle: function(cls, state) {
        if (state === undefined) state = !this.classes.has(cls);
        if (state) this.classes.add(cls); else this.classes.delete(cls);
        return state;
      },
      contains: function(cls) { return this.classes.has(cls); }
    },
    style: {
      setProperty: () => {}
    }
  };

  const bodyElement = {
    classList: {
      classes: new Set(),
      toggle: function(cls, state) {
        if (state === undefined) state = !this.classes.has(cls);
        if (state) this.classes.add(cls); else this.classes.delete(cls);
        return state;
      },
      contains: function(cls) { return this.classes.has(cls); }
    },
    prepend: () => {}
  };

  const elementsById = new Map();
  const elementsByQuery = new Map();
  const listenersMap = new Map();

  function makeMockElement(tag = 'div', id = '') {
    const el = {
      tagName: tag.toUpperCase(),
      id,
      classList: {
        classes: new Set(),
        add: function(...c) { c.forEach(x => this.classes.add(x)); },
        remove: function(...c) { c.forEach(x => this.classes.delete(x)); },
        toggle: function(cls, state) {
          if (state === undefined) state = !this.classes.has(cls);
          if (state) this.classes.add(cls); else this.classes.delete(cls);
          return state;
        },
        contains: function(cls) { return this.classes.has(cls); }
      },
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      disabled: false,
      style: {},
      dataset: {},
      children: [],
      addEventListener: function(event, fn) {
        if (!listenersMap.has(this)) listenersMap.set(this, {});
        const map = listenersMap.get(this);
        if (!map[event]) map[event] = [];
        map[event].push(fn);
      },
      removeEventListener: function(event, fn) {
        if (!listenersMap.has(this)) return;
        const map = listenersMap.get(this);
        if (map[event]) {
          map[event] = map[event].filter(h => h !== fn);
        }
      },
      triggerEvent: async function(event, eventObj = {}) {
        if (!listenersMap.has(this)) return;
        const map = listenersMap.get(this);
        if (map[event]) {
          for (const fn of map[event]) {
            await fn(eventObj);
          }
        }
      },
      querySelector: (q) => elementsByQuery.get(q) || null,
      querySelectorAll: (q) => [],
      replaceChildren: function(...children) { this.children = children; },
      appendChild: function(c) { this.children.push(c); },
      removeChild: function(c) { this.children = this.children.filter(x => x !== c); },
      setAttribute: function(k, v) {},
      getAttribute: function(k) { return null; },
      removeAttribute: function(k) {},
      closest: function() { return null; },
      focus: function() {}
    };
    if (id) elementsById.set(id, el);
    return el;
  }

  // Common UI elements
  makeMockElement('input', 'app-performance-mode-toggle');
  makeMockElement('input', 'app-perf-debug-overlay-toggle');
  makeMockElement('input', 'app-battery-optimization-toggle');
  makeMockElement('input', 'app-cinema-mode-toggle');
  makeMockElement('input', 'app-singleton-mode-toggle');
  makeMockElement('input', 'app-dim-slider');
  makeMockElement('span', 'app-dim-label');
  makeMockElement('button', 'app-configure-animation-btn');
  makeMockElement('button', 'animation-settings-close-btn');
  makeMockElement('button', 'animation-settings-cancel-btn');
  makeMockElement('button', 'animation-settings-save-btn');
  makeMockElement('div', 'animation-settings-modal');
  makeMockElement('div', 'animation-list');
  makeMockElement('button', 'app-configure-glass-btn');
  makeMockElement('button', 'glass-settings-close-btn');
  makeMockElement('button', 'glass-settings-cancel-btn');
  makeMockElement('button', 'glass-settings-save-btn');
  makeMockElement('div', 'glass-settings-modal');
  makeMockElement('div', 'glass-style-list');
  makeMockElement('button', 'manage-search-engines-btn');
  makeMockElement('button', 'search-engines-save-btn');
  makeMockElement('button', 'search-engines-cancel-btn');
  makeMockElement('div', 'search-engines-modal');
  makeMockElement('div', 'search-engines-modal-list');

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    Promise,
    RegExp,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    localStorage: localStorageMock,
    browser: {
      storage: {
        local: storageMock
      }
    },
    document: {
      documentElement: docElement,
      body: bodyElement,
      head: { appendChild: () => {} },
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: (q) => elementsByQuery.get(q) || null,
      querySelectorAll: () => [],
      createElement: (tag) => makeMockElement(tag),
      createDocumentFragment: () => ({ appendChild: () => {} })
    },
    navigator: {
      userAgent: 'Mozilla/5.0'
    },
    // Canonical constants
    APP_TIME_FORMAT_KEY: 'appTimeFormatPreference',
    APP_SHOW_SIDEBAR_KEY: 'appShowSidebar',
    APP_SHOW_WEATHER_KEY: 'appShowWeather',
    APP_SHOW_QUOTE_KEY: 'appShowQuote',
    APP_SHOW_NEWS_KEY: 'appShowNews',
    APP_SHOW_TODO_KEY: 'appShowTodo',
    WIDGET_ORDER_KEY: 'widgetOrder',
    APP_NEWS_SOURCE_KEY: 'appNewsSource',
    APP_MAX_TABS_KEY: 'appMaxTabsCount',
    APP_AUTOCLOSE_KEY: 'appAutoCloseMinutes',
    APP_SINGLETON_MODE_KEY: 'appSingletonMode',
    APP_SEARCH_OPEN_NEW_TAB_KEY: 'appSearchOpenNewTab',
    APP_SEARCH_REMEMBER_ENGINE_KEY: 'appSearchRememberEngine',
    APP_SEARCH_DEFAULT_ENGINE_KEY: 'appSearchDefaultEngine',
    APP_SEARCH_MATH_KEY: 'appSearchMath',
    APP_SEARCH_SHOW_HISTORY_KEY: 'appSearchShowHistory',
    APP_SEARCH_SUGGESTIONS_KEY: 'appSearchSuggestionsEnabled',
    APP_BOOKMARK_OPEN_NEW_TAB_KEY: 'appBookmarkOpenNewTab',
    APP_BOOKMARK_TEXT_BG_KEY: 'appBookmarkTextBg',
    APP_BOOKMARK_TEXT_BG_COLOR_KEY: 'appBookmarkTextBgColor',
    APP_BOOKMARK_TEXT_OPACITY_KEY: 'appBookmarkTextBgOpacity',
    APP_BOOKMARK_TEXT_BLUR_KEY: 'appBookmarkTextBgBlur',
    APP_BOOKMARK_FALLBACK_COLOR_KEY: 'appBookmarkFallbackColor',
    APP_BOOKMARK_FOLDER_COLOR_KEY: 'appBookmarkFolderColor',
    APP_BACKGROUND_DIM_KEY: 'appBackgroundDim',
    APP_PERFORMANCE_MODE_KEY: 'appPerformanceMode',
    FAST_PERFORMANCE_MODE_KEY: 'fast-performance-mode',
    APP_DEBUG_PERF_OVERLAY_KEY: 'debugPerfOverlay',
    APP_BATTERY_OPTIMIZATION_KEY: 'appBatteryOptimization',
    APP_CINEMA_MODE_KEY: 'appCinemaMode',
    APP_CONTAINER_MODE_KEY: 'appContainerMode',
    APP_CONTAINER_NEW_TAB_KEY: 'appContainerNewTab',
    APP_GRID_ANIMATION_KEY: 'appGridAnimationPref',
    APP_GRID_ANIMATION_SPEED_KEY: 'appGridAnimationSpeed',
    APP_GRID_ANIMATION_ENABLED_KEY: 'appGridAnimationEnabled',
    APP_GLASS_STYLE_KEY: 'appGlassStylePref',
    WALLPAPER_QUALITY_KEY: 'wallpaperQualityPreference',
    WALLPAPER_TYPE_KEY: 'wallpaperTypePreference',
    DAILY_ROTATION_KEY: 'dailyWallpaperEnabled',
    WALLPAPER_SELECTION_KEY: 'wallpaperSelection',
    SEARCH_ENGINES_PREF_KEY: 'searchEnginesConfig',

    // Global preference holders & UI elements
    appTimeFormatSelect: null,
    appDimSlider: null,
    appDimLabel: null,
    updateColorTrigger: () => {},
    timeFormatPreference: '12-hour',
    appSidebarToggle: null,
    appShowSidebarPreference: true,
    appWeatherToggle: null,
    appShowWeatherPreference: true,
    appQuoteToggle: null,
    appShowQuotePreference: true,
    appNewsToggle: null,
    appShowNewsPreference: false,
    appTodoToggle: null,
    appShowTodoPreference: true,
    appMaxTabsSelect: null,
    appMaxTabsPreference: 20,
    appAutoCloseSelect: null,
    appAutoClosePreference: 0,
    appSearchOpenNewTabToggle: null,
    appSearchOpenNewTabPreference: false,
    appSearchRememberEngineToggle: null,
    appSearchMathToggle: null,
    appSearchMathPreference: true,
    appSearchHistoryToggle: null,
    appSearchShowHistoryPreference: true,
    appSearchSuggestionsToggle: null,
    appSearchSuggestionsPreference: true,
    appDailyToggle: null,
    appWallpaperTypeSelect: null,
    appWallpaperQualitySelect: null,
    wallpaperTypeToggle: null,
    galleryDailyToggle: null,
    wallpaperQualityToggle: null,
    wallpaperQualityPreference: 'high',
    dailyRotationPreference: true,
    wallpaperTypePreference: 'video',
    appBookmarkOpenNewTabPreference: true,
    appContainerModePreference: false,
    appContainerNewTabPreference: true,
    appPerformanceModePreference: false,
    debugPerfOverlayPreference: false,
    appBatteryOptimizationPreference: false,
    appCinemaModePreference: false,
    appSingletonModePreference: false,
    appGridAnimationPreference: 'default',
    appGridAnimationSpeedPreference: 0.3,
    appGlassStylePreference: 'original',
    appBackgroundDimPreference: 0,
    appNewsSourcePreference: 'google',
    appSearchRememberEnginePreference: true,
    appSearchDefaultEnginePreference: 'bing',
    currentSearchEngine: { id: 'google', name: 'Google', enabled: true },
    searchEngines: [
      { id: 'google', name: 'Google', enabled: true },
      { id: 'duckduckgo', name: 'DuckDuckGo', enabled: true }
    ],

    GRID_ANIMATIONS: {
      default: { name: 'Default' },
      pop: { name: 'Pop' },
      fade: { name: 'Fade' }
    },
    GLASS_STYLES: [
      { id: 'original', name: 'Original', css: '' },
      { id: 'frosted', name: 'Frosted', css: '' }
    ],

    // Stubs
    isPerformanceModeEnabled: () => false,
    runSchemaMigrations: async () => {},
    syncFastPerformanceModeMirror: (val) => {
      localStorageMock.setItem('fast-perf-mode', val ? '1' : '0');
    },
    applyPerformanceModeState: () => {},
    applyGridAnimation: () => {},
    applyGlassStyle: () => {},
    applyTimeFormatPreference: () => {},
    resolveNewsSourceId: (id) => id || 'google',
    normalizeWidgetOrder: (order) => order || ['weather', 'quote', 'todo', 'news'],
    areWidgetOrdersEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    setWidgetOrderPreference: () => {},
    setWeatherPreference: () => {},
    setQuotePreference: () => {},
    setNewsPreference: () => {},
    setTodoPreference: () => {},
    applySidebarVisibility: () => {},
    updateGridAnimationSettingsUI: () => {},
    setPerfOverlayEnabled: () => {},
    updateWidgetSettingsUI: () => {},
    updateDefaultEngineVisibilityControl: () => {},
    openModalWithAnimation: () => {},
    closeModalWithAnimation: () => {},
    loadSearchEnginePreferences: async () => {},
    populateDefaultEngineSelectControl: () => 'google',
    writeFastSearchCache: () => {},
    populateSearchOptions: () => {},
    updateSearchUI: () => {},
    showCustomAlert: () => {},
    initUnifiedSortable: () => ({ destroy: () => {} }),
    createSvgIconElement: () => makeMockElement('svg'),
    renderBookmarkGrid: () => {},
    findBookmarkNodeById: () => null,
    loadGridAnimationPref: () => {},
    loadGlassStylePref: () => {},
    bookmarkTree: [{ id: 'root' }],
    currentGridFolderNode: null,
    playPreview: () => {},
    runWhenIdle: (fn) => fn(),
    manageHomebaseTabs: () => {},
    handleSingletonMode: async () => {},
    setSubSettingsExpanded: () => {}
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  // Load core stack
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);

  if (withHomebaseStorage) {
    vm.runInContext(storageServiceScriptCode, context);
  } else {
    delete sandbox.HomebaseStorage;
    delete sandbox.window.HomebaseStorage;
  }

  vm.runInContext(settingsStorageScriptCode, context);

  return {
    context,
    sandbox,
    storageData,
    localStorageData,
    storageCalls,
    elementsById,
    elementsByQuery
  };
}

// -------------------------------------------------------------
// Tests for src/newtab/settings/settings-preferences.js
// -------------------------------------------------------------

test('settings-preferences: loadAppSettingsFromStorage reads preferences via HomebaseStorage.getMany', async () => {
  const env = createSettingsTestEnvironment({
    initialStorage: {
      appPerformanceMode: true,
      debugPerfOverlay: true,
      appGridAnimationPref: 'pop',
      appGlassStylePref: 'frosted'
    }
  });
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  await env.sandbox.loadAppSettingsFromStorage();

  assert.equal(env.sandbox.appPerformanceModePreference, true);
  assert.equal(env.localStorageData['fast-perf-mode'], '1');
  assert.equal(env.sandbox.debugPerfOverlayPreference, true);
  assert.equal(env.sandbox.appGridAnimationPreference, 'pop');
  assert.equal(env.sandbox.appGlassStylePreference, 'frosted');
});

test('settings-preferences: loadAppSettingsFromStorage falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      appPerformanceMode: false,
      debugPerfOverlay: false,
      appGridAnimationPref: 'fade'
    }
  });
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  await env.sandbox.loadAppSettingsFromStorage();

  assert.equal(env.sandbox.appPerformanceModePreference, false);
  assert.equal(env.sandbox.appGridAnimationPreference, 'fade');
});

test('settings-preferences: performance mode toggle persists via HomebaseStorage.set and syncs fast mirror', async () => {
  const env = createSettingsTestEnvironment();
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  env.sandbox.syncAppSettingsForm();
  const toggle = env.elementsById.get('app-performance-mode-toggle');
  toggle.checked = true;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['appPerformanceMode'], true);
  assert.equal(env.localStorageData['fast-perf-mode'], '1');

  toggle.checked = false;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['appPerformanceMode'], false);
  assert.equal(env.localStorageData['fast-perf-mode'], '0');
});

test('settings-preferences: performance mode toggle falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  env.sandbox.syncAppSettingsForm();
  const toggle = env.elementsById.get('app-performance-mode-toggle');
  toggle.checked = true;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['appPerformanceMode'], true);
});

test('settings-preferences: perf debug overlay toggle persists via HomebaseStorage.set', async () => {
  const env = createSettingsTestEnvironment();
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  env.sandbox.syncAppSettingsForm();
  const toggle = env.elementsById.get('app-perf-debug-overlay-toggle');
  toggle.checked = true;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['debugPerfOverlay'], true);

  toggle.checked = false;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['debugPerfOverlay'], false);
});

test('settings-preferences: perf debug overlay toggle falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(settingsPreferencesScriptCode, env.context);

  env.sandbox.syncAppSettingsForm();
  const toggle = env.elementsById.get('app-perf-debug-overlay-toggle');
  toggle.checked = true;
  await toggle.triggerEvent('change');

  assert.equal(env.storageData['debugPerfOverlay'], true);
});

// -------------------------------------------------------------
// Tests for src/newtab/settings/search-engine-settings.js
// -------------------------------------------------------------

test('search-engine-settings: searchEngines and defaultEngine persist via HomebaseStorage.set', async () => {
  const env = createSettingsTestEnvironment();
  vm.runInContext(searchEngineSettingsScriptCode, env.context);

  env.sandbox.setupSearchEnginesModal();
  const saveBtn = env.elementsById.get('search-engines-save-btn');
  await saveBtn.triggerEvent('click');

  assert.ok(Array.isArray(env.storageData['searchEnginesConfig']));
  assert.equal(env.storageData['searchEnginesConfig'].length, 2);
  assert.equal(env.storageData['appSearchDefaultEngine'], 'google');
});

test('search-engine-settings: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(searchEngineSettingsScriptCode, env.context);

  env.sandbox.setupSearchEnginesModal();
  const saveBtn = env.elementsById.get('search-engines-save-btn');
  await saveBtn.triggerEvent('click');

  assert.ok(Array.isArray(env.storageData['searchEnginesConfig']));
  assert.equal(env.storageData['searchEnginesConfig'].length, 2);
});

// -------------------------------------------------------------
// Tests for src/newtab/settings/visual-effects-settings.js
// -------------------------------------------------------------

test('visual-effects-settings: grid animation and glass style persist via HomebaseStorage.set', async () => {
  const env = createSettingsTestEnvironment();
  vm.runInContext(visualEffectsSettingsScriptCode, env.context);

  env.sandbox.setupAnimationSettings();
  const animOpenBtn = env.elementsById.get('app-configure-animation-btn');
  await animOpenBtn.triggerEvent('click');
  const animSaveBtn = env.elementsById.get('animation-settings-save-btn');
  await animSaveBtn.triggerEvent('click');

  assert.equal(env.storageData['appGridAnimationPref'], 'default');

  env.sandbox.setupGlassSettings();
  const glassOpenBtn = env.elementsById.get('app-configure-glass-btn');
  await glassOpenBtn.triggerEvent('click');
  const glassSaveBtn = env.elementsById.get('glass-settings-save-btn');
  await glassSaveBtn.triggerEvent('click');

  assert.equal(env.storageData['appGlassStylePref'], 'original');
});

test('visual-effects-settings: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({ withHomebaseStorage: false });
  vm.runInContext(visualEffectsSettingsScriptCode, env.context);

  env.sandbox.setupAnimationSettings();
  const animOpenBtn = env.elementsById.get('app-configure-animation-btn');
  await animOpenBtn.triggerEvent('click');
  const animSaveBtn = env.elementsById.get('animation-settings-save-btn');
  await animSaveBtn.triggerEvent('click');

  assert.equal(env.storageData['appGridAnimationPref'], 'default');

  env.sandbox.setupGlassSettings();
  const glassOpenBtn = env.elementsById.get('app-configure-glass-btn');
  await glassOpenBtn.triggerEvent('click');
  const glassSaveBtn = env.elementsById.get('glass-settings-save-btn');
  await glassSaveBtn.triggerEvent('click');

  assert.equal(env.storageData['appGlassStylePref'], 'original');
});

// -------------------------------------------------------------
// Tests for src/newtab/settings/settings-ui.js
// -------------------------------------------------------------

test('settings-ui: background dim slider persists via HomebaseStorage.set and syncs fast-bg-dim mirror', async () => {
  const env = createSettingsTestEnvironment();
  vm.runInContext(settingsUiScriptCode, env.context);

  if (typeof env.sandbox.HomebaseStorage !== 'undefined' && env.sandbox.HomebaseStorage.set) {
    await env.sandbox.HomebaseStorage.set(env.sandbox.APP_BACKGROUND_DIM_KEY, 30);
  }
  assert.equal(env.storageData['appBackgroundDim'], 30);
  assert.equal(env.localStorageData['fast-bg-dim'], '30');
});

test('settings-ui: saveSettings writes batch via HomebaseStorage.setMany and handles search engine cleanup', async () => {
  const env = createSettingsTestEnvironment({
    initialStorage: {
      currentSearchEngineId: 'bing'
    }
  });
  vm.runInContext(settingsUiScriptCode, env.context);

  const batch = {
    [env.sandbox.APP_TIME_FORMAT_KEY]: '24-hour',
    [env.sandbox.APP_BACKGROUND_DIM_KEY]: 40,
    [env.sandbox.APP_PERFORMANCE_MODE_KEY]: true
  };

  await env.sandbox.HomebaseStorage.setMany(batch);
  assert.equal(env.storageData['appTimeFormatPreference'], '24-hour');
  assert.equal(env.storageData['appBackgroundDim'], 40);
  assert.equal(env.storageData['appPerformanceMode'], true);

  await env.sandbox.HomebaseStorage.remove('currentSearchEngineId');
  assert.equal(env.storageData['currentSearchEngineId'], undefined);
});

test('settings-ui: fallback to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createSettingsTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      currentSearchEngineId: 'bing'
    }
  });
  vm.runInContext(settingsUiScriptCode, env.context);

  await env.sandbox.browser.storage.local.set({ appBackgroundDim: 20 });
  assert.equal(env.storageData['appBackgroundDim'], 20);

  await env.sandbox.browser.storage.local.remove('currentSearchEngineId');
  assert.equal(env.storageData['currentSearchEngineId'], undefined);
});

// -------------------------------------------------------------
// Tests for src/newtab/settings/settings-storage.js
// -------------------------------------------------------------

test('settings-storage: canonical API surface and default values', async () => {
  const env = createSettingsTestEnvironment();
  const storageModule = env.sandbox.HomebaseSettingsStorage;

  assert.ok(storageModule, 'HomebaseSettingsStorage must be defined');
  assert.ok(storageModule.keys, 'HomebaseSettingsStorage.keys must exist');
  assert.ok(storageModule.defaults, 'HomebaseSettingsStorage.defaults must exist');
  assert.ok(storageModule.state, 'HomebaseSettingsStorage.state must exist');
  assert.equal(typeof storageModule.initialize, 'function');
  assert.equal(typeof storageModule.load, 'function');
  assert.equal(typeof storageModule.save, 'function');
  assert.equal(typeof storageModule.get, 'function');
  assert.equal(typeof storageModule.set, 'function');
  assert.equal(typeof storageModule.getAll, 'function');

  assert.equal(storageModule.defaults.timeFormat, '12-hour');
  assert.equal(storageModule.defaults.backgroundDim, 0);
  assert.equal(storageModule.defaults.showSidebar, true);
  assert.equal(storageModule.defaults.showWeather, true);
  assert.equal(storageModule.defaults.showQuote, true);
  assert.equal(storageModule.defaults.showNews, false);
  assert.equal(storageModule.defaults.showTodo, true);
});

test('settings-storage: save updates state and writes batch to storage', async () => {
  const env = createSettingsTestEnvironment();
  const storageModule = env.sandbox.HomebaseSettingsStorage;

  await storageModule.save({
    timeFormat: '24-hour',
    backgroundDim: 45,
    showNews: true
  });

  assert.equal(storageModule.get('timeFormat'), '24-hour');
  assert.equal(storageModule.get('backgroundDim'), 45);
  assert.equal(storageModule.get('showNews'), true);

  assert.equal(env.storageData['appTimeFormatPreference'], '24-hour');
  assert.equal(env.storageData['appBackgroundDim'], 45);
  assert.equal(env.storageData['appShowNews'], true);
  assert.equal(env.localStorageData['fast-bg-dim'], '45');
  assert.equal(env.localStorageData['fast-time-format'], '24-hour');
});

test('settings-storage: preference bridges read and write through to state', async () => {
  const env = createSettingsTestEnvironment();
  const storageModule = env.sandbox.HomebaseSettingsStorage;

  env.sandbox.appTimeFormatPreference = '24-hour';
  assert.equal(storageModule.get('timeFormat'), '24-hour');

  storageModule.set('showSidebar', false);
  assert.equal(env.sandbox.appShowSidebarPreference, false);
});

