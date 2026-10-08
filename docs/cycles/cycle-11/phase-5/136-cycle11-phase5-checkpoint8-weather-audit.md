# Checkpoint 8 Architecture Audit: Weather Error Handling & Network Resilience

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 8 — Weather Error Handling & Network Resilience  
**Date**: October 2, 2026  
**Status**: Ready for Implementation  
**Target Module**: [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js)  

---

## 1. Problem Statement

During new-tab runtime operation or offline/network-interrupted scenarios, the weather widget logs:
```text
Weather Error: TypeError: Failed to fetch
    at showWeatherError (src/newtab/widgets/weather.js:626)
    at fetchWeather (src/newtab/widgets/weather.js:706)
```

Although the weather widget includes fallback logic that successfully restores cached forecast data from storage (`cachedWeatherData`), the error is unconditionally logged via `console.error('Weather Error:', error)` whenever the error is not strictly an `AbortError`.

This causes:
1. False-positive errors in developer tools and automated test monitors.
2. Confusion regarding recent Phase 5 bookmark/settings extractions (which did not modify weather logic).
3. Disproportionate error severity for standard transient network disconnects, DNS resolution failures, or offline states.

---

## 2. Audit of Existing Weather Error Handling

In [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js), error handling occurs across four primary functions:

### 2.1 `fetchWithTimeout()` (lines 167–188)
```javascript
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
```
- When `fetch()` fails due to a network-layer issue (DNS failure, offline, connection refused), `fetch()` throws a `TypeError: Failed to fetch`.
- If the 7-second timeout fires, `didTimeout` converts the error to an `AbortError`.
- However, standard network drops fail almost immediately, long before `timeoutMs` triggers, throwing `TypeError: Failed to fetch`.

### 2.2 `fetchWeather()` (lines 672–710)
```javascript
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
```
- Line 674 checks `navigator.onLine === false`, but `navigator.onLine` frequently returns `true` when a device is connected to a local WiFi/LAN network that lacks active internet access, or during captive portals, DNS failures, or packet drop.
- Line 706 sets `quiet: error?.name === 'AbortError'`. For any network drop (`TypeError: Failed to fetch`), `quiet` evaluates to `false`.

### 2.3 `showWeatherError()` (lines 624–667)
```javascript
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
  // Fallback to error UI
...
```
- Line 626 logs `console.error('Weather Error:', error)` **before** checking if cached weather is available.
- In lines 628–641, `showWeatherError` checks storage for `cachedWeatherData`. If found, it paints the cached forecast and displays a subtle "Cached data" label.
- **The flaw**: The function successfully recovers, but already logged a high-severity `console.error`.

---

## 3. Scope & Independence Verification

- **Unrelated to Phase 5 Bookmark / Settings Extractions**:
  - `git diff` confirms zero changes to `weather.js` across commits `c75a9d8` (Checkpoint 5), `04553a6` (Checkpoint 6), and `bf51e55` (Checkpoint 7).
  - Last modification to `weather.js` occurred in commit `eb1237c` (Sept 30).
  - Bookmark services (`HomebaseBookmarkTreeService`, `HomebaseBookmarkActionController`, etc.) have zero interactions with the weather widget.
- **Protected Files**:
  - `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` will remain completely untouched.
- **Target Constraint**:
  - **Only** [`src/newtab/widgets/weather.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js) will be modified.

---

## 4. Proposed Solution Architecture

### 4.1 Error Classification Engine
Introduce deterministic classification helpers:

```javascript
/**
 * Detects whether an error represents an expected network or offline condition.
 * @param {Error|unknown} error
 * @returns {boolean}
 */
function isWeatherNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const msg = String(error.message || '');
  const name = String(error.name || '');

  // Standard browser fetch failure when host or DNS is unreachable
  if (name === 'TypeError' && /failed to fetch|fetch|load failed/i.test(msg)) {
    return true;
  }
  // Cross-browser network error variations (Firefox "NetworkError", Safari "Load failed")
  if (/networkerror|network request failed|failed to fetch|load failed/i.test(msg)) {
    return true;
  }
  // Upstream API status or offline marker
  if (msg === 'Weather data not available' || msg === 'Weather unavailable offline') {
    return true;
  }
  return false;
}

/**
 * Detects whether an error was aborted intentionally.
 * @param {Error|unknown} error
 * @returns {boolean}
 */
function isWeatherAbortError(error) {
  return error?.name === 'AbortError';
}
```

### 4.2 Logging Tier Strategy in `showWeatherError()`

| Error Type | Detection Criteria | Logging Action | UI Action |
|---|---|---|---|
| **Abort / Cancellation** | `isWeatherAbortError(error)` or `options.quiet` | Silent (0 logs) | Restore cache if available; else show setup |
| **Network Failure / Offline** | `isWeatherNetworkError(error)` | `console.warn('Weather network unavailable; using cached data:', error.message)` | Restore cache with `'Cached data'` / `'Offline cache'`; else show offline UI |
| **Geolocation Denied/Unavailable** | `error?.code` in `[1, 2, 3]` (GeolocationPositionError) | `console.warn('Weather geolocation unavailable:', error.message)` | Restore cache or show setup UI |
| **Unexpected Logic / Bug** | `TypeError` (e.g. null dereference), `ReferenceError`, etc. | `console.error('Weather Error:', error)` | Restore cache if possible; else show error UI |

---

## 5. Verification Plan

1. **Syntax Check**:
   ```powershell
   node --check src/newtab/widgets/weather.js
   ```
2. **Static Invariants**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
3. **Unit Tests**:
   ```powershell
   npm.cmd test
   ```
4. **Build Packaging**:
   ```powershell
   npm.cmd run build
   ```
5. **Browser Smoke Test**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
6. **Simulated Network Error CDP Test**:
   - Verify that simulated network failure (`TypeError: Failed to fetch`) triggers `console.warn` instead of `console.error`.
   - Verify that unexpected logic errors still trigger `console.error`.
   - Verify that cached weather displays seamlessly when network fails.
