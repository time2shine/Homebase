# Homebase Improvement Cycle #6 — Phase 2 Architecture & Implementation Plan
## Developer HUD Integration, Live Refresh Orchestration & Diagnostic UX Hardening

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-27  
> **Cycle ID**: Homebase Improvement Cycle #6 — Phase 2  
> **Target Release**: Homebase v0.15.5  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/28-cycle6-debug-panel-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/28-cycle6-debug-panel-plan.md), [docs/29-cycle6-phase1-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/29-cycle6-phase1-implementation-report.md)  
> **Status**: Approved Architecture Plan — **DO NOT MODIFY SOURCE CODE DURING PLANNING**

---

## Table of Contents

1. [Executive Summary & Phase 2 Objectives](#1-executive-summary--phase-2-objectives)
2. [Phase 1 Foundation Retrospective & Findings](#2-phase-1-foundation-retrospective--findings)
3. [Architecture Analysis by Focus Area](#3-architecture-analysis-by-focus-area)
   - [3.1 Live Diagnostic Refresh & Request De-duplication](#31-live-diagnostic-refresh--request-de-duplication)
   - [3.2 Performance HUD Overlay Integration](#32-performance-hud-overlay-integration)
   - [3.3 Security Remediation: Phase 1 Review Finding F-01](#33-security-remediation-phase-1-review-finding-f-01)
   - [3.4 Developer Experience & Support Bridge](#34-developer-experience--support-bridge)
4. [Files to Modify & Structural Changes](#4-files-to-modify--structural-changes)
5. [Invariants & Protected Boundaries](#5-invariants--protected-boundaries)
6. [Comprehensive Risk Assessment](#6-comprehensive-risk-assessment)
7. [Testing Strategy & Test Plan](#7-testing-strategy--test-plan)
8. [Rollback Plan](#8-rollback-plan)
9. [Codex Implementation Prompt](#9-codex-implementation-prompt)

---

## 1. Executive Summary & Phase 2 Objectives

Phase 1 of Improvement Cycle #6 successfully laid the structural foundation for developer diagnostics by introducing a dedicated, lazy-loaded **Diagnostics Section** in Settings (`window.HomebaseDiagnosticUI`). This module established zero-impact cold startup (0ms overhead) and strict privacy redaction across 10 passing unit tests.

**Phase 2** elevates this foundation into an active, real-time developer observability suite and bridges user diagnostics directly into support workflows.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #6 PHASE 2 ARCHITECTURE                             │
├─────────────────────────┬─────────────────────────┬────────────────────────────────────┤
│ LIVE REFRESH ENGINE     │ PERFORMANCE HUD BRIDGE  │ SECURITY HARDENING (F-01)          │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ In-memory TTL cache     │ Real-time monospace     │ 100% replacement of innerHTML      │
│ In-flight de-duplication│ storage health block in │ interpolations with safe DOM APIs   │
│ Strict read-only audit  │ #perf-debug-overlay     │ (createElement / textContent)      │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ ZERO NEW DEPENDENCIES   │ DUAL-BROWSER COMPLIANT  │ FEEDBACK SECTION BRIDGE            │
├─────────────────────────┼─────────────────────────┼────────────────────────────────────┤
│ Pure vanilla ES2022+;   │ MV3 Chrome & Gecko      │ 1-Click diagnostic report copy     │
│ 0 npm packages added    │ Firefox compatible      │ directly inside "Report Bug" card  │
└─────────────────────────┴─────────────────────────┴────────────────────────────────────┘
```

### Core Deliverables for Phase 2:
1. **Live Diagnostic Refresh**: Add robust on-demand scanning with in-flight request de-duplication, a 10-second TTL session cache to avoid redundant `browser.storage.local.get(null)` calls, and smooth visual loading states.
2. **Performance HUD Integration**: Connect existing in-memory diagnostic streams to the floating viewport overlay (`#perf-debug-overlay` in `src/newtab/core/perf-report.js`), displaying real-time Storage Health, Schema Alignment, Key Validity, Anomaly Counts, Migration Status, and Recent Metrics.
3. **Security Remediation (Finding F-01)**: Eliminate template-literal string interpolation in `diagnostic-ui.js` for anomalies and dynamic metadata, replacing them with programmatic, injection-proof DOM construction (`document.createElement`, `textContent`, `document.createTextNode`).
4. **Support & Bug Report Bridge**: Add a secondary "Copy Diagnostic Report" quick-action inside the Feedback section ("Report Bug" card in `settings-ui.js`), streamlining user issue submissions to GitHub.
5. **Testing & Invariant Verification**: Expand unit test suites to validate caching, request de-duplication, HUD formatting, and DOM injection defense.

---

## 2. Phase 1 Foundation Retrospective & Findings

Phase 1 established:
- `src/newtab/settings/diagnostic-ui.js`: Modular diagnostics rendering with `formatHealthStatus`, `createDiagnosticsNavItem`, `createDiagnosticsSection`, `renderMetricCard`, `handleCopyReport`, and `renderDiagnosticsPanel`.
- `src/newtab/styles/settings.css`: Scoped CSS styles prefixed strictly with `.app-settings-diagnostic-*`.
- `src/newtab/settings/settings-ui.js`: Lazy-loaded script bridge ensuring 0ms impact on new-tab cold-boot.
- `tests/unit/diagnostic-ui.test.mjs`: 10 automated unit tests (79/79 total unit tests passing).

### Phase 1 Audit Finding to Resolve in Phase 2:
* **Finding F-01 (Severity: Low / Informational)**:
  - **Location**: `src/newtab/settings/diagnostic-ui.js:296-301`
  - **Issue**: `itemsHtml = recent.map((a) => '<li><span>${keyName}</span>: ${action}</li>').join('')` with `anomalyBlock.innerHTML = ...`. While `a.key` and `a.action` originate from internal validator functions, string interpolation into `innerHTML` violates defense-in-depth principles and introduces potential XSS vectors if an untrusted key name ever enters storage.
  - **Phase 2 Directive**: Convert all dynamic DOM mutations in `diagnostic-ui.js` to pure DOM node construction using `document.createElement`, `textContent`, and `document.createTextNode`.

---

## 3. Architecture Analysis by Focus Area

### 3.1 Live Diagnostic Refresh & Request De-duplication

#### Problem Statement
Storage audits read all keys from `browser.storage.local.get(null)` and iterate through the 74 registered canonical schemas. While read-only and fast (<5ms), triggering audits repeatedly during rapid settings navigation or repeated button clicks can cause unnecessary disk I/O, event-loop churn, and UI jitter.

#### Architectural Solution
Implement an in-memory session cache and an in-flight promise de-duplicator inside `src/newtab/settings/diagnostic-ui.js`:

```javascript
// Session cache state
let cachedAudit = null;
let lastAuditTimestamp = 0;
let inFlightAuditPromise = null;
const AUDIT_CACHE_TTL_MS = 10000; // 10 seconds

/**
 * Retrieves a storage audit, reusing in-flight promises and respecting TTL cache.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<Object>}
 */
async function getOrFetchStorageAudit(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAudit && (now - lastAuditTimestamp < AUDIT_CACHE_TTL_MS)) {
    return cachedAudit;
  }

  if (inFlightAuditPromise) {
    return inFlightAuditPromise;
  }

  inFlightAuditPromise = (async () => {
    try {
      if (window.HomebaseDiagnostics && typeof window.HomebaseDiagnostics.auditStorageHealth === 'function') {
        cachedAudit = await window.HomebaseDiagnostics.auditStorageHealth();
        lastAuditTimestamp = Date.now();
        return cachedAudit;
      }
      return { status: 'UNKNOWN', counts: { total: 0, valid: 0, recoverable: 0, corrupted: 0 }, schemaVersion: { stored: 'unknown', expected: 1, status: 'ERROR' } };
    } finally {
      inFlightAuditPromise = null;
    }
  })();

  return inFlightAuditPromise;
}
```

#### Key Guarantees:
1. **Strict Read-Only**: Interacts solely with `window.HomebaseDiagnostics.auditStorageHealth()`. Executes **zero** `.set()`, `.remove()`, or `.clear()` calls.
2. **I/O De-duplication**: Multiple rapid clicks on "Run Storage Health Check" or rapid switching between settings tabs collapse into a single asynchronous operation.
3. **Smooth Loading UX**:
   - The scan button transitions to `disabled` with text `"Scanning..."` and opacity reduction.
   - The status badge updates to a temporary pulsing state or maintains existing content to prevent layout shifts.
   - Timestamp displays `"Audited just now"` upon resolution.

---

### 3.2 Performance HUD Overlay Integration

#### Problem Statement
The developer performance HUD (`#perf-debug-overlay` in `src/newtab/core/perf-report.js`) provides real-time monospace readouts for startup timings, bookmark loading, media cleanup, and cache sizes. Developers and QA currently have no visibility into storage health, schema alignment, or validation anomaly buffers without opening DevTools or Settings.

#### Architectural Solution
Extend `updatePerfOverlay()` in `src/newtab/core/perf-report.js` to render a new **`Storage Health`** section and a **`Recent Metrics`** section.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DEVELOPER HUD MONOSPACE READOUT                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Homebase Perf                                                                         │
│                                                                                        │
│  Summary                                                                               │
│  Ready: 38 ms                                                                          │
│  Paint: 42 ms                                                                          │
│  Storage: 6 ms                                                                         │
│  Performance: Off                                                                      │
│                                                                                        │
│  Storage Health                                                                        │
│  Status: HEALTHY                                                                       │
│  Schema: v1 (ALIGNED)                                                                  │
│  Keys: 74/74 valid (0 corrupted)                                                       │
│  Anomalies: 0 in buffer                                                                │
│  Migrations: 1 executed (Success)                                                      │
│                                                                                        │
│  Startup Timeline                                                                      │
│  ...                                                                                   │
│                                                                                        │
│  Recent Metrics                                                                        │
│  - idle:weather: 4 ms                                                                  │
│  - bookmarks:load: 14 ms                                                               │
│  - grid:render: 8 ms                                                                   │
│                                                                                        │
│  Health                                                                                │
│  Warnings: 0                                                                           │
│  Fallbacks: None                                                                       │
│  ...                                                                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Non-Blocking Overhead Constraint (<0.1ms per tick)
`updatePerfOverlay()` executes every few seconds or on layout events. To maintain 60fps and zero disk I/O:
1. **Synchronous In-Memory Buffers**:
   - `window.HomebaseDiagnostics.getValidationAnomalies()`: In-memory array slice (0.01ms).
   - `getPerformanceMetrics()`: In-memory array slice (0.01ms).
   - `window.getMigrationHistory()`: In-memory cache or fast read.
2. **Asynchronous Cached Storage Audit**:
   - The HUD must **never** call `browser.storage.local.get(null)` directly on its render tick.
   - It reads from `window.HomebaseDiagnostics.getLastCompletedAudit()` (or an in-memory cached audit slot populated during startup or settings inspection).
   - If no audit has run yet, it displays `Status: HEALTHY (initial)` or triggers an idle background check.

---

### 3.3 Security Remediation: Phase 1 Review Finding F-01

#### Problem Statement
In `src/newtab/settings/diagnostic-ui.js`, lines 296-301 format anomaly items via template literals:
```javascript
const itemsHtml = recent.map((a) => {
  const keyName = typeof a.key === 'string' ? a.key.slice(0, 40) : 'key';
  const action = typeof a.action === 'string' ? a.action : 'normalized';
  return `<li><span class="app-settings-diagnostic-detail-code">${keyName}</span>: ${action}</li>`;
}).join('');
anomalyBlock.innerHTML = `...`;
```

#### Remediation Plan
Completely eliminate all dynamic `innerHTML` string interpolations across `diagnostic-ui.js`. Replace them with safe, programmatic DOM construction:

```javascript
// Safe DOM Construction Pattern:
function createAnomalyDetailBlock(anomalies) {
  const block = document.createElement('div');
  block.className = 'app-settings-diagnostic-detail-item';

  const title = document.createElement('div');
  title.className = 'app-settings-diagnostic-detail-title';
  title.textContent = anomalies.length > 0
    ? `Recent Validation Normalizations (${anomalies.length} in buffer)`
    : 'Validation Anomalies';
  block.appendChild(title);

  const body = document.createElement('div');
  body.className = 'app-settings-diagnostic-detail-body';

  if (anomalies.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'app-settings-diagnostic-anomaly-list';

    anomalies.slice(-5).forEach((a) => {
      const li = document.createElement('li');
      const codeSpan = document.createElement('span');
      codeSpan.className = 'app-settings-diagnostic-detail-code';
      codeSpan.textContent = typeof a.key === 'string' ? a.key.slice(0, 40) : 'key';
      
      li.appendChild(codeSpan);
      li.appendChild(document.createTextNode(`: ${typeof a.action === 'string' ? a.action : 'normalized'}`));
      ul.appendChild(li);
    });

    body.appendChild(ul);
  } else {
    body.classList.add('app-settings-diagnostic-empty');
    body.textContent = 'Zero validation anomalies recorded in active memory session.';
  }

  block.appendChild(body);
  return block;
}
```

Apply this identical safe construction pattern to:
1. `createSchemaDetailBlock(audit)`
2. `createMigrationDetailBlock(history)`
3. `createNoticeBlock()`

Result: **100% elimination of DOM injection risk (Zero XSS attack surface)**.

---

### 3.4 Developer Experience & Support Bridge

#### Support Bridge in Settings -> Feedback
Users submitting bug reports to GitHub often omit critical system state (e.g. Firefox vs. Chrome, schema version, storage alignment, extension errors).

In `src/newtab/settings/settings-ui.js`:
- Enhance the `"Report Bug"` card in `data-section="feedback"`.
- Add a secondary button: `"Copy Diagnostic Report"` styled with `.gallery-secondary-btn`.
- Clicking copies the sanitized health report directly to clipboard using `handleCopyReport()`, giving users immediate feedback: `"Copied to Clipboard!"`.
- Add helpful helper text: *"Copy a privacy-safe diagnostic report to paste into your GitHub issue."*

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FEEDBACK BUG REPORT CARD                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Report a Bug                                                                          │
│  Found an issue or unexpected behavior? Let us know on GitHub.                         │
│                                                                                        │
│  [ Open GitHub Issues ] (Primary link)                                                 │
│  [ Copy Diagnostic Report ] (Secondary action with animated feedback)                 │
│                                                                                        │
│  * Diagnostic reports are 100% private and contain zero personal data or URLs.        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Files to Modify & Structural Changes

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              FILES TO MODIFY IN PHASE 2                                 │
├────────────────────────────────────────┬───────────────┬────────────────────────────────┤
│ FILE PATH                              │ ACTION        │ RESPONSIBILITY                 │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/settings/diagnostic-ui.js   │ Modify        │ TTL cache, de-duplication, safe│
│                                        │               │ DOM construction (Fix F-01)    │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/core/perf-report.js         │ Modify        │ Add Storage Health & Metrics   │
│                                        │               │ sections to #perf-debug-overlay│
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/settings/settings-ui.js     │ Modify        │ Wire "Copy Diagnostic Report"  │
│                                        │               │ button into Feedback section   │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ src/newtab/styles/settings.css         │ Modify        │ Styles for anomaly lists and   │
│                                        │               │ feedback diagnostic button     │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ tests/unit/diagnostic-ui.test.mjs      │ Modify        │ Add tests for TTL caching,     │
│                                        │               │ de-duplication, safe DOM       │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/13-maintenance-log.md             │ Modify        │ Ledger entry for Cycle 6 Ph 2  │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/14-ai-change-history.md           │ Modify        │ Change tracking for Ph 2       │
├────────────────────────────────────────┼───────────────┼────────────────────────────────┤
│ docs/31-cycle6-phase2-implementation-  │ Create        │ Detailed completion report     │
│ report.md                              │               │                                │
└────────────────────────────────────────┴───────────────┴────────────────────────────────┘
```

---

## 5. Invariants & Protected Boundaries

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following architectural boundaries are strictly protected and **must not be modified**:

| Boundary / File | Invariant Requirement | Rationale |
| :--- | :--- | :--- |
| `src/new-tab.js` | **DO NOT MODIFY** | High-risk startup orchestration and grid rendering |
| `src/preload.js` | **DO NOT MODIFY** | Critical synchronous head preload layer |
| `src/instant_load.js` | **DO NOT MODIFY** | First-paint synchronous layout hydration |
| `manifests/*` | **DO NOT MODIFY** | Dual-browser MV3 permission manifests |
| `dist/*` | **DO NOT MODIFY / DO NOT COMMIT** | Generated build artifacts only |
| Storage Schemas | **DO NOT MODIFY** | Schema definitions & version key remain invariant |
| Classic `<script defer>` | **PRESERVE** | No ES modules, bundlers, or new npm dependencies |

---

## 6. Comprehensive Risk Assessment

| Risk Description | Probability | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **HUD Overlay Layout Shift** | Low | Low | Monospace text container uses fixed character line formats. Total lines added to HUD is bounded to 8 lines. |
| **HUD Render Loop Latency** | Low | Medium | HUD tick reads in-memory buffers synchronously; storage audit is read from cache only (<0.05ms impact). |
| **Duplicate Storage Reads** | Low | Medium | Enforced 10-second TTL cache and `inFlightAuditPromise` pattern ensure maximum 1 audit per 10s. |
| **Feedback Section Regressions** | Low | Low | Diagnostic copy button in feedback card reuses existing `handleCopyReport()` API without altering navigation links. |
| **Cross-Browser Clipboard Denials** | Medium | Low | Dual-tier clipboard protocol with `execCommand('copy')` fallback ensures graceful failure notifications. |

---

## 7. Testing Strategy & Test Plan

Phase 2 will be verified across all 4 tiers of the Homebase test harness:

### 7.1 Automated Unit Test Expansion (`tests/unit/diagnostic-ui.test.mjs`)
Add targeted test cases covering:
1. **Cache TTL & Request De-duplication**:
   - Assert multiple immediate calls to `getOrFetchStorageAudit()` only invoke `auditStorageHealth()` once.
   - Assert `forceRefresh = true` bypasses cache and re-invokes `auditStorageHealth()`.
2. **Safe DOM Construction (Fix F-01)**:
   - Inject malicious key names containing `<script>` and `<img>` tags into mock anomaly records.
   - Assert rendered DOM creates elements safely via `textContent` and contains zero executable script nodes.
3. **HUD Monospace Formatting**:
   - Verify `formatStorageHealthOverlayLines(audit)` generates expected monospace lines with status, schema, valid keys, and anomaly counts.
4. **Feedback Bridge Action**:
   - Verify clicking the diagnostic button in the Feedback card triggers `handleCopyReport`.

### 7.2 Static Invariant Checks
```powershell
node --check src/newtab/settings/diagnostic-ui.js
node --check src/newtab/core/perf-report.js
node --check src/newtab/settings/settings-ui.js
node scripts/check-newtab-static.mjs
```

### 7.3 Full Regression Suite
```powershell
npm.cmd test
npm.cmd run build
```

---

## 8. Rollback Plan

If regressions occur during Phase 2:
1. Revert to the clean Phase 1 baseline commit (`b952c2f`):
   ```powershell
   git reset --hard b952c2f
   ```
2. Re-run test validation:
   ```powershell
   npm.cmd test
   npm.cmd run build
   ```
3. Because Phase 1 is strictly modular and decoupled, resetting leaves the core extension completely functional with zero orphaned data in `browser.storage.local`.

---

## 9. Codex Implementation Prompt

When ready to implement Phase 2, provide the following prompt:

```text
Task: Implement Homebase Improvement Cycle #6 — Phase 2.

Follow AGENTS.md.

ADD:
- None (all modules introduced in Phase 1)

MODIFY:
- src/newtab/settings/diagnostic-ui.js
- src/newtab/core/perf-report.js
- src/newtab/settings/settings-ui.js
- src/newtab/styles/settings.css
- tests/unit/diagnostic-ui.test.mjs
- docs/13-maintenance-log.md
- docs/14-ai-change-history.md

CREATE:
- docs/31-cycle6-phase2-implementation-report.md

DO NOT MODIFY:
- src/new-tab.js
- src/preload.js
- src/instant_load.js
- manifests/*
- dist/*
- storage schemas

Goal:
1. Implement in-memory TTL caching (10s) and request de-duplication in diagnostic-ui.js.
2. Fix Phase 1 Review Finding F-01: replace all innerHTML interpolations with safe DOM APIs.
3. Integrate Storage Health & Recent Metrics into #perf-debug-overlay in perf-report.js.
4. Add "Copy Diagnostic Report" secondary button to Feedback section "Report Bug" card.
5. Add unit tests for caching, de-duplication, safe DOM rendering, and HUD formatting.

After editing, verify:
node --check <changed-files>
node scripts/check-newtab-static.mjs
npm.cmd test
npm.cmd run build

Do not commit.
```
