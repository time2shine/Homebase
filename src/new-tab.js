// ===============================================

// --- GLOBAL ELEMENTS ---

// ===============================================

const browser = window.browser || window.chrome;

const googleAppsBtn = document.getElementById('google-apps-btn');

const googleAppsPanel = document.getElementById('google-apps-panel');



const searchWidget = document.querySelector('.widget-search');

const searchResultsPanel = document.getElementById('search-results-panel');

const bookmarkTabsTrack = document.getElementById('bookmark-tabs-track');

const tabScrollLeftBtn = document.getElementById('tab-scroll-left');

const tabScrollRightBtn = document.getElementById('tab-scroll-right');

const runWhenIdle = (cb, timeout = 500) => {

  if ('requestIdleCallback' in window) {

    requestIdleCallback(cb, { timeout });

  } else {

    setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), Math.min(timeout, 500));

  }

};

const IDLE_TASK_BUDGET_MS = 12;
const idleTaskQueue = [];
const idleTaskLabels = new Map();
let idleTaskScheduled = false;

hbPerfMark('script-start');

const STARTUP_IDLE_LABELS = new Set([
  'startup:loadCachedWeather',
  'startup:quoteIndex',
  'startup:setupQuoteWidget',
  'startup:setupNewsWidget',
  'startup:setupTodoWidget',
  'startup:setupSearch',
  'startup:setupWeather',
  'startup:setupAppLauncher',
  'startup:fetchQuote',
  'startup:ensureDailyWallpaper',
]);

async function processIdleTasks(deadline) {

  idleTaskScheduled = false;

  const start = performance.now();

  const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

  while (idleTaskQueue.length) {

    const timeRemaining = hasDeadline ? deadline.timeRemaining() : Infinity;

    const elapsed = performance.now() - start;

    if (elapsed >= IDLE_TASK_BUDGET_MS || (hasDeadline && timeRemaining <= 1)) {

      break;

    }

    const task = idleTaskQueue.shift();

    if (!task) continue;

    task.isRunning = true;

    let result;

    try {

      result = task.fn(deadline);

    } catch (err) {

      console.warn('Idle task failed:', task.label, err);

    }

    const isPromise = result && typeof result.then === 'function';

    if (isPromise) {

      task.isPending = true;

      Promise.resolve(result)
        .catch((err) => {

          console.warn('Idle task failed:', task.label, err);

        })
        .finally(() => {

          task.isPending = false;

          if (task.nextFn) {

            task.fn = task.nextFn;

            task.nextFn = null;

            idleTaskQueue.push(task);

            if (!idleTaskScheduled) {

              idleTaskScheduled = true;

              runWhenIdle(processIdleTasks);

            }

          } else {

            task.isRunning = false;

            if (task.label) {

              idleTaskLabels.delete(task.label);

            }

            return;

          }

        });

      task.isRunning = false;

      continue;

    }

    task.isRunning = false;

    if (task.label) {

      if (task.nextFn) {

        task.fn = task.nextFn;

        task.nextFn = null;

        idleTaskQueue.push(task);

      } else if (!task.isPending) {

        idleTaskLabels.delete(task.label);

      }

    }

  }

  if (idleTaskQueue.length && !idleTaskScheduled) {

    idleTaskScheduled = true;

    runWhenIdle(processIdleTasks);

  }

}

// Queue background work to run in short idle slices.
function scheduleIdleTask(fn, label = 'task') {

  if (typeof fn !== 'function') return;

  if (label) {

    const existing = idleTaskLabels.get(label);

    if (existing) {

      if (existing.isRunning || existing.isPending) {

        existing.nextFn = fn;

      } else {

        existing.fn = fn;

      }

      return;

    }

    const task = { fn, label, nextFn: null, isRunning: false, isPending: false };

    idleTaskLabels.set(label, task);

    idleTaskQueue.push(task);

  } else {

    idleTaskQueue.push({ fn, label: '', nextFn: null, isRunning: false, isPending: false });

  }

  if (!idleTaskScheduled) {

    idleTaskScheduled = true;

    runWhenIdle(processIdleTasks);

  }

}

function scheduleIdleChunkedTask(label, stepFn, initialState) {

  if (typeof stepFn !== 'function') return;

  let state = initialState;

  const runner = (deadline) => {

    const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

    const start = performance.now();

    const shouldYield = () => {

      if (hasDeadline) {

        return deadline.timeRemaining() <= 2;

      }

      return (performance.now() - start) >= Math.max(0, IDLE_TASK_BUDGET_MS - 2);

    };

    while (true) {

      if (shouldYield()) {

        const task = label ? idleTaskLabels.get(label) : null;

        if (task && !task.nextFn) {

          task.nextFn = runner;

        }

        return;

      }

      const result = stepFn(state, deadline);

      if (result && typeof result.then === 'function') {

        return Promise.resolve(result).then((resolved) => {

          const { done, state: newState } = resolved || {};

          if (typeof newState !== 'undefined') {

            state = newState;

          }

          if (done === true) {

            return;

          }

          const task = label ? idleTaskLabels.get(label) : null;

          if (task && !task.nextFn) {

            task.nextFn = runner;

          }

        });

      }

      const { done, state: newState } = result || {};

      if (typeof newState !== 'undefined') {

        state = newState;

      }

      if (done === true) {

        return;

      }

    }

  };

  scheduleIdleTask(runner, label);

}




(async function primeWallpaperBackground() {

  try {

    const stored = await getWallpaperRotationState();

    let selection = stored.selection;

    const now = Date.now();
    const allowDailyRotation = stored.allowDailyRotation;

    if (selection && isDailyWallpaperRotationDue(selection, allowDailyRotation, now)) {

      const manifest = await getVideosManifest();
      const nextSelection = await pickNextWallpaper(manifest);

      if (nextSelection) {

        selection = nextSelection;

        await clearPendingDailyRotation();

      }

    }

    if (selection) {

      syncWallpaperStartupState(selection, allowDailyRotation);

      const hydrated = await hydrateWallpaperSelection(selection);

      const poster = hydrated.posterUrl || 'assets/fallback.webp';

      setWallpaperFallbackPoster(poster, hydrated.posterCacheKey || hydrated.posterUrl || '');

      applyWallpaperBackground(poster);

      return;

    }



    // Only reach here if there is truly no wallpaper set

    const fallbackSelection = buildFallbackSelection(now);

    setWallpaperFallbackPoster(fallbackSelection.posterUrl, fallbackSelection.posterCacheKey || fallbackSelection.posterUrl || '');

    applyWallpaperBackground(fallbackSelection.posterUrl);



    await setWallpaperSelectionWithFallback(fallbackSelection, now);

    syncWallpaperStartupState(fallbackSelection, allowDailyRotation);

  } catch (err) {

    console.warn('primeWallpaperBackground failed:', err);

  }

})();



if (window.HomebaseDockNavigation) {
  window.HomebaseDockNavigation.setupResponsiveLayoutListener();
}

tabsScrollController = initTabsScrollController();

updateBookmarkTabOverflow();








let allBookmarks = [];

let suggestionAbortController = null; // To cancel old requests



// --- BOOKMARK LOGIC UPDATES ---

const bookmarkFolderTabsContainer = document.getElementById('bookmark-folder-tabs');

let rootDisplayFolderId = null; // ID of the main folder being displayed (e.g., "homebase")

let activeHomebaseFolderId = null; // ID of the selected folder tab



// === GRID/TABS DRAG-AND-DROP GLOBALS ===
// Canonical Sortable instances live in HomebaseBookmarkDragController

let isGridDragging = false;       // Track active drag to block click navigation
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'isGridDragging', {
      get: () => {
        if (window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.isGridDragging === 'function') {
          return window.HomebaseBookmarkDragController.isGridDragging();
        }
        return isGridDragging;
      },
      set: (val) => {
        isGridDragging = Boolean(val);
        if (window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.setGridDragging === 'function') {
          window.HomebaseBookmarkDragController.setGridDragging(val);
        }
      },
      configurable: true,
      enumerable: true
    });
  } catch (_) {
    window.isGridDragging = isGridDragging;
  }
}

let isTabDragging = false;        // Track tab drag state to avoid click misfires
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'isTabDragging', {
      get: () => {
        if (window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.isTabDragging === 'function') {
          return window.HomebaseBookmarkDragController.isTabDragging();
        }
        return isTabDragging;
      },
      set: (val) => {
        isTabDragging = Boolean(val);
        if (window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.setTabDragging === 'function') {
          window.HomebaseBookmarkDragController.setTabDragging(val);
        }
      },
      configurable: true,
      enumerable: true
    });
  } catch (_) {
    window.isTabDragging = isTabDragging;
  }
}






// Settings DOM element handles and APP_*_KEY constants extracted to settings-preferences.js




// Animation Dictionary (Name -> CSS Keyframes)
// Map to store per-folder customization (id -> { color, icon })
// Map to store per-bookmark customization (id -> { icon })

// ==========================
// FAVICON RUNTIME DELEGATION
// ==========================
if (typeof window !== 'undefined' && window.HomebaseFaviconPipeline) {
  window.ensureFaviconObserver =
    window.HomebaseFaviconPipeline.ensureFaviconObserver;
  window.getDomainKeyFromUrl =
    window.HomebaseFaviconPipeline.getDomainKeyFromUrl;
  window.getFaviconUrlForRawUrl =
    window.HomebaseFaviconPipeline.getFaviconUrlForRawUrl;
  window.resolveFaviconForImageTarget =
    window.HomebaseFaviconPipeline.resolveFaviconForImageTarget;
}

let bookmarkMetadata = {};

let folderMetadata = {};

let lastUsedBookmarkFolderId = null;

// app*Preference state variables extracted to settings-preferences.js


// ===============================================

// --- BOOKMARKS ---

// ===============================================







// =============================================================================
// Backward compatibility bridge for Bookmark Grid Drag Controller
// Canonical implementation lives in src/newtab/bookmarks/bookmark-drag-controller.js
// =============================================================================

function setupGridSortable(gridElement) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.setupGridSortable === 'function') {
    return window.HomebaseBookmarkDragController.setupGridSortable(gridElement);
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.setupGridSortable = setupGridSortable;
}





// =============================================================================
// Backward compatibility bridge for Bookmark Tab Drag Controller
// Canonical implementation lives in src/newtab/bookmarks/bookmark-drag-controller.js
// =============================================================================

function setupTabsSortable(tabsContainer) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.setupTabsSortable === 'function') {
    return window.HomebaseBookmarkDragController.setupTabsSortable(tabsContainer);
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.setupTabsSortable = setupTabsSortable;
}



// =============================================================================
// Backward compatibility bridge for Bookmark Tab Drop Handler
// Canonical implementation lives in src/newtab/bookmarks/bookmark-drag-controller.js
// =============================================================================

function handleTabDrop(evt) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.handleTabDrop === 'function') {
    return window.HomebaseBookmarkDragController.handleTabDrop(evt);
  }
  return Promise.resolve();
}
if (typeof window !== 'undefined') {
  window.handleTabDrop = handleTabDrop;
}


// =============================================================================
// Backward compatibility bridges for Bookmark Loader Service
// Canonical implementation lives in src/newtab/bookmarks/bookmark-loader-service.js
// =============================================================================

function processBookmarks(nodes, activeFolderId = null, rootNodeOverride = null) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.processBookmarks === 'function') {
    const res = window.HomebaseBookmarkLoader.processBookmarks(nodes, activeFolderId, rootNodeOverride);
    allBookmarks = window.HomebaseBookmarkLoader.getAllBookmarks();
    rootDisplayFolderId = window.HomebaseBookmarkLoader.getRootDisplayFolderId();
    return res;
  }
}

async function loadBookmarkMetadata() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarkMetadata === 'function') {
    bookmarkMetadata = await window.HomebaseBookmarkLoader.loadBookmarkMetadata();
    return bookmarkMetadata;
  }
  return {};
}

async function loadLastUsedFolderId() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadLastUsedFolderId === 'function') {
    lastUsedBookmarkFolderId = await window.HomebaseBookmarkLoader.loadLastUsedFolderId();
    return lastUsedBookmarkFolderId;
  }
  return null;
}

async function setLastUsedFolderId(id) {
  lastUsedBookmarkFolderId = id || null;
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.setLastUsedFolderId === 'function') {
    return await window.HomebaseBookmarkLoader.setLastUsedFolderId(id);
  }
}

async function loadFolderMetadata() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadFolderMetadata === 'function') {
    folderMetadata = await window.HomebaseBookmarkLoader.loadFolderMetadata();
    return folderMetadata;
  }
  return {};
}

async function loadBookmarks(activeFolderId = null) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
    const res = await window.HomebaseBookmarkLoader.loadBookmarks(activeFolderId);
    allBookmarks = window.HomebaseBookmarkLoader.getAllBookmarks();
    rootDisplayFolderId = window.HomebaseBookmarkLoader.getRootDisplayFolderId();
    if (typeof window.bookmarkTree !== 'undefined') {
      bookmarkTree = window.bookmarkTree;
    }
    return res;
  }
}

if (typeof window !== 'undefined') {
  window.loadBookmarks = loadBookmarks;
  window.processBookmarks = processBookmarks;
  window.loadBookmarkMetadata = loadBookmarkMetadata;
  window.loadFolderMetadata = loadFolderMetadata;
  window.loadLastUsedFolderId = loadLastUsedFolderId;
  window.setLastUsedFolderId = setLastUsedFolderId;
}

// ===============================================
// --- SEARCH BAR ---
// ===============================================

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');



// ===============================================
// --- FIREFOX CONTAINER LOGIC ---
// ===============================================
// Extracted to firefox-containers.js (openFolderAll)



// ===============================================

function logInitSettled(name, result) {
  if (result.status === 'rejected') console.warn('[init]', name, 'failed:', result.reason);
}

// --- INITIALIZE THE PAGE (MODIFIED) ---

// ===============================================

// ===============================================
// STARTUP CONTRACT
// - initializePage must not await non-critical hydration (weather/search/quote/appLauncher)
// - startup hydration must be scheduled only in scheduleStartupHydrationTasks()
// - all startup idle labels must be prefixed with "startup:"
// - ready flip must not wait for hydration
// ===============================================
  async function initializePage() {
    hbPerfMark('newtab:init-start');
    hbPerfMark('init-start');
    let STARTUP_PHASE = 'critical';
    let markReadyCount = 0;
    performance.mark('init:start');

    const wallpaperTypeP = getWallpaperTypePreference();

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.initialize === 'function') {
      window.HomebaseSettingsPreferences.initialize();
    }
    const settingsP = (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.load === 'function')
      ? window.HomebaseSettingsPreferences.load()
      : loadAppSettingsFromStorage();
    const bookmarkMetaP = loadBookmarkMetadata();
    const lastFolderP = loadLastUsedFolderId();

    const type = await wallpaperTypeP;
    recordStartupPerfEvent('newtab:wallpaper-type-loaded', { type });
    // allow the video to buffer without blocking UI setup
    waitForWallpaperReady(currentWallpaperSelection, type);

    performance.mark('init:parallel-start');
    hbPerfMark('parallel-start');
    const parallelResults = await Promise.allSettled([settingsP, bookmarkMetaP, lastFolderP]);
    hbPerfMark('parallel-done');
    hbPerfMeasure(
      'parallel-storage-loads',
      'parallel-start',
      'parallel-done'
    );
    performance.mark('init:parallel-done');
    performance.measure('init:parallel', 'init:parallel-start', 'init:parallel-done');

    const [settingsResult, bookmarkMetaResult, lastFolderResult] = parallelResults;
    logInitSettled('loadAppSettingsFromStorage', settingsResult);
    logInitSettled('loadBookmarkMetadata', bookmarkMetaResult);
    logInitSettled('loadLastUsedFolderId', lastFolderResult);

    const folderMetaStart =
      DEBUG_STARTUP_PERF && typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
    await loadFolderMetadata();
    hbPerfTime('loadFolderMetadata', folderMetaStart);

    document.querySelectorAll('.sub-settings-container').forEach((container) => {
      ensureSubSettingsInner(container);
    });

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.sync === 'function') {
      window.HomebaseSettingsPreferences.sync();
    } else if (typeof syncAppSettingsForm === 'function') {
      syncAppSettingsForm();
    }

    setupCinemaModeListeners();

    setupContainerMode();

    updateTime();

  setInterval(updateTime, 1000 * 60);

  setupDockNavigation();
  setupLazySettingsButton();

  setupAnimationSettings();
  setupGlassSettings();

  setupMaterialColorPicker();

  setupSearchEnginesModal();

  if (!isPerformanceModeEnabled()) {
    scheduleIdleTask(() => warmGalleryPosterHydration(), 'warmGalleryPosterHydration');
  } else {
    recordStartupPerfEventOnce('newtab:gallery-warmup-skipped-performance-mode');
  }

  

  setupQuickActions();

  setupFolderPickerModal();

  setupHomebaseRootControls();

  setupHomebaseRootListeners();

  ensureFaviconObserver();
  scheduleIdleTask(() => pruneFaviconMetaIfNeeded(), 'startup:pruneFaviconMeta');



  try {

    const bookmarksStart =
      DEBUG_STARTUP_PERF && typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
    await loadBookmarks();
    hbPerfTime('loadBookmarks total', bookmarksStart);
    hbPerfMark('bookmarks-done');

  } catch (e) {

    console.warn(e);

  }

  const markPageReadyOnce = () => {
    const b = document?.body;
    if (!b) return;
    if (b.classList.contains('ready')) {
      if (DEBUG_STARTUP_GUARDS) console.warn('[startup guard] markPageReadyOnce called after ready');
      return;
    }
    markReadyCount += 1;
    if (DEBUG_STARTUP_GUARDS && markReadyCount > 1) {
      console.warn('[startup guard] markPageReadyOnce invoked multiple times');
    }
    try {
      b.classList.remove('preload');
      b.classList.add('ready');
    } catch (err) {
      if (DEBUG_STARTUP_GUARDS) console.warn('[startup guard] ready flip failed', err);
    }
    STARTUP_PHASE = 'ready';
    recordStartupPerfEvent('newtab:init-ready');
    if (DEBUG_STARTUP_PERF && b.classList.contains('ready')) {
      hbPerfMark('ready-class');
      hbPerfMeasure('script-to-ready-class', 'script-start', 'ready-class');
      hbPerfMeasure('init-to-ready-class', 'init-start', 'ready-class');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          hbPerfMark('after-ready-paint');
          hbPerfMeasure(
            'script-to-after-ready-paint',
            'script-start',
            'after-ready-paint'
          );
          hbPerfReport();
        });
      });
    }
  };

  const loadCachedWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:loadCachedWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather start');
    try {
      await loadCachedWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:loadCachedWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('loadCachedWeather', elapsedMs);
      recordIdleTaskPerf('startup:loadCachedWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather end in', Math.round(elapsedMs), 'ms');
    }
  };

  const buildQuoteIndexSafe = async () => {
    if (!document || !document.body) return;
    const start = performance.now();
    let quoteIndexSkipped = false;
    recordIdleTaskPerf('startup:quoteIndex', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex skipped');
        quoteIndexSkipped = true;
        recordWidgetPerfTiming('quoteIndex', 0, 'skipped');
        recordIdleTaskPerf('startup:quoteIndex', 'skipped', 0);
        return;
      }
      await ensureQuoteIndexBuilt();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:quoteIndex', err);
    } finally {
      const elapsedMs = performance.now() - start;
      if (!quoteIndexSkipped) {
        recordWidgetPerfTiming('quoteIndex', elapsedMs);
      }
      recordIdleTaskPerf('startup:quoteIndex', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupQuoteWidgetSafe = () => {
    if (!document || !document.body || !quoteWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupQuoteWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget start');
    try {
      setupQuoteWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupQuoteWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupQuoteWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupQuoteWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupNewsWidgetSafe = () => {
    if (!document || !document.body || !newsWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupNewsWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget start');
    try {
      setupNewsWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupNewsWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupNewsWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupNewsWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupTodoWidgetSafe = async () => {
    if (!document || !document.body || !todoWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupTodoWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget start');
    try {
      await setupTodoWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupTodoWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupTodoWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupTodoWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupSearchSafe = async () => {
    if (!document || !document.body || !searchForm || !searchInput || !searchSelect || !searchResultsPanel || !searchWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupSearch', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch start');
    try {
      await setupSearch();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupSearch', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupSearch', elapsedMs);
      recordIdleTaskPerf('startup:setupSearch', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupSearchSafe ran during critical phase');
    }
  };

  const setupWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather start');
    try {
      await setupWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupWeather', elapsedMs);
      recordIdleTaskPerf('startup:setupWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupWeatherSafe ran during critical phase');
    }
  };

  const setupAppLauncherSafe = () => {
    if (!document || !document.body || !googleAppsBtn || !googleAppsPanel) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupAppLauncher', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher start');
    try {
      setupAppLauncher();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupAppLauncher', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupAppLauncher', elapsedMs);
      recordIdleTaskPerf('startup:setupAppLauncher', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher end in', Math.round(elapsedMs), 'ms');
    }
  };

  const fetchQuoteSafe = () => {
    if (!document || !document.body || !quoteText || !quoteAuthor) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:fetchQuote', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        renderCachedQuoteState(cachedState);
        return;
      }
      fetchQuote();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:fetchQuote', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('fetchQuote', elapsedMs);
      recordIdleTaskPerf('startup:fetchQuote', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] fetchQuoteSafe ran during critical phase');
    }
  };

  const scheduleStartupHydrationTasks = () => {
    const scheduleLabeled = (fn, label) => {
      if (!label.startsWith('startup:')) {
        console.warn('[startup guard] startup task label missing prefix', label);
      }
      if (!STARTUP_IDLE_LABELS.has(label)) {
        console.warn('[startup guard] startup task label not in allowlist', label);
      }
      scheduleIdleTask(async () => {
        try {
          await fn();
        } catch (err) {
          console.warn('Startup task failed:', label, err);
        }
      }, label);
    };

    scheduleLabeled(() => loadCachedWeatherSafe(), 'startup:loadCachedWeather');
    scheduleLabeled(() => buildQuoteIndexSafe(), 'startup:quoteIndex');
    scheduleLabeled(() => setupQuoteWidgetSafe(), 'startup:setupQuoteWidget');
    scheduleLabeled(() => setupNewsWidgetSafe(), 'startup:setupNewsWidget');
    scheduleLabeled(() => setupTodoWidgetSafe(), 'startup:setupTodoWidget');
    scheduleLabeled(() => setupSearchSafe(), 'startup:setupSearch');
    scheduleLabeled(() => setupWeatherSafe(), 'startup:setupWeather');
    scheduleLabeled(() => setupAppLauncherSafe(), 'startup:setupAppLauncher');
    scheduleLabeled(() => fetchQuoteSafe(), 'startup:fetchQuote');
  };

  requestAnimationFrame(markPageReadyOnce);
  requestAnimationFrame(() => {
    scheduleIdleTask(() => ensureDailyWallpaper().catch(() => {}), 'startup:ensureDailyWallpaper');
  });

  runWhenIdle(() => {
    scheduleStartupHydrationTasks();
  });



  // --- Context Menu Management ---

  if (typeof window !== 'undefined' && window.HomebaseDialogController && typeof window.HomebaseDialogController.initialize === 'function') {
    window.HomebaseDialogController.initialize();
  }
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.initialize === 'function') {
    window.HomebaseContextMenuController.initialize({
      getBookmarkTree: () => bookmarkTree,
      findBookmarkNodeById: (root, id) => findBookmarkNodeById(root, id),
      openFolderFromContext: (folderId) => openFolderFromContext(folderId),
      openFolderAll: (folderId) => (window.openFolderAll ? window.openFolderAll(folderId) : undefined),
      showGridItemRenameInput: (item, node) => showGridItemRenameInput(item, node),
      showEditFolderModal: (folderNode) => showEditFolderModal(folderNode),
      showEditBookmarkModal: (bookmarkId) => showEditBookmarkModal(bookmarkId),
      deleteBookmarkOrFolder: (id, isFolder, sourceTile) => deleteBookmarkOrFolder(id, isFolder, sourceTile),
      openMoveBookmarkModal: (id, isFolder) => openMoveBookmarkModal(id, isFolder),
      openBookmarkInNewTab: (bookmarkId) => openBookmarkInNewTab(bookmarkId),
      showAddBookmarkModal: () => showAddBookmarkModal(),
      showAddFolderModal: () => showAddFolderModal(),
      handlePasteBookmark: () => handlePasteBookmark(),
      sortCurrentFolderByName: () => sortCurrentFolderByName(),
      populateContainerMenu: (id, isFolder) => typeof populateContainerMenu === 'function' && populateContainerMenu(id, isFolder),
      isContainerModeEnabled: () => Boolean(appContainerModePreference)
    });
  }



  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.setupGridClickDelegation === 'function') {
    window.HomebaseBookmarkGridController.setupGridClickDelegation();
  } else if (typeof setupGridClickDelegation === 'function') {
    setupGridClickDelegation();
  }

  if (typeof window !== 'undefined' && window.HomebaseBookmarkDragController && typeof window.HomebaseBookmarkDragController.initialize === 'function') {
    window.HomebaseBookmarkDragController.initialize();
  }

  setupPasteListener();





  // === All manual D&D listeners for bookmarkFolderTabsContainer removed ===

  // They are now handled by setupTabsSortable() which is

  // called at the end of createFolderTabs()

}



function handleNewTabStorageChange(changes, area) {
  if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {
    const nextSelection = changes[WALLPAPER_SELECTION_KEY]
      ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
      : currentWallpaperSelection;
    const allowDailyRotation = changes[DAILY_ROTATION_KEY]
      ? changes[DAILY_ROTATION_KEY].newValue !== false
      : dailyRotationPreference !== false;

    syncWallpaperStartupState(nextSelection, allowDailyRotation);
  }

  if (changes[LAST_USED_BOOKMARK_FOLDER_KEY]) {
    lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
    if (typeof window !== 'undefined') {
      window.lastUsedBookmarkFolderId = lastUsedBookmarkFolderId;
    }
  }
}

if (window.HomebaseStorageDispatcher && typeof window.HomebaseStorageDispatcher.initialize === 'function') {
  window.HomebaseStorageDispatcher.initialize({
    onStorageChange: handleNewTabStorageChange
  });
}


document.addEventListener('DOMContentLoaded', () => {
  hbPerfMark('dom-content-loaded');
  hbPerfMeasure(
    'script-to-dom-content-loaded',
    'script-start',
    'dom-content-loaded'
  );
  renderTipOfDay();
  initAddonStoreDockLink();
});

if (DEBUG_STARTUP_PERF) {
  window.addEventListener('load', () => {
    hbPerfMark('window-load');
    hbPerfMeasure('script-to-window-load', 'script-start', 'window-load');
  });
}


initializePage();



// ================================

//    Dynamic Calculator Color

// ================================

if (!isPerformanceModeEnabled()) {
  scheduleIdleTask(() => updateDynamicAccent(), 'startup:updateDynamicAccent');
} else {
  recordStartupPerfEventOnce('newtab:dynamic-accent-skipped-performance-mode');
}
