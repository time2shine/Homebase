/**
 * Homebase Search Interaction & Suggestions Controller
 * Manages search input handling, keyboard navigation, suggestion fetching,
 * bang routing, calculation handling, selection state, and result execution.
 */
(function() {
  'use strict';

  // Local state tracking
  let currentSelectionIndex = -1;
  let currentSectionIndex = 0; // 0 = bookmarks, 1 = suggestions
  let selectionExplicit = false;
  let lastSelectedText = '';
  let userIsTyping = false;
  let latestSearchToken = 0;
  let lastBookmarkHtml = '';
  let lastSuggestionHtml = '';
  let searchNavigationLocked = false;
  let isBookmarkGridPointerOver = false;
  let bookmarkGridPointerListenersAttached = false;
  let boundGridPointerEnterHandler = null;
  let boundGridPointerLeaveHandler = null;
  let trackedGridEl = null;
  let boundEventListeners = false;
  let boundFormSubmitHandler = null;
  let boundInputHandler = null;
  let boundInputClickHandler = null;
  let boundCompositionStartHandler = null;
  let boundCompositionEndHandler = null;
  let boundWindowBlurHandler = null;
  let boundPanelMousedownHandler = null;
  let boundPanelClickHandler = null;
  let boundPanelStopHandler = null;
  let boundKeydownHandler = null;
  let boundQuickFocusHandler = null;
  let boundBeforeUnloadHandler = null;
  let isComposingInput = false;
  let enterKeyHandled = false;
  let customOptions = {};

  function isElementOrObject(obj) {
    if (!obj) return false;
    if (typeof Element !== 'undefined' && obj instanceof Element) return true;
    return typeof obj === 'object';
  }

  // DOM element accessors
  function getSearchForm() {
    if (customOptions.searchForm) return customOptions.searchForm;
    if (typeof searchForm !== 'undefined' && searchForm) return searchForm;
    return document.getElementById('search-form');
  }

  function getSearchInput() {
    if (customOptions.searchInput) return customOptions.searchInput;
    if (typeof searchInput !== 'undefined' && searchInput) return searchInput;
    return document.getElementById('search-input');
  }

  function getSearchResultsPanel() {
    if (customOptions.searchResultsPanel) return customOptions.searchResultsPanel;
    if (typeof searchResultsPanel !== 'undefined' && searchResultsPanel) return searchResultsPanel;
    return document.getElementById('search-results-panel');
  }

  function getBookmarkResultsContainer() {
    if (customOptions.bookmarkResultsContainer) return customOptions.bookmarkResultsContainer;
    if (typeof bookmarkResultsContainer !== 'undefined' && bookmarkResultsContainer) return bookmarkResultsContainer;
    return document.getElementById('bookmark-results-container');
  }

  function getSuggestionResultsContainer() {
    if (customOptions.suggestionResultsContainer) return customOptions.suggestionResultsContainer;
    if (typeof suggestionResultsContainer !== 'undefined' && suggestionResultsContainer) return suggestionResultsContainer;
    return document.getElementById('suggestion-results-container');
  }

  function getSearchWidget() {
    if (customOptions.searchWidget) return customOptions.searchWidget;
    if (typeof searchWidget !== 'undefined' && searchWidget) return searchWidget;
    return document.querySelector('.widget-search');
  }

  function getSearchAreaWrapper() {
    if (customOptions.searchAreaWrapper) return customOptions.searchAreaWrapper;
    if (typeof searchAreaWrapper !== 'undefined' && searchAreaWrapper) return searchAreaWrapper;
    return document.querySelector('.search-area-wrapper');
  }

  function getSuggestionsToggle() {
    if (customOptions.suggestionsToggle) return customOptions.suggestionsToggle;
    if (typeof appSearchSuggestionsToggle !== 'undefined' && appSearchSuggestionsToggle) return appSearchSuggestionsToggle;
    return document.getElementById('setting-search-suggestions') || document.getElementById('app-search-suggestions-toggle');
  }

  function getResultSections() {
    const bookmarks = getBookmarkResultsContainer();
    const suggestions = getSuggestionResultsContainer();
    return [bookmarks, suggestions];
  }

  // Preference accessors
  function getSearchOpenNewTabPreference() {
    if (typeof appSearchOpenNewTabPreference !== 'undefined') return Boolean(appSearchOpenNewTabPreference);
    if (typeof window !== 'undefined' && typeof window.appSearchOpenNewTabPreference !== 'undefined') {
      return Boolean(window.appSearchOpenNewTabPreference);
    }
    return false;
  }

  function getSearchMathPreference() {
    if (typeof appSearchMathPreference !== 'undefined') return Boolean(appSearchMathPreference);
    if (typeof window !== 'undefined' && typeof window.appSearchMathPreference !== 'undefined') {
      return Boolean(window.appSearchMathPreference);
    }
    return true;
  }

  function getSearchShowHistoryPreference() {
    if (typeof appSearchShowHistoryPreference !== 'undefined') return Boolean(appSearchShowHistoryPreference);
    if (typeof window !== 'undefined' && typeof window.appSearchShowHistoryPreference !== 'undefined') {
      return Boolean(window.appSearchShowHistoryPreference);
    }
    return false;
  }

  function getSearchSuggestionsPreference() {
    if (typeof appSearchSuggestionsPreference !== 'undefined') return appSearchSuggestionsPreference !== false;
    if (typeof window !== 'undefined' && typeof window.appSearchSuggestionsPreference !== 'undefined') {
      return window.appSearchSuggestionsPreference !== false;
    }
    return true;
  }

  function setSuggestionsPreference(enabled) {
    const val = enabled !== false;
    if (typeof appSearchSuggestionsPreference !== 'undefined') {
      appSearchSuggestionsPreference = val;
    }
    if (typeof window !== 'undefined') {
      window.appSearchSuggestionsPreference = val;
    }
    const toggle = getSuggestionsToggle();
    if (toggle) {
      toggle.checked = val;
    }
    if (!val) {
      abortSuggestionFetch();
      if (typeof suggestionCache !== 'undefined' && suggestionCache?.clear) {
        suggestionCache.clear();
      }
      clearExternalSuggestionResults();
    }
    return val;
  }

  // Data helpers
  function getSearchEngines() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.getSearchEngines === 'function') {
      return window.HomebaseSearchUiController.getSearchEngines();
    }
    if (typeof searchEngines !== 'undefined' && Array.isArray(searchEngines)) {
      return searchEngines;
    }
    if (typeof window !== 'undefined' && Array.isArray(window.searchEngines)) {
      return window.searchEngines;
    }
    return [];
  }

  function getCurrentSearchEngine() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.getCurrentSearchEngine === 'function') {
      return window.HomebaseSearchUiController.getCurrentSearchEngine();
    }
    if (typeof currentSearchEngine !== 'undefined' && currentSearchEngine) {
      return currentSearchEngine;
    }
    if (typeof window !== 'undefined' && window.currentSearchEngine) {
      return window.currentSearchEngine;
    }
    const engines = getSearchEngines();
    return engines.find(e => e.enabled) || engines[0] || { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' };
  }

  function getActiveSearchEngineId() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.getActiveSearchEngineId === 'function') {
      return window.HomebaseSearchUiController.getActiveSearchEngineId();
    }
    if (typeof activeSearchEngineId !== 'undefined' && activeSearchEngineId) {
      return activeSearchEngineId;
    }
    return null;
  }

  function getBangMap() {
    if (typeof window !== 'undefined' && window.HomebaseSearchSuggestionService && typeof window.HomebaseSearchSuggestionService.getBangMap === 'function') {
      return window.HomebaseSearchSuggestionService.getBangMap();
    }
    if (typeof bangMap !== 'undefined' && bangMap) {
      return bangMap;
    }
    if (typeof window !== 'undefined' && window.bangMap) {
      return window.bangMap;
    }
    return {
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
    };
  }

  function getAllBookmarks() {
    if (typeof allBookmarks !== 'undefined' && Array.isArray(allBookmarks)) {
      return allBookmarks;
    }
    if (typeof window !== 'undefined' && Array.isArray(window.allBookmarks)) {
      return window.allBookmarks;
    }
    return [];
  }

  function callUpdateSearchUI(engineId, options = {}) {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.updateSearchUI === 'function') {
      return window.HomebaseSearchUiController.updateSearchUI(engineId, options);
    }
    if (typeof updateSearchUI === 'function') {
      return updateSearchUI(engineId, options);
    }
  }

  function callClearSearchUI(options = {}) {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.clearSearchUI === 'function') {
      return window.HomebaseSearchUiController.clearSearchUI(options);
    }
    if (typeof clearSearchUI === 'function') {
      return clearSearchUI(options);
    }
    const input = getSearchInput();
    if (options.clearInput && input) input.value = '';
    if (options.abortSuggestions) abortSuggestionFetch();
  }

  function callHideSearchResultsPanel() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.hideSearchResultsPanel === 'function') {
      return window.HomebaseSearchUiController.hideSearchResultsPanel();
    }
    if (typeof hideSearchResultsPanel === 'function') {
      return hideSearchResultsPanel();
    }
    const panel = getSearchResultsPanel();
    if (panel) panel.classList.add('hidden');
    const widget = getSearchWidget();
    if (widget) widget.classList.remove('results-open');
  }

  function callCycleSearchEngine(direction) {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.cycleSearchEngine === 'function') {
      return window.HomebaseSearchUiController.cycleSearchEngine(direction);
    }
    if (typeof cycleSearchEngine === 'function') {
      return cycleSearchEngine(direction);
    }
  }

  function callHandleSearchChange() {
    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleSearchChange === 'function') {
      return window.HomebaseSearchUiController.handleSearchChange();
    }
    if (typeof handleSearchChange === 'function') {
      return handleSearchChange();
    }
  }

  function checkIsLikelyUrl(str) {
    if (typeof isLikelyUrl === 'function') return isLikelyUrl(str);
    if (typeof window !== 'undefined' && typeof window.isLikelyUrl === 'function') return window.isLikelyUrl(str);
    return false;
  }

  function getCacheEntry(key) {
    if (typeof getSuggestionCacheEntry === 'function') return getSuggestionCacheEntry(key);
    if (typeof window !== 'undefined' && typeof window.getSuggestionCacheEntry === 'function') return window.getSuggestionCacheEntry(key);
    return null;
  }

  function setCacheEntry(key, val) {
    if (typeof setSuggestionCacheEntry === 'function') return setSuggestionCacheEntry(key, val);
    if (typeof window !== 'undefined' && typeof window.setSuggestionCacheEntry === 'function') return window.setSuggestionCacheEntry(key, val);
  }

  function getRenderer() {
    if (customOptions && customOptions.renderer) {
      return customOptions.renderer;
    }
    if (typeof window !== 'undefined' && window.HomebaseSearchResultsRenderer) {
      return window.HomebaseSearchResultsRenderer;
    }
    if (typeof HomebaseSearchResultsRenderer !== 'undefined') {
      return HomebaseSearchResultsRenderer;
    }
    return null;
  }


  // --- Bookmark Grid Scroll Support ---
  function isBookmarkGridScrollKey(key) {
    return key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      key === 'PageDown' ||
      key === 'PageUp' ||
      key === 'Home' ||
      key === 'End';
  }

  function isSearchInputEmptyAndPassive() {
    const input = getSearchInput();
    if (!input) return false;
    if (typeof document !== 'undefined' && document.activeElement !== input) return false;
    if ((input.value || '').trim() !== '') return false;
    const panel = getSearchResultsPanel();
    return !panel || panel.classList.contains('hidden');
  }

  function getBookmarkScrollContainer() {
    if (typeof virtualizerState !== 'undefined' && virtualizerState && virtualizerState.mainContentEl) {
      return virtualizerState.mainContentEl;
    }
    const grid = (typeof bookmarksGridEl !== 'undefined' && bookmarksGridEl) ||
      (typeof document !== 'undefined' ? document.getElementById('bookmarks-grid') : null);
    if (grid) return grid.closest ? (grid.closest('.main-content') || grid) : grid;
    return typeof document !== 'undefined' ? document.querySelector('.main-content') : null;
  }

  function isPointerOverBookmarkGrid() {
    const grid = (typeof bookmarksGridEl !== 'undefined' && bookmarksGridEl) ||
      (typeof document !== 'undefined' ? document.getElementById('bookmarks-grid') : null);
    if (!grid || grid.hidden || (grid.classList && grid.classList.contains('hidden'))) return false;
    if (!getBookmarkScrollContainer()) return false;
    return isBookmarkGridPointerOver || (typeof grid.matches === 'function' && grid.matches(':hover'));
  }

  function scrollBookmarkGridForKey(key) {
    const container = getBookmarkScrollContainer();
    if (!container) return;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const arrowStep = Math.max(40, Math.round(container.clientHeight * 0.1));
    const pageStep = Math.max(arrowStep, Math.round(container.clientHeight * 0.9));
    let nextScrollTop = container.scrollTop;

    switch (key) {
      case 'ArrowDown':
        nextScrollTop += arrowStep;
        break;
      case 'ArrowUp':
        nextScrollTop -= arrowStep;
        break;
      case 'PageDown':
        nextScrollTop += pageStep;
        break;
      case 'PageUp':
        nextScrollTop -= pageStep;
        break;
      case 'Home':
        nextScrollTop = 0;
        break;
      case 'End':
        nextScrollTop = maxScrollTop;
        break;
      default:
        return;
    }
    container.scrollTop = Math.min(maxScrollTop, Math.max(0, nextScrollTop));
  }

  function setupBookmarkGridPointerTracking() {
    const grid = (typeof bookmarksGridEl !== 'undefined' && bookmarksGridEl) ||
      (typeof document !== 'undefined' ? document.getElementById('bookmarks-grid') : null);
    if (!grid || bookmarkGridPointerListenersAttached || typeof grid.addEventListener !== 'function') return;

    boundGridPointerEnterHandler = () => {
      isBookmarkGridPointerOver = true;
    };
    boundGridPointerLeaveHandler = () => {
      isBookmarkGridPointerOver = false;
    };

    grid.addEventListener('pointerenter', boundGridPointerEnterHandler);
    grid.addEventListener('pointerleave', boundGridPointerLeaveHandler);
    trackedGridEl = grid;
    bookmarkGridPointerListenersAttached = true;
  }

  // --- Context & Selection Helpers ---
  function isSearchKeyboardContext(event) {
    if (!event || !event.target || !isElementOrObject(event.target)) return false;
    if (event.isComposing || event.keyCode === 229 || isComposingInput) return false;
    const panel = getSearchResultsPanel();
    if (!panel || (panel.classList && panel.classList.contains('hidden'))) return false;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'PageDown':
      case 'PageUp':
      case 'Tab':
      case 'Enter':
      case 'Escape':
        break;
      default:
        return false;
    }

    const target = event.target;
    const widget = getSearchWidget();
    const input = getSearchInput();
    const wrapper = getSearchAreaWrapper();

    const inSearchWidget = widget && typeof widget.contains === 'function' && widget.contains(target);
    const inSearchInput = input && typeof input.contains === 'function' && input.contains(target);
    const inSearchResults = panel && typeof panel.contains === 'function' && panel.contains(target);
    const inSearchWrapper = wrapper && typeof wrapper.contains === 'function' && wrapper.contains(target);

    return Boolean(
      (inSearchWidget || inSearchInput || inSearchResults) &&
      (!wrapper || inSearchWrapper)
    );
  }

  function getCurrentSectionItems(sectionIndex = currentSectionIndex) {
    const sections = getResultSections();
    const section = sections[sectionIndex];
    if (!section || typeof section.querySelectorAll !== 'function') return [];
    return Array.from(section.querySelectorAll('.result-item'));
  }

  function removeSelectionClasses() {
    const sections = getResultSections();
    sections.forEach(section => {
      if (!section || typeof section.querySelectorAll !== 'function') return;
      section.querySelectorAll('.selected').forEach(el => {
        if (el && el.classList) el.classList.remove('selected');
        if (el && typeof el.setAttribute === 'function') el.setAttribute('aria-selected', 'false');
      });
    });
  }

  function updateActiveDescendant(target) {
    const input = getSearchInput();
    if (!input) return;
    if (target && target.id && typeof input.setAttribute === 'function') {
      input.setAttribute('aria-activedescendant', target.id);
    } else if (typeof input.removeAttribute === 'function') {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function clearAllSelections() {
    removeSelectionClasses();
    currentSelectionIndex = -1;
    selectionExplicit = false;
    updateActiveDescendant(null);
  }

  function syncSearchInputWithItem(item) {
    if (!item || userIsTyping || !selectionExplicit) return;
    const input = getSearchInput();
    if (!input) return;
    const label = item.querySelector ? item.querySelector('.result-label') : null;
    if (label && label.textContent) {
      input.value = label.textContent;
    }
  }

  function getResultLabelText(item) {
    if (!item) return '';
    const label = item.querySelector ? item.querySelector('.result-label') : null;
    if (label && label.textContent) return label.textContent.trim();
    return (item.textContent || '').trim();
  }

  function selectItem(targetOrItems, indexOrExplicit, explicitParam) {
    if (Array.isArray(targetOrItems)) {
      const items = targetOrItems;
      const index = typeof indexOrExplicit === 'number' ? indexOrExplicit : 0;
      if (typeof explicitParam === 'boolean') {
        selectionExplicit = explicitParam;
      }
      if (!items.length) return;

      let nextIndex = index;
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;

      removeSelectionClasses();
      const target = items[nextIndex];
      if (target && target.classList) {
        target.classList.add('selected');
        if (typeof target.setAttribute === 'function') {
          target.setAttribute('aria-selected', 'true');
        }
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
        currentSelectionIndex = nextIndex;
        lastSelectedText = getResultLabelText(target);
        updateActiveDescendant(target);
        syncSearchInputWithItem(target);
      }
      return;
    }

    const item = targetOrItems;
    if (!item || !isElementOrObject(item) || !item.classList) return;
    if (typeof indexOrExplicit === 'boolean') {
      selectionExplicit = indexOrExplicit;
    }
    removeSelectionClasses();
    item.classList.add('selected');
    if (typeof item.setAttribute === 'function') {
      item.setAttribute('aria-selected', 'true');
    }
    if (typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }

    const sections = getResultSections();
    const sIndex = sections.findIndex(s => s && typeof s.contains === 'function' && s.contains(item));
    if (sIndex !== -1) {
      currentSectionIndex = sIndex;
      const items = Array.from(sections[sIndex].querySelectorAll('.result-item'));
      currentSelectionIndex = items.indexOf(item);
    }
    lastSelectedText = getResultLabelText(item);
    updateActiveDescendant(item);
    syncSearchInputWithItem(item);
  }

  function attachHoverSync() {
    const sections = getResultSections();
    sections.forEach((section, sectionIndex) => {
      if (!section || typeof section.querySelectorAll !== 'function') return;
      const items = Array.from(section.querySelectorAll('.result-item'));
      items.forEach((item, index) => {
        if (!item || !item.dataset || item.dataset.hoverBound === '1') return;
        item.dataset.hoverBound = '1';
        if (typeof item.addEventListener === 'function') {
          item.addEventListener('mouseenter', () => {
            userIsTyping = false;
            removeSelectionClasses();
            selectionExplicit = false;
            if (item.classList) item.classList.add('selected');
            currentSectionIndex = sectionIndex;
            currentSelectionIndex = index;
            lastSelectedText = getResultLabelText(item);
          });
        }
      });
    });
  }

  function moveSection(direction) {
    const sections = getResultSections();
    const totalSections = sections.length;
    if (!totalSections) return;

    for (let i = 0; i < totalSections; i++) {
      currentSectionIndex = (currentSectionIndex + direction + totalSections) % totalSections;
      const newItems = getCurrentSectionItems(currentSectionIndex);
      if (newItems.length) {
        currentSelectionIndex = 0;
        selectItem(newItems, 0);
        return;
      }
    }

    clearAllSelections();
    currentSectionIndex = 0;
  }

  function getSelectedResult() {
    const panel = getSearchResultsPanel();
    if (!panel || typeof panel.querySelector !== 'function') return null;
    const selected = panel.querySelector('.result-item.selected');
    if (!selected) return null;
    if (!selectionExplicit) return null;
    return selected;
  }

  function getSelectionSnapshot() {
    const panel = getSearchResultsPanel();
    if (!panel || typeof panel.querySelector !== 'function') return null;
    const selected = panel.querySelector('.result-item.selected');
    if (!selected) return null;

    const url = selected.dataset?.url || (typeof selected.getAttribute === 'function' ? selected.getAttribute('href') : '') || '';
    const text = (selected.textContent || '').trim();
    const sections = getResultSections();
    const sectionIndex = sections.findIndex(section => section && typeof section.contains === 'function' && section.contains(selected));
    const itemIndex = sectionIndex > -1
      ? Array.from(sections[sectionIndex].querySelectorAll('.result-item')).indexOf(selected)
      : -1;

    return { sectionIndex, url, text, itemIndex };
  }

  function restoreSelectionAfterFilter() {
    if (!lastSelectedText) return false;
    const panel = getSearchResultsPanel();
    if (!panel || typeof panel.querySelectorAll !== 'function') return false;
    const items = Array.from(panel.querySelectorAll('.result-item'));
    const sections = getResultSections();

    for (let i = 0; i < items.length; i++) {
      const text = getResultLabelText(items[i]);
      if (text.toLowerCase() === lastSelectedText.toLowerCase()) {
        removeSelectionClasses();
        items[i].classList.add('selected');
        const sectionIndex = sections.findIndex(section => section && typeof section.contains === 'function' && section.contains(items[i]));
        if (sectionIndex !== -1) {
          currentSectionIndex = sectionIndex;
          currentSelectionIndex = Array.from(sections[sectionIndex].querySelectorAll('.result-item')).indexOf(items[i]);
          lastSelectedText = text;
          if (typeof items[i].scrollIntoView === 'function') {
            items[i].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
          }
          syncSearchInputWithItem(items[i]);
          return true;
        }
      }
    }
    return false;
  }

  function maybeAutoSelectSuggestion(query) {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 2) return;

    const bookmarksContainer = getBookmarkResultsContainer();
    const suggestionsContainer = getSuggestionResultsContainer();
    const bookmarks = bookmarksContainer && typeof bookmarksContainer.querySelectorAll === 'function'
      ? bookmarksContainer.querySelectorAll('.result-item')
      : [];
    const suggestions = suggestionsContainer && typeof suggestionsContainer.querySelectorAll === 'function'
      ? suggestionsContainer.querySelectorAll('.result-item')
      : [];

    if (bookmarks.length > 0) return;
    if (suggestions.length === 0) return;

    const first = suggestions[0];
    const text = getResultLabelText(first);
    if (text.toLowerCase() === trimmed.toLowerCase()) return;

    removeSelectionClasses();
    currentSectionIndex = 1;
    currentSelectionIndex = 0;
    selectionExplicit = false;

    if (first && first.classList) {
      first.classList.add('selected');
      if (typeof first.scrollIntoView === 'function') {
        first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    }
  }

  function applySelectionToCurrentResults(snapshotOrOptions = null, maybeQuery = '') {
    let snapshot = null;
    let query = '';
    if (snapshotOrOptions && typeof snapshotOrOptions === 'object' && ('snapshot' in snapshotOrOptions || 'query' in snapshotOrOptions)) {
      snapshot = snapshotOrOptions.snapshot || null;
      query = snapshotOrOptions.query || '';
    } else {
      snapshot = snapshotOrOptions;
      query = maybeQuery || '';
    }

    const sections = getResultSections().map(section =>
      (section && typeof section.querySelectorAll === 'function') ? Array.from(section.querySelectorAll('.result-item')) : []
    );
    const bookmarkItems = sections[0] || [];
    const suggestionItems = sections[1] || [];

    const hasAnyItems = sections.some(list => list.length > 0);
    if (!hasAnyItems) {
      clearAllSelections();
      currentSectionIndex = 0;
      return;
    }

    if (!sections[currentSectionIndex] || !sections[currentSectionIndex].length) {
      const nextIndex = sections.findIndex(list => list.length > 0);
      if (nextIndex !== -1) {
        currentSectionIndex = nextIndex;
      }
    }

    let restored = false;
    if (snapshot) {
      for (let sIndex = 0; sIndex < sections.length; sIndex++) {
        const list = sections[sIndex];
        if (!list.length) continue;
        let matchIndex = -1;

        if (snapshot.url) {
          matchIndex = list.findIndex(item => (item.dataset?.url || (typeof item.getAttribute === 'function' ? item.getAttribute('href') : '') || '') === snapshot.url);
        }
        if (matchIndex === -1 && snapshot.text) {
          matchIndex = list.findIndex(item => (item.textContent || '').trim() === snapshot.text);
        }

        if (matchIndex !== -1) {
          currentSectionIndex = sIndex;
          currentSelectionIndex = matchIndex;
          lastSelectedText = getResultLabelText(list[matchIndex]);
          restored = true;
          break;
        }
      }
    }

    if (!restored) {
      restored = restoreSelectionAfterFilter();
    }

    let currentItems = sections[currentSectionIndex] || [];
    if (currentSelectionIndex >= currentItems.length) {
      currentSelectionIndex = -1;
    }

    removeSelectionClasses();

    if (currentSelectionIndex >= 0 && currentItems[currentSelectionIndex]) {
      const targetItem = currentItems[currentSelectionIndex];
      if (targetItem.classList) {
        targetItem.classList.add('selected');
      }
      if (typeof targetItem.setAttribute === 'function') {
        targetItem.setAttribute('aria-selected', 'true');
      }
      if (typeof targetItem.scrollIntoView === 'function') {
        targetItem.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
      lastSelectedText = getResultLabelText(targetItem);
      updateActiveDescendant(targetItem);
      syncSearchInputWithItem(targetItem);
    } else {
      currentSelectionIndex = -1;
      updateActiveDescendant(null);
    }

    if (currentSelectionIndex === -1 && bookmarkItems.length === 0 && suggestionItems.length > 0) {
      maybeAutoSelectSuggestion(query);
    }
  }

  // --- Search Execution & Navigation ---
  async function openSearchUrl(url, newTab) {
    if (!url) return;
    const isPrivileged = url.startsWith('about:') || url.startsWith('view-source:');
    if (isPrivileged) {
      if (typeof window !== 'undefined' && window.location) {
        window.location.href = url;
      }
      return;
    }

    const shouldOpenNewTab = (typeof newTab === 'boolean') ? newTab : getSearchOpenNewTabPreference();
    if (shouldOpenNewTab) {
      callClearSearchUI({ abortSuggestions: true, bumpToken: true });
      callHideSearchResultsPanel();
      try {
        if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.create === 'function') {
          await browser.tabs.create({ url, active: true });
        } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(url, '_blank');
        }
      } catch (err) {
        console.warn('Failed to open search result', err);
      }
      return;
    }

    const clearOnLeave = () => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          const input = getSearchInput();
          if (input) input.value = '';
          callHideSearchResultsPanel();
        });
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', clearOnLeave, { once: true });
    }

    try {
      if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.update === 'function') {
        await browser.tabs.update({ url });
      } else if (typeof window !== 'undefined' && window.location) {
        window.location.href = url;
      }
    } catch (err) {
      console.warn('Navigation failed (likely privileged URL), falling back to new tab:', err);
      try {
        if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.create === 'function') {
          await browser.tabs.create({ url, active: true });
          callClearSearchUI({ abortSuggestions: true, bumpToken: true });
          callHideSearchResultsPanel();
        } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(url, '_blank');
        }
      } catch (createErr) {
        console.error('Failed to open fallback tab', createErr);
      }
    }
  }

  function handleSearchApiFailure(err) {
    const message = 'Search failed: Browser search service is unavailable.';
    if (typeof showCustomAlert === 'function') {
      showCustomAlert(message);
    } else if (typeof window !== 'undefined' && typeof window.showCustomAlert === 'function') {
      window.showCustomAlert(message);
    } else if (typeof alert === 'function') {
      alert(message);
    }
  }

  async function executeSearch(query, engineOrNewTab, maybeNewTab) {
    const originalQuery = (query || '').trim();
    if (!originalQuery) return;

    let engine = null;
    let newTab = undefined;
    if (typeof engineOrNewTab === 'boolean') {
      newTab = engineOrNewTab;
    } else if (engineOrNewTab && typeof engineOrNewTab === 'object') {
      engine = engineOrNewTab;
      newTab = maybeNewTab;
    } else {
      newTab = maybeNewTab;
    }

    let effectiveQuery = originalQuery;

    if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) {
      if (checkIsLikelyUrl(effectiveQuery)) {
        let url = effectiveQuery;
        const hasProtocol = /^[a-z][a-z0-9+.-]+:/i.test(effectiveQuery) && !effectiveQuery.startsWith('localhost:');
        if (!hasProtocol) {
          const isLocal = effectiveQuery.startsWith('localhost') ||
            /^(\d{1,3}\.){3}\d{1,3}/.test(effectiveQuery) ||
            effectiveQuery.indexOf('.') === -1;
          url = isLocal ? `http://${url}` : `https://${url}`;
        }
        openSearchUrl(url, newTab);
        return;
      }

      const shouldOpenNewTab = (typeof newTab === 'boolean') ? newTab : getSearchOpenNewTabPreference();
      const disposition = shouldOpenNewTab ? 'NEW_TAB' : 'CURRENT_TAB';

      callClearSearchUI({ abortSuggestions: true, bumpToken: true });
      callHideSearchResultsPanel();

      const chromeApi = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
      const searchApi = chromeApi && chromeApi.search;

      if (!searchApi || typeof searchApi.query !== 'function') {
        handleSearchApiFailure(new Error('Browser search API is not available.'));
        return;
      }

      try {
        const queryPromise = searchApi.query({ text: effectiveQuery, disposition });
        if (queryPromise && typeof queryPromise.then === 'function') {
          await queryPromise;
        }
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          throw new Error(chromeApi.runtime.lastError.message || 'chrome.search.query failed');
        }
      } catch (err) {
        console.error('chrome.search.query failed:', err);
        handleSearchApiFailure(err);
      }
      return;
    }

    const bangMatch = originalQuery.match(/^!(\S+)\s+(.*)/);
    if (bangMatch) {
      const rawBang = bangMatch[1].toLowerCase();
      const bangQuery = bangMatch[2].trim();
      const map = getBangMap();
      const engineId = map[rawBang] || rawBang;
      const engines = getSearchEngines();
      const matchingEngine = engines.find(e => e.id.toLowerCase() === engineId);
      if (matchingEngine && bangQuery) {
        callUpdateSearchUI(matchingEngine.id, { updateActive: false });
        effectiveQuery = bangQuery;
      }
    }

    if (checkIsLikelyUrl(effectiveQuery)) {
      let url = effectiveQuery;
      const hasProtocol = /^[a-z][a-z0-9+.-]+:/i.test(effectiveQuery) && !effectiveQuery.startsWith('localhost:');
      if (!hasProtocol) {
        const isLocal = effectiveQuery.startsWith('localhost') ||
          /^(\d{1,3}\.){3}\d{1,3}/.test(effectiveQuery) ||
          effectiveQuery.indexOf('.') === -1;
        url = isLocal ? `http://${url}` : `https://${url}`;
      }
      openSearchUrl(url, newTab);
      return;
    }

    const activeEngine = engine || getCurrentSearchEngine();
    const encoded = encodeURIComponent(effectiveQuery);
    const engineUrl = activeEngine.url || 'https://www.google.com/search?q=%s';
    const url = engineUrl.includes('%s')
      ? engineUrl.replace('%s', encoded)
      : `${engineUrl}${encoded}`;
    openSearchUrl(url, newTab);
  }

  // --- Event Handlers ---
  function handleSubmit(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (isComposingInput || (event && (event.isComposing || (event.originalEvent && event.originalEvent.isComposing)))) {
      return;
    }
    if (enterKeyHandled) {
      enterKeyHandled = false;
      return;
    }
    if (searchNavigationLocked) return;
    searchNavigationLocked = true;

    const target = getSelectedResult();
    const input = getSearchInput();
    const query = input ? (input.value || '').trim() : '';

    if (target) {
      if (target.classList && (target.classList.contains('calculator-result') || target.classList.contains('calc-item'))) {
        const copyBtn = typeof target.querySelector === 'function' ? target.querySelector('.copy-btn, .calc-copy') : null;
        if (copyBtn && typeof copyBtn.click === 'function') {
          copyBtn.click();
        } else {
          handleResultClick({ target, preventDefault: () => {}, stopPropagation: () => {} });
        }
        setTimeout(() => { searchNavigationLocked = false; }, 0);
        return;
      }
      const url = target.dataset?.url || (typeof target.getAttribute === 'function' ? target.getAttribute('href') : '') || '';
      if (url) {
        openSearchUrl(url);
        setTimeout(() => { searchNavigationLocked = false; }, 0);
        return;
      }
    }

    if (query) {
      executeSearch(query);
    }

    setTimeout(() => { searchNavigationLocked = false; }, 0);
  }

  function handleResultMouseDown(e) {
    if (!e || !e.target || typeof e.target.closest !== 'function') return;
    const target = e.target.closest('.result-item');
    if (!target) return;
    if (target.classList && target.classList.contains('result-item-suggestion')) {
      selectionExplicit = true;
    }
  }

  function handleResultClick(e) {
    if (!e || !e.target) return;

    const calcTarget = typeof e.target.closest === 'function' ? e.target.closest('.calc-item, .calculator-result') : null;
    if (calcTarget || (e.target.classList && (e.target.classList.contains('copy-btn') || e.target.classList.contains('calc-copy')))) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      const parent = calcTarget || (typeof e.target.closest === 'function' ? e.target.closest('[data-copy]') : null);
      const text = parent ? (parent.dataset.copy || e.target.dataset.copy) : e.target.dataset.copy;
      const copyBtn = parent && typeof parent.querySelector === 'function' ? parent.querySelector('.copy-btn, .calc-copy') : (e.target.classList && (e.target.classList.contains('copy-btn') || e.target.classList.contains('calc-copy')) ? e.target : null);
      if (text && typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
          if (copyBtn) {
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
              copyBtn.textContent = original;
            }, 1500);
          }
        }).catch((err) => {
          console.warn('Copy failed', err);
        });
      }
      return;
    }

    const target = typeof e.target.closest === 'function' ? e.target.closest('.result-item') : null;
    if (!target) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (target.classList && target.classList.contains('result-item-suggestion')) {
      selectionExplicit = true;
    }

    const bangInsert = target.dataset ? target.dataset.bangInsert : null;
    if (bangInsert) {
      const input = getSearchInput();
      if (input) {
        input.value = bangInsert;
        if (typeof input.focus === 'function') input.focus();
      }
      handleInput();
      return;
    }

    if (searchNavigationLocked) return;
    searchNavigationLocked = true;

    const url = (target.dataset && target.dataset.url) || '';
    if (url) {
      openSearchUrl(url);
    }

    setTimeout(() => { searchNavigationLocked = false; }, 0);
  }

  function handleKeydown(e) {
    if (!e) return;
    if (e.isComposing || e.keyCode === 229 || isComposingInput) return;
    const target = e.target;
    const isElementTarget = isElementOrObject(target);
    const widget = getSearchWidget();
    const inSearchWidget = isElementTarget && widget && typeof widget.contains === 'function' && widget.contains(target);

    if (e.key === 'Enter' && inSearchWidget) {
      if (e.repeat) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        return;
      }
      enterKeyHandled = true;
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => { enterKeyHandled = false; });
      } else {
        Promise.resolve().then(() => { enterKeyHandled = false; }).catch(() => {});
      }
    }

    if (!e.altKey && !e.ctrlKey && !e.metaKey &&
        isBookmarkGridScrollKey(e.key) &&
        isSearchInputEmptyAndPassive() &&
        isPointerOverBookmarkGrid()) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      scrollBookmarkGridForKey(e.key);
      return;
    }

    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && inSearchWidget) {
      if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      callCycleSearchEngine(e.key === 'ArrowDown' ? 'down' : 'up');
      return;
    }

    if (e.altKey && e.key === 'Home' && inSearchWidget) {
      if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      const defaultId = (typeof appSearchDefaultEnginePreference !== 'undefined' ? appSearchDefaultEnginePreference : 'google') || 'google';
      callUpdateSearchUI(defaultId);
      callHandleSearchChange();
      return;
    }

    if (!isSearchKeyboardContext(e)) {
      if (e.key === 'Escape' && inSearchWidget) {
        const input = getSearchInput();
        if (input) input.value = '';
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        const items = getCurrentSectionItems();
        userIsTyping = false;
        const sections = getResultSections();

        if (items.length > 0 && currentSelectionIndex === items.length - 1) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          let nextSection = currentSectionIndex + 1;
          if (nextSection >= sections.length) nextSection = 0;

          const nextItems = getCurrentSectionItems(nextSection);
          if (nextItems.length > 0) {
            currentSectionIndex = nextSection;
            if (sections[currentSectionIndex]) {
              sections[currentSectionIndex].scrollTop = 0;
            }
            selectionExplicit = true;
            selectItem(nextItems, 0);
            return;
          }
        }

        if (items.length > 0) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          selectionExplicit = true;
          selectItem(items, currentSelectionIndex + 1);
        }
        break;
      }

      case 'ArrowUp': {
        const items = getCurrentSectionItems();
        userIsTyping = false;
        const sections = getResultSections();

        if (items.length > 0 && currentSelectionIndex === 0) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          let prevSection = currentSectionIndex - 1;
          if (prevSection < 0) prevSection = sections.length - 1;

          const prevItems = getCurrentSectionItems(prevSection);
          if (prevItems.length > 0) {
            currentSectionIndex = prevSection;
            if (sections[currentSectionIndex]) {
              sections[currentSectionIndex].scrollTop = 0;
            }
            selectionExplicit = true;
            selectItem(prevItems, prevItems.length - 1);
            return;
          }
        }

        if (items.length > 0) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          selectionExplicit = true;
          selectItem(items, currentSelectionIndex - 1);
        }
        break;
      }

      case 'PageDown': {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) break;
        const panel = getSearchResultsPanel();
        if (!panel || (panel.classList && panel.classList.contains('hidden'))) break;
        const input = getSearchInput();
        if (typeof document !== 'undefined' && document.activeElement && input && document.activeElement !== input) break;
        if (typeof e.preventDefault === 'function') e.preventDefault();
        selectionExplicit = false;
        moveSection(1);
        break;
      }

      case 'PageUp': {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) break;
        const panel = getSearchResultsPanel();
        if (!panel || (panel.classList && panel.classList.contains('hidden'))) break;
        const input = getSearchInput();
        if (typeof document !== 'undefined' && document.activeElement && input && document.activeElement !== input) break;
        if (typeof e.preventDefault === 'function') e.preventDefault();
        selectionExplicit = false;
        moveSection(-1);
        break;
      }

      case 'Tab': {
        const panel = getSearchResultsPanel();
        if (panel && (!panel.classList || !panel.classList.contains('hidden'))) {
          callHideSearchResultsPanel();
          abortSuggestionFetch();
          clearAllSelections();
        }
        break;
      }

      case 'Enter': {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (e.repeat) return;
        if (searchNavigationLocked) return;

        const selected = getSelectedResult();

        if (selected && selected.classList && (selected.classList.contains('calculator-result') || selected.classList.contains('calc-item'))) {
          searchNavigationLocked = true;
          const copyBtn = typeof selected.querySelector === 'function' ? selected.querySelector('.copy-btn, .calc-copy') : null;
          if (copyBtn && typeof copyBtn.click === 'function') {
            copyBtn.click();
          } else {
            handleResultClick({ target: selected, preventDefault: () => {}, stopPropagation: () => {} });
          }
          setTimeout(() => { searchNavigationLocked = false; }, 0);
          return;
        }

        if (selected && selected.dataset && selected.dataset.bangInsert) {
          const input = getSearchInput();
          if (input) {
            input.value = selected.dataset.bangInsert;
            if (typeof input.focus === 'function') input.focus();
          }
          handleInput();
          return;
        }

        const input = getSearchInput();
        const query = input ? (input.value || '').trim() : '';

        if (selected) {
          searchNavigationLocked = true;
          const url = selected.dataset?.url || (typeof selected.getAttribute === 'function' ? selected.getAttribute('href') : '') || '';
          if (url) {
            openSearchUrl(url);
          }
          setTimeout(() => { searchNavigationLocked = false; }, 0);
          break;
        }

        if (query !== '') {
          executeSearch(query);
        }
        break;
      }

      case 'Escape':
        if (typeof e.preventDefault === 'function') e.preventDefault();
        callHideSearchResultsPanel();
        break;
    }
  }

  // --- Suggestions & Bangs ---
  function isStaleSearch(token, queryLower) {
    const input = getSearchInput();
    const currentLower = input ? (input.value || '').toLowerCase() : '';
    return token !== latestSearchToken || queryLower !== currentLower;
  }

  function abortSuggestionFetch() {
    if (typeof window !== 'undefined' && window.HomebaseSearchSuggestionService && typeof window.HomebaseSearchSuggestionService.abort === 'function') {
      window.HomebaseSearchSuggestionService.abort();
    }
  }

  function clearExternalSuggestionResults() {
    const container = getSuggestionResultsContainer();
    if (!container) return;

    const renderer = getRenderer();
    if (renderer && typeof renderer.clearSuggestions === 'function') {
      renderer.clearSuggestions(container);
    } else if (typeof container.replaceChildren === 'function') {
      container.replaceChildren();
    }
    lastSuggestionHtml = '';
    updatePanelVisibility();
  }

  async function fetchSuggestions(query, engine, options) {
    if (!getSearchSuggestionsPreference()) return [];
    if (!engine) return [];
    if (!engine.suggestionUrl) return [];

    if (typeof window !== 'undefined' && window.HomebaseSearchSuggestionService && typeof window.HomebaseSearchSuggestionService.fetchSuggestions === 'function') {
      return window.HomebaseSearchSuggestionService.fetchSuggestions(query, engine, options);
    }

    return [];
  }

  function getBangSuggestions(query) {
    if (typeof window !== 'undefined' && window.HomebaseSearchSuggestionService && typeof window.HomebaseSearchSuggestionService.getBangSuggestions === 'function') {
      return window.HomebaseSearchSuggestionService.getBangSuggestions(query, getSearchEngines());
    }
    return [];
  }

  function updatePanelVisibility() {
    const bookmarkContainer = getBookmarkResultsContainer();
    const suggestionContainer = getSuggestionResultsContainer();
    const panel = getSearchResultsPanel();
    const widget = getSearchWidget();
    const input = getSearchInput();

    const renderer = getRenderer();
    if (renderer && typeof renderer.updatePanelVisibility === 'function') {
      renderer.updatePanelVisibility({
        panel,
        widget,
        input,
        topContainer: bookmarkContainer,
        bottomContainer: suggestionContainer
      });
      return;
    }

    const hasBookmarks = bookmarkContainer && (bookmarkContainer.innerHTML || '').trim().length > 0;
    const hasSuggestions = suggestionContainer && (suggestionContainer.innerHTML || '').trim().length > 0;

    if (hasBookmarks || hasSuggestions) {
      if (panel && panel.classList) panel.classList.remove('hidden');
      if (widget && widget.classList) widget.classList.add('results-open');
      if (input && typeof input.setAttribute === 'function') {
        input.setAttribute('aria-expanded', 'true');
      }
    } else {
      if (panel && panel.classList) panel.classList.add('hidden');
      if (widget && widget.classList) widget.classList.remove('results-open');
      if (input && typeof input.setAttribute === 'function') {
        input.setAttribute('aria-expanded', 'false');
        if (typeof input.removeAttribute === 'function') {
          input.removeAttribute('aria-activedescendant');
        }
      }
    }
  }

  function hydrateSearchResultFavicons(container) {
    const renderer = getRenderer();
    if (renderer && typeof renderer.hydrateFavicons === 'function') {
      renderer.hydrateFavicons(container);
    }
  }

  // --- Main Input Orchestration ---
  async function handleInput(event) {
    userIsTyping = true;
    selectionExplicit = false;

    if (typeof document !== 'undefined') {
      const selector = document.getElementById('search-engine-selector');
      if (selector && selector.classList) {
        selector.classList.remove('expanded');
        selector.classList.add('suppress-hover');
      }
    }

    const previousSelection = getSelectionSnapshot();
    clearAllSelections();

    if (previousSelection && previousSelection.sectionIndex >= 0) {
      currentSectionIndex = previousSelection.sectionIndex;
    }

    const input = getSearchInput();
    const query = input ? (input.value || '') : '';
    const queryLower = query.toLowerCase();

    // 1. Icon update logic
    const isBrowserDefault = typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch();
    const bangMatch = !isBrowserDefault ? query.match(/^!(\S+)/) : null;
    let targetEngineId = null;
    const engines = getSearchEngines();
    const curEngine = getCurrentSearchEngine();

    if (!isBrowserDefault) {
      if (bangMatch) {
        const rawBang = bangMatch[1].toLowerCase();
        const map = getBangMap();
        const mappedId = map[rawBang] || rawBang;
        const engine = engines.find(e => e.id === mappedId);
        if (engine) {
          targetEngineId = engine.id;
        }
      }

      if (targetEngineId) {
        if (curEngine.id !== targetEngineId) {
          callUpdateSearchUI(targetEngineId, { updateActive: false });
        }
      } else {
        if (!queryLower.startsWith('!') || queryLower.trim().length === 0) {
          const defaultId = (typeof appSearchDefaultEnginePreference !== 'undefined' ? appSearchDefaultEnginePreference : 'google') || 'google';
          const targetId = getActiveSearchEngineId() || curEngine.id || defaultId;
          if (curEngine.id !== targetId) {
            callUpdateSearchUI(targetId);
          }
        }
      }
    }

    const isBangSearch = !isBrowserDefault && queryLower.startsWith('!') && !queryLower.includes(' ');
    const currentToken = ++latestSearchToken;

    // 2. Empty query handling
    if (queryLower.trim().length === 0) {
      callClearSearchUI({ clearInput: false, abortSuggestions: true });
      return;
    }

    const wrapper = getSearchAreaWrapper();
    if (wrapper && wrapper.classList) wrapper.classList.add('search-focused');
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
      document.body.classList.add('search-focus-active');
    }

    const bookmarkContainer = getBookmarkResultsContainer();
    const suggestionContainer = getSuggestionResultsContainer();

    // 3. Calculator & Bookmarks
    const shownUrls = new Set();
    let calcData = null;
    let bookmarkResults = [];

    if (getSearchMathPreference() && !isBangSearch) {
      const mathFn = typeof evaluateMath === 'function' ? evaluateMath : (typeof window !== 'undefined' ? window.evaluateMath : null);
      const unitsFn = typeof evaluateUnits === 'function' ? evaluateUnits : (typeof window !== 'undefined' ? window.evaluateUnits : null);

      const mathResult = mathFn ? mathFn(queryLower.trim()) : null;
      const unitResult = (mathResult === null && unitsFn) ? unitsFn(queryLower.trim()) : null;
      const calcResultValue = mathResult !== null ? mathResult : unitResult;

      if (calcResultValue !== null) {
        calcData = { value: String(calcResultValue), query };
      }
    }

    if (!isBangSearch) {
      const queryTerms = queryLower.trim().split(/\s+/).filter(Boolean);
      const allBms = getAllBookmarks();
      bookmarkResults = allBms
        .filter(b => {
          if (!b) return false;
          const title = (b.title || '').toLowerCase();
          const url = (b.url || '').toLowerCase();
          return queryTerms.every(term => title.includes(term) || url.includes(term));
        })
        .slice(0, 5);

      bookmarkResults.forEach(bookmark => {
        if (bookmark && bookmark.url) shownUrls.add(bookmark.url);
      });
    }

    // 4. Bang Autocomplete Dropdown
    if (isBangSearch) {
      const bangSuggestions = getBangSuggestions(queryLower);
      const renderer = getRenderer();
      if (renderer && typeof renderer.renderBangResults === 'function') {
        renderer.renderBangResults(suggestionContainer, bangSuggestions);
        if (bookmarkContainer && typeof bookmarkContainer.replaceChildren === 'function') {
          bookmarkContainer.replaceChildren();
        }
      }

      lastBookmarkHtml = '';
      lastSuggestionHtml = JSON.stringify(bangSuggestions.map(item => ({
        bang: item.bang,
        engineId: item.engine?.id || '',
        name: item.engine?.name || '',
        symbolId: item.engine?.symbolId || ''
      })));

      applySelectionToCurrentResults(null, query);
      updatePanelVisibility();
      return;
    }

    if (isStaleSearch(currentToken, queryLower)) return;

    const renderer = getRenderer();
    if (renderer && typeof renderer.renderTopResults === 'function') {
      const topRes = renderer.renderTopResults(bookmarkContainer, {
        calc: calcData,
        bookmarks: bookmarkResults,
        query
      });
      lastBookmarkHtml = topRes?.signature || '';
    }

    applySelectionToCurrentResults(previousSelection, query.trim());
    updatePanelVisibility();

    // 5. Async suggestions & history
    let historyPromise = Promise.resolve([]);
    if (getSearchShowHistoryPreference()) {
      const historyApi = (typeof browser !== 'undefined' && browser?.history)
        ? browser.history
        : (typeof chrome !== 'undefined' && chrome?.history ? chrome.history : null);
      if (historyApi && typeof historyApi.search === 'function') {
        const startTime = Date.now() - (90 * 24 * 60 * 60 * 1000);
        try {
          const res = historyApi.search({
            text: query,
            maxResults: 5,
            startTime
          });
          historyPromise = Promise.resolve(res).then((items) => (Array.isArray(items) ? items : [])).catch(() => []);
        } catch (_) {
          historyPromise = Promise.resolve([]);
        }
      }
    }

    if (isBrowserDefault || !getSearchSuggestionsPreference()) {
      clearExternalSuggestionResults();
    }

    const suggestionsPromise = (!isBrowserDefault && getSearchSuggestionsPreference())
      ? fetchSuggestions(query.trim(), getCurrentSearchEngine())
      : Promise.resolve([]);

    const [historyResults, fetchedSuggestionResults] = await Promise.all([historyPromise, suggestionsPromise]);

    if (isStaleSearch(currentToken, queryLower)) return;

    const currentInput = getSearchInput();
    if (typeof document !== 'undefined' && document.activeElement && currentInput && document.activeElement !== currentInput) {
      return;
    }

    const suggestionResults = (!isBrowserDefault && getSearchSuggestionsPreference()) ? fetchedSuggestionResults : [];
    if (isBrowserDefault || !getSearchSuggestionsPreference()) {
      clearExternalSuggestionResults();
    }

    // 6. Build bottom section UI via renderer
    if (renderer && typeof renderer.renderBottomResults === 'function') {
      const activeEngine = getCurrentSearchEngine();
      const bottomRes = renderer.renderBottomResults(suggestionContainer, {
        history: historyResults,
        suggestions: suggestionResults,
        engine: activeEngine,
        query,
        shownUrls
      });
      lastSuggestionHtml = bottomRes?.signature || '';
    }

    applySelectionToCurrentResults(previousSelection, query.trim());
    attachHoverSync();
    updatePanelVisibility();
  }

  function isEligibleQuickFocusTarget(target, e) {
    if (!e || !target) return false;
    if (e.defaultPrevented) return false;
    if (e.isComposing || e.keyCode === 229 || isComposingInput) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (!e.key || e.key.length !== 1) return false;

    if (typeof document !== 'undefined' && document.body) {
      if (document.body.classList.contains('modal-open') || document.body.classList.contains('dialog-open')) {
        return false;
      }
    }

    const interactiveSelector = [
      'input',
      'textarea',
      'select',
      'button',
      'a',
      'a[href]',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="dialog"]',
      'dialog',
      '.bookmark-tile',
      '.bookmark-item',
      '.folder-tile',
      '.folder-tab',
      '.icon-button',
      '.engine-icon-btn'
    ].join(', ');

    function isInteractiveDirectOrClosest(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return true;
      if (el.isContentEditable) return true;
      if (typeof el.getAttribute === 'function') {
        const role = el.getAttribute('role');
        if (role === 'button' || role === 'link' || role === 'radio' || role === 'checkbox' || role === 'menuitem' || role === 'tab' || role === 'dialog') {
          return true;
        }
      }
      if (typeof el.closest === 'function') {
        if (el.closest(interactiveSelector)) return true;
      }
      return false;
    }

    if (isInteractiveDirectOrClosest(target)) return false;

    if (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body) {
      if (isInteractiveDirectOrClosest(document.activeElement)) return false;
    }

    return true;
  }

  // --- Lifecycle & Initialization ---
  function initialize(options = {}) {
    customOptions = { ...options };
    setupBookmarkGridPointerTracking();

    if (options.bindEvents && !boundEventListeners) {
      const form = getSearchForm();
      if (form && typeof form.addEventListener === 'function') {
        boundFormSubmitHandler = handleSubmit;
        form.addEventListener('submit', boundFormSubmitHandler);
      }

      const input = getSearchInput();
      if (input && typeof input.addEventListener === 'function') {
        const wait = typeof options.debounceWait === 'number' ? options.debounceWait : 120;
        const debounceFn = typeof debounce === 'function' ? debounce : (typeof window !== 'undefined' && typeof window.debounce === 'function' ? window.debounce : null);
        const debounced = debounceFn ? debounceFn(handleInput, wait) : handleInput;

        boundInputHandler = (e) => {
          userIsTyping = true;
          selectionExplicit = false;
          if (typeof document !== 'undefined') {
            const selector = document.getElementById('search-engine-selector');
            if (selector && selector.classList) {
              selector.classList.remove('expanded');
              selector.classList.add('suppress-hover');
            }
          }
          debounced(e);
        };
        boundInputHandler._cancel = () => {
          if (debounced && typeof debounced.cancel === 'function') {
            debounced.cancel();
          }
        };

        input.addEventListener('input', boundInputHandler);

        boundInputClickHandler = (e) => {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        };
        input.addEventListener('click', boundInputClickHandler);

        boundCompositionStartHandler = () => {
          isComposingInput = true;
        };
        boundCompositionEndHandler = () => {
          isComposingInput = false;
        };
        input.addEventListener('compositionstart', boundCompositionStartHandler);
        input.addEventListener('compositionend', boundCompositionEndHandler);
      }

      const panel = getSearchResultsPanel();
      if (panel && typeof panel.addEventListener === 'function') {
        boundPanelMousedownHandler = handleResultMouseDown;
        panel.addEventListener('mousedown', boundPanelMousedownHandler, true);

        boundPanelClickHandler = handleResultClick;
        panel.addEventListener('click', boundPanelClickHandler, true);

        boundPanelStopHandler = (e) => {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        };
        panel.addEventListener('click', boundPanelStopHandler);
      }

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        boundKeydownHandler = handleKeydown;
        document.addEventListener('keydown', boundKeydownHandler);

        boundQuickFocusHandler = (e) => {
          if (!e || !e.target) return;
          if (!isEligibleQuickFocusTarget(e.target, e)) return;
          const searchIn = getSearchInput();
          if (searchIn && typeof searchIn.focus === 'function') searchIn.focus();
        };
        document.addEventListener('keydown', boundQuickFocusHandler);
      }

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        boundBeforeUnloadHandler = () => {
          if (boundInputHandler && typeof boundInputHandler._cancel === 'function') {
            boundInputHandler._cancel();
          }
        };
        window.addEventListener('beforeunload', boundBeforeUnloadHandler);

        boundWindowBlurHandler = () => {
          isComposingInput = false;
        };
        window.addEventListener('blur', boundWindowBlurHandler);
      }

      boundEventListeners = true;
    }
  }

  function destroy() {
    abortSuggestionFetch();
    clearAllSelections();
    if (boundEventListeners) {
      const form = getSearchForm();
      if (form && typeof form.removeEventListener === 'function' && boundFormSubmitHandler) {
        form.removeEventListener('submit', boundFormSubmitHandler);
      }

      const input = getSearchInput();
      if (input && typeof input.removeEventListener === 'function') {
        if (boundInputHandler) {
          if (typeof boundInputHandler._cancel === 'function') boundInputHandler._cancel();
          input.removeEventListener('input', boundInputHandler);
        }
        if (boundInputClickHandler) {
          input.removeEventListener('click', boundInputClickHandler);
        }
        if (boundCompositionStartHandler) {
          input.removeEventListener('compositionstart', boundCompositionStartHandler);
        }
        if (boundCompositionEndHandler) {
          input.removeEventListener('compositionend', boundCompositionEndHandler);
        }
      }

      const panel = getSearchResultsPanel();
      if (panel && typeof panel.removeEventListener === 'function') {
        if (boundPanelMousedownHandler) {
          panel.removeEventListener('mousedown', boundPanelMousedownHandler, true);
        }
        if (boundPanelClickHandler) {
          panel.removeEventListener('click', boundPanelClickHandler, true);
        }
        if (boundPanelStopHandler) {
          panel.removeEventListener('click', boundPanelStopHandler);
        }
      }

      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        if (boundKeydownHandler) {
          document.removeEventListener('keydown', boundKeydownHandler);
        }
        if (boundQuickFocusHandler) {
          document.removeEventListener('keydown', boundQuickFocusHandler);
        }
      }

      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        if (boundBeforeUnloadHandler) {
          window.removeEventListener('beforeunload', boundBeforeUnloadHandler);
        }
        if (boundWindowBlurHandler) {
          window.removeEventListener('blur', boundWindowBlurHandler);
        }
      }

      boundFormSubmitHandler = null;
      boundInputHandler = null;
      boundInputClickHandler = null;
      boundCompositionStartHandler = null;
      boundCompositionEndHandler = null;
      boundWindowBlurHandler = null;
      boundPanelMousedownHandler = null;
      boundPanelClickHandler = null;
      boundPanelStopHandler = null;
      boundKeydownHandler = null;
      boundQuickFocusHandler = null;
      boundBeforeUnloadHandler = null;
      boundEventListeners = false;
    }
    if (trackedGridEl && typeof trackedGridEl.removeEventListener === 'function') {
      if (boundGridPointerEnterHandler) {
        trackedGridEl.removeEventListener('pointerenter', boundGridPointerEnterHandler);
      }
      if (boundGridPointerLeaveHandler) {
        trackedGridEl.removeEventListener('pointerleave', boundGridPointerLeaveHandler);
      }
    }
    trackedGridEl = null;
    boundGridPointerEnterHandler = null;
    boundGridPointerLeaveHandler = null;
    bookmarkGridPointerListenersAttached = false;
    isBookmarkGridPointerOver = false;
    currentSelectionIndex = -1;
    currentSectionIndex = 0;
    selectionExplicit = false;
    lastSelectedText = '';
    userIsTyping = false;
    latestSearchToken = 0;
    lastBookmarkHtml = '';
    lastSuggestionHtml = '';
    searchNavigationLocked = false;
    isComposingInput = false;
    enterKeyHandled = false;
    customOptions = {};
  }

  function getState() {
    return {
      currentSelectionIndex,
      currentSectionIndex,
      selectionExplicit,
      lastSelectedText,
      userIsTyping,
      latestSearchToken,
      lastBookmarkHtml,
      lastSuggestionHtml,
      searchNavigationLocked,
      isBookmarkGridPointerOver,
      bookmarkGridPointerListenersAttached
    };
  }

  // Controller Interface
  const controller = {
    initialize,
    destroy,

    // Core Interaction Handlers
    handleInput,
    handleKeydown,
    handleSubmit,
    handleResultClick,
    handleResultMouseDown,

    // Execution & Navigation
    executeSearch,
    openSearchUrl,

    // Selection & Navigation
    selectItem,
    moveSection,
    clearAllSelections,
    getCurrentSectionItems,
    getSelectedResult,
    getSelectionSnapshot,
    applySelectionToCurrentResults,
    restoreSelectionAfterFilter,
    maybeAutoSelectSuggestion,

    // Suggestions & Bangs
    fetchSuggestions,
    fetchSearchSuggestions: fetchSuggestions,
    getBangSuggestions,
    abortSuggestionFetch,
    clearExternalSuggestionResults,
    setSuggestionsPreference,
    setSearchSuggestionsPreference: setSuggestionsPreference,

    // UI Updates & Favicons
    updatePanelVisibility,
    hydrateSearchResultFavicons,

    // Keyboard & Pointer Helpers
    isSearchKeyboardContext,
    isBookmarkGridScrollKey,
    isSearchInputEmptyAndPassive,
    getBookmarkScrollContainer,
    isPointerOverBookmarkGrid,
    scrollBookmarkGridForKey,
    setupBookmarkGridPointerTracking,
    attachHoverSync,
    isStaleSearch,

    // State Inspection
    getState
  };

  if (typeof window !== 'undefined') {
    window.HomebaseSearchInteractionController = controller;
    window.setSearchSuggestionsPreference = setSuggestionsPreference;
  }
})();
