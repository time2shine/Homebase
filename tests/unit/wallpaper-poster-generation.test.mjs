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
const wallpaperControllerScriptPath = path.join(rootDir, 'src/newtab/wallpaper/wallpaper-controller.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const wallpaperStorageScriptCode = fs.readFileSync(wallpaperStorageScriptPath, 'utf8');
const wallpaperControllerScriptCode = fs.readFileSync(wallpaperControllerScriptPath, 'utf8');

async function createPosterTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    initialLocalStorage = {},
    mockResolvePosterBlob = null,
    mockCreateStartupPosterDataUrl = null
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = { ...initialLocalStorage };

  const storageMock = {
    shouldFailSet: false,
    get: async (keys) => {
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
      if (storageMock.shouldFailSet) {
        throw new Error('Simulated browser.storage.local write failure');
      }
      Object.assign(storageData, items);
    },
    remove: async (keys) => {
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

  const docStyle = {
    _props: {},
    setProperty(prop, val) { this._props[prop] = val; },
    removeProperty(prop) { delete this._props[prop]; },
    getPropertyValue(prop) { return this._props[prop] || ''; }
  };

  const documentMock = {
    documentElement: {
      dataset: {},
      style: docStyle
    },
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {}
          }),
          toBlob: (cb, type, quality) => {
            cb(new Blob(['mock-webp'], { type: type || 'image/webp' }));
          },
          toDataURL: (type, quality) => 'data:image/webp;base64,mockcanvasdata'
        };
      }
      return {};
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  };

  class MockFileReader {
    constructor() {
      this.result = '';
      this.onloadend = null;
      this.onerror = null;
    }
    readAsDataURL(blob) {
      setTimeout(() => {
        this.result = 'data:image/webp;base64,mockfilereaderdata';
        if (this.onloadend) this.onloadend();
      }, 0);
    }
  }

  const sandbox = {
    console,
    window: null,
    document: documentMock,
    localStorage: localStorageMock,
    FileReader: MockFileReader,
    Blob,
    URL: {
      createObjectURL: (blob) => 'blob:mock-uuid',
      revokeObjectURL: () => {}
    },
    Image: class {
      constructor() {
        this.width = 1920;
        this.height = 1080;
        this.onload = null;
        this.onerror = null;
      }
      set src(v) {
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      }
    },
    createImageBitmap: async (blob) => ({
      width: 1920,
      height: 1080,
      close: () => {}
    }),
    browser: {
      storage: {
        local: storageMock
      }
    },
    chrome: {
      storage: {
        local: storageMock
      }
    },
    setTimeout,
    clearTimeout
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  // Load scripts in standard deferred order
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);
  vm.runInContext(wallpaperStorageScriptCode, context);
  vm.runInContext(wallpaperControllerScriptCode, context);

  // Drain initial script-evaluation timer from primeWallpaperBackground
  await new Promise((resolve) => setTimeout(resolve, 15));
  if (context.HomebaseWallpaperController && typeof context.HomebaseWallpaperController.resetActivePosterGenerationState === 'function') {
    context.HomebaseWallpaperController.resetActivePosterGenerationState();
  }

  // Restore initial storage state if primeWallpaperBackground mutated it
  if (options.initialStorage) {
    Object.assign(storageData, options.initialStorage);
  }
  if (options.initialLocalStorage) {
    Object.assign(localStorageData, options.initialLocalStorage);
  }

  if (mockResolvePosterBlob) {
    context.resolvePosterBlob = mockResolvePosterBlob;
  }
  if (mockCreateStartupPosterDataUrl) {
    context.createStartupPosterDataUrl = mockCreateStartupPosterDataUrl;
  }

  return {
    context,
    storageData,
    localStorageData,
    storageMock
  };
}

test('Wallpaper Poster - 1. Valid cached poster reused without encoding', async () => {
  const existingDataUrl = 'data:image/webp;base64,precomputedvalidposterdata';
  const sourceUrl = 'https://pub-example.r2.dev/v/ocean/poster_720p.webp';

  let encodingCallCount = 0;
  let resolveBlobCallCount = 0;

  const env = await createPosterTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: existingDataUrl,
      cachedAppliedPosterEncodingVersion: 1
    },
    initialLocalStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: existingDataUrl,
      cachedAppliedPosterEncodingVersion: '1'
    },
    mockResolvePosterBlob: async () => {
      resolveBlobCallCount++;
      return new Blob(['test']);
    },
    mockCreateStartupPosterDataUrl: async () => {
      encodingCallCount++;
      return 'data:image/webp;base64,newlyencoded';
    }
  });

  const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl, 'ocean-poster-key');

  // Should return existing cached data URL immediately
  assert.equal(result, existingDataUrl);
  // Zero calls to resolve blob or encode
  assert.equal(resolveBlobCallCount, 0, 'resolvePosterBlob must not be called when valid cache exists');
  assert.equal(encodingCallCount, 0, 'createStartupPosterDataUrl must not be called when valid cache exists');
  // Stored values remain unchanged
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, existingDataUrl);
});

test('Wallpaper Poster - 2. Missing/invalid/outdated cache is regenerated', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/forest/poster_720p.webp';
  const generatedDataUrl = 'data:image/webp;base64,generatedforestposter';

  // 2a. Missing cache
  {
    let encodingCount = 0;
    const env = await createPosterTestEnvironment({
      mockResolvePosterBlob: async () => new Blob(['forest-blob']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return generatedDataUrl;
      }
    });

    const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(result, generatedDataUrl);
    assert.equal(encodingCount, 1, 'Missing cache must trigger generation');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, generatedDataUrl);
  }

  // 2b. Invalid data URL format (does not start with data:image/)
  {
    let encodingCount = 0;
    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: sourceUrl,
        cachedAppliedPosterDataUrl: 'corrupted-non-data-url'
      },
      mockResolvePosterBlob: async () => new Blob(['forest-blob']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return generatedDataUrl;
      }
    });

    const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(result, generatedDataUrl);
    assert.equal(encodingCount, 1, 'Corrupted data URL must trigger regeneration');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, generatedDataUrl);
  }

  // 2c. Outdated / different wallpaper in cache
  {
    let encodingCount = 0;
    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: 'https://pub-example.r2.dev/v/desert/poster_720p.webp',
        cachedAppliedPosterDataUrl: 'data:image/webp;base64,desertoldposter'
      },
      mockResolvePosterBlob: async () => new Blob(['forest-blob']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return generatedDataUrl;
      }
    });

    const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(result, generatedDataUrl);
    assert.equal(encodingCount, 1, 'Mismatched wallpaper URL must trigger regeneration');
    assert.equal(env.storageData.cachedAppliedPosterUrl, sourceUrl);
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, generatedDataUrl);
  }

  // 2d. Forced regeneration option overrides valid cache
  {
    let encodingCount = 0;
    const existingDataUrl = 'data:image/webp;base64,oldvaliddatatooverride';
    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: sourceUrl,
        cachedAppliedPosterDataUrl: existingDataUrl
      },
      mockResolvePosterBlob: async () => new Blob(['forest-blob']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return generatedDataUrl;
      }
    });

    const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { forceRegenerate: true });
    assert.equal(result, generatedDataUrl);
    assert.equal(encodingCount, 1, 'forceRegenerate must bypass cache check');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, generatedDataUrl);
  }

  // 2e. Temporary blob URL without persistent key is not treated as persistent cache
  {
    let encodingCount = 0;
    const blobUrl = 'blob:http://localhost/temp-session-uuid';
    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: blobUrl,
        cachedAppliedPosterDataUrl: 'data:image/webp;base64,oldblobcachedata'
      },
      mockResolvePosterBlob: async () => new Blob(['blob-content']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return generatedDataUrl;
      }
    });

    const result = await env.context.cacheAppliedWallpaperPoster(blobUrl);
    assert.equal(result, generatedDataUrl);
    assert.equal(encodingCount, 1, 'Transient blob URL must not be trusted as stable persistent identity');
  }
});

test('Wallpaper Poster - 3. Concurrent same-poster requests are coalesced', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/mountains/poster_720p.webp';
  const expectedDataUrl = 'data:image/webp;base64,coalescedmountaindata';

  let encodingCount = 0;
  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => new Blob(['mountain-blob']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      // Simulate asynchronous encoding time
      await new Promise((resolve) => setTimeout(resolve, 20));
      return expectedDataUrl;
    }
  });

  // Launch two concurrent requests for the exact same poster
  const p1 = env.context.cacheAppliedWallpaperPoster(sourceUrl);
  const p2 = env.context.cacheAppliedWallpaperPoster(sourceUrl);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1, expectedDataUrl);
  assert.equal(res2, expectedDataUrl);
  assert.equal(encodingCount, 1, 'Concurrent requests for the same poster must coalesce into a single encoding task');
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, expectedDataUrl);
});

test('Wallpaper Poster - 4. Source replacement invalidates cached output', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/space/poster_720p.webp';
  const firstDataUrl = 'data:image/webp;base64,firstspacedata';
  const replacedDataUrl = 'data:image/webp;base64,secondspacedata';

  let currentDataUrl = firstDataUrl;
  let encodingCount = 0;

  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => new Blob(['space-blob']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return currentDataUrl;
    }
  });

  // Initial caching
  const res1 = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(res1, firstDataUrl);
  assert.equal(encodingCount, 1);

  // Second call with intact cache should be reused
  const res2 = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(res2, firstDataUrl);
  assert.equal(encodingCount, 1);

  // Invalidate using the project's clearCachedAppliedPosterDataUrl mechanism
  await env.context.clearCachedAppliedPosterDataUrl();
  assert.equal(env.storageData.cachedAppliedPosterDataUrl || '', '');

  // Next call must detect the invalidation and regenerate
  currentDataUrl = replacedDataUrl;
  const res3 = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(res3, replacedDataUrl);
  assert.equal(encodingCount, 2, 'Invalidated cache must trigger regeneration');
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, replacedDataUrl);
});

test('Wallpaper Poster - 5. Stale completion cannot overwrite or clear newer output', async () => {
  const urlA = 'https://pub-example.r2.dev/v/sunset/poster_720p.webp';
  const urlB = 'https://pub-example.r2.dev/v/sunrise/poster_720p.webp';
  const dataUrlA = 'data:image/webp;base64,sunsetdata';
  const dataUrlB = 'data:image/webp;base64,sunrisedata';

  let resolveA;
  const slowPromiseA = new Promise((resolve) => { resolveA = resolve; });

  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => new Blob(['blob-data']),
    mockCreateStartupPosterDataUrl: async (blob) => {
      // Check which URL is being processed by inspecting the caller's target
      const target = env.context.HomebaseWallpaperController.getActivePosterGenerationTarget();
      if (target === urlA) {
        await slowPromiseA;
        return dataUrlA;
      }
      return dataUrlB;
    }
  });

  // Start slow generation for A
  const pA = env.context.cacheAppliedWallpaperPoster(urlA);

  // Immediately apply B while A is still in-flight
  const pB = env.context.cacheAppliedWallpaperPoster(urlB);

  // Wait for B to finish and commit
  const resB = await pB;
  assert.equal(resB, dataUrlB);
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlB);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlB);

  // Now let stale task A resolve
  resolveA();
  const resA = await pA;

  // Stale task A should have aborted and returned empty
  assert.equal(resA, '');
  // Active storage must strictly retain B's values, NOT overwritten or cleared by A
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlB);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlB);
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, dataUrlB);
});

test('Wallpaper Poster - 6. Rapid A -> B -> A transitions preserve active state safely', async () => {
  const urlA = 'https://pub-example.r2.dev/v/alpha/poster_720p.webp';
  const urlB = 'https://pub-example.r2.dev/v/beta/poster_720p.webp';
  const dataUrlA = 'data:image/webp;base64,alphadata';
  const dataUrlB = 'data:image/webp;base64,betadata';

  let resolveA1;
  const promiseA1 = new Promise((resolve) => { resolveA1 = resolve; });
  let resolveB2;
  const promiseB2 = new Promise((resolve) => { resolveB2 = resolve; });

  let callIndex = 0;
  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => new Blob(['content']),
    mockCreateStartupPosterDataUrl: async () => {
      const idx = ++callIndex;
      if (idx === 1) {
        await promiseA1;
        return dataUrlA;
      }
      if (idx === 2) {
        await promiseB2;
        return dataUrlB;
      }
      // Third call (A3) completes normally
      return dataUrlA;
    }
  });

  // Step 1: Start A1 (held by promiseA1)
  const pA1 = env.context.cacheAppliedWallpaperPoster(urlA);
  await new Promise((r) => setTimeout(r, 0));

  // Step 2: Quickly switch to B2 (held by promiseB2)
  const pB2 = env.context.cacheAppliedWallpaperPoster(urlB);
  await new Promise((r) => setTimeout(r, 0));

  // Step 3: Quickly switch back to A (A3, completes)
  const pA3 = env.context.cacheAppliedWallpaperPoster(urlA);

  const resA3 = await pA3;
  assert.equal(resA3, dataUrlA);
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlA);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlA);

  // Now release stale A1 and B2
  resolveA1();
  resolveB2();

  await Promise.all([pA1, pB2]);

  // Neither stale task should corrupt the final storage state of A
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlA);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlA);
});

test('Wallpaper Poster - 7. Encoding failure/null output permits safe retry', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/retry-test/poster_720p.webp';
  const successDataUrl = 'data:image/webp;base64,successdataafterretry';

  let shouldFail = true;
  let attempts = 0;

  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => {
      if (shouldFail) return null; // simulate failed blob resolution
      return new Blob(['valid-blob']);
    },
    mockCreateStartupPosterDataUrl: async () => {
      attempts++;
      return successDataUrl;
    }
  });

  // First attempt fails due to null blob
  const res1 = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(res1, '');
  assert.equal(env.storageData.cachedAppliedPosterDataUrl || '', '');

  // Active in-flight state must be cleaned up
  assert.equal(
    env.context.HomebaseWallpaperController.getActivePosterGenerationPromise(),
    null,
    'Failed generation must reset activePosterGenerationPromise'
  );

  // Second attempt: problem resolved, retry should succeed immediately
  shouldFail = false;
  const res2 = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(res2, successDataUrl);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, successDataUrl);
});

test('Wallpaper Poster - 8. Existing output-size limits remain enforced', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/sizetest/poster_720p.webp';

  // 8a. Data URL within limit (<= 240,000 characters) is persisted
  {
    const validLength = 239900;
    const validDataUrl = 'data:image/webp;base64,' + 'A'.repeat(validLength - 23);

    const env = await createPosterTestEnvironment({
      mockResolvePosterBlob: async () => new Blob(['blob-data']),
      mockCreateStartupPosterDataUrl: async () => validDataUrl
    });

    const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(res, validDataUrl);
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, validDataUrl);
    assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, validDataUrl);
  }

  // 8b. Oversized data URL (> 240,000 characters) is cleared and NOT persisted
  {
    const oversizedLength = 240500;
    const oversizedDataUrl = 'data:image/webp;base64,' + 'B'.repeat(oversizedLength - 23);

    const env = await createPosterTestEnvironment({
      mockResolvePosterBlob: async () => new Blob(['blob-data']),
      mockCreateStartupPosterDataUrl: async () => oversizedDataUrl
    });

    const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(res, '');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl || '', '');
    assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined);
  }
});

test('Wallpaper Poster - 9. canvasToDataUrlAsync uses canvas.toBlob and falls back to toDataURL', async () => {
  const env = await createPosterTestEnvironment();

  // Test with canvas having toBlob
  let toBlobCalled = false;
  const canvasWithBlob = {
    toBlob: (cb, type, quality) => {
      toBlobCalled = true;
      cb(new Blob(['blobcontent'], { type }));
    },
    toDataURL: () => 'data:image/webp;base64,fallbackcalled'
  };

  const dataUrl1 = await env.context.canvasToDataUrlAsync(canvasWithBlob, 'image/webp', 0.8);
  assert.equal(toBlobCalled, true, 'canvas.toBlob must be invoked');
  assert.match(dataUrl1, /^data:image\/webp;base64,/);

  // Test fallback when toBlob is not a function
  const canvasWithoutBlob = {
    toDataURL: (type, quality) => 'data:image/webp;base64,fallbacksuccess'
  };

  const dataUrl2 = await env.context.canvasToDataUrlAsync(canvasWithoutBlob, 'image/webp', 0.8);
  assert.equal(dataUrl2, 'data:image/webp;base64,fallbacksuccess');
});

test('Wallpaper Poster - 10. Persisted encoding version validation and upgrade', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/version-test/poster_720p.webp';
  const oldDataUrl = 'data:image/webp;base64,oldformatdata';
  const newDataUrl = 'data:image/webp;base64,newformatdata';

  let encodingCount = 0;
  const env = await createPosterTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: oldDataUrl,
      cachedAppliedPosterEncodingVersion: 0 // older/unversioned
    },
    mockResolvePosterBlob: async () => new Blob(['blob-content']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return newDataUrl;
    }
  });

  // Since stored encoding version (0) does not match STARTUP_POSTER_ENCODING_VERSION (1),
  // cached poster must be invalidated and regenerated.
  const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
  assert.equal(result, newDataUrl);
  assert.equal(encodingCount, 1, 'Older/unversioned cache must trigger regeneration');
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, newDataUrl);
  assert.equal(env.storageData.cachedAppliedPosterEncodingVersion, 1);
});

test('Wallpaper Poster - 11. Source revision invalidation under same URL/cache key', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/revision-test/poster_720p.webp';
  const rev1DataUrl = 'data:image/webp;base64,rev1data';
  const rev2DataUrl = 'data:image/webp;base64,rev2data';

  let encodingCount = 0;
  const env = await createPosterTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: rev1DataUrl,
      cachedAppliedPosterEncodingVersion: 1,
      cachedAppliedPosterRevision: 1
    },
    mockResolvePosterBlob: async () => new Blob(['rev2-blob']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return rev2DataUrl;
    }
  });

  // 11a: Same sourceRevision (1) -> reuse without encoding
  const res1 = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 1 });
  assert.equal(res1, rev1DataUrl);
  assert.equal(encodingCount, 0, 'Matching revision must be reused');

  // 11b: Updated sourceRevision (2) -> invalidate and re-encode
  const res2 = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 2 });
  assert.equal(res2, rev2DataUrl);
  assert.equal(encodingCount, 1, 'Updated source revision must trigger regeneration');
  assert.equal(env.storageData.cachedAppliedPosterRevision, 2);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, rev2DataUrl);
});

test('Wallpaper Poster - 12. In-flight coalescing separation with new revision or force', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/coalesce-test/poster_720p.webp';
  const dataRev1 = 'data:image/webp;base64,datarev1';
  const dataRev2 = 'data:image/webp;base64,datarev2';

  let resolveRev1;
  const holdRev1 = new Promise((resolve) => { resolveRev1 = resolve; });

  let callIndex = 0;
  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => new Blob(['blob']),
    mockCreateStartupPosterDataUrl: async () => {
      const idx = ++callIndex;
      if (idx === 1) {
        await holdRev1;
        return dataRev1;
      }
      return dataRev2;
    }
  });

  // Request 1: starts generation for revision 1 (slow)
  const p1 = env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 1 });
  await new Promise((r) => setTimeout(r, 0));

  // Request 2: arrives for the SAME URL with revision 2 (must NOT coalesce into p1)
  const p2 = env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 2 });

  // Verify p1 and p2 are distinct promises
  assert.notEqual(p1, p2, 'New revision request must NOT coalesce into obsolete in-flight work');

  // Request 2 completes with revision 2
  const res2 = await p2;
  assert.equal(res2, dataRev2);
  assert.equal(env.storageData.cachedAppliedPosterRevision, 2);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataRev2);

  // Now release slow Request 1
  resolveRev1();
  const res1 = await p1;

  // Stale Request 1 was superseded and must not corrupt revision 2
  assert.equal(res1, '');
  assert.equal(env.storageData.cachedAppliedPosterRevision, 2);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataRev2);
});

test('Wallpaper Poster - 13. Committed identity separation from pending generation identity', async () => {
  const oldUrl = 'https://pub-example.r2.dev/v/old-wallpaper/poster.webp';
  const oldDataUrl = 'data:image/webp;base64,oldvalidposter';
  const newUrl = 'https://pub-example.r2.dev/v/new-wallpaper/poster.webp';
  const newDataUrl = 'data:image/webp;base64,newvalidposter';

  let resolveNew;
  const holdNew = new Promise((resolve) => { resolveNew = resolve; });

  const env = await createPosterTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: oldUrl,
      cachedAppliedPosterDataUrl: oldDataUrl,
      cachedAppliedPosterEncodingVersion: 1
    },
    mockResolvePosterBlob: async () => new Blob(['new-blob']),
    mockCreateStartupPosterDataUrl: async () => {
      await holdNew;
      return newDataUrl;
    }
  });

  // Start generation for newUrl
  const pNew = env.context.cacheAppliedWallpaperPoster(newUrl);
  await new Promise((r) => setTimeout(r, 5));

  // WHILE GENERATION IS IN-FLIGHT:
  // Storage must NOT have been updated to newUrl yet!
  // Otherwise preload.js would see newUrl paired with oldDataUrl.
  assert.equal(
    env.storageData.cachedAppliedPosterUrl,
    oldUrl,
    'Storage URL must NOT be updated while generation is pending'
  );
  assert.equal(
    env.storageData.cachedAppliedPosterDataUrl,
    oldDataUrl,
    'Storage data URL must remain paired with old URL until new poster commits'
  );

  // Release and let new poster commit
  resolveNew();
  const res = await pNew;

  assert.equal(res, newDataUrl);
  // Now BOTH are committed together atomically
  assert.equal(env.storageData.cachedAppliedPosterUrl, newUrl);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, newDataUrl);
});

test('Wallpaper Poster - 14. Cross-tab ownership and safe failure handling', async () => {
  const urlA = 'https://pub-example.r2.dev/v/tab-race/poster.webp';
  const validDataUrlFromTab2 = 'data:image/webp;base64,validdatafromtab2';

  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async () => {
      // While resolving blob, simulate Tab 2 committing a valid poster to storage
      env.storageData.cachedAppliedPosterUrl = urlA;
      env.storageData.cachedAppliedPosterDataUrl = validDataUrlFromTab2;
      env.storageData.cachedAppliedPosterEncodingVersion = 1;
      env.storageData.cachedAppliedPosterRevision = 1;
      // Simulate failure in Tab 1
      throw new Error('Simulated network failure in Tab 1');
    }
  });

  // Tab 1 fails
  const res = await env.context.cacheAppliedWallpaperPoster(urlA, '', { sourceRevision: 1 });
  assert.equal(res, '');

  // Tab 1 failure MUST NOT have wiped out Tab 2's valid committed poster
  assert.equal(
    env.storageData.cachedAppliedPosterDataUrl,
    validDataUrlFromTab2,
    'Failed task must not wipe out a valid poster committed by another tab'
  );
});

test('Wallpaper Poster - 15. Production caller invalidation via applyWallpaperByType', async () => {
  const urlInitial = 'https://pub-example.r2.dev/v/prod-test/poster_1.webp';
  const urlUpdated = 'https://pub-example.r2.dev/v/prod-test/poster_2.webp';
  const dataUrl1 = 'data:image/webp;base64,prodposterone';
  const dataUrl2 = 'data:image/webp;base64,prodpostertwo';

  let currentBlobUrl = urlInitial;
  let encodingCount = 0;

  const env = await createPosterTestEnvironment({
    mockResolvePosterBlob: async (url) => new Blob([url]),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return currentBlobUrl === urlInitial ? dataUrl1 : dataUrl2;
    }
  });

  // Production call 1: Apply initial wallpaper
  const selection1 = {
    id: 'prod-wp-1',
    posterUrl: urlInitial,
    type: 'static',
    sourceRevision: 1
  };
  env.context.applyWallpaperByType(selection1, 'static');

  // Let idle/timeout tasks settle
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(encodingCount, 1);
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlInitial);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrl1);

  // Production call 2: Re-apply exact same selection (unchanged) -> no-op
  env.context.applyWallpaperByType(selection1, 'static');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(encodingCount, 1, 'Unchanged selection in applyWallpaperByType must not trigger poster caching');

  // Production call 3: Forced replacement with unchanged identity (same id, URL, and revision)
  const dataUrlForced = 'data:image/webp;base64,prodposterforced';
  currentBlobUrl = 'forced-blob';
  env.context.createStartupPosterDataUrl = async () => {
    encodingCount++;
    return dataUrlForced;
  };

  env.context.applyWallpaperByType(selection1, 'static', { forceRegenerate: true });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(encodingCount, 2, 'Forced replacement on unchanged identity must trigger poster generation');
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlInitial);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlForced);

  // Production call 4: Apply updated wallpaper with new URL and persistent key
  currentBlobUrl = urlUpdated;
  const selection2 = {
    id: 'prod-wp-2',
    posterUrl: urlUpdated,
    type: 'static'
  };
  env.context.applyWallpaperByType(selection2, 'static');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(encodingCount, 3, 'Updated wallpaper selection must trigger generation through production pipeline');
  assert.equal(env.storageData.cachedAppliedPosterUrl, urlUpdated);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlForced);
});

test('Wallpaper Poster - 16. Forced regeneration replaces valid cached output under same URL, revision, and version', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/force-test/poster_720p.webp';
  const oldDataUrl = 'data:image/webp;base64,oldvalidposter';
  const forcedDataUrl = 'data:image/webp;base64,newforcedposter';

  let encodingCount = 0;
  const env = await createPosterTestEnvironment({
    initialStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: oldDataUrl,
      cachedAppliedPosterEncodingVersion: 1,
      cachedAppliedPosterRevision: 'rev-stable'
    },
    mockResolvePosterBlob: async () => new Blob(['blob-data']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return forcedDataUrl;
    }
  });

  // Call with forceRegenerate: true under the exact same URL, revision, and encoding version
  const result = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', {
    sourceRevision: 'rev-stable',
    encodingVersion: 1,
    forceRegenerate: true
  });

  assert.equal(encodingCount, 1, 'Forced request must execute encoding');
  assert.equal(result, forcedDataUrl, 'Forced request must return newly generated output, not old cached output');
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, forcedDataUrl, 'Storage must commit newly generated output');
});

test('Wallpaper Poster - 17. Authoritative store separation prevents resurrecting cleared/stale mirror data', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/store-isolation/poster.webp';
  const generatedDataUrl = 'data:image/webp;base64,freshlygeneratedposter';

  let encodingCount = 0;
  const env = await createPosterTestEnvironment({
    // Authoritative extension storage has URL but dataUrl is cleared/empty
    initialStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: '',
      cachedAppliedPosterEncodingVersion: 0,
      cachedAppliedPosterRevision: 0
    },
    // localStorage contains stale mirror data that was not cleared in mock
    initialLocalStorage: {
      cachedAppliedPosterUrl: sourceUrl,
      cachedAppliedPosterDataUrl: 'data:image/webp;base64,staleResurrectedMirror',
      cachedAppliedPosterEncodingVersion: '1',
      cachedAppliedPosterRevision: '1'
    },
    mockResolvePosterBlob: async () => new Blob(['blob-content']),
    mockCreateStartupPosterDataUrl: async () => {
      encodingCount++;
      return generatedDataUrl;
    }
  });

  // cacheAppliedWallpaperPoster must inspect authoritative extension storage and see dataUrl is missing.
  // It must NOT resurrect dataUrl from localStorage!
  const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { encodingVersion: 1 });

  assert.equal(encodingCount, 1, 'Missing dataUrl in authoritative storage must trigger generation, not resurrect mirror');
  assert.equal(res, generatedDataUrl);
  assert.equal(env.storageData.cachedAppliedPosterDataUrl, generatedDataUrl);
  assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, generatedDataUrl);
});

test('Wallpaper Poster - 18. Opaque string revisions: normal sequential update vs intervening conflict', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/opaque-rev/poster.webp';
  const dataUrlInitial = 'data:image/webp;base64,revAlpha';
  const dataUrlNext = 'data:image/webp;base64,revBeta';

  // 18a: Normal sequential update with opaque string revisions ('rev-alpha' -> 'rev-beta')
  {
    let encodingCount = 0;
    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: sourceUrl,
        cachedAppliedPosterDataUrl: dataUrlInitial,
        cachedAppliedPosterEncodingVersion: 1,
        cachedAppliedPosterRevision: 'rev-alpha'
      },
      mockResolvePosterBlob: async () => new Blob(['blob-next']),
      mockCreateStartupPosterDataUrl: async () => {
        encodingCount++;
        return dataUrlNext;
      }
    });

    const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 'rev-beta' });
    assert.equal(encodingCount, 1);
    assert.equal(res, dataUrlNext);
    assert.equal(env.storageData.cachedAppliedPosterRevision, 'rev-beta');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlNext);
  }

  // 18b: Intervening change conflict: another tab commits 'rev-gamma' during encoding
  {
    const dataUrlIntervening = 'data:image/webp;base64,revGammaFromTab2';

    const env = await createPosterTestEnvironment({
      initialStorage: {
        cachedAppliedPosterUrl: sourceUrl,
        cachedAppliedPosterDataUrl: dataUrlInitial,
        cachedAppliedPosterEncodingVersion: 1,
        cachedAppliedPosterRevision: 'rev-alpha'
      },
      mockResolvePosterBlob: async () => new Blob(['blob-next']),
      mockCreateStartupPosterDataUrl: async () => {
        // While Tab 1 is encoding rev-beta, simulate Tab 2 committing rev-gamma
        env.storageData.cachedAppliedPosterRevision = 'rev-gamma';
        env.storageData.cachedAppliedPosterDataUrl = dataUrlIntervening;
        return dataUrlNext;
      }
    });

    const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl, '', { sourceRevision: 'rev-beta' });
    assert.equal(res, '', 'Intervening revision change must cause stale task to abort');
    assert.equal(env.storageData.cachedAppliedPosterRevision, 'rev-gamma', 'Tab 2 rev-gamma must NOT be overwritten');
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrlIntervening);
  }
});

test('Wallpaper Poster - 19. Persistence outcome handling and partial mirror failure invalidation', async () => {
  const sourceUrl = 'https://pub-example.r2.dev/v/persist-test/poster.webp';
  const dataUrl = 'data:image/webp;base64,validdata';

  // 19a: Authoritative storage write failure must not update mirrors or report success
  {
    const env = await createPosterTestEnvironment({
      mockResolvePosterBlob: async () => new Blob(['blob']),
      mockCreateStartupPosterDataUrl: async () => dataUrl
    });

    // Simulate authoritative storage failure
    env.storageMock.shouldFailSet = true;

    const res = await env.context.cacheAppliedWallpaperPoster(sourceUrl);
    assert.equal(res, '', 'Failed authoritative write must return empty string');
    assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined, 'Mirrors must NOT be updated after authoritative failure');
  }

  // 19b: Partial localStorage failure invalidates preload image mirror
  {
    const env = await createPosterTestEnvironment();

    // Prepare localStorage with existing valid mirror
    env.localStorageData.cachedAppliedPosterUrl = 'https://old.url/poster.webp';
    env.localStorageData.cachedAppliedPosterDataUrl = 'data:image/webp;base64,oldmirror';

    // Simulate localStorage quota error when writing cachedAppliedPosterUrl
    const originalSetItem = env.context.localStorage.setItem;
    env.context.localStorage.setItem = (k, v) => {
      if (k === 'cachedAppliedPosterUrl') {
        throw new Error('QuotaExceededError: simulated localStorage full');
      }
      originalSetItem(k, v);
    };

    const bundleSuccess = await env.context.HomebaseWallpaperStorage.setCachedAppliedPosterBundle({
      url: sourceUrl,
      dataUrl,
      encodingVersion: 1,
      revision: 'rev-1'
    });

    // Authoritative write succeeded
    assert.equal(bundleSuccess, true);
    assert.equal(env.storageData.cachedAppliedPosterUrl, sourceUrl);
    assert.equal(env.storageData.cachedAppliedPosterDataUrl, dataUrl);

    // BUT localStorage mirror failed partway -> must be invalidated completely
    assert.equal(env.localStorageData.cachedAppliedPosterDataUrl, undefined, 'Partial mirror failure must invalidate dataUrl mirror');
    assert.equal(env.localStorageData.cachedAppliedPosterUrl, undefined, 'Partial mirror failure must invalidate url mirror');
  }
});

