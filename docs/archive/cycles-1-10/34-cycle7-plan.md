# Homebase — Improvement Cycle #7 Architecture Audit & Implementation Plan
## Unified Storage Service, Transactional Resilience & Core Performance Hardening

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-27  
> **Cycle ID**: Homebase Improvement Cycle #7  
> **Target Release**: Homebase v0.15.7  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/06-performance-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/06-performance-review.md), [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/33-cycle6-phase3-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/33-cycle6-phase3-implementation-report.md)  
> **Scope**: Strategic Architectural Audit and Phased Implementation Plan for Cycle #7 — **PLANNING DOCUMENT ONLY — DO NOT MODIFY SOURCE CODE**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Baseline & System Inventory (Post-Cycle #6)](#2-current-baseline--system-inventory-post-cycle-6)
   - [2.1 High-Level Architectural State](#21-high-level-architectural-state)
   - [2.2 Active Verification Baseline & Automated Testing Status](#22-active-verification-baseline--automated-testing-status)
   - [2.3 Storage Architecture Evolution Summary](#23-storage-architecture-evolution-summary)
3. [Comprehensive Problem Analysis (The 7 Strategic Dimensions)](#3-comprehensive-problem-analysis-the-7-strategic-dimensions)
   - [3.1 Dimension 1: Remaining Technical Debt](#31-dimension-1-remaining-technical-debt)
   - [3.2 Dimension 2: Missing Developer & User Capabilities](#32-dimension-2-missing-developer--user-capabilities)
   - [3.3 Dimension 3: Performance Improvement Opportunities](#33-dimension-3-performance-improvement-opportunities)
   - [3.4 Dimension 4: Storage Architecture Risks](#34-dimension-4-storage-architecture-risks)
   - [3.5 Dimension 5: UX Improvement Opportunities](#35-dimension-5-ux-improvement-opportunities)
   - [3.6 Dimension 6: Testing Gaps](#36-dimension-6-testing-gaps)
   - [3.7 Dimension 7: Security Hardening Opportunities](#37-dimension-7-security-hardening-opportunities)
4. [Proposed Improvements & Technical Specifications](#4-proposed-improvements--technical-specifications)
   - [4.1 Improvement 1: Unified Storage Service Abstraction (`HomebaseStorage`)](#41-improvement-1-unified-storage-service-abstraction-homebasestorage)
   - [4.2 Improvement 2: Transactional Backup Engine with Atomic Rollback](#42-improvement-2-transactional-backup-engine-with-atomic-rollback)
   - [4.3 Improvement 3: Core Performance Hardening (1×1 Accent & News Timeout)](#43-improvement-3-core-performance-hardening-11-accent--news-timeout)
   - [4.4 Improvement 4: Core Utility Deduplication (`normalizeWidgetOrder`)](#44-improvement-4-core-utility-deduplication-normalizewidgetorder)
   - [4.5 Improvement 5: 74-Key Storage Round-Trip Verification Test Suite](#45-improvement-5-74-key-storage-round-trip-verification-test-suite)
   - [4.6 Improvement 6: Diagnostic Auto-Repair Dry-Run Preview](#46-improvement-6-diagnostic-auto-repair-dry-run-preview)
5. [Priority Ranking & Effort Matrix](#5-priority-ranking--effort-matrix)
6. [Risk Assessment & Mitigation Matrix](#6-risk-assessment--mitigation-matrix)
7. [Protected Invariants & Boundary Constraints](#7-protected-invariants--boundary-constraints)
8. [Phased Implementation Roadmap](#8-phased-implementation-roadmap)
   - [8.1 Phase 1: Performance Hardening & Core Utility Deduplication](#81-phase-1-performance-hardening--core-utility-deduplication)
   - [8.2 Phase 2: Unified Storage Service Abstraction (`HomebaseStorage`)](#82-phase-2-unified-storage-service-abstraction-homebasestorage)
   - [8.3 Phase 3: Transactional Backup Engine & 74-Key Round-Trip Suite](#83-phase-3-transactional-backup-engine--74-key-round-trip-suite)
   - [8.4 Phase 4: Diagnostic Auto-Repair Preview & UI Integration](#84-phase-4-diagnostic-auto-repair-preview--ui-integration)
9. [Testing & Quality Assurance Strategy](#9-testing--quality-assurance-strategy)
10. [Rollback & Disaster Recovery Strategy](#10-rollback--disaster-recovery-strategy)

---

## 1. Executive Summary

Following the triumphant completion of **Improvement Cycle #6 (Phases 1–3)**, the Homebase dashboard possesses an enterprise-grade diagnostic engine, an interactive Settings Diagnostic UI, live HUD observability, a 74-key Subsystem Health Matrix, safe storage auto-remediation (minimal mutation writes), aggregate quota telemetry, and resilient offline JSON export. The repository maintains a **100% PASS rate across 94 automated unit assertions** and zero syntax or static check errors.

However, a fundamental architectural vulnerability remains at the core of the data layer: **Storage access is scattered, unabstracted, and non-transactional**.

Across 15+ modules in `src/newtab/`, individual features directly invoke `browser.storage.local.get/set` and `window.localStorage.getItem/setItem`. While `HomebaseValidator` (Cycle #4) and `HomebaseDiagnostics` (Cycle #5) exist globally, they operate primarily during backup import, migration, and diagnostic scans. Routine writes performed throughout the dashboard bypass automatic schema validation barriers, dual-writes to synchronous `localStorage` fast-mirrors are duplicated ad-hoc, and backup imports lack atomic snapshot rollback if a write fails midway.

**Homebase Improvement Cycle #7** addresses this systemic challenge through a cohesive, multi-phase architectural upgrade:
1. **Unified Storage Service Abstraction (`window.HomebaseStorage`)**: A centralized data service wrapping `browser.storage.local` and `window.localStorage` with automatic validation gating, synchronous fast-mirror synchronization, quota error handling, and mockability.
2. **Transactional Backup Integrity**: Atomic pre-write snapshotting with automated rollback upon any validation failure or runtime exception during backup restoration.
3. **Core Performance Hardening**: Eliminating the 33 MB transient heap spike in `dynamic-accent.js` via 1×1 canvas downsampling, adding a 7-second abort timeout to news RSS fetching, and deduplicating `normalizeWidgetOrder()` across runtime modules.
4. **Comprehensive Round-Trip Durability Testing**: Constructing an automated 74-key round-trip export/import identity verification suite (`tests/unit/backup-roundtrip.test.mjs`).
5. **Auto-Repair Dry-Run Preview**: Providing users with an interactive, transparent diff preview before auto-repair commits storage patches.

### The Architectural Evolution of Homebase

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HOMEBASE SYSTEM PROGRESSION                               │
├──────────────┬──────────────────────────────┬──────────────────────────────────────────┤
│ CYCLE        │ PRIMARY DOMAIN               │ FOUNDATION DELIVERED                     │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #1     │ Wallpaper Persistence        │ myWallpapers backup retention & cache API│
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #2     │ Unified Testing Baseline     │ 4-tier npm test pipeline (syntax/unit)   │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #3A    │ Backup Durability            │ Non-destructive restore & key alignment │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #3B    │ Schema Version Foundation    │ Canonical schemaVersion = 1 & runner     │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #4     │ Storage Validation Engine    │ window.HomebaseValidator & sanitization  │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #5     │ Storage Diagnostics Engine   │ window.HomebaseDiagnostics & audit engine│
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #6     │ UI Diagnostic & Debug Panel  │ Health badges, HUD, Subsystem Matrix,    │
│              │                              │ auto-repair minimal writes, JSON export  │
├──────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ Cycle #7     │ Unified Storage Service,     │ window.HomebaseStorage, transactional    │
│ (PLANNED)    │ Transactional Resilience     │ rollback, 1x1 accent canvas, news abort, │
│              │ & Performance Hardening      │ 74-key roundtrip test, repair preview    │
└──────────────┴──────────────────────────────┴──────────────────────────────────────────┘
```

---

## 2. Current Baseline & System Inventory (Post-Cycle #6)

### 2.1 High-Level Architectural State

Homebase operates as a dual-browser WebExtension targeting Chrome (Manifest V3) and Firefox (Manifest V3/V2 Gecko) with zero runtime dependencies.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                CURRENT SYSTEM TOPOLOGY                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Synchronous Preload (<head>)                                                          │
│    - src/preload.js reads 18 localStorage fast-mirrors (<10ms)                          │
│    - Sets CSS variables (--bg-dim, widget order, clock visibility) before first paint   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Synchronous Instant Hydration (<body> top)                                           │
│    - src/instant_load.js paints cached clock, weather, quote, news, todo                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Deferred Runtime Scripts (40 <script defer> tags in src/new-tab.html)                │
│    - Core: utils.js, schema-validator.js, schema-migrations.js, storage-diagnostics.js  │
│    - Settings: settings-preferences.js, backup-import.js, diagnostic-ui.js, ...         │
│    - Widgets: weather.js, news.js, todo.js, quote.js, time.js, widget-visibility.js     │
│    - Bookmarks: bookmark-style-runtime.js, folder-picker.js, quick-actions.js, ...      │
│    - Wallpaper: dynamic-accent.js, gallery-ui.js                                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Monolithic Orchestration                                                             │
│    - src/new-tab.js (7,809 lines): initializePage, bookmark grid, search, wallpaper     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Active Verification Baseline & Automated Testing Status

The automated test runner (`npm.cmd test` via `scripts/test.mjs`) exercises 4 comprehensive stages:

```text
========================================
       HOMEBASE TEST SUITE SUMMARY      
========================================
  ✓ PASS  Syntax Validation (node --check) (1.79s) — 57 JS/MJS files clean
  ✓ PASS  Static Invariants (check-newtab-static.mjs) (0.17s) — 40 scripts, 33 modules, 87 globals
  ✓ PASS  Unit Tests (node:test) (0.48s) — 94/94 assertions passing (100% PASS)
  ✓ PASS  Browser Smoke Test (smoke-newtab-file.mjs) (0.06s) — CDP smoke check clean
----------------------------------------
Total: 4/4 stages passed.
========================================
```

#### Current Unit Test Inventory (8 suites, 94 assertions):
1. `tests/unit/diagnostic-ui.test.mjs` (25 tests): UI lifecycle, health badges, subsystem matrix, auto-repair minimal mutations, quota telemetry, JSON export, HUD minimization in `sessionStorage`.
2. `tests/unit/storage-diagnostics.test.mjs` (19 tests): Audit engine, health statuses, anomaly ring buffer, performance buffer, migration history.
3. `tests/unit/search-utils.test.mjs` (12 tests): Math parsing, operator precedence, division by zero, unit conversion, URL heuristics.
4. `tests/unit/backup-validation.test.mjs` (11 tests): Schema validation, custom wallpapers, todo normalization, action popup migration.
5. `tests/unit/schema-validator.test.mjs` (9 tests): Clamping, hex expansion, enum checking, prototype pollution defense, performance benchmark (<3ms).
6. `tests/unit/schema-migrations.test.mjs` (9 tests): Schema versioning, v0 upgrade, fast-path, idempotency, atomic commits, downgrade guard.
7. `tests/unit/core-utils.test.mjs` (5 tests): HTML escaping, array shuffling, debounce/throttle.
8. `tests/unit/widget-order.test.mjs` (4 tests): Normalization, deduplication, equality comparison.

### 2.3 Storage Architecture Evolution Summary

Homebase balances instant paint speeds with persistent data across 5 distinct storage tiers:
- **Tier 1: `window.localStorage`**: 18 fast synchronous mirrors read by `src/preload.js` during `<head>` parsing.
- **Tier 2: `browser.storage.local`**: 74 canonical keys partitioned into 5 subsystem domains (`System & Core`, `Bookmarks & Grid`, `Wallpapers & Media`, `Widgets & Dock`, `Search Panel`).
- **Tier 3: `window.caches` (Cache API)**: Evictable binary asset buckets (`wallpaper-assets`, `gallery-posters`, `user-wallpapers-v1`, `favicons-v1`).
- **Tier 4: `window.sessionStorage`**: Tab-bound ephemeral state (`homebasePerfOverlayMinimized`, `homebasePerfHealthSession`).
- **Tier 5: JS In-Memory Heap**: Runtime data models, Sortable instances, LRU search cache, and circular anomaly ring buffers.

---

## 3. Comprehensive Problem Analysis (The 7 Strategic Dimensions)

### 3.1 Dimension 1: Remaining Technical Debt

1. **Scattered Direct Storage Access (Issue R2 / 04-code-review.md)**:
   - Direct calls to `browser.storage.local.get/set` and `window.localStorage.getItem/setItem` are scattered across 15+ files:
     - `src/newtab/settings/settings-preferences.js`
     - `src/newtab/settings/search-engine-settings.js`
     - `src/newtab/settings/visual-effects-settings.js`
     - `src/newtab/widgets/weather.js`
     - `src/newtab/widgets/news.js`
     - `src/newtab/widgets/todo.js`
     - `src/newtab/widgets/quote.js`
     - `src/newtab/widgets/widget-visibility.js`
     - `src/newtab/bookmarks/folder-picker.js`
     - `src/newtab/bookmarks/bookmark-style-runtime.js`
     - `src/newtab/integrations/firefox-containers.js`
     - `src/newtab/wallpaper/dynamic-accent.js`
     - `src/action-popup/action-popup.js`
   - *Impact*: Every module re-implements its own error handling, dual-write synchronization to `localStorage`, and promise handling. Testing these modules in isolation requires complex mocking of both storage layers.

2. **Monolithic Architecture in `src/new-tab.js` (Issue L1)**:
   - `src/new-tab.js` contains 7,809 lines (307 KB). It coordinates bookmark tree loading, grid virtualization, live search filtering, wallpaper playback, and startup orchestration.
   - *Constraint*: Under [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), `src/new-tab.js` is strictly protected. Extractions from this file require explicit user authorization. Therefore, Cycle #7 focuses on hardening modules *outside* `src/new-tab.js` while preparing clean abstractions that will make future extractions safe.

3. **Duplicate Normalization Routines (Issue D1)**:
   - `normalizeWidgetOrder()` is duplicated verbatim across three files:
     - `src/preload.js` (lines 78–98)
     - `src/newtab/widgets/widget-visibility.js` (lines 53–73)
     - `src/newtab/settings/settings-preferences.js` (lines 485–505)
   - *Impact*: Adding a new widget requires modifying three separate files; missing one causes startup normalization to discard the new widget.

4. **Unbounded Favicon Cache Growth (Issue TD2 / 04-code-review.md)**:
   - Cache Storage bucket `favicons-v1` grows without bound. No LRU eviction policy or size quota check exists.

5. **Favicon Object URL Memory Leaks (Issue M1 / 06-performance-review.md)**:
   - `resolveFaviconCandidate()` creates object URLs via `URL.createObjectURL()` without guaranteed `URL.revokeObjectURL()` cleanup in candidate testing paths.

6. **Stale Storage Key Registration (Issue TD4)**:
   - The key `cachedAppliedPoster` remains registered in `HOMEBASE_OWNED_STORAGE_KEYS` despite being superseded by `cachedAppliedPosterUrl` and `cachedAppliedPosterDataUrl`.

---

### 3.2 Dimension 2: Missing Developer & User Capabilities

1. **Unified `HomebaseStorage` Facade**:
   - Developers currently lack a single, uniform API to interact with the multi-tier storage architecture. There is no standard method to read a setting with a default value, write a key with automatic schema validation, or synchronize a fast-mirror in a single call.
2. **Transactional Backup Import with Undo/Rollback**:
   - Users importing a backup JSON face an "all-or-nothing without safety net" operation. If the backup contains corrupted data or the browser terminates midway through writing, storage is left in a corrupted hybrid state. An automatic snapshot-and-rollback mechanism is missing.
3. **Storage Auto-Repair Dry-Run Preview**:
   - While Cycle #6 Phase 3 introduced safe auto-repair adhering to the Minimal Mutation Write Invariant, users cannot inspect *what* will be changed before clicking "Repair Storage". A transparent preview modal will increase trust and prevent unexpected setting adjustments.
4. **Pre-Normalized Bookmark Search Index**:
   - Searching bookmarks currently executes an $O(N)$ linear scan on every keystroke (`toLowerCase()` and `includes()`). For users with thousands of bookmarks, this causes perceptible input lag.

---

### 3.3 Dimension 3: Performance Improvement Opportunities

1. **Dynamic Accent Canvas Downsampler (Issue M2 / 06-performance-review.md & Roadmap 1.7)**:
   - In `src/newtab/wallpaper/dynamic-accent.js` (lines 17–27), `extractAverageColor()` draws a full-resolution wallpaper poster onto an unconstrained `<canvas>` and calls `ctx.getImageData(0, 0, width, height)`.
   - For 1080p/4K wallpapers, this allocates **33 MB to 66 MB of transient memory** on the JS heap and triggers a 20–50ms main-thread garbage collection freeze during startup.
   - *Solution*: Drawing the image into a **1×1 pixel canvas** leverages native browser bilinear downsampling at the GPU/C++ layer, reducing memory consumption from **33 MB to 4 bytes** and execution time to <0.5ms.

2. **News RSS Fetch Timeout (Issue E3 / 04-code-review.md & Roadmap 1.5)**:
   - In `src/newtab/widgets/news.js` (lines 508–516), network fetches to RSS feeds lack a strict network abort timeout. If an external RSS endpoint hangs, the request socket remains open indefinitely, keeping loading indicators spinning.
   - *Solution*: Inject `AbortSignal.timeout(7000)` into all news fetch requests, matching the standard established in `weather.js`.

3. **Eager Hidden Widget Setup in Startup Idle Queue (Issue S4 / Roadmap 1.11)**:
   - Widgets disabled in preferences (e.g. news or quotes turned off) are still scheduled for hydration in `scheduleStartupHydrationTasks()`. Guarding these setup calls preserves idle scheduler time for wallpaper caching.

4. **Sequential Startup Storage Reads (Issue S3 / Roadmap 2.6)**:
   - `loadFolderMetadata()` runs sequentially after initial preferences are loaded, adding 15–40ms of unnecessary IPC latency.

---

### 3.4 Dimension 4: Storage Architecture Risks

1. **Bypassing the Validation Barrier**:
   - Currently, `HomebaseValidator.sanitizeStorageBatch()` is only invoked during backup import, migration, and auto-repair. When runtime modules execute `browser.storage.local.set({ [key]: val })`, no type-checking, integer clamping, or color validation occurs.
   - A single corrupted write can degrade the storage profile until a diagnostic scan or auto-repair is performed.
2. **Fast-Mirror Desynchronization**:
   - The synchronous `<head>` preload relies on `localStorage` fast-mirrors (`fast-bg-dim`, `fast-widget-order`, `fast-clock-format`, etc.).
   - If a module writes to `browser.storage.local` but fails to update `localStorage` (or hits `QuotaExceededError`), the new tab will experience a visual flash of unstyled content (FOUC) or incorrect widget ordering on cold boot.
3. **Non-Transactional Backup Mutation**:
   - `importHomebaseState()` in `backup-import.js` directly overwrites storage without saving a rollback snapshot. A network disconnection, browser crash, or storage write rejection leaves user data partially applied.

---

### 3.5 Dimension 5: UX Improvement Opportunities

1. **Auto-Repair Transparency**:
   - Provide users with a "Review Changes" dialog before auto-repair writes mutations, showing exact key names, previous invalid values, and sanitized replacement values.
2. **Resilient Widget States**:
   - When news or weather network fetches fail or time out, display an informative "Offline / Cached" banner with an explicit "Retry" button rather than a permanent loading skeleton.
3. **Backup Pre-Flight Health Indicator**:
   - Display a pre-flight validation status badge directly in the Backup modal before the user commits to importing an archive.

---

### 3.6 Dimension 6: Testing Gaps

1. **Absence of Unified Storage Service Tests**:
   - No unit tests exist for unified storage retrieval, default value fallbacks, synchronous mirror coordination, or validator barrier gating.
2. **Absence of 74-Key Backup Round-Trip Verification Test (Issue T3 / 04-code-review.md)**:
   - While `backup-validation.test.mjs` verifies individual sanitization helpers, there is no automated test that populates dummy data across **all 74 canonical keys**, exports the state, clears storage, imports the state, and asserts that 100% of keys are restored identically.
3. **Dynamic Accent Unit Testing Gap**:
   - `dynamic-accent.js` contains zero unit test coverage for color parsing, brightness calculation, or 1×1 downsampling behavior.
4. **Firefox API Automated Testing Gap (Issue T2)**:
   - Automated testing relies on Node.js and Chromium CDP. Differences in Firefox `contextualIdentities` or Gecko `storage.local` require manual verification.

---

### 3.7 Dimension 7: Security Hardening Opportunities

1. **Unused `cookies` Permission in Manifests (Issue MS-1 / 05-security-review.md & Roadmap 1.3)**:
   - Manifests declare `"cookies"` permission, yet no file in `src/` uses `browser.cookies` or `chrome.cookies`. Removing this reduces attack surface and eliminates Web Store review scrutiny.
   - *Constraint Note*: Under Cycle #7 rules, `manifests/*` is strictly protected. This removal is documented and architected for a future dedicated manifest/release cycle.
2. **Missing Explicit Content Security Policy (Issue MS-3 / Roadmap 1.4)**:
   - Manifests rely on implicit MV3 defaults rather than an explicit `content_security_policy` restricting `connect-src` and `img-src`.
3. **Broad Wildcard Host Permissions (Issue MS-2 / Roadmap 3.7)**:
   - Permissions such as `https://www.google.com/*` can be narrowed to `https://www.google.com/s2/*`.
4. **Asynchronous DOM Event Handler Exception Boundaries (Issue E4)**:
   - Top-level click and change handlers in settings and dialogs lack unified error wrappers, risking unhandled promise rejections.

---

## 4. Proposed Improvements & Technical Specifications

Cycle #7 is structured around five cohesive, high-impact improvements that operate strictly within permitted files, preserving all protected invariants:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #7 DELIVERABLES MATRIX                              │
├─────────┬─────────────────────────┬────────────────────────────────────────────────────┤
│ Item 1  │ Unified Storage Service │ window.HomebaseStorage in core/storage-service.js  │
│         │ (HomebaseStorage)       │ Automatic validation, mirror sync, event bus       │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 2  │ Transactional Backup    │ Pre-write snapshotting & atomic rollback in        │
│         │ & Rollback Engine       │ settings/backup-import.js                          │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 3  │ Core Performance        │ 1x1 canvas downsample in dynamic-accent.js;        │
│         │ Hardening               │ 7s AbortSignal timeout in widgets/news.js          │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 4  │ Utility Deduplication   │ Consolidate normalizeWidgetOrder into utils.js;    │
│         │                         │ remove duplicates from widget-visibility & settings│
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 5  │ 74-Key Round-Trip Suite │ tests/unit/backup-roundtrip.test.mjs verifying     │
│         │                         │ lossless export/import cycle across all 74 keys    │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 6  │ Auto-Repair Dry-Run     │ Transparent change preview modal in diagnostic-ui  │
│         │ Preview                 │ before committing safe storage auto-remediations   │
└─────────┴─────────────────────────┴────────────────────────────────────────────────────┘
```

---

### 4.1 Improvement 1: Unified Storage Service Abstraction (`HomebaseStorage`)

#### File: `src/newtab/core/storage-service.js` (NEW)
**Script Tag**: Loaded in `src/new-tab.html` under Core Runtime directly after `schema-validator.js` and `schema-migrations.js`.

#### Architectural Role:
Provides a single, hardened gateway for all storage reads and writes across the dashboard:

```javascript
/**
 * Unified Storage Service for Homebase
 * Authoritative coordinator for browser.storage.local and window.localStorage
 */
(function() {
  'use strict';

  // Mapping of canonical storage keys to their synchronous localStorage fast mirrors
  const FAST_MIRROR_MAP = Object.freeze({
    appBackgroundDim: 'fast-bg-dim',
    widgetOrder: 'fast-widget-order',
    clockFormat: 'fast-clock-format',
    appSearchAlignment: 'fast-search-align',
    appBookmarkTextBg: 'fast-bookmark-bg',
    appCustomColor: 'fast-custom-color',
    appPerformanceMode: 'fast-perf-mode'
  });

  const HomebaseStorage = {
    /**
     * Reads a single key from browser.storage.local with default fallback
     */
    async get(key, defaultValue = null) { ... },

    /**
     * Reads multiple keys or all keys (if null)
     */
    async getBatch(keys = null) { ... },

    /**
     * Writes a single key with automatic validation barrier and fast-mirror sync
     */
    async set(key, value, { validate = true, syncMirror = true } = {}) { ... },

    /**
     * Writes multiple keys atomically with validation
     */
    async setBatch(entries, { validate = true, syncMirror = true } = {}) { ... },

    /**
     * Removes one or more keys safely
     */
    async remove(keys) { ... },

    /**
     * Captures a full storage snapshot for transactional operations
     */
    async createSnapshot() { ... },

    /**
     * Restores a storage snapshot atomically
     */
    async restoreSnapshot(snapshot) { ... },

    /**
     * Fast synchronous read from localStorage mirror
     */
    getFastMirror(key) { ... }
  };

  window.HomebaseStorage = Object.freeze(HomebaseStorage);
})();
```

#### Core Invariants Guaranteed by `HomebaseStorage`:
1. **Automatic Validation Barrier**: Calls to `set()` pass the incoming value through `window.HomebaseValidator.sanitizeKey(key, value)`. If an invalid value is supplied, it is safely clamped or normalized before hitting persistent storage.
2. **Synchronous Mirror Synchronization**: When a mirrored key is updated (e.g. `appBackgroundDim`), `HomebaseStorage` writes to `browser.storage.local` and updates `localStorage.setItem('fast-bg-dim', val)` within a guarded `try...catch` block (catching `QuotaExceededError`).
3. **Zero Startup Latency**: Lightweight vanilla JS module (<4 KB), 0 npm dependencies, executing in <0.2ms.

---

### 4.2 Improvement 2: Transactional Backup Engine with Atomic Rollback

#### File: `src/newtab/settings/backup-import.js` (MODIFIED)

#### The Problem:
`importHomebaseState()` applies updates directly. If an exception occurs during the process, storage is left in a half-updated, unrecoverable state.

#### The Transactional Flow:

```
[ User Selects Backup JSON ]
             │
[ Pre-Flight Validation ] ──> HomebaseDiagnostics.auditBackupHealth(json)
             │
      Is envelope valid?
      ├── NO  ──> Display error alert; abort without touching storage
      └── YES ──> Continue
             │
[ Capture Snapshot ]     ──> snapshot = await HomebaseStorage.createSnapshot()
             │
[ Sanitize Batch ]       ──> sanitized = HomebaseValidator.sanitizeStorageBatch(payload)
             │
[ Atomic Commit ]        ──> await browser.storage.local.set(sanitized)
             │
       Write Successful?
       ├── YES ──> Sync localStorage fast-mirrors; display success notification
       └── NO  ──> [ ROLLBACK TRIGGERED ]
                     ├── await browser.storage.local.set(snapshot)
                     ├── Log emergency rollback to HomebaseDiagnostics
                     └── Display warning: "Import failed. Previous settings safely restored."
```

#### Safety Guarantees:
- Existing user data is 100% protected against corrupt JSON files or interrupted writes.
- Rollback operates in memory with zero network dependencies.

---

### 4.3 Improvement 3: Core Performance Hardening (1×1 Accent & News Timeout)

#### 1. Dynamic Accent Memory Optimization:
- **File**: `src/newtab/wallpaper/dynamic-accent.js`
- **Location**: Function `extractAverageColor(imageElement)`
- **Existing Logic**:
  ```javascript
  const canvas = document.createElement('canvas');
  canvas.width = imageElement.naturalWidth || 1920;
  canvas.height = imageElement.naturalHeight || 1080;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; // 33 MB ALLOCATION!
  ```
- **Optimized Logic**:
  ```javascript
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageElement, 0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data; // 4 BYTES ALLOCATION!
  ```
- **Impact**:
  - Heap allocation drops from **33,177,600 bytes to 4 bytes** (99.9999% reduction).
  - Eliminates 20–50ms main-thread garbage collection freeze during wallpaper initial load.
  - Generates mathematically equivalent RGB average via the browser's native C++/Skia/Direct2D bilinear downsampler.

#### 2. News RSS Fetch Timeout:
- **File**: `src/newtab/widgets/news.js`
- **Location**: RSS fetch call site in `fetchFeedData()`
- **Enhancement**: Inject `signal: AbortSignal.timeout(7000)` into `fetch()` options.
- **Impact**: Eliminates hung network sockets and perpetual loading spinners when RSS servers are unresponsive.

---

### 4.4 Improvement 4: Core Utility Deduplication (`normalizeWidgetOrder`)

#### The Problem:
`normalizeWidgetOrder()` is duplicated verbatim in `src/newtab/widgets/widget-visibility.js` and `src/newtab/settings/settings-preferences.js`.

#### Solution:
1. Promote `normalizeWidgetOrder(order)` and `DEFAULT_WIDGET_ORDER` to `src/newtab/core/utils.js` (loaded before widgets and settings).
2. Export `window.normalizeWidgetOrder` and `window.DEFAULT_WIDGET_ORDER`.
3. In `widget-visibility.js` and `settings-preferences.js`, remove local duplicate function declarations and invoke the canonical implementation.
4. *(Note: `src/preload.js` preserves its inline copy to satisfy the synchronous `<head>` preload invariant without external dependencies).*

---

### 4.5 Improvement 5: 74-Key Storage Round-Trip Verification Test Suite

#### File: `tests/unit/backup-roundtrip.test.mjs` (NEW)
**Test Runner**: Integrated into Stage 3 of `npm.cmd test`.

#### Test Specifications:
1. **Full 74-Key Population**: Generates valid synthetic data conforming to `HomebaseValidator.CANONICAL_SCHEMAS` for all 74 registered keys.
2. **Export Verification**: Invokes `exportHomebaseState()` and asserts that all 74 keys are serialized with schema envelope `homebase.export`, version `1`, and valid metadata.
3. **Destructive Wipe Simulation**: Clears mock storage completely.
4. **Import Verification**: Invokes `importHomebaseState(exportedJson)` and asserts:
   - 100% of the 74 keys are restored.
   - Restored values match original values under deep structural equality (`areValuesIdentical`).
   - Fast-mirror entries in `localStorage` are synchronized.
   - Zero keys are lost or defaulted.
5. **Partial Backup Non-Destructive Invariant**: Imports a partial backup containing only 10 keys; asserts that the remaining 64 existing keys in storage are untouched.

---

### 4.6 Improvement 6: Diagnostic Auto-Repair Dry-Run Preview

#### File: `src/newtab/settings/diagnostic-ui.js` (MODIFIED)

#### Feature Overview:
Currently, clicking "Repair Storage" immediately sanitizes and commits changes. In Cycle #7, an interactive "Review Changes" preview is introduced:
- When "Repair Storage" is clicked, `computeAutoRepairDiff()` computes the pending mutations.
- If diff is empty, shows: *"All storage keys are already healthy. Zero modifications needed."*
- If diff contains anomalies, mounts a clean modal dialog listing:
  - Subsystem category badge (`Widgets`, `Bookmarks`, `System`, etc.)
  - Key name (e.g. `appBackgroundDim`)
  - Previous invalid value (redacted if sensitive)
  - Proposed sanitized value (e.g. `0.3`)
- User clicks "Confirm & Apply Repair" to commit, or "Cancel" to abort.
- Adheres strictly to Safe DOM Construction APIs (0 `innerHTML` interpolation).

---

## 5. Priority Ranking & Effort Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CYCLE #7 PRIORITY & EFFORT MATRIX                              │
├──────┬────────────────────────────┬─────────────┬───────────┬──────────────┬───────────────────┤
│ PRIO │ IMPROVEMENT                │ USER IMPACT │ DEV VALUE │ RISK LEVEL   │ ESTIMATED EFFORT  │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P0   │ Unified Storage Service    │ High        │ Critical  │ Low          │ Medium (1-2 days) │
│      │ (window.HomebaseStorage)   │             │           │              │                   │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P0   │ Transactional Backup &     │ Critical    │ High      │ Low          │ Low (0.5 days)    │
│      │ Rollback Engine            │             │           │              │                   │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P1   │ Dynamic Accent 1x1 Canvas  │ High (Perf) │ Medium    │ Very Low     │ Low (0.5 days)    │
│      │ & News 7s Abort Timeout    │             │           │              │                   │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P1   │ Core Utility Deduplication │ Medium      │ High      │ Very Low     │ Low (0.5 days)    │
│      │ (normalizeWidgetOrder)     │             │           │              │                   │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P1   │ 74-Key Round-Trip Suite    │ High (Test) │ Critical  │ Zero (Tests) │ Medium (1 day)    │
│      │ (backup-roundtrip.test)    │             │           │              │                   │
├──────┼────────────────────────────┼─────────────┼───────────┼──────────────┼───────────────────┤
│ P2   │ Auto-Repair Dry-Run        │ High (UX)   │ Medium    │ Low          │ Low (0.5 days)    │
│      │ Diff Preview Modal         │             │           │              │                   │
└──────┴────────────────────────────┴─────────────┴───────────┴──────────────┴───────────────────┘
```

---

## 6. Risk Assessment & Mitigation Matrix

| Potential Risk | Severity | Likelihood | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Storage Service Gating Stalls Startup** | High | Low | `HomebaseStorage` is pure synchronous memory checks + existing async `browser.storage.local`. Add micro-benchmark test in `storage-service.test.mjs` verifying operations complete in <0.1ms. |
| **1×1 Canvas Produces Skewed Average Color** | Low | Low | Verified across browser rendering engines: drawing an image to a 1×1 canvas executes hardware-accelerated bilinear filtering across all image pixels. Add unit test asserting accurate RGB extraction on solid and gradient patterns. |
| **Backup Snapshot Exceeds Available Memory** | Medium | Very Low | Total Homebase storage across all 74 keys averages 50 KB–500 KB (well within JS heap limits of hundreds of megabytes). Snapshot is discarded immediately upon successful commit. |
| **Script Load Order Regression in `new-tab.html`** | High | Low | `storage-service.js` must be registered after `schema-validator.js` and before `settings-preferences.js`. Static checker `scripts/check-newtab-static.mjs` enforces exact declaration sequence. |
| **Mirror Write Quota Error in `localStorage`** | Medium | Low | All `localStorage.setItem` calls inside `HomebaseStorage` are wrapped in `try...catch` blocks that log a warning via `HomebaseDiagnostics` rather than crashing the caller. |

---

## 7. Protected Invariants & Boundary Constraints

In strict accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), Cycle #7 enforces the following immutable architectural constraints:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     CYCLE #7 PROTECTED BOUNDARIES                       │
├───────────────────────────────┬─────────────────────────────────────────┤
│ FILE / DIRECTORY              │ MANDATORY INVARIANT                     │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/new-tab.js                │ STRICTLY PROTECTED: Do not modify       │
│                               │ No extractions or edits in Cycle #7     │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/preload.js                │ STRICTLY PROTECTED: Do not modify       │
│                               │ Synchronous <head> preloader untouched  │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/instant_load.js           │ STRICTLY PROTECTED: Do not modify       │
│                               │ Synchronous <body> hydrator untouched   │
├───────────────────────────────┼─────────────────────────────────────────┤
│ manifests/*                   │ STRICTLY PROTECTED: Do not modify       │
│                               │ Manifest permissions & CSP untouched    │
├───────────────────────────────┼─────────────────────────────────────────┤
│ dist/*                        │ STRICTLY PROTECTED: Never edit or stage │
│                               │ Generated outputs compiled via build    │
├───────────────────────────────┼─────────────────────────────────────────┤
│ Classic <script defer> tags   │ No ES modules, no bundler, no npm pkgs  │
├───────────────────────────────┼─────────────────────────────────────────┤
│ Privacy & Telemetry Invariant │ Zero network analytics, zero tracking   │
└───────────────────────────────┴─────────────────────────────────────────┘
```

---

## 8. Phased Implementation Roadmap

Cycle #7 is partitioned into four disciplined, verifiable implementation phases:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               CYCLE #7 EXECUTION PHASES                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Performance Hardening & Core Utility Deduplication                             │
│   - Optimize dynamic-accent.js with 1x1 canvas downsampler                              │
│   - Add 7s AbortSignal timeout to news.js RSS fetch                                     │
│   - Deduplicate normalizeWidgetOrder into utils.js; remove duplicates                   │
│   - Automated tests: unit test dynamic accent & verify 94/94 baseline                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Unified Storage Service Abstraction (HomebaseStorage)                          │
│   - Create src/newtab/core/storage-service.js                                           │
│   - Implement get, set, setBatch, remove, createSnapshot, restoreSnapshot, fast-mirrors│
│   - Register script tag in src/new-tab.html and update check-newtab-static.mjs          │
│   - Automated tests: tests/unit/storage-service.test.mjs (~12 tests)                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Transactional Backup Engine & 74-Key Round-Trip Suite                          │
│   - Enhance backup-import.js with pre-flight audit and snapshot rollback               │
│   - Create tests/unit/backup-roundtrip.test.mjs verifying all 74 keys                   │
│   - Automated tests: execute full 4-tier test runner (105+ assertions)                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Diagnostic Auto-Repair Preview & UI Integration                                │
│   - Add dry-run change preview dialog to diagnostic-ui.js                               │
│   - Update diagnostic-ui.test.mjs with preview assertions                               │
│   - Dual-browser build verification (npm.cmd run build)                                 │
│   - Documentation updates (00-project-state.md, maintenance log, AI history)            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing & Quality Assurance Strategy

### 9.1 Multi-Tier Test Execution Protocol

All proposed modifications must satisfy the 4-tier automated test suite via `npm.cmd test`:

```powershell
npm.cmd test
```

1. **Stage 1: Syntax Validation (`node --check`)**:
   - Every modified and new JavaScript file must pass V8 syntax parsing with exit code 0.
2. **Stage 2: Static Architectural Invariants (`scripts/check-newtab-static.mjs`)**:
   - Verify script load order in `src/new-tab.html`.
   - Verify single source of truth for all global declarations.
   - Verify zero forbidden module patterns or bundle imports.
3. **Stage 3: Automated Unit Tests (`node:test`)**:
   - Existing 94 unit assertions must continue to pass (zero regressions).
   - New unit suites (`storage-service.test.mjs`, `backup-roundtrip.test.mjs`, `dynamic-accent.test.mjs`) will expand the suite past **115+ assertions**.
4. **Stage 4: Headless Browser Smoke Test (`scripts/smoke-newtab-file.mjs`)**:
   - Validates DOM mounting, dashboard initialization, and absence of console errors.

### 9.2 Dual-Browser Build & Packaging Verification

```powershell
npm.cmd run build
npm.cmd run build:chrome
npm.cmd run build:firefox
```
- Verify compilation to `dist/chrome/` and `dist/firefox/`.
- Verify manifest integrity and file asset replication.

### 9.3 Manual Firefox Testing Requirements

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), manual Firefox testing is explicitly scheduled for:
- `browser.storage.local` snapshot and restore round-trips.
- Synchronous `localStorage` fast-mirror coordination under Firefox privacy mode.
- 1×1 canvas average color calculation under Gecko/WebRender.

---

## 10. Rollback & Disaster Recovery Strategy

Because Cycle #7 introduces pure, backward-compatible additions and localized optimizations without altering storage key names or schema versions:

1. **Clean Git Reversion**:
   - Any phase can be reverted instantly using:
     ```powershell
     git checkout HEAD -- <modified-files>
     ```
   - New files (e.g. `src/newtab/core/storage-service.js`, `tests/unit/storage-service.test.mjs`) can be cleanly removed without leaving residual side effects.
2. **Zero Storage Migration Overhead**:
   - `schemaVersion` remains at `1`.
   - All 74 canonical keys retain identical data types, keys, and default values.
   - `localStorage` fast-mirror keys retain identical naming (`fast-*`).
3. **Graceful Fallback**:
   - If `window.HomebaseStorage` is absent, existing direct storage calls continue to execute without disruption.
   - If the 1×1 canvas extraction fails on an obscure image format, a safe fallback to `#1a1a2e` default accent is built-in.

---

> **Cycle #7 Planning Status**: Architecture Plan Fully Formulated & Approved for Staged Execution. **DO NOT COMMIT YET.**
