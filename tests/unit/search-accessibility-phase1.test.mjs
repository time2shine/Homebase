import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const searchUtilsScriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const searchSuggestionCacheScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-cache.js');
const searchSuggestionServiceScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-service.js');
const searchResultsRendererScriptPath = path.join(rootDir, 'src/newtab/search/search-results-renderer.js');
const searchUiControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-ui-controller.js');
const searchInteractionControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-interaction-controller.js');

const searchUtilsScriptCode = fs.readFileSync(searchUtilsScriptPath, 'utf8');
const searchSuggestionCacheScriptCode = fs.readFileSync(searchSuggestionCacheScriptPath, 'utf8');
const searchSuggestionServiceScriptCode = fs.readFileSync(searchSuggestionServiceScriptPath, 'utf8');
const searchResultsRendererScriptCode = fs.readFileSync(searchResultsRendererScriptPath, 'utf8');
const searchUiControllerScriptCode = fs.readFileSync(searchUiControllerScriptPath, 'utf8');
const searchInteractionControllerScriptCode = fs.readFileSync(searchInteractionControllerScriptPath, 'utf8');

function createMockElement(tagName = 'div', id = '') {
  const classes = new Set();
  const children = [];
  const styles = {};
  const listeners = {};
  const dataset = {};
  const attributes = {};
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
          if (child.nodeType === 11) {
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
    closest: (sel) => {
      const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
      let curr = el;
      while (curr) {
        for (const s of selectors) {
          if (s.startsWith('.')) {
            if (curr.classList && curr.classList.contains(s.slice(1))) return curr;
          } else if (s.startsWith('[')) {
            const match = s.match(/\[([a-z0-9-]+)(?:="([^"]+)")?\]/i);
            if (match) {
              const attrName = match[1];
              const attrVal = match[2];
              const actual = curr.getAttribute ? curr.getAttribute(attrName) : null;
              if (attrVal !== undefined ? actual === attrVal : actual !== null) return curr;
            }
          } else {
            if (curr.tagName && curr.tagName.toLowerCase() === s.toLowerCase()) return curr;
          }
        }
        curr = curr.parentElement;
      }
      return null;
    },
    scrollIntoView: () => {},
    focus: () => {
      if (el._ownerDocument) {
        el._ownerDocument.activeElement = el;
      }
    },
    getAttribute: (attr) => attributes[attr] ?? el[attr] ?? null,
    setAttribute: (attr, val) => {
      attributes[attr] = String(val);
      el[attr] = String(val);
    },
    removeAttribute: (attr) => {
      delete attributes[attr];
      delete el[attr];
    },
    addEventListener: (event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent: (eventObj = {}) => {
      const list = listeners[eventObj.type] || [];
      for (const handler of list) {
        handler({ target: el, preventDefault: () => {}, stopPropagation: () => {}, ...eventObj });
      }
    }
  };

  return el;
}

function setupTestEnvironment({ isChrome = false } = {}) {
  const sampleEngines = [
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', enabled: true },
    { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', enabled: true },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', enabled: true }
  ];

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
    suggestionsToggle: createMockElement('input', 'setting-search-suggestions'),
    searchSelect: createMockElement('select', 'search-select'),
    searchEngineSelector: createMockElement('div', 'search-engine-selector')
  };

  elements.searchWidget.className = 'widget widget-search';
  elements.searchAreaWrapper.className = 'search-area-wrapper';
  elements.searchResultsPanel.classList.add('hidden');

  elements.searchInput.setAttribute('aria-expanded', 'false');
  elements.searchInput.setAttribute('role', 'combobox');

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
        case 'search-select': return elements.searchSelect;
        case 'search-engine-selector': return elements.searchEngineSelector;
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
    createElement: (tag) => {
      const el = createMockElement(tag);
      el._ownerDocument = mockDocument;
      return el;
    },
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
    dispatchEvent: (eventObj = {}) => {
      const type = eventObj.type || 'keydown';
      const list = documentListeners[type] || [];
      list.forEach(handler => handler({ target: mockDocument.body, preventDefault: () => {}, stopPropagation: () => {}, type, ...eventObj }));
    }
  };

  elements.searchInput._ownerDocument = mockDocument;
  elements.body = mockDocument.body;

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

  const sandbox = {
    window: {},
    document: mockDocument,
    browser: mockBrowser,
    isBrowserDefaultSearch: () => isChrome,
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
      { id: '2', title: 'Google News', url: 'https://news.google.com' }
    ],
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

  vm.createContext(sandbox);
  vm.runInContext(searchUtilsScriptCode, sandbox);
  vm.runInContext(searchSuggestionCacheScriptCode, sandbox);
  vm.runInContext(searchSuggestionServiceScriptCode, sandbox);
  vm.runInContext(searchResultsRendererScriptCode, sandbox);
  vm.runInContext(searchUiControllerScriptCode, sandbox);
  vm.runInContext(searchInteractionControllerScriptCode, sandbox);

  return {
    sandbox,
    elements,
    mockDocument,
    openedTabs,
    updatedTabs,
    uiController: sandbox.HomebaseSearchUiController,
    renderer: sandbox.HomebaseSearchResultsRenderer,
    interactionController: sandbox.HomebaseSearchInteractionController
  };
}

// 1. Initial Markup & Accessible Name
test('phase 1: initial markup specifies accessible combobox roles, attributes, and engine-aware name', () => {
  const html = fs.readFileSync(path.join(rootDir, 'src/new-tab.html'), 'utf8');

  // Search input combobox attributes
  assert.ok(html.includes('id="search-input"'), 'search-input exists in new-tab.html');
  assert.ok(html.includes('role="combobox"'), 'search-input has role="combobox"');
  assert.ok(html.includes('aria-autocomplete="list"'), 'search-input has aria-autocomplete="list"');
  assert.ok(html.includes('aria-expanded="false"'), 'search-input initializes with aria-expanded="false"');
  assert.ok(html.includes('aria-haspopup="listbox"'), 'search-input has aria-haspopup="listbox"');
  assert.ok(html.includes('aria-controls="search-results-panel"'), 'search-input has aria-controls="search-results-panel"');
  assert.ok(html.includes('aria-label="Search with Google"'), 'search-input has initial engine-aware aria-label');

  // Search results panel and groups
  assert.ok(html.includes('id="search-results-panel" class="hidden" role="listbox" aria-label="Search suggestions"'));
  assert.ok(html.includes('id="bookmark-results-container" role="group" aria-label="Bookmarks and calculations"'));
  assert.ok(html.includes('id="suggestion-results-container" role="group" aria-label="Search suggestions and history"'));
});

// 2. Engine-aware Accessible Name Updates
test('phase 1: search UI updates engine-aware aria-label for Edge/Firefox and neutral for Chrome', () => {
  // Edge / Firefox
  const edgeEnv = setupTestEnvironment({ isChrome: false });
  edgeEnv.uiController.updateSearchUI('duckduckgo');
  assert.strictEqual(edgeEnv.elements.searchInput.getAttribute('aria-label'), 'Search with DuckDuckGo');
  assert.strictEqual(edgeEnv.elements.searchInput.placeholder, 'Search with DuckDuckGo');

  // Chrome browser-default search
  const chromeEnv = setupTestEnvironment({ isChrome: true });
  chromeEnv.uiController.updateSearchUI('google');
  assert.strictEqual(chromeEnv.elements.searchInput.getAttribute('aria-label'), 'Search the web');
  assert.strictEqual(chromeEnv.elements.searchInput.placeholder, 'Search the web');
});

// 3. Option Items: role="option", tabindex="-1", aria-selected="false", unique IDs, presentation headers
test('phase 1: renderer sets role="option", tabindex="-1", aria-selected="false", and unique option IDs', () => {
  const { renderer } = setupTestEnvironment();

  const calc = renderer.createCalculatorItem({ displayResult: '42', query: '6*7' });
  const bm = renderer.createBookmarkItem({ title: 'GitHub', url: 'https://github.com' });
  const bang = renderer.createBangItem({ bang: 'g', engine: { name: 'Google', symbolId: 'search' } });
  const bangEmpty = renderer.createBangEmptyItem();
  const hist = renderer.createHistoryItem({ title: 'History', url: 'https://example.com' });
  const sugg = renderer.createSuggestionItem({ name: 'Google', url: 'https://google.com/search?q=%s' }, 'cats');
  const direct = renderer.createDirectQueryItem({ name: 'Google', url: 'https://google.com/search?q=%s' }, 'dogs');
  const header = renderer.createSectionHeader('Search Suggestions');

  const items = [calc, bm, bang, bangEmpty, hist, sugg, direct];
  const ids = new Set();

  for (const item of items) {
    assert.ok(item, 'Item was generated');
    assert.strictEqual(item.getAttribute('role'), 'option', 'Item must have role="option"');
    assert.strictEqual(item.getAttribute('tabindex'), '-1', 'Item must have tabindex="-1" to stay out of tab order');
    assert.strictEqual(item.getAttribute('aria-selected'), 'false', 'Item must have aria-selected="false" by default');
    assert.ok(item.id.startsWith('search-result-opt-'), 'Item must have monotonically generated option ID');
    assert.ok(!ids.has(item.id), `Option ID ${item.id} must be unique`);
    ids.add(item.id);
  }

  // Header should have presentation semantics and be ignored by assistive tech
  assert.strictEqual(header.getAttribute('role'), 'presentation');
  assert.strictEqual(header.getAttribute('aria-hidden'), 'true');

  // Calculator copy button must be excluded from tab stops
  const copyBtn = calc.querySelector('.calc-copy');
  assert.ok(copyBtn);
  assert.strictEqual(copyBtn.getAttribute('tabindex'), '-1');
  assert.strictEqual(copyBtn.getAttribute('aria-hidden'), 'true');

  // Calculator option accessible name must communicate copy action
  assert.strictEqual(calc.getAttribute('aria-label'), '42 (6*7) - Copy to clipboard');
});

// 4. ARIA State Synchronization through Show, Selection, and Hide
test('phase 1: aria-expanded and aria-activedescendant synchronize with panel visibility and selection', () => {
  const { interactionController, renderer, elements } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  // Initially closed
  assert.strictEqual(elements.searchInput.getAttribute('aria-expanded'), 'false');
  assert.strictEqual(elements.searchInput.getAttribute('aria-activedescendant'), null);

  // Add items and open panel
  const item1 = renderer.createBookmarkItem({ title: 'GitHub', url: 'https://github.com' });
  const item2 = renderer.createBookmarkItem({ title: 'Google News', url: 'https://news.google.com' });
  elements.bookmarkResultsContainer.appendChild(item1);
  elements.bookmarkResultsContainer.appendChild(item2);

  renderer.updatePanelVisibility({
    panel: elements.searchResultsPanel,
    widget: elements.searchWidget,
    input: elements.searchInput,
    bookmarkContainer: elements.bookmarkResultsContainer
  });

  assert.strictEqual(elements.searchInput.getAttribute('aria-expanded'), 'true', 'aria-expanded should be true when results open');

  // Select first item
  interactionController.selectItem([item1, item2], 0, true);
  assert.strictEqual(item1.getAttribute('aria-selected'), 'true');
  assert.strictEqual(elements.searchInput.getAttribute('aria-activedescendant'), item1.id);

  // Select second item
  interactionController.selectItem([item1, item2], 1, true);
  assert.strictEqual(item1.getAttribute('aria-selected'), 'false');
  assert.strictEqual(item2.getAttribute('aria-selected'), 'true');
  assert.strictEqual(elements.searchInput.getAttribute('aria-activedescendant'), item2.id);

  // Clear selections
  interactionController.clearAllSelections();
  assert.strictEqual(item2.getAttribute('aria-selected'), 'false');
  assert.strictEqual(elements.searchInput.getAttribute('aria-activedescendant'), null);

  // Close panel
  renderer.updatePanelVisibility({
    panel: elements.searchResultsPanel,
    widget: elements.searchWidget,
    input: elements.searchInput,
    bookmarkContainer: null,
    suggestionContainer: null
  });
  assert.strictEqual(elements.searchInput.getAttribute('aria-expanded'), 'false');
  assert.strictEqual(elements.searchInput.getAttribute('aria-activedescendant'), null);

  interactionController.destroy();
});

// 5. Tab / Shift+Tab Dismisses Results without preventDefault or Query Mutation
test('phase 1: Tab/Shift+Tab dismisses search results and allows normal browser focus navigation', () => {
  const { interactionController, renderer, elements } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  // Setup visible results
  const item1 = renderer.createBookmarkItem({ title: 'GitHub', url: 'https://github.com' });
  elements.bookmarkResultsContainer.appendChild(item1);
  elements.searchResultsPanel.classList.remove('hidden');
  elements.searchInput.value = 'git';

  let defaultPrevented = false;
  const tabEvent = {
    key: 'Tab',
    target: elements.searchInput,
    preventDefault: () => { defaultPrevented = true; }
  };

  interactionController.handleKeydown(tabEvent);

  assert.strictEqual(defaultPrevented, false, 'Tab must NOT call preventDefault so browser can navigate focus');
  assert.ok(elements.searchResultsPanel.classList.contains('hidden'), 'Tab must hide results panel');
  assert.strictEqual(elements.searchInput.value, 'git', 'Tab must NOT mutate the query');
  assert.strictEqual(interactionController.getState().currentSelectionIndex, -1, 'Selection must be cleared');

  interactionController.destroy();
});

// 6. Async Suggestions do not reopen panel if focus has left search input
test('phase 1: pending async suggestions do not reopen popup after focus leaves search input', async () => {
  const { interactionController, elements, mockDocument } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true, debounceWait: 0 });

  elements.searchInput.value = 'test query';

  // Simulate focus moving to another element (e.g. user pressed Tab)
  mockDocument.activeElement = elements.bookmarksGrid;

  await interactionController.handleInput();

  assert.ok(elements.searchResultsPanel.classList.contains('hidden'), 'Panel should remain hidden after focus left');
  assert.strictEqual(elements.searchInput.getAttribute('aria-expanded'), 'false');

  interactionController.destroy();
});

// 7. Category shortcuts (PageDown / PageUp) move between sections when input focused and results open
test('phase 1: PageDown and PageUp jump result categories only when search input is focused and results open', () => {
  const { interactionController, renderer, elements, mockDocument } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  const bmItem = renderer.createBookmarkItem({ title: 'GitHub', url: 'https://github.com' });
  const suggItem = renderer.createSuggestionItem({ name: 'Google', url: 'https://google.com' }, 'query');
  elements.bookmarkResultsContainer.appendChild(bmItem);
  elements.suggestionResultsContainer.appendChild(suggItem);
  elements.searchResultsPanel.classList.remove('hidden');

  mockDocument.activeElement = elements.searchInput;

  // Unmodified PageDown moves section and prevents default
  let pagedownPrevented = false;
  interactionController.handleKeydown({
    key: 'PageDown',
    target: elements.searchInput,
    preventDefault: () => { pagedownPrevented = true; }
  });
  assert.strictEqual(pagedownPrevented, true, 'PageDown must preventDefault when results open');
  assert.strictEqual(interactionController.getState().currentSectionIndex, 1, 'Moved to suggestions section');

  // Unmodified PageUp moves section back and prevents default
  let pageupPrevented = false;
  interactionController.handleKeydown({
    key: 'PageUp',
    target: elements.searchInput,
    preventDefault: () => { pageupPrevented = true; }
  });
  assert.strictEqual(pageupPrevented, true, 'PageUp must preventDefault when results open');
  assert.strictEqual(interactionController.getState().currentSectionIndex, 0, 'Moved back to bookmarks section');

  // When panel is hidden, PageDown is ignored
  elements.searchResultsPanel.classList.add('hidden');
  let ignoredPrevented = false;
  interactionController.handleKeydown({
    key: 'PageDown',
    target: elements.searchInput,
    preventDefault: () => { ignoredPrevented = true; }
  });
  assert.strictEqual(ignoredPrevented, false, 'PageDown must be ignored when results are closed');

  interactionController.destroy();
});

// 8. IME Composition Protection: Enter, candidate keys, and submission
test('phase 1: IME composition protects candidate keys, Enter, and form submission', () => {
  const { interactionController, elements, openedTabs, updatedTabs } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  elements.searchResultsPanel.classList.remove('hidden');
  elements.searchInput.value = 'nihon';

  // 1. Keydown with isComposing = true
  interactionController.handleKeydown({
    key: 'Enter',
    isComposing: true,
    target: elements.searchInput,
    preventDefault: () => {}
  });
  assert.strictEqual(openedTabs.length, 0);
  assert.strictEqual(updatedTabs.length, 0);

  // 2. Keydown with keyCode = 229 (IME composing indicator)
  interactionController.handleKeydown({
    key: 'Enter',
    keyCode: 229,
    target: elements.searchInput,
    preventDefault: () => {}
  });
  assert.strictEqual(openedTabs.length, 0);
  assert.strictEqual(updatedTabs.length, 0);

  // 3. Form submit with isComposing
  interactionController.handleSubmit({
    isComposing: true,
    preventDefault: () => {}
  });
  assert.strictEqual(openedTabs.length, 0);
  assert.strictEqual(updatedTabs.length, 0);

  // 4. Input compositionstart event locks controller
  elements.searchInput.dispatchEvent({ type: 'compositionstart' });
  interactionController.handleKeydown({
    key: 'Enter',
    target: elements.searchInput,
    preventDefault: () => {}
  });
  assert.strictEqual(openedTabs.length, 0);
  assert.strictEqual(updatedTabs.length, 0);

  // 5. Input compositionend event releases lock
  elements.searchInput.dispatchEvent({ type: 'compositionend' });
  interactionController.handleKeydown({
    key: 'Enter',
    target: elements.searchInput,
    preventDefault: () => {}
  });
  assert.strictEqual(updatedTabs.length, 1, 'Search executes normally after compositionend');

  interactionController.destroy();
});

// 9. Held Enter (e.repeat) and Keydown-Submit Deduplication
test('phase 1: held Enter suppresses repeated submissions and prevents keydown/submit duplicate dispatch', async () => {
  const { interactionController, elements, updatedTabs } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  elements.searchResultsPanel.classList.remove('hidden');
  elements.searchInput.value = 'test query';

  // First Enter keydown executes search
  let firstEnterPrevented = false;
  interactionController.handleKeydown({
    key: 'Enter',
    repeat: false,
    target: elements.searchInput,
    preventDefault: () => { firstEnterPrevented = true; }
  });
  assert.strictEqual(firstEnterPrevented, true, 'First Enter calls preventDefault');
  assert.strictEqual(updatedTabs.length, 1, 'First search dispatched');

  // Immediate subsequent form submit event (synthesized or native) is deduplicated via event ownership
  interactionController.handleSubmit({
    preventDefault: () => {}
  });
  assert.strictEqual(updatedTabs.length, 1, 'Submit event paired with keydown did not dispatch duplicate search');

  // Repeated keydown from held Enter (e.repeat = true) is suppressed
  let repeatPrevented = false;
  interactionController.handleKeydown({
    key: 'Enter',
    repeat: true,
    target: elements.searchInput,
    preventDefault: () => { repeatPrevented = true; }
  });
  assert.strictEqual(repeatPrevented, true, 'Held Enter calls preventDefault to stop native repeat');
  assert.strictEqual(updatedTabs.length, 1, 'Held Enter did not dispatch repeat search');

  // Clear microtask event ownership
  await Promise.resolve();

  // Later legitimate search executes normally
  elements.searchInput.value = 'another query';
  interactionController.handleSubmit({
    preventDefault: () => {}
  });
  assert.strictEqual(updatedTabs.length, 2, 'Separate legitimate search dispatched');

  interactionController.destroy();
});

// 10. Global Quick-Focus Handling & Interactive Exclusions
test('phase 1: quick-focus does not steal focus from buttons, links, editable controls, bookmark tiles, or active dialogs', () => {
  const { interactionController, elements, mockDocument } = setupTestEnvironment();

  interactionController.initialize({ bindEvents: true });

  let focused = false;
  elements.searchInput.focus = () => { focused = true; };

  // Helper to test quick focus dispatch
  function dispatchKey(target, key = 'a', extra = {}) {
    focused = false;
    mockDocument.activeElement = target;
    mockDocument.dispatchEvent({
      key,
      target,
      defaultPrevented: false,
      isComposing: false,
      ...extra
    });
    return focused;
  }

  // 1. Button target
  const button = createMockElement('button');
  assert.strictEqual(dispatchKey(button), false, 'Must not steal focus from buttons');

  // 2. Link target
  const link = createMockElement('a');
  link.setAttribute('href', 'https://example.com');
  assert.strictEqual(dispatchKey(link), false, 'Must not steal focus from links');

  // 3. Select target
  const select = createMockElement('select');
  assert.strictEqual(dispatchKey(select), false, 'Must not steal focus from selects');

  // 4. Textarea target
  const textarea = createMockElement('textarea');
  assert.strictEqual(dispatchKey(textarea), false, 'Must not steal focus from textarea');

  // 5. Bookmark tile target
  const tile = createMockElement('div');
  tile.className = 'bookmark-tile';
  assert.strictEqual(dispatchKey(tile), false, 'Must not steal focus from bookmark tiles');

  // 6. Active dialog (body has modal-open)
  mockDocument.body.classList.add('modal-open');
  const bodyTarget = createMockElement('div');
  assert.strictEqual(dispatchKey(bodyTarget), false, 'Must not steal focus when modal dialog is open');
  mockDocument.body.classList.remove('modal-open');

  // 7. Modifiers (Ctrl+K, Alt+F, etc.)
  assert.strictEqual(dispatchKey(bodyTarget, 'k', { ctrlKey: true }), false, 'Must not steal focus with Ctrl key');

  // 8. Already handled event (defaultPrevented = true)
  assert.strictEqual(dispatchKey(bodyTarget, 'a', { defaultPrevented: true }), false, 'Must not steal focus when default is prevented');

  // 9. Eligible noninteractive body area
  assert.strictEqual(dispatchKey(mockDocument.body, 'b'), true, 'Must focus search input on eligible noninteractive page area');

  interactionController.destroy();
});

// 11. Calculator Copy Action and Accessible Label
test('phase 1: calculator option accessible name communicates copy action and Enter or click executes copy', () => {
  let copiedText = '';
  const { interactionController, renderer, elements, sandbox } = setupTestEnvironment();

  sandbox.navigator.clipboard = {
    writeText: async (text) => {
      copiedText = text;
    }
  };

  interactionController.initialize({ bindEvents: true });

  const calcItem = renderer.createCalculatorItem({ displayResult: '42', query: '6*7' });
  assert.strictEqual(calcItem.getAttribute('aria-label'), '42 (6*7) - Copy to clipboard');

  elements.bookmarkResultsContainer.appendChild(calcItem);
  elements.searchResultsPanel.classList.remove('hidden');

  // Select calculator option and press Enter
  interactionController.selectItem(calcItem, true);
  interactionController.handleKeydown({
    key: 'Enter',
    target: elements.searchInput,
    preventDefault: () => {}
  });

  // Verify copy action was executed via Enter
  assert.strictEqual(copiedText, '42', 'Enter activation on calculator option copied calculation result');

  // Test direct click on calculator option item
  copiedText = '';
  interactionController.handleResultClick({ target: calcItem, preventDefault: () => {}, stopPropagation: () => {} });
  assert.strictEqual(copiedText, '42', 'Clicking calculator item copied calculation result');

  interactionController.destroy();
});
