import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const loaderScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-loader-service.js');
const loaderScriptCode = fs.readFileSync(loaderScriptPath, 'utf8');

function createLoaderTestEnvironment(customMocks = {}) {
  const sandbox = {
    console,
    window: null,
    performance: {
      now: () => 100
    },
    browser: customMocks.browser || {
      bookmarks: {
        get: async () => [],
        getSubTree: async () => [],
        getTree: async () => []
      }
    },
    HomebaseBookmarkUiState: customMocks.uiState || {
      beginBookmarksBoot: () => {},
      endBookmarksBoot: () => {},
      showBookmarksEmptyState: () => {},
      hideBookmarksEmptyState: () => {},
      showBookmarksUI: () => {}
    },
    HomebaseBookmarkTreeService: customMocks.treeService || {
      flattenBookmarks: (nodes) => nodes.map(n => ({ id: n.id, title: n.title, url: n.url })),
      getBookmarkTree: async () => []
    },
    HomebaseBookmarkRootController: customMocks.rootController || {
      getHomebaseRootId: async () => null,
      getStoredHomebaseRootSubTree: async () => null,
      findHomebaseUnderOtherBookmarks: () => null,
      setHomebaseRootId: async () => {},
      getLastResolvedSubTree: () => null
    },
    HomebaseBookmarkGridController: customMocks.gridController || {
      createFolderTabs: () => {}
    },
    HomebaseBookmarkStorage: customMocks.storage || {
      getBookmarkMetadata: async () => ({}),
      getFolderMetadata: async () => ({}),
      getLastUsedFolderId: async () => null,
      setLastUsedFolderId: async () => {},
      getHomebaseRootId: async () => null,
      setHomebaseRootId: async () => {}
    }
  };

  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(loaderScriptCode, context);

  return { context, sandbox };
}

test('HomebaseBookmarkLoader exports expected API and attaches to window', () => {
  const { sandbox } = createLoaderTestEnvironment();

  assert.ok(sandbox.window.HomebaseBookmarkLoader, 'HomebaseBookmarkLoader should be defined on window');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.loadBookmarks, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.processBookmarks, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.loadBookmarkMetadata, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.loadFolderMetadata, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.loadLastUsedFolderId, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.setLastUsedFolderId, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.getAllBookmarks, 'function');
  assert.equal(typeof sandbox.window.HomebaseBookmarkLoader.getRootDisplayFolderId, 'function');

  // Window compatibility bridges
  assert.equal(sandbox.window.loadBookmarks, sandbox.window.HomebaseBookmarkLoader.loadBookmarks);
  assert.equal(sandbox.window.processBookmarks, sandbox.window.HomebaseBookmarkLoader.processBookmarks);
  assert.equal(sandbox.window.loadBookmarkMetadata, sandbox.window.HomebaseBookmarkLoader.loadBookmarkMetadata);
  assert.equal(sandbox.window.loadFolderMetadata, sandbox.window.HomebaseBookmarkLoader.loadFolderMetadata);
  assert.equal(sandbox.window.loadLastUsedFolderId, sandbox.window.HomebaseBookmarkLoader.loadLastUsedFolderId);
  assert.equal(sandbox.window.setLastUsedFolderId, sandbox.window.HomebaseBookmarkLoader.setLastUsedFolderId);
});

test('processBookmarks flattens bookmarks, records root ID, and invokes UI methods', () => {
  let uiStateCalled = [];
  let gridTabsCalledWith = null;

  const uiState = {
    beginBookmarksBoot: () => uiStateCalled.push('beginBoot'),
    endBookmarksBoot: () => uiStateCalled.push('endBoot'),
    showBookmarksEmptyState: () => uiStateCalled.push('emptyState'),
    hideBookmarksEmptyState: () => uiStateCalled.push('hideEmptyState'),
    showBookmarksUI: () => uiStateCalled.push('showUI')
  };

  const gridController = {
    createFolderTabs: (node, activeId) => {
      gridTabsCalledWith = { node, activeId };
    }
  };

  const treeService = {
    flattenBookmarks: (nodes) => nodes.map(n => ({ id: n.id, title: n.title }))
  };

  const { sandbox } = createLoaderTestEnvironment({ uiState, gridController, treeService });
  const rootNode = { id: 'root-123', title: 'Homebase', children: [] };

  sandbox.window.HomebaseBookmarkLoader.processBookmarks([rootNode], 'folder-abc');

  assert.equal(sandbox.window.HomebaseBookmarkLoader.getRootDisplayFolderId(), 'root-123');
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.window.HomebaseBookmarkLoader.getAllBookmarks())),
    [{ id: 'root-123', title: 'Homebase' }]
  );
  assert.equal(sandbox.window.rootDisplayFolderId, 'root-123');
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.window.allBookmarks)),
    [{ id: 'root-123', title: 'Homebase' }]
  );

  assert.ok(uiStateCalled.includes('hideEmptyState'));
  assert.ok(uiStateCalled.includes('showUI'));
  assert.ok(gridTabsCalledWith);
  assert.equal(gridTabsCalledWith.node.id, 'root-123');
  assert.equal(gridTabsCalledWith.activeId, 'folder-abc');
});

test('processBookmarks shows empty state if nodes is empty', () => {
  let emptyStateCalled = false;
  const uiState = {
    showBookmarksEmptyState: () => { emptyStateCalled = true; },
    hideBookmarksEmptyState: () => {},
    showBookmarksUI: () => {}
  };

  const { sandbox } = createLoaderTestEnvironment({ uiState });
  sandbox.window.HomebaseBookmarkLoader.processBookmarks([]);

  assert.equal(emptyStateCalled, true);
});

test('loadBookmarkMetadata loads and caches metadata', async () => {
  const storage = {
    getBookmarkMetadata: async () => ({ 'bm-1': { customTitle: 'Test Title' } })
  };

  const { sandbox } = createLoaderTestEnvironment({ storage });
  const meta = await sandbox.window.HomebaseBookmarkLoader.loadBookmarkMetadata();

  assert.deepEqual(
    JSON.parse(JSON.stringify(meta)),
    { 'bm-1': { customTitle: 'Test Title' } }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.window.bookmarkMetadata)),
    { 'bm-1': { customTitle: 'Test Title' } }
  );
});

test('loadFolderMetadata loads and caches folder metadata', async () => {
  const storage = {
    getFolderMetadata: async () => ({ 'fold-1': { icon: 'star' } })
  };

  const { sandbox } = createLoaderTestEnvironment({ storage });
  const meta = await sandbox.window.HomebaseBookmarkLoader.loadFolderMetadata();

  assert.deepEqual(
    JSON.parse(JSON.stringify(meta)),
    { 'fold-1': { icon: 'star' } }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.window.folderMetadata)),
    { 'fold-1': { icon: 'star' } }
  );
});

test('loadLastUsedFolderId and setLastUsedFolderId persist state', async () => {
  let persistedId = 'initial-id';
  const storage = {
    getLastUsedFolderId: async () => persistedId,
    setLastUsedFolderId: async (id) => { persistedId = id; }
  };

  const { sandbox } = createLoaderTestEnvironment({ storage });
  const loadedId = await sandbox.window.HomebaseBookmarkLoader.loadLastUsedFolderId();
  assert.equal(loadedId, 'initial-id');
  assert.equal(sandbox.window.lastUsedBookmarkFolderId, 'initial-id');

  await sandbox.window.HomebaseBookmarkLoader.setLastUsedFolderId('new-folder-99');
  assert.equal(persistedId, 'new-folder-99');
  assert.equal(sandbox.window.lastUsedBookmarkFolderId, 'new-folder-99');
});

test('loadBookmarks fetches stored root subTree and processes', async () => {
  const rootNode = { id: 'homebase-root-id', title: 'Homebase Root', children: [] };
  let processedNode = null;

  const rootController = {
    getHomebaseRootId: async () => 'homebase-root-id',
    getStoredHomebaseRootSubTree: async (id) => (id === 'homebase-root-id' ? rootNode : null),
    getLastResolvedSubTree: () => [rootNode]
  };

  const storage = {
    getHomebaseRootId: async () => 'homebase-root-id'
  };

  const gridController = {
    createFolderTabs: (node) => { processedNode = node; }
  };

  const { sandbox } = createLoaderTestEnvironment({ rootController, storage, gridController });
  await sandbox.window.HomebaseBookmarkLoader.loadBookmarks('active-fld');

  assert.ok(processedNode);
  assert.equal(processedNode.id, 'homebase-root-id');
  assert.equal(sandbox.window.HomebaseBookmarkLoader.getRootDisplayFolderId(), 'homebase-root-id');
});
