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

function applyTimeFormatPreference(format = '12-hour') {

  timeFormatPreference = format === '12-hour' ? '12-hour' : '24-hour';

  // FIX: Sync to localStorage so instant_load.js knows the preference immediately
  try {
    localStorage.setItem('fast-time-format', timeFormatPreference);
  } catch (e) {
    // Ignore if cookies/storage are disabled
  }

}
