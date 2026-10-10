# Homebase — Improvement Cycle #6 Architecture Audit & Implementation Plan
## Developer Debug Panel & Diagnostic UI System

> **Author**: Core Extension Architect & Systems Diagnostics Lead  
> **Date**: 2026-09-27  
> **Cycle ID**: Homebase Improvement Cycle #6  
> **Target Release**: Homebase v0.15.4  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-state.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-state.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/26-cycle5-storage-health-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/26-cycle5-storage-health-plan.md), [docs/27-cycle5-implementation-report.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/27-cycle5-implementation-report.md)  
> **Scope**: Diagnostic UI & Developer Debug Panel Architecture Specification — **DO NOT MODIFY SOURCE CODE**

---

## Table of Contents

1. [Executive Summary & Foundational Progression](#1-executive-summary--foundational-progression)
2. [Section 1: Post-Cycle #5 Observability Baseline & The Visual Gap](#2-section-1-post-cycle-5-observability-baseline--the-visual-gap)
   - [2.1 Current Programmatic Capabilities](#21-current-programmatic-capabilities)
   - [2.2 The Visual Observability Vacuum](#22-the-visual-observability-vacuum)
   - [2.3 Core Persona Friction Matrix](#23-core-persona-friction-matrix)
3. [Section 2: Comprehensive Architecture Evaluation](#3-section-2-comprehensive-architecture-evaluation)
   - [3.1 Evaluation 1: User Impact](#31-evaluation-1-user-impact)
   - [3.2 Evaluation 2: Engineering Value](#32-evaluation-2-engineering-value)
   - [3.3 Evaluation 3: Regression Risk](#33-evaluation-3-regression-risk)
   - [3.4 Evaluation 4: Files Affected & Protected Invariants](#34-evaluation-4-files-affected--protected-invariants)
   - [3.5 Evaluation 5: UI Integration Points](#35-evaluation-5-ui-integration-points)
   - [3.6 Evaluation 6: Privacy Implications & Redaction Guarantees](#36-evaluation-6-privacy-implications--redaction-guarantees)
   - [3.7 Evaluation 7: Testing Requirements](#37-evaluation-7-testing-requirements)
   - [3.8 Evaluation 8: Rollback & Recovery Strategy](#38-evaluation-8-rollback--recovery-strategy)
4. [Section 3: Detailed UI/UX & Component Architecture](#4-section-3-detailed-uiux--component-architecture)
   - [4.1 Surface 1: Settings Diagnostic Panel](#41-surface-1-settings-diagnostic-panel)
   - [4.2 Surface 2: Help & Feedback Section Bridge](#42-surface-2-help--feedback-section-bridge)
   - [4.3 Surface 3: HUD Performance Overlay Extension](#43-surface-3-hud-performance-overlay-extension)
   - [4.4 Visual Wireframes & ASCII Component Layouts](#44-visual-wireframes--ascii-component-layouts)
5. [Section 4: Technical Specifications & Data Flow](#5-section-4-technical-specifications--data-flow)
   - [5.1 Component Lifecycle & Event Flow](#51-component-lifecycle--event-flow)
   - [5.2 Asynchronous Audit Orchestration & Cache Strategy](#52-asynchronous-audit-orchestration--cache-strategy)
   - [5.3 Clipboard Export Protocol & Multi-Tier Fallback](#53-clipboard-export-protocol--multi-tier-fallback)
   - [5.4 DOM Blueprint & Injection Protocol](#54-dom-blueprint--injection-protocol)
   - [5.5 CSS Design Tokens & Scoped Stylesheet Specification](#55-css-design-tokens--scoped-stylesheet-specification)
6. [Section 5: Phased Implementation Sequence](#6-section-5-phased-implementation-sequence)
7. [Section 6: Testing Strategy & Automated Suites](#7-section-6-testing-strategy--automated-suites)
8. [Section 7: Strict Implementation Prompt for Codex](#8-section-7-strict-implementation-prompt-for-codex)

---

## 1. Executive Summary & Foundational Progression

Homebase has systematically hardened its data durability, testing, and storage governance across five successive engineering cycles:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HOMEBASE SYSTEM PROGRESSION                               │
├──────────────┬──────────────────────────────┬──────────────────────────────────────────┤
│ CYCLE        │ FOCUS AREA                   │ FOUNDATION DELIVERED                     │
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
│ Cycle #6     │ Developer Debug Panel        │ Non-intrusive UI overlay & diagnostic hub│
│ (PLANNED)    │ & Diagnostic UI System       │ 1-click clipboard health report export   │
└──────────────┴──────────────────────────────┴──────────────────────────────────────────┘
```

In **Cycle #5**, the repository acquired comprehensive diagnostics infrastructure: `auditStorageHealth()`, `auditBackupHealth()`, in-memory validation anomaly tracking (50-entry circular ring buffer), persistent migration history tracking (20-entry FIFO log), and privacy-redacted diagnostic report compilation (`generateHealthReport()`, `exportHealthReport()`).

However, **this diagnostic engine currently operates entirely headlessly**. Only software developers opening the browser Developer Tools console and invoking JavaScript commands can query storage status, inspect anomalies, or export health reports.

**Cycle #6 resolves this usability and observability gap** by designing a **Developer Debug Panel & Diagnostic UI System**. This system exposes storage health status, schema alignment, validation anomalies, migration history, and a 1-click "Copy Diagnostic Health Report" button directly into the user interface—without adding any runtime npm dependencies, without modifying protected startup paths, and without impacting cold-boot render latency.

---

## 2. Section 1: Post-Cycle #5 Observability Baseline & The Visual Gap

### 2.1 Current Programmatic Capabilities

Following the completion of Cycle #5, the following diagnostic APIs are active and globally registered on `window`:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                           CYCLE #5 DIAGNOSTIC CAPABILITIES                            │
├───────────────────────────────────┬──────────────┬────────────────────────────────────┤
│ API METHOD                        │ SCOPE        │ FUNCTIONALITY                      │
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseDiagnostics               │ Global       │ Read-only scan of all 74 storage   │
│ .auditStorageHealth()             │              │ keys, schemaVersion alignment check│
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseDiagnostics               │ Global       │ Pre-flight validation of backup    │
│ .auditBackupHealth(json)          │              │ files before import execution      │
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseDiagnostics               │ In-Memory    │ Retrieves circular ring buffer of  │
│ .getValidationAnomalies()         │ (50 records) │ clamped, defaulted, rejected keys  │
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseMigrations                │ Storage      │ Retrieves capped 20-entry history  │
│ .getMigrationHistory()            │ (Persistent) │ of migration execution outcomes    │
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseDiagnostics               │ Export       │ Compiles privacy-sanitized text    │
│ .generateHealthReport()           │              │ report with zero PII or URLs       │
├───────────────────────────────────┼──────────────┼────────────────────────────────────┤
│ HomebaseDiagnostics               │ Clipboard    │ Copies report to system clipboard  │
│ .exportHealthReport()             │              │ via writeText or execCommand       │
└───────────────────────────────────┴──────────────┴────────────────────────────────────┘
```

### 2.2 The Visual Observability Vacuum

Despite these rich programmatic capabilities, there is currently **zero visual surface in the extension** where these metrics are displayed:

1. **Settings Modal Blindness**: The main Settings modal (`#app-settings-modal`) has tabs for General, Search, Tabs, Widgets, Bookmarks, Gallery, Backup, Feedback, What's New, and About. None of these tabs display storage health, schema version, or validation errors.
2. **Support Triage Barrier**: When users submit bug reports via Settings $\to$ Feedback $\to$ "Report Bug", they are redirected to GitHub Issues. Non-technical users cannot supply storage diagnostics because they do not know how to open DevTools, locate the extension console, or run `HomebaseDiagnostics.exportHealthReport()`.
3. **Incomplete Performance Overlay**: The existing HUD performance overlay (`#perf-debug-overlay`, enabled via Settings $\to$ General $\to$ "Perf debug overlay") surfaces cold-boot paint times, DOM node counts, Sortable library status, and Cache API byte counts, but is completely blind to storage health, schema version, and validation anomalies.

### 2.3 Core Persona Friction Matrix

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                 PERSONA FRICTION MATRIX                               │
├───────────────────┬───────────────────────────────────┬───────────────────────────────┤
│ PERSONA           │ SCENARIO                          │ CURRENT FRICTION / BLOCKER    │
├───────────────────┼───────────────────────────────────┼───────────────────────────────┤
│ Everyday User     │ Settings reset unexpectedly or    │ No way to tell if extension is│
│                   │ bookmark folder fails to load     │ corrupted or healthy; cannot  │
│                   │                                   │ report technical cause        │
├───────────────────┼───────────────────────────────────┼───────────────────────────────┤
│ Bug Reporter      │ Filing a GitHub issue regarding   │ Cannot attach diagnostic log; │
│                   │ layout glitch or backup failure   │ triage engineer must ask for  │
│                   │                                   │ manual DevTools instructions  │
├───────────────────┼───────────────────────────────────┼───────────────────────────────┤
│ Extension QA /    │ Validating Chrome vs Firefox MV3  │ Must keep console open on     │
│ Developer         │ migration behavior & sanitization │ every new tab; no visual HUD  │
│                   │                                   │ indicator of storage state    │
└───────────────────┴───────────────────────────────────┴───────────────────────────────┘
```

---

## 3. Section 2: Comprehensive Architecture Evaluation

### 3.1 Evaluation 1: User Impact

The design of the Diagnostic UI system is evaluated across three user segments to ensure maximum utility without cognitive burden:

#### 1. Non-Technical / Casual Users
- **Zero Invasiveness**: Diagnostics will not appear on the new-tab dashboard or interrupt the user's workflow with unrequested alerts, toasts, or modals.
- **Calm, High-Level Feedback**: Storage health is summarized with clear, intuitive status badges:
  - `HEALTHY` (Green): "All storage items and settings are operating normally."
  - `DEGRADED` (Amber): "Minor recoverable settings adjusted. No data lost."
  - `CORRUPTED` (Red): "Storage anomalies detected. Backup recommended."
- **One-Click Support Assistance**: A prominent, friendly button: `Copy Diagnostic Report` with animated confirmation ("Copied!"). The user can paste this directly into a GitHub issue or email without understanding technical JSON dictionaries.

#### 2. Advanced / Power Users
- **System Transparency**: Users can view the exact schema version (`v1`), the number of evaluated keys (e.g. `74/74 valid`), and storage usage estimates.
- **Self-Healing Insight**: Power users can see which keys were automatically normalized (e.g. hex color expansion `#fff` $\to$ `#ffffff`) or clamped to valid bounds.

#### 3. Cold-Boot Experience Impact
- **Zero Latency Budget Overhead**: The diagnostic panel lives entirely inside the lazy-loaded settings bundle (`newtab/settings/settings-ui.js` and `newtab/styles/settings.css`). It is never parsed, rendered, or executed during new-tab cold-boot.
- **Perceived Paint Time**: Remains exactly **< 50ms**, completely unaffected by Cycle #6.

---

### 3.2 Evaluation 2: Engineering Value

Integrating a visual diagnostic interface delivers profound engineering and maintenance benefits:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ENGINEERING VALUE MULTIPLIERS                             │
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ 1. Instant Bug Triage    │ Reduces GitHub issue resolution time from days to minutes   │
│                          │ by providing authoritative, copy-pasteable storage audits   │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 2. Production Validation │ Real-world verification of Cycle #4 validator and Cycle #3B │
│                          │ migrations across heterogeneous browser versions & profiles │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 3. Automated Testability │ Exposes clean DOM fixtures for automated CDP and headless   │
│                          │ unit tests to assert diagnostic accuracy and UI fidelity    │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 4. Cross-Browser Parity  │ Instantly flags Firefox container quirks or Chrome MV3      │
│                          │ storage quota anomalies without requiring manual debugging  │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

### 3.3 Evaluation 3: Regression Risk

Introducing UI components to an existing, mature settings architecture carries specific technical risks that must be analyzed and defended:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              REGRESSION RISK DEFENSE MATRIX                           │
├───────────────────┬────────┬──────────────────────────┬───────────────────────────────┤
│ RISK AREA         │ SEVERITY│ CAUSE                    │ DEFENSE / MITIGATION PATTERN  │
├───────────────────┼────────┼──────────────────────────┼───────────────────────────────┤
│ Cold-Boot Paint   │ CRITICAL│ Premature script loading │ Strictly maintain lazy-load   │
│ Degradation       │        │ or synchronous execution │ boundary in dock-navigation.js│
│                   │        │ in new-tab.html          │ Zero diagnostic UI in head/top│
├───────────────────┼────────┼──────────────────────────┼───────────────────────────────┤
│ Storage State     │ HIGH   │ Diagnostic UI accidentally│ Strictly enforce read-only    │
│ Mutation          │        │ writing or resetting keys│ auditStorageHealth(); UI has  │
│                   │        │ during render audit      │ 0 calls to storage.local.set  │
├───────────────────┼────────┼──────────────────────────┼───────────────────────────────┤
│ CSS Cascade       │ MEDIUM │ Global style collisions  │ Strict BEM/prefix namespacing:│
│ Pollution         │        │ with existing modal tags │ .app-settings-diagnostic-*    │
│                   │        │ or dialog layouts        │ Appended only to settings.css │
├───────────────────┼────────┼──────────────────────────┼───────────────────────────────┤
│ DOM Memory Leaks  │ LOW    │ Excessive re-renders or  │ Render on-demand when section │
│                   │        │ unbounded anomaly lists  │ selected; cap anomaly display │
│                   │        │ in settings DOM          │ to last 20; clear on modal clo│
├───────────────────┼────────┼──────────────────────────┼───────────────────────────────┤
│ Clipboard Failure │ LOW    │ Browser permissions or   │ Dual-layer fallback:          │
│ In Unfocused Tab  │        │ document focus loss      │ navigator.clipboard ->        │
│                   │        │                          │ document.execCommand('copy')  │
└───────────────────┴────────┴──────────────────────────┴───────────────────────────────┘
```

---

### 3.4 Evaluation 4: Files Affected & Protected Invariants

#### Planned File Modifications / Additions for Cycle #6

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PLANNED SOURCE CHANGES                                    │
├────────────────────────────────────────┬─────────┬─────────────────────────────────────┤
│ FILE PATH                              │ ACTION  │ PURPOSE                             │
├────────────────────────────────────────┼─────────┼─────────────────────────────────────┤
│ src/newtab/settings/settings-ui.js     │ MODIFY  │ Dynamic injection of Diagnostics nav│
│                                        │         │ item, panel rendering, & copy bridge│
├────────────────────────────────────────┼─────────┼─────────────────────────────────────┤
│ src/newtab/styles/settings.css         │ MODIFY  │ Scoped styling for diagnostic cards,│
│                                        │         │ status badges, tables, and buttons  │
├────────────────────────────────────────┼─────────┼─────────────────────────────────────┤
│ src/newtab/core/perf-report.js         │ MODIFY  │ Integrate storage health summary    │
│                                        │         │ into #perf-debug-overlay HUD text   │
├────────────────────────────────────────┼─────────┼─────────────────────────────────────┤
│ tests/unit/diagnostic-ui.test.mjs      │ CREATE  │ Unit test suite for diagnostic DOM  │
│                                        │         │ rendering, badges, and copy handler │
├────────────────────────────────────────┼─────────┼─────────────────────────────────────┤
│ docs/28-cycle6-debug-panel-plan.md     │ CREATE  │ This authoritative architecture plan│
└────────────────────────────────────────┴─────────┴─────────────────────────────────────┘
```

#### Strictly Protected Repository Invariants (DO NOT MODIFY)

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following high-risk files and areas are **strictly forbidden** from modification during Cycle #6:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     STRICTLY PROTECTED REPOSITORY AREAS                 │
├───────────────────────────────┬─────────────────────────────────────────┤
│ FILE / SUBSYSTEM              │ REASON FOR STRICT PROTECTION            │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/new-tab.js                │ Monolithic runtime; startup lifecycle,  │
│ (initializePage, bookmarks)   │ drag-drop, and bookmark grid rendering  │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/preload.js                │ Synchronous <head> preloader; must      │
│                               │ never throw or block first-paint        │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/instant_load.js           │ Synchronous <body> instant hydration;   │
│                               │ must remain ultra-lightweight           │
├───────────────────────────────┼─────────────────────────────────────────┤
│ src/new-tab.css               │ 5,700-line global stylesheet; zero edit │
│                               │ policy to prevent visual regressions    │
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

### 3.5 Evaluation 5: UI Integration Points

Three dedicated integration surfaces have been analyzed for seamless user experience:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               UI INTEGRATION TOPOLOGY                                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  SURFACE 1: PRIMARY DIAGNOSTIC DASHBOARD (Settings -> Diagnostics)                      │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ App Settings Modal -> Navigation Item "Diagnostics" (under divider)               │  │
│  │ - Full health overview (badge, key statistics, schema alignment)                  │  │
│  │ - 1-Click "Copy Diagnostic Report" button                                         │  │
│  │ - Collapsible panels: Validation Anomalies & Migration History                    │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
│  SURFACE 2: SUPPORT / BUG REPORT BRIDGE (Settings -> Feedback)                          │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Feedback Section -> "Report Bug" Card                                             │  │
│  │ - Contextual prompt: "Attach a diagnostic health report to your bug report"       │  │
│  │ - Secondary action button: "Copy Diagnostic Report"                               │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
│  SURFACE 3: DEVELOPER HUD OVERLAY (Floating Viewport Overlay)                           │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ On-Screen #perf-debug-overlay (Enabled via Settings -> General)                   │  │
│  │ - Compact real-time readout: Storage Health, Valid Keys, Anomaly Count, Version   │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Integration Analysis

1. **Surface 1 (Primary Dashboard in Settings Navigation)**:
   - Follows the dynamic section injection pattern established in `src/newtab/settings/settings-ui.js` by `createPrivacySection()` and `createProTipsSection()`.
   - Placed in `app-settings-nav` immediately following `backup` and `whats-new`, adjacent to `feedback`.
   - Included in `PANELS_WITHOUT_ACTIONS` set (`['backup', 'feedback', 'whats-new', 'pro-tips', 'diagnostics', 'privacy', 'about']`), which automatically hides the bottom Save/Cancel footer.

2. **Surface 2 (Feedback Bridge)**:
   - Directly enhances the existing `.app-settings-feedback-card` for "Report Bug".
   - Provides immediate value: users reporting an issue can copy their system state in 1 click before clicking the GitHub link.

3. **Surface 3 (Developer HUD Overlay Extension)**:
   - Extends the monospace HUD output generated by `updatePerfOverlay()` in `src/newtab/core/perf-report.js`.
   - Provides live feedback to developers and testers while testing features or tweaking settings.

---

### 3.6 Evaluation 6: Privacy Implications & Redaction Guarantees

Homebase is an uncompromisingly privacy-centric dashboard extension. The Diagnostic UI system must strictly adhere to the project's non-negotiable privacy invariants:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRIVACY & SECURITY GUARANTEES                             │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ 1. Zero Network Calls   │ Diagnostics execute 100% locally. Zero telemetry endpoints,  │
│                         │ zero analytics beacons, zero crash reporting SDKs.           │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 2. URL & Content        │ Personal bookmark URLs, bookmark titles, todo list texts,    │
│    Redaction            │ search history queries, and custom wallpaper data blobs are  │
│                         │ strictly stripped or replaced with [redacted] descriptors.   │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 3. Explicit User Copy   │ Diagnostics are only placed on the clipboard when the user   │
│    Action               │ explicitly clicks "Copy Diagnostic Report". Never automated. │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 4. Clear UI Disclosure  │ A visible "Privacy Notice" badge in the UI explicitly affirms│
│                         │ what is and is not included in the generated report.         │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

### 3.7 Evaluation 7: Testing Requirements

Testing for Cycle #6 must satisfy Homebase's strict 4-tier testing pyramid:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      CYCLE #6 TEST HARNESS INTEGRATION                  │
├─────────┬─────────────────────────────┬─────────────────────────────────┤
│ STAGE   │ SCRIPT / TOOL               │ REQUIREMENT FOR CYCLE #6        │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 1 │ V8 Syntax Validation        │ node --check on modified files: │
│         │                             │ settings-ui.js, perf-report.js  │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 2 │ Static Structural Checker   │ check-newtab-static.mjs passes; │
│         │                             │ zero declaration collisions     │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 3 │ Algorithmic Unit Tests      │ New suite: diagnostic-ui.test   │
│         │ (node:test)                 │ Expanded baseline: > 80 tests   │
├─────────┼─────────────────────────────┼─────────────────────────────────┤
│ Stage 4 │ Browser Smoke Test (CDP)    │ smoke-newtab-file.mjs passes;   │
│         │                             │ verifies Settings opening       │
└─────────┴─────────────────────────────┴─────────────────────────────────┘
```

#### Unit Test Matrix (`tests/unit/diagnostic-ui.test.mjs`)
1. **DOM Structure Tests**: Asserts correct creation of navigation item and section elements with proper `data-section="diagnostics"`.
2. **Badge Rendering Tests**: Asserts that `HEALTHY`, `DEGRADED`, and `CORRUPTED` statuses produce correct CSS classes (`--healthy`, `--degraded`, `--corrupted`) and human-readable text.
3. **Statistics Card Tests**: Asserts proper calculation and formatting of total keys, valid keys, recoverable anomalies, corrupted keys, and schema version numbers.
4. **Clipboard Copy Tests**: Asserts that clicking "Copy Diagnostic Report" invokes `HomebaseDiagnostics.exportHealthReport()` and toggles visual button feedback ("Copied!").
5. **Re-scan Action Tests**: Asserts that clicking "Run Storage Health Check" triggers fresh audit and re-renders statistics without memory leaks.
6. **Privacy Redaction Verification**: Asserts that rendered DOM fixtures never contain raw URL strings, bookmark titles, or todo text.

---

### 3.8 Evaluation 8: Rollback & Recovery Strategy

Cycle #6 is engineered for complete, non-destructive reversibility:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ROLLBACK RISK & RECOVERY MATRIX                           │
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ 1. Schema Independence   │ Cycle #6 introduces ZERO new storage keys and modifies      │
│                          │ ZERO schema versions. Rolling back changes leaves storage   │
│                          │ 100% intact and fully compatible.                           │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 2. Isolated UI Ingestion │ All UI injection code is contained in settings-ui.js and    │
│                          │ settings.css. Reverting these files completely removes the  │
│                          │ UI without touching core runtime or new-tab.js.             │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 3. Instant Git Revert    │ A single command: git checkout development --               │
│                          │ src/newtab/settings/settings-ui.js                          │
│                          │ src/newtab/styles/settings.css                              │
│                          │ src/newtab/core/perf-report.js                              │
│                          │ completely returns the workspace to Cycle #5 baseline.      │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 4. Section 3: Detailed UI/UX & Component Architecture

### 4.1 Surface 1: Settings Diagnostic Panel

The primary diagnostic interface will be dynamically mounted into `#app-settings-modal` via `ensureSettingsSectionOrder()`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ NAVIGATION ITEM:                                                                       │
│ Icon: [Activity Pulse SVG] | Label: "Diagnostics"                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SECTION CONTAINER: data-section="diagnostics"                                          │
│                                                                                        │
│ 1. HEADER BLOCK                                                                        │
│    Title: "System & Storage Diagnostics"                                               │
│    Meta: "Live health assessment and schema integrity monitoring"                      │
│                                                                                        │
│ 2. HEALTH STATUS BANNER                                                                │
│    ┌────────────────────────────────────────────────────────────────────────────────┐  │
│    │  [STATUS BADGE: HEALTHY]   Schema Version: 1 (Aligned)                         │  │
│    │  Storage state is fully verified. Zero corrupted keys detected.                │  │
│    │  Last audit: Today at 05:45:12                                                 │  │
│    └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│ 3. METRIC CARDS GRID (4 Columns)                                                       │
│    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│    │ TOTAL KEYS   │ │ VALID KEYS   │ │ RECOVERABLE  │ │ CORRUPTED    │                 │
│    │    74        │ │    74        │ │     0        │ │     0        │                 │
│    │ Registered   │ │ Verified     │ │ Auto-Clamped │ │ Immediate Attn│                │
│    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                 │
│                                                                                        │
│ 4. ACTION TOOLBAR                                                                      │
│    [Copy Diagnostic Report]  (Primary Button — exports privacy-safe report)            │
│    [Run Health Check]        (Secondary Button — triggers live re-scan)                │
│                                                                                        │
│ 5. COLLAPSIBLE ACCORDIONS (ProTips Pattern)                                            │
│    ▼ Recent Validation Anomalies (In-Memory Buffer: 0 active)                          │
│      [Clear Buffer]                                                                    │
│      (Shows timestamp, key name, action: clamped/defaulted/normalized)                 │
│                                                                                        │
│    ▶ Schema Migration History (1 entry recorded)                                       │
│      (Shows fromVersion, toVersion, status, durationMs, timestamp)                     │
│                                                                                        │
│ 6. PRIVACY NOTICE                                                                      │
│    "Zero Personal Data: Bookmark URLs, titles, search queries, and custom images are    │
│    never included in diagnostic reports or stored in diagnostic logs."                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.2 Surface 2: Help & Feedback Section Bridge

Inside the existing `data-section="feedback"` section, the "Report Bug" card will be enhanced:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FEEDBACK CARD: "Report Bug"                                                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Title: Report Bug                                                                      │
│ Text: Report a bug or broken behavior on GitHub. To help us troubleshoot, you can      │
│       copy your diagnostic health report before filing an issue.                       │
│                                                                                        │
│ Action Buttons (Flex Row):                                                             │
│ [Report Bug]                    (Opens GitHub Issues in new tab)                       │
│ [Copy Diagnostic Report]        (Copies sanitized health report directly to clipboard) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Surface 3: HUD Performance Overlay Extension

In `src/newtab/core/perf-report.js`, the monospace floating HUD (`#perf-debug-overlay`) will append a dedicated "Storage" section:

```text
=======================
Homebase Perf
-----------------------
Summary
Ready: 42 ms
Paint: 48 ms
Storage: 8 ms
Performance: Off

Storage Health
Status: HEALTHY
Schema: v1 (Aligned)
Keys: 74/74 valid (0 corrupt)
Anomalies: 0 in buffer
Last Migration: Success (14 ms)

Startup Timeline
...
```

---

## 5. Section 4: Technical Specifications & Data Flow

### 5.1 Component Lifecycle & Event Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DIAGNOSTIC UI LIFECYCLE FLOW                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  1. User Clicks Settings Icon (#main-settings-btn)                                     │
│     │                                                                                  │
│     ▼                                                                                  │
│  2. dock-navigation.js loads settings.css and settings-ui.js (Lazy-Load Boundary)      │
│     │                                                                                  │
│     ▼                                                                                  │
│  3. SettingsUI.open() runs ensureSettingsSectionOrder()                                │
│     - Dynamically creates and mounts "Diagnostics" nav item & empty section panel      │
│     - Registers click listener for data-section="diagnostics"                          │
│     │                                                                                  │
│     ▼                                                                                  │
│  4. User Clicks "Diagnostics" Tab                                                      │
│     │                                                                                  │
│     ▼                                                                                  │
│  5. setActiveAppSettingsSection('diagnostics') triggers renderDiagnosticsSection()    │
│     │                                                                                  │
│     ▼                                                                                  │
│  6. Asynchronous Diagnostic Data Retrieval                                             │
│     - window.HomebaseDiagnostics.auditStorageHealth()                                  │
│     - window.HomebaseMigrations.getMigrationHistory()                                  │
│     - window.HomebaseDiagnostics.getValidationAnomalies()                              │
│     │                                                                                  │
│     ▼                                                                                  │
│  7. DOM Hydration                                                                      │
│     - Updates status badge (HEALTHY / DEGRADED / CORRUPTED)                            │
│     - Populates metric count cards                                                     │
│     - Renders anomaly list and migration logs                                          │
│     │                                                                                  │
│     ▼                                                                                  │
│  8. User Clicks [Copy Diagnostic Report]                                               │
│     - Invokes HomebaseDiagnostics.exportHealthReport()                                 │
│     - Button text toggles: "Copy Diagnostic Report" -> "Copied!" for 2.5 seconds       │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.2 Asynchronous Audit Orchestration & Cache Strategy

- **Audit Caching**: When opening the Diagnostics tab, the UI executes `auditStorageHealth()`. To prevent redundant storage reads during rapid tab switching within the same settings session, the audit result is cached in memory for **10 seconds** unless the user clicks "Run Health Check".
- **Non-Blocking UI**: During audit retrieval, a sleek, lightweight loading skeleton or subtle spinner is displayed, guaranteeing 60fps UI fluidity.
- **Fail-Safe Containment**: If storage access rejects or throws an error (e.g. extension context invalidated), the UI catches the error cleanly and displays a safe, helpful recovery message without breaking the settings modal.

---

### 5.3 Clipboard Export Protocol & Multi-Tier Fallback

The export action utilizes `HomebaseDiagnostics.exportHealthReport()`, which implements a reliable dual-tier clipboard write:

```javascript
async function handleExportReportClick(button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  const originalText = button.textContent;
  
  try {
    const result = await window.HomebaseDiagnostics.exportHealthReport();
    if (result && result.success) {
      button.textContent = 'Copied to Clipboard!';
      button.classList.add('is-success');
    } else {
      button.textContent = 'Copy Failed';
    }
  } catch (err) {
    button.textContent = 'Copy Error';
  } finally {
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('is-success');
      button.disabled = false;
    }, 2500);
  }
}
```

---

### 5.4 DOM Blueprint & Injection Protocol

The panel DOM will be constructed dynamically in `src/newtab/settings/settings-ui.js` following the pattern of `createPrivacySection()`:

```javascript
function createDiagnosticsNavItem() {
  const navItem = document.createElement('button');
  navItem.className = 'app-settings-nav-item';
  navItem.dataset.section = 'diagnostics';
  navItem.innerHTML = `
    <span class="nav-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
    </span>
    <span class="nav-label">Diagnostics</span>
  `;
  return navItem;
}

function createDiagnosticsSection() {
  const section = document.createElement('section');
  section.className = 'app-settings-section';
  section.dataset.section = 'diagnostics';
  
  // Structured inner markup containing header, status banner, metric grid,
  // action bar, collapsible accordion details, and privacy notice.
  return section;
}
```

---

### 5.5 CSS Design Tokens & Scoped Stylesheet Specification

The following styles will be appended to `src/newtab/styles/settings.css`:

```css
/* ===============================================
 * Homebase — Diagnostic UI & Debug Panel Styles
 * =============================================== */

.app-settings-diagnostic-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.app-settings-diagnostic-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.app-settings-diagnostic-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.app-settings-diagnostic-badge--healthy {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.app-settings-diagnostic-badge--degraded {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.app-settings-diagnostic-badge--corrupted {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.app-settings-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.app-settings-diagnostic-card {
  padding: 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-settings-diagnostic-card-value {
  font-size: 1.5em;
  font-weight: 800;
  color: #0f172a;
}

.app-settings-diagnostic-card-label {
  font-size: 0.85em;
  color: #64748b;
  font-weight: 600;
}

.app-settings-diagnostic-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-settings-diagnostic-notice {
  font-size: 0.85em;
  color: #64748b;
  line-height: 1.5;
  padding: 10px 14px;
  background: #f1f5f9;
  border-radius: 8px;
}
```

---

## 6. Section 5: Phased Implementation Sequence

The implementation of Cycle #6 will proceed across 5 strictly ordered phases:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYCLE #6 IMPLEMENTATION PHASES                            │
├─────────┬─────────────────────────┬────────────────────────────────────────────────────┤
│ Phase 1 │ CSS Scoped Stylesheet   │ Append scoped diagnostic tokens and classes        │
│         │                         │ to src/newtab/styles/settings.css                  │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 2 │ Settings UI Components  │ Implement createDiagnosticsNavItem() and           │
│         │                         │ createDiagnosticsSection() in settings-ui.js       │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 3 │ Event & Copy Bridge     │ Wire exportHealthReport() clipboard action and     │
│         │                         │ re-scan triggers in settings-ui.js                 │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 4 │ HUD Overlay Extension   │ Add storage health block to updatePerfOverlay()    │
│         │                         │ in src/newtab/core/perf-report.js                  │
├─────────┼─────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 5 │ Automated Unit Tests    │ Create tests/unit/diagnostic-ui.test.mjs           │
│         │ & Build Verification    │ Run 4-tier npm test harness & dual browser build   │
└─────────┴─────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 7. Section 6: Testing Strategy & Automated Suites

### 7.1 Automated 4-Tier Test Pipeline Verification

```powershell
# 1. Syntax Validation
node --check src/newtab/settings/settings-ui.js
node --check src/newtab/core/perf-report.js

# 2. Static Invariant Verification
node scripts/check-newtab-static.mjs

# 3. Algorithmic Unit Tests
node --test tests/unit/diagnostic-ui.test.mjs
npm.cmd test

# 4. Production Dual-Build Verification
npm.cmd run build
```

### 7.2 Manual Cross-Browser Verification Protocols

| Test Scenario | Chrome Protocol | Firefox Protocol | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **Settings Open** | Click gear icon | Click gear icon | Settings opens; Diagnostics nav item present |
| **Diagnostics Tab** | Click Diagnostics | Click Diagnostics | Health badge shows `HEALTHY`; counts match storage |
| **Clipboard Copy** | Click Copy Report | Click Copy Report | Button shows "Copied!"; clipboard contains report |
| **HUD Overlay** | Toggle Perf Overlay | Toggle Perf Overlay | On-screen overlay includes Storage section |
| **Privacy Check** | Inspect copied text | Inspect copied text | Zero URLs, bookmark titles, or todo texts found |

---

## 8. Section 7: Strict Implementation Prompt for Codex

```text
Task: Implement Homebase Improvement Cycle #6: Developer Debug Panel & Diagnostic UI System.

Follow AGENTS.md.

ADD:
- tests/unit/diagnostic-ui.test.mjs

REMOVE:
None

MODIFY:
- src/newtab/settings/settings-ui.js
- src/newtab/styles/settings.css
- src/newtab/core/perf-report.js

DO NOT MODIFY:
- src/new-tab.js
- src/preload.js
- src/instant_load.js
- src/new-tab.css
- manifests/manifest.chrome.json
- manifests/manifest.firefox.json
- src/assets/js/Sortable.min.js
- dist/*

Goal:
1. Dynamically inject a "Diagnostics" navigation tab into the Settings modal via ensureSettingsSectionOrder() in settings-ui.js.
2. Render a comprehensive diagnostic panel displaying storage health status badge, key statistics, schema alignment, recent validation anomalies, and migration history.
3. Wire a 1-click "Copy Diagnostic Report" button that invokes window.HomebaseDiagnostics.exportHealthReport() with animated "Copied!" feedback.
4. Enhance the Feedback section "Report Bug" card with a quick copy diagnostic action.
5. Extend the HUD performance overlay in perf-report.js with a compact storage health section.
6. Append scoped diagnostic CSS rules to settings.css.
7. Add comprehensive unit tests in tests/unit/diagnostic-ui.test.mjs.

Important:
- Zero runtime npm dependencies.
- Classic script compatibility; no ES modules.
- Lazy-load boundary preserved: diagnostic UI is only parsed/mounted when Settings is opened.
- Absolute privacy guarantees: no telemetry, no network calls, strict redaction of URLs and personal data.
- Read-only storage guarantee: diagnostics UI must never mutate browser.storage.local.

Script order:
No new script tags required in src/new-tab.html. All UI code resides inside lazy-loaded settings-ui.js and perf-report.js.

Testing limit:
Follow AGENTS.md. Run node --check, node scripts/check-newtab-static.mjs, npm.cmd test, and npm.cmd run build:chrome.

After editing, verify:
- 4/4 test stages pass.
- All unit tests pass (> 80 tests).
- Dual builds (Chrome and Firefox) compile cleanly.
- Static invariants pass with zero duplicate declarations.

Post-edit verification report required:
Include files changed, functions modified, variables changed, full final code blocks for modified functions, explanation, verification, build result, unverified items, and confirmation unrelated areas were not changed.
```
