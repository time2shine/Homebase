import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const suggestionCacheScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-cache.js');
const suggestionServiceScriptPath = path.join(rootDir, 'src/newtab/search/search-suggestion-service.js');

const suggestionCacheScriptCode = fs.readFileSync(suggestionCacheScriptPath, 'utf8');
const suggestionServiceScriptCode = fs.readFileSync(suggestionServiceScriptPath, 'utf8');

function setupTestEnvironment(customOptions = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    appSearchSuggestionsPreference: true,
    searchEngines: [
      { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=chrome&q=', enabled: true },
      { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?q=', enabled: true },
      { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=', enabled: true },
      { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=', enabled: true },
      { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=', suggestionUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=', enabled: true },
      { id: 'yahoo', name: 'Yahoo', url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&command=', enabled: true },
      { id: 'yandex', name: 'Yandex', url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ya.cgi?v=4&part=', enabled: true },
      { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=', enabled: true }
    ],
    ...customOptions
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  // Load suggestion cache script first (provides window.setSuggestionCacheEntry, window.getSuggestionCacheEntry)
  vm.runInContext(suggestionCacheScriptCode, ctx);

  // Load suggestion service script
  vm.runInContext(suggestionServiceScriptCode, ctx);

  return {
    service: sandbox.HomebaseSearchSuggestionService,
    sandbox
  };
}

// Convert cross-realm VM structures to runner-native plain JS arrays/objects for deepStrictEqual
function toNative(val) {
  if (val === null || val === undefined) return val;
  return JSON.parse(JSON.stringify(val));
}

// 1. Service API Exists
test('search-suggestion-service: Service API exists on window.HomebaseSearchSuggestionService', () => {
  const { service } = setupTestEnvironment();

  assert.ok(service, 'Service should be exported on window');
  assert.strictEqual(typeof service.fetchSuggestions, 'function', 'fetchSuggestions should be a function');
  assert.strictEqual(typeof service.abort, 'function', 'abort should be a function');
  assert.strictEqual(typeof service.normalizeProviderPayload, 'function', 'normalizeProviderPayload should be a function');
  assert.strictEqual(typeof service.getBangMap, 'function', 'getBangMap should be a function');
  assert.strictEqual(typeof service.getBangSuggestions, 'function', 'getBangSuggestions should be a function');
  assert.strictEqual(typeof service.getCacheEntry, 'function', 'getCacheEntry should be a function');
  assert.strictEqual(typeof service.setCacheEntry, 'function', 'setCacheEntry should be a function');
  assert.strictEqual(typeof service.getSuggestionsPreference, 'function', 'getSuggestionsPreference should be a function');
  assert.strictEqual(typeof service.setSuggestionsPreference, 'function', 'setSuggestionsPreference should be a function');
});

// 2. OpenSearch Normalization
test('search-suggestion-service: OpenSearch normalization handles standard and JSON string payloads', () => {
  const { service } = setupTestEnvironment();

  // Array of arrays format
  const rawArray = ['homebase', ['homebase dash', 'homebase extension', 'homebase tab'], [], []];
  const resArray = service.normalizeProviderPayload('Google', rawArray);
  assert.deepStrictEqual(toNative(resArray), ['homebase dash', 'homebase extension', 'homebase tab']);

  // JSON string format
  const rawJsonString = JSON.stringify(['search', ['search 1', 'search 2']]);
  const resString = service.normalizeProviderPayload('Bing', rawJsonString);
  assert.deepStrictEqual(toNative(resString), ['search 1', 'search 2']);

  // Filters non-string items
  const dirty = ['test', ['valid', 123, null, 'another valid']];
  const resDirty = service.normalizeProviderPayload('Wikipedia', dirty);
  assert.deepStrictEqual(toNative(resDirty), ['valid', 'another valid']);

  // Gracefully handles empty or invalid payloads
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Google', null)), []);
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Google', {})), []);
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Google', 'invalid json')), []);
});

// 3. DuckDuckGo Normalization
test('search-suggestion-service: DuckDuckGo normalization extracts phrases properly', () => {
  const { service } = setupTestEnvironment();

  const ddgPayload = [
    { phrase: 'privacy tools' },
    { phrase: 'privacy guides' },
    { phrase: 'privacy badger' }
  ];
  const results = service.normalizeProviderPayload('DuckDuckGo', ddgPayload);
  assert.deepStrictEqual(toNative(results), ['privacy tools', 'privacy guides', 'privacy badger']);

  // JSON string format
  const stringResults = service.normalizeProviderPayload('DuckDuckGo', JSON.stringify(ddgPayload));
  assert.deepStrictEqual(toNative(stringResults), ['privacy tools', 'privacy guides', 'privacy badger']);

  // Filters missing phrase or malformed objects
  const malformed = [{ phrase: 'ok' }, null, { other: 'ignored' }, { phrase: 42 }];
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('DuckDuckGo', malformed)), ['ok']);
});

// 4. Yahoo Normalization
test('search-suggestion-service: Yahoo normalization extracts gossip nodes', () => {
  const { service } = setupTestEnvironment();

  const yahooPayload = {
    gossip: {
      results: [
        {
          nodes: [
            { key: 'yahoo finance' },
            { key: 'yahoo mail' }
          ]
        },
        {
          nodes: [
            { key: 'yahoo fantasy sports' }
          ]
        }
      ]
    }
  };

  const results = service.normalizeProviderPayload('Yahoo', yahooPayload);
  assert.deepStrictEqual(toNative(results), ['yahoo finance', 'yahoo mail', 'yahoo fantasy sports']);

  // Missing or empty gossip structure
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Yahoo', {})), []);
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Yahoo', { gossip: {} })), []);
  assert.deepStrictEqual(toNative(service.normalizeProviderPayload('Yahoo', { gossip: { results: [] } })), []);
});

// 5. Yandex Normalization
test('search-suggestion-service: Yandex normalization parses bucket array', () => {
  const { service } = setupTestEnvironment();

  // Nested pair format: [query, [[type, text], ...]]
  const yandexNested = [
    'weather',
    [
      ['item', 'weather forecast'],
      ['item', 'weather radar'],
      ['item', 'weather today']
    ]
  ];
  const nestedResults = service.normalizeProviderPayload('Yandex', yandexNested);
  assert.deepStrictEqual(toNative(nestedResults), ['weather forecast', 'weather radar', 'weather today']);

  // Flat string array format
  const yandexFlat = ['weather', ['weather nyc', 'weather tomorrow']];
  const flatResults = service.normalizeProviderPayload('Yandex', yandexFlat);
  assert.deepStrictEqual(toNative(flatResults), ['weather nyc', 'weather tomorrow']);

  // JSON stringified format
  const jsonResults = service.normalizeProviderPayload('Yandex', JSON.stringify(yandexFlat));
  assert.deepStrictEqual(toNative(jsonResults), ['weather nyc', 'weather tomorrow']);
});

// 6. Cache Hit Avoids Network Request
test('search-suggestion-service: Cache hit returns cached results and avoids network request', async () => {
  const { service } = setupTestEnvironment();

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return { ok: true, text: async () => JSON.stringify(['q', ['network result']]) };
  };

  const engine = { id: 'google', name: 'Google', suggestionUrl: 'https://example.com/suggest?q=' };

  // Pre-seed cache
  service.setCacheEntry('google:test', ['cached result 1', 'cached result 2']);

  const results = await service.fetchSuggestions('test', engine, { fetch: mockFetch });

  assert.strictEqual(fetchCalled, false, 'Network fetch should not be invoked on cache hit');
  assert.deepStrictEqual(toNative(results), ['cached result 1', 'cached result 2']);
});

// 7. Cache Miss Stores Response
test('search-suggestion-service: Cache miss calls fetch and stores normalized response', async () => {
  const { service } = setupTestEnvironment();

  let fetchCallCount = 0;
  let requestedUrl = '';
  const mockFetch = async (url) => {
    fetchCallCount++;
    requestedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify(['hello', ['hello world', 'hello there']])
    };
  };

  const engine = { id: 'bing', name: 'Bing', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=' };

  // Initial call - cache miss
  const results = await service.fetchSuggestions('hello', engine, { fetch: mockFetch });
  assert.strictEqual(fetchCallCount, 1, 'Network fetch should be called once on miss');
  assert.strictEqual(requestedUrl, 'https://api.bing.com/osjson.aspx?query=hello');
  assert.deepStrictEqual(toNative(results), ['hello world', 'hello there']);

  // Second call with same query - should hit cache
  const cachedResults = await service.fetchSuggestions('hello', engine, { fetch: mockFetch });
  assert.strictEqual(fetchCallCount, 1, 'Network fetch should not be called again');
  assert.deepStrictEqual(toNative(cachedResults), ['hello world', 'hello there']);
});

// 8. Abort Behavior
test('search-suggestion-service: Abort cancels in-flight request silently and returns null', async () => {
  const { service } = setupTestEnvironment();

  let receivedSignal = null;
  const mockFetch = (url, opts) => {
    receivedSignal = opts?.signal;
    return new Promise((resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => {
        const abortErr = new Error('The user aborted a request.');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    });
  };

  const engine = { id: 'google', name: 'Google', suggestionUrl: 'https://example.com/s?q=' };

  const fetchPromise = service.fetchSuggestions('abort-test', engine, { fetch: mockFetch });

  assert.ok(receivedSignal, 'Fetch should receive an abort signal');
  assert.strictEqual(receivedSignal.aborted, false, 'Signal should not be aborted initially');

  // Cancel via service.abort()
  service.abort();
  assert.strictEqual(receivedSignal.aborted, true, 'Signal should be aborted after service.abort()');

  const result = await fetchPromise;
  assert.strictEqual(result, null, 'Aborted fetch should return null without throwing');

  // Calling abort multiple times when idle should be safe and idempotent
  assert.doesNotThrow(() => {
    service.abort();
    service.abort();
  });
});

// 9. Bang Suggestion Matching
test('search-suggestion-service: Bang suggestion matching resolves known bangs and engine IDs', () => {
  const { service, sandbox } = setupTestEnvironment();

  // Exact bang match: !g -> Google
  const googleMatches = service.getBangSuggestions('!g', sandbox.searchEngines);
  assert.ok(Array.isArray(googleMatches));
  assert.ok(googleMatches.length > 0);
  assert.strictEqual(googleMatches[0].bang, 'g');
  assert.strictEqual(googleMatches[0].engine.id, 'google');

  // Multi-char bang: !yt -> YouTube
  const ytMatches = service.getBangSuggestions('!yt', sandbox.searchEngines);
  assert.ok(ytMatches.length > 0);
  assert.strictEqual(ytMatches[0].bang, 'yt');
  assert.strictEqual(ytMatches[0].engine.id, 'youtube');

  // DDG bang: !d -> DuckDuckGo
  const ddgMatches = service.getBangSuggestions('!d', sandbox.searchEngines);
  assert.ok(ddgMatches.length > 0);
  assert.strictEqual(ddgMatches[0].bang, 'd');
  assert.strictEqual(ddgMatches[0].engine.id, 'duckduckgo');

  // Engine ID prefix match: !github -> GitHub
  const ghMatches = service.getBangSuggestions('!github', sandbox.searchEngines);
  assert.ok(ghMatches.length > 0);
  assert.strictEqual(ghMatches[0].engine.id, 'github');

  // Queries not starting with ! return empty array
  assert.deepStrictEqual(toNative(service.getBangSuggestions('not-a-bang')), []);
  assert.deepStrictEqual(toNative(service.getBangSuggestions('')), []);
  assert.deepStrictEqual(toNative(service.getBangSuggestions(null)), []);
});
