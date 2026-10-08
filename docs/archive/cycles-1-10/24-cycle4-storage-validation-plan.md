# Homebase — Improvement Cycle #4 Implementation Plan
## Storage Validation Architecture, Schema Validators & Backup Sanitization

> **Author**: Core Extension Architect & Data Systems Lead  
> **Date**: 2026-09-27  
> **Cycle ID**: Homebase Improvement Cycle #4  
> **Target Release**: Homebase v0.15.2  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/20-third-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md), [docs/21-cycle3a-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/21-cycle3a-implementation-report.md), [docs/22-cycle3b-schema-version-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/22-cycle3b-schema-version-plan.md), [docs/23-cycle3b-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/23-cycle3b-implementation-report.md)  
> **Scope**: Storage Validation Architecture Audit & Improvement Specification — **DO NOT MODIFY CODE**

---

## Table of Contents

1. [Executive Summary & Baseline Progress](#1-executive-summary--baseline-progress)
2. [Storage Validation Architecture Audit](#2-storage-validation-architecture-audit)
   - [2.1 Current Storage Read Paths](#21-current-storage-read-paths)
   - [2.2 Current Storage Write Paths](#22-current-storage-write-paths)
   - [2.3 Existing Normalization Functions](#23-existing-normalization-functions)
   - [2.4 Duplicate Validation Logic](#24-duplicate-validation-logic)
   - [2.5 Unsafe Assumptions About Stored Data](#25-unsafe-assumptions-about-stored-data)
   - [2.6 Backup Import Validation Audit](#26-backup-import-validation-audit)
   - [2.7 Migration Validation Opportunities](#27-migration-validation-opportunities)
3. [Evaluation & Ranking of Candidate Improvements](#3-evaluation--ranking-of-candidate-improvements)
   - [Candidate A: Central Storage Validation Layer](#candidate-a-central-storage-validation-layer)
   - [Candidate B: Schema Validation Utilities](#candidate-b-schema-validation-utilities)
   - [Candidate C: Backup Validation Expansion](#candidate-c-backup-validation-expansion)
   - [Candidate D: Corruption Recovery Mechanism](#candidate-d-corruption-recovery-mechanism)
   - [Candidate E: Storage Health Diagnostics](#candidate-e-storage-health-diagnostics)
   - [Comparative Ranking Matrix](#comparative-ranking-matrix)
4. [Selected Improvement Package for Cycle #4](#4-selected-improvement-package-for-cycle-4)
   - [4.1 Core Problem Statement](#41-core-problem-statement)
   - [4.2 Selected Architectural Solution](#42-selected-architectural-solution)
   - [4.3 Scope Boundaries & Invariants](#43-scope-boundaries--invariants)
5. [Startup Performance Architecture & Non-Blocking Invariants](#5-startup-performance-architecture--non-blocking-invariants)
   - [5.1 Performance Constraint Overview](#51-performance-constraint-overview)
   - [5.2 Strict Non-Blocking Invariants](#52-strict-non-blocking-invariants)
   - [5.3 Startup Path Latency Budget (< 1ms Target)](#53-startup-path-latency-budget--1ms-target)
   - [5.4 Preload & Instant Hydration Path Exemption](#54-preload--instant-hydration-path-exemption)
6. [Files Affected & Files Protected](#6-files-affected--files-protected)
   - [6.1 Files That May Change](#61-files-that-may-change)
   - [6.2 Files Strictly Protected (Invariants)](#62-files-strictly-protected-invariants)
7. [Implementation Steps (Execution Sequence)](#7-implementation-steps-execution-sequence)
   - [Phase 1: Core Schema Validation Engine (`src/newtab/core/schema-validator.js`)](#phase-1-core-schema-validation-engine-srcnewtabcoreschema-validatorjs)
   - [Phase 2: Script Dependency Order Integration (`src/new-tab.html`)](#phase-2-script-dependency-order-integration-srcnew-tabhtml)
   - [Phase 3: Backup Import Sanitization Expansion (`src/newtab/settings/backup-import.js`)](#phase-3-backup-import-sanitization-expansion-srcnewtabsettingsbackup-importjs)
   - [Phase 4: Migration Runner Validation Integration (`src/newtab/core/schema-migrations.js`)](#phase-4-migration-runner-validation-integration-srcnewtabcoreschema-migrationsjs)
   - [Phase 5: Automated Unit Test Suite & Performance Benchmarks (`tests/unit/schema-validator.test.mjs`)](#phase-5-automated-unit-test-suite--performance-benchmarks-testsunitschema-validatortestmjs)
8. [Comprehensive Testing & Quality Assurance Plan](#8-comprehensive-testing--quality-assurance-plan)
   - [8.1 Automated 4-Tier Test Pipeline Verification](#81-automated-4-tier-test-pipeline-verification)
   - [8.2 Unit Test Specifications](#82-unit-test-specifications)
   - [8.3 Performance Benchmark Test Specifications](#83-performance-benchmark-test-specifications)
   - [8.4 Manual Cross-Browser Verification (Chrome, Firefox, Edge)](#84-manual-cross-browser-verification-chrome-firefox-edge)
9. [Rollback & Disaster Recovery Strategy](#9-rollback--disaster-recovery-strategy)
10. [Conclusion & Next Actions](#10-conclusion--next-actions)

---

## 1. Executive Summary & Baseline Progress

Homebase has established a dependable, multi-phase engineering foundation across its first three improvement cycles:
- **Cycle #1 (v0.15.0)**: Fixed critical custom wallpaper omission by integrating `myWallpapers` into backup serialization and registration.
- **Cycle #2 (Testing Baseline)**: Deployed a zero-dependency 4-tier automated test harness (`npm test`) integrating syntax AST checks, static structural invariant verification, algorithmic unit tests (`node:test`), and CDP headless smoke validation.
- **Cycle #3A (Backup Retention & Key Alignment)**: Completely eliminated destructive backup imports (`browser.storage.local.remove(removals)` removed), aligned Action Popup bookmark folder tracking with `lastUsedBookmarkFolderId`, and protected unrepresented keys.
- **Cycle #3B (Schema Versioning Foundation)**: Introduced canonical `schemaVersion = 1` in `browser.storage.local`, registered the version marker in `HOMEBASE_OWNED_STORAGE_KEYS`, created the sequential migration runner skeleton ([src/newtab/core/schema-migrations.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/schema-migrations.js)), and integrated startup execution inside `loadAppSettingsFromStorage()` without touching [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js).

### The Objective of Cycle #4
With schema versioning established, **Improvement Cycle #4** tackles the next major vulnerability in the Homebase data layer: **Storage Validation Architecture**. 

Presently, while `schemaVersion` exists, the data inside storage remains largely unvalidated. When data is read from `browser.storage.local`, written by settings and widgets, or imported from external JSON backup files, the system relies on fragile, ad-hoc, type-unsafe assumptions. Corrupted values (such as `NaN` in dim sliders, non-array widget orders, or malformed metadata payloads) can bypass checks and crash startup or visual rendering.

This document conducts an exhaustive architectural audit of all storage paths, evaluates five improvement candidates, establishes strict startup performance non-blocking invariants, and details the complete implementation specification for Cycle #4.

---

## 2. Storage Validation Architecture Audit

### 2.1 Current Storage Read Paths

Storage reads occur across 40+ distinct call sites in the repository via three access patterns:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STORAGE READ ACCESS PATTERNS                    │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│ MECHANISM          │ LOCATIONS                   │ VALIDATION STATUS   │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 1. Bulk Read       │ settings-preferences.js:12  │ Minimal/Ad-hoc type │
│    (40+ keys)      │ new-tab.js:770, 2472        │ fallbacks per key   │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 2. Widget Specific │ weather.js:282, 607, 944    │ Unchecked object    │
│    (1-4 keys)      │ todo.js:175, quote.js:436   │ property navigation │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 3. Fast Mirrors    │ preload.js (head script)    │ Unchecked strings;  │
│    (localStorage)  │ instant_load.js (body top)  │ empty catch blocks  │
└────────────────────┴─────────────────────────────┴─────────────────────┘
```

#### Key Audit Observations:
1. **Unchecked Object Traversal**: In [src/newtab/widgets/weather.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/weather.js#L282), `cachedWeatherData` is read directly:
   ```javascript
   const data = await browser.storage.local.get(['cachedWeatherData', ...]);
   // Accesses data.cachedWeatherData.current_weather.temperature directly
   ```
   If `cachedWeatherData` is an empty object `{}`, a string, or contains malformed sub-objects, accessing nested properties throws unhandled `TypeError` exceptions.
2. **Ad-Hoc Default Coalescing**: In [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js), default values are applied using disparate patterns:
   - Nullish coalescing: `stored[KEY] ?? DEFAULT`
   - Explicit boolean checks: `stored.hasOwnProperty(KEY) ? stored[KEY] !== false : true`
   - Ternary truthiness: `stored[KEY] ? stored[KEY] : DEFAULT` (which incorrectly treats `0` or `false` as falsy, clobbering valid zeroes).
3. **No Schema Validation on Startup**: Neither `loadAppSettingsFromStorage()` nor `initializePage()` validates that stored values match expected types, ranges, or schemas before applying them to DOM nodes or CSS custom properties.

---

### 2.2 Current Storage Write Paths

Homebase writes to storage across more than 50 individual call sites:
- **Direct Widget Saves**:
  - `weather.js` (lines 548, 746, 999): writes forecast JSON, unit strings, latitude/longitude numbers.
  - `todo.js` (line 154): writes array of todo items.
  - `quote.js` (lines 307, 833): writes index integer, tags array, frequency enum string.
  - `news.js` (line 723): writes source string.
- **Settings & Visual Preference Saves**:
  - `settings-preferences.js` (lines 554, 580): writes performance mode, debug overlay booleans.
  - `settings-ui.js` (lines 1182, 1448): writes dim slider integer, wallpaper selection object.
  - `visual-effects-settings.js` (lines 88, 179): writes animation preset and glass style strings.
  - `search-engine-settings.js` (lines 242, 260, 296): writes engines array, default engine ID, current engine ID.
- **Wallpaper & Bookmark Subsystem Writes**:
  - `new-tab.js`: writes poster URLs, video URLs, pool arrays, bookmark root ID, last used folder ID.
  - `action-popup.js` (lines 132, 816): dual-writes last used folder ID and recent folders array.

#### Key Audit Observations:
- **Zero Pre-Write Validation Barrier**: Not a single write path passes through a centralized validator before invoking `browser.storage.local.set()`.
- **Unbounded Numeric Writes**: Latitude and longitude are written without coordinate range verification (`-90 <= lat <= 90`, `-180 <= lon <= 180`). Background dim values are written without clamping (`0 <= dim <= 80`).
- **Unbounded Array Growth**: `domainIconMap` and `wallpaperPoolIds` have no length bounds or payload size caps, allowing unbounded storage growth.

---

### 2.3 Existing Normalization Functions

Currently, data normalization exists in small, isolated silos:

| Normalization Function | File Location | What It Validates | Deficiencies |
| :--- | :--- | :--- | :--- |
| `normalizeWidgetOrder` | `preload.js:78`, `widget-visibility.js:46` | Ensures 4 default widget IDs exist without duplicates | Implemented twice; hardcodes exactly 4 widgets; cannot validate external custom orders |
| `normalizeTodoItems` | `todo.js:41` | Ensures array of objects with string `id`, `text`, boolean `done`, numeric `createdAt` | Generates synthetic IDs for malformed items, but does not bound text length or list size |
| `normalizeMyWallpapersItems` | `backup-import.js:87`, `gallery-ui.js:679` | Validates custom wallpaper descriptors, fields, numbers, and types | Exists in two separate implementations; complex mapping logic |
| `normalizeWeatherTimestamp` | `weather.js:66` | Parses numeric vs string timestamps | Only handles date conversion; does not validate weather forecast schema |
| `normalizeNewsText` | `news.js:107` | Trims, strips HTML tags from titles | Text sanitizer only; does not validate news item structure |
| `resolveLastUsedFolderId` | `action-popup.js:83` | Fallback resolution between canonical and legacy keys | Simple string resolution; does not verify if folder ID actually exists |

---

### 2.4 Duplicate Validation Logic

The audit uncovered multiple areas where identical validation logic is duplicated across separate files:

1. **Widget Order Normalization**:
   - `src/preload.js` (lines 78–98) and `src/newtab/widgets/widget-visibility.js` (lines 46–66) share identical 20-line routines.
2. **Object Structure Checks (`isPlainObject`)**:
   - Explicitly defined in `backup-import.js` (line 81) using prototype inspection.
   - Re-implemented ad-hoc in `widget-visibility.js`, `settings-preferences.js`, and `new-tab.js` using `typeof val === 'object' && val !== null && !Array.isArray(val)`.
3. **Hex Color Code Validation**:
   - `bookmark-editor.js` and `settings-preferences.js` duplicate hex color regex checks: `/^#[0-9A-Fa-f]{6}$/`.
4. **Number Bounding & Clamping**:
   - Slider clamping (`Math.min(Math.max(val, min), max)`) is duplicated independently across `settings-preferences.js` (dim 0–80), `bookmark-style-runtime.js` (opacity 0.1–1.0, blur 0–20), and `visual-effects-settings.js` (speed 0.1–1.0).
5. **Action Popup Recent Folders Sanitization**:
   - Filter and `slice(0, 6)` logic is duplicated between `action-popup.js` (line 809) and `backup-import.js` (line 227).

---

### 2.5 Unsafe Assumptions About Stored Data

The codebase exhibits dangerous implicit assumptions regarding stored data:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      UNSAFE STORAGE ASSUMPTIONS                        │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│ STORED KEY         │ CODEBASE ASSUMPTION         │ REALITY ON FAILURE  │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ widgetOrder        │ Always array of strings     │ Non-array crashes   │
│                    │ (order.forEach in preload)  │ DOM mounting        │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ appBackgroundDim   │ Always number 0-80          │ Non-number sets     │
│                    │ (dim + '%' in CSS var)      │ invalid CSS: NaN%   │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ cachedWeatherData  │ Has current_weather & temp  │ Empty object throws │
│                    │ (data.current_weather.temp) │ fatal TypeError     │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ bookmarkCustomMeta │ Object mapping ID to meta   │ String/null crashes │
│                    │ (Object.keys(meta).length)  │ tile rendering      │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ searchEnginesConfig│ Array of { id, enabled }    │ Corrupt entry wipes │
│                    │ (config.find(e => e.id))    │ search selector     │
└────────────────────┴─────────────────────────────┴─────────────────────┘
```

If an external tool, corrupted backup, or failed write introduces malformed types into these keys, the dashboard has no built-in recovery mechanism and crashes or renders a broken visual state.

---

### 2.6 Backup Import Validation Audit

In Cycle #3A, destructive deletions were eliminated from `importHomebaseState()` in [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js). However, an inspection of the current import validation reveals a critical gap:

#### Current Import Validation Breakdown (78 Registered Keys):
- **Deeply Sanitized Keys (5 keys)**:
  - `todoItems`: passed through `normalizeTodoItems()`
  - `todoHideDone`: verified `typeof === 'boolean'`
  - `myWallpapers`: passed through `normalizeMyWallpapersItems()`
  - `homebaseRecentSaveFolders`: verified array of strings, filtered, capped at 6
  - `schemaVersion`: verified positive integer
- **Completely Unchecked Keys (73 keys)**:
  - For all other 73 keys, the code executes:
    ```javascript
    updates[key] = incoming[key]; // DIRECT UNCHECKED PASS-THROUGH
    ```
  - If an incoming backup JSON contains:
    - `appBackgroundDim: "extreme_dark"` -> Written directly to storage.
    - `widgetOrder: false` -> Written directly to storage.
    - `cachedWeatherData: { invalid: true }` -> Written directly to storage.
    - `bookmarkCustomMetadata: "corrupted_string"` -> Written directly to storage.
    - `appBookmarkTextBgColor: "<script>alert(1)</script>"` -> Written directly to storage.

This represents the single greatest remaining vector for persistent storage corruption in Homebase.

---

### 2.7 Migration Validation Opportunities

With `src/newtab/core/schema-migrations.js` deployed in Cycle #3B, Homebase possesses a sequential migration pipeline. However:
1. **Unvalidated Migration Transforms**: When future migration step functions execute `await migrationStep.migrate(snapshot, browserInstance)`, there is no validation check on the returned data. If a migration function produces invalid keys or types, they are committed directly to disk.
2. **Absence of Storage Health Assessment**: On startup, `runSchemaMigrations()` only checks `schemaVersion`. If `schemaVersion === 1`, it immediately returns `{ status: 'noop' }` even if the underlying storage contains corrupted, malformed, or unparseable data.
3. **Opportunity**: Introducing a schema validator enables both:
   - Validating the output of all future migration steps before committing them.
   - Performing non-destructive, safe sanitation of corrupted keys on startup.

---

## 3. Evaluation & Ranking of Candidate Improvements

Five candidate improvements were evaluated based on the audit findings:

---

### Candidate A: Central Storage Validation Layer
- **Description**: Introduce an omnipresent storage proxy (`HomebaseStorage.get` / `HomebaseStorage.set`) that intercepts every storage operation across the entire extension and validates payloads against schema contracts in real time.
- **Evaluation**:
  - *User Impact*: **High**. Prevents all bad writes from reaching storage.
  - *Risk Reduction*: **Very High**. Guarantees system-wide type safety.
  - *Complexity*: **High / Prohibitive**. Requires editing 15+ files and dozens of call sites across widgets, settings, action popup, and `src/new-tab.js`.
  - *Constraint Conflict*: Direct violation of [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) high-risk rules. `src/new-tab.js` has dozens of `storage.local.get/set` calls that must not be touched.
  - *Future AI Safety Value*: **Very High**.

---

### Candidate B: Schema Validation Utilities
- **Description**: Create a dedicated, modular validation library (`src/newtab/core/schema-validator.js`) that defines standard validators, sanitizers, and safe defaults for all 78 registered storage keys. Exports pure, deterministic functions (`validateKey`, `sanitizeKey`, `sanitizeStorageBatch`, `isValidColor`, `clampNumber`).
- **Evaluation**:
  - *User Impact*: **Moderate to High**. Provides the authoritative rules engine for all subsystems.
  - *Risk Reduction*: **High**. Eliminates duplicate normalization routines; provides safe fallbacks.
  - *Complexity*: **Low to Medium**. Contained entirely within a new core module; zero alterations to `src/new-tab.js`.
  - *Future AI Safety Value*: **Exceptional**. Gives future coding agents a single, auditable schema contract for every key in the extension.

---

### Candidate C: Backup Validation Expansion
- **Description**: Upgrade `importHomebaseState` in `src/newtab/settings/backup-import.js` to run all 78 incoming keys through the schema validation utilities, rejecting or sanitizing malformed values before they reach `browser.storage.local.set(updates)`.
- **Evaluation**:
  - *User Impact*: **Very High**. Immunizes the extension against the #1 source of corrupted data (imported files).
  - *Risk Reduction*: **Very High**. Prevents corrupted backup files from bricking user dashboards.
  - *Complexity*: **Low to Medium**. Confined strictly to `backup-import.js` and associated unit tests.
  - *Future AI Safety Value*: **Very High**. Guarantees that test fixtures and imported profiles always conform to valid schemas.

---

### Candidate D: Corruption Recovery Mechanism
- **Description**: Implement self-healing fallbacks: when a reader or validator detects corrupted data for a key (e.g., non-array `widgetOrder` or `NaN` dim), it automatically replaces the corrupted value with the canonical default value rather than crashing.
- **Evaluation**:
  - *User Impact*: **High**. The user never sees a broken dashboard; the UI seamlessly self-repairs.
  - *Risk Reduction*: **High**. Prevents single-key corruption from cascading into tab-wide failure.
  - *Complexity*: **Medium**. Must be designed defensively to ensure legitimate user settings are not inadvertently reset.
  - *Future AI Safety Value*: **High**.

---

### Candidate E: Storage Health Diagnostics
- **Description**: Add an on-demand diagnostic utility (`auditStorageHealth()`) that can inspect the current contents of `browser.storage.local`, reporting orphaned keys, invalid types, out-of-range numbers, and oversized items.
- **Evaluation**:
  - *User Impact*: **Low to Moderate**. Primarily a diagnostic tool for power users and developers.
  - *Risk Reduction*: **Moderate**. Identifies issues but does not actively prevent them.
  - *Complexity*: **Medium**.
  - *Future AI Safety Value*: **High**. Excellent utility for automated CI checks and smoke testing.

---

### Comparative Ranking Matrix

| Candidate Improvement | User Impact | Risk Reduction | Complexity | Future AI Safety Value | Overall Score | Priority Rank |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Candidate B: Schema Validation Utilities** | **HIGH** | **HIGH** | **Low-Med (S/M)** | **EXCEPTIONAL** | **9.5 / 10** | **Rank 1 (Selected Core)** |
| **Candidate C: Backup Validation Expansion** | **VERY HIGH**| **VERY HIGH** | **Low-Med (S/M)** | **VERY HIGH** | **9.4 / 10** | **Rank 1 (Selected Integration)** |
| **Candidate D: Corruption Recovery Mechanism** | **HIGH** | **HIGH** | **Medium (M)** | **HIGH** | **8.6 / 10** | **Rank 2 (Combined with B/C)** |
| **Candidate E: Storage Health Diagnostics** | **MODERATE** | **MODERATE** | **Medium (M)** | **HIGH** | **7.5 / 10** | **Rank 3 (Deferred)** |
| **Candidate A: Central Storage Layer** | **HIGH** | **VERY HIGH** | **High/Prohibitive**| **VERY HIGH** | **6.0 / 10** | **Rank 4 (Deferred post-extractions)** |

---

## 4. Selected Improvement Package for Cycle #4

### 4.1 Core Problem Statement
Homebase currently validates only 5 of its 78 storage keys upon backup import. All other 73 keys are accepted without type, range, or structural checking, allowing corrupted JSON files or malformed data to permanently pollute `browser.storage.local` and cause crashes during dashboard hydration. Furthermore, validation and normalization logic is duplicated or ad-hoc across multiple files.

### 4.2 Selected Architectural Solution
For **Improvement Cycle #4**, Homebase will implement a unified, modular **Storage Validation Architecture**:
1. **Schema Validation Utilities (`src/newtab/core/schema-validator.js`)**:
   - Establish an authoritative schema dictionary for all 78 registered keys in `HOMEBASE_OWNED_STORAGE_KEYS`.
   - Provide safe, pure, synchronous validation functions: `validateKey(key, value)`, `sanitizeKey(key, value)`, and `sanitizeStorageBatch(updates)`.
   - Implement safe clamping, color validation, enum verification, and structural type checks.
   - Embed non-destructive corruption recovery: invalid values fall back to safe canonical defaults.
2. **Backup Import Sanitization Expansion (`src/newtab/settings/backup-import.js`)**:
   - Upgrade `importHomebaseState()` to validate and sanitize **all 78 keys** using the schema validator before writing to `storage.local`.
   - Reject corrupt types, clamp out-of-bounds numbers, sanitize array contents, and discard unrecognized keys.
3. **Migration Runner Integration Hook (`src/newtab/core/schema-migrations.js`)**:
   - Hook validation into the migration pipeline to ensure any future migration step's output is sanitized before being committed to storage.
4. **Automated Unit Testing Suite (`tests/unit/schema-validator.test.mjs`)**:
   - Create a dedicated unit test suite with 100% test coverage over every validator, boundary condition, and sanitization fallback, including execution performance assertion (<3ms).

### 4.3 Scope Boundaries & Invariants
In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **DO NOT MODIFY** `src/new-tab.js`. Startup orchestration, bookmark grids, and idle schedulers remain strictly untouched.
- **DO NOT CONVERT** files to ES modules; keep classic deferred scripts.
- **DO NOT INTRODUCE** third-party dependencies or npm packages (e.g. Zod, Joi, Ajv). All validators must use vanilla JavaScript.
- **DO NOT TOUCH** `dist/`, manifests, or CSS styling.

---

## 5. Startup Performance Architecture & Non-Blocking Invariants

A critical requirement of Homebase is sub-50ms perceived startup times and zero layout shift. To guarantee that schema validation never introduces perceptible startup overhead, Cycle #4 establishes four strict performance rules:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STARTUP PERFORMANCE NON-BLOCKING RULES               │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│ CONSTRAINT         │ IMPLEMENTATION ENFORCEMENT  │ LATENCY IMPACT      │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 1. Zero Network    │ Pure local JS algorithms;   │ 0ms network         │
│    Dependencies    │ no fetch() or remote APIs   │ latency             │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 2. Zero Repeated   │ Validators do not call      │ 0 extra disk I/O    │
│    Storage Reads   │ storage.local.get; inspect  │ round-trips         │
│                    │ in-memory data only         │                     │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 3. Zero Heavy      │ No JSON.parse/stringify     │ Negligible heap     │
│    JSON Cloning    │ deep cloning; shallow copy- │ allocation          │
│                    │ on-write only on mutation   │                     │
├────────────────────┼─────────────────────────────┼─────────────────────┤
│ 4. Strictly        │ Pure synchronous functions; │ 0 microtask queuing │
│    Synchronous     │ no Promise allocations      │ < 1ms total run     │
└────────────────────┴─────────────────────────────┴─────────────────────┘
```

### 5.1 Performance Constraint Overview
Schema validation must operate entirely as an in-memory compute filter. It must never initiate asynchronous storage reads, never poll APIs, and never trigger garbage collection thrashing through deep JSON serialization.

### 5.2 Strict Non-Blocking Invariants
1. **Avoid Network Calls**:
   - `schema-validator.js` contains **zero network calls**. It never queries Cloudflare R2, Open-Meteo, or favicon endpoints.
   - All validation rules (enums, ranges, hex regexes, structural checks) are evaluated locally in pure V8/SpiderMonkey bytecode.
2. **Avoid Repeated Storage Reads**:
   - Validation functions (`validateKey`, `sanitizeKey`, `sanitizeStorageBatch`) **never read from `browser.storage.local` or `localStorage`**.
   - They accept already-fetched in-memory dictionaries as arguments and return sanitized objects.
   - Zero storage I/O operations are added to the new-tab critical boot path.
3. **Avoid Heavy JSON Cloning**:
   - Validators avoid `JSON.parse(JSON.stringify(payload))` deep clone patterns.
   - Validators operate via **shallow property evaluation**:
     - If a value is already valid, it is passed through by reference or simple scalar copy.
     - Copy-on-write is used exclusively for objects and arrays that require active sanitization (e.g. invalid array items filtered, out-of-range numbers clamped).
4. **Remain Synchronous Unless Storage Access is Required**:
   - All validation and sanitization functions are declared as **pure synchronous JavaScript functions**:
     ```javascript
     function validateKey(key, value) { ... } // Synchronous -> boolean
     function sanitizeKey(key, value) { ... } // Synchronous -> sanitizedValue
     function sanitizeStorageBatch(batch) { ... } // Synchronous -> sanitizedBatch
     ```
   - No `async` keyword, no `new Promise()`, and no microtask scheduling overhead.
   - Asynchronous storage calls remain confined exclusively to standard storage persistence operations (`browser.storage.local.set`).

### 5.3 Startup Path Latency Budget (< 1ms Target)
- The entire evaluation of all 78 registered storage keys through `sanitizeStorageBatch` must execute in **less than 1 millisecond (< 1.0ms)** on modern hardware.
- A dedicated performance assertion in `tests/unit/schema-validator.test.mjs` verifies that validating a full 78-key payload executes in under 3.0ms in Node.js.

### 5.4 Preload & Instant Hydration Path Exemption
- **`src/preload.js`** (the synchronous `<head>` script) and **`src/instant_load.js`** (the synchronous `<top-of-body>` script) remain **completely unburdened** by schema validation.
- Fast preload mirrors continue to read directly from `localStorage` without validation interceptors to preserve instantaneous first paint (< 50ms).
- Validation operates strictly during asynchronous settings hydration (`settings-preferences.js`), backup restoration (`backup-import.js`), and migration execution (`schema-migrations.js`).

---

## 6. Files Affected & Files Protected

### 6.1 Files That May Change

| File Path | Status | Planned Responsibility |
| :--- | :---: | :--- |
| **`src/newtab/core/schema-validator.js`** | **NEW** | Authoritative schema dictionary, synchronous key validators, clamping helpers, and pure batch sanitization functions. |
| **`src/newtab/settings/backup-import.js`** | **MODIFIED** | Connect `importHomebaseState()` to `schema-validator.js`, validating all 78 keys on import before writing to storage. |
| **`src/newtab/core/schema-migrations.js`** | **MODIFIED** | Add post-migration validation step using `sanitizeStorageBatch()` before committing updates. |
| **`src/new-tab.html`** | **MODIFIED** | Inject `<script src="newtab/core/schema-validator.js" defer></script>` in Core Runtime before `schema-migrations.js`. |
| **`tests/unit/schema-validator.test.mjs`** | **NEW** | Comprehensive unit tests for all validators, edge cases, corruption recovery, and performance budget verification. |
| **`docs/13-maintenance-log.md`** | **MODIFIED** | Log Cycle #4 change ledger entry upon completion. |
| **`docs/14-ai-change-history.md`** | **MODIFIED** | Log Cycle #4 AI change provenance entry upon completion. |
| **`docs/25-cycle4-implementation-report.md`** | **NEW** | Author post-implementation verification report. |

### 6.2 Files Strictly Protected (Invariants)

```text
[HIGH-RISK / STRICTLY PROTECTED FILES - DO NOT TOUCH]
1. src/new-tab.js                      (Monolithic runtime: initializePage, startup orchestration, grid)
2. src/preload.js                     (Instant synchronous <head> preloader)
3. src/instant_load.js                (Fast synchronous widget hydration)
4. manifests/manifest.chrome.json     (Chrome MV3 manifest)
5. manifests/manifest.firefox.json    (Firefox MV3 manifest)
6. dist/*                             (Generated build artifacts)
7. src/css/* & src/new-tab.css        (Visual styling & CSS tokens)
8. src/assets/js/Sortable.min.js      (Vendor drag-and-drop library)
9. src/newtab/bookmarks/*             (Bookmark grid & style runtimes)
10. src/newtab/wallpaper/*            (Video/poster cache & gallery UI)
```

---

## 7. Implementation Steps (Execution Sequence)

The implementation for Cycle #4 is structured into five sequential phases:

```mermaid
graph TD
    P1[Phase 1: Build schema-validator.js (Pure Sync)] --> P2[Phase 2: Register Script in new-tab.html]
    P2 --> P3[Phase 3: Integrate with backup-import.js]
    P3 --> P4[Phase 4: Integrate with schema-migrations.js]
    P4 --> P5[Phase 5: Author Unit Tests & Performance Benchmark]
```

### Phase 1: Core Schema Validation Engine (`src/newtab/core/schema-validator.js`)
1. **Lightweight Synchronous Helper Functions**:
   - `isPlainObject(val)`: Fast prototype check (`proto === Object.prototype || proto === null`).
   - `clampNumber(val, min, max, defaultVal)`: Fast ternary check with `Number.isFinite`.
   - `clampInteger(val, min, max, defaultVal)`: Fast `Number.isInteger` check with clamp.
   - `isValidHexColor(val)`: Fast cached RegExp test: `/^#[0-9A-Fa-f]{6}$/`.
   - `isNonEmptyString(val)`: Verifies string with trimmed length > 0.
   - `isEnum(val, allowedArray, defaultVal)`: Fast `Array.prototype.includes()` lookup.
2. **Schema Registry (`SCHEMA_DEFINITIONS`)**:
   Pure synchronous validators for all 78 registered keys:
   - **Appearance & Themes**: `appBackgroundDim` (0–80), `appBookmarkTextBgColor` (hex), `appBookmarkTextBgOpacity` (0.1–1.0), `appBookmarkTextBgBlur` (0–20), `appBookmarkFallbackColor` (hex), `appBookmarkFolderColor` (hex), `appGlassStylePref` (enum), `appGridAnimationPref` (enum), `appGridAnimationSpeed` (0.1–1.0), `appGridAnimationEnabled` (boolean).
   - **Widgets & Sidebar**: `appShowSidebar`, `appShowWeather`, `appShowQuote`, `appShowNews`, `appShowTodo` (all boolean); `widgetOrder` (array of 4 unique known IDs); `appNewsSource` (enum of 6 sources); `quoteUpdateFrequency` (enum of 3); `quoteLocalIndexV1` (integer >= 0); `quoteTags` (array of strings); `cachedWeatherData` (plain object or null); `cachedUnits` & `weatherUnits` (celsius | fahrenheit); `weatherLat` (-90 to 90 or null); `weatherLon` (-180 to 180 or null); `weatherCityName` (string).
   - **Todos**: `todoItems` (passed through synchronous item normalizer); `todoHideDone` (boolean).
   - **Bookmarks**: `homebaseBookmarkRootId` (string); `lastUsedBookmarkFolderId` (string); `bookmarkCustomMetadata` (record of ID -> object with optional icon, title, url, containerId); `folderCustomMetadata` (record of ID -> object with optional color, icon, customOrder); `domainIconMap` (record of domain -> base64 string); `homebaseRecentSaveFolders` (array of strings, max 6).
   - **Search**: `appSearchOpenNewTab`, `appSearchRememberEngine`, `appSearchMath`, `appSearchShowHistory`, `appSearchSuggestionsEnabled` (all boolean); `appSearchDefaultEngine` & `currentSearchEngineId` (string); `searchEnginesConfig` (array of objects with string `id` and boolean `enabled`).
   - **Wallpapers & Media**: `wallpaperSelection` (plain object or null); `cachedAppliedPosterUrl`, `cachedAppliedPosterDataUrl`, `cachedAppliedVideoUrl` (strings); `videosManifest` (array of objects); `wallpaperPoolIds`, `galleryFavorites`, `cachedGalleryPosters` (arrays of strings); `dailyWallpaperEnabled` (boolean); `wallpaperTypePreference` (video | static); `wallpaperQualityPreference` (high | low); `myWallpapers` (passed through `normalizeMyWallpapersItems`).
   - **System & Tabs**: `appTimeFormatPreference` (12-hour | 24-hour); `appMaxTabsCount` (integer 0–50); `appAutoCloseMinutes` (integer 0–240); `appSingletonMode`, `appPerformanceMode`, `debugPerfOverlay`, `appBatteryOptimization`, `appCinemaMode`, `appContainerMode`, `appContainerNewTab` (all boolean); `schemaVersion` (integer >= 1).
3. **Public API (Strictly Synchronous)**:
   ```javascript
   window.HomebaseValidator = {
     validateKey,             // (key, value) -> boolean
     sanitizeKey,             // (key, value) -> sanitizedValue
     sanitizeStorageBatch,    // (batchObject) -> sanitizedBatchObject
     SCHEMA_DEFINITIONS
   };
   ```

### Phase 2: Script Dependency Order Integration (`src/new-tab.html`)
- Register `src/newtab/core/schema-validator.js` under the Core Runtime section in `src/new-tab.html`:
  ```html
  <!-- Core runtime -->
  <script src="newtab/core/dock-navigation.js" defer></script>
  <script src="newtab/core/schema-validator.js" defer></script>
  <script src="newtab/core/schema-migrations.js" defer></script>
  ```
- *Order Justification*: Must load **before** `schema-migrations.js`, `backup-import.js`, and `settings-preferences.js` so that `window.HomebaseValidator` is immediately available to all consumers.

### Phase 3: Backup Import Sanitization Expansion (`src/newtab/settings/backup-import.js`)
- Update `importHomebaseState()` to use `sanitizeStorageBatch()`:
  - If a key exists in `incoming`, pass it through `HomebaseValidator.sanitizeKey(key, incoming[key])`.
  - If `sanitizeKey` returns a valid sanitized value, include it in `updates[key]`.
  - If `sanitizeKey` detects an invalid, unrecoverable type, discard it and leave the user's existing setting intact.
  - Retain existing special-case mappings (such as `homebaseLastUsedFolderId` -> `lastUsedBookmarkFolderId`).

### Phase 4: Migration Runner Validation Integration (`src/newtab/core/schema-migrations.js`)
- In `runSchemaMigrations()`, wrap the result of `migrationStep.migrate()` with `HomebaseValidator.sanitizeStorageBatch(transformedUpdates)` before invoking `browserInstance.storage.local.set()`, guaranteeing that no future migration can persist invalid data.

### Phase 5: Automated Unit Test Suite & Performance Benchmarks (`tests/unit/schema-validator.test.mjs`)
- Implement comprehensive unit tests validating every category, boundary condition, corrupted input, sanitization fallback, and performance execution budget.

---

## 8. Comprehensive Testing & Quality Assurance Plan

### 8.1 Automated 4-Tier Test Pipeline Verification

The changes must execute and pass cleanly across all four stages of `npm test`:

```powershell
# Stage 1: Syntax Validation
node --check src/newtab/core/schema-validator.js
node --check src/newtab/settings/backup-import.js
node --check src/newtab/core/schema-migrations.js
node --check tests/unit/schema-validator.test.mjs

# Stage 2: Static Invariants & Declarations
node scripts/check-newtab-static.mjs
# Must pass all 11 checks; verify schema-validator.js script order

# Stage 3: Unit Tests
npm.cmd test
# Must run existing 41 tests + new schema-validator tests (50+ total tests passing)

# Stage 4: Distribution Build
npm.cmd run build:chrome
npm.cmd run build:firefox
```

### 8.2 Unit Test Specifications

The new test file `tests/unit/schema-validator.test.mjs` must test:
1. **Primitive & Number Bounding**:
   - `appBackgroundDim`: Clamps negative numbers to 0, numbers > 80 to 80, non-numbers to default (0).
   - `appBookmarkTextBgOpacity`: Clamps < 0.1 to 0.1, > 1.0 to 1.0, non-numbers to default (0.65).
   - Coordinates: `weatherLat` clamps to [-90, 90], `weatherLon` clamps to [-180, 180].
2. **Hex Color Validation**:
   - Accepts valid 6-character hex (`#2CA5FF`, `#FFFFFF`, `#000000`).
   - Rejects invalid strings (`red`, `#FFF`, `rgb(0,0,0)`, `<script>`), falling back to canonical defaults.
3. **Enum Verification**:
   - `appTimeFormatPreference`: Accepts `'12-hour'` and `'24-hour'`; rejects anything else.
   - `appNewsSource`: Accepts valid RSS IDs; rejects unknown sources.
   - `appGlassStylePref`: Accepts `'original'`, `'frosted'`, `'tinted'`.
4. **Complex Structures**:
   - `widgetOrder`: Replaces corrupted non-arrays or incomplete arrays with normalized 4-widget order.
   - `bookmarkCustomMetadata`: Rejects non-objects; sanitizes internal properties.
   - `searchEnginesConfig`: Filters out elements lacking valid `id` or boolean `enabled`.
5. **Batch Sanitization & Backup Import Integration**:
   - Simulates importing a corrupted backup JSON with 15 malformed keys.
   - Asserts that all 15 keys are either cleanly sanitized or discarded.
   - Asserts that valid keys are preserved without alteration.

### 8.3 Performance Benchmark Test Specifications

The unit test suite will include explicit performance assertions to guard against startup degradation:
1. **Synchronous Execution Guarantee**:
   - Assert that `validateKey()`, `sanitizeKey()`, and `sanitizeStorageBatch()` return synchronous values immediately (not Promises).
2. **Batch Sanitization Latency Benchmark**:
   - Generate a full mock storage payload containing all 78 registered keys.
   - Measure execution duration of `sanitizeStorageBatch()` across 100 consecutive runs using `performance.now()`.
   - **Assertion**: Average batch processing time must be **under 1.0ms** (< 3.0ms worst-case cold execution).
3. **Memory & Allocation Invariance**:
   - Verify that passing an already valid dictionary returns valid properties without executing deep `JSON.parse(JSON.stringify())` duplication.

### 8.4 Manual Cross-Browser Verification (Chrome, Firefox, Edge)

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), automated tests are supplemented with manual cross-browser testing:

1. **Google Chrome (Blink)**:
   - Load `dist/chrome` as unpacked extension.
   - Export backup -> Edit JSON to introduce corrupt values (`appBackgroundDim: "invalid"`, `widgetOrder: 12345`) -> Import backup.
   - Verify: Import succeeds; dashboard reloads; dim defaults safely to 0%; widget order restores to default; zero console errors; no perceived startup latency.
2. **Mozilla Firefox (Gecko)**:
   - Load `dist/firefox` via `about:debugging`.
   - Verify: `schema-validator.js` loads in Firefox without CSP warnings; backup export/import round-trip behaves identically to Chrome.
3. **Microsoft Edge (Chromium)**:
   - Verify sidebar responsiveness and settings modal functionality.

---

## 9. Rollback & Disaster Recovery Strategy

If an unexpected regression or defect occurs during Cycle #4 implementation:

### 9.1 Runtime Fault Tolerance
- All validation functions in `schema-validator.js` are pure, non-throwing functions wrapped in defensive `try...catch` blocks.
- If an exception occurs inside a validator, it logs a warning and returns the canonical default value for that key. The dashboard never crashes.

### 9.2 Clean Git Reversion
- Because Cycle #4 adds a new module (`schema-validator.js`) and hooks into `backup-import.js` and `schema-migrations.js` additively without modifying `src/new-tab.js`:
  ```powershell
  # Clean rollback command:
  git revert <cycle-4-commit-hash>
  npm.cmd test
  npm.cmd run build
  ```
- Removing `schema-validator.js` leaves `browser.storage.local` completely intact because no keys are renamed or deleted.

---

## 10. Conclusion & Next Actions

This implementation plan incorporates all architectural performance requirements for **Homebase Improvement Cycle #4**. 

By creating a centralized, pure synchronous schema validation library (`src/newtab/core/schema-validator.js`), expanding backup import sanitization to cover all 78 owned storage keys, avoiding repeated storage reads and heavy JSON cloning, and enforcing a strict sub-millisecond execution budget, Cycle #4 permanently eliminates the threat of storage corruption while preserving 100% backward compatibility and keeping new-tab startup blazing fast.

**STATUS: AUDIT AND PLAN COMPLETE. AWAITING USER APPROVAL PRIOR TO CODE IMPLEMENTATION.**
