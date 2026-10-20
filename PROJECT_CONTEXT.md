# Homebase — Project Context & Repository Knowledge Base

**Project:** Homebase (Multi-browser Manifest V3 Dashboard Extension)  
**Source Version:** `1.0.3` (`package.json`, manifests, `src/data.js`, `src/CHANGELOG.md`)  
**GitHub Release / Tag:** `v1.0.3` (commit `1d140f1`, October 20, 2026)  
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
- **Status**: Live / Publicly Available.
- **Published Store Version**: `1.0.3`
- **Updated / Verified Date**: October 20, 2026
- **Evidence & Verification**: User reported Mozilla accepted v1.0.3 on October 20, 2026. Independently verified publicly available on October 20, 2026 via official Mozilla Add-ons API v5 (`https://addons.mozilla.org/api/v5/addons/addon/homebase-new-tab-dashboard/`), which lists current version `1.0.3` (`status: public`, reviewed `2026-10-19T18:37:12Z`), and verified direct public download of the signed XPI package (`https://addons.mozilla.org/firefox/downloads/file/5140626/homebase_new_tab_dashboard-1.0.3.xpi` returning HTTP `200 OK`). (Direct HTML fetches to the web listing page return a Cloudflare client challenge to non-browsers, but the official AMO REST API and public XPI package confirm active public availability).

#### Google Chrome (Chrome Web Store)
- **Official Listing URL**: [Chrome Web Store — Homebase](https://chromewebstore.google.com/detail/homebase/ejfdeilhncacmmbdfmgpolpoldpllbmc)
- **Status**: Live published version is `1.0.2`; Version `1.0.3` is under review.
- **Published Store Version**: `1.0.2`
- **Submission Status**: Version `1.0.3`: Under review (user-reported October 20, 2026).
- **Updated Date**: October 18, 2026 (Live listing updated); October 20, 2026 (v1.0.3 under-review report recorded).
- **Evidence & Verification**: User confirmed live listing on October 18, 2026 (verified from public Chrome Web Store listing metadata: Version `1.0.2`, Updated `October 18, 2026`). User reported v1.0.3 submitted and under review on October 20, 2026.
- **Version Distinction Note**: The live published store package `1.0.2` reflects the release package submitted on October 17, 2026; submitted version `1.0.3` is currently under review by the Chrome Web Store team.

#### Microsoft Edge (Microsoft Edge Add-ons)
- **Status**: Version `1.0.2`: In review (re-confirmed by user on October 20, 2026).
- **Evidence**: User-provided Partner Center confirmation, recorded 2026-10-17 and re-confirmed still under review on October 20, 2026.
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

- **Release Baseline**: Branch `main`, commit `1d140f1` (`release: prepare Homebase v1.0.3`, tag `v1.0.3`, October 20, 2026).
- **Current Objective**: Track browser store review and publication progress for Homebase v1.0.3.
- **Published Store Release Status**: All browser store publication statuses, review states, reporting dates, and verification records are centralized exclusively in [Section 2.1 — Published Store Releases](#21-published-store-releases).
- **Release Preparation (v1.0.3 — October 20, 2026)**:
  - Scope: Wallpaper tab visibility lifecycle, interrupted crossfade recovery, Performance Mode appearance preservation, transactional settings persistence, settings layout & dialog scrolling fixes, and browser-specific tips filtering.
  - Packaged Archives: `dist/homebase-chrome-1.0.3.zip`, `dist/homebase-firefox-1.0.3.zip`, `dist/homebase-edge-1.0.3.zip`.
  - Manual Verification State: User confirmed manual checks passed in Chrome, Edge, and Firefox on October 20, 2026 (exact browser versions, benchmark measurements, or comprehensive matrix details were not specified and are not invented).
  - Store Status Distinction: Store publication status remains strictly separate from release preparation; see [Section 2.1](#21-published-store-releases) for canonical store publication and review statuses. Preparation and packaging of v1.0.3 packages does not alter store submission states.
- **Settings Dialog Keyboard Accessibility (October 20, 2026)**:
  - Accessible Semantics & Labelling: In `src/new-tab.html`, added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="app-settings-title"`, and `tabindex="-1"` to `#app-settings-dialog`. Tagged `<h3>Settings</h3>` with `id="app-settings-title"`. In `src/newtab/styles/settings.css`, added `.app-settings-dialog:focus { outline: none; }`.
  - Opener Tracking & Initial Focus: In `src/newtab/settings/settings-panel-controller.js`, `resolveOpenerElement` captures the actual opener element before opening, accepting string IDs, Element references, or falling back to `document.activeElement`. `scheduleInitialFocus` sets initial focus to the active section navigation button (`.app-settings-nav-item.is-active`) or fallback `#app-settings-close`. Delayed focus is guarded with a sequence token counter (`openSequenceToken`) and modal visibility check (`isModalOpen()`), ensuring stale callbacks from a closed or reopened dialog cannot steal focus.
  - Tab & Shift+Tab Focus Containment: Implemented dynamic focus trap in `handleSettingsKeydown` using `getSettingsFocusableElements`. Dynamically computes eligible controls, excluding hidden containers (`.hidden`), inactive sections (`.app-settings-section:not(.active)`), hidden footers (`.app-settings-footer.hidden`), disabled controls, inert elements, and negative-tabindex controls. Wraps forward from last focusable to first, wraps backward from first to last on Shift+Tab, falls back to focusing `#app-settings-dialog` container when no focusables exist, and immediately yields (`return;`) when a nested dialog is active.
  - Focus Restoration: `restoreOpenerFocus` returns focus on close to the connected, visible, enabled opener element, falling back to `#main-settings-btn` if the opener was disconnected or disabled. Guards with sequence token and `hasActiveNestedDialog()` ensure focus is not stolen if Settings is reopened or another dialog is active.
  - Escape Coordination & Nested Isolation: `handleSettingsEscape` respects `e.defaultPrevented` and `e._homebaseHandled`, verifies `!isNestedDialogActiveOrClosing()` and `!hasActiveNestedDialog()`, and inspects event target origin. In `src/newtab/settings/search-engine-settings.js`, `src/newtab/settings/visual-effects-settings.js`, and `src/newtab/bookmarks/folder-picker.js`, nested dialogs (`search-engines-modal`, `animation-settings-modal`, `glass-settings-modal`, `folder-picker-modal`) stop Escape propagation, mark `e._homebaseHandled = true`, and restore focus to their invoking buttons on close. Settings Escape maintains `closeAppSettingsModal({ discard: true })` for complete transactional settings rollback.
  - Section Switching Focus Rescue: In `setActiveAppSettingsSection`, if the currently focused control is deactivated or hidden by switching sections (or footer is hidden), focus is rescued to the active section navigation button rather than dropping to document body. Section navigation buttons preserve ordinary button semantics (no tablist/tab roles or arrow-key navigation).
  - Automated Regression Tests: In `tests/unit/settings-panel-controller.test.mjs`, added 12 new focused tests (20 passing in suite, 100 passing across settings/dialog/backup suites) covering dialog semantics, initial focus targeting and sequence guard, forward/backward wrapping, dynamic focusable filtering, empty fallback, focus restoration and fallback, nested dialog Tab yield, Escape coordination and nested isolation, event-order regression where nested dialog closes before Settings Escape runs, Escape transactional discard, and section-switch focus rescue.
  - Verification & Boundaries: User reported manual PASS on October 20, 2026 (specific browser coverage was not explicitly specified; testing across all three target browsers is not claimed, and screen-reader announcements or OS high-contrast themes remain explicitly unverified). Automated checks verified: separate syntax checks (`node --check`) for all modified JS files, static invariant checks (`check-newtab-static.mjs`), 20 settings panel controller unit tests (PASS), and local unpacked builds for Chrome, Firefox, and Edge (`npm.cmd run build`; release ZIPs preserved).
- **Bookmark & Folder Keyboard Accessibility (October 20, 2026)**:
  - Accessible Semantics & Focusability: In `src/newtab/bookmarks/bookmark-grid-controller.js`, added `tabindex="0"`, `role="link"` for bookmark tiles, and `role="button"` for folder tiles and the navigation Back button. Tiles have `aria-label` matching their displayed title.
  - Keyboard Activation Delegation & Hold Safeguard: Added `handleGridKeydown` and `activateGridItem` reusing existing bookmark activation (open in new tab preferences, container tabs) on Enter, and folder navigation on Enter and Space. Prevents duplicate activation when keys are held down (`e.repeat` guard); maintains `preventDefault()` on held Space for folder and back tiles to prevent page scrolling without repeatedly navigating.
  - Nested Control & Rename Exclusion: Added `isNestedInteractiveOrEditable` to restrict keyboard activation strictly to the tile itself or non-interactive contents. Explicitly excludes all nested interactive/editable controls (`input`, `textarea`, `button`, `select`, `a`, `[contenteditable]`, `role="button"`, `role="link"`, `role="textbox"`, `.grid-item-rename-input`), preserving typing inside inline rename inputs and native actions on nested controls.
  - Virtual Scrolling & Recycled Node Focus Safety: In `updateElementData`, ensured roles, tabindex, and aria-labels stay updated across virtual DOM node reuse. Added active element detection (`document.activeElement === el`) so when a DOM node is recycled to a different bookmark ID while focused, it is safely blurred (`el.blur()`) to prevent focus from silently jumping to an unrelated bookmark.
  - Visible Focus Styling: Added `:focus-visible` styling (`outline: 2px solid #2ca5ff; outline-offset: 2px;`) to `.bookmark-item` in `src/new-tab.css` with layout shifts eliminated (`outline` instead of border/margin changes). Default `:focus` outline suppressed.
  - Automated Regression Tests: In `tests/unit/bookmark-grid-click.test.mjs`, added 14 focused unit tests (22 total in file, 49 in bookmark subsystem) verifying: bookmark Enter activation, bookmark Space non-activation, folder Enter/Space opening, Back button Enter/Space navigation, held Enter non-repetition, held Space non-repetition with scroll prevention, nested button/input/link/editable exclusion, normal keypress single activation, dragging state exclusion, role/label preservation on recycled nodes, and focused recycled node blur behavior.
  - Verification & Boundaries: User reported manual PASS on October 20, 2026 (specific browser coverage was not explicitly specified; testing across all three target browsers is not claimed, and screen-reader announcements or OS high-contrast themes remain explicitly unverified). Proportional automated checks verified: separate syntax checks (`node --check`), static invariant checks (`check-newtab-static.mjs`), 49 bookmark unit tests (PASS), and local unpacked builds for Chrome, Firefox, and Edge (`dist/` unpacked targets regenerated; release ZIPs preserved).
- **Backup Import Verification & UI Explanation (October 20, 2026)**:
  - Write Failure & Rejected Keys Handling: In `src/newtab/settings/backup-import.js`, storage writes now treat any reported `writeResult.rejectedKeys` as a transaction failure alongside `!writeResult.success`, immediately routing through the existing automated rollback pipeline.
  - Value-Equality Persistence Verification: In step 6 (`verify_result`), read-back verification now validates that stored values strictly match expected `deltaUpdates` values using `areValuesIdentical` rather than merely checking key existence. Legitimate normalization and schema migration ordering are preserved before commit.
  - Order-Independent Object Comparison: Resolved an import regression in `src/newtab/core/utils.js`, `src/newtab/settings/backup-import.js`, and `src/newtab/settings/diagnostic-ui.js` where `areValuesIdentical` and its fallback used `JSON.stringify`, falsely rejecting identical object settings (e.g., `wallpaperSelection`) whose keys are returned in alphabetical order by Chromium's LevelDB storage (`base::Value::Dict`) compared to schema sanitizer property order. Both `computeStorageDelta` and `verify_result` now evaluate deep recursive order-independent equality for plain objects with circular reference defense, eliminating false delta writes and false verification failures.
  - Backup UI Copy Realignment: Updated `src/new-tab.html` and `src/newtab/settings/settings-form-controller.js` to clarify that settings included in the backup overwrite current values, settings absent from the backup remain unchanged, and browser bookmarks and uploaded wallpaper/video files are excluded.
  - Automated Regression Tests: Added regression tests in `tests/unit/core-utils.test.mjs` and `tests/unit/backup-transaction.test.mjs` verifying: (1) rejectedKeys trigger rollback even when old key values already exist in storage; (2) silent write retention of incorrect values fails verification and rolls back; (3) supported normalization and schema migrations succeed without false verification failures; (4) verification failures trigger rollback to restore prior values and remove newly introduced keys; and (5) equivalent object settings with different property key ordering (e.g., Chromium sorted keys) succeed without false delta writes or verification failures.
  - Verification Status: User confirmed manual testing of the 4-step backup export, background dim modification, and JSON restoration flow passed in Edge, Chrome, and Firefox on October 20, 2026 (confirming the specific tested export → modify dim → Save → import workflow across all three target browsers, but not every possible import failure or edge case). Automated checks verified: syntax checks (`node --check`), static invariant checks (`check-newtab-static.mjs`), 46 backup/utils unit tests, and isolated reproduction against the user's backup payload with Chromium sorted keys. Unpacked targets rebuilt (`dist/chrome/`, `dist/firefox/`, `dist/edge/`); release ZIPs preserved. Automated unit tests and focused manual checks mitigate regressions in this workflow, but do not guarantee zero risk across all profile states or unexpected storage failure modes.
- **Wallpaper Playback Visibility Lifecycle (October 19, 2026)**:
  - Video Playback on Hidden Tabs: Pauses active videos immediately when `document.hidden` becomes true. Prevents calling `.play()` or crossfading when videos finish loading in a background tab.
  - Tab Return Playback Resumption: Extracted `resumeWallpaperPlaybackIfEligible()` in canonical `HomebaseWallpaperController`. Resumes live video only when eligible; keeps static wallpapers static; respects Performance Mode and Battery Saver restrictions; resets crossfade cleanly if video ended while hidden.
  - Stale Asynchronous Callback Guards: Video source loading sequence numbers, generation counters, and selection/mode guards prevent stale async callbacks from restarting a previous wallpaper or playing after switching to Performance Mode or static wallpapers.
  - Background Tab Source Preloading: Background tab video loading uses `setTimeout` instead of browser-suspended `requestAnimationFrame`, allowing videos to preload metadata while tab is hidden without playing.
  - Search Input Focus Preservation: Search-focus logic on tab return is decoupled from wallpaper playback guards, ensuring search auto-focus runs reliably on visible transitions (unless a modal is open).
  - Interrupted Crossfade Repair: Tracks pending transitions via `activeCrossfadeTransition`. If the tab is hidden while crossfade completion timer or next-video frame callback is pending, `resumeWallpaperPlaybackIfEligible()` resolves or safely resets the transition, removes stale active states, resumes the target video, and continues subsequent playback loops without timer or listener leaks.
  - Regression Test Coverage: Added 15 unit tests in `tests/unit/wallpaper-visibility-lifecycle.test.mjs` verifying static wallpaper, live video resume, loading while hidden, Performance Mode guard, Battery Saver guard, stale mode changes, stale selection changes, repeated rapid hide/show cycles, search-focus preservation, ended-video recovery, stale video-frame callbacks across hide/show cycles, interrupted crossfade completion/frame callbacks across multiple subsequent loops using controlled virtual timers, and transition ownership validation ensuring delayed callbacks from an interrupted transition cannot mutate subsequent transition timers or state.
  - Verification Status: User confirmed manual checks looked good on October 19, 2026 (specific browser/version not specified; manual testing across all three target browsers is not claimed). Automated unit tests provide isolated regression verification under controlled timers, but do not replace or fully replicate diverse real-world browser rendering engines or OS power management.
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
- **Last Updated Date**: October 20, 2026
