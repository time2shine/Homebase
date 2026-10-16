# Homebase — Project Context & Repository Knowledge Base

**Project:** Homebase (Dual-Browser Manifest V3 Dashboard Extension)  
**Source Version:** `1.0.2` (`package.json`, manifests, `src/data.js`, `src/CHANGELOG.md`)  
**GitHub Release / Tag:** `v1.0.2` (commit `20fa9cd`, October 16, 2026)  
**Recorded Firefox Store Version:** See [Section 2.1](#21-published-store-releases)  
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

- **Official Firefox Listing**: [Firefox Add-ons (AMO) — Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
- **Last User-Reported Firefox Store Version**: `0.18.0`
- **Reported On**: 2026-10-16
- **Verification Status**: User-reported, not independently verified.

#### Store Version Verification Rule
When the latest published Firefox version is needed, check the official listing and, if necessary, its [version history](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/). Record the version and verification date after checking. If access fails, retain the last known value and mark it unverified/stale.

#### Distinct Version States
Always keep these three states strictly distinct:
1. **Source / Package Version**: Declared in `package.json` and `manifests/*`.
2. **GitHub Release / Tag Version**: Created in git and published on GitHub Releases (`vX.Y.Z`).
3. **Published Firefox Store Version**: Live version approved and published on Firefox Add-ons (AMO).

*Note: A GitHub release, git tag, or local build does not prove a store release is published.*

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

- **Branch & Head Commit**: Branch `main`, latest commit `3a74929` (`docs: record user manual verification of v1.0.2 background settings`, 2026-10-16). Tag `v1.0.2` pushed; GitHub release published with dual browser packages (`dist/homebase-chrome-1.0.2.zip`, `dist/homebase-firefox-1.0.2.zip`).
- **Current Objective**: Implement dedicated Microsoft Edge build target (`manifests/manifest.edge.json`, `dist/edge/`, `dist/homebase-edge-1.0.2.zip`, `build:edge`, `zip:edge`).
- **Published Store Release Status**:
  - Official Firefox Listing: [Firefox Add-ons (AMO) — Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
  - Version History: [Firefox Add-ons Version History](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/)
  - Recorded Store Status: Tracked exclusively in [Section 2.1](#21-published-store-releases).
- **Multi-Target Architecture & Build Additions**:
  - Added dedicated Microsoft Edge manifest (`manifests/manifest.edge.json`) derived from Chromium MV3 manifest without `update_url` or Firefox-specific properties.
  - Updated `scripts/build.mjs` and `package.json` to support `build:edge` (`dist/edge/`) and `zip:edge` (`dist/homebase-edge-1.0.2.zip`) alongside `chrome` and `firefox`.
  - Feature Preservation: All current features, including the search-engine picker, are preserved in every distribution target.
  - Deferred Search Item: Separate distribution targets are available. Future Chrome-only search behavior still requires target-specific configuration; shared source changes currently affect all targets.
  - User Manual Verification: Confirmed PASS for Transparent Background default, Save/reload persistence, and Cancel/Close restoration (reported by user on 2026-10-16; recorded in [`docs/release/v1.0.2-release-notes.md`](docs/release/v1.0.2-release-notes.md)).
  - Store URLs: Preserved without changes pending verified Microsoft Edge Add-ons store listing URL.
- **Evidence Attribution & Automated Verification**:
  - Build Validation: `npm.cmd run build` generated `dist/chrome/`, `dist/firefox/`, and `dist/edge/` cleanly.
  - ZIP Packaging: `npm.cmd run zip:edge`, `zip:chrome`, and `zip:firefox` generated valid ZIP archives containing root-level `manifest.json`.
  - Feature Check: Verified `dist/edge/new-tab.html` retains all search engine picker DOM elements and script bindings.
  - Automated Verification: 4-stage test pipeline passed during v1.0.2 release preparation (140 files syntax check, 75 scripts invariant check, 561 unit tests, Edge headless browser smoke).
- **Working Tree Changes**: Clean (dedicated Edge build target committed and pushed to origin/main).
- **Next Task**: Normal ad-hoc development or maintenance.
- **Last Updated Date**: October 16, 2026
