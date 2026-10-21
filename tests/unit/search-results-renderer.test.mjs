import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rendererScriptPath = path.join(rootDir, 'src/newtab/search/search-results-renderer.js');
const rendererScriptCode = fs.readFileSync(rendererScriptPath, 'utf8');

function createMockElement(tagName = 'div', id = '') {
  const classes = new Set();
  const children = [];
  const styles = {};
  const dataset = {};
  const attributes = {};
  let textContent = '';

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    children,
    parentElement: null,
    parentNode: null,
    style: {
      setProperty: (k, v) => { styles[k] = String(v); },
      removeProperty: (k) => { delete styles[k]; },
      get: (k) => styles[k],
      display: ''
    },
    classList: {
      add: (...c) => c.forEach(item => classes.add(item)),
      remove: (...c) => c.forEach(item => classes.delete(item)),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    removeAttribute: (k) => { delete attributes[k]; },
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
      if (el.parentElement && typeof el.parentElement.removeChild === 'function') {
        el.parentElement.removeChild(el);
      }
    },
    querySelector: (selector) => {
      const all = el.querySelectorAll(selector);
      return all.length ? all[0] : null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      const traverse = (node) => {
        for (const child of node.children || []) {
          if (matchesSelector(child, selector)) {
            results.push(child);
          }
          traverse(child);
        }
      };
      traverse(el);
      return results;
    }
  };

  Object.defineProperty(el, 'className', {
    get: () => Array.from(classes).join(' '),
    set: (val) => {
      classes.clear();
      if (val) {
        String(val).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    }
  });

  Object.defineProperty(el, 'textContent', {
    get: () => textContent || (children.map(c => c.textContent).join(' ')),
    set: (val) => {
      textContent = String(val);
      children.length = 0;
    }
  });

  Object.defineProperty(el, 'innerHTML', {
    get: () => (children.length ? '<span>child</span>' : textContent),
    set: (val) => {
      if (!val) {
        children.length = 0;
        textContent = '';
      } else {
        textContent = String(val);
      }
    }
  });

  Object.defineProperty(el, 'previousElementSibling', {
    get: () => {
      if (!el.parentElement) return null;
      const sibs = el.parentElement.children;
      const idx = sibs.indexOf(el);
      return idx > 0 ? sibs[idx - 1] : null;
    }
  });

  return el;
}

function matchesSelector(node, selector) {
  if (selector.includes('[data-favicon-raw-url]')) {
    const cls = selector.replace('[data-favicon-raw-url]', '').replace(/^\./, '');
    const hasClass = cls ? (node.classList && node.classList.contains(cls)) : true;
    return hasClass && Boolean(node.dataset && node.dataset.faviconRawUrl);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return node.classList && node.classList.contains(cls);
  }
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return node.id === id;
  }
  if (selector.startsWith('button.')) {
    const cls = selector.replace('button.', '');
    return node.tagName === 'BUTTON' && node.classList && node.classList.contains(cls);
  }
  return false;
}

function createMockDocument() {
  return {
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => {
      const children = [];
      return {
        nodeType: 11,
        children,
        appendChild: (child) => {
          if (child) children.push(child);
          return child;
        }
      };
    }
  };
}

function setupTestEnvironment() {
  const mockDoc = createMockDocument();
  const createdSvgIcons = [];

  const sandbox = {
    console,
    document: mockDoc,
    Element: class MockElement {},
    createSvgIconElement: (id) => {
      createdSvgIcons.push(id);
      const icon = mockDoc.createElement('svg');
      icon.dataset.iconId = id;
      return icon;
    }
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(rendererScriptCode, ctx);

  return {
    renderer: sandbox.HomebaseSearchResultsRenderer,
    createdSvgIcons,
    sandbox,
    doc: mockDoc
  };
}

// 1. API Exists
test('search-results-renderer: Renderer API exists on window.HomebaseSearchResultsRenderer', () => {
  const { renderer } = setupTestEnvironment();
  assert.ok(renderer, 'HomebaseSearchResultsRenderer should exist');
  assert.strictEqual(typeof renderer.createSectionHeader, 'function');
  assert.strictEqual(typeof renderer.createCalculatorItem, 'function');
  assert.strictEqual(typeof renderer.createBookmarkItem, 'function');
  assert.strictEqual(typeof renderer.createBangItem, 'function');
  assert.strictEqual(typeof renderer.createBangEmptyItem, 'function');
  assert.strictEqual(typeof renderer.createHistoryItem, 'function');
  assert.strictEqual(typeof renderer.createDirectQueryItem, 'function');
  assert.strictEqual(typeof renderer.createSuggestionItem, 'function');
  assert.strictEqual(typeof renderer.createSvgIcon, 'function');
  assert.strictEqual(typeof renderer.renderTopResults, 'function');
  assert.strictEqual(typeof renderer.renderBottomResults, 'function');
  assert.strictEqual(typeof renderer.renderBangResults, 'function');
  assert.strictEqual(typeof renderer.clearSuggestions, 'function');
  assert.strictEqual(typeof renderer.clearAll, 'function');
  assert.strictEqual(typeof renderer.hydrateFavicons, 'function');
  assert.strictEqual(typeof renderer.updatePanelVisibility, 'function');
});

// 2. Calculator Element Generation
test('search-results-renderer: createCalculatorItem generates calculator DOM with correct copy attributes', () => {
  const { renderer } = setupTestEnvironment();

  const item = renderer.createCalculatorItem({ value: '42', query: '6 * 7' });
  assert.ok(item, 'Calculator element should be returned');
  assert.ok(item.classList.contains('result-item'), 'Should contain result-item class');
  assert.ok(item.classList.contains('calc-item'), 'Should contain calc-item class');
  assert.strictEqual(item.dataset.copy, '42', 'Dataset copy should match calculation value');

  const copyBtn = item.querySelector('.calc-copy');
  assert.ok(copyBtn, 'Copy button should exist');
  assert.strictEqual(copyBtn.dataset.copy, '42');
  assert.strictEqual(copyBtn.textContent, 'Copy');

  const answer = item.querySelector('.calc-answer');
  assert.strictEqual(answer.textContent, '42');
  const expr = item.querySelector('.calc-expression');
  assert.strictEqual(expr.textContent, '6 * 7');
});

// 3. Bookmark Element Generation
test('search-results-renderer: createBookmarkItem generates bookmark row with favicon and url', () => {
  const { renderer } = setupTestEnvironment();

  const item = renderer.createBookmarkItem({
    title: 'GitHub Homebase',
    url: 'https://github.com/time2shine/Homebase'
  });

  assert.ok(item, 'Bookmark row should be created');
  assert.strictEqual(item.tagName, 'BUTTON');
  assert.ok(item.classList.contains('result-item'));
  assert.strictEqual(item.dataset.url, 'https://github.com/time2shine/Homebase');

  const favicon = item.querySelector('.result-favicon');
  assert.ok(favicon);
  assert.strictEqual(favicon.dataset.faviconRawUrl, 'https://github.com/time2shine/Homebase');

  const label = item.querySelector('.result-label');
  assert.strictEqual(label.textContent, 'GitHub Homebase');
});

// 4. Suggestion and Direct Query Generation
test('search-results-renderer: creates suggestion and direct query items with engine URL format', () => {
  const { renderer, createdSvgIcons } = setupTestEnvironment();
  const engine = { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' };

  const directItem = renderer.createDirectQueryItem(engine, 'weather forecast');
  assert.ok(directItem);
  assert.ok(directItem.classList.contains('result-item-suggestion'));
  assert.strictEqual(directItem.dataset.url, 'https://duckduckgo.com/?q=weather%20forecast');
  assert.strictEqual(directItem.querySelector('.result-label').textContent, 'weather forecast');

  const sugItem = renderer.createSuggestionItem(engine, 'weather today');
  assert.ok(sugItem);
  assert.ok(sugItem.classList.contains('result-item-suggestion'));
  assert.strictEqual(sugItem.dataset.url, 'https://duckduckgo.com/?q=weather%20today');
  assert.strictEqual(sugItem.querySelector('.result-label').textContent, 'weather today');
  assert.ok(createdSvgIcons.includes('search'), 'SVG icon search should be requested');
});

// 5. Bang Rendering
test('search-results-renderer: createBangItem and renderBangResults handle active bangs and empty state', () => {
  const { renderer, doc } = setupTestEnvironment();

  const bangRow = renderer.createBangItem({
    bang: 'w',
    engine: { name: 'Wikipedia', symbolId: 'wikipedia' }
  });
  assert.ok(bangRow);
  assert.strictEqual(bangRow.dataset.bangInsert, '!w ');
  assert.strictEqual(bangRow.querySelector('.bang-badge').textContent, '!w');
  assert.strictEqual(bangRow.querySelector('.result-label').textContent, 'Wikipedia');

  const emptyBang = renderer.createBangEmptyItem();
  assert.ok(emptyBang);
  assert.ok(emptyBang.textContent.includes('No matching bangs'));

  // Test renderBangResults into container
  const container = doc.createElement('div');
  renderer.renderBangResults(container, [
    { bang: 'g', engine: { name: 'Google', symbolId: 'google' } }
  ]);
  assert.strictEqual(container.children.length, 2, 'Should mount header and 1 bang item');
  assert.strictEqual(container.children[0].textContent, 'Bang Shortcuts');
  assert.strictEqual(container.children[1].dataset.bangInsert, '!g ');
});

// 6. Recent History Item Generation
test('search-results-renderer: createHistoryItem generates history row with historyClock icon', () => {
  const { renderer, createdSvgIcons } = setupTestEnvironment();

  const historyRow = renderer.createHistoryItem({
    url: 'https://news.ycombinator.com',
    title: 'Hacker News'
  });

  assert.ok(historyRow);
  assert.ok(historyRow.classList.contains('result-item-history'));
  assert.strictEqual(historyRow.dataset.url, 'https://news.ycombinator.com');
  assert.strictEqual(historyRow.querySelector('.result-label').textContent, 'Hacker News');
  assert.ok(createdSvgIcons.includes('historyClock'), 'historyClock icon should be requested');
});

// 7. Clear functions
test('search-results-renderer: clearSuggestions prunes only suggestion rows and clearAll empties containers', () => {
  const { renderer, doc } = setupTestEnvironment();

  const bottomContainer = doc.createElement('div');
  const histHeader = renderer.createSectionHeader('Recent History');
  const histItem = renderer.createHistoryItem({ url: 'https://test.com', title: 'Test' });
  const sugHeader = renderer.createSectionHeader('Google Search', { externalSuggestions: true });
  const sugItem = renderer.createSuggestionItem({ url: 'https://google.com?q=' }, 'query');

  bottomContainer.appendChild(histHeader);
  bottomContainer.appendChild(histItem);
  bottomContainer.appendChild(sugHeader);
  bottomContainer.appendChild(sugItem);

  assert.strictEqual(bottomContainer.children.length, 4);

  // Clear suggestions should keep history and remove only suggestions and their header
  renderer.clearSuggestions(bottomContainer);
  assert.strictEqual(bottomContainer.children.length, 2);
  assert.strictEqual(bottomContainer.children[0].textContent, 'Recent History');

  // Clear all
  const topContainer = doc.createElement('div');
  topContainer.appendChild(renderer.createSectionHeader('Bookmarks'));
  renderer.clearAll(topContainer, bottomContainer);
  assert.strictEqual(topContainer.children.length, 0);
  assert.strictEqual(bottomContainer.children.length, 0);
});

// 8. Panel Visibility Behavior
test('search-results-renderer: updatePanelVisibility toggles classes based on container child presence', () => {
  const { renderer, doc } = setupTestEnvironment();

  const panel = doc.createElement('div');
  panel.classList.add('hidden');
  const widget = doc.createElement('div');
  const topContainer = doc.createElement('div');
  const bottomContainer = doc.createElement('div');

  // Initially empty -> remains hidden
  const openEmpty = renderer.updatePanelVisibility({ panel, widget, topContainer, bottomContainer });
  assert.strictEqual(openEmpty, false);
  assert.ok(panel.classList.contains('hidden'));
  assert.ok(!widget.classList.contains('results-open'));

  // Add child to top container -> reveals panel
  topContainer.appendChild(renderer.createSectionHeader('Bookmarks'));
  const openWithTop = renderer.updatePanelVisibility({ panel, widget, topContainer, bottomContainer });
  assert.strictEqual(openWithTop, true);
  assert.ok(!panel.classList.contains('hidden'));
  assert.ok(widget.classList.contains('results-open'));

  // Empty container again -> closes panel
  topContainer.children.length = 0;
  topContainer.innerHTML = '';
  const openAfterClear = renderer.updatePanelVisibility({ panel, widget, topContainer, bottomContainer });
  assert.strictEqual(openAfterClear, false);
  assert.ok(panel.classList.contains('hidden'));
  assert.ok(!widget.classList.contains('results-open'));
});

// 9. Mounting Reconciliation and Signature Caching
test('search-results-renderer: renderTopResults and renderBottomResults skip reflow when data unchanged', () => {
  const { renderer, doc } = setupTestEnvironment();

  const container = doc.createElement('div');
  const data = {
    calc: { value: '100', query: '10 * 10' },
    bookmarks: [{ title: 'Home', url: 'https://home.local' }],
    query: '10'
  };

  const firstRender = renderer.renderTopResults(container, data);
  assert.strictEqual(firstRender.mounted, true);
  assert.strictEqual(firstRender.unchanged, false);

  const secondRender = renderer.renderTopResults(container, data);
  assert.strictEqual(secondRender.mounted, false);
  assert.strictEqual(secondRender.unchanged, true);
});

test('search-results-renderer: hydrateFavicons hides images for local/private bookmark URLs without resolution', () => {
  const { renderer, doc, sandbox } = setupTestEnvironment();

  let resolveCalls = 0;
  sandbox.resolveFaviconForImageTarget = () => {
    resolveCalls += 1;
  };
  sandbox.isLocalOrPrivateHost = (rawUrl) => {
    return rawUrl.includes('192.168.') || rawUrl.includes('localhost');
  };

  const container = doc.createElement('div');
  const bookmarkItem = renderer.createBookmarkItem({
    title: '192',
    url: 'http://192.168.0.160:1111/'
  });
  container.appendChild(bookmarkItem);

  const faviconImg = bookmarkItem.querySelector('.result-favicon');
  assert.ok(faviconImg);
  assert.equal(faviconImg.dataset.faviconRawUrl, 'http://192.168.0.160:1111/');

  renderer.hydrateFavicons(container);

  // For private IP, hideImg() was called: style.display is 'none'
  assert.equal(faviconImg.style.display, 'none');
  // External resolution was never called
  assert.equal(resolveCalls, 0);
});

