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
  } else if (triggerSource instanceof Element) {
    btn = triggerSource;
  }

  // Calculate transform origin
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const btnCenterX = btnRect.left + (btnRect.width / 2);
    const btnCenterY = btnRect.top + (btnRect.height / 2);
    const originX = btnCenterX - viewportCenterX;
    const originY = btnCenterY - viewportCenterY;
    dialog.style.transformOrigin = `calc(50% + ${originX}px) calc(50% + ${originY}px)`;
  } else {
    dialog.style.transformOrigin = 'center center';
  }

  modal.classList.remove('hidden', 'closing');
  document.body.classList.add('modal-open');

  const input = dialog.querySelector('input[type=\"text\"]');
  if (input) setTimeout(() => input.focus(), 50);
}

function closeModalWithAnimation(modalId, dialogSelector, onCleanup) {
  const modal = document.getElementById(modalId);
  const dialog = modal ? modal.querySelector(dialogSelector) : null;

  if (!modal || modal.classList.contains('hidden')) return;

  modal.classList.add('closing');

  const onAnimEnd = () => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
    if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
      document.body.classList.remove('modal-open');
    }
    if (onCleanup) onCleanup();
    if (dialog) {
      dialog.removeEventListener('animationend', onAnimEnd);
      dialog.removeEventListener('animationcancel', onAnimEnd);
    }
  };

  if (dialog) {
    const styles = window.getComputedStyle(dialog);
    const animationName = styles.animationName || '';
    const animationDuration = parseFloat(styles.animationDuration) || 0;
    const animationDelay = parseFloat(styles.animationDelay) || 0;

    if (!animationName || animationName === 'none' || animationDuration + animationDelay === 0) {
      onAnimEnd();
      return;
    }

    dialog.addEventListener('animationend', onAnimEnd, { once: true });
    dialog.addEventListener('animationcancel', onAnimEnd, { once: true });
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
