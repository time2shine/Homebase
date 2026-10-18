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

  function isModalOpen() {
    if (typeof document === 'undefined') return false;
    const appSettingsModal = document.getElementById('app-settings-modal');
    return !!(appSettingsModal && !appSettingsModal.classList.contains('hidden'));
  }

  function openAppSettingsModal(triggerSource = 'main-settings-btn', options = {}) {
    if (typeof document === 'undefined') return;
    const appSettingsModal = document.getElementById('app-settings-modal');
    if (!appSettingsModal) return;

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
  }

  function closeAppSettingsModal(options = {}) {
    if (typeof document === 'undefined') return Promise.resolve({ success: false, reason: 'NO_DOCUMENT' });
    const appSettingsModal = document.getElementById('app-settings-modal');
    if (!appSettingsModal) return Promise.resolve({ success: false, reason: 'NO_MODAL' });

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

    // ESC key dismissal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (isModalOpen()) {
        closeAppSettingsModal({ discard: true }).catch((err) => {
          console.error('ESC close action failed:', err);
        });
      }
    });
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
    PANELS_WITHOUT_ACTIONS
  };

  globalScope.HomebaseSettingsPanelController = HomebaseSettingsPanelController;
})();
