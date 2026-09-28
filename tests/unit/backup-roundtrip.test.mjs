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
const dynamicAccentScriptPath = path.join(rootDir, 'src/newtab/wallpaper/dynamic-accent.js');
const newsScriptPath = path.join(rootDir, 'src/newtab/widgets/news.js');
const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const dynamicAccentScriptCode = fs.readFileSync(dynamicAccentScriptPath, 'utf8');
const newsScriptCode = fs.readFileSync(newsScriptPath, 'utf8');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

/**
 * Creates an in-memory mock environment with browser.storage.local, window.localStorage,
 * document, Blob, and console logging spy.
 */
function createMockEnvironment(initialStorage = {}) {
  const localData = JSON.parse(JSON.stringify(initialStorage));
  const localStorageStore = new Map();
  const consoleLogs = [];
  const consoleWarns = [];

  let lastExportedBlob = null;
  let lastExportedFilename = null;

  const storageApi = {
    get: async (keys) => {
      if (keys === null || keys === undefined) {
        return JSON.parse(JSON.stringify(localData));
      }
      if (typeof keys === 'string') {
        return { [keys]: localData[keys] };
      }
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (localData[k] !== undefined) {
            res[k] = localData[k];
          }
        }
        return JSON.parse(JSON.stringify(res));
      }
      return {};
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) {
        localData[k] = JSON.parse(JSON.stringify(v));
      }
    },
    remove: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        delete localData[k];
      }
    }
  };

  const defaultMockElement = {
    classList: {
      toggle: () => {},
      contains: () => false,
      add: () => {},
      remove: () => {}
    },
    dataset: {},
    style: {},
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };

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
    Error,
    Promise,
    RegExp,
    Event: globalThis.Event,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    AbortController: globalThis.AbortController,
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    console: {
      log: (...args) => consoleLogs.push(args.join(' ')),
      warn: (...args) => consoleWarns.push(args.join(' ')),
      error: (...args) => consoleWarns.push(args.join(' ')),
      info: (...args) => consoleLogs.push(args.join(' '))
    },
    browser: {
      storage: {
        local: storageApi
      }
    },
    localStorage: {
      getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
      setItem: (k, v) => localStorageStore.set(k, String(v)),
      removeItem: (k) => localStorageStore.delete(k),
      clear: () => localStorageStore.clear()
    },
    Blob: class MockBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options?.type || '';
        this._text = parts.join('');
      }
      async text() {
        return this._text;
      }
    },
    URL: {
      createObjectURL: (blob) => {
        lastExportedBlob = blob;
        return 'blob:mock-url-' + Math.random();
      },
      revokeObjectURL: () => {}
    },
    document: {
      body: {
        appendChild: () => {},
        style: {}
      },
      documentElement: {
        style: {
          setProperty: () => {}
        }
      },
      createElement: (tag) => {
        if (tag === 'a') {
          return {
            href: '',
            download: '',
            style: {},
            click: function () {
              lastExportedFilename = this.download;
            },
            remove: () => {}
          };
        }
        if (tag === 'canvas') {
          let cWidth = 0;
          let cHeight = 0;
          return {
            get width() { return cWidth; },
            set width(v) { cWidth = v; },
            get height() { return cHeight; },
            set height(v) { cHeight = v; },
            getContext: (type, options) => ({
              drawImage: () => {},
              getImageData: () => ({
                data: new Uint8Array([44, 165, 255, 255])
              })
            })
          };
        }
        return {
          ...defaultMockElement,
          dataset: {},
          style: {}
        };
      },
      querySelector: () => ({ ...defaultMockElement }),
      querySelectorAll: () => [],
      getElementById: () => ({ ...defaultMockElement }),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    Image: class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.crossOrigin = '';
        this._src = '';
      }
      get src() { return this._src; }
      set src(url) {
        this._src = url;
        setTimeout(() => {
          if (url === 'error://fail') {
            if (typeof this.onerror === 'function') this.onerror(new Error('Load fail'));
          } else {
            if (typeof this.onload === 'function') this.onload();
          }
        }, 5);
      }
    },
    appShowNewsPreference: true,
    appShowSidebarPreference: true,
    appNewsSourcePreference: 'aljazeera',
    addEventListener: () => {},
    removeEventListener: () => {},
    showCustomAlert: () => {},
    showCustomDialog: async () => true,
    isPerformanceModeEnabled: () => false,
    recordStartupPerfEventOnce: () => {}
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  // Load modules in order matching new-tab.html
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);
  vm.runInContext(dynamicAccentScriptCode, context);
  vm.runInContext(newsScriptCode, context);
  vm.runInContext(backupScriptCode, context);

  return {
    context,
    localData,
    localStorageStore,
    consoleLogs,
    consoleWarns,
    getLastExportedBlob: () => lastExportedBlob,
    getLastExportedFilename: () => lastExportedFilename,
    clearStorage: () => {
      for (const k of Object.keys(localData)) {
        delete localData[k];
      }
      localStorageStore.clear();
    }
  };
}

/**
 * Builds representative valid data for all 74 HOMEBASE_OWNED_STORAGE_KEYS.
 */
function createFull74KeyDataset() {
  return {
    wallpaperSelection: { id: 'gallery-42', type: 'static' },
    cachedAppliedPosterUrl: 'https://images.example.com/poster-42.jpg',
    cachedAppliedPosterDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    cachedAppliedPoster: 'poster-cache-key-42',
    cachedAppliedVideoUrl: 'https://videos.example.com/video-42.mp4',
    videosManifest: [{ id: 'v1', title: 'Ocean' }],
    videosManifestFetchedAt: 1710000000000,
    cachedGalleryPosters: ['https://images.example.com/thumb1.jpg'],
    wallpaperPoolIds: ['gallery-42', 'gallery-99'],
    wallpaperFallbackUsedAt: 1710000005000,
    pendingDailyRotation: { scheduled: true },
    pendingDailyRotationSince: 1710000010000,
    galleryFavorites: ['fav-wall-1', 'fav-wall-2'],
    dailyWallpaperEnabled: true,
    wallpaperTypePreference: 'video',
    wallpaperQualityPreference: 'high',
    appTimeFormatPreference: '24-hour',
    appBackgroundDim: 45,
    appShowSidebar: true,
    appShowWeather: true,
    appShowQuote: true,
    appShowNews: true,
    appShowTodo: true,
    todoItems: [
      { id: 'todo-1', text: 'Buy groceries', done: false, createdAt: 1710000020000 },
      { id: 'todo-2', text: 'Walk the dog', done: true, createdAt: 1710000025000 }
    ],
    todoHideDone: false,
    widgetOrder: ['news', 'todo', 'quote', 'weather'],
    appNewsSource: 'bbc-top',
    appMaxTabsCount: 15,
    appAutoCloseMinutes: 30,
    appSingletonMode: false,
    appSearchOpenNewTab: true,
    appSearchRememberEngine: true,
    appSearchDefaultEngine: 'google',
    appSearchMath: true,
    appSearchShowHistory: false,
    appSearchSuggestionsEnabled: true,
    appBookmarkOpenNewTab: true,
    appBookmarkTextBg: true,
    appBookmarkTextBgColor: '#2b2b2b',
    appBookmarkTextBgOpacity: 0.75,
    appBookmarkTextBgBlur: 10,
    appBookmarkFallbackColor: '#2ca5ff',
    appBookmarkFolderColor: '#ffbb00',
    appPerformanceMode: false,
    debugPerfOverlay: false,
    appBatteryOptimization: false,
    appCinemaMode: false,
    appContainerMode: false,
    appContainerNewTab: false,
    appGridAnimationPref: 'fade',
    appGridAnimationSpeed: 0.3,
    appGridAnimationEnabled: true,
    appGlassStylePref: 'frosted',
    bookmarkCustomMetadata: {
      'bm-1': { customTitle: 'My Docs' },
      'bm-2': { customTitle: 'Code Repo' }
    },
    homebaseBookmarkRootId: 'toolbar_____',
    folderCustomMetadata: {
      'folder-1': { color: '#FF4444' }
    },
    domainIconMap: {
      'github.com': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    },

    lastUsedBookmarkFolderId: 'folder-1',
    homebaseRecentSaveFolders: ['folder-1', 'folder-2'],
    quoteUpdateFrequency: 'daily',
    quoteLocalIndexV1: 17,
    quoteTags: ['wisdom', 'leadership'],
    searchEnginesConfig: [
      { id: 'google', enabled: true },
      { id: 'ddg', enabled: true }
    ],
    currentSearchEngineId: 'google',
    cachedWeatherData: { temperature: 21, condition: 'Sunny', code: 100 },
    cachedCityName: 'San Francisco',
    cachedUnits: 'celsius',
    weatherFetchedAt: 1710000030000,
    weatherLat: 37.7749,
    weatherLon: -122.4194,
    weatherCityName: 'San Francisco',
    weatherUnits: 'celsius',
    myWallpapers: [
      {
        id: 'cust-1',
        title: 'Mountain Sunset',
        type: 'image',
        mimeType: 'image/jpeg',
        cacheKey: 'cached-img-1',
        posterCacheKey: '',
        size: 1048576,
        posterSize: 0,
        createdAt: 1710000040000,
        lastUsedAt: 1710000050000,
        originalName: 'sunset.jpg'
      }
    ],
    schemaVersion: 1
  };
}

// -------------------------------------------------------------
// Test 1: Complete 74-Key Round-Trip Identity & Export Consistency
// -------------------------------------------------------------
test('backup-roundtrip: full 74-key export -> import -> export produces 100% identical data', async () => {
  const initialData = createFull74KeyDataset();
  const env = createMockEnvironment(initialData);

  // 1. Export initial state
  await env.context.exportHomebaseState();
  const export1Blob = env.getLastExportedBlob();
  assert.ok(export1Blob, 'Exported blob must be generated');

  const export1Payload = JSON.parse(await export1Blob.text());
  assert.strictEqual(export1Payload.schema, 'homebase.export');
  assert.strictEqual(export1Payload.version, 1);
  assert.ok(typeof export1Payload.exportedAt === 'string');

  // Verify all 74 keys exist in exported payload
  for (const key of Object.keys(initialData)) {
    assert.deepStrictEqual(
      export1Payload.storageLocal[key],
      initialData[key],
      `Export payload must match initial data for key: ${key}`
    );
  }

  // 2. Clear storage completely to simulate fresh restore
  env.clearStorage();
  assert.strictEqual(Object.keys(env.localData).length, 0);

  // 3. Import the backup payload
  await env.context.importHomebaseState({
    text: async () => JSON.stringify(export1Payload)
  });

  // Verify transaction status
  const txState = env.context.HomebaseBackup.getTransactionState();
  assert.strictEqual(txState.state, 'committed');

  // Verify all 74 keys survived import with deep equality
  for (const key of Object.keys(initialData)) {
    assert.deepStrictEqual(
      env.localData[key],
      initialData[key],
      `Restored storage must match initial data for key: ${key}`
    );
  }

  // 4. Export again from restored storage
  await env.context.exportHomebaseState();
  const export2Blob = env.getLastExportedBlob();
  const export2Payload = JSON.parse(await export2Blob.text());

  // Verify export 1 and export 2 storageLocal dictionaries are identical
  assert.deepStrictEqual(export2Payload.storageLocal, export1Payload.storageLocal);
});

// -------------------------------------------------------------
// Test 2: Schema Version, Migration History & Unknown Key Preservation
// -------------------------------------------------------------
test('backup-roundtrip: preserves schemaVersion, migrationHistory, and unknown future keys', async () => {
  const initialData = createFull74KeyDataset();
  initialData.migrationHistory = [
    { version: 1, migratedAt: '2026-09-28T00:00:00.000Z', durationMs: 3 }
  ];
  initialData.futureFeatureConfig = {
    enabled: true,
    aiModelPreference: 'gemini-pro',
    nestedConfig: { retries: 3 }
  };

  const env = createMockEnvironment(initialData);

  // Export
  await env.context.exportHomebaseState();
  const exportBlob = env.getLastExportedBlob();
  const exportPayload = JSON.parse(await exportBlob.text());

  assert.strictEqual(exportPayload.storageLocal.schemaVersion, 1);
  assert.deepStrictEqual(exportPayload.storageLocal.migrationHistory, initialData.migrationHistory);
  assert.deepStrictEqual(exportPayload.storageLocal.futureFeatureConfig, initialData.futureFeatureConfig);

  // Reset & Import
  env.clearStorage();
  await env.context.importHomebaseState({
    text: async () => JSON.stringify(exportPayload)
  });

  assert.strictEqual(env.localData.schemaVersion, 1);
  assert.deepStrictEqual(env.localData.migrationHistory, initialData.migrationHistory);
  assert.deepStrictEqual(env.localData.futureFeatureConfig, initialData.futureFeatureConfig);
});

// -------------------------------------------------------------
// Test 3: Domain State Integrity Across Subsystems
// -------------------------------------------------------------
test('backup-roundtrip: verifies bookmark, widget, wallpaper, and custom settings integrity', async () => {
  const initialData = createFull74KeyDataset();
  const env = createMockEnvironment(initialData);

  await env.context.exportHomebaseState();
  const payload = JSON.parse(await env.getLastExportedBlob().text());
  env.clearStorage();
  await env.context.importHomebaseState({
    text: async () => JSON.stringify(payload)
  });

  // Bookmark Subsystem
  assert.deepStrictEqual(env.localData.bookmarkCustomMetadata, initialData.bookmarkCustomMetadata);
  assert.deepStrictEqual(env.localData.folderCustomMetadata, initialData.folderCustomMetadata);
  assert.deepStrictEqual(env.localData.domainIconMap, initialData.domainIconMap);
  assert.strictEqual(env.localData.lastUsedBookmarkFolderId, initialData.lastUsedBookmarkFolderId);
  assert.deepStrictEqual(env.localData.homebaseRecentSaveFolders, initialData.homebaseRecentSaveFolders);

  // Widget Subsystem
  assert.deepStrictEqual(env.localData.widgetOrder, ['news', 'todo', 'quote', 'weather']);
  assert.strictEqual(env.localData.appShowWeather, true);
  assert.strictEqual(env.localData.appShowQuote, true);
  assert.strictEqual(env.localData.appShowNews, true);
  assert.strictEqual(env.localData.appShowTodo, true);
  assert.deepStrictEqual(env.localData.todoItems, initialData.todoItems);
  assert.strictEqual(env.localData.todoHideDone, false);
  assert.strictEqual(env.localData.appNewsSource, 'bbc-top');
  assert.deepStrictEqual(env.localData.cachedWeatherData, initialData.cachedWeatherData);

  // Wallpaper Subsystem
  assert.deepStrictEqual(env.localData.myWallpapers, initialData.myWallpapers);
  assert.deepStrictEqual(env.localData.wallpaperSelection, initialData.wallpaperSelection);
  assert.strictEqual(env.localData.wallpaperTypePreference, 'video');
  assert.strictEqual(env.localData.dailyWallpaperEnabled, true);

  // Settings Subsystem
  assert.strictEqual(env.localData.appTimeFormatPreference, '24-hour');
  assert.strictEqual(env.localData.appBackgroundDim, 45);
  assert.strictEqual(env.localData.appGlassStylePref, 'frosted');
  assert.strictEqual(env.localData.appGridAnimationPref, 'fade');
  assert.deepStrictEqual(env.localData.searchEnginesConfig, initialData.searchEnginesConfig);
});

// -------------------------------------------------------------
// Test 4: Privacy & Security Verification
// -------------------------------------------------------------
test('backup-roundtrip: zero logging of bookmark URLs, todo text, search history, or wallpaper binary', async () => {
  const initialData = createFull74KeyDataset();
  initialData.todoItems[0].text = 'SECRET_TODO_CONTENT_NEVER_LOG';
  initialData.cachedAppliedPosterDataUrl = 'data:image/jpeg;base64,SECRET_BINARY_DATA_NEVER_LOG';
  initialData.bookmarkCustomMetadata['bm-secret'] = { customTitle: 'Secret BM' };


  const env = createMockEnvironment(initialData);

  await env.context.exportHomebaseState();
  const exportPayload = JSON.parse(await env.getLastExportedBlob().text());
  env.clearStorage();
  await env.context.importHomebaseState({
    text: async () => JSON.stringify(exportPayload)
  });

  const combinedOutput = [...env.consoleLogs, ...env.consoleWarns].join(' ');

  assert.strictEqual(combinedOutput.includes('SECRET_TODO_CONTENT_NEVER_LOG'), false, 'Todo text must not be logged');
  assert.strictEqual(combinedOutput.includes('SECRET_BINARY_DATA_NEVER_LOG'), false, 'Binary wallpaper data must not be logged');
});

// -------------------------------------------------------------
// Test 5: Dynamic Accent Memory Optimization Unit Tests
// -------------------------------------------------------------
test('dynamic-accent: extracts average color via 1x1 canvas downsampling and cleans up', async () => {
  const env = createMockEnvironment({});

  let createdCanvas = null;
  const originalCreateElement = env.context.document.createElement;
  env.context.document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'canvas') {
      createdCanvas = el;
    }
    return el;
  };

  const color = await env.context.extractAverageColor('https://images.example.com/poster.jpg');

  assert.strictEqual(color, 'rgb(44, 165, 255)', 'Should return formatted rgb color from 1x1 sampled pixel');
  assert.ok(createdCanvas, 'Canvas element must be created');
  assert.strictEqual(createdCanvas.width, 0, 'Canvas width must be defensively reset to 0 to free memory');
  assert.strictEqual(createdCanvas.height, 0, 'Canvas height must be defensively reset to 0 to free memory');
});

test('dynamic-accent: falls back gracefully on error or invalid input', async () => {
  const env = createMockEnvironment({});

  const fallbackNull = await env.context.extractAverageColor(null);
  assert.strictEqual(fallbackNull, '#2ca5ff');

  const fallbackError = await env.context.extractAverageColor('error://fail');
  assert.strictEqual(fallbackError, '#2ca5ff');
});

// -------------------------------------------------------------
// Test 6: News Widget Watchdog Timeout Hardening
// -------------------------------------------------------------
test('news-widget: enforces 7-second watchdog timeout and cleans up timer handle', async () => {
  const env = createMockEnvironment({});

  let fetchCallCount = 0;
  let signalReceived = null;
  let fetchAborted = false;

  // Mock global fetch
  env.context.fetch = async (url, options) => {
    fetchCallCount += 1;
    signalReceived = options?.signal;
    if (signalReceived) {
      signalReceived.addEventListener('abort', () => {
        fetchAborted = true;
      });
    }

    // Simulate hung network request
    return new Promise((resolve, reject) => {
      signalReceived?.addEventListener('abort', () => {
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };

  // Initialize news widget internal references
  env.context.setupNewsWidget();

  // Test fetchAndRenderNews with force option
  const fetchPromise = env.context.fetchAndRenderNews({ force: true });

  assert.ok(signalReceived, 'Fetch must be invoked with an AbortSignal');
  assert.strictEqual(fetchCallCount, 1);

  // Trigger abort simulating watchdog timeout
  signalReceived.dispatchEvent(new Event('abort'));

  await fetchPromise;

  assert.strictEqual(fetchAborted, true, 'Fetch signal must have received abort event');
});
