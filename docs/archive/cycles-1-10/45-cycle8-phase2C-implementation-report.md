# Homebase Improvement Cycle #8 Phase 2C Implementation Report: Remaining Storage Consumer Migration

**Date:** September 29, 2026  
**Cycle:** Cycle #8 — Phase 2C  
**Branch:** `development`  
**Status:** Completed & Verified

---

## 1. Overview & Objectives

In Phase 2C of Cycle #8, the final tier of storage consumers was migrated to the `HomebaseStorage` facade, concluding the repository-wide migration of user-facing extension storage access.

### Core Goals:
1. **Migrate Diagnostic UI Auto-Repair & Size Estimation**:
   - `handleAutoRepairStorage()`: Replace direct `browser.storage.local.get(null)` and `set(patch)` with `HomebaseStorage.snapshot()` and `HomebaseStorage.setMany(patch)`.
   - `getStorageQuotaTelemetry()`: Replace direct `browser.storage.local.get(null)` size calculation with `HomebaseStorage.snapshot()`.
   - Maintain strict privacy invariants (zero PII exposure) and minimal mutation guarantees (write only changed keys).
2. **Migrate Wallpaper Subsystem Storage Adapter**:
   - `storageLocalGet(keys)`: Route through `HomebaseStorage.getMany(keys)`.
   - `storageLocalSet(items)`: Route through `HomebaseStorage.setMany(items)`.
   - `storageLocalRemove(keys)`: Route through `HomebaseStorage.remove(keys)`.
   - Preserve wallpaper blobs, order, favorites, selection, and caching behavior.
3. **Migrate Firefox Containers Integration**:
   - `setupContainerMode()`: Route `appContainerMode` and `appContainerNewTab` preference persistence through `HomebaseStorage.set()`.
4. **Preserve Defensive Fallback**:
   - If `HomebaseStorage` is unmounted or in test harnesses providing custom browser mocks, cleanly fall back to `browser.storage.local`.
5. **Boundary Invariants**:
   - Zero changes to `src/new-tab.js`, `src/preload.js`, `src/instant_load.js`, `manifests/*`, `src/newtab/core/schema-migrations.js`, or `dist/*`.

---

## 2. Files Changed & Migration Details

### 2.1 `src/newtab/settings/diagnostic-ui.js`
- **Functions Migrated:**
  - `handleAutoRepairStorage(button, customBrowserApi, customValidator)`:
    - Reads storage snapshot via `HomebaseStorage.snapshot()` when `customBrowserApi` is not provided.
    - Commits minimal repair patch via `HomebaseStorage.setMany(patch)`, automatically syncing fast mirrors for repaired items.
    - Falls back to `browserInstance.storage.local.get(null)` and `browserInstance.storage.local.set(patch)` when `customBrowserApi` is passed or `HomebaseStorage` is absent.
  - `getStorageQuotaTelemetry(customBrowserApi)`:
    - Uses `HomebaseStorage.snapshot()` for serialized byte estimation when `getBytesInUse` is absent and `customBrowserApi` is null.
    - Falls back to `browserInstance.storage.local.get(null)`.

### 2.2 `src/newtab/wallpaper/gallery-ui.js`
- **Functions Migrated:**
  - `storageLocalGet(keys)`: Routes key lookup through `HomebaseStorage.getMany(keys)`, maintaining fallback to `browser.storage.local.get(keys)`.
  - `storageLocalSet(items)`: Routes item dictionary through `HomebaseStorage.setMany(items)`, maintaining fallback to `browser.storage.local.set(items)`.
  - `storageLocalRemove(keys)`: Routes key removal through `HomebaseStorage.remove(keys)`, maintaining fallback to `browser.storage.local.remove(keys)`.
  - Exposes `storageLocalGet`, `storageLocalSet`, and `storageLocalRemove` on `window.HomebaseGallery` for unit testing and direct verification.

### 2.3 `src/newtab/integrations/firefox-containers.js`
- **Functions Migrated:**
  - `setupContainerMode()` container mode toggle handler: Persists `appContainerMode` via `HomebaseStorage.set(APP_CONTAINER_MODE_KEY, isEnabled)` with fallback to `browser.storage.local.set`.
  - `setupContainerMode()` radio button change handler: Persists `appContainerNewTab` via `HomebaseStorage.set(APP_CONTAINER_NEW_TAB_KEY, appContainerNewTabPreference)` with fallback to `browser.storage.local.set`.

---

## 3. Storage Access Reduction

With the completion of Phase 2A, Phase 2B, and Phase 2C, direct storage access across `src/newtab/` has been systematically eliminated:

| Operational Subsystem | Phase Migrated | Direct Calls Remaining |
| :--- | :---: | :---: |
| **Tier 1: Dashboard Widgets** (`widget-visibility`, `time`, `todo`, `quote`, `news`, `weather`) | Phase 2A | 0 (all routed via `HomebaseStorage` with fallback) |
| **Tier 2: Settings UI** (`settings-preferences`, `search-engine-settings`, `visual-effects-settings`, `settings-ui`) | Phase 2B | 0 (all routed via `HomebaseStorage` with fallback) |
| **Tier 3: Diagnostics & Auto-Repair** (`diagnostic-ui`) | Phase 2C | 0 (routed via `HomebaseStorage.snapshot` & `setMany`) |
| **Tier 3: Wallpaper Subsystem** (`gallery-ui`) | Phase 2C | 0 (all 27 calls centralized via adapter & routed) |
| **Tier 3: Browser Integrations** (`firefox-containers`) | Phase 2C | 0 (routed via `HomebaseStorage.set`) |
| **Core Infrastructure & Boot** (`new-tab.js`, `preload.js`, `instant_load.js`, `schema-migrations.js`) | Protected | Retained low-level storage access by architectural design |

---

## 4. Test Strategy & Results

A new dedicated test suite was created:  
`tests/unit/phase2c-storage.test.mjs` (10 tests)

### Test Coverage Breakdown:
1. **Diagnostic UI:**
   - `handleAutoRepairStorage` reads and repairs storage via `HomebaseStorage` with fast-mirror synchronization.
   - `handleAutoRepairStorage` fallback to `browser.storage.local` when `HomebaseStorage` is absent.
   - `getStorageQuotaTelemetry` uses `HomebaseStorage.snapshot` for size estimation.
2. **Wallpaper Subsystem:**
   - `storageLocalGet` routes through `HomebaseStorage.getMany` with schema validation.
   - `storageLocalSet` routes through `HomebaseStorage.setMany` and updates storage.
   - `storageLocalRemove` routes through `HomebaseStorage.remove`.
   - `storageLocal*` fallback to `browser.storage.local` when `HomebaseStorage` is absent.
3. **Firefox Containers Integration:**
   - `appContainerMode` toggle persists via `HomebaseStorage.set`.
   - `appContainerNewTab` radio persists via `HomebaseStorage.set`.
   - Fallback to `browser.storage.local` when `HomebaseStorage` is absent.

### Test Suite Execution Summary (`npm.cmd test`):
- **Stage 1 Syntax Validation (`node --check`):** PASS (2.23s) across all 41 source scripts and unit tests.
- **Stage 2 Static Invariants (`check-newtab-static.mjs`):** PASS (0.18s) — all 41 deferred scripts and 87 declarations intact.
- **Stage 3 Unit Tests (`node:test`):** PASS (2.65s) — **178/178 tests passing** (up from 168 in Phase 2B, +10 new Phase 2C tests).
- **Stage 4 Browser Smoke Test:** PASS (0.06s).

---

## 5. Invariant Verification

| Invariant | Status | Verification Detail |
| :--- | :---: | :--- |
| `src/new-tab.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `src/preload.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `src/instant_load.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `src/newtab/core/schema-migrations.js` unmodified | **PASSED** | Untouched, `git diff` shows 0 changes. |
| `manifests/*` unmodified | **PASSED** | Chrome and Firefox manifests intact. |
| `dist/*` not staged | **PASSED** | Dual-browser build verified clean (`dist/chrome` and `dist/firefox`). |
| Minimal mutation in auto-repair | **PASSED** | Verified: unchanged and unknown keys are never touched. |
| Privacy invariant preserved | **PASSED** | Aggregate-only telemetry confirmed, zero PII logged or exported. |
| No ES modules / bundlers | **PASSED** | All scripts remain classic defer scripts. |

---

## 6. Pre-Commit Summary

- **Modified Files (3):**
  - `src/newtab/settings/diagnostic-ui.js`
  - `src/newtab/wallpaper/gallery-ui.js`
  - `src/newtab/integrations/firefox-containers.js`
- **New Files (2):**
  - `docs/45-cycle8-phase2C-implementation-report.md`
  - `tests/unit/phase2c-storage.test.mjs`
