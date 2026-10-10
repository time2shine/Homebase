# Architecture Decision Records (ADRs)

This directory records foundational architectural decisions made in Homebase. Each record explains the context, rationale, and consequences of a specific technical strategy.

---

## Decision Index

| ID | Title | Status | Date | Core Outcome |
|---|---|:---:|:---:|---|
| [ADR-001](#adr-001-classic-script-defer-scripts-over-bundleres-modules) | Classic `<script defer>` Scripts over Bundler/ES Modules | **Accepted** | May 2026 | Zero build step for source scripts, instant browser reload, classic global scope |
| [ADR-002](#adr-002-single-canonical-controller-ownership) | Single Canonical Controller Ownership | **Accepted** | Jun 2026 | Every subsystem has exactly one controller in `src/newtab/` |
| [ADR-003](#adr-003-unified-storage-facade--schema-versioning) | Unified Storage Facade & Schema Versioning | **Accepted** | Sep 2026 | `HomebaseStorage` abstracts Chrome/Firefox storage with migrations and health checks |
| [ADR-004](#adr-004-sortablejs-drag-and-drop-with-fallback-rendering) | SortableJS Drag-and-Drop with Fallback Rendering | **Accepted** | Oct 2026 | Cross-browser uniform drag physics via `forceFallback: true`, bypassing buggy native HTML5 D&D |
| [ADR-005](#adr-005-strict-7-step-collaborative-ai-development-lifecycle) | Strict 7-Step Collaborative AI Development Lifecycle | **Accepted** | Oct 2026 | `Audit → Plan → Approval → Implement → Verify → Commit → Push` engineering discipline |

---

## ADR Summaries

### ADR-001: Classic `<script defer>` Scripts over Bundler/ES Modules
- **Context**: Modern web development defaults to bundlers (Webpack, Vite, Rollup) and ES modules (`type="module"`).
- **Decision**: Homebase deliberately preserves classic `<script defer>` script execution without an intermediate bundler.
- **Rationale**:
  - Eliminates build overhead and compilation delay during local development; editing a file in `src/` instantly affects the browser upon extension reload.
  - Browser extension background contexts and content scripts have strict CSP and module-loading constraints in MV3.
  - Classic deferred scripts provide deterministic sequential evaluation with minimal memory footprint.
- **Consequences**:
  - Requires disciplined declaration isolation to avoid top-level lexical identifier collisions.
  - Requires static verification toolchain (`scripts/check-newtab-static.mjs`).

---

### ADR-002: Single Canonical Controller Ownership
- **Context**: `src/new-tab.js` was historically a monolith of over 4,300 lines with high coupling between bookmarks, wallpaper, and search.
- **Decision**: Refactor all domain responsibilities into dedicated controllers under `src/newtab/<domain>/` with a single canonical owner per subsystem.
- **Rationale**:
  - Clear boundaries make subsystems testable, auditable, and resilient.
  - Allows `src/new-tab.js` to become a pure startup coordinator.
- **Consequences**:
  - Modules expose clean window interfaces (`window.Homebase<Name>Controller`).
  - Temporary backward-compatibility bridges are maintained during phased extractions.

---

### ADR-003: Unified Storage Facade & Schema Versioning
- **Context**: `browser.storage.local` differences between Chrome and Firefox, lack of transactional batching, and risk of data loss during schema evolutions.
- **Decision**: Centralize all storage operations behind `HomebaseStorage` (`src/newtab/core/storage-service.js`) with an explicit `schemaVersion` key.
- **Rationale**:
  - Provides a single point for schema migrations and data integrity validation.
  - Enables asynchronous batch persistence (`setMany`) and health diagnostics.
- **Consequences**:
  - Direct calls to `browser.storage.local` across components are deprecated in favor of `HomebaseStorage`.

---

### ADR-004: SortableJS Drag-and-Drop with Fallback Rendering
- **Context**: HTML5 native drag-and-drop behaves inconsistently across Chromium and Gecko, particularly with ghost images, drop targets, and pointer coordinates.
- **Decision**: Adopt SortableJS (`Sortable.min.js`) configured with `forceFallback: true` and `fallbackOnBody: true`.
- **Rationale**:
  - Simulates drag movements using pointer events, guaranteeing identical behavior across Chrome, Firefox, and touch devices.
  - Eliminates browser-specific drag-image clipping bugs.
- **Consequences**:
  - Centralized in `HomebaseBookmarkDragController` (`bookmark-drag-controller.js`).

---

### ADR-005: Strict 7-Step Collaborative AI Development Lifecycle
- **Context**: Autonomous AI agents risk scope creep, accidental regressions, and breaking protected boot files when making unconstrained edits.
- **Decision**: Mandate a strict 7-phase sequence for all AI contributions:
  $$\text{Audit} \longrightarrow \text{Plan} \longrightarrow \text{Approval} \longrightarrow \text{Implement} \longrightarrow \text{Verify} \longrightarrow \text{Commit} \longrightarrow \text{Push}$$
- **Rationale**:
  - Enforces thorough verification before every commit.
  - Preserves owner control at critical gate boundaries (plan approval, commit staging, remote push).
- **Consequences**:
  - High traceability with dedicated plan documents and verification reports.
