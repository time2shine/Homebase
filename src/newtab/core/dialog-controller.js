// ===================================================================
// Homebase Dialog & Modal Controller
//
// Manages modal lifecycle, animated opening/closing, active dialog
// stack tracking, Escape key dismissal, and backdrop overlays.
// ===================================================================

(function() {
  'use strict';

  const _activeDialogs = [];
  let _escapeListenerAttached = false;
  let _initialized = false;

  function getDialogsHelper() {
    return {
      openWithAnimation: typeof openModalWithAnimation === 'function' ? openModalWithAnimation : null,
      closeWithAnimation: typeof closeModalWithAnimation === 'function' ? closeModalWithAnimation : null,
      customAlert: typeof showCustomAlert === 'function' ? showCustomAlert : null,
      customDialog: typeof showCustomDialog === 'function' ? showCustomDialog : null
    };
  }

  function openDialog(modalId, triggerSource, dialogSelector = '.dialog-content') {
    if (typeof document === 'undefined') return null;

    const modal = document.getElementById(modalId);
    if (!modal) return null;

    const dialog = modal.querySelector(dialogSelector) || modal.querySelector('.gallery-dialog') || modal.firstElementChild;

    const helper = getDialogsHelper();
    if (helper.openWithAnimation) {
      helper.openWithAnimation(modalId, triggerSource, dialogSelector);
    } else {
      modal.style.display = 'flex';
      modal.classList.remove('hidden', 'closing');
      if (document.body) {
        document.body.classList.add('modal-open');
      }
      if (dialog) {
        const input = dialog.querySelector('input[type="text"], input[type="search"]');
        if (input && typeof setTimeout === 'function') {
          setTimeout(() => input.focus(), 50);
        }
      }
    }

    // Register in active dialogs stack if not already present
    const existingIdx = _activeDialogs.findIndex(d => d.modalId === modalId);
    const descriptor = { modalId, dialogSelector, modal, dialog, openedAt: Date.now() };
    if (existingIdx >= 0) {
      _activeDialogs.splice(existingIdx, 1);
    }
    _activeDialogs.push(descriptor);

    return descriptor;
  }

  function closeDialog(modalId, dialogSelector = '.dialog-content', onCleanup) {
    if (typeof document === 'undefined') return;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    const helper = getDialogsHelper();
    if (helper.closeWithAnimation) {
      helper.closeWithAnimation(modalId, dialogSelector, () => {
        _removeFromActiveStack(modalId);
        if (typeof onCleanup === 'function') onCleanup();
      });
    } else {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      _removeFromActiveStack(modalId);
      if (document.querySelectorAll && document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
        if (document.body) document.body.classList.remove('modal-open');
      }
      if (typeof onCleanup === 'function') onCleanup();
    }
  }

  function _removeFromActiveStack(modalId) {
    const idx = _activeDialogs.findIndex(d => d.modalId === modalId);
    if (idx >= 0) {
      _activeDialogs.splice(idx, 1);
    }
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      if (document.querySelectorAll('.modal-overlay:not(.hidden)').length === 0) {
        if (document.body) document.body.classList.remove('modal-open');
      }
    }
  }

  function closeActiveDialog() {
    if (_activeDialogs.length > 0) {
      const top = _activeDialogs[_activeDialogs.length - 1];
      closeDialog(top.modalId, top.dialogSelector);
      return true;
    }

    // Fallback: search DOM for any visible modal overlay
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      const visibleOverlays = document.querySelectorAll('.modal-overlay:not(.hidden)');
      if (visibleOverlays.length > 0) {
        const topModal = visibleOverlays[visibleOverlays.length - 1];
        if (topModal.id) {
          closeDialog(topModal.id);
          return true;
        }
      }
    }

    return false;
  }

  function handleEscapeKey(e) {
    if (!e || e.key !== 'Escape') return false;

    // Do not dismiss modals if user is typing in a dropdown or rename field that handles its own escape
    if (e.target && e.target.classList && e.target.classList.contains('grid-item-rename-input')) {
      return false;
    }

    return closeActiveDialog();
  }

  function showAlertDialog(message, title = 'Notice') {
    const helper = getDialogsHelper();
    if (helper.customDialog) {
      helper.customDialog(title, message);
    } else if (helper.customAlert) {
      helper.customAlert(message);
    } else if (typeof alert === 'function') {
      alert(`${title}: ${message}`);
    }
  }

  function showConfirmDialog(message, options = {}) {
    if (typeof showDeleteConfirm === 'function') {
      return showDeleteConfirm(message, options);
    }
    if (typeof confirm === 'function') {
      return confirm(message);
    }
    return false;
  }

  function initialize(options = {}) {
    if (typeof document !== 'undefined' && !_escapeListenerAttached && options.bindEscape !== false) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          handleEscapeKey(e);
        }
      });
      _escapeListenerAttached = true;
    }

    _initialized = true;
    return { initialized: true };
  }

  const HomebaseDialogController = {
    initialize,
    openDialog,
    closeDialog,
    closeActiveDialog,
    showConfirmDialog,
    showAlertDialog,
    handleEscapeKey,
    getActiveDialog: () => (_activeDialogs.length > 0 ? _activeDialogs[_activeDialogs.length - 1] : null),
    getActiveDialogs: () => [..._activeDialogs],
    isDialogOpen: (modalId) => _activeDialogs.some(d => d.modalId === modalId)
  };

  if (typeof window !== 'undefined') {
    window.HomebaseDialogController = HomebaseDialogController;
  }
})();
