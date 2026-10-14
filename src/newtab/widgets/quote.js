// ===============================================
// --- QUOTE WIDGET & SETTINGS CONTROLLER ---
// ===============================================

(function () {
  'use strict';

  // Constants
  const QUOTE_FREQUENCY_KEY = 'quoteUpdateFrequency';
  const QUOTES_JSON_PATH = 'assets/quotes.json';
  const QUOTE_INDEX_KEY = 'quoteLocalIndexV1';
  const QUOTE_INDEX_VERSION = 1;
  const QUOTE_SOURCE_MODE = 'local';
  const QUOTE_DEFAULT_FREQUENCY = 'hourly';
  const QUOTE_FALLBACK = {
    id: 'homebase-fallback',
    text: 'Small steps still move you forward.',
    author: '',
    tags: ['fallback']
  };

  // Private state
  let quoteListenerRegistry = null;
  let quoteInitialized = false;
  let quoteCopyTimeout = null;
  let quoteRotateTimeout = null;
  let quotesCachePromise = null;
  let quoteIndexPromise = null;
  let quoteIndexCache = null;

  // Private DOM reference cache
  let domElements = null;

  function resolveDomElements() {
    if (typeof document === 'undefined') {
      return {
        quoteWidget: null,
        quoteSettingsBtn: null,
        quoteSettingsModal: null,
        quoteSettingsCloseBtn: null,
        quoteSettingsCancelBtn: null,
        quoteSettingsSaveBtn: null,
        quoteCategoriesList: null,
        quoteFrequencySelect: null,
        quoteText: null,
        quoteAuthor: null,
        quoteCopyBtn: null,
        quoteNextBtn: null
      };
    }
    return {
      quoteWidget: document.querySelector('.widget-quote'),
      quoteSettingsBtn: document.getElementById('quote-settings-btn'),
      quoteSettingsModal: document.getElementById('quote-settings-modal'),
      quoteSettingsCloseBtn: document.getElementById('quote-settings-close-btn'),
      quoteSettingsCancelBtn: document.getElementById('quote-settings-cancel-btn'),
      quoteSettingsSaveBtn: document.getElementById('quote-settings-save-btn'),
      quoteCategoriesList: document.getElementById('modal-quote-categories-list'),
      quoteFrequencySelect: document.getElementById('quote-frequency-select'),
      quoteText: document.getElementById('quote-text'),
      quoteAuthor: document.getElementById('quote-author'),
      quoteCopyBtn: document.getElementById('quote-copy-btn'),
      quoteNextBtn: document.getElementById('quote-next-btn')
    };
  }

  function getDomElements() {
    if (!domElements) {
      domElements = resolveDomElements();
    }
    return domElements;
  }

  function readCachedQuoteState(options = {}) {
    const fallbackState = { current: null, next: null, config: {} };
    let localStateRaw = null;

    try {
      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getFastMirror === 'function') {
        localStateRaw = HomebaseWidgetStorage.getFastMirror('fast-quote-v2') || HomebaseWidgetStorage.getFastMirror('fast-quote-state');
      }
    } catch (err) {
      if (options.warnOnParse) console.warn('[HomebaseWidgetQuote] Failed to read quote state', err);
      return fallbackState;
    }

    if (!localStateRaw) return fallbackState;

    try {
      const parsed = JSON.parse(localStateRaw);
      if (!parsed || typeof parsed !== 'object') return fallbackState;
      return {
        current: parsed.current || null,
        next: parsed.next || null,
        config: parsed.config || {}
      };
    } catch (err) {
      if (options.warnOnParse) console.warn('[HomebaseWidgetQuote] Failed to parse quote state, resetting', err);
      return fallbackState;
    }
  }

  function isUsableCachedQuote(quote) {
    return !!(quote && typeof quote.text === 'string' && quote.text.trim());
  }

  function shouldRefreshQuoteNow(state, now = Date.now()) {
    if (!isUsableCachedQuote(state?.current)) return true;
    const frequency = state?.config?.frequency || QUOTE_DEFAULT_FREQUENCY;
    if (frequency === 'always') return true;
    const intervalMs = frequency === 'daily' ? 86400 * 1000 : 3600 * 1000;
    const lastShown = Number(state?.config?.lastShown || 0);
    if (!Number.isFinite(lastShown) || lastShown <= 0) return true;
    return now - lastShown > intervalMs;
  }

  function hasUsableCachedQuoteState(state, now = Date.now()) {
    return isUsableCachedQuote(state?.current) && !shouldRefreshQuoteNow(state, now);
  }

  function isQuoteWidgetEnabled() {
    const dom = getDomElements();
    const showSidebar = typeof appShowSidebarPreference !== 'undefined' ? appShowSidebarPreference : true;
    const showQuote = typeof appShowQuotePreference !== 'undefined' ? appShowQuotePreference : true;
    return !!dom.quoteWidget && showSidebar && showQuote;
  }

  function renderQuoteToWidget(q) {
    const dom = getDomElements();
    if (typeof HomebaseQuoteCardRenderer !== 'undefined' && HomebaseQuoteCardRenderer.renderQuoteCard) {
      return HomebaseQuoteCardRenderer.renderQuoteCard(q, { quoteText: dom.quoteText, quoteAuthor: dom.quoteAuthor });
    }

    if (!isUsableCachedQuote(q) || !dom.quoteText || !dom.quoteAuthor) return false;

    dom.quoteText.textContent = `"${q.text}"`;
    dom.quoteAuthor.textContent = q.author ? `- ${q.author}` : '';

    if (typeof revealWidget === 'function') {
      revealWidget('.widget-quote');
    }

    return true;
  }

  function renderCachedQuoteState(state = readCachedQuoteState()) {
    if (!isQuoteWidgetEnabled()) return false;
    return renderQuoteToWidget(state?.current);
  }

  function shouldLoadQuoteCatalog(options = {}) {
    if (options.forceRefresh === true) return true;
    if (!isQuoteWidgetEnabled()) return false;
    const state = options.state || readCachedQuoteState();
    return !hasUsableCachedQuoteState(state, options.now || Date.now());
  }

  function hasUsableStoredQuoteIndex(index) {
    return !!(
      index
      && index.version === QUOTE_INDEX_VERSION
      && Number.isFinite(index.count)
      && index.count > 0
      && Array.isArray(index.allIds)
      && index.allIds.length === index.count
      && index.tagToIds
      && typeof index.tagToIds === 'object'
      && !Array.isArray(index.tagToIds)
    );
  }

  // Local quote loader (bundled JSON)
  async function loadLocalQuotes() {
    const url = typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL
      ? browser.runtime.getURL(QUOTES_JSON_PATH)
      : QUOTES_JSON_PATH;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Failed to load local quotes');
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid quotes format');
    }

    const sanitized = data.map((q) => {
      const tags = Array.isArray(q?.tags)
        ? q.tags.map((t) => typeof t === 'string' ? t.trim() : '').filter(Boolean)
        : [];

      return {
        id: q.id,
        text: q.text,
        author: q.author || '',
        tags
      };
    }).filter((q) => q.id !== undefined && typeof q.text === 'string');

    return sanitized;
  }

  async function loadLocalQuotesCached() {
    if (!quotesCachePromise) {
      quotesCachePromise = (async () => {
        const quotes = await loadLocalQuotes();
        const quotesById = new Map();
        for (const q of quotes) {
          quotesById.set(q.id, q);
        }
        return { quotes, quotesById };
      })();
    }
    return quotesCachePromise;
  }

  // Build and cache quote ID index for quick tag lookups
  async function ensureQuoteIndexBuilt() {
    if (quoteIndexCache) return quoteIndexCache;
    if (quoteIndexPromise) return quoteIndexPromise;

    quoteIndexPromise = (async () => {
      let storedIndex = null;
      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getQuoteCache === 'function') {
        try {
          const cache = await HomebaseWidgetStorage.getQuoteCache();
          storedIndex = cache ? cache.index : null;
        } catch (_) {}
      }

      if (hasUsableStoredQuoteIndex(storedIndex)) {
        quoteIndexCache = storedIndex;
        return storedIndex;
      }

      const { quotes } = await loadLocalQuotesCached();
      const tagToIds = {};
      const allIds = [];

      for (const q of quotes) {
        if (q.id === undefined || q.id === null) continue;
        allIds.push(q.id);
        for (const tag of q.tags || []) {
          if (!tagToIds[tag]) {
            tagToIds[tag] = [];
          }
          tagToIds[tag].push(q.id);
        }
      }

      const newIndex = {
        version: QUOTE_INDEX_VERSION,
        builtAt: Date.now(),
        count: allIds.length,
        allIds,
        tagToIds
      };

      quoteIndexCache = newIndex;

      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setQuoteCache === 'function') {
        await HomebaseWidgetStorage.setQuoteCache({ index: newIndex });
      }

      return newIndex;
    })();

    try {
      return await quoteIndexPromise;
    } finally {
      quoteIndexPromise = null;
    }
  }

  async function getLocalQuote(tags = [], avoidId = null) {
    const normalizedTags = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t.trim()) : [];
    const index = await ensureQuoteIndexBuilt();
    const { quotesById } = await loadLocalQuotesCached();

    let candidateIds = [];

    if (normalizedTags.length === 0) {
      candidateIds = index.allIds.slice();
    } else {
      const set = new Set();
      normalizedTags.forEach((tag) => {
        const ids = index.tagToIds[tag];
        if (Array.isArray(ids)) {
          ids.forEach((id) => set.add(id));
        }
      });
      candidateIds = Array.from(set);
      if (candidateIds.length === 0) {
        candidateIds = index.allIds.slice();
      }
    }

    if (!candidateIds.length) {
      throw new Error('No local quotes available');
    }

    if (avoidId !== null && candidateIds.length > 1) {
      const filtered = candidateIds.filter((id) => id !== avoidId);
      if (filtered.length) {
        candidateIds = filtered;
      }
    }

    const selectedId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
    const quote = quotesById.get(selectedId) || quotesById.values().next().value;

    if (!quote) {
      throw new Error('No quote object found for selected id');
    }

    return {
      id: quote.id,
      text: quote.text,
      author: quote.author,
      tags: quote.tags || []
    };
  }

  async function getLocalQuoteTags() {
    const index = await ensureQuoteIndexBuilt();
    const tags = Object.keys(index.tagToIds || {});
    tags.sort((a, b) => a.localeCompare(b));
    return tags.map((name) => ({ name }));
  }

  // --- Quote Logic: The "Refiller" ---
  async function fetchQuote(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const ignorePrefetched = options.ignorePrefetched === true;

    try {
      let localState = readCachedQuoteState({ warnOnParse: true });
      const now = Date.now();

      if (!forceRefresh && hasUsableCachedQuoteState(localState, now)) {
        renderQuoteToWidget(localState.current);
        return;
      }

      let stored = {};
      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getQuoteCache === 'function') {
        try {
          stored = await HomebaseWidgetStorage.getQuoteCache();
        } catch (_) {}
      }

      const freq = stored.frequency || QUOTE_DEFAULT_FREQUENCY;
      const tags = Array.isArray(stored.tags) ? stored.tags.filter((t) => typeof t === 'string' && t.trim()) : [];

      localState.config.frequency = freq;
      localState.config.source = QUOTE_SOURCE_MODE;

      const renderQuote = renderQuoteToWidget;
      let rotatedFromNext = false;

      if (forceRefresh && !ignorePrefetched && localState.next && localState.next.text) {
        localState.current = localState.next;
        localState.next = null;
        localState.config.lastShown = now;
        rotatedFromNext = true;
        renderQuote(localState.current);
      }

      if (!localState.current || !localState.current.text) {
        const q = await getLocalQuote(tags);
        localState.current = q;
        localState.config.lastShown = now;
        renderQuote(q);
      } else if (forceRefresh && !rotatedFromNext) {
        const newCurrent = await getLocalQuote(tags, localState.current.id);
        localState.current = newCurrent;
        localState.config.lastShown = now;
        renderQuote(newCurrent);
      } else {
        renderQuote(localState.current);
      }

      const avoidId = localState.current ? localState.current.id : null;
      const shouldRefreshNext = forceRefresh || !localState.next || !localState.next.text || (avoidId !== null && localState.next.id === avoidId);

      if (shouldRefreshNext) {
        const nextQ = await getLocalQuote(tags, avoidId);
        localState.next = nextQ;
      }

      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setQuoteCache === 'function') {
        HomebaseWidgetStorage.setQuoteCache({
          current: localState.current,
          next: localState.next,
          config: localState.config
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[HomebaseWidgetQuote] Quote loading failed', e);
      const cachedState = readCachedQuoteState();

      if (isUsableCachedQuote(cachedState?.current)) {
        renderQuoteToWidget(cachedState.current);
        return;
      }

      const now = Date.now();
      const fallbackState = {
        current: QUOTE_FALLBACK,
        next: isUsableCachedQuote(cachedState?.next) ? cachedState.next : null,
        config: {
          ...(cachedState?.config && typeof cachedState.config === 'object' ? cachedState.config : {}),
          frequency: cachedState?.config?.frequency || QUOTE_DEFAULT_FREQUENCY,
          source: QUOTE_SOURCE_MODE,
          lastShown: now,
          fallback: true
        }
      };

      renderQuoteToWidget(QUOTE_FALLBACK);

      try {
        if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setQuoteCache === 'function') {
          HomebaseWidgetStorage.setQuoteCache(fallbackState).catch(() => {});
        }
      } catch (storageErr) {
        console.warn('[HomebaseWidgetQuote] Failed to cache fallback quote state', storageErr);
      }
    }
  }

  async function populateQuoteCategories() {
    const dom = getDomElements();
    if (!dom.quoteCategoriesList) return;

    dom.quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Loading categories...</span>';

    let savedRaw = [];
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getQuoteCache === 'function') {
      try {
        const cache = await HomebaseWidgetStorage.getQuoteCache();
        savedRaw = Array.isArray(cache.tags) ? cache.tags.filter((t) => typeof t === 'string' && t.trim()) : [];
      } catch (_) {}
    }

    const savedTags = new Set(savedRaw);

    const render = (tags) => {
      if (typeof HomebaseQuoteCardRenderer !== 'undefined' && HomebaseQuoteCardRenderer.renderCategoryPills) {
        HomebaseQuoteCardRenderer.renderCategoryPills(dom.quoteCategoriesList, tags, savedTags);
        return;
      }

      dom.quoteCategoriesList.innerHTML = '';
      const allPill = document.createElement('button');
      allPill.className = 'quote-category-pill';
      allPill.id = 'quote-categories-all-btn';
      allPill.textContent = 'All Categories';
      allPill.dataset.value = '__all__';
      allPill.style.fontWeight = '600';
      dom.quoteCategoriesList.appendChild(allPill);

      const tagPills = [];
      tags.forEach((tag) => {
        const tagName = typeof tag === 'string' ? tag : tag.name;
        if (!tagName) return;
        const pill = document.createElement('button');
        pill.className = 'quote-category-pill';
        pill.textContent = tagName;
        pill.dataset.value = tagName;
        dom.quoteCategoriesList.appendChild(pill);
        tagPills.push(pill);
      });

      const isAllMode = savedTags.size === 0;
      if (isAllMode) {
        allPill.classList.add('selected');
      } else {
        tagPills.forEach((pill) => {
          if (savedTags.has(pill.dataset.value)) {
            pill.classList.add('selected');
          }
        });
        const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));
        if (!anySelected) {
          allPill.classList.add('selected');
        }
      }

      const selectAllOnly = () => {
        allPill.classList.add('selected');
        tagPills.forEach((pill) => pill.classList.remove('selected'));
      };

      const ensureFallbackAll = () => {
        const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));
        if (!anySelected) {
          selectAllOnly();
        }
      };

      allPill.addEventListener('click', () => {
        selectAllOnly();
      });

      tagPills.forEach((pill) => {
        pill.addEventListener('click', () => {
          allPill.classList.remove('selected');
          pill.classList.toggle('selected');
          ensureFallbackAll();
        });
      });
    };

    try {
      const categories = await getLocalQuoteTags();
      if (categories.length > 0) {
        render(categories);
      } else {
        dom.quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">No categories found</span>';
      }
    } catch (err) {
      console.warn('[HomebaseWidgetQuote] Failed to load local quote categories', err);
      dom.quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Unable to load categories</span>';
    }
  }

  function closeQuoteSettingsModal() {
    if (typeof closeModalWithAnimation === 'function') {
      closeModalWithAnimation('quote-settings-modal', '.dialog-content');
    }
  }

  async function openQuoteSettingsModal(triggerSource) {
    const dom = getDomElements();
    populateQuoteCategories();
    let freq = QUOTE_DEFAULT_FREQUENCY;
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getQuoteCache === 'function') {
      try {
        const cache = await HomebaseWidgetStorage.getQuoteCache();
        freq = cache.frequency || QUOTE_DEFAULT_FREQUENCY;
      } catch (_) {}
    }
    if (dom.quoteFrequencySelect) {
      dom.quoteFrequencySelect.value = freq;
    }
    if (typeof openModalWithAnimation === 'function') {
      openModalWithAnimation('quote-settings-modal', triggerSource || null, '.dialog-content');
    }
  }

  function initialize() {
    if (quoteInitialized) return;
    quoteInitialized = true;

    domElements = resolveDomElements();
    const dom = domElements;

    if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.createListenerRegistry === 'function') {
      quoteListenerRegistry = HomebaseWidgetLifecycle.createListenerRegistry();
    } else {
      quoteListenerRegistry = {
        on(target, type, fn, opt) { target?.addEventListener(type, fn, opt); },
        removeAll() {}
      };
    }

    renderCachedQuoteState();

    if (dom.quoteSettingsBtn) {
      quoteListenerRegistry.on(dom.quoteSettingsBtn, 'click', () => openQuoteSettingsModal(dom.quoteSettingsBtn));
    }

    if (dom.quoteSettingsCloseBtn) {
      quoteListenerRegistry.on(dom.quoteSettingsCloseBtn, 'click', closeQuoteSettingsModal);
    }

    if (dom.quoteSettingsCancelBtn) {
      quoteListenerRegistry.on(dom.quoteSettingsCancelBtn, 'click', closeQuoteSettingsModal);
    }

    if (dom.quoteCopyBtn) {
      quoteListenerRegistry.on(dom.quoteCopyBtn, 'click', () => {
        const currentDom = getDomElements();
        const text = currentDom.quoteText ? currentDom.quoteText.textContent : '';
        const author = currentDom.quoteAuthor ? currentDom.quoteAuthor.textContent : '';
        const fullQuote = `${text} ${author}`.trim();

        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(fullQuote).then(() => {
            if (typeof HomebaseQuoteCardRenderer !== 'undefined' && HomebaseQuoteCardRenderer.renderCopySuccess) {
              HomebaseQuoteCardRenderer.renderCopySuccess(currentDom.quoteCopyBtn, 1500);
              return;
            }

            if (!currentDom.quoteCopyBtn) return;
            const originalNodes = Array.from(currentDom.quoteCopyBtn.childNodes).map((node) => node.cloneNode(true));
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '24');
            svg.setAttribute('height', '24');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', '#4ade80');
            svg.setAttribute('stroke-width', '2');
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points', '20 6 9 17 4 12');
            svg.appendChild(polyline);

            currentDom.quoteCopyBtn.replaceChildren(svg);

            clearTimeout(quoteCopyTimeout);
            quoteCopyTimeout = setTimeout(() => {
              if (currentDom.quoteCopyBtn) {
                currentDom.quoteCopyBtn.replaceChildren(...originalNodes);
              }
            }, 1500);
          }).catch(() => {});
        }
      });
    }

    if (dom.quoteNextBtn) {
      quoteListenerRegistry.on(dom.quoteNextBtn, 'click', () => {
        const currentDom = getDomElements();
        const icon = currentDom.quoteNextBtn ? currentDom.quoteNextBtn.querySelector('svg') : null;
        if (icon) {
          icon.style.transition = 'transform 0.4s ease';
          icon.style.transform = 'rotate(360deg)';
          clearTimeout(quoteRotateTimeout);
          quoteRotateTimeout = setTimeout(() => {
            icon.style.transition = 'none';
            icon.style.transform = 'none';
          }, 400);
        }
        fetchQuote({ forceRefresh: true });
      });
    }

    if (dom.quoteSettingsModal) {
      quoteListenerRegistry.on(dom.quoteSettingsModal, 'click', (e) => {
        if (e.target === dom.quoteSettingsModal) {
          closeQuoteSettingsModal();
        }
      });
    }

    if (dom.quoteSettingsSaveBtn) {
      quoteListenerRegistry.on(dom.quoteSettingsSaveBtn, 'click', async () => {
        const currentDom = getDomElements();
        const allPill = currentDom.quoteCategoriesList ? currentDom.quoteCategoriesList.querySelector('.quote-category-pill[data-value="__all__"]') : null;
        const categoryPills = currentDom.quoteCategoriesList ? currentDom.quoteCategoriesList.querySelectorAll('.quote-category-pill') : [];
        const selectedTags = Array.from(categoryPills)
          .filter((pill) => pill.dataset.value !== '__all__' && pill.classList.contains('selected'))
          .map((pill) => pill.dataset.value);
        const allSelected = allPill ? allPill.classList.contains('selected') : selectedTags.length === 0;
        const tagsToSave = allSelected ? [] : selectedTags;
        const frequency = currentDom.quoteFrequencySelect ? currentDom.quoteFrequencySelect.value : QUOTE_DEFAULT_FREQUENCY;

        if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setQuoteCache === 'function') {
          await HomebaseWidgetStorage.setQuoteCache({ tags: tagsToSave, frequency });
        }

        closeQuoteSettingsModal();
        fetchQuote({ forceRefresh: true, ignorePrefetched: true });
      });
    }
  }

  function destroy() {
    if (quoteListenerRegistry) {
      quoteListenerRegistry.removeAll();
      quoteListenerRegistry = null;
    }
    clearTimeout(quoteCopyTimeout);
    quoteCopyTimeout = null;
    clearTimeout(quoteRotateTimeout);
    quoteRotateTimeout = null;
    quoteInitialized = false;
    domElements = null;
  }

  function onShow() {
    if (!quoteInitialized) {
      initialize();
      return;
    }
    renderCachedQuoteState();
  }

  function onHide() {
    clearTimeout(quoteCopyTimeout);
    quoteCopyTimeout = null;
    clearTimeout(quoteRotateTimeout);
    quoteRotateTimeout = null;
  }

  function pause() {
    clearTimeout(quoteCopyTimeout);
    quoteCopyTimeout = null;
    clearTimeout(quoteRotateTimeout);
    quoteRotateTimeout = null;
  }

  function resume() {
    if (!quoteInitialized) return;
    renderCachedQuoteState();
  }

  function setupQuoteWidget() {
    return HomebaseWidgetQuote.initialize();
  }

  function setQuotePreference(show = true, options = {}) {
    const shouldShow = show !== false;
    if (typeof appShowQuotePreference !== 'undefined') {
      appShowQuotePreference = shouldShow;
    }
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && 'appShowQuotePreference' in globalScope) {
      globalScope.appShowQuotePreference = shouldShow;
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('quote-hidden', !shouldShow);
    }

    if (options.persist !== false && typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setFastMirror === 'function') {
      HomebaseWidgetStorage.setFastMirror('fast-show-quote', shouldShow ? '1' : '0');
    }

    if (options.applyVisibility !== false && typeof applyWidgetVisibility === 'function') {
      applyWidgetVisibility();
    }

    if (options.updateUI !== false && typeof updateWidgetSettingsUI === 'function') {
      updateWidgetSettingsUI();
    }
  }

  const HomebaseWidgetQuote = {
    initialize,
    init: initialize,
    destroy,
    onShow,
    onHide,
    pause,
    resume,
    fetchQuote,
    readCachedQuoteState,
    renderCachedQuoteState,
    shouldLoadQuoteCatalog,
    ensureQuoteIndexBuilt,
    setupQuoteWidget,
    setPreference: setQuotePreference,
    setQuotePreference,
    openQuoteSettingsModal,
    closeQuoteSettingsModal
  };

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope) {
    globalScope.HomebaseWidgetQuote = HomebaseWidgetQuote;
    globalScope.HomebaseQuoteWidgetController = HomebaseWidgetQuote;
    globalScope.setupQuoteWidget = setupQuoteWidget;
    globalScope.setQuotePreference = setQuotePreference;
    globalScope.fetchQuote = fetchQuote;
    globalScope.readCachedQuoteState = readCachedQuoteState;
    globalScope.renderCachedQuoteState = renderCachedQuoteState;
    globalScope.shouldLoadQuoteCatalog = shouldLoadQuoteCatalog;
    globalScope.ensureQuoteIndexBuilt = ensureQuoteIndexBuilt;
    globalScope.openQuoteSettingsModal = openQuoteSettingsModal;
  }
  if (typeof window !== 'undefined' && globalScope !== window) {
    window.HomebaseWidgetQuote = HomebaseWidgetQuote;
    window.HomebaseQuoteWidgetController = HomebaseWidgetQuote;
    window.setupQuoteWidget = setupQuoteWidget;
    window.setQuotePreference = setQuotePreference;
    window.fetchQuote = fetchQuote;
    window.readCachedQuoteState = readCachedQuoteState;
    window.renderCachedQuoteState = renderCachedQuoteState;
    window.shouldLoadQuoteCatalog = shouldLoadQuoteCatalog;
    window.ensureQuoteIndexBuilt = ensureQuoteIndexBuilt;
    window.openQuoteSettingsModal = openQuoteSettingsModal;
  }

  if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
    HomebaseWidgetLifecycle.registerWidget('quote', HomebaseWidgetQuote);
  }
})();
