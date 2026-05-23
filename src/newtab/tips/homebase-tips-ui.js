function getLocalDateKey() {

  return getLocalDayStamp(Date.now());

}

const HOMEBASE_ONBOARDING_DISMISSED_KEY = 'homebaseOnboardingDismissed';
const HOMEBASE_TIPS_DISABLED_KEY = 'homebaseTipsDisabled';
const HOMEBASE_TIP_DISMISSED_DATE_KEY = 'homebaseTipDismissedDate';
const HOMEBASE_TIP_LAST_INDEX_KEY = 'homebaseTipLastIndex';
const HOMEBASE_DAILY_TIPS = [
  {
    title: 'Search faster with bangs',
    body: 'Try !g cats, !yt lo-fi, or !w Firefox Containers.'
  },
  {
    title: 'Right-click bookmarks',
    body: 'Edit, move, delete, rename, or open bookmarks in Firefox Containers.'
  },
  {
    title: 'Customize widgets',
    body: 'Open Settings to enable, disable, and customize your widgets.'
  },
  {
    title: 'Use the wallpaper gallery',
    body: 'Choose wallpapers, upload your own, or enable daily rotation.'
  },
  {
    title: 'Quick save pages',
    body: 'Use the Homebase toolbar icon to save the current page.'
  },
  {
    title: 'Performance mode',
    body: 'Turn on Performance Mode on older devices or laptops.'
  },
  {
    title: 'Search suggestions',
    body: 'You can enable or disable search suggestions from Settings.'
  }
];

let homebaseOnboardingHiddenForSession = false;
let homebaseOnboardingCompletedThisSession = false;
let homebaseTipCurrentIndex = null;
let homebaseTipsRenderToken = 0;

function getHomebaseLocalStorageItem(key) {

  try {
    if (!window.localStorage) return null;
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }

}

function setHomebaseLocalStorageItem(key, value) {

  try {
    if (!window.localStorage) return false;
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    return false;
  }

}

function normalizeHomebaseTipIndex(index) {

  const tipCount = HOMEBASE_DAILY_TIPS.length;
  if (!tipCount) return 0;

  const numericIndex = Number.parseInt(index, 10);
  if (!Number.isFinite(numericIndex) || numericIndex < 0) return 0;

  return numericIndex % tipCount;

}

function clearHomebaseTipsCard(tipCard) {

  if (!tipCard) return;

  homebaseTipsRenderToken += 1;
  tipCard.className = 'homebase-tips-card';
  tipCard.classList.remove('is-visible');
  tipCard.setAttribute('hidden', '');
  tipCard.removeAttribute('role');
  tipCard.removeAttribute('aria-label');
  tipCard.removeAttribute('aria-live');
  tipCard.replaceChildren();

}

function prepareHomebaseTipsCard(tipCard, role, ariaLabel) {

  homebaseTipsRenderToken += 1;
  tipCard.className = 'homebase-tips-card';
  tipCard.classList.remove('is-visible');
  tipCard.setAttribute('role', role);
  tipCard.setAttribute('aria-label', ariaLabel);
  tipCard.removeAttribute('aria-live');
  tipCard.replaceChildren();

}

function showHomebaseTipsCard(tipCard) {

  const showToken = homebaseTipsRenderToken;

  tipCard.removeAttribute('hidden');
  requestAnimationFrame(() => {
    if (showToken === homebaseTipsRenderToken && !tipCard.hasAttribute('hidden')) {
      tipCard.classList.add('is-visible');
    }
  });

}

function hideHomebaseTipsCard(tipCard) {

  if (!tipCard) return;

  const hideToken = homebaseTipsRenderToken + 1;
  homebaseTipsRenderToken = hideToken;
  tipCard.classList.remove('is-visible');

  if (tipCard.hasAttribute('hidden')) return;

  let finished = false;
  let fallbackId = null;
  let onTransitionEnd = null;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (onTransitionEnd) {
      tipCard.removeEventListener('transitionend', onTransitionEnd);
    }
    if (fallbackId !== null) {
      clearTimeout(fallbackId);
    }
    if (hideToken !== homebaseTipsRenderToken) return;
    tipCard.setAttribute('hidden', '');
    tipCard.replaceChildren();
  };

  onTransitionEnd = (event) => {
    if (event.target !== tipCard) return;
    cleanup();
  };

  tipCard.addEventListener('transitionend', onTransitionEnd);
  fallbackId = setTimeout(cleanup, 280);

}

function createHomebaseTipsButton(label, className) {

  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;

}

function renderHomebaseOnboardingCard(tipCard) {

  prepareHomebaseTipsCard(tipCard, 'dialog', 'Welcome to Homebase tips');

  const title = document.createElement('h2');
  title.className = 'homebase-tips-title';
  title.textContent = 'Welcome to Homebase';

  const intro = document.createElement('p');
  intro.className = 'homebase-tips-body';
  intro.textContent = 'Here are a few quick things you can try first.';

  const list = document.createElement('ul');
  list.className = 'homebase-tips-list';

  [
    {
      icon: '⌘',
      text: 'Use bang searches like !g cats, !yt lo-fi, or !w Firefox.'
    },
    {
      icon: '⌥',
      text: 'Press Alt + Arrow Down to switch between search engines on the go.'
    },
    {
      icon: '↗',
      text: 'Right-click bookmarks to edit, move, delete, or open in Firefox Containers.'
    },
    {
      icon: '✦',
      text: 'Open the wallpaper gallery to choose images, videos, and your own wallpapers.'
    },
    {
      icon: '⚙',
      text: 'Use Settings to enable, disable, and customize widgets.'
    }
  ].forEach((onboardingItem) => {
    const item = document.createElement('li');
    const dot = document.createElement('span');
    const text = document.createElement('span');

    dot.className = 'homebase-tips-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = onboardingItem.icon;
    text.textContent = onboardingItem.text;

    item.append(dot, text);
    list.appendChild(item);
  });

  const actions = document.createElement('div');
  actions.className = 'homebase-tips-actions';

  const laterButton = createHomebaseTipsButton('Later', 'homebase-tips-btn');
  const gotItButton = createHomebaseTipsButton('Got it', 'homebase-tips-btn homebase-tips-btn-primary');

  laterButton.addEventListener('click', () => {
    homebaseOnboardingHiddenForSession = true;
    hideHomebaseTipsCard(tipCard);
  });

  gotItButton.addEventListener('click', () => {
    setHomebaseLocalStorageItem(HOMEBASE_ONBOARDING_DISMISSED_KEY, 'true');
    homebaseOnboardingCompletedThisSession = true;
    hideHomebaseTipsCard(tipCard);
  });

  actions.append(laterButton, gotItButton);
  tipCard.append(title, intro, list, actions);
  showHomebaseTipsCard(tipCard);

}

function renderHomebaseDailyTipCard(tipCard, tipIndex) {

  prepareHomebaseTipsCard(tipCard, 'region', 'Homebase tip of the day');
  tipCard.setAttribute('aria-live', 'polite');

  const eyebrow = document.createElement('div');
  eyebrow.className = 'homebase-tips-eyebrow';
  eyebrow.textContent = 'Tip of the day';

  const title = document.createElement('h2');
  title.className = 'homebase-tips-title';

  const body = document.createElement('p');
  body.className = 'homebase-tips-body';

  const actions = document.createElement('div');
  actions.className = 'homebase-tips-actions';

  const nextButton = createHomebaseTipsButton('Next tip', 'homebase-tips-btn');
  const disableTipsButton = createHomebaseTipsButton('Don’t show tips', 'homebase-tips-btn');
  const dismissButton = createHomebaseTipsButton('Dismiss', 'homebase-tips-btn homebase-tips-btn-primary');

  const updateTip = (nextIndex) => {
    const normalizedIndex = normalizeHomebaseTipIndex(nextIndex);
    const tip = HOMEBASE_DAILY_TIPS[normalizedIndex];

    if (!tip) return;

    homebaseTipCurrentIndex = normalizedIndex;
    title.textContent = tip.title;
    body.textContent = tip.body;
    setHomebaseLocalStorageItem(HOMEBASE_TIP_LAST_INDEX_KEY, String(normalizedIndex));
  };

  nextButton.addEventListener('click', () => {
    updateTip(homebaseTipCurrentIndex === null ? 0 : homebaseTipCurrentIndex + 1);
  });

  disableTipsButton.addEventListener('click', () => {
    setHomebaseLocalStorageItem(HOMEBASE_TIPS_DISABLED_KEY, 'true');
    hideHomebaseTipsCard(tipCard);
  });

  dismissButton.addEventListener('click', () => {
    setHomebaseLocalStorageItem(HOMEBASE_TIP_DISMISSED_DATE_KEY, getLocalDateKey());
    hideHomebaseTipsCard(tipCard);
  });

  actions.append(nextButton, disableTipsButton, dismissButton);
  tipCard.append(eyebrow, title, body, actions);
  updateTip(tipIndex);
  showHomebaseTipsCard(tipCard);

}

function renderTipOfDay() {

  const tipCard = document.getElementById('tip-card');
  if (!tipCard) return;

  const onboardingDismissed = getHomebaseLocalStorageItem(HOMEBASE_ONBOARDING_DISMISSED_KEY) === 'true';

  if (!onboardingDismissed) {
    if (homebaseOnboardingHiddenForSession) {
      clearHomebaseTipsCard(tipCard);
      return;
    }

    renderHomebaseOnboardingCard(tipCard);
    return;
  }

  if (homebaseOnboardingCompletedThisSession) {
    clearHomebaseTipsCard(tipCard);
    return;
  }

  if (getHomebaseLocalStorageItem(HOMEBASE_TIPS_DISABLED_KEY) === 'true') {
    clearHomebaseTipsCard(tipCard);
    return;
  }

  const todayKey = getLocalDateKey();
  const dismissedDate = getHomebaseLocalStorageItem(HOMEBASE_TIP_DISMISSED_DATE_KEY);

  if (dismissedDate === todayKey) {
    clearHomebaseTipsCard(tipCard);
    return;
  }

  const storedIndex = getHomebaseLocalStorageItem(HOMEBASE_TIP_LAST_INDEX_KEY);
  const initialIndex = homebaseTipCurrentIndex === null
    ? normalizeHomebaseTipIndex(storedIndex)
    : normalizeHomebaseTipIndex(homebaseTipCurrentIndex);

  renderHomebaseDailyTipCard(tipCard, initialIndex);

}
