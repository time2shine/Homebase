# Homebase — Project Context & Repository Knowledge Base

**Project:** Homebase (Dual-Browser Manifest V3 Dashboard Extension)  
**Source Version:** `1.0.1` (`package.json`, manifests; commit `1ce8034`, October 14, 2026)  
**Confirmed Store Release:** Unknown / unconfirmed from local repository evidence alone (`v1.0.1` git tag exists locally)  
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

## 2. Platform Architecture & Dual-Browser Target

Homebase is engineered as a universal browser extension supporting both Chromium and Gecko engines from a unified codebase:

| Platform | Manifest Target | Target Stores | Key Characteristics |
|---|---|---|---|
| **Google Chrome / Chromium** | [`manifests/manifest.chrome.json`](manifests/manifest.chrome.json) | Chrome Web Store, Edge Addons | Manifest V3, `chrome_url_overrides.newtab`, standard extension permissions. |
| **Mozilla Firefox** | [`manifests/manifest.firefox.json`](manifests/manifest.firefox.json) | Firefox Add-ons (AMO) | Manifest V3, Gecko ID (`rokonmagura@gmail.com`), `strict_min_version: 142.0`, `contextualIdentities` permission for container tabs. |

The build system (`scripts/build.mjs`) builds both targets simultaneously into `dist/chrome/` and `dist/firefox/` by combining `src/` assets with target-specific manifests.

---

## 3. Directory Layout

```text
Homebase/
├── manifests/                        # Browser-specific manifest sources
│   ├── manifest.chrome.json          # Chrome Web Store MV3 manifest
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

- **Branch & Head Commit**: Branch `main`, latest commit `1ce8034` (`release: prepare Homebase v1.0.1`, 2026-10-14).
- **Current Objective**: Review and manually verify bookmark background settings in live browser, followed by staging and commit after authorization.
- **Workflow Documentation Review Status**:
  - Review is complete ([`docs/development-workflow.md`](docs/development-workflow.md), [`AGENTS.md`](AGENTS.md), [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md), [`docs/README.md`](docs/README.md)).
  - Proportional 3-tier task sizing, protected-file rules, and AI handoff standards established.
  - Authorized for commit as documentation-only milestone.
- **User-Approved Decisions**:
  - Focused CSS fix for inline-rename layout shift without arbitrary `translateY` offsets.
  - Mutually exclusive Transparent Background (default) and Custom Background settings with slider preservation.
  - Documentation-only workflow formalization without running redundant tests or builds.
- **Working Tree Review & Verification Status**:
  - **Inline-Rename Layout Fix** ([`src/new-tab.css`](src/new-tab.css)):
    - *Status*: User confirmed the layout shift fix works.
    - *Coverage & Limits*: Cross-browser coverage (Gecko vs Chromium) and additional edge cases (multiline titles, extreme zoom levels) are not established by that confirmation alone.
  - **Bookmark Background Settings** ([`src/new-tab.html`](src/new-tab.html), [`src/newtab/settings/settings-preferences.js`](src/newtab/settings/settings-preferences.js), [`src/newtab/settings/settings-form-controller.js`](src/newtab/settings/settings-form-controller.js)):
    - *Status*: Implementation reported (mutual exclusion between Transparent and Custom Background modes, slider preservation, CSS variable toggling).
    - *Limits*: Functional review and manual verification in live browser remain pending.
  - **Associated Bookmark & Context Menu Changes** ([`src/newtab/bookmarks/bookmark-grid-controller.js`](src/newtab/bookmarks/bookmark-grid-controller.js), [`src/newtab/core/context-menu-controller.js`](src/newtab/core/context-menu-controller.js), [`src/assets/js/bookmark-editor.js`](src/assets/js/bookmark-editor.js), [`src/newtab/bookmarks/bookmark-editor-adapter.js`](src/newtab/bookmarks/bookmark-editor-adapter.js), [`src/new-tab.js`](src/new-tab.js), [`tests/unit/context-menu-controller.test.mjs`](tests/unit/context-menu-controller.test.mjs), [`tests/unit/bookmark-grid-rename-edit.test.mjs`](tests/unit/bookmark-grid-rename-edit.test.mjs)):
    - *Status*: Inherited working tree modifications preserved intact; functional review and live dashboard verification pending.
- **Evidence Attribution & Automated Verification**:
  - Dual Build: `npm.cmd run build` exited with code 0 (PASS, verified 2026-10-16 01:49:35).
  - Static Invariants: `node scripts/check-newtab-static.mjs` exited with code 0 across 75 scripts and 626 declarations (PASS, verified 2026-10-16 01:29:37).
  - Syntax Checks: `node --check` exited with code 0 separately on all modified JS files (PASS, verified 2026-10-16 01:29:32).
  - Protected Files Guard: `src/preload.js` and `src/instant_load.js` unmodified; `manifests/` unmodified; `dist/` cleanly regenerated by build scripts without manual edits or staging.
- **Known Blockers**: None.
- **Next Task**: Review and manually verify the bookmark background settings in live browser.
- **Last Updated Date**: October 16, 2026
