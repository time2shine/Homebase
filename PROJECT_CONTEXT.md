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
- **Submission Status**: User-reported `v1.0.2` package uploaded to Chrome Developer Dashboard; in review by Google (recorded 2026-10-17).
- **Version Distinction Note**: Do not treat the submitted package version as the published store version.

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

### 5.3 Performance Mode & Resource Profiles
- Performance Mode reduces system resource consumption by pausing live video playback, reducing glass/bookmark blur and entrance animations, and disabling Cinema Mode, while preserving all saved user appearance preferences.
- Architectural analysis, user-reported testing observations (October 18, 2026), automated setup status, and the standardized live-browser benchmarking procedure are documented in [`docs/performance-mode-impact.md`](docs/performance-mode-impact.md).

---

## 6. Collaboration Standards & AI Workflow

All engineering activity follows the tiered workflow model documented in [`docs/development-workflow.md`](docs/development-workflow.md) and governance rules in [`AGENTS.md`](AGENTS.md).

Tasks are scoped proportionally (Tier A: Visual Fix, Tier B: Behaviour Change, Tier C: High-Risk/Architectural). Protected source files (`src/preload.js`, `src/instant_load.js`) require explicit authorization to modify; manifest version changes follow the release workflow; and existing build scripts may regenerate `dist/` during authorized development and verification tasks, but generated `dist/` files must never be manually edited or staged. No commit or push is ever performed without explicit user authorization.

---

## 7. Current Handoff

- **Branch & Head Commit**: Branch `main`, latest commit `48cd0b6` (`fix: harden tips cycling against runtime length drift`, 2026-10-17).
- **Current Objective**: Performance Mode lifecycle fixes, persistence hardening, Wallpaper Type UI integration, bookmark appearance transparency preservation, modal animation hardening, Settings explanation, and impact documentation.
- **Published Store Release Status**:
  - Official Firefox Listing: [Firefox Add-ons (AMO) — Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
  - Version History: [Firefox Add-ons Version History](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/)
  - Recorded Store Status: Tracked exclusively in [Section 2.1](#21-published-store-releases).
- **Performance Mode Implementation & Hardening**:
  - Video Playback Lifecycle: Toggling ON stops playback and background timers; toggling OFF cleanly restores video wallpaper when saved preference is video; static wallpapers remain static.
  - Persistence & Discard Order: Serialized writes through `_perfWriteQueue` and `_perfWriteTicket` prevent out-of-order writes from overwriting restored state on Cancel/Close; dual-syncs both fast localStorage mirror keys (`fast-performance-mode` and `fast-perf-mode`).
  - Wallpaper Type UI Alignment: Inline explanation and accessible "Turn off Performance Mode" action button added to Settings and Wallpaper Gallery; switching from Static to Live Video disabled while ON, but existing Live Video selections preserved and can switch to Static.
  - Bookmark Styling Preservation: Cascade overrides refined so Transparent Background and Custom Background color/opacity preferences are preserved in both modes; blur disabled in Performance Mode without forcing gray backgrounds.
  - Modal Animation Hardening: Opening animation listener filters bubbled child animation events (`e.target !== dialog`), prevents marking closing/hidden dialogs as settled, cleans up listeners on close and before reopen, excludes closing overlays in performance controller, and scopes `.modal-settled:not(.closing)` so closing shrink animations always run.
  - Settings Explanation: Updated description beneath Performance Mode to accurately explain effects on live wallpapers, background blur, animations, and Cinema Mode while confirming saved appearance preferences are preserved (`aria-describedby="app-performance-mode-hint"`).
- **UI Layout Fixes (October 18, 2026)**:
  - Performance Mode Switch Sizing: Added `flex: 0 0 46px; flex-shrink: 0;` to `.app-switch` and `flex-shrink: 0;` to all `.app-setting-row` controls (`.app-switch`, selects, buttons), preventing switch compression while allowing the multi-line description to wrap naturally with preserved 18px gap.
  - Settings Footer & Height Constraints: Fixed dialog overflow clipping Save and Cancel buttons by enforcing `min-height: min(520px, calc(100vh - 40px)); max-height: calc(100vh - 40px);`, zeroing `.gallery-header h3` margin, applying `grid-template-rows: minmax(0, 1fr); overflow: hidden;` to `.app-settings-body`, making `.app-settings-nav` scrollable with `overflow-y: auto; min-height: 0;`, and setting `flex-shrink: 0; padding-bottom: 2px;` on `.app-settings-footer`.
  - Perf Debug Overlay Dock Clearance: Replaced continuous JS position polling (`updatePerfOverlayDockOffset`) with declarative CSS variables (`--dock-width: 40px; --dock-gap: 12px;`) on `:root`, positioning `#perf-debug-overlay` via `right: calc(var(--hb-perf-dock-width) + var(--hb-perf-dock-gap))` (collapsing cleanly to `right: 12px` on `body.dock-collapsed`) to guarantee full visibility and clickability of dock icons. Removed conflicting inline declarations from `ensurePerfOverlayElement()` so the stylesheet is the single source of truth without `!important`.
  - Verification Status: User confirmed manual PASS for the three UI layout fixes (switch dimensions, settings footer visibility/scrolling, and overlay dock clearance), reported October 18, 2026.
- **Performance Mode Impact & Measurement Records**:
  - User-Reported Testing (October 18, 2026): Informal user-reported observations in a live setup recorded Performance Mode OFF idle CPU generally around 1–4% and Performance Mode ON idle CPU generally around 0.02–1.3%. User repeated the comparison with similar results; findings suggest reduced idle CPU in the tested setup. Exact browser/version, sample timing, and complete repeated-run data were not supplied and are not invented. No claims made of precise percentage savings, faster startup, or GPU/battery improvements.
  - Automated Measurement Status: Documented in [`docs/performance-mode-impact.md`](docs/performance-mode-impact.md) ("The attempted automated setup did not reliably load and measure the installed extension; no automated performance results were obtained.").
  - Standardized Manual Protocol: Documented 8-run alternating manual measurement protocol in [`docs/performance-mode-impact.md`](docs/performance-mode-impact.md).
- **Working Tree Changes**: Reviewed changes staged and committed upon user authorization.
- **Last Updated Date**: October 18, 2026
