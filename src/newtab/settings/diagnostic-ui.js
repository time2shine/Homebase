// ===============================================
// Homebase — Developer Debug Panel & Diagnostic UI
// ===============================================

(function () {
  'use strict';

  /**
   * Formats a raw health status string into UI presentation metadata.
   *
   * @param {string} status - 'HEALTHY' | 'DEGRADED' | 'CORRUPTED' | 'UNKNOWN'
   * @returns {{ label: string, className: string, description: string }}
   */
  function formatHealthStatus(status) {
    switch (status) {
      case 'HEALTHY':
        return {
          label: 'Healthy',
          className: 'app-settings-diagnostic-badge--healthy',
          description: 'All storage items and settings are valid and schema-aligned.'
        };
      case 'DEGRADED':
        return {
          label: 'Degraded',
          className: 'app-settings-diagnostic-badge--degraded',
          description: 'Recoverable schema anomalies detected and normalized. No data lost.'
        };
      case 'CORRUPTED':
        return {
          label: 'Corrupted',
          className: 'app-settings-diagnostic-badge--corrupted',
          description: 'Storage format errors or unaligned keys detected. Attention recommended.'
        };
      default:
        return {
          label: 'Unknown',
          className: 'app-settings-diagnostic-badge--degraded',
          description: 'Unable to evaluate storage state.'
        };
    }
  }

  /**
   * Creates the navigation item element for Settings sidebar.
   *
   * @returns {HTMLElement}
   */
  function createDiagnosticsNavItem() {
    const navItem = document.createElement('button');
    navItem.className = 'app-settings-nav-item';
    navItem.dataset.section = 'diagnostics';
    navItem.innerHTML = `
      <span class="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
      </span>
      <span class="nav-label">Diagnostics</span>
    `;
    return navItem;
  }

  /**
   * Creates the empty section container for the Settings modal.
   *
   * @returns {HTMLElement}
   */
  function createDiagnosticsSection() {
    const section = document.createElement('section');
    section.className = 'app-settings-section';
    section.dataset.section = 'diagnostics';

    const header = document.createElement('div');
    header.className = 'app-settings-about-header app-settings-diagnostic-header';

    const title = document.createElement('div');
    title.className = 'app-settings-about-title app-settings-diagnostic-title';
    title.textContent = 'System & Storage Diagnostics';
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'app-settings-about-meta app-settings-diagnostic-meta';
    meta.textContent = 'Live health assessment, schema validation audit, and diagnostic reports.';
    header.appendChild(meta);
    section.appendChild(header);

    const container = document.createElement('div');
    container.className = 'app-settings-diagnostic-container';
    section.appendChild(container);

    return section;
  }

  /**
   * Renders a single diagnostic metric card.
   *
   * @param {string} label
   * @param {string|number} value
   * @param {string} [hint]
   * @returns {HTMLElement}
   */
  function renderMetricCard(label, value, hint = '') {
    const card = document.createElement('div');
    card.className = 'app-settings-diagnostic-card';

    const valEl = document.createElement('div');
    valEl.className = 'app-settings-diagnostic-card-value';
    valEl.textContent = String(value ?? 0);
    card.appendChild(valEl);

    const lblEl = document.createElement('div');
    lblEl.className = 'app-settings-diagnostic-card-label';
    lblEl.textContent = label;
    card.appendChild(lblEl);

    if (hint) {
      const hintEl = document.createElement('div');
      hintEl.className = 'app-settings-diagnostic-card-hint';
      hintEl.textContent = hint;
      card.appendChild(hintEl);
    }

    return card;
  }

  /**
   * Handles copying the diagnostic health report to clipboard with button feedback.
   *
   * @param {HTMLButtonElement} button
   * @param {Function} [customExportFn]
   * @returns {Promise<boolean>}
   */
  async function handleCopyReport(button, customExportFn = null) {
    if (!button || button.disabled) return false;
    button.disabled = true;
    const originalText = button.textContent;

    try {
      let result = null;
      if (typeof customExportFn === 'function') {
        result = await customExportFn();
      } else if (window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.exportHealthReport === 'function') {
        result = await window.HomebaseDiagnostics.exportHealthReport();
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        const report = window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.generateHealthReport === 'function'
          ? window.HomebaseDiagnostics.generateHealthReport()
          : 'Homebase Diagnostics Report (Fallback)';
        await navigator.clipboard.writeText(report);
        result = { success: true, method: 'clipboard' };
      }

      if (result && result.success) {
        button.textContent = 'Copied to Clipboard!';
        return true;
      }

      button.textContent = 'Copy Failed';
      return false;
    } catch (_) {
      button.textContent = 'Copy Failed';
      return false;
    } finally {
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2500);
      } else {
        button.textContent = originalText;
        button.disabled = false;
      }
    }
  }

  // ===============================================
  // Subsystem Domain Categorization & Health Matrix
  // ===============================================

  /**
   * The 74 canonical storage schema keys mapped across 5 operational domains.
   */
  const SUBSYSTEM_CATEGORIES = {
    system: {
      id: 'system',
      label: 'System & Core',
      keys: [
        'schemaVersion', 'appPerformanceMode', 'debugPerfOverlay', 'appBatteryOptimization',
        'appCinemaMode', 'appContainerMode', 'appContainerNewTab', 'appBackgroundDim',
        'appGlassStylePref', 'appShowSidebar', 'appMaxTabsCount', 'appAutoCloseMinutes',
        'appSingletonMode', 'appTimeFormatPreference'
      ]
    },
    bookmarks: {
      id: 'bookmarks',
      label: 'Bookmarks & Grid',
      keys: [
        'appGridAnimationPref', 'appGridAnimationSpeed', 'appGridAnimationEnabled',
        'appBookmarkOpenNewTab', 'appBookmarkTextBg', 'appBookmarkTextBgColor',
        'appBookmarkTextBgOpacity', 'appBookmarkTextBgBlur', 'appBookmarkFallbackColor',
        'appBookmarkFolderColor', 'bookmarkCustomMetadata', 'homebaseBookmarkRootId',
        'folderCustomMetadata', 'domainIconMap', 'lastUsedBookmarkFolderId',
        'homebaseRecentSaveFolders'
      ]
    },
    wallpapers: {
      id: 'wallpapers',
      label: 'Wallpapers & Media',
      keys: [
        'wallpaperSelection', 'cachedAppliedPosterUrl', 'cachedAppliedPosterDataUrl',
        'cachedAppliedPoster', 'cachedAppliedVideoUrl', 'videosManifest',
        'videosManifestFetchedAt', 'cachedGalleryPosters', 'wallpaperPoolIds',
        'wallpaperFallbackUsedAt', 'pendingDailyRotation', 'pendingDailyRotationSince',
        'galleryFavorites', 'dailyWallpaperEnabled', 'wallpaperTypePreference',
        'wallpaperQualityPreference', 'myWallpapers'
      ]
    },
    widgets: {
      id: 'widgets',
      label: 'Widgets & Dock',
      keys: [
        'appShowWeather', 'appShowQuote', 'appShowNews', 'appShowTodo',
        'widgetOrder', 'appNewsSource', 'todoItems', 'todoHideDone',
        'quoteUpdateFrequency', 'quoteLocalIndexV1', 'quoteTags',
        'cachedWeatherData', 'cachedCityName', 'cachedUnits',
        'weatherFetchedAt', 'weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits'
      ]
    },
    search: {
      id: 'search',
      label: 'Search Panel',
      keys: [
        'appSearchOpenNewTab', 'appSearchRememberEngine', 'appSearchDefaultEngine',
        'appSearchMath', 'appSearchShowHistory', 'appSearchSuggestionsEnabled',
        'currentSearchEngineId', 'searchEnginesConfig'
      ]
    }
  };

  /**
   * Computes health breakdown metrics for each functional subsystem.
   * Strictly inspects key names and error codes; never accesses user values.
   *
   * @param {Object} [audit]
   * @returns {Object}
   */
  function computeSubsystemHealth(audit) {
    const validKeysSet = new Set(Array.isArray(audit?.keys?.valid) ? audit.keys.valid : []);
    const recoverableMap = new Map();
    if (Array.isArray(audit?.keys?.recoverable)) {
      audit.keys.recoverable.forEach((item) => {
        const k = typeof item === 'string' ? item : item?.key;
        if (k) recoverableMap.set(k, item);
      });
    }
    const corruptedMap = new Map();
    if (Array.isArray(audit?.keys?.corrupted)) {
      audit.keys.corrupted.forEach((item) => {
        const k = typeof item === 'string' ? item : item?.key;
        if (k) corruptedMap.set(k, item);
      });
    }

    const result = {};

    for (const [catKey, catDef] of Object.entries(SUBSYSTEM_CATEGORIES)) {
      const totalKeys = catDef.keys.length;
      let validCount = 0;
      let recoverableCount = 0;
      let corruptedCount = 0;

      catDef.keys.forEach((k) => {
        if (corruptedMap.has(k)) {
          corruptedCount += 1;
        } else if (recoverableMap.has(k)) {
          recoverableCount += 1;
        } else if (validKeysSet.has(k) || (validKeysSet.size === 0 && audit?.status === 'HEALTHY')) {
          validCount += 1;
        } else {
          validCount += 1;
        }
      });

      let status = 'HEALTHY';
      let statusLabel = 'Healthy';
      let statusClass = 'app-settings-diagnostic-chip--healthy';

      if (corruptedCount > 0) {
        status = 'CORRUPTED';
        statusLabel = `${corruptedCount} Corrupted`;
        statusClass = 'app-settings-diagnostic-chip--corrupted';
      } else if (recoverableCount > 0) {
        status = 'DEGRADED';
        statusLabel = `${recoverableCount} Warning`;
        statusClass = 'app-settings-diagnostic-chip--degraded';
      }

      result[catKey] = {
        id: catDef.id,
        label: catDef.label,
        status,
        statusLabel,
        statusClass,
        validCount,
        totalKeys,
        recoverableCount,
        corruptedCount
      };
    }

    return result;
  }

  /**
   * Safely constructs the Subsystem Health Matrix block via DOM APIs.
   *
   * @param {Object} [audit]
   * @returns {HTMLElement}
   */
  function createSubsystemMatrixBlock(audit) {
    const block = document.createElement('div');
    block.className = 'app-settings-diagnostic-subsystems';

    const title = document.createElement('div');
    title.className = 'app-settings-diagnostic-detail-title';
    title.textContent = 'Subsystem Health Matrix';
    block.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'app-settings-diagnostic-subsystems-grid';

    const subsystems = computeSubsystemHealth(audit);

    Object.values(subsystems).forEach((sub) => {
      const card = document.createElement('div');
      card.className = 'app-settings-diagnostic-subsystem-card';

      const header = document.createElement('div');
      header.className = 'app-settings-diagnostic-subsystem-header';

      const name = document.createElement('span');
      name.className = 'app-settings-diagnostic-subsystem-name';
      name.textContent = sub.label;
      header.appendChild(name);

      const chip = document.createElement('span');
      chip.className = `app-settings-diagnostic-chip ${sub.statusClass}`;
      chip.textContent = sub.statusLabel;
      header.appendChild(chip);

      card.appendChild(header);

      const counts = document.createElement('div');
      counts.className = 'app-settings-diagnostic-subsystem-counts';
      counts.textContent = `${sub.validCount}/${sub.totalKeys} keys valid`;
      card.appendChild(counts);

      grid.appendChild(card);
    });

    block.appendChild(grid);
    return block;
  }

  // ===============================================
  // Storage Quota Telemetry (Aggregate-Only Privacy)
  // ===============================================
  const DEFAULT_STORAGE_QUOTA_BYTES = 5242880; // 5 MB

  /**
   * Calculates storage quota usage asynchronously.
   * Strictly adheres to the Privacy Constraint: returns only aggregate numbers.
   * Never exposes individual key sizes, bookmark data, wallpaper information, or user content.
   *
   * @param {Object} [customBrowserApi]
   * @returns {Promise<{ bytesUsed: number, quotaLimit: number, percentage: number, formatted: string }>}
   */
  async function getStorageQuotaTelemetry(customBrowserApi = null) {
    const browserInstance = customBrowserApi || (typeof window !== 'undefined' ? (window.browser || window.chrome) : null);
    let bytesUsed = 0;
    const quotaLimit = DEFAULT_STORAGE_QUOTA_BYTES;

    if (browserInstance?.storage?.local) {
      let resolvedBytes = null;
      if (typeof browserInstance.storage.local.getBytesInUse === 'function') {
        try {
          const res = browserInstance.storage.local.getBytesInUse(null);
          if (res && typeof res.then === 'function') {
            const val = await res;
            if (typeof val === 'number' && Number.isFinite(val)) {
              resolvedBytes = val;
            }
          }
        } catch (_) {}

        if (resolvedBytes === null) {
          resolvedBytes = await new Promise((resolve) => {
            try {
              browserInstance.storage.local.getBytesInUse(null, (val) => {
                if (typeof val === 'number' && Number.isFinite(val)) {
                  resolve(val);
                } else {
                  resolve(null);
                }
              });
            } catch (_) {
              resolve(null);
            }
          });
        }
      }

      if (resolvedBytes !== null) {
        bytesUsed = resolvedBytes;
      } else if (typeof browserInstance.storage.local.get === 'function') {
        try {
          const allItems = (await browserInstance.storage.local.get(null)) || {};
          let totalBytes = 0;
          for (const [k, v] of Object.entries(allItems)) {
            try {
              const json = JSON.stringify(v);
              totalBytes += (k.length + (json ? json.length : 0)) * 2;
            } catch (_) {}
          }
          bytesUsed = totalBytes;
        } catch (_) {
          bytesUsed = 0;
        }
      }
    }

    const percentage = quotaLimit > 0 ? Math.min(100, Math.round((bytesUsed / quotaLimit) * 1000) / 10) : 0;
    const usedKb = (bytesUsed / 1024).toFixed(1);
    const limitMb = (quotaLimit / (1024 * 1024)).toFixed(1);

    return {
      bytesUsed,
      quotaLimit,
      percentage,
      formatted: `${usedKb} KB / ${limitMb} MB (${percentage}%)`
    };
  }

  // ===============================================
  // Storage Auto-Remediation (Minimal Mutation Invariant)
  // ===============================================

  /**
   * Helper to check deep structural equality of two JSON values.
   *
   * @param {*} a
   * @param {*} b
   * @returns {boolean}
   */
  function areValuesIdentical(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }

  /**
   * Safely auto-repairs degraded or unaligned storage items without data loss.
   * Adheres strictly to the Minimal Mutation Write Invariant:
   * 1. Read existing storage snapshot.
   * 2. Sanitize in memory.
   * 3. Compare original and sanitized values.
   * 4. Create minimal patch object containing only changed keys.
   * 5. Write only changed keys using browser.storage.local.set().
   * Unchanged keys and unknown keys must never be written or deleted.
   *
   * @param {HTMLButtonElement} button
   * @param {Object} [customBrowserApi]
   * @param {Object} [customValidator]
   * @returns {Promise<{ repaired: boolean, count: number, patch?: Object, error?: string }>}
   */
  async function handleAutoRepairStorage(button, customBrowserApi = null, customValidator = null) {
    if (button && button.disabled) return { repaired: false, count: 0 };
    let originalText = '';
    if (button) {
      button.disabled = true;
      originalText = button.textContent;
      if (button.dataset) {
        button.dataset.originalText = originalText;
      }
      button.textContent = 'Repairing...';
    }

    const browserInstance = customBrowserApi || (typeof window !== 'undefined' ? (window.browser || window.chrome) : null);
    const validator = customValidator || (typeof window !== 'undefined' ? window.HomebaseValidator : null);

    if (!browserInstance?.storage?.local || !validator?.sanitizeStorageBatch) {
      if (button) {
        button.textContent = 'Repair Unavailable';
        setTimeout(() => {
          button.textContent = (button.dataset && button.dataset.originalText) || originalText || 'Auto-Repair Storage';
          button.disabled = false;
        }, 2500);
      }
      return { repaired: false, count: 0 };
    }

    try {
      // 1. Read existing storage snapshot
      const snapshot = (await browserInstance.storage.local.get(null)) || {};

      // 2. Sanitize in memory (fallbackToDefault: false ensures unrecoverable/unknown keys are preserved)
      const sanitized = validator.sanitizeStorageBatch(snapshot, { fallbackToDefault: false });

      // Ensure valid schemaVersion if missing or corrupted
      const targetVersion = (typeof window !== 'undefined' && window.CURRENT_SCHEMA_VERSION) || 1;
      if (sanitized.schemaVersion === undefined && (snapshot.schemaVersion === undefined || snapshot.schemaVersion === null || !Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1)) {
        sanitized.schemaVersion = targetVersion;
      }

      // 3. Compare original and sanitized values
      // 4. Create minimal patch object containing ONLY changed keys
      const patch = {};
      for (const [key, cleanVal] of Object.entries(sanitized)) {
        if (!areValuesIdentical(snapshot[key], cleanVal)) {
          patch[key] = cleanVal;
        }
      }

      const changedCount = Object.keys(patch).length;

      // 5. Write ONLY changed keys using browser.storage.local.set()
      if (changedCount > 0) {
        await browserInstance.storage.local.set(patch);
      }

      clearAuditCache();

      if (button) {
        button.textContent = changedCount > 0
          ? `Repaired (${changedCount} key${changedCount === 1 ? '' : 's'})`
          : 'Storage Already Healthy';
      }

      return { repaired: true, count: changedCount, patch };
    } catch (err) {
      if (button) {
        button.textContent = 'Repair Failed';
      }
      return { repaired: false, count: 0, error: err?.message || String(err) };
    } finally {
      if (button) {
        setTimeout(() => {
          button.textContent = (button.dataset && button.dataset.originalText) || originalText || 'Auto-Repair Storage';
          button.disabled = false;
        }, 2500);
      }
    }
  }

  // ===============================================
  // Resilient Diagnostic JSON Report Download
  // ===============================================

  /**
   * Downloads a local JSON diagnostic report via Blob and URL.createObjectURL.
   * Operates completely offline with zero telemetry or network calls.
   *
   * @param {HTMLButtonElement} button
   * @param {Function} [customExportFn]
   * @returns {Promise<boolean>}
   */
  async function handleDownloadReport(button, customExportFn = null) {
    if (button && button.disabled) return false;
    let originalText = '';
    if (button) {
      button.disabled = true;
      originalText = button.textContent;
      if (button.dataset) {
        button.dataset.originalText = originalText;
      }
      button.textContent = 'Generating...';
    }

    try {
      let reportObj = null;
      if (typeof customExportFn === 'function') {
        reportObj = await customExportFn();
      } else {
        const audit = await getOrFetchStorageAudit(false);
        const anomalies = (window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.getValidationAnomalies === 'function')
          ? window.HomebaseDiagnostics.getValidationAnomalies()
          : [];
        let history = [];
        if (typeof window.getMigrationHistory === 'function') {
          try {
            history = await window.getMigrationHistory();
          } catch (_) {}
        }
        const perfMetrics = (window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.getPerformanceMetrics === 'function')
          ? window.HomebaseDiagnostics.getPerformanceMetrics()
          : [];

        const quota = await getStorageQuotaTelemetry();

        reportObj = {
          homebaseDiagnosticsVersion: '1.0',
          exportTimestamp: new Date().toISOString(),
          environment: {
            platform: typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || navigator.platform || 'unknown') : 'unknown',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
          },
          storageHealth: {
            status: audit?.status || 'UNKNOWN',
            schemaVersion: audit?.schemaVersion?.stored ?? 1,
            counts: audit?.counts || { total: 0, valid: 0, recoverable: 0, corrupted: 0 }
          },
          quota: {
            bytesUsed: quota.bytesUsed,
            quotaLimit: quota.quotaLimit,
            percentage: quota.percentage
          },
          subsystems: computeSubsystemHealth(audit),
          anomalies,
          migrationHistory: history,
          recentPerformanceMetrics: perfMetrics
        };
      }

      const jsonStr = JSON.stringify(reportObj, null, 2);

      const blobCtor = (typeof window !== 'undefined' && window.Blob) || (typeof Blob !== 'undefined' ? Blob : null);
      const urlHelper = (typeof window !== 'undefined' && window.URL) || (typeof URL !== 'undefined' ? URL : null);

      if (blobCtor && urlHelper && typeof urlHelper.createObjectURL === 'function') {
        const blob = new blobCtor([jsonStr], { type: 'application/json' });
        const url = urlHelper.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `homebase-diagnostic-report-${Date.now()}.json`;
        if (a.style) a.style.display = 'none';
        if (document.body) {
          document.body.appendChild(a);
          if (typeof a.click === 'function') {
            a.click();
          }
          setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            urlHelper.revokeObjectURL(url);
          }, 1000);
        }
      }

      if (button) {
        button.textContent = 'Downloaded JSON!';
      }
      return true;
    } catch (_) {
      if (button) {
        button.textContent = 'Download Failed';
      }
      return false;
    } finally {
      if (button) {
        setTimeout(() => {
          button.textContent = (button.dataset && button.dataset.originalText) || originalText || 'Download JSON Report';
          button.disabled = false;
        }, 2500);
      }
    }
  }

  // ===============================================
  // In-Memory Session Cache & De-duplication State
  // ===============================================
  let cachedAudit = null;
  let lastAuditTimestamp = 0;
  let inFlightAuditPromise = null;
  const AUDIT_CACHE_TTL_MS = 10000; // 10 seconds

  /**
   * Clears the in-memory diagnostic audit session cache.
   */
  function clearAuditCache() {
    cachedAudit = null;
    lastAuditTimestamp = 0;
    inFlightAuditPromise = null;
  }

  /**
   * Returns the current cached audit object or null if absent.
   *
   * @returns {Object|null}
   */
  function getCachedAudit() {
    return cachedAudit;
  }

  /**
   * Retrieves storage audit data with a 10-second TTL cache and in-flight request de-duplication.
   * Strictly read-only; never writes or modifies storage.
   *
   * @param {boolean} [forceRefresh=false]
   * @returns {Promise<Object>}
   */
  async function getOrFetchStorageAudit(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedAudit && (now - lastAuditTimestamp < AUDIT_CACHE_TTL_MS)) {
      return cachedAudit;
    }

    if (inFlightAuditPromise) {
      return inFlightAuditPromise;
    }

    inFlightAuditPromise = (async () => {
      try {
        if (window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.auditStorageHealth === 'function') {
          cachedAudit = await window.HomebaseDiagnostics.auditStorageHealth();
          lastAuditTimestamp = Date.now();
          return cachedAudit;
        }
        return {
          status: 'UNKNOWN',
          counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0 },
          schemaVersion: { stored: 'unknown', expected: 1, status: 'ERROR' }
        };
      } catch (err) {
        return {
          status: 'UNKNOWN',
          counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0 },
          schemaVersion: { stored: 'unknown', expected: 1, status: 'ERROR' }
        };
      } finally {
        inFlightAuditPromise = null;
      }
    })();

    return inFlightAuditPromise;
  }

  /**
   * Safely constructs the Schema Architecture detail card via DOM APIs.
   *
   * @param {Object} [audit]
   * @returns {HTMLElement}
   */
  function createSchemaDetailBlock(audit) {
    const block = document.createElement('div');
    block.className = 'app-settings-diagnostic-detail-item';

    const title = document.createElement('div');
    title.className = 'app-settings-diagnostic-detail-title';
    title.textContent = 'Schema Architecture';
    block.appendChild(title);

    const body = document.createElement('div');
    body.className = 'app-settings-diagnostic-detail-body';

    const storedVer = audit?.schemaVersion?.stored ?? 'unknown';
    const expectedVer = audit?.schemaVersion?.expected ?? 1;
    const alignStatus = audit?.schemaVersion?.status ?? 'UNKNOWN';

    body.appendChild(document.createTextNode('Storage Schema: '));

    const storedCode = document.createElement('span');
    storedCode.className = 'app-settings-diagnostic-detail-code';
    storedCode.textContent = `Version ${storedVer}`;
    body.appendChild(storedCode);

    body.appendChild(document.createTextNode(' (Target: '));

    const expectedCode = document.createElement('span');
    expectedCode.className = 'app-settings-diagnostic-detail-code';
    expectedCode.textContent = `Version ${expectedVer}`;
    body.appendChild(expectedCode);

    body.appendChild(document.createTextNode(') — Status: '));

    const statusStrong = document.createElement('strong');
    statusStrong.textContent = alignStatus;
    body.appendChild(statusStrong);

    block.appendChild(body);
    return block;
  }

  /**
   * Safely constructs the Validation Anomalies detail card via DOM APIs.
   * Completely eliminates template-literal innerHTML injection (Remediates Review Finding F-01).
   *
   * @param {Array<Object>} anomalies
   * @returns {HTMLElement}
   */
  function createAnomalyDetailBlock(anomalies) {
    const block = document.createElement('div');
    block.className = 'app-settings-diagnostic-detail-item';

    const title = document.createElement('div');
    title.className = 'app-settings-diagnostic-detail-title';
    const hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0;
    title.textContent = hasAnomalies
      ? `Recent Validation Normalizations (${anomalies.length} in buffer)`
      : 'Validation Anomalies';
    block.appendChild(title);

    const body = document.createElement('div');
    body.className = 'app-settings-diagnostic-detail-body';

    if (hasAnomalies) {
      const ul = document.createElement('ul');
      ul.className = 'app-settings-diagnostic-anomaly-list';

      anomalies.slice(-5).forEach((a) => {
        const li = document.createElement('li');

        const codeSpan = document.createElement('span');
        codeSpan.className = 'app-settings-diagnostic-detail-code';
        codeSpan.textContent = typeof a.key === 'string' ? a.key.slice(0, 40) : 'key';
        li.appendChild(codeSpan);

        const actionText = typeof a.action === 'string' ? a.action : 'normalized';
        li.appendChild(document.createTextNode(`: ${actionText}`));

        ul.appendChild(li);
      });

      body.appendChild(ul);
    } else {
      body.classList.add('app-settings-diagnostic-empty');
      body.textContent = 'Zero validation anomalies recorded in active memory session.';
    }

    block.appendChild(body);
    return block;
  }

  /**
   * Safely constructs the Migration Ledger detail card via DOM APIs.
   *
   * @param {Array<Object>} history
   * @returns {HTMLElement}
   */
  function createMigrationDetailBlock(history) {
    const block = document.createElement('div');
    block.className = 'app-settings-diagnostic-detail-item';

    const title = document.createElement('div');
    title.className = 'app-settings-diagnostic-detail-title';
    const hasHistory = Array.isArray(history) && history.length > 0;
    title.textContent = hasHistory
      ? `Migration Ledger (${history.length} record${history.length === 1 ? '' : 's'})`
      : 'Migration Ledger';
    block.appendChild(title);

    const body = document.createElement('div');
    body.className = 'app-settings-diagnostic-detail-body';

    if (hasHistory) {
      const latest = history[history.length - 1];
      const fromVer = latest.fromVersion != null ? latest.fromVersion : 0;
      const toVer = latest.toVersion != null ? latest.toVersion : 1;
      const duration = typeof latest.durationMs === 'number' ? latest.durationMs : 0;

      body.appendChild(document.createTextNode(`Latest: Upgrade v${fromVer} → v${toVer} — Status: `));

      const statusStrong = document.createElement('strong');
      statusStrong.textContent = latest.status || 'unknown';
      body.appendChild(statusStrong);

      body.appendChild(document.createTextNode(` (${duration}ms)`));
    } else {
      body.classList.add('app-settings-diagnostic-empty');
      body.textContent = 'No schema migrations have executed on this profile.';
    }

    block.appendChild(body);
    return block;
  }

  /**
   * Safely constructs the Privacy Notice block via DOM APIs.
   *
   * @returns {HTMLElement}
   */
  function createNoticeBlock() {
    const notice = document.createElement('div');
    notice.className = 'app-settings-diagnostic-notice';

    const strong = document.createElement('strong');
    strong.textContent = 'Privacy Guarantee: ';
    notice.appendChild(strong);

    notice.appendChild(document.createTextNode(
      'Diagnostic reports contain structural metadata and error codes only. ' +
      'Personal bookmark URLs, titles, todo content, search queries, and custom images are strictly excluded and never recorded.'
    ));

    return notice;
  }

  /**
   * Renders the complete diagnostics panel content into a container.
   * Strictly avoids displaying sensitive personal data (URLs, bookmark titles, todo items, search text).
   *
   * @param {HTMLElement} sectionOrContainer
   * @param {Object} [customAudit] - Optional pre-computed audit object
   * @param {Array} [customHistory] - Optional pre-computed migration history
   * @param {boolean} [forceRefresh=false] - If true, bypasses the 10-second TTL cache
   * @returns {Promise<void>}
   */
  async function renderDiagnosticsPanel(sectionOrContainer, customAudit = null, customHistory = null, forceRefresh = false) {
    if (!sectionOrContainer) return;
    const container = sectionOrContainer.classList?.contains('app-settings-diagnostic-container')
      ? sectionOrContainer
      : (sectionOrContainer.querySelector?.('.app-settings-diagnostic-container') || sectionOrContainer);

    container.innerHTML = '';

    let audit = customAudit;
    if (!audit) {
      audit = await getOrFetchStorageAudit(forceRefresh);
    }

    const healthMeta = formatHealthStatus(audit?.status || 'UNKNOWN');

    // 1. Status Banner
    const banner = document.createElement('div');
    banner.className = 'app-settings-diagnostic-banner';

    const statusGroup = document.createElement('div');
    statusGroup.className = 'app-settings-diagnostic-status';

    const badge = document.createElement('span');
    badge.className = `app-settings-diagnostic-badge ${healthMeta.className}`;
    badge.textContent = healthMeta.label;
    statusGroup.appendChild(badge);

    const statusText = document.createElement('span');
    statusText.className = 'app-settings-diagnostic-status-text';
    statusText.textContent = healthMeta.description;
    statusGroup.appendChild(statusText);
    banner.appendChild(statusGroup);

    const timestamp = document.createElement('div');
    timestamp.className = 'app-settings-diagnostic-timestamp';
    const auditTime = audit?.timestamp ? new Date(audit.timestamp) : new Date();
    timestamp.textContent = isNaN(auditTime.getTime()) ? 'Audited just now' : `Audited ${auditTime.toLocaleTimeString()}`;
    banner.appendChild(timestamp);
    container.appendChild(banner);

    // 2. Metric Grid
    let quota = { formatted: '0.0 KB / 5.0 MB (0%)', bytesUsed: 0, quotaLimit: DEFAULT_STORAGE_QUOTA_BYTES, percentage: 0 };
    try {
      quota = await getStorageQuotaTelemetry();
    } catch (_) {}

    const grid = document.createElement('div');
    grid.className = 'app-settings-diagnostic-grid';
    grid.appendChild(renderMetricCard('Total Keys', audit?.counts?.total ?? 0, 'Schema Registry'));
    grid.appendChild(renderMetricCard('Valid Keys', audit?.counts?.valid ?? 0, 'Passed Checks'));
    grid.appendChild(renderMetricCard('Recoverable', audit?.counts?.recoverable ?? 0, 'Auto-Normalized'));
    grid.appendChild(renderMetricCard('Corrupted', audit?.counts?.corrupted ?? 0, 'Requires Attention'));
    grid.appendChild(renderMetricCard('Storage Quota', quota.formatted, 'Quota Usage'));
    container.appendChild(grid);

    // 2b. Subsystem Health Matrix
    container.appendChild(createSubsystemMatrixBlock(audit));

    // 3. Action Toolbar
    const actions = document.createElement('div');
    actions.className = 'app-settings-diagnostic-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'gallery-primary-btn app-settings-diagnostic-btn-copy';
    copyBtn.textContent = 'Copy Diagnostic Report';
    copyBtn.addEventListener('click', () => handleCopyReport(copyBtn));
    actions.appendChild(copyBtn);

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'gallery-secondary-btn app-settings-diagnostic-btn-download';
    downloadBtn.textContent = 'Download JSON Report';
    downloadBtn.addEventListener('click', () => handleDownloadReport(downloadBtn));
    actions.appendChild(downloadBtn);

    const repairBtn = document.createElement('button');
    repairBtn.type = 'button';
    repairBtn.className = 'gallery-secondary-btn app-settings-diagnostic-btn-repair';
    repairBtn.textContent = 'Auto-Repair Storage';
    repairBtn.addEventListener('click', async () => {
      const res = await handleAutoRepairStorage(repairBtn);
      if (res?.repaired && res.count > 0) {
        await renderDiagnosticsPanel(sectionOrContainer, null, null, true);
      }
    });
    actions.appendChild(repairBtn);

    const scanBtn = document.createElement('button');
    scanBtn.type = 'button';
    scanBtn.className = 'gallery-secondary-btn app-settings-diagnostic-btn-scan';
    scanBtn.textContent = 'Run Storage Health Check';
    scanBtn.addEventListener('click', async () => {
      if (scanBtn.disabled) return;
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning...';
      scanBtn.classList.add('is-loading');
      try {
        await renderDiagnosticsPanel(sectionOrContainer, null, null, true);
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Run Storage Health Check';
        scanBtn.classList.remove('is-loading');
      }
    });
    actions.appendChild(scanBtn);
    container.appendChild(actions);

    // 4. Details Section (Schema, Anomalies, Migration History) - Safe DOM Construction
    const details = document.createElement('div');
    details.className = 'app-settings-diagnostic-details';

    // 4a. Schema Version Block
    details.appendChild(createSchemaDetailBlock(audit));

    // 4b. Recent Anomalies Summary (In-Memory Buffer)
    const anomalies = window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.getValidationAnomalies === 'function'
      ? window.HomebaseDiagnostics.getValidationAnomalies()
      : [];
    details.appendChild(createAnomalyDetailBlock(anomalies));

    // 4c. Migration History Summary
    let history = customHistory;
    if (!history && typeof window.getMigrationHistory === 'function') {
      try {
        history = await window.getMigrationHistory();
      } catch (_) {
        history = [];
      }
    }
    details.appendChild(createMigrationDetailBlock(history));
    container.appendChild(details);

    // 5. Privacy Notice
    container.appendChild(createNoticeBlock());
  }

  // Registration on window
  const HomebaseDiagnosticUI = {
    formatHealthStatus,
    createDiagnosticsNavItem,
    createDiagnosticsSection,
    renderMetricCard,
    handleCopyReport,
    handleDownloadReport,
    handleAutoRepairStorage,
    getStorageQuotaTelemetry,
    computeSubsystemHealth,
    createSubsystemMatrixBlock,
    areValuesIdentical,
    SUBSYSTEM_CATEGORIES,
    DEFAULT_STORAGE_QUOTA_BYTES,
    renderDiagnosticsPanel,
    getOrFetchStorageAudit,
    getCachedAudit,
    clearAuditCache,
    createSchemaDetailBlock,
    createAnomalyDetailBlock,
    createMigrationDetailBlock,
    createNoticeBlock
  };

  if (typeof window !== 'undefined') {
    window.HomebaseDiagnosticUI = HomebaseDiagnosticUI;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomebaseDiagnosticUI;
  }
})();
