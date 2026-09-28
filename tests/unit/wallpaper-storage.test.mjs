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

function createWallpaperStorageTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };
  const storageCalls = { get: [], set: [], remove: [] };

  const storageMock = {
    get: async (keys) => {
      if (failStorage) throw new Error('Simulated storage get failure');
      storageCalls.get.push(keys);
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
      storageCalls.set.push(items);
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
      if (failStorage) throw new Error('Simulated storage remove failure');
      storageCalls.remove.push(keys);
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

  const sandbox = {
    console,
    window: null,
    localStorage: localStorageMock,
    browser: {
      storage: {
        local: storageMock
      }
    },
    chrome: {
      storage: {
        local: storageMock
      }
    }
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
    storageCalls
  };
}

test('Wallpaper Storage - getVideosManifestCache() returns empty defaults on missing data', async () => {
  const env = createWallpaperStorageTestEnvironment();
  const res = await env.context.getVideosManifestCache();

  assert.deepEqual(toPlain(res), { manifest: [], fetchedAt: 0 });
});

test('Wallpaper Storage - setVideosManifestCache() and getVideosManifestCache() roundtrip', async () => {
  const env = createWallpaperStorageTestEnvironment();
  const sampleManifest = [
    { id: 'video-1', title: 'Mountain Sunset', videoUrl: 'https://cdn.example.com/sunset.mp4' },
    { id: 'video-2', title: 'Ocean Waves', videoUrl: 'https://cdn.example.com/waves.mp4' }
  ];
  const now = 1711200000000;

  await env.context.setVideosManifestCache(sampleManifest, now);
  const res = await env.context.getVideosManifestCache();

  assert.equal(res.manifest.length, 2);
  assert.equal(res.manifest[0].id, 'video-1');
  assert.equal(res.manifest[1].title, 'Ocean Waves');
  assert.equal(res.fetchedAt, now);
  assert.equal(env.storageData.videosManifestFetchedAt, now);
});

test('Wallpaper Storage - setVideosManifestCache() normalizes invalid manifest and dates safely', async () => {
  const env = createWallpaperStorageTestEnvironment();

  await env.context.setVideosManifestCache('not-an-array', 'invalid-date');
  const res = await env.context.getVideosManifestCache();

  assert.deepEqual(toPlain(res.manifest), []);
  assert(res.fetchedAt > 0, 'FetchedAt should default to current time for invalid date');
});

test('Wallpaper Storage - clearVideosManifestCache() removes manifest and timestamp', async () => {
  const env = createWallpaperStorageTestEnvironment({
    initialStorage: {
      videosManifest: [{ id: 'v1' }],
      videosManifestFetchedAt: 123456789
    }
  });

  await env.context.clearVideosManifestCache();
  const res = await env.context.getVideosManifestCache();

  assert.deepEqual(toPlain(res), { manifest: [], fetchedAt: 0 });
  assert.equal(env.storageData.videosManifest, undefined);
  assert.equal(env.storageData.videosManifestFetchedAt, undefined);
});

test('Wallpaper Storage - Gallery posters metadata read/write/missing roundtrip', async () => {
  const env = createWallpaperStorageTestEnvironment();

  const empty = await env.context.getGalleryPostersCacheMetadata();
  assert.deepEqual(toPlain(empty), { lastCheckedAt: 0, signature: '' });

  const signature = 'sig-abcdef-123456';
  const checkedAt = 1711300000000;
  await env.context.setGalleryPostersCacheMetadata(signature, checkedAt);

  const res = await env.context.getGalleryPostersCacheMetadata();
  assert.equal(res.signature, signature);
  assert.equal(res.lastCheckedAt, checkedAt);
});

test('Wallpaper Storage - getCachedGalleryPosters() and setCachedGalleryPosters() sanitize array', async () => {
  const env = createWallpaperStorageTestEnvironment();

  const empty = await env.context.getCachedGalleryPosters();
  assert.deepEqual(toPlain(empty), []);

  await env.context.setCachedGalleryPosters(['poster1.jpg', null, 123, 'poster2.webp']);
  const res = await env.context.getCachedGalleryPosters();

  assert.deepEqual(toPlain(res), ['poster1.jpg', 'poster2.webp']);
});

test('Wallpaper Storage - getGalleryFavorites() and setGalleryFavorites() support Array and Set', async () => {
  const env = createWallpaperStorageTestEnvironment();

  const empty = await env.context.getGalleryFavorites();
  assert.deepEqual(toPlain(empty), []);

  await env.context.setGalleryFavorites(['fav-1', 'fav-2']);
  let res = await env.context.getGalleryFavorites();
  assert.deepEqual(toPlain(res), ['fav-1', 'fav-2']);

  await env.context.setGalleryFavorites(new Set(['fav-3', 'fav-4', 'fav-3']));
  res = await env.context.getGalleryFavorites();
  assert.deepEqual(toPlain(res), ['fav-3', 'fav-4']);
});

test('Wallpaper Storage - Applied video URL get/set/clear operations', async () => {
  const env = createWallpaperStorageTestEnvironment();

  const empty = await env.context.getCachedAppliedVideoUrl();
  assert.equal(empty, '');

  await env.context.setCachedAppliedVideoUrl('https://example.com/video.mp4');
  let res = await env.context.getCachedAppliedVideoUrl();
  assert.equal(res, 'https://example.com/video.mp4');

  await env.context.clearCachedAppliedVideoUrl();
  res = await env.context.getCachedAppliedVideoUrl();
  assert.equal(res, '');
});

test('Wallpaper Storage - Applied poster URL syncs with synchronous localStorage mirror', async () => {
  const env = createWallpaperStorageTestEnvironment();

  assert.equal(await env.context.getCachedAppliedPosterUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, undefined);

  const testUrl = 'https://example.com/applied-poster.webp';
  await env.context.setCachedAppliedPosterUrl(testUrl);

  assert.equal(await env.context.getCachedAppliedPosterUrl(), testUrl);
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, testUrl);

  await env.context.clearCachedAppliedPosterUrl();
  assert.equal(await env.context.getCachedAppliedPosterUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, undefined);
});

test('Wallpaper Storage - Applied poster data URL syncs with synchronous localStorage mirror', async () => {
  const env = createWallpaperStorageTestEnvironment();

  assert.equal(await env.context.getCachedAppliedPosterDataUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined);

  const testDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
  await env.context.setCachedAppliedPosterDataUrl(testDataUrl);

  assert.equal(await env.context.getCachedAppliedPosterDataUrl(), testDataUrl);
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, testDataUrl);

  await env.context.clearCachedAppliedPosterDataUrl();
  assert.equal(await env.context.getCachedAppliedPosterDataUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined);
});

test('Wallpaper Storage - clearAppliedPosterMetadata() clears both storage and mirrors', async () => {
  const env = createWallpaperStorageTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: 'https://example.com/poster.jpg',
      cachedAppliedPosterDataUrl: 'data:image/jpeg;base64,abc123'
    },
    initialLocalStorage: {
      cachedAppliedPosterUrl: 'https://example.com/poster.jpg',
      cachedAppliedPosterDataUrl: 'data:image/jpeg;base64,abc123'
    }
  });

  await env.context.clearAppliedPosterMetadata();

  assert.equal(await env.context.getCachedAppliedPosterUrl(), '');
  assert.equal(await env.context.getCachedAppliedPosterDataUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, undefined);
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined);
});

test('Wallpaper Storage - Defensive browser.storage.local fallback works when HomebaseStorage is absent', async () => {
  const env = createWallpaperStorageTestEnvironment({ withHomebaseStorage: false });

  assert.equal(env.context.window.HomebaseStorage, undefined);

  await env.context.setVideosManifestCache([{ id: 'v-fallback' }], 1700000000000);
  const manifestRes = await env.context.getVideosManifestCache();
  assert.equal(manifestRes.manifest.length, 1);
  assert.equal(manifestRes.manifest[0].id, 'v-fallback');
  assert.equal(manifestRes.fetchedAt, 1700000000000);

  await env.context.setGalleryPostersCacheMetadata('fallback-sig', 1700000001000);
  const metaRes = await env.context.getGalleryPostersCacheMetadata();
  assert.equal(metaRes.signature, 'fallback-sig');
  assert.equal(metaRes.lastCheckedAt, 1700000001000);

  await env.context.setGalleryFavorites(['fb-1', 'fb-2']);
  const favRes = await env.context.getGalleryFavorites();
  assert.deepEqual(toPlain(favRes), ['fb-1', 'fb-2']);

  await env.context.setCachedAppliedVideoUrl('https://fallback.com/video.mp4');
  assert.equal(await env.context.getCachedAppliedVideoUrl(), 'https://fallback.com/video.mp4');

  await env.context.setCachedAppliedPosterUrl('https://fallback.com/poster.jpg');
  assert.equal(await env.context.getCachedAppliedPosterUrl(), 'https://fallback.com/poster.jpg');
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, 'https://fallback.com/poster.jpg');

  await env.context.clearAppliedPosterMetadata();
  assert.equal(await env.context.getCachedAppliedPosterUrl(), '');
  assert.equal(env.localStorageData.cachedAppliedPosterUrl, undefined);
});

test('Wallpaper Storage - Fault tolerance: storage errors return safe fallbacks without throwing', async () => {
  const env = createWallpaperStorageTestEnvironment({ failStorage: true });

  const manifest = await env.context.getVideosManifestCache();
  assert.deepEqual(toPlain(manifest), { manifest: [], fetchedAt: 0 });

  const meta = await env.context.getGalleryPostersCacheMetadata();
  assert.deepEqual(toPlain(meta), { lastCheckedAt: 0, signature: '' });

  const posters = await env.context.getCachedGalleryPosters();
  assert.deepEqual(toPlain(posters), []);

  const favs = await env.context.getGalleryFavorites();
  assert.deepEqual(toPlain(favs), []);

  const video = await env.context.getCachedAppliedVideoUrl();
  assert.equal(video, '');

  const poster = await env.context.getCachedAppliedPosterUrl();
  assert.equal(poster, '');

  const posterData = await env.context.getCachedAppliedPosterDataUrl();
  assert.equal(posterData, '');

  // Write operations should not throw even on failure
  await assert.doesNotReject(async () => {
    await env.context.setVideosManifestCache([{ id: 'test' }]);
    await env.context.clearVideosManifestCache();
    await env.context.setGalleryPostersCacheMetadata('sig');
    await env.context.setCachedGalleryPosters(['p1']);
    await env.context.setGalleryFavorites(['f1']);
    await env.context.setCachedAppliedVideoUrl('https://test.com/vid.mp4');
    await env.context.clearCachedAppliedVideoUrl();
    await env.context.setCachedAppliedPosterUrl('https://test.com/img.jpg');
    await env.context.clearCachedAppliedPosterUrl();
    await env.context.setCachedAppliedPosterDataUrl('data:image/jpeg;base64,123');
    await env.context.clearCachedAppliedPosterDataUrl();
    await env.context.clearAppliedPosterMetadata();
  });
});

test('Wallpaper Storage - window and window.HomebaseWallpaperStorage exports exist', async () => {
  const env = createWallpaperStorageTestEnvironment();

  assert.equal(typeof env.context.window.getVideosManifestCache, 'function');
  assert.equal(typeof env.context.window.setVideosManifestCache, 'function');
  assert.equal(typeof env.context.window.clearVideosManifestCache, 'function');
  assert.equal(typeof env.context.window.getGalleryPostersCacheMetadata, 'function');
  assert.equal(typeof env.context.window.setGalleryPostersCacheMetadata, 'function');
  assert.equal(typeof env.context.window.getCachedGalleryPosters, 'function');
  assert.equal(typeof env.context.window.setCachedGalleryPosters, 'function');
  assert.equal(typeof env.context.window.getGalleryFavorites, 'function');
  assert.equal(typeof env.context.window.setGalleryFavorites, 'function');
  assert.equal(typeof env.context.window.getCachedAppliedVideoUrl, 'function');
  assert.equal(typeof env.context.window.setCachedAppliedVideoUrl, 'function');
  assert.equal(typeof env.context.window.clearCachedAppliedVideoUrl, 'function');
  assert.equal(typeof env.context.window.getCachedAppliedPosterUrl, 'function');
  assert.equal(typeof env.context.window.setCachedAppliedPosterUrl, 'function');
  assert.equal(typeof env.context.window.clearCachedAppliedPosterUrl, 'function');
  assert.equal(typeof env.context.window.getCachedAppliedPosterDataUrl, 'function');
  assert.equal(typeof env.context.window.setCachedAppliedPosterDataUrl, 'function');
  assert.equal(typeof env.context.window.clearCachedAppliedPosterDataUrl, 'function');
  assert.equal(typeof env.context.window.clearAppliedPosterMetadata, 'function');

  assert.ok(env.context.window.HomebaseWallpaperStorage);
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.getVideosManifestCache, 'function');
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.setVideosManifestCache, 'function');
  assert.equal(typeof env.context.window.HomebaseWallpaperStorage.clearAppliedPosterMetadata, 'function');
});
