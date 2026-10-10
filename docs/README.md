# Homebase Documentation Portal

Welcome to the Homebase documentation repository. This directory organizes the technical, operational, and architectural knowledge for the Homebase browser extension.

---

## Documentation Architecture

The documentation is organized into clear functional domains to maintain high maintainability, traceability, and speed of navigation:

```text
docs/
├── README.md                 # Master documentation portal (this file)
├── architecture/             # Permanent system architectural specifications
│   ├── README.md             # Architecture overview & index
│   └── ARCHITECTURE.md       # Living system architecture & execution model
├── decisions/                # Architecture Decision Records (ADRs)
│   └── README.md             # ADR index & full decision summaries (ADR-001–005)
├── cycles/                   # Phased engineering cycles
│   ├── README.md             # Master cycle tracking index
│   ├── cycle-11/             # Cycle 11: Modularization & Architecture Foundations
│   ├── cycle-12/             # Cycle 12: Bookmark Drag & Drop Decoupling
│   └── cycle-13/             # Cycle 13: Monolith Deconstruction & Boot Orchestration
├── releases/                 # Release verification & publication packages
│   ├── README.md             # Release history index
│   ├── v0.16.0/              # Version 0.16.0 release artifacts & verification
│   └── v0.17.0/              # Version 0.17.0 release artifacts & verification
└── archive/                  # Historical records & completed cycle ledgers
    ├── README.md             # Archive directory index
    └── cycles-1-10/          # Historical documentation and Cycles 1 through 10
```

---

## Directory Index

| Section | Location | Description |
|---|---|---|
| **System Architecture** | [`docs/architecture/`](file:///c:/Users/Administrator/Desktop/Homebase/docs/architecture/) | Detailed component architecture, data flow diagrams, `<script defer>` execution model, and controller ownership boundaries. |
| **Decision Records** | [`docs/decisions/`](file:///c:/Users/Administrator/Desktop/Homebase/docs/decisions/) | Accepted architectural decision records (ADRs) documenting technical context, trade-offs, and consequences. |
| **Development Cycles** | [`docs/cycles/`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/) | Granular plans, audits, implementation reports, and verification logs grouped by cycle and phase. |
| **Releases** | [`docs/releases/`](file:///c:/Users/Administrator/Desktop/Homebase/docs/releases/) | Production release preparation reports, GitHub release notes, ZIP asset checklists, and publication proofs. |
| **Archive** | [`docs/archive/`](file:///c:/Users/Administrator/Desktop/Homebase/docs/archive/) | Completed legacy documents and Cycles 1–10 records preserved for history. |

---

## Key References & Governance

- **AI Agent Guidelines**: [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) — 7-step development lifecycle, canonical controller ownership, protected boot files, and verification standards.
- **Project Knowledge Base**: [`PROJECT_CONTEXT.md`](file:///c:/Users/Administrator/Desktop/Homebase/PROJECT_CONTEXT.md) — High-level project mission, dual-browser target, testing strategy, and directory layout.
- **Active Cycle Tracker**: [`docs/cycles/cycle-13/README.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/README.md) — Current development roadmap targeting `< 400` lines for `src/new-tab.js`.
