// ===============================================

// --- GLOBAL ELEMENTS ---

// ===============================================

const browser = window.browser || window.chrome;

const googleAppsBtn = document.getElementById('google-apps-btn');

const googleAppsPanel = document.getElementById('google-apps-panel');



const searchWidget = document.querySelector('.widget-search');

const searchResultsPanel = document.getElementById('search-results-panel');

const bookmarkResultsContainer = document.getElementById('bookmark-results-container');

const suggestionResultsContainer = document.getElementById('suggestion-results-container');



const searchAreaWrapper = document.querySelector('.search-area-wrapper');

const bookmarkTabsTrack = document.getElementById('bookmark-tabs-track');

const bookmarkBarWrapper = document.querySelector('.bookmark-bar-wrapper');

const bookmarksGridEl = document.getElementById('bookmarks-grid');

const bookmarksEmptyState = document.getElementById('bookmarks-empty-state');

const bookmarksEmptyMessage = document.getElementById('bookmarks-empty-message');
const appBookmarksChangeRootBtn = document.getElementById('app-bookmarks-change-root-btn');

const homebaseCreateFolderBtn = document.getElementById('homebase-create-folder-btn');

const homebaseChooseFolderBtn = document.getElementById('homebase-choose-folder-btn');

const folderPickerModal = document.getElementById('folder-picker-modal');

const folderPickerPanel = document.getElementById('folder-picker-panel');

const folderPickerSearchInput = document.getElementById('folder-picker-search');

const folderPickerList = document.getElementById('folder-picker-list');

const folderPickerBreadcrumb = document.getElementById('folder-picker-breadcrumb');

const folderPickerConfirmBtn = document.getElementById('folder-picker-confirm');

const folderPickerCancelBtn = document.getElementById('folder-picker-cancel');

const folderPickerError = document.getElementById('folder-picker-error');

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

const scriptLoadPromises = new Map();
const stylesheetLoadPromises = new Map();

function loadScriptOnce(src) {
  if (!src) {
    return Promise.reject(new Error('Script src is required'));
  }

  if (scriptLoadPromises.has(src)) {
    return scriptLoadPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err || new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  scriptLoadPromises.set(src, promise);

  promise.catch(() => {
    scriptLoadPromises.delete(src);
  });

  return promise;
}

function loadStylesheetOnce(href) {
  if (!href) {
    return Promise.reject(new Error('Stylesheet href is required'));
  }

  if (stylesheetLoadPromises.has(href)) {
    return stylesheetLoadPromises.get(href);
  }

  const promise = new Promise((resolve, reject) => {
    const existingLink = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => link.getAttribute('href') === href);

    if (existingLink) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = (err) => reject(err || new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });

  stylesheetLoadPromises.set(href, promise);

  promise.catch(() => {
    stylesheetLoadPromises.delete(href);
  });

  return promise;
}

async function openBookmarkIconPicker(context = {}) {
  try {
    await loadScriptOnce('assets/js/icon-picker.js');

    if (
      !window.HomebaseIconPicker ||
      typeof window.HomebaseIconPicker.open !== 'function'
    ) {
      throw new Error('HomebaseIconPicker failed to load');
    }

    return window.HomebaseIconPicker.open(context);
  } catch (err) {
    console.warn('Failed to open icon picker', err);
    alert('Could not open the icon picker. Please try again.');
    return null;
  }
}

function revealWidget(selector) {

  const el = document.querySelector(selector);

  if (!el) return;

  el.classList.remove('widget-hidden');

  el.classList.add('widget-visible');

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



if (tabScrollLeftBtn) {

  tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));

}

if (tabScrollRightBtn) {

  tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));

}

// Optimized: Throttle pointermove to Animation Frame to reduce CPU usage

let dragMoveScheduled = false;

let lastDragX = 0;

let lastDragY = 0;



window.addEventListener('pointermove', (e) => {

  if (!isGridDragging) return;



  lastDragX = e.clientX;

  lastDragY = e.clientY;



  if (!dragMoveScheduled) {

    dragMoveScheduled = true;

    requestAnimationFrame(() => {

      handleGridDragPointerMove({ clientX: lastDragX, clientY: lastDragY });

      dragMoveScheduled = false;

    });

  }

});



let allBookmarks = [];

let suggestionAbortController = null; // To cancel old requests

let bookmarkTree = []; // To store the entire bookmark tree



// --- BOOKMARK LOGIC UPDATES ---

const bookmarkFolderTabsContainer = document.getElementById('bookmark-folder-tabs');

let rootDisplayFolderId = null; // ID of the main folder being displayed (e.g., "homebase")

let activeHomebaseFolderId = null; // ID of the selected folder tab



// === NEW: GRID/TABS DRAG-AND-DROP GLOBALS ===

let currentGridFolderNode = null; // The folder node currently being rendered in the grid

let gridSortable = null;          // Instance for the bookmarks grid

let tabsSortable = null;          // Instance for the folder tabs

let isGridDragging = false;       // Track active drag to block click navigation

let isTabDragging = false;        // Track tab drag state to avoid click misfires

let activeTabDropTarget = null;   // Currently highlighted folder tab drop target



// NEW: folder hover delay state

let folderHoverTarget = null;

let folderHoverStart = 0;

let lastGridDragOverItem = null;

const FOLDER_HOVER_DELAY_MS = 250; // tweak this (200-400ms) to taste

// --- VIRTUALIZATION GLOBALS ---
// (virtualizerState, METADATA_GRID_PATCH_LIMIT extracted to bookmark-grid-controller.js)

let sortableTimeout = null;

recordSortableLibraryAvailability();


// === CONTEXT MENU ELEMENTS ===

const folderContextMenu = document.getElementById('bookmark-folder-menu');

const menuEditBtn = document.getElementById('menu-edit-btn');

const menuDeleteBtn = document.getElementById('menu-delete-btn');



// NEW: context menus for grid items

const gridFolderMenu = document.getElementById('bookmark-grid-folder-menu');

const iconContextMenu = document.getElementById('bookmark-icon-menu');

const gridBlankMenu = document.getElementById('bookmark-grid-blank-menu');

const gridMenuCreateBookmarkBtn = document.getElementById('grid-menu-create-bookmark');

const gridMenuCreateFolderBtn = document.getElementById('grid-menu-create-folder');

const gridMenuManageBtn = document.getElementById('grid-menu-manage');

const gridMenuPasteBtn = document.getElementById('grid-menu-paste');

const gridMenuSortNameBtn = document.getElementById('grid-menu-sort-name');

const ensureMenuMountedToBody = (menuEl) => {
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.ensureMenuMountedToBody === 'function') {
    return window.HomebaseContextMenuController.ensureMenuMountedToBody(menuEl);
  }
  if (!menuEl || !(menuEl instanceof HTMLElement)) return;
  if (menuEl.parentElement !== document.body) {
    document.body.appendChild(menuEl);
  }
};


// NEW: simple state so you know what was right-clicked

let currentContextItemId = null;

let currentContextIsFolder = false;

let currentContextSourceTile = null;



// === QUICK ACTION ELEMENTS ===

const quickAddBookmarkBtn = document.getElementById('quick-add-bookmark');

const quickAddFolderBtn = document.getElementById('quick-add-folder');

const quickOpenBookmarksBtn = document.getElementById('quick-open-bookmarks');

const nextWallpaperBtn = document.getElementById('dock-next-wallpaper-btn');

const mainSettingsBtn = document.getElementById('main-settings-btn');

const appSettingsModal = document.getElementById('app-settings-modal');

const appSettingsNav = document.getElementById('app-settings-nav');

const appSettingsCloseBtn = document.getElementById('app-settings-close');

const appSettingsCancelBtn = document.getElementById('app-settings-cancel');

const appSettingsSaveBtn = document.getElementById('app-settings-save');

const appTimeFormatSelect = document.getElementById('app-time-format');

const appSidebarToggle = document.getElementById('app-show-sidebar-toggle');

const appWeatherToggle = document.getElementById('app-show-weather-toggle');

const appQuoteToggle = document.getElementById('app-show-quote-toggle');

const appNewsToggle = document.getElementById('app-show-news-toggle');

const appTodoToggle = document.getElementById('app-show-todo-toggle');

const appMaxTabsSelect = document.getElementById('app-max-tabs-select');

const appAutoCloseSelect = document.getElementById('app-autoclose-select');

const appSearchOpenNewTabToggle = document.getElementById('app-search-open-new-tab-toggle');

const appSearchRememberEngineToggle = document.getElementById('app-search-remember-engine-toggle');

const appSearchMathToggle = document.getElementById('app-search-math-toggle');

const appSearchHistoryToggle = document.getElementById('app-search-history-toggle');

const appSearchSuggestionsToggle = document.getElementById('app-search-suggestions-toggle');

const appSearchDefaultEngineContainer = document.getElementById('app-search-default-engine-container');

const appSearchDefaultEngineSelect = document.getElementById('app-search-default-engine-select');

const appDimSlider = document.getElementById('app-dim-slider');

const appDimLabel = document.getElementById('app-dim-value-label');

const appDailyToggle = document.getElementById('app-daily-toggle');

const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');

const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');

// NEXT_WALLPAPER_TOOLTIP_* extracted to wallpaper-controller.js

const wallpaperTypeToggle = document.getElementById('gallery-wallpaper-type-toggle');
const wallpaperQualityToggle = document.getElementById('gallery-wallpaper-quality-toggle');

const galleryDailyToggle = document.getElementById('gallery-daily-toggle');

// WALLPAPER_TYPE_KEY & WALLPAPER_QUALITY_KEY imported from wallpaper-storage.js

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



// Animation Dictionary (Name -> CSS Keyframes)
// Map to store per-folder customization (id -> { color, icon })
// Map to store per-bookmark customization (id -> { icon })

// ==========================
// FAVICON RUNTIME DELEGATION
// ==========================
function ensureFaviconObserver() {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.ensureObserver === 'function') {
    return window.HomebaseFaviconPipeline.ensureObserver();
  }
}

function getDomainKeyFromUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getDomainKey === 'function') {
    return window.HomebaseFaviconPipeline.getDomainKey(rawUrl);
  }
  return '';
}

async function getFaviconUrlForRawUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getUrlForRawUrl === 'function') {
    return window.HomebaseFaviconPipeline.getUrlForRawUrl(rawUrl);
  }
  return null;
}

let bookmarkMetadata = {};

let folderMetadata = {};

let lastUsedBookmarkFolderId = null;

let appBackgroundDimPreference = 0;

let appShowSidebarPreference = true;

let appShowWeatherPreference = true;

let appShowQuotePreference = true;

let appShowNewsPreference = false;

let appShowTodoPreference = true;

let appNewsSourcePreference = 'aljazeera';

let appMaxTabsPreference = 0; // 0 means unlimited

  let appAutoClosePreference = 0; // 0 means never

  let appSingletonModePreference = false;

  let appSearchOpenNewTabPreference = false;

  let appSearchRememberEnginePreference = true;

  let appSearchDefaultEnginePreference = 'google';

  let appSearchMathPreference = true;

  let appSearchShowHistoryPreference = false;

  let appSearchSuggestionsPreference = true;

  let appContainerModePreference = true;

  let appContainerNewTabPreference = true;

  let appBookmarkOpenNewTabPreference = false;

  let appBookmarkTextBgPreference = false;

let appBookmarkTextBgColorPreference = '#2CA5FF';

let appBookmarkTextBgOpacityPreference = 0.65;

let appBookmarkTextBgBlurPreference = 4;

let appBookmarkFallbackColorPreference = '#00b8d4';

let appBookmarkFolderColorPreference = '#FFFFFF';

let appGridAnimationPreference = 'default';
let appGridAnimationSpeedPreference = 0.3;
let appGridAnimationEnabledPreference = false;
let appGlassStylePreference = 'original';

let appPerformanceModePreference = readFastPerformanceModePreference();
let debugPerfOverlayPreference = false;

let appBatteryOptimizationPreference = false;

let appCinemaModePreference = false;

// ===============================================

// --- BOOKMARKS ---

// ===============================================



let bookmarkTreeFetchPromise = null;

function setChangeFolderButtonVisibility(visible) {
  if (!appBookmarksChangeRootBtn) return;
  const shouldShow = Boolean(visible);
  const changeFolderRow = appBookmarksChangeRootBtn.closest('.app-setting-row');
  appBookmarksChangeRootBtn.hidden = !shouldShow;
  appBookmarksChangeRootBtn.classList.toggle('hidden', !shouldShow);
  if (changeFolderRow) {
    changeFolderRow.hidden = !shouldShow;
    changeFolderRow.classList.toggle('hidden', !shouldShow);
  }
}

function hideBookmarksUI() {
  if (bookmarkBarWrapper) {
    bookmarkBarWrapper.hidden = true;
    bookmarkBarWrapper.classList.add('hidden');
  }
  if (bookmarksGridEl) {
    bookmarksGridEl.hidden = true;
    bookmarksGridEl.classList.add('hidden');
  }
  setChangeFolderButtonVisibility(false);
}

function showBookmarksUI() {
  if (bookmarkBarWrapper) {
    bookmarkBarWrapper.hidden = false;
    bookmarkBarWrapper.classList.remove('hidden');
  }
  if (bookmarksGridEl) {
    bookmarksGridEl.hidden = false;
    bookmarksGridEl.classList.remove('hidden');
  }
  setChangeFolderButtonVisibility(rootDisplayFolderId);
}

function showBookmarksEmptyState(message) {
  hideBookmarksUI();
  if (bookmarksGridEl) {
    bookmarksGridEl.innerHTML = '';
  }
  disableVirtualizer();
  if (bookmarkFolderTabsContainer) {
    bookmarkFolderTabsContainer.innerHTML = '';
  }
  if (bookmarkTabsTrack) {
    bookmarkTabsTrack.scrollLeft = 0;
  }
  activeHomebaseFolderId = null;
  rootDisplayFolderId = null;
  currentGridFolderNode = null;
  allBookmarks = [];
  if (bookmarksEmptyMessage) {
    bookmarksEmptyMessage.textContent =
      message ||
      'Homebase shows bookmarks from a folder you choose. We automatically look for "Other Bookmarks > Homebase". You can create one or select an existing folder.';
  }
  if (bookmarksEmptyState) {
    bookmarksEmptyState.hidden = false;
    bookmarksEmptyState.classList.remove('hidden');
  }
}

function hideBookmarksEmptyState() {
  if (bookmarksEmptyState) {
    bookmarksEmptyState.hidden = true;
    bookmarksEmptyState.classList.add('hidden');
  }
}

function beginBookmarksBoot() {
  if (document && document.body) {
    document.body.classList.add('bookmarks-booting');
  }
  hideBookmarksEmptyState();
  hideBookmarksUI();
}

function endBookmarksBoot() {
  if (document && document.body) {
    document.body.classList.remove('bookmarks-booting');
  }
}

function findChildFolderByTitle(parentNode, titleLower) {
  if (!parentNode || !parentNode.children) return null;
  return parentNode.children.find(
    (child) => child && child.children && (child.title || '').toLowerCase() === titleLower
  ) || null;
}

async function ensureFolder(parentId, title) {
  const titleLower = (title || '').toLowerCase();
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    const existing = findChildFolderByTitle({ children }, titleLower);
    if (existing) return existing;
    return await browser.bookmarks.create({ parentId, title });
  } catch (err) {
    console.warn('Failed to ensure folder', err);
    return null;
  }
}

async function ensureBookmark(parentId, title, url) {
  const desiredUrl = (url || '').trim();
  const normalizedDesiredUrl = desiredUrl.replace(/\/$/, '');
  const titleLower = (title || '').toLowerCase();
  try {
    const children = await browser.bookmarks.getChildren(parentId);
    const existing = (children || []).find((child) => {
      const childUrl = (child.url || '').trim().replace(/\/$/, '');
      const titleMatch = (child.title || '').toLowerCase() === titleLower;
      return (!!child.url && (childUrl === normalizedDesiredUrl || titleMatch));
    });
    if (existing) return existing;
    return await browser.bookmarks.create({ parentId, title, url: desiredUrl });
  } catch (err) {
    console.warn('Failed to ensure bookmark', err);
    return null;
  }
}

function getOtherBookmarksNode(rootChildren = []) {
  if (!Array.isArray(rootChildren)) return null;
  let node = rootChildren.find((folder) => folder && folder.id === 'unfiled_____');
  if (node) return node;
  node = rootChildren.find((folder) => folder && folder.id === '2');
  if (node) return node;
  return rootChildren.find(
    (folder) => folder && folder.children && (folder.title || '').toLowerCase() === 'other bookmarks'
  ) || null;
}

function findHomebaseUnderOtherBookmarks(treeRoot) {
  if (!treeRoot || !treeRoot.children) return null;
  const other = getOtherBookmarksNode(treeRoot.children);
  if (!other || !other.children) return null;
  return findChildFolderByTitle(other, 'homebase');
}

async function getBookmarkTree(forceRefresh = false) {

  if (bookmarkTree && !forceRefresh && !bookmarkTreeFetchPromise) {

    return bookmarkTree;

  }

  if (bookmarkTreeFetchPromise) {

    return bookmarkTreeFetchPromise;

  }

  bookmarkTreeFetchPromise = browser.bookmarks.getTree()

    .then((tree) => {

      bookmarkTree = tree;

      return tree;

    })

    .catch((err) => {

      console.warn('Failed to refresh bookmark tree', err);

      return bookmarkTree || [];

    })

    .finally(() => {

      bookmarkTreeFetchPromise = null;

    });

  return bookmarkTreeFetchPromise;

}

async function getStoredHomebaseRootSubTree(storedRootId) {
  if (!storedRootId || !browser.bookmarks || typeof browser.bookmarks.getSubTree !== 'function') {
    return null;
  }

  try {
    const subTree = await browser.bookmarks.getSubTree(storedRootId);
    const rootNode = Array.isArray(subTree) ? subTree[0] : null;

    if (!rootNode || rootNode.url) {
      await clearHomebaseRootId();
      return null;
    }

    bookmarkTree = subTree;
    return rootNode;
  } catch (err) {
    console.warn('Stored Homebase root ID is invalid; falling back to full bookmark tree lookup.', err);
    recordPerfFallback('bookmarks', 'Invalid bookmark root ID');
    await clearHomebaseRootId();
    return null;
  }
}



// --- NEW: Grid Drag-and-Drop Handlers (Using Sortable.js) ---


/**

 * NEW: Initializes Sortable.js on the bookmarks grid.

 * This is called by renderBookmarkGrid.

 */

function setupGridSortable(gridElement) {

  const sortableStart = getPerfMeasureStart();
  recordSortableLibraryAvailability();

  if (gridSortable) {

    gridSortable.destroy(); // Destroy previous instance

  }

  try {
    gridSortable = Sortable.create(gridElement, {
      animation: 250, // Optimal speed for smoothness
      group: 'bookmarks',
      draggable: '.bookmark-item:not(.back-button)',
      filter: '.grid-item-rename-input',
      preventOnFilter: false,

      // Explicitly tell Sortable which attribute holds the ID
      dataIdAttr: 'data-bookmark-id',

      // Performance Settings
      delay: 150, // Touch-only delay keeps mouse drag responsive; tolerance reduces micro-drag.
      delayOnTouchOnly: true,
      touchStartThreshold: 6,

      ghostClass: 'bookmark-placeholder',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',

      forceFallback: true,
      fallbackClass: 'bookmark-fallback-ghost',
      fallbackOnBody: true,
      fallbackTolerance: 6,

      onClone: (evt) => {
        const clone = evt.clone;
        if (!clone) {
          return;
        }

        clone.classList.add('bookmark-fallback-ghost');

        const fallbackIcon = clone.querySelector('.bookmark-fallback-icon');
        if (fallbackIcon && !fallbackIcon.classList.contains('show-fallback')) {
          clone.classList.add('bookmark-fallback-ghost-hide-fallback');
        }
      },

      onStart: () => {
        isGridDragging = true;
        document.body.classList.add('is-dragging-active');

        // Immediately strip the "drop-in" animation class so Sortable can animate positions.
        const animatingItems = gridElement.querySelectorAll('.newly-rendered');
        animatingItems.forEach(el => {
          el.classList.remove('newly-rendered');
          el.style.animationDelay = '';
          el.style.opacity = '1';
          el.style.animation = 'none';
        });
      },

      onEnd: (evt) => {
        document.body.classList.remove('is-dragging-active');
        // Delay clearing the drag flag so the subsequent click event is ignored.
        setTimeout(() => {
          isGridDragging = false;
        }, 50);
        handleGridDrop(evt);
      },

      onMove: handleGridMove
    });

    recordSortablePerfTiming('grid', sortableStart, 'done');
  } catch (err) {
    recordSortablePerfTiming('grid', sortableStart, 'failed');
    throw err;
  }

}



/**

 * NEW: Handles visual feedback when dragging *over* a folder.

 * This is a Sortable.js `onMove` callback.

 * --- MODIFIED TO PREVENT GRID SHIFTING ---

 */

function handleGridMove(evt) {

  const grid = evt.to;

  const targetItem = evt.related; // Item being hovered over

  const draggedItem = evt.item;   // Item being dragged



  // Only care about folder targets (not the dragged item itself)

  if (targetItem && targetItem.dataset.isFolder === 'true' && targetItem !== draggedItem) {

    const now = Date.now();



    // If we just moved onto a *different* folder, reset the timer

    if (folderHoverTarget !== targetItem) {

      folderHoverTarget = targetItem;

      folderHoverStart = now;

    }



    const hoveredLongEnough = now - folderHoverStart >= FOLDER_HOVER_DELAY_MS;



    if (hoveredLongEnough) {

      // We've been hovering this folder for a bit:

      //  - highlight it

      //  - return false to "lock" the layout in place

      if (lastGridDragOverItem && lastGridDragOverItem !== targetItem) {

        lastGridDragOverItem.classList.remove('drag-over');

      }

      if (lastGridDragOverItem !== targetItem) {

        lastGridDragOverItem = targetItem;

      }

      targetItem.classList.add('drag-over');

      return false; // prevent Sortable from reordering while over this folder

    } else {

      // Still in the "passing through" phase ? allow normal reordering

      if (lastGridDragOverItem) {

        lastGridDragOverItem.classList.remove('drag-over');

        lastGridDragOverItem = null;

      }

      targetItem.classList.remove('drag-over');

      return true;

    }

  }



  // Not over a folder ? reset hover state and allow normal sort

  folderHoverTarget = null;

  folderHoverStart = 0;

  if (lastGridDragOverItem) {

    lastGridDragOverItem.classList.remove('drag-over');

    lastGridDragOverItem = null;

  }

  return true;

}



function handleGridDragPointerMove(evt) {

  if (!isGridDragging) {

    if (activeTabDropTarget) {

      clearTabDropHighlight();

    }

    return;

  }



  if (!evt || typeof evt.clientX !== 'number' || typeof evt.clientY !== 'number') {

    return;

  }



  const hoveredElement = document.elementFromPoint(evt.clientX, evt.clientY);

  if (!hoveredElement) {

    clearTabDropHighlight();

    return;

  }



  const tabCandidate = hoveredElement.closest('.bookmark-folder-tab');

  if (!tabCandidate || !tabCandidate.dataset.folderId) {

    clearTabDropHighlight();

    return;

  }



  if (tabCandidate === activeTabDropTarget) {

    return;

  }



  if (activeTabDropTarget) {

    activeTabDropTarget.classList.remove('drop-target');

  }



  activeTabDropTarget = tabCandidate;

  activeTabDropTarget.classList.add('drop-target');

}



function clearTabDropHighlight() {

  if (!activeTabDropTarget) return;

  activeTabDropTarget.classList.remove('drop-target');

  activeTabDropTarget = null;

}







/**
 * OPTIMISTIC HELPER: Updates the local JS array to match the visual drop.
 * This prevents us from needing to re-fetch/re-render the whole grid.
 */
function moveItemInLocalTree(parentId, oldIndex, newIndex) {
  const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
  if (!parentNode || !parentNode.children) return;

  if (oldIndex < 0 || oldIndex >= parentNode.children.length) return;
  if (newIndex < 0 || newIndex >= parentNode.children.length) return;

  const [movedItem] = parentNode.children.splice(oldIndex, 1);
  parentNode.children.splice(newIndex, 0, movedItem);

  parentNode.children.forEach((child, idx) => (child.index = idx));
}

/**
 * NEW: Unified handler for grid drop (re-ordering or moving into a folder).
 * This is a Sortable.js `onEnd` callback.
 */
async function handleGridDrop(evt) {
  clearTabDropHighlight();
  const grid = evt.from;

  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
    item.classList.remove('drag-over');
  });

  const dropTargetElement = document.elementFromPoint(
    evt.originalEvent.clientX,
    evt.originalEvent.clientY
  );

  const folderTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-item[data-is-folder="true"]')
    : null;
  const tabTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-folder-tab')
    : null;
  const backButtonTarget = dropTargetElement
    ? dropTargetElement.closest('.back-button')
    : null;

  const draggedItem = evt.item;
  const draggedItemId = draggedItem.dataset.bookmarkId;

  const syncVirtualizerMove = (id, newParentId = null) => {
    if (!virtualizerState.isEnabled) return;

    if (newParentId) {
      const idx = virtualizerState.items.findIndex(x => x.id === id);
      if (idx !== -1) virtualizerState.items.splice(idx, 1);
    }
  };

  // ============================================================
  // CASE A: MOVING INTO A FOLDER (Requires Removal & Transfer)
  // ============================================================
  if ((folderTarget && folderTarget.dataset.bookmarkId !== draggedItemId) || tabTarget || backButtonTarget) {
    let targetFolderId = null;

    if (tabTarget) targetFolderId = tabTarget.dataset.folderId;
    else if (backButtonTarget) targetFolderId = backButtonTarget.dataset.backTargetId;
    else targetFolderId = folderTarget.dataset.bookmarkId;

    // 1. Visual: Remove immediately
    draggedItem.remove();

    // FIX 1: Update Virtualizer internal state immediately
    syncVirtualizerMove(draggedItemId, targetFolderId);

    // 2. Data Model Update (Optimistic)
    if (bookmarkTree && bookmarkTree[0]) {
      const currentFolderId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;
      const sourceParentNode = findBookmarkNodeById(bookmarkTree[0], currentFolderId);
      
      let movedNode = null;

      if (sourceParentNode && sourceParentNode.children) {
        const idx = sourceParentNode.children.findIndex(c => c.id === draggedItemId);
        if (idx !== -1) {
          movedNode = sourceParentNode.children[idx];
          sourceParentNode.children.splice(idx, 1);
        }
      }

      if (movedNode) {
        const targetFolderNode = findBookmarkNodeById(bookmarkTree[0], targetFolderId);
        if (targetFolderNode) {
          if (!targetFolderNode.children) targetFolderNode.children = [];
          movedNode.parentId = targetFolderId;
          targetFolderNode.children.push(movedNode);
        }
      }
    }

    // 3. API: Sync in background
    try {
      await browser.bookmarks.move(draggedItemId, { parentId: targetFolderId });
      getBookmarkTree(true).catch(e => console.warn(e));
    } catch (e) {
      console.warn('Move failed', e);
      if (currentGridFolderNode) loadBookmarks(currentGridFolderNode.id);
    }
    return;
  }

  // ============================================================
  // CASE B: RE-ORDERING (Optimistic - NO RENDER)
  // ============================================================
  if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
    const parentId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;

    const hasBackButton = grid.firstElementChild.classList.contains('back-button');
    let dataOldIndex = evt.oldIndex;
    let dataNewIndex = evt.newIndex;

    if (hasBackButton) {
      dataOldIndex--;
      dataNewIndex--;
    }

    if (dataOldIndex < 0 || dataNewIndex < 0) return;

    moveItemInLocalTree(parentId, dataOldIndex, dataNewIndex);

    if (virtualizerState.isEnabled) {
      if (
        virtualizerState.items[evt.oldIndex]
        && virtualizerState.items[evt.newIndex] !== undefined
      ) {
        const [movedItem] = virtualizerState.items.splice(evt.oldIndex, 1);
        virtualizerState.items.splice(evt.newIndex, 0, movedItem);
      }
    }

    browser.bookmarks.move(draggedItemId, { index: dataNewIndex })
      .catch(err => {
        console.error('Move failed, reverting...', err);
        loadBookmarks(parentId);
      });
  }
}





// --- NEW: Tab Drag-and-Drop Handlers (Using Sortable.js) ---



/**

 * NEW: Initializes Sortable.js on the folder tabs.

 * This is called by createFolderTabs.

 */

function setupTabsSortable(tabsContainer) {

  const sortableStart = getPerfMeasureStart();
  recordSortableLibraryAvailability();

  if (tabsSortable) {

    tabsSortable.destroy();

  }

  try {
    tabsSortable = Sortable.create(tabsContainer, {

      animation: 350, // Slightly increased duration

      easing: "cubic-bezier(0.25, 1, 0.5, 1)", //  <-- ADD THIS: Adds a smooth "snap" effect

      draggable: '.bookmark-folder-tab',

      filter: '.bookmark-folder-add-btn',

      ghostClass: 'sortable-ghost-tab',

      chosenClass: 'sortable-chosen-tab',

      dragClass: 'sortable-drag-tab',

      forceFallback: true,

      fallbackOnBody: true,

      fallbackClass: 'bookmark-fallback-ghost-tab',

      fallbackTolerance: 5,

      setData: (dataTransfer, dragEl) => {

        dataTransfer.setData('text/plain', dragEl.dataset.folderId || '');

      },

      onStart: () => {

        isTabDragging = true;

        document.body.classList.add('is-tab-dragging');

      },

      onEnd: (evt) => {

        setTimeout(() => {

          isTabDragging = false;

        }, 50);

        document.body.classList.remove('is-tab-dragging');

        handleTabDrop(evt);

        requestAnimationFrame(() => scrollActiveFolderTabIntoView({ behavior: 'smooth' }));

      },

      preventOnFilter: true

    });

    recordSortablePerfTiming('tabs', sortableStart, 'done');
  } catch (err) {
    recordSortablePerfTiming('tabs', sortableStart, 'failed');
    throw err;
  }

}



/**

 * NEW: Handler for folder tab drop (re-ordering).

 * This is a Sortable.js `onEnd` callback.

 */

async function handleTabDrop(evt) {

  if (evt.oldIndex === evt.newIndex) return; // No change



  const previouslyActiveFolderId = activeHomebaseFolderId;



  const draggedFolderId = evt.item.dataset.folderId;

  const parentNode = findBookmarkNodeById(bookmarkTree[0], rootDisplayFolderId);



  if (!draggedFolderId || !parentNode || !parentNode.children) return;



  // Only folder nodes inside rootDisplayFolderId

  const folderNodes = parentNode.children.filter(node => !node.url && node.children);



  const draggedNode = folderNodes.find(node => node.id === draggedFolderId);

  if (!draggedNode) return;



  const originalBookmarkIndex = draggedNode.index;



  let targetBookmarkIndex;



  // If we dragged to the *last* visible tab from the left,

  // treat this as "drop at the very end".

  const movingDownIntoLast =

    evt.newIndex === folderNodes.length - 1 && evt.oldIndex < evt.newIndex;



  if (movingDownIntoLast) {

    // Put it after all existing children

    targetBookmarkIndex = parentNode.children.length;

  } else {

    // Normal case: dropped before some existing tab

    const targetNode = folderNodes[evt.newIndex];

    if (!targetNode) return;

    targetBookmarkIndex = targetNode.index;

  }



  // If nothing effectively changes, bail out

  if (targetBookmarkIndex === originalBookmarkIndex) {

    return;

  }



  try {

    await browser.bookmarks.move(draggedFolderId, {

      parentId: rootDisplayFolderId,

      index: targetBookmarkIndex

    });

    const folderToKeepOpen = previouslyActiveFolderId || draggedFolderId;



    // If the active folder isn't changing, avoid a full reload to prevent UI flash

    if (folderToKeepOpen === activeHomebaseFolderId) {

      const newTree = await getBookmarkTree(true);

      bookmarkTree = newTree;

      return;

    }



    // Otherwise reload, keeping the previously selected tab active

    loadBookmarks(folderToKeepOpen);

  } catch (err) {

    console.error("Error moving bookmark folder:", err);

    loadBookmarks(); // Fallback

  }

}







function flattenBookmarks(nodes) {

  let flatList = [];

  for (const node of nodes) {

    if (node.url) {

      flatList.push({ title: node.title, url: node.url });

    }

    if (node.children) {

      flatList = flatList.concat(flattenBookmarks(node.children));

    }

  }

  return flatList;

}

async function resolveFaviconForImageTarget(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.resolveForImageTarget === 'function') {
    return window.HomebaseFaviconPipeline.resolveForImageTarget(options);
  }
}

function renderBookmarkIconInto(wrapper, bookmarkNode, iconKey) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.renderBookmarkIconInto === 'function') {
    return window.HomebaseBookmarkGridController.renderBookmarkIconInto(wrapper, bookmarkNode, iconKey);
  }
}

function renderFolderIconInto(wrapper, folderNode, iconKey) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.renderFolderIconInto === 'function') {
    return window.HomebaseBookmarkGridController.renderFolderIconInto(wrapper, folderNode, iconKey);
  }
}



async function deleteBookmarkOrFolder(id, isFolder, sourceTileEl = null) {

  if (!id) return;



  // find node so we get title/url

  let node = null;

  if (bookmarkTree && bookmarkTree[0]) {

    node = findBookmarkNodeById(bookmarkTree[0], id);

  }



  const title =

    node && node.title

      ? node.title

      : isFolder

      ? 'this folder'

      : 'this bookmark';



  let faviconUrl = null;

  if (!isFolder && node && node.url) {

    try {

      faviconUrl = await getFaviconUrlForRawUrl(node.url);

    } catch (e) {

      // ignore - will fall back to letter icon

    }

  }



  const confirmed = await showDeleteConfirm(null, {

    title,

    faviconUrl,

    isFolder,

    node,

    sourceTileEl,

  });



  if (!confirmed) return;



  try {

    // actually delete

    if (isFolder) {

      await browser.bookmarks.removeTree(id);

    } else {

      await browser.bookmarks.remove(id);

    }



    // refresh tree + grid

    const newTree = await getBookmarkTree(true);



    if (currentGridFolderNode) {

      const activeGridNode = findBookmarkNodeById(

        bookmarkTree[0],

        currentGridFolderNode.id

      );



      if (activeGridNode) {

        renderBookmarkGrid(activeGridNode);

      } else {

        loadBookmarks(activeHomebaseFolderId);

      }

    } else {

      loadBookmarks(activeHomebaseFolderId);

    }

  } catch (err) {

    console.error('Error deleting bookmark/folder:', err);

    alert('Error: could not delete this item.');

  }

}





/**

 */







/**

 * Recursively finds a bookmark node (folder or item) by its ID.

 */

function findBookmarkNodeById(rootNode, id) {

  if (!rootNode) return null; // Guard against empty root

  if (rootNode.id === id) {

    return rootNode;

  }

  if (rootNode.children) {

    for (const child of rootNode.children) {

      const found = findBookmarkNodeById(child, id);

      if (found) {

        return found;

      }

    }

  }

  return null;

}

function findNodeAndParent(rootNode, id, parent = null) {
  if (!rootNode) return null;
  if (rootNode.id === id) {
    return { node: rootNode, parent };
  }
  if (rootNode.children) {
    for (const child of rootNode.children) {
      const found = findNodeAndParent(child, id, rootNode);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function updateNodeInTree(rootNode, id, patch) {
  const result = findNodeAndParent(rootNode, id);
  if (!result || !result.node) return null;
  if (patch.title !== undefined) {
    result.node.title = patch.title;
  }
  if (patch.url !== undefined) {
    result.node.url = patch.url;
  }
  return result.node;
}

function appendNodeToParent(rootNode, parentId, newChildNode) {
  const result = findNodeAndParent(rootNode, parentId);
  if (!result || !result.node) return null;
  const parentNode = result.node;
  if (!Array.isArray(parentNode.children)) {
    parentNode.children = [];
  }
  // Normalize parent/linking data before adding.
  if (!newChildNode.parentId) {
    newChildNode.parentId = parentId;
  }
  parentNode.children.push(newChildNode);
  // Keep indices consistent for newly added and existing siblings.
  parentNode.children.forEach((child, idx) => {
    child.index = idx;
  });
  return newChildNode;
}

function getValidFolderId(folderId) {
  if (!folderId || !bookmarkTree || !bookmarkTree[0]) return null;
  const node = findBookmarkNodeById(bookmarkTree[0], folderId);
  if (node && node.children) {
    return node.id;
  }
  return null;
}

function getDefaultBookmarkParentId() {
  if (currentGridFolderNode) {
    return currentGridFolderNode.id;
  }
  const validStored = getValidFolderId(lastUsedBookmarkFolderId);
  if (validStored) {
    return validStored;
  }
  return activeHomebaseFolderId || null;
}

function updateElementData(el, node) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.updateElementData === 'function') {
    return window.HomebaseBookmarkGridController.updateElementData(el, node);
  }
}

function getIconKeyForNode(node, options = {}) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getIconKeyForNode === 'function') {
    return window.HomebaseBookmarkGridController.getIconKeyForNode(node, options);
  }
  return '';
}

function getChangedMetadataIds(previousMetadata, nextMetadata) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.getChangedMetadataIds === 'function') {
    return window.HomebaseBookmarkGridController.getChangedMetadataIds(previousMetadata, nextMetadata);
  }
  return [];
}

function findRenderedGridItemById(itemId) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.findRenderedGridItemById === 'function') {
    return window.HomebaseBookmarkGridController.findRenderedGridItemById(itemId);
  }
  return null;
}

function patchActiveGridMetadataItems(activeNode, changedIds) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.patchActiveGridMetadataItems === 'function') {
    return window.HomebaseBookmarkGridController.patchActiveGridMetadataItems(activeNode, changedIds);
  }
  return false;
}

function disableVirtualizer() {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.disableVirtualizer === 'function') {
    return window.HomebaseBookmarkGridController.disableVirtualizer();
  }
}



/**

 * Clears and re-renders the bookmarks grid (MODIFIED for Sortable.js)

 * @param {object} folderNode - The bookmark folder node to render.

 * @param {string | null} droppedItemId - The ID of an item that was just moved,

 * which should NOT be animated.

 */

function renderBookmarkGrid(folderNode, droppedItemId = null) {
  currentGridFolderNode = folderNode;
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.renderBookmarkGrid === 'function') {
    return window.HomebaseBookmarkGridController.renderBookmarkGrid(folderNode, droppedItemId, {
      rootDisplayFolderId,
      bookmarkTree,
      findBookmarkNodeById
    });
  }
}



/**

 * Creates a new bookmark folder inside the 'homebase' folder.

 */

async function createNewBookmarkFolder(name) {

  if (!rootDisplayFolderId) {

    console.error("Cannot create folder: 'homebase' folder ID is not set.");

    return;

  }

  try {

    const newFolderNode = await browser.bookmarks.create({

      parentId: rootDisplayFolderId,

      title: name

    });

    const tree = await getBookmarkTree(true);



    const rootNode = tree && tree[0] ? findBookmarkNodeById(tree[0], rootDisplayFolderId) : null;

    if (rootNode) {

      processBookmarks([rootNode], newFolderNode.id, rootNode);

    } else {

      await loadBookmarks(newFolderNode.id);

    }



  } catch (err) {

    console.error("Error creating bookmark folder:", err);

  }

}



/**
 * Helper: Extracts "Github" from "https://github.com/repo"
 */
function getSmartNameFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    let name = hostname.replace(/^www\./i, '').split('.')[0];
    if (!name) {
      return 'New Bookmark';
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (err) {
    return 'New Bookmark';
  }
}

/**
 * Pastes the clipboard URL into the current folder.
 */
async function handlePasteBookmark() {
  try {
    window.focus();

    const text = await navigator.clipboard.readText();

    if (!text || !text.trim()) {
      showCustomAlert("Clipboard is empty.");
      return;
    }

    const isUrl = text.includes("://") || text.includes("www.") || text.includes(".");

    if (!isUrl) {
      showCustomAlert("Clipboard text doesn't look like a URL.");
      return;
    }

    let finalUrl = text.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = `https://${finalUrl}`;
    }

    const smartTitle = getSmartNameFromUrl(finalUrl);
    const targetParentId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;

    await browser.bookmarks.create({
      parentId: targetParentId,
      title: smartTitle,
      url: finalUrl
    });

    await getBookmarkTree(true);
    const activeNode = findBookmarkNodeById(bookmarkTree[0], targetParentId);
    if (activeNode) {
      renderBookmarkGrid(activeNode);
    } else {
      loadBookmarks(activeHomebaseFolderId);
    }
  } catch (err) {
    console.error("Paste failed:", err);
    showCustomAlert("Please allow clipboard permissions in the extension settings.");
  }
}

/**
 * Sorts the current folder alphabetically and refreshes the grid.
 */
function isBookmarkFolderNode(node) {
  return !!(node && (Array.isArray(node.children) || !node.url));
}

function compareBookmarkNodeTitles(a, b) {
  const titleA = String((a && a.title) || '');
  const titleB = String((b && b.title) || '');
  return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
}

async function sortCurrentFolderByName() {
  const folderId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;
  if (!folderId) return;

  const tree = await getBookmarkTree(true);
  const folderNode = findBookmarkNodeById(tree[0], folderId);
  if (!folderNode || !folderNode.children) return;

  const children = [...folderNode.children];
  // Folders first, then bookmarks, both sorted A-Z.
  const folders = children.filter((node) => isBookmarkFolderNode(node));
  const bookmarks = children.filter((node) => !isBookmarkFolderNode(node));
  folders.sort(compareBookmarkNodeTitles);
  bookmarks.sort(compareBookmarkNodeTitles);
  const sortedChildren = [...folders, ...bookmarks];

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i];
    if (child.index !== i) {
      await browser.bookmarks.move(child.id, { index: i });
    }
  }

  const newTree = await getBookmarkTree(true);
  const activeNode = findBookmarkNodeById(newTree[0], folderId);
  if (activeNode) {
    renderBookmarkGrid(activeNode);
  }
}

/**

 * Deletes a bookmark folder and reloads the tabs.
 */

async function deleteBookmarkFolder(folderId) {

  try {

    await browser.bookmarks.removeTree(folderId);

    loadBookmarks(); // Reload bookmarks, will default to first tab

  } catch (err) {

    console.error("Error deleting folder:", err);

  }

}



/**

 * Replaces a tab with an input field to edit the folder name.

 */

function showEditInput(tabButton, folderNode) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.showEditInput === 'function') {
    return window.HomebaseBookmarkGridController.showEditInput(tabButton, folderNode);
  }
}

function showGridItemRenameInput(gridItem, bookmarkNode, options = {}) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.showGridItemRenameInput === 'function') {
    return window.HomebaseBookmarkGridController.showGridItemRenameInput(gridItem, bookmarkNode, {
      bookmarkTree,
      currentGridFolderNode,
      getBookmarkTree,
      updateNodeInTree,
      findBookmarkNodeById,
      renderBookmarkGrid,
      ...options
    });
  }
}





/**

 * Creates the folder tab buttons (MODIFIED for Sortable.js)

 * All manual D&D listeners have been removed.

 */



function createFolderTabs(homebaseFolder, activeFolderId = null) {
  if (window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.createFolderTabs === 'function') {
    const result = window.HomebaseBookmarkGridController.createFolderTabs(homebaseFolder, activeFolderId, {
      bookmarkTree,
      findBookmarkNodeById,
      renderBookmarkGrid,
      showEditInput,
      deleteBookmarkFolder,
      showDeleteConfirm,
      createNewBookmarkFolder,
      setupTabsSortable,
      updateBookmarkTabOverflow,
      scrollActiveFolderTabIntoView,
      createSvgIconElement,
      onActiveFolderChanged: (id) => { activeHomebaseFolderId = id; }
    });
    if (window.HomebaseBookmarkGridController.getActiveHomebaseFolderId) {
      activeHomebaseFolderId = window.HomebaseBookmarkGridController.getActiveHomebaseFolderId();
    }
    return result;
  }
}



function processBookmarks(nodes, activeFolderId = null, rootNodeOverride = null) {
  const rootNode = rootNodeOverride || (nodes && nodes[0]) || null;

  if (!rootNode) {
    console.warn('Bookmark tree is empty or malformed.');
    showBookmarksEmptyState();
    return;
  }

  allBookmarks = flattenBookmarks([rootNode]);
  rootDisplayFolderId = rootNode.id;
  hideBookmarksEmptyState();
  showBookmarksUI();
  createFolderTabs(rootNode, activeFolderId);
}



async function loadBookmarkMetadata() {
  try {
    bookmarkMetadata = (await getBookmarkMetadata()) || {};
  } catch (e) {
    console.warn('Failed to load bookmark metadata', e);
    bookmarkMetadata = {};
  }
}

async function loadLastUsedFolderId() {
  try {
    lastUsedBookmarkFolderId = (await getLastUsedFolderId()) || null;
  } catch (e) {
    console.warn('Failed to load last used bookmark folder id', e);
    lastUsedBookmarkFolderId = null;
  }
}

async function setLastUsedFolderId(id) {
  lastUsedBookmarkFolderId = id || null;
  try {
    if (typeof window !== 'undefined' && window.HomebaseBookmarkStorage && typeof window.HomebaseBookmarkStorage.setLastUsedFolderId === 'function') {
      await window.HomebaseBookmarkStorage.setLastUsedFolderId(lastUsedBookmarkFolderId);
    } else if (typeof setBookmarkLastUsedFolderId === 'function') {
      await setBookmarkLastUsedFolderId(lastUsedBookmarkFolderId);
    }
  } catch (e) {
    console.warn('Failed to persist last used folder id', e);
  }
}

async function loadFolderMetadata() {
  try {
    folderMetadata = (await getFolderMetadata()) || {};
  } catch (e) {
    console.warn('Failed to load folder metadata', e);
    folderMetadata = {};
  }
}



async function createHomebaseFolder() {
  if (!browser.bookmarks) {
    showBookmarksEmptyState('Bookmarks permission unavailable.');
    return;
  }

  beginBookmarksBoot();
  try {
    const tree = await getBookmarkTree(true);
    const root = tree && tree[0];
    const rootChildren = (root && root.children) || [];

    const parentNode = getOtherBookmarksNode(rootChildren) || rootChildren[0] || root;
    if (!parentNode || !parentNode.id) {
      console.warn('Could not resolve Other Bookmarks node to create Homebase.');
      showBookmarksEmptyState('Bookmarks permission unavailable.');
      return;
    }

    const homebaseFolder = await ensureFolder(parentNode.id, 'Homebase');
    if (!homebaseFolder || !homebaseFolder.id) {
      showBookmarksEmptyState('Bookmarks permission unavailable.');
      return;
    }

    const folderOne = await ensureFolder(homebaseFolder.id, 'Folder 1');
    if (folderOne && folderOne.id) {
      await ensureBookmark(folderOne.id, 'Google', 'https://www.google.com');
    }

    await setHomebaseRootId(homebaseFolder.id);
    await loadBookmarks();
  } catch (err) {
    console.warn('Failed to create Homebase folder', err);
    showBookmarksEmptyState('Bookmarks permission unavailable.');
  } finally {
    endBookmarksBoot();
  }
}

/**

 * Now accepts an optional ID to keep a folder active after reload.

 */

async function loadBookmarks(activeFolderId = null) {

  const loadBookmarksStart =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;

  beginBookmarksBoot();
  if (!browser.bookmarks) {

    console.warn('Bookmarks API not available.');

    showBookmarksEmptyState('Bookmarks permission unavailable.');
    return;

  }



  try {

    let rootNode = null;
    const storedRootId = await getHomebaseRootId();

    if (storedRootId) {
      const subTreeStart =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : 0;

      rootNode = await getStoredHomebaseRootSubTree(storedRootId);
      hbPerfTime('bookmarks getSubTree', subTreeStart);
    }

    if (!rootNode) {
      const treeStart =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : 0;

      const tree = await getBookmarkTree(true);
      hbPerfTime('bookmarks getBookmarkTree', treeStart);

      const treeRoot = tree && tree[0];
      if (!treeRoot) {
        console.warn('Bookmark tree is empty.');
        showBookmarksEmptyState();
        return;
      }

      rootNode = findHomebaseUnderOtherBookmarks(treeRoot);
      if (rootNode && rootNode.id) {
        await setHomebaseRootId(rootNode.id);
      } else {
        console.warn('Homebase folder not found under Other Bookmarks.');
      }
    }

    if (!rootNode) {
      showBookmarksEmptyState();
      return;
    }

    hideBookmarksEmptyState();
    showBookmarksUI();
    const processStart =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
    processBookmarks([rootNode], activeFolderId, rootNode);
    hbPerfTime('bookmarks process/render request', processStart);

  } catch (err) {

    console.warn('Failed to load bookmarks', err);
    showBookmarksEmptyState('Bookmarks permission unavailable.');

  } finally {
    endBookmarksBoot();
    hbPerfTime('loadBookmarks function total', loadBookmarksStart);
  }

}





function setupHomebaseRootControls() {

  if (homebaseCreateFolderBtn) {

    homebaseCreateFolderBtn.addEventListener('click', () => {

      createHomebaseFolder();

    });

  }

  if (homebaseChooseFolderBtn) {

    homebaseChooseFolderBtn.addEventListener('click', () => {

      openFolderPicker(homebaseChooseFolderBtn);

    });

  }

  if (appBookmarksChangeRootBtn) {

    appBookmarksChangeRootBtn.addEventListener('click', () => {

      openFolderPicker(appBookmarksChangeRootBtn);

    });

  }

}

function setupHomebaseRootListeners() {

  if (!browser.bookmarks) {

    return;

  }

  const bindBookmarkListener = (eventTarget, handler, label) => {
    if (!eventTarget || typeof eventTarget.addListener !== 'function') return;
    try {
      eventTarget.addListener(handler);
    } catch (err) {
      console.warn(`Failed to bind bookmark ${label || 'event'} listener`, err);
    }
  };

  const cacheInvalidator = () => {
    invalidateFolderIndexCache();
  };

  bindBookmarkListener(browser.bookmarks.onCreated, cacheInvalidator, 'creation');
  bindBookmarkListener(browser.bookmarks.onChanged, cacheInvalidator, 'change');
  bindBookmarkListener(browser.bookmarks.onMoved, cacheInvalidator, 'move');

  bindBookmarkListener(
    browser.bookmarks.onRemoved,
    async (id) => {
      invalidateFolderIndexCache();

      try {
        const storedRootId = await getHomebaseRootId();

        if (storedRootId && id === storedRootId) {

          await clearHomebaseRootId();

          showBookmarksEmptyState();

        }
      } catch (err) {

        console.warn('Failed to handle bookmark removal', err);

      }
    },
    'removal'
  );

}


// ===============================================
// --- PERFORMANCE MODE COMPATIBILITY BRIDGES ---
// ===============================================

function readFastPerformanceModePreference() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.readFastPerformanceModePreference === 'function') {
    return window.HomebasePerformanceController.readFastPerformanceModePreference();
  }
  try {
    if (!window.localStorage) return false;
    return localStorage.getItem(FAST_PERFORMANCE_MODE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function syncFastPerformanceModeMirror(enabled) {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.syncFastPerformanceModeMirror === 'function') {
    return window.HomebasePerformanceController.syncFastPerformanceModeMirror(enabled);
  }
  try {
    if (!window.localStorage) return;
    localStorage.setItem(FAST_PERFORMANCE_MODE_KEY, enabled === true ? '1' : '0');
  } catch (e) {}
}

function isPerformanceModeEnabled() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.isPerformanceModeEnabled === 'function') {
    return window.HomebasePerformanceController.isPerformanceModeEnabled();
  }
  return appPerformanceModePreference === true;
}

function disableGridAnimationRuntime() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.disableGridAnimationRuntime === 'function') {
    return window.HomebasePerformanceController.disableGridAnimationRuntime();
  }
}

function disableGlassRuntime() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.disableGlassRuntime === 'function') {
    return window.HomebasePerformanceController.disableGlassRuntime();
  }
}

function enableGlassRuntimeFromPreference() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.enableGlassRuntimeFromPreference === 'function') {
    return window.HomebasePerformanceController.enableGlassRuntimeFromPreference(appGlassStylePreference);
  }
}

function applyPerformanceModeState(enabled) {
  const isOn = !!enabled;
  appPerformanceModePreference = isOn;

  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.applyPerformanceMode === 'function') {
    return window.HomebasePerformanceController.applyPerformanceMode(isOn, {
      appGlassStylePreference,
      appGridAnimationPreference,
      appGridAnimationSpeedPreference,
      appGridAnimationEnabledPreference,
      onVideoCleanup: () => {
        const backgroundVideos = Array.from(document.querySelectorAll('.background-video'));
        const hadVideoSources = backgroundVideos.some((v) => {
          try {
            const source = v.querySelector('source');
            return !!(
              v.getAttribute('src') ||
              v.currentSrc ||
              v.src ||
              (source && (source.getAttribute('src') || source.src))
            );
          } catch (e) {
            return false;
          }
        });
        cleanupBackgroundPlayback();
        clearBackgroundVideos();
        if (hadVideoSources) {
          if (!perfState.media) perfState.media = createMediaPerfState();
          perfState.media.videoSourcesClearedByPerformanceMode = true;
          recordStartupPerfEvent('newtab:video-sources-cleared-performance-mode');
        }
      },
      onCinemaModeReset: () => {
        setupCinemaModeListeners();
        resetCinemaMode();
      }
    });
  }
}





// ===============================================

// --- SEARCH BAR ---

// ===============================================

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');

function updateSearchUI(engineId, options = {}) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.updateSearchUI === 'function') {
    return window.HomebaseSearchUiController.updateSearchUI(engineId, options);
  }
}

function clearSearchUI(options = {}) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.clearSearchUI === 'function') {
    return window.HomebaseSearchUiController.clearSearchUI(options);
  }
}

function hideSearchResultsPanel() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.hideSearchResultsPanel === 'function') {
    return window.HomebaseSearchUiController.hideSearchResultsPanel();
  }
}

function cycleSearchEngine(direction) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.cycleSearchEngine === 'function') {
    return window.HomebaseSearchUiController.cycleSearchEngine(direction);
  }
}

async function setupSearch() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.initialize === 'function') {
    await window.HomebaseSearchUiController.initialize();
  }
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.initialize === 'function') {
    await window.HomebaseSearchInteractionController.initialize({ bindEvents: true });
  }
}

function setSearchSuggestionsPreference(enabled) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.setSuggestionsPreference === 'function') {
    return window.HomebaseSearchInteractionController.setSuggestionsPreference(enabled);
  }
  const isEnabled = enabled !== false;
  if (appSearchSuggestionsToggle) {
    appSearchSuggestionsToggle.checked = isEnabled;
  }
}

function applySearchEngineConfig(savedConfig) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.applySearchEngineConfig === 'function') {
    return window.HomebaseSearchUiController.applySearchEngineConfig(savedConfig);
  }
  return false;
}

function getSafeEnabledSearchEngineId(preferredId) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.getSafeEnabledSearchEngineId === 'function') {
    return window.HomebaseSearchUiController.getSafeEnabledSearchEngineId(preferredId);
  }
  return preferredId || 'google';
}

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

    const settingsP = loadAppSettingsFromStorage();
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

    syncAppSettingsForm();

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
  const hideAllContextMenus = () => {
    if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.hide === 'function') {
      return window.HomebaseContextMenuController.hide();
    }
  };

  const positionContextMenuInViewport = (menuEl, clientX, clientY, opts = {}) => {
    if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.reposition === 'function') {
      return window.HomebaseContextMenuController.reposition(menuEl, clientX, clientY, opts);
    }
  };

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
      isContainerModeEnabled: () => Boolean(appContainerModePreference),
      onContextChanged: (data) => {
        currentContextItemId = data.itemId;
        currentContextIsFolder = data.isFolder;
        currentContextSourceTile = data.sourceTile;
      }
    });
  }



  const bookmarksGrid = document.getElementById('bookmarks-grid');

  if (bookmarksGrid) {

    bookmarksGrid.addEventListener('click', (e) => {

      if (e.target.classList.contains('grid-item-rename-input')) return;

      const item = e.target.closest('.bookmark-item');

      if (!item) return;

      if (isGridDragging || item.classList.contains('sortable-chosen')) return;

      if (item.classList.contains('back-button')) {
        e.preventDefault();
        const parentId = item.dataset.backTargetId;
        if (!bookmarkTree || !bookmarkTree[0]) return;
        const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
        if (parentNode) renderBookmarkGrid(parentNode);
        return;
      }

      e.preventDefault();



      const nodeId = item.dataset.bookmarkId;

      if (!nodeId || !bookmarkTree || !bookmarkTree[0]) return;

      const node = findBookmarkNodeById(bookmarkTree[0], nodeId);

      if (!node) return;



      if (item.dataset.isFolder === 'true') {

        renderBookmarkGrid(node);

        return;

      }



      if (item.classList.contains('is-loading')) return;

      item.classList.add('is-loading');

      requestAnimationFrame(() => {

        if (node.url) {

          if (appBookmarkOpenNewTabPreference) {

            browser.tabs.create({ url: node.url, active: true });

            setTimeout(() => item.classList.remove('is-loading'), 500);

          } else {

            window.location.href = node.url;

          }

        }

      });

    });



  }

  document.addEventListener('paste', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
      return;
    }

    e.preventDefault();

    handlePasteBookmark();
  });





  // === All manual D&D listeners for bookmarkFolderTabsContainer removed ===

  // They are now handled by setupTabsSortable() which is

  // called at the end of createFolderTabs()

}



if (browser?.storage?.onChanged) {

  browser.storage.onChanged.addListener((changes, area) => {

    if (area !== 'local') return;

    if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {

      const nextSelection = changes[WALLPAPER_SELECTION_KEY]
        ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
        : currentWallpaperSelection;
      const allowDailyRotation = changes[DAILY_ROTATION_KEY]
        ? changes[DAILY_ROTATION_KEY].newValue !== false
        : dailyRotationPreference !== false;

      syncWallpaperStartupState(nextSelection, allowDailyRotation);

    }



    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleStorageChange === 'function') {
      window.HomebaseSearchUiController.handleStorageChange(changes, area);
    }

    handleTodoStorageChange(changes, area);

    let changedMetadataIds = null;

    if (changes[FOLDER_META_KEY]) {
      const nextFolderMetadata = changes[FOLDER_META_KEY].newValue || {};
      changedMetadataIds = getChangedMetadataIds(changes[FOLDER_META_KEY].oldValue, nextFolderMetadata);
      folderMetadata = nextFolderMetadata;
    }

    if (changes[BOOKMARK_META_KEY]) {
      const nextBookmarkMetadata = changes[BOOKMARK_META_KEY].newValue || {};
      const changedBookmarkIds = getChangedMetadataIds(changes[BOOKMARK_META_KEY].oldValue, nextBookmarkMetadata);
      changedMetadataIds = changedMetadataIds
        ? Array.from(new Set([...changedMetadataIds, ...changedBookmarkIds]))
        : changedBookmarkIds;
      bookmarkMetadata = nextBookmarkMetadata;
    }

    if (changedMetadataIds?.length && currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {
      const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
      if (activeNode && patchActiveGridMetadataItems(activeNode, changedMetadataIds)) {
        renderBookmarkGrid(activeNode);
      }
    }

    if (changes[LAST_USED_BOOKMARK_FOLDER_KEY]) {
      lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
    }

    if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
      loadBookmarks();
    }

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

function openBookmarkInNewTab(bookmarkId) {

  if (!bookmarkTree || !bookmarkTree[0] || !bookmarkId) return;

  const node = findBookmarkNodeById(bookmarkTree[0], bookmarkId);

  if (!node || !node.url) {

    alert('This bookmark does not have a valid URL.');

    return;

  }

  browser.tabs.create({ url: node.url, active: false });

}

function openFolderFromContext(folderId) {

  if (!bookmarkTree || !bookmarkTree[0] || !folderId) return;

  const folderNode = findBookmarkNodeById(bookmarkTree[0], folderId);

  if (!folderNode || !folderNode.children) {

    alert('Unable to open this folder.');

    return;

  }

  renderBookmarkGrid(folderNode);

}
