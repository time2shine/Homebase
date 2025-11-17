// ===============================================
// --- GLOBAL ELEMENTS ---
// ===============================================
const browser = window.browser || window.chrome;
const googleAppsBtn = document.getElementById('google-apps-btn');
const googleAppsPanel = document.getElementById('google-apps-panel');

const searchWidget = document.querySelector('.widget-search');
const searchResultsPanel = document.getElementById('search-results-panel');
const bookmarkResultsContainer = document.getElementById('bookmark-results-container');
const suggestionResultsContainer = document.getElementById('suggestion-results-container');

const searchAreaWrapper = document.querySelector('.search-area-wrapper');
const sidebar = document.querySelector('.sidebar');
const collapsedClockSlot = document.getElementById('collapsed-clock-slot');
const timeWidget = document.querySelector('.widget-time');
const dock = document.querySelector('.dock');
const bookmarkTabsTrack = document.getElementById('bookmark-tabs-track');
const tabScrollLeftBtn = document.getElementById('tab-scroll-left');
const tabScrollRightBtn = document.getElementById('tab-scroll-right');
const SIDEBAR_COLLAPSE_RATIO = 0.49;
const DOCK_COLLAPSE_RATIO = 0.32;
const TAB_SCROLL_STEP = 180;

/**
 * Toggles a CSS class when the window width shrinks below the configured ratio
 * so the sidebar widgets can be hidden and the main pane regains the space.
 */
function updateSidebarCollapseState() {
  const referenceWidth = (window.screen && window.screen.availWidth) ? window.screen.availWidth : window.innerWidth;
  if (!referenceWidth) return;
  const widthRatio = window.innerWidth / referenceWidth;
  const shouldCollapseSidebar = widthRatio <= SIDEBAR_COLLAPSE_RATIO;
  const shouldCollapseDock = widthRatio <= DOCK_COLLAPSE_RATIO;
  document.body.classList.toggle('sidebar-collapsed', shouldCollapseSidebar);
  document.body.classList.toggle('dock-collapsed', shouldCollapseDock);

  if (shouldCollapseSidebar) {
    if (collapsedClockSlot && timeWidget && timeWidget.parentElement !== collapsedClockSlot) {
      collapsedClockSlot.appendChild(timeWidget);
    }
  } else {
    if (sidebar && timeWidget && timeWidget.parentElement !== sidebar) {
      const firstSidebarChild = sidebar.firstElementChild;
      if (firstSidebarChild) {
        sidebar.insertBefore(timeWidget, firstSidebarChild);
      } else {
        sidebar.appendChild(timeWidget);
      }
    }
  }
}

/**
 * Shows or hides the folder tab scroll arrows based on overflow and scroll position.
 */
function updateBookmarkTabOverflow() {
  if (!bookmarkTabsTrack || !tabScrollLeftBtn || !tabScrollRightBtn) return;

  const maxScrollLeft = Math.max(0, bookmarkTabsTrack.scrollWidth - bookmarkTabsTrack.clientWidth);
  const currentScroll = bookmarkTabsTrack.scrollLeft;
  const showLeft = maxScrollLeft > 0 && currentScroll > 4;
  const showRight = maxScrollLeft > 0 && currentScroll < (maxScrollLeft - 4);

  tabScrollLeftBtn.classList.toggle('visible', showLeft);
  tabScrollRightBtn.classList.toggle('visible', showRight);
}

/**
 * Scrolls the folder tab row by a fixed amount in the given direction.
 */
function scrollBookmarkTabs(direction) {
  if (!bookmarkTabsTrack) return;
  bookmarkTabsTrack.scrollBy({
    left: direction * TAB_SCROLL_STEP,
    behavior: 'smooth'
  });
}

window.addEventListener('resize', updateSidebarCollapseState);
updateSidebarCollapseState();
window.addEventListener('resize', updateBookmarkTabOverflow);
updateBookmarkTabOverflow();

if (tabScrollLeftBtn) {
  tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));
}
if (tabScrollRightBtn) {
  tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));
}
if (bookmarkTabsTrack) {
  bookmarkTabsTrack.addEventListener('scroll', () => {
    window.requestAnimationFrame(updateBookmarkTabOverflow);
  });
}

let allBookmarks = [];
let suggestionAbortController = null; // To cancel old requests
let bookmarkTree = []; // To store the entire bookmark tree

// --- BOOKMARK LOGIC UPDATES ---
const bookmarkFolderTabsContainer = document.getElementById('bookmark-folder-tabs');
let rootDisplayFolderId = null; // ID of the main folder being displayed (e.g., "homebase")
let activeHomebaseFolderId = null; // ID of the selected folder tab

// === NEW: GRID/TABS DRAG-AND-DROP GLOBALS ===
let currentGridFolderNode = null; // The folder node currently being rendered in the grid
let gridSortable = null;          // Instance for the bookmarks grid
let tabsSortable = null;          // Instance for the folder tabs

// NEW: folder hover delay state
let folderHoverTarget = null;
let folderHoverStart = 0;
const FOLDER_HOVER_DELAY_MS = 250; // tweak this (200–400ms) to taste

// === CONTEXT MENU ELEMENTS ===
const folderContextMenu = document.getElementById('bookmark-folder-menu');
const menuEditBtn = document.getElementById('menu-edit-btn');
const menuDeleteBtn = document.getElementById('menu-delete-btn');

// NEW: context menus for grid items
const gridFolderMenu = document.getElementById('bookmark-grid-folder-menu');
const iconContextMenu = document.getElementById('bookmark-icon-menu');
const gridBlankMenu = document.getElementById('bookmark-grid-blank-menu');
const gridMenuCreateBookmarkBtn = document.getElementById('grid-menu-create-bookmark');
const gridMenuCreateFolderBtn = document.getElementById('grid-menu-create-folder');
const gridMenuManageBtn = document.getElementById('grid-menu-manage');

// NEW: simple state so you know what was right-clicked
let currentContextItemId = null;
let currentContextIsFolder = false;

// === QUICK ACTION ELEMENTS ===
const quickAddBookmarkBtn = document.getElementById('quick-add-bookmark');
const quickAddFolderBtn = document.getElementById('quick-add-folder');
const quickOpenBookmarksBtn = document.getElementById('quick-open-bookmarks');

// ===============================================
// --- NEW: ADD BOOKMARK MODAL ELEMENTS ---
// ===============================================
let addBookmarkModal;
let addBookmarkDialog;
let bookmarkNameInput;
let bookmarkUrlInput;
let bookmarkSaveBtn;
let bookmarkCancelBtn;
let bookmarkCloseBtn;
let bookmarkModalTitle;
let bookmarkModalMode = 'add';
let bookmarkModalEditingId = null;

// ===============================================
// --- NEW: ADD FOLDER MODAL ELEMENTS ---
// ===============================================
let addFolderModal;
let addFolderDialog;
let folderNameInput;
let folderSaveBtn;
let folderCancelBtn;

// ===============================================
// --- EDIT FOLDER MODAL ELEMENTS ---
// ===============================================
let editFolderModal;
let editFolderDialog;
let editFolderNameInput;
let editFolderSaveBtn;
let editFolderCancelBtn;
let editFolderCloseBtn;
let editFolderIconSpan;
let editFolderTextSpan;
let editFolderTargetId = null;

// ===============================================
// --- MOVE BOOKMARK MODAL ELEMENTS ---
// ===============================================
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
let moveModalState = {
  targetId: null,
  isFolder: false,
  originParentId: null,
  blockedIds: new Set(),
  selectedFolderId: null,
};

// ===============================================
// --- NEW: ADD BOOKMARK MODAL FUNCTIONS ---
// ===============================================

/**
 * Shows the "Add Bookmark" modal.
 * (MODIFIED: This version leaves the fields empty)
 */
async function showAddBookmarkModal() {
  if (!activeHomebaseFolderId) {
    alert('Please select a bookmark folder first.');
    return;
  }

  resetBookmarkModalState();
  
  // 1. Clear inputs
  bookmarkNameInput.value = '';
  bookmarkUrlInput.value = ''; // This will show the "https://..." placeholder
  
  // 2. Show the modal
  addBookmarkModal.style.display = 'flex';
  
  // 3. Focus the name input
  bookmarkNameInput.focus();
}

/**
 * Hides the "Add Bookmark" modal and clears inputs.
 */
function hideAddBookmarkModal() {
  addBookmarkModal.style.display = 'none';
  bookmarkNameInput.value = '';
  bookmarkUrlInput.value = '';
  resetBookmarkModalState();
}

function setBookmarkModalMode(mode) {
  bookmarkModalMode = mode;
  if (!bookmarkModalTitle || !bookmarkSaveBtn) {
    return;
  }
  if (mode === 'edit') {
    bookmarkModalTitle.textContent = 'Edit Bookmark';
    bookmarkSaveBtn.textContent = 'Update';
  } else {
    bookmarkModalTitle.textContent = 'Add Bookmark';
    bookmarkSaveBtn.textContent = 'Save';
  }
}

function resetBookmarkModalState() {
  bookmarkModalEditingId = null;
  setBookmarkModalMode('add');
}

/**
 * Opens the bookmark modal with the selected bookmark details for editing.
 */
function showEditBookmarkModal(bookmarkId) {
  if (!bookmarkTree || !bookmarkTree[0]) {
    return;
  }
  const bookmarkNode = findBookmarkNodeById(bookmarkTree[0], bookmarkId);
  if (!bookmarkNode || !bookmarkNode.url) {
    alert('Unable to edit this bookmark.');
    return;
  }

  bookmarkModalEditingId = bookmarkId;
  setBookmarkModalMode('edit');

  bookmarkNameInput.value = bookmarkNode.title || '';
  bookmarkUrlInput.value = bookmarkNode.url || '';

  addBookmarkModal.style.display = 'flex';
  bookmarkNameInput.focus();
  bookmarkNameInput.select();
}

/**
 * Saves the new bookmark from the modal inputs.
 * (MODIFIED: This version re-fetches the tree to refresh the UI)
 */
async function handleBookmarkModalSave() {
  const name = bookmarkNameInput.value.trim();
  let url = bookmarkUrlInput.value.trim();

  // 1. Validate inputs
  if (!name || !url) {
    alert("Please provide a name and URL.");
    return;
  }
  
  // 2. Simple URL correction (add https:// if no protocol)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  if (bookmarkModalMode === 'edit' && bookmarkModalEditingId) {
    try {
      await browser.bookmarks.update(bookmarkModalEditingId, {
        title: name,
        url: url
      });

      const newTree = await browser.bookmarks.getTree();
      bookmarkTree = newTree;

      let folderToRender = null;
      if (currentGridFolderNode) {
        folderToRender = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
      }
      if (!folderToRender && activeHomebaseFolderId) {
        folderToRender = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
      }

      if (folderToRender) {
        renderBookmarkGrid(folderToRender);
      } else {
        loadBookmarks(activeHomebaseFolderId);
      }

      hideAddBookmarkModal();
    } catch (err) {
      console.error("Error updating bookmark:", err);
      alert("Error: Could not update bookmark. Check the URL is valid.");
    }
    return;
  }

  // 3. Check for active folder when adding
  if (!activeHomebaseFolderId) {
    alert("Error: No active bookmark folder selected.");
    return;
  }

  // 4. Create the bookmark
  try {
    await browser.bookmarks.create({
      parentId: activeHomebaseFolderId,
      title: name,
      url: url
    });

    // 5. === THIS IS THE FIX ===
    // Re-fetch the entire bookmark tree to get the update
    const newTree = await browser.bookmarks.getTree();
    bookmarkTree = newTree; // Update the global tree variable

    // 6. Re-find the active folder node from the NEW tree
    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
    
    // 7. Re-render the grid with the updated folder
    if (activeFolderNode) {
      renderBookmarkGrid(activeFolderNode);
    }
    
    hideAddBookmarkModal();
    
  } catch (err) {
    console.error("Error creating bookmark:", err);
    alert("Error: Could not save bookmark. Check the URL is valid.");
  }
}

/**
 * NEW: Sets up all event listeners for the bookmark modal
 */
function setupBookmarkModal() {
  // 1. Assign global variables to DOM elements
  addBookmarkModal = document.getElementById('add-bookmark-modal');
  addBookmarkDialog = document.getElementById('add-bookmark-dialog');
  bookmarkNameInput = document.getElementById('bookmark-name-input');
  bookmarkUrlInput = document.getElementById('bookmark-url-input');
  bookmarkSaveBtn = document.getElementById('bookmark-save-btn');
  bookmarkCancelBtn = document.getElementById('bookmark-cancel-btn');
  bookmarkCloseBtn = document.getElementById('bookmark-close-btn');
  bookmarkModalTitle = addBookmarkDialog.querySelector('h3');
  resetBookmarkModalState();

  // 2. Attach button listeners
  bookmarkSaveBtn.addEventListener('click', handleBookmarkModalSave);
  bookmarkCancelBtn.addEventListener('click', hideAddBookmarkModal);
  if (bookmarkCloseBtn) {
    bookmarkCloseBtn.addEventListener('click', hideAddBookmarkModal);
  }

  // 3. Click background overlay to close
  addBookmarkModal.addEventListener('click', (e) => {
    if (e.target === addBookmarkModal) {
      hideAddBookmarkModal();
    }
  });

  // 4. Listen for "Enter" key in input fields
  bookmarkNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleBookmarkModalSave();
    } else if (e.key === 'Escape') {
      hideAddBookmarkModal();
    }
  });

  bookmarkUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleBookmarkModalSave();
    } else if (e.key === 'Escape') {
      hideAddBookmarkModal();
    }
  });
  
  // 5. Listen for "Escape" key globally when modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addBookmarkModal.style.display === 'flex') {
      hideAddBookmarkModal();
    }
  });
}

// ===============================================
// --- NEW: ADD FOLDER MODAL FUNCTIONS ---
// ===============================================

/**
 * Shows the "Add Folder" modal.
 */
async function showAddFolderModal() {
  if (!activeHomebaseFolderId) {
    alert('Please select a bookmark folder first.');
    return;
  }
  
  // 1. Clear input
  folderNameInput.value = '';
  
  // 2. Show the modal
  addFolderModal.style.display = 'flex';
  
  // 3. Focus the name input
  folderNameInput.focus();
}

/**
 * Hides the "Add Folder" modal and clears inputs.
 */
function hideAddFolderModal() {
  addFolderModal.style.display = 'none';
  folderNameInput.value = '';
}

/**
 * Saves the new folder from the modal inputs.
 */
async function saveNewFolder() {
  const name = folderNameInput.value.trim();

  // 1. Validate inputs
  if (!name) {
    alert("Please provide a folder name.");
    return;
  }

  // 2. Check for active folder
  if (!activeHomebaseFolderId) {
    alert("Error: No active bookmark folder selected.");
    return;
  }

  // 3. Create the folder
  try {
    await browser.bookmarks.create({
      parentId: activeHomebaseFolderId, // <-- Creates in the active tab
      title: name
    });

    // 4. Re-fetch the entire bookmark tree to get the update
    const newTree = await browser.bookmarks.getTree();
    bookmarkTree = newTree; // Update the global tree variable

    // 5. Re-find the active folder node from the NEW tree
    const activeFolderNode = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
    
    // 6. Re-render the grid with the updated folder
    if (activeFolderNode) {
      renderBookmarkGrid(activeFolderNode);
    }
    
    // 7. Hide the modal on success
    hideAddFolderModal();
    
  } catch (err) {
    console.error("Error creating folder:", err);
    alert("Error: Could not save folder.");
  }
}

/**
 * NEW: Sets up all event listeners for the folder modal
 */
function setupFolderModal() {
  // 1. Assign global variables to DOM elements
  addFolderModal = document.getElementById('add-folder-modal');
  addFolderDialog = document.getElementById('add-folder-dialog');
  folderNameInput = document.getElementById('folder-name-input');
  folderSaveBtn = document.getElementById('folder-save-btn');
  folderCancelBtn = document.getElementById('folder-cancel-btn');

  // 2. Attach button listeners
  folderSaveBtn.addEventListener('click', saveNewFolder);
  folderCancelBtn.addEventListener('click', hideAddFolderModal);

  // 3. Click background overlay to close
  addFolderModal.addEventListener('click', (e) => {
    if (e.target === addFolderModal) {
      hideAddFolderModal();
    }
  });

  // 4. Listen for "Enter" key in input field
  folderNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveNewFolder();
    } else if (e.key === 'Escape') {
      hideAddFolderModal();
    }
  });
  
  // 5. Listen for "Escape" key globally when modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addFolderModal.style.display === 'flex') {
      hideAddFolderModal();
    }
  });
}

// ===============================================
// --- EDIT FOLDER MODAL FUNCTIONS ---
// ===============================================
function setupEditFolderModal() {
  editFolderModal = document.getElementById('edit-folder-modal');
  if (!editFolderModal) {
    return;
  }

  editFolderDialog = document.getElementById('edit-folder-dialog');
  editFolderNameInput = document.getElementById('edit-folder-name-input');
  editFolderSaveBtn = document.getElementById('edit-folder-save-btn');
  editFolderCancelBtn = document.getElementById('edit-folder-cancel-btn');
  editFolderCloseBtn = document.getElementById('edit-folder-close-btn');
  editFolderIconSpan = document.getElementById('edit-folder-icon');
  editFolderTextSpan = document.getElementById('edit-folder-text');

  editFolderSaveBtn.addEventListener('click', handleEditFolderSave);
  editFolderCancelBtn.addEventListener('click', hideEditFolderModal);
  editFolderCloseBtn.addEventListener('click', hideEditFolderModal);

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editFolderModal.style.display === 'flex') {
      hideEditFolderModal();
    }
  });
}

function showEditFolderModal(folderNode) {
  if (!editFolderModal || !folderNode) {
    return;
  }

  editFolderTargetId = folderNode.id;
  const folderTitle = folderNode.title || 'Folder';

  if (editFolderIconSpan) {
    editFolderIconSpan.innerHTML = `
      <svg class="bookmark-folder-icon" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
      </svg>
    `;
  }

  if (editFolderTextSpan) {
    editFolderTextSpan.textContent = `Edit "${folderTitle}"`;
  }

  if (editFolderNameInput) {
    editFolderNameInput.value = folderNode.title || '';
  }

  editFolderModal.style.display = 'flex';

  if (editFolderNameInput) {
    editFolderNameInput.focus();
    editFolderNameInput.select();
  }
}

function hideEditFolderModal() {
  if (!editFolderModal) {
    return;
  }

  editFolderModal.style.display = 'none';
  editFolderTargetId = null;
  if (editFolderNameInput) {
    editFolderNameInput.value = '';
  }
}

async function handleEditFolderSave() {
  if (!editFolderTargetId || !editFolderNameInput) {
    return;
  }

  const newName = editFolderNameInput.value.trim();
  if (!newName) {
    alert('Please provide a folder name.');
    return;
  }

  try {
    await browser.bookmarks.update(editFolderTargetId, { title: newName });

    const newTree = await browser.bookmarks.getTree();
    bookmarkTree = newTree;

    let folderToRender = null;
    if (currentGridFolderNode) {
      folderToRender = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
    }

    if (!folderToRender && activeHomebaseFolderId) {
      folderToRender = findBookmarkNodeById(bookmarkTree[0], activeHomebaseFolderId);
    }

    if (folderToRender) {
      renderBookmarkGrid(folderToRender);
    } else {
      loadBookmarks(editFolderTargetId);
    }

    hideEditFolderModal();
  } catch (err) {
    console.error('Error updating folder name:', err);
    alert('Error: Could not update the folder name.');
  }
}

// ===============================================
// --- MOVE BOOKMARK/FOLDER MODAL FUNCTIONS ---
// ===============================================
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

  if (!moveBookmarkModal) return;

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
    if (e.key === 'Escape' && moveBookmarkModal.style.display === 'flex') {
      hideMoveBookmarkModal();
    }
  });

  document.addEventListener('click', (e) => {
    if (!moveBookmarkModal || moveBookmarkModal.style.display !== 'flex') return;
    if (!moveFolderDropdown) return;
    if (moveFolderDropdown.contains(e.target)) return;
    closeMoveFolderDropdown();
  });
}

function hideMoveBookmarkModal() {
  if (moveBookmarkModal) {
    moveBookmarkModal.style.display = 'none';
  }
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
  if (!bookmarkTree || !bookmarkTree[0]) {
    alert('Bookmarks are still loading. Please try again.');
    return;
  }
  const node = findBookmarkNodeById(bookmarkTree[0], itemId);
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
  moveBookmarkModal.style.display = 'flex';
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
  if (!bookmarkTree || !bookmarkTree[0] || !bookmarkTree[0].children) {
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

  bookmarkTree[0].children.forEach(child => traverse(child, 0));
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
  if (!moveModalState.targetId) return;
  const destinationId = moveModalState.selectedFolderId;
  if (!destinationId) return;

  if (moveModalState.blockedIds.has(destinationId)) {
    alert('Cannot move a folder inside itself.');
    return;
  }

  try {
    await browser.bookmarks.move(moveModalState.targetId, {
      parentId: destinationId
    });
    hideMoveBookmarkModal();

    const refreshFolderId =
      (currentGridFolderNode && currentGridFolderNode.id) ||
      activeHomebaseFolderId ||
      rootDisplayFolderId;

    loadBookmarks(refreshFolderId);
  } catch (err) {
    console.error('Error moving bookmark:', err);
    alert('Error: Could not move this item.');
  }
}

// ===============================================
// --- APP LAUNCHER (Google Apps) ---
// ===============================================
function setupAppLauncher() {
  googleAppsPanel.classList.remove('hidden');

  googleAppsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = googleAppsPanel.classList.contains('open');

    if (!isOpen) {
      const panelWidth = googleAppsPanel.offsetWidth;
      const rect = googleAppsBtn.getBoundingClientRect();
      googleAppsPanel.style.top = `${rect.bottom + 10}px`;
      const buttonCenterX = rect.left + (rect.width / 2);
      let panelLeft = buttonCenterX - (panelWidth / 2);
      
      const padding = 10;
      if (panelLeft < padding) panelLeft = padding;
      if (panelLeft + panelWidth > window.innerWidth - padding) {
        panelLeft = window.innerWidth - panelWidth - padding;
      }

      googleAppsPanel.style.left = `${panelLeft}px`;
      googleAppsPanel.style.right = 'auto';
      googleAppsPanel.classList.add('open');
    } else {
      googleAppsPanel.classList.remove('open');
    }
  });

  window.addEventListener('click', () => {
    if (googleAppsPanel.classList.contains('open')) {
      googleAppsPanel.classList.remove('open');
    }
  });

  window.addEventListener('resize', () => {
    if (googleAppsPanel.classList.contains('open')) {
      googleAppsPanel.classList.remove('open');
    }
  });

  googleAppsPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}


// ===============================================
// --- BOOKMARKS ---
// ===============================================

// --- NEW: Grid Drag-and-Drop Handlers (Using Sortable.js) ---

/**
 * Handles moving a bookmark and refreshing the UI
 * This function is now the single source of truth for UI updates after a D&D.
 */
async function moveBookmark(id, destination) {
  try {
    await browser.bookmarks.move(id, destination);
    
    // Re-fetch the entire bookmark tree
    const newTree = await browser.bookmarks.getTree();
    bookmarkTree = newTree; // Update the global tree variable

    // Find the node for the currently displayed grid
    const activeGridNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
    
    if (activeGridNode) {
      // Re-render the *current* grid, passing the ID of the
      // item that was just moved so it doesn't animate.
      renderBookmarkGrid(activeGridNode, id); 
    } else {
      // Fallback if the active folder itself was moved/deleted.
      console.warn("Could not find active grid node after move. Reloading main bookmarks.");
      loadBookmarks(activeHomebaseFolderId);
    }
    
  } catch (err) {
    console.error("Error moving bookmark:", err);
    // On error, just re-render the old node to reset.
    if (currentGridFolderNode) {
      renderBookmarkGrid(currentGridFolderNode, id);
    }
  }
}

/**
 * NEW: Initializes Sortable.js on the bookmarks grid.
 * This is called by renderBookmarkGrid.
 */
function setupGridSortable(gridElement) {
  if (gridSortable) {
    gridSortable.destroy(); // Destroy previous instance
  }
  
  gridSortable = Sortable.create(gridElement, {
    animation: 300,
    group: 'bookmarks', // Group name
    draggable: '.bookmark-item:not(.back-button)', // prevent Back from moving
    
    // Add .grid-item-rename-input to the filter so inline renames stay clickable
    filter: '.grid-item-rename-input', 
    
    ghostClass: 'bookmark-placeholder', // Use our existing placeholder style
    chosenClass: 'sortable-chosen',     // Class for the item in its original spot
    dragClass: 'sortable-drag',         // Class for the item being dragged
    
    // The onStart javascript hack is no longer needed 
    // because the CSS Grid layout is stable.

    onEnd: handleGridDrop,            // Function to call on drop/re-order
    onMove: handleGridMove,           // Function to call when hovering
    preventOnFilter: true             // Prevent 'Back' button drag
  });
}

/**
 * NEW: Handles visual feedback when dragging *over* a folder.
 * This is a Sortable.js `onMove` callback.
 * --- MODIFIED TO PREVENT GRID SHIFTING ---
 */
function handleGridMove(evt) {
  const grid = evt.to;
  const targetItem = evt.related; // Item being hovered over
  const draggedItem = evt.item;   // Item being dragged

  // Clear drag-over from all but the current target
  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
    if (item !== targetItem) {
      item.classList.remove('drag-over');
    }
  });

  // Only care about folder targets (not the dragged item itself)
  if (targetItem && targetItem.dataset.isFolder === 'true' && targetItem !== draggedItem) {
    const now = Date.now();

    // If we just moved onto a *different* folder, reset the timer
    if (folderHoverTarget !== targetItem) {
      folderHoverTarget = targetItem;
      folderHoverStart = now;
    }

    const hoveredLongEnough = now - folderHoverStart >= FOLDER_HOVER_DELAY_MS;

    if (hoveredLongEnough) {
      // We've been hovering this folder for a bit:
      //  - highlight it
      //  - return false to "lock" the layout in place
      targetItem.classList.add('drag-over');
      return false; // prevent Sortable from reordering while over this folder
    } else {
      // Still in the "passing through" phase → allow normal reordering
      targetItem.classList.remove('drag-over');
      return true;
    }
  }

  // Not over a folder → reset hover state and allow normal sort
  folderHoverTarget = null;
  folderHoverStart = 0;
  return true;
}



/**
 * NEW: Unified handler for grid drop (re-ordering or moving into a folder).
 * This is a Sortable.js `onEnd` callback.
 */
async function handleGridDrop(evt) {
  const grid = evt.from; // Get the grid container
  
  // Clear all hover effects
  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
    item.classList.remove('drag-over');
  });

  const draggedItem = evt.item;
  const draggedItemId = draggedItem.dataset.bookmarkId;
  
  // Use the event's clientX/Y to find the *actual* drop target
  const dropTargetElement = document.elementFromPoint(
    evt.originalEvent.clientX,
    evt.originalEvent.clientY
  );

  // 1) Folder *inside* the grid
  const folderTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-item[data-is-folder="true"]')
    : null;

  // 2) NEW: Folder *tab* at the top
  const tabTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-folder-tab')
    : null;

  // 3) NEW: Back button for moving up a level
  const backButtonTarget = dropTargetElement
    ? dropTargetElement.closest('.back-button')
    : null;

  // --- Case 1: Dropped ONTO a folder INSIDE the grid ---
  if (folderTarget && folderTarget.dataset.bookmarkId !== draggedItemId) {
    const targetFolderId = folderTarget.dataset.bookmarkId;

    // Undo Sortable's DOM change; moveBookmark will re-render
    draggedItem.remove();

    // Move the bookmark *into* that folder
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }
  // --- Case 2: NEW – Dropped ONTO a folder TAB ---
  else if (tabTarget) {
    const targetFolderId = tabTarget.dataset.folderId;

    // Again, undo Sortable's DOM change
    draggedItem.remove();

    // Move the bookmark into the folder represented by that tab
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }
  // --- Case 3: NEW – Dropped ONTO the Back button ---
  else if (backButtonTarget && backButtonTarget.dataset.backTargetId) {
    const targetFolderId = backButtonTarget.dataset.backTargetId;

    draggedItem.remove();
    await moveBookmark(draggedItemId, { parentId: targetFolderId });
  }

  // --- Case 4: Re-ordered within the same grid ---
  else if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
    const parentId = currentGridFolderNode.id;

    // Start from Sortable's new index
    let targetIndex = evt.newIndex;

    // If this grid has a Back button as the first child,
    // subtract 1 so we get the correct bookmark index.
    const hasBackButton = !![...grid.children].find(child =>
      child.classList.contains('back-button')
    );
    if (hasBackButton) {
      targetIndex--; // Account for the 'Back' button
    }

    const draggedNode = findBookmarkNodeById(bookmarkTree[0], draggedItemId);
    if (!draggedNode) return;

    // If the index didn't actually change in the bookmark tree, do nothing
    if (draggedNode.parentId === parentId && draggedNode.index === targetIndex) {
      return;
    }

    // Move the bookmark *within* the folder to the final index
    await moveBookmark(draggedItemId, { parentId: parentId, index: targetIndex });
  }
}


// --- NEW: Tab Drag-and-Drop Handlers (Using Sortable.js) ---

/**
 * NEW: Initializes Sortable.js on the folder tabs.
 * This is called by createFolderTabs.
 */
function setupTabsSortable(tabsContainer) {
  if (tabsSortable) {
    tabsSortable.destroy();
  }
  tabsSortable = Sortable.create(tabsContainer, {
    animation: 300,
    draggable: '.bookmark-folder-tab', // Only tabs are draggable
    filter: '.bookmark-folder-add-btn', // Ignore the '+' button
    ghostClass: 'sortable-ghost-tab', // A new class for tab ghost
    chosenClass: 'sortable-chosen-tab',
    dragClass: 'sortable-drag-tab',
    onEnd: handleTabDrop,
    preventOnFilter: true
  });
}

/**
 * NEW: Handler for folder tab drop (re-ordering).
 * This is a Sortable.js `onEnd` callback.
 */
async function handleTabDrop(evt) {
  if (evt.oldIndex === evt.newIndex) return; // No change

  const previouslyActiveFolderId = activeHomebaseFolderId;

  const draggedFolderId = evt.item.dataset.folderId;
  const parentNode = findBookmarkNodeById(bookmarkTree[0], rootDisplayFolderId);

  if (!draggedFolderId || !parentNode || !parentNode.children) return;

  // Only folder nodes inside rootDisplayFolderId
  const folderNodes = parentNode.children.filter(node => !node.url && node.children);

  const draggedNode = folderNodes.find(node => node.id === draggedFolderId);
  if (!draggedNode) return;

  const originalBookmarkIndex = draggedNode.index;

  let targetBookmarkIndex;

  // If we dragged to the *last* visible tab from the left,
  // treat this as "drop at the very end".
  const movingDownIntoLast =
    evt.newIndex === folderNodes.length - 1 && evt.oldIndex < evt.newIndex;

  if (movingDownIntoLast) {
    // Put it after all existing children
    targetBookmarkIndex = parentNode.children.length;
  } else {
    // Normal case: dropped before some existing tab
    const targetNode = folderNodes[evt.newIndex];
    targetBookmarkIndex = targetNode.index;

    // Adjust if moving *down* the list
    if (originalBookmarkIndex < targetBookmarkIndex) {
      targetBookmarkIndex--;
    }
  }

  // If nothing effectively changes, bail out
  if (targetBookmarkIndex === originalBookmarkIndex) {
    return;
  }

  try {
    await browser.bookmarks.move(draggedFolderId, {
      parentId: rootDisplayFolderId,
      index: targetBookmarkIndex
    });
    // Reload bookmarks, keeping the previously selected tab active
    const folderToKeepOpen = previouslyActiveFolderId || draggedFolderId;
    loadBookmarks(folderToKeepOpen);
  } catch (err) {
    console.error("Error moving bookmark folder:", err);
    loadBookmarks(); // Fallback
  }
}



function flattenBookmarks(nodes) {
  let flatList = [];
  for (const node of nodes) {
    if (node.url) {
      flatList.push({ title: node.title, url: node.url });
    }
    if (node.children) {
      flatList = flatList.concat(flattenBookmarks(node.children));
    }
  }
  return flatList;
}

/**
 * === MODIFIED ===
 * Renders a single bookmark item (MODIFIED for Sortable.js)
 * All manual D&D listeners have been removed.
 */
function renderBookmark(bookmarkNode) {
  // --- CHANGED from <a> to <div> ---
  const item = document.createElement('div');
  item.className = 'bookmark-item';

  // --- D&D attributes ---
  item.dataset.bookmarkId = bookmarkNode.id;
  item.dataset.isFolder = 'false';

  // --- NEW: Manual Click Handler ---
  item.addEventListener('click', (e) => {
    // Don't navigate if the click was on the rename input
    if (e.target.classList.contains('grid-item-rename-input')) {
      return;
    }
    // Simple check to prevent navigation after a drag
    if (item.classList.contains('sortable-chosen')) {
      return;
    }
    window.location.href = bookmarkNode.url;
  });

  // NEW: right-click context menu for ICONS
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    currentContextItemId = bookmarkNode.id;
    currentContextIsFolder = false;

    // Position menu at cursor
    iconContextMenu.style.top = `${e.clientY}px`;
    iconContextMenu.style.left = `${e.clientX}px`;

    // Hide other menus, show this one
    folderContextMenu.classList.add('hidden');
    gridFolderMenu.classList.add('hidden');
    iconContextMenu.classList.remove('hidden');
  });

  const title = bookmarkNode.title || ' ';
  const firstLetter = title.charAt(0).toUpperCase();

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bookmark-icon-wrapper';

  const fallbackIcon = document.createElement('div');
  fallbackIcon.className = 'bookmark-fallback-icon';
  fallbackIcon.textContent = firstLetter;
  iconWrapper.appendChild(fallbackIcon);

  const imgIcon = document.createElement('img');

  imgIcon.addEventListener('load', () => {
    if (imgIcon.naturalWidth > 16) {
      iconWrapper.innerHTML = '';
      iconWrapper.appendChild(imgIcon);
    }
  });

  imgIcon.addEventListener('error', () => {
    // Do nothing, fallback is already visible
  });

  imgIcon.src = `https://s2.googleusercontent.com/s2/favicons?domain=${bookmarkNode.url}&sz=64`;

  const titleSpan = document.createElement('span');
  titleSpan.textContent = bookmarkNode.title;

  item.appendChild(iconWrapper);
  item.appendChild(titleSpan);

  return item;
}

async function deleteBookmarkOrFolder(id, isFolder) {
  if (!id) return;

  // find node so we get title/url
  let node = null;
  if (bookmarkTree && bookmarkTree[0]) {
    node = findBookmarkNodeById(bookmarkTree[0], id);
  }

  const title =
    node && node.title
      ? node.title
      : isFolder
      ? 'this folder'
      : 'this bookmark';

  let faviconUrl = null;
  if (!isFolder && node && node.url) {
    try {
      const urlObj = new URL(node.url);
      const domain = urlObj.hostname || node.url;
      faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
      // ignore – will fall back to letter icon
    }
  }

  const confirmed = await showDeleteConfirm(null, {
    title,
    faviconUrl,
    isFolder,
  });

  if (!confirmed) return;

  try {
    // actually delete
    if (isFolder) {
      await browser.bookmarks.removeTree(id);
    } else {
      await browser.bookmarks.remove(id);
    }

    // refresh tree + grid
    const newTree = await browser.bookmarks.getTree();
    bookmarkTree = newTree;

    if (currentGridFolderNode) {
      const activeGridNode = findBookmarkNodeById(
        bookmarkTree[0],
        currentGridFolderNode.id
      );

      if (activeGridNode) {
        renderBookmarkGrid(activeGridNode);
      } else {
        loadBookmarks(activeHomebaseFolderId);
      }
    } else {
      loadBookmarks(activeHomebaseFolderId);
    }
  } catch (err) {
    console.error('Error deleting bookmark/folder:', err);
    alert('Error: could not delete this item.');
  }
}


/**
 * NEW: Auto-resizes a textarea to fit its content.
 * (Around line 1178)
 */
function autoResizeTextarea(textarea) {
  // Reset height to 'auto' to shrink if text is deleted
  textarea.style.height = 'auto'; 

  // === NEW: Force a layout reflow ===
  // Reading a property like offsetHeight immediately after setting
  // a style forces the browser to recalculate the layout.
  // This ensures the scrollHeight we read next is 100% accurate.
  const _ = textarea.offsetHeight; 

  // === MODIFIED ===
  // 2px for border (1px top + 1px bottom)
  const verticalBorders = 2; 
  
  // Now scrollHeight is accurate, so we set the final height
  textarea.style.height = (textarea.scrollHeight + verticalBorders) + 'px';
}

/**
 * === MODIFIED ===
 * Renders a single folder item (MODIFIED for Sortable.js)
 * All manual D&D listeners have been removed.
 */
function renderBookmarkFolder(folderNode) {
  // --- CHANGED from <a> to <div> ---
  const item = document.createElement('div');
  item.className = 'bookmark-item';

  // --- D&D attributes ---
  item.dataset.bookmarkId = folderNode.id;
  item.dataset.isFolder = 'true';

  item.innerHTML = `
    <div class="bookmark-icon-wrapper">
      <svg
        class="bookmark-folder-icon"
        width="48"
        height="40"
        viewBox="0 0 64 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 10
             C8 7.8 9.8 6 12 6
             H26
             L30 10
             H52
             C54.2 10 56 11.8 56 14
             V18
             H8
             Z"
          fill="#EDEDED"
        />

        <rect
          x="8"
          y="14"
          width="48"
          height="30"
          rx="6"
          ry="6"
          fill="#FFFFFF"
        />
      </svg>
    </div>
    <span>${folderNode.title}</span>
  `;


  // Left-click still opens the folder
  item.addEventListener('click', (e) => {
    e.preventDefault();
    // Don't navigate if the click was on the rename input
    if (e.target.classList.contains('grid-item-rename-input')) {
      return;
    }
    // Simple check to prevent navigation after a drag
    if (item.classList.contains('sortable-chosen')) {
      return;
    }
    renderBookmarkGrid(folderNode);
  });

  // NEW: right-click context menu for FOLDERS in the grid
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    currentContextItemId = folderNode.id;
    currentContextIsFolder = true;

    gridFolderMenu.style.top = `${e.clientY}px`;
    gridFolderMenu.style.left = `${e.clientX}px`;

    // Hide other menus, show this one
    folderContextMenu.classList.add('hidden');
    iconContextMenu.classList.add('hidden');
    gridFolderMenu.classList.remove('hidden');
  });

  return item;
}


/**
 * Recursively finds a bookmark node (folder or item) by its ID.
 */
function findBookmarkNodeById(rootNode, id) {
  if (!rootNode) return null; // Guard against empty root
  if (rootNode.id === id) {
    return rootNode;
  }
  if (rootNode.children) {
    for (const child of rootNode.children) {
      const found = findBookmarkNodeById(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Creates the "Back" button item for the grid.
 */
function createBackButton(parentId) {
  const item = document.createElement('a');
  item.href = '#';
  item.className = 'bookmark-item';
  item.dataset.backTargetId = parentId;
  item.innerHTML = `
    <div class="bookmark-icon-wrapper back-icon-wrapper">
      <img src="icons/back.svg" alt="Go back" class="back-icon" />
    </div>
    <span class="back-button-label">Back</span>
  `;
  
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
    if (parentNode) {
      renderBookmarkGrid(parentNode);
    }
  });
  return item;
}


/**
 * Clears and re-renders the bookmarks grid (MODIFIED for Sortable.js)
 * @param {object} folderNode - The bookmark folder node to render.
 * @param {string | null} droppedItemId - The ID of an item that was just moved,
 * which should NOT be animated.
 */
function renderBookmarkGrid(folderNode, droppedItemId = null) {
  const grid = document.getElementById('bookmarks-grid');
  grid.innerHTML = '';
  
  // --- Store the current folder node ---
  currentGridFolderNode = folderNode;
  
  // 1. Add a "Back" button
  if (folderNode.id !== rootDisplayFolderId && folderNode.parentId !== rootDisplayFolderId && folderNode.parentId !== '0' && folderNode.parentId !== 'root________') {
    const parentNode = findBookmarkNodeById(bookmarkTree[0], folderNode.parentId);
    if (parentNode && parentNode.id !== rootDisplayFolderId) {
       // --- NEW: Add 'back-button' class for Sortable.js filter ---
       const backButton = createBackButton(parentNode.id);
       backButton.classList.add('back-button');
       grid.appendChild(backButton);
    }
  }

  // 2. Render all children (folders and bookmarks)
  if (folderNode.children) {
    folderNode.children.forEach(node => {
      if (node.url) {
        grid.appendChild(renderBookmark(node));
      } else if (node.children) {
        grid.appendChild(renderBookmarkFolder(node));
      }
    });
  }

  // 3. --- NEW: Initialize Sortable.js on the newly rendered grid ---
  setupGridSortable(grid);

  // 4. Apply staggered "drop-in" animation (unmodified)
  const items = grid.querySelectorAll('.bookmark-item');
  
  if (droppedItemId) {
    // A drop just happened. Make all items appear instantly.
    items.forEach(item => {
      item.style.opacity = 1;
    });
  } else {
    // This is a folder change or initial load.
    // Do the cool "drop-in" animation.
    items.forEach((item, index) => {
      // (But still skip the 'Back' button)
      if (item.classList.contains('back-button')) {
        item.style.opacity = 1;
        return;
      }

      const delay = Math.min(index * 25, 500); // 25ms per item, max 500ms
      item.style.animationDelay = `${delay}ms`;
      item.classList.add('newly-rendered');
      
      item.addEventListener('animationend', () => {
        item.classList.remove('newly-rendered');
        item.style.animationDelay = '';
      }, { once: true });
    });
  }
}


/**
 * Creates a new bookmark folder inside the 'homebase' folder.
 */
async function createNewBookmarkFolder(name) {
  if (!rootDisplayFolderId) {
    console.error("Cannot create folder: 'homebase' folder ID is not set.");
    return;
  }
  try {
    const newFolderNode = await browser.bookmarks.create({
      parentId: rootDisplayFolderId,
      title: name
    });
    
    const tree = await browser.bookmarks.getTree();
    bookmarkTree = tree;
    
    processBookmarks(tree, newFolderNode.id);
    
  } catch (err) {
    console.error("Error creating bookmark folder:", err);
  }
}

/**
 * Deletes a bookmark folder and reloads the tabs.
 */
async function deleteBookmarkFolder(folderId) {
  try {
    await browser.bookmarks.removeTree(folderId);
    loadBookmarks(); // Reload bookmarks, will default to first tab
  } catch (err) {
    console.error("Error deleting folder:", err);
  }
}

/**
 * Replaces a tab with an input field to edit the folder name.
 */
function showEditInput(tabButton, folderNode) {
  tabButton.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'bookmark-folder-input';
  input.value = folderNode.title;

  tabButton.parentNode.insertBefore(input, tabButton.nextSibling);

  input.focus();
  input.select();

  const cleanup = () => {
    input.remove();
    tabButton.style.display = 'block';
  };

  const saveAction = async () => {
    const newName = input.value.trim();
    if (newName && newName !== folderNode.title) {
      try {
        await browser.bookmarks.update(folderNode.id, { title: newName });
        loadBookmarks(folderNode.id);
      } catch (err) {
        console.error("Error updating folder:", err);
        cleanup();
      }
    } else {
      cleanup();
    }
  };

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

/**
 * === MODIFIED ===
 * Replaces a grid item's span with an input field to edit its name.
 */
function showGridItemRenameInput(gridItem, bookmarkNode) {
  const titleSpan = gridItem.querySelector('span');
  if (!titleSpan) return;
  
  titleSpan.style.display = 'none';

  // === FIX: Add class to allow parent to grow ===
  gridItem.classList.add('is-renaming');

  // --- MODIFIED: Use a <textarea> for multi-line support ---
  const input = document.createElement('textarea');
  input.className = 'grid-item-rename-input';
  input.value = bookmarkNode.title;

  input.rows = 1; // Set the default rows to 1
  
  // Stop the click from bubbling to the parent div's click listener
  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Stop mousedown from bubbling to Sortable.js
  input.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  // --- NEW: Add auto-resize listener ---
  input.addEventListener('input', () => {
    autoResizeTextarea(input);
  });

  gridItem.appendChild(input);

  // --- NEW: Call resize function immediately after append ---
  autoResizeTextarea(input); // Also fixed a typo here from your original file
  input.focus();
  input.select();

  const cleanup = () => {
    // === FIX: Remove class to restore parent's fixed height ===
    gridItem.classList.remove('is-renaming');

    input.remove();
    titleSpan.style.display = '-webkit-box'; // Restore original display
  };

  const saveAction = async () => {
    const newName = input.value.trim();
    if (newName && newName !== bookmarkNode.title) {
      try {
        await browser.bookmarks.update(bookmarkNode.id, { title: newName });
        
        // Refresh the tree and re-render the current grid
        const newTree = await browser.bookmarks.getTree();
        bookmarkTree = newTree; 
        
        const activeGridNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
        
        if (activeGridNode) {
          renderBookmarkGrid(activeGridNode); // This will remove the input
        } else {
          loadBookmarks(activeHomebaseFolderId); // Fallback
        }
        
      } catch (err) {
        console.error("Error updating bookmark:", err);
        cleanup(); // On error, just revert
      }
    } else {
      cleanup(); // No change, revert
    }
  };

  input.addEventListener('keydown', async (e) => {
    // --- MODIFIED: Allow Shift+Enter for newline, just Enter to save ---
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Stop newline
      saveAction();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  });

  input.addEventListener('blur', saveAction);
}


/**
 * Creates the folder tab buttons (MODIFIED for Sortable.js)
 * All manual D&D listeners have been removed.
 */
function createFolderTabs(homebaseFolder, activeFolderId = null) {
  bookmarkFolderTabsContainer.innerHTML = '';
  if (bookmarkTabsTrack) {
    bookmarkTabsTrack.scrollLeft = 0;
  }
  
  const folderChildren = homebaseFolder.children.filter(node => !node.url && node.children);
  
  let folderToSelect = null;
  if (activeFolderId) {
    folderToSelect = folderChildren.find(f => f.id === activeFolderId);
  }
  if (!folderToSelect && folderChildren.length > 0) {
    folderToSelect = folderChildren[0];
  }
  
  folderChildren.forEach((folderNode, index) => {
    const tabButton = document.createElement('button');
    tabButton.className = 'bookmark-folder-tab';
    tabButton.textContent = folderNode.title;
    
    tabButton.dataset.folderId = folderNode.id;
    tabButton.dataset.index = index;
    
    if (folderToSelect && folderNode.id === folderToSelect.id) {
      tabButton.classList.add('active');
    }

    tabButton.addEventListener('click', () => {
      // Update active styles
      bookmarkFolderTabsContainer.querySelectorAll('.bookmark-folder-tab').forEach(btn => {
        btn.classList.remove('active');
      });
      tabButton.classList.add('active');

      // Always use the *latest* node from the current bookmarkTree
      const freshNode = findBookmarkNodeById(bookmarkTree[0], folderNode.id) || folderNode;

      renderBookmarkGrid(freshNode);
      activeHomebaseFolderId = folderNode.id;
    });

    tabButton.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      folderContextMenu.style.top = `${e.clientY}px`;
      folderContextMenu.style.left = `${e.clientX}px`;
      folderContextMenu.classList.remove('hidden');

      menuEditBtn.onclick = () => {
        folderContextMenu.classList.add('hidden');
        showEditInput(tabButton, folderNode);
      };

      menuDeleteBtn.onclick = async () => {
        folderContextMenu.classList.add('hidden');

        const confirmed = await showDeleteConfirm(
          `Delete "${folderNode.title}" and all its contents?`,
          { isFolder: true }
        );
        if (confirmed) {
          deleteBookmarkFolder(folderNode.id);
        }
      };
    });
    
    // All manual 'draggable' and 'dragstart'/'dragend' listeners removed.
    
    bookmarkFolderTabsContainer.appendChild(tabButton);
  });

  const addButton = document.createElement('button');
  addButton.className = 'bookmark-folder-add-btn';
  addButton.textContent = '+';
  addButton.title = 'Create New Folder';
  
  addButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    addButton.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'new-folder-input';
    input.className = 'bookmark-folder-input';
    input.value = 'New Folder';
    input.placeholder = 'Folder Name';

    const saveButton = document.createElement('button');
    saveButton.className = 'bookmark-folder-save-btn';
    saveButton.textContent = '✓';
    saveButton.title = 'Save Folder';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'bookmark-folder-cancel-btn';
    cancelButton.textContent = '✖';
    cancelButton.title = 'Cancel';

    function cleanup() {
      input.remove();
      saveButton.remove();
      cancelButton.remove();
      addButton.style.display = 'flex';
    }
    
    const saveAction = () => {
      const folderName = input.value.trim();
      if (folderName) {
        createNewBookmarkFolder(folderName);
      } else {
        cleanup();
      }
    };

    saveButton.addEventListener('mousedown', (e) => e.preventDefault());
    cancelButton.addEventListener('mousedown', (e) => e.preventDefault());
    saveButton.addEventListener('click', saveAction);
    cancelButton.addEventListener('click', cleanup);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveButton.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelButton.click();
      }
    });

    input.addEventListener('blur', saveAction);
    bookmarkFolderTabsContainer.appendChild(input);
    bookmarkFolderTabsContainer.appendChild(saveButton);
    bookmarkFolderTabsContainer.appendChild(cancelButton);
    input.focus();
    input.select();
  });
  
  // 'dragover' listener on add-button removed.
  
  bookmarkFolderTabsContainer.appendChild(addButton);
  requestAnimationFrame(updateBookmarkTabOverflow);

  // --- NEW: Initialize Sortable.js on the tabs ---
  setupTabsSortable(bookmarkFolderTabsContainer);

  if (folderToSelect) {
    renderBookmarkGrid(folderToSelect);
    activeHomebaseFolderId = folderToSelect.id;
  } else if (folderChildren.length === 0) {
    console.warn(`No folders found inside "${homebaseFolder.title}". Displaying its contents.`);
    renderBookmarkGrid(homebaseFolder);
    activeHomebaseFolderId = homebaseFolder.id;
  }
}

function processBookmarks(nodes, activeFolderId = null) {
  allBookmarks = flattenBookmarks(nodes);
  
  if (!nodes || !nodes[0] || !nodes[0].children) {
    console.warn('Bookmark tree is empty or malformed.');
    return;
  }

  const rootChildren = nodes[0].children;
  let targetFolder = null;

  let otherBookmarksFolder = rootChildren.find(folder => folder.id === 'unfiled_____');
  if (!otherBookmarksFolder) {
    otherBookmarksFolder = rootChildren.find(
      folder => folder.title.toLowerCase() === 'other bookmarks' && folder.children
    );
  }

  if (otherBookmarksFolder && otherBookmarksFolder.children) {
    targetFolder = otherBookmarksFolder.children.find(
      folder => folder.title.toLowerCase() === 'homebase' && folder.children
    );
  }

  if (targetFolder) {
    rootDisplayFolderId = targetFolder.id;
    createFolderTabs(targetFolder, activeFolderId);
  } else {
    console.warn('Could not find "Other Bookmarks -> homebase" path. Falling back to "Other Bookmarks".');
    if (otherBookmarksFolder) {
      rootDisplayFolderId = otherBookmarksFolder.id;
      createFolderTabs(otherBookmarksFolder, activeFolderId);
    } else {
      console.warn('Could not even find "Other Bookmarks". Falling back to root.');
      rootDisplayFolderId = nodes[0].id;
      createFolderTabs(nodes[0], activeFolderId);
    }
  }
}

/**
 * Now accepts an optional ID to keep a folder active after reload.
 */
function loadBookmarks(activeFolderId = null) {
  if (browser.bookmarks) {
    browser.bookmarks.getTree(tree => {
      bookmarkTree = tree;
      processBookmarks(tree, activeFolderId);
    });
  } else {
    console.warn('Bookmarks API not available.');
    document.getElementById('bookmarks-grid').innerHTML = 'Bookmarks are not available.';
  }
}


// ===============================================
// --- MODIFIED: QUICK ACTIONS BAR SETUP ---
// ===============================================
function setupQuickActions() {
  
  quickAddBookmarkBtn.addEventListener('click', showAddBookmarkModal);
  
  quickAddFolderBtn.addEventListener('click', showAddFolderModal);

  quickOpenBookmarksBtn.addEventListener('click', () => {
    browser.tabs.update({ url: 'about:bookmarks' });
  });
}


// ===============================================
// --- QUOTE WIDGET & SETTINGS ---
// ===============================================
const quoteWidget = document.querySelector('.widget-quote');
const quoteSettingsBtn = document.getElementById('quote-settings-btn');
const quoteSettingsPanel = document.getElementById('quote-settings-panel');
const closeQuoteSettingsBtn = document.getElementById('close-quote-settings-btn');
const quoteCategoriesList = document.getElementById('quote-categories-list');
const saveQuoteSettingsBtn = document.getElementById('save-quote-settings-btn');
const quoteText = document.getElementById('quote-text');
const quoteAuthor = document.getElementById('quote-author');
const DEFAULT_QUOTE_TAG = 'inspirational';

async function loadCachedQuote() {
  try {
    const data = await browser.storage.local.get(['cachedQuote', 'cachedAuthor']);
    if (data.cachedQuote) {
      quoteText.textContent = `\"${data.cachedQuote}\"`;
      quoteAuthor.textContent = data.cachedAuthor ? `- ${data.cachedAuthor}` : '';
    }
  } catch (err) {
    console.warn('Could not load cached quote:', err);
  }
}

async function fetchQuote() {
  try {
    const data = await browser.storage.local.get('quoteTags');
    let tagsToFetch = data.quoteTags;
    if (!tagsToFetch || tagsToFetch.length === 0) tagsToFetch = [DEFAULT_QUOTE_TAG];
    const tagsQuery = tagsToFetch.join('|');
    const res = await fetch(`https://api.quotable.io/quotes/random?limit=1&tags=${encodeURIComponent(tagsQuery)}`, {
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    const q = Array.isArray(arr) ? arr[0] : arr;
    
    if (!q || !q.content) {
      if (tagsQuery !== DEFAULT_QUOTE_TAG) {
        console.warn(`No quotes found for tags: ${tagsQuery}. Falling back to default.`);
        await browser.storage.local.remove('quoteTags');
        fetchQuote();
        return;
      } else {
        throw new Error('Malformed response or no default quote found');
      }
    }
    quoteText.textContent = `\"${q.content}\"`;
    quoteAuthor.textContent = q.author ? `- ${q.author}` : '';
    browser.storage.local.set({
      cachedQuote: q.content,
      cachedAuthor: q.author || ''
    });
  } catch (err) {
    console.error('Quote Error:', err);
    if (!quoteText.textContent.includes('"')) {
      quoteText.textContent = '"The best way to predict the future is to create it."';
      quoteAuthor.textContent = '- Peter Drucker';
    }
  }
}

async function populateQuoteCategories() {
  quoteCategoriesList.innerHTML = '';
  try {
    const res = await fetch('https://api.quotable.io/tags');
    if (!res.ok) throw new Error('Could not fetch tags');
    const allTags = await res.json();
    const data = await browser.storage.local.get('quoteTags');
    const savedTags = new Set(data.quoteTags || []);
    allTags.sort((a, b) => a.name.localeCompare(b.name));
    allTags.forEach(tag => {
      const pill = document.createElement('button');
      pill.className = 'quote-category-pill';
      pill.textContent = tag.name;
      pill.dataset.value = tag.name;
      if (savedTags.has(tag.name)) {
        pill.classList.add('selected');
      }
      pill.addEventListener('click', () => {
        pill.classList.toggle('selected');
      });
      quoteCategoriesList.appendChild(pill);
    });
  } catch (error) {
    console.error('Failed to populate quote categories:', error);
    quoteCategoriesList.innerHTML = 'Error loading categories.';
  }
}

function setupQuoteWidget() {
  quoteSettingsBtn.addEventListener('click', () => {
    quoteSettingsPanel.classList.remove('hidden');
    quoteWidget.classList.add('hidden');
    populateQuoteCategories();
  });
  closeQuoteSettingsBtn.addEventListener('click', () => {
    quoteSettingsPanel.classList.add('hidden');
    quoteWidget.classList.remove('hidden');
  });
  saveQuoteSettingsBtn.addEventListener('click', async () => {
    const selectedPills = quoteCategoriesList.querySelectorAll('.quote-category-pill.selected');
    const selectedTags = Array.from(selectedPills).map(pill => pill.dataset.value);
    await browser.storage.local.set({ quoteTags: selectedTags });
    quoteSettingsPanel.classList.add('hidden');
    quoteWidget.classList.remove('hidden');
    fetchQuote();
  });
}


// ===============================================
// --- TIME AND DATE ---
// ===============================================
function updateTime() {
  const now = new Date();
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);
}


// ===============================================
// --- SEARCH BAR ---
// ===============================================
const searchEngines = [
  { name: 'Google', url: 'https://www.google.com/search?q=', suggestionUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', suggestionUrl: 'https://duckduckgo.com/ac/?type=json&q=' },
  { name: 'Bing', url: 'https://www.bing.com/search?q=', suggestionUrl: 'https://api.bing.com/osjson.aspx?query=' },
  { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=', suggestionUrl: 'https://ff.search.yahoo.com/gossip?output=json&command=' },
  { name: 'Yandex', url: 'https://yandex.com/search/?text=', suggestionUrl: 'https://suggest.yandex.com/suggest-ff.cgi?part=' }
];
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');
let currentSearchEngine = searchEngines[0];

function populateSearchOptions() {
  searchEngines.forEach((engine, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = engine.name;
    searchSelect.appendChild(option);
  });
}
function updateSearchUI(index) {
  currentSearchEngine = searchEngines[index];
  searchInput.placeholder = `Search with ${currentSearchEngine.name}`;
  searchSelect.selectedIndex = index;
}
async function setupSearch() {
  populateSearchOptions();
  const data = await browser.storage.local.get(['searchIndex']);
  let savedIndex = data.searchIndex || 0;
  if (savedIndex >= searchEngines.length) savedIndex = 0;
  updateSearchUI(savedIndex);

  searchForm.addEventListener('submit', handleSearch);
  searchSelect.addEventListener('change', handleSearchChange);

  searchInput.addEventListener('input', handleSearchInput);
  
  searchInput.addEventListener('click', e => {
    e.stopPropagation();
  });
  
  searchResultsPanel.addEventListener('click', e => e.stopPropagation());
  
  window.addEventListener('click', () => {
    searchResultsPanel.classList.add('hidden');
    searchWidget.classList.remove('results-open');
    searchAreaWrapper.classList.remove('search-focused'); // Unfocus
  });
}

async function handleSearchChange() {
  const newIndex = searchSelect.selectedIndex;
  await browser.storage.local.set({ searchIndex: newIndex });
  updateSearchUI(newIndex);
  if (searchInput.value.trim().length > 0) {
    handleSearchInput();
  }
}

async function handleSearch(event) {
  event.preventDefault();
  const query = searchInput.value;
  if (!query) return;
  const searchUrl = `${currentSearchEngine.url}${encodeURIComponent(query)}`;
  window.location.href = searchUrl;
}

// Function to fetch suggestions
async function fetchSearchSuggestions(query, engine) {
  if (suggestionAbortController) {
    suggestionAbortController.abort();
  }
  suggestionAbortController = new AbortController();
  const signal = suggestionAbortController.signal;

  try {
    const res = await fetch(engine.suggestionUrl + encodeURIComponent(query), { signal });
    if (!res.ok) return [];
    const data = await res.json();
    
    if (engine.name === 'Google' || engine.name === 'Bing' || engine.name === 'Yandex') {
      return data[1] || [];
    }
    if (engine.name === 'DuckDuckGo') {
      return data.map(item => item.phrase) || [];
    }
    if (engine.name === 'Yahoo') {
      return data?.gossip?.results?.[0]?.nodes?.map(item => item.key) || [];
    }
    return [];
  } catch (err) {
    if (err.name === 'AbortError') {
      return null;
    }
    console.error('Suggestion fetch error:', err);
    return [];
  }
}

// Helper function to show/hide the main panel
function updatePanelVisibility() {
  const hasBookmarks = bookmarkResultsContainer.innerHTML.trim().length > 0;
  const hasSuggestions = suggestionResultsContainer.innerHTML.trim().length > 0;

  if (hasBookmarks || hasSuggestions) {
    searchResultsPanel.classList.remove('hidden');
    searchWidget.classList.add('results-open');
  } else {
    searchResultsPanel.classList.add('hidden');
    searchWidget.classList.remove('results-open');
  }
}

// Merged logic into one async function
async function handleSearchInput() {
  const query = searchInput.value;
  const queryLower = query.toLowerCase().trim();

  // 1. Handle empty query
  if (queryLower.length === 0) {
    searchAreaWrapper.classList.remove('search-focused');
    bookmarkResultsContainer.innerHTML = '';
    suggestionResultsContainer.innerHTML = '';
    updatePanelVisibility();
    return;
  }
  
  // 2. Expand bar
  searchAreaWrapper.classList.add('search-focused');

  // 3. Filter Bookmarks (Synchronous) - Build HTML string
  let bookmarkHtml = '';
  const bookmarkResults = allBookmarks.filter(b =>
    b.title.toLowerCase().includes(queryLower) ||
    b.url.toLowerCase().includes(queryLower)
  ).slice(0, 5);

  if (bookmarkResults.length > 0) {
    bookmarkHtml += '<div class="result-header">Bookmarks</div>';
    bookmarkResults.forEach(bookmark => {
      const domain = new URL(bookmark.url).hostname;
      bookmarkHtml += `
        <a href="${bookmark.url}" class="result-item">
          <img src="https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64" alt="">
          <div class="result-item-info">
            <strong>${bookmark.title || 'No Title'}</strong>
          </div>
        </a>
      `;
    });
  }

  // 4. Fetch Suggestions (Asynchronous) - Build HTML string
  let suggestionHtml = '';
  const suggestionResults = await fetchSearchSuggestions(query.trim(), currentSearchEngine);
  
  if (suggestionResults === null) {
    return; // Aborted, do nothing
  }
  
  if (suggestionResults && suggestionResults.length > 0) {
    suggestionHtml += `<div class="result-header">${currentSearchEngine.name} Search</div>`;
    
    // Add "Search for..."
    suggestionHtml += `
      <a href="${currentSearchEngine.url}${encodeURIComponent(query)}" class="result-item result-item-suggestion">
        <svg class="suggestion-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
        <div class="result-item-info">
          <strong>${query}</strong>
        </div>
      </a>
    `;
    
    // Add fetched suggestions (UP TO 10)
    suggestionResults.slice(0, 10).forEach(suggestion => {
      if (suggestion.toLowerCase() === query.toLowerCase()) return;
      suggestionHtml += `
        <a href="${currentSearchEngine.url}${encodeURIComponent(suggestion)}" class="result-item result-item-suggestion">
          <svg class="suggestion-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
          <div class="result-item-info">
            <strong>${suggestion}</strong>
          </div>
        </a>
      `;
    });
  }

  // 5. RENDER BOTH AT THE SAME TIME
  bookmarkResultsContainer.innerHTML = bookmarkHtml;
  suggestionResultsContainer.innerHTML = suggestionHtml;

  // 6. Update visibility
  updatePanelVisibility();
}


// ===============================================
// --- WEATHER WIDGET & SETTINGS ---
// ===============================================
const weatherWidget = document.querySelector('.widget-weather');
const settingsBtn = document.getElementById('settings-btn');
const setLocationBtn = document.getElementById('set-location-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const tempUnitToggle = document.getElementById('temp-unit-toggle');
const locationSearchInput = document.getElementById('location-search-input');
const locationResults = document.getElementById('location-results');
const saveSettingsBtn = document.getElementById('save-settings-btn');
let selectedLocation = null;
let searchTimeout = null;

function getWeatherEmoji(code) {
  if ([0, 1].includes(code)) return '☀️';
  if ([2].includes(code)) return '⛅️';
  if ([3].includes(code)) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(code)) return '🌧️';
  if ([71, 73, 75, 77].includes(code)) return '🌨️';
  if ([80, 81, 82].includes(code)) return '🌦️';
  if ([85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '❓';
}
function getWeatherDescription(code) {
  if ([0].includes(code)) return 'Clear sky';
  if ([1].includes(code)) return 'Mainly clear';
  if ([2].includes(code)) return 'Partly cloudy';
  if ([3].includes(code)) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Unknown';
}

async function loadCachedWeather() {
  try {
    const data = await browser.storage.local.get(['cachedWeatherData', 'cachedCityName', 'cachedUnits']);
    if (data.cachedWeatherData && data.cachedCityName) {
      updateWeatherUI(data.cachedWeatherData, data.cachedCityName, data.cachedUnits || 'celsius');
    }
  } catch (error) {
    console.warn('Could not load cached weather:', error);
  }
}

function updateWeatherUI(data, cityName, units) {
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  const cityEl = document.getElementById('weather-city');
  const descEl = document.getElementById('weather-desc');
  const pressureEl = document.getElementById('weather-pressure');
  const humidityEl = document.getElementById('weather-humidity');
  const cloudcoverEl = document.getElementById('weather-cloudcover');
  const precipProbEl = document.getElementById('weather-precip-prob');
  const sunriseEl = document.getElementById('weather-sunrise');
  const sunsetEl = document.getElementById('weather-sunset');
  const weather = data.current_weather, hourly = data.hourly, daily = data.daily;
  const temp = Math.round(weather.temperature), code = weather.weathercode;
  const pressure = hourly.surface_pressure ? Math.round(hourly.surface_pressure[0] * 0.75006) : '--';
  const humidity = hourly.relative_humidity_2m ? hourly.relative_humidity_2m[0] : '--';
  const cloudcover = hourly.cloudcover ? hourly.cloudcover[0] : '--';
  const precipProb = hourly.precipitation_probability ? hourly.precipitation_probability[0] : '--';
  let sunrise = '--', sunset = '--';
  if (daily && daily.sunrise && daily.sunrise[0] && daily.sunset && daily.sunset[0]) {
    const sunriseDate = new Date(daily.sunrise[0]);
    const sunsetDate = new Date(daily.sunset[0]);
    const timeOptions = { hour: 'numeric', minute: '2-digit' };
    sunrise = sunriseDate.toLocaleTimeString('en-US', timeOptions);
    sunset = sunsetDate.toLocaleTimeString('en-US', timeOptions);
  }
  cityEl.textContent = cityName;
  tempEl.textContent = `${temp}°${units === 'celsius' ? 'C' : 'F'}`;
  descEl.textContent = getWeatherDescription(code);
  pressureEl.textContent = `Pressure: ${pressure}${pressure !== '--' ? ' mmHg' : ''}`;
  humidityEl.textContent = `Humidity: ${humidity}${humidity !== '--' ? '%' : ''}`;
  cloudcoverEl.textContent = `Cloudcover: ${cloudcover}${cloudcover !== '--' ? '%' : ''}`;
  precipProbEl.textContent = `Rain Chance: ${precipProb}${precipProb !== '--' ? '%' : ''}`;
  sunriseEl.textContent = `Sunrise: ${sunrise}`;
  sunsetEl.textContent = `Sunset: ${sunset}`;
  iconEl.textContent = getWeatherEmoji(code);
  iconEl.style.fontSize = '3.5em';
  iconEl.style.lineHeight = '1';
  setLocationBtn.classList.add('hidden');
  browser.storage.local.set({
    cachedWeatherData: data,
    cachedCityName: cityName,
    cachedUnits: units
  });
}

function showWeatherError(error) {
  if (error) console.error('Weather Error:', error);
  document.getElementById('weather-city').textContent = 'Weather Error';
  document.getElementById('weather-temp').textContent = '--°';
  document.getElementById('weather-desc').textContent = 'Could not load data';
  document.getElementById('weather-icon').textContent = '⚠️';
  setLocationBtn.classList.remove('hidden');
  browser.storage.local.remove(['cachedWeatherData', 'cachedCityName', 'cachedUnits']);
}

async function fetchWeather(lat, lon, units, cityName) {
  try {
    const hourlyParams = 'relative_humidity_2m,surface_pressure,cloudcover,precipitation_probability';
    const dailyParams = 'sunrise,sunset';
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=${units}&hourly=${hourlyParams}&daily=${dailyParams}&timezone=auto`;
    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw new Error('Weather data not available');
    const weatherData = await weatherResponse.json();
    updateWeatherUI(weatherData, cityName, units);
  } catch (error) {
    showWeatherError(error);
  }
}


// message is optional; options can contain { title, faviconUrl, isFolder }
function showDeleteConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-delete-modal');
    const iconSpan = document.getElementById('confirm-delete-icon');
    const textSpan = document.getElementById('confirm-delete-text');
    const cancelBtn = document.getElementById('confirm-delete-cancel-btn');
    const okBtn = document.getElementById('confirm-delete-ok-btn');
    const closeBtn = document.getElementById('confirm-delete-close-btn');

    const { title = '', faviconUrl = null, isFolder = false } = options;

    // ---------- TEXT ----------
    let finalText;
    if (isFolder && title) {
      // FOLDER TEXT
      finalText = `Are you sure you want to remove "${title}" and all its contents?`;
    } else if (title) {
      // ICON / BOOKMARK TEXT
      finalText = `Are you sure you want to remove "${title}"?`;
    } else if (message) {
      finalText = message;
    } else {
      finalText = 'Delete this item?';
    }
    textSpan.textContent = finalText;

    // ---------- ICON ----------
    iconSpan.innerHTML = '';

    if (isFolder) {
      iconSpan.innerHTML = `
        <div class="bookmark-icon-wrapper">
          <svg
            class="bookmark-folder-icon"
            width="48"
            height="40"
            viewBox="0 0 64 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 10
                 C8 7.8 9.8 6 12 6
                 H26
                 L30 10
                 H52
                 C54.2 10 56 11.8 56 14
                 V18
                 H8
                 Z"
              fill="#EDEDED"
            />

            <rect
              x="8"
              y="14"
              width="48"
              height="30"
              rx="6"
              ry="6"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      `;
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

    // ---------- SHOW + HANDLERS ----------
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      if (closeBtn) closeBtn.removeEventListener('click', onCancel);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
    if (closeBtn) closeBtn.addEventListener('click', onCancel);
  });
}


function startGeolocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude, lon = position.coords.longitude;
        await browser.storage.local.set({
          weatherLat: lat,
          weatherLon: lon,
          weatherCityName: 'Current Location'
        });
        const data = await browser.storage.local.get('weatherUnits');
        fetchWeather(lat, lon, data.weatherUnits || 'celsius', 'Current Location');
      },
      showWeatherError
    );
  } else {
    showWeatherError(new Error('Geolocation not supported'));
  }
}

async function searchForLocation() {
  const query = locationSearchInput.value;
  if (query.length < 3) {
    locationResults.innerHTML = '';
    locationResults.classList.add('hidden');
    return;
  }
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;
    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();
    locationResults.innerHTML = '';
    if (geoData.results && geoData.results.length > 0) {
      geoData.results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'location-result-item';
        item.innerHTML = `${result.name}, <span>${result.admin1 || ''} ${result.country}</span>`;
        item.addEventListener('click', () => {
          selectedLocation = result;
          locationSearchInput.value = `${result.name}, ${result.country}`;
          locationResults.classList.add('hidden');
          locationResults.innerHTML = '';
        });
        locationResults.appendChild(item);
      });
      locationResults.classList.remove('hidden');
    } else {
      locationResults.classList.add('hidden');
    }
  } catch (error) {
    console.error('Location search error:', error);
  }
}

async function setupWeather() {
  settingsBtn.addEventListener('click', async () => {
    const data = await browser.storage.local.get(['weatherCityName', 'weatherUnits']);
    tempUnitToggle.checked = (data.weatherUnits === 'fahrenheit');
    locationSearchInput.value = (data.weatherCityName === 'Current Location') ? '' : (data.weatherCityName || '');
    selectedLocation = null;
    locationResults.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    weatherWidget.classList.add('hidden');
  });
  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    weatherWidget.classList.remove('hidden');
  });
  setLocationBtn.addEventListener('click', async () => {
    await browser.storage.local.remove(['weatherLat', 'weatherLon', 'weatherCityName']);
    startGeolocation();
  });
  locationSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(searchForLocation, 300);
  });
  saveSettingsBtn.addEventListener('click', async () => {
    const newUnit = tempUnitToggle.checked ? 'fahrenheit' : 'celsius';
    let settingsToSave = { weatherUnits: newUnit };
    if (selectedLocation) {
      settingsToSave.weatherLat = selectedLocation.latitude;
      settingsToSave.weatherLon = selectedLocation.longitude;
      settingsToSave.weatherCityName = selectedLocation.name;
    }
    await browser.storage.local.set(settingsToSave);
    settingsPanel.classList.add('hidden');
    weatherWidget.classList.remove('hidden');
    const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
    if (data.weatherLat) {
      fetchWeather(data.weatherLat, data.weatherLon, data.weatherUnits, data.weatherCityName);
    } else {
      startGeolocation();
    }
  });

  const data = await browser.storage.local.get(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
  const units = data.weatherUnits || 'celsius';
  if (data.weatherLat && data.weatherLon) {
    fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName);
  } else {
    startGeolocation();
  }
}

// ===============================================
// --- DOCK NAVIGATION ---
// ===============================================
function setupDockNavigation() {
  // Helper function to prevent default link behavior and open a new tab
  const openTab = (e, url) => {
    e.preventDefault();
    browser.tabs.update({ url: url });
  };

  document.getElementById('dock-bookmarks-btn').addEventListener('click', (e) => {
    openTab(e, 'about:bookmarks');
  });

  document.getElementById('dock-history-btn').addEventListener('click', (e) => {
    openTab(e, 'about:history');
  });

  document.getElementById('dock-downloads-btn').addEventListener('click', (e) => {
    openTab(e, 'about:downloads');
  });

  document.getElementById('dock-addons-btn').addEventListener('click', (e) => {
    openTab(e, 'about:addons');
  });
}

// ===============================================
// --- INITIALIZE THE PAGE (MODIFIED) ---
// ===============================================
async function initializePage() {
  updateTime();
  setInterval(updateTime, 1000 * 60);
  await loadCachedQuote();
  await loadCachedWeather();
  setupQuoteWidget();
  await setupSearch();
  await setupWeather();
  setupAppLauncher();
  setupDockNavigation();
  
  setupQuickActions();
  setupBookmarkModal();
  setupFolderModal();
  setupEditFolderModal();
  setupMoveModal();
  
  loadBookmarks();
  fetchQuote();

  // --- Add global listeners to hide ALL context menus ---
  const hideAllContextMenus = () => {
    folderContextMenu.classList.add('hidden');
    gridFolderMenu.classList.add('hidden');
    iconContextMenu.classList.add('hidden');
    if (gridBlankMenu) {
      gridBlankMenu.classList.add('hidden');
    }
  };

  window.addEventListener('click', hideAllContextMenus);
  window.addEventListener('blur', hideAllContextMenus);

  // Prevent clicks inside menus from closing them immediately
  [folderContextMenu, gridFolderMenu, iconContextMenu, gridBlankMenu].forEach(menu => {
    if (!menu) return;
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  const bookmarksGrid = document.getElementById('bookmarks-grid');
  if (bookmarksGrid && gridBlankMenu) {
    bookmarksGrid.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.bookmark-item')) {
        return; // regular item menus handle this
      }
      e.preventDefault();
      e.stopPropagation();
      hideAllContextMenus();
      gridBlankMenu.style.top = `${e.clientY}px`;
      gridBlankMenu.style.left = `${e.clientX}px`;
      gridBlankMenu.classList.remove('hidden');
    });

    const handleGridMenuAction = (action) => {
      hideAllContextMenus();
      if (action === 'bookmark') {
        showAddBookmarkModal();
      } else if (action === 'folder') {
        showAddFolderModal();
      } else if (action === 'manage') {
        // Placeholder for future functionality
        console.log('Manage Bookmarks menu clicked');
      }
    };

    if (gridMenuCreateBookmarkBtn) {
      gridMenuCreateBookmarkBtn.addEventListener('click', () => handleGridMenuAction('bookmark'));
    }
    if (gridMenuCreateFolderBtn) {
      gridMenuCreateFolderBtn.addEventListener('click', () => handleGridMenuAction('folder'));
    }
    if (gridMenuManageBtn) {
      gridMenuManageBtn.addEventListener('click', () => handleGridMenuAction('manage'));
    }
  }

  // === Handle clicks inside the GRID FOLDER context menu ===
  if (gridFolderMenu) {
    gridFolderMenu.addEventListener('click', (e) => {
      const button = e.target.closest('button.menu-item');
      if (!button) return;
      e.stopPropagation();

      const action = button.dataset.action;

      if (action === 'open') {
        openFolderFromContext(currentContextItemId);
      } else if (action === 'rename') {
        // --- UPDATED ---
        const gridItem = document.querySelector(`.bookmark-item[data-bookmark-id="${currentContextItemId}"]`);
        const node = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);
        if (gridItem && node) {
          showGridItemRenameInput(gridItem, node);
        }
        // --- END UPDATE ---
      } else if (action === 'edit') {
        if (bookmarkTree && bookmarkTree[0] && currentContextItemId) {
          const folderNode = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);
          if (folderNode) {
            showEditFolderModal(folderNode);
          }
        }
      } else if (action === 'delete') {
        // Delete a folder (and its children) in the grid
        deleteBookmarkOrFolder(currentContextItemId, true);
      } else if (action === 'move') {
        openMoveBookmarkModal(currentContextItemId, true);
      }
      // Later you can handle other actions:
      // if (action === 'edit') { ... }

      hideAllContextMenus();
    });
  }

  // === Handle clicks inside the ICON context menu ===
  if (iconContextMenu) {
    iconContextMenu.addEventListener('click', (e) => {
      const button = e.target.closest('button.menu-item');
      if (!button) return;
      e.stopPropagation();

      const action = button.dataset.action;

      if (action === 'rename') {
        // --- UPDATED ---
        const gridItem = document.querySelector(`.bookmark-item[data-bookmark-id="${currentContextItemId}"]`);
        const node = findBookmarkNodeById(bookmarkTree[0], currentContextItemId);
        if (gridItem && node) {
          showGridItemRenameInput(gridItem, node);
        }
        // --- END UPDATE ---
      } else if (action === 'edit') {
        showEditBookmarkModal(currentContextItemId);
      } else if (action === 'delete') {
        // Delete a regular bookmark icon
        deleteBookmarkOrFolder(currentContextItemId, false);
      } else if (action === 'move') {
        openMoveBookmarkModal(currentContextItemId, false);
      } else if (action === 'open-new-tab') {
        openBookmarkInNewTab(currentContextItemId);
      }
      // Later you can handle:
      // if (action === 'edit') { ... }

      hideAllContextMenus();
    });
  }

  // === All manual D&D listeners for bookmarkFolderTabsContainer removed ===
  // They are now handled by setupTabsSortable() which is
  // called at the end of createFolderTabs()
}

initializePage();
function openBookmarkInNewTab(bookmarkId) {
  if (!bookmarkTree || !bookmarkTree[0] || !bookmarkId) return;
  const node = findBookmarkNodeById(bookmarkTree[0], bookmarkId);
  if (!node || !node.url) {
    alert('This bookmark does not have a valid URL.');
    return;
  }
  browser.tabs.create({ url: node.url, active: false });
}
function openFolderFromContext(folderId) {
  if (!bookmarkTree || !bookmarkTree[0] || !folderId) return;
  const folderNode = findBookmarkNodeById(bookmarkTree[0], folderId);
  if (!folderNode || !folderNode.children) {
    alert('Unable to open this folder.');
    return;
  }
  renderBookmarkGrid(folderNode);
}
