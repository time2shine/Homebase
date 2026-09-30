/**
 * Homebase Wallpaper & Background Video Runtime Controller (Phase A Checkpoint)
 * Coordinates wallpaper state, pure helpers, poster encoding, day stamps,
 * and runtime compatibility bridges across Homebase dual-browser environments.
 */

// --- Wallpaper & Poster Constants ---
const TARGET_STARTUP_POSTER_DATA_URL_LENGTH = 240000;
const STARTUP_POSTER_MAX_DIM_SEQUENCE = [1280, 960, 720];
const STARTUP_POSTER_QUALITY_SEQUENCE = [0.76, 0.68, 0.6];
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

let lastAppliedWallpaper = { id: null, poster: '', video: '', type: '' };
let backgroundVideoSourceLoadPromise = Promise.resolve();
let backgroundVideoSourceLoadGeneration = 0;
let wallpaperVideoStartSequence = 0;
let backgroundVideoCrossfadeSetupKey = '';
let videoPlaybackController = null;
let backgroundCrossfadeTimeout = null;

let galleryHydrationWarmPromise = null;

let currentWallpaperSelection = null;
let wallpaperTypePreference = null; // 'video' | 'static'
let wallpaperQualityPreference = 'low';

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

    return canvas.toDataURL('image/webp', quality);
  }

  // Fallback for browsers/contexts where createImageBitmap was unavailable or failed
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
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
      resolve(canvas.toDataURL('image/webp', quality));
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
  createOptimizedPosterDataUrl,
  createStartupPosterDataUrl,
  buildVideoPosterFromFile,

  // Pure Helpers: UI Controls & Playback Cleanup
  cleanupBackgroundPlayback,
  setNextWallpaperButtonLoading,

  // State Accessors
  getCurrentWallpaperSelection: () => currentWallpaperSelection,
  setCurrentWallpaperSelection: (sel) => { currentWallpaperSelection = sel || null; },
  getWallpaperTypePreference: () => wallpaperTypePreference || 'video',
  setWallpaperTypePreference: (type) => { wallpaperTypePreference = type === 'static' ? 'static' : 'video'; },
  getWallpaperTypePreferenceState: () => wallpaperTypePreference,
  setWallpaperTypePreferenceState: (type) => { wallpaperTypePreference = type === 'static' ? 'static' : 'video'; },
  getWallpaperQualityPreference: () => wallpaperQualityPreference || 'low',
  setWallpaperQualityPreference: (q) => { wallpaperQualityPreference = q === 'high' ? 'high' : 'low'; },
  getLastAppliedWallpaper: () => lastAppliedWallpaper
};
