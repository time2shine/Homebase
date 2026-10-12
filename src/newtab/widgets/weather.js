// ===============================================
// --- WEATHER WIDGET & SETTINGS CONTROLLER ---
// ===============================================

(function () {
  'use strict';

  const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
  const WEATHER_FETCH_TIMEOUT_MS = 7000;
  const APP_SHOW_WEATHER_KEY = 'appShowWeather';

  // Private state
  let weatherListenerRegistry = null;
  let weatherInitialized = false;
  let selectedLocation = null;
  let searchTimeout = null;
  let geoAbortController = null;
  let geoRequestId = 0;
  let weatherAbortController = null;
  let weatherRefreshInFlight = false;

  // Private DOM element cache
  let domElements = null;

  function resolveDomElements() {
    if (typeof document === 'undefined') {
      return {
        weatherWidget: null,
        weatherSetup: null,
        weatherChooseCityBtn: null,
        weatherSettingsModal: null,
        weatherSettingsCloseBtn: null,
        weatherSettingsCancelBtn: null,
        weatherSettingsSaveBtn: null,
        weatherTempUnitToggle: null,
        weatherLocationInput: null,
        weatherLocationResults: null,
        weatherUseCurrentBtn: null,
        weatherRefreshBtn: null,
        weatherUpdatedEl: null,
        weatherBody: null,
        weatherFooter: null
      };
    }
    const weatherWidget = document.querySelector('.widget-weather');
    return {
      weatherWidget,
      weatherSetup: document.getElementById('weather-setup'),
      weatherChooseCityBtn: document.getElementById('weather-choose-city-btn'),
      weatherSettingsModal: document.getElementById('weather-settings-modal'),
      weatherSettingsCloseBtn: document.getElementById('weather-settings-close-btn'),
      weatherSettingsCancelBtn: document.getElementById('weather-settings-cancel-btn'),
      weatherSettingsSaveBtn: document.getElementById('weather-settings-save-btn'),
      weatherTempUnitToggle: document.getElementById('modal-temp-unit-toggle'),
      weatherLocationInput: document.getElementById('modal-location-input'),
      weatherLocationResults: document.getElementById('modal-location-results'),
      weatherUseCurrentBtn: document.getElementById('modal-set-location-auto-btn'),
      weatherRefreshBtn: document.getElementById('weather-refresh-btn'),
      weatherUpdatedEl: document.getElementById('weather-updated'),
      weatherBody: weatherWidget ? weatherWidget.querySelector('.weather-body') : null,
      weatherFooter: weatherWidget ? weatherWidget.querySelector('.weather-footer') : null
    };
  }

  function getDomElements() {
    if (!domElements || !domElements.weatherWidget) {
      domElements = resolveDomElements();
    }
    return domElements;
  }

async function weatherStorageGet(keys) {
  if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getWeatherSettings === 'function') {
    const res = await HomebaseWidgetStorage.getWeatherSettings(keys);
    if (typeof keys === 'string') return { [keys]: res[keys] };
    return res;
  }
  if (typeof HomebaseStorage !== 'undefined') {
    if (typeof keys === 'string' && HomebaseStorage.get) {
      const val = await HomebaseStorage.get(keys);
      return { [keys]: val };
    }
    if (Array.isArray(keys) && HomebaseStorage.getMany) {
      return await HomebaseStorage.getMany(keys);
    }
  }
  if (typeof browser !== 'undefined' && browser.storage?.local?.get) {
    return await browser.storage.local.get(keys);
  }
  return {};
}

async function weatherStorageSet(items) {
  if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setWeatherSettings === 'function') {
    return await HomebaseWidgetStorage.setWeatherSettings(items);
  }
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
    return await HomebaseStorage.setMany(items);
  }
  if (typeof browser !== 'undefined' && browser.storage?.local?.set) {
    return await browser.storage.local.set(items);
  }
}

async function weatherStorageRemove(keys) {
  if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.removeWeatherSettings === 'function') {
    return await HomebaseWidgetStorage.removeWeatherSettings(keys);
  }
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.remove) {
    return await HomebaseStorage.remove(keys);
  }
  if (typeof browser !== 'undefined' && browser.storage?.local?.remove) {
    return await browser.storage.local.remove(keys);
  }
}

function setWeatherLoadingState(isLoading) {
  const dom = getDomElements();
  if (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.setWeatherLoadingState) {
    HomebaseWeatherCardRenderer.setWeatherLoadingState(isLoading, { weatherWidget: dom.weatherWidget, weatherRefreshBtn: dom.weatherRefreshBtn });
    return;
  }
  const loading = Boolean(isLoading);

  if (dom.weatherWidget) {
    dom.weatherWidget.classList.toggle('weather-loading', loading);
    dom.weatherWidget.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  if (dom.weatherRefreshBtn) {
    dom.weatherRefreshBtn.disabled = loading;
    dom.weatherRefreshBtn.setAttribute('aria-label', loading ? 'Refreshing weather' : 'Refresh weather');
  }
}

function normalizeWeatherTimestamp(timestamp) {
  if (typeof timestamp === 'number') return Number.isFinite(timestamp) ? timestamp : null;
  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isWeatherCacheStale(timestamp, ttlMs = WEATHER_CACHE_TTL_MS) {
  const cachedAt = normalizeWeatherTimestamp(timestamp);
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt > ttlMs;
}

function getCachedWeatherTimestamp(data = {}) {
  return normalizeWeatherTimestamp(data.weatherFetchedAt ?? data.cachedWeatherData?.__timestamp);
}

function hasUsableCachedWeather(data) {
  if (!data || typeof data !== 'object') return false;
  const currentWeather = data.current_weather;
  if (!currentWeather || typeof currentWeather !== 'object') return false;
  return currentWeather.temperature !== undefined || currentWeather.weathercode !== undefined;
}

function getCachedWeatherDisplayOptions(timestamp, options = {}) {
  const { cacheReason = '', forceCached = false, skipCacheSave = false } = options;
  if (cacheReason) return { isCached: true, cacheReason, skipCacheSave };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { isCached: true, cacheReason: 'Offline cache', skipCacheSave };
  }
  if (forceCached || isWeatherCacheStale(timestamp, WEATHER_CACHE_TTL_MS)) {
    return { isCached: true, cacheReason: 'Cached data', skipCacheSave };
  }
  return { isCached: false, cacheReason: '', skipCacheSave };
}

function markWeatherAsCachedOrStale(options = {}) {
  const dom = getDomElements();
  if (!dom.weatherWidget) return;
  const marked = Boolean(options.isCached || options.cacheReason);
  dom.weatherWidget.classList.toggle('weather-cached', marked);
}

function showWeatherOfflineNoCache() {
  const dom = getDomElements();
  if (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.renderWeatherOfflineUI) {
    HomebaseWeatherCardRenderer.renderWeatherOfflineUI({
      weatherWidget: dom.weatherWidget,
      weatherSetup: dom.weatherSetup,
      weatherBody: dom.weatherBody,
      weatherFooter: dom.weatherFooter,
      updatedEl: dom.weatherUpdatedEl
    });
    return;
  }
  setText(document.getElementById('weather-city'), 'Weather Offline');
  setText(document.getElementById('weather-temp'), '--\u00b0');
  setText(document.getElementById('weather-desc'), 'No cached weather yet');
  setText(document.getElementById('weather-icon'), '-');
  setText(document.getElementById('weather-pressure'), '--');
  setText(document.getElementById('weather-humidity'), '--');
  setText(document.getElementById('weather-cloudcover'), '--');
  setText(document.getElementById('weather-precip-prob'), '--');
  setText(document.getElementById('weather-sunrise'), '--');
  setText(document.getElementById('weather-sunset'), '--');
  setAttr(document.getElementById('weather-icon'), 'data-weather-code', '');

  const updatedEl = dom.weatherUpdatedEl || document.getElementById('weather-updated');
  if (updatedEl) setText(updatedEl, 'Connect to the internet to load weather');

  if (dom.weatherSetup) dom.weatherSetup.classList.add('hidden');
  if (dom.weatherBody) dom.weatherBody.classList.remove('hidden');
  if (dom.weatherFooter) dom.weatherFooter.classList.remove('hidden');
  if (dom.weatherWidget) {
    dom.weatherWidget.classList.remove('weather-error', 'weather-cached');
  }
  if (typeof revealWidget === 'function') {
    revealWidget('.widget-weather');
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = WEATHER_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : WEATHER_FETCH_TIMEOUT_MS;
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeout);

  if (options && options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error('Weather request timed out');
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function showWeatherSetupUI(options = {}) {
  const dom = getDomElements();
  if (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.setWeatherSetupUIState) {
    HomebaseWeatherCardRenderer.setWeatherSetupUIState({ visible: true, ...options }, {
      weatherWidget: dom.weatherWidget,
      weatherSetup: dom.weatherSetup,
      weatherBody: dom.weatherBody,
      weatherFooter: dom.weatherFooter
    });
    return;
  }
  const { hideBody = true, isError = false } = options;
  if (dom.weatherWidget) {
    dom.weatherWidget.classList.toggle('weather-error', Boolean(isError));
    dom.weatherWidget.classList.remove('weather-cached');
  }
  if (dom.weatherSetup) dom.weatherSetup.classList.remove('hidden');
  if (hideBody) {
    if (dom.weatherBody) dom.weatherBody.classList.add('hidden');
    if (dom.weatherFooter) dom.weatherFooter.classList.add('hidden');
  } else {
    if (dom.weatherBody) dom.weatherBody.classList.remove('hidden');
    if (dom.weatherFooter) dom.weatherFooter.classList.remove('hidden');
  }
  if (typeof revealWidget === 'function') {
    revealWidget('.widget-weather');
  }
}

function hideWeatherSetupUI() {
  const dom = getDomElements();
  if (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.setWeatherSetupUIState) {
    HomebaseWeatherCardRenderer.setWeatherSetupUIState({ visible: false }, {
      weatherWidget: dom.weatherWidget,
      weatherSetup: dom.weatherSetup,
      weatherBody: dom.weatherBody,
      weatherFooter: dom.weatherFooter
    });
    return;
  }
  if (dom.weatherSetup) dom.weatherSetup.classList.add('hidden');
  if (dom.weatherBody) dom.weatherBody.classList.remove('hidden');
  if (dom.weatherFooter) dom.weatherFooter.classList.remove('hidden');
  if (dom.weatherWidget) dom.weatherWidget.classList.remove('weather-error');
}



function getWeatherEmoji(code) {

  const weatherCode = Number(code);

  if ([0].includes(weatherCode)) return '☀️'; // Clear sky

  if ([1].includes(weatherCode)) return '🌤️'; // Mainly clear

  if ([2].includes(weatherCode)) return '⛅'; // Partly cloudy

  if ([3].includes(weatherCode)) return '☁️'; // Overcast

  if ([45, 48].includes(weatherCode)) return '🌫️'; // Fog

  if ([51, 53, 55].includes(weatherCode)) return '🌦️'; // Drizzle

  if ([56, 57].includes(weatherCode)) return '🌧️'; // Freezing drizzle

  if ([61].includes(weatherCode)) return '🌦️'; // Slight rain

  if ([63].includes(weatherCode)) return '🌧️'; // Moderate rain

  if ([65].includes(weatherCode)) return '⛈️'; // Heavy rain

  if ([66, 67].includes(weatherCode)) return '🌧️'; // Freezing rain

  if ([71].includes(weatherCode)) return '🌨️'; // Slight snow

  if ([73, 75].includes(weatherCode)) return '❄️'; // Moderate/heavy snow

  if ([77].includes(weatherCode)) return '🌨️'; // Snow grains

  if ([80].includes(weatherCode)) return '🌦️'; // Slight showers

  if ([81].includes(weatherCode)) return '🌧️'; // Moderate showers

  if ([82].includes(weatherCode)) return '⛈️'; // Violent showers

  if ([85, 86].includes(weatherCode)) return '🌨️'; // Snow showers

  if ([95].includes(weatherCode)) return '⛈️'; // Thunderstorm

  if ([96, 99].includes(weatherCode)) return '🌩️'; // Thunderstorm with hail

  return '🌡️';

}

function getWeatherDescription(code) {

  if ([0].includes(code)) return 'Clear sky';

  if ([1].includes(code)) return 'Mainly clear';

  if ([2].includes(code)) return 'Partly cloudy';

  if ([3].includes(code)) return 'Overcast';

  if ([45, 48].includes(code)) return 'Fog';

  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';

  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';

  if ([71, 73, 75, 77].includes(code)) return 'Snow';

  if ([80, 81, 82].includes(code)) return 'Rain showers';

  if ([85, 86].includes(code)) return 'Snow showers';

  if ([95, 96, 99].includes(code)) return 'Thunderstorm';

  return 'Unknown';

}



function formatWeatherUpdated(timestamp, options = {}) {

  const { isCached = false, cacheReason = '' } = options;
  const labelPrefix = cacheReason || (isCached ? 'Cached data' : '');

  if (!timestamp) return labelPrefix ? `${labelPrefix} weather data` : '';

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return labelPrefix ? `${labelPrefix} weather data` : '';

  const updatedLabel = `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return labelPrefix ? `${labelPrefix} - ${updatedLabel}` : updatedLabel;

}


async function loadCachedWeather() {

  try {

    let cachedData = null;
    let cachedCityName = '';
    let cachedUnits = 'celsius';
    let cachedTs = null;

    if (typeof HomebaseWidgetStorage !== 'undefined' && HomebaseWidgetStorage.getWeatherCache) {
      const cache = await HomebaseWidgetStorage.getWeatherCache();
      cachedData = cache?.data || null;
      cachedCityName = cache?.cityName || '';
      cachedUnits = cache?.units || 'celsius';
      cachedTs = cache?.fetchedAt ? Number(cache.fetchedAt) : null;
    } else {
      const data = await weatherStorageGet(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);
      cachedData = data.cachedWeatherData;
      cachedCityName = data.cachedCityName;
      cachedUnits = data.cachedUnits || 'celsius';
      cachedTs = getCachedWeatherTimestamp(data);
    }

    if (
      hasUsableCachedWeather(cachedData) &&
      cachedCityName
    ) {

      updateWeatherUI(
        cachedData,
        cachedCityName,
        cachedUnits,
        cachedTs ?? Date.now(),
        getCachedWeatherDisplayOptions(cachedTs, { skipCacheSave: true })
      );

    }

  } catch (error) {

    console.warn('Could not load cached weather:', error);

  }

}



function getCurrentHourlyWeatherIndex(data) {

  const hourly = data?.hourly;

  if (!hourly || typeof hourly !== 'object') return 0;

  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];

  const hourlyLengths = [
    hourlyTimes.length,
    Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m.length : 0,
    Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m.length : 0,
    Array.isArray(hourly.cloudcover) ? hourly.cloudcover.length : 0,
    Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability.length : 0
  ].filter((length) => length > 0);

  if (hourlyLengths.length === 0) return 0;

  const maxIndex = Math.max(...hourlyLengths) - 1;

  const apiCurrentTime = data?.current_weather?.time || data?.current?.time;

  if (hourlyTimes.length > 0) {

    if (apiCurrentTime) {

      const exactIndex = hourlyTimes.indexOf(apiCurrentTime);

      if (exactIndex >= 0) return Math.min(exactIndex, maxIndex);

    }

    const targetTimestamp = new Date(apiCurrentTime || Date.now()).getTime();

    if (Number.isFinite(targetTimestamp)) {

      let nearestIndex = 0;
      let nearestDiff = Infinity;
      const timeLimit = Math.min(hourlyTimes.length - 1, maxIndex);

      for (let i = 0; i <= timeLimit; i += 1) {

        const hourlyTimestamp = new Date(hourlyTimes[i]).getTime();

        if (!Number.isFinite(hourlyTimestamp)) continue;

        const diff = Math.abs(hourlyTimestamp - targetTimestamp);

        if (diff < nearestDiff) {

          nearestDiff = diff;
          nearestIndex = i;

        }

      }

      if (Number.isFinite(nearestDiff)) return nearestIndex;

    }

    const currentHour = new Date().getHours();
    const hourIndex = hourlyTimes.findIndex((time) => {
      if (typeof time !== 'string') return false;
      const match = time.match(/T(\d{2}):/);
      return match ? Number(match[1]) === currentHour : false;
    });

    if (hourIndex >= 0) return Math.min(hourIndex, maxIndex);

  }

  return Math.min(new Date().getHours(), maxIndex);

}



function getHourlyValueAtIndex(hourly, key, index) {

  if (!hourly || typeof hourly !== 'object') return undefined;

  const values = hourly[key];

  if (!Array.isArray(values) || values.length === 0) return undefined;

  const safeIndex = Number.isInteger(index) ? index : 0;

  if (safeIndex < 0 || safeIndex >= values.length) return undefined;

  return values[safeIndex];

}



function normalizeWeatherDisplay(data, cityName, units, fetchedAt = Date.now(), options = {}) {

  if (!data) return null;

  const weather = data.current_weather || {};

  const hourly = data.hourly || {};

  const daily = data.daily || {};

  const tempNumber = Number(weather.temperature);

  const tempValue = Number.isFinite(tempNumber) ? Math.round(tempNumber) : '--';

  const codeNumber = Number(weather.weathercode);

  const code = Number.isFinite(codeNumber) ? codeNumber : weather.weathercode;

  const hourlyIndex = getCurrentHourlyWeatherIndex(data);

  const windValue = Number(getHourlyValueAtIndex(hourly, 'wind_speed_10m', hourlyIndex));

  const humidityValue = Number(getHourlyValueAtIndex(hourly, 'relative_humidity_2m', hourlyIndex));

  const cloudcoverValue = Number(getHourlyValueAtIndex(hourly, 'cloudcover', hourlyIndex));

  const precipProbValue = Number(getHourlyValueAtIndex(hourly, 'precipitation_probability', hourlyIndex));

  const formatPercent = (value) => Number.isFinite(value) ? `${Math.round(value)}%` : '--';

  const windUnit = units === 'fahrenheit' ? 'mph' : 'km/h';

  const wind = Number.isFinite(windValue)
    ? `${Math.round(windValue)}\u00A0${windUnit}`
    : '--';

  const formatSunTime = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s([AP]M)$/i, '\u00A0$1');
  };

  const timestampValue = typeof fetchedAt === 'number' ? fetchedAt : new Date(fetchedAt).getTime();

  const effectiveTimestamp = Number.isFinite(timestampValue) ? timestampValue : Date.now();

  const isCached = Boolean(options.isCached);
  const cacheReason = options.cacheReason || '';

  const unitLabel = units === 'fahrenheit' ? 'F' : 'C';

  return {
    cityName: cityName || 'Weather',
    emoji: getWeatherEmoji(code),
    description: getWeatherDescription(code),
    temperature: `${tempValue === '--' ? '--' : tempValue}\u00b0${unitLabel}`,
    // Legacy property name used for the third metric slot and fast-weather compatibility.
    pressure: wind,
    humidity: formatPercent(humidityValue),
    cloudCover: formatPercent(cloudcoverValue),
    precipitationProbability: formatPercent(precipProbValue),
    sunrise: formatSunTime(Array.isArray(daily.sunrise) ? daily.sunrise[0] : null),
    sunset: formatSunTime(Array.isArray(daily.sunset) ? daily.sunset[0] : null),
    units,
    fetchedAt: effectiveTimestamp,
    isCached,
    cacheReason,
    weatherCode: code ?? '',
    updatedLabel: formatWeatherUpdated(effectiveTimestamp, { isCached, cacheReason })
  };

}



function updateWeatherUI(data, cityName, units, fetchedAt = Date.now(), options = {}) {

  const iconEl = document.getElementById('weather-icon');

  const tempEl = document.getElementById('weather-temp');

  const cityEl = document.getElementById('weather-city');

  const descEl = document.getElementById('weather-desc');

  const pressureEl = document.getElementById('weather-pressure');

  const humidityEl = document.getElementById('weather-humidity');

  const cloudcoverEl = document.getElementById('weather-cloudcover');

  const precipProbEl = document.getElementById('weather-precip-prob');

  const sunriseEl = document.getElementById('weather-sunrise');

  const sunsetEl = document.getElementById('weather-sunset');

  const dom = getDomElements();
  const updatedEl = dom.weatherUpdatedEl || document.getElementById('weather-updated');

  const display = (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.normalizeWeatherDisplay)
    ? HomebaseWeatherCardRenderer.normalizeWeatherDisplay(data, cityName, units, fetchedAt, options)
    : normalizeWeatherDisplay(data, cityName, units, fetchedAt, options);

  if (!display) {
    showWeatherError(new Error('Weather data missing'));
    return;
  }

  if (typeof HomebaseWeatherCardRenderer !== 'undefined' && HomebaseWeatherCardRenderer.renderWeatherUI) {
    HomebaseWeatherCardRenderer.renderWeatherUI(display, {
      cityEl,
      tempEl,
      descEl,
      pressureEl,
      humidityEl,
      cloudcoverEl,
      precipProbEl,
      sunriseEl,
      sunsetEl,
      updatedEl,
      iconEl,
      weatherWidget: dom.weatherWidget,
      weatherSetup: dom.weatherSetup,
      weatherBody: dom.weatherBody,
      weatherFooter: dom.weatherFooter
    });
  } else {
    setText(cityEl, display.cityName);
    setText(tempEl, display.temperature);
    setText(descEl, display.description);
    setText(pressureEl, display.pressure);
    setText(humidityEl, display.humidity);
    setText(cloudcoverEl, display.cloudCover);
    setText(precipProbEl, display.precipitationProbability);
    setText(sunriseEl, display.sunrise);
    setText(sunsetEl, display.sunset);
    if (updatedEl) setText(updatedEl, display.updatedLabel);

    setText(iconEl, display.emoji);
    setAttr(iconEl, 'data-weather-code', display.weatherCode);
    if (iconEl) iconEl.classList.add('is-instant-icon');

    markWeatherAsCachedOrStale(display);
    hideWeatherSetupUI();
    revealWidget('.widget-weather');
  }

  if (!options.skipCacheSave) {
    const fastWeather = {
      city: display.cityName,
      temp: display.temperature,
      desc: display.description,
      icon: display.emoji,
      pressure: display.pressure,
      humidity: display.humidity,
      cloudcover: display.cloudCover,
      precipProb: display.precipitationProbability,
      sunrise: display.sunrise,
      sunset: display.sunset,
      updated: display.updatedLabel,
      __timestamp: display.fetchedAt
    };

    if (typeof HomebaseWidgetStorage !== 'undefined' && HomebaseWidgetStorage.setWeatherCache) {
      HomebaseWidgetStorage.setWeatherCache({
        data,
        cityName: display.cityName,
        units: display.units,
        fetchedAt: display.fetchedAt,
        fastWeather
      }).catch(() => {});
    } else {
      weatherStorageSet({
        cachedWeatherData: data,
        cachedCityName: display.cityName,
        cachedUnits: display.units,
        weatherFetchedAt: display.fetchedAt
      }).catch(() => {});

      try {
        localStorage.setItem('fast-weather', JSON.stringify(fastWeather));
      } catch (e) {
        // If localStorage is unavailable, fail silently; the async path still works.
      }
    }
  }

  revealWidget('.widget-weather');
}



function isWeatherNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const msg = String(error.message || '');
  const name = String(error.name || '');

  if (name === 'TypeError' && /failed to fetch|fetch|load failed/i.test(msg)) {
    return true;
  }
  if (/networkerror|network request failed|failed to fetch|load failed/i.test(msg)) {
    return true;
  }
  if (msg === 'Weather data not available' || msg === 'Weather unavailable offline') {
    return true;
  }
  return false;
}

function isWeatherAbortError(error) {
  return error?.name === 'AbortError';
}

async function showWeatherError(error, options = {}) {
  const { quiet = false, cacheReason = '' } = options;
  const isAbort = isWeatherAbortError(error);
  const isNetwork = isWeatherNetworkError(error);
  const isGeo = error && typeof error === 'object' && 'code' in error && (error.code === 1 || error.code === 2 || error.code === 3);

  if (isAbort || quiet) {
    // Silent for aborted requests or explicit quiet calls
  } else if (isNetwork) {
    console.warn('Weather network unavailable; attempting cached restore:', error?.message || error);
  } else if (isGeo) {
    console.warn('Weather geolocation unavailable:', error?.message || error);
  } else if (error) {
    // True programmatic / unexpected errors remain visible
    console.error('Weather Error:', error);
  }

  try {
    let cachedData = null;
    let cachedCityName = '';
    let cachedUnits = 'celsius';
    let cachedTs = null;

    if (typeof HomebaseWidgetStorage !== 'undefined' && HomebaseWidgetStorage.getWeatherCache) {
      const cache = await HomebaseWidgetStorage.getWeatherCache();
      cachedData = cache?.data || null;
      cachedCityName = cache?.cityName || '';
      cachedUnits = cache?.units || 'celsius';
      cachedTs = cache?.fetchedAt ? Number(cache.fetchedAt) : null;
    } else {
      const data = await weatherStorageGet(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);
      cachedData = data.cachedWeatherData;
      cachedCityName = data.cachedCityName;
      cachedUnits = data.cachedUnits || 'celsius';
      cachedTs = getCachedWeatherTimestamp(data);
    }

    if (hasUsableCachedWeather(cachedData) && cachedCityName) {
      const finalTs = cachedTs ?? Date.now();
      updateWeatherUI(
        cachedData,
        cachedCityName,
        cachedUnits,
        finalTs,
        getCachedWeatherDisplayOptions(finalTs, { cacheReason, forceCached: true, skipCacheSave: true })
      );
      return;
    }
  } catch (cacheError) {
    console.warn('Could not restore cached weather after error:', cacheError);
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    showWeatherOfflineNoCache();
    return;
  }

  setText(document.getElementById('weather-city'), 'Weather Error');
  setText(document.getElementById('weather-temp'), '--\u00b0');
  setText(document.getElementById('weather-desc'), 'Could not load data');
  setText(document.getElementById('weather-icon'), '-');
  setText(document.getElementById('weather-pressure'), '--');
  setText(document.getElementById('weather-humidity'), '--');
  setText(document.getElementById('weather-cloudcover'), '--');
  setText(document.getElementById('weather-precip-prob'), '--');
  setText(document.getElementById('weather-sunrise'), '--');
  setText(document.getElementById('weather-sunset'), '--');
  setAttr(document.getElementById('weather-icon'), 'data-weather-code', '');

  const updatedEl = document.getElementById('weather-updated');
  if (updatedEl) setText(updatedEl, 'Choose a city or use your location to try again');

  showWeatherSetupUI({ hideBody: false, isError: true });
}




async function fetchWeather(lat, lon, units, cityName) {

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await showWeatherError(new Error('Weather unavailable offline'), { cacheReason: 'Offline cache' });
    return;
  }

  if (weatherAbortController) {
    try {
      weatherAbortController.abort();
    } catch (_) {}
  }
  const abortCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  weatherAbortController = abortCtrl;

  try {

    const hourlyParams = 'relative_humidity_2m,wind_speed_10m,cloudcover,precipitation_probability';

    const dailyParams = 'sunrise,sunset';

    const windSpeedUnitParam = units === 'fahrenheit' ? '&wind_speed_unit=mph' : '';

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true&temperature_unit=${units}` +
      `&hourly=${hourlyParams}&daily=${dailyParams}` +
      `&forecast_days=1&timezone=auto${windSpeedUnitParam}`;

    const fetchOpts = abortCtrl ? { signal: abortCtrl.signal } : {};
    const weatherResponse = await fetchWithTimeout(weatherUrl, fetchOpts, WEATHER_FETCH_TIMEOUT_MS);

    if (!weatherResponse.ok) throw new Error('Weather data not available');

    const weatherData = await weatherResponse.json();

    updateWeatherUI(weatherData, cityName, units, Date.now());

  } catch (error) {

    if (abortCtrl && abortCtrl.signal.aborted) {
      return;
    }
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cacheReason = isOffline ? 'Offline cache' : 'Cached data';
    await showWeatherError(error, { cacheReason });

  } finally {
    if (weatherAbortController === abortCtrl) {
      weatherAbortController = null;
    }
  }

}

// Sanity: There must be only ONE of each:
// fetchWeather / showWeatherError / updateWeatherUI / setText / setAttr / formatWeatherUpdated

function setWeatherPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  if (typeof appShowWeatherPreference !== 'undefined') {
    appShowWeatherPreference = shouldShow;
  }
  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope && 'appShowWeatherPreference' in globalScope) {
    globalScope.appShowWeatherPreference = shouldShow;
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle('weather-hidden', !shouldShow);
  }

  if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setFastMirror === 'function') {
    HomebaseWidgetStorage.setFastMirror('fast-show-weather', shouldShow ? '1' : '0');
  }

  if (options.persist !== false) {
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setWeatherVisibility === 'function') {
      HomebaseWidgetStorage.setWeatherVisibility(shouldShow).catch((err) => {
        console.warn('Failed to save weather visibility preference', err);
      });
    } else if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set(APP_SHOW_WEATHER_KEY, shouldShow).catch((err) => {
        console.warn('Failed to save weather visibility preference', err);
      });
    } else if (typeof browser !== 'undefined' && browser.storage?.local?.set) {
      browser.storage.local
        .set({ [APP_SHOW_WEATHER_KEY]: shouldShow })
        .catch((err) => {
          console.warn('Failed to save weather visibility preference', err);
        });
    }
  }

  if (options.applyVisibility !== false && typeof applyWidgetVisibility === 'function') {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false && typeof updateWidgetSettingsUI === 'function') {
    updateWidgetSettingsUI();
  }
}

function startGeolocation() {

  if (!('geolocation' in navigator)) {

    showWeatherError(new Error('Geolocation not supported'));

    return Promise.resolve();

  }

  return new Promise((resolve) => {

    navigator.geolocation.getCurrentPosition(

      async (position) => {

        try {

          const lat = position.coords.latitude, lon = position.coords.longitude;

          await weatherStorageSet({

            weatherLat: lat,

            weatherLon: lon,

            weatherCityName: 'Current Location'

          });

          const data = await weatherStorageGet('weatherUnits');

          await fetchWeather(lat, lon, data.weatherUnits || 'celsius', 'Current Location');

        } catch (err) {

          showWeatherError(err);

        } finally {

          resolve();

        }

      },

      (err) => {

        showWeatherError(err);

        resolve();

      }

    );

  });

}



async function searchForLocation(searchTerm) {

  const dom = getDomElements();
  if (!dom.weatherLocationInput || !dom.weatherLocationResults) return;

  const query = (typeof searchTerm === 'string' ? searchTerm : dom.weatherLocationInput.value || '').trim();

  const requestId = ++geoRequestId;

  if (geoAbortController) {

    geoAbortController.abort();

    geoAbortController = null;

  }

  if (query.length < 3) {

    dom.weatherLocationResults.innerHTML = '';

    dom.weatherLocationResults.classList.add('hidden');

    return;

  }

  geoAbortController = new AbortController();

  const { signal } = geoAbortController;

  try {

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;

    const geoResponse = await fetch(geoUrl, { signal });

    const geoData = await geoResponse.json();

    if (requestId !== geoRequestId) return;

    dom.weatherLocationResults.innerHTML = '';

    if (geoData.results && geoData.results.length > 0) {

      geoData.results.forEach(result => {

        const item = document.createElement('div');

        item.className = 'location-result-item';

        item.textContent = '';
        item.appendChild(document.createTextNode(`${result.name}, `));
        const meta = document.createElement('span');
        meta.textContent = `${result.admin1 || ''} ${result.country}`;
        item.appendChild(meta);

        item.addEventListener('click', () => {

          selectedLocation = result;

          if (dom.weatherLocationInput) dom.weatherLocationInput.value = `${result.name}, ${result.country}`;

          if (dom.weatherLocationResults) {
            dom.weatherLocationResults.classList.add('hidden');
            dom.weatherLocationResults.innerHTML = '';
          }

        });

        dom.weatherLocationResults.appendChild(item);

      });

      dom.weatherLocationResults.classList.remove('hidden');

    } else {

      dom.weatherLocationResults.classList.add('hidden');

    }

  } catch (error) {

    if (error?.name === 'AbortError') return; // Expected when a newer request wins

    console.error('Location search error:', error);

  } finally {

    if (requestId === geoRequestId && geoAbortController?.signal === signal) {

      geoAbortController = null;

    }

  }

}


function closeWeatherSettingsModal() {
  if (typeof closeModalWithAnimation === 'function') {
    closeModalWithAnimation('weather-settings-modal', '.dialog-content');
  }
}

async function openWeatherSettingsModal(triggerSource) {
  const dom = getDomElements();
  if (!dom.weatherSettingsModal) return;
  const data = await weatherStorageGet(['weatherCityName', 'weatherUnits']);
  if (dom.weatherTempUnitToggle) {
    dom.weatherTempUnitToggle.checked = data.weatherUnits === 'fahrenheit';
  }
  if (dom.weatherLocationInput) {
    dom.weatherLocationInput.value = (data.weatherCityName === 'Current Location') ? '' : (data.weatherCityName || '');
  }
  selectedLocation = null;
  if (dom.weatherLocationResults) {
    dom.weatherLocationResults.classList.add('hidden');
    dom.weatherLocationResults.innerHTML = '';
  }
  if (typeof openModalWithAnimation === 'function') {
    openModalWithAnimation('weather-settings-modal', triggerSource || null, '.dialog-content');
  }
}


  async function initialize() {
    if (weatherInitialized) return;
    weatherInitialized = true;

    domElements = resolveDomElements();
    const dom = domElements;

    if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.createListenerRegistry === 'function') {
      weatherListenerRegistry = HomebaseWidgetLifecycle.createListenerRegistry();
    } else {
      weatherListenerRegistry = {
        on(target, type, fn, opt) { target?.addEventListener(type, fn, opt); },
        removeAll() {}
      };
    }

    if (dom.weatherChooseCityBtn) {
      weatherListenerRegistry.on(dom.weatherChooseCityBtn, 'click', async () => {
        await openWeatherSettingsModal(dom.weatherChooseCityBtn);
        if (dom.weatherLocationInput) dom.weatherLocationInput.focus();
      });
    }

    if (dom.weatherUseCurrentBtn) {
      weatherListenerRegistry.on(dom.weatherUseCurrentBtn, 'click', async () => {
        await weatherStorageRemove(['weatherLat', 'weatherLon', 'weatherCityName']);
        startGeolocation();
        closeWeatherSettingsModal();
      });
    }

    if (dom.weatherRefreshBtn) {
      weatherListenerRegistry.on(dom.weatherRefreshBtn, 'click', async () => {
        if (weatherRefreshInFlight) return;
        weatherRefreshInFlight = true;
        setWeatherLoadingState(true);

        try {
          const data = await weatherStorageGet(['weatherLat', 'weatherLon', 'weatherUnits', 'weatherCityName']);
          const units = data.weatherUnits || 'celsius';

          if (data.weatherLat && data.weatherLon) {
            await fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName || 'Current Location');
          } else {
            showWeatherSetupUI();
          }
        } finally {
          weatherRefreshInFlight = false;
          setWeatherLoadingState(false);
        }
      });
    }

    if (dom.weatherLocationInput) {
      weatherListenerRegistry.on(dom.weatherLocationInput, 'input', () => {
        clearTimeout(searchTimeout);
        const value = dom.weatherLocationInput ? dom.weatherLocationInput.value : '';
        searchTimeout = setTimeout(() => searchForLocation(value), 300);
      });
    }

    if (dom.weatherSettingsCloseBtn) {
      weatherListenerRegistry.on(dom.weatherSettingsCloseBtn, 'click', closeWeatherSettingsModal);
    }

    if (dom.weatherSettingsCancelBtn) {
      weatherListenerRegistry.on(dom.weatherSettingsCancelBtn, 'click', closeWeatherSettingsModal);
    }

    if (dom.weatherSettingsModal) {
      weatherListenerRegistry.on(dom.weatherSettingsModal, 'click', (e) => {
        if (e.target === dom.weatherSettingsModal) {
          closeWeatherSettingsModal();
        }
      });
    }

    if (dom.weatherSettingsSaveBtn) {
      weatherListenerRegistry.on(dom.weatherSettingsSaveBtn, 'click', async () => {
        const newUnit = dom.weatherTempUnitToggle?.checked ? 'fahrenheit' : 'celsius';
        const existingLocation = await weatherStorageGet(['weatherLat', 'weatherLon', 'weatherCityName']);
        const settingsToSave = { weatherUnits: newUnit };

        if (selectedLocation) {
          settingsToSave.weatherLat = selectedLocation.latitude;
          settingsToSave.weatherLon = selectedLocation.longitude;
          settingsToSave.weatherCityName = selectedLocation.name;
        } else if (existingLocation.weatherLat && existingLocation.weatherLon && existingLocation.weatherCityName) {
          settingsToSave.weatherLat = existingLocation.weatherLat;
          settingsToSave.weatherLon = existingLocation.weatherLon;
          settingsToSave.weatherCityName = existingLocation.weatherCityName;
        }

        await weatherStorageSet(settingsToSave);

        const data = await weatherStorageGet(['weatherLat', 'weatherLon', 'weatherCityName', 'weatherUnits']);
        if (data.weatherLat) {
          fetchWeather(data.weatherLat, data.weatherLon, data.weatherUnits, data.weatherCityName);
        } else {
          showWeatherSetupUI();
        }

        closeWeatherSettingsModal();
      });
    }

    const data = await weatherStorageGet([
      'weatherLat',
      'weatherLon',
      'weatherCityName',
      'weatherUnits',
      'weatherFetchedAt',
      'cachedWeatherData',
      'cachedCityName',
      'cachedUnits'
    ]);

    const units = data.weatherUnits || data.cachedUnits || 'celsius';
    const cachedTs = getCachedWeatherTimestamp(data);
    const hasCachedWeather = hasUsableCachedWeather(data.cachedWeatherData) && data.cachedCityName;
    const renderCachedWeather = (options = getCachedWeatherDisplayOptions(cachedTs, { skipCacheSave: true })) => {
      updateWeatherUI(
        data.cachedWeatherData,
        data.cachedCityName,
        data.cachedUnits || units,
        cachedTs ?? Date.now(),
        options
      );
    };

    if (data.weatherLat && data.weatherLon) {
      if (hasCachedWeather) {
        renderCachedWeather();
      } else {
        hideWeatherSetupUI();
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (hasCachedWeather) {
          if (typeof hbDebugInfo === 'function') hbDebugInfo('Weather is offline. Using cached weather data.');
        } else {
          showWeatherOfflineNoCache();
        }
        return;
      }

      const lastFetch = normalizeWeatherTimestamp(data.weatherFetchedAt) ?? cachedTs ?? 0;

      if (!hasCachedWeather || !lastFetch || isWeatherCacheStale(lastFetch, WEATHER_CACHE_TTL_MS)) {
        if (typeof hbDebugInfo === 'function') hbDebugInfo('Weather cache expired. Fetching new data...');
        fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName);
      } else {
        if (typeof hbDebugInfo === 'function') hbDebugInfo('Using cached weather data.');
      }

      return;
    }

    if (hasCachedWeather) {
      renderCachedWeather();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showWeatherOfflineNoCache();
      return;
    }

    showWeatherSetupUI();
  }

  function destroy() {
    if (weatherListenerRegistry) {
      weatherListenerRegistry.removeAll();
      weatherListenerRegistry = null;
    }
    clearTimeout(searchTimeout);
    searchTimeout = null;
    if (geoAbortController) {
      try {
        geoAbortController.abort();
      } catch (_) {}
      geoAbortController = null;
    }
    if (weatherAbortController) {
      try {
        weatherAbortController.abort();
      } catch (_) {}
      weatherAbortController = null;
    }
    selectedLocation = null;
    weatherRefreshInFlight = false;
    weatherInitialized = false;
    domElements = null;
  }

  function onHide() {
    clearTimeout(searchTimeout);
    searchTimeout = null;
    if (geoAbortController) {
      try {
        geoAbortController.abort();
      } catch (_) {}
      geoAbortController = null;
    }
    if (weatherAbortController) {
      try {
        weatherAbortController.abort();
      } catch (_) {}
      weatherAbortController = null;
    }
  }

  function pause() {
    clearTimeout(searchTimeout);
    searchTimeout = null;
    if (geoAbortController) {
      try {
        geoAbortController.abort();
      } catch (_) {}
      geoAbortController = null;
    }
    if (weatherAbortController) {
      try {
        weatherAbortController.abort();
      } catch (_) {}
      weatherAbortController = null;
    }
  }

  async function resume() {
    if (!weatherInitialized) return;
    try {
      const data = await loadCachedWeather();
      const cachedTs = normalizeWeatherTimestamp(data?.weatherTimestamp);
      const lastFetch = normalizeWeatherTimestamp(data?.weatherFetchedAt) ?? cachedTs ?? 0;
      const settings = (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getWeatherSettings === 'function')
        ? await HomebaseWidgetStorage.getWeatherSettings()
        : await weatherStorageGet(['weatherLat', 'weatherLon', 'weatherUnits', 'weatherCityName']);

      const lat = settings?.weatherLat || data?.weatherLat;
      const lon = settings?.weatherLon || data?.weatherLon;
      const units = settings?.weatherUnits || data?.cachedUnits || 'celsius';
      const cityName = settings?.weatherCityName || data?.cachedCityName || 'Current Location';

      if (lat && lon && (!lastFetch || isWeatherCacheStale(lastFetch, WEATHER_CACHE_TTL_MS))) {
        fetchWeather(lat, lon, units, cityName);
      }
    } catch (_) {}
  }

  async function onShow() {
    if (!weatherInitialized) {
      await initialize();
      return;
    }
    await resume();
  }

  const HomebaseWidgetWeather = {
    initialize,
    init: initialize,
    destroy,
    onShow,
    onHide,
    pause,
    resume,
    fetchWeather,
    updateWeatherUI,
    loadCachedWeather,
    getWeatherLocation: () => selectedLocation,
    openWeatherSettingsModal,
    closeWeatherSettingsModal,
    setWeatherPreference
  };

  async function setupWeather() {
    return HomebaseWidgetWeather.initialize();
  }

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope) {
    globalScope.HomebaseWidgetWeather = HomebaseWidgetWeather;
    globalScope.HomebaseWeatherWidgetController = HomebaseWidgetWeather;
    globalScope.setupWeather = setupWeather;
    globalScope.setWeatherPreference = setWeatherPreference;
    globalScope.fetchWeather = fetchWeather;
    globalScope.updateWeatherUI = updateWeatherUI;
    globalScope.loadCachedWeather = loadCachedWeather;
    globalScope.getWeatherLocation = () => HomebaseWidgetWeather.getWeatherLocation();
    globalScope.openWeatherSettingsModal = openWeatherSettingsModal;
    globalScope.closeWeatherSettingsModal = closeWeatherSettingsModal;
    globalScope.startGeolocation = startGeolocation;
    globalScope.searchForLocation = searchForLocation;
    globalScope.getWeatherEmoji = getWeatherEmoji;
    globalScope.getWeatherDescription = getWeatherDescription;
    globalScope.formatWeatherUpdated = formatWeatherUpdated;
    globalScope.getCurrentHourlyWeatherIndex = getCurrentHourlyWeatherIndex;
    globalScope.getHourlyValueAtIndex = getHourlyValueAtIndex;
    globalScope.normalizeWeatherDisplay = normalizeWeatherDisplay;
    globalScope.normalizeWeatherTimestamp = normalizeWeatherTimestamp;
    globalScope.isWeatherCacheStale = isWeatherCacheStale;
    globalScope.getCachedWeatherTimestamp = getCachedWeatherTimestamp;
    globalScope.hasUsableCachedWeather = hasUsableCachedWeather;
    globalScope.getCachedWeatherDisplayOptions = getCachedWeatherDisplayOptions;
    globalScope.markWeatherAsCachedOrStale = markWeatherAsCachedOrStale;
    globalScope.showWeatherOfflineNoCache = showWeatherOfflineNoCache;
    globalScope.showWeatherSetupUI = showWeatherSetupUI;
    globalScope.hideWeatherSetupUI = hideWeatherSetupUI;
    globalScope.showWeatherError = showWeatherError;
  }
  if (typeof window !== 'undefined' && globalScope !== window) {
    window.HomebaseWidgetWeather = HomebaseWidgetWeather;
    window.HomebaseWeatherWidgetController = HomebaseWidgetWeather;
    window.setupWeather = setupWeather;
    window.setWeatherPreference = setWeatherPreference;
    window.fetchWeather = fetchWeather;
    window.updateWeatherUI = updateWeatherUI;
    window.loadCachedWeather = loadCachedWeather;
    window.getWeatherLocation = () => HomebaseWidgetWeather.getWeatherLocation();
    window.openWeatherSettingsModal = openWeatherSettingsModal;
    window.closeWeatherSettingsModal = closeWeatherSettingsModal;
    window.startGeolocation = startGeolocation;
    window.searchForLocation = searchForLocation;
    window.getWeatherEmoji = getWeatherEmoji;
    window.getWeatherDescription = getWeatherDescription;
    window.formatWeatherUpdated = formatWeatherUpdated;
    window.getCurrentHourlyWeatherIndex = getCurrentHourlyWeatherIndex;
    window.getHourlyValueAtIndex = getHourlyValueAtIndex;
    window.normalizeWeatherDisplay = normalizeWeatherDisplay;
    window.normalizeWeatherTimestamp = normalizeWeatherTimestamp;
    window.isWeatherCacheStale = isWeatherCacheStale;
    window.getCachedWeatherTimestamp = getCachedWeatherTimestamp;
    window.hasUsableCachedWeather = hasUsableCachedWeather;
    window.getCachedWeatherDisplayOptions = getCachedWeatherDisplayOptions;
    window.markWeatherAsCachedOrStale = markWeatherAsCachedOrStale;
    window.showWeatherOfflineNoCache = showWeatherOfflineNoCache;
    window.showWeatherSetupUI = showWeatherSetupUI;
    window.hideWeatherSetupUI = hideWeatherSetupUI;
    window.showWeatherError = showWeatherError;
  }

  if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
    HomebaseWidgetLifecycle.registerWidget('weather', HomebaseWidgetWeather);
  }
})();
