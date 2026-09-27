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

  /**
   * Renders the complete diagnostics panel content into a container.
   * Strictly avoids displaying sensitive personal data (URLs, bookmark titles, todo items, search text).
   *
   * @param {HTMLElement} sectionOrContainer
   * @param {Object} [customAudit] - Optional pre-computed audit object
   * @param {Array} [customHistory] - Optional pre-computed migration history
   * @returns {Promise<void>}
   */
  async function renderDiagnosticsPanel(sectionOrContainer, customAudit = null, customHistory = null) {
    if (!sectionOrContainer) return;
    const container = sectionOrContainer.classList?.contains('app-settings-diagnostic-container')
      ? sectionOrContainer
      : (sectionOrContainer.querySelector?.('.app-settings-diagnostic-container') || sectionOrContainer);

    container.innerHTML = '';

    let audit = customAudit;
    if (!audit && window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.auditStorageHealth === 'function') {
      try {
        audit = await window.HomebaseDiagnostics.auditStorageHealth();
      } catch (err) {
        audit = { status: 'UNKNOWN', counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0 }, schemaVersion: { stored: 'unknown', expected: 1, status: 'ERROR' } };
      }
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
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning...';
      try {
        await renderDiagnosticsPanel(sectionOrContainer);
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Run Storage Health Check';
      }
    });
    actions.appendChild(scanBtn);
    container.appendChild(actions);

    // 4. Details Section (Schema, Anomalies, Migration History)
    const details = document.createElement('div');
    details.className = 'app-settings-diagnostic-details';

    // 4a. Schema Version Block
    const schemaBlock = document.createElement('div');
    schemaBlock.className = 'app-settings-diagnostic-detail-item';
    const storedVer = audit?.schemaVersion?.stored ?? 'unknown';
    const expectedVer = audit?.schemaVersion?.expected ?? 1;
    const alignStatus = audit?.schemaVersion?.status ?? 'UNKNOWN';

    schemaBlock.innerHTML = `
      <div class="app-settings-diagnostic-detail-title">Schema Architecture</div>
      <div class="app-settings-diagnostic-detail-body">
        Storage Schema: <span class="app-settings-diagnostic-detail-code">Version ${storedVer}</span>
        (Target: <span class="app-settings-diagnostic-detail-code">Version ${expectedVer}</span>)
        — Status: <strong>${alignStatus}</strong>
      </div>
    `;
    details.appendChild(schemaBlock);

    // 4b. Recent Anomalies Summary (In-Memory Buffer)
    const anomalies = window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.getValidationAnomalies === 'function'
      ? window.HomebaseDiagnostics.getValidationAnomalies()
      : [];

    const anomalyBlock = document.createElement('div');
    anomalyBlock.className = 'app-settings-diagnostic-detail-item';

    if (anomalies.length > 0) {
      const recent = anomalies.slice(-5);
      const itemsHtml = recent.map((a) => {
        const keyName = typeof a.key === 'string' ? a.key.slice(0, 40) : 'key';
        const action = typeof a.action === 'string' ? a.action : 'normalized';
        return `<li><span class="app-settings-diagnostic-detail-code">${keyName}</span>: ${action}</li>`;
      }).join('');

      anomalyBlock.innerHTML = `
        <div class="app-settings-diagnostic-detail-title">Recent Validation Normalizations (${anomalies.length} in buffer)</div>
        <div class="app-settings-diagnostic-detail-body">
          <ul style="margin: 4px 0 0 16px; padding: 0;">${itemsHtml}</ul>
        </div>
      `;
    } else {
      anomalyBlock.innerHTML = `
        <div class="app-settings-diagnostic-detail-title">Validation Anomalies</div>
        <div class="app-settings-diagnostic-detail-body app-settings-diagnostic-empty">
          Zero validation anomalies recorded in active memory session.
        </div>
      `;
    }
    details.appendChild(anomalyBlock);

    // 4c. Migration History Summary
    let history = customHistory;
    if (!history && typeof window.getMigrationHistory === 'function') {
      try {
        history = await window.getMigrationHistory();
      } catch (_) {
        history = [];
      }
    }

    const migrationBlock = document.createElement('div');
    migrationBlock.className = 'app-settings-diagnostic-detail-item';

    if (Array.isArray(history) && history.length > 0) {
      const latest = history[history.length - 1];
      migrationBlock.innerHTML = `
        <div class="app-settings-diagnostic-detail-title">Migration Ledger (${history.length} record${history.length === 1 ? '' : 's'})</div>
        <div class="app-settings-diagnostic-detail-body">
          Latest: Upgrade v${latest.fromVersion} &rarr; v${latest.toVersion}
          — Status: <strong>${latest.status}</strong> (${latest.durationMs ?? 0}ms)
        </div>
      `;
    } else {
      migrationBlock.innerHTML = `
        <div class="app-settings-diagnostic-detail-title">Migration Ledger</div>
        <div class="app-settings-diagnostic-detail-body app-settings-diagnostic-empty">
          No schema migrations have executed on this profile.
        </div>
      `;
    }
    details.appendChild(migrationBlock);
    container.appendChild(details);

    // 5. Privacy Notice
    const notice = document.createElement('div');
    notice.className = 'app-settings-diagnostic-notice';
    notice.innerHTML = `
      <strong>Privacy Guarantee:</strong> Diagnostic reports contain structural metadata and error codes only.
      Personal bookmark URLs, titles, todo content, search queries, and custom images are strictly excluded and never recorded.
    `;
    container.appendChild(notice);
  }

  // Registration on window
  const HomebaseDiagnosticUI = {
    formatHealthStatus,
    createDiagnosticsNavItem,
    createDiagnosticsSection,
    renderMetricCard,
    handleCopyReport,
    renderDiagnosticsPanel
  };

  if (typeof window !== 'undefined') {
    window.HomebaseDiagnosticUI = HomebaseDiagnosticUI;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomebaseDiagnosticUI;
  }
})();
