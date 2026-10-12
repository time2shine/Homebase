(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  const NEWS_EMPTY_MESSAGE = 'No headlines available right now.';
  const NEWS_EMPTY_HINT = 'Try refresh or change source.';

  function safeSetText(el, val) {
    if (!el) return;
    if (globalScope && typeof globalScope.setText === 'function') {
      globalScope.setText(el, val);
    } else {
      el.textContent = val;
    }
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

  function formatNewsUpdated(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function updateNewsUpdated(el, timestamp) {
    if (!el) return;
    safeSetText(el, formatNewsUpdated(timestamp));
  }

  function createNewsItem(item) {
    if (!item) return null;
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

    return li;
  }

  function createEmptyNewsItem(options = {}) {
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

    return empty;
  }

  function renderNewsList(container, items, options = {}) {
    if (!container) return;
    const list = Array.isArray(items) ? items.filter((item) => item && item.title && item.link) : [];

    if (list.length === 0) {
      const empty = createEmptyNewsItem(options);
      if (typeof container.replaceChildren === 'function') {
        container.replaceChildren(empty);
      } else {
        container.innerHTML = '';
        container.appendChild(empty);
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((item) => {
      const li = createNewsItem(item);
      if (li) fragment.appendChild(li);
    });

    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren(fragment);
    } else {
      container.innerHTML = '';
      container.appendChild(fragment);
    }
  }

  let hoverPreviewEl = null;

  function ensureNewsHoverPreview() {
    if (hoverPreviewEl && document && document.body && document.body.contains(hoverPreviewEl)) {
      return hoverPreviewEl;
    }
    if (typeof document === 'undefined' || !document.body) return null;

    const existing = document.getElementById('news-hover-preview');
    if (existing) {
      hoverPreviewEl = existing;
      return existing;
    }

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
    hoverPreviewEl = preview;
    return preview;
  }

  function positionNewsHoverPreview(targetEl, previewEl) {
    if (!targetEl || !previewEl) return;
    const rect = targetEl.getBoundingClientRect();
    const previewRect = previewEl.getBoundingClientRect();
    const padding = 12;
    const offset = 12;

    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 768;

    let left = rect.right + offset;
    if (left + previewRect.width + padding > winWidth) {
      left = rect.left - previewRect.width - offset;
    }
    if (left < padding) left = padding;

    let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
    if (top + previewRect.height + padding > winHeight) {
      top = winHeight - previewRect.height - padding;
    }
    if (top < padding) top = padding;

    previewEl.style.left = `${Math.round(left)}px`;
    previewEl.style.top = `${Math.round(top)}px`;
  }

  function showNewsHoverPreview(itemEl, previewEl = ensureNewsHoverPreview()) {
    if (!previewEl || !itemEl) return;
    previewEl.classList.remove('is-visible');

    const title = itemEl.dataset.newsTitle || '';
    if (!title) return;

    const desc = itemEl.dataset.newsDesc || '';
    const image = itemEl.dataset.newsImage || '';
    const titleEl = previewEl.querySelector('.news-preview-title');
    const descEl = previewEl.querySelector('.news-preview-desc');
    const imageWrap = previewEl.querySelector('.news-preview-image-wrap');
    const imageEl = previewEl.querySelector('.news-preview-image');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (imageEl && imageWrap) {
      if (image) {
        imageEl.src = image;
        imageWrap.style.display = '';
        previewEl.classList.remove('no-image');
      } else {
        imageEl.removeAttribute('src');
        imageWrap.style.display = 'none';
        previewEl.classList.add('no-image');
      }
    }

    if (desc) {
      previewEl.classList.remove('no-desc');
    } else {
      previewEl.classList.add('no-desc');
    }

    positionNewsHoverPreview(itemEl, previewEl);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        previewEl.classList.add('is-visible');
      });
    } else {
      previewEl.classList.add('is-visible');
    }
  }

  function hideNewsHoverPreview(previewEl = hoverPreviewEl) {
    if (previewEl) {
      previewEl.classList.remove('is-visible');
    }
  }

  const renderer = {
    formatTimeAgo,
    formatNewsUpdated,
    updateNewsUpdated,
    createNewsItem,
    createEmptyNewsItem,
    renderNewsList,
    ensureNewsHoverPreview,
    positionNewsHoverPreview,
    showNewsHoverPreview,
    hideNewsHoverPreview
  };

  if (typeof window !== 'undefined') {
    window.HomebaseNewsCardRenderer = renderer;
  }
  if (globalScope) {
    globalScope.HomebaseNewsCardRenderer = renderer;
  }
})();
