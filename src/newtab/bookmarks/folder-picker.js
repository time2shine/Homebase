let folderPickerFolders = [];

let folderPickerSelectedId = null;

let folderPickerLastFocusedEl = null;

let cachedFolderIndex = null;
let cachedFolderIndexAt = 0;
const FOLDER_INDEX_TTL_MS = 30_000;

const folderPickerModal = document.getElementById('folder-picker-modal');
const folderPickerPanel = document.getElementById('folder-picker-panel');
const folderPickerSearchInput = document.getElementById('folder-picker-search');
const folderPickerList = document.getElementById('folder-picker-list');
const folderPickerBreadcrumb = document.getElementById('folder-picker-breadcrumb');
const folderPickerConfirmBtn = document.getElementById('folder-picker-confirm');
const folderPickerCancelBtn = document.getElementById('folder-picker-cancel');
const folderPickerError = document.getElementById('folder-picker-error');

function buildFolderIndexFromTree(tree) {
  const rootNode = Array.isArray(tree) ? tree[0] : tree;
  if (!rootNode || !rootNode.children) return [];

  const folders = [];
  const traverse = (node, pathParts, depth, rootGroupLabel) => {
    if (!node || node.url) return;
    const title = node.title || 'Untitled';
    const currentPath = [...pathParts, title];
    const rootLabel = rootGroupLabel || currentPath[0] || 'Bookmarks';

    folders.push({
      id: node.id,
      title,
      pathLabel: currentPath.join(' › '),
      depth,
      rootGroupLabel: rootLabel,
    });

    if (node.children && node.children.length) {
      node.children.forEach((child) => {
        if (child && child.children) {
          traverse(child, currentPath, depth + 1, rootLabel);
        }
      });
    }
  };

  (rootNode.children || []).forEach((child) => traverse(child, [], 0, child.title || 'Bookmarks'));
  return folders;
}

function setFolderPickerError(message = '') {
  if (!folderPickerError) return;
  if (message) {
    folderPickerError.textContent = message;
    folderPickerError.classList.remove('hidden');
  } else {
    folderPickerError.textContent = '';
    folderPickerError.classList.add('hidden');
  }
}

function resetFolderPickerState() {
  folderPickerSelectedId = null;
  setFolderPickerError('');
  if (folderPickerSearchInput) {
    folderPickerSearchInput.value = '';
  }
  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = true;
  }
  if (folderPickerBreadcrumb) {
    folderPickerBreadcrumb.textContent = 'No folder selected';
  }
}

function invalidateFolderIndexCache() {
  cachedFolderIndex = null;
  cachedFolderIndexAt = 0;
}

function updateFolderPickerBreadcrumb() {
  if (!folderPickerBreadcrumb) return;
  const selected = folderPickerFolders.find((folder) => folder.id === folderPickerSelectedId);
  folderPickerBreadcrumb.textContent = selected ? selected.pathLabel : 'No folder selected';
}

function updateFolderPickerSelection(folderId, options = {}) {
  folderPickerSelectedId = folderId || null;
  const hasError = folderPickerError && !folderPickerError.classList.contains('hidden') && folderPickerError.textContent;

  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = !folderPickerSelectedId || Boolean(hasError);
  }

  updateFolderPickerBreadcrumb();

  if (!folderPickerList) return;
  const items = folderPickerList.querySelectorAll('.folder-picker-item');
  items.forEach((item) => {
    const isSelected = item.dataset.folderId === folderPickerSelectedId;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    if (isSelected && options.scrollIntoView) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function setFolderPickerStatus(text) {
  if (!folderPickerList) return;
  folderPickerList.innerHTML = '';
  const statusEl = document.createElement('div');
  statusEl.className = 'folder-picker-empty';
  statusEl.textContent = text;
  folderPickerList.appendChild(statusEl);
}

function renderFolderPickerList(folders, filterText = '') {
  if (!folderPickerList) return;

  const query = (filterText || '').trim().toLowerCase();
  const filtered = !query ? folders : folders.filter((folder) => {
    const title = (folder.title || '').toLowerCase();
    const path = (folder.pathLabel || '').toLowerCase();
    return title.includes(query) || path.includes(query);
  });

  const selectedVisible = folderPickerSelectedId && filtered.some((folder) => folder.id === folderPickerSelectedId);
  if (!selectedVisible) {
    folderPickerSelectedId = null;
  }

  folderPickerList.innerHTML = '';

  if (!filtered.length) {
    const message = folders.length ? 'No matching folders.' : 'No folders found.';
    setFolderPickerStatus(message);
    updateFolderPickerSelection(null);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((folder) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'folder-picker-item';
    item.dataset.folderId = folder.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', folder.id === folderPickerSelectedId ? 'true' : 'false');

    const titleEl = document.createElement('div');
    titleEl.className = 'folder-picker-title';
    titleEl.textContent = folder.title || 'Untitled';

    const pathEl = document.createElement('div');
    pathEl.className = 'folder-picker-path';
    pathEl.textContent = folder.pathLabel;

    item.appendChild(titleEl);
    item.appendChild(pathEl);

    item.addEventListener('click', () => {
      updateFolderPickerSelection(folder.id, { scrollIntoView: true });
    });

    fragment.appendChild(item);
  });

  folderPickerList.appendChild(fragment);
  updateFolderPickerSelection(folderPickerSelectedId);
}

function getFolderPickerFocusables() {
  if (!folderPickerModal || folderPickerModal.classList.contains('hidden')) return [];
  return Array.from(folderPickerModal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])'
  )).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function handleFolderPickerKeydown(e) {
  if (!folderPickerModal || folderPickerModal.classList.contains('hidden')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeFolderPicker();
    return;
  }

  if (e.key === 'Enter' && folderPickerConfirmBtn && !folderPickerConfirmBtn.disabled) {
    const tagName = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tagName !== 'textarea') {
      e.preventDefault();
      confirmFolderPickerSelection();
      return;
    }
  }

  if (e.key === 'Tab') {
    const focusables = getFolderPickerFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function attachFolderPickerKeydown() {
  document.addEventListener('keydown', handleFolderPickerKeydown, true);
}

function detachFolderPickerKeydown() {
  document.removeEventListener('keydown', handleFolderPickerKeydown, true);
}

async function openFolderPicker(triggerSource) {
  if (!folderPickerModal || !folderPickerPanel) return;

  folderPickerLastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  resetFolderPickerState();
  setFolderPickerStatus('Loading folders...');
  attachFolderPickerKeydown();

  const resolvedTriggerSource = triggerSource || homebaseChooseFolderBtn || 'homebase-choose-folder-btn';
  openModalWithAnimation('folder-picker-modal', resolvedTriggerSource, '#folder-picker-panel');

  if (folderPickerSearchInput) {
    setTimeout(() => folderPickerSearchInput.focus(), 50);
  }

  try {
    if (!browser.bookmarks) {
      setFolderPickerError('Bookmarks permission unavailable.');
      setFolderPickerStatus('Bookmarks access is required to browse folders.');
      return;
    }

    const now = Date.now();
    const useCachedIndex = cachedFolderIndex && now - cachedFolderIndexAt < FOLDER_INDEX_TTL_MS;

    if (useCachedIndex) {
      folderPickerFolders = cachedFolderIndex;
    } else {
      const tree = await getBookmarkTree(true);
      folderPickerFolders = buildFolderIndexFromTree(tree);
      cachedFolderIndex = folderPickerFolders;
      cachedFolderIndexAt = Date.now();
    }

    const storedRootId = await getHomebaseRootId();
    if (storedRootId && folderPickerFolders.some((folder) => folder.id === storedRootId)) {
      folderPickerSelectedId = storedRootId;
    }

    renderFolderPickerList(folderPickerFolders, folderPickerSearchInput ? folderPickerSearchInput.value : '');
    if (folderPickerSelectedId) {
      updateFolderPickerSelection(folderPickerSelectedId, { scrollIntoView: true });
    }
  } catch (err) {
    console.warn('Failed to open folder picker', err);
    folderPickerFolders = [];
    setFolderPickerError('Unable to read bookmarks. Please check permissions and try again.');
    setFolderPickerStatus('No folders available.');
  }
}

function closeFolderPicker() {
  detachFolderPickerKeydown();
  closeModalWithAnimation('folder-picker-modal', '#folder-picker-panel', () => {
    resetFolderPickerState();
    folderPickerFolders = [];
    if (folderPickerLastFocusedEl && typeof folderPickerLastFocusedEl.focus === 'function') {
      folderPickerLastFocusedEl.focus();
    }
  });
}

async function confirmFolderPickerSelection() {
  if (!folderPickerSelectedId || (folderPickerConfirmBtn && folderPickerConfirmBtn.disabled)) return;
  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.disabled = true;
  }

  try {
    await setHomebaseRootId(folderPickerSelectedId);
    closeFolderPicker();
    await loadBookmarks();
  } catch (err) {
    console.warn('Failed to set Homebase folder', err);
    setFolderPickerError('Could not set this folder. Please try again.');
    updateFolderPickerSelection(folderPickerSelectedId);
  } finally {
    if (folderPickerConfirmBtn) {
      folderPickerConfirmBtn.disabled = !folderPickerSelectedId;
    }
  }
}

function setupFolderPickerModal() {
  if (folderPickerSearchInput) {
    const debouncedFolderSearch = debounce(() => {
      renderFolderPickerList(folderPickerFolders, folderPickerSearchInput.value);
    }, 100);
    folderPickerSearchInput.addEventListener('input', () => {
      debouncedFolderSearch();
    });
  }

  if (folderPickerConfirmBtn) {
    folderPickerConfirmBtn.addEventListener('click', confirmFolderPickerSelection);
  }

  if (folderPickerCancelBtn) {
    folderPickerCancelBtn.addEventListener('click', closeFolderPicker);
  }

  if (folderPickerModal) {
    folderPickerModal.addEventListener('click', (e) => {
      if (e.target === folderPickerModal) {
        closeFolderPicker();
      }
    });
  }
}
