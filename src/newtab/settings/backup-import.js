// ===============================================
// Homebase — Transactional Backup & Restoration Engine
// ===============================================

const HOMEBASE_BACKUP_SCHEMA = 'homebase.export';
const HOMEBASE_BACKUP_VERSION = 1;

const HOMEBASE_OWNED_STORAGE_KEYS = [
  'wallpaperSelection',
  'cachedAppliedPosterUrl',
  'cachedAppliedPosterDataUrl',
  'cachedAppliedPoster',
  'cachedAppliedVideoUrl',
  'videosManifest',
  'videosManifestFetchedAt',
  'cachedGalleryPosters',
  'wallpaperPoolIds',
  'wallpaperFallbackUsedAt',
  'pendingDailyRotation',
  'pendingDailyRotationSince',
  'galleryFavorites',
  'dailyWallpaperEnabled',
  'wallpaperTypePreference',
  'wallpaperQualityPreference',
  'appTimeFormatPreference',
  'appBackgroundDim',
  'appShowSidebar',
  'appShowWeather',
  'appShowQuote',
  'appShowNews',
  'appShowTodo',
  'todoItems',
  'todoHideDone',
  'widgetOrder',
  'appNewsSource',
  'appMaxTabsCount',
  'appAutoCloseMinutes',
  'appSingletonMode',
  'appSearchOpenNewTab',
  'appSearchRememberEngine',
  'appSearchDefaultEngine',
  'appSearchMath',
  'appSearchShowHistory',
  'appSearchSuggestionsEnabled',
  'appBookmarkOpenNewTab',
  'appBookmarkTextBg',
  'appBookmarkTextBgColor',
  'appBookmarkTextBgOpacity',
  'appBookmarkTextBgBlur',
  'appBookmarkFallbackColor',
  'appBookmarkFolderColor',
  'appPerformanceMode',
  'debugPerfOverlay',
  'appBatteryOptimization',
  'appCinemaMode',
  'appContainerMode',
  'appContainerNewTab',
  'appGridAnimationPref',
  'appGridAnimationSpeed',
  'appGridAnimationEnabled',
  'appGlassStylePref',
  'bookmarkCustomMetadata',
  'homebaseBookmarkRootId',
  'folderCustomMetadata',
  'domainIconMap',
  'lastUsedBookmarkFolderId',
  'homebaseRecentSaveFolders',
  'quoteUpdateFrequency',
  'quoteLocalIndexV1',
  'quoteTags',
  'searchEnginesConfig',
  'currentSearchEngineId',
  'cachedWeatherData',
  'cachedCityName',
  'cachedUnits',
  'weatherFetchedAt',
  'weatherLat',
  'weatherLon',
  'weatherCityName',
  'weatherUnits',
  'myWallpapers',
  'schemaVersion'
];

/**
 * In-memory backup transaction state tracker.
 */
let currentBackupTransaction = {
  state: 'idle', // 'idle' | 'import_request' | 'validate_backup' | 'create_snapshot' | 'calculate_delta' | 'apply_transaction' | 'verify_result' | 'committed' | 'rolling_back' | 'rolled_back' | 'failed'
  deltaKeys: [],
  timestamp: null
};

/**
 * Returns read-only metadata describing the active or latest backup transaction state.
 *
 * @returns {Object}
 */
function getBackupTransactionState() {
  return {
    state: currentBackupTransaction.state,
    deltaKeys: [...currentBackupTransaction.deltaKeys],
    timestamp: currentBackupTransaction.timestamp
  };
}

/**
 * Categorizes a transaction error into a privacy-safe standardized category string.
 * Never includes user data, URLs, titles, or raw variable contents.
 *
 * @param {Error|*} err
 * @returns {string}
 */
function categorizeTransactionError(err) {
  if (!err) return 'UNKNOWN_ERROR';
  const msg = String(err.message || '').toLowerCase();
  const name = String(err.name || '').toLowerCase();
  if (name.includes('quota') || msg.includes('quota')) return 'QUOTA_EXCEEDED';
  if (msg.includes('storage') || name.includes('storage')) return 'STORAGE_IO_ERROR';
  if (msg.includes('json') || msg.includes('parse')) return 'JSON_PARSE_ERROR';
  if (msg.includes('schema') || msg.includes('envelope')) return 'INVALID_SCHEMA';
  if (msg.includes('version')) return 'UNSUPPORTED_VERSION';
  if (msg.includes('audit')) return 'AUDIT_FAILED';
  if (msg.includes('migration')) return 'MIGRATION_ERROR';
  if (err instanceof TypeError) return 'TYPE_ERROR';
  return 'TRANSACTION_ERROR';
}


/**
 * Normalizes custom uploaded wallpaper entries from backup.
 *
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
function normalizeMyWallpapersItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!id || seen.has(id)) return null;
      seen.add(id);

      const title = typeof item.title === 'string' ? item.title.slice(0, 120) : 'My Wallpaper';
      const type = item.type === 'video' ? 'video' : 'image';
      const mimeType = typeof item.mimeType === 'string' ? item.mimeType.slice(0, 64) : '';
      const cacheKey = typeof item.cacheKey === 'string' ? item.cacheKey.slice(0, 256) : '';
      const posterCacheKey = typeof item.posterCacheKey === 'string' ? item.posterCacheKey.slice(0, 256) : '';
      const size = Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0;
      const posterSize = Number.isFinite(item.posterSize) && item.posterSize >= 0 ? Math.floor(item.posterSize) : 0;
      const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
      const lastUsedAt = Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0;
      const originalName = typeof item.originalName === 'string' ? item.originalName.slice(0, 180) : '';

      return {
        id,
        title,
        type,
        mimeType,
        cacheKey,
        posterCacheKey,
        size,
        posterSize,
        createdAt,
        lastUsedAt,
        originalName
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * Computes minimal mutation delta between candidate updates and current storage snapshot.
 *
 * @param {Object} currentSnapshot
 * @param {Object} candidateUpdates
 * @returns {Object}
 */
function computeStorageDelta(currentSnapshot, candidateUpdates) {
  const delta = {};
  if (!candidateUpdates || typeof candidateUpdates !== 'object') return delta;

  const areIdentical = (typeof areValuesIdentical === 'function')
    ? areValuesIdentical
    : (typeof window !== 'undefined' && typeof window.areValuesIdentical === 'function'
        ? window.areValuesIdentical
        : null);

  for (const [key, val] of Object.entries(candidateUpdates)) {
    if (!Object.prototype.hasOwnProperty.call(currentSnapshot, key)) {
      delta[key] = val;
    } else {
      const currentVal = currentSnapshot[key];
      if (areIdentical) {
        if (!areIdentical(currentVal, val)) {
          delta[key] = val;
        }
      } else {
        if (currentVal !== val) {
          if (typeof val === 'object' && val !== null) {
            if (JSON.stringify(currentVal) !== JSON.stringify(val)) {
              delta[key] = val;
            }
          } else {
            delta[key] = val;
          }
        }
      }
    }
  }
  return delta;
}

/**
 * Captures synchronous fast mirror state prior to transaction.
 *
 * @returns {Record<string, string|null>}
 */
function captureFastMirrorSnapshot() {
  const mirrorSnapshot = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    const keys = [
      'fast-bg-dim',
      'fast-widget-order',
      'fast-time-format',
      'fast-bookmark-bg',
      'fast-perf-mode',
      'fast-show-sidebar',
      'fast-show-weather',
      'fast-show-quote',
      'fast-show-news',
      'fast-show-todo'
    ];
    for (const k of keys) {
      try {
        mirrorSnapshot[k] = window.localStorage.getItem(k);
      } catch (_) {}
    }
  }
  return mirrorSnapshot;
}

/**
 * Restores synchronous fast mirror state during rollback.
 *
 * @param {Record<string, string|null>} snapshot
 */
function restoreFastMirrorSnapshot(snapshot) {
  if (!snapshot || typeof window === 'undefined' || !window.localStorage) return;
  for (const [key, val] of Object.entries(snapshot)) {
    try {
      if (val === null || val === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, String(val));
      }
    } catch (_) {}
  }
}

/**
 * Exports current dashboard configuration to a downloadable JSON file.
 *
 * @returns {Promise<void>}
 */
async function exportHomebaseState() {
  const storageApi = (typeof window !== 'undefined' && window.browser?.storage?.local) ||
    (typeof window !== 'undefined' && window.chrome?.storage?.local) ||
    (typeof browser !== 'undefined' && browser?.storage?.local) ||
    (typeof chrome !== 'undefined' && chrome?.storage?.local) || null;

  if (!storageApi && (!window.HomebaseStorage || !window.HomebaseStorage.snapshot)) {
    throw new Error('Storage is unavailable.');
  }

  let stored;
  if (typeof window !== 'undefined' && window.HomebaseStorage?.snapshot) {
    stored = await window.HomebaseStorage.snapshot();
  } else if (storageApi?.get) {
    stored = await storageApi.get(null);
  } else {
    throw new Error('Storage is unavailable.');
  }

  const storageLocal = {};
  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (stored && stored[key] !== undefined) {
      storageLocal[key] = stored[key];
    }
  });

  // Preserve non-colliding unknown safe keys (e.g. forward compatibility, migrationHistory)
  if (stored && typeof stored === 'object') {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const [key, val] of Object.entries(stored)) {
      if (!HOMEBASE_OWNED_STORAGE_KEYS.includes(key) && val !== undefined && !dangerousKeys.includes(key)) {
        storageLocal[key] = val;
      }
    }
  }


  const payload = {
    schema: HOMEBASE_BACKUP_SCHEMA,
    version: HOMEBASE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storageLocal
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `homebase-backup-${dateTag}.json`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Imports and applies a Homebase backup JSON file using atomic transactional restoration.
 *
 * Lifecycle:
 * IMPORT_REQUEST -> VALIDATE_BACKUP -> CREATE_SNAPSHOT -> CALCULATE_DELTA -> APPLY_TRANSACTION -> VERIFY_RESULT -> COMMIT
 * On failure: FAILURE -> ROLLBACK_SNAPSHOT
 *
 * @param {File|Blob|{ text: Function }} file
 * @returns {Promise<void>}
 */
async function importHomebaseState(file) {
  const storageApi = (typeof window !== 'undefined' && window.browser?.storage?.local) ||
    (typeof window !== 'undefined' && window.chrome?.storage?.local) ||
    (typeof browser !== 'undefined' && browser?.storage?.local) ||
    (typeof chrome !== 'undefined' && chrome?.storage?.local) || null;

  if (!storageApi && (!window.HomebaseStorage || !window.HomebaseStorage.get)) {
    throw new Error('Storage is unavailable.');
  }
  if (!file) {
    throw new Error('No backup file selected.');
  }

  // 1. IMPORT_REQUEST
  currentBackupTransaction = {
    state: 'import_request',
    deltaKeys: [],
    timestamp: new Date().toISOString()
  };

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (err) {
    currentBackupTransaction.state = 'failed';
    throw new Error('Invalid JSON file.');
  }

  // 2. VALIDATE_BACKUP
  currentBackupTransaction.state = 'validate_backup';

  if (!parsed || parsed.schema !== HOMEBASE_BACKUP_SCHEMA) {
    currentBackupTransaction.state = 'failed';
    throw new Error('Invalid backup schema.');
  }
  if (typeof parsed.version !== 'number' || parsed.version !== HOMEBASE_BACKUP_VERSION) {
    currentBackupTransaction.state = 'failed';
    throw new Error('Unsupported backup version.');
  }
  if (!isPlainObject(parsed.storageLocal)) {
    currentBackupTransaction.state = 'failed';
    throw new Error('Invalid backup payload.');
  }

  // Pre-flight diagnostic audit if available
  const diagnostics = typeof window !== 'undefined' && window.HomebaseDiagnostics;
  if (diagnostics && typeof diagnostics.auditBackupHealth === 'function') {
    const audit = diagnostics.auditBackupHealth(parsed);
    if (!audit || !audit.valid) {
      currentBackupTransaction.state = 'failed';
      throw new Error(`Invalid backup payload: ${(audit?.errors || []).join(', ') || 'Validation audit failed'}`);
    }
  }

  const incoming = parsed.storageLocal;
  const candidateUpdates = {};

  // Backward-compatible fallback: migrate legacy popup folder key if canonical key is missing
  if (
    Object.prototype.hasOwnProperty.call(incoming, 'homebaseLastUsedFolderId') &&
    !Object.prototype.hasOwnProperty.call(incoming, 'lastUsedBookmarkFolderId')
  ) {
    if (typeof incoming['homebaseLastUsedFolderId'] === 'string') {
      incoming['lastUsedBookmarkFolderId'] = incoming['homebaseLastUsedFolderId'];
    }
  }

  const batchSanitizer = (typeof window !== 'undefined' && window.HomebaseValidator?.sanitizeStorageBatch) ||
    (typeof sanitizeStorageBatch === 'function' ? sanitizeStorageBatch : null);

  if (batchSanitizer) {
    // Sanitize incoming keys without assigning defaults for omitted keys (non-destructive)
    const sanitizedCandidate = batchSanitizer(incoming, { fallbackToDefault: false });
    HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(sanitizedCandidate, key)) {
        candidateUpdates[key] = sanitizedCandidate[key];
      }
    });
    // Non-destructive: preserve unknown future keys that passed validation
    for (const [key, val] of Object.entries(sanitizedCandidate)) {
      if (!HOMEBASE_OWNED_STORAGE_KEYS.includes(key) && val !== undefined) {
        candidateUpdates[key] = val;
      }
    }
  } else {
    HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        if (key === 'todoItems') {
          if (Array.isArray(incoming[key])) {
            candidateUpdates[key] = typeof normalizeTodoItems === 'function'
              ? normalizeTodoItems(incoming[key])
              : incoming[key];
          }
          return;
        }
        if (key === 'todoHideDone') {
          if (typeof incoming[key] === 'boolean') {
            candidateUpdates[key] = incoming[key];
          }
          return;
        }
        if (key === 'myWallpapers') {
          if (Array.isArray(incoming[key])) {
            candidateUpdates[key] = normalizeMyWallpapersItems(incoming[key]);
          }
          return;
        }
        if (key === 'homebaseRecentSaveFolders') {
          if (Array.isArray(incoming[key])) {
            candidateUpdates[key] = incoming[key]
              .map((id) => (typeof id === 'string' ? id.trim() : ''))
              .filter(Boolean)
              .slice(0, 6);
          }
          return;
        }
        if (key === 'schemaVersion') {
          if (typeof incoming[key] === 'number' && Number.isInteger(incoming[key]) && incoming[key] > 0) {
            candidateUpdates[key] = incoming[key];
          }
          return;
        }
        candidateUpdates[key] = incoming[key];
      }
    });
    // Non-destructive: preserve unknown future keys even without validator
    for (const [key, val] of Object.entries(incoming)) {
      if (!HOMEBASE_OWNED_STORAGE_KEYS.includes(key) && val !== undefined && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        candidateUpdates[key] = val;
      }
    }
  }

  // 3. CREATE_SNAPSHOT
  currentBackupTransaction.state = 'create_snapshot';
  let storageSnapshot = {};
  if (typeof window !== 'undefined' && window.HomebaseStorage?.snapshot) {
    storageSnapshot = await window.HomebaseStorage.snapshot();
  } else if (storageApi?.get) {
    const raw = await storageApi.get(null);
    storageSnapshot = JSON.parse(JSON.stringify(raw || {}));
  }
  const mirrorSnapshot = captureFastMirrorSnapshot();

  // 4. CALCULATE_DELTA
  currentBackupTransaction.state = 'calculate_delta';
  const deltaUpdates = computeStorageDelta(storageSnapshot, candidateUpdates);
  const deltaKeys = Object.keys(deltaUpdates);
  currentBackupTransaction.deltaKeys = deltaKeys;

  // If delta is empty, no writes are needed
  if (deltaKeys.length === 0) {
    currentBackupTransaction.state = 'committed';
    if (typeof showCustomDialog === 'function') {
      showCustomDialog('Import complete', 'Homebase settings have been restored. Reloading...');
    }
    if (typeof window.location?.reload === 'function') {
      window.location.reload();
    }
    return;
  }

  // 5. APPLY_TRANSACTION & 6. VERIFY_RESULT
  currentBackupTransaction.state = 'apply_transaction';

  try {
    if (typeof window !== 'undefined' && window.HomebaseStorage?.setMany) {
      const writeResult = await window.HomebaseStorage.setMany(deltaUpdates);
      if (!writeResult || !writeResult.success) {
        throw new Error(writeResult?.detail || writeResult?.error || 'Storage write failed.');
      }
    } else if (storageApi?.set) {
      await storageApi.set(deltaUpdates);
      // Synchronize fast mirrors if HomebaseStorage not available
      if (typeof window !== 'undefined' && window.localStorage) {
        for (const [k, v] of Object.entries(deltaUpdates)) {
          if (k === 'appBackgroundDim' && Number.isFinite(v)) {
            try { localStorage.setItem('fast-bg-dim', String(v)); } catch (_) {}
          } else if (k === 'appTimeFormatPreference' && typeof v === 'string') {
            try { localStorage.setItem('fast-time-format', v); } catch (_) {}
          } else if (k === 'appShowSidebar' && typeof v === 'boolean') {
            try { localStorage.setItem('fast-show-sidebar', v ? '1' : '0'); } catch (_) {}
          } else if (k === 'appShowWeather' && typeof v === 'boolean') {
            try { localStorage.setItem('fast-show-weather', v ? '1' : '0'); } catch (_) {}
          } else if (k === 'appShowQuote' && typeof v === 'boolean') {
            try { localStorage.setItem('fast-show-quote', v ? '1' : '0'); } catch (_) {}
          } else if (k === 'appShowNews' && typeof v === 'boolean') {
            try { localStorage.setItem('fast-show-news', v ? '1' : '0'); } catch (_) {}
          } else if (k === 'appShowTodo' && typeof v === 'boolean') {
            try { localStorage.setItem('fast-show-todo', v ? '1' : '0'); } catch (_) {}
          }
        }
      }
    } else {
      throw new Error('Storage write API unavailable.');
    }

    // 6. VERIFY_RESULT
    currentBackupTransaction.state = 'verify_result';
    if (storageApi?.get) {
      const readBack = await storageApi.get(deltaKeys);
      for (const k of deltaKeys) {
        if (readBack[k] === undefined && deltaUpdates[k] !== undefined) {
          throw new Error(`Write verification failed for key: ${k}`);
        }
      }
    }

    // Post-import schema migration if incoming backup is older than CURRENT_SCHEMA_VERSION
    if (
      typeof window !== 'undefined' &&
      window.HomebaseMigrations?.runSchemaMigrations &&
      typeof deltaUpdates.schemaVersion === 'number' &&
      deltaUpdates.schemaVersion < window.CURRENT_SCHEMA_VERSION
    ) {
      const migResult = await window.HomebaseMigrations.runSchemaMigrations();
      if (migResult?.status === 'error') {
        throw new Error(`Post-import migration failed: ${(migResult.error && migResult.error.message) || 'Migration error'}`);
      }
    }

    // 7. COMMIT
    currentBackupTransaction.state = 'committed';

    if (typeof showCustomDialog === 'function') {
      showCustomDialog('Import complete', 'Homebase settings have been restored. Reloading...');
    }
    if (typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  } catch (err) {
    // FAILURE -> ROLLBACK_SNAPSHOT
    console.error('[Homebase Backup] Transaction failed. Executing atomic rollback...', err);
    currentBackupTransaction.state = 'rolling_back';

    // Selective rollback: only restore keys touched by deltaUpdates
    try {
      const rollbackSet = {};
      const rollbackRemove = [];

      for (const key of deltaKeys) {
        if (Object.prototype.hasOwnProperty.call(storageSnapshot, key)) {
          rollbackSet[key] = storageSnapshot[key];
        } else {
          rollbackRemove.push(key);
        }
      }

      if (rollbackRemove.length > 0 && typeof storageApi?.remove === 'function') {
        await storageApi.remove(rollbackRemove);
      }
      if (Object.keys(rollbackSet).length > 0 && typeof storageApi?.set === 'function') {
        await storageApi.set(rollbackSet);
      }

      // Restore fast mirrors
      restoreFastMirrorSnapshot(mirrorSnapshot);

      currentBackupTransaction.state = 'rolled_back';

      // Record privacy-safe anomaly (no raw user data or URLs)
      if (typeof window !== 'undefined' && window.HomebaseDiagnostics?.recordValidationAnomaly) {
        window.HomebaseDiagnostics.recordValidationAnomaly('backup_import', 'rollback_executed', {
          errorCategory: categorizeTransactionError(err)
        });
      }
    } catch (rollbackErr) {
      console.error('[Homebase Backup] CRITICAL: Rollback failed:', rollbackErr);
      currentBackupTransaction.state = 'failed';
    }

    if (typeof showCustomDialog === 'function') {
      showCustomDialog('Import failed', 'Import failed. Previous settings were safely restored.');
    }
    throw new Error('Import failed. Previous settings safely restored.');
  }
}

// Global namespace registration
window.HomebaseBackup = {
  HOMEBASE_BACKUP_SCHEMA,
  HOMEBASE_BACKUP_VERSION,
  HOMEBASE_OWNED_STORAGE_KEYS,
  exportState: exportHomebaseState,
  importState: importHomebaseState,
  computeStorageDelta,
  getBackupTransactionState,
  getTransactionState: getBackupTransactionState,
  categorizeTransactionError
};
