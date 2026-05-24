function applyBackgroundDim(value) {
  const parsed = parseInt(value, 10);
  const nextValue = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 90) : 0;

  appBackgroundDimPreference = nextValue;

  const opacity = nextValue / 100;
  document.documentElement.style.setProperty('--bg-dim-opacity', opacity);

  let overlay = document.getElementById('background-dim-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'background-dim-overlay';
    document.body.prepend(overlay);
  }
}


// --- Function to inject CSS ---
function applyGlassStyle(styleId) {
  appGlassStylePreference = styleId || 'original';
  if (isPerformanceModeEnabled()) return;
  const styleData = GLASS_STYLES.find(s => s.id === appGlassStylePreference) || GLASS_STYLES[0];
  
  let styleEl = document.getElementById('dynamic-glass-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-glass-style';
    document.head.appendChild(styleEl);
  }

  // We override the .glass-box class directly
  styleEl.textContent = `
    .glass-box {
      ${styleData.css}
      transition: all 0.3s ease, transform 0.2s ease, opacity 0.2s ease !important;
    }
  `;
}

// --- Function to Load Preference ---
async function loadGlassStylePref() {
  try {
    const stored = await browser.storage.local.get(APP_GLASS_STYLE_KEY);
    const pref = stored[APP_GLASS_STYLE_KEY];
    applyGlassStyle(pref || 'original');
  } catch (e) {
    applyGlassStyle('original');
  }
}


/**
 * Injects the chosen animation keyframes into the page style.
 * This overrides the default @keyframes item-fade-in in new-tab.css
 */
function applyGridAnimation(animationKey) {
  appGridAnimationPreference = animationKey || 'default';
  if (isPerformanceModeEnabled()) return;
  const animData = GRID_ANIMATIONS[appGridAnimationPreference] || GRID_ANIMATIONS['default'];
  
  let styleEl = document.getElementById('dynamic-grid-animation');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-grid-animation';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    @keyframes item-fade-in {
      ${animData.css}
    }
  `;
}

async function loadGridAnimationPref() {
  try {
    const stored = await browser.storage.local.get(APP_GRID_ANIMATION_KEY);
    const pref = stored[APP_GRID_ANIMATION_KEY];
    applyGridAnimation(pref);
  } catch (e) {
    applyGridAnimation('default');
  }
}

function applyGridAnimationEnabled(enabled) {
  appGridAnimationEnabledPreference = enabled;
  if (isPerformanceModeEnabled()) return;
  document.body.classList.toggle('grid-animation-enabled', enabled);
  updateGridAnimationSettingsUI();
}

function applyGridAnimationSpeed(seconds) {
  // Ensure it's a valid number
  const validSeconds = parseFloat(seconds) || 0.3;
  appGridAnimationSpeedPreference = validSeconds;
  if (isPerformanceModeEnabled()) return;
  
  // Update CSS Variable globally
  document.documentElement.style.setProperty('--grid-animation-duration', `${validSeconds}s`);
  
  // Update Settings UI text if visible
  const label = document.getElementById('app-grid-animation-speed-value');
  const slider = document.getElementById('app-grid-animation-speed-slider');
  
  if (label) label.textContent = `${validSeconds}s`;
  if (slider) slider.value = validSeconds;
}

function updateGridAnimationSettingsUI() {
  const container = document.getElementById('grid-animation-sub-settings');
  const toggle = document.getElementById('app-grid-animation-toggle');
  
  if (toggle) {
    toggle.checked = appGridAnimationEnabledPreference;
  }
  
  if (container) {
    setSubSettingsExpanded(container, appGridAnimationEnabledPreference);
  }
}
