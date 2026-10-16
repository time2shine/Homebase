import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const utilsCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/utils.js'), 'utf8');
const treeServiceCode = fs.readFileSync(path.join(rootDir, 'src/newtab/bookmarks/bookmark-tree-service.js'), 'utf8');
const gridControllerCode = fs.readFileSync(path.join(rootDir, 'src/newtab/bookmarks/bookmark-grid-controller.js'), 'utf8');
const contextMenuControllerCode = fs.readFileSync(path.join(rootDir, 'src/newtab/core/context-menu-controller.js'), 'utf8');
const editorAdapterCode = fs.readFileSync(path.join(rootDir, 'src/newtab/bookmarks/bookmark-editor-adapter.js'), 'utf8');

function createTestEnvironment() {
  const elementsById = new Map();
  const updatesCalled = [];
  const windowListeners = [];

  class MockElement {
    constructor(tagName = 'DIV', id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.classList = {
        _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
        contains: (cls) => this.classList._classes.has(cls),
        add: (cls) => this.classList._classes.add(cls),
        remove: (cls) => this.classList._classes.delete(cls),
        toggle: (cls, force) => {
          if (force !== undefined) {
            if (force) this.classList._classes.add(cls);
            else this.classList._classes.delete(cls);
            return force;
          }
          if (this.classList._classes.has(cls)) {
            this.classList._classes.delete(cls);
            return false;
          }
          this.classList._classes.add(cls);
          return true;
        }
      };
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.parentNode = null;
      this.style = {};
      this.value = '';
      this.textContent = '';
      this.scrollHeight = 20;
      this.offsetHeight = 20;
      this._eventListeners = {};
    }

    get className() {
      return Array.from(this.classList._classes).join(' ');
    }
    set className(val) {
      this.classList._classes = new Set(val ? val.split(/\s+/).filter(Boolean) : []);
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

    querySelector(selector) {
      if (selector === 'span') {
        return this.children.find(c => c.tagName === 'SPAN') || null;
      }
      if (selector === '.bookmark-icon-wrapper') {
        return this.children.find(c => c.classList.contains('bookmark-icon-wrapper')) || null;
      }
      return null;
    }

    querySelectorAll() {
      return [];
    }

    appendChild(child) {
      child.parentElement = this;
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    insertBefore(newNode, refNode) {
      const idx = this.children.indexOf(refNode);
      newNode.parentElement = this;
      newNode.parentNode = this;
      if (idx !== -1) {
        this.children.splice(idx, 0, newNode);
      } else {
        this.children.push(newNode);
      }
      return newNode;
    }

    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) {
          this.parentElement.children.splice(idx, 1);
        }
        this.parentElement = null;
        this.parentNode = null;
      }
    }

    focus() { }
    select() { }
  }

  const gridEl = new MockElement('div', 'bookmarks-grid', 'bookmarks-grid');
  elementsById.set('bookmarks-grid', gridEl);

  const editFolderModal = new MockElement('div', 'edit-folder-modal', 'modal-overlay hidden');
  const editFolderNameInput = new MockElement('input', 'edit-folder-name-input', 'dialog-input');
  const editFolderSaveBtn = new MockElement('button', 'edit-folder-save-btn', 'dialog-btn primary-btn');
  const editFolderCancelBtn = new MockElement('button', 'edit-folder-cancel-btn', 'dialog-btn');
  const editFolderCloseBtn = new MockElement('button', 'edit-folder-close-btn', 'dialog-close-btn');

  elementsById.set('edit-folder-modal', editFolderModal);
  elementsById.set('edit-folder-name-input', editFolderNameInput);
  elementsById.set('edit-folder-save-btn', editFolderSaveBtn);
  elementsById.set('edit-folder-cancel-btn', editFolderCancelBtn);
  elementsById.set('edit-folder-close-btn', editFolderCloseBtn);

  const bookmarkTree = [
    {
      id: 'root-1',
      title: 'Root',
      children: [
        { id: 'bm-1', title: 'Homebase Docs', url: 'https://docs.homebase.local', parentId: 'root-1' },
        { id: 'folder-1', title: 'Work', children: [], parentId: 'root-1' }
      ]
    }
  ];

  const browserMock = {
    bookmarks: {
      update: async (id, changes) => {
        updatesCalled.push({ id, changes });
        return { id, ...changes };
      },
      getTree: async () => bookmarkTree
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => ({})
      }
    }
  };

  const headEl = new MockElement('head');
  const bodyEl = new MockElement('body');

  const documentMock = {
    head: headEl,
    body: bodyEl,
    documentElement: { clientWidth: 1200, clientHeight: 800 },
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    querySelector: (selector) => {
      const match = selector.match(/\[data-bookmark-id="([^"]+)"\]/);
      if (match) {
        return elementsById.get(`item-${match[1]}`) || null;
      }
      const tabMatch = selector.match(/\[data-folder-id="([^"]+)"\]/);
      if (tabMatch) {
        return elementsById.get(`tab-${tabMatch[1]}`) || null;
      }
      return elementsById.get(selector) || null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.context-menu:not(.hidden)') {
        return [];
      }
      return [];
    },
    addEventListener: () => { },
    removeEventListener: () => { }
  };

  const sandbox = {
    console,
    window: null,
    document: documentMock,
    browser: browserMock,
    chrome: browserMock,
    bookmarkTree,
    innerWidth: 1200,
    innerHeight: 800,
    getComputedStyle: () => ({ display: 'flex' }),
    requestAnimationFrame: (cb) => { cb(); return 1; },
    setTimeout: (cb) => { cb(); return 1; },
    clearTimeout: () => { },
    setInterval: () => 1,
    clearInterval: () => { }
  };

  sandbox.window = sandbox;
  sandbox.window.addEventListener = (type, handler) => {
    windowListeners.push({ type, handler });
  };
  sandbox.window.removeEventListener = () => { };

  const context = vm.createContext(sandbox);
  vm.runInContext(utilsCode, context);
  vm.runInContext(treeServiceCode, context);
  vm.runInContext(gridControllerCode, context);
  vm.runInContext(contextMenuControllerCode, context);

  function createRenderedGridItem(node, isFolder = false) {
    const item = new MockElement('div', `item-${node.id}`, 'bookmark-item');
    item.dataset.bookmarkId = node.id;
    item.dataset.isFolder = isFolder ? 'true' : 'false';

    const span = new MockElement('span');
    span.textContent = node.title;
    item.appendChild(span);

    elementsById.set(`item-${node.id}`, item);
    gridEl.appendChild(item);
    return item;
  }

  function createRenderedFolderTab(node) {
    const tab = new MockElement('button', `tab-${node.id}`, 'bookmark-folder-tab');
    tab.dataset.folderId = node.id;
    tab.textContent = node.title;
    elementsById.set(`tab-${node.id}`, tab);
    return tab;
  }

  return {
    context,
    sandbox,
    elementsById,
    updatesCalled,
    bookmarkTree,
    gridEl,
    createRenderedGridItem,
    createRenderedFolderTab,
    MockElement
  };
}

test('Bookmark Grid Rename - Rename bookmark opens editable input and shows current title', async () => {
  const env = createTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const gridCtrl = env.sandbox.window.HomebaseBookmarkGridController;

  const bookmarkNode = env.bookmarkTree[0].children[0];
  const itemEl = env.createRenderedGridItem(bookmarkNode, false);

  ctrl.initialize({
    getBookmarkTree: () => env.sandbox.window.HomebaseBookmarkTreeService.getTree(),
    findBookmarkNodeById: (root, id) => env.sandbox.window.findBookmarkNodeById(root, id),
    showGridItemRenameInput: (item, node) => gridCtrl.showGridItemRenameInput(item, node)
  });

  ctrl.setContextData({ itemId: bookmarkNode.id, isFolder: false, sourceTile: itemEl });
  await ctrl.handleAction('rename');

  assert.equal(itemEl.classList.contains('is-renaming'), true, 'Grid item has is-renaming class');
  const inputEl = itemEl.children.find(c => c.classList.contains('grid-item-rename-input'));
  assert.ok(inputEl, 'Rename input was created and appended');
  assert.equal(inputEl.value, 'Homebase Docs', 'Input is populated with bookmark title');
});

test('Bookmark Grid Rename - Rename folder opens editable input and shows current folder title', async () => {
  const env = createTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const gridCtrl = env.sandbox.window.HomebaseBookmarkGridController;

  const folderNode = env.bookmarkTree[0].children[1];
  const folderItemEl = env.createRenderedGridItem(folderNode, true);

  ctrl.initialize({
    getBookmarkTree: () => env.sandbox.window.HomebaseBookmarkTreeService.getTree(),
    findBookmarkNodeById: (root, id) => env.sandbox.window.findBookmarkNodeById(root, id),
    showGridItemRenameInput: (item, node) => gridCtrl.showGridItemRenameInput(item, node)
  });

  ctrl.setContextData({ itemId: folderNode.id, isFolder: true, sourceTile: folderItemEl });
  await ctrl.handleAction('rename');

  assert.equal(folderItemEl.classList.contains('is-renaming'), true, 'Folder item has is-renaming class');
  const inputEl = folderItemEl.children.find(c => c.classList.contains('grid-item-rename-input'));
  assert.ok(inputEl, 'Rename input was created for folder');
  assert.equal(inputEl.value, 'Work', 'Input is populated with folder title');
});

test('Bookmark Grid Rename - Cancel does not save changes', async () => {
  const env = createTestEnvironment();
  const gridCtrl = env.sandbox.window.HomebaseBookmarkGridController;

  const folderNode = env.bookmarkTree[0].children[1];
  const folderItemEl = env.createRenderedGridItem(folderNode, true);

  gridCtrl.showGridItemRenameInput(folderItemEl, folderNode);

  const inputEl = folderItemEl.children.find(c => c.classList.contains('grid-item-rename-input'));
  assert.ok(inputEl, 'Input exists');

  inputEl.value = 'Cancelled Folder Name';

  // Trigger Escape
  inputEl.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => { } });

  assert.equal(env.updatesCalled.length, 0, 'No updates sent to browser.bookmarks.update');
  assert.equal(folderNode.title, 'Work', 'Original folder title remains unchanged');
  assert.equal(folderItemEl.classList.contains('is-renaming'), false, 'is-renaming class removed');
  assert.equal(folderItemEl.children.some(c => c.classList.contains('grid-item-rename-input')), false, 'Input removed');
});

test('Bookmark Grid Rename - Save updates title using browser.bookmarks.update()', async () => {
  const env = createTestEnvironment();
  const gridCtrl = env.sandbox.window.HomebaseBookmarkGridController;

  const folderNode = env.bookmarkTree[0].children[1];
  const folderItemEl = env.createRenderedGridItem(folderNode, true);
  const folderTab = env.createRenderedFolderTab(folderNode);

  gridCtrl.showGridItemRenameInput(folderItemEl, folderNode);

  const inputEl = folderItemEl.children.find(c => c.classList.contains('grid-item-rename-input'));
  assert.ok(inputEl, 'Input exists');

  inputEl.value = 'Engineering';

  // Trigger Enter
  inputEl.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, preventDefault: () => { } });

  // Wait for promise resolution
  await new Promise(r => setImmediate(r));

  assert.equal(env.updatesCalled.length, 1, 'browser.bookmarks.update was called once');
  assert.equal(env.updatesCalled[0].id, folderNode.id);
  assert.equal(env.updatesCalled[0].changes.title, 'Engineering');
  assert.equal(folderNode.title, 'Engineering', 'In-memory folder title updated');
  assert.equal(folderTab.textContent, 'Engineering', 'Matching folder tab title updated');
});

test('Bookmark Editor Adapter - showEditFolderModal opens folder dialog with folder id or node', async () => {
  const env = createTestEnvironment();
  const context = env.context;

  vm.runInContext(editorAdapterCode, context);

  let openedOptions = null;
  context.HomebaseBookmarkEditor = {
    openAddBookmark: async () => true,
    openEditFolder: async (opts) => {
      openedOptions = opts;
      return true;
    }
  };

  await context.showEditFolderModal('folder-1');
  assert.ok(openedOptions, 'openEditFolder called when passed string ID');
  assert.equal(openedOptions.folderId, 'folder-1');

  openedOptions = null;
  const folderNode = { id: 'folder-1', title: 'Work' };
  await context.showEditFolderModal(folderNode);
  assert.ok(openedOptions, 'openEditFolder called when passed node object');
  assert.equal(openedOptions.folderNode.title, 'Work');
  assert.equal(openedOptions.folderId, 'folder-1');
});
