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
    JSON,
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

test('isPlainObject() - correctly identifies plain objects vs primitives/instances', () => {
  const { isPlainObject } = createCoreUtilsContext();
  assert.strictEqual(isPlainObject({}), true);
  assert.strictEqual(isPlainObject({ a: 1, b: 'two' }), true);
  assert.strictEqual(isPlainObject(Object.create(null)), true);
  assert.strictEqual(isPlainObject(new Object()), true);

  // Non-plain objects or primitives
  assert.strictEqual(isPlainObject(null), false);
  assert.strictEqual(isPlainObject(undefined), false);
  assert.strictEqual(isPlainObject([]), false);
  assert.strictEqual(isPlainObject([1, 2, 3]), false);
  assert.strictEqual(isPlainObject('string'), false);
  assert.strictEqual(isPlainObject(123), false);
  assert.strictEqual(isPlainObject(true), false);
  assert.strictEqual(isPlainObject(new Date()), false);
  assert.strictEqual(isPlainObject(/regex/), false);
  assert.strictEqual(isPlainObject(() => {}), false);

  class CustomClass {}
  assert.strictEqual(isPlainObject(new CustomClass()), false);
});

test('areValuesIdentical() - deep equality check across primitives, arrays, and objects', () => {
  const { areValuesIdentical } = createCoreUtilsContext();
  // Primitives
  assert.strictEqual(areValuesIdentical(1, 1), true);
  assert.strictEqual(areValuesIdentical('abc', 'abc'), true);
  assert.strictEqual(areValuesIdentical(true, true), true);
  assert.strictEqual(areValuesIdentical(null, null), true);
  assert.strictEqual(areValuesIdentical(undefined, undefined), true);
  assert.strictEqual(areValuesIdentical(NaN, NaN), true);
  assert.strictEqual(areValuesIdentical(1, 2), false);
  assert.strictEqual(areValuesIdentical('a', 'b'), false);
  assert.strictEqual(areValuesIdentical(null, undefined), false);

  // Objects and arrays
  assert.strictEqual(areValuesIdentical([1, 2], [1, 2]), true);
  assert.strictEqual(areValuesIdentical([1, 2], [2, 1]), false);
  assert.strictEqual(areValuesIdentical({ a: 1, b: 2 }, { a: 1, b: 2 }), true);
  assert.strictEqual(areValuesIdentical({ a: 1, b: 2 }, { a: 1, b: 3 }), false);
  assert.strictEqual(areValuesIdentical({ a: 1 }, null), false);
  assert.strictEqual(areValuesIdentical(null, { a: 1 }), false);
  assert.strictEqual(areValuesIdentical({ a: 1 }, 123), false);
});

test('clampNumber() - numeric bounds enforcement with fallback', () => {
  const { clampNumber } = createCoreUtilsContext();
  assert.strictEqual(clampNumber(5, 0, 10, 0), 5);
  assert.strictEqual(clampNumber(-5, 0, 10, 0), 0);
  assert.strictEqual(clampNumber(15, 0, 10, 0), 10);
  assert.strictEqual(clampNumber('7.5', 0, 10, 0), 7.5);
  assert.strictEqual(clampNumber('invalid', 0, 10, 3), 3);
  assert.strictEqual(clampNumber(NaN, 0, 10, 3), 3);
  assert.strictEqual(clampNumber(Infinity, 0, 10, 3), 3);
});

test('clampInteger() - integer rounding and bounds enforcement with fallback', () => {
  const { clampInteger } = createCoreUtilsContext();
  assert.strictEqual(clampInteger(5.6, 0, 10, 0), 6);
  assert.strictEqual(clampInteger(5.4, 0, 10, 0), 5);
  assert.strictEqual(clampInteger(-3, 0, 10, 0), 0);
  assert.strictEqual(clampInteger(12.8, 0, 10, 0), 10);
  assert.strictEqual(clampInteger('invalid', 0, 10, 4), 4);
  assert.strictEqual(clampInteger(NaN, 0, 10, 4), 4);
});
