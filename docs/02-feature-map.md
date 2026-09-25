# Homebase — Complete Feature Inventory

> **Author**: Principal Software Architect  
> **Date**: 2026-09-24  
> **Scope**: Read-only feature analysis — no code modifications  
> **Prerequisites**: [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md)

---

## Table of Contents

1. [Search System](#1-search-system)
2. [Bookmark System](#2-bookmark-system)
3. [Weather Widget](#3-weather-widget)
4. [News Widget](#4-news-widget)
5. [Todo Widget](#5-todo-widget)
6. [Quote Widget](#6-quote-widget)
7. [Time & Date Widget](#7-time--date-widget)
8. [Wallpaper & Video Background System](#8-wallpaper--video-background-system)
9. [Settings System](#9-settings-system)
10. [Themes & Visual Effects](#10-themes--visual-effects)
11. [Firefox Integrations](#11-firefox-integrations)
12. [Action Popup (Toolbar Companion)](#12-action-popup-toolbar-companion)
13. [Import / Export (Backup & Restore)](#13-import--export-backup--restore)
14. [Hidden & Developer Features](#14-hidden--developer-features)

---

## 1. Search System

**Feature name**: Unified Multi-Engine Search with Live Suggestions

**Purpose**: Provide a single search bar that can query 13 different search engines, with bang shortcuts, inline math/unit evaluation, URL detection, search history, live autocomplete suggestions, and keyboard-driven navigation.

**User workflow**:
1. Focus the search bar (always visible on the dashboard).
2. Type a query. As you type:
   - Matching bookmarks appear in a "Bookmarks" results section.
   - Search suggestions appear from the active engine's suggestion API (if enabled).
   - Math expressions (e.g., `2+2`, `=5*10`) are evaluated inline with a copy button.
   - Unit conversions (e.g., `100 kg to lbs`, `30 c to f`) show results inline.
   - URLs/domains/IPs are detected and navigated to directly.
3. Switch engines via the selector dropdown, mouse wheel on the selector, or `Alt+Arrow Down/Up`.
4. Use bang shortcuts (e.g., `!g cats`, `!yt lo-fi`, `!w Firefox`) to search a specific engine regardless of the current selection.
5. Press Enter to execute the search; results open in the current or new tab based on settings.
6. Select a suggestion or bookmark result with arrow keys and Enter.

**Main files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — Lines 7721–9900+: `searchEngines[]`, `bangMap`, `setupSearch()`, `handleSearch()`, `handleSearchInput()`, `handleSearchKeydown()`, `executeSearch()`, `cycleSearchEngine()`, `fetchSuggestions()`, `populateSearchOptions()`, `updateSearchUI()`

**Supporting files**:
- [newtab/search/search-utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js) — `evaluateMath()`, `evaluateUnits()`, `isLikelyUrl()`
- [newtab/search/search-suggestion-cache.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-suggestion-cache.js) — LRU suggestion cache (150 entries)
- [newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) — Search engine manager modal (enable/disable/reorder)
- [data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) — `createSvgIconElement()` for engine icons

**Browser APIs**:
- `browser.storage.local` — persist engine preferences, current engine selection, remember-engine toggle
- `browser.history.search()` — search history suggestions (when enabled)

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `searchEnginesConfig` | `Array<{id, enabled}>` | Engine order and enabled state |
| `currentSearchEngineId` | `string` | Last-used engine (when "remember engine" is on) |
| `appSearchRememberEngine` | `boolean` | Whether to persist engine choice across sessions |
| `appSearchDefaultEngine` | `string` | Preferred default engine ID |
| `appSearchOpenNewTab` | `boolean` | Open results in new tab |
| `appSearchMath` | `boolean` | Enable inline math evaluation |
| `appSearchShowHistory` | `boolean` | Show history-based suggestions |
| `appSearchSuggestionsEnabled` | `boolean` | Enable live autocomplete suggestions |
| `fast-search-*` | `localStorage` | Synchronous mirrors for instant hydration |

**Dependencies**: SVG sprite sheet for engine icons, `debounce()` from `core/utils.js`

**Performance impact**: **Medium**. Search setup is deferred to idle scheduler (`startup:setupSearch`). Suggestion fetching uses `AbortController` to cancel stale requests and an LRU cache (150 entries) to avoid repeat network calls. Debounced at 120ms.

**Security impact**: **Low–Medium**. Search suggestion URLs are fetched from external APIs (Google, DuckDuckGo, Bing, Yahoo, Yandex, Amazon, Wikipedia). All are declared in `host_permissions`. The `evaluateMath()` function uses a custom parser (not `eval()`), eliminating code injection risk.

**Testing requirements**:
- Verify each bang shortcut resolves to the correct engine
- Test math evaluation edge cases (division by zero, exponents)
- Test unit conversion (C↔F, kg↔lbs, km↔mi)
- Test URL detection (localhost, IPs, domains, schemes)
- Test keyboard navigation (arrow keys, Enter, Escape)
- Test engine cycling (mouse wheel, Alt+Arrow)
- Test suggestion cancellation (rapid typing)
- Manual Firefox testing for `browser.history.search()` behavior

**Possible improvement ideas**:
- Extract the 2000+ line search system from `new-tab.js` into `newtab/search/`
- Add custom user-defined search engines
- Support `!bang` shortcuts for custom engines
- Add search history persistence (recent searches)
- Add search result preview / instant answers

---

## 2. Bookmark System

**Feature name**: Visual Bookmark Grid with Tabbed Folder Navigation

**Purpose**: Provide a visually rich bookmark browser with folder tabs, drag-and-drop reorder, custom icons, per-folder/per-bookmark color customization, favicon resolution, context menus, and CRUD operations.

**User workflow**:
1. The dashboard main area shows a grid of bookmark icons organized by folder.
2. Folder tabs along the top allow switching between bookmark folders.
3. Click a bookmark to navigate (in current or new tab per settings).
4. Right-click a bookmark for context menu: Edit, Delete, Move, Open in Container (Firefox).
5. Right-click a folder tab for folder-level actions: Open All, Rename, Delete.
6. Drag and drop bookmarks to reorder within the grid.
7. Use the "+" quick-action buttons to add bookmarks or folders.
8. Use the "More" button for additional actions (open all, paste-to-save).
9. Use the folder picker modal to set the Homebase root folder.
10. Customize bookmark appearance via the bookmark editor (title, URL, icon, color).

**Main files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `loadBookmarks()`, `renderBookmarkGrid()`, `renderBookmarkTabs()`, `findBookmarkNodeById()`, context menu handlers, favicon resolution, drag/reorder logic (~3000+ lines)
- [assets/js/bookmark-editor.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/bookmark-editor.js) — Lazy-loaded bookmark editing modal (~2000 lines)
- [assets/js/icon-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/icon-picker.js) — Lazy-loaded icon selector

**Supporting files**:
- [newtab/bookmarks/quick-actions.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/quick-actions.js) — Quick add bookmark/folder buttons
- [newtab/bookmarks/bookmark-style-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-style-runtime.js) — Text background, fallback color, folder color CSS application
- [newtab/bookmarks/grid-reorder-animation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/grid-reorder-animation.js) — FLIP animation for grid reorder
- [newtab/bookmarks/bookmark-tabs-scroll.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-tabs-scroll.js) — Smooth scroll for folder tab overflow
- [newtab/bookmarks/folder-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js) — Root folder selection modal with search
- [newtab/settings/material-color-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/material-color-picker.js) — Color palette modal for bookmark/folder customization

**Browser APIs**:
- `browser.bookmarks.getTree()`, `.getChildren()`, `.create()`, `.update()`, `.remove()`, `.removeTree()`, `.move()`, `.search()` — Full bookmark CRUD
- `browser.storage.local` — Bookmark metadata, folder metadata, last-used folder
- Cache API (`favicons-v1`) — Resolved favicon blob caching

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `bookmarkCustomMetadata` | `Object` | Per-bookmark custom icons, colors, labels |
| `folderCustomMetadata` | `Object` | Per-folder custom colors |
| `homebaseBookmarkRootId` | `string` | User-chosen root folder for the grid |
| `lastUsedBookmarkFolderId` | `string` | Last-visited folder tab |
| `domainIconMap` | `Object` | Cached favicon URLs by domain |
| `appBookmarkOpenNewTab` | `boolean` | Open bookmarks in new tab |
| `appBookmarkTextBg` | `boolean` | Enable text background on labels |
| `appBookmarkTextBgColor` | `string` | Text background hex color |
| `appBookmarkTextBgOpacity` | `number` | Text background opacity (0–1) |
| `appBookmarkTextBgBlur` | `number` | Text background blur radius (px) |
| `appBookmarkFallbackColor` | `string` | Default color for bookmarks without favicons |
| `appBookmarkFolderColor` | `string` | Default folder icon color |

**Dependencies**: `Sortable.min.js` (vendor drag-and-drop), `core/sortable-bridge.js`, Material Color Picker

**Performance impact**: **High**. Bookmarks are the primary critical-path await in `initializePage`. Favicon resolution involves network fetches to `t2.gstatic.com` and caching to the Cache API. Grid re-render uses DOM `DocumentFragment` and FLIP animation to minimize layout thrashing. The folder index for the picker is cached with a 30-second TTL.

**Security impact**: **Low**. Bookmark URLs are user-controlled. The extension uses `escapeHtml()` for titles in certain contexts but also uses `innerHTML` in some bookmark rendering paths.

**Testing requirements**:
- Test folder navigation (deep nesting, empty folders, root switch)
- Test drag and drop reorder (grid and tabs)
- Test context menu actions (edit, delete, move, open all)
- Test bookmark editor (title, URL, icon, color changes)
- Test folder picker (search, selection, confirm)
- Test favicon resolution and cache fallbacks
- Test bookmark text background styling (color, opacity, blur)
- Manual Firefox testing for container-aware bookmark opening

**Possible improvement ideas**:
- Extract bookmark rendering logic from `new-tab.js` (~3000 lines)
- Add bookmark search/filter within the grid
- Support bookmark import from HTML file
- Add bookmark tags/categories beyond folder hierarchy
- Lazy-load bookmark grid tiles for very large folders

---

## 3. Weather Widget

**Feature name**: Real-Time Weather Display with Location Configuration

**Purpose**: Show current weather conditions (temperature, weather code icon, city name, humidity, wind) with user-configurable location and temperature units.

**User workflow**:
1. Weather widget appears in the sidebar (if enabled).
2. First-time users see a "Set Location" prompt.
3. Click the settings icon on the weather widget to open the weather settings modal.
4. Search for a city (geocoding via Open-Meteo API) or use "Use my location" (browser geolocation).
5. Choose °C or °F.
6. Save — weather data fetches from the Open-Meteo API and displays.
7. Click the refresh button to force-refresh.
8. Cached data is shown on subsequent tab opens; auto-refreshes if stale (30 min TTL).

**Main files**:
- [newtab/widgets/weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js) — 1080 lines: `setupWeather()`, `loadCachedWeather()`, `fetchWeatherData()`, `renderWeather()`, geocoding search, settings modal

**Supporting files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setupWeatherSafe()`, `loadCachedWeatherSafe()` (idle scheduler wrappers)
- [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) — `localStorage` weather cache hydration

**Browser APIs**:
- `browser.storage.local` — Weather data cache, location, units
- `navigator.geolocation.getCurrentPosition()` — Auto-locate
- `fetch()` — Open-Meteo weather and geocoding APIs

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `cachedWeatherData` | `Object` | Full weather API response cache |
| `weatherFetchedAt` | `number` | Timestamp of last fetch |
| `weatherLat` / `weatherLon` | `number` | User's location coordinates |
| `weatherCityName` | `string` | Display city name |
| `weatherUnits` | `string` | `celsius` or `fahrenheit` |
| `cachedCityName` / `cachedUnits` | `string` | Cached display state |
| `fast-show-weather` | `localStorage` | Visibility mirror for instant preload |

**Dependencies**: Open-Meteo API (`api.open-meteo.com`, `geocoding-api.open-meteo.com`). No API key required.

**Performance impact**: **Low–Medium**. Deferred to idle scheduler. Uses 30-minute cache TTL with `AbortController` for stale geocoding requests. Cached weather renders instantly on subsequent tab opens via `localStorage`.

**Security impact**: **Low**. Geolocation requires user consent. No API key. Weather data is read-only. Coordinates are stored locally only.

**Testing requirements**:
- Test geocoding search (multiple results, no results)
- Test geolocation auto-detect (permission granted, denied)
- Test cache staleness logic (fresh vs. stale vs. offline)
- Test unit toggle (°C ↔ °F persistence)
- Test refresh button behavior
- Manual Firefox testing for storage persistence

**Possible improvement ideas**:
- Add multi-day forecast
- Add weather alerts
- Add weather icon animation
- Support multiple location presets
- Reduce 1080-line file by extracting rendering logic

---

## 4. News Widget

**Feature name**: RSS News Feed Reader

**Purpose**: Display headlines from configurable RSS news sources with inline article previews.

**User workflow**:
1. News widget appears in the sidebar (if enabled).
2. Shows 5 headlines from the selected source.
3. Click the settings icon to change news source.
4. 11 built-in sources (Al Jazeera, BBC variants, TechCrunch, ESPN, ESPN Cricinfo).
5. Click the refresh button to force-refresh.
6. Articles open in a new tab on click.
7. Cached news shown on subsequent tab opens (30 min TTL).

**Main files**:
- [newtab/widgets/news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) — 774 lines: `setupNewsWidget()`, `fetchNewsData()`, `renderNewsItems()`, RSS XML parser, settings modal, source selection

**Supporting files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setupNewsWidgetSafe()` (idle scheduler wrapper)

**Browser APIs**:
- `browser.storage.local` — News source preference, cached data
- `fetch()` — RSS feed XML fetch

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `appNewsSource` | `string` | Selected news source ID |
| `fast-show-news` | `localStorage` | Visibility mirror |

**Dependencies**: Built-in RSS XML parser (no external library). Network access to RSS feed URLs declared in `host_permissions`.

**Performance impact**: **Low**. Deferred to idle scheduler. Uses `AbortController` for fetch cancellation. Lazy-loads via `IntersectionObserver` (triggers fetch only when widget scrolls into view). 30-minute cache TTL.

**Security impact**: **Low**. RSS feeds are read-only from declared hosts. Article descriptions are truncated to 220 chars. HTML content from RSS is not injected raw.

**Testing requirements**:
- Test each RSS source URL for valid XML response
- Test source switching and persistence
- Test cache behavior (fresh, stale, offline)
- Test empty state (no headlines available)
- Test refresh behavior

**Possible improvement ideas**:
- Support user-defined custom RSS feed URLs
- Add read/unread tracking
- Add article snippet expansion
- Add keyword filtering

---

## 5. Todo Widget

**Feature name**: Persistent Task List

**Purpose**: Simple, persistent todo list with add, complete, delete, filter, and clear-completed functionality.

**User workflow**:
1. Todo widget appears in the sidebar (if enabled).
2. Type a task in the input and press Enter or click Add.
3. Click the checkbox to toggle completion.
4. Click Delete to remove a task.
5. Use "All" / "Active" filter buttons to show/hide completed tasks.
6. Click "Clear completed" to remove all done tasks.
7. Tasks persist across sessions via `browser.storage.local`.
8. Cross-tab sync: changes in one Homebase tab appear in others via `storage.onChanged`.

**Main files**:
- [newtab/widgets/todo.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/todo.js) — 333 lines: full implementation

**Supporting files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setupTodoWidgetSafe()`, `handleTodoStorageChange()`
- [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) — `localStorage` todo cache hydration

**Browser APIs**:
- `browser.storage.local` — `todoItems`, `todoHideDone`
- `browser.storage.onChanged` — Cross-tab reactivity

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `todoItems` | `Array<{id, text, done, createdAt}>` | Task list |
| `todoHideDone` | `boolean` | Filter completed tasks |
| `fast-todo` | `localStorage` | Instant preload mirror |

**Dependencies**: None.

**Performance impact**: **Very Low**. Small DOM, minimal storage I/O. Deferred to idle scheduler.

**Security impact**: **None**. Fully local data, no network access.

**Testing requirements**:
- Test add, complete, delete, clear-completed
- Test filter toggle (All vs. Active)
- Test cross-tab sync
- Test empty state messages
- Test ID uniqueness and normalization

**Possible improvement ideas**:
- Add drag-and-drop task reordering
- Add due dates and reminders
- Add task categories/tags
- Support markdown in task text

---

## 6. Quote Widget

**Feature name**: Daily Inspirational Quotes

**Purpose**: Display rotating inspirational quotes from a local catalog with configurable categories and update frequency.

**User workflow**:
1. Quote widget appears in the sidebar (if enabled).
2. Shows a quote with author attribution.
3. Click the "Next" button to cycle to the next quote.
4. Click the "Copy" button to copy the quote to clipboard.
5. Click the settings icon to configure:
   - Quote categories (filter by tag)
   - Update frequency (hourly, daily, etc.)
6. Quotes are loaded from a local JSON catalog (no network required).

**Main files**:
- [newtab/widgets/quote.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/quote.js) — 877 lines: `setupQuoteWidget()`, `fetchQuote()`, `ensureQuoteIndexBuilt()`, `renderCachedQuoteState()`, category filtering, frequency logic

**Supporting files**:
- [assets/quotes.json](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/quotes.json) — Local quote database
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setupQuoteWidgetSafe()`, `fetchQuoteSafe()`, `buildQuoteIndexSafe()`
- [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) — `localStorage` quote cache hydration

**Browser APIs**:
- `browser.storage.local` — Quote index, frequency preference, category tags
- `navigator.clipboard.writeText()` — Copy to clipboard

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `quoteLocalIndexV1` | `Object` | Pre-built quote index by category |
| `quoteUpdateFrequency` | `string` | Update schedule (`hourly`, `daily`, etc.) |
| `quoteTags` | `Array<string>` | Selected category tags |
| `fast-quote-state` | `localStorage` | Cached current/next quote for instant display |

**Dependencies**: `assets/quotes.json` (bundled, no network fetch)

**Performance impact**: **Low**. Quote index build is deferred to idle scheduler and skipped if already built. Rendering is a simple text update.

**Security impact**: **None**. Local data, no network. Clipboard write requires user action.

**Testing requirements**:
- Test quote cycling and category filtering
- Test frequency scheduling logic
- Test copy-to-clipboard
- Test cached state restoration on tab open
- Test edge case: empty categories, missing quotes.json

**Possible improvement ideas**:
- Add user-defined custom quotes
- Add favorite/bookmark quotes
- Add quote sharing (URL, social)
- Support external quote APIs as optional source

---

## 7. Time & Date Widget

**Feature name**: Digital Clock with Date Display

**Purpose**: Show the current time and date in a prominent position on the dashboard.

**User workflow**:
1. Time and date are always visible in the main area.
2. Time format (12-hour / 24-hour) is configurable in Settings.
3. Updates every 60 seconds.
4. Instantly hydrated from system time on tab open (via `instant_load.js`).

**Main files**:
- [newtab/widgets/time.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/time.js) — 43 lines: `updateTime()`, `applyTimeFormatPreference()`

**Supporting files**:
- [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) — Instant clock hydration
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setInterval(updateTime, 60000)`

**Browser APIs**: None (uses `Date` and `Intl` locale formatting).

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `appTimeFormatPreference` | `string` | `12-hour` or `24-hour` |
| `fast-time-format` | `localStorage` | Instant preload mirror |

**Dependencies**: None.

**Performance impact**: **Negligible**. Single DOM update every 60 seconds.

**Security impact**: **None**.

**Testing requirements**:
- Test 12-hour vs. 24-hour format
- Test date locale formatting
- Verify instant hydration matches deferred rendering

**Possible improvement ideas**:
- Add analog clock option
- Add timezone display
- Add world clock / multiple timezones
- Reduce update interval to 1 second for seconds display

---

## 8. Wallpaper & Video Background System

**Feature name**: Curated Wallpaper Gallery with Video Backgrounds, Daily Rotation, and User Uploads

**Purpose**: Replace the default browser background with curated video/image wallpapers from an R2 CDN gallery, user-uploaded media, or daily rotating selections. Includes offline caching via the Cache API.

**User workflow**:
1. Dashboard loads with the user's selected wallpaper (poster image, then video playback).
2. Click the Gallery icon in the dock to browse the wallpaper gallery.
3. Gallery shows curated wallpapers with tag-based filtering and favorites.
4. Select a wallpaper → preview → apply.
5. Toggle settings: wallpaper type (video/static), quality (high/low), daily rotation.
6. Upload custom wallpapers (images or videos) via the "My Wallpapers" section.
7. Click the "Next" wallpaper button in the dock for quick random rotation.
8. Dual-video crossfade for seamless looping.
9. Cinema mode hides UI after 8 seconds of inactivity.

**Main files**:
- [newtab/wallpaper/gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) — 2962 lines: `window.HomebaseGallery` revealing module. Virtual-scrolling gallery grid, favorites, my-wallpapers, upload, settings preview, apply workflow.
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `applyWallpaperByType()`, `waitForWallpaperReady()`, `setupBackgroundVideoCrossfade()`, `ensureDailyWallpaper()`, wallpaper caching (`cacheAppliedWallpaperVideo`, `cacheAppliedWallpaperPoster`), `getVideosManifest()`, `hydrateWallpaperSelection()`

**Supporting files**:
- [newtab/wallpaper/dynamic-accent.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/dynamic-accent.js) — Extract average color from wallpaper poster and set `--dynamic-accent` CSS variable
- [newtab/settings/cinema-mode-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/cinema-mode-runtime.js) — 8-second idle timer, auto-hide UI
- [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js) — Instant poster application from `localStorage` cache
- [assets/fallback.mp4](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/fallback.mp4), [assets/fallback.webp](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/fallback.webp) — Default backgrounds

**Browser APIs**:
- `browser.storage.local` — Wallpaper selection, gallery manifest cache, favorites, rotation state
- Cache API (`wallpaper-assets`) — Offline blob cache for video and poster images
- `fetch()` — R2 CDN for wallpaper assets and gallery manifest JSON

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `wallpaperSelection` | `Object` | Current wallpaper ID, URLs, metadata |
| `wallpaperTypePreference` | `string` | `video` or `static` |
| `wallpaperQualityPreference` | `string` | `high` or `low` |
| `dailyWallpaperEnabled` | `boolean` | Enable daily rotation |
| `galleryFavorites` | `Array<string>` | Favorite wallpaper IDs |
| `videosManifest` / `videosManifestFetchedAt` | `Object` / `number` | Gallery manifest cache |
| `cachedGalleryPosters` | `Object` | Gallery poster URL cache |
| `cachedAppliedPosterUrl` / `cachedAppliedPosterDataUrl` | `string` | Active poster cache |
| `cachedAppliedVideoUrl` | `string` | Active video cache URL |
| `wallpaperPoolIds` | `Array<string>` | Rotation pool |
| `wallpaperFallbackUsedAt` | `number` | Fallback tracking |
| `wallpaperStartupState` | `localStorage` | Startup poster for instant display |

**Dependencies**: R2 CDN (`pub-552ebdc4e1414c8594cec0ac58404459.r2.dev`), Cache API, `canvas` for dynamic accent extraction

**Performance impact**: **High**. The wallpaper system is the most performance-sensitive feature:
- `preload.js` sets a CSS poster background synchronously from `localStorage` data URL
- Video loading is non-blocking (`waitForWallpaperReady` does not block `initializePage`)
- Poster caching uses `blobToDataUrl()` for instant next-load display
- Dual-video crossfade uses `requestVideoFrameCallback` for frame-accurate transitions
- Performance mode disables all video playback and accent extraction
- Gallery grid uses virtual scrolling with pooled DOM nodes

**Security impact**: **Low**. Media is loaded from a trusted R2 CDN. User-uploaded wallpapers are stored locally in the Cache API. `canvas` cross-origin images use `crossOrigin = 'anonymous'`.

**Testing requirements**:
- Test gallery browsing, filtering, favorites
- Test wallpaper apply (video and static)
- Test daily rotation logic
- Test user upload (image and video)
- Test offline playback from cache
- Test crossfade behavior with two `<video>` elements
- Test performance mode disablement
- Test cinema mode timer and reset
- Manual Firefox testing for Cache API and storage behavior

**Possible improvement ideas**:
- Extract wallpaper logic from `new-tab.js` (~2000 lines)
- Add wallpaper search by keyword
- Add wallpaper preview without applying
- Add wallpaper categories beyond tag filtering
- Add animated GIF support

---

## 9. Settings System

**Feature name**: Comprehensive Settings Panel

**Purpose**: Provide a unified configuration interface for all dashboard features, widgets, search, bookmarks, wallpaper, visual effects, tab management, and privacy controls.

**User workflow**:
1. Click the Settings cog in the dock.
2. Settings panel slides in (lazy-loaded: `settings-ui.js` + `settings.css`).
3. Navigate sections: General, Widgets, Search, Bookmarks, Wallpaper, Visual Effects, Tab Management, About, Feedback, What's New, Pro Tips, Privacy.
4. Toggle features, adjust sliders, pick colors, manage engines.
5. Changes are auto-persisted to `browser.storage.local`.
6. Some changes take effect immediately (live preview); others require page reload.

**Main files**:
- [newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) — 1541 lines: `window.SettingsUI` revealing module. Panel navigation, What's New viewer, Pro Tips section, changelog/privacy fetch, feedback links.

**Supporting files**:
- [newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) — 625 lines: `loadAppSettingsFromStorage()`, `syncAppSettingsForm()`, all preference-to-UI binding
- [newtab/settings/sub-settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/sub-settings-ui.js) — Expandable/collapsible sub-setting containers
- [newtab/settings/search-engine-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/search-engine-settings.js) — Engine manager modal
- [newtab/settings/visual-effects-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/visual-effects-settings.js) — Animation and glass style modals
- [newtab/settings/visual-effects-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/visual-effects-runtime.js) — Runtime application of visual effects
- [newtab/settings/cinema-mode-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/cinema-mode-runtime.js) — Cinema mode logic
- [newtab/settings/material-color-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/material-color-picker.js) — Material Design color palette picker
- [newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) — Import/export
- [newtab/styles/settings.css](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/styles/settings.css) — Settings-specific styles (lazy-loaded)

**Browser APIs**:
- `browser.storage.local` — All 70+ preference keys
- `browser.runtime.getManifest()` — Version display

**Storage**: All `app*` keys listed in [backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) `HOMEBASE_OWNED_STORAGE_KEYS` (75 keys total).

**Dependencies**: `core/dialogs.js`, `core/sortable-bridge.js`, `core/utils.js`

**Performance impact**: **Low** (lazy-loaded). Settings JS and CSS are only loaded on first click. Once loaded, interactions are purely local DOM updates.

**Security impact**: **None**. All settings are stored locally.

**Testing requirements**:
- Test each setting toggle persists and restores correctly
- Test settings panel open/close animation
- Test What's New version tracking
- Test Pro Tips navigation
- Test changelog and privacy policy loading
- Manual Firefox testing for all `browser.storage` interactions

**Possible improvement ideas**:
- Add settings search/filter
- Add settings reset to defaults
- Add per-section export/import
- Add keyboard shortcuts for settings

---

## 10. Themes & Visual Effects

**Feature name**: Glassmorphism Styles, Grid Animations, Background Dimming, and Dynamic Accent Colors

**Purpose**: Allow users to customize the visual appearance of the dashboard with curated glass/frost effects, bookmark grid entry animations, background overlay dimming, and wallpaper-derived accent colors.

**User workflow**:
1. **Glass styles**: Open Settings → Visual Effects → Choose Glass Style. Live preview on hover, 16 curated styles from "Original" to "Liquid Water".
2. **Grid animations**: Open Settings → Visual Effects → Choose Animation. 16 animation presets (Drop In, Pop, Glide, Swirl, etc.) with live preview.
3. **Animation speed**: Slider to adjust animation duration.
4. **Background dim**: Slider (0–90%) to darken the wallpaper for readability.
5. **Dynamic accent**: Automatically extracts the average color from the wallpaper poster and applies it as `--dynamic-accent` CSS variable.
6. **Performance mode**: Master toggle that disables all animations, glass effects, video playback, and accent extraction.
7. **Battery optimization**: Skip animations and video crossfades when on battery power.

**Main files**:
- [newtab/settings/visual-effects-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/visual-effects-runtime.js) — `applyBackgroundDim()`, `applyGlassStyle()`, `applyGridAnimation()`, `applyGridAnimationEnabled()`, `applyGridAnimationSpeed()`
- [newtab/settings/visual-effects-settings.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/visual-effects-settings.js) — Animation modal and glass modal with live hover preview
- [newtab/wallpaper/dynamic-accent.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/dynamic-accent.js) — `extractAverageColor()`, `updateDynamicAccent()`

**Supporting files**:
- [data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) — `GRID_ANIMATIONS` (16 presets), `GLASS_STYLES` (16 presets)
- [new-tab.css](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.css) — Base `.glass-box` class, `@keyframes item-fade-in`, dim overlay

**Browser APIs**:
- `browser.storage.local` — All visual effect preferences
- `navigator.getBattery()` — Battery state check (Chrome/Edge only)

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `appGlassStylePref` | `string` | Selected glass style ID |
| `appGridAnimationPref` | `string` | Selected animation key |
| `appGridAnimationEnabled` | `boolean` | Animation master toggle |
| `appGridAnimationSpeed` | `number` | Animation duration (seconds) |
| `appBackgroundDim` | `number` | Dim overlay percentage (0–90) |
| `appPerformanceMode` | `boolean` | Disable all effects |
| `appBatteryOptimization` | `boolean` | Skip effects on battery |
| `fast-bg-dim` | `localStorage` | Instant dim mirror |
| `fast-performance-mode` | `localStorage` | Instant performance mode mirror |

**Dependencies**: CSS Custom Properties, `canvas` for color extraction, `navigator.getBattery()` (optional)

**Performance impact**: **Medium**. Glass effects use `backdrop-filter` which is GPU-accelerated but expensive on low-end devices. Performance mode completely bypasses all visual effects. Dynamic accent uses `canvas` pixel sampling (sampled every 200th pixel for speed).

**Security impact**: **None**.

**Testing requirements**:
- Test each glass style applies correctly
- Test each grid animation plays correctly
- Test animation speed slider
- Test background dim overlay at various values
- Test performance mode disables all effects
- Test battery optimization guard
- Test dynamic accent color extraction

**Possible improvement ideas**:
- Add custom user-defined glass styles (CSS editor)
- Add dark/light mode toggle (beyond glass styles)
- Support custom accent color override
- Add scheduled theme changes (day/night)

---

## 11. Firefox Integrations

**Feature name**: Firefox Multi-Account Containers & Browser-Specific Adaptations

**Purpose**: Support Firefox-exclusive features (Multi-Account Containers for opening bookmarks in specific container tabs) and adapt dock navigation for Firefox's extension restrictions.

**User workflow**:
1. **Containers**: Enable "Container Mode" in Settings (only visible on Firefox).
2. Right-click a bookmark → "Open in Container" shows available containers.
3. Choose container behavior: "Keep current tab" or "Close current tab".
4. **Dock navigation**: Firefox blocks extensions from opening `chrome://` pages. Homebase shows a shortcut hint dialog instead (e.g., "Use Ctrl+H to open History").
5. **Addon Store link**: Dock auto-detects browser (Firefox/Chrome/Edge) and shows appropriate store link and icon.

**Main files**:
- [newtab/integrations/firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js) — 510 lines: `setupContainerMode()`, container-aware bookmark opening, container picker rendering
- [newtab/integrations/app-launcher.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/app-launcher.js) — `isFirefoxBrowser()`, `showFirefoxShortcutInfo()`, `openInternalBrowserPage()`, `setupAppLauncher()`

**Supporting files**:
- [newtab/core/dock-navigation.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) — `initAddonStoreDockLink()`, dock button handlers

**Browser APIs**:
- `browser.contextualIdentities.query()` — List available containers (Firefox only)
- `browser.tabs.create({ cookieStoreId })` — Open in specific container
- `browser.runtime.getBrowserInfo()` — Detect Firefox vs. Chrome
- `browser.tabs.getCurrent()` — For singleton mode and container identity matching

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `appContainerMode` | `boolean` | Enable container features |
| `appContainerNewTab` | `string` | Container behavior (`keep` or `close`) |

**Dependencies**: `browser.contextualIdentities` permission (Firefox manifest only)

**Performance impact**: **Negligible**. Feature detection is fast. Container queries are lightweight.

**Security impact**: **Low**. Container mode uses `cookieStoreId` which is a Firefox-managed isolation boundary. No new security surface.

**Testing requirements**:
- Manual Firefox testing required for all container features
- Test container list rendering with custom containers
- Test "Open in Container" from context menu
- Test dock navigation fallback (shortcut hint dialog)
- Test addon store link detection (Firefox, Chrome, Edge)
- Test `contextualIdentities` permission absence handling on Chrome

**Possible improvement ideas**:
- Add default container per folder
- Support container color/icon in the bookmark grid
- Add container quick-switch in the search bar

---

## 12. Action Popup (Toolbar Companion)

**Feature name**: One-Click Bookmark Saver

**Purpose**: Provide a toolbar popup that lets users save the current tab as a bookmark into a configured Homebase folder without opening a new tab.

**User workflow**:
1. Click the Homebase extension icon in the browser toolbar.
2. Popup shows the current page title and URL.
3. Recent folders are shown for quick selection.
4. Search for any folder by name.
5. Select a folder and click "Save".
6. Success animation confirms the save.
7. If already bookmarked in that folder, shows "Already saved" indicator.
8. Can create new subfolders inline.

**Main files**:
- [action-popup/action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js) — 978 lines: Self-contained IIFE with its own `createExtensionApi()` shim, folder tree loading, search, save logic, recent folders, duplicate detection.
- [action-popup/action-popup.html](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.html) — Popup DOM
- [action-popup/action-popup.css](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.css) — Popup styles

**Supporting files**: None — fully self-contained.

**Browser APIs**:
- `browser.tabs.query({ active: true, currentWindow: true })` — Get current tab
- `browser.bookmarks.create()` — Create bookmark
- `browser.bookmarks.getChildren()` — Folder tree traversal
- `browser.bookmarks.get()` — Validate root folder
- `browser.storage.local` — Root folder ID, recent folders, last-used folder

**Storage**:

| Key | Type | Purpose |
|:---|:---|:---|
| `homebaseBookmarkRootId` | `string` | Configured root folder (shared with main page) |
| `homebaseRecentSaveFolders` | `Array<string>` | Recent folder IDs (max 6) |
| `homebaseLastUsedFolderId` | `string` | Last selected folder |

**Dependencies**: None. Has its own Chrome/Firefox API shim independent of the main page.

**Performance impact**: **Negligible**. Only loads when user clicks the toolbar icon. Popup lifecycle is short.

**Security impact**: **Low**. Only creates bookmarks and reads tab URL/title. No content script injection.

**Testing requirements**:
- Test save to various folders
- Test duplicate detection
- Test folder search
- Test subfolder creation
- Test recent folders list
- Test with no configured root folder
- Manual Firefox testing for the API shim and storage

**Possible improvement ideas**:
- Add tag support for saved bookmarks
- Add "Paste to Save" from clipboard in popup
- Share bookmark CRUD logic with main page (reduce duplication)
- Add keyboard shortcuts for quick save

---

## 13. Import / Export (Backup & Restore)

**Feature name**: Settings Backup and Restore

**Purpose**: Allow users to export all Homebase settings and preferences to a JSON file and import them on another browser/profile for migration.

**User workflow**:
1. Open Settings → (section varies) → Export.
2. A `homebase-backup-YYYY-MM-DD.json` file downloads.
3. To restore: Open Settings → Import → Select the JSON file.
4. Confirmation dialog → page reloads with restored settings.

**Main files**:
- [newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) — 239 lines: `exportHomebaseState()`, `importHomebaseState()`, `HOMEBASE_OWNED_STORAGE_KEYS` (75 keys), schema validation

**Supporting files**:
- [newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) — UI buttons for export/import

**Browser APIs**:
- `browser.storage.local.get()` / `.set()` / `.remove()` — Read/write all preference keys
- `URL.createObjectURL()` / `URL.revokeObjectURL()` — Generate download link
- `File.text()` — Read import file

**Storage**: All 75 keys defined in `HOMEBASE_OWNED_STORAGE_KEYS` (see backup-import.js lines 4–76).

**Dependencies**: None.

**Performance impact**: **Negligible**. Only runs on explicit user action.

**Security impact**: **Low**. Import validates schema (`homebase.export`), version (1), and structure (`isPlainObject`). Todo items are normalized. However, arbitrary string values from the import file are written to storage without deep sanitization of individual key values.

**Testing requirements**:
- Test export produces valid JSON
- Test import with valid backup file
- Test import rejection with invalid schema
- Test import rejection with wrong version
- Test that `localStorage` mirrors are updated on import
- Test page reload after import

**Possible improvement ideas**:
- Add partial import (select which settings to restore)
- Add backup versioning / migration
- Add encrypted backup option
- Add cloud sync (optional, opt-in)

---

## 14. Hidden & Developer Features

These are features not prominently surfaced in the main UI but present in the codebase:

---

### 14.1 Performance Debug Overlay

**Feature name**: Startup Performance Instrumentation Overlay

**Purpose**: Real-time dashboard showing startup timing, idle task performance, widget hydration metrics, Sortable library status, and health warnings.

**User workflow**: Enable `debugPerfOverlay` in `browser.storage.local` → a performance overlay appears showing script load timings, idle task durations, and cache health.

**Main files**:
- [newtab/core/perf-report.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/perf-report.js) — 1241 lines: `perfState`, `hbPerfMark()`, `hbPerfMeasure()`, `hbPerfReport()`, widget timing recording, sortable timing, health checks
- [newtab/core/startup-perf-runtime.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/startup-perf-runtime.js) — Startup performance event recording

**Storage**: `debugPerfOverlay` (boolean)

**Performance impact**: Adds `performance.mark()` and `performance.measure()` calls throughout the startup path. Overlay rendering is conditional.

---

### 14.2 Tab Lifecycle Management

**Feature name**: Singleton Mode & Auto-Close Tabs

**Purpose**: Prevent duplicate Homebase tabs and automatically clean up stale/excess tabs.

**User workflow**:
1. **Singleton mode**: Enable in Settings. When opening a new tab that would create a duplicate Homebase tab (in the same container), the extension switches to the existing tab and closes the new one.
2. **Max tabs**: Set a maximum number of Homebase tabs. Excess tabs (oldest, inactive) are automatically closed.
3. **Auto-close**: Set an inactivity timeout (minutes). Tabs not accessed within the threshold are closed.

**Main files**:
- [newtab/core/tab-lifecycle.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/tab-lifecycle.js) — 158 lines: `handleSingletonMode()`, `manageHomebaseTabs()`

**Storage**: `appSingletonMode` (boolean), `appMaxTabsCount` (number), `appAutoCloseMinutes` (number)

**Browser APIs**: `browser.tabs.getCurrent()`, `browser.tabs.query()`, `browser.tabs.update()`, `browser.tabs.remove()`

---

### 14.3 Onboarding & Tips System

**Feature name**: First-Run Onboarding & Daily Tips

**Purpose**: Guide new users with an onboarding card and show rotating daily tips for feature discovery.

**User workflow**:
1. **First run**: An onboarding card appears with 5 quick-start items. Users can click "Got it" (dismiss permanently) or "Later" (dismiss for session).
2. **Daily tips**: After onboarding, a rotating daily tip card appears (one per day). Users can navigate tips, dismiss for the day, or disable tips permanently.
3. **Pro Tips**: A deeper tips section in Settings (powered by `tips.js` / `HOMEBASE_TIPS`).

**Main files**:
- [newtab/tips/homebase-tips-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/tips/homebase-tips-ui.js) — 341 lines: `renderTipOfDay()`, `renderHomebaseOnboardingCard()`, `renderHomebaseDailyTipCard()`
- [tips.js](file:///c:/Users/Administrator/Desktop/Homebase/src/tips.js) — `window.HOMEBASE_TIPS` data source for Pro Tips

**Storage**: All `localStorage` (not extension storage): `homebaseOnboardingDismissed`, `homebaseTipsDisabled`, `homebaseTipDismissedDate`, `homebaseTipLastIndex`

---

### 14.4 Google Apps Launcher

**Feature name**: Google Apps Quick-Access Panel

**Purpose**: One-click access to Google services (Gmail, Drive, Maps, Calendar, etc.) from the dock.

**User workflow**: Click the Google Apps grid icon in the dock → a floating panel shows Google service shortcuts.

**Main files**:
- [newtab/integrations/app-launcher.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/app-launcher.js) — `setupAppLauncher()` (lines 119–206)

**Dependencies**: Google service icons from SVG sprite sheet. No API calls.

---

### 14.5 Widget Ordering System

**Feature name**: Sidebar Widget Drag-and-Drop Reordering

**Purpose**: Allow users to reorder sidebar widgets (weather, quote, todo, news) via drag-and-drop in the Settings panel, with the order reflected immediately in the sidebar.

**User workflow**: Open Settings → Widgets section → drag widget rows to reorder → order persists and applies to sidebar.

**Main files**:
- [newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js) — 248 lines: `setWidgetOrderPreference()`, `applyWidgetOrderToSidebar()`, `setupWidgetOrderSortable()`

**Storage**: `widgetOrder` (Array), `fast-widget-order` (localStorage mirror)

---

### 14.6 What's New / Changelog Viewer

**Feature name**: In-App Release Notes

**Purpose**: Show users what changed in the latest version with a badge indicator for unread updates.

**User workflow**: Open Settings → What's New section. Shows version, date, and categorized items (NEW, IMPROVED, FIX). Links to full changelog on GitHub.

**Main files**:
- [data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) — `WHATS_NEW` object (version 0.14.0)
- [newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) — What's New panel rendering, changelog fetch from GitHub

**Storage**: `lastSeenWhatsNewVersion`, `latestKnownWhatsNewVersion` (localStorage)

---

### 14.7 Bookmark Root Folder Selector

**Feature name**: Homebase Root Folder Configuration

**Purpose**: Allow users to choose which bookmark folder is the root of the Homebase grid, scoping the dashboard to a specific subtree.

**User workflow**: Click "Choose Folder" in the dock/settings → folder picker modal → search → select → confirm.

**Main files**:
- [newtab/bookmarks/folder-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/folder-picker.js) — 324 lines
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `setupHomebaseRootControls()`, `setupHomebaseRootListeners()`, `setHomebaseRootId()`, `getHomebaseRootId()`

**Storage**: `homebaseBookmarkRootId` (string)

---

### 14.8 Favicon Resolution Pipeline

**Feature name**: Intelligent Favicon Resolution with Multi-Source Fallback

**Purpose**: Resolve high-quality favicons for bookmarks using multiple strategies with caching.

**User workflow**: Transparent — favicons are resolved automatically when bookmarks render.

**Main files**:
- [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) — `resolveFavicon()`, `ensureFaviconObserver()`, `pruneFaviconMetaIfNeeded()`

**Strategies** (in fallback order):
1. Custom icon from bookmark metadata
2. Cached favicon from `domainIconMap`
3. Google's favicon service (`t2.gstatic.com/faviconV2`)
4. Direct site favicon (`/favicon.ico`)
5. Fallback color tile with first letter

**Storage**: `domainIconMap` (Object), Cache API (`favicons-v1`)

---

## Feature Summary Matrix

| # | Feature | Lines | Files | Network | Storage Keys | Idle-Deferred | Performance Mode |
|:--|:---|---:|---:|:---:|---:|:---:|:---:|
| 1 | Search System | ~2200 | 4 | ✅ Suggestions | 8 | ✅ | — |
| 2 | Bookmark System | ~3500 | 8 | ✅ Favicons | 12 | ❌ Critical | — |
| 3 | Weather Widget | 1080 | 2 | ✅ Open-Meteo | 8 | ✅ | — |
| 4 | News Widget | 774 | 1 | ✅ RSS | 2 | ✅ | — |
| 5 | Todo Widget | 333 | 1 | ❌ | 3 | ✅ | — |
| 6 | Quote Widget | 877 | 2 | ❌ Local JSON | 4 | ✅ | — |
| 7 | Time Widget | 43 | 1 | ❌ | 2 | ❌ Sync | — |
| 8 | Wallpaper System | ~5000 | 5 | ✅ R2 CDN | 14 | ✅ | ✅ Skipped |
| 9 | Settings System | ~2500 | 8 | ❌ | 75 (all) | Lazy-loaded | — |
| 10 | Themes & Effects | ~400 | 3 | ❌ | 8 | ✅ | ✅ Skipped |
| 11 | Firefox Integrations | ~716 | 3 | ❌ | 2 | ❌ Sync | — |
| 12 | Action Popup | 978 | 3 | ❌ | 3 | N/A | — |
| 13 | Import/Export | 239 | 1 | ❌ | 75 (all) | N/A | — |
| 14 | Hidden Features | ~2100 | 6 | ❌ | 8 | Mixed | ✅ Varies |

---

> **This document is a read-only feature analysis. No source code was modified during its creation.**
