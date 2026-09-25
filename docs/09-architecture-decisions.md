# Homebase — Architecture Decision Records

> **Author**: Product Architect  
> **Date**: 2026-09-25  
> **Scope**: Retroactive documentation of significant architectural decisions observed in the Homebase codebase  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/02-feature-map.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)

---

## Table of Contents

| ADR | Title | Category |
|:---|:---|:---|
| [ADR-001](#adr-001) | Zero-Framework Vanilla JavaScript Architecture | Framework Choice |
| [ADR-002](#adr-002) | Zero npm Dependencies for Build and Runtime | Framework Choice |
| [ADR-003](#adr-003) | Classic Deferred Scripts Instead of ES Modules | Architecture Pattern |
| [ADR-004](#adr-004) | No Bundler or Transpiler in Build Pipeline | Framework Choice |
| [ADR-005](#adr-005) | Five-Tier Hybrid Storage Architecture | Storage Choice |
| [ADR-006](#adr-006) | Synchronous localStorage Fast-Mirrors for FOUC Prevention | Storage Choice |
| [ADR-007](#adr-007) | Three-Phase Boot Sequence for Sub-50ms Perceived Startup | Architecture Pattern |
| [ADR-008](#adr-008) | Cooperative Idle Task Scheduler with 12ms Budget | Architecture Pattern |
| [ADR-009](#adr-009) | Dual-Browser Chrome and Firefox from Single Codebase | Browser Compatibility |
| [ADR-010](#adr-010) | Manifest V3 Without Background Service Worker | Browser Compatibility |
| [ADR-011](#adr-011) | No Content Scripts or Cross-Page Injection | Browser Compatibility |
| [ADR-012](#adr-012) | Global Namespace Coordination via Window Object | Architecture Pattern |
| [ADR-013](#adr-013) | Lazy-Load Settings and Gallery UI on Demand | Architecture Pattern |
| [ADR-014](#adr-014) | Custom ZIP Implementation Without External Libraries | Framework Choice |
| [ADR-015](#adr-015) | Cache API for Large Binary Asset Storage | Storage Choice |
| [ADR-016](#adr-016) | Dual-Video Crossfade for Seamless Looping | Architecture Pattern |
| [ADR-017](#adr-017) | Custom RSS XML Parser Instead of External Library | Framework Choice |
| [ADR-018](#adr-018) | Custom Math Expression Evaluator Instead of eval() | Architecture Pattern |
| [ADR-019](#adr-019) | Progressive Modular Extraction Strategy | Architecture Pattern |
| [ADR-020](#adr-020) | Strict Privacy-First Design with Zero Telemetry | Architecture Pattern |

---

## ADR-001

**Title**: Zero-Framework Vanilla JavaScript Architecture

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: Homebase is a new-tab replacement extension that loads on every single tab open. The primary UX goal is sub-50ms perceived startup — faster than any framework's hydration cycle. The extension must work identically in Chrome and Firefox without framework-specific polyfills or runtime adapters.

**Problem**: UI frameworks (React, Vue, Svelte, Angular) impose a runtime cost — virtual DOM diffing, component lifecycle management, state reconciliation, and hydration delays — that directly conflicts with the requirement for instantaneous new-tab rendering. Framework runtimes range from 30 KB (Preact) to 120 KB+ (React + ReactDOM), adding parsing and execution overhead on every tab open.

**Decision**: Build the entire dashboard using native browser DOM APIs (`document.createElement()`, `textContent`, `classList`, `addEventListener`). No UI framework, no virtual DOM, no component model.

**Alternatives considered**:
- **React/Preact**: Mature ecosystem but virtual DOM reconciliation adds 10–30ms per render cycle. JSX requires a transpiler, violating the no-bundler constraint.
- **Svelte**: Compiles to vanilla JS (closer to the goal), but requires a build step with a Svelte compiler, introducing a mandatory dev dependency and build toolchain.
- **Lit/Web Components**: Lightweight but introduces custom element registration overhead and Shadow DOM complexities with extension CSP restrictions.
- **Alpine.js**: Minimal runtime (~15 KB) but uses `x-` attributes parsed from HTML, adding declarative evaluation overhead during DOM parse.

**Reason**: Every millisecond of framework overhead is multiplied by the number of tabs opened per day. A user opening 50 tabs/day would accumulate 1.5–5 seconds of pure framework overhead daily. Native DOM APIs execute at browser-native speed with zero abstraction cost. The absence of a framework also eliminates the entire category of framework version upgrades, breaking API changes, and security advisories.

**Consequences**:
- **Positive**: Zero framework runtime overhead. Zero framework CVE exposure. Complete control over DOM mutation timing. No framework lock-in.
- **Positive**: The extension's total JavaScript is authored code, not framework boilerplate. Every byte serves a user-facing purpose.
- **Negative**: No component reuse model — UI construction is imperative and repetitive. Patterns like bookmark tile creation are manually coded rather than declaratively templated.
- **Negative**: No automatic reactivity — state changes require explicit DOM updates. Forgetting to update the DOM after a storage write creates silent UI staleness bugs.
- **Negative**: Higher barrier for contributors unfamiliar with raw DOM manipulation.

---

## ADR-002

**Title**: Zero npm Dependencies for Build and Runtime

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: Browser extensions are high-privilege software with access to bookmarks, browsing history, storage, and cookies. Every npm dependency in the supply chain is a potential vector for supply-chain attacks (e.g. `event-stream`, `ua-parser-js`, `colors.js` incidents). Extension web store reviewers scrutinize dependency trees.

**Problem**: npm packages, even popular ones, can be compromised via maintainer account takeover, typosquatting, or malicious post-install scripts. A single vulnerable transitive dependency in a browser extension can exfiltrate all user bookmarks, browsing history, and stored credentials.

**Decision**: Maintain zero entries in both `dependencies` and `devDependencies` in [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json). All build scripts, ZIP compression, static analysis, and smoke testing use exclusively Node.js built-in modules (`node:fs`, `node:path`, `node:url`, `node:zlib`, `node:http`, `node:net`, `node:child_process`, `node:test`, `node:assert`).

**Alternatives considered**:
- **Minimal dev dependencies** (e.g. `archiver` for ZIP, `eslint` for linting, `playwright` for testing): Would simplify build scripts but introduces supply-chain trust surface. Each dependency pulls in transitive dependencies that must be audited.
- **Lockfile-pinned dependencies**: Reduces risk of silent upgrades but does not eliminate compromised package risk. Requires ongoing `npm audit` maintenance.

**Reason**: The extension handles sensitive user data (bookmarks, browsing history, clipboard). The cost of auditing even a small dependency tree exceeds the cost of implementing ZIP compression (200 lines) and static analysis (400 lines) manually. Node.js built-in modules are maintained by the Node.js core team and undergo rigorous security review.

**Consequences**:
- **Positive**: Zero supply-chain attack surface. Web store reviewers see no `node_modules/` — simplifies review and approval.
- **Positive**: No `npm install` step. Any developer can clone and build immediately with just Node.js installed.
- **Positive**: No `npm audit` maintenance burden. No Dependabot alerts. No version conflict resolution.
- **Negative**: Build scripts are more verbose. The custom ZIP implementation ([scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs#L103-L165)) is 60 lines of manual CRC32 and DEFLATE logic instead of a one-line `archiver.create()`.
- **Negative**: No ESLint, Prettier, or automated code formatting. Code style consistency relies on developer discipline and AI agent rules (AGENTS.md).
- **Negative**: Testing requires custom harness scripts instead of established frameworks like Jest or Vitest.

---

## ADR-003

**Title**: Classic Deferred Scripts Instead of ES Modules

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: The extension loads 37+ JavaScript files on every new tab. The execution model must support global variable sharing between files without explicit import/export declarations, and must work in both Chrome and Firefox extension contexts without additional polyfills.

**Problem**: ES modules (`type="module"`) use strict mode by default, have their own scope (no implicit `window` globals), require explicit `import`/`export` statements, and load asynchronously with different timing semantics than `<script defer>`. Converting to modules would require rewriting every file to add exports and imports, changing the execution model fundamentally.

**Decision**: Use classic `<script src="..." defer>` tags for all runtime scripts. Scripts execute in DOM order after HTML parsing, share the global `window` scope, and coordinate via global variables and functions.

**Alternatives considered**:
- **ES Modules (`type="module"`)**: Native browser module system with proper scoping. Would eliminate global namespace pollution but requires explicit `import`/`export` on every file, changes execution timing (modules are deferred by default but also have different error semantics), and would be a massive codebase rewrite.
- **AMD/RequireJS**: Legacy module system. Adds a runtime dependency and boilerplate.
- **CommonJS with bundler**: Requires a bundler (webpack, Rollup) to resolve `require()` calls — violates the no-bundler constraint (ADR-004).

**Reason**: The project was built incrementally with global coordination. Converting 37+ files to ES modules is a high-risk, all-or-nothing migration that would touch every file simultaneously. The `<script defer>` model works reliably in both Chrome and Firefox extension contexts. The global sharing pattern, while imperfect, is well-understood and debuggable.

**Consequences**:
- **Positive**: Zero module system overhead. No import resolution, no module graph construction, no circular dependency detection at runtime.
- **Positive**: Simple mental model — scripts execute top-to-bottom in DOM order. Easy to reason about execution sequence.
- **Positive**: Compatible with the progressive extraction strategy (ADR-019) — files can be extracted without changing the execution model.
- **Negative**: All 37+ scripts share a single global `window` namespace. Hundreds of global variables create collision risk (documented in [04-code-review.md Issue M1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Script load order is manually maintained in `new-tab.html`. Reordering a single `<script>` tag can cause `ReferenceError` crashes (documented in [04-code-review.md Issue M2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Static analysis tools cannot determine data ownership or dependency flow between files.

---

## ADR-004

**Title**: No Bundler or Transpiler in Build Pipeline

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: The build pipeline must be minimal, fast, and reproducible. The extension targets modern browsers only (Chrome latest, Firefox ≥142.0), so transpilation for older browsers is unnecessary.

**Problem**: Bundlers (webpack, Vite, Rollup, esbuild) add configuration complexity, build-time dependencies, and debugging indirection (source maps). Transpilers (Babel, TypeScript) require type definitions or configuration files and produce output that differs from source.

**Decision**: The build pipeline consists of a single 202-line Node.js script ([scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs)) that copies `src/` to `dist/<target>/`, overlays the browser-specific manifest, validates Chrome manifest constraints, and optionally creates a ZIP archive using a custom DEFLATE implementation.

**Alternatives considered**:
- **Vite/Rollup**: Fast bundlers that could tree-shake unused code and concatenate scripts. Would reduce the 37-script load overhead (Performance Review Issue S1) but adds `devDependencies`, requires configuration, and produces transformed output that's harder to debug in browser DevTools.
- **esbuild**: Extremely fast bundler/minifier. Minimal configuration. But still introduces a dev dependency and changes the debugging experience.
- **TypeScript**: Type safety would catch interface mismatches between the 37+ global scripts. But requires `.ts` → `.js` compilation, `tsconfig.json`, and either a dev dependency or a global install.

**Reason**: The build script does exactly three things: copy, overlay manifest, and optionally ZIP. This takes <500ms and produces output identical to source (no transformation, no minification, no source maps needed). Developers can debug in browser DevTools by reading the exact source code they wrote. The simplicity also means the build never fails due to bundler configuration issues.

**Consequences**:
- **Positive**: Build is instant (<500ms). No configuration files beyond `package.json` scripts.
- **Positive**: Output in `dist/` is byte-for-byte identical to `src/` (plus manifest). DevTools debugging reads original source.
- **Positive**: No build cache invalidation issues. No "works in dev, breaks in prod" discrepancies.
- **Negative**: No tree-shaking — all code in all 37 scripts is loaded even if unused on a particular page.
- **Negative**: No minification — production builds ship unminified JavaScript (~679 KB total). Minification could reduce this by 40–60%.
- **Negative**: No dead code elimination — removed features may leave orphaned functions if not manually cleaned up.
- **Negative**: 37 individual HTTP requests to load scripts (though from local extension package, not network). See [06-performance-review.md Issue S1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) for the 80–200ms overhead this causes.

---

## ADR-005

**Title**: Five-Tier Hybrid Storage Architecture

**Date**: Evolved incrementally (v0.3.0 – v0.14.0)

**Status**: Accepted

**Context**: Homebase must balance two conflicting goals: (1) instant, zero-latency first paint on new tab creation, and (2) persistent, cross-session data durability for bookmarks, preferences, and cached media. No single browser storage API satisfies both requirements.

**Problem**: `browser.storage.local` is the canonical persistent store but is asynchronous — reads require IPC to the browser process, adding 5–40ms latency. `localStorage` is synchronous but has a 5–10 MB quota and blocks the main thread on large writes. The Cache API handles large binary blobs but is asynchronous and subject to browser disk quota eviction.

**Decision**: Implement a five-tier storage hierarchy where each tier serves a specialized latency/persistence/size role:

| Tier | Mechanism | Role | Access Pattern |
|:---|:---|:---|:---|
| 1 | `window.localStorage` | Fast preload mirrors | Synchronous, blocking |
| 2 | `browser.storage.local` | Canonical source of truth | Asynchronous, persistent |
| 3 | `window.caches` (Cache API) | Large binary/blob storage | Asynchronous, evictable |
| 4 | `window.sessionStorage` | Diagnostic health tracking | Synchronous, per-tab |
| 5 | In-memory JavaScript heap | Runtime execution state | Ultra-fast, ephemeral |

**Alternatives considered**:
- **Single-tier `browser.storage.local` only**: Simplest model but cannot provide synchronous reads needed for FOUC prevention in `<head>` scripts. Every tab open would show a white flash while awaiting async storage.
- **IndexedDB**: More powerful than `localStorage` for structured data, but still asynchronous. Overkill for the key-value preference pattern. Not needed when `browser.storage.local` already provides unlimited async storage.
- **`browser.storage.sync`**: Would enable cross-device synchronization via browser account. Rejected because: 100 KB total quota, 8 KB per-item limit, binary payload corruption risk, and privacy concerns (data transits Google/Mozilla servers).

**Reason**: The five-tier model allows each storage mechanism to operate within its strengths. `localStorage` provides the <1ms synchronous reads needed by `preload.js` to prevent FOUC. `browser.storage.local` provides the unlimited, persistent, structured storage needed for 76+ preference keys. The Cache API handles multi-megabyte video and image blobs that would exceed `localStorage` quotas.

**Consequences**:
- **Positive**: Achieves sub-50ms perceived startup by reading wallpaper, theme, and widget state synchronously from `localStorage` in `<head>`.
- **Positive**: No data loss on quota exhaustion — `localStorage` mirrors are degradation-tolerant (the async canonical store is always authoritative).
- **Negative**: Dual-write complexity — every preference change must update both `browser.storage.local` (canonical) and `localStorage` (fast mirror). Forgetting a dual-write creates data staleness across tab restarts.
- **Negative**: 76+ storage keys across two mechanisms create a large surface for key naming mismatches (documented in [04-code-review.md Issue N2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Cache API storage is subject to browser eviction under disk pressure. Users may lose cached video wallpapers without warning.

---

## ADR-006

**Title**: Synchronous localStorage Fast-Mirrors for FOUC Prevention

**Date**: Introduced with `preload.js` (estimated v0.4.0)

**Status**: Accepted

**Context**: When a browser opens a new tab, the extension page (`new-tab.html`) starts with a blank white document. User preferences for background color, wallpaper poster, dim overlay, sidebar visibility, and clock format must be applied before the browser paints the first pixel. `browser.storage.local` is asynchronous and cannot return data before paint.

**Problem**: Flash of Unstyled Content (FOUC). Without synchronous access to user preferences, every new tab shows a 50–200ms white flash before the wallpaper poster, dim overlay, and widget layout are applied. This is unacceptable for a new-tab replacement that users see dozens of times per day.

**Decision**: Mirror critical visual preferences to `localStorage` using `fast-` prefixed keys (e.g. `fast-bg-dim`, `fast-show-sidebar`, `fast-time-format`, `fast-weather`). A synchronous `<script>` in `<head>` ([preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js)) reads these mirrors and applies CSS classes, inline styles, and DOM attributes before the browser's first paint.

**Alternatives considered**:
- **CSS-only defaults**: Set safe default styles in CSS (dark background, hidden widgets). Eliminates FOUC but causes a visible "pop" when the actual preferences load and override defaults 50–200ms later.
- **Service Worker interception**: A background service worker could intercept the new-tab page request and inject user preferences into the HTML response. But Homebase deliberately avoids a service worker (ADR-010), and this approach adds complexity and latency.
- **Inline `<script>` with embedded data**: Embed preference JSON directly into the HTML at build time. Not possible because preferences are user-specific and change at runtime.

**Reason**: `localStorage.getItem()` returns in <1ms (synchronous disk read, often from OS page cache). Reading 8–10 preference keys takes <5ms total. This is fast enough to apply visual state before `DOMContentLoaded` fires, completely eliminating FOUC.

**Consequences**:
- **Positive**: Zero FOUC. The wallpaper poster, background dim, sidebar visibility, and clock format are visible on the very first rendered frame.
- **Positive**: The `preload.js` script is small (~500 lines) and executes entirely synchronously — no async complexity.
- **Negative**: Every preference with a fast-mirror requires a dual-write: `browser.storage.local.set({ key: value })` + `localStorage.setItem('fast-key', value)`. Forgetting the `localStorage` write causes FOUC for that specific preference on next tab open.
- **Negative**: `localStorage` has a 5–10 MB quota. Storing a 250 KB base64 poster data URL consumes 5% of the quota (documented in [06-performance-review.md Issue M3](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).
- **Negative**: `localStorage` writes are synchronous and block the main thread. Large values (base64 images) cause measurable write latency.

---

## ADR-007

**Title**: Three-Phase Boot Sequence for Sub-50ms Perceived Startup

**Date**: Evolved incrementally (v0.3.0 – v0.10.0)

**Status**: Accepted

**Context**: Homebase must render a complete, styled dashboard (wallpaper, clock, bookmarks, widgets) as fast as possible when a new tab opens. Users perceive startup speed as the time between pressing Ctrl+T and seeing their customized dashboard.

**Problem**: Loading 37+ scripts, reading 76+ storage keys, fetching bookmark trees, and rendering hundreds of DOM elements cannot happen instantaneously. The challenge is ordering these operations so the user perceives an instant load while heavy work happens in the background.

**Decision**: Implement a three-phase boot sequence:

1. **Phase 1 — Synchronous `<head>` Preload** ([preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js)): Runs as a synchronous `<script>` in `<head>`, before any DOM is rendered. Reads `localStorage` fast-mirrors to apply wallpaper poster, background dim, sidebar visibility, clock format, and widget order. Attaches a `MutationObserver` to reorder widgets as soon as their DOM nodes are parsed.

2. **Phase 2 — Deferred Instant Hydration** ([instant_load.js](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js)): Runs as `<script defer>` early in the body. Hydrates cached widget content (clock time, weather data, todo list, news headlines) from `localStorage` fast-mirrors directly into the DOM. When the user sees the page, widgets already show yesterday's cached data.

3. **Phase 3 — Deferred Runtime & Idle Scheduler** ([new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)): The main runtime. `initializePage()` reads canonical data from `browser.storage.local`, loads bookmark trees, and schedules non-critical work (weather refresh, news fetch, quote rotation, daily wallpaper rotation) into a cooperative idle task queue with 12ms per-task budget (ADR-008).

**Alternatives considered**:
- **Single-phase loading**: Load everything in one `DOMContentLoaded` handler. Simple but causes 200–500ms white screen while all storage reads, DOM construction, and network requests complete.
- **Web Worker offloading**: Move data processing to a Web Worker. Reduces main-thread blocking but adds postMessage serialization overhead and complexity. Workers cannot access DOM, localStorage, or extension storage APIs directly.
- **Streaming SSR-style approach**: Pre-render the HTML with embedded data at build time. Not possible for a dynamic, user-customized dashboard.

**Reason**: The three-phase model separates concerns by latency tier. Phase 1 (<5ms) prevents FOUC. Phase 2 (<20ms) populates visible widgets with cached content. Phase 3 (50–500ms) handles the heavy async work. The user sees a fully styled, data-populated dashboard within 20ms while the runtime catches up in the background.

**Consequences**:
- **Positive**: Sub-50ms perceived startup. Users see their wallpaper, clock, and cached widgets almost instantly.
- **Positive**: Graceful degradation — if `localStorage` is empty (first run), the dashboard renders with sensible defaults and populates once async data arrives.
- **Negative**: Three separate code paths read similar data from different tiers, creating duplication (documented in [04-code-review.md Issues D1, D3, D4](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Bugs in Phase 1 (`preload.js`) are difficult to diagnose because they execute before DevTools can attach. Silent catch blocks swallow errors (documented in [04-code-review.md Issue E1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: The sequencing between phases creates implicit timing contracts. Phase 3 assumes Phase 1 and 2 have already applied visual state.

---

## ADR-008

**Title**: Cooperative Idle Task Scheduler with 12ms Budget

**Date**: Introduced in `new-tab.js` (estimated v0.6.0)

**Status**: Accepted

**Context**: After the critical startup path (bookmark loading, wallpaper application), many secondary tasks must execute: weather data refresh, news feed fetch, quote rotation, search suggestion warming, daily wallpaper rotation, favicon cache pruning, and performance overlay setup. Running these synchronously would block the main thread and cause jank.

**Problem**: `requestIdleCallback()` is available in Chrome but has inconsistent behavior in Firefox. The browser's built-in idle scheduling doesn't provide the fine-grained budget control needed for a new-tab page that must remain responsive to immediate user interaction (search typing, bookmark clicking).

**Decision**: Implement a custom cooperative idle task scheduler with a configurable per-task budget of 12ms (`IDLE_TASK_BUDGET_MS = 12`). Tasks are registered via `scheduleIdleTask(name, fn)` and executed sequentially using `requestAnimationFrame` callbacks. Each task runs within a single frame budget. If a task exceeds the budget, the remaining tasks are deferred to the next frame.

**Alternatives considered**:
- **`requestIdleCallback()`**: Browser-native idle scheduling. But Firefox support was inconsistent at project inception, and the API doesn't guarantee execution order or provide named task tracking for debugging.
- **`setTimeout(fn, 0)` queue**: Simple but fires immediately after the current execution context, not during true idle time. Can still cause jank if many tasks are queued.
- **Web Worker**: Offload background tasks entirely. But most tasks (DOM updates, storage reads, fetch with cookies) require main-thread access.

**Reason**: 12ms is chosen to fit within a single 16.67ms frame (60fps), leaving ~4ms for browser compositing and rendering. Named tasks enable debugging (`startup:setupSearch`, `startup:loadCachedWeather`, etc.) and profiling which tasks consume the most budget.

**Consequences**:
- **Positive**: Non-critical tasks never block user interaction. The dashboard remains responsive to search typing and bookmark clicks even while background work executes.
- **Positive**: Named task identifiers make startup profiling trivial — each task's duration is measurable.
- **Negative**: Tasks must be genuinely cooperative — a single task that runs for 50ms defeats the entire scheduler. There's no preemption mechanism.
- **Negative**: Hidden widgets are still scheduled for setup even when disabled (documented in [06-performance-review.md Issue S4](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).

---

## ADR-009

**Title**: Dual-Browser Chrome and Firefox from Single Codebase

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: Homebase targets both the Chrome Web Store (Chromium, Edge, Brave) and Firefox Add-ons (Gecko). Both browsers implement the WebExtensions API standard but with divergent namespaces (`chrome.*` vs `browser.*`), callback/promise semantics, and browser-specific features.

**Problem**: Maintaining two separate codebases would double development effort. But a single codebase must handle: different manifest formats (Chrome rejects `browser_specific_settings`, Firefox requires it), different API namespaces, different permission models (Firefox supports `contextualIdentities`, Chrome does not), and different rendering engine behaviors (Blink vs Gecko).

**Decision**: Maintain a single `src/` codebase with browser-specific manifest files in `manifests/`. Runtime code uses a polyfill pattern (`typeof browser !== 'undefined' ? browser : chrome`) to normalize API access. Browser-specific features (Firefox Containers) are guarded by `typeof` feature detection. The build script copies `src/` to `dist/<target>/` and overlays the appropriate manifest.

**Alternatives considered**:
- **Separate codebases**: Maximum browser optimization but unsustainable maintenance burden for a solo/small-team project.
- **webextension-polyfill (Mozilla)**: Official polyfill library that normalizes `chrome.*` callbacks to `browser.*` Promises. But adds an npm dependency (violating ADR-002) and is 20 KB of runtime code.
- **Preprocessor directives**: `#ifdef CHROME` / `#ifdef FIREFOX` conditional compilation. Requires a custom preprocessor tool and makes source code harder to read.

**Reason**: The polyfill pattern is minimal (3–5 lines per file), the manifest overlay build step is trivial, and feature detection for Firefox-specific APIs is a standard web development practice. This approach keeps the codebase readable and avoids dependency on any polyfill library.

**Consequences**:
- **Positive**: Single source of truth. Bug fixes and features apply to both browsers simultaneously.
- **Positive**: Build script is trivially simple — copy + overlay manifest.
- **Negative**: The API polyfill is duplicated between `new-tab.js` and `action-popup.js` (documented in [04-code-review.md Issue D2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Chrome's `chrome.storage.local` uses callbacks while Firefox's `browser.storage.local` returns Promises natively. The polyfill must wrap callbacks in Promises for Chrome, adding complexity.
- **Negative**: CSS rendering differences between Blink and Gecko (especially `backdrop-filter` over video) require browser-specific testing that cannot be automated (documented in [06-performance-review.md Section 8](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).

---

## ADR-010

**Title**: Manifest V3 Without Background Service Worker

**Date**: Migration to MV3 (estimated v0.8.0)

**Status**: Accepted

**Context**: Chrome deprecated Manifest V2 and requires MV3 for new extensions. MV3 replaces persistent background pages with ephemeral service workers. Many extensions use service workers for cross-tab coordination, alarm scheduling, and message passing.

**Problem**: A background service worker adds a persistent compute surface, increases memory usage, and requires managing the service worker lifecycle (install, activate, idle termination). Homebase's features — new-tab rendering, widget display, bookmark management — are all user-initiated and page-scoped.

**Decision**: Do not declare a `background` or `service_worker` key in either manifest. The extension runs exclusively within its own extension pages (`new-tab.html` and `action-popup.html`). All logic executes on-demand when the user opens a new tab or clicks the toolbar button.

**Alternatives considered**:
- **Background service worker for cross-tab coordination**: Would enable fetch deduplication across simultaneous tabs (Performance Review Issue N2), alarm-based daily wallpaper rotation, and centralized state management. But adds persistent resource consumption and an entirely new execution context to maintain.
- **Event-based service worker**: Register only for specific events (`alarms`, `storage.onChanged`). Lighter than a persistent worker but still adds lifecycle complexity and a new code surface.

**Reason**: Every feature Homebase offers is triggered by user interaction with the new-tab page. There is no background processing that cannot be deferred to the next tab open. The absence of a service worker is also a significant security advantage — no code runs persistently, reducing the attack surface to zero when no Homebase tab is open.

**Consequences**:
- **Positive**: Zero persistent resource consumption when no Homebase tab is open.
- **Positive**: Eliminates entire classes of extension vulnerabilities (persistent background exfiltration, message port hijacking, service worker cache poisoning).
- **Positive**: Simpler architecture — no message passing, no worker lifecycle management.
- **Negative**: No cross-tab coordination. Multiple simultaneous tabs duplicate network requests (documented in [06-performance-review.md Issue N2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).
- **Negative**: In-memory caches (favicon negative cache, search suggestion LRU) are per-tab and ephemeral — they reset on every new tab (documented in [06-performance-review.md Issues N3, N4](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).
- **Negative**: Daily wallpaper rotation must be triggered on tab open rather than at a scheduled time.

---

## ADR-011

**Title**: No Content Scripts or Cross-Page Injection

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: Many browser extensions inject content scripts into third-party web pages to modify their behavior, add overlays, or extract data. Content scripts run in the context of visited web pages and can access their DOM.

**Problem**: Content scripts are the most common vector for extension security vulnerabilities. They can be used to inject malicious code into banking sites, exfiltrate form data, or modify page content. They also trigger additional permission warnings that deter users from installing the extension.

**Decision**: Do not declare `content_scripts` in either manifest. The extension's code runs exclusively within its own extension-origin pages. No code is injected into any third-party web page.

**Alternatives considered**:
- **Content script for "Save Bookmark" overlay**: Inject a floating button on all pages to save the current page as a bookmark. Would improve UX but requires `<all_urls>` host permission and runs code in every page context.
- **Content script for search enhancement**: Inject Homebase search suggestions into the browser's native search or address bar. Requires deep page manipulation and broad permissions.

**Reason**: Homebase's bookmark-saving functionality is handled by the toolbar action popup, which runs in its own extension context. This provides the same functionality without injecting code into third-party pages. The privacy and security posture of zero content scripts is a core product value.

**Consequences**:
- **Positive**: Zero code execution in third-party page contexts. Eliminates XSS amplification, DOM clobbering, and content script injection attack surfaces.
- **Positive**: No `<all_urls>` or broad host permission needed for content scripts. Reduces installation permission warnings.
- **Negative**: Cannot provide contextual features on visited pages (e.g. floating "save" button, page annotation, or in-page search enhancement).

---

## ADR-012

**Title**: Global Namespace Coordination via Window Object

**Date**: Inherited from classic script architecture (ADR-003)

**Status**: Accepted (with recognized technical debt)

**Context**: With 37+ classic `<script defer>` files sharing the global `window` scope (ADR-003), there must be a mechanism for files to share functions, constants, and state.

**Problem**: Without ES modules or a bundler-provided module system, the only shared namespace available to classic scripts is the `window` object. Each file's top-level `var`, `function`, and `const` declarations become implicitly global.

**Decision**: Functions and variables that need cross-file access are declared at the top level of their respective files, making them global `window` properties. Consuming files reference these globals directly by name (e.g. `debounce()` from `utils.js`, `createSvgIconElement()` from `data.js`).

**Alternatives considered**:
- **Explicit namespace object**: `window.Homebase = { core: {}, bookmarks: {}, widgets: {} }`. Would organize globals under a single namespace, reducing collision risk. But requires retrofitting all existing global references.
- **IIFE with exports**: Wrap each file in an IIFE and export only necessary APIs onto a namespace. Reduces pollution but adds boilerplate to every file.
- **ES Modules (ADR-003 revisited)**: Would provide proper scoping. But rejected per ADR-003.

**Reason**: The implicit global pattern was established at project inception and is deeply embedded across all files. Introducing a namespace object now would require touching every file and every cross-reference — a massive, high-risk refactoring effort with no user-visible benefit.

**Consequences**:
- **Positive**: Zero coordination overhead. Any file can call any function from any other file that loaded before it.
- **Positive**: Simple debugging — all globals are inspectable in browser DevTools console.
- **Negative**: Hundreds of implicit globals create collision risk. A new variable named `state` in one file could shadow `state` in another (documented in [04-code-review.md Issue N3](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: No static analysis tool can determine which file "owns" a global or which files depend on it.
- **Negative**: Script load order is the only dependency management mechanism. Reordering scripts is error-prone (documented in [04-code-review.md Issue M2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).

---

## ADR-013

**Title**: Lazy-Load Settings and Gallery UI on Demand

**Date**: Introduced as optimization (estimated v0.7.0)

**Status**: Accepted

**Context**: The Settings panel (~3,000 lines in [settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/settings-ui.js)) and the Wallpaper Gallery (~2,688 lines in [gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js)) are large, complex UI modules that most users interact with infrequently. Loading them on every tab open wastes parse time and memory.

**Problem**: Including settings and gallery scripts in the initial 37-script load chain adds ~5,700 lines of JavaScript that >95% of tab opens never execute. This code would be compiled by V8/SpiderMonkey on every tab, wasting 20–40ms of startup time.

**Decision**: Load `settings-ui.js`, `gallery-ui.js`, `bookmark-editor.js`, and `icon-picker.js` on-demand via `loadScriptOnce(path)` — a utility function that creates a `<script>` element, sets its `src`, appends it to the document, and resolves a Promise when the script's `load` event fires. The script is loaded only once per tab session (subsequent calls return immediately).

**Alternatives considered**:
- **Include in initial load**: Simplest approach but wastes startup time on code that may never execute.
- **Dynamic `import()`**: ES module dynamic import. Clean syntax (`await import('./settings-ui.js')`) but requires converting the file to an ES module, violating ADR-003.
- **`<link rel="preload">` with deferred execution**: Preload the script in the background without executing it. Execute on demand. Saves parse time but still consumes network/disk I/O on every tab open.

**Reason**: `loadScriptOnce()` is the simplest lazy-loading mechanism compatible with classic scripts (ADR-003). It adds zero overhead to the initial load path and only incurs the compile cost when the user actually opens settings or the gallery.

**Consequences**:
- **Positive**: 20–40ms saved on every tab open by deferring 5,700+ lines of JavaScript.
- **Positive**: Users who never open settings or the gallery never pay the compilation cost.
- **Negative**: First open of settings or gallery has a visible ~100ms delay while the script downloads and compiles.
- **Negative**: Lazy-loaded scripts cannot be syntax-checked by `node --check` during automated testing of the main page flow (they require explicit verification).

---

## ADR-014

**Title**: Custom ZIP Implementation Without External Libraries

**Date**: Build pipeline creation (estimated v0.6.0)

**Status**: Accepted

**Context**: Chrome and Firefox web stores require extensions to be submitted as ZIP archives. The build script must produce valid ZIP files for both `dist/chrome/` and `dist/firefox/` directories.

**Problem**: Standard ZIP library packages (e.g. `archiver`, `jszip`, `yazl`) would add npm dependencies, violating ADR-002.

**Decision**: Implement a custom ZIP archive creator in [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs#L103-L165) using Node.js built-in `node:zlib` (`deflateRawSync`) and manual construction of ZIP local file headers, central directory entries, and end-of-central-directory records. CRC32 checksums are computed using a custom lookup table implementation.

**Alternatives considered**:
- **`archiver` npm package**: Battle-tested ZIP library. Single function call to create archives. But adds a dependency with 10+ transitive packages.
- **Shell `zip` command**: Call system `zip` via `child_process.exec()`. Platform-dependent — not available on all Windows machines without additional installation.
- **PowerShell `Compress-Archive`**: Windows-native but not available on macOS/Linux, breaking cross-platform build compatibility.

**Reason**: The ZIP format specification is well-documented and the subset needed for extension packaging (DEFLATE compression, UTF-8 filenames, no encryption, no ZIP64) is implementable in ~60 lines of code. The implementation uses only `node:zlib` (built-in DEFLATE) and `Buffer` operations.

**Consequences**:
- **Positive**: Zero dependencies. The build script is self-contained.
- **Positive**: Full control over the ZIP output format. No surprises from library version changes.
- **Negative**: The implementation does not support ZIP64 (files >4GB), encryption, or multi-disk archives. These limitations are irrelevant for extension packaging but would need to be addressed if requirements change.
- **Negative**: The custom CRC32 and DEFLATE wrapper is harder to audit than a well-known library.

---

## ADR-015

**Title**: Cache API for Large Binary Asset Storage

**Date**: Introduced with wallpaper caching (estimated v0.5.0)

**Status**: Accepted

**Context**: Homebase supports curated 1080p/4K video wallpapers streamed from a Cloudflare R2 CDN, user-uploaded custom wallpaper images, and resolved high-resolution favicons. These binary assets range from 50 KB (favicons) to 50+ MB (4K video files).

**Problem**: `browser.storage.local` stores data as serialized JSON. Storing multi-megabyte binary blobs as base64 strings would be extremely inefficient (33% size overhead) and would slow down all storage reads by inflating the serialized payload. `localStorage` has a 5–10 MB hard quota — far too small for video assets.

**Decision**: Use the browser's Cache API (`window.caches`) with named cache buckets to store binary assets as Response objects:

| Cache Bucket | Content | Purpose |
|:---|:---|:---|
| `wallpaper-assets` | MP4/WebM video files, poster images | Offline playback of curated wallpapers |
| `user-wallpapers-v1` | User-uploaded images | Custom wallpaper persistence |
| `favicons-v1` | Resolved website favicons | Offline favicon display for bookmarks |
| `gallery-posters` | Wallpaper gallery thumbnail posters | Gallery grid thumbnail display |

**Alternatives considered**:
- **IndexedDB with Blob storage**: IndexedDB can store Blobs natively. More powerful query capabilities than Cache API. But the Cache API's Request/Response model maps naturally to the URL-keyed asset retrieval pattern, and IndexedDB adds transaction management complexity.
- **`browser.storage.local` with base64 encoding**: Works for small assets but impractical for multi-megabyte videos. The 33% base64 overhead and JSON serialization cost would be severe.
- **Filesystem API**: Powerful but not available in extension contexts in all browsers.

**Reason**: The Cache API is designed for exactly this use case — storing large network responses for offline access. It handles binary data natively without base64 encoding, provides URL-keyed retrieval that maps naturally to asset URLs, and has generous disk quotas (hundreds of MB to GB, depending on available disk space).

**Consequences**:
- **Positive**: Multi-megabyte video wallpapers can be cached locally for instant offline playback.
- **Positive**: No base64 encoding overhead. Binary data is stored and retrieved natively.
- **Positive**: The Cache API's Request/Response model integrates cleanly with `URL.createObjectURL()` for efficient blob-URL playback.
- **Negative**: Cache API storage is subject to browser eviction under disk pressure. Users may lose cached wallpapers without warning.
- **Negative**: No built-in LRU eviction — the favicon cache (`favicons-v1`) grows without bound (documented in [04-code-review.md Issue TD2](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: Firefox's Cache API implementation uses IndexedDB internally, which can have slower cold-start lookup times than Chrome's dedicated cache storage (documented in [06-performance-review.md Section 8](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).

---

## ADR-016

**Title**: Dual-Video Crossfade for Seamless Looping

**Date**: Introduced with video wallpaper feature (estimated v0.5.0)

**Status**: Accepted

**Context**: Homebase supports full-resolution video wallpapers that play continuously behind the dashboard UI. HTML5 `<video>` elements exhibit a visible glitch (black flash or freeze frame) when looping via the `loop` attribute or seeking back to the start.

**Problem**: When an HTML5 video reaches its end and loops, there is a 1–3 frame gap where the browser must seek to frame 0, decode the first GOP (Group of Pictures), and display it. This creates a visible "hiccup" that breaks the ambient wallpaper illusion.

**Decision**: Use two `<video>` elements ([new-tab.html:437-439](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html#L437-L439)) — `#background-video` and `#background-video-next`. When the active video approaches its end (detected via `timeupdate` or `requestVideoFrameCallback`), the next video begins playing the same source from frame 0 with opacity crossfading from 0 to 1. The active video fades out while the next video fades in, creating a seamless visual loop.

**Alternatives considered**:
- **Native `<video loop>` attribute**: Simplest approach but produces visible loop glitch on most browsers.
- **Single video with seek**: Seek the single video to 0 before it reaches the end. Still produces a visible decode gap.
- **Canvas-based rendering**: Render video frames to a `<canvas>` element for frame-perfect control. But adds CPU overhead for per-frame `drawImage()` calls and loses hardware-accelerated video decoding.
- **MediaSource Extensions (MSE)**: Build a custom media pipeline that pre-buffers loop segments. Extremely complex and not justified for ambient background video.

**Consequences**:
- **Positive**: Seamless, glitch-free video loops that create a premium ambient wallpaper experience.
- **Negative**: Two `<video>` elements double GPU video decode memory consumption.
- **Negative**: Continuous `timeupdate` listeners fire 4–5 times per second per video, causing unnecessary CPU wakeups (documented in [06-performance-review.md Issue C2](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).
- **Negative**: `backdrop-filter` blur effects over two simultaneously playing videos create extreme GPU compositing load (documented in [06-performance-review.md Issue R5](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md)).

---

## ADR-017

**Title**: Custom RSS XML Parser Instead of External Library

**Date**: Introduced with news widget (estimated v0.6.0)

**Status**: Accepted

**Context**: The news widget fetches RSS/Atom XML feeds from BBC, Al Jazeera, ESPN, ESPN Cricinfo, TechCrunch, and custom user-provided URLs. The feeds must be parsed into structured article objects (title, link, date, image, description).

**Problem**: RSS feed formats vary significantly across providers. XML parsing libraries (e.g. `xml2js`, `fast-xml-parser`, `cheerio`) would add npm dependencies, violating ADR-002. The browser's built-in `DOMParser` can parse XML but returns raw DOM trees that must be manually traversed.

**Decision**: Use the browser's native `DOMParser().parseFromString(text, 'text/xml')` to parse RSS XML, then traverse the resulting DOM tree using standard `querySelector()` and `querySelectorAll()` methods to extract `<item>` / `<entry>` elements and their child fields. Feed-specific quirks (different image element locations, namespace prefixes, date formats) are handled with per-source adapter logic in [news.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/news.js).

**Alternatives considered**:
- **`xml2js` or `fast-xml-parser`**: npm packages that convert XML to JSON. Simple APIs but add dependencies (violating ADR-002).
- **Fetch JSON-based news APIs**: Use structured JSON APIs instead of raw RSS. But most free news APIs require API keys, have rate limits, and track usage — violating the privacy-first principle (ADR-020).
- **Server-side RSS proxy**: Host a server that fetches, parses, and caches RSS feeds. Would simplify client code but adds infrastructure cost, a single point of failure, and a data intermediary that sees user news preferences.

**Reason**: `DOMParser` is a zero-dependency, browser-native API that handles well-formed XML reliably. The adapter pattern for feed-specific quirks keeps the parsing logic contained within `news.js`. No external infrastructure or API keys are needed.

**Consequences**:
- **Positive**: Zero dependencies. RSS parsing runs entirely in the browser with no external service.
- **Positive**: Privacy preserved — RSS feed URLs are fetched directly from the source with no intermediary.
- **Negative**: Malformed RSS XML (unclosed tags, invalid entities) causes `DOMParser` to return an error document. Error recovery is manual and feed-specific.
- **Negative**: No timeout on RSS fetch requests (documented in [06-performance-review.md Issue N1](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) and [04-code-review.md Issue E3](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md)).
- **Negative**: RSS image URLs from untrusted feeds are set to `img.src` without URL scheme validation (documented in [05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md)).

---

## ADR-018

**Title**: Custom Math Expression Evaluator Instead of eval()

**Date**: Introduced with search calculator feature (estimated v0.4.0)

**Status**: Accepted

**Context**: The search bar supports inline math evaluation — users can type expressions like `2+2`, `=5*10`, `sqrt(16)`, or `100 kg to lbs` and see results inline. This requires evaluating mathematical expressions from user input.

**Problem**: JavaScript's `eval()` and `new Function()` execute arbitrary code. Using them to evaluate user-typed math expressions would create a critical code injection vulnerability. Manifest V3's default CSP blocks `eval()`, but relying on CSP as the only defense is insufficient.

**Decision**: Implement a custom math expression evaluator in [search-utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js) using a regex allowlist (`[\\d\\.\\s\\+\\-\\*\\/\\%\\^\\(\\)]+$`) to validate input before processing. Only characters in the allowlist are permitted. The evaluator handles arithmetic operators, parentheses, exponentiation, and common unit conversions via pattern matching — no `eval()`, no `new Function()`, no dynamic code execution.

**Alternatives considered**:
- **`eval()` with sanitization**: Strip dangerous characters before eval. But sanitization is inherently fragile — creative input can bypass character filters.
- **`math.js` library**: Full-featured math expression parser. But adds an npm dependency (violating ADR-002) and is 150+ KB — larger than the entire search system.
- **Web Worker `eval()`**: Run eval in an isolated Worker context. Limits damage but still executes arbitrary code and adds Worker management complexity.

**Reason**: A regex allowlist is provably safe — if the input contains only digits, operators, parentheses, and whitespace, it cannot execute arbitrary code. The evaluator handles the common use case (arithmetic and unit conversions) without any code execution risk.

**Consequences**:
- **Positive**: Zero code injection risk. The evaluator cannot execute arbitrary JavaScript regardless of input.
- **Positive**: Zero dependencies. The entire evaluator is ~50 lines of vanilla JavaScript.
- **Positive**: Explicitly praised in the security audit ([05-security-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md)) as a security strength.
- **Negative**: Limited mathematical capabilities compared to `math.js` — no variables, no symbolic algebra, no matrix operations. But these are not needed for a search bar calculator.
- **Negative**: 0% unit test coverage for edge cases (division by zero, operator precedence, nested parentheses) — documented in [04-code-review.md Issue T1](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md).

---

## ADR-019

**Title**: Progressive Modular Extraction Strategy

**Date**: Formalized in AGENTS.md (v0.10.0+)

**Status**: Accepted (ongoing)

**Context**: The main runtime file [new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) grew organically to 13,067 lines (307 KB) as features were added. The monolithic file now contains bookmark rendering, search, wallpaper management, context menus, drag-and-drop, and startup orchestration — all in a single file.

**Problem**: The monolith is unmaintainable at its current size. Every edit carries regression risk. Editor performance degrades. Code reviews are impractical. But a full rewrite or big-bang modularization would be catastrophically risky for a production extension with active users.

**Decision**: Adopt a progressive extraction strategy: move cohesive blocks of code from `new-tab.js` into focused files under `src/newtab/<domain>/`, one extraction at a time. Each extraction is a pure move — no renaming, no refactoring, no signature changes, no ES module conversion. The extraction rules are codified in AGENTS.md to prevent scope creep.

Completed extractions to date:
- `src/newtab/core/` — `utils.js`, `dialogs.js`, `tab-lifecycle.js`, `perf-report.js`
- `src/newtab/bookmarks/` — `quick-actions.js`, `bookmark-style-runtime.js`, `grid-reorder-animation.js`, `bookmark-tabs-scroll.js`, `folder-picker.js`
- `src/newtab/widgets/` — `weather.js`, `news.js`, `todo.js`, `quote.js`, `time.js`, `widget-visibility.js`
- `src/newtab/search/` — `search-utils.js`, `search-suggestion-cache.js`, `search-history-suggestions.js`
- `src/newtab/settings/` — `settings-preferences.js`, `backup-import.js`, `search-engine-settings.js`, `material-color-picker.js`
- `src/newtab/integrations/` — `firefox-containers.js`, `google-apps.js`
- `src/newtab/wallpaper/` — `dynamic-accent.js`, `cinema-mode-runtime.js`, `gallery-ui.js`
- `src/newtab/tips/` — `homebase-tips-ui.js`

**Alternatives considered**:
- **Big-bang rewrite**: Rewrite the entire codebase with proper module boundaries. Maximum architectural improvement but catastrophic risk — months of work with no user-visible benefit, high probability of introducing regressions.
- **Gradual conversion to ES modules**: Convert files to ES modules one at a time. But mixing classic scripts and modules creates complex execution order semantics. Converting `new-tab.js` to a module changes its global scope behavior, breaking all 30+ files that depend on its globals.
- **IIFE wrapping**: Wrap each extracted file in an IIFE and export a single namespace object. Adds boilerplate but provides encapsulation. AGENTS.md explicitly says "do not wrap in IIFE unless explicitly requested."

**Reason**: Progressive extraction minimizes risk per change. Each extraction is testable in isolation (moved functions exist exactly once, no duplicate declarations, build passes). The approach is compatible with the classic script architecture (ADR-003) and does not require changing the execution model.

**Consequences**:
- **Positive**: `new-tab.js` has already been reduced from an estimated 20,000+ lines to ~13,000 lines through successful extractions.
- **Positive**: Each extracted module is focused and navigable. `weather.js`, `todo.js`, and `quote.js` are self-contained widget implementations.
- **Positive**: Risk is bounded — a bad extraction affects only the moved code and can be reverted with a single commit.
- **Negative**: The remaining ~13,000 lines in `new-tab.js` contain the highest-risk, most tightly coupled code (bookmarks, search, wallpaper). Further extraction becomes progressively harder.
- **Negative**: Script load order management becomes more complex with each new file. 37+ `<script defer>` tags must be maintained in the correct order.
- **Negative**: The static checker (`check-newtab-static.mjs`) must be updated after every extraction to track declaration locations.

---

## ADR-020

**Title**: Strict Privacy-First Design with Zero Telemetry

**Date**: Project inception (pre-v0.1.0)

**Status**: Accepted

**Context**: Browser new-tab extensions have complete visibility into a user's browsing patterns — which tabs they open, what they search for, which bookmarks they click, and how often they use the browser. This data is extremely valuable for advertising and analytics companies.

**Problem**: Many new-tab extensions monetize user attention through analytics, sponsored content, or data collection. Users installing a new-tab replacement are trusting the extension with intimate details of their daily browsing behavior. Breaching that trust — even with "anonymized" telemetry — undermines the product's core value proposition.

**Decision**: Implement zero analytics, zero telemetry, zero tracking, and zero remote code execution. Specifically:
- No Google Analytics, Mixpanel, Amplitude, or any analytics SDK.
- No pixel tracking, beacon API calls, or diagnostic data uploads.
- No remote script loading (`<script src="https://...">`) — all code is local.
- No user-identifiable data leaves the browser except direct user-initiated actions (search queries to chosen engines, RSS feed fetches to chosen sources, weather API queries to Open-Meteo with coordinates).
- Firefox manifest explicitly declares `"data_collection_permissions": { "required": ["none"], "optional": [] }`.

**Alternatives considered**:
- **Opt-in anonymous telemetry**: Collect aggregate usage stats (feature usage counts, error rates) with user consent. Would inform development priorities but requires building consent UI, data pipeline, and privacy policy infrastructure.
- **Error reporting** (e.g. Sentry): Automatically report JavaScript exceptions to a remote service. Would help diagnose production bugs but transmits stack traces, URLs, and potentially user data.
- **A/B testing framework**: Test feature variations to optimize UX. Requires a remote configuration service and user cohort assignment — fundamentally incompatible with privacy-first design.

**Reason**: Privacy is the product's competitive advantage against mainstream new-tab extensions (Momentum, Toby, etc.) that collect user data. The extension's store listing and README emphasize "strict privacy first" as a core feature. Introducing any telemetry, even opt-in, would undermine this positioning and user trust.

**Consequences**:
- **Positive**: Complete user privacy. No data ever leaves the browser unless the user explicitly initiates it (search, weather location, RSS feed).
- **Positive**: No privacy policy complexity. No GDPR/CCPA compliance requirements beyond what the browser itself handles.
- **Positive**: Firefox store approval is faster with `data_collection_permissions: none`.
- **Negative**: Zero telemetry means zero visibility into production errors, feature adoption, or performance regressions across the user base. Bugs are only discovered when users manually report them.
- **Negative**: Cannot make data-driven product decisions. Feature prioritization relies on user feedback channels rather than usage metrics.
- **Negative**: Cannot A/B test UX improvements or measure the impact of performance optimizations on real users.

---

## ADR Index by Category

### Framework Choices
| ADR | Decision |
|:---|:---|
| [ADR-001](#adr-001) | Vanilla JavaScript — no UI framework |
| [ADR-002](#adr-002) | Zero npm dependencies |
| [ADR-004](#adr-004) | No bundler or transpiler |
| [ADR-014](#adr-014) | Custom ZIP implementation |
| [ADR-017](#adr-017) | Custom RSS parser via DOMParser |

### Storage Choices
| ADR | Decision |
|:---|:---|
| [ADR-005](#adr-005) | Five-tier hybrid storage |
| [ADR-006](#adr-006) | Synchronous localStorage fast-mirrors |
| [ADR-015](#adr-015) | Cache API for binary assets |

### Architecture Patterns
| ADR | Decision |
|:---|:---|
| [ADR-007](#adr-007) | Three-phase boot sequence |
| [ADR-008](#adr-008) | Cooperative idle task scheduler |
| [ADR-012](#adr-012) | Global namespace via window object |
| [ADR-013](#adr-013) | Lazy-load settings and gallery |
| [ADR-016](#adr-016) | Dual-video crossfade |
| [ADR-018](#adr-018) | Custom math evaluator (no eval) |
| [ADR-019](#adr-019) | Progressive modular extraction |
| [ADR-020](#adr-020) | Zero telemetry privacy-first design |

### Browser Compatibility Decisions
| ADR | Decision |
|:---|:---|
| [ADR-003](#adr-003) | Classic deferred scripts (no ES modules) |
| [ADR-009](#adr-009) | Dual Chrome/Firefox from single codebase |
| [ADR-010](#adr-010) | MV3 without background service worker |
| [ADR-011](#adr-011) | No content scripts |

---

> **Document Note**: These ADRs are retroactive documentation of decisions already embedded in the codebase. They capture the reasoning behind existing patterns to guide future contributors and AI agents. In accordance with AGENTS.md rules, no source code was modified during the creation of this document.
