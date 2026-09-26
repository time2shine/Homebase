# Homebase — Official Project State & System Inventory

> **Author**: Core Systems Architect & Lead AI Engineer  
> **Date**: 2026-09-27  
> **Repository Baseline**: `development` branch  
> **Release Target**: Homebase v0.15.1+  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md), [docs/14-ai-change-history.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md)  
> **Status**: Authoritative Reference Document — **DO NOT MODIFY SOURCE CODE**

---

## Table of Contents

1. [Executive Summary & Project Purpose](#1-executive-summary--project-purpose)
2. [High-Level Architecture Summary](#2-high-level-architecture-summary)
3. [Completed AI Improvement Cycles](#3-completed-ai-improvement-cycles)
4. [Current Git State & Version Information](#4-current-git-state--version-information)
5. [Automated Testing System](#5-automated-testing-system)
6. [Multi-Tier Storage Architecture](#6-multi-tier-storage-architecture)
7. [Protected Files & High-Risk Invariants](#7-protected-files--high-risk-invariants)
8. [Next Planned Improvement: Cycle #5](#8-next-planned-improvement-cycle-5)
9. [Documentation Inventory & Reference Map](#9-documentation-inventory--reference-map)

---

## 1. Executive Summary & Project Purpose

**Homebase** is a high-performance, privacy-centric, dual-browser new-tab dashboard extension supporting both **Google Chrome** and **Mozilla Firefox** under Manifest V3. 

The extension is engineered to deliver an **instantaneous (<50ms perceived latency) first-paint render** on every new tab opened, completely eliminating layout shifts and white flashes while providing a rich, deeply personalized workspace.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HOMEBASE CORE MISSION                                  │
├─────────────────────────┬─────────────────────────┬────────────────────────────────────┤
│ INSTANT FIRST-PAINT     │ ABSOLUTE USER PRIVACY   │ ZERO-DEPENDENCY MINIMALISM         │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ Synchronous <head>      │ Zero analytics, zero    │ Zero npm runtime/dev dependencies; │
│ preload layer renders   │ telemetry, zero tracking│ pure vanilla ES2022+; native Node  │
│ visual styles < 10ms    │ and zero remote scripts │ build and test tooling             │
└─────────────────────────┴─────────────────────────┴────────────────────────────────────┘
```

### Core Feature Capabilities
- **Visual Bookmark Grid**: Tabbed folder navigation, drag-and-drop tile reordering (Sortable.js), custom high-res icons, per-folder color customization, and quick-action modals.
- **Unified Multi-Engine Search Bar**: Real-time search across 10 engines (Google, DuckDuckGo, Bing, YouTube, GitHub, Reddit, etc.) with `!<prefix>` bang shortcuts, inline math expression evaluation, unit conversions, and history-based typeahead.
- **Customizable Widgets**: Real-time weather (Open-Meteo API), news feeds (custom RSS parser supporting BBC, Al Jazeera, ESPN, TechCrunch), interactive todo list, daily quotes, and digital/analog clock formats.
- **Dynamic Backgrounds & Video**: Curated 1080p/4K video loops, high-res static poster art, 24-hour daily rotation, and user-uploaded custom media with local Cache API storage.
- **Browser Integrations**: Native Firefox Multi-Account Containers (`contextualIdentities`), Google Apps quick drawer, and clipboard "Paste to Save" bookmarks.
- **Action Popup Companion**: A dedicated toolbar companion popup to bookmark the active web page directly into designated Homebase folders without opening a new tab.

---

## 2. High-Level Architecture Summary

Homebase enforces a strictly constrained, zero-dependency runtime architecture designed for maximum performance and portability.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                HOMEBASE SYSTEM TOPOLOGY                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                 Browser Window (New Tab)                                │
│                                                                                         │
│  Phase 1: Synchronous <head> Preload                                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ src/preload.js (Synchronous) -> reads localStorage fast mirrors                   │  │
│  │ Sets CSS variables (--bg-dim, widget order, clock visibility) before first paint  │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                            ▼                                            │
│  Phase 2: Synchronous Instant Hydration                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ src/instant_load.js (Body top) -> paints cached clock, weather, quote, news, todo │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                            ▼                                            │
│  Phase 3: Deferred Script Execution (<script defer>)                                    │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 40 Classic Deferred Scripts (Core, Widgets, Bookmarks, Wallpaper, Settings)       │  │
│  │ - schema-validator.js: Authoritative schema validation and type defense           │  │
│  │ - schema-migrations.js: Sequential idempotent schema migration runner             │  │
│  │ - storage-diagnostics.js: Read-only storage health audits & anomaly buffer        │  │
│  └─────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                            ▼                                            │
│  Phase 4: Monolithic Runtime & Lifecycle                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ src/new-tab.js (initializePage) -> loads canonical storage, builds bookmark grid, │  │
│  │ starts video wallpaper playback, and launches idle scheduler                      │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Constraints & Rules
- **No Bundler / No ES Modules**: All browser scripts execute as classic `<script defer>` tags in the global `window` scope. Code is never bundled through Webpack, Vite, Rollup, or esbuild.
- **Zero Runtime Dependencies**: The project operates with 0 npm packages in production. Build scripts, packaging, and unit tests are built entirely on Node.js built-in modules (`node:fs`, `node:path`, `node:test`, `node:assert`, `node:zlib`, `node:child_process`).
- **Dual-Manifest Manifest V3**: Maintains parallel manifests for Chrome (`manifests/manifest.chrome.json`) and Firefox (`manifests/manifest.firefox.json`), compiled to `dist/chrome/` and `dist/firefox/` via `scripts/build.mjs`.

---

## 3. Completed AI Improvement Cycles

Homebase has systematically resolved major technical debt, data integrity risks, and testing gaps across five sequential engineering cycles:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              IMPROVEMENT CYCLE PROGRESSION                             │
├──────────────┬──────────────────────────────┬──────────────────────────────────────────┤
│ CYCLE        │ FOCUS AREA                   │ KEY DELIVERABLES & IMPACT                │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Baseline     │ Architectural Audit (Docs)   │ Complete docs/00-15 suite: baseline,     │
│              │                              │ data flows, code review, test strategy   │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #1     │ Custom Wallpaper Protection  │ Registered myWallpapers in backup;       │
│ (v0.15.0)    │ & v0.15.0 Release Prep       │ prevented custom upload deletion         │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #2     │ Unified Testing Baseline     │ Multi-tier npm test harness;             │
│              │                              │ 27 algorithmic unit tests (node:test)    │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #3A    │ Backup Retention & Key Align │ Eliminated destructive backup purges;    │
│              │                              │ aligned action popup folder keys         │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #3B    │ Schema Version Foundation    │ Canonical schemaVersion = 1 marker;      │
│              │                              │ sequential migration runner skeleton     │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #4     │ Storage Validation Engine    │ window.HomebaseValidator; clamping,      │
│              │ & Non-Destructive Backup     │ hex color defense; 50/50 unit tests pass │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #5     │ Storage Health Diagnostics   │ window.HomebaseDiagnostics, audit engine,│
│              │ & Observability Engine       │ migration history, 69 unit tests pass    │
└──────────────┴──────────────────────────────┴──────────────────────────────────────────┘
```

### Detailed Deliverables by Cycle

#### Cycle #1: Wallpaper Retention & v0.15.0 Release
- **Plan & Report**: [`docs/16-first-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/16-first-improvement-plan.md), [`docs/17-release-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/17-release-plan.md), [`docs/18-release-submission-content.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/18-release-submission-content.md).
- **Core Fix**: Resolved critical vulnerability where custom uploaded wallpapers (`myWallpapers` metadata and `user-wallpapers-v1` Cache API bucket) were omitted from backup serialization and deleted on restore.
- **Release**: Tagged and published Homebase v0.15.0.

#### Cycle #2: Unified Testing Baseline
- **Plan & Report**: [`docs/19-second-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/19-second-improvement-plan.md), [`docs/10-testing-strategy.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md).
- **Core Deliverables**: Created unified test runner `scripts/test.mjs` (`npm test`) supporting `--syntax`, `--static`, `--unit`, `--smoke`. Implemented native unit test suites in `tests/unit/` covering search math, unit conversion, URL heuristics, backup validation, widget ordering, and core utilities.

#### Cycle #3A: Backup Retention & Storage Key Alignment
- **Plan & Report**: [`docs/20-third-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md), [`docs/21-cycle3a-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/21-cycle3a-implementation-report.md).
- **Core Deliverables**: Completely removed destructive `browser.storage.local.remove(removals)` from `backup-import.js`, ensuring partial or older backups never delete user settings. Aligned Action Popup bookmark save folder tracking (`homebaseLastUsedFolderId` -> `lastUsedBookmarkFolderId`) with automatic bidirectional fallback and dual-write.

#### Cycle #3B: Storage Schema Versioning Foundation
- **Plan & Report**: [`docs/22-cycle3b-schema-version-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/22-cycle3b-schema-version-plan.md), [`docs/23-cycle3b-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/23-cycle3b-implementation-report.md).
- **Core Deliverables**: Defined canonical `schemaVersion = 1` in `browser.storage.local`. Built `src/newtab/core/schema-migrations.js` featuring fast-path no-op (<1ms), unversioned v0 profile initialization, future version downgrade protection, and atomic dictionary commits. Integrated into startup without touching `src/new-tab.js`.

#### Cycle #4: Storage Validation Architecture & Backup Sanitization
- **Plan & Report**: [`docs/24-cycle4-storage-validation-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/24-cycle4-storage-validation-plan.md), [`docs/25-cycle4-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/25-cycle4-implementation-report.md).
- **Core Deliverables**: Built `src/newtab/core/schema-validator.js` (`window.HomebaseValidator`) providing authoritative schema definitions covering all 74 storage keys with type validation, number/integer clamping, enum checking, 3/6-digit hex color expansion, array bounds, object prototype inspection, and prototype pollution defense. Sanitized backup imports and migration transforms. Total unit tests expanded to 50/50 passing.

#### Cycle #5: Storage Health Diagnostics Architecture & Observability Engine
- **Plan & Report**: [`docs/26-cycle5-storage-health-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/26-cycle5-storage-health-plan.md), [`docs/27-cycle5-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/27-cycle5-implementation-report.md).
- **Core Deliverables**: Built `src/newtab/core/storage-diagnostics.js` (`window.HomebaseDiagnostics`) providing on-demand, read-only `auditStorageHealth()` and pre-flight `auditBackupHealth()`. Integrated persistent `migrationHistory` (capped at 20 records) in `schema-migrations.js`. Hooked `sanitizeKey()` anomalies (clamped, defaulted, normalized, rejected) to an in-memory 50-record ring buffer. Connected performance diagnostics in `perf-report.js`. Implemented 19 automated unit tests in `tests/unit/storage-diagnostics.test.mjs`, expanding test baseline to 69/69 passing tests. Zero startup latency overhead.

---

## 4. Current Git State & Version Information

### Git Repository State
- **Active Branch**: `development`
- **Upstream Tracking**: `origin/development` (up to date)
- **Working Tree**: Clean (untracked plan document: `docs/26-cycle5-storage-health-plan.md`)
- **Recent Commit Ledger**:
  ```text
  528c997 (HEAD -> development) Implement storage validation architecture and backup sanitization
  a424caf Add storage schema version foundation
  28a6bd8 Fix backup retention and align storage keys
  b1b99a1 Implement unified test runner and unit test suites
  c43b943 (tag: v0.15.0) Release Homebase v0.15.0
  ```

### Version Catalog
| Metadata Component | Canonical Value | File Location |
| :--- | :---: | :--- |
| **Package Version** | `0.15.0` | [`package.json`](file:///c:/Users/Administrator/Desktop/Homebase/package.json) |
| **Chrome Manifest Version** | `0.15.0` | [`manifests/manifest.chrome.json`](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json) |
| **Firefox Manifest Version** | `0.15.0` | [`manifests/manifest.firefox.json`](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json) |
| **Storage Schema Version** | `1` | `CURRENT_SCHEMA_VERSION` in [`src/newtab/core/schema-migrations.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/schema-migrations.js) |
| **Backup Envelope Schema** | `"homebase.export"` | `HOMEBASE_BACKUP_SCHEMA` in [`src/newtab/settings/backup-import.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) |
| **Backup Envelope Version**| `1` | `HOMEBASE_BACKUP_VERSION` in [`src/newtab/settings/backup-import.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) |

---

## 5. Automated Testing System

Homebase features a zero-dependency, 4-tier automated test harness driven by `npm.cmd test` (`node scripts/test.mjs`).

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      4-TIER AUTOMATED TEST PIPELINE                     │
├─────────┬─────────────────────────────┬─────────────────────────────────┤
│ STAGE   │ SCRIPT / TOOL               │ CURRENT STATUS & COVERAGE       │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 1 │ V8 Syntax Validation        │ 57/57 JavaScript files checked; │
│         │ node --check                │ 0 syntax errors (PASS)          │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 2 │ Static Structural Checker   │ 40 deferred scripts checked;    │
│         │ check-newtab-static.mjs     │ 87 declarations; order verified │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 3 │ Algorithmic Unit Tests      │ 69 automated tests (node:test); │
│         │ tests/unit/*.test.mjs       │ 69/69 passing (0 failures)      │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 4 │ Browser Smoke Test (CDP)    │ Connects to Chromium via CDP;   │
│         │ smoke-newtab-file.mjs       │ verifies DOM mounting and marks │
└─────────┴─────────────────────────────┴─────────────────────────────────┘
```

### Current Unit Test Suites (`tests/unit/`)
1. [`tests/unit/search-utils.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/search-utils.test.mjs) (12 tests): Math parser, operator precedence, division-by-zero protection, unit conversions, URL heuristics.
2. [`tests/unit/backup-validation.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/backup-validation.test.mjs) (11 tests): `isPlainObject`, custom wallpaper sanitization, todo list normalization, non-destructive partial restore, action popup legacy migration, recent folders cap.
3. [`tests/unit/widget-order.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/widget-order.test.mjs) (4 tests): `normalizeWidgetOrder`, missing widget recovery, deduplication, equality checking.
4. [`tests/unit/core-utils.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/core-utils.test.mjs) (5 tests): `escapeHtml` XSS sanitization, `shuffleArray`, `debounce` timing/cancel, `throttle`.
5. [`tests/unit/schema-migrations.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/schema-migrations.test.mjs) (9 tests): Fresh install initialization, legacy profile upgrade, current version fast path, idempotency, atomic commits, downgrade protection, failure containment.
6. [`tests/unit/schema-validator.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/schema-validator.test.mjs) (9 tests): Identity checks, float/integer clamping, hex color validation, enum bounds, array length bounds, prototype pollution defense, corrupted payload sanitization, performance benchmark (<3ms).
7. [`tests/unit/storage-diagnostics.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/storage-diagnostics.test.mjs) (19 tests): Storage health classification, backup pre-flight audit, anomaly ring buffer, performance metrics buffer, migration history retrieval, privacy redaction, and error containment.

---

## 6. Multi-Tier Storage Architecture

Homebase balances instant first-paint speed with deep persistence across five distinct physical storage mechanisms:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HOMEBASE STORAGE TIERS                                 │
├─────────────────────────┬─────────────────────────┬────────────────────────────────────┤
│ STORAGE TIER            │ ACCESS & LIFESPAN       │ PAYLOAD & ROLE                     │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ 1. window.localStorage  │ Synchronous, Origin Cap │ 18 fast mirrors: --bg-dim, widget  │
│                         │ (5-10MB), Persistent    │ order, clock format, weather data  │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ 2. browser.storage.local│ Asynchronous, IndexedDB │ 74+ canonical keys: user prefs,    │
│                         │ Unlimited, Persistent   │ bookmark meta, todos, schemaVersion│
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ 3. window.caches (API)  │ Asynchronous, Disk Cap  │ 4 buckets: wallpaper-assets,       │
│                         │ Evictable Blobs         │ gallery-posters, user-wallpapers   │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ 4. window.sessionStorage│ Synchronous, Tab-Bound  │ Ephemeral startup metrics and perf │
│                         │ Cleared on tab close    │ health: homebasePerfHealthSession  │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ 5. JS In-Memory Heap    │ Ultra-fast, Ephemeral   │ Decoded bookmark trees, Sortable   │
│                         │ Runtime Execution       │ instances, LRU search cache (100)  │
└─────────────────────────┴─────────────────────────┴────────────────────────────────────┘
```

### Storage Protection Rules
- **No `browser.storage.sync`**: Intentionally omitted to protect user privacy and avoid 100KB account quota limits.
- **Dual-Write Synchronization**: Runtime preference modifications mutate in-memory state, queue asynchronous `browser.storage.local.set()`, and update synchronous `window.localStorage` mirrors.
- **Authoritative Validation Barrier**: All backup imports and migration commits must pass through `HomebaseValidator.sanitizeStorageBatch()`.

---

## 7. Protected Files & High-Risk Invariants

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following high-risk files and areas are **strictly protected** and must not be modified unless an explicit instruction mandates it:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     STRICTLY PROTECTED REPOSITORY AREAS                 │
├───────────────────────────────┬─────────────────────────────────────────┤
│ FILE / SUBSYSTEM              │ REASON FOR STRICT PROTECTION            │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/new-tab.js                │ Monolithic runtime (7,800+ lines);      │
│ (initializePage, bookmarks)   │ controls startup, drag-drop, grid       │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/preload.js                │ Synchronous <head> preloader; must      │
│                               │ never throw or block first-paint        │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/instant_load.js           │ Synchronous <body> instant hydration;   │
│                               │ must remain lightweight and dependency-free│
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/new-tab.css & src/css/*   │ 5,700-line stylesheet; high risk of     │
│                               │ cascade breakage or layout shift        │
├───────────────────────────────┼─────────────────────────────────────────┤
│ manifests/manifest.*.json     │ WebExtension manifests; store-reviewed  │
│                               │ permissions and MV3 compliance          │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/assets/js/Sortable.min.js │ Minified vendor drag-and-drop library   │
├───────────────────────────────┼─────────────────────────────────────────┤
│ dist/                         │ Generated distribution outputs;         │
│                               │ must never be committed to git          │
└───────────────────────────────┴─────────────────────────────────────────┘
```

---

## 8. Next Planned Improvement: Cycle #6

**Cycle #6: Developer Debug Panel & UI Diagnostic Overlay Integration**  
Detailed Specification: `docs/28-cycle6-debug-panel-plan.md` (to be authored)

### The Problem Being Addressed
While storage health diagnostics, validation anomalies, and migration history are now fully queryable via programmatic APIs (`window.HomebaseDiagnostics`), non-technical users and general extension testers cannot inspect these diagnostics without opening DevTools. Integrating a non-intrusive Diagnostic Health card into Settings $\to$ Advanced and exposing a 1-click "Export Health Report" button will empower users to provide complete, privacy-safe diagnostic reports when filing bug reports.

### Key Scope Deliverables
1. **Settings Diagnostic UI**:
   - Expose Storage Health Status (`HEALTHY` / `DEGRADED` / `CORRUPTED`) badge in Settings $\to$ Advanced $\to$ Developer.
   - Add "Copy Diagnostic Health Report" button hooked directly to `HomebaseDiagnostics.exportHealthReport()`.
2. **Performance Overlay Health Section**:
   - Surface storage health status and migration version in the existing debug performance overlay (`debugPerfOverlay`).
3. **Automated End-to-End Tests**:
   - Validate UI button integration and clipboard copy behavior under unit test harness.

---

## 9. Documentation Inventory & Reference Map

The `docs/` directory maintains an exhaustive architectural, operational, and historical record of the repository:

| Document File | Purpose & Contents |
| :--- | :--- |
| [`docs/00-project-state.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md) | **This Document**: Authoritative summary of project state, architecture, and roadmap. |
| [`docs/00-project-baseline.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md) | Initial repository baseline and 13-point inspection report. |
| [`docs/01-architecture.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md) | In-depth technical architecture, script execution order, and component roles. |
| [`docs/02-feature-map.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/02-feature-map.md) | Functional map of all user-facing features, widgets, search, and settings. |
| [`docs/03-data-architecture.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md) | Complete multi-tier storage architecture, 76-key inventory, and cache strategies. |
| [`docs/04-code-review.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) | Professional code quality review, maintainability findings, and technical debt audit. |
| [`docs/05-security-review.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/05-security-review.md) | Security audit: CSP, XSS sanitization, network privacy, and extension permissions. |
| [`docs/06-performance-review.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md) | Startup latency analysis, FOUC elimination, memory profiling, and FPS metrics. |
| [`docs/07-improvement-roadmap.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md) | Phased refactoring roadmap across storage, testing, modularization, and release. |
| [`docs/08-development-guidelines.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md) | Code style, script order conventions, Windows commands, and safety rules. |
| [`docs/09-architecture-decisions.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/09-architecture-decisions.md) | Formal Architecture Decision Records (ADRs 001–008). |
| [`docs/10-testing-strategy.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md) | Quality assurance protocol, test pyramid, CDP smoke harness, and test cases. |
| [`docs/11-api-integration-map.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/11-api-integration-map.md) | Browser extension API dependencies (Chrome vs Firefox parity matrix). |
| [`docs/12-release-process.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md) | Production release playbook, manifest alignment, ZIP packaging, and store submissions. |
| [`docs/13-maintenance-log.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md) | Active chronological engineering ledger tracking every physical code modification. |
| [`docs/14-ai-change-history.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md) | AI governance ledger tracking prompts, models, test evidence, and human review states. |
| [`docs/15-documentation-validation.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md) | Verification and consistency audit across all documentation files. |
| [`docs/16-first-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/16-first-improvement-plan.md) | Improvement Cycle #1 plan: Custom wallpaper backup fix. |
| [`docs/17-release-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/17-release-plan.md) | Homebase v0.15.0 release manager plan. |
| [`docs/18-release-submission-content.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/18-release-submission-content.md) | Chrome Web Store and Firefox Add-ons submission metadata. |
| [`docs/19-second-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/19-second-improvement-plan.md) | Improvement Cycle #2 plan: Unified testing baseline (`npm test`). |
| [`docs/20-third-improvement-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md) | Improvement Cycle #3 Master Plan: Backup durability & schema versioning. |
| [`docs/21-cycle3a-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/21-cycle3a-implementation-report.md) | Improvement Cycle #3A implementation and verification report. |
| [`docs/22-cycle3b-schema-version-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/22-cycle3b-schema-version-plan.md) | Improvement Cycle #3B plan: Schema version foundation and migration runner. |
| [`docs/23-cycle3b-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/23-cycle3b-implementation-report.md) | Improvement Cycle #3B implementation and verification report. |
| [`docs/24-cycle4-storage-validation-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/24-cycle4-storage-validation-plan.md) | Improvement Cycle #4 plan: Storage validation architecture. |
| [`docs/25-cycle4-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/25-cycle4-implementation-report.md) | Improvement Cycle #4 implementation and verification report. |
| [`docs/26-cycle5-storage-health-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/26-cycle5-storage-health-plan.md) | Improvement Cycle #5 plan: Storage health diagnostics & observability. |
| [`docs/27-cycle5-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/27-cycle5-implementation-report.md) | Improvement Cycle #5 implementation and verification report. |
