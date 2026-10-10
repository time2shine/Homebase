# Homebase System Architecture Documentation

This directory contains permanent architectural specifications, runtime execution models, and domain boundaries governing the Homebase extension.

---

## Architecture Documents

- **[`ARCHITECTURE.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/architecture/ARCHITECTURE.md)**: The living system architecture specification.
  - Subsystem interaction diagrams (Mermaid).
  - `<script defer>` execution mechanics and global lexical scope collision invariants.
  - Subsystem domain ownership: Bookmark, Storage, Wallpaper, Core Runtime.
  - Progressive monolith deconstruction roadmap (4,341 lines $\to$ < 400 lines).
  - Dual-browser compatibility matrix (Chromium vs Gecko).

---

## Architectural Principles

1. **Single Canonical Controller Ownership**: Every functional domain is owned by exactly one controller in `src/newtab/`.
2. **Zero-Bundler Classic Scripts**: Maintained via deterministic deferred script order in `src/new-tab.html`.
3. **Strict Boot Contract**: Synchronous preloading via `preload.js` guarantees instant theme and cached UI rendering before async operations complete.
