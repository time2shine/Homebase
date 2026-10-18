// --- HELPER: ANIMATED MODALS ---

function openModalWithAnimation(modalId, triggerSource, dialogSelector) {
  const modal = document.getElementById(modalId);
  const dialog = modal ? modal.querySelector(dialogSelector) : null;
  if (!modal || !dialog) return;

  // Ensure the overlay is visible for the animation
  modal.style.display = 'flex';

  // Identify trigger element (string id or DOM element)
  let btn = null;
  if (typeof triggerSource === 'string') {
    btn = document.getElementById(triggerSource);
  } else if (typeof Element !== 'undefined' && triggerSource instanceof Element) {
    btn = triggerSource;
  } else if (triggerSource && typeof triggerSource === 'object' && typeof triggerSource.getBoundingClientRect === 'function') {
    btn = triggerSource;
  }

  // Calculate transform origin
  if (btn && typeof btn.getBoundingClientRect === 'function' && typeof window !== 'undefined') {
    const btnRect = btn.getBoundingClientRect();
    const viewportCenterX = (window.innerWidth || 0) / 2;
    const viewportCenterY = (window.innerHeight || 0) / 2;
    const btnCenterX = btnRect.left + (btnRect.width / 2);
    const btnCenterY = btnRect.top + (btnRect.height / 2);
    const originX = btnCenterX - viewportCenterX;
    const originY = btnCenterY - viewportCenterY;
    dialog.style.transformOrigin = `calc(50% + ${originX}px) calc(50% + ${originY}px)`;
  } else {
    dialog.style.transformOrigin = 'center center';
  }

  // Clean up any pending opening animation listener from a previous open
  if (typeof modal._hbOpenAnimCleanup === 'function') {
    modal._hbOpenAnimCleanup();
    modal._hbOpenAnimCleanup = null;
  }

  modal.classList.remove('hidden', 'closing', 'modal-settled');
  document.body.classList.add('modal-open');

  const cleanupOpenAnim = () => {
    if (typeof modal._hbOpenAnimCleanup === 'function') {
      modal._hbOpenAnimCleanup();
      modal._hbOpenAnimCleanup = null;
    }
  };

  const onOpenAnimEnd = (e) => {
    // Ignore bubbled animation events from child elements
    if (e && e.target && e.target !== dialog) return;

    cleanupOpenAnim();

    // Cannot mark a hidden or closing dialog as modal-settled
    if (modal.classList.contains('hidden') || modal.classList.contains('closing')) return;

    modal.classList.add('modal-settled');
  };

  const isPerfMode = (typeof document !== 'undefined' && document.body && document.body.classList.contains('performance-mode')) ||
    (typeof window !== 'undefined' && window.appPerformanceModePreference === true);

  if (isPerfMode) {
    if (!modal.classList.contains('hidden') && !modal.classList.contains('closing')) {
      modal.classList.add('modal-settled');
    }
  } else if (dialog && dialog.addEventListener) {
    modal._hbOpenAnimCleanup = () => {
      if (dialog && dialog.removeEventListener) {
        dialog.removeEventListener('animationend', onOpenAnimEnd);
        dialog.removeEventListener('animationcancel', onOpenAnimEnd);
      }
    };
    dialog.addEventListener('animationend', onOpenAnimEnd);
    dialog.addEventListener('animationcancel', onOpenAnimEnd);
  } else {
    if (!modal.classList.contains('hidden') && !modal.classList.contains('closing')) {
      modal.classList.add('modal-settled');
    }
  }

  const input = dialog.querySelector('input[type="text"]');
  if (input) setTimeout(() => input.focus(), 50);
}

function closeModalWithAnimation(modalId, dialogSelector, onCleanup) {
  const modal = document.getElementById(modalId);
  const dialog = modal ? modal.querySelector(dialogSelector) : null;

  if (!modal || modal.classList.contains('hidden')) return;

  // Clean up any pending opening animation listener immediately when closing starts
  if (typeof modal._hbOpenAnimCleanup === 'function') {
    modal._hbOpenAnimCleanup();
    modal._hbOpenAnimCleanup = null;
  }

  modal.classList.remove('modal-settled');
  modal.classList.add('closing');

  const onAnimEnd = (e) => {
    // Ignore bubbled animation events from child elements
    if (e && e.target && e.target !== dialog) return;

    if (dialog && dialog.removeEventListener) {
      dialog.removeEventListener('animationend', onAnimEnd);
      dialog.removeEventListener('animationcancel', onAnimEnd);
    }

    modal.classList.add('hidden');
    modal.classList.remove('closing', 'modal-settled');
    if (document.querySelectorAll && document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
      document.body.classList.remove('modal-open');
    }
    if (onCleanup) onCleanup();
  };

  if (dialog && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const styles = window.getComputedStyle(dialog);
    const animationName = styles.animationName || '';
    const animationDuration = parseFloat(styles.animationDuration) || 0;
    const animationDelay = parseFloat(styles.animationDelay) || 0;

    if (!animationName || animationName === 'none' || animationDuration + animationDelay === 0) {
      onAnimEnd();
      return;
    }

    dialog.addEventListener('animationend', onAnimEnd);
    dialog.addEventListener('animationcancel', onAnimEnd);
  } else {
    onAnimEnd();
  }
}

function showCustomAlert(message) {

  showCustomDialog('Notice', message);

}



function showCustomDialog(title, message) {
  const modal = document.getElementById('custom-alert-modal');
  const titleEl = document.getElementById('custom-alert-title');
  const msgEl = document.getElementById('custom-alert-message');
  const btn = document.getElementById('custom-alert-ok-btn');

  if (!modal || !btn) return;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerText = message; // Use innerText to handle \n newlines

  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const handleClose = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
      document.body.classList.remove('modal-open');
    }
  };

  btn.onclick = handleClose;
  modal.onclick = (event) => {
    if (event.target === modal) handleClose();
  };
}
