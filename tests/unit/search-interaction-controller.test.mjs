import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const searchUtilsScriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const searchSuggestionCacheScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-cache.js');
const searchUiControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-ui-controller.js');
const searchInteractionControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-interaction-controller.js');

const searchUtilsScriptCode = fs.readFileSync(searchUtilsScriptPath, 'utf8');
const searchSuggestionCacheScriptCode = fs.readFileSync(searchSuggestionCacheScriptPath, 'utf8');
const searchUiControllerScriptCode = fs.readFileSync(searchUiControllerScriptPath, 'utf8');
const searchInteractionControllerScriptCode = fs.readFileSync(searchInteractionControllerScriptPath, 'utf8');

function createMockElement(tagName = 'div', id = '') {
  const classes = new Set();
  const children = [];
  const styles = {};
  const listeners = {};
  const dataset = {};
  let textContent = '';
  let value = '';
  let innerHTML = '';

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    parentElement: null,
    parentNode: null,
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 50,
    hidden: false,
    style: {
      setProperty: (k, v) => { styles[k] = String(v); },
      removeProperty: (k) => { delete styles[k]; },
      get: (k) => styles[k],
      display: ''
    },
    classList: {
      add: (...c) => c.forEach(item => classes.add(item)),
      remove: (...c) => c.forEach(item => classes.delete(item)),
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
      for (const child of children) {
        child.parentElement = null;
        child.parentNode = null;
      }
      children.length = 0;
      for (const child of newChildren) {
        if (child) {
          if (child.nodeType === 11) { // DocumentFragment
            if (child.children) {
              for (const ch of child.children) {
                ch.parentElement = el;
                ch.parentNode = el;
                children.push(ch);
              }
            }
          } else {
            child.parentElement = el;
            child.parentNode = el;
            children.push(child);
          }
        }
      }
    },
    appendChild: (child) => {
      if (child && child.nodeType === 11) {
        if (child.children) {
          for (const ch of child.children) {
            ch.parentElement = el;
            ch.parentNode = el;
            children.push(ch);
          }
        }
      } else if (child) {
        child.parentElement = el;
        child.parentNode = el;
        children.push(child);
      }
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentElement = null;
        child.parentNode = null;
      }
      return child;
    },
    remove: () => {
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
    get children() {
      return children;
    },
    get firstElementChild() {
      return children[0] || null;
    },
    get previousElementSibling() {
      if (!el.parentElement) return null;
      const sibs = el.parentElement.children;
      const idx = sibs.indexOf(el);
      return idx > 0 ? sibs[idx - 1] : null;
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
    get textContent() {
      if (textContent) return textContent;
      return children.map(c => c.textContent || '').join('');
    },
    set textContent(val) {
      textContent = String(val);
      children.length = 0;
    },
    get value() {
      return value;
    },
    set value(val) {
      value = String(val);
    },
    get innerHTML() {
      if (innerHTML) return innerHTML;
      if (children.length > 0) return '<div>child</div>';
      return textContent;
    },
    set innerHTML(val) {
      innerHTML = String(val);
      if (val === '') {
        children.length = 0;
        textContent = '';
      }
    },
    querySelector: (sel) => {
      const parts = sel.split('.').filter(Boolean);
      function matches(node) {
        if (!node || !node.classList) return false;
        return parts.every(p => node.classList.contains(p));
      }
      function find(node) {
        if (!node || !node.children) return null;
        for (const ch of node.children) {
          if (matches(ch)) return ch;
          const nested = find(ch);
          if (nested) return nested;
        }
        return null;
      }
      return find(el);
    },
    querySelectorAll: (sel) => {
      const parts = sel.split('.').filter(Boolean);
      function matches(node) {
        if (!node || !node.classList) return false;
        return parts.every(p => node.classList.contains(p));
      }
      const res = [];
      function walk(node) {
        if (!node || !node.children) return;
        for (const ch of node.children) {
          if (matches(ch)) res.push(ch);
          walk(ch);
        }
      }
      walk(el);
      return res;
    },
    contains: (node) => {
      if (node === el) return true;
      function check(parent) {
        if (!parent || !parent.children) return false;
        for (const ch of parent.children) {
          if (ch === node) return true;
          if (check(ch)) return true;
        }
        return false;
      }
      return check(el);
    },
    scrollIntoView: () => {},
    focus: () => {},
    getAttribute: (attr) => el[attr] || null,
    setAttribute: (attr, val) => { el[attr] = String(val); },
    removeAttribute: (attr) => { delete el[attr]; },
    addEventListener: (event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchMockEvent: (event, eventObj = {}) => {
      const list = listeners[event] || [];
      list.forEach(handler => handler({ target: el, preventDefault: () => {}, stopPropagation: () => {}, ...eventObj }));
    }
  };

  return el;
}

function setupTestEnvironment() {
  const elements = {
    searchInput: createMockElement('input', 'search-input'),
    searchForm: createMockElement('form', 'search-form'),
    searchResultsPanel: createMockElement('div', 'search-results-panel'),
    bookmarkResultsContainer: createMockElement('div', 'bookmark-results-container'),
    suggestionResultsContainer: createMockElement('div', 'suggestion-results-container'),
    searchWidget: createMockElement('div', 'widget-search'),
    searchAreaWrapper: createMockElement('div', 'search-area-wrapper'),
    bookmarksGrid: createMockElement('div', 'bookmarks-grid'),
    mainContent: createMockElement('div', 'main-content'),
    suggestionsToggle: createMockElement('input', 'setting-search-suggestions')
  };

  elements.searchWidget.className = 'widget widget-search';
  elements.searchAreaWrapper.className = 'search-area-wrapper';
  elements.searchResultsPanel.classList.add('hidden');

  // Build proper hierarchy
  elements.searchAreaWrapper.appendChild(elements.searchWidget);
  elements.searchWidget.appendChild(elements.searchForm);
  elements.searchForm.appendChild(elements.searchInput);
  elements.searchWidget.appendChild(elements.searchResultsPanel);
  elements.searchResultsPanel.appendChild(elements.bookmarkResultsContainer);
  elements.searchResultsPanel.appendChild(elements.suggestionResultsContainer);
  elements.mainContent.appendChild(elements.bookmarksGrid);

  const documentListeners = {};
  const mockDocument = {
    getElementById: (id) => {
      switch (id) {
        case 'search-input': return elements.searchInput;
        case 'search-form': return elements.searchForm;
        case 'search-results-panel': return elements.searchResultsPanel;
        case 'bookmark-results-container': return elements.bookmarkResultsContainer;
        case 'suggestion-results-container': return elements.suggestionResultsContainer;
        case 'bookmarks-grid': return elements.bookmarksGrid;
        case 'setting-search-suggestions': return elements.suggestionsToggle;
        case 'app-search-suggestions-toggle': return elements.suggestionsToggle;
        default: return null;
      }
    },
    querySelector: (sel) => {
      if (sel === '.widget-search') return elements.searchWidget;
      if (sel === '.search-area-wrapper') return elements.searchAreaWrapper;
      if (sel === '.main-content') return elements.mainContent;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.widget-search') return [elements.searchWidget];
      return [];
    },
    createDocumentFragment: () => {
      const frag = createMockElement('fragment');
      frag.nodeType = 11;
      return frag;
    },
    createElement: (tag) => createMockElement(tag),
    body: createMockElement('body'),
    activeElement: elements.searchInput,
    addEventListener: (event, handler) => {
      documentListeners[event] = documentListeners[event] || [];
      documentListeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!documentListeners[event]) return;
      documentListeners[event] = documentListeners[event].filter(h => h !== handler);
    },
    dispatchMockEvent: (event, eventObj = {}) => {
      const list = documentListeners[event] || [];
      list.forEach(handler => handler({ target: elements.searchInput, preventDefault: () => {}, stopPropagation: () => {}, ...eventObj }));
    }
  };

  const openedTabs = [];
  const updatedTabs = [];
  const mockBrowser = {
    tabs: {
      create: async (details) => {
        openedTabs.push(details);
        return { id: 101, ...details };
      },
      update: async (details) => {
        updatedTabs.push(details);
        return { id: 101, ...details };
      }
    },
    history: {
      search: async () => []
    }
  };

  const sampleEngines = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=chrome&q=', enabled: true },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?q=', enabled: true },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=', enabled: true }
  ];

  const sandbox = {
    window: {},
    document: mockDocument,
    browser: mockBrowser,
    fetch: async () => ({
      ok: true,
      text: async () => '["test", ["test1", "test2"]]'
    }),
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    searchEngines: sampleEngines,
    currentSearchEngine: sampleEngines[0],
    activeSearchEngineId: 'google',
    allBookmarks: [
      { id: '1', title: 'GitHub', url: 'https://github.com' },
      { id: '2', title: 'Google News', url: 'https://news.google.com' },
      { id: '3', title: 'Documentation', url: 'https://developer.mozilla.org' }
    ],
    bangMap: {
      g: 'google',
      d: 'duckduckgo',
      b: 'bing'
    },
    appSearchSuggestionsPreference: true,
    appSearchMathPreference: true,
    appSearchShowHistoryPreference: false,
    appSearchOpenNewTabPreference: false,
    console,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    AbortController
  };

  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(searchUtilsScriptCode, ctx);
  vm.runInContext(searchSuggestionCacheScriptCode, ctx);
  vm.runInContext(searchUiControllerScriptCode, ctx);
  vm.runInContext(searchInteractionControllerScriptCode, ctx);

  return {
    controller: sandbox.window.HomebaseSearchInteractionController,
    elements,
    mockDocument,
    mockBrowser,
    openedTabs,
    updatedTabs,
    sandbox
  };
}

// 1. Controller Export Availability
test('search-interaction-controller: window.HomebaseSearchInteractionController is exported and has required API', () => {
  const { controller } = setupTestEnvironment();
  assert.ok(controller, 'controller should exist on window');
  assert.strictEqual(typeof controller.initialize, 'function');
  assert.strictEqual(typeof controller.destroy, 'function');
  assert.strictEqual(typeof controller.handleInput, 'function');
  assert.strictEqual(typeof controller.handleKeydown, 'function');
  assert.strictEqual(typeof controller.handleSubmit, 'function');
  assert.strictEqual(typeof controller.handleResultClick, 'function');
  assert.strictEqual(typeof controller.handleResultMouseDown, 'function');
  assert.strictEqual(typeof controller.executeSearch, 'function');
  assert.strictEqual(typeof controller.openSearchUrl, 'function');
  assert.strictEqual(typeof controller.selectItem, 'function');
  assert.strictEqual(typeof controller.moveSection, 'function');
  assert.strictEqual(typeof controller.clearAllSelections, 'function');
  assert.strictEqual(typeof controller.getCurrentSectionItems, 'function');
  assert.strictEqual(typeof controller.getSelectedResult, 'function');
  assert.strictEqual(typeof controller.getSelectionSnapshot, 'function');
  assert.strictEqual(typeof controller.applySelectionToCurrentResults, 'function');
  assert.strictEqual(typeof controller.fetchSuggestions, 'function');
  assert.strictEqual(typeof controller.getBangSuggestions, 'function');
  assert.strictEqual(typeof controller.abortSuggestionFetch, 'function');
  assert.strictEqual(typeof controller.clearExternalSuggestionResults, 'function');
  assert.strictEqual(typeof controller.setSuggestionsPreference, 'function');
  assert.strictEqual(typeof controller.updatePanelVisibility, 'function');
  assert.strictEqual(typeof controller.hydrateSearchResultFavicons, 'function');
  assert.strictEqual(typeof controller.getState, 'function');
});

// 2. Initialize / Destroy Lifecycle
test('search-interaction-controller: initialize and destroy manage lifecycle cleanly', () => {
  const { controller } = setupTestEnvironment();
  controller.initialize({ bindEvents: true });
  const stateInitial = controller.getState();
  assert.strictEqual(stateInitial.currentSelectionIndex, -1);
  assert.strictEqual(stateInitial.selectionExplicit, false);

  controller.destroy();
  const stateDestroyed = controller.getState();
  assert.strictEqual(stateDestroyed.latestSearchToken, 0);
  assert.strictEqual(stateDestroyed.currentSelectionIndex, -1);
});

// 3. Search Execution Routing
test('search-interaction-controller: executeSearch routes standard queries and URLs correctly', async () => {
  const { controller, openedTabs, updatedTabs, sandbox } = setupTestEnvironment();

  // Test URL routing
  controller.executeSearch('https://example.com/test');
  assert.strictEqual(updatedTabs.length, 1);
  assert.strictEqual(updatedTabs[0].url, 'https://example.com/test');

  // Test standard query routing
  controller.executeSearch('firefox containers');
  assert.strictEqual(updatedTabs.length, 2);
  assert.ok(updatedTabs[1].url.includes('google.com/search?q=firefox%20containers'));

  // Test newTab routing override
  sandbox.appSearchOpenNewTabPreference = true;
  controller.executeSearch('homebase dashboard');
  assert.strictEqual(openedTabs.length, 1);
  assert.ok(openedTabs[0].url.includes('google.com/search?q=homebase%20dashboard'));
});

// 4. Keyboard Arrow Navigation
test('search-interaction-controller: handleKeydown navigates items and sections via arrow keys', () => {
  const { controller, elements } = setupTestEnvironment();

  // Populate mock items in bookmark container
  const item1 = createMockElement('button', 'bm-1');
  item1.className = 'result-item';
  const label1 = createMockElement('strong');
  label1.className = 'result-label';
  label1.textContent = 'Bookmark One';
  item1.appendChild(label1);

  const item2 = createMockElement('button', 'bm-2');
  item2.className = 'result-item';
  const label2 = createMockElement('strong');
  label2.className = 'result-label';
  label2.textContent = 'Bookmark Two';
  item2.appendChild(label2);

  elements.bookmarkResultsContainer.appendChild(item1);
  elements.bookmarkResultsContainer.appendChild(item2);
  elements.searchResultsPanel.classList.remove('hidden');

  // Press ArrowDown to select item 1
  controller.handleKeydown({
    key: 'ArrowDown',
    target: elements.searchInput,
    preventDefault: () => {}
  });

  let state = controller.getState();
  assert.strictEqual(state.currentSelectionIndex, 0);
  assert.ok(item1.classList.contains('selected'));

  // Press ArrowDown again to select item 2
  controller.handleKeydown({
    key: 'ArrowDown',
    target: elements.searchInput,
    preventDefault: () => {}
  });

  state = controller.getState();
  assert.strictEqual(state.currentSelectionIndex, 1);
  assert.ok(item2.classList.contains('selected'));

  // Press ArrowUp to move back to item 1
  controller.handleKeydown({
    key: 'ArrowUp',
    target: elements.searchInput,
    preventDefault: () => {}
  });

  state = controller.getState();
  assert.strictEqual(state.currentSelectionIndex, 0);
  assert.ok(item1.classList.contains('selected'));
});

// 5. Selection State Management
test('search-interaction-controller: selectItem, clearAllSelections, and getSelectionSnapshot work correctly', () => {
  const { controller, elements } = setupTestEnvironment();

  const item = createMockElement('button', 'item-1');
  item.className = 'result-item';
  item.dataset.url = 'https://example.com/item1';
  const label = createMockElement('strong');
  label.className = 'result-label';
  label.textContent = 'Item One';
  item.appendChild(label);
  elements.bookmarkResultsContainer.appendChild(item);

  controller.selectItem(item, true);
  const selected = controller.getSelectedResult();
  assert.strictEqual(selected, item);

  const snapshot = controller.getSelectionSnapshot();
  assert.ok(snapshot);
  assert.strictEqual(snapshot.url, 'https://example.com/item1');
  assert.strictEqual(snapshot.text, 'Item One');

  controller.clearAllSelections();
  assert.strictEqual(controller.getSelectedResult(), null);
  assert.strictEqual(controller.getState().currentSelectionIndex, -1);
});

// 6. Suggestion Cancellation & AbortController Handling
test('search-interaction-controller: suggestion cancellation and preference handling work cleanly', () => {
  const { controller, elements, sandbox } = setupTestEnvironment();

  // Create mock suggestion element
  const sug = createMockElement('button', 'sug-1');
  sug.className = 'result-item result-item-suggestion';
  elements.suggestionResultsContainer.appendChild(sug);

  assert.strictEqual(elements.suggestionResultsContainer.children.length, 1);

  // Disable suggestions via preference
  controller.setSuggestionsPreference(false);
  assert.strictEqual(sandbox.appSearchSuggestionsPreference, false);
  assert.strictEqual(elements.suggestionResultsContainer.children.length, 0);

  // Calling abortSuggestionFetch is safe and idempotent
  controller.abortSuggestionFetch();
  controller.abortSuggestionFetch();
});

// 7. Bang and Math Routing
test('search-interaction-controller: getBangSuggestions returns matching engines', () => {
  const { controller } = setupTestEnvironment();
  const duckMatches = controller.getBangSuggestions('!d');
  assert.ok(Array.isArray(duckMatches));
  assert.ok(duckMatches.some(m => m.engine.id === 'duckduckgo'));

  const googleMatches = controller.getBangSuggestions('!g');
  assert.ok(googleMatches.some(m => m.engine.id === 'google'));
});

test('search-interaction-controller: handleInput calculates math expression when preference enabled', async () => {
  const { controller, elements } = setupTestEnvironment();
  elements.searchInput.value = '24 * 7';

  await controller.handleInput();

  const calcItem = elements.bookmarkResultsContainer.querySelector('.calc-item');
  assert.ok(calcItem, 'Calculator item should be generated for math query');
  assert.strictEqual(calcItem.dataset.copy, '168');
});

// 8. Headless DOM Safety
test('search-interaction-controller: safe execution in headless environment with missing elements', async () => {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    console,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(searchInteractionControllerScriptCode, ctx);

  const ctrl = sandbox.window.HomebaseSearchInteractionController;
  assert.ok(ctrl);

  // All these calls should succeed without throwing
  assert.doesNotThrow(() => ctrl.initialize());
  assert.doesNotThrow(() => ctrl.clearAllSelections());
  assert.doesNotThrow(() => ctrl.moveSection(1));
  assert.doesNotThrow(() => ctrl.getSelectedResult());
  assert.doesNotThrow(() => ctrl.getSelectionSnapshot());
  assert.doesNotThrow(() => ctrl.updatePanelVisibility());
  assert.doesNotThrow(() => ctrl.hydrateSearchResultFavicons(null));
  assert.doesNotThrow(() => ctrl.abortSuggestionFetch());
  assert.doesNotThrow(() => ctrl.clearExternalSuggestionResults());
  assert.doesNotThrow(() => ctrl.handleKeydown({ key: 'Escape' }));
  assert.doesNotThrow(() => ctrl.destroy());
});
