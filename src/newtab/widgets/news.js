// ===============================================
// --- NEWS WIDGET & SETTINGS ---
// ===============================================

const newsWidget = document.querySelector('.widget-news');

const newsList = document.getElementById('news-list');

const newsSettingsModal = document.getElementById('news-settings-modal');

const newsSettingsCloseBtn = document.getElementById('news-settings-close-btn');

const newsSettingsCancelBtn = document.getElementById('news-settings-cancel-btn');

const newsSettingsSaveBtn = document.getElementById('news-settings-save-btn');

const newsSourceSelect = document.getElementById('news-source-select');

const newsSettingsBtn = document.getElementById('news-settings-btn');

const newsRefreshBtn = document.getElementById('news-refresh-btn');

const newsUpdatedEl = document.getElementById('news-updated');

const DEFAULT_NEWS_SOURCE_ID = 'aljazeera';

const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

const NEWS_ITEMS_LIMIT = 5;

const NEWS_DESCRIPTION_LIMIT = 220;

const NEWS_EMPTY_MESSAGE = 'No headlines available right now.';

const NEWS_EMPTY_HINT = 'Try refresh or change source.';

const NEWS_SOURCES = [
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'bbc-top', name: 'BBC Top Stories', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc-politics', name: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml' },
  { id: 'bbc-business', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'bbc-technology', name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'bbc-health', name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
  { id: 'bbc-entertainment', name: 'BBC Entertainment', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://feeds.feedburner.com/TechCrunch' },
  { id: 'espn', name: 'ESPN Sports', url: 'https://www.espn.com/espn/rss/news' },
  { id: 'espn-cricinfo', name: 'ESPN Cricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' }
];

let newsRefreshInFlight = false;

let newsFetchWarningLogged = false;

let newsFetchAbortController = null;

let newsIdleRefreshQueued = false;

let newsVisibilityObserver = null;

let newsLazyLoadTriggered = false;

const newsHeaderTooltipMap = new WeakMap();

function resolveNewsSourceId(sourceId) {
  const match = NEWS_SOURCES.find((source) => source.id === sourceId);
  return match ? match.id : DEFAULT_NEWS_SOURCE_ID;
}

function getNewsSourceById(sourceId) {
  const resolved = resolveNewsSourceId(sourceId);
  return NEWS_SOURCES.find((source) => source.id === resolved) || NEWS_SOURCES[0];
}

function ensureNewsSourceOptions() {
  if (!newsSourceSelect || newsSourceSelect.dataset.ready === '1') return;
  newsSourceSelect.innerHTML = '';
  NEWS_SOURCES.forEach((source) => {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    newsSourceSelect.appendChild(option);
  });
  newsSourceSelect.dataset.ready = '1';
}

function closeNewsSettingsModal() {
  closeModalWithAnimation('news-settings-modal', '.dialog-content');
}

async function openNewsSettingsModal(triggerSource) {
  if (!newsSettingsModal) return;
  ensureNewsSourceOptions();
  let storedSource = appNewsSourcePreference || DEFAULT_NEWS_SOURCE_ID;
  try {
    const data = await browser.storage.local.get(APP_NEWS_SOURCE_KEY);
    storedSource = resolveNewsSourceId(data[APP_NEWS_SOURCE_KEY] || storedSource);
  } catch (err) {
    storedSource = resolveNewsSourceId(storedSource);
  }
  if (newsSourceSelect) {
    newsSourceSelect.value = storedSource;
  }
  openModalWithAnimation('news-settings-modal', triggerSource || null, '.dialog-content');
}

function normalizeNewsText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampNewsText(value, maxLength) {
  const text = normalizeNewsText(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const suffix = '...';
  const limit = Math.max(0, maxLength - suffix.length);
  if (!limit) return suffix;
  return `${text.slice(0, limit).trim()}${suffix}`;
}

function stripNewsHtml(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (!raw.includes('<')) return raw;
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return doc.body ? doc.body.textContent || '' : '';
  } catch (err) {
    return '';
  }
}

function extractNewsImageFromHtml(value) {
  const raw = String(value || '');
  if (!raw || !raw.includes('<')) return '';
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const img = doc.querySelector('img');
    return img ? img.getAttribute('src') || '' : '';
  } catch (err) {
    return '';
  }
}

function parseNewsTimestamp(entry) {
  if (!entry) return null;
  const candidates = [
    entry.querySelector('pubDate'),
    entry.querySelector('published'),
    entry.querySelector('updated'),
    entry.querySelector('dc\\:date')
  ];
  for (const node of candidates) {
    const value = node?.textContent?.trim();
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function parseNewsItemsFromXml(xmlText) {
  if (!xmlText) return [];
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  } catch (err) {
    return [];
  }
  if (!doc) return [];
  const items = Array.from(doc.querySelectorAll('item'));
  const entries = items.length ? items : Array.from(doc.querySelectorAll('entry'));
  return entries.map((entry) => {
    const title = entry.querySelector('title')?.textContent?.trim() || '';
    let link = '';
    const linkEl = entry.querySelector('link');
    if (linkEl) {
      link = linkEl.getAttribute('href') || linkEl.textContent || '';
    }
    if (!link) {
      const guidEl = entry.querySelector('guid');
      const guid = guidEl ? guidEl.textContent.trim() : '';
      if (/^https?:/i.test(guid)) link = guid;
    }
    const descriptionNode = entry.querySelector('description') || entry.querySelector('summary') || entry.querySelector('content');
    const rawDescription = descriptionNode?.textContent || '';
    const encodedHtml = entry.querySelector('content\\:encoded')?.textContent || '';
    let description = normalizeNewsText(stripNewsHtml(rawDescription));
    if (!description) {
      description = normalizeNewsText(stripNewsHtml(encodedHtml));
    }
    description = clampNewsText(description, NEWS_DESCRIPTION_LIMIT);

    let image = '';
    const thumbnailEl = entry.querySelector('media\\:thumbnail, thumbnail');
    if (thumbnailEl) {
      image = thumbnailEl.getAttribute('url') || '';
    }
    if (!image) {
      const mediaContentEl = entry.querySelector('media\\:content');
      const mediaUrl = mediaContentEl?.getAttribute('url') || '';
      const mediaType = mediaContentEl?.getAttribute('type') || '';
      const mediaMedium = mediaContentEl?.getAttribute('medium') || '';
      if (mediaUrl && (!mediaType || mediaType.startsWith('image/') || mediaMedium === 'image')) {
        image = mediaUrl;
      }
    }
    if (!image) {
      const enclosureEl = entry.querySelector('enclosure');
      const enclosureUrl = enclosureEl?.getAttribute('url') || '';
      const enclosureType = enclosureEl?.getAttribute('type') || '';
      if (enclosureUrl && (!enclosureType || enclosureType.startsWith('image/'))) {
        image = enclosureUrl;
      }
    }
    if (!image) {
      image = extractNewsImageFromHtml(encodedHtml || rawDescription);
    }

    const publishedAt = parseNewsTimestamp(entry);

    return { title, link, description, image, publishedAt };
  }).filter((item) => item.title && item.link);
}

function orderNewsItems(items, { minDatedRatio }) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!list.length) return list;
  let datedCount = 0;
  for (const item of list) {
    const parsed = Number(item && item.publishedAt);
    if (Number.isFinite(parsed)) {
      datedCount += 1;
    }
  }
  const ratio = list.length ? datedCount / list.length : 0;
  const minRatio = typeof minDatedRatio === 'number' ? minDatedRatio : 0;
  if (ratio < minRatio) return list;
  const indexed = list.map((item, index) => {
    const parsed = Number(item && item.publishedAt);
    return {
      item,
      index,
      publishedAt: Number.isFinite(parsed) ? parsed : -Infinity
    };
  });
  indexed.sort((a, b) => {
    if (b.publishedAt !== a.publishedAt) return b.publishedAt - a.publishedAt;
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.item);
}

function formatNewsUpdated(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatTimeAgo(timestampMs) {
  if (!timestampMs) return '';
  const parsed = Number(timestampMs);
  if (!Number.isFinite(parsed)) return '';
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function updateNewsUpdated(timestamp) {
  if (!newsUpdatedEl) return;
  setText(newsUpdatedEl, formatNewsUpdated(timestamp));
}

function renderNewsItems(items, options = {}) {
  if (!newsList) return;
  const list = Array.isArray(items) ? items.filter((item) => item && item.title && item.link) : [];
  if (list.length === 0) {
    const message = options.emptyMessage || NEWS_EMPTY_MESSAGE;
    const hint = options.emptyHint || NEWS_EMPTY_HINT;
    const empty = document.createElement('li');
    empty.className = 'news-empty';
    empty.textContent = message;
    if (hint) {
      const hintEl = document.createElement('span');
      hintEl.className = 'news-empty-hint';
      hintEl.textContent = hint;
      empty.appendChild(hintEl);
    }
    newsList.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  list.forEach((item) => {
    const title = String(item.title || '');
    const link = String(item.link || '');
    const description = String(item.description || '');
    const image = String(item.image || '');
    const timeAgo = formatTimeAgo(item.publishedAt);

    const li = document.createElement('li');
    li.className = 'news-item';
    li.dataset.newsTitle = title;
    li.dataset.newsDesc = description;
    li.dataset.newsImage = image;
    li.dataset.newsLink = link;

    const anchor = document.createElement('a');
    anchor.className = 'news-title';
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    anchor.textContent = title;
    li.appendChild(anchor);

    if (timeAgo) {
      const meta = document.createElement('div');
      meta.className = 'news-meta';
      const time = document.createElement('span');
      time.className = 'news-time';
      time.textContent = timeAgo;
      meta.appendChild(time);
      li.appendChild(meta);
    }

    fragment.appendChild(li);
  });
  newsList.replaceChildren(fragment);
}

let newsHoverPreviewEl = null;

let newsHoverTarget = null;

function ensureNewsHoverPreview() {
  if (newsHoverPreviewEl) return newsHoverPreviewEl;
  if (!document || !document.body) return null;
  const preview = document.createElement('div');
  preview.id = 'news-hover-preview';
  preview.className = 'tooltip-popup tooltip-news-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = `
    <div class="news-preview-image-wrap">
      <img class="news-preview-image" alt="" />
    </div>
    <div class="news-preview-content">
      <div class="news-preview-title"></div>
      <div class="news-preview-desc"></div>
    </div>
  `;
  document.body.appendChild(preview);
  newsHoverPreviewEl = preview;
  return preview;
}

function positionNewsHoverPreview(targetEl, previewEl) {
  if (!targetEl || !previewEl) return;
  const rect = targetEl.getBoundingClientRect();
  const previewRect = previewEl.getBoundingClientRect();
  const padding = 12;
  const offset = 12;
  let left = rect.right + offset;
  if (left + previewRect.width + padding > window.innerWidth) {
    left = rect.left - previewRect.width - offset;
  }
  if (left < padding) left = padding;
  let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
  if (top + previewRect.height + padding > window.innerHeight) {
    top = window.innerHeight - previewRect.height - padding;
  }
  if (top < padding) top = padding;
  previewEl.style.left = `${Math.round(left)}px`;
  previewEl.style.top = `${Math.round(top)}px`;
}

function showNewsHoverPreview(itemEl) {
  const preview = ensureNewsHoverPreview();
  if (!preview || !itemEl) return;
  preview.classList.remove('is-visible');
  const title = itemEl.dataset.newsTitle || '';
  if (!title) return;
  const desc = itemEl.dataset.newsDesc || '';
  const image = itemEl.dataset.newsImage || '';
  const titleEl = preview.querySelector('.news-preview-title');
  const descEl = preview.querySelector('.news-preview-desc');
  const imageWrap = preview.querySelector('.news-preview-image-wrap');
  const imageEl = preview.querySelector('.news-preview-image');
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (imageEl && imageWrap) {
    if (image) {
      imageEl.src = image;
      imageWrap.style.display = '';
      preview.classList.remove('no-image');
    } else {
      imageEl.removeAttribute('src');
      imageWrap.style.display = 'none';
      preview.classList.add('no-image');
    }
  }
  if (desc) {
    preview.classList.remove('no-desc');
  } else {
    preview.classList.add('no-desc');
  }
  positionNewsHoverPreview(itemEl, preview);
  requestAnimationFrame(() => {
    if (newsHoverTarget !== itemEl) return;
    preview.classList.add('is-visible');
  });
}

function hideNewsHoverPreview() {
  if (newsHoverPreviewEl) {
    newsHoverPreviewEl.classList.remove('is-visible');
  }
  newsHoverTarget = null;
}

function setupNewsHoverPreview() {
  if (!newsList || newsList.dataset.previewReady === '1') return;
  newsList.dataset.previewReady = '1';

  newsList.addEventListener('mouseover', (event) => {
    const item = event.target.closest('.news-item');
    if (!item || !newsList.contains(item) || item === newsHoverTarget) return;
    newsHoverTarget = item;
    showNewsHoverPreview(item);
  });

  newsList.addEventListener('mouseout', (event) => {
    const item = event.target.closest('.news-item');
    if (!item || item !== newsHoverTarget) return;
    if (event.relatedTarget && item.contains(event.relatedTarget)) return;
    hideNewsHoverPreview();
  });

  newsList.addEventListener('mouseleave', hideNewsHoverPreview);
  window.addEventListener('resize', hideNewsHoverPreview);
  document.addEventListener('scroll', hideNewsHoverPreview, true);
}

function readFastNewsCache(sourceId) {
  try {
    if (!window.localStorage) return null;
    const raw = localStorage.getItem('fast-news');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.__timestamp || !Array.isArray(data.items)) return null;
    if (data.source && resolveNewsSourceId(data.source) !== resolveNewsSourceId(sourceId)) return null;
    if ((Date.now() - data.__timestamp) > NEWS_CACHE_TTL_MS) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function scheduleNewsIdleRefresh() {
  if (newsIdleRefreshQueued) return;
  newsIdleRefreshQueued = true;
  scheduleIdleTask(async () => {
    try {
      if (!newsWidget || !newsList || !appShowNewsPreference || !appShowSidebarPreference) return;
      if (newsWidget.classList.contains('force-hidden')) return;
      await fetchAndRenderNews({ force: true });
    } finally {
      newsIdleRefreshQueued = false;
    }
  }, 'news:idleRefresh');
}

async function fetchAndRenderNews(options = {}) {
  if (!newsWidget || !newsList) return;
  const forceFetch = options.force === true;
  const allowFetch = appShowNewsPreference || forceFetch;
  if (!allowFetch) return;

  const source = getNewsSourceById(appNewsSourcePreference);
  const cached = readFastNewsCache(source.id);
  const shouldRender = appShowNewsPreference === true;

  if (shouldRender && cached) {
    if (newsList.children.length === 0) {
      const orderedCached = orderNewsItems(cached.items, { minDatedRatio: 0.6 });
      const cachedItems = orderedCached.slice(0, NEWS_ITEMS_LIMIT);
      renderNewsItems(cachedItems);
      revealWidget('.widget-news');
    }
    updateNewsUpdated(cached.__timestamp);
  }

  if (cached && !forceFetch) {
    scheduleNewsIdleRefresh();
    return;
  }

  if (newsFetchAbortController && !forceFetch) return;

  if (newsFetchAbortController) {
    newsFetchAbortController.abort();
  }
  const abortController = new AbortController();
  newsFetchAbortController = abortController;

  try {
    const response = await fetch(source.url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`News feed unavailable: ${response.status}`);
    }
    const xmlText = await response.text();
    const items = parseNewsItemsFromXml(xmlText);
    if (!items.length) {
      console.warn('[News] 0 items parsed:', source.url || source.id);
      const hasCache = !!(cached && cached.items && cached.items.length);
      if (shouldRender && !hasCache) {
        renderNewsItems([]);
        revealWidget('.widget-news');
        updateNewsUpdated(Date.now());
      }
      return;
    }
    const orderedItems = orderNewsItems(items, { minDatedRatio: 0.6 });
    const renderItems = orderedItems.slice(0, NEWS_ITEMS_LIMIT);
    const fetchedAt = Date.now();
    if (shouldRender) {
      renderNewsItems(renderItems);
      revealWidget('.widget-news');
      updateNewsUpdated(fetchedAt);
    }
    try {
      if (window.localStorage) {
        const cachedHeadroomItems = orderedItems.slice(0, 20).map((item) => ({
          title: String((item && item.title) || ''),
          link: String((item && item.link) || ''),
          description: String((item && item.description) || ''),
          image: String((item && item.image) || ''),
          publishedAt: item && item.publishedAt != null ? item.publishedAt : ''
        }));
        localStorage.setItem('fast-news', JSON.stringify({
          __timestamp: fetchedAt,
          source: source.id,
          items: cachedHeadroomItems
        }));
      }
    } catch (err) {
      // Ignore; fast cache is best-effort only
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    const hasCache = !!(cached && cached.items && cached.items.length);
    if (shouldRender && !hasCache) {
      renderNewsItems([]);
      revealWidget('.widget-news');
      updateNewsUpdated(null);
    }
    if (!newsFetchWarningLogged) {
      console.warn('News fetch failed', err);
      newsFetchWarningLogged = true;
    }
  } finally {
    if (newsFetchAbortController === abortController) {
      newsFetchAbortController = null;
    }
  }
}

function observeNewsWidgetVisibility() {
  if (!newsWidget || !newsList) return;
  if (newsLazyLoadTriggered || newsVisibilityObserver) return;
  if (!appShowNewsPreference || !appShowSidebarPreference) return;
  if (newsWidget.classList.contains('force-hidden')) return;

  newsVisibilityObserver = new IntersectionObserver((entries) => {
    const isVisible = entries.some((entry) => entry.isIntersecting);
    if (!isVisible) return;
    newsLazyLoadTriggered = true;
    if (newsVisibilityObserver) {
      newsVisibilityObserver.disconnect();
      newsVisibilityObserver = null;
    }
    fetchAndRenderNews();
  }, { root: null, threshold: 0.1 });

  newsVisibilityObserver.observe(newsWidget);
}

function ensureNewsHeaderTooltipPortal() {
  if (!document || !document.body) return null;
  let portal = document.getElementById('news-tooltip-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'news-tooltip-portal';
    document.body.appendChild(portal);
  }
  return portal;
}

function showNewsHeaderTooltip(buttonEl) {
  if (!buttonEl) return;
  let tooltip = newsHeaderTooltipMap.get(buttonEl);
  if (!tooltip) {
    tooltip = buttonEl.querySelector('.tooltip-popup');
    if (tooltip) {
      newsHeaderTooltipMap.set(buttonEl, tooltip);
    }
  }
  if (!tooltip) return;
  const portal = ensureNewsHeaderTooltipPortal();
  if (!portal) return;
  portal.appendChild(tooltip);
  tooltip.classList.add('news-header-tooltip-fixed');
  tooltip.style.position = 'fixed';
  tooltip.style.pointerEvents = 'none';

  const buttonRect = buttonEl.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 10;
  const spaceAbove = buttonRect.top;
  let top = buttonRect.top - tooltipRect.height - gap;
  let placeTop = true;
  if (spaceAbove < tooltipRect.height + gap) {
    placeTop = false;
    top = buttonRect.bottom + gap;
  }
  const left = Math.round(buttonRect.left + (buttonRect.width / 2));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.classList.toggle('tooltip-top', placeTop);
  tooltip.classList.toggle('tooltip-bottom', !placeTop);
  requestAnimationFrame(() => {
    tooltip.classList.add('is-visible');
  });
}

function hideNewsHeaderTooltip(buttonEl) {
  if (!buttonEl) return;
  const tooltip = newsHeaderTooltipMap.get(buttonEl) || buttonEl.querySelector('.tooltip-popup');
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  buttonEl.appendChild(tooltip);
  tooltip.classList.remove('news-header-tooltip-fixed');
  tooltip.classList.add('tooltip-top');
  tooltip.classList.remove('tooltip-bottom');
  tooltip.style.position = '';
  tooltip.style.left = '';
  tooltip.style.top = '';
  tooltip.style.pointerEvents = '';
}

function attachNewsHeaderTooltip(buttonEl) {
  if (!buttonEl || buttonEl.dataset.newsTooltipReady === '1') return;
  const tooltip = buttonEl.querySelector('.tooltip-popup');
  if (!tooltip) return;
  newsHeaderTooltipMap.set(buttonEl, tooltip);
  buttonEl.dataset.newsTooltipReady = '1';
  buttonEl.addEventListener('mouseenter', () => showNewsHeaderTooltip(buttonEl));
  buttonEl.addEventListener('focus', () => showNewsHeaderTooltip(buttonEl));
  buttonEl.addEventListener('mouseleave', () => hideNewsHeaderTooltip(buttonEl));
  buttonEl.addEventListener('blur', () => hideNewsHeaderTooltip(buttonEl));
}

function setupNewsWidget() {
  setupNewsHoverPreview();
  if (newsSettingsBtn) {
    newsSettingsBtn.addEventListener('click', () => {
      openNewsSettingsModal(newsSettingsBtn);
    });
  }

  if (newsRefreshBtn) {
    newsRefreshBtn.addEventListener('click', async () => {
      if (newsRefreshInFlight) return;
      newsRefreshInFlight = true;
      newsRefreshBtn.disabled = true;

      try {
        try {
          if (window.localStorage) {
            localStorage.removeItem('fast-news');
          }
        } catch (err) {
          // Ignore; fast cache is best-effort only
        }

        await fetchAndRenderNews({ force: true });
      } finally {
        newsRefreshInFlight = false;
        newsRefreshBtn.disabled = false;
      }
    });
  }

  attachNewsHeaderTooltip(newsSettingsBtn);
  attachNewsHeaderTooltip(newsRefreshBtn);

  if (newsSettingsCloseBtn) {
    newsSettingsCloseBtn.addEventListener('click', closeNewsSettingsModal);
  }

  if (newsSettingsCancelBtn) {
    newsSettingsCancelBtn.addEventListener('click', closeNewsSettingsModal);
  }

  if (newsSettingsModal) {
    newsSettingsModal.addEventListener('click', (e) => {
      if (e.target === newsSettingsModal) {
        closeNewsSettingsModal();
      }
    });
  }

  if (newsSettingsSaveBtn) {
    newsSettingsSaveBtn.addEventListener('click', async () => {
      const selected = resolveNewsSourceId(newsSourceSelect?.value);
      appNewsSourcePreference = selected;
      try {
        await browser.storage.local.set({ [APP_NEWS_SOURCE_KEY]: selected });
      } catch (err) {
        console.warn('Failed to save news source preference', err);
      }
      try {
        if (window.localStorage) {
          localStorage.removeItem('fast-news');
        }
      } catch (err) {
        // Ignore; fast cache is best-effort only
      }
      fetchAndRenderNews({ force: true });
      closeNewsSettingsModal();
    });
  }

  observeNewsWidgetVisibility();
}

function setNewsPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowNewsPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('news-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-news', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_NEWS_KEY]: shouldShow })
      .catch((err) => {
        console.warn('Failed to save news visibility preference', err);
      });
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
    updateWidgetSettingsUI();
  }
}
