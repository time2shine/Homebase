import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const diagnosticUiScriptPath = path.join(rootDir, 'src/newtab/settings/diagnostic-ui.js');
const diagnosticUiScriptCode = fs.readFileSync(diagnosticUiScriptPath, 'utf8');

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
    if (this._textContent) return this._textContent;
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join(' ');
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
