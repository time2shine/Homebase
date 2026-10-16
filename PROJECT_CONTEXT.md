# Homebase — Project Context & Repository Knowledge Base

**Project:** Homebase (Multi-browser Manifest V3 Dashboard Extension)  
**Source Version:** `1.0.2` (`package.json`, manifests, `src/data.js`, `src/CHANGELOG.md`)  
**GitHub Release / Tag:** `v1.0.2` (commit `20fa9cd`, October 16, 2026)  
**Recorded Store Status (All Browsers):** See [Section 2.1](#21-published-store-releases)  
**Active Development Cycle:** None active / ad-hoc task execution (historical cycles archived in `docs/cycles/`)  
**Repository:** [https://github.com/time2shine/Homebase](https://github.com/time2shine/Homebase)  

---

## 1. Mission & Vision

Homebase is designed to replace the browser's default new-tab page with a lightning-fast, highly customizable, and distraction-free productivity environment. 

Core value propositions:
1. **Instant First Paint**: Synchronous head execution via `preload.js` applies cached wallpaper posters, theme colors, and layout configurations before DOM rendering begins, achieving perceived zero-latency boot.
2. **First-Class Bookmark Organization**: Virtualized tile grids, nested folder navigation, smooth drag-and-drop reordering, folder tab rows, and context-menu controls built on top of native browser bookmark stores.
3. **Comprehensive Customization**: Dynamic accent extraction from wallpaper artwork, video background playback with caching, customizable glassmorphism filters, material color palettes, and configurable sidebar widgets.
4. **Privacy & Local Ownership**: Zero third-party telemetry, no cloud accounts, transactional offline settings backups, and local-first storage.

---

## 2. Platform Architecture & Multi-Browser Targets

Homebase is engineered as a universal browser extension supporting Chromium (Chrome, Edge, Brave) and Gecko engines from a unified codebase:

| Platform | Manifest Target | Target Stores | Key Characteristics |
|---|---|---|---|
| **Google Chrome / Chromium** | [`manifests/manifest.chrome.json`](manifests/manifest.chrome.json) | Chrome Web Store | Manifest V3, `chrome_url_overrides.newtab`, standard extension permissions. |
| **Mozilla Firefox** | [`manifests/manifest.firefox.json`](manifests/manifest.firefox.json) | Firefox Add-ons (AMO) | Manifest V3, Gecko ID (`rokonmagura@gmail.com`), `strict_min_version: 142.0`, `contextualIdentities` permission for container tabs. |
| **Microsoft Edge** | [`manifests/manifest.edge.json`](manifests/manifest.edge.json) | Microsoft Edge Add-ons | Manifest V3, `chrome_url_overrides.newtab`, dedicated build target without Google/ChromeOS dependencies. |

The build system (`scripts/build.mjs`) builds all targets simultaneously into `dist/chrome/`, `dist/firefox/`, and `dist/edge/` by combining `src/` assets with target-specific manifests.

### 2.1 Published Store Releases

Centralized tracking for all browser extension stores. To prevent duplicate or divergent records across documentation, all store publication statuses are maintained exclusively here.

#### Mozilla Firefox (Firefox Add-ons / AMO)
- **Official Listing**: [Firefox Add-ons (AMO) — Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
- **Version History**: [Firefox Add-ons Version History](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/)
- **Last User-Reported Store Version**: `0.18.0`
- **Reported On**: 2026-10-16
- **Verification Status**: User-reported, not independently verified.

#### Google Chrome (Chrome Web Store)
- **Official Listing URL**: [Chrome Web Store — Homebase](https://chromewebstore.google.com/detail/ejfdeilhncacmmbdfmgpolpoldpllbmc) *(URL supplied by user)*
- **Latest Observed Listing Status**: Taken down.
- **Evidence**: User-provided dashboard screenshot, recorded 2026-10-17.
- **Submission Status**: Updated `v1.0.2` package prepared (`dist/homebase-chrome-1.0.2.zip`); resubmission and approval are not yet confirmed.
- **Version Distinction Note**: Do not treat the prepared package version as the published store version.

#### Microsoft Edge (Microsoft Edge Add-ons)
- **Status**: Version `1.0.2`: In review.
- **Evidence**: User-provided Partner Center screenshot, recorded 2026-10-17.
- **Product ID**: `9de86c5a-b20f-4d2f-a019-77c7ed6d4e25`
- **Public Listing URL**: Not yet available. Partner Center dashboard states it will be available once published.
- **Reminder**: Record the official public URL here after publication. Do not construct or guess a store URL.

#### Store Version Verification Rule
When the latest published version for any store is needed, check the official listing (and version history where available). Record the verified version, verification date, and evidence source. If access fails or status cannot be verified directly, retain the last known value and mark it unverified/stale.

#### Distinct Version States
Always keep these four states strictly distinct:
1. **Source / Package Version**: Declared in `package.json` and `manifests/*`.
2. **GitHub Release / Tag Version**: Created in git and published on GitHub Releases (`vX.Y.Z`).
3. **Submitted Version**: Package uploaded to store developer consoles for review.
4. **Publicly Published Store Version**: Live version approved and publicly available for install on the official store listing.

*Note: A GitHub release, git tag, local build, or pending store submission does not prove a store release is publicly published.*

---

## 3. Directory Layout

```text
Homebase/
├── manifests/                        # Browser-specific manifest sources
│   ├── manifest.chrome.json          # Chrome Web Store MV3 manifest
│   ├── manifest.edge.json            # Microsoft Edge Add-ons MV3 manifest
│   └── manifest.firefox.json         # Firefox AMO MV3 manifest
├── src/                              # Main application source code
│   ├── new-tab.html                  # Main entry point & deferred script definitions
│   ├── new-tab.css                   # Core design tokens, dark themes, responsive layout
│   ├── new-tab.js                    # Startup orchestrator (<script defer> runtime)
│   ├── preload.js                    # [PROTECTED] Synchronous <head> preloader
│   ├── instant_load.js               # [PROTECTED] Synchronous cached state renderer
│   ├── data.js                       # Built-in presets, search engines, What's New
│   ├── tips.js                       # Homebase tips data source (window.HOMEBASE_TIPS)
│   ├── assets/                       # Static media, icons, SortableJS vendor script
│   └── newtab/                       # Domain-separated controllers & services
│       ├── core/                     # Storage facade, dispatcher, dialogs, dock, perf
│       ├── bookmarks/                # Grid, drag controller, tree service, loader, tabs
│       ├── search/                   # Search interaction, suggestions cache, UI
│       ├── settings/                 # Settings modal, preferences, backup, visual FX
│       ├── wallpaper/                # Wallpaper playback, asset cache, daily rotation
│       ├── widgets/                  # Time, weather, news, quote, todo, visibility
│       ├── integrations/             # Google apps launcher, Firefox containers
│       └── tips/                     # Homebase tips UI
├── scripts/                          # Toolchain and validation automation
│   ├── build.mjs                     # Dual target build & ZIP packaging engine
│   ├── test.mjs                      # 4-stage test pipeline runner
│   ├── check-newtab-static.mjs       # Static invariant & declaration collision checker
│   └── smoke-newtab-file.mjs         # Headless browser smoke test runner
├── tests/                            # Automated test specifications
│   └── unit/                         # Native node:test specifications (367 passing tests)
├── docs/                             # Project documentation, plans, and reports
│   ├── README.md                     # Central documentation directory index
│   ├── architecture/                 # Permanent system architectural specifications
│   ├── decisions/                    # Architecture Decision Records (ADRs)
│   ├── cycles/                       # Development cycle plans and phase tracking
│   ├── releases/                     # Release preparation, notes, and asset verification
│   └── archive/                      # Historical cycle records (Cycles 1–10)
├── AGENTS.md                         # Guidelines and rules for AI collaboration
└── PROJECT_CONTEXT.md                # This document
```

---

## 4. Key Subsystems & Canonical Owners

Homebase enforces a **single canonical owner** rule for every subsystem:

1. **Bookmark Drag Controller (`HomebaseBookmarkDragController`)**:
   - Location: `src/newtab/bookmarks/bookmark-drag-controller.js`
   - Responsibilities: Grid & folder tab SortableJS instances, pointer raycasting, folder hover locking, tile reordering, and WebExtension move dispatches.
2. **Bookmark Grid Controller (`HomebaseBookmarkGridController`)**:
   - Location: `src/newtab/bookmarks/bookmark-grid-controller.js`
   - Responsibilities: Virtualized tile grid layout, DOM rendering, row calculations, and grid event delegation.
3. **Bookmark Loader Service (`HomebaseBookmarkLoader`)**:
   - Location: `src/newtab/bookmarks/bookmark-loader-service.js`
   - Responsibilities: Recursive bookmark tree fetching, root display ID determination, and folder metadata loading.
4. **Storage Facade (`HomebaseStorage`)**:
   - Location: `src/newtab/core/storage-service.js`
   - Responsibilities: Unified storage access across Chrome & Firefox, batch writes (`setMany`), schema versioning, and cache invalidation.
5. **Storage Dispatcher (`HomebaseStorageDispatcher`)**:
   - Location: `src/newtab/core/storage-dispatcher.js`
   - Responsibilities: Decoupled pub/sub event pipeline notifying components of storage updates without tight coupling.
6. **Wallpaper Controller (`HomebaseWallpaperController`)**:
   - Location: `src/newtab/wallpaper/wallpaper-controller.js`
   - Responsibilities: Background video playback, poster caching, daily rotation timing, and gallery hydration.

---

## 5. Execution Model & Performance Invariants

### 5.1 Two-Phase Startup Flow
1. **Critical Phase (Instant & Synchronous)**:
   - `preload.js` runs in `<head>` before any DOM element exists, reading fast storage mirrors from `localStorage` to immediately apply wallpaper posters and themes.
   - `instant_load.js` renders cached bookmark tabs and layout skeletons.
   - Page enters `ready` state within milliseconds (`body.classList.add('ready')`).
2. **Non-Critical Phase (Deferred Idle Hydration)**:
   - Heavy dashboard widgets (weather network fetching, news RSS parser, quote catalog building, todo lists, search engines) are deferred into cooperative idle slices using `requestIdleCallback` (`scheduleIdleTask`).
   - The user experiences zero UI jank or input freezing during initial tab opening.

### 5.2 Script Loading Contract
- All scripts load via classic `<script defer>` tags in `src/new-tab.html`.
- No bundler is used; modules run directly in browser engines.
- Scripts evaluate sequentially in document order within a shared global execution context.
- Top-level variables must be unique across all scripts to prevent `SyntaxError` declaration collisions.

---

## 6. Collaboration Standards & AI Workflow

All engineering activity follows the tiered workflow model documented in [`docs/development-workflow.md`](docs/development-workflow.md) and governance rules in [`AGENTS.md`](AGENTS.md).

Tasks are scoped proportionally (Tier A: Visual Fix, Tier B: Behaviour Change, Tier C: High-Risk/Architectural). Protected source files (`src/preload.js`, `src/instant_load.js`) require explicit authorization to modify; manifest version changes follow the release workflow; and existing build scripts may regenerate `dist/` during authorized development and verification tasks, but generated `dist/` files must never be manually edited or staged. No commit or push is ever performed without explicit user authorization.

---

## 7. Current Handoff

- **Branch & Head Commit**: Branch `main`, latest commit `d66fdbc` (`build: add dedicated Microsoft Edge distribution target`, 2026-10-16). Tag `v1.0.2` pushed; GitHub release published with dual browser packages (`dist/homebase-chrome-1.0.2.zip`, `dist/homebase-firefox-1.0.2.zip`).
- **Current Objective**: Implement Chrome-build-only browser-default search (`chrome.search.query()`) to resolve Chrome Web Store rejection "Red Argon" while preserving multi-engine search, provider preferences, and remote suggestions on Edge and Firefox. (Investigated "love -> http://love/" incident: user confirmed root cause was no default search engine selected in the test browser; direct `chrome.search.query()` call reproduced the same navigation independently of Homebase. Reverted speculative URL-routing patches.)
- **Published Store Release Status**:
  - Official Firefox Listing: [Firefox Add-ons (AMO) — Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
  - Version History: [Firefox Add-ons Version History](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/)
  - Recorded Store Status: Tracked exclusively in [Section 2.1](#21-published-store-releases).
- **Distribution Target Isolation & Capabilities**:
  - **Compile-Time Target Isolation**: Build pipeline (`scripts/build.mjs`) generates target-specific `dist/<target>/newtab/core/build-config.js` defining `HomebaseBuildConfig` and `isBrowserDefaultSearch()`. No runtime user-agent sniffing.
  - **Chrome Target (`dist/chrome/`)**:
    - Manifest permissions: added `"search"`, removed `"cookies"` (confirmed unused in Chrome).
    - Host permissions: removed 7 search-suggestion-only autocomplete endpoints (`duckduckgo.com/ac/*`, `suggest.yandex.com/*`, `ff.search.yahoo.com/*`, `completion.amazon.com/*`, `api.bing.com/osjson.aspx*`, `suggestqueries.google.com/*`, `en.wikipedia.org/*`). Retained hosts required for weather, news, Google/t2 favicons, and wallpapers.
    - Web Search Routing: General web queries route exclusively via `chrome.search.query({ text, disposition })`. Preserves current-tab and new-tab dispositions based on user preference and keyboard modifiers.
    - Direct URLs: Direct URLs and localhost navigation bypass `chrome.search.query` and open directly.
    - Error Handling: Missing `chrome.search` or API promise rejection shows user alert (`showCustomAlert`) and never falls back to hardcoded search URLs.
    - UI Neutralization & Layout Shift Prevention: Initial markup in Chrome build (`dist/chrome/new-tab.html`) receives `browser-default-search` class on `<body>` and `.search-container`, plus `placeholder="Search the web"` and `aria-label="Search the web"` from build time. Scoped CSS (`.browser-default-search #search-engine-selector`, `.browser-default-search .search-input-divider`) hides the 63px picker/divider footprint and sets `border-radius: 12px` on `#search-input` from first paint, eliminating startup layout shift before deferred idle hydration runs. Engine cycling shortcuts (`Alt+Arrow`, `Alt+Home`) are deactivated.
    - Suggestions & Bangs: Remote autocomplete fetches return `[]` immediately without network requests; bang suggestions disabled. Local bookmark/history suggestions and calculator expression evaluation remain fully functional.
    - Legacy Preferences: Previously saved provider choices are ignored for routing without being deleted or overwritten when saving settings.
  - **Edge Target (`dist/edge/`)**:
    - Manifest permissions: removed unused `"cookies"` permission. Retained all 17 host permissions.
    - Search Behavior: Retains existing multi-engine picker, provider preferences, engine cycling, bang shortcuts, and remote search suggestions.
  - **Firefox Target (`dist/firefox/`)**:
    - Manifest and source completely unchanged; retains multi-engine picker, Firefox containers, and all existing features.
- **Evidence Attribution & Automated Verification**:
  - Prepared Chrome Submission Package: `dist/homebase-chrome-1.0.2.zip` (size: 3,447,335 bytes, SHA-256: `6d484c1ac5c2b0c064efbe0ca15990782930e89fc4d610673fb8178b9785e589`).
  - Chrome Web Store Status: Submission and Google review approval are NOT yet confirmed (package prepared for developer upload).
  - Build Validation: Verified multi-target packaging (`dist/chrome/`, `dist/firefox/`, `dist/edge/`). Edge cookies permission removed; existing Edge ZIP preserved without alteration.
  - Unit Tests: Dedicated test suite `tests/unit/chrome-default-search.test.mjs` (13 tests passing covering Chrome routing, CURRENT_TAB/NEW_TAB dispositions, direct URLs, API failures, legacy preference preservation, suggestions disabling, and Edge/Firefox behavior preservation).
  - Test Pipeline: Automated checks PASS:
    - Syntax Check: `node --check` (PASS).
    - Static Invariants: 76 deferred scripts checked, 0 collisions (PASS).
    - Focused Unit Tests: `tests/unit/chrome-default-search.test.mjs` (13/13 PASS), `tests/unit/search-ui-controller.test.mjs` (8/8 PASS).
  - Manual / Installed Browser Checks: User-reported verification on 2026-10-17 confirmed PASS for live installed Chrome build (web search via chrome.search.query(), direct URL navigation, layout stability from first paint with zero snap, neutral placeholder, and hidden engine picker/settings). Live Edge installed check remains unverified pending separate user testing.
- **Working Tree Changes**: Ready for commit upon user authorization.
- **Next Task**: Await user upload of `dist/homebase-chrome-1.0.2.zip` to the Chrome Developer Dashboard and subsequent Google review outcome.
- **Last Updated Date**: October 17, 2026
