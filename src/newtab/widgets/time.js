// ===============================================

// --- TIME AND DATE ---

// ===============================================

let timeFormatPreference = '12-hour';

function updateTime() {

  const now = new Date();

  const timeEl = document.getElementById('current-time');

  const dateEl = document.getElementById('current-date');

  const useHour12 = timeFormatPreference === '12-hour';

  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: useHour12 });

  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };

  dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);



  revealWidget('.widget-time');

}

function applyTimeFormatPreference(format = '12-hour', options = {}) {
  timeFormatPreference = format === '12-hour' ? '12-hour' : '24-hour';

  // FIX: Sync to localStorage so instant_load.js knows the preference immediately
  try {
    localStorage.setItem('fast-time-format', timeFormatPreference);
  } catch (e) {
    // Ignore if cookies/storage are disabled
  }

  if (options.persist) {
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set('appTimeFormatPreference', timeFormatPreference).catch(() => {});
    } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      browser.storage.local.set({ appTimeFormatPreference: timeFormatPreference }).catch(() => {});
    }
  }
}

function setTimeFormatPreference(format = '12-hour', options = {}) {
  return applyTimeFormatPreference(format, { persist: true, ...options });
}

if (typeof window !== 'undefined') {
  window.applyTimeFormatPreference = applyTimeFormatPreference;
  window.setTimeFormatPreference = setTimeFormatPreference;
}
