import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createSearchUtilsContext() {
  const sandbox = {
    Object,
    Array,
    String,
    Number,
    Math,
    parseFloat,
    isNaN,
    isFinite
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

test('evaluateMath() - basic arithmetic operations', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('2 + 2'), 4);
  assert.strictEqual(evaluateMath('10 - 3'), 7);
  assert.strictEqual(evaluateMath('6 * 7'), 42);
  assert.strictEqual(evaluateMath('6 x 7'), 42);
  assert.strictEqual(evaluateMath('100 / 4'), 25);
  assert.strictEqual(evaluateMath('10 % 3'), 1);
  assert.strictEqual(evaluateMath('2 ^ 3'), 8);
});

test('evaluateMath() - operator precedence', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('2 + 3 * 4'), 14);
  assert.strictEqual(evaluateMath('10 - 4 / 2'), 8);
  assert.strictEqual(evaluateMath('2 + 2 ^ 3'), 10);
});

test('evaluateMath() - leading equals sign', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('=15 * 3'), 45);
  assert.strictEqual(evaluateMath('= 100 - 25'), 75);
});

test('evaluateMath() - division by zero protection', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('5 / 0'), 0);
});

test('evaluateMath() - invalid and non-math queries return null', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('hello world'), null);
  assert.strictEqual(evaluateMath('git commit -m "fix"'), null);
  assert.strictEqual(evaluateMath(''), null);
  assert.strictEqual(evaluateMath('42'), null);
  assert.strictEqual(evaluateMath('+'), null);
});

test('evaluateUnits() - temperature conversions', () => {
  const { evaluateUnits } = createSearchUtilsContext();
  assert.strictEqual(evaluateUnits('0 c to f'), 32);
  assert.strictEqual(evaluateUnits('100 celsius to fahrenheit'), 212);
  assert.strictEqual(evaluateUnits('32 f to c'), 0);
  assert.strictEqual(evaluateUnits('212 fahrenheit to celsius'), 100);
});

test('evaluateUnits() - length conversions', () => {
  const { evaluateUnits } = createSearchUtilsContext();
  assert.strictEqual(evaluateUnits('1 km to m'), 1000);
  assert.strictEqual(evaluateUnits('1000 m to km'), 1);
  assert.strictEqual(evaluateUnits('1 mi to km'), 1.61);
});

test('evaluateUnits() - weight conversions', () => {
  const { evaluateUnits } = createSearchUtilsContext();
  assert.strictEqual(evaluateUnits('1 kg to lbs'), 2.2);
  assert.strictEqual(evaluateUnits('10 lbs to kg'), 4.54);
});

test('evaluateUnits() - invalid or mismatched units return null', () => {
  const { evaluateUnits } = createSearchUtilsContext();
  assert.strictEqual(evaluateUnits('10 kg to meters'), null);
  assert.strictEqual(evaluateUnits('100 apples to oranges'), null);
  assert.strictEqual(evaluateUnits('not a unit query'), null);
});

test('isLikelyUrl() - explicit schemes', () => {
  const { isLikelyUrl } = createSearchUtilsContext();
  assert.strictEqual(isLikelyUrl('https://example.com'), true);
  assert.strictEqual(isLikelyUrl('http://localhost:3000'), true);
  assert.strictEqual(isLikelyUrl('mailto:user@example.com'), true);
});

test('isLikelyUrl() - domain names and intranet shortcuts', () => {
  const { isLikelyUrl } = createSearchUtilsContext();
  assert.strictEqual(isLikelyUrl('example.com'), true);
  assert.strictEqual(isLikelyUrl('github.com/rokon'), true);
  assert.strictEqual(isLikelyUrl('wikipedia.org'), true);
  assert.strictEqual(isLikelyUrl('router/'), true);
  assert.strictEqual(isLikelyUrl('localhost'), true);
  assert.strictEqual(isLikelyUrl('localhost:8080'), true);
  assert.strictEqual(isLikelyUrl('192.168.1.1'), true);
  assert.strictEqual(isLikelyUrl('127.0.0.1:8080'), true);
});

test('isLikelyUrl() - search queries return false', () => {
  const { isLikelyUrl } = createSearchUtilsContext();
  assert.strictEqual(isLikelyUrl('just a regular search query'), false);
  assert.strictEqual(isLikelyUrl('how to bake sourdough bread'), false);
  assert.strictEqual(isLikelyUrl('weather in tokyo'), false);
});
