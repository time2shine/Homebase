// =============================================================================
// Homebase Bookmark UI State Controller
// Module: src/newtab/bookmarks/bookmark-ui-state.js
// Handles bookmark container visibility, empty-state rendering, and boot classes.
// =============================================================================

function getBookmarkChangeFolderButton() {
  return typeof document !== 'undefined' ? document.getElementById('app-bookmarks-change-root-btn') : null;
}

function resolveBookmarkBarWrapper() {
  if (typeof bookmarkBarWrapper !== 'undefined' && bookmarkBarWrapper) return bookmarkBarWrapper;
  if (typeof window !== 'undefined' && window.bookmarkBarWrapper) return window.bookmarkBarWrapper;
  if (typeof document !== 'undefined') return document.querySelector('.bookmark-bar-wrapper');
  return null;
}

function resolveBookmarksGridEl() {
  if (typeof bookmarksGridEl !== 'undefined' && bookmarksGridEl) return bookmarksGridEl;
  if (typeof window !== 'undefined' && window.bookmarksGridEl) return window.bookmarksGridEl;
  if (typeof document !== 'undefined') return document.getElementById('bookmarks-grid');
  return null;
}

function resolveBookmarksEmptyState() {
  if (typeof bookmarksEmptyState !== 'undefined' && bookmarksEmptyState) return bookmarksEmptyState;
  if (typeof window !== 'undefined' && window.bookmarksEmptyState) return window.bookmarksEmptyState;
  if (typeof document !== 'undefined') return document.getElementById('bookmarks-empty-state');
  return null;
}

function resolveBookmarksEmptyMessage() {
  if (typeof bookmarksEmptyMessage !== 'undefined' && bookmarksEmptyMessage) return bookmarksEmptyMessage;
  if (typeof window !== 'undefined' && window.bookmarksEmptyMessage) return window.bookmarksEmptyMessage;
  if (typeof document !== 'undefined') return document.getElementById('bookmarks-empty-message');
  return null;
}

function resolveBookmarkFolderTabsContainer() {
  if (typeof bookmarkFolderTabsContainer !== 'undefined' && bookmarkFolderTabsContainer) return bookmarkFolderTabsContainer;
  if (typeof window !== 'undefined' && window.bookmarkFolderTabsContainer) return window.bookmarkFolderTabsContainer;
  if (typeof document !== 'undefined') return document.getElementById('bookmark-folder-tabs');
  return null;
}

function resolveBookmarkTabsTrack() {
  if (typeof bookmarkTabsTrack !== 'undefined' && bookmarkTabsTrack) return bookmarkTabsTrack;
  if (typeof window !== 'undefined' && window.bookmarkTabsTrack) return window.bookmarkTabsTrack;
  if (typeof document !== 'undefined') return document.getElementById('bookmark-tabs-track');
  return null;
}

function resolveUiRootDisplayFolderId() {
  if (typeof rootDisplayFolderId !== 'undefined') return rootDisplayFolderId;
  if (typeof window !== 'undefined' && typeof window.rootDisplayFolderId !== 'undefined') return window.rootDisplayFolderId;
  return null;
}

function setChangeFolderButtonVisibility(visible) {
  const changeBtn = getBookmarkChangeFolderButton();
  if (!changeBtn) return;
  const shouldShow = Boolean(visible);
  const changeFolderRow = changeBtn.closest ? changeBtn.closest('.app-setting-row') : null;
  changeBtn.hidden = !shouldShow;
  if (changeBtn.classList) {
    changeBtn.classList.toggle('hidden', !shouldShow);
  }
  if (changeFolderRow) {
    changeFolderRow.hidden = !shouldShow;
    if (changeFolderRow.classList) {
      changeFolderRow.classList.toggle('hidden', !shouldShow);
    }
  }
}

function hideBookmarksUI() {
  const barWrapper = resolveBookmarkBarWrapper();
  if (barWrapper) {
    barWrapper.hidden = true;
    if (barWrapper.classList) barWrapper.classList.add('hidden');
  }
  const gridEl = resolveBookmarksGridEl();
  if (gridEl) {
    gridEl.hidden = true;
    if (gridEl.classList) gridEl.classList.add('hidden');
  }
  setChangeFolderButtonVisibility(false);
}

function showBookmarksUI(rootFolderId) {
  const barWrapper = resolveBookmarkBarWrapper();
  if (barWrapper) {
    barWrapper.hidden = false;
    if (barWrapper.classList) barWrapper.classList.remove('hidden');
  }
  const gridEl = resolveBookmarksGridEl();
  if (gridEl) {
    gridEl.hidden = false;
    if (gridEl.classList) gridEl.classList.remove('hidden');
  }
  const folderId = rootFolderId !== undefined ? rootFolderId : resolveUiRootDisplayFolderId();
  setChangeFolderButtonVisibility(folderId);
}

function showBookmarksEmptyState(message) {
  hideBookmarksUI();
  const gridEl = resolveBookmarksGridEl();
  if (gridEl) {
    gridEl.innerHTML = '';
  }
  if (typeof disableVirtualizer === 'function') {
    disableVirtualizer();
  } else if (typeof window !== 'undefined' && typeof window.disableVirtualizer === 'function') {
    window.disableVirtualizer();
  } else if (typeof window !== 'undefined' && window.HomebaseBookmarkGridController && typeof window.HomebaseBookmarkGridController.disableVirtualizer === 'function') {
    window.HomebaseBookmarkGridController.disableVirtualizer();
  }
  const tabsContainer = resolveBookmarkFolderTabsContainer();
  if (tabsContainer) {
    tabsContainer.innerHTML = '';
  }
  const tabsTrack = resolveBookmarkTabsTrack();
  if (tabsTrack) {
    tabsTrack.scrollLeft = 0;
  }
  try {
    if (typeof activeHomebaseFolderId !== 'undefined') activeHomebaseFolderId = null;
    if (typeof rootDisplayFolderId !== 'undefined') rootDisplayFolderId = null;
    if (typeof currentGridFolderNode !== 'undefined') currentGridFolderNode = null;
    if (typeof allBookmarks !== 'undefined') allBookmarks = [];
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.activeHomebaseFolderId = null;
    window.rootDisplayFolderId = null;
    window.currentGridFolderNode = null;
    window.allBookmarks = [];
  }
  const emptyMessage = resolveBookmarksEmptyMessage();
  if (emptyMessage) {
    emptyMessage.textContent =
      message ||
      'Homebase shows bookmarks from a folder you choose. We automatically look for "Other Bookmarks > Homebase". You can create one or select an existing folder.';
  }
  const emptyState = resolveBookmarksEmptyState();
  if (emptyState) {
    emptyState.hidden = false;
    if (emptyState.classList) emptyState.classList.remove('hidden');
  }
}

function hideBookmarksEmptyState() {
  const emptyState = resolveBookmarksEmptyState();
  if (emptyState) {
    emptyState.hidden = true;
    if (emptyState.classList) emptyState.classList.add('hidden');
  }
}

function beginBookmarksBoot() {
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.add('bookmarks-booting');
  }
  hideBookmarksEmptyState();
  hideBookmarksUI();
}

function endBookmarksBoot() {
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.remove('bookmarks-booting');
  }
}

const HomebaseBookmarkUiState = {
  setChangeFolderButtonVisibility,
  hideBookmarksUI,
  showBookmarksUI,
  showBookmarksEmptyState,
  hideBookmarksEmptyState,
  beginBookmarksBoot,
  endBookmarksBoot
};

if (typeof window !== 'undefined') {
  window.HomebaseBookmarkUiState = HomebaseBookmarkUiState;
  window.setChangeFolderButtonVisibility = setChangeFolderButtonVisibility;
  window.hideBookmarksUI = hideBookmarksUI;
  window.showBookmarksUI = showBookmarksUI;
  window.showBookmarksEmptyState = showBookmarksEmptyState;
  window.hideBookmarksEmptyState = hideBookmarksEmptyState;
  window.beginBookmarksBoot = beginBookmarksBoot;
  window.endBookmarksBoot = endBookmarksBoot;
}
