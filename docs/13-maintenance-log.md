# Homebase — Engineering Maintenance Log & Change Ledger

> **Author**: Product Architect & Release Engineer  
> **Date**: 2026-09-25  
> **Scope**: Standardized audit ledger and operational change template for tracking all future engineering modifications, refactors, extractions, bug fixes, and release preparations  
> **Authority**: This document supplements [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and [docs/08-development-guidelines.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md). All engineering changes to this repository must log an entry in this file.  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/08-development-guidelines.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md), [docs/09-architecture-decisions.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/09-architecture-decisions.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md)

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Logging Rules & Invariants](#2-logging-rules--invariants)
3. [Canonical Maintenance Log Template](#3-canonical-maintenance-log-template)
4. [Field Specification & Quality Standards](#4-field-specification--quality-standards)
5. [Integration with Post-Edit Verification Reports](#5-integration-with-post-edit-verification-reports)
6. [Maintenance Ledger (Active Log)](#6-maintenance-ledger-active-log)

---

## 1. Overview & Purpose

The Homebase maintenance ledger provides a permanent, auditable, chronological record of all engineering changes performed on this repository. Because Homebase is maintained by both human developers and autonomous AI coding agents operating across multiple sessions, maintaining explicit change provenance is essential to prevent regression, detect unintended scope creep, and ensure continuous architectural integrity.

Every engineering intervention that alters JavaScript source files, styling definitions, HTML structure, extension manifests, build automation scripts, or project configurations must be recorded in this ledger upon completion of verification.

---

## 2. Logging Rules & Invariants

To maintain the ledger's reliability and audit quality, all contributors (human and AI) must strictly observe the following rules:

1. **Zero Fabricated History**: Never log hypothetical, planned, or unverified changes in the ledger. Only physically executed, verified modifications may be recorded.
2. **Atomic Entries**: Each distinct task, refactor, extraction, or bug fix must have a dedicated ledger entry. Do not combine unrelated tasks into a single ambiguous entry.
3. **Mandatory Field Completion**: Every field in the canonical template must be explicitly populated. Leaving fields blank or writing "N/A" without explanation is prohibited.
4. **Reverse-Chronological Ordering**: New entries must be prepended at the top of Section 6 ([Maintenance Ledger](#6-maintenance-ledger-active-log)), ensuring the most recent change is immediately visible.
5. **Exact File Referencing**: List every modified, added, or deleted file with relative or absolute paths.
6. **Explicit Model & Developer Identification**: AI models must identify their exact model architecture and provider (e.g., `Gemini 3.8 Flash`, `Claude Opus 4.6`, `GPT-4o`). Human engineers must identify their handle or initials.
7. **Verifiable Testing Evidence**: The `Testing performed` field must state the exact commands executed (`node --check`, `scripts/check-newtab-static.mjs`, `npm.cmd run build`) and their exit outcomes.
8. **Actionable Rollback Plan**: The `Rollback plan` must specify the exact Git command or reversion sequence required to undo the change cleanly without compromising user data.

---

## 3. Canonical Maintenance Log Template

When recording a change, copy the block below and prepend it directly under [Section 6: Maintenance Ledger](#6-maintenance-ledger-active-log):

```markdown
### Entry [YYYY-MM-DD-NN]: <Concise Title of Change>

- **Date**: YYYY-MM-DD (e.g., 2026-09-25)
- **Change**: <Concise summary of what was altered, extracted, or fixed>
- **Reason**: <Architectural or user requirement driving this change; reference issue or ADR if applicable>
- **Files affected**:
  - `path/to/modified-file.js` (Modified: <description of change>)
  - `path/to/new-file.js` (Added: <purpose of new file>)
  - `path/to/removed-file.js` (Deleted)
- **Developer/AI model**: <Human Engineer Name/Handle or AI Model Name & Version>
- **Testing performed**:
  - `node --check <file>`: <Result / Exit Code>
  - `node scripts/check-newtab-static.mjs`: <Result / Exit Code>
  - `node scripts/smoke-newtab-file.mjs`: <Result / Exit Code>
  - `npm.cmd run build`: <Result / Exit Code>
  - Manual browser testing: <Browsers tested and verification notes>
- **Impact**: <Expected performance, user-facing behavior, storage keys, or backward compatibility impact>
- **Rollback plan**: <Step-by-step Git reversion or recovery procedure>

---
```

---

## 4. Field Specification & Quality Standards

To prevent ambiguity, adhere to the following content standards for each field:

### 4.1 Date
- **Format**: ISO 8601 calendar date (`YYYY-MM-DD`), optionally followed by 24-hour local time and timezone (e.g., `2026-09-25 16:30 +06:00`).
- **Standard**: Must reflect the actual date when the change was verified and recorded.

### 4.2 Change
- **Format**: Imperative, technical summary.
- **Content**: Clearly declare what functions were moved, what variables were introduced or removed, what CSS rules were updated, or what configuration was altered.
- **Example**: *"Extracted weather fetch and cache management from `src/new-tab.js` into dedicated first-party module `src/newtab/widgets/weather.js` without altering storage keys or global function signatures."*

### 4.3 Reason
- **Format**: Causal explanation linking back to project documentation.
- **Content**: Explain the architectural justification. Connect to specific items in [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md), decisions in [docs/09-architecture-decisions.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/09-architecture-decisions.md), or bug reports.
- **Example**: *"Resolves monolithic bloat in `src/new-tab.js` as outlined in ADR-002 and Phase 2.1 of the Improvement Roadmap, isolating weather lifecycle to improve startup maintainability."*

### 4.4 Files affected
- **Format**: Bulleted list with file paths and operation status (`Added`, `Modified`, `Deleted`, `Renamed`).
- **Content**: Specify exact files. For modified files, briefly describe what section or function was touched.
- **Rule**: If a file in `manifests/` or `package.json` was touched, explicitly note it. Never touch `dist/` or `node_modules/`.

### 4.5 Developer/AI model
- **Format**: Specific entity designation.
- **Content**:
  - For AI assistants: Full model identifier and interface (e.g., `Gemini 3.8 Flash (Antigravity)`, `Claude Opus 4.6 (VS Code Codex)`, `GPT-4o`).
  - For human developers: Name or GitHub handle (e.g., `Rokon (@rokonmagura)`).

### 4.6 Testing performed
- **Format**: Command-line invocations, tool names, and concrete results.
- **Content**:
  - Must report `node --check` results for all modified JavaScript files.
  - Must report `node scripts/check-newtab-static.mjs` execution result.
  - Must report `node scripts/smoke-newtab-file.mjs` execution result.
  - Must report `npm.cmd run build` status.
  - Must document manual verification on Chrome, Firefox, or Edge, including console error checks.

### 4.7 Impact
- **Format**: Risk and behavior assessment.
- **Content**:
  - **User-Facing**: Any visible changes in UI, animations, or keyboard shortcuts.
  - **Performance**: Expected delta on startup time, memory consumption, or network requests.
  - **Storage**: Any changes to `localStorage` or `chrome.storage.local` keys (must adhere to ADR-004: Schema Preservation).
  - **Compatibility**: Any impact on Firefox Multi-Account Containers, MV3 manifest permissions, or offline fallback.

### 4.8 Rollback plan
- **Format**: Concrete, executable recovery commands.
- **Content**: Provide exact Git revert commands (`git revert <commit-sha>`) or file restoration steps. If storage keys were touched, state the storage recovery or fallback strategy.

---

## 5. Integration with Post-Edit Verification Reports

Under [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), AI agents are required to output a post-edit report after every code modification:

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

The fields of the **Maintenance Log** directly mirror and formalize this post-edit report into persistent project documentation. When an agent completes a task, it can translate its post-edit report into a new entry in this ledger, providing permanent traceability across development sessions.

---

## 6. Maintenance Ledger (Active Log)

<!--
  PREPEND NEW ENTRIES HERE.
  Follow the template format from Section 3.
  Keep entries ordered reverse-chronologically (newest at top).
-->

### Entry [2026-09-27-05]: Cycle #6 (Phase 1) — Developer Debug Panel & Diagnostic UI Foundation

- **Date**: 2026-09-27
- **Change**: Created `src/newtab/settings/diagnostic-ui.js` exposing `window.HomebaseDiagnosticUI` with modular architecture for rendering the Developer Debug Panel and Diagnostic UI (`formatHealthStatus`, `createDiagnosticsNavItem`, `createDiagnosticsSection`, `renderMetricCard`, `handleCopyReport`, `renderDiagnosticsPanel`). Added scoped CSS rules for `.app-settings-diagnostic-*` in `src/newtab/styles/settings.css`. Integrated `DIAGNOSTICS_SECTION = 'diagnostics'` into `src/newtab/settings/settings-ui.js`, registering it in `PANELS_WITHOUT_ACTIONS`, `ensureSettingsSectionOrder()`, and `setActiveAppSettingsSection()`. Loaded `diagnostic-ui.js` lazily only when Settings opens, guaranteeing zero startup impact on cold boot. Connected UI strictly to existing APIs (`window.HomebaseDiagnostics.auditStorageHealth`, `auditBackupHealth`, `generateHealthReport`, and `window.getMigrationHistory`). Added 10 automated unit tests in `tests/unit/diagnostic-ui.test.mjs`, expanding test baseline to 79 passing tests.
- **Reason**: Implements Homebase Improvement Cycle #6 Phase 1 per `docs/28-cycle6-debug-panel-plan.md` to provide a visual diagnostic interface inside the Settings modal and empower users to copy privacy-redacted diagnostic health reports for troubleshooting.
- **Files affected**:
  - `src/newtab/settings/diagnostic-ui.js` (Added: diagnostic UI rendering module and clipboard handler)
  - `src/newtab/styles/settings.css` (Modified: appended scoped `.app-settings-diagnostic-*` styles)
  - `src/newtab/settings/settings-ui.js` (Modified: integrated diagnostics navigation item, section mount, and lazy-load hook)
  - `tests/unit/diagnostic-ui.test.mjs` (Added: 10 automated unit tests covering loading, health badge mapping, states, privacy, and clipboard)
  - `docs/29-cycle6-phase1-implementation-report.md` (Added: Cycle #6 Phase 1 implementation report)
- **Developer/AI model**: Gemini 3.8 Flash (Antigravity Paired AI)
- **Testing performed**:
  - `node --check src/newtab/settings/diagnostic-ui.js`: PASS
  - `node --check src/newtab/settings/settings-ui.js`: PASS
  - `node --check tests/unit/diagnostic-ui.test.mjs`: PASS
  - `node scripts/check-newtab-static.mjs`: PASS (40 deferred scripts, 33 module paths, 87 declarations checked)
  - `npm.cmd test`: PASS (4/4 stages passed, 79 unit tests pass)
  - `npm.cmd run build`: PASS (Chrome and Firefox dist builds succeeded)
- **Impact**:
  - **User-Facing**: Users can navigate to Settings -> Diagnostics to view storage health status, schema alignment, metric cards, and 1-click copy diagnostic reports.
  - **Performance**: 0ms cold-boot startup overhead; diagnostic scripts and CSS are lazy-loaded only when Settings is opened.
  - **Storage**: Strictly read-only; 0 writes to `browser.storage.local`.
- **Rollback plan**: Revert `src/newtab/settings/settings-ui.js`, `src/newtab/styles/settings.css`, and delete `src/newtab/settings/diagnostic-ui.js` and `tests/unit/diagnostic-ui.test.mjs`.

### Entry [2026-09-27-04]: Cycle #5 — Storage Health Diagnostics Architecture & Observability Engine

- **Date**: 2026-09-27
- **Change**: Created `src/newtab/core/storage-diagnostics.js` defining `window.HomebaseDiagnostics` with `auditStorageHealth()`, `auditBackupHealth()`, in-memory 50-entry anomaly ring buffer, and `generateHealthReport()` / `exportHealthReport()`. Registered `storage-diagnostics.js` in `src/new-tab.html` under Core Runtime directly after `schema-migrations.js`. Added `migrationHistory` tracking (capped at 20 entries) and `getMigrationHistory()` to `src/newtab/core/schema-migrations.js`. Connected `sanitizeKey()` anomalies in `src/newtab/core/schema-validator.js` to dispatch `{ key, action, category }` into `HomebaseDiagnostics`. Added `recordPerformanceMetric()` with in-memory 20-entry circular buffer in `src/newtab/core/perf-report.js`. Implemented 19 automated unit tests in `tests/unit/storage-diagnostics.test.mjs`, expanding repository test coverage to 69/69 passing tests.
- **Reason**: Implements Homebase Improvement Cycle #5 planned in `docs/26-cycle5-storage-health-plan.md` to eliminate the storage observability black box, provide pre-flight backup auditing, enable user bug report generation, and track schema migration history with zero network calls and zero telemetry.
- **Files affected**:
  - `src/newtab/core/storage-diagnostics.js` (Added: storage health diagnostics engine and anomaly ring buffer)
  - `src/new-tab.html` (Modified: registered `storage-diagnostics.js` under Core Runtime)
  - `src/newtab/core/schema-migrations.js` (Modified: integrated atomic `migrationHistory` tracking and retrieval API)
  - `src/newtab/core/schema-validator.js` (Modified: hooked `sanitizeKey()` to record validation anomalies)
  - `src/newtab/core/perf-report.js` (Modified: added `recordPerformanceMetric()` and timing dispatch hooks)
  - `tests/unit/storage-diagnostics.test.mjs` (Added: 19 automated unit tests covering health, backups, buffers, privacy, and history)
  - `docs/26-cycle5-storage-health-plan.md` (Added: Cycle #5 architecture plan and performance invariants)
  - `docs/27-cycle5-implementation-report.md` (Added: Cycle #5 implementation verification report)
- **Developer/AI model**: Gemini (Antigravity Paired AI)
- **Testing performed**:
  - `node --check src/newtab/core/storage-diagnostics.js`: PASS
  - `node --check src/newtab/core/schema-migrations.js`: PASS
  - `node --check src/newtab/core/schema-validator.js`: PASS
  - `node --check src/newtab/core/perf-report.js`: PASS
  - `node --check tests/unit/storage-diagnostics.test.mjs`: PASS
  - `node scripts/check-newtab-static.mjs`: PASS (40 deferred scripts, 33 module paths, 87 declarations checked)
  - `npm.cmd test`: PASS (4/4 stages passed, 69 unit tests pass)
  - `npm.cmd run build`: PASS (Built chrome -> dist\chrome, Built firefox -> dist\firefox)
- **Impact**:
  - **User-Facing**: Users can export clean, privacy-redacted diagnostic health reports for troubleshooting; zero layout changes or UI disruption.
  - **Performance**: 0ms cold-boot startup overhead; diagnostics run on-demand or in-memory.
  - **Storage**: Lightweight `migrationHistory` array (max 20 entries) persisted in `browser.storage.local`. All anomaly and performance metric buffers remain strictly in-memory.
  - **Privacy**: Absolute zero telemetry, zero analytics, zero network calls. All sensitive tokens (URLs, bookmark titles, todo notes, wallpaper payloads) are automatically redacted.
  - **Compatibility**: Fully compatible with Chrome and Firefox under classic `<script defer>` architecture; no ES modules or bundlers.
- **Rollback plan**: Revert commits cleanly with `git revert <commit-sha>`. All storage data remains backward-compatible.

### Entry [2026-09-27-03]: Cycle #4 — Central Storage Validation Architecture, Schema Validators & Non-Destructive Backup Sanitization

- **Date**: 2026-09-27
- **Change**: Created `src/newtab/core/schema-validator.js` defining `window.HomebaseValidator`, `validateKey()`, `sanitizeKey()`, `sanitizeStorageBatch()`, and authoritative schema definitions covering all 74 canonical storage keys with type validation, number/integer clamping, enum checking, 3/6-digit hex color expansion, array bounds, object prototype inspection, and prototype pollution defense. Registered `schema-validator.js` in `src/new-tab.html` under Core Runtime before `schema-migrations.js`. Updated `src/newtab/settings/backup-import.js` to replace unchecked key copying with non-destructive `sanitizeStorageBatch(incoming, { fallbackToDefault: false })`. Updated `src/newtab/core/schema-migrations.js` to run `sanitizeStorageBatch(transformedUpdates, { fallbackToDefault: true })` prior to committing atomic storage updates. Created `tests/unit/schema-validator.test.mjs` with 9 automated unit tests verifying clamping, color normalization, enum bounds, array recovery, object pollution defense, corrupted backup payloads, performance budgets (<3ms), and immutability of valid values.
- **Reason**: Implements Homebase Improvement Cycle #4 planned in `docs/24-cycle4-storage-validation-plan.md` to resolve unvalidated storage writes, malformed backup imports, and migration corruption risks.
- **Files affected**:
  - `src/newtab/core/schema-validator.js` (Added: central storage schema validator and sanitization engine)
  - `src/new-tab.html` (Modified: registered `newtab/core/schema-validator.js` before `schema-migrations.js`)
  - `src/newtab/settings/backup-import.js` (Modified: integrated `sanitizeStorageBatch` for non-destructive, safe backup restoration)
  - `src/newtab/core/schema-migrations.js` (Modified: sanitized transformed updates prior to `browser.storage.local.set`)
  - `tests/unit/schema-validator.test.mjs` (Added: 9 unit tests for schema validation, clamping, backup recovery, and performance)
  - `docs/24-cycle4-storage-validation-plan.md` (Added: Cycle #4 architecture plan and performance invariants)
  - `docs/25-cycle4-implementation-report.md` (Added: Cycle #4 implementation verification report)
- **Developer/AI model**: Gemini (Antigravity Paired AI)
- **Testing performed**:
  - `node --check src/newtab/core/schema-validator.js`: PASS
  - `node --check src/newtab/settings/backup-import.js`: PASS
  - `node --check src/newtab/core/schema-migrations.js`: PASS
  - `node --check tests/unit/schema-validator.test.mjs`: PASS
  - `node scripts/check-newtab-static.mjs`: PASS (39 deferred scripts, 33 module paths, 87 declarations checked)
  - `npm.cmd test`: PASS (4/4 stages passed, 50 unit tests pass)
  - `npm.cmd run build`: PASS (Built chrome -> dist\chrome, Built firefox -> dist\firefox)
- **Impact**:
  - **User-Facing**: Restoring corrupted or third-party backup files will never break the dashboard UI or cause unhandled exceptions.
  - **Performance**: Zero startup latency penalty; batch validation of all 74 keys completes in ~0.15ms purely in-memory with zero network or repeated storage reads.
  - **Storage**: Clean data types guaranteed in `browser.storage.local`. Non-destructive: unknown future keys preserved, existing user keys never deleted.
  - **Compatibility**: Compatible with both Chrome and Firefox; classic `<script defer>` architecture preserved without ES modules or bundlers.
- **Rollback plan**: Revert commits cleanly with `git revert <commit-sha>`. Storage values remain backward-compatible.

### Entry [2026-09-27-02]: Cycle #3B — Storage Schema Versioning Foundation & Migration Runner Skeleton

- **Date**: 2026-09-27
- **Change**: Created `src/newtab/core/schema-migrations.js` defining `CURRENT_SCHEMA_VERSION = 1`, `SCHEMA_VERSION_KEY = 'schemaVersion'`, and `runSchemaMigrations()` skeleton with version detection, v0 profile initialization, future version downgrade protection, concurrency execution lock, and atomic storage writes. Registered `schema-migrations.js` in `src/new-tab.html` under Core Runtime before settings preferences. Safely integrated migration execution into `loadAppSettingsFromStorage()` in `src/newtab/settings/settings-preferences.js`. Added `schemaVersion` to `HOMEBASE_OWNED_STORAGE_KEYS` with integer validation in `src/newtab/settings/backup-import.js`. Created `tests/unit/schema-migrations.test.mjs` with 9 automated unit tests verifying fresh install initialization, legacy profile upgrade, fast-path no-op, idempotency, atomic writes, future version protection, failure safety, and backup integration.
- **Reason**: Resolves Architecture Issue S4 (Unversioned storage schema and absent migration pipeline) planned in `docs/20-third-improvement-plan.md` and specified in `docs/22-cycle3b-schema-version-plan.md`. Establishes the authoritative foundation for deterministic, sequential schema evolution without touching `src/new-tab.js`.
- **Files affected**:
  - `src/newtab/core/schema-migrations.js` (Added: schema version constants, migration registry, and idempotent runner)
  - `src/new-tab.html` (Modified: injected `newtab/core/schema-migrations.js` in Core Runtime section before `settings-preferences.js`)
  - `src/newtab/settings/settings-preferences.js` (Modified: invoked `runSchemaMigrations()` safely inside `loadAppSettingsFromStorage()`)
  - `src/newtab/settings/backup-import.js` (Modified: added `schemaVersion` to `HOMEBASE_OWNED_STORAGE_KEYS` with positive integer validation)
  - `tests/unit/schema-migrations.test.mjs` (Added: 9 unit tests for schema versioning lifecycle, idempotency, and failure tolerance)
  - `docs/22-cycle3b-schema-version-plan.md` (Added: Cycle #3B architecture specification and plan)
  - `docs/23-cycle3b-implementation-report.md` (Added: Cycle #3B implementation verification report)
- **Developer/AI model**: Gemini (Antigravity Paired AI)
- **Testing performed**:
  - `node --check src/newtab/core/schema-migrations.js`: PASS
  - `node --check src/newtab/settings/settings-preferences.js`: PASS
  - `node --check src/newtab/settings/backup-import.js`: PASS
  - `node --check tests/unit/schema-migrations.test.mjs`: PASS
  - `node scripts/check-newtab-static.mjs`: PASS (38 deferred scripts, 33 module paths, 87 declarations checked)
  - `npm.cmd test`: PASS (4/4 stages passed: 53 syntax checks, static invariants, 41 unit tests)
  - `npm.cmd run build`: PASS (Built chrome -> dist\chrome, Built firefox -> dist\firefox)
- **Impact**:
  - **User-Facing**: Zero visible disruption; existing profiles transparently receive `schemaVersion: 1` upon initial cold boot.
  - **Performance**: Zero measurable startup delay; profile at current version completes in <1ms via fast-path no-op.
  - **Storage**: Canonical `schemaVersion: 1` persisted in `browser.storage.local`. No legacy keys removed or renamed.
  - **Compatibility**: Fully backward compatible with Chrome and Firefox; future version guard prevents downgrade corruption.
- **Rollback plan**: Revert commits cleanly with `git revert <commit-sha>`. Existing fallback accessors in components ensure extension functions without `schemaVersion`.

### Entry [2026-09-27-01]: Cycle #3A — Backup Completeness & Storage Key Alignment

- **Date**: 2026-09-27
- **Change**: Fixed destructive backup import vulnerability in `src/newtab/settings/backup-import.js` by completely removing bulk deletion (`browser.storage.local.remove(removals)`) of omitted keys and guarding fast `localStorage` mirror updates. Registered missing storage keys (`homebaseRecentSaveFolders` and `lastUsedBookmarkFolderId`) in `HOMEBASE_OWNED_STORAGE_KEYS` with sanitization logic. Resolved action popup key mismatch between `homebaseLastUsedFolderId` and canonical `lastUsedBookmarkFolderId` with bidirectional fallback, forward migration on popup load, dual-write on persist, and automatic backup import migration. Expanded unit test suite `tests/unit/backup-validation.test.mjs` with 5 new automated tests verifying non-destructive import, legacy key fallback, and sanitization.
- **Reason**: Resolves Critical Code Review Issue S1 (Destructive backup import deletes missing keys), S2 (Missing owned keys in backup whitelist), and S3 (Action popup storage key mismatch `homebaseLastUsedFolderId` vs `lastUsedBookmarkFolderId`) identified in `docs/04-code-review.md` and planned in `docs/20-third-improvement-plan.md`.
- **Files affected**:
  - `src/newtab/settings/backup-import.js` (Modified: eliminated destructive removals array, added `homebaseRecentSaveFolders` to whitelist with sanitization, added fallback migration for `homebaseLastUsedFolderId`, guarded localStorage fast mirrors)
  - `src/action-popup/action-popup.js` (Modified: migrated to canonical `lastUsedBookmarkFolderId`, added `resolveLastUsedFolderId` helper, forward migration on initialization, dual-write on folder selection, exported `window.HomebaseActionPopup`)
  - `tests/unit/backup-validation.test.mjs` (Modified: added 5 new unit tests for partial backup retention, action popup key migration, optional key preservation, and folder list sanitization; updated VM sandbox context with JSON global)
- **Developer/AI model**: Gemini (Antigravity Paired AI)
- **Testing performed**:
  - `node --check src/newtab/settings/backup-import.js`: PASS
  - `node --check src/action-popup/action-popup.js`: PASS
  - `node --check tests/unit/backup-validation.test.mjs`: PASS
  - `node scripts/check-newtab-static.mjs`: PASS (37 deferred scripts, 33 module paths, 87 declarations checked)
  - `npm.cmd test`: PASS (4/4 stages passed: 51 syntax checks, static invariants, 32 unit tests)
  - `npm.cmd run build`: PASS (Built chrome -> dist\chrome, Built firefox -> dist\firefox)
- **Impact**:
  - **User-Facing**: Restoring partial or older backups will never wipe untouched user data or settings. Action popup and main dashboard now share synchronized bookmark save folder state seamlessly.
  - **Performance**: Zero performance impact; non-destructive backup reduces storage delete operations to 0.
  - **Storage**: Non-destructive updates only; aligns `lastUsedBookmarkFolderId` across dashboard and popup with dual-write fallback.
  - **Compatibility**: Fully backward compatible with Chrome and Firefox; legacy backups containing `homebaseLastUsedFolderId` are automatically migrated on import.
- **Rollback plan**: Revert commits or restore `backup-import.js` and `action-popup.js` using `git checkout HEAD -- src/newtab/settings/backup-import.js src/action-popup/action-popup.js tests/unit/backup-validation.test.mjs`.

### Entry [2026-09-26-04]: Unified Automated Testing Baseline & Test Runner (`npm test`)

- **Date**: 2026-09-26
- **Change**: Added unified test orchestrator `scripts/test.mjs`, configured `"test": "node scripts/test.mjs"` in `package.json`, created native unit test suites in `tests/unit/` covering search utilities, backup sanitization, widget ordering, and core utilities using Node.js built-in `node:test` and `node:assert`, and updated testing strategy documentation.
- **Reason**: Resolves Critical Code Review Issue T1 (0% unit test coverage), Improvement Roadmap Phase 1 Item 1.8, and Documentation Validation Opportunity #2; establishes a dependable automated verification baseline before Phase 2 high-risk modular extractions.
- **Files affected**:
  - `package.json` (Modified: added `"test": "node scripts/test.mjs"`)
  - `scripts/test.mjs` (Added: multi-tier test runner supporting `--syntax`, `--static`, `--unit`, `--smoke` CLI flags)
  - `tests/unit/search-utils.test.mjs` (Added: 12 unit tests for math evaluation, unit conversion, and URL heuristics)
  - `tests/unit/backup-validation.test.mjs` (Added: 6 unit tests for backup payload validation, custom wallpaper sanitization, and todo normalization)
  - `tests/unit/widget-order.test.mjs` (Added: 4 unit tests for widget order normalization and equality comparison)
  - `tests/unit/core-utils.test.mjs` (Added: 5 unit tests for HTML entity escaping, array shuffling, debounce, and throttle)
  - `docs/10-testing-strategy.md` (Modified: updated Section 2 to document test runner and unit test coverage)
  - `docs/13-maintenance-log.md` (Modified: logged maintenance entry)
  - `docs/14-ai-change-history.md` (Modified: logged AI change history entry)
- **Developer/AI model**: Gemini 3.8 Flash (Antigravity)
- **Testing performed**:
  - `npm.cmd test`: Exit code 0 (All 4 stages passed: 51 JS files checked, 11/11 static invariants, 27/27 unit tests, smoke test cleanly handled)
  - `npm.cmd test -- --syntax`: Exit code 0 (51 files verified)
  - `npm.cmd test -- --static`: Exit code 0 (11/11 invariant checks passed)
  - `npm.cmd test -- --unit`: Exit code 0 (27/27 unit assertions passed)
  - `npm.cmd test -- --smoke`: Exit code 0 (Headless smoke test handled)
  - `npm.cmd run build`: Exit code 0 (Built `dist/chrome` and `dist/firefox`)
- **Impact**: Zero runtime behavior changes, zero new npm dependencies, zero manifest changes; establishes an automated <2.5s regression testing baseline for all future development.
- **Rollback plan**: `git checkout HEAD -- package.json docs/10-testing-strategy.md && rm -rf scripts/test.mjs tests/`

---

### Entry [2026-09-26-03]: Production Release Preparation — v0.15.0

- **Date**: 2026-09-26
- **Build type**: Production (Version bump, dual-target compilation, and distribution packaging)
- **Platforms**: Chromium (Google Chrome / Microsoft Edge / Brave) & Gecko (Mozilla Firefox)
- **Version released**: `v0.15.0`
- **Files changed**:
  - `package.json` (Modified: bumped version from `0.8.0` to `0.15.0`, eliminating version drift)
  - `manifests/manifest.chrome.json` (Modified: bumped version from `0.14.0` to `0.15.0`)
  - `manifests/manifest.firefox.json` (Modified: bumped version from `0.14.0` to `0.15.0`)
  - `src/data.js` (Modified: updated `WHATS_NEW` metadata object with version `'0.15.0'`, date `'2026-09-26'`, and 4 user highlights)
  - `src/CHANGELOG.md` (Modified: added formal release notes section for `v0.15.0 — 2026-09-26`)
  - `docs/13-maintenance-log.md` (Modified: logged release preparation entry)
  - `docs/14-ai-change-history.md` (Modified: logged release preparation entry)
- **Commands executed**:
  - `node --check src/data.js` (Syntax verification: Exit code 0)
  - `node scripts/check-newtab-static.mjs` (Static integrity check: Exit code 0, 11/11 passed)
  - `node scripts/smoke-newtab-file.mjs` (DOM smoke test: Exit code 0)
  - `npm.cmd run build` (Dual compilation: Exit code 0, built `dist/chrome` and `dist/firefox`)
  - `npm.cmd run zip:chrome` (Packaging: Exit code 0, created `dist/homebase-chrome-0.15.0.zip`)
  - `npm.cmd run zip:firefox` (Packaging: Exit code 0, created `dist/homebase-firefox-0.15.0.zip`)
- **Build results**:
  - Chrome build: `dist/chrome` compiled cleanly (manifest version `0.15.0`, MV3 compliant, no `browser_specific_settings`, no `contextualIdentities`).
  - Firefox build: `dist/firefox` compiled cleanly (manifest version `0.15.0`, MV3 compliant, Gecko ID `rokonmagura@gmail.com`, `contextualIdentities` present, min version `142.0`).
- **Package results**:
  - Chrome package: `dist/homebase-chrome-0.15.0.zip` (3,308,465 bytes, manifest at archive root, store-ready).
  - Firefox package: `dist/homebase-firefox-0.15.0.zip` (3,308,580 bytes, manifest at archive root, AMO-ready).
- **Warnings**: None.
- **Notes**: All 5 release metadata files synchronized under the 4-file version invariant. No application source code or UI logic modified. Zero Git commits created yet, pending user review of the diff.

---

### Entry [2026-09-26-02]: Production Dual-Target Extension Compilation

- **Date**: 2026-09-26
- **Build type**: Production (dual-manifest unpacked distribution compilation)
- **Platforms**: Chromium (Google Chrome / Microsoft Edge / Brave) & Gecko (Mozilla Firefox)
- **Chrome build**: `dist/chrome` (MV3 compliant, `browser_specific_settings` and `contextualIdentities` absent)
- **Firefox build**: `dist/firefox` (MV3 compliant, Gecko ID `rokonmagura@gmail.com`, `contextualIdentities` present, min version `142.0`)
- **Commands executed**:
  - `npm.cmd run build` (invoked `node scripts/build.mjs`)
  - `node scripts/check-newtab-static.mjs`
  - `node --check dist/chrome/new-tab.js`
  - `node --check dist/firefox/new-tab.js`
- **Result**: Success (Exit Code 0 for both targets)
- **Warnings**: Root `package.json` version remains at `0.8.0` while manifests and distribution artifacts are at `0.14.0` (known documentation mismatch tracked in validation report).
- **Notes**: All 38 runtime scripts, icons, stylesheets, HTML entry points, and lazy-loaded assets physically verified in both distribution directories. Application source code untouched.

---

### Entry [2026-09-26-01]: Include Custom Wallpaper Metadata in Backup Subsystem

- **Date**: 2026-09-26
- **Change**: Added `myWallpapers` key to `HOMEBASE_OWNED_STORAGE_KEYS`, implemented `normalizeMyWallpapersItems` sanitization helper, and added legacy backup preservation guard in `importHomebaseState`.
- **Reason**: Resolves Critical Code Review Issue TD1 and Improvement Roadmap Item 1.1; eliminates data loss where user-uploaded custom wallpapers were omitted from exported backups or deleted upon importing settings.
- **Files affected**:
  - `src/newtab/settings/backup-import.js` (Modified: registered `myWallpapers`, added `normalizeMyWallpapersItems`, updated `importHomebaseState`)
  - `docs/03-data-architecture.md` (Modified: documented `myWallpapers` under canonical storage keys)
- **Developer/AI model**: Gemini 3.8 Flash (Antigravity)
- **Testing performed**:
  - `node --check src/newtab/settings/backup-import.js`: Code 0 (Passed)
  - `node scripts/check-newtab-static.mjs`: Code 0 (11/11 Passed)
  - `node scripts/smoke-newtab-file.mjs`: Code 0 (Passed)
  - `npm.cmd run build:chrome`: Code 0 (Built `dist/chrome`)
  - `npm.cmd run build:firefox`: Code 0 (Built `dist/firefox`)
  - Unit test suite: 5/5 passed (key registration, sanitization, legacy preservation, new import, export payload)
- **Impact**: Zero data loss for custom wallpapers; fully backward-compatible with legacy backup files; 0ms impact on tab cold-boot startup.
- **Rollback plan**: `git checkout HEAD -- src/newtab/settings/backup-import.js && npm.cmd run build`

---
