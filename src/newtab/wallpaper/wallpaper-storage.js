// Wallpaper Storage Service (Phase 4A & 4B & 4C: Manifest, Assets, Rotation & State)
// Coordinates wallpaper manifest caching, poster cache metadata, gallery state,
// asset lifecycle, daily rotation timestamps, and mode preferences via HomebaseStorage
// with defensive fallback to browser.storage.local.

const VIDEOS_JSON_CACHE_KEY = 'videosManifest';
const VIDEOS_JSON_FETCHED_AT_KEY = 'videosManifestFetchedAt';
const GALLERY_POSTERS_CACHE_KEY = 'cachedGalleryPosters';
const GALLERY_POSTERS_CACHE_CHECKED_AT_KEY = 'galleryPostersCacheCheckedAt';
const GALLERY_POSTERS_CACHE_SIGNATURE_KEY = 'galleryPostersCacheSignature';
const FAVORITES_KEY = 'galleryFavorites';
const CACHED_APPLIED_VIDEO_URL_KEY = 'cachedAppliedVideoUrl';
const CACHED_APPLIED_POSTER_URL_KEY = 'cachedAppliedPosterUrl';
const CACHED_APPLIED_POSTER_DATA_URL_KEY = 'cachedAppliedPosterDataUrl';
const CACHED_APPLIED_POSTER_CACHE_KEY = 'cachedAppliedPoster';

const WALLPAPER_POOL_KEY = 'wallpaperPoolIds';
const WALLPAPER_SELECTION_KEY = 'wallpaperSelection';
const WALLPAPER_FALLBACK_USED_KEY = 'wallpaperFallbackUsedAt';
const DAILY_ROTATION_KEY = 'dailyWallpaperEnabled';
const PENDING_DAILY_ROTATION_KEY = 'pendingDailyRotation';
const PENDING_DAILY_ROTATION_SINCE_KEY = 'pendingDailyRotationSince';
const WALLPAPER_STARTUP_STATE_KEY = 'wallpaperStartupState';
const WALLPAPER_TYPE_KEY = 'wallpaperTypePreference';
const WALLPAPER_QUALITY_KEY = 'wallpaperQualityPreference';

const WALLPAPER_CACHE_NAME = 'wallpaper-assets';
const GALLERY_POSTERS_CACHE_NAME = 'gallery-posters';
const POSTER_CACHE_CONCURRENCY = 4;
const USER_WALLPAPER_CACHE_PREFIX = 'https://user-wallpapers.local/';
const REMOTE_VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

const isRemoteHttpUrl = (url = '') => typeof url === 'string' && /^https?:\/\//i.test(url);
const isRemoteVideoUrl = (url = '') => isRemoteHttpUrl(url) && REMOTE_VIDEO_REGEX.test(url);

const wallpaperObjectUrlCache = new Map();

function getCachesApi() {
  if (typeof caches !== 'undefined') return caches;
  if (typeof window !== 'undefined' && window.caches) return window.caches;
  return null;
}

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

/**
 * Normalizes numeric or string timestamps into safe epoch millisecond numbers.
 *
 * @param {*} value
 * @returns {number}
 */
function normalizeTimestamp(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Loads the cached gallery manifest and its fetch timestamp.
 *
 * @returns {Promise<{manifest: Array, fetchedAt: number}>}
 */
async function getVideosManifestCache() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
      const stored = await window.HomebaseStorage.getMany([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);
      const manifest = Array.isArray(stored[VIDEOS_JSON_CACHE_KEY]) ? stored[VIDEOS_JSON_CACHE_KEY] : [];
      const fetchedAt = normalizeTimestamp(stored[VIDEOS_JSON_FETCHED_AT_KEY]);
      return { manifest, fetchedAt };
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);
      const manifest = Array.isArray(stored[VIDEOS_JSON_CACHE_KEY]) ? stored[VIDEOS_JSON_CACHE_KEY] : [];
      const fetchedAt = normalizeTimestamp(stored[VIDEOS_JSON_FETCHED_AT_KEY]);
      return { manifest, fetchedAt };
    }
    return { manifest: [], fetchedAt: 0 };
  } catch (err) {
    console.warn('Failed to load videos manifest cache', err);
    return { manifest: [], fetchedAt: 0 };
  }
}

/**
 * Persists the gallery videos manifest and fetch timestamp.
 *
 * @param {Array} manifest
 * @param {number} [fetchedAt]
 * @returns {Promise<void>}
 */
async function setVideosManifestCache(manifest, fetchedAt = Date.now()) {
  const safeManifest = Array.isArray(manifest) ? manifest : [];
  const safeFetchedAt = normalizeTimestamp(fetchedAt) || Date.now();
  const payload = {
    [VIDEOS_JSON_CACHE_KEY]: safeManifest,
    [VIDEOS_JSON_FETCHED_AT_KEY]: safeFetchedAt
  };

  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
      await window.HomebaseStorage.setMany(payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set(payload);
    }
  } catch (err) {
    console.warn('Failed to persist videos manifest cache', err);
  }
}

/**
 * Clears the cached videos manifest from storage.
 *
 * @returns {Promise<void>}
 */
async function clearVideosManifestCache() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove([VIDEOS_JSON_CACHE_KEY, VIDEOS_JSON_FETCHED_AT_KEY]);
    }
  } catch (err) {
    console.warn('Failed to clear videos manifest cache', err);
  }
}

/**
 * Retrieves poster cache check metadata (timestamp and manifest signature).
 *
 * @returns {Promise<{lastCheckedAt: number, signature: string}>}
 */
async function getGalleryPostersCacheMetadata() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
      const stored = await window.HomebaseStorage.getMany([
        GALLERY_POSTERS_CACHE_CHECKED_AT_KEY,
        GALLERY_POSTERS_CACHE_SIGNATURE_KEY
      ]);
      const lastCheckedAt = normalizeTimestamp(stored[GALLERY_POSTERS_CACHE_CHECKED_AT_KEY]);
      const signature = typeof stored[GALLERY_POSTERS_CACHE_SIGNATURE_KEY] === 'string' ? stored[GALLERY_POSTERS_CACHE_SIGNATURE_KEY] : '';
      return { lastCheckedAt, signature };
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get([
        GALLERY_POSTERS_CACHE_CHECKED_AT_KEY,
        GALLERY_POSTERS_CACHE_SIGNATURE_KEY
      ]);
      const lastCheckedAt = normalizeTimestamp(stored[GALLERY_POSTERS_CACHE_CHECKED_AT_KEY]);
      const signature = typeof stored[GALLERY_POSTERS_CACHE_SIGNATURE_KEY] === 'string' ? stored[GALLERY_POSTERS_CACHE_SIGNATURE_KEY] : '';
      return { lastCheckedAt, signature };
    }
    return { lastCheckedAt: 0, signature: '' };
  } catch (err) {
    console.warn('Failed to read gallery poster cache metadata', err);
    return { lastCheckedAt: 0, signature: '' };
  }
}

/**
 * Persists poster cache check metadata.
 *
 * @param {string} signature
 * @param {number} [checkedAt]
 * @returns {Promise<void>}
 */
async function setGalleryPostersCacheMetadata(signature, checkedAt = Date.now()) {
  const safeSignature = typeof signature === 'string' ? signature : '';
  const safeCheckedAt = normalizeTimestamp(checkedAt) || Date.now();
  const payload = {
    [GALLERY_POSTERS_CACHE_CHECKED_AT_KEY]: safeCheckedAt,
    [GALLERY_POSTERS_CACHE_SIGNATURE_KEY]: safeSignature
  };

  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
      await window.HomebaseStorage.setMany(payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set(payload);
    }
  } catch (err) {
    console.warn('Failed to persist gallery poster cache metadata', err);
  }
}

/**
 * Retrieves the list of cached gallery poster identifiers.
 *
 * @returns {Promise<Array<string>>}
 */
async function getCachedGalleryPosters() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(GALLERY_POSTERS_CACHE_KEY, []);
      return Array.isArray(val) ? val : [];
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(GALLERY_POSTERS_CACHE_KEY);
      const val = stored && stored[GALLERY_POSTERS_CACHE_KEY];
      return Array.isArray(val) ? val : [];
    }
    return [];
  } catch (err) {
    console.warn('Failed to read cached gallery posters', err);
    return [];
  }
}

/**
 * Persists the list of cached gallery poster identifiers.
 *
 * @param {Array<string>} posters
 * @returns {Promise<void>}
 */
async function setCachedGalleryPosters(posters) {
  const safeList = Array.isArray(posters) ? posters.filter((p) => typeof p === 'string') : [];
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(GALLERY_POSTERS_CACHE_KEY, safeList);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [GALLERY_POSTERS_CACHE_KEY]: safeList });
    }
  } catch (err) {
    console.warn('Failed to persist cached gallery posters', err);
  }
}

/**
 * Retrieves user gallery favorite IDs.
 *
 * @returns {Promise<Array<string>>}
 */
async function getGalleryFavorites() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(FAVORITES_KEY, []);
      return Array.isArray(val) ? val : [];
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(FAVORITES_KEY);
      const val = stored && stored[FAVORITES_KEY];
      return Array.isArray(val) ? val : [];
    }
    return [];
  } catch (err) {
    console.warn('Failed to read gallery favorites', err);
    return [];
  }
}

/**
 * Persists user gallery favorite IDs.
 *
 * @param {Array<string>|Set<string>} favorites
 * @returns {Promise<void>}
 */
async function setGalleryFavorites(favorites) {
  const safeList = Array.isArray(favorites)
    ? favorites.filter((f) => typeof f === 'string')
    : ((favorites instanceof Set || (favorites && typeof favorites.forEach === 'function' && typeof favorites.size === 'number'))
        ? Array.from(favorites).filter((f) => typeof f === 'string')
        : []);

  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(FAVORITES_KEY, safeList);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [FAVORITES_KEY]: safeList });
    }
  } catch (err) {
    console.warn('Failed to persist gallery favorites', err);
  }
}

/**
 * Retrieves the cached applied video URL.
 *
 * @returns {Promise<string>}
 */
async function getCachedAppliedVideoUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(CACHED_APPLIED_VIDEO_URL_KEY, '');
      return typeof val === 'string' ? val : '';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(CACHED_APPLIED_VIDEO_URL_KEY);
      const val = stored && stored[CACHED_APPLIED_VIDEO_URL_KEY];
      return typeof val === 'string' ? val : '';
    }
    return '';
  } catch (err) {
    console.warn('Failed to read cached applied video url', err);
    return '';
  }
}

/**
 * Persists the cached applied video URL.
 *
 * @param {string} targetUrl
 * @returns {Promise<void>}
 */
async function setCachedAppliedVideoUrl(targetUrl) {
  const safeUrl = typeof targetUrl === 'string' ? targetUrl : '';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      if (safeUrl) {
        await window.HomebaseStorage.set(CACHED_APPLIED_VIDEO_URL_KEY, safeUrl);
      } else {
        await window.HomebaseStorage.remove(CACHED_APPLIED_VIDEO_URL_KEY);
      }
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      if (safeUrl) {
        await browser.storage.local.set({ [CACHED_APPLIED_VIDEO_URL_KEY]: safeUrl });
      } else {
        await browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY);
      }
    }
  } catch (err) {
    console.warn('Failed to persist cached applied video url', err);
  }
}

/**
 * Clears the cached applied video URL.
 *
 * @returns {Promise<void>}
 */
async function clearCachedAppliedVideoUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(CACHED_APPLIED_VIDEO_URL_KEY);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(CACHED_APPLIED_VIDEO_URL_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear cached applied video url', err);
  }
}

/**
 * Retrieves the cached applied poster URL placeholder.
 *
 * @returns {Promise<string>}
 */
async function getCachedAppliedPosterUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(CACHED_APPLIED_POSTER_URL_KEY, '');
      return typeof val === 'string' ? val : '';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(CACHED_APPLIED_POSTER_URL_KEY);
      const val = stored && stored[CACHED_APPLIED_POSTER_URL_KEY];
      return typeof val === 'string' ? val : '';
    }
    return '';
  } catch (err) {
    console.warn('Failed to read cached applied poster url', err);
    return '';
  }
}

/**
 * Persists the cached applied poster URL placeholder and updates synchronous localStorage mirror.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function setCachedAppliedPosterUrl(url) {
  const safeUrl = typeof url === 'string' ? url : '';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(CACHED_APPLIED_POSTER_URL_KEY, safeUrl);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: safeUrl });
    }
  } catch (err) {
    console.warn('Failed to persist cached applied poster url', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      if (safeUrl) {
        localStorage.setItem('cachedAppliedPosterUrl', safeUrl);
      } else {
        localStorage.removeItem('cachedAppliedPosterUrl');
      }
    }
  } catch (e) {}
}

/**
 * Clears the cached applied poster URL placeholder and synchronous mirror.
 *
 * @returns {Promise<void>}
 */
async function clearCachedAppliedPosterUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(CACHED_APPLIED_POSTER_URL_KEY);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(CACHED_APPLIED_POSTER_URL_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear cached applied poster url', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cachedAppliedPosterUrl');
    }
  } catch (e) {}
}

/**
 * Retrieves the cached applied poster data URL.
 *
 * @returns {Promise<string>}
 */
async function getCachedAppliedPosterDataUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const val = await window.HomebaseStorage.get(CACHED_APPLIED_POSTER_DATA_URL_KEY, '');
      return typeof val === 'string' ? val : '';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(CACHED_APPLIED_POSTER_DATA_URL_KEY);
      const val = stored && stored[CACHED_APPLIED_POSTER_DATA_URL_KEY];
      return typeof val === 'string' ? val : '';
    }
    return '';
  } catch (err) {
    console.warn('Failed to read cached applied poster data url', err);
    return '';
  }
}

/**
 * Persists the cached applied poster data URL and updates synchronous localStorage mirror.
 *
 * @param {string} dataUrl
 * @returns {Promise<void>}
 */
async function setCachedAppliedPosterDataUrl(dataUrl) {
  const safeDataUrl = typeof dataUrl === 'string' ? dataUrl : '';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(CACHED_APPLIED_POSTER_DATA_URL_KEY, safeDataUrl);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [CACHED_APPLIED_POSTER_DATA_URL_KEY]: safeDataUrl });
    }
  } catch (err) {
    console.warn('Failed to persist cached applied poster data url', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      if (safeDataUrl) {
        localStorage.setItem('cachedAppliedPosterDataUrl', safeDataUrl);
      } else {
        localStorage.removeItem('cachedAppliedPosterDataUrl');
      }
    }
  } catch (e) {}
}

/**
 * Clears the cached applied poster data URL and synchronous mirror.
 *
 * @returns {Promise<void>}
 */
async function clearCachedAppliedPosterDataUrl() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear cached applied poster data url', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cachedAppliedPosterDataUrl');
    }
  } catch (e) {}
}

/**
 * Clears all applied poster metadata from storage and removes synchronous mirrors.
 *
 * @returns {Promise<void>}
 */
async function clearAppliedPosterMetadata() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove([CACHED_APPLIED_POSTER_URL_KEY, CACHED_APPLIED_POSTER_DATA_URL_KEY]);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove([CACHED_APPLIED_POSTER_URL_KEY, CACHED_APPLIED_POSTER_DATA_URL_KEY]);
    }
  } catch (err) {
    console.warn('Failed to clear applied poster metadata', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cachedAppliedPosterUrl');
      localStorage.removeItem('cachedAppliedPosterDataUrl');
    }
  } catch (e) {}
}

/**
 * Opens the wallpaper asset cache.
 *
 * @returns {Promise<Cache|null>}
 */
async function openWallpaperAssetCache() {
  const cacheApi = getCachesApi();
  if (!cacheApi) return null;
  try {
    return await cacheApi.open(WALLPAPER_CACHE_NAME);
  } catch (err) {
    console.warn('Failed to open wallpaper asset cache', err);
    return null;
  }
}

/**
 * Opens the gallery posters cache.
 *
 * @returns {Promise<Cache|null>}
 */
async function openGalleryPostersCache() {
  const cacheApi = getCachesApi();
  if (!cacheApi) return null;
  try {
    return await cacheApi.open(GALLERY_POSTERS_CACHE_NAME);
  } catch (err) {
    console.warn('Failed to open gallery posters cache', err);
    return null;
  }
}

/**
 * Caches an asset in the wallpaper asset cache if not already present.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function cacheAsset(url) {
  if (!url) return false;
  try {
    const cache = await openWallpaperAssetCache();
    if (!cache) return false;
    const cached = await cache.match(url);
    if (cached) return true;
    const res = await fetch(url, { cache: 'reload' });
    if (res.ok) {
      await cache.put(url, res.clone());
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed caching asset', url, err);
    return false;
  }
}

/**
 * Retrieves or creates an Object URL for a cached asset key.
 *
 * @param {string} cacheKey
 * @returns {Promise<string|null>}
 */
async function getCachedObjectUrl(cacheKey) {
  const keys = getCacheKeyVariants(cacheKey);
  if (!keys.length) return null;

  for (const key of keys) {
    if (wallpaperObjectUrlCache.has(key)) {
      return wallpaperObjectUrlCache.get(key);
    }
  }

  try {
    const cache = await openWallpaperAssetCache();
    if (!cache) return null;
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
  return null;
}

/**
 * Deletes an asset from the wallpaper asset cache and revokes any associated Object URL.
 *
 * @param {string} cacheKey
 * @returns {Promise<void>}
 */
async function deleteCachedObject(cacheKey) {
  const keys = getCacheKeyVariants(cacheKey);
  if (!keys.length) return;

  const cache = await openWallpaperAssetCache();

  keys.forEach((key) => {
    if (cache) {
      cache.delete(key).catch(() => {});
    }
    const cachedUrl = wallpaperObjectUrlCache.get(key);
    if (cachedUrl) {
      try {
        URL.revokeObjectURL(cachedUrl);
      } catch (_) {}
      wallpaperObjectUrlCache.delete(key);
    }
  });
}

/**
 * Prunes obsolete remote video files from the wallpaper asset cache.
 *
 * @param {string} [keepUrl='']
 * @returns {Promise<void>}
 */
async function pruneCachedVideos(keepUrl = '') {
  try {
    const cache = await openWallpaperAssetCache();
    if (!cache) return;
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

/**
 * Extracts distinct poster URLs from a gallery manifest.
 *
 * @param {Array} manifest
 * @returns {Array<string>}
 */
function getGalleryPosterUrls(manifest = []) {
  const isGalSel = typeof isGallerySelection === 'function' ? isGallerySelection : (typeof window !== 'undefined' && window.isGallerySelection);
  const getWpUrls = typeof getWallpaperUrls === 'function' ? getWallpaperUrls : (typeof window !== 'undefined' && window.getWallpaperUrls);
  return Array.from(new Set(
    (Array.isArray(manifest) ? manifest : [])
      .map((v) => {
        if (typeof isGalSel === 'function' && isGalSel(v) && typeof getWpUrls === 'function') {
          const urls = getWpUrls(v.id);
          return (urls && urls.posterUrl) || v.posterUrl || v.poster;
        }
        return v.posterUrl || v.poster;
      })
      .filter(Boolean)
  ));
}

/**
 * Generates a cache signature string for a gallery poster manifest.
 *
 * @param {Array} manifest
 * @returns {string}
 */
function getGalleryPosterCacheSignature(manifest = []) {
  return getGalleryPosterUrls(manifest).join('|');
}

/**
 * Caches gallery posters in the gallery-posters cache and records them in storage.
 *
 * @param {Array} manifest
 * @returns {Promise<void>}
 */
async function cacheGalleryPosters(manifest = []) {
  const posters = getGalleryPosterUrls(manifest);
  if (!posters.length) return;

  try {
    const cache = await openGalleryPostersCache();
    if (!cache) return;
    const cachedUrls = [];
    const runner = (typeof mapLimit === 'function')
      ? mapLimit
      : (typeof window !== 'undefined' && typeof window.mapLimit === 'function')
        ? window.mapLimit
        : async (items, _limit, fn) => Promise.all(items.map(fn));
    await runner(posters, POSTER_CACHE_CONCURRENCY, async (url) => {
      try {
        const existing = await cache.match(url);
        if (existing) {
          cachedUrls.push(url);
          return existing;
        }
        await cache.add(url);
        cachedUrls.push(url);
        return true;
      } catch (e) {
        console.warn('Failed to cache poster', url, e);
        return e;
      }
    });
    if (cachedUrls.length) {
      await setCachedGalleryPosters(cachedUrls);
    }
  } catch (e) {
    console.error('cacheGalleryPosters error:', e);
  }
}

/**
 * Resolves a poster blob from wallpaper-assets, applied poster, or MyWallpapers caches.
 *
 * @param {string} posterUrl
 * @param {string} [posterCacheKey='']
 * @returns {Promise<Blob|null>}
 */
async function resolvePosterBlob(posterUrl, posterCacheKey = '') {
  const cacheKeys = new Set();
  if (posterCacheKey) {
    getCacheKeyVariants(posterCacheKey).forEach((key) => cacheKeys.add(key));
  }
  if (posterUrl) {
    cacheKeys.add(posterUrl);
  }
  getCacheKeyVariants(CACHED_APPLIED_POSTER_CACHE_KEY).forEach((key) => cacheKeys.add(key));

  const cache = await openWallpaperAssetCache();

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
      const cacheApi = getCachesApi();
      if (cacheApi) {
        const myCache = await cacheApi.open(MyWallpapers.getCacheName());
        for (const key of cacheKeys) {
          try {
            const match = await myCache.match(key);
            if (match) {
              return await match.blob();
            }
          } catch (err) {}
        }
      }
    } catch (err) {}
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

/**
 * Clears the wallpaper asset cache and revokes all active Object URLs.
 *
 * @returns {Promise<void>}
 */
async function clearWallpaperCache() {
  try {
    const cacheApi = getCachesApi();
    if (cacheApi) {
      await cacheApi.delete(WALLPAPER_CACHE_NAME);
    }
    for (const [key, url] of wallpaperObjectUrlCache.entries()) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
    wallpaperObjectUrlCache.clear();
  } catch (err) {
    console.warn('Failed to clear wallpaper cache', err);
  }
}

/**
 * Loads the wallpaper shuffle pool.
 *
 * @returns {Promise<Array<string>>}
 */
async function getWallpaperPool() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(WALLPAPER_POOL_KEY);
      return Array.isArray(stored) ? stored : [];
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(WALLPAPER_POOL_KEY);
      const pool = stored && stored[WALLPAPER_POOL_KEY];
      return Array.isArray(pool) ? pool : [];
    }
    return [];
  } catch (err) {
    console.warn('Failed to load wallpaper pool', err);
    return [];
  }
}

/**
 * Persists the wallpaper shuffle pool.
 *
 * @param {Array<string>} pool
 * @returns {Promise<void>}
 */
async function setWallpaperPool(pool) {
  const safePool = Array.isArray(pool) ? pool : [];
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(WALLPAPER_POOL_KEY, safePool);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [WALLPAPER_POOL_KEY]: safePool });
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper pool', err);
  }
}

/**
 * Clears the wallpaper shuffle pool.
 *
 * @returns {Promise<void>}
 */
async function clearWallpaperPool() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(WALLPAPER_POOL_KEY);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(WALLPAPER_POOL_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear wallpaper pool', err);
  }
}

/**
 * Loads the currently selected wallpaper object.
 *
 * @returns {Promise<Object|null>}
 */
async function getWallpaperSelection() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(WALLPAPER_SELECTION_KEY);
      return (stored && typeof stored === 'object') ? stored : null;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(WALLPAPER_SELECTION_KEY);
      const selection = stored && stored[WALLPAPER_SELECTION_KEY];
      return (selection && typeof selection === 'object') ? selection : null;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load wallpaper selection', err);
    return null;
  }
}

/**
 * Persists the wallpaper selection object.
 *
 * @param {Object} selection
 * @returns {Promise<void>}
 */
async function setWallpaperSelection(selection) {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(WALLPAPER_SELECTION_KEY, selection);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: selection });
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper selection', err);
  }
}

/**
 * Clears the wallpaper selection from storage.
 *
 * @returns {Promise<void>}
 */
async function clearWallpaperSelection() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove(WALLPAPER_SELECTION_KEY);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove(WALLPAPER_SELECTION_KEY);
    }
  } catch (err) {
    console.warn('Failed to clear wallpaper selection', err);
  }
}

/**
 * Loads the timestamp when the wallpaper fallback was last used.
 *
 * @returns {Promise<number>}
 */
async function getWallpaperFallbackUsedAt() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(WALLPAPER_FALLBACK_USED_KEY);
      return normalizeTimestamp(stored);
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(WALLPAPER_FALLBACK_USED_KEY);
      return normalizeTimestamp(stored && stored[WALLPAPER_FALLBACK_USED_KEY]);
    }
    return 0;
  } catch (err) {
    console.warn('Failed to load wallpaper fallback timestamp', err);
    return 0;
  }
}

/**
 * Persists the timestamp when the wallpaper fallback was used.
 *
 * @param {number} [timestamp]
 * @returns {Promise<void>}
 */
async function setWallpaperFallbackUsedAt(timestamp = Date.now()) {
  const safeTs = normalizeTimestamp(timestamp) || Date.now();
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(WALLPAPER_FALLBACK_USED_KEY, safeTs);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [WALLPAPER_FALLBACK_USED_KEY]: safeTs });
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper fallback timestamp', err);
  }
}

/**
 * Persists the wallpaper selection and fallback timestamp together.
 *
 * @param {Object} selection
 * @param {number} [fallbackUsedAt]
 * @returns {Promise<void>}
 */
async function setWallpaperSelectionWithFallback(selection, fallbackUsedAt = Date.now()) {
  const safeTs = normalizeTimestamp(fallbackUsedAt) || Date.now();
  const payload = {
    [WALLPAPER_SELECTION_KEY]: selection,
    [WALLPAPER_FALLBACK_USED_KEY]: safeTs
  };
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
      await window.HomebaseStorage.setMany(payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set(payload);
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper selection with fallback', err);
  }
}

/**
 * Loads whether daily wallpaper rotation is enabled.
 *
 * @returns {Promise<boolean>}
 */
async function getDailyWallpaperEnabled() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(DAILY_ROTATION_KEY);
      return stored !== false;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(DAILY_ROTATION_KEY);
      return stored && stored[DAILY_ROTATION_KEY] !== false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to load daily wallpaper enabled flag', err);
    return true;
  }
}

/**
 * Persists whether daily wallpaper rotation is enabled.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
async function setDailyWallpaperEnabled(enabled) {
  const safeVal = enabled !== false;
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(DAILY_ROTATION_KEY, safeVal);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [DAILY_ROTATION_KEY]: safeVal });
    }
  } catch (err) {
    console.warn('Failed to persist daily wallpaper enabled flag', err);
  }
}

/**
 * Loads pending daily rotation state.
 *
 * @returns {Promise<{pending: boolean, since: number}>}
 */
async function getPendingDailyRotation() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
      const stored = await window.HomebaseStorage.getMany([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);
      return {
        pending: stored[PENDING_DAILY_ROTATION_KEY] === true,
        since: normalizeTimestamp(stored[PENDING_DAILY_ROTATION_SINCE_KEY])
      };
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);
      return {
        pending: stored && stored[PENDING_DAILY_ROTATION_KEY] === true,
        since: normalizeTimestamp(stored && stored[PENDING_DAILY_ROTATION_SINCE_KEY])
      };
    }
    return { pending: false, since: 0 };
  } catch (err) {
    console.warn('Failed to load pending daily rotation', err);
    return { pending: false, since: 0 };
  }
}

/**
 * Persists pending daily rotation state.
 *
 * @param {boolean} [pending]
 * @param {number} [since]
 * @returns {Promise<void>}
 */
async function setPendingDailyRotation(pending = true, since = Date.now()) {
  const safePending = pending === true;
  const safeSince = normalizeTimestamp(since) || Date.now();
  const payload = {
    [PENDING_DAILY_ROTATION_KEY]: safePending,
    [PENDING_DAILY_ROTATION_SINCE_KEY]: safeSince
  };
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.setMany === 'function') {
      await window.HomebaseStorage.setMany(payload);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set(payload);
    }
  } catch (err) {
    console.warn('Failed to persist pending daily rotation', err);
  }
}

/**
 * Clears pending daily rotation state.
 *
 * @returns {Promise<void>}
 */
async function clearPendingDailyRotation() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
      await window.HomebaseStorage.remove([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.remove([PENDING_DAILY_ROTATION_KEY, PENDING_DAILY_ROTATION_SINCE_KEY]);
    }
  } catch (err) {
    console.warn('Failed to clear pending daily rotation', err);
  }
}

/**
 * Retrieves the full wallpaper rotation state across storage in a single query.
 *
 * @returns {Promise<{
 *   selection: Object|null,
 *   fallbackUsedAt: number,
 *   allowDailyRotation: boolean,
 *   pending: boolean,
 *   pendingSince: number,
 *   quality: string|null
 * }>}
 */
async function getWallpaperRotationState() {
  const keys = [
    WALLPAPER_SELECTION_KEY,
    WALLPAPER_FALLBACK_USED_KEY,
    DAILY_ROTATION_KEY,
    PENDING_DAILY_ROTATION_KEY,
    PENDING_DAILY_ROTATION_SINCE_KEY,
    WALLPAPER_QUALITY_KEY
  ];
  try {
    let stored = {};
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.getMany === 'function') {
      stored = await window.HomebaseStorage.getMany(keys);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      stored = await browser.storage.local.get(keys);
    }
    return {
      selection: (stored[WALLPAPER_SELECTION_KEY] && typeof stored[WALLPAPER_SELECTION_KEY] === 'object') ? stored[WALLPAPER_SELECTION_KEY] : null,
      fallbackUsedAt: normalizeTimestamp(stored[WALLPAPER_FALLBACK_USED_KEY]),
      allowDailyRotation: stored[DAILY_ROTATION_KEY] !== false,
      pending: stored[PENDING_DAILY_ROTATION_KEY] === true,
      pendingSince: normalizeTimestamp(stored[PENDING_DAILY_ROTATION_SINCE_KEY]),
      quality: stored[WALLPAPER_QUALITY_KEY] === 'high' ? 'high' : (stored[WALLPAPER_QUALITY_KEY] === 'low' ? 'low' : null)
    };
  } catch (err) {
    console.warn('Failed to load wallpaper rotation state', err);
    return {
      selection: null,
      fallbackUsedAt: 0,
      allowDailyRotation: true,
      pending: false,
      pendingSince: 0,
      quality: null
    };
  }
}

/**
 * Synchronizes wallpaper startup state mirror to localStorage.
 *
 * @param {Object|null} selection
 * @param {boolean} allowDailyRotation
 */
function syncWallpaperStartupState(selection, allowDailyRotation) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!selection) {
      window.localStorage.removeItem(WALLPAPER_STARTUP_STATE_KEY);
      return;
    }
    const selectedAt = Number(selection.selectedAt || 0);
    window.localStorage.setItem(WALLPAPER_STARTUP_STATE_KEY, JSON.stringify({
      selectedAt: Number.isFinite(selectedAt) ? selectedAt : 0,
      dailyRotationEnabled: allowDailyRotation !== false
    }));
  } catch (err) {
    // Preload mirror is best-effort only
  }
}

/**
 * Reads the synchronous wallpaper startup state mirror from localStorage.
 *
 * @returns {Object|null}
 */
function getWallpaperStartupState() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(WALLPAPER_STARTUP_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Loads wallpaper type preference from storage.
 *
 * @returns {Promise<string>} 'video' | 'static'
 */
async function getWallpaperTypePreferenceStorage() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(WALLPAPER_TYPE_KEY);
      return stored === 'static' ? 'static' : 'video';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(WALLPAPER_TYPE_KEY);
      return stored && stored[WALLPAPER_TYPE_KEY] === 'static' ? 'static' : 'video';
    }
    return 'video';
  } catch (err) {
    console.warn('Failed to load wallpaper type preference', err);
    return 'video';
  }
}

/**
 * Persists wallpaper type preference to storage.
 *
 * @param {string} type
 * @returns {Promise<void>}
 */
async function setWallpaperTypePreferenceStorage(type) {
  const safeType = type === 'static' ? 'static' : 'video';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(WALLPAPER_TYPE_KEY, safeType);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [WALLPAPER_TYPE_KEY]: safeType });
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper type preference', err);
  }
}

/**
 * Loads wallpaper quality preference from storage.
 *
 * @returns {Promise<string>} 'high' | 'low'
 */
async function getWallpaperQualityPreferenceStorage() {
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      const stored = await window.HomebaseStorage.get(WALLPAPER_QUALITY_KEY);
      return stored === 'low' ? 'low' : 'high';
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(WALLPAPER_QUALITY_KEY);
      return stored && stored[WALLPAPER_QUALITY_KEY] === 'low' ? 'low' : 'high';
    }
    return 'high';
  } catch (err) {
    console.warn('Failed to load wallpaper quality preference', err);
    return 'high';
  }
}

/**
 * Persists wallpaper quality preference to storage.
 *
 * @param {string} quality
 * @returns {Promise<void>}
 */
async function setWallpaperQualityPreferenceStorage(quality) {
  const safeQuality = quality === 'low' ? 'low' : 'high';
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(WALLPAPER_QUALITY_KEY, safeQuality);
      return;
    }
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [WALLPAPER_QUALITY_KEY]: safeQuality });
    }
  } catch (err) {
    console.warn('Failed to persist wallpaper quality preference', err);
  }
}

// Window & namespace exports
if (typeof window !== 'undefined') {
  window.VIDEOS_JSON_CACHE_KEY = VIDEOS_JSON_CACHE_KEY;
  window.VIDEOS_JSON_FETCHED_AT_KEY = VIDEOS_JSON_FETCHED_AT_KEY;
  window.GALLERY_POSTERS_CACHE_KEY = GALLERY_POSTERS_CACHE_KEY;
  window.GALLERY_POSTERS_CACHE_CHECKED_AT_KEY = GALLERY_POSTERS_CACHE_CHECKED_AT_KEY;
  window.GALLERY_POSTERS_CACHE_SIGNATURE_KEY = GALLERY_POSTERS_CACHE_SIGNATURE_KEY;
  window.FAVORITES_KEY = FAVORITES_KEY;
  window.CACHED_APPLIED_VIDEO_URL_KEY = CACHED_APPLIED_VIDEO_URL_KEY;
  window.CACHED_APPLIED_POSTER_URL_KEY = CACHED_APPLIED_POSTER_URL_KEY;
  window.CACHED_APPLIED_POSTER_DATA_URL_KEY = CACHED_APPLIED_POSTER_DATA_URL_KEY;
  window.CACHED_APPLIED_POSTER_CACHE_KEY = CACHED_APPLIED_POSTER_CACHE_KEY;

  window.WALLPAPER_POOL_KEY = WALLPAPER_POOL_KEY;
  window.WALLPAPER_SELECTION_KEY = WALLPAPER_SELECTION_KEY;
  window.WALLPAPER_FALLBACK_USED_KEY = WALLPAPER_FALLBACK_USED_KEY;
  window.DAILY_ROTATION_KEY = DAILY_ROTATION_KEY;
  window.PENDING_DAILY_ROTATION_KEY = PENDING_DAILY_ROTATION_KEY;
  window.PENDING_DAILY_ROTATION_SINCE_KEY = PENDING_DAILY_ROTATION_SINCE_KEY;
  window.WALLPAPER_STARTUP_STATE_KEY = WALLPAPER_STARTUP_STATE_KEY;
  window.WALLPAPER_TYPE_KEY = WALLPAPER_TYPE_KEY;
  window.WALLPAPER_QUALITY_KEY = WALLPAPER_QUALITY_KEY;

  window.WALLPAPER_CACHE_NAME = WALLPAPER_CACHE_NAME;
  window.GALLERY_POSTERS_CACHE_NAME = GALLERY_POSTERS_CACHE_NAME;
  window.POSTER_CACHE_CONCURRENCY = POSTER_CACHE_CONCURRENCY;
  window.USER_WALLPAPER_CACHE_PREFIX = USER_WALLPAPER_CACHE_PREFIX;
  window.REMOTE_VIDEO_REGEX = REMOTE_VIDEO_REGEX;
  window.isRemoteHttpUrl = isRemoteHttpUrl;
  window.isRemoteVideoUrl = isRemoteVideoUrl;
  window.wallpaperObjectUrlCache = wallpaperObjectUrlCache;

  window.normalizeWallpaperCacheKey = normalizeWallpaperCacheKey;
  window.getCacheKeyVariants = getCacheKeyVariants;
  window.openWallpaperAssetCache = openWallpaperAssetCache;
  window.openGalleryPostersCache = openGalleryPostersCache;
  window.cacheAsset = cacheAsset;
  window.getCachedObjectUrl = getCachedObjectUrl;
  window.deleteCachedObject = deleteCachedObject;
  window.pruneCachedVideos = pruneCachedVideos;
  window.getGalleryPosterUrls = getGalleryPosterUrls;
  window.getGalleryPosterCacheSignature = getGalleryPosterCacheSignature;
  window.cacheGalleryPosters = cacheGalleryPosters;
  window.resolvePosterBlob = resolvePosterBlob;
  window.clearWallpaperCache = clearWallpaperCache;

  window.getVideosManifestCache = getVideosManifestCache;
  window.setVideosManifestCache = setVideosManifestCache;
  window.clearVideosManifestCache = clearVideosManifestCache;

  window.getGalleryPostersCacheMetadata = getGalleryPostersCacheMetadata;
  window.setGalleryPostersCacheMetadata = setGalleryPostersCacheMetadata;
  window.getCachedGalleryPosters = getCachedGalleryPosters;
  window.setCachedGalleryPosters = setCachedGalleryPosters;

  window.getGalleryFavorites = getGalleryFavorites;
  window.setGalleryFavorites = setGalleryFavorites;

  window.getCachedAppliedVideoUrl = getCachedAppliedVideoUrl;
  window.setCachedAppliedVideoUrl = setCachedAppliedVideoUrl;
  window.clearCachedAppliedVideoUrl = clearCachedAppliedVideoUrl;

  window.getCachedAppliedPosterUrl = getCachedAppliedPosterUrl;
  window.setCachedAppliedPosterUrl = setCachedAppliedPosterUrl;
  window.clearCachedAppliedPosterUrl = clearCachedAppliedPosterUrl;

  window.getCachedAppliedPosterDataUrl = getCachedAppliedPosterDataUrl;
  window.setCachedAppliedPosterDataUrl = setCachedAppliedPosterDataUrl;
  window.clearCachedAppliedPosterDataUrl = clearCachedAppliedPosterDataUrl;
  window.clearAppliedPosterMetadata = clearAppliedPosterMetadata;

  window.getWallpaperPool = getWallpaperPool;
  window.setWallpaperPool = setWallpaperPool;
  window.clearWallpaperPool = clearWallpaperPool;

  window.getWallpaperSelection = getWallpaperSelection;
  window.setWallpaperSelection = setWallpaperSelection;
  window.clearWallpaperSelection = clearWallpaperSelection;

  window.getWallpaperFallbackUsedAt = getWallpaperFallbackUsedAt;
  window.setWallpaperFallbackUsedAt = setWallpaperFallbackUsedAt;
  window.setWallpaperSelectionWithFallback = setWallpaperSelectionWithFallback;

  window.getDailyWallpaperEnabled = getDailyWallpaperEnabled;
  window.setDailyWallpaperEnabled = setDailyWallpaperEnabled;

  window.getPendingDailyRotation = getPendingDailyRotation;
  window.setPendingDailyRotation = setPendingDailyRotation;
  window.clearPendingDailyRotation = clearPendingDailyRotation;

  window.getWallpaperRotationState = getWallpaperRotationState;
  window.syncWallpaperStartupState = syncWallpaperStartupState;
  window.getWallpaperStartupState = getWallpaperStartupState;

  window.getWallpaperTypePreferenceStorage = getWallpaperTypePreferenceStorage;
  window.setWallpaperTypePreferenceStorage = setWallpaperTypePreferenceStorage;

  window.getWallpaperQualityPreferenceStorage = getWallpaperQualityPreferenceStorage;
  window.setWallpaperQualityPreferenceStorage = setWallpaperQualityPreferenceStorage;

  window.HomebaseWallpaperStorage = {
    VIDEOS_JSON_CACHE_KEY,
    VIDEOS_JSON_FETCHED_AT_KEY,
    GALLERY_POSTERS_CACHE_KEY,
    GALLERY_POSTERS_CACHE_CHECKED_AT_KEY,
    GALLERY_POSTERS_CACHE_SIGNATURE_KEY,
    FAVORITES_KEY,
    CACHED_APPLIED_VIDEO_URL_KEY,
    CACHED_APPLIED_POSTER_URL_KEY,
    CACHED_APPLIED_POSTER_DATA_URL_KEY,
    CACHED_APPLIED_POSTER_CACHE_KEY,
    WALLPAPER_POOL_KEY,
    WALLPAPER_SELECTION_KEY,
    WALLPAPER_FALLBACK_USED_KEY,
    DAILY_ROTATION_KEY,
    PENDING_DAILY_ROTATION_KEY,
    PENDING_DAILY_ROTATION_SINCE_KEY,
    WALLPAPER_STARTUP_STATE_KEY,
    WALLPAPER_TYPE_KEY,
    WALLPAPER_QUALITY_KEY,
    WALLPAPER_CACHE_NAME,
    GALLERY_POSTERS_CACHE_NAME,
    POSTER_CACHE_CONCURRENCY,
    USER_WALLPAPER_CACHE_PREFIX,
    REMOTE_VIDEO_REGEX,
    isRemoteHttpUrl,
    isRemoteVideoUrl,
    wallpaperObjectUrlCache,
    normalizeWallpaperCacheKey,
    getCacheKeyVariants,
    openWallpaperAssetCache,
    openGalleryPostersCache,
    cacheAsset,
    getCachedObjectUrl,
    deleteCachedObject,
    pruneCachedVideos,
    getGalleryPosterUrls,
    getGalleryPosterCacheSignature,
    cacheGalleryPosters,
    resolvePosterBlob,
    clearWallpaperCache,
    getVideosManifestCache,
    setVideosManifestCache,
    clearVideosManifestCache,
    getGalleryPostersCacheMetadata,
    setGalleryPostersCacheMetadata,
    getCachedGalleryPosters,
    setCachedGalleryPosters,
    getGalleryFavorites,
    setGalleryFavorites,
    getCachedAppliedVideoUrl,
    setCachedAppliedVideoUrl,
    clearCachedAppliedVideoUrl,
    getCachedAppliedPosterUrl,
    setCachedAppliedPosterUrl,
    clearCachedAppliedPosterUrl,
    getCachedAppliedPosterDataUrl,
    setCachedAppliedPosterDataUrl,
    clearCachedAppliedPosterDataUrl,
    clearAppliedPosterMetadata,
    getWallpaperPool,
    setWallpaperPool,
    clearWallpaperPool,
    getWallpaperSelection,
    setWallpaperSelection,
    clearWallpaperSelection,
    getWallpaperFallbackUsedAt,
    setWallpaperFallbackUsedAt,
    setWallpaperSelectionWithFallback,
    getDailyWallpaperEnabled,
    setDailyWallpaperEnabled,
    getPendingDailyRotation,
    setPendingDailyRotation,
    clearPendingDailyRotation,
    getWallpaperRotationState,
    syncWallpaperStartupState,
    getWallpaperStartupState,
    getWallpaperTypePreferenceStorage,
    setWallpaperTypePreferenceStorage,
    getWallpaperQualityPreferenceStorage,
    setWallpaperQualityPreferenceStorage
  };
}
