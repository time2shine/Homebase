import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controllerScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-grid-controller.js');
const controllerScriptCode = fs.readFileSync(controllerScriptPath, 'utf8');

function createGridTestEnvironment(customMocks = {}) {
  const elements = new Map();
  const listeners = new Map();

  class MockElement {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.classList = {
        _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
        contains: (cls) => this.classList._classes.has(cls),
        add: (cls) => this.classList._classes.add(cls),
        remove: (cls) => this.classList._classes.delete(cls),
        toggle: (cls) => {
          if (this.classList._classes.has(cls)) {
            this.classList._classes.delete(cls);
            return false;
          } else {
            this.classList._classes.add(cls);
            return true;
          }
        }
      };
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.parentNode = null;
      this.style = {};
      this.clientWidth = 1200;
      this.clientHeight = 800;
      this.scrollTop = 0;
      this._eventListeners = {};
    }

    addEventListener(event, fn) {
      if (!this._eventListeners[event]) {
        this._eventListeners[event] = [];
      }
      this._eventListeners[event].push(fn);
    }

    removeEventListener(event, fn) {
      if (this._eventListeners[event]) {
        this._eventListeners[event] = this._eventListeners[event].filter(cb => cb !== fn);
      }
    }

    dispatchEvent(event) {
      const handlers = this._eventListeners[event.type] || [];
      for (const h of handlers) {
        h(event);
      }
    }

    closest(selector) {
      let curr = this;
      while (curr) {
        if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) {
          return curr;
        }
        if (selector.startsWith('#') && curr.id === selector.slice(1)) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    }

    appendChild(child) {
      child.parentElement = this;
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
  }

  const gridEl = new MockElement('div', 'bookmarksGrid', 'bookmarks-grid');
  const mainContentEl = new MockElement('div', 'mainContent', 'main-content');

  const sandbox = {
    console,
    window: null,
    document: {
      getElementById: (id) => {
        if (id === 'bookmarksGrid') return gridEl;
        if (id === 'mainContent') return mainContentEl;
        return null;
      },
      createElement: (tag) => new MockElement(tag)
    },
    performance: {
      now: () => 100
    },
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    setTimeout: (cb, ms) => {
      // Execute immediately in test for predictable assertions
      cb();
      return 1;
    },
    clearTimeout: () => {},
    isGridDragging: false,
    appBookmarkOpenNewTabPreference: false,
    bookmarkTree: customMocks.bookmarkTree || [
      {
        id: 'root-1',
        title: 'Homebase Root',
        children: [
          { id: 'bm-1', title: 'Google', url: 'https://google.com', parentId: 'root-1' },
          { id: 'f-1', title: 'Work', children: [], parentId: 'root-1' }
        ]
      }
    ],
    findBookmarkNodeById: (root, id) => {
      if (!root) return null;
      if (root.id === id) return root;
      if (Array.isArray(root.children)) {
        for (const child of root.children) {
          const found = sandbox.findBookmarkNodeById(child, id);
          if (found) return found;
        }
      }
      return null;
    },
    browser: customMocks.browser || {
      tabs: {
        create: (args) => {
          if (customMocks.onTabCreate) customMocks.onTabCreate(args);
        }
      }
    },
    location: {
      href: ''
    }
  };

  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(controllerScriptCode, context);

  return { context, sandbox, gridEl, MockElement };
}

test('HomebaseBookmarkGridController exports setupGridClickDelegation and handleGridClick', () => {
  const { sandbox } = createGridTestEnvironment();

  assert.ok(sandbox.window.HomebaseBookmarkGridController, 'Controller should exist on window');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.handleGridClick, 'function');
  assert.equal(typeof sandbox.window.setupGridClickDelegation, 'function');
  assert.equal(typeof sandbox.window.handleGridClick, 'function');
});

test('setupGridClickDelegation attaches click listener idempotently', () => {
  const { sandbox, gridEl } = createGridTestEnvironment();

  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);
  assert.equal(gridEl._hasGridClickDelegation, true);
  assert.equal(gridEl._eventListeners['click']?.length, 1);

  // Calling again should not add a second listener
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);
  assert.equal(gridEl._eventListeners['click']?.length, 1);
});

test('handleGridClick ignores clicks on or within rename input', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderCalled = false;
  sandbox.window.renderBookmarkGrid = () => { renderCalled = true; };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  const renameInput = new MockElement('input', '', 'grid-item-rename-input');
  item.appendChild(renameInput);
  gridEl.appendChild(item);

  const event = {
    type: 'click',
    target: renameInput,
    preventDefault: () => {}
  };

  gridEl.dispatchEvent(event);
  assert.equal(renderCalled, false, 'Should not proceed when clicking rename input');
});

test('handleGridClick ignores clicks when dragging or sortable-chosen', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let navigatedUrl = null;
  sandbox.window.location = {
    set href(val) { navigatedUrl = val; },
    get href() { return navigatedUrl; }
  };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  gridEl.appendChild(item);

  // Case 1: isGridDragging = true
  sandbox.window.isGridDragging = true;
  gridEl.dispatchEvent({ type: 'click', target: item, preventDefault: () => {} });
  assert.equal(navigatedUrl, null, 'Should ignore click when isGridDragging is true');

  // Case 2: sortable-chosen
  sandbox.window.isGridDragging = false;
  item.classList.add('sortable-chosen');
  gridEl.dispatchEvent({ type: 'click', target: item, preventDefault: () => {} });
  assert.equal(navigatedUrl, null, 'Should ignore click on sortable-chosen item');
});

test('handleGridClick handles back button navigation', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderedTarget = null;
  sandbox.window.renderBookmarkGrid = (node) => { renderedTarget = node; };

  const backBtn = new MockElement('div', '', 'bookmark-item back-button');
  backBtn.dataset.backTargetId = 'root-1';
  gridEl.appendChild(backBtn);

  let defaultPrevented = false;
  gridEl.dispatchEvent({
    type: 'click',
    target: backBtn,
    preventDefault: () => { defaultPrevented = true; }
  });

  assert.equal(defaultPrevented, true);
  assert.ok(renderedTarget, 'renderBookmarkGrid should have been called');
  assert.equal(renderedTarget.id, 'root-1');
});

test('handleGridClick handles folder tile navigation', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderedTarget = null;
  sandbox.window.renderBookmarkGrid = (node) => { renderedTarget = node; };

  const folderItem = new MockElement('div', '', 'bookmark-item');
  folderItem.dataset.bookmarkId = 'f-1';
  folderItem.dataset.isFolder = 'true';
  gridEl.appendChild(folderItem);

  let defaultPrevented = false;
  gridEl.dispatchEvent({
    type: 'click',
    target: folderItem,
    preventDefault: () => { defaultPrevented = true; }
  });

  assert.equal(defaultPrevented, true);
  assert.ok(renderedTarget, 'renderBookmarkGrid should navigate into folder');
  assert.equal(renderedTarget.id, 'f-1');
});

test('handleGridClick opens bookmark in same tab when openInNewTab is false', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let locationTarget = null;
  sandbox.window.location = {
    set href(val) { locationTarget = val; },
    get href() { return locationTarget; }
  };
  sandbox.window.appBookmarkOpenNewTabPreference = false;

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  gridEl.appendChild(item);

  gridEl.dispatchEvent({
    type: 'click',
    target: item,
    preventDefault: () => {}
  });

  assert.equal(locationTarget, 'https://google.com');
  assert.equal(item.classList.contains('is-loading'), true);
});

test('handleGridClick opens bookmark in new tab via browser.tabs.create when openInNewTab is true', () => {
  let createdTab = null;
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment({
    onTabCreate: (args) => { createdTab = args; }
  });
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  sandbox.window.appBookmarkOpenNewTabPreference = true;

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  gridEl.appendChild(item);

  gridEl.dispatchEvent({
    type: 'click',
    target: item,
    preventDefault: () => {}
  });

  assert.ok(createdTab, 'browser.tabs.create should be called');
  assert.equal(createdTab.url, 'https://google.com');
  assert.equal(createdTab.active, true);
});
