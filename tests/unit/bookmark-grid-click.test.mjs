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
      this._attributes = new Map();
      this.blurCalled = false;
      this.textContent = '';
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

    setAttribute(name, val) {
      this._attributes.set(name, String(val));
    }

    getAttribute(name) {
      return this._attributes.get(name) || null;
    }

    blur() {
      this.blurCalled = true;
      if (sandbox && sandbox.document && sandbox.document.activeElement === this) {
        sandbox.document.activeElement = null;
      }
    }

    querySelector(selector) {
      if (selector === 'span') {
        return this.children.find(c => c.tagName === 'SPAN') || null;
      }
      if (selector === '.bookmark-icon-wrapper') {
        return this.children.find(c => c.classList.contains('bookmark-icon-wrapper')) || null;
      }
      if (selector === '.grid-item-rename-input') {
        return this.children.find(c => c.classList.contains('grid-item-rename-input')) || null;
      }
      return null;
    }

    querySelectorAll(selector) {
      return [];
    }

    replaceChildren(...nodes) {
      this.children = [...nodes];
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
      activeElement: null,
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

test('HomebaseBookmarkGridController exports setupGridClickDelegation, setupGridKeydownDelegation, handleGridClick, and handleGridKeydown', () => {
  const { sandbox } = createGridTestEnvironment();

  assert.ok(sandbox.window.HomebaseBookmarkGridController, 'Controller should exist on window');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.setupGridKeydownDelegation, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.handleGridClick, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkGridController.handleGridKeydown, 'function');
  assert.equal(typeof sandbox.window.setupGridClickDelegation, 'function');
  assert.equal(typeof sandbox.window.setupGridKeydownDelegation, 'function');
  assert.equal(typeof sandbox.window.handleGridClick, 'function');
  assert.equal(typeof sandbox.window.handleGridKeydown, 'function');
});

test('setupGridClickDelegation attaches click and keydown listeners idempotently', () => {
  const { sandbox, gridEl } = createGridTestEnvironment();

  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);
  assert.equal(gridEl._hasGridClickDelegation, true);
  assert.equal(gridEl._hasGridKeydownDelegation, true);
  assert.equal(gridEl._eventListeners['click']?.length, 1);
  assert.equal(gridEl._eventListeners['keydown']?.length, 1);

  // Calling again should not add duplicate listeners
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);
  assert.equal(gridEl._eventListeners['click']?.length, 1);
  assert.equal(gridEl._eventListeners['keydown']?.length, 1);
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

test('renderBookmark, renderBookmarkFolder, and createBackButton set proper roles, tabindex, and aria-label', () => {
  const { sandbox } = createGridTestEnvironment();

  const bmNode = { id: 'bm-1', title: 'Google Search', url: 'https://google.com' };
  const folderNode = { id: 'f-1', title: 'Work Tools', children: [] };

  const bmEl = sandbox.window.renderBookmark(bmNode);
  assert.equal(bmEl.getAttribute('role'), 'link');
  assert.equal(bmEl.getAttribute('tabindex'), '0');
  assert.equal(bmEl.getAttribute('aria-label'), 'Google Search');

  const folderEl = sandbox.window.renderBookmarkFolder(folderNode);
  assert.equal(folderEl.getAttribute('role'), 'button');
  assert.equal(folderEl.getAttribute('tabindex'), '0');
  assert.equal(folderEl.getAttribute('aria-label'), 'Work Tools');

  const backEl = sandbox.window.createBackButton('root-1');
  assert.equal(backEl.getAttribute('role'), 'button');
  assert.equal(backEl.getAttribute('tabindex'), '0');
  assert.equal(backEl.getAttribute('aria-label'), 'Back');
});

test('handleGridKeydown activates bookmark on Enter and calls preventDefault', () => {
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
  item.dataset.isFolder = 'false';
  gridEl.appendChild(item);

  let defaultPrevented = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: item,
    preventDefault: () => { defaultPrevented = true; }
  });

  assert.equal(defaultPrevented, true, 'Enter should prevent default on bookmark');
  assert.equal(locationTarget, 'https://google.com');
  assert.equal(item.classList.contains('is-loading'), true);
});

test('handleGridKeydown does not activate bookmark on Space (link semantics)', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let locationTarget = null;
  sandbox.window.location = {
    set href(val) { locationTarget = val; },
    get href() { return locationTarget; }
  };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  item.dataset.isFolder = 'false';
  gridEl.appendChild(item);

  let defaultPrevented = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: ' ',
    target: item,
    preventDefault: () => { defaultPrevented = true; }
  });

  assert.equal(defaultPrevented, false, 'Space should not prevent default on link');
  assert.equal(locationTarget, null, 'Space should not launch bookmark URL');
  assert.equal(item.classList.contains('is-loading'), false);
});

test('handleGridKeydown activates folder on Enter and Space, preventing default', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderedTarget = null;
  sandbox.window.renderBookmarkGrid = (node) => { renderedTarget = node; };

  const folderItem = new MockElement('div', '', 'bookmark-item');
  folderItem.dataset.bookmarkId = 'f-1';
  folderItem.dataset.isFolder = 'true';
  gridEl.appendChild(folderItem);

  // Case 1: Enter on folder
  let defaultPreventedEnter = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: folderItem,
    preventDefault: () => { defaultPreventedEnter = true; }
  });
  assert.equal(defaultPreventedEnter, true);
  assert.equal(renderedTarget?.id, 'f-1');

  // Reset
  renderedTarget = null;

  // Case 2: Space on folder
  let defaultPreventedSpace = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: ' ',
    target: folderItem,
    preventDefault: () => { defaultPreventedSpace = true; }
  });
  assert.equal(defaultPreventedSpace, true);
  assert.equal(renderedTarget?.id, 'f-1');
});

test('handleGridKeydown activates back button on Enter and Space, preventing default', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderedTarget = null;
  sandbox.window.renderBookmarkGrid = (node) => { renderedTarget = node; };

  const backBtn = new MockElement('a', '', 'bookmark-item back-button');
  backBtn.dataset.backTargetId = 'root-1';
  gridEl.appendChild(backBtn);

  // Case 1: Enter on back button
  let defaultPreventedEnter = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: backBtn,
    preventDefault: () => { defaultPreventedEnter = true; }
  });
  assert.equal(defaultPreventedEnter, true);
  assert.equal(renderedTarget?.id, 'root-1');

  // Reset
  renderedTarget = null;

  // Case 2: Space on back button
  let defaultPreventedSpace = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: ' ',
    target: backBtn,
    preventDefault: () => { defaultPreventedSpace = true; }
  });
  assert.equal(defaultPreventedSpace, true);
  assert.equal(renderedTarget?.id, 'root-1');
});

test('handleGridKeydown ignores keypresses on or inside rename input, and when tile is renaming', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let locationTarget = null;
  sandbox.window.location = {
    set href(val) { locationTarget = val; },
    get href() { return locationTarget; }
  };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  const renameInput = new MockElement('textarea', '', 'grid-item-rename-input');
  item.appendChild(renameInput);
  gridEl.appendChild(item);

  // Case 1: Key event targeted directly at rename input
  let defaultPrevented = false;
  gridEl.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: renameInput,
    preventDefault: () => { defaultPrevented = true; }
  });
  assert.equal(defaultPrevented, false, 'Should not intercept Enter on rename input');
  assert.equal(locationTarget, null, 'Should not navigate on rename input Enter');

  // Case 2: Tile has is-renaming class
  item.classList.add('is-renaming');
  gridEl.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: item,
    preventDefault: () => { defaultPrevented = true; }
  });
  assert.equal(defaultPrevented, false, 'Should not intercept Enter when tile is-renaming');
  assert.equal(locationTarget, null);
});

test('handleGridKeydown ignores activation when dragging or sortable-chosen', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let locationTarget = null;
  sandbox.window.location = {
    set href(val) { locationTarget = val; },
    get href() { return locationTarget; }
  };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  gridEl.appendChild(item);

  // Case 1: isGridDragging = true
  sandbox.window.isGridDragging = true;
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', target: item, preventDefault: () => {} });
  assert.equal(locationTarget, null);

  // Case 2: sortable-chosen
  sandbox.window.isGridDragging = false;
  item.classList.add('sortable-chosen');
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', target: item, preventDefault: () => {} });
  assert.equal(locationTarget, null);
});

test('updateElementData updates roles, labels, and blurs focused element when recycled to a different node', () => {
  const { sandbox, MockElement } = createGridTestEnvironment();

  const el = new MockElement('div', '', 'bookmark-item');
  el.dataset.bookmarkId = 'old-bm';
  el.dataset.recyclingType = 'bookmark';
  const span = new MockElement('span');
  span.textContent = 'Old Bookmark';
  el.appendChild(span);

  // Set focus to this element
  sandbox.document.activeElement = el;

  const newNode = {
    id: 'new-folder',
    title: 'New Folder',
    children: []
  };

  sandbox.window.updateElementData(el, newNode);

  assert.equal(el.blurCalled, true, 'Focused element should be blurred when recycled to a new ID');
  assert.equal(sandbox.document.activeElement, null);
  assert.equal(el.getAttribute('role'), 'button');
  assert.equal(el.getAttribute('tabindex'), '0');
  assert.equal(el.getAttribute('aria-label'), 'New Folder');
  assert.equal(span.textContent, 'New Folder');
});

test('updateElementData does not blur focused element when patched for the same node', () => {
  const { sandbox, MockElement } = createGridTestEnvironment();

  const el = new MockElement('div', '', 'bookmark-item');
  el.dataset.bookmarkId = 'same-bm';
  el.dataset.recyclingType = 'bookmark';
  const span = new MockElement('span');
  span.textContent = 'Bookmark';
  el.appendChild(span);

  // Set focus to this element
  sandbox.document.activeElement = el;

  const sameNode = {
    id: 'same-bm',
    title: 'Updated Title',
    url: 'https://example.com'
  };

  sandbox.window.updateElementData(el, sameNode);

  assert.equal(el.blurCalled, false, 'Focused element should not be blurred when updating same ID');
  assert.equal(sandbox.document.activeElement, el);
  assert.equal(el.getAttribute('role'), 'link');
  assert.equal(el.getAttribute('tabindex'), '0');
  assert.equal(el.getAttribute('aria-label'), 'Updated Title');
  assert.equal(span.textContent, 'Updated Title');
});

test('isNestedInteractiveOrEditable identifies inputs, textareas, buttons, links, contenteditable, and custom roles', () => {
  const { sandbox, MockElement } = createGridTestEnvironment();
  const isNested = sandbox.window.HomebaseBookmarkGridController.isNestedInteractiveOrEditable;

  const item = new MockElement('div', '', 'bookmark-item');
  const span = new MockElement('span');
  item.appendChild(span);

  assert.equal(isNested(item, item), false, 'Tile itself is not nested interactive');
  assert.equal(isNested(span, item), false, 'Normal text span is not nested interactive');

  const btn = new MockElement('button');
  item.appendChild(btn);
  assert.equal(isNested(btn, item), true, 'Button is nested interactive');

  const btnIcon = new MockElement('i');
  btn.appendChild(btnIcon);
  assert.equal(isNested(btnIcon, item), true, 'Child inside button is nested interactive');

  const input = new MockElement('input');
  item.appendChild(input);
  assert.equal(isNested(input, item), true, 'Input is nested interactive');

  const textarea = new MockElement('textarea');
  item.appendChild(textarea);
  assert.equal(isNested(textarea, item), true, 'Textarea is nested interactive');

  const link = new MockElement('a');
  item.appendChild(link);
  assert.equal(isNested(link, item), true, 'Link is nested interactive');

  const roleBtn = new MockElement('div');
  roleBtn.setAttribute('role', 'button');
  item.appendChild(roleBtn);
  assert.equal(isNested(roleBtn, item), true, 'role="button" is nested interactive');

  const editable = new MockElement('div');
  editable.setAttribute('contenteditable', 'true');
  item.appendChild(editable);
  assert.equal(isNested(editable, item), true, 'contenteditable is nested interactive');
});

test('handleGridKeydown: holding Enter does not repeatedly launch a bookmark (e.repeat = true)', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let launchCount = 0;
  let locationTarget = null;
  sandbox.window.location = {
    set href(val) {
      launchCount++;
      locationTarget = val;
    },
    get href() { return locationTarget; }
  };

  const item = new MockElement('div', '', 'bookmark-item');
  item.dataset.bookmarkId = 'bm-1';
  item.dataset.isFolder = 'false';
  gridEl.appendChild(item);

  let preventDefaultCount = 0;
  const preventDefault = () => { preventDefaultCount++; };

  // Initial press: repeat = false
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false, target: item, preventDefault });
  assert.equal(launchCount, 1, 'Initial Enter press should launch bookmark once');
  assert.equal(preventDefaultCount, 1, 'Initial Enter press should prevent default');
  assert.equal(locationTarget, 'https://google.com');

  // Held down keydown events: repeat = true
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: true, target: item, preventDefault });
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: true, target: item, preventDefault });
  assert.equal(launchCount, 1, 'Holding Enter should not repeatedly launch bookmark');
  assert.equal(preventDefaultCount, 3, 'Holding Enter should continue to prevent default on repeated keydowns');
});

test('handleGridKeydown: holding Space does not repeatedly navigate folders, and prevents scroll (e.repeat = true)', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let renderCount = 0;
  let renderedTarget = null;
  sandbox.window.renderBookmarkGrid = (node) => {
    renderCount++;
    renderedTarget = node;
  };

  const folderItem = new MockElement('div', '', 'bookmark-item');
  folderItem.dataset.bookmarkId = 'f-1';
  folderItem.dataset.isFolder = 'true';
  gridEl.appendChild(folderItem);

  let preventDefaultCount = 0;
  const preventDefault = () => { preventDefaultCount++; };

  // Initial press: repeat = false
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', repeat: false, target: folderItem, preventDefault });
  assert.equal(renderCount, 1, 'Initial Space press should navigate folder once');
  assert.equal(preventDefaultCount, 1, 'Initial Space press should prevent default scroll');
  assert.equal(renderedTarget?.id, 'f-1');

  // Held down keydown events: repeat = true
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', repeat: true, target: folderItem, preventDefault });
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', repeat: true, target: folderItem, preventDefault });
  assert.equal(renderCount, 1, 'Holding Space should not repeatedly navigate folder');
  assert.equal(preventDefaultCount, 3, 'Holding Space should continue to prevent default scroll on repeated keydowns');
});

test('handleGridKeydown: Enter/Space from nested controls does not activate the parent tile', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let launchCount = 0;
  let folderNavCount = 0;
  sandbox.window.location = {
    set href(val) { launchCount++; },
    get href() { return ''; }
  };
  sandbox.window.renderBookmarkGrid = () => { folderNavCount++; };

  // Tile 1: Bookmark with nested button and nested input
  const bmItem = new MockElement('div', '', 'bookmark-item');
  bmItem.dataset.bookmarkId = 'bm-1';
  bmItem.dataset.isFolder = 'false';

  const nestedButton = new MockElement('button', 'tile-action-btn');
  bmItem.appendChild(nestedButton);

  const nestedInput = new MockElement('input', 'tile-text-input');
  bmItem.appendChild(nestedInput);

  gridEl.appendChild(bmItem);

  // Tile 2: Folder with nested link and nested contenteditable element
  const folderItem = new MockElement('div', '', 'bookmark-item');
  folderItem.dataset.bookmarkId = 'f-1';
  folderItem.dataset.isFolder = 'true';

  const nestedLink = new MockElement('a', 'tile-link');
  folderItem.appendChild(nestedLink);

  const nestedEditable = new MockElement('div', 'tile-editable');
  nestedEditable.setAttribute('contenteditable', 'true');
  folderItem.appendChild(nestedEditable);

  gridEl.appendChild(folderItem);

  let preventDefaultCount = 0;
  const preventDefault = () => { preventDefaultCount++; };

  // Test 1: Enter on nested button inside bookmark
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', target: nestedButton, preventDefault });
  assert.equal(launchCount, 0, 'Enter on nested button must not launch bookmark');
  assert.equal(preventDefaultCount, 0, 'Enter on nested button must not prevent default');

  // Test 2: Space on nested button inside bookmark
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', target: nestedButton, preventDefault });
  assert.equal(launchCount, 0, 'Space on nested button must not launch bookmark');
  assert.equal(preventDefaultCount, 0, 'Space on nested button must not prevent default');

  // Test 3: Space on nested input inside bookmark
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', target: nestedInput, preventDefault });
  assert.equal(launchCount, 0, 'Space on nested input must not launch bookmark');
  assert.equal(preventDefaultCount, 0, 'Space on nested input must not prevent default');

  // Test 4: Enter on nested input inside bookmark
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', target: nestedInput, preventDefault });
  assert.equal(launchCount, 0, 'Enter on nested input must not launch bookmark');
  assert.equal(preventDefaultCount, 0, 'Enter on nested input must not prevent default');

  // Test 5: Enter on nested link inside folder
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', target: nestedLink, preventDefault });
  assert.equal(folderNavCount, 0, 'Enter on nested link must not navigate folder');
  assert.equal(preventDefaultCount, 0, 'Enter on nested link must not prevent default');

  // Test 6: Space on nested contenteditable inside folder
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', target: nestedEditable, preventDefault });
  assert.equal(folderNavCount, 0, 'Space on nested contenteditable must not navigate folder');
  assert.equal(preventDefaultCount, 0, 'Space on nested contenteditable must not prevent default');
});

test('handleGridKeydown: a normal tile keypress still activates exactly once', () => {
  const { sandbox, gridEl, MockElement } = createGridTestEnvironment();
  sandbox.window.HomebaseBookmarkGridController.setupGridClickDelegation(gridEl);

  let launchCount = 0;
  let folderNavCount = 0;
  let backNavCount = 0;
  sandbox.window.location = {
    set href(val) { launchCount++; },
    get href() { return ''; }
  };
  sandbox.window.renderBookmarkGrid = (node) => {
    if (node?.id === 'f-1') folderNavCount++;
    if (node?.id === 'root-1') backNavCount++;
  };

  const bmItem = new MockElement('div', '', 'bookmark-item');
  bmItem.dataset.bookmarkId = 'bm-1';
  bmItem.dataset.isFolder = 'false';
  gridEl.appendChild(bmItem);

  const folderItem = new MockElement('div', '', 'bookmark-item');
  folderItem.dataset.bookmarkId = 'f-1';
  folderItem.dataset.isFolder = 'true';
  gridEl.appendChild(folderItem);

  const backBtn = new MockElement('a', '', 'bookmark-item back-button');
  backBtn.dataset.backTargetId = 'root-1';
  gridEl.appendChild(backBtn);

  // 1. Enter on bookmark activates once
  let bmPreventDefault = 0;
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false, target: bmItem, preventDefault: () => { bmPreventDefault++; } });
  assert.equal(launchCount, 1, 'Enter on bookmark activates exactly once');
  assert.equal(bmPreventDefault, 1);

  // 2. Space on folder activates once
  let folderSpacePreventDefault = 0;
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', repeat: false, target: folderItem, preventDefault: () => { folderSpacePreventDefault++; } });
  assert.equal(folderNavCount, 1, 'Space on folder activates exactly once');
  assert.equal(folderSpacePreventDefault, 1);

  // 3. Enter on folder activates once
  let folderEnterPreventDefault = 0;
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false, target: folderItem, preventDefault: () => { folderEnterPreventDefault++; } });
  assert.equal(folderNavCount, 2, 'Enter on folder activates exactly once');
  assert.equal(folderEnterPreventDefault, 1);

  // 4. Enter on back button activates once
  let backEnterPreventDefault = 0;
  gridEl.dispatchEvent({ type: 'keydown', key: 'Enter', repeat: false, target: backBtn, preventDefault: () => { backEnterPreventDefault++; } });
  assert.equal(backNavCount, 1, 'Enter on back button activates exactly once');
  assert.equal(backEnterPreventDefault, 1);

  // 5. Space on back button activates once
  let backSpacePreventDefault = 0;
  gridEl.dispatchEvent({ type: 'keydown', key: ' ', repeat: false, target: backBtn, preventDefault: () => { backSpacePreventDefault++; } });
  assert.equal(backNavCount, 2, 'Space on back button activates exactly once');
  assert.equal(backSpacePreventDefault, 1);
});

