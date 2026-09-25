# Homebase — API & Service Integration Map

> **Author**: Senior Browser Extension Solutions Architect  
> **Date**: 2026-09-25  
> **Scope**: Complete inventory and architectural mapping of all Browser APIs, External APIs, Third-Party Libraries, and Cloud Services across Homebase  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)

---

## Table of Contents

1. [Architectural Overview & Integration Topology](#1-architectural-overview--integration-topology)
2. [Browser APIs](#2-browser-apis)
   - [2.1 Extension Storage API (`browser.storage.local`)](#21-extension-storage-api-browserstoragelocal)
   - [2.2 Storage Change Listener (`browser.storage.onChanged`)](#22-storage-change-listener-browserstorageonchanged)
   - [2.3 Bookmarks API (`browser.bookmarks`)](#23-bookmarks-api-browserbookmarks)
   - [2.4 Tabs API (`browser.tabs`)](#24-tabs-api-browsertabs)
   - [2.5 Firefox Contextual Identities (`browser.contextualIdentities`)](#25-firefox-contextual-identities-browsercontextualidentities)
   - [2.6 History API (`browser.history`)](#26-history-api-browserhistory)
   - [2.7 Runtime API (`browser.runtime`)](#27-runtime-api-browserruntime)
   - [2.8 Web Storage API (`window.localStorage`)](#28-web-storage-api-windowlocalstorage)
   - [2.9 Cache API (`window.caches`)](#29-cache-api-windowcaches)
   - [2.10 Geolocation API (`navigator.geolocation`)](#210-geolocation-api-navigatorgeolocation)
   - [2.11 Clipboard API (`navigator.clipboard`)](#211-clipboard-api-navigatorclipboard)
   - [2.12 HTML5 Canvas & 2D Context API](#212-html5-canvas--2d-context-api)
3. [External APIs](#3-external-apis)
   - [3.1 Open-Meteo Weather Forecast API](#31-open-meteo-weather-forecast-api)
   - [3.2 Open-Meteo Geocoding Search API](#32-open-meteo-geocoding-search-api)
   - [3.3 BBC News RSS Feeds](#33-bbc-news-rss-feeds)
   - [3.4 Al Jazeera English RSS Feed](#34-al-jazeera-english-rss-feed)
   - [3.5 ESPN Top Headlines RSS Feed](#35-espn-top-headlines-rss-feed)
   - [3.6 ESPN Cricinfo RSS Feed](#36-espn-cricinfo-rss-feed)
   - [3.7 TechCrunch RSS Feed](#37-techcrunch-rss-feed)
   - [3.8 Google Search Suggestions API](#38-google-search-suggestions-api)
   - [3.9 DuckDuckGo Autocomplete API](#39-duckduckgo-autocomplete-api)
   - [3.10 Bing Suggestion API](#310-bing-suggestion-api)
   - [3.11 Yahoo Search Suggestion API](#311-yahoo-search-suggestion-api)
   - [3.12 Yandex Suggestion API](#312-yandex-suggestion-api)
   - [3.13 Amazon Suggestion Completion API](#313-amazon-suggestion-completion-api)
   - [3.14 Wikipedia OpenSearch API](#314-wikipedia-opensearch-api)
   - [3.15 Google Favicon Resolution Service (t2.gstatic.com)](#315-google-favicon-resolution-service-t2gstaticcom)
4. [Third-Party Libraries](#4-third-party-libraries)
   - [4.1 SortableJS (v1.15.7)](#41-sortablejs-v1157)
5. [Cloud Services](#5-cloud-services)
   - [5.1 Cloudflare R2 Content Delivery Network](#51-cloudflare-r2-content-delivery-network)
6. [Comprehensive Integration Matrix](#6-comprehensive-integration-matrix)
7. [Security & Architectural Risk Assessment](#7-security--architectural-risk-assessment)

---

## 1. Architectural Overview & Integration Topology

Homebase is designed as a zero-background-service-worker browser extension. All interactions with browser subsystems, external endpoints, and cloud CDNs originate directly from two front-end contexts: the **New Tab Dashboard** ([src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html)) and the **Action Popup** ([src/action-popup/action-popup.html](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.html)).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HOMEBASE INTEGRATION TOPOLOGY                          │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      BROWSER EXTENSION APPLICATION RUNTIME                     │   │
│   │                                                                                │   │
│   │   [preload.js] ──> [instant_load.js] ──> [37 Modules] ──> [new-tab.js]        │   │
│   │                                                                                │   │
│   │   [action-popup.js] (Isolated Toolbar Companion)                               │   │
│   └────────┬───────────────────┬───────────────────┬───────────────────┬───────────┘   │
│            │                   │                   │                   │               │
│            ▼                   ▼                   ▼                   ▼               │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌────────────────────┐   │
│   │  BROWSER APIS   │ │  EXTERNAL APIS  │ │   VENDOR LIBS   │ │   CLOUD SERVICES   │   │
│   │                 │ │                 │ │                 │ │                    │   │
│   │ • storage.local │ │ • Open-Meteo    │ │ • SortableJS    │ │ • Cloudflare R2    │   │
│   │ • bookmarks     │ │ • 11 RSS Feeds  │ │   (v1.15.7)     │ │   CDN (Media &     │   │
│   │ • tabs          │ │ • 7 Suggest APIs│ │                 │ │   Manifests)       │   │
│   │ • containers    │ │ • Google Favicon│ │                 │ │                    │   │
│   │ • Cache API     │ │                 │ │                 │ │                    │   │
│   │ • localStorage  │ │                 │ │                 │ │                    │   │
│   │ • Geolocation   │ │                 │ │                 │ │                    │   │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘ └────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Browser APIs

### 2.1 Extension Storage API (`browser.storage.local`)

- **Name**: Browser Extension Local Storage API (`browser.storage.local` / `chrome.storage.local`)
- **Purpose**: Authoritative persistent asynchronous key-value data store for all user preferences, custom bookmark metadata, folder configurations, cached weather data, todo items, search engine configurations, and gallery manifests.
- **Files**:
  - [src/preload.js#L389-L524](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js#L389-L524)
  - [src/new-tab.js#L11444-L11476](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11444-L11476)
  - [src/newtab/settings/settings-preferences.js#L1-L150](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js#L1-L150)
  - [src/newtab/widgets/todo.js#L40-L120](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L40-L120)
  - [src/newtab/widgets/weather.js#L50-L110](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L50-L110)
  - [src/action-popup/action-popup.js#L20-L80](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js#L20-L80)
- **Data exchanged**:
  - **Outbound**: Setting keys and serialized JSON values (`appShowSidebar`, `wallpaperSelection`, `bookmarkCustomMetadata`, `todoItems`, `cachedWeatherData`, `videosManifest`).
  - **Inbound**: Key-value dictionaries retrieved via `.get(keys)` or `.get(null)`.
- **Authentication**: None (Extension internal privilege governed by manifest `"permissions": ["storage"]`).
- **Failure handling**: Wrapped in `try...catch` and `.catch()` rejection handlers; errors logged via `console.warn`.
- **Fallback behavior**: Defaults defined in [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) are used if storage reads fail; synchronous mirrors in `localStorage` provide immediate fallback during cold boot.
- **Security risk**: **Low**. Data is origin-isolated to the extension UUID. Stored data is unencrypted plaintext.
- **Maintenance risk**: **Medium**. Lacks automated schema migration tooling. Removing or renaming storage keys risks orphaned data.

---

### 2.2 Storage Change Listener (`browser.storage.onChanged`)

- **Name**: Extension Storage Change Event System (`browser.storage.onChanged` / `chrome.storage.onChanged`)
- **Purpose**: Provides cross-tab and cross-component reactivity. When the Action Popup, Settings UI, or a secondary Homebase tab modifies a preference or adds a todo item, all active tabs receive the change event and patch their DOM in place without a reload.
- **Files**:
  - [src/new-tab.js#L7560-L7620](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L7560-L7620)
  - [src/newtab/widgets/todo.js#L280-L315](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js#L280-L315)
  - [src/newtab/core/tab-lifecycle.js#L25-L60](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/tab-lifecycle.js#L25-L60)
- **Data exchanged**:
  - **Inbound**: `changes` object containing `{ [key]: { oldValue, newValue } }` and `areaName` (`"local"`).
- **Authentication**: None (Internal browser IPC).
- **Failure handling**: Handlers check `areaName === 'local'` and verify `Object.prototype.hasOwnProperty.call(changes, key)`; exceptions in individual observers are trapped locally.
- **Fallback behavior**: If events fail or are missed, state synchronizes upon next tab open or page refresh.
- **Security risk**: **Low**. Internal browser message dispatching.
- **Maintenance risk**: **Low**. Stable standard WebExtensions API.

---

### 2.3 Bookmarks API (`browser.bookmarks`)

- **Name**: Browser Bookmarks Management API (`browser.bookmarks` / `chrome.bookmarks`)
- **Purpose**: Core functional dependency for reading the user's bookmark tree, rendering folders and links in the dashboard grid, creating new bookmarks/folders, updating titles/URLs, moving bookmarks during drag-and-drop reorder, and listening to native bookmark changes.
- **Files**:
  - [src/new-tab.js#L4000-L4200](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4000-L4200) (drag-and-drop `.move()`)
  - [src/new-tab.js#L5200-L5450](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L5200-L5450) (`.getTree()`, `.create()`, `.update()`, `.remove()`)
  - [src/newtab/bookmarks/folder-picker.js#L40-L110](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js#L40-L110)
  - [src/action-popup/action-popup.js#L90-L160](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js#L90-L160)
- **Data exchanged**:
  - **Inbound**: Hierarchical `BookmarkTreeNode` arrays containing `{ id, title, url, dateAdded, children, parentId, index }`.
  - **Outbound**: Creation, update, and movement payloads `{ parentId, title, url, index }`.
- **Authentication**: None (Requires manifest permission `"permissions": ["bookmarks"]`).
- **Failure handling**: Async API calls wrapped in `try...catch`; errors display user notifications via `showCustomAlert()` or log to console.
- **Fallback behavior**: If bookmarks API is unavailable or denied, Homebase displays an empty grid state with an alert prompting the user to grant permission.
- **Security risk**: **Medium**. Grants full read/write access to all user bookmarks across the browser.
- **Maintenance risk**: **Low–Medium**. Root folder structure differs between Chrome (`"1"` for Bookmarks Bar, `"2"` for Other Bookmarks) and Firefox (`"toolbar_____"` and `"unfiled_____"`). Homebase implements normalization helpers to reconcile IDs.

---

### 2.4 Tabs API (`browser.tabs`)

- **Name**: Browser Tabs Management API (`browser.tabs` / `chrome.tabs`)
- **Purpose**: Used to query the active tab's URL and title inside the Action Popup, navigate to search results or bookmark destinations (in current or new tab based on settings), and launch bookmarks inside specific Firefox containers.
- **Files**:
  - [src/new-tab.js#L9850-L9900](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L9850-L9900)
  - [src/newtab/integrations/firefox-containers.js#L60-L110](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js#L60-L110)
  - [src/action-popup/action-popup.js#L15-L45](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js#L15-L45)
- **Data exchanged**:
  - **Inbound**: Active `Tab` objects `{ id, url, title, favIconUrl, active }`.
  - **Outbound**: `browser.tabs.create({ url, active, cookieStoreId })` or `browser.tabs.update({ url })`.
- **Authentication**: None (Requires manifest permission `"permissions": ["tabs"]`).
- **Failure handling**: Trapped with `.catch(() => {})`; falls back to standard DOM `window.location.href = url` or `window.open(url, '_blank')`.
- **Fallback behavior**: Direct DOM window navigation when tabs API fails or in non-extension environments.
- **Security risk**: **Low–Medium**. Grants visibility into active tab URLs and allows programmatic navigation.
- **Maintenance risk**: **Low**. Standardized WebExtensions specification.

---

### 2.5 Firefox Contextual Identities (`browser.contextualIdentities`)

- **Name**: Firefox Multi-Account Containers API (`browser.contextualIdentities`)
- **Purpose**: Enables Firefox users to right-click bookmarks and open them in specific container tabs (e.g., Personal, Work, Banking, Shopping) with isolated cookie stores.
- **Files**:
  - [src/newtab/integrations/firefox-containers.js#L1-L150](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js#L1-L150)
  - [src/new-tab.js#L11487](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L11487)
- **Data exchanged**:
  - **Inbound**: Array of `ContextualIdentity` objects `{ cookieStoreId, name, color, icon, iconUrl }`.
  - **Outbound**: `cookieStoreId` passed into `browser.tabs.create()`.
- **Authentication**: None (Requires Firefox-exclusive manifest permission `"permissions": ["contextualIdentities"]`).
- **Failure handling**: Safe feature detection: `if (!browser?.contextualIdentities) return;`. On Chrome or Edge, feature gracefully no-ops without errors.
- **Fallback behavior**: In Chrome/Edge or when containers are disabled, context menu container options are hidden; bookmarks open in default browsing session.
- **Security risk**: **Low**. Read-only access to container names/colors; tab creation delegates cookie isolation to Firefox core.
- **Maintenance risk**: **Medium**. Firefox-exclusive API; must remain guarded to prevent `TypeError` on Chromium runtimes.

---

### 2.6 History API (`browser.history`)

- **Name**: Browser Browsing History Search API (`browser.history` / `chrome.history`)
- **Purpose**: Provides optional browsing history suggestions in the omnibox search dropdown when the user toggles "Show History Suggestions" in settings.
- **Files**:
  - [src/new-tab.js#L10450-L10510](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10450-L10510)
- **Data exchanged**:
  - **Inbound**: Array of `HistoryItem` objects `{ id, url, title, lastVisitTime, visitCount }` matching query text.
  - **Outbound**: Query parameters `{ text: query, maxResults: 5, startTime: 0 }`.
- **Authentication**: None (Requires manifest permission `"permissions": ["history"]`).
- **Failure handling**: Wrapped in `try...catch`; gracefully skipped if history search returns an error or is disabled.
- **Fallback behavior**: Omnibox displays only bookmark matches and search engine autocomplete suggestions.
- **Security risk**: **Medium**. Grants read access to full browsing history. History items are displayed locally in the UI and never transmitted over the network.
- **Maintenance risk**: **Low**. Stable browser extension API.

---

### 2.7 Runtime API (`browser.runtime`)

- **Name**: Extension Runtime Environment API (`browser.runtime` / `chrome.runtime`)
- **Purpose**: Used for resolving local package asset paths via `browser.runtime.getURL()`, detecting extension ID, and opening browser add-on store review pages.
- **Files**:
  - [src/new-tab.js#L680-L710](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L680-L710)
  - [src/newtab/core/dock-navigation.js#L40-L70](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js#L40-L70)
  - [src/newtab/widgets/quote.js#L45-L65](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L45-L65)
- **Data exchanged**:
  - **Inbound**: Resolved extension asset URLs (e.g., `chrome-extension://<id>/assets/quotes.json`).
- **Authentication**: None.
- **Failure handling**: Direct property checks (`browser?.runtime?.getURL || chrome?.runtime?.getURL`); relative paths used as fallback.
- **Fallback behavior**: Relative file paths (`assets/quotes.json`) used if runtime API resolution fails.
- **Security risk**: **Low**. Standard package path resolution.
- **Maintenance risk**: **Low**. Universal WebExtensions API.

---

### 2.8 Web Storage API (`window.localStorage`)

- **Name**: Synchronous Web Storage API (`window.localStorage`)
- **Purpose**: Delivers sub-50ms First Contentful Paint by maintaining synchronous mirrors (`fast-*` keys) of critical visual preferences (sidebar visibility, theme, widget order, clock format, background dim, cached weather, and cached wallpaper poster) read directly by [src/preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js) in `<head>` to prevent FOUC.
- **Files**:
  - [src/preload.js#L50-L387](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js#L50-L387)
  - [src/instant_load.js#L65-L160](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js#L65-L160)
  - [src/new-tab.js#L1695-L1720](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L1695-L1720)
  - [src/newtab/widgets/widget-visibility.js#L20-L80](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js#L20-L80)
- **Data exchanged**:
  - Synchronous strings: `fast-show-sidebar`, `fast-widget-order`, `fast-bg-dim`, `cachedAppliedPosterDataUrl`, `fast-weather`, `fast-todo`.
- **Authentication**: None (Origin-scoped).
- **Failure handling**: All reads and writes wrapped in `try...catch` blocks to protect against `SecurityError` (private browsing) or `QuotaExceededError`.
- **Fallback behavior**: If `localStorage` is disabled or empty, `preload.js` defaults to standard layout; `new-tab.js` asynchronously hydrates from `browser.storage.local`.
- **Security risk**: **Low**. Stored locally within extension origin.
- **Maintenance risk**: **Medium**. Must remain synchronized with `browser.storage.local`. Poster data URLs can approach the 5 MB origin storage quota if not size-capped.

---

### 2.9 Cache API (`window.caches`)

- **Name**: Service Worker Cache Storage API (`window.caches`)
- **Purpose**: Dedicated high-performance local binary blob storage for:
  1. `wallpaper-assets`: Curated background videos (MP4), high-resolution static wallpapers, and user-uploaded media.
  2. `favicons-v1`: Resolved favicon image responses for bookmark domains.
- **Files**:
  - [src/new-tab.js#L1250-L1410](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L1250-L1410) (wallpaper video cache)
  - [src/new-tab.js#L4650-L4760](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4650-L4760) (favicon cache)
  - [src/newtab/wallpaper/gallery-ui.js#L840-L910](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js#L840-L910)
- **Data exchanged**:
  - Full HTTP `Request` / `Response` objects containing binary image and video blobs.
- **Authentication**: None.
- **Failure handling**: Feature-tested via `typeof caches !== 'undefined'`; wrapped in async `try...catch`; corrupt cache entries deleted on read error.
- **Fallback behavior**: Falls back to direct network `fetch()` or default bundled assets ([assets/fallback.mp4](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/fallback.mp4)) if Cache API is unavailable or entry is missing.
- **Security risk**: **Low**. Sandboxed binary storage; no script execution from cache.
- **Maintenance risk**: **Low–Medium**. Cache versioning required (`wallpaper-assets-v1`, `favicons-v1`) to allow schema purges across releases.

---

### 2.10 Geolocation API (`navigator.geolocation`)

- **Name**: W3C Geolocation API (`navigator.geolocation.getCurrentPosition`)
- **Purpose**: Allows users to auto-detect their geographic coordinates (latitude and longitude) inside the Weather Widget settings modal to display local weather.
- **Files**:
  - [src/newtab/widgets/weather.js#L580-L625](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L580-L625)
- **Data exchanged**:
  - **Inbound**: `GeolocationPosition` object `{ coords: { latitude, longitude, accuracy } }`.
- **Authentication**: None (Requires explicit user browser consent modal on invocation).
- **Failure handling**: Error callback handles `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, and `TIMEOUT`; displays user-friendly error text in weather modal.
- **Fallback behavior**: Users can manually type and search for any city name using the Open-Meteo Geocoding API if geolocation permission is denied.
- **Security risk**: **Medium (Privacy)**. Transmits device location to browser location services. Coordinates are stored exclusively in local storage and only shared with the Open-Meteo weather endpoint.
- **Maintenance risk**: **Low**. Standard W3C web specification.

---

### 2.11 Clipboard API (`navigator.clipboard`)

- **Name**: Asynchronous Clipboard API (`navigator.clipboard.writeText`)
- **Purpose**: Enables one-click copying of inspirational quotes from the Quote Widget and calculation results from the Search Calculator card.
- **Files**:
  - [src/newtab/widgets/quote.js#L140-L165](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js#L140-L165)
  - [src/new-tab.js#L10885-L10895](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10885-L10895)
- **Data exchanged**:
  - **Outbound**: Plaintext strings (quote text + author attribution, or numerical math results).
- **Authentication**: Requires user activation (transient click gesture) and manifest permission `"permissions": ["clipboardRead"]`.
- **Failure handling**: Trapped via `.catch()`; falls back to legacy `document.execCommand('copy')` if Clipboard API fails.
- **Fallback behavior**: Legacy hidden textarea selection + `execCommand('copy')`.
- **Security risk**: **Low**. Write-only action triggered exclusively by explicit user button clicks.
- **Maintenance risk**: **Low**. Standard modern browser API.

---

### 2.12 HTML5 Canvas & 2D Context API

- **Name**: HTML5 Canvas 2D Rendering Context API
- **Purpose**: Used for client-side graphic processing:
  1. Extracting dominant average RGB color from wallpaper poster images to set the dynamic `--dynamic-accent` CSS theme variable.
  2. Generating video poster thumbnail frames from user-uploaded MP4 videos in the wallpaper gallery.
- **Files**:
  - [src/newtab/wallpaper/dynamic-accent.js#L1-L60](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/dynamic-accent.js#L1-L60)
  - [src/newtab/wallpaper/gallery-ui.js#L1120-L1150](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js#L1120-L1150)
- **Data exchanged**:
  - In-memory `ImageData` pixel buffers (`Uint8ClampedArray`).
- **Authentication**: Requires `img.crossOrigin = 'anonymous'` for external CDN images to prevent canvas tainting (`SecurityError`).
- **Failure handling**: Canvas operations wrapped in `try...catch`; `img.onerror` resolves default fallback accent color `#2ca5ff`.
- **Fallback behavior**: Default blue accent `#2ca5ff` applied if dynamic extraction fails or is blocked by CORS.
- **Security risk**: **Low**. In-memory pixel processing; tainted canvas protections enforced by browser.
- **Maintenance risk**: **Low**. Standard HTML5 specification.

---

## 3. External APIs

### 3.1 Open-Meteo Weather Forecast API

- **Name**: Open-Meteo Free Weather API
- **Purpose**: Retrieves current real-time meteorological conditions (temperature, weather code, humidity, wind speed, surface pressure, cloud cover, precipitation probability) for the user's configured location.
- **Files**:
  - [src/newtab/widgets/weather.js#L240-L360](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L240-L360)
- **Data exchanged**:
  - **Endpoint**: `https://api.open-meteo.com/v1/forecast`
  - **Outbound (Query Params)**: `latitude`, `longitude`, `current_weather=true`, `hourly=relativehumidity_2m,precipitation_probability,surface_pressure,cloudcover`, `daily=sunrise,sunset`, `timezone=auto`.
  - **Inbound (JSON)**: Weather metrics object `{ current_weather: { temperature, weathercode, windspeed }, daily: { sunrise, sunset }, ... }`.
- **Authentication**: None (Free, open-source API with no API key requirement).
- **Failure handling**: Enforces `WEATHER_FETCH_TIMEOUT_MS = 7000` via `AbortController`. Traps HTTP and network errors; displays `"Offline / Stale"` badge if request fails.
- **Fallback behavior**: Displays cached weather from `browser.storage.local` / `localStorage` (valid up to 48 hours).
- **Security risk**: **Low**. Manifest host permission restricted to `https://api.open-meteo.com/*`. Reads only weather metrics; does not execute code.
- **Maintenance risk**: **Low–Medium**. Dependent on Open-Meteo free tier availability and rate limits (10,000 daily requests per IP).

---

### 3.2 Open-Meteo Geocoding Search API

- **Name**: Open-Meteo Geocoding Search API
- **Purpose**: Resolves user-entered city names (e.g., "Tokyo", "London", "San Francisco") into geographic latitude/longitude coordinates with administrative regions and country codes.
- **Files**:
  - [src/newtab/widgets/weather.js#L420-L510](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L420-L510)
- **Data exchanged**:
  - **Endpoint**: `https://geocoding-api.open-meteo.com/v1/search`
  - **Outbound (Query Params)**: `name=<cityName>&count=8&language=en&format=json`.
  - **Inbound (JSON)**: Array of matching location records `[{ name, latitude, longitude, country, admin1 }, ...]`.
- **Authentication**: None.
- **Failure handling**: Uses `AbortController` to cancel in-flight requests if user types a new query; trapped in `try...catch`; displays `"No locations found"` on zero results or network failure.
- **Fallback behavior**: Location list displays empty state; previous location preserved intact.
- **Security risk**: **Low**. Manifest host permission restricted to `https://geocoding-api.open-meteo.com/*`. User queries sanitized with `encodeURIComponent()`.
- **Maintenance risk**: **Low**. Free geocoding service backed by Open-Meteo / OpenStreetMap.

---

### 3.3 BBC News RSS Feeds

- **Name**: BBC News RSS Feed Service
- **Purpose**: Provides headlines and article links for UK, World, Technology, and Entertainment news categories in the News Widget.
- **Files**:
  - [src/newtab/widgets/news.js#L20-L45](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L20-L45)
  - [src/newtab/widgets/news.js#L480-L540](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L480-L540)
- **Data exchanged**:
  - **Endpoints**:
    - World: `http://feeds.bbci.co.uk/news/world/rss.xml`
    - UK: `http://feeds.bbci.co.uk/news/rss.xml`
    - Tech: `http://feeds.bbci.co.uk/news/technology/rss.xml`
    - Entertainment: `http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml`
  - **Inbound**: XML document (`application/rss+xml`) containing `<item>` nodes with `<title>`, `<link>`, `<description>`, `<pubDate>`.
- **Authentication**: None.
- **Failure handling**: Caught in `fetchAndRenderNews()` `try...catch`; logs warning to console.
- **Fallback behavior**: Displays cached headlines from `fast-news` `localStorage` (30-minute TTL).
- **Security risk**: **Low–Medium**. Feed uses HTTP (`http://feeds.bbci.co.uk/*`), creating potential MITM vulnerability on untrusted networks. XML is parsed via `DOMParser` with descriptions truncated to 220 characters; no raw HTML injection.
- **Maintenance risk**: **Medium**. Dependent on BBC maintaining legacy RSS XML feed endpoints without deprecation.

---

### 3.4 Al Jazeera English RSS Feed

- **Name**: Al Jazeera English RSS Feed
- **Purpose**: Delivers international breaking news and headlines in the News Widget.
- **Files**:
  - [src/newtab/widgets/news.js#L28](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L28)
  - [src/newtab/widgets/news.js#L480-L540](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L480-L540)
- **Data exchanged**:
  - **Endpoint**: `https://www.aljazeera.com/xml/rss/all.xml`
  - **Inbound**: RSS 2.0 XML document.
- **Authentication**: None.
- **Failure handling**: Trapped in `try...catch`; `AbortController` cancels previous pending request.
- **Fallback behavior**: Cached news displayed; displays `"News feed unavailable"` on cold failure.
- **Security risk**: **Low**. Delivered over HTTPS (`https://www.aljazeera.com/*`). Content parsed safely.
- **Maintenance risk**: **Low–Medium**. Feed URL subject to publisher changes.

---

### 3.5 ESPN Top Headlines RSS Feed

- **Name**: ESPN Top News RSS Feed
- **Purpose**: Supplies sports headlines and match coverage in the News Widget.
- **Files**:
  - [src/newtab/widgets/news.js#L36](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L36)
  - [src/newtab/widgets/news.js#L480-L540](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L480-L540)
- **Data exchanged**:
  - **Endpoint**: `https://www.espn.com/espn/rss/news`
  - **Inbound**: RSS XML stream.
- **Authentication**: None.
- **Failure handling**: Standard fetch exception handling.
- **Fallback behavior**: Displays cached articles or empty state.
- **Security risk**: **Low**. Secured with HTTPS.
- **Maintenance risk**: **Medium**. ESPN frequently updates or redirects RSS feed structures.

---

### 3.6 ESPN Cricinfo RSS Feed

- **Name**: ESPN Cricinfo RSS Feed
- **Purpose**: Supplies cricket news, scores, and match reports in the News Widget.
- **Files**:
  - [src/newtab/widgets/news.js#L38](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L38)
- **Data exchanged**:
  - **Endpoint**: `http://www.espncricinfo.com/rss/content/story/feeds/0.xml`
  - **Inbound**: RSS XML stream.
- **Authentication**: None.
- **Failure handling**: Standard fetch exception handling.
- **Fallback behavior**: Cached articles or empty state.
- **Security risk**: **Low–Medium**. Transmitted via plaintext HTTP; subject to network MITM tampering.
- **Maintenance risk**: **Medium**. Legacy endpoint on FeedBurner/ESPN infrastructure.

---

### 3.7 TechCrunch RSS Feed

- **Name**: TechCrunch FeedBurner RSS Feed
- **Purpose**: Provides technology and startup industry headlines in the News Widget.
- **Files**:
  - [src/newtab/widgets/news.js#L34](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js#L34)
- **Data exchanged**:
  - **Endpoint**: `https://feeds.feedburner.com/TechCrunch/`
  - **Inbound**: RSS 2.0 XML stream.
- **Authentication**: None.
- **Failure handling**: Standard fetch exception handling.
- **Fallback behavior**: Cached articles or empty state.
- **Security risk**: **Low**. Secured with HTTPS.
- **Maintenance risk**: **Medium**. FeedBurner platform is legacy Google infrastructure.

---

### 3.8 Google Search Suggestions API

- **Name**: Google Suggest Autocomplete Service
- **Purpose**: Powers real-time search query completions when Google is the active search engine.
- **Files**:
  - [src/new-tab.js#L10420-L10450](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10420-L10450)
- **Data exchanged**:
  - **Endpoint**: `https://suggestqueries.google.com/complete/search`
  - **Outbound**: `?client=chrome&q=<encodedQuery>`.
  - **Inbound**: JSON array `[query, [suggestion1, suggestion2, ...], ...]`.
- **Authentication**: None.
- **Failure handling**: Debounced at 120ms; managed via `AbortController`; trapped in `try...catch`.
- **Fallback behavior**: Suggestions dropdown displays only local matching bookmarks.
- **Security risk**: **Low–Medium (Privacy)**. Transmits user keystrokes to Google. Can be disabled via settings toggle (`appSearchSuggestionsEnabled = false`).
- **Maintenance risk**: **Low**. Highly reliable, long-standing endpoint.

---

### 3.9 DuckDuckGo Autocomplete API

- **Name**: DuckDuckGo AC Suggestion API
- **Purpose**: Delivers live autocomplete suggestions when DuckDuckGo is the active search engine.
- **Files**:
  - [src/new-tab.js#L10455-L10475](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10455-L10475)
- **Data exchanged**:
  - **Endpoint**: `https://duckduckgo.com/ac/`
  - **Outbound**: `?q=<encodedQuery>&type=list`.
  - **Inbound**: JSON array `[query, [suggestion1, suggestion2, ...]]`.
- **Authentication**: None.
- **Failure handling**: Standard `AbortController` cancellation + LRU cache (`search-suggestion-cache.js`).
- **Fallback behavior**: Fallback to local bookmark search.
- **Security risk**: **Low**. Privacy-focused query endpoint.
- **Maintenance risk**: **Low**. Stable public autocomplete API.

---

### 3.10 Bing Suggestion API

- **Name**: Microsoft Bing OpenSearch Suggestion API
- **Purpose**: Provides query suggestions when Bing is selected.
- **Files**:
  - [src/new-tab.js#L10480-L10500](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10480-L10500)
- **Data exchanged**:
  - **Endpoint**: `https://api.bing.com/osjson.aspx`
  - **Outbound**: `?query=<encodedQuery>`.
  - **Inbound**: OpenSearch JSON array format `[query, [suggestions]]`.
- **Authentication**: None.
- **Failure handling**: Aborted on keystroke; caught in `try...catch`.
- **Fallback behavior**: Local bookmark matching only.
- **Security risk**: **Low–Medium**. Keystrokes sent to Microsoft.
- **Maintenance risk**: **Low**. Standard OpenSearch specification.

---

### 3.11 Yahoo Search Suggestion API

- **Name**: Yahoo Gossip Autocomplete Service
- **Purpose**: Provides query suggestions when Yahoo is selected.
- **Files**:
  - [src/new-tab.js#L10505-L10525](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10505-L10525)
- **Data exchanged**:
  - **Endpoint**: `https://ff.search.yahoo.com/gossip`
  - **Outbound**: `?output=fxjson&command=<encodedQuery>`.
  - **Inbound**: JSON array `[query, [suggestions]]`.
- **Authentication**: None.
- **Failure handling**: Aborted on keystroke; caught in `try...catch`.
- **Fallback behavior**: Local bookmark matching only.
- **Security risk**: **Low–Medium**. Keystrokes sent to Yahoo.
- **Maintenance risk**: **Medium**. Endpoint relies on Firefox partner parameter (`output=fxjson`).

---

### 3.12 Yandex Suggestion API

- **Name**: Yandex Suggest Service
- **Purpose**: Delivers live autocomplete suggestions for Yandex search engine users.
- **Files**:
  - [src/new-tab.js#L10530-L10550](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10530-L10550)
- **Data exchanged**:
  - **Endpoint**: `https://suggest.yandex.com/suggest-ya.cgi`
  - **Outbound**: `?v=4&part=<encodedQuery>`.
  - **Inbound**: Yandex JSON suggestion format.
- **Authentication**: None.
- **Failure handling**: Standard cancellation and error traps.
- **Fallback behavior**: Local bookmark matching only.
- **Security risk**: **Low–Medium**. Keystrokes transmitted to Yandex servers.
- **Maintenance risk**: **Low–Medium**. Proprietary query parameters.

---

### 3.13 Amazon Suggestion Completion API

- **Name**: Amazon Search Completion API
- **Purpose**: Powers shopping product query suggestions when Amazon search is active.
- **Files**:
  - [src/new-tab.js#L10555-L10575](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10555-L10575)
- **Data exchanged**:
  - **Endpoint**: `https://completion.amazon.com/api/2017/suggestions`
  - **Outbound**: `?prefix=<encodedQuery>&mid=ATVPDKIKX0DER&alias=aps`.
  - **Inbound**: JSON payload `{"suggestions": [{"value": "term"}, ...]}`.
- **Authentication**: None.
- **Failure handling**: Standard cancellation and error traps.
- **Fallback behavior**: Local bookmark matching only.
- **Security risk**: **Low–Medium**. Shopping search terms sent to Amazon.
- **Maintenance risk**: **Medium**. Dependent on Amazon API version parameter (`/api/2017/`).

---

### 3.14 Wikipedia OpenSearch API

- **Name**: Wikimedia Wikipedia OpenSearch API
- **Purpose**: Supplies encyclopedic title completions when Wikipedia search is active.
- **Files**:
  - [src/new-tab.js#L10580-L10600](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L10580-L10600)
- **Data exchanged**:
  - **Endpoint**: `https://en.wikipedia.org/w/api.php`
  - **Outbound**: `?action=opensearch&search=<query>&limit=8&format=json`.
  - **Inbound**: Standard OpenSearch JSON array `[query, [titles], [descriptions], [urls]]`.
- **Authentication**: None.
- **Failure handling**: Standard cancellation and error traps.
- **Fallback behavior**: Local bookmark matching only.
- **Security risk**: **Low**. Open public API.
- **Maintenance risk**: **Low**. Official MediaWiki API with strict backward compatibility guarantees.

---

### 3.15 Google Favicon Resolution Service (t2.gstatic.com)

- **Name**: Google Distributed Favicon V2 Service
- **Purpose**: Primary remote favicon resolution provider for bookmark URLs that lack local or cached icons.
- **Files**:
  - [src/new-tab.js#L4680-L4740](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4680-L4740)
- **Data exchanged**:
  - **Endpoint**: `https://t2.gstatic.com/faviconV2`
  - **Outbound**: `?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=<targetUrl>&size=32`.
  - **Inbound**: Binary PNG/ICO image stream.
- **Authentication**: None.
- **Failure handling**: Fetched as blob via `xhrFetchBlob(url, 8000)`. If 404 or image dimensions < 6x6 px, domain added to `faviconNegativeCache`.
- **Fallback behavior**: Generates colored letter avatar icon displaying the first character of the bookmark title with fallback theme color.
- **Security risk**: **Low–Medium (Privacy)**. Transmits bookmark domain names to Google servers during icon discovery.
- **Maintenance risk**: **Low–Medium**. Google could throttle or alter the undocumented `faviconV2` endpoint parameters.

---

## 4. Third-Party Libraries

### 4.1 SortableJS (v1.15.7)

- **Name**: SortableJS (`src/assets/js/Sortable.min.js`)
- **Purpose**: High-performance, touch-friendly HTML5 drag-and-drop library powering tile reordering in the Bookmark Grid and tab reordering in the Folder Navigation bar.
- **Files**:
  - [src/assets/js/Sortable.min.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js) (vendored minified library, 45,479 bytes)
  - [src/newtab/core/sortable-bridge.js#L1-L60](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/sortable-bridge.js#L1-L60) (unified wrapper)
  - [src/new-tab.js#L4000-L4080](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L4000-L4080)
- **Data exchanged**:
  - In-memory DOM drag events (`dragstart`, `dragover`, `drop`, `touchmove`); updates `data-bookmark-id` positions.
- **Authentication**: None (Locally vendored script).
- **Failure handling**: Bridged through `initUnifiedSortable()`; falls back to static grid if Sortable fails to initialize.
- **Fallback behavior**: Tiles remain clickable and accessible via keyboard/context menus; drag reordering disabled.
- **Security risk**: **Very Low**. Known, well-audited library version (v1.15.7) vendored locally inside the extension package with no remote CDN script loading.
- **Maintenance risk**: **Low**. Pinned static file governed by AGENTS.md rule: *"Do not move src/assets/js/Sortable.min.js unless explicitly requested."*

---

## 5. Cloud Services

### 5.1 Cloudflare R2 Content Delivery Network

- **Name**: Cloudflare R2 Global Asset CDN (`pub-552ebdc4e1414c8594cec0ac58404459.r2.dev`)
- **Purpose**: Authoritative remote media distribution network delivering curated video wallpapers (MP4/WebM), high-resolution static posters (WebP/JPG), and the centralized gallery catalog manifest (`videos-manifest.json`).
- **Files**:
  - [src/new-tab.js#L950-L1130](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L950-L1130) (`getVideosManifest()`, `fetchRemoteGalleryManifest()`)
  - [src/newtab/wallpaper/gallery-ui.js#L220-L310](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js#L220-L310)
- **Data exchanged**:
  - **Manifest Endpoint**: `https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/videos-manifest.json`
  - **Media Endpoints**: `https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/<videoId>.mp4`, `.../<posterId>.webp`
  - **Inbound**: JSON manifest array `[{ id, title, category, videoUrl, posterUrl, tags }, ...]` and binary video/image streams.
- **Authentication**: None (Publicly readable R2 CDN bucket).
- **Failure handling**: Manifest fetched via `fetchWithTimeout(url, 7000)`. Cached manifest in `browser.storage.local` is used if R2 is unreachable; media loading errors fall back to local [assets/fallback.mp4](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/fallback.mp4) and [assets/fallback.webp](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/fallback.webp).
- **Fallback behavior**: Bundled local fallback media renders instantly if CDN is offline or user is disconnected.
- **Security risk**: **Low**. CDN endpoints declared in manifest `host_permissions`. Assets are strictly media and static JSON; no remote executable scripts are loaded.
- **Maintenance risk**: **Medium**. Relies on persistent availability of the Cloudflare R2 bucket and URL stability.

---

## 6. Comprehensive Integration Matrix

| Integration Name | Category | Host / Namespace | Auth Required | Manifest Permission | Security Risk | Maintenance Risk |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| `browser.storage.local` | Browser API | `browser.storage` | No | `"storage"` | Low | Medium |
| `browser.storage.onChanged` | Browser API | `browser.storage` | No | `"storage"` | Low | Low |
| `browser.bookmarks` | Browser API | `browser.bookmarks` | No | `"bookmarks"` | Medium | Medium |
| `browser.tabs` | Browser API | `browser.tabs` | No | `"tabs"` | Low–Medium | Low |
| `browser.contextualIdentities` | Browser API | `browser.contextualIdentities` | No | `"contextualIdentities"` (Firefox) | Low | Medium |
| `browser.history` | Browser API | `browser.history` | No | `"history"` | Medium | Low |
| `browser.runtime` | Browser API | `browser.runtime` | No | None (Core) | Low | Low |
| `window.localStorage` | Browser API | `window.localStorage` | No | None (Web Standard) | Low | Medium |
| `window.caches` | Browser API | `window.caches` | No | None (Web Standard) | Low | Low |
| `navigator.geolocation` | Browser API | `navigator.geolocation` | User Prompt | None (Prompt) | Medium | Low |
| `navigator.clipboard` | Browser API | `navigator.clipboard` | User Gesture | `"clipboardRead"` | Low | Low |
| HTML5 Canvas API | Browser API | `HTMLCanvasElement` | No | None (Web Standard) | Low | Low |
| Open-Meteo Weather | External API | `api.open-meteo.com` | No | Host Permission | Low | Low–Medium |
| Open-Meteo Geocoding | External API | `geocoding-api.open-meteo.com` | No | Host Permission | Low | Low |
| BBC News RSS | External API | `feeds.bbci.co.uk` | No | Host Permission | Low–Medium (HTTP) | Medium |
| Al Jazeera RSS | External API | `www.aljazeera.com` | No | Host Permission | Low | Low–Medium |
| ESPN News RSS | External API | `www.espn.com` | No | Host Permission | Low | Medium |
| ESPN Cricinfo RSS | External API | `www.espncricinfo.com` | No | Host Permission | Low–Medium (HTTP) | Medium |
| TechCrunch RSS | External API | `feeds.feedburner.com` | No | Host Permission | Low | Medium |
| Google Suggestions | External API | `suggestqueries.google.com` | No | Host Permission | Low–Medium (Privacy) | Low |
| DuckDuckGo AC | External API | `duckduckgo.com` | No | Host Permission | Low | Low |
| Bing Suggestions | External API | `api.bing.com` | No | Host Permission | Low–Medium (Privacy) | Low |
| Yahoo Suggestions | External API | `ff.search.yahoo.com` | No | Host Permission | Low–Medium (Privacy) | Medium |
| Yandex Suggestions | External API | `suggest.yandex.com` | No | Host Permission | Low–Medium (Privacy) | Low–Medium |
| Amazon Suggestions | External API | `completion.amazon.com` | No | Host Permission | Low–Medium (Privacy) | Medium |
| Wikipedia OpenSearch | External API | `en.wikipedia.org` | No | Host Permission | Low | Low |
| Google Favicons | External API | `t2.gstatic.com` | No | Host Permission | Low–Medium (Privacy) | Low–Medium |
| SortableJS (v1.15.7) | Vendor Library | `src/assets/js/Sortable.min.js` | No | None (Local Bundle) | Very Low | Low |
| Cloudflare R2 CDN | Cloud Service | `*.r2.dev` | No | Host Permission | Low | Medium |

---

## 7. Security & Architectural Risk Assessment

### 1. Mixed Content Vulnerability in RSS Feeds
Two configured news feeds operate over unencrypted HTTP:
- BBC News: `http://feeds.bbci.co.uk/news/...`
- ESPN Cricinfo: `http://www.espncricinfo.com/rss/content/story/feeds/0.xml`
Because these requests traverse cleartext networks, an attacker on a shared or public Wi-Fi network could theoretically modify headline text. While `newtab/widgets/news.js` sanitizes titles and does not execute raw HTML, upgrading these endpoints to HTTPS (`https://`) will eliminate transport-layer tampering risks.

### 2. Search Autocomplete Privacy Considerations
Omnibox suggestion fetching transmits partial user keystrokes in real-time to the selected external search engine (Google, Microsoft Bing, Yahoo, Yandex, or Amazon). Users should remain informed that:
- Keystrokes are sent to the active provider.
- Suggestions can be globally toggled off via `appSearchSuggestionsEnabled = false` in Settings.
- DuckDuckGo and Wikipedia provide privacy-focused alternatives with zero tracking identifiers.

### 3. Anonymous Endpoint Reliance
None of the external APIs (Open-Meteo, RSS publishers, suggestion providers, R2 CDN) require API keys or user credentials. While this eliminates credential exposure and token management overhead, it creates exposure to:
- IP-based rate limiting (HTTP 429).
- Unannounced deprecation or restructuring of undocumented endpoints (such as `t2.gstatic.com` or Yahoo gossip).
Homebase's extensive multi-tier caching (Cache API, `browser.storage.local`, and synchronous `localStorage` mirrors) mitigates this risk by ensuring the dashboard remains fully functional offline or during upstream outages.

---

> **Integration Map Complete**: This document serves as the single source of truth for all internal and external communication interfaces across Homebase. No source code was modified during its compilation.
