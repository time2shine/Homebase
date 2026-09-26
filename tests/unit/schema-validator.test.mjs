import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorScriptPath = path.join(rootDir, 'src/newtab/core/schema-validator.js');
const validatorScriptCode = fs.readFileSync(validatorScriptPath, 'utf8');

const backupScriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');
const backupScriptCode = fs.readFileSync(backupScriptPath, 'utf8');

function createValidatorContext() {
  const sandbox = {
    Object,
    Array,
    Set,
    String,
    Number,
    Date,
    Math,
    RegExp,
    JSON
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(validatorScriptCode, context);
  return sandbox;
}

test('schema-validator: exports window.HomebaseValidator with synchronous API', () => {
  const env = createValidatorContext();
  assert.ok(env.HomebaseValidator, 'window.HomebaseValidator should exist');
  assert.strictEqual(typeof env.HomebaseValidator.validateKey, 'function');
  assert.strictEqual(typeof env.HomebaseValidator.sanitizeKey, 'function');
  assert.strictEqual(typeof env.HomebaseValidator.sanitizeStorageBatch, 'function');
  assert.strictEqual(typeof env.HomebaseValidator.SCHEMA_DEFINITIONS, 'object');

  // Verify functions return synchronously (not promises)
  const syncCheck = env.HomebaseValidator.validateKey('appBackgroundDim', 20);
  assert.strictEqual(typeof syncCheck, 'boolean');
  assert.strictEqual(syncCheck, true);
});

test('schema-validator: valid values remain unchanged', () => {
  const { HomebaseValidator } = createValidatorContext();

  // Booleans
  assert.strictEqual(HomebaseValidator.validateKey('appShowSidebar', true), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appShowSidebar', true), true);
  assert.strictEqual(HomebaseValidator.validateKey('appShowSidebar', false), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appShowSidebar', false), false);

  // Numbers within range
  assert.strictEqual(HomebaseValidator.validateKey('appBackgroundDim', 45), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', 45), 45);
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgOpacity', 0.8), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBookmarkTextBgOpacity', 0.8), 0.8);
  assert.strictEqual(HomebaseValidator.validateKey('weatherLat', 35.6762), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('weatherLat', 35.6762), 35.6762);

  // Hex colors
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', '#2CA5FF'), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBookmarkTextBgColor', '#2CA5FF'), '#2CA5FF');

  // Enums
  assert.strictEqual(HomebaseValidator.validateKey('appTimeFormatPreference', '24-hour'), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appTimeFormatPreference', '24-hour'), '24-hour');
  assert.strictEqual(HomebaseValidator.validateKey('appNewsSource', 'techcrunch'), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appNewsSource', 'techcrunch'), 'techcrunch');

  // Widget order
  const validOrder = ['weather', 'quote', 'todo', 'news'];
  assert.strictEqual(HomebaseValidator.validateKey('widgetOrder', validOrder), true);
  assert.deepStrictEqual(Array.from(HomebaseValidator.sanitizeKey('widgetOrder', validOrder)), validOrder);

  // Schema version
  assert.strictEqual(HomebaseValidator.validateKey('schemaVersion', 1), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('schemaVersion', 1), 1);
});

test('schema-validator: invalid numbers are clamped or safely handled', () => {
  const { HomebaseValidator } = createValidatorContext();

  // Out of bounds integer clamping (appBackgroundDim: 0-80)
  assert.strictEqual(HomebaseValidator.validateKey('appBackgroundDim', 150), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', 150), 80);
  assert.strictEqual(HomebaseValidator.validateKey('appBackgroundDim', -30), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', -30), 0);

  // Non-number values
  assert.strictEqual(HomebaseValidator.validateKey('appBackgroundDim', 'dark'), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', 'dark', { fallbackToDefault: false }), undefined);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', 'dark', { fallbackToDefault: true }), 0);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', NaN, { fallbackToDefault: false }), undefined);

  // Numeric string parsing & clamping
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBackgroundDim', '50'), 50);

  // Float clamping (appBookmarkTextBgOpacity: 0.1 - 1.0)
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgOpacity', 2.5), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBookmarkTextBgOpacity', 2.5), 1.0);
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgOpacity', 0.02), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBookmarkTextBgOpacity', 0.02), 0.1);

  // Coordinate clamping (weatherLat: -90 to 90, weatherLon: -180 to 180)
  assert.strictEqual(HomebaseValidator.validateKey('weatherLat', 120), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('weatherLat', 120), 90);
  assert.strictEqual(HomebaseValidator.validateKey('weatherLon', -250), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('weatherLon', -250), -180);
});

test('schema-validator: invalid hex colors are rejected or normalized', () => {
  const { HomebaseValidator } = createValidatorContext();

  // 3-character hex expansion
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', '#FFF'), true);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appBookmarkTextBgColor', '#FFF'), '#FFFFFF');

  // Invalid formats rejected
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', 'blue'), false);
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', 'rgb(0,0,0)'), false);
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', '#1234567'), false);
  assert.strictEqual(HomebaseValidator.validateKey('appBookmarkTextBgColor', '<script>alert(1)</script>'), false);

  // Discarded when fallbackToDefault is false
  assert.strictEqual(
    HomebaseValidator.sanitizeKey('appBookmarkTextBgColor', '<script>', { fallbackToDefault: false }),
    undefined
  );

  // Safe default when fallbackToDefault is true
  assert.strictEqual(
    HomebaseValidator.sanitizeKey('appBookmarkTextBgColor', 'invalid', { fallbackToDefault: true }),
    '#2CA5FF'
  );
});

test('schema-validator: invalid enums are rejected or defaulted', () => {
  const { HomebaseValidator } = createValidatorContext();

  assert.strictEqual(HomebaseValidator.validateKey('appTimeFormatPreference', '48-hour'), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appTimeFormatPreference', '48-hour', { fallbackToDefault: false }), undefined);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appTimeFormatPreference', '48-hour', { fallbackToDefault: true }), '12-hour');

  assert.strictEqual(HomebaseValidator.validateKey('appNewsSource', 'fake-news-network'), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appNewsSource', 'fake-news-network', { fallbackToDefault: false }), undefined);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appNewsSource', 'fake-news-network', { fallbackToDefault: true }), 'aljazeera');

  assert.strictEqual(HomebaseValidator.validateKey('appGlassStylePref', 'ultra-blur'), false);
  assert.strictEqual(HomebaseValidator.sanitizeKey('appGlassStylePref', 'ultra-blur', { fallbackToDefault: true }), 'original');
});

test('schema-validator: malformed arrays are normalized and bounded', () => {
  const { HomebaseValidator } = createValidatorContext();

  // widgetOrder with missing and duplicate widgets
  const malformedOrder = ['weather', 'unknown-widget', 'weather'];
  assert.strictEqual(HomebaseValidator.validateKey('widgetOrder', malformedOrder), false);
  const normalizedOrder = Array.from(HomebaseValidator.sanitizeKey('widgetOrder', malformedOrder));
  assert.deepStrictEqual(normalizedOrder, ['weather', 'quote', 'todo', 'news']);

  // Non-array widgetOrder
  assert.strictEqual(HomebaseValidator.validateKey('widgetOrder', 'weather,quote'), false);
  assert.deepStrictEqual(
    Array.from(HomebaseValidator.sanitizeKey('widgetOrder', 'weather,quote', { fallbackToDefault: true })),
    ['weather', 'quote', 'todo', 'news']
  );

  // homebaseRecentSaveFolders capped at 6 and filtered of non-strings
  const recentFoldersInput = ['f1', 123, 'f2', '', 'f3', 'f4', 'f5', 'f6', 'f7', null];
  const sanitizedRecent = Array.from(HomebaseValidator.sanitizeKey('homebaseRecentSaveFolders', recentFoldersInput));
  assert.deepStrictEqual(sanitizedRecent, ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  assert.strictEqual(sanitizedRecent.length, 6);

  // searchEnginesConfig filters invalid objects
  const malformedEngines = [
    { id: 'google', enabled: true },
    { id: '', enabled: false },
    { enabled: true },
    'not-an-object',
    { id: 'duckduckgo', enabled: false }
  ];
  const sanitizedEngines = Array.from(HomebaseValidator.sanitizeKey('searchEnginesConfig', malformedEngines)).map((e) => ({ ...e }));
  assert.deepStrictEqual(sanitizedEngines, [
    { id: 'google', enabled: true },
    { id: 'duckduckgo', enabled: false }
  ]);
});

test('schema-validator: malformed objects and prototype pollution are handled safely', () => {
  const { HomebaseValidator, isPlainObject } = createValidatorContext();

  assert.strictEqual(isPlainObject({}), true);
  assert.strictEqual(isPlainObject([]), false);
  assert.strictEqual(isPlainObject(null), false);
  assert.strictEqual(isPlainObject('string'), false);

  // bookmarkCustomMetadata validation
  assert.strictEqual(HomebaseValidator.validateKey('bookmarkCustomMetadata', 'not-an-object'), false);
  assert.strictEqual(
    HomebaseValidator.sanitizeKey('bookmarkCustomMetadata', 'not-an-object', { fallbackToDefault: false }),
    undefined
  );

  const rawMetadata = {
    'bm-1': { icon: 'data:image/png;base64,abc', customTitle: 'My Title', originalUrl: 'https://example.com' },
    'bm-2': 'corrupted-non-object',
    'bm-3': { customTitle: 'Too Long Title '.repeat(50) }
  };
  const sanitizedMetadata = HomebaseValidator.sanitizeKey('bookmarkCustomMetadata', rawMetadata);
  assert.ok(sanitizedMetadata['bm-1'], 'Valid metadata item preserved');
  assert.strictEqual(sanitizedMetadata['bm-2'], undefined, 'Corrupted metadata entry removed');
  assert.ok(sanitizedMetadata['bm-3'].customTitle.length <= 300, 'Title length bounded');
});

test('schema-validator: sanitizeStorageBatch with corrupted backup payload', () => {
  const { HomebaseValidator } = createValidatorContext();

  const corruptedPayload = JSON.parse(JSON.stringify({
    // Valid values (should be preserved unchanged)
    appShowWeather: false,
    appTimeFormatPreference: '24-hour',
    appSearchDefaultEngine: 'duckduckgo',
    lastUsedBookmarkFolderId: 'folder-123',

    // Recoverable values (should be sanitized/clamped)
    appBackgroundDim: 200, // Clamps to 80
    appBookmarkTextBgOpacity: -5, // Clamps to 0.1
    widgetOrder: ['quote', 'news'], // Appends missing weather, todo
    homebaseRecentSaveFolders: ['1', '2', '3', '4', '5', '6', '7', '8'], // Slices to 6

    // Unrecoverable / dangerous values (should be discarded without fallback)
    appBookmarkTextBgColor: '<script>evil()</script>', // Discarded
    appNewsSource: 'unauthorized-feed', // Discarded
    cachedUnits: 'kelvin', // Discarded
    cachedAppliedPosterDataUrl: 'http://malicious.url/not-data-uri', // Discarded

    // Prototype pollution attempt
    ['__proto__']: { polluted: true },
    constructor: { polluted: true },

    // Unknown future key (should be preserved non-destructively)
    futureFeatureToggleV2: true
  }));

  const sanitized = HomebaseValidator.sanitizeStorageBatch(corruptedPayload, { fallbackToDefault: false });

  // 1. Preserved valid values
  assert.strictEqual(sanitized.appShowWeather, false);
  assert.strictEqual(sanitized.appTimeFormatPreference, '24-hour');
  assert.strictEqual(sanitized.appSearchDefaultEngine, 'duckduckgo');
  assert.strictEqual(sanitized.lastUsedBookmarkFolderId, 'folder-123');

  // 2. Recovered values
  assert.strictEqual(sanitized.appBackgroundDim, 80, 'Dim clamped to 80');
  assert.strictEqual(sanitized.appBookmarkTextBgOpacity, 0.1, 'Opacity clamped to 0.1');
  assert.deepStrictEqual(Array.from(sanitized.widgetOrder), ['quote', 'news', 'weather', 'todo']);
  assert.strictEqual(sanitized.homebaseRecentSaveFolders.length, 6);

  // 3. Discarded unrecoverable / dangerous values
  assert.strictEqual(sanitized.appBookmarkTextBgColor, undefined, 'Invalid color discarded');
  assert.strictEqual(sanitized.appNewsSource, undefined, 'Invalid enum discarded');
  assert.strictEqual(sanitized.cachedUnits, undefined, 'Invalid units discarded');
  assert.strictEqual(sanitized.cachedAppliedPosterDataUrl, undefined, 'Non-data-url poster discarded');

  // 4. Prototype pollution blocked
  assert.strictEqual(Object.prototype.polluted, undefined, 'No prototype pollution');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, '__proto__'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'constructor'), false);

  // 5. Unknown future key preserved
  assert.strictEqual(sanitized.futureFeatureToggleV2, true, 'Future key preserved');
});

test('schema-validator: performance benchmark executes batch under latency budget (< 3ms)', () => {
  const { HomebaseValidator } = createValidatorContext();

  // Create full 74-key payload
  const fullPayload = {};
  for (const [key, def] of Object.entries(HomebaseValidator.SCHEMA_DEFINITIONS)) {
    fullPayload[key] = def.default;
  }

  // Measure 100 consecutive runs
  const iterations = 100;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    HomebaseValidator.sanitizeStorageBatch(fullPayload);
  }
  const totalDuration = performance.now() - start;
  const avgPerRun = totalDuration / iterations;

  // Assert sub-millisecond execution target (< 3ms worst case for Node test environment)
  assert.ok(
    avgPerRun < 3.0,
    `Batch sanitization must execute under 3.0ms (actual average: ${avgPerRun.toFixed(4)}ms)`
  );
});
