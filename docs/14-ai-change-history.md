# Homebase — AI-Assisted Development Change Ledger

> **Author**: Product Architect & AI Operations Engineer  
> **Date**: 2026-09-25  
> **Scope**: Standardized change tracking system and governance ledger for all AI-assisted modifications, code extractions, refactors, documentation updates, and prompt-driven engineering workflows  
> **Authority**: This document supplements [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/08-development-guidelines.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md), and [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md). Every autonomous or paired AI session that alters files in this repository must record an entry in this ledger.  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/08-development-guidelines.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md), [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md)

---

## Table of Contents

1. [Purpose & Operational Governance](#1-purpose--operational-governance)
2. [AI Accountability & Logging Invariants](#2-ai-accountability--logging-invariants)
3. [Canonical AI Change Entry Template](#3-canonical-ai-change-entry-template)
4. [Field Specification & Verification Standards](#4-field-specification--verification-standards)
5. [Human Review & Acceptance Protocols](#5-human-review--acceptance-protocols)
6. [AI Change History Ledger (Active Log)](#6-ai-change-history-ledger-active-log)

---

## 1. Purpose & Operational Governance

Homebase leverages Advanced Agentic Coding and AI-assisted workflows (including Google Antigravity, VS Code Codex, Claude Opus, and Gemini) for modular code extraction, static analysis, performance optimization, and architectural documentation.

Because AI coding agents execute autonomous actions, edit multiple files in sequence, and propose code refactors across sessions, **maintaining rigorous provenance over AI contributions is mandatory**.

The purpose of this ledger is to:
1. **Track Provenance**: Maintain a permanent record of which AI model, version, and prompt produced every modification.
2. **Prevent Regression & Hallucination**: Ensure all AI-generated code conforms strictly to [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) (no bundlers, no ES modules, classic `<script defer>`, zero new runtime dependencies).
3. **Audit Prompt Evolution**: Preserve the original user intent, prompt constraints, and instructions that guided the AI session.
4. **Enforce Human Oversight**: Ensure every AI modification undergoes human engineering review and explicit sign-off before production release.

---

## 2. AI Accountability & Logging Invariants

All AI agents and paired developers must adhere to the following binding rules:

1. **Mandatory Logging**: Any AI session that creates, modifies, or deletes files (including code, configuration, scripts, or documentation) must log an entry in Section 6 before completing the task.
2. **Zero Fabricated Entries**: Never generate placeholder, mock, or hypothetical change entries. Only log verified, completed modifications.
3. **Exact Model Identification**: Record the exact model identifier and IDE/agent platform (e.g., `Gemini 3.8 Flash (Antigravity)`, `Claude Opus 4.6 (VS Code Codex)`). Avoid generic descriptors like "AI" or "LLM".
4. **Verifiable Test Output**: The `Testing:` field must document actual command executions and exit codes. Fabricating test passes is grounds for rejecting the change.
5. **Human Review Sign-Off**: An entry is marked `Pending Human Review` upon creation. A human maintainer must review the diff, test the extension in a browser, and update the status to `Approved` or `Rejected`.
6. **Reverse-Chronological Ordering**: New entries must be prepended at the top of [Section 6: AI Change History Ledger](#6-ai-change-history-ledger-active-log).

---

## 3. Canonical AI Change Entry Template

When logging an AI-assisted modification, copy the block below and prepend it directly under [Section 6: AI Change History Ledger](#6-ai-change-history-ledger-active-log):

```markdown
### Entry [YYYY-MM-DD-NN]: <Concise Title of AI Modification>

- **Date**: YYYY-MM-DD (e.g., 2026-09-25)
- **AI Model**: <Exact Model Name, Version & Platform, e.g., Gemini 3.8 Flash (Antigravity)>
- **Task**: <High-level task or objective requested by the user>
- **Prompt summary**: <Concise summary of the user prompt, constraints, and instructions>
- **Files changed**:
  - `path/to/modified-file.js` (Modified: <summary of specific function or logic changed>)
  - `path/to/new-file.js` (Added: <purpose of new file>)
  - `path/to/deleted-file.js` (Deleted: <reason for deletion>)
- **Reason**: <Why the change was needed; user requirement, bug fix, or architectural roadmap goal>
- **Testing**:
  - `node --check <file>`: <Exit code / Pass status>
  - `node scripts/check-newtab-static.mjs`: <Exit code / Pass status>
  - `node scripts/smoke-newtab-file.mjs`: <Exit code / Pass status>
  - `npm.cmd run build`: <Exit code / Pass status>
  - Manual browser pass: <Browser tested, console error status, UI verification>
- **Human review**:
  - Reviewer: <Maintainer Name or Pending>
  - Status: Pending Human Review | Approved | Changes Requested | Rejected
  - Review Date: YYYY-MM-DD (or Pending)
  - Notes: <Feedback, verification observations, or merge sign-off notes>

---
```

---

## 4. Field Specification & Verification Standards

To ensure uniformity and audit compliance, all fields must adhere to the following specifications:

### 4.1 Date
- **Format**: ISO 8601 calendar date (`YYYY-MM-DD`), e.g., `2026-09-25`.
- **Requirement**: Must reflect the timestamp when the AI completed the work and ran tests.

### 4.2 AI Model
- **Format**: `<Model Name> <Version> (<Platform / Harness>)`
- **Examples**:
  - `Gemini 3.8 Flash (Antigravity)`
  - `Claude Opus 4.6 (VS Code Codex)`
  - `Claude Sonnet 3.7 (Antigravity)`
  - `GPT-4o (GitHub Copilot)`

### 4.3 Task
- **Format**: Concise statement of work.
- **Example**: *"Extract search suggestion engine into dedicated first-party module `src/newtab/search/suggestions.js`."*

### 4.4 Prompt summary
- **Format**: Multi-line or bulleted summary capturing the user's primary prompt.
- **Content**: Include key constraints given in the prompt (e.g., *"Do not convert to ES modules; preserve `<script defer>` order; do not touch bookmark logic; run static checks"*).

### 4.5 Files changed
- **Format**: Markdown links with explicit change classifications (`Added`, `Modified`, `Deleted`, `Renamed`).
- **Standard**: Every modified file must have a one-sentence summary of what was touched.
- **Constraint**: Must never include files in `dist/` or `node_modules/`.

### 4.6 Reason
- **Format**: Technical justification.
- **Content**: Link the work to user requests, bugs, [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md), or decisions in [docs/09-architecture-decisions.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/09-architecture-decisions.md).

### 4.7 Testing
- **Format**: Exact list of verification commands executed by the AI agent during the session.
- **Content**: Must report command names and exit outcomes. If browser testing was performed via automated harness or manual dev load, state the exact results.

### 4.8 Human review
- **Format**: Structured review metadata block.
- **Statuses**:
  - `Pending Human Review`: Default status when authored by an AI agent.
  - `Approved`: Human maintainer verified code diff and tested extension.
  - `Changes Requested`: Maintainer found defects or style violations requiring another AI turn.
  - `Rejected`: Change reverted or discarded due to violation of project invariants.

---

## 5. Human Review & Acceptance Protocols

Before an AI-generated change is merged into `main` or included in a release build, the human maintainer must execute the following review checklist:

### Human Review Checklist
1. **Constraint Check**:
   - [ ] No ES module syntax introduced (`import` / `export` in browser runtime scripts).
   - [ ] No npm packages or third-party runtime dependencies added.
   - [ ] No bundler or minifier configuration added.
   - [ ] Script order in `src/new-tab.html` remains dependency-safe (providers load first).
2. **Security & Scope Check**:
   - [ ] No unvetted network requests or unauthorized host permissions added.
   - [ ] No unsanitized `innerHTML` insertions with user-controlled data.
   - [ ] Scope strictly matches the user's prompt (zero unrelated refactoring or broad formatting).
3. **Execution Check**:
   - [ ] Run `npm.cmd run build:chrome` and `npm.cmd run build:firefox`.
   - [ ] Load `dist/chrome` in Google Chrome; check Console for zero errors on new tab load.
   - [ ] Load `dist/firefox` in Mozilla Firefox; verify container and bookmark behavior.
4. **Ledger Update**:
   - [ ] Update `Human review` field in this document to `Approved` with reviewer initials and date.

---

## 6. AI Change History Ledger (Active Log)

<!--
  PREPEND NEW ENTRIES HERE.
  Follow the template format from Section 3.
  Keep entries ordered reverse-chronologically (newest at top).
-->

*(No AI modifications recorded yet. The tracking system is active and ready for future AI-assisted engineering changes.)*
