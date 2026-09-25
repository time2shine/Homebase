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

*(No maintenance entries recorded yet. The ledger is ready for future engineering entries.)*
