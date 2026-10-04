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
    withTodoHandler = true
  } = options;

  const storageListeners = [];
  const searchCalls = [];
  const settingsCalls = [];
  const todoCalls = [];

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

  vm.createContext(context);
  vm.runInContext(storageDispatcherScriptCode, context);

  return {
    context,
    dispatcher: context.window.HomebaseStorageDispatcher,
    storageListeners,
    searchCalls,
    settingsCalls,
    todoCalls
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

test('dispatches changes to search, settings, and todo controllers', () => {
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

  // Make Search controller throw
  env.context.window.HomebaseSearchUiController.handleStorageChange = () => {
    throw new Error('Search handler crash');
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
