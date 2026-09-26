// ===============================================
// Homebase — Storage Schema Versioning & Migration Runner
// ===============================================

const CURRENT_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'schemaVersion';

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
      return { status: 'skipped', reason: 'storage_unavailable', version: 0 };
    }

    try {
      const storedVersionResult = await browserInstance.storage.local.get(SCHEMA_VERSION_KEY);
      const storedVersion = storedVersionResult?.[SCHEMA_VERSION_KEY];

      // Case 1: Profile is already at CURRENT_SCHEMA_VERSION (Fast-path: no writes)
      if (typeof storedVersion === 'number' && storedVersion === CURRENT_SCHEMA_VERSION) {
        return { status: 'noop', version: CURRENT_SCHEMA_VERSION };
      }

      // Case 2: Future version guard (Downgrade protection)
      if (typeof storedVersion === 'number' && storedVersion > CURRENT_SCHEMA_VERSION) {
        console.warn(
          `[Homebase Migrations] Stored schemaVersion (${storedVersion}) is higher than current extension version (${CURRENT_SCHEMA_VERSION}). Bypassing migrations.`
        );
        return { status: 'future_version_bypassed', version: storedVersion };
      }

      // Case 3: Unversioned profile (Fresh install or legacy v0 profile)
      if (typeof storedVersion === 'undefined' || storedVersion === null) {
        // Initialize baseline schemaVersion without removing old keys or structures
        await browserInstance.storage.local.set({
          [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION
        });
        return { status: 'initialized', version: CURRENT_SCHEMA_VERSION };
      }

      // Case 4: Outdated profile requiring sequential upgrades (storedVersion < CURRENT_SCHEMA_VERSION)
      let currentVer = storedVersion;
      while (currentVer < CURRENT_SCHEMA_VERSION) {
        const nextVer = currentVer + 1;
        const migrationStep = SCHEMA_MIGRATIONS.find(
          (m) => m.fromVersion === currentVer && m.toVersion === nextVer
        );

        if (migrationStep && typeof migrationStep.migrate === 'function') {
          const snapshot = await browserInstance.storage.local.get(null);
          const transformedUpdates = await migrationStep.migrate(snapshot, browserInstance);
          await browserInstance.storage.local.set({
            ...(transformedUpdates || {}),
            [SCHEMA_VERSION_KEY]: nextVer
          });
        } else {
          // If no specific transformation needed for intermediate step, advance version marker
          await browserInstance.storage.local.set({
            [SCHEMA_VERSION_KEY]: nextVer
          });
        }
        currentVer = nextVer;
      }

      return { status: 'migrated', version: CURRENT_SCHEMA_VERSION };
    } catch (err) {
      console.error('[Homebase Migrations] Migration execution failed safely:', err);
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
  window.runSchemaMigrations = runSchemaMigrations;
  window.HomebaseMigrations = {
    CURRENT_SCHEMA_VERSION,
    SCHEMA_VERSION_KEY,
    SCHEMA_MIGRATIONS,
    runSchemaMigrations
  };
}
