import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const validatorScriptPath = path.join(rootDir, 'src/newtab/core/schema-validator.js');
const migrationsScriptPath = path.join(rootDir, 'src/newtab/core/schema-migrations.js');
const diagnosticsScriptPath = path.join(rootDir, 'src/newtab/core/storage-diagnostics.js');
const storageServiceScriptPath = path.join(rootDir, 'src/newtab/core/storage-service.js');
const wallpaperStorageScriptPath = path.join(rootDir, 'src/newtab/wallpaper/wallpaper-storage.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const wallpaperStorageScriptCode = fs.readFileSync(wallpaperStorageScriptPath, 'utf8');

const toPlain = (v) => (v !== undefined ? JSON.parse(JSON.stringify(v)) : undefined);

function createMockCache() {
  const store = new Map();
  return {
    match: async (reqOrUrl) => {
      const url = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      return store.get(url) || null;
    },
    put: async (reqOrUrl, response) => {
      const url = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      store.set(url, response);
    },
    add: async (url) => {
      store.set(url, {
        url,
        ok: true,
        blob: async () => ({ size: 500, type: 'image/webp' })
      });
    },
    delete: async (reqOrUrl) => {
      const url = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
      return store.delete(url);
    },
    keys: async () => {
      return Array.from(store.keys()).map((url) => ({ url }));
    },
    _store: store
  };
}

function createWallpaperAssetTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    withHomebaseStorage = true,
    failStorage = false,
    withCaches = true
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };
  const cacheRegistry = new Map();
  const createdObjectUrls = new Set();
  const revokedObjectUrls = new Set();
  let objectUrlCounter = 0;

  const storageMock = {
    get: async (keys) => {
      if (failStorage) throw new Error('Simulated storage get failure');
      if (keys === null || keys === undefined) return { ...storageData };
      if (typeof keys === 'string') return { [keys]: storageData[keys] };
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (storageData[k] !== undefined) res[k] = storageData[k];
        }
        return res;
      }
      return {};
    },
    set: async (items) => {
      if (failStorage) throw new Error('Simulated storage set failure');
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      if (failStorage) throw new Error('Simulated storage remove failure');
      const toRemove = Array.isArray(keys) ? keys : [keys];
      for (const k of toRemove) delete storageData[k];
    }
  };

  const localStorageMock = {
    getItem: (k) => (k in localStorageData ? localStorageData[k] : null),
    setItem: (k, v) => { localStorageData[k] = String(v); },
    removeItem: (k) => { delete localStorageData[k]; },
    clear: () => {
      for (const k of Object.keys(localStorageData)) delete localStorageData[k];
    }
  };

  const cachesMock = withCaches ? {
    open: async (name) => {
      if (!cacheRegistry.has(name)) {
        cacheRegistry.set(name, createMockCache());
      }
      return cacheRegistry.get(name);
    },
    delete: async (name) => cacheRegistry.delete(name),
    has: async (name) => cacheRegistry.has(name)
  } : undefined;

  const URLMock = {
    createObjectURL: (blob) => {
      const id = `blob:http://localhost/mock-blob-${++objectUrlCounter}`;
      createdObjectUrls.add(id);
      return id;
    },
    revokeObjectURL: (id) => {
      revokedObjectUrls.add(id);
      createdObjectUrls.delete(id);
    }
  };

  const fetchMock = async (url) => {
    if (url.includes('fail-network')) {
      return { ok: false, status: 500 };
    }
    return {
      ok: true,
      status: 200,
      clone: () => ({
        url,
        ok: true,
        blob: async () => ({ size: 2048, type: url.endsWith('.mp4') ? 'video/mp4' : 'image/webp' })
      }),
      blob: async () => ({ size: 2048, type: url.endsWith('.mp4') ? 'video/mp4' : 'image/webp' })
    };
  };

  const sandbox = {
    console,
    window: null,
    localStorage: localStorageMock,
    caches: cachesMock,
    URL: URLMock,
    fetch: fetchMock,
    browser: { storage: { local: storageMock } },
    chrome: { storage: { local: storageMock } }
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  if (withHomebaseStorage) {
    vm.runInContext(utilsScriptCode, context);
    vm.runInContext(validatorScriptCode, context);
    vm.runInContext(migrationsScriptCode, context);
    vm.runInContext(diagnosticsScriptCode, context);
    vm.runInContext(storageServiceScriptCode, context);
  }

  vm.runInContext(wallpaperStorageScriptCode, context);

  return {
    context,
    storageData,
    localStorageData,
    cacheRegistry,
    createdObjectUrls,
    revokedObjectUrls
  };
}

test('Wallpaper Asset Storage - normalizeWallpaperCacheKey handles raw and HTTP keys', () => {
  const env = createWallpaperAssetTestEnvironment();

  assert.equal(env.context.normalizeWallpaperCacheKey(''), '');
  assert.equal(env.context.normalizeWallpaperCacheKey(null), '');
  assert.equal(
    env.context.normalizeWallpaperCacheKey('https://example.com/wallpaper.mp4'),
    'https://example.com/wallpaper.mp4'
  );
  assert.equal(
    env.context.normalizeWallpaperCacheKey('http://example.com/wallpaper.webp'),
    'http://example.com/wallpaper.webp'
  );
  assert.equal(
    env.context.normalizeWallpaperCacheKey('custom-wallpaper-123'),
    'https://user-wallpapers.local/custom-wallpaper-123'
  );
});

test('Wallpaper Asset Storage - getCacheKeyVariants generates correct fallback variants', () => {
  const env = createWallpaperAssetTestEnvironment();

  assert.deepEqual(toPlain(env.context.getCacheKeyVariants('')), []);
  assert.deepEqual(toPlain(env.context.getCacheKeyVariants(null)), []);

  const variantsLocal = env.context.getCacheKeyVariants('custom-key-abc');
  assert.ok(variantsLocal.includes('https://user-wallpapers.local/custom-key-abc'));
  assert.ok(variantsLocal.includes('custom-key-abc'));

  const variantsUserPrefix = env.context.getCacheKeyVariants('https://user-wallpapers.local/my-file.jpg');
  assert.ok(variantsUserPrefix.includes('https://user-wallpapers.local/my-file.jpg'));
  assert.ok(variantsUserPrefix.includes('my-file.jpg'));
});

test('Wallpaper Asset Storage - openWallpaperAssetCache and openGalleryPostersCache open Cache instances', async () => {
  const env = createWallpaperAssetTestEnvironment();

  const wpCache = await env.context.openWallpaperAssetCache();
  assert.ok(wpCache);

  const postersCache = await env.context.openGalleryPostersCache();
  assert.ok(postersCache);

  assert.ok(env.cacheRegistry.has('wallpaper-assets'));
  assert.ok(env.cacheRegistry.has('gallery-posters'));
});

test('Wallpaper Asset Storage - cacheAsset fetches and stores video/image in wallpaper-assets cache', async () => {
  const env = createWallpaperAssetTestEnvironment();

  const success = await env.context.cacheAsset('https://cdn.example.com/waves.mp4');
  assert.equal(success, true);

  const wpCache = env.cacheRegistry.get('wallpaper-assets');
  const cachedMatch = await wpCache.match('https://cdn.example.com/waves.mp4');
  assert.ok(cachedMatch);

  // Subsequent call should skip network and return true immediately
  const second = await env.context.cacheAsset('https://cdn.example.com/waves.mp4');
  assert.equal(second, true);

  // Network failure returns false
  const failed = await env.context.cacheAsset('https://cdn.example.com/fail-network.mp4');
  assert.equal(failed, false);
});

test('Wallpaper Asset Storage - getCachedObjectUrl and deleteCachedObject manage Object URLs and cache lifecycle', async () => {
  const env = createWallpaperAssetTestEnvironment();

  // Populate an asset in wallpaper-assets cache
  await env.context.cacheAsset('https://cdn.example.com/nature.mp4');

  // Request Object URL
  const objectUrl1 = await env.context.getCachedObjectUrl('https://cdn.example.com/nature.mp4');
  assert.ok(objectUrl1);
  assert.ok(objectUrl1.startsWith('blob:'));

  // Requesting again should return cached Object URL from in-memory map
  const objectUrl2 = await env.context.getCachedObjectUrl('https://cdn.example.com/nature.mp4');
  assert.equal(objectUrl2, objectUrl1);

  // Delete cached object should delete from Cache and revoke Object URL
  await env.context.deleteCachedObject('https://cdn.example.com/nature.mp4');

  const wpCache = env.cacheRegistry.get('wallpaper-assets');
  const matchAfterDelete = await wpCache.match('https://cdn.example.com/nature.mp4');
  assert.equal(matchAfterDelete, null);
  assert.ok(env.revokedObjectUrls.has(objectUrl1));
});

test('Wallpaper Asset Storage - pruneCachedVideos prunes obsolete remote videos and protects active/user assets', async () => {
  const env = createWallpaperAssetTestEnvironment();

  const wpCache = await env.context.openWallpaperAssetCache();
  // Put active video
  await wpCache.put('https://cdn.example.com/active.mp4', { url: 'https://cdn.example.com/active.mp4' });
  // Put obsolete video
  await wpCache.put('https://cdn.example.com/old-video.mp4', { url: 'https://cdn.example.com/old-video.mp4' });
  // Put user uploaded video (should be protected)
  await wpCache.put('https://user-wallpapers.local/my-upload.mp4', { url: 'https://user-wallpapers.local/my-upload.mp4' });
  // Put poster image (should not be deleted by pruneCachedVideos)
  await wpCache.put('https://cdn.example.com/poster.webp', { url: 'https://cdn.example.com/poster.webp' });

  await env.context.pruneCachedVideos('https://cdn.example.com/active.mp4');

  assert.ok(await wpCache.match('https://cdn.example.com/active.mp4'), 'Active video must be preserved');
  assert.ok(await wpCache.match('https://user-wallpapers.local/my-upload.mp4'), 'User uploads must be preserved');
  assert.ok(await wpCache.match('https://cdn.example.com/poster.webp'), 'Posters must be preserved');
  assert.equal(await wpCache.match('https://cdn.example.com/old-video.mp4'), null, 'Obsolete video must be deleted');
});

test('Wallpaper Asset Storage - getGalleryPosterUrls and getGalleryPosterCacheSignature', () => {
  const env = createWallpaperAssetTestEnvironment();

  const manifest = [
    { id: 'item-1', posterUrl: 'https://cdn.example.com/p1.webp' },
    { id: 'item-2', posterUrl: 'https://cdn.example.com/p2.webp' },
    { id: 'item-3', poster: 'https://cdn.example.com/p3.webp' },
    { id: 'item-4', posterUrl: 'https://cdn.example.com/p1.webp' } // Duplicate
  ];

  const urls = env.context.getGalleryPosterUrls(manifest);
  assert.deepEqual(toPlain(urls), [
    'https://cdn.example.com/p1.webp',
    'https://cdn.example.com/p2.webp',
    'https://cdn.example.com/p3.webp'
  ]);

  const signature = env.context.getGalleryPosterCacheSignature(manifest);
  assert.equal(signature, 'https://cdn.example.com/p1.webp|https://cdn.example.com/p2.webp|https://cdn.example.com/p3.webp');
});

test('Wallpaper Asset Storage - cacheGalleryPosters downloads posters and updates cachedGalleryPosters storage', async () => {
  const env = createWallpaperAssetTestEnvironment();

  const manifest = [
    { id: 'p1', posterUrl: 'https://cdn.example.com/posters/poster1.webp' },
    { id: 'p2', posterUrl: 'https://cdn.example.com/posters/poster2.webp' }
  ];

  await env.context.cacheGalleryPosters(manifest);

  const postersCache = env.cacheRegistry.get('gallery-posters');
  assert.ok(await postersCache.match('https://cdn.example.com/posters/poster1.webp'));
  assert.ok(await postersCache.match('https://cdn.example.com/posters/poster2.webp'));

  const storedList = await env.context.getCachedGalleryPosters();
  assert.deepEqual(toPlain(storedList), [
    'https://cdn.example.com/posters/poster1.webp',
    'https://cdn.example.com/posters/poster2.webp'
  ]);
});

test('Wallpaper Asset Storage - resolvePosterBlob resolves blob from cache or network', async () => {
  const env = createWallpaperAssetTestEnvironment();

  // Test 1: Resolve from cache
  const wpCache = await env.context.openWallpaperAssetCache();
  await wpCache.put('https://cdn.example.com/my-poster.webp', {
    blob: async () => ({ size: 1024, type: 'image/webp' })
  });

  const cachedBlob = await env.context.resolvePosterBlob('https://cdn.example.com/my-poster.webp');
  assert.ok(cachedBlob);
  assert.equal(cachedBlob.size, 1024);

  // Test 2: Resolve via network fetch fallback
  const networkBlob = await env.context.resolvePosterBlob('https://cdn.example.com/uncached-poster.webp');
  assert.ok(networkBlob);
  assert.equal(networkBlob.size, 2048);

  // Test 3: Network failure returns null
  const failedBlob = await env.context.resolvePosterBlob('https://cdn.example.com/fail-network.webp');
  assert.equal(failedBlob, null);
});

test('Wallpaper Asset Storage - clearWallpaperCache deletes cache and revokes all active object URLs', async () => {
  const env = createWallpaperAssetTestEnvironment();

  await env.context.cacheAsset('https://cdn.example.com/test.mp4');
  const url = await env.context.getCachedObjectUrl('https://cdn.example.com/test.mp4');
  assert.ok(url);

  await env.context.clearWallpaperCache();

  assert.equal(env.cacheRegistry.has('wallpaper-assets'), false);
  assert.ok(env.revokedObjectUrls.has(url));
  assert.equal(env.context.wallpaperObjectUrlCache.size, 0);
});

test('Wallpaper Asset Storage - Environment with missing caches API fails gracefully without throwing', async () => {
  const env = createWallpaperAssetTestEnvironment({ withCaches: false });

  assert.equal(env.context.caches, undefined);

  assert.equal(await env.context.openWallpaperAssetCache(), null);
  assert.equal(await env.context.openGalleryPostersCache(), null);
  assert.equal(await env.context.cacheAsset('https://cdn.example.com/asset.mp4'), false);
  assert.equal(await env.context.getCachedObjectUrl('key'), null);

  await assert.doesNotReject(async () => {
    await env.context.deleteCachedObject('key');
    await env.context.pruneCachedVideos();
    await env.context.cacheGalleryPosters([{ posterUrl: 'https://cdn.example.com/p.webp' }]);
    await env.context.clearWallpaperCache();
  });
});

test('Wallpaper Asset Storage - Exports check on window and HomebaseWallpaperStorage', () => {
  const env = createWallpaperAssetTestEnvironment();

  assert.equal(env.context.window.WALLPAPER_CACHE_NAME, 'wallpaper-assets');
  assert.equal(env.context.window.GALLERY_POSTERS_CACHE_NAME, 'gallery-posters');
  assert.equal(env.context.window.CACHED_APPLIED_POSTER_CACHE_KEY, 'cachedAppliedPoster');

  assert.equal(typeof env.context.window.openWallpaperAssetCache, 'function');
  assert.equal(typeof env.context.window.openGalleryPostersCache, 'function');
  assert.equal(typeof env.context.window.cacheAsset, 'function');
  assert.equal(typeof env.context.window.getCachedObjectUrl, 'function');
  assert.equal(typeof env.context.window.deleteCachedObject, 'function');
  assert.equal(typeof env.context.window.pruneCachedVideos, 'function');
  assert.equal(typeof env.context.window.getGalleryPosterUrls, 'function');
  assert.equal(typeof env.context.window.getGalleryPosterCacheSignature, 'function');
  assert.equal(typeof env.context.window.cacheGalleryPosters, 'function');
  assert.equal(typeof env.context.window.resolvePosterBlob, 'function');
  assert.equal(typeof env.context.window.clearWallpaperCache, 'function');

  assert.ok(env.context.window.HomebaseWallpaperStorage);
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.cacheAsset, 'function');
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.getCachedObjectUrl, 'function');
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.pruneCachedVideos, 'function');
});
