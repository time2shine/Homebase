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
  let suggestionAbortController = null;
  let boundEventListeners = false;
  let boundFormSubmitHandler = null;
  let boundInputHandler = null;
  let boundInputClickHandler = null;
  let boundPanelMousedownHandler = null;
  let boundPanelClickHandler = null;
  let boundPanelStopHandler = null;
  let boundKeydownHandler = null;
  let boundQuickFocusHandler = null;
  let boundBeforeUnloadHandler = null;
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

  function createSvgIcon(id) {
    if (typeof createSvgIconElement === 'function') return createSvgIconElement(id);
    if (typeof window !== 'undefined' && typeof window.createSvgIconElement === 'function') return window.createSvgIconElement(id);
    return null;
  }

  function syncGlobals() {
    if (typeof currentSelectionIndex !== 'undefined') {
      try {
        currentSelectionIndex = currentSelectionIndex;
      } catch (_) {}
    }
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

    grid.addEventListener('pointerenter', () => {
      isBookmarkGridPointerOver = true;
    });
    grid.addEventListener('pointerleave', () => {
      isBookmarkGridPointerOver = false;
    });
    bookmarkGridPointerListenersAttached = true;
  }

  // --- Context & Selection Helpers ---
  function isSearchKeyboardContext(event) {
    if (!event || !event.target || !isElementOrObject(event.target)) return false;
    const panel = getSearchResultsPanel();
    if (!panel || (panel.classList && panel.classList.contains('hidden'))) return false;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
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
      });
    });
  }

  function clearAllSelections() {
    removeSelectionClasses();
    currentSelectionIndex = -1;
    selectionExplicit = false;
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
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
        currentSelectionIndex = nextIndex;
        lastSelectedText = getResultLabelText(target);
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
      if (typeof targetItem.scrollIntoView === 'function') {
        targetItem.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
      lastSelectedText = getResultLabelText(targetItem);
      syncSearchInputWithItem(targetItem);
    } else {
      currentSelectionIndex = -1;
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

  function executeSearch(query, engine, newTab) {
    const originalQuery = (query || '').trim();
    if (!originalQuery) return;

    let effectiveQuery = originalQuery;

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
    if (searchNavigationLocked) return;
    searchNavigationLocked = true;

    const target = getSelectedResult();
    const input = getSearchInput();
    const query = input ? (input.value || '').trim() : '';

    if (target) {
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

    if (e.target.classList && (e.target.classList.contains('copy-btn') || e.target.classList.contains('calc-copy'))) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      const parent = typeof e.target.closest === 'function' ? e.target.closest('[data-copy]') : null;
      const text = parent ? (parent.dataset.copy || e.target.dataset.copy) : e.target.dataset.copy;
      if (text && typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
          const original = e.target.textContent;
          e.target.textContent = 'Copied!';
          setTimeout(() => {
            e.target.textContent = original;
          }, 1500);
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
    const target = e.target;
    const isElementTarget = isElementOrObject(target);
    const widget = getSearchWidget();
    const inSearchWidget = isElementTarget && widget && typeof widget.contains === 'function' && widget.contains(target);

    if (!e.altKey && !e.ctrlKey && !e.metaKey &&
        isBookmarkGridScrollKey(e.key) &&
        isSearchInputEmptyAndPassive() &&
        isPointerOverBookmarkGrid()) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      scrollBookmarkGridForKey(e.key);
      return;
    }

    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && inSearchWidget) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      callCycleSearchEngine(e.key === 'ArrowDown' ? 'down' : 'up');
      return;
    }

    if (e.altKey && e.key === 'Home' && inSearchWidget) {
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

      case 'Tab': {
        const panel = getSearchResultsPanel();
        if (!panel || (typeof panel.querySelectorAll === 'function' && panel.querySelectorAll('.result-item').length === 0)) {
          return;
        }
        if (typeof e.preventDefault === 'function') e.preventDefault();
        selectionExplicit = false;
        moveSection(e.shiftKey ? -1 : 1);
        break;
      }

      case 'Enter': {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        const selected = getSelectedResult();

        if (selected && selected.classList && (selected.classList.contains('calculator-result') || selected.classList.contains('calc-item'))) {
          const copyBtn = typeof selected.querySelector === 'function' ? selected.querySelector('.copy-btn, .calc-copy') : null;
          if (copyBtn && typeof copyBtn.click === 'function') copyBtn.click();
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
          if (searchNavigationLocked) return;
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
    if (!suggestionAbortController) return;
    try {
      suggestionAbortController.abort();
    } catch (_) {}
    suggestionAbortController = null;
  }

  function clearExternalSuggestionResults() {
    const container = getSuggestionResultsContainer();
    if (!container || typeof container.querySelectorAll !== 'function') return;

    const removable = new Set();
    Array.from(container.children || []).forEach((node) => {
      if (!isElementOrObject(node)) return;
      if (node.classList && node.classList.contains('result-item-suggestion')) {
        removable.add(node);
        const previous = node.previousElementSibling;
        if (
          previous &&
          previous.classList &&
          previous.classList.contains('result-header') &&
          (previous.dataset?.externalSuggestions === 'true' || (previous.textContent || '').trim().endsWith(' Search'))
        ) {
          removable.add(previous);
        }
        return;
      }
      if (node.classList && node.classList.contains('result-header') && node.dataset?.externalSuggestions === 'true') {
        removable.add(node);
      }
    });

    removable.forEach(node => {
      if (node && typeof node.remove === 'function') node.remove();
    });

    if (removable.size > 0) {
      lastSuggestionHtml = '';
      updatePanelVisibility();
    }
  }

  async function fetchSuggestions(query, engine) {
    if (!getSearchSuggestionsPreference()) return [];
    if (!engine) return [];
    if (!engine.suggestionUrl) return [];

    const cacheKey = `${engine.id}:${query}`;
    const cached = getCacheEntry(cacheKey);
    if (cached) {
      return cached;
    }

    if (suggestionAbortController) {
      try {
        suggestionAbortController.abort();
      } catch (_) {}
    }

    suggestionAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = suggestionAbortController ? suggestionAbortController.signal : undefined;

    if (typeof fetch === 'undefined') {
      return [];
    }

    try {
      const res = await fetch(engine.suggestionUrl + encodeURIComponent(query), { signal });
      if (!res.ok) return [];

      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        data = raw;
      }

      let results = [];
      const openSearchEngines = ['Google', 'Bing', 'YouTube', 'Wikipedia', 'Amazon', 'Maps'];
      if (openSearchEngines.includes(engine.name)) {
        results = Array.isArray(data) && Array.isArray(data[1]) ? data[1].filter(val => typeof val === 'string') : [];
        setCacheEntry(cacheKey, results);
        return results;
      }

      if (engine.name === 'DuckDuckGo') {
        results = Array.isArray(data) ? data.map(item => item && item.phrase).filter(val => typeof val === 'string') : [];
        setCacheEntry(cacheKey, results);
        return results;
      }

      if (engine.name === 'Yahoo') {
        const yahooResults = data?.gossip?.results;
        if (Array.isArray(yahooResults)) {
          results = yahooResults
            .flatMap(entry => (entry?.nodes || []).map(node => node && node.key))
            .filter(val => typeof val === 'string');
        } else {
          results = [];
        }
        setCacheEntry(cacheKey, results);
        return results;
      }

      if (engine.name === 'Yandex') {
        let parsedArray = data;
        if (typeof parsedArray === 'string') {
          try {
            parsedArray = JSON.parse(parsedArray);
          } catch {
            parsedArray = [];
          }
        }
        const suggestionBucket = Array.isArray(parsedArray) && parsedArray.length > 1 ? parsedArray[1] : [];
        results = Array.isArray(suggestionBucket)
          ? suggestionBucket
              .map(item => (Array.isArray(item) ? item[1] : item))
              .filter(val => typeof val === 'string')
          : [];
        setCacheEntry(cacheKey, results);
        return results;
      }

      setCacheEntry(cacheKey, results);
      return results;
    } catch (err) {
      if (err.name === 'AbortError') {
        return null;
      }
      console.error('Suggestion fetch error:', err);
      return [];
    }
  }

  function getBangSuggestions(query) {
    const term = query.substring(1).toLowerCase().trim();
    const matches = [];
    const seenIds = new Set();
    const map = getBangMap();
    const engines = getSearchEngines();

    Object.entries(map).forEach(([bang, engineId]) => {
      if (bang.startsWith(term)) {
        const engine = engines.find(e => e.id === engineId);
        if (engine) {
          matches.push({ bang, engine });
          seenIds.add(engineId);
        }
      }
    });

    engines.forEach(engine => {
      const isMatch = engine.id.startsWith(term);
      if (isMatch && !matches.find(m => m.engine.id === engine.id && m.bang === engine.id) && !seenIds.has(engine.id)) {
        matches.push({ bang: engine.id, engine });
      }
    });

    return matches.sort((a, b) => {
      if (a.bang === term) return -1;
      if (b.bang === term) return 1;
      return a.bang.localeCompare(b.bang);
    });
  }

  function updatePanelVisibility() {
    const bookmarkContainer = getBookmarkResultsContainer();
    const suggestionContainer = getSuggestionResultsContainer();
    const panel = getSearchResultsPanel();
    const widget = getSearchWidget();

    const hasBookmarks = bookmarkContainer && (bookmarkContainer.innerHTML || '').trim().length > 0;
    const hasSuggestions = suggestionContainer && (suggestionContainer.innerHTML || '').trim().length > 0;

    if (hasBookmarks || hasSuggestions) {
      if (panel && panel.classList) panel.classList.remove('hidden');
      if (widget && widget.classList) widget.classList.add('results-open');
    } else {
      if (panel && panel.classList) panel.classList.add('hidden');
      if (widget && widget.classList) widget.classList.remove('results-open');
    }
  }

  function hydrateSearchResultFavicons(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    const targets = Array.from(container.querySelectorAll('.result-favicon[data-favicon-raw-url]'));
    if (!targets.length) return;

    targets.forEach((img) => {
      if (!img.decoding) img.decoding = 'async';
      if (!img.loading) img.loading = 'lazy';
      if (typeof img.getAttribute === 'function' && !img.getAttribute('fetchpriority')) {
        img.setAttribute('fetchpriority', 'low');
      }
      if (!img.referrerPolicy) img.referrerPolicy = 'no-referrer';

      const rawUrl = img.dataset?.faviconRawUrl || '';
      const hideImg = () => {
        if (img.style) img.style.display = 'none';
        if (typeof revokeFaviconObjectUrl === 'function') {
          revokeFaviconObjectUrl(img);
        }
        if (typeof img.removeAttribute === 'function') {
          img.removeAttribute('src');
        }
      };

      if (!rawUrl) {
        hideImg();
        return;
      }

      const domainKey = typeof getDomainKeyFromUrl === 'function' ? getDomainKeyFromUrl(rawUrl) : null;
      if (!domainKey) {
        hideImg();
        return;
      }

      const candidates = typeof buildFaviconCandidates === 'function' ? buildFaviconCandidates(rawUrl) : [];
      if (!candidates.length) {
        hideImg();
        return;
      }

      const shouldAbort = () => img.dataset?.faviconRawUrl !== rawUrl;
      if (typeof resolveFaviconForImageTarget === 'function') {
        resolveFaviconForImageTarget({
          img,
          domainKey,
          candidates,
          shouldAbort,
          onResolved: (resolvedUrl, meta) => {
            if (img.style) img.style.display = '';
            if (!meta?.sourceAlreadySet && typeof setFaviconImageSrc === 'function') {
              setFaviconImageSrc(img, resolvedUrl);
            }
          },
          onFailed: () => hideImg(),
          onNegativeCacheHit: () => hideImg(),
          onAbort: () => {},
          acceptCandidate: () => true
        });
      }
    });
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
    const bangMatch = query.match(/^!(\S+)/);
    let targetEngineId = null;
    const engines = getSearchEngines();
    const curEngine = getCurrentSearchEngine();

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

    const isBangSearch = queryLower.startsWith('!') && !queryLower.includes(' ');
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
    let topFragment = typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function'
      ? document.createDocumentFragment()
      : null;
    const shownUrls = new Set();
    let calcResultValue = null;
    let bookmarkResults = [];

    if (getSearchMathPreference() && !isBangSearch) {
      const mathFn = typeof evaluateMath === 'function' ? evaluateMath : (typeof window !== 'undefined' ? window.evaluateMath : null);
      const unitsFn = typeof evaluateUnits === 'function' ? evaluateUnits : (typeof window !== 'undefined' ? window.evaluateUnits : null);

      const mathResult = mathFn ? mathFn(queryLower.trim()) : null;
      const unitResult = (mathResult === null && unitsFn) ? unitsFn(queryLower.trim()) : null;
      calcResultValue = mathResult !== null ? mathResult : unitResult;

      if (calcResultValue !== null && topFragment && typeof document !== 'undefined') {
        const displayResult = String(calcResultValue);
        const header = document.createElement('div');
        header.className = 'result-header';
        header.textContent = 'Calculator';

        const item = document.createElement('div');
        item.className = 'result-item calc-item';
        item.dataset.copy = displayResult;

        const left = document.createElement('div');
        left.className = 'calc-left';

        const icon = document.createElement('div');
        icon.className = 'calc-icon';
        icon.textContent = String.fromCodePoint(129518);

        const textWrap = document.createElement('div');
        textWrap.className = 'calc-text';

        const answer = document.createElement('div');
        answer.className = 'calc-answer';
        answer.textContent = displayResult;

        const expression = document.createElement('div');
        expression.className = 'calc-expression';
        expression.textContent = query;

        textWrap.appendChild(answer);
        textWrap.appendChild(expression);
        left.appendChild(icon);
        left.appendChild(textWrap);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'calc-copy';
        copyBtn.dataset.copy = displayResult;
        copyBtn.textContent = 'Copy';

        item.appendChild(left);
        item.appendChild(copyBtn);

        topFragment.appendChild(header);
        topFragment.appendChild(item);
      }
    }

    if (!isBangSearch) {
      const queryTerms = queryLower.trim().split(/\s+/).filter(Boolean);
      const allBms = getAllBookmarks();
      bookmarkResults = allBms
        .filter(b => {
          const title = (b.title || '').toLowerCase();
          const url = (b.url || '').toLowerCase();
          return queryTerms.every(term => title.includes(term) || url.includes(term));
        })
        .slice(0, 5);

      if (bookmarkResults.length > 0 && topFragment && typeof document !== 'undefined') {
        const header = document.createElement('div');
        header.className = 'result-header';
        header.textContent = 'Bookmarks';
        topFragment.appendChild(header);

        bookmarkResults.forEach(bookmark => {
          const bookmarkUrl = bookmark.url || '';
          if (!bookmarkUrl) return;
          shownUrls.add(bookmarkUrl);

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'result-item';
          button.dataset.url = bookmarkUrl;

          const favicon = document.createElement('img');
          favicon.className = 'result-favicon';
          favicon.dataset.faviconRawUrl = bookmarkUrl;
          favicon.loading = 'lazy';
          favicon.decoding = 'async';
          favicon.alt = '';

          const info = document.createElement('div');
          info.className = 'result-item-info';

          const label = document.createElement('strong');
          label.className = 'result-label';
          label.textContent = bookmark.title || 'No Title';

          info.appendChild(label);
          button.appendChild(favicon);
          button.appendChild(info);
          topFragment.appendChild(button);
        });
      }
    }

    // 4. Bang Autocomplete Dropdown
    if (isBangSearch) {
      const bangSuggestions = getBangSuggestions(queryLower);
      if (typeof document !== 'undefined') {
        const bangFragment = document.createDocumentFragment();
        const header = document.createElement('div');
        header.className = 'result-header';
        header.textContent = 'Bang Shortcuts';
        bangFragment.appendChild(header);

        if (bangSuggestions.length === 0) {
          const item = document.createElement('div');
          item.className = 'result-item';
          const info = document.createElement('div');
          info.className = 'result-item-info';
          info.style.justifyContent = 'center';
          info.style.color = '#888';
          info.textContent = 'No matching bangs';
          item.appendChild(info);
          bangFragment.appendChild(item);
        } else {
          bangSuggestions.forEach(item => {
            const bangCode = `!${item.bang}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'result-item';
            button.dataset.bangInsert = `${bangCode} `;

            const badge = document.createElement('span');
            badge.className = 'bang-badge';
            badge.textContent = bangCode;
            button.appendChild(badge);

            if (item.engine && item.engine.symbolId) {
              const engineIcon = createSvgIcon(item.engine.symbolId);
              if (engineIcon) {
                button.appendChild(engineIcon);
              }
            }

            const info = document.createElement('div');
            info.className = 'result-item-info';
            const label = document.createElement('strong');
            label.className = 'result-label';
            label.textContent = item.engine?.name || '';
            info.appendChild(label);
            button.appendChild(info);
            bangFragment.appendChild(button);
          });
        }

        if (suggestionContainer && typeof suggestionContainer.replaceChildren === 'function') {
          suggestionContainer.replaceChildren(bangFragment);
        }
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

    const topSignature = JSON.stringify({
      calc: calcResultValue !== null ? { value: String(calcResultValue), query } : null,
      bookmarks: bookmarkResults.map(bookmark => ({
        url: bookmark.url || '',
        title: bookmark.title || ''
      }))
    });

    if (topSignature !== lastBookmarkHtml && bookmarkContainer) {
      if (topFragment && typeof bookmarkContainer.replaceChildren === 'function') {
        bookmarkContainer.replaceChildren(topFragment);
      }
      lastBookmarkHtml = topSignature;
      hydrateSearchResultFavicons(bookmarkContainer);
    }

    applySelectionToCurrentResults(previousSelection, query.trim());
    updatePanelVisibility();

    // 5. Async suggestions & history
    let historyPromise = Promise.resolve([]);
    if (getSearchShowHistoryPreference() && typeof browser !== 'undefined' && browser.history && typeof browser.history.search === 'function') {
      const startTime = Date.now() - (90 * 24 * 60 * 60 * 1000);
      historyPromise = browser.history.search({
        text: query,
        maxResults: 5,
        startTime
      }).catch(() => []);
    }

    if (!getSearchSuggestionsPreference()) {
      clearExternalSuggestionResults();
    }

    const suggestionsPromise = getSearchSuggestionsPreference()
      ? fetchSuggestions(query.trim(), getCurrentSearchEngine())
      : Promise.resolve([]);

    const [historyResults, fetchedSuggestionResults] = await Promise.all([historyPromise, suggestionsPromise]);

    if (isStaleSearch(currentToken, queryLower)) return;

    const suggestionResults = getSearchSuggestionsPreference() ? fetchedSuggestionResults : [];
    if (!getSearchSuggestionsPreference()) {
      clearExternalSuggestionResults();
    }

    // 6. Build bottom section UI
    if (typeof document !== 'undefined') {
      const bottomFragment = document.createDocumentFragment();

      if (historyResults && historyResults.length > 0) {
        const uniqueHistory = historyResults.filter(item => !shownUrls.has(item.url));
        if (uniqueHistory.length > 0) {
          const header = document.createElement('div');
          header.className = 'result-header';
          header.textContent = 'Recent History';
          bottomFragment.appendChild(header);

          uniqueHistory.forEach(item => {
            const url = item.url;
            const title = item.title || url;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'result-item result-item-history';
            button.dataset.url = url;

            const icon = createSvgIcon('historyClock');
            if (icon) {
              button.appendChild(icon);
            }

            const info = document.createElement('div');
            info.className = 'result-item-info';
            const label = document.createElement('strong');
            label.className = 'result-label';
            label.textContent = title;
            info.appendChild(label);

            button.appendChild(info);
            bottomFragment.appendChild(button);
          });
        }
      }

      if (suggestionResults === null) {
        attachHoverSync();
        return;
      }

      const activeEngine = getCurrentSearchEngine();
      if (suggestionResults && suggestionResults.length > 0) {
        const header = document.createElement('div');
        header.className = 'result-header';
        header.dataset.externalSuggestions = 'true';
        header.textContent = `${activeEngine.name} Search`;
        bottomFragment.appendChild(header);

        const searchUrl = `${activeEngine.url}${encodeURIComponent(query)}`;
        const directButton = document.createElement('button');
        directButton.type = 'button';
        directButton.className = 'result-item result-item-suggestion';
        directButton.dataset.url = searchUrl;

        const directIcon = createSvgIcon('search');
        if (directIcon) {
          directButton.appendChild(directIcon);
        }
        const directInfo = document.createElement('div');
        directInfo.className = 'result-item-info';
        const directLabel = document.createElement('strong');
        directLabel.className = 'result-label';
        directLabel.textContent = query;
        directInfo.appendChild(directLabel);
        directButton.appendChild(directInfo);
        bottomFragment.appendChild(directButton);

        suggestionResults.slice(0, 10).forEach(suggestion => {
          if (suggestion.toLowerCase() === query.toLowerCase()) return;
          const suggestionUrl = `${activeEngine.url}${encodeURIComponent(suggestion)}`;

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'result-item result-item-suggestion';
          button.dataset.url = suggestionUrl;

          const icon = createSvgIcon('search');
          if (icon) {
            button.appendChild(icon);
          }

          const info = document.createElement('div');
          info.className = 'result-item-info';
          const label = document.createElement('strong');
          label.className = 'result-label';
          label.textContent = suggestion;
          info.appendChild(label);

          button.appendChild(info);
          bottomFragment.appendChild(button);
        });
      }

      const bottomSignature = JSON.stringify({
        history: (historyResults || []).map(item => ({ url: item.url || '', title: item.title || '' })),
        suggestions: suggestionResults ? suggestionResults.slice(0, 10) : [],
        engine: activeEngine.id || '',
        query
      });

      if (bottomSignature !== lastSuggestionHtml && suggestionContainer) {
        if (typeof suggestionContainer.replaceChildren === 'function') {
          suggestionContainer.replaceChildren(bottomFragment);
        }
        lastSuggestionHtml = bottomSignature;
      }
    }

    applySelectionToCurrentResults(previousSelection, query.trim());
    attachHoverSync();
    updatePanelVisibility();
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
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (e.key && e.key.length > 1) return;
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

      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && boundBeforeUnloadHandler) {
        window.removeEventListener('beforeunload', boundBeforeUnloadHandler);
      }

      boundFormSubmitHandler = null;
      boundInputHandler = null;
      boundInputClickHandler = null;
      boundPanelMousedownHandler = null;
      boundPanelClickHandler = null;
      boundPanelStopHandler = null;
      boundKeydownHandler = null;
      boundQuickFocusHandler = null;
      boundBeforeUnloadHandler = null;
      boundEventListeners = false;
    }
    latestSearchToken = 0;
    lastBookmarkHtml = '';
    lastSuggestionHtml = '';
    searchNavigationLocked = false;
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
  }
})();
