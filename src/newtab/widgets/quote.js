// ===============================================

// --- QUOTE WIDGET & SETTINGS ---

// ===============================================

const quoteWidget = document.querySelector('.widget-quote');

const quoteSettingsBtn = document.getElementById('quote-settings-btn');

const quoteSettingsModal = document.getElementById('quote-settings-modal');

const quoteSettingsCloseBtn = document.getElementById('quote-settings-close-btn');

const quoteSettingsCancelBtn = document.getElementById('quote-settings-cancel-btn');

const quoteSettingsSaveBtn = document.getElementById('quote-settings-save-btn');

const quoteCategoriesList = document.getElementById('modal-quote-categories-list');

const quoteFrequencySelect = document.getElementById('quote-frequency-select');

const quoteText = document.getElementById('quote-text');

const quoteAuthor = document.getElementById('quote-author');

const quoteCopyBtn = document.getElementById('quote-copy-btn');

const quoteNextBtn = document.getElementById('quote-next-btn');

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

let quotesCachePromise = null;

let quoteIndexPromise = null;

let quoteIndexCache = null;

function readCachedQuoteState(options = {}) {

  const fallbackState = { current: null, next: null, config: {} };

  let localStateRaw = null;

  try {

    localStateRaw = localStorage.getItem('fast-quote-state');

  } catch (err) {

    if (options.warnOnParse) console.warn('Failed to read quote state', err);

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

    if (options.warnOnParse) console.warn('Failed to parse quote state, resetting', err);

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

  return !!quoteWidget && appShowSidebarPreference && appShowQuotePreference;

}

function renderQuoteToWidget(q) {

  if (!isUsableCachedQuote(q) || !quoteText || !quoteAuthor) return false;

  quoteText.textContent = `"${q.text}"`;

  quoteAuthor.textContent = q.author ? `- ${q.author}` : '';

  revealWidget('.widget-quote');

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

  const url = browser.runtime.getURL(QUOTES_JSON_PATH);

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

    const stored = await browser.storage.local.get([QUOTE_INDEX_KEY]);

    const storedIndex = stored[QUOTE_INDEX_KEY];

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

    await browser.storage.local.set({ [QUOTE_INDEX_KEY]: newIndex });

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


// --- Rebuilt Quote Logic: The "Refiller" ---
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

    const stored = await browser.storage.local.get(['quoteTags', QUOTE_FREQUENCY_KEY]);

    const freq = stored[QUOTE_FREQUENCY_KEY] || QUOTE_DEFAULT_FREQUENCY;

    const tags = Array.isArray(stored.quoteTags) ? stored.quoteTags.filter((t) => typeof t === 'string' && t.trim()) : [];

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

    localStorage.setItem('fast-quote-state', JSON.stringify({
      current: localState.current,
      next: localState.next,
      config: localState.config
    }));

  } catch (e) {

    console.warn('Quote loading failed', e);

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

      localStorage.setItem('fast-quote-state', JSON.stringify(fallbackState));

    } catch (storageErr) {

      console.warn('Failed to cache fallback quote state', storageErr);

    }

  }

}



async function populateQuoteCategories() {

  if (!quoteCategoriesList) return;

  quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Loading categories...</span>';

  const stored = await browser.storage.local.get(['quoteTags']);

  const savedRaw = Array.isArray(stored.quoteTags) ? stored.quoteTags.filter((t) => typeof t === 'string' && t.trim()) : [];

  const savedTags = new Set(savedRaw);

  const render = (tags) => {

    quoteCategoriesList.innerHTML = '';

    const allPill = document.createElement('button');

    allPill.className = 'quote-category-pill';
    allPill.id = 'quote-categories-all-btn';

    allPill.textContent = 'All Categories';

    allPill.dataset.value = '__all__';

    allPill.style.fontWeight = '600';

    quoteCategoriesList.appendChild(allPill);

    const tagPills = [];

    tags.forEach((tag) => {

      const tagName = typeof tag === 'string' ? tag : tag.name;

      if (!tagName) return;

      const pill = document.createElement('button');

      pill.className = 'quote-category-pill';

      pill.textContent = tagName;

      pill.dataset.value = tagName;

      quoteCategoriesList.appendChild(pill);

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

      quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">No categories found</span>';

    }

  } catch (err) {

    console.warn('Failed to load local quote categories', err);

    quoteCategoriesList.innerHTML = '<span style="color:#666; padding:10px;">Unable to load categories</span>';

  }

}

function closeQuoteSettingsModal() {
  closeModalWithAnimation('quote-settings-modal', '.dialog-content');
}

async function openQuoteSettingsModal(triggerSource) {
  populateQuoteCategories();
  const data = await browser.storage.local.get(QUOTE_FREQUENCY_KEY);
  if (quoteFrequencySelect) {
    quoteFrequencySelect.value = data[QUOTE_FREQUENCY_KEY] || QUOTE_DEFAULT_FREQUENCY;
  }
  openModalWithAnimation('quote-settings-modal', triggerSource || null, '.dialog-content');
}

function setupQuoteWidget() {

  renderCachedQuoteState();

  if (quoteSettingsBtn) {

    quoteSettingsBtn.addEventListener('click', () => openQuoteSettingsModal(quoteSettingsBtn));

  }

  if (quoteSettingsCloseBtn) {

    quoteSettingsCloseBtn.addEventListener('click', closeQuoteSettingsModal);

  }

  if (quoteSettingsCancelBtn) {

    quoteSettingsCancelBtn.addEventListener('click', closeQuoteSettingsModal);

  }

  if (quoteCopyBtn) {

    quoteCopyBtn.addEventListener('click', () => {

      const text = quoteText.textContent;

      const author = quoteAuthor.textContent;

      const fullQuote = `${text} ${author}`.trim();

      navigator.clipboard.writeText(fullQuote).then(() => {

        const originalNodes = Array.from(quoteCopyBtn.childNodes).map(node => node.cloneNode(true));

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

        quoteCopyBtn.replaceChildren(svg);

        setTimeout(() => {

          quoteCopyBtn.replaceChildren(...originalNodes);

        }, 1500);

      });

    });

  }

  if (quoteNextBtn) {

    quoteNextBtn.addEventListener('click', () => {

      const icon = quoteNextBtn.querySelector('svg');

      if (icon) {

        icon.style.transition = 'transform 0.4s ease';

        icon.style.transform = 'rotate(360deg)';

        setTimeout(() => {

          icon.style.transition = 'none';

          icon.style.transform = 'none';

        }, 400);

      }

      fetchQuote({ forceRefresh: true });

    });

  }

  if (quoteSettingsModal) {

    quoteSettingsModal.addEventListener('click', (e) => {

      if (e.target === quoteSettingsModal) {

        closeQuoteSettingsModal();

      }

    });

  }

  if (quoteSettingsSaveBtn) {

    quoteSettingsSaveBtn.addEventListener('click', async () => {

      const allPill = quoteCategoriesList ? quoteCategoriesList.querySelector('.quote-category-pill[data-value="__all__"]') : null;

      const categoryPills = quoteCategoriesList ? quoteCategoriesList.querySelectorAll('.quote-category-pill') : [];

      const selectedTags = Array.from(categoryPills)
        .filter((pill) => pill.dataset.value !== '__all__' && pill.classList.contains('selected'))
        .map((pill) => pill.dataset.value);

      const allSelected = allPill ? allPill.classList.contains('selected') : selectedTags.length === 0;

      const tagsToSave = allSelected ? [] : selectedTags;

      const frequency = quoteFrequencySelect ? quoteFrequencySelect.value : QUOTE_DEFAULT_FREQUENCY;

      await browser.storage.local.set({ quoteTags: tagsToSave, [QUOTE_FREQUENCY_KEY]: frequency });

      closeQuoteSettingsModal();

      fetchQuote({ forceRefresh: true, ignorePrefetched: true });

    });

  }

}

function setQuotePreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowQuotePreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('quote-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-quote', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_QUOTE_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save quote visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}
