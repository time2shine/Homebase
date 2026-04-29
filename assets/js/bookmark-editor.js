(function () {
  'use strict';

  const BOOKMARK_META_KEY = 'bookmarkCustomMetadata';
  const FOLDER_META_KEY = 'folderCustomMetadata';
  const DOMAIN_ICON_MAP_KEY = 'domainIconMap';
  const DOMAIN_ICON_MAP_LIMIT = 200;

  let editorContext = null;

  let addBookmarkModal;
  let addBookmarkDialog;
  let bookmarkNameInput;
  let bookmarkUrlInput;
  let bookmarkSaveBtn;
  let bookmarkCancelBtn;
  let bookmarkCloseBtn;
  let bookmarkIconPreview;
  let bookmarkUploadBtn;
  let bookmarkGetBtn;
  let bookmarkClearBtn;
  let bookmarkFileInput;
  let bookmarkModalTitle;
  let bookmarkModalMode = 'add';
  let bookmarkModalEditingId = null;
  let bookmarkPreviewDebounceTimer = null;
  let lastPreviewDomain = '';
  let bookmarkModalEscBound = false;
  let bookmarkModalBound = false;
  let bookmarkPressStartedOnOverlay = false;
  let bookmarkUrlErrorEl;
  let bookmarkDomainIconPrompt;
  let bookmarkDomainIconUseBtn;
  let bookmarkDomainIconIgnoreBtn;
  let bookmarkDomainIconPromptHideTimeout = null;
  let bookmarkDomainIconPromptDismissToken = 0;
  let domainIconMap = {};
  let domainIconMapLoaded = false;
  let domainIconMapLoadPromise = null;
  let domainIconMapStorageBound = false;
  let domainIconSuggestionDismissedForDomain = new Set();
  let userExplicitlySetIconThisSession = false;
  let bookmarkGetAbortController = null;
  let pendingBookmarkMeta = {};

  let addFolderModal;
  let addFolderDialog;
  let folderNameInput;
  let folderSaveBtn;
  let folderCancelBtn;
  let folderModalInitialized = false;
  let folderCreateInFlight = false;

  let editFolderModal;
  let editFolderDialog;
  let editFolderNameInput;
  let editFolderSaveBtn;
  let editFolderCancelBtn;
  let editFolderCloseBtn;
  let editFolderIconPrompt;
  let editFolderIconPromptText;
  let editFolderIconUseBtn;
  let editFolderIconIgnoreBtn;
  let editFolderTargetId = null;
  let editFolderEscBound = false;
  let editFolderModalBound = false;
  let cachedPreviewContainer = null;
  let cachedControlsContainer = null;
  let pendingFolderMeta = {};
  let builtInIconPickerBound = false;

  let moveBookmarkModal;
  let moveBookmarkDialog;
  let moveDialogTitle;
  let moveFolderDropdown;
  let moveFolderDropdownBtn;
  let moveFolderDropdownMenu;
  let moveFolderSelectedLabel;
  let moveFolderSaveBtn;
  let moveFolderCancelBtn;
  let moveFolderCloseBtn;
  let moveModalBound = false;
  let moveModalState = {
    targetId: null,
    isFolder: false,
    originParentId: null,
    blockedIds: new Set(),
    selectedFolderId: null,
  };

  function setContext(context) {
    if (context) {
      editorContext = context;
    }
    return requireContext();
  }

  function requireContext() {
    if (!editorContext) {
      throw new Error('HomebaseBookmarkEditor requires a context');
    }
    return editorContext;
  }

  function getBookmarkTree() {
    const context = requireContext();
    return typeof context.getBookmarkTreeState === 'function'
      ? context.getBookmarkTreeState()
      : [];
  }

  function getBookmarkTreeRoot() {
    const tree = getBookmarkTree();
    return tree && tree[0] ? tree[0] : null;
  }

  function getBookmarkMetadata() {
    const context = requireContext();
    return typeof context.getBookmarkMetadata === 'function'
      ? context.getBookmarkMetadata()
      : {};
  }

  function setBookmarkMetadata(metadata) {
    const context = requireContext();
    if (typeof context.setBookmarkMetadata === 'function') {
      context.setBookmarkMetadata(metadata || {});
    }
  }

  function getFolderMetadata() {
    const context = requireContext();
    return typeof context.getFolderMetadata === 'function'
      ? context.getFolderMetadata()
      : {};
  }

  function setFolderMetadata(metadata) {
    const context = requireContext();
    if (typeof context.setFolderMetadata === 'function') {
      context.setFolderMetadata(metadata || {});
    }
  }

  function findBookmarkNodeById(rootNode, id) {
    return requireContext().findBookmarkNodeById(rootNode, id);
  }

  function getDomainKeyFromUrl(url) {
    return requireContext().getDomainKeyFromUrl(url);
  }

  function getFaviconUrlForRawUrl(url) {
    return requireContext().getFaviconUrlForRawUrl(url);
  }

  function createSvgIconElement(name, className) {
    return requireContext().createSvgIconElement(name, className);
  }

  function tintSvgElement(svg, color) {
    return requireContext().tintSvgElement(svg, color);
  }

  function getComplementaryColor(color) {
    return requireContext().getComplementaryColor(color);
  }

  function getBookmarkFolderColorPreference() {
    const context = requireContext();
    return typeof context.getBookmarkFolderColorPreference === 'function'
      ? context.getBookmarkFolderColorPreference()
      : '#FFFFFF';
  }

  function getBookmarkFallbackColorPreference() {
    const context = requireContext();
    return typeof context.getBookmarkFallbackColorPreference === 'function'
      ? context.getBookmarkFallbackColorPreference()
      : '#00b8d4';
  }

  async function refreshBookmarkTree(forceRefresh = false) {
    const context = requireContext();
    return context.getBookmarkTree(forceRefresh);
  }

  function isVirtualizerEnabled() {
    const context = requireContext();
    return typeof context.isVirtualizerEnabled === 'function'
      ? context.isVirtualizerEnabled()
      : false;
  }

  async function storageLocalGet(keys) {
    return requireContext().storageLocalGet(keys);
  }

  async function storageLocalSet(items) {
    return requireContext().storageLocalSet(items);
  }

  function bindDomainIconMapStorageListener() {
    const context = requireContext();
    if (domainIconMapStorageBound || typeof context.addStorageChangedListener !== 'function') {
      return;
    }
    context.addStorageChangedListener((changes, areaName) => {
      if (areaName && areaName !== 'local') return;
      if (changes && changes[DOMAIN_ICON_MAP_KEY]) {
        domainIconMap = changes[DOMAIN_ICON_MAP_KEY].newValue || {};
      }
    });
    domainIconMapStorageBound = true;
  }

  async function loadDomainIconMap() {
    if (domainIconMapLoaded) return;
    if (domainIconMapLoadPromise) {
      await domainIconMapLoadPromise;
      return;
    }
    bindDomainIconMapStorageListener();
    domainIconMapLoadPromise = storageLocalGet(DOMAIN_ICON_MAP_KEY)
      .then((stored) => {
        domainIconMap = stored && stored[DOMAIN_ICON_MAP_KEY] ? stored[DOMAIN_ICON_MAP_KEY] : {};
        domainIconMapLoaded = true;
      })
      .catch((e) => {
        console.warn('Failed to load domain icon map', e);
        domainIconMap = {};
        domainIconMapLoaded = true;
      })
      .finally(() => {
        domainIconMapLoadPromise = null;
      });
    await domainIconMapLoadPromise;
  }

  async function saveDomainIconMap() {
    try {
      await storageLocalSet({ [DOMAIN_ICON_MAP_KEY]: domainIconMap });
    } catch (e) {
      console.warn('Failed to save domain icon map', e);
    }
  }

  function trimDomainIconMap() {
    const keys = Object.keys(domainIconMap || {});
    if (keys.length > DOMAIN_ICON_MAP_LIMIT) {
      const overflow = keys.length - DOMAIN_ICON_MAP_LIMIT;
      const toDelete = keys.slice(0, overflow);
      toDelete.forEach((key) => delete domainIconMap[key]);
    }
  }

  function getStoredIconForDomain(domain) {
    if (!domain || !domainIconMap) return null;
    return domainIconMap[domain] || null;
  }

  function storeIconForDomain(domain, dataUrl) {
    if (!domain || !dataUrl) return;
    domainIconMap[domain] = dataUrl;
    trimDomainIconMap();
    saveDomainIconMap();
  }

  function showAddBookmarkModal() {
    const context = requireContext();
    if (!context.getActiveHomebaseFolderId()) {
      alert('Please select a bookmark folder first.');
      return;
    }

    resetBookmarkModalState();
    pendingBookmarkMeta = {};
    updateBookmarkModalPreview();

    bookmarkNameInput.value = '';
    bookmarkUrlInput.value = '';

    context.openModalWithAnimation('add-bookmark-modal', 'quick-add-bookmark', '.dialog-content');
  }

  function hideAddBookmarkModal() {
    const context = requireContext();
    dismissDomainIconPrompt();

    context.closeModalWithAnimation('add-bookmark-modal', '.dialog-content', () => {
      bookmarkNameInput.value = '';
      bookmarkUrlInput.value = '';
      resetBookmarkModalState();
    });
  }

  function setBookmarkModalMode(mode) {
    bookmarkModalMode = mode;

    if (!bookmarkModalTitle || !bookmarkSaveBtn) {
      return;
    }

    if (mode === 'edit') {
      bookmarkModalTitle.textContent = 'Edit Bookmark';
      bookmarkSaveBtn.textContent = 'Save';
    } else {
      bookmarkModalTitle.textContent = 'Add Bookmark';
      bookmarkSaveBtn.textContent = 'Save';
    }
  }

  function resetBookmarkModalState() {
    bookmarkModalEditingId = null;
    pendingBookmarkMeta = {};
    domainIconSuggestionDismissedForDomain = new Set();
    userExplicitlySetIconThisSession = false;

    if (bookmarkGetAbortController) {
      bookmarkGetAbortController.abort();
      bookmarkGetAbortController = null;
    }

    if (bookmarkDomainIconPromptHideTimeout) {
      clearTimeout(bookmarkDomainIconPromptHideTimeout);
      bookmarkDomainIconPromptHideTimeout = null;
    }

    bookmarkDomainIconPromptDismissToken++;
    setBookmarkModalBusy(false);

    if (bookmarkPreviewDebounceTimer) {
      clearTimeout(bookmarkPreviewDebounceTimer);
      bookmarkPreviewDebounceTimer = null;
    }

    lastPreviewDomain = '';

    if (bookmarkDomainIconPrompt) {
      bookmarkDomainIconPrompt.classList.add('hidden');
      bookmarkDomainIconPrompt.classList.remove('is-visible');
      bookmarkDomainIconPrompt.removeAttribute('data-domain');
      bookmarkDomainIconPrompt.style.left = '';
      bookmarkDomainIconPrompt.style.top = '';
      bookmarkDomainIconPrompt.style.visibility = '';
    }

    if (bookmarkUrlErrorEl) {
      bookmarkUrlErrorEl.textContent = '';
    }

    setBookmarkModalMode('add');
    updateBookmarkModalPreview();
    validateBookmarkModalInputs();
  }

  function showEditBookmarkModal(bookmarkId) {
    const root = getBookmarkTreeRoot();
    if (!root) {
      return;
    }

    const bookmarkNode = findBookmarkNodeById(root, bookmarkId);

    if (!bookmarkNode || !bookmarkNode.url) {
      alert('Unable to edit this bookmark.');
      return;
    }

    bookmarkModalEditingId = bookmarkId;
    setBookmarkModalMode('edit');
    domainIconSuggestionDismissedForDomain = new Set();

    bookmarkNameInput.value = bookmarkNode.title || '';
    bookmarkUrlInput.value = bookmarkNode.url || '';
    pendingBookmarkMeta = { ...(getBookmarkMetadata()[bookmarkId] || {}) };
    userExplicitlySetIconThisSession = Boolean(pendingBookmarkMeta.icon);

    updateBookmarkModalPreview();
    validateBookmarkModalInputs();

    requireContext().openModalWithAnimation('add-bookmark-modal', null, '.dialog-content');

    bookmarkNameInput.focus();
    bookmarkNameInput.select();
  }

  async function handleBookmarkModalSave() {
    const context = requireContext();
    const name = bookmarkNameInput.value.trim();
    let url = bookmarkUrlInput.value.trim();

    if (!validateBookmarkModalInputs()) {
      return;
    }

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url);
    if (!hasScheme) {
      url = 'https://' + url;
    }

    if (bookmarkModalMode === 'edit' && bookmarkModalEditingId) {
      try {
        await context.updateBookmark(bookmarkModalEditingId, {
          title: name,
          url: url
        });

        const bookmarkMetadata = getBookmarkMetadata();
        if (pendingBookmarkMeta.icon) {
          bookmarkMetadata[bookmarkModalEditingId] = { ...pendingBookmarkMeta, iconCleared: false };
        } else if (pendingBookmarkMeta.iconCleared === true) {
          bookmarkMetadata[bookmarkModalEditingId] = { iconCleared: true };
        } else {
          delete bookmarkMetadata[bookmarkModalEditingId];
        }
        setBookmarkMetadata(bookmarkMetadata);

        await storageLocalSet({ [BOOKMARK_META_KEY]: bookmarkMetadata });

        let treePatched = false;
        const root = getBookmarkTreeRoot();
        if (root) {
          treePatched = Boolean(context.updateNodeInTree(root, bookmarkModalEditingId, {
            title: name,
            url: url
          }));
        }
        if (!treePatched) {
          await refreshBookmarkTree(true);
        }

        const currentGridFolderNode = context.getCurrentGridFolderNode();
        const currentRoot = getBookmarkTreeRoot();
        if (currentGridFolderNode && currentRoot) {
          const activeNode = findBookmarkNodeById(currentRoot, currentGridFolderNode.id);
          const updatedBookmarkNode = findBookmarkNodeById(currentRoot, bookmarkModalEditingId);
          const isVisibleActiveChild = activeNode && Array.isArray(activeNode.children)
            && activeNode.children.some((child) => child && child.id === bookmarkModalEditingId);

          if (activeNode && updatedBookmarkNode && isVisibleActiveChild) {
            const itemEl = context.findRenderedGridItemById(bookmarkModalEditingId);
            if (itemEl) {
              context.updateElementData(itemEl, updatedBookmarkNode);
            } else if (!isVirtualizerEnabled()) {
              context.renderBookmarkGrid(activeNode);
            }
          }
        }

        hideAddBookmarkModal();
      } catch (err) {
        console.error('Error updating bookmark:', err);
        alert('Error: Could not update bookmark. Check the URL is valid.');
      }

      return;
    }

    const targetParentId = context.getDefaultBookmarkParentId();
    if (!targetParentId) {
      alert('Error: No active bookmark folder selected.');
      return;
    }

    try {
      const created = await context.createBookmark({
        parentId: targetParentId,
        title: name,
        url: url
      });

      const bookmarkMetadata = getBookmarkMetadata();
      if (created && created.id) {
        if (pendingBookmarkMeta.icon) {
          bookmarkMetadata[created.id] = { ...pendingBookmarkMeta, iconCleared: false };
        } else if (pendingBookmarkMeta.iconCleared === true) {
          bookmarkMetadata[created.id] = { iconCleared: true };
        }
        if (bookmarkMetadata[created.id]) {
          setBookmarkMetadata(bookmarkMetadata);
          await storageLocalSet({ [BOOKMARK_META_KEY]: bookmarkMetadata });
        }
      }

      let treePatched = false;
      const root = getBookmarkTreeRoot();
      if (root && created) {
        treePatched = Boolean(context.appendNodeToParent(root, targetParentId, { ...created }));
      }
      if (!treePatched) {
        await refreshBookmarkTree(true);
      }

      await context.setLastUsedFolderId(targetParentId);

      const currentRoot = getBookmarkTreeRoot();
      const activeFolderNode = currentRoot ? findBookmarkNodeById(currentRoot, targetParentId) : null;

      if (activeFolderNode) {
        context.renderBookmarkGrid(activeFolderNode);
      } else {
        context.loadBookmarks(context.getActiveHomebaseFolderId());
      }

      hideAddBookmarkModal();
    } catch (err) {
      console.error('Error creating bookmark:', err);
      alert('Error: Could not save bookmark. Check the URL is valid.');
    }
  }

  function setupBookmarkModal() {
    addBookmarkModal = document.getElementById('add-bookmark-modal');
    addBookmarkDialog = document.getElementById('add-bookmark-dialog');
    bookmarkNameInput = document.getElementById('bookmark-name-input');
    bookmarkUrlInput = document.getElementById('bookmark-url-input');
    bookmarkSaveBtn = document.getElementById('bookmark-save-btn');
    bookmarkCancelBtn = document.getElementById('bookmark-cancel-btn');
    bookmarkCloseBtn = document.getElementById('bookmark-close-btn');
    bookmarkIconPreview = document.getElementById('bookmark-icon-preview');
    bookmarkUploadBtn = document.getElementById('bookmark-upload-btn');
    bookmarkGetBtn = document.getElementById('bookmark-get-btn');
    bookmarkClearBtn = document.getElementById('bookmark-clear-btn');
    bookmarkFileInput = document.getElementById('bookmark-file-input');
    bookmarkModalTitle = addBookmarkDialog ? addBookmarkDialog.querySelector('h3') : null;
    bookmarkUrlErrorEl = document.getElementById('bookmark-url-error');
    bookmarkDomainIconPrompt = document.getElementById('bookmark-domain-icon-prompt');
    bookmarkDomainIconUseBtn = document.getElementById('bookmark-domain-icon-use');
    bookmarkDomainIconIgnoreBtn = document.getElementById('bookmark-domain-icon-ignore');

    if (bookmarkDomainIconPrompt && bookmarkDomainIconPrompt.parentElement !== document.body) {
      document.body.appendChild(bookmarkDomainIconPrompt);
    }

    resetBookmarkModalState();

    if (bookmarkModalBound) {
      updateBookmarkModalPreview();
      validateBookmarkModalInputs();
      return;
    }

    bookmarkSaveBtn.addEventListener('click', handleBookmarkModalSave);
    bookmarkCancelBtn.addEventListener('click', hideAddBookmarkModal);

    if (bookmarkCloseBtn) {
      bookmarkCloseBtn.addEventListener('click', hideAddBookmarkModal);
    }

    if (bookmarkUploadBtn && bookmarkFileInput) {
      bookmarkUploadBtn.addEventListener('click', () => bookmarkFileInput.click());
    }

    if (bookmarkClearBtn) {
      bookmarkClearBtn.addEventListener('click', handleBookmarkClearIcon);
    }

    if (bookmarkGetBtn) {
      bookmarkGetBtn.addEventListener('click', handleBookmarkGetIcon);
    }

    if (bookmarkFileInput) {
      bookmarkFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleBookmarkIconUpload(file);
        bookmarkFileInput.value = '';
      });
    }

    if (bookmarkDomainIconUseBtn) {
      bookmarkDomainIconUseBtn.addEventListener('click', () => {
        const domain = bookmarkDomainIconPrompt?.dataset?.domain || getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
        applyStoredIconForDomain(domain);
      });
    }

    if (bookmarkDomainIconIgnoreBtn) {
      bookmarkDomainIconIgnoreBtn.addEventListener('click', () => {
        const domain = bookmarkDomainIconPrompt?.dataset?.domain || getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
        dismissDomainIconPrompt(domain);
      });
    }

    addBookmarkModal.addEventListener('pointerdown', (e) => {
      bookmarkPressStartedOnOverlay = e.target === addBookmarkModal;
    }, true);

    addBookmarkModal.addEventListener('click', (e) => {
      if (e.target === addBookmarkModal && bookmarkPressStartedOnOverlay) {
        hideAddBookmarkModal();
      }

      bookmarkPressStartedOnOverlay = false;
    });

    bookmarkNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!bookmarkSaveBtn.disabled) {
          handleBookmarkModalSave();
        }
      } else if (e.key === 'Escape') {
        hideAddBookmarkModal();
      }
    });

    bookmarkNameInput.addEventListener('input', () => {
      validateBookmarkModalInputs();
    });

    bookmarkUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!bookmarkSaveBtn.disabled) {
          handleBookmarkModalSave();
        }
      } else if (e.key === 'Escape') {
        hideAddBookmarkModal();
      }
    });

    if (bookmarkUrlInput) {
      bookmarkUrlInput.addEventListener('input', () => {
        if (!pendingBookmarkMeta.icon) {
          scheduleBookmarkPreviewUpdate();
        }
        validateBookmarkModalInputs();
      });
    }

    if (!bookmarkModalEscBound) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && addBookmarkModal && !addBookmarkModal.classList.contains('hidden')) {
          hideAddBookmarkModal();
        }
      });
      bookmarkModalEscBound = true;
    }

    window.addEventListener('resize', () => {
      if (bookmarkDomainIconPrompt && !bookmarkDomainIconPrompt.classList.contains('hidden') && addBookmarkModal && !addBookmarkModal.classList.contains('hidden')) {
        positionBookmarkDomainIconPrompt();
      }
    });

    const bookmarkDialogContent = addBookmarkModal?.querySelector('.dialog-content');
    if (bookmarkDialogContent && !bookmarkDialogContent.dataset.promptPosBound) {
      bookmarkDialogContent.dataset.promptPosBound = '1';
      const repositionIfNeeded = () => {
        if (
          bookmarkDomainIconPrompt &&
          !bookmarkDomainIconPrompt.classList.contains('hidden') &&
          addBookmarkModal &&
          !addBookmarkModal.classList.contains('hidden')
        ) {
          positionBookmarkDomainIconPrompt();
        }
      };
      bookmarkDialogContent.addEventListener('animationend', repositionIfNeeded);
      bookmarkDialogContent.addEventListener('animationcancel', repositionIfNeeded);
    }

    updateBookmarkModalPreview();
    validateBookmarkModalInputs();

    bookmarkModalBound = true;
  }

  function getDomainFromUrl(str) {
    if (!str) return '';
    try {
      const trimmed = str.trim();
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
      const preparedUrl = hasScheme ? trimmed : `https://${trimmed}`;
      return new URL(preparedUrl).hostname || '';
    } catch (e) {
      return '';
    }
  }

  function positionBookmarkDomainIconPrompt() {
    if (!bookmarkDomainIconPrompt || !addBookmarkDialog) return;

    const wasHidden = bookmarkDomainIconPrompt.classList.contains('hidden');
    const previousDisplay = bookmarkDomainIconPrompt.style.display;
    const previousVisibility = bookmarkDomainIconPrompt.style.visibility;

    if (wasHidden) {
      bookmarkDomainIconPrompt.style.visibility = 'hidden';
      bookmarkDomainIconPrompt.style.display = 'flex';
    }

    const dialogRect = addBookmarkDialog.getBoundingClientRect();
    const promptRect = bookmarkDomainIconPrompt.getBoundingClientRect();

    let centerX = dialogRect.left + dialogRect.width / 2;
    const minX = 12;
    const maxX = window.innerWidth - 12;
    centerX = Math.min(Math.max(centerX, minX), maxX);

    const promptHeight = promptRect.height || 0;
    const transformOffset = bookmarkDomainIconPrompt.classList.contains('is-visible') ? 12 : -8;
    const desiredGap = 10;
    const viewportPadding = 8;
    const viewportBottom = window.innerHeight - viewportPadding;

    let top = dialogRect.bottom + desiredGap - transformOffset;
    if (top + promptHeight > viewportBottom) {
      top = dialogRect.top - promptHeight - desiredGap - transformOffset;
    }

    if (top < viewportPadding) {
      top = viewportPadding;
    }
    if (top + promptHeight > viewportBottom) {
      top = Math.max(viewportPadding, viewportBottom - promptHeight);
    }

    bookmarkDomainIconPrompt.style.left = `${centerX}px`;
    bookmarkDomainIconPrompt.style.top = `${top}px`;

    if (wasHidden) {
      bookmarkDomainIconPrompt.style.display = previousDisplay || '';
      bookmarkDomainIconPrompt.style.visibility = previousVisibility || '';
    } else {
      bookmarkDomainIconPrompt.style.visibility = previousVisibility || '';
    }
  }

  function setBookmarkModalBusy(isBusy) {
    if (!bookmarkGetBtn) return;
    bookmarkGetBtn.disabled = isBusy;
    bookmarkGetBtn.classList.toggle('loading', isBusy);
    bookmarkGetBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  function renderBookmarkFallbackPreview(letter) {
    if (!bookmarkIconPreview) return;
    bookmarkIconPreview.innerHTML = '';
    bookmarkIconPreview.textContent = letter || '?';
    bookmarkIconPreview.style.backgroundColor = getBookmarkFallbackColorPreference() || '#00b8d4';
    bookmarkIconPreview.style.color = '#fff';
    bookmarkIconPreview.style.fontSize = '18px';
  }

  function dismissDomainIconPrompt(domain) {
    if (domain) {
      domainIconSuggestionDismissedForDomain.add(domain);
    }
    if (bookmarkDomainIconPrompt) {
      const currentToken = ++bookmarkDomainIconPromptDismissToken;
      if (bookmarkDomainIconPromptHideTimeout) {
        clearTimeout(bookmarkDomainIconPromptHideTimeout);
        bookmarkDomainIconPromptHideTimeout = null;
      }
      bookmarkDomainIconPrompt.classList.remove('is-visible');
      const promptEl = bookmarkDomainIconPrompt;
      let hidden = false;
      const hidePrompt = () => {
        if (currentToken !== bookmarkDomainIconPromptDismissToken) return;
        if (hidden) return;
        hidden = true;
        if (bookmarkDomainIconPromptHideTimeout) {
          clearTimeout(bookmarkDomainIconPromptHideTimeout);
          bookmarkDomainIconPromptHideTimeout = null;
        }
        promptEl.classList.add('hidden');
        promptEl.classList.remove('is-visible');
        promptEl.removeAttribute('data-domain');
        promptEl.style.left = '';
        promptEl.style.top = '';
        promptEl.style.visibility = '';
      };
      promptEl.addEventListener('transitionend', hidePrompt, { once: true });
      bookmarkDomainIconPromptHideTimeout = setTimeout(() => {
        bookmarkDomainIconPromptHideTimeout = null;
        hidePrompt();
      }, 220);
    }
  }

  function applyStoredIconForDomain(domain) {
    if (!domain) return;
    const storedIcon = getStoredIconForDomain(domain);
    if (!storedIcon) return;
    pendingBookmarkMeta.icon = storedIcon;
    userExplicitlySetIconThisSession = true;
    lastPreviewDomain = '';
    if (bookmarkDomainIconPrompt) {
      if (bookmarkDomainIconPromptHideTimeout) {
        clearTimeout(bookmarkDomainIconPromptHideTimeout);
        bookmarkDomainIconPromptHideTimeout = null;
      }
      bookmarkDomainIconPrompt.classList.remove('is-visible');
      bookmarkDomainIconPrompt.classList.add('hidden');
      bookmarkDomainIconPrompt.removeAttribute('data-domain');
      bookmarkDomainIconPrompt.style.left = '';
      bookmarkDomainIconPrompt.style.top = '';
      bookmarkDomainIconPrompt.style.visibility = '';
    }
    updateBookmarkModalPreview();
    validateBookmarkModalInputs();
  }

  function maybeShowDomainIconPrompt(domain, hasValidUrl) {
    if (!bookmarkDomainIconPrompt) return;
    if (bookmarkDomainIconPromptHideTimeout) {
      clearTimeout(bookmarkDomainIconPromptHideTimeout);
      bookmarkDomainIconPromptHideTimeout = null;
    }
    bookmarkDomainIconPromptDismissToken++;
    if (!domain || !hasValidUrl || userExplicitlySetIconThisSession) {
      dismissDomainIconPrompt();
      return;
    }
    const storedIcon = getStoredIconForDomain(domain);
    if (!storedIcon || domainIconSuggestionDismissedForDomain.has(domain)) {
      dismissDomainIconPrompt();
      return;
    }
    const alreadyVisibleForDomain = bookmarkDomainIconPrompt.dataset.domain === domain && !bookmarkDomainIconPrompt.classList.contains('hidden');
    bookmarkDomainIconPrompt.dataset.domain = domain;
    if (alreadyVisibleForDomain) {
      positionBookmarkDomainIconPrompt();
      bookmarkDomainIconPrompt.classList.add('is-visible');
      return;
    }
    bookmarkDomainIconPrompt.classList.remove('hidden');
    bookmarkDomainIconPrompt.classList.remove('is-visible');
    bookmarkDomainIconPrompt.style.visibility = 'hidden';
    const dialogContent = addBookmarkModal ? addBookmarkModal.querySelector('.dialog-content') : null;
    const finalizePromptShow = () => {
      if (!bookmarkDomainIconPrompt || bookmarkDomainIconPrompt.classList.contains('hidden')) return;
      positionBookmarkDomainIconPrompt();
      bookmarkDomainIconPrompt.style.visibility = '';
      requestAnimationFrame(() => {
        if (!bookmarkDomainIconPrompt || bookmarkDomainIconPrompt.classList.contains('hidden')) return;
        positionBookmarkDomainIconPrompt();
        bookmarkDomainIconPrompt.classList.add('is-visible');
      });
    };
    if (dialogContent) {
      const handler = () => {
        dialogContent.removeEventListener('animationend', handler);
        dialogContent.removeEventListener('animationcancel', handler);
        finalizePromptShow();
      };
      dialogContent.addEventListener('animationend', handler);
      dialogContent.addEventListener('animationcancel', handler);
    } else {
      finalizePromptShow();
    }
  }

  function validateBookmarkModalInputs() {
    if (!bookmarkSaveBtn || !bookmarkUrlInput || !bookmarkNameInput) return true;
    const nameVal = (bookmarkNameInput.value || '').trim();
    const urlVal = (bookmarkUrlInput.value || '').trim();
    let errorMsg = '';
    let domain = '';
    let hasValidUrl = false;

    if (!urlVal) {
      errorMsg = 'URL is required';
    } else {
      domain = getDomainFromUrl(urlVal);
      if (!domain) {
        errorMsg = 'Enter a valid URL';
      } else {
        try {
          const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
          const preparedUrl = hasScheme ? urlVal : `https://${urlVal}`;
          new URL(preparedUrl);
          hasValidUrl = true;
        } catch (e) {
          errorMsg = 'Enter a valid URL';
        }
      }
    }

    maybeShowDomainIconPrompt(domain, hasValidUrl);

    if (bookmarkUrlErrorEl) {
      bookmarkUrlErrorEl.textContent = errorMsg;
    }

    const isValid = Boolean(nameVal) && hasValidUrl;
    bookmarkSaveBtn.disabled = !isValid;
    return isValid;
  }

  function scheduleBookmarkPreviewUpdate() {
    if (bookmarkPreviewDebounceTimer) {
      clearTimeout(bookmarkPreviewDebounceTimer);
    }
    bookmarkPreviewDebounceTimer = setTimeout(() => {
      bookmarkPreviewDebounceTimer = null;
      updateBookmarkModalPreview();
    }, 200);
  }

  function updateBookmarkModalPreview() {
    if (!bookmarkIconPreview) return;

    const urlVal = (bookmarkUrlInput && bookmarkUrlInput.value || '').trim();
    const hasCustomIcon = Boolean(pendingBookmarkMeta.icon);
    const isCleared = pendingBookmarkMeta.iconCleared === true;

    if (hasCustomIcon) {
      bookmarkIconPreview.innerHTML = '';
      bookmarkIconPreview.textContent = '';
      bookmarkIconPreview.style.color = '';
      bookmarkIconPreview.style.fontSize = '';
      bookmarkIconPreview.style.backgroundColor = '';

      const img = document.createElement('img');
      img.src = pendingBookmarkMeta.icon;
      bookmarkIconPreview.appendChild(img);
      lastPreviewDomain = '';
      return;
    }

    if (isCleared) {
      const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '★';
      renderBookmarkFallbackPreview(letter);
      lastPreviewDomain = '';
      return;
    }

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
    const preparedUrl = hasScheme ? urlVal : (urlVal ? `https://${urlVal}` : '');
    const domainKey = getDomainKeyFromUrl(preparedUrl);

    if (domainKey) {
      const existingImg = bookmarkIconPreview.querySelector('img');
      let imgEl = existingImg;

      if (!imgEl) {
        bookmarkIconPreview.innerHTML = '';
        bookmarkIconPreview.textContent = '';
        bookmarkIconPreview.style.color = '';
        bookmarkIconPreview.style.fontSize = '';
        bookmarkIconPreview.style.backgroundColor = '';

        imgEl = document.createElement('img');
        bookmarkIconPreview.appendChild(imgEl);
      } else {
        bookmarkIconPreview.textContent = '';
        bookmarkIconPreview.style.color = '';
        bookmarkIconPreview.style.fontSize = '';
        bookmarkIconPreview.style.backgroundColor = '';
      }

      lastPreviewDomain = domainKey;
      getFaviconUrlForRawUrl(preparedUrl)
        .then((resolvedUrl) => {
          if (lastPreviewDomain !== domainKey) return;
          if (!resolvedUrl) {
            lastPreviewDomain = '';
            bookmarkIconPreview.innerHTML = '';
            const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '?';
            renderBookmarkFallbackPreview(letter);
            return;
          }
          if (imgEl && imgEl.src !== resolvedUrl) {
            imgEl.src = resolvedUrl;
          }
        })
        .catch(() => {});
      return;
    }

    lastPreviewDomain = '';
    bookmarkIconPreview.innerHTML = '';

    const letter = (bookmarkNameInput && bookmarkNameInput.value ? bookmarkNameInput.value.trim().charAt(0) : '') || '?';
    renderBookmarkFallbackPreview(letter);
  }

  function handleBookmarkIconUpload(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 128;

        const sourceWidth = img.width;
        const sourceHeight = img.height;
        const side = Math.min(sourceWidth, sourceHeight);
        const sx = Math.floor((sourceWidth - side) / 2);
        const sy = Math.floor((sourceHeight - side) / 2);

        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.warn('[icon-upload] no 2d context');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_SIZE, MAX_SIZE);

        delete pendingBookmarkMeta.iconCleared;
        pendingBookmarkMeta.icon = canvas.toDataURL('image/webp', 0.85);
        userExplicitlySetIconThisSession = true;

        const domain = getDomainFromUrl((bookmarkUrlInput && bookmarkUrlInput.value) || '');
        if (domain) {
          storeIconForDomain(domain, pendingBookmarkMeta.icon);
        }

        updateBookmarkModalPreview();
        validateBookmarkModalInputs();
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  }

  function handleBookmarkClearIcon() {
    delete pendingBookmarkMeta.icon;
    pendingBookmarkMeta.iconCleared = true;
    userExplicitlySetIconThisSession = false;

    updateBookmarkModalPreview();
    validateBookmarkModalInputs();
  }

  async function handleBookmarkGetIcon() {
    const urlVal = (bookmarkUrlInput && bookmarkUrlInput.value || '').trim();

    if (bookmarkGetAbortController) {
      bookmarkGetAbortController.abort();
      bookmarkGetAbortController = null;
    }

    if (!urlVal) {
      validateBookmarkModalInputs();
      return;
    }

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlVal);
    const preparedUrl = hasScheme ? urlVal : (urlVal ? `https://${urlVal}` : '');
    const domain = getDomainKeyFromUrl(preparedUrl);
    if (!domain) {
      validateBookmarkModalInputs();
      return;
    }

    setBookmarkModalBusy(true);

    const controller = new AbortController();
    bookmarkGetAbortController = controller;

    try {
      const resolvedUrl = await getFaviconUrlForRawUrl(preparedUrl);
      if (!resolvedUrl) {
        throw new Error('Icon resolve failed');
      }
      if (controller.signal.aborted) {
        return;
      }
      delete pendingBookmarkMeta.iconCleared;
      pendingBookmarkMeta.icon = resolvedUrl;
      userExplicitlySetIconThisSession = true;
      storeIconForDomain(domain, resolvedUrl);
      updateBookmarkModalPreview();
      validateBookmarkModalInputs();
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }

      console.warn('Failed to fetch icon', err);
      alert('Could not fetch icon from site.');
    } finally {
      if (bookmarkGetAbortController === controller) {
        bookmarkGetAbortController = null;
      }

      setBookmarkModalBusy(false);
    }
  }

  function showAddFolderModal() {
    const context = requireContext();
    if (!context.getActiveHomebaseFolderId()) {
      alert('Please select a bookmark folder first.');
      return;
    }

    folderNameInput.value = '';
    context.openModalWithAnimation('add-folder-modal', 'quick-add-folder', '.dialog-content');
  }

  function hideAddFolderModal() {
    requireContext().closeModalWithAnimation('add-folder-modal', '.dialog-content', () => {
      folderNameInput.value = '';
    });
  }

  async function saveNewFolder() {
    const context = requireContext();
    const name = folderNameInput.value.trim();

    if (!name) {
      alert('Please provide a folder name.');
      return;
    }

    if (!context.getActiveHomebaseFolderId()) {
      alert('Error: No active bookmark folder selected.');
      return;
    }

    if (folderCreateInFlight) {
      return;
    }

    folderCreateInFlight = true;

    const currentGridFolderNode = context.getCurrentGridFolderNode();
    const targetParentId = currentGridFolderNode ? currentGridFolderNode.id : context.getActiveHomebaseFolderId();

    try {
      await context.createFolder({
        parentId: targetParentId,
        title: name
      });

      await refreshBookmarkTree(true);

      const root = getBookmarkTreeRoot();
      const activeFolderNode = root ? findBookmarkNodeById(root, targetParentId) : null;

      if (activeFolderNode) {
        context.renderBookmarkGrid(activeFolderNode);
      }

      hideAddFolderModal();
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Error: Could not save folder.');
    } finally {
      folderCreateInFlight = false;
    }
  }

  function setupFolderModal() {
    if (folderModalInitialized) return;

    addFolderModal = document.getElementById('add-folder-modal');
    addFolderDialog = document.getElementById('add-folder-dialog');
    folderNameInput = document.getElementById('folder-name-input');
    folderSaveBtn = document.getElementById('folder-save-btn');
    folderCancelBtn = document.getElementById('folder-cancel-btn');

    folderModalInitialized = true;

    folderSaveBtn.addEventListener('click', saveNewFolder);
    folderCancelBtn.addEventListener('click', hideAddFolderModal);

    addFolderModal.addEventListener('click', (e) => {
      if (e.target === addFolderModal) {
        hideAddFolderModal();
      }
    });

    folderNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveNewFolder();
      } else if (e.key === 'Escape') {
        hideAddFolderModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && addFolderModal && !addFolderModal.classList.contains('hidden')) {
        hideAddFolderModal();
      }
    });
  }

  function setupEditFolderModal() {
    editFolderModal = document.getElementById('edit-folder-modal');

    if (!editFolderModal) return;

    cachedControlsContainer = document.querySelector('.edit-folder-controls');
    editFolderDialog = document.getElementById('edit-folder-dialog');
    editFolderNameInput = document.getElementById('edit-folder-name-input');
    editFolderSaveBtn = document.getElementById('edit-folder-save-btn');
    editFolderCancelBtn = document.getElementById('edit-folder-cancel-btn');
    editFolderCloseBtn = document.getElementById('edit-folder-close-btn');
    editFolderIconPrompt = document.getElementById('edit-folder-icon-prompt');
    editFolderIconPromptText = document.getElementById('edit-folder-icon-prompt-text');
    editFolderIconUseBtn = document.getElementById('edit-folder-icon-use');
    editFolderIconIgnoreBtn = document.getElementById('edit-folder-icon-ignore');

    setupBuiltInIconPicker();

    if (editFolderModalBound) return;
    editFolderModalBound = true;

    const colorBtn = document.getElementById('edit-folder-color-btn');
    const uploadBtn = document.getElementById('edit-folder-upload-btn');
    const resetBtn = document.getElementById('edit-folder-reset-btn');
    const fileInput = document.getElementById('edit-folder-file-input');

    const openColorPicker = () => {
      const currentMeta = pendingFolderMeta[editFolderTargetId] || {};
      const currentColor = currentMeta.color || getBookmarkFolderColorPreference();
      const originalColor = currentColor;

      requireContext().openBookmarkEditorColorPicker({
        button: colorBtn,
        currentColor,
        onPick: (newColor) => {
          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
          pendingFolderMeta[editFolderTargetId].color = newColor;
          updateEditPreview();
        },
        onPreview: (previewColor) => {
          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
          pendingFolderMeta[editFolderTargetId].color = previewColor;
          updateEditPreview();
        },
        onRevert: () => {
          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
          pendingFolderMeta[editFolderTargetId].color = originalColor;
          updateEditPreview();
        }
      });
    };

    editFolderSaveBtn.addEventListener('click', handleEditFolderSave);
    editFolderCancelBtn.addEventListener('click', hideEditFolderModal);
    editFolderCloseBtn.addEventListener('click', hideEditFolderModal);

    if (colorBtn) {
      colorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openColorPicker();
      });
    }

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];

        if (!file) return;

        const img = new Image();
        const reader = new FileReader();

        reader.onload = (evt) => {
          img.src = evt.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 128;

            let w = img.width;
            let h = img.height;

            if (w > h) {
              if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; }
            } else {
              if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; }
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const resizedDataUrl = canvas.toDataURL('image/webp', 0.85);

            if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
            pendingFolderMeta[editFolderTargetId].icon = resizedDataUrl;
            updateEditPreview();
          };
        };

        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!pendingFolderMeta[editFolderTargetId]) return;

        delete pendingFolderMeta[editFolderTargetId].color;
        delete pendingFolderMeta[editFolderTargetId].icon;
        delete pendingFolderMeta[editFolderTargetId].scale;
        delete pendingFolderMeta[editFolderTargetId].offsetY;
        delete pendingFolderMeta[editFolderTargetId].rotation;

        const scaleSlider = document.getElementById('gooey-slider-scale');
        const offsetSlider = document.getElementById('gooey-slider-offset');
        const rotateSlider = document.getElementById('gooey-slider-rotate');
        if (scaleSlider && scaleSlider.setValue) scaleSlider.setValue(1);
        if (offsetSlider && offsetSlider.setValue) offsetSlider.setValue(0);
        if (rotateSlider && rotateSlider.setValue) rotateSlider.setValue(0);

        updateEditPreview();
      });
    }

    editFolderModal.addEventListener('click', (e) => {
      if (e.target === editFolderModal) {
        hideEditFolderModal();
      }
    });

    if (editFolderNameInput) {
      editFolderNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleEditFolderSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideEditFolderModal();
        }
      });
    }

    if (editFolderIconIgnoreBtn) {
      editFolderIconIgnoreBtn.addEventListener('click', hideEditFolderIconPrompt);
    }

    if (editFolderIconUseBtn) {
      editFolderIconUseBtn.addEventListener('click', () => {
        hideEditFolderIconPrompt();
      });
    }

    if (!editFolderEscBound) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editFolderModal && !editFolderModal.classList.contains('hidden')) {
          hideEditFolderModal();
        }
      });

      editFolderEscBound = true;
    }
  }

  function showEditFolderModal(folderNode) {
    if (!editFolderModal || !folderNode) return;

    editFolderTargetId = folderNode.id;
    if (editFolderNameInput) editFolderNameInput.value = folderNode.title || '';

    pendingFolderMeta = {};
    const folderMetadata = getFolderMetadata();
    if (folderMetadata[folderNode.id]) {
      pendingFolderMeta[folderNode.id] = { ...folderMetadata[folderNode.id] };
    }

    const currentScale = pendingFolderMeta[editFolderTargetId]?.scale ?? 1;
    const currentOffsetY = pendingFolderMeta[editFolderTargetId]?.offsetY ?? 0;
    const currentRotation = pendingFolderMeta[editFolderTargetId]?.rotation ?? 0;

    const scaleEl = document.getElementById('gooey-slider-scale');
    const offsetEl = document.getElementById('gooey-slider-offset');
    const rotateEl = document.getElementById('gooey-slider-rotate');

    if (scaleEl && !scaleEl.dataset.initialized) {
      initBubbleSlider('gooey-slider-scale', 0.5, 1.5, 1, 0.01, (val) => {
        if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
        pendingFolderMeta[editFolderTargetId].scale = val;
        updateEditPreview();
      });
      scaleEl.dataset.initialized = '1';
    }

    if (offsetEl && !offsetEl.dataset.initialized) {
      initBubbleSlider('gooey-slider-offset', -20, 20, 0, 1, (val) => {
        if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
        pendingFolderMeta[editFolderTargetId].offsetY = val;
        updateEditPreview();
      });
      offsetEl.dataset.initialized = '1';
    }

    if (rotateEl && !rotateEl.dataset.initialized) {
      initBubbleSlider('gooey-slider-rotate', -180, 180, 0, 5, (val) => {
        if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
        pendingFolderMeta[editFolderTargetId].rotation = val;
        updateEditPreview();
      });
      rotateEl.dataset.initialized = '1';
    }

    if (scaleEl && scaleEl.setValue) scaleEl.setValue(currentScale);
    if (offsetEl && offsetEl.setValue) offsetEl.setValue(currentOffsetY);
    if (rotateEl && rotateEl.setValue) rotateEl.setValue(currentRotation);

    updateEditPreview();
    requireContext().openModalWithAnimation('edit-folder-modal', null, '.dialog-content');

    if (editFolderNameInput) {
      editFolderNameInput.focus();
      editFolderNameInput.select();
    }
  }

  function hideEditFolderModal() {
    if (!editFolderModal) return;

    requireContext().closeModalWithAnimation('edit-folder-modal', '.dialog-content', () => {
      editFolderTargetId = null;
      pendingFolderMeta = {};

      cachedPreviewContainer = null;
      cachedControlsContainer = null;

      const previewContainer = document.getElementById('edit-folder-icon-preview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
      }
      if (editFolderNameInput) editFolderNameInput.value = '';
      hideEditFolderIconPrompt();
    });
  }

  function hideEditFolderIconPrompt() {
    if (!editFolderIconPrompt) return;
    editFolderIconPrompt.classList.add('hidden');
  }

  function updateEditPreview(iconOverride) {
    if (!cachedPreviewContainer) {
      cachedPreviewContainer = document.getElementById('edit-folder-icon-preview');
    }

    if (!cachedControlsContainer) {
      cachedControlsContainer = document.querySelector('.edit-folder-controls');
    }

    const previewContainer = cachedPreviewContainer;
    if (!previewContainer || !editFolderTargetId) return;

    const meta = pendingFolderMeta[editFolderTargetId] || {};
    const customColor = meta.color || getBookmarkFolderColorPreference();
    const scale = meta.scale ?? 1;
    const offsetY = meta.offsetY ?? 0;
    const rotation = meta.rotation ?? 0;
    const transformValue = `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale * 0.9}) rotate(${rotation}deg)`;
    const effectiveIcon = iconOverride !== undefined ? iconOverride : (meta.icon || null);

    if (cachedControlsContainer) {
      cachedControlsContainer.classList.toggle('visible', !!effectiveIcon);
    }

    let baseWrapper = previewContainer.querySelector('.edit-folder-base-wrapper');

    if (!baseWrapper) {
      previewContainer.replaceChildren();
      baseWrapper = document.createElement('div');
      baseWrapper.className = 'edit-folder-base-wrapper';
      const baseIcon = createSvgIconElement('bookmarkFolderLarge');
      if (baseIcon) {
        baseWrapper.appendChild(baseIcon);
      }

      previewContainer.appendChild(baseWrapper);
    }

    const contrastFill = getComplementaryColor(customColor);
    const baseSvg = baseWrapper.querySelector('svg');

    if (baseWrapper.dataset.lastAppliedColor !== customColor) {
      if (baseSvg) {
        tintSvgElement(baseSvg, customColor);
      }

      baseWrapper.dataset.lastAppliedColor = customColor;

      const iconInWrapper = baseWrapper.querySelector('.edit-folder-custom-icon-preview');
      if (iconInWrapper && iconInWrapper.tagName === 'DIV') {
        const svg = iconInWrapper.querySelector('svg');
        if (svg) {
          tintSvgElement(svg, contrastFill);
        }
      }
    }

    if (!effectiveIcon) {
      const existingIcon = baseWrapper.querySelector('.edit-folder-custom-icon-preview');
      if (existingIcon) existingIcon.remove();
      return;
    }

    let iconEl = baseWrapper.querySelector('.edit-folder-custom-icon-preview');
    const isBuiltinIcon = typeof effectiveIcon === 'string' && effectiveIcon.startsWith('builtin:');

    if (iconEl) {
      const match =
        (isBuiltinIcon && iconEl.dataset.iconKey === effectiveIcon) ||
        (!isBuiltinIcon && iconEl.dataset.src === effectiveIcon);

      if (match) {
        iconEl.style.transform = transformValue;
        if (isBuiltinIcon) {
          const svg = iconEl.querySelector('svg');
          if (svg) {
            tintSvgElement(svg, contrastFill);
          }
        }
        return;
      }

      iconEl.remove();
      iconEl = null;
    }

    if (isBuiltinIcon) {
      const key = effectiveIcon.slice('builtin:'.length);
      const svgEl = createSvgIconElement(key);
      if (!svgEl) return;

      iconEl = document.createElement('div');
      iconEl.className = 'edit-folder-custom-icon-preview';
      iconEl.appendChild(svgEl);
      iconEl.dataset.iconKey = effectiveIcon;

      const svg = iconEl.querySelector('svg');
      if (svg) {
        tintSvgElement(svg, contrastFill);
      }
    } else {
      iconEl = document.createElement('img');
      iconEl.className = 'edit-folder-custom-icon-preview';
      iconEl.src = effectiveIcon;
      iconEl.dataset.src = effectiveIcon;
    }

    iconEl.style.transform = transformValue;
    baseWrapper.appendChild(iconEl);
  }

  function initBubbleSlider(containerId, min, max, initialValue, step, onUpdate) {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.replaceChildren();
    container.className = 'range-slider-wrapper gooey-slider-container';

    const wrapper = document.createElement('div');
    wrapper.className = 'range-slider';

    const bar = document.createElement('div');
    bar.className = 'range-slider__bar';

    const fill = document.createElement('div');
    fill.className = 'range-slider__fill';
    bar.appendChild(fill);

    const thumb = document.createElement('div');
    thumb.className = 'range-slider__thumb';

    const valueTooltip = document.createElement('div');
    valueTooltip.className = 'range-slider__value';
    valueTooltip.textContent = initialValue;
    thumb.appendChild(valueTooltip);

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'range-slider__input';
    input.id = `${containerId}-input`;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = initialValue;

    wrapper.appendChild(bar);
    wrapper.appendChild(input);
    wrapper.appendChild(thumb);
    container.appendChild(wrapper);

    const updateUI = () => {
      const val = parseFloat(input.value);
      const minVal = parseFloat(input.min);
      const maxVal = parseFloat(input.max);
      const percent = ((val - minVal) * 100) / (maxVal - minVal);

      fill.style.width = `${percent}%`;
      thumb.style.left = `${percent}%`;
      valueTooltip.textContent = val;

      if (onUpdate) onUpdate(val);
    };

    input.addEventListener('input', updateUI);
    updateUI();

    container.setValue = (val) => {
      input.value = val;
      updateUI();
    };
  }

  function setupBuiltInIconPicker() {
    const triggerBtn = document.getElementById('edit-folder-builtin-btn');

    if (!triggerBtn || builtInIconPickerBound) return;

    builtInIconPickerBound = true;

    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const context = requireContext();
      context.openBookmarkIconPicker({
        anchorButton: triggerBtn,
        iconCategories: context.iconCategories,
        createSvgIconElement: context.createSvgIconElement,
        getCurrentIcon: () => pendingFolderMeta[editFolderTargetId]?.icon || null,
        previewIcon: (icon) => {
          if (!editFolderTargetId) return;
          updateEditPreview(icon);
        },
        selectIcon: (icon) => {
          if (!editFolderTargetId) return;
          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
          pendingFolderMeta[editFolderTargetId].icon = icon;
          updateEditPreview();
        },
        revertIcon: (icon) => {
          if (!editFolderTargetId) return;
          if (!pendingFolderMeta[editFolderTargetId]) pendingFolderMeta[editFolderTargetId] = {};
          if (icon) {
            pendingFolderMeta[editFolderTargetId].icon = icon;
          } else {
            delete pendingFolderMeta[editFolderTargetId].icon;
          }
          updateEditPreview();
        }
      });
    });
  }

  async function handleEditFolderSave() {
    const context = requireContext();
    if (!editFolderTargetId || !editFolderNameInput) return;

    const newName = editFolderNameInput.value.trim();
    const root = getBookmarkTreeRoot();
    const currentFolderNode = root ? findBookmarkNodeById(root, editFolderTargetId) : null;
    const nameChanged = !currentFolderNode || (currentFolderNode.title || '') !== newName;

    if (!newName) return alert('Name required');

    try {
      await context.updateFolder(editFolderTargetId, { title: newName });

      let folderMetadata = getFolderMetadata();
      try {
        const stored = await storageLocalGet(FOLDER_META_KEY);
        folderMetadata = stored[FOLDER_META_KEY] || {};
        setFolderMetadata(folderMetadata);
      } catch (_) {
        // If storage read fails, continue with current in-memory state
      }

      const newMeta = pendingFolderMeta[editFolderTargetId];

      if (newMeta && (newMeta.color || newMeta.icon || newMeta.scale !== undefined)) {
        folderMetadata[editFolderTargetId] = newMeta;
      } else {
        delete folderMetadata[editFolderTargetId];
      }
      setFolderMetadata(folderMetadata);

      let treePatched = false;
      const currentRoot = getBookmarkTreeRoot();
      if (currentRoot) {
        treePatched = Boolean(context.updateNodeInTree(currentRoot, editFolderTargetId, {
          title: newName
        }));
      }
      if (!treePatched) {
        await refreshBookmarkTree(true);
      }

      await storageLocalSet({ [FOLDER_META_KEY]: folderMetadata });

      const currentGridFolderNode = context.getCurrentGridFolderNode();
      const updatedRoot = getBookmarkTreeRoot();
      if (nameChanged && currentGridFolderNode && updatedRoot) {
        const activeNode = findBookmarkNodeById(updatedRoot, currentGridFolderNode.id);
        const updatedFolderNode = findBookmarkNodeById(updatedRoot, editFolderTargetId);
        const isVisibleActiveChild = activeNode && Array.isArray(activeNode.children)
          && activeNode.children.some((child) => child && child.id === editFolderTargetId);

        if (activeNode && updatedFolderNode && isVisibleActiveChild) {
          const itemEl = context.findRenderedGridItemById(editFolderTargetId);
          if (itemEl) {
            context.updateElementData(itemEl, updatedFolderNode);
          } else if (!isVirtualizerEnabled()) {
            context.renderBookmarkGrid(activeNode);
          }
        }
      }

      hideEditFolderModal();
    } catch (err) {
      console.error('Save failed', err);
      alert('Error: Could not update this folder.');
    }
  }

  function setupMoveModal() {
    moveBookmarkModal = document.getElementById('move-bookmark-modal');
    moveBookmarkDialog = document.getElementById('move-bookmark-dialog');
    moveDialogTitle = document.getElementById('move-dialog-title');
    moveFolderDropdown = document.getElementById('move-folder-dropdown');
    moveFolderDropdownBtn = document.getElementById('move-folder-dropdown-btn');
    moveFolderDropdownMenu = document.getElementById('move-folder-dropdown-menu');
    moveFolderSelectedLabel = document.getElementById('move-folder-selected');
    moveFolderSaveBtn = document.getElementById('move-folder-save-btn');
    moveFolderCancelBtn = document.getElementById('move-folder-cancel-btn');
    moveFolderCloseBtn = document.getElementById('move-folder-close-btn');

    if (!moveBookmarkModal || moveModalBound) return;
    moveModalBound = true;

    moveFolderSaveBtn.addEventListener('click', handleMoveBookmarkSave);
    moveFolderCancelBtn.addEventListener('click', hideMoveBookmarkModal);
    moveFolderCloseBtn.addEventListener('click', hideMoveBookmarkModal);
    if (moveFolderDropdownBtn) {
      moveFolderDropdownBtn.addEventListener('click', toggleMoveFolderDropdown);
      moveFolderDropdownBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleMoveFolderDropdown();
        } else if (e.key === 'Escape') {
          closeMoveFolderDropdown();
          hideMoveBookmarkModal();
        }
      });
    }
    moveBookmarkModal.addEventListener('click', (e) => {
      if (e.target === moveBookmarkModal) {
        hideMoveBookmarkModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && moveBookmarkModal && !moveBookmarkModal.classList.contains('hidden')) {
        hideMoveBookmarkModal();
      }
    });

    document.addEventListener('click', (e) => {
      if (!moveBookmarkModal || moveBookmarkModal.classList.contains('hidden')) return;
      if (!moveFolderDropdown) return;
      if (moveFolderDropdown.contains(e.target)) return;
      closeMoveFolderDropdown();
    });
  }

  function hideMoveBookmarkModal() {
    requireContext().closeModalWithAnimation('move-bookmark-modal', '.dialog-content', () => {
      closeMoveFolderDropdown();

      if (moveFolderDropdownMenu) {
        moveFolderDropdownMenu.innerHTML = '';
      }

      if (moveFolderSelectedLabel) {
        moveFolderSelectedLabel.textContent = 'Select folder';
      }

      moveModalState = {
        targetId: null,
        isFolder: false,
        originParentId: null,
        blockedIds: new Set(),
        selectedFolderId: null,
      };
    });
  }

  function toggleMoveFolderDropdown() {
    if (!moveFolderDropdown || !moveFolderDropdownBtn) return;

    const isOpen = moveFolderDropdown.classList.toggle('open');
    moveFolderDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (isOpen) {
      scrollMoveFolderActiveItemIntoView();
    }
  }

  function closeMoveFolderDropdown() {
    if (!moveFolderDropdown || !moveFolderDropdownBtn) return;

    moveFolderDropdown.classList.remove('open');
    moveFolderDropdownBtn.setAttribute('aria-expanded', 'false');
  }

  function scrollMoveFolderActiveItemIntoView() {
    if (!moveFolderDropdownMenu) return;

    const activeItem = moveFolderDropdownMenu.querySelector('.dropdown-item.active');

    if (activeItem) {
      activeItem.scrollIntoView({ block: 'center' });
    }
  }

  function openMoveBookmarkModal(itemId, isFolder) {
    const root = getBookmarkTreeRoot();
    if (!root) {
      alert('Bookmarks are still loading. Please try again.');
      return;
    }

    const node = findBookmarkNodeById(root, itemId);

    if (!node) {
      alert('Could not find that bookmark in the tree.');
      return;
    }

    const blockedIds = isFolder ? collectFolderBranchIds(node) : new Set();
    const folderOptions = buildFolderOptionList(blockedIds);

    if (!folderOptions.length) {
      alert('No available folders to move this item into.');
      return;
    }

    moveModalState = {
      targetId: itemId,
      isFolder,
      originParentId: node.parentId || null,
      blockedIds,
      selectedFolderId: null,
    };

    populateMoveFolderDropdown(folderOptions, moveModalState.originParentId);

    const safeTitle = node.title && node.title.trim()
      ? node.title.trim()
      : (isFolder ? 'this folder' : 'this bookmark');

    moveDialogTitle.textContent = `Move "${safeTitle}" to:`;
    requireContext().openModalWithAnimation('move-bookmark-modal', null, '.dialog-content');
    closeMoveFolderDropdown();
    moveFolderDropdownBtn.focus();
  }

  function collectFolderBranchIds(node, blocked = new Set()) {
    if (!node || node.url) {
      return blocked;
    }

    blocked.add(node.id);

    if (node.children) {
      node.children.forEach(child => {
        if (!child.url) {
          collectFolderBranchIds(child, blocked);
        }
      });
    }

    return blocked;
  }

  function getFriendlyFolderTitle(node) {
    if (node.title && node.title.trim()) {
      return node.title.trim();
    }
    if (node.id === 'toolbar_____') return 'Bookmarks Toolbar';
    if (node.id === 'unfiled_____') return 'Other Bookmarks';
    if (node.id === 'mobile______') return 'Mobile Bookmarks';
    return 'Untitled folder';
  }

  function buildFolderOptionList(blockedIds = new Set()) {
    const options = [];
    const root = getBookmarkTreeRoot();

    if (!root || !root.children) {
      return options;
    }

    const traverse = (node, depth) => {
      if (!node || node.url) return;

      if (node.id && node.id !== 'root________') {
        if (blockedIds.has(node.id)) {
          return;
        }
        const indent = depth > 0 ? `${'  '.repeat(depth - 1)}- ` : '';
        options.push({
          id: node.id,
          label: `${indent}${getFriendlyFolderTitle(node)}`
        });
      }

      if (node.children) {
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };

    root.children.forEach(child => traverse(child, 0));
    return options;
  }

  function populateMoveFolderDropdown(options, preferredId) {
    if (!moveFolderDropdownMenu || !moveFolderSelectedLabel) return;

    moveFolderDropdownMenu.innerHTML = '';
    let initialOption = null;

    options.forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dropdown-item';
      btn.textContent = option.label;
      btn.dataset.value = option.id;
      btn.addEventListener('click', () => {
        setMoveFolderSelection(option.id, option.label);
        closeMoveFolderDropdown();
      });
      moveFolderDropdownMenu.appendChild(btn);
      if (preferredId && option.id === preferredId) {
        initialOption = option;
      } else if (!preferredId && moveModalState.originParentId && option.id === moveModalState.originParentId) {
        initialOption = option;
      }
    });

    if (initialOption) {
      setMoveFolderSelection(initialOption.id, initialOption.label);
    } else {
      setMoveFolderSelection(null, null);
    }
  }

  function setMoveFolderSelection(folderId, label) {
    moveModalState.selectedFolderId = folderId;

    if (moveFolderSelectedLabel) {
      moveFolderSelectedLabel.textContent = label || 'Select folder';
    }

    if (moveFolderDropdownMenu) {
      Array.from(moveFolderDropdownMenu.children).forEach(child => {
        child.classList.toggle('active', child.dataset.value === folderId);
      });
    }
  }

  async function handleMoveBookmarkSave() {
    const context = requireContext();
    if (!moveModalState.targetId) return;

    const destinationId = moveModalState.selectedFolderId;
    if (!destinationId) return;

    if (moveModalState.blockedIds.has(destinationId)) {
      alert('Cannot move a folder inside itself.');
      return;
    }

    try {
      await context.moveNode(moveModalState.targetId, {
        parentId: destinationId
      });
      hideMoveBookmarkModal();

      const currentGridFolderNode = context.getCurrentGridFolderNode();
      const refreshFolderId =
        (currentGridFolderNode && currentGridFolderNode.id) ||
        context.getActiveHomebaseFolderId() ||
        context.getRootDisplayFolderId();

      context.loadBookmarks(refreshFolderId);
    } catch (err) {
      console.error('Error moving bookmark:', err);
      alert('Error: Could not move this item.');
    }
  }

  function buildDeleteDialogIconPreview(sourceTileEl) {
    if (!sourceTileEl || !sourceTileEl.isConnected) return null;

    const iconWrapper = sourceTileEl.querySelector('.bookmark-icon-wrapper');
    if (!iconWrapper) return null;

    const clone = iconWrapper.cloneNode(true);
    if (sourceTileEl.dataset.isFolder === 'true') {
      clone.classList.add('folder-preview');
    }
    const computed = window.getComputedStyle(iconWrapper);
    const cssVarsToCopy = [
      '--bookmark-folder-color',
      '--bookmark-fallback-color',
      '--bookmark-fallback-text-color'
    ];

    cssVarsToCopy.forEach((varName) => {
      const value = computed.getPropertyValue(varName);
      if (value) {
        clone.style.setProperty(varName, value.trim());
      }
    });

    return clone;
  }

  function buildIconPreviewFromNode(node) {
    const context = requireContext();
    if (!node || node.isBackButton) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'bookmark-icon-wrapper';
    if (node.children) {
      wrapper.classList.add('folder-preview');
    }

    const nextKey = context.getIconKeyForNode(node);
    if (node.children) {
      context.renderFolderIconInto(wrapper, node, nextKey);
    } else {
      context.renderBookmarkIconInto(wrapper, node, nextKey);
    }

    return wrapper;
  }

  function showDeleteConfirm(message, options = {}) {
    return new Promise((resolve) => {
      const context = requireContext();
      const modal = document.getElementById('confirm-delete-modal');
      const iconSpan = document.getElementById('confirm-delete-icon');
      const textSpan = document.getElementById('confirm-delete-text');
      const cancelBtn = document.getElementById('confirm-delete-cancel-btn');
      const okBtn = document.getElementById('confirm-delete-ok-btn');
      const closeBtn = document.getElementById('confirm-delete-close-btn');

      const {
        title = '',
        faviconUrl = null,
        isFolder = false,
        node = null,
        sourceTileEl = null
      } = options;

      let finalText;

      if (isFolder && title) {
        finalText = `Are you sure you want to remove "${title}" and all its contents?`;
      } else if (title) {
        finalText = `Are you sure you want to remove "${title}"?`;
      } else if (message) {
        finalText = message;
      } else {
        finalText = 'Delete this item?';
      }

      textSpan.textContent = finalText;
      iconSpan.replaceChildren();

      const previewIcon =
        buildDeleteDialogIconPreview(sourceTileEl) ||
        buildIconPreviewFromNode(node);

      if (previewIcon) {
        iconSpan.appendChild(previewIcon);
      } else if (isFolder) {
        const wrapper = document.createElement('div');
        wrapper.className = 'bookmark-icon-wrapper';
        const folderIcon = createSvgIconElement('bookmarkFolderLarge');
        if (folderIcon) {
          wrapper.appendChild(folderIcon);
        }
        iconSpan.appendChild(wrapper);
      } else if (faviconUrl) {
        const img = document.createElement('img');
        img.src = faviconUrl;
        img.alt = '';
        iconSpan.appendChild(img);
      } else if (title) {
        const fallback = document.createElement('div');
        fallback.className = 'bookmark-fallback-icon';
        fallback.textContent = title.charAt(0).toUpperCase();
        iconSpan.appendChild(fallback);
      }

      context.openModalWithAnimation('confirm-delete-modal', null, '.dialog-content');

      let resolved = false;

      const cleanup = (result) => {
        cancelBtn.removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        if (closeBtn) closeBtn.removeEventListener('click', onCancel);
        resolve(result);
      };

      const closeWithResult = (result) => {
        if (resolved) return;

        resolved = true;

        context.closeModalWithAnimation('confirm-delete-modal', '.dialog-content', () => cleanup(result));
      };

      const onCancel = () => {
        closeWithResult(false);
      };

      const onOk = () => {
        closeWithResult(true);
      };

      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      if (closeBtn) closeBtn.addEventListener('click', onCancel);
    });
  }

  async function openAddBookmark(options = {}) {
    setContext(options.context);
    await loadDomainIconMap();
    setupBookmarkModal();
    showAddBookmarkModal();
  }

  async function openEditBookmark(options = {}) {
    setContext(options.context);
    await loadDomainIconMap();
    setupBookmarkModal();
    showEditBookmarkModal(options.bookmarkId);
  }

  function openAddFolder(options = {}) {
    setContext(options.context);
    setupFolderModal();
    showAddFolderModal();
  }

  function openEditFolder(options = {}) {
    setContext(options.context);
    setupEditFolderModal();

    let folderNode = options.folderNode || null;
    if (!folderNode && options.folderId) {
      const root = getBookmarkTreeRoot();
      folderNode = root ? findBookmarkNodeById(root, options.folderId) : null;
    }

    showEditFolderModal(folderNode);
  }

  function openMoveDialog(options = {}) {
    setContext(options.context);
    setupMoveModal();
    openMoveBookmarkModal(options.itemId, Boolean(options.isFolder));
  }

  function openDeleteDialog(options = {}) {
    setContext(options.context);
    return showDeleteConfirm(options.message, options);
  }

  function closeAll(options = {}) {
    if (options.context) {
      setContext(options.context);
    }

    if (addBookmarkModal && !addBookmarkModal.classList.contains('hidden')) {
      hideAddBookmarkModal();
    }
    if (addFolderModal && !addFolderModal.classList.contains('hidden')) {
      hideAddFolderModal();
    }
    if (editFolderModal && !editFolderModal.classList.contains('hidden')) {
      hideEditFolderModal();
    }
    if (moveBookmarkModal && !moveBookmarkModal.classList.contains('hidden')) {
      hideMoveBookmarkModal();
    }
  }

  window.HomebaseBookmarkEditor = {
    openAddBookmark,
    openEditBookmark,
    openAddFolder,
    openEditFolder,
    openMoveDialog,
    openDeleteDialog,
    closeAll
  };
})();
