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
const VIDEOS_JSON_URL = 'https://pub-d330ac9daa80435c82f1d50b5e43ca72.r2.dev/videos.json';
const VIDEOS_JSON_CACHE_KEY = 'videosManifest';
const VIDEOS_JSON_FETCHED_AT_KEY = 'videosManifestFetchedAt';
const VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GALLERY_POSTERS_CACHE_KEY = 'cachedGalleryPosters';
let videosManifestPromise = null;
const WALLPAPER_POOL_KEY = 'wallpaperPoolIds';
const WALLPAPER_SELECTION_KEY = 'wallpaperSelection';
const CACHED_APPLIED_VIDEO_URL_KEY = 'cachedAppliedVideoUrl';
const CACHED_APPLIED_POSTER_URL_KEY = 'cachedAppliedPosterUrl';
const CACHED_APPLIED_POSTER_CACHE_KEY = 'cachedAppliedPoster';
const WALLPAPER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const WALLPAPER_FALLBACK_USED_KEY = 'wallpaperFallbackUsedAt';
const WALLPAPER_CACHE_NAME = 'wallpaper-assets';
const USER_WALLPAPER_CACHE_PREFIX = 'https://user-wallpapers.local/';
const REMOTE_VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
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

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
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
  document.documentElement.style.setProperty('--initial-wallpaper', `url("${poster}")`);
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
      lastAppliedWallpaper = {
        id: hydrated.id || 'stored',
        poster,
        video: hydrated.videoUrl || '',
        type: hydrated.videoUrl ? 'video' : 'static'
      };
      return;
    }

    // Only reach here if there is truly no wallpaper set
    const fallbackSelection = buildFallbackSelection(now);
    setWallpaperFallbackPoster(fallbackSelection.posterUrl, fallbackSelection.posterCacheKey || fallbackSelection.posterUrl || '');
    applyWallpaperBackground(fallbackSelection.posterUrl);
    lastAppliedWallpaper = {
      id: fallbackSelection.id,
      poster: fallbackSelection.posterUrl,
      video: '',
      type: 'static'
    };

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

      if (stored[VIDEOS_JSON_CACHE_KEY] && isFresh) {
        return stored[VIDEOS_JSON_CACHE_KEY]; // Already fresh for the day
      }

      const res = await fetch(VIDEOS_JSON_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();

      await browser.storage.local.set({
        [VIDEOS_JSON_CACHE_KEY]: manifest,
        [VIDEOS_JSON_FETCHED_AT_KEY]: now
      });
      return manifest;
    } catch (err) {
      console.warn('Could not refresh videos manifest:', err);
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
      .map((item) => item && (item.poster || item.posterUrl))
      .filter(Boolean)
  ));
  if (!posters.length) return [];

  let cachedList = [];
  try {
    const stored = await browser.storage.local.get(GALLERY_POSTERS_CACHE_KEY);
    cachedList = Array.isArray(stored[GALLERY_POSTERS_CACHE_KEY]) ? stored[GALLERY_POSTERS_CACHE_KEY] : [];
  } catch (err) {
    console.warn('Unable to read cached poster index', err);
  }

  const cachedSet = new Set(cachedList);
  const newPosters = posters.filter((url) => !cachedSet.has(url));
  const postersToCache = (newPosters.length ? newPosters : posters).filter(Boolean);

  if (postersToCache.length) {
    await Promise.all(postersToCache.map((url) => cacheAsset(url)));
  }

  const nextCached = Array.from(new Set([...cachedSet, ...posters]));
  try {
    await browser.storage.local.set({ [GALLERY_POSTERS_CACHE_KEY]: nextCached });
  } catch (err) {
    console.warn('Unable to update cached poster index', err);
  }
  return nextCached;
}

const wallpaperObjectUrlCache = new Map();
let galleryPosterPrefetchPromise = null;
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
  const hydrated = await Promise.all((manifest || []).map(async (item) => {
    const posterCacheKey = (item && (item.poster || item.posterUrl)) || '';
    let posterUrl = (item && (item.posterUrl || item.poster)) || '';

    if (posterCacheKey) {
      const cachedPoster = await getCachedObjectUrl(posterCacheKey);
      if (cachedPoster) {
        posterUrl = cachedPoster;
      }
    }

    return {
      ...item,
      posterUrl,
      posterCacheKey
    };
  }));

  return hydrated;
}

async function prefetchGalleryPosters() {
  if (galleryPosterPrefetchPromise) return galleryPosterPrefetchPromise;
  galleryPosterPrefetchPromise = (async () => {
    try {
      const manifest = await fetchVideosManifestIfNeeded();
      const manifestList = Array.isArray(manifest) ? manifest : [];
      await cacheGalleryPosters(manifestList);
    } catch (err) {
      console.warn('Failed to prefetch gallery posters', err);
    }
  })();
  return galleryPosterPrefetchPromise;
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
      await deleteCachedObject(CACHED_APPLIED_POSTER_CACHE_KEY);
      return;
    }

    const blob = await resolvePosterBlob(posterUrl, posterCacheKey);
    let storedUrl = posterUrl;

    if (blob) {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl) {
        storedUrl = dataUrl;
      }

      try {
        const cache = await caches.open(WALLPAPER_CACHE_NAME);
        await cache.put(
          normalizeWallpaperCacheKey(CACHED_APPLIED_POSTER_CACHE_KEY),
          new Response(blob, {
            headers: {
              'content-type': blob.type || 'image/webp'
            }
          })
        );
      } catch (err) {
        console.warn('Failed to cache applied poster blob', err);
      }
    }

    await browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: storedUrl });
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
    v.play().catch(() => {});
  });
}

function applyWallpaperBackground(posterUrl) {
  if (posterUrl) {
    document.body.style.backgroundImage = `url("${posterUrl}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  } else {
    document.body.style.backgroundImage = '';
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
    currentWallpaperSelection = hydratedSelection;
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
  const APP_CONTAINER_MODE_KEY = 'appContainerMode';
  const APP_CONTAINER_NEW_TAB_KEY = 'appContainerNewTab';
// Map to store per-folder customization (id -> { color, icon })
const FOLDER_META_KEY = 'folderCustomMetadata';
let folderMetadata = {};
let pendingFolderMeta = {};
let galleryManifest = [];
let galleryActiveFilterValue = 'all';
let galleryActiveTag = null;
let gallerySection = 'gallery'; // gallery | favorites | my-wallpapers | settings (future)
let galleryFavorites = new Set();
let currentWallpaperSelection = null;
let wallpaperTypePreference = null; // 'video' | 'static'
let myWallpapers = [];
let myWallpaperMediaObserver = null;
let timeFormatPreference = '12-hour';
let appShowSidebarPreference = true;
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
let appPerformanceModePreference = false;
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
let bookmarkModalTitle;
let bookmarkModalMode = 'add';
let bookmarkModalEditingId = null;

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
  
  // 1. Clear inputs
  bookmarkNameInput.value = '';
  bookmarkUrlInput.value = ''; // This will show the "https://..." placeholder
  
  // 2. Show the modal
  addBookmarkModal.style.display = 'flex';
  
  // 3. Focus the name input
  bookmarkNameInput.focus();
}

/**
 * Hides the "Add Bookmark" modal and clears inputs.
 */
function hideAddBookmarkModal() {
  addBookmarkModal.style.display = 'none';
  bookmarkNameInput.value = '';
  bookmarkUrlInput.value = '';
  resetBookmarkModalState();
}

function setBookmarkModalMode(mode) {
  bookmarkModalMode = mode;
  if (!bookmarkModalTitle || !bookmarkSaveBtn) {
    return;
  }
  if (mode === 'edit') {
    bookmarkModalTitle.textContent = 'Edit Bookmark';
    bookmarkSaveBtn.textContent = 'Update';
  } else {
    bookmarkModalTitle.textContent = 'Add Bookmark';
    bookmarkSaveBtn.textContent = 'Save';
  }
}

function resetBookmarkModalState() {
  bookmarkModalEditingId = null;
  setBookmarkModalMode('add');
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

  bookmarkNameInput.value = bookmarkNode.title || '';
  bookmarkUrlInput.value = bookmarkNode.url || '';

  addBookmarkModal.style.display = 'flex';
  bookmarkNameInput.focus();
  bookmarkNameInput.select();
}

/**
 * Saves the new bookmark from the modal inputs.
 * (MODIFIED: This version re-fetches the tree to refresh the UI)
 */
async function handleBookmarkModalSave() {
  const name = bookmarkNameInput.value.trim();
  let url = bookmarkUrlInput.value.trim();

  // 1. Validate inputs
  if (!name || !url) {
    alert("Please provide a name and URL.");
    return;
  }
  
  // 2. Simple URL correction (add https:// if no protocol)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  if (bookmarkModalMode === 'edit' && bookmarkModalEditingId) {
    try {
      await browser.bookmarks.update(bookmarkModalEditingId, {
        title: name,
        url: url
      });

      const newTree = await getBookmarkTree(true);

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

  // 3. Check for active folder when adding
  if (!activeHomebaseFolderId) {
    alert("Error: No active bookmark folder selected.");
    return;
  }

  // 4. Create the bookmark
  try {
    await browser.bookmarks.create({
      parentId: activeHomebaseFolderId,
      title: name,
      url: url
    });

    // 5. === THIS IS THE FIX ===
    // Re-fetch the entire bookmark tree to get the update
    const newTree = await getBookmarkTree(true); // Update the global tree variable

    // 6. Re-find the active folder node from the NEW tree
    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
    
    // 7. Re-render the grid with the updated folder
    if (activeFolderNode) {
      renderBookmarkGrid(activeFolderNode);
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
  bookmarkModalTitle = addBookmarkDialog.querySelector('h3');
  resetBookmarkModalState();

  // 2. Attach button listeners
  bookmarkSaveBtn.addEventListener('click', handleBookmarkModalSave);
  bookmarkCancelBtn.addEventListener('click', hideAddBookmarkModal);
  if (bookmarkCloseBtn) {
    bookmarkCloseBtn.addEventListener('click', hideAddBookmarkModal);
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
      handleBookmarkModalSave();
    } else if (e.key === 'Escape') {
      hideAddBookmarkModal();
    }
  });

  bookmarkUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleBookmarkModalSave();
    } else if (e.key === 'Escape') {
      hideAddBookmarkModal();
    }
  });
  
  // 5. Listen for "Escape" key globally when modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addBookmarkModal.style.display === 'flex') {
      hideAddBookmarkModal();
    }
  });
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
  addFolderModal.style.display = 'flex';
  
  // 3. Focus the name input
  folderNameInput.focus();
}

/**
 * Hides the "Add Folder" modal and clears inputs.
 */
function hideAddFolderModal() {
  addFolderModal.style.display = 'none';
  folderNameInput.value = '';
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

  // 3. Create the folder
  try {
    await browser.bookmarks.create({
      parentId: activeHomebaseFolderId, // <-- Creates in the active tab
      title: name
    });

    // 4. Re-fetch the entire bookmark tree to get the update
    const newTree = await getBookmarkTree(true); // Update the global tree variable

    // 5. Re-find the active folder node from the NEW tree
    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
    
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
    if (e.key === 'Escape' && addFolderModal.style.display === 'flex') {
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

  if (!editFolderEscBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editFolderModal.style.display === 'flex') {
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

  // --- Initialize Elastic Sliders ---
  const currentScale = pendingFolderMeta[editFolderTargetId]?.scale ?? 1;
  const currentOffsetY = pendingFolderMeta[editFolderTargetId]?.offsetY ?? 0;
  const currentRotation = pendingFolderMeta[editFolderTargetId]?.rotation ?? 0;

  const scaleEl = document.getElementById('gooey-slider-scale');
  const offsetEl = document.getElementById('gooey-slider-offset');
  const rotateEl = document.getElementById('gooey-slider-rotate');
  
  // Initialize once per element to avoid stacking listeners
  if (scaleEl && !scaleEl.dataset.initialized) {
    initElasticSlider('gooey-slider-scale', 0.5, 1.5, 1, 0.01, (val) => {
      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
      pendingFolderMeta[editFolderTargetId].scale = val;
      updateEditPreview();
    });
    scaleEl.dataset.initialized = '1';
  }

  if (offsetEl && !offsetEl.dataset.initialized) {
    initElasticSlider('gooey-slider-offset', -20, 20, 0, 1, (val) => {
      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
      pendingFolderMeta[editFolderTargetId].offsetY = val;
      updateEditPreview();
    });
    offsetEl.dataset.initialized = '1';
  }

  if (rotateEl && !rotateEl.dataset.initialized) {
    initElasticSlider('gooey-slider-rotate', -180, 180, 0, 1, (val) => {
      if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
      pendingFolderMeta[editFolderTargetId].rotation = val;
      updateEditPreview();
    });
    rotateEl.dataset.initialized = '1';
  }

  // Refresh slider positions to current values without re-binding listeners
  if (scaleEl && scaleEl.setValue) scaleEl.setValue(currentScale);
  if (offsetEl && offsetEl.setValue) offsetEl.setValue(currentOffsetY);
  if (rotateEl && rotateEl.setValue) rotateEl.setValue(currentRotation);

  updateEditPreview();
  editFolderModal.style.display = 'flex';

  if (editFolderNameInput) {
    editFolderNameInput.focus();
    editFolderNameInput.select();
  }
}


function hideEditFolderModal() {
  if (!editFolderModal) return;

  editFolderModal.style.display = 'none';
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
}

let cachedPreviewContainer = null;
let cachedControlsContainer = null;

function updateEditPreview(iconOverride) {
  // 1. Lazy-load the container reference once
  if (!cachedPreviewContainer) {
    cachedPreviewContainer = document.getElementById('edit-folder-icon-preview');
  }
  const previewContainer = cachedPreviewContainer;
  if (!previewContainer || !editFolderTargetId) return;

  const meta = pendingFolderMeta[editFolderTargetId] || {};
  const customColor = meta.color || appBookmarkFolderColorPreference;
  const scale = meta.scale ?? 1;
  const offsetY = meta.offsetY ?? 0;
  const rotation = meta.rotation ?? 0;

  // 2. Optimization: Calculate Transform String first (Cheap)
  const transformValue = `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.85}) rotate(${rotation}deg)`;

  // 3. Optimization: Select children only once
  const existingBase = previewContainer.children[0];
  const existingIcon = previewContainer.children[1];

  if (cachedControlsContainer) {
    cachedControlsContainer.classList.toggle('visible', !!meta.icon);
  }

  // --- BASE ICON & COLOR UPDATE ---
  // Optimization: Only run heavy color math if the color actually CHANGED
  if (existingBase && existingBase.classList && existingBase.classList.contains('edit-folder-base-wrapper')) {
    if (existingBase.dataset.lastAppliedColor !== customColor) {
      const svgPaths = existingBase.querySelectorAll('path, rect');
      for (let i = 0; i < svgPaths.length; i++) {
        svgPaths[i].style.fill = customColor;
        svgPaths[i].style.setProperty('fill', customColor, 'important');
      }
      existingBase.dataset.lastAppliedColor = customColor;

      // Update contrast fill for existing BUILT-IN icon immediately
      if (existingIcon && existingIcon.tagName === 'DIV') {
        const contrastFill = getComplementaryColor(customColor);
        const svg = existingIcon.querySelector('svg');
        if (svg) {
          svg.style.fill = contrastFill;
          const innerPaths = svg.querySelectorAll('path');
          for (let k = 0; k < innerPaths.length; k++) {
            innerPaths[k].style.fill = contrastFill;
          }
        }
      }
    }
  } else {
    // Initial Render (slow path, runs once)
    previewContainer.innerHTML = '';
    const baseWrapper = document.createElement('div');
    baseWrapper.className = 'edit-folder-base-wrapper';
    baseWrapper.innerHTML = ICONS.bookmarkFolderLarge || '';
    
    const svgPaths = baseWrapper.querySelectorAll('path, rect');
    for (let i = 0; i < svgPaths.length; i++) {
      svgPaths[i].style.fill = customColor;
      svgPaths[i].style.setProperty('fill', customColor, 'important');
    }
    baseWrapper.dataset.lastAppliedColor = customColor;
    previewContainer.appendChild(baseWrapper);
  }

  // --- CUSTOM ICON UPDATE ---
  const effectiveIcon = iconOverride !== undefined ? iconOverride : (meta.icon || null);

  if (!effectiveIcon) {
    // If we have an icon but shouldn't, remove it
    if (existingIcon && (existingIcon.classList && existingIcon.classList.contains('edit-folder-custom-icon-preview'))) {
      existingIcon.remove();
    }
    return;
  }

  // Check if we can reuse the existing icon DOM element
  if (existingIcon && existingIcon.classList && existingIcon.classList.contains('edit-folder-custom-icon-preview')) {
    const currentSrc = existingIcon.dataset.src || existingIcon.dataset.iconKey;
    const isMatch = (effectiveIcon.startsWith('builtin:') && existingIcon.dataset.iconKey === effectiveIcon) ||
                    (!effectiveIcon.startsWith('builtin:') && existingIcon.src === effectiveIcon);

    if (isMatch) {
      // SUPER FAST PATH: Just update transform. 
      // Browser handles this on the compositor thread (GPU).
      existingIcon.style.transform = transformValue;
      return; 
    }
    // Icon source changed, remove old one
    existingIcon.remove();
  }

  // Slow Path: Create new icon element
  let iconEl;
  // (We need contrast fill here for new built-ins)
  const contrastFill = getComplementaryColor(customColor); 

  if (typeof effectiveIcon === 'string' && effectiveIcon.startsWith('builtin:')) {
    const key = effectiveIcon.slice('builtin:'.length);
    const svgString = ICONS.FOLDER_GLYPHS && ICONS.FOLDER_GLYPHS[key];
    if (!svgString) return;
    iconEl = document.createElement('div');
    iconEl.className = 'edit-folder-custom-icon-preview';
    iconEl.innerHTML = svgString;
    iconEl.dataset.iconKey = effectiveIcon;

    const svg = iconEl.querySelector('svg');
    if (svg) {
      svg.style.fill = contrastFill;
      const innerPaths = svg.querySelectorAll('path');
      for (let k = 0; k < innerPaths.length; k++) {
        innerPaths[k].style.fill = contrastFill;
      }
    }
  } else {
    iconEl = document.createElement('img');
    iconEl.className = 'edit-folder-custom-icon-preview';
    iconEl.src = effectiveIcon;
    iconEl.dataset.src = effectiveIcon;
  }
  
  iconEl.style.transform = transformValue;
  previewContainer.appendChild(iconEl);
}

/**
 * Initialize a Physics-based Elastic Slider (Optimized with rAF Throttling)
 */
function initElasticSlider(containerId, min, max, initialValue, step, onUpdate) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clean up any previous animation frames if re-initializing
  if (container.dataset.animId) {
    cancelAnimationFrame(parseInt(container.dataset.animId));
  }

  container.innerHTML = ''; 

  // --- Configuration ---
  const width = 300;     
  const height = 50;     
  const trackY = 35;     
  const padding = 20;    
  const trackWidth = width - (padding * 2);
  const baseRadius = 12; 
  const popRadius = 20;  
  
  // Physics Constants
  const TENSION = 0.15;
  const FRICTION = 0.75;
  const POP_SPEED = 0.2;

  // --- Helpers ---
  const valToX = (v) => {
    const percent = (v - min) / (max - min);
    return padding + (percent * trackWidth);
  };

  const xToVal = (x) => {
    let relativeX = x - padding;
    relativeX = Math.max(0, Math.min(relativeX, trackWidth));
    const percent = relativeX / trackWidth;
    let rawVal = min + (percent * (max - min));
    const inverse = 1 / step;
    const stepped = Math.round(rawVal * inverse) / inverse;
    const decimals = step < 1 ? 2 : 0;
    return parseFloat(stepped.toFixed(decimals));
  };

  // --- State ---
  let isDragging = false;
  let isAnimating = false;
  let cachedRect = null; // Layout Thrashing Fix

  // Physics State
  let targetX = valToX(initialValue);
  let currentX = targetX;
  let velocityX = 0;
  let targetY = trackY;
  let currentY = trackY;
  let velocityY = 0;

  // Value State
  let displayVal = initialValue;
  let lastEmittedVal = initialValue; // For rAF throttling
  let updateRafId = null;            // Lock for output throttling

  // --- Build SVG (Same as before) ---
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("elastic-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.overflow = "visible"; 

  const defs = document.createElementNS(svgNS, "defs");
  const filter = document.createElementNS(svgNS, "filter");
  filter.id = `goo-${containerId}`;
  filter.innerHTML = `
    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
  `;
  defs.appendChild(filter);
  svg.appendChild(defs);

  const track = document.createElementNS(svgNS, "path");
  track.setAttribute("d", `M${padding},${trackY} L${width - padding},${trackY}`);
  track.setAttribute("stroke", "#e2e8f0");
  track.setAttribute("stroke-width", "6");
  track.setAttribute("stroke-linecap", "round");
  svg.appendChild(track);

  const gooGroup = document.createElementNS(svgNS, "g");
  gooGroup.style.filter = `url(#goo-${containerId})`;

  const knob = document.createElementNS(svgNS, "circle");
  knob.setAttribute("cx", targetX);
  knob.setAttribute("cy", trackY);
  knob.setAttribute("r", baseRadius);
  knob.setAttribute("fill", "#2ca5ff");

  const bubble = document.createElementNS(svgNS, "circle");
  bubble.setAttribute("cx", targetX);
  bubble.setAttribute("cy", trackY);
  bubble.setAttribute("r", baseRadius);
  bubble.setAttribute("fill", "#2ca5ff");

  gooGroup.appendChild(bubble);
  gooGroup.appendChild(knob);
  svg.appendChild(gooGroup);

  const text = document.createElementNS(svgNS, "text");
  text.classList.add("elastic-text");
  text.setAttribute("x", targetX);
  text.setAttribute("y", trackY); 
  text.setAttribute("font-size", "14"); 
  text.textContent = initialValue;
  svg.appendChild(text);

  container.appendChild(svg);

  // --- Animation Loop (Visuals) ---
  function startLoop() {
    if (!isAnimating) {
      isAnimating = true;
      animate();
    }
  }

  function animate() {
    if (!container.isConnected) {
      isAnimating = false;
      container.dataset.animId = '';
      return;
    }

    const tensionX = (targetX - currentX) * TENSION;
    velocityX += tensionX;
    velocityX *= FRICTION;
    currentX += velocityX;

    const tensionY = (targetY - currentY) * POP_SPEED;
    velocityY += tensionY;
    velocityY *= 0.6;
    currentY += velocityY;

    // Stop condition
    if (!isDragging && 
        Math.abs(velocityX) < 0.05 && 
        Math.abs(velocityY) < 0.05 &&
        Math.abs(targetX - currentX) < 0.1 &&
        Math.abs(targetY - currentY) < 0.1) {
      
      currentX = targetX;
      currentY = targetY;
      updateVisuals();
      isAnimating = false;
      container.dataset.animId = '';
      return;
    }

    updateVisuals();
    const id = requestAnimationFrame(animate);
    container.dataset.animId = id;
  }

  function updateVisuals() {
    // Only touch DOM attributes
    const progress = Math.max(0, (trackY - currentY) / 25);
    const bubbleRadius = baseRadius + ((popRadius - baseRadius) * progress);

    knob.setAttribute("cx", targetX);
    bubble.setAttribute("cx", currentX);
    bubble.setAttribute("cy", currentY);
    bubble.setAttribute("r", bubbleRadius);

    text.setAttribute("x", currentX);
    text.setAttribute("y", currentY + 1);
    
    const newText = (step < 1) ? displayVal : Math.round(displayVal);
    // Cheap DOM read check
    if (text.textContent != newText) {
      text.textContent = newText;
    }
  }

  // --- Input Handlers ---
  const handleStart = (e) => {
    isDragging = true;
    
    // OPTIMIZATION: Cache the rect once on start, not every move
    cachedRect = svg.getBoundingClientRect();
    
    svg.classList.add('active');
    const parentRow = container.closest('.gooey-control-row');
    if (parentRow) parentRow.classList.add('is-dragging');

    targetY = trackY - 25; 
    startLoop();  
    handleMove(e);
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, {passive: false});
    window.addEventListener('touchend', handleEnd);
  };

  const handleEnd = () => {
    isDragging = false;
    cachedRect = null; // Clear cache
    svg.classList.remove('active');
    
    const parentRow = container.closest('.gooey-control-row');
    if (parentRow) parentRow.classList.remove('is-dragging');

    targetY = trackY; 
    targetX = valToX(displayVal);
    startLoop();
    
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('touchend', handleEnd);
  };

  const handleMove = (e) => {
    if (!isDragging) return;
    
    // OPTIMIZATION: Use cached rect
    const rect = cachedRect; 
    if (!rect) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const scaleX = width / rect.width;
    
    let rawX = (clientX - rect.left) * scaleX;
    let constrainedX = Math.max(padding, Math.min(rawX, width - padding));
    
    targetX = constrainedX;
    
    const calculatedVal = xToVal(constrainedX);
    
    if (calculatedVal !== displayVal) {
      displayVal = calculatedVal;
      // --- OPTIMIZATION START: THROTTLE OUTPUT ---
      // We schedule the callback for the next animation frame.
      // If one is already scheduled, we do nothing (the scheduled one will pick up the latest 'displayVal').
      if (onUpdate && !updateRafId) {
        updateRafId = requestAnimationFrame(() => {
          if (!container.isConnected) {
            updateRafId = null;
            return;
          }
          if (lastEmittedVal !== displayVal) {
            onUpdate(displayVal);
            lastEmittedVal = displayVal;
          }
          updateRafId = null;
        });
      }
      // --- OPTIMIZATION END ---
    }
    
    startLoop();
  };

  container.addEventListener('mousedown', handleStart);
  container.addEventListener('touchstart', handleStart, {passive: false});

  container.setValue = (val) => {
    const clamped = Math.max(min, Math.min(max, val));
    targetX = valToX(clamped);
    currentX = targetX; 
    displayVal = clamped;
    lastEmittedVal = clamped;
    updateVisuals();
  };
  
  updateVisuals();
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
        const svgString = ICONS.FOLDER_GLYPHS ? ICONS.FOLDER_GLYPHS[key] : null;
        if (!svgString) return;

        const btn = document.createElement('div');
        btn.className = 'icon-picker-item';
        btn.dataset.iconId = key;
        btn.innerHTML = svgString;
        btn.title = key;
        
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
    if (e.key === 'Escape' && moveBookmarkModal.style.display === 'flex') {
      hideMoveBookmarkModal();
    }
  });

  document.addEventListener('click', (e) => {
    if (!moveBookmarkModal || moveBookmarkModal.style.display !== 'flex') return;
    if (!moveFolderDropdown) return;
    if (moveFolderDropdown.contains(e.target)) return;
    closeMoveFolderDropdown();
  });
}

function hideMoveBookmarkModal() {
  if (moveBookmarkModal) {
    moveBookmarkModal.style.display = 'none';
  }
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
  moveBookmarkModal.style.display = 'flex';
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
    animation: 300,
    group: 'bookmarks', // Group name
    draggable: '.bookmark-item:not(.back-button)', // prevent Back from moving
    
    // Add .grid-item-rename-input to the filter so inline renames stay clickable
    filter: '.grid-item-rename-input', 
    
    ghostClass: 'bookmark-placeholder', // Use our existing placeholder style
    chosenClass: 'sortable-chosen',     // Class for the item in its original spot
    dragClass: 'sortable-drag',         // Class for the item being dragged
    forceFallback: true,                // Use Sortable's custom ghost instead of native DnD
    fallbackClass: 'bookmark-fallback-ghost',
    fallbackOnBody: true,
    fallbackTolerance: 4,
    
    // The onStart javascript hack is no longer needed 
    // because the CSS Grid layout is stable.

    onClone: (evt) => {
      const clone = evt.clone;
      if (clone) {
        clone.style.backgroundColor = 'transparent';
        clone.style.boxShadow = 'none';
      }
    },
    onStart: () => {
      isGridDragging = true;
    },
    onEnd: (evt) => {
      handleGridDrop(evt);
      setTimeout(() => {
        isGridDragging = false;
      }, 0);
    },
    onMove: handleGridMove,           // Function to call when hovering
    preventOnFilter: true             // Prevent 'Back' button drag
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
 * NEW: Unified handler for grid drop (re-ordering or moving into a folder).
 * This is a Sortable.js `onEnd` callback.
 */
async function handleGridDrop(evt) {
  clearTabDropHighlight();
  const grid = evt.from; // Get the grid container
  
  // Clear all hover effects
  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
    item.classList.remove('drag-over');
  });

  const draggedItem = evt.item;
  const draggedItemId = draggedItem.dataset.bookmarkId;
  
  // Use the event's clientX/Y to find the *actual* drop target
  const dropTargetElement = document.elementFromPoint(
    evt.originalEvent.clientX,
    evt.originalEvent.clientY
  );

  // 1) Folder *inside* the grid
  const folderTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-item[data-is-folder="true"]')
    : null;

  // 2) NEW: Folder *tab* at the top
  const tabTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-folder-tab')
    : null;

  // 3) NEW: Back button for moving up a level
  const backButtonTarget = dropTargetElement
    ? dropTargetElement.closest('.back-button')
    : null;

  // --- Case 1: Dropped ONTO a folder INSIDE the grid ---
  if (folderTarget && folderTarget.dataset.bookmarkId !== draggedItemId) {
    const targetFolderId = folderTarget.dataset.bookmarkId;

    // Undo Sortable's DOM change; moveBookmark will re-render
    draggedItem.remove();

    // Move the bookmark *into* that folder
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }
  // --- Case 2: NEW - Dropped ONTO a folder TAB ---
  else if (tabTarget) {
    const targetFolderId = tabTarget.dataset.folderId;

    // Again, undo Sortable's DOM change
    draggedItem.remove();

    // Move the bookmark into the folder represented by that tab
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }
  // --- Case 3: NEW - Dropped ONTO the Back button ---
  else if (backButtonTarget && backButtonTarget.dataset.backTargetId) {
    const targetFolderId = backButtonTarget.dataset.backTargetId;

    draggedItem.remove();
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }

  // --- Case 4: Re-ordered within the same grid ---
  else if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
    const parentId = currentGridFolderNode.id;

    // Start from Sortable's new index
    let targetIndex = evt.newIndex;

    // If this grid has a Back button as the first child,
    // subtract 1 so we get the correct bookmark index.
    const hasBackButton = !![...grid.children].find(child =>
      child.classList.contains('back-button')
    );
    if (hasBackButton) {
      targetIndex--; // Account for the 'Back' button
    }

    const draggedNode = findBookmarkNodeById(bookmarkTree[0], draggedItemId);
    if (!draggedNode) return;

    // If the index didn't actually change in the bookmark tree, do nothing
    if (draggedNode.parentId === parentId && draggedNode.index === targetIndex) {
      return;
    }

    // Move the bookmark *within* the folder to the final index
    await moveBookmark(draggedItemId, { parentId: parentId, index: targetIndex });
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

/**
 * === MODIFIED ===
 * Renders a single bookmark item (MODIFIED for Sortable.js)
 * All manual D&D listeners have been removed.
 */
function renderBookmark(bookmarkNode) {
  // --- CHANGED from <a> to <div> ---
  const item = document.createElement('div');
  item.className = 'bookmark-item';

  // --- D&D attributes ---
  item.dataset.bookmarkId = bookmarkNode.id;
  item.dataset.isFolder = 'false';

  const title = bookmarkNode.title || ' ';
  const firstLetter = title.charAt(0).toLowerCase();

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bookmark-icon-wrapper';

  // 1. Create Fallback (Default View)
  const fallbackIcon = document.createElement('div');
  fallbackIcon.className = 'bookmark-fallback-icon';
  fallbackIcon.textContent = firstLetter;
  iconWrapper.appendChild(fallbackIcon);

  // 2. Prepare Loading Spinner (Defined early so we can use it immediately)
  const loader = document.createElement('div');
  loader.className = 'bookmark-loading-spinner';

  // 3. Create and Load Image
  const imgIcon = document.createElement('img');
  let domain = '';
  try {
    domain = new URL(bookmarkNode.url).hostname;
  } catch (e) {
    // Invalid URL: leave domain empty, fallback will stay
  }

  // Common function to swap fallback -> image
  const showImage = () => {
    if (imgIcon.naturalWidth > 16) {
      iconWrapper.innerHTML = '';     // Remove fallback
      iconWrapper.appendChild(imgIcon); // Show image
      iconWrapper.appendChild(loader);  // Keep loader structure (hidden by CSS usually)
    }
  };

  if (domain.includes('.')) {
    const faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64`;

    imgIcon.addEventListener('load', showImage);
    imgIcon.addEventListener('error', () => { /* Keep fallback */ });

    imgIcon.src = faviconUrl;

    // --- FIX: Check immediately if cached ---
    if (imgIcon.complete && imgIcon.naturalWidth > 0) {
      showImage();
    }
  }

  const titleSpan = document.createElement('span');
  titleSpan.textContent = bookmarkNode.title;

  item.appendChild(iconWrapper);
  item.appendChild(titleSpan);

  return item;
}

function clearBookmarkLoadingStates() {
  document.querySelectorAll('.bookmark-item.is-loading').forEach((el) => {
    el.classList.remove('is-loading');
  });
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
      faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64`;
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

  const wrapper = document.createElement('div');
  wrapper.className = 'bookmark-icon-wrapper';

  // 1. ALWAYS render the Base Folder SVG
  wrapper.innerHTML = ICONS.bookmarkFolderLarge || '';
  
  // Apply Color to SVG
  const appliedColor = customColor || appBookmarkFolderColorPreference;
  const svgPaths = wrapper.querySelectorAll('path, rect');
  svgPaths.forEach((p) => {
    p.style.fill = appliedColor;
    p.style.setProperty('fill', appliedColor, 'important');
  });

  // Complementary color for inner icon based on folder color
  const iconFillColor = getComplementaryColor(appliedColor);

  // 2. Render Custom Icon (Updated with transforms)
  if (customIcon) {
    // Base style for the icon (centered + custom offset/scale)
    // NOTE: Base CSS has transform: translate(-50%, -50%) scale(0.9). 
    // We override it here.
    const transformStyle = `transform: translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.9});`;

    if (customIcon.startsWith('builtin:')) {
      const key = customIcon.replace('builtin:', '');
      const svgString = ICONS.FOLDER_GLYPHS ? ICONS.FOLDER_GLYPHS[key] : null;

      if (svgString) {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'bookmark-folder-custom-icon';
        iconDiv.innerHTML = svgString;
        iconDiv.setAttribute('style', transformStyle);

        // Apply contrast fill to built-in SVG paths
        const svg = iconDiv.querySelector('svg');
        if (svg) {
          svg.style.fill = iconFillColor;
          svg.querySelectorAll('path').forEach(p => p.style.fill = iconFillColor);
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
  
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
    if (parentNode) {
      renderBookmarkGrid(parentNode);
    }
  });
  return item;
}


/**
 * Clears and re-renders the bookmarks grid (MODIFIED for Sortable.js)
 * @param {object} folderNode - The bookmark folder node to render.
 * @param {string | null} droppedItemId - The ID of an item that was just moved,
 * which should NOT be animated.
 */
function renderBookmarkGrid(folderNode, droppedItemId = null) {
  const grid = document.getElementById('bookmarks-grid');
  const previousPositions = droppedItemId ? captureGridItemPositions(grid) : null;
  grid.innerHTML = '';
  
  // --- Store the current folder node ---
  currentGridFolderNode = folderNode;
  
  // 1. Add a "Back" button
  if (folderNode.id !== rootDisplayFolderId && folderNode.parentId !== rootDisplayFolderId && folderNode.parentId !== '0' && folderNode.parentId !== 'root________') {
    const parentNode = findBookmarkNodeById(bookmarkTree[0], folderNode.parentId);
    if (parentNode && parentNode.id !== rootDisplayFolderId) {
       // --- NEW: Add 'back-button' class for Sortable.js filter ---
       const backButton = createBackButton(parentNode.id);
       backButton.classList.add('back-button');
       grid.appendChild(backButton);
    }
  }

  // 2. Render all children (folders and bookmarks)
  if (folderNode.children) {
    folderNode.children.forEach(node => {
      if (node.url) {
        grid.appendChild(renderBookmark(node));
      } else if (node.children) {
        grid.appendChild(renderBookmarkFolder(node));
      }
    });
  }

  // 3. --- NEW: Initialize Sortable.js on the newly rendered grid ---
  setupGridSortable(grid);

  // 4. Apply staggered "drop-in" animation (unmodified)
  const items = grid.querySelectorAll('.bookmark-item');
  
  if (droppedItemId) {
    animateGridReorder(items, previousPositions);
  } else {
    // This is a folder change or initial load.
    // Do the cool "drop-in" animation.
    items.forEach((item, index) => {
      // (But still skip the 'Back' button)
      if (item.classList.contains('back-button')) {
        item.style.opacity = 1;
        return;
      }

      // Skip animation entirely when performance mode is enabled
      if (appPerformanceModePreference) {
        item.style.opacity = '';
        return;
      }

      const delay = Math.min(index * 25, 500); // 25ms per item, max 500ms
      item.style.animationDelay = `${delay}ms`;
      item.classList.add('newly-rendered');
      
      item.addEventListener('animationend', () => {
        item.classList.remove('newly-rendered');
        item.style.animationDelay = '';
      }, { once: true });
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
    
    processBookmarks(tree, newFolderNode.id);
    
  } catch (err) {
    console.error("Error creating bookmark folder:", err);
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
  autoResizeTextarea(input); // Also fixed a typo here from your original file
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

    tabButton.addEventListener('click', () => {
      // Update active styles
      bookmarkFolderTabsContainer.querySelectorAll('.bookmark-folder-tab').forEach(btn => {
        btn.classList.remove('active');
      });
      tabButton.classList.add('active');

      // Always use the *latest* node from the current bookmarkTree
      const freshNode = findBookmarkNodeById(bookmarkTree[0], folderNode.id) || folderNode;

      renderBookmarkGrid(freshNode);
      activeHomebaseFolderId = folderNode.id;
    });

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

  const addButton = document.createElement('button');
  addButton.className = 'bookmark-folder-add-btn';
  addButton.setAttribute('aria-label', 'Create New Folder');
  addButton.title = 'Create New Folder';
  addButton.innerHTML = ICONS.bookmarkTabsPlus || '';
  
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
const quoteSettingsPanel = document.getElementById('quote-settings-panel');
const closeQuoteSettingsBtn = document.getElementById('close-quote-settings-btn');
const quoteCategoriesList = document.getElementById('quote-categories-list');
const saveQuoteSettingsBtn = document.getElementById('save-quote-settings-btn');
const quoteText = document.getElementById('quote-text');
const quoteAuthor = document.getElementById('quote-author');
const DEFAULT_QUOTE_TAG = 'inspirational';

async function loadCachedQuote() {
  try {
    const data = await browser.storage.local.get(['cachedQuote', 'cachedAuthor']);
    if (data.cachedQuote) {
      quoteText.textContent = `\"${data.cachedQuote}\"`;
      quoteAuthor.textContent = data.cachedAuthor ? `- ${data.cachedAuthor}` : '';
      revealWidget('.widget-quote');
    }
  } catch (err) {
    console.warn('Could not load cached quote:', err);
  }
}

async function fetchQuote() {
  try {
    const data = await browser.storage.local.get('quoteTags');
    let tagsToFetch = data.quoteTags;
    if (!tagsToFetch || tagsToFetch.length === 0) tagsToFetch = [DEFAULT_QUOTE_TAG];
    const tagsQuery = tagsToFetch.join('|');
    const res = await fetch(`https://api.quotable.io/quotes/random?limit=1&tags=${encodeURIComponent(tagsQuery)}`, {
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    const q = Array.isArray(arr) ? arr[0] : arr;
    
    if (!q || !q.content) {
      if (tagsQuery !== DEFAULT_QUOTE_TAG) {
        console.warn(`No quotes found for tags: ${tagsQuery}. Falling back to default.`);
        await browser.storage.local.remove('quoteTags');
        fetchQuote();
        return;
      } else {
        throw new Error('Malformed response or no default quote found');
      }
    }
    quoteText.textContent = `\"${q.content}\"`;
    quoteAuthor.textContent = q.author ? `- ${q.author}` : '';
    browser.storage.local.set({
      cachedQuote: q.content,
      cachedAuthor: q.author || ''
    });

    revealWidget('.widget-quote');
  } catch (err) {
    console.error('Quote Error:', err);
    if (!quoteText.textContent.includes('"')) {
      quoteText.textContent = '"The best way to predict the future is to create it."';
      quoteAuthor.textContent = '- Peter Drucker';
    }

    revealWidget('.widget-quote');
  }
}

async function populateQuoteCategories() {
  quoteCategoriesList.innerHTML = '';
  try {
    const res = await fetch('https://api.quotable.io/tags');
    if (!res.ok) throw new Error('Could not fetch tags');
    const allTags = await res.json();
    const data = await browser.storage.local.get('quoteTags');
    const savedTags = new Set(data.quoteTags || []);
    allTags.sort((a, b) => a.name.localeCompare(b.name));
    allTags.forEach(tag => {
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
  } catch (error) {
    console.error('Failed to populate quote categories:', error);
    quoteCategoriesList.innerHTML = 'Error loading categories.';
  }
}

function setupQuoteWidget() {
  quoteSettingsBtn.addEventListener('click', () => {
    quoteSettingsPanel.classList.remove('hidden');
    quoteWidget.classList.add('hidden');
    populateQuoteCategories();
  });
  closeQuoteSettingsBtn.addEventListener('click', () => {
    quoteSettingsPanel.classList.add('hidden');
    quoteWidget.classList.remove('hidden');
  });
  saveQuoteSettingsBtn.addEventListener('click', async () => {
    const selectedPills = quoteCategoriesList.querySelectorAll('.quote-category-pill.selected');
    const selectedTags = Array.from(selectedPills).map(pill => pill.dataset.value);
    await browser.storage.local.set({ quoteTags: selectedTags });
    quoteSettingsPanel.classList.add('hidden');
    quoteWidget.classList.remove('hidden');
    fetchQuote();
  });
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
}

function applySidebarVisibility(showSidebar = true) {
  appShowSidebarPreference = showSidebar !== false;
  document.body.classList.toggle('sidebar-hidden', !appShowSidebarPreference);
  updateSidebarCollapseState();
}

function applyPerformanceMode(enabled) {
  appPerformanceModePreference = enabled;
  document.body.classList.toggle('performance-mode', enabled);
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
      APP_CONTAINER_MODE_KEY,
      APP_CONTAINER_NEW_TAB_KEY
    ]);
    applyTimeFormatPreference(stored[APP_TIME_FORMAT_KEY] || '12-hour');
    applySidebarVisibility(stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true);
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
    appPerformanceModePreference = stored[APP_PERFORMANCE_MODE_KEY] === true;
    appContainerModePreference = stored[APP_CONTAINER_MODE_KEY] !== false;
    appContainerNewTabPreference = stored[APP_CONTAINER_NEW_TAB_KEY] !== false;
    applyBookmarkFallbackColor(appBookmarkFallbackColorPreference);
    applyBookmarkFolderColor(appBookmarkFolderColorPreference);
    applyPerformanceMode(appPerformanceModePreference);

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

function syncAppSettingsForm() {
  if (appTimeFormatSelect) {
    appTimeFormatSelect.value = timeFormatPreference;
  }
  if (appSidebarToggle) {
    appSidebarToggle.checked = appShowSidebarPreference;
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
  const perfToggle = document.getElementById('app-performance-mode-toggle');
  if (perfToggle) {
    perfToggle.checked = appPerformanceModePreference;
  }
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
  appSettingsModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeAppSettingsModal() {
  if (!appSettingsModal) return;
  appSettingsModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  syncAppSettingsForm();
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
  if (appSettingsSaveBtn) {
    appSettingsSaveBtn.addEventListener('click', async () => {
      const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';
      const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;
      const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;
      const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;
      const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;
      const nextBookmarkNewTab = document.getElementById('app-bookmark-open-new-tab-toggle')?.checked || false;
      const nextBookmarkTextBg = document.getElementById('app-bookmark-text-bg-toggle')?.checked || false;
      const nextContainerMode = document.getElementById('app-container-mode-toggle')?.checked ?? true;
      const radioKeepBehavior = document.querySelector('input[name="container-behavior"][value="keep"]');
      const nextContainerNewTab = radioKeepBehavior ? radioKeepBehavior.checked : appContainerNewTabPreference;
      const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');
      const nextTextBgColor = textBgColorTrigger ? (textBgColorTrigger.dataset.value || textBgColorTrigger.style.backgroundColor) : '#2CA5FF';
      const nextOpacity = parseFloat(document.getElementById('app-bookmark-text-opacity-slider')?.value || 0.65);
      const nextBlur = parseInt(document.getElementById('app-bookmark-text-blur-slider')?.value || 4, 10);
      const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');
      const nextFallbackColor = colorTrigger ? (colorTrigger.dataset.value || colorTrigger.style.backgroundColor) : '#00b8d4';
      const folderTrigger = document.getElementById('app-bookmark-folder-color-trigger');
      const nextFolderColor = folderTrigger ? (folderTrigger.dataset.value || folderTrigger.style.backgroundColor) : '#FFFFFF';
      const nextPerformanceMode = document.getElementById('app-performance-mode-toggle')?.checked || false;
      const nextSingletonMode = (() => {
        const toggle = document.getElementById('app-singleton-mode-toggle');
        return toggle ? toggle.checked : false;
      })();
      const nextRememberEngine = appSearchRememberEngineToggle ? appSearchRememberEngineToggle.checked : true;
      const nextDefaultEngine = appSearchDefaultEngineSelect && appSearchDefaultEngineSelect.value ? appSearchDefaultEngineSelect.value : appSearchDefaultEnginePreference;
      const nextMath = appSearchMathToggle ? appSearchMathToggle.checked : true;
      const nextSearchHistory = appSearchHistoryToggle ? appSearchHistoryToggle.checked : false;

      applyTimeFormatPreference(nextFormat);
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
      appBookmarkFallbackColorPreference = nextFallbackColor;
      appBookmarkFolderColorPreference = nextFolderColor;
      appPerformanceModePreference = nextPerformanceMode;
      appSingletonModePreference = nextSingletonMode;
      applyBookmarkFallbackColor(nextFallbackColor);
      applyBookmarkFolderColor(nextFolderColor);
      applyPerformanceMode(nextPerformanceMode);
      updateTime();

      try {
        await browser.storage.local.set({
          [APP_TIME_FORMAT_KEY]: nextFormat,
          [APP_SHOW_SIDEBAR_KEY]: nextSidebarVisible,
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
          [APP_SEARCH_REMEMBER_ENGINE_KEY]: nextRememberEngine,
          [APP_SEARCH_MATH_KEY]: nextMath,
          [APP_SEARCH_SHOW_HISTORY_KEY]: nextSearchHistory,
          [APP_SEARCH_DEFAULT_ENGINE_KEY]: nextDefaultEngine,
          [APP_SINGLETON_MODE_KEY]: nextSingletonMode,
          [APP_PERFORMANCE_MODE_KEY]: nextPerformanceMode
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

function setupSearchEnginesModal() {
  const modal = document.getElementById('search-engines-modal');
  const openBtn = document.getElementById('manage-search-engines-btn');
  const saveBtn = document.getElementById('search-engines-save-btn');
  const cancelBtn = document.getElementById('search-engines-cancel-btn');
  const listContainer = document.getElementById('search-engines-modal-list');

  if (!modal || !openBtn || !saveBtn || !cancelBtn || !listContainer) return;

  const closeModal = () => {
    modal.style.display = 'none';
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
          <span class="engine-toggle-icon" aria-hidden="true">${engine.icon}</span>
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
    modal.style.display = 'flex';
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

// Icons are defined in icons.js and exposed globally.
const ICONS = window.ICONS || {};
const ICON_CATEGORIES = {
  'Essentials': ['home', 'star', 'heart', 'globe', 'flag', 'fire', 'bolt'],
  'Finance': ['bank', 'wallet', 'dollar', 'euro', 'bitcoin', 'piggy'],
  'Shopping': ['cart', 'bag', 'tag', 'store', 'gift'],
  'Gaming': ['gamepad', 'controller', 'pacman', 'dice', 'puzzle'],
  'Religion': ['cross', 'moon_star', 'star_david', 'om', 'yin_yang', 'peace'],
  'Moods': ['smile', 'sad', 'wink', 'cool', 'neutral'],
  'Nature': ['paw', 'dog', 'cat', 'bird', 'fish', 'leaf'],
  'Brands': ['apple', 'android', 'windows', 'chrome', 'google', 'twitter', 'facebook', 'instagram', 'youtube', 'amazon'],
  'Work': ['briefcase', 'mail', 'calendar', 'chart', 'document'],
  'Education': ['school', 'book', 'microscope', 'lightbulb'],
  'Media': ['play', 'music', 'game', 'image'],
  'Social': ['chat', 'group', 'user', 'phone'],
  'Travel': ['flight', 'map', 'car', 'camera'],
  'System': ['settings', 'lock', 'shield', 'trash', 'download']
};

let searchEngines = [
  { 
    id: 'google', 
    name: 'Google', 
    color: '#4285F4',
    enabled: true, 
    url: 'https://www.google.com/search?q=', 
    suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',
    icon: ICONS.google
  },
  { 
    id: 'youtube', 
    name: 'YouTube', 
    color: '#FF0000',
    enabled: true, 
    url: 'https://www.youtube.com/results?search_query=', 
    suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=',
    icon: ICONS.youtube
  },
  { 
    id: 'duckduckgo', 
    name: 'DuckDuckGo', 
    color: '#DE5833',
    enabled: true, 
    url: 'https://duckduckgo.com/?q=', 
    suggestionUrl: 'https://duckduckgo.com/ac/?type=json&q=',
    icon: ICONS.duckduckgo
  },
  { 
    id: 'bing', 
    name: 'Bing', 
    color: '#008373',
    enabled: true, 
    url: 'https://www.bing.com/search?q=', 
    suggestionUrl: 'https://api.bing.com/osjson.aspx?query=',
    icon: ICONS.bing
  },
  { 
    id: 'wikipedia', 
    name: 'Wikipedia', 
    color: '#000000',
    enabled: true, 
    url: 'https://en.wikipedia.org/wiki/Special:Search?search=', 
    suggestionUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=',
    icon: ICONS.wikipedia
  },
  { 
    id: 'reddit', 
    name: 'Reddit', 
    color: '#FF4500',
    enabled: false, 
    url: 'https://www.reddit.com/search/?q=', 
    suggestionUrl: '',
    icon: ICONS.reddit 
  },
  { 
    id: 'github', 
    name: 'GitHub', 
    color: '#181717',
    enabled: false, 
    url: 'https://github.com/search?q=', 
    suggestionUrl: '',
    icon: ICONS.github
  },
  { 
    id: 'stackoverflow', 
    name: 'StackOverflow', 
    color: '#F48024',
    enabled: false, 
    url: 'https://stackoverflow.com/search?q=', 
    suggestionUrl: '',
    icon: ICONS.stackoverflow 
  },
  { id: 'amazon', name: 'Amazon', color: '#FF9900', enabled: false, url: 'https://www.amazon.com/s?k=', suggestionUrl: 'https://completion.amazon.com/search/complete?search-alias=aps&client=amazon-search-ui&mkt=1&q=', icon: ICONS.amazon },
  { id: 'maps', name: 'Maps', color: '#34A853', enabled: false, url: 'https://www.google.com/maps/search/', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=', icon: ICONS.maps },
  { id: 'yahoo', name: 'Yahoo', color: '#6001D2', enabled: false, url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://ff.search.yahoo.com/gossip?output=json&command=', icon: ICONS.yahoo },
  { id: 'yandex', name: 'Yandex', color: '#FC3F1D', enabled: false, url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ff.cgi?part=', icon: ICONS.yandex }
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

  const iconHtml = engine.icon || `<span style="font-weight:bold; font-size:12px; color:#555;">${engine.name.charAt(0)}</span>`;
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
    const iconHtml = engine.icon || `<span style="font-weight:bold; font-size:12px; color:#555;">${engine.name.charAt(0)}</span>`;
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
            <img src="https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64" alt="">
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
            ${item.engine.icon || ''}
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
  const searchIcon = ICONS.search || '';
  const clockIcon = ICONS.historyClock || '';

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
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const tempUnitToggle = document.getElementById('temp-unit-toggle');
const locationSearchInput = document.getElementById('location-search-input');
const locationResults = document.getElementById('location-results');
const saveSettingsBtn = document.getElementById('save-settings-btn');
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
    cachedUnits: units
  });

  revealWidget('.widget-weather');
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
  modal.style.display = 'flex';

  const closeAlert = () => {
    modal.style.display = 'none';
    okBtn.removeEventListener('click', closeAlert);
  };

  okBtn.addEventListener('click', closeAlert);

  modal.onclick = (e) => {
    if (e.target === modal) closeAlert();
  };

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
          ${ICONS.bookmarkFolderLarge || ''}
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
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      if (closeBtn) closeBtn.removeEventListener('click', onCancel);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
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
  const query = locationSearchInput.value;
  if (query.length < 3) {
    locationResults.innerHTML = '';
    locationResults.classList.add('hidden');
    return;
  }
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();
    locationResults.innerHTML = '';
    if (geoData.results && geoData.results.length > 0) {
      geoData.results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'location-result-item';
        item.innerHTML = `${result.name}, <span>${result.admin1 || ''} ${result.country}</span>`;
        item.addEventListener('click', () => {
          selectedLocation = result;
          locationSearchInput.value = `${result.name}, ${result.country}`;
          locationResults.classList.add('hidden');
          locationResults.innerHTML = '';
        });
        locationResults.appendChild(item);
      });
      locationResults.classList.remove('hidden');
    } else {
      locationResults.classList.add('hidden');
    }
  } catch (error) {
    console.error('Location search error:', error);
  }
}

async function setupWeather() {
  settingsBtn.addEventListener('click', async () => {
    const data = await browser.storage.local.get(['weatherCityName', 'weatherUnits']);
    tempUnitToggle.checked = (data.weatherUnits === 'fahrenheit');
    locationSearchInput.value = (data.weatherCityName === 'Current Location') ? '' : (data.weatherCityName || '');
    selectedLocation = null;
    locationResults.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    weatherWidget.classList.add('hidden');
  });
  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    weatherWidget.classList.remove('hidden');
  });
  setLocationBtn.addEventListener('click', async () => {
    await browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName']);
    startGeolocation();
  });
  locationSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(searchForLocation, 300);
  });
  saveSettingsBtn.addEventListener('click', async () => {
    const newUnit = tempUnitToggle.checked ? 'fahrenheit' : 'celsius';
    let settingsToSave = { weatherUnits: newUnit };
    if (selectedLocation) {
      settingsToSave.weatherLat = selectedLocation.latitude;
      settingsToSave.weatherLon = selectedLocation.longitude;
      settingsToSave.weatherCityName = selectedLocation.name;
    }
    await browser.storage.local.set(settingsToSave);
    settingsPanel.classList.add('hidden');
    weatherWidget.classList.remove('hidden');
    const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
    if (data.weatherLat) {
      fetchWeather(data.weatherLat, data.weatherLon, data.weatherUnits, data.weatherCityName);
    } else {
      startGeolocation();
    }
  });

  const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
  const units = data.weatherUnits || 'celsius';
  if (data.weatherLat && data.weatherLon) {
    fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName);
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

  // Control loop manually so we can overlap and fade
  videos.forEach((v, idx) => {
    v.loop = false;
    v.preload = idx === 0 ? 'auto' : 'metadata'; // avoid eager downloads
    v.muted = true;
    v.playsInline = true;
  });

  const fadeMs = 1400;   // Duration of the crossfade (slightly longer)
  const bufferMs = 400;  // Padding before the end to start the fade
  const safeDurationMs = 15000; // Fallback if metadata is missing
  const fadeSec = fadeMs / 1000;
  const bufferSec = bufferMs / 1000;

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
      try {
        primeNext();
        next.currentTime = 0;
        await next.play();
        next.classList.add('is-active');
        current.classList.remove('is-active');

        setTimeout(() => {
          current.pause();
          current.currentTime = 0;
          startCycle(next, current);
        }, fadeMs + 50);
      } catch (err) {
        console.warn('Background video crossfade failed:', err);
      }
    };

    const onTimeUpdate = () => {
      const duration = current.duration || safeDurationMs / 1000;
      const startFadeAt = Math.max(1, duration - fadeSec - bufferSec);
      if (current.currentTime >= startFadeAt) {
        current.removeEventListener('timeupdate', onTimeUpdate);
        doFade();
      }
    };

    current.addEventListener('timeupdate', onTimeUpdate);
    current.addEventListener('ended', () => {
      current.removeEventListener('timeupdate', onTimeUpdate);
      doFade();
    }, { once: true });
  };

  const [first, second] = videos;

  const startPlayback = async () => {
    try {
      await first.play();
      first.classList.add('is-active');
      startCycle(first, second);
    } catch (err) {
      console.warn('Autoplay blocked for background video:', err);
    }
  };

  if (first.readyState >= 1) {
    startPlayback();
  } else {
    first.addEventListener('loadedmetadata', startPlayback, { once: true });
  }
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

function isLightColor(hex, alpha = 1) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return false;
  const rgb = parseInt(clean, 16);
  if (Number.isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  // Blend against a light backdrop to account for transparency
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha)));
  const blendedR = r * clampedAlpha + 255 * (1 - clampedAlpha);
  const blendedG = g * clampedAlpha + 255 * (1 - clampedAlpha);
  const blendedB = b * clampedAlpha + 255 * (1 - clampedAlpha);

  const luma = 0.2126 * blendedR + 0.7152 * blendedG + 0.0722 * blendedB;
  return luma > 150;
}

/**
 * Converts HSL (0-1) to RGB (0-255)
 */
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Converts RGB (0-255) to HSL (h 0-360, s/l 0-1)
 */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

/**
 * Grayish complementary color using HSL:
 * - Hue shifted 180°
 * - Saturation clamped to 20-40%
 * - Lightness set to 30% for light backgrounds, 70% for dark
 */
function getComplementaryColor(hex) {
  const clean = (hex || '#ffffff').replace(/^#/, '').toLowerCase();
  if (clean.length !== 6) return '#000000';

  // Special case: original slate gray for pure white folders
  if (clean === 'ffffff') {
    return '#94a3b8';
  }

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#000000';

  // Perceived luminance (luma) for better light/dark decision
  const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
  const isBgLight = luma > 140;

  const [hOrig] = rgbToHsl(r, g, b);

  // Complementary hue
  const hComp = (hOrig + 180) % 360;

  // Fixed grayish saturation for non-neon look
  const sFinal = 0.25;

  // High-contrast lightness based on perceived brightness
  const lFinal = isBgLight ? 0.25 : 0.85;

  const [finalR, finalG, finalB] = hslToRgb(hComp / 360, sFinal, lFinal);

  const toHex = (n) => {
    const clamped = Math.min(255, Math.max(0, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };

  return `#${toHex(finalR)}${toHex(finalG)}${toHex(finalB)}`;
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
    clearBookmarkLoadingStates();
    await ensureDailyWallpaper();
    setupBackgroundVideoCrossfade();
    await loadAppSettingsFromStorage();
    await loadFolderMetadata();
    syncAppSettingsForm();
    setupContainerMode();
    updateTime();
  setInterval(updateTime, 1000 * 60);
  setupDockNavigation();
  setupAppSettingsModal();
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
    await loadCachedQuote();
    await loadCachedWeather();
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
      if (item.classList.contains('back-button')) return;
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
  if (bookmarksGrid && gridBlankMenu) {
    bookmarksGrid.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.bookmark-item')) {
        return; // regular item menus handle this
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
  }

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
  const likeOutlineIcon = ICONS.heartOutline || '';
  const likeFilledIcon = ICONS.heartFilled || '';
  const likeCelebrateIcon = ICONS.heartCelebrate || '';

  card.innerHTML = `
    <img class="gallery-card-image" src="${posterSrc}" alt="${item.title || 'Wallpaper'}" loading="${loadingAttr}" referrerpolicy="no-referrer" />
    
    <div class="gallery-fav-btn con-like ${isFavorite ? 'is-active' : ''}" aria-label="Favorite this wallpaper">
      <input class="like" type="checkbox" title="like" ${isFavorite ? 'checked' : ''}>
      <div class="checkmark">
        ${likeOutlineIcon}
        ${likeFilledIcon}
        ${likeCelebrateIcon}
      </div>
    </div>
    
    <div class="gallery-card-meta">
      <span class="gallery-card-title ${needsMarquee ? 'gallery-marquee' : ''}" ${needsMarquee ? `style="--gallery-marquee-duration:${marqueeDuration}s"` : ''}><span>${titleText}</span></span>
      <button type="button" class="gallery-card-apply apply-button" aria-label="Apply this wallpaper">
        Apply
      </button>
    </div>
    ${tagsHtml ? `<div class="gallery-card-tags">${tagsHtml}</div>` : ''}
  `;

  const tagButtons = card.querySelectorAll('.gallery-card-tag');
  tagButtons.forEach((tagEl) => {
    tagEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagValue = (tagEl.dataset.tag || tagEl.textContent || '').trim();
      if (tagValue) {
        setGalleryTagFilter(tagValue);
      }
    });
  });

  const applyBtn = card.querySelector('.gallery-card-apply');
  applyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await applyGalleryWallpaper(item);
  });

  // === UPDATED CLICK HANDLER FOR FAVORITES ===
  const favBtn = card.querySelector('.gallery-fav-btn');
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Stop the card click (which applies wallpaper)
    
    const checkbox = favBtn.querySelector('.like');
    
    // If the user clicked the div but not the input directly (rare, but possible), toggle manually
    if (e.target !== checkbox) {
      checkbox.checked = !checkbox.checked;
    }
    
    const isNowChecked = checkbox.checked; 

    // 1. Handle visual classes locally so we see immediate feedback/animation
    if (isNowChecked) {
      favBtn.classList.add('is-active');
      favBtn.classList.add('animating'); // Triggers the confetti via CSS
      
      // Remove animation class after 700ms so it can be re-triggered later
      setTimeout(() => favBtn.classList.remove('animating'), 700);
    } else {
      favBtn.classList.remove('is-active');
      favBtn.classList.remove('animating');
    }

    // 2. Determine if we should refresh the entire grid
    // If we are in the 'Favorites' tab, we MUST re-render to remove the un-liked item.
    // If we are in 'Gallery' or 'All', we SKIP re-render to keep the animation playing.
    const shouldSkipRender = gallerySection !== 'favorites';
    
    await toggleFavorite(item.id, shouldSkipRender);
  });

  card.addEventListener('click', async () => {
    await applyGalleryWallpaper(item);
  });

  return card;
}

async function applyGalleryWallpaper(item) {
  const selection = {
    id: item.id,
    videoUrl: item.url,
    posterUrl: item.posterUrl || item.poster || '',
    posterCacheKey: item.poster || item.posterUrl || '',
    videoCacheKey: item.url || '',
    title: item.title || '',
    selectedAt: Date.now()
  };

  const hydrated = await hydrateWallpaperSelection(selection);

  await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: hydrated });
  currentWallpaperSelection = hydrated;
  const type = await getWallpaperTypePreference();
  applyWallpaperByType(hydrated, type);
  runWhenIdle(() => cacheAppliedWallpaperVideo(hydrated));
  // Close modal after applying
  closeGalleryModal();
}

async function openGalleryModal() {
  if (!galleryModal || !galleryGrid) return;
  galleryModal.classList.remove('hidden');
  document.body.classList.add('modal-open');

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
      if (!hydrated || !galleryModal || galleryModal.classList.contains('hidden')) return;
      galleryManifest = Array.isArray(hydrated) ? hydrated : manifestList;
      renderCurrentGallery();
    });
  } catch (err) {
    console.warn('Could not load gallery manifest', err);
  }
}

function closeGalleryModal() {
  if (!galleryModal) return;
  galleryModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function renderGallery(manifest = []) {
  if (!galleryGrid) return;
  galleryGrid.innerHTML = '';
  manifest.forEach((item, idx) => {
    const card = buildGalleryCard(item, idx);
    galleryGrid.appendChild(card);
  });
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
  const observer = getMyWallpaperMediaObserver();
  observer.disconnect();
  myWallpapersGrid.innerHTML = '';
  const items = Array.isArray(myWallpapers) ? myWallpapers : [];
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'gallery-card mw-card';
    const titleText = item.title || 'Wallpaper';
    const needsMarquee = titleText.length > 20;
    const marqueeDuration = 6; // uniform speed for all marquee titles
    const isVideo = item.type === 'video';
    const isGif = isVideo && (item.mimeType === 'image/gif' || (item.title || '').toLowerCase().endsWith('.gif'));
    const binTopIcon = ICONS.binTop || '';
    const binBottomIcon = ICONS.binBottom || '';
    const binGarbageIcon = ICONS.binGarbage || '';
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
        observer.observe(media);
      } else {
        delete media.dataset.wallpaperId;
        renderMyWallpaperMedia(media, item);
      }
    }
    const applyBtn = card.querySelector('.mw-card-btn');
    applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyMyWallpaper(item);
    });
    const deleteBtn = card.querySelector('.mw-card-remove');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMyWallpaper(item.id);
    });
    card.addEventListener('click', () => applyMyWallpaper(item));
    myWallpapersGrid.appendChild(card);
  });

  const hasItems = items.length > 0;
  myWallpapersGrid.classList.toggle('hidden', !hasItems);
  if (myWallpapersEmptyCard) {
    myWallpapersEmptyCard.classList.toggle('hidden', hasItems);
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
  
  // Find the correct file based on mode
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

  if (isLive) {
    const cacheKey = normalizeWallpaperCacheKey(`mywallpaper-cache-${id}`);
    
    // --- FIX START: Force correct MIME type for MP4s ---
    let mimeType = file.type;
    const nameLower = (file.name || '').toLowerCase();
    
    // If browser didn't detect type, or defaulted to generic, force video/mp4
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (nameLower.endsWith('.mp4')) {
        mimeType = 'video/mp4';
      } else if (nameLower.endsWith('.gif')) {
        mimeType = 'image/gif';
      }
    }
    // --- FIX END ---

    // Save to cache with the CORRECT mime type
    await cacheUserWallpaperFile(cacheKey, file, mimeType);

    let posterUrl = '';
    if (mimeType === 'image/gif') {
      posterUrl = await readFileAsDataUrl(file);
    } else {
      posterUrl = await buildVideoPosterFromFile(file);
    }

    if (!posterUrl) {
      posterUrl = 'assets/fallback.webp';
    }

    const item = {
      id,
      cacheKey,
      mimeType: mimeType || 'video/mp4', // Store it explicitly
      title,
      type: 'video',
      posterUrl
    };

    myWallpapers.unshift(item);
    await persistMyWallpapers();
    renderMyWallpapers();
    return;
  }

  // Static image handling...
  const dataUrl = await readFileAsDataUrl(file);
  if (!dataUrl) {
    alert('Unable to load that image. Please try another file.');
    return;
  }
  const item = {
    id,
    url: dataUrl,
    posterUrl: dataUrl,
    title,
    type: 'image',
    mimeType: file.type || ''
  };
  myWallpapers.unshift(item);
  await persistMyWallpapers();
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
window.addEventListener('pageshow', clearBookmarkLoadingStates);
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
    clearBookmarkLoadingStates();

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
    applyWallpaperBackground(poster);
    if (finalType === 'video' && video) {
      setBackgroundVideoSources(video, poster);
      startBackgroundVideos();
    } else {
      clearBackgroundVideos();
    }
    lastAppliedWallpaper = {
      id: selection.id || null,
      poster,
      video,
      type: finalType
    };
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
  videos.forEach((v, idx) => {
    v.muted = true;
    v.playsInline = true;
    if (idx === 0) {
      v.classList.add('is-active');
    }
    v.play().catch(() => {});
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
