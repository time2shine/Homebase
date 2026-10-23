# Changelog

All notable changes to Homebase will be documented in this file.

## v1.0.6 — 2026-10-23

### Improved
- **Wallpaper Startup Performance**: Reduced dashboard startup overhead by eliminating synchronous canvas encoding (`canvas.toDataURL()`) on the main thread and deferring poster data URL encoding off-thread via `canvasToDataUrlAsync`.
- **Cached Startup Poster Reuse**: Validates existing cached wallpaper posters against target URL, encoding version, and source revision before encoding, enabling instant reuse and avoiding redundant re-encodings on startup.

### Fixed
- **Reliable Poster Updates & Forced Regeneration**: Forced wallpaper regeneration requests now reliably commit newly generated output rather than returning stale cached output. Aligned cache keys with persistent upload identifiers and source revisions, isolated authoritative extension storage from partial mirrors, supported opaque string revisions without relational numeric assumptions, and safeguarded against partial `localStorage` mirror failures.

## v1.0.5 — 2026-10-22

### Improved
- **Local & Private Address Favicon Fallback & Privacy**: Bookmark and search results with local or private network hostnames (IPv4 RFC 1918, loopback, link-local, CGNAT, test-nets, multicast/broadcast, `localhost`, `.local` mDNS, single-label intranet names, and exact IPv6 ULA/link-local boundaries) display stable letter/generic fallbacks without sending address queries to external favicon providers or returning cached placeholders. Explicit custom icons remain supported.
- **IPv6 Classification Exact Boundaries**: Validated IPv6 ULA (`0xfc00`–`0xfdff`) and link-local unicast (`0xfe80`–`0xfebf`) ranges using exact numeric boundary parsing on the first 16-bit group, preventing short-group false matches and excluding deprecated site-local addresses.

### Fixed
- **Context Menu Instant Repositioning**: Right-clicking consecutive targets across empty grid space, bookmark tiles, subfolders, and folder tabs repositions the context menu immediately without sliding or transition animations across the dashboard.
- **Offline Favicon Persistence**: Resolved persistent favicon caching failures caused by extension-scheme cache keys rejecting in browser `CacheStorage`. Favicon cache operations now use normalized HTTPS-shaped local identifiers (`https://favicons.homebase.local/`), preserving cached icons across offline reloads and restarts.

## v1.0.4 — 2026-10-21

### Improved
- **Search Suggestions & Combobox Accessibility**: Added WAI-ARIA 1.2 combobox and listbox semantics to the search bar and suggestion popup. Result items across bookmarks, history, calculator, bangs, and suggestions receive `role="option"` with monotonic IDs, synchronized `aria-activedescendant`, and focus retained in `#search-input`. Migrated result section jumping from Tab to unmodified `PageDown`/`PageUp` so `Tab` and `Shift+Tab` exit the popup normally. Protected IME composition sequences, suppressed held-Enter duplicate submissions, and hardened quick-focus guards against interactive elements.
- **Search Engine Selector Accessibility**: Added full keyboard accessibility to `#search-engine-selector` in Microsoft Edge and Mozilla Firefox. The selector container assigns `role="group"` with native buttons and roving tabindex (`tabindex="0"` on the active engine). Keyboard focus (`:focus-within`) smoothly expands the selector with high-contrast `:focus-visible` outlines. Unmodified `ArrowRight`/`ArrowLeft` and `Home`/`End` navigate engines with boundary wrapping, while modifier keys (`Alt`, `Ctrl`, `Meta`, `Shift`) pass through unintercepted, preserving global shortcuts (`Alt+Home` default reset, `Alt+ArrowUp/Down` engine cycling). Enter and Space activate the focused engine exactly once; Escape closes the selector without changing selection. Chrome distribution completely isolates and hides the selector, preserving browser-default search.
- **Bookmark & Folder Keyboard Accessibility**: Enabled keyboard navigation and activation for bookmark and folder tiles on the virtual grid. Bookmark tiles receive `role="link"` and activate on Enter with target preferences and Firefox container tab support. Folder and Back tiles receive `role="button"` and activate on Enter or Space, with held-key duplicate suppression (`e.repeat`) and scroll prevention. Added high-contrast `:focus-visible` outlines (`2px solid #2ca5ff; outline-offset: 2px`) with zero layout shift. Nested interactive controls and rename inputs are excluded, and recycled virtual DOM nodes blur safely when their identity changes under focus.
- **Settings Dialog Focus Management & Nested Isolation**: Transformed `#app-settings-dialog` into an accessible modal dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="app-settings-title"`). Implemented dynamic focus trapping for `Tab` and `Shift+Tab`, excluding hidden sections, hidden footers, and disabled controls. Saved opener elements are safely restored upon dialog closure. Nested modal dialogs (Search Engines, Animation Settings, Glass Settings, Folder Picker) isolate Escape handling, preventing premature Settings dialog closure while maintaining transactional discard on Settings Escape. Rescued focus to section navigation buttons when the active control is hidden by section switching.

### Fixed
- **Backup Import Verification & Chromium Key Ordering**: Storage writes during backup import now treat `writeResult.rejectedKeys` as transaction failures alongside write errors, immediately triggering rollback. Replaced `JSON.stringify` comparison with deep recursive order-independent equality validation in `areValuesIdentical` and `computeStorageDelta`, preventing Chromium's LevelDB storage (`base::Value::Dict` alphabetical key sorting) from triggering false delta writes or verification failures on identical object settings (e.g. `wallpaperSelection`). Clarified backup UI copy regarding what settings are restored versus excluded.

## v1.0.3 — 2026-10-20

### Improved
- **Wallpaper Tab Visibility Lifecycle**: Live video wallpapers now automatically pause playback when the document becomes hidden, conserving system resources. On returning to visibility, eligible live wallpapers resume cleanly while static wallpapers remain static and Performance Mode or battery saver restrictions are respected.
- **Interrupted Crossfade Recovery**: Tracked pending video transitions with transition ownership verification (`activeCrossfadeTransition`) and idempotent completion. If the document is hidden while a crossfade timer or frame callback is pending, returning to the tab safely resolves the interrupted transition to the target video without dual-active state, timer leaks, or listener accumulation.
- **Background Video Preloading**: Shifted background-tab video loading from browser-suspended animation frames to timer-based preloading, allowing video metadata to load while hidden without starting playback.
- **Browser-Specific Tips**: Filtered dashboard tips dynamically by target platform (`HomebaseTipsCapabilities`), ensuring Chrome, Edge, and Firefox users only receive guidance relevant to their browser's capabilities and shortcuts.
- **Performance Mode & Appearance Preservation**: Refined appearance overrides so Transparent Background and Custom Background color/opacity preferences are preserved across mode toggles. Blur effects are cleanly disabled during Performance Mode without forcing gray backgrounds.
- **Wallpaper Type Guidance**: Added accessible inline notice and "Turn off Performance Mode" action button in both Settings and Wallpaper Gallery, preventing accidental switching from Static to Live Video while Performance Mode is enabled while preserving existing selections.

### Fixed
- **Settings Persistence Serialization**: Serialized settings storage writes to prevent rapid toggling or out-of-order storage updates from overwriting restored state on Cancel or Close. Dual-synchronized fast localStorage mirror keys (`fast-performance-mode` and `fast-perf-mode`).
- **Settings Layout & Switch Sizing**: Fixed toggle switch compression by enforcing non-shrinking flex bounds (`flex: 0 0 46px`) across settings controls, allowing multiline descriptions to wrap cleanly.
- **Settings Dialog Height & Navigation Scrolling**: Enforced dialog height constraints (`min-height: min(520px, calc(100vh - 40px)); max-height: calc(100vh - 40px)`), scrollable navigation with `min-height: 0; overflow-y: auto;`, and a fixed footer ensuring Save and Cancel buttons remain visible.
- **Settings Modal Animation Hardening**: Filtered bubbled child animation events, cleaned up entrance listeners on close and before reopen, and scoped `.modal-settled:not(.closing)` so closing shrink animations always run without replaying entrance animations on mode toggle.
- **Perf Debug Overlay Layout Precedence**: Controlled overlay horizontal positioning and dock clearance via declarative CSS custom properties (`--dock-width`, `--dock-gap`), collapsing cleanly on collapsed docks without conflicting inline styles or `!important`.
- **Search Auto-Focus on Tab Return**: Decoupled tab-return search focus from wallpaper eligibility guards, ensuring the search bar autofocuses on visible transitions unless a modal dialog is open.

## v1.0.2 — 2026-10-16

### Improved
- **Bookmark Background Settings**: Split bookmark background mode into mutually exclusive **Transparent** and **Custom Background** toggles.
- **Nested Control Grouping**: Custom Background controls (color picker, opacity, and blur sliders) are now grouped in a dedicated, nested sub-settings panel that only displays when Custom Background is active.
- **Background Opacity Hint**: Corrected the opacity description label to accurately specify the slider range (10% to 100%).

### Fixed
- **Bookmark Tile Rename Layout Shift**: Fixed layout shifting and vertical displacement when renaming bookmark tiles on the grid by preserving flex container dimensions and setting clean input bounds.
- **Transparent Mode Schema Default**: Corrected `appBookmarkTextBg` schema validation definition and fallback from `true` to `false`, ensuring unconfigured profiles cleanly default to Transparent mode instead of opening Custom mode on reload.
- **Folder Edit Routing**: Enhanced bookmark context-menu folder resolution to properly support string IDs and node objects without errors.

## v1.0.1 — 2026-10-14

### Fixed
- Fixed Settings modal transactional behavior.
- Cancel and Close buttons now correctly discard unsaved changes.
- Save button now commits settings changes only when explicitly clicked.
- Fixed settings controls that previously persisted changes immediately.
- Fixed reversible live preview handling for widgets, tips, wallpaper settings, and quality settings.

## v1.0.0 — 2026-10-13
### Added
- Production Runtime Diagnostics Dashboard (`src/newtab/core/runtime-diagnostics.js`) exposing real-time health score, widget status inspection, lifecycle monitoring, and structured telemetry export.
- Advanced Performance Monitor (`HomebasePerformanceMonitor`) tracking high-resolution startup duration, idle hydration progress, per-widget initialization latency, render timing, and memory teardown events.
- Centralized Runtime Error Boundary and Diagnostics Guard (`HomebaseRuntimeGuard`) providing non-critical failure isolation, structured error capture, and a 100-entry diagnostics ring buffer.
- Canonical Widget Lifecycle Coordinator (`HomebaseWidgetLifecycle`) orchestrating registration, visibility transitions, document visibilitychange pausing, and safe teardown.
- Centralized widget state persistence layer (`HomebaseWidgetStorage`) with synchronous fast-mirror caching for sub-50ms instant first paint.

### Improved
- Complete encapsulation of all 5 dashboard widgets (`Time`, `Todo`, `Quote`, `Weather`, `News`) into canonical controllers with idempotent lifecycle methods.
- Reduced legacy global bridge surface across all widgets while maintaining full backward compatibility.
- Streamlined startup orchestrator (`new-tab.js`) and hydration task registry (`startup-hydration.js`) with structured failure isolation and latency markers.
- Expanded native automated test suite to 518 unit and integration tests with 100% pass rate.

### Fixed
- Fixed unmanaged interval leaks and ensured timer teardown on tab background and widget destruction.
- Hardened weather and news widgets with abort controller signal cleanup preventing memory leaks and orphaned network requests.

## v0.18.0 — 2026-10-11
### Added
- Dedicated cooperative Idle Task Scheduler subsystem (`src/newtab/core/idle-scheduler.js`) providing bounded 12ms slicing, unified scheduling diagnostics, and early boot registration.
- Dedicated Startup Hydration Task Registry (`src/newtab/core/startup-hydration.js`) encapsulating all widget and runtime setup tasks with error isolation and dependency injection.

### Improved
- Deconstructed monolithic `src/new-tab.js` from 1,148 lines down to a 333-line pure Startup Orchestration Coordinator (-815 lines, -71.0% reduction).
- Consolidated wallpaper startup background priming directly into `HomebaseWallpaperController`.
- Direct subsystem dispatch for bookmark tree and virtual grid operations, pruning legacy wrapper functions and dead state mirrors.
- Cleaned up redundant favicon bridge and removed obsolete declarations and comment blocks.

### Fixed
- Resolved scheduler dependency inversion by registering `HomebaseIdleScheduler` early in boot order, guaranteeing synchronous availability for downstream controllers.
- Eliminated cross-script state shadowing between `new-tab.js` and extracted bookmark/wallpaper controllers.

## v0.17.0 — 2026-10-09
### Added
- Dedicated first-party `HomebaseBookmarkDragController` subsystem (`src/newtab/bookmarks/bookmark-drag-controller.js`) orchestrating grid and tab drag-and-drop operations.
- Fine-grained drag lifecycle management, raycast pointer tracking, and folder hover layout locking.

### Improved
- Complete extraction of SortableJS grid and tab drag-and-drop ownership from the main new-tab monolith into modular controllers.
- Smooth folder tab reordering and drag visual feedback.
- Decoupled bookmark virtualizer item reordering and optimistic tree model mutations.
- Reduced `src/new-tab.js` by over 690 lines, significantly simplifying new-tab startup and maintenance.

### Fixed
- Fixed subfolder drag shadowing bug where bookmark tiles dropped into subfolder tabs or back buttons referenced stale parent nodes.
- Cleaned up obsolete drag event comments and consolidated internal drag-state verification.

## v0.16.0 — 2026-10-07
### Added
- Modular storage architecture with unified `HomebaseStorage` facade and decoupled `StorageDispatcher` event pipeline.
- Schema versioning foundation (`CURRENT_SCHEMA_VERSION = 1`) with automated migration handling and future-version safety.
- Comprehensive storage health observability engine and interactive Diagnostic HUD panel in Settings.
- Transactional settings backup import engine with atomic rollback protection, schema validation, and custom wallpaper deduplication.
- Four-stage native automated test suite with 367 unit and integration tests executing natively on `node:test`.

### Improved
- Complete decomposition of the new-tab monolith into over 25 focused first-party controllers and services under `src/newtab/`.
- Bookmark subsystem modularization covering grid reconciliation, tree traversal, root folder management, and folder picker.
- Clean separation of search interaction, engine preferences, settings management, and dashboard widgets.
- Static verification toolchain with dynamic declaration scanners to enforce script order and prevent identifier collisions.
- Wallpaper subsystem runtime modularization with dedicated asset caching, daily rotation, and video playback lifecycles.

### Fixed
- Prevented potential `<script defer>` top-level declaration collisions across extracted modules.
- Fixed bookmark title desynchronization between grid items and the bookmark editor dialog after rename actions.
- Hardened weather widget against Open-Meteo network and API errors with defensive fallback handling.
- Fixed widget ordering reference errors during instant startup and ensured synchronized layout initialization.

## v0.15.0 — 2026-09-26
### Added
- Custom wallpaper collections in "My Wallpapers" are now included in Settings backup export and restore.
- Added sanitization and deduplication for custom wallpaper metadata on import.

### Improved
- Settings modal and wallpaper gallery styling now load through dedicated first-party stylesheets.
- Search engine reordering in settings features clearer drag handles and responsive layout polish.
- Added comprehensive static verification suite to validate script load order and declaration safety.

### Fixed
- Restoring legacy backup files no longer removes existing custom wallpaper collections or todo items.
- Harmonized repository package metadata with active extension manifests.

## v0.14.0 — 2026-05-25
### Added
- Added a searchable bookmark folder picker so users can choose save destinations more easily.
- Added bookmark text background controls for color, opacity, and blur to improve label readability.

### Improved
- Long bookmark folder tab rows now scroll more smoothly and keep the active folder in view.
- Dock shortcuts, browser-store links, and settings helpers now load through focused first-party modules while preserving the existing experience.
- Startup performance reporting now captures clearer timeline and sortable setup details.

### Fixed
- Sidebar widgets now keep the saved order during preload to avoid first-load reorder flashes.

## v0.13.0 — 2026-05-24
### Added
- Added a Help & Feedback settings section with quick actions for bug reports, feature requests, changelog, rating, sharing, and privacy policy.

### Improved
- Reworked project support so users can rate, share, or send feedback from Settings.
- Rate Extension now opens the appropriate Chrome Web Store or Firefox Add-ons listing.
- Homebase Tips, app launcher, visual effects, and sidebar widgets now load through dedicated first-party new-tab modules while preserving behavior.

## v0.12.2 — 2026-05-23
### Improved
- New-tab settings, search settings, backup/import, material color picker, and performance diagnostics now load through dedicated first-party modules.
- The main new-tab script is smaller, with settings and diagnostic code separated to keep dashboard startup easier to maintain.
- Backup/import restore handling now uses stable storage-key names inside its extracted module so instant-start preference mirrors continue to refresh correctly.

## v0.12.1 — 2026-05-22
### Improved
- Wallpaper startup now reuses saved poster previews more consistently in Performance Mode.
- Video wallpaper previews now stay available sooner while heavier playback remains deferred.
- The search engine selector now keeps a tighter first-paint size during instant startup.

### Fixed
- Performance Mode no longer drops cached wallpaper poster data before the new tab can reuse it.
- Async wallpaper preload now avoids unnecessary fallback flashes when a saved poster preview is available.

## v0.12.0 — 2026-05-22
### Added
- Performance Mode now covers video wallpaper playback, grid animations, glass blur, and cinema mode from the same setting.

### Improved
- New-tab startup in Performance Mode now skips heavier wallpaper poster encoding, gallery warmup, and dynamic accent work.
- Video wallpapers now fall back to a poster or fallback image in Performance Mode instead of starting playback.
- The performance overlay and copyable report now show skipped video work and clearer startup timing.
- Performance Mode glass and dock surfaces now keep clearer contrast and borders when blur is disabled.

### Fixed
- Performance Mode no longer starts avoidable video and wallpaper work during startup.

## v0.11.3 — 2026-05-21
### Improved
- Wallpaper startup now shows saved poster previews sooner while video backgrounds finish loading in the background.
- Video wallpapers now transition more smoothly from the poster image into playback and avoid repeated crossfade setup.
- The performance overlay and copyable report now include startup timeline, script timing, and drag setup details for clearer diagnostics.

### Fixed
- Oversized saved poster previews are cleaned up before preload so wallpaper startup remains reliable.
- Startup wallpaper fallback now avoids repainting the same cached image when a safe local poster has already been applied.

## v0.11.2 — 2026-05-18
### Improved
- Dock shortcuts now include clearer accessible labels, button roles, and hidden decorative icons for assistive technologies.
- Dock and picker tooltips now appear only on their intended controls with smoother, less jumpy motion.
- The next-wallpaper dock button now exposes its loading state more clearly while a wallpaper changes.

### Fixed
- Firefox now shows shortcut guidance for browser-only dock destinations instead of trying to open unsupported internal pages.
- Dock navigation now avoids duplicate setup and has a clearer fallback if a browser page cannot be opened.

## v0.11.1 — 2026-05-16
### Improved
- Weather now restores usable cached forecasts during offline sessions, timed-out refreshes, and new-tab startup.
- Cached weather status now distinguishes offline cache from stale cached data and shows clearer updated labels.
- Wallpaper gallery loading now uses cached media manifests immediately when available and refreshes the manifest in the background.

### Fixed
- Slow or failed weather requests now time out and fall back to saved weather instead of leaving the widget stuck in an error state.
- Slow, empty, or failed gallery manifest requests now fall back to the saved gallery list when possible.

## v0.11.0 — 2026-05-15
### Added
- Added a Settings toggle to turn external search suggestions on or off while typing.

### Improved
- Search engine defaults and remembered engine choices now stay aligned when engines are reordered, disabled, or changed from another Homebase tab.
- Search startup now reuses cached selector state more smoothly and avoids unnecessary first-load animation.
- Search suggestion caching now stays bounded and clears when suggestions are disabled.
- App Settings rows now fit tighter panels more reliably without horizontal overflow.

### Fixed
- Bookmark grid arrow, page, Home, and End keys now scroll bookmarks when the search box is empty and the pointer is over the bookmark grid.
- Temporary bang searches no longer replace the active search engine after the query is cleared.

## v0.10.0 — 2026-05-13
### Added
- Performance Mode now includes a copyable, privacy-safe full performance report for startup, bookmark, widget, cache, media, and environment diagnostics.

### Improved
- The performance overlay now shows startup, bookmark, grid, widget, cache, and health status in one clearer panel.
- Bookmark and gallery fallback events are now surfaced in diagnostics so recovery issues are easier to spot.
- Weather widget styling now follows the selected glass style more cleanly.

### Fixed
- Oversized saved wallpaper poster previews are ignored during preload so the original wallpaper can keep loading reliably.

## v0.9.3 — 2026-05-11
### Improved
- Bookmark loading now reuses the saved Homebase folder subtree when possible, speeding startup for large bookmark libraries.
- Large bookmark folders now use the faster grid renderer more consistently.
- Wallpaper gallery poster caching now avoids unnecessary repeated checks until the gallery list changes or the cache check is due.
- Homebase Tips now load with the rest of the deferred new-tab scripts for smoother startup.
### Fixed
- Invalid saved weather or search startup data no longer interrupts instant widget rendering.
- Oversized saved wallpaper poster previews no longer crowd out the original wallpaper URL during startup.

## v0.9.2 — 2026-05-11
### Improved
- Todo widget actions now stay available when keyboard focus is inside the widget.
- The todo input now includes a clearer accessible label and a sensible task length limit.
- Todo updates from another Homebase tab now refresh the visible list more reliably.
### Fixed
- Todo lists with missing or duplicate task IDs now repair those IDs instead of skipping tasks.
- The completed-task filter now shows a clearer empty state when no active tasks are visible.

## v0.9.1 — 2026-05-10
### Improved
- Quote settings now use clearer rotation wording and a cleaner category picker.
- Saved quotes now load more safely during instant new-tab startup.
### Fixed
- The quote widget now falls back to a saved or built-in quote if local quote loading fails.
- Manual quote refresh and category changes no longer rely on obsolete quote cache state.

## v0.9.0 — 2026-05-09
### Added
- Added a dedicated wind metric to the weather details grid.
### Improved
- Redesigned the weather widget with a larger condition icon and compact detail cards for faster scanning.
- Weather refresh now shows a loading state and disables the refresh button until the update finishes.
- The weather setup prompt now fits the refreshed widget style and stays clearer during setup.
### Fixed
- Cached weather and load-error states now show clearer status text and recovery options.

## v0.8.1 — 2026-05-08
### Improved
- Weather pressure, humidity, cloud cover, and rain chance now use the hourly reading closest to the current weather time.
- Weather detail matching now follows the API current time instead of always reading the first hourly slot.
### Fixed
- Temporary weather refresh failures now restore the last saved forecast instead of immediately showing an error.
- Cached weather data is no longer cleared after refresh errors, helping the widget recover cleanly.

## v0.8.0 — 2026-05-06
### Added
- Folder tabs can now be renamed directly with a double-click.
### Improved
- Folder tab scroll buttons now move by a responsive distance for easier navigation through long tab rows.
- Folder rename fields now resize to the folder name and stay aligned in the tab row.
### Fixed
- The folder tab row no longer jumps back to the beginning when refreshing an active folder.
- Folder tab right-click actions now stay reliable after the tab row rebuilds.

## v0.7.2 — 2026-05-06
### Added
- None.
### Improved
- Saving a new bookmark folder now feels smoother because the tab row updates after the inline editor closes.
- The add-folder button now returns before the saved folder is added.
### Fixed
- New folders no longer appear while the creation editor is still closing.

## v0.7.1 — 2026-05-06
### Added
- None.
### Improved
- Creating bookmark folders now opens in a full-width inline editor with smoother entry and exit.
- New-folder Save and Cancel actions now use clear text labels.
- The folder editor now adapts better on small screens and reduced-motion settings.
### Fixed
- The Create New Folder tooltip now stays positioned correctly while the folder editor opens.
- Starting or closing folder creation now restores the add button cleanly.

## v0.7.0 — 2026-05-04
### Added
- Added a General setting to show or hide Homebase Tips after onboarding.
- Added a tip card action to stop showing future Homebase Tips.
### Improved
- Homebase Tips visibility now stays synced between the tip card and General settings.
### Fixed
- None.

## v0.6.1 — 2026-05-02
### Added
- None.
### Improved
- None.
### Fixed
- The About panel now falls back to the correct Homebase version when browser manifest details are unavailable.
- Welcome and Tip of the Day cards now render from the current card layout consistently.
- Static and live wallpaper switching now avoids repeated toggle handling.

## v0.6.0 — 2026-05-01
### Added
- Added a first-run Homebase welcome guide with quick shortcuts and setup ideas.
### Improved
- Tip of the Day now uses a focused built-in rotation with clear Next tip and Dismiss actions.
- The tips card has a cleaner layout, clearer buttons, and smoother show and hide motion.
### Fixed
- Tips now fit better on small screens and stay clear of the bottom controls.

## v0.5.8 — 2026-04-30
### Added
- None.
### Improved
- Firefox Container actions now have the needed access available up front for smoother bookmark opening.
- Homebase now declares its container-related access during install or update instead of prompting later.
### Fixed
- Container bookmark opens no longer fall back to a normal tab because the needed access was missing.

## v0.5.7 — 2026-04-30
### Added
- None.
### Improved
- The Quote widget now shows a valid saved quote immediately during startup.
- Homebase now skips quote data loading when the saved quote is still current.
- Saved quote indexes are reused more efficiently, reducing background quote setup work.
### Fixed
- Quote refreshes no longer run before your selected quote schedule is due.

## v0.5.6 — 2026-04-29
### Added
- None.
### Improved
- Wallpaper gallery setup now loads on demand when you open it, keeping normal new tabs lighter.
- Wallpaper type, quality, and daily rotation choices stay synced between Settings and the gallery.
- My Wallpapers previews and applies uploaded wallpapers more reliably by restoring cached posters and videos.
### Fixed
- Wallpaper gallery load failures now show a clear retry message instead of failing silently.

## v0.5.5 — 2026-04-29
### Added
- None.
### Improved
- Bookmark add, edit, folder, move, and delete tools now load only when you open them.
- New tab startup skips bookmark editor setup and saved icon lookups until bookmark tools are needed.
### Fixed
- Bookmark tool load failures now show a clear retry message instead of failing silently.

## v0.5.4 — 2026-04-29
### Added
- None.
### Improved
- Routine battery saver, weather, tab cleanup, and wallpaper messages now stay quiet during normal new tab use.
- Troubleshooting details remain available when Homebase debug or performance logging is enabled.
### Fixed
- Wallpaper cleanup no longer prints detailed background data unless troubleshooting logs are turned on.

## v0.5.3 — 2026-04-29
### Added
- None.
### Improved
- Folder icon picker loading now waits until you open the picker, keeping startup lighter.
- Optional performance logging now reports clearer startup timing details when troubleshooting slow new tab loads.
### Fixed
- Folder icon picker load failures now show a clear retry message instead of failing silently.

## v0.5.2 — 2026-03-15
### Added
- None.
### Improved
- Bookmark and folder title, icon, and color edits now refresh only the affected visible tile when possible instead of rebuilding the whole grid.
### Fixed
- Renaming a bookmark from the Rename action or Edit dialog now updates the visible tile without clearing the bookmark grid.
- Renaming a folder from the Rename action or Edit dialog now updates the visible tile without rebuilding the bookmark grid.

## v0.5.1 — 2026-03-15
### Added
- None.
### Improved
- Daily wallpaper rollover now keeps the next poster visible while the next live wallpaper loads.
### Fixed
- Daily wallpaper rotation due at startup now switches straight to the next wallpaper instead of briefly restoring the previous one.
- Startup day-rollover no longer flashes the default fallback wallpaper image before the next wallpaper poster appears.

## v0.5.0 — 2026-03-04
### Added
- Added a Homebase toolbar popup to save the current page directly into your bookmark folders.
- Added a Pro Tips section in Settings with expandable tip cards.
### Improved
- Save popup folder picking now surfaces recent folders first, supports search, and lets you create folders inline.
- Added new practical tips for bang shortcuts and saving pages from the extension icon.
### Fixed
- Save actions now block restricted browser pages and prevent duplicate bookmarks in the selected folder.

## v0.4.4 — 2026-02-11
### Added
- None.
### Improved
- Container open actions now request the cookies permission only when you choose a container.
### Fixed
- Container bookmark opens no longer fail when cookies permission is missing; they fall back to a normal tab if denied.

## v0.4.3 — 2026-02-11
### Added
- Weather setup now includes clear actions to choose a city or use your location.
### Improved
- Weather setup prompt is centered and more prominent for easier onboarding.
### Fixed
- Location permission prompts only appear after an explicit user click.

## v0.4.2 — 2026-02-04
### Added
- Added a welcome tip for first-time Homebase users.
### Improved
- Tip of the Day now animates in and out and resumes the last viewed tip for the day.
- Privacy policy clarifies search suggestion providers and what data is sent for weather and search.
### Fixed
- Context menus now stay within the viewport instead of rendering off-screen.
- Search suggestions no longer overwrite your query unless you explicitly select one.

## v0.4.1 — 2026-01-31
### Added
- None.
### Improved
- Google Apps assets are organized under a dedicated icon pack for consistent loading.
### Fixed
- Google Apps shortcuts now load icons from the new icon pack location.
- Bookmark drag-and-drop loads Sortable from the bundled assets path.

## v0.4.0 — 2026-01-30
### Added
- Added a Game Over icon to the Gaming picker.
- Added mosque, prayer, and crescent icons to the Religion category.
### Improved
- Updated shopping and finance icons, including bag, tag, store, gift, cart, bank card, and bitcoin.
- Refreshed brand logos for Apple, Android, Windows, Chrome, Twitter, and Facebook.
- Updated nature icons (dog, cat, paw, bird, fish, leaf) with consistent outlines.
- Refreshed Gaming icons (gamepad, controller, pacman, dice, puzzle) for consistency.
- Refined the Moods category by removing the Cool icon.
### Fixed
- None.

## v0.3.0 — 2026-01-30
### Added
- Tip of the Day toast with daily tips on the new tab.
- Tip actions to hide for today, preview the next tip, or disable tips.
### Improved
- Tip toast now remembers the last viewed tip for the current day.
- Tip toast layout avoids the dock and keeps actions visible within the card.
### Fixed
- None.

## v0.2.1 â€” 2026-01-30
### Added
- None.
### Improved
- News header tooltips now animate consistently while staying visible at the top of the sidebar.
### Fixed
- Dragging bookmarks with transparent icons no longer shows a fallback letter in the drag preview.
- News hover previews stay fully visible near the edges of the window.

## v0.2.0 â€” 2026-01-30
### Added
- Added a Privacy panel in Settings with an inline policy viewer toggle.
### Improved
- Settings sections now follow the order: Backup, What's New, Support, Privacy, About.
- Sort by name now keeps folders first and sorts folders and bookmarks A-Z.
### Fixed
- Bookmark grid drag is more deliberate on touch and folder clicks open reliably.

## v0.1.59 â€” 2026-01-30
### Added
- None.
### Improved
- None.
### Fixed
- Prevent long-press selection inside bookmark tiles.
- Stop bookmark icons from being draggable in the grid.
- Keep the Settings footer pinned while only the active section scrolls.

## v0.1.58 â€” 2026-01-29
### Added
- None.
### Improved
- Folder tab add controls now use clear save/cancel icons with accessible labels.
### Fixed
- Prevent duplicate folder creation by guarding modal setup and in-flight saves.
- Save/Cancel actions now run once and no longer auto-save on blur to avoid accidental folders.
- Folder dialog buttons are explicit action buttons to prevent unintended form submissions.

## v0.1.57 â€” 2026-01-29
### Added
- None.
### Improved
- Added All/Active filter buttons for the To-Do list.
- To-Do header actions now appear on hover to reduce visual clutter.
- Updated the privacy policy with clearer data handling, backups, and contact info.
### Fixed
- None.

## v0.1.56 â€” 2026-01-28
### Added
- None.
### Improved
- Widget order uses the unified sortable list for smoother drag-and-drop.
- Widget settings list styling now matches other settings toggles and drag handles.
- Drag handle icons are marked as decorative for cleaner screen reader output.
### Fixed
- None.

## v0.1.55 â€” 2026-01-24
### Added
- None.
### Improved
- What's New data, settings nav/section UI, styles, and changelog
### Fixed
- None.

## v0.1.54 â€” 2026-01-24
### Added
- Restructured Support sections and cards.
- Added QR assets.
### Improved
- Restructured Support sections.
### Fixed
- Hid Save/Cancel on backup/support/about.

## v0.1.53 â€” 2026-01-24
### Added
- Backup export/import in Settings.
- What's New panel and badge in Settings.
### Improved
- What's New loads on demand with the full release history.
- Support details and the QR preview layout are refined.
- News hover previews use a cleaner light card with clearer contrast.
### Fixed
- None.

## v0.1.52 â€” 2026-01-24
### Added
- None.
### Improved
- load whats new on demand
- refine news preview styling
### Fixed
- None.

## v0.1.51 â€” 2026-01-23
### Added
- add backup export/import
- add what's new panel and badge
### Improved
- refine support UI and qr preview
### Fixed
- None.

## v0.1.50 â€” 2026-01-21
### Added
- None.
### Improved
- slim fast-news cache payload
### Fixed
- order items before slicing

## v0.1.49 â€” 2026-01-20
### Added
- add privacy policy and accessibility labels
### Improved
- None.
### Fixed
- None.

## v0.1.48 â€” 2026-01-19
### Added
- None.
### Improved
- None.
### Fixed
- align instant render and lazy refresh
- align hover preview with tooltip animation
- defer daily rotation by calendar day

## v0.1.47 â€” 2026-01-18
### Added
- add configurable news widget
- add updated timestamp and settings button
- add refresh control and clean hover styling
### Improved
- update sources and hover preview
### Fixed
- defer daily rotation and prefer url
- contain headlines within widget
- prevent widget tooltips from clipping

## v0.1.46 â€” 2026-01-17
### Added
- None.
### Improved
- None.
### Fixed
- remove bookmark icon fade transitions
- persist icons and use xhr blob fetch

## v0.1.45 â€” 2026-01-16
### Added
- None.
### Improved
- Refactor favicon loading and fallbacks
### Fixed
- None.

## v0.1.44 â€” 2026-01-12
### Added
- None.
### Improved
- Improve sub-settings expand behavior
- Sync sidebar visibility preference early
- Sync weather and quote visibility instantly
- Speed up bookmark grid startup
- Simplify bookmark grid startup
- Align folder drag ghost sizing
- Improve folder drag-over badge
### Fixed
- Fix bookmark modal overlay click handling

## v0.1.43 â€” 2026-01-11
### Added
- None.
### Improved
- Improve bookmark icon upload sizing
### Fixed
- None.

## v0.1.42 â€” 2026-01-10
### Added
- None.
### Improved
- Optimize favicon resolution and caching
### Fixed
- None.

## v0.1.41 â€” 2026-01-08
### Added
- None.
### Improved
- Speed up background dim on startup
### Fixed
- None.

## v0.1.40 â€” 2026-01-06
### Added
- None.
### Improved
- Use bundled quotes instead of remote API
### Fixed
- None.

## v0.1.39 â€” 2026-01-05
### Added
- None.
### Improved
- Defer instant_load.js on new tab page
- Parallelize new tab initialization
- Harden startup hydration flow
### Fixed
- None.

## v0.1.38 â€” 2026-01-04
### Added
- None.
### Improved
- Throttle virtual grid updates with shared RAF scheduler
- Refine instant widget init helpers
- Optimize gallery virtual grid reuse
- Improve idle task handling and poster caching
- Lazy-load UI modules and polish settings
### Fixed
- None.

## v0.1.37 â€” 2026-01-03
### Added
- Add performance debug overlay and idle task scheduler
### Improved
- Refine bookmarks grid alignment
- Stabilize idle tasks and poster caching
- Refactor bookmark icon rendering
### Fixed
- None.

## v0.1.36 â€” 2026-01-02
### Added
- Add modal folder picker for Homebase root
### Improved
- Enhance bookmark root controls and caching
- Refine bookmark tab scrolling
- Improve folder tab drag and scroll behavior
- Unify layout vars for search and bookmarks
- Improve bookmark tab scrolling experience
- Reorder bookmark open-in-new-tab setting
- Improve weather widget refresh and caching
- Refine bookmark tab layout and quick actions
### Fixed
- Fix cursor feedback for bookmark tab dragging

## v0.1.35 â€” 2026-01-01
### Added
- Make dock add-on shortcut browser-aware
- Add Homebase bookmark root setup and empty state
### Improved
- Improve container mode settings UI
- Stop toggling container behavior row on change
- Improve performance mode handling
### Fixed
- None.

## v0.1.34 â€” 2025-12-30
### Added
- None.
### Improved
- Update dock navigation for browser-specific tabs
### Fixed
- None.

## v0.1.33 â€” 2025-12-29
### Added
- None.
### Improved
- Handle Firefox dock navigation gracefully
### Fixed
- None.

## v0.1.32 â€” 2025-12-28
### Added
- None.
### Improved
- Optimize MyWallpapers image uploads
- Prune unused gallery helpers and permissions
- Update manifest for MV3 compatibility
### Fixed
- None.

## v0.1.31 â€” 2025-12-27
### Added
- None.
### Improved
- Improve gallery wallpaper URL handling
### Fixed
- None.

## v0.1.30 â€” 2025-12-26
### Added
- Add user-controlled background dimming
- Add gallery wallpaper controls to app settings
### Improved
- Align gallery settings preview with controls
- Adjust card min height
- Refine dock glass styling
- Enhance bookmark overflow menu
### Fixed
- Fix gallery layout when switching sections
- Fix My Wallpapers preview sizing

## v0.1.29 â€” 2025-12-25
### Added
- Add gallery cleanup and virtual grid
### Improved
- Refine gallery settings toggles and behavior
- Remove gallery search UI
- Tune gallery virtualizer dimensions
### Fixed
- Fix gallery virtual scroll target

## v0.1.28 â€” 2025-12-20
### Added
- Add new glass style presets
### Improved
- Update SVG icons for Google, YouTube, and Amazon
- Animate engine icon load
### Fixed
- None.

## v0.1.27 â€” 2025-12-19
### Added
- Add 100MB cap for My Wallpapers video uploads
### Improved
- Use manifest posters for gallery apply
- Rebuild My Wallpapers subsystem
- Improve My Wallpapers previews
- Make My Wallpapers static applies immediate
- Ensure gallery static applies use data posters
- Keep My Wallpapers applies from changing type
- Improve wallpaper caching and uploads
- Enforce My Wallpapers upload limits with custom modal
### Fixed
- None.

## v0.1.26 â€” 2025-12-18
### Added
- None.
### Improved
- Align bookmark modal with folder action ring
- Restore video manifest loading
### Fixed
- Fix bookmark prompt positioning

## v0.1.25 â€” 2025-12-17
### Added
- None.
### Improved
- Use gstatic favicons and clean bookmark icons
- Extract static assets into data module
### Fixed
- None.

## v0.1.24 â€” 2025-12-16
### Added
- None.
### Improved
- Improve preload poster stability for gallery wallpapers
- Improve debounce cleanup and background styling
### Fixed
- None.

## v0.1.23 â€” 2025-12-15
### Added
- Add smart paste and sorting to blank grid menu
### Improved
- Improve paste workflow
- Delay bookmark fallback icon
### Fixed
- None.

## v0.1.22 â€” 2025-12-14
### Added
- None.
### Improved
- Optimize gallery and my wallpapers rendering
- Prevent redundant wallpaper repaint flash
- Unify folder preview structure
- Make folder icon tintable
### Fixed
- Fix virtualizer bookmark drag
- Fix wallpaper load deadlocks and storage bloat

## v0.1.21 â€” 2025-12-13
### Added
- Add first-render animation for virtualized folders
- Add grid animation toggle with configurable speed
- Add grace period to bookmark favicon fallback
- Add Cinema Mode setting and stabilize background video fades
- Add glass style configurator and unify modal buttons
- Add twitter-style heart animation to gallery favorites
### Improved
- Improve grid perf and favicon caching
- Improve bookmark grid drag handling
- Persist time format preference for instant load
- Improve video crossfade performance
### Fixed
- Fix drag virtualization guard and wallpaper caching
- Fix bookmark creation parent selection

## v0.1.20 â€” 2025-12-12
### Added
- Add battery saver preference and idle video start
- Add weather caching and adjust preload state
- Add instant loader cache TTL and weather details
- Add instant search state caching and render
- Add virtualization for bookmark grid and quote sync
### Improved
- just detele empty code
- Improve wallpaper video lifecycle
- Speed up initial widget render
- Run cached UI setup immediately
- Inline wallpaper preload for instant paint
- Refine new tab preload flow
- Expand new tab UI with gallery and bookmark tools
- Use hard cut for background video
- Animate modal overlays and popups
- Refine widget settings modals
- Enhance quote widget UX
- Inline SVG sprite for new tab icons
- Refactor quote rendering to promote/refill flow
### Fixed
- Fix performance-mode dialogs

## v0.1.19 â€” 2025-12-11
### Added
- None.
### Improved
- Improve wallpaper paint and video startup
- Refine background video crossfade startup
- Refine preload styling order
- Streamline wallpaper rendering
### Fixed
- Fix background video crossfade to remove black flash

## v0.1.18 â€” 2025-12-09
### Added
- Add rotation slider and live color preview
### Improved
- Optimize edit folder preview performance
- Refine complementary icon coloring
- Improve complementary icon contrast
- Embed folder icons with tone-on-tone styling
- Optimize edit folder modal performance
- Sync folder metadata across tabs
- Enlarge elastic slider bubble
- Use custom tooltips in builtin icon picker
- Refine edit folder sliders and tooltips
### Fixed
- None.

## v0.1.17 â€” 2025-12-08
### Added
- None.
### Improved
- Dim gooey slider labels on drag
### Fixed
- None.

## v0.1.16 â€” 2025-12-07
### Added
- None.
### Improved
- Optimize edit folder sliders and clean modal UI
### Fixed
- None.

## v0.1.15 â€” 2025-12-06
### Added
- Add folder glyph catalog to icons module
- Add folder icon scaling controls and recursive color apply
### Improved
- Refine built-in icon picker popover
- Polish icon picker interactions
- Polish picker positioning
- Increase icon picker offset
### Fixed
- Fix edit folder icon preview rendering

## v0.1.14 â€” 2025-12-03
### Added
- Add dev Firefox task and gecko id
### Improved
- None.
### Fixed
- Fix folder color refresh and slim UI elements

## v0.1.13 â€” 2025-11-29
### Added
- Add folder customization UI and metadata
### Improved
- Update bookmark fallback color default
- Adjust performance mode overlays and bookmark labels
- Align folder tabs with quick actions height
- Refine edit folder control layout
- Layer custom icons over folder SVG
### Fixed
- None.

## v0.1.12 â€” 2025-11-28
### Added
- Add hybrid color swatches for bookmark icons
- Add performance mode and pointer optimizations
- Add material color picker support for folder icons
- Add bookmark text background option
- Add adjustable bookmark label opacity and hover emphasis
- Add blur controls for bookmark labels
- Add Firefox container submenu controls and styling fixes
### Improved
- Enhance bookmark settings and visuals
- Revert bookmark color swatch picker
- Implement material color picker with dynamic animation
- Prevent selection on picker labels
- Highlight selected swatch in color picker
- Align color picker swatches with toggle styling
- Optimize material color picker delegation
- Improve bookmark text background controls
- Unify tooltip system and drop cooltipz
- Replace More Bookmarks glyph with SVG icon
- Restore settings and gallery icons
- Cleanup tabs settings and container behaviors
### Fixed
- Fix favicon flicker when rebuilding bookmarks
- Fix bookmark visibility in performance mode

## v0.1.11 â€” 2025-11-27
### Added
- Add solid custom alert modal and guard search engine toggles
### Improved
- Updated code
- Enable draggable search engine ordering and selector UX fixes
- Adjust search selector animation containment
- Refine search engine cycling helper
- Improve bang engine UI and search bar integration
### Fixed
- None.

## v0.1.10 â€” 2025-11-26
### Added
- Add search engine management modal and update search settings
- Add default search engine preference when remembering is disabled
- Sync search engine selection across tabs and add shortcuts
- Add configurable calculator and conversions in search suggestions
- Add animated calculator suggestions with dynamic theming
- Add animated sparkles and lottie icon to calculator results
- Add history toggle and speed up search results
### Improved
- Improve search selection handling
- Polish search result navigation
- Guard search input while typing
- Tighten search results panel scrolling
- Improve direct navigation handling
- Improve bang shortcuts and sync for search engines
- Use CSP-safe math evaluator for calculator
- Polish animated calculator with sparkles and lottie icon
### Fixed
- Fix calculator suggestion ordering and styling

## v0.1.9 â€” 2025-11-25
### Added
- None.
### Improved
- Ensure search navigation uses direct gestures
- Adjust search input clearing timing
### Fixed
- None.

## v0.1.8 â€” 2025-11-24
### Added
- Add gallery-style app settings modal
- Add tab management section and singleton handling
### Improved
- Hide search/location widgets until ready
- Stabilize search results rendering and navigation
- Pause background videos when tab is hidden
- Optimize grid interactions and wallpaper performance
- Set 12-hour defaults in app settings
- Improve layout when sidebar hidden
- Handle search enter via JS navigation
### Fixed
- Fix search result new-tab handling

## v0.1.7 â€” 2025-11-23
### Added
- Add interactive tag filtering to gallery
### Improved
- Align dock hover styles
- Replace tooltips with Cooltipz
- Refine wallpaper cards sizing and marquee behavior
- Fallback to default when deleting active wallpaper
- Avoid wallpaper flicker on startup
- Improve new tab preload and wallpaper startup
- Improve initial wallpaper and widget reveal
- Prevent fallback wallpaper flash
- Delay reveal until widgets hydrate
### Fixed
- None.

## v0.1.6 â€” 2025-11-22
### Added
- Add close button styling and enhance gallery settings toggle with lamp-style design
- Add loading state for next wallpaper button
- Fix gallery layout and add My Wallpapers UI
### Improved
- Enhance My Wallpapers uploads and fallback handling
- Align My Wallpapers cards with gallery and improve uploads
- Tweak My Wallpapers layout and text
- Align Apply buttons across gallery and My Wallpapers
- Tighten apply button styling
- Update My Wallpapers delete control
- Update My Wallpapers upload buttons to animated documents style
- Improve gallery poster startup loading
- Make uploaded video previews fit cards
- Improve gallery title handling and video previews
- Match My Wallpapers card corner rounding
### Fixed
- Fix wallpaper type toggle to reapply fallback wallpapers
- Fix gallery like button positioning and isolate confetti animation
- Fix live wallpaper uploads using cache key normalization

## v0.1.5 â€” 2025-11-21
### Added
- Implement daily wallpaper management and background video crossfade
- Enhance bookmark item loading state and add loading spinner
- Optimize bookmark folder movement and enhance UI responsiveness
- Update quick actions bar styles and replace text with SVG icons
- Implement gallery modal with wallpaper selection and favorites functionality
### Improved
- update body background to video with fallback, enhance dock item styles and transitions
### Fixed
- Improve daily wallpaper selection logic and ensure fallback display during cold starts

## v0.1.4 â€” 2025-11-20
### Added
- None.
### Improved
- Implement code changes to enhance functionality and improve performance
### Fixed
- None.

## v0.1.3 â€” 2025-11-18
### Added
- enhance bookmark grid with drag-and-drop functionality and improved animations
- add fade-in animation for grid items and enhance drag-and-drop visuals
- enhance drag-and-drop tab functionality with smoother animations and improved transition effects
### Improved
- update bookmark folder tab styles for improved aesthetics and hover effects
### Fixed
- update favicon size to 64px for better visibility and adjust bookmark tab overflow logic
- remove invisible characters from the beginning of new-tab.js

## v0.1.2 â€” 2025-11-17
### Added
- Add edit modal for subfolder context actions
- Add files via upload
- Add files via upload
- Add grid blank context menu and folder icon tweaks
- add overflow scroll controls to bookmark tabs
- add overflow scroll controls to bookmark tabs
### Improved
- Improve Back button drop UX
- Align search row and unify modal styles
- Replace back button emoji with SVG
### Fixed
- Fix bookmark grid alignment and layout consistency

## v0.1.1 â€” 2025-11-16
### Added
- Add move dialog for bookmarks, align modal styling, and center dropdown
- Add custom move-folder dropdown and center list
- Add bookmark edit dialog UI and polish
### Improved
- Open bookmarks/folders from context menus
### Fixed
- Resize grid rename box to fit content

## v0.1.0 â€” 2025-11-15
### Added
- Add files via upload
- Add files via upload
### Improved
- None.
### Fixed
- None.



