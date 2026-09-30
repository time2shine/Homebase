/**
 * Homebase Bookmark Grid Rendering & Virtualization Controller
 * Manages grid layout, viewport virtualization, icon presentation, and DOM reconciliation.
 */
(function() {
  'use strict';

  // --- Constants ---
  const METADATA_GRID_PATCH_LIMIT = 12;
  const DEFAULT_ROW_HEIGHT = 115; // 110px item + 5px gap
  const DEFAULT_ITEM_WIDTH = 105;  // 100px item + 5px gap

  // --- Private State ---
  let virtualizerState = {
    isEnabled: false,
    items: [],
    rowHeight: DEFAULT_ROW_HEIGHT,
    itemWidth: DEFAULT_ITEM_WIDTH,
    cols: 1,
    totalRows: 0,
    mainContentEl: null,
    gridEl: null,
    scrollListener: null,
    resizeObserver: null,
    updateRafId: 0,
    lastStart: -1,
    lastEnd: -1
  };

  function getGridElement() {
    if (!virtualizerState.gridEl || !virtualizerState.gridEl.isConnected) {
      virtualizerState.gridEl = document.getElementById('bookmarks-grid');
    }
    return virtualizerState.gridEl;
  }

  function getMainContentElement() {
    if (!virtualizerState.mainContentEl || !virtualizerState.mainContentEl.isConnected) {
      virtualizerState.mainContentEl = document.querySelector('.main-content');
    }
    return virtualizerState.mainContentEl;
  }

  // --- State Accessors ---
  function getVirtualizerState() {
    if (!virtualizerState.gridEl) getGridElement();
    if (!virtualizerState.mainContentEl) getMainContentElement();
    return virtualizerState;
  }

  function setVirtualizerState(next) {
    if (next && typeof next === 'object') {
      virtualizerState = next;
    }
  }

  function isVirtualizerEnabled() {
    return Boolean(virtualizerState && virtualizerState.isEnabled);
  }

  function resetVirtualizerState() {
    virtualizerState.items = [];
    virtualizerState.totalRows = 0;
    virtualizerState.lastStart = -1;
    virtualizerState.lastEnd = -1;
    if (virtualizerState.updateRafId) {
      cancelAnimationFrame(virtualizerState.updateRafId);
      virtualizerState.updateRafId = 0;
    }
  }

  // --- Folder & Bookmarks Context Bridges ---
  function getActiveFolderId() {
    if (typeof currentGridFolderNode !== 'undefined' && currentGridFolderNode && currentGridFolderNode.id) {
      return currentGridFolderNode.id;
    }
    if (typeof window !== 'undefined' && window.currentGridFolderNode && window.currentGridFolderNode.id) {
      return window.currentGridFolderNode.id;
    }
    if (typeof activeHomebaseFolderId !== 'undefined' && activeHomebaseFolderId) {
      return activeHomebaseFolderId;
    }
    if (typeof window !== 'undefined' && window.activeHomebaseFolderId) {
      return window.activeHomebaseFolderId;
    }
    return null;
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

  // --- Pure Helper Functions ---

  /**
   * Compares two bookmark/folder metadata objects for value equality.
   */
  function metadataEntriesEqual(previousEntry, nextEntry) {
    if (previousEntry === nextEntry) return true;
    if (!previousEntry || !nextEntry) return false;

    const previousKeys = Object.keys(previousEntry);
    const nextKeys = Object.keys(nextEntry);
    if (previousKeys.length !== nextKeys.length) return false;

    for (const key of previousKeys) {
      if (!Object.prototype.hasOwnProperty.call(nextEntry, key) || previousEntry[key] !== nextEntry[key]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Identifies all metadata keys whose values have changed between two states.
   */
  function getChangedMetadataIds(previousMetadata, nextMetadata) {
    const previous = previousMetadata || {};
    const next = nextMetadata || {};
    const changedIds = new Set([
      ...Object.keys(previous),
      ...Object.keys(next)
    ]);

    return Array.from(changedIds).filter((id) => !metadataEntriesEqual(previous[id], next[id]));
  }

  /**
   * Generates a deterministic cache key for a bookmark or folder icon representation.
   */
  function getIconKeyForNode(node, options = {}) {
    if (!node || node.isBackButton) return '';

    const iconParts = [];
    const fallbackTextPref = (typeof appBookmarkFallbackTextColorPreference !== 'undefined')
      ? appBookmarkFallbackTextColorPreference
      : (typeof window !== 'undefined' ? window.appBookmarkFallbackTextColorPreference : '');

    if (node.children) {
      const folderMetaMap = options.folderMetadata ||
        (typeof folderMetadata !== 'undefined' ? folderMetadata : null) ||
        (typeof window !== 'undefined' ? window.folderMetadata : null) || {};
      const meta = folderMetaMap[node.id] || {};
      const folderColorPref = (typeof appBookmarkFolderColorPreference !== 'undefined')
        ? appBookmarkFolderColorPreference
        : (typeof window !== 'undefined' ? window.appBookmarkFolderColorPreference : '');

      iconParts.push('folder');
      iconParts.push(meta.color || '');
      iconParts.push(meta.icon || '');
      iconParts.push(meta.scale ?? 1);
      iconParts.push(meta.offsetY ?? 0);
      iconParts.push(meta.rotation ?? 0);
      iconParts.push(folderColorPref || '');
    } else {
      const bookmarkMetaMap = options.bookmarkMetadata ||
        (typeof bookmarkMetadata !== 'undefined' ? bookmarkMetadata : null) ||
        (typeof window !== 'undefined' ? window.bookmarkMetadata : null) || {};
      const meta = bookmarkMetaMap[node.id] || {};
      const fallbackColorPref = (typeof appBookmarkFallbackColorPreference !== 'undefined')
        ? appBookmarkFallbackColorPreference
        : (typeof window !== 'undefined' ? window.appBookmarkFallbackColorPreference : '');
      const title = node.title || ' ';
      const fallbackLetter = (title.trim().charAt(0) || '?').toUpperCase();

      iconParts.push('bookmark');
      iconParts.push(node.url || '');
      iconParts.push(fallbackLetter);
      iconParts.push(meta.icon || '');
      iconParts.push(`cleared:${meta.iconCleared === true}`);
      iconParts.push(fallbackColorPref || '');
      iconParts.push(fallbackTextPref || '');
    }

    return iconParts.join('|');
  }

  // --- Presentation Helpers ---

  function ensureBookmarkFallback(wrapper, fallbackLetter) {
    let fallbackIcon = wrapper.querySelector('.bookmark-fallback-icon');
    if (!fallbackIcon) {
      fallbackIcon = document.createElement('div');
      fallbackIcon.className = 'bookmark-fallback-icon';
      wrapper.appendChild(fallbackIcon);
    }
    fallbackIcon.textContent = fallbackLetter;
    return fallbackIcon;
  }

  function clearBookmarkImages(wrapper) {
    const images = wrapper.querySelectorAll('img.bookmark-img');
    const observer = (typeof faviconIntersectionObserver !== 'undefined' && faviconIntersectionObserver) ||
                     (typeof window !== 'undefined' && window.faviconIntersectionObserver) || null;
    images.forEach((img) => {
      if (observer) {
        observer.unobserve(img);
      }
      if (img._faviconResolve) {
        delete img._faviconResolve;
      }
      if (typeof revokeFaviconObjectUrl === 'function') {
        revokeFaviconObjectUrl(img);
      } else if (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.revokeFaviconObjectUrl === 'function') {
        window.HomebaseFaviconPipeline.revokeFaviconObjectUrl(img);
      }
      img.remove();
    });
  }

  function renderBookmarkIconInto(wrapper, bookmarkNode, iconKey) {
    if (!wrapper || !bookmarkNode) return;

    const nextKey = iconKey !== undefined ? iconKey : getIconKeyForNode(bookmarkNode);
    const title = bookmarkNode.title || ' ';
    const fallbackLetter = (title.trim().charAt(0) || '?').toUpperCase();
    const metaMap = (typeof bookmarkMetadata !== 'undefined' && bookmarkMetadata) ||
                    (typeof window !== 'undefined' && window.bookmarkMetadata) || {};
    const meta = metaMap[bookmarkNode.id] || {};
    const fallbackColor = (typeof appBookmarkFallbackColorPreference !== 'undefined' && appBookmarkFallbackColorPreference) ||
                          (typeof window !== 'undefined' && window.appBookmarkFallbackColorPreference) || '#00b8d4';
    const existingLoaded = wrapper.querySelector('img.bookmark-img.loaded');
    const fallbackIcon = ensureBookmarkFallback(wrapper, fallbackLetter);
    const cancelFallback = () => {};

    const debugFn = (typeof debugFavicon === 'function') ? debugFavicon :
                    (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.debugFavicon === 'function') ?
                    window.HomebaseFaviconPipeline.debugFavicon : () => {};

    const showFallbackNow = (reason) => {
      cancelFallback();
      fallbackIcon.classList.add('show-fallback');
      wrapper.style.backgroundColor = fallbackColor;
      debugFn('fallback shown', {
        reason,
        nodeId: bookmarkNode.id,
        url: bookmarkNode.url || '',
        iconKey: nextKey
      });
    };

    const hideFallback = () => {
      fallbackIcon.classList.remove('show-fallback');
    };

    wrapper.style.backgroundColor = '';
    hideFallback();

    // Check for Custom Icon
    if (meta && meta.icon) {
      clearBookmarkImages(wrapper);
      wrapper.style.backgroundColor = '';
      wrapper.dataset.iconKey = nextKey;
      delete wrapper.dataset.faviconDomain;

      const customImg = document.createElement('img');
      customImg.className = 'bookmark-img';
      customImg.alt = '';
      customImg.onload = () => {
        if (wrapper.dataset.iconKey !== nextKey) {
          debugFn('abort/race detected', {
            reason: 'custom-icon-load',
            nodeId: bookmarkNode.id,
            iconKey: nextKey
          });
          showFallbackNow('custom-icon-abort');
          return;
        }
        cancelFallback();
        customImg.classList.add('loaded');
        wrapper.style.backgroundColor = 'transparent';
        hideFallback();
        debugFn('custom icon shown', {
          nodeId: bookmarkNode.id,
          iconKey: nextKey
        });
      };
      customImg.onerror = () => {
        if (wrapper.dataset.iconKey !== nextKey) {
          debugFn('abort/race detected', {
            reason: 'custom-icon-error',
            nodeId: bookmarkNode.id,
            iconKey: nextKey
          });
          showFallbackNow('custom-icon-abort');
          return;
        }
        customImg.remove();
        showFallbackNow('custom-icon-error');
      };
      customImg.src = meta.icon;
      wrapper.appendChild(customImg);
      return;
    }

    if (meta && meta.iconCleared === true) {
      clearBookmarkImages(wrapper);
      wrapper.style.backgroundColor = '';
      showFallbackNow('icon-cleared');
      wrapper.dataset.iconKey = nextKey;
      delete wrapper.dataset.faviconDomain;
      return;
    }

    const getDomainKeyFn = (typeof getDomainKeyFromUrl === 'function') ? getDomainKeyFromUrl :
      (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.getDomainKeyFromUrl === 'function') ?
      window.HomebaseFaviconPipeline.getDomainKeyFromUrl : (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return null; } };

    const domainKey = getDomainKeyFn(bookmarkNode.url);

    if (!domainKey) {
      clearBookmarkImages(wrapper);
      wrapper.style.backgroundColor = '';
      fallbackIcon.textContent = '?';
      showFallbackNow('missing-domain');
      wrapper.dataset.iconKey = nextKey;
      delete wrapper.dataset.faviconDomain;
      return;
    }

    if (wrapper.dataset.iconKey === nextKey &&
        wrapper.dataset.faviconDomain === domainKey &&
        existingLoaded) {
      wrapper.dataset.iconKey = nextKey;
      hideFallback();
      return;
    }

    clearBookmarkImages(wrapper);

    // Prepare image icon (stacked above fallback).
    const imgIcon = document.createElement('img');
    imgIcon.className = 'bookmark-img';
    imgIcon.decoding = 'async';
    imgIcon.loading = 'lazy';
    imgIcon.setAttribute('fetchpriority', 'low');
    if (!imgIcon.referrerPolicy) {
      imgIcon.referrerPolicy = 'no-referrer';
    }
    imgIcon.alt = '';

    const buildCandidatesFn = (typeof buildFaviconCandidates === 'function') ? buildFaviconCandidates :
      (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.buildCandidates === 'function') ?
      window.HomebaseFaviconPipeline.buildCandidates : (u) => [];

    const candidates = buildCandidatesFn(bookmarkNode.url);

    wrapper.dataset.iconKey = nextKey;
    wrapper.dataset.faviconDomain = domainKey;
    wrapper.appendChild(imgIcon);

    const shouldAbort = () =>
      wrapper.dataset.iconKey !== nextKey ||
      wrapper.dataset.faviconDomain !== domainKey;

    const markLoaded = (img) => {
      if (img.naturalWidth >= 6) {
        img.classList.add('loaded');
        wrapper.style.backgroundColor = 'transparent';
        cancelFallback();
        return true;
      }
      return false;
    };

    const resolveForTargetFn = (typeof resolveFaviconForImageTarget === 'function') ? resolveFaviconForImageTarget :
      (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.resolveForImageTarget === 'function') ?
      window.HomebaseFaviconPipeline.resolveForImageTarget : null;

    const setImageSrcFn = (typeof setFaviconImageSrc === 'function') ? setFaviconImageSrc :
      (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.setImageSrc === 'function') ?
      window.HomebaseFaviconPipeline.setImageSrc : (img, src) => { img.src = src; };

    const queueResolutionFn = (typeof queueFaviconResolution === 'function') ? queueFaviconResolution :
      (typeof window !== 'undefined' && window.HomebaseFaviconPipeline && typeof window.HomebaseFaviconPipeline.queueResolution === 'function') ?
      window.HomebaseFaviconPipeline.queueResolution : (img, task) => task();

    const resolveTask = () => {
      if (!resolveForTargetFn) return;
      resolveForTargetFn({
        img: imgIcon,
        domainKey,
        candidates,
        shouldAbort,
        onResolved: (resolvedUrl, meta) => {
          if (!meta.sourceAlreadySet) {
            imgIcon.onload = () => {
              cancelFallback();
              if (shouldAbort()) {
                debugFn('abort/race detected', {
                  reason: 'favicon-load',
                  nodeId: bookmarkNode.id,
                  domainKey,
                  iconKey: nextKey
                });
                cancelFallback();
                return;
              }
              if (markLoaded(imgIcon)) {
                hideFallback();
                debugFn('favicon shown', {
                  nodeId: bookmarkNode.id,
                  domainKey,
                  iconKey: nextKey
                });
              } else {
                showFallbackNow('favicon-too-small');
              }
            };
            imgIcon.onerror = () => {
              cancelFallback();
              if (shouldAbort()) {
                debugFn('abort/race detected', {
                  reason: 'favicon-error',
                  nodeId: bookmarkNode.id,
                  domainKey,
                  iconKey: nextKey
                });
                cancelFallback();
                return;
              }
              showFallbackNow('favicon-error');
            };
            setImageSrcFn(imgIcon, resolvedUrl);
            if (imgIcon.complete) {
              if (markLoaded(imgIcon)) {
                cancelFallback();
                hideFallback();
                debugFn('favicon shown', {
                  nodeId: bookmarkNode.id,
                  domainKey,
                  iconKey: nextKey
                });
              }
            }
            return;
          }

          cancelFallback();
          if (markLoaded(imgIcon)) {
            hideFallback();
            debugFn('favicon shown', {
              nodeId: bookmarkNode.id,
              domainKey,
              iconKey: nextKey
            });
          } else {
            showFallbackNow('favicon-too-small');
          }
        },
        onFailed: () => {
          showFallbackNow('favicon-failed');
        },
        onNegativeCacheHit: () => {
          debugFn('favicon skipped (negative cache)', {
            nodeId: bookmarkNode.id,
            domainKey,
            iconKey: nextKey
          });
          showFallbackNow('negative-cache');
        },
        onAbort: () => {
          debugFn('abort/race detected', {
            reason: 'favicon-race',
            nodeId: bookmarkNode.id,
            domainKey,
            iconKey: nextKey
          });
          cancelFallback();
        },
        acceptCandidate: (img) => img.naturalWidth >= 6
      });
    };

    queueResolutionFn(imgIcon, resolveTask);
  }

  function renderFolderIconInto(wrapper, folderNode, iconKey) {
    if (!wrapper || !folderNode) return;

    wrapper.textContent = '';

    const metaMap = (typeof folderMetadata !== 'undefined' && folderMetadata) ||
                    (typeof window !== 'undefined' && window.folderMetadata) || {};
    const meta = metaMap[folderNode.id] || {};
    const customColor = meta.color || null;
    const customIcon = meta.icon || null;
    const scale = meta.scale ?? 1;
    const offsetY = meta.offsetY ?? 0;
    const rotation = meta.rotation ?? 0;

    wrapper.replaceChildren();

    const createSvgFn = (typeof createSvgIconElement === 'function') ? createSvgIconElement :
      (typeof window !== 'undefined' ? window.createSvgIconElement : null);
    const tintSvgFn = (typeof tintSvgElement === 'function') ? tintSvgElement :
      (typeof window !== 'undefined' ? window.tintSvgElement : null);
    const getCompColorFn = (typeof getComplementaryColor === 'function') ? getComplementaryColor :
      (typeof window !== 'undefined' ? window.getComplementaryColor : null);

    const baseIcon = createSvgFn ? createSvgFn('bookmarkFolderLarge') : null;
    if (baseIcon) {
      wrapper.appendChild(baseIcon);
    }

    const folderColorPref = (typeof appBookmarkFolderColorPreference !== 'undefined' && appBookmarkFolderColorPreference) ||
                            (typeof window !== 'undefined' && window.appBookmarkFolderColorPreference) || '#FFFFFF';
    const appliedColor = customColor || folderColorPref;
    const baseSvg = wrapper.querySelector('svg');

    if (baseSvg && tintSvgFn) {
      tintSvgFn(baseSvg, appliedColor);
    }

    const iconFillColor = getCompColorFn ? getCompColorFn(appliedColor) : '#FFFFFF';

    if (customIcon) {
      const transformStyle = `transform: translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.9}) rotate(${rotation}deg);`;

      if (customIcon.startsWith('builtin:')) {
        const key = customIcon.replace('builtin:', '');
        const svgEl = createSvgFn ? createSvgFn(key) : null;
        if (svgEl) {
          const iconDiv = document.createElement('div');
          iconDiv.className = 'bookmark-folder-custom-icon';
          iconDiv.appendChild(svgEl);
          iconDiv.setAttribute('style', transformStyle);

          const svg = iconDiv.querySelector('svg');
          if (svg && tintSvgFn) {
            tintSvgFn(svg, iconFillColor);
          }
          wrapper.appendChild(iconDiv);
        }
      } else {
        const img = document.createElement('img');
        img.src = customIcon;
        img.className = 'bookmark-folder-custom-icon';
        img.setAttribute('style', transformStyle);
        wrapper.appendChild(img);
      }
    }

    wrapper.dataset.iconKey = iconKey !== undefined ? iconKey : getIconKeyForNode(folderNode);
  }

  function renderBookmark(bookmarkNode) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    if (bookmarkNode.isBackButton) item.classList.add('back-button');

    item.dataset.bookmarkId = bookmarkNode.id || '';
    item.dataset.isFolder = 'false';

    const title = bookmarkNode.title || ' ';
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'bookmark-icon-wrapper';
    renderBookmarkIconInto(iconWrapper, bookmarkNode);

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;

    item.appendChild(iconWrapper);
    item.appendChild(titleSpan);

    return item;
  }

  function renderBookmarkFolder(folderNode) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.bookmarkId = folderNode.id || '';
    item.dataset.isFolder = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'bookmark-icon-wrapper';
    renderFolderIconInto(wrapper, folderNode);
    item.appendChild(wrapper);

    const span = document.createElement('span');
    span.textContent = folderNode.title || '';
    item.appendChild(span);

    return item;
  }

  // --- Virtualization Engine ---

  function createBackButton(parentId) {
    const item = document.createElement('a');
    item.href = '#';
    item.className = 'bookmark-item';
    item.dataset.backTargetId = parentId || '';
    item.innerHTML = `
      <div class="bookmark-icon-wrapper back-icon-wrapper">
        <img src="icons/back.svg" alt="Go back" class="back-icon" />
      </div>
      <span class="back-button-label">Back</span>
    `;
    return item;
  }

  function createNodeForVirtualizer(node) {
    if (!node) return null;
    if (node.isBackButton) return createBackButton(node.parentId);
    if (node.children) return renderBookmarkFolder(node);
    return renderBookmark(node);
  }

  function updateElementData(el, node) {
    if (!el || !node) return;
    const recyclingType = node.isBackButton ? 'back' : (node.children ? 'folder' : 'bookmark');
    el.dataset.recyclingType = recyclingType;
    el.dataset.bookmarkId = node.id || '';

    if (node.isBackButton) {
      el.dataset.backTargetId = node.parentId || '';
      delete el.dataset.isFolder;
    } else {
      el.dataset.isFolder = node.children ? 'true' : 'false';
    }

    const span = el.querySelector('span');
    if (span) {
      span.textContent = node.title || (node.isBackButton ? 'Back' : ' ');
    }

    const iconWrapper = el.querySelector('.bookmark-icon-wrapper');
    if (iconWrapper) {
      if (node.isBackButton) return;

      const nextKey = getIconKeyForNode(node);
      const prevKey = iconWrapper.dataset.iconKey;

      if (nextKey !== prevKey) {
        if (node.children) {
          renderFolderIconInto(iconWrapper, node, nextKey);
        } else {
          renderBookmarkIconInto(iconWrapper, node, nextKey);
        }
      }
    }
  }

  function findRenderedGridItemById(itemId) {
    if (!itemId) return null;
    const grid = getGridElement();
    if (!grid) return null;

    const renderedItems = grid.children;
    for (let i = 0; i < renderedItems.length; i++) {
      const item = renderedItems[i];
      if (item && item.dataset && item.dataset.bookmarkId === itemId) {
        return item;
      }
    }

    return null;
  }

  function patchActiveGridMetadataItems(activeNode, changedIds) {
    if (!activeNode || !Array.isArray(activeNode.children) || !Array.isArray(changedIds) || !changedIds.length) {
      return false;
    }

    const changedIdSet = new Set(changedIds);
    const relevantNodes = activeNode.children.filter((child) => child && changedIdSet.has(child.id));

    if (!relevantNodes.length) {
      return false;
    }

    if (relevantNodes.length > METADATA_GRID_PATCH_LIMIT) {
      return true;
    }

    for (const node of relevantNodes) {
      const itemEl = findRenderedGridItemById(node.id);

      if (!itemEl) {
        if (!virtualizerState.isEnabled) {
          return true;
        }
        continue;
      }

      try {
        updateElementData(itemEl, node);
      } catch (_) {
        return true;
      }
    }

    return false;
  }

  let virtualSortableTimeout = null;

  function scheduleSortableReinit(gridEl) {
    if (virtualSortableTimeout) {
      clearTimeout(virtualSortableTimeout);
    }
    if (typeof window !== 'undefined' && typeof window.sortableTimeout !== 'undefined' && window.sortableTimeout) {
      clearTimeout(window.sortableTimeout);
      window.sortableTimeout = null;
    }
    virtualSortableTimeout = setTimeout(() => {
      virtualSortableTimeout = null;
      if (typeof window !== 'undefined' && typeof window.setupGridSortable === 'function') {
        window.setupGridSortable(gridEl);
      } else if (typeof setupGridSortable === 'function') {
        setupGridSortable(gridEl);
      }
    }, 150);
  }

  function updateVirtualGrid() {
    // Stop updates while dragging to prevent DOM recycling errors
    const isDragging = (typeof window !== 'undefined' && window.isGridDragging) ||
      (typeof isGridDragging !== 'undefined' && isGridDragging);
    if (isDragging) return;

    if (!virtualizerState.isEnabled || !virtualizerState.items || !virtualizerState.items.length) return;

    const mainContentEl = virtualizerState.mainContentEl || getMainContentElement();
    const gridEl = virtualizerState.gridEl || getGridElement();
    const items = virtualizerState.items;
    const rowHeight = virtualizerState.rowHeight || DEFAULT_ROW_HEIGHT;
    const itemWidth = virtualizerState.itemWidth || DEFAULT_ITEM_WIDTH;

    if (!mainContentEl || !gridEl) return;

    const perf = (typeof window !== 'undefined' && window.perfState) ||
      (typeof perfState !== 'undefined' ? perfState : null);
    if (perf) {
      perf.gridMode = 'virtual';
    }

    const renderStart = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : 0;

    // 1. Calculate Columns
    const gridWidth = gridEl.clientWidth;
    const cols = Math.floor(gridWidth / itemWidth) || 1;
    virtualizerState.cols = cols;

    // 2. Calculate Total Height
    const totalRows = Math.ceil(items.length / cols);
    const totalHeight = totalRows * rowHeight;
    virtualizerState.totalRows = totalRows;

    // 3. Determine Scroll Position
    const scrollTop = mainContentEl.scrollTop || 0;
    const viewportHeight = mainContentEl.clientHeight || 0;
    const bufferRows = 2;

    // 4. Calculate Visible Range
    let startRow = Math.floor(scrollTop / rowHeight) - bufferRows;
    let endRow = Math.ceil((scrollTop + viewportHeight) / rowHeight) + bufferRows;

    startRow = Math.max(0, startRow);
    endRow = Math.min(totalRows, endRow);

    const startIndex = startRow * cols;
    const endIndex = Math.min(items.length, endRow * cols);

    if (perf) {
      perf.lastRenderedStartIndex = startIndex;
      perf.lastRenderedEndIndex = Math.max(startIndex, endIndex - 1);
      perf.lastVirtualRange = { start: startIndex, end: Math.max(startIndex, endIndex - 1) };
      perf.totalCount = items.length;
    }

    // 5. Optimization: Only render if range changed (unless initial render)
    if (!virtualizerState.initialRender && startIndex === virtualizerState.lastStart && endIndex === virtualizerState.lastEnd) {
      return;
    }
    virtualizerState.lastStart = startIndex;
    virtualizerState.lastEnd = endIndex;

    // 6. Apply Styles
    gridEl.style.height = `${totalHeight}px`;
    gridEl.style.paddingTop = `${startRow * rowHeight}px`;
    gridEl.style.paddingBottom = '0px';

    // 7. Render Slice (DOM recycling)
    const existingNodes = Array.from(gridEl.children);
    const visibleItems = items.slice(startIndex, endIndex);

    const isPerfMode = (typeof window !== 'undefined' && window.appPerformanceModePreference) ||
      (typeof appPerformanceModePreference !== 'undefined' && appPerformanceModePreference);
    const isAnimEnabled = (typeof window !== 'undefined' && window.appGridAnimationEnabledPreference) ||
      (typeof appGridAnimationEnabledPreference !== 'undefined' && appGridAnimationEnabledPreference);

    visibleItems.forEach((node, index) => {
      let el = existingNodes[index];
      const neededType = node.isBackButton ? 'back' : (node.children ? 'folder' : 'bookmark');
      const existingType = el ? el.dataset.recyclingType : null;

      if (el && existingType === neededType) {
        updateElementData(el, node);
      } else {
        const newEl = createNodeForVirtualizer(node);
        if (newEl) {
          newEl.dataset.recyclingType = neededType;

          if (virtualizerState.initialRender && !isPerfMode && isAnimEnabled) {
            const delay = index * 15;
            newEl.style.animationDelay = `${delay}ms`;
            newEl.classList.add('newly-rendered');

            newEl.addEventListener('animationend', () => {
              newEl.classList.remove('newly-rendered');
              newEl.style.animationDelay = '';
            }, { once: true });
          }

          if (el) {
            gridEl.replaceChild(newEl, el);
          } else {
            gridEl.appendChild(newEl);
          }

          el = newEl;
        }
      }

      if (el) {
        el.dataset.recyclingType = neededType;
      }
    });

    // 8. Trim excess DOM nodes
    while (gridEl.children.length > visibleItems.length) {
      gridEl.lastChild.remove();
    }

    if (perf) {
      perf.gridRenderedNodes = visibleItems.length;
      if (renderStart) {
        perf.lastGridRenderMs = performance.now() - renderStart;
      }
    }

    // Disable animation for future scrolls
    if (virtualizerState.initialRender) {
      virtualizerState.initialRender = false;
    }

    // Re-initialize drag-and-drop for visible items (debounced)
    scheduleSortableReinit(gridEl);
  }

  function initVirtualizer(allItems) {
    if (!virtualizerState.mainContentEl) {
      virtualizerState.mainContentEl = getMainContentElement();
    }
    if (!virtualizerState.gridEl) {
      virtualizerState.gridEl = getGridElement();
    }

    // Cleanup old listeners
    if (virtualizerState.scrollListener && virtualizerState.mainContentEl) {
      virtualizerState.mainContentEl.removeEventListener('scroll', virtualizerState.scrollListener);
    }
    if (virtualizerState.resizeObserver) {
      virtualizerState.resizeObserver.disconnect();
    }

    if (!virtualizerState.mainContentEl || !virtualizerState.gridEl) {
      return;
    }

    // Set State
    virtualizerState.items = Array.isArray(allItems) ? allItems : [];
    virtualizerState.isEnabled = true;
    virtualizerState.lastStart = -1;
    virtualizerState.lastEnd = -1;
    virtualizerState.updateRafId = 0;
    virtualizerState.initialRender = true;

    // Shared RAF scheduler for scroll + resize
    let virtualGridRafId = 0;
    function scheduleVirtualGridUpdate() {
      if (!virtualizerState.isEnabled) return;
      if (virtualizerState.updateRafId) return;

      virtualGridRafId = requestAnimationFrame(() => {
        virtualizerState.updateRafId = 0;
        virtualGridRafId = 0;
        if (!virtualizerState.isEnabled) return;
        updateVirtualGrid();
      });
      virtualizerState.updateRafId = virtualGridRafId;
    }

    // Attach Scroll Listener (Throttled via shared scheduler)
    virtualizerState.scrollListener = () => {
      scheduleVirtualGridUpdate();
    };
    virtualizerState.mainContentEl.addEventListener('scroll', virtualizerState.scrollListener, { passive: true });

    // Attach Resize Listener
    virtualizerState.resizeObserver = new ResizeObserver(() => {
      scheduleVirtualGridUpdate();
    });
    virtualizerState.resizeObserver.observe(virtualizerState.gridEl);

    // Initial Paint
    updateVirtualGrid();
  }

  function disableVirtualizer() {
    virtualizerState.isEnabled = false;
    if (virtualizerState.updateRafId) {
      cancelAnimationFrame(virtualizerState.updateRafId);
      virtualizerState.updateRafId = 0;
    }

    if (virtualSortableTimeout) {
      clearTimeout(virtualSortableTimeout);
      virtualSortableTimeout = null;
    }
    if (typeof window !== 'undefined' && typeof window.sortableTimeout !== 'undefined' && window.sortableTimeout) {
      clearTimeout(window.sortableTimeout);
      window.sortableTimeout = null;
    }

    const mainContentEl = virtualizerState.mainContentEl || getMainContentElement();
    const gridEl = virtualizerState.gridEl || getGridElement();

    if (virtualizerState.scrollListener && mainContentEl) {
      mainContentEl.removeEventListener('scroll', virtualizerState.scrollListener);
    }
    if (virtualizerState.resizeObserver) {
      virtualizerState.resizeObserver.disconnect();
    }

    // Reset grid styles
    if (gridEl) {
      gridEl.style.height = '';
      gridEl.style.paddingTop = '';
      gridEl.style.paddingBottom = '';
    }
  }

  function syncVirtualizerMove(id, newParentId = null) {
    if (!virtualizerState.isEnabled || !Array.isArray(virtualizerState.items)) return;
    if (newParentId) {
      const idx = virtualizerState.items.findIndex((x) => x && x.id === id);
      if (idx !== -1) {
        virtualizerState.items.splice(idx, 1);
      }
    }
  }

  function reorderVirtualizerItems(oldIndex, newIndex) {
    if (!virtualizerState.isEnabled || !Array.isArray(virtualizerState.items)) return;
    if (virtualizerState.items[oldIndex] !== undefined && virtualizerState.items[newIndex] !== undefined) {
      const [movedItem] = virtualizerState.items.splice(oldIndex, 1);
      virtualizerState.items.splice(newIndex, 0, movedItem);
    }
  }

  // --- Grid Reconciliation & Rename UI ---

  let currentGridFolderNode = null;

  function getCurrentGridFolderNode() {
    return currentGridFolderNode;
  }

  function setCurrentGridFolderNode(node) {
    currentGridFolderNode = node || null;
    if (typeof window !== 'undefined') {
      window.currentGridFolderNode = currentGridFolderNode;
    }
  }

  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const _ = textarea.offsetHeight;
    const verticalBorders = 2;
    textarea.style.height = (textarea.scrollHeight + verticalBorders) + 'px';
  }

  function renderBookmarkGrid(folderNode, droppedItemId = null, options = {}) {
    if (!folderNode) return;

    const grid = getGridElement();
    if (!grid) return;

    // Keep virtualization references fresh
    virtualizerState.gridEl = grid;
    virtualizerState.mainContentEl = virtualizerState.mainContentEl || getMainContentElement();

    grid.innerHTML = '';

    // Store the current folder node
    setCurrentGridFolderNode(folderNode);

    // Reset virtualization state/styles for this render
    disableVirtualizer();

    const rootDisplayId = (options && options.rootDisplayFolderId !== undefined)
      ? options.rootDisplayFolderId
      : (typeof rootDisplayFolderId !== 'undefined'
          ? rootDisplayFolderId
          : (typeof window !== 'undefined' ? window.rootDisplayFolderId : null));

    const tree = (options && options.bookmarkTree)
      ? options.bookmarkTree
      : (typeof bookmarkTree !== 'undefined'
          ? bookmarkTree
          : (typeof window !== 'undefined' ? window.bookmarkTree : null));

    const findNode = (options && typeof options.findBookmarkNodeById === 'function')
      ? options.findBookmarkNodeById
      : (typeof findBookmarkNodeById === 'function'
          ? findBookmarkNodeById
          : (typeof window !== 'undefined' && typeof window.findBookmarkNodeById === 'function'
              ? window.findBookmarkNodeById
              : null));

    // Prepare Data List
    let itemsToRender = [];

    // Add Back Button object to the list if needed
    if (folderNode.id !== rootDisplayId &&
        folderNode.parentId !== rootDisplayId &&
        folderNode.parentId !== '0' &&
        folderNode.parentId !== 'root________') {
      const rootNode = tree && tree[0] ? tree[0] : null;
      const parentNode = (rootNode && findNode) ? findNode(rootNode, folderNode.parentId) : null;
      if (parentNode && parentNode.id !== rootDisplayId) {
        itemsToRender.push({ isBackButton: true, parentId: parentNode.id });
      }
    }

    if (folderNode.children) {
      itemsToRender = itemsToRender.concat(folderNode.children);
    }

    // DECISION: Virtualize or Standard?
    const VIRTUALIZATION_THRESHOLD = 150; // Enable if > 150 items

    if (itemsToRender.length > VIRTUALIZATION_THRESHOLD) {
      // --- VIRTUAL MODE ---
      initVirtualizer(itemsToRender);
    } else {
      // --- STANDARD MODE ---
      const standardRenderStart =
        (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : 0;

      const capturePositions = (typeof captureGridItemPositions === 'function')
        ? captureGridItemPositions
        : (typeof window !== 'undefined' ? window.captureGridItemPositions : null);

      const previousPositions = (droppedItemId && capturePositions)
        ? capturePositions(grid)
        : null;

      itemsToRender.forEach(node => {
        if (!node) return;
        if (node.isBackButton) {
          const btn = createBackButton(node.parentId);
          if (btn) {
            btn.classList.add('back-button');
            grid.appendChild(btn);
          }
        } else if (node.url) {
          const bookmarkEl = renderBookmark(node);
          if (bookmarkEl) grid.appendChild(bookmarkEl);
        } else if (node.children) {
          const folderEl = renderBookmarkFolder(node);
          if (folderEl) grid.appendChild(folderEl);
        }
      });

      scheduleSortableReinit(grid);

      // Apply Animations (Standard Mode Only)
      const domItems = grid.querySelectorAll('.bookmark-item');

      const perf = (typeof window !== 'undefined' && window.perfState) ||
        (typeof perfState !== 'undefined' ? perfState : null);

      if (perf) {
        perf.gridMode = 'standard';
        perf.totalCount = itemsToRender.length;
        perf.gridRenderedNodes = domItems.length;
        perf.lastRenderedStartIndex = itemsToRender.length ? 0 : -1;
        perf.lastRenderedEndIndex = itemsToRender.length ? itemsToRender.length - 1 : -1;
        perf.lastVirtualRange = { start: -1, end: -1 };
        if (standardRenderStart) {
          perf.lastGridRenderMs = performance.now() - standardRenderStart;
        } else {
          perf.lastGridRenderMs = 0;
        }

        if (perf.overlayEnabled) {
          if (typeof updatePerfOverlay === 'function') {
            updatePerfOverlay(false);
          } else if (typeof window !== 'undefined' && typeof window.updatePerfOverlay === 'function') {
            window.updatePerfOverlay(false);
          }
        }
      }

      const animateReorder = (typeof animateGridReorder === 'function')
        ? animateGridReorder
        : (typeof window !== 'undefined' ? window.animateGridReorder : null);

      if (droppedItemId && animateReorder && previousPositions) {
        animateReorder(domItems, previousPositions);
      } else {
        const isPerfMode = (typeof window !== 'undefined' && window.appPerformanceModePreference) ||
          (typeof appPerformanceModePreference !== 'undefined' && appPerformanceModePreference);

        domItems.forEach((item, index) => {
          if (item.classList.contains('back-button') || isPerfMode) {
            item.style.opacity = '1';
            return;
          }

          const delay = Math.min(index * 25, 500);
          item.style.animationDelay = `${delay}ms`;
          item.classList.add('newly-rendered');

          item.addEventListener('animationend', () => {
            item.classList.remove('newly-rendered');
            item.style.animationDelay = '';
          }, { once: true });
        });
      }
    }
  }

  function showEditInput(tabButton, folderNode) {
    if (!tabButton || !folderNode) return;

    tabButton.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bookmark-folder-input bookmark-folder-rename-input';
    input.value = folderNode.title || '';

    const resizeFolderRenameInput = () => {
      const valueLength = Math.max(input.value.length, 6);
      const nextWidth = Math.min(Math.max(valueLength * 8 + 24, 110), 260);
      input.style.width = `${nextWidth}px`;
    };

    resizeFolderRenameInput();

    if (tabButton.parentNode) {
      tabButton.parentNode.insertBefore(input, tabButton.nextSibling);
    }

    input.focus();
    input.select();

    const cleanup = () => {
      input.remove();
      tabButton.style.display = '';
    };

    const saveAction = async () => {
      const newName = input.value.trim();
      if (newName && newName !== folderNode.title) {
        try {
          if (typeof browser !== 'undefined' && browser.bookmarks && typeof browser.bookmarks.update === 'function') {
            await browser.bookmarks.update(folderNode.id, { title: newName });
          } else if (typeof chrome !== 'undefined' && chrome.bookmarks && typeof chrome.bookmarks.update === 'function') {
            await new Promise((res, rej) => chrome.bookmarks.update(folderNode.id, { title: newName }, (r) => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)));
          }

          if (typeof loadBookmarks === 'function') {
            loadBookmarks(folderNode.id);
          } else if (typeof window !== 'undefined' && typeof window.loadBookmarks === 'function') {
            window.loadBookmarks(folderNode.id);
          }
        } catch (err) {
          console.error('Error updating folder:', err);
          cleanup();
        }
      } else {
        cleanup();
      }
    };

    input.addEventListener('input', resizeFolderRenameInput);
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveAction();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    input.addEventListener('blur', saveAction);
  }

  function showGridItemRenameInput(gridItem, bookmarkNode) {
    if (!gridItem || !bookmarkNode) return;

    const titleSpan = gridItem.querySelector('span');
    if (!titleSpan) return;

    titleSpan.style.display = 'none';
    gridItem.classList.add('is-renaming');

    const input = document.createElement('textarea');
    input.className = 'grid-item-rename-input';
    input.value = bookmarkNode.title || '';
    input.rows = 1;

    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('input', () => {
      autoResizeTextarea(input);
    });

    gridItem.appendChild(input);
    autoResizeTextarea(input);

    input.focus();
    input.select();

    const cleanup = () => {
      gridItem.classList.remove('is-renaming');
      input.remove();
      titleSpan.style.display = '-webkit-box';
    };

    const saveAction = async () => {
      const newName = input.value.trim();
      if (newName && newName !== bookmarkNode.title) {
        try {
          if (typeof browser !== 'undefined' && browser.bookmarks && typeof browser.bookmarks.update === 'function') {
            await browser.bookmarks.update(bookmarkNode.id, { title: newName });
          } else if (typeof chrome !== 'undefined' && chrome.bookmarks && typeof chrome.bookmarks.update === 'function') {
            await new Promise((res, rej) => chrome.bookmarks.update(bookmarkNode.id, { title: newName }, (r) => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)));
          }

          const tree = (typeof bookmarkTree !== 'undefined')
            ? bookmarkTree
            : (typeof window !== 'undefined' ? window.bookmarkTree : null);

          const updateNode = (typeof updateNodeInTree === 'function')
            ? updateNodeInTree
            : (typeof window !== 'undefined' ? window.updateNodeInTree : null);

          const getTree = (typeof getBookmarkTree === 'function')
            ? getBookmarkTree
            : (typeof window !== 'undefined' ? window.getBookmarkTree : null);

          const findNode = (typeof findBookmarkNodeById === 'function')
            ? findBookmarkNodeById
            : (typeof window !== 'undefined' ? window.findBookmarkNodeById : null);

          let treePatched = false;
          if (tree && tree[0] && updateNode) {
            treePatched = Boolean(updateNode(tree[0], bookmarkNode.id, { title: newName }));
          }

          if (!treePatched && getTree) {
            await getTree(true);
          }

          const activeTree = (typeof bookmarkTree !== 'undefined')
            ? bookmarkTree
            : (typeof window !== 'undefined' ? window.bookmarkTree : null);

          const updatedNode = (activeTree && activeTree[0] && findNode)
            ? findNode(activeTree[0], bookmarkNode.id)
            : null;

          if (updatedNode) {
            updateElementData(gridItem, updatedNode);
          }
          cleanup();
        } catch (err) {
          console.error('Error updating bookmark:', err);
          cleanup();
        }
      } else {
        cleanup();
      }
    };

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveAction();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    input.addEventListener('blur', saveAction);
  }

  // --- Controller API Surface ---
  const HomebaseBookmarkGridController = {
    METADATA_GRID_PATCH_LIMIT,
    DEFAULT_ROW_HEIGHT,
    DEFAULT_ITEM_WIDTH,
    getGridElement,
    getMainContentElement,
    getVirtualizerState,
    setVirtualizerState,
    isVirtualizerEnabled,
    resetVirtualizerState,
    getActiveFolderId,
    getAllBookmarks,
    getCurrentGridFolderNode,
    setCurrentGridFolderNode,
    metadataEntriesEqual,
    getChangedMetadataIds,
    getIconKeyForNode,
    ensureBookmarkFallback,
    clearBookmarkImages,
    renderBookmarkIconInto,
    renderFolderIconInto,
    renderBookmark,
    renderBookmarkFolder,
    createBackButton,
    createNodeForVirtualizer,
    updateElementData,
    findRenderedGridItemById,
    patchActiveGridMetadataItems,
    updateVirtualGrid,
    initVirtualizer,
    disableVirtualizer,
    syncVirtualizerMove,
    reorderVirtualizerItems,
    autoResizeTextarea,
    renderBookmarkGrid,
    showEditInput,
    showGridItemRenameInput
  };

  // --- Global Window Export ---
  if (typeof window !== 'undefined') {
    window.HomebaseBookmarkGridController = HomebaseBookmarkGridController;

    // Window property bridge for virtualizerState
    if (!('virtualizerState' in window)) {
      Object.defineProperty(window, 'virtualizerState', {
        get: () => getVirtualizerState(),
        set: (val) => { setVirtualizerState(val); },
        configurable: true,
        enumerable: true
      });
    }

    // Direct global helper exports for seamless multi-script compatibility
    window.getIconKeyForNode = getIconKeyForNode;
    window.metadataEntriesEqual = metadataEntriesEqual;
    window.getChangedMetadataIds = getChangedMetadataIds;
    window.ensureBookmarkFallback = ensureBookmarkFallback;
    window.clearBookmarkImages = clearBookmarkImages;
    window.renderBookmarkIconInto = renderBookmarkIconInto;
    window.renderFolderIconInto = renderFolderIconInto;
    window.renderBookmark = renderBookmark;
    window.renderBookmarkFolder = renderBookmarkFolder;
    window.createBackButton = createBackButton;
    window.createNodeForVirtualizer = createNodeForVirtualizer;
    window.updateElementData = updateElementData;
    window.findRenderedGridItemById = findRenderedGridItemById;
    window.patchActiveGridMetadataItems = patchActiveGridMetadataItems;
    window.updateVirtualGrid = updateVirtualGrid;
    window.initVirtualizer = initVirtualizer;
    window.disableVirtualizer = disableVirtualizer;
    window.syncVirtualizerMove = syncVirtualizerMove;
    window.reorderVirtualizerItems = reorderVirtualizerItems;
    window.autoResizeTextarea = autoResizeTextarea;
    window.renderBookmarkGrid = renderBookmarkGrid;
    window.showEditInput = showEditInput;
    window.showGridItemRenameInput = showGridItemRenameInput;
  }
})();
