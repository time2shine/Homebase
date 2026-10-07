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
const faviconCacheScriptPath = path.join(rootDir, 'src/newtab/core/favicon-cache.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const faviconCacheScriptCode = fs.readFileSync(faviconCacheScriptPath, 'utf8');

function createFaviconTestEnvironment(options = {}) {
  const {
    initialStorage = {},
    withHomebaseStorage = true,
    failStorage = false
  } = options;

  const storageData = { ...initialStorage };
  const localStorageData = {};
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

  vm.runInContext(faviconCacheScriptCode, context);

  return {
    sandbox,
    context,
    storageData,
    storageCalls
  };
}

// -------------------------------------------------------------
// Tests for getFaviconMeta & setFaviconMeta via HomebaseStorage
// -------------------------------------------------------------

test('favicon-cache: getFaviconMeta reads valid metadata via HomebaseStorage', async () => {
  const env = createFaviconTestEnvironment({
    initialStorage: {
      'fav:meta:github.com': {
        cacheKey: 'data:image/png;base64,abc',
        lastSeen: 1700000000000,
        failCount: 0,
        lastOkAt: 1700000000000
      }
    }
  });

  assert.equal(typeof env.sandbox.HomebaseStorage, 'object');
  const meta = await env.sandbox.getFaviconMeta('github.com');

  assert.ok(meta);
  assert.equal(meta.cacheKey, 'data:image/png;base64,abc');
  assert.equal(meta.failCount, 0);
  assert.equal(meta.lastOkAt, 1700000000000);
});

test('favicon-cache: setFaviconMeta persists normalized metadata via HomebaseStorage', async () => {
  const env = createFaviconTestEnvironment();

  await env.sandbox.setFaviconMeta('wikipedia.org', {
    cacheKey: 'https://wikipedia.org/favicon.ico',
    lastSeen: 1700000500000,
    failCount: 0,
    lastOkAt: 1700000500000
  });

  const stored = env.storageData['fav:meta:wikipedia.org'];
  assert.ok(stored, 'Metadata should be written to storageData');
  assert.equal(stored.cacheKey, 'https://wikipedia.org/favicon.ico');
  assert.equal(stored.failCount, 0);
  assert.equal(stored.lastSeen, 1700000500000);
});

test('favicon-cache: missing key returns null', async () => {
  const env = createFaviconTestEnvironment();

  const meta = await env.sandbox.getFaviconMeta('nonexistent-domain.org');
  assert.equal(meta, null);

  const emptyKeyMeta = await env.sandbox.getFaviconMeta('');
  assert.equal(emptyKeyMeta, null);
});

test('favicon-cache: corrupted metadata handled safely and returns null', async () => {
  const env = createFaviconTestEnvironment({
    initialStorage: {
      'fav:meta:corrupt1.com': 'not an object',
      'fav:meta:corrupt2.com': null
    }
  });

  const meta1 = await env.sandbox.getFaviconMeta('corrupt1.com');
  assert.equal(meta1, null);

  const meta2 = await env.sandbox.getFaviconMeta('corrupt2.com');
  assert.equal(meta2, null);
});

// -------------------------------------------------------------
// Tests for fallback path when HomebaseStorage is absent
// -------------------------------------------------------------

test('favicon-cache: falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createFaviconTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      'fav:meta:fallback.test': {
        cacheKey: 'cache:fallback',
        lastSeen: 1690000000000,
        failCount: 1,
        lastOkAt: 1690000000000
      }
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  // Read via fallback
  const meta = await env.sandbox.getFaviconMeta('fallback.test');
  assert.ok(meta);
  assert.equal(meta.cacheKey, 'cache:fallback');
  assert.equal(meta.failCount, 1);

  // Write via fallback
  await env.sandbox.setFaviconMeta('fallback-new.test', {
    cacheKey: 'cache:new',
    lastSeen: 1695000000000,
    failCount: 0,
    lastOkAt: 1695000000000
  });

  const written = env.storageData['fav:meta:fallback-new.test'];
  assert.ok(written);
  assert.equal(written.cacheKey, 'cache:new');
});

// -------------------------------------------------------------
// Tests for failure counters & backoff
// -------------------------------------------------------------

test('favicon-cache: bumpFaviconFail increments fail count and records timestamp', async () => {
  const env = createFaviconTestEnvironment({
    initialStorage: {
      'fav:meta:failing.com': {
        cacheKey: null,
        lastSeen: 1000,
        failCount: 2,
        lastOkAt: 0
      }
    }
  });

  const updated = await env.sandbox.bumpFaviconFail('failing.com');
  assert.ok(updated);
  assert.equal(updated.failCount, 3);
  assert.ok(updated.lastSeen > 1000);

  const stored = env.storageData['fav:meta:failing.com'];
  assert.equal(stored.failCount, 3);
});

test('favicon-cache: shouldBlockFaviconMeta blocks requests after 3 failures within retry window', () => {
  const env = createFaviconTestEnvironment();
  const now = Date.now();

  const metaBlocked = {
    failCount: 3,
    lastSeen: now - 1000, // 1 second ago (well within 24h)
    lastOkAt: 0
  };
  assert.equal(env.sandbox.shouldBlockFaviconMeta(metaBlocked), true);

  const metaAllowedFewFails = {
    failCount: 2,
    lastSeen: now - 1000,
    lastOkAt: 0
  };
  assert.equal(env.sandbox.shouldBlockFaviconMeta(metaAllowedFewFails), false);

  const metaAllowedOldFail = {
    failCount: 3,
    lastSeen: now - (25 * 60 * 60 * 1000), // 25h ago (outside 24h window)
    lastOkAt: 0
  };
  assert.equal(env.sandbox.shouldBlockFaviconMeta(metaAllowedOldFail), false);

  assert.equal(env.sandbox.shouldBlockFaviconMeta(null), false);
});

test('favicon-cache: isFaviconMetaStale detects entries older than 30 days', () => {
  const env = createFaviconTestEnvironment();
  const now = Date.now();

  const freshMeta = {
    lastOkAt: now - (10 * 24 * 60 * 60 * 1000) // 10 days old
  };
  assert.equal(env.sandbox.isFaviconMetaStale(freshMeta), false);

  const staleMeta = {
    lastOkAt: now - (31 * 24 * 60 * 60 * 1000) // 31 days old
  };
  assert.equal(env.sandbox.isFaviconMetaStale(staleMeta), true);

  assert.equal(env.sandbox.isFaviconMetaStale(null), false);
  assert.equal(env.sandbox.isFaviconMetaStale({ lastOkAt: 0 }), false);
});

// -------------------------------------------------------------
// Tests for cache pruning
// -------------------------------------------------------------

test('favicon-cache: pruneFaviconMetaIfNeeded does not evict when entry count <= limit', async () => {
  const initialStorage = {
    'fav:meta:a.com': { lastSeen: 100 },
    'fav:meta:b.com': { lastSeen: 200 }
  };
  const env = createFaviconTestEnvironment({ initialStorage });

  await env.sandbox.pruneFaviconMetaIfNeeded();

  assert.ok(env.storageData['fav:meta:a.com']);
  assert.ok(env.storageData['fav:meta:b.com']);
  assert.equal(env.storageCalls.remove.length, 0);
});

test('favicon-cache: pruneFaviconMetaIfNeeded evicts oldest entries when exceeding limit', async () => {
  const env = createFaviconTestEnvironment();

  // Temporarily set max entries to 3 for testing pruning
  env.sandbox.FAVICON_META_MAX_ENTRIES = 3;

  env.storageData['fav:meta:oldest.com'] = { lastSeen: 100 };
  env.storageData['fav:meta:middle.com'] = { lastSeen: 200 };
  env.storageData['fav:meta:newer.com'] = { lastSeen: 300 };
  env.storageData['fav:meta:newest.com'] = { lastSeen: 400 };
  env.storageData['unrelated_key'] = { data: true };

  await env.sandbox.pruneFaviconMetaIfNeeded();

  // 'fav:meta:oldest.com' should be pruned because count was 4 > 3
  assert.equal(env.storageData['fav:meta:oldest.com'], undefined);
  assert.ok(env.storageData['fav:meta:middle.com']);
  assert.ok(env.storageData['fav:meta:newer.com']);
  assert.ok(env.storageData['fav:meta:newest.com']);
  // Unrelated key must remain untouched
  assert.ok(env.storageData['unrelated_key']);
});
