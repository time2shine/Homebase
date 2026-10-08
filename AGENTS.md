# Homebase AI Agent Guidelines & Codex Instructions

Homebase is a high-performance Manifest V3 new-tab dashboard extension for Chrome and Firefox.

These instructions are the source of truth for Codex, AI agents, and developers collaborating in this repository.

---

## 1. Project Overview & Primary Goals

Homebase transforms the browser new-tab experience into a fast, customizable dashboard for bookmark organization, search, weather, news, and productivity.

Primary development goals:
- **Fast new-tab loading**: Instant first paint (<50ms synchronous preload, sub-100ms ready state).
- **Reliable bookmark management**: Zero data loss, robust WebExtension tree synchronization, responsive drag-and-drop.
- **Clean modular architecture**: Single canonical owner per subsystem, decoupled services, clear domain boundaries.
- **Cross-browser compatibility**: Native dual-browser support for both Chromium (Chrome, Edge, Brave) and Gecko (Firefox).

---

## 2. Mandatory Collaboration Workflow

Every code and architectural change in this repository must strictly follow the 7-step development lifecycle:

```text
1. Audit → 2. Plan → 3. Wait for Approval → 4. Implement → 5. Verify → 6. Commit → 7. Push
```

Rules:
- **Never skip phases**: Do not implement without an approved plan; do not commit without explicit approval; do not push without commit review.
- **Audit first**: Perform a read-only audit of relevant code before drafting a plan or modifying files.
- **Document each phase**: Each development cycle phase produces a dedicated plan document (`docs/<N>-cycleX-phaseY-plan.md`) and implementation report (`docs/<N+1>-cycleX-phaseY-implementation-report.md`).
- **Wait for user approval**: Pause and present reports at commit and push boundaries.

---

## 3. Architecture Principles

### 3.1 Controller Ownership
Each functional subsystem must have **one canonical owner**. Avoid splitting ownership or creating duplicate controllers.

- **Bookmark Subsystem** (`src/newtab/bookmarks/`):
  - `HomebaseBookmarkDragController`: Owns SortableJS drag lifecycle, pointer raycasting, folder hover locking, tile/tab move dispatch.
  - `HomebaseBookmarkGridController`: Owns virtualized tile rendering, DOM layout, grid click delegation, and active folder state.
  - `HomebaseBookmarkLoader`: Owns bookmark tree fetching, root display folder resolution, and bookmark metadata loading.
  - `HomebaseBookmarkTreeService`: Owns in-memory tree traversal, node search by ID, and parent-child hierarchy.
  - `HomebaseBookmarkRootController`: Owns WebExtension `browser.bookmarks` listener integration and tree invalidation.
  - `HomebaseBookmarkTabsScroll`: Owns folder tab strip overflow calculation and smooth scrolling.
- **Wallpaper Subsystem** (`src/newtab/wallpaper/`):
  - `HomebaseWallpaperController`: Owns video and static wallpaper presentation, daily rotation, and gallery integration.
  - `HomebaseWallpaperStorage`: Owns asset caching, video blob storage, and poster data persistence.
  - `HomebaseDynamicAccent`: Owns accent color extraction and UI adaptation.
- **Core & Storage Infrastructure** (`src/newtab/core/`):
  - `HomebaseStorage`: Owns unified storage facade, schema migrations, and batch persistence.
  - `HomebaseStorageDispatcher`: Owns cross-component storage event dispatching.
  - `HomebaseContextMenuController`: Owns custom context menu actions and lifecycle.
  - `HomebaseDialogController`: Owns modal dialog presentation and focus management.
  - `HomebaseDockNavigation`: Owns dock shortcuts and responsive layouts.
- **Main New-Tab Runtime** (`src/new-tab.js`):
  - Pure **Startup Orchestrator**: Owns high-level initialization sequence (`initializePage`), ready-state class toggling, and top-level DOM lifecycle coordination.

### 3.2 Global Scope & Script Execution Model
- **Classic `<script defer>` Scripts**: Scripts execute in document order in a shared global lexical declarative environment record.
- **No ES Modules or Bundlers**: Do not convert files to ES modules (`type="module"`) or introduce build bundlers (Webpack, Vite, Rollup) unless explicitly requested.
- **Collision Invariant**: Top-level `const` or `let` declarations with identical names across deferred scripts will cause fatal browser `SyntaxError` crashes. Every extracted declaration must exist in exactly one file.

---

## 4. Repository Rules & File Boundaries

### 4.1 Protected Files
The following files are **strictly protected** and must never be modified unless explicitly instructed by the repository owner:
- `src/preload.js`
- `src/instant_load.js`
- `manifests/*` (except during authorized release version bumps)
- `dist/*` (generated build artifacts; never manually edit or stage)

### 4.2 Source Layout
```text
src/
├── new-tab.html              # Main dashboard HTML & script tag manifest
├── new-tab.css               # Core styling tokens & layout rules
├── new-tab.js                # Startup orchestrator
├── preload.js                # Synchronous head preloader (Theme & poster apply)
├── instant_load.js           # Instant synchronous cached UI hydrator
├── data.js                   # Application presets & What's New metadata
├── tips.js                   # Tips data source (HOMEBASE_TIPS)
├── assets/                   # Static icons, fallback video, vendor scripts (Sortable.min.js)
└── newtab/                   # Extracted first-party controllers & services
    ├── core/                 # Storage, dialogs, dock, context menu, utils
    ├── bookmarks/            # Grid, drag, loader, tree, scroll, styling
    ├── search/               # Search interaction, UI, storage, suggestions
    ├── settings/             # Settings UI, preferences, backup, visual effects
    ├── wallpaper/            # Wallpaper playback, caching, gallery
    ├── widgets/              # Time, weather, news, quote, todo
    ├── integrations/         # App launcher, Firefox containers
    └── tips/                 # Tips UI controller
```

### 4.3 Script Loading Rules
- New extracted scripts must be added to `src/new-tab.html` as `<script src="..." defer></script>` **before** `src/new-tab.js`.
- Dependencies must load before their dependents.
- `src/settings-ui.js` and `src/gallery-ui.js` must remain lazy-loaded on demand.
- Do not move `src/assets/js/Sortable.min.js`.

---

## 5. Verification Toolchain

Before every commit, run the mandatory verification suite:

```powershell
node --check <changed-js-files>
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build
git diff src/preload.js src/instant_load.js manifests/ dist/
```

Expected verification standards:
- **`node --check`**: Clean syntax on all modified JavaScript files.
- **`check-newtab-static.mjs`**: All 63 deferred scripts verified, zero top-level declaration collisions, script order intact.
- **`npm.cmd test`**: 100% passing across all 367 unit tests on `node:test` + headless browser smoke test.
- **`npm.cmd run build`**: Clean dual builds in `dist/chrome/` and `dist/firefox/`.
- **Protected files diff**: Empty output.

---

## 6. Windows Commands Reference

Always use Windows-compatible commands (`npm.cmd` preferred):

```powershell
npm.cmd test                 # Run 4-stage automated test suite
npm.cmd run build            # Build Chrome and Firefox outputs
npm.cmd run build:chrome     # Build Chrome distribution only
npm.cmd run build:firefox    # Build Firefox distribution only
npm.cmd run zip:chrome       # Generate Chrome ZIP archive
npm.cmd run zip:firefox      # Generate Firefox ZIP archive
```

---

## 7. Release Governance

- Follow the Release Manager process only for version publications.
- Update release metadata simultaneously in `package.json`, `manifests/manifest.chrome.json`, `manifests/manifest.firefox.json`, and `src/CHANGELOG.md`.
- Never commit or stage generated ZIP archives.
- Ensure dual browser packages pass structural validation with root-level `manifest.json`.
