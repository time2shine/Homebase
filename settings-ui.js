window.SettingsUI = (() => {
  let initialized = false;
  const PANELS_WITHOUT_ACTIONS = new Set(['backup', 'support', 'whats-new', 'pro-tips', 'about', 'privacy']);
  const WHATS_NEW_SECTION = 'whats-new';
  const PRO_TIPS_SECTION = 'pro-tips';
  const WHATS_NEW_STORAGE_KEY = 'lastSeenWhatsNewVersion';
  const WHATS_NEW_LATEST_STORAGE_KEY = 'latestKnownWhatsNewVersion';
  const QR_MODAL_ANIM_MS = 220;
  const supportQrModal = document.getElementById('support-qr-modal');
  const supportQrModalDialog = supportQrModal ? supportQrModal.querySelector('.support-qr-modal__dialog') : null;
  const supportQrModalImg = supportQrModal ? supportQrModal.querySelector('.support-qr-modal__img') : null;
  const supportQrModalClose = supportQrModal ? supportQrModal.querySelector('.support-qr-modal__close') : null;
  let supportQrModalTimer = null;
  let lastSupportQrEl = null;
  let whatsNewChangelogCache = null;
  let whatsNewChangelogPromise = null;
  let privacyPolicyCache = null;
  let privacyPolicyFetchPromise = null;
  let openProTipId = '';

  function setSupportQrModalVars(qrEl) {
    if (!supportQrModal || !supportQrModalDialog || !qrEl) return;
    const rect = qrEl.getBoundingClientRect();
    const dialogRect = supportQrModalDialog.getBoundingClientRect();
    const dialogWidth = dialogRect.width || 1;
    const dialogHeight = dialogRect.height || 1;
    const qrCenterX = rect.left + rect.width / 2;
    const qrCenterY = rect.top + rect.height / 2;
    const dialogCenterX = dialogRect.left + dialogRect.width / 2;
    const dialogCenterY = dialogRect.top + dialogRect.height / 2;
    const translateX = qrCenterX - dialogCenterX;
    const translateY = qrCenterY - dialogCenterY;
    const scaleX = rect.width / dialogWidth;
    const scaleY = rect.height / dialogHeight;
    const scale = Math.max(Math.min(scaleX, scaleY, 1), 0.1);

    supportQrModal.style.setProperty('--qr-x', `${translateX}px`);
    supportQrModal.style.setProperty('--qr-y', `${translateY}px`);
    supportQrModal.style.setProperty('--qr-w', `${rect.width}px`);
    supportQrModal.style.setProperty('--qr-h', `${rect.height}px`);
    supportQrModal.style.setProperty('--qr-scale', `${scale}`);
    supportQrModal.style.setProperty('--qr-modal-duration', `${QR_MODAL_ANIM_MS}ms`);
  }

  function openSupportQrModal(qrEl) {
    if (!supportQrModal || !supportQrModalImg || !qrEl) return;
    const src = qrEl.getAttribute('src');
    if (!src) return;
    const alt = qrEl.getAttribute('alt');

    if (supportQrModalTimer) {
      window.clearTimeout(supportQrModalTimer);
      supportQrModalTimer = null;
    }

    lastSupportQrEl = qrEl;
    supportQrModalImg.src = src;
    supportQrModalImg.alt = alt || 'Support QR code';
    supportQrModal.classList.remove('is-hidden', 'is-closing', 'is-open');
    supportQrModal.classList.add('is-opening');

    requestAnimationFrame(() => {
      setSupportQrModalVars(qrEl);
      requestAnimationFrame(() => {
        supportQrModal.classList.remove('is-opening');
        supportQrModal.classList.add('is-open');
      });
    });
  }

  function closeSupportQrModal() {
    if (!supportQrModal || supportQrModal.classList.contains('is-hidden')) return;

    if (supportQrModalTimer) {
      window.clearTimeout(supportQrModalTimer);
      supportQrModalTimer = null;
    }

    if (lastSupportQrEl) {
      setSupportQrModalVars(lastSupportQrEl);
    }

    supportQrModal.classList.remove('is-opening', 'is-open');
    supportQrModal.classList.add('is-closing');

    supportQrModalTimer = window.setTimeout(() => {
      supportQrModal.classList.add('is-hidden');
      supportQrModal.classList.remove('is-closing');
      if (supportQrModalImg) {
        supportQrModalImg.removeAttribute('src');
        supportQrModalImg.removeAttribute('alt');
      }
    }, QR_MODAL_ANIM_MS);
  }

  function getWhatsNewData() {
    if (typeof WHATS_NEW !== 'object' || !WHATS_NEW) return null;
    const version = typeof WHATS_NEW.version === 'string' ? WHATS_NEW.version : '';
    const date = typeof WHATS_NEW.date === 'string' ? WHATS_NEW.date : '';
    const items = Array.isArray(WHATS_NEW.items) ? WHATS_NEW.items : [];
    return { version, date, items };
  }

  function getLastSeenWhatsNewVersion() {
    try {
      return localStorage.getItem(WHATS_NEW_STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function getLatestKnownWhatsNewVersion() {
    try {
      return localStorage.getItem(WHATS_NEW_LATEST_STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function setLatestKnownWhatsNewVersion(version) {
    if (!version) return;
    try {
      localStorage.setItem(WHATS_NEW_LATEST_STORAGE_KEY, version);
    } catch (err) {
      // Best-effort only; skip if storage is unavailable.
    }
  }

  function normalizeWhatsNewType(value) {
    const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (raw === 'IMPROVED') return 'IMPROVED';
    if (raw === 'FIX' || raw === 'FIXED') return 'FIX';
    if (raw === 'ADDED' || raw === 'NEW') return 'NEW';
    return 'NEW';
  }

  function parseChangelogMarkdown(markdown) {
    if (typeof markdown !== 'string' || !markdown.trim()) return null;
    const lines = markdown.split(/\r?\n/);
    const releases = [];
    let currentRelease = null;
    let currentSection = '';
    const releaseHeaderRe = /^##\s+v?(\d+\.\d+\.\d+)(?:\s*(?:-|\u2013|\u2014|\u00e2\u20ac\u201d)\s*(\d{4}-\d{2}-\d{2}))?/i;
    const sectionRe = /^###\s+(Added|Improved|Fixed)\s*$/i;
    const bulletRe = /^-\s+(.*)$/;

    function flushRelease() {
      if (!currentRelease) return;
      releases.push(currentRelease);
      currentRelease = null;
    }

    lines.forEach((line) => {
      const headerMatch = line.match(releaseHeaderRe);
      if (headerMatch) {
        flushRelease();
        currentRelease = {
          version: headerMatch[1] || '',
          date: headerMatch[2] || '',
          items: []
        };
        currentSection = '';
        return;
      }

      if (!currentRelease) return;

      const sectionMatch = line.match(sectionRe);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        return;
      }

      const bulletMatch = line.match(bulletRe);
      if (!bulletMatch) return;

      let text = bulletMatch[1].trim();
      if (!text) return;

      let section = currentSection;
      const legacyMatch = text.match(/^\*\*(Added|Improved|Fixed)\s*:\*\*\s*(.+)$/i);
      if (legacyMatch) {
        section = legacyMatch[1];
        text = legacyMatch[2].trim();
      }

      if (!text) return;

      currentRelease.items.push({
        type: normalizeWhatsNewType(section),
        title: text,
        section: section || ''
      });
    });

    flushRelease();

    if (!releases.length) return null;
    return { releases };
  }

  async function loadWhatsNewChangelog() {
    if (whatsNewChangelogCache) return whatsNewChangelogCache;
    if (whatsNewChangelogPromise) return whatsNewChangelogPromise;

    const runtime = (typeof browser !== 'undefined' && browser.runtime)
      ? browser.runtime
      : (typeof chrome !== 'undefined' && chrome.runtime)
        ? chrome.runtime
        : null;

    if (!runtime || typeof runtime.getURL !== 'function') {
      return null;
    }

    whatsNewChangelogPromise = (async () => {
      const response = await fetch(runtime.getURL('CHANGELOG.md'));
      if (!response.ok) {
        throw new Error('Failed to load changelog');
      }
      const markdown = await response.text();
      const parsed = parseChangelogMarkdown(markdown);
      if (!parsed || !Array.isArray(parsed.releases) || !parsed.releases.length) {
        throw new Error('Invalid changelog data');
      }
      return parsed;
    })();

    try {
      const parsed = await whatsNewChangelogPromise;
      whatsNewChangelogCache = parsed;
      return parsed;
    } catch (err) {
      return null;
    } finally {
      whatsNewChangelogPromise = null;
    }
  }

  function getWhatsNewBadgeClass(type) {
    switch (type) {
      case 'IMPROVED':
        return 'app-settings-whatsnew-badge--improved';
      case 'FIX':
        return 'app-settings-whatsnew-badge--fix';
      default:
        return 'app-settings-whatsnew-badge--new';
    }
  }

  function updateWhatsNewNavBadge(nextVersion) {
    const badgeEl = document.getElementById('whats-new-nav-badge');
    if (!badgeEl) return;

    const data = getWhatsNewData();
    const latestKnownVersion = getLatestKnownWhatsNewVersion() || (data && data.version) || '';
    const currentVersion = typeof nextVersion === 'string' && nextVersion
      ? nextVersion
      : latestKnownVersion;

    if (!currentVersion) {
      badgeEl.classList.add('is-hidden');
      return;
    }

    const lastSeen = getLastSeenWhatsNewVersion();
    badgeEl.classList.toggle('is-hidden', lastSeen === currentVersion);
  }

  function markWhatsNewSeen(version) {
    const data = getWhatsNewData();
    const nextVersion = typeof version === 'string' && version
      ? version
      : (data && data.version) || '';
    if (!nextVersion) return;
    try {
      localStorage.setItem(WHATS_NEW_STORAGE_KEY, nextVersion);
    } catch (err) {
      // Best-effort only; skip if storage is unavailable.
    }
    updateWhatsNewNavBadge(nextVersion);
  }

  function createWhatsNewItemElement(type, title, desc) {
    const normalizedType = normalizeWhatsNewType(type);
    const itemTitle = title == null ? '' : String(title);
    const itemDesc = desc == null ? '' : String(desc);

    const row = document.createElement('div');
    row.className = 'app-settings-whatsnew-item';

    const badge = document.createElement('span');
    badge.className = `app-settings-whatsnew-badge ${getWhatsNewBadgeClass(normalizedType)}`;
    badge.textContent = normalizedType;

    const content = document.createElement('div');
    content.className = 'app-settings-whatsnew-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'app-settings-whatsnew-item-title';
    titleEl.textContent = itemTitle;

    content.appendChild(titleEl);

    if (itemDesc) {
      const descEl = document.createElement('div');
      descEl.className = 'app-settings-whatsnew-item-desc';
      descEl.textContent = itemDesc;
      content.appendChild(descEl);
    }

    row.appendChild(badge);
    row.appendChild(content);

    return row;
  }

  function createWhatsNewReleaseHeaderElement(release) {
    const header = document.createElement('div');
    header.className = 'app-settings-whatsnew-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'app-settings-whatsnew-title';
    titleEl.textContent = release && release.version ? release.version : '-';

    const meta = document.createElement('div');
    meta.className = 'app-settings-whatsnew-meta';

    const dateLine = document.createElement('div');
    dateLine.className = 'app-settings-whatsnew-line';

    const dateLabel = document.createElement('span');
    dateLabel.className = 'app-settings-whatsnew-label';
    dateLabel.textContent = 'Last updated';

    const dateValue = document.createElement('span');
    dateValue.className = 'app-settings-whatsnew-value';
    dateValue.textContent = release && release.date ? release.date : '-';

    dateLine.appendChild(dateLabel);
    dateLine.appendChild(dateValue);
    meta.appendChild(dateLine);

    header.appendChild(titleEl);
    header.appendChild(meta);

    return header;
  }

  async function renderWhatsNewSection() {
    const versionEl = document.getElementById('whats-new-version');
    const dateEl = document.getElementById('whats-new-date');
    const listEl = document.getElementById('whats-new-list');
    if (!versionEl || !dateEl || !listEl) return;

    const changelog = await loadWhatsNewChangelog();
    const releases = changelog && Array.isArray(changelog.releases) ? changelog.releases : null;

    listEl.innerHTML = '';

    if (releases && releases.length) {
      const latestRelease = releases[0];
      const latestVersion = latestRelease && latestRelease.version ? latestRelease.version : '';
      const latestDate = latestRelease && latestRelease.date ? latestRelease.date : '';

      versionEl.textContent = latestVersion || '-';
      dateEl.textContent = latestDate || '-';
      if (latestVersion) {
        setLatestKnownWhatsNewVersion(latestVersion);
      }

      let totalItems = 0;

      releases.forEach((release) => {
        if (!release) return;
        listEl.appendChild(createWhatsNewReleaseHeaderElement(release));

        const items = Array.isArray(release.items) ? release.items : [];
        items.forEach((item) => {
          if (!item) return;
          const row = createWhatsNewItemElement(item.type, item.title, item.desc);
          listEl.appendChild(row);
          totalItems += 1;
        });
      });

      if (!totalItems) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'app-settings-whatsnew-empty';
        emptyEl.textContent = 'No updates listed yet.';
        listEl.appendChild(emptyEl);
      }

      markWhatsNewSeen(latestVersion);

      return;
    }

    const data = getWhatsNewData();
    if (!data) return;

    versionEl.textContent = data.version || '-';
    dateEl.textContent = data.date || '-';

    const items = data.items.slice(0, 5);
    if (!items.length) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'app-settings-whatsnew-empty';
      emptyEl.textContent = 'No updates listed yet.';
      listEl.appendChild(emptyEl);
      return;
    }

    items.forEach((item) => {
      if (!item) return;
      const row = createWhatsNewItemElement(item.type, item.title, item.desc);
      listEl.appendChild(row);
    });

    markWhatsNewSeen(data.version);
  }

  function createProTipsNavItem() {
    const navItem = document.createElement('button');
    navItem.className = 'app-settings-nav-item';
    navItem.dataset.section = PRO_TIPS_SECTION;
    navItem.innerHTML = `
      <span class="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.09 14.37a5 5 0 1 0-6.18 0A7 7 0 0 0 5 21h14a7 7 0 0 0-3.91-6.63"></path><path d="M12 7h.01"></path></svg>
      </span>
      <span class="nav-label">Pro Tips</span>
    `;
    return navItem;
  }

  function createProTipsSection() {
    const section = document.createElement('section');
    section.className = 'app-settings-section';
    section.dataset.section = PRO_TIPS_SECTION;

    const header = document.createElement('div');
    header.className = 'app-settings-whatsnew-header';

    const title = document.createElement('div');
    title.className = 'app-settings-whatsnew-title';
    title.textContent = 'Pro Tips';
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'app-settings-whatsnew-meta';
    const line = document.createElement('div');
    line.className = 'app-settings-whatsnew-line';
    line.textContent = 'Tips are filtered by enabled settings when available.';
    meta.appendChild(line);
    header.appendChild(meta);
    section.appendChild(header);

    const list = document.createElement('div');
    list.id = 'pro-tips-list';
    list.className = 'app-settings-protips-list';
    list.setAttribute('aria-live', 'polite');
    section.appendChild(list);

    section.addEventListener('click', (e) => {
      const trigger = e.target.closest('.app-settings-protip-toggle');
      if (!trigger) return;
      const tipId = trigger.dataset.tipId;
      if (!tipId) return;
      openProTipId = openProTipId === tipId ? '' : tipId;
      renderProTipsSection();
    });

    return section;
  }

  function readSettingStateById(settingId) {
    if (typeof settingId !== 'string' || !settingId) return null;
    const el = document.getElementById(settingId);
    if (!el) return null;

    if (el.matches('input[type="checkbox"]')) {
      return !!el.checked;
    }

    if (el.matches('select')) {
      const value = typeof el.value === 'string' ? el.value.trim() : '';
      if (!value) return null;
      if (value === '0' || value === 'false' || value === 'off' || value === 'none' || value === 'never' || value === 'disabled') {
        return false;
      }
      return true;
    }

    return true;
  }

  function resolveSettingKeyEnabled(settingKey) {
    switch (settingKey) {
      case 'APP_SEARCH_MATH_KEY':
        if (typeof appSearchMathPreference !== 'undefined') return !!appSearchMathPreference;
        return readSettingStateById('app-search-math-toggle');
      case 'APP_DEBUG_PERF_OVERLAY_KEY':
        if (typeof debugPerfOverlayPreference !== 'undefined') return !!debugPerfOverlayPreference;
        return readSettingStateById('app-perf-debug-overlay-toggle');
      case 'APP_SHOW_SIDEBAR_KEY':
        if (typeof appShowSidebarPreference !== 'undefined') return !!appShowSidebarPreference;
        return readSettingStateById('app-show-sidebar-toggle');
      case 'APP_SHOW_WEATHER_KEY':
        if (typeof appShowWeatherPreference !== 'undefined') return !!appShowWeatherPreference;
        return readSettingStateById('app-show-weather-toggle');
      case 'APP_SHOW_QUOTE_KEY':
        if (typeof appShowQuotePreference !== 'undefined') return !!appShowQuotePreference;
        return readSettingStateById('app-show-quote-toggle');
      case 'APP_SHOW_NEWS_KEY':
        if (typeof appShowNewsPreference !== 'undefined') return !!appShowNewsPreference;
        return readSettingStateById('app-show-news-toggle');
      case 'APP_SHOW_TODO_KEY':
        if (typeof appShowTodoPreference !== 'undefined') return !!appShowTodoPreference;
        return readSettingStateById('app-show-todo-toggle');
      case 'APP_NEWS_SOURCE_KEY':
        if (typeof appShowNewsPreference !== 'undefined' && !appShowNewsPreference) return false;
        return readSettingStateById('news-source-select');
      case 'APP_SINGLETON_MODE_KEY':
        if (typeof appSingletonModePreference !== 'undefined') return !!appSingletonModePreference;
        return readSettingStateById('app-singleton-mode-toggle');
      case 'APP_MAX_TABS_KEY':
        if (typeof appMaxTabsPreference !== 'undefined') return Number(appMaxTabsPreference) > 0;
        return readSettingStateById('app-max-tabs-select');
      case 'APP_AUTOCLOSE_KEY':
        if (typeof appAutoClosePreference !== 'undefined') return Number(appAutoClosePreference) > 0;
        return readSettingStateById('app-autoclose-select');
      default:
        return null;
    }
  }

  function evaluateTipSettingKeys(settingKeys) {
    if (!Array.isArray(settingKeys) || !settingKeys.length) return null;
    let resolved = false;
    for (const key of settingKeys) {
      const enabled = resolveSettingKeyEnabled(typeof key === 'string' ? key.trim() : '');
      if (enabled === true) return true;
      if (enabled === false) resolved = true;
    }
    return resolved ? false : null;
  }

  function evaluateTipSettingIds(settingIds) {
    if (!Array.isArray(settingIds) || !settingIds.length) return null;
    let resolved = false;
    for (const id of settingIds) {
      const state = readSettingStateById(typeof id === 'string' ? id.trim() : '');
      if (state === true) return true;
      if (state === false) resolved = true;
    }
    return resolved ? false : null;
  }

  function shouldIncludeTip(tip) {
    const keysResult = evaluateTipSettingKeys(tip.settingKeys);
    const idsResult = evaluateTipSettingIds(tip.settingIds);

    if (keysResult === false || idsResult === false) {
      return false;
    }

    if (keysResult === null && idsResult === null) {
      return true;
    }

    return keysResult !== false && idsResult !== false;
  }

  function getFilteredProTips() {
    const sourceTips = Array.isArray(window.HOMEBASE_TIPS) ? window.HOMEBASE_TIPS : [];
    const uniqueTips = [];
    const seenIds = new Set();

    sourceTips.forEach((tip) => {
      if (!tip || tip.id == null) return;
      const id = String(tip.id).trim();
      if (!id || seenIds.has(id)) return;
      if (id === 'welcome-tip') return;
      seenIds.add(id);

      const title = tip.title == null ? '' : String(tip.title).trim();
      const body = tip.body == null ? '' : String(tip.body).trim();
      if (!title && !body) return;

      uniqueTips.push({
        id,
        title: title || 'Untitled tip',
        body,
        settingKeys: Array.isArray(tip.settingKeys) ? tip.settingKeys : [],
        settingIds: Array.isArray(tip.settingIds) ? tip.settingIds : []
      });
    });

    return uniqueTips.filter(shouldIncludeTip);
  }

  function renderProTipsSection() {
    const listEl = document.getElementById('pro-tips-list');
    if (!listEl) return;

    const tips = getFilteredProTips();
    listEl.textContent = '';

    if (!tips.length) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'app-settings-whatsnew-empty';
      emptyEl.textContent = 'No tips available for the currently enabled settings.';
      listEl.appendChild(emptyEl);
      openProTipId = '';
      return;
    }

    if (!tips.some((tip) => tip.id === openProTipId)) {
      openProTipId = '';
    }

    tips.forEach((tip) => {
      const isOpen = openProTipId === tip.id;
      const item = document.createElement('article');
      item.className = 'app-settings-protip-item';
      item.classList.toggle('is-open', isOpen);

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'app-settings-protip-toggle';
      trigger.dataset.tipId = tip.id;
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      const title = document.createElement('span');
      title.className = 'app-settings-protip-title';
      title.textContent = tip.title;

      const indicator = document.createElement('span');
      indicator.className = 'app-settings-protip-indicator';
      indicator.textContent = isOpen ? '-' : '+';

      trigger.appendChild(title);
      trigger.appendChild(indicator);
      item.appendChild(trigger);

      const body = document.createElement('div');
      body.className = 'app-settings-protip-body';
      body.hidden = !isOpen;
      body.textContent = tip.body;
      item.appendChild(body);

      listEl.appendChild(item);
    });
  }

  function setActiveAppSettingsSection(section = 'general') {
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

    if (section === WHATS_NEW_SECTION) {
      renderWhatsNewSection();
      return;
    }

    if (section === PRO_TIPS_SECTION) {
      renderProTipsSection();
    }
  }

  function createPrivacyNavItem() {
    const navItem = document.createElement('button');
    navItem.className = 'app-settings-nav-item';
    navItem.dataset.section = 'privacy';
    navItem.innerHTML = `
      <span class="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      </span>
      <span class="nav-label">Privacy</span>
    `;
    return navItem;
  }

  function createPrivacySection() {
    const section = document.createElement('section');
    section.className = 'app-settings-section';
    section.dataset.section = 'privacy';

    const header = document.createElement('div');
    header.className = 'app-settings-about-header';
    const title = document.createElement('div');
    title.className = 'app-settings-about-title';
    title.textContent = 'Privacy';
    header.appendChild(title);
    section.appendChild(header);

    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'app-settings-about-block';
    const summaryHeading = document.createElement('div');
    summaryHeading.className = 'app-settings-about-heading';
    summaryHeading.textContent = 'Summary';
    const summaryList = document.createElement('ul');
    summaryList.className = 'app-settings-about-list';
    ['Homebase does not sell personal data.', 'No analytics or tracking.', 'Most data stays on your device.']
      .forEach((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        summaryList.appendChild(item);
      });
    summaryBlock.appendChild(summaryHeading);
    summaryBlock.appendChild(summaryList);
    section.appendChild(summaryBlock);

    const storageBlock = document.createElement('div');
    storageBlock.className = 'app-settings-about-block';
    const storageHeading = document.createElement('div');
    storageHeading.className = 'app-settings-about-heading';
    storageHeading.textContent = 'What Homebase stores locally';
    const storageList = document.createElement('ul');
    storageList.className = 'app-settings-about-list';
    [
      'Your settings (enabled widgets, preferences, UI configuration)',
      'Cached content for faster loading (e.g., recently fetched news items)',
      'Wallpaper selections and cached wallpaper assets',
      'Cached media files (images and videos) stored locally to support wallpapers and fast loading'
    ].forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      storageList.appendChild(item);
    });
    storageBlock.appendChild(storageHeading);
    storageBlock.appendChild(storageList);
    section.appendChild(storageBlock);

    const networkBlock = document.createElement('div');
    networkBlock.className = 'app-settings-about-block';
    const networkHeading = document.createElement('div');
    networkHeading.className = 'app-settings-about-heading';
    networkHeading.textContent = 'Network requests';
    const networkText = document.createElement('p');
    networkText.textContent = 'Network requests occur only to provide enabled features (news feeds, weather, wallpaper media, search suggestions).';
    networkBlock.appendChild(networkHeading);
    networkBlock.appendChild(networkText);
    section.appendChild(networkBlock);

    const policyBlock = document.createElement('div');
    policyBlock.className = 'app-settings-about-block';
    const policyHeading = document.createElement('div');
    policyHeading.className = 'app-settings-about-heading';
    policyHeading.textContent = 'Full policy';
    const policyText = document.createElement('p');
    const policyButton = document.createElement('button');
    policyButton.type = 'button';
    policyButton.className = 'app-settings-about-link app-settings-privacy-policy-toggle';
    policyButton.textContent = 'Show';
    policyText.appendChild(policyButton);
    const policyContent = document.createElement('pre');
    policyContent.className = 'app-settings-privacy-policy-text';
    policyContent.style.whiteSpace = 'pre-wrap';
    policyContent.style.maxHeight = '260px';
    policyContent.style.overflow = 'auto';
    policyContent.style.marginTop = '10px';
    policyContent.style.display = 'none';
    policyBlock.appendChild(policyHeading);
    policyBlock.appendChild(policyText);
    policyBlock.appendChild(policyContent);
    section.appendChild(policyBlock);

    return section;
  }

  function loadPrivacyPolicyInto(contentEl) {
    if (!contentEl) return;

    if (privacyPolicyCache !== null) {
      contentEl.textContent = privacyPolicyCache;
      contentEl.dataset.loaded = '1';
      return;
    }

    if (privacyPolicyFetchPromise) {
      privacyPolicyFetchPromise
        .then((text) => {
          contentEl.textContent = text;
          contentEl.dataset.loaded = '1';
        })
        .catch(() => {
          contentEl.textContent = 'Unable to load privacy policy.';
        });
      return;
    }

    const runtime = (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getURL === 'function')
      ? browser.runtime
      : (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
        ? chrome.runtime
        : null;

    if (!runtime) {
      contentEl.textContent = 'Unable to load privacy policy.';
      return;
    }

    const policyUrl = runtime.getURL('PRIVACY.md');
    contentEl.textContent = 'Loading...';

    privacyPolicyFetchPromise = fetch(policyUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch privacy policy');
        return res.text();
      })
      .then((text) => {
        privacyPolicyCache = text;
        return text;
      })
      .finally(() => {
        privacyPolicyFetchPromise = null;
      });

    privacyPolicyFetchPromise
      .then((text) => {
        contentEl.textContent = text;
        contentEl.dataset.loaded = '1';
      })
      .catch(() => {
        contentEl.textContent = 'Unable to load privacy policy.';
      });
  }

  function handlePrivacyPolicyClick(btn) {
    const section = btn.closest('.app-settings-section');
    if (!section) return;
    const contentEl = section.querySelector('.app-settings-privacy-policy-text');
    if (!contentEl) return;

    const isHidden = contentEl.style.display === 'none';
    if (isHidden) {
      contentEl.style.display = 'block';
      btn.textContent = 'Hide';
      if (contentEl.dataset.loaded !== '1') {
        loadPrivacyPolicyInto(contentEl);
      }
      return;
    }

    contentEl.style.display = 'none';
    btn.textContent = 'Show';
  }

  function ensureSettingsSectionOrder() {
    const appSettingsContent = document.querySelector('.app-settings-content');
    if (!appSettingsNav || !appSettingsContent) return;

    const navOrder = ['backup', 'whats-new', PRO_TIPS_SECTION, 'support', 'privacy', 'about'];
    const navItems = new Map();

    navOrder.forEach((section) => {
      let item = appSettingsNav.querySelector(`.app-settings-nav-item[data-section="${section}"]`);
      if (!item) {
        if (section === 'privacy') {
          item = createPrivacyNavItem();
        } else if (section === PRO_TIPS_SECTION) {
          item = createProTipsNavItem();
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

    const panelOrder = ['backup', 'whats-new', PRO_TIPS_SECTION, 'support', 'privacy', 'about'];
    const panelItems = new Map();

    panelOrder.forEach((section) => {
      let panel = appSettingsContent.querySelector(`.app-settings-section[data-section="${section}"]`);
      if (!panel) {
        if (section === 'privacy') {
          panel = createPrivacySection();
        } else if (section === PRO_TIPS_SECTION) {
          panel = createProTipsSection();
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

  function setupWidgetOrderSortable() {
    const widgetList = document.getElementById('widget-sub-settings');
    if (!widgetList) return;
    if (typeof ensureSubSettingsInner === 'function') {
      ensureSubSettingsInner(widgetList);
    }
    const widgetInner = widgetList.querySelector('.sub-settings-inner') || widgetList;
    widgetInner.classList.add('settings-list-grid');

    const hasSortable = typeof widgetSettingsSortable !== 'undefined' && widgetSettingsSortable;
    if (widgetList.dataset.dragReady === '1' && hasSortable) return;

    const commitWidgetOrder = () => {
      const order = Array.from(widgetInner.querySelectorAll('.widget-setting-row'))
        .map((row) => row.dataset.widgetId)
        .filter(Boolean);

      if (!order.length) return;

      if (typeof setWidgetOrderPreference === 'function') {
        setWidgetOrderPreference(order, { persist: true });
        return;
      }

      if (browser?.storage?.local) {
        browser.storage.local
          .set({ widgetOrder: order })
          .catch((err) => console.warn('Failed to save widget order', err));
      }
    };

    if (typeof widgetSettingsSortable !== 'undefined' && widgetSettingsSortable) {
      widgetSettingsSortable.destroy();
      widgetSettingsSortable = null;
    }

    if (typeof initUnifiedSortable !== 'function') return;

    const sortableInstance = initUnifiedSortable(widgetInner, commitWidgetOrder);
    if (typeof widgetSettingsSortable !== 'undefined') {
      widgetSettingsSortable = sortableInstance;
    }
    widgetList.dataset.dragReady = '1';
  }

  function setupWidgetOrderDrag() {
    setupWidgetOrderSortable();
  }

  if (typeof window !== 'undefined') {
    window.setupWidgetOrderSortable = setupWidgetOrderSortable;
  }

  function hydrateAboutVersion() {
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
    } catch (err) {
      // Best-effort only; leave fallback in place.
    }

    if (version) {
      versionEl.textContent = version;
    }
  }

  function openAppSettingsModal(triggerSource = 'main-settings-btn') {
    if (!appSettingsModal) return;

    syncAppSettingsForm();
    setActiveAppSettingsSection('general');

    initialWallpaperState = {
      daily: appDailyToggle ? appDailyToggle.checked : dailyRotationPreference,
      type: appWallpaperTypeSelect ? appWallpaperTypeSelect.value : (wallpaperTypePreference || 'video'),
      quality: appWallpaperQualitySelect ? appWallpaperQualitySelect.value : (wallpaperQualityPreference || 'low')
    };

    openModalWithAnimation('app-settings-modal', triggerSource, '.app-settings-dialog');
  }

  function closeAppSettingsModal() {
    if (!appSettingsModal) return;

    closeModalWithAnimation('app-settings-modal', '.app-settings-dialog', () => {
      syncAppSettingsForm();
    });
  }

  function setupAppSettingsModal() {
    if (!appSettingsModal || !mainSettingsBtn) return;

    hydrateAboutVersion();
    setupWidgetOrderDrag();

    if (appSearchRememberEngineToggle) {
      appSearchRememberEngineToggle.addEventListener('change', updateDefaultEngineVisibilityControl);
    }

    if (appSettingsCloseBtn) {
      appSettingsCloseBtn.addEventListener('click', closeAppSettingsModal);
    }
    if (appSettingsCancelBtn) {
      appSettingsCancelBtn.addEventListener('click', closeAppSettingsModal);
    }
    if (appSettingsModal) {
      appSettingsModal.addEventListener('click', (e) => {
        if (e.target === appSettingsModal) {
          closeAppSettingsModal();
          return;
        }

        const privacyPolicyBtn = e.target.closest('.app-settings-privacy-policy-toggle');
        if (privacyPolicyBtn) {
          handlePrivacyPolicyClick(privacyPolicyBtn);
          return;
        }

        const qrImage = e.target.closest('.app-settings-support-qr');
        if (qrImage) {
          openSupportQrModal(qrImage);
          return;
        }

        const copyButton = e.target.closest('.app-settings-support-copy');
        if (!copyButton) return;

        const copyValue = copyButton.dataset.copy;
        if (!copyValue || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return;

        navigator.clipboard.writeText(copyValue).then(() => {
          copyButton.textContent = 'Copied';
          window.setTimeout(() => {
            copyButton.textContent = 'Copy';
          }, 900);
        }).catch(() => {});
      });
    }
    if (supportQrModal) {
      supportQrModal.addEventListener('click', (e) => {
        if (e.target === supportQrModal) {
          closeSupportQrModal();
        }
      });
    }
    if (supportQrModalClose) {
      supportQrModalClose.addEventListener('click', closeSupportQrModal);
    }
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
    if (appSidebarToggle) {
      appSidebarToggle.addEventListener('change', (e) => {
        applySidebarVisibility(e.target.checked);
        applyWidgetVisibility();
      });
    }
    if (appWeatherToggle) {
      appWeatherToggle.addEventListener('change', (e) => {
        setWeatherPreference(e.target.checked);
      });
    }
    if (appQuoteToggle) {
      appQuoteToggle.addEventListener('change', (e) => {
        setQuotePreference(e.target.checked);
      });
    }
    if (appNewsToggle) {
      appNewsToggle.addEventListener('change', (e) => {
        setNewsPreference(e.target.checked);
      });
    }
    if (appDimSlider) {
      appDimSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        applyBackgroundDim(val);
        if (appDimLabel) {
          appDimLabel.textContent = `${appBackgroundDimPreference}%`;
        }
      });

      appDimSlider.addEventListener('change', async (e) => {
        const val = parseInt(e.target.value, 10);
        applyBackgroundDim(val);
        if (appDimLabel) {
          appDimLabel.textContent = `${appBackgroundDimPreference}%`;
        }
        if (appDimSlider.value !== String(appBackgroundDimPreference)) {
          appDimSlider.value = appBackgroundDimPreference;
        }
        // Instant-load mirror for preload.js (sync)
        try {
          if (window.localStorage) {
            localStorage.setItem('fast-bg-dim', String(appBackgroundDimPreference));
          }
        } catch (err) {
          // Ignore; instant mirror is best-effort only
        }
        try {
          await browser.storage.local.set({ [APP_BACKGROUND_DIM_KEY]: appBackgroundDimPreference });
        } catch (err) {
          console.warn('Failed to save background dim preference', err);
        }
      });
    }

    const appConfigureWeatherBtn = document.getElementById('app-configure-weather-btn');
    if (appConfigureWeatherBtn) {
      appConfigureWeatherBtn.addEventListener('click', () => {
        openWeatherSettingsModal(appConfigureWeatherBtn);
      });
    }

    const appConfigureQuoteBtn = document.getElementById('app-configure-quote-btn');
    if (appConfigureQuoteBtn) {
      appConfigureQuoteBtn.addEventListener('click', () => {
        openQuoteSettingsModal(appConfigureQuoteBtn);
      });
    }

    const appConfigureNewsBtn = document.getElementById('app-configure-news-btn');
    if (appConfigureNewsBtn) {
      appConfigureNewsBtn.addEventListener('click', () => {
        openNewsSettingsModal(appConfigureNewsBtn);
      });
    }

    const appBackupExportBtn = document.getElementById('app-backup-export-btn');
    const appBackupImportBtn = document.getElementById('app-backup-import-btn');
    const appBackupImportFile = document.getElementById('app-backup-import-file');

    if (appBackupExportBtn) {
      appBackupExportBtn.addEventListener('click', async () => {
        if (!window.HomebaseBackup || typeof window.HomebaseBackup.exportState !== 'function') {
          if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog('Backup unavailable', 'Backup export is unavailable.');
          }
          return;
        }
        try {
          await window.HomebaseBackup.exportState();
          if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog(
              'Backup started',
              'Homebase backup download has started.\n\nUploaded wallpapers and videos are not included.'
            );
          }
        } catch (err) {
          console.warn('Failed to export backup', err);
          if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog('Backup failed', 'Backup export failed. Check console for details.');
          }
        }
      });
    }

    if (appBackupImportBtn && appBackupImportFile) {
      appBackupImportBtn.addEventListener('click', () => {
        appBackupImportFile.click();
      });

      appBackupImportFile.addEventListener('change', async () => {
        const file = appBackupImportFile.files && appBackupImportFile.files[0];
        appBackupImportFile.value = '';
        if (!file) return;
        if (!window.HomebaseBackup || typeof window.HomebaseBackup.importState !== 'function') {
          if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog('Import unavailable', 'Backup import is unavailable.');
          }
          return;
        }
        try {
          await window.HomebaseBackup.importState(file);
        } catch (err) {
          console.warn('Failed to import backup', err);
          if (typeof window.showCustomDialog === 'function') {
            window.showCustomDialog(
              'Import failed',
              err && err.message ? err.message : 'Backup import failed. Check console for details.'
            );
          }
        }
      });
    }

    const textBgToggle = document.getElementById('app-bookmark-text-bg-toggle');
    const textBgRow = document.getElementById('app-bookmark-text-bg-color-row');
    const textBgOpacityRow = document.getElementById('app-bookmark-text-bg-opacity-row');
    const textBgOpacitySlider = document.getElementById('app-bookmark-text-opacity-slider');
    const textBgBlurRow = document.getElementById('app-bookmark-text-blur-row');
    const textBgBlurSlider = document.getElementById('app-bookmark-text-blur-slider');

    if (textBgToggle) {
      textBgToggle.addEventListener('change', () => {
        const isHidden = !textBgToggle.checked;
        if (textBgRow) textBgRow.classList.toggle('hidden', isHidden);
        if (textBgOpacityRow) textBgOpacityRow.classList.toggle('hidden', isHidden);
        if (textBgBlurRow) textBgBlurRow.classList.toggle('hidden', isHidden);
      });
    }

    if (textBgOpacitySlider) {
      textBgOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        applyBookmarkTextBgOpacity(val);
      });
    }

    if (textBgBlurSlider) {
      textBgBlurSlider.addEventListener('input', (e) => {
        applyBookmarkTextBgBlur(parseInt(e.target.value, 10));
      });
    }

    const animToggle = document.getElementById('app-grid-animation-toggle');
    if (animToggle) {
      animToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        applyGridAnimationEnabled(isEnabled);
        const gridSubSettings = document.getElementById('grid-animation-sub-settings');
        if (gridSubSettings) {
          setSubSettingsExpanded(gridSubSettings, isEnabled, isEnabled ? { scrollIntoView: true } : {});
        }
      });
    }

    const speedSlider = document.getElementById('app-grid-animation-speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        applyGridAnimationSpeed(e.target.value);
      });
    }

    if (appSettingsSaveBtn) {
      appSettingsSaveBtn.addEventListener('click', async () => {
        const nextFormat = appTimeFormatSelect && appTimeFormatSelect.value === '12-hour' ? '12-hour' : '24-hour';
        const nextSidebarVisible = appSidebarToggle ? appSidebarToggle.checked : true;
        const nextMaxTabs = appMaxTabsSelect ? parseInt(appMaxTabsSelect.value, 10) || 0 : 0;
        const nextAutoClose = appAutoCloseSelect ? parseInt(appAutoCloseSelect.value, 10) || 0 : 0;
        const nextBackgroundDim = appDimSlider ? parseInt(appDimSlider.value, 10) || 0 : 0;
        const nextSearchOpenNewTab = appSearchOpenNewTabToggle ? appSearchOpenNewTabToggle.checked : false;
        const nextBookmarkNewTab = document.getElementById('app-bookmark-open-new-tab-toggle')?.checked || false;
        const nextBookmarkTextBg = document.getElementById('app-bookmark-text-bg-toggle')?.checked || false;
        const nextShowWeather = appWeatherToggle ? appWeatherToggle.checked : true;
        const nextShowQuote = appQuoteToggle ? appQuoteToggle.checked : true;
        const nextShowNews = appNewsToggle ? appNewsToggle.checked : false;
        const nextContainerMode = document.getElementById('app-container-mode-toggle')?.checked ?? true;
        const radioKeepBehavior = document.querySelector('input[name="container-behavior"][value="keep"]');
        const nextContainerNewTab = radioKeepBehavior ? radioKeepBehavior.checked : appContainerNewTabPreference;
        const nextDailyRotation = appDailyToggle ? appDailyToggle.checked : (galleryDailyToggle ? galleryDailyToggle.checked : dailyRotationPreference !== false);
        const nextWallpaperType = (() => {
          const raw = appWallpaperTypeSelect?.value || (wallpaperTypeToggle ? (wallpaperTypeToggle.checked ? 'video' : 'static') : wallpaperTypePreference);
          return raw === 'static' ? 'static' : 'video';
        })();
        const nextWallpaperQuality = (() => {
          const raw = appWallpaperQualitySelect?.value || (wallpaperQualityToggle ? (wallpaperQualityToggle.checked ? 'high' : 'low') : wallpaperQualityPreference);
          return raw === 'high' ? 'high' : 'low';
        })();

        const textBgColorTrigger = document.getElementById('app-bookmark-text-bg-color-trigger');
        const nextTextBgColor = textBgColorTrigger ? (textBgColorTrigger.dataset.value || textBgColorTrigger.style.backgroundColor) : '#2CA5FF';
        const nextOpacity = parseFloat(document.getElementById('app-bookmark-text-opacity-slider')?.value || 0.65);
        const nextBlur = parseInt(document.getElementById('app-bookmark-text-blur-slider')?.value || 4, 10);
        const nextGridAnimEnabled = document.getElementById('app-grid-animation-toggle')?.checked || false;
        const nextSpeed = parseFloat(document.getElementById('app-grid-animation-speed-slider')?.value || 0.3);
        const colorTrigger = document.getElementById('app-bookmark-fallback-color-trigger');
        const nextFallbackColor = colorTrigger ? (colorTrigger.dataset.value || colorTrigger.style.backgroundColor) : '#00b8d4';
        const folderTrigger = document.getElementById('app-bookmark-folder-color-trigger');
        const nextFolderColor = folderTrigger ? (folderTrigger.dataset.value || folderTrigger.style.backgroundColor) : '#FFFFFF';
        const nextPerformanceMode = document.getElementById('app-performance-mode-toggle')?.checked || false;
        const nextDebugPerfOverlay = document.getElementById('app-perf-debug-overlay-toggle')?.checked || false;
        const prevDebugPerfOverlay = debugPerfOverlayPreference;
        const perfOverlayChanged = nextDebugPerfOverlay !== prevDebugPerfOverlay;
        const nextBatteryOptimization = document.getElementById('app-battery-optimization-toggle')?.checked || false;
        const nextCinemaMode = document.getElementById('app-cinema-mode-toggle')?.checked || false;
        const nextSingletonMode = (() => {
          const toggle = document.getElementById('app-singleton-mode-toggle');
          return toggle ? toggle.checked : false;
        })();
        const nextRememberEngine = appSearchRememberEngineToggle ? appSearchRememberEngineToggle.checked : true;
        const nextDefaultEngine = appSearchDefaultEngineSelect && appSearchDefaultEngineSelect.value ? appSearchDefaultEngineSelect.value : appSearchDefaultEnginePreference;
        const nextMath = appSearchMathToggle ? appSearchMathToggle.checked : true;
        const nextSearchHistory = appSearchHistoryToggle ? appSearchHistoryToggle.checked : false;

        applyTimeFormatPreference(nextFormat);
        setWeatherPreference(nextShowWeather, { applyVisibility: false, updateUI: false });
        setQuotePreference(nextShowQuote, { applyVisibility: false, updateUI: false });
        setNewsPreference(nextShowNews, { applyVisibility: false, updateUI: false });
        applySidebarVisibility(nextSidebarVisible);
        applyWidgetVisibility();
        appMaxTabsPreference = nextMaxTabs;
        appAutoClosePreference = nextAutoClose;
        applyBackgroundDim(nextBackgroundDim);
        if (appDimSlider && appDimSlider.value !== String(appBackgroundDimPreference)) {
          appDimSlider.value = appBackgroundDimPreference;
        }
        if (appDimLabel) {
          appDimLabel.textContent = `${appBackgroundDimPreference}%`;
        }
        appSearchOpenNewTabPreference = nextSearchOpenNewTab;
        appSearchRememberEnginePreference = nextRememberEngine;
        appSearchDefaultEnginePreference = nextDefaultEngine;
        appSearchMathPreference = nextMath;
        appSearchShowHistoryPreference = nextSearchHistory;
        appContainerModePreference = nextContainerMode;
        appContainerNewTabPreference = nextContainerNewTab;
        dailyRotationPreference = nextDailyRotation;
        wallpaperTypePreference = nextWallpaperType;
        wallpaperQualityPreference = nextWallpaperQuality;

        if (appDailyToggle) {
          appDailyToggle.checked = dailyRotationPreference;
        }
        if (galleryDailyToggle) {
          galleryDailyToggle.checked = dailyRotationPreference;
        }
        if (appWallpaperTypeSelect) {
          appWallpaperTypeSelect.value = wallpaperTypePreference;
        }
        if (wallpaperTypeToggle) {
          wallpaperTypeToggle.checked = wallpaperTypePreference === 'video';
        }
        if (appWallpaperQualitySelect) {
          appWallpaperQualitySelect.value = wallpaperQualityPreference;
        }
        if (wallpaperQualityToggle) {
          wallpaperQualityToggle.checked = wallpaperQualityPreference === 'high';
        }

        appBookmarkOpenNewTabPreference = nextBookmarkNewTab;
        applyBookmarkTextBg(nextBookmarkTextBg);
        applyBookmarkTextBgOpacity(nextOpacity);
        applyBookmarkTextBgBlur(nextBlur);
        applyBookmarkTextBgColor(nextTextBgColor);
        applyGridAnimationSpeed(nextSpeed);
        appBookmarkFallbackColorPreference = nextFallbackColor;
        appBookmarkFolderColorPreference = nextFolderColor;
        appPerformanceModePreference = nextPerformanceMode;
        debugPerfOverlayPreference = nextDebugPerfOverlay;
        appBatteryOptimizationPreference = nextBatteryOptimization;
        appCinemaModePreference = nextCinemaMode;
        appSingletonModePreference = nextSingletonMode;

        applyBookmarkFallbackColor(nextFallbackColor);
        applyBookmarkFolderColor(nextFolderColor);
        applyPerformanceModeState(nextPerformanceMode);
        setupCinemaModeListeners();
        resetCinemaMode();
        applyGridAnimationEnabled(nextGridAnimEnabled);
        updateTime();

        let updatedWallpaperSelection = rebuildCurrentSelectionFromGallery();
        const nextWallpaperState = {
          daily: nextDailyRotation,
          type: nextWallpaperType,
          quality: nextWallpaperQuality
        };
        const wallpaperChanged = JSON.stringify(initialWallpaperState) !== JSON.stringify(nextWallpaperState);

        try {
          await browser.storage.local.set({
            [APP_TIME_FORMAT_KEY]: nextFormat,
            [APP_MAX_TABS_KEY]: nextMaxTabs,
            [APP_AUTOCLOSE_KEY]: nextAutoClose,
            [APP_BACKGROUND_DIM_KEY]: appBackgroundDimPreference,
            [APP_SEARCH_OPEN_NEW_TAB_KEY]: nextSearchOpenNewTab,
            [APP_BOOKMARK_OPEN_NEW_TAB_KEY]: nextBookmarkNewTab,
            [APP_CONTAINER_MODE_KEY]: nextContainerMode,
            [APP_CONTAINER_NEW_TAB_KEY]: nextContainerNewTab,
            [DAILY_ROTATION_KEY]: nextDailyRotation,
            [WALLPAPER_TYPE_KEY]: nextWallpaperType,
            [WALLPAPER_QUALITY_KEY]: nextWallpaperQuality,
            [APP_BOOKMARK_TEXT_BG_KEY]: nextBookmarkTextBg,
            [APP_BOOKMARK_TEXT_BG_COLOR_KEY]: nextTextBgColor,
            [APP_BOOKMARK_TEXT_OPACITY_KEY]: nextOpacity,
            [APP_BOOKMARK_TEXT_BLUR_KEY]: nextBlur,
            [APP_BOOKMARK_FALLBACK_COLOR_KEY]: nextFallbackColor,
            [APP_BOOKMARK_FOLDER_COLOR_KEY]: nextFolderColor,
            [APP_GRID_ANIMATION_ENABLED_KEY]: nextGridAnimEnabled,
            [APP_GRID_ANIMATION_SPEED_KEY]: nextSpeed,
            [APP_SEARCH_REMEMBER_ENGINE_KEY]: nextRememberEngine,
            [APP_SEARCH_MATH_KEY]: nextMath,
            [APP_SEARCH_SHOW_HISTORY_KEY]: nextSearchHistory,
            [APP_SEARCH_DEFAULT_ENGINE_KEY]: nextDefaultEngine,
            [APP_SINGLETON_MODE_KEY]: nextSingletonMode,
            [APP_PERFORMANCE_MODE_KEY]: nextPerformanceMode,
            [APP_DEBUG_PERF_OVERLAY_KEY]: nextDebugPerfOverlay,
            [APP_BATTERY_OPTIMIZATION_KEY]: nextBatteryOptimization,
            [APP_CINEMA_MODE_KEY]: nextCinemaMode
          });

          if (perfOverlayChanged) {
            setPerfOverlayEnabled(nextDebugPerfOverlay);
          }

          if (wallpaperChanged && updatedWallpaperSelection) {
            await browser.storage.local.set({ [WALLPAPER_SELECTION_KEY]: updatedWallpaperSelection });
            await applyWallpaperByType(updatedWallpaperSelection, wallpaperTypePreference);
          }

          if (!nextRememberEngine) {
            await browser.storage.local.remove('currentSearchEngineId');
            updateSearchUI(nextDefaultEngine);
          }
        } catch (err) {
          console.warn('Failed to save app settings', err);
        }

        if (nextSingletonMode) {
          await handleSingletonMode();
        }

        if (wallpaperChanged) {
          try {
            await ensureDailyWallpaper(false);
          } catch (err) {
            console.warn('Failed to refresh wallpaper after saving settings', err);
          }
        }

        runWhenIdle(() => manageHomebaseTabs());
        closeAppSettingsModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (supportQrModal && !supportQrModal.classList.contains('is-hidden')) {
        closeSupportQrModal();
        return;
      }
      if (!appSettingsModal.classList.contains('hidden')) {
        closeAppSettingsModal();
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    setupAppSettingsModal();
  }

  function open(options = {}) {
    init();
    openAppSettingsModal(options.triggerSource || 'main-settings-btn');
    updateDefaultEngineVisibilityControl();
    updateWhatsNewNavBadge();
  }

  return {
    init,
    open
  };
})();
