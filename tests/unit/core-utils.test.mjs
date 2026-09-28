import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createCoreUtilsContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Math,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}


test('escapeHtml() - properly escapes dangerous HTML characters', () => {
  const { escapeHtml } = createCoreUtilsContext();
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#039;s');
  assert.strictEqual(escapeHtml('Normal text 123'), 'Normal text 123');
  assert.strictEqual(escapeHtml(''), '');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('shuffleArray() - preserves array length and all elements', () => {
  const { shuffleArray } = createCoreUtilsContext();
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const input = [...original];
  const result = shuffleArray(input);

  assert.strictEqual(result.length, original.length);
  for (const item of original) {
    assert.strictEqual(result.includes(item), true);
  }
});

test('debounce() - delays invocation and debounces rapid calls', async () => {
  const { debounce } = createCoreUtilsContext();
  let callCount = 0;
  let lastArg = null;

  const fn = debounce((arg) => {
    callCount += 1;
    lastArg = arg;
  }, 50);

  fn(1);
  fn(2);
  fn(3);

  assert.strictEqual(callCount, 0);

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.strictEqual(callCount, 1);
  assert.strictEqual(lastArg, 3);
});

test('debounce() - flush and cancel behavior', async () => {
  const { debounce } = createCoreUtilsContext();
  let callCount = 0;

  const fn1 = debounce(() => { callCount += 1; }, 100);
  fn1();
  fn1.cancel();

  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.strictEqual(callCount, 0);

  const fn2 = debounce(() => { callCount += 1; }, 100);
  fn2();
  fn2.flush();
  assert.strictEqual(callCount, 1);
});

test('throttle() - throttles rapid calls within interval', async () => {
  const { throttle } = createCoreUtilsContext();
  let callCount = 0;

  const fn = throttle(() => { callCount += 1; }, 50);

  fn();
  fn();
  fn();

  assert.strictEqual(callCount, 1);

  await new Promise((resolve) => setTimeout(resolve, 70));

  fn();
  assert.strictEqual(callCount, 2);
});

test('normalizeWidgetOrder() - canonical utility in utils.js normalizes and preserves order', () => {
  const { normalizeWidgetOrder } = createCoreUtilsContext();
  const input = ['todo', 'news', 'weather', 'quote'];
  assert.deepStrictEqual(Array.from(normalizeWidgetOrder(input)), ['todo', 'news', 'weather', 'quote']);

  // Deduplication and appending missing
  assert.deepStrictEqual(Array.from(normalizeWidgetOrder(['todo', 'todo'])), ['todo', 'weather', 'quote', 'news']);

  // Non-array input fallback
  assert.deepStrictEqual(Array.from(normalizeWidgetOrder(null)), ['weather', 'quote', 'todo', 'news']);
});


test('areWidgetOrdersEqual() - canonical utility in utils.js correctly evaluates equality', () => {
  const { areWidgetOrdersEqual } = createCoreUtilsContext();
  assert.strictEqual(areWidgetOrdersEqual(['a', 'b'], ['a', 'b']), true);
  assert.strictEqual(areWidgetOrdersEqual(['a', 'b'], ['b', 'a']), false);
  assert.strictEqual(areWidgetOrdersEqual(['a'], ['a', 'b']), false);
  assert.strictEqual(areWidgetOrdersEqual(null, ['a']), false);
  assert.strictEqual(areWidgetOrdersEqual(undefined, undefined), false);
});
