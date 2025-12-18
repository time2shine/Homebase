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

const WALLPAPER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const WALLPAPER_FALLBACK_USED_KEY = 'wallpaperFallbackUsedAt';

const WALLPAPER_CACHE_NAME = 'wallpaper-assets';

const USER_WALLPAPER_CACHE_PREFIX = 'https://user-wallpapers.local/';

const REMOTE_VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

const VIDEOS_JSON_URL = 'https://pub-d330ac9daa80435c82f1d50b5e43ca72.r2.dev/videos.json';
const VIDEOS_JSON_CACHE_KEY = 'videosManifest';
const VIDEOS_JSON_FETCHED_AT_KEY = 'videosManifestFetchedAt';
const VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const GALLERY_POSTERS_CACHE_KEY = 'cachedGalleryPosters';

let videosManifestPromise = null;

const isRemoteHttpUrl = (url = '') => typeof url === 'string' && /^https?:\/\//i.test(url);

const isRemoteVideoUrl = (url = '') => isRemoteHttpUrl(url) && REMOTE_VIDEO_REGEX.test(url);

const runWhenIdle = (cb) => {

  if ('requestIdleCallback' in window) {

    requestIdleCallback(cb, { timeout: 500 });

  } else {

    setTimeout(cb, 50);

  }

};

let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };

// --- Global Controller for Video Events ---
let videoPlaybackController = null;

function cleanupBackgroundPlayback() {

  // 1. Send the "Abort" signal to kill all active video listeners immediately
  if (videoPlaybackController) {

    videoPlaybackController.abort();

    videoPlaybackController = null;

  }

  // 2. Pause videos to stop CPU usage
  const videos = document.querySelectorAll('.background-video');

  videos.forEach(v => {

    v.pause();

    v.classList.remove('is-active');

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

  runWhenIdle(() => {

    cacheAppliedWallpaperPoster(poster, posterCacheKey).catch(() => {});

  });

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

  if (!bookmarkTabsTrack || !tabScrollLeftBtn || !tabScrollRightBtn) return;



  const maxScrollLeft = Math.max(0, bookmarkTabsTrack.scrollWidth - bookmarkTabsTrack.clientWidth);

  const currentScroll = bookmarkTabsTrack.scrollLeft;

  const showLeft = maxScrollLeft > 0 && currentScroll > 4;

  const showRight = maxScrollLeft > 0 && currentScroll < (maxScrollLeft - 4);



  tabScrollLeftBtn.classList.toggle('visible', showLeft);

  tabScrollRightBtn.classList.toggle('visible', showRight);

}



/**

 * Scrolls the folder tab row by a fixed amount in the given direction.

 */

function scrollBookmarkTabs(direction) {

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

    runWhenIdle(() => cacheGalleryPosters(manifest));

    return manifest;

  }

  const fetched = await fetchVideosManifestIfNeeded();

  runWhenIdle(() => cacheGalleryPosters(fetched));

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



async function cacheGalleryPosters(manifest = []) {

  const posters = Array.from(new Set(

    manifest

      .map(v => v.posterUrl || v.poster)

      .filter(Boolean)

  ));

  if (!posters.length) return;

  try {

    const stored = await browser.storage.local.get(GALLERY_POSTERS_CACHE_KEY);

    const existing = stored[GALLERY_POSTERS_CACHE_KEY] || {};

    const missing = posters.filter(url => !existing[url]);

    if (!missing.length) return;

    const newlyCached = {};

    for (const url of missing) {

      try {

        const res = await fetch(url, { cache: 'force-cache' });

        const blob = await res.blob();

        const dataUrl = await new Promise((resolve, reject) => {

          const reader = new FileReader();

          reader.onload = () => resolve(reader.result);

          reader.onerror = reject;

          reader.readAsDataURL(blob);

        });

        newlyCached[url] = dataUrl;

      } catch (e) {

        // Ignore individual poster failures
      }

    }

    if (Object.keys(newlyCached).length) {

      await browser.storage.local.set({

        [GALLERY_POSTERS_CACHE_KEY]: { ...existing, ...newlyCached }

      });

    }

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



async function cacheUserWallpaperFile(cacheKey, file, mimeType = '') {

  const normalizedKey = normalizeWallpaperCacheKey(cacheKey);

  try {

    const cache = await caches.open(WALLPAPER_CACHE_NAME);

    await cache.put(normalizedKey, new Response(file, {

      headers: {

        'content-type': mimeType || file.type || 'application/octet-stream'

      }

    }));

  } catch (err) {

    console.warn('Failed to store wallpaper upload in cache', cacheKey, err);

  }

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



async function hydrateManifestPosters(manifest = []) {
  return Array.isArray(manifest) ? manifest : [];
}

async function prefetchGalleryPosters() {
  return [];
}

async function warmGalleryPosterHydration() {

  if (galleryHydrationWarmPromise) return galleryHydrationWarmPromise;

  galleryHydrationWarmPromise = (async () => {

    try {

      const manifest = await getVideosManifest();

      const manifestList = Array.isArray(manifest) ? manifest : [];

      await hydrateManifestPosters(manifestList);

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

        if (!isRemoteVideoUrl(url)) return null;

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

    // Prefer a persistent URL (not a blob) for fast-load storage.
    let urlToStore = posterUrl;
    if (posterUrl.startsWith('blob:')) {
      if (posterCacheKey && !posterCacheKey.startsWith('blob:')) {
        urlToStore = posterCacheKey;
      } else {
        // Without a persistent key, we cannot store a stable URL for preload.
        return;
      }
    }

    if (urlToStore && !urlToStore.startsWith('data:') && !urlToStore.startsWith('blob:')) {
      cacheAsset(urlToStore).catch(() => {});
    }

    await browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: urlToStore });
    try {
      if (window.localStorage) {
        localStorage.setItem('cachedAppliedPosterUrl', urlToStore);
      }
    } catch (e) {}

    // Optionally store a small data URL for instant paint if size is reasonable
    try {
      const blob = await resolvePosterBlob(urlToStore, posterCacheKey || posterUrl);
      if (blob && blob.size > 0 && blob.size < 250 * 1024) {
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) {
          await browser.storage.local.set({ [CACHED_APPLIED_POSTER_DATA_URL_KEY]: dataUrl });
          if (window.localStorage) {
            localStorage.setItem('cachedAppliedPosterDataUrl', dataUrl);
          }
        }
      } else {
        await browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
        if (window.localStorage) {
          localStorage.removeItem('cachedAppliedPosterDataUrl');
        }
      }
    } catch (e) {
      // If snapshot fails, skip storing data URL
    }
  } catch (err) {
    console.warn('Failed to cache applied wallpaper poster', err);
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



function readFileAsDataUrl(file) {

  return new Promise((resolve) => {

    try {

      const reader = new FileReader();

      reader.onload = (e) => resolve(e.target && e.target.result ? e.target.result : '');

      reader.onerror = () => resolve('');

      reader.readAsDataURL(file);

    } catch (err) {

      console.warn('Failed to read file as data URL', err);

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



  if (hydrated.videoCacheKey) {
    const cachedVideo = await getCachedObjectUrl(hydrated.videoCacheKey);
    if (cachedVideo) {
      hydrated.videoUrl = cachedVideo;
    }
  }

  if (hydrated.posterCacheKey) {
    const cachedPoster = await getCachedObjectUrl(hydrated.posterCacheKey);
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



  await cacheAsset(entry.poster);



  const selection = {

    id: entry.id,

    videoUrl: entry.url,

    videoCacheKey: entry.url || '',

    posterUrl: entry.poster,

    posterCacheKey: entry.poster || '',

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



async function ensureDailyWallpaper(forceNext = false) {

  const stored = await browser.storage.local.get([WALLPAPER_SELECTION_KEY, WALLPAPER_FALLBACK_USED_KEY, DAILY_ROTATION_KEY]);

  const now = Date.now();

  const storedFallbackUsedAt = stored[WALLPAPER_FALLBACK_USED_KEY] || 0;



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



  const isFresh = current && now - (current.selectedAt || 0) < WALLPAPER_TTL_MS;

  const allowDailyRotation = stored[DAILY_ROTATION_KEY] !== false;

  const fallbackFresh = fallbackUsedAt && now - fallbackUsedAt < WALLPAPER_TTL_MS;

  const isFallbackSelection = current && current.id === 'fallback';



  if (isFallbackSelection && fallbackFresh && !forceNext) {

    const type = await getWallpaperTypePreference();

    await ensurePlayableSelection(current);

    applyWallpaperByType(current, type);

    return;

  }



  const manifest = await getVideosManifest();



  const shouldPickNext = forceNext || (!isFresh && allowDailyRotation);

  if (shouldPickNext) {

    const nextSelection = await pickNextWallpaper(manifest);

    if (nextSelection) {

      current = nextSelection;

      currentWallpaperSelection = nextSelection;

    }

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

    runWhenIdle(() => cacheAppliedWallpaperVideo(hydratedSelection));

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

updateSidebarCollapseState();

updateBookmarkTabOverflow();



if (tabScrollLeftBtn) {

  tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));

}

if (tabScrollRightBtn) {

  tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));

}

if (bookmarkTabsTrack) {

  bookmarkTabsTrack.addEventListener('scroll', () => {

    window.requestAnimationFrame(updateBookmarkTabOverflow);

  });

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
  // Cache the last rendered range to avoid DOM thrashing
  lastStart: -1,
  lastEnd: -1
};

let sortableTimeout = null;



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

const appMaxTabsSelect = document.getElementById('app-max-tabs-select');

const appAutoCloseSelect = document.getElementById('app-autoclose-select');

const appSearchOpenNewTabToggle = document.getElementById('app-search-open-new-tab-toggle');

const appSearchRememberEngineToggle = document.getElementById('app-search-remember-engine-toggle');

const appSearchMathToggle = document.getElementById('app-search-math-toggle');

const appSearchHistoryToggle = document.getElementById('app-search-history-toggle');

const appSearchDefaultEngineContainer = document.getElementById('app-search-default-engine-container');

const appSearchDefaultEngineSelect = document.getElementById('app-search-default-engine-select');

const NEXT_WALLPAPER_TOOLTIP_DEFAULT = nextWallpaperBtn?.getAttribute('aria-label') || 'Next Wallpaper';

const NEXT_WALLPAPER_TOOLTIP_LOADING = 'Downloading...';

const wallpaperTypeToggle = document.getElementById('gallery-wallpaper-type-toggle');

const galleryDailyToggle = document.getElementById('gallery-daily-toggle');

const FAVORITES_KEY = 'galleryFavorites';

const DAILY_ROTATION_KEY = 'dailyWallpaperEnabled';

const WALLPAPER_TYPE_KEY = 'wallpaperTypePreference';

const MY_WALLPAPERS_KEY = 'myWallpapers';

const APP_TIME_FORMAT_KEY = 'appTimeFormatPreference';

const APP_SHOW_SIDEBAR_KEY = 'appShowSidebar';

const APP_SHOW_WEATHER_KEY = 'appShowWeather';

const APP_SHOW_QUOTE_KEY = 'appShowQuote';

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

const BOOKMARK_META_KEY = 'bookmarkCustomMetadata';
const FOLDER_META_KEY = 'folderCustomMetadata';
const DOMAIN_ICON_MAP_KEY = 'domainIconMap';
const LAST_USED_BOOKMARK_FOLDER_KEY = 'lastUsedBookmarkFolderId';
const DOMAIN_ICON_MAP_LIMIT = 200;

let bookmarkMetadata = {};
let pendingBookmarkMeta = {};

let folderMetadata = {};

let pendingFolderMeta = {};

let galleryManifest = [];

let galleryActiveFilterValue = 'all';

let galleryActiveTag = null;

let gallerySection = 'gallery'; // gallery | favorites | my-wallpapers | settings (future)

const GALLERY_BATCH_SIZE = 24;

let galleryRenderQueue = [];

let galleryRenderIndex = 0;

let galleryLoadMoreObserver = null;

let myWallpapersRenderQueue = [];

let myWallpapersRenderIndex = 0;

let myWallpapersLoadMoreObserver = null;

const MY_WALLPAPERS_BATCH_SIZE = 24;

let galleryFavorites = new Set();

let currentWallpaperSelection = null;

let wallpaperTypePreference = null; // 'video' | 'static'

let myWallpapers = [];

let myWallpaperMediaObserver = null;

let timeFormatPreference = '12-hour';

let appShowSidebarPreference = true;

let appShowWeatherPreference = true;

let appShowQuotePreference = true;

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

let appBatteryOptimizationPreference = false;

let appCinemaModePreference = false;

const galleryFooterButtons = document.querySelectorAll('.gallery-footer-btn');

const galleryGridContainer = document.getElementById('gallery-grid');

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

const faviconUrlCache = new Map();

let bookmarkModalEscBound = false;

let bookmarkModalBound = false;

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

  addBookmarkModal.addEventListener('click', (e) => {

    if (e.target === addBookmarkModal) {

      hideAddBookmarkModal();

    }

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

  const domain = getDomainFromUrl(urlVal);

  if (domain) {
    const faviconUrl = faviconUrlCache.get(domain) || `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`;
    if (!faviconUrlCache.has(domain)) {
      faviconUrlCache.set(domain, faviconUrl);
    }

    const existingImg = bookmarkIconPreview.querySelector('img');
    if (existingImg) {
      bookmarkIconPreview.textContent = '';
      bookmarkIconPreview.style.color = '';
      bookmarkIconPreview.style.fontSize = '';
      bookmarkIconPreview.style.backgroundColor = '';
      if (existingImg.src !== faviconUrl) {
        existingImg.src = faviconUrl;
      }
      lastPreviewDomain = domain;
      return;
    }

    bookmarkIconPreview.innerHTML = '';
    bookmarkIconPreview.textContent = '';
    bookmarkIconPreview.style.color = '';
    bookmarkIconPreview.style.fontSize = '';
    bookmarkIconPreview.style.backgroundColor = '';

    const img = document.createElement('img');
    img.src = faviconUrl;
    bookmarkIconPreview.appendChild(img);
    lastPreviewDomain = domain;
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

      let w = img.width;

      let h = img.height;

      if (w > h) {

        if (w > MAX_SIZE) {

          h *= MAX_SIZE / w;

          w = MAX_SIZE;

        }

      } else {

        if (h > MAX_SIZE) {

          w *= MAX_SIZE / h;

          h = MAX_SIZE;

        }

      }

      canvas.width = w;

      canvas.height = h;

      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0, w, h);

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



  const domain = getDomainFromUrl(urlVal);
  if (!domain) {
    validateBookmarkModalInputs();
    return;
  }

  setBookmarkModalBusy(true);

  const controller = new AbortController();
  bookmarkGetAbortController = controller;


  const googleApiUrl = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`;



  try {

    const resp = await fetch(googleApiUrl, { signal: controller.signal });

    if (!resp.ok) throw new Error('Icon fetch failed');

    const blob = await resp.blob();

    const reader = new FileReader();

    reader.onloadend = () => {

      delete pendingBookmarkMeta.iconCleared;
      pendingBookmarkMeta.icon = reader.result;

      userExplicitlySetIconThisSession = true;

      storeIconForDomain(domain, reader.result);

      updateBookmarkModalPreview();
      validateBookmarkModalInputs();

    };

    reader.readAsDataURL(blob);

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

function showEditFolderIconPrompt(text = 'Saved icon found for this folder.') {
  if (!editFolderIconPrompt) return;
  if (editFolderIconPromptText) {
    editFolderIconPromptText.textContent = text;
  }
  editFolderIconPrompt.classList.remove('hidden');
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


/**
 * OPTIMIZATION: Background Cache Warming
 * Silently pre-loads favicons for all bookmarks when the CPU is idle.
 * This ensures that when you scroll down, images are already in the
 * browser cache and render instantly without flashing.
 */
function warmFaviconCache(nodes) {
  const uniqueDomains = new Set();

  const traverse = (list) => {
    list.forEach(node => {
      if (node.url) {
        try {
          const domain = new URL(node.url).hostname;
          if (domain && domain.includes('.')) {
            uniqueDomains.add(domain);
          }
        } catch (e) {
          // Ignore malformed URLs
        }
      }
      if (node.children) traverse(node.children);
    });
  };

  traverse(nodes);

  const domains = Array.from(uniqueDomains);
  let index = 0;

  function processChunk(deadline) {
    while (index < domains.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      const domain = domains[index++];
      const img = new Image();
      img.src = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`;
    }

    if (index < domains.length) {
      requestIdleCallback(processChunk);
    } else {
      console.log('Favicon cache warming complete.');
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(processChunk);
  } else {
    setTimeout(() => processChunk({ timeRemaining: () => 50, didTimeout: true }), 2000);
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

 * Handles moving a bookmark and refreshing the UI

 * This function is now the single source of truth for UI updates after a D&D.

 */

async function moveBookmark(id, destination) {

  try {

    await browser.bookmarks.move(id, destination);

    

    // Re-fetch the entire bookmark tree (deduped)

    const newTree = await getBookmarkTree(true);



    // Find the node for the currently displayed grid

    const activeGridNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);

    

    if (activeGridNode) {

      // Re-render the *current* grid, passing the ID of the

      // item that was just moved so it doesn't animate.

      renderBookmarkGrid(activeGridNode, id); 

    } else {

      // Fallback if the active folder itself was moved/deleted.

      console.warn("Could not find active grid node after move. Reloading main bookmarks.");

      loadBookmarks(activeHomebaseFolderId);

    }

    

  } catch (err) {

    console.error("Error moving bookmark:", err);

    // On error, just re-render the old node to reset.

    if (currentGridFolderNode) {

      renderBookmarkGrid(currentGridFolderNode, id);

    }

  }

}



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

    onEnd: handleTabDrop,

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



function renderBookmark(bookmarkNode) {
  const item = document.createElement('div');
  item.className = 'bookmark-item';
  if (bookmarkNode.isBackButton) item.classList.add('back-button');

  item.dataset.bookmarkId = bookmarkNode.id;
  item.dataset.isFolder = 'false';

  const title = bookmarkNode.title || ' ';
  const fallbackLetter = (title.trim().charAt(0) || '?').toUpperCase();

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bookmark-icon-wrapper';

  const meta = (bookmarkMetadata && bookmarkMetadata[bookmarkNode.id]) || {};

  // --- NEW: Check for Custom Icon ---
  if (meta && meta.icon) {
    const customImg = document.createElement('img');
    customImg.className = 'bookmark-img';
    customImg.alt = '';
    customImg.onload = () => {
      customImg.classList.add('loaded');
      iconWrapper.style.backgroundColor = 'transparent';
    };
    customImg.onerror = () => {
      customImg.remove();
      const fallbackIcon = document.createElement('div');
      fallbackIcon.className = 'bookmark-fallback-icon show-fallback';
      fallbackIcon.textContent = fallbackLetter;
      iconWrapper.appendChild(fallbackIcon);
      iconWrapper.style.backgroundColor = appBookmarkFallbackColorPreference || '#00b8d4';
    };
    customImg.src = meta.icon;
    iconWrapper.appendChild(customImg);
  } else if (meta && meta.iconCleared === true) {
    const fallbackIcon = document.createElement('div');
    fallbackIcon.className = 'bookmark-fallback-icon show-fallback';
    fallbackIcon.textContent = fallbackLetter;
    iconWrapper.appendChild(fallbackIcon);
    iconWrapper.style.backgroundColor = appBookmarkFallbackColorPreference || '#00b8d4';
  } else {
    // 1. Prepare fallback letter icon and render it immediately so it shows first.
    const fallbackIcon = document.createElement('div');
    fallbackIcon.className = 'bookmark-fallback-icon';
    fallbackIcon.textContent = fallbackLetter;
    iconWrapper.appendChild(fallbackIcon);

    // 2. Prepare image icon (stacked above fallback).
    const imgIcon = document.createElement('img');
    imgIcon.className = 'bookmark-img';
    imgIcon.loading = 'lazy';
    imgIcon.decoding = 'async';
    imgIcon.alt = '';

    let domain = '';
    try {
      domain = new URL(bookmarkNode.url).hostname;
    } catch (e) {}

    if (domain.includes('.')) {
      const showFallback = () => fallbackIcon.classList.add('show-fallback');

      imgIcon.onload = () => {
        if (imgIcon.naturalWidth > 16) {
          imgIcon.classList.add('loaded');
          iconWrapper.style.backgroundColor = 'transparent';
        } else {
          imgIcon.remove();
          showFallback();
        }
      };

      imgIcon.onerror = () => {
        imgIcon.remove();
        showFallback();
      };

      imgIcon.src = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(bookmarkNode.url || '')}&size=128`;

      if (imgIcon.complete && imgIcon.naturalWidth > 0) {
        if (imgIcon.naturalWidth > 16) {
          imgIcon.classList.add('loaded');
          iconWrapper.style.backgroundColor = 'transparent';
        } else {
          imgIcon.remove();
          showFallback();
        }
      }

      iconWrapper.appendChild(imgIcon);
    } else {
      fallbackIcon.classList.add('show-fallback');
    }
  }

  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;

  item.appendChild(iconWrapper);
  item.appendChild(titleSpan);

  return item;
}



async function deleteBookmarkOrFolder(id, isFolder) {

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

      const urlObj = new URL(node.url);

      const domain = urlObj.hostname || node.url;

      faviconUrl = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`;

    } catch (e) {

      // ignore - will fall back to letter icon

    }

  }



  const confirmed = await showDeleteConfirm(null, {

    title,

    faviconUrl,

    isFolder,

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



  const meta = folderMetadata[folderNode.id] || {};

  const customColor = meta.color || null;

  const customIcon = meta.icon || null;

  

  // Defaults

  const scale = meta.scale ?? 1;

  const offsetY = meta.offsetY ?? 0;
  const rotation = meta.rotation ?? 0;



  const wrapper = document.createElement('div');

  wrapper.className = 'bookmark-icon-wrapper';



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

    const tempEl = node.children ? renderBookmarkFolder(node) : renderBookmark(node);
    const newIcon = tempEl.querySelector('.bookmark-icon-wrapper');
    if (newIcon) {
      iconWrapper.replaceWith(newIcon);
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
  
  // --- NEW: Flag to trigger animation only on first paint ---
  virtualizerState.initialRender = true; 

  // Attach Scroll Listener (Throttled via RequestAnimationFrame)
  let ticking = false;
  virtualizerState.scrollListener = () => {

    if (!ticking) {

      window.requestAnimationFrame(() => {

        updateVirtualGrid();

        ticking = false;

      });

      ticking = true;

    }
  };
  virtualizerState.mainContentEl.addEventListener('scroll', virtualizerState.scrollListener, { passive: true });

  // Attach Resize Listener
  virtualizerState.resizeObserver = new ResizeObserver(() => {

    updateVirtualGrid();

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

    

    processBookmarks(tree, newFolderNode.id);

    

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

          { isFolder: true }

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

    document.querySelectorAll('.bookmark-folder-tab').forEach(btn => btn.classList.remove('active'));
    tabButton.classList.add('active');

    const folderId = tabButton.dataset.folderId;
    const freshNode = findBookmarkNodeById(bookmarkTree[0], folderId);
    
    if (freshNode) {
      renderBookmarkGrid(freshNode);
      activeHomebaseFolderId = freshNode.id;
    }
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



function processBookmarks(nodes, activeFolderId = null) {

  allBookmarks = flattenBookmarks(nodes);

  

  if (!nodes || !nodes[0] || !nodes[0].children) {

    console.warn('Bookmark tree is empty or malformed.');

    return;

  }



  const rootChildren = nodes[0].children;

  let targetFolder = null;



  let otherBookmarksFolder = rootChildren.find(folder => folder.id === 'unfiled_____');

  if (!otherBookmarksFolder) {

    otherBookmarksFolder = rootChildren.find(

      folder => folder.title.toLowerCase() === 'other bookmarks' && folder.children

    );

  }



  if (otherBookmarksFolder && otherBookmarksFolder.children) {

    targetFolder = otherBookmarksFolder.children.find(

      folder => folder.title.toLowerCase() === 'homebase' && folder.children

    );

  }



  if (targetFolder) {

    rootDisplayFolderId = targetFolder.id;

    createFolderTabs(targetFolder, activeFolderId);

  } else {

    console.warn('Could not find "Other Bookmarks -> homebase" path. Falling back to "Other Bookmarks".');

    if (otherBookmarksFolder) {

      rootDisplayFolderId = otherBookmarksFolder.id;

      createFolderTabs(otherBookmarksFolder, activeFolderId);

    } else {

      console.warn('Could not even find "Other Bookmarks". Falling back to root.');

      rootDisplayFolderId = nodes[0].id;

      createFolderTabs(nodes[0], activeFolderId);

    }

  }

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



/**

 * Now accepts an optional ID to keep a folder active after reload.

 */

async function loadBookmarks(activeFolderId = null) {

  if (!browser.bookmarks) {

    console.warn('Bookmarks API not available.');

    const grid = document.getElementById('bookmarks-grid');

    if (grid) {

      grid.innerHTML = 'Bookmarks are not available.';

    }

    return;

  }



  try {

    const tree = await getBookmarkTree(true);

    processBookmarks(tree, activeFolderId);

    // Warm favicon cache in the background so images are instant when rendered
    runWhenIdle(() => warmFaviconCache(tree));

  } catch (err) {

    console.warn('Failed to load bookmarks', err);

  }

}





// ===============================================

// --- MODIFIED: QUICK ACTIONS BAR SETUP ---

// ===============================================

function setupQuickActions() {

  

  quickAddBookmarkBtn.addEventListener('click', showAddBookmarkModal);

  

  quickAddFolderBtn.addEventListener('click', showAddFolderModal);



  quickOpenBookmarksBtn.addEventListener('click', () => {

    browser.tabs.update({ url: 'about:bookmarks' });

  });

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

const DEFAULT_QUOTE_TAG = 'inspirational';

const QUOTE_FREQUENCY_KEY = 'quoteUpdateFrequency';

const QUOTE_LAST_FETCH_KEY = 'quoteLastFetched';

const QUOTE_CATEGORIES_CACHE_KEY = 'quoteCategoriesCache';

const QUOTE_CATEGORIES_FETCHED_AT_KEY = 'quoteCategoriesFetchedAt';

const QUOTE_BUFFER_KEY = 'quoteBufferCache';

const QUOTE_BUFFER_SIZE = 5;

const CATEGORIES_TTL = 24 * 60 * 60 * 1000; // 24 Hours

async function fetchAndCacheQuoteCategories() {
  try {
    const res = await fetch('https://api.quotable.io/tags');
    if (!res.ok) throw new Error('Could not fetch tags');
    const allTags = await res.json();
    allTags.sort((a, b) => a.name.localeCompare(b.name));
    await browser.storage.local.set({
      [QUOTE_CATEGORIES_CACHE_KEY]: allTags,
      [QUOTE_CATEGORIES_FETCHED_AT_KEY]: Date.now()
    });
    return allTags;
  } catch (err) {
    console.warn('Failed to fetch quote categories in background', err);
    return null;
  }
}


// Buffer quotes in advance so they can render instantly even if offline
async function refillQuoteBuffer(tags = []) {
  try {
    const stored = await browser.storage.local.get(QUOTE_BUFFER_KEY);
    let buffer = stored[QUOTE_BUFFER_KEY] || [];

    if (buffer.length >= QUOTE_BUFFER_SIZE) return;

    const needed = QUOTE_BUFFER_SIZE - buffer.length;
    const tagsQuery = tags.length > 0 ? tags.join('|') : DEFAULT_QUOTE_TAG;
    const res = await fetch(`https://api.quotable.io/quotes/random?limit=${needed}&tags=${encodeURIComponent(tagsQuery)}`);
    if (!res.ok) return;

    const newQuotes = await res.json();
    const list = Array.isArray(newQuotes) ? newQuotes : [newQuotes];
    const existingIds = new Set(buffer.map((q) => q._id));

    list.forEach((q) => {
      if (!existingIds.has(q._id)) {
        buffer.push({ content: q.content, author: q.author, _id: q._id });
      }
    });

    await browser.storage.local.set({ [QUOTE_BUFFER_KEY]: buffer });
  } catch (e) {
    console.warn('Background quote buffering failed', e);
  }
}



// --- Rebuilt Quote Logic: The "Refiller" ---
async function fetchQuote() {
  try {
    // 1. Read the state from LocalStorage (Source of Truth)
    let localStateRaw = localStorage.getItem('fast-quote-state');
    let localState = localStateRaw ? JSON.parse(localStateRaw) : { current: null, next: null, config: {} };

    // 2. Get Settings
    const stored = await browser.storage.local.get(['quoteTags', QUOTE_FREQUENCY_KEY]);
    const freq = stored[QUOTE_FREQUENCY_KEY] || 'hourly';
    const tags = stored.quoteTags || ['inspirational'];

    // 3. Update Config in State
    localState.config.frequency = freq;

    // 4. EMERGENCY RENDER: Only if instant_load failed (Current is empty)
    if (!localState.current) {
      const q = await getOnlineQuote(tags);
      localState.current = q;
      localState.config.lastShown = Date.now();
      
      // Update DOM immediately
      quoteText.textContent = `"${q.text}"`;
      quoteAuthor.textContent = q.author ? `- ${q.author}` : '';
      revealWidget('.widget-quote');
    }

    // 5. THE FIX: Refill the "Next" slot silently
    if (!localState.next) {
      const nextQ = await getOnlineQuote(tags);
      localState.next = nextQ;
    }

    // 6. Save everything back for next time
    localStorage.setItem('fast-quote-state', JSON.stringify(localState));

  } catch (e) {
    console.warn("Quote Logic Error", e);
  }
}

// Helper to fetch from API
async function getOnlineQuote(tags) {
  const res = await fetch(`https://api.quotable.io/quotes/random?limit=1&tags=${encodeURIComponent(tags.join('|'))}`);
  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  return { text: item.content, author: item.author };
}



async function populateQuoteCategories() {

  if (!quoteCategoriesList) return;

  quoteCategoriesList.innerHTML = '';

  const stored = await browser.storage.local.get([QUOTE_CATEGORIES_CACHE_KEY, QUOTE_CATEGORIES_FETCHED_AT_KEY, 'quoteTags']);

  let categories = stored[QUOTE_CATEGORIES_CACHE_KEY] || [];

  const lastFetched = stored[QUOTE_CATEGORIES_FETCHED_AT_KEY] || 0;

  const savedTags = new Set(stored.quoteTags || []);

  const render = (tags) => {

    quoteCategoriesList.innerHTML = '';

    tags.forEach((tag) => {

      const pill = document.createElement('button');

      pill.className = 'quote-category-pill';

      pill.textContent = tag.name;

      pill.dataset.value = tag.name;

      if (savedTags.has(tag.name)) {

        pill.classList.add('selected');

      }

      pill.addEventListener('click', () => {

        pill.classList.toggle('selected');

      });

      quoteCategoriesList.appendChild(pill);

    });

  };

  if (categories.length > 0) {

    render(categories);

  } else {

    quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Loading categories...</span>';

  }

  const now = Date.now();

  if (categories.length === 0 || (now - lastFetched > CATEGORIES_TTL)) {

    fetchAndCacheQuoteCategories().then((newCategories) => {

      if (newCategories && newCategories.length > 0) {

        render(newCategories);

      }

    });

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

      fetchQuote();

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

      const selectedPills = quoteCategoriesList ? quoteCategoriesList.querySelectorAll('.quote-category-pill.selected') : [];

      const selectedTags = Array.from(selectedPills).map((pill) => pill.dataset.value);

      const frequency = quoteFrequencySelect ? quoteFrequencySelect.value : 'hourly';

      await browser.storage.local.remove(QUOTE_BUFFER_KEY);

      await browser.storage.local.set({ quoteTags: selectedTags, [QUOTE_FREQUENCY_KEY]: frequency, [QUOTE_LAST_FETCH_KEY]: 0 });

      closeQuoteSettingsModal();

      fetchQuote();

    });

  }

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

  document.body.classList.toggle('sidebar-hidden', !appShowSidebarPreference);

  updateSidebarCollapseState();

  updateWidgetSettingsUI();

  applyWidgetVisibility();

}



function applyWidgetVisibility() {

  const weatherWidget = document.querySelector('.widget-weather');

  const quoteWidget = document.querySelector('.widget-quote');

  const shouldShowWeather = appShowSidebarPreference && appShowWeatherPreference;

  const shouldShowQuote = appShowSidebarPreference && appShowQuotePreference;

  if (weatherWidget) {

    weatherWidget.classList.toggle('force-hidden', !shouldShowWeather);

  }

  if (quoteWidget) {

    quoteWidget.classList.toggle('force-hidden', !shouldShowQuote);

  }

}


function applyPerformanceMode(enabled) {

  appPerformanceModePreference = enabled;

  document.body.classList.toggle('performance-mode', enabled);

}



// --- Function to inject CSS ---
function applyGlassStyle(styleId) {
  appGlassStylePreference = styleId || 'original';
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
  document.body.classList.toggle('grid-animation-enabled', enabled);
  updateGridAnimationSettingsUI();
}

function applyGridAnimationSpeed(seconds) {
  // Ensure it's a valid number
  const validSeconds = parseFloat(seconds) || 0.3;
  appGridAnimationSpeedPreference = validSeconds;
  
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
    if (appGridAnimationEnabledPreference) {
      container.classList.add('expanded');
    } else {
      container.classList.remove('expanded');
    }
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

      APP_BATTERY_OPTIMIZATION_KEY,
      APP_CINEMA_MODE_KEY,

      APP_CONTAINER_MODE_KEY,

      APP_CONTAINER_NEW_TAB_KEY,

      APP_GRID_ANIMATION_ENABLED_KEY,

      APP_GRID_ANIMATION_SPEED_KEY

    ]);

    // Load animation pref
    await loadGridAnimationPref(); 
    await loadGlassStylePref(); 

    applyTimeFormatPreference(stored[APP_TIME_FORMAT_KEY] || '12-hour');

    applySidebarVisibility(stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true);

    appShowWeatherPreference = stored.hasOwnProperty(APP_SHOW_WEATHER_KEY) ? stored[APP_SHOW_WEATHER_KEY] !== false : true;

    appShowQuotePreference = stored.hasOwnProperty(APP_SHOW_QUOTE_KEY) ? stored[APP_SHOW_QUOTE_KEY] !== false : true;

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

    appPerformanceModePreference = stored[APP_PERFORMANCE_MODE_KEY] === true;

    appBatteryOptimizationPreference = stored[APP_BATTERY_OPTIMIZATION_KEY] === true;
    appCinemaModePreference = stored[APP_CINEMA_MODE_KEY] === true;

    appContainerModePreference = stored[APP_CONTAINER_MODE_KEY] !== false;

    appContainerNewTabPreference = stored[APP_CONTAINER_NEW_TAB_KEY] !== false;

    applyBookmarkFallbackColor(appBookmarkFallbackColorPreference);

    applyBookmarkFolderColor(appBookmarkFolderColorPreference);

    applyPerformanceMode(appPerformanceModePreference);
    resetCinemaMode();

    applyWidgetVisibility();

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



function updateWidgetSettingsUI() {

  const subSettings = document.getElementById('widget-sub-settings');

  const weatherConfigRow = document.getElementById('app-weather-config-row');

  const quoteConfigRow = document.getElementById('app-quote-config-row');

  const weatherToggleEl = document.getElementById('app-show-weather-toggle');

  const quoteToggleEl = document.getElementById('app-show-quote-toggle');

  if (weatherToggleEl) {

    weatherToggleEl.checked = appShowWeatherPreference;

  }

  if (quoteToggleEl) {

    quoteToggleEl.checked = appShowQuotePreference;

  }

  if (!appShowSidebarPreference) {

    if (subSettings) subSettings.classList.remove('expanded');

    if (weatherConfigRow) weatherConfigRow.classList.remove('visible');

    if (quoteConfigRow) quoteConfigRow.classList.remove('visible');

    return;

  }

  if (subSettings) {

    subSettings.classList.add('expanded');

  }

  if (weatherConfigRow) {

    weatherConfigRow.classList.toggle('visible', appShowWeatherPreference);

  }

  if (quoteConfigRow) {

    quoteConfigRow.classList.toggle('visible', appShowQuotePreference);

  }

}


function syncAppSettingsForm() {

  if (appTimeFormatSelect) {

    appTimeFormatSelect.value = timeFormatPreference;

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

  const containerBehaviorRow = document.getElementById('app-container-new-tab-row');

  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');

  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');

  if (containerModeToggle) {

    containerModeToggle.checked = appContainerModePreference;

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
    perfToggle.addEventListener('change', () => {});

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



function setActiveAppSettingsSection(section = 'general') {

  const navItems = document.querySelectorAll('.app-settings-nav-item');

  const sections = document.querySelectorAll('.app-settings-section');

  navItems.forEach((item) => {

    item.classList.toggle('is-active', item.dataset.section === section);

  });

  sections.forEach((panel) => {

    panel.classList.toggle('active', panel.dataset.section === section);

  });

}



function openAppSettingsModal() {

  if (!appSettingsModal) return;

  syncAppSettingsForm();

  setActiveAppSettingsSection('general');

  openModalWithAnimation('app-settings-modal', 'main-settings-btn', '.app-settings-dialog');

}



function closeAppSettingsModal() {

  if (!appSettingsModal) return;

  closeModalWithAnimation('app-settings-modal', '.app-settings-dialog', () => {
    syncAppSettingsForm();
  });

}



function setupAppSettingsModal() {

  if (!appSettingsModal || !mainSettingsBtn) return;



  mainSettingsBtn.addEventListener('click', () => {

    openAppSettingsModal();

    updateDefaultEngineVisibilityControl();

  });



  if (appSearchRememberEngineToggle) {

    appSearchRememberEngineToggle.addEventListener('change', updateDefaultEngineVisibilityControl);

  }



  if (appSettingsCloseBtn) {

    appSettingsCloseBtn.addEventListener('click', closeAppSettingsModal);

  }

  if (appSettingsCancelBtn) {

    appSettingsCancelBtn.addEventListener('click', closeAppSettingsModal);

  }

  if (appSettingsModal) {

    appSettingsModal.addEventListener('click', (e) => {

      if (e.target === appSettingsModal) {

        closeAppSettingsModal();

      }

    });

  }

  if (appSettingsNav) {

    appSettingsNav.addEventListener('click', (e) => {

      const btn = e.target.closest('.app-settings-nav-item');

      if (!btn) return;

      const section = btn.dataset.section || 'general';

      setActiveAppSettingsSection(section);

    });

  }

  if (appSidebarToggle) {

    appSidebarToggle.addEventListener('change', (e) => {

      applySidebarVisibility(e.target.checked);

    });

  }

  if (appWeatherToggle) {

    appWeatherToggle.addEventListener('change', (e) => {

      appShowWeatherPreference = e.target.checked;

      applyWidgetVisibility();

      updateWidgetSettingsUI();

    });

  }

  if (appQuoteToggle) {

    appQuoteToggle.addEventListener('change', (e) => {

      appShowQuotePreference = e.target.checked;

      applyWidgetVisibility();

      updateWidgetSettingsUI();

    });

  }

  const appConfigureWeatherBtn = document.getElementById('app-configure-weather-btn');

  if (appConfigureWeatherBtn) {

    appConfigureWeatherBtn.addEventListener('click', () => {

      openWeatherSettingsModal(appConfigureWeatherBtn);

    });

  }

  const appConfigureQuoteBtn = document.getElementById('app-configure-quote-btn');

  if (appConfigureQuoteBtn) {

    appConfigureQuoteBtn.addEventListener('click', () => {

      openQuoteSettingsModal(appConfigureQuoteBtn);

    });

  }

  const textBgToggle = document.getElementById('app-bookmark-text-bg-toggle');

  const textBgRow = document.getElementById('app-bookmark-text-bg-color-row');

  const textBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');

  const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');

  const textBgBlurRow = document.getElementById('app-bookmark-text-blur-row');

  const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');

  if (textBgToggle) {

    textBgToggle.addEventListener('change', () => {

      const isHidden = !textBgToggle.checked;

      if (textBgRow) textBgRow.classList.toggle('hidden', isHidden);

      if (textBgOpacityRow) textBgOpacityRow.classList.toggle('hidden', isHidden);

      if (textBgBlurRow) textBgBlurRow.classList.toggle('hidden', isHidden);

    });

  }

  if (textBgOpacitySlider) {

    textBgOpacitySlider.addEventListener('input', (e) => {

      const val = parseFloat(e.target.value);

      applyBookmarkTextBgOpacity(val);

    });

  }

  if (textBgBlurSlider) {

    textBgBlurSlider.addEventListener('input', (e) => {

      applyBookmarkTextBgBlur(parseInt(e.target.value, 10));

    });

  }

  // NEW: Grid Animation Toggle Listener
  const animToggle = document.getElementById('app-grid-animation-toggle');
  if (animToggle) {
    animToggle.addEventListener('change', (e) => {
      applyGridAnimationEnabled(e.target.checked);
    });
  }

  // NEW: Animation Speed Slider Listener
  const speedSlider = document.getElementById('app-grid-animation-speed-slider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      applyGridAnimationSpeed(e.target.value);
    });
  }

  if (appSettingsSaveBtn) {

    appSettingsSaveBtn.addEventListener('click', async () => {

      const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';

      const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;

      const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;

      const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;

      const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;

      const nextBookmarkNewTab = document.getElementById('app-bookmark-open-new-tab-toggle')?.checked || false;

      const nextBookmarkTextBg = document.getElementById('app-bookmark-text-bg-toggle')?.checked || false;

      const nextShowWeather = appWeatherToggle ? appWeatherToggle.checked : true;

      const nextShowQuote = appQuoteToggle ? appQuoteToggle.checked : true;

      const nextContainerMode = document.getElementById('app-container-mode-toggle')?.checked ?? true;

      const radioKeepBehavior = document.querySelector('input[name="container-behavior"][value="keep"]');

      const nextContainerNewTab = radioKeepBehavior ? radioKeepBehavior.checked : appContainerNewTabPreference;

      const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');

      const nextTextBgColor = textBgColorTrigger ? (textBgColorTrigger.dataset.value || textBgColorTrigger.style.backgroundColor) : '#2CA5FF';

      const nextOpacity = parseFloat(document.getElementById('app-bookmark-text-opacity-slider')?.value || 0.65);

      const nextBlur = parseInt(document.getElementById('app-bookmark-text-blur-slider')?.value || 4, 10);

      const nextGridAnimEnabled = document.getElementById('app-grid-animation-toggle')?.checked || false;

      const nextSpeed = parseFloat(document.getElementById('app-grid-animation-speed-slider')?.value || 0.3);

      const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');

      const nextFallbackColor = colorTrigger ? (colorTrigger.dataset.value || colorTrigger.style.backgroundColor) : '#00b8d4';

      const folderTrigger = document.getElementById('app-bookmark-folder-color-trigger');

      const nextFolderColor = folderTrigger ? (folderTrigger.dataset.value || folderTrigger.style.backgroundColor) : '#FFFFFF';

      const nextPerformanceMode = document.getElementById('app-performance-mode-toggle')?.checked || false;

      const nextBatteryOptimization = document.getElementById('app-battery-optimization-toggle')?.checked || false;

      const nextCinemaMode = document.getElementById('app-cinema-mode-toggle')?.checked || false;

      const nextSingletonMode = (() => {

        const toggle = document.getElementById('app-singleton-mode-toggle');

        return toggle ? toggle.checked : false;

      })();

      const nextRememberEngine = appSearchRememberEngineToggle ? appSearchRememberEngineToggle.checked : true;

      const nextDefaultEngine = appSearchDefaultEngineSelect && appSearchDefaultEngineSelect.value ? appSearchDefaultEngineSelect.value : appSearchDefaultEnginePreference;

      const nextMath = appSearchMathToggle ? appSearchMathToggle.checked : true;

      const nextSearchHistory = appSearchHistoryToggle ? appSearchHistoryToggle.checked : false;



      applyTimeFormatPreference(nextFormat);

      appShowWeatherPreference = nextShowWeather;

      appShowQuotePreference = nextShowQuote;

      applySidebarVisibility(nextSidebarVisible);

      appMaxTabsPreference = nextMaxTabs;

      appAutoClosePreference = nextAutoClose;

      appSearchOpenNewTabPreference = nextSearchOpenNewTab;

      appSearchRememberEnginePreference = nextRememberEngine;

      appSearchDefaultEnginePreference = nextDefaultEngine;

      appSearchMathPreference = nextMath;

      appSearchShowHistoryPreference = nextSearchHistory;

      appContainerModePreference = nextContainerMode;

      appContainerNewTabPreference = nextContainerNewTab;

      appBookmarkOpenNewTabPreference = nextBookmarkNewTab;

      applyBookmarkTextBg(nextBookmarkTextBg);

      applyBookmarkTextBgOpacity(nextOpacity);

      applyBookmarkTextBgBlur(nextBlur);

      applyBookmarkTextBgColor(nextTextBgColor);

      applyGridAnimationSpeed(nextSpeed);

      appBookmarkFallbackColorPreference = nextFallbackColor;

      appBookmarkFolderColorPreference = nextFolderColor;

      appPerformanceModePreference = nextPerformanceMode;

      appBatteryOptimizationPreference = nextBatteryOptimization;
      appCinemaModePreference = nextCinemaMode;

      appSingletonModePreference = nextSingletonMode;

      applyBookmarkFallbackColor(nextFallbackColor);

      applyBookmarkFolderColor(nextFolderColor);

      applyPerformanceMode(nextPerformanceMode);
      resetCinemaMode();

      applyGridAnimationEnabled(nextGridAnimEnabled);

      updateTime();



      try {

        await browser.storage.local.set({

          [APP_TIME_FORMAT_KEY]: nextFormat,

          [APP_SHOW_SIDEBAR_KEY]: nextSidebarVisible,

          [APP_SHOW_WEATHER_KEY]: nextShowWeather,

          [APP_SHOW_QUOTE_KEY]: nextShowQuote,

          [APP_MAX_TABS_KEY]: nextMaxTabs,

          [APP_AUTOCLOSE_KEY]: nextAutoClose,

          [APP_SEARCH_OPEN_NEW_TAB_KEY]: nextSearchOpenNewTab,

          [APP_BOOKMARK_OPEN_NEW_TAB_KEY]: nextBookmarkNewTab,

          [APP_CONTAINER_MODE_KEY]: nextContainerMode,

          [APP_CONTAINER_NEW_TAB_KEY]: nextContainerNewTab,

          [APP_BOOKMARK_TEXT_BG_KEY]: nextBookmarkTextBg,

          [APP_BOOKMARK_TEXT_BG_COLOR_KEY]: nextTextBgColor,

          [APP_BOOKMARK_TEXT_OPACITY_KEY]: nextOpacity,

          [APP_BOOKMARK_TEXT_BLUR_KEY]: nextBlur,

          [APP_BOOKMARK_FALLBACK_COLOR_KEY]: nextFallbackColor,

          [APP_BOOKMARK_FOLDER_COLOR_KEY]: nextFolderColor,

          [APP_GRID_ANIMATION_ENABLED_KEY]: nextGridAnimEnabled,

          [APP_GRID_ANIMATION_SPEED_KEY]: nextSpeed,

          [APP_SEARCH_REMEMBER_ENGINE_KEY]: nextRememberEngine,

          [APP_SEARCH_MATH_KEY]: nextMath,

          [APP_SEARCH_SHOW_HISTORY_KEY]: nextSearchHistory,

          [APP_SEARCH_DEFAULT_ENGINE_KEY]: nextDefaultEngine,

          [APP_SINGLETON_MODE_KEY]: nextSingletonMode,

          [APP_PERFORMANCE_MODE_KEY]: nextPerformanceMode,

          [APP_BATTERY_OPTIMIZATION_KEY]: nextBatteryOptimization,
          [APP_CINEMA_MODE_KEY]: nextCinemaMode

        });

        if (!nextRememberEngine) {

          await browser.storage.local.remove('currentSearchEngineId');

          updateSearchUI(nextDefaultEngine);

        }

      } catch (err) {

        console.warn('Failed to save app settings', err);

      }



      if (nextSingletonMode) {

        await handleSingletonMode();

      }



      runWhenIdle(() => manageHomebaseTabs());



      closeAppSettingsModal();

    });

  }



  document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape' && !appSettingsModal.classList.contains('hidden')) {

      closeAppSettingsModal();

    }

  });

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

    color: '#181717',

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

        let domain = '';

        try { domain = new URL(bookmarkUrl).hostname; } catch (err) {}

        const safeTitle = escapeHtml(bookmark.title || 'No Title');

        const safeUrl = escapeHtml(bookmarkUrl);

        bookmarkHtml += `

          <button type="button" class="result-item" data-url="${safeUrl}">

            <img src="https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64" alt="">

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

// --- WEATHER WIDGET & SETTINGS ---

// ===============================================

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

let selectedLocation = null;

let searchTimeout = null;



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



async function loadCachedWeather() {

  try {

    const data = await browser.storage.local.get(['cachedWeatherData', 'cachedCityName', 'cachedUnits']);

    if (data.cachedWeatherData && data.cachedCityName) {

      updateWeatherUI(data.cachedWeatherData, data.cachedCityName, data.cachedUnits || 'celsius');

    }

  } catch (error) {

    console.warn('Could not load cached weather:', error);

  }

}



function updateWeatherUI(data, cityName, units) {

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

  const weather = data.current_weather, hourly = data.hourly, daily = data.daily;

  const temp = Math.round(weather.temperature), code = weather.weathercode;

  const pressure = hourly.surface_pressure ? Math.round(hourly.surface_pressure[0] * 0.75006) : '--';

  const humidity = hourly.relative_humidity_2m ? hourly.relative_humidity_2m[0] : '--';

  const cloudcover = hourly.cloudcover ? hourly.cloudcover[0] : '--';

  const precipProb = hourly.precipitation_probability ? hourly.precipitation_probability[0] : '--';

  let sunrise = '--', sunset = '--';

  if (daily && daily.sunrise && daily.sunrise[0] && daily.sunset && daily.sunset[0]) {

    const sunriseDate = new Date(daily.sunrise[0]);

    const sunsetDate = new Date(daily.sunset[0]);

    const timeOptions = { hour: 'numeric', minute: '2-digit' };

    sunrise = sunriseDate.toLocaleTimeString('en-US', timeOptions);

    sunset = sunsetDate.toLocaleTimeString('en-US', timeOptions);

  }

  cityEl.textContent = cityName;

  tempEl.textContent = `${temp}\u00b0${units === 'celsius' ? 'C' : 'F'}`;

  descEl.textContent = getWeatherDescription(code);

  pressureEl.textContent = `Pressure: ${pressure}${pressure !== '--' ? ' mmHg' : ''}`;

  humidityEl.textContent = `Humidity: ${humidity}${humidity !== '--' ? '%' : ''}`;

  cloudcoverEl.textContent = `Cloudcover: ${cloudcover}${cloudcover !== '--' ? '%' : ''}`;

  precipProbEl.textContent = `Rain Chance: ${precipProb}${precipProb !== '--' ? '%' : ''}`;

  sunriseEl.textContent = `Sunrise: ${sunrise}`;

  sunsetEl.textContent = `Sunset: ${sunset}`;

  iconEl.textContent = getWeatherEmoji(code);

  iconEl.style.fontSize = '3.5em';

  iconEl.style.lineHeight = '1';

  setLocationBtn.classList.add('hidden');

  browser.storage.local.set({

    cachedWeatherData: data,

    cachedCityName: cityName,

    cachedUnits: units,

    weatherFetchedAt: Date.now()

  });



  revealWidget('.widget-weather');

  // Mirror simplified weather info to localStorage for instant paint on next load
  try {
    const fastWeather = {
      city: cityName,
      temp: `${temp}\u00b0${units === 'celsius' ? 'C' : 'F'}`,
      desc: getWeatherDescription(code),
      icon: getWeatherEmoji(code),
      // --- NEW: Cache detailed stats for instant load ---
      pressure: `Pressure: ${pressure}${pressure !== '--' ? ' mmHg' : ''}`,
      humidity: `Humidity: ${humidity}${humidity !== '--' ? '%' : ''}`,
      cloudcover: `Cloudcover: ${cloudcover}${cloudcover !== '--' ? '%' : ''}`,
      precipProb: `Rain Chance: ${precipProb}${precipProb !== '--' ? '%' : ''}`,
      sunrise: `Sunrise: ${sunrise}`,
      sunset: `Sunset: ${sunset}`,
      __timestamp: Date.now()
    };
    localStorage.setItem('fast-weather', JSON.stringify(fastWeather));
  } catch (e) {
    // If localStorage is unavailable, fail silently; the async path still works.
  }

}



function showWeatherError(error) {

  if (error) console.error('Weather Error:', error);

  document.getElementById('weather-city').textContent = 'Weather Error';

  document.getElementById('weather-temp').textContent = '--\u00b0';

  document.getElementById('weather-desc').textContent = 'Could not load data';

  document.getElementById('weather-icon').textContent = '-';

  setLocationBtn.classList.remove('hidden');

  revealWidget('.widget-weather');

  browser.storage.local.remove(['cachedWeatherData', 'cachedCityName', 'cachedUnits']);

}





async function fetchWeather(lat, lon, units, cityName) {

  try {

    const hourlyParams = 'relative_humidity_2m,surface_pressure,cloudcover,precipitation_probability';

    const dailyParams = 'sunrise,sunset';

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=${units}&hourly=${hourlyParams}&daily=${dailyParams}&timezone=auto`;

    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) throw new Error('Weather data not available');

    const weatherData = await weatherResponse.json();

    updateWeatherUI(weatherData, cityName, units);

  } catch (error) {

    showWeatherError(error);

  }

}





function showCustomAlert(message) {

  const modal = document.getElementById('custom-alert-modal');

  const msgElement = document.getElementById('custom-alert-message');

  const okBtn = document.getElementById('custom-alert-ok-btn');



  if (!modal || !msgElement || !okBtn) return;



  msgElement.textContent = message;

  openModalWithAnimation('custom-alert-modal', null, '.dialog-content');



  const closeAlert = () => {

    closeModalWithAnimation('custom-alert-modal', '.dialog-content', () => {
      okBtn.removeEventListener('click', closeAlert);
      modal.removeEventListener('click', onOverlayClick);
    });

  };



  const onOverlayClick = (e) => {

    if (e.target === modal) closeAlert();

  };



  okBtn.addEventListener('click', closeAlert);



  modal.addEventListener('click', onOverlayClick);



  okBtn.focus();

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



    const { title = '', faviconUrl = null, isFolder = false } = options;



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



    if (isFolder) {

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

  if ('geolocation' in navigator) {

    navigator.geolocation.getCurrentPosition(

      async (position) => {

        const lat = position.coords.latitude, lon = position.coords.longitude;

        await browser.storage.local.set({

          weatherLat: lat,

          weatherLon: lon,

          weatherCityName: 'Current Location'

        });

        const data = await browser.storage.local.get('weatherUnits');

        fetchWeather(lat, lon, data.weatherUnits || 'celsius', 'Current Location');

      },

      showWeatherError

    );

  } else {

    showWeatherError(new Error('Geolocation not supported'));

  }

}



async function searchForLocation() {

  if (!weatherLocationInput || !weatherLocationResults) return;

  const query = weatherLocationInput.value;

  if (query.length < 3) {

    weatherLocationResults.innerHTML = '';

    weatherLocationResults.classList.add('hidden');

    return;

  }

  try {

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;

    const geoResponse = await fetch(geoUrl);

    const geoData = await geoResponse.json();

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

    console.error('Location search error:', error);

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

  if (weatherLocationInput) {
    weatherLocationInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(searchForLocation, 300);
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
    let fading = false;

    const primeNext = () => {
      if (next.preload !== 'auto') {
        next.preload = 'auto';
        next.load();
      }
    };

    const doFade = async () => {
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
        setTimeout(() => {
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

function resetCinemaMode() {
  document.body.classList.remove('cinema-mode');
  if (cinemaTimeout) clearTimeout(cinemaTimeout);

  if (!appCinemaModePreference) return;

  cinemaTimeout = setTimeout(() => {
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

function setupCinemaModeListeners() {
  const throttledReset = throttle(resetCinemaMode, 200);
  window.addEventListener('mousemove', throttledReset);
  window.addEventListener('keydown', resetCinemaMode);
  window.addEventListener('click', resetCinemaMode);
  resetCinemaMode();
}



// ===============================================

// --- DOCK NAVIGATION ---

// ===============================================

function setupDockNavigation() {

  // Helper function to prevent default link behavior and open a new tab

  const openTab = (e, url) => {

    e.preventDefault();

    browser.tabs.update({ url: url });

  };



  document.getElementById('dock-bookmarks-btn').addEventListener('click', (e) => {

    openTab(e, 'about:bookmarks');

  });



  document.getElementById('dock-history-btn').addEventListener('click', (e) => {

    openTab(e, 'about:history');

  });



  document.getElementById('dock-downloads-btn').addEventListener('click', (e) => {

    openTab(e, 'about:downloads');

  });



  document.getElementById('dock-addons-btn').addEventListener('click', (e) => {

    openTab(e, 'about:addons');

  });



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

    dockGalleryBtn.addEventListener('click', openGalleryModal);

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

  const newTabRow = document.getElementById('app-container-new-tab-row');

  const behaviorRow = document.getElementById('app-container-new-tab-row');

  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');

  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');



  // 1. Feature Detection: Only run if browser supports identities

  if (!browser.contextualIdentities) {

    if (row) row.style.display = 'none';

    if (newTabRow) newTabRow.style.display = 'none';

    if (behaviorRow) behaviorRow.style.display = 'none';

    return;

  }



  // 2. Show the setting row

  if (row) row.style.display = 'flex';

  if (newTabRow) newTabRow.style.display = appContainerModePreference ? 'flex' : 'none';

  if (behaviorRow) behaviorRow.style.display = appContainerModePreference ? 'flex' : 'none';



  // 3. Sync Toggle State

  if (toggle) {

    toggle.checked = appContainerModePreference;



    toggle.addEventListener('change', async (e) => {

      const isEnabled = e.target.checked;



      appContainerModePreference = isEnabled;

      if (newTabRow) newTabRow.style.display = isEnabled ? 'flex' : 'none';

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

// --- INITIALIZE THE PAGE (MODIFIED) ---

// ===============================================

  async function initializePage() {

    await ensureDailyWallpaper();

    setupBackgroundVideoCrossfade();

    const type = await getWallpaperTypePreference();

    // allow the video to buffer without blocking UI setup
    waitForWallpaperReady(currentWallpaperSelection, type);

    await loadAppSettingsFromStorage();

    await loadBookmarkMetadata();

    await loadDomainIconMap();

    await loadLastUsedFolderId();

    await loadFolderMetadata();

    syncAppSettingsForm();

    setupCinemaModeListeners();

    setupContainerMode();

    updateTime();

  setInterval(updateTime, 1000 * 60);

  setupDockNavigation();

  setupAppSettingsModal();

  setupAnimationSettings();
  setupGlassSettings();

  setupMaterialColorPicker();

  setupSearchEnginesModal();

  prefetchGalleryPosters().catch(() => {});

  runWhenIdle(() => warmGalleryPosterHydration());

  

  setupQuickActions();

  setupBookmarkModal();

  setupFolderModal();

  setupEditFolderModal();

  setupBuiltInIconPicker();

  setupMoveModal();

  

  try {

    await loadBookmarks();

  } catch (e) {

    console.warn(e);

  }



  runWhenIdle(async () => {

    await loadCachedWeather();

    const storedCats = await browser.storage.local.get([QUOTE_CATEGORIES_FETCHED_AT_KEY]);

    const lastCatFetch = storedCats[QUOTE_CATEGORIES_FETCHED_AT_KEY] || 0;

    if ((Date.now() - lastCatFetch) > CATEGORIES_TTL) {

      fetchAndCacheQuoteCategories();

    }

    setupQuoteWidget();

    await setupSearch();

    await setupWeather();

    setupAppLauncher();

    fetchQuote();



    requestAnimationFrame(() => {

      if (document && document.body) {

        document.body.classList.remove('preload');

        document.body.classList.add('ready');

      }

    });

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

        deleteBookmarkOrFolder(currentContextItemId, true);

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

        deleteBookmarkOrFolder(currentContextItemId, false);

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

    });

}



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

  const poster = document.body.style.backgroundImage.replace(/^url\("|"\)$/g, '');

  if (!poster) return;

  const avg = await extractAverageColor(poster);

  document.documentElement.style.setProperty('--dynamic-accent', avg);

}



setTimeout(updateDynamicAccent, 600);



function buildGalleryCard(item, index = 0) {

  const card = document.createElement('div');

  card.className = 'gallery-card';

  card.dataset.id = item.id;

  

  const escapeHtml = (str = '') => String(str).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));



  const titleText = item.title || 'Wallpaper';

  const wordCount = titleText.trim().split(/\s+/).filter(Boolean).length;

  const charCount = titleText.length;

  const needsMarquee = charCount > 15 || wordCount >= 5;

  const marqueeDuration = Math.max(8, Math.min(20, Math.ceil(charCount / 2)));

  const posterSrc = item.posterUrl || item.poster || item.url || '';

  const loadingAttr = index < 40 ? 'eager' : 'lazy';

  const isFavorite = galleryFavorites.has(item.id);

  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];

  const tagsHtml = tags

    .map((tag) => {

      const safeTag = escapeHtml(tag);

      return `<span class="gallery-card-tag" data-tag="${safeTag}">${safeTag}</span>`;

    })

    .join('');

  card.innerHTML = `

    <img class="gallery-card-image" src="${posterSrc}" alt="${item.title || 'Wallpaper'}" loading="${loadingAttr}" referrerpolicy="no-referrer" />

    

    <div class="gallery-fav-btn ${isFavorite ? 'is-active' : ''}" aria-label="Favorite this wallpaper">

      <div class="heart"></div>

    </div>

    

    <div class="gallery-card-meta">

      <span class="gallery-card-title ${needsMarquee ? 'gallery-marquee' : ''}" ${needsMarquee ? `style="--gallery-marquee-duration:${marqueeDuration}s"` : ''}><span>${titleText}</span></span>

      <button type="button" class="gallery-card-apply apply-button" aria-label="Apply this wallpaper">

        Apply

      </button>

    </div>

    ${tagsHtml ? `<div class="gallery-card-tags">${tagsHtml}</div>` : ''}

  `;


  return card;

}


function extractFrameFromVideoBlob(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      return reject(new Error('No video blob provided for snapshot extraction.'));
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        video.removeAttribute('src');
        video.load();
      } catch (err) {
        // ignore
      }
    };

    const handleError = (err) => {
      cleanup();
      reject(err || new Error('Failed to capture video frame.'));
    };

    video.addEventListener('loadedmetadata', () => {
      const targetTime = Math.min(1, video.duration || 1);
      video.currentTime = Math.max(0, targetTime);
    }, { once: true });

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1;
      canvas.height = video.videoHeight || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        handleError(new Error('Unable to create drawing context.'));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((snapshotBlob) => {
        cleanup();
        if (!snapshotBlob) {
          reject(new Error('Snapshot blob empty.'));
          return;
        }
        resolve(snapshotBlob);
      }, 'image/jpeg', 0.85);
    }, { once: true });

    video.addEventListener('error', () => handleError(new Error('Video failed to load for snapshot.')), { once: true });
  });
}


async function applyGalleryWallpaper(item) {
  const card = document.querySelector(`.gallery-card[data-id="${item.id}"]`);
  const applyBtn = card ? card.querySelector('.apply-button') : null;
  const originalText = applyBtn ? applyBtn.textContent : 'Apply';

  if (applyBtn) {
    applyBtn.textContent = 'Downloading...';
    applyBtn.disabled = true;
    applyBtn.style.cursor = 'wait';
  }

  try {
    const videoUrl = item.url;

    const cache = await caches.open(WALLPAPER_CACHE_NAME);
    let cachedResponse = await cache.match(videoUrl);

    if (!cachedResponse) {
      if (videoUrl && isRemoteVideoUrl(videoUrl)) {
        await cacheAsset(videoUrl);
        cachedResponse = await cache.match(videoUrl);
        if (!cachedResponse) {
          throw new Error('Download failed. Please check your internet connection.');
        }
      }
    }

    const videoBlob = cachedResponse ? await cachedResponse.blob() : null;
    if (!videoBlob) {
      throw new Error('Failed to read cached video for snapshot generation.');
    }

    if (applyBtn) {
      applyBtn.textContent = 'Generating snapshot...';
    }

    const snapshotBlob = await extractFrameFromVideoBlob(videoBlob);
    const generatedPosterKey = normalizeWallpaperCacheKey(`gallery-snapshot-${item.id}`);
    const snapshotResponse = new Response(snapshotBlob, {
      headers: { 'content-type': 'image/jpeg' }
    });

    await cache.put(generatedPosterKey, snapshotResponse);

    const selection = {
      id: item.id,
      videoUrl,
      posterUrl: generatedPosterKey,
      posterCacheKey: generatedPosterKey,
      videoCacheKey: videoUrl,
      title: item.title || '',
      selectedAt: Date.now()
    };

    const hydrated = await hydrateWallpaperSelection(selection);
    await ensurePlayableSelection(hydrated);

    await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: hydrated });
    currentWallpaperSelection = hydrated;

    const type = await getWallpaperTypePreference();
    applyWallpaperByType(hydrated, type);

    runWhenIdle(() => cacheAppliedWallpaperVideo(hydrated));

    closeGalleryModal();

  } catch (err) {
    console.error('Apply Wallpaper Failed:', err);
    alert('Could not download wallpaper. Please check your internet connection.');
  } finally {
    if (applyBtn) {
      applyBtn.textContent = originalText;
      applyBtn.disabled = false;
      applyBtn.style.cursor = '';
    }
  }
}



async function openGalleryModal() {

  if (!galleryModal || !galleryGrid) return;

  openModalWithAnimation('gallery-modal', 'dock-gallery-btn', '.gallery-dialog');



  try {

    const manifest = await getVideosManifest(); // uses cached manifest when fresh

    const manifestList = Array.isArray(manifest) ? manifest : [];

    runWhenIdle(() => cacheGalleryPosters(manifestList));

    const hydrationPromise = hydrateManifestPosters(manifestList).catch(() => manifestList);

    galleryManifest = manifestList;

    await loadGalleryFavorites();

    await loadGallerySettings();

    await loadWallpaperTypePreference();

    await loadCurrentWallpaperSelection();

    await loadMyWallpapers();

    updateSettingsPreview(currentWallpaperSelection, wallpaperTypePreference || 'video');

    buildGalleryFilters(galleryManifest);

    setGalleryFilter(galleryActiveFilterValue || 'all');

    hydrationPromise.then((hydrated) => {

      if (!hydrated || !galleryModal || galleryModal.classList.contains('hidden') || galleryModal.classList.contains('closing')) return;

      galleryManifest = Array.isArray(hydrated) ? hydrated : manifestList;

      renderCurrentGallery();

    });

  } catch (err) {

    console.warn('Could not load gallery manifest', err);

  }

}



function closeGalleryModal() {

  if (!galleryModal) return;

  closeModalWithAnimation('gallery-modal', '.gallery-dialog');

}



function renderGallery(manifest = []) {

  if (!galleryGrid) return;

  const observer = getGalleryLoadMoreObserver();
  if (observer) {
    observer.disconnect();
  }

  galleryGrid.innerHTML = '';
  galleryRenderQueue = Array.isArray(manifest) ? manifest : [];
  galleryRenderIndex = 0;

  if (!galleryRenderQueue.length) {
    return;
  }

  renderNextGalleryBatch();

  const sentinel = document.createElement('div');
  sentinel.id = 'gallery-sentinel';
  sentinel.style.height = '20px';
  sentinel.style.width = '100%';
  galleryGrid.appendChild(sentinel);

  if (observer) {
    observer.observe(sentinel);
  }

}



function getGalleryLoadMoreObserver() {

  if (!galleryGrid) return null;

  if (!galleryLoadMoreObserver) {

    galleryLoadMoreObserver = new IntersectionObserver((entries) => {

      const entry = entries[0];

      if (entry && entry.isIntersecting) {

        renderNextGalleryBatch();

      }

    }, { root: galleryGrid, rootMargin: '400px' });

  }

  return galleryLoadMoreObserver;

}



function renderNextGalleryBatch() {

  if (!galleryGrid) return;

  if (galleryRenderIndex >= galleryRenderQueue.length) {

    if (galleryLoadMoreObserver) {

      galleryLoadMoreObserver.disconnect();

    }

    return;

  }

  const batch = galleryRenderQueue.slice(galleryRenderIndex, galleryRenderIndex + GALLERY_BATCH_SIZE);

  const fragment = document.createDocumentFragment();

  batch.forEach((item, idx) => {

    const card = buildGalleryCard(item, galleryRenderIndex + idx);

    card.dataset.id = item.id;

    fragment.appendChild(card);

  });

  const sentinel = document.getElementById('gallery-sentinel');

  if (sentinel) {

    galleryGrid.insertBefore(fragment, sentinel);

  } else {

    galleryGrid.appendChild(fragment);

  }

  galleryRenderIndex += batch.length;

  if (galleryRenderIndex >= galleryRenderQueue.length && galleryLoadMoreObserver) {

    galleryLoadMoreObserver.disconnect();

  }

}



function renderCurrentGallery() {

  const data = getGalleryDataForSection();

  const isSettings = gallerySection === 'settings';

  const isMyWallpapers = gallerySection === 'my-wallpapers';



  if (isMyWallpapers) {

    renderMyWallpapers();

  } else {

    renderGallery(data);

  }



  if (galleryEmptyState) {

    galleryEmptyState.classList.toggle('hidden', isSettings || isMyWallpapers || data.length > 0);

  }

  if (galleryGrid) {

    galleryGrid.classList.toggle('hidden', isSettings || isMyWallpapers);

  }

  if (gallerySettingsPanel) {

    gallerySettingsPanel.classList.toggle('hidden', !isSettings);

  }

  if (galleryMyWallpapersPanel) {

    galleryMyWallpapersPanel.classList.toggle('hidden', !isMyWallpapers);

  }

  if (myWallpapersEmptyCard) {

    const hasItems = myWallpapers && myWallpapers.length > 0;

    myWallpapersEmptyCard.classList.toggle('hidden', hasItems || !isMyWallpapers);

  }

  if (myWallpapersGrid) {

    const hasItems = myWallpapers && myWallpapers.length > 0;

    myWallpapersGrid.classList.toggle('hidden', !isMyWallpapers || !hasItems);

  }

}



if (galleryGrid) {

  // Single delegated listener to avoid per-card handlers
  galleryGrid.addEventListener('click', async (e) => {

    const target = e.target;

    if (!target) return;


    const tagEl = target.closest('.gallery-card-tag');

    if (tagEl) {

      e.stopPropagation();

      const tag = (tagEl.dataset.tag || tagEl.textContent || '').trim();

      if (tag) {

        setGalleryTagFilter(tag);

      }

      return;

    }


    const favBtn = target.closest('.gallery-fav-btn');

    if (favBtn) {

      e.stopPropagation();

      const card = favBtn.closest('.gallery-card');

      const id = card?.dataset.id;

      favBtn.classList.toggle('is-active');

      if (id) {

        await toggleFavorite(id, gallerySection !== 'favorites');

      }

      return;

    }


    const applyBtn = target.closest('.gallery-card-apply');

    if (applyBtn) {

      e.stopPropagation();

      const card = applyBtn.closest('.gallery-card');

      const id = card?.dataset.id;

      if (id) {

        const item = galleryManifest.find((i) => String(i.id) === id);

        if (item) {

          await applyGalleryWallpaper(item);

        }

      }

      return;

    }


    const card = target.closest('.gallery-card');

    if (card) {

      const id = card.dataset.id;

      const item = galleryManifest.find((i) => String(i.id) === id);

      if (item) {

        await applyGalleryWallpaper(item);

      }

    }

  });

}



function getMyWallpapersLoadMoreObserver() {

  if (!myWallpapersGrid) return null;

  if (!myWallpapersLoadMoreObserver) {

    myWallpapersLoadMoreObserver = new IntersectionObserver((entries) => {

      const entry = entries[0];

      if (entry && entry.isIntersecting) {

        renderNextMyWallpaperBatch();

      }

    }, { root: myWallpapersGrid, rootMargin: '400px' });

  }

  return myWallpapersLoadMoreObserver;

}



function renderNextMyWallpaperBatch() {

  if (!myWallpapersGrid) return;

  if (myWallpapersRenderIndex >= myWallpapersRenderQueue.length) {

    if (myWallpapersLoadMoreObserver) {

      myWallpapersLoadMoreObserver.disconnect();

    }

    return;

  }

  const batch = myWallpapersRenderQueue.slice(myWallpapersRenderIndex, myWallpapersRenderIndex + MY_WALLPAPERS_BATCH_SIZE);

  const fragment = document.createDocumentFragment();

  const mediaObserver = getMyWallpaperMediaObserver();

  batch.forEach((item) => {

    const card = document.createElement('div');

    card.className = 'gallery-card mw-card';

    card.dataset.id = item.id;

    const titleText = item.title || 'Wallpaper';

    const needsMarquee = titleText.length > 20;

    const marqueeDuration = 6; // uniform speed for all marquee titles

    const isVideo = item.type === 'video';

    const isGif = isVideo && (item.mimeType === 'image/gif' || (item.title || '').toLowerCase().endsWith('.gif'));

    const binTopIcon = useSvgIcon('binTop');

    const binBottomIcon = useSvgIcon('binBottom');

    const binGarbageIcon = useSvgIcon('binGarbage');

    card.innerHTML = `

      <button type="button" class="mw-card-remove bin-button" aria-label="Delete">

        ${binTopIcon}

        ${binBottomIcon}

        ${binGarbageIcon}

      </button>

      <div class="mw-card-media gallery-card-image"></div>

      <div class="mw-card-body gallery-card-meta">

        <div class="mw-card-text">

          <p class="mw-card-title gallery-card-title ${needsMarquee ? 'mw-marquee' : ''}" ${needsMarquee ? `style="--mw-marquee-duration:${marqueeDuration}s"` : ''}><span>${titleText}</span></p>

          <p class="mw-card-meta">${isVideo ? 'Live upload' : 'Static upload'}</p>

        </div>

        <button type="button" class="mw-card-btn apply-button gallery-card-apply" data-id="${item.id}">

          Apply

        </button>

      </div>

    `;

    const media = card.querySelector('.mw-card-media');

    if (media) {

      media.dataset.mediaLoaded = 'false';

      if (isVideo && !isGif) {

        media.dataset.wallpaperId = item.id;

        media.style.backgroundImage = `url("${item.posterUrl || 'assets/fallback.webp'}")`;

        mediaObserver.observe(media);

      } else {

        delete media.dataset.wallpaperId;

        renderMyWallpaperMedia(media, item);

      }

    }

    fragment.appendChild(card);

  });

  const sentinel = document.getElementById('mw-sentinel');

  if (sentinel) {

    myWallpapersGrid.insertBefore(fragment, sentinel);

  } else {

    myWallpapersGrid.appendChild(fragment);

  }

  myWallpapersRenderIndex += batch.length;

  if (myWallpapersRenderIndex >= myWallpapersRenderQueue.length && myWallpapersLoadMoreObserver) {

    myWallpapersLoadMoreObserver.disconnect();

  }

}



if (myWallpapersGrid) {

  myWallpapersGrid.addEventListener('click', (e) => {

    const target = e.target;

    if (!target) return;

    const card = target.closest('.mw-card');

    if (!card) return;

    const id = card.dataset.id;

    const item = (myWallpapers || []).find((mw) => String(mw.id) === id);

    if (!item) return;

    if (target.closest('.mw-card-remove')) {

      e.stopPropagation();

      removeMyWallpaper(id);

      return;

    }

    if (target.closest('.mw-card-btn')) {

      e.stopPropagation();

      applyMyWallpaper(item);

      return;

    }

    e.stopPropagation();

    applyMyWallpaper(item);

  });

}



function getGalleryDataForSection() {

  let data = galleryManifest;

  if (gallerySection === 'favorites') {

    data = galleryManifest.filter((item) => galleryFavorites.has(item.id));

  }

  if (galleryActiveFilterValue !== 'all') {

    data = data.filter((item) => (item.category || '') === galleryActiveFilterValue);

  }

  if (galleryActiveTag) {

    const tagLower = galleryActiveTag.toLowerCase();

    data = data.filter((item) => {

      if (!Array.isArray(item.tags)) return false;

      return item.tags.some((tag) => String(tag).trim().toLowerCase() === tagLower);

    });

  }

  return data;

}



function getFiltersFromManifest(manifest = []) {

  const categories = new Set();

  manifest.forEach((item) => {

    if (item.category) {

      categories.add(item.category);

    }

  });

  return ['all', ...Array.from(categories)];

}



function buildGalleryFilters(manifest = []) {

  const filtersContainer = document.querySelector('.gallery-filters');

  if (!filtersContainer) return;

  filtersContainer.innerHTML = '';



  const filters = getFiltersFromManifest(manifest);

  filters.forEach((cat) => {

    const btn = document.createElement('button');

    btn.className = 'gallery-filter';

    btn.dataset.filter = cat;

    btn.textContent = cat === 'all' ? 'All' : cat;

    if (cat === galleryActiveFilterValue) {

      btn.classList.add('active');

    }

    btn.addEventListener('click', () => setGalleryFilter(cat));

    filtersContainer.appendChild(btn);

  });

}



function setGalleryFilter(filter = 'all', shouldRender = true) {

  galleryActiveFilterValue = filter;

  const filtersContainer = document.querySelector('.gallery-filters');

  if (filtersContainer) {

    filtersContainer.querySelectorAll('.gallery-filter').forEach((btn) => {

      btn.classList.toggle('active', btn.dataset.filter === filter);

    });

  }

  updateGalleryActiveFilterLabel();



  if (shouldRender) {

    renderCurrentGallery();

  }

}



function setGalleryTagFilter(tag = null) {

  const normalizedTag = (tag || '').trim();

  galleryActiveTag = normalizedTag || null;

  if (galleryActiveTag && galleryActiveFilterValue !== 'all') {

    setGalleryFilter('all', false);

  }

  if (galleryClearTagBtn) {

    const hasTag = Boolean(galleryActiveTag);

    galleryClearTagBtn.classList.toggle('hidden', !hasTag);

    galleryClearTagBtn.disabled = !hasTag;

  }

  updateGalleryActiveFilterLabel();

  renderCurrentGallery();

}



function updateGalleryActiveFilterLabel() {

  if (!galleryActiveFilter) return;

  if (galleryActiveTag) {

    galleryActiveFilter.textContent = `Tag: ${galleryActiveTag}`;

    return;

  }

  galleryActiveFilter.textContent = galleryActiveFilterValue === 'all' ? 'All' : galleryActiveFilterValue;

}



function normalizeMyWallpaperItems(items = []) {

  return items

    .filter(Boolean)

    .map((item) => {

      const next = { ...item };

      next.type = next.type || (next.videoCacheKey ? 'video' : 'image');

      if (!next.posterUrl && next.url) {

        next.posterUrl = next.url;

      }

      if (!next.title) {

        next.title = 'My wallpaper';

      }

      if (next.cacheKey) {

        next.cacheKey = normalizeWallpaperCacheKey(next.cacheKey);

      }

      if (next.videoCacheKey) {

        next.videoCacheKey = normalizeWallpaperCacheKey(next.videoCacheKey);

      }

      if (next.posterCacheKey) {

        next.posterCacheKey = normalizeWallpaperCacheKey(next.posterCacheKey);

      }

      return next;

    });

}



async function persistMyWallpapers() {

  const serializable = (myWallpapers || []).map((item) => {

    if (!item) return null;

    const { runtimeUrl, previewUrl, ...rest } = item;

    return rest;

  }).filter(Boolean);

  await browser.storage.local.set({ [MY_WALLPAPERS_KEY]: serializable });

}



async function resolveMyWallpaperSource(item) {

  if (!item) return '';

  if (item.cacheKey) {

    const cached = await getCachedObjectUrl(item.cacheKey);

    if (cached) return cached;

  }

  return item.url || item.posterUrl || '';

}



function getMyWallpaperMediaObserver() {

  if (myWallpaperMediaObserver) return myWallpaperMediaObserver;

  myWallpaperMediaObserver = new IntersectionObserver((entries, observer) => {

    entries.forEach((entry) => {

      if (!entry.isIntersecting) return;

      const media = entry.target;

      const itemId = media.dataset.wallpaperId;

      const item = (myWallpapers || []).find((mw) => mw.id === itemId);

      if (item) {

        renderMyWallpaperMedia(media, item);

      }

      observer.unobserve(media);

    });

  }, { rootMargin: '0px 0px 200px 0px' });

  return myWallpaperMediaObserver;

}



function renderMyWallpaperMedia(media, item) {

  if (!media || !item || media.dataset.mediaLoaded === 'true') return;

  media.dataset.mediaLoaded = 'true';

  media.innerHTML = '';

  media.style.backgroundImage = '';



  const isVideo = item.type === 'video';

  const isGif = isVideo && (item.mimeType === 'image/gif' || (item.title || '').toLowerCase().endsWith('.gif'));



  if (isVideo && !isGif) {

    const video = document.createElement('video');

    video.className = 'mw-card-video';

    video.muted = true;

    video.loop = true;

    video.playsInline = true;

    video.poster = item.posterUrl || 'assets/fallback.webp';

    media.appendChild(video);

    resolveMyWallpaperSource(item).then((src) => {

      if (src && media.contains(video)) {

        video.src = src;

        video.load();

        video.play().catch(() => {});

      }

    });

  } else {

    const img = document.createElement('img');

    img.loading = 'lazy';

    img.alt = item.title || 'My wallpaper';

    img.src = (!isVideo || isGif) ? (item.posterUrl || item.url || 'assets/fallback.webp') : (item.posterUrl || 'assets/fallback.webp');

    media.appendChild(img);

    if (isVideo) {

      resolveMyWallpaperSource(item).then((src) => {

        if (src && media.contains(img)) {

          img.src = src;

        }

      });

    }

  }

}



function renderMyWallpapers() {

  if (!myWallpapersGrid) return;

  const mediaObserver = getMyWallpaperMediaObserver();

  mediaObserver.disconnect();

  const loadMoreObserver = getMyWallpapersLoadMoreObserver();

  if (loadMoreObserver) {

    loadMoreObserver.disconnect();

  }

  myWallpapersGrid.innerHTML = '';

  myWallpapersRenderQueue = Array.isArray(myWallpapers) ? myWallpapers : [];

  myWallpapersRenderIndex = 0;

  const hasItems = myWallpapersRenderQueue.length > 0;

  myWallpapersGrid.classList.toggle('hidden', !hasItems);

  if (myWallpapersEmptyCard) {

    myWallpapersEmptyCard.classList.toggle('hidden', hasItems);

  }

  if (!hasItems) return;

  renderNextMyWallpaperBatch();

  const sentinel = document.createElement('div');

  sentinel.id = 'mw-sentinel';

  sentinel.style.height = '20px';

  sentinel.style.width = '100%';

  myWallpapersGrid.appendChild(sentinel);

  if (loadMoreObserver) {

    loadMoreObserver.observe(sentinel);

  }

}



if (galleryCloseBtn) {

  galleryCloseBtn.addEventListener('click', closeGalleryModal);

}



if (galleryModal) {

  galleryModal.addEventListener('click', (e) => {

    if (e.target === galleryModal) {

      closeGalleryModal();

    }

  });

}



if (galleryClearTagBtn) {

  galleryClearTagBtn.addEventListener('click', () => setGalleryTagFilter(null));

}



// Placeholder: alternate button shuffles through manifest in current view

if (galleryAlternateBtn) {

  galleryAlternateBtn.addEventListener('click', async () => {

    // Mirror "Next Wallpaper" behavior

    await ensureDailyWallpaper(true);

    closeGalleryModal();

  });

}



if (galleryFooterButtons && galleryFooterButtons.length) {

  galleryFooterButtons.forEach((btn) => {

    btn.addEventListener('click', () => {

      galleryFooterButtons.forEach((b) => b.classList.remove('is-active'));

      btn.classList.add('is-active');



      const section = btn.dataset.section;

      setGallerySection(section || 'gallery');

    });

  });

}



async function applyMyWallpaper(item) {

  if (!item) return;



  const isVideo = item.type === 'video';

  const isGif = item.mimeType === 'image/gif';

  const cacheKey = item.cacheKey ? normalizeWallpaperCacheKey(item.cacheKey) : '';

  

  let posterUrl = item.posterUrl || item.url || 'assets/fallback.webp';

  let videoUrl = '';



  // Resolve video URL if it's a video (and not a GIF)

  if (isVideo && !isGif) {

    if (cacheKey) {

      videoUrl = await getCachedObjectUrl(cacheKey);

    }

  } else if (isGif && cacheKey) {

    const gifUrl = await getCachedObjectUrl(cacheKey);

    if (gifUrl) posterUrl = gifUrl;

  }



  const selection = {

    id: item.id,

    videoUrl: videoUrl,

    posterUrl: posterUrl,

    title: item.title || 'My Wallpaper',

    selectedAt: Date.now(),

    videoCacheKey: (isVideo && !isGif) ? (cacheKey || '') : '',

    posterCacheKey: (!isVideo || isGif) ? (cacheKey || '') : '',

    mimeType: item.mimeType || ''

  };



  const hydratedSelection = await hydrateWallpaperSelection(selection);
  await ensurePlayableSelection(hydratedSelection);



  await browser.storage.local.set({

    [WALLPAPER_SELECTION_KEY]: hydratedSelection,

    [DAILY_ROTATION_KEY]: false

  });



  currentWallpaperSelection = hydratedSelection;

  if (galleryDailyToggle) galleryDailyToggle.checked = false;



  // Force switch to video mode if it's a video

  if (isVideo && !isGif) {

    await setWallpaperTypePreference('video');

    if (wallpaperTypeToggle) wallpaperTypeToggle.checked = false; 

    applyWallpaperByType(hydratedSelection, 'video');

  } else {

    await setWallpaperTypePreference('static');

    if (wallpaperTypeToggle) wallpaperTypeToggle.checked = true; 

    applyWallpaperByType(hydratedSelection, 'static');

  }



  runWhenIdle(() => cacheAppliedWallpaperVideo(hydratedSelection));

  

  closeGalleryModal();

}









async function handleMyWallpaperUpload(files = [], mode = 'static') {
  const isLive = mode === 'live';
  
  // 1. Find the correct file
  const file = files.find((f) => {
    if (!f) return false;
    const name = (f.name || '').toLowerCase();
    const type = (f.type || '').toLowerCase();
    
    if (isLive) {
      return type.includes('video') || type.includes('gif') || name.endsWith('.mp4') || name.endsWith('.gif');
    }
    return type.startsWith('image/');
  });

  if (!file) {
    alert(isLive ? 'Please select a live wallpaper file (.mp4 or .gif).' : 'Please select an image file (.png, .jpg, .jpeg, .webp).');
    return;
  }

  const title = (file.name || 'My wallpaper').replace(/\.[^/.]+$/, '');
  const id = `mywallpaper-${Date.now()}`;
  
  // 2. Generate a Unique Cache Key
  // We use this key to retrieve the file from the Cache API later
  const cacheKey = normalizeWallpaperCacheKey(`user-upload-${id}-${file.name}`);

  // 3. OPTIMIZATION: Save file to Cache API immediately
  // This stores the raw binary data in browser cache, avoiding the 5MB storage limit.
  // We force the MIME type to ensure playback works.
  let mimeType = file.type;
  const nameLower = (file.name || '').toLowerCase();
  
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (nameLower.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (nameLower.endsWith('.gif')) mimeType = 'image/gif';
    else if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (nameLower.endsWith('.png')) mimeType = 'image/png';
    else if (nameLower.endsWith('.webp')) mimeType = 'image/webp';
  }

  await cacheUserWallpaperFile(cacheKey, file, mimeType);

  // 4. Create the Metadata Object
  // notice we DO NOT store 'url' (Base64). We only store 'cacheKey'.
  let item = {
    id,
    title,
    cacheKey,     // <--- The reference to the data
    mimeType,
    type: isLive ? 'video' : 'image',
    posterUrl: '' // Will be generated below
  };

  // 5. Generate Thumbnails (Posters)
  if (isLive && !item.mimeType.includes('gif')) {
    // For Video: Generate a poster frame
    const posterDataUrl = await buildVideoPosterFromFile(file);
    item.posterUrl = posterDataUrl || 'assets/fallback.webp';
  } else {
    // For Images/GIFs: Use the file itself as the poster
    // We create a temporary blob URL for immediate rendering
    item.posterUrl = URL.createObjectURL(file);
  }

  // 6. Save & Render
  myWallpapers.unshift(item);
  await persistMyWallpapers(); // Saves only metadata to storage.local
  renderMyWallpapers();
}



async function loadMyWallpapers() {

  try {

    const stored = await browser.storage.local.get(MY_WALLPAPERS_KEY);

    const storedItems = Array.isArray(stored[MY_WALLPAPERS_KEY]) ? stored[MY_WALLPAPERS_KEY] : [];

    myWallpapers = normalizeMyWallpaperItems(storedItems);

  } catch (err) {

    myWallpapers = [];

  }

  renderMyWallpapers();

}



async function removeMyWallpaper(id) {

  if (!id) return;

  const target = myWallpapers.find((item) => item.id === id);

  myWallpapers = myWallpapers.filter((item) => item.id !== id);

  await persistMyWallpapers();

  if (target && target.cacheKey) {

    await deleteCachedObject(target.cacheKey);

  }



  // If the deleted wallpaper is currently applied, fall back to the default live wallpaper

  try {

    const stored = await browser.storage.local.get(WALLPAPER_SELECTION_KEY);

    const activeSelection = currentWallpaperSelection || stored[WALLPAPER_SELECTION_KEY] || null;

    const activeId = activeSelection && activeSelection.id;

    const selectionKeys = new Set(

      [activeSelection && activeSelection.cacheKey, activeSelection && activeSelection.posterCacheKey, activeSelection && activeSelection.videoCacheKey]

        .filter(Boolean)

        .map(normalizeWallpaperCacheKey)

    );

    const targetKeys = new Set(

      [target && target.cacheKey, target && target.posterCacheKey, target && target.videoCacheKey]

        .filter(Boolean)

        .map(normalizeWallpaperCacheKey)

    );

    const matchesActive = (activeId && activeId === id) || Array.from(targetKeys).some((key) => selectionKeys.has(key));



    if (matchesActive) {

      const now = Date.now();

      const fallbackSelection = buildFallbackSelection(now);

      currentWallpaperSelection = fallbackSelection;

      wallpaperTypePreference = 'video';

      if (wallpaperTypeToggle) wallpaperTypeToggle.checked = false;

      await browser.storage.local.set({

        [WALLPAPER_SELECTION_KEY]: fallbackSelection,

        [WALLPAPER_FALLBACK_USED_KEY]: now,

        [WALLPAPER_TYPE_KEY]: 'video'

      });

      applyWallpaperByType(fallbackSelection, 'video');

      runWhenIdle(() => cacheAppliedWallpaperVideo(fallbackSelection));

    }

  } catch (err) {

    console.warn('Failed to reset wallpaper after deletion', err);

  }



  renderMyWallpapers();

}



async function loadGalleryFavorites() {

  try {

    const stored = await browser.storage.local.get(FAVORITES_KEY);

    const ids = Array.isArray(stored[FAVORITES_KEY]) ? stored[FAVORITES_KEY] : [];

    galleryFavorites = new Set(ids);

  } catch (err) {

    console.warn('Failed to load gallery favorites', err);

    galleryFavorites = new Set();

  }

}



async function saveGalleryFavorites() {

  try {

    await browser.storage.local.set({ [FAVORITES_KEY]: Array.from(galleryFavorites) });

  } catch (err) {

    console.warn('Failed to save gallery favorites', err);

  }

}



async function toggleFavorite(itemId) {

  if (!itemId) return;

  if (galleryFavorites.has(itemId)) {

    galleryFavorites.delete(itemId);

  } else {

    galleryFavorites.add(itemId);

  }

  await saveGalleryFavorites();

  renderCurrentGallery();

}



function setGallerySection(section = 'gallery') {

  gallerySection = section;

  if (galleryFooterButtons && galleryFooterButtons.length) {

    galleryFooterButtons.forEach((btn) => {

      btn.classList.toggle('is-active', btn.dataset.section === section);

    });

  }

  const hideFilters = section === 'settings' || section === 'my-wallpapers';

  if (galleryFiltersContainer) {

    galleryFiltersContainer.style.display = hideFilters ? 'none' : 'flex';

  }

  if (galleryActionsBar) {

    galleryActionsBar.style.display = hideFilters ? 'none' : 'flex';

  }

  if (galleryClearTagBtn) {

    const shouldHideClear = hideFilters || !galleryActiveTag;

    galleryClearTagBtn.classList.toggle('hidden', shouldHideClear);

    galleryClearTagBtn.disabled = shouldHideClear;

  }

  if (galleryActiveFilter) {

    if (hideFilters) {

      galleryActiveFilter.textContent = 'Settings';

    } else {

      updateGalleryActiveFilterLabel();

    }

  }

  if (galleryHeaderTitle) {

    if (gallerySection === 'settings') {

      galleryHeaderTitle.textContent = 'Gallery Settings';

    } else if (gallerySection === 'favorites') {

      galleryHeaderTitle.textContent = 'Favorites';

    } else if (gallerySection === 'my-wallpapers') {

      galleryHeaderTitle.textContent = 'My Wallpapers';

    } else {

      galleryHeaderTitle.textContent = 'Gallery';

    }

  }



  renderCurrentGallery();

}



if (myWallpapersJumpBtn) {

  myWallpapersJumpBtn.addEventListener('click', () => setGallerySection('gallery'));

}



if (myWallpapersUseFallbackBtn) {

  myWallpapersUseFallbackBtn.addEventListener('click', async () => {

    try {

      const now = Date.now();

      const selection = buildFallbackSelection(now);

      currentWallpaperSelection = selection;

      await browser.storage.local.set({

        [WALLPAPER_SELECTION_KEY]: selection,

        [WALLPAPER_FALLBACK_USED_KEY]: now

      });

      const type = await getWallpaperTypePreference();

      applyWallpaperByType(selection, type);

      runWhenIdle(() => cacheAppliedWallpaperVideo(selection));

    } catch (err) {

      console.warn('Failed to apply fallback wallpaper from My Wallpapers', err);

    }

  });

}



if (myWallpapersUploadBtn && myWallpapersUploadInput) {

  myWallpapersUploadBtn.addEventListener('click', () => {

    myWallpapersUploadInput.value = '';

    myWallpapersUploadInput.click();

  });



  myWallpapersUploadInput.addEventListener('change', async (e) => {

    const files = Array.from(e.target.files || []);

    if (!files.length) return;

    await handleMyWallpaperUpload(files);

    myWallpapersUploadInput.value = '';

  });

}



if (myWallpapersUploadLiveBtn && myWallpapersUploadLiveInput) {

  myWallpapersUploadLiveBtn.addEventListener('click', () => {

    myWallpapersUploadLiveInput.value = '';

    myWallpapersUploadLiveInput.click();

  });



  myWallpapersUploadLiveInput.addEventListener('change', async (e) => {

    const files = Array.from(e.target.files || []);

    if (!files.length) return;

    await handleMyWallpaperUpload(files, 'live');

    myWallpapersUploadLiveInput.value = '';

  });

}



async function loadGallerySettings() {

  if (!galleryDailyToggle) return;

  try {

    const stored = await browser.storage.local.get(DAILY_ROTATION_KEY);

    const enabled = stored[DAILY_ROTATION_KEY];

    galleryDailyToggle.checked = enabled !== false; // default to on

  } catch (err) {

    galleryDailyToggle.checked = true;

  }

}



if (galleryDailyToggle) {

  galleryDailyToggle.addEventListener('change', async (e) => {

    const enabled = !!e.target.checked;

    await browser.storage.local.set({ [DAILY_ROTATION_KEY]: enabled });

  });

}



async function loadWallpaperTypePreference() {

  const stored = await browser.storage.local.get(WALLPAPER_TYPE_KEY);

  wallpaperTypePreference = stored[WALLPAPER_TYPE_KEY] || 'video';

  if (wallpaperTypeToggle) {

    wallpaperTypeToggle.checked = wallpaperTypePreference === 'static';

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



if (wallpaperTypeToggle) {

  wallpaperTypeToggle.addEventListener('change', async (e) => {

    const type = e.target.checked ? 'static' : 'video';

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

  const activeUrls = new Set();

  if (currentSelection) {

    if (currentSelection.videoUrl) activeUrls.add(currentSelection.videoUrl);

    if (currentSelection.posterUrl) activeUrls.add(currentSelection.posterUrl);

  }



  for (const [cacheKey, objectUrl] of wallpaperObjectUrlCache.entries()) {

    if (!activeUrls.has(objectUrl)) {

      URL.revokeObjectURL(objectUrl);

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



  if (!unchanged) {
    const applyWallpaperFlow = () => {
      applyWallpaperBackground(poster);
      // 1. Always run cleanup first. This stops the old loop & removes listeners instantly.
      cleanupBackgroundPlayback();

      if (finalType === 'video' && video) {
        // 2. Now safe to reuse the existing video elements
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

  const videos = Array.from(document.querySelectorAll('.background-video'));

  if (!videos.length) return;

  videos.forEach((v) => {

    v.muted = true;

    v.playsInline = true;

    v.loop = false; // crossfade manages looping

    v.classList.remove('is-active'); // stay hidden until crossfade activates

  });

}



/* Updated toggleFavorite to accept a skipRender flag */

async function toggleFavorite(itemId, skipRender = false) {

  if (!itemId) return;

  

  if (galleryFavorites.has(itemId)) {

    galleryFavorites.delete(itemId);

  } else {

    galleryFavorites.add(itemId);

  }

  

  await saveGalleryFavorites();

  

  // Only re-render if we didn't ask to skip it.

  if (!skipRender) {

    renderCurrentGallery();

  }

}



function updateSettingsPreview(selection, type = 'video') {

  const finalType = type === 'static' ? 'static' : 'video';

  const poster = (selection && (selection.posterUrl || selection.poster)) || 'assets/fallback.webp';

  const title = (selection && selection.title) || 'Wallpaper';

  const author = (selection && selection.category) || '';



  if (settingsPreviewTitle) settingsPreviewTitle.textContent = title;

  if (settingsPreviewAuthor) settingsPreviewAuthor.textContent = author ? `Category: ${author}` : '';



  if (!settingsPreviewImg || !settingsPreviewVideo) return;



  if (finalType === 'video' && selection && selection.videoUrl) {

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
    const cachedVideo = await getCachedObjectUrl(cacheKey);
    if (cachedVideo) {
      selection.videoUrl = cachedVideo;
    }
  }

  return selection;
}
