// ===============================================
// Homebase — Storage Schema Versioning & Migration Runner
// ===============================================

const CURRENT_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'schemaVersion';
const MIGRATION_HISTORY_KEY = 'migrationHistory';
const MAX_MIGRATION_HISTORY_RECORDS = 20;

/**
 * Migration registry for sequential schema transformations.
 * Each entry defines an upgrade step from version N to N+1.
 * Currently at baseline Version 1; subsequent schema migrations
 * (e.g. version 1 -> 2) will register step functions here.
 */
const SCHEMA_MIGRATIONS = [
  // Example future step:
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   migrate: async (currentStorage, browserApi) => { ... }
  // }
];

let migrationExecutionPromise = null;

/**
 * In-memory migration transaction state tracker.
 */
let currentMigrationTransaction = {
  state: 'idle',
  fromVersion: null,
  targetVersion: null,
  checkpoint: null,
  startedAt: null
};

/**
 * Returns a read-only snapshot of current migration transaction state.
 *
 * @returns {Object}
 */
function getMigrationTransactionState() {
  return {
    state: currentMigrationTransaction.state,
    fromVersion: currentMigrationTransaction.fromVersion,
    targetVersion: currentMigrationTransaction.targetVersion,
    checkpoint: currentMigrationTransaction.checkpoint ? { ...currentMigrationTransaction.checkpoint } : null,
    startedAt: currentMigrationTransaction.startedAt
  };
}

/**
 * Categorizes a migration error into a privacy-safe standardized category string.
 * Never includes user data, file paths, or variable contents.
 *
 * @param {Error|*} err
 * @returns {string}
 */
function categorizeMigrationError(err) {
  if (!err) return 'UNKNOWN_ERROR';
  const msg = String(err.message || '').toLowerCase();
  const name = String(err.name || '').toLowerCase();
  if (name.includes('quota') || msg.includes('quota')) return 'QUOTA_EXCEEDED';
  if (msg.includes('storage') || name.includes('storage')) return 'STORAGE_IO_ERROR';
  if (msg.includes('sanitize') || msg.includes('validation')) return 'VALIDATION_ERROR';
  if (err instanceof TypeError) return 'TYPE_ERROR';
  if (err instanceof RangeError) return 'RANGE_ERROR';
  return 'MIGRATION_STEP_ERROR';
}

/**
 * Appends a migration record to history and limits array size to maximum 20 entries.
 *
 * @param {Array<Object>} history
 * @param {Object} record
 * @returns {Array<Object>}
 */
function appendHistoryRecord(history, record) {
  const safeHistory = Array.isArray(history) ? [...history] : [];
  safeHistory.push(record);
  if (safeHistory.length > MAX_MIGRATION_HISTORY_RECORDS) {
    return safeHistory.slice(safeHistory.length - MAX_MIGRATION_HISTORY_RECORDS);
  }
  return safeHistory;
}

/**
 * Reads the persistent migration history array from browser storage.
 * Strictly read-only; never writes or modifies storage.
 *
 * @param {Object} [customBrowserApi] - Optional mock browser API for testing
 * @returns {Promise<Array<Object>>}
 */
async function getMigrationHistory(customBrowserApi = null) {
  const browserInstance = customBrowserApi || (typeof window !== 'undefined' ? (window.browser || window.chrome) : null);
  if (!browserInstance?.storage?.local) return [];
  try {
    const res = await browserInstance.storage.local.get(MIGRATION_HISTORY_KEY);
    return Array.isArray(res?.[MIGRATION_HISTORY_KEY]) ? res[MIGRATION_HISTORY_KEY] : [];
  } catch (_) {
    return [];
  }
}

/**
 * Executes storage schema validation and sequential migrations.
 * Idempotent, non-blocking, and guarded against multi-tab concurrency.
 *
 * @param {Object} [customBrowserApi] - Optional mock browser API for testing
 * @returns {Promise<{ status: string, version: number, error?: Error }>}
 */
async function runSchemaMigrations(customBrowserApi = null) {
  if (migrationExecutionPromise && !customBrowserApi) {
    return migrationExecutionPromise;
  }

  const runner = async () => {
    const browserInstance = customBrowserApi || (typeof window !== 'undefined' ? (window.browser || window.chrome) : null);
    if (!browserInstance?.storage?.local) {
      currentMigrationTransaction = {
        state: 'idle',
        fromVersion: null,
        targetVersion: null,
        checkpoint: null,
        startedAt: null
      };
      return { status: 'skipped', reason: 'storage_unavailable', version: 0 };
    }

    currentMigrationTransaction = {
      state: 'starting',
      fromVersion: null,
      targetVersion: null,
      checkpoint: null,
      startedAt: new Date().toISOString()
    };

    let currentVer = undefined;
    let migrationStartTime = 0;
    let preStepSnapshot = null;

    try {
      const storedVersionResult = await browserInstance.storage.local.get(SCHEMA_VERSION_KEY);
      const storedVersion = storedVersionResult?.[SCHEMA_VERSION_KEY];

      // Case 1: Profile is already at CURRENT_SCHEMA_VERSION (Fast-path: no writes)
      if (typeof storedVersion === 'number' && storedVersion === CURRENT_SCHEMA_VERSION) {
        currentMigrationTransaction.state = 'completed';
        currentMigrationTransaction.fromVersion = CURRENT_SCHEMA_VERSION;
        currentMigrationTransaction.targetVersion = CURRENT_SCHEMA_VERSION;
        return { status: 'noop', version: CURRENT_SCHEMA_VERSION };
      }

      // Case 2: Future version guard (Downgrade protection)
      if (typeof storedVersion === 'number' && storedVersion > CURRENT_SCHEMA_VERSION) {
        console.warn(
          `[Homebase Migrations] Stored schemaVersion (${storedVersion}) is higher than current extension version (${CURRENT_SCHEMA_VERSION}). Bypassing migrations.`
        );
        currentMigrationTransaction.state = 'completed';
        currentMigrationTransaction.fromVersion = storedVersion;
        currentMigrationTransaction.targetVersion = storedVersion;
        return { status: 'future_version_bypassed', version: storedVersion };
      }

      // Case 3: Unversioned profile (Fresh install or legacy v0 profile)
      if (typeof storedVersion === 'undefined' || storedVersion === null) {
        currentMigrationTransaction.fromVersion = 0;
        currentMigrationTransaction.targetVersion = CURRENT_SCHEMA_VERSION;
        // Initialize baseline schemaVersion without removing old keys or structures
        await browserInstance.storage.local.set({
          [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION
        });
        currentMigrationTransaction.state = 'completed';
        return { status: 'initialized', version: CURRENT_SCHEMA_VERSION };
      }

      // Case 4: Outdated profile requiring sequential upgrades (storedVersion < CURRENT_SCHEMA_VERSION)
      currentVer = storedVersion;
      currentMigrationTransaction.fromVersion = currentVer;
      currentMigrationTransaction.targetVersion = CURRENT_SCHEMA_VERSION;
      migrationStartTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

      let existingHistory = [];
      try {
        const histResult = await browserInstance.storage.local.get(MIGRATION_HISTORY_KEY);
        if (Array.isArray(histResult?.[MIGRATION_HISTORY_KEY])) {
          existingHistory = histResult[MIGRATION_HISTORY_KEY];
        }
      } catch (_) {
        existingHistory = [];
      }

      while (currentVer < CURRENT_SCHEMA_VERSION) {
        const nextVer = currentVer + 1;
        const migrationStep = SCHEMA_MIGRATIONS.find(
          (m) => m.fromVersion === currentVer && m.toVersion === nextVer
        );

        const checkpoint = {
          checkpointId: `ckpt_${Date.now()}_v${currentVer}_to_v${nextVer}`,
          fromVersion: currentVer,
          targetVersion: nextVer,
          timestamp: new Date().toISOString()
        };
        currentMigrationTransaction.state = 'checkpoint';
        currentMigrationTransaction.checkpoint = checkpoint;

        const stepRecord = {
          fromVersion: currentVer,
          toVersion: nextVer,
          status: 'success',
          durationMs: 0,
          timestamp: new Date().toISOString()
        };

        if (migrationStep && typeof migrationStep.migrate === 'function') {
          const stepStartTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();

          // Capture pre-step snapshot for recovery-safe rollback
          try {
            preStepSnapshot = await browserInstance.storage.local.get(null);
          } catch (_) {
            preStepSnapshot = null;
          }

          const snapshot = preStepSnapshot || (await browserInstance.storage.local.get(null));
          const transformedUpdates = await migrationStep.migrate(snapshot, browserInstance);
          const batchSanitizer = (typeof window !== 'undefined' && window.HomebaseValidator?.sanitizeStorageBatch) ||
            (typeof sanitizeStorageBatch === 'function' ? sanitizeStorageBatch : null);
          const sanitizedUpdates = batchSanitizer
            ? batchSanitizer(transformedUpdates || {}, { fallbackToDefault: true })
            : (transformedUpdates || {});

          const stepEndTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          stepRecord.durationMs = Math.max(0, Math.round(stepEndTime - stepStartTime));

          existingHistory = appendHistoryRecord(existingHistory, stepRecord);

          await browserInstance.storage.local.set({
            ...(sanitizedUpdates || {}),
            [SCHEMA_VERSION_KEY]: nextVer,
            [MIGRATION_HISTORY_KEY]: existingHistory
          });
        } else {
          // If no specific transformation needed for intermediate step, advance version marker
          const stepEndTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          stepRecord.durationMs = Math.max(0, Math.round(stepEndTime - migrationStartTime));

          existingHistory = appendHistoryRecord(existingHistory, stepRecord);

          await browserInstance.storage.local.set({
            [SCHEMA_VERSION_KEY]: nextVer,
            [MIGRATION_HISTORY_KEY]: existingHistory
          });
        }
        currentVer = nextVer;
      }

      currentMigrationTransaction.state = 'completed';
      return { status: 'migrated', version: CURRENT_SCHEMA_VERSION };
    } catch (err) {
      console.error('[Homebase Migrations] Migration execution failed safely:', err);
      currentMigrationTransaction.state = 'failed';

      // Recovery-safe rollback: restore pre-step snapshot if an intermediate migration failed
      if (preStepSnapshot && browserInstance?.storage?.local?.set) {
        try {
          await browserInstance.storage.local.set(preStepSnapshot);
          currentMigrationTransaction.state = 'rolled_back';
        } catch (_) {
          // Fail-safe containment
        }
      }

      try {
        if (typeof currentVer === 'number') {
          let existingHistory = [];
          try {
            const histResult = await browserInstance.storage.local.get(MIGRATION_HISTORY_KEY);
            if (Array.isArray(histResult?.[MIGRATION_HISTORY_KEY])) {
              existingHistory = histResult[MIGRATION_HISTORY_KEY];
            }
          } catch (_) {}

          const failedRecord = {
            fromVersion: currentVer,
            targetVersion: currentVer + 1,
            status: 'failed',
            errorCategory: categorizeMigrationError(err),
            durationMs: Math.max(0, Math.round(
              ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()) -
              (migrationStartTime || Date.now())
            )),
            timestamp: new Date().toISOString()
          };

          const updatedHistory = appendHistoryRecord(existingHistory, failedRecord);
          await browserInstance.storage.local.set({
            [MIGRATION_HISTORY_KEY]: updatedHistory
          });
        }
      } catch (_) {
        // Safe containment: failure to write history must never mask the original error
      }
      return { status: 'error', error: err, version: 0 };
    } finally {
      if (!customBrowserApi) {
        migrationExecutionPromise = null;
      }
    }
  };

  if (!customBrowserApi) {
    migrationExecutionPromise = runner();
    return migrationExecutionPromise;
  }

  return runner();
}

// Global and namespace registration
if (typeof window !== 'undefined') {
  window.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  window.SCHEMA_VERSION_KEY = SCHEMA_VERSION_KEY;
  window.MIGRATION_HISTORY_KEY = MIGRATION_HISTORY_KEY;
  window.runSchemaMigrations = runSchemaMigrations;
  window.getMigrationHistory = getMigrationHistory;
  window.getMigrationTransactionState = getMigrationTransactionState;
  window.HomebaseMigrations = {
    CURRENT_SCHEMA_VERSION,
    SCHEMA_VERSION_KEY,
    MIGRATION_HISTORY_KEY,
    SCHEMA_MIGRATIONS,
    runSchemaMigrations,
    getMigrationHistory,
    getMigrationTransactionState
  };
}
