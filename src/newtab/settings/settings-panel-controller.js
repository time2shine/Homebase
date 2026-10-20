// =============================================================================
// Homebase - Settings Panel Controller (settings-panel-controller.js)
// Extracted from monolithic settings-ui.js (Cycle #14 Phase 3B)
//
// Canonical Owner for:
// - App settings modal lifecycle (open, close, animations, focus)
// - Modal backdrop and ESC keyboard dismissal
// - Section tab switching and navigation routing
// - Actionless panel footer visibility (PANELS_WITHOUT_ACTIONS)
// - Content section ordering and lazy injection
// - Widget sub-settings SortableJS drag-and-drop initialization
// =============================================================================

(() => {
  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  const PANELS_WITHOUT_ACTIONS = new Set(['backup', 'feedback', 'whats-new', 'pro-tips', 'about', 'privacy', 'diagnostics']);
  const WHATS_NEW_SECTION = 'whats-new';
  const PRO_TIPS_SECTION = 'pro-tips';
  const DIAGNOSTICS_SECTION = 'diagnostics';

  const beforeOpenHooks = [];
  const afterCloseHooks = [];
  let modalListenersAttached = false;
  let settingsOpenerElement = null;
  let openSequenceToken = 0;

  // =============================================================================
  // SECTION SWITCHING & TAB ROUTING
  // =============================================================================

  function setActiveAppSettingsSection(section = 'general') {
    if (typeof document === 'undefined') return;
    const navItems = document.querySelectorAll('.app-settings-nav-item');
    const sections = document.querySelectorAll('.app-settings-section');

    navItems.forEach((item) => {
      item.classList.toggle('is-active', item.dataset.section === section);
    });

    sections.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.section === section);
    });

    const footer = document.querySelector('.app-settings-footer');
    if (footer) {
      footer.classList.toggle('hidden', PANELS_WITHOUT_ACTIONS.has(section));
    }

    const activeNav = document.querySelector(`.app-settings-nav-item[data-section="${section}"]`);
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isFocusLost = !activeEl ||
      activeEl === (typeof document !== 'undefined' ? document.body : null) ||
      (typeof activeEl.closest === 'function' && (
        activeEl.closest('.app-settings-section:not(.active)') ||
        activeEl.closest('.app-settings-footer.hidden') ||
        activeEl.closest('.hidden')
      ));

    if (isFocusLost && activeNav && typeof activeNav.focus === 'function') {
      activeNav.focus();
    }

    const Content = globalScope.HomebaseSettingsContentSections;
    if (section === WHATS_NEW_SECTION) {
      if (Content && typeof Content.renderWhatsNewSection === 'function') {
        Content.renderWhatsNewSection();
      }
      return;
    }

    if (section === PRO_TIPS_SECTION) {
      if (Content && typeof Content.renderProTipsSection === 'function') {
        Content.renderProTipsSection();
      }
      return;
    }

    if (section === DIAGNOSTICS_SECTION) {
      if (Content && typeof Content.renderDiagnosticsSection === 'function') {
        Content.renderDiagnosticsSection();
      }
      return;
    }
  }

  // =============================================================================
  // SECTION ORDERING & LAZY INJECTION
  // =============================================================================

  function ensureSettingsSectionOrder() {
    if (typeof document === 'undefined') return;
    const appSettingsNav = document.getElementById('app-settings-nav');
    const appSettingsContent = document.querySelector('.app-settings-content');
    if (!appSettingsNav || !appSettingsContent) return;

    if (globalScope.HomebaseSettingsContentSections && typeof globalScope.HomebaseSettingsContentSections.ensureFeedbackDiagnosticButton === 'function') {
      globalScope.HomebaseSettingsContentSections.ensureFeedbackDiagnosticButton();
    }

    const Content = globalScope.HomebaseSettingsContentSections;

    const navOrder = ['backup', 'whats-new', PRO_TIPS_SECTION, DIAGNOSTICS_SECTION, 'feedback', 'privacy', 'about'];
    const navItems = new Map();

    navOrder.forEach((section) => {
      let item = appSettingsNav.querySelector(`.app-settings-nav-item[data-section="${section}"]`);
      if (!item && Content) {
        if (section === 'privacy' && typeof Content.createPrivacyNavItem === 'function') {
          item = Content.createPrivacyNavItem();
        } else if (section === PRO_TIPS_SECTION && typeof Content.createProTipsNavItem === 'function') {
          item = Content.createProTipsNavItem();
        } else if (section === DIAGNOSTICS_SECTION && typeof Content.createDiagnosticsNavItem === 'function') {
          item = Content.createDiagnosticsNavItem();
        }
      }
      if (item) {
        navItems.set(section, item);
      }
    });

    const navFragment = document.createDocumentFragment();
    navOrder.forEach((section) => {
      const item = navItems.get(section);
      if (item) navFragment.appendChild(item);
    });

    const navDivider = appSettingsNav.querySelector('.nav-divider');
    appSettingsNav.insertBefore(navFragment, navDivider ? navDivider.nextSibling : null);

    const panelOrder = ['backup', 'whats-new', PRO_TIPS_SECTION, DIAGNOSTICS_SECTION, 'feedback', 'privacy', 'about'];
    const panelItems = new Map();

    panelOrder.forEach((section) => {
      let panel = appSettingsContent.querySelector(`.app-settings-section[data-section="${section}"]`);
      if (!panel && Content) {
        if (section === 'privacy' && typeof Content.createPrivacySection === 'function') {
          panel = Content.createPrivacySection();
        } else if (section === PRO_TIPS_SECTION && typeof Content.createProTipsSection === 'function') {
          panel = Content.createProTipsSection();
        } else if (section === DIAGNOSTICS_SECTION && typeof Content.createDiagnosticsSection === 'function') {
          panel = Content.createDiagnosticsSection();
        }
      }
      if (panel) {
        panelItems.set(section, panel);
      }
    });

    const panelFragment = document.createDocumentFragment();
    panelOrder.forEach((section) => {
      const panel = panelItems.get(section);
      if (panel) panelFragment.appendChild(panel);
    });

    appSettingsContent.insertBefore(panelFragment, null);
  }

  // =============================================================================
  // WIDGET ORDER SORTABLE INITIALIZATION
  // =============================================================================

  function setupWidgetOrderSortable() {
    if (typeof document === 'undefined') return;
    const widgetList = document.getElementById('widget-sub-settings');
    if (!widgetList) return;
    if (typeof globalScope.ensureSubSettingsInner === 'function') {
      globalScope.ensureSubSettingsInner(widgetList);
    }
    const widgetInner = widgetList.querySelector('.sub-settings-inner') || widgetList;
    widgetInner.classList.add('settings-list-grid');

    const hasSortable = typeof globalScope.widgetSettingsSortable !== 'undefined' && globalScope.widgetSettingsSortable;
    if (widgetList.dataset.dragReady === '1' && hasSortable) return;

    const commitWidgetOrder = () => {
      const order = Array.from(widgetInner.querySelectorAll('.widget-setting-row'))
        .map((row) => row.dataset.widgetId)
        .filter(Boolean);

      if (!order.length) return;

      if (typeof globalScope.setWidgetOrderPreference === 'function') {
        globalScope.setWidgetOrderPreference(order, { persist: false });
        return;
      }
    };

    if (typeof globalScope.widgetSettingsSortable !== 'undefined' && globalScope.widgetSettingsSortable) {
      globalScope.widgetSettingsSortable.destroy();
      globalScope.widgetSettingsSortable = null;
    }

    if (typeof globalScope.initUnifiedSortable !== 'function') return;

    const sortableInstance = globalScope.initUnifiedSortable(widgetInner, commitWidgetOrder);
    if (typeof globalScope.widgetSettingsSortable !== 'undefined') {
      globalScope.widgetSettingsSortable = sortableInstance;
    }
    widgetList.dataset.dragReady = '1';
  }

  function setupWidgetOrderDrag() {
    setupWidgetOrderSortable();
  }

  if (typeof globalScope !== 'undefined') {
    globalScope.setupWidgetOrderSortable = setupWidgetOrderSortable;
  }

  // =============================================================================
  // MODAL OPEN / CLOSE LIFECYCLE & FOCUS MANAGEMENT
  // =============================================================================

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  function isElementVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.closest === 'function') {
      if (el.closest('.hidden')) return false;
      if (el.closest('.app-settings-section:not(.active)')) return false;
      if (el.closest('.app-settings-footer.hidden')) return false;
      if (el.closest('[inert]')) return false;
    }
    if (el.style) {
      if (el.style.display === 'none' || el.style.visibility === 'hidden') return false;
    }
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const style = window.getComputedStyle(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          return false;
        }
      } catch (err) {
        // ignore computed style lookup failure
      }
    }
    if (typeof el.offsetParent !== 'undefined' && el.offsetParent === null) {
      const isFixed = el.style && el.style.position === 'fixed';
      if (!isFixed && el !== (typeof document !== 'undefined' ? document.activeElement : null)) {
        const bodyHasLayout = typeof document !== 'undefined' && document.body && typeof document.body.offsetParent !== 'undefined';
        if (bodyHasLayout && document.body.offsetParent !== null) {
          return false;
        }
      }
    }
    return true;
  }

  function isElementFocusable(el) {
    if (!el || typeof el.focus !== 'function') return false;
    if (el.disabled || (typeof el.getAttribute === 'function' && el.getAttribute('aria-disabled') === 'true')) return false;
    if (el.tabIndex < 0 || (typeof el.getAttribute === 'function' && el.getAttribute('tabindex') === '-1')) return false;
    if (typeof el.hasAttribute === 'function' && el.hasAttribute('inert')) return false;
    return isElementVisible(el);
  }

  function getSettingsFocusableElements(dialogEl) {
    if (!dialogEl || typeof dialogEl.querySelectorAll !== 'function') return [];
    const candidates = Array.from(dialogEl.querySelectorAll(FOCUSABLE_SELECTOR));
    return candidates.filter((el) => isElementFocusable(el));
  }

  function resolveOpenerElement(triggerSource) {
    if (typeof document === 'undefined') return null;
    if (triggerSource) {
      if (typeof triggerSource === 'string') {
        const byId = document.getElementById(triggerSource);
        if (byId) return byId;
      } else if (typeof Element !== 'undefined' && triggerSource instanceof Element) {
        return triggerSource;
      } else if (typeof triggerSource === 'object' && typeof triggerSource.focus === 'function') {
        return triggerSource;
      }
    }
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) {
      return document.activeElement;
    }
    return document.getElementById('main-settings-btn');
  }

  function isOpenerEligible(el) {
    if (!el || typeof el.focus !== 'function') return false;
    if (typeof el.isConnected === 'boolean' && !el.isConnected) return false;
    if (typeof document !== 'undefined' && document.body && typeof document.body.contains === 'function' && !document.body.contains(el)) return false;
    if (el.disabled || (typeof el.getAttribute === 'function' && el.getAttribute('aria-disabled') === 'true')) return false;
    return isElementVisible(el);
  }

  function hasActiveNestedDialog() {
    if (typeof document === 'undefined') return false;
    const activeModals = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('.modal-overlay:not(.hidden)') : [];
    for (const modal of activeModals) {
      if (modal.id !== 'app-settings-modal') {
        return true;
      }
    }
    if (document.activeElement && typeof document.activeElement.closest === 'function') {
      const activeModalParent = document.activeElement.closest('.modal-overlay:not(.hidden)');
      if (activeModalParent && activeModalParent.id !== 'app-settings-modal') {
        return true;
      }
    }
    return false;
  }

  function isNestedDialogActiveOrClosing() {
    if (typeof document === 'undefined') return false;
    const modals = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('.modal-overlay') : [];
    for (const modal of modals) {
      if (modal.id === 'app-settings-modal') continue;
      if (modal.classList && (!modal.classList.contains('hidden') || modal.classList.contains('closing'))) {
        return true;
      }
    }
    return false;
  }

  function focusSettingsInitialControl(seq) {
    if (typeof document === 'undefined') return;
    if (seq !== openSequenceToken || !isModalOpen()) return;

    const dialog = document.getElementById('app-settings-dialog');
    if (!dialog) return;

    const activeNav = typeof dialog.querySelector === 'function'
      ? (dialog.querySelector('.app-settings-nav-item.is-active') || dialog.querySelector('.app-settings-nav-item'))
      : null;
    const closeBtn = document.getElementById('app-settings-close') || document.getElementById('app-settings-close-btn');

    const target = (activeNav && isElementFocusable(activeNav))
      ? activeNav
      : ((closeBtn && isElementFocusable(closeBtn)) ? closeBtn : dialog);

    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function scheduleInitialFocus(seq) {
    focusSettingsInitialControl(seq);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => focusSettingsInitialControl(seq));
    }
    if (typeof setTimeout === 'function') {
      setTimeout(() => focusSettingsInitialControl(seq), 50);
    }
  }

  function restoreOpenerFocus(seq) {
    if (typeof document === 'undefined') return;
    if (isModalOpen() || seq !== openSequenceToken) return;
    if (hasActiveNestedDialog()) return;

    const opener = settingsOpenerElement;
    settingsOpenerElement = null;

    if (isOpenerEligible(opener)) {
      try {
        opener.focus();
        return;
      } catch (err) {
        // fallback
      }
    }

    const fallbackBtn = document.getElementById('main-settings-btn');
    if (isOpenerEligible(fallbackBtn)) {
      try {
        fallbackBtn.focus();
      } catch (err) {
        // fallback
      }
    }
  }

  function isModalOpen() {
    if (typeof document === 'undefined') return false;
    const appSettingsModal = document.getElementById('app-settings-modal');
    return !!(appSettingsModal && !appSettingsModal.classList.contains('hidden'));
  }

  function openAppSettingsModal(triggerSource = 'main-settings-btn', options = {}) {
    if (typeof document === 'undefined') return;
    const appSettingsModal = document.getElementById('app-settings-modal');
    if (!appSettingsModal) return;

    settingsOpenerElement = resolveOpenerElement(triggerSource);
    openSequenceToken += 1;
    const currentOpenSeq = openSequenceToken;

    if (typeof globalScope.syncAppSettingsForm === 'function') {
      globalScope.syncAppSettingsForm();
    }

    if (globalScope.HomebaseSettingsFormController && typeof globalScope.HomebaseSettingsFormController.snapshotInitialSettingsState === 'function') {
      globalScope.HomebaseSettingsFormController.snapshotInitialSettingsState();
    }

    for (const hook of beforeOpenHooks) {
      try {
        hook();
      } catch (err) {
        console.warn('beforeOpenHook error', err);
      }
    }

    if (typeof options.onBeforeOpen === 'function') {
      try {
        options.onBeforeOpen();
      } catch (err) {
        console.warn('options.onBeforeOpen error', err);
      }
    }

    if (globalScope.HomebaseSettingsContentSections && typeof globalScope.HomebaseSettingsContentSections.ensureDiagnosticUILoaded === 'function') {
      globalScope.HomebaseSettingsContentSections.ensureDiagnosticUILoaded();
    }

    setActiveAppSettingsSection('general');

    if (typeof globalScope.openModalWithAnimation === 'function') {
      globalScope.openModalWithAnimation('app-settings-modal', triggerSource, '.app-settings-dialog');
    } else {
      appSettingsModal.classList.remove('hidden');
    }

    scheduleInitialFocus(currentOpenSeq);
  }

  function closeAppSettingsModal(options = {}) {
    if (typeof document === 'undefined') return Promise.resolve({ success: false, reason: 'NO_DOCUMENT' });
    const appSettingsModal = document.getElementById('app-settings-modal');
    if (!appSettingsModal) return Promise.resolve({ success: false, reason: 'NO_MODAL' });

    const closeSeq = openSequenceToken;

    let discardPromise = Promise.resolve({ success: true });
    if (options.discard || !options.saved) {
      if (globalScope.HomebaseSettingsFormController && typeof globalScope.HomebaseSettingsFormController.discardSettingsChanges === 'function') {
        try {
          discardPromise = Promise.resolve(globalScope.HomebaseSettingsFormController.discardSettingsChanges())
            .then((result) => {
              if (result && result.success === false) {
                console.warn('HomebaseSettingsPanelController: Settings discard encountered persistence error:', result.error);
              }
              return result || { success: true };
            })
            .catch((err) => {
              console.error('HomebaseSettingsPanelController: Unexpected error during settings discard:', err);
              if (typeof globalScope.showCustomAlert === 'function') {
                globalScope.showCustomAlert('Unable to revert settings changes.');
              } else if (globalScope.HomebaseDialogController && typeof globalScope.HomebaseDialogController.showAlertDialog === 'function') {
                globalScope.HomebaseDialogController.showAlertDialog('Unable to revert settings changes.', 'Settings Error');
              }
              return { success: false, error: err };
            });
        } catch (err) {
          console.error('HomebaseSettingsPanelController: Unexpected error initiating settings discard:', err);
          if (typeof globalScope.showCustomAlert === 'function') {
            globalScope.showCustomAlert('Unable to revert settings changes.');
          } else if (globalScope.HomebaseDialogController && typeof globalScope.HomebaseDialogController.showAlertDialog === 'function') {
            globalScope.HomebaseDialogController.showAlertDialog('Unable to revert settings changes.', 'Settings Error');
          }
          discardPromise = Promise.resolve({ success: false, error: err });
        }
      }
    }

    const handleClosed = () => {
      if (typeof globalScope.syncAppSettingsForm === 'function') {
        globalScope.syncAppSettingsForm();
      }

      for (const hook of afterCloseHooks) {
        try {
          hook();
        } catch (err) {
          console.warn('afterCloseHook error', err);
        }
      }

      if (typeof options.onAfterClose === 'function') {
        try {
          options.onAfterClose();
        } catch (err) {
          console.warn('options.onAfterClose error', err);
        }
      }

      restoreOpenerFocus(closeSeq);
    };

    if (typeof globalScope.closeModalWithAnimation === 'function') {
      globalScope.closeModalWithAnimation('app-settings-modal', '.app-settings-dialog', handleClosed);
    } else {
      appSettingsModal.classList.add('hidden');
      handleClosed();
    }

    return discardPromise;
  }

  function addBeforeOpenHook(fn) {
    if (typeof fn === 'function' && !beforeOpenHooks.includes(fn)) {
      beforeOpenHooks.push(fn);
    }
  }

  function addAfterCloseHook(fn) {
    if (typeof fn === 'function' && !afterCloseHooks.includes(fn)) {
      afterCloseHooks.push(fn);
    }
  }

  // =============================================================================
  // MODAL LISTENERS (BACKDROP, ESC KEY, NAVIGATION, CLOSE BUTTONS)
  // =============================================================================

  function handleSettingsEscape(e) {
    if (!e || e.key !== 'Escape') return;
    if (e.defaultPrevented || e._homebaseHandled) return;
    if (!isModalOpen()) return;
    if (isNestedDialogActiveOrClosing() || hasActiveNestedDialog()) return;
    if (e.target && typeof e.target.closest === 'function') {
      const modalAncestor = e.target.closest('.modal-overlay');
      if (modalAncestor && modalAncestor.id !== 'app-settings-modal') {
        return;
      }
    }

    if (typeof e.preventDefault === 'function') e.preventDefault();
    closeAppSettingsModal({ discard: true }).catch((err) => {
      console.error('ESC close action failed:', err);
    });
  }

  function handleSettingsKeydown(e) {
    if (!e) return;
    if (e.key === 'Escape') {
      handleSettingsEscape(e);
      return;
    }

    if (e.key === 'Tab') {
      if (!isModalOpen()) return;
      if (e.defaultPrevented || e._homebaseHandled) return;
      if (isNestedDialogActiveOrClosing() || hasActiveNestedDialog()) return;

      const dialog = document.getElementById('app-settings-dialog');
      if (!dialog) return;

      const focusables = getSettingsFocusableElements(dialog);
      if (focusables.length === 0) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof dialog.focus === 'function') {
          dialog.focus();
        }
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const currentActive = document.activeElement;

      if (e.shiftKey) {
        if (currentActive === first || !dialog.contains(currentActive) || currentActive === dialog) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          last.focus();
        }
      } else {
        if (currentActive === last || !dialog.contains(currentActive) || currentActive === dialog) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          first.focus();
        }
      }
    }
  }

  function setupModalLifecycle(options = {}) {
    if (typeof document === 'undefined') return;
    const appSettingsModal = document.getElementById('app-settings-modal');
    const appSettingsNav = document.getElementById('app-settings-nav');
    const appSettingsCloseBtn = document.getElementById('app-settings-close') || document.getElementById('app-settings-close-btn');
    const appSettingsCancelBtn = document.getElementById('app-settings-cancel') || document.getElementById('app-settings-cancel-btn');

    if (typeof options.onBeforeOpen === 'function') {
      addBeforeOpenHook(options.onBeforeOpen);
    }
    if (typeof options.onAfterClose === 'function') {
      addAfterCloseHook(options.onAfterClose);
    }

    if (modalListenersAttached) return;
    modalListenersAttached = true;

    setupWidgetOrderDrag();

    if (appSettingsCloseBtn) {
      appSettingsCloseBtn.addEventListener('click', () => {
        closeAppSettingsModal({ discard: true }).catch((err) => {
          console.error('Close button action failed:', err);
        });
      });
    }
    if (appSettingsCancelBtn) {
      appSettingsCancelBtn.addEventListener('click', () => {
        closeAppSettingsModal({ discard: true }).catch((err) => {
          console.error('Cancel button action failed:', err);
        });
      });
    }

    // Modal click delegation (backdrop click, privacy policy click, feedback action click)
    if (appSettingsModal) {
      appSettingsModal.addEventListener('click', (e) => {
        if (e.target === appSettingsModal) {
          closeAppSettingsModal({ discard: true }).catch((err) => {
            console.error('Backdrop close action failed:', err);
          });
          return;
        }

        const privacyPolicyBtn = e.target.closest('.app-settings-privacy-policy-toggle');
        if (privacyPolicyBtn) {
          if (globalScope.HomebaseSettingsContentSections && typeof globalScope.HomebaseSettingsContentSections.handlePrivacyPolicyClick === 'function') {
            globalScope.HomebaseSettingsContentSections.handlePrivacyPolicyClick(privacyPolicyBtn);
          }
          return;
        }

        const feedbackActionBtn = e.target.closest('[data-feedback-action]');
        if (feedbackActionBtn) {
          if (globalScope.HomebaseSettingsContentSections && typeof globalScope.HomebaseSettingsContentSections.handleFeedbackAction === 'function') {
            globalScope.HomebaseSettingsContentSections.handleFeedbackAction(feedbackActionBtn);
          }
          return;
        }
      });
    }

    // Navigation tab item click delegation
    if (appSettingsNav) {
      ensureSettingsSectionOrder();
      appSettingsNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.app-settings-nav-item');
        if (!btn) return;

        const section = btn.dataset.section || 'general';
        setActiveAppSettingsSection(section);

        if (section !== 'gallery') {
          const previewVideo = document.getElementById('gallery-settings-preview-video');
          if (previewVideo && !previewVideo.paused) {
            previewVideo.pause();
          }
        }
      });
    }

    // Keyboard accessibility: ESC key dismissal and TAB focus containment
    document.addEventListener('keydown', handleSettingsKeydown);
  }

  // =============================================================================
  // PUBLIC CONTROLLER EXPORT
  // =============================================================================

  const HomebaseSettingsPanelController = {
    openAppSettingsModal,
    closeAppSettingsModal,
    isModalOpen,
    setupModalLifecycle,
    addBeforeOpenHook,
    addAfterCloseHook,
    setActiveAppSettingsSection,
    ensureSettingsSectionOrder,
    setupWidgetOrderSortable,
    setupWidgetOrderDrag,
    PANELS_WITHOUT_ACTIONS,
    getSettingsFocusableElements,
    isElementFocusable,
    resolveOpenerElement,
    hasActiveNestedDialog,
    isNestedDialogActiveOrClosing,
    handleSettingsKeydown,
    handleSettingsEscape,
    restoreOpenerFocus,
    scheduleInitialFocus
  };

  globalScope.HomebaseSettingsPanelController = HomebaseSettingsPanelController;
})();
