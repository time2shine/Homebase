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
    this.style = {
      setProperty: (k, v) => { this.style[k] = v; }
    };
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

  removeChild(child) {
    if (!child) return child;
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
      child.parentElement = null;
    }
    return child;
  }

  click() {
    return this.dispatchEvent('click');
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
      if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
      }
      if (/^[a-zA-Z]+$/.test(selector)) {
        return el.tagName === selector.toUpperCase();
      }
      if (selector.startsWith('[data-') && selector.endsWith(']')) {
        const attrMatch = selector.slice(1, -1).match(/^data-([a-zA-Z0-9-]+)(?:="([^"]+)")?$/);
        if (attrMatch) {
          const rawAttr = attrMatch[1];
          const camelAttr = rawAttr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const expectedVal = attrMatch[2];
          const val = el.dataset[camelAttr] !== undefined ? el.dataset[camelAttr] : el.dataset[rawAttr];
          return expectedVal !== undefined ? val === expectedVal : val !== undefined;
        }
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
      if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
      }
      if (/^[a-zA-Z]+$/.test(selector)) {
        return el.tagName === selector.toUpperCase();
      }
      if (selector.startsWith('[data-') && selector.endsWith(']')) {
        const attrMatch = selector.slice(1, -1).match(/^data-([a-zA-Z0-9-]+)(?:="([^"]+)")?$/);
        if (attrMatch) {
          const rawAttr = attrMatch[1];
          const camelAttr = rawAttr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const expectedVal = attrMatch[2];
          const val = el.dataset[camelAttr] !== undefined ? el.dataset[camelAttr] : el.dataset[rawAttr];
          return expectedVal !== undefined ? val === expectedVal : val !== undefined;
        }
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
  const bodyEl = new MockElement('BODY');

  const sessionStorageMock = {
    _data: new Map(),
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); }
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
    Blob: class MockBlob {
      constructor(chunks, options) {
        this.chunks = chunks;
        this.options = options;
        this.size = (chunks || []).join('').length;
        this.type = options?.type || '';
      }
    },
    URL: {
      createObjectURL: (blob) => `blob:mock-${Math.random()}`,
      revokeObjectURL: () => {}
    },
    sessionStorage: sessionStorageMock,
    setTimeout: (fn, ms) => 1,
    clearTimeout: () => {},
    document: {
      body: bodyEl,
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
  const bodyEl = new MockElement('BODY');
  const sessionStorageMock = {
    _data: new Map(),
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); }
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
    parseInt,
    parseFloat,
    sessionStorage: sessionStorageMock,
    WALLPAPER_CACHE_NAME: 'test-wallpapers',
    GALLERY_POSTERS_CACHE_NAME: 'test-posters',
    appPerformanceModePreference: false,
    setTimeout: (fn, ms) => 1,
    clearTimeout: () => {},
    document: {
      body: bodyEl,
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
  assert.equal(cards.length, 5, 'Should render 5 metric cards including quota');

  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '74', '0', '0', '0.0 KB / 5.0 MB (0%)'], 'Metric card values should match audit counts');

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
  assert.equal(cards.length, 5);
  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '71', '3', '0', '0.0 KB / 5.0 MB (0%)']);

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
  assert.equal(cards.length, 5);
  const cardValues = cards.map((c) => c.querySelector('.app-settings-diagnostic-card-value')?.textContent);
  assert.deepEqual(cardValues, ['74', '70', '0', '4', '0.0 KB / 5.0 MB (0%)']);
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

test('diagnostic-ui: all 74 canonical keys map to SUBSYSTEM_CATEGORIES without duplicates or orphans', () => {
  const env = createMockEnvironment();
  const { SUBSYSTEM_CATEGORIES } = env.window.HomebaseDiagnosticUI;

  const expectedCategories = ['system', 'bookmarks', 'wallpapers', 'widgets', 'search'];
  assert.deepEqual(Object.keys(SUBSYSTEM_CATEGORIES).sort(), expectedCategories.sort());

  // Collect all categorized keys
  const allCategorizedKeys = [];
  for (const cat of Object.values(SUBSYSTEM_CATEGORIES)) {
    assert.ok(cat.label, 'Category must have a label');
    assert.ok(Array.isArray(cat.keys) && cat.keys.length > 0, 'Category must contain keys');
    cat.keys.forEach((k) => allCategorizedKeys.push(k));
  }

  // Exactly 74 canonical keys
  assert.equal(allCategorizedKeys.length, 74, 'Must map all 74 registered storage keys');

  // Verify zero duplicates
  const uniqueKeys = new Set(allCategorizedKeys);
  assert.equal(uniqueKeys.size, 74, 'Categories must have zero duplicate key mappings');
});

test('diagnostic-ui: computeSubsystemHealth maps healthy, degraded, and corrupted domains accurately', () => {
  const env = createMockEnvironment();
  const { computeSubsystemHealth } = env.window.HomebaseDiagnosticUI;

  // 1. Healthy Audit
  const healthyAudit = {
    status: 'HEALTHY',
    counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 },
    keys: { valid: ['schemaVersion', 'widgetOrder', 'wallpaperSelection'], recoverable: [], corrupted: [] }
  };
  const healthySub = computeSubsystemHealth(healthyAudit);
  assert.equal(healthySub.system.status, 'HEALTHY');
  assert.equal(healthySub.widgets.status, 'HEALTHY');
  assert.equal(healthySub.wallpapers.status, 'HEALTHY');

  // 2. Degraded Audit (recoverable key in widgets)
  const degradedAudit = {
    status: 'DEGRADED',
    counts: { total: 74, valid: 73, recoverable: 1, corrupted: 0 },
    keys: {
      valid: [],
      recoverable: [{ key: 'widgetOrder', failureType: 'ARRAY_MISMATCH' }],
      corrupted: []
    }
  };
  const degradedSub = computeSubsystemHealth(degradedAudit);
  assert.equal(degradedSub.widgets.status, 'DEGRADED');
  assert.equal(degradedSub.widgets.recoverableCount, 1);
  assert.equal(degradedSub.system.status, 'HEALTHY');

  // 3. Corrupted Audit (corrupted key in wallpapers)
  const corruptedAudit = {
    status: 'CORRUPTED',
    counts: { total: 74, valid: 73, recoverable: 0, corrupted: 1 },
    keys: {
      valid: [],
      recoverable: [],
      corrupted: [{ key: 'wallpaperSelection', failureType: 'TYPE_MISMATCH' }]
    }
  };
  const corruptedSub = computeSubsystemHealth(corruptedAudit);
  assert.equal(corruptedSub.wallpapers.status, 'CORRUPTED');
  assert.equal(corruptedSub.wallpapers.corruptedCount, 1);
  assert.equal(corruptedSub.bookmarks.status, 'HEALTHY');
});

test('diagnostic-ui: createSubsystemMatrixBlock renders 5 subsystem cards with status chips', () => {
  const env = createMockEnvironment();
  const { createSubsystemMatrixBlock } = env.window.HomebaseDiagnosticUI;

  const audit = {
    status: 'DEGRADED',
    keys: {
      valid: [],
      recoverable: [{ key: 'appSearchMath', failureType: 'TYPE_MISMATCH' }],
      corrupted: []
    }
  };

  const block = createSubsystemMatrixBlock(audit);
  assert.ok(block.classList.contains('app-settings-diagnostic-subsystems'));

  const cards = block.querySelectorAll('.app-settings-diagnostic-subsystem-card');
  assert.equal(cards.length, 5, 'Should render 5 subsystem cards');

  const names = cards.map((c) => c.querySelector('.app-settings-diagnostic-subsystem-name')?.textContent);
  assert.ok(names.includes('System & Core'));
  assert.ok(names.includes('Bookmarks & Grid'));
  assert.ok(names.includes('Wallpapers & Media'));
  assert.ok(names.includes('Widgets & Dock'));
  assert.ok(names.includes('Search Panel'));

  // Search card should have warning chip
  const searchCard = cards.find((c) => c.querySelector('.app-settings-diagnostic-subsystem-name')?.textContent === 'Search Panel');
  assert.ok(searchCard);
  const chip = searchCard.querySelector('.app-settings-diagnostic-chip');
  assert.ok(chip);
  assert.ok(chip.classList.contains('app-settings-diagnostic-chip--degraded'));
  assert.match(chip.textContent, /Warning/);
});

test('diagnostic-ui: storage quota telemetry adheres to Privacy Constraint (aggregate-only)', async () => {
  const env = createMockEnvironment();
  const { getStorageQuotaTelemetry } = env.window.HomebaseDiagnosticUI;

  // 1. With getBytesInUse available
  const mockBrowserWithBytes = {
    storage: {
      local: {
        getBytesInUse: async () => 262144 // 256 KB
      }
    }
  };

  const quota1 = await getStorageQuotaTelemetry(mockBrowserWithBytes);
  assert.equal(quota1.bytesUsed, 262144);
  assert.equal(quota1.quotaLimit, 5242880);
  assert.equal(quota1.percentage, 5.0);
  assert.match(quota1.formatted, /256\.0 KB \/ 5\.0 MB \(5%\)/);

  // Privacy invariant: zero individual keys or user content in quota object
  assert.equal(Object.prototype.hasOwnProperty.call(quota1, 'keys'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quota1, 'bookmarks'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quota1, 'wallpaper'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quota1, 'todo'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(quota1, 'search'), false);

  // 2. Fallback when getBytesInUse is absent (serialized size estimation)
  const mockBrowserFallback = {
    storage: {
      local: {
        get: async () => ({
          settingA: 'value1',
          settingB: [1, 2, 3]
        })
      }
    }
  };

  const quota2 = await getStorageQuotaTelemetry(mockBrowserFallback);
  assert.ok(quota2.bytesUsed > 0);
  assert.equal(quota2.quotaLimit, 5242880);
  assert.ok(typeof quota2.percentage === 'number');
  assert.ok(quota2.formatted.includes('KB / 5.0 MB'));
});

test('diagnostic-ui: auto-repair enforces Minimal Mutation Write Invariant (changed keys only)', async () => {
  const env = createMockEnvironment();
  const { handleAutoRepairStorage } = env.window.HomebaseDiagnosticUI;

  // Initial snapshot with:
  // - appBackgroundDim: 250 (out of bounds, clamps to 80)
  // - clockType: 'analog' (already valid, unchanged)
  // - customThirdPartyKey: 'preserve-me' (unknown key, must be preserved)
  const snapshot = {
    appBackgroundDim: 250,
    clockType: 'analog',
    customThirdPartyKey: 'preserve-me'
  };

  let writtenPatch = null;
  const mockBrowser = {
    storage: {
      local: {
        get: async () => ({ ...snapshot }),
        set: async (patch) => {
          writtenPatch = patch;
        }
      }
    }
  };

  const mockValidator = {
    sanitizeStorageBatch: (raw) => ({
      schemaVersion: 1,
      appBackgroundDim: 80, // Clamped from 250
      clockType: 'analog',  // Identical to raw
      customThirdPartyKey: 'preserve-me' // Preserved
    })
  };

  const button = env.document.createElement('button');
  button.textContent = 'Auto-Repair Storage';

  const result = await handleAutoRepairStorage(button, mockBrowser, mockValidator);

  assert.equal(result.repaired, true);
  // appBackgroundDim changed (250 -> 80) and schemaVersion added (undefined -> 1)
  assert.equal(result.count, 2);

  // Minimal Mutation Write Invariant:
  // ONLY changed keys written!
  assert.ok(writtenPatch, 'browser.storage.local.set must be called with a patch');
  assert.equal(writtenPatch.appBackgroundDim, 80);
  assert.equal(writtenPatch.schemaVersion, 1);

  // Unchanged keys and unknown keys must NEVER be written to storage.local
  assert.equal(writtenPatch.clockType, undefined, 'Unchanged keys must NOT be written');
  assert.equal(writtenPatch.customThirdPartyKey, undefined, 'Unknown keys must NOT be rewritten');
});

test('diagnostic-ui: auto-repair does not write when storage is already healthy', async () => {
  const env = createMockEnvironment();
  const { handleAutoRepairStorage } = env.window.HomebaseDiagnosticUI;

  const healthySnapshot = {
    schemaVersion: 1,
    appBackgroundDim: 80,
    clockType: 'analog'
  };

  let writeCalled = false;
  const mockBrowser = {
    storage: {
      local: {
        get: async () => ({ ...healthySnapshot }),
        set: async () => {
          writeCalled = true;
        }
      }
    }
  };

  const mockValidator = {
    sanitizeStorageBatch: () => ({ ...healthySnapshot })
  };

  const button = env.document.createElement('button');
  const result = await handleAutoRepairStorage(button, mockBrowser, mockValidator);

  assert.equal(result.repaired, true);
  assert.equal(result.count, 0, 'Zero changed keys');
  assert.equal(writeCalled, false, 'browser.storage.local.set must NOT be called when zero keys changed');
});

test('diagnostic-ui: JSON report export generates structured offline download without user data', async () => {
  const env = createMockEnvironment();
  const { handleDownloadReport } = env.window.HomebaseDiagnosticUI;

  let exportedObject = null;
  let downloadedFileName = '';

  // Intercept Blob and link click
  env.window.Blob = class {
    constructor(chunks) {
      exportedObject = JSON.parse(chunks[0]);
    }
  };

  const button = env.document.createElement('button');
  button.textContent = 'Download JSON Report';

  const customExport = async () => ({
    homebaseDiagnosticsVersion: '1.0',
    exportTimestamp: '2026-09-27T12:00:00.000Z',
    storageHealth: { status: 'HEALTHY', schemaVersion: 1, counts: { total: 74, valid: 74, recoverable: 0, corrupted: 0 } },
    quota: { bytesUsed: 1024, quotaLimit: 5242880, percentage: 0.1 },
    subsystems: { system: 'HEALTHY' },
    anomalies: [],
    migrationHistory: []
  });

  const success = await handleDownloadReport(button, customExport);
  assert.equal(success, true);
  assert.ok(exportedObject, 'Report payload must be generated and parsed');
  assert.equal(exportedObject.homebaseDiagnosticsVersion, '1.0');
  assert.equal(exportedObject.storageHealth.status, 'HEALTHY');

  // Verify zero privacy leaks
  const serialized = JSON.stringify(exportedObject);
  assert.equal(serialized.includes('http'), false, 'Export must never leak personal URLs');
  assert.equal(serialized.includes('todoText'), false, 'Export must never leak todo contents');
  assert.equal(serialized.includes('wallpaperData'), false, 'Export must never leak wallpaper images');
});

test('perf-report: HUD overlay minimization toggles between full view and compact pill', () => {
  const env = createPerfReportEnvironment();
  const { isPerfOverlayMinimized, setPerfOverlayMinimized } = env.module.exports;

  // Default is expanded
  assert.equal(isPerfOverlayMinimized(), false);

  // Set minimized
  setPerfOverlayMinimized(true);
  assert.equal(isPerfOverlayMinimized(), true);

  // Set expanded
  setPerfOverlayMinimized(false);
  assert.equal(isPerfOverlayMinimized(), false);
});

test('perf-report: HUD minimization persists strictly via sessionStorage and never uses browser.storage', () => {
  let localStorageWriteCount = 0;
  let syncStorageWriteCount = 0;

  const env = createPerfReportEnvironment({
    browser: {
      storage: {
        local: { set: () => { localStorageWriteCount++; } },
        sync: { set: () => { syncStorageWriteCount++; } }
      }
    }
  });

  const { setPerfOverlayMinimized, PERF_OVERLAY_MINIMIZED_SESSION_KEY } = env.module.exports;

  // Toggle HUD minimize state multiple times
  setPerfOverlayMinimized(true);
  setPerfOverlayMinimized(false);
  setPerfOverlayMinimized(true);

  // Verify stored strictly in sessionStorage
  assert.equal(env.sessionStorage.getItem(PERF_OVERLAY_MINIMIZED_SESSION_KEY), 'true');

  // Verify zero calls to browser.storage.local or browser.storage.sync
  assert.equal(localStorageWriteCount, 0, 'Must NEVER write HUD minimize state to browser.storage.local');
  assert.equal(syncStorageWriteCount, 0, 'Must NEVER write HUD minimize state to browser.storage.sync');
});


