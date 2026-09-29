// ===============================================
// --- WEATHER WIDGET & SETTINGS ---
// ===============================================
// =============================
// Weather widget (single impl)
// =============================

const weatherWidget = document.querySelector('.widget-weather');

const settingsBtn = document.getElementById('settings-btn');

const setLocationBtn = document.getElementById('set-location-btn');

const weatherSetup = document.getElementById('weather-setup');

const weatherChooseCityBtn = document.getElementById('weather-choose-city-btn');

const weatherSettingsModal = document.getElementById('weather-settings-modal');

const weatherSettingsCloseBtn = document.getElementById('weather-settings-close-btn');

const weatherSettingsCancelBtn = document.getElementById('weather-settings-cancel-btn');

const weatherSettingsSaveBtn = document.getElementById('weather-settings-save-btn');

const weatherTempUnitToggle = document.getElementById('modal-temp-unit-toggle');

const weatherLocationInput = document.getElementById('modal-location-input');

const weatherLocationResults = document.getElementById('modal-location-results');

const weatherUseCurrentBtn = document.getElementById('modal-set-location-auto-btn');

const weatherRefreshBtn = document.getElementById('weather-refresh-btn');

const weatherUpdatedEl = document.getElementById('weather-updated');

const weatherBody = weatherWidget ? weatherWidget.querySelector('.weather-body') : null;

const weatherFooter = weatherWidget ? weatherWidget.querySelector('.weather-footer') : null;

const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 7000;

let selectedLocation = null;
let searchTimeout = null;
// Abort stale geocode lookups and ignore late responses
let geoAbortController = null;
let geoRequestId = 0;
let weatherRefreshInFlight = false;

async function weatherStorageGet(keys) {
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
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
    return await HomebaseStorage.setMany(items);
  }
  if (typeof browser !== 'undefined' && browser.storage?.local?.set) {
    return await browser.storage.local.set(items);
  }
}

async function weatherStorageRemove(keys) {
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.remove) {
    return await HomebaseStorage.remove(keys);
  }
  if (typeof browser !== 'undefined' && browser.storage?.local?.remove) {
    return await browser.storage.local.remove(keys);
  }
}

function setWeatherLoadingState(isLoading) {
  const loading = Boolean(isLoading);

  if (weatherWidget) {
    weatherWidget.classList.toggle('weather-loading', loading);
    weatherWidget.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  if (weatherRefreshBtn) {
    weatherRefreshBtn.disabled = loading;
    weatherRefreshBtn.setAttribute('aria-label', loading ? 'Refreshing weather' : 'Refresh weather');
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
  if (!weatherWidget) return;
  const marked = Boolean(options.isCached || options.cacheReason);
  weatherWidget.classList.toggle('weather-cached', marked);
}

function showWeatherOfflineNoCache() {
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

  const updatedEl = weatherUpdatedEl || document.getElementById('weather-updated');
  if (updatedEl) setText(updatedEl, 'Connect to the internet to load weather');

  if (weatherSetup) weatherSetup.classList.add('hidden');
  if (weatherBody) weatherBody.classList.remove('hidden');
  if (weatherFooter) weatherFooter.classList.remove('hidden');
  if (weatherWidget) {
    weatherWidget.classList.remove('weather-error', 'weather-cached');
  }
  revealWidget('.widget-weather');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = WEATHER_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : WEATHER_FETCH_TIMEOUT_MS;
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeout);

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
  const { hideBody = true, isError = false } = options;
  if (weatherWidget) {
    weatherWidget.classList.toggle('weather-error', Boolean(isError));
    weatherWidget.classList.remove('weather-cached');
  }
  if (weatherSetup) weatherSetup.classList.remove('hidden');
  if (hideBody) {
    if (weatherBody) weatherBody.classList.add('hidden');
    if (weatherFooter) weatherFooter.classList.add('hidden');
  } else {
    if (weatherBody) weatherBody.classList.remove('hidden');
    if (weatherFooter) weatherFooter.classList.remove('hidden');
  }
  revealWidget('.widget-weather');
}

function hideWeatherSetupUI() {
  if (weatherSetup) weatherSetup.classList.add('hidden');
  if (weatherBody) weatherBody.classList.remove('hidden');
  if (weatherFooter) weatherFooter.classList.remove('hidden');
  if (weatherWidget) weatherWidget.classList.remove('weather-error');
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

    const data = await weatherStorageGet(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);

    const cachedTs = getCachedWeatherTimestamp(data);

    if (
      hasUsableCachedWeather(data.cachedWeatherData) &&
      data.cachedCityName
    ) {

      updateWeatherUI(
        data.cachedWeatherData,
        data.cachedCityName,
        data.cachedUnits || 'celsius',
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

  const updatedEl = weatherUpdatedEl || document.getElementById('weather-updated');

  const display = normalizeWeatherDisplay(data, cityName, units, fetchedAt, options);

  if (!display) {

    showWeatherError(new Error('Weather data missing'));

    return;

  }

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

  if (!options.skipCacheSave) {
    weatherStorageSet({

      cachedWeatherData: data,

      cachedCityName: display.cityName,

      cachedUnits: display.units,

      weatherFetchedAt: display.fetchedAt

    }).catch(() => {});
  }



  revealWidget('.widget-weather');

  // Mirror simplified weather info to localStorage for instant paint on next load
  try {
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
    localStorage.setItem('fast-weather', JSON.stringify(fastWeather));
  } catch (e) {
    // If localStorage is unavailable, fail silently; the async path still works.
  }

}



async function showWeatherError(error, options = {}) {
  const { quiet = false, cacheReason = '' } = options;
  if (error && !quiet) console.error('Weather Error:', error);

  try {
    const data = await weatherStorageGet(['cachedWeatherData', 'cachedCityName', 'cachedUnits', 'weatherFetchedAt']);

    if (hasUsableCachedWeather(data.cachedWeatherData) && data.cachedCityName) {
      const cachedTs = getCachedWeatherTimestamp(data) ?? Date.now();
      updateWeatherUI(
        data.cachedWeatherData,
        data.cachedCityName,
        data.cachedUnits || 'celsius',
        cachedTs,
        getCachedWeatherDisplayOptions(cachedTs, { cacheReason, forceCached: true, skipCacheSave: true })
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
    await showWeatherError(new Error('Weather unavailable offline'), { quiet: true, cacheReason: 'Offline cache' });
    return;
  }

  try {

    const hourlyParams = 'relative_humidity_2m,wind_speed_10m,cloudcover,precipitation_probability';

    const dailyParams = 'sunrise,sunset';

    const windSpeedUnitParam = units === 'fahrenheit' ? '&wind_speed_unit=mph' : '';

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true&temperature_unit=${units}` +
      `&hourly=${hourlyParams}&daily=${dailyParams}` +
      `&forecast_days=1&timezone=auto${windSpeedUnitParam}`;

    const weatherResponse = await fetchWithTimeout(weatherUrl, {}, WEATHER_FETCH_TIMEOUT_MS);

    if (!weatherResponse.ok) throw new Error('Weather data not available');

    const weatherData = await weatherResponse.json();

    updateWeatherUI(weatherData, cityName, units, Date.now());

  } catch (error) {

    const cacheReason = (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? 'Offline cache'
      : 'Cached data';
    await showWeatherError(error, { cacheReason, quiet: error?.name === 'AbortError' });

  }

}

// Sanity: There must be only ONE of each:
// fetchWeather / showWeatherError / updateWeatherUI / setText / setAttr / formatWeatherUpdated

function setWeatherPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowWeatherPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('weather-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-weather', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false) {
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set(APP_SHOW_WEATHER_KEY, shouldShow).catch((err) => {
        console.warn('Failed to save weather visibility preference', err);
      });
    } else if (browser && browser.storage && browser.storage.local) {
      browser.storage.local
        .set({ [APP_SHOW_WEATHER_KEY]: shouldShow })
        .catch((err) => {
          console.warn('Failed to save weather visibility preference', err);
        });
    }
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
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

  if (!weatherLocationInput || !weatherLocationResults) return;

  const query = (typeof searchTerm === 'string' ? searchTerm : weatherLocationInput.value || '').trim();

  const requestId = ++geoRequestId;

  if (geoAbortController) {

    geoAbortController.abort();

    geoAbortController = null;

  }

  if (query.length < 3) {

    weatherLocationResults.innerHTML = '';

    weatherLocationResults.classList.add('hidden');

    return;

  }

  geoAbortController = new AbortController();

  const { signal } = geoAbortController;

  try {

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`;

    const geoResponse = await fetch(geoUrl, { signal });

    const geoData = await geoResponse.json();

    if (requestId !== geoRequestId) return;

    weatherLocationResults.innerHTML = '';

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

          weatherLocationInput.value = `${result.name}, ${result.country}`;

          weatherLocationResults.classList.add('hidden');

          weatherLocationResults.innerHTML = '';

        });

        weatherLocationResults.appendChild(item);

      });

      weatherLocationResults.classList.remove('hidden');

    } else {

      weatherLocationResults.classList.add('hidden');

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
  closeModalWithAnimation('weather-settings-modal', '.dialog-content');
}

async function openWeatherSettingsModal(triggerSource) {
  if (!weatherSettingsModal) return;
  const data = await weatherStorageGet(['weatherCityName', 'weatherUnits']);
  if (weatherTempUnitToggle) {
    weatherTempUnitToggle.checked = data.weatherUnits === 'fahrenheit';
  }
  if (weatherLocationInput) {
    weatherLocationInput.value = (data.weatherCityName === 'Current Location') ? '' : (data.weatherCityName || '');
  }
  selectedLocation = null;
  if (weatherLocationResults) {
    weatherLocationResults.classList.add('hidden');
    weatherLocationResults.innerHTML = '';
  }
  openModalWithAnimation('weather-settings-modal', triggerSource || null, '.dialog-content');
}
async function setupWeather() {

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openWeatherSettingsModal(settingsBtn);
    });
  }

  if (setLocationBtn) {
    setLocationBtn.addEventListener('click', async () => {
      await weatherStorageRemove(['weatherLat', 'weatherLon', 'weatherCityName']);
      startGeolocation();
    });
  }

  if (weatherChooseCityBtn) {
    weatherChooseCityBtn.addEventListener('click', async () => {
      await openWeatherSettingsModal(weatherChooseCityBtn);
      if (weatherLocationInput) weatherLocationInput.focus();
    });
  }

  if (weatherUseCurrentBtn) {
    weatherUseCurrentBtn.addEventListener('click', async () => {
      await weatherStorageRemove(['weatherLat', 'weatherLon', 'weatherCityName']);
      startGeolocation();
      closeWeatherSettingsModal();
    });
  }

  if (weatherRefreshBtn) {
    weatherRefreshBtn.addEventListener('click', async () => {
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

  if (weatherLocationInput) {
    weatherLocationInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const value = weatherLocationInput.value;
      searchTimeout = setTimeout(() => searchForLocation(value), 300);
    });
  }

  if (weatherSettingsCloseBtn) {
    weatherSettingsCloseBtn.addEventListener('click', closeWeatherSettingsModal);
  }

  if (weatherSettingsCancelBtn) {
    weatherSettingsCancelBtn.addEventListener('click', closeWeatherSettingsModal);
  }

  if (weatherSettingsModal) {
    weatherSettingsModal.addEventListener('click', (e) => {
      if (e.target === weatherSettingsModal) {
        closeWeatherSettingsModal();
      }
    });
  }

  if (weatherSettingsSaveBtn) {
    weatherSettingsSaveBtn.addEventListener('click', async () => {
      const newUnit = weatherTempUnitToggle?.checked ? 'fahrenheit' : 'celsius';
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
        hbDebugInfo('Weather is offline. Using cached weather data.');
      } else {
        showWeatherOfflineNoCache();
      }
      return;
    }

    const lastFetch = normalizeWeatherTimestamp(data.weatherFetchedAt) ?? cachedTs ?? 0;

    if (!hasCachedWeather || !lastFetch || isWeatherCacheStale(lastFetch, WEATHER_CACHE_TTL_MS)) {
      hbDebugInfo('Weather cache expired. Fetching new data...');
      fetchWeather(data.weatherLat, data.weatherLon, units, data.weatherCityName);
    } else {
      hbDebugInfo('Using cached weather data.');
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
