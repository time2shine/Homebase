// ===============================================
// --- TIME AND DATE ---
// ===============================================

let timeFormatPreference = '12-hour';
let timeIntervalId = null;
let timeInitialized = false;

function updateTime() {
  const now = new Date();
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  const useHour12 = timeFormatPreference === '12-hour';

  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: useHour12 });
  }

  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);
  }

  revealWidget('.widget-time');
}

const HomebaseTimeWidgetController = {
  initialize() {
    if (timeInitialized) return;
    timeInitialized = true;

    updateTime();

    if (!timeIntervalId) {
      timeIntervalId = setInterval(updateTime, 1000 * 60);
    }
  },

  destroy() {
    if (timeIntervalId) {
      clearInterval(timeIntervalId);
      timeIntervalId = null;
    }
    timeInitialized = false;
  },

  pause() {
    if (timeIntervalId) {
      clearInterval(timeIntervalId);
      timeIntervalId = null;
    }
  },

  resume() {
    if (!timeInitialized) return;
    updateTime();
    if (!timeIntervalId) {
      timeIntervalId = setInterval(updateTime, 1000 * 60);
    }
  }
};

function applyTimeFormatPreference(format = '12-hour', options = {}) {
  timeFormatPreference = format === '12-hour' ? '12-hour' : '24-hour';

  if (options.persist) {
    if (typeof HomebaseWidgetStorage !== 'undefined' && HomebaseWidgetStorage.setTimeFormat) {
      HomebaseWidgetStorage.setTimeFormat(timeFormatPreference).catch(() => {});
      return;
    }

    try {
      localStorage.setItem('fast-time-format', timeFormatPreference);
    } catch (e) {
      // Ignore if cookies/storage are disabled
    }

    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set('appTimeFormatPreference', timeFormatPreference).catch(() => {});
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      browser.storage.local.set({ appTimeFormatPreference: timeFormatPreference }).catch(() => {});
    }
  } else {
    try {
      localStorage.setItem('fast-time-format', timeFormatPreference);
    } catch (e) {
      // Ignore if cookies/storage are disabled
    }
  }
}

function setTimeFormatPreference(format = '12-hour', options = {}) {
  return applyTimeFormatPreference(format, { persist: true, ...options });
}

if (typeof window !== 'undefined') {
  window.updateTime = updateTime;
  window.applyTimeFormatPreference = applyTimeFormatPreference;
  window.setTimeFormatPreference = setTimeFormatPreference;
  window.HomebaseTimeWidgetController = HomebaseTimeWidgetController;
}
if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
  HomebaseWidgetLifecycle.registerWidget('time', HomebaseTimeWidgetController);
}
