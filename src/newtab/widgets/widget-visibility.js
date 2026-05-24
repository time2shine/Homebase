const WIDGET_ORDER_KEY = 'widgetOrder';

const DEFAULT_WIDGET_ORDER = ['weather', 'quote', 'todo', 'news'];

const WIDGET_ORDER_SET = new Set(DEFAULT_WIDGET_ORDER);

let widgetOrderPreference = DEFAULT_WIDGET_ORDER.slice();

let widgetSettingsSortable = null;

function applySidebarVisibility(showSidebar = true) {

  appShowSidebarPreference = showSidebar !== false;

  if (document.documentElement) {
    document.documentElement.classList.toggle('sidebar-hidden', !appShowSidebarPreference);
  }
  if (document.body) {
    document.body.classList.toggle('sidebar-hidden', !appShowSidebarPreference);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-sidebar', appShowSidebarPreference ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_SIDEBAR_KEY]: appShowSidebarPreference })
      .catch((err) => {
        console.warn('Failed to save sidebar visibility preference', err);
      });
  }

  updateSidebarCollapseState();

  updateWidgetSettingsUI();

}

function normalizeWidgetOrder(order) {
  const normalized = [];
  const seen = new Set();

  if (Array.isArray(order)) {
    order.forEach((value) => {
      if (typeof value !== 'string') return;
      const key = value.trim();
      if (!WIDGET_ORDER_SET.has(key) || seen.has(key)) return;
      seen.add(key);
      normalized.push(key);
    });
  }

  DEFAULT_WIDGET_ORDER.forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized;
}

function areWidgetOrdersEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function applyWidgetOrderToSidebar(order = widgetOrderPreference) {
  const sidebarEl = sidebar || document.querySelector('.sidebar');
  if (!sidebarEl) return;

  const widgets = {
    weather: document.querySelector('.widget-weather'),
    quote: document.querySelector('.widget-quote'),
    todo: document.querySelector('.widget-todo'),
    news: document.querySelector('.widget-news')
  };

  const fragment = document.createDocumentFragment();
  order.forEach((key) => {
    const widget = widgets[key];
    if (widget) fragment.appendChild(widget);
  });
  sidebarEl.appendChild(fragment);
}

function applyWidgetOrderToSettings(order = widgetOrderPreference) {
  const widgetList = document.getElementById('widget-sub-settings');
  if (!widgetList) return;

  ensureSubSettingsInner(widgetList);
  const widgetInner = widgetList.querySelector('.sub-settings-inner') || widgetList;
  const rows = Array.from(widgetInner.querySelectorAll('.widget-setting-row'));
  if (!rows.length) return;

  const rowMap = new Map(rows.map((row) => [row.dataset.widgetId, row]));
  const fragment = document.createDocumentFragment();

  order.forEach((key) => {
    const row = rowMap.get(key);
    if (row) fragment.appendChild(row);
  });

  widgetInner.appendChild(fragment);
}

function setWidgetOrderPreference(order, options = {}) {
  const normalized = normalizeWidgetOrder(order);
  const shouldPersist = options.persist !== false;
  const shouldApply = options.apply !== false;
  const shouldUpdateSettings = options.updateSettings !== false;

  widgetOrderPreference = normalized;

  if (shouldApply) {
    applyWidgetOrderToSidebar(normalized);
  }

  if (shouldUpdateSettings) {
    applyWidgetOrderToSettings(normalized);
  }

  if (shouldPersist && browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [WIDGET_ORDER_KEY]: normalized })
      .catch((err) => {
        console.warn('Failed to save widget order', err);
      });
  }

  return normalized;
}


function setupWidgetOrderSortable() {
  const widgetList = document.getElementById('widget-sub-settings');
  if (!widgetList) return;

  ensureSubSettingsInner(widgetList);
  const widgetInner = widgetList.querySelector('.sub-settings-inner') || widgetList;

  if (widgetSettingsSortable) {
    widgetSettingsSortable.destroy();
    widgetSettingsSortable = null;
  }

  const commitWidgetOrder = () => {
    const order = Array.from(widgetInner.querySelectorAll('.widget-setting-row'))
      .map((row) => row.dataset.widgetId)
      .filter(Boolean);

    if (!order.length) return;

    if (typeof setWidgetOrderPreference === 'function') {
      setWidgetOrderPreference(order, { persist: true });
      return;
    }

    if (browser && browser.storage && browser.storage.local) {
      browser.storage.local
        .set({ [WIDGET_ORDER_KEY]: order })
        .catch((err) => {
          console.warn('Failed to save widget order', err);
        });
    }
  };

  widgetInner.querySelectorAll('.widget-drag-handle[draggable="true"]').forEach((handle) => {
    handle.removeAttribute('draggable');
  });

  widgetSettingsSortable = initUnifiedSortable(widgetInner, () => {
    commitWidgetOrder();
  }, {
    handle: '.widget-drag-handle'
  }, 'widgets');

  widgetList.dataset.dragReady = '1';
}



function applyWidgetVisibility() {

  const weatherWidget = document.querySelector('.widget-weather');

  const quoteWidget = document.querySelector('.widget-quote');

  const newsWidget = document.querySelector('.widget-news');

  const todoWidget = document.querySelector('.widget-todo');

  const shouldShowWeather = appShowSidebarPreference && appShowWeatherPreference;

  const shouldShowQuote = appShowSidebarPreference && appShowQuotePreference;

  const shouldShowNews = appShowSidebarPreference && appShowNewsPreference;

  const shouldShowTodo = appShowSidebarPreference && appShowTodoPreference;

  if (weatherWidget) {

    weatherWidget.classList.toggle('force-hidden', !shouldShowWeather);

  }

  if (quoteWidget) {

    quoteWidget.classList.toggle('force-hidden', !shouldShowQuote);

  }

  if (newsWidget) {

    newsWidget.classList.toggle('force-hidden', !shouldShowNews);

  }

  if (todoWidget) {

    todoWidget.classList.toggle('force-hidden', !shouldShowTodo);

  }

}
