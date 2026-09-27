import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const diagnosticUiScriptPath = path.join(rootDir, 'src/newtab/settings/diagnostic-ui.js');
const diagnosticUiScriptCode = fs.readFileSync(diagnosticUiScriptPath, 'utf8');

const perfReportScriptPath = path.join(rootDir, 'src/newtab/core/perf-report.js');
const perfReportScriptCode = fs.readFileSync(perfReportScriptPath, 'utf8');

const settingsUiScriptPath = path.join(rootDir, 'src/newtab/settings/settings-ui.js');
const settingsUiScriptCode = fs.readFileSync(settingsUiScriptPath, 'utf8');

/**
 * Lightweight mock element supporting standard DOM operations for unit testing.
 */
class MockElement {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this._classes = new Set();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.listeners = {};
    this.disabled = false;
    this.type = 'button';
    this._textContent = '';
    this._innerHTML = '';

    const self = this;
    this.classList = {
      add(...classes) {
        classes.forEach((c) => {
          if (c) {
            self._classes.add(c);
            self.className = Array.from(self._classes).join(' ');
          }
        });
      },
      remove(...classes) {
        classes.forEach((c) => {
          self._classes.delete(c);
        });
        self.className = Array.from(self._classes).join(' ');
      },
      contains(cls) {
        return self._classes.has(cls) || self.className.split(/\s+/).includes(cls);
      },
      toggle(cls, force) {
        if (force === true) this.add(cls);
        else if (force === false) this.remove(cls);
        else if (this.contains(cls)) this.remove(cls);
        else this.add(cls);
      }
    };
  }

  get textContent() {
    if (this.tagName === '#TEXT') return this._textContent;
    if (this._textContent) return this._textContent;
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join('');
    }
    if (this._innerHTML) {
      return this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  set textContent(val) {
    this._textContent = String(val);
    this._innerHTML = '';
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = '';
    this.children = [];
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  async dispatchEvent(event) {
    const type = typeof event === 'string' ? event : (event?.type || '');
    const handlers = this.listeners[type] || [];
    for (const fn of handlers) {
      await fn(event);
    }
  }

  querySelector(selector) {
    const match = (el) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.classList.contains(cls);
      }
      if (/^[a-zA-Z]+$/.test(selector)) {
        return el.tagName === selector.toUpperCase();
      }
      if (selector.includes('[data-feedback-action')) {
        const valMatch = selector.match(/data-feedback-action="([^"]+)"/);
        return valMatch ? el.dataset.feedbackAction === valMatch[1] : Boolean(el.dataset.feedbackAction);
      }
      return false;
    };

    const search = (node) => {
      for (const child of node.children) {
        if (match(child)) return child;
        const found = search(child);
        if (found) return found;
      }
      return null;
    };

    return search(this);
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.classList.contains(cls);
      }
      if (/^[a-zA-Z]+$/.test(selector)) {
        return el.tagName === selector.toUpperCase();
      }
      if (selector.includes('[data-feedback-action')) {
        const valMatch = selector.match(/data-feedback-action="([^"]+)"/);
        return valMatch ? el.dataset.feedbackAction === valMatch[1] : Boolean(el.dataset.feedbackAction);
      }
      return false;
    };

    const search = (node) => {
      for (const child of node.children) {
        if (match(child)) results.push(child);
        search(child);
      }
    };

    search(this);
    return results;
  }
}

/**
 * Creates an isolated mock browser environment with MockElement and document.
 *
 * @param {Object} [overrides={}]
 * @returns {Object} Sandbox environment
 */
function createMockEnvironment(overrides = {}) {
  let clipboardText = '';

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
    setTimeout: (fn, ms) => 1,
    clearTimeout: () => {},
    document: {
      createElement(tag) {
        return new MockElement(tag);
      },
      createTextNode(text) {
        const el = new MockElement('#TEXT');
        el._textContent = String(text);
        return el;
      },
      querySelector(sel) {
        return null;
      }
    },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          clipboardText = text;
        }
      }
    },
    getClipboardText: () => clipboardText,
    setClipboardText: (txt) => { clipboardText = txt; },
    window: null,
    module: { exports: {} },
    ...overrides
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(diagnosticUiScriptCode, context);
  return sandbox;
}

/**
 * Creates an isolated mock environment with perf-report.js loaded.
 *
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
function createPerfReportEnvironment(overrides = {}) {
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
    parseInt,
    parseFloat,
    WALLPAPER_CACHE_NAME: 'test-wallpapers',
    GALLERY_POSTERS_CACHE_NAME: 'test-posters',
    appPerformanceModePreference: false,
    setTimeout: (fn, ms) => 1,
    clearTimeout: () => {},
    document: {
      createElement(tag) {
        return new MockElement(tag);
      },
      createTextNode(text) {
        const el = new MockElement('#TEXT');
        el._textContent = String(text);
        return el;
      },
      querySelector(sel) {
        return null;
      }
    },
    window: null,
    module: { exports: {} },
    ...overrides
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(perfReportScriptCode, context);
  return sandbox;
}

test('diagnostic-ui: UI module loads and exports expected API', () => {
  const env = createMockEnvironment();
  assert.ok(env.window.HomebaseDiagnosticUI, 'HomebaseDiagnosticUI should be attached to window');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.formatHealthStatus, 'function');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.createDiagnosticsNavItem, 'function');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.createDiagnosticsSection, 'function');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.renderMetricCard, 'function');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.handleCopyReport, 'function');
  assert.equal(typeof env.window.HomebaseDiagnosticUI.renderDiagnosticsPanel, 'function');

  // Verify CommonJS export
  assert.equal(typeof env.module.exports.renderDiagnosticsPanel, 'function');
});

test('diagnostic-ui: health status rendering metadata maps correctly', () => {
  const env = createMockEnvironment();
  const { formatHealthStatus } = env.window.HomebaseDiagnosticUI;

  const healthy = formatHealthStatus('HEALTHY');
  assert.equal(healthy.label, 'Healthy');
  assert.equal(healthy.className, 'app-settings-diagnostic-badge--healthy');
  assert.match(healthy.description, /valid and schema-aligned/i);

  const degraded = formatHealthStatus('DEGRADED');
  assert.equal(degraded.label, 'Degraded');
  assert.equal(degraded.className, 'app-settings-diagnostic-badge--degraded');
  assert.match(degraded.description, /normalized/i);

  const corrupted = formatHealthStatus('CORRUPTED');
  assert.equal(corrupted.label, 'Corrupted');
  assert.equal(corrupted.className, 'app-settings-diagnostic-badge--corrupted');
  assert.match(corrupted.description, /format errors/i);

  const unknown = formatHealthStatus('SOME_UNKNOWN_STATUS');
  assert.equal(unknown.label, 'Unknown');
  assert.equal(unknown.className, 'app-settings-diagnostic-badge--degraded');
});

test('diagnostic-ui: createDiagnosticsNavItem builds valid nav button', () => {
  const env = createMockEnvironment();
  const item = env.window.HomebaseDiagnosticUI.createDiagnosticsNavItem();

  assert.equal(item.tagName, 'BUTTON');
  assert.ok(item.classList.contains('app-settings-nav-item'));
  assert.equal(item.dataset.section, 'diagnostics');
  assert.match(item.innerHTML, /Diagnostics/);
  assert.match(item.innerHTML, /<svg/);
});

test('diagnostic-ui: createDiagnosticsSection builds valid section layout', () => {
  const env = createMockEnvironment();
  const section = env.window.HomebaseDiagnosticUI.createDiagnosticsSection();

  assert.equal(section.tagName, 'SECTION');
  assert.ok(section.classList.contains('app-settings-section'));
  assert.equal(section.dataset.section, 'diagnostics');

  const header = section.querySelector('.app-settings-diagnostic-header');
  assert.ok(header, 'Diagnostic header should be present');

  const title = section.querySelector('.app-settings-diagnostic-title');
  assert.ok(title, 'Diagnostic title should be present');
  assert.equal(title.textContent, 'System & Storage Diagnostics');

  const container = section.querySelector('.app-settings-diagnostic-container');
  assert.ok(container, 'Diagnostic container should be present');
});

test('diagnostic-ui: renders HEALTHY storage state accurately', async () => {
  const env = createMockEnvironment();
  const section = env.window.HomebaseDiagnosticUI.createDiagnosticsSection();
  const container = section.querySelector('.app-settings-diagnostic-container');

  const healthyAudit = {
    status: 'HEALTHY',
    timestamp: '2026-09-27T12:00:00.000Z',
    counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 },
    schemaVersion: { stored: 1, expected: 1, status: 'ALIGNED' }
  };

  await env.window.HomebaseDiagnosticUI.renderDiagnosticsPanel(container, healthyAudit, []);

  const badge = container.querySelector('.app-settings-diagnostic-badge');
  assert.ok(badge, 'Status badge should be rendered');
  assert.equal(badge.textContent, 'Healthy');
  assert.ok(badge.classList.contains('app-settings-diagnostic-badge--healthy'));

  const cards = container.querySelectorAll('.app-settings-diagnostic-card');
  assert.equal(cards.length, 4, 'Should render 4 metric cards');

  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '74', '0', '0'], 'Metric card values should match audit counts');

  assert.match(container.textContent, /Version 1/);
  assert.match(container.textContent, /ALIGNED/);
});

test('diagnostic-ui: renders DEGRADED storage state accurately', async () => {
  const env = createMockEnvironment();
  const section = env.window.HomebaseDiagnosticUI.createDiagnosticsSection();
  const container = section.querySelector('.app-settings-diagnostic-container');

  const degradedAudit = {
    status: 'DEGRADED',
    timestamp: '2026-09-27T12:00:00.000Z',
    counts: { total: 74, valid: 71, recoverable: 3, corrupted: 0 },
    schemaVersion: { stored: 0, expected: 1, status: 'LEGACY_UNVERSIONED' }
  };

  await env.window.HomebaseDiagnosticUI.renderDiagnosticsPanel(container, degradedAudit, []);

  const badge = container.querySelector('.app-settings-diagnostic-badge');
  assert.ok(badge);
  assert.equal(badge.textContent, 'Degraded');
  assert.ok(badge.classList.contains('app-settings-diagnostic-badge--degraded'));

  const cards = container.querySelectorAll('.app-settings-diagnostic-card');
  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '71', '3', '0']);

  assert.match(container.textContent, /LEGACY_UNVERSIONED/);
});

test('diagnostic-ui: renders CORRUPTED storage state accurately', async () => {
  const env = createMockEnvironment();
  const section = env.window.HomebaseDiagnosticUI.createDiagnosticsSection();
  const container = section.querySelector('.app-settings-diagnostic-container');

  const corruptedAudit = {
    status: 'CORRUPTED',
    timestamp: '2026-09-27T12:00:00.000Z',
    counts: { total: 74, valid: 70, recoverable: 0, corrupted: 4 },
    schemaVersion: { stored: 1, expected: 1, status: 'ALIGNED' }
  };

  await env.window.HomebaseDiagnosticUI.renderDiagnosticsPanel(container, corruptedAudit, []);

  const badge = container.querySelector('.app-settings-diagnostic-badge');
  assert.ok(badge);
  assert.equal(badge.textContent, 'Corrupted');
  assert.ok(badge.classList.contains('app-settings-diagnostic-badge--corrupted'));

  const cards = container.querySelectorAll('.app-settings-diagnostic-card');
  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '70', '0', '4']);
});

test('diagnostic-ui: privacy redaction guarantees zero personal data in rendered DOM', async () => {
  const env = createMockEnvironment();
  const section = env.window.HomebaseDiagnosticUI.createDiagnosticsSection();
  const container = section.querySelector('.app-settings-diagnostic-container');

  // Audit with sensitive mock properties attached to test defense
  const auditWithSensitiveData = {
    status: 'HEALTHY',
    counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 },
    schemaVersion: { stored: 1, expected: 1, status: 'ALIGNED' },
    bookmarkUrl: 'https://secret-bank.example.com/account?token=xyz987',
    bookmarkTitle: 'My Confidential Banking Portal',
    todoContent: 'Buy medical supplies for appointment',
    wallpaperData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD_SECRET'
  };

  const historyWithSensitiveData = [
    {
      fromVersion: 0,
      toVersion: 1,
      status: 'success',
      durationMs: 12,
      secretToken: 'super_secret_payload_token'
    }
  ];

  await env.window.HomebaseDiagnosticUI.renderDiagnosticsPanel(container, auditWithSensitiveData, historyWithSensitiveData);

  const fullText = container.textContent;

  // Assert strictly no PII leaked
  assert.equal(fullText.includes('secret-bank.example.com'), false, 'URL must not leak');
  assert.equal(fullText.includes('xyz987'), false, 'Token query param must not leak');
  assert.equal(fullText.includes('My Confidential Banking Portal'), false, 'Bookmark title must not leak');
  assert.equal(fullText.includes('Buy medical supplies'), false, 'Todo text must not leak');
  assert.equal(fullText.includes('_SECRET'), false, 'Wallpaper data must not leak');
  assert.equal(fullText.includes('super_secret_payload_token'), false, 'Migration private fields must not leak');

  // Verify visible privacy disclosure
  const notice = container.querySelector('.app-settings-diagnostic-notice');
  assert.ok(notice, 'Privacy notice must be rendered');
  assert.match(notice.textContent, /Privacy Guarantee/i);
});

test('diagnostic-ui: handleCopyReport clipboard success toggles button text', async () => {
  const env = createMockEnvironment();
  const button = env.document.createElement('button');
  button.textContent = 'Copy Diagnostic Report';

  let customExportCalled = false;
  const mockExport = async () => {
    customExportCalled = true;
    return { success: true, method: 'clipboard' };
  };

  const success = await env.window.HomebaseDiagnosticUI.handleCopyReport(button, mockExport);
  assert.equal(success, true);
  assert.equal(customExportCalled, true);
  assert.equal(button.textContent, 'Copied to Clipboard!');
});

test('diagnostic-ui: handleCopyReport fallback and failure handling', async () => {
  const env = createMockEnvironment();
  const button = env.document.createElement('button');
  button.textContent = 'Copy Diagnostic Report';

  // Test failing export function
  const failingExport = async () => {
    return { success: false, error: 'Clipboard access denied' };
  };

  const result = await env.window.HomebaseDiagnosticUI.handleCopyReport(button, failingExport);
  assert.equal(result, false);
  assert.equal(button.textContent, 'Copy Failed');
});

test('diagnostic-ui: TTL cache behavior avoids redundant audit calls', async () => {
  let auditCallCount = 0;
  const mockAudit = {
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 },
    schemaVersion: { stored: 1, expected: 1, status: 'ALIGNED' }
  };

  const env = createMockEnvironment({
    HomebaseDiagnostics: {
      auditStorageHealth: async () => {
        auditCallCount += 1;
        return { ...mockAudit, callId: auditCallCount };
      }
    }
  });

  const { getOrFetchStorageAudit, getCachedAudit, clearAuditCache } = env.window.HomebaseDiagnosticUI;
  clearAuditCache();

  // First call fetches from API
  const audit1 = await getOrFetchStorageAudit(false);
  assert.equal(auditCallCount, 1);
  assert.equal(audit1.callId, 1);
  assert.equal(getCachedAudit()?.callId, 1);

  // Second immediate call uses TTL cache (10s)
  const audit2 = await getOrFetchStorageAudit(false);
  assert.equal(auditCallCount, 1, 'Should not re-fetch while cache is valid within TTL');
  assert.equal(audit2.callId, 1);
});

test('diagnostic-ui: in-flight request de-duplication collapses concurrent audit calls', async () => {
  let auditCallCount = 0;
  let resolveAuditPromise;
  const pendingPromise = new Promise((resolve) => {
    resolveAuditPromise = resolve;
  });

  const env = createMockEnvironment({
    HomebaseDiagnostics: {
      auditStorageHealth: () => {
        auditCallCount += 1;
        return pendingPromise;
      }
    }
  });

  const { getOrFetchStorageAudit, clearAuditCache } = env.window.HomebaseDiagnosticUI;
  clearAuditCache();

  // Launch two concurrent audit requests
  const p1 = getOrFetchStorageAudit(false);
  const p2 = getOrFetchStorageAudit(false);

  // Verify only one underlying audit was triggered
  assert.equal(auditCallCount, 1);

  resolveAuditPromise({ status: 'HEALTHY', counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 } });
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1.status, 'HEALTHY');
  assert.equal(res2.status, 'HEALTHY');
  assert.equal(auditCallCount, 1);
});

test('diagnostic-ui: force refresh bypasses TTL cache', async () => {
  let auditCallCount = 0;
  const env = createMockEnvironment({
    HomebaseDiagnostics: {
      auditStorageHealth: async () => {
        auditCallCount += 1;
        return { status: 'HEALTHY', callId: auditCallCount };
      }
    }
  });

  const { getOrFetchStorageAudit, clearAuditCache } = env.window.HomebaseDiagnosticUI;
  clearAuditCache();

  await getOrFetchStorageAudit(false);
  assert.equal(auditCallCount, 1);

  // Force refresh
  const refreshed = await getOrFetchStorageAudit(true);
  assert.equal(auditCallCount, 2, 'Force refresh must bypass TTL cache');
  assert.equal(refreshed.callId, 2);
});

test('diagnostic-ui: safe DOM construction protects against malicious anomaly names (Fix F-01)', () => {
  const env = createMockEnvironment();
  const { createAnomalyDetailBlock } = env.window.HomebaseDiagnosticUI;

  const maliciousAnomalies = [
    {
      key: '<img src=x onerror="alert(1)">',
      action: '<script>alert(2)</script>'
    }
  ];

  const block = createAnomalyDetailBlock(maliciousAnomalies);

  // Must not create executable HTML elements
  assert.equal(block.querySelector('img'), null, 'Malicious key name must not create img elements');
  assert.equal(block.querySelector('script'), null, 'Malicious action must not create script elements');

  // Text content must contain literal string characters
  const codeSpan = block.querySelector('.app-settings-diagnostic-detail-code');
  assert.ok(codeSpan);
  assert.equal(codeSpan.textContent, '<img src=x onerror="alert(1)">');
  assert.match(block.textContent, /<script>alert\(2\)<\/script>/);
});

test('diagnostic-ui: HUD overlay storage health formatting', () => {
  const env = createPerfReportEnvironment();
  const { formatOverlayStorageHealthRows, formatOverlayRecentMetricsRows } = env.module.exports;

  const healthyAudit = {
    status: 'HEALTHY',
    schemaVersion: { stored: 1, expected: 1, status: 'ALIGNED' },
    counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 }
  };

  const healthyRows = formatOverlayStorageHealthRows(healthyAudit, 0, 1);
  assert.ok(Array.isArray(healthyRows));
  assert.equal(healthyRows[0], 'Storage Health');
  assert.equal(healthyRows[1], 'Status: HEALTHY');
  assert.equal(healthyRows[2], 'Schema: v1 (ALIGNED)');
  assert.equal(healthyRows[3], 'Keys: 74/74 valid (0 corrupted)');
  assert.equal(healthyRows[4], 'Anomalies: 0 in buffer');
  assert.equal(healthyRows[5], 'Migrations: 1 recorded');

  const degradedAudit = {
    status: 'DEGRADED',
    schemaVersion: { stored: 0, expected: 1, status: 'LEGACY_UNVERSIONED' },
    counts: { total: 74, valid: 71, recoverable: 3, corrupted: 0 }
  };
  const degradedRows = formatOverlayStorageHealthRows(degradedAudit, 3, null);
  assert.equal(degradedRows[1], 'Status: DEGRADED');
  assert.equal(degradedRows[4], 'Anomalies: 3 in buffer');

  // Recent metrics
  const sampleMetrics = [
    { name: 'idle:weather', durationMs: 4.8 },
    { name: 'bookmarks:load', durationMs: 14.2 }
  ];
  const metricRows = formatOverlayRecentMetricsRows(sampleMetrics);
  assert.equal(metricRows[0], 'Recent Metrics');
  assert.equal(metricRows[1], '- idle:weather: 5 ms');
  assert.equal(metricRows[2], '- bookmarks:load: 14 ms');

  const emptyMetricRows = formatOverlayRecentMetricsRows([]);
  assert.equal(emptyMetricRows[0], 'Recent Metrics');
  assert.equal(emptyMetricRows[1], '- None recorded');
});

test('diagnostic-ui: feedback bridge adds copy button and triggers copy', async () => {
  const env = createMockEnvironment();

  // Create a mock card representing the Report Bug card in Settings -> Feedback
  const feedbackCard = env.document.createElement('div');
  feedbackCard.className = 'app-settings-feedback-card';

  const bugBtn = env.document.createElement('button');
  bugBtn.className = 'gallery-secondary-btn app-settings-feedback-action';
  bugBtn.dataset.feedbackAction = 'bug';
  bugBtn.textContent = 'Report Bug';
  feedbackCard.appendChild(bugBtn);

  // Inject feedback diagnostic copy button
  const copyBtn = env.document.createElement('button');
  copyBtn.className = 'gallery-secondary-btn app-settings-feedback-action app-settings-feedback-diagnostic-btn';
  copyBtn.dataset.feedbackAction = 'diagnostic-report';
  copyBtn.textContent = 'Copy Diagnostic Report';
  feedbackCard.appendChild(copyBtn);

  let exportCalled = false;
  env.window.HomebaseDiagnostics = {
    exportHealthReport: async () => {
      exportCalled = true;
      return { success: true };
    }
  };

  const success = await env.window.HomebaseDiagnosticUI.handleCopyReport(copyBtn);
  assert.equal(success, true);
  assert.equal(exportCalled, true);
  assert.equal(copyBtn.textContent, 'Copied to Clipboard!');
});

