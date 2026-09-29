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
      mockCacheStorage.set(key, res);
      return true;
    },
    delete: async (key) => mockCacheStorage.delete(key)
  };

  const sandbox = {
    console,
    window: null,
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
