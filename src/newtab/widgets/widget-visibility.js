const WIDGET_ORDER_KEY = 'widgetOrder';

const FAST_WIDGET_ORDER_KEY = 'fast-widget-order';

let widgetOrderPreference = ((typeof window !== 'undefined' && window.DEFAULT_WIDGET_ORDER) || ['weather', 'quote', 'todo', 'news']).slice();

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

  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
    HomebaseStorage.set(APP_SHOW_SIDEBAR_KEY, appShowSidebarPreference).catch((err) => {
      console.warn('Failed to save sidebar visibility preference', err);
    });
  } else if (browser && browser.storage && browser.storage.local) {
    browser.storage.local
      .set({ [APP_SHOW_SIDEBAR_KEY]: appShowSidebarPreference })
      .catch((err) => {
        console.warn('Failed to save sidebar visibility preference', err);
      });
  }

  updateSidebarCollapseState();

  updateWidgetSettingsUI();

}


function writeFastWidgetOrderMirror(order) {
  try {
    if (window.localStorage) {
      localStorage.setItem(FAST_WIDGET_ORDER_KEY, JSON.stringify(order));
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }
}

function applyWidgetOrderToSidebar(order = widgetOrderPreference) {
  const sidebarEl = (typeof window !== 'undefined' && window.HomebaseDockNavigation && typeof window.HomebaseDockNavigation.getSidebarElement === 'function')
    ? window.HomebaseDockNavigation.getSidebarElement()
    : (typeof getSidebarElement === 'function'
      ? getSidebarElement()
      : (typeof document !== 'undefined' ? document.querySelector('.sidebar') : null));
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

  writeFastWidgetOrderMirror(normalized);

  if (shouldApply) {
    applyWidgetOrderToSidebar(normalized);
  }

  if (shouldUpdateSettings) {
    applyWidgetOrderToSettings(normalized);
  }

  if (shouldPersist) {
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set(WIDGET_ORDER_KEY, normalized).catch((err) => {
        console.warn('Failed to save widget order', err);
      });
    } else if (browser && browser.storage && browser.storage.local) {
      browser.storage.local
        .set({ [WIDGET_ORDER_KEY]: normalized })
        .catch((err) => {
          console.warn('Failed to save widget order', err);
        });
    }
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

    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set(WIDGET_ORDER_KEY, order).catch((err) => {
        console.warn('Failed to save widget order', err);
      });
    } else if (browser && browser.storage && browser.storage.local) {
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
