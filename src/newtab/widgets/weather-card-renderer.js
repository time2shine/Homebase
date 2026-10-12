(function () {
  'use strict';

  const globalScope = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);

  function safeSetText(el, val) {
    if (!el) return;
    if (globalScope && typeof globalScope.setText === 'function') {
      globalScope.setText(el, val);
    } else {
      el.textContent = val;
    }
  }

  function safeSetAttr(el, attr, val) {
    if (!el) return;
    if (globalScope && typeof globalScope.setAttr === 'function') {
      globalScope.setAttr(el, attr, val);
    } else {
      el.setAttribute(attr, val);
    }
  }

  function safeRevealWidget(selector) {
    if (globalScope && typeof globalScope.revealWidget === 'function') {
      globalScope.revealWidget(selector);
    } else if (typeof document !== 'undefined') {
      const el = document.querySelector(selector);
      if (el) {
        el.classList.remove('widget-hidden');
        el.classList.add('widget-visible');
      }
    }
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

    const formatPercent = (value) => (Number.isFinite(value) ? `${Math.round(value)}%` : '--');
    const windUnit = units === 'fahrenheit' ? 'mph' : 'km/h';
    const wind = Number.isFinite(windValue) ? `${Math.round(windValue)}\u00A0${windUnit}` : '--';

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

  function renderWeatherUI(display, elements = {}) {
    if (!display) return false;

    const cityEl = elements.cityEl || (typeof document !== 'undefined' ? document.getElementById('weather-city') : null);
    const tempEl = elements.tempEl || (typeof document !== 'undefined' ? document.getElementById('weather-temp') : null);
    const descEl = elements.descEl || (typeof document !== 'undefined' ? document.getElementById('weather-desc') : null);
    const pressureEl = elements.pressureEl || (typeof document !== 'undefined' ? document.getElementById('weather-pressure') : null);
    const humidityEl = elements.humidityEl || (typeof document !== 'undefined' ? document.getElementById('weather-humidity') : null);
    const cloudcoverEl = elements.cloudcoverEl || (typeof document !== 'undefined' ? document.getElementById('weather-cloudcover') : null);
    const precipProbEl = elements.precipProbEl || (typeof document !== 'undefined' ? document.getElementById('weather-precip-prob') : null);
    const sunriseEl = elements.sunriseEl || (typeof document !== 'undefined' ? document.getElementById('weather-sunrise') : null);
    const sunsetEl = elements.sunsetEl || (typeof document !== 'undefined' ? document.getElementById('weather-sunset') : null);
    const updatedEl = elements.updatedEl || (typeof document !== 'undefined' ? document.getElementById('weather-updated') : null);
    const iconEl = elements.iconEl || (typeof document !== 'undefined' ? document.getElementById('weather-icon') : null);
    const weatherWidget = elements.weatherWidget || (typeof document !== 'undefined' ? document.querySelector('.widget-weather') : null);

    safeSetText(cityEl, display.cityName);
    safeSetText(tempEl, display.temperature);
    safeSetText(descEl, display.description);
    safeSetText(pressureEl, display.pressure);
    safeSetText(humidityEl, display.humidity);
    safeSetText(cloudcoverEl, display.cloudCover);
    safeSetText(precipProbEl, display.precipitationProbability);
    safeSetText(sunriseEl, display.sunrise);
    safeSetText(sunsetEl, display.sunset);
    if (updatedEl) safeSetText(updatedEl, display.updatedLabel);

    safeSetText(iconEl, display.emoji);
    safeSetAttr(iconEl, 'data-weather-code', display.weatherCode);
    if (iconEl && iconEl.classList) iconEl.classList.add('is-instant-icon');

    if (weatherWidget && weatherWidget.classList) {
      const isCachedMark = Boolean(display.isCached || display.cacheReason);
      weatherWidget.classList.toggle('weather-cached', isCachedMark);
      weatherWidget.classList.remove('weather-error');
    }

    setWeatherSetupUIState({ visible: false }, elements);
    safeRevealWidget('.widget-weather');
    return true;
  }

  function renderWeatherOfflineUI(elements = {}) {
    const cityEl = elements.cityEl || (typeof document !== 'undefined' ? document.getElementById('weather-city') : null);
    const tempEl = elements.tempEl || (typeof document !== 'undefined' ? document.getElementById('weather-temp') : null);
    const descEl = elements.descEl || (typeof document !== 'undefined' ? document.getElementById('weather-desc') : null);
    const iconEl = elements.iconEl || (typeof document !== 'undefined' ? document.getElementById('weather-icon') : null);
    const pressureEl = elements.pressureEl || (typeof document !== 'undefined' ? document.getElementById('weather-pressure') : null);
    const humidityEl = elements.humidityEl || (typeof document !== 'undefined' ? document.getElementById('weather-humidity') : null);
    const cloudcoverEl = elements.cloudcoverEl || (typeof document !== 'undefined' ? document.getElementById('weather-cloudcover') : null);
    const precipProbEl = elements.precipProbEl || (typeof document !== 'undefined' ? document.getElementById('weather-precip-prob') : null);
    const sunriseEl = elements.sunriseEl || (typeof document !== 'undefined' ? document.getElementById('weather-sunrise') : null);
    const sunsetEl = elements.sunsetEl || (typeof document !== 'undefined' ? document.getElementById('weather-sunset') : null);
    const updatedEl = elements.updatedEl || (typeof document !== 'undefined' ? document.getElementById('weather-updated') : null);
    const weatherWidget = elements.weatherWidget || (typeof document !== 'undefined' ? document.querySelector('.widget-weather') : null);

    safeSetText(cityEl, 'Weather Offline');
    safeSetText(tempEl, '--\u00b0');
    safeSetText(descEl, 'No cached weather yet');
    safeSetText(iconEl, '-');
    safeSetText(pressureEl, '--');
    safeSetText(humidityEl, '--');
    safeSetText(cloudcoverEl, '--');
    safeSetText(precipProbEl, '--');
    safeSetText(sunriseEl, '--');
    safeSetText(sunsetEl, '--');
    safeSetAttr(iconEl, 'data-weather-code', '');

    if (updatedEl) safeSetText(updatedEl, 'Connect to the internet to load weather');

    setWeatherSetupUIState({ visible: false }, elements);
    if (weatherWidget && weatherWidget.classList) {
      weatherWidget.classList.remove('weather-error', 'weather-cached');
    }
    safeRevealWidget('.widget-weather');
  }

  function setWeatherLoadingState(isLoading, elements = {}) {
    const loading = Boolean(isLoading);
    const weatherWidget = elements.weatherWidget || (typeof document !== 'undefined' ? document.querySelector('.widget-weather') : null);
    const weatherRefreshBtn = elements.weatherRefreshBtn || (typeof document !== 'undefined' ? document.getElementById('weather-refresh-btn') : null);

    if (weatherWidget) {
      weatherWidget.classList.toggle('weather-loading', loading);
      weatherWidget.setAttribute('aria-busy', loading ? 'true' : 'false');
    }

    if (weatherRefreshBtn) {
      weatherRefreshBtn.disabled = loading;
      weatherRefreshBtn.setAttribute('aria-label', loading ? 'Refreshing weather' : 'Refresh weather');
    }
  }

  function setWeatherSetupUIState(options = {}, elements = {}) {
    const { visible = true, isError = false, hideBody = true } = options;
    const weatherWidget = elements.weatherWidget || (typeof document !== 'undefined' ? document.querySelector('.widget-weather') : null);
    const weatherSetup = elements.weatherSetup || (typeof document !== 'undefined' ? document.getElementById('weather-setup') : null);
    const weatherBody = elements.weatherBody || (weatherWidget ? weatherWidget.querySelector('.weather-body') : null);
    const weatherFooter = elements.weatherFooter || (weatherWidget ? weatherWidget.querySelector('.weather-footer') : null);

    if (visible) {
      if (weatherWidget && weatherWidget.classList) {
        weatherWidget.classList.toggle('weather-error', Boolean(isError));
        weatherWidget.classList.remove('weather-cached');
      }
      if (weatherSetup && weatherSetup.classList) weatherSetup.classList.remove('hidden');
      if (hideBody) {
        if (weatherBody && weatherBody.classList) weatherBody.classList.add('hidden');
        if (weatherFooter && weatherFooter.classList) weatherFooter.classList.add('hidden');
      } else {
        if (weatherBody && weatherBody.classList) weatherBody.classList.remove('hidden');
        if (weatherFooter && weatherFooter.classList) weatherFooter.classList.remove('hidden');
      }
      safeRevealWidget('.widget-weather');
    } else {
      if (weatherSetup && weatherSetup.classList) weatherSetup.classList.add('hidden');
      if (weatherBody && weatherBody.classList) weatherBody.classList.remove('hidden');
      if (weatherFooter && weatherFooter.classList) weatherFooter.classList.remove('hidden');
      if (weatherWidget && weatherWidget.classList) weatherWidget.classList.remove('weather-error');
    }
  }

  const renderer = {
    getWeatherEmoji,
    getWeatherDescription,
    formatWeatherUpdated,
    normalizeWeatherDisplay,
    renderWeatherUI,
    renderWeatherOfflineUI,
    setWeatherLoadingState,
    setWeatherSetupUIState
  };

  if (typeof window !== 'undefined') {
    window.HomebaseWeatherCardRenderer = renderer;
  }
  if (globalScope) {
    globalScope.HomebaseWeatherCardRenderer = renderer;
  }
})();
