import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pipelineScriptPath = path.join(rootDir, 'src/newtab/core/favicon-pipeline.js');
const pipelineScriptCode = fs.readFileSync(pipelineScriptPath, 'utf8');

function createPipelineTestEnvironment(options = {}) {
  const {
    isOnline = true,
    hasObserver = true,
    hasCaches = true
  } = options;

  const revokedUrls = [];
  const createdUrls = [];
  let urlCounter = 0;

  const observedElements = new Set();
  let observerCallback = null;

  class MockIntersectionObserver {
    constructor(callback, opts) {
      observerCallback = callback;
      this.options = opts;
    }
    observe(el) {
      observedElements.add(el);
    }
    unobserve(el) {
      observedElements.delete(el);
    }
    disconnect() {
      observedElements.clear();
      observerCallback = null;
    }
  }

  const mockCacheStorage = new Map();
  const mockCache = {
    match: async (key) => mockCacheStorage.get(key) || null,
    put: async (key, res) => {
      if (typeof key === 'string' && !key.startsWith('http:') && !key.startsWith('https:')) {
        throw new TypeError("Request scheme 'chrome-extension' is unsupported");
      }
      mockCacheStorage.set(key, res);
      return true;
    },
    delete: async (key) => mockCacheStorage.delete(key)
  };

  class MockResponse {
    constructor(blob, init = {}) {
      this.blobData = blob || { size: 100 };
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
    }
    async blob() {
      return this.blobData;
    }
    clone() {
      return new MockResponse(this.blobData, { status: this.status });
    }
  }

  const sandbox = {
    console,
    window: null,
    Response: MockResponse,
    navigator: {
      onLine: isOnline
    },
    URL: class MockURL extends URL {
      static createObjectURL(blob) {
        urlCounter += 1;
        const u = `blob:http://localhost/${urlCounter}`;
        createdUrls.push(u);
        return u;
      }
      static revokeObjectURL(u) {
        revokedUrls.push(u);
      }
    },
    caches: hasCaches ? {
      open: async () => mockCache
    } : undefined
  };

  if (hasObserver) {
    sandbox.IntersectionObserver = MockIntersectionObserver;
  }

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(pipelineScriptCode, context);

  return {
    sandbox,
    context,
    revokedUrls,
    createdUrls,
    observedElements,
    mockCacheStorage,
    MockResponse,
    triggerIntersection: (entries) => {
      if (observerCallback) {
        observerCallback(entries);
      }
    }
  };
}

// -------------------------------------------------------------
// 1. Controller Export & API Surface
// -------------------------------------------------------------
test('favicon-pipeline: controller is exported on window.HomebaseFaviconPipeline', () => {
  const env = createPipelineTestEnvironment();
  const controller = env.sandbox.HomebaseFaviconPipeline;

  assert.ok(controller, 'window.HomebaseFaviconPipeline must exist');
  assert.equal(typeof controller.initialize, 'function');
  assert.equal(typeof controller.destroy, 'function');
  assert.equal(typeof controller.isValidTargetUrl, 'function');
  assert.equal(typeof controller.getDomainKey, 'function');
  assert.equal(typeof controller.buildCandidates, 'function');
  assert.equal(typeof controller.resolveForImageTarget, 'function');
  assert.equal(typeof controller.getUrlForRawUrl, 'function');
  assert.equal(typeof controller.queueResolution, 'function');
  assert.equal(typeof controller.setObjectUrlForImage, 'function');
  assert.equal(typeof controller.revokeObjectUrl, 'function');
  assert.equal(typeof controller.setImageSrc, 'function');
  assert.equal(typeof controller.loadObjectUrlIntoImage, 'function');
  assert.equal(typeof controller.testCandidateUrl, 'function');
  assert.equal(typeof controller.testCandidateObjectUrl, 'function');
  assert.equal(typeof controller.enqueueTask, 'function');
  assert.equal(typeof controller.runNextTask, 'function');
  assert.equal(typeof controller.ensureObserver, 'function');
  assert.equal(typeof controller.getResolvedEntry, 'function');
  assert.equal(typeof controller.setResolvedEntry, 'function');
  assert.equal(typeof controller.getResolvedUrl, 'function');
  assert.equal(typeof controller.clearResolvedCache, 'function');
  assert.equal(typeof controller.getState, 'function');
});

test('favicon-pipeline: backward compatibility aliases exist', () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  assert.equal(c.isValidFaviconTargetUrl, c.isValidTargetUrl);
  assert.equal(c.getDomainKeyFromUrl, c.getDomainKey);
  assert.equal(c.buildFaviconCandidates, c.buildCandidates);
  assert.equal(c.resolveFaviconForImageTarget, c.resolveForImageTarget);
  assert.equal(c.getFaviconUrlForRawUrl, c.getUrlForRawUrl);
  assert.equal(c.queueFaviconResolution, c.queueResolution);
  assert.equal(c.setFaviconObjectUrlForImage, c.setObjectUrlForImage);
  assert.equal(c.revokeFaviconObjectUrl, c.revokeObjectUrl);
  assert.equal(c.setFaviconImageSrc, c.setImageSrc);
  assert.equal(c.loadFaviconObjectUrlIntoImage, c.loadObjectUrlIntoImage);
  assert.equal(c.testFaviconCandidateUrl, c.testCandidateUrl);
  assert.equal(c.testFaviconCandidateObjectUrl, c.testCandidateObjectUrl);
  assert.equal(c.enqueueFaviconTask, c.enqueueTask);
  assert.equal(c.runNextFaviconTask, c.runNextTask);
  assert.equal(c.ensureFaviconObserver, c.ensureObserver);
  assert.equal(c.getFaviconResolvedEntry, c.getResolvedEntry);
  assert.equal(c.setFaviconResolved, c.setResolvedEntry);
  assert.equal(c.getFaviconResolvedUrl, c.getResolvedUrl);
});

// -------------------------------------------------------------
// 2. URL Validation & Domain Extraction
// -------------------------------------------------------------
test('favicon-pipeline: isValidTargetUrl validates HTTP/HTTPS URLs and rejects invalid schemes', () => {
  const c = createPipelineTestEnvironment().sandbox.HomebaseFaviconPipeline;

  // Valid
  assert.equal(c.isValidTargetUrl('https://github.com/path?foo=bar'), true);
  assert.equal(c.isValidTargetUrl('http://sub.domain.example.org:8080/'), true);

  // Invalid protocols
  assert.equal(c.isValidTargetUrl('javascript:alert(1)'), false);
  assert.equal(c.isValidTargetUrl('file:///c:/path/to/file'), false);
  assert.equal(c.isValidTargetUrl('chrome://extensions'), false);
  assert.equal(c.isValidTargetUrl('about:blank'), false);
  assert.equal(c.isValidTargetUrl('data:text/html,test'), false);

  // Invalid hosts
  assert.equal(c.isValidTargetUrl('http://localhost:3000'), false);
  assert.equal(c.isValidTargetUrl('http://singleword/'), false);
  assert.equal(c.isValidTargetUrl('https://trailingdot./'), false);
  assert.equal(c.isValidTargetUrl(''), false);
  assert.equal(c.isValidTargetUrl(null), false);
  assert.equal(c.isValidTargetUrl(undefined), false);
  assert.equal(c.isValidTargetUrl(123), false);
});

test('favicon-pipeline: getDomainKey extracts lowercase hostnames', () => {
  const c = createPipelineTestEnvironment().sandbox.HomebaseFaviconPipeline;

  assert.equal(c.getDomainKey('https://WWW.GitHub.COM/time2shine'), 'www.github.com');
  assert.equal(c.getDomainKey('http://Example.Org:8080/path'), 'example.org');
  assert.equal(c.getDomainKey('invalid-url'), '');
  assert.equal(c.getDomainKey(''), '');
});

// -------------------------------------------------------------
// 3. Candidate URL Generation
// -------------------------------------------------------------
test('favicon-pipeline: buildCandidates generates gstatic and googleS2 candidates with origin', () => {
  const c = createPipelineTestEnvironment().sandbox.HomebaseFaviconPipeline;

  const candidates = c.buildCandidates('https://news.ycombinator.com/item?id=123', 48);
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0].startsWith('https://t2.gstatic.com/faviconV2?client=SOCIAL'));
  assert.ok(candidates[0].includes(encodeURIComponent('https://news.ycombinator.com')));
  assert.ok(candidates[0].includes('size=48'));

  assert.ok(candidates[1].startsWith('https://www.google.com/s2/favicons?sz=48'));
  assert.ok(candidates[1].includes(encodeURIComponent('https://news.ycombinator.com')));

  // Size parameter
  const smallCandidates = c.buildCandidates('https://google.com', 16);
  assert.ok(smallCandidates[0].includes('size=16'));
  assert.ok(smallCandidates[1].includes('sz=16'));

  // Invalid URL returns empty array
  assert.equal(c.buildCandidates('invalid').length, 0);
});

// -------------------------------------------------------------
// 4. In-Memory Resolved Cache Management
// -------------------------------------------------------------
test('favicon-pipeline: in-memory resolved cache set, get, limit, and clear', () => {
  const c = createPipelineTestEnvironment().sandbox.HomebaseFaviconPipeline;

  c.setResolvedEntry('example.com', 'https://example.com/favicon.ico', { cached: true, cacheKey: '/favicons/example.com@48' });
  const entry = c.getResolvedEntry('example.com');
  assert.ok(entry);
  assert.equal(entry.url, 'https://example.com/favicon.ico');
  assert.equal(entry.cached, true);
  assert.equal(entry.cacheKey, '/favicons/example.com@48');
  assert.equal(c.getResolvedUrl('example.com'), 'https://example.com/favicon.ico');

  // Cache limit pruning (limit is 300)
  for (let i = 1; i <= 305; i += 1) {
    c.setResolvedEntry(`domain${i}.com`, `https://domain${i}.com/icon.ico`);
  }
  const state = c.getState();
  assert.equal(state.resolvedCacheSize, 300);
  assert.equal(c.getResolvedEntry('domain1.com'), null); // Evicted
  assert.ok(c.getResolvedEntry('domain305.com')); // Present

  c.clearResolvedCache();
  assert.equal(c.getState().resolvedCacheSize, 0);
  assert.equal(c.getResolvedEntry('domain305.com'), null);
});

// -------------------------------------------------------------
// 5. Object URL Lifecycle & Image DOM Helpers
// -------------------------------------------------------------
test('favicon-pipeline: setObjectUrlForImage sets dataset and revokes previous object URL', () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  const img = {
    dataset: {},
    src: ''
  };

  c.setObjectUrlForImage(img, 'blob:http://localhost/first');
  assert.equal(img.src, 'blob:http://localhost/first');
  assert.equal(img.dataset.faviconObjectUrl, 'blob:http://localhost/first');
  assert.equal(env.revokedUrls.length, 0);

  // Overwrite with second object URL
  c.setObjectUrlForImage(img, 'blob:http://localhost/second');
  assert.equal(img.src, 'blob:http://localhost/second');
  assert.equal(img.dataset.faviconObjectUrl, 'blob:http://localhost/second');
  assert.deepEqual(env.revokedUrls, ['blob:http://localhost/first']);

  // Revoke explicitly
  c.revokeObjectUrl(img);
  assert.equal(img.dataset.faviconObjectUrl, undefined);
  assert.deepEqual(env.revokedUrls, ['blob:http://localhost/first', 'blob:http://localhost/second']);
});

test('favicon-pipeline: setImageSrc clears previous object URL and assigns new src', () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  const img = {
    dataset: { faviconObjectUrl: 'blob:http://localhost/active' },
    src: 'blob:http://localhost/active'
  };

  c.setImageSrc(img, 'https://cdn.example.com/favicon.png');
  assert.equal(img.src, 'https://cdn.example.com/favicon.png');
  assert.equal(img.dataset.faviconObjectUrl, undefined);
  assert.deepEqual(env.revokedUrls, ['blob:http://localhost/active']);
});

// -------------------------------------------------------------
// 6. Task Queue & Concurrency Limiting
// -------------------------------------------------------------
test('favicon-pipeline: task queue respects MAX_CONCURRENT_FAVICON_TASKS limit of 6', async () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  let activeCountMax = 0;
  let runningTasks = 0;
  const resolvers = [];

  const makeTask = (id) => () => new Promise((resolve) => {
    runningTasks += 1;
    if (runningTasks > activeCountMax) {
      activeCountMax = runningTasks;
    }
    resolvers.push(() => {
      runningTasks -= 1;
      resolve(id);
    });
  });

  const promises = [];
  for (let i = 0; i < 10; i += 1) {
    promises.push(c.enqueueTask(makeTask(i)));
  }

  // Check state: 6 active, 4 queued
  const stateInitial = c.getState();
  assert.equal(stateInitial.taskActiveCount, 6);
  assert.equal(stateInitial.taskQueueLength, 4);

  // Allow tasks to begin execution
  await new Promise((r) => setImmediate(r));
  assert.equal(activeCountMax, 6);

  // Resolve 3 tasks
  resolvers.shift()();
  resolvers.shift()();
  resolvers.shift()();

  // Allow microtasks to execute
  await new Promise((r) => setImmediate(r));

  assert.equal(c.getState().taskActiveCount, 6);
  assert.equal(c.getState().taskQueueLength, 1);

  // Resolve all remaining
  while (resolvers.length > 0) {
    resolvers.shift()();
    await new Promise((r) => setImmediate(r));
  }

  const results = await Promise.all(promises);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(c.getState().taskActiveCount, 0);
  assert.equal(c.getState().taskQueueLength, 0);
  assert.equal(activeCountMax, 6);
});

// -------------------------------------------------------------
// 7. Observer & Lazy Hydration Lifecycle
// -------------------------------------------------------------
test('favicon-pipeline: queueResolution uses IntersectionObserver and unobserves upon trigger', () => {
  const env = createPipelineTestEnvironment({ hasObserver: true });
  const c = env.sandbox.HomebaseFaviconPipeline;

  let executed = false;
  const img = { tagName: 'IMG' };

  c.queueResolution(img, () => {
    executed = true;
  });

  assert.equal(executed, false);
  assert.ok(env.observedElements.has(img));

  // Trigger intersection
  env.triggerIntersection([{ target: img, isIntersecting: true }]);

  assert.equal(executed, true);
  assert.ok(!env.observedElements.has(img));
});

test('favicon-pipeline: queueResolution executes immediately if IntersectionObserver is unavailable', () => {
  const env = createPipelineTestEnvironment({ hasObserver: false });
  const c = env.sandbox.HomebaseFaviconPipeline;

  let executed = false;
  const img = { tagName: 'IMG' };

  c.queueResolution(img, () => {
    executed = true;
  });

  assert.equal(executed, true);
});

test('favicon-pipeline: destroy cleans up observer, queues, and caches', () => {
  const env = createPipelineTestEnvironment({ hasObserver: true });
  const c = env.sandbox.HomebaseFaviconPipeline;

  c.setResolvedEntry('example.com', 'https://example.com/icon.ico');
  c.ensureObserver();
  assert.equal(c.getState().resolvedCacheSize, 1);
  assert.equal(c.getState().hasObserver, true);

  c.destroy();

  const state = c.getState();
  assert.equal(state.resolvedCacheSize, 0);
  assert.equal(state.taskQueueLength, 0);
  assert.equal(state.taskActiveCount, 0);
  assert.equal(state.hasObserver, false);
});

// -------------------------------------------------------------
// 8. Offline & Negative Cache Fallback Behavior
// -------------------------------------------------------------
test('favicon-pipeline: resolveForImageTarget triggers onFailed when domainKey is missing', async () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  let failed = false;
  await c.resolveForImageTarget({
    img: {},
    domainKey: '',
    candidates: ['https://example.com/icon.ico'],
    onFailed: () => { failed = true; }
  });

  assert.equal(failed, true);
});

test('favicon-pipeline: resolveForImageTarget triggers onNegativeCacheHit when offline', async () => {
  const env = createPipelineTestEnvironment({ isOnline: false });
  const c = env.sandbox.HomebaseFaviconPipeline;

  let negativeHit = false;
  await c.resolveForImageTarget({
    img: {},
    domainKey: 'offline-test.com',
    candidates: ['https://offline-test.com/icon.ico'],
    onNegativeCacheHit: () => { negativeHit = true; }
  });

  assert.equal(negativeHit, true);
});

test('favicon-pipeline: resolveForImageTarget immediately resolves from in-memory cache if available', async () => {
  const env = createPipelineTestEnvironment({ isOnline: true });
  const c = env.sandbox.HomebaseFaviconPipeline;

  c.setResolvedEntry('cached-domain.com', 'https://cached-domain.com/fav.png');

  let resolvedUrl = null;
  let resolvedOpts = null;
  await c.resolveForImageTarget({
    img: {},
    domainKey: 'cached-domain.com',
    candidates: ['https://cached-domain.com/fav.png'],
    onResolved: (url, opts) => {
      resolvedUrl = url;
      resolvedOpts = opts;
    }
  });

  assert.equal(resolvedUrl, 'https://cached-domain.com/fav.png');
  assert.equal(resolvedOpts.fromCache, true);
});

test('favicon-pipeline: cacheKeyFor generates valid https URL key and normalizes legacy keys', () => {
  const c = createPipelineTestEnvironment().sandbox.HomebaseFaviconPipeline;

  const key = c.cacheKeyFor('google.com', 48);
  assert.equal(key, 'https://favicons.homebase.local/google.com@48');
  assert.ok(key.startsWith('https://'));

  const normalizedLegacy = c.normalizeCacheKey('/favicons/google.com@48');
  assert.equal(normalizedLegacy, 'https://favicons.homebase.local/google.com@48');

  const normalizedHttps = c.normalizeCacheKey('https://example.com/icon.png');
  assert.equal(normalizedHttps, 'https://example.com/icon.png');
});

test('favicon-pipeline: writeIconToCache enforces HTTP(S) scheme and writes to cache without throwing', async () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  const key = c.cacheKeyFor('google.com', 48);
  const resp = new env.MockResponse({ size: 100 }, { status: 200 });

  const success = await c.writeIconToCache(key, resp);
  assert.equal(success, true);
  assert.ok(env.mockCacheStorage.has(key));

  const cached = await c.readIconFromCache(key);
  assert.ok(cached);
});

test('favicon-pipeline: persistent cache hit after a fresh page instance while offline', async () => {
  const env = createPipelineTestEnvironment({ isOnline: false });
  const c = env.sandbox.HomebaseFaviconPipeline;

  // Verify in-memory cache is NOT warmed (fresh instance)
  assert.equal(c.getResolvedEntry('google.com'), null);

  // Pre-populate persistent CacheStorage with a cached response
  const key = c.cacheKeyFor('google.com', 48);
  env.mockCacheStorage.set(key, new env.MockResponse({ size: 256 }, { status: 200 }));

  let resolvedUrl = null;
  let resolvedMeta = null;
  let negativeHit = false;
  let failed = false;

  const img = {
    dataset: {},
    complete: true,
    naturalWidth: 48
  };

  await c.resolveForImageTarget({
    img,
    domainKey: 'google.com',
    candidates: ['https://t2.gstatic.com/faviconV2?url=https%3A%2F%2Fgoogle.com&size=48'],
    onResolved: (url, meta) => {
      resolvedUrl = url;
      resolvedMeta = meta;
    },
    onNegativeCacheHit: () => { negativeHit = true; },
    onFailed: () => { failed = true; }
  });

  assert.ok(resolvedUrl && resolvedUrl.startsWith('blob:'));
  assert.equal(resolvedMeta.fromCache, true);
  assert.equal(resolvedMeta.sourceAlreadySet, true);
  assert.equal(negativeHit, false);
  assert.equal(failed, false);
});

test('favicon-pipeline: offline cache miss triggers onNegativeCacheHit and records negative cache', async () => {
  const env = createPipelineTestEnvironment({ isOnline: false });
  const c = env.sandbox.HomebaseFaviconPipeline;

  // Fresh instance, cache is empty
  assert.equal(c.getResolvedEntry('uncached.com'), null);

  let negativeHit = false;
  let resolvedUrl = null;

  await c.resolveForImageTarget({
    img: { dataset: {} },
    domainKey: 'uncached.com',
    candidates: ['https://t2.gstatic.com/faviconV2?url=https%3A%2F%2Funcached.com&size=48'],
    onResolved: (url) => { resolvedUrl = url; },
    onNegativeCacheHit: () => { negativeHit = true; }
  });

  assert.equal(resolvedUrl, null);
  assert.equal(negativeHit, true);
  // Negative cache was populated for the domain
  assert.ok(c.getState().negativeCacheSize > 0);
});

test('favicon-pipeline: unusable cached icon while offline revokes object URL and falls back', async () => {
  const env = createPipelineTestEnvironment({ isOnline: false });
  const c = env.sandbox.HomebaseFaviconPipeline;

  // Pre-populate persistent cache with a response for a domain
  const key = c.cacheKeyFor('corrupted.com', 48);
  env.mockCacheStorage.set(key, new env.MockResponse({ size: 10 }, { status: 200 }));

  let resolvedUrl = null;
  let negativeHit = false;

  const img = {
    dataset: {},
    complete: true,
    naturalWidth: 2 // too small, rejected by acceptCandidate
  };

  await c.resolveForImageTarget({
    img,
    domainKey: 'corrupted.com',
    candidates: ['https://t2.gstatic.com/faviconV2?url=https%3A%2F%2Fcorrupted.com&size=48'],
    acceptCandidate: (testImg) => testImg.naturalWidth >= 6,
    onResolved: (url) => { resolvedUrl = url; },
    onNegativeCacheHit: () => { negativeHit = true; }
  });

  assert.equal(resolvedUrl, null);
  assert.equal(negativeHit, true);
  // Confirms the unusable object URL was revoked
  assert.ok(env.revokedUrls.length > 0);
});

test('favicon-pipeline: isLocalOrPrivateHost classifies local, private IPv4/IPv6, intranet, and public near-matches', () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  // Reported URL and host
  assert.equal(c.isLocalOrPrivateHost('http://192.168.0.160:1111/'), true);
  assert.equal(c.isLocalOrPrivateHost('192.168.0.160'), true);
  assert.equal(c.isLocalOrPrivateHost('http://192.168.1.1/'), true);

  // Private IPv4 ranges
  assert.equal(c.isLocalOrPrivateHost('10.0.0.1'), true);
  assert.equal(c.isLocalOrPrivateHost('http://10.255.255.255:8080/path'), true);
  assert.equal(c.isLocalOrPrivateHost('172.16.0.1'), true);
  assert.equal(c.isLocalOrPrivateHost('172.31.255.255'), true);
  assert.equal(c.isLocalOrPrivateHost('192.168.100.5'), true);
  assert.equal(c.isLocalOrPrivateHost('127.0.0.1'), true);
  assert.equal(c.isLocalOrPrivateHost('http://127.0.0.2:3000'), true);
  assert.equal(c.isLocalOrPrivateHost('169.254.1.1'), true);
  assert.equal(c.isLocalOrPrivateHost('0.0.0.0'), true);
  assert.equal(c.isLocalOrPrivateHost('100.64.0.1'), true);
  assert.equal(c.isLocalOrPrivateHost('100.127.255.255'), true);
  assert.equal(c.isLocalOrPrivateHost('192.0.2.1'), true);
  assert.equal(c.isLocalOrPrivateHost('198.51.100.1'), true);
  assert.equal(c.isLocalOrPrivateHost('203.0.113.1'), true);
  assert.equal(c.isLocalOrPrivateHost('224.0.0.1'), true);
  assert.equal(c.isLocalOrPrivateHost('255.255.255.255'), true);

  // Non-decimal / URL-normalized representations
  assert.equal(c.isLocalOrPrivateHost('127.1'), true);
  assert.equal(c.isLocalOrPrivateHost('2130706433'), true);
  assert.equal(c.isLocalOrPrivateHost('http://127.1'), true);

  // Public IPv4 near-matches (MUST be false)
  assert.equal(c.isLocalOrPrivateHost('192.169.0.1'), false);
  assert.equal(c.isLocalOrPrivateHost('172.15.255.255'), false);
  assert.equal(c.isLocalOrPrivateHost('172.32.0.1'), false);
  assert.equal(c.isLocalOrPrivateHost('100.63.255.255'), false);
  assert.equal(c.isLocalOrPrivateHost('100.128.0.0'), false);
  assert.equal(c.isLocalOrPrivateHost('8.8.8.8'), false);
  assert.equal(c.isLocalOrPrivateHost('1.1.1.1'), false);
  assert.equal(c.isLocalOrPrivateHost('http://93.184.216.34/'), false);

  // Localhost & subdomains
  assert.equal(c.isLocalOrPrivateHost('localhost'), true);
  assert.equal(c.isLocalOrPrivateHost('http://localhost:3000'), true);
  assert.equal(c.isLocalOrPrivateHost('app.localhost'), true);
  assert.equal(c.isLocalOrPrivateHost('sub.domain.localhost'), true);

  // Public domains containing localhost/local (MUST be false)
  assert.equal(c.isLocalOrPrivateHost('localhost.example.com'), false);
  assert.equal(c.isLocalOrPrivateHost('mylocalhost.com'), false);
  assert.equal(c.isLocalOrPrivateHost('notlocalhost.org'), false);
  assert.equal(c.isLocalOrPrivateHost('local.com'), false);
  assert.equal(c.isLocalOrPrivateHost('mylocal.net'), false);
  assert.equal(c.isLocalOrPrivateHost('google.com'), false);
  assert.equal(c.isLocalOrPrivateHost('github.com'), false);

  // .local mDNS names and single-label intranet names
  assert.equal(c.isLocalOrPrivateHost('printer.local'), true);
  assert.equal(c.isLocalOrPrivateHost('my-nas.local'), true);
  assert.equal(c.isLocalOrPrivateHost('local'), true);
  assert.equal(c.isLocalOrPrivateHost('router'), true);
  assert.equal(c.isLocalOrPrivateHost('nas'), true);
  assert.equal(c.isLocalOrPrivateHost('http://intranet:8080/dashboard'), true);

  // IPv6 local, link-local, and ULA
  assert.equal(c.isLocalOrPrivateHost('http://[::1]:8080/'), true);
  assert.equal(c.isLocalOrPrivateHost('[::1]'), true);
  assert.equal(c.isLocalOrPrivateHost('::1'), true);
  assert.equal(c.isLocalOrPrivateHost('[::]'), true);
  assert.equal(c.isLocalOrPrivateHost('http://[fe80::1ff:fe23:4567:890a]/'), true);
  assert.equal(c.isLocalOrPrivateHost('fe80::1'), true);
  assert.equal(c.isLocalOrPrivateHost('febf::1'), true);
  assert.equal(c.isLocalOrPrivateHost('fc00::1'), true);
  assert.equal(c.isLocalOrPrivateHost('fdff::1'), true);
  assert.equal(c.isLocalOrPrivateHost('fd12:3456:789a::1'), true);

  // IPv6 prefix boundary regression tests (classification tests; negative examples are not claimed reachable)
  assert.equal(c.isLocalOrPrivateHost('fc::1'), false, 'fc::1 (short group 00fc) must not match fc00::/7');
  assert.equal(c.isLocalOrPrivateHost('fd::1'), false, 'fd::1 (short group 00fd) must not match fc00::/7');
  assert.equal(c.isLocalOrPrivateHost('fe8::1'), false, 'fe8::1 (short group 0fe8) must not match fe80::/10');
  assert.equal(c.isLocalOrPrivateHost('fec0::1'), false, 'fec0::1 must not match the fe80-febf link-local range');

  // IPv4-mapped IPv6
  assert.equal(c.isLocalOrPrivateHost('http://[::ffff:192.168.0.160]:1111/'), true);
  assert.equal(c.isLocalOrPrivateHost('[::ffff:192.168.0.160]'), true);
  assert.equal(c.isLocalOrPrivateHost('::ffff:192.168.0.160'), true);
  assert.equal(c.isLocalOrPrivateHost('[::ffff:c0a8:a0]'), true);
  assert.equal(c.isLocalOrPrivateHost('http://[::ffff:7f00:1]:3000/'), true);
  assert.equal(c.isLocalOrPrivateHost('[::ffff:7f00:1]'), true);
  assert.equal(c.isLocalOrPrivateHost('http://[::ffff:8.8.8.8]/'), false);
  assert.equal(c.isLocalOrPrivateHost('[::ffff:808:808]'), false);

  // Public IPv6 (MUST be false)
  assert.equal(c.isLocalOrPrivateHost('http://[2001:4860:4860::8888]/'), false);
  assert.equal(c.isLocalOrPrivateHost('2606:4700:4700::1111'), false);
  assert.equal(c.isLocalOrPrivateHost('[2607:f8b0:4005:805::200e]'), false);
});

test('favicon-pipeline: isValidTargetUrl, getDomainKey, and buildCandidates reject local and private targets', async () => {
  const env = createPipelineTestEnvironment();
  const c = env.sandbox.HomebaseFaviconPipeline;

  const localUrls = [
    'http://192.168.0.160:1111/',
    'http://127.0.0.1:8080/app',
    'http://10.0.0.1/admin',
    'http://172.16.0.1/',
    'http://localhost:3000',
    'http://printer.local/',
    'http://router/login'
  ];

  for (const url of localUrls) {
    assert.equal(c.isValidTargetUrl(url), false, `isValidTargetUrl should be false for ${url}`);
    assert.equal(c.getDomainKey(url), '', `getDomainKey should be empty for ${url}`);
    assert.equal(c.buildCandidates(url).length, 0, `buildCandidates should be empty for ${url}`);
    const resolvedUrl = await c.getUrlForRawUrl(url);
    assert.equal(resolvedUrl, null, `getUrlForRawUrl should return null for ${url}`);
  }

  // Public sites remain valid and generate candidate provider URLs
  const publicUrl = 'https://example.com/page';
  assert.equal(c.isValidTargetUrl(publicUrl), true);
  assert.equal(c.getDomainKey(publicUrl), 'example.com');
  const candidates = c.buildCandidates(publicUrl);
  assert.ok(candidates.length > 0);
  assert.ok(candidates[0].includes('t2.gstatic.com'));
});

test('favicon-pipeline: resolveForImageTarget bypasses cached provider placeholders for local/private targets', async () => {
  const env = createPipelineTestEnvironment({ isOnline: true });
  const c = env.sandbox.HomebaseFaviconPipeline;

  // Simulate an old cached Google globe icon previously written for 192.168.0.160
  const legacyCacheKey = c.cacheKeyFor('192.168.0.160', 48);
  env.mockCacheStorage.set(legacyCacheKey, new env.MockResponse({ size: 128 }, { status: 200 }));
  c.setResolvedEntry('192.168.0.160', 'https://t2.gstatic.com/faviconV2?url=http%3A%2F%2F192.168.0.160%3A1111', {
    cached: true,
    cacheKey: legacyCacheKey
  });

  let onResolvedCalled = false;
  let onFailedCalled = false;
  const img = {
    dataset: {},
    src: '',
    complete: true,
    naturalWidth: 16
  };

  await c.resolveForImageTarget({
    img,
    domainKey: '192.168.0.160',
    candidates: ['https://t2.gstatic.com/faviconV2?url=http%3A%2F%2F192.168.0.160%3A1111&size=48'],
    onResolved: () => { onResolvedCalled = true; },
    onFailed: () => { onFailedCalled = true; },
    onNegativeCacheHit: () => {}
  });

  // Must NOT resolve or load the old cached globe
  assert.equal(onResolvedCalled, false, 'onResolved must NOT be called for private IP');
  assert.equal(onFailedCalled, true, 'onFailed must be called immediately');
  assert.equal(img.src, '', 'img.src must not be populated with remote or cached URL');
});

test('favicon-pipeline: recycled bookmark tile displays stable letter fallback for local/private address', () => {
  // Load bookmark-grid-controller into sandbox
  const env = createPipelineTestEnvironment();
  const gridScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-grid-controller.js');
  const gridScriptCode = fs.readFileSync(gridScriptPath, 'utf8');

  // Set up mock DOM elements
  class MockDOMElement {
    constructor(tagName, className = '') {
      this.tagName = tagName.toUpperCase();
      this.className = className;
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.style = {};
      this.textContent = '';
      this._classList = new Set(className ? className.split(/\s+/).filter(Boolean) : []);
      this.classList = {
        add: (...cls) => cls.forEach(c => this._classList.add(c)),
        remove: (...cls) => cls.forEach(c => this._classList.delete(c)),
        contains: (c) => this._classList.has(c)
      };
    }
    appendChild(child) {
      if (child) {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    }
    querySelector(selector) {
      if (selector === '.bookmark-fallback-icon') {
        return this.children.find(c => c.className && c.className.includes('bookmark-fallback-icon')) || null;
      }
      if (selector === 'img.bookmark-img.loaded') {
        return this.children.find(c => c.tagName === 'IMG' && c.classList.contains('loaded')) || null;
      }
      return null;
    }
    querySelectorAll(selector) {
      if (selector === 'img.bookmark-img') {
        return this.children.filter(c => c.tagName === 'IMG' && (c.className.includes('bookmark-img') || c.classList.contains('bookmark-img')));
      }
      return [];
    }
    remove() {
      if (this.parentNode && this.parentNode.children) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) {
          this.parentNode.children.splice(idx, 1);
        }
      }
    }
  }

  env.sandbox.document = {
    createElement: (tag) => new MockDOMElement(tag)
  };
  env.sandbox.bookmarkMetadata = {};
  env.sandbox.appBookmarkFallbackColorPreference = '#00b8d4';

  vm.runInContext(gridScriptCode, env.context);

  const renderBookmarkIconInto = env.sandbox.renderBookmarkIconInto;
  assert.equal(typeof renderBookmarkIconInto, 'function');

  // Scenario 1: Recycled wrapper tile that previously held a loaded image from a public bookmark
  const wrapper = new MockDOMElement('div', 'bookmark-icon-wrapper');
  wrapper.dataset.iconKey = 'bookmark|https://google.com/|G||cleared:false|#00b8d4|';
  wrapper.dataset.faviconDomain = 'google.com';

  const staleImg = new MockDOMElement('img', 'bookmark-img loaded');
  staleImg.src = 'https://t2.gstatic.com/faviconV2?url=https%3A%2F%2Fgoogle.com';
  wrapper.appendChild(staleImg);

  // Now render local bookmark "192" into this recycled wrapper
  const bookmark192 = {
    id: 'bookmark-192',
    title: '192',
    url: 'http://192.168.0.160:1111/'
  };

  renderBookmarkIconInto(wrapper, bookmark192);

  // Stale image must be removed
  const remainingImages = wrapper.querySelectorAll('img.bookmark-img');
  assert.equal(remainingImages.length, 0, 'Recycled image must be removed');

  // Fallback icon must be present with class show-fallback and letter '1'
  const fallback = wrapper.querySelector('.bookmark-fallback-icon');
  assert.ok(fallback, 'Fallback element must exist');
  assert.ok(fallback.classList.contains('show-fallback'), 'show-fallback class must be active');
  assert.equal(fallback.textContent, '1', 'Fallback letter must match title first letter "1"');
  assert.equal(wrapper.style.backgroundColor, '#00b8d4', 'Fallback color must be applied');

  // Scenario 2: User sets custom icon for a local bookmark
  env.sandbox.bookmarkMetadata['bookmark-192'] = {
    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
  };

  const customWrapper = new MockDOMElement('div', 'bookmark-icon-wrapper');
  renderBookmarkIconInto(customWrapper, bookmark192);

  const customImg = customWrapper.children.find(c => c.tagName === 'IMG');
  assert.ok(customImg, 'Custom icon image must be created when metadata.icon exists');
  assert.equal(customImg.src, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
});
