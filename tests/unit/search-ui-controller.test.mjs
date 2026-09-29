import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const searchStorageScriptPath = path.join(rootDir, 'src/newtab/search/search-storage.js');
const searchUiControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-ui-controller.js');

const searchStorageScriptCode = fs.readFileSync(searchStorageScriptPath, 'utf8');
const searchUiControllerScriptCode = fs.readFileSync(searchUiControllerScriptPath, 'utf8');

function createMockElement(tagName = 'div', id = '') {
  const classes = new Set();
  const children = [];
  const styles = {};
  const listeners = {};
  const attributes = {};
  const dataset = {};

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    style: {
      setProperty: (k, v) => { styles[k] = String(v); },
      removeProperty: (k) => { delete styles[k]; },
      get: (k) => styles[k]
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      },
      contains: (c) => classes.has(c)
    },
    replaceChildren: (...newChildren) => {
      children.length = 0;
      for (const child of newChildren) {
        if (child) children.push(child);
      }
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      if (val) {
        val.split(/\s+/).forEach(c => { if (c) classes.add(c); });
      }
    },
    querySelector: (sel) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        function find(node) {
          if (!node || !node.children) return null;
          for (const ch of node.children) {
            if (ch && ch.classList && ch.classList.contains(cls)) return ch;
            const nested = find(ch);
            if (nested) return nested;
          }
          return null;
        }
        return find(el);
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        const res = [];
        function walk(node) {
          if (!node || !node.children) return;
          for (const ch of node.children) {
            if (ch && ch.classList && ch.classList.contains(cls)) res.push(ch);
            walk(ch);
          }
        }
        walk(el);
        return res;
      }
      return [];
    },
    addEventListener: (event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    focus: () => { el._isFocused = true; },
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    children,
    value: '',
    innerHTML: '',
    textContent: '',
    _classes: classes,
    _styles: styles,
    _listeners: listeners
  };

  return el;
}

function createEnvironment(options = {}) {
  const elementsById = {};
  const queryMap = {};

  const documentMock = {
    getElementById: (id) => elementsById[id] || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
      return queryMap[sel] || null;
    },
    querySelectorAll: (sel) => {
      return queryMap[sel] ? [queryMap[sel]] : [];
    },
    createElement: (tag) => createMockElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createMockElement('body', 'body'),
    head: createMockElement('head', 'head')
  };

  const defaultEngines = [
    { id: 'google', name: 'Google', color: '#4285F4', enabled: true, url: 'https://www.google.com/search?q=' },
    { id: 'youtube', name: 'YouTube', color: '#FF0000', enabled: true, url: 'https://www.youtube.com/results?search_query=' },
    { id: 'duckduckgo', name: 'DuckDuckGo', color: '#DE5833', enabled: true, url: 'https://duckduckgo.com/?q=' }
  ];

  const sandbox = {
    console,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    window: null,
    document: documentMock,
    searchEngines: options.searchEngines || defaultEngines.map(e => ({ ...e })),
    currentSearchEngine: null,
    activeSearchEngineId: 'google',
    appSearchRememberEnginePreference: true,
    appSearchDefaultEnginePreference: 'google',
    HomebaseSearchStorage: {
      getSearchPreferences: async () => ({
        searchEngines: defaultEngines.map(e => ({ id: e.id, enabled: e.enabled })),
        currentSearchEngineId: 'google',
        appSearchRememberEnginePreference: true,
        appSearchDefaultEnginePreference: 'google'
      }),
      setCurrentSearchEngine: () => {},
      writeFastSearchCache: () => {}
    }
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  vm.runInContext(searchStorageScriptCode, context);
  vm.runInContext(searchUiControllerScriptCode, context);

  return { context, sandbox, elementsById, queryMap, documentMock };
}

test('Search UI Controller - exports check', () => {
  const { sandbox } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  assert.ok(controller, 'HomebaseSearchUiController must be defined on window');
  assert.equal(sandbox.window.HomebaseSearchEngineController, controller, 'HomebaseSearchEngineController must alias SearchUiController');

  assert.equal(typeof controller.initialize, 'function');
  assert.equal(typeof controller.render, 'function');
  assert.equal(typeof controller.refresh, 'function');
  assert.equal(typeof controller.destroy, 'function');
  assert.equal(typeof controller.cycleSearchEngine, 'function');
  assert.equal(typeof controller.updateSearchUI, 'function');
  assert.equal(typeof controller.populateSearchOptions, 'function');
  assert.equal(typeof controller.renderSearchEngineSelector, 'function');
  assert.equal(typeof controller.clearSearchUI, 'function');
  assert.equal(typeof controller.hideSearchResultsPanel, 'function');
  assert.equal(typeof controller.applySearchEngineConfig, 'function');
});

test('Search UI Controller - render and populate options', () => {
  const { sandbox, elementsById } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  const selectorEl = createMockElement('div', 'search-engine-selector');
  const selectEl = createMockElement('select', 'search-select');
  elementsById['search-engine-selector'] = selectorEl;
  elementsById['search-select'] = selectEl;

  controller.populateSearchOptions();

  assert.ok(selectorEl.children.length > 0, 'Selector container should have children appended');
  const list = selectorEl.children[0];
  assert.ok(list.classList.contains('search-engine-list'), 'List should have search-engine-list class');
  assert.equal(list.children.length, 3, 'Should render 3 buttons for 3 active engines');

  assert.equal(list.children[0].dataset.engineId, 'google');
  assert.equal(list.children[1].dataset.engineId, 'youtube');
  assert.equal(list.children[2].dataset.engineId, 'duckduckgo');
});

test('Search UI Controller - updateSearchUI updates active state and input placeholder', () => {
  const { sandbox, elementsById } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  const selectorEl = createMockElement('div', 'search-engine-selector');
  const selectEl = createMockElement('select', 'search-select');
  const inputEl = createMockElement('input', 'search-input');
  elementsById['search-engine-selector'] = selectorEl;
  elementsById['search-select'] = selectEl;
  elementsById['search-input'] = inputEl;

  controller.populateSearchOptions();
  controller.updateSearchUI('youtube');

  assert.equal(controller.getCurrentSearchEngine().id, 'youtube');
  assert.equal(controller.getActiveSearchEngineId(), 'youtube');
  assert.equal(inputEl.placeholder, 'Search with YouTube');
  assert.equal(selectEl.value, 'youtube');

  const list = selectorEl.children[0];
  const buttons = list.children;
  assert.ok(buttons[1].classList.contains('active'), 'YouTube button should be marked active');
  assert.ok(!buttons[0].classList.contains('active'), 'Google button should not be active');
});

test('Search UI Controller - cycleSearchEngine cycles forward and backward', () => {
  const { sandbox, elementsById } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  const selectorEl = createMockElement('div', 'search-engine-selector');
  const selectEl = createMockElement('select', 'search-select');
  const inputEl = createMockElement('input', 'search-input');
  elementsById['search-engine-selector'] = selectorEl;
  elementsById['search-select'] = selectEl;
  elementsById['search-input'] = inputEl;

  controller.populateSearchOptions();
  controller.updateSearchUI('google');

  // Cycle down -> youtube
  controller.cycleSearchEngine('down');
  assert.equal(controller.getCurrentSearchEngine().id, 'youtube');

  // Cycle down -> duckduckgo
  controller.cycleSearchEngine('down');
  assert.equal(controller.getCurrentSearchEngine().id, 'duckduckgo');

  // Cycle down wraps -> google
  controller.cycleSearchEngine('down');
  assert.equal(controller.getCurrentSearchEngine().id, 'google');

  // Cycle up wraps -> duckduckgo
  controller.cycleSearchEngine('up');
  assert.equal(controller.getCurrentSearchEngine().id, 'duckduckgo');
});

test('Search UI Controller - applySearchEngineConfig reorders and toggles engines', () => {
  const { sandbox } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  const config = [
    { id: 'duckduckgo', enabled: true },
    { id: 'google', enabled: false },
    { id: 'youtube', enabled: true }
  ];

  const applied = controller.applySearchEngineConfig(config);
  assert.equal(applied, true);

  const engines = controller.getSearchEngines();
  assert.equal(engines[0].id, 'duckduckgo');
  assert.equal(engines[0].enabled, true);
  assert.equal(engines[1].id, 'google');
  assert.equal(engines[1].enabled, false);
  assert.equal(engines[2].id, 'youtube');
  assert.equal(engines[2].enabled, true);
});

test('Search UI Controller - clearSearchUI and hideSearchResultsPanel cleanup', () => {
  const { sandbox, elementsById, queryMap } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  const panel = createMockElement('div', 'search-results-panel');
  const widget = createMockElement('div', 'widget-search');
  const wrapper = createMockElement('div', 'search-area-wrapper');
  const input = createMockElement('input', 'search-input');
  input.value = 'hello test';

  elementsById['search-results-panel'] = panel;
  elementsById['search-input'] = input;
  queryMap['.widget-search'] = widget;
  queryMap['.search-area-wrapper'] = wrapper;

  widget.classList.add('results-open');
  wrapper.classList.add('search-focused');

  controller.hideSearchResultsPanel();
  assert.ok(panel.classList.contains('hidden'));
  assert.ok(!widget.classList.contains('results-open'));
  assert.ok(!wrapper.classList.contains('search-focused'));

  controller.clearSearchUI({ clearInput: true });
  assert.equal(input.value, '');
});

test('Search UI Controller - headless missing DOM safety', () => {
  const { sandbox } = createEnvironment();
  const controller = sandbox.window.HomebaseSearchUiController;

  // With empty DOM where elements return null
  assert.doesNotThrow(() => {
    controller.updateSearchUI('google');
    controller.renderSearchEngineSelector();
    controller.populateSearchOptions();
    controller.updateSearchSelectorPosition();
    controller.cycleSearchEngine('down');
    controller.clearSearchUI();
    controller.hideSearchResultsPanel();
    controller.destroy();
  });
});
