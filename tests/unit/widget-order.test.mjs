import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/widgets/widget-visibility.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createWidgetContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Boolean,
    document: {
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: () => null,
      setItem: () => null
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

test('normalizeWidgetOrder() - preserves valid complete order', () => {
  const ctx = createWidgetContext();
  const input = ['news', 'todo', 'quote', 'weather'];
  const result = ctx.normalizeWidgetOrder(input);
  assert.deepStrictEqual(Array.from(result), ['news', 'todo', 'quote', 'weather']);
});

test('normalizeWidgetOrder() - deduplicates and appends missing widgets', () => {
  const ctx = createWidgetContext();
  const input = ['todo', 'todo', 'weather'];
  const result = Array.from(ctx.normalizeWidgetOrder(input));
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0], 'todo');
  assert.strictEqual(result[1], 'weather');
  assert.strictEqual(result.includes('quote'), true);
  assert.strictEqual(result.includes('news'), true);
});

test('normalizeWidgetOrder() - handles non-array input by returning default order', () => {
  const ctx = createWidgetContext();
  const cases = [null, undefined, 'invalid', 123];
  for (const input of cases) {
    const result = Array.from(ctx.normalizeWidgetOrder(input));
    assert.deepStrictEqual(result, ['weather', 'quote', 'todo', 'news']);
  }
});

test('areWidgetOrdersEqual() - correctly compares widget order arrays', () => {
  const ctx = createWidgetContext();
  assert.strictEqual(ctx.areWidgetOrdersEqual(['a', 'b'], ['a', 'b']), true);
  assert.strictEqual(ctx.areWidgetOrdersEqual(['a', 'b'], ['b', 'a']), false);
  assert.strictEqual(ctx.areWidgetOrdersEqual(['a'], ['a', 'b']), false);
  assert.strictEqual(ctx.areWidgetOrdersEqual(null, ['a']), false);
  assert.strictEqual(ctx.areWidgetOrdersEqual(undefined, undefined), false);
});
