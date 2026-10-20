import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const searchStorageScriptPath = path.join(rootDir, 'src/newtab/search/search-storage.js');
const searchUtilsScriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const searchSuggestionCacheScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-cache.js');
const searchSuggestionServiceScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-service.js');
const searchResultsRendererScriptPath = path.join(rootDir, 'src/newtab/search/search-results-renderer.js');
const searchUiControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-ui-controller.js');
const searchInteractionControllerScriptPath = path.join(rootDir, 'src/newtab/search/search-interaction-controller.js');

const searchStorageScriptCode = fs.readFileSync(searchStorageScriptPath, 'utf8');
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

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    parentElement: null,
    parentNode: null,
    hidden: false,
    style: {
      setProperty: (k, v) => { styles[k] = String(v); },
      removeProperty: (k) => { delete styles[k]; },
      get: (k) => styles[k],
      display: '',
      transition: '',
      transform: ''
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
    get children() {
      return children;
    },
    get firstElementChild() {
      return children[0] || null;
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
      return textContent;
    },
    set textContent(val) {
      textContent = String(val);
    },
    get value() {
      return value;
    },
    set value(val) {
      value = String(val);
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
      if (sel.startsWith('#')) {
        const idVal = sel.slice(1);
        function findId(node) {
          if (!node || !node.children) return null;
          for (const ch of node.children) {
            if (ch && ch.id === idVal) return ch;
            const nested = findId(ch);
            if (nested) return nested;
          }
          return null;
        }
        return findId(el);
      }
      const tagMatch = sel.match(/^([a-z0-9-]+)(?:\[([a-z0-9-]+)(?:="([^"]+)")?\])?/i);
      if (tagMatch) {
        const tag = tagMatch[1].toUpperCase();
        const attr = tagMatch[2];
        const val = tagMatch[3];
        function findTag(node) {
          if (!node || !node.children) return null;
          for (const ch of node.children) {
            if (ch && ch.tagName === tag) {
              if (!attr) return ch;
              if (val !== undefined ? (ch.dataset?.[attr.replace('data-', '')] === val || ch.getAttribute?.(attr) === val) : (ch.dataset?.[attr.replace('data-', '')] || ch.getAttribute?.(attr))) {
                return ch;
              }
            }
            const nested = findTag(ch);
            if (nested) return nested;
          }
          return null;
        }
        return findTag(el);
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const res = [];
      const isClass = sel.startsWith('.');
      const cls = isClass ? sel.slice(1) : '';
      function walk(node) {
        if (!node || !node.children) return;
        for (const ch of node.children) {
          if (isClass) {
            if (ch && ch.classList && ch.classList.contains(cls)) res.push(ch);
          } else if (sel === 'svg, img') {
            if (ch && (ch.tagName === 'SVG' || ch.tagName === 'IMG')) res.push(ch);
          }
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
      let curr = el;
      while (curr) {
        if (sel.startsWith('.')) {
          if (curr.classList && curr.classList.contains(sel.slice(1))) return curr;
        } else if (curr.id === sel.replace('#', '')) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    },
    focus: () => {
      if (el._ownerDocument) {
        el._ownerDocument.activeElement = el;
      }
      el._isFocused = true;
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
      const type = eventObj.type;
      const list = listeners[type] || [];
      for (const handler of list) {
        handler({ target: el, preventDefault: () => {}, stopPropagation: () => {}, ...eventObj });
      }
    }
  };

  return el;
}

function setupTestEnvironment({ isChrome = false } = {}) {
  const sampleEngines = [
    { id: 'google', name: 'Google', color: '#4285F4', enabled: true, url: 'https://www.google.com/search?q=%s' },
    { id: 'duckduckgo', name: 'DuckDuckGo', color: '#DE5833', enabled: true, url: 'https://duckduckgo.com/?q=%s' },
    { id: 'bing', name: 'Bing', color: '#008373', enabled: true, url: 'https://www.bing.com/search?q=%s' },
    { id: 'github', name: 'GitHub', color: '#24292e', enabled: false, url: 'https://github.com/search?q=%s' }
  ];

  const elements = {
    searchInput: createMockElement('input', 'search-input'),
    searchForm: createMockElement('form', 'search-form'),
    searchEngineSelector: createMockElement('div', 'search-engine-selector'),
    searchSelect: createMockElement('select', 'search-select'),
    searchInputDivider: createMockElement('div', 'search-input-divider'),
    searchContainer: createMockElement('div', 'search-container'),
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
  elements.searchInput.setAttribute('aria-expanded', 'false');
  elements.searchInput.setAttribute('role', 'combobox');

  elements.searchAreaWrapper.appendChild(elements.searchWidget);
  elements.searchWidget.appendChild(elements.searchContainer);
  elements.searchContainer.appendChild(elements.searchSelect);
  elements.searchContainer.appendChild(elements.searchEngineSelector);
  elements.searchContainer.appendChild(elements.searchInputDivider);
  elements.searchContainer.appendChild(elements.searchForm);
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
        case 'search-engine-selector': return elements.searchEngineSelector;
        case 'search-select': return elements.searchSelect;
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
      if (sel === '.search-container') return elements.searchContainer;
      if (sel === '.search-input-divider') return elements.searchInputDivider;
      if (sel === '.main-content') return elements.mainContent;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.widget-search') return [elements.searchWidget];
      return [];
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
  elements.searchEngineSelector._ownerDocument = mockDocument;
  elements.body = mockDocument.body;

  let storedEngine = sampleEngines[0];
  const openedTabs = [];
  const updatedTabs = [];

  const sandbox = {
    window: {},
    document: mockDocument,
    browser: {
      tabs: {
        create: async (details) => { openedTabs.push(details); return { id: 101, ...details }; },
        update: async (details) => { updatedTabs.push(details); return { id: 101, ...details }; }
      },
      history: { search: async () => [] },
      storage: {
        local: {
          get: async () => ({ currentSearchEngine: storedEngine.id }),
          set: async (obj) => { if (obj.currentSearchEngine) storedEngine = sampleEngines.find(e => e.id === obj.currentSearchEngine) || storedEngine; }
        }
      }
    },
    isBrowserDefaultSearch: () => isChrome,
    searchEngines: sampleEngines,
    currentSearchEngine: sampleEngines[0],
    activeSearchEngineId: 'google',
    appSearchRememberEnginePreference: true,
    appSearchDefaultEnginePreference: 'google',
    appSearchSuggestionsPreference: true,
    appSearchMathPreference: true,
    appSearchShowHistoryPreference: false,
    appSearchOpenNewTabPreference: false,
    allBookmarks: [],
    createSvgIconElement: () => createMockElement('svg'),
    setCurrentSearchEngine: (eng) => { storedEngine = eng; sandbox.currentSearchEngine = eng; },
    writeFastSearchCache: () => {},
    preconnectToSearchEngine: () => {},
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
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
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
    interactionController: sandbox.HomebaseSearchInteractionController
  };
}

// 1. Initial markup, native buttons, and ARIA group role
test('phase 2: markup and rendered selector use native buttons with group semantics and accessible names', () => {
  const html = fs.readFileSync(path.join(rootDir, 'src/new-tab.html'), 'utf8');
  assert.ok(
    html.includes('id="search-engine-selector" class="search-engine-selector" role="group" aria-label="Search engines"'),
    'Initial markup must assign role="group" and aria-label="Search engines"'
  );

  const { uiController, elements } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  assert.strictEqual(elements.searchEngineSelector.getAttribute('role'), 'group');
  assert.strictEqual(elements.searchEngineSelector.getAttribute('aria-label'), 'Search engines');

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));
  assert.strictEqual(buttons.length, 3, 'Renders exactly 3 enabled engines (Google, DuckDuckGo, Bing)');

  for (const btn of buttons) {
    assert.strictEqual(btn.tagName, 'BUTTON', 'Must use native button elements');
    assert.strictEqual(btn.getAttribute('type'), 'button', 'Must declare type="button"');
    assert.ok(btn.getAttribute('aria-label'), 'Button must have an accessible name');
  }

  // Active engine has aria-pressed="true", inactive have aria-pressed="false"
  assert.strictEqual(buttons[0].getAttribute('aria-pressed'), 'true');
  assert.strictEqual(buttons[1].getAttribute('aria-pressed'), 'false');
  assert.strictEqual(buttons[2].getAttribute('aria-pressed'), 'false');
});

// 2. Keyboard reachability via Tab and roving tabindex
test('phase 2: selector is reachable using Tab via roving tabindex on the active engine', () => {
  const { uiController, elements } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));
  // Google is active: tabindex="0"; DuckDuckGo and Bing: tabindex="-1"
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '0', 'Active engine must have tabindex="0"');
  assert.strictEqual(buttons[1].getAttribute('tabindex'), '-1', 'Inactive engine must have tabindex="-1"');
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '-1', 'Inactive engine must have tabindex="-1"');
});

// 3. Expansion on focusin and collapse on focusout
test('phase 2: selector expands when focus enters and collapses when focus leaves', () => {
  const { uiController, elements, mockDocument } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));

  // Simulate focus entering selector
  elements.searchEngineSelector.classList.add('suppress-hover');
  elements.searchEngineSelector.dispatchEvent({ type: 'focusin' });
  assert.ok(elements.searchEngineSelector.classList.contains('expanded'), 'Must add .expanded on focusin');
  assert.ok(!elements.searchEngineSelector.classList.contains('suppress-hover'), 'Must remove .suppress-hover on focusin');

  // Simulate focus leaving selector to search input
  elements.searchEngineSelector.dispatchEvent({ type: 'focusout', relatedTarget: elements.searchInput });
  assert.ok(!elements.searchEngineSelector.classList.contains('expanded'), 'Must remove .expanded on focusout');

  // Verify roving tabindex is restored on collapse
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '0');
  assert.strictEqual(buttons[1].getAttribute('tabindex'), '-1');
});

// 4. Arrow navigation (ArrowRight, ArrowLeft, Home, End)
test('phase 2: ArrowLeft and ArrowRight navigate engines with roving tabindex and boundary wrapping', () => {
  const { uiController, elements } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));

  // Start at Google (index 0)
  buttons[0].focus();

  // ArrowRight -> DuckDuckGo (index 1)
  let prevented = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    target: buttons[0],
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {}
  });
  assert.strictEqual(prevented, true, 'ArrowRight calls preventDefault');
  assert.strictEqual(buttons[1].getAttribute('tabindex'), '0');
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '-1');

  // ArrowRight -> Bing (index 2)
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    target: buttons[1],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0');
  assert.strictEqual(buttons[1].getAttribute('tabindex'), '-1');

  // ArrowRight on last -> wraps to Google (index 0)
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    target: buttons[2],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '0');

  // ArrowLeft on first -> wraps to Bing (index 2)
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowLeft',
    target: buttons[0],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0');

  // Home -> first (index 0)
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Home',
    target: buttons[2],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '0');

  // End -> last (index 2)
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'End',
    target: buttons[0],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0');

  // Modified ArrowRight (Alt+ArrowRight) must NOT be intercepted
  let altRightPrevented = false;
  let altRightStopped = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    altKey: true,
    target: buttons[2],
    preventDefault: () => { altRightPrevented = true; },
    stopPropagation: () => { altRightStopped = true; }
  });
  assert.strictEqual(altRightPrevented, false, 'Alt+ArrowRight must not call preventDefault in selector');
  assert.strictEqual(altRightStopped, false, 'Alt+ArrowRight must not call stopPropagation in selector');
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0', 'Index must not change on modified ArrowRight');

  // Modified ArrowLeft (Ctrl+ArrowLeft) must NOT be intercepted
  let ctrlLeftPrevented = false;
  let ctrlLeftStopped = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'ArrowLeft',
    ctrlKey: true,
    target: buttons[2],
    preventDefault: () => { ctrlLeftPrevented = true; },
    stopPropagation: () => { ctrlLeftStopped = true; }
  });
  assert.strictEqual(ctrlLeftPrevented, false, 'Ctrl+ArrowLeft must not call preventDefault in selector');
  assert.strictEqual(ctrlLeftStopped, false, 'Ctrl+ArrowLeft must not call stopPropagation in selector');
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0', 'Index must not change on modified ArrowLeft');

  // Modified Home (Alt+Home) must NOT be intercepted by the selector
  let altHomePrevented = false;
  let altHomeStopped = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Home',
    altKey: true,
    target: buttons[2],
    preventDefault: () => { altHomePrevented = true; },
    stopPropagation: () => { altHomeStopped = true; }
  });
  assert.strictEqual(altHomePrevented, false, 'Alt+Home must not call preventDefault in selector');
  assert.strictEqual(altHomeStopped, false, 'Alt+Home must not call stopPropagation in selector');
  assert.strictEqual(buttons[2].getAttribute('tabindex'), '0', 'Focus must not jump to first button on Alt+Home');
});

// 5. Single activation via Enter and Space with search input return
test('phase 2: Enter and Space select the focused engine exactly once and return focus to search input', () => {
  const { uiController, elements, sandbox, mockDocument } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));

  // Navigate focus to DuckDuckGo (index 1)
  buttons[1].focus();

  let enterPrevented = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    repeat: false,
    target: buttons[1],
    preventDefault: () => { enterPrevented = true; },
    stopPropagation: () => {}
  });

  assert.strictEqual(enterPrevented, true, 'Enter calls preventDefault');
  assert.strictEqual(sandbox.activeSearchEngineId, 'duckduckgo', 'DuckDuckGo is now active');
  assert.strictEqual(elements.searchInput.placeholder, 'Search with DuckDuckGo');
  assert.strictEqual(elements.searchInput.getAttribute('aria-label'), 'Search with DuckDuckGo');
  assert.strictEqual(mockDocument.activeElement, elements.searchInput, 'Focus returned to search input');
  assert.ok(!elements.searchEngineSelector.classList.contains('expanded'), 'Selector collapsed after selection');

  // Held Enter with repeat: true must NOT re-trigger selection
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    repeat: true,
    target: buttons[0],
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(sandbox.activeSearchEngineId, 'duckduckgo', 'Held Enter with repeat: true must not change selection');

  // Test Space activation: select Bing (index 2)
  buttons[2].focus();
  let spacePrevented = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: ' ',
    repeat: false,
    target: buttons[2],
    preventDefault: () => { spacePrevented = true; },
    stopPropagation: () => {}
  });
  assert.strictEqual(spacePrevented, true, 'Space calls preventDefault to stop scrolling');
  assert.strictEqual(sandbox.activeSearchEngineId, 'bing', 'Bing is now active');
  assert.strictEqual(elements.searchInput.placeholder, 'Search with Bing');
  assert.strictEqual(mockDocument.activeElement, elements.searchInput, 'Focus returned to search input');
});

// 6. Escape closes selector without changing selection
test('phase 2: Escape closes selector without changing selection and returns focus to search input', () => {
  const { uiController, elements, sandbox, mockDocument } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });
  uiController.updateSearchUI('google');

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));

  // Initial engine is Google
  assert.strictEqual(sandbox.activeSearchEngineId, 'google');
  assert.strictEqual(elements.searchInput.placeholder, 'Search with Google');

  // Open selector and navigate focus to DuckDuckGo (index 1)
  elements.searchEngineSelector.classList.add('expanded');
  buttons[1].focus();

  let escapePrevented = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    target: buttons[1],
    preventDefault: () => { escapePrevented = true; },
    stopPropagation: () => {}
  });

  assert.strictEqual(escapePrevented, true, 'Escape calls preventDefault');
  assert.strictEqual(sandbox.activeSearchEngineId, 'google', 'Engine selection remains unchanged');
  assert.strictEqual(elements.searchInput.placeholder, 'Search with Google');
  assert.ok(!elements.searchEngineSelector.classList.contains('expanded'), 'Selector is collapsed');
  assert.strictEqual(mockDocument.activeElement, elements.searchInput, 'Focus returned to search input');
  assert.strictEqual(buttons[0].getAttribute('tabindex'), '0', 'Roving tabindex restored to active engine');
});

// 7. Focus preservation and fallback on rerender
test('phase 2: rerender preserves focus by engine ID and falls back gracefully if engine removed', () => {
  const { uiController, elements, sandbox, mockDocument } = setupTestEnvironment({ isChrome: false });
  uiController.renderSearchEngineSelector({ animate: false });

  let buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));

  // Focus DuckDuckGo (index 1)
  buttons[1].focus();
  assert.strictEqual(mockDocument.activeElement, buttons[1]);

  // Rerender with DuckDuckGo still enabled
  uiController.renderSearchEngineSelector({ animate: false });
  buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));
  const duckduckgoBtn = buttons.find(b => b.dataset.engineId === 'duckduckgo');
  assert.ok(duckduckgoBtn);
  assert.strictEqual(mockDocument.activeElement, duckduckgoBtn, 'Focus preserved on DuckDuckGo after rerender');

  // Now disable DuckDuckGo in configuration and rerender
  sandbox.searchEngines = sandbox.searchEngines.map(e => e.id === 'duckduckgo' ? { ...e, enabled: false } : e);
  uiController.renderSearchEngineSelector({ animate: false });

  buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));
  const activeFallback = buttons.find(b => b.dataset.engineId === sandbox.activeSearchEngineId);
  assert.strictEqual(mockDocument.activeElement, activeFallback, 'Focus fell back to active engine when focused engine removed');
});

// 8. Coordination with global search interaction controller
test('phase 2: selector Enter, Space, and Arrow keys do not trigger search submission or quick-focus', () => {
  const { uiController, interactionController, elements, updatedTabs, sandbox } = setupTestEnvironment({ isChrome: false });

  uiController.renderSearchEngineSelector({ animate: false });
  interactionController.initialize({ bindEvents: true });

  const buttons = Array.from(elements.searchEngineSelector.querySelectorAll('.engine-icon-btn'));
  buttons[0].focus();

  // 1. Enter inside engine selector must NOT submit a search query
  interactionController.handleKeydown({
    key: 'Enter',
    target: buttons[0],
    preventDefault: () => {}
  });
  assert.strictEqual(updatedTabs.length, 0, 'Enter inside engine selector must not submit search');

  // 2. Space inside engine selector must NOT trigger quick-focus
  let searchFocused = false;
  elements.searchInput.focus = () => { searchFocused = true; };
  elements.mockDocument = elements.searchInput._ownerDocument;
  elements.mockDocument.activeElement = buttons[0];
  elements.mockDocument.dispatchEvent({
    key: ' ',
    target: buttons[0],
    defaultPrevented: false
  });
  assert.strictEqual(searchFocused, false, 'Space on engine selector must not steal focus via quick-focus');

  // 3. ArrowDown inside engine selector must NOT navigate suggestion items
  interactionController.handleKeydown({
    key: 'ArrowDown',
    target: buttons[0],
    preventDefault: () => {}
  });
  assert.strictEqual(interactionController.getState().currentSelectionIndex, -1, 'ArrowDown inside selector must not navigate suggestions');

  // 4. Alt+Home inside engine selector is preserved and resets to default search engine
  uiController.updateSearchUI('duckduckgo');
  assert.strictEqual(sandbox.activeSearchEngineId, 'duckduckgo');

  let altHomePreventedInSelector = false;
  let altHomeStoppedInSelector = false;
  elements.searchEngineSelector.dispatchEvent({
    type: 'keydown',
    key: 'Home',
    altKey: true,
    target: buttons[1],
    preventDefault: () => { altHomePreventedInSelector = true; },
    stopPropagation: () => { altHomeStoppedInSelector = true; }
  });
  assert.strictEqual(altHomePreventedInSelector, false, 'Selector must not call preventDefault on Alt+Home');
  assert.strictEqual(altHomeStoppedInSelector, false, 'Selector must not stop propagation for Alt+Home');

  let defaultResetPrevented = false;
  interactionController.handleKeydown({
    key: 'Home',
    altKey: true,
    target: buttons[1],
    preventDefault: () => { defaultResetPrevented = true; }
  });
  assert.strictEqual(defaultResetPrevented, true, 'Global Alt+Home handler calls preventDefault');
  assert.strictEqual(sandbox.activeSearchEngineId, 'google', 'Alt+Home reset active engine to default (Google)');
  assert.strictEqual(elements.searchInput.placeholder, 'Search with Google');

  // 5. Alt+ArrowDown inside engine selector cycles search engine
  let altCyclePrevented = false;
  interactionController.handleKeydown({
    key: 'ArrowDown',
    altKey: true,
    target: buttons[0],
    preventDefault: () => { altCyclePrevented = true; }
  });
  assert.strictEqual(altCyclePrevented, true, 'Global Alt+ArrowDown handler calls preventDefault');
  assert.strictEqual(sandbox.activeSearchEngineId, 'duckduckgo', 'Alt+ArrowDown cycled to next engine (DuckDuckGo)');

  // 6. Alt+ArrowUp inside engine selector cycles search engine upward
  let altUpCyclePrevented = false;
  interactionController.handleKeydown({
    key: 'ArrowUp',
    altKey: true,
    target: buttons[0],
    preventDefault: () => { altUpCyclePrevented = true; }
  });
  assert.strictEqual(altUpCyclePrevented, true, 'Global Alt+ArrowUp handler calls preventDefault');
  assert.strictEqual(sandbox.activeSearchEngineId, 'google', 'Alt+ArrowUp cycled back to previous engine (Google)');

  interactionController.destroy();
  uiController.destroy();
});

// 9. Chrome exclusion: engine selector remains completely hidden and out of tab order
test('phase 2: Chrome distribution excludes engine selector from display and accessibility tree', () => {
  const { uiController, elements } = setupTestEnvironment({ isChrome: true });

  uiController.renderSearchEngineSelector({ animate: false });

  // In Chrome, selector is emptied, display: none, and aria-hidden="true"
  assert.strictEqual(elements.searchEngineSelector.style.display, 'none');
  assert.strictEqual(elements.searchEngineSelector.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(elements.searchEngineSelector.children.length, 0, 'No buttons in DOM in Chrome');

  // Input placeholder and aria-label are neutral "Search the web"
  assert.strictEqual(elements.searchInput.placeholder, 'Search the web');
  assert.strictEqual(elements.searchInput.getAttribute('aria-label'), 'Search the web');
});
