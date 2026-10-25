/**
 * Homebase Wallpaper & Background Video Runtime Controller (Phase A Checkpoint)
 * Coordinates wallpaper state, pure helpers, poster encoding, day stamps,
 * and runtime compatibility bridges across Homebase dual-browser environments.
 */

// --- Wallpaper & Poster Constants ---
const TARGET_STARTUP_POSTER_DATA_URL_LENGTH = 240000;
const STARTUP_POSTER_MAX_DIM_SEQUENCE = [1280, 960, 720];
const STARTUP_POSTER_QUALITY_SEQUENCE = [0.76, 0.68, 0.6];
const STARTUP_POSTER_ENCODING_VERSION = 1;
const DAILY_ROTATION_SEEN_DELAY_MS = 8000;

const VIDEOS_JSON_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/manifest.json';
const GALLERY_ASSETS_BASE_URL = 'https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/v/';
const VIDEOS_JSON_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GALLERY_MANIFEST_FETCH_TIMEOUT_MS = 7000;
const GALLERY_POSTERS_CACHE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const NEXT_WALLPAPER_TOOLTIP_DEFAULT = 'Next Wallpaper';
const NEXT_WALLPAPER_TOOLTIP_LOADING = 'Downloading...';

// --- Shared & Operational State ---
let videosManifestPromise = null;
let pendingDailyRotationTimer = null;
let activePosterGenerationPromise = null;
let activePosterGenerationTarget = '';
let activePosterGenerationRevision = 0;
let activePosterGenerationEncodingVersion = STARTUP_POSTER_ENCODING_VERSION;
let activePosterGenerationForced = false;
let activePosterGenerationToken = 0;

let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };
let backgroundVideoSourceLoadPromise = Promise.resolve();
let backgroundVideoSourceLoadGeneration = 0;
let pendingSourceLoadOperation = null;
let wallpaperVideoStartSequence = 0;
let wallpaperResumeSequence = 0;
let backgroundVideoCrossfadeSetupKey = '';
let videoPlaybackController = null;
let backgroundCrossfadeTimeout = null;
let activeCrossfadeTransition = null;

function createSourceLoadOperation(generation) {
  let settled = false;
  const tasks = [];
  const scheduledHandles = [];

  const operation = {
    generation,
    get settled() {
      return settled;
    },
    registerHandle: (type, id) => {
      if (settled) {
        try {
          if (type === 'raf' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
          } else if (type === 'timeout' && typeof clearTimeout === 'function') {
            clearTimeout(id);
          }
        } catch (_) {}
        return;
      }
      scheduledHandles.push({ type, id });
    },
    unregisterHandle: (id) => {
      const idx = scheduledHandles.findIndex((h) => h.id === id);
      if (idx !== -1) {
        scheduledHandles.splice(idx, 1);
      }
    },
    addTaskCompletion: (completeFn) => {
      if (settled) {
        try { completeFn(); } catch (_) {}
        return;
      }
      tasks.push(completeFn);
    },
    cancelAndSettle: () => {
      if (settled) return;
      settled = true;
      if (pendingSourceLoadOperation === operation) {
        pendingSourceLoadOperation = null;
      }
      while (scheduledHandles.length > 0) {
        const handle = scheduledHandles.pop();
        try {
          if (handle.type === 'raf' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(handle.id);
          } else if (handle.type === 'timeout' && typeof clearTimeout === 'function') {
            clearTimeout(handle.id);
          }
        } catch (_) {}
      }
      while (tasks.length > 0) {
        const complete = tasks.shift();
        try {
          complete();
        } catch (_) {}
      }
    },
    finishIfCurrent: () => {
      if (settled) return;
      settled = true;
      if (pendingSourceLoadOperation === operation) {
        pendingSourceLoadOperation = null;
      }
    }
  };

  return operation;
}

function cancelPendingSourceLoadOperation() {
  if (pendingSourceLoadOperation) {
    const op = pendingSourceLoadOperation;
    op.cancelAndSettle();
  }
}


let galleryHydrationWarmPromise = null;

let currentWallpaperSelection = null;
let wallpaperTypePreference = null; // 'video' | 'static'
let wallpaperQualityPreference = 'low';
let dailyRotationPreference = true;
let initialWallpaperState = {};

// --- Pure Helpers: Date & Day Stamps ---
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

function isDailyWallpaperRotationDue(selection, allowDailyRotation, now = Date.now()) {
  if (allowDailyRotation === false || !selection) return false;
  const selectedAt = Number(selection.selectedAt || 0);
  return Number.isFinite(selectedAt) && selectedAt > 0 && isNewLocalDay(selectedAt, now);
}

// --- Pure Helpers: Manifest & Network Parsing ---
function hasUsableGalleryManifest(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => item && typeof item === 'object' && item.id);
}

function getGalleryManifestTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchGalleryManifestWithTimeout(url, options = {}, timeoutMs = GALLERY_MANIFEST_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : GALLERY_MANIFEST_FETCH_TIMEOUT_MS;
  let didTimeout = false;

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error('Gallery manifest request timed out');
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Pure Helpers: Video & URL Resolution ---
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
  const startsWithUserPrefix = (val = '') =>
    typeof val === 'string' &&
    val.startsWith(typeof USER_WALLPAPER_CACHE_PREFIX !== 'undefined' ? USER_WALLPAPER_CACHE_PREFIX : 'https://user-wallpapers.local/');
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

// --- Pure Helpers: Battery & Hardware Status ---
async function checkBatteryStatus() {
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      if (!battery.charging) {
        if (typeof hbDebugLog === 'function') {
          hbDebugLog('Battery mode detected: Pausing live wallpaper.');
        }
        return true;
      }
    } catch (e) {
      // Ignore errors
    }
  }
  return false;
}

// --- Pure Helpers: Poster Generation & Encoding ---
/**
 * Validates whether a cached startup poster data URL is usable.
 * Checks type, data:image header, and size limit.
 *
 * @param {*} dataUrl
 * @returns {boolean}
 */
function isValidStartupPosterDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return false;
  if (!dataUrl.startsWith('data:image/')) return false;
  if (dataUrl.length > TARGET_STARTUP_POSTER_DATA_URL_LENGTH) return false;
  return true;
}

/**
 * Asynchronously converts a canvas to a data URL using canvas.toBlob() and FileReader,
 * removing synchronous encoding from the normal generation path.
 * Falls back to canvas.toDataURL() if toBlob is unavailable or fails.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} [type='image/webp']
 * @param {number} [quality=0.8]
 * @returns {Promise<string>}
 */
function canvasToDataUrlAsync(canvas, type = 'image/webp', quality = 0.8) {
  if (!canvas) return Promise.resolve('');

  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            try {
              resolve(typeof canvas.toDataURL === 'function' ? canvas.toDataURL(type, quality) : '');
            } catch (_) {
              resolve('');
            }
            return;
          }

          if (typeof FileReader !== 'undefined') {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(typeof reader.result === 'string' ? reader.result : '');
            };
            reader.onerror = () => {
              try {
                resolve(typeof canvas.toDataURL === 'function' ? canvas.toDataURL(type, quality) : '');
              } catch (_) {
                resolve('');
              }
            };
            reader.readAsDataURL(blob);
          } else {
            try {
              resolve(typeof canvas.toDataURL === 'function' ? canvas.toDataURL(type, quality) : '');
            } catch (_) {
              resolve('');
            }
          }
        }, type, quality);
        return;
      } catch (err) {
        // toBlob threw synchronously; fall back
      }
    }

    try {
      resolve(typeof canvas.toDataURL === 'function' ? canvas.toDataURL(type, quality) : '');
    } catch (_) {
      resolve('');
    }
  });
}

/**
 * Creates a resized/compressed Data URL specifically for instant startup cache.
 * Keeps the file within localStorage limits (~5MB) without affecting the actual high-res wallpaper.
 */
async function createOptimizedPosterDataUrl(blob, options = {}) {
  if (!blob) {
    return '';
  }

  const requestedMaxDim = Number(options.maxDim);
  const maxDim = Number.isFinite(requestedMaxDim) && requestedMaxDim > 0 ? requestedMaxDim : 2000;
  const requestedQuality = Number(options.quality);
  const quality = Number.isFinite(requestedQuality) && requestedQuality > 0 && requestedQuality <= 1 ? requestedQuality : 0.8;

  let bitmap = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    }
  } catch (e) {
    bitmap = null;
  }

  const sourceWidth = bitmap ? bitmap.width : 0;
  const sourceHeight = bitmap ? bitmap.height : 0;

  if (bitmap && sourceWidth > 0 && sourceHeight > 0) {
    const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (typeof bitmap.close === 'function') bitmap.close();
      return '';
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }

    return await canvasToDataUrlAsync(canvas, 'image/webp', quality);
  }

  // Fallback for browsers/contexts where createImageBitmap was unavailable or failed
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = await canvasToDataUrlAsync(canvas, 'image/webp', quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };

    img.src = objectUrl;
  });
}

async function createStartupPosterDataUrl(blob) {
  if (!blob) return '';

  for (let i = 0; i < STARTUP_POSTER_MAX_DIM_SEQUENCE.length; i += 1) {
    const maxDim = STARTUP_POSTER_MAX_DIM_SEQUENCE[i];
    const quality = STARTUP_POSTER_QUALITY_SEQUENCE[i] || 0.65;
    const candidateDataUrl = await createOptimizedPosterDataUrl(blob, { maxDim, quality });

    if (candidateDataUrl && candidateDataUrl.length <= TARGET_STARTUP_POSTER_DATA_URL_LENGTH) {
      return candidateDataUrl;
    }
  }

  const fallbackDataUrl = await createOptimizedPosterDataUrl(blob, { maxDim: 640, quality: 0.5 });
  if (fallbackDataUrl && fallbackDataUrl.length <= TARGET_STARTUP_POSTER_DATA_URL_LENGTH) {
    return fallbackDataUrl;
  }

  return '';
}

function buildVideoPosterFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file !== 'object') {
      reject(new Error('Invalid video file'));
      return;
    }

    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e) {}
      URL.revokeObjectURL(objectUrl);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Video snapshot timed out'));
    }, 10000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch (e) {
        // Fallback directly to current frame if seek fails
        captureFrame();
      }
    };

    const captureFrame = () => {
      try {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob((blob) => {
          clearTimeout(timer);
          cleanup();
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create poster blob from video snapshot'));
          }
        }, 'image/webp', 0.85);
      } catch (err) {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Failed to load video for poster snapshot'));
    };

    video.src = objectUrl;
  });
}

// --- Pure Helpers: UI Controls & Playback Cleanup ---
function cleanupBackgroundPlayback() {
  cancelPendingSourceLoadOperation();
  backgroundVideoSourceLoadGeneration += 1;
  backgroundVideoCrossfadeSetupKey = '';

  // 1. Send the "Abort" signal to kill all active video listeners immediately
  if (videoPlaybackController) {
    videoPlaybackController.abort();
    videoPlaybackController = null;
  }

  if (backgroundCrossfadeTimeout) {
    clearTimeout(backgroundCrossfadeTimeout);
    backgroundCrossfadeTimeout = null;
  }
  activeCrossfadeTransition = null;

  // 2. Pause videos to stop CPU usage
  const videos = document.querySelectorAll('.background-video');
  videos.forEach(v => {
    try { v.pause(); } catch (e) {}
    v.classList.remove('is-active');
    v.classList.remove('with-transition');
    v.classList.remove('on-top');
  });
}

function setNextWallpaperButtonLoading(isLoading) {
  const nextWallpaperBtn = document.getElementById('dock-next-wallpaper-btn');
  if (!nextWallpaperBtn) return;

  nextWallpaperBtn.disabled = isLoading;
  nextWallpaperBtn.classList.toggle('is-loading', isLoading);
  nextWallpaperBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');

  const tooltip = nextWallpaperBtn.querySelector('.tooltip-popup');
  if (tooltip) {
    const defaultLabel = nextWallpaperBtn.getAttribute('aria-label') || NEXT_WALLPAPER_TOOLTIP_DEFAULT;
    tooltip.textContent = isLoading ? NEXT_WALLPAPER_TOOLTIP_LOADING : defaultLabel;
  }
}

// ===============================================
// Cache & Manifest Pipeline
// ===============================================

async function loadCachedGalleryManifest() {
  const cached = await getVideosManifestCache();
  const manifest = cached.manifest;
  const fetchedAt = getGalleryManifestTimestamp(cached.fetchedAt);
  const hasManifest = hasUsableGalleryManifest(manifest);
  return {
    manifest: hasManifest ? manifest : [],
    fetchedAt,
    hasManifest,
    isFresh: hasManifest && Date.now() - fetchedAt < VIDEOS_JSON_TTL_MS
  };
}

function refreshGalleryManifestInBackground() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  const refreshPromise = fetchVideosManifestIfNeeded()
    .then((manifest) => {
      if (hasUsableGalleryManifest(manifest)) {
        if (typeof scheduleIdleTask === 'function') {
          scheduleIdleTask(() => cacheGalleryPostersIfNeeded(manifest), 'cacheGalleryPostersIfNeeded');
        } else if (typeof window !== 'undefined' && typeof window.scheduleIdleTask === 'function') {
          window.scheduleIdleTask(() => cacheGalleryPostersIfNeeded(manifest), 'cacheGalleryPostersIfNeeded');
        }
      }
      return manifest;
    })
    .catch((err) => {
      console.warn('Gallery manifest background refresh failed', err);
      return [];
    });

  return refreshPromise;
}

async function fetchVideosManifestIfNeeded() {
  if (videosManifestPromise) return videosManifestPromise;

  videosManifestPromise = (async () => {
    try {
      const now = Date.now();
      const res = await fetchGalleryManifestWithTimeout(
        VIDEOS_JSON_URL,
        { cache: 'no-store' },
        GALLERY_MANIFEST_FETCH_TIMEOUT_MS
      );
      if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
      const manifest = await res.json();
      if (!hasUsableGalleryManifest(manifest)) {
        throw new Error('Manifest response was empty or invalid');
      }

      await setVideosManifestCache(manifest, now);
      return manifest;
    } catch (err) {
      console.error('fetchVideosManifestIfNeeded error:', err);
      const fallback = await loadCachedGalleryManifest();
      return fallback.hasManifest ? fallback.manifest : [];
    } finally {
      videosManifestPromise = null;
    }
  })();

  return videosManifestPromise;
}

async function getVideosManifest() {
  const cached = await loadCachedGalleryManifest();

  if (cached.hasManifest) {
    if (typeof scheduleIdleTask === 'function') {
      scheduleIdleTask(() => cacheGalleryPostersIfNeeded(cached.manifest), 'cacheGalleryPostersIfNeeded');
    } else if (typeof window !== 'undefined' && typeof window.scheduleIdleTask === 'function') {
      window.scheduleIdleTask(() => cacheGalleryPostersIfNeeded(cached.manifest), 'cacheGalleryPostersIfNeeded');
    }

    if (!cached.isFresh && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      refreshGalleryManifestInBackground();
    }
    return cached.manifest;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return [];
  }

  const fetched = await fetchVideosManifestIfNeeded();
  if (hasUsableGalleryManifest(fetched)) {
    if (typeof scheduleIdleTask === 'function') {
      scheduleIdleTask(() => cacheGalleryPostersIfNeeded(fetched), 'cacheGalleryPostersIfNeeded');
    } else if (typeof window !== 'undefined' && typeof window.scheduleIdleTask === 'function') {
      window.scheduleIdleTask(() => cacheGalleryPostersIfNeeded(fetched), 'cacheGalleryPostersIfNeeded');
    }
    return fetched;
  }

  return [];
}

async function cacheGalleryPostersIfNeeded(manifest = []) {
  const signature = getGalleryPosterCacheSignature(manifest);
  if (!signature) return;

  const now = Date.now();
  try {
    const { lastCheckedAt, signature: previousSignature } = await getGalleryPostersCacheMetadata();
    const isRecent = now - lastCheckedAt < GALLERY_POSTERS_CACHE_CHECK_TTL_MS;

    if (isRecent && previousSignature === signature) {
      return;
    }

    await cacheGalleryPosters(manifest);
    await setGalleryPostersCacheMetadata(signature, now);
  } catch (err) {
    console.warn('Failed to check gallery poster cache freshness', err);
    if (typeof recordPerfFallback === 'function') {
      recordPerfFallback('galleryPosters', 'Poster cache check failed');
    }
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

async function cacheAppliedWallpaperVideo(selection) {
  if (!selection) return;

  const videoCacheKey = selection.videoCacheKey || '';
  const videoUrl = selection.videoUrl || '';
  const targetUrl = isRemoteVideoUrl(videoCacheKey)
    ? videoCacheKey
    : (isRemoteVideoUrl(videoUrl) ? videoUrl : '');

  const userPrefix = typeof USER_WALLPAPER_CACHE_PREFIX !== 'undefined'
    ? USER_WALLPAPER_CACHE_PREFIX
    : 'https://user-wallpapers.local/';

  if (targetUrl && targetUrl.startsWith(userPrefix)) {
    await clearCachedAppliedVideoUrl();
    return;
  }

  try {
    await pruneCachedVideos(targetUrl);

    if (targetUrl) {
      await cacheAsset(targetUrl);
      await setCachedAppliedVideoUrl(targetUrl);
    } else {
      await clearCachedAppliedVideoUrl();
    }
  } catch (err) {
    console.warn('Failed to cache applied video', err);
  }
}

async function cacheAppliedWallpaperPoster(posterUrl, posterCacheKey = '', options = {}) {
  try {
    if (!posterUrl) {
      activePosterGenerationToken += 1;
      activePosterGenerationTarget = '';
      activePosterGenerationRevision = 0;
      activePosterGenerationEncodingVersion = STARTUP_POSTER_ENCODING_VERSION;
      activePosterGenerationForced = false;
      activePosterGenerationPromise = null;

      if (typeof clearAppliedPosterMetadata === 'function') {
        await clearAppliedPosterMetadata();
      } else if (typeof window !== 'undefined' && typeof window.clearAppliedPosterMetadata === 'function') {
        await window.clearAppliedPosterMetadata();
      }

      const posterKey = typeof CACHED_APPLIED_POSTER_CACHE_KEY !== 'undefined'
        ? CACHED_APPLIED_POSTER_CACHE_KEY
        : 'cachedAppliedPoster';
      if (typeof deleteCachedObject === 'function') {
        await deleteCachedObject(posterKey);
      } else if (typeof window !== 'undefined' && typeof window.deleteCachedObject === 'function') {
        await window.deleteCachedObject(posterKey);
      }
      return '';
    }

    let urlToStore = posterUrl;
    if (posterUrl.startsWith('blob:') && posterCacheKey && !posterCacheKey.startsWith('blob:')) {
      urlToStore = posterCacheKey;
    }

    const targetEncodingVersion = typeof options.encodingVersion === 'number'
      ? options.encodingVersion
      : STARTUP_POSTER_ENCODING_VERSION;
    const targetRevision = (options.sourceRevision !== undefined ? options.sourceRevision : options.revision) || 0;
    const forceRegenerate = Boolean(options.force || options.forceRegenerate);

    // Coalescing check:
    // Can only join in-flight work if:
    // 1. Target URL matches
    // 2. Neither the request nor the in-flight task is forced
    // 3. Source revision matches exactly
    // 4. Encoding version matches exactly
    if (
      activePosterGenerationPromise &&
      activePosterGenerationTarget === urlToStore &&
      !forceRegenerate &&
      !activePosterGenerationForced &&
      String(activePosterGenerationRevision) === String(targetRevision) &&
      activePosterGenerationEncodingVersion === targetEncodingVersion
    ) {
      return activePosterGenerationPromise;
    }

    // New or superseded task: register monotonic token and active parameters
    const currentToken = ++activePosterGenerationToken;
    activePosterGenerationTarget = urlToStore;
    activePosterGenerationRevision = targetRevision;
    activePosterGenerationEncodingVersion = targetEncodingVersion;
    activePosterGenerationForced = forceRegenerate;

    const readStoredBundle = async () => {
      let storedUrl = '';
      let storedDataUrl = '';
      let storedEncodingVersion = 0;
      let storedRevision = 0;
      let hasAuthoritativeStore = false;

      if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
        hasAuthoritativeStore = true;
        const stored = await window.HomebaseStorage.getMany([
          'cachedAppliedPosterUrl',
          'cachedAppliedPosterDataUrl',
          'cachedAppliedPosterEncodingVersion',
          'cachedAppliedPosterRevision'
        ]);
        storedUrl = typeof stored.cachedAppliedPosterUrl === 'string' ? stored.cachedAppliedPosterUrl : '';
        storedDataUrl = typeof stored.cachedAppliedPosterDataUrl === 'string' ? stored.cachedAppliedPosterDataUrl : '';
        storedEncodingVersion = typeof stored.cachedAppliedPosterEncodingVersion === 'number' && Number.isInteger(stored.cachedAppliedPosterEncodingVersion) && stored.cachedAppliedPosterEncodingVersion >= 0
          ? stored.cachedAppliedPosterEncodingVersion
          : 0;
        storedRevision = stored.cachedAppliedPosterRevision !== undefined && stored.cachedAppliedPosterRevision !== null
          ? stored.cachedAppliedPosterRevision
          : 0;
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        hasAuthoritativeStore = true;
        const stored = await browser.storage.local.get([
          'cachedAppliedPosterUrl',
          'cachedAppliedPosterDataUrl',
          'cachedAppliedPosterEncodingVersion',
          'cachedAppliedPosterRevision'
        ]);
        storedUrl = stored && typeof stored.cachedAppliedPosterUrl === 'string' ? stored.cachedAppliedPosterUrl : '';
        storedDataUrl = stored && typeof stored.cachedAppliedPosterDataUrl === 'string' ? stored.cachedAppliedPosterDataUrl : '';
        storedEncodingVersion = stored && typeof stored.cachedAppliedPosterEncodingVersion === 'number' && Number.isInteger(stored.cachedAppliedPosterEncodingVersion) && stored.cachedAppliedPosterEncodingVersion >= 0
          ? stored.cachedAppliedPosterEncodingVersion
          : 0;
        storedRevision = stored && stored.cachedAppliedPosterRevision !== undefined && stored.cachedAppliedPosterRevision !== null
          ? stored.cachedAppliedPosterRevision
          : 0;
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        hasAuthoritativeStore = true;
        const stored = await new Promise((resolve) => {
          chrome.storage.local.get([
            'cachedAppliedPosterUrl',
            'cachedAppliedPosterDataUrl',
            'cachedAppliedPosterEncodingVersion',
            'cachedAppliedPosterRevision'
          ], resolve);
        });
        storedUrl = stored && typeof stored.cachedAppliedPosterUrl === 'string' ? stored.cachedAppliedPosterUrl : '';
        storedDataUrl = stored && typeof stored.cachedAppliedPosterDataUrl === 'string' ? stored.cachedAppliedPosterDataUrl : '';
        storedEncodingVersion = stored && typeof stored.cachedAppliedPosterEncodingVersion === 'number' && Number.isInteger(stored.cachedAppliedPosterEncodingVersion) && stored.cachedAppliedPosterEncodingVersion >= 0
          ? stored.cachedAppliedPosterEncodingVersion
          : 0;
        storedRevision = stored && stored.cachedAppliedPosterRevision !== undefined && stored.cachedAppliedPosterRevision !== null
          ? stored.cachedAppliedPosterRevision
          : 0;
      }

      // If an authoritative store is present, NEVER fill missing fields from localStorage.
      // Only read from localStorage if NO authoritative extension store exists.
      if (!hasAuthoritativeStore && typeof localStorage !== 'undefined') {
        storedUrl = localStorage.getItem('cachedAppliedPosterUrl') || '';
        storedDataUrl = localStorage.getItem('cachedAppliedPosterDataUrl') || '';
        const rawV = localStorage.getItem('cachedAppliedPosterEncodingVersion');
        storedEncodingVersion = rawV ? (parseInt(rawV, 10) || 0) : 0;
        const rawR = localStorage.getItem('cachedAppliedPosterRevision');
        storedRevision = rawR !== null && rawR !== undefined ? rawR : 0;
      }

      return {
        url: storedUrl,
        dataUrl: storedDataUrl,
        encodingVersion: storedEncodingVersion,
        revision: storedRevision
      };
    };

    const commitStoredBundle = async (bundle) => {
      if (typeof setCachedAppliedPosterBundle === 'function') {
        return await setCachedAppliedPosterBundle(bundle);
      } else if (typeof window !== 'undefined' && typeof window.setCachedAppliedPosterBundle === 'function') {
        return await window.setCachedAppliedPosterBundle(bundle);
      }

      const payload = {
        cachedAppliedPosterUrl: bundle.url || '',
        cachedAppliedPosterDataUrl: bundle.dataUrl || '',
        cachedAppliedPosterEncodingVersion: bundle.encodingVersion || 0,
        cachedAppliedPosterRevision: bundle.revision !== undefined ? bundle.revision : 0
      };

      let writeSuccess = false;
      try {
        if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
          const res = await window.HomebaseStorage.setMany(payload);
          writeSuccess = Boolean(res && res.success && (!res.rejectedKeys || res.rejectedKeys.length === 0));
        } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          await browser.storage.local.set(payload);
          writeSuccess = true;
        } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise((resolve, reject) => {
            chrome.storage.local.set(payload, () => {
              if (chrome.runtime && chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve();
            });
          });
          writeSuccess = true;
        } else if (typeof localStorage !== 'undefined') {
          writeSuccess = true;
        }
      } catch (_) {
        writeSuccess = false;
      }

      if (!writeSuccess) {
        return false;
      }

      if (typeof localStorage !== 'undefined') {
        try {
          if (bundle.dataUrl) localStorage.setItem('cachedAppliedPosterDataUrl', bundle.dataUrl);
          else localStorage.removeItem('cachedAppliedPosterDataUrl');

          if (bundle.url) localStorage.setItem('cachedAppliedPosterUrl', bundle.url);
          else localStorage.removeItem('cachedAppliedPosterUrl');

          if (bundle.encodingVersion) localStorage.setItem('cachedAppliedPosterEncodingVersion', String(bundle.encodingVersion));
          else localStorage.removeItem('cachedAppliedPosterEncodingVersion');

          if (bundle.revision !== undefined && bundle.revision !== 0 && bundle.revision !== '0') {
            localStorage.setItem('cachedAppliedPosterRevision', String(bundle.revision));
          } else {
            localStorage.removeItem('cachedAppliedPosterRevision');
          }
        } catch (_) {
          try {
            localStorage.removeItem('cachedAppliedPosterDataUrl');
            localStorage.removeItem('cachedAppliedPosterUrl');
            localStorage.removeItem('cachedAppliedPosterEncodingVersion');
            localStorage.removeItem('cachedAppliedPosterRevision');
          } catch (__) {}
        }
      }

      return true;
    };

    const cacheKeyToUse = posterCacheKey || posterUrl;

    const task = (async () => {
      try {
        if (activePosterGenerationToken !== currentToken) {
          return '';
        }

        // Fast-path: Check existing storage WITHOUT updating cachedAppliedPosterUrl early.
        // Keeps committed output identity separate from pending generation identity.
        const initialStored = await readStoredBundle();
        if (activePosterGenerationToken !== currentToken) {
          return '';
        }

        const isStableSource = urlToStore && !urlToStore.startsWith('blob:');
        const isUrlMatch = initialStored.url === urlToStore;
        const isDataUrlValid = isValidStartupPosterDataUrl(initialStored.dataUrl);
        const isVersionMatch = initialStored.encodingVersion === targetEncodingVersion;
        const isRevisionMatch = String(initialStored.revision) === String(targetRevision);

        if (isStableSource && !forceRegenerate && isUrlMatch && isDataUrlValid && isVersionMatch && isRevisionMatch) {
          return initialStored.dataUrl;
        }

        let blob = null;
        const resolveFn = (typeof window !== 'undefined' && typeof window.resolvePosterBlob === 'function')
          ? window.resolvePosterBlob
          : (typeof resolvePosterBlob === 'function' ? resolvePosterBlob : null);
        if (resolveFn) {
          blob = await resolveFn(urlToStore, cacheKeyToUse);
        }

        if (activePosterGenerationToken !== currentToken) {
          return '';
        }

        let dataUrl = '';
        if (blob && blob.size > 0) {
          const createPosterFn = (typeof window !== 'undefined' && typeof window.createStartupPosterDataUrl === 'function')
            ? window.createStartupPosterDataUrl
            : (typeof createStartupPosterDataUrl === 'function' ? createStartupPosterDataUrl : null);
          if (createPosterFn) {
            dataUrl = await createPosterFn(blob);
          }
        }

        if (activePosterGenerationToken !== currentToken) {
          return '';
        }

        // Recheck ownership after awaited encoding and after reading current storage state
        const latestStored = await readStoredBundle();
        if (activePosterGenerationToken !== currentToken) {
          return '';
        }

        // Cross-tab and concurrent ownership validation:
        // 1. If another tab changed storage to a different wallpaper while we were generating, abort.
        if (latestStored.url !== initialStored.url && latestStored.url !== urlToStore) {
          return '';
        }

        // 2. Intervening change analysis:
        // Check if another tab modified storage while we were generating.
        const hasInterveningChange =
          latestStored.url !== initialStored.url ||
          String(latestStored.revision) !== String(initialStored.revision) ||
          latestStored.encodingVersion !== initialStored.encodingVersion ||
          latestStored.dataUrl !== initialStored.dataUrl;

        if (hasInterveningChange) {
          // If storage currently holds urlToStore:
          if (latestStored.url === urlToStore) {
            // If another tab committed an encoding version newer than target, abort
            if (latestStored.encodingVersion > targetEncodingVersion) {
              return '';
            }

            // Did the intervening tab commit the exact target revision we are generating?
            const interveningMatchesTarget = String(latestStored.revision) === String(targetRevision);
            if (interveningMatchesTarget) {
              // Another tab completed the exact target revision.
              // If NOT forced and output is valid, reuse it:
              if (!forceRegenerate && latestStored.encodingVersion === targetEncodingVersion && isValidStartupPosterDataUrl(latestStored.dataUrl)) {
                return latestStored.dataUrl;
              }
              // If forceRegenerate is true, proceed to commit our newly generated output.
            } else {
              // The intervening tab committed a revision that differs from both initialStored and our target.
              // Our work is stale and must not overwrite the newer intervening revision.
              return '';
            }
          }
        }

        if (isValidStartupPosterDataUrl(dataUrl)) {
          const committed = await commitStoredBundle({
            url: urlToStore,
            dataUrl,
            encodingVersion: targetEncodingVersion,
            revision: targetRevision
          });
          if (!committed) {
            return '';
          }
          if (activePosterGenerationToken !== currentToken) {
            return '';
          }
          return dataUrl;
        } else {
          // Output was oversized or invalid; if this target is still current, clear stale dataUrl
          if (latestStored.url === urlToStore) {
            await commitStoredBundle({
              url: urlToStore,
              dataUrl: '',
              encodingVersion: 0,
              revision: 0
            });
          }
          return '';
        }
      } catch (e) {
        console.warn('Failed to generate data URL for poster', e);
        if (activePosterGenerationToken === currentToken) {
          try {
            const currentStored = await readStoredBundle();
            if (activePosterGenerationToken === currentToken) {
              // Ensure stale failure cannot wipe out a valid poster already committed by another tab
              if (currentStored.url === urlToStore && !isValidStartupPosterDataUrl(currentStored.dataUrl)) {
                await commitStoredBundle({
                  url: urlToStore,
                  dataUrl: '',
                  encodingVersion: 0,
                  revision: 0
                });
              }
            }
          } catch (_) {}
        }
        return '';
      } finally {
        if (activePosterGenerationPromise === task) {
          activePosterGenerationPromise = null;
          activePosterGenerationTarget = '';
          activePosterGenerationRevision = 0;
          activePosterGenerationEncodingVersion = STARTUP_POSTER_ENCODING_VERSION;
          activePosterGenerationForced = false;
        }
      }
    })();

    activePosterGenerationPromise = task;
    return await task;
  } catch (err) {
    console.warn('Failed to cache applied wallpaper poster', err);
    return '';
  }
}

// ===============================================
// Video Lifecycle & Playback Pipeline
// ===============================================

function setWallpaperFallbackPoster(posterUrl = '', posterCacheKey = '', options = {}) {
  const poster = posterUrl || 'assets/fallback.webp';

  // Avoid repainting when preload already drew a stable data URL and we'd swap to blob/http.
  const current = document.documentElement.dataset.initialWallpaper || '';
  const currentIsData = current.startsWith('data:');
  const nextIsBlobOrHttp = poster.startsWith('blob:') || poster.startsWith('http');

  if (!(currentIsData && nextIsBlobOrHttp) && current !== poster) {
    document.documentElement.style.setProperty('--initial-wallpaper', `url("${poster}")`);
    document.documentElement.dataset.initialWallpaper = poster;
  }

  const runIdle = typeof scheduleIdleTask === 'function'
    ? scheduleIdleTask
    : (typeof window !== 'undefined' && typeof window.scheduleIdleTask === 'function' ? window.scheduleIdleTask : null);

  if (runIdle) {
    runIdle(() => cacheAppliedWallpaperPoster(poster, posterCacheKey, options).catch(() => {}), 'cacheAppliedWallpaperPoster');
  } else {
    setTimeout(() => cacheAppliedWallpaperPoster(poster, posterCacheKey, options).catch(() => {}), 1);
  }
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

function getMediaElementSourceSrc(videoEl) {
  try {
    const source = videoEl.querySelector('source');
    if (source) {
      return (typeof source.getAttribute === 'function' ? source.getAttribute('src') : source.src) || '';
    }
    return (typeof videoEl.getAttribute === 'function' ? videoEl.getAttribute('src') : videoEl.src) || '';
  } catch (e) {
    return '';
  }
}

async function setBackgroundVideoSources(videoUrl, posterUrl = '') {
  const isPerf = typeof isPerformanceModeEnabled === 'function' ? isPerformanceModeEnabled() : false;
  if (isPerf) return;

  try {
    const videos = Array.from(document.querySelectorAll('.background-video'));
    if (typeof recordStartupPerfEvent === 'function') {
      recordStartupPerfEvent('newtab:video-source-assign-start', { videoElements: videos.length });
    }

    const videoUpdates = videos.map((v) => {
      try {
        const source = v.querySelector('source');
        const currentSrc = getMediaElementSourceSrc(v);
        const desiredPoster = posterUrl || '';
        const needsUpdate = currentSrc !== videoUrl || v.poster !== desiredPoster || v.readyState === 0;
        return { v, source, desiredPoster, needsUpdate };
      } catch (e) {
        return { v, source: null, desiredPoster: posterUrl || '', needsUpdate: false };
      }
    });

    if (!videoUpdates.some((update) => update.needsUpdate)) {
      await backgroundVideoSourceLoadPromise;
      if (typeof recordStartupPerfEvent === 'function') {
        recordStartupPerfEvent('newtab:video-source-load-complete', { updated: false });
      }
      return;
    }

    // If document is hidden, keep the poster visible but defer video loading into DOM
    if (typeof document !== 'undefined' && document.hidden) {
      cancelPendingSourceLoadOperation();
      videoUpdates.forEach(({ v, desiredPoster }) => {
        try {
          if (desiredPoster && v.poster !== desiredPoster) {
            v.poster = desiredPoster;
          }
        } catch (e) {}
      });
      if (typeof recordStartupPerfEvent === 'function') {
        recordStartupPerfEvent('newtab:video-source-load-deferred-hidden');
      }
      return;
    }

    cancelPendingSourceLoadOperation();
    const loadGeneration = ++backgroundVideoSourceLoadGeneration;
    const operation = createSourceLoadOperation(loadGeneration);
    pendingSourceLoadOperation = operation;

    const loadTasks = videoUpdates.map(({ v, source, desiredPoster, needsUpdate }, index) => {
      return new Promise((resolve) => {
        if (!needsUpdate) {
          resolve();
          return;
        }

        let taskSettled = false;
        let currentHandle = null;
        let currentHandleType = null;

        const clearTaskHandle = () => {
          if (currentHandle !== null) {
            operation.unregisterHandle(currentHandle);
            try {
              if (currentHandleType === 'raf' && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(currentHandle);
              } else if (currentHandleType === 'timeout' && typeof clearTimeout === 'function') {
                clearTimeout(currentHandle);
              }
            } catch (_) {}
            currentHandle = null;
            currentHandleType = null;
          }
        };

        const settleTask = () => {
          if (taskSettled) return;
          taskSettled = true;
          clearTaskHandle();
          resolve();
        };

        operation.addTaskCompletion(settleTask);

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
              clearTaskHandle();
              const currentPerf = typeof isPerformanceModeEnabled === 'function' ? isPerformanceModeEnabled() : false;
              const isHidden = typeof document !== 'undefined' && document.hidden;
              if (
                !operation.settled &&
                loadGeneration === backgroundVideoSourceLoadGeneration &&
                !currentPerf &&
                !isHidden
              ) {
                try {
                  v.load();
                  if (typeof recordStartupPerfEvent === 'function') {
                    recordStartupPerfEvent('newtab:video-load-called', { index });
                  }
                } catch (e) {}
                try { v.currentTime = 0; } catch (e) {}
              }
            } finally {
              settleTask();
            }
          };

          if (typeof document !== 'undefined' && document.hidden) {
            settleTask();
          } else if (typeof requestAnimationFrame === 'function') {
            currentHandleType = 'raf';
            currentHandle = requestAnimationFrame(() => {
              operation.unregisterHandle(currentHandle);
              currentHandle = null;
              if (taskSettled || operation.settled) return;
              currentHandleType = 'raf';
              currentHandle = requestAnimationFrame(loadVideo);
              operation.registerHandle('raf', currentHandle);
            });
            operation.registerHandle('raf', currentHandle);
          } else {
            currentHandleType = 'timeout';
            currentHandle = setTimeout(loadVideo, 0);
            operation.registerHandle('timeout', currentHandle);
          }
        } catch (e) {
          settleTask();
        }
      });
    });

    backgroundVideoSourceLoadPromise = Promise.all(loadTasks)
      .then(() => {
        operation.finishIfCurrent();
      })
      .catch(() => {
        operation.finishIfCurrent();
      });

    await backgroundVideoSourceLoadPromise;
    if (typeof recordStartupPerfEvent === 'function') {
      recordStartupPerfEvent('newtab:video-source-load-complete', { updated: true });
    }
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
      if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
      if (typeof document !== 'undefined' && document.hidden) return;
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

      if (typeof recordStartupPerfEvent === 'function') {
        recordStartupPerfEvent('newtab:video-start-requested');
      }
      startBackgroundVideos();
      if (setupBackgroundVideoCrossfade()) {
        if (typeof recordStartupPerfEvent === 'function') {
          recordStartupPerfEvent('newtab:crossfade-setup');
        }
        backgroundVideoCrossfadeSetupKey = crossfadeKey;
      }
    });
}

function waitForWallpaperReady(selection, type = 'video') {
  return new Promise((resolve) => {
    if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return resolve();
    if (typeof document !== 'undefined' && document.hidden) return resolve();
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


function setupBackgroundVideoCrossfade() {
  if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) {
    cleanupBackgroundPlayback();
    return false;
  }
  if (typeof document !== 'undefined' && document.hidden) {
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
    if (signal.aborted) return;
    if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      if (enableTransition) {
        videoEl.classList.add('with-transition');
        void videoEl.offsetWidth;
      } else {
        videoEl.classList.remove('with-transition');
      }

      await videoEl.play();

      if (signal.aborted || (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled())) {
        try { videoEl.pause(); } catch (e) {}
        return;
      }

      if (typeof document !== 'undefined' && document.hidden) {
        try { videoEl.pause(); } catch (e) {}
        return;
      }

      const showVideo = () => {
        if (signal.aborted) return;
        if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
        if (typeof document !== 'undefined' && document.hidden) {
          try { videoEl.pause(); } catch (e) {}
          return;
        }

        const current = currentWallpaperSelection || null;
        const currentType = (lastAppliedWallpaper && lastAppliedWallpaper.type) || wallpaperTypePreference;
        if (currentType === 'static' || !current || !current.videoUrl) return;

        videoEl.classList.add('is-active');
        if (!firstActiveMarked) {
          firstActiveMarked = true;
          if (typeof recordStartupPerfEvent === 'function') {
            recordStartupPerfEvent('newtab:video-first-active', { transition: !!enableTransition });
          }
        }
        if (onReady) onReady();
      };

      if ('requestVideoFrameCallback' in videoEl) {
        videoEl.requestVideoFrameCallback(() => {
          if (signal.aborted) return;
          if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
          requestAnimationFrame(() => {
            if (signal.aborted) return;
            if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
            showVideo();
          });
        });
      } else {
        const checkFrame = () => {
          if (signal.aborted) return;
          if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
          if (videoEl.currentTime > 0) {
            videoEl.removeEventListener('timeupdate', checkFrame);
            requestAnimationFrame(() => {
              if (signal.aborted) return;
              if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
              showVideo();
            });
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
    if (signal.aborted) return;
    if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
    let fading = false;

    const primeNext = () => {
      if (next.preload !== 'auto') {
        next.preload = 'auto';
        next.load();
      }
    };

    const doFade = async () => {
      if (signal.aborted) return;
      if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (fading) return;
      fading = true;
      primeNext();
      next.currentTime = 0;

      next.classList.add('on-top');
      current.classList.remove('on-top');

      let shouldAnimate = true;
      if (typeof appPerformanceModePreference !== 'undefined' && appPerformanceModePreference) {
        shouldAnimate = false;
      } else if (typeof appBatteryOptimizationPreference !== 'undefined' && appBatteryOptimizationPreference) {
        if ('getBattery' in navigator) {
          try {
            const battery = await navigator.getBattery();
            if (!battery.charging) shouldAnimate = false;
          } catch (e) {}
        }
      }

      let finished = false;
      const transition = {
        from: current,
        to: next,
        finish: null
      };

      const finishCrossfade = () => {
        if (finished) return;
        if (signal.aborted) return;
        if (activeCrossfadeTransition !== transition) return;
        finished = true;

        if (backgroundCrossfadeTimeout) {
          clearTimeout(backgroundCrossfadeTimeout);
          backgroundCrossfadeTimeout = null;
        }
        activeCrossfadeTransition = null;
        if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;

        current.classList.remove('is-active');
        current.classList.remove('with-transition');
        try { current.pause(); } catch (e) {}
        try { current.currentTime = 0; } catch (e) {}

        next.classList.add('is-active');
        next.classList.remove('with-transition');
        next.classList.add('on-top');
        current.classList.remove('on-top');

        startCycle(next, current);
      };

      transition.finish = finishCrossfade;
      activeCrossfadeTransition = transition;

      let onReadyHandled = false;
      playAndFadeIn(next, shouldAnimate, () => {
        if (onReadyHandled) return;
        onReadyHandled = true;
        if (signal.aborted) return;
        if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
        if (activeCrossfadeTransition !== transition) return;

        const holdTime = shouldAnimate ? fadeMs + 50 : 50;
        if (backgroundCrossfadeTimeout) clearTimeout(backgroundCrossfadeTimeout);
        backgroundCrossfadeTimeout = setTimeout(finishCrossfade, holdTime);
      });
    };

    const onTimeUpdate = () => {
      if (signal.aborted) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const duration = current.duration || safeDurationMs / 1000;
      const startFadeAt = Math.max(1, duration - fadeSec - bufferSec);
      if (current.currentTime >= startFadeAt) {
        current.removeEventListener('timeupdate', onTimeUpdate);
        doFade();
      }
    };

    current.addEventListener('timeupdate', onTimeUpdate, { signal });

    current.addEventListener('ended', () => {
      if (signal.aborted) return;
      if (typeof document !== 'undefined' && document.hidden) return;
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
      if (signal.aborted) return;
      if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;
      playAndFadeIn(first, false, () => startCycle(first, second));
    }, { once: true, signal });
  }

  return true;
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
  if (typeof recordObjectUrlCleanup === 'function') {
    recordObjectUrlCleanup(cleanupDetails);
  }

  if (typeof DEBUG_HOMEBASE_LOGS !== 'undefined' && DEBUG_HOMEBASE_LOGS) {
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

function applyWallpaperByType(selection, type = 'video', options = {}) {
  if (!selection) return;

  const finalType = type === 'static' ? 'static' : 'video';
  const poster = selection.posterUrl || '';
  const posterCacheKey = selection.posterCacheKey || selection.poster || selection.posterUrl || '';
  const video = finalType === 'video' ? (selection.videoUrl || '') : '';
  const videoStartSequence = ++wallpaperVideoStartSequence;

  const sourceRevision = (options && (options.sourceRevision !== undefined ? options.sourceRevision : options.revision)) ||
    selection.sourceRevision || selection.revision || 0;
  const posterOptions = { sourceRevision, ...options };

  const unchanged =
    lastAppliedWallpaper &&
    lastAppliedWallpaper.id === (selection.id || null) &&
    lastAppliedWallpaper.poster === poster &&
    lastAppliedWallpaper.video === video &&
    lastAppliedWallpaper.type === finalType &&
    String(lastAppliedWallpaper.sourceRevision || 0) === String(sourceRevision) &&
    !options.forceRegenerate &&
    !options.force;

  if (!unchanged) {
    setWallpaperFallbackPoster(poster, posterCacheKey, posterOptions);
  }

  currentWallpaperSelection = selection;
  cleanupUnusedObjectUrls(selection);

  const isPerf = typeof isPerformanceModeEnabled === 'function' ? isPerformanceModeEnabled() : false;
  if (isPerf && finalType === 'video') {
    cleanupBackgroundPlayback();
    applyWallpaperBackground(poster);
    if (typeof recordPerformanceModeVideoSkipped === 'function') {
      recordPerformanceModeVideoSkipped();
    }
    if (typeof recordStartupPerfEvent === 'function') {
      recordStartupPerfEvent('newtab:wallpaper-poster-applied', {
        source: poster ? 'performance-mode-poster' : 'performance-mode-none'
      });
    }
    lastAppliedWallpaper = {
      id: selection.id || null,
      poster,
      video: '',
      type: finalType,
      sourceRevision
    };
    updateSettingsPreview(selection, finalType);
    return;
  }

  const appliedImmediateVideoPoster = finalType === 'video' && !!poster;

  if (appliedImmediateVideoPoster) {
    applyWallpaperBackground(poster);
    if (typeof recordStartupPerfEvent === 'function') {
      recordStartupPerfEvent('newtab:wallpaper-poster-applied', { source: poster ? 'poster' : 'none' });
    }
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
        type: finalType,
        sourceRevision
      };
    };

    if (finalType === 'video') {
      if (typeof document !== 'undefined' && document.hidden) {
        setTimeout(applyWallpaperFlow, 0);
      } else if (typeof runAfterNextPaint === 'function') {
        runAfterNextPaint(applyWallpaperFlow);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(applyWallpaperFlow));
      }
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
  cancelPendingSourceLoadOperation();
  backgroundVideoSourceLoadGeneration += 1;
  backgroundVideoCrossfadeSetupKey = '';
  if (lastAppliedWallpaper) {
    lastAppliedWallpaper.video = '';
  }

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
  if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) {
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
    typeof window !== 'undefined' &&
    window.HomebaseGallery &&
    typeof window.HomebaseGallery.refresh === 'function'
  ) {
    const ctx = typeof createGalleryContext === 'function'
      ? createGalleryContext()
      : (typeof window.createGalleryContext === 'function' ? window.createGalleryContext() : null);

    window.HomebaseGallery.refresh({
      context: ctx,
      selection,
      type
    });
  }
}

async function resumeWallpaperPlaybackIfEligible() {
  if (typeof document === 'undefined' || document.hidden) return false;

  const resumeSequence = ++wallpaperResumeSequence;
  const startSequence = wallpaperVideoStartSequence;

  const isPerfMode = typeof isPerformanceModeEnabled === 'function'
    ? isPerformanceModeEnabled()
    : (typeof window !== 'undefined' && typeof window.isPerformanceModeEnabled === 'function'
        ? window.isPerformanceModeEnabled()
        : false);

  if (isPerfMode) {
    cleanupBackgroundPlayback();
    return false;
  }

  const current = currentWallpaperSelection || null;
  const currentType = (lastAppliedWallpaper && lastAppliedWallpaper.type) || wallpaperTypePreference;
  if (currentType === 'static' || !current || !current.videoUrl) {
    return false;
  }

  const batteryPref = typeof appBatteryOptimizationPreference !== 'undefined'
    ? appBatteryOptimizationPreference
    : (typeof window !== 'undefined' && window.appBatteryOptimizationPreference);
  if (batteryPref) {
    const isDischarging = await checkBatteryStatus();
    if (resumeSequence !== wallpaperResumeSequence || (typeof document !== 'undefined' && document.hidden)) {
      return false;
    }
    if (isDischarging) {
      cleanupBackgroundPlayback();
      return false;
    }
    const isPerfAfterBattery = typeof isPerformanceModeEnabled === 'function'
      ? isPerformanceModeEnabled()
      : (typeof window !== 'undefined' && typeof window.isPerformanceModeEnabled === 'function'
          ? window.isPerformanceModeEnabled()
          : false);
    if (isPerfAfterBattery) {
      cleanupBackgroundPlayback();
      return false;
    }
    if (!currentWallpaperSelection || (currentWallpaperSelection.id || null) !== (current.id || null)) {
      return false;
    }
  }

  const selectionId = current.id || null;
  const poster = current.posterUrl || '';
  const video = current.videoUrl || '';
  const crossfadeKey = `${selectionId || ''}|${video}|${poster}`;

  if (backgroundVideoCrossfadeSetupKey === crossfadeKey) {
    if (activeCrossfadeTransition && typeof activeCrossfadeTransition.finish === 'function') {
      const transition = activeCrossfadeTransition;
      transition.finish();
      const activeVideo = document.querySelector('.background-video.is-active') || transition.to;
      if (activeVideo) {
        delete activeVideo.dataset.wasPlaying;
        if (activeVideo.paused) {
          activeVideo.play().catch(() => {});
        }
      }
      return true;
    }

    const activeVideos = Array.from(document.querySelectorAll('.background-video.is-active'));
    if (activeVideos.length > 1) {
      const onTopVideo = activeVideos.find((v) => v.classList.contains('on-top')) || activeVideos[activeVideos.length - 1];
      activeVideos.forEach((v) => {
        if (v !== onTopVideo) {
          v.classList.remove('is-active');
          v.classList.remove('with-transition');
          try { v.pause(); } catch (e) {}
          try { v.currentTime = 0; } catch (e) {}
        }
      });
    }

    const activeVideo = document.querySelector('.background-video.is-active');
    if (activeVideo) {
      delete activeVideo.dataset.wasPlaying;
      if (activeVideo.paused) {
        if (activeVideo.ended || (activeVideo.duration && activeVideo.currentTime >= activeVideo.duration)) {
          cleanupBackgroundPlayback();
          startBackgroundVideos();
          if (setupBackgroundVideoCrossfade()) {
            backgroundVideoCrossfadeSetupKey = crossfadeKey;
            return true;
          }
        }
        activeVideo.play().catch(() => {});
      }
      return true;
    }
  }

  const videos = Array.from(document.querySelectorAll('.background-video'));
  if (!videos.length) return false;

  const needsSourceUpdate = videos.some((v) => {
    const currentSrc = getMediaElementSourceSrc(v);
    return currentSrc !== video || v.readyState === 0;
  });

  if (needsSourceUpdate) {
    await setBackgroundVideoSources(video, poster);
  }

  const currentNow = currentWallpaperSelection || null;
  const currentTypeNow = (lastAppliedWallpaper && lastAppliedWallpaper.type) || wallpaperTypePreference;
  const isPerfModeNow = typeof isPerformanceModeEnabled === 'function'
    ? isPerformanceModeEnabled()
    : (typeof window !== 'undefined' && typeof window.isPerformanceModeEnabled === 'function'
        ? window.isPerformanceModeEnabled()
        : false);
  const isHiddenNow = typeof document !== 'undefined' && document.hidden;

  if (
    resumeSequence !== wallpaperResumeSequence ||
    startSequence !== wallpaperVideoStartSequence ||
    isHiddenNow ||
    isPerfModeNow ||
    !currentNow ||
    (currentNow.id || null) !== selectionId ||
    (currentNow.videoUrl || '') !== video ||
    (currentNow.posterUrl || '') !== poster ||
    currentTypeNow === 'static'
  ) {
    return false;
  }

  lastAppliedWallpaper = {
    id: selectionId,
    poster,
    video,
    type: 'video',
    sourceRevision: (currentNow && (currentNow.sourceRevision || currentNow.revision)) || (lastAppliedWallpaper && lastAppliedWallpaper.sourceRevision) || 0
  };

  startBackgroundVideos();
  if (setupBackgroundVideoCrossfade()) {
    if (typeof recordStartupPerfEvent === 'function') {
      recordStartupPerfEvent('newtab:crossfade-setup');
    }
    backgroundVideoCrossfadeSetupKey = crossfadeKey;
    return true;
  }
  return false;
}

function handleWallpaperVisibilityChange() {
  if (typeof document === 'undefined') return;

  const videos = document.querySelectorAll('.background-video');

  if (document.hidden) {
    cancelPendingSourceLoadOperation();
    backgroundVideoSourceLoadGeneration += 1;
    wallpaperResumeSequence += 1;
    videos.forEach((v) => {
      if (!v.paused) {
        v.dataset.wasPlaying = 'true';
        try { v.pause(); } catch (e) {}
      }
    });
  } else {
    resumeWallpaperPlaybackIfEligible().catch(() => {});

    if (!document.body.classList.contains('modal-open')) {
      const searchInput = document.getElementById('search-input');
      if (searchInput && typeof setTimeout === 'function') {
        setTimeout(() => searchInput.focus(), 50);
      }
    }
  }
}

let wallpaperVisibilityListenerAttached = false;

function setupWallpaperVisibilityListener() {
  if (typeof document === 'undefined') return;
  if (wallpaperVisibilityListenerAttached) return;
  wallpaperVisibilityListenerAttached = true;
  if (document.documentElement && document.documentElement.dataset) {
    document.documentElement.dataset.wallpaperVisibilityAttached = 'true';
  }
  document.addEventListener('visibilitychange', handleWallpaperVisibilityChange);
}

// ===============================================
// --- SELECTION RESOLUTION & DAILY ROTATION ---
// ===============================================

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
    pool = typeof shuffleArray === 'function'
      ? shuffleArray(manifest.map(item => item.id))
      : manifest.map(item => item.id).sort(() => Math.random() - 0.5);
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

function schedulePendingDailyRotationAttempt() {
  if (pendingDailyRotationTimer) return;

  pendingDailyRotationTimer = setTimeout(async () => {
    pendingDailyRotationTimer = null;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) return;

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
    if (typeof recordIdleTaskPerf === 'function') {
      recordIdleTaskPerf('startup:ensureDailyWallpaper', 'start');
    }
    if (typeof DEBUG_IDLE_STARTUP !== 'undefined' && DEBUG_IDLE_STARTUP) {
      console.log('[startup idle] startup:ensureDailyWallpaper start');
    }
  }

  try {
    if (typeof isPerformanceModeEnabled === 'function' && isPerformanceModeEnabled()) {
      if (
        wallpaperTypePreference === 'video' ||
        (currentWallpaperSelection && currentWallpaperSelection.videoUrl)
      ) {
        if (typeof recordPerformanceModeVideoSkipped === 'function') {
          recordPerformanceModeVideoSkipped();
        }
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
      const batteryPref = typeof appBatteryOptimizationPreference !== 'undefined'
        ? appBatteryOptimizationPreference
        : (typeof window !== 'undefined' && window.appBatteryOptimizationPreference);
      if (batteryPref) {
        saveBattery = await checkBatteryStatus();
      }

      if (saveBattery && hydratedSelection.videoUrl) {
        applyWallpaperByType(hydratedSelection, 'static');
        return;
      }

      const type = hydratedSelection.videoUrl ? await getWallpaperTypePreference() : 'static';
      applyWallpaperByType(hydratedSelection, type);
      if (typeof scheduleIdleTask === 'function') {
        scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydratedSelection), 'cacheAppliedWallpaperVideo');
      } else {
        cacheAppliedWallpaperVideo(hydratedSelection);
      }
    } else {
      applyWallpaperBackground('assets/fallback.webp');
    }
  } finally {
    if (recordStartupIdle) {
      const elapsedMs =
        startupIdleStart && typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now() - startupIdleStart
          : 0;

      if (typeof recordIdleTaskPerf === 'function') {
        recordIdleTaskPerf('startup:ensureDailyWallpaper', 'end', elapsedMs);
      }
      if (typeof DEBUG_IDLE_STARTUP !== 'undefined' && DEBUG_IDLE_STARTUP) {
        console.log('[startup idle] startup:ensureDailyWallpaper end in', Math.round(elapsedMs), 'ms');
      }
    }
  }
}

async function primeWallpaperBackground() {
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
}

async function loadWallpaperTypePreference() {
  wallpaperTypePreference = await getWallpaperTypePreferenceStorage();

  const toggle = typeof wallpaperTypeToggle !== 'undefined' && wallpaperTypeToggle
    ? wallpaperTypeToggle
    : (typeof document !== 'undefined' ? document.getElementById('gallery-wallpaper-type-toggle') : null);
  if (toggle) {
    toggle.checked = wallpaperTypePreference === 'video';
  }

  const select = typeof appWallpaperTypeSelect !== 'undefined' && appWallpaperTypeSelect
    ? appWallpaperTypeSelect
    : (typeof document !== 'undefined' ? document.getElementById('app-wallpaper-type-select') : null);
  if (select) {
    select.value = wallpaperTypePreference;
  }

  const syncFn = (typeof HomebasePerformanceController !== 'undefined' && typeof HomebasePerformanceController.syncWallpaperTypeControls === 'function')
    ? HomebasePerformanceController.syncWallpaperTypeControls
    : (typeof syncWallpaperTypeControls === 'function' ? syncWallpaperTypeControls : null);
  if (syncFn) {
    syncFn(undefined, wallpaperTypePreference);
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

  const syncFn = (typeof HomebasePerformanceController !== 'undefined' && typeof HomebasePerformanceController.syncWallpaperTypeControls === 'function')
    ? HomebasePerformanceController.syncWallpaperTypeControls
    : (typeof syncWallpaperTypeControls === 'function' ? syncWallpaperTypeControls : null);
  if (syncFn) {
    syncFn(undefined, next);
  }

  // Re-apply current wallpaper with the new mode if available
  try {
    const storedSelection = await getWallpaperSelection();
    let selection = storedSelection || currentWallpaperSelection;

    if (!selection) {
      const selectedAt = (await getWallpaperFallbackUsedAt()) || Date.now();
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

// ===============================================
// --- WALLPAPER GALLERY UI LIFECYCLE & CONTEXT ---
// ===============================================

async function ensureGalleryUi() {
  if (typeof loadStylesheetOnce === 'function') {
    await loadStylesheetOnce('newtab/styles/gallery.css');
  } else if (typeof window !== 'undefined' && typeof window.loadStylesheetOnce === 'function') {
    await window.loadStylesheetOnce('newtab/styles/gallery.css');
  }

  if (typeof loadScriptOnce === 'function') {
    await loadScriptOnce('newtab/wallpaper/gallery-ui.js');
  } else if (typeof window !== 'undefined' && typeof window.loadScriptOnce === 'function') {
    await window.loadScriptOnce('newtab/wallpaper/gallery-ui.js');
  }

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
    cacheGalleryPosters: typeof cacheGalleryPosters === 'function' ? cacheGalleryPosters : (typeof window !== 'undefined' ? window.cacheGalleryPosters : null),
    cacheAppliedWallpaperVideo,
    cacheAppliedWallpaperPoster,
    resolvePosterBlob: typeof resolvePosterBlob === 'function' ? resolvePosterBlob : (typeof window !== 'undefined' ? window.resolvePosterBlob : null),
    cacheAsset: typeof cacheAsset === 'function' ? cacheAsset : (typeof window !== 'undefined' ? window.cacheAsset : null),
    hydrateWallpaperSelection,
    ensurePlayableSelection,
    getWallpaperUrls,
    isGallerySelection,
    isRemoteVideoUrl: typeof isRemoteVideoUrl === 'function' ? isRemoteVideoUrl : (typeof window !== 'undefined' ? window.isRemoteVideoUrl : null),
    normalizeWallpaperCacheKey: typeof normalizeWallpaperCacheKey === 'function' ? normalizeWallpaperCacheKey : (typeof window !== 'undefined' ? window.normalizeWallpaperCacheKey : null),
    getCacheKeyVariants: typeof getCacheKeyVariants === 'function' ? getCacheKeyVariants : (typeof window !== 'undefined' ? window.getCacheKeyVariants : null),
    buildFallbackSelection,
    applyWallpaperBackground,
    setWallpaperFallbackPoster,
    clearBackgroundVideos,
    isPerformanceModeEnabled: typeof isPerformanceModeEnabled === 'function' ? isPerformanceModeEnabled : (typeof window !== 'undefined' ? window.isPerformanceModeEnabled : () => false),
    blobToDataUrl: typeof blobToDataUrl === 'function' ? blobToDataUrl : (typeof window !== 'undefined' ? window.blobToDataUrl : null),
    openModalWithAnimation: typeof openModalWithAnimation === 'function' ? openModalWithAnimation : (typeof window !== 'undefined' ? window.openModalWithAnimation : null),
    closeModalWithAnimation: typeof closeModalWithAnimation === 'function' ? closeModalWithAnimation : (typeof window !== 'undefined' ? window.closeModalWithAnimation : null),
    showCustomDialog: typeof showCustomDialog === 'function' ? showCustomDialog : (typeof window !== 'undefined' ? window.showCustomDialog : null),
    showCustomAlert: typeof showCustomAlert === 'function' ? showCustomAlert : (typeof window !== 'undefined' ? window.showCustomAlert : null),
    scheduleIdleTask: typeof scheduleIdleTask === 'function' ? scheduleIdleTask : (typeof window !== 'undefined' ? window.scheduleIdleTask : (fn) => setTimeout(fn, 1)),
    debounce: typeof debounce === 'function' ? debounce : (typeof window !== 'undefined' ? window.debounce : (fn) => fn),
    ...(typeof createGalleryStorageBridge === 'function' ? createGalleryStorageBridge() : (typeof window !== 'undefined' && typeof window.createGalleryStorageBridge === 'function' ? window.createGalleryStorageBridge() : {}))
  };
}

function notifyGalleryUiLoadFailure(err) {
  console.warn('Failed to open gallery UI', err);
  const message = 'Could not open the wallpaper gallery. Please try again.';
  if (typeof showCustomAlert === 'function') {
    showCustomAlert(message);
  } else if (typeof window !== 'undefined' && typeof window.showCustomAlert === 'function') {
    window.showCustomAlert(message);
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

// --- Window Property Bridges for Seamless Multi-Script Access ---
if (typeof window !== 'undefined') {
  if (!('currentWallpaperSelection' in window)) {
    Object.defineProperty(window, 'currentWallpaperSelection', {
      get: () => currentWallpaperSelection,
      set: (val) => { currentWallpaperSelection = val || null; },
      configurable: true,
      enumerable: true
    });
  }
  if (!('wallpaperTypePreference' in window)) {
    Object.defineProperty(window, 'wallpaperTypePreference', {
      get: () => wallpaperTypePreference,
      set: (val) => { wallpaperTypePreference = val === 'static' ? 'static' : 'video'; },
      configurable: true,
      enumerable: true
    });
  }
  if (!('wallpaperQualityPreference' in window)) {
    Object.defineProperty(window, 'wallpaperQualityPreference', {
      get: () => wallpaperQualityPreference,
      set: (val) => { wallpaperQualityPreference = val === 'high' ? 'high' : 'low'; },
      configurable: true,
      enumerable: true
    });
  }
  if (!('lastAppliedWallpaper' in window)) {
    Object.defineProperty(window, 'lastAppliedWallpaper', {
      get: () => lastAppliedWallpaper,
      set: (val) => { lastAppliedWallpaper = val || { id: null, poster: '', video: '', type: '' }; },
      configurable: true,
      enumerable: true
    });
  }
  if (!('dailyRotationPreference' in window)) {
    Object.defineProperty(window, 'dailyRotationPreference', {
      get: () => dailyRotationPreference,
      set: (val) => { dailyRotationPreference = val !== false; },
      configurable: true,
      enumerable: true
    });
  }
  if (!('initialWallpaperState' in window)) {
    Object.defineProperty(window, 'initialWallpaperState', {
      get: () => initialWallpaperState,
      set: (val) => { initialWallpaperState = val || {}; },
      configurable: true,
      enumerable: true
    });
  }

  // Window function bindings
  window.loadCachedGalleryManifest = loadCachedGalleryManifest;
  window.refreshGalleryManifestInBackground = refreshGalleryManifestInBackground;
  window.fetchVideosManifestIfNeeded = fetchVideosManifestIfNeeded;
  window.getVideosManifest = getVideosManifest;
  window.cacheGalleryPostersIfNeeded = cacheGalleryPostersIfNeeded;
  window.warmGalleryPosterHydration = warmGalleryPosterHydration;
  window.cacheAppliedWallpaperVideo = cacheAppliedWallpaperVideo;
  window.cacheAppliedWallpaperPoster = cacheAppliedWallpaperPoster;
  window.isValidStartupPosterDataUrl = isValidStartupPosterDataUrl;
  window.canvasToDataUrlAsync = canvasToDataUrlAsync;

  // Video Lifecycle function bindings
  window.setWallpaperFallbackPoster = setWallpaperFallbackPoster;
  window.applyWallpaperBackground = applyWallpaperBackground;
  window.hydrateWallpaperSelection = hydrateWallpaperSelection;
  window.ensurePlayableSelection = ensurePlayableSelection;
  window.setBackgroundVideoSources = setBackgroundVideoSources;
  window.startBackgroundVideosAfterSourceLoad = startBackgroundVideosAfterSourceLoad;
  window.waitForWallpaperReady = waitForWallpaperReady;
  window.setupBackgroundVideoCrossfade = setupBackgroundVideoCrossfade;
  window.cleanupUnusedObjectUrls = cleanupUnusedObjectUrls;
  window.applyWallpaperByType = applyWallpaperByType;
  window.clearBackgroundVideos = clearBackgroundVideos;
  window.startBackgroundVideos = startBackgroundVideos;
  window.updateSettingsPreview = updateSettingsPreview;
  window.resumeWallpaperPlaybackIfEligible = resumeWallpaperPlaybackIfEligible;
  window.handleWallpaperVisibilityChange = handleWallpaperVisibilityChange;
  window.setupWallpaperVisibilityListener = setupWallpaperVisibilityListener;

  // Selection & Daily Rotation function bindings
  window.buildFallbackSelection = buildFallbackSelection;
  window.rebuildCurrentSelectionFromGallery = rebuildCurrentSelectionFromGallery;
  window.pickNextWallpaper = pickNextWallpaper;
  window.schedulePendingDailyRotationAttempt = schedulePendingDailyRotationAttempt;
  window.ensureDailyWallpaper = ensureDailyWallpaper;
  window.loadWallpaperTypePreference = loadWallpaperTypePreference;
  window.loadCurrentWallpaperSelection = loadCurrentWallpaperSelection;
  window.getWallpaperTypePreference = getWallpaperTypePreference;
  window.setWallpaperTypePreference = setWallpaperTypePreference;
  window.primeWallpaperBackground = primeWallpaperBackground;

  // Gallery UI Lifecycle & Context function bindings
  window.ensureGalleryUi = ensureGalleryUi;
  window.createGalleryContext = createGalleryContext;
  window.notifyGalleryUiLoadFailure = notifyGalleryUiLoadFailure;
  window.openWallpaperGallery = openWallpaperGallery;
}

// --- Homebase Wallpaper Controller Namespace ---
window.HomebaseWallpaperController = {
  // Pure Helpers: Dates & Selection
  getLocalDayStamp,
  isNewLocalDay,
  isDailyWallpaperRotationDue,
  isUserUploadSelection,
  isGallerySelection,
  getWallpaperUrls,
  getGalleryUrlsOrNull,
  checkBatteryStatus,

  // Pure Helpers: Manifest & Network
  hasUsableGalleryManifest,
  getGalleryManifestTimestamp,
  fetchGalleryManifestWithTimeout,

  // Pure Helpers: Poster Encoding & Snapshots
  isValidStartupPosterDataUrl,
  canvasToDataUrlAsync,
  createOptimizedPosterDataUrl,
  createStartupPosterDataUrl,
  buildVideoPosterFromFile,

  // Pure Helpers: UI Controls & Playback Cleanup
  cleanupBackgroundPlayback,
  setNextWallpaperButtonLoading,

  // Cache & Manifest Pipeline
  loadCachedGalleryManifest,
  refreshGalleryManifestInBackground,
  fetchVideosManifestIfNeeded,
  getVideosManifest,
  cacheGalleryPostersIfNeeded,
  warmGalleryPosterHydration,
  cacheAppliedWallpaperVideo,
  cacheAppliedWallpaperPoster,

  // Video Lifecycle & Playback
  setWallpaperFallbackPoster,
  applyWallpaperBackground,
  hydrateWallpaperSelection,
  ensurePlayableSelection,
  setBackgroundVideoSources,
  startBackgroundVideosAfterSourceLoad,
  waitForWallpaperReady,
  setupBackgroundVideoCrossfade,
  cleanupUnusedObjectUrls,
  applyWallpaperByType,
  clearBackgroundVideos,
  startBackgroundVideos,
  updateSettingsPreview,
  resumeWallpaperPlaybackIfEligible,
  handleVisibilityChange: handleWallpaperVisibilityChange,
  setupVisibilityListener: setupWallpaperVisibilityListener,

  // Pure Selection Helpers
  buildFallbackSelection,
  rebuildCurrentSelectionFromGallery,
  pickNextWallpaper,

  // Daily Rotation Runtime
  schedulePendingDailyRotationAttempt,
  ensureDailyWallpaper,
  primeWallpaperBackground,

  // Wallpaper Preference Management
  loadWallpaperTypePreference,
  loadCurrentWallpaperSelection,
  getWallpaperTypePreference,
  setWallpaperTypePreference,

  // Gallery UI Lifecycle & Context
  ensureGalleryUi,
  createGalleryContext,
  notifyGalleryUiLoadFailure,
  openWallpaperGallery,

  // State Accessors
  getCurrentWallpaperSelection: () => currentWallpaperSelection,
  setCurrentWallpaperSelection: (sel) => { currentWallpaperSelection = sel || null; },
  getWallpaperTypePreference: getWallpaperTypePreference,
  setWallpaperTypePreference: setWallpaperTypePreference,
  getWallpaperTypePreferenceState: () => wallpaperTypePreference,
  setWallpaperTypePreferenceState: (type) => { wallpaperTypePreference = type === 'static' ? 'static' : 'video'; },
  getWallpaperQualityPreference: () => wallpaperQualityPreference || 'low',
  setWallpaperQualityPreference: (q) => { wallpaperQualityPreference = q === 'high' ? 'high' : 'low'; },
  getDailyRotationPreference: () => dailyRotationPreference,
  setDailyRotationPreference: (val) => { dailyRotationPreference = val !== false; },
  getInitialWallpaperState: () => initialWallpaperState,
  setInitialWallpaperState: (val) => { initialWallpaperState = val || {}; },
  getActiveCrossfadeTransition: () => activeCrossfadeTransition,
  getLastAppliedWallpaper: () => lastAppliedWallpaper,
  getActivePosterGenerationToken: () => activePosterGenerationToken,
  getActivePosterGenerationTarget: () => activePosterGenerationTarget,
  getActivePosterGenerationRevision: () => activePosterGenerationRevision,
  getActivePosterGenerationEncodingVersion: () => activePosterGenerationEncodingVersion,
  getActivePosterGenerationForced: () => activePosterGenerationForced,
  getActivePosterGenerationPromise: () => activePosterGenerationPromise,
  getWallpaperResumeSequence: () => wallpaperResumeSequence,
  getPendingSourceLoadOperation: () => pendingSourceLoadOperation,
  cancelPendingSourceLoadOperation,
  resetActivePosterGenerationState: () => {
    activePosterGenerationPromise = null;
    activePosterGenerationTarget = '';
    activePosterGenerationRevision = 0;
    activePosterGenerationEncodingVersion = STARTUP_POSTER_ENCODING_VERSION;
    activePosterGenerationForced = false;
    activePosterGenerationToken = 0;
  }
};

setupWallpaperVisibilityListener();
primeWallpaperBackground();
