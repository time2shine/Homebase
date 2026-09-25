# Homebase — Quality Assurance & Testing Strategy

> **Author**: Senior Browser Extension QA Engineer  
> **Date**: 2026-09-25  
> **Scope**: Testing architecture, critical user flows, manual verification protocols, regression safeguards, cross-browser compatibility matrix, and future testing roadmap  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Testing](#2-current-testing)
   - [2.1 Existing Automated Tests](#21-existing-automated-tests)
   - [2.2 Testing Tools & Harness Architecture](#22-testing-tools--harness-architecture)
   - [2.3 Test Coverage Assessment](#23-test-coverage-assessment)
3. [Critical User Flows](#3-critical-user-flows)
   - [Flow 1: Extension Installation & First-Run Cold Boot](#flow-1-extension-installation--first-run-cold-boot)
   - [Flow 2: Daily Dashboard Interaction & Instant Hydration](#flow-2-daily-dashboard-interaction--instant-hydration)
   - [Flow 3: Unified Search, Bangs & Calculator Operations](#flow-3-unified-search-bangs--calculator-operations)
   - [Flow 4: Bookmark Management & Drag-and-Drop Reordering](#flow-4-bookmark-management--drag-and-drop-reordering)
   - [Flow 5: Wallpaper Personalization, Video Playback & Gallery](#flow-5-wallpaper-personalization-video-playback--gallery)
   - [Flow 6: Widget Lifecycle & Configuration (Weather, News, Todo, Quotes)](#flow-6-widget-lifecycle--configuration-weather-news-todo-quotes)
   - [Flow 7: Settings Customization, Cinema Mode & Visual Effects](#flow-7-settings-customization-cinema-mode--visual-effects)
   - [Flow 8: Full Backup Export, Reset & Restoration](#flow-8-full-backup-export-reset--restoration)
   - [Flow 9: Firefox Multi-Account Container Bookmark Launch](#flow-9-firefox-multi-account-container-bookmark-launch)
   - [Flow 10: Action Popup Bookmark Capture & Cross-Tab Sync](#flow-10-action-popup-bookmark-capture--cross-tab-sync)
4. [Manual Testing Checklist](#4-manual-testing-checklist)
   - [4.1 Startup, Visual Integrity & FOUC Prevention](#41-startup-visual-integrity--fouc-prevention)
   - [4.2 Search System & Omnibox Experience](#42-search-system--omnibox-experience)
   - [4.3 Bookmarks, Folders & Navigation Grid](#43-bookmarks-folders--navigation-grid)
   - [4.4 Widgets (Time, Weather, News, Todo, Quotes)](#44-widgets-time-weather-news-todo-quotes)
   - [4.5 Wallpapers, Dual-Video Playback & Uploads](#45-wallpapers-dual-video-playback--uploads)
   - [4.6 Settings, Themes, Cinema Mode & Modals](#46-settings-themes-cinema-mode--modals)
   - [4.7 Action Popup Companion](#47-action-popup-companion)
   - [4.8 Data Backup, Import & Schema Migration](#48-data-backup-import--schema-migration)
5. [Regression Testing](#5-regression-testing)
   - [5.1 High-Risk Areas & Invariants](#51-high-risk-areas--invariants)
   - [5.2 Pre-Release Smoke Pass Sequence](#52-pre-release-smoke-pass-sequence)
   - [5.3 Code Extraction Verification Protocol](#53-code-extraction-verification-protocol)
6. [Browser Testing](#6-browser-testing)
   - [6.1 Google Chrome (Blink)](#61-google-chrome-blink)
   - [6.2 Mozilla Firefox (Gecko)](#62-mozilla-firefox-gecko)
   - [6.3 Microsoft Edge (Chromium)](#63-microsoft-edge-chromium)
   - [6.4 Cross-Browser Parity Matrix](#64-cross-browser-parity-matrix)
7. [Future Testing Improvements](#7-future-testing-improvements)
   - [Phase 1: Automated Unit Testing via `node:test`](#phase-1-automated-unit-testing-via-nodetest)
   - [Phase 2: Playwright Headless Cross-Browser End-to-End Suite](#phase-2-playwright-headless-cross-browser-end-to-end-suite)
   - [Phase 3: Visual Regression Testing (FOUC & Layout Diffs)](#phase-3-visual-regression-testing-fouc--layout-diffs)
   - [Phase 4: Extension API Mock Harness Expansion](#phase-4-extension-api-mock-harness-expansion)
   - [Phase 5: Continuous Integration (CI/CD) Pipeline](#phase-5-continuous-integration-cicd-pipeline)

---

## 1. Executive Summary

Homebase is a high-performance new-tab replacement dashboard extension supporting both Google Chrome and Mozilla Firefox under Manifest V3. Operating as a purely client-side extension without a persistent background service worker, Homebase orchestrates 38 JavaScript files, 155 KB of CSS, and an extensive local storage hierarchy to deliver sub-50ms perceived startup times with live widgets, wallpaper videos, and interactive bookmark management.

Because the repository operates under strict dependency-free constraints (zero npm runtime/dev dependencies, classic `<script defer>` architecture, no bundler), quality assurance requires a hybrid strategy:
1. **Automated Static Verification**: Syntactic validation, load-order checks, duplicate declaration detection, and file integrity validation.
2. **Automated Headless CDP Smoke Testing**: Dynamic Chrome/Edge runtime validation verifying DOM surface mounting, startup performance markers, and exception freedom.
3. **Rigorous Manual Cross-Browser Testing**: Protocol-driven functional verification across Chrome, Firefox, and Edge covering browser-specific APIs (e.g., Firefox Containers, Cache API, and hardware compositing).

This document establishes the official QA strategy, critical user flow architectures, manual verification checklists, regression safeguards, and multi-browser test procedures for the Homebase repository.

---

## 2. Current Testing

### 2.1 Existing Automated Tests

The Homebase repository currently includes three automated testing and verification mechanisms:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AUTOMATED TEST PYRAMID                            │
│                                                                        │
│                  ┌──────────────────────────────┐                      │
│                  │  Browser Smoke Test (CDP)    │  smoke-newtab-file   │
│                  │  DOM mounting, console errs  │                      │
│                  └──────────────┬───────────────┘                      │
│                                 │                                      │
│                  ┌──────────────┴───────────────┐                      │
│                  │  Static Structural Checker   │  check-newtab-static │
│                  │  Declarations, paths, order  │                      │
│                  └──────────────┬───────────────┘                      │
│                                 │                                      │
│                  ┌──────────────┴───────────────┐                      │
│                  │  V8 Syntax Validation       │  node --check        │
│                  │  AST parsing, strict syntax  │                      │
│                  └──────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘
```

#### 1. V8 Syntax Validation (`node --check`)
- **Command**: `node --check <changed-file.js>`
- **Scope**: Validates that modified JavaScript files parse cleanly into the V8 Abstract Syntax Tree (AST) without syntax errors, unclosed tokens, or invalid escape sequences.
- **Limitation**: Does not execute code or verify runtime semantics, variable resolution, or API compatibility.

#### 2. Static Structural Checker ([scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs))
- **Command**: `node scripts/check-newtab-static.mjs`
- **Scope**: A custom 431-line Node.js script enforcing 11 architectural invariants:
  1. Verifies that all 37 deferred local scripts in `src/new-tab.html` physically exist on disk.
  2. Asserts that `preload.js` appears exactly once in `<head>`.
  3. Asserts that `preload.js` remains strictly synchronous (no `defer`, `async`, or `type="module"`).
  4. Asserts that `preload.js` physically exists at `src/preload.js`.
  5. Asserts that `new-tab.js` is the final deferred script in `new-tab.html`.
  6. Verifies that 33 extracted module paths in `src/newtab/` exist.
  7. Ensures no legacy flat `src/newtab/*.js` path references exist.
  8. Ensures no root-level `src/newtab/*.js` files linger.
  9. Validates that lazy-loaded paths (`settings-ui.js`, `gallery-ui.js`) have no stale references.
  10. Performs AST/regex scanning on 87 critical global declarations to assert that moved functions and constants exist exactly once and are not duplicated across files.
  11. Confirms correct script load order between provider modules and consumer scripts.

#### 3. Browser Smoke Test Harness ([scripts/smoke-newtab-file.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/smoke-newtab-file.mjs))
- **Command**: `node scripts/smoke-newtab-file.mjs`
- **Scope**: A 946-line zero-dependency integration test harness that:
  - Discovers local Google Chrome or Microsoft Edge binaries.
  - Launches an isolated headless browser instance via `--remote-debugging-port` with a clean temporary profile (`--user-data-dir`).
  - Starts an ephemeral Node.js HTTP server delivering `src/new-tab.html`.
  - Injects a lightweight mock extension API shim simulating `chrome.storage.local`, `chrome.storage.onChanged`, `chrome.bookmarks`, `chrome.tabs`, and `chrome.runtime`.
  - Injects realistic mock bookmark hierarchies and pre-seeded `localStorage` fast-keys.
  - Monitors the Chrome DevTools Protocol (CDP) WebSocket for unhandled exceptions (`Runtime.exceptionThrown`) and severe console errors (`consoleAPICalled` matching `ReferenceError`, `TypeError`, `SyntaxError`, `RangeError`).
  - Asserts that critical DOM surfaces successfully mount (`searchInput`, `sidebar`, `weatherWidget`, `quoteWidget`, `todoWidget`, `newsWidget`, `bookmarksGrid`, `dock`).
  - Verifies that `preload.js` fast widget ordering successfully applies.
  - Times out deterministically at 12,000ms.

---

### 2.2 Testing Tools & Harness Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     HOMEBASE TEST INFRASTRUCTURE                        │
│                                                                         │
│  Developer CLI (pwsh)                                                   │
│    │                                                                    │
│    ├──> node --check src/**/*.js                                        │
│    │      (Fast AST syntax check)                                       │
│    │                                                                    │
│    ├──> node scripts/check-newtab-static.mjs                            │
│    │      (Static AST/regex scanner: order, duplicates, paths)          │
│    │                                                                    │
│    └──> node scripts/smoke-newtab-file.mjs                              │
│           │                                                             │
│           ├──> Node HTTP Server (ephemeral port)                        │
│           │      Serves src/new-tab.html + mock harness                 │
│           │                                                             │
│           └──> Spawns Headless Chrome/Edge                              │
│                  │                                                      │
│                  ├──> CDP Client (WebSocket)                            │
│                  │      Page.navigate                                   │
│                  │      Runtime.enable                                  │
│                  │      Console / Exception traps                       │
│                  │                                                      │
│                  └──> Mock Harness Injection                            │
│                         chrome.storage.local (in-memory)                │
│                         chrome.bookmarks (mock tree)                    │
│                         chrome.tabs / chrome.runtime                    │
└─────────────────────────────────────────────────────────────────────────┘
```

The test infrastructure is deliberately engineered to require **zero external dependencies**:
- Network communication utilizes native Node.js `node:http` and `node:net`.
- CDP communication uses the native Node.js `WebSocket` API.
- Process orchestration uses `node:child_process` (`spawn`).
- Filesystem operations use `node:fs` promises.

---

### 2.3 Test Coverage Assessment

| Quality Dimension | Current Coverage Level | Current Verification Mechanism | Gaps / Vulnerabilities |
|:---|:---:|:---|:---|
| **Syntax & Token Validity** | **100%** | `node --check` | Syntax only; cannot catch type mismatches or runtime errors |
| **Structural Integrity** | **95%** | `check-newtab-static.mjs` | High confidence in script order and duplicate globals; does not evaluate function internal logic |
| **DOM Mounting & Boot** | **85%** (Chrome/Edge) | `smoke-newtab-file.mjs` | Verifies container mounting; does not test deep user interactions |
| **Unit Test Coverage** | **0%** | None | No unit test suite for math evaluation, unit conversion, date formatting, or URL detection |
| **Integration Test Coverage** | **20%** | CDP Smoke Harness | Synthetic mocks; does not test real browser storage or real bookmark engines |
| **End-to-End User Flows** | **Manual** | Manual QA Checklists | Fully reliant on human testing; high regression risk on refactoring |
| **Firefox Compatibility** | **Manual** | Manual QA Checklists | CDP harness does not run against Firefox; Gecko behavior is unverified by automation |

---

## 3. Critical User Flows

The following flowcharts define the ten primary end-to-end user journeys that must remain fully functional across all releases.

---

### Flow 1: Extension Installation & First-Run Cold Boot

```
Install extension from Chrome Web Store / Firefox Add-on Store
↓
Open first new tab
↓
preload.js executes in <head> (empty localStorage fallback)
↓
instant_load.js hydrates default digital clock from system time
↓
37 deferred scripts load & new-tab.js executes
↓
initializePage() initiates critical storage reads
↓
Default Homebase bookmark root folder created / resolved
↓
Bookmarks rendered into grid (#bookmarks-grid)
↓
document.body.classList.add('ready') via rAF
↓
Idle scheduler hydrates widgets (weather, quote, news, todo)
↓
Default fallback wallpaper (fallback.mp4 / fallback.webp) displayed
```

---

### Flow 2: Daily Dashboard Interaction & Instant Hydration

```
Open new tab
↓
preload.js reads synchronous fast-* keys from localStorage
↓
Instant CSS classes applied (sidebar visibility, theme, --initial-wallpaper)
↓
instant_load.js immediately paints clock, cached weather, cached quote
↓
Zero FOUC (Flash of Unstyled Content) achieved (< 50ms)
↓
Deferred scripts load; new-tab.js connects to authoritative storage
↓
User clicks bookmark tile → Navigation occurs in current or new tab
```

---

### Flow 3: Unified Search, Bangs & Calculator Operations

```
Focus search bar (auto-focused on tab open or clicked)
↓
User types query:
  ├─> If math expression (e.g., "45 * 12"): Inline calculator card displays result
  ├─> If unit conversion (e.g., "100 km to mi"): Inline conversion result card displays
  ├─> If URL string (e.g., "github.com"): Direct navigation indicator activates
  ├─> If bang shortcut (e.g., "!yt lo-fi"): Engine switches to YouTube dynamically
  └─> If normal text: Local bookmarks matched + live autocomplete suggestions fetched
↓
User navigates suggestions using Arrow Up / Down keys
↓
Press Enter → Search executed via selected engine in current/new tab per preferences
```

---

### Flow 4: Bookmark Management & Drag-and-Drop Reordering

```
User views bookmark grid
↓
Click folder tab → Active folder switches; grid virtualizes if > 150 items
↓
Hover bookmark tile → Visual highlight active
↓
Drag bookmark tile to new position → SortableJS initiates drag ghost
↓
Drop tile → FLIP animation plays (animateGridReorder)
↓
browser.bookmarks.move() called → Bookmark order persisted in browser
↓
Right-click bookmark → Custom context menu opens (Edit, Delete, Move, Container)
↓
Select "Edit" → Lazy-loads bookmark-editor.js modal
↓
Modify title/URL/icon/color → Save → Instant UI update & storage persistence
```

---

### Flow 5: Wallpaper Personalization, Video Playback & Gallery

```
Click Gallery button in dock
↓
Lazy-load gallery-ui.js + gallery.css via loadScriptOnce()
↓
Gallery modal opens with virtualized wallpaper grid
↓
Browse curated R2 CDN wallpapers / Filter by categories (Anime, Nature, Cyberpunk)
↓
Click wallpaper card → Live preview runs in dialog
↓
Click "Apply Wallpaper"
↓
Video/image asset downloaded and cached into Cache API (wallpaper-assets)
↓
Poster image data URL written to fast-mirror in localStorage
↓
Dual-video crossfade executes (requestVideoFrameCallback / timeupdate)
↓
Dynamic accent color extracted via canvas and applied to --dynamic-accent CSS variable
↓
Modal closed → New wallpaper persists across subsequent tabs
```

---

### Flow 6: Widget Lifecycle & Configuration (Weather, News, Todo, Quotes)

```
Sidebar displays enabled widgets
↓
Weather Widget:
  Click settings → Enter city name → Geocoding API resolves → Save coordinates
  ↓
  Open-Meteo API fetches forecast → Data cached in storage.local & fast-weather mirror
↓
News Widget:
  Click settings → Select from 11 RSS sources (e.g., BBC, TechCrunch)
  ↓
  XML fetched → Parsed locally → Headlines displayed with source attribution
↓
Todo Widget:
  Type task in input → Press Enter → Task appended to list & storage.local
  ↓
  Click checkbox → Task marked complete → Filter Active/All/Done toggled
↓
Quote Widget:
  Click "Next" → Cycles local quotes from quotes.json → Click "Copy" copies to clipboard
```

---

### Flow 7: Settings Customization, Cinema Mode & Visual Effects

```
Click Settings cog in dock
↓
Lazy-load settings-ui.js + settings.css via loadScriptOnce()
↓
Settings modal opens
↓
Toggle "Performance Mode":
  document.body.classList.toggle('performance-mode')
  Backdrop-filters removed, animations disabled, video playback stopped
↓
Toggle "Cinema Mode":
  cinema-mode-runtime.js attaches 8-second idle listeners
  8 seconds of inactivity → UI elements fade out, leaving clean wallpaper
  Mouse movement / keypress → UI instantly restored
↓
Modify Bookmark Visual Styles (text background, opacity, blur, fallback colors)
↓
Changes written to browser.storage.local → storage.onChanged updates active DOM
```

---

### Flow 8: Full Backup Export, Reset & Restoration

```
Open Settings → Navigate to "Backup & Restore"
↓
Click "Export Backup":
  All preferences, custom metadata, and folder IDs assembled into JSON
  Blob created → Downloaded as homebase-backup-YYYY-MM-DD.json
↓
Reset extension settings to defaults
↓
Click "Import Backup" → Select JSON file
↓
backup-import.js validates JSON schema and key whitelist
↓
Data restored to browser.storage.local & localStorage fast-mirrors
↓
Page reloads / reconciles → Full dashboard configuration restored
```

---

### Flow 9: Firefox Multi-Account Container Bookmark Launch

```
User opens Homebase in Mozilla Firefox
↓
Firefox Containers integration detects contextualIdentities permission
↓
Right-click bookmark in grid → Context menu displays "Open in Container" submenu
↓
Submenu lists user's Firefox Containers (Personal, Work, Banking, Shopping)
↓
User selects "Work" container
↓
browser.tabs.create({ url: bookmark.url, cookieStoreId: workContainerId })
↓
Tab opens isolated in the Work container with correct color strip and cookies
```

---

### Flow 10: Action Popup Bookmark Capture & Cross-Tab Sync

```
User browses external website (e.g., wikipedia.org)
↓
Click Homebase toolbar icon → action-popup.html opens
↓
action-popup.js loads recent folders and full bookmark tree
↓
Title and URL auto-populated from active browser tab
↓
User searches / selects destination folder → Clicks "Save Bookmark"
↓
browser.bookmarks.create() saves bookmark to chosen folder
↓
Any open Homebase dashboard tabs receive browser.bookmarks.onCreated event
↓
Grid in dashboard automatically updates without requiring a manual page refresh
```

---

## 4. Manual Testing Checklist

The following checklists provide comprehensive, step-by-step verification protocols for QA engineers performing manual releases or feature verifications.

---

### 4.1 Startup, Visual Integrity & FOUC Prevention

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **START-01** | First-Run Cold Boot | 1. Install fresh extension build in clean profile.<br>2. Open new tab. | Tab opens instantly; fallback poster appears; clock renders; no white flash; default widgets mount without errors. | [ ] |
| **START-02** | Zero FOUC Verification | 1. Enable dark theme and custom wallpaper.<br>2. Hide sidebar in settings.<br>3. Open 10 new tabs rapidly. | Every tab opens with sidebar hidden immediately; no flash of sidebar opening or light theme flash. | [ ] |
| **START-03** | Startup Performance Metrics | 1. Open DevTools Console.<br>2. Run `window.__HB_STARTUP_PERF` or view performance marks. | `preload:start`, `preload:localStorage-read-complete`, `init:start`, `ready` marks fire in sequence with no exceptions. | [ ] |
| **START-04** | Offline Startup | 1. Disconnect network.<br>2. Open new tab. | Clock, cached weather, cached news, and local bookmarks render immediately with offline indicators. | [ ] |

---

### 4.2 Search System & Omnibox Experience

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **SRCH-01** | Default Engine Search | 1. Type query in search bar.<br>2. Press Enter. | Opens search results in selected engine (Google/DuckDuckGo) in current or new tab per settings. | [ ] |
| **SRCH-02** | Bang Shortcut Dispatch | 1. Type `!g cats`, `!yt lofi`, `!w quantum`, `!ddg privacy`.<br>2. Press Enter for each. | Each query redirects to the exact targeted engine (Google, YouTube, Wikipedia, DuckDuckGo) ignoring current engine. | [ ] |
| **SRCH-03** | Inline Calculator | 1. Type `25 * 40 + 15`.<br>2. Verify calculation.<br>3. Click "Copy" button. | Card shows `1015`; clicking copy copies `1015` to clipboard; clipboard paste outputs `1015`. | [ ] |
| **SRCH-04** | Unit Conversions | 1. Type `32 c to f`, `100 km to mi`, `50 kg to lbs`. | Instant conversion result cards display accurately below search input. | [ ] |
| **SRCH-05** | URL & Domain Detection | 1. Type `localhost:8080`, `192.168.1.1`, `https://example.com`, `reddit.com`. | Direct navigation card appears; pressing Enter navigates directly to the URL instead of searching. | [ ] |
| **SRCH-06** | Autocomplete Suggestions | 1. Type `git`.<br>2. Wait 150ms.<br>3. Arrow Down through suggestions. | Live suggestions populate from active engine API; Arrow Down highlights item; Enter navigates to highlighted term. | [ ] |
| **SRCH-07** | Search Engine Selector | 1. Click engine icon in search bar.<br>2. Select Bing or DuckDuckGo.<br>3. Scroll mouse wheel over engine icon. | Dropdown expands; selection changes engine; mouse wheel cycles through enabled engines cleanly. | [ ] |
| **SRCH-08** | Search Engine Manager | 1. Open Settings -> Search Engines.<br>2. Disable Yahoo; reorder DuckDuckGo to top.<br>3. Save. | Disabled engine disappears from selector; DuckDuckGo becomes default; persistent across tab reloads. | [ ] |

---

### 4.3 Bookmarks, Folders & Navigation Grid

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **BOOK-01** | Bookmark Grid Display | 1. Open new tab with existing browser bookmarks. | Homebase root folder bookmarks display in responsive grid; titles and favicons render cleanly. | [ ] |
| **BOOK-02** | Folder Tab Navigation | 1. Click various folder tabs along the top.<br>2. Click Back button inside subfolder. | Grid switches folders instantly; active tab highlights; Back button returns to parent folder. | [ ] |
| **BOOK-03** | Folder Tab Scrolling | 1. Create 20 bookmark folders.<br>2. View folder tabs bar. | Tabs bar enables smooth horizontal scrolling; left/right scroll controls function; active tab scrolls into view. | [ ] |
| **BOOK-04** | Drag-and-Drop Reorder | 1. Drag bookmark tile to a new position in the grid.<br>2. Release drag. | FLIP animation smoothly rearranges items; new position persists after page reload and in browser bookmarks. | [ ] |
| **BOOK-05** | Bookmark Editor Modal | 1. Right-click bookmark -> select "Edit".<br>2. Change title, URL, select custom icon, pick color.<br>3. Save. | `bookmark-editor.js` lazy-loads; editor opens; changes apply immediately to grid tile and persist across reloads. | [ ] |
| **BOOK-06** | Bookmark Delete & Undo | 1. Right-click bookmark -> select "Delete".<br>2. Confirm deletion dialog. | Bookmark removed from grid and browser bookmarks; custom metadata cleaned up. | [ ] |
| **BOOK-07** | Large Folder Virtualization | 1. Create a folder with 250 bookmarks.<br>2. Navigate to folder.<br>3. Scroll rapidly top to bottom. | Virtualizer activates (VIRTUAL MODE); DOM nodes recycled; scrolling remains smooth 60fps; no memory spike. | [ ] |
| **BOOK-08** | Favicon Fallback Letters | 1. Add bookmark for non-existent domain (`http://invalid-fake-domain-12345.xyz`). | Favicon resolver fails gracefully; letter tile (first letter of title) renders with fallback background color. | [ ] |
| **BOOK-09** | Folder Picker Modal | 1. Click "+" quick action -> select "Set Root Folder".<br>2. Search for folder; select and confirm. | Folder picker displays full tree; selected folder becomes the dashboard's new root folder. | [ ] |

---

### 4.4 Widgets (Time, Weather, News, Todo, Quotes)

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **WIDG-01** | Clock 12h / 24h Toggle | 1. In Settings, toggle time format between 12-hour and 24-hour. | Clock updates immediately (e.g. `2:30 PM` <-> `14:30`); format persists across cold reloads. | [ ] |
| **WIDG-02** | Weather Geocoding Search | 1. Click weather settings cog.<br>2. Search "Tokyo".<br>3. Select Tokyo, Japan -> Save. | Geocoding API returns results; selected coordinates persist; Open-Meteo fetches Tokyo weather and renders icon/temp. | [ ] |
| **WIDG-03** | Weather Geolocation | 1. Click weather settings -> click "Use my location".<br>2. Allow browser location prompt. | Browser coordinates resolved; local city name and temperature display correctly. | [ ] |
| **WIDG-04** | Weather Units Toggle | 1. Toggle between Celsius (°C) and Fahrenheit (°F). | Temperature display converts accurately; preference persists across tab opens. | [ ] |
| **WIDG-05** | News Source Selection | 1. Click news widget settings cog.<br>2. Select "Al Jazeera" or "TechCrunch".<br>3. Save. | RSS feed fetches and parses XML; top 5 headlines render with publication times; links open in new tab. | [ ] |
| **WIDG-06** | Todo CRUD Operations | 1. Add task "Review PR".<br>2. Add task "Deploy staging".<br>3. Check "Review PR".<br>4. Delete "Deploy staging". | Tasks add to list; checkbox marks item complete; delete removes item; state persists in storage.local across tabs. | [ ] |
| **WIDG-07** | Todo Filter Toggles | 1. Click "Active" filter.<br>2. Click "All" filter.<br>3. Click "Clear completed". | Completed items hidden on "Active"; all items shown on "All"; completed items purged on clear. | [ ] |
| **WIDG-08** | Quote Rotation & Copy | 1. Click "Next" button on quote widget.<br>2. Click "Copy" button.<br>3. Paste into text editor. | Next quote from catalog displays with author; copy button confirms; pasted text matches quote and author. | [ ] |
| **WIDG-09** | Widget Visibility Toggles | 1. In Settings, disable News and Quotes.<br>2. Reload page. | News and Quotes widgets are completely hidden; sidebar resizes cleanly; no errors in console. | [ ] |

---

### 4.5 Wallpapers, Dual-Video Playback & Uploads

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **WALL-01** | Curated Video Wallpaper | 1. Open Gallery -> select curated video (e.g. Cyberpunk Rain).<br>2. Click "Apply". | Video buffers and starts playing muted, looped; dual-video crossfade loops seamlessly; poster cached in Cache API. | [ ] |
| **WALL-02** | Static Wallpaper Selection | 1. In Gallery, toggle type to "Static".<br>2. Select high-res image wallpaper -> Apply. | Video elements hidden; high-res static image displays as background; dynamic accent color updates. | [ ] |
| **WALL-03** | Custom User Upload (Image) | 1. In Gallery -> "My Wallpapers" -> Click "Upload".<br>2. Upload 4K PNG/JPG image. | Image cached in Cache API; thumbnail appears in My Wallpapers; applies cleanly as dashboard background. | [ ] |
| **WALL-04** | Custom User Upload (Video) | 1. In Gallery -> "My Wallpapers" -> Upload MP4/WebM video (< 50 MB). | Video cached in Cache API; poster auto-generated; video loops seamlessly on dashboard. | [ ] |
| **WALL-05** | Daily Wallpaper Rotation | 1. In Settings, enable "Daily Wallpaper Rotation".<br>2. Change system date forward 1 day.<br>3. Open new tab. | System detects date change (`isDailyRotationDue`); picks random wallpaper from rotation pool; applies cleanly. | [ ] |
| **WALL-06** | Video Tab Visibility Pause | 1. Open Homebase tab with video playing.<br>2. Switch to another tab.<br>3. Check background video state via DevTools. | `visibilitychange` listener pauses background video when tab is hidden; resumes playback when tab is focused. | [ ] |

---

### 4.6 Settings, Themes, Cinema Mode & Modals

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **SETT-01** | Lazy Settings Loading | 1. Open new tab with DevTools Network tab open.<br>2. Click Settings cog in dock. | `settings-ui.js` and `settings.css` are fetched only after click; modal opens with smooth animation. | [ ] |
| **SETT-02** | Performance Mode Toggle | 1. Enable "Performance Mode" in settings.<br>2. Inspect body classes and CSS. | `document.body` gains `.performance-mode`; all `backdrop-filter` rules disabled; videos hidden; animations disabled. | [ ] |
| **SETT-03** | Cinema Mode 8s Idle | 1. Enable Cinema Mode.<br>2. Leave mouse and keyboard untouched for 8 seconds. | All UI surfaces (search, bookmarks, dock, sidebar) smoothly fade out, leaving unobstructed wallpaper; mouse move restores UI. | [ ] |
| **SETT-04** | Bookmark Text Backgrounds | 1. In Settings, enable Bookmark Text Background.<br>2. Adjust color, opacity slider (50%), blur (8px). | Bookmark label spans gain background pill with chosen color, opacity, and blur in real-time. | [ ] |
| **SETT-05** | Background Dim Slider | 1. Adjust Background Dim slider from 0% to 50% to 80%. | `--bg-dim-opacity` CSS variable adjusts immediately; wallpaper dims smoothly; value persists across tabs. | [ ] |
| **SETT-06** | Material Color Picker | 1. Open color picker from bookmark editor or folder settings. | Material color grid displays curated palettes; custom hex input validates; selecting color updates target element. | [ ] |

---

### 4.7 Action Popup Companion

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **POPU-01** | Popup Initialization | 1. On external web page, click Homebase toolbar icon. | `action-popup.html` opens instantly; active tab title and URL auto-populated; bookmark folder tree loads. | [ ] |
| **POPU-02** | Folder Search & Selection | 1. In popup, type folder name in folder search input. | Folder tree filters in real-time; selecting a folder highlights it as destination. | [ ] |
| **POPU-03** | Bookmark Save Execution | 1. Click "Save Bookmark" in popup. | Bookmark is created via `browser.bookmarks.create()`; confirmation checkmark appears; popup closes. | [ ] |
| **POPU-04** | Cross-Tab Synchronization | 1. Open Homebase dashboard tab.<br>2. Open another tab and save a bookmark via Action Popup.<br>3. Switch back to Homebase dashboard tab. | `storage.onChanged` / bookmark listener automatically adds new bookmark to dashboard grid without page reload. | [ ] |

---

### 4.8 Data Backup, Import & Schema Migration

| Test ID | Test Scenario | Steps | Expected Outcome | Pass/Fail |
|:---|:---|:---|:---|:---:|
| **DATA-01** | Backup File Export | 1. In Settings -> Backup -> Click "Export Backup". | File `homebase-backup-YYYY-MM-DD.json` downloads; JSON is valid, formatted, and contains all user preferences. | [ ] |
| **DATA-02** | Clean Restore Verification | 1. Reset extension settings.<br>2. Import downloaded backup JSON file. | Data restored; settings, bookmarks metadata, weather location, and preferences restored 100% accurately. | [ ] |
| **DATA-03** | Malformed JSON Rejection | 1. Attempt to import invalid or corrupted JSON file. | Import validator catches syntax error; displays custom error modal; preserves existing storage intact. | [ ] |
| **DATA-04** | Schema Whitelist Enforcement | 1. Inject unexpected keys (e.g. `__malicious_key: true`) into backup JSON.<br>2. Import file. | Key whitelist in `backup-import.js` discards non-whitelisted keys; only approved preference keys are written. | [ ] |

---

## 5. Regression Testing

### 5.1 High-Risk Areas & Invariants

As mandated by [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following nine code areas are designated as **High-Risk**. Any modifications to these areas must undergo full regression verification before release:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      HIGH-RISK REGRESSION AREAS                        │
│                                                                        │
│  1. initializePage & Startup Orchestration                             │
│     Invariant: Must not await non-critical hydration (weather/news)    │
│     Invariant: ready class flip must fire via rAF after bookmarks load │
│                                                                        │
│  2. Idle Scheduler (scheduleIdleTask)                                  │
│     Invariant: 12ms slice budget strictly enforced                     │
│     Invariant: Startup tasks must have "startup:" prefix               │
│                                                                        │
│  3. Bookmark Grid & Virtualization                                     │
│     Invariant: Folders > 150 items must virtualize DOM                 │
│     Invariant: DocumentFragment must be used for standard batching     │
│                                                                        │
│  4. SortableJS Drag-and-Drop Bridge                                    │
│     Invariant: Dragging must persist browser.bookmarks.move() cleanly  │
│     Invariant: Sortable timeout must debounce to prevent race states   │
│                                                                        │
│  5. Wallpaper Video & Cache Pipeline                                   │
│     Invariant: Fast-path poster must render from localStorage data URL │
│     Invariant: Video decoding must be non-blocking                     │
│                                                                        │
│  6. Live Search & Bang Parsing                                         │
│     Invariant: Debounced at 120ms; AbortController cancels stale reqs  │
│     Invariant: Math parser must use safe AST (no eval() / Function())  │
│                                                                        │
│  7. Favicon Resolution & Cache API (favicons-v1)                       │
│     Invariant: Object URLs must be revoked to prevent memory leaks    │
│     Invariant: Negative cache must prevent infinite 404 retries        │
│                                                                        │
│  8. Firefox Containers Integration (contextualIdentities)              │
│     Invariant: Container-aware bookmarks must open in target container │
│     Invariant: Must gracefully no-op on Chrome/Edge                    │
│                                                                        │
│  9. Cross-Tab Reactivity (storage.onChanged)                           │
│     Invariant: Changes from Settings or Popup must sync to open tabs   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 5.2 Pre-Release Smoke Pass Sequence

Before signing off on any production release ZIP or GitHub release, the QA engineer must execute the following sequential verification pass:

```powershell
# Step 1: Validate syntax of all JavaScript source files
node --check src/preload.js
node --check src/instant_load.js
node --check src/new-tab.js
node --check src/newtab/**/*.js
node --check src/action-popup/*.js

# Step 2: Run static structural integrity verification
node scripts/check-newtab-static.mjs

# Step 3: Run automated headless browser smoke harness (if Chrome/Edge available)
node scripts/smoke-newtab-file.mjs

# Step 4: Build distribution packages
npm.cmd run build:chrome
npm.cmd run build:firefox

# Step 5: Verify build outputs exist and manifests validate
# dist/chrome/manifest.json must have manifest_version: 3
# dist/firefox/manifest.json must have browser_specific_settings.gecko
```

---

### 5.3 Code Extraction Verification Protocol

When refactoring or extracting code from the monolithic `src/new-tab.js` into modular files under `src/newtab/`:
1. **Uniqueness**: Verify that every extracted function and constant exists **exactly once** across the entire repository.
2. **Order**: Ensure the extracted module `<script defer>` tag is placed **before** `src/new-tab.js` in `src/new-tab.html`.
3. **No Duplicate Declarations**: Run `node scripts/check-newtab-static.mjs` to confirm that none of the 87 protected globals are declared more than once.
4. **Console Cleanliness**: Launch the extension and inspect the DevTools console to ensure **zero `ReferenceError`s** occur during startup.
5. **No ES Module Conversion**: Verify that files remain classic deferred scripts without `import` / `export` statements.

---

## 6. Browser Testing

Homebase must maintain complete feature and visual parity across Google Chrome, Mozilla Firefox, and Microsoft Edge.

---

### 6.1 Google Chrome (Blink)

- **Target Engine**: Blink / V8 (Chrome 110+)
- **Manifest**: `manifests/manifest.chrome.json` -> `dist/chrome/manifest.json`
- **Key Verification Areas**:
  1. **Manifest V3 Service-Free Architecture**: Verify that `new-tab.html` overrides the new tab page cleanly via `chrome_url_overrides.newtab`.
  2. **Storage Performance**: Verify `chrome.storage.local` persistence with large bookmark sets and frequent preference updates.
  3. **Hardware Compositing**: Verify smooth 60fps video playback with `backdrop-filter: blur(...)` under GPU acceleration.
  4. **Favicon Resolution**: Verify that `t2.gstatic.com` favicon candidates resolve without mixed-content or CSP warnings.
  5. **Automated Testing**: Headless testing supported via `scripts/smoke-newtab-file.mjs` using Chrome DevTools Protocol.

---

### 6.2 Mozilla Firefox (Gecko)

- **Target Engine**: Gecko / SpiderMonkey (Firefox 115+ ESR and latest Stable)
- **Manifest**: `manifests/manifest.firefox.json` -> `dist/firefox/manifest.json`
- **Key Verification Areas**:
  1. **Gecko Manifest Requirements**: Must include `browser_specific_settings.gecko.id` (`{5b8869ad-9723-4e7e-8a03-7cb7d29bd747}`) and `strict_min_version: "115.0"`.
  2. **Browser API Compatibility**: Verify that `browser.*` Promise-based APIs operate seamlessly alongside the `chrome.*` compatibility shim.
  3. **Firefox Multi-Account Containers**: Verify `contextualIdentities` API permissions and ensure bookmarks can be launched in designated containers.
  4. **WebRender Backdrop-Filter**: Verify that overlapping `backdrop-filter` elements over video backgrounds do not cause frame drops or visual tearing on Linux/Windows Gecko builds.
  5. **IndexedDB Storage Latency**: Verify that asynchronous `browser.storage.local` reads do not introduce race conditions during initial tab paint.
  6. **Mandatory Manual Testing**: Automated Chrome CDP smoke tests **do not validate Gecko behavior**. All Firefox releases require manual verification.

---

### 6.3 Microsoft Edge (Chromium)

- **Target Engine**: Blink / V8 (Edge 110+)
- **Manifest**: Built via Chrome manifest pipeline (`dist/chrome/`)
- **Key Verification Areas**:
  1. **Chromium Compatibility**: Inherits Chrome Blink architecture; verify clean installation via Edge Extensions Management (`edge://extensions`).
  2. **Edge Tracking Prevention**: Test search autocomplete and RSS news fetching under Edge's "Strict" Tracking Prevention setting to ensure API calls are not blocked.
  3. **Sidebar & Split Screen**: Verify that Homebase renders responsively when opened inside Microsoft Edge's vertical split-screen or narrow sidebar panels.

---

### 6.4 Cross-Browser Parity Matrix

| Feature / Subsystem | Google Chrome | Mozilla Firefox | Microsoft Edge | Parity Status |
|:---|:---:|:---:|:---:|:---:|
| **New Tab Page Override** | `chrome_url_overrides` | `chrome_url_overrides` | `chrome_url_overrides` | **Identical** |
| **Action Toolbar Popup** | `action.default_popup` | `action.default_popup` | `action.default_popup` | **Identical** |
| **Bookmark Management API** | `chrome.bookmarks` | `browser.bookmarks` | `chrome.bookmarks` | **Identical** |
| **Storage Local & Sync** | `chrome.storage.local` | `browser.storage.local` | `chrome.storage.local` | **Identical** |
| **Cache API (Blobs & Media)** | `caches.open()` | `caches.open()` | `caches.open()` | **Identical** |
| **HTML5 Video Playback** | H.264 / WebM / MP4 | H.264 / WebM / MP4 | H.264 / WebM / MP4 | **Identical** |
| **Backdrop-Filter Blurs** | GPU Skia pipeline | WebRender pipeline | GPU Skia pipeline | **Minor GPU variance** |
| **Firefox Containers** | N/A (Feature hidden) | Fully supported | N/A (Feature hidden) | **Firefox Exclusive** |
| **Search Suggestions** | Fetch API + JSONP | Fetch API + JSONP | Fetch API + JSONP | **Identical** |
| **Geolocation API** | `navigator.geolocation` | `navigator.geolocation` | `navigator.geolocation` | **Identical** |
| **Automated CDP Smoke Test** | Supported | Not supported (Manual) | Supported | **Chrome/Edge Only** |

---

## 7. Future Testing Improvements

To elevate Homebase testing from manual verification to enterprise-grade automated QA without violating repository constraints (preserving classic `<script defer>` files and zero production dependencies), the following phased roadmap is recommended:

```
┌────────────────────────────────────────────────────────────────────────┐
│                       TESTING EVOLUTION ROADMAP                        │
│                                                                        │
│  Phase 1 (Immediate)   ──> Native Unit Testing (node:test)             │
│                            Pure functions: math, units, dates, schema │
│                                                                        │
│  Phase 2 (Near-Term)   ──> Headless Cross-Browser E2E (Playwright)     │
│                            Automate Chrome, Firefox & Edge workflows  │
│                                                                        │
│  Phase 3 (Medium-Term) ──> Visual Regression Testing                   │
│                            Pixel-diff FOUC, themes & grid layouts     │
│                                                                        │
│  Phase 4 (Advanced)    ──> High-Fidelity Extension Mock Harness       │
│                            Simulate offline, storage limits & quotas  │
│                                                                        │
│  Phase 5 (Automation)  ──> GitHub Actions CI Pipeline                  │
│                            Automated gates on PR and master pushes    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Automated Unit Testing via `node:test`

- **Objective**: Introduce isolated unit tests for pure algorithmic modules without adding any third-party dependencies (using Node.js 18+ built-in test runner `node:test` and `node:assert`).
- **Target Modules**:
  1. `src/newtab/search/search-utils.js`: `evaluateMath()`, `evaluateUnits()`, `isLikelyUrl()`.
  2. `src/newtab/core/utils.js`: `debounce()`, `throttle()`, `escapeHtml()`, `shuffleArray()`.
  3. `src/newtab/settings/backup-import.js`: Backup JSON schema validator and key whitelist filtering.
  4. `src/newtab/widgets/news.js`: RSS XML headline parser and date sorting logic.
  5. `src/preload.js`: `normalizeWidgetOrder()` and `isDailyRotationDue()`.
- **Command**: `node --test tests/unit/**/*.test.mjs`

---

### Phase 2: Playwright Headless Cross-Browser End-to-End Suite

- **Objective**: Replace the single-browser Chrome CDP smoke test with a multi-browser Playwright test harness that natively boots both Chromium and Firefox.
- **Automated Workflows**:
  - Full startup cold boot test in Chromium and Firefox.
  - Search input typing, math calculation card verification, and bang redirection.
  - Drag-and-drop bookmark reorder with FLIP animation assertion.
  - Gallery browsing, wallpaper selection, and video looping verification.
  - Settings persistence verification across simulated page reloads.

---

### Phase 3: Visual Regression Testing (FOUC & Layout Diffs)

- **Objective**: Automate the detection of layout shifts, FOUC artifacts, and CSS regressions.
- **Approach**: Capture full-page screenshots at 0ms, 16ms, 33ms, and 100ms after tab navigation using headless browser captures. Compare against baseline reference images using pixel-diff algorithms (`pixelmatch`) to catch unexpected font flashes, missing widget icons, or misaligned dock buttons.

---

### Phase 4: Extension API Mock Harness Expansion

- **Objective**: Upgrade `scripts/smoke-newtab-file.mjs` to support deep stateful mocking:
  - Simulate 5,000+ bookmarks to stress-test grid virtualization automatically.
  - Simulate network latency and offline transitions to verify weather/news cache fallbacks.
  - Simulate `chrome.storage.local.set` `QUOTA_BYTES` limits to test storage overflow guards.

---

### Phase 5: Continuous Integration (CI/CD) Pipeline

- **Objective**: Enforce automated quality gates on every GitHub pull request and commit:
  - **Syntax Gate**: `node --check` across all JavaScript files.
  - **Static Gate**: `node scripts/check-newtab-static.mjs` asserting declaration uniqueness and script ordering.
  - **Build Gate**: `npm.cmd run build:chrome` and `npm.cmd run build:firefox`.
  - **E2E Gate**: Playwright multi-browser test pass running on Ubuntu and Windows runners.
  - **Packaging Gate**: Build and validate signed ZIP packages for Chrome and Firefox store submission.

---

> **QA Sign-off Note**: This testing strategy document serves as the authoritative testing blueprint for Homebase. All future feature extractions, performance patches, and release candidates must adhere to the validation sequences and checklists defined herein.
