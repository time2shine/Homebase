// ===================================================================
// Homebase Search Suggestion Service
// Module: src/newtab/search/search-suggestion-service.js
// Dedicated service for external search engine suggestions fetching,
// provider payload normalization, abort lifecycle, LRU caching,
// and bang shortcut resolution.
// ===================================================================

(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  const DEFAULT_BANG_MAP = Object.freeze({
    g: 'google',
    b: 'bing',
    d: 'duckduckgo',
    y: 'yahoo',
    w: 'wikipedia',
    yt: 'youtube',
    r: 'reddit',
    gh: 'github',
    so: 'stackoverflow',
    amz: 'amazon',
    maps: 'maps',
    ya: 'yandex'
  });

  const OPENSEARCH_NAMES = new Set([
    'google',
    'bing',
    'youtube',
    'wikipedia',
    'amazon',
    'maps',
    'opensearch'
  ]);

  let activeAbortController = null;
  const localMemoryCache = new Map();

  function getSuggestionsPreference() {
    if (typeof globalScope.appSearchSuggestionsPreference !== 'undefined') {
      return globalScope.appSearchSuggestionsPreference !== false;
    }
    return true;
  }

  function setSuggestionsPreference(enabled) {
    const val = enabled !== false;
    if (typeof globalScope.appSearchSuggestionsPreference !== 'undefined') {
      globalScope.appSearchSuggestionsPreference = val;
    }
    if (typeof window !== 'undefined') {
      window.appSearchSuggestionsPreference = val;
    }
  }

  function getCacheEntry(key) {
    if (typeof globalScope.getSuggestionCacheEntry === 'function') {
      try {
        return globalScope.getSuggestionCacheEntry(key);
      } catch (_) {}
    }
    return localMemoryCache.get(key) || null;
  }

  function setCacheEntry(key, val) {
    if (typeof globalScope.setSuggestionCacheEntry === 'function') {
      try {
        globalScope.setSuggestionCacheEntry(key, val);
        return;
      } catch (_) {}
    }
    if (localMemoryCache.size > 150) {
      const oldest = localMemoryCache.keys().next().value;
      if (oldest !== undefined) localMemoryCache.delete(oldest);
    }
    localMemoryCache.set(key, val);
  }

  function abort() {
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch (_) {}
      activeAbortController = null;
    }
  }

  function normalizeProviderPayload(engineName, rawData) {
    if (!rawData) return [];

    let data = rawData;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) {
        return [];
      }
    }

    const key = String(engineName || '').trim().toLowerCase();

    if (OPENSEARCH_NAMES.has(key)) {
      return Array.isArray(data) && Array.isArray(data[1])
        ? data[1].filter((val) => typeof val === 'string')
        : [];
    }

    if (key === 'duckduckgo') {
      return Array.isArray(data)
        ? data.map((item) => item && item.phrase).filter((val) => typeof val === 'string')
        : [];
    }

    if (key === 'yahoo') {
      const yahooResults = data?.gossip?.results;
      if (Array.isArray(yahooResults)) {
        return yahooResults
          .flatMap((entry) => (entry?.nodes || []).map((node) => node && node.key))
          .filter((val) => typeof val === 'string');
      }
      return [];
    }

    if (key === 'yandex') {
      const bucket = Array.isArray(data) && data.length > 1 ? data[1] : [];
      return Array.isArray(bucket)
        ? bucket
            .map((item) => {
              if (Array.isArray(item)) {
                return typeof item[1] === 'string'
                  ? item[1]
                  : (typeof item[0] === 'string' ? item[0] : '');
              }
              return item;
            })
            .filter((val) => typeof val === 'string' && val.length > 0)
        : [];
    }

    // Generic fallback: check for OpenSearch array or string list
    if (Array.isArray(data)) {
      if (Array.isArray(data[1])) {
        return data[1].filter((val) => typeof val === 'string');
      }
      return data.filter((val) => typeof val === 'string');
    }

    return [];
  }

  async function fetchSuggestions(query, engine, options = {}) {
    if (typeof globalScope.isBrowserDefaultSearch === 'function' && globalScope.isBrowserDefaultSearch()) return [];
    if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) return [];
    if (!getSuggestionsPreference()) return [];
    if (!query || typeof query !== 'string') return [];
    if (!engine || !engine.suggestionUrl) return [];

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const cacheKey = `${engine.id || ''}:${trimmedQuery}`;
    const cached = getCacheEntry(cacheKey);
    if (cached) {
      return cached;
    }

    abort();

    const fetchFn = options.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
      return [];
    }

    const ControllerClass = options.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);
    activeAbortController = ControllerClass ? new ControllerClass() : null;
    const signal = options.signal || (activeAbortController ? activeAbortController.signal : undefined);

    try {
      const url = engine.suggestionUrl + encodeURIComponent(trimmedQuery);
      const res = await fetchFn(url, { signal });
      if (!res || !res.ok) return [];

      let rawData;
      if (typeof res.text === 'function') {
        const text = await res.text();
        try {
          rawData = JSON.parse(text);
        } catch (_) {
          rawData = text;
        }
      } else if (typeof res.json === 'function') {
        rawData = await res.json();
      } else {
        rawData = res;
      }

      const results = normalizeProviderPayload(engine.name || engine.id, rawData);
      setCacheEntry(cacheKey, results);
      return results;
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.code === 20)) {
        return null;
      }
      return [];
    } finally {
      if (activeAbortController && activeAbortController.signal === signal) {
        activeAbortController = null;
      }
    }
  }

  function getBangMap() {
    if (typeof globalScope.bangMap !== 'undefined' && globalScope.bangMap) {
      return globalScope.bangMap;
    }
    return DEFAULT_BANG_MAP;
  }

  function getBangSuggestions(query, engines = []) {
    if (typeof globalScope.isBrowserDefaultSearch === 'function' && globalScope.isBrowserDefaultSearch()) return [];
    if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) return [];
    if (!query || typeof query !== 'string' || !query.startsWith('!')) {
      return [];
    }

    const term = query.substring(1).toLowerCase().trim();
    const matches = [];
    const seenIds = new Set();
    const map = getBangMap();
    const engineList = Array.isArray(engines) && engines.length > 0
      ? engines
      : (Array.isArray(globalScope.searchEngines)
          ? globalScope.searchEngines
          : (typeof globalScope.HomebaseSearchStorage?.getSearchEngines === 'function'
              ? globalScope.HomebaseSearchStorage.getSearchEngines()
              : []));

    Object.entries(map).forEach(([bang, engineId]) => {
      if (bang.startsWith(term)) {
        const engine = engineList.find((e) => e.id === engineId);
        if (engine) {
          matches.push({ bang, engine });
          seenIds.add(engineId);
        }
      }
    });

    engineList.forEach((engine) => {
      if (!engine || !engine.id) return;
      const isMatch = engine.id.startsWith(term);
      if (isMatch && !matches.find((m) => m.engine.id === engine.id && m.bang === engine.id) && !seenIds.has(engine.id)) {
        matches.push({ bang: engine.id, engine });
      }
    });

    return matches.sort((a, b) => {
      if (a.bang === term) return -1;
      if (b.bang === term) return 1;
      return a.bang.localeCompare(b.bang);
    });
  }

  const HomebaseSearchSuggestionService = {
    fetchSuggestions,
    abort,
    normalizeProviderPayload,
    getBangMap,
    getBangSuggestions,
    getCacheEntry,
    setCacheEntry,
    getSuggestionsPreference,
    setSuggestionsPreference
  };

  if (globalScope) {
    globalScope.HomebaseSearchSuggestionService = HomebaseSearchSuggestionService;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomebaseSearchSuggestionService;
  }
})();
