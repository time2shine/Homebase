# Homebase Development Cycles

This directory tracks the development cycles for Homebase. Each cycle breaks complex architectural refactoring and feature delivery into disciplined phases following the mandatory 7-step lifecycle:

$$\text{Audit} \longrightarrow \text{Plan} \longrightarrow \text{Approval} \longrightarrow \text{Implement} \longrightarrow \text{Verify} \longrightarrow \text{Commit} \longrightarrow \text{Push}$$

---

## Cycles Index

| Cycle | Name / Focus | Phases | Status | Milestone Release |
|:---:|---|:---:|:---:|:---:|
| [**Cycle 13**](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/) | **Monolith Deconstruction & Core Startup Architecture** | Phase 1–6 | **Active** (Phase 1 Complete) | Target: v0.18.0 |
| [**Cycle 12**](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-12/) | **Bookmark Drag & Drop Decoupling** | Phase 1–5 | **Completed** | [v0.17.0](file:///c:/Users/Administrator/Desktop/Homebase/docs/releases/v0.17.0/) |
| [**Cycle 11**](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-11/) | **Modularization & Architecture Foundations** | Phase 1–5 | **Completed** | [v0.16.0](file:///c:/Users/Administrator/Desktop/Homebase/docs/releases/v0.16.0/) |

*(For historical Cycles 1 through 10, see the [Documentation Archive](file:///c:/Users/Administrator/Desktop/Homebase/docs/archive/cycles-1-10/)).*

---

## Phase Organization Standard

Within each cycle, documents are organized by phase:
```text
docs/cycles/cycle-XX/
├── README.md                 # Cycle roadmap, baseline metrics, and status table
├── phase-1/                  # Phase 1: Audit & Discovery
├── phase-2/                  # Phase 2: Design & Foundation
├── phase-3/                  # Phase 3: Implementation & Checkpoints
└── ...
```
