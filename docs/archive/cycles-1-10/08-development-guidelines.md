# Homebase — Development Guidelines for AI Coding Agents

> **Author**: Product Architect  
> **Date**: 2026-09-25  
> **Scope**: Binding development rules for all AI coding agents operating in this repository  
> **Authority**: This document supplements [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md). In case of conflict, AGENTS.md takes precedence.  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md), [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md)

---

## Table of Contents

1. [Before Coding](#1-before-coding)
2. [Code Rules](#2-code-rules)
3. [Testing Rules](#3-testing-rules)
4. [Security Rules](#4-security-rules)
5. [Performance Rules](#5-performance-rules)
6. [Browser Compatibility Rules](#6-browser-compatibility-rules)
7. [Git Workflow](#7-git-workflow)
8. [Documentation Update Rules](#8-documentation-update-rules)

---

## 1. Before Coding

### 1.1 Required Reading

Before making any code change, every AI agent **must** read the following documents in order:

| Priority | Document | Purpose |
|:---:|:---|:---|
| 1 | [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) | Absolute authority. Contains all hard constraints, high-risk areas, extraction rules, testing limits, and post-edit report requirements. |
| 2 | This document (`docs/08-development-guidelines.md`) | Supplementary rules covering security, performance, browser compatibility, and documentation obligations. |
| 3 | [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md) | Understand the three-phase boot sequence, script loading model, component communication patterns, and storage tier hierarchy before modifying any file. |
| 4 | [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md) | Understand all 76+ storage keys, the five-tier storage model, fast-mirror dual-write pattern, and backup key registry before touching any storage operation. |
| 5 | [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) | Understand the feature that the task relates to — its main files, supporting files, browser APIs, storage keys, and dependencies. |

For **extraction tasks**, also read:
- [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) — to understand existing technical debt and avoid introducing more.
- [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) — to understand performance-sensitive code paths.

For **security-related tasks**, also read:
- [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) — to understand the current security posture and known findings.

For **new integrations or API changes**, also read:
- [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md) — to understand all existing integrations, their authentication, failure handling, and security profiles.

### 1.2 Planning Process

Before writing any code, every AI agent must:

1. **State the task** — what is being changed and why.
2. **Identify affected files** — list every file that will be created, modified, or deleted.
3. **Identify high-risk areas** — check the task against the AGENTS.md high-risk area list:
   ```
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
   If the task touches any of these, state it explicitly and plan additional verification.
4. **Identify storage impact** — if the task adds, removes, or renames storage keys, list them and determine:
   - Is the key included in `HOMEBASE_OWNED_STORAGE_KEYS` in [backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js)?
   - Does the key need a `localStorage` fast-mirror in [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js) or [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js)?
   - Is the key documented in [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md)?
5. **Identify script order impact** — if the task adds new files to `new-tab.html`, determine the correct load position relative to existing scripts. Scripts that provide globals must load before scripts that consume them.
6. **Identify cross-browser impact** — if the task uses any `browser.*` API, confirm it works in both Chrome (via `chrome.*` polyfill) and Firefox (native `browser.*`).
7. **State what will NOT be changed** — explicitly list files, functions, and areas outside the scope of this task.

### 1.3 Scope Discipline

- **Do one thing.** Each task should accomplish a single, well-defined change.
- **Do not fix unrelated bugs.** If an unrelated issue is discovered during the task, report it separately in the post-edit report. Do not fix it unless the prompt explicitly requests it.
- **Do not refactor while moving.** Extraction tasks must be pure moves — no renaming, no signature changes, no optimization, no style cleanup.
- **Do not improve code during bug fixes.** Bug fixes must be minimal and targeted. Refactoring adjacent code increases regression risk.

---

## 2. Code Rules

### 2.1 Minimal Changes

- Make the smallest change that satisfies the task.
- Do not rewrite entire functions when a targeted edit suffices.
- Do not add blank lines, reformat indentation, or change whitespace in lines unrelated to the task.
- Do not run broad formatters (Prettier, ESLint --fix, etc.) unless explicitly requested.
- Do not rename functions, variables, storage keys, DOM IDs, or CSS classes unless the prompt explicitly requests it.
- Do not change function signatures unless the prompt explicitly requests it.

### 2.2 Existing Pattern Preservation

Homebase has established patterns that must be followed, not replaced:

| Pattern | Convention | Example Location |
|:---|:---|:---|
| **Script type** | Classic `<script defer>` — no ES modules, no `type="module"` | [new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html#L3314-L3384) |
| **Global coordination** | Functions and variables shared via `window` globals | All files in `src/newtab/` |
| **DOM rendering** | `document.createElement()` + `textContent` — no `innerHTML` with interpolated user data | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js), [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js) |
| **Storage reads** | `browser.storage.local.get(keys)` with `try...catch` | [settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) |
| **Storage writes** | `browser.storage.local.set({ key: value })` | Throughout `src/newtab/` |
| **Fast mirrors** | Dual-write critical values to `localStorage` for synchronous `<head>` reads | [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) |
| **API polyfill** | `const browserApi = (typeof browser !== 'undefined') ? browser : chrome;` | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L50-L75) |
| **Fetch with abort** | `AbortController` + `AbortSignal.timeout()` on all network requests | [weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L43) |
| **Idle task scheduling** | `scheduleIdleTask(name, fn)` cooperative queue with 12ms budget | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) |
| **Lazy script loading** | `loadScriptOnce(path)` for settings-ui.js, gallery-ui.js, bookmark-editor.js, icon-picker.js | [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js#L480-L520) |
| **SVG icons** | `createSvgIconElement(iconId)` referencing inline `<symbol>` sprites | [data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js), [utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/utils.js) |
| **Error handling** | `try...catch` around all `async` browser API calls; guard with `if (window.__HB_DEBUG)` logging in preload/instant paths | [preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js) |
| **Custom alerts** | `showCustomAlert(title, message, options)` instead of native `alert()` / `confirm()` | [dialogs.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dialogs.js) |

When writing new code, match the style, indentation, quoting, and patterns of the surrounding code. Do not introduce new patterns unless the prompt explicitly requests it.

### 2.3 Dependency Rules

- **Zero npm runtime dependencies.** Do not add any package to `dependencies` in `package.json`.
- **Zero npm dev dependencies.** Do not add any package to `devDependencies` unless explicitly requested. All build scripts use Node.js built-in modules (`node:fs`, `node:path`, `node:url`, `node:zlib`, `node:test`, `node:assert`).
- **No bundler.** Do not introduce webpack, Vite, Rollup, esbuild, or any other bundler unless explicitly requested.
- **No transpiler.** Do not introduce Babel, TypeScript, or any source-to-source compiler.
- **No CSS preprocessor.** Do not introduce Sass, Less, PostCSS, or Tailwind CSS.
- **Vendor libraries** live in `src/assets/js/`. Do not move `Sortable.min.js` unless explicitly requested. Do not add new vendor libraries without explicit approval.
- **Node.js tooling** lives in `scripts/`. Build and test scripts must use only `node:*` built-in modules.

### 2.4 File Organization Rules

| Category | Location | Notes |
|:---|:---|:---|
| First-party Homebase modules | `src/newtab/<domain>/` | Organized by domain: `core/`, `bookmarks/`, `widgets/`, `search/`, `settings/`, `integrations/`, `tips/`, `wallpaper/` |
| Vendor/legacy scripts | `src/assets/js/` | Minified third-party libraries |
| Browser manifests | `manifests/` | `manifest.chrome.json`, `manifest.firefox.json` |
| Build outputs | `dist/chrome/`, `dist/firefox/` | Generated by `scripts/build.mjs`. Never edit directly. |
| Build/test scripts | `scripts/` | Node.js scripts using built-in modules only |
| Documentation | `docs/` | Markdown analysis documents |
| Tests | `tests/` | Unit tests using `node:test` (when created) |

When creating a new file:
- Place it in the appropriate `src/newtab/<domain>/` directory.
- Add the corresponding `<script defer>` tag to [new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html) in the correct load order position.
- Update [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) to include the new file's declarations.

### 2.5 Naming Conventions

Follow the existing conventions observed in the codebase:

| Entity | Convention | Examples |
|:---|:---|:---|
| **JS files** | `kebab-case.js` | `weather.js`, `search-utils.js`, `bookmark-style-runtime.js` |
| **CSS files** | `kebab-case.css` | `new-tab.css`, `settings.css` |
| **Functions** | `camelCase` | `loadBookmarks()`, `handleSearchInput()`, `renderBookmarkGrid()` |
| **Constants** | `UPPER_SNAKE_CASE` | `VIRTUALIZATION_THRESHOLD`, `IDLE_TASK_BUDGET_MS`, `FAVICON_CACHE_NAME` |
| **Storage keys** | `camelCase` (canonical), `kebab-case` (fast-mirrors) | `appShowWeather`, `fast-show-weather` |
| **DOM IDs** | `kebab-case` | `#bookmarks-grid`, `#search-input`, `#settings-panel` |
| **CSS classes** | `kebab-case` | `.glass-box`, `.widget-weather`, `.bookmark-item` |
| **CSS custom properties** | `--kebab-case` | `--bg-dim`, `--accent-color` |

Do not introduce new naming conventions. Do not rename existing identifiers unless the prompt explicitly requests it.

---

## 3. Testing Rules

### 3.1 Mandatory Verification After Every Code Change

Every code change, no matter how small, requires the following verification sequence:

```powershell
# Step 1: Syntax validation on every changed JS file
node --check <changed-file.js>

# Step 2: Static structural check
node scripts/check-newtab-static.mjs

# Step 3: Build Chrome target
npm.cmd run build:chrome
```

If any step fails, fix the issue before proceeding.

### 3.2 Extraction Task Verification

For code extraction tasks, additionally verify:

- [ ] Moved functions exist exactly once across the entire `src/` tree.
- [ ] No duplicate declarations remain in the source file.
- [ ] Old file paths are no longer referenced where they shouldn't be.
- [ ] New `<script defer>` tag is in the correct position in `new-tab.html`.
- [ ] Functions that depend on globals from other files have those files loading first.

### 3.3 Chrome/CDP Harness Rules

Per AGENTS.md, the Chrome/CDP smoke harness has a strict time budget:

- Try the harness **once** after a code change.
- If the mock/browser setup fails, attempt **one fix**.
- Do **not** spend more than **10–15 minutes** debugging the harness.
- If the harness still fails, fall back to static verification (Steps 1–3 above) and note that manual browser testing is required.

Exception: for high-risk areas (bookmarks, wallpaper/video, live search, startup orchestration), more harness time is justified.

### 3.4 Unit Test Rules

When adding or modifying pure utility functions (functions with no DOM or browser API dependencies), add or update corresponding unit tests:

- Tests live in `tests/` using `node:test` and `node:assert` (zero npm dependencies).
- Test file naming: `tests/<module-name>.test.mjs`.
- Run tests with: `node --test tests/`.
- Pure functions eligible for unit testing include: `evaluateMath()`, `evaluateUnits()`, `isLikelyUrl()`, `normalizeWidgetOrder()`, `getLocalDayStamp()`, backup envelope validation, and todo normalization.

### 3.5 Manual Testing Flags

Always tell the user when **manual Firefox testing** is required. Per AGENTS.md, the following areas cannot be fully verified by automated tooling:

```
browser.* APIs
bookmarks
storage persistence
new-tab startup behavior
wallpaper/video behavior
Firefox containers
settings persistence
network/cache widgets
```

In the post-edit report, include a section titled **"Manual Firefox testing required"** listing the specific behaviors that need manual verification.

---

## 4. Security Rules

### 4.1 DOM Rendering Safety

- **Always** use `textContent` or `document.createElement()` to render user-supplied data (bookmark titles, todo text, search queries, RSS feed titles).
- **Never** use `innerHTML`, `outerHTML`, or `insertAdjacentHTML()` with interpolated user data or external API responses.
- **Never** use `eval()`, `new Function()`, or `setTimeout(string)` for code execution.
- The existing math evaluator in [search-utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js) uses a regex allowlist — maintain this pattern; do not replace it with `eval()`.

### 4.2 External Data Handling

- **Validate URL schemes** before setting `img.src`, `video.src`, or `a.href` with data from external sources (RSS feeds, API responses). Only allow `https:`, `data:`, and `blob:` schemes.
- **Always** set `AbortSignal.timeout()` on all `fetch()` calls to external APIs. The project standard is 7–8 seconds.
- **Never** trust API response shapes blindly. Validate expected fields with type checks before accessing nested properties.
- **Never** add `eval`-capable CSP directives (`unsafe-eval`, `unsafe-inline` for scripts).

### 4.3 Permission Discipline

- Do **not** add new permissions to either manifest unless the prompt explicitly requests it and provides a concrete code path that requires the permission.
- If removing a permission, verify via `grep -r` that no code references the corresponding browser API.
- Prefer the narrowest possible `host_permissions` pattern. Use specific API paths (e.g. `https://api.example.com/v1/*`) rather than broad domain wildcards (e.g. `https://api.example.com/*`).

### 4.4 Storage Security

- Do **not** store API keys, tokens, passwords, or any authentication credentials in `browser.storage.local`, `localStorage`, or `sessionStorage`.
- If a new feature requires authentication, design it so credentials are never persisted in extension storage.
- Be aware that `localStorage` and `browser.storage.local` are accessible to any code running in the extension origin. Do not store sensitive user data without explicit user consent.

### 4.5 Third-Party Library Policy

- Before adding any vendor library to `src/assets/js/`, verify:
  - The library has no known CVEs in the version being included.
  - The minified source has been reviewed for unexpected network calls, eval usage, or dynamic script injection.
  - The library does not phone home, track analytics, or transmit data to external servers.
- Document any new library in [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md).

---

## 5. Performance Rules

### 5.1 Startup Path Protection

The three-phase boot sequence is performance-critical and must not be degraded:

1. **`preload.js` (synchronous `<head>`)** — this script runs before the first pixel is painted. Only synchronous `localStorage` reads are permitted here. Do not add `fetch()`, `browser.storage.local` calls, DOM queries beyond `document.documentElement`, or any async operations.

2. **`instant_load.js` (deferred body)** — hydrates cached widget data into the DOM before `new-tab.js` executes. Only read from `localStorage` fast-mirrors. Do not add network requests or heavy computation.

3. **`new-tab.js` / `initializePage()` (deferred, main runtime)** — orchestrates all async initialization. Leave `initializePage`, startup orchestration, and the idle scheduler in `new-tab.js` unless explicitly requested to move them.

### 5.2 Idle Scheduler Discipline

- Register non-critical work via `scheduleIdleTask(name, fn)` rather than running it synchronously during startup.
- Do not increase `IDLE_TASK_BUDGET_MS` (12ms) without explicit approval.
- Guard widget setup tasks with their visibility preferences — do not setup hidden widgets.
- Do not block the idle queue with synchronous operations exceeding 12ms.

### 5.3 Storage Performance

- **Batch storage reads.** Use a single `browser.storage.local.get([key1, key2, ...])` call instead of multiple sequential `.get()` calls.
- **Parallelize independent storage reads** using `Promise.allSettled()` or `Promise.all()`.
- **Minimize localStorage writes.** `localStorage.setItem()` is synchronous and blocks the main thread. Only write to fast-mirrors when the value is needed by `preload.js` or `instant_load.js`.
- **Limit localStorage value sizes.** Do not store values exceeding 50 KB in `localStorage`. Large binary data belongs in the Cache API.

### 5.4 DOM Performance

- **Use `DocumentFragment`** when appending multiple elements to the DOM. Do not call `appendChild()` in a loop on a live container.
- **Avoid forced synchronous layouts.** Do not read `offsetWidth`, `offsetHeight`, `getBoundingClientRect()`, or `getComputedStyle()` immediately after mutating DOM styles. Use `requestAnimationFrame()` to batch reads and writes.
- **Limit staggered animations** to 12–16 viewport-visible elements. Do not animate 100+ elements with individual delays.
- **Do not add new `backdrop-filter` rules** without considering GPU compositing cost. The project currently has 44 blur selectors — this number should decrease, not increase.

### 5.5 Network Performance

- **Always set a timeout** on `fetch()` calls: `signal: AbortSignal.timeout(7000)`.
- **Always use `AbortController`** for cancellable requests (search suggestions, news feeds).
- **Respect cache TTLs.** Do not bypass existing cache logic. If adding a new cached resource, document the TTL, cache bucket name, and eviction strategy.
- **Do not add polling intervals** (setInterval) for network requests. Use `storage.onChanged` listeners or one-shot timers with appropriate TTLs.

---

## 6. Browser Compatibility Rules

### 6.1 Dual-Browser Requirement

Every code change must work in both **Google Chrome** (Chromium/Blink) and **Mozilla Firefox** (Gecko). Chromium-only or Firefox-only APIs are only acceptable when:
- The feature is inherently browser-specific (e.g. Firefox Containers via `contextualIdentities`).
- The code path is guarded by feature detection (e.g. `if (typeof browser.contextualIdentities !== 'undefined')`).

### 6.2 Extension API Compatibility

| Pattern | Chrome | Firefox | Rule |
|:---|:---|:---|:---|
| `browser.storage.local.get()` | Returns via callback unless polyfilled | Returns `Promise` natively | Use the existing `browserApi` polyfill or `browser`/`chrome` detection |
| `browser.bookmarks.getTree()` | Returns via callback unless polyfilled | Returns `Promise` natively | Same as above |
| `browser.contextualIdentities` | **Not available** | Available | Guard with `typeof` check; only in Firefox code paths |
| `chrome://favicon/` | Available | **Not available** | Guard with `isChromium` check; use fallback pipeline |
| `navigator.clipboard.readText()` | Requires focus and secure context | May require `clipboardRead` permission | Already handled; do not change |

### 6.3 CSS Compatibility

- **`backdrop-filter`**: Supported in Chrome and Firefox 103+. Firefox's Gecko/WebRender pipeline is more expensive for blur compositing over video — be conservative.
- **`color-mix()`**: Supported in Chrome 111+ and Firefox 113+. Safe to use given `strict_min_version: 142.0` in Firefox manifest.
- **CSS Grid and Flexbox**: Fully supported. Use freely.
- **`-webkit-` prefixes**: Avoid adding new vendor-prefixed properties. The manifests target modern browser versions only.

### 6.4 Cache API Differences

- Chrome stores Cache API entries in dedicated cache storage files on disk.
- Firefox stores Cache API entries in IndexedDB/DOM cache infrastructure, which can have slower initial lookup times.
- When using the Cache API, test on Firefox to verify acceptable performance, especially for cold-start scenarios.

### 6.5 Feature Detection Pattern

When using an API that may not exist in all target browsers:

```javascript
// ✅ Correct: feature detection
if (typeof browser !== 'undefined' && browser.contextualIdentities) {
  // Firefox container logic
}

// ❌ Incorrect: user-agent sniffing
if (navigator.userAgent.includes('Firefox')) {
  // Don't do this
}
```

---

## 7. Git Workflow

### 7.1 Commit Rules

- Do **not** commit unless explicitly asked by the user.
- Do **not** stage generated files (`dist/`, `*.zip`, `web-ext-artifacts/`).
- Do **not** stage `node_modules/`.
- Prefer small, focused commits after each successful change.
- Use clear, descriptive commit messages:
  - `Extract weather widget to newtab/widgets/weather.js`
  - `Fix favicon object URL memory leak in resolveFaviconCandidate`
  - `Add unit tests for evaluateMath and evaluateUnits`
  - `Remove unused cookies permission from manifests`

### 7.2 Commit Message Format

```
<verb> <subject>

<optional body explaining why, not what>
```

Good verbs: `Extract`, `Fix`, `Add`, `Remove`, `Update`, `Refactor`, `Move`, `Rename`.

Do not use: `Misc`, `Cleanup`, `Changes`, `WIP`, `Update files`.

### 7.3 Branch Strategy

- The user manages branching. Do not create or switch branches unless explicitly asked.
- If asked to create a branch, use descriptive names: `extract-search-runtime`, `fix-favicon-leak`, `add-unit-tests`.

### 7.4 Release Commits

Per AGENTS.md:
- Use the full release-manager prompt only for actual releases.
- During release prep, edit only release metadata files unless pre-existing source/UI changes are approved.
- Do not combine feature and release commits unless the release prompt explicitly requests it.
- Do not invent release notes.

---

## 8. Documentation Update Rules

### 8.1 When to Update Documentation

Documentation updates are required when a code change:

| Change Type | Required Documentation Updates |
|:---|:---|
| **New storage key added** | Update [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md) Section 2 (key inventory). Add to `HOMEBASE_OWNED_STORAGE_KEYS` if user-facing. |
| **Storage key removed or renamed** | Update [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md). Check backup-import.js key list. |
| **New file created** | Update [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md) (module listing) and [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) (affected feature's "Main files" or "Supporting files"). |
| **File moved or extracted** | Update [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md) (module relationships, script loading), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) (file paths). |
| **New external API added** | Update [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md) with full integration profile. |
| **Manifest permission changed** | Update [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) (permission table and analysis). |
| **New widget or feature added** | Add a new section to [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) with all required fields. |
| **Performance-impacting change** | Note the change in [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) if it resolves or introduces a performance finding. |
| **Architectural decision** | Create an ADR (see Section 8.3). |

### 8.2 Documentation File Inventory

| Document | Content | When to Update |
|:---|:---|:---|
| [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md) | Project overview, tech stack, folder structure | Major structural changes only |
| [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md) | Runtime flow, boot sequence, module relationships, build pipeline | File extractions, new modules, script order changes |
| [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) | Feature inventory with files, APIs, storage, dependencies | Any feature change, file move, or new feature |
| [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md) | Storage keys, data structures, cache strategy, backup system | Any storage key change, new cache bucket, backup scope change |
| [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | Code quality findings | When a finding is resolved (mark as resolved with date) |
| [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) | Security findings | Permission changes, CSP updates, new external APIs |
| [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | Performance findings | When a finding is resolved or a new bottleneck is introduced |
| [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md) | Prioritized improvements | When a roadmap item is completed (mark as done with date) |
| [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md) | QA strategy, test flows, checklists | New test scripts, new critical flows, new browser targets |
| [docs/11-api-integration-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md) | All API and service integrations | New APIs, removed APIs, changed endpoints |

### 8.3 Architecture Decision Records (ADRs)

When making a significant architectural decision (e.g. introducing a new storage pattern, choosing a modularization strategy, selecting a test framework), create an ADR:

**Location**: `docs/adr/`  
**Naming**: `docs/adr/NNNN-<short-title>.md` (e.g. `docs/adr/0001-storage-service-abstraction.md`)

**Template**:

```markdown
# ADR-NNNN: <Title>

**Date**: YYYY-MM-DD  
**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Context

What problem are we solving? What constraints exist?

## Decision

What did we decide to do?

## Consequences

What are the positive and negative consequences of this decision?

## Alternatives Considered

What other approaches were evaluated and why were they rejected?
```

ADRs are required for:
- Introducing a new storage pattern or cache bucket.
- Changing the build pipeline.
- Adding a new script loading pattern.
- Choosing a testing framework or approach.
- Changing the module extraction strategy.

ADRs are **not** required for:
- Bug fixes.
- Adding individual unit tests.
- Small, isolated feature additions.
- Documentation-only changes.

### 8.4 Post-Edit Report

Per AGENTS.md, every code edit requires a post-edit report. The report must include:

```
Files changed:
Functions moved/modified:
Variables/constants moved/added/removed:
Functions intentionally left in place:
Globals/dependencies used by new files:
Verification performed:
Build result:
Anything not verified:
Manual Firefox testing required: [list specific behaviors]
```

For modified functions, include final function signatures. Do not paste the whole function body unless explicitly requested.

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────────────┐
│                    HOMEBASE DEVELOPMENT QUICK REFERENCE               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  BEFORE CODING                                                       │
│  ☐ Read AGENTS.md                                                    │
│  ☐ Read this document                                                │
│  ☐ Read relevant docs (architecture, data, feature map)              │
│  ☐ Identify high-risk areas                                          │
│  ☐ Plan storage key impact                                           │
│  ☐ Plan script order impact                                          │
│  ☐ State what will NOT be changed                                    │
│                                                                      │
│  WHILE CODING                                                        │
│  ☐ Minimal changes only                                              │
│  ☐ Match existing patterns                                           │
│  ☐ No new dependencies                                               │
│  ☐ No ES modules, no bundler                                         │
│  ☐ textContent for user data (never innerHTML)                       │
│  ☐ AbortSignal.timeout() on all fetch()                              │
│  ☐ DocumentFragment for bulk DOM appends                             │
│                                                                      │
│  AFTER CODING                                                        │
│  ☐ node --check <changed files>                                      │
│  ☐ node scripts/check-newtab-static.mjs                              │
│  ☐ npm.cmd run build:chrome                                          │
│  ☐ Post-edit report                                                  │
│  ☐ Flag manual Firefox testing needs                                 │
│  ☐ Update documentation if needed                                    │
│                                                                      │
│  NEVER DO                                                            │
│  ✗ Add npm dependencies                                              │
│  ✗ Convert to ES modules                                             │
│  ✗ Use innerHTML with user data                                      │
│  ✗ Use eval() or new Function()                                      │
│  ✗ Add new backdrop-filter rules                                     │
│  ✗ Run broad formatters                                              │
│  ✗ Rename without explicit request                                   │
│  ✗ Edit dist/ or node_modules/                                       │
│  ✗ Commit without explicit request                                   │
│  ✗ Fix unrelated bugs during a task                                  │
│                                                                      │
│  COMMANDS (Windows)                                                  │
│  npm.cmd run build           Build both targets                      │
│  npm.cmd run build:chrome    Build Chrome only                       │
│  npm.cmd run build:firefox   Build Firefox only                      │
│  npm.cmd run zip:chrome      Build + ZIP Chrome                      │
│  npm.cmd run zip:firefox     Build + ZIP Firefox                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

> **Document Note**: This document is a living reference. Update it when project conventions evolve. In accordance with AGENTS.md rules, no source code was modified during the creation of this document.
