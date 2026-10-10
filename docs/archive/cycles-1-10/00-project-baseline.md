Listed directory Homebase
Viewed package.json:1-13
Viewed README.md:1-65
Listed directory scripts
Listed directory manifests
Listed directory src
Listed directory newtab
Viewed build.mjs:1-150
Viewed check-newtab-static.mjs:1-100
Viewed smoke-newtab-file.mjs:1-60
Viewed manifest.chrome.json:1-58
Viewed manifest.firefox.json:1-70
Ran command: `git status; git branch -a; git log -n 5 --oneline`
Viewed .gitignore:1-32
Listed directory .vscode
Viewed tasks.json:1-175
Ran command: `Get-ChildItem -Recurse -File src | Select-Object FullName | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) }`
Viewed new-tab.html:1-100
Viewed new-tab.html:3300-3388
Searched for "gallery-ui.js"
Searched for "settings-ui.js"
Viewed action-popup.html:1-53
Viewed action-popup.js:1-60
Viewed preload.js:1-60
Viewed instant_load.js:1-60
Viewed data.js:1-60
Viewed data.js:300-355
Viewed tips.js:1-60
Ran command: `Get-ChildItem -Recurse -File src\newtab | Select-Object FullName, Length | ForEach-Object { "$($_.Length)`t$($_.FullName.Substring((Get-Location).Path.Length + 1))" }`
Ran command: `Select-String -Path src\new-tab.js -Pattern "^(?://|/\*)\s*===|^\s*function initializePage|^\s*window\.addEventListener"`
Viewed new-tab.js:1-30
Viewed new-tab.js:915-935
Viewed new-tab.js:2980-3005
Viewed new-tab.js:12500-12550
Ran command: `node --check src/new-tab.js; node scripts/check-newtab-static.mjs`
Ran command: `Test-Path dist`
Listed directory assets
Listed directory js
Searched for "bookmark-editor.js"
Searched for "icon-picker.js"
Searched for "function loadScriptOnce"
Viewed new-tab.js:480-520

# Homebase: Baseline Architecture & Project Analysis Report

As a senior engineer taking ownership of this production codebase, I have performed a comprehensive, non-destructive inspection of the repository. **No files have been modified.**

Below is the complete baseline report covering all 13 critical areas of the project.

---

### 1. Project Name and Purpose

* **Project Name**: Homebase (Package identifier: `homebase-extension`, Version: `0.14.0` in manifests, `0.8.0` in [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json)).
* **Purpose**: A dual-browser (Google Chrome & Mozilla Firefox) WebExtension that replaces the browser's default New Tab page with a fast, customizable, privacy-centric dashboard.
* **Core Capabilities**:
  * **Unified Multi-Engine Search**: Search bar supporting major engines (Google, YouTube, DuckDuckGo, Bing, Yahoo, Yandex, Amazon, Wikipedia, GitHub, Reddit), with `!<prefix>` bang shortcuts, inline math expression evaluation, and optional history-based search suggestions.
  * **Bookmark Management & Navigation**: Visual bookmark grid with tabbed folder navigation, drag-and-drop reordering, custom icons, per-folder color customization, and quick-action modals.
  * **Customizable Widgets**: Real-time weather (powered by Open-Meteo API), news feed (custom RSS parser supporting BBC, Al Jazeera, ESPN, Feedburner), interactive todo list, daily quotes, and digital/analog clock.
  * **Wallpaper & Video Backgrounds**: Curated wallpaper and video gallery with local offline caching (`Cache` API & `localStorage`) and daily rotation.
  * **Browser Integrations**: Optional Firefox Multi-Account Containers (`contextualIdentities`), Google Apps quick-launcher drawer, and clipboard "Paste to Save" bookmarking.
  * **Toolbar Companion Action**: A dedicated browser-action popup ("Save this page") to bookmark the current tab directly into configured Homebase folders without opening a new tab.
  * **Strict Privacy First**: Zero analytics, telemetry, or remote script execution. All configuration and cached data remain strictly local.

---

### 2. Technology Stack

* **Platform / Architecture**: WebExtensions API (Manifest V3), dual-targeted for Chromium-based browsers (Chrome, Edge, Brave) and Gecko (Firefox).
* **Script Execution Model**: Classic deferred script loading (`<script defer>`) relying on global namespace coordination; **no ES module conversion (`type="module"`)** and **no JavaScript bundler**.
* **Frontend Languages**:
  * **JavaScript**: Modern Vanilla ECMAScript (ES2022+ features: optional chaining, nullish coalescing, async/await, modern DOM APIs).
  * **HTML**: HTML5 semantic markup with inline SVG `<symbol>` sprite sheets.
  * **CSS**: Vanilla CSS3 utilizing CSS Custom Properties (CSS variables), CSS Grid, Flexbox, glassmorphism filters (`backdrop-filter`), and CSS animations.
* **Node.js Tooling**: Built entirely with Node.js built-in modules (`node:fs`, `node:path`, `node:url`, `node:zlib`, `node:http`, `node:net`, `node:child_process`).

---

### 3. Frameworks and Libraries Used

* **UI Frameworks**: **None**. Zero external UI frameworks (no React, Vue, Svelte, or Angular). All DOM rendering, state updates, and event listeners use native browser APIs.
* **CSS Frameworks**: **None**. Zero utility or preprocessed CSS frameworks (no Tailwind CSS, Sass, or Less).
* **Third-Party / Vendor Libraries**:
  * [Sortable.min.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js): Vendor minified drag-and-drop library (v1.15.x) loaded deferred for bookmark grid and tab reordering.
  * [material-color-picker.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/material-color-picker.js): Custom vanilla color picker component.
* **NPM Dependencies**: **Zero runtime and zero dev dependencies** (`dependencies: {}`, `devDependencies: {}` in [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json)). Build scripts and ZIP compression are hand-crafted without external npm packages.

---

### 4. Folder Structure Explanation

```text
Homebase/
├── .git/                               # Git version control metadata
├── .gitignore                          # Excludes dist/, build/, *.zip, local logs
├── .vscode/
│   └── tasks.json                      # VS Code build, packaging, and web-ext tasks
├── AGENTS.md                           # Strict AI engineering constraints & rules
├── README.md                           # Public repository overview and store links
├── package.json                        # NPM script aliases (build, build:chrome, etc.)
├── manifests/
│   ├── manifest.chrome.json            # Manifest V3 configuration for Chrome/Chromium
│   └── manifest.firefox.json           # Manifest V3 configuration for Firefox
├── scripts/
│   ├── build.mjs                       # Zero-dependency build & zip distribution compiler
│   ├── check-newtab-static.mjs         # Static analyzer validating script order & duplicates
│   └── smoke-newtab-file.mjs           # Headless browser CDP test harness
└── src/                                # Primary extension source code
    ├── action-popup/                   # Toolbar popup ("Save this page")
    │   ├── action-popup.html
    │   ├── action-popup.css
    │   └── action-popup.js
    ├── assets/                         # Static fallback media, bundled quotes, vendor scripts
    │   ├── fallback.mp4                # Default background video
    │   ├── fallback.webp               # Default background image
    │   ├── quotes.json                 # Preloaded quotes database
    │   └── js/
    │       ├── Sortable.min.js         # Minified drag-and-drop vendor script
    │       ├── bookmark-editor.js      # Lazy-loaded bookmark modal editor
    │       └── icon-picker.js          # Lazy-loaded icon picker component
    ├── icons/                          # Extension icons (16, 32, 48, 128 px) and Google SVG/PNGs
    ├── newtab/                         # Extracted domain modules
    │   ├── bookmarks/                  # Bookmark tabs, styles, reorder, quick actions
    │   ├── core/                       # Perf tracking, dialogs, utils, tab lifecycle, dock
    │   ├── integrations/               # App launcher drawer & Firefox Containers
    │   ├── search/                     # Search utils & suggestion cache
    │   ├── settings/                   # Preferences, color picker, backup/import, settings UI
    │   ├── styles/                     # gallery.css & settings.css
    │   ├── tips/                       # Tips UI presenter
    │   ├── wallpaper/                  # Dynamic color accent & lazy-loaded gallery UI
    │   └── widgets/                    # Time, todo, quote, weather, news, widget visibility
    ├── CHANGELOG.md                    # Release history documentation
    ├── PRIVACY.md                      # Privacy policy
    ├── data.js                         # Static engine lists, animations, and color helpers
    ├── instant_load.js                 # Early body script for immediate clock/quote/weather hydration
    ├── new-tab.css                     # Primary dashboard styling (~155 KB)
    ├── new-tab.html                    # Root dashboard HTML entry point
    ├── new-tab.js                      # Central coordinator & orchestrator (~13,000 lines)
    ├── preload.js                      # Synchronous <head> script preventing visual flicker (FOUC)
    └── tips.js                         # Static tip database (window.HOMEBASE_TIPS)
```

---

### 5. Important Files and Their Responsibilities

| File Path | Responsibility |
| :--- | :--- |
| [new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) | Root dashboard DOM structure, SVG sprite sheets, widget placeholders, modals, and the exact deferred script loading sequence. |
| [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | Central controller (~13k lines). Coordinates page startup (`initializePage`), bookmark grid rendering, context menus, live search, wallpaper playback, and favicon caching. |
| [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js) | Synchronous script in `<head>` executed before HTML parsing/rendering. Reads `localStorage` to apply initial wallpaper posters, performance flags, and theme classes to prevent FOUC (flash of unstyled content). |
| [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) | Synchronous top-of-body script that hydrates cached clock, weather, and quotes immediately from `localStorage` before deferred scripts finish executing. |
| [data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) | Defines static datasets: CSS keyframes for grid animations (`GRID_ANIMATIONS`), default search providers, and RGB/HSL conversion utilities. |
| [tips.js](file:///c:/Users/Administrator/Desktop/Homebase/src/tips.js) | Single source of truth for dashboard tip definitions (`window.HOMEBASE_TIPS`). |
| [newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) | Lazy-loaded settings panel module (~58 KB) loaded on-demand via `loadScriptOnce` when the user clicks the Settings cog. |
| [newtab/wallpaper/gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | Lazy-loaded gallery modal (~108 KB) loaded on-demand for browsing, searching, and caching wallpapers and videos. |
| [action-popup/action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js) | Standalone script for the extension action button popup. Interacts with `chrome.bookmarks` and `chrome.tabs` to bookmark active pages into configured folders. |
| [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs) | Custom build orchestrator that validates Chrome manifests, copies `src/` to `dist/`, and uses `node:zlib` to generate release ZIPs. |
| [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) | Integrity validator ensuring all deferred scripts exist, paths are valid, and no global functions/variables are duplicated across modular files and `new-tab.js`. |
| [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) | High-priority project governance guide detailing architectural constraints, high-risk code boundaries, Windows command requirements, and test requirements. |

---

### 6. Entry Points

1. **New Tab Dashboard (Primary Entry Point)**:
   * **Manifest Mapping**: Defined under `chrome_url_overrides.newtab = "new-tab.html"`.
   * **HTML Entry**: [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html).
   * **Synchronous Head Script**: [src/preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js).
   * **Early Body Script**: [src/instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js).
   * **Deferred Modular Scripts**: 35+ domain scripts loaded under [src/newtab/](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab).
   * **Runtime Main Driver**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) ending with `initializePage()`.
2. **Action Toolbar Popup**:
   * **Manifest Mapping**: Defined under `action.default_popup = "action-popup/action-popup.html"`.
   * **HTML Entry**: [src/action-popup/action-popup.html](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.html).
   * **JS Driver**: [src/action-popup/action-popup.js](file:///c:/Users/Administrator/Desktop/Homebase/src/action-popup/action-popup.js).
3. **Dynamic / Lazy-Loaded Entry Points** (loaded on-demand via `loadScriptOnce`):
   * Settings UI: `newtab/settings/settings-ui.js`
   * Wallpaper Gallery UI: `newtab/wallpaper/gallery-ui.js`
   * Bookmark Editor Modal: `assets/js/bookmark-editor.js`
   * Icon Picker Modal: `assets/js/icon-picker.js`

---

### 7. Build Process

The project relies on a zero-dependency ES module build runner in [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs).

* **Compilation / Transpilation**: None. Files are copied directly from `src/` to `dist/<target>/`.
* **Manifest Injection**:
  * Chrome: Copies [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json) to `dist/chrome/manifest.json`. Runs `validateChromeManifest()` to ensure Firefox-only keys (`browser_specific_settings` and `contextualIdentities`) are absent.
  * Firefox: Copies [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json) to `dist/firefox/manifest.json`.
* **Packaging / ZIP Generation**:
  * Invoked via `npm.cmd run zip:chrome` or `npm.cmd run zip:firefox`.
  * Recursively collects all files in `dist/<target>/`, calculates standard CRC32 checksums, applies raw DEFLATE compression via `deflateRawSync` (`node:zlib`), and writes standard ZIP headers directly to `dist/homebase-<target>-<version>.zip` without third-party tooling.

---

### 8. Development Environment Setup

* **Prerequisites**:
  * **Node.js**: v18.0.0+ (supports `node:*` specifiers and global `WebSocket` for CDP smoke tests).
  * **OS / Shell**: Windows 11/10 with PowerShell 7 (`pwsh`) or Command Prompt.
  * **Command Convention**: Per [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), always prefer `npm.cmd` over `npm` on Windows.
  * **Browsers**: Google Chrome or Microsoft Edge (Chromium) and Mozilla Firefox (v142.0+).
* **Setup Instructions**:
  1. Clone repository to local workstation.
  2. No `npm install` is required (no `node_modules` are used).
  3. Validate Node environment and static checks:
     ```powershell
     node scripts/check-newtab-static.mjs
     ```

---

### 9. How to Run This Project Locally

#### For Google Chrome / Brave / Microsoft Edge
1. Build the Chrome distribution:
   ```powershell
   npm.cmd run build:chrome
   ```
2. Navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Turn on the **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the folder: `c:\Users\Administrator\Desktop\Homebase\dist\chrome`.
6. Open a new tab (`Ctrl + T`) to launch Homebase.

#### For Mozilla Firefox
1. Build the Firefox distribution:
   ```powershell
   npm.cmd run build:firefox
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `c:\Users\Administrator\Desktop\Homebase\dist\firefox\manifest.json`.
5. Open a new tab (`Ctrl + T`) to launch Homebase.
*(Alternative via VS Code task / web-ext)*: Run the `"Run Homebase (Dev Profile)"` task or execute:
```powershell
npx web-ext run --source-dir dist/firefox
```

---

### 10. How to Test This Project

A rigorous multi-tiered verification pipeline is enforced:

1. **Syntax Check**:
   Validate modified JavaScript files with Node's native syntax checker:
   ```powershell
   node --check <changed-js-file>
   ```
2. **Static Integrity Check**:
   Verify script ordering, declaration uniqueness, and module file existence:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
3. **Automated Headless CDP Smoke Test**:
   Spins up an in-memory HTTP server and launches headless Chrome/Edge via Chrome DevTools Protocol to verify runtime errors and widget initialization:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
   *(Rule: Debugging this harness is capped at 10–15 minutes per AGENTS.md).*
4. **Build Target Check**:
   ```powershell
   npm.cmd run build:chrome
   npm.cmd run build:firefox
   ```
5. **Mandatory Manual Testing**:
   Automated CDP tests run outside extension context and cannot mock all native browser APIs. Manual verification in Chrome and Firefox is required for:
   * `browser.bookmarks` / `chrome.bookmarks` CRUD and folder navigation.
   * `browser.contextualIdentities` (Firefox Multi-Account Containers).
   * Extension storage persistence across browser restarts.
   * Wallpaper/video caching and playback.
   * Action popup ("Save this page") functionality.

---

### 11. Current Git Structure

* **Active Branch**: `development`
* **Working Tree**: Completely clean (`nothing to commit, working tree clean`).
* **Branch Landscape**:
  * Local: `development`, `main`
  * Remote tracking: `origin/development`, `origin/main` (`HEAD -> origin/main`)
* **Recent Commit History**:
  * `fe88eb8`: Add styles for settings modal and related components
  * `612dcba`: Refactor code structure for improved readability and maintainability
  * `df4d62e`: feat(release): prepare v0.14.0
  * `9dd6395`: Refactor widget order handling and improve performance
  * `a49d50a`: feat: add folder picker functionality and startup performance tracking
* **Workflow Insights**: Feature work, component extractions, and refactorings occur on `development`. Release preparation commits (`feat(release): prepare v0.14.0`) merge into `main`.

---

### 12. Important Configuration Files

* [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json): Defines permissions (`tabs`, `cookies`, `storage`, `history`, `bookmarks`, `clipboardRead`), host permissions, action popup, and `chrome_url_overrides`.
* [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json): Same permissions as Chrome plus `contextualIdentities` and `browser_specific_settings.gecko` (`id: "rokonmagura@gmail.com"`, `strict_min_version: "142.0"`).
* [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json): Defines build and package scripts.
* [.vscode/tasks.json](file:///c:/Users/Administrator/Desktop/Homebase/.vscode/tasks.json): Preconfigured VS Code tasks for building, creating backup ZIPs, and launching Firefox with specific developer profiles.
* [.gitignore](file:///c:/Users/Administrator/Desktop/Homebase/.gitignore): Ensures generated builds (`dist/`, `build/`, `*.zip`, `web-ext-artifacts/`) and local IDE configs are excluded from git.
* [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md): Governs architectural rules, non-negotiable coding conventions, and extraction workflows.

---

### 13. Files and Areas That Should NOT Be Modified Casually

The following critical areas have been flagged as high-risk in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and through architectural analysis:

1. **`initializePage` and Startup Orchestration** ([src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L12502)):
   * Houses the delicate initialization order: storage hydration, DOM binding, widget scheduler, and performance marks. Must not be refactored or extracted without explicit mandate.
2. **Idle Scheduler (`scheduleIdleTask`)** ([src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)):
   * Batches deferred widget and UI tasks using `requestIdleCallback` to protect First Contentful Paint.
3. **[src/preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js)**:
   * Runs synchronously in `<head>`. Introducing asynchronous calls, modules, or extra execution overhead will immediately cause visual flashes (FOUC) and startup regressions.
4. **Script Loading Order in [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html#L3314-L3385)**:
   * Because modules rely on classic `<script defer>` globals, modifying the load order will cause `ReferenceError` crashes during initialization.
5. **Bookmark Grid, Reordering, and Tab Management**:
   * Coordinates live browser bookmarks, drag-and-drop animations, folder navigation, and folder picker modals.
6. **Favicon Multi-Tier Cache Pipeline**:
   * Uses in-memory caching (`faviconResolvedCache`), negative failure caching (`faviconNegativeCache`), and Cache API storage (`favicons-v1`) to prevent rate-limiting and UI stuttering.
7. **Wallpaper & Video Cache Pipeline**:
   * Handles daily rotation, video playback, poster caching, and fallback transitions.
8. **Live Search & Engine Suggestions**:
   * Manages debouncing, abort controllers, keyboard navigation, and bang-engine dispatch.
9. **Firefox Containers Integration** ([src/newtab/integrations/firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js)):
   * Direct integration with `browser.contextualIdentities`. Chrome lacks this API; touching permissions or code without multi-browser isolation will break the Chrome build.
10. **Vendor and Lazy-Loaded Scripts**:
    * [src/assets/js/Sortable.min.js](file:///c:/Users/Administrator/Desktop/Homebase/src/assets/js/Sortable.min.js) must remain untouched in its location.
    * `settings-ui.js`, `gallery-ui.js`, `bookmark-editor.js`, and `icon-picker.js` must remain strictly lazy-loaded on demand.
11. **Generated Files**:
    * Never edit anything inside `dist/` or commit generated `.zip` files.

---

### Standing by for Instructions

The baseline analysis is complete, all static tests pass, and no files have been altered. 

Please let me know how you would like to proceed or what changes you want to plan next.