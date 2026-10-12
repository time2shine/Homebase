# Cycle #19 Phase 4 Audit — Weather Widget Controller Architecture

**Cycle:** #19  
**Phase:** Phase 4  
**Date:** October 13, 2026  
**Target File:** `src/newtab/widgets/weather.js` (1,302 lines)  
**Status:** Pre-Implementation Architectural Audit  

---

## 1. Executive Summary & Purpose

The Weather subsystem in Homebase is responsible for location-based weather forecasting, Open-Meteo API integrations, geolocation resolution, offline caching, settings modal management, and dynamic temperature unit conversion.

Following the successful encapsulation of Time, Todo (Phase 2), Quote, and News (Phase 3) widget controllers, Phase 4 addresses the final and largest widget controller: `src/newtab/widgets/weather.js`.

The objective of this phase is to:
1. Eliminate all 58 top-level lexical declaration leaks (26 variables + 32 functions) by wrapping the controller in a strict IIFE.
2. Establish `window.HomebaseWidgetWeather` as the single canonical controller implementing standard 7-method lifecycle hooks (`initialize`, `init`, `destroy`, `onShow`, `onHide`, `pause`, `resume`).
3. Replace 17 parse-time eager DOM queries with lazy, cached element resolution (`resolveDomElements()`).
4. Replace fragmented storage fallback ladders with strict `HomebaseWidgetStorage` facade routing.
5. Centralize network lifecycle management (`weatherFetchAbortController`, `geoAbortController`) with clean abort handling on `onHide`, `pause`, and `destroy`.
6. Maintain 100% backwards compatibility for settings forms, startup hydration, renderer helpers, and tests.

---

## 2. Inventory of Current Declarations & Scope Leakage

### 2.1 Leaked Top-Level Variables (26 Declarations)
The following variables currently pollute the global lexical declarative environment record:
- **DOM References (17 items, evaluated at parse-time)**:
  - `weatherWidget`: `document.querySelector('.widget-weather')`
  - `weatherSetup`: `document.getElementById('weather-setup')`
  - `weatherChooseCityBtn`: `document.getElementById('weather-choose-city-btn')`
  - `weatherSettingsModal`: `document.getElementById('weather-settings-modal')`
  - `weatherSettingsCloseBtn`: `document.getElementById('weather-settings-close-btn')`
  - `weatherSettingsCancelBtn`: `document.getElementById('weather-settings-cancel-btn')`
  - `weatherSettingsSaveBtn`: `document.getElementById('weather-settings-save-btn')`
  - `weatherTempUnitToggle`: `document.getElementById('modal-temp-unit-toggle')`
  - `weatherLocationInput`: `document.getElementById('modal-location-input')`
  - `weatherLocationResults`: `document.getElementById('modal-location-results')`
  - `weatherUseCurrentBtn`: `document.getElementById('modal-set-location-auto-btn')`
  - `weatherRefreshBtn`: `document.getElementById('weather-refresh-btn')`
  - `weatherUpdatedEl`: `document.getElementById('weather-updated')`
  - `weatherBody`: `weatherWidget ? weatherWidget.querySelector('.weather-body') : null`
  - `weatherFooter`: `weatherWidget ? weatherWidget.querySelector('.weather-footer') : null`
- **Internal State & Controllers (9 items)**:
  - `weatherListenerRegistry`: Active listener registry or null
  - `weatherInitialized`: Initialization guard boolean
  - `WEATHER_CACHE_TTL_MS`: Cache TTL constant (30 minutes)
  - `WEATHER_FETCH_TIMEOUT_MS`: Fetch timeout constant (7 seconds)
  - `selectedLocation`: Location object selected in search modal
  - `searchTimeout`: Location search debounce timer ID
  - `geoAbortController`: Geolocation request abort controller
  - `geoRequestId`: Geolocation sequence request identifier
  - `weatherFetchAbortController`: Weather forecast request abort controller
  - `weatherRefreshInFlight`: In-flight refresh lock boolean
  - `HomebaseWeatherWidgetController`: Legacy controller export object

### 2.2 Leaked Top-Level Functions (32 Declarations)
- **Storage & State**: `weatherStorageGet`, `weatherStorageSet`, `weatherStorageRemove`, `loadCachedWeather`, `normalizeWeatherTimestamp`, `isWeatherCacheStale`, `getCachedWeatherTimestamp`, `hasUsableCachedWeather`, `getCachedWeatherDisplayOptions`.
- **UI & Presentation**: `setWeatherLoadingState`, `markWeatherAsCachedOrStale`, `showWeatherOfflineNoCache`, `showWeatherSetupUI`, `hideWeatherSetupUI`, `getWeatherEmoji`, `getWeatherDescription`, `formatWeatherUpdated`, `getCurrentHourlyWeatherIndex`, `getHourlyValueAtIndex`, `normalizeWeatherDisplay`, `updateWeatherUI`, `showWeatherError`.
- **Network & API**: `fetchWithTimeout`, `isWeatherNetworkError`, `isWeatherAbortError`, `fetchWeather`, `startGeolocation`, `searchForLocation`.
- **Settings & Lifecycle**: `setWeatherPreference`, `closeWeatherSettingsModal`, `openWeatherSettingsModal`, `setupWeather`.

---

## 3. Storage & Persistence Analysis

Currently, `weather.js` interacts with storage across 6 different paths:
1. `weatherStorageGet` / `weatherStorageSet`: Direct fallback ladders calling `HomebaseStorage.get` / `HomebaseStorage.getMany` / `HomebaseStorage.setMany` / `browser.storage.local.get` / `browser.storage.local.set`.
2. `loadCachedWeather`: Checks `HomebaseWidgetStorage.getWeatherCache()`, but falls back to `weatherStorageGet(['cachedWeatherData', ...])`.
3. `updateWeatherUI`: Writes cache via `HomebaseWidgetStorage.setWeatherCache()`, but has fallback logic calling `weatherStorageSet`.
4. `fetchWeather`: Directly calls `weatherStorageSet` to save fresh data.
5. `setWeatherPreference`: Directly invokes `localStorage.setItem('fast-show-weather', ...)` and `HomebaseStorage.set(APP_SHOW_WEATHER_KEY, ...)`.
6. Settings modal save: Uses `weatherStorageSet` to save location and unit preferences (`weatherLat`, `weatherLon`, `weatherCityName`, `weatherUnits`).

### Migration to `HomebaseWidgetStorage`:
All persistence operations will be unified through `HomebaseWidgetStorage`:
- Weather Cache reads/writes: `HomebaseWidgetStorage.getWeatherCache()` and `HomebaseWidgetStorage.setWeatherCache()`.
- Weather Settings (location & units): `HomebaseWidgetStorage.getWeatherSettings()` and `HomebaseWidgetStorage.setWeatherSettings()`.
- Fast Mirrors: `HomebaseWidgetStorage.setFastMirror('fast-show-weather', ...)`.

---

## 4. Network & Geolocation Lifecycle

### Existing Network Calls:
1. **Weather Forecast API**: `https://api.open-meteo.com/v1/forecast?...`
   - Governed by `WEATHER_FETCH_TIMEOUT_MS` (7,000ms).
   - Aborted via `weatherFetchAbortController`.
2. **Geocoding Search API**: `https://geocoding-api.open-meteo.com/v1/search?name=...`
   - Governed by `5000ms` timeout.
   - Aborted via `geoAbortController`.
3. **Browser Geolocation API**: `navigator.geolocation.getCurrentPosition(...)`
   - Aborted by sequence counter (`geoRequestId`) and `geoAbortController`.

### Lifecycle Issues & Remediation:
- In-flight requests are not consistently aborted when the widget is hidden or tab switches.
- **Remediation**:
  - `onHide()`: Abort `weatherFetchAbortController` and `geoAbortController`, clear `searchTimeout`.
  - `pause()`: Clear debounce timer, cancel in-flight network work.
  - `resume()`: Refresh weather data only if cache has expired (`isWeatherCacheStale`).
  - `destroy()`: Abort all controllers, clear all timers, unbind all listeners.

---

## 5. DOM References & Parsing Hazards

Currently, lines 8–40 eagerly query 17 DOM nodes before the document is necessarily ready or hydrated:
```javascript
const weatherWidget = document.querySelector('.widget-weather');
const weatherSetup = document.getElementById('weather-setup');
...
```
### Remediation:
Implement lazy `resolveDomElements()` and `getDomElements()`:
- Do not query DOM during file evaluation.
- Cache references inside closure state on `initialize()`.
- Reset `domElements = null` on `destroy()`.

---

## 6. External Callers & Compatibility Mapping

| Caller / Consumer | Consumed Symbol | Strategy |
| :--- | :--- | :--- |
| `src/newtab/core/startup-hydration.js` | `HomebaseWeatherWidgetController.initialize`, `setupWeather`, `loadCachedWeather` | Route via `HomebaseWidgetWeather` controller and global compatibility bridge |
| `src/newtab/core/perf-report.js` | `setupWeather`, `loadCachedWeather` | Global compatibility bridge on `window` |
| `src/newtab/settings/settings-form-controller.js` | `setWeatherPreference`, `openWeatherSettingsModal` | Global compatibility bridge on `window` |
| `src/newtab/settings/settings-preferences.js` | `setWeatherPreference` | Global compatibility bridge on `window` |
| `src/newtab/settings/settings-storage.js` | `setWeatherPreference` | Global compatibility bridge on `window` |
| `src/newtab/widgets/weather-card-renderer.js` | `weatherWidget`, `weatherRefreshBtn`, emoji/description helpers | Passed dynamically or exported via controller bridge |
| `tests/unit/widget-controller-lifecycle.test.mjs` | `HomebaseWeatherWidgetController` | Alias to `HomebaseWidgetWeather` |
| `tests/unit/widget-visibility-lifecycle.test.mjs` | `HomebaseWeatherWidgetController` | Alias to `HomebaseWidgetWeather` |
| `tests/unit/widget-consumers-storage.test.mjs` | `loadCachedWeather`, `updateWeatherUI` | Global compatibility bridge on `window` |
| `tests/unit/settings-storage.test.mjs` | `setWeatherPreference` | Global compatibility bridge on `window` |

---

## 7. Migration Steps for Phase 4

1. **Enhance `HomebaseWidgetStorage`**:
   - Add `getWeatherSettings()` and `setWeatherSettings()` to `src/newtab/widgets/widget-storage.js` for location and unit persistence.
2. **Encapsulate `weather.js`**:
   - Wrap entire file in strict IIFE `(function () { 'use strict'; ... })();`.
   - Convert all 26 variables into private closure state.
   - Implement lazy `resolveDomElements()` and `getDomElements()`.
   - Route all storage through `HomebaseWidgetStorage`.
   - Manage event listeners through `HomebaseWidgetLifecycle.createListenerRegistry()`.
   - Build canonical `HomebaseWidgetWeather` with `{ initialize, init, destroy, onShow, onHide, pause, resume }`.
   - Register with `HomebaseWidgetLifecycle.registerWidget('weather', HomebaseWidgetWeather)`.
   - Expose backwards-compatibility bridges on `window`.
3. **Unit Tests**:
   - Create `tests/unit/weather-encapsulation.test.mjs` covering all 9 required verification dimensions.
4. **Verification**:
   - Run syntax, static, unit test, build, and diff checks.
5. **Documentation**:
   - Create `docs/cycles/cycle-19/phase-4-weather-completion-summary.md`.
