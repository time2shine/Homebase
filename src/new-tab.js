// ===============================================

// --- GLOBAL ELEMENTS ---

// ===============================================

const browser = window.browser || window.chrome;

const googleAppsBtn = document.getElementById('google-apps-btn');

const googleAppsPanel = document.getElementById('google-apps-panel');



const searchWidget = document.querySelector('.widget-search');

const searchResultsPanel = document.getElementById('search-results-panel');

const bookmarkTabsTrack = document.getElementById('bookmark-tabs-track');

const tabScrollLeftBtn = document.getElementById('tab-scroll-left');

const tabScrollRightBtn = document.getElementById('tab-scroll-right');

const runWhenIdle = (cb, timeout = 500) => {

  if ('requestIdleCallback' in window) {

    requestIdleCallback(cb, { timeout });

  } else {

    setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), Math.min(timeout, 500));

  }

};

const IDLE_TASK_BUDGET_MS = 12;
const idleTaskQueue = [];
const idleTaskLabels = new Map();
let idleTaskScheduled = false;

hbPerfMark('script-start');

const STARTUP_IDLE_LABELS = new Set([
  'startup:loadCachedWeather',
  'startup:quoteIndex',
  'startup:setupQuoteWidget',
  'startup:setupNewsWidget',
  'startup:setupTodoWidget',
  'startup:setupSearch',
  'startup:setupWeather',
  'startup:setupAppLauncher',
  'startup:fetchQuote',
  'startup:ensureDailyWallpaper',
]);

async function processIdleTasks(deadline) {

  idleTaskScheduled = false;

  const start = performance.now();

  const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

  while (idleTaskQueue.length) {

    const timeRemaining = hasDeadline ? deadline.timeRemaining() : Infinity;

    const elapsed = performance.now() - start;

    if (elapsed >= IDLE_TASK_BUDGET_MS || (hasDeadline && timeRemaining <= 1)) {

      break;

    }

    const task = idleTaskQueue.shift();

    if (!task) continue;

    task.isRunning = true;

    let result;

    try {

      result = task.fn(deadline);

    } catch (err) {

      console.warn('Idle task failed:', task.label, err);

    }

    const isPromise = result && typeof result.then === 'function';

    if (isPromise) {

      task.isPending = true;

      Promise.resolve(result)
        .catch((err) => {

          console.warn('Idle task failed:', task.label, err);

        })
        .finally(() => {

          task.isPending = false;

          if (task.nextFn) {

            task.fn = task.nextFn;

            task.nextFn = null;

            idleTaskQueue.push(task);

            if (!idleTaskScheduled) {

              idleTaskScheduled = true;

              runWhenIdle(processIdleTasks);

            }

          } else {

            task.isRunning = false;

            if (task.label) {

              idleTaskLabels.delete(task.label);

            }

            return;

          }

        });

      task.isRunning = false;

      continue;

    }

    task.isRunning = false;

    if (task.label) {

      if (task.nextFn) {

        task.fn = task.nextFn;

        task.nextFn = null;

        idleTaskQueue.push(task);

      } else if (!task.isPending) {

        idleTaskLabels.delete(task.label);

      }

    }

  }

  if (idleTaskQueue.length && !idleTaskScheduled) {

    idleTaskScheduled = true;

    runWhenIdle(processIdleTasks);

  }

}

// Queue background work to run in short idle slices.
function scheduleIdleTask(fn, label = 'task') {

  if (typeof fn !== 'function') return;

  if (label) {

    const existing = idleTaskLabels.get(label);

    if (existing) {

      if (existing.isRunning || existing.isPending) {

        existing.nextFn = fn;

      } else {

        existing.fn = fn;

      }

      return;

    }

    const task = { fn, label, nextFn: null, isRunning: false, isPending: false };

    idleTaskLabels.set(label, task);

    idleTaskQueue.push(task);

  } else {

    idleTaskQueue.push({ fn, label: '', nextFn: null, isRunning: false, isPending: false });

  }

  if (!idleTaskScheduled) {

    idleTaskScheduled = true;

    runWhenIdle(processIdleTasks);

  }

}

function scheduleIdleChunkedTask(label, stepFn, initialState) {

  if (typeof stepFn !== 'function') return;

  let state = initialState;

  const runner = (deadline) => {

    const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

    const start = performance.now();

    const shouldYield = () => {

      if (hasDeadline) {

        return deadline.timeRemaining() <= 2;

      }

      return (performance.now() - start) >= Math.max(0, IDLE_TASK_BUDGET_MS - 2);

    };

    while (true) {

      if (shouldYield()) {

        const task = label ? idleTaskLabels.get(label) : null;

        if (task && !task.nextFn) {

          task.nextFn = runner;

        }

        return;

      }

      const result = stepFn(state, deadline);

      if (result && typeof result.then === 'function') {

        return Promise.resolve(result).then((resolved) => {

          const { done, state: newState } = resolved || {};

          if (typeof newState !== 'undefined') {

            state = newState;

          }

          if (done === true) {

            return;

          }

          const task = label ? idleTaskLabels.get(label) : null;

          if (task && !task.nextFn) {

            task.nextFn = runner;

          }

        });

      }

      const { done, state: newState } = result || {};

      if (typeof newState !== 'undefined') {

        state = newState;

      }

      if (done === true) {

        return;

      }

    }

  };

  scheduleIdleTask(runner, label);

}

async function openBookmarkIconPicker(context = {}) {
  try {
    await loadScriptOnce('assets/js/icon-picker.js');

    if (
      !window.HomebaseIconPicker ||
      typeof window.HomebaseIconPicker.open !== 'function'
    ) {
      throw new Error('HomebaseIconPicker failed to load');
    }

    return window.HomebaseIconPicker.open(context);
  } catch (err) {
    console.warn('Failed to open icon picker', err);
    alert('Could not open the icon picker. Please try again.');
    return null;
  }
}

function revealWidget(selector) {

  const el = document.querySelector(selector);

  if (!el) return;

  el.classList.remove('widget-hidden');

  el.classList.add('widget-visible');

}



(async function primeWallpaperBackground() {

  try {

    const stored = await getWallpaperRotationState();

    let selection = stored.selection;

    const now = Date.now();
    const allowDailyRotation = stored.allowDailyRotation;

    if (selection && isDailyWallpaperRotationDue(selection, allowDailyRotation, now)) {

      const manifest = await getVideosManifest();
      const nextSelection = await pickNextWallpaper(manifest);

      if (nextSelection) {

        selection = nextSelection;

        await clearPendingDailyRotation();

      }

    }

    if (selection) {

      syncWallpaperStartupState(selection, allowDailyRotation);

      const hydrated = await hydrateWallpaperSelection(selection);

      const poster = hydrated.posterUrl || 'assets/fallback.webp';

      setWallpaperFallbackPoster(poster, hydrated.posterCacheKey || hydrated.posterUrl || '');

      applyWallpaperBackground(poster);

      return;

    }



    // Only reach here if there is truly no wallpaper set

    const fallbackSelection = buildFallbackSelection(now);

    setWallpaperFallbackPoster(fallbackSelection.posterUrl, fallbackSelection.posterCacheKey || fallbackSelection.posterUrl || '');

    applyWallpaperBackground(fallbackSelection.posterUrl);



    await setWallpaperSelectionWithFallback(fallbackSelection, now);

    syncWallpaperStartupState(fallbackSelection, allowDailyRotation);

  } catch (err) {

    console.warn('primeWallpaperBackground failed:', err);

  }

})();



if (window.HomebaseDockNavigation) {
  window.HomebaseDockNavigation.setupResponsiveLayoutListener();
}

tabsScrollController = initTabsScrollController();

updateBookmarkTabOverflow();



if (tabScrollLeftBtn) {

  tabScrollLeftBtn.addEventListener('click', () => scrollBookmarkTabs(-1));

}

if (tabScrollRightBtn) {

  tabScrollRightBtn.addEventListener('click', () => scrollBookmarkTabs(1));

}

// Optimized: Throttle pointermove to Animation Frame to reduce CPU usage

let dragMoveScheduled = false;

let lastDragX = 0;

let lastDragY = 0;



window.addEventListener('pointermove', (e) => {

  if (!isGridDragging) return;



  lastDragX = e.clientX;

  lastDragY = e.clientY;



  if (!dragMoveScheduled) {

    dragMoveScheduled = true;

    requestAnimationFrame(() => {

      handleGridDragPointerMove({ clientX: lastDragX, clientY: lastDragY });

      dragMoveScheduled = false;

    });

  }

});



let allBookmarks = [];

let suggestionAbortController = null; // To cancel old requests



// --- BOOKMARK LOGIC UPDATES ---

const bookmarkFolderTabsContainer = document.getElementById('bookmark-folder-tabs');

let rootDisplayFolderId = null; // ID of the main folder being displayed (e.g., "homebase")

let activeHomebaseFolderId = null; // ID of the selected folder tab



// === NEW: GRID/TABS DRAG-AND-DROP GLOBALS ===

let currentGridFolderNode = null; // The folder node currently being rendered in the grid

let gridSortable = null;          // Instance for the bookmarks grid

let tabsSortable = null;          // Instance for the folder tabs

let isGridDragging = false;       // Track active drag to block click navigation

let isTabDragging = false;        // Track tab drag state to avoid click misfires

let activeTabDropTarget = null;   // Currently highlighted folder tab drop target



// NEW: folder hover delay state

let folderHoverTarget = null;

let folderHoverStart = 0;

let lastGridDragOverItem = null;

const FOLDER_HOVER_DELAY_MS = 250; // tweak this (200-400ms) to taste

// --- VIRTUALIZATION GLOBALS ---
// (virtualizerState, METADATA_GRID_PATCH_LIMIT extracted to bookmark-grid-controller.js)

let sortableTimeout = null;

recordSortableLibraryAvailability();






// === QUICK ACTION ELEMENTS ===

const quickAddBookmarkBtn = document.getElementById('quick-add-bookmark');

const quickAddFolderBtn = document.getElementById('quick-add-folder');

const quickOpenBookmarksBtn = document.getElementById('quick-open-bookmarks');

// Settings DOM element handles and APP_*_KEY constants extracted to settings-preferences.js




// Animation Dictionary (Name -> CSS Keyframes)
// Map to store per-folder customization (id -> { color, icon })
// Map to store per-bookmark customization (id -> { icon })

// ==========================
// FAVICON RUNTIME DELEGATION
// ==========================
if (typeof window !== 'undefined' && window.HomebaseFaviconPipeline) {
  window.ensureFaviconObserver =
    window.HomebaseFaviconPipeline.ensureFaviconObserver;
  window.getDomainKeyFromUrl =
    window.HomebaseFaviconPipeline.getDomainKeyFromUrl;
  window.getFaviconUrlForRawUrl =
    window.HomebaseFaviconPipeline.getFaviconUrlForRawUrl;
  window.resolveFaviconForImageTarget =
    window.HomebaseFaviconPipeline.resolveFaviconForImageTarget;
}

let bookmarkMetadata = {};

let folderMetadata = {};

let lastUsedBookmarkFolderId = null;

// app*Preference state variables extracted to settings-preferences.js


// ===============================================

// --- BOOKMARKS ---

// ===============================================







// --- NEW: Grid Drag-and-Drop Handlers (Using Sortable.js) ---


/**

 * NEW: Initializes Sortable.js on the bookmarks grid.

 * This is called by renderBookmarkGrid.

 */

function setupGridSortable(gridElement) {

  const sortableStart = getPerfMeasureStart();
  recordSortableLibraryAvailability();

  if (gridSortable) {

    gridSortable.destroy(); // Destroy previous instance

  }

  try {
    gridSortable = Sortable.create(gridElement, {
      animation: 250, // Optimal speed for smoothness
      group: 'bookmarks',
      draggable: '.bookmark-item:not(.back-button)',
      filter: '.grid-item-rename-input',
      preventOnFilter: false,

      // Explicitly tell Sortable which attribute holds the ID
      dataIdAttr: 'data-bookmark-id',

      // Performance Settings
      delay: 150, // Touch-only delay keeps mouse drag responsive; tolerance reduces micro-drag.
      delayOnTouchOnly: true,
      touchStartThreshold: 6,

      ghostClass: 'bookmark-placeholder',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',

      forceFallback: true,
      fallbackClass: 'bookmark-fallback-ghost',
      fallbackOnBody: true,
      fallbackTolerance: 6,

      onClone: (evt) => {
        const clone = evt.clone;
        if (!clone) {
          return;
        }

        clone.classList.add('bookmark-fallback-ghost');

        const fallbackIcon = clone.querySelector('.bookmark-fallback-icon');
        if (fallbackIcon && !fallbackIcon.classList.contains('show-fallback')) {
          clone.classList.add('bookmark-fallback-ghost-hide-fallback');
        }
      },

      onStart: () => {
        isGridDragging = true;
        document.body.classList.add('is-dragging-active');

        // Immediately strip the "drop-in" animation class so Sortable can animate positions.
        const animatingItems = gridElement.querySelectorAll('.newly-rendered');
        animatingItems.forEach(el => {
          el.classList.remove('newly-rendered');
          el.style.animationDelay = '';
          el.style.opacity = '1';
          el.style.animation = 'none';
        });
      },

      onEnd: (evt) => {
        document.body.classList.remove('is-dragging-active');
        // Delay clearing the drag flag so the subsequent click event is ignored.
        setTimeout(() => {
          isGridDragging = false;
        }, 50);
        handleGridDrop(evt);
      },

      onMove: handleGridMove
    });

    recordSortablePerfTiming('grid', sortableStart, 'done');
  } catch (err) {
    recordSortablePerfTiming('grid', sortableStart, 'failed');
    throw err;
  }

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

      if (lastGridDragOverItem && lastGridDragOverItem !== targetItem) {

        lastGridDragOverItem.classList.remove('drag-over');

      }

      if (lastGridDragOverItem !== targetItem) {

        lastGridDragOverItem = targetItem;

      }

      targetItem.classList.add('drag-over');

      return false; // prevent Sortable from reordering while over this folder

    } else {

      // Still in the "passing through" phase ? allow normal reordering

      if (lastGridDragOverItem) {

        lastGridDragOverItem.classList.remove('drag-over');

        lastGridDragOverItem = null;

      }

      targetItem.classList.remove('drag-over');

      return true;

    }

  }



  // Not over a folder ? reset hover state and allow normal sort

  folderHoverTarget = null;

  folderHoverStart = 0;

  if (lastGridDragOverItem) {

    lastGridDragOverItem.classList.remove('drag-over');

    lastGridDragOverItem = null;

  }

  return true;

}



function handleGridDragPointerMove(evt) {

  if (!isGridDragging) {

    if (activeTabDropTarget) {

      clearTabDropHighlight();

    }

    return;

  }



  if (!evt || typeof evt.clientX !== 'number' || typeof evt.clientY !== 'number') {

    return;

  }



  const hoveredElement = document.elementFromPoint(evt.clientX, evt.clientY);

  if (!hoveredElement) {

    clearTabDropHighlight();

    return;

  }



  const tabCandidate = hoveredElement.closest('.bookmark-folder-tab');

  if (!tabCandidate || !tabCandidate.dataset.folderId) {

    clearTabDropHighlight();

    return;

  }



  if (tabCandidate === activeTabDropTarget) {

    return;

  }



  if (activeTabDropTarget) {

    activeTabDropTarget.classList.remove('drop-target');

  }



  activeTabDropTarget = tabCandidate;

  activeTabDropTarget.classList.add('drop-target');

}



function clearTabDropHighlight() {

  if (!activeTabDropTarget) return;

  activeTabDropTarget.classList.remove('drop-target');

  activeTabDropTarget = null;

}







/**
 * OPTIMISTIC HELPER: Updates the local JS array to match the visual drop.
 * This prevents us from needing to re-fetch/re-render the whole grid.
 */
function moveItemInLocalTree(parentId, oldIndex, newIndex) {
  const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
  if (!parentNode || !parentNode.children) return;

  if (oldIndex < 0 || oldIndex >= parentNode.children.length) return;
  if (newIndex < 0 || newIndex >= parentNode.children.length) return;

  const [movedItem] = parentNode.children.splice(oldIndex, 1);
  parentNode.children.splice(newIndex, 0, movedItem);

  parentNode.children.forEach((child, idx) => (child.index = idx));
}

/**
 * NEW: Unified handler for grid drop (re-ordering or moving into a folder).
 * This is a Sortable.js `onEnd` callback.
 */
async function handleGridDrop(evt) {
  clearTabDropHighlight();
  const grid = evt.from;

  grid.querySelectorAll('.bookmark-item.drag-over').forEach(item => {
    item.classList.remove('drag-over');
  });

  const dropTargetElement = document.elementFromPoint(
    evt.originalEvent.clientX,
    evt.originalEvent.clientY
  );

  const folderTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-item[data-is-folder="true"]')
    : null;
  const tabTarget = dropTargetElement
    ? dropTargetElement.closest('.bookmark-folder-tab')
    : null;
  const backButtonTarget = dropTargetElement
    ? dropTargetElement.closest('.back-button')
    : null;

  const draggedItem = evt.item;
  const draggedItemId = draggedItem.dataset.bookmarkId;

  const syncVirtualizerMove = (id, newParentId = null) => {
    if (!virtualizerState.isEnabled) return;

    if (newParentId) {
      const idx = virtualizerState.items.findIndex(x => x.id === id);
      if (idx !== -1) virtualizerState.items.splice(idx, 1);
    }
  };

  // ============================================================
  // CASE A: MOVING INTO A FOLDER (Requires Removal & Transfer)
  // ============================================================
  if ((folderTarget && folderTarget.dataset.bookmarkId !== draggedItemId) || tabTarget || backButtonTarget) {
    let targetFolderId = null;

    if (tabTarget) targetFolderId = tabTarget.dataset.folderId;
    else if (backButtonTarget) targetFolderId = backButtonTarget.dataset.backTargetId;
    else targetFolderId = folderTarget.dataset.bookmarkId;

    // 1. Visual: Remove immediately
    draggedItem.remove();

    // FIX 1: Update Virtualizer internal state immediately
    syncVirtualizerMove(draggedItemId, targetFolderId);

    // 2. Data Model Update (Optimistic)
    if (bookmarkTree && bookmarkTree[0]) {
      const currentFolderId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;
      const sourceParentNode = findBookmarkNodeById(bookmarkTree[0], currentFolderId);
      
      let movedNode = null;

      if (sourceParentNode && sourceParentNode.children) {
        const idx = sourceParentNode.children.findIndex(c => c.id === draggedItemId);
        if (idx !== -1) {
          movedNode = sourceParentNode.children[idx];
          sourceParentNode.children.splice(idx, 1);
        }
      }

      if (movedNode) {
        const targetFolderNode = findBookmarkNodeById(bookmarkTree[0], targetFolderId);
        if (targetFolderNode) {
          if (!targetFolderNode.children) targetFolderNode.children = [];
          movedNode.parentId = targetFolderId;
          targetFolderNode.children.push(movedNode);
        }
      }
    }

    // 3. API: Sync in background
    try {
      await browser.bookmarks.move(draggedItemId, { parentId: targetFolderId });
      getBookmarkTree(true).catch(e => console.warn(e));
    } catch (e) {
      console.warn('Move failed', e);
      if (currentGridFolderNode) loadBookmarks(currentGridFolderNode.id);
    }
    return;
  }

  // ============================================================
  // CASE B: RE-ORDERING (Optimistic - NO RENDER)
  // ============================================================
  if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
    const parentId = currentGridFolderNode ? currentGridFolderNode.id : activeHomebaseFolderId;

    const hasBackButton = grid.firstElementChild.classList.contains('back-button');
    let dataOldIndex = evt.oldIndex;
    let dataNewIndex = evt.newIndex;

    if (hasBackButton) {
      dataOldIndex--;
      dataNewIndex--;
    }

    if (dataOldIndex < 0 || dataNewIndex < 0) return;

    moveItemInLocalTree(parentId, dataOldIndex, dataNewIndex);

    if (virtualizerState.isEnabled) {
      if (
        virtualizerState.items[evt.oldIndex]
        && virtualizerState.items[evt.newIndex] !== undefined
      ) {
        const [movedItem] = virtualizerState.items.splice(evt.oldIndex, 1);
        virtualizerState.items.splice(evt.newIndex, 0, movedItem);
      }
    }

    browser.bookmarks.move(draggedItemId, { index: dataNewIndex })
      .catch(err => {
        console.error('Move failed, reverting...', err);
        loadBookmarks(parentId);
      });
  }
}





// --- NEW: Tab Drag-and-Drop Handlers (Using Sortable.js) ---



/**

 * NEW: Initializes Sortable.js on the folder tabs.

 * This is called by createFolderTabs.

 */

function setupTabsSortable(tabsContainer) {

  const sortableStart = getPerfMeasureStart();
  recordSortableLibraryAvailability();

  if (tabsSortable) {

    tabsSortable.destroy();

  }

  try {
    tabsSortable = Sortable.create(tabsContainer, {

      animation: 350, // Slightly increased duration

      easing: "cubic-bezier(0.25, 1, 0.5, 1)", //  <-- ADD THIS: Adds a smooth "snap" effect

      draggable: '.bookmark-folder-tab',

      filter: '.bookmark-folder-add-btn',

      ghostClass: 'sortable-ghost-tab',

      chosenClass: 'sortable-chosen-tab',

      dragClass: 'sortable-drag-tab',

      forceFallback: true,

      fallbackOnBody: true,

      fallbackClass: 'bookmark-fallback-ghost-tab',

      fallbackTolerance: 5,

      setData: (dataTransfer, dragEl) => {

        dataTransfer.setData('text/plain', dragEl.dataset.folderId || '');

      },

      onStart: () => {

        isTabDragging = true;

        document.body.classList.add('is-tab-dragging');

      },

      onEnd: (evt) => {

        setTimeout(() => {

          isTabDragging = false;

        }, 50);

        document.body.classList.remove('is-tab-dragging');

        handleTabDrop(evt);

        requestAnimationFrame(() => scrollActiveFolderTabIntoView({ behavior: 'smooth' }));

      },

      preventOnFilter: true

    });

    recordSortablePerfTiming('tabs', sortableStart, 'done');
  } catch (err) {
    recordSortablePerfTiming('tabs', sortableStart, 'failed');
    throw err;
  }

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

    if (!targetNode) return;

    targetBookmarkIndex = targetNode.index;

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

    const folderToKeepOpen = previouslyActiveFolderId || draggedFolderId;



    // If the active folder isn't changing, avoid a full reload to prevent UI flash

    if (folderToKeepOpen === activeHomebaseFolderId) {

      const newTree = await getBookmarkTree(true);

      bookmarkTree = newTree;

      return;

    }



    // Otherwise reload, keeping the previously selected tab active

    loadBookmarks(folderToKeepOpen);

  } catch (err) {

    console.error("Error moving bookmark folder:", err);

    loadBookmarks(); // Fallback

  }

}

// =============================================================================
// Backward compatibility bridges for Bookmark Loader Service
// Canonical implementation lives in src/newtab/bookmarks/bookmark-loader-service.js
// =============================================================================

function processBookmarks(nodes, activeFolderId = null, rootNodeOverride = null) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.processBookmarks === 'function') {
    const res = window.HomebaseBookmarkLoader.processBookmarks(nodes, activeFolderId, rootNodeOverride);
    allBookmarks = window.HomebaseBookmarkLoader.getAllBookmarks();
    rootDisplayFolderId = window.HomebaseBookmarkLoader.getRootDisplayFolderId();
    return res;
  }
}

async function loadBookmarkMetadata() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarkMetadata === 'function') {
    bookmarkMetadata = await window.HomebaseBookmarkLoader.loadBookmarkMetadata();
    return bookmarkMetadata;
  }
  return {};
}

async function loadLastUsedFolderId() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadLastUsedFolderId === 'function') {
    lastUsedBookmarkFolderId = await window.HomebaseBookmarkLoader.loadLastUsedFolderId();
    return lastUsedBookmarkFolderId;
  }
  return null;
}

async function setLastUsedFolderId(id) {
  lastUsedBookmarkFolderId = id || null;
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.setLastUsedFolderId === 'function') {
    return await window.HomebaseBookmarkLoader.setLastUsedFolderId(id);
  }
}

async function loadFolderMetadata() {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadFolderMetadata === 'function') {
    folderMetadata = await window.HomebaseBookmarkLoader.loadFolderMetadata();
    return folderMetadata;
  }
  return {};
}

async function loadBookmarks(activeFolderId = null) {
  if (typeof window !== 'undefined' && window.HomebaseBookmarkLoader && typeof window.HomebaseBookmarkLoader.loadBookmarks === 'function') {
    const res = await window.HomebaseBookmarkLoader.loadBookmarks(activeFolderId);
    allBookmarks = window.HomebaseBookmarkLoader.getAllBookmarks();
    rootDisplayFolderId = window.HomebaseBookmarkLoader.getRootDisplayFolderId();
    if (typeof window.bookmarkTree !== 'undefined') {
      bookmarkTree = window.bookmarkTree;
    }
    return res;
  }
}

if (typeof window !== 'undefined') {
  window.loadBookmarks = loadBookmarks;
  window.processBookmarks = processBookmarks;
  window.loadBookmarkMetadata = loadBookmarkMetadata;
  window.loadFolderMetadata = loadFolderMetadata;
  window.loadLastUsedFolderId = loadLastUsedFolderId;
  window.setLastUsedFolderId = setLastUsedFolderId;
}

// ===============================================
// --- SEARCH BAR ---
// ===============================================

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSelect = document.getElementById('search-select');

// Search compatibility bridges
if (typeof window !== 'undefined') {
  if (window.HomebaseSearchUiController) {
    window.updateSearchUI =
      window.HomebaseSearchUiController.updateSearchUI;
    window.clearSearchUI =
      window.HomebaseSearchUiController.clearSearchUI;
    window.hideSearchResultsPanel =
      window.HomebaseSearchUiController.hideSearchResultsPanel;
    window.cycleSearchEngine =
      window.HomebaseSearchUiController.cycleSearchEngine;
    window.applySearchEngineConfig =
      window.HomebaseSearchUiController.applySearchEngineConfig;
    window.getSafeEnabledSearchEngineId =
      window.HomebaseSearchUiController.getSafeEnabledSearchEngineId;
  }
  if (window.HomebaseSearchInteractionController) {
    window.setSearchSuggestionsPreference =
      window.HomebaseSearchInteractionController.setSearchSuggestionsPreference;
  }
}

async function setupSearch() {
  if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.initialize === 'function') {
    await window.HomebaseSearchUiController.initialize();
  }
  if (window.HomebaseSearchInteractionController && typeof window.HomebaseSearchInteractionController.initialize === 'function') {
    await window.HomebaseSearchInteractionController.initialize({ bindEvents: true });
  }
}

// ===============================================
// --- FIREFOX CONTAINER LOGIC ---
// ===============================================
// Extracted to firefox-containers.js (openFolderAll)



// ===============================================

function logInitSettled(name, result) {
  if (result.status === 'rejected') console.warn('[init]', name, 'failed:', result.reason);
}

// --- INITIALIZE THE PAGE (MODIFIED) ---

// ===============================================

// ===============================================
// STARTUP CONTRACT
// - initializePage must not await non-critical hydration (weather/search/quote/appLauncher)
// - startup hydration must be scheduled only in scheduleStartupHydrationTasks()
// - all startup idle labels must be prefixed with "startup:"
// - ready flip must not wait for hydration
// ===============================================
  async function initializePage() {
    hbPerfMark('newtab:init-start');
    hbPerfMark('init-start');
    let STARTUP_PHASE = 'critical';
    let markReadyCount = 0;
    performance.mark('init:start');

    const wallpaperTypeP = getWallpaperTypePreference();

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.initialize === 'function') {
      window.HomebaseSettingsPreferences.initialize();
    }
    const settingsP = (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.load === 'function')
      ? window.HomebaseSettingsPreferences.load()
      : loadAppSettingsFromStorage();
    const bookmarkMetaP = loadBookmarkMetadata();
    const lastFolderP = loadLastUsedFolderId();

    const type = await wallpaperTypeP;
    recordStartupPerfEvent('newtab:wallpaper-type-loaded', { type });
    // allow the video to buffer without blocking UI setup
    waitForWallpaperReady(currentWallpaperSelection, type);

    performance.mark('init:parallel-start');
    hbPerfMark('parallel-start');
    const parallelResults = await Promise.allSettled([settingsP, bookmarkMetaP, lastFolderP]);
    hbPerfMark('parallel-done');
    hbPerfMeasure(
      'parallel-storage-loads',
      'parallel-start',
      'parallel-done'
    );
    performance.mark('init:parallel-done');
    performance.measure('init:parallel', 'init:parallel-start', 'init:parallel-done');

    const [settingsResult, bookmarkMetaResult, lastFolderResult] = parallelResults;
    logInitSettled('loadAppSettingsFromStorage', settingsResult);
    logInitSettled('loadBookmarkMetadata', bookmarkMetaResult);
    logInitSettled('loadLastUsedFolderId', lastFolderResult);

    const folderMetaStart =
      DEBUG_STARTUP_PERF && typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
    await loadFolderMetadata();
    hbPerfTime('loadFolderMetadata', folderMetaStart);

    document.querySelectorAll('.sub-settings-container').forEach((container) => {
      ensureSubSettingsInner(container);
    });

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.sync === 'function') {
      window.HomebaseSettingsPreferences.sync();
    } else if (typeof syncAppSettingsForm === 'function') {
      syncAppSettingsForm();
    }

    setupCinemaModeListeners();

    setupContainerMode();

    updateTime();

  setInterval(updateTime, 1000 * 60);

  setupDockNavigation();
  setupLazySettingsButton();

  setupAnimationSettings();
  setupGlassSettings();

  setupMaterialColorPicker();

  setupSearchEnginesModal();

  if (!isPerformanceModeEnabled()) {
    scheduleIdleTask(() => warmGalleryPosterHydration(), 'warmGalleryPosterHydration');
  } else {
    recordStartupPerfEventOnce('newtab:gallery-warmup-skipped-performance-mode');
  }

  

  setupQuickActions();

  setupFolderPickerModal();

  setupHomebaseRootControls();

  setupHomebaseRootListeners();

  ensureFaviconObserver();
  scheduleIdleTask(() => pruneFaviconMetaIfNeeded(), 'startup:pruneFaviconMeta');



  try {

    const bookmarksStart =
      DEBUG_STARTUP_PERF && typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : 0;
    await loadBookmarks();
    hbPerfTime('loadBookmarks total', bookmarksStart);
    hbPerfMark('bookmarks-done');

  } catch (e) {

    console.warn(e);

  }

  const markPageReadyOnce = () => {
    const b = document?.body;
    if (!b) return;
    if (b.classList.contains('ready')) {
      if (DEBUG_STARTUP_GUARDS) console.warn('[startup guard] markPageReadyOnce called after ready');
      return;
    }
    markReadyCount += 1;
    if (DEBUG_STARTUP_GUARDS && markReadyCount > 1) {
      console.warn('[startup guard] markPageReadyOnce invoked multiple times');
    }
    try {
      b.classList.remove('preload');
      b.classList.add('ready');
    } catch (err) {
      if (DEBUG_STARTUP_GUARDS) console.warn('[startup guard] ready flip failed', err);
    }
    STARTUP_PHASE = 'ready';
    recordStartupPerfEvent('newtab:init-ready');
    if (DEBUG_STARTUP_PERF && b.classList.contains('ready')) {
      hbPerfMark('ready-class');
      hbPerfMeasure('script-to-ready-class', 'script-start', 'ready-class');
      hbPerfMeasure('init-to-ready-class', 'init-start', 'ready-class');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          hbPerfMark('after-ready-paint');
          hbPerfMeasure(
            'script-to-after-ready-paint',
            'script-start',
            'after-ready-paint'
          );
          hbPerfReport();
        });
      });
    }
  };

  const loadCachedWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:loadCachedWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather start');
    try {
      await loadCachedWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:loadCachedWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('loadCachedWeather', elapsedMs);
      recordIdleTaskPerf('startup:loadCachedWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:loadCachedWeather end in', Math.round(elapsedMs), 'ms');
    }
  };

  const buildQuoteIndexSafe = async () => {
    if (!document || !document.body) return;
    const start = performance.now();
    let quoteIndexSkipped = false;
    recordIdleTaskPerf('startup:quoteIndex', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex skipped');
        quoteIndexSkipped = true;
        recordWidgetPerfTiming('quoteIndex', 0, 'skipped');
        recordIdleTaskPerf('startup:quoteIndex', 'skipped', 0);
        return;
      }
      await ensureQuoteIndexBuilt();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:quoteIndex', err);
    } finally {
      const elapsedMs = performance.now() - start;
      if (!quoteIndexSkipped) {
        recordWidgetPerfTiming('quoteIndex', elapsedMs);
      }
      recordIdleTaskPerf('startup:quoteIndex', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:quoteIndex end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupQuoteWidgetSafe = () => {
    if (!document || !document.body || !quoteWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupQuoteWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget start');
    try {
      setupQuoteWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupQuoteWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupQuoteWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupQuoteWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupQuoteWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupNewsWidgetSafe = () => {
    if (!document || !document.body || !newsWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupNewsWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget start');
    try {
      setupNewsWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupNewsWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupNewsWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupNewsWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupNewsWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupTodoWidgetSafe = async () => {
    if (!document || !document.body || !todoWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupTodoWidget', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget start');
    try {
      await setupTodoWidget();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupTodoWidget', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupTodoWidget', elapsedMs);
      recordIdleTaskPerf('startup:setupTodoWidget', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupTodoWidget end in', Math.round(elapsedMs), 'ms');
    }
  };

  const setupSearchSafe = async () => {
    if (!document || !document.body || !searchForm || !searchInput || !searchSelect || !searchResultsPanel || !searchWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupSearch', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch start');
    try {
      await setupSearch();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupSearch', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupSearch', elapsedMs);
      recordIdleTaskPerf('startup:setupSearch', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupSearch end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupSearchSafe ran during critical phase');
    }
  };

  const setupWeatherSafe = async () => {
    if (!document || !document.body || !weatherWidget) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupWeather', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather start');
    try {
      await setupWeather();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupWeather', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupWeather', elapsedMs);
      recordIdleTaskPerf('startup:setupWeather', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupWeather end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] setupWeatherSafe ran during critical phase');
    }
  };

  const setupAppLauncherSafe = () => {
    if (!document || !document.body || !googleAppsBtn || !googleAppsPanel) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:setupAppLauncher', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher start');
    try {
      setupAppLauncher();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:setupAppLauncher', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('setupAppLauncher', elapsedMs);
      recordIdleTaskPerf('startup:setupAppLauncher', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:setupAppLauncher end in', Math.round(elapsedMs), 'ms');
    }
  };

  const fetchQuoteSafe = () => {
    if (!document || !document.body || !quoteText || !quoteAuthor) return;
    const start = performance.now();
    recordIdleTaskPerf('startup:fetchQuote', 'start');
    if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote start');
    try {
      const cachedState = readCachedQuoteState();
      if (!shouldLoadQuoteCatalog({ state: cachedState })) {
        renderCachedQuoteState(cachedState);
        return;
      }
      fetchQuote();
    } catch (err) {
      console.warn('Startup task failed:', 'startup:fetchQuote', err);
    } finally {
      const elapsedMs = performance.now() - start;
      recordWidgetPerfTiming('fetchQuote', elapsedMs);
      recordIdleTaskPerf('startup:fetchQuote', 'end', elapsedMs);
      if (DEBUG_IDLE_STARTUP) console.log('[startup idle] startup:fetchQuote end in', Math.round(elapsedMs), 'ms');
    }
    if (DEBUG_STARTUP_GUARDS && STARTUP_PHASE === 'critical') {
      console.warn('[startup guard] fetchQuoteSafe ran during critical phase');
    }
  };

  const scheduleStartupHydrationTasks = () => {
    const scheduleLabeled = (fn, label) => {
      if (!label.startsWith('startup:')) {
        console.warn('[startup guard] startup task label missing prefix', label);
      }
      if (!STARTUP_IDLE_LABELS.has(label)) {
        console.warn('[startup guard] startup task label not in allowlist', label);
      }
      scheduleIdleTask(async () => {
        try {
          await fn();
        } catch (err) {
          console.warn('Startup task failed:', label, err);
        }
      }, label);
    };

    scheduleLabeled(() => loadCachedWeatherSafe(), 'startup:loadCachedWeather');
    scheduleLabeled(() => buildQuoteIndexSafe(), 'startup:quoteIndex');
    scheduleLabeled(() => setupQuoteWidgetSafe(), 'startup:setupQuoteWidget');
    scheduleLabeled(() => setupNewsWidgetSafe(), 'startup:setupNewsWidget');
    scheduleLabeled(() => setupTodoWidgetSafe(), 'startup:setupTodoWidget');
    scheduleLabeled(() => setupSearchSafe(), 'startup:setupSearch');
    scheduleLabeled(() => setupWeatherSafe(), 'startup:setupWeather');
    scheduleLabeled(() => setupAppLauncherSafe(), 'startup:setupAppLauncher');
    scheduleLabeled(() => fetchQuoteSafe(), 'startup:fetchQuote');
  };

  requestAnimationFrame(markPageReadyOnce);
  requestAnimationFrame(() => {
    scheduleIdleTask(() => ensureDailyWallpaper().catch(() => {}), 'startup:ensureDailyWallpaper');
  });

  runWhenIdle(() => {
    scheduleStartupHydrationTasks();
  });



  // --- Context Menu Management ---

  if (typeof window !== 'undefined' && window.HomebaseDialogController && typeof window.HomebaseDialogController.initialize === 'function') {
    window.HomebaseDialogController.initialize();
  }
  if (typeof window !== 'undefined' && window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.initialize === 'function') {
    window.HomebaseContextMenuController.initialize({
      getBookmarkTree: () => bookmarkTree,
      findBookmarkNodeById: (root, id) => findBookmarkNodeById(root, id),
      openFolderFromContext: (folderId) => openFolderFromContext(folderId),
      openFolderAll: (folderId) => (window.openFolderAll ? window.openFolderAll(folderId) : undefined),
      showGridItemRenameInput: (item, node) => showGridItemRenameInput(item, node),
      showEditFolderModal: (folderNode) => showEditFolderModal(folderNode),
      showEditBookmarkModal: (bookmarkId) => showEditBookmarkModal(bookmarkId),
      deleteBookmarkOrFolder: (id, isFolder, sourceTile) => deleteBookmarkOrFolder(id, isFolder, sourceTile),
      openMoveBookmarkModal: (id, isFolder) => openMoveBookmarkModal(id, isFolder),
      openBookmarkInNewTab: (bookmarkId) => openBookmarkInNewTab(bookmarkId),
      showAddBookmarkModal: () => showAddBookmarkModal(),
      showAddFolderModal: () => showAddFolderModal(),
      handlePasteBookmark: () => handlePasteBookmark(),
      sortCurrentFolderByName: () => sortCurrentFolderByName(),
      populateContainerMenu: (id, isFolder) => typeof populateContainerMenu === 'function' && populateContainerMenu(id, isFolder),
      isContainerModeEnabled: () => Boolean(appContainerModePreference)
    });
  }



  const bookmarksGrid = document.getElementById('bookmarks-grid');

  if (bookmarksGrid) {

    bookmarksGrid.addEventListener('click', (e) => {

      if (e.target.classList.contains('grid-item-rename-input')) return;

      const item = e.target.closest('.bookmark-item');

      if (!item) return;

      if (isGridDragging || item.classList.contains('sortable-chosen')) return;

      if (item.classList.contains('back-button')) {
        e.preventDefault();
        const parentId = item.dataset.backTargetId;
        if (!bookmarkTree || !bookmarkTree[0]) return;
        const parentNode = findBookmarkNodeById(bookmarkTree[0], parentId);
        if (parentNode) renderBookmarkGrid(parentNode);
        return;
      }

      e.preventDefault();



      const nodeId = item.dataset.bookmarkId;

      if (!nodeId || !bookmarkTree || !bookmarkTree[0]) return;

      const node = findBookmarkNodeById(bookmarkTree[0], nodeId);

      if (!node) return;



      if (item.dataset.isFolder === 'true') {

        renderBookmarkGrid(node);

        return;

      }



      if (item.classList.contains('is-loading')) return;

      item.classList.add('is-loading');

      requestAnimationFrame(() => {

        if (node.url) {

          if (appBookmarkOpenNewTabPreference) {

            browser.tabs.create({ url: node.url, active: true });

            setTimeout(() => item.classList.remove('is-loading'), 500);

          } else {

            window.location.href = node.url;

          }

        }

      });

    });



  }

  setupPasteListener();





  // === All manual D&D listeners for bookmarkFolderTabsContainer removed ===

  // They are now handled by setupTabsSortable() which is

  // called at the end of createFolderTabs()

}



if (browser?.storage?.onChanged) {

  browser.storage.onChanged.addListener((changes, area) => {

    if (area !== 'local') return;

    if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {

      const nextSelection = changes[WALLPAPER_SELECTION_KEY]
        ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
        : currentWallpaperSelection;
      const allowDailyRotation = changes[DAILY_ROTATION_KEY]
        ? changes[DAILY_ROTATION_KEY].newValue !== false
        : dailyRotationPreference !== false;

      syncWallpaperStartupState(nextSelection, allowDailyRotation);

    }



    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleStorageChange === 'function') {
      window.HomebaseSearchUiController.handleStorageChange(changes, area);
    }

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.handleStorageChange === 'function') {
      window.HomebaseSettingsPreferences.handleStorageChange(changes, area);
    }

    handleTodoStorageChange(changes, area);

    let changedMetadataIds = null;

    if (changes[FOLDER_META_KEY]) {
      const nextFolderMetadata = changes[FOLDER_META_KEY].newValue || {};
      changedMetadataIds = getChangedMetadataIds(changes[FOLDER_META_KEY].oldValue, nextFolderMetadata);
      folderMetadata = nextFolderMetadata;
    }

    if (changes[BOOKMARK_META_KEY]) {
      const nextBookmarkMetadata = changes[BOOKMARK_META_KEY].newValue || {};
      const changedBookmarkIds = getChangedMetadataIds(changes[BOOKMARK_META_KEY].oldValue, nextBookmarkMetadata);
      changedMetadataIds = changedMetadataIds
        ? Array.from(new Set([...changedMetadataIds, ...changedBookmarkIds]))
        : changedBookmarkIds;
      bookmarkMetadata = nextBookmarkMetadata;
    }

    if (changedMetadataIds?.length && currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {
      const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
      if (activeNode && patchActiveGridMetadataItems(activeNode, changedMetadataIds)) {
        renderBookmarkGrid(activeNode);
      }
    }

    if (changes[LAST_USED_BOOKMARK_FOLDER_KEY]) {
      lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
    }

    if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
      loadBookmarks();
    }

  });

}


document.addEventListener('DOMContentLoaded', () => {
  hbPerfMark('dom-content-loaded');
  hbPerfMeasure(
    'script-to-dom-content-loaded',
    'script-start',
    'dom-content-loaded'
  );
  renderTipOfDay();
  initAddonStoreDockLink();
});

if (DEBUG_STARTUP_PERF) {
  window.addEventListener('load', () => {
    hbPerfMark('window-load');
    hbPerfMeasure('script-to-window-load', 'script-start', 'window-load');
  });
}


initializePage();



// ================================

//    Dynamic Calculator Color

// ================================

if (!isPerformanceModeEnabled()) {
  scheduleIdleTask(() => updateDynamicAccent(), 'startup:updateDynamicAccent');
} else {
  recordStartupPerfEventOnce('newtab:dynamic-accent-skipped-performance-mode');
}
