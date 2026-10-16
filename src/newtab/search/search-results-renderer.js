/**
 * Homebase Search Results Renderer
 * Module: src/newtab/search/search-results-renderer.js
 * Dedicated view renderer for search results dropdown DOM generation,
 * SVG icons, calculation results, bookmarks, bang shortcuts, history,
 * suggestion items, signature reconciliation, and favicon hydration.
 */
(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  function isElementOrObject(obj) {
    if (!obj) return false;
    if (typeof Element !== 'undefined' && obj instanceof Element) return true;
    return typeof obj === 'object';
  }

  function createSvgIcon(id) {
    if (typeof globalScope.createSvgIconElement === 'function') {
      return globalScope.createSvgIconElement(id);
    }
    if (typeof createSvgIconElement === 'function') {
      return createSvgIconElement(id);
    }
    return null;
  }

  function createSectionHeader(title, options = {}) {
    if (typeof document === 'undefined') return null;
    const header = document.createElement('div');
    header.className = 'result-header';
    if (options && options.externalSuggestions) {
      header.dataset.externalSuggestions = 'true';
    }
    header.textContent = String(title || '');
    return header;
  }

  function createCalculatorItem(calcData) {
    if (calcData === null || calcData === undefined || typeof document === 'undefined') return null;

    let displayResult = '';
    let expression = '';

    if (typeof calcData === 'object') {
      displayResult = String(calcData.displayResult ?? calcData.value ?? '');
      expression = String(calcData.expression ?? calcData.query ?? '');
    } else {
      displayResult = String(calcData);
    }

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

    const exprEl = document.createElement('div');
    exprEl.className = 'calc-expression';
    exprEl.textContent = expression;

    textWrap.appendChild(answer);
    textWrap.appendChild(exprEl);
    left.appendChild(icon);
    left.appendChild(textWrap);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'calc-copy';
    copyBtn.dataset.copy = displayResult;
    copyBtn.textContent = 'Copy';

    item.appendChild(left);
    item.appendChild(copyBtn);
    return item;
  }

  function createBookmarkItem(bookmark) {
    if (!bookmark || typeof bookmark !== 'object' || typeof document === 'undefined') return null;

    const bookmarkUrl = bookmark.url || '';
    if (!bookmarkUrl) return null;

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
    return button;
  }

  function createBangItem(bangItem) {
    if (!bangItem || typeof bangItem !== 'object' || typeof document === 'undefined') return null;

    const rawBang = String(bangItem.bang || '');
    const bangCode = rawBang.startsWith('!') ? rawBang : `!${rawBang}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-item';
    button.dataset.bangInsert = `${bangCode} `;

    const badge = document.createElement('span');
    badge.className = 'bang-badge';
    badge.textContent = bangCode;
    button.appendChild(badge);

    if (bangItem.engine && bangItem.engine.symbolId) {
      const engineIcon = createSvgIcon(bangItem.engine.symbolId);
      if (engineIcon) {
        button.appendChild(engineIcon);
      }
    }

    const info = document.createElement('div');
    info.className = 'result-item-info';
    const label = document.createElement('strong');
    label.className = 'result-label';
    label.textContent = bangItem.engine?.name || '';
    info.appendChild(label);
    button.appendChild(info);
    return button;
  }

  function createBangEmptyItem() {
    if (typeof document === 'undefined') return null;

    const item = document.createElement('div');
    item.className = 'result-item';
    const info = document.createElement('div');
    info.className = 'result-item-info';
    info.style.justifyContent = 'center';
    info.style.color = '#888';
    info.textContent = 'No matching bangs';
    item.appendChild(info);
    return item;
  }

  function createHistoryItem(historyItem) {
    if (!historyItem || typeof historyItem !== 'object' || typeof document === 'undefined') return null;

    const url = historyItem.url || '';
    if (!url) return null;
    const title = historyItem.title || url;

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
    return button;
  }

  function createDirectQueryItem(engine, query) {
    if (typeof document === 'undefined') return null;

    const rawQuery = String(query || '');
    const encoded = encodeURIComponent(rawQuery);
    const engineUrl = engine?.url || 'https://www.google.com/search?q=%s';
    const searchUrl = engineUrl.includes('%s')
      ? engineUrl.replace('%s', encoded)
      : `${engineUrl}${encoded}`;

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
    directLabel.textContent = rawQuery;
    directInfo.appendChild(directLabel);
    directButton.appendChild(directInfo);
    return directButton;
  }

  function createSuggestionItem(engine, suggestion) {
    if (typeof document === 'undefined') return null;

    const rawSuggestion = String(suggestion || '');
    const encoded = encodeURIComponent(rawSuggestion);
    const engineUrl = engine?.url || 'https://www.google.com/search?q=%s';
    const suggestionUrl = engineUrl.includes('%s')
      ? engineUrl.replace('%s', encoded)
      : `${engineUrl}${encoded}`;

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
    label.textContent = rawSuggestion;
    info.appendChild(label);

    button.appendChild(info);
    return button;
  }

  function renderTopResults(container, data = {}) {
    if (!container || typeof document === 'undefined') return { mounted: false, signature: '' };
    const { calc = null, bookmarks = [], query = '' } = data;

    const topSignature = JSON.stringify({
      calc: calc !== null ? { value: String(calc.displayResult ?? calc.value ?? calc), query } : null,
      bookmarks: (bookmarks || []).map(b => ({
        url: b?.url || '',
        title: b?.title || ''
      }))
    });

    if (container._lastSignature === topSignature) {
      return { mounted: false, signature: topSignature, unchanged: true };
    }

    const fragment = document.createDocumentFragment();

    if (calc !== null && calc !== undefined) {
      const calcHeader = createSectionHeader('Calculator');
      const calcItem = createCalculatorItem(calc);
      if (calcHeader && calcItem) {
        fragment.appendChild(calcHeader);
        fragment.appendChild(calcItem);
      }
    }

    if (Array.isArray(bookmarks) && bookmarks.length > 0) {
      const bmHeader = createSectionHeader('Bookmarks');
      if (bmHeader) fragment.appendChild(bmHeader);
      bookmarks.forEach(b => {
        const item = createBookmarkItem(b);
        if (item) fragment.appendChild(item);
      });
    }

    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren(fragment);
    } else {
      container.innerHTML = '';
      container.appendChild(fragment);
    }

    container._lastSignature = topSignature;
    hydrateFavicons(container);
    return { mounted: true, signature: topSignature, unchanged: false };
  }

  function renderBottomResults(container, data = {}) {
    if (!container || typeof document === 'undefined') return { mounted: false, signature: '' };
    const { history = [], suggestions = [], engine = null, query = '', shownUrls = new Set() } = data;

    const bottomSignature = JSON.stringify({
      history: (history || []).map(item => ({ url: item?.url || '', title: item?.title || '' })),
      suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 10) : [],
      engine: engine?.id || '',
      query
    });

    if (container._lastSignature === bottomSignature) {
      return { mounted: false, signature: bottomSignature, unchanged: true };
    }

    const fragment = document.createDocumentFragment();

    if (Array.isArray(history) && history.length > 0) {
      const uniqueHistory = history.filter(item => item && item.url && !shownUrls.has(item.url));
      if (uniqueHistory.length > 0) {
        const historyHeader = createSectionHeader('Recent History');
        if (historyHeader) fragment.appendChild(historyHeader);
        uniqueHistory.forEach(item => {
          const row = createHistoryItem(item);
          if (row) fragment.appendChild(row);
        });
      }
    }

    if (Array.isArray(suggestions) && suggestions.length > 0 && engine) {
      const engineName = engine.name || 'Search';
      const sugHeader = createSectionHeader(`${engineName} Search`, { externalSuggestions: true });
      if (sugHeader) fragment.appendChild(sugHeader);

      const directItem = createDirectQueryItem(engine, query);
      if (directItem) fragment.appendChild(directItem);

      suggestions.slice(0, 10).forEach(suggestion => {
        if (String(suggestion).toLowerCase() === String(query).toLowerCase()) return;
        const sugItem = createSuggestionItem(engine, suggestion);
        if (sugItem) fragment.appendChild(sugItem);
      });
    }

    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren(fragment);
    } else {
      container.innerHTML = '';
      container.appendChild(fragment);
    }

    container._lastSignature = bottomSignature;
    return { mounted: true, signature: bottomSignature, unchanged: false };
  }

  function renderBangResults(container, bangSuggestions = []) {
    if (typeof isBrowserDefaultSearch === 'function' && isBrowserDefaultSearch()) return;
    if (!container || typeof document === 'undefined') return;
    const fragment = document.createDocumentFragment();
    const header = createSectionHeader('Bang Shortcuts');
    if (header) fragment.appendChild(header);

    if (!Array.isArray(bangSuggestions) || bangSuggestions.length === 0) {
      const emptyItem = createBangEmptyItem();
      if (emptyItem) fragment.appendChild(emptyItem);
    } else {
      bangSuggestions.forEach(item => {
        const bangRow = createBangItem(item);
        if (bangRow) fragment.appendChild(bangRow);
      });
    }

    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren(fragment);
    } else {
      container.innerHTML = '';
      container.appendChild(fragment);
    }
    container._lastSignature = '';
  }

  function clearSuggestions(container) {
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
      container._lastSignature = '';
    }
  }

  function clearAll(topContainer, bottomContainer) {
    if (topContainer) {
      if (typeof topContainer.replaceChildren === 'function') {
        topContainer.replaceChildren();
      } else {
        topContainer.innerHTML = '';
      }
      topContainer._lastSignature = '';
    }
    if (bottomContainer) {
      if (typeof bottomContainer.replaceChildren === 'function') {
        bottomContainer.replaceChildren();
      } else {
        bottomContainer.innerHTML = '';
      }
      bottomContainer._lastSignature = '';
    }
  }

  function hydrateFavicons(container, options = {}) {
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
        const revokeFn = typeof globalScope.revokeFaviconObjectUrl === 'function'
          ? globalScope.revokeFaviconObjectUrl
          : (typeof revokeFaviconObjectUrl === 'function' ? revokeFaviconObjectUrl : null);
        if (revokeFn) {
          revokeFn(img);
        }
        if (typeof img.removeAttribute === 'function') {
          img.removeAttribute('src');
        }
      };

      if (!rawUrl) {
        hideImg();
        return;
      }

      const domainKeyFn = typeof globalScope.getDomainKeyFromUrl === 'function'
        ? globalScope.getDomainKeyFromUrl
        : (typeof getDomainKeyFromUrl === 'function' ? getDomainKeyFromUrl : null);
      const domainKey = domainKeyFn ? domainKeyFn(rawUrl) : null;
      if (!domainKey) {
        hideImg();
        return;
      }

      const buildCandidatesFn = typeof globalScope.buildFaviconCandidates === 'function'
        ? globalScope.buildFaviconCandidates
        : (typeof buildFaviconCandidates === 'function' ? buildFaviconCandidates : null);
      const candidates = buildCandidatesFn ? buildCandidatesFn(rawUrl) : [];
      if (!candidates.length) {
        hideImg();
        return;
      }

      const shouldAbort = typeof options.shouldAbort === 'function'
        ? options.shouldAbort
        : (() => img.dataset?.faviconRawUrl !== rawUrl);

      const resolveFn = typeof globalScope.resolveFaviconForImageTarget === 'function'
        ? globalScope.resolveFaviconForImageTarget
        : (typeof resolveFaviconForImageTarget === 'function' ? resolveFaviconForImageTarget : null);

      if (resolveFn) {
        resolveFn({
          img,
          domainKey,
          candidates,
          shouldAbort,
          onResolved: (resolvedUrl, meta) => {
            if (img.style) img.style.display = '';
            const setSrcFn = typeof globalScope.setFaviconImageSrc === 'function'
              ? globalScope.setFaviconImageSrc
              : (typeof setFaviconImageSrc === 'function' ? setFaviconImageSrc : null);
            if (!meta?.sourceAlreadySet && setSrcFn) {
              setSrcFn(img, resolvedUrl);
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

  function updatePanelVisibility(options = {}) {
    const panel = options.panel;
    const widget = options.widget;
    const topContainer = options.topContainer || options.bookmarkContainer;
    const bottomContainer = options.bottomContainer || options.suggestionContainer;

    const hasBookmarks = typeof options.hasBookmarks === 'boolean'
      ? options.hasBookmarks
      : Boolean(topContainer && (topContainer.innerHTML || '').trim().length > 0);

    const hasSuggestions = typeof options.hasSuggestions === 'boolean'
      ? options.hasSuggestions
      : Boolean(bottomContainer && (bottomContainer.innerHTML || '').trim().length > 0);

    const shouldOpen = hasBookmarks || hasSuggestions;
    if (shouldOpen) {
      if (panel && panel.classList) panel.classList.remove('hidden');
      if (widget && widget.classList) widget.classList.add('results-open');
    } else {
      if (panel && panel.classList) panel.classList.add('hidden');
      if (widget && widget.classList) widget.classList.remove('results-open');
    }
    return shouldOpen;
  }

  const renderer = {
    createSectionHeader,
    createCalculatorItem,
    createBookmarkItem,
    createBangItem,
    createBangEmptyItem,
    createHistoryItem,
    createDirectQueryItem,
    createSuggestionItem,
    createSvgIcon,
    renderTopResults,
    renderBottomResults,
    renderBangResults,
    clearSuggestions,
    clearAll,
    hydrateFavicons,
    updatePanelVisibility
  };

  globalScope.HomebaseSearchResultsRenderer = renderer;
  if (typeof window !== 'undefined') {
    window.HomebaseSearchResultsRenderer = renderer;
  }
})();
