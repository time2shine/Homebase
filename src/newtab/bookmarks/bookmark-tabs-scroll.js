let tabsScrollController = null; // Manages tab strip overflow, arrows, and wheel physics

/**

 * Shows or hides the folder tab scroll arrows based on overflow and scroll position.

 */

function updateBookmarkTabOverflow() {

  if (tabsScrollController) {
    tabsScrollController.refresh();
    return;
  }

  // Fallback: hide arrows when controller is unavailable.
  if (!tabScrollLeftBtn || !tabScrollRightBtn) return;
  tabScrollLeftBtn.classList.remove('visible');
  tabScrollRightBtn.classList.remove('visible');

}

/**
 * Ensures the active folder tab is visible inside the scrollable track.
 * Clamps target scroll so we never overshoot the bounds.
 */
function scrollActiveFolderTabIntoView({ behavior = 'smooth', centerIfLarge = false } = {}) {
  const track = bookmarkTabsTrack;
  if (!track) return;

  const activeTab = track.querySelector('.bookmark-folder-tab.active');
  if (!activeTab) return;

  const left = activeTab.offsetLeft;
  const right = left + activeTab.offsetWidth;
  const viewLeft = track.scrollLeft;
  const viewRight = viewLeft + track.clientWidth;

  const isFullyVisible = left >= viewLeft && right <= viewRight;
  if (isFullyVisible) return;

  let target;
  if (left < viewLeft) {
    target = left - 12;
  } else {
    // If it's wider than the viewport and we want to center, do so; else align right edge.
    if (centerIfLarge && activeTab.offsetWidth > track.clientWidth) {
      target = left - Math.max(0, (track.clientWidth - activeTab.offsetWidth) / 2);
    } else {
      target = right - track.clientWidth + 12;
    }
  }

  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const clamped = Math.min(Math.max(target, 0), maxScroll);

  track.scrollTo({ left: clamped, behavior });
}



/**

 * Scrolls the folder tab row by a responsive amount in the given direction.

 */

function scrollBookmarkTabs(direction) {

  if (!bookmarkTabsTrack) return;

  const scrollAmount = Math.max(160, Math.round(bookmarkTabsTrack.clientWidth * 0.75));

  if (tabsScrollController) {
    tabsScrollController.scrollByStep(direction, scrollAmount);
    return;
  }

  bookmarkTabsTrack.scrollBy({
    left: direction * scrollAmount,
    behavior: 'smooth'
  });

}

function initTabsScrollController() {

  if (!bookmarkTabsTrack || !tabScrollLeftBtn || !tabScrollRightBtn) return null;



  const track = bookmarkTabsTrack;

  const leftBtn = tabScrollLeftBtn;

  const rightBtn = tabScrollRightBtn;



  const startSentinel = document.createElement('span');

  startSentinel.className = 'tabs-edge-sentinel tabs-edge-start';

  const endSentinel = document.createElement('span');

  endSentinel.className = 'tabs-edge-sentinel tabs-edge-end';



  const state = {

    atStart: true,

    atEnd: false,

    hasOverflow: false,

    wheelVelocity: 0,

    wheelRaf: 0

  };

  let edgeObserver = null;



  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);



  const ensureSentinels = () => {

    if (startSentinel.parentElement !== track) {

      track.insertBefore(startSentinel, track.firstChild || null);

    } else if (track.firstChild !== startSentinel) {

      track.insertBefore(startSentinel, track.firstChild);

    }



    if (endSentinel.parentElement !== track) {

      track.appendChild(endSentinel);

    } else if (track.lastChild !== endSentinel) {

      track.appendChild(endSentinel);

    }

  };



  const updateButtons = () => {

    if (!leftBtn || !rightBtn) return;



    if (!state.hasOverflow) {

      leftBtn.classList.remove('visible');

      rightBtn.classList.remove('visible');

      return;

    }



    leftBtn.classList.toggle('visible', !state.atStart);

    rightBtn.classList.toggle('visible', !state.atEnd);

  };



  const refreshOverflow = () => {

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

    state.hasOverflow = maxScrollLeft > 1;



    if (!state.hasOverflow) {

      state.atStart = true;

      state.atEnd = true;

    }

  };



  const refresh = () => {

    ensureSentinels();

    refreshOverflow();

    if (edgeObserver) {

      const pending = edgeObserver.takeRecords();

      if (pending.length) {

        handleIntersections(pending);

      }

    }

    updateButtons();

  };



  const handleIntersections = (entries) => {

    entries.forEach((entry) => {

      if (entry.target === startSentinel) {

        state.atStart = entry.isIntersecting;

      } else if (entry.target === endSentinel) {

        state.atEnd = entry.isIntersecting;

      }

    });

    updateButtons();

  };



  const normalizeWheelToPx = (e) => {

    const absX = Math.abs(e.deltaX);

    const absY = Math.abs(e.deltaY);

    let delta = absX > absY ? e.deltaX : e.deltaY;

    if (!delta) return 0;



    if (e.deltaMode === 1) {

      delta *= 16;

    } else if (e.deltaMode === 2) {

      delta *= track.clientWidth;

    }



    return delta;

  };



  const stopWheelLoop = () => {

    if (state.wheelRaf) {

      cancelAnimationFrame(state.wheelRaf);

      state.wheelRaf = 0;

    }

    state.wheelVelocity = 0;

  };



  const startWheelLoop = () => {

    if (state.wheelRaf) return;



    const step = () => {

      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

      if (maxScrollLeft <= 0) {

        stopWheelLoop();

        updateButtons();

        return;

      }



      let next = track.scrollLeft + state.wheelVelocity;

      if (next < 0) {

        next = 0;

        state.wheelVelocity = 0;

      } else if (next > maxScrollLeft) {

        next = maxScrollLeft;

        state.wheelVelocity = 0;

      }



      track.scrollLeft = next;



      state.wheelVelocity *= 0.86;



      if (Math.abs(state.wheelVelocity) < 0.15) {

        stopWheelLoop();

        updateButtons();

        return;

      }



      state.wheelRaf = requestAnimationFrame(step);

    };



    state.wheelRaf = requestAnimationFrame(step);

  };



  const handleWheel = (e) => {

    if (isTabDragging || isGridDragging) return;

    if (e.buttons !== 0) return;



    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);

    if (maxScrollLeft <= 0) return;



    const deltaPx = normalizeWheelToPx(e);



    e.preventDefault();

    e.stopPropagation();



    if (!deltaPx) return;



    const impulse = clamp(deltaPx * 0.35, -120, 120);



    state.wheelVelocity = clamp(state.wheelVelocity + impulse, -80, 80);



    startWheelLoop();

  };



  const scrollByStep = (direction, scrollAmount) => {

    track.scrollBy({

      left: direction * scrollAmount,

      behavior: 'smooth'

    });

  };



  ensureSentinels();



  edgeObserver = new IntersectionObserver(handleIntersections, {

    root: track,

    threshold: 0.99,

    rootMargin: '0px 1px'

  });

  edgeObserver.observe(startSentinel);

  edgeObserver.observe(endSentinel);



  const resizeObserver = new ResizeObserver(() => refresh());

  resizeObserver.observe(track);



  track.addEventListener('wheel', handleWheel, { passive: false });



  refresh();



  return {

    refresh,

    updateButtons,

    scrollByStep,

    handleWheel

  };

}
