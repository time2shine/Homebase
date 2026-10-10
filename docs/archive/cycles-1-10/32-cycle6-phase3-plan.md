# Homebase Improvement Cycle #6 — Phase 3 Architecture & Implementation Plan
## Advanced Diagnostics: Subsystem Health Matrix, Storage Auto-Remediation & Developer Ergonomics

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-27  
> **Cycle ID**: Homebase Improvement Cycle #6 — Phase 3  
> **Target Release**: Homebase v0.15.6  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/28-cycle6-debug-panel-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/28-cycle6-debug-panel-plan.md), [docs/29-cycle6-phase1-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/29-cycle6-phase1-implementation-report.md), [docs/30-cycle6-phase2-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/30-cycle6-phase2-plan.md), [docs/31-cycle6-phase2-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/31-cycle6-phase2-implementation-report.md)  
> **Status**: Approved Architecture Plan — **DO NOT MODIFY SOURCE CODE DURING PLANNING**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis (Post-Phase 2 Baseline)](#2-current-state-analysis-post-phase-2-baseline)
3. [Problem Statement & Remaining Gaps](#3-problem-statement--remaining-gaps)
4. [Proposed Phase 3 Architecture](#4-proposed-phase-3-architecture)
   - [4.1 Subsystem Health Matrix & Key Breakdown Accordion](#41-subsystem-health-matrix--key-breakdown-accordion)
   - [4.2 Storage Quota & Memory Footprint Telemetry](#42-storage-quota--memory-footprint-telemetry)
   - [4.3 Non-Destructive Storage Auto-Remediation ("Auto-Repair")](#43-non-destructive-storage-auto-remediation-auto-repair)
   - [4.4 Resilient Diagnostic Export (JSON File Download)](#44-resilient-diagnostic-export-json-file-download)
   - [4.5 Developer HUD Ergonomics (Collapsible Minimized State)](#45-developer-hud-ergonomics-collapsible-minimized-state)
5. [Files to Modify & Files to Create](#5-files-to-modify--files-to-create)
6. [Invariants & Protected Boundaries](#6-invariants--protected-boundaries)
7. [Comprehensive Risk Assessment](#7-comprehensive-risk-assessment)
8. [Testing Strategy & Test Plan](#8-testing-strategy--test-plan)
9. [Rollback Plan](#9-rollback-plan)
10. [Strict Implementation Prompt for Codex](#10-strict-implementation-prompt-for-codex)

---

## 1. Executive Summary

With the successful completion of **Improvement Cycle #6 Phase 1** (UI foundation & lazy-load bridge) and **Phase 2** (live refresh caching, safe DOM construction, HUD integration, and feedback bridge), Homebase has established robust, real-time diagnostic reporting across both Chrome and Firefox.

**Phase 3** represents the final, crowning phase of Cycle #6. It transitions the diagnostic suite from a **passive status readout** into an **active developer and support power tool**:
1. **Granular Subsystem Categorization**: Categorizes storage health into distinct operational domains (System, Bookmarks, Wallpapers, Widgets, Search).
2. **Safe Storage Auto-Remediation**: Provides a one-click, non-destructive repair action to normalize degraded or out-of-bounds keys using `HomebaseValidator.sanitizeStorageBatch()`.
3. **Storage Quota & Footprint Telemetry**: Displays exact byte utilization against browser quotas with zero performance penalty.
4. **Resilient Export**: Adds a JSON file download option alongside clipboard copy for restricted environments.
5. **HUD Ergonomics**: Introduces a collapsible/minimized viewport mode for `#perf-debug-overlay` so developers can keep the HUD active without obscuring the new-tab UI.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #6 PHASE 3 CAPABILITIES                             │
├─────────────────────────┬─────────────────────────┬────────────────────────────────────┤
│ SUBSYSTEM HEALTH MATRIX │ STORAGE AUTO-REMEDIATION│ STORAGE QUOTA TELEMETRY            │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ Granular domain audits  │ Non-destructive repair  │ Real-time storage footprint        │
│ for System, Bookmarks,  │ of degraded/corrupted   │ calculation (bytes & quota %)      │
│ Wallpapers, Widgets     │ keys via validator      │ without blocking render loop       │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ RESILIENT FILE EXPORT   │ HUD MINIMIZE CONTROLS   │ ZERO DEPENDENCY INVARIANT          │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ Downloadable JSON report│ 1-Click compact badge   │ Classic <script defer> preserved;  │
│ for clipboard-restricted│ mode for floating       │ 0 npm packages, 0 bundlers,        │
│ environments            │ viewport overlay        │ 100% Chrome/Firefox compatible     │
└─────────────────────────┴─────────────────────────┴────────────────────────────────────┘
```

---

## 2. Current State Analysis (Post-Phase 2 Baseline)

The repository baseline at commit `545a2e7` provides:
- **`src/newtab/settings/diagnostic-ui.js`**: Lazy-loaded module with 10s TTL cache, in-flight promise de-duplication, safe DOM construction (0% innerHTML interpolation), status badge rendering, and clipboard copy action.
- **`src/newtab/core/perf-report.js`**: Monospace `#perf-debug-overlay` with real-time Storage Health and Recent Metrics readouts, executing with strictly 0 disk I/O on render ticks.
- **`src/newtab/settings/settings-ui.js`**: "Copy Diagnostic Report" secondary action button mounted inside Settings -> Feedback "Report Bug" card.
- **`tests/unit/diagnostic-ui.test.mjs`**: 16 unit tests verifying module loading, badge mappings, healthy/degraded/corrupted states, privacy redaction, clipboard fallback, TTL caching, de-duplication, force refresh, XSS defense, HUD formatting, and feedback bridge.
- **Automated Test Baseline**: **85/85 tests passing (100%)** across all 4 stages of `npm.cmd test`.

---

## 3. Problem Statement & Remaining Gaps

Despite the robust foundation established in Phases 1 & 2, four key operational gaps remain:

1. **Lack of Subsystem Granularity**:
   - When the audit flags `DEGRADED` (e.g., 3 recoverable keys) or `CORRUPTED`, the UI only shows flat numerical metrics (`Total: 74, Valid: 71, Recoverable: 3`).
   - The user or developer cannot see *which subsystem* (Bookmarks, Weather, Clock, Search, Wallpaper) contains the unaligned keys without manually parsing console logs.
2. **No In-UI Remediation (Remediation Dead-End)**:
   - If schema anomalies or corrupted keys are detected, the user's only recourse is either manual backup export/import or full extension reinstallation.
   - The extension already possesses `window.HomebaseValidator.sanitizeStorageBatch()`, but lacks a safe, user-triggered UI action to execute non-destructive self-healing.
3. **Clipboard Export Single Point of Failure**:
   - In environments with strict browser clipboard policies, sandboxed iframes, or headless browser test harnesses, `navigator.clipboard.writeText()` may be denied.
   - A direct, browser-native file download (`Homebase-Diagnostics-Report.json`) provides a fail-safe secondary export mechanism.
4. **Storage Quota Blindspot**:
   - Neither the Diagnostics panel nor the HUD overlay displays how close the extension is to `browser.storage.local` quota limits (typically 5 MB or 10 MB depending on browser/manifest).
   - Profiles with large numbers of bookmarks or custom metadata can hit quota limits unexpectedly.
5. **HUD Viewport Intrusion**:
   - The floating `#perf-debug-overlay` occupies a significant portion of the lower-right viewport (up to 520px wide and 18 lines tall). When testing widgets, bookmarks, or wallpaper layouts, developers must repeatedly toggle it off in Settings rather than temporarily minimizing it.

---

## 4. Proposed Phase 3 Architecture

### 4.1 Subsystem Health Matrix & Key Breakdown Accordion

#### Subsystem Categorization Model
The 74 canonical keys registered in `src/newtab/core/schema-validator.js` map naturally into five distinct functional domains:

```javascript
const SUBSYSTEM_CATEGORIES = {
  system: {
    label: 'System & Core',
    keys: ['schemaVersion', 'migrationHistory', 'appPerformanceMode', 'appBackgroundDim', 'dockPinned']
  },
  bookmarks: {
    label: 'Bookmarks & Grid',
    keys: ['bookmarksTree', 'bookmarksSelectedFolder', 'bookmarkColorThemes', 'customFolderIcons', 'customFolderSort']
  },
  wallpapers: {
    label: 'Wallpapers & Media',
    keys: ['selectedWallpaper', 'wallpaperDailyCycle', 'myWallpapers', 'customWallpaperOrder', 'wallpaperFilter']
  },
  widgets: {
    label: 'Widgets & Dock',
    keys: ['widgetOrder', 'weatherSettings', 'quoteSettings', 'todoItems', 'newsSettings', 'clockType']
  },
  search: {
    label: 'Search Panel',
    keys: ['searchEngine', 'customSearchEngines', 'appSearchMath', 'appSearchSuggestions', 'appSearchHistory']
  }
};
```

#### UI Representation
In `src/newtab/settings/diagnostic-ui.js`, add a **Subsystem Health Matrix**:
- Rendered as a compact grid of 5 status cards/chips.
- Each chip displays the domain name and a mini badge: `Healthy` (green) or `Attention` (amber/red).
- Clicking a chip or an "Inspect Key Details" accordion expands a collapsible list showing the exact key names and their validation status, with zero personal values exposed.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUBSYSTEM HEALTH MATRIX                                   │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────────────────┤
│ SYSTEM       │ BOOKMARKS    │ WALLPAPERS   │ WIDGETS      │ SEARCH                     │
│ [ Healthy ]  │ [ Healthy ]  │ [ Healthy ]  │ [ 1 Warning] │ [ Healthy ]                │
│ 5/5 valid    │ 12/12 valid  │ 8/8 valid    │ 24/25 valid  │ 6/6 valid                  │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────────────────────┘
```

---

### 4.2 Storage Quota & Memory Footprint Telemetry

#### Storage Quota Calculation
Implement a non-blocking storage quota check:
- If `browser.storage.local.getBytesInUse` is available (supported in Chrome MV3 and Firefox 115+), query it asynchronously.
- If unavailable, fall back to calculating serialized byte lengths of all stored keys (`JSON.stringify(val).length * 2`).
- Report byte footprint and percentage against the standard 5 MB quota boundary:
  ```text
  Storage Quota: 124.5 KB / 5.0 MB (2.4% allocated)
  ```
- Embed this metric into the 4-column metric grid as a 5th card or inside the Status Banner.

### Privacy Constraint

Quota diagnostics expose only aggregate storage usage.

Forbidden:
- individual key sizes
- bookmark metadata
- wallpaper names/files
- todo contents
- search history

Allowed:
- total bytes used
- quota limit
- percentage utilization

---

### 4.3 Non-Destructive Storage Auto-Remediation ("Auto-Repair")

#### Remediation Protocol
When `audit.status` is `'DEGRADED'` or `'CORRUPTED'` (or upon explicit user request):
1. **User Confirmation**: Display a confirmation modal (`window.showCustomDialog` or native confirm) explaining that Homebase will normalize out-of-bounds numbers, clean invalid hex colors, and restore missing schema version markers without deleting bookmarks or settings.
2. **Execution**:
   - Read all raw storage items via `browser.storage.local.get(null)`.
   - Pass the batch through `window.HomebaseValidator.sanitizeStorageBatch(raw, { fallbackToDefault: false })`.
   - Write sanitized updates back to `browser.storage.local.set(cleanUpdates)`.
   - Record a remediation event into `migrationHistory` or the anomaly ring buffer.
   - Force-refresh the diagnostic panel (`forceRefresh = true`).
3. **Safety Guarantee**:
   - Non-destructive: Existing bookmark URLs, titles, custom wallpapers, and unrecognized third-party keys are strictly preserved.
   - Atomic: All updates are committed in a single `.set()` call.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              STORAGE AUTO-REPAIR FLOW                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  1. Audit flags status: DEGRADED (e.g. 2 recoverable keys)                            │
│     │                                                                                  │
│     ▼                                                                                  │
│  2. UI displays secondary action button: [ Auto-Repair Storage ]                       │
│     │                                                                                  │
│     ▼                                                                                  │
│  3. User clicks -> Confirmation dialog displays scope of repair                        │
│     │                                                                                  │
│     ▼                                                                                  │
│  4. HomebaseValidator.sanitizeStorageBatch() normalizes values in-memory               │
│     │                                                                                  │
│     ▼                                                                                  │
│  5. Atomic browser.storage.local.set() commits sanitized keys                            │
│     │                                                                                  │
│     ▼                                                                                  │
│  6. Panel re-scans live -> Status transitions to HEALTHY (badge turns green)           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Minimal Mutation Write Invariant

Auto-remediation must never rewrite the complete storage state.

The repair flow:

1. Read existing storage snapshot.
2. Sanitize in memory.
3. Compare original and sanitized values.
4. Create minimal patch object containing only changed keys.
5. Write only changed keys using browser.storage.local.set().

Unchanged keys must never be written.

---

### 4.4 Resilient Diagnostic Export (JSON File Download)

#### Protocol
In `src/newtab/settings/diagnostic-ui.js`, add a "Download Diagnostic Report (.json)" action:
- Constructs a structured, privacy-sanitized JSON object:
  ```json
  {
    "homebaseVersion": "0.15.5",
    "exportTimestamp": "2026-09-27T15:30:00.000Z",
    "environment": { "platform": "Win32", "userAgent": "Mozilla/5.0..." },
    "storageHealth": {
      "status": "HEALTHY",
      "schemaVersion": 1,
      "counts": { "total": 74, "valid": 74, "recoverable": 0, "corrupted": 0 }
    },
    "anomalies": [],
    "migrationHistory": [],
    "recentPerformanceMetrics": []
  }
  ```
- Creates an in-memory `Blob` of type `application/json`.
- Triggers a browser download with filename `homebase-diagnostic-report-<timestamp>.json`.
- Bypasses all clipboard permission denials.

---

### 4.5 Developer HUD Ergonomics (Collapsible Minimized State)

#### Overlay Minimize Feature
In `src/newtab/core/perf-report.js`:
- Add a minimize/maximize toggle button in the header of `#perf-debug-overlay`.
- When minimized, `#perf-debug-overlay` collapses to a sleek monospace status pill in the bottom-right corner:
  ```text
  [ 🟢 HB Perf: 38ms | Storage: OK ]
  ```
- Clicking the pill instantly restores the full detailed report.
- Saves the minimize state in `sessionStorage` (`homebasePerfOverlayMinimized`) so it persists across tab navigation without altering permanent user settings.

### HUD Persistence Constraint

HUD collapsed/expanded state is session-only.

Storage:
sessionStorage

Forbidden:
- browser.storage.local
- browser.storage.sync
- remote persistence

---

## 5. Files to Modify & Files to Create

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              FILES TO MODIFY IN PHASE 3                                 │
├────────────────────────────────────────┬───────────────┬────────────────────────────────┤
│ FILE PATH                              │ ACTION        │ RESPONSIBILITY                 │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/settings/diagnostic-ui.js   │ Modify        │ Subsystem matrix, auto-repair, │
│                                        │               │ JSON download, quota readout   │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/core/perf-report.js         │ Modify        │ HUD minimize toggle, quota line│
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/styles/settings.css         │ Modify        │ Scoped styles for subsystem    │
│                                        │               │ matrix, repair btn, HUD pill   │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ tests/unit/diagnostic-ui.test.mjs      │ Modify        │ Add tests for matrix, repair,  │
│                                        │               │ JSON export, and HUD minimize  │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/13-maintenance-log.md             │ Modify        │ Ledger entry for Cycle 6 Ph 3  │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/14-ai-change-history.md           │ Modify        │ Change tracking for Ph 3       │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/32-cycle6-phase3-plan.md          │ Create        │ This architecture plan         │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/33-cycle6-phase3-implementation-  │ Create        │ Detailed completion report     │
│ report.md                              │ (Post-edit)   │                                │
└────────────────────────────────────────┴───────────────┴────────────────────────────────┘
```

---

## 6. Invariants & Protected Boundaries

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following boundaries remain strictly inviolable:

| Boundary / File | Status | Preservation Rationale |
| :--- | :--- | :--- |
| `src/new-tab.js` | **DO NOT MODIFY** | High-risk startup orchestration & grid rendering |
| `src/preload.js` | **DO NOT MODIFY** | Synchronous head preload layer |
| `src/instant_load.js` | **DO NOT MODIFY** | First-paint layout hydration |
| `manifests/*` | **DO NOT MODIFY** | MV3 permissions remain unchanged |
| `dist/*` | **DO NOT MODIFY / DO NOT COMMIT** | Generated build artifacts only |
| Storage Schemas | **DO NOT MODIFY** | 74 canonical schemas invariant |
| Classic `<script defer>` | **PRESERVED** | No ES modules, bundlers, or new npm dependencies |

---

## 7. Comprehensive Risk Assessment

| Risk Description | Probability | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Auto-Repair Data Loss** | Low | High | Auto-repair calls `sanitizeStorageBatch` with `fallbackToDefault: false`, guaranteeing unrecognized keys and user content are never wiped. |
| **Cross-Browser Quota Incompatibility** | Low | Low | Feature-detect `getBytesInUse`; if missing, fall back seamlessly to serialized byte estimation. |
| **Download Blob Security Block** | Low | Low | Use standard RFC 4180 MIME type `application/json` with sanitized ASCII filename; revoke object URL immediately after click. |
| **HUD Minimization Layout Shift** | Low | Low | HUD is `position: fixed` with absolute viewport coordinates; minimizing does not affect document layout. |

---

## 8. Testing Strategy & Test Plan

Phase 3 will be verified across all 4 tiers of the Homebase test harness:

### 8.1 Automated Unit Test Expansion (`tests/unit/diagnostic-ui.test.mjs`)
Add targeted test cases covering:
1. **Subsystem Categorization**: Verify all 74 keys map to correct subsystem domains with 0 unmapped orphans.
2. **Auto-Repair Sanitization**: Simulate degraded storage with out-of-bounds values, run auto-repair handler, and assert repaired data is schema-aligned.
3. **JSON File Export**: Verify generated JSON download payload contains valid JSON, structural metadata only, and 0% personal data.
4. **Storage Quota Calculation**: Assert byte formatting and percentage clamp between 0% and 100%.
5. **HUD Minimization Toggle**: Assert clicking HUD minimize button toggles pill state and preserves `sessionStorage`.

### 8.2 Static Invariant Checks
```powershell
node --check src/newtab/settings/diagnostic-ui.js
node --check src/newtab/core/perf-report.js
node scripts/check-newtab-static.mjs
```

### 8.3 Full Regression Suite
```powershell
npm.cmd test
npm.cmd run build
```

---

## 9. Rollback Plan

If regressions occur during Phase 3:
1. Revert to the clean Phase 2 baseline commit (`545a2e7`):
   ```powershell
   git reset --hard 545a2e7
   ```
2. Re-run test validation:
   ```powershell
   npm.cmd test
   npm.cmd run build
   ```
3. Because Phase 2 is self-contained and stable, resetting leaves the complete Phase 2 feature set functional.

---

## 10. Strict Implementation Prompt for Codex

When ready to implement Phase 3, provide the following prompt:

```text
Task: Implement Homebase Improvement Cycle #6 — Phase 3 (Advanced Diagnostics, Subsystem Health Matrix, Storage Auto-Remediation, and HUD Ergonomics).

Follow AGENTS.md.

ADD:
- None

REMOVE:
- None

MODIFY:
- src/newtab/settings/diagnostic-ui.js (SUBSYSTEM_CATEGORIES, createSubsystemHealthMatrix, handleAutoRepairStorage, handleDownloadReport, updateDiagnosticsQuota)
- src/newtab/core/perf-report.js (renderPerformanceOverlay minimize toggle button, state persistence via sessionStorage)
- src/newtab/styles/settings.css (.app-settings-diagnostic-subsystems, .app-settings-diagnostic-repair-btn, #perf-debug-overlay.minimized)
- tests/unit/diagnostic-ui.test.mjs (unit tests covering subsystem breakdown, auto-repair, JSON export, quota telemetry, HUD minimize)
- docs/13-maintenance-log.md
- docs/14-ai-change-history.md

DO NOT MODIFY:
- src/new-tab.js
- src/preload.js
- src/instant_load.js
- manifests/*
- dist/*
- node_modules/*
- storage schemas in src/newtab/core/schema-validator.js
- Unrelated widgets, bookmarks, wallpaper, or search modules

Goal:
1. Subsystem Health Matrix: Map the 74 canonical keys into 5 domains (System, Bookmarks, Wallpapers, Widgets, Search) and render interactive health status chips in the Diagnostics panel.
2. Storage Auto-Remediation: Provide a safe, non-destructive "Auto-Repair Storage" action that normalizes degraded keys via window.HomebaseValidator.sanitizeStorageBatch() without losing user data. Follow the Minimal Mutation Write Invariant (compare original and sanitized values, write only changed keys via browser.storage.local.set(), unchanged keys must never be written).
3. Storage Quota Telemetry: Display asynchronous byte utilization against browser storage quotas in both the Diagnostics panel and HUD overlay without blocking render loops. Follow the Privacy Constraint (expose only aggregate usage: total bytes used, quota limit, percentage utilization; individual key sizes and user data are forbidden).
4. Resilient File Export: Add a direct JSON report file download fallback for restricted environments where clipboard write is denied.
5. Developer HUD Ergonomics: Add a collapsible minimized badge state for #perf-debug-overlay with sessionStorage persistence. Follow the HUD Persistence Constraint (HUD state is session-only via sessionStorage; browser.storage.local/sync and remote persistence are forbidden).

Move / Change:
- In src/newtab/settings/diagnostic-ui.js: Add SUBSYSTEM_CATEGORIES, createSubsystemHealthMatrix, handleAutoRepairStorage (minimal mutation patch), handleDownloadReport, and non-blocking quota measurement (aggregate-only).
- In src/newtab/core/perf-report.js: Add minimize/expand button to HUD header, collapsed badge DOM view, and sessionStorage state persistence.
- In src/newtab/styles/settings.css: Add scoped styles for subsystem matrix cards, auto-repair CTA, and HUD minimized state.
- In tests/unit/diagnostic-ui.test.mjs: Add unit tests for subsystem categorization, auto-repair minimal mutation sanitization, JSON download payload, quota telemetry privacy, and HUD minimize toggle with sessionStorage.

Important:
- Follow AGENTS.md strictly.
- Keep classic <script defer> architecture intact.
- Do not convert any files to ES modules.
- Do not introduce bundlers or external npm dependencies.
- Do not run broad formatters.
- Prevent unrelated refactors, broad formatting, scope creep, and schema changes.
- Clean up any duplicate, dead, stale, or redundant logic directly related to the requested changes.
- Ensure all diagnostic DOM elements and classes remain scoped under app-settings-diagnostic-*.
- Ensure zero personally identifiable information (bookmarks, URLs, todos, custom wallpapers) is leaked into export payloads or DOM.
- Auto-remediation must never rewrite the complete storage state; write only changed keys via minimal patch.
- Quota diagnostics must expose only aggregate usage; individual key sizes and user contents are strictly forbidden.
- HUD collapsed/expanded state must strictly reside in sessionStorage only.

Script order:
- None (no new script files or script loading order changes required).

Testing limit:
- Fast verification pass: Try Chrome/CDP harness once if needed; if setup fails, try one fix. Do not spend more than 10-15 minutes debugging the harness. Continue with static checks, unit tests, and build verification.

After editing, verify:
- node --check src/newtab/settings/diagnostic-ui.js
- node --check src/newtab/core/perf-report.js
- node scripts/check-newtab-static.mjs
- node scripts/smoke-newtab-file.mjs
- npm.cmd test
- npm.cmd run build:chrome
- Note: Manual Firefox testing is required for browser.storage.local operations, quota calculation, JSON file download, and HUD persistence.

Post-edit verification report required:
- Files changed
- Functions moved/modified
- Variables/constants moved/added/removed
- Functions intentionally left in place
- Full final code blocks for modified functions
- Explanation of design decisions
- Verification performed
- Build result
- Anything not verified
- Confirmation that unrelated areas were not changed
```
