import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');
const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

const todoScriptPath = path.join(rootDir, 'src/newtab/widgets/todo.js');
const todoScriptCode = fs.readFileSync(todoScriptPath, 'utf8');

const actionPopupScriptPath = path.join(rootDir, 'src/action-popup/action-popup.js');
const actionPopupScriptCode = fs.readFileSync(actionPopupScriptPath, 'utf8');

function createMockStorage(initialData = {}) {
  const data = { ...initialData };
  const calls = {
    get: [],
    set: [],
    remove: []
  };

  return {
    data,
    calls,
    api: {
      get: async (keys) => {
        calls.get.push(keys);
        if (!keys) return { ...data };
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((k) => {
          if (data[k] !== undefined) result[k] = data[k];
        });
        return result;
      },
      set: async (items) => {
        calls.set.push(items);
        Object.assign(data, items);
      },
      remove: async (keys) => {
        calls.remove.push(keys);
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach((k) => {
          delete data[k];
        });
      }
    }
  };
}

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

function createBackupContext(storageMock = null, localStorageMock = null) {
  const effectiveStorage = storageMock || createMockStorage();
  const effectiveLocalStorage = localStorageMock || createMockLocalStorage();

  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Date,
    Math,
    JSON,
    browser: { storage: { local: effectiveStorage.api } },
    localStorage: effectiveLocalStorage,
    location: { reload: () => {} },
    showCustomDialog: () => {}
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(backupScriptCode, context);
  return { context, storageMock: effectiveStorage, localStorageMock: effectiveLocalStorage };
}

function createTodoContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Date,
    Math,
    document: {
      getElementById: () => null,
      querySelector: () => null
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(todoScriptCode, context);
  return context;
}

function createActionPopupContext() {
  const storageMock = createMockStorage();
  const sandbox = {
    Object,
    Array,
    Map,
    Set,
    String,
    Number,
    Date,
    Math,
    document: {
      addEventListener: () => {},
      getElementById: () => ({
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} }
      })
    },
    browser: {
      storage: { local: storageMock.api },
      bookmarks: {},
      tabs: {},
      runtime: { getURL: () => '' }
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(actionPopupScriptCode, context);
  return { context, storageMock };
}

test('isPlainObject() - validates plain objects correctly', () => {
  const { context: ctx } = createBackupContext();
  assert.strictEqual(ctx.isPlainObject({}), true);
  assert.strictEqual(ctx.isPlainObject({ a: 1 }), true);
  assert.strictEqual(ctx.isPlainObject(Object.create(null)), true);
  assert.strictEqual(ctx.isPlainObject(null), false);
  assert.strictEqual(ctx.isPlainObject([]), false);
  assert.strictEqual(ctx.isPlainObject('string'), false);
  assert.strictEqual(ctx.isPlainObject(123), false);
  assert.strictEqual(ctx.isPlainObject(undefined), false);
});

test('HOMEBASE_OWNED_STORAGE_KEYS contains myWallpapers and critical keys', () => {
  const { context: ctx } = createBackupContext();
  const keys = vm.runInContext('HOMEBASE_OWNED_STORAGE_KEYS', ctx);
  assert.strictEqual(Array.isArray(keys), true);
  assert.strictEqual(keys.includes('myWallpapers'), true);
  assert.strictEqual(keys.includes('wallpaperSelection'), true);
  assert.strictEqual(keys.includes('todoItems'), true);
  assert.strictEqual(keys.includes('widgetOrder'), true);
  assert.strictEqual(keys.includes('lastUsedBookmarkFolderId'), true);
  assert.strictEqual(keys.includes('homebaseRecentSaveFolders'), true);
  assert.strictEqual(keys.length >= 73, true);
});

test('normalizeMyWallpapersItems() - sanitizes and sorts custom wallpapers', () => {
  const { context: ctx } = createBackupContext();
  const raw = [
    {
      id: 'wp-1',
      title: 'Older Wallpaper',
      type: 'image',
      mimeType: 'image/jpeg',
      cacheKey: 'cache-1',
      size: 1024,
      createdAt: 1000
    },
    {
      id: 'wp-2',
      title: 'Newer Wallpaper',
      type: 'video',
      mimeType: 'video/mp4',
      cacheKey: 'cache-2',
      size: 2048,
      createdAt: 2000
    },
    { id: 'wp-1', title: 'Duplicate ID' },
    null,
    'invalid-entry',
    { invalid: true }
  ];

  const result = ctx.normalizeMyWallpapersItems(raw);
  assert.strictEqual(result.length, 2);
  // Sorted by createdAt descending
  assert.strictEqual(result[0].id, 'wp-2');
  assert.strictEqual(result[0].title, 'Newer Wallpaper');
  assert.strictEqual(result[0].type, 'video');
  assert.strictEqual(result[1].id, 'wp-1');
  assert.strictEqual(result[1].title, 'Older Wallpaper');
  assert.strictEqual(result[1].type, 'image');
});

test('normalizeMyWallpapersItems() - handles empty and non-array inputs', () => {
  const { context: ctx } = createBackupContext();
  const cases = [[], null, undefined, 'not an array'];
  for (const input of cases) {
    const res = ctx.normalizeMyWallpapersItems(input);
    assert.strictEqual(Array.isArray(res), true);
    assert.strictEqual(res.length, 0);
  }
});

test('normalizeTodoItems() - sanitizes and deduplicates todo list', () => {
  const ctx = createTodoContext();
  const raw = [
    { id: 'todo-1', text: 'Task 1', done: false, createdAt: 100 },
    { id: 'todo-2', text: '  Task 2  ', done: true, createdAt: 200 },
    { id: 'todo-1', text: 'Duplicate ID', done: false },
    { text: 'No ID task', done: true },
    { text: '   ' }, // empty text should be dropped
    null,
    'garbage'
  ];

  const result = ctx.normalizeTodoItems(raw);
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0].id, 'todo-1');
  assert.strictEqual(result[0].text, 'Task 1');
  assert.strictEqual(result[0].done, false);

  assert.strictEqual(result[1].id, 'todo-2');
  assert.strictEqual(result[1].text, 'Task 2');
  assert.strictEqual(result[1].done, true);

  // Duplicate ID item gets assigned a new unique ID
  assert.notStrictEqual(result[2].id, 'todo-1');
  assert.strictEqual(result[2].text, 'Duplicate ID');

  // No ID task gets a generated ID
  assert.strictEqual(typeof result[3].id, 'string');
  assert.strictEqual(result[3].text, 'No ID task');
  assert.strictEqual(result[3].done, true);
});

test('normalizeTodoItems() - handles empty and non-array inputs', () => {
  const ctx = createTodoContext();
  const cases = [[], null, undefined, 'invalid'];
  for (const input of cases) {
    const res = ctx.normalizeTodoItems(input);
    assert.strictEqual(Array.isArray(res), true);
    assert.strictEqual(res.length, 0);
  }
});

test('partial backup does not delete missing keys during import', async () => {
  const initialStorage = {
    bookmarkCustomMetadata: { 'bm-1': { icon: 'custom-icon.png' } },
    folderCustomMetadata: { 'f-1': { color: '#ff0000' } },
    domainIconMap: { 'example.com': 'data:image/png;base64,abc' },
    appBackgroundDim: 40,
    widgetOrder: ['quote', 'weather'],
    homebaseRecentSaveFolders: ['f-1', 'f-2'],
    myWallpapers: [{ id: 'w-1', title: 'Wallpaper 1' }]
  };

  const storageMock = createMockStorage(initialStorage);
  const localStorageMock = createMockLocalStorage({ 'fast-bg-dim': '40' });
  const { context: ctx } = createBackupContext(storageMock, localStorageMock);

  // Partial backup contains only todoItems and appShowWeather
  const partialBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      todoItems: [{ id: 'td-1', text: 'Important task', done: false }],
      appShowWeather: false
    }
  };

  await ctx.HomebaseBackup.importState({
    text: async () => JSON.stringify(partialBackup)
  });

  // Verify that storage.local.remove was NEVER invoked
  assert.strictEqual(storageMock.calls.remove.length, 0);

  // Verify that all pre-existing unrepresented keys remain intact
  assert.deepStrictEqual(storageMock.data.bookmarkCustomMetadata, { 'bm-1': { icon: 'custom-icon.png' } });
  assert.deepStrictEqual(storageMock.data.folderCustomMetadata, { 'f-1': { color: '#ff0000' } });
  assert.deepStrictEqual(storageMock.data.domainIconMap, { 'example.com': 'data:image/png;base64,abc' });
  assert.strictEqual(storageMock.data.appBackgroundDim, 40);
  assert.deepStrictEqual(storageMock.data.widgetOrder, ['quote', 'weather']);
  assert.deepStrictEqual(storageMock.data.homebaseRecentSaveFolders, ['f-1', 'f-2']);
  assert.deepStrictEqual(storageMock.data.myWallpapers, [{ id: 'w-1', title: 'Wallpaper 1' }]);

  // Verify that keys explicitly present in the backup were updated
  assert.strictEqual(storageMock.data.appShowWeather, false);
  assert.strictEqual(storageMock.data.todoItems.length, 1);
  assert.strictEqual(storageMock.data.todoItems[0].id, 'td-1');
});

test('action popup legacy key migration - resolveLastUsedFolderId fallback', () => {
  const { context: ctx } = createActionPopupContext();
  const popup = ctx.HomebaseActionPopup;

  assert.ok(popup, 'HomebaseActionPopup must be exposed');
  assert.strictEqual(popup.LAST_USED_FOLDER_KEY, 'lastUsedBookmarkFolderId');
  assert.strictEqual(popup.LEGACY_LAST_USED_FOLDER_KEY, 'homebaseLastUsedFolderId');

  // Case 1: When only legacy key exists in stored data
  const legacyOnly = { homebaseLastUsedFolderId: 'folder-legacy-42' };
  assert.strictEqual(popup.resolveLastUsedFolderId(legacyOnly), 'folder-legacy-42');

  // Case 2: When canonical key exists, it takes precedence
  const bothKeys = {
    lastUsedBookmarkFolderId: 'folder-canonical-10',
    homebaseLastUsedFolderId: 'folder-legacy-42'
  };
  assert.strictEqual(popup.resolveLastUsedFolderId(bothKeys), 'folder-canonical-10');

  // Case 3: When neither exists or input is invalid
  assert.strictEqual(popup.resolveLastUsedFolderId({}), '');
  assert.strictEqual(popup.resolveLastUsedFolderId(null), '');
  assert.strictEqual(popup.resolveLastUsedFolderId(undefined), '');
  assert.strictEqual(popup.resolveLastUsedFolderId({ lastUsedBookmarkFolderId: '   ' }), '');
});

test('action popup legacy key migration - backup import migrates homebaseLastUsedFolderId', async () => {
  const storageMock = createMockStorage({});
  const { context: ctx } = createBackupContext(storageMock);

  // Backup generated on an older version containing only the legacy key
  const legacyBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      homebaseLastUsedFolderId: 'folder-legacy-99'
    }
  };

  await ctx.HomebaseBackup.importState({
    text: async () => JSON.stringify(legacyBackup)
  });

  // Verify that the canonical key was populated from the legacy key
  assert.strictEqual(storageMock.data.lastUsedBookmarkFolderId, 'folder-legacy-99');
});

test('missing optional keys are preserved during backup restoration', async () => {
  const storageMock = createMockStorage({
    homebaseRecentSaveFolders: ['folder-a', 'folder-b'],
    domainIconMap: { 'test.org': 'data:icon' },
    appBackgroundDim: 25,
    quoteTags: ['inspiration']
  });

  const localStorageMock = createMockLocalStorage({
    'fast-bg-dim': '25',
    'fast-show-sidebar': '1'
  });

  const { context: ctx } = createBackupContext(storageMock, localStorageMock);

  // Incoming backup omits optional keys
  const incomingBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appTimeFormatPreference: '24-hour'
    }
  };

  await ctx.HomebaseBackup.importState({
    text: async () => JSON.stringify(incomingBackup)
  });

  // Storage local preserved optional keys
  assert.deepStrictEqual(storageMock.data.homebaseRecentSaveFolders, ['folder-a', 'folder-b']);
  assert.deepStrictEqual(storageMock.data.domainIconMap, { 'test.org': 'data:icon' });
  assert.strictEqual(storageMock.data.appBackgroundDim, 25);
  assert.deepStrictEqual(storageMock.data.quoteTags, ['inspiration']);
  assert.strictEqual(storageMock.data.appTimeFormatPreference, '24-hour');

  // localStorage fast mirrors preserved
  assert.strictEqual(localStorageMock.getItem('fast-bg-dim'), '25');
  assert.strictEqual(localStorageMock.getItem('fast-show-sidebar'), '1');
});

test('homebaseRecentSaveFolders is sanitized on backup import', async () => {
  const storageMock = createMockStorage({});
  const { context: ctx } = createBackupContext(storageMock);

  const backup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      homebaseRecentSaveFolders: ['f1', '  f2  ', '', null, 'f3', 'f4', 'f5', 'f6', 'f7-overflow']
    }
  };

  await ctx.HomebaseBackup.importState({
    text: async () => JSON.stringify(backup)
  });

  assert.deepStrictEqual(storageMock.data.homebaseRecentSaveFolders, [
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6'
  ]);
});
