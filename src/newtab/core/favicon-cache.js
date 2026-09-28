// Favicon Metadata & Cache Service
// Manages favicon lookup metadata, failure backoff, freshness checks, and cache pruning.
// Uses HomebaseStorage with defensive fallback to browser.storage.local.

const FAVICON_META_PREFIX = 'fav:meta:';
const FAVICON_META_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const FAVICON_FAIL_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FAVICON_META_MAX_ENTRIES = 5000;

function getFaviconMetaStorageKey(domainKey) {
  return `${FAVICON_META_PREFIX}${domainKey}`;
}

async function getFaviconMeta(domainKey) {
  if (!domainKey) return null;
  const key = getFaviconMetaStorageKey(domainKey);
  try {
    let meta = null;
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.get === 'function') {
      meta = await window.HomebaseStorage.get(key, null);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      const stored = await browser.storage.local.get(key);
      meta = stored && stored[key];
    }
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch (err) {
    return null;
  }
}

async function setFaviconMeta(domainKey, meta) {
  if (!domainKey || !meta) return;
  const payload = {
    cacheKey: meta.cacheKey || null,
    lastSeen: Number.isFinite(meta.lastSeen) ? meta.lastSeen : 0,
    failCount: Number.isFinite(meta.failCount) ? meta.failCount : 0,
    lastOkAt: Number.isFinite(meta.lastOkAt) ? meta.lastOkAt : 0
  };
  const key = getFaviconMetaStorageKey(domainKey);
  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.set === 'function') {
      await window.HomebaseStorage.set(key, payload);
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      await browser.storage.local.set({ [key]: payload });
    }
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
  try {
    let stored = null;
    if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.snapshot === 'function') {
      stored = await window.HomebaseStorage.snapshot();
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      stored = await browser.storage.local.get(null);
    }
    if (!stored) return;

    const keys = Object.keys(stored || {}).filter((key) => key.startsWith(FAVICON_META_PREFIX));
    const limit = (typeof window !== 'undefined' && Number.isInteger(window.FAVICON_META_MAX_ENTRIES) && window.FAVICON_META_MAX_ENTRIES > 0)
      ? window.FAVICON_META_MAX_ENTRIES
      : FAVICON_META_MAX_ENTRIES;
    if (keys.length <= limit) return;
    const entries = keys
      .map((key) => {
        const meta = stored[key] || {};
        return {
          key,
          lastSeen: Number.isFinite(meta.lastSeen) ? meta.lastSeen : 0
        };
      })
      .sort((a, b) => a.lastSeen - b.lastSeen);
    const remove = entries.slice(0, keys.length - limit).map((entry) => entry.key);
    if (remove.length) {
      if (typeof window !== 'undefined' && window.HomebaseStorage && typeof window.HomebaseStorage.remove === 'function') {
        await window.HomebaseStorage.remove(remove);
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.remove(remove);
      }
    }
  } catch (err) {}
}

if (typeof window !== 'undefined') {
  window.FAVICON_META_PREFIX = FAVICON_META_PREFIX;
  window.FAVICON_META_STALE_MS = FAVICON_META_STALE_MS;
  window.FAVICON_FAIL_RETRY_WINDOW_MS = FAVICON_FAIL_RETRY_WINDOW_MS;
  window.FAVICON_META_MAX_ENTRIES = FAVICON_META_MAX_ENTRIES;
  window.getFaviconMetaStorageKey = getFaviconMetaStorageKey;
  window.getFaviconMeta = getFaviconMeta;
  window.setFaviconMeta = setFaviconMeta;
  window.bumpFaviconFail = bumpFaviconFail;
  window.isFaviconMetaStale = isFaviconMetaStale;
  window.shouldBlockFaviconMeta = shouldBlockFaviconMeta;
  window.pruneFaviconMetaIfNeeded = pruneFaviconMetaIfNeeded;
  window.HomebaseFaviconCache = {
    FAVICON_META_PREFIX,
    FAVICON_META_STALE_MS,
    FAVICON_FAIL_RETRY_WINDOW_MS,
    FAVICON_META_MAX_ENTRIES,
    getFaviconMetaStorageKey,
    getFaviconMeta,
    setFaviconMeta,
    bumpFaviconFail,
    isFaviconMetaStale,
    shouldBlockFaviconMeta,
    pruneFaviconMetaIfNeeded
  };
}
