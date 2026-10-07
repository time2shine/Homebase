/**
 * Homebase Search UI & Engine Selector Controller
 * Manages search engine selection, cycling, selector UI rendering, and search preferences.
 */
(function() {
  'use strict';

  // Constants
  const SEARCH_ENGINES_PREF_KEY = 'searchEngines';
  const APP_SEARCH_REMEMBER_ENGINE_KEY = 'appSearchRememberEnginePreference';
  const APP_SEARCH_DEFAULT_ENGINE_KEY = 'appSearchDefaultEnginePreference';
  const ICON_SIZE = 36;
  const GAP = 6;
  const VISIBLE_COUNT = 1;

  // Local state tracking
  let boundEventListeners = false;

  function getSearchEngines() {
    if (typeof searchEngines !== 'undefined' && Array.isArray(searchEngines)) {
      return searchEngines;
    }
    if (typeof window !== 'undefined' && Array.isArray(window.searchEngines)) {
      return window.searchEngines;
    }
    return [];
  }

  function setSearchEngines(engines) {
    if (typeof searchEngines !== 'undefined') {
      searchEngines = engines;
    }
    if (typeof window !== 'undefined') {
      window.searchEngines = engines;
    }
  }

  function getCurrentEngine() {
    if (typeof currentSearchEngine !== 'undefined' && currentSearchEngine) {
      return currentSearchEngine;
    }
    if (typeof window !== 'undefined' && window.currentSearchEngine) {
      return window.currentSearchEngine;
    }
    const engines = getSearchEngines();
    return engines.find(e => e.enabled) || engines[0] || null;
  }

  function setCurrentEngine(engine) {
    if (typeof currentSearchEngine !== 'undefined') {
      currentSearchEngine = engine;
    }
    if (typeof window !== 'undefined') {
      window.currentSearchEngine = engine;
    }
  }

  function getActiveEngineId() {
    if (typeof activeSearchEngineId !== 'undefined' && activeSearchEngineId) {
      return activeSearchEngineId;
    }
    if (typeof window !== 'undefined' && window.activeSearchEngineId) {
      return window.activeSearchEngineId;
    }
    const cur = getCurrentEngine();
    return cur ? cur.id : 'google';
  }

  function setActiveEngineId(id) {
    if (typeof activeSearchEngineId !== 'undefined') {
      activeSearchEngineId = id;
    }
    if (typeof window !== 'undefined') {
      window.activeSearchEngineId = id;
    }
  }

  function getRememberPreference() {
    if (typeof appSearchRememberEnginePreference !== 'undefined') {
      return appSearchRememberEnginePreference !== false;
    }
    return true;
  }

  function setRememberPreference(val) {
    if (typeof appSearchRememberEnginePreference !== 'undefined') {
      appSearchRememberEnginePreference = val !== false;
    }
  }

  function getDefaultEnginePreference() {
    if (typeof appSearchDefaultEnginePreference !== 'undefined') {
      return appSearchDefaultEnginePreference || 'google';
    }
    return 'google';
  }

  function setDefaultEnginePreference(val) {
    if (typeof appSearchDefaultEnginePreference !== 'undefined') {
      appSearchDefaultEnginePreference = val || 'google';
    }
  }

  function buildSearchEngineIconContent(targetEl, engine) {
    if (!targetEl || !engine) return;
    targetEl.replaceChildren();

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip-popup tooltip-top';
    tooltip.textContent = engine.name || '';
    targetEl.appendChild(tooltip);

    let svgEl = null;
    if (typeof createSvgIconElement === 'function' && engine.symbolId) {
      svgEl = createSvgIconElement(engine.symbolId);
    } else if (typeof window !== 'undefined' && typeof window.createSvgIconElement === 'function' && engine.symbolId) {
      svgEl = window.createSvgIconElement(engine.symbolId);
    }
    if (svgEl) {
      targetEl.appendChild(svgEl);
      return;
    }

    const fallback = document.createElement('span');
    fallback.style.fontWeight = 'bold';
    fallback.style.fontSize = '12px';
    fallback.style.color = '#555';
    fallback.textContent = (engine.name || '').charAt(0);
    targetEl.appendChild(fallback);
  }

  function ensureEngineIconExists(engine) {
    if (!engine) return;
    const container = document.getElementById('search-engine-selector');
    if (!container) return;
    const list = container.querySelector('.search-engine-list');
    if (!list) return;

    let btn = list.querySelector(`.engine-icon-btn[data-engine-id="${engine.id}"]`);
    if (btn) return;

    btn = document.createElement('div');
    btn.className = 'engine-icon-btn';
    btn.dataset.engineId = engine.id;
    btn.style.setProperty('--engine-color', engine.color || '#333');

    buildSearchEngineIconContent(btn, engine);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSearchUI(engine.id);

      const selector = document.getElementById('search-engine-selector');
      if (selector) {
        selector.classList.remove('expanded');
        selector.classList.add('suppress-hover');
      }

      if (getRememberPreference()) {
        if (typeof setCurrentSearchEngine === 'function') {
          setCurrentSearchEngine(engine);
        } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setCurrentSearchEngine) {
          HomebaseSearchStorage.setCurrentSearchEngine(engine);
        }
      }

      const input = document.getElementById('search-input');
      if (input) input.focus();
    });

    list.appendChild(btn);
  }

  function updateSearchSelectorPosition() {
    const container = document.getElementById('search-engine-selector');
    const list = container ? container.querySelector('.search-engine-list') : null;
    if (!container || !list) return;

    const allButtons = Array.from(list.querySelectorAll('.engine-icon-btn'));
    if (allButtons.length === 0) return;

    const current = getCurrentEngine();
    if (!current) return;

    const currentIndex = allButtons.findIndex(btn => btn.dataset.engineId === current.id);
    if (currentIndex === -1) return;

    const itemFullWidth = ICON_SIZE + GAP;
    const maxOffset = Math.max(0, (allButtons.length - VISIBLE_COUNT) * itemFullWidth);
    let offset = currentIndex * itemFullWidth;
    offset = Math.max(0, Math.min(offset, maxOffset));

    list.style.transform = `translateX(-${offset}px)`;
  }

  function renderSearchEngineSelector(options = {}) {
    const container = document.getElementById('search-engine-selector');
    if (!container) return;

    const suppressHydrationAnimation = options.animate === false || container.classList.contains('is-instant-fixed');
    if (suppressHydrationAnimation) {
      container.style.transition = 'none';
    }

    container.replaceChildren();

    const list = document.createElement('div');
    list.className = 'search-engine-list';
    if (suppressHydrationAnimation) {
      list.style.transition = 'none';
    }

    const engines = getSearchEngines();
    const activeEngines = engines.filter(e => e.enabled);

    const collapsedWidth = (VISIBLE_COUNT * ICON_SIZE) + (Math.max(0, VISIBLE_COUNT - 1) * GAP);
    const expandedWidth = (activeEngines.length * ICON_SIZE) + (Math.max(0, activeEngines.length - 1) * GAP);

    container.style.setProperty('--collapsed-width', `${collapsedWidth}px`);
    container.style.setProperty('--expanded-width', `${expandedWidth}px`);
    container.style.removeProperty('width');

    const current = getCurrentEngine();

    activeEngines.forEach(engine => {
      const btn = document.createElement('div');
      btn.className = 'engine-icon-btn';
      btn.dataset.engineId = engine.id;
      btn.style.setProperty('--engine-color', engine.color || '#333');

      if (current && current.id === engine.id) {
        btn.classList.add('active');
      }

      buildSearchEngineIconContent(btn, engine);

      if (suppressHydrationAnimation) {
        btn.querySelectorAll('svg, img').forEach(icon => {
          icon.style.animation = 'none';
        });
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateSearchUI(engine.id);

        const selector = document.getElementById('search-engine-selector');
        if (selector) {
          selector.classList.remove('expanded');
          selector.classList.add('suppress-hover');
        }

        if (getRememberPreference()) {
          if (typeof setCurrentSearchEngine === 'function') {
            setCurrentSearchEngine(engine);
          } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setCurrentSearchEngine) {
            HomebaseSearchStorage.setCurrentSearchEngine(engine);
          }
        }

        const input = document.getElementById('search-input');
        if (input) input.focus();
      });

      list.appendChild(btn);
    });

    container.appendChild(list);
    container.classList.remove('is-instant-fixed');

    if (container.dataset.mouseleaveBound !== '1') {
      container.addEventListener('mouseleave', () => {
        container.classList.remove('suppress-hover');
      });
      container.dataset.mouseleaveBound = '1';
    }

    updateSearchSelectorPosition();

    if (suppressHydrationAnimation) {
      void container.offsetWidth;
      container.style.transition = '';
      list.style.transition = '';
    }
  }

  function populateSearchOptions(options = {}) {
    const searchSelect = document.getElementById('search-select');
    if (!searchSelect) return;
    searchSelect.innerHTML = '';

    const engines = getSearchEngines();
    const activeEngines = engines.filter((engine) => engine.enabled);

    if (activeEngines.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'Google';
      option.value = 'google';
      searchSelect.appendChild(option);
    } else {
      activeEngines.forEach((engine) => {
        const option = document.createElement('option');
        option.value = engine.id;
        option.textContent = engine.name;
        searchSelect.appendChild(option);
      });
    }

    renderSearchEngineSelector(options);
  }

  function updateSearchUI(engineId, options = {}) {
    const engines = getSearchEngines();
    let engine = engines.find((e) => e.id === engineId);
    if (!engine) {
      engine = engines.find((e) => e.enabled) || engines[0];
    }
    if (!engine) return;

    setCurrentEngine(engine);

    if (options.updateActive !== false) {
      setActiveEngineId(engine.id);
    }

    ensureEngineIconExists(engine);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = `Search with ${engine.name}`;
    }

    const searchSelect = document.getElementById('search-select');
    if (searchSelect) {
      const previousValue = searchSelect.value;
      searchSelect.value = engine.id;
      if (previousValue !== engine.id && options.animate !== false) {
        searchSelect.classList.remove('engine-switch-anim');
        void searchSelect.offsetWidth;
        searchSelect.classList.add('engine-switch-anim');
      }
    }

    const container = document.getElementById('search-engine-selector');
    if (container) {
      const buttons = container.querySelectorAll('.engine-icon-btn');
      const list = container.querySelector('.search-engine-list');
      const suppressSelectorAnimation = options.animate === false && list;

      if (suppressSelectorAnimation) {
        list.style.transition = 'none';
      }

      buttons.forEach(btn => {
        if (btn.dataset.engineId === engine.id) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      updateSearchSelectorPosition();

      if (suppressSelectorAnimation) {
        void list.offsetWidth;
        list.style.transition = '';
      }
    }

    if (engine.url) {
      preconnectToSearchEngine(engine.url);
    }

    const defaultId = getDefaultEnginePreference();
    const isDefault = engine.id === defaultId;
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.classList.toggle('non-default-engine', !isDefault);
    }

    if (options.updateFastCache === true) {
      if (typeof writeFastSearchCache === 'function') {
        writeFastSearchCache(engine);
      } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.writeFastSearchCache) {
        HomebaseSearchStorage.writeFastSearchCache(engine);
      }
    }
  }

  function preconnectToSearchEngine(url) {
    if (!url) return;
    let origin;
    try {
      origin = new URL(url).origin;
    } catch (e) {
      return;
    }

    if (!document || !document.head) return;
    let link = document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`);
    if (link) return;

    link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function clearSearchUI({ clearInput = true, abortSuggestions = false, bumpToken = false } = {}) {
    if (abortSuggestions) {
      if (typeof abortSuggestionFetch === 'function') {
        abortSuggestionFetch();
      }
    }

    if (bumpToken) {
      if (typeof latestSearchToken !== 'undefined') {
        latestSearchToken++;
      }
    }

    const searchInput = document.getElementById('search-input');
    if (clearInput && searchInput) {
      searchInput.value = '';
    }

    const activeId = getActiveEngineId();
    const current = getCurrentEngine();
    if (activeId && current && current.id !== activeId) {
      updateSearchUI(activeId);
    }

    if (typeof clearAllSelections === 'function') {
      clearAllSelections();
    }
    if (typeof currentSectionIndex !== 'undefined') {
      currentSectionIndex = 0;
    }
    if (typeof lastSelectedText !== 'undefined') {
      lastSelectedText = '';
    }
    if (typeof selectionExplicit !== 'undefined') {
      selectionExplicit = false;
    }

    const searchAreaWrapper = document.querySelector('.search-area-wrapper');
    if (searchAreaWrapper) {
      searchAreaWrapper.classList.remove('search-focused');
    }
    if (document.body) {
      document.body.classList.remove('search-focus-active');
    }

    const bookmarkResults = document.getElementById('bookmark-results-container');
    if (bookmarkResults) bookmarkResults.innerHTML = '';

    const suggestionResults = document.getElementById('suggestion-results-container');
    if (suggestionResults) suggestionResults.innerHTML = '';

    if (typeof lastBookmarkHtml !== 'undefined') {
      lastBookmarkHtml = '';
    }
    if (typeof lastSuggestionHtml !== 'undefined') {
      lastSuggestionHtml = '';
    }

    if (typeof updatePanelVisibility === 'function') {
      updatePanelVisibility();
    }
  }

  function hideSearchResultsPanel() {
    const searchResultsPanel = document.getElementById('search-results-panel');
    if (searchResultsPanel) {
      searchResultsPanel.classList.add('hidden');
    }

    const searchWidget = document.querySelector('.widget-search');
    if (searchWidget) {
      searchWidget.classList.remove('results-open');
    }

    const searchAreaWrapper = document.querySelector('.search-area-wrapper');
    if (searchAreaWrapper) {
      searchAreaWrapper.classList.remove('search-focused');
    }

    if (document.body) {
      document.body.classList.remove('search-focus-active');
    }

    if (typeof clearAllSelections === 'function') {
      clearAllSelections();
    }
    if (typeof currentSectionIndex !== 'undefined') {
      currentSectionIndex = 0;
    }
    if (typeof lastSelectedText !== 'undefined') {
      lastSelectedText = '';
    }
    if (typeof selectionExplicit !== 'undefined') {
      selectionExplicit = false;
    }
  }

  function cycleSearchEngine(direction) {
    const engines = getSearchEngines();
    const activeEngines = engines.filter((eng) => eng.enabled);
    if (activeEngines.length < 2) return;

    const current = getCurrentEngine();
    let currentIndex = current ? activeEngines.findIndex((eng) => eng.id === current.id) : 0;
    if (currentIndex === -1) currentIndex = 0;

    const delta = direction === 'down' ? 1 : -1;
    const nextIndex = (currentIndex + delta + activeEngines.length) % activeEngines.length;
    const nextEngine = activeEngines[nextIndex];

    updateSearchUI(nextEngine.id);
    handleSearchChange();

    const searchInput = document.getElementById('search-input');
    if (searchInput && document.activeElement !== searchInput) {
      searchInput.focus();
    }

    const selector = document.getElementById('search-engine-selector');
    if (selector) {
      selector.classList.remove('suppress-hover');
      selector.classList.add('expanded');

      if (selector.dataset.collapseTimeout) {
        clearTimeout(parseInt(selector.dataset.collapseTimeout, 10));
      }

      const timeoutId = setTimeout(() => {
        selector.classList.remove('expanded');
        selector.classList.add('suppress-hover');
      }, 1500);

      selector.dataset.collapseTimeout = String(timeoutId);
    }
  }

  async function handleSearchChange() {
    const searchSelect = document.getElementById('search-select');
    const current = getCurrentEngine();
    const newId = searchSelect && searchSelect.value ? searchSelect.value : (current ? current.id : 'google');

    updateSearchUI(newId);

    const updatedCurrent = getCurrentEngine();
    if (getRememberPreference() && updatedCurrent) {
      if (typeof setCurrentSearchEngine === 'function') {
        setCurrentSearchEngine(updatedCurrent);
      } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setCurrentSearchEngine) {
        HomebaseSearchStorage.setCurrentSearchEngine(updatedCurrent);
      }
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim().length > 0) {
      if (typeof handleSearchInput === 'function') {
        handleSearchInput();
      }
    }
  }

  function applySearchEngineConfig(savedConfig) {
    let engines = getSearchEngines();
    if (Array.isArray(savedConfig)) {
      const reordered = [];
      const processedIds = new Set();

      savedConfig.forEach((cfg) => {
        if (!cfg || typeof cfg !== 'object') return;
        const id = cfg.id;
        if (!id || processedIds.has(id)) return;
        const match = engines.find((engine) => engine.id === id);
        if (!match) return;

        match.enabled = cfg.enabled !== false;
        reordered.push(match);
        processedIds.add(id);
      });

      engines.forEach((engine) => {
        if (!processedIds.has(engine.id)) {
          reordered.push(engine);
          processedIds.add(engine.id);
        }
      });

      setSearchEngines(reordered);
      return true;
    }

    if (savedConfig && typeof savedConfig === 'object') {
      let applied = false;
      engines.forEach((engine) => {
        if (Object.prototype.hasOwnProperty.call(savedConfig, engine.id)) {
          engine.enabled = savedConfig[engine.id] !== false;
          applied = true;
        }
      });
      return applied;
    }

    return false;
  }

  function getSafeEnabledSearchEngineId(preferredId) {
    const engines = getSearchEngines();
    const preferred = preferredId
      ? engines.find((engine) => engine.id === preferredId && engine.enabled)
      : null;
    if (preferred) return preferred.id;

    const defaultId = getDefaultEnginePreference();
    const defaultEngine = engines.find((engine) => engine.id === defaultId && engine.enabled);
    if (defaultEngine) return defaultEngine.id;

    const firstEnabled = engines.find((engine) => engine.enabled);
    if (firstEnabled) return firstEnabled.id;

    const googleEngine = engines.find((engine) => engine.id === 'google');
    return googleEngine ? googleEngine.id : (engines[0]?.id || 'google');
  }

  async function loadSearchEnginePreferences() {
    let stored = {};
    if (typeof getSearchPreferences === 'function') {
      stored = await getSearchPreferences();
    } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.getSearchPreferences) {
      stored = await HomebaseSearchStorage.getSearchPreferences();
    }

    const savedConfig = stored[SEARCH_ENGINES_PREF_KEY];
    applySearchEngineConfig(savedConfig);

    if (Object.prototype.hasOwnProperty.call(stored, APP_SEARCH_REMEMBER_ENGINE_KEY)) {
      setRememberPreference(stored[APP_SEARCH_REMEMBER_ENGINE_KEY] !== false);
    }

    if (stored[APP_SEARCH_DEFAULT_ENGINE_KEY]) {
      setDefaultEnginePreference(stored[APP_SEARCH_DEFAULT_ENGINE_KEY]);
    }

    const remember = getRememberPreference();
    let targetEngineId = null;

    if (remember) {
      targetEngineId = stored.currentSearchEngineId;
    } else {
      targetEngineId = stored[APP_SEARCH_DEFAULT_ENGINE_KEY] || getDefaultEnginePreference();
    }

    targetEngineId = getSafeEnabledSearchEngineId(targetEngineId);

    const engines = getSearchEngines();
    const resolvedEngine = engines.find((e) => e.id === targetEngineId) || getCurrentEngine();
    if (resolvedEngine) {
      setCurrentEngine(resolvedEngine);
      setActiveEngineId(resolvedEngine.id);
    }

    populateSearchOptions({ animate: false });
    updateSearchUI(targetEngineId, {
      updateActive: true,
      updateFastCache: true,
      animate: false
    });
  }

  async function initialize(options = {}) {
    await loadSearchEnginePreferences();

    const searchSelect = document.getElementById('search-select');
    if (searchSelect && !boundEventListeners) {
      searchSelect.addEventListener('change', () => {
        handleSearchChange();
      });

      searchSelect.addEventListener('wheel', (e) => {
        e.preventDefault();
        const direction = e.deltaY > 0 ? 'down' : 'up';
        cycleSearchEngine(direction);
      });
    }

    const searchInput = document.getElementById('search-input');
    const searchResultsPanel = document.getElementById('search-results-panel');
    const searchWidget = document.querySelector('.widget-search');

    if (!boundEventListeners) {
      document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
        if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          cycleSearchEngine(e.key === 'ArrowDown' ? 'down' : 'up');
        }
      });

      window.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (
          (searchWidget && searchWidget.contains(target)) ||
          (searchResultsPanel && searchResultsPanel.contains(target)) ||
          (searchInput && searchInput.contains(target))
        ) {
          return;
        }
        hideSearchResultsPanel();
      });

      boundEventListeners = true;
    }

    // Reveal search widget
    if (typeof revealWidget === 'function') {
      revealWidget('.widget-search');
    } else {
      const el = document.querySelector('.widget-search');
      if (el) {
        el.classList.remove('widget-hidden-fast');
        el.classList.add('widget-revealed');
      }
    }
  }

  function render(options = {}) {
    populateSearchOptions(options);
  }

  function refresh(options = {}) {
    const cur = getCurrentEngine();
    if (cur) {
      updateSearchUI(cur.id, options);
    }
    updateSearchSelectorPosition();
  }

  function destroy() {
    clearSearchUI({ clearInput: true, abortSuggestions: true });
    hideSearchResultsPanel();
  }

  function handleSearchStorageChange(changes, area) {
    if (!changes || typeof changes !== 'object') return;

    // 1. Remember engine preference
    const rememberChange = changes.appSearchRememberEngine ||
      changes.appSearchRememberEnginePreference ||
      (typeof APP_SEARCH_REMEMBER_ENGINE_KEY !== 'undefined' ? changes[APP_SEARCH_REMEMBER_ENGINE_KEY] : null);
    if (rememberChange) {
      const remember = rememberChange.newValue !== false;
      setRememberPreference(remember);
      if (!remember) {
        const defaultId = getDefaultEnginePreference();
        updateSearchUI(defaultId, { updateFastCache: true });
      }
      if (typeof updateDefaultEngineVisibilityControl === 'function') {
        updateDefaultEngineVisibilityControl();
      } else if (typeof window !== 'undefined' && typeof window.updateDefaultEngineVisibilityControl === 'function') {
        window.updateDefaultEngineVisibilityControl();
      }
    }

    // 2. Default engine preference
    const defaultChange = changes.appSearchDefaultEngine ||
      changes.appSearchDefaultEnginePreference ||
      (typeof APP_SEARCH_DEFAULT_ENGINE_KEY !== 'undefined' ? changes[APP_SEARCH_DEFAULT_ENGINE_KEY] : null);
    if (defaultChange) {
      const requestedDefault = defaultChange.newValue || 'google';
      const previousDefault = getDefaultEnginePreference();
      const safeDefaultId = getSafeEnabledSearchEngineId(requestedDefault);
      setDefaultEnginePreference(safeDefaultId);

      if (typeof populateDefaultEngineSelectControl === 'function') {
        populateDefaultEngineSelectControl();
      } else if (typeof window !== 'undefined' && typeof window.populateDefaultEngineSelectControl === 'function') {
        window.populateDefaultEngineSelectControl();
      }

      if (safeDefaultId !== requestedDefault) {
        if (typeof setDefaultSearchEngineId === 'function') {
          setDefaultSearchEngineId(safeDefaultId);
        } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setDefaultSearchEngineId) {
          HomebaseSearchStorage.setDefaultSearchEngineId(safeDefaultId);
        }
      }

      if (!getRememberPreference()) {
        const current = getCurrentEngine();
        if (!current || current.id === previousDefault) {
          updateSearchUI(safeDefaultId, { updateFastCache: true, animate: false });
        } else {
          const engines = getSearchEngines();
          const defaultEngine = engines.find(e => e.id === safeDefaultId);
          if (defaultEngine) {
            if (typeof writeFastSearchCache === 'function') {
              writeFastSearchCache(defaultEngine);
            } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.writeFastSearchCache) {
              HomebaseSearchStorage.writeFastSearchCache(defaultEngine);
            }
          }
        }
      }
    }

    // 3. Search suggestions preference
    const suggestionsChange = changes.appSearchSuggestionsEnabled ||
      changes.appSearchSuggestionsPreference ||
      (typeof APP_SEARCH_SUGGESTIONS_KEY !== 'undefined' ? changes[APP_SEARCH_SUGGESTIONS_KEY] : null);
    if (suggestionsChange) {
      const enabled = suggestionsChange.newValue !== false;
      if (typeof window !== 'undefined' && window.HomebaseSearchInteractionController?.setSuggestionsPreference) {
        window.HomebaseSearchInteractionController.setSuggestionsPreference(enabled);
      } else if (typeof setSearchSuggestionsPreference === 'function') {
        setSearchSuggestionsPreference(enabled);
      } else if (typeof window !== 'undefined' && typeof window.setSearchSuggestionsPreference === 'function') {
        window.setSearchSuggestionsPreference(enabled);
      }
    }

    // 4. Search engines configuration
    const enginesChange = changes.searchEnginesConfig ||
      changes.searchEngines ||
      (typeof SEARCH_ENGINES_PREF_KEY !== 'undefined' ? changes[SEARCH_ENGINES_PREF_KEY] : null);
    if (enginesChange) {
      const newConfig = enginesChange.newValue;
      if (applySearchEngineConfig(newConfig)) {
        const current = getCurrentEngine();
        const previousEngineId = current ? current.id : null;
        const engines = getSearchEngines();
        const previousEngineStillEnabled = Boolean(previousEngineId && engines.find(e => e.id === previousEngineId && e.enabled));

        let defaultEngineId = null;
        if (typeof populateDefaultEngineSelectControl === 'function') {
          defaultEngineId = populateDefaultEngineSelectControl();
        } else if (typeof window !== 'undefined' && typeof window.populateDefaultEngineSelectControl === 'function') {
          defaultEngineId = window.populateDefaultEngineSelectControl();
        }

        const targetEngineId = getSafeEnabledSearchEngineId(previousEngineId);
        populateSearchOptions({ animate: false });
        updateSearchUI(targetEngineId, { updateFastCache: getRememberPreference(), animate: false });

        if (getRememberPreference() && !previousEngineStillEnabled) {
          if (typeof setCurrentSearchEngine === 'function') {
            setCurrentSearchEngine(targetEngineId);
          } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.setCurrentSearchEngine) {
            HomebaseSearchStorage.setCurrentSearchEngine(targetEngineId);
          }
        }

        if (!getRememberPreference()) {
          const startupEngineId = defaultEngineId || getSafeEnabledSearchEngineId(getDefaultEnginePreference());
          const startupEngine = engines.find(e => e.id === startupEngineId) || current;
          if (startupEngine) {
            if (typeof writeFastSearchCache === 'function') {
              writeFastSearchCache(startupEngine);
            } else if (typeof HomebaseSearchStorage !== 'undefined' && HomebaseSearchStorage.writeFastSearchCache) {
              HomebaseSearchStorage.writeFastSearchCache(startupEngine);
            }
          }
        }
      }
    }

    // 5. Current search engine selection
    if (changes.currentSearchEngineId) {
      const newId = changes.currentSearchEngineId.newValue;
      const current = getCurrentEngine();
      if (getRememberPreference() && newId && (!current || newId !== current.id)) {
        updateSearchUI(newId, { updateFastCache: true, animate: false });
      }
    }
  }

  async function setupSearch() {
    await initialize();
    if (typeof window !== 'undefined' && window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.initialize === 'function') {
      await window.HomebaseSearchInteractionController.initialize({ bindEvents: true });
    }
  }

  // Export to window
  const controller = {
    initialize,
    render,
    refresh,
    destroy,
    handleStorageChange: handleSearchStorageChange,
    setupSearch,

    // Operations
    buildSearchEngineIconContent,
    ensureEngineIconExists,
    updateSearchSelectorPosition,
    renderSearchEngineSelector,
    populateSearchOptions,
    updateSearchUI,
    preconnectToSearchEngine,
    clearSearchUI,
    hideSearchResultsPanel,
    cycleSearchEngine,
    handleSearchChange,
    applySearchEngineConfig,
    getSafeEnabledSearchEngineId,
    loadSearchEnginePreferences,

    // State getters/setters
    getCurrentSearchEngine: getCurrentEngine,
    setCurrentSearchEngine: setCurrentEngine,
    getActiveSearchEngineId: getActiveEngineId,
    getSearchEngines,
    setSearchEngines,
    getRememberEnginePreference: getRememberPreference,
    setRememberEnginePreference: setRememberPreference,
    getDefaultEnginePreference,
    setDefaultEnginePreference
  };

  if (typeof window !== 'undefined') {
    window.HomebaseSearchUiController = controller;
    window.HomebaseSearchEngineController = controller;
    window.handleSearchStorageChange = handleSearchStorageChange;
    window.updateSearchUI = updateSearchUI;
    window.clearSearchUI = clearSearchUI;
    window.hideSearchResultsPanel = hideSearchResultsPanel;
    window.cycleSearchEngine = cycleSearchEngine;
    window.applySearchEngineConfig = applySearchEngineConfig;
    window.getSafeEnabledSearchEngineId = getSafeEnabledSearchEngineId;
    window.setupSearch = setupSearch;
  }
})();
