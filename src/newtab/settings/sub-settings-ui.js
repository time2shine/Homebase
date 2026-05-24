function updateColorTrigger(triggerEl, color) {

  if (!triggerEl) return;



  triggerEl.style.backgroundColor = color;



  const normalized = (color || '').trim().toLowerCase();

  const isWhite =

    normalized === '#fff' ||

    normalized === '#ffffff' ||

    normalized === 'white' ||

    normalized.startsWith('rgb(255, 255, 255');



  triggerEl.style.setProperty('--color-picker-ring', isWhite ? '#000000' : '#ffffff');

}



function ensureSubSettingsInner(container) {
  if (!container) return null;
  const directChildren = Array.from(container.children);
  if (
    directChildren.length === 1 &&
    directChildren[0].classList &&
    directChildren[0].classList.contains('sub-settings-inner')
  ) {
    return directChildren[0];
  }

  const inner = document.createElement('div');
  inner.className = 'sub-settings-inner';
  while (container.firstChild) {
    inner.appendChild(container.firstChild);
  }
  container.appendChild(inner);
  return inner;
}

function setSubSettingsExpanded(container, expanded, opts = {}) {
  if (!container) return;
  ensureSubSettingsInner(container);
  container.classList.toggle('expanded', !!expanded);
  if (expanded && opts.scrollIntoView) {
    requestAnimationFrame(() => {
      container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}

function updateWidgetSettingsUI() {

  const subSettings = document.getElementById('widget-sub-settings');

  const weatherToggleEl = document.getElementById('app-show-weather-toggle');

  const quoteToggleEl = document.getElementById('app-show-quote-toggle');

  const newsToggleEl = document.getElementById('app-show-news-toggle');

  const todoToggleEl = document.getElementById('app-show-todo-toggle');

  const weatherConfigureBtn = document.getElementById('app-configure-weather-btn');

  const quoteConfigureBtn = document.getElementById('app-configure-quote-btn');

  const newsConfigureBtn = document.getElementById('app-configure-news-btn');

  if (weatherToggleEl) {

    weatherToggleEl.checked = appShowWeatherPreference;

  }

  if (quoteToggleEl) {

    quoteToggleEl.checked = appShowQuotePreference;

  }

  if (newsToggleEl) {

    newsToggleEl.checked = appShowNewsPreference;

  }

  if (todoToggleEl) {

    todoToggleEl.checked = appShowTodoPreference;

  }

  if (!appShowSidebarPreference) {

    if (subSettings) setSubSettingsExpanded(subSettings, false);

    if (weatherConfigureBtn) weatherConfigureBtn.disabled = true;

    if (quoteConfigureBtn) quoteConfigureBtn.disabled = true;

    if (newsConfigureBtn) newsConfigureBtn.disabled = true;

    return;

  }

  if (subSettings) setSubSettingsExpanded(subSettings, true);

  if (weatherConfigureBtn) {

    weatherConfigureBtn.disabled = !appShowWeatherPreference;

  }

  if (quoteConfigureBtn) {

    quoteConfigureBtn.disabled = !appShowQuotePreference;

  }

  if (newsConfigureBtn) {

    newsConfigureBtn.disabled = !appShowNewsPreference;

  }

}
