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

hbPerfMark('script-start');

if (window.HomebaseDockNavigation) {
  window.HomebaseDockNavigation.setupResponsiveLayoutListener();
}

tabsScrollController = initTabsScrollController();

updateBookmarkTabOverflow();

// ===============================================
// --- SEARCH BAR ---
// ===============================================

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');

function logInitSettled(name, result) {
  if (result.status === 'rejected') console.warn('[init]', name, 'failed:', result.reason);
}

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
    const bookmarkMetaP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarkMetadata === 'function')
      ? window.HomebaseBookmarkLoader.loadBookmarkMetadata()
      : Promise.resolve({});
    const lastFolderP = (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadLastUsedFolderId === 'function')
      ? window.HomebaseBookmarkLoader.loadLastUsedFolderId()
      : Promise.resolve(null);

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
    if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadFolderMetadata === 'function') {
      await window.HomebaseBookmarkLoader.loadFolderMetadata();
    }
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
    if (window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
      await window.HomebaseBookmarkLoader.loadBookmarks();
    }
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

  requestAnimationFrame(markPageReadyOnce);
  requestAnimationFrame(() => {
    scheduleIdleTask(() => ensureDailyWallpaper().catch(() => {}), 'startup:ensureDailyWallpaper');
  });

  runWhenIdle(() => {
    if (window.HomebaseStartupHydration && typeof window.HomebaseStartupHydration.scheduleStartupHydrationTasks === 'function') {
      window.HomebaseStartupHydration.scheduleStartupHydrationTasks({
        scheduleTask: scheduleIdleTask,
        getStartupPhase: () => STARTUP_PHASE
      });
    }
  });



  // --- Context Menu Management ---

  if (typeof window !== 'undefined' && window.HomebaseDialogController && typeof window.HomebaseDialogController.initialize === 'function') {
    window.HomebaseDialogController.initialize();
  }
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.initialize === 'function') {
    window.HomebaseContextMenuController.initialize({
      getBookmarkTree: () => (window.HomebaseBookmarkTreeService && typeof window.HomebaseBookmarkTreeService.getBookmarkTree === 'function'
        ? window.HomebaseBookmarkTreeService.getBookmarkTree()
        : (typeof window !== 'undefined' ? window.bookmarkTree : null)),
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
    const nextLastUsedId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
    if (typeof window !== 'undefined') {
      window.lastUsedBookmarkFolderId = nextLastUsedId;
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
