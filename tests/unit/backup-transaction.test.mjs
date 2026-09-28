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
const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const storageServiceScriptCode = fs.readFileSync(storageServiceScriptPath, 'utf8');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

/**
 * Creates an in-memory mock environment with browser.storage.local, window.localStorage,
 * and dialog hooks.
 */
function createMockEnvironment(initialStorage = {}, options = {}) {
  const localData = { ...initialStorage };
  const localStorageStore = new Map();
  if (options.initialLocalStorage) {
    for (const [k, v] of Object.entries(options.initialLocalStorage)) {
      localStorageStore.set(k, String(v));
    }
  }

  const calls = {
    get: [],
    set: [],
    remove: [],
    dialogs: []
  };

  const storageApi = {
    get: async (keys) => {
      calls.get.push(keys);
      if (options.failGet) {
        throw new Error('Simulated storage.local.get failure');
      }
      if (!keys) return { ...localData };
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        if (localData[k] !== undefined) result[k] = localData[k];
      });
      return result;
    },
    set: async (items) => {
      calls.set.push(items);
      if (options.failSet || (options.failSetKeys && Object.keys(items).some((k) => options.failSetKeys.includes(k)))) {
        throw new Error('Simulated storage.local.set failure');
      }
      Object.assign(localData, items);
    },
    remove: async (keys) => {
      calls.remove.push(keys);
      if (options.failRemove) {
        throw new Error('Simulated storage.local.remove failure');
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        delete localData[k];
      });
    }
  };

  const localStorageApi = {
    getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
    setItem: (k, v) => localStorageStore.set(k, String(v)),
    removeItem: (k) => localStorageStore.delete(k),
    clear: () => localStorageStore.clear()
  };

  const sandbox = {
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    Set,
    Map,
    console,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    browser: { storage: { local: storageApi } },
    localStorage: localStorageApi,
    showCustomDialog: (title, message) => {
      calls.dialogs.push({ title, message });
    },
    location: {
      reload: () => {
        calls.reloaded = true;
      }
    }
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  // Load stack in canonical runtime order
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(storageServiceScriptCode, context);
  vm.runInContext(backupScriptCode, context);

  return {
    context,
    localData,
    localStorageStore,
    calls,
    HomebaseStorage: context.HomebaseStorage,
    HomebaseBackup: context.HomebaseBackup,
    HomebaseDiagnostics: context.HomebaseDiagnostics,
    HomebaseMigrations: context.HomebaseMigrations
  };
}

test('backup-transaction: successful transaction applies delta, verifies, and syncs fast mirrors', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 10,
    appTimeFormatPreference: '12-hour',
    appShowWeather: true,
    widgetOrder: ['time', 'quote']
  });

  const validBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 50,
      appTimeFormatPreference: '24-hour',
      appShowWeather: false,
      widgetOrder: ['time', 'quote'] // unchanged
    }
  };

  await env.HomebaseBackup.importState({
    text: async () => JSON.stringify(validBackup)
  });

  // Verify storage updated
  assert.equal(env.localData.appBackgroundDim, 50);
  assert.equal(env.localData.appTimeFormatPreference, '24-hour');
  assert.equal(env.localData.appShowWeather, false);

  // Verify fast mirrors synchronized
  assert.equal(env.localStorageStore.get('fast-bg-dim'), '50');
  assert.equal(env.localStorageStore.get('fast-time-format'), '24-hour');
  assert.equal(env.localStorageStore.get('fast-show-weather'), '0');

  // Verify transaction state
  const state = env.HomebaseBackup.getBackupTransactionState();
  assert.equal(state.state, 'committed');

  // Verify dialog shown
  assert.ok(env.calls.dialogs.some((d) => d.title === 'Import complete'));
  assert.equal(env.calls.reloaded, true);
});

test('backup-transaction: minimal delta calculation performs 0 writes when backup is identical', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 20,
    appTimeFormatPreference: '12-hour',
    schemaVersion: 1
  });

  const identicalBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 20,
      appTimeFormatPreference: '12-hour',
      schemaVersion: 1
    }
  };

  const initialSetCount = env.calls.set.length;

  await env.HomebaseBackup.importState({
    text: async () => JSON.stringify(identicalBackup)
  });

  // Zero storage writes executed
  assert.equal(env.calls.set.length, initialSetCount);
  const state = env.HomebaseBackup.getBackupTransactionState();
  assert.equal(state.state, 'committed');
  assert.equal(state.deltaKeys.length, 0);
});

test('backup-transaction: invalid JSON string is rejected with zero storage writes', async () => {
  const env = createMockEnvironment({ appBackgroundDim: 15 });

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => '{ malformed json: not valid...'
      });
    },
    { message: 'Invalid JSON file.' }
  );

  assert.equal(env.localData.appBackgroundDim, 15);
  assert.equal(env.calls.set.length, 0);
  assert.equal(env.HomebaseBackup.getBackupTransactionState().state, 'failed');
});

test('backup-transaction: invalid schema envelope is rejected with zero storage writes', async () => {
  const env = createMockEnvironment({ appBackgroundDim: 15 });

  // Wrong schema identifier
  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify({ schema: 'wrong.schema', version: 1, storageLocal: {} })
      });
    },
    { message: 'Invalid backup schema.' }
  );

  // Unsupported version
  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify({ schema: 'homebase.export', version: 99, storageLocal: {} })
      });
    },
    { message: 'Unsupported backup version.' }
  );

  // Non-object storageLocal
  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify({ schema: 'homebase.export', version: 1, storageLocal: 'invalid' })
      });
    },
    { message: 'Invalid backup payload.' }
  );

  assert.equal(env.localData.appBackgroundDim, 15);
  assert.equal(env.calls.set.length, 0);
});

test('backup-transaction: rollback restores storage snapshot when storage.local.set fails', async () => {
  const env = createMockEnvironment(
    {
      appBackgroundDim: 30,
      appTimeFormatPreference: '12-hour',
      appShowSidebar: true
    },
    {
      initialLocalStorage: {
        'fast-bg-dim': '30',
        'fast-show-sidebar': '1'
      }
    }
  );

  const backupToRestore = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 70,
      appTimeFormatPreference: '24-hour'
    }
  };

  // Simulate write failure on the update
  let setCallCount = 0;
  const originalSet = env.context.browser.storage.local.set;
  env.context.browser.storage.local.set = async (items) => {
    setCallCount++;
    if (setCallCount === 1) {
      // First set is the transaction delta write -> trigger failure!
      throw new Error('Disk quota full / storage set failed');
    }
    // Subsequent calls (the rollback write) succeed
    return originalSet(items);
  };

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(backupToRestore)
      });
    },
    { message: 'Import failed. Previous settings safely restored.' }
  );

  // Assert rollback preserved pre-transaction storage
  assert.equal(env.localData.appBackgroundDim, 30);
  assert.equal(env.localData.appTimeFormatPreference, '12-hour');
  assert.equal(env.localData.appShowSidebar, true);

  // Assert fast mirrors were restored
  assert.equal(env.localStorageStore.get('fast-bg-dim'), '30');
  assert.equal(env.localStorageStore.get('fast-show-sidebar'), '1');

  // Assert transaction state was marked rolled_back
  assert.equal(env.HomebaseBackup.getBackupTransactionState().state, 'rolled_back');
});

test('backup-transaction: partial write protection removes newly introduced keys upon rollback', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 25
  });

  const backupWithNewKey = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 60,
      newFutureFeatureKey: 'temporary_value'
    }
  };

  // Make write fail after partial application or verification
  let callCount = 0;
  const origSet = env.context.browser.storage.local.set;
  env.context.browser.storage.local.set = async (items) => {
    callCount++;
    if (callCount === 1) {
      // Delta write executes partially before failing
      Object.assign(env.localData, items);
      throw new Error('Network / IO exception');
    }
    return origSet(items);
  };

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(backupWithNewKey)
      });
    },
    { message: 'Import failed. Previous settings safely restored.' }
  );

  // Verify that newFutureFeatureKey was safely removed by rollback
  assert.equal(env.localData.newFutureFeatureKey, undefined);
  // Verify original appBackgroundDim was restored
  assert.equal(env.localData.appBackgroundDim, 25);
  assert.equal(env.HomebaseBackup.getBackupTransactionState().state, 'rolled_back');
});

test('backup-transaction: unknown future keys in existing storage are completely preserved', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 20,
    customPluginConfig: { active: true, id: 'addon-1' }
  });

  // Partial backup contains only time format
  const partialBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appTimeFormatPreference: '24-hour'
    }
  };

  await env.HomebaseBackup.importState({
    text: async () => JSON.stringify(partialBackup)
  });

  // Existing customPluginConfig was preserved
  assert.deepStrictEqual(env.localData.customPluginConfig, { active: true, id: 'addon-1' });
  assert.equal(env.localData.appBackgroundDim, 20);
  assert.equal(env.localData.appTimeFormatPreference, '24-hour');
});

test('backup-transaction: privacy verification - anomaly log contains 0 sensitive user data', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 20
  });

  const sensitiveBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 50,
      todoItems: [{ id: 'td-1', text: 'My secret personal todo password', done: false }],
      bookmarkCustomMetadata: { 'bm-1': { url: 'https://bank.example.com/account' } }
    }
  };

  // Force failure to trigger rollback logging
  let callCount = 0;
  env.context.browser.storage.local.set = async (items) => {
    callCount++;
    if (callCount === 1) throw new Error('Simulated QuotaExceededError');
    Object.assign(env.localData, items);
  };

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(sensitiveBackup)
      });
    }
  );

  const anomalies = env.HomebaseDiagnostics.getValidationAnomalies();
  assert.ok(anomalies.length > 0);

  for (const anomaly of anomalies) {
    const serialized = JSON.stringify(anomaly);
    assert.equal(serialized.includes('bank.example.com'), false, 'Must not leak URLs');
    assert.equal(serialized.includes('secret personal todo'), false, 'Must not leak todo text');
    assert.equal(serialized.includes('password'), false, 'Must not leak private text');
  }
  const rollbackAnomaly = anomalies.find((a) => a.action === 'rollback_executed');
  assert.ok(rollbackAnomaly, 'Must record rollback_executed anomaly');
  assert.ok(rollbackAnomaly.detail && rollbackAnomaly.detail.errorCategory);
});

test('backup-transaction: exportState captures complete snapshot and owned keys', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 35,
    appTimeFormatPreference: '24-hour',
    schemaVersion: 1
  });

  // Stub document and Blob for export
  let exportedBlobText = '';
  env.context.Blob = class MockBlob {
    constructor(chunks) {
      exportedBlobText = chunks.join('');
    }
  };
  env.context.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  };
  env.context.document = {
    body: {
      appendChild: () => {},
      removeChild: () => {}
    },
    createElement: () => ({
      style: {},
      click: () => {},
      remove: () => {}
    })
  };

  await env.HomebaseBackup.exportState();

  assert.ok(exportedBlobText.length > 0);
  const parsed = JSON.parse(exportedBlobText);
  assert.equal(parsed.schema, 'homebase.export');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.storageLocal.appBackgroundDim, 35);
  assert.equal(parsed.storageLocal.appTimeFormatPreference, '24-hour');
  assert.equal(parsed.storageLocal.schemaVersion, 1);
});

test('backup-transaction: pre-flight diagnostic audit failure aborts transaction before writes', async () => {
  const env = createMockEnvironment({ appBackgroundDim: 20 });

  // Stub auditBackupHealth to return invalid
  env.HomebaseDiagnostics.auditBackupHealth = () => ({
    valid: false,
    errors: ['Corrupted envelope metadata']
  });

  const candidateBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      appBackgroundDim: 80
    }
  };

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(candidateBackup)
      });
    },
    /Validation audit failed|Corrupted envelope metadata/
  );

  // Storage untouched
  assert.equal(env.localData.appBackgroundDim, 20);
  assert.equal(env.calls.set.length, 0);
  assert.equal(env.HomebaseBackup.getBackupTransactionState().state, 'failed');
});

test('backup-transaction: migration interruption recovery restores pre-import snapshot', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 15,
    schemaVersion: 2
  });

  // Current extension version is 2
  env.context.CURRENT_SCHEMA_VERSION = 2;
  env.context.HomebaseMigrations.CURRENT_SCHEMA_VERSION = 2;

  // Inject a mock migration failure when upgrading from v1
  env.HomebaseMigrations.runSchemaMigrations = async () => {
    return {
      status: 'error',
      error: new Error('Simulated schema migration step failure')
    };
  };

  const olderBackup = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      schemaVersion: 1,
      appBackgroundDim: 75
    }
  };

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(olderBackup)
      });
    },
    { message: 'Import failed. Previous settings safely restored.' }
  );

  // Assert rollback restored original configuration
  assert.equal(env.localData.appBackgroundDim, 15);
  assert.equal(env.HomebaseBackup.getBackupTransactionState().state, 'rolled_back');
});

test('backup-transaction: prototype pollution payload is safely rejected without polluting Object', async () => {
  const env = createMockEnvironment({
    appBackgroundDim: 10
  });

  const maliciousPayload = JSON.parse('{"schema":"homebase.export","version":1,"storageLocal":{"__proto__":{"polluted":true},"appBackgroundDim":30}}');

  await assert.rejects(
    async () => {
      await env.HomebaseBackup.importState({
        text: async () => JSON.stringify(maliciousPayload)
      });
    },
    /Validation audit failed|Invalid backup payload/
  );

  assert.equal(env.localData.appBackgroundDim, 10);
  assert.equal({}.polluted, undefined);
  assert.equal(env.context.Object.prototype.polluted, undefined);
});
