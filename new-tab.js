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

const sidebar = document.querySelector('.sidebar');

const collapsedClockSlot = document.getElementById('collapsed-clock-slot');

const timeWidget = document.querySelector('.widget-time');

const dock = document.querySelector('.dock');

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

const SIDEBAR_COLLAPSE_RATIO = 0.49;

const DOCK_COLLAPSE_RATIO = 0.32;

const TAB_SCROLL_STEP = 180;

const WALLPAPER_POOL_KEY = 'wallpaperPoolIds';

const WALLPAPER_SELECTION_KEY = 'wallpaperSelection';

const CACHED_APPLIED_VIDEO_URL_KEY = 'cachedAppliedVideoUrl';

const CACHED_APPLIED_POSTER_URL_KEY = 'cachedAppliedPosterUrl';
const CACHED_APPLIED_POSTER_DATA_URL_KEY = 'cachedAppliedPosterDataUrl';

const CACHED_APPLIED_POSTER_CACHE_KEY = 'cachedAppliedPoster';

const WALLPAPER_FALLBACK_USED_KEY = 'wallpaperFallbackUsedAt';
const PENDING_DAILY_ROTATION_KEY = 'pendingDailyRotation';
const PENDING_DAILY_ROTATION_SINCE_KEY = 'pendingDailyRotationSince';
const DAILY_ROTATION_SEEN_DELAY_MS = 8000;

const WALLPAPER_CACHE_NAME = 'wallpaper-assets';
const GALLERY_POSTERS_CACHE_NAME = 'gallery-posters';
const POSTER_CACHE_CONCURRENCY = 4;

const USER_WALLPAPER_CACHE_PREFIX = 'https://user-wallpapers.local/';

const REMOTE_VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

const VIDEOS_JSON_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/manifest.json';
const GALLERY_ASSETS_BASE_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/v/';
const VIDEOS_JSON_CACHE_KEY = 'videosManifest';
const VIDEOS_JSON_FETCHED_AT_KEY = 'videosManifestFetchedAt';
const VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const GALLERY_POSTERS_CACHE_KEY = 'cachedGalleryPosters';

let videosManifestPromise = null;
let pendingDailyRotationTimer = null;

let tabsScrollController = null; // Manages tab strip overflow, arrows, and wheel physics

const isRemoteHttpUrl = (url = '') => typeof url === 'string' && /^https?:\/\//i.test(url);

const isRemoteVideoUrl = (url = '') => isRemoteHttpUrl(url) && REMOTE_VIDEO_REGEX.test(url);

function getLocalDayStamp(ts) {

  const date = new Date(ts || 0);

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, '0');

  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;

}

function isNewLocalDay(prevTs, nowTs) {

  return getLocalDayStamp(prevTs || 0) !== getLocalDayStamp(nowTs || Date.now());

}

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
const DEBUG_IDLE_STARTUP = false;
const DEBUG_STARTUP_GUARDS = false;
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

async function isFirefoxBrowser() {

  if (!browser || !browser.runtime || typeof browser.runtime.getBrowserInfo !== 'function') {

    return false;

  }

  try {

    const info = await browser.runtime.getBrowserInfo();

    return Boolean(info && typeof info.name === 'string' && info.name.toLowerCase().includes('firefox'));

  } catch (err) {

    return false;

  }

}

function showFirefoxShortcutInfo(feature) {

  const shortcuts = {

    history: { label: 'History', shortcut: 'Ctrl+H' },

    bookmarks: { label: 'Bookmarks', shortcut: 'Ctrl+Shift+O' },

    downloads: { label: 'Downloads', shortcut: 'Ctrl+J' },

    addons: { label: 'Add-ons', shortcut: 'Ctrl+Shift+A' },

  };

  const normalized = (feature || '').toLowerCase();

  const info = shortcuts[normalized];

  if (!info) return;

  const plainMessage = `Firefox blocks extensions from opening built-in pages like ${info.label}.\n\nUse ${info.shortcut} to open it.`;

  const htmlMessage = `Firefox blocks extensions from opening built-in pages like ${info.label}.<br><br>Use <span style="color: #4da3ff; font-weight: 600;">${info.shortcut}</span> to open it.`;

  const hasCustomAlert = document.getElementById('custom-alert-modal') && document.getElementById('custom-alert-ok-btn');

  if (hasCustomAlert && typeof showCustomDialog === 'function') {

    showCustomDialog(`${info.label} shortcut`, htmlMessage);

    const msgEl = document.getElementById('custom-alert-message');

    if (msgEl) {

      msgEl.innerHTML = htmlMessage;

    }

  } else {

    alert(plainMessage);

  }

}

let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };

// --- Global Controller for Video Events ---
let videoPlaybackController = null;
let backgroundCrossfadeTimeout = null;

function cleanupBackgroundPlayback() {

  // 1. Send the "Abort" signal to kill all active video listeners immediately
  if (videoPlaybackController) {

    videoPlaybackController.abort();

    videoPlaybackController = null;

  }

  if (backgroundCrossfadeTimeout) {
    clearTimeout(backgroundCrossfadeTimeout);
    backgroundCrossfadeTimeout = null;
  }

  // 2. Pause videos to stop CPU usage
  const videos = document.querySelectorAll('.background-video');

  videos.forEach(v => {

    v.pause();

    v.classList.remove('is-active');
    v.classList.remove('with-transition');
    v.classList.remove('on-top');

  });

}



function debounce(func, wait) {
  let timeout = null;
  let lastArgs;
  let lastThis;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;

    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      timeout = null;
      func.apply(lastThis, lastArgs);
    }, wait);
  }

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
    lastThis = null;
  };

  debounced.flush = () => {
    if (!timeout) return;
    clearTimeout(timeout);
    const args = lastArgs;
    const ctx = lastThis;
    timeout = null;
    lastArgs = null;
    lastThis = null;
    func.apply(ctx, args);
  };

  return debounced;
}



function revealWidget(selector) {

  const el = document.querySelector(selector);

  if (!el) return;

  el.classList.remove('widget-hidden');

  el.classList.add('widget-visible');

}



function buildFallbackSelection(selectedAt = Date.now()) {

  return {

    id: 'fallback',

    videoUrl: 'assets/fallback.mp4',

    posterUrl: 'assets/fallback.webp',

    posterCacheKey: 'assets/fallback.webp',

    title: 'Daily Wallpaper',

    category: 'Default',

    selectedAt

  };

}



function setWallpaperFallbackPoster(posterUrl = '', posterCacheKey = '') {

  const poster = posterUrl || 'assets/fallback.webp';

  // Avoid repainting when preload already drew a stable data URL and we'd swap to blob/http.
  const current = document.documentElement.dataset.initialWallpaper || '';
  const currentIsData = current.startsWith('data:');
  const nextIsBlobOrHttp = poster.startsWith('blob:') || poster.startsWith('http');

  if (!(currentIsData && nextIsBlobOrHttp) && current !== poster) {
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${poster}")`);
    document.documentElement.dataset.initialWallpaper = poster;
  }

  scheduleIdleTask(() => cacheAppliedWallpaperPoster(poster, posterCacheKey).catch(() => {}), 'cacheAppliedWallpaperPoster');

}



(async function primeWallpaperBackground() {

  try {

    const stored = await browser.storage.local.get([

      WALLPAPER_SELECTION_KEY,

      WALLPAPER_FALLBACK_USED_KEY

    ]);



    const selection = stored[WALLPAPER_SELECTION_KEY];

    const now = Date.now();



    // Always use the current wallpaper poster first

    if (selection) {

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



    await browser.storage.local.set({

      [WALLPAPER_SELECTION_KEY]: fallbackSelection,

      [WALLPAPER_FALLBACK_USED_KEY]: now

    });

  } catch (err) {

    console.warn('primeWallpaperBackground failed:', err);

  }

})();



/**

 * Toggles a CSS class when the window width shrinks below the configured ratio

 * so the sidebar widgets can be hidden and the main pane regains the space.

 */

function updateSidebarCollapseState() {

  const sidebarHiddenPref = document.body.classList.contains('sidebar-hidden');

  const referenceWidth = (window.screen && window.screen.availWidth) ? window.screen.availWidth : window.innerWidth;

  if (!referenceWidth) return;

  const widthRatio = window.innerWidth / referenceWidth;

  const shouldCollapseSidebar = !sidebarHiddenPref && widthRatio <= SIDEBAR_COLLAPSE_RATIO;

  const shouldCollapseDock = widthRatio <= DOCK_COLLAPSE_RATIO;

  document.body.classList.toggle('sidebar-collapsed', shouldCollapseSidebar);

  document.body.classList.toggle('dock-collapsed', shouldCollapseDock);



  if (shouldCollapseSidebar && !sidebarHiddenPref) {

    if (collapsedClockSlot && timeWidget && timeWidget.parentElement !== collapsedClockSlot) {

      collapsedClockSlot.appendChild(timeWidget);

    }

  } else {

    if (sidebar && timeWidget && timeWidget.parentElement !== sidebar) {

      const firstSidebarChild = sidebar.firstElementChild;

      if (firstSidebarChild) {

        sidebar.insertBefore(timeWidget, firstSidebarChild);

      } else {

        sidebar.appendChild(timeWidget);

      }

    }

  }

}



/**

 * Shows or hides the folder tab scroll arrows based on overflow and scroll position.

 */

function updateBookmarkTabOverflow() {

  if (tabsScrollController) {
    tabsScrollController.refresh();
    return;
  }

  // Fallback: hide arrows when controller is unavailable.
  if (!tabScrollLeftBtn || !tabScrollRightBtn) return;
  tabScrollLeftBtn.classList.remove('visible');
  tabScrollRightBtn.classList.remove('visible');

}

/**
 * Ensures the active folder tab is visible inside the scrollable track.
 * Clamps target scroll so we never overshoot the bounds.
 */
function scrollActiveFolderTabIntoView({ behavior = 'smooth', centerIfLarge = false } = {}) {
  const track = bookmarkTabsTrack;
  if (!track) return;

  const activeTab = track.querySelector('.bookmark-folder-tab.active');
  if (!activeTab) return;

  const left = activeTab.offsetLeft;
  const right = left + activeTab.offsetWidth;
  const viewLeft = track.scrollLeft;
  const viewRight = viewLeft + track.clientWidth;

  const isFullyVisible = left >= viewLeft && right <= viewRight;
  if (isFullyVisible) return;

  let target;
  if (left < viewLeft) {
    target = left - 12;
  } else {
    // If it's wider than the viewport and we want to center, do so; else align right edge.
    if (centerIfLarge && activeTab.offsetWidth > track.clientWidth) {
      target = left - Math.max(0, (track.clientWidth - activeTab.offsetWidth) / 2);
    } else {
      target = right - track.clientWidth + 12;
    }
  }

  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const clamped = Math.min(Math.max(target, 0), maxScroll);

  track.scrollTo({ left: clamped, behavior });
}



/**

 * Scrolls the folder tab row by a fixed amount in the given direction.

 */

function scrollBookmarkTabs(direction) {

  if (tabsScrollController) {
    tabsScrollController.scrollByStep(direction);
    return;
  }

  if (!bookmarkTabsTrack) return;

  bookmarkTabsTrack.scrollBy({
    left: direction * TAB_SCROLL_STEP,
    behavior: 'smooth'
  });

}



// ===============================================

// --- VIDEOS MANIFEST CACHING (DAILY) ---

// ===============================================

async function fetchVideosManifestIfNeeded() {

  if (videosManifestPromise) return videosManifestPromise;

  videosManifestPromise = (async () => {

    try {

      const stored = await browser.storage.local.get([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);

      const lastFetchedAt = stored[VIDEOS_JSON_FETCHED_AT_KEY] || 0;

      const now = Date.now();

      const isFresh = now - lastFetchedAt < VIDEOS_JSON_TTL_MS;

      const cached = stored[VIDEOS_JSON_CACHE_KEY];

      if (cached && isFresh) return cached;

      const res = await fetch(VIDEOS_JSON_URL, { cache: 'no-store' });

      if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);

      const manifest = await res.json();

      await browser.storage.local.set({

        [VIDEOS_JSON_CACHE_KEY]: manifest,

        [VIDEOS_JSON_FETCHED_AT_KEY]: now

      });

      return manifest;

    } catch (err) {

      console.error('fetchVideosManifestIfNeeded error:', err);

      const fallback = await browser.storage.local.get(VIDEOS_JSON_CACHE_KEY);

      return fallback[VIDEOS_JSON_CACHE_KEY] || [];

    } finally {

      videosManifestPromise = null;

    }

  })();

  return videosManifestPromise;

}

async function getVideosManifest() {

  const stored = await browser.storage.local.get([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);

  const manifest = stored[VIDEOS_JSON_CACHE_KEY];

  const lastFetchedAt = stored[VIDEOS_JSON_FETCHED_AT_KEY] || 0;

  const isFresh = manifest && Date.now() - lastFetchedAt < VIDEOS_JSON_TTL_MS;

  if (manifest && isFresh) {

    scheduleIdleTask(() => cacheGalleryPosters(manifest), 'cacheGalleryPosters');

    return manifest;

  }

  const fetched = await fetchVideosManifestIfNeeded();

  scheduleIdleTask(() => cacheGalleryPosters(fetched), 'cacheGalleryPosters');

  return fetched;

}

function shuffleArray(arr) {

  for (let i = arr.length - 1; i > 0; i--) {

    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];

  }

  return arr;

}



async function cacheAsset(url) {

  try {

    const cache = await caches.open(WALLPAPER_CACHE_NAME);

    const cached = await cache.match(url);

    if (cached) return;

    const res = await fetch(url, { cache: 'reload' });

    if (res.ok) {

      await cache.put(url, res.clone());

    }

  } catch (err) {

    console.warn('Failed caching asset', url, err);

  }

}



// Run async work with limited concurrency while preserving order.
async function mapLimit(items, limit, worker) {

  const results = [];

  const list = Array.isArray(items) ? items : [];

  const max = Math.max(1, limit || 1);

  let index = 0;
  let active = 0;

  return new Promise((resolve) => {

    const next = () => {

      if (index >= list.length && active === 0) {

        resolve(results);

        return;

      }

      while (active < max && index < list.length) {

        const current = index++;

        active++;

        Promise.resolve()
          .then(() => worker(list[current], current))
          .then((res) => {

            results[current] = res;

          })
          .catch((err) => {

            results[current] = err instanceof Error ? err : new Error(String(err));

          })
          .finally(() => {

            active--;

            next();

          });

      }

    };

    next();

  });

}



async function cacheGalleryPosters(manifest = []) {

  const posters = Array.from(new Set(
    manifest
      .map((v) => {
        if (isGallerySelection(v)) {
          const urls = getWallpaperUrls(v.id);
          return urls.posterUrl || v.posterUrl || v.poster;
        }
        return v.posterUrl || v.poster;
      })
      .filter(Boolean)
  ));

  if (!posters.length) return;

  try {
    const cache = await caches.open(GALLERY_POSTERS_CACHE_NAME);
    await mapLimit(posters, POSTER_CACHE_CONCURRENCY, async (url) => {
      try {
        const existing = await cache.match(url);
        if (existing) return existing;
        await cache.add(url);
        return true;
      } catch (e) {
        console.warn('Failed to cache poster', url, e);
        return e;
      }
    });
  } catch (e) {
    console.error('cacheGalleryPosters error:', e);
  }

}

const wallpaperObjectUrlCache = new Map();

let galleryHydrationWarmPromise = null;



function normalizeWallpaperCacheKey(cacheKey) {

  if (!cacheKey) return '';

  if (/^https?:\/\//i.test(cacheKey)) {

    return cacheKey;

  }

  return `${USER_WALLPAPER_CACHE_PREFIX}${encodeURIComponent(cacheKey)}`;

}



function getCacheKeyVariants(cacheKey) {

  if (!cacheKey) return [];

  const normalized = normalizeWallpaperCacheKey(cacheKey);

  const variants = [normalized];

  if (normalized !== cacheKey) {

    variants.push(cacheKey);

  } else if (normalized.startsWith(USER_WALLPAPER_CACHE_PREFIX)) {

    const legacy = normalized.slice(USER_WALLPAPER_CACHE_PREFIX.length);

    if (legacy) variants.push(legacy);

  }

  return variants;

}



async function getCachedObjectUrl(cacheKey) {

  const keys = getCacheKeyVariants(cacheKey);

  if (!keys.length) return null;



  for (const key of keys) {

    if (wallpaperObjectUrlCache.has(key)) {

      return wallpaperObjectUrlCache.get(key);

    }

  }



  try {

    const cache = await caches.open(WALLPAPER_CACHE_NAME);

    for (const key of keys) {

      const res = await cache.match(key);

      if (!res) continue;

      const blob = await res.blob();

      const url = URL.createObjectURL(blob);

      keys.forEach((k) => wallpaperObjectUrlCache.set(k, url));

      return url;

    }

  } catch (err) {

    console.warn('Failed to read cached wallpaper', cacheKey, err);

    return null;

  }

}



async function warmGalleryPosterHydration() {

  if (galleryHydrationWarmPromise) return galleryHydrationWarmPromise;

  galleryHydrationWarmPromise = (async () => {

    try {

      await getVideosManifest();

    } catch (err) {

      console.warn('Failed to warm gallery poster hydration', err);

    }

  })();

  return galleryHydrationWarmPromise;

}



async function deleteCachedObject(cacheKey) {

  const keys = getCacheKeyVariants(cacheKey);

  if (!keys.length) return;

  let cache = null;

  try {

    cache = await caches.open(WALLPAPER_CACHE_NAME);

  } catch (err) {

    console.warn('Failed to delete cached wallpaper', cacheKey, err);

  }



  keys.forEach((key) => {

    if (cache) {

      cache.delete(key).catch(() => {});

    }

    const cachedUrl = wallpaperObjectUrlCache.get(key);

    if (cachedUrl) {

      URL.revokeObjectURL(cachedUrl);

      wallpaperObjectUrlCache.delete(key);

    }

  });

}



async function pruneCachedVideos(keepUrl = '') {

  try {

    const cache = await caches.open(WALLPAPER_CACHE_NAME);

    const requests = await cache.keys();

    const deletions = requests

      .map((req) => {

        const url = req.url;

        // 1. Only target video files
        if (!isRemoteVideoUrl(url)) return null;

        // 2. SAFETY CHECK: Do NOT delete user uploads
        if (url.startsWith(USER_WALLPAPER_CACHE_PREFIX)) return null;

        // 3. Keep the currently active wallpaper
        if (keepUrl && url === keepUrl) return null;

        return cache.delete(req).catch(() => {});

      })

      .filter(Boolean);

    if (deletions.length) {

      await Promise.all(deletions);

    }

  } catch (err) {

    console.warn('Failed to prune cached videos', err);

  }

}



async function cacheAppliedWallpaperVideo(selection) {

  if (!selection) return;



  const videoCacheKey = selection.videoCacheKey || '';

  const videoUrl = selection.videoUrl || '';

  const targetUrl = isRemoteVideoUrl(videoCacheKey)

    ? videoCacheKey

    : (isRemoteVideoUrl(videoUrl) ? videoUrl : '');

  if (targetUrl && targetUrl.startsWith(USER_WALLPAPER_CACHE_PREFIX)) {
    await browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY);
    return;
  }



  try {

    await pruneCachedVideos(targetUrl);



    if (targetUrl) {

      await cacheAsset(targetUrl);

      await browser.storage.local.set({ [CACHED_APPLIED_VIDEO_URL_KEY]: targetUrl });

    } else {

      await browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY);

    }

  } catch (err) {

    console.warn('Failed to cache applied video', err);

  }

}



async function resolvePosterBlob(posterUrl, posterCacheKey = '') {

  const cacheKeys = new Set();

  if (posterCacheKey) {

    getCacheKeyVariants(posterCacheKey).forEach((key) => cacheKeys.add(key));

  }

  if (posterUrl) {

    cacheKeys.add(posterUrl);

  }

  getCacheKeyVariants(CACHED_APPLIED_POSTER_CACHE_KEY).forEach((key) => cacheKeys.add(key));



  let cache = null;

  try {

    cache = await caches.open(WALLPAPER_CACHE_NAME);

  } catch (err) {

    cache = null;

  }



  if (cache) {

    for (const key of cacheKeys) {

      try {

        const match = await cache.match(key);

        if (match) {

          return await match.blob();

        }

      } catch (err) {

        // Ignore cache read errors

      }

    }

  }

  if (typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getCacheName === 'function') {
    try {
      const myCache = await caches.open(MyWallpapers.getCacheName());
      for (const key of cacheKeys) {
        try {
          const match = await myCache.match(key);
          if (match) {
            return await match.blob();
          }
        } catch (err) {
          // ignore and continue
        }
      }
    } catch (err) {
      // ignore
    }
  }



  if (posterUrl) {

    try {

      const res = await fetch(posterUrl);

      if (res && res.ok) {

        return await res.blob();

      }

    } catch (err) {

      // Ignore fetch errors so caller can fall back

    }

  }



  return null;

}



async function cacheAppliedWallpaperPoster(posterUrl, posterCacheKey = '') {
  try {
    if (!posterUrl) {
      await browser.storage.local.remove(CACHED_APPLIED_POSTER_URL_KEY);
      await browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
      await deleteCachedObject(CACHED_APPLIED_POSTER_CACHE_KEY);
      try {
        if (window.localStorage) {
          localStorage.removeItem('cachedAppliedPosterUrl');
          localStorage.removeItem('cachedAppliedPosterDataUrl');
        }
      } catch (e) {}
      return;
    }

    let urlToStore = posterUrl;
    if (isRemoteHttpUrl(posterUrl)) {
      await cacheAsset(posterUrl);
    } else if (posterUrl.startsWith('blob:')) {
      if (posterCacheKey && !posterCacheKey.startsWith('blob:')) {
        urlToStore = posterCacheKey;
      }
    }

    if (isRemoteHttpUrl(urlToStore)) {
      await cacheAsset(urlToStore);
    }

    // Store the URL placeholder
    await browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: urlToStore });
    try {
      if (window.localStorage) {
        localStorage.setItem('cachedAppliedPosterUrl', urlToStore);
      }
    } catch (e) {}

    const cacheKeyToUse = posterCacheKey || posterUrl;

    // Defer poster encoding so Apply stays responsive; work runs when the browser is idle.
    const posterDataTaskState = { phase: 0, dataUrl: '' };

    scheduleIdleChunkedTask('posterDataUrlGeneration', async (state = posterDataTaskState) => {

      try {

        if (state.phase === 0) {

          const storedUrlResult = await browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY);

          const storedUrl = storedUrlResult && storedUrlResult[CACHED_APPLIED_POSTER_URL_KEY];

          if (storedUrl !== urlToStore) {

            return { done: true, state: { ...state, phase: 3 } }; // Race guard: applied poster changed before we started.

          }

          return { done: false, state: { ...state, phase: 1 } };

        }

        if (state.phase === 1) {

          let dataUrl = '';

          const blob = await resolvePosterBlob(urlToStore, cacheKeyToUse);

          if (blob && blob.size > 0) {

            if (blob.size > 2 * 1024 * 1024) {

              dataUrl = await createOptimizedPosterDataUrl(blob);

            } else {

              dataUrl = await blobToDataUrl(blob);

            }

          }

          return { done: false, state: { ...state, dataUrl, phase: 2 } };

        }

        if (state.phase === 2) {

          const latestStored = await browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY);

          const latestUrl = latestStored && latestStored[CACHED_APPLIED_POSTER_URL_KEY];

          if (latestUrl !== urlToStore) {

            return { done: true, state: { ...state, phase: 3 } }; // Race guard: poster switched while encoding.

          }

          if (state.dataUrl) {

            await browser.storage.local.set({ [CACHED_APPLIED_POSTER_DATA_URL_KEY]: state.dataUrl });

            try {

              if (window.localStorage) {

                localStorage.setItem('cachedAppliedPosterDataUrl', state.dataUrl);

              }

            } catch (e) {}

          } else {

            await browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);

            try {

              if (window.localStorage) {

                localStorage.removeItem('cachedAppliedPosterDataUrl');

              }

            } catch (e) {}

          }

          return { done: true, state: { ...state, phase: 3 } };

        }

        return { done: true, state };

      } catch (e) {

        console.warn('Failed to generate data URL for poster', e);

        return { done: true, state: { ...state, phase: 3 } };

      }

    }, posterDataTaskState);
  } catch (err) {
    console.warn('Failed to cache applied wallpaper poster', err);
  }
}

/**
 * Creates a resized/compressed Data URL specifically for instant startup cache.
 * Keeps the file within localStorage limits (~5MB) without affecting the actual high-res wallpaper.
 */
async function createOptimizedPosterDataUrl(blob) {
  if (!blob) {
    return '';
  }

  const MAX_DIM = 2000;
  let objectUrl = '';

  try {
    const img = new Image();

    objectUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = objectUrl;
    });

    let w = img.width;
    let h = img.height;

    if (!w || !h) {
      return '';
    }

    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return '';
    }

    ctx.drawImage(img, 0, 0, w, h);

    let jpegBlob = null;

    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas && typeof canvas.convertToBlob === 'function') {
      jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    } else {
      jpegBlob = await new Promise((resolve) => {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((result) => resolve(result || null), 'image/jpeg', 0.8);
        } else {
          resolve(null);
        }
      });
    }

    if (!jpegBlob) {
      return '';
    }

    const dataUrl = await blobToDataUrl(jpegBlob);

    return typeof dataUrl === 'string' ? dataUrl : '';
  } catch (err) {
    return '';
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (e) {}
    }
  }
}



function blobToDataUrl(blob) {

  return new Promise((resolve) => {

    try {

      const reader = new FileReader();

      reader.onload = (e) => resolve(e && e.target && e.target.result ? e.target.result : '');

      reader.onerror = () => resolve('');

      reader.readAsDataURL(blob);

    } catch (err) {

      resolve('');

    }

  });

}



async function buildVideoPosterFromFile(file) {

  return new Promise((resolve) => {

    try {

      const objectUrl = URL.createObjectURL(file);

      const video = document.createElement('video');

      video.preload = 'metadata';

      video.muted = true;

      video.playsInline = true;

      video.src = objectUrl;



      const cleanup = () => {

        URL.revokeObjectURL(objectUrl);

      };



      const finalize = (posterUrl) => {

        cleanup();

        resolve(posterUrl);

      };



      video.addEventListener('loadeddata', () => {

        try {

          const maxDim = 1280;

          const vw = Math.max(1, video.videoWidth || maxDim);

          const vh = Math.max(1, video.videoHeight || maxDim);

          const scale = Math.min(1, maxDim / Math.max(vw, vh));

          const canvas = document.createElement('canvas');

          canvas.width = Math.max(1, Math.round(vw * scale));

          canvas.height = Math.max(1, Math.round(vh * scale));

          const ctx = canvas.getContext('2d');

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/webp');

          finalize(dataUrl);

        } catch (err) {

          console.warn('Failed to create poster from video upload', err);

          finalize('');

        }

      });



      video.addEventListener('error', () => finalize(''));

    } catch (err) {

      console.warn('Error while generating video poster', err);

      resolve('');

    }

  });

}



async function hydrateWallpaperSelection(selection) {

  if (!selection) return selection;

  const hydrated = { ...selection };



  if (!hydrated.videoCacheKey && isRemoteHttpUrl(hydrated.videoUrl || '')) {

    hydrated.videoCacheKey = hydrated.videoUrl;

  }

  if (!hydrated.posterCacheKey && isRemoteHttpUrl(hydrated.posterUrl || '')) {

    hydrated.posterCacheKey = hydrated.posterUrl;

  }

  if (!hydrated.posterCacheKey && hydrated.posterUrl && !hydrated.posterUrl.startsWith('data:') && !hydrated.posterUrl.startsWith('blob:')) {

    hydrated.posterCacheKey = hydrated.posterUrl;

  }



  if (hydrated.videoCacheKey) {
    let cachedVideo = await getCachedObjectUrl(hydrated.videoCacheKey);
    if (!cachedVideo && typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getObjectUrl === 'function') {
      cachedVideo = await MyWallpapers.getObjectUrl(hydrated.videoCacheKey);
    }
    if (cachedVideo) {
      hydrated.videoUrl = cachedVideo;
    }
  }

  const posterLookupKey = hydrated.posterCacheKey || '';

  if (posterLookupKey) {
    let cachedPoster = await getCachedObjectUrl(posterLookupKey);
    if (!cachedPoster && typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getObjectUrl === 'function') {
      cachedPoster = await MyWallpapers.getObjectUrl(posterLookupKey);
    }
    if (cachedPoster) {
      hydrated.posterUrl = cachedPoster;
    }
  }

  if (!hydrated.posterUrl) {
    hydrated.posterUrl = 'assets/fallback.webp';
  }



  return hydrated;

}



function setBackgroundVideoSources(videoUrl, posterUrl = '') {
  if (isPerformanceModeEnabled()) return;

  const videos = Array.from(document.querySelectorAll('.background-video'));

  videos.forEach((v) => {

    const source = v.querySelector('source');

    const currentSrc = source ? (source.getAttribute('src') || '') : (v.getAttribute('src') || '');

    const desiredPoster = posterUrl || '';

    const needsUpdate = currentSrc !== videoUrl || v.poster !== desiredPoster;



    if (needsUpdate) {

      try { v.pause(); } catch (e) {}

      if (source) {

        source.src = videoUrl;

      } else {

        v.src = videoUrl;

      }

      v.poster = desiredPoster;

      v.load();

      v.currentTime = 0;

    }

  });

}



function applyWallpaperBackground(posterUrl) {
  const current = document.documentElement.dataset.initialWallpaper || '';
  const currentIsData = current.startsWith('data:');
  const nextIsBlobOrHttp = (posterUrl || '').startsWith('blob:') || (posterUrl || '').startsWith('http');

  // Keep existing data URL if we would downgrade to blob/http, or if unchanged.
  if ((currentIsData && nextIsBlobOrHttp) || current === posterUrl) return;

  const next = posterUrl ? `url("${posterUrl}")` : '';

  if (posterUrl) {
    document.documentElement.style.setProperty('--initial-wallpaper', next);
    document.documentElement.dataset.initialWallpaper = posterUrl;
  } else {
    document.documentElement.style.removeProperty('--initial-wallpaper');
    delete document.documentElement.dataset.initialWallpaper;
  }
}



function getWallpaperUrls(id) {
  if (!id || id === 'fallback') {
    return { videoUrl: '', posterUrl: '', thumbUrl: '' };
  }

  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    return { videoUrl: '', posterUrl: '', thumbUrl: '' };
  }

  const quality = wallpaperQualityPreference === 'high' ? 'high' : 'low';
  const basePath = `${GALLERY_ASSETS_BASE_URL}${normalizedId}/`;
  const videoFile = quality === 'high' ? '1080p.mp4' : '720p.mp4';
  const posterFile = quality === 'high' ? 'poster_1080p.webp' : 'poster_720p.webp';

  return {
    videoUrl: `${basePath}${videoFile}`,
    posterUrl: `${basePath}${posterFile}`,
    thumbUrl: `${basePath}thumb.webp`
  };
}

function isUserUploadSelection(sel) {
  if (!sel) return false;
  const startsWithUserPrefix = (val = '') => typeof val === 'string' && val.startsWith(USER_WALLPAPER_CACHE_PREFIX);
  return (
    startsWithUserPrefix(sel.videoCacheKey || '') ||
    startsWithUserPrefix(sel.posterCacheKey || '') ||
    startsWithUserPrefix(sel.videoUrl || '') ||
    startsWithUserPrefix(sel.posterUrl || '') ||
    sel.source === 'user'
  );
}

function isGallerySelection(sel) {
  if (!sel || isUserUploadSelection(sel)) return false;

  const id = String(sel.id || '').trim();
  const fromGalleryBase = (val = '') => typeof val === 'string' && val.startsWith(GALLERY_ASSETS_BASE_URL);
  const looksLikeGalleryId = id && id !== 'fallback' && /^[a-z0-9_-]{3,}$/i.test(id);
  const hasGalleryUrl =
    fromGalleryBase(sel.videoUrl || '') ||
    fromGalleryBase(sel.posterUrl || '') ||
    fromGalleryBase(sel.videoCacheKey || '') ||
    fromGalleryBase(sel.posterCacheKey || '');

  return hasGalleryUrl || looksLikeGalleryId;
}

function getGalleryUrlsOrNull(selection) {
  if (!selection || !isGallerySelection(selection)) return null;
  const urls = getWallpaperUrls(selection.id);
  if (!urls || !urls.videoUrl || !urls.posterUrl) return null;
  return urls;
}

function rebuildCurrentSelectionFromGallery() {
  const urls = getGalleryUrlsOrNull(currentWallpaperSelection);
  if (!urls) return null;

  const updated = {
    ...currentWallpaperSelection,
    videoUrl: urls.videoUrl,
    posterUrl: urls.posterUrl,
    videoCacheKey: urls.videoUrl,
    posterCacheKey: urls.posterUrl
  };
  currentWallpaperSelection = updated;
  return updated;
}


async function pickNextWallpaper(manifest) {

  if (!manifest || !manifest.length) return null;

  const stored = await browser.storage.local.get([WALLPAPER_POOL_KEY]);

  let pool = Array.isArray(stored[WALLPAPER_POOL_KEY]) ? stored[WALLPAPER_POOL_KEY] : [];

  if (!pool.length) {

    pool = shuffleArray(manifest.map(item => item.id));

  }

  const nextId = pool.pop();

  const entry = manifest.find(item => item.id === nextId);

  await browser.storage.local.set({ [WALLPAPER_POOL_KEY]: pool });

  if (!entry) return null;


  let generatedVideoUrl = '';
  let generatedPosterUrl = '';
  if (isGallerySelection(entry)) {
    const urls = getWallpaperUrls(entry.id);
    generatedVideoUrl = urls.videoUrl;
    generatedPosterUrl = urls.posterUrl;
  }
  const videoUrl = generatedVideoUrl || entry.url || '';
  const posterUrl = generatedPosterUrl || entry.poster || entry.posterUrl || '';
  const posterCacheKey = entry.posterCacheKey || posterUrl || '';

  if (posterUrl) {
    await cacheAsset(posterUrl);
  }



  const selection = {

    id: entry.id,

    videoUrl,

    videoCacheKey: videoUrl || '',

    posterUrl,

    posterCacheKey,

    title: entry.title,

    selectedAt: Date.now()

  };

  await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: selection });

  return selection;

}



async function checkBatteryStatus() {

  if ('getBattery' in navigator) {

    try {

      const battery = await navigator.getBattery();

      if (!battery.charging) {

        console.log('Battery mode detected: Pausing live wallpaper.');

        return true;

      }

    } catch (e) {

      // Ignore errors

    }

  }

  return false;

}



function schedulePendingDailyRotationAttempt() {

  if (pendingDailyRotationTimer) return;

  pendingDailyRotationTimer = setTimeout(async () => {

    pendingDailyRotationTimer = null;

    if (document.hidden) return;

    if (isPerformanceModeEnabled()) return;

    try {

      const stored = await browser.storage.local.get([

        PENDING_DAILY_ROTATION_KEY,

        PENDING_DAILY_ROTATION_SINCE_KEY,

        DAILY_ROTATION_KEY,

        WALLPAPER_SELECTION_KEY

      ]);

      const now = Date.now();

      const pending = stored[PENDING_DAILY_ROTATION_KEY] === true;

      const allowDailyRotation = stored[DAILY_ROTATION_KEY] !== false;

      const current = stored[WALLPAPER_SELECTION_KEY];

      const selectedAt = current && current.selectedAt ? current.selectedAt : 0;

      if (!current || !Number.isFinite(selectedAt) || selectedAt <= 0) {

        await browser.storage.local.remove([

          PENDING_DAILY_ROTATION_KEY,

          PENDING_DAILY_ROTATION_SINCE_KEY

        ]);

        return;

      }

      const dueByDayChange = isNewLocalDay(selectedAt, now);

      if (!pending) return;

      if (!allowDailyRotation || !dueByDayChange) {

        await browser.storage.local.remove([

          PENDING_DAILY_ROTATION_KEY,

          PENDING_DAILY_ROTATION_SINCE_KEY

        ]);

        return;

      }

      await browser.storage.local.remove([

        PENDING_DAILY_ROTATION_KEY,

        PENDING_DAILY_ROTATION_SINCE_KEY

      ]);

    } catch (err) {

      console.warn('Failed to clear pending daily rotation', err);

      return;

    }

    try {

      await ensureDailyWallpaper(true);

    } catch (err) {

      console.warn('Pending daily rotation failed', err);

    }

  }, DAILY_ROTATION_SEEN_DELAY_MS);

}

async function ensureDailyWallpaper(forceNext = false) {

  if (isPerformanceModeEnabled()) return;

  const stored = await browser.storage.local.get([WALLPAPER_SELECTION_KEY, WALLPAPER_FALLBACK_USED_KEY, DAILY_ROTATION_KEY, WALLPAPER_QUALITY_KEY, PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);

  const now = Date.now();

  const storedFallbackUsedAt = stored[WALLPAPER_FALLBACK_USED_KEY] || 0;
  const storedQuality = stored[WALLPAPER_QUALITY_KEY];
  if (storedQuality) {
    wallpaperQualityPreference = storedQuality === 'high' ? 'high' : 'low';
  }



  let current = stored[WALLPAPER_SELECTION_KEY];

  let fallbackUsedAt = storedFallbackUsedAt || now;

  if (!current) {

    const fallbackSelection = buildFallbackSelection(fallbackUsedAt);

    current = fallbackSelection;

    currentWallpaperSelection = fallbackSelection;

    await browser.storage.local.set({

      [WALLPAPER_SELECTION_KEY]: fallbackSelection,

      [WALLPAPER_FALLBACK_USED_KEY]: fallbackUsedAt

    });

  } else {

    currentWallpaperSelection = current;

  }



  const allowDailyRotation = stored[DAILY_ROTATION_KEY] !== false;
  const pendingAlreadySet = stored[PENDING_DAILY_ROTATION_KEY] === true;
  const pendingSince = stored[PENDING_DAILY_ROTATION_SINCE_KEY] || 0;
  const dueByDayChange = isNewLocalDay(current ? current.selectedAt : 0, now);

  if (pendingAlreadySet && !dueByDayChange) {

    await browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);

  }

  const shouldDeferRotation = !forceNext && allowDailyRotation && dueByDayChange;

  if (shouldDeferRotation) {

    if (!pendingAlreadySet) {

      await browser.storage.local.set({

        [PENDING_DAILY_ROTATION_KEY]: true,

        [PENDING_DAILY_ROTATION_SINCE_KEY]: now

      });

    } else if (!pendingSince) {

      await browser.storage.local.set({

        [PENDING_DAILY_ROTATION_SINCE_KEY]: now

      });

    }

    schedulePendingDailyRotationAttempt();

  } else if (forceNext && pendingAlreadySet) {

    await browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);

  }

  const shouldPickNext = forceNext;

  if (shouldPickNext) {

    const manifest = await getVideosManifest();

    const nextSelection = await pickNextWallpaper(manifest);

    if (nextSelection) {

      current = nextSelection;

      currentWallpaperSelection = nextSelection;

    }

  }

  const refreshedGalleryUrls = getGalleryUrlsOrNull(current);
  if (refreshedGalleryUrls) {
    current = {
      ...current,
      videoUrl: refreshedGalleryUrls.videoUrl,
      posterUrl: refreshedGalleryUrls.posterUrl,
      videoCacheKey: refreshedGalleryUrls.videoUrl,
      posterCacheKey: refreshedGalleryUrls.posterUrl
    };
    await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: current });
  }

  if (current) {

    const hydratedSelection = await hydrateWallpaperSelection(current);
    await ensurePlayableSelection(hydratedSelection);

    currentWallpaperSelection = hydratedSelection;

    let saveBattery = false;

    if (appBatteryOptimizationPreference) {

      saveBattery = await checkBatteryStatus();

    }



    if (saveBattery && hydratedSelection.videoUrl) {

      applyWallpaperByType(hydratedSelection, 'static');

      return;

    }



    const type = hydratedSelection.videoUrl ? await getWallpaperTypePreference() : 'static';

    applyWallpaperByType(hydratedSelection, type);

    scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydratedSelection), 'cacheAppliedWallpaperVideo');

  } else {

    applyWallpaperBackground('assets/fallback.webp');

  }

}



const debouncedResize = debounce(() => {

  updateSidebarCollapseState();

  updateBookmarkTabOverflow();

}, 100);



window.addEventListener('resize', debouncedResize);
window.addEventListener('beforeunload', () => {
  debouncedResize.cancel?.();
});

tabsScrollController = initTabsScrollController();

updateSidebarCollapseState();

updateBookmarkTabOverflow();



if (tabScrollLeftBtn) {

  tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));

}

if (tabScrollRightBtn) {

  tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));

}

function initTabsScrollController() {

  if (!bookmarkTabsTrack || !tabScrollLeftBtn || !tabScrollRightBtn) return null;



  const track = bookmarkTabsTrack;

  const leftBtn = tabScrollLeftBtn;

  const rightBtn = tabScrollRightBtn;



  const startSentinel = document.createElement('span');

  startSentinel.className = 'tabs-edge-sentinel tabs-edge-start';

  const endSentinel = document.createElement('span');

  endSentinel.className = 'tabs-edge-sentinel tabs-edge-end';



  const state = {

    atStart: true,

    atEnd: false,

    hasOverflow: false,

    wheelVelocity: 0,

    wheelRaf: 0

  };

  let edgeObserver = null;



  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);



  const ensureSentinels = () => {

    if (startSentinel.parentElement !== track) {

      track.insertBefore(startSentinel, track.firstChild || null);

    } else if (track.firstChild !== startSentinel) {

      track.insertBefore(startSentinel, track.firstChild);

    }


    if (endSentinel.parentElement !== track) {

      track.appendChild(endSentinel);

    } else if (track.lastChild !== endSentinel) {

      track.appendChild(endSentinel);

    }

  };



  const updateButtons = () => {

    if (!leftBtn || !rightBtn) return;


    if (!state.hasOverflow) {

      leftBtn.classList.remove('visible');

      rightBtn.classList.remove('visible');

      return;

    }


    leftBtn.classList.toggle('visible', !state.atStart);

    rightBtn.classList.toggle('visible', !state.atEnd);

  };



  const refreshOverflow = () => {

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

    state.hasOverflow = maxScrollLeft > 1;


    if (!state.hasOverflow) {

      state.atStart = true;

      state.atEnd = true;

    }


  };



  const refresh = () => {

    ensureSentinels();

    refreshOverflow();

    if (edgeObserver) {

      const pending = edgeObserver.takeRecords();

      if (pending.length) {

        handleIntersections(pending);

      }

    }

    updateButtons();

  };



  const handleIntersections = (entries) => {

    entries.forEach((entry) => {

      if (entry.target === startSentinel) {

        state.atStart = entry.isIntersecting;

      } else if (entry.target === endSentinel) {

        state.atEnd = entry.isIntersecting;

      }

    });

    updateButtons();

  };



  const normalizeWheelToPx = (e) => {

    const absX = Math.abs(e.deltaX);

    const absY = Math.abs(e.deltaY);

    let delta = absX > absY ? e.deltaX : e.deltaY;

    if (!delta) return 0;


    if (e.deltaMode === 1) {

      delta *= 16;

    } else if (e.deltaMode === 2) {

      delta *= track.clientWidth;

    }


    return delta;

  };



  const stopWheelLoop = () => {

    if (state.wheelRaf) {

      cancelAnimationFrame(state.wheelRaf);

      state.wheelRaf = 0;

    }

    state.wheelVelocity = 0;

  };



  const startWheelLoop = () => {

    if (state.wheelRaf) return;


    const step = () => {

      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

      if (maxScrollLeft <= 0) {

        stopWheelLoop();

        updateButtons();

        return;

      }


      let next = track.scrollLeft + state.wheelVelocity;

      if (next < 0) {

        next = 0;

        state.wheelVelocity = 0;

      } else if (next > maxScrollLeft) {

        next = maxScrollLeft;

        state.wheelVelocity = 0;

      }


      track.scrollLeft = next;


      state.wheelVelocity *= 0.86;


      if (Math.abs(state.wheelVelocity) < 0.15) {

        stopWheelLoop();

        updateButtons();

        return;

      }


      state.wheelRaf = requestAnimationFrame(step);

    };


    state.wheelRaf = requestAnimationFrame(step);

  };



  const handleWheel = (e) => {

    if (isTabDragging || isGridDragging) return;

    if (e.buttons !== 0) return;


    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

    if (maxScrollLeft <= 0) return;


    const deltaPx = normalizeWheelToPx(e);


    e.preventDefault();

    e.stopPropagation();


    if (!deltaPx) return;


    const impulse = clamp(deltaPx * 0.35, -120, 120);


    state.wheelVelocity = clamp(state.wheelVelocity + impulse, -80, 80);


    startWheelLoop();

  };



  const scrollByStep = (direction) => {

    const tabs = Array.from(track.querySelectorAll('.bookmark-folder-tab'));

    const viewLeft = track.scrollLeft;

    const viewRight = viewLeft + track.clientWidth;


    if (direction > 0) {

      const targetTab = tabs.find((tab) => (tab.offsetLeft + tab.offsetWidth) > (viewRight + 1));

      if (targetTab) {

        targetTab.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });

        return;

      }

    } else {

      for (let i = tabs.length - 1; i >= 0; i -= 1) {

        const tab = tabs[i];

        if (tab.offsetLeft < (viewLeft - 1)) {

          tab.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });

          return;

        }

      }

    }


    track.scrollBy({

      left: direction * track.clientWidth * 0.7,

      behavior: 'smooth'

    });

  };



  ensureSentinels();


  edgeObserver = new IntersectionObserver(handleIntersections, {

    root: track,

    threshold: 0.99,

    rootMargin: '0px 1px'

  });

  edgeObserver.observe(startSentinel);

  edgeObserver.observe(endSentinel);


  const resizeObserver = new ResizeObserver(() => refresh());

  resizeObserver.observe(track);


  track.addEventListener('wheel', handleWheel, { passive: false });


  refresh();


  return {

    refresh,

    updateButtons,

    scrollByStep,

    handleWheel

  };

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

const FOLDER_HOVER_DELAY_MS = 250; // tweak this (200-400ms) to taste

// --- VIRTUALIZATION GLOBALS ---
let virtualizerState = {
  isEnabled: false,
  items: [],
  rowHeight: 115, // Approximate height (110px item + 5px gap)
  itemWidth: 105, // Approximate width (100px item + 5px gap)
  cols: 1,
  totalRows: 0,
  mainContentEl: document.querySelector('.main-content'),
  gridEl: document.getElementById('bookmarks-grid'),
  scrollListener: null,
  resizeObserver: null,
  updateRafId: 0,
  // Cache the last rendered range to avoid DOM thrashing
  lastStart: -1,
  lastEnd: -1
};

let sortableTimeout = null;

const PERF_OVERLAY_CACHE_THROTTLE_MS = 5000;
const perfState = {
  overlayEnabled: false,
  lastGridRenderMs: 0,
  lastRenderedStartIndex: -1,
  lastRenderedEndIndex: -1,
  totalCount: 0,
  gridRenderedNodes: 0,
  lastVirtualRange: { start: -1, end: -1 },
  cacheBytes: null,
  localStorageBytes: 0,
  lastCacheCheck: 0
};

let perfOverlayEl = null;
let perfOverlayInterval = null;
let perfOverlayCachePromise = null;

// Format bytes into a human readable string.
function formatBytes(bytes = 0) {

  if (!bytes || Number.isNaN(bytes)) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

  const value = bytes / (1024 ** i);

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;

}

// Estimate localStorage usage in bytes.
function estimateLocalStorageBytes() {

  let total = 0;

  try {

    for (let i = 0; i < localStorage.length; i++) {

      const key = localStorage.key(i) || '';

      const val = localStorage.getItem(key) || '';

      total += (key.length + val.length) * 2;

    }

  } catch (err) {

    console.warn('Failed to estimate localStorage size', err);

  }

  return total;

}

// Throttled cache size computation for the perf overlay.
async function computeCacheBytes() {

  const cacheNames = new Set([WALLPAPER_CACHE_NAME, GALLERY_POSTERS_CACHE_NAME]);

  try {

    const myWallpapersCache = (() => {

      try {

        if (typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getCacheName === 'function') {

          return MyWallpapers.getCacheName();

        }

      } catch (err) {

        return null;

      }

      return null;

    })();

    if (myWallpapersCache) cacheNames.add(myWallpapersCache);

  } catch (err) {

    // Ignore—MyWallpapers may not be initialized yet.

  }

  let totalBytes = 0;

  for (const name of cacheNames) {

    if (!name) continue;

    try {

      const cache = await caches.open(name);

      const requests = await cache.keys();

      for (const request of requests) {

        const res = await cache.match(request);

        if (!res) continue;

        const len = res.headers.get('content-length');

        const parsed = len ? parseInt(len, 10) : NaN;

        if (!Number.isNaN(parsed)) {

          totalBytes += parsed;

          continue;

        }

        if (res.type === 'opaque') continue;

        try {

          const buf = await res.clone().arrayBuffer();

          totalBytes += buf.byteLength;

        } catch (err) {

          // Ignore failures from unreadable responses.

        }

      }

    } catch (err) {

      console.warn('Perf overlay cache size check failed for', name, err);

    }

  }

  perfState.cacheBytes = totalBytes;

  return totalBytes;

}

function ensurePerfOverlayElement() {

  if (perfOverlayEl && perfOverlayEl.isConnected) return perfOverlayEl;

  const el = document.createElement('div');

  el.id = 'perf-debug-overlay';

  el.style.cssText = `
    position: fixed;
    right: 12px;
    bottom: 12px;
    background: rgba(0,0,0,0.78);
    color: #fff;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1.5;
    pointer-events: none;
    z-index: 9999;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    max-width: 340px;
    white-space: pre-line;
  `;

  perfOverlayEl = el;

  const attach = () => {

    if (document && document.body && !el.isConnected) {

      document.body.appendChild(el);

    } else {

      requestAnimationFrame(attach);

    }

  };

  attach();

  return el;

}

function updatePerfOverlay(forceCacheRefresh = false) {

  if (!perfState.overlayEnabled) return;

  const el = ensurePerfOverlayElement();

  const now = Date.now();

  if ((forceCacheRefresh || now - perfState.lastCacheCheck >= PERF_OVERLAY_CACHE_THROTTLE_MS) && !perfOverlayCachePromise) {

    perfState.lastCacheCheck = now;

    perfOverlayCachePromise = computeCacheBytes().catch(() => {}).finally(() => {

      perfOverlayCachePromise = null;

      if (perfState.overlayEnabled) updatePerfOverlay(false);

    });

  }

  perfState.localStorageBytes = estimateLocalStorageBytes();

  const startIdx = perfState.lastVirtualRange.start >= 0 ? perfState.lastVirtualRange.start : (perfState.lastRenderedStartIndex >= 0 ? perfState.lastRenderedStartIndex : 0);

  const endIdx = perfState.lastVirtualRange.end >= 0 ? perfState.lastVirtualRange.end : (perfState.lastRenderedEndIndex >= 0 ? perfState.lastRenderedEndIndex : 0);

  const cacheDisplay = perfState.cacheBytes != null ? formatBytes(perfState.cacheBytes) : '...';

  const gridRender = perfState.lastGridRenderMs ? perfState.lastGridRenderMs.toFixed(1) : '0.0';

  el.textContent = [
    `Grid render: ${gridRender} ms`,
    `Grid nodes: ${perfState.gridRenderedNodes}`,
    `Virtual range: ${startIdx}-${endIdx} / ${perfState.totalCount}`,
    `Cache size: ${cacheDisplay}`,
    `localStorage: ${formatBytes(perfState.localStorageBytes)}`
  ].join('\n');

}

function setPerfOverlayEnabled(enabled) {

  const isEnabled = enabled === true;

  perfState.overlayEnabled = isEnabled;

  debugPerfOverlayPreference = isEnabled;

  if (isEnabled) {

    ensurePerfOverlayElement();

    updatePerfOverlay(true);

    if (!perfOverlayInterval) {

      perfOverlayInterval = setInterval(() => updatePerfOverlay(false), 1000);

    }

  } else {

    if (perfOverlayInterval) {

      clearInterval(perfOverlayInterval);

      perfOverlayInterval = null;

    }

    if (perfOverlayEl) {

      perfOverlayEl.remove();

    }

    perfOverlayEl = null;

    perfState.gridRenderedNodes = 0;
    perfState.lastRenderedStartIndex = -1;
    perfState.lastRenderedEndIndex = -1;
    perfState.lastVirtualRange = { start: -1, end: -1 };
    perfState.totalCount = 0;
    perfState.lastGridRenderMs = 0;

  }

}



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



// NEW: simple state so you know what was right-clicked

let currentContextItemId = null;

let currentContextIsFolder = false;

let currentContextSourceTile = null;



// === QUICK ACTION ELEMENTS ===

const quickAddBookmarkBtn = document.getElementById('quick-add-bookmark');

const quickAddFolderBtn = document.getElementById('quick-add-folder');

const quickOpenBookmarksBtn = document.getElementById('quick-open-bookmarks');

const galleryModal = document.getElementById('gallery-modal');

const galleryGrid = document.getElementById('gallery-grid');

const galleryCloseBtn = document.getElementById('gallery-close-btn');

const galleryAlternateBtn = document.getElementById('gallery-alternate-btn');

const galleryActiveFilter = document.getElementById('gallery-active-filter');

const galleryClearTagBtn = document.getElementById('gallery-clear-tag-btn');

const dockGalleryBtn = document.getElementById('dock-gallery-btn');

const addonStoreBtn = document.getElementById('addon-store-btn');

const addonStoreTooltip = document.getElementById('addon-store-tooltip');

const addonStoreIcon = document.getElementById('addon-store-icon');

const nextWallpaperBtn = document.getElementById('dock-next-wallpaper-btn');

const myWallpapersJumpBtn = document.getElementById('mw-jump-gallery-btn');

const myWallpapersUseFallbackBtn = document.getElementById('mw-use-fallback-btn');

const myWallpapersUploadBtn = document.getElementById('mw-upload-btn');

const myWallpapersUploadInput = document.getElementById('mw-upload-input');

const myWallpapersUploadLiveBtn = document.getElementById('mw-upload-live-btn');

const myWallpapersUploadLiveInput = document.getElementById('mw-upload-live-input');

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

const appSearchDefaultEngineContainer = document.getElementById('app-search-default-engine-container');

const appSearchDefaultEngineSelect = document.getElementById('app-search-default-engine-select');

const appDimSlider = document.getElementById('app-dim-slider');

const appDimLabel = document.getElementById('app-dim-value-label');

const appDailyToggle = document.getElementById('app-daily-toggle');

const appWallpaperTypeSelect = document.getElementById('app-wallpaper-type-select');

const appWallpaperQualitySelect = document.getElementById('app-wallpaper-quality-select');

const NEXT_WALLPAPER_TOOLTIP_DEFAULT = nextWallpaperBtn?.getAttribute('aria-label') || 'Next Wallpaper';

const NEXT_WALLPAPER_TOOLTIP_LOADING = 'Downloading...';

const wallpaperTypeToggle = document.getElementById('gallery-wallpaper-type-toggle');
const wallpaperQualityToggle = document.getElementById('gallery-wallpaper-quality-toggle');

const galleryDailyToggle = document.getElementById('gallery-daily-toggle');

const FAVORITES_KEY = 'galleryFavorites';

const DAILY_ROTATION_KEY = 'dailyWallpaperEnabled';

const WALLPAPER_TYPE_KEY = 'wallpaperTypePreference';
const WALLPAPER_QUALITY_KEY = 'wallpaperQualityPreference';

const APP_TIME_FORMAT_KEY = 'appTimeFormatPreference';

const APP_BACKGROUND_DIM_KEY = 'appBackgroundDim';

const APP_SHOW_SIDEBAR_KEY = 'appShowSidebar';

const APP_SHOW_WEATHER_KEY = 'appShowWeather';

const APP_SHOW_QUOTE_KEY = 'appShowQuote';

const APP_SHOW_NEWS_KEY = 'appShowNews';

const APP_SHOW_TODO_KEY = 'appShowTodo';

const WIDGET_ORDER_KEY = 'widgetOrder';

const DEFAULT_WIDGET_ORDER = ['weather', 'quote', 'todo', 'news'];

const WIDGET_ORDER_SET = new Set(DEFAULT_WIDGET_ORDER);

const APP_NEWS_SOURCE_KEY = 'appNewsSource';

const APP_MAX_TABS_KEY = 'appMaxTabsCount';

const APP_AUTOCLOSE_KEY = 'appAutoCloseMinutes';

const APP_SINGLETON_MODE_KEY = 'appSingletonMode';

const APP_SEARCH_OPEN_NEW_TAB_KEY = 'appSearchOpenNewTab';

const APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEngine';

const APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEngine';

const APP_SEARCH_MATH_KEY = 'appSearchMath';

const APP_SEARCH_SHOW_HISTORY_KEY = 'appSearchShowHistory';

const APP_BOOKMARK_OPEN_NEW_TAB_KEY = 'appBookmarkOpenNewTab';

const APP_BOOKMARK_TEXT_BG_KEY = 'appBookmarkTextBg';

const APP_BOOKMARK_TEXT_BG_COLOR_KEY = 'appBookmarkTextBgColor';

const APP_BOOKMARK_TEXT_OPACITY_KEY = 'appBookmarkTextBgOpacity';

  const APP_BOOKMARK_TEXT_BLUR_KEY = 'appBookmarkTextBgBlur';

  const APP_BOOKMARK_FALLBACK_COLOR_KEY = 'appBookmarkFallbackColor';

  const APP_BOOKMARK_FOLDER_COLOR_KEY = 'appBookmarkFolderColor';

  const APP_PERFORMANCE_MODE_KEY = 'appPerformanceMode';
  const APP_DEBUG_PERF_OVERLAY_KEY = 'debugPerfOverlay';

  const APP_BATTERY_OPTIMIZATION_KEY = 'appBatteryOptimization';

  const APP_CINEMA_MODE_KEY = 'appCinemaMode';

  const APP_CONTAINER_MODE_KEY = 'appContainerMode';

  const APP_CONTAINER_NEW_TAB_KEY = 'appContainerNewTab';

  const APP_GRID_ANIMATION_KEY = 'appGridAnimationPref';
  const APP_GRID_ANIMATION_SPEED_KEY = 'appGridAnimationSpeed';
  const APP_GRID_ANIMATION_ENABLED_KEY = 'appGridAnimationEnabled';
  const APP_GLASS_STYLE_KEY = 'appGlassStylePref';

const HOMEBASE_BACKUP_SCHEMA = 'homebase.export';
const HOMEBASE_BACKUP_VERSION = 1;

const HOMEBASE_OWNED_STORAGE_KEYS = [
  WALLPAPER_SELECTION_KEY,
  CACHED_APPLIED_POSTER_URL_KEY,
  CACHED_APPLIED_POSTER_DATA_URL_KEY,
  CACHED_APPLIED_POSTER_CACHE_KEY,
  CACHED_APPLIED_VIDEO_URL_KEY,
  VIDEOS_JSON_CACHE_KEY,
  VIDEOS_JSON_FETCHED_AT_KEY,
  GALLERY_POSTERS_CACHE_KEY,
  WALLPAPER_POOL_KEY,
  WALLPAPER_FALLBACK_USED_KEY,
  PENDING_DAILY_ROTATION_KEY,
  PENDING_DAILY_ROTATION_SINCE_KEY,
  FAVORITES_KEY,
  DAILY_ROTATION_KEY,
  WALLPAPER_TYPE_KEY,
  WALLPAPER_QUALITY_KEY,
  APP_TIME_FORMAT_KEY,
  APP_BACKGROUND_DIM_KEY,
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
  APP_BOOKMARK_OPEN_NEW_TAB_KEY,
  APP_BOOKMARK_TEXT_BG_KEY,
  APP_BOOKMARK_TEXT_BG_COLOR_KEY,
  APP_BOOKMARK_TEXT_OPACITY_KEY,
  APP_BOOKMARK_TEXT_BLUR_KEY,
  APP_BOOKMARK_FALLBACK_COLOR_KEY,
  APP_BOOKMARK_FOLDER_COLOR_KEY,
  APP_PERFORMANCE_MODE_KEY,
  APP_DEBUG_PERF_OVERLAY_KEY,
  APP_BATTERY_OPTIMIZATION_KEY,
  APP_CINEMA_MODE_KEY,
  APP_CONTAINER_MODE_KEY,
  APP_CONTAINER_NEW_TAB_KEY,
  APP_GRID_ANIMATION_KEY,
  APP_GRID_ANIMATION_SPEED_KEY,
  APP_GRID_ANIMATION_ENABLED_KEY,
  APP_GLASS_STYLE_KEY,
  'bookmarkCustomMetadata',
  'homebaseBookmarkRootId',
  'folderCustomMetadata',
  'domainIconMap',
  'lastUsedBookmarkFolderId',
  'quoteUpdateFrequency',
  'quoteLastFetched',
  'quoteBufferCache',
  'quoteLocalIndexV1',
  'quoteTags',
  'searchEnginesConfig',
  'currentSearchEngineId',
  'cachedWeatherData',
  'cachedCityName',
  'cachedUnits',
  'weatherFetchedAt',
  'weatherLat',
  'weatherLon',
  'weatherCityName',
  'weatherUnits'
];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function exportHomebaseState() {
  if (!browser?.storage?.local) {
    throw new Error('Storage is unavailable.');
  }

  const stored = await browser.storage.local.get(HOMEBASE_OWNED_STORAGE_KEYS);
  const storageLocal = {};

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (stored && stored[key] !== undefined) {
      storageLocal[key] = stored[key];
    }
  });

  const payload = {
    schema: HOMEBASE_BACKUP_SCHEMA,
    version: HOMEBASE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storageLocal
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `homebase-backup-${dateTag}.json`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importHomebaseState(file) {
  if (!browser?.storage?.local) {
    throw new Error('Storage is unavailable.');
  }
  if (!file) {
    throw new Error('No backup file selected.');
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid JSON file.');
  }

  if (!parsed || parsed.schema !== HOMEBASE_BACKUP_SCHEMA) {
    throw new Error('Invalid backup schema.');
  }
  if (typeof parsed.version !== 'number' || parsed.version !== HOMEBASE_BACKUP_VERSION) {
    throw new Error('Unsupported backup version.');
  }
  if (!isPlainObject(parsed.storageLocal)) {
    throw new Error('Invalid backup payload.');
  }

  const incoming = parsed.storageLocal;
  const updates = {};
  const removals = [];

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      updates[key] = incoming[key];
    } else {
      removals.push(key);
    }
  });

  if (Object.keys(updates).length) {
    await browser.storage.local.set(updates);
  }
  if (removals.length) {
    await browser.storage.local.remove(removals);
  }

  try {
    if (window.localStorage) {
      const dimValue = incoming[APP_BACKGROUND_DIM_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_BACKGROUND_DIM_KEY) && Number.isFinite(dimValue)) {
        localStorage.setItem('fast-bg-dim', String(dimValue));
      } else {
        localStorage.removeItem('fast-bg-dim');
      }

      const sidebarValue = incoming[APP_SHOW_SIDEBAR_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_SHOW_SIDEBAR_KEY) && typeof sidebarValue === 'boolean') {
        localStorage.setItem('fast-show-sidebar', sidebarValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-sidebar');
      }

      const weatherValue = incoming[APP_SHOW_WEATHER_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_SHOW_WEATHER_KEY) && typeof weatherValue === 'boolean') {
        localStorage.setItem('fast-show-weather', weatherValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-weather');
      }

      const quoteValue = incoming[APP_SHOW_QUOTE_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_SHOW_QUOTE_KEY) && typeof quoteValue === 'boolean') {
        localStorage.setItem('fast-show-quote', quoteValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-quote');
      }

      const newsValue = incoming[APP_SHOW_NEWS_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_SHOW_NEWS_KEY) && typeof newsValue === 'boolean') {
        localStorage.setItem('fast-show-news', newsValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-news');
      }

      const todoValue = incoming[APP_SHOW_TODO_KEY];
      if (Object.prototype.hasOwnProperty.call(incoming, APP_SHOW_TODO_KEY) && typeof todoValue === 'boolean') {
        localStorage.setItem('fast-show-todo', todoValue ? '1' : '0');
      } else {
        localStorage.removeItem('fast-show-todo');
      }
    }
  } catch (err) {
    // Ignore; mirrors are best-effort only
  }

  if (typeof showCustomDialog === 'function') {
    showCustomDialog('Import complete', 'Homebase settings have been restored. Reloading...');
  }
  window.location.reload();
}

window.HomebaseBackup = {
  exportState: exportHomebaseState,
  importState: importHomebaseState
};

// Animation Dictionary (Name -> CSS Keyframes)
// Map to store per-folder customization (id -> { color, icon })
// Map to store per-bookmark customization (id -> { icon })

const BOOKMARK_META_KEY = 'bookmarkCustomMetadata';
const HOMEBASE_BOOKMARK_ROOT_ID_KEY = 'homebaseBookmarkRootId';
const FOLDER_META_KEY = 'folderCustomMetadata';
const DOMAIN_ICON_MAP_KEY = 'domainIconMap';
const LAST_USED_BOOKMARK_FOLDER_KEY = 'lastUsedBookmarkFolderId';
const DOMAIN_ICON_MAP_LIMIT = 200;

// ==========================
// FAVICON PERF CACHE (NEW)
// ==========================
const FAVICON_SIZE_PX = 48;          // was effectively 64+ in some places; keep small for grid icons
const FAVICON_NEGATIVE_TTL_MS = 10 * 60 * 1000;
const FAVICON_RESOLVED_CACHE_LIMIT = 300;
const FAVICON_META_PREFIX = 'fav:meta:';
const FAVICON_META_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const FAVICON_FAIL_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FAVICON_META_MAX_ENTRIES = 5000;
const MAX_CONCURRENT_FAVICON_TASKS = 6;
const FAVICON_CACHE_NAME = 'favicons-v1';
const FAVICON_OBSERVER_ROOT_MARGIN = '250px';
const FAVICON_OBSERVER_THRESHOLD = 0.01;

const faviconResolvedCache = new Map(); // domainKey -> { url, cacheKey, cached }
const faviconInflightCache = new Map(); // domainKey -> Promise<{ url, cacheKey, cached }|null>
const faviconNegativeCache = new Map(); // domainKey -> lastFailureTimestamp (number)
const faviconWaiters = new Map(); // domainKey -> Array<(resolved|null) => void>
const faviconTaskQueue = [];
let faviconTaskActiveCount = 0;
let faviconIntersectionObserver = null;
const DEBUG_FAVICON = false;

function debugFavicon(event, details) {
  if (!DEBUG_FAVICON) return;
  if (details) {
    console.debug('[favicon]', event, details);
    return;
  }
  console.debug('[favicon]', event);
}

function setFaviconResolved(domainKey, url, options = {}) {
  if (!domainKey || !url) return;
  const entry = {
    url,
    cacheKey: options.cacheKey || null,
    cached: Boolean(options.cached)
  };
  faviconResolvedCache.set(domainKey, entry);
  if (faviconResolvedCache.size > FAVICON_RESOLVED_CACHE_LIMIT) {
    const oldestKey = faviconResolvedCache.keys().next().value;
    if (oldestKey) {
      faviconResolvedCache.delete(oldestKey);
    }
  }
}

function getFaviconResolvedEntry(domainKey) {
  if (!domainKey) return null;
  const entry = faviconResolvedCache.get(domainKey);
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { url: entry, cacheKey: null, cached: false };
  }
  return entry;
}

function getFaviconResolvedUrl(domainKey) {
  const entry = getFaviconResolvedEntry(domainKey);
  return entry && entry.url ? entry.url : null;
}

function notifyFaviconWaiters(domainKey, resolved) {
  const waiters = faviconWaiters.get(domainKey);
  if (waiters && waiters.length) {
    waiters.forEach((resolve) => resolve(resolved));
    faviconWaiters.delete(domainKey);
  }
  faviconInflightCache.delete(domainKey);
}

function runNextFaviconTask() {
  if (faviconTaskActiveCount >= MAX_CONCURRENT_FAVICON_TASKS) return;
  const next = faviconTaskQueue.shift();
  if (!next) return;
  faviconTaskActiveCount += 1;
  Promise.resolve()
    .then(next.task)
    .then(next.resolve)
    .catch(next.reject)
    .finally(() => {
      faviconTaskActiveCount -= 1;
      runNextFaviconTask();
    });
}

function enqueueFaviconTask(task) {
  return new Promise((resolve, reject) => {
    faviconTaskQueue.push({ task, resolve, reject });
    runNextFaviconTask();
  });
}

function getFaviconCache() {
  return caches.open(FAVICON_CACHE_NAME);
}

function cacheKeyFor(domainKey, size) {
  return `/favicons/${domainKey}@${size}`;
}

async function readIconFromCache(cacheKey) {
  if (!cacheKey || !('caches' in window)) return null;
  try {
    const cache = await getFaviconCache();
    const cached = await cache.match(cacheKey);
    return cached || null;
  } catch (err) {
    return null;
  }
}

async function writeIconToCache(cacheKey, response) {
  if (!cacheKey || !response || !response.ok) return false;
  try {
    const cache = await getFaviconCache();
    await cache.put(cacheKey, response);
    return true;
  } catch (err) {
    return false;
  }
}

async function responseToObjectURL(response) {
  if (!response) return '';
  try {
    const blob = await response.blob();
    if (!blob || !blob.size) return '';
    return URL.createObjectURL(blob);
  } catch (err) {
    return '';
  }
}

function xhrFetchBlob(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.timeout = timeoutMs;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response && xhr.response.size) {
          resolve(xhr.response);
          return;
        }
        resolve(null);
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.onabort = () => resolve(null);
      xhr.send();
    } catch (err) {
      resolve(null);
    }
  });
}

function blobToResponse(blob) {
  if (!blob) return new Response();
  const headers = new Headers();
  if (blob.type) {
    headers.set('Content-Type', blob.type);
  } else {
    headers.set('Content-Type', 'image/png');
  }
  return new Response(blob, { headers });
}

function setFaviconObjectUrlForImage(img, objectUrl) {
  if (!img || !objectUrl) return;
  const previous = img.dataset.faviconObjectUrl;
  if (previous && previous !== objectUrl) {
    URL.revokeObjectURL(previous);
  }
  img.dataset.faviconObjectUrl = objectUrl;
  img.src = objectUrl;
}

function revokeFaviconObjectUrl(img) {
  if (!img || !img.dataset) return;
  const previous = img.dataset.faviconObjectUrl;
  if (previous) {
    URL.revokeObjectURL(previous);
    delete img.dataset.faviconObjectUrl;
  }
}

function setFaviconImageSrc(img, url) {
  if (!img || !url) return;
  revokeFaviconObjectUrl(img);
  img.src = url;
}

function loadFaviconObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate) {
  return new Promise((resolve) => {
    if (!img || !objectUrl) {
      resolve({ accepted: false, aborted: false });
      return;
    }
    if (shouldAbort && shouldAbort()) {
      resolve({ accepted: false, aborted: true });
      return;
    }
    let settled = false;
    const finalize = (accepted, aborted) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve({ accepted, aborted });
    };
    img.onload = () => {
      if (shouldAbort && shouldAbort()) {
        finalize(false, true);
        return;
      }
      const accepted = typeof acceptCandidate === 'function' ? acceptCandidate(img) : true;
      finalize(accepted, false);
    };
    img.onerror = () => {
      if (shouldAbort && shouldAbort()) {
        finalize(false, true);
        return;
      }
      finalize(false, false);
    };
    setFaviconObjectUrlForImage(img, objectUrl);
    if (img.complete) {
      const accepted = img.naturalWidth > 0 && (typeof acceptCandidate === 'function' ? acceptCandidate(img) : true);
      finalize(accepted, false);
    }
  });
}

function testFaviconCandidateUrl(candidate, acceptCandidate) {
  return new Promise((resolve) => {
    const testImg = new Image();
    testImg.referrerPolicy = 'no-referrer';
    testImg.onload = () => {
      const accepted = typeof acceptCandidate === 'function' ? acceptCandidate(testImg) : true;
      resolve(accepted);
    };
    testImg.onerror = () => {
      resolve(false);
    };
    testImg.src = candidate;
  });
}

function testFaviconCandidateObjectUrl(objectUrl, acceptCandidate) {
  return new Promise((resolve) => {
    const testImg = new Image();
    testImg.onload = () => {
      const accepted = typeof acceptCandidate === 'function' ? acceptCandidate(testImg) : true;
      URL.revokeObjectURL(objectUrl);
      resolve(accepted);
    };
    testImg.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(false);
    };
    testImg.src = objectUrl;
  });
}

function getFaviconMetaStorageKey(domainKey) {
  return `${FAVICON_META_PREFIX}${domainKey}`;
}

async function getFaviconMeta(domainKey) {
  if (!domainKey || !browser || !browser.storage || !browser.storage.local) return null;
  try {
    const key = getFaviconMetaStorageKey(domainKey);
    const stored = await browser.storage.local.get(key);
    const meta = stored && stored[key];
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch (err) {
    return null;
  }
}

async function setFaviconMeta(domainKey, meta) {
  if (!domainKey || !meta || !browser || !browser.storage || !browser.storage.local) return;
  const payload = {
    cacheKey: meta.cacheKey || null,
    lastSeen: Number.isFinite(meta.lastSeen) ? meta.lastSeen : 0,
    failCount: Number.isFinite(meta.failCount) ? meta.failCount : 0,
    lastOkAt: Number.isFinite(meta.lastOkAt) ? meta.lastOkAt : 0
  };
  try {
    const key = getFaviconMetaStorageKey(domainKey);
    await browser.storage.local.set({ [key]: payload });
  } catch (err) {}
}

async function bumpFaviconFail(domainKey) {
  if (!domainKey) return null;
  const now = Date.now();
  const existing = await getFaviconMeta(domainKey);
  const nextMeta = {
    cacheKey: existing && existing.cacheKey ? existing.cacheKey : null,
    lastSeen: now,
    failCount: (existing && Number.isFinite(existing.failCount) ? existing.failCount : 0) + 1,
    lastOkAt: existing && Number.isFinite(existing.lastOkAt) ? existing.lastOkAt : 0
  };
  await setFaviconMeta(domainKey, nextMeta);
  return nextMeta;
}

function isFaviconMetaStale(meta) {
  if (!meta || !meta.lastOkAt) return false;
  return Date.now() - meta.lastOkAt > FAVICON_META_STALE_MS;
}

function shouldBlockFaviconMeta(meta) {
  if (!meta) return false;
  if (meta.failCount >= 3 && meta.lastSeen && Date.now() - meta.lastSeen < FAVICON_FAIL_RETRY_WINDOW_MS) {
    return true;
  }
  return false;
}

async function pruneFaviconMetaIfNeeded() {
  if (!browser || !browser.storage || !browser.storage.local) return;
  try {
    const stored = await browser.storage.local.get(null);
    const keys = Object.keys(stored || {}).filter((key) => key.startsWith(FAVICON_META_PREFIX));
    if (keys.length <= FAVICON_META_MAX_ENTRIES) return;
    const entries = keys
      .map((key) => {
        const meta = stored[key] || {};
        return {
          key,
          lastSeen: Number.isFinite(meta.lastSeen) ? meta.lastSeen : 0
        };
      })
      .sort((a, b) => a.lastSeen - b.lastSeen);
    const remove = entries.slice(0, keys.length - FAVICON_META_MAX_ENTRIES).map((entry) => entry.key);
    if (remove.length) {
      await browser.storage.local.remove(remove);
    }
  } catch (err) {}
}

function ensureFaviconObserver() {
  if (faviconIntersectionObserver || !('IntersectionObserver' in window)) return;
  const root = document.querySelector('.main-content');
  faviconIntersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (faviconIntersectionObserver) {
        faviconIntersectionObserver.unobserve(img);
      }
      const resolveTask = img._faviconResolve;
      if (resolveTask) {
        delete img._faviconResolve;
        resolveTask();
      }
    });
  }, {
    root: root || null,
    rootMargin: FAVICON_OBSERVER_ROOT_MARGIN,
    threshold: FAVICON_OBSERVER_THRESHOLD
  });
}

function queueFaviconResolution(img, resolveTask) {
  if (!img || typeof resolveTask !== 'function') return;
  const runTask = () => {
    try {
      const result = resolveTask();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (err) {}
  };
  ensureFaviconObserver();
  if (!faviconIntersectionObserver) {
    runTask();
    return;
  }
  img._faviconResolve = runTask;
  faviconIntersectionObserver.observe(img);
}

function isValidFaviconTargetUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol;
    const hostname = parsed.hostname || '';
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (!hostname || !hostname.includes('.')) return false;
    if (/\s/.test(hostname)) return false;
    if (hostname.endsWith('.')) return false;
    if (hostname === 'localhost') return false;
    return true;
  } catch (err) {
    return false;
  }
}

function getDomainKeyFromUrl(rawUrl) {
  if (!isValidFaviconTargetUrl(rawUrl)) return '';
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch (err) {
    return '';
  }
}

function buildFaviconCandidates(rawUrl) {
  if (!isValidFaviconTargetUrl(rawUrl)) return [];
  const parsed = new URL(rawUrl);
  const origin = parsed.origin;
  const gstaticV2 = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=${FAVICON_SIZE_PX}`;
  const googleS2 = `https://www.google.com/s2/favicons?sz=${FAVICON_SIZE_PX}&domain_url=${encodeURIComponent(origin)}`;
  return [gstaticV2, googleS2].filter(Boolean);
}

async function getFaviconUrlForRawUrl(rawUrl) {
  try {
    if (!isValidFaviconTargetUrl(rawUrl)) return null;
    const domainKey = getDomainKeyFromUrl(rawUrl);
    if (!domainKey) return null;
    const cached = getFaviconResolvedUrl(domainKey);
    if (cached) return cached;
    const lastFailedAt = faviconNegativeCache.get(domainKey);
    if (lastFailedAt) {
      if (Date.now() - lastFailedAt < FAVICON_NEGATIVE_TTL_MS) {
        return null;
      }
      faviconNegativeCache.delete(domainKey);
    }
    const meta = await getFaviconMeta(domainKey);
    if (shouldBlockFaviconMeta(meta)) {
      return null;
    }
    const inflight = faviconInflightCache.get(domainKey);
    if (inflight) {
      const resolved = await inflight;
      return resolved && resolved.url ? resolved.url : null;
    }
    const candidates = buildFaviconCandidates(rawUrl);
    return candidates[0] || null;
  } catch (err) {
    return null;
  }
}

let bookmarkMetadata = {};
let pendingBookmarkMeta = {};

let folderMetadata = {};

let pendingFolderMeta = {};

let galleryManifest = [];

let galleryActiveFilterValue = 'all';

let galleryActiveTag = null;

let gallerySection = 'gallery'; // gallery | favorites | my-wallpapers | settings (future)

const MY_WALLPAPERS_BATCH_SIZE = 24;

let galleryFavorites = new Set();

let currentWallpaperSelection = null;

let wallpaperTypePreference = null; // 'video' | 'static'
let wallpaperQualityPreference = 'low';
let dailyRotationPreference = true;
let initialWallpaperState = {};

let galleryVirtualState = {
  items: [],
  itemHeight: 235,
  itemWidth: 195,
  gap: 10,
  renderBuffer: 4,
  itemsPerRow: 1
};
let galleryVirtualScrollHandler = null;
let galleryVirtualResizeAttached = false;
let galleryNodePool = [];
let galleryPoolAttached = 0;

let timeFormatPreference = '12-hour';

let appBackgroundDimPreference = 0;

let appShowSidebarPreference = true;

let appShowWeatherPreference = true;

let appShowQuotePreference = true;

let appShowNewsPreference = false;

let appShowTodoPreference = true;

let widgetOrderPreference = DEFAULT_WIDGET_ORDER.slice();

let appNewsSourcePreference = 'aljazeera';

let appMaxTabsPreference = 0; // 0 means unlimited

  let appAutoClosePreference = 0; // 0 means never

  let appSingletonModePreference = false;

  let appSearchOpenNewTabPreference = false;

let appSearchRememberEnginePreference = true;

  let appSearchDefaultEnginePreference = 'google';

  let appSearchMathPreference = true;

  let appSearchShowHistoryPreference = false;

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

let appPerformanceModePreference = false;
let debugPerfOverlayPreference = false;

let appBatteryOptimizationPreference = false;

let appCinemaModePreference = false;

const galleryFooterButtons = document.querySelectorAll('.gallery-footer-btn');

const galleryEmptyState = document.getElementById('gallery-empty-state');

const gallerySettingsPanel = document.getElementById('gallery-settings-panel');

const galleryMyWallpapersPanel = document.getElementById('gallery-mywallpapers-panel');

const myWallpapersGrid = document.getElementById('mywallpapers-grid');

const myWallpapersEmptyCard = document.querySelector('.mywallpapers-empty-card');

const galleryFiltersContainer = document.querySelector('.gallery-filters');

const galleryActionsBar = document.querySelector('.gallery-actions');

const galleryHeaderTitle = document.getElementById('gallery-header-title');

const settingsPreviewVideo = document.getElementById('gallery-settings-preview-video');

const settingsPreviewImg = document.getElementById('gallery-settings-preview-img');

const settingsPreviewTitle = document.getElementById('gallery-settings-preview-title');

const settingsPreviewAuthor = document.getElementById('gallery-settings-preview-author');



function setNextWallpaperButtonLoading(isLoading) {

  if (!nextWallpaperBtn) return;

  nextWallpaperBtn.disabled = isLoading;

  nextWallpaperBtn.classList.toggle('is-loading', isLoading);

  const tooltip = nextWallpaperBtn.querySelector('.tooltip-popup');

  if (tooltip) {

    tooltip.textContent = isLoading ? NEXT_WALLPAPER_TOOLTIP_LOADING : NEXT_WALLPAPER_TOOLTIP_DEFAULT;

  }

}



function waitForWallpaperReady(selection, type = 'video') {

  return new Promise((resolve) => {

    if (isPerformanceModeEnabled()) return resolve();

    if (!selection) return resolve();

    const finalType = type === 'static' ? 'static' : 'video';

    if (finalType === 'static' || !selection.videoUrl) {

      return resolve();

    }

    const videos = Array.from(document.querySelectorAll('.background-video'));

    if (!videos.length) return resolve();



    const activeVideo = videos.find(v => v.classList.contains('is-active')) || videos[0];

    if (!activeVideo) return resolve();



    let done = false;

    const cleanup = () => {

      if (done) return;

      done = true;

      activeVideo.removeEventListener('playing', onPlaying);

      activeVideo.removeEventListener('canplay', onCanPlay);

      activeVideo.removeEventListener('error', onError);

      clearTimeout(timeoutId);

      resolve();

    };

    const onPlaying = () => cleanup();

    const onCanPlay = () => cleanup();

    const onError = () => cleanup();

    const timeoutId = setTimeout(cleanup, 8000);



    activeVideo.addEventListener('playing', onPlaying);

    activeVideo.addEventListener('canplay', onCanPlay);

    activeVideo.addEventListener('error', onError);

  });

}



// ===============================================

// --- NEW: ADD BOOKMARK MODAL ELEMENTS ---

// ===============================================

let addBookmarkModal;

let addBookmarkDialog;

let bookmarkNameInput;

let bookmarkUrlInput;

let bookmarkSaveBtn;

let bookmarkCancelBtn;

let bookmarkCloseBtn;

let bookmarkIconPreview;

let bookmarkUploadBtn;

let bookmarkGetBtn;

let bookmarkClearBtn;

let bookmarkFileInput;

let bookmarkModalTitle;

let bookmarkModalMode = 'add';

let bookmarkModalEditingId = null;

let bookmarkPreviewDebounceTimer = null;

let lastPreviewDomain = '';

let bookmarkModalEscBound = false;

let bookmarkModalBound = false;

let bookmarkPressStartedOnOverlay = false;

let bookmarkUrlErrorEl;

let bookmarkDomainIconPrompt;

let bookmarkDomainIconUseBtn;

let bookmarkDomainIconIgnoreBtn;

let bookmarkDomainIconPromptHideTimeout = null;

let bookmarkDomainIconPromptDismissToken = 0;

let domainIconMap = {};

let domainIconSuggestionDismissedForDomain = new Set();

let userExplicitlySetIconThisSession = false;

let lastUsedBookmarkFolderId = null;

let bookmarkGetAbortController = null;



// ===============================================

// --- NEW: ADD FOLDER MODAL ELEMENTS ---

// ===============================================

let addFolderModal;

let addFolderDialog;

let folderNameInput;

let folderSaveBtn;

let folderCancelBtn;



// ===============================================

// --- EDIT FOLDER MODAL ELEMENTS ---

// ===============================================

let editFolderModal;

let editFolderDialog;

let editFolderNameInput;

let editFolderSaveBtn;

let editFolderCancelBtn;

let editFolderCloseBtn;

let editFolderIconPrompt;

let editFolderIconPromptText;

let editFolderIconUseBtn;

let editFolderIconIgnoreBtn;

let editFolderTargetId = null;

let editFolderEscBound = false;



// ===============================================

// --- MOVE BOOKMARK MODAL ELEMENTS ---

// ===============================================

let moveBookmarkModal;

let moveBookmarkDialog;

let moveDialogTitle;

let moveFolderDropdown;

let moveFolderDropdownBtn;

let moveFolderDropdownMenu;

let moveFolderSelectedLabel;

let moveFolderSaveBtn;

let moveFolderCancelBtn;

let moveFolderCloseBtn;

let moveModalState = {

  targetId: null,

  isFolder: false,

  originParentId: null,

  blockedIds: new Set(),

  selectedFolderId: null,

};



// --- HELPER: ANIMATED MODALS ---

function openModalWithAnimation(modalId, triggerSource, dialogSelector) {
  const modal = document.getElementById(modalId);
  const dialog = modal ? modal.querySelector(dialogSelector) : null;
  if (!modal || !dialog) return;

  // Ensure the overlay is visible for the animation
  modal.style.display = 'flex';

  // Identify trigger element (string id or DOM element)
  let btn = null;
  if (typeof triggerSource === 'string') {
    btn = document.getElementById(triggerSource);
  } else if (triggerSource instanceof Element) {
    btn = triggerSource;
  }

  // Calculate transform origin
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const btnCenterX = btnRect.left + (btnRect.width / 2);
    const btnCenterY = btnRect.top + (btnRect.height / 2);
    const originX = btnCenterX - viewportCenterX;
    const originY = btnCenterY - viewportCenterY;
    dialog.style.transformOrigin = `calc(50% + ${originX}px) calc(50% + ${originY}px)`;
  } else {
    dialog.style.transformOrigin = 'center center';
  }

  modal.classList.remove('hidden', 'closing');
  document.body.classList.add('modal-open');

  const input = dialog.querySelector('input[type=\"text\"]');
  if (input) setTimeout(() => input.focus(), 50);
}

function closeModalWithAnimation(modalId, dialogSelector, onCleanup) {
  const modal = document.getElementById(modalId);
  const dialog = modal ? modal.querySelector(dialogSelector) : null;

  if (!modal || modal.classList.contains('hidden')) return;

  modal.classList.add('closing');

  const onAnimEnd = () => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
      document.body.classList.remove('modal-open');
    }
    if (onCleanup) onCleanup();
    if (dialog) {
      dialog.removeEventListener('animationend', onAnimEnd);
      dialog.removeEventListener('animationcancel', onAnimEnd);
    }
  };

  if (dialog) {
    const styles = window.getComputedStyle(dialog);
    const animationName = styles.animationName || '';
    const animationDuration = parseFloat(styles.animationDuration) || 0;
    const animationDelay = parseFloat(styles.animationDelay) || 0;

    if (!animationName || animationName === 'none' || animationDuration + animationDelay === 0) {
      onAnimEnd();
      return;
    }

    dialog.addEventListener('animationend', onAnimEnd, { once: true });
    dialog.addEventListener('animationcancel', onAnimEnd, { once: true });
  } else {
    onAnimEnd();
  }
}



// ===============================================

// --- NEW: ADD BOOKMARK MODAL FUNCTIONS ---

// ===============================================



/**

 * Shows the "Add Bookmark" modal.

 * (MODIFIED: This version leaves the fields empty)

 */

async function showAddBookmarkModal() {

  if (!activeHomebaseFolderId) {

    alert('Please select a bookmark folder first.');

    return;

  }



  resetBookmarkModalState();

  pendingBookmarkMeta = {};

  updateBookmarkModalPreview();

  

  // 1. Clear inputs

  bookmarkNameInput.value = '';

  bookmarkUrlInput.value = ''; // This will show the "https://..." placeholder

  

  // 2. Show the modal

  openModalWithAnimation('add-bookmark-modal', 'quick-add-bookmark', '.dialog-content');

}



/**

 * Hides the "Add Bookmark" modal and clears inputs.

 */

function hideAddBookmarkModal() {

  dismissDomainIconPrompt();

  closeModalWithAnimation('add-bookmark-modal', '.dialog-content', () => {
    bookmarkNameInput.value = '';
    bookmarkUrlInput.value = '';
    resetBookmarkModalState();
  });

}



function setBookmarkModalMode(mode) {

  bookmarkModalMode = mode;

  if (!bookmarkModalTitle || !bookmarkSaveBtn) {

    return;

  }

  if (mode === 'edit') {

    bookmarkModalTitle.textContent = 'Edit Bookmark';

    bookmarkSaveBtn.textContent = 'Save';

  } else {

    bookmarkModalTitle.textContent = 'Add Bookmark';

    bookmarkSaveBtn.textContent = 'Save';

  }

}



function resetBookmarkModalState() {

  bookmarkModalEditingId = null;

  pendingBookmarkMeta = {};

  domainIconSuggestionDismissedForDomain = new Set();

  userExplicitlySetIconThisSession = false;

  if (bookmarkGetAbortController) {
    bookmarkGetAbortController.abort();
    bookmarkGetAbortController = null;
  }

  if (bookmarkDomainIconPromptHideTimeout) {
    clearTimeout(bookmarkDomainIconPromptHideTimeout);
    bookmarkDomainIconPromptHideTimeout = null;
  }

  bookmarkDomainIconPromptDismissToken++;

  setBookmarkModalBusy(false);

  if (bookmarkPreviewDebounceTimer) {
    clearTimeout(bookmarkPreviewDebounceTimer);
    bookmarkPreviewDebounceTimer = null;
  }

  lastPreviewDomain = '';

  if (bookmarkDomainIconPrompt) {
    bookmarkDomainIconPrompt.classList.add('hidden');
    bookmarkDomainIconPrompt.classList.remove('is-visible');
    bookmarkDomainIconPrompt.removeAttribute('data-domain');
    bookmarkDomainIconPrompt.style.left = '';
    bookmarkDomainIconPrompt.style.top = '';
    bookmarkDomainIconPrompt.style.visibility = '';
  }

  if (bookmarkUrlErrorEl) {
    bookmarkUrlErrorEl.textContent = '';
  }

  setBookmarkModalMode('add');

  updateBookmarkModalPreview();

  validateBookmarkModalInputs();

}



/**

 * Opens the bookmark modal with the selected bookmark details for editing.

 */

function showEditBookmarkModal(bookmarkId) {

  if (!bookmarkTree || !bookmarkTree[0]) {

    return;

  }

  const bookmarkNode = findBookmarkNodeById(bookmarkTree[0], bookmarkId);

  if (!bookmarkNode || !bookmarkNode.url) {

    alert('Unable to edit this bookmark.');

    return;

  }



  bookmarkModalEditingId = bookmarkId;

  setBookmarkModalMode('edit');

  domainIconSuggestionDismissedForDomain = new Set();

  bookmarkNameInput.value = bookmarkNode.title || '';

  bookmarkUrlInput.value = bookmarkNode.url || '';

  pendingBookmarkMeta = { ...(bookmarkMetadata[bookmarkId] || {}) };

  userExplicitlySetIconThisSession = Boolean(pendingBookmarkMeta.icon);

  updateBookmarkModalPreview();
  validateBookmarkModalInputs();



  openModalWithAnimation('add-bookmark-modal', null, '.dialog-content');

  bookmarkNameInput.focus();

  bookmarkNameInput.select();

}



/**

 * Saves the new bookmark from the modal inputs.

 * (Optimized to patch the bookmark tree in place)

 */

async function handleBookmarkModalSave() {

  const name = bookmarkNameInput.value.trim();

  let url = bookmarkUrlInput.value.trim();

  if (!validateBookmarkModalInputs()) {
    return;
  }

  

  // 2. Simple URL correction (add https:// if no protocol)

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url);
  if (!hasScheme) {
    url = 'https://' + url;
  }



  if (bookmarkModalMode === 'edit' && bookmarkModalEditingId) {

    try {

      await browser.bookmarks.update(bookmarkModalEditingId, {

        title: name,

        url: url

      });

      if (pendingBookmarkMeta.icon) {
        bookmarkMetadata[bookmarkModalEditingId] = { ...pendingBookmarkMeta, iconCleared: false };
      } else if (pendingBookmarkMeta.iconCleared === true) {
        bookmarkMetadata[bookmarkModalEditingId] = { iconCleared: true };
      } else {
        delete bookmarkMetadata[bookmarkModalEditingId];
      }

      await browser.storage.local.set({ [BOOKMARK_META_KEY]: bookmarkMetadata });
      // Patch the existing tree to avoid a full reload.
      let treePatched = false;
      if (bookmarkTree && bookmarkTree[0]) {
        treePatched = Boolean(updateNodeInTree(bookmarkTree[0], bookmarkModalEditingId, {
          title: name,
          url: url
        }));
      }
      if (!treePatched) {
        await getBookmarkTree(true); // Fallback if the node could not be patched
      }



      let folderToRender = null;

      if (currentGridFolderNode) {

        folderToRender = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

      }

      if (!folderToRender && activeHomebaseFolderId) {

        folderToRender = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);

      }



      if (folderToRender) {

        renderBookmarkGrid(folderToRender);

      } else {

        loadBookmarks(activeHomebaseFolderId);

      }



      hideAddBookmarkModal();

    } catch (err) {

      console.error("Error updating bookmark:", err);

      alert("Error: Could not update bookmark. Check the URL is valid.");

    }

    return;

  }



  const targetParentId = getDefaultBookmarkParentId();
  if (!targetParentId) {
    alert("Error: No active bookmark folder selected.");
    return;
  }



  // 4. Create the bookmark

  try {

      const created = await browser.bookmarks.create({

        parentId: targetParentId,

        title: name,

        url: url

      });

      if (created && created.id) {
        if (pendingBookmarkMeta.icon) {
          bookmarkMetadata[created.id] = { ...pendingBookmarkMeta, iconCleared: false };
        } else if (pendingBookmarkMeta.iconCleared === true) {
          bookmarkMetadata[created.id] = { iconCleared: true };
        }
        if (bookmarkMetadata[created.id]) {
          await browser.storage.local.set({ [BOOKMARK_META_KEY]: bookmarkMetadata });
        }
      }

      // Patch the existing tree so the UI can update immediately.
      let treePatched = false;
      if (bookmarkTree && bookmarkTree[0] && created) {
        treePatched = Boolean(appendNodeToParent(bookmarkTree[0], targetParentId, { ...created }));
      }
      if (!treePatched) {
        await getBookmarkTree(true); // Fallback if the append failed
      }

      setLastUsedFolderId(targetParentId);



    // Re-find the active folder node from the updated tree

    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], targetParentId);

    

    // 7. Re-render the grid with the updated folder

    if (activeFolderNode) {

      renderBookmarkGrid(activeFolderNode);

    } else {

      loadBookmarks(activeHomebaseFolderId);

    }

    

    hideAddBookmarkModal();

    

  } catch (err) {

    console.error("Error creating bookmark:", err);

    alert("Error: Could not save bookmark. Check the URL is valid.");

  }

}



/**

 * NEW: Sets up all event listeners for the bookmark modal

 */

function setupBookmarkModal() {

  // 1. Assign global variables to DOM elements

  addBookmarkModal = document.getElementById('add-bookmark-modal');

  addBookmarkDialog = document.getElementById('add-bookmark-dialog');

  bookmarkNameInput = document.getElementById('bookmark-name-input');

  bookmarkUrlInput = document.getElementById('bookmark-url-input');

  bookmarkSaveBtn = document.getElementById('bookmark-save-btn');

  bookmarkCancelBtn = document.getElementById('bookmark-cancel-btn');

  bookmarkCloseBtn = document.getElementById('bookmark-close-btn');

  bookmarkIconPreview = document.getElementById('bookmark-icon-preview');

  bookmarkUploadBtn = document.getElementById('bookmark-upload-btn');

  bookmarkGetBtn = document.getElementById('bookmark-get-btn');

  bookmarkClearBtn = document.getElementById('bookmark-clear-btn');

  bookmarkFileInput = document.getElementById('bookmark-file-input');

  bookmarkModalTitle = addBookmarkDialog.querySelector('h3');

  bookmarkUrlErrorEl = document.getElementById('bookmark-url-error');

  bookmarkDomainIconPrompt = document.getElementById('bookmark-domain-icon-prompt');

  bookmarkDomainIconUseBtn = document.getElementById('bookmark-domain-icon-use');

  bookmarkDomainIconIgnoreBtn = document.getElementById('bookmark-domain-icon-ignore');

  if (bookmarkDomainIconPrompt && bookmarkDomainIconPrompt.parentElement !== document.body) {

    document.body.appendChild(bookmarkDomainIconPrompt);

  }

  resetBookmarkModalState();

  if (bookmarkModalBound) {
    updateBookmarkModalPreview();
    validateBookmarkModalInputs();
    return;
  }



  // 2. Attach button listeners

  bookmarkSaveBtn.addEventListener('click', handleBookmarkModalSave);

  bookmarkCancelBtn.addEventListener('click', hideAddBookmarkModal);

  if (bookmarkCloseBtn) {

    bookmarkCloseBtn.addEventListener('click', hideAddBookmarkModal);

  }

  if (bookmarkUploadBtn && bookmarkFileInput) {

    bookmarkUploadBtn.addEventListener('click', () => bookmarkFileInput.click());

  }

  if (bookmarkClearBtn) {

    bookmarkClearBtn.addEventListener('click', handleBookmarkClearIcon);

  }

  if (bookmarkGetBtn) {

    bookmarkGetBtn.addEventListener('click', handleBookmarkGetIcon);

  }

  if (bookmarkFileInput) {

    bookmarkFileInput.addEventListener('change', (e) => {

      const file = e.target.files && e.target.files[0];

      if (file) handleBookmarkIconUpload(file);

      bookmarkFileInput.value = '';

    });

  }

  if (bookmarkDomainIconUseBtn) {
    bookmarkDomainIconUseBtn.addEventListener('click', () => {
      const domain = bookmarkDomainIconPrompt?.dataset?.domain || getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
      applyStoredIconForDomain(domain);
    });
  }

  if (bookmarkDomainIconIgnoreBtn) {
    bookmarkDomainIconIgnoreBtn.addEventListener('click', () => {
      const domain = bookmarkDomainIconPrompt?.dataset?.domain || getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
      dismissDomainIconPrompt(domain);
    });
  }



  // 3. Click background overlay to close
  addBookmarkModal.addEventListener('pointerdown', (e) => {
    bookmarkPressStartedOnOverlay = e.target === addBookmarkModal;
  }, true);

  addBookmarkModal.addEventListener('click', (e) => {
    if (e.target === addBookmarkModal && bookmarkPressStartedOnOverlay) {
      hideAddBookmarkModal();
    }

    bookmarkPressStartedOnOverlay = false;
  });



  // 4. Listen for "Enter" key in input fields

  bookmarkNameInput.addEventListener('keydown', (e) => {

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!bookmarkSaveBtn.disabled) {
        handleBookmarkModalSave();
      }

    } else if (e.key === 'Escape') {

      hideAddBookmarkModal();

    }

  });

  bookmarkNameInput.addEventListener('input', () => {
    validateBookmarkModalInputs();
  });



  bookmarkUrlInput.addEventListener('keydown', (e) => {

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!bookmarkSaveBtn.disabled) {
        handleBookmarkModalSave();
      }

    } else if (e.key === 'Escape') {

      hideAddBookmarkModal();

    }

  });



  if (bookmarkUrlInput) {

    bookmarkUrlInput.addEventListener('input', () => {

      if (!pendingBookmarkMeta.icon) {

        scheduleBookmarkPreviewUpdate();

      }
      validateBookmarkModalInputs();

    });

  }



  // 5. Listen for "Escape" key globally when modal is open
  if (!bookmarkModalEscBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && addBookmarkModal && !addBookmarkModal.classList.contains('hidden')) {
        hideAddBookmarkModal();
      }
    });
    bookmarkModalEscBound = true;
  }

  window.addEventListener('resize', () => {
    if (bookmarkDomainIconPrompt && !bookmarkDomainIconPrompt.classList.contains('hidden') && addBookmarkModal && !addBookmarkModal.classList.contains('hidden')) {
      positionBookmarkDomainIconPrompt();
    }
  });

  const bookmarkDialogContent = addBookmarkModal?.querySelector('.dialog-content');
  if (bookmarkDialogContent && !bookmarkDialogContent.dataset.promptPosBound) {
    bookmarkDialogContent.dataset.promptPosBound = '1';
    const repositionIfNeeded = () => {
      if (
        bookmarkDomainIconPrompt &&
        !bookmarkDomainIconPrompt.classList.contains('hidden') &&
        addBookmarkModal &&
        !addBookmarkModal.classList.contains('hidden')
      ) {
        positionBookmarkDomainIconPrompt();
      }
    };
    bookmarkDialogContent.addEventListener('animationend', repositionIfNeeded);
    bookmarkDialogContent.addEventListener('animationcancel', repositionIfNeeded);
  }



  updateBookmarkModalPreview();
  validateBookmarkModalInputs();

  bookmarkModalBound = true;

}



function getDomainFromUrl(str) {
  if (!str) return '';
  try {
    const trimmed = str.trim();
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const preparedUrl = hasScheme ? trimmed : `https://${trimmed}`;
    return new URL(preparedUrl).hostname || '';
  } catch (e) {
    return '';
  }
}

function positionBookmarkDomainIconPrompt() {
  if (!bookmarkDomainIconPrompt || !addBookmarkDialog) return;

  const wasHidden = bookmarkDomainIconPrompt.classList.contains('hidden');
  const previousDisplay = bookmarkDomainIconPrompt.style.display;
  const previousVisibility = bookmarkDomainIconPrompt.style.visibility;

  if (wasHidden) {
    bookmarkDomainIconPrompt.style.visibility = 'hidden';
    bookmarkDomainIconPrompt.style.display = 'flex';
  }

  const dialogRect = addBookmarkDialog.getBoundingClientRect();
  const promptRect = bookmarkDomainIconPrompt.getBoundingClientRect();

  let centerX = dialogRect.left + dialogRect.width / 2;
  const minX = 12;
  const maxX = window.innerWidth - 12;
  centerX = Math.min(Math.max(centerX, minX), maxX);

  const promptHeight = promptRect.height || 0;
  const transformOffset = bookmarkDomainIconPrompt.classList.contains('is-visible') ? 12 : -8;
  const desiredGap = 10;
  const viewportPadding = 8;
  const viewportBottom = window.innerHeight - viewportPadding;

  let top = dialogRect.bottom + desiredGap - transformOffset;
  if (top + promptHeight > viewportBottom) {
    top = dialogRect.top - promptHeight - desiredGap - transformOffset;
  }

  if (top < viewportPadding) {
    top = viewportPadding;
  }
  if (top + promptHeight > viewportBottom) {
    top = Math.max(viewportPadding, viewportBottom - promptHeight);
  }

  bookmarkDomainIconPrompt.style.left = `${centerX}px`;
  bookmarkDomainIconPrompt.style.top = `${top}px`;

  if (wasHidden) {
    bookmarkDomainIconPrompt.style.display = previousDisplay || '';
    bookmarkDomainIconPrompt.style.visibility = previousVisibility || '';
  } else {
    bookmarkDomainIconPrompt.style.visibility = previousVisibility || '';
  }
}

function setBookmarkModalBusy(isBusy) {
  if (!bookmarkGetBtn) return;
  bookmarkGetBtn.disabled = isBusy;
  bookmarkGetBtn.classList.toggle('loading', isBusy);
  bookmarkGetBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function renderBookmarkFallbackPreview(letter) {
  if (!bookmarkIconPreview) return;
  bookmarkIconPreview.innerHTML = '';
  bookmarkIconPreview.textContent = letter || '?';
  bookmarkIconPreview.style.backgroundColor = appBookmarkFallbackColorPreference || '#00b8d4';
  bookmarkIconPreview.style.color = '#fff';
  bookmarkIconPreview.style.fontSize = '18px';
}

function dismissDomainIconPrompt(domain) {
  if (domain) {
    domainIconSuggestionDismissedForDomain.add(domain);
  }
  if (bookmarkDomainIconPrompt) {
    const currentToken = ++bookmarkDomainIconPromptDismissToken;
    if (bookmarkDomainIconPromptHideTimeout) {
      clearTimeout(bookmarkDomainIconPromptHideTimeout);
      bookmarkDomainIconPromptHideTimeout = null;
    }
    bookmarkDomainIconPrompt.classList.remove('is-visible');
    const promptEl = bookmarkDomainIconPrompt;
    let hidden = false;
    const hidePrompt = () => {
      if (currentToken !== bookmarkDomainIconPromptDismissToken) return;
      if (hidden) return;
      hidden = true;
      if (bookmarkDomainIconPromptHideTimeout) {
        clearTimeout(bookmarkDomainIconPromptHideTimeout);
        bookmarkDomainIconPromptHideTimeout = null;
      }
      promptEl.classList.add('hidden');
      promptEl.classList.remove('is-visible');
      promptEl.removeAttribute('data-domain');
      promptEl.style.left = '';
      promptEl.style.top = '';
      promptEl.style.visibility = '';
    };
    promptEl.addEventListener('transitionend', hidePrompt, { once: true });
    bookmarkDomainIconPromptHideTimeout = setTimeout(() => {
      bookmarkDomainIconPromptHideTimeout = null;
      hidePrompt();
    }, 220);
  }
}

function applyStoredIconForDomain(domain) {
  if (!domain) return;
  const storedIcon = getStoredIconForDomain(domain);
  if (!storedIcon) return;
  pendingBookmarkMeta.icon = storedIcon;
  userExplicitlySetIconThisSession = true;
  lastPreviewDomain = '';
  if (bookmarkDomainIconPrompt) {
    if (bookmarkDomainIconPromptHideTimeout) {
      clearTimeout(bookmarkDomainIconPromptHideTimeout);
      bookmarkDomainIconPromptHideTimeout = null;
    }
    bookmarkDomainIconPrompt.classList.remove('is-visible');
    bookmarkDomainIconPrompt.classList.add('hidden');
    bookmarkDomainIconPrompt.removeAttribute('data-domain');
    bookmarkDomainIconPrompt.style.left = '';
    bookmarkDomainIconPrompt.style.top = '';
    bookmarkDomainIconPrompt.style.visibility = '';
  }
  updateBookmarkModalPreview();
  validateBookmarkModalInputs();
}

function maybeShowDomainIconPrompt(domain, hasValidUrl) {
  if (!bookmarkDomainIconPrompt) return;
  if (bookmarkDomainIconPromptHideTimeout) {
    clearTimeout(bookmarkDomainIconPromptHideTimeout);
    bookmarkDomainIconPromptHideTimeout = null;
  }
  bookmarkDomainIconPromptDismissToken++;
  if (!domain || !hasValidUrl || userExplicitlySetIconThisSession) {
    dismissDomainIconPrompt();
    return;
  }
  const storedIcon = getStoredIconForDomain(domain);
  if (!storedIcon || domainIconSuggestionDismissedForDomain.has(domain)) {
    dismissDomainIconPrompt();
    return;
  }
  const alreadyVisibleForDomain = bookmarkDomainIconPrompt.dataset.domain === domain && !bookmarkDomainIconPrompt.classList.contains('hidden');
  bookmarkDomainIconPrompt.dataset.domain = domain;
  if (alreadyVisibleForDomain) {
    positionBookmarkDomainIconPrompt();
    bookmarkDomainIconPrompt.classList.add('is-visible');
    return;
  }
  bookmarkDomainIconPrompt.classList.remove('hidden');
  bookmarkDomainIconPrompt.classList.remove('is-visible');
  bookmarkDomainIconPrompt.style.visibility = 'hidden';
  const dialogContent = addBookmarkModal ? addBookmarkModal.querySelector('.dialog-content') : null;
  const finalizePromptShow = () => {
    if (!bookmarkDomainIconPrompt || bookmarkDomainIconPrompt.classList.contains('hidden')) return;
    positionBookmarkDomainIconPrompt();
    bookmarkDomainIconPrompt.style.visibility = '';
    requestAnimationFrame(() => {
      if (!bookmarkDomainIconPrompt || bookmarkDomainIconPrompt.classList.contains('hidden')) return;
      positionBookmarkDomainIconPrompt();
      bookmarkDomainIconPrompt.classList.add('is-visible');
    });
  };
  if (dialogContent) {
    const handler = () => {
      dialogContent.removeEventListener('animationend', handler);
      dialogContent.removeEventListener('animationcancel', handler);
      finalizePromptShow();
    };
    dialogContent.addEventListener('animationend', handler);
    dialogContent.addEventListener('animationcancel', handler);
  } else {
    finalizePromptShow();
  }
}

function validateBookmarkModalInputs() {
  if (!bookmarkSaveBtn || !bookmarkUrlInput || !bookmarkNameInput) return true;
  const nameVal = (bookmarkNameInput.value || '').trim();
  const urlVal = (bookmarkUrlInput.value || '').trim();
  let errorMsg = '';
  let domain = '';
  let hasValidUrl = false;

  if (!urlVal) {
    errorMsg = 'URL is required';
  } else {
    domain = getDomainFromUrl(urlVal);
    if (!domain) {
      errorMsg = 'Enter a valid URL';
    } else {
      try {
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
        const preparedUrl = hasScheme ? urlVal : `https://${urlVal}`;
        new URL(preparedUrl);
        hasValidUrl = true;
      } catch (e) {
        errorMsg = 'Enter a valid URL';
      }
    }
  }

  maybeShowDomainIconPrompt(domain, hasValidUrl);

  if (bookmarkUrlErrorEl) {
    bookmarkUrlErrorEl.textContent = errorMsg;
  }

  const isValid = Boolean(nameVal) && hasValidUrl;
  bookmarkSaveBtn.disabled = !isValid;
  return isValid;
}

function scheduleBookmarkPreviewUpdate() {
  if (bookmarkPreviewDebounceTimer) {
    clearTimeout(bookmarkPreviewDebounceTimer);
  }
  bookmarkPreviewDebounceTimer = setTimeout(() => {
    bookmarkPreviewDebounceTimer = null;
    updateBookmarkModalPreview();
  }, 200);
}

function updateBookmarkModalPreview() {

  if (!bookmarkIconPreview) return;

  const urlVal = (bookmarkUrlInput && bookmarkUrlInput.value || '').trim();
  const hasCustomIcon = Boolean(pendingBookmarkMeta.icon);
  const isCleared = pendingBookmarkMeta.iconCleared === true;

  if (hasCustomIcon) {
    bookmarkIconPreview.innerHTML = '';
    bookmarkIconPreview.textContent = '';
    bookmarkIconPreview.style.color = '';
    bookmarkIconPreview.style.fontSize = '';
    bookmarkIconPreview.style.backgroundColor = '';

    const img = document.createElement('img');
    img.src = pendingBookmarkMeta.icon;
    bookmarkIconPreview.appendChild(img);
    lastPreviewDomain = '';
    return;
  }

  if (isCleared) {
    const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '★';
    renderBookmarkFallbackPreview(letter);
    lastPreviewDomain = '';
    return;
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
  const preparedUrl = hasScheme ? urlVal : (urlVal ? `https://${urlVal}` : '');
  const domainKey = getDomainKeyFromUrl(preparedUrl);

  if (domainKey) {
    const existingImg = bookmarkIconPreview.querySelector('img');
    let imgEl = existingImg;

    if (!imgEl) {
      bookmarkIconPreview.innerHTML = '';
      bookmarkIconPreview.textContent = '';
      bookmarkIconPreview.style.color = '';
      bookmarkIconPreview.style.fontSize = '';
      bookmarkIconPreview.style.backgroundColor = '';

      imgEl = document.createElement('img');
      bookmarkIconPreview.appendChild(imgEl);
    } else {
      bookmarkIconPreview.textContent = '';
      bookmarkIconPreview.style.color = '';
      bookmarkIconPreview.style.fontSize = '';
      bookmarkIconPreview.style.backgroundColor = '';
    }

    lastPreviewDomain = domainKey;
    getFaviconUrlForRawUrl(preparedUrl)
      .then((resolvedUrl) => {
        if (lastPreviewDomain !== domainKey) return;
        if (!resolvedUrl) {
          lastPreviewDomain = '';
          bookmarkIconPreview.innerHTML = '';
          const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '?';
          renderBookmarkFallbackPreview(letter);
          return;
        }
        if (imgEl && imgEl.src !== resolvedUrl) {
          imgEl.src = resolvedUrl;
        }
      })
      .catch(() => {});
    return;
  }

  lastPreviewDomain = '';
  bookmarkIconPreview.innerHTML = '';

  const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '?';
  renderBookmarkFallbackPreview(letter);

}



function handleBookmarkIconUpload(file) {

  const reader = new FileReader();

  reader.onload = (e) => {

    const img = new Image();

    img.onload = () => {

      const canvas = document.createElement('canvas');

      const MAX_SIZE = 128;

      const sourceWidth = img.width;

      const sourceHeight = img.height;

      const side = Math.min(sourceWidth, sourceHeight);

      const sx = Math.floor((sourceWidth - side) / 2);

      const sy = Math.floor((sourceHeight - side) / 2);

      canvas.width = MAX_SIZE;

      canvas.height = MAX_SIZE;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.warn('[icon-upload] no 2d context');
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_SIZE, MAX_SIZE);

      delete pendingBookmarkMeta.iconCleared;
      pendingBookmarkMeta.icon = canvas.toDataURL('image/webp', 0.85);
      userExplicitlySetIconThisSession = true;

      const domain = getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
      if (domain) {
        storeIconForDomain(domain, pendingBookmarkMeta.icon);
      }

      updateBookmarkModalPreview();
      validateBookmarkModalInputs();

    };

    img.src = e.target.result;

  };

  reader.readAsDataURL(file);

}



function handleBookmarkClearIcon() {

  delete pendingBookmarkMeta.icon;

  pendingBookmarkMeta.iconCleared = true;

  userExplicitlySetIconThisSession = false;

  updateBookmarkModalPreview();
  validateBookmarkModalInputs();

}



async function handleBookmarkGetIcon() {

  const urlVal = (bookmarkUrlInput && bookmarkUrlInput.value || '').trim();

  if (bookmarkGetAbortController) {
    bookmarkGetAbortController.abort();
    bookmarkGetAbortController = null;
  }

  if (!urlVal) {
    validateBookmarkModalInputs();
    return;
  }



  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
  const preparedUrl = hasScheme ? urlVal : (urlVal ? `https://${urlVal}` : '');
  const domain = getDomainKeyFromUrl(preparedUrl);
  if (!domain) {
    validateBookmarkModalInputs();
    return;
  }

  setBookmarkModalBusy(true);

  const controller = new AbortController();
  bookmarkGetAbortController = controller;


  try {
    const resolvedUrl = await getFaviconUrlForRawUrl(preparedUrl);
    if (!resolvedUrl) {
      throw new Error('Icon resolve failed');
    }
    if (controller.signal.aborted) {
      return;
    }
    delete pendingBookmarkMeta.iconCleared;
    pendingBookmarkMeta.icon = resolvedUrl;

    userExplicitlySetIconThisSession = true;

    storeIconForDomain(domain, resolvedUrl);

    updateBookmarkModalPreview();
    validateBookmarkModalInputs();

  } catch (err) {

    if (controller.signal.aborted) {
      return;
    }

    console.warn("Failed to fetch icon", err);

    alert("Could not fetch icon from site.");

  } finally {

    if (bookmarkGetAbortController === controller) {
      bookmarkGetAbortController = null;
    }

    setBookmarkModalBusy(false);

  }

}



// ===============================================

// --- NEW: ADD FOLDER MODAL FUNCTIONS ---

// ===============================================



/**

 * Shows the "Add Folder" modal.

 */

async function showAddFolderModal() {

  if (!activeHomebaseFolderId) {

    alert('Please select a bookmark folder first.');

    return;

  }

  

  // 1. Clear input

  folderNameInput.value = '';

  

  // 2. Show the modal

  openModalWithAnimation('add-folder-modal', 'quick-add-folder', '.dialog-content');

}



/**

 * Hides the "Add Folder" modal and clears inputs.

 */

function hideAddFolderModal() {

  closeModalWithAnimation('add-folder-modal', '.dialog-content', () => {
    folderNameInput.value = '';
  });

}



/**

 * Saves the new folder from the modal inputs.

 */

async function saveNewFolder() {

  const name = folderNameInput.value.trim();



  // 1. Validate inputs

  if (!name) {

    alert("Please provide a folder name.");

    return;

  }



  // 2. Check for active folder

  if (!activeHomebaseFolderId) {

    alert("Error: No active bookmark folder selected.");

    return;

  }



  // Determine correct parent: Use the currently open grid folder
  const targetParentId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;



  // 3. Create the folder

  try {

    await browser.bookmarks.create({

      parentId: targetParentId,

      title: name

    });



    // 4. Re-fetch the entire bookmark tree to get the update

    const newTree = await getBookmarkTree(true); // Update the global tree variable



    // 5. Re-find the active folder node from the NEW tree

    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], targetParentId);

    

    // 6. Re-render the grid with the updated folder

    if (activeFolderNode) {

      renderBookmarkGrid(activeFolderNode);

    }

    

    // 7. Hide the modal on success

    hideAddFolderModal();

    

  } catch (err) {

    console.error("Error creating folder:", err);

    alert("Error: Could not save folder.");

  }

}



/**

 * NEW: Sets up all event listeners for the folder modal

 */

function setupFolderModal() {

  // 1. Assign global variables to DOM elements

  addFolderModal = document.getElementById('add-folder-modal');

  addFolderDialog = document.getElementById('add-folder-dialog');

  folderNameInput = document.getElementById('folder-name-input');

  folderSaveBtn = document.getElementById('folder-save-btn');

  folderCancelBtn = document.getElementById('folder-cancel-btn');



  // 2. Attach button listeners

  folderSaveBtn.addEventListener('click', saveNewFolder);

  folderCancelBtn.addEventListener('click', hideAddFolderModal);



  // 3. Click background overlay to close

  addFolderModal.addEventListener('click', (e) => {

    if (e.target === addFolderModal) {

      hideAddFolderModal();

    }

  });



  // 4. Listen for "Enter" key in input field

  folderNameInput.addEventListener('keydown', (e) => {

    if (e.key === 'Enter') {

      saveNewFolder();

    } else if (e.key === 'Escape') {

      hideAddFolderModal();

    }

  });

  

  // 5. Listen for "Escape" key globally when modal is open

  document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape' && addFolderModal && !addFolderModal.classList.contains('hidden')) {

      hideAddFolderModal();

    }

  });

}



// ===============================================

// --- EDIT FOLDER MODAL FUNCTIONS ---

// ===============================================

function setupEditFolderModal() {

  editFolderModal = document.getElementById('edit-folder-modal');

  if (!editFolderModal) return;



  cachedControlsContainer = document.querySelector('.edit-folder-controls');



  editFolderDialog = document.getElementById('edit-folder-dialog');

  editFolderNameInput = document.getElementById('edit-folder-name-input');

  editFolderSaveBtn = document.getElementById('edit-folder-save-btn');

  editFolderCancelBtn = document.getElementById('edit-folder-cancel-btn');

  editFolderCloseBtn = document.getElementById('edit-folder-close-btn');

  editFolderIconPrompt = document.getElementById('edit-folder-icon-prompt');
  editFolderIconPromptText = document.getElementById('edit-folder-icon-prompt-text');
  editFolderIconUseBtn = document.getElementById('edit-folder-icon-use');
  editFolderIconIgnoreBtn = document.getElementById('edit-folder-icon-ignore');



  const colorBtn = document.getElementById('edit-folder-color-btn');

  const uploadBtn = document.getElementById('edit-folder-upload-btn');

  const resetBtn = document.getElementById('edit-folder-reset-btn');

  const fileInput = document.getElementById('edit-folder-file-input');



  const openColorPicker = () => {

    // ... existing color picker logic (no changes needed here) ...

    const modal = document.getElementById('material-picker-modal');

    const dialog = modal ? modal.querySelector('.material-picker-dialog') : null;

    const grid = document.getElementById('material-color-grid');

    

    if (!modal || !dialog || !grid || !colorBtn) return;



    const currentMeta = pendingFolderMeta[editFolderTargetId] || {};

    const currentColor = currentMeta.color || appBookmarkFolderColorPreference;

    const originalColor = currentColor;

    colorBtn.dataset.value = currentColor;



    const previousSelected = grid.querySelector('.selected');

    if (previousSelected) previousSelected.classList.remove('selected');

    const match = grid.querySelector(`[data-color="${(currentColor || '').toLowerCase()}"]`);

    if (match) match.classList.add('selected');



    materialPickerCallback = (newColor) => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].color = newColor;

      updateEditPreview();

    };



    // Live hover preview

    materialPreviewCallback = (previewColor) => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].color = previewColor;

      updateEditPreview();

    };



    // Revert when leaving/canceling without pick

    materialRevertCallback = () => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].color = originalColor;

      updateEditPreview();

    };



    modal.classList.remove('hidden');

    modal.style.display = 'block';
    document.body.classList.add('modal-open');

    

    const rect = colorBtn.getBoundingClientRect();

    const dialogWidth = 380; 

    const dialogHeight = 420;

    

    let top = (rect.top + (rect.height / 2)) - (dialogHeight / 2);

    let left = rect.left - dialogWidth - 15; 



    if (left < 10) left = rect.right + 15;

    if (top + dialogHeight > window.innerHeight) top = window.innerHeight - dialogHeight - 20;

    if (top < 10) top = 10;



    dialog.style.position = 'absolute';

    dialog.style.margin = '0';

    dialog.style.top = `${top}px`;

    dialog.style.left = `${left}px`;



    const btnCenterX = rect.left + (rect.width / 2);

    const btnCenterY = rect.top + (rect.height / 2);

    const originX = btnCenterX - left;

    const originY = btnCenterY - top;

    

    grid.style.transformOrigin = `${originX}px ${originY}px`;

  };



  editFolderSaveBtn.addEventListener('click', handleEditFolderSave);

  editFolderCancelBtn.addEventListener('click', hideEditFolderModal);

  editFolderCloseBtn.addEventListener('click', hideEditFolderModal);



  if (colorBtn) {

    colorBtn.addEventListener('click', (e) => {

      e.preventDefault();

      openColorPicker();

    });

  }



  if (uploadBtn && fileInput) {

    uploadBtn.addEventListener('click', () => fileInput.click());

    

    // --- 2. IMAGE RESIZING (Feature 2) ---

    fileInput.addEventListener('change', (e) => {

      const file = e.target.files && e.target.files[0];

      if (!file) return;



      const img = new Image();

      const reader = new FileReader();

      

      reader.onload = (evt) => {

        img.src = evt.target.result;

        img.onload = () => {

          const canvas = document.createElement('canvas');

          const MAX_SIZE = 128; // Resize to max 128px

          let w = img.width;

          let h = img.height;

          

          if (w > h) {

            if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; }

          } else {

            if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; }

          }

          

          canvas.width = w;

          canvas.height = h;

          const ctx = canvas.getContext('2d');

          ctx.drawImage(img, 0, 0, w, h);

          

          const resizedDataUrl = canvas.toDataURL('image/webp', 0.85);

          

          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

          pendingFolderMeta[editFolderTargetId].icon = resizedDataUrl;

          updateEditPreview();

        };

      };

      reader.readAsDataURL(file);

      fileInput.value = '';

    });

  }



  // --- 3. SIMPLIFIED RESET (Single Click) ---

  if (resetBtn) {

    resetBtn.addEventListener('click', () => {

      if (!pendingFolderMeta[editFolderTargetId]) return;



      // Reset Everything (Color + Icon + Scale + Offset + Rotation)

      delete pendingFolderMeta[editFolderTargetId].color;

      delete pendingFolderMeta[editFolderTargetId].icon;

      delete pendingFolderMeta[editFolderTargetId].scale;

      delete pendingFolderMeta[editFolderTargetId].offsetY;

      delete pendingFolderMeta[editFolderTargetId].rotation;



      // Reset gooey sliders to defaults visually

      const scaleSlider = document.getElementById('gooey-slider-scale');

      const offsetSlider = document.getElementById('gooey-slider-offset');

      const rotateSlider = document.getElementById('gooey-slider-rotate');

      if (scaleSlider && scaleSlider.setValue) scaleSlider.setValue(1);

      if (offsetSlider && offsetSlider.setValue) offsetSlider.setValue(0);

      if (rotateSlider && rotateSlider.setValue) rotateSlider.setValue(0);



      updateEditPreview();

    });

  }



  editFolderModal.addEventListener('click', (e) => {

    if (e.target === editFolderModal) {

      hideEditFolderModal();

    }

  });



  if (editFolderNameInput) {

    editFolderNameInput.addEventListener('keydown', (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        handleEditFolderSave();

      } else if (e.key === 'Escape') {

        e.preventDefault();

        hideEditFolderModal();

      }

    });

  }

  if (editFolderIconIgnoreBtn) {
    editFolderIconIgnoreBtn.addEventListener('click', hideEditFolderIconPrompt);
  }

  if (editFolderIconUseBtn) {
    editFolderIconUseBtn.addEventListener('click', () => {
      // Placeholder for applying suggested icon; currently just hides the prompt.
      hideEditFolderIconPrompt();
    });
  }



  if (!editFolderEscBound) {

    document.addEventListener('keydown', (e) => {

      if (e.key === 'Escape' && editFolderModal && !editFolderModal.classList.contains('hidden')) {

        hideEditFolderModal();

      }

    });

    editFolderEscBound = true;

  }

}





function showEditFolderModal(folderNode) {

  if (!editFolderModal || !folderNode) return;



  editFolderTargetId = folderNode.id;

  if (editFolderNameInput) editFolderNameInput.value = folderNode.title || '';



  pendingFolderMeta = {};

  if (folderMetadata[folderNode.id]) {

    pendingFolderMeta[folderNode.id] = { ...folderMetadata[folderNode.id] };

  }



  // --- Initialize BUBBLE Sliders ---

  const currentScale = pendingFolderMeta[editFolderTargetId]?.scale ?? 1;

  const currentOffsetY = pendingFolderMeta[editFolderTargetId]?.offsetY ?? 0;

  const currentRotation = pendingFolderMeta[editFolderTargetId]?.rotation ?? 0;



  const scaleEl = document.getElementById('gooey-slider-scale');

  const offsetEl = document.getElementById('gooey-slider-offset');

  const rotateEl = document.getElementById('gooey-slider-rotate');

  

  // Scale: 0.5 to 1.5

  if (scaleEl && !scaleEl.dataset.initialized) {

    initBubbleSlider('gooey-slider-scale', 0.5, 1.5, 1, 0.01, (val) => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].scale = val;

      updateEditPreview();

    });

    scaleEl.dataset.initialized = '1';

  }



  // Position: -20 to 20

  if (offsetEl && !offsetEl.dataset.initialized) {

    initBubbleSlider('gooey-slider-offset', -20, 20, 0, 1, (val) => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].offsetY = val;

      updateEditPreview();

    });

    offsetEl.dataset.initialized = '1';

  }



  // Rotation: -180 to 180

  if (rotateEl && !rotateEl.dataset.initialized) {

    initBubbleSlider('gooey-slider-rotate', -180, 180, 0, 5, (val) => {

      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

      pendingFolderMeta[editFolderTargetId].rotation = val;

      updateEditPreview();

    });

    rotateEl.dataset.initialized = '1';

  }



  // Refresh values on open

  if (scaleEl && scaleEl.setValue) scaleEl.setValue(currentScale);

  if (offsetEl && offsetEl.setValue) offsetEl.setValue(currentOffsetY);

  if (rotateEl && rotateEl.setValue) rotateEl.setValue(currentRotation);



  updateEditPreview();

  openModalWithAnimation('edit-folder-modal', null, '.dialog-content');



  if (editFolderNameInput) {

    editFolderNameInput.focus();

    editFolderNameInput.select();

  }

}





function hideEditFolderModal() {

  if (!editFolderModal) return;

  closeModalWithAnimation('edit-folder-modal', '.dialog-content', () => {
    editFolderTargetId = null;
    pendingFolderMeta = {};
    
    // Clear cached references so they refresh next time
    cachedPreviewContainer = null;
    cachedControlsContainer = null;
    
    const previewContainer = document.getElementById('edit-folder-icon-preview');
    if (previewContainer) {
      previewContainer.innerHTML = '';
    }
    if (editFolderNameInput) editFolderNameInput.value = '';
    hideEditFolderIconPrompt();
  });

}

function hideEditFolderIconPrompt() {
  if (!editFolderIconPrompt) return;
  editFolderIconPrompt.classList.add('hidden');
}



let cachedPreviewContainer = null;

let cachedControlsContainer = null;



function updateEditPreview(iconOverride) {

  // 1. Lazy-load the container reference once

  if (!cachedPreviewContainer) {

    cachedPreviewContainer = document.getElementById('edit-folder-icon-preview');

  }



  // --- Ensure controls container reference ---

  if (!cachedControlsContainer) {

    cachedControlsContainer = document.querySelector('.edit-folder-controls');

  }



  const previewContainer = cachedPreviewContainer;

  if (!previewContainer || !editFolderTargetId) return;



  const meta = pendingFolderMeta[editFolderTargetId] || {};

  const customColor = meta.color || appBookmarkFolderColorPreference;

  const scale = meta.scale ?? 1;

  const offsetY = meta.offsetY ?? 0;

  const rotation = meta.rotation ?? 0;

  const transformValue = `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.9}) rotate(${rotation}deg)`;

  const effectiveIcon = iconOverride !== undefined ? iconOverride : (meta.icon || null);

  if (cachedControlsContainer) {

    cachedControlsContainer.classList.toggle('visible', !!effectiveIcon);

  }



  let baseWrapper = previewContainer.querySelector('.edit-folder-base-wrapper');

  if (!baseWrapper) {

    previewContainer.innerHTML = '';

    baseWrapper = document.createElement('div');

    baseWrapper.className = 'edit-folder-base-wrapper';

    baseWrapper.innerHTML = useSvgIcon('bookmarkFolderLarge');

    previewContainer.appendChild(baseWrapper);

  }



  const contrastFill = getComplementaryColor(customColor);



  const baseSvg = baseWrapper.querySelector('svg');

  if (baseWrapper.dataset.lastAppliedColor !== customColor) {

    if (baseSvg) {

      tintSvgElement(baseSvg, customColor);

    }

    baseWrapper.dataset.lastAppliedColor = customColor;



    const iconInWrapper = baseWrapper.querySelector('.edit-folder-custom-icon-preview');

    if (iconInWrapper && iconInWrapper.tagName === 'DIV') {

      const svg = iconInWrapper.querySelector('svg');

      if (svg) {

        tintSvgElement(svg, contrastFill);

      }

    }

  }



  if (!effectiveIcon) {

    const existingIcon = baseWrapper.querySelector('.edit-folder-custom-icon-preview');

    if (existingIcon) existingIcon.remove();

    return;

  }



  let iconEl = baseWrapper.querySelector('.edit-folder-custom-icon-preview');

  const isBuiltinIcon =

    typeof effectiveIcon === 'string' && effectiveIcon.startsWith('builtin:');



  if (iconEl) {

    const match =

      (isBuiltinIcon && iconEl.dataset.iconKey === effectiveIcon) ||

      (!isBuiltinIcon && iconEl.dataset.src === effectiveIcon);



    if (match) {

      iconEl.style.transform = transformValue;

      if (isBuiltinIcon) {

        const svg = iconEl.querySelector('svg');

        if (svg) {

          tintSvgElement(svg, contrastFill);

        }

      }

      return;

    }



    iconEl.remove();

    iconEl = null;

  }



  if (isBuiltinIcon) {

    const key = effectiveIcon.slice('builtin:'.length);

    const svgString = useSvgIcon(key);

    if (!svgString) return;



    iconEl = document.createElement('div');

    iconEl.className = 'edit-folder-custom-icon-preview';

    iconEl.innerHTML = svgString;

    iconEl.dataset.iconKey = effectiveIcon;



    const svg = iconEl.querySelector('svg');

    if (svg) {

      tintSvgElement(svg, contrastFill);

    }

  } else {

    iconEl = document.createElement('img');

    iconEl.className = 'edit-folder-custom-icon-preview';

    iconEl.src = effectiveIcon;

    iconEl.dataset.src = effectiveIcon;

  }



  iconEl.style.transform = transformValue;



  baseWrapper.appendChild(iconEl);

}



/**

 * Initialize Custom Range Slider (Replaces Bubble Slider)

 */

function initBubbleSlider(containerId, min, max, initialValue, step, onUpdate) {

  const container = document.getElementById(containerId);

  if (!container) return;



  container.innerHTML = '';

  container.className = 'range-slider-wrapper gooey-slider-container'; // Keep existing class for layout



  // 1. Build the HTML Structure

  const wrapper = document.createElement('div');

  wrapper.className = 'range-slider';



  const bar = document.createElement('div');

  bar.className = 'range-slider__bar';



  const fill = document.createElement('div');

  fill.className = 'range-slider__fill';

  bar.appendChild(fill);



  const thumb = document.createElement('div');

  thumb.className = 'range-slider__thumb';



  const valueTooltip = document.createElement('div');

  valueTooltip.className = 'range-slider__value';

  valueTooltip.textContent = initialValue;

  thumb.appendChild(valueTooltip);



  const input = document.createElement('input');

  input.type = 'range';

  input.className = 'range-slider__input';
  input.id = `${containerId}-input`;

  input.min = min;

  input.max = max;

  input.step = step;

  input.value = initialValue;



  // Append everything

  wrapper.appendChild(bar);

  wrapper.appendChild(input);

  wrapper.appendChild(thumb);

  container.appendChild(wrapper);



  // 2. Update Function

  const updateUI = () => {

    const val = parseFloat(input.value);

    const minVal = parseFloat(input.min);

    const maxVal = parseFloat(input.max);

    const percent = ((val - minVal) * 100) / (maxVal - minVal);



    // Move Fill

    fill.style.width = `${percent}%`;



    // Move Thumb (Left %)

    thumb.style.left = `${percent}%`;



    // Update Text

    valueTooltip.textContent = val;



    if (onUpdate) onUpdate(val);

  };



  // 3. Listeners

  input.addEventListener('input', updateUI);

  

  // Init

  updateUI();



  // 4. Expose setValue for Reset buttons

  container.setValue = (val) => {

    input.value = val;

    updateUI();

  };

}











// Duration must match the CSS animation (0.2s closing)

const ICON_PICKER_CLOSE_DURATION = 200;



function showBuiltinIconPicker(anchorButton) {

  const overlay = document.getElementById('builtin-icon-picker-modal');

  if (!overlay) return;



  const dialog = overlay.querySelector('.popover-dialog');

  const list = document.getElementById('builtin-icon-list');



  // Reset scroll to top

  if (list) list.scrollTop = 0;



  // Clear manual positioning so CSS centering can take over; keep CSS left offset

  if (dialog) {

    dialog.style.top = '';

  }



  // Calculate transform origin from button to centered dialog

  if (dialog && anchorButton) {

    const btnRect = anchorButton.getBoundingClientRect();

    const btnCenterX = btnRect.left + (btnRect.width / 2);

    const btnCenterY = btnRect.top + (btnRect.height / 2);



    // Dialog is centered in the viewport via flex; its center is screen center plus offset

    const offsetX = 322; // matches CSS left shift

    const dialogCenterX = (window.innerWidth / 2) + offsetX;

    const dialogCenterY = window.innerHeight / 2;



    const originX = btnCenterX - dialogCenterX;

    const originY = btnCenterY - dialogCenterY;



    dialog.style.setProperty(

      '--popover-origin',

      `calc(50% + ${originX}px) calc(50% + ${originY}px)`

    );

  }



  overlay.classList.remove('hidden', 'closing');

}



function hideBuiltinIconPicker() {

  const overlay = document.getElementById('builtin-icon-picker-modal');

  if (!overlay || overlay.classList.contains('hidden')) return;



  const dialog = overlay.querySelector('.popover-dialog');

  let finished = false;



  const finalizeClose = () => {

    if (finished) return;

    finished = true;

    overlay.classList.add('hidden');

    overlay.classList.remove('closing');

    if (dialog) dialog.removeEventListener('animationend', finalizeClose);

  };



  overlay.classList.add('closing');



  if (dialog) dialog.addEventListener('animationend', finalizeClose, { once: true });

  // Fallback in case transitionend doesn't fire

  setTimeout(finalizeClose, ICON_PICKER_CLOSE_DURATION + 50);

}



function setupBuiltInIconPicker() {

  const builtinIconOverlay = document.getElementById('builtin-icon-picker-modal');

  const builtinIconDialog = document.getElementById('builtin-icon-picker-dialog');

  const builtinIconList = document.getElementById('builtin-icon-list');

  const triggerBtn = document.getElementById('edit-folder-builtin-btn');



  // State to track original icon for hover-revert effect

  let originalIconState = null;



  if (!builtinIconOverlay || !builtinIconList || !triggerBtn || !builtinIconDialog) return;



  const renderIcons = () => {

    // Only render if empty to save performance

    if (builtinIconList.children.length > 0) return;



    builtinIconList.innerHTML = '';

    

    Object.entries(ICON_CATEGORIES).forEach(([categoryName, iconKeys]) => {

      const section = document.createElement('div');

      section.className = 'icon-picker-category';

      

      const title = document.createElement('h4');

      title.className = 'icon-picker-category-title';

      title.textContent = categoryName;

      section.appendChild(title);

      

      const grid = document.createElement('div');

      grid.className = 'icon-picker-grid';

      

      iconKeys.forEach(key => {

        const svgString = useSvgIcon(key);

        if (!svgString) return;



        const btn = document.createElement('div');

        btn.className = 'icon-picker-item';

        btn.dataset.iconId = key;

        // Use custom tooltip markup instead of native title

        btn.innerHTML = `<span class="tooltip-popup tooltip-top">${key}</span>${svgString}`;

        

        // --- 1. Real-time Hover Preview ---

        btn.addEventListener('mouseenter', () => {

          if (!editFolderTargetId) return;

          updateEditPreview(`builtin:${key}`);

        });



        // --- 2. Select Icon (Save) ---

        btn.addEventListener('click', (e) => {

          e.stopPropagation();

          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

          

          const newIcon = `builtin:${key}`;

          pendingFolderMeta[editFolderTargetId].icon = newIcon;

          

          // Update the "original" state so moving mouse away doesn't revert it

          originalIconState = newIcon; 

          

          updateEditPreview();

          hideBuiltinIconPicker();

        });



        grid.appendChild(btn);

      });

      

      if (grid.children.length > 0) {

        section.appendChild(grid);

        builtinIconList.appendChild(section);

      }

    });

  };



  // --- 3. Revert on Mouse Leave (The whole list) ---

  builtinIconList.addEventListener('mouseleave', () => {

    if (!editFolderTargetId) return;

    if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};



    if (originalIconState) {

      pendingFolderMeta[editFolderTargetId].icon = originalIconState;

    } else {

      delete pendingFolderMeta[editFolderTargetId].icon;

    }

    updateEditPreview();

  });



  triggerBtn.addEventListener('click', (e) => {

    e.preventDefault();

    e.stopPropagation();

    renderIcons();

    

    if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};

    originalIconState = pendingFolderMeta[editFolderTargetId].icon || null;



    // Show picker and reset scroll so it always starts at the top

    showBuiltinIconPicker(triggerBtn);

  });



  // Close when clicking outside

  builtinIconOverlay.addEventListener('click', (e) => {

    if (!builtinIconDialog.contains(e.target)) {

      hideBuiltinIconPicker();

      

      if (originalIconState) {

        pendingFolderMeta[editFolderTargetId].icon = originalIconState;

      } else {

        if (pendingFolderMeta[editFolderTargetId]) delete pendingFolderMeta[editFolderTargetId].icon;

      }

      updateEditPreview();

    }

  });

}



async function handleEditFolderSave() {

  if (!editFolderTargetId || !editFolderNameInput) return;



  const newName = editFolderNameInput.value.trim();

  if (!newName) return alert('Name required');



  try {

    // 1. Update Bookmark Title

    await browser.bookmarks.update(editFolderTargetId, { title: newName });



    // --- Prevent stale overwrite: pull latest metadata before merging ---

    try {

      const stored = await browser.storage.local.get(FOLDER_META_KEY);

      const freshMetadata = stored[FOLDER_META_KEY] || {};

      folderMetadata = freshMetadata;

    } catch (_) {

      // If storage read fails, continue with current in-memory state

    }



    const newMeta = pendingFolderMeta[editFolderTargetId];

    

    // 2. Save Metadata for CURRENT folder

    if (newMeta && (newMeta.color || newMeta.icon || newMeta.scale !== undefined)) {

      folderMetadata[editFolderTargetId] = newMeta;

    } else {

      delete folderMetadata[editFolderTargetId];

    }



    // 3. Save to Storage

    await browser.storage.local.set({ [FOLDER_META_KEY]: folderMetadata });



    // 4. Refresh UI

    await getBookmarkTree(true);



    let folderToRender = null;

    if (currentGridFolderNode) {

      folderToRender = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

    }



    if (!folderToRender && activeHomebaseFolderId) {

      folderToRender = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);

    }



    if (folderToRender) {

      renderBookmarkGrid(folderToRender);

    } else {

      loadBookmarks(editFolderTargetId);

    }



    hideEditFolderModal();

  } catch (err) {

    console.error('Save failed', err);

    alert('Error: Could not update this folder.');

  }

}



// ===============================================

// --- MOVE BOOKMARK/FOLDER MODAL FUNCTIONS ---

// ===============================================

function setupMoveModal() {

  moveBookmarkModal = document.getElementById('move-bookmark-modal');

  moveBookmarkDialog = document.getElementById('move-bookmark-dialog');

  moveDialogTitle = document.getElementById('move-dialog-title');

  moveFolderDropdown = document.getElementById('move-folder-dropdown');

  moveFolderDropdownBtn = document.getElementById('move-folder-dropdown-btn');

  moveFolderDropdownMenu = document.getElementById('move-folder-dropdown-menu');

  moveFolderSelectedLabel = document.getElementById('move-folder-selected');

  moveFolderSaveBtn = document.getElementById('move-folder-save-btn');

  moveFolderCancelBtn = document.getElementById('move-folder-cancel-btn');

  moveFolderCloseBtn = document.getElementById('move-folder-close-btn');



  if (!moveBookmarkModal) return;



  moveFolderSaveBtn.addEventListener('click', handleMoveBookmarkSave);

  moveFolderCancelBtn.addEventListener('click', hideMoveBookmarkModal);

  moveFolderCloseBtn.addEventListener('click', hideMoveBookmarkModal);

  if (moveFolderDropdownBtn) {

    moveFolderDropdownBtn.addEventListener('click', toggleMoveFolderDropdown);

    moveFolderDropdownBtn.addEventListener('keydown', (e) => {

      if (e.key === 'Enter' || e.key === ' ') {

        e.preventDefault();

        toggleMoveFolderDropdown();

      } else if (e.key === 'Escape') {

        closeMoveFolderDropdown();

        hideMoveBookmarkModal();

      }

    });

  }

  moveBookmarkModal.addEventListener('click', (e) => {

    if (e.target === moveBookmarkModal) {

      hideMoveBookmarkModal();

    }

  });



  document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape' && moveBookmarkModal && !moveBookmarkModal.classList.contains('hidden')) {

      hideMoveBookmarkModal();

    }

  });



  document.addEventListener('click', (e) => {

    if (!moveBookmarkModal || moveBookmarkModal.classList.contains('hidden')) return;

    if (!moveFolderDropdown) return;

    if (moveFolderDropdown.contains(e.target)) return;

    closeMoveFolderDropdown();

  });

}



function hideMoveBookmarkModal() {

  closeModalWithAnimation('move-bookmark-modal', '.dialog-content', () => {
    closeMoveFolderDropdown();

    if (moveFolderDropdownMenu) {
      moveFolderDropdownMenu.innerHTML = '';
    }

    if (moveFolderSelectedLabel) {
      moveFolderSelectedLabel.textContent = 'Select folder';
    }

    moveModalState = {
      targetId: null,
      isFolder: false,
      originParentId: null,
      blockedIds: new Set(),
      selectedFolderId: null,
    };
  });

}



function toggleMoveFolderDropdown() {

  if (!moveFolderDropdown || !moveFolderDropdownBtn) return;

  const isOpen = moveFolderDropdown.classList.toggle('open');

  moveFolderDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  if (isOpen) {

    scrollMoveFolderActiveItemIntoView();

  }

}



function closeMoveFolderDropdown() {

  if (!moveFolderDropdown || !moveFolderDropdownBtn) return;

  moveFolderDropdown.classList.remove('open');

  moveFolderDropdownBtn.setAttribute('aria-expanded', 'false');

}



function scrollMoveFolderActiveItemIntoView() {

  if (!moveFolderDropdownMenu) return;

  const activeItem = moveFolderDropdownMenu.querySelector('.dropdown-item.active');

  if (activeItem) {

    activeItem.scrollIntoView({ block: 'center' });

  }

}



function openMoveBookmarkModal(itemId, isFolder) {

  if (!bookmarkTree || !bookmarkTree[0]) {

    alert('Bookmarks are still loading. Please try again.');

    return;

  }

  const node = findBookmarkNodeById(bookmarkTree[0], itemId);

  if (!node) {

    alert('Could not find that bookmark in the tree.');

    return;

  }



  const blockedIds = isFolder ? collectFolderBranchIds(node) : new Set();

  const folderOptions = buildFolderOptionList(blockedIds);



  if (!folderOptions.length) {

    alert('No available folders to move this item into.');

    return;

  }



  moveModalState = {

    targetId: itemId,

    isFolder,

    originParentId: node.parentId || null,

    blockedIds,

    selectedFolderId: null,

  };



  populateMoveFolderDropdown(folderOptions, moveModalState.originParentId);



  const safeTitle = node.title && node.title.trim()

    ? node.title.trim()

    : (isFolder ? 'this folder' : 'this bookmark');



  moveDialogTitle.textContent = `Move "${safeTitle}" to:`;

  openModalWithAnimation('move-bookmark-modal', null, '.dialog-content');

  closeMoveFolderDropdown();

  moveFolderDropdownBtn.focus();

}



function collectFolderBranchIds(node, blocked = new Set()) {

  if (!node || node.url) {

    return blocked;

  }

  blocked.add(node.id);

  if (node.children) {

    node.children.forEach(child => {

      if (!child.url) {

        collectFolderBranchIds(child, blocked);

      }

    });

  }

  return blocked;

}



function getFriendlyFolderTitle(node) {

  if (node.title && node.title.trim()) {

    return node.title.trim();

  }

  if (node.id === 'toolbar_____') return 'Bookmarks Toolbar';

  if (node.id === 'unfiled_____') return 'Other Bookmarks';

  if (node.id === 'mobile______') return 'Mobile Bookmarks';

  return 'Untitled folder';

}



function buildFolderOptionList(blockedIds = new Set()) {

  const options = [];

  if (!bookmarkTree || !bookmarkTree[0] || !bookmarkTree[0].children) {

    return options;

  }



  const traverse = (node, depth) => {

    if (!node || node.url) return;



    if (node.id && node.id !== 'root________') {

      if (blockedIds.has(node.id)) {

        return;

      }

      const indent = depth > 0 ? `${'  '.repeat(depth - 1)}- ` : '';

      options.push({

        id: node.id,

        label: `${indent}${getFriendlyFolderTitle(node)}`

      });

    }



    if (node.children) {

      node.children.forEach(child => traverse(child, depth + 1));

    }

  };



  bookmarkTree[0].children.forEach(child => traverse(child, 0));

  return options;

}



function populateMoveFolderDropdown(options, preferredId) {

  if (!moveFolderDropdownMenu || !moveFolderSelectedLabel) return;

  moveFolderDropdownMenu.innerHTML = '';

  let initialOption = null;



  options.forEach(option => {

    const btn = document.createElement('button');

    btn.type = 'button';

    btn.className = 'dropdown-item';

    btn.textContent = option.label;

    btn.dataset.value = option.id;

    btn.addEventListener('click', () => {

      setMoveFolderSelection(option.id, option.label);

      closeMoveFolderDropdown();

    });

    moveFolderDropdownMenu.appendChild(btn);

    if (preferredId && option.id === preferredId) {

      initialOption = option;

    } else if (!preferredId && moveModalState.originParentId && option.id === moveModalState.originParentId) {

      initialOption = option;

    }

  });



  if (initialOption) {

    setMoveFolderSelection(initialOption.id, initialOption.label);

  } else {

    setMoveFolderSelection(null, null);

  }

}



function setMoveFolderSelection(folderId, label) {

  moveModalState.selectedFolderId = folderId;

  if (moveFolderSelectedLabel) {

    moveFolderSelectedLabel.textContent = label || 'Select folder';

  }

  if (moveFolderDropdownMenu) {

    Array.from(moveFolderDropdownMenu.children).forEach(child => {

      child.classList.toggle('active', child.dataset.value === folderId);

    });

  }

}



async function handleMoveBookmarkSave() {

  if (!moveModalState.targetId) return;

  const destinationId = moveModalState.selectedFolderId;

  if (!destinationId) return;



  if (moveModalState.blockedIds.has(destinationId)) {

    alert('Cannot move a folder inside itself.');

    return;

  }



  try {

    await browser.bookmarks.move(moveModalState.targetId, {

      parentId: destinationId

    });

    hideMoveBookmarkModal();



    const refreshFolderId =

      (currentGridFolderNode && currentGridFolderNode.id) ||

      activeHomebaseFolderId ||

      rootDisplayFolderId;



    loadBookmarks(refreshFolderId);

  } catch (err) {

    console.error('Error moving bookmark:', err);

    alert('Error: Could not move this item.');

  }

}



// ===============================================

// --- APP LAUNCHER (Google Apps) ---

// ===============================================

function setupAppLauncher() {

  googleAppsPanel.classList.remove('hidden');



  googleAppsBtn.addEventListener('click', (e) => {

    e.stopPropagation();

    const isOpen = googleAppsPanel.classList.contains('open');



    if (!isOpen) {

      const panelWidth = googleAppsPanel.offsetWidth;

      const rect = googleAppsBtn.getBoundingClientRect();

      googleAppsPanel.style.top = `${rect.bottom + 10}px`;

      const buttonCenterX = rect.left + (rect.width / 2);

      let panelLeft = buttonCenterX - (panelWidth / 2);

      

      const padding = 10;

      if (panelLeft < padding) panelLeft = padding;

      if (panelLeft + panelWidth > window.innerWidth - padding) {

        panelLeft = window.innerWidth - panelWidth - padding;

      }



      googleAppsPanel.style.left = `${panelLeft}px`;

      googleAppsPanel.style.right = 'auto';

      googleAppsPanel.classList.add('open');

    } else {

      googleAppsPanel.classList.remove('open');

    }

  });



  window.addEventListener('click', () => {

    if (googleAppsPanel.classList.contains('open')) {

      googleAppsPanel.classList.remove('open');

    }

  });



  window.addEventListener('resize', () => {

    if (googleAppsPanel.classList.contains('open')) {

      googleAppsPanel.classList.remove('open');

    }

  });



  googleAppsPanel.addEventListener('click', (e) => {

    e.stopPropagation();

  });

}





// ===============================================

// --- BOOKMARKS ---

// ===============================================



let bookmarkTreeFetchPromise = null;

let folderPickerFolders = [];

let folderPickerSelectedId = null;

let folderPickerLastFocusedEl = null;

let cachedFolderIndex = null;
let cachedFolderIndexAt = 0;
const FOLDER_INDEX_TTL_MS = 30_000;

async function getHomebaseRootId() {
  try {
    const stored = await browser.storage.local.get(HOMEBASE_BOOKMARK_ROOT_ID_KEY);
    return stored[HOMEBASE_BOOKMARK_ROOT_ID_KEY] || '';
  } catch (err) {
    console.warn('Failed to read homebase root id', err);
    return '';
  }
}

async function setHomebaseRootId(id) {
  try {
    await browser.storage.local.set({ [HOMEBASE_BOOKMARK_ROOT_ID_KEY]: id || '' });
  } catch (err) {
    console.warn('Failed to persist homebase root id', err);
  }
}

async function clearHomebaseRootId() {
  try {
    await browser.storage.local.remove(HOMEBASE_BOOKMARK_ROOT_ID_KEY);
  } catch (err) {
    console.warn('Failed to clear homebase root id', err);
  }
}

async function bookmarkNodeExists(id) {
  if (!id || !browser.bookmarks || typeof browser.bookmarks.get !== 'function') return null;
  try {
    const node = await browser.bookmarks.get(id);
    return Array.isArray(node) && node.length > 0;
  } catch (err) {
    console.warn('Bookmark node lookup failed', err);
    return null;
  }
}

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



// --- NEW: Grid Drag-and-Drop Handlers (Using Sortable.js) ---


/**

 * NEW: Initializes Sortable.js on the bookmarks grid.

 * This is called by renderBookmarkGrid.

 */

function setupGridSortable(gridElement) {

  if (gridSortable) {

    gridSortable.destroy(); // Destroy previous instance

  }

  gridSortable = Sortable.create(gridElement, {
    animation: 250, // Optimal speed for smoothness
    group: 'bookmarks',
    draggable: '.bookmark-item:not(.back-button)',
    filter: '.grid-item-rename-input',
    preventOnFilter: false,

    // Explicitly tell Sortable which attribute holds the ID
    dataIdAttr: 'data-bookmark-id',

    // Performance Settings
    delay: 0,
    touchStartThreshold: 3,

    ghostClass: 'bookmark-placeholder',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',

    forceFallback: true,
    fallbackClass: 'bookmark-fallback-ghost',
    fallbackOnBody: true,

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



  // Clear drag-over from all but the current target

  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {

    if (item !== targetItem) {

      item.classList.remove('drag-over');

    }

  });



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

      targetItem.classList.add('drag-over');

      return false; // prevent Sortable from reordering while over this folder

    } else {

      // Still in the "passing through" phase ? allow normal reordering

      targetItem.classList.remove('drag-over');

      return true;

    }

  }



  // Not over a folder ? reset hover state and allow normal sort

  folderHoverTarget = null;

  folderHoverStart = 0;

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

  if (tabsSortable) {

    tabsSortable.destroy();

  }

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

async function applyResolvedFaviconResult({
  img,
  resolved,
  shouldAbort,
  onResolved,
  onFailed,
  onAbort,
  acceptCandidate
}) {
  if (!resolved) {
    onFailed();
    return;
  }
  if (shouldAbort && shouldAbort()) {
    if (onAbort) onAbort();
    return;
  }
  const isOnline = navigator.onLine !== false;
  if (resolved.cached && resolved.cacheKey) {
    const cachedResponse = await readIconFromCache(resolved.cacheKey);
    if (cachedResponse) {
      const objectUrl = await responseToObjectURL(cachedResponse);
      if (objectUrl) {
        const loadResult = await loadFaviconObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
        if (loadResult.aborted) {
          revokeFaviconObjectUrl(img);
          if (onAbort) onAbort();
          return;
        }
        if (loadResult.accepted) {
          onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
          return;
        }
        revokeFaviconObjectUrl(img);
      }
    }
  }
  if (resolved.url && isOnline) {
    onResolved(resolved.url, { fromCache: false, sourceAlreadySet: false });
    return;
  }
  onFailed();
}

async function resolveFaviconFromNetwork({
  domainKey,
  candidates,
  acceptCandidate,
  cacheKey
}) {
  if (!domainKey || !candidates || !candidates.length) return null;
  const now = Date.now();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const blob = await xhrFetchBlob(candidate, 8000);
    if (blob && blob.size) {
      const objectUrl = URL.createObjectURL(blob);
      const accepted = await testFaviconCandidateObjectUrl(objectUrl, acceptCandidate);
      if (accepted) {
        const responseForCache = blobToResponse(blob);
        const cached = await writeIconToCache(cacheKey, responseForCache.clone());
        setFaviconResolved(domainKey, candidate, { cacheKey: cached ? cacheKey : null, cached });
        faviconNegativeCache.delete(domainKey);
        await setFaviconMeta(domainKey, {
          cacheKey: cached ? cacheKey : null,
          lastSeen: now,
          failCount: 0,
          lastOkAt: now
        });
        return { url: candidate, cacheKey: cached ? cacheKey : null, cached };
      }
    }
    const acceptedByUrl = await testFaviconCandidateUrl(candidate, acceptCandidate);
    if (acceptedByUrl) {
      setFaviconResolved(domainKey, candidate, { cacheKey: null, cached: false });
      faviconNegativeCache.delete(domainKey);
      await setFaviconMeta(domainKey, {
        cacheKey: null,
        lastSeen: now,
        failCount: 0,
        lastOkAt: now
      });
      return { url: candidate, cacheKey: null, cached: false };
    }
  }
  faviconNegativeCache.set(domainKey, Date.now());
  await bumpFaviconFail(domainKey);
  return null;
}

async function resolveFaviconForImageTarget({
  img,
  domainKey,
  candidates,
  shouldAbort,
  onResolved,
  onFailed,
  onNegativeCacheHit,
  onAbort,
  acceptCandidate
}) {
  if (!domainKey) {
    onFailed();
    return;
  }

  const isOffline = navigator.onLine === false;
  const resolvedEntry = getFaviconResolvedEntry(domainKey);
  const cacheKey = cacheKeyFor(domainKey, FAVICON_SIZE_PX);

  if (resolvedEntry && resolvedEntry.url && !isOffline) {
    if (shouldAbort && shouldAbort()) {
      if (onAbort) onAbort();
      return;
    }
    onResolved(resolvedEntry.url, { fromCache: true, sourceAlreadySet: false });
    return;
  }

  const cachedResponse = await readIconFromCache(cacheKey);
  if (cachedResponse) {
    const objectUrl = await responseToObjectURL(cachedResponse);
    if (objectUrl) {
      const loadResult = await loadFaviconObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
      if (loadResult.aborted) {
        revokeFaviconObjectUrl(img);
        if (onAbort) onAbort();
        return;
      }
      if (loadResult.accepted) {
        onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
        return;
      }
      revokeFaviconObjectUrl(img);
    }
  }

  const meta = await getFaviconMeta(domainKey);
  const metaIsStale = isFaviconMetaStale(meta);
  if (meta && meta.cacheKey && meta.cacheKey !== cacheKey) {
    const metaResponse = await readIconFromCache(meta.cacheKey);
    if (metaResponse) {
      const objectUrl = await responseToObjectURL(metaResponse);
      if (objectUrl) {
        const loadResult = await loadFaviconObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
        if (loadResult.aborted) {
          revokeFaviconObjectUrl(img);
          if (onAbort) onAbort();
          return;
        }
        if (loadResult.accepted) {
          onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
          return;
        }
        revokeFaviconObjectUrl(img);
      }
    }
  }

  if (isOffline) {
    faviconNegativeCache.set(domainKey, Date.now());
    if (onNegativeCacheHit) onNegativeCacheHit();
    return;
  }

  const lastFailedAt = faviconNegativeCache.get(domainKey);
  if (lastFailedAt && (Date.now() - lastFailedAt < FAVICON_NEGATIVE_TTL_MS)) {
    if (onNegativeCacheHit) onNegativeCacheHit(lastFailedAt);
    return;
  }
  if (lastFailedAt) {
    faviconNegativeCache.delete(domainKey);
  }

  if (meta && !metaIsStale && shouldBlockFaviconMeta(meta)) {
    if (onNegativeCacheHit) onNegativeCacheHit(meta.lastSeen || Date.now());
    return;
  }

  if (!candidates || !candidates.length) {
    onFailed();
    return;
  }

  const existing = faviconInflightCache.get(domainKey);
  if (existing) {
    Promise.resolve(existing)
      .then((resolved) => applyResolvedFaviconResult({
        img,
        resolved,
        shouldAbort,
        onResolved,
        onFailed,
        onAbort,
        acceptCandidate
      }))
      .catch(() => {
        onFailed();
      });
    return;
  }

  const inflightPromise = new Promise((resolve) => {
    const waiters = faviconWaiters.get(domainKey) || [];
    waiters.push(resolve);
    faviconWaiters.set(domainKey, waiters);
  });

  faviconInflightCache.set(domainKey, inflightPromise);

  enqueueFaviconTask(() => resolveFaviconFromNetwork({
    domainKey,
    candidates,
    acceptCandidate,
    cacheKey
  }))
    .then((resolved) => {
      notifyFaviconWaiters(domainKey, resolved);
    })
    .catch(() => {
      notifyFaviconWaiters(domainKey, null);
    });

  Promise.resolve(inflightPromise)
    .then((resolved) => applyResolvedFaviconResult({
      img,
      resolved,
      shouldAbort,
      onResolved,
      onFailed,
      onAbort,
      acceptCandidate
    }))
    .catch(() => {
      onFailed();
    });
}

function ensureBookmarkFallback(wrapper, fallbackLetter) {
  let fallbackIcon = wrapper.querySelector('.bookmark-fallback-icon');
  if (!fallbackIcon) {
    fallbackIcon = document.createElement('div');
    fallbackIcon.className = 'bookmark-fallback-icon';
    wrapper.appendChild(fallbackIcon);
  }
  fallbackIcon.textContent = fallbackLetter;
  return fallbackIcon;
}

function clearBookmarkImages(wrapper) {
  const images = wrapper.querySelectorAll('img.bookmark-img');
  images.forEach((img) => {
    if (faviconIntersectionObserver) {
      faviconIntersectionObserver.unobserve(img);
    }
    if (img._faviconResolve) {
      delete img._faviconResolve;
    }
    revokeFaviconObjectUrl(img);
    img.remove();
  });
}

function renderBookmarkIconInto(wrapper, bookmarkNode, iconKey) {
  if (!wrapper || !bookmarkNode) return;

  const nextKey = iconKey !== undefined ? iconKey : getIconKeyForNode(bookmarkNode);
  const title = bookmarkNode.title || ' ';
  const fallbackLetter = (title.trim().charAt(0) || '?').toUpperCase();
  const meta = (bookmarkMetadata && bookmarkMetadata[bookmarkNode.id]) || {};
  const fallbackColor = appBookmarkFallbackColorPreference || '#00b8d4';
  const existingLoaded = wrapper.querySelector('img.bookmark-img.loaded');
  const fallbackIcon = ensureBookmarkFallback(wrapper, fallbackLetter);
  const cancelFallback = () => {};

  const showFallbackNow = (reason) => {
    cancelFallback();
    fallbackIcon.classList.add('show-fallback');
    wrapper.style.backgroundColor = fallbackColor;
    debugFavicon('fallback shown', {
      reason,
      nodeId: bookmarkNode.id,
      url: bookmarkNode.url || '',
      iconKey: nextKey
    });
  };

  const hideFallback = () => {
    fallbackIcon.classList.remove('show-fallback');
  };

  wrapper.style.backgroundColor = '';
  hideFallback();

  // --- NEW: Check for Custom Icon ---
  if (meta && meta.icon) {
    clearBookmarkImages(wrapper);
    wrapper.style.backgroundColor = '';
    wrapper.dataset.iconKey = nextKey;
    delete wrapper.dataset.faviconDomain;

    const customImg = document.createElement('img');
    customImg.className = 'bookmark-img';
    customImg.alt = '';
    customImg.onload = () => {
      if (wrapper.dataset.iconKey !== nextKey) {
        debugFavicon('abort/race detected', {
          reason: 'custom-icon-load',
          nodeId: bookmarkNode.id,
          iconKey: nextKey
        });
        showFallbackNow('custom-icon-abort');
        return;
      }
      cancelFallback();
      customImg.classList.add('loaded');
      wrapper.style.backgroundColor = 'transparent';
      hideFallback();
      debugFavicon('custom icon shown', {
        nodeId: bookmarkNode.id,
        iconKey: nextKey
      });
    };
    customImg.onerror = () => {
      if (wrapper.dataset.iconKey !== nextKey) {
        debugFavicon('abort/race detected', {
          reason: 'custom-icon-error',
          nodeId: bookmarkNode.id,
          iconKey: nextKey
        });
        showFallbackNow('custom-icon-abort');
        return;
      }
      customImg.remove();
      showFallbackNow('custom-icon-error');
    };
    customImg.src = meta.icon;
    wrapper.appendChild(customImg);
    return;
  }

  if (meta && meta.iconCleared === true) {
    clearBookmarkImages(wrapper);
    wrapper.style.backgroundColor = '';
    showFallbackNow('icon-cleared');
    wrapper.dataset.iconKey = nextKey;
    delete wrapper.dataset.faviconDomain;
    return;
  }

  const domainKey = getDomainKeyFromUrl(bookmarkNode.url);

  if (!domainKey) {
    clearBookmarkImages(wrapper);
    wrapper.style.backgroundColor = '';
    fallbackIcon.textContent = '?';
    showFallbackNow('missing-domain');
    wrapper.dataset.iconKey = nextKey;
    delete wrapper.dataset.faviconDomain;
    return;
  }

  if (wrapper.dataset.iconKey === nextKey &&
      wrapper.dataset.faviconDomain === domainKey &&
      existingLoaded) {
    wrapper.dataset.iconKey = nextKey;
    hideFallback();
    return;
  }

  clearBookmarkImages(wrapper);

  // 2. Prepare image icon (stacked above fallback).
  const imgIcon = document.createElement('img');
  imgIcon.className = 'bookmark-img';
  if (!imgIcon.decoding) {
    imgIcon.decoding = 'async';
  }
  if (!imgIcon.loading) {
    imgIcon.loading = 'lazy';
  }
  if (!imgIcon.getAttribute('fetchpriority')) {
    imgIcon.setAttribute('fetchpriority', 'low');
  }
  if (!imgIcon.referrerPolicy) {
    imgIcon.referrerPolicy = 'no-referrer';
  }
  imgIcon.alt = '';

  const candidates = buildFaviconCandidates(bookmarkNode.url);

  wrapper.dataset.iconKey = nextKey;
  wrapper.dataset.faviconDomain = domainKey;
  wrapper.appendChild(imgIcon);

  const shouldAbort = () =>
    wrapper.dataset.iconKey !== nextKey ||
    wrapper.dataset.faviconDomain !== domainKey;

  const markLoaded = (img) => {
    if (img.naturalWidth >= 6) {
      img.classList.add('loaded');
      wrapper.style.backgroundColor = 'transparent';
      cancelFallback();
      return true;
    }
    return false;
  };

  const resolveTask = () => resolveFaviconForImageTarget({
    img: imgIcon,
    domainKey,
    candidates,
    shouldAbort,
    onResolved: (resolvedUrl, meta) => {
      if (!meta.sourceAlreadySet) {
        imgIcon.onload = () => {
          cancelFallback();
          if (shouldAbort()) {
            debugFavicon('abort/race detected', {
              reason: 'favicon-load',
              nodeId: bookmarkNode.id,
              domainKey,
              iconKey: nextKey
            });
            cancelFallback();
            return;
          }
          if (markLoaded(imgIcon)) {
            hideFallback();
            debugFavicon('favicon shown', {
              nodeId: bookmarkNode.id,
              domainKey,
              iconKey: nextKey
            });
          } else {
            showFallbackNow('favicon-too-small');
          }
        };
        imgIcon.onerror = () => {
          cancelFallback();
          if (shouldAbort()) {
            debugFavicon('abort/race detected', {
              reason: 'favicon-error',
              nodeId: bookmarkNode.id,
              domainKey,
              iconKey: nextKey
            });
            cancelFallback();
            return;
          }
          showFallbackNow('favicon-error');
        };
        setFaviconImageSrc(imgIcon, resolvedUrl);
        if (imgIcon.complete) {
          if (markLoaded(imgIcon)) {
            cancelFallback();
            hideFallback();
            debugFavicon('favicon shown', {
              nodeId: bookmarkNode.id,
              domainKey,
              iconKey: nextKey
            });
          }
        }
        return;
      }

      cancelFallback();
      if (markLoaded(imgIcon)) {
        hideFallback();
        debugFavicon('favicon shown', {
          nodeId: bookmarkNode.id,
          domainKey,
          iconKey: nextKey
        });
      } else {
        showFallbackNow('favicon-too-small');
      }
    },
    onFailed: () => {
      showFallbackNow('favicon-failed');
    },
    onNegativeCacheHit: () => {
      debugFavicon('favicon skipped (negative cache)', {
        nodeId: bookmarkNode.id,
        domainKey,
        iconKey: nextKey
      });
      showFallbackNow('negative-cache');
    },
    onAbort: () => {
      debugFavicon('abort/race detected', {
        reason: 'favicon-race',
        nodeId: bookmarkNode.id,
        domainKey,
        iconKey: nextKey
      });
      cancelFallback();
    },
    acceptCandidate: (img) => img.naturalWidth >= 6
  });
  queueFaviconResolution(imgIcon, resolveTask);
}

function renderFolderIconInto(wrapper, folderNode, iconKey) {
  if (!wrapper || !folderNode) return;

  wrapper.textContent = '';

  const meta = (folderMetadata && folderMetadata[folderNode.id]) || {};
  const customColor = meta.color || null;
  const customIcon = meta.icon || null;
  
  // Defaults

  const scale = meta.scale ?? 1;

  const offsetY = meta.offsetY ?? 0;
  const rotation = meta.rotation ?? 0;



  // 1. ALWAYS render the Base Folder SVG

  wrapper.innerHTML = useSvgIcon('bookmarkFolderLarge');

  

  // Apply Color to SVG

  const appliedColor = customColor || appBookmarkFolderColorPreference;

  const baseSvg = wrapper.querySelector('svg');

  tintSvgElement(baseSvg, appliedColor);



  // Complementary color for inner icon based on folder color

  const iconFillColor = getComplementaryColor(appliedColor);



  // 2. Render Custom Icon (Updated with transforms)

  if (customIcon) {

    // Base style for the icon (centered + custom offset/scale)

    // NOTE: Base CSS has transform: translate(-50%, -50%) scale(0.9). 

    // We override it here.

    const transformStyle = `transform: translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.9}) rotate(${rotation}deg);`;



    if (customIcon.startsWith('builtin:')) {

      const key = customIcon.replace('builtin:', '');

      const svgString = useSvgIcon(key);



      if (svgString) {

        const iconDiv = document.createElement('div');

        iconDiv.className = 'bookmark-folder-custom-icon';

        iconDiv.innerHTML = svgString;

        iconDiv.setAttribute('style', transformStyle);



        // Apply contrast fill to built-in SVG paths

        const svg = iconDiv.querySelector('svg');

        if (svg) {

          tintSvgElement(svg, iconFillColor);

        }

        wrapper.appendChild(iconDiv);

      }

    } else {

      const img = document.createElement('img');

      img.src = customIcon;

      img.className = 'bookmark-folder-custom-icon';

      img.setAttribute('style', transformStyle);

      wrapper.appendChild(img);

    }

  }



  wrapper.dataset.iconKey = iconKey !== undefined ? iconKey : getIconKeyForNode(folderNode);
}



function renderBookmark(bookmarkNode) {
  const item = document.createElement('div');
  item.className = 'bookmark-item';
  if (bookmarkNode.isBackButton) item.classList.add('back-button');

  item.dataset.bookmarkId = bookmarkNode.id;
  item.dataset.isFolder = 'false';

  const title = bookmarkNode.title || ' ';

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bookmark-icon-wrapper';
  renderBookmarkIconInto(iconWrapper, bookmarkNode);

  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;

  item.appendChild(iconWrapper);
  item.appendChild(titleSpan);

  return item;
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

 * NEW: Auto-resizes a textarea to fit its content.

 * (Around line 1178)

 */

function autoResizeTextarea(textarea) {

  // Reset height to 'auto' to shrink if text is deleted

  textarea.style.height = 'auto'; 



  // === NEW: Force a layout reflow ===

  // Reading a property like offsetHeight immediately after setting

  // a style forces the browser to recalculate the layout.

  // This ensures the scrollHeight we read next is 100% accurate.

  const _ = textarea.offsetHeight; 



  // === MODIFIED ===

  // 2px for border (1px top + 1px bottom)

  const verticalBorders = 2; 

  

  // Now scrollHeight is accurate, so we set the final height

  textarea.style.height = (textarea.scrollHeight + verticalBorders) + 'px';

}



/**

 * === MODIFIED ===

 * Renders a single folder item (MODIFIED for Sortable.js)

 * All manual D&D listeners have been removed.

 */

function renderBookmarkFolder(folderNode) {

  const item = document.createElement('div');

  item.className = 'bookmark-item';

  item.dataset.bookmarkId = folderNode.id;

  item.dataset.isFolder = 'true';



  const wrapper = document.createElement('div');

  wrapper.className = 'bookmark-icon-wrapper';



  renderFolderIconInto(wrapper, folderNode);

  item.appendChild(wrapper);

  const span = document.createElement('span');
  span.textContent = folderNode.title;
  item.appendChild(span);

  return item;

}







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

/**

 * Creates the "Back" button item for the grid.

 */

function createBackButton(parentId) {

  const item = document.createElement('a');

  item.href = '#';

  item.className = 'bookmark-item';

  item.dataset.backTargetId = parentId;

  item.innerHTML = `

    <div class="bookmark-icon-wrapper back-icon-wrapper">

      <img src="icons/back.svg" alt="Go back" class="back-icon" />

    </div>

    <span class="back-button-label">Back</span>

  `;

  return item;

}





/** 

 * Calculates layout metrics and renders the visible slice.

 */

function updateVirtualGrid() {
  // === FIX: Stop updates while dragging to prevent DOM recycling errors ===
  if (isGridDragging) return;

  if (!virtualizerState.isEnabled || !virtualizerState.items.length) return;

  const { mainContentEl, gridEl, items, rowHeight, itemWidth } = virtualizerState;

  if (!mainContentEl || !gridEl) return;

  const renderStart = performance.now();
  
  // 1. Calculate Columns
  const gridWidth = gridEl.clientWidth;
  const cols = Math.floor(gridWidth / itemWidth) || 1;
  virtualizerState.cols = cols;

  // 2. Calculate Total Height
  const totalRows = Math.ceil(items.length / cols);
  const totalHeight = totalRows * rowHeight;
  
  // 3. Determine Scroll Position
  const scrollTop = mainContentEl.scrollTop;
  const viewportHeight = mainContentEl.clientHeight;
  const bufferRows = 2; 

  // 4. Calculate Visible Range
  let startRow = Math.floor(scrollTop / rowHeight) - bufferRows;
  let endRow = Math.ceil((scrollTop + viewportHeight) / rowHeight) + bufferRows;

  startRow = Math.max(0, startRow);
  endRow = Math.min(totalRows, endRow);

  const startIndex = startRow * cols;
  const endIndex = Math.min(items.length, endRow * cols);
  perfState.lastRenderedStartIndex = startIndex;
  perfState.lastRenderedEndIndex = Math.max(startIndex, endIndex - 1);
  perfState.lastVirtualRange = { start: startIndex, end: Math.max(startIndex, endIndex - 1) };
  perfState.totalCount = items.length;

  // 5. Optimization: Only render if range changed (unless it's the first render)
  if (!virtualizerState.initialRender && startIndex === virtualizerState.lastStart && endIndex === virtualizerState.lastEnd) {

    return;

  }
  virtualizerState.lastStart = startIndex;
  virtualizerState.lastEnd = endIndex;

  // 6. Apply Styles
  gridEl.style.height = `${totalHeight}px`;
  gridEl.style.paddingTop = `${startRow * rowHeight}px`;
  gridEl.style.paddingBottom = '0px'; 

  // 7. Render Slice (DOM recycling)
  const existingNodes = Array.from(gridEl.children);
  const visibleItems = items.slice(startIndex, endIndex);

  visibleItems.forEach((node, index) => {
    let el = existingNodes[index];
    const neededType = node.isBackButton ? 'back' : (node.children ? 'folder' : 'bookmark');
    const existingType = el ? el.dataset.recyclingType : null;

    if (el && existingType === neededType) {
      updateElementData(el, node);
    } else {
      const newEl = createNodeForVirtualizer(node);
      newEl.dataset.recyclingType = neededType;

      if (virtualizerState.initialRender && !appPerformanceModePreference && appGridAnimationEnabledPreference) {
        const delay = index * 15;
        newEl.style.animationDelay = `${delay}ms`;
        newEl.classList.add('newly-rendered');

        newEl.addEventListener('animationend', () => {
          newEl.classList.remove('newly-rendered');
          newEl.style.animationDelay = '';
        }, { once: true });
      }

      if (el) {
        gridEl.replaceChild(newEl, el);
      } else {
        gridEl.appendChild(newEl);
      }

      el = newEl;
    }

    if (el) {
      el.dataset.recyclingType = neededType;
    }
  });

  // 8. Trim excess DOM nodes
  while (gridEl.children.length > visibleItems.length) {
    gridEl.lastChild.remove();
  }

  const nodeCount = visibleItems.length;
  perfState.gridRenderedNodes = nodeCount;
  perfState.lastGridRenderMs = performance.now() - renderStart;

  // --- NEW: Disable animation for future scrolls ---
  if (virtualizerState.initialRender) {
      // Force a reflow if needed, or just flip the flag so scrolling is instant
      virtualizerState.initialRender = false;
  }

  // *Important*: Re-initialize drag-and-drop ONLY for visible items (debounced)
  if (sortableTimeout) clearTimeout(sortableTimeout);
  sortableTimeout = setTimeout(() => {
      setupGridSortable(gridEl);
      sortableTimeout = null;
  }, 150);
}

function createNodeForVirtualizer(node) {
  if (node.isBackButton) return createBackButton(node.parentId);
  if (node.children) return renderBookmarkFolder(node);
  return renderBookmark(node);
}

function getIconKeyForNode(node) {
  if (!node || node.isBackButton) return '';

  const iconParts = [];
  const fallbackTextPref = (typeof appBookmarkFallbackTextColorPreference !== 'undefined')
    ? appBookmarkFallbackTextColorPreference
    : '';

  if (node.children) {
    const meta = (folderMetadata && folderMetadata[node.id]) || {};
    iconParts.push('folder');
    iconParts.push(meta.color || '');
    iconParts.push(meta.icon || '');
    iconParts.push(meta.scale ?? 1);
    iconParts.push(meta.offsetY ?? 0);
    iconParts.push(meta.rotation ?? 0);
    iconParts.push(appBookmarkFolderColorPreference || '');
  } else {
    const meta = (bookmarkMetadata && bookmarkMetadata[node.id]) || {};
    const title = node.title || ' ';
    const fallbackLetter = (title.trim().charAt(0) || '?').toUpperCase();
    iconParts.push('bookmark');
    iconParts.push(node.url || '');
    iconParts.push(fallbackLetter);
    iconParts.push(meta.icon || '');
    iconParts.push(`cleared:${meta.iconCleared === true}`);
    iconParts.push(appBookmarkFallbackColorPreference || '');
    iconParts.push(fallbackTextPref);
  }

  return iconParts.join('|');
}

function updateElementData(el, node) {
  const recyclingType = node.isBackButton ? 'back' : (node.children ? 'folder' : 'bookmark');
  el.dataset.recyclingType = recyclingType;
  el.dataset.bookmarkId = node.id || '';

  if (node.isBackButton) {
    el.dataset.backTargetId = node.parentId || '';
    delete el.dataset.isFolder;
  } else {
    el.dataset.isFolder = node.children ? 'true' : 'false';
  }

  const span = el.querySelector('span');
  if (span) {
    span.textContent = node.title || 'Back';
  }

  const iconWrapper = el.querySelector('.bookmark-icon-wrapper');
  if (iconWrapper) {
    if (node.isBackButton) return;

    const nextKey = getIconKeyForNode(node);
    const prevKey = iconWrapper.dataset.iconKey;

    if (nextKey !== prevKey) {
      if (node.children) {
        renderFolderIconInto(iconWrapper, node, nextKey);
      } else {
        renderBookmarkIconInto(iconWrapper, node, nextKey);
      }

      // DEV-ONLY: uncomment for parity checks against legacy rendering.
      // const legacyIcon = (node.children ? renderBookmarkFolder(node) : renderBookmark(node)).querySelector('.bookmark-icon-wrapper');
      // console.assert(!legacyIcon || iconWrapper.innerHTML === legacyIcon.innerHTML, 'Icon mismatch', node);
    }
  }
}

/**

 * Setup listeners for scrolling and resizing

 */

function initVirtualizer(allItems) {

  // Cleanup old listeners
  if (virtualizerState.scrollListener) {

    virtualizerState.mainContentEl.removeEventListener('scroll', virtualizerState.scrollListener);

  }
  if (virtualizerState.resizeObserver) {

    virtualizerState.resizeObserver.disconnect();

  }

  if (!virtualizerState.mainContentEl || !virtualizerState.gridEl) {

    return;

  }

  // Set State
  virtualizerState.items = allItems;
  virtualizerState.isEnabled = true;
  virtualizerState.lastStart = -1;
  virtualizerState.lastEnd = -1;
  virtualizerState.updateRafId = 0;
  
  // --- NEW: Flag to trigger animation only on first paint ---
  virtualizerState.initialRender = true; 

  // Shared RAF scheduler for scroll + resize
  let virtualGridRafId = 0;
  function scheduleVirtualGridUpdate() {

    if (!virtualizerState.isEnabled) return;
    if (virtualizerState.updateRafId) return;

    virtualGridRafId = requestAnimationFrame(() => {
      virtualizerState.updateRafId = 0;
      virtualGridRafId = 0;
      if (!virtualizerState.isEnabled) return;
      updateVirtualGrid();
    });
    virtualizerState.updateRafId = virtualGridRafId;
  }

  // Attach Scroll Listener (Throttled via shared scheduler)
  virtualizerState.scrollListener = () => {
    scheduleVirtualGridUpdate();
  };
  virtualizerState.mainContentEl.addEventListener('scroll', virtualizerState.scrollListener, { passive: true });

  // Attach Resize Listener
  virtualizerState.resizeObserver = new ResizeObserver(() => {
    scheduleVirtualGridUpdate();
  });
  virtualizerState.resizeObserver.observe(virtualizerState.gridEl);

  // Initial Paint
  updateVirtualGrid();
}

/**

 * Disable virtualization and clean up styles

 */

function disableVirtualizer() {

  virtualizerState.isEnabled = false;
  if (virtualizerState.updateRafId) {
    cancelAnimationFrame(virtualizerState.updateRafId);
    virtualizerState.updateRafId = 0;
  }

  if (sortableTimeout) {
    clearTimeout(sortableTimeout);
    sortableTimeout = null;
  }

  if (!virtualizerState.mainContentEl || !virtualizerState.gridEl) {

    return;

  }
  if (virtualizerState.scrollListener) {

    virtualizerState.mainContentEl.removeEventListener('scroll', virtualizerState.scrollListener);

  }
  if (virtualizerState.resizeObserver) {

    virtualizerState.resizeObserver.disconnect();

  }
  // Reset grid styles
  virtualizerState.gridEl.style.height = '';
  virtualizerState.gridEl.style.paddingTop = '';
  virtualizerState.gridEl.style.paddingBottom = '';
}



/**

 * Clears and re-renders the bookmarks grid (MODIFIED for Sortable.js)

 * @param {object} folderNode - The bookmark folder node to render.

 * @param {string | null} droppedItemId - The ID of an item that was just moved,

 * which should NOT be animated.

 */

function renderBookmarkGrid(folderNode, droppedItemId = null) {

  const grid = document.getElementById('bookmarks-grid');

  // Keep virtualization references fresh
  virtualizerState.gridEl = grid;
  virtualizerState.mainContentEl = virtualizerState.mainContentEl || document.querySelector('.main-content');

  grid.innerHTML = '';

  // --- Store the current folder node ---
  currentGridFolderNode = folderNode;

  // Reset virtualization state/styles for this render
  disableVirtualizer();

  // 2. Prepare Data List
  let itemsToRender = [];

  // Add Back Button object to the list if needed
  if (folderNode.id !== rootDisplayFolderId && folderNode.parentId !== rootDisplayFolderId && folderNode.parentId !== '0' && folderNode.parentId !== 'root________') {

    const parentNode = findBookmarkNodeById(bookmarkTree[0], folderNode.parentId);

    if (parentNode && parentNode.id !== rootDisplayFolderId) {

       itemsToRender.push({ isBackButton: true, parentId: parentNode.id });

    }

  }

  if (folderNode.children) {

    itemsToRender = itemsToRender.concat(folderNode.children);

  }

  // 3. DECISION: Virtualize or Standard?
  const VIRTUALIZATION_THRESHOLD = 150; // Enable if > 150 items

  if (itemsToRender.length > VIRTUALIZATION_THRESHOLD && !appPerformanceModePreference) {

    // --- VIRTUAL MODE ---
    initVirtualizer(itemsToRender);
    
    // NOTE: In virtual mode, we skip the "drop-in" animation for performance

  } else {

    // --- STANDARD MODE (Original Logic) ---
    const previousPositions = droppedItemId ? captureGridItemPositions(grid) : null;

    itemsToRender.forEach(node => {

      if (node.isBackButton) {

        const btn = createBackButton(node.parentId);

        btn.classList.add('back-button');

        grid.appendChild(btn);

      } else if (node.url) {

        grid.appendChild(renderBookmark(node));

      } else if (node.children) {

        grid.appendChild(renderBookmarkFolder(node));

      }

    });

    // FIX: Use the global 'sortableTimeout' so it can be cancelled if the user switches folders quickly.
    // Increased delay to 200ms to ensure layout/animations are stable first.
    if (sortableTimeout) clearTimeout(sortableTimeout);

    sortableTimeout = setTimeout(() => {
      setupGridSortable(grid);
      sortableTimeout = null;
    }, 200);

    // Apply Animations (Standard Mode Only)
    const domItems = grid.querySelectorAll('.bookmark-item');

    if (droppedItemId) {

      animateGridReorder(domItems, previousPositions);

    } else {

      domItems.forEach((item, index) => {

        if (item.classList.contains('back-button') || appPerformanceModePreference) {

          item.style.opacity = 1;

          return;

        }

        const delay = Math.min(index * 25, 500);

        item.style.animationDelay = `${delay}ms`;

        item.classList.add('newly-rendered');

        

        item.addEventListener('animationend', () => {

          item.classList.remove('newly-rendered');

          item.style.animationDelay = '';

        }, { once: true });

      });

    }

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
async function sortCurrentFolderByName() {
  const folderId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;
  if (!folderId) return;

  const tree = await getBookmarkTree(true);
  const folderNode = findBookmarkNodeById(tree[0], folderId);
  if (!folderNode || !folderNode.children) return;

  const children = [...folderNode.children];
  children.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
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

  tabButton.style.display = 'none';



  const input = document.createElement('input');

  input.type = 'text';

  input.className = 'bookmark-folder-input';

  input.value = folderNode.title;



  tabButton.parentNode.insertBefore(input, tabButton.nextSibling);



  input.focus();

  input.select();



  const cleanup = () => {

    input.remove();

    tabButton.style.display = 'block';

  };



  const saveAction = async () => {

    const newName = input.value.trim();

    if (newName && newName !== folderNode.title) {

      try {

        await browser.bookmarks.update(folderNode.id, { title: newName });

        loadBookmarks(folderNode.id);

      } catch (err) {

        console.error("Error updating folder:", err);

        cleanup();

      }

    } else {

      cleanup();

    }

  };



  input.addEventListener('keydown', async (e) => {

    if (e.key === 'Enter') {

      e.preventDefault();

      saveAction();

    } else if (e.key === 'Escape') {

      e.preventDefault();

      cleanup();

    }

  });



  input.addEventListener('blur', saveAction);

}



/**

 * === MODIFIED ===

 * Replaces a grid item's span with an input field to edit its name.

 */

function showGridItemRenameInput(gridItem, bookmarkNode) {

  const titleSpan = gridItem.querySelector('span');

  if (!titleSpan) return;

  

  titleSpan.style.display = 'none';



  // === FIX: Add class to allow parent to grow ===

  gridItem.classList.add('is-renaming');



  // --- MODIFIED: Use a <textarea> for multi-line support ---

  const input = document.createElement('textarea');

  input.className = 'grid-item-rename-input';

  input.value = bookmarkNode.title;



  input.rows = 1; // Set the default rows to 1

  

  // Stop the click from bubbling to the parent div's click listener

  input.addEventListener('click', (e) => {

    e.stopPropagation();

  });



  // Stop mousedown from bubbling to Sortable.js

  input.addEventListener('mousedown', (e) => {

    e.stopPropagation();

  });



  // --- NEW: Add auto-resize listener ---

  input.addEventListener('input', () => {

    autoResizeTextarea(input);

  });



  gridItem.appendChild(input);



  // --- NEW: Call resize function immediately after append ---

  autoResizeTextarea(input); 

  input.focus();

  input.select();



  const cleanup = () => {

    // === FIX: Remove class to restore parent's fixed height ===

    gridItem.classList.remove('is-renaming');



    input.remove();

    titleSpan.style.display = '-webkit-box'; // Restore original display

  };



  const saveAction = async () => {

    const newName = input.value.trim();

    if (newName && newName !== bookmarkNode.title) {

      try {

        await browser.bookmarks.update(bookmarkNode.id, { title: newName });

        

        // Refresh the tree and re-render the current grid

        const newTree = await getBookmarkTree(true);

        

        const activeGridNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

        

        if (activeGridNode) {

          renderBookmarkGrid(activeGridNode); // This will remove the input

        } else {

          loadBookmarks(activeHomebaseFolderId); // Fallback

        }

        

      } catch (err) {

        console.error("Error updating bookmark:", err);

        cleanup(); // On error, just revert

      }

    } else {

      cleanup(); // No change, revert

    }

  };



  input.addEventListener('keydown', async (e) => {

    // --- MODIFIED: Allow Shift+Enter for newline, just Enter to save ---

    if (e.key === 'Enter' && !e.shiftKey) {

      e.preventDefault(); // Stop newline

      saveAction();

    } else if (e.key === 'Escape') {

      e.preventDefault();

      cleanup();

    }

  });



  input.addEventListener('blur', saveAction);

}





/**

 * Creates the folder tab buttons (MODIFIED for Sortable.js)

 * All manual D&D listeners have been removed.

 */

function createFolderTabs(homebaseFolder, activeFolderId = null) {

  bookmarkFolderTabsContainer.innerHTML = '';

  if (bookmarkTabsTrack) {

    bookmarkTabsTrack.scrollLeft = 0;

  }

  

  const folderChildren = homebaseFolder.children.filter(node => !node.url && node.children);

  

  let folderToSelect = null;

  if (activeFolderId) {

    folderToSelect = folderChildren.find(f => f.id === activeFolderId);

  }

  if (!folderToSelect && folderChildren.length > 0) {

    folderToSelect = folderChildren[0];

  }

  

  folderChildren.forEach((folderNode, index) => {

    const tabButton = document.createElement('button');

    tabButton.className = 'bookmark-folder-tab';

    tabButton.textContent = folderNode.title;

    

    tabButton.dataset.folderId = folderNode.id;

    tabButton.dataset.index = index;

    

    if (folderToSelect && folderNode.id === folderToSelect.id) {

      tabButton.classList.add('active');

    }



    tabButton.addEventListener('contextmenu', (e) => {

      e.preventDefault();

      e.stopPropagation();



      folderContextMenu.style.top = `${e.clientY}px`;

      folderContextMenu.style.left = `${e.clientX}px`;

      folderContextMenu.classList.remove('hidden');



      menuEditBtn.onclick = () => {

        folderContextMenu.classList.add('hidden');

        showEditInput(tabButton, folderNode);

      };



      menuDeleteBtn.onclick = async () => {

        folderContextMenu.classList.add('hidden');



        const confirmed = await showDeleteConfirm(

          `Delete "${folderNode.title}" and all its contents?`,

          { isFolder: true, node: folderNode }

        );

        if (confirmed) {

          deleteBookmarkFolder(folderNode.id);

        }

      };

    });

    

    // All manual 'draggable' and 'dragstart'/'dragend' listeners removed.

    

    bookmarkFolderTabsContainer.appendChild(tabButton);

  });

  if (bookmarkFolderTabsContainer._tabClickHandler) {
    bookmarkFolderTabsContainer.removeEventListener('click', bookmarkFolderTabsContainer._tabClickHandler);
  }

  const tabClickHandler = (e) => {
    const tabButton = e.target.closest('.bookmark-folder-tab');
    if (!tabButton) return;
    if (isTabDragging) return;

    document.querySelectorAll('.bookmark-folder-tab').forEach(btn => btn.classList.remove('active'));
    tabButton.classList.add('active');

    const folderId = tabButton.dataset.folderId;
    const freshNode = findBookmarkNodeById(bookmarkTree[0], folderId);
    
    if (freshNode) {
      renderBookmarkGrid(freshNode);
      activeHomebaseFolderId = freshNode.id;
    }

    requestAnimationFrame(() => scrollActiveFolderTabIntoView({ behavior: 'smooth' }));
  };

  bookmarkFolderTabsContainer.addEventListener('click', tabClickHandler);
  bookmarkFolderTabsContainer._tabClickHandler = tabClickHandler;



  const addButton = document.createElement('button');

  addButton.className = 'bookmark-folder-add-btn';

  addButton.setAttribute('aria-label', 'Create New Folder');

  addButton.title = 'Create New Folder';

  addButton.innerHTML = useSvgIcon('bookmarkTabsPlus');

  

  addButton.addEventListener('click', (e) => {

    e.stopPropagation();

    

    addButton.style.display = 'none';



    const input = document.createElement('input');

    input.type = 'text';

    input.id = 'new-folder-input';

    input.className = 'bookmark-folder-input';

    input.value = 'New Folder';

    input.placeholder = 'Folder Name';



    const saveButton = document.createElement('button');

    saveButton.className = 'bookmark-folder-save-btn';

    saveButton.textContent = '?';

    saveButton.title = 'Save Folder';



    const cancelButton = document.createElement('button');

    cancelButton.className = 'bookmark-folder-cancel-btn';

    cancelButton.textContent = '?';

    cancelButton.title = 'Cancel';



    function cleanup() {

      input.remove();

      saveButton.remove();

      cancelButton.remove();

      addButton.style.display = 'flex';

    }

    

    const saveAction = () => {

      const folderName = input.value.trim();

      if (folderName) {

        createNewBookmarkFolder(folderName);

      } else {

        cleanup();

      }

    };



    saveButton.addEventListener('mousedown', (e) => e.preventDefault());

    cancelButton.addEventListener('mousedown', (e) => e.preventDefault());

    saveButton.addEventListener('click', saveAction);

    cancelButton.addEventListener('click', cleanup);



    input.addEventListener('keydown', (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        saveButton.click();

      } else if (e.key === 'Escape') {

        e.preventDefault();

        cancelButton.click();

      }

    });



    input.addEventListener('blur', saveAction);

    bookmarkFolderTabsContainer.appendChild(input);

    bookmarkFolderTabsContainer.appendChild(saveButton);

    bookmarkFolderTabsContainer.appendChild(cancelButton);

    input.focus();

    input.select();

  });

  

  // 'dragover' listener on add-button removed.

  

  bookmarkFolderTabsContainer.appendChild(addButton);

  requestAnimationFrame(updateBookmarkTabOverflow);
  requestAnimationFrame(() => scrollActiveFolderTabIntoView({ behavior: 'smooth' }));



  // --- NEW: Initialize Sortable.js on the tabs ---

  setupTabsSortable(bookmarkFolderTabsContainer);



  if (folderToSelect) {

    renderBookmarkGrid(folderToSelect);

    activeHomebaseFolderId = folderToSelect.id;

  } else if (folderChildren.length === 0) {

    console.warn(`No folders found inside "${homebaseFolder.title}". Displaying its contents.`);

    renderBookmarkGrid(homebaseFolder);

    activeHomebaseFolderId = homebaseFolder.id;

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

    const stored = await browser.storage.local.get(BOOKMARK_META_KEY);

    bookmarkMetadata = stored[BOOKMARK_META_KEY] || {};

  } catch (e) {

    console.warn('Failed to load bookmark metadata', e);

    bookmarkMetadata = {};

  }

}




async function loadDomainIconMap() {
  try {
    const stored = await browser.storage.local.get(DOMAIN_ICON_MAP_KEY);
    domainIconMap = stored[DOMAIN_ICON_MAP_KEY] || {};
  } catch (e) {
    console.warn('Failed to load domain icon map', e);
    domainIconMap = {};
  }
}

async function saveDomainIconMap() {
  try {
    await browser.storage.local.set({ [DOMAIN_ICON_MAP_KEY]: domainIconMap });
  } catch (e) {
    console.warn('Failed to save domain icon map', e);
  }
}

function trimDomainIconMap() {
  const keys = Object.keys(domainIconMap || {});
  if (keys.length > DOMAIN_ICON_MAP_LIMIT) {
    const overflow = keys.length - DOMAIN_ICON_MAP_LIMIT;
    const toDelete = keys.slice(0, overflow);
    toDelete.forEach((key) => delete domainIconMap[key]);
  }
}

function getStoredIconForDomain(domain) {
  if (!domain || !domainIconMap) return null;
  return domainIconMap[domain] || null;
}

function storeIconForDomain(domain, dataUrl) {
  if (!domain || !dataUrl) return;
  domainIconMap[domain] = dataUrl;
  trimDomainIconMap();
  saveDomainIconMap();
}

async function loadLastUsedFolderId() {
  try {
    const stored = await browser.storage.local.get(LAST_USED_BOOKMARK_FOLDER_KEY);
    lastUsedBookmarkFolderId = stored[LAST_USED_BOOKMARK_FOLDER_KEY] || null;
  } catch (e) {
    console.warn('Failed to load last used bookmark folder id', e);
    lastUsedBookmarkFolderId = null;
  }
}

async function setLastUsedFolderId(id) {
  lastUsedBookmarkFolderId = id || null;
  try {
    await browser.storage.local.set({ [LAST_USED_BOOKMARK_FOLDER_KEY]: lastUsedBookmarkFolderId });
  } catch (e) {
    console.warn('Failed to persist last used folder id', e);
  }
}

async function loadFolderMetadata() {

  try {

    const stored = await browser.storage.local.get(FOLDER_META_KEY);

    folderMetadata = stored[FOLDER_META_KEY] || {};

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

function buildFolderIndexFromTree(tree) {
  const rootNode = Array.isArray(tree) ? tree[0] : tree;
  if (!rootNode || !rootNode.children) return [];

  const folders = [];
  const traverse = (node, pathParts, depth, rootGroupLabel) => {
    if (!node || node.url) return;
    const title = node.title || 'Untitled';
    const currentPath = [...pathParts, title];
    const rootLabel = rootGroupLabel || currentPath[0] || 'Bookmarks';

    folders.push({
      id: node.id,
      title,
      pathLabel: currentPath.join(' › '),
      depth,
      rootGroupLabel: rootLabel,
    });

    if (node.children && node.children.length) {
      node.children.forEach((child) => {
        if (child && child.children) {
          traverse(child, currentPath, depth + 1, rootLabel);
        }
      });
    }
  };

  (rootNode.children || []).forEach((child) => traverse(child, [], 0, child.title || 'Bookmarks'));
  return folders;
}

function setFolderPickerError(message = '') {
  if (!folderPickerError) return;
  if (message) {
    folderPickerError.textContent = message;
    folderPickerError.classList.remove('hidden');
  } else {
    folderPickerError.textContent = '';
    folderPickerError.classList.add('hidden');
  }
}

function resetFolderPickerState() {
  folderPickerSelectedId = null;
  setFolderPickerError('');
  if (folderPickerSearchInput) {
    folderPickerSearchInput.value = '';
  }
  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = true;
  }
  if (folderPickerBreadcrumb) {
    folderPickerBreadcrumb.textContent = 'No folder selected';
  }
}

function invalidateFolderIndexCache() {
  cachedFolderIndex = null;
  cachedFolderIndexAt = 0;
}

function updateFolderPickerBreadcrumb() {
  if (!folderPickerBreadcrumb) return;
  const selected = folderPickerFolders.find((folder) => folder.id === folderPickerSelectedId);
  folderPickerBreadcrumb.textContent = selected ? selected.pathLabel : 'No folder selected';
}

function updateFolderPickerSelection(folderId, options = {}) {
  folderPickerSelectedId = folderId || null;
  const hasError = folderPickerError && !folderPickerError.classList.contains('hidden') && folderPickerError.textContent;

  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = !folderPickerSelectedId || Boolean(hasError);
  }

  updateFolderPickerBreadcrumb();

  if (!folderPickerList) return;
  const items = folderPickerList.querySelectorAll('.folder-picker-item');
  items.forEach((item) => {
    const isSelected = item.dataset.folderId === folderPickerSelectedId;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    if (isSelected && options.scrollIntoView) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function setFolderPickerStatus(text) {
  if (!folderPickerList) return;
  folderPickerList.innerHTML = '';
  const statusEl = document.createElement('div');
  statusEl.className = 'folder-picker-empty';
  statusEl.textContent = text;
  folderPickerList.appendChild(statusEl);
}

function renderFolderPickerList(folders, filterText = '') {
  if (!folderPickerList) return;

  const query = (filterText || '').trim().toLowerCase();
  const filtered = !query ? folders : folders.filter((folder) => {
    const title = (folder.title || '').toLowerCase();
    const path = (folder.pathLabel || '').toLowerCase();
    return title.includes(query) || path.includes(query);
  });

  const selectedVisible = folderPickerSelectedId && filtered.some((folder) => folder.id === folderPickerSelectedId);
  if (!selectedVisible) {
    folderPickerSelectedId = null;
  }

  folderPickerList.innerHTML = '';

  if (!filtered.length) {
    const message = folders.length ? 'No matching folders.' : 'No folders found.';
    setFolderPickerStatus(message);
    updateFolderPickerSelection(null);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((folder) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'folder-picker-item';
    item.dataset.folderId = folder.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', folder.id === folderPickerSelectedId ? 'true' : 'false');

    const titleEl = document.createElement('div');
    titleEl.className = 'folder-picker-title';
    titleEl.textContent = folder.title || 'Untitled';

    const pathEl = document.createElement('div');
    pathEl.className = 'folder-picker-path';
    pathEl.textContent = folder.pathLabel;

    item.appendChild(titleEl);
    item.appendChild(pathEl);

    item.addEventListener('click', () => {
      updateFolderPickerSelection(folder.id, { scrollIntoView: true });
    });

    fragment.appendChild(item);
  });

  folderPickerList.appendChild(fragment);
  updateFolderPickerSelection(folderPickerSelectedId);
}

function getFolderPickerFocusables() {
  if (!folderPickerModal || folderPickerModal.classList.contains('hidden')) return [];
  return Array.from(folderPickerModal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])'
  )).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function handleFolderPickerKeydown(e) {
  if (!folderPickerModal || folderPickerModal.classList.contains('hidden')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeFolderPicker();
    return;
  }

  if (e.key === 'Enter' && folderPickerConfirmBtn && !folderPickerConfirmBtn.disabled) {
    const tagName = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tagName !== 'textarea') {
      e.preventDefault();
      confirmFolderPickerSelection();
      return;
    }
  }

  if (e.key === 'Tab') {
    const focusables = getFolderPickerFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function attachFolderPickerKeydown() {
  document.addEventListener('keydown', handleFolderPickerKeydown, true);
}

function detachFolderPickerKeydown() {
  document.removeEventListener('keydown', handleFolderPickerKeydown, true);
}

async function openFolderPicker(triggerSource) {
  if (!folderPickerModal || !folderPickerPanel) return;

  folderPickerLastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  resetFolderPickerState();
  setFolderPickerStatus('Loading folders...');
  attachFolderPickerKeydown();

  const resolvedTriggerSource = triggerSource || homebaseChooseFolderBtn || 'homebase-choose-folder-btn';
  openModalWithAnimation('folder-picker-modal', resolvedTriggerSource, '#folder-picker-panel');

  if (folderPickerSearchInput) {
    setTimeout(() => folderPickerSearchInput.focus(), 50);
  }

  try {
    if (!browser.bookmarks) {
      setFolderPickerError('Bookmarks permission unavailable.');
      setFolderPickerStatus('Bookmarks access is required to browse folders.');
      return;
    }

    const now = Date.now();
    const useCachedIndex = cachedFolderIndex && now - cachedFolderIndexAt < FOLDER_INDEX_TTL_MS;

    if (useCachedIndex) {
      folderPickerFolders = cachedFolderIndex;
    } else {
      const tree = await getBookmarkTree(true);
      folderPickerFolders = buildFolderIndexFromTree(tree);
      cachedFolderIndex = folderPickerFolders;
      cachedFolderIndexAt = Date.now();
    }

    const storedRootId = await getHomebaseRootId();
    if (storedRootId && folderPickerFolders.some((folder) => folder.id === storedRootId)) {
      folderPickerSelectedId = storedRootId;
    }

    renderFolderPickerList(folderPickerFolders, folderPickerSearchInput ? folderPickerSearchInput.value : '');
    if (folderPickerSelectedId) {
      updateFolderPickerSelection(folderPickerSelectedId, { scrollIntoView: true });
    }
  } catch (err) {
    console.warn('Failed to open folder picker', err);
    folderPickerFolders = [];
    setFolderPickerError('Unable to read bookmarks. Please check permissions and try again.');
    setFolderPickerStatus('No folders available.');
  }
}

function closeFolderPicker() {
  detachFolderPickerKeydown();
  closeModalWithAnimation('folder-picker-modal', '#folder-picker-panel', () => {
    resetFolderPickerState();
    folderPickerFolders = [];
    if (folderPickerLastFocusedEl && typeof folderPickerLastFocusedEl.focus === 'function') {
      folderPickerLastFocusedEl.focus();
    }
  });
}

async function confirmFolderPickerSelection() {
  if (!folderPickerSelectedId || (folderPickerConfirmBtn && folderPickerConfirmBtn.disabled)) return;
  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = true;
  }

  try {
    await setHomebaseRootId(folderPickerSelectedId);
    closeFolderPicker();
    await loadBookmarks();
  } catch (err) {
    console.warn('Failed to set Homebase folder', err);
    setFolderPickerError('Could not set this folder. Please try again.');
    updateFolderPickerSelection(folderPickerSelectedId);
  } finally {
    if (folderPickerConfirmBtn) {
      folderPickerConfirmBtn.disabled = !folderPickerSelectedId;
    }
  }
}


/**

 * Now accepts an optional ID to keep a folder active after reload.

 */

async function loadBookmarks(activeFolderId = null) {

  beginBookmarksBoot();
  if (!browser.bookmarks) {

    console.warn('Bookmarks API not available.');

    showBookmarksEmptyState('Bookmarks permission unavailable.');
    return;

  }



  try {

    const tree = await getBookmarkTree(true);
    const treeRoot = tree && tree[0];
    if (!treeRoot) {
      console.warn('Bookmark tree is empty.');
      showBookmarksEmptyState();
      return;
    }

    let rootNode = null;
    const storedRootId = await getHomebaseRootId();

    if (storedRootId) {
      try {
        const lookup = await browser.bookmarks.get(storedRootId);
        const lookupNode = Array.isArray(lookup) ? lookup[0] : null;
        if (lookupNode && !lookupNode.url) {
          rootNode = findBookmarkNodeById(treeRoot, storedRootId);
          if (!rootNode || rootNode.url) {
            console.warn('Stored Homebase root not found in current tree.');
            await clearHomebaseRootId();
            rootNode = null;
          }
        } else {
          console.warn('Stored Homebase root is missing or not a folder.');
          await clearHomebaseRootId();
        }
      } catch (err) {
        console.warn('Failed to validate stored Homebase root', err);
        await clearHomebaseRootId();
      }
    }

    if (!rootNode) {
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
    processBookmarks([rootNode], activeFolderId, rootNode);

  } catch (err) {

    console.warn('Failed to load bookmarks', err);
    showBookmarksEmptyState('Bookmarks permission unavailable.');

  } finally {
    endBookmarksBoot();
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

function setupFolderPickerModal() {
  if (folderPickerSearchInput) {
    const debouncedFolderSearch = debounce(() => {
      renderFolderPickerList(folderPickerFolders, folderPickerSearchInput.value);
    }, 100);
    folderPickerSearchInput.addEventListener('input', () => {
      debouncedFolderSearch();
    });
  }

  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.addEventListener('click', confirmFolderPickerSelection);
  }

  if (folderPickerCancelBtn) {
    folderPickerCancelBtn.addEventListener('click', closeFolderPicker);
  }

  if (folderPickerModal) {
    folderPickerModal.addEventListener('click', (e) => {
      if (e.target === folderPickerModal) {
        closeFolderPicker();
      }
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

// --- MODIFIED: QUICK ACTIONS BAR SETUP ---

// ===============================================

function setupQuickActions() {

  

  quickAddBookmarkBtn.addEventListener('click', showAddBookmarkModal);

  

  quickAddFolderBtn.addEventListener('click', showAddFolderModal);



  if (quickOpenBookmarksBtn && gridBlankMenu) {
    const moreBtn = quickOpenBookmarksBtn;
    const blankMenu = gridBlankMenu;

    const closeMenuOutside = (e) => {
      if (!moreBtn.contains(e.target) && !blankMenu.contains(e.target)) {
        blankMenu.classList.add('hidden');
        document.removeEventListener('click', closeMenuOutside);
      }
    };

    // Click handler with tooltip hide + menu toggle
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const tooltip = moreBtn.querySelector('.tooltip-popup');
      if (tooltip) {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
      }

      document.querySelectorAll('.context-menu').forEach((el) => {
        if (el !== blankMenu) el.classList.add('hidden');
      });

      const isHidden = blankMenu.classList.contains('hidden');
      if (isHidden) {
        const rect = moreBtn.getBoundingClientRect();
        blankMenu.style.position = 'fixed';
        blankMenu.style.left = `${rect.left}px`;
        blankMenu.style.top = `${rect.bottom + 8}px`;
        blankMenu.classList.remove('hidden');
        document.addEventListener('click', closeMenuOutside);
      } else {
        blankMenu.classList.add('hidden');
        document.removeEventListener('click', closeMenuOutside);
      }
    });

    // Restore tooltip on mouse leave
    moreBtn.addEventListener('mouseleave', () => {
      const tooltip = moreBtn.querySelector('.tooltip-popup');
      if (tooltip) {
        tooltip.style.visibility = '';
        tooltip.style.opacity = '';
      }
    });
  }

}





// ===============================================

// --- QUOTE WIDGET & SETTINGS ---

// ===============================================

const quoteWidget = document.querySelector('.widget-quote');

const quoteSettingsBtn = document.getElementById('quote-settings-btn');

const quoteSettingsModal = document.getElementById('quote-settings-modal');

const quoteSettingsCloseBtn = document.getElementById('quote-settings-close-btn');

const quoteSettingsCancelBtn = document.getElementById('quote-settings-cancel-btn');

const quoteSettingsSaveBtn = document.getElementById('quote-settings-save-btn');

const quoteCategoriesList = document.getElementById('modal-quote-categories-list');

const quoteFrequencySelect = document.getElementById('quote-frequency-select');

const quoteText = document.getElementById('quote-text');

const quoteAuthor = document.getElementById('quote-author');

const quoteCopyBtn = document.getElementById('quote-copy-btn');

const quoteNextBtn = document.getElementById('quote-next-btn');

const QUOTE_FREQUENCY_KEY = 'quoteUpdateFrequency';

const QUOTE_LAST_FETCH_KEY = 'quoteLastFetched';

const QUOTE_BUFFER_KEY = 'quoteBufferCache';

const QUOTES_JSON_PATH = 'assets/quotes.json';

const QUOTE_INDEX_KEY = 'quoteLocalIndexV1';

const QUOTE_INDEX_VERSION = 1;

const QUOTE_SOURCE_MODE = 'local';

let quotesCachePromise = null;

let quoteIndexPromise = null;

let quoteIndexCache = null;

// Local quote loader (bundled JSON)
async function loadLocalQuotes() {

  const url = browser.runtime.getURL(QUOTES_JSON_PATH);

  const res = await fetch(url);

  if (!res.ok) {

    throw new Error('Failed to load local quotes');

  }

  const data = await res.json();

  if (!Array.isArray(data)) {

    throw new Error('Invalid quotes format');

  }

  const sanitized = data.map((q) => {

    const tags = Array.isArray(q?.tags)
      ? q.tags.map((t) => typeof t === 'string' ? t.trim() : '').filter(Boolean)
      : [];

    return {
      id: q.id,
      text: q.text,
      author: q.author || '',
      tags
    };

  }).filter((q) => q.id !== undefined && typeof q.text === 'string');

  return sanitized;

}

async function loadLocalQuotesCached() {

  if (!quotesCachePromise) {

    quotesCachePromise = (async () => {

      const quotes = await loadLocalQuotes();

      const quotesById = new Map();

      for (const q of quotes) {

        quotesById.set(q.id, q);

      }

      return { quotes, quotesById };

    })();

  }

  return quotesCachePromise;

}

// Build and cache quote ID index for quick tag lookups
async function ensureQuoteIndexBuilt() {

  if (quoteIndexCache) return quoteIndexCache;

  if (quoteIndexPromise) return quoteIndexPromise;

  quoteIndexPromise = (async () => {

    const stored = await browser.storage.local.get([QUOTE_INDEX_KEY]);

    const storedIndex = stored[QUOTE_INDEX_KEY];

    const { quotes } = await loadLocalQuotesCached();

    const expectedCount = quotes.length;

    const isStoredValid = storedIndex
      && storedIndex.version === QUOTE_INDEX_VERSION
      && storedIndex.count === expectedCount
      && Array.isArray(storedIndex.allIds)
      && storedIndex.allIds.length === expectedCount
      && storedIndex.tagToIds
      && typeof storedIndex.tagToIds === 'object';

    if (isStoredValid) {

      quoteIndexCache = storedIndex;

      return storedIndex;

    }

    const tagToIds = {};

    const allIds = [];

    for (const q of quotes) {

      if (q.id === undefined || q.id === null) continue;

      allIds.push(q.id);

      for (const tag of q.tags || []) {

        if (!tagToIds[tag]) {

          tagToIds[tag] = [];

        }

        tagToIds[tag].push(q.id);

      }

    }

    const newIndex = {
      version: QUOTE_INDEX_VERSION,
      builtAt: Date.now(),
      count: allIds.length,
      allIds,
      tagToIds
    };

    quoteIndexCache = newIndex;

    await browser.storage.local.set({ [QUOTE_INDEX_KEY]: newIndex });

    return newIndex;

  })();

  try {

    return await quoteIndexPromise;

  } finally {

    quoteIndexPromise = null;

  }

}

async function getLocalQuote(tags = [], avoidId = null) {

  const normalizedTags = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t.trim()) : [];

  const index = await ensureQuoteIndexBuilt();

  const { quotesById } = await loadLocalQuotesCached();

  let candidateIds = [];

  if (normalizedTags.length === 0) {

    candidateIds = index.allIds.slice();

  } else {

    const set = new Set();

    normalizedTags.forEach((tag) => {

      const ids = index.tagToIds[tag];

      if (Array.isArray(ids)) {

        ids.forEach((id) => set.add(id));

      }

    });

    candidateIds = Array.from(set);

    if (candidateIds.length === 0) {

      candidateIds = index.allIds.slice();

    }

  }

  if (!candidateIds.length) {

    throw new Error('No local quotes available');

  }

  if (avoidId !== null && candidateIds.length > 1) {

    const filtered = candidateIds.filter((id) => id !== avoidId);

    if (filtered.length) {

      candidateIds = filtered;

    }

  }

  const selectedId = candidateIds[Math.floor(Math.random() * candidateIds.length)];

  const quote = quotesById.get(selectedId) || quotesById.values().next().value;

  if (!quote) {

    throw new Error('No quote object found for selected id');

  }

  return {
    id: quote.id,
    text: quote.text,
    author: quote.author,
    tags: quote.tags || []
  };

}

async function getLocalQuoteTags() {

  const index = await ensureQuoteIndexBuilt();

  const tags = Object.keys(index.tagToIds || {});

  tags.sort((a, b) => a.localeCompare(b));

  return tags.map((name) => ({ name }));

}


// --- Rebuilt Quote Logic: The "Refiller" ---
async function fetchQuote(options = {}) {

  const forceRefresh = options.forceRefresh === true;

  const ignorePrefetched = options.ignorePrefetched === true;

  try {

    let localStateRaw = localStorage.getItem('fast-quote-state');

    let localState = { current: null, next: null, config: {} };

    if (localStateRaw) {

      try {

        const parsed = JSON.parse(localStateRaw);

        localState = {
          current: parsed.current || null,
          next: parsed.next || null,
          config: parsed.config || {}
        };

      } catch (err) {

        console.warn('Failed to parse quote state, resetting', err);

      }

    }

    const stored = await browser.storage.local.get(['quoteTags', QUOTE_FREQUENCY_KEY]);

    const freq = stored[QUOTE_FREQUENCY_KEY] || 'hourly';

    const tags = Array.isArray(stored.quoteTags) ? stored.quoteTags.filter((t) => typeof t === 'string' && t.trim()) : [];

    localState.config.frequency = freq;

    localState.config.source = QUOTE_SOURCE_MODE;

    const renderQuote = (q) => {

      if (!q || !quoteText || !quoteAuthor) return;

      quoteText.textContent = `"${q.text}"`;

      quoteAuthor.textContent = q.author ? `- ${q.author}` : '';

      revealWidget('.widget-quote');

    };

    const now = Date.now();

    let rotatedFromNext = false;

    if (forceRefresh && !ignorePrefetched && localState.next && localState.next.text) {

      localState.current = localState.next;

      localState.next = null;

      localState.config.lastShown = now;

      rotatedFromNext = true;

      renderQuote(localState.current);

    }

    if (!localState.current || !localState.current.text) {

      const q = await getLocalQuote(tags);

      localState.current = q;

      localState.config.lastShown = now;

      renderQuote(q);

    } else if (forceRefresh && !rotatedFromNext) {

      const newCurrent = await getLocalQuote(tags, localState.current.id);

      localState.current = newCurrent;

      localState.config.lastShown = now;

      renderQuote(newCurrent);

    } else {

      renderQuote(localState.current);

    }

    const avoidId = localState.current ? localState.current.id : null;

    const shouldRefreshNext = forceRefresh || !localState.next || !localState.next.text || (avoidId !== null && localState.next.id === avoidId);

    if (shouldRefreshNext) {

      const nextQ = await getLocalQuote(tags, avoidId);

      localState.next = nextQ;

    }

    localStorage.setItem('fast-quote-state', JSON.stringify({
      current: localState.current,
      next: localState.next,
      config: localState.config
    }));

  } catch (e) {

    console.warn("Quote Logic Error", e);

  }

}



async function populateQuoteCategories() {

  if (!quoteCategoriesList) return;

  quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Loading categories...</span>';

  const stored = await browser.storage.local.get(['quoteTags']);

  const savedRaw = Array.isArray(stored.quoteTags) ? stored.quoteTags.filter((t) => typeof t === 'string' && t.trim()) : [];

  const savedTags = new Set(savedRaw);

  const render = (tags) => {

    quoteCategoriesList.innerHTML = '';

    const allPill = document.createElement('button');

    allPill.className = 'quote-category-pill';
    allPill.id = 'quote-categories-all-btn';

    allPill.textContent = 'All Categories';

    allPill.dataset.value = '__all__';

    allPill.style.fontWeight = '600';

    quoteCategoriesList.appendChild(allPill);

    const tagPills = [];

    tags.forEach((tag) => {

      const tagName = typeof tag === 'string' ? tag : tag.name;

      if (!tagName) return;

      const pill = document.createElement('button');

      pill.className = 'quote-category-pill';

      pill.textContent = tagName;

      pill.dataset.value = tagName;

      quoteCategoriesList.appendChild(pill);

      tagPills.push(pill);

    });

    const isAllMode = savedTags.size === 0;

    if (isAllMode) {

      allPill.classList.add('selected');

    } else {

      tagPills.forEach((pill) => {

        if (savedTags.has(pill.dataset.value)) {

          pill.classList.add('selected');

        }

      });

      const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));

      if (!anySelected) {

        allPill.classList.add('selected');

      }

    }

    const selectAllOnly = () => {

      allPill.classList.add('selected');

      tagPills.forEach((pill) => pill.classList.remove('selected'));

    };

    const ensureFallbackAll = () => {

      const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));

      if (!anySelected) {

        selectAllOnly();

      }

    };

    allPill.addEventListener('click', () => {

      selectAllOnly();

    });

    tagPills.forEach((pill) => {

      pill.addEventListener('click', () => {

        allPill.classList.remove('selected');

        pill.classList.toggle('selected');

        ensureFallbackAll();

      });

    });

  };

  try {

    const categories = await getLocalQuoteTags();

    if (categories.length > 0) {

      render(categories);

    } else {

      quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">No categories found</span>';

    }

  } catch (err) {

    console.warn('Failed to load local quote categories', err);

    quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Unable to load categories</span>';

  }

}

function closeQuoteSettingsModal() {
  closeModalWithAnimation('quote-settings-modal', '.dialog-content');
}

async function openQuoteSettingsModal(triggerSource) {
  populateQuoteCategories();
  const data = await browser.storage.local.get(QUOTE_FREQUENCY_KEY);
  if (quoteFrequencySelect) {
    quoteFrequencySelect.value = data[QUOTE_FREQUENCY_KEY] || 'hourly';
  }
  openModalWithAnimation('quote-settings-modal', triggerSource || null, '.dialog-content');
}

function setupQuoteWidget() {

  if (quoteSettingsBtn) {

    quoteSettingsBtn.addEventListener('click', () => openQuoteSettingsModal(quoteSettingsBtn));

  }

  if (quoteSettingsCloseBtn) {

    quoteSettingsCloseBtn.addEventListener('click', closeQuoteSettingsModal);

  }

  if (quoteSettingsCancelBtn) {

    quoteSettingsCancelBtn.addEventListener('click', closeQuoteSettingsModal);

  }

  if (quoteCopyBtn) {

    quoteCopyBtn.addEventListener('click', () => {

      const text = quoteText.textContent;

      const author = quoteAuthor.textContent;

      const fullQuote = `${text} ${author}`.trim();

      navigator.clipboard.writeText(fullQuote).then(() => {

        const originalIcon = quoteCopyBtn.innerHTML;

        quoteCopyBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';

        setTimeout(() => {

          quoteCopyBtn.innerHTML = originalIcon;

        }, 1500);

      });

    });

  }

  if (quoteNextBtn) {

    quoteNextBtn.addEventListener('click', async () => {

      const icon = quoteNextBtn.querySelector('svg');

      if (icon) {

        icon.style.transition = 'transform 0.4s ease';

        icon.style.transform = 'rotate(360deg)';

        setTimeout(() => {

          icon.style.transition = 'none';

          icon.style.transform = 'none';

        }, 400);

      }

      await browser.storage.local.set({ [QUOTE_LAST_FETCH_KEY]: 0 });

      fetchQuote({ forceRefresh: true });

    });

  }

  if (quoteSettingsModal) {

    quoteSettingsModal.addEventListener('click', (e) => {

      if (e.target === quoteSettingsModal) {

        closeQuoteSettingsModal();

      }

    });

  }

  if (quoteSettingsSaveBtn) {

    quoteSettingsSaveBtn.addEventListener('click', async () => {

      const allPill = quoteCategoriesList ? quoteCategoriesList.querySelector('.quote-category-pill[data-value="__all__"]') : null;

      const categoryPills = quoteCategoriesList ? quoteCategoriesList.querySelectorAll('.quote-category-pill') : [];

      const selectedTags = Array.from(categoryPills)
        .filter((pill) => pill.dataset.value !== '__all__' && pill.classList.contains('selected'))
        .map((pill) => pill.dataset.value);

      const allSelected = allPill ? allPill.classList.contains('selected') : selectedTags.length === 0;

      const tagsToSave = allSelected ? [] : selectedTags;

      const frequency = quoteFrequencySelect ? quoteFrequencySelect.value : 'hourly';

      await browser.storage.local.remove(QUOTE_BUFFER_KEY);

      await browser.storage.local.set({ quoteTags: tagsToSave, [QUOTE_FREQUENCY_KEY]: frequency, [QUOTE_LAST_FETCH_KEY]: 0 });

      closeQuoteSettingsModal();

      fetchQuote({ forceRefresh: true, ignorePrefetched: true });

    });

  }

}





// ===============================================

// --- TO-DO WIDGET ---

// ===============================================

const todoWidget = document.querySelector('.widget-todo');

const todoInput = document.getElementById('todo-input');

const todoAddBtn = document.getElementById('todo-add-btn');

const todoList = document.getElementById('todo-list');

const todoClearBtn = document.getElementById('todo-clear-btn');

const todoHideDoneToggle = document.getElementById('todo-hide-done');

const TODO_ITEMS_KEY = 'todoItems';

const TODO_HIDE_DONE_KEY = 'todoHideDone';

let todoItems = [];

let todoHideDone = false;

function generateTodoId() {
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTodoItems(items) {
  const list = Array.isArray(items) ? items : [];
  const normalized = [];
  const seen = new Set();
  list.forEach((item) => {
    if (!item || typeof item.text !== 'string') return;
    const text = item.text.trim();
    if (!text) return;
    let id = typeof item.id === 'string' && item.id.trim() ? item.id : generateTodoId();
    if (seen.has(id)) return;
    seen.add(id);
    const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
    normalized.push({
      id,
      text,
      done: item.done === true,
      createdAt
    });
  });
  return normalized;
}

function getVisibleTodoItems() {
  if (!todoHideDone) return todoItems.slice();
  return todoItems.filter((item) => !item.done);
}

function renderTodoList() {
  if (!todoList) return;
  const visibleItems = getVisibleTodoItems();
  todoList.innerHTML = '';
  if (visibleItems.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'todo-empty';
    empty.textContent = 'No tasks yet';
    todoList.appendChild(empty);
  } else {
    visibleItems.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'todo-item';
      if (item.done) li.classList.add('done');

      const label = document.createElement('label');
      label.className = 'todo-item-main';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'todo-toggle';
      toggle.checked = item.done === true;
      toggle.dataset.todoId = item.id;

      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = item.text;

      label.appendChild(toggle);
      label.appendChild(text);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'todo-delete-btn';
      delBtn.dataset.todoId = item.id;
      delBtn.setAttribute('aria-label', 'Delete task');
      delBtn.textContent = 'Delete';

      li.appendChild(label);
      li.appendChild(delBtn);
      todoList.appendChild(li);
    });
  }

  if (todoHideDoneToggle) {
    todoHideDoneToggle.checked = todoHideDone;
  }

  revealWidget('.widget-todo');
}

function updateTodoCache() {
  try {
    if (!window.localStorage) return;
    const payload = {
      items: todoItems.map((item) => ({
        id: item.id,
        text: item.text,
        done: item.done === true,
        createdAt: item.createdAt
      })),
      hideDone: todoHideDone,
      __timestamp: Date.now()
    };
    localStorage.setItem('fast-todo', JSON.stringify(payload));
  } catch (err) {
    // Ignore; fast cache is best-effort only
  }
}

function persistTodoState() {
  if (!browser || !browser.storage || !browser.storage.local) return;
  browser.storage.local
    .set({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone })
    .catch((err) => {
      console.warn('Failed to save todo items', err);
    });
}

function commitTodoState(options = {}) {
  renderTodoList();
  updateTodoCache();
  if (options.persist !== false) {
    persistTodoState();
  }
}

async function loadTodoState() {
  if (!browser || !browser.storage || !browser.storage.local) {
    commitTodoState({ persist: false });
    return;
  }
  try {
    const stored = await browser.storage.local.get([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY]);
    todoItems = normalizeTodoItems(stored[TODO_ITEMS_KEY]);
    todoHideDone = stored[TODO_HIDE_DONE_KEY] === true;
  } catch (err) {
    console.warn('Failed to load todo items', err);
  }
  commitTodoState({ persist: false });
}

function addTodoFromInput() {
  if (!todoInput) return;
  const text = todoInput.value.trim();
  if (!text) return;
  todoItems.push({
    id: generateTodoId(),
    text,
    done: false,
    createdAt: Date.now()
  });
  todoInput.value = '';
  commitTodoState();
}

function clearCompletedTodos() {
  const nextItems = todoItems.filter((item) => !item.done);
  if (nextItems.length === todoItems.length) return;
  todoItems = nextItems;
  commitTodoState();
}

function handleTodoToggle(event) {
  const target = event.target;
  if (!target || !target.classList || !target.classList.contains('todo-toggle')) return;
  const id = target.dataset.todoId;
  if (!id) return;
  const item = todoItems.find((entry) => entry.id === id);
  if (!item) return;
  item.done = target.checked;
  commitTodoState();
}

function handleTodoDelete(event) {
  if (!todoList) return;
  const btn = event.target.closest('.todo-delete-btn');
  if (!btn || !todoList.contains(btn)) return;
  const id = btn.dataset.todoId;
  if (!id) return;
  const nextItems = todoItems.filter((entry) => entry.id !== id);
  if (nextItems.length === todoItems.length) return;
  todoItems = nextItems;
  commitTodoState();
}

async function setupTodoWidget() {
  if (!todoWidget || !todoList || !todoInput) return;
  if (todoWidget.dataset.ready === '1') return;
  todoWidget.dataset.ready = '1';

  if (todoAddBtn) {
    todoAddBtn.addEventListener('click', addTodoFromInput);
  }

  if (todoInput) {
    todoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTodoFromInput();
      }
    });
  }

  if (todoList) {
    todoList.addEventListener('change', handleTodoToggle);
    todoList.addEventListener('click', handleTodoDelete);
  }

  if (todoClearBtn) {
    todoClearBtn.addEventListener('click', clearCompletedTodos);
  }

  if (todoHideDoneToggle) {
    todoHideDoneToggle.addEventListener('change', () => {
      todoHideDone = todoHideDoneToggle.checked;
      commitTodoState();
    });
  }

  await loadTodoState();
}



// ===============================================

// --- TIME AND DATE ---

// ===============================================

function updateTime() {

  const now = new Date();

  const timeEl = document.getElementById('current-time');

  const dateEl = document.getElementById('current-date');

  const useHour12 = timeFormatPreference === '12-hour';

  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: useHour12 });

  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };

  dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);



  revealWidget('.widget-time');

}



function applyTimeFormatPreference(format = '12-hour') {

  timeFormatPreference = format === '12-hour' ? '12-hour' : '24-hour';

  // FIX: Sync to localStorage so instant_load.js knows the preference immediately
  try {
    localStorage.setItem('fast-time-format', timeFormatPreference);
  } catch (e) {
    // Ignore if cookies/storage are disabled
  }

}



function applySidebarVisibility(showSidebar = true) {

  appShowSidebarPreference = showSidebar !== false;

  if (document.documentElement) {
    document.documentElement.classList.toggle('sidebar-hidden', !appShowSidebarPreference);
  }
  if (document.body) {
    document.body.classList.toggle('sidebar-hidden', !appShowSidebarPreference);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-sidebar', appShowSidebarPreference ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_SIDEBAR_KEY]: appShowSidebarPreference })
      .catch((err) => {
        console.warn('Failed to save sidebar visibility preference', err);
      });
  }

  updateSidebarCollapseState();

  updateWidgetSettingsUI();

}

function setWeatherPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowWeatherPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('weather-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-weather', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_WEATHER_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save weather visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}

function setQuotePreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowQuotePreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('quote-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-quote', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_QUOTE_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save quote visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}

function setNewsPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowNewsPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('news-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-news', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_NEWS_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save news visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}

function setTodoPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowTodoPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('todo-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-todo', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_TODO_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save todo visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}

function normalizeWidgetOrder(order) {
  const normalized = [];
  const seen = new Set();

  if (Array.isArray(order)) {
    order.forEach((value) => {
      if (typeof value !== 'string') return;
      const key = value.trim();
      if (!WIDGET_ORDER_SET.has(key) || seen.has(key)) return;
      seen.add(key);
      normalized.push(key);
    });
  }

  DEFAULT_WIDGET_ORDER.forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized;
}

function areWidgetOrdersEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function applyWidgetOrderToSidebar(order = widgetOrderPreference) {
  const sidebarEl = sidebar || document.querySelector('.sidebar');
  if (!sidebarEl) return;

  const widgets = {
    weather: document.querySelector('.widget-weather'),
    quote: document.querySelector('.widget-quote'),
    todo: document.querySelector('.widget-todo'),
    news: document.querySelector('.widget-news')
  };

  const fragment = document.createDocumentFragment();
  order.forEach((key) => {
    const widget = widgets[key];
    if (widget) fragment.appendChild(widget);
  });
  sidebarEl.appendChild(fragment);
}

function applyWidgetOrderToSettings(order = widgetOrderPreference) {
  const widgetList = document.getElementById('widget-sub-settings');
  if (!widgetList) return;

  ensureSubSettingsInner(widgetList);
  const widgetInner = widgetList.querySelector('.sub-settings-inner') || widgetList;
  const rows = Array.from(widgetInner.querySelectorAll('.widget-setting-row'));
  if (!rows.length) return;

  const rowMap = new Map(rows.map((row) => [row.dataset.widgetId, row]));
  const fragment = document.createDocumentFragment();

  order.forEach((key) => {
    const row = rowMap.get(key);
    if (row) fragment.appendChild(row);
  });

  widgetInner.appendChild(fragment);
}

function setWidgetOrderPreference(order, options = {}) {
  const normalized = normalizeWidgetOrder(order);
  const shouldPersist = options.persist !== false;
  const shouldApply = options.apply !== false;
  const shouldUpdateSettings = options.updateSettings !== false;

  widgetOrderPreference = normalized;

  if (shouldApply) {
    applyWidgetOrderToSidebar(normalized);
  }

  if (shouldUpdateSettings) {
    applyWidgetOrderToSettings(normalized);
  }

  if (shouldPersist && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [WIDGET_ORDER_KEY]: normalized })
      .catch((err) => {
        console.warn('Failed to save widget order', err);
      });
  }

  return normalized;
}



function applyWidgetVisibility() {

  const weatherWidget = document.querySelector('.widget-weather');

  const quoteWidget = document.querySelector('.widget-quote');

  const newsWidget = document.querySelector('.widget-news');

  const todoWidget = document.querySelector('.widget-todo');

  const shouldShowWeather = appShowSidebarPreference && appShowWeatherPreference;

  const shouldShowQuote = appShowSidebarPreference && appShowQuotePreference;

  const shouldShowNews = appShowSidebarPreference && appShowNewsPreference;

  const shouldShowTodo = appShowSidebarPreference && appShowTodoPreference;

  if (weatherWidget) {

    weatherWidget.classList.toggle('force-hidden', !shouldShowWeather);

  }

  if (quoteWidget) {

    quoteWidget.classList.toggle('force-hidden', !shouldShowQuote);

  }

  if (newsWidget) {

    newsWidget.classList.toggle('force-hidden', !shouldShowNews);

  }

  if (todoWidget) {

    todoWidget.classList.toggle('force-hidden', !shouldShowTodo);

  }

}


function isPerformanceModeEnabled() {
  return appPerformanceModePreference === true;
}

function disableGridAnimationRuntime() {
  document.body.classList.remove('grid-animation-enabled');

  let styleEl = document.getElementById('dynamic-grid-animation');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-grid-animation';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = '';

  const container = document.getElementById('grid-animation-sub-settings');
  if (container) setSubSettingsExpanded(container, false);

  document.querySelectorAll('.bookmark-item.newly-rendered').forEach((item) => {
    item.classList.remove('newly-rendered');
    item.style.animation = 'none';
  });
}

function disableGlassRuntime() {
  let styleEl = document.getElementById('dynamic-glass-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-glass-style';
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = '';

  document.documentElement.style.setProperty('--glass-blur', '0px');
  document.documentElement.style.setProperty('--glass-bg', 'transparent');
  document.documentElement.style.setProperty('--overlay-blur', '0px');
}

function enableGlassRuntimeFromPreference() {
  document.documentElement.style.removeProperty('--glass-blur');
  document.documentElement.style.removeProperty('--glass-bg');
  document.documentElement.style.removeProperty('--overlay-blur');
  applyGlassStyle(appGlassStylePreference);
}

function disableCinemaModeRuntime() {
  document.body.classList.remove('cinema-mode');
  if (cinemaTimeout) clearTimeout(cinemaTimeout);
  detachCinemaModeListeners();
}

function applyPerformanceModeState(enabled) {
  const isOn = !!enabled;

  appPerformanceModePreference = isOn;

  document.body.classList.toggle('performance-mode', isOn);

  const perfToggle = document.getElementById('app-performance-mode-toggle');
  if (perfToggle) perfToggle.checked = isOn;

  const rowsToHide = [
    document.getElementById('app-grid-animation-row'),
    document.getElementById('app-glass-style-row'),
    document.getElementById('app-cinema-mode-row'),
    document.getElementById('grid-animation-sub-settings')
  ];

  rowsToHide.forEach((row) => {
    if (row) row.style.display = isOn ? 'none' : '';
  });

  if (isOn) {
    disableGridAnimationRuntime();
    disableGlassRuntime();
    disableCinemaModeRuntime();
    cleanupBackgroundPlayback();
    document.querySelectorAll('.background-video').forEach((v) => {
      try { v.pause(); } catch (e) {}
      try { v.currentTime = 0; } catch (e) {}
      try {
        if (v.src) v.src = v.src;
        const source = v.querySelector('source');
        if (source && source.src) source.src = source.src;
      } catch (e) {}
      v.classList.remove('is-active');
      v.classList.remove('with-transition');
      v.classList.remove('on-top');
    });
    return;
  }

  enableGlassRuntimeFromPreference();
  applyGridAnimation(appGridAnimationPreference);
  applyGridAnimationSpeed(appGridAnimationSpeedPreference);
  applyGridAnimationEnabled(appGridAnimationEnabledPreference);
  setupCinemaModeListeners();
  resetCinemaMode();
}


function applyBackgroundDim(value) {
  const parsed = parseInt(value, 10);
  const nextValue = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 90) : 0;

  appBackgroundDimPreference = nextValue;

  const opacity = nextValue / 100;
  document.documentElement.style.setProperty('--bg-dim-opacity', opacity);

  let overlay = document.getElementById('background-dim-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'background-dim-overlay';
    document.body.prepend(overlay);
  }
}


// --- Function to inject CSS ---
function applyGlassStyle(styleId) {
  appGlassStylePreference = styleId || 'original';
  if (isPerformanceModeEnabled()) return;
  const styleData = GLASS_STYLES.find(s => s.id === appGlassStylePreference) || GLASS_STYLES[0];
  
  let styleEl = document.getElementById('dynamic-glass-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-glass-style';
    document.head.appendChild(styleEl);
  }

  // We override the .glass-box class directly
  styleEl.innerHTML = `
    .glass-box {
      ${styleData.css}
      transition: all 0.3s ease, transform 0.2s ease, opacity 0.2s ease !important;
    }
  `;
}

// --- Function to Load Preference ---
async function loadGlassStylePref() {
  try {
    const stored = await browser.storage.local.get(APP_GLASS_STYLE_KEY);
    const pref = stored[APP_GLASS_STYLE_KEY];
    applyGlassStyle(pref || 'original');
  } catch (e) {
    applyGlassStyle('original');
  }
}


/**
 * Injects the chosen animation keyframes into the page style.
 * This overrides the default @keyframes item-fade-in in new-tab.css
 */
function applyGridAnimation(animationKey) {
  appGridAnimationPreference = animationKey || 'default';
  if (isPerformanceModeEnabled()) return;
  const animData = GRID_ANIMATIONS[appGridAnimationPreference] || GRID_ANIMATIONS['default'];
  
  let styleEl = document.getElementById('dynamic-grid-animation');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-grid-animation';
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = `
    @keyframes item-fade-in {
      ${animData.css}
    }
  `;
}

async function loadGridAnimationPref() {
  try {
    const stored = await browser.storage.local.get(APP_GRID_ANIMATION_KEY);
    const pref = stored[APP_GRID_ANIMATION_KEY];
    applyGridAnimation(pref);
  } catch (e) {
    applyGridAnimation('default');
  }
}

function applyGridAnimationEnabled(enabled) {
  appGridAnimationEnabledPreference = enabled;
  if (isPerformanceModeEnabled()) return;
  document.body.classList.toggle('grid-animation-enabled', enabled);
  updateGridAnimationSettingsUI();
}

function applyGridAnimationSpeed(seconds) {
  // Ensure it's a valid number
  const validSeconds = parseFloat(seconds) || 0.3;
  appGridAnimationSpeedPreference = validSeconds;
  if (isPerformanceModeEnabled()) return;
  
  // Update CSS Variable globally
  document.documentElement.style.setProperty('--grid-animation-duration', `${validSeconds}s`);
  
  // Update Settings UI text if visible
  const label = document.getElementById('app-grid-animation-speed-value');
  const slider = document.getElementById('app-grid-animation-speed-slider');
  
  if (label) label.textContent = `${validSeconds}s`;
  if (slider) slider.value = validSeconds;
}

function updateGridAnimationSettingsUI() {
  const container = document.getElementById('grid-animation-sub-settings');
  const toggle = document.getElementById('app-grid-animation-toggle');
  
  if (toggle) {
    toggle.checked = appGridAnimationEnabledPreference;
  }
  
  if (container) {
    setSubSettingsExpanded(container, appGridAnimationEnabledPreference);
  }
}

function applyBookmarkTextBg(enabled) {

  appBookmarkTextBgPreference = enabled;

  document.body.classList.toggle('bookmark-text-bg-enabled', enabled);

}



function hexToRgbString(hex) {

  const clean = (hex || '').replace(/^#/, '');

  const bigint = parseInt(clean, 16);

  if (Number.isNaN(bigint)) return '44, 165, 255'; // fallback to default blue

  const r = (bigint >> 16) & 255;

  const g = (bigint >> 8) & 255;

  const b = bigint & 255;

  return `${r}, ${g}, ${b}`;

}



function applyBookmarkTextBgOpacity(opacity) {

  const safeOpacity = Math.max(0, Math.min(1, parseFloat(opacity)));

  const resolvedOpacity = Number.isFinite(safeOpacity) ? safeOpacity : 0.65;

  appBookmarkTextBgOpacityPreference = resolvedOpacity;

  document.documentElement.style.setProperty('--bookmark-text-bg-opacity', resolvedOpacity);



  // Update the label text in settings

  const label = document.getElementById('app-bookmark-text-opacity-value');

  const slider = document.getElementById('app-bookmark-text-opacity-slider');

  if (label) label.textContent = `${Math.round(resolvedOpacity * 100)}%`;

  if (slider && slider.value !== String(resolvedOpacity)) {

    slider.value = resolvedOpacity;

  }



  // Re-evaluate contrast since opacity influences perceived brightness

  applyBookmarkTextBgColor(appBookmarkTextBgColorPreference);

}



function applyBookmarkTextBgBlur(blurRadius) {

  const parsed = parseInt(blurRadius, 10);

  const safeBlur = Number.isFinite(parsed) ? Math.max(0, parsed) : 4;

  appBookmarkTextBgBlurPreference = safeBlur;

  document.documentElement.style.setProperty('--bookmark-text-bg-blur', `${safeBlur}px`);



  const label = document.getElementById('app-bookmark-text-blur-value');

  const slider = document.getElementById('app-bookmark-text-blur-slider');

  if (label) label.textContent = `${safeBlur}px`;

  if (slider && slider.value !== String(safeBlur)) {

    slider.value = safeBlur;

  }

}



function applyBookmarkTextBgColor(color) {

  if (!color) return;

  appBookmarkTextBgColorPreference = color;

  const rgbValues = hexToRgbString(color);

  document.documentElement.style.setProperty('--bookmark-text-bg-rgb', rgbValues);

  if (isLightColor(color, appBookmarkTextBgOpacityPreference)) {

    document.documentElement.style.setProperty('--bookmark-text-color', '#000000');

    document.documentElement.style.setProperty('--bookmark-text-shadow', 'none');

  } else {

    document.documentElement.style.setProperty('--bookmark-text-color', '#ffffff');

    document.documentElement.style.setProperty('--bookmark-text-shadow', '0 1px 2px rgba(0,0,0,0.3)');

  }

}



function applyBookmarkFallbackColor(color) {

  if (!color) return;

  document.documentElement.style.setProperty('--bookmark-fallback-color', color);

  if (isLightColor(color)) {

    document.documentElement.style.setProperty('--bookmark-fallback-text-color', '#000000');

  } else {

    document.documentElement.style.setProperty('--bookmark-fallback-text-color', '#FFFFFF');

  }

}



function applyBookmarkFolderColor(color) {

  if (!color) return;

  document.documentElement.style.setProperty('--bookmark-folder-color', color);

}



async function loadAppSettingsFromStorage() {

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

      APP_GRID_ANIMATION_ENABLED_KEY,

      APP_GRID_ANIMATION_SPEED_KEY,

      WALLPAPER_QUALITY_KEY,

      WALLPAPER_TYPE_KEY,

      DAILY_ROTATION_KEY

    ]);

    appPerformanceModePreference = stored[APP_PERFORMANCE_MODE_KEY] === true;
    debugPerfOverlayPreference = stored[APP_DEBUG_PERF_OVERLAY_KEY] === true;
    appBatteryOptimizationPreference = stored[APP_BATTERY_OPTIMIZATION_KEY] === true;
    appCinemaModePreference = stored[APP_CINEMA_MODE_KEY] === true;

    // Load animation pref
    await loadGridAnimationPref(); 
    await loadGlassStylePref(); 

    applyTimeFormatPreference(stored[APP_TIME_FORMAT_KEY] || '12-hour');

    const storedShowSidebar = stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true;
    const storedShowWeather = stored.hasOwnProperty(APP_SHOW_WEATHER_KEY) ? stored[APP_SHOW_WEATHER_KEY] !== false : true;
    const storedShowQuote = stored.hasOwnProperty(APP_SHOW_QUOTE_KEY) ? stored[APP_SHOW_QUOTE_KEY] !== false : true;
    const hasStoredNews = stored.hasOwnProperty(APP_SHOW_NEWS_KEY);
    const storedShowNews = hasStoredNews ? stored[APP_SHOW_NEWS_KEY] === true : false;
    const storedShowTodo = stored.hasOwnProperty(APP_SHOW_TODO_KEY) ? stored[APP_SHOW_TODO_KEY] !== false : true;

    appNewsSourcePreference = resolveNewsSourceId(stored[APP_NEWS_SOURCE_KEY]);

    const storedWidgetOrder = stored[WIDGET_ORDER_KEY];
    const normalizedWidgetOrder = normalizeWidgetOrder(storedWidgetOrder);
    const shouldPersistWidgetOrder = !areWidgetOrdersEqual(storedWidgetOrder, normalizedWidgetOrder);
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
    applyGridAnimationEnabled(animEnabled);

    // Load Animation Speed
    const savedSpeed = stored[APP_GRID_ANIMATION_SPEED_KEY];
    applyGridAnimationSpeed(savedSpeed !== undefined ? savedSpeed : 0.3);

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

    applyPerformanceModeState(appPerformanceModePreference);
    setPerfOverlayEnabled(debugPerfOverlayPreference);
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



async function handleSingletonMode() {

  // Safety check: ensure APIs exist

  if (!browser.tabs || !browser.tabs.getCurrent || !browser.tabs.update) return;



  try {

    const currentTab = await browser.tabs.getCurrent();

    if (!currentTab) return;



    // Filter by URL AND Container (cookieStoreId)

    const tabs = await browser.tabs.query({

      url: window.location.href,

      cookieStoreId: currentTab.cookieStoreId

    });



    // Find a tab that isn't THIS one

    const existingTab = tabs.find((t) => t.id !== currentTab.id);



    if (existingTab) {

      // Switch to the old tab

      await browser.tabs.update(existingTab.id, { active: true });

      // Close this new duplicate

      window.close();

    }

  } catch (err) {

    console.warn('Singleton mode check failed', err);

  }

}



async function manageHomebaseTabs() {

  if (appMaxTabsPreference === 0 && appAutoClosePreference === 0) return;

  if (!browser.tabs || !browser.tabs.query || !browser.tabs.remove || !browser.tabs.getCurrent) return;



  try {

    const currentTab = await browser.tabs.getCurrent();

    if (!currentTab) return;

    const allTabs = await browser.tabs.query({ url: window.location.href });



    const myTabs = allTabs.filter((t) => t.cookieStoreId === currentTab.cookieStoreId);



    myTabs.sort((a, b) => b.lastAccessed - a.lastAccessed);



    const tabsToClose = new Set();

    const now = Date.now();



    if (appAutoClosePreference > 0) {

      const thresholdMs = appAutoClosePreference * 60 * 1000;



      myTabs.forEach((tab) => {

        if (tab.active || tab.pinned || tab.audible) return;



        const timeSinceAccess = now - tab.lastAccessed;

        if (timeSinceAccess > thresholdMs) {

          tabsToClose.add(tab.id);

        }

      });

    }



    if (appMaxTabsPreference > 0) {

      const survivors = myTabs.filter((t) => !tabsToClose.has(t.id));



      if (survivors.length > appMaxTabsPreference) {

        const extras = survivors.slice(appMaxTabsPreference);



        extras.forEach((tab) => {

          if (!tab.active && !tab.pinned && !tab.audible) {

            tabsToClose.add(tab.id);

          }

        });

      }

    }



    if (tabsToClose.size > 0) {

      await browser.tabs.remove(Array.from(tabsToClose));

      console.log(`Cleaned up ${tabsToClose.size} extra Homebase tabs.`);

    }

  } catch (err) {

    console.warn('Failed to manage Homebase tabs', err);

  }

}



function populateDefaultEngineSelectControl() {

  if (!appSearchDefaultEngineSelect) return;

  appSearchDefaultEngineSelect.innerHTML = '';

  const activeEngines = searchEngines.filter((engine) => engine.enabled);



  if (activeEngines.length === 0) {

    const option = document.createElement('option');

    option.value = 'google';

    option.textContent = 'Google';

    appSearchDefaultEngineSelect.appendChild(option);

  } else {

    activeEngines.forEach((engine) => {

      const option = document.createElement('option');

      option.value = engine.id;

      option.textContent = engine.name;

      appSearchDefaultEngineSelect.appendChild(option);

    });

  }



  const desired = appSearchDefaultEnginePreference;

  if (desired) {

    appSearchDefaultEngineSelect.value = desired;

  }

  if (!appSearchDefaultEngineSelect.value && activeEngines.length > 0) {

    appSearchDefaultEngineSelect.value = activeEngines[0].id;

  }

}



function updateDefaultEngineVisibilityControl() {

  if (!appSearchDefaultEngineContainer) return;

  if (appSearchRememberEngineToggle && appSearchRememberEngineToggle.checked) {

    appSearchDefaultEngineContainer.style.display = 'none';

  } else {

    appSearchDefaultEngineContainer.style.display = 'flex';

    populateDefaultEngineSelectControl();

  }

}



function updateColorTrigger(triggerEl, color) {

  if (!triggerEl) return;



  triggerEl.style.backgroundColor = color;



  const normalized = (color || '').trim().toLowerCase();

  const isWhite =

    normalized === '#fff' ||

    normalized === '#ffffff' ||

    normalized === 'white' ||

    normalized.startsWith('rgb(255, 255, 255');



  triggerEl.style.setProperty('--color-picker-ring', isWhite ? '#000000' : '#ffffff');

}



function ensureSubSettingsInner(container) {
  if (!container) return null;
  const directChildren = Array.from(container.children);
  if (
    directChildren.length === 1 &&
    directChildren[0].classList &&
    directChildren[0].classList.contains('sub-settings-inner')
  ) {
    return directChildren[0];
  }

  const inner = document.createElement('div');
  inner.className = 'sub-settings-inner';
  while (container.firstChild) {
    inner.appendChild(container.firstChild);
  }
  container.appendChild(inner);
  return inner;
}

function setSubSettingsExpanded(container, expanded, opts = {}) {
  if (!container) return;
  ensureSubSettingsInner(container);
  container.classList.toggle('expanded', !!expanded);
  if (expanded && opts.scrollIntoView) {
    requestAnimationFrame(() => {
      container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}

function updateWidgetSettingsUI() {

  const subSettings = document.getElementById('widget-sub-settings');

  const weatherToggleEl = document.getElementById('app-show-weather-toggle');

  const quoteToggleEl = document.getElementById('app-show-quote-toggle');

  const newsToggleEl = document.getElementById('app-show-news-toggle');

  const todoToggleEl = document.getElementById('app-show-todo-toggle');

  const weatherConfigureBtn = document.getElementById('app-configure-weather-btn');

  const quoteConfigureBtn = document.getElementById('app-configure-quote-btn');

  const newsConfigureBtn = document.getElementById('app-configure-news-btn');

  if (weatherToggleEl) {

    weatherToggleEl.checked = appShowWeatherPreference;

  }

  if (quoteToggleEl) {

    quoteToggleEl.checked = appShowQuotePreference;

  }

  if (newsToggleEl) {

    newsToggleEl.checked = appShowNewsPreference;

  }

  if (todoToggleEl) {

    todoToggleEl.checked = appShowTodoPreference;

  }

  if (!appShowSidebarPreference) {

    if (subSettings) setSubSettingsExpanded(subSettings, false);

    if (weatherConfigureBtn) weatherConfigureBtn.disabled = true;

    if (quoteConfigureBtn) quoteConfigureBtn.disabled = true;

    if (newsConfigureBtn) newsConfigureBtn.disabled = true;

    return;

  }

  if (subSettings) setSubSettingsExpanded(subSettings, true);

  if (weatherConfigureBtn) {

    weatherConfigureBtn.disabled = !appShowWeatherPreference;

  }

  if (quoteConfigureBtn) {

    quoteConfigureBtn.disabled = !appShowQuotePreference;

  }

  if (newsConfigureBtn) {

    newsConfigureBtn.disabled = !appShowNewsPreference;

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



/**
 * Setup Animation Modal Logic (Updated for Hover Previews)
 */
function setupAnimationSettings() {
  const modal = document.getElementById('animation-settings-modal');
  const openBtn = document.getElementById('app-configure-animation-btn');
  const closeBtn = document.getElementById('animation-settings-close-btn');
  const cancelBtn = document.getElementById('animation-settings-cancel-btn');
  const saveBtn = document.getElementById('animation-settings-save-btn');
  const list = document.getElementById('animation-list');
  const previewItems = document.querySelectorAll('.animation-preview-item');

  // Track the actual "saved" or "clicked" selection
  let selectedKey = appGridAnimationPreference;

  const closeModal = () => {
    closeModalWithAnimation('animation-settings-modal', '.dialog-content', () => {
      // Restore the real selection if the user hovered over others but didn't save
      if (appGridAnimationPreference !== selectedKey) {
        applyGridAnimation(appGridAnimationPreference);
      }
    });
  };

  const playPreview = () => {
    if (isPerformanceModeEnabled()) return;
    previewItems.forEach((item, index) => {
      // Reset animation to force a replay
      item.style.animation = 'none';
      item.offsetHeight; /* trigger reflow */
      
      // Apply new animation
      const delay = index * 100;
      item.style.animation = `item-fade-in 0.6s cubic-bezier(0.25, 0.8, 0.4, 1) ${delay}ms forwards`;
    });
  };

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (isPerformanceModeEnabled()) {
        console.warn('Performance Mode is on; animation settings are disabled.');
        return;
      }
      selectedKey = appGridAnimationPreference;
      
      // Build List
      list.innerHTML = '';
      Object.entries(GRID_ANIMATIONS).forEach(([key, data]) => {
        const btn = document.createElement('div');
        btn.className = 'animation-option';
        btn.textContent = data.name;
        if (key === selectedKey) btn.classList.add('selected');
        
        // 1. Hover: Preview immediately without selecting
        btn.addEventListener('mouseenter', () => {
          applyGridAnimation(key); // Temporarily swap global CSS
          playPreview();           // Run the visual test
        });

        // 2. Hover Out: Revert to the actually selected item
        // This ensures if you mouse away, the page doesn't stay stuck on the previewed one
        btn.addEventListener('mouseleave', () => {
          applyGridAnimation(selectedKey);
        });

        // 3. Click: Confirm Selection (Highlight Blue)
        btn.addEventListener('click', () => {
          list.querySelectorAll('.animation-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedKey = key;
          
          // Re-apply to lock it in as the "restore point" for mouseleave
          applyGridAnimation(selectedKey);
          playPreview(); 
        });
        
        list.appendChild(btn);
      });

      openModalWithAnimation('animation-settings-modal', 'app-configure-animation-btn', '.dialog-content');
      playPreview();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      appGridAnimationPreference = selectedKey;
      await browser.storage.local.set({ [APP_GRID_ANIMATION_KEY]: selectedKey });
      
      // Update actual grid immediately if visible
      if (currentGridFolderNode) {
        const node = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
        if (node) renderBookmarkGrid(node);
      }
      
      closeModalWithAnimation('animation-settings-modal', '.dialog-content');
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    // Revert visually to the original preference stored in settings
    loadGridAnimationPref(); 
    closeModal();
  });
  if (modal) modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
}



function setupGlassSettings() {
  const modal = document.getElementById('glass-settings-modal');
  const openBtn = document.getElementById('app-configure-glass-btn');
  const closeBtn = document.getElementById('glass-settings-close-btn');
  const cancelBtn = document.getElementById('glass-settings-cancel-btn');
  const saveBtn = document.getElementById('glass-settings-save-btn');
  const list = document.getElementById('glass-style-list');

  // Track selection state
  let selectedId = appGlassStylePreference;

  const closeModal = () => {
    closeModalWithAnimation('glass-settings-modal', '.dialog-content', () => {
      // Revert if cancelled/closed without saving
      if (appGlassStylePreference !== selectedId) {
        applyGlassStyle(appGlassStylePreference);
      }
    });
  };

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (isPerformanceModeEnabled()) {
        console.warn('Performance Mode is on; glass settings are disabled.');
        return;
      }
      selectedId = appGlassStylePreference; // Reset to current actual setting
      
      list.innerHTML = '';
      
      GLASS_STYLES.forEach((style) => {
        const btn = document.createElement('div');
        // Reuse animation-option class for consistent look, or use generic option styling
        btn.className = 'animation-option'; 
        btn.textContent = style.name;
        
        if (style.id === selectedId) btn.classList.add('selected');
        
        // 1. Hover: Preview Live
        btn.addEventListener('mouseenter', () => {
          applyGlassStyle(style.id);
        });

        // 2. Leave: Revert to "selected" state
        btn.addEventListener('mouseleave', () => {
          applyGlassStyle(selectedId);
        });

        // 3. Click: Select
        btn.addEventListener('click', () => {
          list.querySelectorAll('.animation-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedId = style.id;
          applyGlassStyle(selectedId); // Lock in visual
        });
        
        list.appendChild(btn);
      });

      // Ensure modal sits above settings
      modal.style.zIndex = '2100';
      openModalWithAnimation('glass-settings-modal', 'app-configure-glass-btn', '.dialog-content');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      appGlassStylePreference = selectedId;
      await browser.storage.local.set({ [APP_GLASS_STYLE_KEY]: selectedId });
      closeModalWithAnimation('glass-settings-modal', '.dialog-content');
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    // Re-apply original
    loadGlassStylePref();
    closeModal();
  });
  if (modal) modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
}


function setupSearchEnginesModal() {

  const modal = document.getElementById('search-engines-modal');

  const openBtn = document.getElementById('manage-search-engines-btn');

  const saveBtn = document.getElementById('search-engines-save-btn');

  const cancelBtn = document.getElementById('search-engines-cancel-btn');

  const listContainer = document.getElementById('search-engines-modal-list');



  if (!modal || !openBtn || !saveBtn || !cancelBtn || !listContainer) return;



  const closeModal = () => {

    closeModalWithAnimation('search-engines-modal', '.dialog-content');

  };



  // Sortable instance variable

  let engineSortable = null;



  const renderList = () => {

    listContainer.innerHTML = '';

    

    // Sort engines: enabled first, then disabled (optional, but good UX) 

    // or just keep original order. Here we use the current 'searchEngines' order.

    searchEngines.forEach((engine) => {

      const div = document.createElement('div');

      div.className = 'engine-toggle-item';

      div.innerHTML = `

        <div class="engine-toggle-main">

          <span class="engine-drag-handle">â˜°</span>

          <span class="engine-toggle-icon" aria-hidden="true">${engine.symbolId ? useSvgIcon(engine.symbolId) : `<span style="font-weight:bold; font-size:12px; color:#555;">${engine.name.charAt(0)}</span>`}</span>

          <span class="engine-toggle-name">${engine.name}</span>

        </div>

        <label class="app-switch">

          <input type="checkbox" class="engine-toggle-checkbox" data-id="${engine.id}" ${engine.enabled ? 'checked' : ''}>

          <span class="app-switch-track"></span>

        </label>

      `;



      // --- NEW FEATURE: Prevent Disabling Last Engine ---

      const checkbox = div.querySelector('.engine-toggle-checkbox');

      checkbox.addEventListener('change', (e) => {

        // Count how many are CURRENTLY checked in the DOM

        const allCheckboxes = listContainer.querySelectorAll('.engine-toggle-checkbox');

        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;



        if (checkedCount === 0) {

          // If the user just unchecked the last one, revert it immediately

          e.preventDefault();

          checkbox.checked = true;

          showCustomAlert("You must have at least one search engine enabled.");

        }

      });

      // --------------------------------------------------



      listContainer.appendChild(div);

    });



    // Initialize Sortable on the list

    if (engineSortable) engineSortable.destroy();

    engineSortable = Sortable.create(listContainer, {

      animation: 150,

      handle: '.engine-toggle-main',

      ghostClass: 'sortable-ghost-engine'

    });

  };



  openBtn.addEventListener('click', async () => {

    try {

      await loadSearchEnginePreferences();

    } catch (err) {

      console.warn('Failed to refresh search engines before opening modal', err);

    }

    renderList();

    openModalWithAnimation('search-engines-modal', 'manage-search-engines-btn', '.dialog-content');

  });



  saveBtn.addEventListener('click', async () => {

    // 1. Read the new order from the DOM

    const items = listContainer.querySelectorAll('.engine-toggle-item');

    const newOrderConfig = [];



    items.forEach(item => {

      const checkbox = item.querySelector('.engine-toggle-checkbox');

      newOrderConfig.push({

        id: checkbox.dataset.id,

        enabled: checkbox.checked

      });

    });



    // 2. Re-sort the global 'searchEngines' array based on this new order

    const newSearchEngines = newOrderConfig.map(cfg => {

      // Find the original engine object to preserve URLs/Icons

      const original = searchEngines.find(e => e.id === cfg.id);

      if (original) {

        original.enabled = cfg.enabled;

        return original;

      }

      return null;

    }).filter(Boolean);



    // Append any engines that might have been missing from the list (safety fallback)

    const seenIds = new Set(newSearchEngines.map(e => e.id));

    searchEngines.forEach(e => {

      if (!seenIds.has(e.id)) newSearchEngines.push(e);

    });



    // Update Global Variable

    searchEngines = newSearchEngines;



    // 3. Save the ORDERED list to storage

    // We save an array of {id, enabled} objects

    const storageData = searchEngines.map(e => ({ id: e.id, enabled: e.enabled }));



    try {

      await browser.storage.local.set({ [SEARCH_ENGINES_PREF_KEY]: storageData });

    } catch (err) {

      console.warn('Failed to save search engines', err);

    }



    populateSearchOptions();



    // Handle current engine selection logic

    const currentStillEnabled = searchEngines.find((e) => e.id === currentSearchEngine.id && e.enabled);

    if (!currentStillEnabled) {

      const firstEnabled = searchEngines.find((e) => e.enabled) || searchEngines[0];

      updateSearchUI(firstEnabled.id);

      if (appSearchRememberEnginePreference) {

        browser.storage.local.set({ currentSearchEngineId: firstEnabled.id }).catch((err) => {

          console.warn('Failed to persist search engine selection', err);

        });

      }

    } else {

      // Even if current is still enabled, call updateSearchUI to refresh position in the list

      updateSearchUI(currentSearchEngine.id);

    }



    closeModal();

  });



  cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {

    if (e.target === modal) closeModal();

  });

}





// ===============================================

// --- SEARCH BAR ---

// ===============================================

const SEARCH_ENGINES_PREF_KEY = 'searchEnginesConfig';



let searchEngines = [

  { 

    id: 'google', 

    name: 'Google', 

    color: '#4285F4',

    enabled: true, 

    url: 'https://www.google.com/search?q=', 

    suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',

    symbolId: 'google'

  },

  { 

    id: 'youtube', 

    name: 'YouTube', 

    color: '#FF0000',

    enabled: true, 

    url: 'https://www.youtube.com/results?search_query=', 

    suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=',

    symbolId: 'youtube'

  },

  { 

    id: 'duckduckgo', 

    name: 'DuckDuckGo', 

    color: '#DE5833',

    enabled: true, 

    url: 'https://duckduckgo.com/?q=', 

    suggestionUrl: 'https://duckduckgo.com/ac/?type=json&q=',

    symbolId: 'duckduckgo'

  },

  { 

    id: 'bing', 

    name: 'Bing', 

    color: '#008373',

    enabled: true, 

    url: 'https://www.bing.com/search?q=', 

    suggestionUrl: 'https://api.bing.com/osjson.aspx?query=',

    symbolId: 'bing'

  },

  { 

    id: 'wikipedia', 

    name: 'Wikipedia', 

    color: '#000000',

    enabled: true, 

    url: 'https://en.wikipedia.org/wiki/Special:Search?search=', 

    suggestionUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=',

    symbolId: 'wikipedia'

  },

  { 

    id: 'reddit', 

    name: 'Reddit', 

    color: '#FF4500',

    enabled: false, 

    url: 'https://www.reddit.com/search/?q=', 

    suggestionUrl: '',

    symbolId: 'reddit' 

  },

  { 

    id: 'github', 

    name: 'GitHub', 

    color: '#0d6efd',

    enabled: false, 

    url: 'https://github.com/search?q=', 

    suggestionUrl: '',

    symbolId: 'github'

  },

  { 

    id: 'stackoverflow', 

    name: 'StackOverflow', 

    color: '#F48024',

    enabled: false, 

    url: 'https://stackoverflow.com/search?q=', 

    suggestionUrl: '',

    symbolId: 'stackoverflow' 

  },

  { id: 'amazon', name: 'Amazon', color: '#FF9900', enabled: false, url: 'https://www.amazon.com/s?k=', suggestionUrl: 'https://completion.amazon.com/search/complete?search-alias=aps&client=amazon-search-ui&mkt=1&q=', symbolId: 'amazon' },

  { id: 'maps', name: 'Maps', color: '#34A853', enabled: false, url: 'https://www.google.com/maps/search/', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=', symbolId: 'maps' },

  { id: 'yahoo', name: 'Yahoo', color: '#6001D2', enabled: false, url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://ff.search.yahoo.com/gossip?output=json&command=', symbolId: 'yahoo' },

  { id: 'yandex', name: 'Yandex', color: '#FC3F1D', enabled: false, url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ff.cgi?part=', symbolId: 'yandex' }

];

const bangMap = {

  g: 'google',

  yt: 'youtube',

  ddg: 'duckduckgo',

  b: 'bing',

  w: 'wikipedia',

  r: 'reddit',

  gh: 'github',

  so: 'stackoverflow',

  amz: 'amazon',

  maps: 'maps',

  y: 'yahoo',

  ya: 'yandex'

};

const searchForm = document.getElementById('search-form');

const searchInput = document.getElementById('search-input');

const searchSelect = document.getElementById('search-select');

const resultSections = [

  bookmarkResultsContainer,

  suggestionResultsContainer

];

let currentSearchEngine = searchEngines.find((engine) => engine.enabled) || searchEngines[0];

let currentSelectionIndex = -1;

let currentSectionIndex = 0; // 0 = bookmarks, 1 = suggestions

let selectionWasAuto = false;

let lastSelectedText = '';

let userIsTyping = false;

let latestSearchToken = 0;

let lastBookmarkHtml = '';

let lastSuggestionHtml = '';

let searchNavigationLocked = false;

let searchEngineSaveTimeout = null;

const suggestionCache = new Map();



function evaluateMath(query) {

  let expression = query.replace(/^=/, '').replace(/x/gi, '*').trim();

  if (!/^[\d\.\s\+\-\*\/\%\^\(\)]+$/.test(expression)) return null;

  if (!/[\+\-\*\/\%\^]/.test(expression)) return null;



  try {

    const clean = expression.replace(/\s+/g, '');

    const parts = clean.split(/([\+\-\*\/\%\^])/).filter(p => p !== '');

    if (parts.length < 3) return null;



    const operators = [];

    const numbers = [];

    for (let i = 0; i < parts.length; i++) {

      if (['+','-','*','/','%','^'].includes(parts[i])) {

        operators.push(parts[i]);

      } else {

        const num = parseFloat(parts[i]);

        if (isNaN(num)) return null;

        numbers.push(num);

      }

    }

    if (numbers.length !== operators.length + 1) return null;



    const applyOp = (a, b, operator) => {

      switch (operator) {

        case '+': return a + b;

        case '-': return a - b;

        case '*': return a * b;

        case '/': return b === 0 ? 0 : a / b;

        case '%': return a % b;

        case '^': return Math.pow(a, b);

        default: return 0;

      }

    };



    for (let i = 0; i < operators.length; i++) {

      const operator = operators[i];

      if (['*', '/', '%', '^'].includes(operator)) {

        const result = applyOp(numbers[i], numbers[i + 1], operator);

        numbers.splice(i, 2, result);

        operators.splice(i, 1);

        i--;

      }

    }



    let finalResult = numbers[0];

    for (let i = 0; i < operators.length; i++) {

      finalResult = applyOp(finalResult, numbers[i + 1], operators[i]);

    }



    if (!isFinite(finalResult) || isNaN(finalResult)) return null;

    return Math.round(finalResult * 10000) / 10000;

  } catch (e) {

    return null;

  }

}



function evaluateUnits(query) {

  const regex = /^([\d\.]+)\s*([a-z]+)\s*(?:to|in)?\s*([a-z]+)$/i;

  const match = query.match(regex);

  if (!match) return null;



  const val = parseFloat(match[1]);

  const from = match[2].toLowerCase();

  const to = match[3].toLowerCase();



  const units = {

    kg: { type: 'weight', base: 1 },

    lbs: { type: 'weight', base: 0.453592 },

    lb: { type: 'weight', base: 0.453592 },

    m: { type: 'length', base: 1 },

    meter: { type: 'length', base: 1 },

    meters: { type: 'length', base: 1 },

    km: { type: 'length', base: 1000 },

    ft: { type: 'length', base: 0.3048 },

    feet: { type: 'length', base: 0.3048 },

    mi: { type: 'length', base: 1609.34 },

    mile: { type: 'length', base: 1609.34 },

    miles: { type: 'length', base: 1609.34 },

    c: { type: 'temp' },

    celsius: { type: 'temp' },

    f: { type: 'temp' },

    fahrenheit: { type: 'temp' }

  };



  if (!units[from] || !units[to]) return null;

  if (units[from].type !== units[to].type) return null;



  let result = null;

  if (units[from].type === 'temp') {

    if ((from === 'c' || from === 'celsius') && (to === 'f' || to === 'fahrenheit')) {

      result = (val * 9 / 5) + 32;

    } else if ((from === 'f' || from === 'fahrenheit') && (to === 'c' || to === 'celsius')) {

      result = (val - 32) * 5 / 9;

    }

  } else {

    const inBase = val * units[from].base;

    result = inBase / units[to].base;

  }



  if (result === null) return null;

  return parseFloat(result.toFixed(2));

}



/**

 * Checks if a query string is likely a direct URL, domain, or IP address.

 */

function isLikelyUrl(query) {

  const trimmedQuery = query.trim().toLowerCase();



  // 1. Exclude search phrases (anything with spaces)

  if (trimmedQuery.includes(' ')) {

    return false;

  }



  // 2. Check for explicit schemes (mailto:, magnet:, about:, view-source:)

  // Regex: Starts with alphanumeric, followed by chars, ending in colon (e.g., "mailto:")

  // We exclude 'localhost:' here to handle it specifically later

  if (/^[a-z][a-z0-9+.-]+:/i.test(trimmedQuery) && !trimmedQuery.startsWith('localhost:')) {

    return true;

  }



  // 3. Intranet Shortnames: Ends with a slash (e.g., "router/", "nas/")

  // This allows users to force navigation to a local host without a .com

  if (trimmedQuery.endsWith('/') && trimmedQuery.length > 1) {

    return true;

  }



  // 4. Localhost (explicit or with port)

  if (trimmedQuery.startsWith('localhost')) {

    return true;

  }



  // 5. IPv4 addresses

  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmedQuery)) {

    return true;

  }



  // 6. Standard Domain structure (example.com)

  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/.test(trimmedQuery)) {

    return true;

  }



  return false;

}



function escapeHtml(unsafe) {

  if (!unsafe) return '';

  return String(unsafe)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#039;');

}



function ensureEngineIconExists(engine) {

  const container = document.getElementById('search-engine-selector');

  if (!container) return;

  const list = container.querySelector('.search-engine-list');

  if (!list) return;



  let btn = list.querySelector(`.engine-icon-btn[data-engine-id="${engine.id}"]`);

  if (btn) return;



  btn = document.createElement('div');

  btn.className = 'engine-icon-btn';

  btn.dataset.engineId = engine.id;

  btn.style.setProperty('--engine-color', engine.color || '#333');



  const iconHtml = engine.symbolId ? useSvgIcon(engine.symbolId) : `<span style="font-weight:bold; font-size:12px; color:#555;">${engine.name.charAt(0)}</span>`;

  btn.innerHTML = `<span class="tooltip-popup tooltip-top">${engine.name}</span>${iconHtml}`;



  btn.addEventListener('click', (e) => {

    e.stopPropagation();

    updateSearchUI(engine.id);

    const selector = document.getElementById('search-engine-selector');

    if (selector) {

      selector.classList.remove('expanded');

      selector.classList.add('suppress-hover');

    }

    if (searchInput) searchInput.focus();

  });



  list.appendChild(btn);

}



function updateSearchSelectorPosition() {

  const container = document.getElementById('search-engine-selector');

  const list = container ? container.querySelector('.search-engine-list') : null;

  if (!container || !list) return;



  const allButtons = Array.from(list.querySelectorAll('.engine-icon-btn'));

  if (allButtons.length === 0) return;



  const currentIndex = allButtons.findIndex(btn => btn.dataset.engineId === currentSearchEngine.id);

  if (currentIndex === -1) return;



  // Constants matching CSS

  const iconSize = 36;

  const gap = 6;

  const itemFullWidth = iconSize + gap;

  const visibleCount = 1; // CHANGED: Show only 1 item



  // --- Logic: Show the selected item in the 1-item window ---

  // Offset = currentIndex * itemFullWidth

  // We clamp this so we don't scroll past the start (0) or end.

  

  const maxOffset = Math.max(0, (allButtons.length - visibleCount) * itemFullWidth);

  let offset = currentIndex * itemFullWidth;



  // Clamp

  offset = Math.max(0, Math.min(offset, maxOffset));



  // Apply transform

  list.style.transform = `translateX(-${offset}px)`;

}



function renderSearchEngineSelector() {

  const container = document.getElementById('search-engine-selector');

  if (!container) return;

  

  container.innerHTML = '';

  

  // 1. Create Inner List

  const list = document.createElement('div');

  list.className = 'search-engine-list';

  

  const activeEngines = searchEngines.filter(e => e.enabled);

  

  // 2. Calculate Dimensions

  const iconSize = 36;

  const gap = 6;

  const visibleCount = Math.min(activeEngines.length, 1); // CHANGED to 1

  

  // Width = (N * 36) + ((N-1) * 6)

  const collapsedWidth = (visibleCount * iconSize) + (Math.max(0, visibleCount - 1) * gap);

  const expandedWidth = (activeEngines.length * iconSize) + (Math.max(0, activeEngines.length - 1) * gap);

  

  // Apply widths to container

  container.style.setProperty('--collapsed-width', `${collapsedWidth}px`);

  container.style.setProperty('--expanded-width', `${expandedWidth}px`);

  container.style.removeProperty('width'); // Ensure inline width doesn't block CSS



  // 3. Render Buttons

  activeEngines.forEach(engine => {

    const btn = document.createElement('div');

    // Removed 'cooltipz--bottom', added tooltip span inside

    btn.className = 'engine-icon-btn';

    btn.dataset.engineId = engine.id;

    // Set color variable for CSS to use

    btn.style.setProperty('--engine-color', engine.color || '#333');

    

    if (currentSearchEngine && currentSearchEngine.id === engine.id) {

      btn.classList.add('active');

    }

    

    // Insert Tooltip HTML + Icon

    const iconHtml = engine.symbolId ? useSvgIcon(engine.symbolId) : `<span style="font-weight:bold; font-size:12px; color:#555;">${engine.name.charAt(0)}</span>`;

    btn.innerHTML = `<span class="tooltip-popup tooltip-top">${engine.name}</span>${iconHtml}`;

    

    btn.addEventListener('click', (e) => {

      e.stopPropagation();

      updateSearchUI(engine.id);

      // Immediately collapse/hide list on selection

      const selector = document.getElementById('search-engine-selector');

      if (selector) {

        selector.classList.remove('expanded');

        selector.classList.add('suppress-hover');

      }

      if (appSearchRememberEnginePreference) {

        browser.storage.local.set({ currentSearchEngineId: engine.id }).catch(() => {});

      }

      if (searchInput) searchInput.focus();

    });

    

    list.appendChild(btn);

  });

  

  container.appendChild(list);

  // Allow hovering again once the mouse leaves

  container.addEventListener('mouseleave', () => {

    container.classList.remove('suppress-hover');

  });

  

  // Set initial position

  updateSearchSelectorPosition();

}



function populateSearchOptions() {

  if (!searchSelect) return;

  searchSelect.innerHTML = '';



  const activeEngines = searchEngines.filter((engine) => engine.enabled);



  if (activeEngines.length === 0) {

    const option = document.createElement('option');

    option.textContent = 'Google';

    option.value = 'google';

    searchSelect.appendChild(option);

  } else {

    activeEngines.forEach((engine) => {

      const option = document.createElement('option');

      option.value = engine.id;

      option.textContent = engine.name;

      searchSelect.appendChild(option);

    });

  }

  

  renderSearchEngineSelector(); 

}

function updateSearchUI(engineId) {

  let engine = searchEngines.find((e) => e.id === engineId);

  if (!engine) {

    engine = searchEngines.find((e) => e.enabled) || searchEngines[0];

  }



  currentSearchEngine = engine;

  ensureEngineIconExists(currentSearchEngine);

  searchInput.placeholder = `Search with ${currentSearchEngine.name}`;

  if (searchSelect) {

    const previousValue = searchSelect.value;

    searchSelect.value = currentSearchEngine.id;

    if (previousValue !== currentSearchEngine.id) {

      searchSelect.classList.remove('engine-switch-anim');

      void searchSelect.offsetWidth;

      searchSelect.classList.add('engine-switch-anim');

    }

  }



  // Update Visual Selector Active State

  const container = document.getElementById('search-engine-selector');

  if (container) {

    const buttons = container.querySelectorAll('.engine-icon-btn');

    buttons.forEach(btn => {

      if (btn.dataset.engineId === currentSearchEngine.id) {

        btn.classList.add('active');

      } else {

        btn.classList.remove('active');

      }

    });



    // Scroll the list to center the selection

    updateSearchSelectorPosition();

  }



  preconnectToSearchEngine(currentSearchEngine.url);



  const isDefault = currentSearchEngine.id === (appSearchDefaultEnginePreference || 'google');

  const searchContainer = document.querySelector('.search-container');

  if (searchContainer) {

    searchContainer.classList.toggle('non-default-engine', !isDefault);

  }

  // --- Cache Search State for Instant Load ---
  try {
    const iconHtml = currentSearchEngine.icon || `<span style="font-weight:bold; font-size:12px; color:#555;">${currentSearchEngine.name.charAt(0)}</span>`;

    const activeBtnHtml = `
      <div class="search-engine-list" style="transform: translateX(0px);">
        <div class="engine-icon-btn active" style="--engine-color: ${currentSearchEngine.color || '#333'};">
          <span class="tooltip-popup tooltip-top">${currentSearchEngine.name}</span>
          ${iconHtml}
        </div>
      </div>
    `;

    const fastSearch = {
      placeholder: searchInput.placeholder,
      selectorHtml: activeBtnHtml,
      engineId: currentSearchEngine.id
    };

    localStorage.setItem('fast-search', JSON.stringify(fastSearch));
  } catch (e) {
    // Ignore storage errors
  }

}



function preconnectToSearchEngine(url) {

  let origin;

  try {

    origin = new URL(url).origin;

  } catch (e) {

    return;

  }



  let link = document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`);

  if (link) return;



  link = document.createElement('link');

  link.rel = 'preconnect';

  link.href = origin;

  link.crossOrigin = 'anonymous';

  document.head.appendChild(link);

}



function clearSearchUI({ clearInput = true, abortSuggestions = false, bumpToken = false } = {}) {

  if (abortSuggestions && suggestionAbortController) {

    suggestionAbortController.abort();

    suggestionAbortController = null;

  }



  if (bumpToken) {

    latestSearchToken++;

  }



  if (clearInput) {

    searchInput.value = '';

  }



  clearAllSelections();

  currentSectionIndex = 0;

  lastSelectedText = '';

  selectionWasAuto = false;

  searchAreaWrapper.classList.remove('search-focused');

  document.body.classList.remove('search-focus-active');

  bookmarkResultsContainer.innerHTML = '';

  suggestionResultsContainer.innerHTML = '';

  lastBookmarkHtml = '';

  lastSuggestionHtml = '';

  updatePanelVisibility();

}



function hideSearchResultsPanel() {

  searchResultsPanel.classList.add('hidden');

  searchWidget.classList.remove('results-open');

  searchAreaWrapper.classList.remove('search-focused');

  document.body.classList.remove('search-focus-active');

  clearAllSelections();

  currentSectionIndex = 0;

  lastSelectedText = '';

  selectionWasAuto = false;

}



function cycleSearchEngine(direction) {

  const activeEngines = searchEngines.filter((eng) => eng.enabled);

  if (activeEngines.length < 2) return;



  // 1. Find index of currently selected engine

  let currentIndex = activeEngines.findIndex((eng) => eng.id === currentSearchEngine.id);

  if (currentIndex === -1) currentIndex = 0;



  // 2. Calculate next index (handles wrapping around)

  const delta = direction === 'down' ? 1 : -1;

  const nextIndex = (currentIndex + delta + activeEngines.length) % activeEngines.length;

  const nextEngine = activeEngines[nextIndex];



  // 3. Update UI

  updateSearchUI(nextEngine.id);

  handleSearchChange(); // Persist change if "Remember Engine" is on



  // 4. Focus input if we aren't already there (optional quality of life)

  if (document.activeElement !== searchInput) {

    searchInput.focus();

  }



  // 5. Trigger the visual "Slide Out" animation

  const selector = document.getElementById('search-engine-selector');

  if (selector) {

    selector.classList.remove('suppress-hover');

    selector.classList.add('expanded');



    if (selector.dataset.collapseTimeout) {

      clearTimeout(parseInt(selector.dataset.collapseTimeout));

    }



    const timeoutId = setTimeout(() => {

      selector.classList.remove('expanded');

      selector.classList.add('suppress-hover');

    }, 1500);



    selector.dataset.collapseTimeout = timeoutId;

  }

}



async function setupSearch() {

  await loadSearchEnginePreferences();



  const debouncedSearch = debounce(handleSearchInput, 120);
  window.addEventListener('beforeunload', () => {
    debouncedSearch.cancel?.();
  });

  searchForm.addEventListener('submit', handleSearch);

  searchSelect.addEventListener('change', handleSearchChange);

  searchSelect.addEventListener('wheel', (e) => {

    e.preventDefault();

    // Determine direction and let the helper handle the rest

    const direction = e.deltaY > 0 ? 'down' : 'up';

    cycleSearchEngine(direction);

  });



  searchInput.addEventListener('input', e => {

    userIsTyping = true;

    // Hide full list if user types

    const selector = document.getElementById('search-engine-selector');

    if (selector) {

      selector.classList.remove('expanded');

      selector.classList.add('suppress-hover');

    }

    debouncedSearch(e);

  });

  document.addEventListener('keydown', handleSearchKeydown);



  searchInput.addEventListener('click', e => {

    e.stopPropagation();

  });

  

  searchResultsPanel.addEventListener('click', handleSearchResultClick, true);

  searchResultsPanel.addEventListener('click', e => e.stopPropagation());



  document.addEventListener('keydown', (e) => {

    // Ignore if user is already typing in a field

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;



    // --- 1. Global Alt + Arrow Up/Down for Search Engine Switching ---

    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {

      e.preventDefault();

      cycleSearchEngine(e.key === 'ArrowDown' ? 'down' : 'up');

      return;

    }



    // --- 2. Existing "Start Typing" Logic ---

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.length > 1) return;

    

    searchInput.focus();

  });



  window.addEventListener('mousedown', (e) => {

    const target = e.target;

    if (searchWidget.contains(target) || searchResultsPanel.contains(target) || searchInput.contains(target)) {

      return;

    }

    hideSearchResultsPanel();

  });



  revealWidget('.widget-search');

}



async function handleSearchChange() {

  const newId = searchSelect ? searchSelect.value : currentSearchEngine.id;

  updateSearchUI(newId);

  if (appSearchRememberEnginePreference) {

    if (searchEngineSaveTimeout) clearTimeout(searchEngineSaveTimeout);

    searchEngineSaveTimeout = setTimeout(() => {

      browser.storage.local.set({ currentSearchEngineId: newId }).catch((err) => {

        console.warn('Failed to persist search engine selection', err);

      });

    }, 200);

  }

  if (searchInput.value.trim().length > 0) {

    handleSearchInput();

  }

}



async function openSearchUrl(url) {

  if (!url) return;

  // Firefox blocks privileged URLs via browser.tabs, but allows standard navigation in current tab.

  const isPrivileged = url.startsWith('about:') || url.startsWith('view-source:');

  if (isPrivileged) {

    window.location.href = url;

    return;

  }

  // Use the Extension API for navigation. This supports special schemes better than window.open.

  if (appSearchOpenNewTabPreference) {

    clearSearchUI({ abortSuggestions: true, bumpToken: true });

    hideSearchResultsPanel();



    try {

      await browser.tabs.create({ url, active: true });

    } catch (err) {

      console.warn('Failed to open search result', err);

    }

    return;

  }



  const clearOnLeave = () => {

    requestAnimationFrame(() => {

      searchInput.value = '';

      hideSearchResultsPanel();

    });

  };



  window.addEventListener('pagehide', clearOnLeave, { once: true });



  try {

    await browser.tabs.update({ url });

  } catch (err) {

    console.warn('Navigation failed (likely privileged URL), falling back to new tab:', err);



    try {

      await browser.tabs.create({ url, active: true });

      clearSearchUI({ abortSuggestions: true, bumpToken: true });

      hideSearchResultsPanel();

    } catch (createErr) {

      console.error('Failed to open fallback tab', createErr);

    }

  }

}



function executeSearch(query) {

  const originalQuery = (query || '').trim();

  if (!originalQuery) return;



  let effectiveQuery = originalQuery;



  const bangMatch = originalQuery.match(/^!(\S+)\s+(.*)/);

  if (bangMatch) {

    const rawBang = bangMatch[1].toLowerCase();

    const bangQuery = bangMatch[2].trim();

    const engineId = bangMap[rawBang] || rawBang;

    const matchingEngine = searchEngines.find((e) => e.id.toLowerCase() === engineId);

    if (matchingEngine && bangQuery) {

      updateSearchUI(matchingEngine.id);

      effectiveQuery = bangQuery;

    }

  }



  if (isLikelyUrl(effectiveQuery)) {

    let url = effectiveQuery;

    // Check if it already has a protocol (e.g., "http://", "mailto:", "about:")

    // We look for a colon early in the string, but exclude "localhost:" (which is host:port)

    const hasProtocol = /^[a-z][a-z0-9+.-]+:/i.test(effectiveQuery) && !effectiveQuery.startsWith('localhost:');



    if (!hasProtocol) {

      // Logic to determine HTTP vs HTTPS

      // 1. Localhost, IPs, or Intranet Shortnames (e.g. "nas/") use HTTP

      const isLocal = effectiveQuery.startsWith('localhost')

        || /^(\d{1,3}\.){3}\d{1,3}/.test(effectiveQuery)

        || effectiveQuery.indexOf('.') === -1;



      url = isLocal ? `http://${url}` : `https://${url}`;

    }

    openSearchUrl(url);

    return;

  }



  const encoded = encodeURIComponent(effectiveQuery);

  const url = currentSearchEngine.url.includes('%s')

    ? currentSearchEngine.url.replace('%s', encoded)

    : `${currentSearchEngine.url}${encoded}`;

  openSearchUrl(url);

}



// ===============================================

// KEYBOARD NAVIGATION FOR SEARCH RESULTS

// ===============================================

document.addEventListener('keydown', (e) => {

  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {

    e.preventDefault();

  }

}, { passive: false });



function getCurrentSectionItems(sectionIndex = currentSectionIndex) {

  const section = resultSections[sectionIndex];

  if (!section) return [];

  return Array.from(section.querySelectorAll('.result-item'));

}



function removeSelectionClasses() {

  resultSections.forEach(section => {

    if (!section) return;

    section.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

  });

}



function clearAllSelections() {

  removeSelectionClasses();

  currentSelectionIndex = -1;

  selectionWasAuto = false;

}



function syncSearchInputWithItem(item) {

  if (!item || userIsTyping) return;

  const label = item.querySelector('.result-label');

  if (label && label.textContent) {

    searchInput.value = label.textContent;

  }

}



function getResultLabelText(item) {

  if (!item) return '';

  const label = item.querySelector('.result-label');

  if (label && label.textContent) return label.textContent.trim();

  return (item.textContent || '').trim();

}



function selectItem(items, index) {

  if (!items.length) return;



  let nextIndex = index;

  if (nextIndex < 0) nextIndex = items.length - 1;

  if (nextIndex >= items.length) nextIndex = 0;



  removeSelectionClasses();

  items[nextIndex].classList.add('selected');

  items[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });



  currentSelectionIndex = nextIndex;

  selectionWasAuto = false;

  lastSelectedText = getResultLabelText(items[nextIndex]);

  syncSearchInputWithItem(items[nextIndex]);

}



function attachHoverSync() {

  resultSections.forEach((section, sectionIndex) => {

    if (!section) return;

    const items = Array.from(section.querySelectorAll('.result-item'));

    items.forEach((item, index) => {

      if (item.dataset.hoverBound === '1') return;

      item.dataset.hoverBound = '1';

      item.addEventListener('mouseenter', () => {

        userIsTyping = false;

        removeSelectionClasses();

        selectionWasAuto = false;

        item.classList.add('selected');

        currentSectionIndex = sectionIndex;

        currentSelectionIndex = index;

        lastSelectedText = getResultLabelText(item);

      });

    });

  });

}



function moveSection(direction) {

  const totalSections = resultSections.length;

  if (!totalSections) return;



  for (let i = 0; i < totalSections; i++) {

    currentSectionIndex = (currentSectionIndex + direction + totalSections) % totalSections;

    const newItems = getCurrentSectionItems();

    if (newItems.length) {

      currentSelectionIndex = 0;

      selectItem(newItems, 0);

      return;

    }

  }



  clearAllSelections();

  currentSectionIndex = 0;

}



function getSelectedResult() {

  const selected = searchResultsPanel.querySelector('.result-item.selected');

  if (!selected) return null;

  if (selectionWasAuto) return null;

  return selected;

}



function getSelectionSnapshot() {

  const selected = searchResultsPanel.querySelector('.result-item.selected');

  if (!selected) return null;

  const url = selected.dataset?.url || selected.getAttribute('href') || '';

  const text = (selected.textContent || '').trim();

  const sectionIndex = resultSections.findIndex(section => section && section.contains(selected));

  const itemIndex = sectionIndex > -1

    ? Array.from(resultSections[sectionIndex].querySelectorAll('.result-item')).indexOf(selected)

    : -1;



  return { sectionIndex, url, text, itemIndex };

}



function handleSearch(event) {

  // Stop the native form submission; navigation is handled inline to retain user gesture.

  event.preventDefault();



  if (searchNavigationLocked) return;

  searchNavigationLocked = true;



  const target = getSelectedResult();

  const query = searchInput.value.trim();



  if (target) {

    const url = target.dataset?.url || target.getAttribute('href') || '';

    if (url) {

      openSearchUrl(url);

      setTimeout(() => { searchNavigationLocked = false; }, 0);

      return;

    }

  }



  if (query) {

    executeSearch(query);

  }



  setTimeout(() => { searchNavigationLocked = false; }, 0);

}



function handleSearchResultClick(e) {

  if (e.target.classList.contains('copy-btn') || e.target.classList.contains('calc-copy')) {

    e.preventDefault();

    e.stopPropagation();

    const parent = e.target.closest('[data-copy]');

    const text = parent ? parent.dataset.copy || e.target.dataset.copy : '';

    if (text) {

      navigator.clipboard.writeText(text).then(() => {

        const original = e.target.textContent;

        e.target.textContent = 'Copied!';

        setTimeout(() => {

          e.target.textContent = original;

        }, 1500);

      }).catch((err) => {

        console.warn('Copy failed', err);

      });

    }

    return;

  }



  const target = e.target.closest('.result-item');

  if (!target) return;

  e.preventDefault();



  const bangInsert = target.dataset.bangInsert;

  if (bangInsert) {

    searchInput.value = bangInsert;

    searchInput.focus();

    handleSearchInput();

    return;

  }



  if (searchNavigationLocked) return;

  searchNavigationLocked = true;



  const url = (target.dataset && target.dataset.url) || '';

  if (url) {

    openSearchUrl(url);

  }



  setTimeout(() => { searchNavigationLocked = false; }, 0);

}



function handleSearchKeydown(e) {

  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchWidget.contains(e.target)) {

    e.preventDefault();

  }



  if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchWidget.contains(e.target)) {

    e.preventDefault();

    cycleSearchEngine(e.key === 'ArrowDown' ? 'down' : 'up');

    return;

  }



  if (e.altKey && e.key === 'Home' && searchWidget.contains(e.target)) {

    e.preventDefault();

    const defaultId = appSearchDefaultEnginePreference || 'google';

    updateSearchUI(defaultId);

    handleSearchChange();

    return;

  }



  // Only operate when results panel is open and the event originated from the search UI.

  const panelOpen = !searchResultsPanel.classList.contains('hidden');

  if (!panelOpen) {

    if (e.key === 'Escape' && searchWidget.contains(e.target)) {

      searchInput.value = '';

    }

    return;

  }



  const isSearchContext =

    searchWidget.contains(e.target) || searchResultsPanel.contains(e.target);



  if (!isSearchContext) return;



  switch (e.key) {

    case 'ArrowDown': {

      const items = getCurrentSectionItems();



      userIsTyping = false;

      // If current section has items, but we are at the last one -> jump to next section

      if (items.length > 0 && currentSelectionIndex === items.length - 1) {

        e.preventDefault();



        let nextSection = currentSectionIndex + 1;



        // wrap around to start

        if (nextSection >= resultSections.length) nextSection = 0;



        const nextItems = getCurrentSectionItems(nextSection);



        if (nextItems.length > 0) {

          currentSectionIndex = nextSection;

          if (resultSections[currentSectionIndex]) {

            resultSections[currentSectionIndex].scrollTop = 0;

          }

          selectItem(nextItems, 0);

          return;

        }

      }



      // Normal down movement

      if (items.length > 0) {

        e.preventDefault();

        selectItem(items, currentSelectionIndex + 1);

      }

      break;

    }



    case 'ArrowUp': {

      const items = getCurrentSectionItems();



      userIsTyping = false;

      // If at first item -> jump to previous section

      if (items.length > 0 && currentSelectionIndex === 0) {

        e.preventDefault();



        let prevSection = currentSectionIndex - 1;



        // wrap around to last

        if (prevSection < 0) prevSection = resultSections.length - 1;



        const prevItems = getCurrentSectionItems(prevSection);



        if (prevItems.length > 0) {

          currentSectionIndex = prevSection;

          if (resultSections[currentSectionIndex]) {

            resultSections[currentSectionIndex].scrollTop = 0;

          }

          selectItem(prevItems, prevItems.length - 1);

          return;

        }

      }



      // Normal up movement

      if (items.length > 0) {

        e.preventDefault();

        selectItem(items, currentSelectionIndex - 1);

      }

      break;

    }



    case 'Tab':

      if (searchResultsPanel.querySelectorAll('.result-item').length === 0) {

        return;

      }

      e.preventDefault();

      moveSection(e.shiftKey ? -1 : 1);

      break;



    case 'Enter': {

      e.preventDefault();

      const selected = getSelectedResult();

      

      if (selected && (selected.classList.contains('calculator-result') || selected.classList.contains('calc-item'))) {

        const copyBtn = selected.querySelector('.copy-btn, .calc-copy');

        if (copyBtn) copyBtn.click();

        return;

      }



      if (selected && selected.dataset.bangInsert) {

        searchInput.value = selected.dataset.bangInsert;

        searchInput.focus();

        handleSearchInput();

        return;

      }



      const query = searchInput.value.trim();



      if (selected) {

        if (searchNavigationLocked) return;

        searchNavigationLocked = true;



        const url = selected.dataset?.url || selected.getAttribute('href') || '';

        if (url) {

          openSearchUrl(url);

        }



        setTimeout(() => { searchNavigationLocked = false; }, 0);

        break;

      }



      if (query !== '') {

        executeSearch(query);

      }



      break;

    }



    case 'Escape':

      e.preventDefault();

      hideSearchResultsPanel();

      break;

  }

}



function restoreSelectionAfterFilter() {

  if (!lastSelectedText) return false;

  const items = Array.from(searchResultsPanel.querySelectorAll('.result-item'));

  for (let i = 0; i < items.length; i++) {

    const text = getResultLabelText(items[i]);

    if (text.toLowerCase() === lastSelectedText.toLowerCase()) {

      removeSelectionClasses();

      items[i].classList.add('selected');

      const sectionIndex = resultSections.findIndex(section => section && section.contains(items[i]));

      if (sectionIndex !== -1) {

        currentSectionIndex = sectionIndex;

        currentSelectionIndex = Array.from(resultSections[sectionIndex].querySelectorAll('.result-item')).indexOf(items[i]);

        selectionWasAuto = false;

        lastSelectedText = text;

        items[i].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });

        syncSearchInputWithItem(items[i]);

        return true;

      }

    }

  }

  return false;

}



function maybeAutoSelectSuggestion(query) {

  const trimmed = (query || '').trim();

  if (!trimmed || trimmed.length < 2) return;



  const bookmarks = bookmarkResultsContainer.querySelectorAll('.result-item');

  const suggestions = suggestionResultsContainer.querySelectorAll('.result-item');



  if (bookmarks.length > 0) return;

  if (suggestions.length === 0) return;



  const first = suggestions[0];

  const text = getResultLabelText(first);

  if (text.toLowerCase() === trimmed.toLowerCase()) return;



  removeSelectionClasses();

  currentSectionIndex = 1;

  currentSelectionIndex = 0;

  selectionWasAuto = true;



  first.classList.add('selected');

  first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });

}



function applySelectionToCurrentResults(snapshot = null, query = '') {

  const sections = resultSections.map(section =>

    section ? Array.from(section.querySelectorAll('.result-item')) : []

  );

  const bookmarkItems = sections[0] || [];

  const suggestionItems = sections[1] || [];



  const hasAnyItems = sections.some(list => list.length > 0);

  if (!hasAnyItems) {

    clearAllSelections();

    currentSectionIndex = 0;

    return;

  }



  if (!sections[currentSectionIndex].length) {

    const nextIndex = sections.findIndex(list => list.length > 0);

    if (nextIndex !== -1) {

      currentSectionIndex = nextIndex;

    }

  }



  let restored = false;

  if (snapshot) {

    for (let sIndex = 0; sIndex < sections.length; sIndex++) {

      const list = sections[sIndex];

      if (!list.length) continue;

      let matchIndex = -1;



      if (snapshot.url) {

        matchIndex = list.findIndex(item => (item.dataset?.url || item.getAttribute('href') || '') === snapshot.url);

      }

      if (matchIndex === -1 && snapshot.text) {

        matchIndex = list.findIndex(item => (item.textContent || '').trim() === snapshot.text);

      }



      if (matchIndex !== -1) {

        currentSectionIndex = sIndex;

        currentSelectionIndex = matchIndex;

        selectionWasAuto = false;

        lastSelectedText = getResultLabelText(list[matchIndex]);

        restored = true;

        break;

      }

    }

  }



  if (!restored) {

    restored = restoreSelectionAfterFilter();

  }



  let currentItems = sections[currentSectionIndex] || [];

  if (currentSelectionIndex >= currentItems.length) {

    currentSelectionIndex = -1;

  }



  if (!restored) {

    selectionWasAuto = false;

  }



  removeSelectionClasses();



  if (currentSelectionIndex >= 0 && currentItems[currentSelectionIndex]) {

    const targetItem = currentItems[currentSelectionIndex];

    targetItem.classList.add('selected');

    targetItem.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });

    lastSelectedText = getResultLabelText(targetItem);

    syncSearchInputWithItem(targetItem);

  } else {

    currentSelectionIndex = -1;

  }



  if (currentSelectionIndex === -1 && bookmarkItems.length === 0 && suggestionItems.length > 0) {

    maybeAutoSelectSuggestion(query);

  }

}



function isStaleSearch(token, queryLower) {

  return token !== latestSearchToken || queryLower !== searchInput.value.toLowerCase();

}



async function loadSearchEnginePreferences() {

  const stored = await browser.storage.local.get([

    SEARCH_ENGINES_PREF_KEY,

    'currentSearchEngineId',

    APP_SEARCH_REMEMBER_ENGINE_KEY,

    APP_SEARCH_DEFAULT_ENGINE_KEY

  ]);

  const savedConfig = stored[SEARCH_ENGINES_PREF_KEY];



  // 1. Handle New Format (Array of ordered objects)

  if (Array.isArray(savedConfig)) {

    const reordered = [];

    const processedIds = new Set();



    savedConfig.forEach(cfg => {

      // Find matching engine in the static list

      const match = searchEngines.find(e => e.id === cfg.id);

      if (match) {

        match.enabled = cfg.enabled;

        reordered.push(match);

        processedIds.add(cfg.id);

      }

    });



    // Add any new engines defined in code but missing from storage (e.g. after an update)

    searchEngines.forEach(e => {

      if (!processedIds.has(e.id)) {

        reordered.push(e);

      }

    });



    // Apply the new order

    searchEngines = reordered;

  } 

  // 2. Handle Legacy Format (Object with boolean flags)

  else if (savedConfig && typeof savedConfig === 'object') {

    searchEngines.forEach((engine) => {

      if (Object.prototype.hasOwnProperty.call(savedConfig, engine.id)) {

        engine.enabled = savedConfig[engine.id];

      }

    });

  }



  if (Object.prototype.hasOwnProperty.call(stored, APP_SEARCH_REMEMBER_ENGINE_KEY)) {

    appSearchRememberEnginePreference = stored[APP_SEARCH_REMEMBER_ENGINE_KEY] !== false;

  }

  if (stored[APP_SEARCH_DEFAULT_ENGINE_KEY]) {

    appSearchDefaultEnginePreference = stored[APP_SEARCH_DEFAULT_ENGINE_KEY];

  }



  populateSearchOptions();



  const remember = stored[APP_SEARCH_REMEMBER_ENGINE_KEY] !== false;

  let targetEngineId = null;



  if (remember) {

    targetEngineId = stored.currentSearchEngineId;

  } else {

    targetEngineId = stored[APP_SEARCH_DEFAULT_ENGINE_KEY] || appSearchDefaultEnginePreference || 'google';

  }



  const engineObj = searchEngines.find((e) => e.id === targetEngineId && e.enabled);

  if (!engineObj) {

    const fallback = searchEngines.find((e) => e.enabled && e.id === (appSearchDefaultEnginePreference || 'google'));

    targetEngineId = fallback ? fallback.id : (searchEngines.find((e) => e.enabled)?.id || 'google');

  }



  updateSearchUI(targetEngineId);

}



// Function to fetch suggestions

async function fetchSearchSuggestions(query, engine) {

  // 1. If the engine has no suggestion URL (e.g. Reddit), return empty immediately

  if (!engine.suggestionUrl) return [];



  const cacheKey = `${engine.id}:${query}`;

  if (suggestionCache.has(cacheKey)) {

    return suggestionCache.get(cacheKey);

  }



  if (suggestionAbortController) {

    suggestionAbortController.abort();

  }

  suggestionAbortController = new AbortController();

  const signal = suggestionAbortController.signal;



  try {

    const res = await fetch(engine.suggestionUrl + encodeURIComponent(query), { signal });

    if (!res.ok) return [];

    const raw = await res.text();

    let data;

    try {

      data = JSON.parse(raw);

    } catch (parseErr) {

      data = raw;

    }



    let results = [];



    // Group 1: Standard OpenSearch Format (Google, Bing, YouTube, Wikipedia, Amazon, Maps)

    // Format: ["query", ["suggestion1", "suggestion2"], ...]

    const openSearchEngines = ['Google', 'Bing', 'YouTube', 'Wikipedia', 'Amazon', 'Maps'];

    if (openSearchEngines.includes(engine.name)) {

      results = Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter(val => typeof val === 'string') : [];

      suggestionCache.set(cacheKey, results);

      return results;

    }



    // Group 2: DuckDuckGo (Array of objects)

    if (engine.name === 'DuckDuckGo') {

      results = Array.isArray(data) ? data.map(item => item && item.phrase).filter(val => typeof val === 'string') : [];

      suggestionCache.set(cacheKey, results);

      return results;

    }



    // Group 3: Yahoo (Nested Object)

    if (engine.name === 'Yahoo') {

      const yahooResults = data?.gossip?.results;

      if (Array.isArray(yahooResults)) {

        results = yahooResults

          .flatMap(entry => (entry?.nodes || []).map(node => node && node.key))

          .filter(val => typeof val === 'string');

      } else {

        results = [];

      }

      suggestionCache.set(cacheKey, results);

      return results;

    }



    // Group 4: Yandex (Nested Array)

    if (engine.name === 'Yandex') {

      let parsedArray = data;

      if (typeof parsedArray === 'string') {

        try {

          parsedArray = JSON.parse(parsedArray);

        } catch {

          parsedArray = [];

        }

      }

      const suggestionBucket = Array.isArray(parsedArray) && parsedArray.length > 1 ? parsedArray[1] : [];

      results = Array.isArray(suggestionBucket)

        ? suggestionBucket

            .map(item => (Array.isArray(item) ? item[1] : item))

            .filter(val => typeof val === 'string')

        : [];

      suggestionCache.set(cacheKey, results);

      return results;

    }



    suggestionCache.set(cacheKey, results);

    return results;

  } catch (err) {

    if (err.name === 'AbortError') {

      return null;

    }

    console.error('Suggestion fetch error:', err);

    return [];

  }

}



function getBangSuggestions(query) {

  const term = query.substring(1).toLowerCase().trim();

  const matches = [];

  const seenIds = new Set();



  Object.entries(bangMap).forEach(([bang, engineId]) => {

    if (bang.startsWith(term)) {

      const engine = searchEngines.find(e => e.id === engineId);

      if (engine) {

        matches.push({ bang, engine });

        seenIds.add(engineId);

      }

    }

  });



  searchEngines.forEach(engine => {

    const isMatch = engine.id.startsWith(term);



    if (isMatch && !matches.find(m => m.engine.id === engine.id && m.bang === engine.id) && !seenIds.has(engine.id)) {

      matches.push({ bang: engine.id, engine });

    }

  });



  return matches.sort((a, b) => {

    if (a.bang === term) return -1;

    if (b.bang === term) return 1;

    return a.bang.localeCompare(b.bang);

  });

}



// Helper function to show/hide the main panel

function updatePanelVisibility() {

  const hasBookmarks = bookmarkResultsContainer.innerHTML.trim().length > 0;

  const hasSuggestions = suggestionResultsContainer.innerHTML.trim().length > 0;



  if (hasBookmarks || hasSuggestions) {

    searchResultsPanel.classList.remove('hidden');

    searchWidget.classList.add('results-open');

  } else {

    searchResultsPanel.classList.add('hidden');

    searchWidget.classList.remove('results-open');

  }

}



function hydrateSearchResultFavicons(container) {
  if (!container) return;
  const targets = Array.from(container.querySelectorAll('.result-favicon[data-favicon-raw-url]'));
  if (!targets.length) return;

  targets.forEach((img) => {
    if (!img.decoding) {
      img.decoding = 'async';
    }
    if (!img.loading) {
      img.loading = 'lazy';
    }
    if (!img.getAttribute('fetchpriority')) {
      img.setAttribute('fetchpriority', 'low');
    }
    if (!img.referrerPolicy) {
      img.referrerPolicy = 'no-referrer';
    }

    const rawUrl = img.dataset.faviconRawUrl || '';
    const hideImg = () => {
      img.style.display = 'none';
      revokeFaviconObjectUrl(img);
      img.removeAttribute('src');
    };

    if (!rawUrl) {
      hideImg();
      return;
    }

    const domainKey = getDomainKeyFromUrl(rawUrl);
    if (!domainKey) {
      hideImg();
      return;
    }

    const candidates = buildFaviconCandidates(rawUrl);
    if (!candidates.length) {
      hideImg();
      return;
    }

    const shouldAbort = () => img.dataset.faviconRawUrl !== rawUrl;
    resolveFaviconForImageTarget({
      img,
      domainKey,
      candidates,
      shouldAbort,
      onResolved: (resolvedUrl, meta) => {
        img.style.display = '';
        if (!meta.sourceAlreadySet) {
          setFaviconImageSrc(img, resolvedUrl);
        }
      },
      onFailed: () => {
        hideImg();
      },
      onNegativeCacheHit: () => {
        hideImg();
      },
      onAbort: () => {},
      acceptCandidate: () => true
    });
  });
}

// Merged logic into one async function

async function handleSearchInput() {

  const previousSelection = getSelectionSnapshot();

  clearAllSelections();

  if (previousSelection && previousSelection.sectionIndex >= 0) {

    currentSectionIndex = previousSelection.sectionIndex;

  }

  const query = searchInput.value;

  const queryLower = query.toLowerCase(); 

  

  // =========================================================

  // 1. ICON UPDATE LOGIC (Moved to Top & Fixed)

  // =========================================================

  const bangMatch = query.match(/^!(\S+)/); // Match "!something"

  let targetEngineId = null;



  if (bangMatch) {

    const rawBang = bangMatch[1].toLowerCase();

    const mappedId = bangMap[rawBang] || rawBang;

    

    const engine = searchEngines.find(e => e.id === mappedId);

    

    if (engine) {

      targetEngineId = engine.id;

    }

  }



  if (targetEngineId) {

    if (currentSearchEngine.id !== targetEngineId) {

      updateSearchUI(targetEngineId);

    }

  } 

  else {

    if (!queryLower.startsWith('!') || queryLower.trim().length === 0) {

       const savedId = appSearchRememberEnginePreference

        ? (await browser.storage.local.get('currentSearchEngineId')).currentSearchEngineId

        : appSearchDefaultEnginePreference;

      

      const targetId = savedId || 'google';

      

      if (currentSearchEngine.id !== targetId) {

        updateSearchUI(targetId);

      }

    }

  }

  // =========================================================



  const isBangSearch = queryLower.startsWith('!') && !queryLower.includes(' ');

  const currentToken = ++latestSearchToken;



  // 2. Handle empty query

  if (queryLower.trim().length === 0) {

    clearSearchUI({ clearInput: false, abortSuggestions: true });

    return;

  }

  

  searchAreaWrapper.classList.add('search-focused');

  document.body.classList.add('search-focus-active');



  // --- A. Generate Calculator HTML ---

  let calcHtml = '';

  if (appSearchMathPreference && !isBangSearch) {

    const mathResult = evaluateMath(queryLower.trim());

    const unitResult = mathResult === null ? evaluateUnits(queryLower.trim()) : null;

    const finalResult = mathResult !== null ? mathResult : unitResult;



    if (finalResult !== null) {

      const displayResult = escapeHtml(String(finalResult));

      calcHtml = `

        <div class="result-header">Calculator</div>

        <div class="result-item calc-item" data-copy="${displayResult}">

          <div class="calc-left">

            <div class="calc-icon">&#129518;</div>

            <div class="calc-text">

              <div class="calc-answer">${displayResult}</div>

              <div class="calc-expression">${escapeHtml(query)}</div>

            </div>

          </div>

          <button class="calc-copy" data-copy="${displayResult}">Copy</button>

        </div>

      `;

    }

  }



  // --- B. Generate Bookmark HTML ---

  let bookmarkHtml = '';

  const shownUrls = new Set();

  

  if (!isBangSearch) {

    const queryTerms = queryLower.trim().split(/\s+/).filter(Boolean);

    const bookmarkResults = allBookmarks

      .filter(b => {

        const title = (b.title || '').toLowerCase();

        const url = (b.url || '').toLowerCase();

        return queryTerms.every(term => title.includes(term) || url.includes(term));

      })

      .slice(0, 5);



    if (bookmarkResults.length > 0) {

      bookmarkHtml += '<div class="result-header">Bookmarks</div>';

      bookmarkResults.forEach(bookmark => {

        const bookmarkUrl = bookmark.url || '';

        if (!bookmarkUrl) return;

        shownUrls.add(bookmarkUrl);

        const safeTitle = escapeHtml(bookmark.title || 'No Title');

        const safeUrl = escapeHtml(bookmarkUrl);

        bookmarkHtml += `

          <button type="button" class="result-item" data-url="${safeUrl}">

            <img class="result-favicon" data-favicon-raw-url="${safeUrl}" loading="lazy" decoding="async" alt="">

            <div class="result-item-info">

              <strong class="result-label">${safeTitle}</strong>

            </div>

          </button>

        `;

      });

    }

  }



  // --- C. Handle Bang Autocomplete Dropdown ---

  if (isBangSearch) {

    const bangSuggestions = getBangSuggestions(queryLower);

    

    suggestionResultsContainer.innerHTML = '';

    

    let bangHtml = `<div class="result-header">Bang Shortcuts</div>`;

    

    if (bangSuggestions.length === 0) {

      bangHtml += `<div class="result-item"><div class="result-item-info" style="justify-content:center; color:#888;">No matching bangs</div></div>`;

    } else {

      bangSuggestions.forEach(item => {

        const safeName = escapeHtml(item.engine.name);

        const bangCode = `!${item.bang}`;

        bangHtml += `

          <button type="button" class="result-item" data-bang-insert="${bangCode} ">

            <span class="bang-badge">${bangCode}</span>

            ${item.engine.symbolId ? useSvgIcon(item.engine.symbolId) : ''}

            <div class="result-item-info">

              <strong class="result-label">${safeName}</strong>

            </div>

          </button>

        `;

      });

    }

    

    suggestionResultsContainer.innerHTML = bangHtml;

    

    bookmarkResultsContainer.innerHTML = ''; 

    lastBookmarkHtml = '';

    lastSuggestionHtml = bangHtml;

    

    applySelectionToCurrentResults(null, query); 

    updatePanelVisibility();

    return;

  }



  if (isStaleSearch(currentToken, queryLower)) return;



  const topSectionHtml = calcHtml + bookmarkHtml;

  if (topSectionHtml !== lastBookmarkHtml) {

    bookmarkResultsContainer.innerHTML = topSectionHtml;

    lastBookmarkHtml = topSectionHtml;
    hydrateSearchResultFavicons(bookmarkResultsContainer);

  }



  applySelectionToCurrentResults(previousSelection, query.trim());

  updatePanelVisibility();



  // --- E. Start Async Fetches (Standard History/Suggestions) ---

  let historyPromise = Promise.resolve([]);

  if (appSearchShowHistoryPreference && browser.history) {

    const startTime = Date.now() - (90 * 24 * 60 * 60 * 1000);

    historyPromise = browser.history.search({

      text: query,

      maxResults: 5,

      startTime

    }).catch(err => []);

  }



  const suggestionsPromise = fetchSearchSuggestions(query.trim(), currentSearchEngine);



  const [historyResults, suggestionResults] = await Promise.all([historyPromise, suggestionsPromise]);



  if (isStaleSearch(currentToken, queryLower)) return;



  // --- F. Build Bottom Section HTML ---

  let bottomHtml = '';

  const searchIcon = useSvgIcon('search');

  const clockIcon = useSvgIcon('historyClock');



  if (historyResults.length > 0) {

    const uniqueHistory = historyResults.filter(item => !shownUrls.has(item.url));

    if (uniqueHistory.length > 0) {

      bottomHtml += `<div class="result-header">Recent History</div>`;

      uniqueHistory.forEach(item => {

        const url = item.url;

        const title = item.title || url;

        bottomHtml += `

          <button type="button" class="result-item result-item-history" data-url="${escapeHtml(url)}">

            ${clockIcon}

            <div class="result-item-info">

              <strong class="result-label">${escapeHtml(title)}</strong>

            </div>

          </button>

        `;

      });

    }

  }



  if (suggestionResults === null) {

    attachHoverSync();

    return;

  }



  if (suggestionResults && suggestionResults.length > 0) {

    const safeQuery = escapeHtml(query);

    const searchUrl = `${currentSearchEngine.url}${encodeURIComponent(query)}`;

    

    bottomHtml += `<div class="result-header">${currentSearchEngine.name} Search</div>`;

    bottomHtml += `

      <button type="button" class="result-item result-item-suggestion" data-url="${escapeHtml(searchUrl)}">

        ${searchIcon}

        <div class="result-item-info">

          <strong class="result-label">${safeQuery}</strong>

        </div>

      </button>

    `;



    suggestionResults.slice(0, 10).forEach(suggestion => {

      if (suggestion.toLowerCase() === query.toLowerCase()) return;

      const safeSuggestion = escapeHtml(suggestion);

      const suggestionUrl = `${currentSearchEngine.url}${encodeURIComponent(suggestion)}`;

      bottomHtml += `

        <button type="button" class="result-item result-item-suggestion" data-url="${escapeHtml(suggestionUrl)}">

          ${searchIcon}

          <div class="result-item-info">

            <strong class="result-label">${safeSuggestion}</strong>

          </div>

        </button>

      `;

    });

  }



  if (bottomHtml !== lastSuggestionHtml) {

    suggestionResultsContainer.innerHTML = bottomHtml;

    lastSuggestionHtml = bottomHtml;

  }



  applySelectionToCurrentResults(previousSelection, query.trim());

  attachHoverSync();

  updatePanelVisibility();

}



// ===============================================
// --- NEWS WIDGET & SETTINGS ---
// ===============================================

const newsWidget = document.querySelector('.widget-news');

const newsList = document.getElementById('news-list');

const newsSettingsModal = document.getElementById('news-settings-modal');

const newsSettingsCloseBtn = document.getElementById('news-settings-close-btn');

const newsSettingsCancelBtn = document.getElementById('news-settings-cancel-btn');

const newsSettingsSaveBtn = document.getElementById('news-settings-save-btn');

const newsSourceSelect = document.getElementById('news-source-select');

const newsSettingsBtn = document.getElementById('news-settings-btn');

const newsRefreshBtn = document.getElementById('news-refresh-btn');

const newsUpdatedEl = document.getElementById('news-updated');

const DEFAULT_NEWS_SOURCE_ID = 'aljazeera';

const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

const NEWS_ITEMS_LIMIT = 5;

const NEWS_DESCRIPTION_LIMIT = 220;

const NEWS_EMPTY_MESSAGE = 'No headlines available right now.';

const NEWS_EMPTY_HINT = 'Try refresh or change source.';

const NEWS_SOURCES = [
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'bbc-top', name: 'BBC Top Stories', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc-politics', name: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml' },
  { id: 'bbc-business', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'bbc-technology', name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'bbc-health', name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
  { id: 'bbc-entertainment', name: 'BBC Entertainment', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://feeds.feedburner.com/TechCrunch' },
  { id: 'espn', name: 'ESPN Sports', url: 'https://www.espn.com/espn/rss/news' },
  { id: 'espn-cricinfo', name: 'ESPN Cricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' }
];

let newsRefreshInFlight = false;

let newsFetchWarningLogged = false;

let newsFetchAbortController = null;

let newsIdleRefreshQueued = false;

let newsVisibilityObserver = null;

let newsLazyLoadTriggered = false;

function resolveNewsSourceId(sourceId) {
  const match = NEWS_SOURCES.find((source) => source.id === sourceId);
  return match ? match.id : DEFAULT_NEWS_SOURCE_ID;
}

function getNewsSourceById(sourceId) {
  const resolved = resolveNewsSourceId(sourceId);
  return NEWS_SOURCES.find((source) => source.id === resolved) || NEWS_SOURCES[0];
}

function ensureNewsSourceOptions() {
  if (!newsSourceSelect || newsSourceSelect.dataset.ready === '1') return;
  newsSourceSelect.innerHTML = '';
  NEWS_SOURCES.forEach((source) => {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    newsSourceSelect.appendChild(option);
  });
  newsSourceSelect.dataset.ready = '1';
}

function closeNewsSettingsModal() {
  closeModalWithAnimation('news-settings-modal', '.dialog-content');
}

async function openNewsSettingsModal(triggerSource) {
  if (!newsSettingsModal) return;
  ensureNewsSourceOptions();
  let storedSource = appNewsSourcePreference || DEFAULT_NEWS_SOURCE_ID;
  try {
    const data = await browser.storage.local.get(APP_NEWS_SOURCE_KEY);
    storedSource = resolveNewsSourceId(data[APP_NEWS_SOURCE_KEY] || storedSource);
  } catch (err) {
    storedSource = resolveNewsSourceId(storedSource);
  }
  if (newsSourceSelect) {
    newsSourceSelect.value = storedSource;
  }
  openModalWithAnimation('news-settings-modal', triggerSource || null, '.dialog-content');
}

function normalizeNewsText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampNewsText(value, maxLength) {
  const text = normalizeNewsText(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const suffix = '...';
  const limit = Math.max(0, maxLength - suffix.length);
  if (!limit) return suffix;
  return `${text.slice(0, limit).trim()}${suffix}`;
}

function stripNewsHtml(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (!raw.includes('<')) return raw;
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return doc.body ? doc.body.textContent || '' : '';
  } catch (err) {
    return '';
  }
}

function extractNewsImageFromHtml(value) {
  const raw = String(value || '');
  if (!raw || !raw.includes('<')) return '';
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const img = doc.querySelector('img');
    return img ? img.getAttribute('src') || '' : '';
  } catch (err) {
    return '';
  }
}

function parseNewsTimestamp(entry) {
  if (!entry) return null;
  const candidates = [
    entry.querySelector('pubDate'),
    entry.querySelector('published'),
    entry.querySelector('updated'),
    entry.querySelector('dc\\:date')
  ];
  for (const node of candidates) {
    const value = node?.textContent?.trim();
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function parseNewsItemsFromXml(xmlText) {
  if (!xmlText) return [];
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  } catch (err) {
    return [];
  }
  if (!doc) return [];
  const items = Array.from(doc.querySelectorAll('item'));
  const entries = items.length ? items : Array.from(doc.querySelectorAll('entry'));
  return entries.map((entry) => {
    const title = entry.querySelector('title')?.textContent?.trim() || '';
    let link = '';
    const linkEl = entry.querySelector('link');
    if (linkEl) {
      link = linkEl.getAttribute('href') || linkEl.textContent || '';
    }
    if (!link) {
      const guidEl = entry.querySelector('guid');
      const guid = guidEl ? guidEl.textContent.trim() : '';
      if (/^https?:/i.test(guid)) link = guid;
    }
    const descriptionNode = entry.querySelector('description') || entry.querySelector('summary') || entry.querySelector('content');
    const rawDescription = descriptionNode?.textContent || '';
    const encodedHtml = entry.querySelector('content\\:encoded')?.textContent || '';
    let description = normalizeNewsText(stripNewsHtml(rawDescription));
    if (!description) {
      description = normalizeNewsText(stripNewsHtml(encodedHtml));
    }
    description = clampNewsText(description, NEWS_DESCRIPTION_LIMIT);

    let image = '';
    const thumbnailEl = entry.querySelector('media\\:thumbnail, thumbnail');
    if (thumbnailEl) {
      image = thumbnailEl.getAttribute('url') || '';
    }
    if (!image) {
      const mediaContentEl = entry.querySelector('media\\:content');
      const mediaUrl = mediaContentEl?.getAttribute('url') || '';
      const mediaType = mediaContentEl?.getAttribute('type') || '';
      const mediaMedium = mediaContentEl?.getAttribute('medium') || '';
      if (mediaUrl && (!mediaType || mediaType.startsWith('image/') || mediaMedium === 'image')) {
        image = mediaUrl;
      }
    }
    if (!image) {
      const enclosureEl = entry.querySelector('enclosure');
      const enclosureUrl = enclosureEl?.getAttribute('url') || '';
      const enclosureType = enclosureEl?.getAttribute('type') || '';
      if (enclosureUrl && (!enclosureType || enclosureType.startsWith('image/'))) {
        image = enclosureUrl;
      }
    }
    if (!image) {
      image = extractNewsImageFromHtml(encodedHtml || rawDescription);
    }

    const publishedAt = parseNewsTimestamp(entry);

    return { title, link, description, image, publishedAt };
  }).filter((item) => item.title && item.link);
}

function orderNewsItems(items, { minDatedRatio }) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!list.length) return list;
  let datedCount = 0;
  for (const item of list) {
    const parsed = Number(item && item.publishedAt);
    if (Number.isFinite(parsed)) {
      datedCount += 1;
    }
  }
  const ratio = list.length ? datedCount / list.length : 0;
  const minRatio = typeof minDatedRatio === 'number' ? minDatedRatio : 0;
  if (ratio < minRatio) return list;
  const indexed = list.map((item, index) => {
    const parsed = Number(item && item.publishedAt);
    return {
      item,
      index,
      publishedAt: Number.isFinite(parsed) ? parsed : -Infinity
    };
  });
  indexed.sort((a, b) => {
    if (b.publishedAt !== a.publishedAt) return b.publishedAt - a.publishedAt;
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.item);
}

function formatNewsUpdated(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatTimeAgo(timestampMs) {
  if (!timestampMs) return '';
  const parsed = Number(timestampMs);
  if (!Number.isFinite(parsed)) return '';
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function updateNewsUpdated(timestamp) {
  if (!newsUpdatedEl) return;
  setText(newsUpdatedEl, formatNewsUpdated(timestamp));
}

function renderNewsItems(items, options = {}) {
  if (!newsList) return;
  const list = Array.isArray(items) ? items.filter((item) => item && item.title && item.link) : [];
  if (list.length === 0) {
    const message = options.emptyMessage || NEWS_EMPTY_MESSAGE;
    const hint = options.emptyHint || NEWS_EMPTY_HINT;
    const hintMarkup = hint ? `<span class="news-empty-hint">${escapeHtml(hint)}</span>` : '';
    newsList.innerHTML = `<li class="news-empty">${escapeHtml(message)}${hintMarkup}</li>`;
    return;
  }
  newsList.innerHTML = list.map((item) => {
    const title = escapeHtml(item.title);
    const link = escapeHtml(item.link);
    const description = escapeHtml(item.description || '');
    const image = escapeHtml(item.image || '');
    const timeAgo = formatTimeAgo(item.publishedAt);
    const timeMarkup = timeAgo ? `<div class="news-meta"><span class="news-time">${escapeHtml(timeAgo)}</span></div>` : '';
    return `<li class="news-item" data-news-title="${title}" data-news-desc="${description}" data-news-image="${image}" data-news-link="${link}"><a class="news-title" href="${link}" target="_blank" rel="noreferrer noopener">${title}</a>${timeMarkup}</li>`;
  }).join('');
}

let newsHoverPreviewEl = null;

let newsHoverTarget = null;

function ensureNewsHoverPreview() {
  if (newsHoverPreviewEl) return newsHoverPreviewEl;
  if (!document || !document.body) return null;
  const preview = document.createElement('div');
  preview.id = 'news-hover-preview';
  preview.className = 'tooltip-popup tooltip-news-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = `
    <div class="news-preview-image-wrap">
      <img class="news-preview-image" alt="" />
    </div>
    <div class="news-preview-content">
      <div class="news-preview-title"></div>
      <div class="news-preview-desc"></div>
    </div>
  `;
  document.body.appendChild(preview);
  newsHoverPreviewEl = preview;
  return preview;
}

function positionNewsHoverPreview(targetEl, previewEl) {
  if (!targetEl || !previewEl) return;
  const rect = targetEl.getBoundingClientRect();
  const previewRect = previewEl.getBoundingClientRect();
  const padding = 12;
  const offset = 12;
  let left = rect.right + offset;
  if (left + previewRect.width + padding > window.innerWidth) {
    left = rect.left - previewRect.width - offset;
  }
  if (left < padding) left = padding;
  let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
  if (top + previewRect.height + padding > window.innerHeight) {
    top = window.innerHeight - previewRect.height - padding;
  }
  if (top < padding) top = padding;
  previewEl.style.left = `${Math.round(left)}px`;
  previewEl.style.top = `${Math.round(top)}px`;
}

function showNewsHoverPreview(itemEl) {
  const preview = ensureNewsHoverPreview();
  if (!preview || !itemEl) return;
  preview.classList.remove('is-visible');
  const title = itemEl.dataset.newsTitle || '';
  if (!title) return;
  const desc = itemEl.dataset.newsDesc || '';
  const image = itemEl.dataset.newsImage || '';
  const titleEl = preview.querySelector('.news-preview-title');
  const descEl = preview.querySelector('.news-preview-desc');
  const imageWrap = preview.querySelector('.news-preview-image-wrap');
  const imageEl = preview.querySelector('.news-preview-image');
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (imageEl && imageWrap) {
    if (image) {
      imageEl.src = image;
      imageWrap.style.display = '';
      preview.classList.remove('no-image');
    } else {
      imageEl.removeAttribute('src');
      imageWrap.style.display = 'none';
      preview.classList.add('no-image');
    }
  }
  if (desc) {
    preview.classList.remove('no-desc');
  } else {
    preview.classList.add('no-desc');
  }
  positionNewsHoverPreview(itemEl, preview);
  requestAnimationFrame(() => {
    if (newsHoverTarget !== itemEl) return;
    preview.classList.add('is-visible');
  });
}

function hideNewsHoverPreview() {
  if (newsHoverPreviewEl) {
    newsHoverPreviewEl.classList.remove('is-visible');
  }
  newsHoverTarget = null;
}

function setupNewsHoverPreview() {
  if (!newsList || newsList.dataset.previewReady === '1') return;
  newsList.dataset.previewReady = '1';

  newsList.addEventListener('mouseover', (event) => {
    const item = event.target.closest('.news-item');
    if (!item || !newsList.contains(item) || item === newsHoverTarget) return;
    newsHoverTarget = item;
    showNewsHoverPreview(item);
  });

  newsList.addEventListener('mouseout', (event) => {
    const item = event.target.closest('.news-item');
    if (!item || item !== newsHoverTarget) return;
    if (event.relatedTarget && item.contains(event.relatedTarget)) return;
    hideNewsHoverPreview();
  });

  newsList.addEventListener('mouseleave', hideNewsHoverPreview);
  window.addEventListener('resize', hideNewsHoverPreview);
  document.addEventListener('scroll', hideNewsHoverPreview, true);
}

function readFastNewsCache(sourceId) {
  try {
    if (!window.localStorage) return null;
    const raw = localStorage.getItem('fast-news');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.__timestamp || !Array.isArray(data.items)) return null;
    if (data.source && resolveNewsSourceId(data.source) !== resolveNewsSourceId(sourceId)) return null;
    if ((Date.now() - data.__timestamp) > NEWS_CACHE_TTL_MS) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function scheduleNewsIdleRefresh() {
  if (newsIdleRefreshQueued) return;
  newsIdleRefreshQueued = true;
  scheduleIdleTask(async () => {
    try {
      if (!newsWidget || !newsList || !appShowNewsPreference || !appShowSidebarPreference) return;
      if (newsWidget.classList.contains('force-hidden')) return;
      await fetchAndRenderNews({ force: true });
    } finally {
      newsIdleRefreshQueued = false;
    }
  }, 'news:idleRefresh');
}

async function fetchAndRenderNews(options = {}) {
  if (!newsWidget || !newsList) return;
  const forceFetch = options.force === true;
  const allowFetch = appShowNewsPreference || forceFetch;
  if (!allowFetch) return;

  const source = getNewsSourceById(appNewsSourcePreference);
  const cached = readFastNewsCache(source.id);
  const shouldRender = appShowNewsPreference === true;

  if (shouldRender && cached) {
    if (newsList.children.length === 0) {
      const orderedCached = orderNewsItems(cached.items, { minDatedRatio: 0.6 });
      const cachedItems = orderedCached.slice(0, NEWS_ITEMS_LIMIT);
      renderNewsItems(cachedItems);
      revealWidget('.widget-news');
    }
    updateNewsUpdated(cached.__timestamp);
  }

  if (cached && !forceFetch) {
    scheduleNewsIdleRefresh();
    return;
  }

  if (newsFetchAbortController && !forceFetch) return;

  if (newsFetchAbortController) {
    newsFetchAbortController.abort();
  }
  const abortController = new AbortController();
  newsFetchAbortController = abortController;

  try {
    const response = await fetch(source.url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`News feed unavailable: ${response.status}`);
    }
    const xmlText = await response.text();
    const items = parseNewsItemsFromXml(xmlText);
    if (!items.length) {
      console.warn('[News] 0 items parsed:', source.url || source.id);
      const hasCache = !!(cached && cached.items && cached.items.length);
      if (shouldRender && !hasCache) {
        renderNewsItems([]);
        revealWidget('.widget-news');
        updateNewsUpdated(Date.now());
      }
      return;
    }
    const orderedItems = orderNewsItems(items, { minDatedRatio: 0.6 });
    const renderItems = orderedItems.slice(0, NEWS_ITEMS_LIMIT);
    const fetchedAt = Date.now();
    if (shouldRender) {
      renderNewsItems(renderItems);
      revealWidget('.widget-news');
      updateNewsUpdated(fetchedAt);
    }
    try {
      if (window.localStorage) {
        const cachedHeadroomItems = orderedItems.slice(0, 20).map((item) => ({
          title: String((item && item.title) || ''),
          link: String((item && item.link) || ''),
          description: String((item && item.description) || ''),
          image: String((item && item.image) || ''),
          publishedAt: item && item.publishedAt != null ? item.publishedAt : ''
        }));
        localStorage.setItem('fast-news', JSON.stringify({
          __timestamp: fetchedAt,
          source: source.id,
          items: cachedHeadroomItems
        }));
      }
    } catch (err) {
      // Ignore; fast cache is best-effort only
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    const hasCache = !!(cached && cached.items && cached.items.length);
    if (shouldRender && !hasCache) {
      renderNewsItems([]);
      revealWidget('.widget-news');
      updateNewsUpdated(null);
    }
    if (!newsFetchWarningLogged) {
      console.warn('News fetch failed', err);
      newsFetchWarningLogged = true;
    }
  } finally {
    if (newsFetchAbortController === abortController) {
      newsFetchAbortController = null;
    }
  }
}

function observeNewsWidgetVisibility() {
  if (!newsWidget || !newsList) return;
  if (newsLazyLoadTriggered || newsVisibilityObserver) return;
  if (!appShowNewsPreference || !appShowSidebarPreference) return;
  if (newsWidget.classList.contains('force-hidden')) return;

  newsVisibilityObserver = new IntersectionObserver((entries) => {
    const isVisible = entries.some((entry) => entry.isIntersecting);
    if (!isVisible) return;
    newsLazyLoadTriggered = true;
    if (newsVisibilityObserver) {
      newsVisibilityObserver.disconnect();
      newsVisibilityObserver = null;
    }
    fetchAndRenderNews();
  }, { root: null, threshold: 0.1 });

  newsVisibilityObserver.observe(newsWidget);
}

function setupNewsWidget() {
  setupNewsHoverPreview();
  if (newsSettingsBtn) {
    newsSettingsBtn.addEventListener('click', () => {
      openNewsSettingsModal(newsSettingsBtn);
    });
  }

  if (newsRefreshBtn) {
    newsRefreshBtn.addEventListener('click', async () => {
      if (newsRefreshInFlight) return;
      newsRefreshInFlight = true;
      newsRefreshBtn.disabled = true;

      try {
        try {
          if (window.localStorage) {
            localStorage.removeItem('fast-news');
          }
        } catch (err) {
          // Ignore; fast cache is best-effort only
        }

        await fetchAndRenderNews({ force: true });
      } finally {
        newsRefreshInFlight = false;
        newsRefreshBtn.disabled = false;
      }
    });
  }

  if (newsSettingsCloseBtn) {
    newsSettingsCloseBtn.addEventListener('click', closeNewsSettingsModal);
  }

  if (newsSettingsCancelBtn) {
    newsSettingsCancelBtn.addEventListener('click', closeNewsSettingsModal);
  }

  if (newsSettingsModal) {
    newsSettingsModal.addEventListener('click', (e) => {
      if (e.target === newsSettingsModal) {
        closeNewsSettingsModal();
      }
    });
  }

  if (newsSettingsSaveBtn) {
    newsSettingsSaveBtn.addEventListener('click', async () => {
      const selected = resolveNewsSourceId(newsSourceSelect?.value);
      appNewsSourcePreference = selected;
      try {
        await browser.storage.local.set({ [APP_NEWS_SOURCE_KEY]: selected });
      } catch (err) {
        console.warn('Failed to save news source preference', err);
      }
      try {
        if (window.localStorage) {
          localStorage.removeItem('fast-news');
        }
      } catch (err) {
        // Ignore; fast cache is best-effort only
      }
      fetchAndRenderNews({ force: true });
      closeNewsSettingsModal();
    });
  }

  observeNewsWidgetVisibility();
}



// ===============================================
// --- WEATHER WIDGET & SETTINGS ---
// ===============================================
// =============================
// Weather widget (single impl)
// =============================

const weatherWidget = document.querySelector('.widget-weather');

const settingsBtn = document.getElementById('settings-btn');

const setLocationBtn = document.getElementById('set-location-btn');

const weatherSettingsModal = document.getElementById('weather-settings-modal');

const weatherSettingsCloseBtn = document.getElementById('weather-settings-close-btn');

const weatherSettingsCancelBtn = document.getElementById('weather-settings-cancel-btn');

const weatherSettingsSaveBtn = document.getElementById('weather-settings-save-btn');

const weatherTempUnitToggle = document.getElementById('modal-temp-unit-toggle');

const weatherLocationInput = document.getElementById('modal-location-input');

const weatherLocationResults = document.getElementById('modal-location-results');

const weatherUseCurrentBtn = document.getElementById('modal-set-location-auto-btn');

const weatherRefreshBtn = document.getElementById('weather-refresh-btn');

const weatherUpdatedEl = document.getElementById('weather-updated');

let selectedLocation = null;
let searchTimeout = null;
// Abort stale geocode lookups and ignore late responses
let geoAbortController = null;
let geoRequestId = 0;
let weatherRefreshInFlight = false;



function getWeatherEmoji(code) {

  // Use explicit Unicode escapes to avoid encoding issues

  if ([0, 1].includes(code)) return '\u2600'; // sun

  if ([2].includes(code)) return '\u26C5'; // sun behind cloud

  if ([3].includes(code)) return '\u2601'; // cloud

  if ([45, 48].includes(code)) return '\uD83C\uDF2B'; // fog

  if ([51, 53, 55, 56, 57].includes(code)) return '\uD83C\uDF26'; // light rain

  if ([61, 63, 65, 66, 67].includes(code)) return '\uD83C\uDF27'; // rain

  if ([71, 73, 75, 77].includes(code)) return '\uD83C\uDF28'; // snow

  if ([80, 81, 82].includes(code)) return '\uD83C\uDF26'; // showers

  if ([85, 86].includes(code)) return '\uD83C\uDF28'; // snow showers

  if ([95, 96, 99].includes(code)) return '\u26C8'; // thunderstorm

  return '\u2753'; // unknown

}

function getWeatherDescription(code) {

  if ([0].includes(code)) return 'Clear sky';

  if ([1].includes(code)) return 'Mainly clear';

  if ([2].includes(code)) return 'Partly cloudy';

  if ([3].includes(code)) return 'Overcast';

  if ([45, 48].includes(code)) return 'Fog';

  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';

  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';

  if ([71, 73, 75, 77].includes(code)) return 'Snow';

  if ([80, 81, 82].includes(code)) return 'Rain showers';

  if ([85, 86].includes(code)) return 'Snow showers';

  if ([95, 96, 99].includes(code)) return 'Thunderstorm';

  return 'Unknown';

}



function formatWeatherUpdated(timestamp) {

  if (!timestamp) return '';

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return '';

  return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

}


async function loadCachedWeather() {

  try {

    const data = await browser.storage.local.get(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);

    if (data.cachedWeatherData && data.cachedCityName) {

      const cachedTs = data.weatherFetchedAt ?? data.cachedWeatherData.__timestamp ?? Date.now();

      updateWeatherUI(data.cachedWeatherData, data.cachedCityName, data.cachedUnits || 'celsius', cachedTs);

    }

  } catch (error) {

    console.warn('Could not load cached weather:', error);

  }

}



function updateWeatherUI(data, cityName, units, fetchedAt = Date.now()) {

  const iconEl = document.getElementById('weather-icon');

  const tempEl = document.getElementById('weather-temp');

  const cityEl = document.getElementById('weather-city');

  const descEl = document.getElementById('weather-desc');

  const pressureEl = document.getElementById('weather-pressure');

  const humidityEl = document.getElementById('weather-humidity');

  const cloudcoverEl = document.getElementById('weather-cloudcover');

  const precipProbEl = document.getElementById('weather-precip-prob');

  const sunriseEl = document.getElementById('weather-sunrise');

  const sunsetEl = document.getElementById('weather-sunset');

  const updatedEl = weatherUpdatedEl || document.getElementById('weather-updated');

  if (!data) {

    showWeatherError(new Error('Weather data missing'));

    return;

  }

  const weather = data.current_weather || {};

  const hourly = data.hourly || {};

  const daily = data.daily || {};

  const tempValue = Number.isFinite(weather.temperature) ? Math.round(weather.temperature) : '--';

  const code = weather.weathercode;

  const pressure = (Array.isArray(hourly.surface_pressure) && Number.isFinite(hourly.surface_pressure[0]))
    ? Math.round(hourly.surface_pressure[0] * 0.75006)
    : '--';

  const humidity = (Array.isArray(hourly.relative_humidity_2m) && Number.isFinite(hourly.relative_humidity_2m[0]))
    ? hourly.relative_humidity_2m[0]
    : '--';

  const cloudcover = (Array.isArray(hourly.cloudcover) && Number.isFinite(hourly.cloudcover[0]))
    ? hourly.cloudcover[0]
    : '--';

  const precipProb = (Array.isArray(hourly.precipitation_probability) && Number.isFinite(hourly.precipitation_probability[0]))
    ? hourly.precipitation_probability[0]
    : '--';

  let sunrise = '--', sunset = '--';

  if (Array.isArray(daily.sunrise) && daily.sunrise[0] && Array.isArray(daily.sunset) && daily.sunset[0]) {

    const sunriseDate = new Date(daily.sunrise[0]);

    const sunsetDate = new Date(daily.sunset[0]);

    const timeOptions = { hour: 'numeric', minute: '2-digit' };

    sunrise = sunriseDate.toLocaleTimeString('en-US', timeOptions);

    sunset = sunsetDate.toLocaleTimeString('en-US', timeOptions);

  }

  const effectiveTimestamp = typeof fetchedAt === 'number' ? fetchedAt : Date.now();

  const unitLabel = units === 'fahrenheit' ? 'F' : 'C';

  const tempLabel = `${tempValue === '--' ? '--' : tempValue}\u00b0${unitLabel}`;

  const description = getWeatherDescription(code);

  const icon = getWeatherEmoji(code);

  const updatedLabel = formatWeatherUpdated(effectiveTimestamp);

  setText(cityEl, cityName);

  setText(tempEl, tempLabel);

  setText(descEl, description);

  setText(pressureEl, `Pressure: ${pressure}${pressure !== '--' ? ' mmHg' : ''}`);

  setText(humidityEl, `Humidity: ${humidity}${humidity !== '--' ? '%' : ''}`);

  setText(cloudcoverEl, `Cloudcover: ${cloudcover}${cloudcover !== '--' ? '%' : ''}`);

  setText(precipProbEl, `Rain Chance: ${precipProb}${precipProb !== '--' ? '%' : ''}`);

  setText(sunriseEl, `Sunrise: ${sunrise}`);

  setText(sunsetEl, `Sunset: ${sunset}`);

  if (updatedEl) setText(updatedEl, updatedLabel);

  setText(iconEl, icon);

  setAttr(iconEl, 'data-weather-code', code ?? '');

  if (iconEl && iconEl.style.fontSize !== '3.5em') iconEl.style.fontSize = '3.5em';

  if (iconEl && iconEl.style.lineHeight !== '1') iconEl.style.lineHeight = '1';

  if (setLocationBtn) setLocationBtn.classList.add('hidden');

  browser.storage.local.set({

    cachedWeatherData: data,

    cachedCityName: cityName,

    cachedUnits: units,

    weatherFetchedAt: effectiveTimestamp

  });



  revealWidget('.widget-weather');

  // Mirror simplified weather info to localStorage for instant paint on next load
  try {
    const fastWeather = {
      city: cityName,
      temp: tempLabel,
      desc: description,
      icon,
      // --- NEW: Cache detailed stats for instant load ---
      pressure: `Pressure: ${pressure}${pressure !== '--' ? ' mmHg' : ''}`,
      humidity: `Humidity: ${humidity}${humidity !== '--' ? '%' : ''}`,
      cloudcover: `Cloudcover: ${cloudcover}${cloudcover !== '--' ? '%' : ''}`,
      precipProb: `Rain Chance: ${precipProb}${precipProb !== '--' ? '%' : ''}`,
      sunrise: `Sunrise: ${sunrise}`,
      sunset: `Sunset: ${sunset}`,
      updated: updatedLabel,
      __timestamp: effectiveTimestamp
    };
    localStorage.setItem('fast-weather', JSON.stringify(fastWeather));
  } catch (e) {
    // If localStorage is unavailable, fail silently; the async path still works.
  }

}



function setText(el, value) {
  if (!el) return;
  const v = String(value ?? '');
  if (el.textContent !== v) el.textContent = v;
}

function showWeatherError(error) {
  if (error) console.error('Weather Error:', error);

  setText(document.getElementById('weather-city'), 'Weather Error');
  setText(document.getElementById('weather-temp'), '--°');
  setText(document.getElementById('weather-desc'), 'Could not load data');
  setText(document.getElementById('weather-icon'), '-');

  const updatedEl = document.getElementById('weather-updated');
  if (updatedEl) setText(updatedEl, '');

  if (typeof setLocationBtn !== 'undefined' && setLocationBtn) {
    setLocationBtn.classList.remove('hidden');
  }

  revealWidget('.widget-weather');
  browser.storage.local.remove(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);
}




async function fetchWeather(lat, lon, units, cityName) {

  try {

    const hourlyParams = 'relative_humidity_2m,surface_pressure,cloudcover,precipitation_probability';

    const dailyParams = 'sunrise,sunset';

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true&temperature_unit=${units}` +
      `&hourly=${hourlyParams}&daily=${dailyParams}` +
      `&forecast_days=1&timezone=auto`;

    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) throw new Error('Weather data not available');

    const weatherData = await weatherResponse.json();

    updateWeatherUI(weatherData, cityName, units, Date.now());

  } catch (error) {

    showWeatherError(error);

  }

}

// Sanity: There must be only ONE of each:
// fetchWeather / showWeatherError / updateWeatherUI / setText / setAttr / formatWeatherUpdated

function showCustomAlert(message) {

  showCustomDialog('Notice', message);

}



function showCustomDialog(title, message) {
  const modal = document.getElementById('custom-alert-modal');
  const titleEl = document.getElementById('custom-alert-title');
  const msgEl = document.getElementById('custom-alert-message');
  const btn = document.getElementById('custom-alert-ok-btn');

  if (!modal || !btn) return;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerText = message; // Use innerText to handle \n newlines

  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const handleClose = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
      document.body.classList.remove('modal-open');
    }
  };

  btn.onclick = handleClose;
  modal.onclick = (event) => {
    if (event.target === modal) handleClose();
  };
}

function buildDeleteDialogIconPreview(sourceTileEl) {
  if (!sourceTileEl || !sourceTileEl.isConnected) return null;

  const iconWrapper = sourceTileEl.querySelector('.bookmark-icon-wrapper');
  if (!iconWrapper) return null;

  const clone = iconWrapper.cloneNode(true);
  if (sourceTileEl.dataset.isFolder === 'true') {
    clone.classList.add('folder-preview');
  }
  const computed = window.getComputedStyle(iconWrapper);
  const cssVarsToCopy = [
    '--bookmark-folder-color',
    '--bookmark-fallback-color',
    '--bookmark-fallback-text-color'
  ];

  cssVarsToCopy.forEach((varName) => {
    const value = computed.getPropertyValue(varName);
    if (value) {
      clone.style.setProperty(varName, value.trim());
    }
  });

  return clone;
}

function buildIconPreviewFromNode(node) {
  if (!node || node.isBackButton) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'bookmark-icon-wrapper';
  if (node.children) {
    wrapper.classList.add('folder-preview');
  }

  const nextKey = getIconKeyForNode(node);
  if (node.children) {
    renderFolderIconInto(wrapper, node, nextKey);
  } else {
    renderBookmarkIconInto(wrapper, node, nextKey);
  }

  return wrapper;
}


// message is optional; options can contain { title, faviconUrl, isFolder }

function showDeleteConfirm(message, options = {}) {

  return new Promise((resolve) => {

    const modal = document.getElementById('confirm-delete-modal');

    const iconSpan = document.getElementById('confirm-delete-icon');

    const textSpan = document.getElementById('confirm-delete-text');

    const cancelBtn = document.getElementById('confirm-delete-cancel-btn');

    const okBtn = document.getElementById('confirm-delete-ok-btn');

    const closeBtn = document.getElementById('confirm-delete-close-btn');



    const {
      title = '',
      faviconUrl = null,
      isFolder = false,
      node = null,
      sourceTileEl = null
    } = options;



    // ---------- TEXT ----------

    let finalText;

    if (isFolder && title) {

      // FOLDER TEXT

      finalText = `Are you sure you want to remove "${title}" and all its contents?`;

    } else if (title) {

      // ICON / BOOKMARK TEXT

      finalText = `Are you sure you want to remove "${title}"?`;

    } else if (message) {

      finalText = message;

    } else {

      finalText = 'Delete this item?';

    }

    textSpan.textContent = finalText;



    // ---------- ICON ----------

    iconSpan.innerHTML = '';



    const previewIcon =
      buildDeleteDialogIconPreview(sourceTileEl) ||
      buildIconPreviewFromNode(node);

    if (previewIcon) {
      iconSpan.appendChild(previewIcon);
    } else if (isFolder) {
      iconSpan.innerHTML = `
        <div class="bookmark-icon-wrapper">
          ${useSvgIcon('bookmarkFolderLarge')}
        </div>
      `;
    } else if (faviconUrl) {
      const img = document.createElement('img');
      img.src = faviconUrl;
      img.alt = '';
      iconSpan.appendChild(img);
    } else if (title) {
      const fallback = document.createElement('div');
      fallback.className = 'bookmark-fallback-icon';
      fallback.textContent = title.charAt(0).toUpperCase();
      iconSpan.appendChild(fallback);
    }



    // ---------- SHOW + HANDLERS ----------

    openModalWithAnimation('confirm-delete-modal', null, '.dialog-content');

    let resolved = false;

    const cleanup = (result) => {

      cancelBtn.removeEventListener('click', onCancel);

      okBtn.removeEventListener('click', onOk);

      if (closeBtn) closeBtn.removeEventListener('click', onCancel);

      resolve(result);

    };



    const closeWithResult = (result) => {

      if (resolved) return;

      resolved = true;

      closeModalWithAnimation('confirm-delete-modal', '.dialog-content', () => cleanup(result));

    };



    const onCancel = () => {

      closeWithResult(false);

    };



    const onOk = () => {

      closeWithResult(true);

    };



    cancelBtn.addEventListener('click', onCancel);

    okBtn.addEventListener('click', onOk);

    if (closeBtn) closeBtn.addEventListener('click', onCancel);

  });

}





function startGeolocation() {

  if (!('geolocation' in navigator)) {

    showWeatherError(new Error('Geolocation not supported'));

    return Promise.resolve();

  }

  return new Promise((resolve) => {

    navigator.geolocation.getCurrentPosition(

      async (position) => {

        try {

          const lat = position.coords.latitude, lon = position.coords.longitude;

          await browser.storage.local.set({

            weatherLat: lat,

            weatherLon: lon,

            weatherCityName: 'Current Location'

          });

          const data = await browser.storage.local.get('weatherUnits');

          await fetchWeather(lat, lon, data.weatherUnits || 'celsius', 'Current Location');

        } catch (err) {

          showWeatherError(err);

        } finally {

          resolve();

        }

      },

      (err) => {

        showWeatherError(err);

        resolve();

      }

    );

  });

}



async function searchForLocation(searchTerm) {

  if (!weatherLocationInput || !weatherLocationResults) return;

  const query = (typeof searchTerm === 'string' ? searchTerm : weatherLocationInput.value || '').trim();

  const requestId = ++geoRequestId;

  if (geoAbortController) {

    geoAbortController.abort();

    geoAbortController = null;

  }

  if (query.length < 3) {

    weatherLocationResults.innerHTML = '';

    weatherLocationResults.classList.add('hidden');

    return;

  }

  geoAbortController = new AbortController();

  const { signal } = geoAbortController;

  try {

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;

    const geoResponse = await fetch(geoUrl, { signal });

    const geoData = await geoResponse.json();

    if (requestId !== geoRequestId) return;

    weatherLocationResults.innerHTML = '';

    if (geoData.results && geoData.results.length > 0) {

      geoData.results.forEach(result => {

        const item = document.createElement('div');

        item.className = 'location-result-item';

        item.innerHTML = `${result.name}, <span>${result.admin1 || ''} ${result.country}</span>`;

        item.addEventListener('click', () => {

          selectedLocation = result;

          weatherLocationInput.value = `${result.name}, ${result.country}`;

          weatherLocationResults.classList.add('hidden');

          weatherLocationResults.innerHTML = '';

        });

        weatherLocationResults.appendChild(item);

      });

      weatherLocationResults.classList.remove('hidden');

    } else {

      weatherLocationResults.classList.add('hidden');

    }

  } catch (error) {

    if (error?.name === 'AbortError') return; // Expected when a newer request wins

    console.error('Location search error:', error);

  } finally {

    if (requestId === geoRequestId && geoAbortController?.signal === signal) {

      geoAbortController = null;

    }

  }

}


function closeWeatherSettingsModal() {
  closeModalWithAnimation('weather-settings-modal', '.dialog-content');
}

async function openWeatherSettingsModal(triggerSource) {
  if (!weatherSettingsModal) return;
  const data = await browser.storage.local.get(['weatherCityName', 'weatherUnits']);
  if (weatherTempUnitToggle) {
    weatherTempUnitToggle.checked = data.weatherUnits === 'fahrenheit';
  }
  if (weatherLocationInput) {
    weatherLocationInput.value = (data.weatherCityName === 'Current Location') ? '' : (data.weatherCityName || '');
  }
  selectedLocation = null;
  if (weatherLocationResults) {
    weatherLocationResults.classList.add('hidden');
    weatherLocationResults.innerHTML = '';
  }
  openModalWithAnimation('weather-settings-modal', triggerSource || null, '.dialog-content');
}
async function setupWeather() {

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openWeatherSettingsModal(settingsBtn);
    });
  }

  if (setLocationBtn) {
    setLocationBtn.addEventListener('click', async () => {
      await browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName']);
      startGeolocation();
    });
  }

  if (weatherUseCurrentBtn) {
    weatherUseCurrentBtn.addEventListener('click', async () => {
      await browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName']);
      startGeolocation();
      closeWeatherSettingsModal();
    });
  }

  if (weatherRefreshBtn) {
    weatherRefreshBtn.addEventListener('click', async () => {
      if (weatherRefreshInFlight) return;
      weatherRefreshInFlight = true;
      weatherRefreshBtn.disabled = true;

      try {
        const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherUnits', 'weatherCityName']);
        const units = data.weatherUnits || 'celsius';

        if (data.weatherLat && data.weatherLon) {
          await fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName || 'Current Location');
        } else {
          await startGeolocation();
        }
      } finally {
        weatherRefreshInFlight = false;
        weatherRefreshBtn.disabled = false;
      }
    });
  }

  if (weatherLocationInput) {
    weatherLocationInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const value = weatherLocationInput.value;
      searchTimeout = setTimeout(() => searchForLocation(value), 300);
    });
  }

  if (weatherSettingsCloseBtn) {
    weatherSettingsCloseBtn.addEventListener('click', closeWeatherSettingsModal);
  }

  if (weatherSettingsCancelBtn) {
    weatherSettingsCancelBtn.addEventListener('click', closeWeatherSettingsModal);
  }

  if (weatherSettingsModal) {
    weatherSettingsModal.addEventListener('click', (e) => {
      if (e.target === weatherSettingsModal) {
        closeWeatherSettingsModal();
      }
    });
  }

  if (weatherSettingsSaveBtn) {
    weatherSettingsSaveBtn.addEventListener('click', async () => {
      const newUnit = weatherTempUnitToggle?.checked ? 'fahrenheit' : 'celsius';
      const existingLocation = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName']);
      const settingsToSave = { weatherUnits: newUnit };

      if (selectedLocation) {
        settingsToSave.weatherLat = selectedLocation.latitude;
        settingsToSave.weatherLon = selectedLocation.longitude;
        settingsToSave.weatherCityName = selectedLocation.name;
      } else if (existingLocation.weatherLat && existingLocation.weatherLon && existingLocation.weatherCityName) {
        settingsToSave.weatherLat = existingLocation.weatherLat;
        settingsToSave.weatherLon = existingLocation.weatherLon;
        settingsToSave.weatherCityName = existingLocation.weatherCityName;
      }

      await browser.storage.local.set(settingsToSave);

      const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
      if (data.weatherLat) {
        fetchWeather(data.weatherLat, data.weatherLon, data.weatherUnits, data.weatherCityName);
      } else {
        startGeolocation();
      }

      closeWeatherSettingsModal();
    });
  }



  const data = await browser.storage.local.get([
    'weatherLat',
    'weatherLon',
    'weatherCityName',
    'weatherUnits',
    'weatherFetchedAt'
  ]);

  const units = data.weatherUnits || 'celsius';
  const now = Date.now();
  const lastFetch = data.weatherFetchedAt || 0;
  const WEATHER_TTL = 30 * 60 * 1000; // 30 Minutes

  if (data.weatherLat && data.weatherLon) {
    // Only fetch if data is older than 30 mins
    if (now - lastFetch > WEATHER_TTL) {
      console.log('Weather cache expired. Fetching new data...');
      fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName);
    } else {
      console.log('Using cached weather data.');
    }
  } else {
    startGeolocation();
  }

}



// ===============================================

// --- BACKGROUND VIDEO CROSSFADE ---

// ===============================================

function setupBackgroundVideoCrossfade() {
  if (isPerformanceModeEnabled()) {
    cleanupBackgroundPlayback();
    return;
  }
  const videos = Array.from(document.querySelectorAll('.background-video'));
  if (videos.length < 2) return;

  if (!videoPlaybackController) videoPlaybackController = new AbortController();
  const signal = videoPlaybackController.signal;

  videos.forEach((v, idx) => {
    v.loop = false;
    v.muted = true;
    v.playsInline = true;
    v.preload = idx === 0 ? 'auto' : 'metadata';
    v.classList.remove('with-transition');
    v.classList.remove('on-top');
  });

  const fadeMs = 1400;
  const bufferMs = 400;
  const safeDurationMs = 15000;
  const fadeSec = fadeMs / 1000;
  const bufferSec = bufferMs / 1000;

  const playAndFadeIn = async (videoEl, enableTransition, onReady) => {
    if (isPerformanceModeEnabled()) return;
    try {
      if (enableTransition) {
        videoEl.classList.add('with-transition');
        void videoEl.offsetWidth;
      } else {
        videoEl.classList.remove('with-transition');
      }

      await videoEl.play();

      const showVideo = () => {
        videoEl.classList.add('is-active');
        if (onReady) onReady();
      };

      if ('requestVideoFrameCallback' in videoEl) {
        videoEl.requestVideoFrameCallback(() => {
          requestAnimationFrame(() => {
            showVideo();
          });
        });
      } else {
        const checkFrame = () => {
          if (videoEl.currentTime > 0) {
            videoEl.removeEventListener('timeupdate', checkFrame);
            requestAnimationFrame(() => showVideo());
          }
        };
        if (videoEl.currentTime > 0) {
          checkFrame();
        } else {
          videoEl.addEventListener('timeupdate', checkFrame, { signal });
        }
      }
    } catch (err) {
      console.warn('Background playback failed:', err);
    }
  };

  const startCycle = (current, next) => {
    if (isPerformanceModeEnabled()) return;
    let fading = false;

    const primeNext = () => {
      if (next.preload !== 'auto') {
        next.preload = 'auto';
        next.load();
      }
    };

    const doFade = async () => {
      if (isPerformanceModeEnabled()) return;
      if (fading) return;
      fading = true;
      primeNext();
      next.currentTime = 0;

      next.classList.add('on-top');
      current.classList.remove('on-top');

      let shouldAnimate = true;
      if (appPerformanceModePreference) {
        shouldAnimate = false;
      } else if (appBatteryOptimizationPreference) {
        if ('getBattery' in navigator) {
          try {
            const battery = await navigator.getBattery();
            if (!battery.charging) shouldAnimate = false;
          } catch (e) {}
        }
      }

      playAndFadeIn(next, shouldAnimate, () => {
        const holdTime = shouldAnimate ? fadeMs + 50 : 50;
        if (backgroundCrossfadeTimeout) clearTimeout(backgroundCrossfadeTimeout);
        backgroundCrossfadeTimeout = setTimeout(() => {
          backgroundCrossfadeTimeout = null;
          current.classList.remove('is-active');
          current.classList.remove('with-transition');
          current.pause();
          current.currentTime = 0;
          startCycle(next, current);
        }, holdTime);
      });
    };

    const onTimeUpdate = () => {
      const duration = current.duration || safeDurationMs / 1000;
      const startFadeAt = Math.max(1, duration - fadeSec - bufferSec);
      if (current.currentTime >= startFadeAt) {
        current.removeEventListener('timeupdate', onTimeUpdate);
        doFade();
      }
    };

    current.addEventListener('timeupdate', onTimeUpdate, { signal });

    current.addEventListener('ended', () => {
      current.removeEventListener('timeupdate', onTimeUpdate);
      doFade();
    }, { once: true, signal });
  };

  const [first, second] = videos;
  first.classList.add('on-top');

  if (first.readyState >= 1) {
    playAndFadeIn(first, false, () => startCycle(first, second));
  } else {
    first.addEventListener('loadedmetadata', () => {
      playAndFadeIn(first, false, () => startCycle(first, second));
    }, { once: true, signal });
  }
}



// ===============================================
// --- CINEMA MODE LOGIC ---
// ===============================================
let cinemaTimeout;
let cinemaMoveListener;
let cinemaKeyListener;
let cinemaClickListener;
let cinemaListenersAttached = false;

function resetCinemaMode() {
  document.body.classList.remove('cinema-mode');
  if (cinemaTimeout) clearTimeout(cinemaTimeout);

  if (isPerformanceModeEnabled()) return;
  if (!appCinemaModePreference) return;

  cinemaTimeout = setTimeout(() => {
    if (isPerformanceModeEnabled()) return;
    if (!appCinemaModePreference) return;
    if (document.body.classList.contains('modal-open')) return;

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    document.body.classList.add('cinema-mode');
  }, 8000);
}

function throttle(fn, limit) {
  let inThrottle = false;
  return function throttled(...args) {
    if (inThrottle) return;
    fn.apply(this, args);
    inThrottle = true;
    setTimeout(() => { inThrottle = false; }, limit);
  };
}

function detachCinemaModeListeners() {
  if (cinemaMoveListener) {
    window.removeEventListener('mousemove', cinemaMoveListener);
    cinemaMoveListener = null;
  }
  if (cinemaKeyListener) {
    window.removeEventListener('keydown', cinemaKeyListener);
    cinemaKeyListener = null;
  }
  if (cinemaClickListener) {
    window.removeEventListener('click', cinemaClickListener);
    cinemaClickListener = null;
  }
  cinemaListenersAttached = false;
}

function setupCinemaModeListeners() {
  if (isPerformanceModeEnabled() || !appCinemaModePreference) {
    detachCinemaModeListeners();
    resetCinemaMode();
    return;
  }

  if (cinemaListenersAttached) return;

  const throttledReset = throttle(resetCinemaMode, 200);
  cinemaMoveListener = throttledReset;
  cinemaKeyListener = resetCinemaMode;
  cinemaClickListener = resetCinemaMode;

  window.addEventListener('mousemove', cinemaMoveListener);
  window.addEventListener('keydown', cinemaKeyListener);
  window.addEventListener('click', cinemaClickListener);
  cinemaListenersAttached = true;
  resetCinemaMode();
}



// ===============================================

// --- DOCK NAVIGATION ---

// ===============================================

async function initAddonStoreDockLink() {
  if (!addonStoreBtn || !addonStoreTooltip) return;

  const userAgent = navigator.userAgent || '';

  if (await isFirefoxBrowser()) {
    addonStoreBtn.href = 'https://addons.mozilla.org/';
    addonStoreTooltip.textContent = 'Firefox Add-ons';
    return;
  }

  if (userAgent.includes('Edg/')) {
    addonStoreBtn.href = 'https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home';
    addonStoreTooltip.textContent = 'Edge Add-ons';
    if (addonStoreIcon) {
      addonStoreIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20.978 11.372a9 9 0 1 0-1.593 5.773"/>
  <path d="M20.978 11.372c.21 2.993-5.034 2.413-6.913 1.486c1.392-1.6.402-4.038-2.274-3.851c-1.745.122-2.927 1.157-2.784 3.202c.28 3.99 4.444 6.205 10.36 4.79"/>
  <path d="M3.022 12.628c-.283-4.043 8.717-7.228 11.248-2.688"/>
  <path d="M12.628 20.978c-2.993.21-5.162-4.725-3.567-9.748"/>
</svg>`;
    }
    return;
  }

  addonStoreBtn.href = 'https://chromewebstore.google.com/category/extensions';
  addonStoreTooltip.textContent = 'Chrome Web Store';
  if (addonStoreIcon) {
    addonStoreIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0"/>
  <path d="M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/>
  <path d="M12 9h8.4"/>
  <path d="M14.598 13.5l-4.2 7.275"/>
  <path d="M9.402 13.5l-4.2-7.275"/>
</svg>`;
  }
}

function setupLazySettingsButton() {
  if (!mainSettingsBtn) return;
  if (mainSettingsBtn.dataset.settingsHandlerAttached === 'true') return;

  mainSettingsBtn.dataset.settingsHandlerAttached = 'true';

  mainSettingsBtn.addEventListener('click', async () => {
    try {
      await loadScriptOnce('settings-ui.js');
      if (window.SettingsUI && typeof window.SettingsUI.open === 'function') {
        await window.SettingsUI.open({ triggerSource: 'main-settings-btn' });
      }
    } catch (err) {
      console.warn('Failed to open settings UI', err);
    }
  });
}

function setupDockNavigation() {

  const firefoxBrowserPromise = isFirefoxBrowser();

  // Helper function to open the right destination per browser

  const openTab = async (featureKey, url, e) => {

    if (e) e.preventDefault();

    if (await firefoxBrowserPromise) {

      showFirefoxShortcutInfo(featureKey);

      return;

    }

    if (typeof browser !== 'undefined' && browser && browser.tabs && browser.tabs.update) {

      browser.tabs.update({ url });

      return;

    }

    window.location.href = url;

  };

  const handleDockClick = (id, url, featureKey) => {

    const btn = document.getElementById(id);

    if (!btn) return;

    btn.onclick = async (e) => {

      await openTab(featureKey, url, e);

    };

  };



  handleDockClick('dock-bookmarks-btn', 'chrome://bookmarks', 'bookmarks');



  handleDockClick('dock-history-btn', 'chrome://history', 'history');



  handleDockClick('dock-downloads-btn', 'chrome://downloads', 'downloads');



  handleDockClick('dock-addons-btn', 'chrome://extensions', 'addons');



  if (nextWallpaperBtn) {

    nextWallpaperBtn.addEventListener('click', async () => {

      if (nextWallpaperBtn.disabled) return;

      setNextWallpaperButtonLoading(true);

      try {

        await ensureDailyWallpaper(true);

        const selection = currentWallpaperSelection;

        const type = await getWallpaperTypePreference();

        await waitForWallpaperReady(selection, type);

      } catch (err) {

        console.warn('Failed to load next wallpaper', err);

      } finally {

        setNextWallpaperButtonLoading(false);

      }

    });

  }



  if (dockGalleryBtn) {

    dockGalleryBtn.addEventListener('click', async () => {
      try {
        await loadScriptOnce('gallery-ui.js');
        if (window.GalleryUI && typeof window.GalleryUI.open === 'function') {
          await window.GalleryUI.open({ triggerSource: 'dock-gallery-btn' });
        }
      } catch (err) {
        console.warn('Failed to open gallery UI', err);
      }
    });

  }

}



// ===============================================

// --- MATERIAL COLOR PICKER LOGIC ---

// ===============================================



// 1. Standard Colors (Top Section)

const PALETTE_TOP = [

  { name: 'red', colors: ['#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c', '#ff8a80', '#ff5252', '#ff1744', '#d50000'] },

  { name: 'pink', colors: ['#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f', '#ff80ab', '#ff4081', '#f50057', '#c51162'] },

  { name: 'purple', colors: ['#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c', '#ea80fc', '#e040fb', '#d500f9', '#aa00ff'] },

  { name: 'deepPurple', colors: ['#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92', '#b388ff', '#7c4dff', '#651fff', '#6200ea'] },

  { name: 'indigo', colors: ['#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e', '#8c9eff', '#536dfe', '#3d5afe', '#304ffe'] },

  { name: 'blue', colors: ['#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1', '#82b1ff', '#448aff', '#2979ff', '#2962ff'] },

  { name: 'lightBlue', colors: ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b', '#80d8ff', '#40c4ff', '#00b0ff', '#0091ea'] },

  { name: 'cyan', colors: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064', '#84ffff', '#18ffff', '#00e5ff', '#00b8d4'] },

  { name: 'teal', colors: ['#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40', '#a7ffeb', '#64ffda', '#1de9b6', '#00bfa5'] },

  { name: 'green', colors: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20', '#b9f6ca', '#69f0ae', '#00e676', '#00c853'] },

  { name: 'lightGreen', colors: ['#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e', '#ccff90', '#b2ff59', '#76ff03', '#64dd17'] },

  { name: 'lime', colors: ['#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717', '#f4ff81', '#eeff41', '#c6ff00', '#aeea00'] },

  { name: 'yellow', colors: ['#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17', '#ffff8d', '#ffff00', '#ffea00', '#ffd600'] },

  { name: 'amber', colors: ['#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00', '#ffe57f', '#ffd740', '#ffc400', '#ffab00'] },

  { name: 'orange', colors: ['#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100', '#ffd180', '#ffab40', '#ff9100', '#ff6d00'] },

  { name: 'deepOrange', colors: ['#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c', '#ff9e80', '#ff6e40', '#ff3d00', '#dd2c00'] }

];



// 2. Bottom Section Rows (Left Side)

const PALETTE_BOTTOM = [

  { name: 'grey', colors: ['#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#212121'] },

  { name: 'blueGrey', colors: ['#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c', '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'] },

  { name: 'brown', colors: ['#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723'] }

];



let materialPickerCallback = null;

let materialPreviewCallback = null; // Hover preview

let materialRevertCallback = null;  // Revert on leave/cancel



function setupMaterialColorPicker() {

  const modal = document.getElementById('material-picker-modal');

  const grid = document.getElementById('material-color-grid');

  const closeBtn = document.getElementById('material-picker-close');

  

  // Triggers

  const fallbackTriggerBtn = document.getElementById('app-bookmark-fallback-color-trigger');

  const folderTriggerBtn = document.getElementById('app-bookmark-folder-color-trigger');

  const textBgTriggerBtn = document.getElementById('app-bookmark-text-bg-color-trigger');



  if (!modal || !grid) return;



  // --- 1. Optimization: Build HTML first, attach 1 listener later ---

  grid.innerHTML = '';



  // Helper to create a row (No event listeners here anymore)

  function createRow(group) {

    const row = document.createElement('div');

    row.className = 'material-color-row';



    const label = document.createElement('div');

    label.className = 'material-color-label';

    label.textContent = group.name;



    const baseColor = group.colors[Math.min(5, group.colors.length - 1)];

    label.style.backgroundColor = baseColor;

    label.style.color = '#ffffff';

    label.title = `Select ${group.name} (${baseColor})`;

    

    // Store data for delegation

    label.dataset.color = baseColor;

    label.dataset.isClickable = 'true'; 

    

    row.appendChild(label);



    group.colors.forEach(color => {

      const swatch = document.createElement('div');

      swatch.className = 'material-color-swatch';

      swatch.style.backgroundColor = color;

      

      // Store data for delegation

      swatch.dataset.color = color.toLowerCase();

      swatch.dataset.isClickable = 'true';

      

      row.appendChild(swatch);

    });

    return row;

  }



  function pickColor(color) {

    // A confirmed pick means hover/revert callbacks are no longer needed

    materialPreviewCallback = null;

    materialRevertCallback = null;



    if (materialPickerCallback) materialPickerCallback(color);

    closeMaterialPicker();

  }



  // --- 2. Optimization: Efficient Highlighting ---

  function highlightSelectedColor(hexColor) {

    if (!hexColor) return;

    const target = hexColor.toLowerCase();



    // A. Efficiently remove old selection (don't loop through everything)

    const oldSelected = grid.querySelector('.selected');

    if (oldSelected) {

      oldSelected.classList.remove('selected');

    }



    // B. Find new target

    const match = grid.querySelector(`[data-color="${target}"]`);

    if (match) {

      match.classList.add('selected');

    }

  }



  // Helper to open picker relative to a button

  function openPickerFor(button, onPick, onPreview, onRevert) {

    materialPickerCallback = onPick;

    materialPreviewCallback = onPreview;

    materialRevertCallback = onRevert;

    modal.classList.remove('hidden');



    // Calculate animation origin relative to trigger button

    const triggerRect = button.getBoundingClientRect();

    const gridLeft = grid.offsetLeft;

    const gridTop = grid.offsetTop;



    const originX = (triggerRect.left + triggerRect.width / 2) - gridLeft;

    const originY = (triggerRect.top + triggerRect.height / 2) - gridTop;



    grid.style.transformOrigin = `${originX}px ${originY}px`;



    // Highlight the current color selection

    const currentColor = button.dataset.value;

    highlightSelectedColor(currentColor);

  }



  // A. Render Standard Rows

  PALETTE_TOP.forEach(group => {

    grid.appendChild(createRow(group));

  });



  // B. Render Footer Section (Split: Rows on Left, B/W on Right)

  const footer = document.createElement('div');

  footer.className = 'material-picker-footer';



  // Left Column (Grey, BlueGrey, Brown)

  const footerRows = document.createElement('div');

  footerRows.className = 'material-footer-rows';

  PALETTE_BOTTOM.forEach(group => {

    footerRows.appendChild(createRow(group));

  });

  footer.appendChild(footerRows);



  // Right Column (White, Black)

  const footerBW = document.createElement('div');

  footerBW.className = 'material-footer-bw';



  const whiteBox = document.createElement('div');

  whiteBox.className = 'bw-swatch';

  whiteBox.style.backgroundColor = '#ffffff';

  whiteBox.style.color = '#000000';

  whiteBox.textContent = 'white';

  whiteBox.dataset.color = '#ffffff';

  whiteBox.dataset.isClickable = 'true';

  footerBW.appendChild(whiteBox);



  const blackBox = document.createElement('div');

  blackBox.className = 'bw-swatch';

  blackBox.style.backgroundColor = '#000000';

  blackBox.style.color = '#ffffff';

  blackBox.textContent = 'black';

  blackBox.dataset.color = '#000000';

  blackBox.dataset.isClickable = 'true';

  footerBW.appendChild(blackBox);



  footer.appendChild(footerBW);

  grid.appendChild(footer);



  // --- 3. Optimization: Single Event Listener (Delegation) ---

  grid.addEventListener('click', (e) => {

    // Check if the clicked element has our specific data attribute

    // We check dataset.isClickable or class names

    const target = e.target.closest('[data-is-clickable="true"]');

    

    if (target && target.dataset.color) {

      pickColor(target.dataset.color);

    }

  });



  // --- Hover Preview ---

  grid.addEventListener('mouseover', (e) => {

    const target = e.target.closest('[data-is-clickable="true"]');

    if (target && target.dataset.color && materialPreviewCallback) {

      materialPreviewCallback(target.dataset.color);

    }

  });



  // --- Leave Revert ---

  grid.addEventListener('mouseleave', () => {

    if (materialRevertCallback) {

      materialRevertCallback();

    }

  });



  // --- Attach Trigger Listeners ---



  // 1. Fallback Icon Color Trigger

  if (fallbackTriggerBtn) {

    updateColorTrigger(fallbackTriggerBtn, appBookmarkFallbackColorPreference);

    fallbackTriggerBtn.dataset.value = appBookmarkFallbackColorPreference;



    fallbackTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkFallbackColorPreference;



      openPickerFor(

        fallbackTriggerBtn,

        (newColor) => {

          updateColorTrigger(fallbackTriggerBtn, newColor);

          fallbackTriggerBtn.dataset.value = newColor;

          appBookmarkFallbackColorPreference = newColor;

          applyBookmarkFallbackColor(newColor);

        },

        (previewColor) => {

          applyBookmarkFallbackColor(previewColor);

          updateColorTrigger(fallbackTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkFallbackColor(originalColor);

          updateColorTrigger(fallbackTriggerBtn, originalColor);

        }

      );

    });

  }



  // 2. Folder Icon Color Trigger

  if (folderTriggerBtn) {

    updateColorTrigger(folderTriggerBtn, appBookmarkFolderColorPreference);

    folderTriggerBtn.dataset.value = appBookmarkFolderColorPreference;



    folderTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkFolderColorPreference;



      openPickerFor(

        folderTriggerBtn,

        (newColor) => {

          updateColorTrigger(folderTriggerBtn, newColor);

          folderTriggerBtn.dataset.value = newColor;

          appBookmarkFolderColorPreference = newColor;

          applyBookmarkFolderColor(newColor);



          // Re-render current grid so folder icons update immediately

          if (currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {

            const freshNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id) || currentGridFolderNode;

            if (freshNode) {

              renderBookmarkGrid(freshNode);

            }

          }

        },

        (previewColor) => {

          applyBookmarkFolderColor(previewColor);

          updateColorTrigger(folderTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkFolderColor(originalColor);

          updateColorTrigger(folderTriggerBtn, originalColor);

        }

      );

    });

  }



  // 3. Bookmark Text Background Color Trigger

  if (textBgTriggerBtn) {

    updateColorTrigger(textBgTriggerBtn, appBookmarkTextBgColorPreference);

    textBgTriggerBtn.dataset.value = appBookmarkTextBgColorPreference;



    textBgTriggerBtn.addEventListener('click', () => {

      const originalColor = appBookmarkTextBgColorPreference;



      openPickerFor(

        textBgTriggerBtn,

        (newColor) => {

          updateColorTrigger(textBgTriggerBtn, newColor);

          textBgTriggerBtn.dataset.value = newColor;

          appBookmarkTextBgColorPreference = newColor;

          applyBookmarkTextBgColor(newColor);

        },

        (previewColor) => {

          applyBookmarkTextBgColor(previewColor);

          updateColorTrigger(textBgTriggerBtn, previewColor);

        },

        () => {

          applyBookmarkTextBgColor(originalColor);

          updateColorTrigger(textBgTriggerBtn, originalColor);

        }

      );

    });

  }



  if (closeBtn) closeBtn.addEventListener('click', closeMaterialPicker);

  modal.addEventListener('click', (e) => {

    if (e.target === modal) closeMaterialPicker();

  });

}



function closeMaterialPicker() {

  const modal = document.getElementById('material-picker-modal');

  if (!modal) return;



  // If we have a revert callback (meaning no final pick yet), revert on close

  if (materialRevertCallback) {

    materialRevertCallback();

  }

  materialRevertCallback = null;

  materialPreviewCallback = null;



  modal.classList.add('closing');



  setTimeout(() => {

    modal.classList.add('hidden');

    modal.classList.remove('closing');

    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {

      document.body.classList.remove('modal-open');

    }

    

    // --- RESET POSITIONING STYLES ---

    // This ensures the picker returns to center mode for other uses (like Settings)

    modal.style.display = ''; // Reverts to CSS (flex)

    

    const dialog = modal.querySelector('.material-picker-dialog');

    if (dialog) {

      dialog.style.position = '';

      dialog.style.top = '';

      dialog.style.left = '';

      dialog.style.margin = '';

    }

    

    const grid = document.getElementById('material-color-grid');

    if (grid) {

      grid.style.transformOrigin = '';

    }

  }, 150);

}



// ===============================================

// --- FIREFOX CONTAINER LOGIC ---

// ===============================================



async function setupContainerMode() {

  const row = document.getElementById('app-container-mode-row');

  const toggle = document.getElementById('app-container-mode-toggle');

  const subSettings = document.getElementById('container-sub-settings');

  const behaviorRow = document.getElementById('app-container-behavior-row');

  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');

  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');



  // 1. Feature Detection: Only run if browser supports identities

  if (!browser.contextualIdentities) {

    if (row) row.style.display = 'none';

    if (subSettings) subSettings.style.display = 'none';

    if (behaviorRow) behaviorRow.style.display = 'none';

    return;

  }



  // 2. Show the setting row

  if (row) row.style.display = 'flex';

  if (subSettings) {

    subSettings.style.display = '';

    setSubSettingsExpanded(subSettings, appContainerModePreference);

  }

  if (behaviorRow) {

    behaviorRow.style.display = appContainerModePreference ? 'flex' : 'none';

  }



  // 3. Sync Toggle State

  if (toggle) {

    toggle.checked = appContainerModePreference;



    toggle.addEventListener('change', async (e) => {

      const isEnabled = e.target.checked;



      appContainerModePreference = isEnabled;

      if (subSettings) setSubSettingsExpanded(subSettings, isEnabled, { scrollIntoView: true });
      if (behaviorRow) behaviorRow.style.display = isEnabled ? 'flex' : 'none';

      await browser.storage.local.set({ [APP_CONTAINER_MODE_KEY]: isEnabled });

    });

  }



  if (radioKeep && radioClose) {

    if (appContainerNewTabPreference) {

      radioKeep.checked = true;

    } else {

      radioClose.checked = true;

    }



    const handleRadioChange = async (e) => {

      if (e.target.checked) {

        appContainerNewTabPreference = (e.target.value === 'keep');

        await browser.storage.local.set({ [APP_CONTAINER_NEW_TAB_KEY]: appContainerNewTabPreference });

      }

    };



    radioKeep.addEventListener('change', handleRadioChange);

    radioClose.addEventListener('change', handleRadioChange);

  }

}



// Updated to accept targetId explicitly

async function populateContainerMenu(targetId, isFolder = false) {

  // 1. Determine which menu we are populating based on what was clicked

  const groupID = isFolder ? 'folder-context-container-group' : 'context-menu-container-group';

  const listID = isFolder ? 'folder-context-container-list' : 'context-menu-container-list';

  const parentMenuID = isFolder ? 'bookmark-grid-folder-menu' : 'bookmark-icon-menu';



  const containerGroup = document.getElementById(groupID);

  const containerList = document.getElementById(listID);



  // 2. Safety Checks

  if (!containerGroup || !containerList || !appContainerModePreference || !browser.contextualIdentities) {

    if (containerGroup) containerGroup.classList.add('hidden');

    return;

  }



  try {

    // 3. Fetch Containers

    const containers = await browser.contextualIdentities.query({});

    

    if (!containers || containers.length === 0) {

      containerGroup.classList.add('hidden');

      return;

    }



    containerList.innerHTML = '';

    

    // 4. Create Buttons

    containers.forEach((identity) => {

      const btn = document.createElement('button');

      btn.className = 'container-item';

      

      const icon = document.createElement('span');

      icon.className = 'container-icon';

      const colorMap = {

        blue: '#37adff',

        turquoise: '#00c79a',

        green: '#51cd00',

        yellow: '#ffcb00',

        orange: '#ff9f00',

        red: '#ff613d',

        pink: '#ff4bda',

        purple: '#af51f5'

      };

      icon.style.backgroundColor = colorMap[identity.color] || identity.colorCode || identity.color || '#333';



      btn.appendChild(icon);

      

      const text = document.createElement('span');

      text.textContent = identity.name;

      btn.appendChild(text);



      // 5. Handle Click

      btn.onclick = (e) => {

        e.stopPropagation();

        

        if (isFolder) {

          openFolderInContainer(targetId, identity.cookieStoreId);

        } else {

          openBookmarkInContainer(targetId, identity.cookieStoreId);

        }

        

        // Close the parent menu

        const menu = document.getElementById(parentMenuID);

        if (menu) menu.classList.add('hidden');

      };



      containerList.appendChild(btn);

    });



    containerGroup.classList.remove('hidden');



  } catch (err) {

    console.warn('Failed to load containers', err);

    containerGroup.classList.add('hidden');

  }

}



async function openFolderInContainer(folderId, cookieStoreId) {

  if (!folderId) return;

  

  const folderNode = findBookmarkNodeById(bookmarkTree[0], folderId);

  

  if (!folderNode || !folderNode.children || folderNode.children.length === 0) {

    alert('This folder is empty.');

    return;

  }



  if (folderNode.children.length > 10) {

    const confirmed = confirm(`Are you sure you want to open ${folderNode.children.length} tabs in this container?`);

    if (!confirmed) return;

  }



  for (const child of folderNode.children) {

    if (child.url) {

      await browser.tabs.create({

        url: child.url,

        cookieStoreId: cookieStoreId,

        active: false

      });

    }

  }

}



async function openFolderAll(folderId) {

  if (!folderId) return;



  const folderNode = findBookmarkNodeById(bookmarkTree[0], folderId);

  if (!folderNode || !folderNode.children || folderNode.children.length === 0) {

    alert('This folder is empty.');

    return;

  }



  if (folderNode.children.length > 10) {

    const confirmed = confirm(`Are you sure you want to open ${folderNode.children.length} tabs?`);

    if (!confirmed) return;

  }



  for (const child of folderNode.children) {

    if (child.url) {

      await browser.tabs.create({ url: child.url, active: false });

    }

  }

}



async function openBookmarkInContainer(bookmarkId, cookieStoreId) {

  if (!bookmarkId) return;

  

  // Ensure we have the latest tree before searching

  if (!bookmarkTree || !bookmarkTree[0]) {

    await getBookmarkTree();

  }



  const node = findBookmarkNodeById(bookmarkTree[0], bookmarkId);

  if (!node || !node.url) {

    console.error('Bookmark node not found or has no URL:', bookmarkId);

    alert('Invalid bookmark URL.');

    return;

  }



  try {

    let currentTab = null;

    try {

      currentTab = await browser.tabs.getCurrent();

    } catch (e) {

      console.warn('Could not determine current tab', e);

    }



    if (appContainerNewTabPreference) {

      await browser.tabs.create({

        url: node.url,

        cookieStoreId: cookieStoreId,

        active: false

      });

    } else {

      const createProps = {

        url: node.url,

        cookieStoreId: cookieStoreId,

        active: true

      };



      if (currentTab && currentTab.id) {

        createProps.index = currentTab.index + 1;

        await browser.tabs.create(createProps);

        await browser.tabs.remove(currentTab.id);

      } else {

        await browser.tabs.create(createProps);

      }

    }

  } catch (err) {

    console.error('Failed to open in container', err);

    alert('Error opening container tab. Check console for details.');

  }

}



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
    let STARTUP_PHASE = 'critical';
    let markReadyCount = 0;
    performance.mark('init:start');

    setupBackgroundVideoCrossfade();
    const wallpaperTypeP = getWallpaperTypePreference();

    const settingsP = loadAppSettingsFromStorage();
    const bookmarkMetaP = loadBookmarkMetadata();
    const iconMapP = loadDomainIconMap();
    const lastFolderP = loadLastUsedFolderId();

    const type = await wallpaperTypeP;
    // allow the video to buffer without blocking UI setup
    waitForWallpaperReady(currentWallpaperSelection, type);

    performance.mark('init:parallel-start');
    const parallelResults = await Promise.allSettled([settingsP, bookmarkMetaP, iconMapP, lastFolderP]);
    performance.mark('init:parallel-done');
    performance.measure('init:parallel', 'init:parallel-start', 'init:parallel-done');

    const [settingsResult, bookmarkMetaResult, iconMapResult, lastFolderResult] = parallelResults;
    logInitSettled('loadAppSettingsFromStorage', settingsResult);
    logInitSettled('loadBookmarkMetadata', bookmarkMetaResult);
    logInitSettled('loadDomainIconMap', iconMapResult);
    logInitSettled('loadLastUsedFolderId', lastFolderResult);

    await loadFolderMetadata();

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

  scheduleIdleTask(() => warmGalleryPosterHydration(), 'warmGalleryPosterHydration');

  

  setupQuickActions();

  setupBookmarkModal();

  setupFolderModal();

  setupEditFolderModal();

  setupBuiltInIconPicker();

  setupMoveModal();

  setupFolderPickerModal();

  setupHomebaseRootControls();

  setupHomebaseRootListeners();

  ensureFaviconObserver();
  scheduleIdleTask(() => pruneFaviconMetaIfNeeded(), 'startup:pruneFaviconMeta');



  try {

    await loadBookmarks();

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
  };

  const loadCachedWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather start');
    try {
      await loadCachedWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:loadCachedWeather', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const buildQuoteIndexSafe = async () => {
    if (!document || !document.body) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex start');
    try {
      await ensureQuoteIndexBuilt();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:quoteIndex', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const setupQuoteWidgetSafe = () => {
    if (!document || !document.body || !quoteWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget start');
    try {
      setupQuoteWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupQuoteWidget', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const setupNewsWidgetSafe = () => {
    if (!document || !document.body || !newsWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget start');
    try {
      setupNewsWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupNewsWidget', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const setupTodoWidgetSafe = async () => {
    if (!document || !document.body || !todoWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget start');
    try {
      await setupTodoWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupTodoWidget', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const setupSearchSafe = async () => {
    if (!document || !document.body || !searchForm || !searchInput || !searchSelect || !searchResultsPanel || !searchWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch start');
    try {
      await setupSearch();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupSearch', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch end in', Math.round(performance.now() - start), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupSearchSafe ran during critical phase');
    }
  };

  const setupWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather start');
    try {
      await setupWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupWeather', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather end in', Math.round(performance.now() - start), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupWeatherSafe ran during critical phase');
    }
  };

  const setupAppLauncherSafe = () => {
    if (!document || !document.body || !googleAppsBtn || !googleAppsPanel) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher start');
    try {
      setupAppLauncher();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupAppLauncher', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher end in', Math.round(performance.now() - start), 'ms');
    }
  };

  const fetchQuoteSafe = () => {
    if (!document || !document.body || !quoteText || !quoteAuthor) return;
    const start = performance.now();
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote start');
    try {
      fetchQuote();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:fetchQuote', err);
    } finally {
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote end in', Math.round(performance.now() - start), 'ms');
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



  // --- Add global listeners to hide ALL context menus ---

  const hideAllContextMenus = () => {

    folderContextMenu.classList.add('hidden');

    gridFolderMenu.classList.add('hidden');

    iconContextMenu.classList.add('hidden');

    if (gridBlankMenu) {

      gridBlankMenu.classList.add('hidden');

    }

  };



  window.addEventListener('click', hideAllContextMenus);

  window.addEventListener('blur', hideAllContextMenus);



  // Prevent clicks inside menus from closing them immediately

  [folderContextMenu, gridFolderMenu, iconContextMenu, gridBlankMenu].forEach(menu => {

    if (!menu) return;

    menu.addEventListener('click', (e) => {

      e.stopPropagation();

    });

  });



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



    bookmarksGrid.addEventListener('contextmenu', (e) => {

      if (e.target.closest('.grid-item-rename-input')) return;

      const item = e.target.closest('.bookmark-item');

      if (!item || item.classList.contains('back-button')) return;



      e.preventDefault();

      e.stopPropagation();

      hideAllContextMenus();

      const isFolder = item.dataset.isFolder === 'true';

      const nodeId = item.dataset.bookmarkId;

      currentContextItemId = nodeId || null;

      currentContextIsFolder = isFolder;

      currentContextSourceTile = item;



      folderContextMenu.classList.add('hidden');

      gridFolderMenu.classList.add('hidden');

        iconContextMenu.classList.add('hidden');



        const targetMenu = isFolder ? gridFolderMenu : iconContextMenu;

        if (!targetMenu) return;



        // Populate container menus depending on selection

        if (appContainerModePreference) {

          populateContainerMenu(nodeId, isFolder);

        } else {

          const iconGroup = document.getElementById('context-menu-container-group');

          const folderGroup = document.getElementById('folder-context-container-group');

          if (iconGroup) iconGroup.classList.add('hidden');

          if (folderGroup) folderGroup.classList.add('hidden');

        }



        targetMenu.style.top = `${e.clientY}px`;

        targetMenu.style.left = `${e.clientX}px`;

        targetMenu.classList.remove('hidden');

      });

    }

  if (gridBlankMenu) {

    // Change: Attach the listener to the whole document but skip interactive elements.
    document.addEventListener('contextmenu', (e) => {

      if (
        e.target.closest('.bookmark-item') ||
        e.target.closest('.sidebar') ||
        e.target.closest('.dock') ||
        e.target.closest('.widget-search') ||
        e.target.closest('.search-toolbar-buttons') ||
        e.target.closest('.modal-overlay:not(.hidden)') ||
        ['INPUT', 'TEXTAREA', 'BUTTON', 'A'].includes(e.target.tagName)
      ) {
        return;
      }

      e.preventDefault();

      e.stopPropagation();

      hideAllContextMenus();

      gridBlankMenu.style.top = `${e.clientY}px`;

      gridBlankMenu.style.left = `${e.clientX}px`;

      gridBlankMenu.classList.remove('hidden');

    });



    const handleGridMenuAction = (action) => {

      hideAllContextMenus();

      if (action === 'bookmark') {

        showAddBookmarkModal();

      } else if (action === 'folder') {

        showAddFolderModal();

      } else if (action === 'manage') {

        // Placeholder for future functionality

      }

    };



    if (gridMenuCreateBookmarkBtn) {

      gridMenuCreateBookmarkBtn.addEventListener('click', () => handleGridMenuAction('bookmark'));

    }

    if (gridMenuCreateFolderBtn) {

      gridMenuCreateFolderBtn.addEventListener('click', () => handleGridMenuAction('folder'));

    }

    if (gridMenuManageBtn) {

      gridMenuManageBtn.addEventListener('click', () => handleGridMenuAction('manage'));

    }

    if (gridMenuPasteBtn) {

      gridMenuPasteBtn.addEventListener('click', () => {

        hideAllContextMenus();

        handlePasteBookmark();

      });

    }

    if (gridMenuSortNameBtn) {

      gridMenuSortNameBtn.addEventListener('click', () => {

        hideAllContextMenus();

        sortCurrentFolderByName();

      });

    }

  }

  document.addEventListener('paste', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) {
      return;
    }

    e.preventDefault();

    handlePasteBookmark();
  });

  // === Handle clicks inside the GRID FOLDER context menu ===

  if (gridFolderMenu) {

    gridFolderMenu.addEventListener('click', (e) => {

      const button = e.target.closest('button.menu-item');

      if (!button) return;

      e.stopPropagation();



      const action = button.dataset.action;



      if (action === 'open') {

        openFolderFromContext(currentContextItemId);

      } else if (action === 'open-all') {

        openFolderAll(currentContextItemId);

      } else if (action === 'rename') {

        // --- UPDATED ---

        const gridItem = document.querySelector(`.bookmark-item[data-bookmark-id="${currentContextItemId}"]`);

        const node = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);

        if (gridItem && node) {

          showGridItemRenameInput(gridItem, node);

        }

        // --- END UPDATE ---

      } else if (action === 'edit') {

        if (bookmarkTree && bookmarkTree[0] && currentContextItemId) {

          const folderNode = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);

          if (folderNode) {

            showEditFolderModal(folderNode);

          }

        }

      } else if (action === 'delete') {

        // Delete a folder (and its children) in the grid

        deleteBookmarkOrFolder(currentContextItemId, true, currentContextSourceTile);

      } else if (action === 'move') {

        openMoveBookmarkModal(currentContextItemId, true);

      }

      // Later you can handle other actions:

      // if (action === 'edit') { ... }



      hideAllContextMenus();

    });

  }



  // === Handle clicks inside the ICON context menu ===

  if (iconContextMenu) {

    iconContextMenu.addEventListener('click', (e) => {

      const button = e.target.closest('button.menu-item');

      if (!button) return;

      e.stopPropagation();



      const action = button.dataset.action;



      if (action === 'rename') {

        // --- UPDATED ---

        const gridItem = document.querySelector(`.bookmark-item[data-bookmark-id="${currentContextItemId}"]`);

        const node = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);

        if (gridItem && node) {

          showGridItemRenameInput(gridItem, node);

        }

        // --- END UPDATE ---

      } else if (action === 'edit') {

        showEditBookmarkModal(currentContextItemId);

      } else if (action === 'delete') {

        // Delete a regular bookmark icon

        deleteBookmarkOrFolder(currentContextItemId, false, currentContextSourceTile);

      } else if (action === 'move') {

        openMoveBookmarkModal(currentContextItemId, false);

      } else if (action === 'open-new-tab') {

        openBookmarkInNewTab(currentContextItemId);

      }

      // Later you can handle:

      // if (action === 'edit') { ... }



      hideAllContextMenus();

    });

  }



  // === All manual D&D listeners for bookmarkFolderTabsContainer removed ===

  // They are now handled by setupTabsSortable() which is

  // called at the end of createFolderTabs()

}



if (browser?.storage?.onChanged) {

  browser.storage.onChanged.addListener((changes, area) => {

    if (area !== 'local') return;



    if (changes[APP_SEARCH_REMEMBER_ENGINE_KEY]) {

      appSearchRememberEnginePreference = changes[APP_SEARCH_REMEMBER_ENGINE_KEY].newValue !== false;

      if (!appSearchRememberEnginePreference) {

        updateSearchUI(appSearchDefaultEnginePreference);

      }

    }



    if (changes[SEARCH_ENGINES_PREF_KEY]) {

      const newConfig = changes[SEARCH_ENGINES_PREF_KEY].newValue;

      if (newConfig) {

        searchEngines.forEach((engine) => {

          if (Object.prototype.hasOwnProperty.call(newConfig, engine.id)) {

            engine.enabled = newConfig[engine.id];

          }

        });

        populateSearchOptions();

        updateSearchUI(currentSearchEngine.id);

      }

    }



    if (changes.currentSearchEngineId) {

      const newId = changes.currentSearchEngineId.newValue;

      if (appSearchRememberEnginePreference && newId && newId !== currentSearchEngine.id) {

        updateSearchUI(newId);

      }

    }



      if (changes[FOLDER_META_KEY]) {

        folderMetadata = changes[FOLDER_META_KEY].newValue || {};



        // If currently viewing a folder that changed elsewhere, refresh that grid

        if (currentGridFolderNode && folderMetadata[currentGridFolderNode.id]) {

          const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

          if (activeNode) renderBookmarkGrid(activeNode);

        }

      }



      if (changes[BOOKMARK_META_KEY]) {

        bookmarkMetadata = changes[BOOKMARK_META_KEY].newValue || {};

        if (currentGridFolderNode) {

          const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

          if (activeNode) renderBookmarkGrid(activeNode);

        }

      }

      if (changes[DOMAIN_ICON_MAP_KEY]) {
        domainIconMap = changes[DOMAIN_ICON_MAP_KEY].newValue || {};
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
  initAddonStoreDockLink();
});


initializePage();



// ================================

//    Dynamic Calculator Color

// ================================

function extractAverageColor(imgUrl) {

  return new Promise((resolve) => {

    const img = new Image();

    img.crossOrigin = 'anonymous';

    img.src = imgUrl;



    img.onload = () => {

      const canvas = document.createElement('canvas');

      canvas.width = img.width;

      canvas.height = img.height;

      const ctx = canvas.getContext('2d');



      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;



      let r = 0; let g = 0; let b = 0;

      let count = 0;



      for (let i = 0; i < data.length; i += 200) {

        r += data[i];

        g += data[i + 1];

        b += data[i + 2];

        count++;

      }



      resolve(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);

    };



    img.onerror = () => resolve('#2ca5ff');

  });

}



async function updateDynamicAccent() {

  if (!document || !document.body || !document.documentElement) return;

  try {
    const bg = document.body.style?.backgroundImage;
    if (!bg || bg === 'none') return;

    const poster = bg.replace(/^url\("|"\)$/g, '');
    if (!poster) return;

    const avg = await extractAverageColor(poster);
    document.documentElement.style.setProperty('--dynamic-accent', avg);
  } catch (err) {
    console.warn('Dynamic accent update failed', err);
  }

}



scheduleIdleTask(() => updateDynamicAccent(), 'startup:updateDynamicAccent');






































// Placeholder: alternate button shuffles through manifest in current view





















async function loadWallpaperTypePreference() {

  const stored = await browser.storage.local.get(WALLPAPER_TYPE_KEY);

  wallpaperTypePreference = stored[WALLPAPER_TYPE_KEY] || 'video';

  if (wallpaperTypeToggle) {

    wallpaperTypeToggle.checked = wallpaperTypePreference === 'video';

  }

  if (appWallpaperTypeSelect) {
    appWallpaperTypeSelect.value = wallpaperTypePreference;
  }

}



async function loadCurrentWallpaperSelection() {

  try {

    const stored = await browser.storage.local.get(WALLPAPER_SELECTION_KEY);

    const selection = stored[WALLPAPER_SELECTION_KEY] || null;

    currentWallpaperSelection = await hydrateWallpaperSelection(selection);

  } catch (err) {

    currentWallpaperSelection = null;

  }

}



async function getWallpaperTypePreference() {

  if (!wallpaperTypePreference) {

    await loadWallpaperTypePreference();

  }

  return wallpaperTypePreference || 'video';

}



async function setWallpaperTypePreference(type) {

  const next = type === 'static' ? 'static' : 'video';

  wallpaperTypePreference = next;

  await browser.storage.local.set({ [WALLPAPER_TYPE_KEY]: next });



  // Re-apply current wallpaper with the new mode if available

  try {

    const stored = await browser.storage.local.get([WALLPAPER_SELECTION_KEY, WALLPAPER_FALLBACK_USED_KEY]);

    let selection = stored[WALLPAPER_SELECTION_KEY] || currentWallpaperSelection;

    if (!selection) {

      const selectedAt = stored[WALLPAPER_FALLBACK_USED_KEY] || Date.now();

      selection = buildFallbackSelection(selectedAt);

      await browser.storage.local.set({

        [WALLPAPER_SELECTION_KEY]: selection,

        [WALLPAPER_FALLBACK_USED_KEY]: selectedAt

      });

    }

    if (selection) {

      const hydrated = await hydrateWallpaperSelection(selection);
      await ensurePlayableSelection(hydrated);

      currentWallpaperSelection = hydrated;

      applyWallpaperByType(hydrated, next);

    }

  } catch (err) {

    console.warn('Failed to reapply wallpaper for type change', err);

  }

}



if (wallpaperTypeToggle && !wallpaperTypeToggle.dataset.typeListenerAttached) {
  wallpaperTypeToggle.dataset.typeListenerAttached = 'true';

  wallpaperTypeToggle.addEventListener('change', async (e) => {

    const type = e.target.checked ? 'video' : 'static';

    await setWallpaperTypePreference(type);

  });

}

document.addEventListener('visibilitychange', () => {

  const videos = document.querySelectorAll('.background-video');



  if (document.hidden) {

    videos.forEach((v) => {

      if (!v.paused) {

        v.dataset.wasPlaying = 'true';

        v.pause();

      }

    });

  } else {

    if (isPerformanceModeEnabled()) return;

    const activeVideo = document.querySelector('.background-video.is-active') || videos[0];

    if (activeVideo) {

      activeVideo.play().catch(() => {});

    }

    if (!document.body.classList.contains('modal-open')) {

      setTimeout(() => searchInput.focus(), 50);

    }

  }

});

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



function captureGridItemPositions(grid) {

  if (!grid) return null;

  const positions = {};

  grid.querySelectorAll('.bookmark-item').forEach(item => {

    const bookmarkId = item.dataset.bookmarkId;

    if (!bookmarkId) return;

    positions[bookmarkId] = item.getBoundingClientRect();

  });

  return positions;

}



function animateGridReorder(items, previousPositions) {

  if (!previousPositions) {

    items.forEach(item => {

      item.style.opacity = 1;

    });

    return;

  }



  const animations = [];



  items.forEach(item => {

    if (item.classList.contains('back-button')) {

      item.style.opacity = 1;

      return;

    }

    const bookmarkId = item.dataset.bookmarkId;

    if (!bookmarkId) {

      item.style.opacity = 1;

      return;

    }

    const previousRect = previousPositions[bookmarkId];

    if (!previousRect) {

      item.style.opacity = 1;

      return;

    }



    const newRect = item.getBoundingClientRect();

    const deltaX = previousRect.left - newRect.left;

    const deltaY = previousRect.top - newRect.top;



    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {

      item.style.opacity = 1;

      return;

    }



    animations.push({ item, deltaX, deltaY });

  });



  if (!animations.length) {

    items.forEach(item => {

      item.style.opacity = 1;

    });

    return;

  }



  requestAnimationFrame(() => {

    animations.forEach(({ item, deltaX, deltaY }) => {

      item.style.transition = 'none';

      item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      item.style.opacity = 1;

      item.style.willChange = 'transform';

    });



    requestAnimationFrame(() => {

      animations.forEach(({ item }) => {

        item.style.transition = 'transform 250ms ease';

        item.style.transform = '';

        const cleanup = () => {

          item.style.transition = '';

          item.style.willChange = '';

          item.removeEventListener('transitionend', cleanup);

        };

        item.addEventListener('transitionend', cleanup);

      });

    });

  });

}





function cleanupUnusedObjectUrls(currentSelection) {
  const activeKeys = new Set();
  const activeUrls = new Set();

  if (currentSelection) {

    if (currentSelection.videoUrl) activeUrls.add(currentSelection.videoUrl);

    if (currentSelection.posterUrl) activeUrls.add(currentSelection.posterUrl);

    if (currentSelection.videoCacheKey) {
      getCacheKeyVariants(currentSelection.videoCacheKey).forEach(k => activeKeys.add(k));
    }
    if (currentSelection.posterCacheKey) {
      getCacheKeyVariants(currentSelection.posterCacheKey).forEach(k => activeKeys.add(k));
    }

    // Back-compat: sometimes cacheKey is stored in videoUrl/posterUrl
    if (currentSelection.videoUrl && !String(currentSelection.videoUrl).startsWith('blob:')) {
      getCacheKeyVariants(currentSelection.videoUrl).forEach(k => activeKeys.add(k));
    }
    if (currentSelection.posterUrl &&
        !String(currentSelection.posterUrl).startsWith('blob:') &&
        !String(currentSelection.posterUrl).startsWith('data:')) {
      getCacheKeyVariants(currentSelection.posterUrl).forEach(k => activeKeys.add(k));
    }
  }

  console.debug('cleanupUnusedObjectUrls', {
    videoUrl: currentSelection && currentSelection.videoUrl,
    videoCacheKey: currentSelection && currentSelection.videoCacheKey,
    cacheEntries: Array.from(wallpaperObjectUrlCache.entries())
  });

  for (const [cacheKey, objectUrl] of wallpaperObjectUrlCache.entries()) {

    const keepBecauseKeyActive = activeKeys.has(cacheKey);
    const keepBecauseUrlActive = activeUrls.has(objectUrl) || activeUrls.has(cacheKey);

    if (!keepBecauseKeyActive && !keepBecauseUrlActive) {

      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      wallpaperObjectUrlCache.delete(cacheKey);

    }

  }

}



function applyWallpaperByType(selection, type = 'video') {

  if (!selection) return;

  const finalType = type === 'static' ? 'static' : 'video';

  const poster = selection.posterUrl || '';

  const posterCacheKey = selection.posterCacheKey || selection.poster || selection.posterUrl || '';

  const video = finalType === 'video' ? (selection.videoUrl || '') : '';



  setWallpaperFallbackPoster(poster, posterCacheKey);



  const unchanged =

    lastAppliedWallpaper &&

    lastAppliedWallpaper.id === (selection.id || null) &&

    lastAppliedWallpaper.poster === poster &&

    lastAppliedWallpaper.video === video &&

    lastAppliedWallpaper.type === finalType;



  currentWallpaperSelection = selection;

  cleanupUnusedObjectUrls(selection);

  if (isPerformanceModeEnabled() && finalType === 'video') {
    cleanupBackgroundPlayback();
    applyWallpaperBackground(poster);
    lastAppliedWallpaper = {
      id: selection.id || null,
      poster,
      video,
      type: finalType
    };
    updateSettingsPreview(selection, finalType);
    return;
  }



  if (!unchanged) {
    const applyWallpaperFlow = () => {
      // Stop any existing playback loop/listeners before starting new video logic.
      cleanupBackgroundPlayback();

      applyWallpaperBackground(poster);

      if (finalType === 'video' && video) {
        setBackgroundVideoSources(video, poster);
        startBackgroundVideos();
        setupBackgroundVideoCrossfade();
      } else {
        // Already cleaned up above, just ensure UI state is correct
        clearBackgroundVideos();
      }
      lastAppliedWallpaper = {

        id: selection.id || null,

        poster,

        video,

        type: finalType

      };
    };

    if (poster) {
      const img = new Image();
      img.onload = () => {
        img.onload = null;
        img.onerror = null;
        applyWallpaperFlow();
      };
      img.onerror = () => {
        img.onload = null;
        img.onerror = null;
        applyWallpaperFlow();
      };
      img.src = poster;
    } else {
      applyWallpaperFlow();
    }
  } else {

    // If unchanged, ensure videos keep playing for video type

    if (finalType === 'video' && video) {

      startBackgroundVideos();

    }

  }



  updateSettingsPreview(selection, finalType);

}



function clearBackgroundVideos() {

  const videos = Array.from(document.querySelectorAll('.background-video'));

  videos.forEach((v) => {

    try { v.pause(); } catch (e) {}

    const source = v.querySelector('source');

    if (source) source.src = '';

    v.removeAttribute('src');

    v.removeAttribute('poster');

    v.load();

    v.classList.remove('is-active');

  });

}



function startBackgroundVideos() {

  if (isPerformanceModeEnabled()) {
    cleanupBackgroundPlayback();
    return;
  }

  const videos = Array.from(document.querySelectorAll('.background-video'));

  if (!videos.length) return;

  videos.forEach((v) => {

    v.muted = true;

    v.playsInline = true;

    v.loop = false; // crossfade manages looping

    v.classList.remove('is-active'); // stay hidden until crossfade activates

  });

}





function updateSettingsPreview(selection, type = 'video') {

  const finalType = type === 'static' ? 'static' : 'video';

  const perfModeOn = isPerformanceModeEnabled();

  const poster = (selection && (selection.posterUrl || selection.poster)) || 'assets/fallback.webp';

  const title = (selection && selection.title) || 'Wallpaper';

  const author = (selection && selection.category) || '';



  if (settingsPreviewTitle) settingsPreviewTitle.textContent = title;

  if (settingsPreviewAuthor) settingsPreviewAuthor.textContent = author ? `Category: ${author}` : '';



  if (!settingsPreviewImg || !settingsPreviewVideo) return;



  if (!perfModeOn && finalType === 'video' && selection && selection.videoUrl) {

    settingsPreviewVideo.classList.remove('hidden');

    settingsPreviewImg.classList.add('hidden');

    settingsPreviewVideo.poster = poster;

    const srcEl = settingsPreviewVideo.querySelector('source');

    if (srcEl) {

      srcEl.src = selection.videoUrl;

    } else {

      settingsPreviewVideo.src = selection.videoUrl;

    }

    settingsPreviewVideo.load();

    settingsPreviewVideo.play().catch(() => {});

  } else {

    settingsPreviewVideo.pause();

    settingsPreviewVideo.removeAttribute('src');

    const srcEl = settingsPreviewVideo.querySelector('source');

    if (srcEl) srcEl.src = '';

    settingsPreviewVideo.load();



    settingsPreviewImg.src = poster;

    settingsPreviewImg.classList.remove('hidden');

    settingsPreviewVideo.classList.add('hidden');

  }

}


/**
 * Ensures interactive selections resolve cache keys into playable URLs
 * before the player is asked to start playback.
 */
async function ensurePlayableSelection(selection) {
  if (!selection) return selection;

  const cacheKey = selection.videoCacheKey || selection.videoUrl || '';
  if (cacheKey) {
    let cachedVideo = await getCachedObjectUrl(cacheKey);
    if (!cachedVideo && typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.getObjectUrl === 'function') {
      cachedVideo = await MyWallpapers.getObjectUrl(cacheKey);
    }
    if (cachedVideo) {
      selection.videoUrl = cachedVideo;
    }
  }

  return selection;
}
