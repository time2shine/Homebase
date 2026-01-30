window.GalleryUI = (() => {
  let initialized = false;
  let myWallpapersInstance = null;

  function ensureMyWallpapers() {
    if (myWallpapersInstance) return myWallpapersInstance;
    if (typeof MyWallpapers !== 'undefined' && MyWallpapers) {
      myWallpapersInstance = MyWallpapers;
      return myWallpapersInstance;
    }
    myWallpapersInstance = (() => {
      const MY_WALLPAPERS_KEY = 'myWallpapers';
      const MY_WALLPAPER_CACHE = 'user-wallpapers-v1';
      const MW_MAX_IMAGE_MB = 12;
      const MW_MAX_DIM = 3840;
      const MW_OPTIMIZE_TRIGGER_MB = 3;
      const MW_WEBP_QUALITY = 0.85;
      const MAX_ITEMS = 75;
      const MAX_IMAGE_BYTES = MW_MAX_IMAGE_MB * 1024 * 1024;
      const MAX_GIF_BYTES = 25 * 1024 * 1024;
      const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
      const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
      const BATCH_SIZE = MY_WALLPAPERS_BATCH_SIZE || 24;
      const PLACEHOLDER_POSTER = 'assets/fallback.webp';
    
      const state = {
        list: [],
        renderQueue: [],
        renderIndex: 0,
        renderVersion: 0,
        initialized: false,
        loadMoreObserver: null,
        mediaObserver: null
      };
    
      const posterObjectUrls = new Map(); // cacheKey -> object URL (shared)
      const cardObjectUrls = new Map(); // id -> { posterUrl, videoUrl }
      const livePreviewVideos = new Set(); // Set<HTMLVideoElement> currently hydrated
    
      const formatBytes = (bytes) => `${Math.round(bytes / (1024 * 1024))}MB`;
    
      const normalizeCacheKey = (key = '') => normalizeWallpaperCacheKey(key);
    
      const cacheKeyVariants = (key) => getCacheKeyVariants(key);
    
      const sanitizeCacheName = (name = '') => {
        const safe = (name || '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-150);
        return safe || 'upload';
      };
    
      const buildImageCacheKey = (fileName = '') => {
        const safeName = sanitizeCacheName(fileName || 'wallpaper');
        return `mw_img_${Date.now()}_${safeName}`;
      };
    
      const getImageDimensionsFromFile = async (file) => {
        if (!file) return { width: 0, height: 0 };
        try {
          if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(file);
            const dims = { width: bitmap.width || 0, height: bitmap.height || 0 };
            if (typeof bitmap.close === 'function') bitmap.close();
            return dims;
          }
        } catch (err) {
          // fallback to Image decoding below
        }
    
        return new Promise((resolve) => {
          try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve({ width: 0, height: 0 });
            };
            img.src = url;
          } catch (err) {
            resolve({ width: 0, height: 0 });
          }
        });
      };
    
      const optimizeImageFile = async (file) => {
        let bitmap = null;
        let img = null;
        let objectUrl = '';
    
        try {
          if (typeof createImageBitmap === 'function') {
            bitmap = await createImageBitmap(file);
          }
        } catch (err) {
          bitmap = null;
        }
    
        if (!bitmap) {
          try {
            objectUrl = URL.createObjectURL(file);
            img = await new Promise((resolve) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = () => resolve(null);
              el.src = objectUrl;
            });
          } catch (err) {
            img = null;
          }
        }
    
        const sourceWidth = bitmap?.width || img?.naturalWidth || img?.width || 0;
        const sourceHeight = bitmap?.height || img?.naturalHeight || img?.height || 0;
    
        if (!sourceWidth || !sourceHeight) {
          if (bitmap?.close) bitmap.close();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return { blob: file, mimeType: file.type || 'image/webp', width: 0, height: 0 };
        }
    
        const scale = Math.min(1, MW_MAX_DIM / Math.max(sourceWidth, sourceHeight));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    
        const canvas = (typeof OffscreenCanvas !== 'undefined')
          ? new OffscreenCanvas(targetWidth, targetHeight)
          : document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
    
        if (!ctx) {
          if (bitmap?.close) bitmap.close();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return { blob: file, mimeType: file.type || 'image/webp', width: sourceWidth, height: sourceHeight };
        }
    
        ctx.drawImage(bitmap || img, 0, 0, targetWidth, targetHeight);
    
        let blob = null;
        let mimeType = file?.type || 'image/webp';
    
        if (canvas.convertToBlob) {
          try {
            blob = await canvas.convertToBlob({ type: 'image/webp', quality: MW_WEBP_QUALITY });
          } catch (err) {
            blob = null;
          }
        }
    
        if (!blob) {
          try {
            let exportCanvas = canvas;
            if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
              const transfer = document.createElement('canvas');
              transfer.width = targetWidth;
              transfer.height = targetHeight;
              const transferCtx = transfer.getContext('2d');
              if (transferCtx) {
                transferCtx.drawImage(canvas, 0, 0);
                exportCanvas = transfer;
              }
            }
            const dataUrl = exportCanvas?.toDataURL ? exportCanvas.toDataURL('image/jpeg', MW_WEBP_QUALITY) : '';
            if (dataUrl) {
              blob = dataUrlToBlob(dataUrl);
              mimeType = 'image/jpeg';
            }
          } catch (err) {
            blob = null;
          }
        } else {
          mimeType = blob.type || mimeType;
        }
    
        if (bitmap?.close) bitmap.close();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    
        return {
          blob: blob || file,
          mimeType: blob?.type || mimeType || file.type || 'image/webp',
          width: targetWidth,
          height: targetHeight
        };
      };
    
      const getList = () => (Array.isArray(state.list) ? state.list.slice() : []);
    
      const hasItems = () => (state.list || []).length > 0;
    
      const getCacheName = () => MY_WALLPAPER_CACHE;
    
      const makeId = () => `mywallpaper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
      const currentUsage = (list = state.list) => {
        return (list || []).reduce((sum, item) => {
          return sum + (Number(item.size) || 0) + (Number(item.posterSize) || 0);
        }, 0);
      };
    
      const estimateQuota = async () => {
        const fallbackLimit = MAX_TOTAL_BYTES;
        let usage = 0;
        let quota = 0;
        try {
          if (navigator?.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            usage = Number(estimate?.usage) || 0;
            quota = Number(estimate?.quota) || 0;
          }
        } catch (err) {
          usage = 0;
          quota = 0;
        }
        const quotaCap = quota ? quota * 0.2 : fallbackLimit;
        const limitBytes = Math.min(fallbackLimit, quotaCap || fallbackLimit);
        return { usage, quota, limitBytes };
      };
    
      const normalizeList = (items = []) => {
        const seen = new Set();
        return (Array.isArray(items) ? items : [])
          .map((item) => {
            if (!item || !item.id || seen.has(item.id)) return null;
            seen.add(item.id);
            const type = item.type === 'video' ? 'video' : 'image';
            const cacheKey = normalizeCacheKey(item.cacheKey || item.videoCacheKey || item.imageCacheKey || '');
            const posterCacheKey = normalizeCacheKey(item.posterCacheKey || '');
            return {
              id: item.id,
              title: item.title || 'My Wallpaper',
              type,
              mimeType: item.mimeType || '',
              cacheKey,
              posterCacheKey,
              size: Number(item.size) || 0,
              posterSize: Number(item.posterSize) || 0,
              createdAt: item.createdAt || item.selectedAt || Date.now(),
              lastUsedAt: item.lastUsedAt || item.createdAt || 0,
              originalName: item.originalName || ''
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      };
    
      const loadList = async () => {
        try {
          const stored = await browser.storage.local.get(MY_WALLPAPERS_KEY);
          const storedItems = Array.isArray(stored[MY_WALLPAPERS_KEY]) ? stored[MY_WALLPAPERS_KEY] : [];
          return normalizeList(storedItems);
        } catch (err) {
          return [];
        }
      };
    
      const saveList = async (list) => {
        try {
          await browser.storage.local.set({ [MY_WALLPAPERS_KEY]: list });
        } catch (err) {
          console.warn('Failed to save My Wallpapers', err);
        }
      };
    
      const ensureInitialized = async () => {
        if (state.initialized) return state.list;
        state.list = await loadList();
        state.initialized = true;
        return state.list;
      };
    
      const mimeFromFile = (file) => {
        if (!file) return '';
        if (file.type && file.type !== 'application/octet-stream') return file.type;
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.mp4')) return 'video/mp4';
        if (name.endsWith('.webm')) return 'video/webm';
        if (name.endsWith('.mov')) return 'video/quicktime';
        if (name.endsWith('.m4v')) return 'video/mp4';
        if (name.endsWith('.gif')) return 'image/gif';
        if (name.endsWith('.png')) return 'image/png';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
        if (name.endsWith('.webp')) return 'image/webp';
        return 'application/octet-stream';
      };
    
      const detectType = (file) => {
        const mimeType = (mimeFromFile(file) || '').toLowerCase();
        const name = (file?.name || '').toLowerCase();
        const isGif = mimeType === 'image/gif' || name.endsWith('.gif');
        const isVideo = (!isGif && mimeType.startsWith('video/')) || /\.(mp4|webm|mov|m4v)$/i.test(name);
        const isImage = !isVideo && (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name));
        const title = (file?.name || 'My wallpaper').replace(/\.[^/.]+$/, '');
        return { mimeType: mimeType || 'application/octet-stream', isVideo, isGif, isImage, title };
      };
    
      const validateUpload = async (file, expectedType = 'any') => {
        await ensureInitialized();
        if (!file) {
          return { ok: false, message: 'Please select a file to upload.' };
        }
    
        const meta = detectType(file);
        if (!meta.isVideo && !meta.isImage) {
          return { ok: false, message: 'Unsupported file type. Please upload an image or video.' };
        }
    
        if (expectedType === 'video' && !meta.isVideo && !meta.isGif) {
          return { ok: false, message: 'Please select a live wallpaper file (.mp4 or .gif).' };
        }
    
        if (expectedType === 'image' && meta.isVideo && !meta.isGif) {
          return { ok: false, message: 'Please select an image file (.png, .jpg, .jpeg, .webp).' };
        }
    
        const perLimit = meta.isVideo && !meta.isGif ? MAX_VIDEO_BYTES : (meta.isGif ? MAX_GIF_BYTES : MAX_IMAGE_BYTES);
        if ((file.size || 0) > perLimit) {
          return { ok: false, message: `File is too large. Limit is ${formatBytes(perLimit)}.` };
        }
    
        if (state.list.length >= MAX_ITEMS) {
          return { ok: false, message: `You can keep up to ${MAX_ITEMS} wallpapers. Remove one to add another.` };
        }
    
        const { limitBytes } = await estimateQuota();
        if (limitBytes && currentUsage() + (file.size || 0) > limitBytes) {
          return { ok: false, message: 'Not enough space to store this wallpaper. Remove older items and try again.' };
        }
    
        return { ok: true, ...meta, mimeType: meta.mimeType };
      };
    
      const mimeToExtension = (mime = '') => {
        if (mime.includes('mp4')) return 'mp4';
        if (mime.includes('webm')) return 'webm';
        if (mime.includes('quicktime')) return 'mov';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('png')) return 'png';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('webp')) return 'webp';
        return '';
      };
    
      const buildCacheKey = (id, part, mimeType = '', name = '') => {
        const ext = mimeToExtension(mimeType) || (name.includes('.') ? name.split('.').pop() : '');
        const suffix = ext ? `.${ext}` : '';
        return normalizeCacheKey(`my/${encodeURIComponent(id)}/${part}${suffix}`);
      };
    
      const revokeObjectUrl = (key) => {
        if (!key) return;
        const url = posterObjectUrls.get(key);
        if (!url) return;
        posterObjectUrls.forEach((cachedUrl, cachedKey) => {
          if (cachedUrl === url || cachedKey === key) {
            posterObjectUrls.delete(cachedKey);
          }
        });
        URL.revokeObjectURL(url);
      };
    
      const cachePut = async (key, blob, mime = '') => {
        const normalized = normalizeCacheKey(key);
        try {
          const cache = await caches.open(MY_WALLPAPER_CACHE);
          await cache.put(normalized, new Response(blob, { headers: { 'content-type': mime || blob?.type || 'application/octet-stream' } }));
          return normalized;
        } catch (err) {
          console.warn('Failed to cache My Wallpaper asset', key, err);
          return normalized;
        }
      };
    
      const cacheGetObjectUrl = async (cacheKey, options = {}) => {
        const { fresh = false } = options;
        const keys = cacheKeyVariants(cacheKey);
        if (!keys.length) return null;
    
        if (!fresh) {
          for (const key of keys) {
            if (posterObjectUrls.has(key)) {
              return posterObjectUrls.get(key);
            }
          }
        }
    
        try {
          const cache = await caches.open(MY_WALLPAPER_CACHE);
          for (const key of keys) {
            const match = await cache.match(key);
            if (!match) continue;
            const blob = await match.blob();
            const url = URL.createObjectURL(blob);
            if (!fresh) keys.forEach((k) => posterObjectUrls.set(k, url));
            return url;
          }
        } catch (err) {
          console.warn('Failed to read My Wallpaper cache', cacheKey, err);
        }
    
        try {
          const legacyCache = await caches.open(WALLPAPER_CACHE_NAME);
          for (const key of keys) {
            const match = await legacyCache.match(key);
            if (!match) continue;
            const blob = await match.blob();
            const url = URL.createObjectURL(blob);
            if (!fresh) keys.forEach((k) => posterObjectUrls.set(k, url));
            return url;
          }
        } catch (err) {
          // ignore legacy cache read failures
        }
    
        return null;
      };
    
      const cacheDelete = async (cacheKey) => {
        const keys = cacheKeyVariants(cacheKey);
        if (!keys.length) return;
        let cache = null;
        let legacyCache = null;
        try {
          cache = await caches.open(MY_WALLPAPER_CACHE);
        } catch (err) {
          cache = null;
        }
        try {
          legacyCache = await caches.open(WALLPAPER_CACHE_NAME);
        } catch (err) {
          legacyCache = null;
        }
        keys.forEach((key) => {
          if (cache) cache.delete(key).catch(() => {});
          if (legacyCache && key.startsWith(USER_WALLPAPER_CACHE_PREFIX)) {
            legacyCache.delete(key).catch(() => {});
          }
          revokeObjectUrl(key);
        });
      };
    
      const dataUrlToBlob = (dataUrl = '') => {
        if (!dataUrl) return null;
        const parts = dataUrl.split(',');
        if (parts.length < 2) return null;
        const mimeMatch = parts[0].match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const binary = atob(parts[1]);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
      };
    
      // Utility: convert a File/Blob to data URL so static applies can bypass data->blob guard
      const fileToDataURL = (file) => new Promise((resolve) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        } catch (err) {
          resolve('');
        }
      });
    
      const generateImagePoster = (file) => {
        return new Promise((resolve) => {
          try {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              const maxDim = 512;
              const ratio = Math.min(maxDim / (img.width || 1), maxDim / (img.height || 1), 1);
              const width = Math.max(1, Math.round((img.width || 1) * ratio));
              const height = Math.max(1, Math.round((img.height || 1) * ratio));
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                URL.revokeObjectURL(objectUrl);
                resolve(blob || null);
              }, 'image/webp', 0.9);
            };
            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              resolve(null);
            };
            img.src = objectUrl;
          } catch (err) {
            console.warn('Failed to generate image poster', err);
            resolve(null);
          }
        });
      };
    
      const generateVideoPoster = async (file) => {
        try {
          const dataUrl = await buildVideoPosterFromFile(file);
          if (!dataUrl) return null;
          return dataUrlToBlob(dataUrl);
        } catch (err) {
          console.warn('Failed to generate video poster', err);
          return null;
        }
      };
    
      const maybeEvictForSpace = async (bytesNeeded) => {
        const { limitBytes } = await estimateQuota();
        let total = currentUsage();
        if (!limitBytes || total + bytesNeeded <= limitBytes) return true;
    
        let activeId = null;
        try {
          const stored = await browser.storage.local.get(WALLPAPER_SELECTION_KEY);
          activeId = (currentWallpaperSelection || stored[WALLPAPER_SELECTION_KEY] || {}).id || null;
        } catch (err) {
          activeId = null;
        }
    
        const sorted = getList().sort((a, b) => (a.lastUsedAt || a.createdAt || 0) - (b.lastUsedAt || b.createdAt || 0));
        let changed = false;
        for (const item of sorted) {
          if (item.id === activeId) continue;
          await cacheDelete(item.cacheKey);
          if (item.posterCacheKey) await cacheDelete(item.posterCacheKey);
          state.list = state.list.filter((mw) => mw.id !== item.id);
          total = currentUsage();
          changed = true;
          if (total + bytesNeeded <= limitBytes) break;
        }
    
        if (changed) {
          await saveList(state.list);
          render();
        }
    
        return total + bytesNeeded <= limitBytes;
      };
    
      const rememberCardUrls = (id, urls = {}) => {
        if (!id) return;
        const current = cardObjectUrls.get(id) || {};
        cardObjectUrls.set(id, { ...current, ...urls });
      };
    
      const releaseCardUrls = (id) => {
        if (!id) return;
        const entry = cardObjectUrls.get(id);
        if (entry) {
          if (entry.posterUrl) {
            try { URL.revokeObjectURL(entry.posterUrl); } catch (err) {}
          }
          if (entry.videoUrl) {
            try { URL.revokeObjectURL(entry.videoUrl); } catch (err) {}
          }
        }
        cardObjectUrls.delete(id);
      };
    
      const resetCardMediaState = () => {
        livePreviewVideos.forEach((video) => {
          pausePreviewVideo(video, { unload: true });
        });
        livePreviewVideos.clear();
        cardObjectUrls.forEach((entry) => {
          if (entry.posterUrl) {
            try { URL.revokeObjectURL(entry.posterUrl); } catch (err) {}
          }
          if (entry.videoUrl) {
            try { URL.revokeObjectURL(entry.videoUrl); } catch (err) {}
          }
        });
        cardObjectUrls.clear();
      };
    
      const pausePreviewVideo = (video, opts = {}) => {
        const { unload = false, keepVisible = false, keepTracked = false } = opts;
        if (!video) return;
        try { video.pause(); } catch (err) {}
        if (!keepVisible) video.classList.remove('is-playing');
        if (!keepTracked) livePreviewVideos.delete(video);
        if (unload) {
          video.removeAttribute('src');
          video.load();
        }
      };
    
      const teardownCardMedia = (media, itemId) => {
        if (!media) return;
        media.dataset.mediaLoaded = 'false';
        media.dataset.intersecting = 'false';
        const blur = media.querySelector('.mw-preview-blur');
        const img = media.querySelector('.mw-preview-media');
        const video = media.querySelector('.mw-live-preview');
        if (blur) blur.style.backgroundImage = `url("${PLACEHOLDER_POSTER}")`;
        if (img) img.removeAttribute('src');
        if (video) {
          video.dataset.mwPending = 'false';
          video.dataset.intersecting = 'false';
          video.poster = PLACEHOLDER_POSTER;
          pausePreviewVideo(video, { unload: true });
        }
        releaseCardUrls(itemId);
      };
    
      const hydrateCardMedia = async (media, item, version) => {
        if (!media || !item || version !== state.renderVersion) return;
        media.dataset.intersecting = 'true';
        const blur = media.querySelector('.mw-preview-blur');
        const img = media.querySelector('.mw-preview-media');
        const video = media.querySelector('.mw-live-preview');
        const isGif = (item.mimeType || '').toLowerCase().includes('gif');
        const isLive = item.type === 'video' || isGif;
        const existingRecord = cardObjectUrls.get(item.id) || {};
    
        const posterKey = item.posterCacheKey || item.cacheKey || '';
        let posterUrl = existingRecord.posterUrl || '';
        const posterFromRecord = Boolean(posterUrl);
        if (!posterUrl && posterKey) {
          try {
            posterUrl = await cacheGetObjectUrl(posterKey, { fresh: true });
          } catch (err) {
            posterUrl = '';
          }
        }
    
        if (version !== state.renderVersion || !media.isConnected) {
          if (!posterFromRecord && posterUrl) URL.revokeObjectURL(posterUrl);
          return;
        }
    
        if (posterUrl) {
          if (blur) blur.style.backgroundImage = `url("${posterUrl}")`;
          if (img) img.src = posterUrl;
        } else {
          if (blur) blur.style.backgroundImage = `url("${PLACEHOLDER_POSTER}")`;
          if (img) img.removeAttribute('src');
        }
        media.dataset.mediaLoaded = 'true';
    
        const record = { ...existingRecord };
        if (posterUrl) record.posterUrl = posterUrl;
    
        if (isGif) {
          if (video) {
            video.dataset.mwPending = 'false';
            video.dataset.intersecting = 'true';
            pausePreviewVideo(video, { unload: true });
          }
          if (document.visibilityState === 'visible') {
            const gifKey = item.cacheKey || '';
            let gifUrl = record.videoUrl || '';
            const gifFromRecord = Boolean(gifUrl);
            if (!gifUrl && gifKey) {
              try {
                gifUrl = await cacheGetObjectUrl(gifKey, { fresh: true });
              } catch (err) {
                gifUrl = '';
              }
            }
            if (version === state.renderVersion && media.isConnected) {
              if (gifUrl && img) {
                img.src = gifUrl;
                record.videoUrl = gifUrl;
              }
            } else if (!gifFromRecord && gifUrl) {
              URL.revokeObjectURL(gifUrl);
            }
          }
          rememberCardUrls(item.id, record);
          return;
        }
    
        if (!video) {
          rememberCardUrls(item.id, record);
          return;
        }
    
        video.dataset.intersecting = 'true';
        video.poster = posterUrl || PLACEHOLDER_POSTER;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
    
        if (!isLive) {
          video.dataset.mwPending = 'false';
          pausePreviewVideo(video, { unload: true });
          rememberCardUrls(item.id, record);
          return;
        }
    
        if (document.visibilityState === 'hidden') {
          video.dataset.mwPending = 'true';
          rememberCardUrls(item.id, record);
          return;
        }
    
        const videoKey = item.fileCacheKey || item.cacheKey || item.videoCacheKey || '';
        let videoUrl = record.videoUrl || '';
        const videoFromRecord = Boolean(videoUrl);
        if (!videoUrl && videoKey) {
          try {
            videoUrl = await cacheGetObjectUrl(videoKey, { fresh: true });
          } catch (err) {
            videoUrl = '';
          }
        }
    
        if (version !== state.renderVersion || !media.isConnected) {
          if (!videoFromRecord && videoUrl) URL.revokeObjectURL(videoUrl);
          return;
        }
    
        if (videoUrl) {
          record.videoUrl = videoUrl;
          if (!videoFromRecord || video.src !== videoUrl) {
            video.src = videoUrl;
          }
          video.dataset.mwPending = 'false';
          const markPlaying = () => {
            video.classList.add('is-playing');
          };
          video.addEventListener('canplay', markPlaying, { once: true });
          livePreviewVideos.add(video);
          video.play().then(() => {
            video.classList.add('is-playing');
          }).catch(() => {});
        } else {
          video.dataset.mwPending = 'false';
        }
    
        rememberCardUrls(item.id, record);
      };
    
      const resumeVisiblePreviews = () => {
        if (document.visibilityState !== 'visible') return;
        const stale = [];
        livePreviewVideos.forEach((video) => {
          if (!video || !video.isConnected) {
            stale.push(video);
            return;
          }
          if (video.dataset.intersecting === 'true' && video.src) {
            video.play().then(() => {
              video.classList.add('is-playing');
            }).catch(() => {});
          }
        });
        stale.forEach((video) => livePreviewVideos.delete(video));
      };
    
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          livePreviewVideos.forEach((video) => pausePreviewVideo(video, { keepVisible: true, keepTracked: true }));
          return;
        }
        if (myWallpapersGrid) {
          const pendingVideos = myWallpapersGrid.querySelectorAll('.mw-live-preview[data-mw-pending="true"]');
          pendingVideos.forEach((video) => {
            const media = video.closest('.mw-preview');
            const itemId = media?.dataset?.wallpaperId || video.closest('.mw-card')?.dataset?.id;
            if (!itemId || !media || media.dataset.intersecting !== 'true') return;
            const item = state.list.find((mw) => mw.id === itemId);
            if (item) {
              hydrateCardMedia(media, item, state.renderVersion);
            }
          });
        }
        resumeVisiblePreviews();
      };
    
      document.addEventListener('visibilitychange', handleVisibilityChange);
    
      const getMediaObserver = () => {
        if (state.mediaObserver) return state.mediaObserver;
        if (!myWallpapersGrid) return null;
        state.mediaObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const media = entry.target;
            const itemId = media?.dataset?.wallpaperId || media?.closest('.mw-card')?.dataset?.id;
            if (!itemId) return;
            const item = state.list.find((mw) => mw.id === itemId);
            if (!item) return;
            if (entry.isIntersecting) {
              hydrateCardMedia(media, item, state.renderVersion);
            } else {
              teardownCardMedia(media, itemId);
            }
          });
        }, { root: myWallpapersGrid, rootMargin: '250px' });
        return state.mediaObserver;
      };
    
      const getLoadMoreObserver = () => {
        if (state.loadMoreObserver) return state.loadMoreObserver;
        if (!myWallpapersGrid) return null;
        state.loadMoreObserver = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry && entry.isIntersecting) {
            renderNextBatch();
          }
        }, { root: myWallpapersGrid, rootMargin: '400px' });
        return state.loadMoreObserver;
      };
    
      const renderCard = (item) => {
        const card = document.createElement('div');
        card.className = 'mw-card';
        card.dataset.id = item.id;
        const isGif = (item.mimeType || '').toLowerCase().includes('gif');
        const isVideo = item.type === 'video';
        const isLive = isVideo || isGif;
        card.dataset.kind = isLive ? 'live' : 'static';
        card.dataset.type = item.type || '';
    
        const titleText = item.title || 'Wallpaper';
        const needsMarquee = titleText.length > 20;
        const marqueeDuration = 6;
        const binTopIcon = useSvgIcon('binTop');
        const binBottomIcon = useSvgIcon('binBottom');
        const binGarbageIcon = useSvgIcon('binGarbage');
    
        card.innerHTML = `
          <button type="button" class="mw-card-remove bin-button" aria-label="Delete">
            ${binTopIcon}
            ${binBottomIcon}
            ${binGarbageIcon}
          </button>
          <div class="mw-card-media">
            <div class="mw-preview" data-wallpaper-id="${item.id}" data-kind="${isLive ? 'live' : 'static'}" data-media-loaded="false">
              <div class="mw-preview-blur" style="background-image:url('${PLACEHOLDER_POSTER}')"></div>
              <img class="mw-preview-media" alt="${titleText}" loading="lazy">
              ${isLive ? '<video class="mw-preview-media mw-live-preview" muted loop playsinline preload="metadata" data-mw-pending="false"></video>' : ''}
            </div>
          </div>
          <div class="mw-card-body">
            <div class="mw-card-text">
              <p class="mw-card-title ${needsMarquee ? 'mw-marquee' : ''}" ${needsMarquee ? `style="--mw-marquee-duration:${marqueeDuration}s"` : ''}><span>${titleText}</span></p>
              <p class="mw-card-meta">${isLive ? 'Live upload' : 'Static upload'}</p>
            </div>
            <button type="button" class="mw-card-btn apply-button" data-id="${item.id}">
              Apply
            </button>
          </div>
        `;
    
        return card;
      };
    
      const renderNextBatch = () => {
        if (!myWallpapersGrid) return;
        if (state.renderIndex >= state.renderQueue.length) {
          if (state.loadMoreObserver) {
            state.loadMoreObserver.disconnect();
          }
          return;
        }
    
        const batch = state.renderQueue.slice(state.renderIndex, state.renderIndex + BATCH_SIZE);
        const fragment = document.createDocumentFragment();
        const mediaObserver = getMediaObserver();
    
        batch.forEach((item) => {
          const card = renderCard(item);
          const media = card.querySelector('.mw-preview');
          if (mediaObserver && media) {
            mediaObserver.observe(media);
          }
          fragment.appendChild(card);
        });
    
        const sentinel = document.getElementById('mw-sentinel');
        if (sentinel) {
          myWallpapersGrid.insertBefore(fragment, sentinel);
        } else {
          myWallpapersGrid.appendChild(fragment);
        }
    
        state.renderIndex += batch.length;
    
        if (state.renderIndex >= state.renderQueue.length && state.loadMoreObserver) {
          state.loadMoreObserver.disconnect();
        }
      };
    
      const render = () => {
        if (!myWallpapersGrid) return;
    
        if (!state.initialized) {
          ensureInitialized().then(render).catch(() => {});
          return;
        }
    
        state.renderVersion += 1;
        if (state.mediaObserver) state.mediaObserver.disconnect();
        if (state.loadMoreObserver) state.loadMoreObserver.disconnect();
    
        resetCardMediaState();
        posterObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        posterObjectUrls.clear();
    
        myWallpapersGrid.innerHTML = '';
        state.renderQueue = getList();
        state.renderIndex = 0;
    
        const hasListItems = state.renderQueue.length > 0;
        myWallpapersGrid.classList.toggle('hidden', !hasListItems);
        if (myWallpapersEmptyCard) {
          myWallpapersEmptyCard.classList.toggle('hidden', hasListItems);
        }
    
        if (!hasListItems) return;
    
        renderNextBatch();
    
        const sentinel = document.createElement('div');
        sentinel.id = 'mw-sentinel';
        sentinel.style.height = '1px';
        sentinel.style.width = '100%';
        myWallpapersGrid.appendChild(sentinel);
    
        const loadObserver = getLoadMoreObserver();
        if (loadObserver) loadObserver.observe(sentinel);
      };
    
      const addUpload = async (file, expectedType = 'any') => {
        // 1. Validate File Type
        const validation = await validateUpload(file, expectedType);
        if (!validation.ok) {
          showCustomDialog('Invalid File', validation.message);
          return null;
        }
    
        let { isVideo, isGif, mimeType, title } = validation;
        const isStaticImage = !isVideo && !isGif;
        const MAX_IMAGE_BYTES = MW_MAX_IMAGE_MB * 1024 * 1024;
        const OPT_TRIGGER_BYTES = MW_OPTIMIZE_TRIGGER_MB * 1024 * 1024;
    
        // 2. Check Count Limits (10 Videos, 20 Images)
        // Note: We filter existing items in state.list to count them
        const currentVideos = state.list.filter(item => item.type === 'video').length;
        const currentImages = state.list.filter(item => item.type === 'image').length;
    
        if (isVideo && currentVideos >= 10) {
          showCustomDialog(
            'Video Limit Reached', 
            `You have reached the limit of 10 videos.\n\nTo keep your browser fast, please delete some older videos before uploading a new one.`
          );
          return null;
        }
    
        if ((!isVideo || isGif) && currentImages >= 20) {
          showCustomDialog(
            'Image Limit Reached', 
            `You have reached the limit of 20 images.\n\nPlease delete some older wallpapers before uploading a new one.`
          );
          return null;
        }
    
        // 3. Check Size Limit (100MB for Videos)
        if (isVideo && file.size > 100 * 1024 * 1024) {
          showCustomDialog(
            'File Too Large', 
            `This video is ${(file.size / (1024 * 1024)).toFixed(1)}MB.\n\nThe limit is 100MB to ensure smooth performance. Please compress the video or trim it.`
          );
          return null;
        }
    
        if (isStaticImage && (file.size || 0) > MAX_IMAGE_BYTES) {
          showCustomDialog('File Too Large', `Image too large. Max ${MW_MAX_IMAGE_MB}MB.`);
          if (myWallpapersUploadInput) myWallpapersUploadInput.value = '';
          return null;
        }
    
        const startOptimizingState = () => {
          if (!myWallpapersUploadBtn && !myWallpapersUploadInput) return () => {};
          const btn = myWallpapersUploadBtn;
          const input = myWallpapersUploadInput;
          if (btn) {
            if (!btn.dataset.originalLabel) {
              btn.dataset.originalLabel = btn.textContent || 'Upload';
            }
            btn.textContent = 'Optimizing...';
            btn.disabled = true;
          }
          if (input) input.disabled = true;
          return () => {
            if (btn) {
              btn.textContent = btn.dataset.originalLabel || 'Upload';
              btn.disabled = false;
              delete btn.dataset.originalLabel;
            }
            if (input) input.disabled = false;
          };
        };
    
        // ... Proceed with optimization and saving (keep existing logic below) ...
        let fileToSave = file;
        let imageDimensions = { width: 0, height: 0 };
        let needsOptimization = false;
        let usedOptimizedOutput = false;
    
        if (isStaticImage) {
          imageDimensions = await getImageDimensionsFromFile(file);
          const maxDim = Math.max(imageDimensions.width || 0, imageDimensions.height || 0);
          needsOptimization = maxDim > MW_MAX_DIM || (file.size || 0) > OPT_TRIGGER_BYTES;
          if (needsOptimization) {
            const restoreUploadState = startOptimizingState();
            try {
              const optimized = await optimizeImageFile(file);
              if (optimized?.blob) {
                fileToSave = optimized.blob;
                mimeType = optimized.mimeType || optimized.blob.type || mimeType;
                imageDimensions = {
                  width: optimized.width || imageDimensions.width,
                  height: optimized.height || imageDimensions.height
                };
                usedOptimizedOutput = true;
              }
            } catch (e) {
              console.warn('Optimization failed', e);
            } finally {
              restoreUploadState();
            }
          }
        }
    
        // [Existing Save Logic]
        const posterBlob = (isVideo && !isGif) ? await generateVideoPoster(fileToSave) : await generateImagePoster(fileToSave);
        const posterSize = posterBlob?.size || 0;
        const totalBytes = (fileToSave.size || 0) + posterSize;
    
        const hasRoom = await maybeEvictForSpace(totalBytes);
        if (!hasRoom) {
          showCustomDialog('Storage Full', 'Not enough space to store this wallpaper. Please remove older items.');
          return null;
        }
    
        const id = makeId();
        const baseImageCacheKey = isStaticImage ? buildImageCacheKey(file.name || '') : '';
        const baseCacheKey = isStaticImage ? baseImageCacheKey : buildCacheKey(id, 'original', mimeType, file.name || '');
        const cacheKeyToWrite = (isStaticImage && usedOptimizedOutput) ? `${baseCacheKey}__opt` : baseCacheKey;
        const posterCacheKey = posterBlob
          ? (isStaticImage ? `${baseCacheKey}__poster` : buildCacheKey(id, 'poster', posterBlob.type || 'image/webp'))
          : '';
    
        const normalizedCacheKey = await cachePut(cacheKeyToWrite, fileToSave, mimeType);
        
        let normalizedPosterKey = '';
        if (posterBlob) {
          normalizedPosterKey = await cachePut(posterCacheKey, posterBlob, posterBlob.type || 'image/webp');
        }
    
        const item = {
          id,
          title,
          type: isVideo ? 'video' : 'image',
          mimeType,
          cacheKey: normalizedCacheKey,
          posterCacheKey: normalizedPosterKey,
          size: fileToSave.size || 0,
          posterSize,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          originalName: file.name || ''
        };
    
        state.list = [item, ...state.list]; // Add to list
        await saveList(state.list);
        render();
        return item;
      };
    
      const ensureMyWallpaperDataPoster = async (posterKey, posterUrl) => {
        // STATIC UPLOAD: convert to data URL to avoid data->blob guard
        const lookupKey = posterKey || posterUrl || '';
        if (!lookupKey) return '';
    
        try {
          const stored = await browser.storage.local.get([CACHED_APPLIED_POSTER_URL_KEY, CACHED_APPLIED_POSTER_DATA_URL_KEY]);
          const cachedUrl = stored[CACHED_APPLIED_POSTER_URL_KEY];
          const cachedData = stored[CACHED_APPLIED_POSTER_DATA_URL_KEY];
          if (cachedData && cachedUrl && cachedUrl === lookupKey && typeof cachedData === 'string' && cachedData.startsWith('data:')) {
            return cachedData;
          }
        } catch (e) {
          // ignore storage errors
        }
    
        try {
          const blob = await resolvePosterBlob(posterUrl || '', posterKey || posterUrl || '');
          if (!blob) return '';
          const dataUrl = await fileToDataURL(blob);
          if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            try {
              await browser.storage.local.set({
                [CACHED_APPLIED_POSTER_DATA_URL_KEY]: dataUrl,
                [CACHED_APPLIED_POSTER_URL_KEY]: lookupKey
              });
              if (window.localStorage) {
                localStorage.setItem('cachedAppliedPosterDataUrl', dataUrl);
                localStorage.setItem('cachedAppliedPosterUrl', lookupKey);
              }
            } catch (e) {
              // ignore storage errors
            }
            return dataUrl;
          }
        } catch (err) {
          // ignore conversion errors
        }
    
        return '';
      };
    
      const applyItem = async (id, opts = {}) => {
        const applyBtn = opts.button || null;
        const preserveType = opts.preserveType !== false; // default true so My Wallpapers don't overwrite global type
        const resetButton = () => {
          if (!applyBtn) return;
          applyBtn.disabled = false;
          applyBtn.textContent = applyBtn.dataset.originalLabel || 'Apply';
          delete applyBtn.dataset.originalLabel;
        };
        if (applyBtn && !applyBtn.dataset.originalLabel) {
          applyBtn.dataset.originalLabel = applyBtn.textContent || 'Apply';
          applyBtn.textContent = 'Applying...';
          applyBtn.disabled = true;
        }
    
        await ensureInitialized();
        const item = state.list.find((mw) => mw.id === id);
        if (!item) {
          resetButton();
          return;
        }
    
        const isVideo = item.type === 'video';
        const isGif = item.mimeType === 'image/gif';
        const selection = {
          id: item.id,
          title: item.title || 'My Wallpaper',
          selectedAt: Date.now(),
          videoCacheKey: isVideo ? (item.cacheKey || '') : '',
          videoUrl: '',
          posterCacheKey: !isVideo ? (item.cacheKey || '') : (item.posterCacheKey || ''),
          posterUrl: !isVideo ? (item.cacheKey || '') : (item.posterCacheKey || ''),
          imageCacheKey: !isVideo ? (item.cacheKey || '') : '',
          mimeType: item.mimeType || ''
        };
    
        const desiredType = (isVideo && !isGif) ? 'video' : 'static';
    
        // Preserve existing global wallpaper type preference when requested
        let originalTypePref = wallpaperTypePreference;
        if (preserveType) {
          try {
            const storedType = await browser.storage.local.get(WALLPAPER_TYPE_KEY);
            if (storedType && storedType[WALLPAPER_TYPE_KEY]) {
              originalTypePref = storedType[WALLPAPER_TYPE_KEY];
            }
          } catch (err) {
            // ignore
          }
        }
        // [FIX]: For static images, use the original high-res file (cacheKey).
        // Only use the poster (thumbnail) if it's a video.
        const posterKey = (!isVideo ? item.cacheKey : item.posterCacheKey) || '';
    
        let quickPoster = '';
        if (desiredType === 'static') {
          quickPoster = await ensureMyWallpaperDataPoster(posterKey, selection.posterUrl);
          if (!quickPoster) {
            alert('Failed to load your wallpaper. Please try again.');
            resetButton();
            return;
          }
          selection.posterUrl = quickPoster;
          selection.posterCacheKey = posterKey || quickPoster;
        }
    
        if (desiredType === 'static') {
          // Show the new wallpaper immediately using a cached/data poster and avoid touching gallery code paths.
          // Ensure the guard inside applyWallpaperBackground doesn't block blob/http updates when the current bg is a data URL.
          applyWallpaperBackground('');
          setWallpaperFallbackPoster(quickPoster, posterKey);
          applyWallpaperBackground(quickPoster);
          clearBackgroundVideos();
          if (!preserveType && wallpaperTypeToggle) wallpaperTypeToggle.checked = true;
          resetButton();
        }
    
        const hydratedSelection = await hydrateWallpaperSelection(selection);
        await ensurePlayableSelection(hydratedSelection);
        if (desiredType === 'static' && quickPoster) {
          hydratedSelection.posterUrl = quickPoster;
        }
    
        await browser.storage.local.set({
          [WALLPAPER_SELECTION_KEY]: selection,
          [DAILY_ROTATION_KEY]: false
        });
    
        currentWallpaperSelection = hydratedSelection;
        if (galleryDailyToggle) galleryDailyToggle.checked = false;
    
        if (!preserveType) {
          await setWallpaperTypePreference(desiredType);
          if (wallpaperTypeToggle) wallpaperTypeToggle.checked = desiredType === 'static';
        }
    
        if (desiredType === 'static') {
          applyWallpaperByType(hydratedSelection, 'static');
          scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydratedSelection), 'cacheAppliedWallpaperVideo');
          scheduleIdleTask(async () => {
            try {
              // Defer poster data URL work so My Wallpapers stays snappy; gallery paths remain untouched.
              const isDataPoster = (hydratedSelection.posterUrl || '').startsWith('data:');
              const urlToStore = hydratedSelection.posterCacheKey || hydratedSelection.posterUrl || '';
              if (isDataPoster) {
                await browser.storage.local.set({
                  [CACHED_APPLIED_POSTER_DATA_URL_KEY]: hydratedSelection.posterUrl,
                  [CACHED_APPLIED_POSTER_URL_KEY]: urlToStore
                });
                try {
                  if (window.localStorage) {
                    localStorage.setItem('cachedAppliedPosterDataUrl', hydratedSelection.posterUrl);
                    localStorage.setItem('cachedAppliedPosterUrl', urlToStore);
                  }
                } catch (e) {
                  // ignore storage errors
                }
                return;
              }
              const blob = await resolvePosterBlob(hydratedSelection.posterUrl, hydratedSelection.posterCacheKey || hydratedSelection.posterUrl || '');
              if (blob && blob.size > 2 * 1024 * 1024) {
                if (urlToStore) {
                  await browser.storage.local.set({ [CACHED_APPLIED_POSTER_URL_KEY]: urlToStore });
                  await browser.storage.local.remove(CACHED_APPLIED_POSTER_DATA_URL_KEY);
                  try {
                    if (window.localStorage) {
                      localStorage.setItem('cachedAppliedPosterUrl', urlToStore);
                      localStorage.removeItem('cachedAppliedPosterDataUrl');
                    }
                  } catch (e) {
                    // ignore storage errors
                  }
                }
                return; // Skip expensive data URL for huge posters.
              }
              await cacheAppliedWallpaperPoster(hydratedSelection.posterUrl, hydratedSelection.posterCacheKey || hydratedSelection.posterUrl || '');
            } catch (err) {
              // ignore poster caching errors
            }
          }, 'persistPosterDataUrl');
          if (preserveType) {
            // Regression guard: ensure we didn't mutate global type preference when applying My Wallpapers
            try {
              const storedType = await browser.storage.local.get(WALLPAPER_TYPE_KEY);
              const currentType = storedType ? storedType[WALLPAPER_TYPE_KEY] : undefined;
              if (originalTypePref !== undefined && currentType !== originalTypePref) {
                await browser.storage.local.set({ [WALLPAPER_TYPE_KEY]: originalTypePref });
                wallpaperTypePreference = originalTypePref;
              }
            } catch (err) {
              // best-effort only
            }
          }
          resetButton();
        } else {
          applyWallpaperByType(hydratedSelection, desiredType);
          scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydratedSelection), 'cacheAppliedWallpaperVideo');
          resetButton();
        }
    
        item.lastUsedAt = Date.now();
        await saveList(state.list);
        closeGalleryModal();
      };
    
      const removeItem = async (id) => {
        if (!id) return;
        await ensureInitialized();
        const target = state.list.find((item) => item.id === id);
        state.list = state.list.filter((item) => item.id !== id);
        await saveList(state.list);
    
        if (target?.cacheKey) await cacheDelete(target.cacheKey);
        if (target?.posterCacheKey) await cacheDelete(target.posterCacheKey);
    
        try {
          const stored = await browser.storage.local.get(WALLPAPER_SELECTION_KEY);
          const activeSelection = currentWallpaperSelection || stored[WALLPAPER_SELECTION_KEY] || null;
          const activeId = activeSelection && activeSelection.id;
          const selectionKeys = new Set(
            [activeSelection?.cacheKey, activeSelection?.posterCacheKey, activeSelection?.videoCacheKey, activeSelection?.imageCacheKey]
              .filter(Boolean)
              .map(normalizeCacheKey)
          );
          const targetKeys = new Set(
            [target?.cacheKey, target?.posterCacheKey, target?.videoCacheKey, target?.imageCacheKey]
              .filter(Boolean)
              .map(normalizeCacheKey)
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
            scheduleIdleTask(() => cacheAppliedWallpaperVideo(fallbackSelection), 'cacheAppliedWallpaperVideo');
          }
        } catch (err) {
          console.warn('Failed to reset wallpaper after deletion', err);
        }
    
        render();
      };
    
      const init = ensureInitialized;
    
      return {
        init,
        render,
        addUpload,
        removeItem,
        applyItem,
        loadList,
        saveList,
        hasItems,
        getList,
        getObjectUrl: cacheGetObjectUrl,
        getCacheName,
        validateUpload,
        maybeEvictForSpace
      };
    })();
    window.MyWallpapers = myWallpapersInstance;
    return myWallpapersInstance;
  }

  function setupGalleryListeners() {
    // 1. Wallpaper Quality Toggle
    if (wallpaperQualityToggle && !wallpaperQualityToggle.dataset.qualityListenerAttached) {
      wallpaperQualityToggle.dataset.qualityListenerAttached = 'true';
      wallpaperQualityToggle.addEventListener('change', async (e) => {
        const newQuality = e.target.checked ? 'high' : 'low';
        wallpaperQualityPreference = newQuality;
        if (appWallpaperQualitySelect) {
          appWallpaperQualitySelect.value = newQuality;
        }
        await browser.storage.local.set({ [WALLPAPER_QUALITY_KEY]: newQuality });
        console.log('Wallpaper quality set to:', newQuality);

        const updatedSelection = rebuildCurrentSelectionFromGallery();
        if (!updatedSelection) return;

        // Persist updated selection so future loads use the new quality
        await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: updatedSelection });

        await applyWallpaperByType(updatedSelection, wallpaperTypePreference);
      });
    }

    // 2. Wallpaper Type Toggle (ON = Video, OFF = Static)
    if (wallpaperTypeToggle) {
      wallpaperTypeToggle.addEventListener('change', async (e) => {
        const newType = e.target.checked ? 'video' : 'static';

        wallpaperTypePreference = newType;
        if (appWallpaperTypeSelect) {
          appWallpaperTypeSelect.value = newType;
        }
        await browser.storage.local.set({ [WALLPAPER_TYPE_KEY]: newType });

        if (currentWallpaperSelection) {
          console.log('Switching wallpaper type to:', newType);
          if (typeof applyWallpaperByType === 'function') {
            applyWallpaperByType(currentWallpaperSelection, newType);
          } else {
            window.location.reload();
          }
        }
      });
    }

    // 3. Daily Rotation Toggle
    if (galleryDailyToggle && !galleryDailyToggle.dataset.dailyListenerAttached) {
      galleryDailyToggle.dataset.dailyListenerAttached = 'true';
      galleryDailyToggle.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        dailyRotationPreference = isEnabled;
        if (appDailyToggle) {
          appDailyToggle.checked = isEnabled;
        }
        await browser.storage.local.set({ [DAILY_ROTATION_KEY]: isEnabled });
        if (isEnabled) {
          await ensureDailyWallpaper();
        }
      });
    }
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

  const galleryPosterDataCache = async () => {
    try {
      const stored = await browser.storage.local.get(GALLERY_POSTERS_CACHE_KEY);
      const map = stored[GALLERY_POSTERS_CACHE_KEY] || {};
      return typeof map === 'object' && map !== null ? map : {};
    } catch (err) {
      return {};
    }
  };

  const persistGalleryPosterDataCache = async (map) => {
    try {
      await browser.storage.local.set({ [GALLERY_POSTERS_CACHE_KEY]: map });
    } catch (err) {
      // ignore persistence errors
    }
  };

  const ensurePosterDataURL = async (posterUrl) => {
    if (!posterUrl) return '';
    if (posterUrl.startsWith('data:')) return posterUrl;
    try {
      const res = await fetch(posterUrl);
      if (!res.ok) return '';
      const blob = await res.blob();
      return await blobToDataUrl(blob);
    } catch (err) {
      console.warn('Failed to convert poster to data URL', err);
      return '';
    }
  };

  const getOrCreateGalleryPosterDataURL = async (selection) => {
    if (!selection) return '';
    const posterKey = selection.posterCacheKey || selection.posterUrl || '';
    if (!posterKey) return '';

    const cacheMap = await galleryPosterDataCache();
    const cached = cacheMap[posterKey];
    if (cached && typeof cached === 'string' && cached.startsWith('data:')) {
      return cached;
    }

    const dataUrl = await ensurePosterDataURL(posterKey);
    if (dataUrl && dataUrl.startsWith('data:')) {
      cacheMap[posterKey] = dataUrl;
      persistGalleryPosterDataCache(cacheMap);
      return dataUrl;
    }

    return '';
  };

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
      let generatedVideoUrl = '';
      let generatedPosterUrl = '';
      if (isGallerySelection(item)) {
        const urls = getWallpaperUrls(item.id);
        generatedVideoUrl = urls.videoUrl;
        generatedPosterUrl = urls.posterUrl;
      }
      const videoUrl = generatedVideoUrl || item.url;
      const remotePosterUrl = generatedPosterUrl || item.posterUrl || item.poster || '';

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

      let finalPosterUrl = '';
      let finalPosterCacheKey = '';

      if (remotePosterUrl) {
        if (applyBtn) applyBtn.textContent = 'Caching poster...';
        try {
          await cacheAsset(remotePosterUrl);
        } catch (err) {
          console.warn('Failed caching remote poster', err);
        }
        finalPosterUrl = remotePosterUrl;
        finalPosterCacheKey = remotePosterUrl;
      }

      if (!finalPosterUrl) {
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
        finalPosterUrl = generatedPosterKey;
        finalPosterCacheKey = generatedPosterKey;
      }

      const selection = {
        id: item.id,
        videoUrl,
        posterUrl: finalPosterUrl,
        posterCacheKey: finalPosterCacheKey || finalPosterUrl || '',
        videoCacheKey: videoUrl,
        title: item.title || '',
        selectedAt: Date.now()
      };

      const hydrated = await hydrateWallpaperSelection(selection);
      await ensurePlayableSelection(hydrated);

      await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: hydrated });
      currentWallpaperSelection = hydrated;

      const type = await getWallpaperTypePreference();
      if (type === 'static') {
        try {
          const dataPoster = await getOrCreateGalleryPosterDataURL(hydrated);
          if (dataPoster) {
            hydrated.posterUrl = dataPoster;
            hydrated.posterCacheKey = hydrated.posterCacheKey || hydrated.posterUrl || '';
          }
        } catch (err) {
          console.warn('Gallery poster data URL conversion failed; falling back to existing poster', err);
        }
        applyWallpaperByType(hydrated, 'static');
      } else {
        applyWallpaperByType(hydrated, type);
      }

      scheduleIdleTask(() => cacheAppliedWallpaperVideo(hydrated), 'cacheAppliedWallpaperVideo');

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

  async function openGalleryModal(triggerSource = 'dock-gallery-btn') {
    if (!galleryModal || !galleryGrid) return;

    openModalWithAnimation('gallery-modal', triggerSource, '.gallery-dialog');

    try {
      const manifest = await getVideosManifest();
      const manifestList = Array.isArray(manifest) ? manifest : [];
      scheduleIdleTask(() => cacheGalleryPosters(manifestList), 'cacheGalleryPosters');
      galleryManifest = manifestList;

      await loadGalleryFavorites();
      await loadGallerySettings();
      await loadWallpaperTypePreference();
      await loadCurrentWallpaperSelection();

      const myWallpapers = ensureMyWallpapers();
      if (myWallpapers && typeof myWallpapers.init === 'function') {
        await myWallpapers.init();
      }

      updateSettingsPreview(currentWallpaperSelection, wallpaperTypePreference || 'video');
      buildGalleryFilters(galleryManifest);
      setGalleryFilter(galleryActiveFilterValue || 'all');
    } catch (err) {
      console.warn('Could not load gallery manifest', err);
    }
  }

  function closeGalleryModal() {
    if (!galleryModal) return;

    closeModalWithAnimation('gallery-modal', '.gallery-dialog');

    const previewVideo = document.getElementById('gallery-settings-preview-video');
    const previewImg = document.getElementById('gallery-settings-preview-img');

    if (previewVideo) {
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      const sources = previewVideo.querySelectorAll('source');
      sources.forEach((s) => s.removeAttribute('src'));
      previewVideo.load();
      previewVideo.classList.add('hidden');
    }

    if (previewImg) {
      previewImg.classList.remove('hidden');
    }
  }

  function createGalleryCardShell() {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.style.position = 'absolute';
    card.style.boxSizing = 'border-box';

    const img = document.createElement('img');
    img.className = 'gallery-card-image';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    card.appendChild(img);

    const favBtn = document.createElement('div');
    favBtn.className = 'gallery-fav-btn';
    const heart = document.createElement('div');
    heart.className = 'heart';
    favBtn.appendChild(heart);
    card.appendChild(favBtn);

    const meta = document.createElement('div');
    meta.className = 'gallery-card-meta';

    const title = document.createElement('span');
    title.className = 'gallery-card-title';
    const titleText = document.createElement('span');
    title.appendChild(titleText);
    meta.appendChild(title);

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'gallery-card-apply apply-button';
    applyBtn.setAttribute('aria-label', 'Apply this wallpaper');
    applyBtn.textContent = 'Apply';
    meta.appendChild(applyBtn);

    card.appendChild(meta);

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'gallery-card-tags';
    tagsWrap.style.display = 'none';
    card.appendChild(tagsWrap);

    card._refs = { img, favBtn, titleEl: title, titleText, applyBtn, tagsWrap };
    card._boundItemKey = null;

    return card;
  }

  function ensureGalleryPoolSize(size = 0) {
    const needed = Math.max(0, size - galleryNodePool.length);
    for (let i = 0; i < needed; i++) {
      galleryNodePool.push(createGalleryCardShell());
    }
  }

  function resetGalleryPoolBindings() {
    for (let i = 0; i < galleryPoolAttached; i++) {
      const node = galleryNodePool[i];
      if (!node) continue;
      node._boundItemKey = null;
    }
  }

  function updateGalleryCardNode(card, item, itemIndex = 0) {
    if (!card || !item) return;

    const refs = card._refs || {};
    const idStr = item.id != null ? String(item.id) : '';
    const isFavorite = galleryFavorites.has(item.id);

    card.dataset.id = idStr;

    if (refs.favBtn) {
      refs.favBtn.classList.toggle('is-active', isFavorite);
    }

    if (card._boundItemKey === idStr) {
      return;
    }

    let thumbUrl = '';
    if (isGallerySelection(item)) {
      const urls = getWallpaperUrls(item.id);
      thumbUrl = urls.thumbUrl;
    }
    const posterSrc = thumbUrl || item.posterUrl || item.poster || item.url || '';
    const titleTextValue = item.title || 'Wallpaper';
    const wordCount = titleTextValue.trim().split(/\s+/).filter(Boolean).length;
    const charCount = titleTextValue.length;
    const needsMarquee = charCount > 15 || wordCount >= 5;
    const marqueeDuration = Math.max(8, Math.min(20, Math.ceil(charCount / 2)));

    if (refs.img) {
      refs.img.src = posterSrc;
      refs.img.alt = item.title || 'Wallpaper';
      refs.img.loading = itemIndex < 40 ? 'eager' : 'lazy';
    }

    if (refs.titleEl) {
      refs.titleEl.classList.toggle('gallery-marquee', needsMarquee);
      if (needsMarquee) {
        refs.titleEl.style.setProperty('--gallery-marquee-duration', `${marqueeDuration}s`);
      } else {
        refs.titleEl.style.removeProperty('--gallery-marquee-duration');
      }
    }

    if (refs.titleText) {
      refs.titleText.textContent = titleTextValue;
    }

    if (refs.tagsWrap) {
      const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
      if (tags.length) {
        const frag = document.createDocumentFragment();
        tags.forEach((tag) => {
          const tagEl = document.createElement('span');
          tagEl.className = 'gallery-card-tag';
          tagEl.dataset.tag = tag;
          tagEl.textContent = tag;
          frag.appendChild(tagEl);
        });
        refs.tagsWrap.replaceChildren(frag);
        refs.tagsWrap.style.display = '';
      } else {
        refs.tagsWrap.replaceChildren();
        refs.tagsWrap.style.display = 'none';
      }
    }

    card._boundItemKey = idStr;
  }

  function renderGalleryVirtual(items = []) {
    galleryVirtualState.items = Array.isArray(items) ? items : [];
    galleryGrid.style.display = 'block';
    galleryGrid.style.position = 'relative';
    attachGalleryVirtualListeners();
    resetGalleryPoolBindings();
    updateGalleryVirtualGrid();
  }

  function attachGalleryVirtualListeners() {
    if (!galleryGrid) return;

    const scrollParent = document.getElementById('gallery-virtual-scroll-view');
    if (!scrollParent) {
      console.warn('Virtual Scroll Wrapper not found! Check new-tab.html');
      return;
    }

    if (galleryVirtualScrollHandler) {
      scrollParent.removeEventListener('scroll', galleryVirtualScrollHandler);
    }

    galleryVirtualScrollHandler = () => {
      window.requestAnimationFrame(() => updateGalleryVirtualGrid());
    };

    scrollParent.addEventListener('scroll', galleryVirtualScrollHandler, { passive: true });

    if (!galleryVirtualResizeAttached) {
      galleryVirtualResizeAttached = true;
      window.addEventListener('resize', debounce(() => updateGalleryVirtualGrid(), 100));
    }
  }

  function updateGalleryVirtualGrid() {
    if (!galleryGrid) return;

    const scrollParent = document.getElementById('gallery-virtual-scroll-view');
    if (!scrollParent) return;

    const state = galleryVirtualState;
    const items = state.items || [];
    const gap = state.gap;
    const itemWidth = state.itemWidth;
    const itemHeight = state.itemHeight;

    const containerWidth = galleryGrid.clientWidth || scrollParent.clientWidth || 300;

    const itemsPerRow = Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
    state.itemsPerRow = itemsPerRow;

    const totalRows = Math.ceil(items.length / itemsPerRow);
    const totalHeight = totalRows * (itemHeight + gap);

    galleryGrid.style.height = `${totalHeight}px`;

    const scrollTop = scrollParent.scrollTop;
    const viewportHeight = scrollParent.clientHeight;

    let startRow = Math.floor(scrollTop / (itemHeight + gap)) - state.renderBuffer;
    let endRow = Math.ceil((scrollTop + viewportHeight) / (itemHeight + gap)) + state.renderBuffer;

    startRow = Math.max(0, startRow);
    endRow = Math.min(totalRows, endRow);

    const startIndex = startRow * itemsPerRow;
    const endIndex = Math.min(endRow * itemsPerRow, items.length);
    const visibleCount = Math.max(0, endIndex - startIndex);

    ensureGalleryPoolSize(visibleCount);

    if (galleryPoolAttached < visibleCount) {
      const fragment = document.createDocumentFragment();
      for (let i = galleryPoolAttached; i < visibleCount; i++) {
        fragment.appendChild(galleryNodePool[i]);
      }
      galleryGrid.appendChild(fragment);
      galleryPoolAttached = visibleCount;
    }

    const widthPercent = 100 / itemsPerRow;

    for (let slot = 0; slot < visibleCount; slot++) {
      const i = startIndex + slot;
      const item = items[i];
      const node = galleryNodePool[slot];

      if (!item || !node) continue;

      const row = Math.floor(i / itemsPerRow);
      const col = i % itemsPerRow;

      node.style.display = '';
      node.style.top = `${row * (itemHeight + gap)}px`;
      node.style.left = `${col * widthPercent}%`;
      node.style.width = `${widthPercent}%`;
      node.style.padding = `${gap / 2}px`;

      updateGalleryCardNode(node, item, i);
    }

    for (let slot = visibleCount; slot < galleryPoolAttached; slot++) {
      const node = galleryNodePool[slot];
      if (!node) continue;
      node.style.display = 'none';
      node._boundItemKey = null;
    }
  }

  function renderCurrentGallery() {
    const data = getGalleryDataForSection();
    const isSettings = gallerySection === 'settings';
    const isMyWallpapers = gallerySection === 'my-wallpapers';

    const virtualScrollView = document.getElementById('gallery-virtual-scroll-view');
    if (virtualScrollView) {
      virtualScrollView.classList.toggle('hidden', isSettings || isMyWallpapers);
    }

    if (galleryGrid) {
      galleryGrid.classList.toggle('hidden', isSettings || isMyWallpapers);
    }

    if (galleryEmptyState) {
      galleryEmptyState.classList.toggle('hidden', isSettings || isMyWallpapers || data.length > 0);
    }

    if (gallerySettingsPanel) {
      gallerySettingsPanel.classList.toggle('hidden', !isSettings);
    }

    if (galleryMyWallpapersPanel) {
      galleryMyWallpapersPanel.classList.toggle('hidden', !isMyWallpapers);
    }

    if (myWallpapersEmptyCard) {
      const hasItems = typeof MyWallpapers !== 'undefined' && MyWallpapers.hasItems();
      myWallpapersEmptyCard.classList.toggle('hidden', hasItems || !isMyWallpapers);
    }

    if (myWallpapersGrid) {
      const hasItems = typeof MyWallpapers !== 'undefined' && MyWallpapers.hasItems();
      myWallpapersGrid.classList.toggle('hidden', !isMyWallpapers || !hasItems);
    }

    if (isMyWallpapers) {
      if (typeof MyWallpapers !== 'undefined' && MyWallpapers && typeof MyWallpapers.render === 'function') {
        MyWallpapers.render();
      }
    } else {
      renderGalleryVirtual(data);
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

  async function toggleFavorite(itemId, skipRender = false) {
    if (!itemId) return;

    if (galleryFavorites.has(itemId)) {
      galleryFavorites.delete(itemId);
    } else {
      galleryFavorites.add(itemId);
    }

    await saveGalleryFavorites();

    if (!skipRender) {
      renderCurrentGallery();
    }
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

  async function loadGallerySettings() {
    if (!galleryDailyToggle) return;

    try {
      const stored = await browser.storage.local.get(DAILY_ROTATION_KEY);
      const enabled = stored[DAILY_ROTATION_KEY];
      dailyRotationPreference = enabled !== false;
      galleryDailyToggle.checked = dailyRotationPreference;
      if (appDailyToggle) {
        appDailyToggle.checked = dailyRotationPreference;
      }
    } catch (err) {
      dailyRotationPreference = true;
      galleryDailyToggle.checked = true;
      if (appDailyToggle) {
        appDailyToggle.checked = true;
      }
    }
  }

  function attachGalleryEventListeners() {
    if (galleryGrid) {
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

    if (galleryAlternateBtn) {
      galleryAlternateBtn.addEventListener('click', async () => {
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

    const myWallpapers = ensureMyWallpapers();

    if (myWallpapersGrid && myWallpapers) {
      myWallpapersGrid.addEventListener('click', async (e) => {
        const target = e.target;
        if (!target) return;

        const card = target.closest('.mw-card');
        if (!card) return;

        const id = card.dataset.id;

        if (target.closest('.mw-card-remove')) {
          e.stopPropagation();
          await myWallpapers.removeItem(id);
          return;
        }

        if (target.closest('.mw-card-btn')) {
          e.stopPropagation();
          await myWallpapers.applyItem(id, { button: target.closest('.mw-card-btn'), preserveType: true });
          return;
        }

        e.stopPropagation();
        await myWallpapers.applyItem(id, { preserveType: true });
      });
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
          scheduleIdleTask(() => cacheAppliedWallpaperVideo(selection), 'cacheAppliedWallpaperVideo');
        } catch (err) {
          console.warn('Failed to apply fallback wallpaper from My Wallpapers', err);
        }
      });
    }

    if (myWallpapersUploadBtn && myWallpapersUploadInput && myWallpapers) {
      myWallpapersUploadBtn.addEventListener('click', () => {
        myWallpapersUploadInput.value = '';
        myWallpapersUploadInput.click();
      });

      myWallpapersUploadInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const file = files[0];
        if (file) {
          await myWallpapers.addUpload(file, 'image');
        }
        myWallpapersUploadInput.value = '';
      });
    }

    if (myWallpapersUploadLiveBtn && myWallpapersUploadLiveInput && myWallpapers) {
      myWallpapersUploadLiveBtn.addEventListener('click', () => {
        myWallpapersUploadLiveInput.value = '';
        myWallpapersUploadLiveInput.click();
      });

      myWallpapersUploadLiveInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const file = files[0];
        if (file) {
          await myWallpapers.addUpload(file, 'video');
        }
        myWallpapersUploadLiveInput.value = '';
      });
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    ensureMyWallpapers();
    setupGalleryListeners();
    attachGalleryEventListeners();
  }

  async function open(options = {}) {
    init();

    await openGalleryModal(options.triggerSource || 'dock-gallery-btn');
  }

  return {
    init,
    open
  };
})();
