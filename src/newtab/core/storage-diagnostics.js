// ===============================================
// Homebase — Storage Health Diagnostics Architecture
// ===============================================

/**
 * In-memory circular ring buffer for validation anomalies.
 * Capped at 50 entries; strictly zero storage writes or persistence.
 */
const ANOMALY_BUFFER_MAX_SIZE = 50;
const validationAnomalyBuffer = [];

/**
 * Strict prototype inspection to ensure value is a plain JavaScript object.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype || (proto !== null && Object.getPrototypeOf(proto) === null);
}

/**
 * Sanitizes an anomaly detail payload to guarantee zero PII leakage.
 * Replaces any detected URLs, bookmark titles, todo text, or query parameters.
 *
 * @param {*} detail
 * @returns {*}
 */
function sanitizeAnomalyDetail(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') {
    if (/^(https?:|data:|blob:|chrome:|moz-extension:)/i.test(detail)) {
      return '[redacted_url]';
    }
    return detail.slice(0, 100);
  }
  if (typeof detail === 'number' && Number.isFinite(detail)) {
    return Math.round(detail * 100) / 100;
  }
  if (typeof detail === 'boolean') {
    return detail;
  }
  if (isPlainObject(detail)) {
    const clean = {};
    for (const [k, v] of Object.entries(detail)) {
      if (/url|src|href|poster|title|text|query|search|coords|lat|lon/i.test(k)) {
        clean[k] = v ? '[redacted]' : null;
      } else {
        clean[k] = sanitizeAnomalyDetail(v);
      }
    }
    return clean;
  }
  return null;
}

/**
 * Records a validation anomaly event into the in-memory circular ring buffer.
 * Capped at 50 entries. Zero disk or storage writes.
 *
 * @param {string} key - Storage key that triggered the anomaly
 * @param {string} action - Action taken (e.g. 'clamped', 'normalized', 'dropped', 'defaulted')
 * @param {*} [detail] - Privacy-safe diagnostic descriptor
 */
function recordValidationAnomaly(key, action, detail = null) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      key: typeof key === 'string' ? key.slice(0, 80) : 'unknown',
      action: typeof action === 'string' ? action.slice(0, 40) : 'unspecified',
      detail: sanitizeAnomalyDetail(detail)
    };

    validationAnomalyBuffer.push(entry);

    if (validationAnomalyBuffer.length > ANOMALY_BUFFER_MAX_SIZE) {
      validationAnomalyBuffer.shift();
    }
  } catch (_) {
    // Non-blocking in-memory telemetry only.
  }
}

/**
 * Returns a copy of the current validation anomaly ring buffer.
 *
 * @returns {Array<Object>}
 */
function getValidationAnomalies() {
  return [...validationAnomalyBuffer];
}

/**
 * Clears the in-memory validation anomaly ring buffer.
 */
function clearValidationAnomalies() {
  validationAnomalyBuffer.length = 0;
}

/**
 * Diagnostic categorization helper that determines the failure code for invalid keys.
 *
 * @param {string} key
 * @param {*} value
 * @param {Object} [def] - Schema definition if available
 * @returns {{ failureType: string, detail: string }}
 */
function diagnoseKeyFailure(key, value, def) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return { failureType: 'PROTOTYPE_POLLUTION', detail: 'Forbidden prototype property name' };
  }
  if (!def) {
    return { failureType: 'UNKNOWN_KEY', detail: 'Key not registered in canonical schema definitions' };
  }
  if (value === null || value === undefined) {
    return { failureType: 'NULL_OR_UNDEFINED', detail: 'Value is null or undefined where not permitted' };
  }
  if (Array.isArray(value)) {
    return { failureType: 'MALFORMED_ARRAY', detail: 'Array format or element schema violation' };
  }
  if (typeof value === 'object') {
    return { failureType: 'MALFORMED_OBJECT', detail: 'Object format or structure schema violation' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { failureType: 'NON_FINITE_NUMBER', detail: 'Number is NaN or Infinity' };
    }
    return { failureType: 'OUT_OF_BOUNDS', detail: 'Numeric value out of declared boundary range' };
  }
  if (typeof value === 'string' && (key.includes('Color') || key.includes('color'))) {
    return { failureType: 'MALFORMED_HEX', detail: 'Invalid hex color code format' };
  }
  if (typeof value === 'string') {
    return { failureType: 'INVALID_ENUM', detail: 'String value not in declared allowed options' };
  }
  return { failureType: 'TYPE_MISMATCH', detail: `Unexpected type encountered: ${typeof value}` };
}

/**
 * Audits the global storage state by reading browser.storage.local.get(null).
 * Strictly read-only; never writes or modifies storage.
 *
 * @param {Object} [customBrowserApi] - Optional mock browser API for testing
 * @returns {Promise<Object>} Structured StorageHealthReport
 */
async function auditStorageHealth(customBrowserApi = null) {
  const browserInstance = customBrowserApi || (typeof window !== 'undefined' ? (window.browser || window.chrome) : null);
  if (!browserInstance?.storage?.local) {
    return {
      status: 'UNAVAILABLE',
      timestamp: new Date().toISOString(),
      error: 'Storage API is unavailable',
      counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0, unknown: 0 },
      keys: { valid: [], recoverable: [], corrupted: [], unknown: [] },
      schemaVersion: { stored: null, expected: 1, status: 'UNKNOWN' },
      anomalies: getValidationAnomalies()
    };
  }

  try {
    const stored = (await browserInstance.storage.local.get(null)) || {};
    const validator = (typeof window !== 'undefined' && window.HomebaseValidator) ||
      (typeof HomebaseValidator !== 'undefined' ? HomebaseValidator : null);
    const definitions = validator?.SCHEMA_DEFINITIONS ||
      (typeof SCHEMA_DEFINITIONS !== 'undefined' ? SCHEMA_DEFINITIONS : {});
    const expectedVersion = (typeof window !== 'undefined' && window.CURRENT_SCHEMA_VERSION) ||
      (typeof CURRENT_SCHEMA_VERSION !== 'undefined' ? CURRENT_SCHEMA_VERSION : 1);

    const validKeys = [];
    const recoverableKeys = [];
    const corruptedKeys = [];
    const unknownKeys = [];

    // Evaluate stored schemaVersion
    let versionStatus = 'ALIGNED';
    const storedVersion = stored.schemaVersion;
    if (storedVersion === undefined || storedVersion === null) {
      versionStatus = 'LEGACY_UNVERSIONED';
    } else if (typeof storedVersion !== 'number' || !Number.isInteger(storedVersion) || storedVersion <= 0) {
      versionStatus = 'CORRUPTED';
      corruptedKeys.push({
        key: 'schemaVersion',
        failureType: 'TYPE_MISMATCH',
        detail: 'schemaVersion must be a positive integer'
      });
    } else if (storedVersion < expectedVersion) {
      versionStatus = 'OUTDATED';
      validKeys.push('schemaVersion');
    } else if (storedVersion > expectedVersion) {
      versionStatus = 'FUTURE_DOWNGRADE';
      validKeys.push('schemaVersion');
    } else {
      versionStatus = 'ALIGNED';
      validKeys.push('schemaVersion');
    }

    // Evaluate all remaining storage keys
    for (const [key, value] of Object.entries(stored)) {
      if (key === 'schemaVersion') continue;

      if (key === 'storageMigrationHistory') {
        if (Array.isArray(value)) {
          validKeys.push(key);
        } else {
          recoverableKeys.push({
            key,
            failureType: 'MALFORMED_ARRAY',
            detail: 'storageMigrationHistory should be an array'
          });
        }
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(definitions, key)) {
        const def = definitions[key];
        const isValid = validator?.validateKey ? validator.validateKey(key, value) : def.validate(value);

        if (isValid) {
          validKeys.push(key);
        } else {
          const sanitized = validator?.sanitizeKey
            ? validator.sanitizeKey(key, value, { fallbackToDefault: false })
            : def.sanitize(value, false);

          const failure = diagnoseKeyFailure(key, value, def);

          if (sanitized !== undefined) {
            recoverableKeys.push({
              key,
              failureType: failure.failureType,
              detail: failure.detail
            });
          } else {
            corruptedKeys.push({
              key,
              failureType: failure.failureType,
              detail: failure.detail
            });
          }
        }
      } else {
        unknownKeys.push(key);
      }
    }

    // Determine overall health status
    let status = 'HEALTHY';
    if (corruptedKeys.length > 0 || versionStatus === 'FUTURE_DOWNGRADE' || versionStatus === 'CORRUPTED') {
      status = 'CORRUPTED';
    } else if (
      recoverableKeys.length > 0 ||
      versionStatus === 'LEGACY_UNVERSIONED' ||
      versionStatus === 'OUTDATED' ||
      unknownKeys.length > 0
    ) {
      status = 'DEGRADED';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      schemaVersion: {
        stored: storedVersion ?? null,
        expected: expectedVersion,
        status: versionStatus
      },
      counts: {
        total: Object.keys(stored).length,
        valid: validKeys.length,
        recoverable: recoverableKeys.length,
        corrupted: corruptedKeys.length,
        unknown: unknownKeys.length
      },
      keys: {
        valid: validKeys,
        recoverable: recoverableKeys,
        corrupted: corruptedKeys,
        unknown: unknownKeys
      },
      anomalies: getValidationAnomalies()
    };
  } catch (err) {
    return {
      status: 'CORRUPTED',
      timestamp: new Date().toISOString(),
      error: err.message,
      counts: { total: 0, valid: 0, recoverable: 0, corrupted: 1, unknown: 0 },
      keys: { valid: [], recoverable: [], corrupted: [{ key: 'storage_read', failureType: 'EXCEPTION', detail: err.message }], unknown: [] },
      schemaVersion: { stored: null, expected: 1, status: 'UNKNOWN' },
      anomalies: getValidationAnomalies()
    };
  }
}

/**
 * Pre-flight auditor for backup JSON payloads before restoration.
 * Strictly in-memory; never writes to storage or imports data.
 *
 * @param {string|Object} jsonStringOrObject - Backup content to analyze
 * @returns {Object} Structured BackupHealthReport
 */
function auditBackupHealth(jsonStringOrObject) {
  let parsed = jsonStringOrObject;

  if (typeof jsonStringOrObject === 'string') {
    try {
      parsed = JSON.parse(jsonStringOrObject);
    } catch (err) {
      return {
        valid: false,
        error: `Invalid JSON format: ${err.message}`,
        envelope: { isValid: false, schema: null, version: null, exportedAt: null },
        counts: { total: 0, valid: 0, recoverable: 0, invalid: 0, unknown: 0 },
        keys: { valid: [], recoverable: [], invalid: [], unknown: [] },
        criticalKeysPresent: {
          schemaVersion: false,
          widgetOrder: false,
          todoItems: false,
          wallpaperSelection: false,
          myWallpapers: false
        },
        errors: ['Malformed JSON payload syntax']
      };
    }
  }

  const errors = [];
  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      error: 'Backup payload must be a plain JSON object',
      envelope: { isValid: false, schema: null, version: null, exportedAt: null },
      counts: { total: 0, valid: 0, recoverable: 0, invalid: 0, unknown: 0 },
      keys: { valid: [], recoverable: [], invalid: [], unknown: [] },
      criticalKeysPresent: { schemaVersion: false, widgetOrder: false, todoItems: false, wallpaperSelection: false, myWallpapers: false },
      errors: ['Root payload is not an object']
    };
  }

  const schemaMatch = parsed.schema === 'homebase.export';
  const versionMatch = typeof parsed.version === 'number' && parsed.version === 1;
  const storageLocalValid = isPlainObject(parsed.storageLocal);

  if (!schemaMatch) errors.push('Unsupported or invalid backup schema identifier');
  if (!versionMatch) errors.push('Unsupported backup envelope version');
  if (!storageLocalValid) errors.push('Missing or invalid storageLocal data dictionary');

  const incoming = storageLocalValid ? parsed.storageLocal : {};
  const validator = (typeof window !== 'undefined' && window.HomebaseValidator) ||
    (typeof HomebaseValidator !== 'undefined' ? HomebaseValidator : null);
  const definitions = validator?.SCHEMA_DEFINITIONS ||
    (typeof SCHEMA_DEFINITIONS !== 'undefined' ? SCHEMA_DEFINITIONS : {});

  const validKeys = [];
  const recoverableKeys = [];
  const invalidKeys = [];
  const unknownKeys = [];

  for (const [key, value] of Object.entries(incoming)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      invalidKeys.push({ key, failureType: 'PROTOTYPE_POLLUTION', detail: 'Forbidden property' });
      continue;
    }

    if (key === 'schemaVersion') {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        validKeys.push(key);
      } else {
        invalidKeys.push({ key, failureType: 'TYPE_MISMATCH', detail: 'schemaVersion must be positive integer' });
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(definitions, key)) {
      const def = definitions[key];
      const isValid = validator?.validateKey ? validator.validateKey(key, value) : def.validate(value);

      if (isValid) {
        validKeys.push(key);
      } else {
        const sanitized = validator?.sanitizeKey
          ? validator.sanitizeKey(key, value, { fallbackToDefault: false })
          : def.sanitize(value, false);

        const failure = diagnoseKeyFailure(key, value, def);

        if (sanitized !== undefined) {
          recoverableKeys.push({ key, failureType: failure.failureType, detail: failure.detail });
        } else {
          invalidKeys.push({ key, failureType: failure.failureType, detail: failure.detail });
        }
      }
    } else {
      unknownKeys.push(key);
    }
  }

  const criticalKeysPresent = {
    schemaVersion: Object.prototype.hasOwnProperty.call(incoming, 'schemaVersion'),
    widgetOrder: Object.prototype.hasOwnProperty.call(incoming, 'widgetOrder'),
    todoItems: Object.prototype.hasOwnProperty.call(incoming, 'todoItems'),
    wallpaperSelection: Object.prototype.hasOwnProperty.call(incoming, 'wallpaperSelection'),
    myWallpapers: Object.prototype.hasOwnProperty.call(incoming, 'myWallpapers')
  };

  const isEnvelopeValid = schemaMatch && versionMatch && storageLocalValid;
  const isHealthy = isEnvelopeValid && invalidKeys.length === 0;

  return {
    valid: isHealthy,
    envelope: {
      isValid: isEnvelopeValid,
      schema: parsed.schema ?? null,
      version: parsed.version ?? null,
      exportedAt: parsed.exportedAt ?? null
    },
    counts: {
      total: Object.keys(incoming).length,
      valid: validKeys.length,
      recoverable: recoverableKeys.length,
      invalid: invalidKeys.length,
      unknown: unknownKeys.length
    },
    keys: {
      valid: validKeys,
      recoverable: recoverableKeys,
      invalid: invalidKeys,
      unknown: unknownKeys
    },
    criticalKeysPresent,
    errors
  };
}

/**
 * Compiles a structured, privacy-safe Markdown/Text diagnostic report.
 * Strictly excludes all bookmark URLs, bookmark titles, todo texts, search queries, and wallpaper URLs.
 *
 * @param {Object} [healthReport] - Pre-computed report from auditStorageHealth()
 * @returns {string} Formatted, privacy-safe text report
 */
function generateHealthReport(healthReport = null) {
  const report = healthReport || {
    status: 'UNKNOWN',
    timestamp: new Date().toISOString(),
    schemaVersion: { stored: 'unknown', expected: 1, status: 'UNKNOWN' },
    counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0, unknown: 0 },
    keys: { valid: [], recoverable: [], corrupted: [], unknown: [] },
    anomalies: getValidationAnomalies()
  };

  const lines = [];
  lines.push('=========================================');
  lines.push('Homebase Storage Health Diagnostic Report');
  lines.push('=========================================');
  lines.push(`Generated: ${report.timestamp || new Date().toISOString()}`);
  lines.push(`Overall Health Status: ${report.status || 'UNKNOWN'}`);
  lines.push('');

  lines.push('--- Schema Version ---');
  lines.push(`Stored Version: ${report.schemaVersion?.stored ?? 'none'}`);
  lines.push(`Target Version: ${report.schemaVersion?.expected ?? 1}`);
  lines.push(`Version Alignment: ${report.schemaVersion?.status ?? 'UNKNOWN'}`);
  lines.push('');

  lines.push('--- Key Diagnostics Summary ---');
  lines.push(`Total Keys Evaluated: ${report.counts?.total ?? 0}`);
  lines.push(`Valid Keys:           ${report.counts?.valid ?? 0}`);
  lines.push(`Recoverable Keys:     ${report.counts?.recoverable ?? 0}`);
  lines.push(`Corrupted Keys:       ${report.counts?.corrupted ?? 0}`);
  lines.push(`Unknown/Future Keys:  ${report.counts?.unknown ?? 0}`);
  lines.push('');

  if (Array.isArray(report.keys?.corrupted) && report.keys.corrupted.length > 0) {
    lines.push('--- Corrupted Keys (Requires Attention) ---');
    report.keys.corrupted.forEach((entry) => {
      lines.push(`- ${entry.key}: ${entry.failureType} (${entry.detail})`);
    });
    lines.push('');
  }

  if (Array.isArray(report.keys?.recoverable) && report.keys.recoverable.length > 0) {
    lines.push('--- Recoverable Anomalies (Auto-Normalized) ---');
    report.keys.recoverable.forEach((entry) => {
      lines.push(`- ${entry.key}: ${entry.failureType} (${entry.detail})`);
    });
    lines.push('');
  }

  if (Array.isArray(report.anomalies) && report.anomalies.length > 0) {
    lines.push('--- Recent Validation Anomaly Buffer ---');
    report.anomalies.slice(-10).forEach((anomaly) => {
      lines.push(`- [${anomaly.timestamp}] ${anomaly.key} -> ${anomaly.action}`);
    });
    lines.push('');
  }

  lines.push('--- Privacy & Security Notice ---');
  lines.push('This diagnostic report contains structural metadata and error codes only.');
  lines.push('Personal bookmark titles, bookmark URLs, todo list contents, search queries,');
  lines.push('and remote wallpaper URLs are strictly excluded and never recorded.');
  lines.push('=========================================');

  return lines.join('\n');
}

/**
 * Copies a sanitized diagnostic health report to the user clipboard.
 *
 * @param {Object} [options]
 * @param {Object} [options.customBrowserApi]
 * @returns {Promise<{ success: boolean, method?: string, error?: string }>}
 */
async function exportHealthReport(options = {}) {
  try {
    const audit = await auditStorageHealth(options.customBrowserApi);
    const reportText = generateHealthReport(audit);

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(reportText);
      return { success: true, method: 'clipboard' };
    }

    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = reportText;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return { success: Boolean(copied), method: 'execCommand' };
    }

    return { success: false, error: 'Clipboard API is unavailable in this environment' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Global and namespace registration
if (typeof window !== 'undefined') {
  window.auditStorageHealth = auditStorageHealth;
  window.auditBackupHealth = auditBackupHealth;
  window.recordValidationAnomaly = recordValidationAnomaly;
  window.getValidationAnomalies = getValidationAnomalies;
  window.clearValidationAnomalies = clearValidationAnomalies;
  window.generateHealthReport = generateHealthReport;
  window.exportHealthReport = exportHealthReport;
  window.HomebaseDiagnostics = {
    auditStorageHealth,
    auditBackupHealth,
    recordValidationAnomaly,
    getValidationAnomalies,
    clearValidationAnomalies,
    generateHealthReport,
    exportHealthReport
  };
}
