import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsScriptPath = path.join(rootDir, 'src/newtab/core/schema-migrations.js');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');

const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

function createMockStorage(initialData = {}, options = {}) {
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
        if (options.failGet) {
          throw new Error('Simulated storage.local.get failure');
        }
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
        if (options.failSet) {
          throw new Error('Simulated storage.local.set failure');
        }
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

function createMigrationsContext(storageMock = null) {
  const effectiveStorage = storageMock || createMockStorage();

  const sandbox = {
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    console,
    browser: { storage: { local: effectiveStorage.api } }
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(migrationsScriptCode, context);
  return { context, storageMock: effectiveStorage };
}

function createBackupContext(storageMock = null) {
  const effectiveStorage = storageMock || createMockStorage();

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
    localStorage: {
      store: new Map(),
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    },
    location: { reload: () => {} },
    showCustomDialog: () => {}
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(backupScriptCode, context);
  return { context, storageMock: effectiveStorage };
}

test('schema-migrations: exports CURRENT_SCHEMA_VERSION and SCHEMA_VERSION_KEY', () => {
  const { context: ctx } = createMigrationsContext();
  assert.strictEqual(typeof ctx.CURRENT_SCHEMA_VERSION, 'number');
  assert.strictEqual(ctx.CURRENT_SCHEMA_VERSION, 1);
  assert.strictEqual(ctx.SCHEMA_VERSION_KEY, 'schemaVersion');
  assert.strictEqual(typeof ctx.runSchemaMigrations, 'function');
  assert.strictEqual(typeof ctx.HomebaseMigrations, 'object');
});

test('fresh install creates schemaVersion', async () => {
  const storageMock = createMockStorage({});
  const { context: ctx } = createMigrationsContext(storageMock);

  const result = await ctx.runSchemaMigrations();
  assert.strictEqual(result.status, 'initialized');
  assert.strictEqual(result.version, 1);
  assert.strictEqual(storageMock.data.schemaVersion, 1);
  assert.strictEqual(storageMock.calls.set.length, 1);
});

test('legacy profile upgrades', async () => {
  const initialData = {
    appShowWeather: true,
    bookmarkCustomMetadata: { 'bm-1': { icon: 'custom.png' } },
    lastUsedBookmarkFolderId: 'f-123'
  };
  const storageMock = createMockStorage(initialData);
  const { context: ctx } = createMigrationsContext(storageMock);

  const result = await ctx.runSchemaMigrations();
  assert.strictEqual(result.status, 'initialized');
  assert.strictEqual(result.version, 1);
  assert.strictEqual(storageMock.data.schemaVersion, 1);

  // Assert existing user data was preserved intact
  assert.strictEqual(storageMock.data.appShowWeather, true);
  assert.deepStrictEqual(storageMock.data.bookmarkCustomMetadata, { 'bm-1': { icon: 'custom.png' } });
  assert.strictEqual(storageMock.data.lastUsedBookmarkFolderId, 'f-123');
});

test('current version fast path', async () => {
  const storageMock = createMockStorage({ schemaVersion: 1, appShowSidebar: false });
  const { context: ctx } = createMigrationsContext(storageMock);

  const result = await ctx.runSchemaMigrations();
  assert.strictEqual(result.status, 'noop');
  assert.strictEqual(result.version, 1);
  // Zero writes executed
  assert.strictEqual(storageMock.calls.set.length, 0);
  assert.strictEqual(storageMock.data.appShowSidebar, false);
});

test('idempotent execution', async () => {
  const storageMock = createMockStorage({});
  const { context: ctx } = createMigrationsContext(storageMock);

  // First run: initializes
  const run1 = await ctx.runSchemaMigrations();
  assert.strictEqual(run1.status, 'initialized');
  assert.strictEqual(storageMock.calls.set.length, 1);

  // Second run: no-op
  const run2 = await ctx.runSchemaMigrations();
  assert.strictEqual(run2.status, 'noop');
  assert.strictEqual(storageMock.calls.set.length, 1); // No new writes

  // Third run: no-op
  const run3 = await ctx.runSchemaMigrations();
  assert.strictEqual(run3.status, 'noop');
  assert.strictEqual(storageMock.calls.set.length, 1); // Still 1 write
});

test('atomic write behavior', async () => {
  const storageMock = createMockStorage({});
  const { context: ctx } = createMigrationsContext(storageMock);

  await ctx.runSchemaMigrations();

  // Exactly one write call occurred
  assert.strictEqual(storageMock.calls.set.length, 1);
  // The write payload is an atomic object containing schemaVersion
  assert.strictEqual(storageMock.calls.set[0].schemaVersion, 1);
  assert.strictEqual(Object.keys(storageMock.calls.set[0]).length, 1);
});

test('future version protection', async () => {
  const storageMock = createMockStorage({ schemaVersion: 5, customFutureSetting: true });
  const { context: ctx } = createMigrationsContext(storageMock);

  const result = await ctx.runSchemaMigrations();
  assert.strictEqual(result.status, 'future_version_bypassed');
  assert.strictEqual(result.version, 5);
  // Version remains 5 and was not overwritten or downgraded
  assert.strictEqual(storageMock.data.schemaVersion, 5);
  assert.strictEqual(storageMock.calls.set.length, 0);
});

test('migration failure does not update schemaVersion', async () => {
  // Scenario A: Storage set fails
  const failSetStorage = createMockStorage({}, { failSet: true });
  const { context: ctxA } = createMigrationsContext(failSetStorage);

  const resultA = await ctxA.runSchemaMigrations();
  assert.strictEqual(resultA.status, 'error');
  assert.ok(resultA.error instanceof Error);
  // Storage was not updated with schemaVersion
  assert.strictEqual(failSetStorage.data.schemaVersion, undefined);

  // Scenario B: Storage get fails
  const failGetStorage = createMockStorage({}, { failGet: true });
  const { context: ctxB } = createMigrationsContext(failGetStorage);

  const resultB = await ctxB.runSchemaMigrations();
  assert.strictEqual(resultB.status, 'error');
  assert.ok(resultB.error instanceof Error);
  // Storage was not touched
  assert.strictEqual(failGetStorage.calls.set.length, 0);
  assert.strictEqual(failGetStorage.data.schemaVersion, undefined);
});

test('backup whitelist includes schemaVersion and validates on import', async () => {
  const { context: backupCtx } = createBackupContext();
  const keys = vm.runInContext('HOMEBASE_OWNED_STORAGE_KEYS', backupCtx);
  assert.ok(Array.isArray(keys));
  assert.ok(keys.includes('schemaVersion'), 'HOMEBASE_OWNED_STORAGE_KEYS must include schemaVersion');

  // Verify import sanitization for schemaVersion
  const storageMock = createMockStorage({});
  const { context: restoreCtx } = createBackupContext(storageMock);

  const validPayload = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      schemaVersion: 1,
      appShowWeather: true
    }
  };

  await restoreCtx.HomebaseBackup.importState({
    text: async () => JSON.stringify(validPayload)
  });

  assert.strictEqual(storageMock.data.schemaVersion, 1);
  assert.strictEqual(storageMock.data.appShowWeather, true);
});
