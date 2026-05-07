(function () {
  'use strict';

  // Duration must match the CSS animation (0.2s closing)
  const ICON_PICKER_CLOSE_DURATION = 200;

  let activeContext = null;
  let originalIconState = null;
  let isInitialized = false;
  let iconsRendered = false;

  function getPickerElements() {
    const overlay = document.getElementById('builtin-icon-picker-modal');
    const dialog = document.getElementById('builtin-icon-picker-dialog');
    const list = document.getElementById('builtin-icon-list');

    return { overlay, dialog, list };
  }

  function getCurrentIcon(context) {
    try {
      if (context && typeof context.getCurrentIcon === 'function') {
        return context.getCurrentIcon() || null;
      }
      return (context && context.currentIcon) || null;
    } catch (err) {
      console.warn('Failed to read current icon picker state', err);
      return null;
    }
  }

  function callContextCallback(name, value) {
    try {
      const callback = activeContext && activeContext[name];
      if (typeof callback === 'function') {
        callback(value);
      }
    } catch (err) {
      console.warn('Icon picker callback failed', err);
    }
  }

  function revertToOriginalIcon() {
    callContextCallback('revertIcon', originalIconState);
  }

  function show(anchorButton) {
    const { overlay, dialog, list } = getPickerElements();

    if (!overlay) return false;

    // Reset scroll to top
    if (list) list.scrollTop = 0;

    // Clear manual positioning so CSS centering can take over; keep CSS left offset
    if (dialog) {
      dialog.style.top = '';
    }

    // Calculate transform origin from button to centered dialog
    if (dialog && anchorButton) {
      const btnRect = anchorButton.getBoundingClientRect();
      const btnCenterX = btnRect.left + (btnRect.width / 2);
      const btnCenterY = btnRect.top + (btnRect.height / 2);

      // Dialog is centered in the viewport via flex; its center is screen center plus offset
      const offsetX = 322; // matches CSS left shift
      const dialogCenterX = (window.innerWidth / 2) + offsetX;
      const dialogCenterY = window.innerHeight / 2;

      const originX = btnCenterX - dialogCenterX;
      const originY = btnCenterY - dialogCenterY;

      dialog.style.setProperty(
        '--popover-origin',
        `calc(50% + ${originX}px) calc(50% + ${originY}px)`
      );
    }

    overlay.classList.remove('hidden', 'closing');
    return true;
  }

  function close(options = {}) {
    const { overlay, dialog } = getPickerElements();

    if (!overlay || overlay.classList.contains('hidden')) return false;

    if (options.revert === true) {
      revertToOriginalIcon();
    }

    let finished = false;

    const finalizeClose = () => {
      if (finished) return;

      finished = true;

      overlay.classList.add('hidden');
      overlay.classList.remove('closing');
      activeContext = null;
      originalIconState = null;

      if (dialog) dialog.removeEventListener('animationend', finalizeClose);
    };

    overlay.classList.add('closing');

    if (dialog) dialog.addEventListener('animationend', finalizeClose, { once: true });
    // Fallback in case transitionend doesn't fire
    setTimeout(finalizeClose, ICON_PICKER_CLOSE_DURATION + 50);

    return true;
  }

  function renderIcons() {
    const { list } = getPickerElements();
    const iconCategories = activeContext && activeContext.iconCategories;
    const createSvgIconElement = activeContext && activeContext.createSvgIconElement;

    if (!list) return false;
    if (iconsRendered && list.children.length > 0) return true;
    if (!iconCategories || typeof createSvgIconElement !== 'function') {
      throw new Error('Icon picker context is missing icon rendering helpers');
    }

    list.replaceChildren();

    Object.entries(iconCategories).forEach(([categoryName, iconKeys]) => {
      const section = document.createElement('div');
      section.className = 'icon-picker-category';

      const title = document.createElement('h4');
      title.className = 'icon-picker-category-title';
      title.textContent = categoryName;
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'icon-picker-grid';

      iconKeys.forEach((key) => {
        const svgEl = createSvgIconElement(key);
        if (!svgEl) return;

        const btn = document.createElement('div');
        btn.className = 'icon-picker-item';
        btn.dataset.iconId = key;

        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip-popup tooltip-top';
        tooltip.textContent = key;
        btn.appendChild(tooltip);
        btn.appendChild(svgEl);

        btn.addEventListener('mouseenter', () => {
          callContextCallback('previewIcon', `builtin:${key}`);
        });

        btn.addEventListener('click', (e) => {
          e.stopPropagation();

          const newIcon = `builtin:${key}`;
          originalIconState = newIcon;

          callContextCallback('selectIcon', newIcon);
          close();
        });

        grid.appendChild(btn);
      });

      if (grid.children.length > 0) {
        section.appendChild(grid);
        list.appendChild(section);
      }
    });

    iconsRendered = true;
    return true;
  }

  function initializePicker() {
    if (isInitialized) return true;

    const { overlay, dialog, list } = getPickerElements();

    if (!overlay || !dialog || !list) {
      throw new Error('Icon picker DOM is missing');
    }

    list.addEventListener('mouseleave', () => {
      if (!activeContext) return;
      revertToOriginalIcon();
    });

    overlay.addEventListener('click', (e) => {
      if (!dialog.contains(e.target)) {
        close({ revert: true });
      }
    });

    isInitialized = true;
    return true;
  }

  function open(context = {}) {
    activeContext = context || {};
    originalIconState = getCurrentIcon(activeContext);

    initializePicker();
    renderIcons();

    return show(activeContext.anchorButton);
  }

  window.HomebaseIconPicker = {
    open,
    close
  };
})();
