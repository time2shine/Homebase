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
const perfReportScriptPath = path.join(rootDir, 'src/newtab/core/perf-report.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');
const migrationsScriptCode = fs.readFileSync(migrationsScriptPath, 'utf8');
const diagnosticsScriptCode = fs.readFileSync(diagnosticsScriptPath, 'utf8');
const perfReportScriptCode = fs.readFileSync(perfReportScriptPath, 'utf8');

/**
 * Creates an in-memory mock of the browser storage local API.
 *
 * @param {Object} [initialData={}]
 * @param {Object} [options={}]
 * @returns {Object} Mock storage instance
 */
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

/**
 * Creates an isolated VM execution context with runtime scripts loaded
 * in the exact canonical sequence: validator -> migrations -> diagnostics -> perf-report.
 *
 * @param {Object} [initialStorage={}]
 * @param {Object} [storageOptions={}]
 * @returns {{ env: Object, storageMock: Object, browserApi: Object }}
 */
function createDiagnosticsEnvironment(initialStorage = {}, storageOptions = {}) {
  const storageMock = createMockStorage(initialStorage, storageOptions);
  let clipboardText = '';

  const browserApi = {
    storage: {
      local: storageMock.api
    }
  };

  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Boolean,
    Date,
    Math,
    RegExp,
    JSON,
    console,
    performance: {
      now: () => Date.now()
    },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          clipboardText = text;
        }
      }
    },
    getClipboardText: () => clipboardText,
    browser: browserApi,
    chrome: browserApi
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(validatorScriptCode, context);
  vm.runInContext(migrationsScriptCode, context);
  vm.runInContext(diagnosticsScriptCode, context);
  vm.runInContext(perfReportScriptCode, context);

  return { env: sandbox, storageMock, browserApi };
}

// ----------------------------------------------------
// 1. Export Verification Tests
// ----------------------------------------------------
test('export verification: window.HomebaseDiagnostics exists and exposes expected APIs', () => {
  const { env } = createDiagnosticsEnvironment();

  assert.ok(env.HomebaseDiagnostics, 'window.HomebaseDiagnostics should be defined');
  assert.strictEqual(typeof env.HomebaseDiagnostics.auditStorageHealth, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.auditBackupHealth, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.recordValidationAnomaly, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.getValidationAnomalies, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.clearValidationAnomalies, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.generateHealthReport, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.exportHealthReport, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.recordPerformanceMetric, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.getPerformanceMetrics, 'function');
  assert.strictEqual(typeof env.HomebaseDiagnostics.clearPerformanceMetrics, 'function');
});

// ----------------------------------------------------
// 2. Storage Health Tests
// ----------------------------------------------------
test('storage health: healthy storage produces HEALTHY status with 0 corrupted keys', async () => {
  const { env, browserApi } = createDiagnosticsEnvironment({
    schemaVersion: 1,
    appBackgroundDim: 20,
    appTimeFormatPreference: '24-hour',
    appShowWeather: true
  });

  const report = await env.HomebaseDiagnostics.auditStorageHealth(browserApi);

  assert.strictEqual(report.status, 'HEALTHY');
  assert.strictEqual(report.schemaVersion.status, 'ALIGNED');
  assert.strictEqual(report.schemaVersion.stored, 1);
  assert.strictEqual(report.counts.corrupted, 0);
  assert.strictEqual(report.counts.valid, 4);
  assert.strictEqual(report.counts.unknown, 0);
  assert.strictEqual(report.keys.corrupted.length, 0);
});

test('storage health: missing schemaVersion flags DEGRADED with LEGACY_UNVERSIONED status', async () => {
  const { env, browserApi } = createDiagnosticsEnvironment({
    appBackgroundDim: 20,
    appTimeFormatPreference: '24-hour'
  });

  const report = await env.HomebaseDiagnostics.auditStorageHealth(browserApi);

  assert.strictEqual(report.status, 'DEGRADED');
  assert.strictEqual(report.schemaVersion.status, 'LEGACY_UNVERSIONED');
  assert.strictEqual(report.schemaVersion.stored, null);
  assert.strictEqual(report.counts.corrupted, 0);
  assert.strictEqual(report.counts.valid, 2);
});

test('storage health: corrupted values produce CORRUPTED status and list corrupted keys', async () => {
  const { env, browserApi } = createDiagnosticsEnvironment({
    schemaVersion: 1,
    appBackgroundDim: 20,
    appBookmarkTextBgColor: '<script>evil()</script>', // Invalid unrecoverable hex
    appNewsSource: 'unauthorized_feed_token' // Invalid enum
  });

  const report = await env.HomebaseDiagnostics.auditStorageHealth(browserApi);

  assert.strictEqual(report.status, 'CORRUPTED');
  assert.ok(report.counts.corrupted >= 1);
  const corruptedKeyNames = report.keys.corrupted.map((entry) => entry.key);
  assert.ok(corruptedKeyNames.includes('appBookmarkTextBgColor'));
});

test('storage health: unknown keys are detected and tracked as unknown', async () => {
  const { env, browserApi } = createDiagnosticsEnvironment({
    schemaVersion: 1,
    appBackgroundDim: 20,
    futureFeatureExperimentalKey: true
  });

  const report = await env.HomebaseDiagnostics.auditStorageHealth(browserApi);

  assert.strictEqual(report.counts.unknown, 1);
  assert.ok(report.keys.unknown.includes('futureFeatureExperimentalKey'));
  assert.strictEqual(report.status, 'DEGRADED'); // Unknown keys trigger DEGRADED status to highlight unknown state
});

// ----------------------------------------------------
// 3. Backup Audit Tests
// ----------------------------------------------------
test('backup audit: valid backup returns valid: true with 0 invalid keys', () => {
  const { env } = createDiagnosticsEnvironment();

  const validPayload = {
    schema: 'homebase.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageLocal: {
      schemaVersion: 1,
      appBackgroundDim: 30,
      appTimeFormatPreference: '12-hour',
      widgetOrder: ['weather', 'quote', 'todo', 'news']
    }
  };

  const audit = env.HomebaseDiagnostics.auditBackupHealth(validPayload);

  assert.strictEqual(audit.valid, true);
  assert.strictEqual(audit.envelope.isValid, true);
  assert.strictEqual(audit.counts.invalid, 0);
  assert.strictEqual(audit.counts.valid, 4);
  assert.strictEqual(audit.errors.length, 0);
});

test('backup audit: invalid envelope returns valid: false and reports envelope errors', () => {
  const { env } = createDiagnosticsEnvironment();

  const invalidEnvelope = {
    schema: 'unsupported.format',
    version: 99,
    storageLocal: {
      appBackgroundDim: 10
    }
  };

  const audit = env.HomebaseDiagnostics.auditBackupHealth(invalidEnvelope);

  assert.strictEqual(audit.valid, false);
  assert.strictEqual(audit.envelope.isValid, false);
  assert.ok(audit.errors.length > 0);
});

test('backup audit: malformed storageLocal returns valid: false', () => {
  const { env } = createDiagnosticsEnvironment();

  const malformedStorage = {
    schema: 'homebase.export',
    version: 1,
    storageLocal: 'not-an-object'
  };

  const audit = env.HomebaseDiagnostics.auditBackupHealth(malformedStorage);

  assert.strictEqual(audit.valid, false);
  assert.strictEqual(audit.envelope.isValid, false);
});

test('backup audit: corrupted values in storageLocal are flagged in invalid keys', () => {
  const { env } = createDiagnosticsEnvironment();

  const corruptedBackup = {
    schema: 'homebase.export',
    version: 1,
    storageLocal: {
      schemaVersion: 1,
      appBookmarkTextBgColor: 'invalid-color-code'
    }
  };

  const audit = env.HomebaseDiagnostics.auditBackupHealth(corruptedBackup);

  assert.strictEqual(audit.valid, false);
  assert.ok(audit.counts.invalid >= 1);
  const invalidKeyNames = audit.keys.invalid.map((entry) => entry.key);
  assert.ok(invalidKeyNames.includes('appBookmarkTextBgColor'));
});

// ----------------------------------------------------
// 4. Anomaly Buffer Tests
// ----------------------------------------------------
test('anomaly buffer: records are stored with sanitized metadata', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.clearValidationAnomalies();
  assert.strictEqual(env.HomebaseDiagnostics.getValidationAnomalies().length, 0);

  env.HomebaseDiagnostics.recordValidationAnomaly('appBackgroundDim', 'clamped', 'clamped');
  const anomalies = env.HomebaseDiagnostics.getValidationAnomalies();

  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].key, 'appBackgroundDim');
  assert.strictEqual(anomalies[0].action, 'clamped');
  assert.strictEqual(anomalies[0].detail, 'clamped');
  assert.ok(typeof anomalies[0].timestamp === 'string');
});

test('anomaly buffer: capped at maximum 50 entries with oldest records removed (FIFO)', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.clearValidationAnomalies();

  for (let i = 0; i < 60; i++) {
    env.HomebaseDiagnostics.recordValidationAnomaly(`key_${i}`, 'normalized', 'normalized');
  }

  const anomalies = env.HomebaseDiagnostics.getValidationAnomalies();
  assert.strictEqual(anomalies.length, 50, 'Buffer must be capped at 50 records');

  // Verify oldest records (key_0 to key_9) were evicted
  assert.strictEqual(anomalies[0].key, 'key_10');
  assert.strictEqual(anomalies[49].key, 'key_59');
});

test('anomaly buffer: clearValidationAnomalies empties the buffer', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.recordValidationAnomaly('tempKey', 'defaulted', 'defaulted');
  assert.ok(env.HomebaseDiagnostics.getValidationAnomalies().length > 0);

  env.HomebaseDiagnostics.clearValidationAnomalies();
  assert.strictEqual(env.HomebaseDiagnostics.getValidationAnomalies().length, 0);
});

// ----------------------------------------------------
// 5. Performance Buffer Tests
// ----------------------------------------------------
test('performance buffer: records stored with strictly name and durationMs', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.clearPerformanceMetrics();
  assert.strictEqual(env.HomebaseDiagnostics.getPerformanceMetrics().length, 0);

  env.HomebaseDiagnostics.recordPerformanceMetric('widget:weather', 14);
  const metrics = env.HomebaseDiagnostics.getPerformanceMetrics();

  assert.strictEqual(metrics.length, 1);
  assert.strictEqual(metrics[0].name, 'widget:weather');
  assert.strictEqual(metrics[0].durationMs, 14);
  // Verify strict fields only (no leaked parameters)
  assert.deepStrictEqual(Object.keys(metrics[0]).sort(), ['durationMs', 'name']);
});

test('performance buffer: capped at maximum 20 entries with FIFO eviction', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.clearPerformanceMetrics();

  for (let i = 0; i < 30; i++) {
    env.HomebaseDiagnostics.recordPerformanceMetric(`metric_${i}`, i * 5);
  }

  const metrics = env.HomebaseDiagnostics.getPerformanceMetrics();
  assert.strictEqual(metrics.length, 20, 'Performance buffer must be capped at 20 records');

  // Verify oldest records (metric_0 to metric_9) were evicted
  assert.strictEqual(metrics[0].name, 'metric_10');
  assert.strictEqual(metrics[19].name, 'metric_29');
});

test('performance buffer: clearPerformanceMetrics empties the buffer', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.recordPerformanceMetric('tempMetric', 50);
  assert.ok(env.HomebaseDiagnostics.getPerformanceMetrics().length > 0);

  env.HomebaseDiagnostics.clearPerformanceMetrics();
  assert.strictEqual(env.HomebaseDiagnostics.getPerformanceMetrics().length, 0);
});

// ----------------------------------------------------
// 6. Privacy Tests
// ----------------------------------------------------
test('privacy: anomaly buffer and health report never expose sensitive URLs, bookmarks, todos, or wallpapers', () => {
  const { env } = createDiagnosticsEnvironment();

  env.HomebaseDiagnostics.clearValidationAnomalies();

  const sensitivePayload = {
    url: 'https://secret-intranet.company.internal/confidential/page?auth=topsecret',
    bookmarkTitle: 'Personal Financial Account',
    todoText: 'Buy prescription medicine from clinic',
    wallpaperUrl: 'https://secret.images.internal/wallpaper.jpg'
  };

  // Attempt to record anomaly with sensitive details
  env.HomebaseDiagnostics.recordValidationAnomaly('testKey', 'rejected', sensitivePayload);

  const anomalies = env.HomebaseDiagnostics.getValidationAnomalies();
  const report = env.HomebaseDiagnostics.generateHealthReport();

  // 1. Verify anomaly buffer has redacted sensitive entries
  assert.strictEqual(anomalies[0].detail.url, '[redacted]');
  assert.strictEqual(anomalies[0].detail.bookmarkTitle, '[redacted]');
  assert.strictEqual(anomalies[0].detail.todoText, '[redacted]');
  assert.strictEqual(anomalies[0].detail.wallpaperUrl, '[redacted]');

  // 2. Verify generated text report does not contain sensitive tokens
  assert.strictEqual(report.includes('secret-intranet'), false);
  assert.strictEqual(report.includes('Personal Financial Account'), false);
  assert.strictEqual(report.includes('prescription medicine'), false);
  assert.strictEqual(report.includes('wallpaper.jpg'), false);
});

// ----------------------------------------------------
// 7. Migration History Tests
// ----------------------------------------------------
test('migration history: retrieves stored history array', async () => {
  const sampleHistory = [
    {
      fromVersion: 0,
      toVersion: 1,
      status: 'success',
      durationMs: 12,
      timestamp: new Date().toISOString()
    }
  ];

  const { env, browserApi } = createDiagnosticsEnvironment({
    schemaVersion: 1,
    migrationHistory: sampleHistory
  });

  const history = await env.HomebaseMigrations.getMigrationHistory(browserApi);

  assert.strictEqual(Array.isArray(history), true);
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].fromVersion, 0);
  assert.strictEqual(history[0].toVersion, 1);
  assert.strictEqual(history[0].status, 'success');
  assert.strictEqual(history[0].durationMs, 12);
});

test('migration history: returns empty array when history is absent or empty', async () => {
  const { env, browserApi } = createDiagnosticsEnvironment({
    schemaVersion: 1
  });

  const history = await env.HomebaseMigrations.getMigrationHistory(browserApi);

  assert.strictEqual(Array.isArray(history), true);
  assert.strictEqual(history.length, 0);
});

// ----------------------------------------------------
// 8. Error Handling Tests
// ----------------------------------------------------
test('error handling: invalid inputs do not throw and return safe fallback states', async () => {
  const { env } = createDiagnosticsEnvironment();

  // 1. auditBackupHealth with invalid inputs
  assert.doesNotThrow(() => {
    const res1 = env.HomebaseDiagnostics.auditBackupHealth(null);
    assert.strictEqual(res1.valid, false);

    const res2 = env.HomebaseDiagnostics.auditBackupHealth(undefined);
    assert.strictEqual(res2.valid, false);

    const res3 = env.HomebaseDiagnostics.auditBackupHealth('{ broken json syntax');
    assert.strictEqual(res3.valid, false);

    const res4 = env.HomebaseDiagnostics.auditBackupHealth(12345);
    assert.strictEqual(res4.valid, false);
  });

  // 2. auditStorageHealth with missing storage API returns UNAVAILABLE
  await assert.doesNotThrow(async () => {
    const res = await env.HomebaseDiagnostics.auditStorageHealth({});
    assert.strictEqual(res.status, 'UNAVAILABLE');
  });

  // 3. auditStorageHealth with storage error returns CORRUPTED
  await assert.doesNotThrow(async () => {
    const throwingApi = {
      storage: {
        local: {
          get: async () => {
            throw new Error('Disk IO failure');
          }
        }
      }
    };
    const res = await env.HomebaseDiagnostics.auditStorageHealth(throwingApi);
    assert.strictEqual(res.status, 'CORRUPTED');
  });

  // 4. recordValidationAnomaly with nulls
  assert.doesNotThrow(() => {
    env.HomebaseDiagnostics.recordValidationAnomaly(null, null, null);
  });

  // 5. recordPerformanceMetric with nulls
  assert.doesNotThrow(() => {
    env.HomebaseDiagnostics.recordPerformanceMetric(null, null);
  });

  // 6. generateHealthReport with null
  assert.doesNotThrow(() => {
    const text = env.HomebaseDiagnostics.generateHealthReport(null);
    assert.ok(typeof text === 'string' && text.length > 0);
  });

  // 7. exportHealthReport with null browser
  await assert.doesNotThrow(async () => {
    const res = await env.HomebaseDiagnostics.exportHealthReport({ customBrowserApi: null });
    assert.ok(typeof res === 'object');
  });
});
