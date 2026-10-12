# Cycle #19 Phase 1 — Widget Controller Full Encapsulation Architecture Audit

## 1. Executive Summary

Following Cycle #17 (Widget Storage & Presentation Extraction) and Cycle #18 (Widget Lifecycle & Visibility Synchronization), the widget subsystem operates with dedicated services (`HomebaseWidgetStorage`, `HomebaseWidgetLifecycle`, and card renderers).

However, an audit of the runtime widget controllers (`time.js`, `weather.js`, `news.js`, `quote.js`, `todo.js`, and `widget-visibility.js`) reveals that several modules still suffer from:
1. **Global Lexical Scope Pollution**: Over 100 top-level `const`, `let`, and `function` declarations exposed in the shared global document record across non-IIFE scripts.
2. **Eager DOM Queries at Script Load Time**: Over 60 DOM elements are resolved during script parsing rather than during `initialize()`, leading to fragile initialization order and brittle test mocking.
3. **Redundant Storage Fallback Ladders**: Repeated 25-line fallback ladders (`HomebaseStorage` -> `browser.storage.local` -> `localStorage`) bypassing the canonical `HomebaseWidgetStorage` facade.
4. **Scattered Preference Helpers**: Duplicated preference persistence and DOM class toggling across widget files.
5. **Incomplete Encapsulation**: Controllers act as thin wrappers around loose, module-level state rather than true self-contained modules.

Cycle #19 aims to complete the encapsulation of all widget controllers into clean, zero-leak IIFE modules adhering to the unified controller contract.

---

## 2. Module Inventory & Deep Audit

| File Path | Lines | Bytes | Top-Level Vars | Top-Level Functions | Window Exports | Timers / Intervals | Async Operations | Direct Storage Writes Outside Storage Service | Eager DOM Queries | Lifecycle Hooks Implemented |
|---|---|---|---|---|---|---|---|---|---|---|
| `src/newtab/widgets/time.js` | 105 | 3,109 | 4 | 3 | 4 | 2 intervals | 0 fetches | Yes (`fast-time-format`, `appTimeFormatPreference`) | 2 (`#current-time`, `#current-date`) | `initialize`, `destroy`, `pause`, `resume` |
| `src/newtab/widgets/weather.js` | 1,302 | 41,990 | 26 | 32 | 1 | 2 timeouts | 4 fetches, 3 abort controllers | Yes (`fast-show-weather`, `weatherUnits`, etc.) | 21 eager IDs (`weather-setup`, modal buttons, metrics) | `initialize`, `destroy`, `onShow`, `onHide`, `pause`, `resume` |
| `src/newtab/widgets/news.js` | 965 | 32,892 | 29 | 31 | 2 | 1 timeout | 1 fetch, 1 abort controller | Yes (`fast-news`, `APP_NEWS_SOURCE_KEY`) | 10 eager IDs (`news-list`, modal controls, tooltip portal) | `initialize`, `destroy`, `onShow`, `onHide`, `pause`, `resume` |
| `src/newtab/widgets/quote.js` | 964 | 25,668 | 27 | 20 | 1 | 2 timeouts | 1 fetch | Yes (`fast-quote`, `quoteTags`, `quoteFrequency`) | 11 eager IDs (`quote-settings-modal`, buttons, text, author) | `initialize`, `destroy`, `onShow`, `onHide`, `pause`, `resume` |
| `src/newtab/widgets/todo.js` | 426 | 12,249 | 14 | 18 | 1 | 0 | 0 | Yes (`fast-show-todo`, `TODO_ITEMS_KEY`) | 6 eager IDs (`todo-input`, list, buttons, filters) | `initialize`, `destroy`, `onShow`, `onHide`, `pause`, `resume` |
| `src/newtab/widgets/widget-storage.js` | 537 | 15,451 | 0 (IIFE) | 0 (IIFE) | 1 (`HomebaseWidgetStorage`) | 0 | 0 | Canonical Owner | 0 | N/A (Storage Service) |
| `src/newtab/widgets/widget-visibility.js` | 267 | 8,764 | 4 | 8 | 1 (`revealWidget`) | 0 | 0 | Yes (`fast-show-sidebar`, `fast-widget-order`) | 5 eager queries (Sortable container, widget elements) | N/A (Layout & Visibility Bridge) |
| `src/new-tab.js` | 336 | 12,332 | 11 | 2 | 1 | 0 | 0 | None | 9 eager IDs (Search, dock buttons) | Startup Orchestrator |

---

## 3. Detailed Architectural Issues

### 3.1 Global Lexical Namespace Pollution
Because `time.js`, `weather.js`, `news.js`, `quote.js`, `todo.js`, and `widget-visibility.js` are classic deferred scripts without IIFE scoping:
- Every top-level `const`, `let`, and `function` enters the global declarative environment record.
- Identical top-level names across any of the 73 scripts in `new-tab.html` cause fatal runtime `SyntaxError` crashes.
- Global variables such as `selectedLocation`, `geoRequestId`, `newsHeaderTooltipMap`, `quoteIndexCache`, `todoItems`, and `timeFormatPreference` are mutable and accessible across scripts.

### 3.2 Eager DOM Resolution at Parse Time
- In `weather.js`, variables like `const weatherWidget = document.querySelector('.widget-weather');` and `const weatherLocationInput = document.getElementById('modal-location-input');` execute during initial script evaluation.
- If deferred script execution runs before complete DOM readiness, or in unit test sandboxes where the DOM is built dynamically, these variables become `null` permanently unless re-queried.
- Element lookups should be encapsulated inside controller state or resolved lazily upon `initialize()`.

### 3.3 Redundant Storage Fallback Ladders
- When `HomebaseWidgetStorage` was introduced in Cycle #17, controllers were delegated to it. However, legacy fallback code paths:
  ```javascript
  if (typeof HomebaseWidgetStorage !== 'undefined' && HomebaseWidgetStorage.setX) {
    HomebaseWidgetStorage.setX(...);
  } else {
    // 30 lines of fallback to HomebaseStorage, browser.storage.local, localStorage
  }
  ```
  still remain duplicated inside `weather.js`, `news.js`, `quote.js`, `todo.js`, and `time.js`.
- `HomebaseWidgetStorage` already internally handles `HomebaseStorage`, `browser.storage.local`, and fast `localStorage` mirrors with error suppression and normalization. Controllers should rely solely on `HomebaseWidgetStorage`.

### 3.4 Duplicated Preference Mutators
- `setWeatherPreference`, `setNewsPreference`, `setQuotePreference`, and `setTodoPreference` repeat identical logic:
  1. Toggle class on `document.documentElement` (`<widget>-hidden`).
  2. Write to `localStorage` (`fast-show-<widget>`).
  3. Write to `HomebaseStorage` / `browser.storage.local`.
  4. Call `applyWidgetVisibility()`.
  5. Call `updateWidgetSettingsUI()`.
- This creates 4 copies of identical persistence and DOM toggling logic that should be managed centrally through `HomebaseWidgetStorage` and `widget-visibility.js`.

### 3.5 Inconsistent Controller Interfaces
- While all 5 widgets now implement `{ initialize(), destroy(), onShow(), onHide(), pause(), resume() }`, their export names and instantiation models are inconsistent:
  - `window.HomebaseTimeWidgetController`
  - `window.HomebaseWeatherWidgetController`
  - `window.HomebaseNewsWidgetController`
  - `window.HomebaseQuoteWidgetController`
  - `window.HomebaseTodoWidgetController`
- Some functions (`updateTime`, `applyTimeFormatPreference`, `fetchAndRenderNews`, `setupWeather`, etc.) remain exposed directly on `window` alongside the controller object.
- Standardizing canonical exports to `window.HomebaseWidget<Name>` (with backwards-compatible aliases) will unify the extension's controller architecture.

---

## 4. Subsystem Dependency Map

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Startup Orchestration                           │
│     src/new-tab.js  ──>  src/newtab/core/startup-hydration.js          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ bootstraps
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Lifecycle & Visibility Layer                      │
│  ┌─────────────────────────────────┐ ┌───────────────────────────────┐ │
│  │     HomebaseWidgetLifecycle     │ │     widget-visibility.js      │ │
│  │ (tracks active/visible states)  │ │ (Sortable & DOM force-hidden) │ │
│  └────────────────┬────────────────┘ └───────────────┬───────────────┘ │
└───────────────────┼──────────────────────────────────┼─────────────────┘
                    │ coordinates                      │ toggles DOM
                    ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Encapsulated Widget Controllers                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ │
│  │   time.js    │ │  weather.js  │ │   news.js    │ │ quote / todo   │ │
│  │ (IIFE scoped)│ │ (IIFE scoped)│ │ (IIFE scoped)│ │ (IIFE scoped)  │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └───────┬────────┘ │
└─────────┼────────────────┼────────────────┼─────────────────┼──────────┘
          │ renders DOM    │ renders DOM    │ renders DOM     │
          ▼                ▼                ▼                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Widget Card Renderers                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  HomebaseWeatherCardRenderer / NewsCardRenderer / QuoteCard...   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ persists data
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Widget Storage Facade                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      HomebaseWidgetStorage                       │  │
│  │  - Primary: HomebaseStorage / browser.storage.local               │  │
│  │  - Fast Mirrors: localStorage ('fast-weather-v2', 'fast-news'...) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```
