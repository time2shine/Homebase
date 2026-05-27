const dockGalleryBtn = document.getElementById('dock-gallery-btn');

const addonStoreBtn = document.getElementById('addon-store-btn');

const addonStoreTooltip = document.getElementById('addon-store-tooltip');

const addonStoreIcon = document.getElementById('addon-store-icon');

async function initAddonStoreDockLink() {
  if (!addonStoreBtn || !addonStoreTooltip) return;

  const userAgent = navigator.userAgent || '';

  if (await isFirefoxBrowser()) {
    addonStoreBtn.href = 'https://addons.mozilla.org/';
    addonStoreTooltip.textContent = 'Firefox Add-ons';
    return;
  }

  if (userAgent.includes('Edg/')) {
    addonStoreBtn.href = 'https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home';
    addonStoreTooltip.textContent = 'Edge Add-ons';
    if (addonStoreIcon) {
      addonStoreIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M20.978 11.372a9 9 0 1 0-1.593 5.773"/>
  <path d="M20.978 11.372c.21 2.993-5.034 2.413-6.913 1.486c1.392-1.6.402-4.038-2.274-3.851c-1.745.122-2.927 1.157-2.784 3.202c.28 3.99 4.444 6.205 10.36 4.79"/>
  <path d="M3.022 12.628c-.283-4.043 8.717-7.228 11.248-2.688"/>
  <path d="M12.628 20.978c-2.993.21-5.162-4.725-3.567-9.748"/>
</svg>`;
    }
    return;
  }

  addonStoreBtn.href = 'https://chromewebstore.google.com/category/extensions';
  addonStoreTooltip.textContent = 'Chrome Web Store';
  if (addonStoreIcon) {
    addonStoreIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0"/>
  <path d="M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/>
  <path d="M12 9h8.4"/>
  <path d="M14.598 13.5l-4.2 7.275"/>
  <path d="M9.402 13.5l-4.2-7.275"/>
</svg>`;
  }
}

function setupLazySettingsButton() {
  if (!mainSettingsBtn) return;
  if (mainSettingsBtn.dataset.settingsHandlerAttached === 'true') return;

  mainSettingsBtn.dataset.settingsHandlerAttached = 'true';

  mainSettingsBtn.addEventListener('click', async () => {
    try {
      await loadStylesheetOnce('newtab/styles/settings.css');
      await loadScriptOnce('newtab/settings/settings-ui.js');
      const widgetList = document.getElementById('widget-sub-settings');
      if (widgetList && widgetList.dataset.dragReady !== '1') {
        widgetList.dataset.dragReady = '1';
      }
      if (window.SettingsUI && typeof window.SettingsUI.open === 'function') {
        await window.SettingsUI.open({ triggerSource: 'main-settings-btn' });
        setupWidgetOrderSortable();
      }
    } catch (err) {
      console.warn('Failed to open settings UI', err);
    }
  });
}

function setupDockNavigation() {
  if (document.body.dataset.dockNavigationReady === 'true') return;

  document.body.dataset.dockNavigationReady = 'true';

  const handleDockClick = (id, url, featureKey) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', (event) => {
      openInternalBrowserPage(featureKey, url, event);
    });

  };



  handleDockClick('dock-bookmarks-btn', 'chrome://bookmarks', 'bookmarks');



  handleDockClick('dock-history-btn', 'chrome://history', 'history');



  handleDockClick('dock-downloads-btn', 'chrome://downloads', 'downloads');



  handleDockClick('dock-addons-btn', 'chrome://extensions', 'addons');



  if (nextWallpaperBtn) {

    nextWallpaperBtn.addEventListener('click', async () => {

      if (nextWallpaperBtn.disabled) return;

      setNextWallpaperButtonLoading(true);

      try {

        await ensureDailyWallpaper(true);

        const selection = currentWallpaperSelection;

        const type = await getWallpaperTypePreference();

        await waitForWallpaperReady(selection, type);

      } catch (err) {

        console.warn('Failed to load next wallpaper', err);

      } finally {

        setNextWallpaperButtonLoading(false);

      }

    });

  }



  if (dockGalleryBtn) {

    dockGalleryBtn.addEventListener('click', () => openWallpaperGallery('dock-gallery-btn'));

  }

}
