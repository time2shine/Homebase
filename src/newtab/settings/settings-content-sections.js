// =============================================================================
// Homebase Settings Content Sections Controller
// Module: src/newtab/settings/settings-content-sections.js
// Canonical owner of What's New changelog parsing, Pro Tips setting filtering,
// Privacy Policy loading, Feedback/Social action handlers, and Diagnostic UI bridge.
// =============================================================================

(function() {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  // Section identifiers
  const WHATS_NEW_SECTION = 'whats-new';
  const PRO_TIPS_SECTION = 'pro-tips';
  const DIAGNOSTICS_SECTION = 'diagnostics';

  // Storage keys
  const WHATS_NEW_STORAGE_KEY = 'lastSeenWhatsNewVersion';
  const WHATS_NEW_LATEST_STORAGE_KEY = 'latestKnownWhatsNewVersion';

  // External URLs
  const FEEDBACK_GITHUB_PROJECT_URL = 'https://github.com/time2shine/Homebase';
  const FEEDBACK_BUG_URL = 'https://github.com/time2shine/Homebase/issues/new?labels=bug';
  const FEEDBACK_FEATURE_URL = 'https://github.com/time2shine/Homebase/issues/new?labels=enhancement';
  const FEEDBACK_CHANGELOG_URL = 'https://github.com/time2shine/Homebase/blob/main/src/CHANGELOG.md';
  const FEEDBACK_PRIVACY_URL = 'https://github.com/time2shine/Homebase/blob/main/src/PRIVACY.md';
  const FEEDBACK_FIREFOX_LISTING_URL = 'https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/';
  const FEEDBACK_CHROME_LISTING_URL = 'https://chromewebstore.google.com/detail/homebase/ejfdeilhncacmmbdfmgpolpoldpllbmc?authuser=0&hl=en';

  // Caches & state
  let whatsNewChangelogCache = null;
  let whatsNewChangelogPromise = null;
  let privacyPolicyCache = null;
  let privacyPolicyFetchPromise = null;
  let openProTipId = '';
  let diagnosticUILoadPromise = null;

  // =============================================================================
  // WHAT'S NEW SECTION LOGIC
  // =============================================================================

  function getWhatsNewData() {
    const whatsNewSource = typeof WHATS_NEW !== 'undefined'
      ? WHATS_NEW
      : (typeof globalScope.WHATS_NEW !== 'undefined' ? globalScope.WHATS_NEW : null);

    if (typeof whatsNewSource !== 'object' || !whatsNewSource) return null;
    const version = typeof whatsNewSource.version === 'string' ? whatsNewSource.version : '';
    const date = typeof whatsNewSource.date === 'string' ? whatsNewSource.date : '';
    const items = Array.isArray(whatsNewSource.items) ? whatsNewSource.items : [];
    return { version, date, items };
  }

  function getLastSeenWhatsNewVersion() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(WHATS_NEW_STORAGE_KEY) || '';
      }
      return '';
    } catch (err) {
      return '';
    }
  }

  function getLatestKnownWhatsNewVersion() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(WHATS_NEW_LATEST_STORAGE_KEY) || '';
      }
      return '';
    } catch (err) {
      return '';
    }
  }

  function setLatestKnownWhatsNewVersion(version) {
    if (!version) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WHATS_NEW_LATEST_STORAGE_KEY, version);
      }
    } catch (err) {
      // Best-effort only
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
    if (typeof document === 'undefined') return;
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
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WHATS_NEW_STORAGE_KEY, nextVersion);
      }
    } catch (err) {
      // Best-effort only
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
    if (typeof document === 'undefined') return;
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

  // =============================================================================
  // PRO TIPS SECTION LOGIC
  // =============================================================================

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
    if (typeof settingId !== 'string' || !settingId || typeof document === 'undefined') return null;
    const el = document.getElementById(settingId);
    if (!el) return null;

    if (el.matches && el.matches('input[type="checkbox"]')) {
      return !!el.checked;
    }

    if (el.matches && el.matches('select')) {
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
    // Check canonical HomebaseSettingsStorage first if available
    const storageModule = globalScope.HomebaseSettingsStorage || null;
    const state = storageModule ? storageModule.state : null;

    switch (settingKey) {
      case 'APP_SEARCH_MATH_KEY':
        if (state && typeof state.searchMath !== 'undefined') return !!state.searchMath;
        if (typeof globalScope.appSearchMathPreference !== 'undefined') return !!globalScope.appSearchMathPreference;
        return readSettingStateById('app-search-math-toggle');
      case 'APP_DEBUG_PERF_OVERLAY_KEY':
        if (state && typeof state.debugPerfOverlay !== 'undefined') return !!state.debugPerfOverlay;
        if (typeof globalScope.debugPerfOverlayPreference !== 'undefined') return !!globalScope.debugPerfOverlayPreference;
        return readSettingStateById('app-perf-debug-overlay-toggle');
      case 'APP_SHOW_SIDEBAR_KEY':
        if (state && typeof state.showSidebar !== 'undefined') return !!state.showSidebar;
        if (typeof globalScope.appShowSidebarPreference !== 'undefined') return !!globalScope.appShowSidebarPreference;
        return readSettingStateById('app-show-sidebar-toggle');
      case 'APP_SHOW_WEATHER_KEY':
        if (state && typeof state.showWeather !== 'undefined') return !!state.showWeather;
        if (typeof globalScope.appShowWeatherPreference !== 'undefined') return !!globalScope.appShowWeatherPreference;
        return readSettingStateById('app-show-weather-toggle');
      case 'APP_SHOW_QUOTE_KEY':
        if (state && typeof state.showQuote !== 'undefined') return !!state.showQuote;
        if (typeof globalScope.appShowQuotePreference !== 'undefined') return !!globalScope.appShowQuotePreference;
        return readSettingStateById('app-show-quote-toggle');
      case 'APP_SHOW_NEWS_KEY':
        if (state && typeof state.showNews !== 'undefined') return !!state.showNews;
        if (typeof globalScope.appShowNewsPreference !== 'undefined') return !!globalScope.appShowNewsPreference;
        return readSettingStateById('app-show-news-toggle');
      case 'APP_SHOW_TODO_KEY':
        if (state && typeof state.showTodo !== 'undefined') return !!state.showTodo;
        if (typeof globalScope.appShowTodoPreference !== 'undefined') return !!globalScope.appShowTodoPreference;
        return readSettingStateById('app-show-todo-toggle');
      case 'APP_NEWS_SOURCE_KEY':
        if (state && typeof state.showNews !== 'undefined' && !state.showNews) return false;
        if (typeof globalScope.appShowNewsPreference !== 'undefined' && !globalScope.appShowNewsPreference) return false;
        return readSettingStateById('news-source-select');
      case 'APP_SINGLETON_MODE_KEY':
        if (state && typeof state.singletonMode !== 'undefined') return !!state.singletonMode;
        if (typeof globalScope.appSingletonModePreference !== 'undefined') return !!globalScope.appSingletonModePreference;
        return readSettingStateById('app-singleton-mode-toggle');
      case 'APP_MAX_TABS_KEY':
        if (state && typeof state.maxTabs !== 'undefined') return Number(state.maxTabs) > 0;
        if (typeof globalScope.appMaxTabsPreference !== 'undefined') return Number(globalScope.appMaxTabsPreference) > 0;
        return readSettingStateById('app-max-tabs-select');
      case 'APP_AUTOCLOSE_KEY':
        if (state && typeof state.autoClose !== 'undefined') return Number(state.autoClose) > 0;
        if (typeof globalScope.appAutoClosePreference !== 'undefined') return Number(globalScope.appAutoClosePreference) > 0;
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
    const sourceTips = Array.isArray(globalScope.HOMEBASE_TIPS) ? globalScope.HOMEBASE_TIPS : [];
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
    if (typeof document === 'undefined') return;
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

  // =============================================================================
  // DIAGNOSTICS BRIDGE LOGIC
  // =============================================================================

  function ensureDiagnosticUILoaded() {
    if (globalScope.HomebaseDiagnosticUI) {
      return Promise.resolve(globalScope.HomebaseDiagnosticUI);
    }
    if (diagnosticUILoadPromise) {
      return diagnosticUILoadPromise;
    }
    if (typeof globalScope.loadScriptOnce === 'function') {
      diagnosticUILoadPromise = globalScope.loadScriptOnce('newtab/settings/diagnostic-ui.js')
        .then(() => globalScope.HomebaseDiagnosticUI || null)
        .catch((err) => {
          console.warn('Failed to load diagnostic-ui.js', err);
          return null;
        })
        .finally(() => {
          diagnosticUILoadPromise = null;
        });
      return diagnosticUILoadPromise;
    }
    return Promise.resolve(globalScope.HomebaseDiagnosticUI || null);
  }

  function createDiagnosticsNavItem() {
    if (globalScope.HomebaseDiagnosticUI && typeof globalScope.HomebaseDiagnosticUI.createDiagnosticsNavItem === 'function') {
      return globalScope.HomebaseDiagnosticUI.createDiagnosticsNavItem();
    }
    const navItem = document.createElement('button');
    navItem.className = 'app-settings-nav-item';
    navItem.dataset.section = DIAGNOSTICS_SECTION;
    navItem.innerHTML = `
      <span class="nav-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </span>
      <span class="nav-label">Diagnostics</span>
    `;
    return navItem;
  }

  function createDiagnosticsSection() {
    if (globalScope.HomebaseDiagnosticUI && typeof globalScope.HomebaseDiagnosticUI.createDiagnosticsSection === 'function') {
      return globalScope.HomebaseDiagnosticUI.createDiagnosticsSection();
    }
    const section = document.createElement('section');
    section.className = 'app-settings-section';
    section.dataset.section = DIAGNOSTICS_SECTION;

    const header = document.createElement('div');
    header.className = 'app-settings-about-header app-settings-diagnostic-header';

    const title = document.createElement('div');
    title.className = 'app-settings-about-title app-settings-diagnostic-title';
    title.textContent = 'System & Storage Diagnostics';
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'app-settings-about-meta app-settings-diagnostic-meta';
    meta.textContent = 'Live health assessment, schema validation audit, and diagnostic reports.';
    header.appendChild(meta);
    section.appendChild(header);

    const container = document.createElement('div');
    container.className = 'app-settings-diagnostic-container';
    section.appendChild(container);

    return section;
  }

  async function renderDiagnosticsSection() {
    await ensureDiagnosticUILoaded();
    if (typeof document === 'undefined') return;
    const sectionEl = document.querySelector(`.app-settings-section[data-section="${DIAGNOSTICS_SECTION}"]`);
    if (!sectionEl) return;

    if (globalScope.HomebaseDiagnosticUI && typeof globalScope.HomebaseDiagnosticUI.renderDiagnosticsPanel === 'function') {
      await globalScope.HomebaseDiagnosticUI.renderDiagnosticsPanel(sectionEl);
    }
  }

  // =============================================================================
  // PRIVACY POLICY SECTION LOGIC
  // =============================================================================

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
    const section = btn.closest ? btn.closest('.app-settings-section') : null;
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

  // =============================================================================
  // FEEDBACK & SOCIAL HANDLERS
  // =============================================================================

  async function getFeedbackStoreUrl() {
    try {
      if (typeof globalScope.isFirefoxBrowser === 'function' && await globalScope.isFirefoxBrowser()) {
        return FEEDBACK_FIREFOX_LISTING_URL;
      }
    } catch (err) {
      // Fall back to user agent check
    }

    const userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    return /\bFirefox\//.test(userAgent) ? FEEDBACK_FIREFOX_LISTING_URL : FEEDBACK_CHROME_LISTING_URL;
  }

  async function openFeedbackUrl(url) {
    if (!url) return;

    try {
      if (typeof browser !== 'undefined' && browser && browser.tabs && browser.tabs.create) {
        await browser.tabs.create({ url, active: true });
        return;
      }
    } catch (err) {
      console.warn('Failed to open feedback link in a new tab', err);
    }

    if (typeof window !== 'undefined') {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) {
        opened.opener = null;
      }
      if (!opened) {
        window.location.href = url;
      }
    }
  }

  function setFeedbackButtonTemporaryText(button, text) {
    if (!button || !text) return;
    const originalText = button.dataset.originalText || button.textContent;
    button.dataset.originalText = originalText;
    button.textContent = text;
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        button.textContent = button.dataset.originalText || originalText;
      }, 1000);
    }
  }

  async function shareHomebaseFeedbackLink(button) {
    const shareData = {
      title: 'Homebase',
      text: 'Homebase new tab dashboard',
      url: FEEDBACK_GITHUB_PROJECT_URL
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(FEEDBACK_GITHUB_PROJECT_URL);
        setFeedbackButtonTemporaryText(button, 'Copied');
        return;
      } catch (err) {
        // Fall through
      }
    }

    await openFeedbackUrl(FEEDBACK_GITHUB_PROJECT_URL);
  }

  async function handleFeedbackAction(button) {
    if (!button) return;
    const action = button.dataset.feedbackAction || '';
    const staticUrls = {
      bug: FEEDBACK_BUG_URL,
      feature: FEEDBACK_FEATURE_URL,
      changelog: FEEDBACK_CHANGELOG_URL,
      privacy: FEEDBACK_PRIVACY_URL
    };

    if (action === 'rate') {
      await openFeedbackUrl(await getFeedbackStoreUrl());
      return;
    }

    if (action === 'share') {
      await shareHomebaseFeedbackLink(button);
      return;
    }

    if (action === 'diagnostic-report') {
      if (globalScope.HomebaseDiagnosticUI && typeof globalScope.HomebaseDiagnosticUI.handleCopyReport === 'function') {
        await globalScope.HomebaseDiagnosticUI.handleCopyReport(button);
      } else if (globalScope.HomebaseDiagnostics && typeof globalScope.HomebaseDiagnostics.exportHealthReport === 'function') {
        button.disabled = true;
        const origText = button.textContent;
        try {
          const res = await globalScope.HomebaseDiagnostics.exportHealthReport();
          button.textContent = (res && res.success) ? 'Copied to Clipboard!' : 'Copy Failed';
        } catch (_) {
          button.textContent = 'Copy Failed';
        } finally {
          setTimeout(() => {
            button.textContent = origText;
            button.disabled = false;
          }, 2500);
        }
      }
      return;
    }

    await openFeedbackUrl(staticUrls[action]);
  }

  function ensureFeedbackDiagnosticButton() {
    if (typeof document === 'undefined') return;
    const bugActionBtn = document.querySelector('.app-settings-feedback-card [data-feedback-action="bug"]');
    if (!bugActionBtn || !bugActionBtn.parentElement) return;

    const bugCard = bugActionBtn.parentElement;
    if (bugCard.querySelector('.app-settings-feedback-diagnostic-btn')) return;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'gallery-secondary-btn app-settings-feedback-action app-settings-feedback-diagnostic-btn';
    copyBtn.dataset.feedbackAction = 'diagnostic-report';
    copyBtn.textContent = 'Copy Diagnostic Report';

    bugCard.appendChild(copyBtn);
  }

  // =============================================================================
  // PUBLIC CONTROLLER EXPORT
  // =============================================================================

  const HomebaseSettingsContentSections = {
    // What's New
    getWhatsNewData,
    loadWhatsNewChangelog,
    updateWhatsNewNavBadge,
    markWhatsNewSeen,
    renderWhatsNewSection,

    // Pro Tips
    createProTipsNavItem,
    createProTipsSection,
    renderProTipsSection,
    getFilteredProTips,

    // Diagnostics
    ensureDiagnosticUILoaded,
    createDiagnosticsNavItem,
    createDiagnosticsSection,
    renderDiagnosticsSection,

    // Privacy Policy
    createPrivacyNavItem,
    createPrivacySection,
    loadPrivacyPolicyInto,
    handlePrivacyPolicyClick,

    // Feedback & Social
    getFeedbackStoreUrl,
    openFeedbackUrl,
    shareHomebaseFeedbackLink,
    handleFeedbackAction,
    ensureFeedbackDiagnosticButton
  };

  globalScope.HomebaseSettingsContentSections = HomebaseSettingsContentSections;
})();
