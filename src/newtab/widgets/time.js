// ===============================================
// --- TIME AND DATE WIDGET CONTROLLER ---
// ===============================================

(function () {
  'use strict';

  // Private state
  let timeFormatPreference = '12-hour';
  let timeIntervalId = null;
  let timeInitialized = false;

  // Private DOM element cache
  let domElements = null;

  function resolveDomElements() {
    if (typeof document === 'undefined') {
      return { timeEl: null, dateEl: null };
    }
    return {
      timeEl: document.getElementById('current-time'),
      dateEl: document.getElementById('current-date')
    };
  }

  function getDomElements() {
    if (!domElements || (!domElements.timeEl && !domElements.dateEl)) {
      domElements = resolveDomElements();
    }
    return domElements;
  }

  function updateTime() {
    const dom = getDomElements();
    const now = new Date();
    const useHour12 = timeFormatPreference === '12-hour';

    if (dom.timeEl) {
      dom.timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: useHour12 });
    }

    if (dom.dateEl) {
      const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
      dom.dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);
    }

    if (typeof revealWidget === 'function') {
      revealWidget('.widget-time');
    }
  }

  function applyTimeFormatPreference(format = '12-hour', options = {}) {
    timeFormatPreference = format === '12-hour' ? '12-hour' : '24-hour';
    updateTime();

    if (options.persist) {
      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setTimeFormat === 'function') {
        HomebaseWidgetStorage.setTimeFormat(timeFormatPreference).catch(() => {});
      }
    } else {
      if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setFastMirror === 'function') {
        HomebaseWidgetStorage.setFastMirror('fast-time-format', timeFormatPreference);
      }
    }
  }

  function setTimeFormatPreference(format = '12-hour', options = {}) {
    return applyTimeFormatPreference(format, { persist: true, ...options });
  }

  function initialize() {
    if (timeInitialized) return;
    timeInitialized = true;

    domElements = resolveDomElements();

    if (typeof HomebaseWidgetStorage !== 'undefined') {
      if (typeof HomebaseWidgetStorage.getFastMirror === 'function') {
        const cachedFormat = HomebaseWidgetStorage.getFastMirror('fast-time-format');
        if (cachedFormat === '12-hour' || cachedFormat === '24-hour') {
          timeFormatPreference = cachedFormat;
        }
      }
      if (typeof HomebaseWidgetStorage.getTimeFormat === 'function') {
        HomebaseWidgetStorage.getTimeFormat().then((format) => {
          if (format === '12-hour' || format === '24-hour') {
            timeFormatPreference = format;
            updateTime();
          }
        }).catch(() => {});
      }
    }

    updateTime();

    if (!timeIntervalId) {
      timeIntervalId = setInterval(updateTime, 1000 * 60);
    }
  }

  function destroy() {
    if (timeIntervalId) {
      clearInterval(timeIntervalId);
      timeIntervalId = null;
    }
    timeInitialized = false;
    domElements = null;
  }

  function onShow() {
    if (!timeInitialized) {
      initialize();
      return;
    }
    updateTime();
  }

  function onHide() {}

  function pause() {
    if (timeIntervalId) {
      clearInterval(timeIntervalId);
      timeIntervalId = null;
    }
  }

  function resume() {
    if (!timeInitialized) return;
    updateTime();
    if (!timeIntervalId) {
      timeIntervalId = setInterval(updateTime, 1000 * 60);
    }
  }

  const HomebaseWidgetTime = {
    initialize,
    init: initialize,
    destroy,
    onShow,
    onHide,
    pause,
    resume,
    update: updateTime,
    updateTime,
    applyTimeFormatPreference,
    setTimeFormatPreference
  };

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope) {
    globalScope.HomebaseWidgetTime = HomebaseWidgetTime;
    globalScope.HomebaseTimeWidgetController = HomebaseWidgetTime;
    globalScope.updateTime = updateTime;
    globalScope.applyTimeFormatPreference = applyTimeFormatPreference;
    globalScope.setTimeFormatPreference = setTimeFormatPreference;
  }
  if (typeof window !== 'undefined' && globalScope !== window) {
    window.HomebaseWidgetTime = HomebaseWidgetTime;
    window.HomebaseTimeWidgetController = HomebaseWidgetTime;
    window.updateTime = updateTime;
    window.applyTimeFormatPreference = applyTimeFormatPreference;
    window.setTimeFormatPreference = setTimeFormatPreference;
  }

  if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
    HomebaseWidgetLifecycle.registerWidget('time', HomebaseWidgetTime);
  }
})();
