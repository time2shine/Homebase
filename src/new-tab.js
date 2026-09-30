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

// Wallpaper constants, state, and rotation helpers extracted to wallpaper-controller.js


// syncWallpaperStartupState extracted to wallpaper-storage.js

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

async function ensureGalleryUi() {
  await loadStylesheetOnce('newtab/styles/gallery.css');
  await loadScriptOnce('newtab/wallpaper/gallery-ui.js');

  if (
    !window.HomebaseGallery ||
    typeof window.HomebaseGallery.open !== 'function'
  ) {
    throw new Error('HomebaseGallery failed to load');
  }

  return window.HomebaseGallery;
}

function createGalleryContext() {
  return {
    getCurrentWallpaperSelection: () => currentWallpaperSelection,
    setCurrentWallpaperSelection: (selection) => { currentWallpaperSelection = selection || null; },
    getWallpaperSettings: () => ({
      type: wallpaperTypePreference || 'video',
      quality: wallpaperQualityPreference || 'low',
      daily: dailyRotationPreference !== false
    }),
    getWallpaperTypePreferenceState: () => wallpaperTypePreference,
    setWallpaperTypePreferenceState: (type) => {
      wallpaperTypePreference = type === 'static' ? 'static' : 'video';
    },
    getWallpaperQualityPreference: () => wallpaperQualityPreference,
    setWallpaperQualityPreference: (quality) => {
      wallpaperQualityPreference = quality === 'high' ? 'high' : 'low';
    },
    getDailyRotationPreference: () => dailyRotationPreference,
    setDailyRotationPreference: (enabled) => {
      dailyRotationPreference = enabled !== false;
    },
    loadWallpaperTypePreference,
    loadCurrentWallpaperSelection,
    getWallpaperTypePreference,
    setWallpaperTypePreference,
    applyWallpaperByType,
    rebuildCurrentSelectionFromGallery,
    ensureDailyWallpaper,
    getVideosManifest,
    cacheGalleryPosters,
    cacheAppliedWallpaperVideo,
    cacheAppliedWallpaperPoster,
    resolvePosterBlob,
    cacheAsset,
    hydrateWallpaperSelection,
    ensurePlayableSelection,
    getWallpaperUrls,
    isGallerySelection,
    isRemoteVideoUrl,
    normalizeWallpaperCacheKey,
    getCacheKeyVariants,
    buildFallbackSelection,
    applyWallpaperBackground,
    setWallpaperFallbackPoster,
    clearBackgroundVideos,
    isPerformanceModeEnabled,
    blobToDataUrl,
    openModalWithAnimation,
    closeModalWithAnimation,
    showCustomDialog,
    showCustomAlert,
    scheduleIdleTask,
    debounce,
    ...createGalleryStorageBridge()
  };
}

function notifyGalleryUiLoadFailure(err) {
  console.warn('Failed to open gallery UI', err);
  const message = 'Could not open the wallpaper gallery. Please try again.';
  if (typeof showCustomAlert === 'function') {
    showCustomAlert(message);
  } else {
    alert(message);
  }
}

async function openWallpaperGallery(triggerSource = 'dock-gallery-btn') {
  try {
    const gallery = await ensureGalleryUi();
    return await gallery.open({
      triggerSource,
      context: createGalleryContext()
    });
  } catch (err) {
    notifyGalleryUiLoadFailure(err);
    return null;
  }
}

// Video playback state and cleanupBackgroundPlayback extracted to wallpaper-controller.js




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



// ===============================================

// --- VIDEOS MANIFEST CACHING (DAILY) ---

// ===============================================
// Manifest & Cache Storage Pipeline extracted to wallpaper-controller.js
// (loadCachedGalleryManifest, refreshGalleryManifestInBackground,
//  fetchVideosManifestIfNeeded, getVideosManifest, cacheGalleryPostersIfNeeded,
//  warmGalleryPosterHydration, cacheAppliedWallpaperVideo, cacheAppliedWallpaperPoster)
// ===============================================

// Poster encoding helpers and buildVideoPosterFromFile extracted to wallpaper-controller.js




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



async function setBackgroundVideoSources(videoUrl, posterUrl = '') {
  if (isPerformanceModeEnabled()) return;

  try {
    const videos = Array.from(document.querySelectorAll('.background-video'));
    recordStartupPerfEvent('newtab:video-source-assign-start', { videoElements: videos.length });

    const videoUpdates = videos.map((v) => {
      try {
        const source = v.querySelector('source');
        const currentSrc = source ? (source.getAttribute('src') || '') : (v.getAttribute('src') || '');
        const desiredPoster = posterUrl || '';
        const needsUpdate = currentSrc !== videoUrl || v.poster !== desiredPoster;
        return { v, source, desiredPoster, needsUpdate };
      } catch (e) {
        return { v, source: null, desiredPoster: posterUrl || '', needsUpdate: false };
      }
    });

    if (!videoUpdates.some((update) => update.needsUpdate)) {
      await backgroundVideoSourceLoadPromise;
      recordStartupPerfEvent('newtab:video-source-load-complete', { updated: false });
      return;
    }

    const loadGeneration = ++backgroundVideoSourceLoadGeneration;
    const loadTasks = videoUpdates.map(({ v, source, desiredPoster, needsUpdate }, index) => {
      return new Promise((resolve) => {
        if (!needsUpdate) {
          resolve();
          return;
        }

        try {
          try { v.pause(); } catch (e) {}

          v.poster = desiredPoster;

          if (source) {
            source.src = videoUrl;
          } else {
            v.src = videoUrl;
          }

          const loadVideo = () => {
            try {
              if (loadGeneration === backgroundVideoSourceLoadGeneration && !isPerformanceModeEnabled()) {
                try {
                  v.load();
                  recordStartupPerfEvent('newtab:video-load-called', { index });
                } catch (e) {}
                try { v.currentTime = 0; } catch (e) {}
              }
            } finally {
              resolve();
            }
          };

          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
              requestAnimationFrame(loadVideo);
            });
          } else {
            setTimeout(loadVideo, 0);
          }
        } catch (e) {
          resolve();
        }
      });
    });

    backgroundVideoSourceLoadPromise = Promise.all(loadTasks).then(() => undefined).catch(() => undefined);

    await backgroundVideoSourceLoadPromise;
    recordStartupPerfEvent('newtab:video-source-load-complete', { updated: true });
  } catch (e) {
    // Keep wallpaper application resilient; callers handle playback fallback.
  }

}

function startBackgroundVideosAfterSourceLoad(sourceLoadPromise, startSequence, selection, finalType, poster, video) {
  Promise.resolve(sourceLoadPromise)
    .catch(() => {})
    .finally(() => {
      const selectionId = selection && selection.id ? selection.id : null;
      const current = currentWallpaperSelection || null;
      const crossfadeKey = `${selectionId || ''}|${video}|${poster}`;

      if (startSequence !== wallpaperVideoStartSequence) return;
      if (isPerformanceModeEnabled()) return;
      if (!current || (current.id || null) !== selectionId) return;
      if ((current.posterUrl || '') !== poster) return;
      if (finalType === 'video' && (current.videoUrl || '') !== video) return;
      if (
        !lastAppliedWallpaper ||
        lastAppliedWallpaper.id !== selectionId ||
        lastAppliedWallpaper.poster !== poster ||
        lastAppliedWallpaper.video !== video ||
        lastAppliedWallpaper.type !== finalType
      ) {
        return;
      }

      if (crossfadeKey === backgroundVideoCrossfadeSetupKey) {
        const activeVideo = document.querySelector('.background-video.is-active');
        if (activeVideo && activeVideo.paused) {
          activeVideo.play().catch(() => {});
        }
        return;
      }

      recordStartupPerfEvent('newtab:video-start-requested');
      startBackgroundVideos();
      if (setupBackgroundVideoCrossfade()) {
        recordStartupPerfEvent('newtab:crossfade-setup');
        backgroundVideoCrossfadeSetupKey = crossfadeKey;
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



// getWallpaperUrls, isUserUploadSelection, isGallerySelection, getGalleryUrlsOrNull extracted to wallpaper-controller.js


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

  let pool = await getWallpaperPool();

  if (!pool.length) {

    pool = shuffleArray(manifest.map(item => item.id));

  }

  const nextId = pool.pop();

  const entry = manifest.find(item => item.id === nextId);

  await setWallpaperPool(pool);

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

  await setWallpaperSelection(selection);

  return selection;

}



// checkBatteryStatus extracted to wallpaper-controller.js




function schedulePendingDailyRotationAttempt() {

  if (pendingDailyRotationTimer) return;

  pendingDailyRotationTimer = setTimeout(async () => {

    pendingDailyRotationTimer = null;

    if (document.hidden) return;

    if (isPerformanceModeEnabled()) return;

    try {

      const stored = await getWallpaperRotationState();

      const now = Date.now();

      const pending = stored.pending;

      const allowDailyRotation = stored.allowDailyRotation;

      const current = stored.selection;

      const selectedAt = current && current.selectedAt ? current.selectedAt : 0;

      if (!current || !Number.isFinite(selectedAt) || selectedAt <= 0) {

        await clearPendingDailyRotation();

        return;

      }

      const dueByDayChange = isDailyWallpaperRotationDue(current, allowDailyRotation, now);

      if (!pending) return;

      if (!allowDailyRotation || !dueByDayChange) {

        await clearPendingDailyRotation();

        return;

      }

      await clearPendingDailyRotation();

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

  const recordStartupIdle = forceNext !== true;
  const startupIdleStart =
    recordStartupIdle && typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;

  if (recordStartupIdle) {
    recordIdleTaskPerf('startup:ensureDailyWallpaper', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:ensureDailyWallpaper start');
  }

  try {

  if (isPerformanceModeEnabled()) {
    if (
      wallpaperTypePreference === 'video' ||
      (currentWallpaperSelection && currentWallpaperSelection.videoUrl)
    ) {
      recordPerformanceModeVideoSkipped();
    }
    return;
  }

  const stored = await getWallpaperRotationState();

  const now = Date.now();

  const storedFallbackUsedAt = stored.fallbackUsedAt || 0;
  const storedQuality = stored.quality;
  if (storedQuality) {
    wallpaperQualityPreference = storedQuality === 'high' ? 'high' : 'low';
  }



  let current = stored.selection;

  let fallbackUsedAt = storedFallbackUsedAt || now;

  if (!current) {

    const fallbackSelection = buildFallbackSelection(fallbackUsedAt);

    current = fallbackSelection;

    currentWallpaperSelection = fallbackSelection;

    await setWallpaperSelectionWithFallback(fallbackSelection, fallbackUsedAt);

  } else {

    currentWallpaperSelection = current;

  }



  const allowDailyRotation = stored.allowDailyRotation;
  const pendingAlreadySet = stored.pending;
  const pendingSince = stored.pendingSince || 0;
  const dueByDayChange = isDailyWallpaperRotationDue(current, allowDailyRotation, now);

  if (pendingAlreadySet && !dueByDayChange) {

    await clearPendingDailyRotation();

  }

  const shouldDeferRotation = !forceNext && allowDailyRotation && dueByDayChange;

  if (shouldDeferRotation) {

    if (!pendingAlreadySet) {

      await setPendingDailyRotation(true, now);

    } else if (!pendingSince) {

      await setPendingDailyRotation(true, now);

    }

    schedulePendingDailyRotationAttempt();

  } else if (forceNext && pendingAlreadySet) {

    await clearPendingDailyRotation();

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
    await setWallpaperSelection(current);
  }

  if (current) {

    syncWallpaperStartupState(current, allowDailyRotation);

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

  } finally {

    if (recordStartupIdle) {

      const elapsedMs =
        startupIdleStart && typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now() - startupIdleStart
          : 0;

      recordIdleTaskPerf('startup:ensureDailyWallpaper', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:ensureDailyWallpaper end in', Math.round(elapsedMs), 'ms');

    }

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

const METADATA_GRID_PATCH_LIMIT = 12;

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
// FAVICON PERF CACHE (NEW)
// ==========================
const FAVICON_SIZE_PX = 48;
const FAVICON_NEGATIVE_TTL_MS = 10 * 60 * 1000;
const FAVICON_RESOLVED_CACHE_LIMIT = 300;
const MAX_CONCURRENT_FAVICON_TASKS = 6;
const FAVICON_CACHE_NAME = 'favicons-v1';
const FAVICON_OBSERVER_ROOT_MARGIN = '250px';
const FAVICON_OBSERVER_THRESHOLD = 0.01;

let faviconIntersectionObserver = null;

function debugFavicon(event, details) {
  // Handled in HomebaseFaviconPipeline
}

function setFaviconResolved(domainKey, url, options = {}) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setResolvedEntry === 'function') {
    return window.HomebaseFaviconPipeline.setResolvedEntry(domainKey, url, options);
  }
}

function getFaviconResolvedEntry(domainKey) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getResolvedEntry === 'function') {
    return window.HomebaseFaviconPipeline.getResolvedEntry(domainKey);
  }
  return null;
}

function getFaviconResolvedUrl(domainKey) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getResolvedUrl === 'function') {
    return window.HomebaseFaviconPipeline.getResolvedUrl(domainKey);
  }
  return null;
}

function notifyFaviconWaiters(domainKey, resolved) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.notifyWaiters === 'function') {
    return window.HomebaseFaviconPipeline.notifyWaiters(domainKey, resolved);
  }
}

function runNextFaviconTask() {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.runNextTask === 'function') {
    return window.HomebaseFaviconPipeline.runNextTask();
  }
}

function enqueueFaviconTask(task) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.enqueueTask === 'function') {
    return window.HomebaseFaviconPipeline.enqueueTask(task);
  }
  return Promise.resolve();
}

function getFaviconCache() {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getFaviconCache === 'function') {
    return window.HomebaseFaviconPipeline.getFaviconCache();
  }
  return typeof caches !== 'undefined' ? caches.open('favicons-v1') : null;
}

function cacheKeyFor(domainKey, size) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.cacheKeyFor === 'function') {
    return window.HomebaseFaviconPipeline.cacheKeyFor(domainKey, size);
  }
  return `/favicons/${domainKey}@${size || 48}`;
}

async function readIconFromCache(cacheKey) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.readIconFromCache === 'function') {
    return window.HomebaseFaviconPipeline.readIconFromCache(cacheKey);
  }
  return null;
}

async function writeIconToCache(cacheKey, response) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.writeIconToCache === 'function') {
    return window.HomebaseFaviconPipeline.writeIconToCache(cacheKey, response);
  }
  return false;
}

async function responseToObjectURL(response) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.responseToObjectURL === 'function') {
    return window.HomebaseFaviconPipeline.responseToObjectURL(response);
  }
  return '';
}

function xhrFetchBlob(url, timeoutMs = 8000) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.xhrFetchBlob === 'function') {
    return window.HomebaseFaviconPipeline.xhrFetchBlob(url, timeoutMs);
  }
  return Promise.resolve(null);
}

function blobToResponse(blob) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.blobToResponse === 'function') {
    return window.HomebaseFaviconPipeline.blobToResponse(blob);
  }
  return typeof Response !== 'undefined' ? new Response(blob) : null;
}

function setFaviconObjectUrlForImage(img, objectUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setObjectUrlForImage === 'function') {
    return window.HomebaseFaviconPipeline.setObjectUrlForImage(img, objectUrl);
  }
}

function revokeFaviconObjectUrl(img) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.revokeObjectUrl === 'function') {
    return window.HomebaseFaviconPipeline.revokeObjectUrl(img);
  }
}

function setFaviconImageSrc(img, url) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setImageSrc === 'function') {
    return window.HomebaseFaviconPipeline.setImageSrc(img, url);
  }
}

function loadFaviconObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.loadObjectUrlIntoImage === 'function') {
    return window.HomebaseFaviconPipeline.loadObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
  }
  return Promise.resolve({ accepted: false, aborted: false });
}

function testFaviconCandidateUrl(candidate, acceptCandidate) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.testCandidateUrl === 'function') {
    return window.HomebaseFaviconPipeline.testCandidateUrl(candidate, acceptCandidate);
  }
  return Promise.resolve(false);
}

function testFaviconCandidateObjectUrl(objectUrl, acceptCandidate) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.testCandidateObjectUrl === 'function') {
    return window.HomebaseFaviconPipeline.testCandidateObjectUrl(objectUrl, acceptCandidate);
  }
  return Promise.resolve(false);
}

function ensureFaviconObserver() {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.ensureObserver === 'function') {
    return window.HomebaseFaviconPipeline.ensureObserver();
  }
}

function queueFaviconResolution(img, resolveTask) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.queueResolution === 'function') {
    return window.HomebaseFaviconPipeline.queueResolution(img, resolveTask);
  }
}

function isValidFaviconTargetUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.isValidTargetUrl === 'function') {
    return window.HomebaseFaviconPipeline.isValidTargetUrl(rawUrl);
  }
  return false;
}

function getDomainKeyFromUrl(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getDomainKey === 'function') {
    return window.HomebaseFaviconPipeline.getDomainKey(rawUrl);
  }
  return '';
}

function buildFaviconCandidates(rawUrl) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.buildCandidates === 'function') {
    return window.HomebaseFaviconPipeline.buildCandidates(rawUrl);
  }
  return [];
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

// currentWallpaperSelection, wallpaperTypePreference, wallpaperQualityPreference extracted to wallpaper-controller.js
let dailyRotationPreference = true;
let initialWallpaperState = {};

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

// setNextWallpaperButtonLoading extracted to wallpaper-controller.js




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

// --- BOOKMARK EDITOR LAZY LOADING ---

// ===============================================

async function ensureBookmarkEditor() {
  await loadScriptOnce('assets/js/bookmark-editor.js');

  if (
    !window.HomebaseBookmarkEditor ||
    typeof window.HomebaseBookmarkEditor.openAddBookmark !== 'function'
  ) {
    throw new Error('HomebaseBookmarkEditor failed to load');
  }

  return window.HomebaseBookmarkEditor;
}

function createBookmarkEditorContext() {
  return {
    getActiveHomebaseFolderId: () => activeHomebaseFolderId,
    getRootDisplayFolderId: () => rootDisplayFolderId,
    getCurrentGridFolderNode: () => currentGridFolderNode,
    getBookmarkTreeState: () => bookmarkTree,
    getBookmarkMetadata: () => bookmarkMetadata,
    setBookmarkMetadata: (metadata) => { bookmarkMetadata = metadata || {}; },
    getFolderMetadata: () => folderMetadata,
    setFolderMetadata: (metadata) => { folderMetadata = metadata || {}; },
    isVirtualizerEnabled: () => Boolean(virtualizerState && virtualizerState.isEnabled),
    getBookmarkFolderColorPreference: () => appBookmarkFolderColorPreference,
    getBookmarkFallbackColorPreference: () => appBookmarkFallbackColorPreference,
    iconCategories: typeof ICON_CATEGORIES !== 'undefined' ? ICON_CATEGORIES : null,
    findBookmarkNodeById,
    updateNodeInTree,
    appendNodeToParent,
    getDefaultBookmarkParentId,
    getBookmarkTree,
    renderBookmarkGrid,
    loadBookmarks,
    findRenderedGridItemById,
    updateElementData,
    getFaviconUrlForRawUrl,
    getDomainKeyFromUrl,
    createSvgIconElement,
    tintSvgElement,
    getComplementaryColor,
    renderFolderIconInto,
    renderBookmarkIconInto,
    getIconKeyForNode,
    openBookmarkIconPicker,
    openModalWithAnimation,
    closeModalWithAnimation,
    openBookmarkEditorColorPicker,
    updateBookmark: (id, changes) => browser.bookmarks.update(id, changes),
    createBookmark: (details) => browser.bookmarks.create(details),
    createFolder: (details) => browser.bookmarks.create(details),
    updateFolder: (id, changes) => browser.bookmarks.update(id, changes),
    moveNode: (id, changes) => browser.bookmarks.move(id, changes),
    ...createBookmarkEditorStorageBridge(),
    setLastUsedFolderId
  };
}

function notifyBookmarkEditorLoadFailure(err) {
  console.warn('Failed to open bookmark editor', err);
  const message = 'Could not open the bookmark editor. Please try again.';
  if (typeof showCustomAlert === 'function') {
    showCustomAlert(message);
  } else {
    alert(message);
  }
}

async function callBookmarkEditorMethod(methodName, payload = {}, fallbackValue = null) {
  try {
    const editor = await ensureBookmarkEditor();
    const method = editor && editor[methodName];
    if (typeof method !== 'function') {
      throw new Error(`HomebaseBookmarkEditor.${methodName} is unavailable`);
    }

    return await method({
      ...payload,
      context: createBookmarkEditorContext()
    });
  } catch (err) {
    notifyBookmarkEditorLoadFailure(err);
    return fallbackValue;
  }
}

function showAddBookmarkModal() {
  return callBookmarkEditorMethod('openAddBookmark');
}

function showEditBookmarkModal(bookmarkId) {
  return callBookmarkEditorMethod('openEditBookmark', { bookmarkId });
}

function showAddFolderModal() {
  return callBookmarkEditorMethod('openAddFolder');
}

function showEditFolderModal(folderNode) {
  return callBookmarkEditorMethod('openEditFolder', { folderNode });
}

function openMoveBookmarkModal(itemId, isFolder) {
  return callBookmarkEditorMethod('openMoveDialog', { itemId, isFolder });
}

function showDeleteConfirm(message, options = {}) {
  return callBookmarkEditorMethod('openDeleteDialog', { ...options, message }, false);
}


// ===============================================

// --- BOOKMARKS ---

// ===============================================



let bookmarkTreeFetchPromise = null;

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

async function applyResolvedFaviconResult(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.applyResolvedFaviconResult === 'function') {
    return window.HomebaseFaviconPipeline.applyResolvedFaviconResult(options);
  }
}

async function resolveFaviconFromNetwork(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.resolveFaviconFromNetwork === 'function') {
    return window.HomebaseFaviconPipeline.resolveFaviconFromNetwork(options);
  }
  return null;
}

async function resolveFaviconForImageTarget(options) {
  if (window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.resolveForImageTarget === 'function') {
    return window.HomebaseFaviconPipeline.resolveForImageTarget(options);
  }
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
  imgIcon.decoding = 'async';
  imgIcon.loading = 'lazy';
  imgIcon.setAttribute('fetchpriority', 'low');
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

  wrapper.replaceChildren();
  const baseIcon = createSvgIconElement('bookmarkFolderLarge');
  if (baseIcon) {
    wrapper.appendChild(baseIcon);
  }

  

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

      const svgEl = createSvgIconElement(key);

      if (svgEl) {

        const iconDiv = document.createElement('div');

        iconDiv.className = 'bookmark-folder-custom-icon';

        iconDiv.appendChild(svgEl);

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

  perfState.gridMode = 'virtual';

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

function metadataEntriesEqual(previousEntry, nextEntry) {
  if (previousEntry === nextEntry) return true;
  if (!previousEntry || !nextEntry) return false;

  const previousKeys = Object.keys(previousEntry);
  const nextKeys = Object.keys(nextEntry);
  if (previousKeys.length !== nextKeys.length) return false;

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(nextEntry, key) || previousEntry[key] !== nextEntry[key]) {
      return false;
    }
  }

  return true;
}

function getChangedMetadataIds(previousMetadata, nextMetadata) {
  const previous = previousMetadata || {};
  const next = nextMetadata || {};
  const changedIds = new Set([
    ...Object.keys(previous),
    ...Object.keys(next)
  ]);

  return Array.from(changedIds).filter((id) => !metadataEntriesEqual(previous[id], next[id]));
}

function findRenderedGridItemById(itemId) {
  if (!bookmarksGridEl || !itemId) return null;

  const renderedItems = bookmarksGridEl.children;
  for (let i = 0; i < renderedItems.length; i++) {
    const item = renderedItems[i];
    if (item?.dataset?.bookmarkId === itemId) {
      return item;
    }
  }

  return null;
}

function patchActiveGridMetadataItems(activeNode, changedIds) {
  if (!activeNode || !Array.isArray(activeNode.children) || !changedIds.length) {
    return false;
  }

  const changedIdSet = new Set(changedIds);
  const relevantNodes = activeNode.children.filter((child) => child && changedIdSet.has(child.id));

  if (!relevantNodes.length) {
    return false;
  }

  if (relevantNodes.length > METADATA_GRID_PATCH_LIMIT) {
    return true;
  }

  for (const node of relevantNodes) {
    const itemEl = findRenderedGridItemById(node.id);

    if (!itemEl) {
      if (!virtualizerState.isEnabled) {
        return true;
      }
      continue;
    }

    try {
      updateElementData(itemEl, node);
    } catch (_) {
      return true;
    }
  }

  return false;
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

  if (itemsToRender.length > VIRTUALIZATION_THRESHOLD) {

    // --- VIRTUAL MODE ---
    initVirtualizer(itemsToRender);
    
    // NOTE: In virtual mode, we skip the "drop-in" animation for performance

  } else {

    // --- STANDARD MODE (Original Logic) ---
    const standardRenderStart =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;

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

    perfState.gridMode = 'standard';
    perfState.totalCount = itemsToRender.length;
    perfState.gridRenderedNodes = domItems.length;
    perfState.lastRenderedStartIndex = itemsToRender.length ? 0 : -1;
    perfState.lastRenderedEndIndex = itemsToRender.length ? itemsToRender.length - 1 : -1;
    perfState.lastVirtualRange = { start: -1, end: -1 };

    if (standardRenderStart) {
      perfState.lastGridRenderMs = performance.now() - standardRenderStart;
    } else {
      perfState.lastGridRenderMs = 0;
    }

    if (perfState.overlayEnabled) {
      updatePerfOverlay(false);
    }

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

  tabButton.style.display = 'none';



  const input = document.createElement('input');

  input.type = 'text';

  input.className = 'bookmark-folder-input bookmark-folder-rename-input';

  input.value = folderNode.title;

  const resizeFolderRenameInput = () => {
    const valueLength = Math.max(input.value.length, 6);
    const nextWidth = Math.min(Math.max(valueLength * 8 + 24, 110), 260);
    input.style.width = `${nextWidth}px`;
  };

  resizeFolderRenameInput();



  tabButton.parentNode.insertBefore(input, tabButton.nextSibling);



  input.focus();

  input.select();



  const cleanup = () => {

    input.remove();

    tabButton.style.display = '';

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



  input.addEventListener('input', resizeFolderRenameInput);

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

        let treePatched = false;
        if (bookmarkTree && bookmarkTree[0]) {
          treePatched = Boolean(updateNodeInTree(bookmarkTree[0], bookmarkNode.id, {
            title: newName
          }));
        }
        if (!treePatched) {
          await getBookmarkTree(true);
        }

        const updatedNode = bookmarkTree && bookmarkTree[0]
          ? findBookmarkNodeById(bookmarkTree[0], bookmarkNode.id)
          : null;

        if (updatedNode) {
          updateElementData(gridItem, updatedNode);
        }
        cleanup();

        

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

function setupBookmarkFolderAddTooltip(addButton, addTooltip) {
  if (!addButton || !addTooltip) return () => {};

  const resetTooltip = () => {
    addTooltip.style.position = '';
    addTooltip.style.left = '';
    addTooltip.style.top = '';
    addTooltip.style.transform = '';
    addTooltip.style.opacity = '';
    addTooltip.style.visibility = '';
    addTooltip.style.pointerEvents = '';
    addTooltip.style.zIndex = '';
    addTooltip.style.marginTop = '';
    addTooltip.style.marginBottom = '';
  };

  const showTooltip = () => {
    if (!document.body) return;

    const buttonRect = addButton.getBoundingClientRect();
    document.body.appendChild(addTooltip);
    addTooltip.hidden = false;
    addTooltip.style.position = 'fixed';
    addTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
    addTooltip.style.top = `${buttonRect.bottom + 10}px`;
    addTooltip.style.transform = 'translateX(-50%) translateY(6px)';
    addTooltip.style.opacity = '1';
    addTooltip.style.visibility = 'visible';
    addTooltip.style.pointerEvents = 'none';
    addTooltip.style.zIndex = '1000';
    addTooltip.style.marginTop = '0';
    addTooltip.style.marginBottom = '0';
  };

  const hideTooltip = () => {
    addTooltip.hidden = true;
    resetTooltip();
    if (addTooltip.parentElement !== addButton) {
      addButton.appendChild(addTooltip);
    }
  };

  addTooltip.hidden = true;
  addButton.addEventListener('mouseenter', showTooltip);
  addButton.addEventListener('focus', showTooltip);
  addButton.addEventListener('mouseleave', hideTooltip);
  addButton.addEventListener('blur', hideTooltip);

  return hideTooltip;
}

function createFolderTabs(homebaseFolder, activeFolderId = null) {

  const folderTabsWrapper = bookmarkFolderTabsContainer.closest('.bookmark-tabs-wrapper');

  const folderEditorHost = folderTabsWrapper?.closest('.bookmark-bar-wrapper') || folderTabsWrapper || bookmarkTabsTrack || bookmarkFolderTabsContainer.parentElement;

  if (folderEditorHost) {

    folderEditorHost.querySelectorAll('.bookmark-folder-inline-editor').forEach(editorElement => editorElement.remove());

    folderEditorHost.classList.remove('has-folder-inline-editor');

  }

  bookmarkFolderTabsContainer.replaceChildren();

  if (bookmarkTabsTrack && !activeFolderId) {

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



    tabButton.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isTabDragging) return;

      showEditInput(tabButton, folderNode);
    });

    

    // All manual 'draggable' and 'dragstart'/'dragend' listeners removed.

    

    bookmarkFolderTabsContainer.appendChild(tabButton);

  });

  if (bookmarkFolderTabsContainer._tabContextMenuHandler) {
    bookmarkFolderTabsContainer.removeEventListener('contextmenu', bookmarkFolderTabsContainer._tabContextMenuHandler);
  }

  const tabContextMenuHandler = (e) => {
    const tabButton = e.target.closest('.bookmark-folder-tab');
    if (!tabButton) return;
    if (!bookmarkFolderTabsContainer.contains(tabButton)) return;

    const folderId = tabButton.dataset.folderId;
    const folderNode = folderChildren.find(node => node.id === folderId) || findBookmarkNodeById(bookmarkTree[0], folderId);
    if (!folderNode) return;

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
  };

  bookmarkFolderTabsContainer.addEventListener('contextmenu', tabContextMenuHandler);
  bookmarkFolderTabsContainer._tabContextMenuHandler = tabContextMenuHandler;

  if (bookmarkFolderTabsContainer._tabClickHandler) {
    bookmarkFolderTabsContainer.removeEventListener('click', bookmarkFolderTabsContainer._tabClickHandler);
  }

  const tabClickHandler = (e) => {
    const tabButton = e.target.closest('.bookmark-folder-tab');
    if (!tabButton) return;
    if (isTabDragging) return;

    bookmarkFolderTabsContainer.querySelectorAll('.bookmark-folder-tab').forEach(btn => btn.classList.remove('active'));
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

  const addIcon = createSvgIconElement('bookmarkTabsPlus');
  if (addIcon) {
    addButton.appendChild(addIcon);
  }

  const addTooltip = document.createElement('span');
  addTooltip.className = 'tooltip-popup tooltip-bottom bookmark-folder-add-tooltip';
  addTooltip.textContent = 'Create New Folder';
  addButton.appendChild(addTooltip);
  const hideAddTooltip = setupBookmarkFolderAddTooltip(addButton, addTooltip);

  

  addButton.addEventListener('click', (e) => {

    e.stopPropagation();

    

    hideAddTooltip();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const addButtonFadeDuration = prefersReducedMotion ? 0 : 160;

    let cleanupStarted = false;

    let cleanupFinished = false;

    let pendingCleanupCallback = null;

    addButton.classList.add('is-editor-hidden');

    setTimeout(() => {

      if (!cleanupFinished && addButton.classList.contains('is-editor-hidden')) {

        addButton.style.display = 'none';

      }

    }, addButtonFadeDuration);



    const input = document.createElement('input');

    input.type = 'text';

    input.id = 'new-folder-input';

    input.className = 'bookmark-folder-input';

    input.value = 'New Folder';

    input.placeholder = 'Folder Name';



    const saveButton = document.createElement('button');

    saveButton.className = 'bookmark-folder-save-btn';

    saveButton.textContent = '✓ Save';
    saveButton.setAttribute('aria-label', 'Save folder');



    const cancelButton = document.createElement('button');

    cancelButton.className = 'bookmark-folder-cancel-btn';

    cancelButton.textContent = '× Cancel';
    cancelButton.setAttribute('aria-label', 'Cancel');

    const editor = document.createElement('div');

    editor.className = 'bookmark-folder-inline-editor';

    editor.append(input, saveButton, cancelButton);

    const editorExitDuration = prefersReducedMotion ? 0 : 160;

    function finishCleanup() {

      if (cleanupFinished) return;

      cleanupFinished = true;

      editor.classList.remove('is-visible', 'is-exiting');

      editor.remove();

      if (folderEditorHost) {

        folderEditorHost.classList.remove('has-folder-inline-editor');

      }

      addButton.style.display = 'flex';

      requestAnimationFrame(() => {

        addButton.classList.remove('is-editor-hidden');

      });

      const callback = pendingCleanupCallback;

      pendingCleanupCallback = null;

      if (typeof callback === 'function') {

        callback();

      }

    }

    function cleanup(afterCleanup) {

      if (typeof afterCleanup === 'function') {

        pendingCleanupCallback = afterCleanup;

      }

      if (cleanupStarted) return;

      cleanupStarted = true;

      editor.classList.remove('is-visible');

      editor.classList.add('is-exiting');

      if (editorExitDuration === 0) {

        finishCleanup();

        return;

      }

      editor.addEventListener('transitionend', (event) => {

        if (event.target === editor) {

          finishCleanup();

        }

      }, { once: true });

      setTimeout(finishCleanup, editorExitDuration);

    }

    let actionCompleted = false;
    const markActionComplete = () => {
      if (actionCompleted) return false;
      actionCompleted = true;
      return true;
    };

    const saveAction = () => {
      if (!markActionComplete()) return;

      const folderName = input.value.trim();

      if (folderName) {

        cleanup(() => {

          createNewBookmarkFolder(folderName);

        });

      } else {

        cleanup();

      }

    };

    const cancelAction = () => {
      if (!markActionComplete()) return;
      cleanup();
    };



    saveButton.addEventListener('mousedown', (e) => e.preventDefault());

    cancelButton.addEventListener('mousedown', (e) => e.preventDefault());

    saveButton.addEventListener('click', saveAction);

    cancelButton.addEventListener('click', cancelAction);



    input.addEventListener('keydown', (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        saveButton.click();

      } else if (e.key === 'Escape') {

        e.preventDefault();

        cancelAction();

      }

    });

    

    if (folderEditorHost) {

      folderEditorHost.appendChild(editor);

      folderEditorHost.classList.add('has-folder-inline-editor');

    } else {

      bookmarkFolderTabsContainer.insertAdjacentElement('afterend', editor);

    }

    requestAnimationFrame(() => {

      if (!cleanupStarted) {

        editor.classList.add('is-visible');

      }

    });

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

// --- MODIFIED: QUICK ACTIONS BAR SETUP ---

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
  document.body.classList.remove('grid-animation-enabled');
  let styleEl = document.getElementById('dynamic-grid-animation');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-grid-animation';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = '';
}

function disableGlassRuntime() {
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.disableGlassRuntime === 'function') {
    return window.HomebasePerformanceController.disableGlassRuntime();
  }
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
  if (typeof window !== 'undefined' && window.HomebasePerformanceController && typeof window.HomebasePerformanceController.enableGlassRuntimeFromPreference === 'function') {
    return window.HomebasePerformanceController.enableGlassRuntimeFromPreference(appGlassStylePreference);
  }
  document.documentElement.style.removeProperty('--glass-blur');
  document.documentElement.style.removeProperty('--glass-bg');
  document.documentElement.style.removeProperty('--overlay-blur');
  applyGlassStyle(appGlassStylePreference);
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

  document.body.classList.toggle('performance-mode', isOn);
  const perfToggle = document.getElementById('app-performance-mode-toggle');
  if (perfToggle) perfToggle.checked = isOn;
  if (isOn) {
    disableGridAnimationRuntime();
    disableGlassRuntime();
    cleanupBackgroundPlayback();
    clearBackgroundVideos();
  } else {
    enableGlassRuntimeFromPreference();
  }
}


function populateDefaultEngineSelectControl() {

  const activeEngines = searchEngines.filter((engine) => engine.enabled);

  const safeDefaultId = getSafeEnabledSearchEngineId(appSearchDefaultEnginePreference);

  const selectedId = activeEngines.some((engine) => engine.id === safeDefaultId)

    ? safeDefaultId

    : (activeEngines[0]?.id || '');

  if (selectedId) {

    appSearchDefaultEnginePreference = selectedId;

  }

  if (!appSearchDefaultEngineSelect) return selectedId;

  appSearchDefaultEngineSelect.innerHTML = '';

  activeEngines.forEach((engine) => {

    const option = document.createElement('option');

    option.value = engine.id;

    option.textContent = engine.name;

    appSearchDefaultEngineSelect.appendChild(option);

  });

  if (selectedId) {

    appSearchDefaultEngineSelect.value = selectedId;

  }

  return selectedId;

}



function updateDefaultEngineVisibilityControl() {

  populateDefaultEngineSelectControl();

  if (!appSearchDefaultEngineContainer) return;

  if (appSearchRememberEngineToggle && appSearchRememberEngineToggle.checked) {

    appSearchDefaultEngineContainer.style.display = 'none';

  } else {

    appSearchDefaultEngineContainer.style.display = 'flex';

  }

}



// ===============================================

// --- SEARCH BAR ---

// ===============================================

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

let activeSearchEngineId = currentSearchEngine ? currentSearchEngine.id : null;

let currentSelectionIndex = -1;

let currentSectionIndex = 0; // 0 = bookmarks, 1 = suggestions

let selectionExplicit = false;

let lastSelectedText = '';

let userIsTyping = false;

let latestSearchToken = 0;

let lastBookmarkHtml = '';

let lastSuggestionHtml = '';

let searchNavigationLocked = false;

let isBookmarkGridPointerOver = false;

let bookmarkGridPointerListenersAttached = false;

function buildSearchEngineIconContent(targetEl, engine) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.buildSearchEngineIconContent === 'function') {
    return window.HomebaseSearchUiController.buildSearchEngineIconContent(targetEl, engine);
  }
}

function ensureEngineIconExists(engine) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.ensureEngineIconExists === 'function') {
    return window.HomebaseSearchUiController.ensureEngineIconExists(engine);
  }
}

function updateSearchSelectorPosition() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.updateSearchSelectorPosition === 'function') {
    return window.HomebaseSearchUiController.updateSearchSelectorPosition();
  }
}

function renderSearchEngineSelector(options = {}) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.renderSearchEngineSelector === 'function') {
    return window.HomebaseSearchUiController.renderSearchEngineSelector(options);
  }
}

function populateSearchOptions(options = {}) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.populateSearchOptions === 'function') {
    return window.HomebaseSearchUiController.populateSearchOptions(options);
  }
}

function updateSearchUI(engineId, options = {}) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.updateSearchUI === 'function') {
    return window.HomebaseSearchUiController.updateSearchUI(engineId, options);
  }
}

function preconnectToSearchEngine(url) {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.preconnectToSearchEngine === 'function') {
    return window.HomebaseSearchUiController.preconnectToSearchEngine(url);
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
    await window.HomebaseSearchInteractionController.initialize();
  }

  const debouncedSearch = debounce(handleSearchInput, 120);
  window.addEventListener('beforeunload', () => {
    debouncedSearch.cancel?.();
  });

  if (searchForm) searchForm.addEventListener('submit', handleSearch);

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      userIsTyping = true;
      selectionExplicit = false;

      const selector = document.getElementById('search-engine-selector');
      if (selector) {
        selector.classList.remove('expanded');
        selector.classList.add('suppress-hover');
      }

      debouncedSearch(e);
    });

    searchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('keydown', handleSearchKeydown);
  setupBookmarkGridPointerTracking();

  if (searchResultsPanel) {
    searchResultsPanel.addEventListener('mousedown', handleSearchResultMouseDown, true);
    searchResultsPanel.addEventListener('click', handleSearchResultClick, true);
    searchResultsPanel.addEventListener('click', (e) => e.stopPropagation());
  }

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length > 1) return;
    if (searchInput) searchInput.focus();
  });
}

async function handleSearchChange() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleSearchChange === 'function') {
    return window.HomebaseSearchUiController.handleSearchChange();
  }
}



async function openSearchUrl(url, newTab) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.openSearchUrl === 'function') {
    return window.HomebaseSearchInteractionController.openSearchUrl(url, newTab);
  }
}

function executeSearch(query, engine, newTab) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.executeSearch === 'function') {
    return window.HomebaseSearchInteractionController.executeSearch(query, engine, newTab);
  }
}

function isSearchKeyboardContext(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isSearchKeyboardContext === 'function') {
    return window.HomebaseSearchInteractionController.isSearchKeyboardContext(event);
  }
  return false;
}

function isBookmarkGridScrollKey(key) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isBookmarkGridScrollKey === 'function') {
    return window.HomebaseSearchInteractionController.isBookmarkGridScrollKey(key);
  }
  return false;
}

function isSearchInputEmptyAndPassive() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isSearchInputEmptyAndPassive === 'function') {
    return window.HomebaseSearchInteractionController.isSearchInputEmptyAndPassive();
  }
  return false;
}

function getBookmarkScrollContainer() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getBookmarkScrollContainer === 'function') {
    return window.HomebaseSearchInteractionController.getBookmarkScrollContainer();
  }
  return null;
}

function isPointerOverBookmarkGrid() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isPointerOverBookmarkGrid === 'function') {
    return window.HomebaseSearchInteractionController.isPointerOverBookmarkGrid();
  }
  return false;
}

function scrollBookmarkGridForKey(key) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.scrollBookmarkGridForKey === 'function') {
    return window.HomebaseSearchInteractionController.scrollBookmarkGridForKey(key);
  }
}

function setupBookmarkGridPointerTracking() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.setupBookmarkGridPointerTracking === 'function') {
    return window.HomebaseSearchInteractionController.setupBookmarkGridPointerTracking();
  }
}

function getCurrentSectionItems(sectionIndex = currentSectionIndex) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getCurrentSectionItems === 'function') {
    return window.HomebaseSearchInteractionController.getCurrentSectionItems(sectionIndex);
  }
  return [];
}

function removeSelectionClasses() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.removeSelectionClasses === 'function') {
    return window.HomebaseSearchInteractionController.removeSelectionClasses();
  }
}

function clearAllSelections() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.clearAllSelections === 'function') {
    return window.HomebaseSearchInteractionController.clearAllSelections();
  }
}

function syncSearchInputWithItem(item) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.syncSearchInputWithItem === 'function') {
    return window.HomebaseSearchInteractionController.syncSearchInputWithItem(item);
  }
}

function getResultLabelText(item) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getResultLabelText === 'function') {
    return window.HomebaseSearchInteractionController.getResultLabelText(item);
  }
  return '';
}

function selectItem(items, index) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.selectItem === 'function') {
    return window.HomebaseSearchInteractionController.selectItem(items, index);
  }
}

function attachHoverSync() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.attachHoverSync === 'function') {
    return window.HomebaseSearchInteractionController.attachHoverSync();
  }
}

function moveSection(direction) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.moveSection === 'function') {
    return window.HomebaseSearchInteractionController.moveSection(direction);
  }
}

function getSelectedResult() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getSelectedResult === 'function') {
    return window.HomebaseSearchInteractionController.getSelectedResult();
  }
  return null;
}

function getSelectionSnapshot() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getSelectionSnapshot === 'function') {
    return window.HomebaseSearchInteractionController.getSelectionSnapshot();
  }
  return null;
}

function handleSearch(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleSubmit === 'function') {
    return window.HomebaseSearchInteractionController.handleSubmit(event);
  }
}

function handleSearchResultMouseDown(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleResultMouseDown === 'function') {
    return window.HomebaseSearchInteractionController.handleResultMouseDown(e);
  }
}

function handleSearchResultClick(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleResultClick === 'function') {
    return window.HomebaseSearchInteractionController.handleResultClick(e);
  }
}

function handleSearchKeydown(e) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleKeydown === 'function') {
    return window.HomebaseSearchInteractionController.handleKeydown(e);
  }
}

function restoreSelectionAfterFilter() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.restoreSelectionAfterFilter === 'function') {
    return window.HomebaseSearchInteractionController.restoreSelectionAfterFilter();
  }
  return false;
}

function maybeAutoSelectSuggestion(query) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.maybeAutoSelectSuggestion === 'function') {
    return window.HomebaseSearchInteractionController.maybeAutoSelectSuggestion(query);
  }
}

function applySelectionToCurrentResults(snapshot = null, query = '') {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.applySelectionToCurrentResults === 'function') {
    return window.HomebaseSearchInteractionController.applySelectionToCurrentResults(snapshot, query);
  }
}

function isStaleSearch(token, queryLower) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.isStaleSearch === 'function') {
    return window.HomebaseSearchInteractionController.isStaleSearch(token, queryLower);
  }
  return false;
}

function abortSuggestionFetch() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.abortSuggestionFetch === 'function') {
    return window.HomebaseSearchInteractionController.abortSuggestionFetch();
  }
}

function clearExternalSuggestionResults() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.clearExternalSuggestionResults === 'function') {
    return window.HomebaseSearchInteractionController.clearExternalSuggestionResults();
  }
}

function setSearchSuggestionsPreference(enabled) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.setSuggestionsPreference === 'function') {
    return window.HomebaseSearchInteractionController.setSuggestionsPreference(enabled);
  }
  appSearchSuggestionsPreference = enabled !== false;
  if (appSearchSuggestionsToggle) {
    appSearchSuggestionsToggle.checked = appSearchSuggestionsPreference;
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

async function loadSearchEnginePreferences() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.loadSearchEnginePreferences === 'function') {
    return window.HomebaseSearchUiController.loadSearchEnginePreferences();
  }
}



// Function to fetch suggestions
async function fetchSearchSuggestions(query, engine) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.fetchSuggestions === 'function') {
    return window.HomebaseSearchInteractionController.fetchSuggestions(query, engine);
  }
  return [];
}

function getBangSuggestions(query) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.getBangSuggestions === 'function') {
    return window.HomebaseSearchInteractionController.getBangSuggestions(query);
  }
  return [];
}

// Helper function to show/hide the main panel
function updatePanelVisibility() {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.updatePanelVisibility === 'function') {
    return window.HomebaseSearchInteractionController.updatePanelVisibility();
  }
}

function hydrateSearchResultFavicons(container) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.hydrateSearchResultFavicons === 'function') {
    return window.HomebaseSearchInteractionController.hydrateSearchResultFavicons(container);
  }
}

async function handleSearchInput(event) {
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.handleInput === 'function') {
    return window.HomebaseSearchInteractionController.handleInput(event);
  }
}

// ===============================================

// --- BACKGROUND VIDEO CROSSFADE ---

// ===============================================

function setupBackgroundVideoCrossfade() {
  if (isPerformanceModeEnabled()) {
    cleanupBackgroundPlayback();
    return false;
  }
  const videos = Array.from(document.querySelectorAll('.background-video'));
  if (videos.length < 2) return false;

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
  let firstActiveMarked = false;

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
        if (!firstActiveMarked) {
          firstActiveMarked = true;
          recordStartupPerfEvent('newtab:video-first-active', { transition: !!enableTransition });
        }
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

  return true;
}



// ===============================================

// --- DOCK NAVIGATION ---

// ===============================================

// ===============================================

// --- FIREFOX CONTAINER LOGIC ---

// ===============================================



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
    folderContextMenu.classList.add('hidden');
    gridFolderMenu.classList.add('hidden');
    iconContextMenu.classList.add('hidden');
    if (gridBlankMenu) {
      gridBlankMenu.classList.add('hidden');
    }
  };

  const positionContextMenuInViewport = (menuEl, clientX, clientY, opts = {}) => {
    if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.reposition === 'function') {
      return window.HomebaseContextMenuController.reposition(menuEl, clientX, clientY, opts);
    }
    if (!menuEl) return;
    ensureMenuMountedToBody(menuEl);
    const margin = Number.isFinite(opts.margin) ? opts.margin : 8;
    const docEl = document.documentElement;
    const viewportWidth = (docEl && docEl.clientWidth) || window.innerWidth || 0;
    const viewportHeight = (docEl && docEl.clientHeight) || window.innerHeight || 0;
    const wasHidden = menuEl.classList.contains('hidden');
    const prevVisibility = menuEl.style.visibility;
    const prevDisplay = menuEl.style.display;
    const prevPointerEvents = menuEl.style.pointerEvents;
    if (wasHidden) menuEl.classList.remove('hidden');
    menuEl.style.visibility = 'hidden';
    menuEl.style.pointerEvents = 'none';
    const computedDisplay = window.getComputedStyle(menuEl).display;
    if (computedDisplay === 'none') menuEl.style.display = 'flex';
    const rect = menuEl.getBoundingClientRect();
    const menuWidth = rect.width || 0;
    const menuHeight = rect.height || 0;
    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
    const left = Math.min(Math.max(clientX, margin), maxLeft);
    const top = Math.min(Math.max(clientY, margin), maxTop);
    menuEl.style.visibility = prevVisibility;
    menuEl.style.display = prevDisplay;
    menuEl.style.pointerEvents = prevPointerEvents;
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
    if (opts.show === true) {
      menuEl.classList.remove('hidden');
    } else if (wasHidden) {
      menuEl.classList.add('hidden');
    }
  };

  if (typeof window !== 'undefined' && window.HomebaseDialogController && typeof window.HomebaseDialogController.initialize === 'function') {
    window.HomebaseDialogController.initialize();
  }
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.initialize === 'function') {
    window.HomebaseContextMenuController.initialize();
  }

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



        positionContextMenuInViewport(targetMenu, e.clientX, e.clientY, { show: true });

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

      positionContextMenuInViewport(gridBlankMenu, e.clientX, e.clientY, { show: true });

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

    if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {

      const nextSelection = changes[WALLPAPER_SELECTION_KEY]
        ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
        : currentWallpaperSelection;
      const allowDailyRotation = changes[DAILY_ROTATION_KEY]
        ? changes[DAILY_ROTATION_KEY].newValue !== false
        : dailyRotationPreference !== false;

      syncWallpaperStartupState(nextSelection, allowDailyRotation);

    }



    if (changes[APP_SEARCH_REMEMBER_ENGINE_KEY]) {

      appSearchRememberEnginePreference = changes[APP_SEARCH_REMEMBER_ENGINE_KEY].newValue !== false;

      if (!appSearchRememberEnginePreference) {

        updateSearchUI(appSearchDefaultEnginePreference, { updateFastCache: true });

      }

    }

    if (changes[APP_SEARCH_DEFAULT_ENGINE_KEY]) {

      const requestedDefaultEngineId = changes[APP_SEARCH_DEFAULT_ENGINE_KEY].newValue || 'google';

      const previousDefaultEngineId = appSearchDefaultEnginePreference;

      const safeDefaultEngineId = getSafeEnabledSearchEngineId(requestedDefaultEngineId);

      appSearchDefaultEnginePreference = safeDefaultEngineId;

      populateDefaultEngineSelectControl();

      if (safeDefaultEngineId !== requestedDefaultEngineId) {
        setDefaultSearchEngineId(safeDefaultEngineId);
      }

      if (!appSearchRememberEnginePreference) {
        const defaultEngine = searchEngines.find((engine) => engine.id === safeDefaultEngineId);
        if (!currentSearchEngine || currentSearchEngine.id === previousDefaultEngineId) {
          updateSearchUI(safeDefaultEngineId, { updateFastCache: true, animate: false });
        } else {
          writeFastSearchCache(defaultEngine);
        }
      }
    }

    if (changes[APP_SEARCH_SUGGESTIONS_KEY]) {
      setSearchSuggestionsPreference(changes[APP_SEARCH_SUGGESTIONS_KEY].newValue !== false);
    }

    if (changes[SEARCH_ENGINES_PREF_KEY]) {
      const newConfig = changes[SEARCH_ENGINES_PREF_KEY].newValue;
      if (applySearchEngineConfig(newConfig)) {
        const previousEngineId = currentSearchEngine ? currentSearchEngine.id : null;
        const previousEngineStillEnabled = Boolean(previousEngineId && searchEngines.find((engine) => engine.id === previousEngineId && engine.enabled));
        const previousDefaultEngineId = appSearchDefaultEnginePreference;
        const defaultEngineId = populateDefaultEngineSelectControl();
        if (defaultEngineId && previousDefaultEngineId !== defaultEngineId) {
          setDefaultSearchEngineId(defaultEngineId);
        }

        const targetEngineId = getSafeEnabledSearchEngineId(previousEngineId);
        populateSearchOptions({ animate: false });
        updateSearchUI(targetEngineId, { updateFastCache: appSearchRememberEnginePreference, animate: false });

        if (appSearchRememberEnginePreference && !previousEngineStillEnabled) {
          setCurrentSearchEngine(targetEngineId);
        }

        if (!appSearchRememberEnginePreference) {

          const startupEngineId = defaultEngineId || getSafeEnabledSearchEngineId(appSearchDefaultEnginePreference);

          const startupEngine = searchEngines.find((engine) => engine.id === startupEngineId) || currentSearchEngine;

          writeFastSearchCache(startupEngine);

        }

      }

    }



    if (changes.currentSearchEngineId) {

      const newId = changes.currentSearchEngineId.newValue;

      if (appSearchRememberEnginePreference && newId && newId !== currentSearchEngine.id) {

        updateSearchUI(newId, { updateFastCache: true, animate: false });

      }

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






































// Placeholder: alternate button shuffles through manifest in current view





















async function loadWallpaperTypePreference() {

  wallpaperTypePreference = await getWallpaperTypePreferenceStorage();

  if (wallpaperTypeToggle) {

    wallpaperTypeToggle.checked = wallpaperTypePreference === 'video';

  }

  if (appWallpaperTypeSelect) {
    appWallpaperTypeSelect.value = wallpaperTypePreference;
  }

  return wallpaperTypePreference;

}



async function loadCurrentWallpaperSelection() {

  try {

    const selection = await getWallpaperSelection();

    currentWallpaperSelection = await hydrateWallpaperSelection(selection);

  } catch (err) {

    currentWallpaperSelection = null;

  }

  return currentWallpaperSelection;

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

  await setWallpaperTypePreferenceStorage(next);



  // Re-apply current wallpaper with the new mode if available

  try {

    const storedSelection = await getWallpaperSelection();

    let selection = storedSelection || currentWallpaperSelection;

    if (!selection) {

      const selectedAt = await getWallpaperFallbackUsedAt() || Date.now();

      selection = buildFallbackSelection(selectedAt);

      await setWallpaperSelectionWithFallback(selection, selectedAt);

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

  const cleanupDetails = {
    videoUrl: currentSelection && currentSelection.videoUrl,
    videoCacheKey: currentSelection && currentSelection.videoCacheKey,
    cacheEntries: Array.from(wallpaperObjectUrlCache.entries())
  };
  recordObjectUrlCleanup(cleanupDetails);

  if (DEBUG_HOMEBASE_LOGS) {
    try {
      console.debug('cleanupUnusedObjectUrls', cleanupDetails);
    } catch (_) {}
  }

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

  const videoStartSequence = ++wallpaperVideoStartSequence;



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
    recordPerformanceModeVideoSkipped();
    recordStartupPerfEvent('newtab:wallpaper-poster-applied', {
      source: poster ? 'performance-mode-poster' : 'performance-mode-none'
    });
    lastAppliedWallpaper = {
      id: selection.id || null,
      poster,
      video,
      type: finalType
    };
    updateSettingsPreview(selection, finalType);
    return;
  }

  const appliedImmediateVideoPoster = finalType === 'video' && !!poster;

  if (appliedImmediateVideoPoster) {
    applyWallpaperBackground(poster);
    recordStartupPerfEvent('newtab:wallpaper-poster-applied', { source: poster ? 'poster' : 'none' });
  }


  if (!unchanged) {
    const applyWallpaperFlow = () => {
      const current = currentWallpaperSelection || null;

      if (
        videoStartSequence !== wallpaperVideoStartSequence ||
        !current ||
        (current.id || null) !== (selection.id || null) ||
        (current.posterUrl || '') !== poster ||
        (finalType === 'video' && (current.videoUrl || '') !== video)
      ) {
        return;
      }

      // Stop any existing playback loop/listeners before starting new video logic.
      cleanupBackgroundPlayback();

      if (!appliedImmediateVideoPoster) {
        applyWallpaperBackground(poster);
      }

      if (finalType === 'video' && video) {
        const sourceLoadPromise = setBackgroundVideoSources(video, poster);
        startBackgroundVideosAfterSourceLoad(sourceLoadPromise, videoStartSequence, selection, finalType, poster, video);
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

    if (finalType === 'video') {
      runAfterNextPaint(applyWallpaperFlow);
    } else if (poster) {
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

      const sourceLoadPromise = setBackgroundVideoSources(video, poster);
      startBackgroundVideosAfterSourceLoad(sourceLoadPromise, videoStartSequence, selection, finalType, poster, video);

    }

  }



  updateSettingsPreview(selection, finalType);

}



function clearBackgroundVideos() {
  backgroundVideoSourceLoadGeneration += 1;
  backgroundVideoCrossfadeSetupKey = '';

  const videos = Array.from(document.querySelectorAll('.background-video'));

  videos.forEach((v) => {

    try { v.pause(); } catch (e) {}

    const source = v.querySelector('source');

    if (source) source.src = '';

    v.removeAttribute('src');

    v.removeAttribute('poster');

    v.load();

    v.classList.remove('is-active');
    v.classList.remove('with-transition');
    v.classList.remove('on-top');

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

  if (
    window.HomebaseGallery &&
    typeof window.HomebaseGallery.refresh === 'function'
  ) {
    window.HomebaseGallery.refresh({
      context: createGalleryContext(),
      selection,
      type
    });
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
