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

window.addEventListener('pointermove', handleGridDragPointerMove);

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
  const tooltipText = isLoading ? NEXT_WALLPAPER_TOOLTIP_LOADING : NEXT_WALLPAPER_TOOLTIP_DEFAULT;
  nextWallpaperBtn.setAttribute('aria-label', tooltipText);
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
let editFolderIconSpan;
let editFolderTextSpan;
let editFolderTargetId = null;

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
  if (!editFolderModal) {
    return;
  }

  editFolderDialog = document.getElementById('edit-folder-dialog');
  editFolderNameInput = document.getElementById('edit-folder-name-input');
  editFolderSaveBtn = document.getElementById('edit-folder-save-btn');
  editFolderCancelBtn = document.getElementById('edit-folder-cancel-btn');
  editFolderCloseBtn = document.getElementById('edit-folder-close-btn');
  editFolderIconSpan = document.getElementById('edit-folder-icon');
  editFolderTextSpan = document.getElementById('edit-folder-text');

  editFolderSaveBtn.addEventListener('click', handleEditFolderSave);
  editFolderCancelBtn.addEventListener('click', hideEditFolderModal);
  editFolderCloseBtn.addEventListener('click', hideEditFolderModal);

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editFolderModal.style.display === 'flex') {
      hideEditFolderModal();
    }
  });
}

function showEditFolderModal(folderNode) {
  if (!editFolderModal || !folderNode) {
    return;
  }

  editFolderTargetId = folderNode.id;
  const folderTitle = folderNode.title || 'Folder';

  if (editFolderIconSpan) {
    editFolderIconSpan.innerHTML = `
      <svg class="bookmark-folder-icon" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
      </svg>
    `;
  }

  if (editFolderTextSpan) {
    editFolderTextSpan.textContent = `Edit "${folderTitle}"`;
  }

  if (editFolderNameInput) {
    editFolderNameInput.value = folderNode.title || '';
  }

  editFolderModal.style.display = 'flex';

  if (editFolderNameInput) {
    editFolderNameInput.focus();
    editFolderNameInput.select();
  }
}

function hideEditFolderModal() {
  if (!editFolderModal) {
    return;
  }

  editFolderModal.style.display = 'none';
  editFolderTargetId = null;
  if (editFolderNameInput) {
    editFolderNameInput.value = '';
  }
}

async function handleEditFolderSave() {
  if (!editFolderTargetId || !editFolderNameInput) {
    return;
  }

  const newName = editFolderNameInput.value.trim();
  if (!newName) {
    alert('Please provide a folder name.');
    return;
  }

  try {
    await browser.bookmarks.update(editFolderTargetId, { title: newName });

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
      loadBookmarks(editFolderTargetId);
    }

    hideEditFolderModal();
  } catch (err) {
    console.error('Error updating folder name:', err);
    alert('Error: Could not update the folder name.');
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
  const firstLetter = title.charAt(0).toUpperCase();

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bookmark-icon-wrapper';

  const fallbackIcon = document.createElement('div');
  fallbackIcon.className = 'bookmark-fallback-icon';
  fallbackIcon.textContent = firstLetter;
  iconWrapper.appendChild(fallbackIcon);

  const imgIcon = document.createElement('img');

  imgIcon.addEventListener('load', () => {
    if (imgIcon.naturalWidth > 16) {
      iconWrapper.innerHTML = '';
      iconWrapper.appendChild(imgIcon);
      iconWrapper.appendChild(loader);
    }
  });

  imgIcon.addEventListener('error', () => {
    // Do nothing, fallback is already visible
  });

  imgIcon.src = `https://s2.googleusercontent.com/s2/favicons?domain=${bookmarkNode.url}&sz=64`;

  const loader = document.createElement('div');
  loader.className = 'bookmark-loading-spinner';
  iconWrapper.appendChild(loader);

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
  // --- CHANGED from <a> to <div> ---
  const item = document.createElement('div');
  item.className = 'bookmark-item';

  // --- D&D attributes ---
  item.dataset.bookmarkId = folderNode.id;
  item.dataset.isFolder = 'true';

  item.innerHTML = `
    <div class="bookmark-icon-wrapper">
      <svg
        class="bookmark-folder-icon"
        width="48"
        height="40"
        viewBox="0 0 64 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 10
             C8 7.8 9.8 6 12 6
             H26
             L30 10
             H52
             C54.2 10 56 11.8 56 14
             V18
             H8
             Z"
          fill="#EDEDED"
        />

        <rect
          x="8"
          y="14"
          width="48"
          height="30"
          rx="6"
          ry="6"
          fill="#FFFFFF"
        />
      </svg>
    </div>
    <span>${folderNode.title}</span>
  `;

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
  addButton.innerHTML = `
    <svg class="bookmark-tabs__plus-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  `;
  
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

async function loadAppSettingsFromStorage() {
  try {
    const stored = await browser.storage.local.get([
      APP_TIME_FORMAT_KEY,
      APP_SHOW_SIDEBAR_KEY,
      APP_MAX_TABS_KEY,
      APP_AUTOCLOSE_KEY,
      APP_SINGLETON_MODE_KEY,
      APP_SEARCH_OPEN_NEW_TAB_KEY
    ]);
    applyTimeFormatPreference(stored[APP_TIME_FORMAT_KEY] || '12-hour');
    applySidebarVisibility(stored.hasOwnProperty(APP_SHOW_SIDEBAR_KEY) ? stored[APP_SHOW_SIDEBAR_KEY] !== false : true);
    appMaxTabsPreference = parseInt(stored[APP_MAX_TABS_KEY] || 0, 10);
    appAutoClosePreference = parseInt(stored[APP_AUTOCLOSE_KEY] || 0, 10);
    appSingletonModePreference = stored[APP_SINGLETON_MODE_KEY] === true;
    appSearchOpenNewTabPreference = stored[APP_SEARCH_OPEN_NEW_TAB_KEY] === true;

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
  });

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
  if (appSettingsSaveBtn) {
    appSettingsSaveBtn.addEventListener('click', async () => {
      const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';
      const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;
      const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;
      const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;
      const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;
      const nextSingletonMode = (() => {
        const toggle = document.getElementById('app-singleton-mode-toggle');
        return toggle ? toggle.checked : false;
      })();

      applyTimeFormatPreference(nextFormat);
      applySidebarVisibility(nextSidebarVisible);
      appMaxTabsPreference = nextMaxTabs;
      appAutoClosePreference = nextAutoClose;
      appSearchOpenNewTabPreference = nextSearchOpenNewTab;
      appSingletonModePreference = nextSingletonMode;
      updateTime();

      try {
        await browser.storage.local.set({
          [APP_TIME_FORMAT_KEY]: nextFormat,
          [APP_SHOW_SIDEBAR_KEY]: nextSidebarVisible,
          [APP_MAX_TABS_KEY]: nextMaxTabs,
          [APP_AUTOCLOSE_KEY]: nextAutoClose,
          [APP_SEARCH_OPEN_NEW_TAB_KEY]: nextSearchOpenNewTab,
          [APP_SINGLETON_MODE_KEY]: nextSingletonMode
        });
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

  const renderList = () => {
    listContainer.innerHTML = '';
    searchEngines.forEach((engine) => {
      const div = document.createElement('div');
      div.className = 'engine-toggle-item';
      div.innerHTML = `
        <span>${engine.name}</span>
        <label class="app-switch">
          <input type="checkbox" class="engine-toggle-checkbox" data-id="${engine.id}" ${engine.enabled ? 'checked' : ''}>
          <span class="app-switch-track"></span>
        </label>
      `;
      listContainer.appendChild(div);
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
    const toggles = listContainer.querySelectorAll('.engine-toggle-checkbox');
    const newConfig = {};

    toggles.forEach((toggle) => {
      const id = toggle.dataset.id;
      const isEnabled = toggle.checked;
      newConfig[id] = isEnabled;
      const engine = searchEngines.find((e) => e.id === id);
      if (engine) engine.enabled = isEnabled;
    });

    try {
      await browser.storage.local.set({ [SEARCH_ENGINES_PREF_KEY]: newConfig });
    } catch (err) {
      console.warn('Failed to save search engines', err);
    }

    populateSearchOptions();

    const currentStillEnabled = searchEngines.find((e) => e.id === currentSearchEngine.id && e.enabled);
    if (!currentStillEnabled) {
      const firstEnabled = searchEngines.find((e) => e.enabled) || searchEngines[0];
      updateSearchUI(firstEnabled.id);
      browser.storage.local.set({ currentSearchEngineId: firstEnabled.id }).catch((err) => {
        console.warn('Failed to persist search engine selection', err);
      });
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
  { id: 'google', name: 'Google', enabled: true, url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'youtube', name: 'YouTube', enabled: true, url: 'https://www.youtube.com/results?search_query=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', enabled: true, url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?type=json&q=' },
  { id: 'bing', name: 'Bing', enabled: true, url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=' },
  { id: 'wikipedia', name: 'Wikipedia', enabled: true, url: 'https://en.wikipedia.org/wiki/Special:Search?search=', suggestionUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=' },
  
  // OFF by default
  { id: 'reddit', name: 'Reddit', enabled: false, url: 'https://www.reddit.com/search/?q=', suggestionUrl: '' }, // No public suggestion API
  { id: 'github', name: 'GitHub', enabled: false, url: 'https://github.com/search?q=', suggestionUrl: '' }, // No public suggestion API
  { id: 'stackoverflow', name: 'StackOverflow', enabled: false, url: 'https://stackoverflow.com/search?q=', suggestionUrl: '' }, // No public suggestion API
  { id: 'amazon', name: 'Amazon', enabled: false, url: 'https://www.amazon.com/s?k=', suggestionUrl: 'https://completion.amazon.com/search/complete?search-alias=aps&client=amazon-search-ui&mkt=1&q=' },
  { id: 'maps', name: 'Maps', enabled: false, url: 'https://www.google.com/maps/search/', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { id: 'yahoo', name: 'Yahoo', enabled: false, url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://ff.search.yahoo.com/gossip?output=json&command=' },
  { id: 'yandex', name: 'Yandex', enabled: false, url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ff.cgi?part=' }
];
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

function populateSearchOptions() {
  if (!searchSelect) return;
  searchSelect.innerHTML = '';

  const activeEngines = searchEngines.filter((engine) => engine.enabled);

  if (activeEngines.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'Google';
    option.value = 'google';
    searchSelect.appendChild(option);
    return;
  }

  activeEngines.forEach((engine) => {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    searchSelect.appendChild(option);
  });
}
function updateSearchUI(engineId) {
  let engine = searchEngines.find((e) => e.id === engineId);
  if (!engine || !engine.enabled) {
    engine = searchEngines.find((e) => e.enabled) || searchEngines[0];
  }

  currentSearchEngine = engine;
  searchInput.placeholder = `Search with ${currentSearchEngine.name}`;
  if (searchSelect) {
    searchSelect.value = currentSearchEngine.id;
  }
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

async function setupSearch() {
  await loadSearchEnginePreferences();

  const debouncedSearch = debounce(handleSearchInput, 120);
  searchForm.addEventListener('submit', handleSearch);
  searchSelect.addEventListener('change', handleSearchChange);

  searchInput.addEventListener('input', e => {
    userIsTyping = true;
    debouncedSearch(e);
  });
  document.addEventListener('keydown', handleSearchKeydown);

  searchInput.addEventListener('click', e => {
    e.stopPropagation();
  });
  
  searchResultsPanel.addEventListener('click', handleSearchResultClick, true);
  searchResultsPanel.addEventListener('click', e => e.stopPropagation());

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
  await browser.storage.local.set({ currentSearchEngineId: newId });
  updateSearchUI(newId);
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
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) return;

  if (isLikelyUrl(trimmedQuery)) {
    let url = trimmedQuery;
    // Check if it already has a protocol (e.g., "http://", "mailto:", "about:")
    // We look for a colon early in the string, but exclude "localhost:" (which is host:port)
    const hasProtocol = /^[a-z][a-z0-9+.-]+:/i.test(trimmedQuery) && !trimmedQuery.startsWith('localhost:');

    if (!hasProtocol) {
      // Logic to determine HTTP vs HTTPS
      // 1. Localhost, IPs, or Intranet Shortnames (e.g. "nas/") use HTTP
      const isLocal = trimmedQuery.startsWith('localhost')
        || /^(\d{1,3}\.){3}\d{1,3}/.test(trimmedQuery)
        || trimmedQuery.indexOf('.') === -1;

      url = isLocal ? `http://${url}` : `https://${url}`;
    }
    openSearchUrl(url);
    return;
  }

  const encoded = encodeURIComponent(trimmedQuery);
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
  const target = e.target.closest('.result-item');
  if (!target) return;
  e.preventDefault();

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
  return token !== latestSearchToken || queryLower !== searchInput.value.toLowerCase().trim();
}

async function loadSearchEnginePreferences() {
  const stored = await browser.storage.local.get(SEARCH_ENGINES_PREF_KEY);
  const savedConfig = stored[SEARCH_ENGINES_PREF_KEY];

  if (savedConfig) {
    searchEngines.forEach((engine) => {
      if (Object.prototype.hasOwnProperty.call(savedConfig, engine.id)) {
        engine.enabled = savedConfig[engine.id];
      }
    });
  }

  populateSearchOptions();

  const lastEngine = await browser.storage.local.get('currentSearchEngineId');
  updateSearchUI(lastEngine.currentSearchEngineId);
  if (!lastEngine.currentSearchEngineId) {
    try {
      await browser.storage.local.set({ currentSearchEngineId: currentSearchEngine.id });
    } catch (err) {
      console.warn('Failed to persist default search engine', err);
    }
  }
}

// Function to fetch suggestions
async function fetchSearchSuggestions(query, engine) {
  // 1. If the engine has no suggestion URL (e.g. Reddit), return empty immediately
  if (!engine.suggestionUrl) return [];

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

    // Group 1: Standard OpenSearch Format (Google, Bing, YouTube, Wikipedia, Amazon, Maps)
    // Format: ["query", ["suggestion1", "suggestion2"], ...]
    const openSearchEngines = ['Google', 'Bing', 'YouTube', 'Wikipedia', 'Amazon', 'Maps'];
    if (openSearchEngines.includes(engine.name)) {
      return Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter(val => typeof val === 'string') : [];
    }

    // Group 2: DuckDuckGo (Array of objects)
    if (engine.name === 'DuckDuckGo') {
      return Array.isArray(data) ? data.map(item => item && item.phrase).filter(val => typeof val === 'string') : [];
    }

    // Group 3: Yahoo (Nested Object)
    if (engine.name === 'Yahoo') {
      const results = data?.gossip?.results;
      if (Array.isArray(results)) {
        return results
          .flatMap(entry => (entry?.nodes || []).map(node => node && node.key))
          .filter(val => typeof val === 'string');
      }
      return [];
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
      return Array.isArray(suggestionBucket)
        ? suggestionBucket
            .map(item => (Array.isArray(item) ? item[1] : item))
            .filter(val => typeof val === 'string')
        : [];
    }

    return [];
  } catch (err) {
    if (err.name === 'AbortError') {
      return null;
    }
    console.error('Suggestion fetch error:', err);
    return [];
  }
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
  const queryLower = query.toLowerCase().trim();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);
  const currentToken = ++latestSearchToken;

  // 1. Handle empty query
  if (queryLower.length === 0) {
    clearSearchUI({ clearInput: false, abortSuggestions: true });
    return;
  }
  
  // 2. Expand bar
  searchAreaWrapper.classList.add('search-focused');

  // 3. Filter Bookmarks (Synchronous) - Build HTML string
  let bookmarkHtml = '';
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
      let domain = '';
      try {
        domain = new URL(bookmarkUrl).hostname;
      } catch (err) {
        domain = '';
      }
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

  if (isStaleSearch(currentToken, queryLower)) return;

  if (bookmarkHtml !== lastBookmarkHtml) {
    const prevScroll = bookmarkResultsContainer.scrollTop;
    bookmarkResultsContainer.innerHTML = bookmarkHtml;
    bookmarkResultsContainer.scrollTop = prevScroll;
    lastBookmarkHtml = bookmarkHtml;
  }
  applySelectionToCurrentResults(previousSelection, query.trim());
  updatePanelVisibility();

  // 4. Fetch Suggestions (Asynchronous) - Build HTML string
  let suggestionHtml = '';
  const suggestionResults = await fetchSearchSuggestions(query.trim(), currentSearchEngine);
  
  if (suggestionResults === null) {
    attachHoverSync();
    return; // Aborted, do nothing
  }
  
  if (isStaleSearch(currentToken, queryLower)) return;

  if (suggestionResults && suggestionResults.length > 0) {
    const safeQuery = escapeHtml(query);
    const searchUrl = `${currentSearchEngine.url}${encodeURIComponent(query)}`;
    const safeSearchUrl = escapeHtml(searchUrl);
    suggestionHtml += `<div class="result-header">${currentSearchEngine.name} Search</div>`;
    
    // Add "Search for..."
    suggestionHtml += `
      <button type="button" class="result-item result-item-suggestion" data-url="${safeSearchUrl}">
        <svg class="suggestion-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
        <div class="result-item-info">
          <strong class="result-label">${safeQuery}</strong>
        </div>
      </button>
    `;
    
    // Add fetched suggestions (UP TO 10)
    suggestionResults.slice(0, 10).forEach(suggestion => {
      if (suggestion.toLowerCase() === query.toLowerCase()) return;
      const safeSuggestion = escapeHtml(suggestion);
      const suggestionUrl = `${currentSearchEngine.url}${encodeURIComponent(suggestion)}`;
      const safeSuggestionUrl = escapeHtml(suggestionUrl);
      suggestionHtml += `
        <button type="button" class="result-item result-item-suggestion" data-url="${safeSuggestionUrl}">
          <svg class="suggestion-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
          <div class="result-item-info">
            <strong class="result-label">${safeSuggestion}</strong>
          </div>
        </button>
      `;
    });
  }

  if (suggestionHtml !== lastSuggestionHtml) {
    const prevScroll = suggestionResultsContainer.scrollTop;
    suggestionResultsContainer.innerHTML = suggestionHtml;
    suggestionResultsContainer.scrollTop = prevScroll;
    lastSuggestionHtml = suggestionHtml;
  }

  applySelectionToCurrentResults(previousSelection, query.trim());
  attachHoverSync();

  // 6. Update visibility
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
          <svg
            class="bookmark-folder-icon"
            width="48"
            height="40"
            viewBox="0 0 64 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 10
                 C8 7.8 9.8 6 12 6
                 H26
                 L30 10
                 H52
                 C54.2 10 56 11.8 56 14
                 V18
                 H8
                 Z"
              fill="#EDEDED"
            />

            <rect
              x="8"
              y="14"
              width="48"
              height="30"
              rx="6"
              ry="6"
              fill="#FFFFFF"
            />
          </svg>
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
// --- INITIALIZE THE PAGE (MODIFIED) ---
// ===============================================
async function initializePage() {
  clearBookmarkLoadingStates();
  await ensureDailyWallpaper();
  setupBackgroundVideoCrossfade();
  await loadAppSettingsFromStorage();
  syncAppSettingsForm();
  updateTime();
  setInterval(updateTime, 1000 * 60);
  setupDockNavigation();
  setupAppSettingsModal();
  setupSearchEnginesModal();
  prefetchGalleryPosters().catch(() => {});
  runWhenIdle(() => warmGalleryPosterHydration());
  
  setupQuickActions();
  setupBookmarkModal();
  setupFolderModal();
  setupEditFolderModal();
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
          window.location.href = node.url;
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
        console.log('Manage Bookmarks menu clicked');
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

initializePage();

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

  card.innerHTML = `
    <img class="gallery-card-image" src="${posterSrc}" alt="${item.title || 'Wallpaper'}" loading="${loadingAttr}" referrerpolicy="no-referrer" />
    
    <div class="gallery-fav-btn con-like ${isFavorite ? 'is-active' : ''}" aria-label="Favorite this wallpaper">
      <input class="like" type="checkbox" title="like" ${isFavorite ? 'checked' : ''}>
      <div class="checkmark">
        <svg xmlns="http://www.w3.org/2000/svg" class="outline" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z"></path>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" class="filled" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z"></path>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" height="100" width="100" class="celebrate" aria-hidden="true">
          <polygon class="poly" points="10,10 20,20"></polygon>
          <polygon class="poly" points="10,50 20,50"></polygon>
          <polygon class="poly" points="20,80 30,70"></polygon>
          <polygon class="poly" points="90,10 80,20"></polygon>
          <polygon class="poly" points="90,50 80,50"></polygon>
          <polygon class="poly" points="80,80 70,70"></polygon>
        </svg>
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
    card.innerHTML = `
      <button type="button" class="mw-card-remove bin-button" aria-label="Delete">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 39 7" class="bin-top" aria-hidden="true">
          <line stroke-width="4" stroke="white" y2="5" x2="39" y1="5"></line>
          <line stroke-width="3" stroke="white" y2="1.5" x2="26.0357" y1="1.5" x1="12"></line>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 33 39" class="bin-bottom" aria-hidden="true">
          <mask fill="white" id="path-1-inside-1_8_19">
            <path d="M0 0H33V35C33 37.2091 31.2091 39 29 39H4C1.79086 39 0 37.2091 0 35V0Z"></path>
          </mask>
          <path mask="url(#path-1-inside-1_8_19)" fill="white" d="M0 0H33H0ZM37 35C37 39.4183 33.4183 43 29 43H4C-0.418278 43 -4 39.4183 -4 35H4H29H37ZM4 43C-0.418278 43 -4 39.4183 -4 35V0H4V35V43ZM37 0V35C37 39.4183 33.4183 43 29 43V35V0H37Z"></path>
          <path stroke-width="4" stroke="white" d="M12 6L12 29"></path>
          <path stroke-width="4" stroke="white" d="M21 6V29"></path>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 89 80" class="garbage" aria-hidden="true">
          <path fill="white" d="M20.5 10.5L37.5 15.5L42.5 11.5L51.5 12.5L68.75 0L72 11.5L79.5 12.5H88.5L87 22L68.75 31.5L75.5066 25L86 26L87 35.5L77.5 48L70.5 49.5L80 50L77.5 71.5L63.5 58.5L53.5 68.5L65.5 70.5L45.5 73L35.5 79.5L28 67L16 63L12 51.5L0 48L16 25L22.5 17L20.5 10.5Z"></path>
        </svg>
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
