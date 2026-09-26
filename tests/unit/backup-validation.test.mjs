import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

const todoScriptPath = path.join(rootDir, 'src/newtab/widgets/todo.js');
const todoScriptCode = fs.readFileSync(todoScriptPath, 'utf8');

function createBackupContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Date,
    Math,
    browser: { storage: { local: {} } }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(backupScriptCode, context);
  return context;
}

function createTodoContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Date,
    Math,
    document: {
      getElementById: () => null,
      querySelector: () => null
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(todoScriptCode, context);
  return context;
}

test('isPlainObject() - validates plain objects correctly', () => {
  const ctx = createBackupContext();
  assert.strictEqual(ctx.isPlainObject({}), true);
  assert.strictEqual(ctx.isPlainObject({ a: 1 }), true);
  assert.strictEqual(ctx.isPlainObject(Object.create(null)), true);
  assert.strictEqual(ctx.isPlainObject(null), false);
  assert.strictEqual(ctx.isPlainObject([]), false);
  assert.strictEqual(ctx.isPlainObject('string'), false);
  assert.strictEqual(ctx.isPlainObject(123), false);
  assert.strictEqual(ctx.isPlainObject(undefined), false);
});

test('HOMEBASE_OWNED_STORAGE_KEYS contains myWallpapers and critical keys', () => {
  const ctx = createBackupContext();
  const keys = vm.runInContext('HOMEBASE_OWNED_STORAGE_KEYS', ctx);
  assert.strictEqual(Array.isArray(keys), true);
  assert.strictEqual(keys.includes('myWallpapers'), true);
  assert.strictEqual(keys.includes('wallpaperSelection'), true);
  assert.strictEqual(keys.includes('todoItems'), true);
  assert.strictEqual(keys.includes('widgetOrder'), true);
  assert.strictEqual(keys.length >= 72, true);
});

test('normalizeMyWallpapersItems() - sanitizes and sorts custom wallpapers', () => {
  const ctx = createBackupContext();
  const raw = [
    {
      id: 'wp-1',
      title: 'Older Wallpaper',
      type: 'image',
      mimeType: 'image/jpeg',
      cacheKey: 'cache-1',
      size: 1024,
      createdAt: 1000
    },
    {
      id: 'wp-2',
      title: 'Newer Wallpaper',
      type: 'video',
      mimeType: 'video/mp4',
      cacheKey: 'cache-2',
      size: 2048,
      createdAt: 2000
    },
    { id: 'wp-1', title: 'Duplicate ID' },
    null,
    'invalid-entry',
    { invalid: true }
  ];

  const result = ctx.normalizeMyWallpapersItems(raw);
  assert.strictEqual(result.length, 2);
  // Sorted by createdAt descending
  assert.strictEqual(result[0].id, 'wp-2');
  assert.strictEqual(result[0].title, 'Newer Wallpaper');
  assert.strictEqual(result[0].type, 'video');
  assert.strictEqual(result[1].id, 'wp-1');
  assert.strictEqual(result[1].title, 'Older Wallpaper');
  assert.strictEqual(result[1].type, 'image');
});

test('normalizeMyWallpapersItems() - handles empty and non-array inputs', () => {
  const ctx = createBackupContext();
  const cases = [[], null, undefined, 'not an array'];
  for (const input of cases) {
    const res = ctx.normalizeMyWallpapersItems(input);
    assert.strictEqual(Array.isArray(res), true);
    assert.strictEqual(res.length, 0);
  }
});

test('normalizeTodoItems() - sanitizes and deduplicates todo list', () => {
  const ctx = createTodoContext();
  const raw = [
    { id: 'todo-1', text: 'Task 1', done: false, createdAt: 100 },
    { id: 'todo-2', text: '  Task 2  ', done: true, createdAt: 200 },
    { id: 'todo-1', text: 'Duplicate ID', done: false },
    { text: 'No ID task', done: true },
    { text: '   ' }, // empty text should be dropped
    null,
    'garbage'
  ];

  const result = ctx.normalizeTodoItems(raw);
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0].id, 'todo-1');
  assert.strictEqual(result[0].text, 'Task 1');
  assert.strictEqual(result[0].done, false);

  assert.strictEqual(result[1].id, 'todo-2');
  assert.strictEqual(result[1].text, 'Task 2');
  assert.strictEqual(result[1].done, true);

  // Duplicate ID item gets assigned a new unique ID
  assert.notStrictEqual(result[2].id, 'todo-1');
  assert.strictEqual(result[2].text, 'Duplicate ID');

  // No ID task gets a generated ID
  assert.strictEqual(typeof result[3].id, 'string');
  assert.strictEqual(result[3].text, 'No ID task');
  assert.strictEqual(result[3].done, true);
});

test('normalizeTodoItems() - handles empty and non-array inputs', () => {
  const ctx = createTodoContext();
  const cases = [[], null, undefined, 'invalid'];
  for (const input of cases) {
    const res = ctx.normalizeTodoItems(input);
    assert.strictEqual(Array.isArray(res), true);
    assert.strictEqual(res.length, 0);
  }
});
