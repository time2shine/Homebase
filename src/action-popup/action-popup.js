(() => {
  'use strict';

  const ROOT_FOLDER_KEY = 'homebaseBookmarkRootId';
  // Recently selected save targets within the configured root scope (max 6).
  const RECENT_FOLDERS_KEY = 'homebaseRecentSaveFolders';
  const LAST_USED_FOLDER_KEY = 'homebaseLastUsedFolderId';
  const RECENT_LIMIT = 6;
  const FOLDER_RENDER_LIMIT = 100;
  const SAVE_SUCCESS_DELAY_MS = 500;
  const ALREADY_SAVED_DELAY_MS = 600;
  const SEARCH_DEBOUNCE_MS = 100;
  let searchDebounceTimer = null;

  const api = createExtensionApi();
  const state = {
    rootId: '',
    rootName: '',
    folders: [],
    folderMap: new Map(),
    selectedFolderId: '',
    recentFolderIds: [],
    visibleFolderIds: [],
    activeNavigationList: 'folders',
    activeTab: null,
    activeBookmarkable: false,
    rootReady: false,
    saveInProgress: false
  };

  const elements = {
    rootName: document.getElementById('root-name'),
    searchInput: document.getElementById('folder-search'),
    errorBox: document.getElementById('error-box'),
    settingsHint: document.getElementById('settings-hint'),
    foldersHint: null,
    newSubfolderBtn: document.getElementById('new-subfolder-btn'),
    newRootFolderBtn: document.getElementById('new-root-folder-btn'),
    recentList: document.getElementById('recent-list'),
    folderList: document.getElementById('folder-list'),
    closeBtn: document.getElementById('close-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    saveBtn: document.getElementById('save-btn'),
    popupCard: document.getElementById('popup-card')
  };

  document.addEventListener('DOMContentLoaded', initializePopup);

  function createExtensionApi() {
    if (typeof browser !== 'undefined' && browser && browser.storage && browser.bookmarks && browser.tabs) {
      return browser;
    }

    if (typeof chrome === 'undefined') {
      throw new Error('Extension API unavailable');
    }

    const callChrome = (target, method, ...args) => new Promise((resolve, reject) => {
      try {
        target[method](...args, (result) => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Extension API error'));
            return;
          }
          resolve(result);
        });
      } catch (err) {
        reject(err);
      }
    });

    return {
      storage: {
        local: {
          get: (keys) => callChrome(chrome.storage.local, 'get', keys),
          set: (items) => callChrome(chrome.storage.local, 'set', items),
          remove: (keys) => callChrome(chrome.storage.local, 'remove', keys)
        }
      },
      bookmarks: {
        get: (id) => callChrome(chrome.bookmarks, 'get', id),
        getChildren: (id) => callChrome(chrome.bookmarks, 'getChildren', id),
        create: (details) => callChrome(chrome.bookmarks, 'create', details)
      },
      tabs: {
        query: (queryInfo) => callChrome(chrome.tabs, 'query', queryInfo),
        create: (createProperties) => callChrome(chrome.tabs, 'create', createProperties)
      },
      runtime: {
        getURL: (path) => chrome.runtime.getURL(path)
      }
    };
  }

  async function initializePopup() {
    bindEvents();
    setRootName('Loading...');
    setListEmpty(elements.recentList, 'Loading folders...');
    setListEmpty(elements.folderList, 'Loading folders...');

    if (!elements.foldersHint && elements.folderList && elements.folderList.parentElement) {
      const hint = document.createElement('div');
      hint.id = 'folders-hint';
      hint.className = 'list-hint hidden';
      elements.folderList.parentElement.insertBefore(hint, elements.folderList);
      elements.foldersHint = hint;
    }

    const [stored, activeTab] = await Promise.all([
      loadPopupStorageState(),
      getActiveTab()
    ]);

    state.activeTab = activeTab;
    state.activeBookmarkable = Boolean(activeTab && isBookmarkableUrl(activeTab.url || ''));

    state.rootId = normalizeId(stored[ROOT_FOLDER_KEY]);
    const lastUsedFolderId = normalizeId(stored[LAST_USED_FOLDER_KEY]);
    state.recentFolderIds = normalizeRecentFolderIds(stored[RECENT_FOLDERS_KEY]);

    if (!state.rootId) {
      state.rootReady = false;
      setRootName('Not configured');
      setError('Bookmark root folder is not configured.', { showSettingsHint: true });
      setListEmpty(elements.recentList, 'No recent folders yet.');
      setListEmpty(elements.folderList, 'Configure a bookmark root folder in Homebase settings.');
      updateSaveButtonState();
      return;
    }

    const rootNode = await resolveRootFolder(state.rootId);
    if (!rootNode) {
      state.rootReady = false;
      setRootName('Missing folder');
      setError('Configured bookmark root folder was not found. It may have been deleted.', { showSettingsHint: true });
      setListEmpty(elements.recentList, 'No recent folders yet.');
      setListEmpty(elements.folderList, 'Choose another bookmark root folder in Homebase settings.');
      updateSaveButtonState();
      return;
    }

    state.rootReady = true;
    state.rootName = normalizeFolderTitle(rootNode.title);
    setRootName(state.rootName);

    state.folders = await collectFoldersWithinRoot(rootNode);
    state.folderMap = new Map(state.folders.map((folder) => [folder.id, folder]));
    state.recentFolderIds = normalizeRecentFolderIds(state.recentFolderIds, state.folderMap);
    const preferredLastUsedFolderId = lastUsedFolderId && lastUsedFolderId !== state.rootId && state.folderMap.has(lastUsedFolderId)
      ? lastUsedFolderId
      : '';
    const preferredRecentFolderId = state.recentFolderIds.find((folderId) => folderId && folderId !== state.rootId && state.folderMap.has(folderId));
    const firstNonRootFolder = state.folders.find((folder) => folder && folder.id && folder.id !== state.rootId);
    state.selectedFolderId = preferredLastUsedFolderId || preferredRecentFolderId || (firstNonRootFolder ? firstNonRootFolder.id : '');

    if (!state.selectedFolderId) {
      setError('Create a subfolder under Root to save bookmarks.');
    } else if (!state.activeBookmarkable) {
      setError('This page cannot be bookmarked.');
    } else {
      clearError();
    }

    renderFolderLists(elements.searchInput.value);
    focusSelectedFolderButton();
    updateSaveButtonState();
  }

  function bindEvents() {
    elements.closeBtn.addEventListener('click', closePopup);
    elements.cancelBtn.addEventListener('click', closePopup);

    elements.searchInput.addEventListener('input', () => {
      const value = elements.searchInput.value || '';
      if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }

      if (!value.trim()) {
        renderFolderLists(value);
        return;
      }

      searchDebounceTimer = window.setTimeout(() => {
        searchDebounceTimer = null;
        renderFolderLists(elements.searchInput.value);
      }, SEARCH_DEBOUNCE_MS);
    });

    elements.recentList.addEventListener('click', (event) => {
      const item = event.target.closest('.folder-item');
      if (!item) return;
      state.activeNavigationList = 'recent';
      selectFolder(item.dataset.folderId || '');
    });

    elements.folderList.addEventListener('click', (event) => {
      const item = event.target.closest('.folder-item');
      if (!item) return;
      state.activeNavigationList = 'folders';
      selectFolder(item.dataset.folderId || '');
    });

    elements.saveBtn.addEventListener('click', handleSaveBookmarkClick);
    if (elements.newSubfolderBtn) {
      elements.newSubfolderBtn.addEventListener('click', handleCreateSubfolderClick);
    }
    if (elements.newRootFolderBtn) {
      elements.newRootFolderBtn.addEventListener('click', handleCreateRootFolderClick);
    }
    if (elements.popupCard) {
      elements.popupCard.addEventListener('keydown', handleKeyDown);
    }

    elements.settingsHint.addEventListener('click', async () => {
      try {
        await api.tabs.create({ url: api.runtime.getURL('new-tab.html') });
      } catch (err) {
        console.warn('Failed to open Homebase settings hint target', err);
      }
      closePopup();
    });
  }

  async function loadPopupStorageState() {
    try {
      return await api.storage.local.get([ROOT_FOLDER_KEY, RECENT_FOLDERS_KEY, LAST_USED_FOLDER_KEY]);
    } catch (err) {
      console.warn('Failed to load popup storage state', err);
      return {};
    }
  }

  async function getActiveTab() {
    try {
      const currentWindow = await api.tabs.query({ active: true, currentWindow: true });
      if (Array.isArray(currentWindow) && currentWindow.length) {
        return currentWindow[0] || null;
      }

      const lastFocused = await api.tabs.query({ active: true, lastFocusedWindow: true });
      return Array.isArray(lastFocused) && lastFocused.length ? lastFocused[0] : null;
    } catch (err) {
      console.warn('Failed to query active tab', err);
      return null;
    }
  }

  async function resolveRootFolder(rootId) {
    try {
      const nodes = await api.bookmarks.get(rootId);
      const node = Array.isArray(nodes) ? nodes[0] : null;
      if (!node || node.url) {
        return null;
      }
      return node;
    } catch (err) {
      console.warn('Failed to resolve bookmark root folder', err);
      return null;
    }
  }

  async function collectFoldersWithinRoot(rootNode) {
    const rootTitle = normalizeFolderTitle(rootNode.title);
    const folders = [{
      id: rootNode.id,
      title: rootTitle,
      pathLabel: rootTitle,
      depth: 0
    }];

    const queue = [{
      id: rootNode.id,
      pathParts: [rootTitle],
      depth: 0
    }];

    const workerCount = 6;
    async function worker() {
      while (queue.length) {
        const current = queue.shift();
        if (!current) continue;

        let children = [];
        try {
          children = await api.bookmarks.getChildren(current.id);
        } catch (err) {
          console.warn('Failed to fetch bookmark children', current.id, err);
          continue;
        }

        children.forEach((child) => {
          if (!child || child.url) return;
          const title = normalizeFolderTitle(child.title);
          const nextPathParts = current.pathParts.concat(title);
          const nextDepth = current.depth + 1;
          folders.push({
            id: child.id,
            title,
            pathLabel: nextPathParts.join(' / '),
            depth: nextDepth
          });
          queue.push({
            id: child.id,
            pathParts: nextPathParts,
            depth: nextDepth
          });
        });
      }
    }

    const workers = [];
    for (let index = 0; index < workerCount; index += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);

    folders.sort((left, right) => {
      if (left.id === rootNode.id) return -1;
      if (right.id === rootNode.id) return 1;
      return left.pathLabel.localeCompare(right.pathLabel, undefined, { sensitivity: 'base' });
    });

    return folders;
  }

  function renderFolderLists(rawQuery) {
    if (!state.rootReady) {
      updateSaveButtonState();
      return;
    }

    const trimmedQuery = (rawQuery || '').trim();
    const query = trimmedQuery.toLowerCase();
    const hasQuery = trimmedQuery.length > 0;
    const filterFn = (folder) => {
      if (!query) return true;
      const title = (folder.title || '').toLowerCase();
      const pathLabel = (folder.pathLabel || '').toLowerCase();
      return title.includes(query) || pathLabel.includes(query);
    };

    const recentFolders = state.recentFolderIds
      .map((id) => state.folderMap.get(id))
      .filter((folder) => Boolean(folder) && filterFn(folder));

    const scopedFolders = state.folders.filter(filterFn);
    let subfoldersToRender = scopedFolders;
    let isCapped = false;

    if (!hasQuery && scopedFolders.length > FOLDER_RENDER_LIMIT) {
      const topFolders = scopedFolders.slice(0, FOLDER_RENDER_LIMIT);
      const selectedFolder = state.folderMap.get(state.selectedFolderId);
      const selectedInTop = topFolders.some((folder) => folder && folder.id === state.selectedFolderId);

      if (selectedFolder && !selectedInTop) {
        subfoldersToRender = [selectedFolder].concat(topFolders);
      } else {
        subfoldersToRender = topFolders;
      }
      isCapped = true;
    }

    state.visibleFolderIds = subfoldersToRender
      .filter((folder) => folder && folder.id && folder.id !== state.rootId)
      .map((folder) => folder.id);

    if (elements.foldersHint) {
      if (isCapped) {
        elements.foldersHint.textContent = `Showing first ${FOLDER_RENDER_LIMIT} folders. Type to search to see more.`;
        elements.foldersHint.classList.remove('hidden');
      } else {
        elements.foldersHint.textContent = '';
        elements.foldersHint.classList.add('hidden');
      }
    }

    renderFolderList(elements.recentList, recentFolders, query ? 'No matching recent folders.' : 'No recent folders yet.');
    renderFolderList(elements.folderList, subfoldersToRender, query ? 'No matching folders.' : 'No folders found in this root.');
    updateSaveButtonState();
  }

  function renderFolderList(container, folders, emptyMessage) {
    container.innerHTML = '';

    if (!Array.isArray(folders) || !folders.length) {
      setListEmpty(container, emptyMessage);
      return;
    }

    const isRecentList = container === elements.recentList;
    const highlightQuery = elements.searchInput ? elements.searchInput.value.trim() : '';
    const fragment = document.createDocumentFragment();
    folders.forEach((folder) => {
      const isRoot = folder.id === state.rootId;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'folder-item';
      item.dataset.folderId = folder.id;
      if (isRecentList) {
        item.title = folder.pathLabel || folder.title || '';
      }
      const depth = Number.isFinite(folder.depth) ? Math.max(0, Math.trunc(folder.depth)) : 0;
      item.style.setProperty('--depth', String(depth));
      if (folder.id === state.selectedFolderId && folder.id !== state.rootId) {
        item.classList.add('selected');
      }
      if (isRoot) {
        item.dataset.root = 'true';
      }

      const title = document.createElement('div');
      title.className = 'folder-title';
      const folderIcon = document.createElement('span');
      folderIcon.className = 'folder-icon';
      folderIcon.setAttribute('aria-hidden', 'true');
      folderIcon.textContent = isRoot ? '📂' : '📁';

      const folderName = document.createElement('span');
      folderName.className = 'folder-name';
      renderHighlightedText(folderName, folder.title, highlightQuery);

      title.appendChild(folderIcon);
      title.appendChild(folderName);

      if (isRoot) {
        const rootBadge = document.createElement('span');
        rootBadge.className = 'root-badge';
        rootBadge.textContent = 'Root';
        title.appendChild(rootBadge);
      }

      const path = document.createElement('div');
      path.className = 'folder-path';
      path.textContent = folder.pathLabel;

      item.appendChild(title);
      item.appendChild(path);
      fragment.appendChild(item);
    });

    container.appendChild(fragment);
  }

  function normalizeUrlForDuplicateCheck(url) {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value) return '';
    const isHttp = value.startsWith('http://') || value.startsWith('https://');
    if (!isHttp) return value;
    if (!value.endsWith('/') || /^https?:\/\/$/i.test(value)) return value;
    return value.slice(0, -1);
  }

  function setListEmpty(container, text) {
    container.innerHTML = '';
    const node = document.createElement('div');
    node.className = 'list-empty';
    node.textContent = text;
    container.appendChild(node);
  }

  function selectFolder(folderId) {
    if (!folderId || !state.folderMap.has(folderId)) return;
    if (folderId === state.rootId) return;
    state.selectedFolderId = folderId;
    renderFolderLists(elements.searchInput.value);
    focusSelectedFolderButton();
  }

  function promptForFolderName(parentTitle) {
    const safeParentTitle = parentTitle || 'Root';
    const rawName = window.prompt(`Create a new folder in: ${safeParentTitle}\n\nFolder name:`);
    if (rawName === null) return '';
    const folderName = rawName.trim();
    return folderName || '';
  }

  async function createFolderUnderParent(parentId, parentFolderTitle) {
    const folderName = promptForFolderName(parentFolderTitle);
    if (!folderName) {
      return null;
    }

    try {
      const createdNode = await api.bookmarks.create({
        parentId,
        title: folderName
      });
      return createdNode || null;
    } catch (err) {
      console.warn('Failed to create folder from popup', err);
      setError('Failed to create folder. Please try again.');
      return null;
    }
  }

  function insertCreatedFolder(createdNode, parentFolder) {
    if (!createdNode || !createdNode.id || createdNode.url) return null;

    const parent = parentFolder || state.folderMap.get(createdNode.parentId) || {
      id: state.rootId,
      title: state.rootName || 'Root',
      pathLabel: state.rootName || 'Root',
      depth: 0
    };

    const normalizedTitle = normalizeFolderTitle(createdNode.title);
    const parentPathLabel = parent.pathLabel || parent.title || state.rootName || 'Root';
    const parentDepth = Number.isFinite(parent.depth) ? parent.depth : 0;
    const nextFolder = {
      id: createdNode.id,
      title: normalizedTitle,
      pathLabel: `${parentPathLabel} / ${normalizedTitle}`,
      depth: parentDepth + 1
    };

    state.folderMap.set(nextFolder.id, nextFolder);
    const existingIndex = state.folders.findIndex((folder) => folder && folder.id === nextFolder.id);
    if (existingIndex >= 0) {
      state.folders[existingIndex] = nextFolder;
    } else {
      state.folders.push(nextFolder);
    }
    state.folders.sort((left, right) => {
      if (left.id === state.rootId) return -1;
      if (right.id === state.rootId) return 1;
      return left.pathLabel.localeCompare(right.pathLabel, undefined, { sensitivity: 'base' });
    });

    return nextFolder;
  }

  async function handleCreateSubfolderClick() {
    const rootId = normalizeId(state.rootId);
    if (!state.rootReady || !rootId) {
      setError('Bookmark root folder is not configured.', { showSettingsHint: true });
      updateSaveButtonState();
      return;
    }

    const selectedId = normalizeId(state.selectedFolderId);
    const useSelectedParent = selectedId && state.folderMap.has(selectedId);
    const parentId = useSelectedParent ? selectedId : rootId;
    const parentFolder = state.folderMap.get(parentId) || {
      id: rootId,
      title: state.rootName || 'Root',
      pathLabel: state.rootName || 'Root',
      depth: 0
    };
    const parentTitle = parentFolder.title || state.rootName || 'Root';

    if (elements.newSubfolderBtn) {
      elements.newSubfolderBtn.disabled = true;
    }
    if (elements.newRootFolderBtn) {
      elements.newRootFolderBtn.disabled = true;
    }

    try {
      const createdNode = await createFolderUnderParent(parentId, parentTitle);
      if (!createdNode) {
        return;
      }
      const nextFolder = insertCreatedFolder(createdNode, parentFolder);
      if (!nextFolder) {
        throw new Error('Invalid created folder node');
      }

      state.selectedFolderId = nextFolder.id;
      if (state.activeBookmarkable) {
        clearError();
      }
      renderFolderLists(elements.searchInput.value);
      focusSelectedFolderButton();
      updateSaveButtonState();
    } finally {
      if (elements.newSubfolderBtn) {
        elements.newSubfolderBtn.disabled = false;
      }
      if (elements.newRootFolderBtn) {
        elements.newRootFolderBtn.disabled = false;
      }
    }
  }

  async function handleCreateRootFolderClick() {
    const rootId = normalizeId(state.rootId);
    if (!state.rootReady || !rootId) {
      setError('Bookmark root folder is not configured.', { showSettingsHint: true });
      updateSaveButtonState();
      return;
    }

    const parentFolder = state.folderMap.get(rootId) || {
      id: rootId,
      title: state.rootName || 'Root',
      pathLabel: state.rootName || 'Root',
      depth: 0
    };
    const parentTitle = parentFolder.title || state.rootName || 'Root';

    if (elements.newSubfolderBtn) {
      elements.newSubfolderBtn.disabled = true;
    }
    if (elements.newRootFolderBtn) {
      elements.newRootFolderBtn.disabled = true;
    }

    try {
      const createdNode = await createFolderUnderParent(rootId, parentTitle);
      if (!createdNode) {
        return;
      }
      const nextFolder = insertCreatedFolder(createdNode, parentFolder);
      if (!nextFolder) {
        throw new Error('Invalid created folder node');
      }

      state.selectedFolderId = nextFolder.id;
      if (state.activeBookmarkable) {
        clearError();
      }
      renderFolderLists(elements.searchInput.value);
      focusSelectedFolderButton();
      updateSaveButtonState();
    } finally {
      if (elements.newSubfolderBtn) {
        elements.newSubfolderBtn.disabled = false;
      }
      if (elements.newRootFolderBtn) {
        elements.newRootFolderBtn.disabled = false;
      }
    }
  }

  function getNavigableItems(container) {
    if (!container) return [];
    const items = Array.from(container.querySelectorAll('.folder-item'));
    return items.filter((item) => {
      const folderId = normalizeId(item.dataset.folderId);
      if (!folderId) return false;
      if (item.dataset.root === 'true' || folderId === state.rootId) return false;
      return state.folderMap.has(folderId);
    });
  }

  function getActiveNavigationContainer() {
    const activeEl = document.activeElement;
    if (activeEl && elements.recentList && elements.recentList.contains(activeEl)) {
      const recentItems = getNavigableItems(elements.recentList);
      if (recentItems.length) return elements.recentList;
    }
    if (activeEl && elements.folderList && elements.folderList.contains(activeEl)) {
      return elements.folderList;
    }
    if (state.activeNavigationList === 'recent') {
      const recentItems = getNavigableItems(elements.recentList);
      if (recentItems.length) return elements.recentList;
    }
    return elements.folderList;
  }

  function handleKeyDown(event) {
    const key = event.key;

    if (key === 'Escape') {
      event.preventDefault();
      closePopup();
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      handleSaveBookmarkClick();
      return;
    }

    if (key !== 'ArrowDown' && key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const container = getActiveNavigationContainer();
    const items = getNavigableItems(container);
    if (!items.length) return;

    if (container === elements.recentList) {
      state.activeNavigationList = 'recent';
    } else {
      state.activeNavigationList = 'folders';
    }

    const delta = key === 'ArrowDown' ? 1 : -1;
    const currentIndex = items.findIndex((item) => item.dataset.folderId === state.selectedFolderId);

    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : items.length - 1;
    } else {
      nextIndex = Math.min(Math.max(currentIndex + delta, 0), items.length - 1);
      if (nextIndex === currentIndex) return;
    }

    const nextFolderId = items[nextIndex] && items[nextIndex].dataset ? items[nextIndex].dataset.folderId : '';
    if (!nextFolderId) return;

    selectFolder(nextFolderId);
  }

  async function handleSaveBookmarkClick() {
    if (state.saveInProgress) return;

    if (!state.rootReady) {
      updateSaveButtonState();
      return;
    }

    if (!state.activeBookmarkable || !state.activeTab || !isBookmarkableUrl(state.activeTab.url || '')) {
      setError('This page cannot be bookmarked (for example chrome:// or about: pages).');
      updateSaveButtonState();
      return;
    }

    if (!state.selectedFolderId || !state.folderMap.has(state.selectedFolderId)) {
      setError('Select a destination folder first.');
      updateSaveButtonState();
      return;
    }

    const bookmarkTitle = buildBookmarkTitle(state.activeTab);
    const bookmarkUrl = state.activeTab.url;

    state.saveInProgress = true;
    elements.saveBtn.textContent = 'Saving...';
    updateSaveButtonState();

    try {
      const isDuplicate = await hasDuplicateInFolder(state.selectedFolderId, bookmarkUrl);
      if (isDuplicate) {
        elements.saveBtn.textContent = 'Already saved ✓';
        await delay(ALREADY_SAVED_DELAY_MS);
        closePopup();
        return;
      }

      await api.bookmarks.create({
        parentId: state.selectedFolderId,
        title: bookmarkTitle,
        url: bookmarkUrl
      });

      await saveRecentFolderSelection(state.selectedFolderId);
      await persistLastUsedFolderId(state.selectedFolderId);
      elements.saveBtn.textContent = 'Saved ✓';
      await delay(SAVE_SUCCESS_DELAY_MS);
      closePopup();
    } catch (err) {
      console.warn('Failed to save bookmark from popup', err);
      setError('Failed to save bookmark. Please try again.');
      state.saveInProgress = false;
      elements.saveBtn.textContent = 'Save Bookmark';
      updateSaveButtonState();
    }
  }

  async function hasDuplicateInFolder(parentId, url) {
    if (!parentId || !url) return false;
    try {
      const targetUrl = normalizeUrlForDuplicateCheck(url);
      if (!targetUrl) return false;
      const children = await api.bookmarks.getChildren(parentId);
      if (!Array.isArray(children) || !children.length) return false;
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const childUrl = normalizeUrlForDuplicateCheck(child && child.url);
        if (childUrl && childUrl === targetUrl) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('Failed to check folder duplicates', err);
      return false;
    }
  }

  async function saveRecentFolderSelection(folderId) {
    const nextRecent = [folderId]
      .concat(state.recentFolderIds.filter((id) => id !== folderId))
      .filter((id) => state.folderMap.has(id))
      .slice(0, RECENT_LIMIT);

    state.recentFolderIds = nextRecent;

    try {
      await api.storage.local.set({ [RECENT_FOLDERS_KEY]: nextRecent });
    } catch (err) {
      console.warn('Failed to persist recent folder selections', err);
    }
  }

  async function persistLastUsedFolderId(folderId) {
    try {
      await api.storage.local.set({ [LAST_USED_FOLDER_KEY]: folderId || '' });
    } catch (err) {
      console.warn('Failed to persist last used folder id', err);
    }
  }

  function updateSaveButtonState() {
    const disabled = !state.rootReady
      || !state.activeBookmarkable
      || !state.selectedFolderId
      || state.selectedFolderId === state.rootId
      || state.saveInProgress;

    elements.saveBtn.disabled = disabled;
  }

  function setRootName(name) {
    elements.rootName.textContent = name || 'Unknown';
  }

  function setError(message, options = {}) {
    elements.errorBox.textContent = message || '';
    elements.errorBox.classList.toggle('hidden', !message);
    elements.settingsHint.classList.toggle('hidden', !options.showSettingsHint);
  }

  function clearError() {
    setError('');
  }

  function focusSelectedFolderButton() {
    if (!state.selectedFolderId) return;
    const primaryContainer = getActiveNavigationContainer();
    const fallbackContainer = primaryContainer === elements.recentList ? elements.folderList : elements.recentList;
    const containers = [primaryContainer, fallbackContainer];

    for (let c = 0; c < containers.length; c += 1) {
      const container = containers[c];
      if (!container) continue;
      const rows = container.querySelectorAll('.folder-item');
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.dataset.folderId === state.selectedFolderId) {
          row.scrollIntoView({ block: 'nearest' });
          row.focus({ preventScroll: true });
          return;
        }
      }
    }
  }

  function renderHighlightedText(container, text, query) {
    const sourceText = typeof text === 'string' ? text : '';
    container.textContent = '';

    if (!query) {
      container.textContent = sourceText;
      return;
    }

    const lowerSource = sourceText.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryLength = lowerQuery.length;
    if (!queryLength) {
      container.textContent = sourceText;
      return;
    }

    let cursor = 0;
    while (cursor < sourceText.length) {
      const matchIndex = lowerSource.indexOf(lowerQuery, cursor);
      if (matchIndex === -1) {
        container.appendChild(document.createTextNode(sourceText.slice(cursor)));
        break;
      }

      if (matchIndex > cursor) {
        container.appendChild(document.createTextNode(sourceText.slice(cursor, matchIndex)));
      }

      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = sourceText.slice(matchIndex, matchIndex + queryLength);
      container.appendChild(mark);
      cursor = matchIndex + queryLength;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function normalizeRecentFolderIds(value, folderMap) {
    if (!Array.isArray(value)) return [];

    const result = [];
    const seen = new Set();

    value.forEach((id) => {
      const normalized = normalizeId(id);
      if (!normalized || seen.has(normalized)) return;
      if (folderMap && !folderMap.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });

    return result.slice(0, RECENT_LIMIT);
  }

  function normalizeId(value) {
    if (value === null || value === undefined) return '';
    const normalized = String(value).trim();
    return normalized || '';
  }

  function normalizeFolderTitle(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || 'Untitled folder';
  }

  function buildBookmarkTitle(tab) {
    if (!tab) return 'Saved from Homebase';

    const title = typeof tab.title === 'string' ? tab.title.trim() : '';
    if (title) return title;

    try {
      const url = new URL(tab.url || '');
      return url.hostname || 'Saved from Homebase';
    } catch (err) {
      return 'Saved from Homebase';
    }
  }

  function isBookmarkableUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (err) {
      return false;
    }

    const blockedProtocols = new Set([
      'about:',
      'chrome:',
      'chrome-extension:',
      'moz-extension:',
      'edge:',
      'devtools:',
      'javascript:',
      'data:',
      'view-source:'
    ]);

    if (blockedProtocols.has(parsed.protocol)) {
      return false;
    }

    return parsed.protocol === 'http:'
      || parsed.protocol === 'https:'
      || parsed.protocol === 'ftp:'
      || parsed.protocol === 'file:';
  }

  function closePopup() {
    window.close();
  }
})();
