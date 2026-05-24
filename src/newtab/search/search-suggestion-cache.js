const MAX_SUGGESTION_CACHE_ENTRIES = 150;

const suggestionCache = new Map();

function setSuggestionCacheEntry(cacheKey, results) {

  if (!appSearchSuggestionsPreference) return;

  if (!cacheKey) return;

  if (!Array.isArray(results)) return;

  if (suggestionCache.has(cacheKey)) {

    suggestionCache.delete(cacheKey);

  }

  suggestionCache.set(cacheKey, results);

  while (suggestionCache.size > MAX_SUGGESTION_CACHE_ENTRIES) {

    const oldestKey = suggestionCache.keys().next().value;

    if (oldestKey === undefined) break;

    suggestionCache.delete(oldestKey);

  }

}

function getSuggestionCacheEntry(cacheKey) {

  if (!appSearchSuggestionsPreference) return null;

  if (!cacheKey) return null;

  if (!suggestionCache.has(cacheKey)) return null;

  const cached = suggestionCache.get(cacheKey);

  suggestionCache.delete(cacheKey);

  setSuggestionCacheEntry(cacheKey, cached);

  return cached;

}
