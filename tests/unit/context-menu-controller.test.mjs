import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const contextMenuControllerScriptPath = path.join(rootDir, 'src/newtab/core/context-menu-controller.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const contextMenuControllerScriptCode = fs.readFileSync(contextMenuControllerScriptPath, 'utf8');

function createContextMenuTestEnvironment(options = {}) {
  const elementsById = {};
  const windowListeners = [];
  const bodyChildren = [];

  const documentMock = {
    documentElement: {
      clientWidth: 1200,
      clientHeight: 800
    },
    body: {
      parentElement: null,
      appendChild: (el) => {
        el.parentElement = documentMock.body;
        bodyChildren.push(el);
      }
    },
    getElementById: (id) => elementsById[id] || null,
    querySelector: (selector) => {
      if (elementsById[selector]) return elementsById[selector];
      const match = selector.match(/\[data-bookmark-id="([^"]+)"\]/);
      if (match && elementsById[`item-${match[1]}`]) {
        return elementsById[`item-${match[1]}`];
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.context-menu:not(.hidden)') {
        return Object.values(elementsById).filter(el =>
          el.classList && el.classList.contains('context-menu') && !el.classList.contains('hidden')
        );
      }
      return [];
    }
  };

  const sandbox = {
    console,
    window: null,
    document: documentMock,
    innerWidth: 1200,
    innerHeight: 800,
    getComputedStyle: () => ({ display: 'flex' })
  };

  sandbox.window = sandbox;
  sandbox.window.addEventListener = (type, handler) => {
    windowListeners.push({ type, handler });
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(contextMenuControllerScriptCode, context);

  function createMockMenu(menuId, width = 160, height = 200) {
    const classSet = new Set(['context-menu', 'hidden']);
    const menuEl = {
      id: menuId,
      parentElement: null,
      style: { left: '0px', top: '0px', visibility: 'visible', display: 'none', pointerEvents: 'auto' },
      classList: {
        add: (cls) => classSet.add(cls),
        remove: (cls) => classSet.delete(cls),
        contains: (cls) => classSet.has(cls)
      },
      getBoundingClientRect: () => ({ width, height, left: 0, top: 0, right: width, bottom: height }),
      addEventListener: () => {}
    };

    elementsById[menuId] = menuEl;
    return menuEl;
  }

  function createMockGridItem(id, title = 'Item', isFolder = false) {
    const classSet = new Set(['bookmark-item']);
    const spanEl = {
      tagName: 'SPAN',
      textContent: title,
      style: { display: '-webkit-box' }
    };
    const itemEl = {
      tagName: 'DIV',
      dataset: { bookmarkId: id, isFolder: isFolder ? 'true' : 'false' },
      classList: {
        contains: (c) => classSet.has(c),
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c)
      },
      style: {},
      querySelector: (sel) => sel === 'span' ? spanEl : null,
      appendChild: () => {},
      closest: (sel) => sel === '.bookmark-item' ? itemEl : null
    };

    elementsById[`item-${id}`] = itemEl;
    return itemEl;
  }

  return {
    context,
    sandbox,
    elementsById,
    windowListeners,
    bodyChildren,
    createMockMenu,
    createMockGridItem
  };
}

test('Context Menu Controller - exports check', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;

  assert.ok(ctrl, 'HomebaseContextMenuController exists on window');
  assert.equal(typeof ctrl.initialize, 'function');
  assert.equal(typeof ctrl.show, 'function');
  assert.equal(typeof ctrl.hide, 'function');
  assert.equal(typeof ctrl.reposition, 'function');
  assert.equal(typeof ctrl.handleAction, 'function');
  assert.equal(typeof ctrl.ensureMenuMountedToBody, 'function');
  assert.equal(typeof ctrl.getContextData, 'function');
});

test('Context Menu Controller - reposition clamps within viewport boundaries', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('test-menu', 150, 200);

  // Position within boundaries
  const p1 = ctrl.reposition(menu, 100, 150, { margin: 10 });
  assert.equal(p1.left, 100);
  assert.equal(p1.top, 150);
  assert.equal(menu.style.left, '100px');
  assert.equal(menu.style.top, '150px');

  // Overflow on right and bottom: viewport is 1200x800, menu is 150x200, margin is 10
  // maxLeft = 1200 - 150 - 10 = 1040
  // maxTop = 800 - 200 - 10 = 590
  const p2 = ctrl.reposition(menu, 1180, 780, { margin: 10 });
  assert.equal(p2.left, 1040);
  assert.equal(p2.top, 590);
  assert.equal(menu.style.left, '1040px');
  assert.equal(menu.style.top, '590px');

  // Underflow on left/top: should clamp to margin
  const p3 = ctrl.reposition(menu, -50, -20, { margin: 10 });
  assert.equal(p3.left, 10);
  assert.equal(p3.top, 10);
});

test('Context Menu Controller - show and hide lifecycle', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');

  ctrl.show('bookmark-icon-menu', 200, 300, {
    itemId: 'bm-123',
    isFolder: false
  });

  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(ctrl.getActiveMenu().id, 'bookmark-icon-menu');
  assert.equal(ctrl.getContextData().itemId, 'bm-123');
  assert.equal(ctrl.getContextData().isFolder, false);

  ctrl.hide();

  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(ctrl.getActiveMenu(), null);
});

test('Context Menu Controller - handleAction dispatches to handler and closes menu', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');

  let executedPayload = null;
  ctrl.registerActionHandler('edit', (payload) => {
    executedPayload = payload;
    return true;
  });

  ctrl.show(menu, 100, 100, { itemId: 'bm-999', isFolder: false });
  assert.equal(menu.classList.contains('hidden'), false);

  const result = ctrl.handleAction('edit', { customProp: 'hello' });

  assert.equal(result, true);
  assert.ok(executedPayload);
  assert.equal(executedPayload.itemId, 'bm-999');
  assert.equal(executedPayload.customProp, 'hello');
  assert.equal(menu.classList.contains('hidden'), true, 'Menu dismissed after action');
});

test('Context Menu Controller - ensureMenuMountedToBody appends to body', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('floating-menu');

  assert.equal(menu.parentElement, null);
  ctrl.ensureMenuMountedToBody(menu);
  assert.equal(menu.parentElement, env.sandbox.document.body);
  assert.ok(env.bodyChildren.includes(menu));
});

test('Context Menu Controller - missing DOM safety', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;

  assert.doesNotThrow(() => {
    ctrl.show(null, 10, 10);
    ctrl.show('non-existent-menu', 10, 10);
    ctrl.reposition(null, 10, 10);
    ctrl.hide();
    ctrl.ensureMenuMountedToBody(null);
  });
});

test('Context Menu Controller - initialize binds window click and blur', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;

  ctrl.initialize();
  const clickListener = env.windowListeners.find(l => l.type === 'click');
  const blurListener = env.windowListeners.find(l => l.type === 'blur');

  assert.ok(clickListener, 'Window click listener attached');
  assert.ok(blurListener, 'Window blur listener attached');
});

test('Context Menu Controller - Escape key dismisses active menu', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');

  ctrl.initialize();
  const keydownListener = env.windowListeners.find(l => l.type === 'keydown');
  assert.ok(keydownListener, 'Window keydown listener attached');

  ctrl.show(menu, 100, 100, { itemId: 'bm-123' });
  assert.equal(menu.classList.contains('hidden'), false);
  assert.ok(ctrl.getActiveMenu());

  keydownListener.handler({ key: 'Escape' });
  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(ctrl.getActiveMenu(), null);
});

test('Context Menu Controller - default action routing to injected dependencies', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');

  const actionsCalled = {};
  ctrl.initialize({
    openFolderFromContext: (id) => { actionsCalled.open = id; },
    openFolderAll: (id) => { actionsCalled.openAll = id; },
    deleteBookmarkOrFolder: (id, isFolder, tile) => { actionsCalled.delete = { id, isFolder, tile }; },
    openMoveBookmarkModal: (id, isFolder) => { actionsCalled.move = { id, isFolder }; },
    openBookmarkInNewTab: (id) => { actionsCalled.openTab = id; },
    showAddBookmarkModal: () => { actionsCalled.addBookmark = true; },
    showAddFolderModal: () => { actionsCalled.addFolder = true; },
    handlePasteBookmark: () => { actionsCalled.paste = true; },
    sortCurrentFolderByName: () => { actionsCalled.sortName = true; }
  });

  ctrl.show(menu, 50, 50, { itemId: 'folder-1', isFolder: true });

  ctrl.handleAction('open');
  assert.equal(actionsCalled.open, 'folder-1');

  ctrl.show(menu, 50, 50, { itemId: 'folder-2', isFolder: true });
  ctrl.handleAction('delete');
  assert.equal(actionsCalled.delete.id, 'folder-2');
  assert.equal(actionsCalled.delete.isFolder, true);

  ctrl.handleAction('bookmark');
  assert.equal(actionsCalled.addBookmark, true);

  ctrl.handleAction('folder');
  assert.equal(actionsCalled.addFolder, true);

  ctrl.handleAction('paste');
  assert.equal(actionsCalled.paste, true);

  ctrl.handleAction('sort-name');
  assert.equal(actionsCalled.sortName, true);
});

test('Context Menu Controller - onContextChanged callback fires on show', () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');

  let contextUpdate = null;
  ctrl.initialize({
    onContextChanged: (data) => {
      contextUpdate = data;
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'bm-555', isFolder: false });
  assert.ok(contextUpdate);
  assert.equal(contextUpdate.itemId, 'bm-555');
  assert.equal(contextUpdate.isFolder, false);
});

test('Context Menu Controller - Rename bookmark works and passes gridItem and node', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');
  const mockItem = env.createMockGridItem('bm-101', 'GitHub', false);

  const mockBookmark = { id: 'bm-101', title: 'GitHub', url: 'https://github.com' };
  const mockTree = [{ id: 'root', children: [mockBookmark] }];

  let renameInvoked = null;
  ctrl.initialize({
    getBookmarkTree: () => mockTree,
    findBookmarkNodeById: (root, id) => (id === 'bm-101' ? mockBookmark : null),
    showGridItemRenameInput: (item, node) => {
      renameInvoked = { item, node };
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'bm-101', isFolder: false, sourceTile: mockItem });
  await ctrl.handleAction('rename');

  assert.ok(renameInvoked, 'showGridItemRenameInput was called');
  assert.equal(renameInvoked.item, mockItem);
  assert.equal(renameInvoked.node.title, 'GitHub');
});

test('Context Menu Controller - Rename folder works and passes gridItem and folder node', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');
  const mockFolderItem = env.createMockGridItem('f-201', 'Dev Tools', true);

  const mockFolderNode = { id: 'f-201', title: 'Dev Tools', children: [] };
  const mockTree = [{ id: 'root', children: [mockFolderNode] }];

  let renameInvoked = null;
  ctrl.initialize({
    getBookmarkTree: () => mockTree,
    findBookmarkNodeById: (root, id) => (id === 'f-201' ? mockFolderNode : null),
    showGridItemRenameInput: (item, node) => {
      renameInvoked = { item, node };
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'f-201', isFolder: true, sourceTile: mockFolderItem });
  await ctrl.handleAction('rename');

  assert.ok(renameInvoked, 'showGridItemRenameInput was called for folder');
  assert.equal(renameInvoked.item, mockFolderItem);
  assert.equal(renameInvoked.node.title, 'Dev Tools');
  assert.equal(renameInvoked.node.id, 'f-201');
});

test('Context Menu Controller - Rename folder works when getBookmarkTree returns a Promise', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');
  const mockFolderItem = env.createMockGridItem('f-301', 'Async Folder', true);

  const mockFolderNode = { id: 'f-301', title: 'Async Folder', children: [] };
  const mockTree = [{ id: 'root', children: [mockFolderNode] }];

  let renameInvoked = null;
  ctrl.initialize({
    getBookmarkTree: async () => mockTree,
    findBookmarkNodeById: (root, id) => (id === 'f-301' ? mockFolderNode : null),
    showGridItemRenameInput: (item, node) => {
      renameInvoked = { item, node };
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'f-301', isFolder: true, sourceTile: mockFolderItem });
  await ctrl.handleAction('rename');

  assert.ok(renameInvoked, 'showGridItemRenameInput called when tree is returned asynchronously');
  assert.equal(renameInvoked.node.title, 'Async Folder');
});

test('Context Menu Controller - Edit bookmark works and calls showEditBookmarkModal', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-icon-menu');
  const mockItem = env.createMockGridItem('bm-401', 'Reddit', false);

  let editBookmarkCalled = null;
  ctrl.initialize({
    showEditBookmarkModal: (id) => {
      editBookmarkCalled = id;
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'bm-401', isFolder: false, sourceTile: mockItem });
  await ctrl.handleAction('edit');

  assert.equal(editBookmarkCalled, 'bm-401');
});

test('Context Menu Controller - Edit folder works and calls showEditFolderModal with resolved node', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');
  const mockFolderItem = env.createMockGridItem('f-501', 'Work Projects', true);

  const mockFolderNode = { id: 'f-501', title: 'Work Projects', children: [] };
  const mockTree = [{ id: 'root', children: [mockFolderNode] }];

  let editFolderCalled = null;
  ctrl.initialize({
    getBookmarkTree: () => mockTree,
    findBookmarkNodeById: (root, id) => (id === 'f-501' ? mockFolderNode : null),
    showEditFolderModal: (folderNode) => {
      editFolderCalled = folderNode;
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'f-501', isFolder: true, sourceTile: mockFolderItem });
  await ctrl.handleAction('edit');

  assert.ok(editFolderCalled, 'showEditFolderModal was called');
  assert.equal(editFolderCalled.id, 'f-501');
  assert.equal(editFolderCalled.title, 'Work Projects');
});

test('Context Menu Controller - Edit folder works when getBookmarkTree returns a Promise', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');
  const mockFolderItem = env.createMockGridItem('f-601', 'Async Edit Folder', true);

  const mockFolderNode = { id: 'f-601', title: 'Async Edit Folder', children: [] };
  const mockTree = [{ id: 'root', children: [mockFolderNode] }];

  let editFolderCalled = null;
  ctrl.initialize({
    getBookmarkTree: async () => mockTree,
    findBookmarkNodeById: (root, id) => (id === 'f-601' ? mockFolderNode : null),
    showEditFolderModal: (folderNode) => {
      editFolderCalled = folderNode;
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'f-601', isFolder: true, sourceTile: mockFolderItem });
  await ctrl.handleAction('edit');

  assert.ok(editFolderCalled, 'showEditFolderModal called when tree is returned asynchronously');
  assert.equal(editFolderCalled.title, 'Async Edit Folder');
});

test('Context Menu Controller - Edit folder falls back to folderId when node is not in tree', async () => {
  const env = createContextMenuTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseContextMenuController;
  const menu = env.createMockMenu('bookmark-grid-folder-menu');

  let editFolderCalled = null;
  ctrl.initialize({
    getBookmarkTree: () => [{ id: 'root', children: [] }],
    findBookmarkNodeById: () => null,
    showEditFolderModal: (target) => {
      editFolderCalled = target;
    }
  });

  ctrl.show(menu, 100, 100, { itemId: 'f-999', isFolder: true });
  await ctrl.handleAction('edit');

  assert.ok(editFolderCalled, 'showEditFolderModal called with fallback');
  const id = typeof editFolderCalled === 'object' ? editFolderCalled.id : editFolderCalled;
  assert.equal(id, 'f-999');
});

