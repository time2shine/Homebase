# Changelog

All notable changes to Homebase will be documented in this file.

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



