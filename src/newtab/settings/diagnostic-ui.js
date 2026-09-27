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
    const grid = document.createElement('div');
    grid.className = 'app-settings-diagnostic-grid';
    grid.appendChild(renderMetricCard('Total Keys', audit?.counts?.total ?? 0, 'Schema Registry'));
    grid.appendChild(renderMetricCard('Valid Keys', audit?.counts?.valid ?? 0, 'Passed Checks'));
    grid.appendChild(renderMetricCard('Recoverable', audit?.counts?.recoverable ?? 0, 'Auto-Normalized'));
    grid.appendChild(renderMetricCard('Corrupted', audit?.counts?.corrupted ?? 0, 'Requires Attention'));
    container.appendChild(grid);

    // 3. Action Toolbar
    const actions = document.createElement('div');
    actions.className = 'app-settings-diagnostic-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'gallery-primary-btn app-settings-diagnostic-btn-copy';
    copyBtn.textContent = 'Copy Diagnostic Report';
    copyBtn.addEventListener('click', () => handleCopyReport(copyBtn));
    actions.appendChild(copyBtn);

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
