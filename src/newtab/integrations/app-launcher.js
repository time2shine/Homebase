let firefoxBrowserDetectionPromise = null;

async function isFirefoxBrowser() {
  if (firefoxBrowserDetectionPromise) return firefoxBrowserDetectionPromise;

  firefoxBrowserDetectionPromise = (async () => {
    if (
      typeof browser === 'undefined' ||
      !browser ||
      !browser.runtime ||
      typeof browser.runtime.getBrowserInfo !== 'function'
    ) {
      return false;
    }

    try {
      const info = await browser.runtime.getBrowserInfo();
      return Boolean(info && typeof info.name === 'string' && info.name.toLowerCase().includes('firefox'));
    } catch (err) {
      return false;
    }
  })();

  return firefoxBrowserDetectionPromise;
}

function showFirefoxShortcutInfo(feature) {

  const shortcuts = {

    history: { label: 'History', shortcut: 'Ctrl+H' },

    bookmarks: { label: 'Bookmarks', shortcut: 'Ctrl+Shift+O' },

    downloads: { label: 'Downloads', shortcut: 'Ctrl+J' },

    addons: { label: 'Add-ons', shortcut: 'Ctrl+Shift+A' },

  };

  const normalized = (feature || '').toLowerCase();

  const info = shortcuts[normalized];

  if (!info) return;

  const plainMessage = `Firefox blocks extensions from opening built-in pages like ${info.label}.\n\nUse ${info.shortcut} to open it.`;

  const hasCustomAlert = document.getElementById('custom-alert-modal') && document.getElementById('custom-alert-ok-btn');

  if (hasCustomAlert && typeof showCustomDialog === 'function') {

    showCustomDialog(`${info.label} shortcut`, plainMessage);

    const msgEl = document.getElementById('custom-alert-message');

    if (msgEl) {
      msgEl.replaceChildren();
      msgEl.appendChild(document.createTextNode(`Firefox blocks extensions from opening built-in pages like ${info.label}.`));
      msgEl.appendChild(document.createElement('br'));
      msgEl.appendChild(document.createElement('br'));
      msgEl.appendChild(document.createTextNode('Use '));
      const shortcut = document.createElement('span');
      shortcut.style.color = '#4da3ff';
      shortcut.style.fontWeight = '600';
      shortcut.textContent = info.shortcut;
      msgEl.appendChild(shortcut);
      msgEl.appendChild(document.createTextNode(' to open it.'));

    }

  } else {

    alert(plainMessage);

  }

}

async function openInternalBrowserPage(featureKey, url, event) {
  if (event) event.preventDefault();

  try {
    if (await isFirefoxBrowser()) {
      showFirefoxShortcutInfo(featureKey);
      return;
    }

    if (
      typeof browser !== 'undefined' &&
      browser &&
      browser.tabs &&
      typeof browser.tabs.update === 'function'
    ) {
      await browser.tabs.update({ url });
      return;
    }

    window.location.href = url;
  } catch (err) {
    console.warn(`Failed to open dock destination: ${featureKey}`, err);

    const message = `Could not open ${featureKey}. Try using the browser shortcut instead.`;

    if (typeof showCustomAlert === 'function') {
      showCustomAlert(message);
    } else {
      alert(message);
    }
  }
}

// ===============================================

// --- APP LAUNCHER (Google Apps) ---

// ===============================================

function setupAppLauncher() {

  googleAppsPanel.classList.remove('hidden');



  googleAppsBtn.addEventListener('click', (e) => {

    e.stopPropagation();

    const isOpen = googleAppsPanel.classList.contains('open');



    if (!isOpen) {

      const panelWidth = googleAppsPanel.offsetWidth;

      const rect = googleAppsBtn.getBoundingClientRect();

      googleAppsPanel.style.top = `${rect.bottom + 10}px`;

      const buttonCenterX = rect.left + (rect.width / 2);

      let panelLeft = buttonCenterX - (panelWidth / 2);

      

      const padding = 10;

      if (panelLeft < padding) panelLeft = padding;

      if (panelLeft + panelWidth > window.innerWidth - padding) {

        panelLeft = window.innerWidth - panelWidth - padding;

      }



      googleAppsPanel.style.left = `${panelLeft}px`;

      googleAppsPanel.style.right = 'auto';

      googleAppsPanel.classList.add('open');

    } else {

      googleAppsPanel.classList.remove('open');

    }

  });



  window.addEventListener('click', () => {

    if (googleAppsPanel.classList.contains('open')) {

      googleAppsPanel.classList.remove('open');

    }

  });



  window.addEventListener('resize', () => {

    if (googleAppsPanel.classList.contains('open')) {

      googleAppsPanel.classList.remove('open');

    }

  });



  googleAppsPanel.addEventListener('click', (e) => {

    e.stopPropagation();

  });

}
