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

## 2. Collaboration Workflow & Tiered Task Sizing

All engineering activity follows the working agreements detailed in [`docs/development-workflow.md`](docs/development-workflow.md).

Work is scoped into three tiers:
- **Tier A (Small Visual Fix)**: Relevant inspection → minimal patch → focused visual verification → diff review → authorized commit. No separate audit/plan docs by default. No new automated tests by default; add one only when it addresses a concrete regression risk.
- **Tier B (Feature / Behaviour Change)**: Brief acceptance criteria → dependency inspection → implementation → focused verification → review package → authorized commit.
- **Tier C (High-Risk & Structural Changes)**: Dedicated written audit and plan (`docs/`) → user approval → small implementation steps → failure/recovery verification → review → authorized commit.

Core Workflow Rules:
- **Authorization Boundary**: Antigravity never runs `git commit` or `git push` without explicit user authorization.
- **Autonomous Task Execution**: Within an authorized task, proportional automated checks (syntax checks, static checks, unit tests, local builds) may be run directly by the agent without pausing for permission at every command.
- **Audit First**: Perform a read-only audit of relevant active code before modifying files.
- **Preserve Unrelated Edits**: Never restore whole files or discard unowned changes to simplify a patch.
- **No Speculative Refactoring**: Identify the concrete issue and demonstrable benefit before restructuring code.
- **Independent Action Boundaries**: Testing, building, committing, pushing, and publishing releases are separate actions. Follow the scope explicitly requested by the user.

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

### 4.1 Protected Files & Boundaries
- **Protected source files** (`src/preload.js`, `src/instant_load.js`): Require explicit authorization to modify; authorization is not limited to release tasks.
- **Manifests** (`manifests/*`): Version and configuration changes follow the release workflow.
- **Generated build outputs** (`dist/*`): Existing build scripts may regenerate `dist/` during authorized development and verification tasks. Never manually edit or stage generated `dist/` files.

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

Verification is proportional to task scope and risk, as specified in [`docs/development-workflow.md`](docs/development-workflow.md):
- **Syntax Checks**: Run `node --check` separately for each modified JavaScript file.
- **Static Invariant Checks**: Run `node scripts/check-newtab-static.mjs` whenever deferred scripts, script loading order, or top-level declarations are touched.
- **Unit & Smoke Tests**: Run focused tests for affected subsystems, or `npm.cmd test` for the full 4-stage pipeline during Tier C changes, release prep, or when requested. Report test outcomes accurately using `PASS`, `FAIL`, `SKIP`, or `NOT RUN`.
- **Build Checks**: Run `npm.cmd run build` to verify dual-browser packaging (`dist/chrome/` and `dist/firefox/`).
- **Protected Files Guard**: Ensure protected source files (`src/preload.js`, `src/instant_load.js`) contain no unauthorized changes (modification requires explicit authorization, not limited to release tasks). Manifest version changes follow the release workflow. Existing build scripts may regenerate `dist/` during authorized development and verification tasks; never manually edit or stage generated `dist/` files.

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

---

## 8. AI Handoff Protocol

### Purpose
Make every Antigravity task easy to review by ChatGPT. After completing work or stopping on a blocker/partial state, always provide a clean copy-ready summary at the end of the response.

### Protocol Requirements
Every completed, blocked, or partially completed task that changes repository state must include a final section:

# ChatGPT Review Package

Use this structured format:

```markdown
# ChatGPT Review Package

## Task Completed & Acceptance Criteria
- Objective: [1-2 sentence summary of task]
- Status: [COMPLETE / PARTIAL / BLOCKED]
- Criteria Met: [List of satisfied criteria]
- Criteria Pending / Blocked: [List of unfulfilled criteria or blockers, if any]

## Files Changed
- File: [path]
  - Change: [What was changed]
  - Purpose: [Why it was changed]

## Diff Summary
[Paste actual diff if short (< 50 lines), or provide git diff command to view]

## Verification
- Syntax Checks (`node --check`): [PASS / FAIL / SKIP / NOT RUN]
- Static Invariant Checks: [PASS / FAIL / SKIP / NOT RUN]
- Unit Tests: [PASS (X/Y) / FAIL / SKIP / NOT RUN]
- Build (`npm.cmd run build`): [PASS / FAIL / SKIP / NOT RUN]
- Visual / Manual Checks: [Observed results or EXPLICITLY UNVERIFIED]

## Unverified Behaviour & Known Risks
- Unverified: [What was not directly tested]
- Risks: [Potential edge cases or browser quirks]

## Git Status
- Branch: [branch]
- Latest Commit: [short hash and message]
- Pending Working Tree Changes: [List of modified and untracked files]
- Commit / Push: [None — awaiting authorization]

## Next Recommended Action
[What ChatGPT or the User should review, approve, or do next]
```

### Rules
- Create this section upon task completion, blockage, or partial completion.
- Keep it concise and preserve critical technical details.
- Clearly distinguish observed outcomes from assumptions.
- Update the "Current Handoff" in `PROJECT_CONTEXT.md` whenever a task completes or direction changes.

---

## 9. New-Session Reading Order

When starting a new session or repository modification task, read files in this strict sequence:
1. [`AGENTS.md`](AGENTS.md) — Core principles, repository rules, and verification standards.
2. [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — System mission, architecture, and current handoff state.
3. [`docs/development-workflow.md`](docs/development-workflow.md) — Roles, tiered task sizing, execution rules, and review protocols.
4. **Documentation relevant to the current task only** (e.g., active cycle plan or subsystem ADR).

Do not require every new session to read all historical documents.



