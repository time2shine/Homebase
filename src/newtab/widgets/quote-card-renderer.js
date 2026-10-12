(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  function safeRevealWidget(selector) {
    if (globalScope && typeof globalScope.revealWidget === 'function') {
      globalScope.revealWidget(selector);
    } else if (typeof document !== 'undefined') {
      const el = document.querySelector(selector);
      if (el) {
        el.classList.remove('widget-hidden');
        el.classList.add('widget-visible');
      }
    }
  }

  function formatQuoteText(text) {
    if (!text || typeof text !== 'string') return '';
    return `"${text.trim()}"`;
  }

  function formatQuoteAuthor(author) {
    if (!author || typeof author !== 'string') return '';
    const trimmed = author.trim();
    return trimmed ? `- ${trimmed}` : '';
  }

  function renderQuoteCard(quote, elements = {}) {
    if (!quote || typeof quote.text !== 'string' || !quote.text.trim()) return false;

    const textEl = elements.quoteText || (typeof document !== 'undefined' ? document.getElementById('quote-text') : null);
    const authorEl = elements.quoteAuthor || (typeof document !== 'undefined' ? document.getElementById('quote-author') : null);

    if (!textEl || !authorEl) return false;

    textEl.textContent = formatQuoteText(quote.text);
    authorEl.textContent = formatQuoteAuthor(quote.author);

    safeRevealWidget('.widget-quote');
    return true;
  }

  function createCategoryPill(name, value, isAll = false) {
    const pill = document.createElement('button');
    pill.className = 'quote-category-pill';
    pill.textContent = name;
    pill.dataset.value = value;

    if (isAll) {
      pill.id = 'quote-categories-all-btn';
      pill.style.fontWeight = '600';
    }

    return pill;
  }

  function renderCategoryPills(container, tags, savedTags = new Set(), onSelectionChange = null) {
    if (!container) return;
    container.innerHTML = '';

    const allPill = createCategoryPill('All Categories', '__all__', true);
    container.appendChild(allPill);

    const tagList = Array.isArray(tags) ? tags : [];
    const tagPills = [];

    tagList.forEach((tag) => {
      const tagName = typeof tag === 'string' ? tag : tag?.name;
      if (!tagName) return;

      const pill = createCategoryPill(tagName, tagName, false);
      container.appendChild(pill);
      tagPills.push(pill);
    });

    const isAllMode = !(savedTags instanceof Set ? savedTags.size : Array.isArray(savedTags) ? savedTags.length : false);

    if (isAllMode) {
      allPill.classList.add('selected');
    } else {
      const tagSet = savedTags instanceof Set ? savedTags : new Set(Array.isArray(savedTags) ? savedTags : []);
      tagPills.forEach((pill) => {
        if (tagSet.has(pill.dataset.value)) {
          pill.classList.add('selected');
        }
      });
      const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));
      if (!anySelected) {
        allPill.classList.add('selected');
      }
    }

    const getSelectedTagValues = () => {
      if (allPill.classList.contains('selected')) return [];
      return tagPills
        .filter((pill) => pill.classList.contains('selected'))
        .map((pill) => pill.dataset.value);
    };

    const notifyChange = () => {
      if (typeof onSelectionChange === 'function') {
        onSelectionChange(getSelectedTagValues());
      }
    };

    const selectAllOnly = () => {
      allPill.classList.add('selected');
      tagPills.forEach((pill) => pill.classList.remove('selected'));
      notifyChange();
    };

    const ensureFallbackAll = () => {
      const anySelected = tagPills.some((pill) => pill.classList.contains('selected'));
      if (!anySelected) {
        allPill.classList.add('selected');
      }
      notifyChange();
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
  }

  function renderCopySuccess(button, durationMs = 1500) {
    if (!button || typeof document === 'undefined') return;

    const originalNodes = Array.from(button.childNodes).map((node) => node.cloneNode(true));

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

    if (typeof button.replaceChildren === 'function') {
      button.replaceChildren(svg);
    } else {
      button.innerHTML = '';
      button.appendChild(svg);
    }

    setTimeout(() => {
      if (typeof button.replaceChildren === 'function') {
        button.replaceChildren(...originalNodes);
      } else {
        button.innerHTML = '';
        originalNodes.forEach((node) => button.appendChild(node));
      }
    }, durationMs);
  }

  const renderer = {
    formatQuoteText,
    formatQuoteAuthor,
    renderQuoteCard,
    createCategoryPill,
    renderCategoryPills,
    renderCopySuccess
  };

  if (typeof window !== 'undefined') {
    window.HomebaseQuoteCardRenderer = renderer;
  }
  if (globalScope) {
    globalScope.HomebaseQuoteCardRenderer = renderer;
  }
})();
