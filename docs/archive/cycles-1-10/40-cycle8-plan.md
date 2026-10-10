# Homebase — Improvement Cycle #8 Architecture Audit & Implementation Plan
## Storage Layer Migration, Utility Unification, Startup Optimization & Auto-Repair Preview

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-28  
> **Cycle ID**: Homebase Improvement Cycle #8  
> **Target Release**: Homebase v0.16.0  
> **Baseline Commit**: `2e6cfc9` ("Optimize performance and harden backup roundtrip validation")  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md), [docs/34-cycle7-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/34-cycle7-plan.md), [docs/39-cycle7-phase3-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/39-cycle7-phase3-implementation-report.md)  
> **Scope**: Strategic Architecture Audit and Phased Implementation Plan for Cycle #8 — **PLANNING DOCUMENT ONLY — ZERO SOURCE CHANGES**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture State & Baseline Inventory](#2-current-architecture-state--baseline-inventory)
   - [2.1 High-Level Architecture Topology](#21-high-level-architecture-topology)
   - [2.2 Active Verification Baseline & Automated Test Suite](#22-active-verification-baseline--automated-test-suite)
   - [2.3 Multi-Tier Storage Architecture Post-Cycle #7](#23-multi-tier-storage-architecture-post-cycle-7)
3. [Comprehensive Technical Debt & Architecture Audit](#3-comprehensive-technical-debt--architecture-audit)
   - [3.1 Dimension A: Storage Architecture & Facade Migration Gap](#31-dimension-a-storage-architecture--facade-migration-gap)
   - [3.2 Dimension B: Performance & Startup Path Lifecycle](#32-dimension-b-performance--startup-path-lifecycle)
   - [3.3 Dimension C: UI/UX & Diagnostic Maturity](#33-dimension-c-uiux--diagnostic-maturity)
   - [3.4 Dimension D: Code Quality, Duplication & Dead Code](#34-dimension-d-code-quality-duplication--dead-code)
   - [3.5 Dimension E: Backup, Recovery & Portability Edge Cases](#35-dimension-e-backup-recovery--portability-edge-cases)
   - [3.6 Dimension F: Release Readiness & Manifest Quality](#36-dimension-f-release-readiness--manifest-quality)
4. [Proposed Cycle #8 Objectives](#4-proposed-cycle-8-objectives)
5. [Priority Ranking & Effort Matrix](#5-priority-ranking--effort-matrix)
6. [Implementation Phases](#6-implementation-phases)
   - [6.1 Phase 1: Storage Facade Hardening & Utility Unification](#61-phase-1-storage-facade-hardening--utility-unification)
   - [6.2 Phase 2: Widget & Settings Migration to HomebaseStorage](#62-phase-2-widget--settings-migration-to-homebasestorage)
   - [6.3 Phase 3: Startup Path Optimization & Auto-Repair Dry-Run Preview](#63-phase-3-startup-path-optimization--auto-repair-dry-run-preview)
   - [6.4 Phase 4: Cache Resilience, Documentation & Release Readiness](#64-phase-4-cache-resilience-documentation--release-readiness)
7. [File Impact Analysis](#7-file-impact-analysis)
8. [Security & Privacy Considerations](#8-security--privacy-considerations)
9. [Testing & Quality Assurance Strategy](#9-testing--quality-assurance-strategy)
10. [Rollback Strategy & Operational Guardrails](#10-rollback-strategy--operational-guardrails)

---

## 1. Executive Summary

Homebase has achieved substantial architectural maturity through Cycles #5, #6, and #7. As of commit `2e6cfc9`, the extension possesses:
- A canonical **`schemaVersion = 1`** migration engine with atomic step rollbacks (`schema-migrations.js`).
- A synchronous **`HomebaseValidator`** enforcing schema invariants, integer bounds, and prototype pollution defenses (`schema-validator.js`).
- A **`HomebaseDiagnostics`** engine powering a 74-key Subsystem Health Matrix and Developer HUD overlay (`storage-diagnostics.js`, `diagnostic-ui.js`).
- A unified **`HomebaseStorage`** facade providing validation gating, synchronous fast-mirror synchronization, and snapshotting (`storage-service.js`).
- A **Transactional Backup Restoration Engine** with pre-write snapshots and selective rollback (`backup-import.js`).
- A **1×1 bilinear canvas downsampling** engine reducing wallpaper accent extraction memory from 33 MB to 4 bytes (-99.9999%) and a 7-second abort watchdog for news RSS fetches (`dynamic-accent.js`, `news.js`).
- A comprehensive **137-assertion automated test suite** running in 1.11 seconds with 100% PASS rate across all 4 stages.

### The Problem Statement for Cycle #8

Despite the creation of `window.HomebaseStorage` in Cycle #7 Phase 1, **the actual migration of dashboard modules to this facade is only ~5% complete**:
1. **Scattered Direct Storage Calls**: 59 direct calls to `browser.storage.local` remain scattered across 15 extracted widget and settings modules (`weather.js`, `quote.js`, `todo.js`, `news.js`, `widget-visibility.js`, `settings-preferences.js`, `settings-ui.js`, etc.). Another 62 direct calls reside in the monolithic `src/new-tab.js`.
2. **Validation Gating Bypass**: Because widgets write directly to `browser.storage.local.set()`, routine updates bypass `HomebaseValidator`. Corrupted states or out-of-bounds numbers can persist undetected until a diagnostic scan is triggered.
3. **Storage Mirror Discrepancies**:
   - `FAST_MIRROR_MAP` in `storage-service.js` has a confirmed mapping bug: `clockFormat: 'fast-clock-format'`. The canonical storage key is `appTimeFormatPreference`, and the fast mirror key checked by `instant_load.js` and `time.js` is `'fast-time-format'`.
   - Phantom keys `appSearchAlignment: 'fast-search-align'` and `appCustomColor: 'fast-custom-color'` exist in `FAST_MIRROR_MAP` despite not existing in `HOMEBASE_OWNED_STORAGE_KEYS`.
4. **Startup Latency Bottlenecks**:
   - In `initializePage()`, `loadFolderMetadata()` runs sequentially after the initial storage load batch, injecting 15–40ms of avoidable IPC latency.
   - In `scheduleStartupHydrationTasks()`, all 8 idle tasks are unconditionally queued and executed even if the user has disabled the corresponding widget in preferences.
5. **Code Duplication**: Utility routines like `isPlainObject(value)` are defined 4 separate times, and `areValuesIdentical` is partially inlined across files.
6. **Auto-Repair Transparency Gap**: The diagnostic auto-repair feature directly applies mutations without a dry-run confirmation modal, leaving users unaware of which keys were altered.
7. **Cache & Portability Edge Cases**: Custom wallpapers (`myWallpapers`) backed by Cache Storage (`user-wallpapers-v1`) lose their image/video blobs when a backup is exported and restored on a different browser profile or machine.

**Homebase Improvement Cycle #8** systematically addresses these gaps through 4 disciplined phases, completing the storage migration, unifying core utilities, optimizing startup execution, and introducing the auto-repair dry-run preview.

---

## 2. Current Architecture State & Baseline Inventory

### 2.1 High-Level Architecture Topology

Homebase is an offline-first dual-browser new-tab dashboard targeting Chrome (Manifest V3) and Firefox (Manifest V3/V2 Gecko) with zero npm runtime dependencies and classic deferred script execution:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HOMEBASE RUNTIME TOPOLOGY                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Synchronous Preload (<head>)                                                        │
│    - src/preload.js (548 lines): Reads 18 localStorage fast-mirrors (<10ms)           │
│    - Sets CSS variables (--bg-dim, widget order, font size, sidebar mode) before paint │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Synchronous Instant Hydration (<body> top)                                          │
│    - src/instant_load.js (448 lines): Reads fast-* keys; injects cached clock,        │
│      weather, quote, news, and todo cards into #instant-container before scripts load  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Deferred Runtime Modules (41 <script defer> tags in src/new-tab.html)               │
│    - Core: utils.js, schema-validator.js, schema-migrations.js, storage-diagnostics.js,│
│      storage-service.js, perf-report.js, startup-perf-runtime.js                       │
│    - Settings: settings-preferences.js, search-engine-settings.js, diagnostic-ui.js,  │
│      backup-import.js, action-popup-migration.js, visual-effects-settings.js           │
│    - Widgets: time.js, weather.js, quote.js, todo.js, news.js, widget-visibility.js    │
│    - Bookmarks: bookmark-style-runtime.js, folder-picker.js, quick-actions.js, etc.   │
│    - Wallpaper: dynamic-accent.js, gallery-ui.js                                       │
│    - Vendor: Sortable.min.js                                                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Monolithic Coordinator                                                              │
│    - src/new-tab.js (13,067 lines): initializePage, bookmark grid, live search,        │
│      wallpaper video player, startup idle queue                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Active Verification Baseline & Automated Test Suite

Current baseline verified at commit `2e6cfc9`:
```text
========================================
       HOMEBASE TEST SUITE SUMMARY      
========================================
  ✓ PASS  Syntax Validation (node --check) (1.93s) — 58 JS/MJS files clean
  ✓ PASS  Static Invariants (check-newtab-static.mjs) (0.17s) — 41 scripts, 33 modules, 87 globals
  ✓ PASS  Unit Tests (node:test) (1.15s) — 137/137 assertions passing (100% PASS)
  ✓ PASS  Browser Smoke Test (smoke-newtab-file.mjs) (0.05s) — Headless CDP check
----------------------------------------
Total: 4/4 stages passed.
========================================
```

#### Suite Breakdown (10 suites, 137 assertions):
1. `tests/unit/backup-roundtrip.test.mjs` (7 tests): Full 74-key export/import round-trip durability, schema version retention, zero-PII privacy assertions.
2. `tests/unit/backup-transaction.test.mjs` (12 tests): Transaction lifecycle, delta calculation, atomic rollback, fast-mirror restoration.
3. `tests/unit/storage-service.test.mjs` (22 tests): `HomebaseStorage` single/batch get/set, validation gating, fast-mirror sync, deep cloning snapshot.
4. `tests/unit/diagnostic-ui.test.mjs` (25 tests): UI mounting, health badges, subsystem matrix, auto-repair minimal mutations, quota telemetry, HUD minimization.
5. `tests/unit/storage-diagnostics.test.mjs` (19 tests): Audit engine, health statuses, anomaly ring buffer, performance buffer, migration history.
6. `tests/unit/schema-validator.test.mjs` (9 tests): Clamping, hex expansion, enum checking, prototype pollution defense, performance benchmark (<3ms).
7. `tests/unit/schema-migrations.test.mjs` (9 tests): Schema versioning, legacy upgrade, fast-path, idempotency, atomic commits, future version protection.
8. `tests/unit/search-utils.test.mjs` (12 tests): Math parsing, operator precedence, division by zero, unit conversion, URL heuristics.
9. `tests/unit/backup-validation.test.mjs` (11 tests): Schema validation, custom wallpapers, todo normalization, action popup migration.
10. `tests/unit/core-utils.test.mjs` (7 tests): HTML escaping, array shuffling, debounce/throttle, widget order normalization.
11. `tests/unit/widget-order.test.mjs` (4 tests): Deduplication, canonical order fallback, equality comparison.

### 2.3 Multi-Tier Storage Architecture Post-Cycle #7

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              5-TIER STORAGE ARCHITECTURE                               │
├─────────┬──────────────────────┬─────────────┬─────────────────────────────────────────┤
│ TIER    │ MEDIUM               │ CAPACITY    │ RESPONSIBILITY                          │
├─────────┼──────────────────────┼─────────────┼─────────────────────────────────────────┤
│ Tier 1  │ window.localStorage  │ ~5–10 MB    │ 18 synchronous fast-mirrors for <head>  │
│         │                      │             │ preload & instant-load card rendering   │
├─────────┼──────────────────────┼─────────────┼─────────────────────────────────────────┤
│ Tier 2  │ browser.storage.local│ Unlimited   │ 74 canonical keys across 5 subsystems:  │
│         │                      │ (with perm) │ System, Bookmarks, Media, Widgets, Search│
├─────────┼──────────────────────┼─────────────┼─────────────────────────────────────────┤
│ Tier 3  │ window.caches        │ Up to 50 MB │ Binary asset caches: user-wallpapers-v1,│
│         │ (Cache Storage API)  │             │ gallery-posters, wallpaper-assets, favs │
├─────────┼──────────────────────┼─────────────┼─────────────────────────────────────────┤
│ Tier 4  │ window.sessionStorage│ ~5 MB       │ Ephemeral tab-bound UI states:          │
│         │                      │             │ homebasePerfOverlayMinimized            │
├─────────┼──────────────────────┼─────────────┼─────────────────────────────────────────┤
│ Tier 5  │ JS In-Memory Heap    │ Dynamic     │ Fast runtime models, Sortable instances,│
│         │                      │             │ LRU search cache, anomaly ring buffer   │
└─────────┴──────────────────────┴─────────────┴─────────────────────────────────────────┘
```

---

## 3. Comprehensive Technical Debt & Architecture Audit

### 3.1 Dimension A: Storage Architecture & Facade Migration Gap

#### Finding A.1: Migration Toward `HomebaseStorage` is Stalled at ~5%
A comprehensive source code scan reveals the following distribution of direct `browser.storage.local` calls:

| Subsystem File | Direct `storage.local` Calls | Uses `HomebaseStorage`? | Primary Storage Operations |
| :--- | :---: | :---: | :--- |
| `src/newtab/widgets/weather.js` | **15** | NO | Reads units, sets cached weather, removes lat/lon |
| `src/newtab/widgets/quote.js` | **8** | NO | Reads tags/frequency, sets quote index, sets tags |
| `src/newtab/widgets/todo.js` | **6** | NO | Reads items/hideDone, writes todo item array |
| `src/newtab/widgets/widget-visibility.js` | **6** | NO | Reads/writes widget order & visibility booleans |
| `src/newtab/settings/settings-ui.js` | **5** | NO | Reads/writes preferences from settings modal |
| `src/newtab/widgets/news.js` | **4** | NO | Reads/writes news source preference |
| `src/newtab/wallpaper/gallery-ui.js` | **3** | NO | Reads/writes favorites and wallpaper selections |
| `src/newtab/settings/search-engine-settings.js` | **3** | NO | Reads/writes custom engine configs & active ID |
| `src/newtab/settings/settings-preferences.js` | **3** | NO | Reads preferences batch, writes perf/overlay |
| `src/newtab/core/perf-report.js` | **3** | NO | Writes debug performance toggle state |
| `src/action-popup/action-popup.js` | **3** | NO | Reads/writes popup preferences |
| `src/newtab/integrations/firefox-containers.js` | **2** | NO | Reads/writes container preferences |
| `src/newtab/settings/diagnostic-ui.js` | **2** | NO | Auto-repair commits via direct `set()` |
| `src/newtab/settings/visual-effects-runtime.js` | **2** | NO | Reads glass/animation preferences |
| `src/newtab/settings/visual-effects-settings.js` | **2** | NO | Writes animation speed/style |
| `src/newtab/core/storage-diagnostics.js` | **1** | NO | Direct read for diagnostics |
| `src/newtab/settings/backup-import.js` | **0** | **YES** | Migrated in Cycle #7 Phase 2 |
| `src/newtab/core/storage-service.js` | **6** | (Facade) | Internal gateway implementation |
| `src/new-tab.js` (Protected monolith) | **62** | NO | Monolith coordinator |
| **TOTAL Extracted Modules** | **59** | **1 of 17 (5.8%)**| Widespread direct unabstracted usage |

#### Finding A.2: Bugs and Inconsistencies in `FAST_MIRROR_MAP`
In `src/newtab/core/storage-service.js` (lines 24–37):
```javascript
  const FAST_MIRROR_MAP = Object.freeze({
    appBackgroundDim: 'fast-bg-dim',
    widgetOrder: 'fast-widget-order',
    clockFormat: 'fast-clock-format',            // BUG: Canonical key is appTimeFormatPreference; mirror key is fast-time-format
    appSearchAlignment: 'fast-search-align',      // PHANTOM: Key does not exist in HOMEBASE_OWNED_STORAGE_KEYS
    appBookmarkTextBg: 'fast-bookmark-bg',
    appCustomColor: 'fast-custom-color',          // PHANTOM: Key does not exist in HOMEBASE_OWNED_STORAGE_KEYS
    appPerformanceMode: 'fast-perf-mode',
    appShowSidebar: 'fast-show-sidebar',
    appShowWeather: 'fast-show-weather',
    appShowQuote: 'fast-show-quote',
    appShowNews: 'fast-show-news',
    appShowTodo: 'fast-show-todo'
  });
```
- **The Time Format Bug**: `instant_load.js` line 69 explicitly calls `localStorage.getItem('fast-time-format')`, and `time.js` line 37 calls `localStorage.setItem('fast-time-format', ...)`. `storage-service.js` maps `clockFormat -> 'fast-clock-format'`, neither of which matches the canonical storage key (`appTimeFormatPreference`) nor the fast mirror key (`fast-time-format`).
- **Phantom Keys**: `appSearchAlignment` and `appCustomColor` are referenced nowhere in `src/new-tab.js`, `manifests`, or `HOMEBASE_OWNED_STORAGE_KEYS`.

#### Finding A.3: Dual-Write Inconsistency & Quota Vulnerability
Widgets frequently perform split dual-writes:
```javascript
// Example in widget-visibility.js:
writeFastWidgetOrderMirror(normalized); // localStorage.setItem
browser.storage.local.set({ [WIDGET_ORDER_KEY]: normalized }); // storage.local
```
If `localStorage` throws `QuotaExceededError`, or if the async `set` fails, the two tiers drift out of sync. `HomebaseStorage.set()` solves this atomically with built-in validation and exception containment, but is not yet called by `widget-visibility.js`.

---

### 3.2 Dimension B: Performance & Startup Path Lifecycle

#### Finding B.1: Sequential Storage Read in `initializePage()`
In `src/new-tab.js` (lines 11446–11477):
```javascript
const settingsP = loadAppSettingsFromStorage();
const bookmarkMetaP = loadBookmarkMetadata();
const lastFolderP = loadLastUsedFolderId();
// ...
const parallelResults = await Promise.allSettled([settingsP, bookmarkMetaP, lastFolderP]);
// ...
await loadFolderMetadata(); // <-- SEQUENTIAL BLOCKER! Runs AFTER parallel batch completes
```
`loadFolderMetadata()` reads `folderCustomMetadata` from storage. By running sequentially rather than inside the `Promise.allSettled` parallel batch, it adds **15–40ms of unnecessary IPC delay** to the critical startup path before `initializePage` can proceed.

#### Finding B.2: Unconditional Idle Hydration Scheduling for Disabled Widgets
In `src/new-tab.js` (lines 11756–11780):
```javascript
scheduleStartupHydrationTasks = () => {
  scheduleLabeled(() => loadCachedWeatherSafe(), 'startup:loadCachedWeather');
  scheduleLabeled(() => buildQuoteIndexSafe(), 'startup:quoteIndex');
  scheduleLabeled(() => setupQuoteWidgetSafe(), 'startup:setupQuoteWidget');
  scheduleLabeled(() => setupNewsWidgetSafe(), 'startup:setupNewsWidget');
  scheduleLabeled(() => setupTodoWidgetSafe(), 'startup:setupTodoWidget');
  scheduleLabeled(() => setupSearchSafe(), 'startup:setupSearch');
  scheduleLabeled(() => setupWeatherSafe(), 'startup:setupWeather');
  scheduleLabeled(() => setupAppLauncherSafe(), 'startup:setupAppLauncher');
};
```
All 8 tasks are queued unconditionally. When a user disables news or quotes:
- `startup:setupNewsWidget` still initializes event listeners and runs DOM lookups.
- `startup:quoteIndex` and `startup:setupQuoteWidget` still execute index processing.
- `startup:loadCachedWeather` and `startup:setupWeather` still execute when weather is hidden.
This consumes idle scheduler execution time, delaying background wallpaper decoding and poster caching.

#### Finding B.3: Unbounded Favicon Cache Bucket Growth
In `src/new-tab.js`, the `favicons-v1` cache bucket stores resolved bookmark favicons. It contains no maximum entry ceiling or LRU eviction mechanism. Over months of browsing, users with hundreds of unique bookmarks accumulate dead favicon entries without automated cleanup.

---

### 3.3 Dimension C: UI/UX & Diagnostic Maturity

#### Finding C.1: Storage Auto-Repair Lacks Dry-Run Preview
In `src/newtab/settings/diagnostic-ui.js`, clicking **"Auto-Repair Storage"** immediately executes `sanitizeStorageBatch()` and writes changes via `browser.storage.local.set()`. 
- Users are not shown *what* keys are corrupted or *what* values will be overwritten.
- If a user has a custom setting that was flagged as out-of-bounds, it is reset to the default without warning.
- A transparent dry-run preview modal displaying old vs new values with "Confirm" and "Cancel" buttons is missing (deferred from Cycle #7).

#### Finding C.2: Resilient Widget Network Failure States
In `src/newtab/widgets/news.js` and `weather.js`, if a network fetch fails or times out:
- News displays an empty state or generic error text without distinguishing between "Offline / Cached Mode" and "Network Failure".
- Users lack a clear "Retry Now" button within the widget card.

#### Finding C.3: Pre-Flight Health Badge in Backup Import UI
In `src/newtab/settings/settings-ui.js`, the Backup & Restore panel lets users select a JSON file. The transactional validation runs in the background, but the UI lacks an upfront status card indicating file schema version, key count, and health check results prior to prompting for restore.

---

### 3.4 Dimension D: Code Quality, Duplication & Dead Code

#### Finding D.1: Duplication of `isPlainObject(value)` Across 4 Files
`isPlainObject()` is defined verbatim in:
1. `src/newtab/core/schema-validator.js` (line 12)
2. `src/newtab/core/storage-diagnostics.js` (line 18)
3. `src/newtab/core/storage-service.js` (line 82)
4. `src/newtab/settings/backup-import.js` (line 135)
This violates DRY principles and creates maintenance divergence risk if prototype inspection rules evolve.

#### Finding D.2: Dispersed Object Equality Comparison Logic
`areValuesIdentical(a, b)` exists in `src/newtab/settings/diagnostic-ui.js` (line 454), while `computeStorageDelta()` in `src/newtab/settings/backup-import.js` (lines 204–207) re-implements inline JSON string comparison. Both should rely on a canonical utility in `src/newtab/core/utils.js`.

#### Finding D.3: Numeric Clamping Utilities Not Centralized
`clampNumber(val, min, max, defaultVal)` and `clampInteger(val, min, max, defaultVal)` are defined only inside `schema-validator.js` (lines 54–73). Other modules implement ad-hoc `Math.min(Math.max(...))` logic instead of reusing these vetted helpers.

#### Finding D.4: Stale Storage Key `cachedAppliedPoster`
`cachedAppliedPoster` remains registered in `HOMEBASE_OWNED_STORAGE_KEYS` (line 12 of `backup-import.js`) and in `schema-validator.js` (line 140), despite being superseded by `cachedAppliedPosterUrl` and `cachedAppliedPosterDataUrl`. While retained for backwards compatibility, it should be marked as deprecated in schemas.

---

### 3.5 Dimension E: Backup, Recovery & Portability Edge Cases

#### Finding E.1: Wallpaper Blob Portability Gap in Backup Export/Import
Homebase stores user-uploaded custom wallpapers in Cache Storage bucket `user-wallpapers-v1`. 
- `exportHomebaseState()` serializes the `myWallpapers` metadata array (containing `id`, `title`, `cacheKey`, `posterCacheKey`, `size`, `createdAt`).
- It does **not** serialize the binary blobs stored in `window.caches`.
- **Impact**: If a user exports a backup on Machine A and imports it on Machine B, the metadata exists, but the Cache Storage bucket on Machine B is empty. Homebase fails to find the blob and reverts to the default system wallpaper.
- **Remedy**: During backup export, provide an option or fallback to inline base64 thumbnails/posters, or implement a cache export/import bridge.

#### Finding E.2: Monolithic Backup Restore Without Selective Scope
Currently, `importHomebaseState()` applies all keys present in the JSON archive. Users cannot choose to restore *only Bookmarks*, *only Settings*, or *only Widgets*. Adding selective import filters will give users fine-grained control over recovery.

---

### 3.6 Dimension F: Release Readiness & Manifest Quality

#### Finding F.1: Unused `"cookies"` Permission in Chrome Manifest
`manifests/manifest.chrome.json` declares:
```json
"permissions": [
  "tabs",
  "cookies",
  "storage",
  "history",
  "bookmarks",
  "clipboardRead"
]
```
- In Firefox, `cookies` permission is required by the WebExtensions API to access container tabs (`cookieStoreId` in `browser.tabs.create`).
- In Chrome, **container tabs do not exist**, and no Chrome API uses `chrome.cookies`.
- Declaring `"cookies"` in `manifest.chrome.json` triggers unnecessary automated security flags and extended review delays during Chrome Web Store submissions.

#### Finding F.2: Documentation Desynchronization
`docs/00-project-state.md`, `docs/13-maintenance-log.md`, and `docs/14-ai-change-history.md` do not yet document the architectural deliverables from Cycle #6 (Phases 1–3) and Cycle #7 (Phases 1–3).

---

## 4. Proposed Cycle #8 Objectives

To resolve the audited architectural issues safely and incrementally, Cycle #8 defines **six core objectives**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #8 OBJECTIVES MATRIX                                │
├─────────┬─────────────────────────┬────────────────────────────────────────────────────┤
│ Obj 1   │ Storage Facade          │ Fix FAST_MIRROR_MAP bugs (clock format & phantoms) │
│         │ Hardening               │ in src/newtab/core/storage-service.js              │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Obj 2   │ Core Utility            │ Move isPlainObject, areValuesIdentical, clampNumber│
│         │ Unification             │ & clampInteger into src/newtab/core/utils.js       │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Obj 3   │ Module Storage          │ Migrate extracted widget & settings modules from   │
│         │ Migration               │ direct browser.storage.local to HomebaseStorage    │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Obj 4   │ Startup Path & Idle     │ Parallelize loadFolderMetadata; guard idle widget  │
│         │ Scheduler Optimization  │ hydration tasks against disabled widget preferences│
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Obj 5   │ Diagnostic Auto-Repair  │ Implement interactive dry-run diff preview modal   │
│         │ Dry-Run Preview         │ in src/newtab/settings/diagnostic-ui.js            │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Obj 6   │ Cache & Release         │ Implement LRU pruning for favicons-v1 cache; prune │
│         │ Readiness Hardening     │ cookies from Chrome manifest; sync documentation   │
└─────────┴─────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 5. Priority Ranking & Effort Matrix

| Priority | Objective | Impact | Risk | Complexity | Target Phase |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **P0** | **Obj 1: Storage Facade Hardening (`FAST_MIRROR_MAP`)** | High | Low | Low (0.5 day) | Phase 1 |
| **P0** | **Obj 2: Core Utility Unification (`utils.js`)** | High | Low | Low (0.5 day) | Phase 1 |
| **P1** | **Obj 3: Widget Storage Migration (`HomebaseStorage`)** | Critical | Med | Med (1–2 days) | Phase 2 |
| **P1** | **Obj 4: Startup Path & Idle Hydration Optimization** | High (Perf) | Med | Low (0.5 day) | Phase 3 |
| **P1** | **Obj 5: Diagnostic Auto-Repair Dry-Run Preview** | High (UX) | Low | Med (1 day) | Phase 3 |
| **P2** | **Obj 6: Cache Pruning, Manifest Cleanup & Docs** | Medium | Low | Low (0.5 day) | Phase 4 |

---

## 6. Implementation Phases

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #8 IMPLEMENTATION ROADMAP                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Storage Facade Hardening & Utility Unification                                │
│   - Fix FAST_MIRROR_MAP: appTimeFormatPreference -> 'fast-time-format'                 │
│   - Remove phantom mirror keys (appSearchAlignment, appCustomColor)                    │
│   - Promote isPlainObject, areValuesIdentical, clampNumber, clampInteger to utils.js   │
│   - Deduplicate imports across validator, diagnostics, storage-service, backup-import   │
│   - Verify Stage 1–4 tests pass with zero regressions                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Widget & Settings Migration to HomebaseStorage                                │
│   - Migrate widget-visibility.js to HomebaseStorage.set()                              │
│   - Migrate weather.js, quote.js, todo.js, news.js, time.js to HomebaseStorage        │
│   - Migrate settings-preferences.js, search-engine-settings.js to HomebaseStorage      │
│   - Migrate diagnostic-ui.js repairStorageSafe() to HomebaseStorage.setMany()          │
│   - Expand unit tests with storage mocking in tests/unit/storage-service.test.mjs      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Startup Path Optimization & Auto-Repair Dry-Run Preview                       │
│   - Move loadFolderMetadata() into Promise.allSettled parallel batch in initializePage │
│   - Guard scheduleStartupHydrationTasks() with widget visibility preference checks    │
│   - Build interactive dry-run preview modal in diagnostic-ui.js for Auto-Repair        │
│   - Add unit tests for dry-run preview in tests/unit/diagnostic-ui.test.mjs            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Cache Resilience, Documentation & Release Readiness                           │
│   - Implement LRU pruning ceiling for favicons-v1 cache bucket                         │
│   - Prune unused "cookies" permission from manifests/manifest.chrome.json              │
│   - Update docs/00-project-state.md, 13-maintenance-log.md, 14-ai-change-history.md   │
│   - Execute full dual-browser build (npm.cmd run build) and manual Firefox check       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Phase 1: Storage Facade Hardening & Utility Unification

#### Tasks:
1. **Harden `FAST_MIRROR_MAP` in `src/newtab/core/storage-service.js`**:
   - Change `clockFormat: 'fast-clock-format'` to `appTimeFormatPreference: 'fast-time-format'`.
   - Remove phantom keys `appSearchAlignment: 'fast-search-align'` and `appCustomColor: 'fast-custom-color'`.
   - Update `backup-import.js` line 228 to mirror the corrected key set.
2. **Promote Core Utilities to `src/newtab/core/utils.js`**:
   - Move `isPlainObject(value)` into `utils.js` and export on `window.isPlainObject`.
   - Move `areValuesIdentical(a, b)` into `utils.js` and export on `window.areValuesIdentical`.
   - Add `clampNumber` and `clampInteger` to `utils.js` and export on `window`.
3. **Refactor Existing Modules to Call Canonical Utilities**:
   - `src/newtab/core/schema-validator.js`: Use canonical `isPlainObject`, `clampNumber`, `clampInteger`.
   - `src/newtab/core/storage-diagnostics.js`: Remove duplicate `isPlainObject`.
   - `src/newtab/core/storage-service.js`: Remove duplicate `isPlainObject`.
   - `src/newtab/settings/backup-import.js`: Remove duplicate `isPlainObject`; use canonical `areValuesIdentical` inside `computeStorageDelta`.
   - `src/newtab/settings/diagnostic-ui.js`: Remove local `areValuesIdentical`.
4. **Verification**:
   - `npm.cmd test` passes all 137 unit assertions.
   - New unit tests added to `tests/unit/core-utils.test.mjs` verifying promoted helpers.

### 6.2 Phase 2: Widget & Settings Migration to `HomebaseStorage`

#### Tasks:
1. **Migrate `src/newtab/widgets/widget-visibility.js`**:
   - Replace direct `browser.storage.local.set({ [WIDGET_ORDER_KEY]: normalized })` with:
     ```javascript
     if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
       HomebaseStorage.set(WIDGET_ORDER_KEY, normalized);
     }
     ```
   - Delegate fast-mirror update to `HomebaseStorage` (automatic via `FAST_MIRROR_MAP`).
2. **Migrate `src/newtab/widgets/time.js`**:
   - Replace manual `localStorage.setItem('fast-time-format', ...)` with `HomebaseStorage.set('appTimeFormatPreference', format)`.
3. **Migrate `src/newtab/widgets/weather.js`**:
   - Replace direct `storage.local.get/set/remove` for `weatherUnits`, `weatherCityName`, `weatherLat`, `weatherLon` with `HomebaseStorage.get()` and `HomebaseStorage.set()`.
4. **Migrate `src/newtab/widgets/todo.js`**:
   - Replace direct `storage.local.set({ [TODO_ITEMS_KEY]: items })` with `HomebaseStorage.set(TODO_ITEMS_KEY, items)`.
   - Automatic validation ensures todo text strings are bounded and sanitized.
5. **Migrate `src/newtab/widgets/quote.js` & `news.js`**:
   - Migrate `quoteIndex`, `quoteTags`, `quoteUpdateFrequency` and `appNewsSource` writes to `HomebaseStorage`.
6. **Migrate `src/newtab/settings/diagnostic-ui.js` Auto-Repair**:
   - In `repairStorageSafe()`, replace `browserInstance.storage.local.set(patch)` with `HomebaseStorage.setMany(patch)`.
   - This ensures repaired keys that have fast-mirrors (`appBackgroundDim`, `widgetOrder`, etc.) immediately sync their `<head>` fast-mirrors!

### 6.3 Phase 3: Startup Path Optimization & Auto-Repair Dry-Run Preview

#### Tasks:
1. **Parallelize Folder Metadata Load in `src/new-tab.js`**:
   - Include `loadFolderMetadata()` in the initial `Promise.allSettled` batch alongside `settingsP`, `bookmarkMetaP`, and `lastFolderP`.
   - Eliminates 15–40ms of blocking sequential latency before DOM setup.
2. **Guard Idle Hydration Tasks with Widget Visibility State**:
   - In `scheduleStartupHydrationTasks()`:
     ```javascript
     if (appShowWeatherPreference !== false) {
       scheduleLabeled(() => loadCachedWeatherSafe(), 'startup:loadCachedWeather');
       scheduleLabeled(() => setupWeatherSafe(), 'startup:setupWeather');
     }
     if (appShowQuotePreference !== false) {
       scheduleLabeled(() => buildQuoteIndexSafe(), 'startup:quoteIndex');
       scheduleLabeled(() => setupQuoteWidgetSafe(), 'startup:setupQuoteWidget');
     }
     if (appShowNewsPreference !== false) {
       scheduleLabeled(() => setupNewsWidgetSafe(), 'startup:setupNewsWidget');
     }
     if (appShowTodoPreference !== false) {
       scheduleLabeled(() => setupTodoWidgetSafe(), 'startup:setupTodoWidget');
     }
     ```
   - Preserves CPU and scheduler idle slices for active widgets and wallpaper buffering.
3. **Interactive Auto-Repair Dry-Run Preview Modal**:
   - In `src/newtab/settings/diagnostic-ui.js`, add `showAutoRepairPreviewModal(patch)`:
     - Mounts a modal showing exact key names, invalid values (redacted if sensitive), and proposed sanitized replacements.
     - Provides "Confirm & Apply" and "Cancel" buttons.
     - Strict Safe DOM construction (0 `innerHTML` interpolation).

### 6.4 Phase 4: Cache Resilience, Documentation & Release Readiness

#### Tasks:
1. **LRU Favicon Cache Pruning**:
   - In `src/new-tab.js` (or extracted bookmark favicon helper), add maximum 250-entry ceiling with LRU timestamp eviction for `favicons-v1`.
2. **Manifest Clean-Up**:
   - In `manifests/manifest.chrome.json`, remove `"cookies"` from `permissions`.
   - Retain `"cookies"` in `manifests/manifest.firefox.json` where required for Firefox container tabs.
3. **Documentation Ledger Updates**:
   - Update `docs/00-project-state.md` to reflect Cycles #6, #7, and #8.
   - Update `docs/13-maintenance-log.md` and `docs/14-ai-change-history.md`.
4. **Full Test & Dual Build**:
   - `npm.cmd test`
   - `npm.cmd run build`

---

## 7. File Impact Analysis

```
┌───────────────────────────────────────────────┬────────────┬─────────────────────────────┐
│ FILE PATH                                     │ ACTION     │ SCOPE / PURPOSE             │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/core/utils.js                      │ MODIFY     │ Add isPlainObject,          │
│                                               │            │ areValuesIdentical, clamp   │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/core/storage-service.js            │ MODIFY     │ Fix FAST_MIRROR_MAP bugs &  │
│                                               │            │ deduplicate isPlainObject   │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/core/schema-validator.js           │ MODIFY     │ Deduplicate isPlainObject   │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/core/storage-diagnostics.js        │ MODIFY     │ Deduplicate isPlainObject   │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/settings/backup-import.js          │ MODIFY     │ Deduplicate isPlainObject & │
│                                               │            │ use canonical equality      │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/widget-visibility.js       │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/time.js                    │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/weather.js                 │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/todo.js                    │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/quote.js                   │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/widgets/news.js                    │ MODIFY     │ Migrate to HomebaseStorage  │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/newtab/settings/diagnostic-ui.js          │ MODIFY     │ Auto-repair dry-run modal & │
│                                               │            │ HomebaseStorage.setMany()   │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ src/new-tab.js                                │ MODIFY*    │ Parallel folderMeta & idle  │
│                                               │ (Minimal)  │ hydration guards only       │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ manifests/manifest.chrome.json                │ MODIFY     │ Remove unused "cookies" perm│
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ tests/unit/core-utils.test.mjs                │ MODIFY     │ Test promoted utilities     │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ tests/unit/storage-service.test.mjs           │ MODIFY     │ Test corrected mirrors      │
├───────────────────────────────────────────────┼────────────┼─────────────────────────────┤
│ tests/unit/diagnostic-ui.test.mjs             │ MODIFY     │ Test dry-run preview modal  │
└───────────────────────────────────────────────┴────────────┴─────────────────────────────┘
```

> **Strict Boundary Reminder**: All edits to `src/new-tab.js` require explicit, minimal scope targeting only startup scheduling and parallel promises. Protected drag/drop, bookmark grid, live search, and video playback paths remain untouched.

---

## 8. Security & Privacy Considerations

1. **Zero-PII Privacy Barrier**:
   - The dry-run auto-repair preview modal must redact sensitive bookmark metadata, todo text, or custom URLs, displaying only key names, anomaly types, and sanitized structures.
   - Log entries in `HomebaseDiagnostics.recordValidationAnomaly` remain strictly sanitized with zero user payload strings.
2. **Prototype Pollution Defense**:
   - `window.isPlainObject` strictly rejects objects with modified prototypes, constructor injections, or `__proto__` properties.
   - `HomebaseStorage.set` and `setMany` reject prototype-polluting properties before committing to storage.
3. **Permission Minimization**:
   - Pruning `"cookies"` from `manifest.chrome.json` aligns Chrome MV3 permissions with the principle of least privilege, reducing extension attack surface.
4. **Offline Isolation**:
   - All proposed components operate 100% locally with zero external network requests, zero telemetry, and zero tracking.

---

## 9. Testing & Quality Assurance Strategy

### 9.1 Multi-Tier Test Verification Pipeline

All phases must pass the 4-tier automated test suite:
```powershell
npm.cmd test
```
- **Stage 1: Syntax Validation (`node --check`)**: All modified `.js` files pass syntax verification.
- **Stage 2: Static Invariants (`scripts/check-newtab-static.mjs`)**: Enforces script load order, single declaration rules, and classic `<script defer>` architecture.
- **Stage 3: Unit Tests (`node:test`)**:
  - Existing 137 unit assertions must pass with 100% success.
  - New assertions added for:
    - `isPlainObject`, `areValuesIdentical`, `clampNumber`, `clampInteger` in `core-utils.test.mjs`.
    - Corrected `appTimeFormatPreference` fast-mirror sync in `storage-service.test.mjs`.
    - Auto-repair dry-run preview DOM mounting and confirmation in `diagnostic-ui.test.mjs`.
  - Target: **150+ passing unit assertions**.
- **Stage 4: Browser Smoke Test (`scripts/smoke-newtab-file.mjs`)**: Headless CDP validation ensuring clean DOM mounting without console errors.

### 9.2 Build & Packaging Verification

```powershell
npm.cmd run build
npm.cmd run build:chrome
npm.cmd run build:firefox
```
Ensures output replication into `dist/chrome/` and `dist/firefox/`.

### 9.3 Manual Firefox Testing Protocol

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), manual verification in Firefox is required for:
- Container tabs integration with `cookies` and `contextualIdentities` permissions.
- `HomebaseStorage` mirror synchronization under Firefox private browsing mode.
- Firefox bookmark and history API parity.

---

## 10. Rollback Strategy & Operational Guardrails

1. **Non-Breaking Backward Compatibility**:
   - All changes to `HomebaseStorage` maintain identical method signatures (`get`, `getMany`, `set`, `setMany`, `remove`, `snapshot`, `health`).
   - `schemaVersion` remains at `1`; no data migrations or structural transformations are introduced.
   - If `HomebaseStorage` is unavailable in any sub-context, modules fall back gracefully to direct browser storage.
2. **Instant Git Reversion**:
   - Any phase can be reverted independently using:
     ```powershell
     git checkout HEAD -- <modified-files>
     ```
3. **Minimal Mutation Write Invariant**:
   - Auto-repair and settings writes adhere strictly to minimal mutation deltas: keys with identical values are never written to storage.

---

> **Cycle #8 Planning Phase Complete**: Architecture audit concluded, all 6 objectives formulated, and phased implementation blueprint established. **ZERO SOURCE CHANGES APPLIED. AWAITING USER REVIEW.**
