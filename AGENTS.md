# Homebase Codex Instructions

Homebase is a dual-browser new-tab dashboard extension for Chrome and Firefox.

These instructions are for Codex and AI coding agents working in this repository.

## Project rules

- Keep the extension compatible with both Chrome and Firefox.
- Keep scripts as classic `<script defer>` files.
- Do not convert files to ES modules.
- Do not introduce a bundler unless explicitly requested.
- Do not add new dependencies unless explicitly requested.
- Do not run broad formatters.
- Do not refactor unrelated code.
- Do not rename functions, variables, storage keys, DOM IDs, or CSS classes unless explicitly requested.
- Do not change function signatures unless explicitly requested.
- Do not change extension permissions unless explicitly requested.
- Do not edit generated files in `dist/`.
- Do not commit generated ZIP files.
- Do not edit files in `node_modules/`.

## Windows commands

On Windows, prefer `npm.cmd` over `npm`.

Use:

```powershell
npm.cmd run build
npm.cmd run build:chrome
npm.cmd run zip:chrome
npm.cmd run zip:firefox
```

Only fall back to `npm` if `npm.cmd` is unavailable.

## Source layout

Main source lives in:

```text
src/
```

Browser-specific manifests live in:

```text
manifests/manifest.chrome.json
manifests/manifest.firefox.json
```

Generated browser outputs live in:

```text
dist/chrome/
dist/firefox/
```

Extracted new-tab modules live in:

```text
src/newtab/
```

Current module folders:

```text
src/newtab/core/
src/newtab/settings/
src/newtab/tips/
src/newtab/widgets/
src/newtab/integrations/
src/newtab/search/
src/newtab/bookmarks/
src/newtab/wallpaper/
```

Keep first-party Homebase modules under `src/newtab/`.

Keep vendor or legacy asset scripts under:

```text
src/assets/js/
```

Do not move `src/assets/js/Sortable.min.js` unless explicitly requested.

## Script loading rules

- Preserve script order unless the task requires a specific dependency order change.
- New extracted files must load before `src/new-tab.js`.
- If an extracted file provides globals used by another extracted file, load the provider first.
- Keep `src/settings-ui.js` lazy-loaded unless explicitly requested.
- Keep `src/gallery-ui.js` lazy-loaded unless explicitly requested.
- Keep `src/tips.js` as the data source for `window.HOMEBASE_TIPS`; do not replace it with `homebase-tips-ui.js`.

## Extraction rules

For code extraction tasks:

- Move only the requested cohesive block.
- Do not change behavior.
- Do not refactor while moving.
- Do not rename functions.
- Do not change function signatures.
- Do not convert to modules.
- Do not wrap extracted code in an IIFE unless explicitly requested.
- Do not move unrelated helpers.
- Do not move startup wrappers unless explicitly requested.
- Leave `initializePage` in `src/new-tab.js` unless explicitly requested.
- Leave startup orchestration in `src/new-tab.js` unless explicitly requested.
- Leave idle scheduler logic in `src/new-tab.js` unless explicitly requested.
- Avoid moving bookmark, wallpaper/video, live search, or startup code unless the prompt explicitly asks for it.
- For small extraction tasks, prefer path-only or move-only changes and avoid improving code during the move.
- If a requested extraction reveals unrelated bugs, report them separately instead of fixing them unless explicitly asked.

When extracting a function used by another extracted module, update script order so the dependency loads first.

## Current high-risk areas

Treat these as high-risk. Do not edit unless explicitly requested:

```text
initializePage
startup orchestration
idle scheduler
bookmark grid/rendering/tabs
drag and reorder behavior
wallpaper/video/cache/startup path
live search input and keyboard behavior
search suggestions async/cancellation behavior
Firefox container bookmark opening
favicon resolution/cache pipeline
```

## Testing rules

For normal edits, run:

```powershell
node --check <changed-js-file>
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd run build:chrome
```

For extraction tasks, also verify:

- moved functions exist exactly once
- no duplicate declarations remain
- old paths are no longer referenced
- new script order is correct
- browser console has no `ReferenceError` if a browser harness is used

For small extractions, do not run full release builds or ZIP packaging unless explicitly requested.

## Chrome/CDP harness limit

Use the Chrome/CDP harness for a fast verification pass when useful, but do not spend unlimited time debugging the harness.

For small extractions or settings/widget changes:

- Try the harness once.
- If the mock/browser setup fails, try one fix.
- Do not spend more than about 10–15 minutes debugging the harness.

If the harness still fails, stop harness debugging and continue with:

```text
1. node --check on changed JS files
2. npm.cmd run build:chrome
3. static verification that moved functions exist exactly once
4. static verification that no duplicate declarations remain
5. clear note that manual Firefox testing is required
```

Only spend more harness time for high-risk tasks such as bookmarks, wallpaper/video, live search, or startup orchestration.

## Manual Firefox testing

For extension behavior, automated Chrome/CDP checks are not final proof.

Always tell the user when manual Firefox testing is required for:

```text
browser.* APIs
bookmarks
storage persistence
new-tab startup behavior
wallpaper/video behavior
Firefox containers
settings persistence
network/cache widgets
```

## Codex prompt generation rules

When the user asks for a "Codex prompt", "VS Code Codex prompt", "implementation prompt", or "give me prompt", generate a strict implementation prompt for Codex.

The generated prompt must be written for VS Code Codex working inside this Homebase repository and must include:

```text
Task:
ADD:
REMOVE:
MODIFY:
DO NOT MODIFY:
Goal:
Move / Change:
Important:
Script order:
Testing limit:
After editing, verify:
Post-edit verification report required:
```

If a section does not apply, write `None`.

Every generated Codex prompt must:

- say `Follow AGENTS.md.`
- specify exact file paths and function names when known
- explicitly list what must not be edited
- prevent unrelated refactors, broad formatting, scope creep, ES modules, bundlers, and new dependencies
- require cleanup of duplicate, dead, stale, or redundant logic directly related to the requested change
- require `node --check` on changed JS files
- require `npm.cmd run build:chrome`
- include the Chrome/CDP harness time cap from this file
- require manual Firefox testing notes when browser APIs, storage, bookmarks, settings persistence, network/cache widgets, wallpaper/video, or Firefox containers are involved
- require a post-edit verification report with files changed, functions modified, variables changed, full final code blocks for modified functions, explanation, verification, build result, unverified items, and confirmation unrelated areas were not changed

For Homebase extraction prompts, also include the target file under `src/newtab/`, exact functions/constants to move, script-order dependencies, high-risk "do not move" areas, and confirmation that startup wrappers stay in `src/new-tab.js` unless explicitly requested.

For Homebase release prompts, do not use the short implementation prompt style. Use the full release-manager prompt.

## Post-edit report rules

After every code edit, report:

```text
Files changed
Functions moved/modified
Variables/constants moved/added/removed
Functions intentionally left in place
Globals/dependencies used by new files
Verification performed
Build result
Anything not verified
```

For modified functions, include final function signatures. For large functions, do not paste the whole function unless explicitly requested.

## Git rules

- Do not commit unless explicitly asked.
- Do not stage generated files, `dist/`, or generated ZIP files.
- Prefer small commits after each successful extraction.
- Use clear commit messages such as `Extract weather widget` or `Refresh feedback settings`.

## Release rules

Use the full release-manager prompt only for actual releases.

During release prep:

- Edit only release metadata files unless pre-existing source/UI changes are approved.
- Do not edit source/UI files during release prep.
- Do not create separate feature and release commits if the release prompt requests one combined commit.
- Do not invent release notes.
- Do not claim build, push, ZIP, or GitHub release success unless it actually happened.

## Homebase Project Continuity Guide

### Owner Development Workflow

The preferred and mandatory workflow for all AI agents working on Homebase is:

```text
Audit → Plan → Implement → Verify → Report → Approval → Commit → Approval → Push
```

Rules:
- Always audit before coding.
- Create a plan document before implementation.
- Make isolated changes only.
- Do not commit automatically.
- Do not push automatically.
- Wait for owner approval at commit and push stages.
- Do not continue to the next phase without approval.

### Improvement Cycle Structure

Cycle format:

```text
Cycle X
 ├── Audit
 ├── Phase Plan
 ├── Implementation
 ├── Verification
 ├── Commit
 ├── Push
 └── Next Phase
```

Each phase should have:
- Plan document (`docs/<N>-cycleX-phaseY-plan.md`)
- Implementation (isolated module under `src/newtab/` and lightweight wrappers in `src/new-tab.js`)
- Verification report (`docs/<N+1>-cycleX-phaseY-implementation-report.md`)
- Commit summary (after explicit approval)

### Extraction Architecture Rules

`src/new-tab.js` is the legacy monolith.

Future extraction should move responsibilities into:

```text
src/newtab/
 ├── core/
 ├── search/
 ├── wallpaper/
 ├── bookmarks/
 └── settings/
```

New modules should:
- Own implementation
- Expose `window.Homebase<Name>Controller` or `window.Homebase<Name>Service`
- Maintain backward compatibility

`src/new-tab.js` should keep:
- Startup orchestration
- Compatibility wrappers
- Integration points

Avoid:
- Unrelated refactoring
- Behavior changes during extraction
- Breaking existing callers

### Verification Rules

Before every commit run:

```powershell
node --check <changed files>
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```

Protected files:
- `src/preload.js`
- `src/instant_load.js`
- `manifests/*`
- `dist/*`

must remain untouched unless explicitly approved.

### Manual Browser Verification Decision Process

Do not request manual browser testing after every implementation.

Before requesting manual testing, analyze risk.

Manual browser verification is required when changes affect:
- browser extension APIs
- Firefox-specific APIs
- Chrome/Firefox permissions
- browser storage persistence
- bookmarks API
- context menus
- Cache Storage API
- video/media playback
- real DOM interactions
- startup loading sequence
- features difficult to simulate automatically

If manual testing is required, report:
1. Why manual testing is needed.
2. When it should happen:
   - before commit
   - after commit
   - before push
   - before release
3. Provide checklist:

Chrome:
- reload extension
- open new tab
- test affected feature
- check console

Firefox:
- reload extension
- test Firefox-specific behavior
- check console

Expected behavior:
- describe expected result

Console:
- mention errors/warnings to watch.

If manual testing is not required, explicitly state:
"Manual browser verification is not required for this phase because the changes are isolated and covered by automated validation."

### Freeze / Regression Debugging Workflow

When new-tab freezes:
1. Check browser console error.
2. Identify file and line.
3. Inspect recently extracted modules.
4. Check script loading order.
5. Check duplicate top-level declarations.
6. Check shared global variables.
7. Apply smallest possible fix.
8. Run full verification again.

**Important Note on Global Lexical Scope**:
Deferred scripts (`<script defer>`) evaluate in the same global execution context and share the global lexical declarative environment record. A top-level `const` or `let` declaration in one script will clash with a duplicate declaration in another script.

Example failure:
- In `wallpaper-storage.js`: `const wallpaperObjectUrlCache = new Map();`
- In `new-tab.js`: `const wallpaperObjectUrlCache = new Map();`
- Causes browser runtime error: `Uncaught SyntaxError: Identifier 'wallpaperObjectUrlCache' has already been declared`

All moved/extracted top-level declarations must be removed from `src/new-tab.js` and added to `movedDeclarationNames` in `scripts/check-newtab-static.mjs` for permanent static protection.
