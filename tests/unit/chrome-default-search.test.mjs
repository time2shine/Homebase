import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildConfigScriptPath = path.join(rootDir, 'src/newtab/core/build-config.js');
const searchUtilsScriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const searchSuggestionCacheScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-cache.js');
const searchSuggestionServiceScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-service.js');
const searchResultsRendererScriptPath = path.join(rootDir, 'src/newtab/search/search-results-renderer.js');
const searchStorageScriptPath = path.join(rootDir, 'src/newtab/search/search-storage.js');
const searchUiControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-ui-controller.js');
const searchInteractionControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-interaction-controller.js');
const settingsFormControllerScriptPath = path.join(rootDir, 'src/newtab/settings/settings-form-controller.js');

const buildConfigScriptCode = fs.readFileSync(buildConfigScriptPath, 'utf8');
const searchUtilsScriptCode = fs.readFileSync(searchUtilsScriptPath, 'utf8');
const searchSuggestionCacheScriptCode = fs.readFileSync(searchSuggestionCacheScriptPath, 'utf8');
const searchSuggestionServiceScriptCode = fs.readFileSync(searchSuggestionServiceScriptPath, 'utf8');
const searchResultsRendererScriptCode = fs.readFileSync(searchResultsRendererScriptPath, 'utf8');
const searchStorageScriptCode = fs.readFileSync(searchStorageScriptPath, 'utf8');
const searchUiControllerScriptCode = fs.readFileSync(searchUiControllerScriptPath, 'utf8');
const searchInteractionControllerScriptCode = fs.readFileSync(searchInteractionControllerScriptPath, 'utf8');
const settingsFormControllerScriptCode = fs.readFileSync(settingsFormControllerScriptPath, 'utf8');

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
    checked: false,
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
          child.parentElement = el;
          child.parentNode = el;
          children.push(child);
        }
      }
    },
    appendChild: (child) => {
      if (child) {
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
    get children() { return children; },
    get firstElementChild() { return children[0] || null; },
    get className() { return Array.from(classes).join(' '); },
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
    get value() { return value; },
    set value(val) { value = String(val); },
    get innerHTML() { return innerHTML || textContent; },
    set innerHTML(val) { innerHTML = String(val); },
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
    contains: () => false,
    focus: () => {},
    scrollIntoView: () => {},
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
      for (const handler of list) {
        handler({ target: el, preventDefault: () => {}, stopPropagation: () => {}, ...eventObj });
      }
    }
  };

  return el;
}

function createSearchTestEnvironment({ target = 'chrome', browserDefaultSearch = true, chromeSearchQuery = null } = {}) {
  const elements = {
    searchInput: createMockElement('input', 'search-input'),
    searchForm: createMockElement('form', 'search-form'),
    searchResultsPanel: createMockElement('div', 'search-results-panel'),
    bookmarkResultsContainer: createMockElement('div', 'bookmark-results-container'),
    suggestionResultsContainer: createMockElement('div', 'suggestion-results-container'),
    searchWidget: createMockElement('div', 'widget-search'),
    searchAreaWrapper: createMockElement('div', 'search-area-wrapper'),
    bookmarksGrid: createMockElement('div', 'bookmarks-grid'),
    searchEngineSelector: createMockElement('div', 'search-engine-selector'),
    searchEngineOptions: createMockElement('div', 'search-engine-options'),
    searchEngineCurrent: createMockElement('div', 'search-engine-current'),
    searchInputDivider: createMockElement('div', 'search-input-divider')
  };

  elements.searchResultsPanel.classList.add('hidden');
  elements.searchWidget.appendChild(elements.searchForm);
  elements.searchForm.appendChild(elements.searchEngineSelector);
  elements.searchForm.appendChild(elements.searchInputDivider);
  elements.searchForm.appendChild(elements.searchInput);
  elements.searchWidget.appendChild(elements.searchResultsPanel);
  elements.searchResultsPanel.appendChild(elements.bookmarkResultsContainer);
  elements.searchResultsPanel.appendChild(elements.suggestionResultsContainer);

  const documentListeners = {};
  const mockDocument = {
    getElementById: (id) => elements[id] || (Object.values(elements).find(e => e.id === id) || null),
    querySelector: (sel) => {
      if (sel === '.widget-search') return elements.searchWidget;
      if (sel === '.search-area-wrapper') return elements.searchAreaWrapper;
      if (sel === '.search-input-divider') return elements.searchInputDivider;
      if (sel === '#search-engine-selector') return elements.searchEngineSelector;
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
    }
  };

  const openedTabs = [];
  const updatedTabs = [];
  const chromeSearchQueries = [];
  const alertsShown = [];

  const defaultChromeSearchQuery = chromeSearchQuery !== null ? chromeSearchQuery : async (options) => {
    chromeSearchQueries.push(options);
    return;
  };

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
    history: { search: async () => [] }
  };

  const sampleEngines = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=chrome&q=', enabled: true },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?q=', enabled: true },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=', enabled: true }
  ];

  let networkFetches = 0;
  const mockFetch = async (url) => {
    networkFetches++;
    return {
      ok: true,
      text: async () => '["query", ["query 1", "query 2"]]'
    };
  };

  const sandbox = {
    window: {},
    document: mockDocument,
    browser: mockBrowser,
    chrome: {
      search: defaultChromeSearchQuery ? { query: defaultChromeSearchQuery } : undefined
    },
    fetch: mockFetch,
    showCustomAlert: (msg) => { alertsShown.push(msg); },
    HomebaseBuildConfig: {
      target,
      browserDefaultSearch
    },
    searchEngines: sampleEngines,
    currentSearchEngine: sampleEngines[0],
    activeSearchEngineId: 'google',
    allBookmarks: [],
    bangMap: { g: 'google', d: 'duckduckgo', b: 'bing' },
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
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: () => {},
    addEventListener: (event, handler) => {
      documentListeners[event] = documentListeners[event] || [];
      documentListeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!documentListeners[event]) return;
      documentListeners[event] = documentListeners[event].filter(h => h !== handler);
    }
  };

  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  // Execute modules in order
  vm.runInContext(buildConfigScriptCode, ctx);
  vm.runInContext(searchUtilsScriptCode, ctx);
  vm.runInContext(searchSuggestionCacheScriptCode, ctx);
  vm.runInContext(searchSuggestionServiceScriptCode, ctx);
  vm.runInContext(searchResultsRendererScriptCode, ctx);
  vm.runInContext(searchStorageScriptCode, ctx);
  vm.runInContext(searchUiControllerScriptCode, ctx);
  vm.runInContext(searchInteractionControllerScriptCode, ctx);

  return {
    ctx,
    elements,
    openedTabs,
    updatedTabs,
    chromeSearchQueries,
    alertsShown,
    getNetworkFetches: () => networkFetches
  };
}

test('build-config: source target defaults to browserDefaultSearch false', () => {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(buildConfigScriptCode, ctx);

  assert.equal(sandbox.isBrowserDefaultSearch(), false);
  assert.equal(sandbox.getBuildTarget(), 'source');
  assert.equal(sandbox.HomebaseBuildConfig.browserDefaultSearch, false);
});

test('build-config: chrome target provides browserDefaultSearch true', () => {
  const sandbox = {
    window: {},
    HomebaseBuildConfig: Object.freeze({ target: 'chrome', browserDefaultSearch: true }),
    console
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(buildConfigScriptCode, ctx);

  assert.equal(sandbox.isBrowserDefaultSearch(), true);
  assert.equal(sandbox.getBuildTarget(), 'chrome');
});

test('chrome search: web search query routes via chrome.search.query in CURRENT_TAB', async () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('test query', false);

  assert.equal(env.chromeSearchQueries.length, 1, 'chrome.search.query was called once');
  assert.equal(env.chromeSearchQueries[0].text, 'test query');
  assert.equal(env.chromeSearchQueries[0].disposition, 'CURRENT_TAB');
  assert.equal(env.openedTabs.length, 0, 'No new tab was opened via tabs.create');
  assert.equal(env.updatedTabs.length, 0, 'No tab URL was updated via tabs.update');
});

test('chrome search: web search query respects searchOpenNewTabPreference and Alt+Enter (NEW_TAB)', async () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  // Test explicit newTab = true
  await controller.executeSearch('test new tab', true);
  assert.equal(env.chromeSearchQueries.length, 1);
  assert.equal(env.chromeSearchQueries[0].text, 'test new tab');
  assert.equal(env.chromeSearchQueries[0].disposition, 'NEW_TAB');

  // Test preference searchOpenNewTabPreference = true
  env.ctx.appSearchOpenNewTabPreference = true;
  await controller.executeSearch('test preference new tab');
  assert.equal(env.chromeSearchQueries.length, 2);
  assert.equal(env.chromeSearchQueries[1].text, 'test preference new tab');
  assert.equal(env.chromeSearchQueries[1].disposition, 'NEW_TAB');
});

test('chrome search: direct URL navigation bypasses chrome.search.query', async () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('https://example.com/docs', false);
  assert.equal(env.chromeSearchQueries.length, 0, 'chrome.search.query was not called for URL');
  assert.equal(env.updatedTabs.length, 1, 'direct URL navigated via tab update');
  assert.equal(env.updatedTabs[0].url, 'https://example.com/docs');

  await controller.executeSearch('github.com', true);
  assert.equal(env.chromeSearchQueries.length, 0, 'chrome.search.query was not called for URL');
  assert.equal(env.openedTabs.length, 1, 'direct URL navigated via tab create');
  assert.equal(env.openedTabs[0].url, 'https://github.com');
});

test('chrome search: API failure shows user alert and never falls back to hardcoded URL', async () => {
  const failingChromeSearch = async () => {
    throw new Error('Search provider error simulation');
  };
  const env = createSearchTestEnvironment({
    target: 'chrome',
    browserDefaultSearch: true,
    chromeSearchQuery: failingChromeSearch
  });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('failing query', false);

  assert.equal(env.alertsShown.length, 1, 'showCustomAlert was triggered');
  assert.match(env.alertsShown[0], /Search failed/i);
  assert.equal(env.openedTabs.length, 0, 'Did not fall back to browser.tabs.create');
  assert.equal(env.updatedTabs.length, 0, 'Did not fall back to browser.tabs.update');
});

test('chrome search: missing chrome.search API shows user alert without crashing or fallback', async () => {
  const env = createSearchTestEnvironment({
    target: 'chrome',
    browserDefaultSearch: true,
    chromeSearchQuery: false // Simulates missing chrome.search
  });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('missing api query', false);

  assert.equal(env.alertsShown.length, 1, 'showCustomAlert was triggered for missing API');
  assert.match(env.alertsShown[0], /Search failed/i);
  assert.equal(env.openedTabs.length, 0);
  assert.equal(env.updatedTabs.length, 0);
});

test('chrome search: ignores previously saved provider choices for search routing', async () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  // Set legacy saved provider to duckduckgo
  env.ctx.activeSearchEngineId = 'duckduckgo';
  env.ctx.currentSearchEngine = {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q='
  };
  env.ctx.appSearchDefaultEnginePreference = 'duckduckgo';

  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('disregarded provider test', false);

  // Even though currentSearchEngine is duckduckgo, query was routed to chrome.search.query
  assert.equal(env.chromeSearchQueries.length, 1);
  assert.equal(env.chromeSearchQueries[0].text, 'disregarded provider test');
  assert.equal(env.updatedTabs.length, 0, 'Did not navigate to DuckDuckGo URL');
});

test('chrome search: remote suggestions are completely disabled with zero network requests', async () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const suggestionService = env.ctx.HomebaseSearchSuggestionService;

  const suggestions = await suggestionService.fetchSuggestions('weather query');
  assert.equal(suggestions.length, 0);
  assert.equal(env.getNetworkFetches(), 0, 'Zero network fetches performed for suggestions');

  const bangSuggestions = suggestionService.getBangSuggestions('!g');
  assert.equal(bangSuggestions.length, 0);
});

test('chrome search: UI controller applies neutral placeholder and hides engine selector', () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const uiController = env.ctx.HomebaseSearchUIController;
  uiController.initialize();

  assert.equal(env.elements.searchInput.getAttribute('placeholder'), 'Search the web');
  assert.equal(env.elements.searchInput.getAttribute('aria-label'), 'Search the web');
  assert.equal(env.elements.searchEngineSelector.style.display, 'none');
  assert.equal(env.elements.searchInputDivider.style.display, 'none');

  // Verify cycling engine is a no-op
  uiController.cycleSearchEngine('next');
  assert.equal(env.elements.searchInput.getAttribute('placeholder'), 'Search the web');
});

test('chrome search: fast search storage payload returns neutral placeholder and null selector', () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  const storage = env.ctx.HomebaseSearchStorage;

  const payload = storage.getFastSearchPayload();
  assert.equal(payload.placeholder, 'Search the web');
  assert.equal(payload.selectorData, null);
  assert.equal(payload.engineId, null);
});

test('chrome search: settings form saves without overwriting legacy search engine preferences', () => {
  const env = createSearchTestEnvironment({ target: 'chrome', browserDefaultSearch: true });
  // Set initial legacy preferences
  env.ctx.appSearchRememberEnginePreference = false;
  env.ctx.appSearchDefaultEnginePreference = 'duckduckgo';
  env.ctx.appSearchSuggestionsPreference = false;

  // Run settings-form-controller in this context
  vm.runInContext(settingsFormControllerScriptCode, env.ctx);
  const controller = env.ctx.HomebaseSettingsFormController;
  assert.ok(controller, 'HomebaseSettingsFormController loaded');

  const values = controller.scrapeFormValues();
  assert.equal(values.updates.searchRememberEngine, false, 'Preserved legacy remember engine preference');
  assert.equal(values.updates.searchDefaultEngine, 'duckduckgo', 'Preserved legacy default engine preference');
  assert.equal(values.updates.searchSuggestions, false, 'Preserved legacy suggestions preference');
});

test('edge and firefox: multi-engine routing and picker behavior are preserved', async () => {
  // Simulating edge/firefox/source where browserDefaultSearch is false
  const env = createSearchTestEnvironment({ target: 'edge', browserDefaultSearch: false });
  const controller = env.ctx.HomebaseSearchInteractionController;
  controller.initialize();

  await controller.executeSearch('search on edge', false);

  assert.equal(env.chromeSearchQueries.length, 0, 'chrome.search.query was NOT called on Edge');
  assert.equal(env.updatedTabs.length, 1, 'tabs.update was called with engine search URL');
  assert.equal(env.updatedTabs[0].url, 'https://www.google.com/search?q=search%20on%20edge');

  // Suggestions should make network call when enabled
  const suggestionService = env.ctx.HomebaseSearchSuggestionService;
  const suggestions = await suggestionService.fetchSuggestions('edge test', env.ctx.searchEngines[0]);
  assert.equal(env.getNetworkFetches(), 1, 'Suggestions make remote fetch on Edge/Firefox');
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0], 'query 1');
  assert.equal(suggestions[1], 'query 2');

  // UI controller shows engine selector
  const uiController = env.ctx.HomebaseSearchUIController;
  await uiController.initialize();
  assert.notEqual(env.elements.searchEngineSelector.style.display, 'none');
  assert.equal(env.elements.searchInput.placeholder, 'Search with Google');
});


