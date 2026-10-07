/**
 * Homebase Favicon Resolution & Hydration Pipeline
 * Manages URL validation, candidate discovery, caching, network worker queue,
 * IntersectionObserver lazy loading, and object URL lifecycle.
 */
(function() {
  'use strict';

  // Constants
  const FAVICON_SIZE_PX = 48;
  const FAVICON_NEGATIVE_TTL_MS = 10 * 60 * 1000;
  const FAVICON_RESOLVED_CACHE_LIMIT = 300;
  const MAX_CONCURRENT_FAVICON_TASKS = 6;
  const FAVICON_CACHE_NAME = 'favicons-v1';
  const FAVICON_OBSERVER_ROOT_MARGIN = '250px';
  const FAVICON_OBSERVER_THRESHOLD = 0.01;

  // Pipeline State
  const faviconResolvedCache = new Map(); // domainKey -> { url, cacheKey, cached }
  const faviconInflightCache = new Map(); // domainKey -> Promise<{ url, cacheKey, cached }|null>
  const faviconNegativeCache = new Map(); // domainKey -> lastFailureTimestamp (number)
  const faviconWaiters = new Map(); // domainKey -> Array<(resolved|null) => void>
  const faviconTaskQueue = [];
  let faviconTaskActiveCount = 0;
  let faviconIntersectionObserver = null;
  let customOptions = {};
  const DEBUG_FAVICON = false;

  function debugFavicon(event, details) {
    if (!DEBUG_FAVICON) return;
    if (details) {
      console.debug('[favicon]', event, details);
      return;
    }
    console.debug('[favicon]', event);
  }

  // --- Metadata & Cache Service Integration ---
  function getMeta(domainKey) {
    if (typeof window !== 'undefined' && window.HomebaseFaviconCache && typeof window.HomebaseFaviconCache.getFaviconMeta === 'function') {
      return window.HomebaseFaviconCache.getFaviconMeta(domainKey);
    }
    if (typeof getFaviconMeta === 'function') {
      return getFaviconMeta(domainKey);
    }
    return Promise.resolve(null);
  }

  function setMeta(domainKey, meta) {
    if (typeof window !== 'undefined' && window.HomebaseFaviconCache && typeof window.HomebaseFaviconCache.setFaviconMeta === 'function') {
      return window.HomebaseFaviconCache.setFaviconMeta(domainKey, meta);
    }
    if (typeof setFaviconMeta === 'function') {
      return setFaviconMeta(domainKey, meta);
    }
    return Promise.resolve();
  }

  function bumpFail(domainKey) {
    if (typeof window !== 'undefined' && window.HomebaseFaviconCache && typeof window.HomebaseFaviconCache.bumpFaviconFail === 'function') {
      return window.HomebaseFaviconCache.bumpFaviconFail(domainKey);
    }
    if (typeof bumpFaviconFail === 'function') {
      return bumpFaviconFail(domainKey);
    }
    return Promise.resolve(null);
  }

  function isMetaStale(meta) {
    if (typeof window !== 'undefined' && window.HomebaseFaviconCache && typeof window.HomebaseFaviconCache.isFaviconMetaStale === 'function') {
      return window.HomebaseFaviconCache.isFaviconMetaStale(meta);
    }
    if (typeof isFaviconMetaStale === 'function') {
      return isFaviconMetaStale(meta);
    }
    return false;
  }

  function shouldBlockMeta(meta) {
    if (typeof window !== 'undefined' && window.HomebaseFaviconCache && typeof window.HomebaseFaviconCache.shouldBlockFaviconMeta === 'function') {
      return window.HomebaseFaviconCache.shouldBlockFaviconMeta(meta);
    }
    if (typeof shouldBlockFaviconMeta === 'function') {
      return shouldBlockFaviconMeta(meta);
    }
    return false;
  }

  // --- In-Memory Resolved Cache ---
  function setResolvedEntry(domainKey, url, options = {}) {
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

  function getResolvedEntry(domainKey) {
    if (!domainKey) return null;
    const entry = faviconResolvedCache.get(domainKey);
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { url: entry, cacheKey: null, cached: false };
    }
    return entry;
  }

  function getResolvedUrl(domainKey) {
    const entry = getResolvedEntry(domainKey);
    return entry && entry.url ? entry.url : null;
  }

  function clearResolvedCache() {
    faviconResolvedCache.clear();
  }

  function notifyFaviconWaiters(domainKey, resolved) {
    const waiters = faviconWaiters.get(domainKey);
    if (waiters && waiters.length) {
      waiters.forEach((resolve) => resolve(resolved));
      faviconWaiters.delete(domainKey);
    }
    faviconInflightCache.delete(domainKey);
  }

  // --- Worker Task Queue ---
  function runNextTask() {
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
        runNextTask();
      });
  }

  function enqueueTask(task) {
    return new Promise((resolve, reject) => {
      faviconTaskQueue.push({ task, resolve, reject });
      runNextTask();
    });
  }

  // --- Cache Storage Helpers ---
  function getFaviconCache() {
    if (typeof caches !== 'undefined' && typeof caches.open === 'function') {
      return caches.open(FAVICON_CACHE_NAME);
    }
    return null;
  }

  function cacheKeyFor(domainKey, size = FAVICON_SIZE_PX) {
    return `/favicons/${domainKey}@${size}`;
  }

  async function readIconFromCache(cacheKey) {
    if (!cacheKey || typeof caches === 'undefined' || typeof caches.open !== 'function') return null;
    try {
      const cache = await getFaviconCache();
      if (!cache) return null;
      const cached = await cache.match(cacheKey);
      return cached || null;
    } catch (err) {
      return null;
    }
  }

  async function writeIconToCache(cacheKey, response) {
    if (!cacheKey || !response || !response.ok || typeof caches === 'undefined' || typeof caches.open !== 'function') return false;
    try {
      const cache = await getFaviconCache();
      if (!cache) return false;
      await cache.put(cacheKey, response);
      return true;
    } catch (err) {
      return false;
    }
  }

  async function responseToObjectURL(response) {
    if (!response || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
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
      if (typeof XMLHttpRequest === 'undefined') {
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
    if (!blob) return typeof Response !== 'undefined' ? new Response() : null;
    const headers = typeof Headers !== 'undefined' ? new Headers() : null;
    if (headers) {
      if (blob.type) {
        headers.set('Content-Type', blob.type);
      } else {
        headers.set('Content-Type', 'image/png');
      }
    }
    return typeof Response !== 'undefined' ? new Response(blob, headers ? { headers } : undefined) : null;
  }

  // --- Object URL & Image DOM Helpers ---
  function setObjectUrlForImage(img, objectUrl) {
    if (!img || !objectUrl) return;
    const previous = img.dataset ? img.dataset.faviconObjectUrl : null;
    if (previous && previous !== objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previous);
    }
    if (img.dataset) {
      img.dataset.faviconObjectUrl = objectUrl;
    }
    img.src = objectUrl;
  }

  function revokeObjectUrl(img) {
    if (!img || !img.dataset) return;
    const previous = img.dataset.faviconObjectUrl;
    if (previous) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previous);
      }
      delete img.dataset.faviconObjectUrl;
    }
  }

  function setImageSrc(img, url) {
    if (!img || !url) return;
    revokeObjectUrl(img);
    img.src = url;
  }

  function loadObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate) {
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
      setObjectUrlForImage(img, objectUrl);
      if (img.complete) {
        const accepted = (img.naturalWidth === undefined || img.naturalWidth > 0) &&
          (typeof acceptCandidate === 'function' ? acceptCandidate(img) : true);
        finalize(accepted, false);
      }
    });
  }

  function testCandidateUrl(candidate, acceptCandidate) {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve(true);
        return;
      }
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

  function testCandidateObjectUrl(objectUrl, acceptCandidate) {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(objectUrl);
        }
        resolve(true);
        return;
      }
      const testImg = new Image();
      testImg.onload = () => {
        const accepted = typeof acceptCandidate === 'function' ? acceptCandidate(testImg) : true;
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(objectUrl);
        }
        resolve(accepted);
      };
      testImg.onerror = () => {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(objectUrl);
        }
        resolve(false);
      };
      testImg.src = objectUrl;
    });
  }

  // --- Observer & Lazy Loading ---
  function ensureObserver() {
    if (faviconIntersectionObserver || typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const root = (typeof document !== 'undefined') ? document.querySelector('.main-content') : null;
    try {
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
    } catch (err) {
      faviconIntersectionObserver = null;
    }
  }

  function queueResolution(img, resolveTask) {
    if (!img || typeof resolveTask !== 'function') return;
    const runTask = () => {
      try {
        const result = resolveTask();
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch (err) {}
    };
    ensureObserver();
    if (!faviconIntersectionObserver) {
      runTask();
      return;
    }
    img._faviconResolve = runTask;
    faviconIntersectionObserver.observe(img);
  }

  // --- URL Validation & Candidates Discovery ---
  function isValidTargetUrl(rawUrl) {
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

  function getDomainKey(rawUrl) {
    if (!isValidTargetUrl(rawUrl)) return '';
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch (err) {
      return '';
    }
  }

  function buildCandidates(rawUrl, size = FAVICON_SIZE_PX) {
    if (!isValidTargetUrl(rawUrl)) return [];
    try {
      const parsed = new URL(rawUrl);
      const origin = parsed.origin;
      const effectiveSize = Number.isInteger(size) && size > 0 ? size : FAVICON_SIZE_PX;
      const gstaticV2 = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=${effectiveSize}`;
      const googleS2 = `https://www.google.com/s2/favicons?sz=${effectiveSize}&domain_url=${encodeURIComponent(origin)}`;
      return [gstaticV2, googleS2].filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  // --- High-Level Favicon Resolution ---
  async function getUrlForRawUrl(rawUrl) {
    try {
      if (!isValidTargetUrl(rawUrl)) return null;
      const domainKey = getDomainKey(rawUrl);
      if (!domainKey) return null;
      const cached = getResolvedUrl(domainKey);
      if (cached) return cached;
      const lastFailedAt = faviconNegativeCache.get(domainKey);
      if (lastFailedAt) {
        if (Date.now() - lastFailedAt < FAVICON_NEGATIVE_TTL_MS) {
          return null;
        }
        faviconNegativeCache.delete(domainKey);
      }
      const meta = await getMeta(domainKey);
      if (shouldBlockMeta(meta)) {
        return null;
      }
      const inflight = faviconInflightCache.get(domainKey);
      if (inflight) {
        const resolved = await inflight;
        return resolved && resolved.url ? resolved.url : null;
      }
      const candidates = buildCandidates(rawUrl);
      return candidates[0] || null;
    } catch (err) {
      return null;
    }
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
      if (onFailed) onFailed();
      return;
    }
    if (shouldAbort && shouldAbort()) {
      if (onAbort) onAbort();
      return;
    }
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    if (resolved.cached && resolved.cacheKey) {
      const cachedResponse = await readIconFromCache(resolved.cacheKey);
      if (cachedResponse) {
        const objectUrl = await responseToObjectURL(cachedResponse);
        if (objectUrl) {
          const loadResult = await loadObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
          if (loadResult.aborted) {
            revokeObjectUrl(img);
            if (onAbort) onAbort();
            return;
          }
          if (loadResult.accepted) {
            if (onResolved) onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
            return;
          }
          revokeObjectUrl(img);
        }
      }
    }
    if (resolved.url && isOnline) {
      if (onResolved) onResolved(resolved.url, { fromCache: false, sourceAlreadySet: false });
      return;
    }
    if (onFailed) onFailed();
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
        const objectUrl = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
          ? URL.createObjectURL(blob)
          : null;
        if (objectUrl) {
          const accepted = await testCandidateObjectUrl(objectUrl, acceptCandidate);
          if (accepted) {
            const responseForCache = blobToResponse(blob);
            const cached = responseForCache ? await writeIconToCache(cacheKey, responseForCache.clone()) : false;
            setResolvedEntry(domainKey, candidate, { cacheKey: cached ? cacheKey : null, cached });
            faviconNegativeCache.delete(domainKey);
            await setMeta(domainKey, {
              cacheKey: cached ? cacheKey : null,
              lastSeen: now,
              failCount: 0,
              lastOkAt: now
            });
            return { url: candidate, cacheKey: cached ? cacheKey : null, cached };
          }
        }
      }
      const acceptedByUrl = await testCandidateUrl(candidate, acceptCandidate);
      if (acceptedByUrl) {
        setResolvedEntry(domainKey, candidate, { cacheKey: null, cached: false });
        faviconNegativeCache.delete(domainKey);
        await setMeta(domainKey, {
          cacheKey: null,
          lastSeen: now,
          failCount: 0,
          lastOkAt: now
        });
        return { url: candidate, cacheKey: null, cached: false };
      }
    }
    faviconNegativeCache.set(domainKey, Date.now());
    await bumpFail(domainKey);
    return null;
  }

  async function resolveForImageTarget({
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
      if (onFailed) onFailed();
      return;
    }

    const isOffline = typeof navigator !== 'undefined' ? navigator.onLine === false : false;
    const resolvedEntry = getResolvedEntry(domainKey);
    const cacheKey = cacheKeyFor(domainKey, FAVICON_SIZE_PX);

    if (resolvedEntry && resolvedEntry.url && !isOffline) {
      if (shouldAbort && shouldAbort()) {
        if (onAbort) onAbort();
        return;
      }
      if (onResolved) onResolved(resolvedEntry.url, { fromCache: true, sourceAlreadySet: false });
      return;
    }

    const cachedResponse = await readIconFromCache(cacheKey);
    if (cachedResponse) {
      const objectUrl = await responseToObjectURL(cachedResponse);
      if (objectUrl) {
        const loadResult = await loadObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
        if (loadResult.aborted) {
          revokeObjectUrl(img);
          if (onAbort) onAbort();
          return;
        }
        if (loadResult.accepted) {
          if (onResolved) onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
          return;
        }
        revokeObjectUrl(img);
      }
    }

    const meta = await getMeta(domainKey);
    const metaIsStale = isMetaStale(meta);
    if (meta && meta.cacheKey && meta.cacheKey !== cacheKey) {
      const metaResponse = await readIconFromCache(meta.cacheKey);
      if (metaResponse) {
        const objectUrl = await responseToObjectURL(metaResponse);
        if (objectUrl) {
          const loadResult = await loadObjectUrlIntoImage(img, objectUrl, shouldAbort, acceptCandidate);
          if (loadResult.aborted) {
            revokeObjectUrl(img);
            if (onAbort) onAbort();
            return;
          }
          if (loadResult.accepted) {
            if (onResolved) onResolved(objectUrl, { fromCache: true, sourceAlreadySet: true });
            return;
          }
          revokeObjectUrl(img);
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

    if (meta && !metaIsStale && shouldBlockMeta(meta)) {
      if (onNegativeCacheHit) onNegativeCacheHit(meta.lastSeen || Date.now());
      return;
    }

    if (!candidates || !candidates.length) {
      if (onFailed) onFailed();
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
          if (onFailed) onFailed();
        });
      return;
    }

    const inflightPromise = new Promise((resolve) => {
      const waiters = faviconWaiters.get(domainKey) || [];
      waiters.push(resolve);
      faviconWaiters.set(domainKey, waiters);
    });

    faviconInflightCache.set(domainKey, inflightPromise);

    enqueueTask(() => resolveFaviconFromNetwork({
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
        if (onFailed) onFailed();
      });
  }

  // --- Lifecycle Methods ---
  function initialize(options = {}) {
    customOptions = { ...options };
    ensureObserver();
  }

  function destroy() {
    if (faviconIntersectionObserver) {
      try {
        faviconIntersectionObserver.disconnect();
      } catch (_) {}
      faviconIntersectionObserver = null;
    }
    faviconTaskQueue.length = 0;
    faviconTaskActiveCount = 0;
    faviconResolvedCache.clear();
    faviconInflightCache.clear();
    faviconNegativeCache.clear();
    faviconWaiters.clear();
    customOptions = {};
  }

  function getState() {
    return {
      resolvedCacheSize: faviconResolvedCache.size,
      inflightCacheSize: faviconInflightCache.size,
      negativeCacheSize: faviconNegativeCache.size,
      waitersCount: faviconWaiters.size,
      taskQueueLength: faviconTaskQueue.length,
      taskActiveCount: faviconTaskActiveCount,
      hasObserver: Boolean(faviconIntersectionObserver)
    };
  }

  // Export Controller Interface
  const pipeline = {
    initialize,
    destroy,

    // Validation & URL Helpers
    isValidTargetUrl,
    getDomainKey,
    buildCandidates,

    // Aliases
    isValidFaviconTargetUrl: isValidTargetUrl,
    getDomainKeyFromUrl: getDomainKey,
    buildFaviconCandidates: buildCandidates,

    // Resolution & Hydration
    resolveForImageTarget,
    getUrlForRawUrl,
    queueResolution,

    // Aliases
    resolveFaviconForImageTarget: resolveForImageTarget,
    getFaviconUrlForRawUrl: getUrlForRawUrl,
    queueFaviconResolution: queueResolution,

    // Object URL & Image Helpers
    setObjectUrlForImage,
    revokeObjectUrl,
    setImageSrc,

    // Aliases
    setFaviconObjectUrlForImage: setObjectUrlForImage,
    revokeFaviconObjectUrl: revokeObjectUrl,
    setFaviconImageSrc: setImageSrc,

    // Testing & Internal Loading
    loadObjectUrlIntoImage,
    testCandidateUrl,
    testCandidateObjectUrl,

    // Aliases
    loadFaviconObjectUrlIntoImage: loadObjectUrlIntoImage,
    testFaviconCandidateUrl: testCandidateUrl,
    testFaviconCandidateObjectUrl: testCandidateObjectUrl,

    // Worker Queue & Observer
    enqueueTask,
    runNextTask,
    ensureObserver,

    // Aliases
    enqueueFaviconTask: enqueueTask,
    runNextFaviconTask: runNextTask,
    ensureFaviconObserver: ensureObserver,

    // Cache Accessors
    getResolvedEntry,
    setResolvedEntry,
    getResolvedUrl,
    clearResolvedCache,

    // Aliases
    getFaviconResolvedEntry: getResolvedEntry,
    setFaviconResolved: setResolvedEntry,
    getFaviconResolvedUrl: getResolvedUrl,

    // Network & Cache Helpers
    applyResolvedFaviconResult,
    resolveFaviconFromNetwork,
    getFaviconCache,
    cacheKeyFor,
    readIconFromCache,
    writeIconToCache,
    responseToObjectURL,
    xhrFetchBlob,
    blobToResponse,
    notifyWaiters: notifyFaviconWaiters,

    // Diagnostic State
    getState
  };

  if (typeof window !== 'undefined') {
    window.HomebaseFaviconPipeline = pipeline;
    window.revokeFaviconObjectUrl = revokeObjectUrl;
    window.setFaviconImageSrc = setImageSrc;
    window.ensureFaviconObserver = ensureObserver;
    window.getDomainKeyFromUrl = getDomainKey;
    window.buildFaviconCandidates = buildCandidates;
    window.getFaviconUrlForRawUrl = getUrlForRawUrl;
  }
})();
