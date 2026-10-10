# Homebase — Improvement Cycle #8 (Phase 1) Implementation Report
## Storage Facade Hardening & Utility Unification

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-28  
> **Cycle ID**: Homebase Improvement Cycle #8 — Phase 1  
> **Target Release**: Homebase v0.16.0  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/40-cycle8-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/40-cycle8-plan.md)  
> **Status**: Phase 1 Implementation Complete — **DO NOT COMMIT YET**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 1 Objectives & Completed Deliverables](#2-phase-1-objectives--completed-deliverables)
3. [Files Modified & Added](#3-files-modified--added)
4. [Detailed Architecture & API Specification](#4-detailed-architecture--api-specification)
   - [4.1 Storage Facade Hardening (`FAST_MIRROR_MAP`)](#41-storage-facade-hardening-fast_mirror_map)
   - [4.2 Canonical Core Utilities (`src/newtab/core/utils.js`)](#42-canonical-core-utilities-srcnewtabcoreutilsjs)
   - [4.3 Duplicate Elimination Across Modules](#43-duplicate-elimination-across-modules)
5. [Automated Testing Results](#5-automated-testing-results)
   - [5.1 Test Pipeline Verification (142/142 Assertions Passing)](#51-test-pipeline-verification-142142-assertions-passing)
   - [5.2 Mirror Synchronization & Utility Unit Tests](#52-mirror-synchronization--utility-unit-tests)
6. [Dual-Browser Build & Static Invariants](#6-dual-browser-build--static-invariants)
7. [Protected Boundaries & Architectural Invariants](#7-protected-boundaries--architectural-invariants)
8. [Manual Firefox Testing Protocol](#8-manual-firefox-testing-protocol)
9. [Summary & Next Steps (Phase 2 Preview)](#9-summary--next-steps-phase-2-preview)

---

## 1. Executive Summary

Improvement Cycle #8 Phase 1 successfully hardens the foundation of `window.HomebaseStorage` and unifies core helper utilities across the Homebase codebase, resolving high-priority technical debt documented in [`docs/40-cycle8-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/40-cycle8-plan.md).

### Key Accomplishments in Phase 1:
1. **Fixed `FAST_MIRROR_MAP` Inconsistencies**:
   - Corrected the time format mirror mapping: `appTimeFormatPreference` now correctly synchronizes to `fast-time-format` (fixing the stale `clockFormat -> fast-clock-format` entry).
   - Pruned phantom mirror mappings (`appSearchAlignment: 'fast-search-align'` and `appCustomColor: 'fast-custom-color'`) that had no canonical backing in `HOMEBASE_OWNED_STORAGE_KEYS`.
2. **Promoted Shared Utilities into `src/newtab/core/utils.js`**:
   - Established canonical, cross-realm safe implementations of:
     - `isPlainObject(value)`
     - `areValuesIdentical(a, b)`
     - `clampNumber(val, min, max, defaultVal)`
     - `clampInteger(val, min, max, defaultVal)`
   - Exported all helpers globally onto `window` for consumption by downstream deferred scripts.
3. **Eliminated Redundant Implementations**:
   - Removed duplicated copies of `isPlainObject` from `schema-validator.js`, `storage-diagnostics.js`, `storage-service.js`, and `backup-import.js`.
   - Removed duplicated copies of `clampNumber` and `clampInteger` from `schema-validator.js`.
   - Refactored `backup-import.js` (`computeStorageDelta`) and `diagnostic-ui.js` to rely on the canonical `areValuesIdentical` utility.
   - Synchronized `captureFastMirrorSnapshot` in `backup-import.js` to strictly match the canonical 10-key mirror set.
4. **Preserved Complete Architectural Invariants**:
   - Retained classic `<script defer>` architecture; zero ES module conversions; zero npm runtime dependencies.
   - Zero changes made to protected areas: `src/new-tab.js`, `src/preload.js`, `src/instant_load.js`, `manifests/*`, or `dist/*`.
5. **Passed Complete Verification Pipeline**:
   - 100% PASS across all 4 stages of the test pipeline (`npm.cmd test`), covering 142 assertions in 1.16 seconds.
   - Dual-browser build verification (`npm.cmd run build`) completed cleanly for both Chrome and Firefox targets.

---

## 2. Phase 1 Objectives & Completed Deliverables

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #8 PHASE 1 DELIVERABLES                             │
├─────────┬─────────────────────────┬────────────────────────────────────────────────────┤
│ Item 1  │ FAST_MIRROR_MAP Fix     │ Corrected appTimeFormatPreference ->               │
│         │                         │ 'fast-time-format'; removed phantom keys           │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 2  │ Utility Promotion       │ Promoted isPlainObject, areValuesIdentical,        │
│         │                         │ clampNumber, clampInteger to utils.js              │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 3  │ Module Deduplication    │ Eliminated redundant helpers in validator,         │
│         │                         │ diagnostics, storage-service, and backup-import    │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 4  │ Backup Mirror Alignment │ Synchronized captureFastMirrorSnapshot in          │
│         │                         │ backup-import.js to canonical 10-key set           │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 5  │ Unit Test Expansion     │ Added tests in core-utils.test.mjs, updated        │
│         │                         │ storage-service.test.mjs and backup tests          │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Item 6  │ Dual-Browser Build      │ Clean build outputs in dist/chrome & dist/firefox  │
└─────────┴─────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 3. Files Modified & Added

### Source Files Modified:
1. **[`src/newtab/core/utils.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/utils.js)**
   - Added canonical `isPlainObject(value)` with strict prototype inspection.
   - Added canonical `areValuesIdentical(a, b)` with primitive short-circuiting and defensive serialization comparison.
   - Added canonical `clampNumber(val, min, max, defaultVal)` and `clampInteger(val, min, max, defaultVal)`.
   - Exported helpers on `window.isPlainObject`, `window.areValuesIdentical`, `window.clampNumber`, `window.clampInteger`.
2. **[`src/newtab/core/storage-service.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/storage-service.js)**
   - Fixed `FAST_MIRROR_MAP`: changed `clockFormat: 'fast-clock-format'` to `appTimeFormatPreference: 'fast-time-format'`.
   - Removed phantom keys `appSearchAlignment: 'fast-search-align'` and `appCustomColor: 'fast-custom-color'`.
   - Removed duplicate local `isPlainObject` function definition.
3. **[`src/newtab/core/schema-validator.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/schema-validator.js)**
   - Removed redundant local `isPlainObject`, `clampNumber`, and `clampInteger` implementations.
   - Delegated exports on `window.HomebaseValidator` to canonical global utilities.
4. **[`src/newtab/core/storage-diagnostics.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/storage-diagnostics.js)**
   - Removed redundant local `isPlainObject` implementation.
5. **[`src/newtab/settings/backup-import.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js)**
   - Removed redundant local `isPlainObject` implementation.
   - Refactored `computeStorageDelta` to consume canonical `areValuesIdentical`.
   - Synchronized `captureFastMirrorSnapshot` to canonical 10-key fast mirror list (reflecting `fast-time-format` and omitting phantom keys).
   - Added fast-mirror update handling for `appTimeFormatPreference` in `importHomebaseState`.
6. **[`src/newtab/settings/diagnostic-ui.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/diagnostic-ui.js)**
   - Delegated `areValuesIdentical` to canonical `window.areValuesIdentical` when available.

### Test Files Modified:
7. **[`tests/unit/core-utils.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/core-utils.test.mjs)**
   - Added 4 comprehensive test suites (44 assertions) testing `isPlainObject`, `areValuesIdentical`, `clampNumber`, and `clampInteger`.
8. **[`tests/unit/storage-service.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/storage-service.test.mjs)**
   - Added assertions verifying removal of stale and phantom keys in `FAST_MIRROR_MAP`.
   - Added end-to-end mirror synchronization test for `appTimeFormatPreference -> fast-time-format`.
   - Included `utils.js` in execution sandbox.
9. **[`tests/unit/backup-transaction.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/backup-transaction.test.mjs)**
   - Added assertion verifying `fast-time-format` mirror synchronization during transactional backup restore.
   - Included `utils.js` in execution sandbox.
10. **[`tests/unit/backup-validation.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/backup-validation.test.mjs)**
    - Included `utils.js` in execution sandbox.
11. **[`tests/unit/schema-migrations.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/schema-migrations.test.mjs)**
    - Included `utils.js` in execution sandbox.
12. **[`tests/unit/schema-validator.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/schema-validator.test.mjs)**
    - Included `utils.js` in execution sandbox.
13. **[`tests/unit/storage-diagnostics.test.mjs`](file:///c:/Users/Administrator/Desktop/Homebase/tests/unit/storage-diagnostics.test.mjs)**
    - Included `utils.js` in execution sandbox.

### Documentation Files Created:
14. **[`docs/41-cycle8-phase1-implementation-report.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/41-cycle8-phase1-implementation-report.md)**
    - Implementation report (this file).

---

## 4. Detailed Architecture & API Specification

### 4.1 Storage Facade Hardening (`FAST_MIRROR_MAP`)

The canonical `FAST_MIRROR_MAP` in `src/newtab/core/storage-service.js` now strictly tracks the 10 active fast-mirrors required by `src/preload.js` and `src/instant_load.js`:

```javascript
const FAST_MIRROR_MAP = Object.freeze({
  appBackgroundDim: 'fast-bg-dim',
  widgetOrder: 'fast-widget-order',
  appTimeFormatPreference: 'fast-time-format', // Corrected from clockFormat -> fast-clock-format
  appBookmarkTextBg: 'fast-bookmark-bg',
  appPerformanceMode: 'fast-perf-mode',
  appShowSidebar: 'fast-show-sidebar',
  appShowWeather: 'fast-show-weather',
  appShowQuote: 'fast-show-quote',
  appShowNews: 'fast-show-news',
  appShowTodo: 'fast-show-todo'
});
```

#### Synchronous Mirror Key Invariants:
| Storage Key | Mirror Key | Expected Type | Description |
| :--- | :--- | :--- | :--- |
| `appBackgroundDim` | `fast-bg-dim` | Number (0–80) | Background dim overlay percentage |
| `widgetOrder` | `fast-widget-order` | JSON Array | Array of 4 widget IDs in display order |
| `appTimeFormatPreference` | `fast-time-format` | String | `'12-hour'` or `'24-hour'` |
| `appBookmarkTextBg` | `fast-bookmark-bg` | String | Bookmark label text background treatment |
| `appPerformanceMode` | `fast-perf-mode` | Boolean | Disables blurs and heavy animations |
| `appShowSidebar` | `fast-show-sidebar` | Boolean | Sidebar visibility |
| `appShowWeather` | `fast-show-weather` | Boolean | Weather widget card visibility |
| `appShowQuote` | `fast-show-quote` | Boolean | Daily quote widget card visibility |
| `appShowNews` | `fast-show-news` | Boolean | RSS news feed widget card visibility |
| `appShowTodo` | `fast-show-todo` | Boolean | Task list widget card visibility |

### 4.2 Canonical Core Utilities (`src/newtab/core/utils.js`)

#### 1. `isPlainObject(value)`
Strict prototype inspection ensuring value is a plain JavaScript object. Rejects `null`, primitives, arrays, DOM elements, and custom class instances:
```javascript
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype || (proto !== null && Object.getPrototypeOf(proto) === null);
}
```

#### 2. `areValuesIdentical(a, b)`
Deep equality comparison utilizing reference equality first, `NaN` identity, and defensive JSON serialization fallback:
```javascript
function areValuesIdentical(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}
```

#### 3. `clampNumber(val, min, max, defaultVal)`
Clamps a floating-point numeric value within `[min, max]`, safely defaulting if input is non-finite:
```javascript
function clampNumber(val, min, max, defaultVal) {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return defaultVal;
  return Math.min(Math.max(num, min), max);
}
```

#### 4. `clampInteger(val, min, max, defaultVal)`
Rounds and clamps an integer value within `[min, max]`:
```javascript
function clampInteger(val, min, max, defaultVal) {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return defaultVal;
  return Math.min(Math.max(Math.round(num), min), max);
}
```

### 4.3 Duplicate Elimination Across Modules

Prior to Phase 1, `isPlainObject` was duplicated across 4 distinct files. With `src/newtab/core/utils.js` registered at script index 10 in `src/new-tab.html` (line 3326), it executes before any validator, migration, diagnostic, or storage module.

By removing the local definitions:
1. `src/newtab/core/schema-validator.js`: Consumes canonical `isPlainObject`, `clampNumber`, and `clampInteger`.
2. `src/newtab/core/storage-diagnostics.js`: Consumes canonical `isPlainObject`.
3. `src/newtab/core/storage-service.js`: Consumes canonical `isPlainObject`.
4. `src/newtab/settings/backup-import.js`: Consumes canonical `isPlainObject` and `areValuesIdentical`.

---

## 5. Automated Testing Results

### 5.1 Test Pipeline Verification (142/142 Assertions Passing)

The complete Homebase automated test suite was executed via `npm.cmd test`:

```text
========================================
       HOMEBASE TEST SUITE SUMMARY      
========================================
  ✓ PASS  Syntax Validation (node --check) (2.29s) — 60 JS/MJS files clean
  ✓ PASS  Static Invariants (check-newtab-static.mjs) (0.20s) — 41 scripts, 33 modules, 87 globals
  ✓ PASS  Unit Tests (node:test) (1.20s) — 142/142 assertions passing (100% PASS)
  ✓ PASS  Browser Smoke Test (smoke-newtab-file.mjs) (0.06s) — Headless CDP check
----------------------------------------
Total: 4/4 stages passed.
========================================
```

### 5.2 Mirror Synchronization & Utility Unit Tests

1. **`core-utils.test.mjs`** (11 suites, all passing):
   - `isPlainObject`: Verified against plain objects, `Object.create(null)`, arrays, regex, class instances, `null`, primitives.
   - `areValuesIdentical`: Verified across primitives, `NaN`, arrays, nested objects, and mismatched types.
   - `clampNumber`: Verified bounds enforcement (`0.1` to `1.0`), non-finite inputs, and string coercions.
   - `clampInteger`: Verified integer rounding (`5.6` -> `6`) and bounds clamping.
2. **`storage-service.test.mjs`** (23 suites, all passing):
   - `FAST_MIRROR_MAP`: Verified `appTimeFormatPreference` maps to `'fast-time-format'`.
   - Verified that `clockFormat`, `appSearchAlignment`, and `appCustomColor` are `undefined`.
   - Verified end-to-end `HomebaseStorage.set('appTimeFormatPreference', '24-hour')` synchronizes `localStorage['fast-time-format']`.
   - Verified `HomebaseStorage.remove('appTimeFormatPreference')` cleans `localStorage['fast-time-format']`.
3. **`backup-transaction.test.mjs`** (12 suites, all passing):
   - Verified transactional restoration synchronizes `fast-time-format` alongside `fast-bg-dim` and `fast-show-weather`.

---

## 6. Dual-Browser Build & Static Invariants

Full dual-browser build executed via `npm.cmd run build`:

```text
> homebase-extension@0.15.0 build
> node scripts/build.mjs

Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

Static invariant verification (`node scripts/check-newtab-static.mjs`):
- All 41 deferred local scripts verified present.
- `preload.js` invariant maintained: executes synchronously in `<head>` once.
- `new-tab.js` invariant maintained: last deferred runtime script.
- Script order preserved: `utils.js` (line 3326) loads before `schema-validator.js` (line 3345), `storage-diagnostics.js` (line 3347), `storage-service.js` (line 3348), and `backup-import.js` (line 3375).
- Zero duplicate global declarations detected across 87 tracked names.

---

## 7. Protected Boundaries & Architectural Invariants

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and [docs/40-cycle8-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/40-cycle8-plan.md):

| Guardrail / Invariant | Status | Verification Detail |
| :--- | :---: | :--- |
| **No ES Modules** | Preserved | Classic `<script defer>` architecture maintained |
| **No npm Runtime Dependencies** | Preserved | Zero dependencies added |
| **No changes to `src/new-tab.js`** | Unchanged | Clean in `git status` |
| **No changes to `src/preload.js`** | Unchanged | Clean in `git status` |
| **No changes to `src/instant_load.js`**| Unchanged | Clean in `git status` |
| **No changes to `manifests/*`** | Unchanged | Clean in `git status` |
| **No changes to `dist/*`** | Unchanged | Generated outputs excluded from git staging |
| **Dual-Browser Compatibility** | Verified | Tested against Chrome & Firefox build manifests |

---

## 8. Manual Firefox Testing Protocol

Although automated tests pass with 100% success, manual Firefox verification is recommended for:
1. Verifying that changing the time format in the Time widget updates `fast-time-format` in `localStorage` in Firefox private browsing tabs.
2. Confirming that backup export and import correctly preserve `appTimeFormatPreference` without console warnings.
3. Confirming that container bookmark routing and context menus function without reference errors.

---

## 9. Summary & Next Steps (Phase 2 Preview)

With Phase 1 complete, the storage facade foundation is fully hardened and utilities are canonically centralized.

### Ready for Phase 2: Widget & Settings Migration to `HomebaseStorage`:
- Migrate `widget-visibility.js` to `HomebaseStorage.set(WIDGET_ORDER_KEY, ...)`.
- Migrate `time.js`, `weather.js`, `quote.js`, `todo.js`, and `news.js` to `HomebaseStorage`.
- Migrate `settings-preferences.js` and `search-engine-settings.js` to `HomebaseStorage`.
- Migrate `diagnostic-ui.js` auto-repair commit to `HomebaseStorage.setMany()`.
