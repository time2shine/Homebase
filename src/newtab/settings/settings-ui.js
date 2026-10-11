// =============================================================================
// Homebase - Settings UI Orchestrator Facade (settings-ui.js)
// Refactored in Cycle #14 Phase 3 (3A: Content, 3B: Panel, 3C: Form)
//
// Canonical Owner for:
// - Public window.SettingsUI facade (init, open, ensureFeedbackDiagnosticButton)
// - Lazy loading coordination of modular settings components
// - Top-level initialization sequence
// =============================================================================

window.SettingsUI = (() => {
  let initialized = false;

  let dependenciesLoadPromise = null;
  function ensureDependenciesLoaded() {
    if (
      typeof window !== 'undefined' &&
      window.HomebaseSettingsContentSections &&
      window.HomebaseSettingsPanelController &&
      window.HomebaseSettingsFormController
    ) {
      return Promise.resolve();
    }
    if (dependenciesLoadPromise) {
      return dependenciesLoadPromise;
    }
    if (typeof loadScriptOnce === 'function') {
      dependenciesLoadPromise = Promise.all([
        loadScriptOnce('newtab/settings/settings-content-sections.js'),
        loadScriptOnce('newtab/settings/settings-panel-controller.js'),
        loadScriptOnce('newtab/settings/settings-form-controller.js')
      ])
        .then(() => {
          if (window.HomebaseSettingsPanelController) {
            window.HomebaseSettingsPanelController.ensureSettingsSectionOrder();
            if (initialized) {
              window.HomebaseSettingsPanelController.setupModalLifecycle({
                onBeforeOpen: () => {
                  if (window.HomebaseSettingsFormController) {
                    window.HomebaseSettingsFormController.syncTipsToggle();
                    window.HomebaseSettingsFormController.snapshotInitialWallpaperState();
                  }
                },
                onAfterClose: () => {
                  if (window.HomebaseSettingsFormController) {
                    window.HomebaseSettingsFormController.syncTipsToggle();
                  }
                }
              });
            }
          }
          if (window.HomebaseSettingsFormController && initialized) {
            window.HomebaseSettingsFormController.setupFormListeners();
            window.HomebaseSettingsFormController.setupTipsToggle();
          }
          if (window.HomebaseSettingsContentSections) {
            window.HomebaseSettingsContentSections.updateWhatsNewNavBadge();
          }
        })
        .catch((err) => {
          console.warn('Failed to load settings dependencies', err);
        })
        .finally(() => {
          dependenciesLoadPromise = null;
        });
      return dependenciesLoadPromise;
    }
    return Promise.resolve();
  }

  // Pre-trigger on load if script loader is available
  if (typeof loadScriptOnce === 'function') {
    ensureDependenciesLoaded();
  }

  function updateWhatsNewNavBadge(nextVersion) {
    if (window.HomebaseSettingsContentSections && typeof window.HomebaseSettingsContentSections.updateWhatsNewNavBadge === 'function') {
      window.HomebaseSettingsContentSections.updateWhatsNewNavBadge(nextVersion);
    }
  }

  function ensureFeedbackDiagnosticButton() {
    if (window.HomebaseSettingsContentSections && typeof window.HomebaseSettingsContentSections.ensureFeedbackDiagnosticButton === 'function') {
      return window.HomebaseSettingsContentSections.ensureFeedbackDiagnosticButton();
    }
  }

  function hydrateAboutVersion() {
    if (typeof document === 'undefined') return;
    const versionEl = document.getElementById('about-version');
    if (!versionEl) return;

    let version = versionEl.dataset.fallback || versionEl.textContent || '';
    try {
      if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getManifest === 'function') {
        const manifest = browser.runtime.getManifest();
        if (manifest && manifest.version) {
          version = manifest.version;
        }
      }
    } catch (_) {}

    if (version) {
      versionEl.textContent = version;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    hydrateAboutVersion();

    if (window.HomebaseSettingsFormController) {
      window.HomebaseSettingsFormController.setupFormListeners();
      window.HomebaseSettingsFormController.setupTipsToggle();
    }

    if (window.HomebaseSettingsPanelController) {
      window.HomebaseSettingsPanelController.setupModalLifecycle({
        onBeforeOpen: () => {
          if (window.HomebaseSettingsFormController) {
            window.HomebaseSettingsFormController.syncTipsToggle();
            window.HomebaseSettingsFormController.snapshotInitialWallpaperState();
          }
        },
        onAfterClose: () => {
          if (window.HomebaseSettingsFormController) {
            window.HomebaseSettingsFormController.syncTipsToggle();
          }
        }
      });
    }
  }

  async function open(options = {}) {
    await ensureDependenciesLoaded();
    init();

    if (window.HomebaseSettingsPanelController) {
      window.HomebaseSettingsPanelController.openAppSettingsModal(options.triggerSource || 'main-settings-btn', {
        onBeforeOpen: () => {
          if (window.HomebaseSettingsFormController) {
            window.HomebaseSettingsFormController.syncTipsToggle();
            window.HomebaseSettingsFormController.snapshotInitialWallpaperState();
          }
        }
      });
    }

    if (typeof updateDefaultEngineVisibilityControl === 'function') {
      updateDefaultEngineVisibilityControl();
    }
    updateWhatsNewNavBadge();
  }

  return {
    init,
    open,
    ensureFeedbackDiagnosticButton
  };
})();
