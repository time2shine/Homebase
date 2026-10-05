import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const storageDispatcherScriptPath = path.join(rootDir, 'src/newtab/core/storage-dispatcher.js');
const storageDispatcherScriptCode = fs.readFileSync(storageDispatcherScriptPath, 'utf8');

function createTestEnvironment(options = {}) {
  const {
    withSearchController = true,
    withSettingsPreferences = true,
    withTodoHandler = true,
    withBookmarkRootController = true,
    withBookmarkGridController = true
  } = options;

  const storageListeners = [];
  const searchCalls = [];
  const settingsCalls = [];
  const todoCalls = [];
  const bookmarkRootCalls = [];
  const bookmarkGridCalls = [];

  const context = {
    console: {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    browser: {
      storage: {
        onChanged: {
          addListener: (fn) => storageListeners.push(fn)
        }
      }
    }
  };

  context.window = context;

  if (withSearchController) {
    context.window.HomebaseSearchUiController = {
      handleStorageChange: (changes, area) => {
        searchCalls.push({ changes, area });
      }
    };
  }

  if (withSettingsPreferences) {
    context.window.HomebaseSettingsPreferences = {
      handleStorageChange: (changes, area) => {
        settingsCalls.push({ changes, area });
      }
    };
  }

  if (withTodoHandler) {
    context.handleTodoStorageChange = (changes, area) => {
      todoCalls.push({ changes, area });
    };
  }

  if (withBookmarkRootController) {
    context.window.HomebaseBookmarkRootController = {
      handleStorageChange: (changes, area) => {
        bookmarkRootCalls.push({ changes, area });
      }
    };
  }

  if (withBookmarkGridController) {
    context.window.HomebaseBookmarkGridController = {
      handleStorageChange: (changes, area) => {
        bookmarkGridCalls.push({ changes, area });
      }
    };
  }

  vm.createContext(context);
  vm.runInContext(storageDispatcherScriptCode, context);

  return {
    context,
    dispatcher: context.window.HomebaseStorageDispatcher,
    storageListeners,
    searchCalls,
    settingsCalls,
    todoCalls,
    bookmarkRootCalls,
    bookmarkGridCalls
  };
}

test('HomebaseStorageDispatcher exports expected interface', () => {
  const env = createTestEnvironment();
  assert.ok(env.dispatcher, 'Dispatcher must be defined on window');
  assert.strictEqual(typeof env.dispatcher.initialize, 'function');
  assert.strictEqual(typeof env.dispatcher.addListener, 'function');
  assert.strictEqual(typeof env.dispatcher.removeListener, 'function');
  assert.strictEqual(typeof env.dispatcher.dispatch, 'function');
  assert.strictEqual(typeof env.dispatcher.isInitialized, 'function');
});

test('initialize binds storage listener once', () => {
  const env = createTestEnvironment();
  assert.strictEqual(env.dispatcher.isInitialized(), false);
  assert.strictEqual(env.storageListeners.length, 0);

  env.dispatcher.initialize();
  assert.strictEqual(env.dispatcher.isInitialized(), true);
  assert.strictEqual(env.storageListeners.length, 1);

  // Calling initialize again should not attach duplicate listeners
  env.dispatcher.initialize();
  assert.strictEqual(env.storageListeners.length, 1);
});

test('dispatches changes to search, settings, todo, bookmark-root, and bookmark-grid controllers', () => {
  const env = createTestEnvironment();
  env.dispatcher.initialize();

  const changes = {
    testKey: { oldValue: 'a', newValue: 'b' }
  };

  // Trigger via storage listener
  env.storageListeners[0](changes, 'local');

  assert.strictEqual(env.searchCalls.length, 1);
  assert.deepStrictEqual(env.searchCalls[0], { changes, area: 'local' });

  assert.strictEqual(env.settingsCalls.length, 1);
  assert.deepStrictEqual(env.settingsCalls[0], { changes, area: 'local' });

  assert.strictEqual(env.todoCalls.length, 1);
  assert.deepStrictEqual(env.todoCalls[0], { changes, area: 'local' });

  assert.strictEqual(env.bookmarkRootCalls.length, 1);
  assert.deepStrictEqual(env.bookmarkRootCalls[0], { changes, area: 'local' });

  assert.strictEqual(env.bookmarkGridCalls.length, 1);
  assert.deepStrictEqual(env.bookmarkGridCalls[0], { changes, area: 'local' });
});

test('ignores non-local storage changes', () => {
  const env = createTestEnvironment();
  env.dispatcher.initialize();

  const changes = {
    testKey: { oldValue: 'a', newValue: 'b' }
  };

  // Trigger with 'sync' or 'managed' area
  env.storageListeners[0](changes, 'sync');
  env.storageListeners[0](changes, 'managed');

  assert.strictEqual(env.searchCalls.length, 0);
  assert.strictEqual(env.settingsCalls.length, 0);
  assert.strictEqual(env.todoCalls.length, 0);
  assert.strictEqual(env.bookmarkRootCalls.length, 0);
  assert.strictEqual(env.bookmarkGridCalls.length, 0);
});

test('dispatches changes to custom subscriber registered via initialize options', () => {
  const env = createTestEnvironment();
  const customCalls = [];

  env.dispatcher.initialize({
    onStorageChange: (changes, area) => {
      customCalls.push({ changes, area });
    }
  });

  const changes = {
    folderMeta: { oldValue: {}, newValue: { '1': { title: 'Folder' } } }
  };

  env.storageListeners[0](changes, 'local');

  assert.strictEqual(customCalls.length, 1);
  assert.deepStrictEqual(customCalls[0], { changes, area: 'local' });
});

test('addListener and removeListener manage subscribers dynamically', () => {
  const env = createTestEnvironment();
  env.dispatcher.initialize();

  const calls = [];
  const listener = (changes, area) => calls.push({ changes, area });

  env.dispatcher.addListener(listener);
  assert.strictEqual(env.dispatcher.getSubscribersCount(), 1);

  const changes1 = { k: { newValue: 1 } };
  env.dispatcher.dispatch(changes1, 'local');
  assert.strictEqual(calls.length, 1);

  env.dispatcher.removeListener(listener);
  assert.strictEqual(env.dispatcher.getSubscribersCount(), 0);

  const changes2 = { k: { newValue: 2 } };
  env.dispatcher.dispatch(changes2, 'local');
  assert.strictEqual(calls.length, 1); // Not called again
});

test('survives exceptions in individual handlers gracefully', () => {
  const env = createTestEnvironment();
  const subsequentCalls = [];

  // Make Search and Bookmark controllers throw
  env.context.window.HomebaseSearchUiController.handleStorageChange = () => {
    throw new Error('Search handler crash');
  };
  env.context.window.HomebaseBookmarkRootController.handleStorageChange = () => {
    throw new Error('BookmarkRoot handler crash');
  };
  env.context.window.HomebaseBookmarkGridController.handleStorageChange = () => {
    throw new Error('BookmarkGrid handler crash');
  };

  env.dispatcher.initialize({
    onStorageChange: (changes, area) => {
      subsequentCalls.push({ changes, area });
    }
  });

  const changes = { k: { newValue: 'val' } };

  // Dispatch should not throw and should still execute Settings, Todo, and custom subscriber
  assert.doesNotThrow(() => {
    env.dispatcher.dispatch(changes, 'local');
  });

  assert.strictEqual(env.settingsCalls.length, 1);
  assert.strictEqual(env.todoCalls.length, 1);
  assert.strictEqual(subsequentCalls.length, 1);
});

test('HomebaseBookmarkGridController.handleStorageChange processes metadata updates and triggers patching/fallback', () => {
  const gridScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-grid-controller.js');
  const gridScriptCode = fs.readFileSync(gridScriptPath, 'utf8');

  let renderedNodes = [];
  const fakeRoot = {
    id: 'root',
    children: [
      { id: 'item1', title: 'Item 1' },
      { id: 'item2', title: 'Item 2' }
    ]
  };

  const context = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    bookmarkTree: [fakeRoot],
    findBookmarkNodeById: (root, id) => (root && root.id === id ? root : null),
    renderBookmarkGrid: (node) => { renderedNodes.push(node); }
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(gridScriptCode, context);

  context.window.renderBookmarkGrid = (node) => { renderedNodes.push(node); };

  const controller = context.window.HomebaseBookmarkGridController;
  assert.ok(controller, 'BookmarkGridController must be defined');
  assert.strictEqual(typeof controller.handleStorageChange, 'function');

  // Set active folder to fakeRoot
  controller.setCurrentGridFolderNode(fakeRoot);

  // 1. Process folder metadata update
  controller.handleStorageChange({
    folderCustomMetadata: {
      oldValue: {},
      newValue: { item1: { icon: 'folder-icon' } }
    }
  }, 'local');

  assert.deepStrictEqual(context.window.folderMetadata, { item1: { icon: 'folder-icon' } });

  // 2. Process bookmark metadata update
  controller.handleStorageChange({
    bookmarkCustomMetadata: {
      oldValue: {},
      newValue: { item2: { iconCleared: true } }
    }
  }, 'local');

  assert.deepStrictEqual(context.window.bookmarkMetadata, { item2: { iconCleared: true } });

  // Since patchActiveGridMetadataItems returns true when DOM item is not rendered in non-virtual mode,
  // it falls back to renderBookmarkGrid(activeNode)
  assert.ok(renderedNodes.length >= 2, 'Fallback renderBookmarkGrid must be called');
  assert.strictEqual(renderedNodes[0].id, 'root');
});

test('HomebaseBookmarkRootController.handleStorageChange reloads bookmarks on root id change', () => {
  const rootScriptPath = path.join(rootDir, 'src/newtab/bookmarks/bookmark-root-controller.js');
  const rootScriptCode = fs.readFileSync(rootScriptPath, 'utf8');

  let loadBookmarksCalled = 0;
  const context = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    loadBookmarks: () => { loadBookmarksCalled++; },
    HOMEBASE_BOOKMARK_ROOT_ID_KEY: 'homebaseBookmarkRootId'
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(rootScriptCode, context);

  const controller = context.window.HomebaseBookmarkRootController;
  assert.ok(controller, 'BookmarkRootController must be defined');
  assert.strictEqual(typeof controller.handleStorageChange, 'function');

  // Storage change with unrelated key
  controller.handleStorageChange({ otherKey: { newValue: 'x' } }, 'local');
  assert.strictEqual(loadBookmarksCalled, 0);

  // Storage change with non-local area
  controller.handleStorageChange({ homebaseBookmarkRootId: { newValue: 'new-root' } }, 'sync');
  assert.strictEqual(loadBookmarksCalled, 0);

  // Storage change with root id key
  controller.handleStorageChange({ homebaseBookmarkRootId: { newValue: 'new-root' } }, 'local');
  assert.strictEqual(loadBookmarksCalled, 1);
});
