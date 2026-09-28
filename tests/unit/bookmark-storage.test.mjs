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
const bookmarkStorageScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-storage.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const bookmarkStorageScriptCode = fs.readFileSync(bookmarkStorageScriptPath, 'utf8');

function createBookmarkStorageTestEnvironment(options = {}) {
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

  vm.runInContext(bookmarkStorageScriptCode, context);

  return {
    sandbox,
    context,
    storageData,
    storageCalls
  };
}

// -------------------------------------------------------------
// Root ID Handling via HomebaseStorage and Fallback
// -------------------------------------------------------------

test('bookmark-storage: getHomebaseRootId reads valid root ID via HomebaseStorage', async () => {
  const env = createBookmarkStorageTestEnvironment({
    initialStorage: {
      homebaseBookmarkRootId: 'root-123'
    }
  });

  assert.equal(typeof env.sandbox.HomebaseStorage, 'object');
  const rootId = await env.sandbox.getHomebaseRootId();
  assert.equal(rootId, 'root-123');
});

test('bookmark-storage: getHomebaseRootId returns empty string for missing key', async () => {
  const env = createBookmarkStorageTestEnvironment();
  const rootId = await env.sandbox.getHomebaseRootId();
  assert.equal(rootId, '');
});

test('bookmark-storage: setHomebaseRootId and clearHomebaseRootId persist via HomebaseStorage', async () => {
  const env = createBookmarkStorageTestEnvironment();

  await env.sandbox.setHomebaseRootId('root-456');
  assert.equal(env.storageData.homebaseBookmarkRootId, 'root-456');

  const readBack = await env.sandbox.getHomebaseRootId();
  assert.equal(readBack, 'root-456');

  await env.sandbox.clearHomebaseRootId();
  assert.equal(env.storageData.homebaseBookmarkRootId, undefined);

  const cleared = await env.sandbox.getHomebaseRootId();
  assert.equal(cleared, '');
});

test('bookmark-storage: root ID methods fall back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createBookmarkStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      homebaseBookmarkRootId: 'fallback-root-789'
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  // Read via fallback
  const rootId = await env.sandbox.getHomebaseRootId();
  assert.equal(rootId, 'fallback-root-789');

  // Write via fallback
  await env.sandbox.setHomebaseRootId('fallback-updated');
  assert.equal(env.storageData.homebaseBookmarkRootId, 'fallback-updated');

  // Clear via fallback
  await env.sandbox.clearHomebaseRootId();
  assert.equal(env.storageData.homebaseBookmarkRootId, undefined);
});

// -------------------------------------------------------------
// Bookmark Metadata via HomebaseStorage and Fallback
// -------------------------------------------------------------

test('bookmark-storage: getBookmarkMetadata reads and normalizes metadata via HomebaseStorage', async () => {
  const env = createBookmarkStorageTestEnvironment({
    initialStorage: {
      bookmarkCustomMetadata: {
        'bm-1': {
          icon: 'data:image/png;base64,icon1',
          customTitle: 'My Bookmark',
          originalUrl: 'https://example.com',
          containerId: 'firefox-container-1'
        }
      }
    }
  });

  const meta = await env.sandbox.getBookmarkMetadata();
  assert.ok(meta['bm-1']);
  assert.equal(meta['bm-1'].icon, 'data:image/png;base64,icon1');
  assert.equal(meta['bm-1'].customTitle, 'My Bookmark');
  assert.equal(meta['bm-1'].originalUrl, 'https://example.com');
  assert.equal(meta['bm-1'].containerId, 'firefox-container-1');
});

test('bookmark-storage: setBookmarkMetadata normalizes and persists via HomebaseStorage', async () => {
  const env = createBookmarkStorageTestEnvironment();

  await env.sandbox.setBookmarkMetadata({
    'bm-2': {
      icon: 'data:image/png;base64,icon2',
      customTitle: 'Second Bookmark'
    }
  });

  const stored = env.storageData.bookmarkCustomMetadata;
  assert.ok(stored);
  assert.ok(stored['bm-2']);
  assert.equal(stored['bm-2'].customTitle, 'Second Bookmark');
});

test('bookmark-storage: removeBookmarkMetadata deletes single bookmark or clears all', async () => {
  const env = createBookmarkStorageTestEnvironment({
    initialStorage: {
      bookmarkCustomMetadata: {
        'bm-1': { customTitle: 'One' },
        'bm-2': { customTitle: 'Two' }
      }
    }
  });

  // Remove single entry
  await env.sandbox.removeBookmarkMetadata('bm-1');
  const afterRemoveOne = await env.sandbox.getBookmarkMetadata();
  assert.equal(afterRemoveOne['bm-1'], undefined);
  assert.ok(afterRemoveOne['bm-2']);

  // Remove all entries
  await env.sandbox.removeBookmarkMetadata();
  const afterRemoveAll = await env.sandbox.getBookmarkMetadata();
  assert.deepEqual(JSON.parse(JSON.stringify(afterRemoveAll)), {});
});

test('bookmark-storage: bookmark metadata falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createBookmarkStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      bookmarkCustomMetadata: {
        'bm-fallback': { customTitle: 'Fallback Item' }
      }
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  const meta = await env.sandbox.getBookmarkMetadata();
  assert.ok(meta['bm-fallback']);
  assert.equal(meta['bm-fallback'].customTitle, 'Fallback Item');

  await env.sandbox.setBookmarkMetadata({
    'bm-fallback-2': { customTitle: 'Fallback Item 2' }
  });
  assert.ok(env.storageData.bookmarkCustomMetadata['bm-fallback-2']);
});

// -------------------------------------------------------------
// Missing Keys & Corrupted Values
// -------------------------------------------------------------

test('bookmark-storage: missing bookmark and folder metadata return empty object', async () => {
  const env = createBookmarkStorageTestEnvironment();

  const bmMeta = await env.sandbox.getBookmarkMetadata();
  assert.deepEqual(JSON.parse(JSON.stringify(bmMeta)), {});

  const fMeta = await env.sandbox.getFolderMetadata();
  assert.deepEqual(JSON.parse(JSON.stringify(fMeta)), {});
});

test('bookmark-storage: corrupted bookmark metadata safely normalizes to clean object', async () => {
  const env = createBookmarkStorageTestEnvironment({
    initialStorage: {
      bookmarkCustomMetadata: 'invalid string instead of object'
    }
  });

  const meta = await env.sandbox.getBookmarkMetadata();
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), {});
});

test('bookmark-storage: corrupted items within metadata are filtered and clamped', () => {
  const env = createBookmarkStorageTestEnvironment();

  const normalized = env.sandbox.normalizeBookmarkMetadata({
    'valid-id': {
      icon: 'icon-string',
      customTitle: 'title',
      originalUrl: 'https://test.org',
      containerId: 'container-1'
    },
    'invalid-child': 'not an object',
    '': { customTitle: 'empty key should be skipped' },
    123: { customTitle: 'non-string key should be skipped' }
  });

  assert.ok(normalized['valid-id']);
  assert.equal(normalized['invalid-child'], undefined);
  assert.equal(normalized[''], undefined);
});

// -------------------------------------------------------------
// Folder Metadata via HomebaseStorage and Fallback
// -------------------------------------------------------------

test('bookmark-storage: getFolderMetadata and setFolderMetadata persist via HomebaseStorage', async () => {
  const env = createBookmarkStorageTestEnvironment();

  await env.sandbox.setFolderMetadata({
    'folder-1': {
      color: '#ff0000',
      icon: 'folder-icon',
      customOrder: ['bm-1', 'bm-2']
    }
  });

  const stored = env.storageData.folderCustomMetadata;
  assert.ok(stored);
  assert.ok(stored['folder-1']);
  assert.equal(stored['folder-1'].color, '#ff0000');
  assert.deepEqual(stored['folder-1'].customOrder, ['bm-1', 'bm-2']);

  const readBack = await env.sandbox.getFolderMetadata();
  assert.deepEqual(readBack['folder-1'].customOrder, ['bm-1', 'bm-2']);
});

test('bookmark-storage: folder metadata falls back to browser.storage.local when HomebaseStorage is absent', async () => {
  const env = createBookmarkStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      folderCustomMetadata: {
        'folder-fb': { color: '#00ff00' }
      }
    }
  });

  assert.equal(env.sandbox.HomebaseStorage, undefined);

  const meta = await env.sandbox.getFolderMetadata();
  assert.ok(meta['folder-fb']);
  assert.equal(meta['folder-fb'].color, '#00ff00');
});

// -------------------------------------------------------------
// Last Used Folder State
// -------------------------------------------------------------

test('bookmark-storage: getLastUsedFolderId and setLastUsedFolderId handle state and fallback', async () => {
  const env = createBookmarkStorageTestEnvironment();

  // Missing initially returns null
  const initial = await env.sandbox.getLastUsedFolderId();
  assert.equal(initial, null);

  // Set via HomebaseStorage
  await env.sandbox.HomebaseBookmarkStorage.setLastUsedFolderId('folder-abc');
  assert.equal(env.storageData.lastUsedBookmarkFolderId, 'folder-abc');

  const updated = await env.sandbox.getLastUsedFolderId();
  assert.equal(updated, 'folder-abc');

  // Fallback environment
  const fallbackEnv = createBookmarkStorageTestEnvironment({
    withHomebaseStorage: false,
    initialStorage: {
      lastUsedBookmarkFolderId: 'folder-fallback'
    }
  });

  const fbVal = await fallbackEnv.sandbox.getLastUsedFolderId();
  assert.equal(fbVal, 'folder-fallback');

  await fallbackEnv.sandbox.HomebaseBookmarkStorage.setLastUsedFolderId('folder-fallback-updated');
  assert.equal(fallbackEnv.storageData.lastUsedBookmarkFolderId, 'folder-fallback-updated');
});

// -------------------------------------------------------------
// Namespace & Export Verification
// -------------------------------------------------------------

test('bookmark-storage: exports expected functions and keys to window and HomebaseBookmarkStorage', () => {
  const env = createBookmarkStorageTestEnvironment();

  assert.equal(typeof env.sandbox.getHomebaseRootId, 'function');
  assert.equal(typeof env.sandbox.setHomebaseRootId, 'function');
  assert.equal(typeof env.sandbox.clearHomebaseRootId, 'function');
  assert.equal(typeof env.sandbox.getBookmarkMetadata, 'function');
  assert.equal(typeof env.sandbox.setBookmarkMetadata, 'function');
  assert.equal(typeof env.sandbox.removeBookmarkMetadata, 'function');
  assert.equal(typeof env.sandbox.getFolderMetadata, 'function');
  assert.equal(typeof env.sandbox.setFolderMetadata, 'function');
  assert.equal(typeof env.sandbox.getLastUsedFolderId, 'function');
  assert.equal(typeof env.sandbox.setBookmarkLastUsedFolderId, 'function');

  const namespace = env.sandbox.HomebaseBookmarkStorage;
  assert.ok(namespace, 'HomebaseBookmarkStorage namespace should exist');
  assert.equal(typeof namespace.getHomebaseRootId, 'function');
  assert.equal(typeof namespace.setHomebaseRootId, 'function');
  assert.equal(typeof namespace.clearHomebaseRootId, 'function');
  assert.equal(typeof namespace.getBookmarkMetadata, 'function');
  assert.equal(typeof namespace.setBookmarkMetadata, 'function');
  assert.equal(typeof namespace.removeBookmarkMetadata, 'function');
  assert.equal(typeof namespace.getFolderMetadata, 'function');
  assert.equal(typeof namespace.setFolderMetadata, 'function');
  assert.equal(typeof namespace.getLastUsedFolderId, 'function');
  assert.equal(typeof namespace.setLastUsedFolderId, 'function');
});
