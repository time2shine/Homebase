# Homebase Cycle #11 Phase 5 — Final new-tab.js Architecture Audit

**Date:** October 7, 2026  
**Scope:** Architecture and responsibility audit of `src/new-tab.js` after Cycle #11 Phase 5 extractions  
**Rules Applied:** No edits, no code changes, no commit, no push.  

---

## 1. Executive Summary & Current Metrics

Throughout Cycle #11 Phase 5, `src/new-tab.js` underwent systematic modularization:
- **Starting Line Count (Pre-Cycle #11):** ~4,341 lines
- **Current Line Count:** **1,799 lines**
- **Net Reduction:** **~2,542 lines removed (>58.5% reduction)**
- **Modules Established under `src/newtab/`:** 42 extracted modules across `core/`, `settings/`, `bookmarks/`, `search/`, `widgets/`, `wallpaper/`, and `integrations/`.
- **Current Test Status:** 367/367 unit tests passing across all 4 validation stages. Static declaration collision checks verify 911 unique top-level declarations with zero collisions across 62 deferred scripts.

The legacy monolith `src/new-tab.js` is now predominantly an **orchestration, idle task scheduling, and startup sequencing coordinator**. The only remaining major domain business logic block is SortableJS Drag & Drop.

---

## 2. Line Count & Responsibility Breakdown

| Line Range | Subsystem / Responsibilities | Line Count | Classification |
|---|---|:---:|:---:|
| **1–24** | Global Element & API Handles (`browser`, `#google-apps-panel`, `#search-results-panel`, `#bookmark-tabs-track`) | ~24 | **KEEP / DO NOT EXTRACT** |
| **25–323** | **Idle Task Scheduler Runtime** (`runWhenIdle`, `scheduleIdleTask`, `scheduleIdleChunkedTask`, `processIdleTasks`, `STARTUP_IDLE_LABELS`) | ~299 | **KEEP (High-Risk Protected)** |
| **327–391** | **Wallpaper Startup Boot Priming** (IIFE `primeWallpaperBackground`, reads rotation state, applies initial poster before DOM ready) | ~65 | **KEEP (High-Risk Protected)** |
| **395–404** | Responsive dock listener & tabs scroll initialization | ~10 | **DO NOT EXTRACT (Glue)** |
| **406–442** | Pointermove throttle loop for active grid dragging | ~37 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **446–505** | Drag globals & state (`gridSortable`, `tabsSortable`, `isGridDragging`, `isTabDragging`, `activeTabDropTarget`, hover delay) | ~60 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **524–541** | Favicon observer bridges & in-memory metadata handles | ~18 | **DO NOT EXTRACT (Glue / Bridges)** |
| **557–650** | **SortableJS Grid Setup** (`setupGridSortable`) | ~94 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **663–759** | Folder hover lock & visual feedback (`handleGridMove`) | ~97 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **763–843** | Tab hover highlighting (`handleGridDragPointerMove`, `clearTabDropHighlight`) | ~81 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **855–994** | **Grid Drop Execution** (`moveItemInLocalTree`, `handleGridDrop` for folder drop and grid reordering via `browser.bookmarks.move`) | ~140 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **1000–1088** | **SortableJS Folder Tabs Setup** (`setupTabsSortable`) | ~89 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **1092–1220** | **Tab Drop Execution** (`handleTabDrop` for tab reordering via `browser.bookmarks.move`) | ~129 | **EXTRACT CANDIDATE (Drag Subsystem)** |
| **1222–1286** | **Bookmark Loader Backward Compatibility Bridges** (`processBookmarks`, `loadBookmarks`, `loadBookmarkMetadata`, etc.) | ~65 | **DO NOT EXTRACT (Compatibility Bridges)** |
| **1288–1305** | Search element references & comment markers | ~18 | **DO NOT EXTRACT (Glue)** |
| **1307–1735** | **Core Startup Orchestrator (`initializePage`)** (Storage parallel loading, settings sync, modal initialization, `markPageReadyOnce`, hydration safe wrappers) | ~429 | **KEEP (Core Orchestrator)** |
| **1739–1764** | Storage Dispatcher Integration (`handleNewTabStorageChange`, `HomebaseStorageDispatcher.initialize`) | ~26 | **DO NOT EXTRACT (Glue / Router Hook)** |
| **1766–1800** | DOM Lifecycle Entry Point (`DOMContentLoaded`, `window.load`, `initializePage()` call, `updateDynamicAccent`) | ~35 | **KEEP (Entry Point)** |

---

## 3. Classification of Remaining Major Sections

### Category A: KEEP (Do Not Touch)
These sections represent the core identity and responsibility of `src/new-tab.js` as the application bootstrapper:
1. **Startup Orchestration (`initializePage`) [Lines 1322–1735]:**
   - Coordinates parallel storage loads (`Promise.allSettled`).
   - Sequences non-blocking visual hydration.
   - Executes the critical `markPageReadyOnce` flip (`b.classList.remove('preload'); b.classList.add('ready')`).
   - Schedules deferred background idle tasks (`scheduleStartupHydrationTasks`).
   - *Rationale:* Protected explicitly in `AGENTS.md` ("Leave initializePage in src/new-tab.js unless explicitly requested. Leave startup orchestration in src/new-tab.js unless explicitly requested").
2. **Idle Task Scheduler [Lines 25–323]:**
   - Implements time-sliced cooperative scheduling (`IDLE_TASK_BUDGET_MS = 12`) to prevent UI jank during initial render.
   - Manages task queues, task resumption, and promise resolution under `requestIdleCallback`.
   - *Rationale:* Protected in `AGENTS.md` ("Leave idle scheduler logic in src/new-tab.js unless explicitly requested").
3. **Wallpaper Startup Boot Priming [Lines 327–391]:**
   - Runs immediately at script parse time to read synchronous storage mirrors and set the fallback poster before first frame paint.
   - Prevents visual flicker/white flash on new tab load.
   - *Rationale:* Protected in `AGENTS.md` ("wallpaper/video/cache/startup path").
4. **Lifecycle Coordination & DOM Entry Point [Lines 1766–1800]:**
   - Manages `DOMContentLoaded`, debug load markers, calls `initializePage()`, and triggers dynamic accent color adjustments.

---

### Category B: EXTRACT CANDIDATES (For Future Cycles)
The only cohesive domain business logic remaining in `src/new-tab.js` is the **SortableJS Drag-and-Drop Subsystem**:

#### Candidate: Bookmark & Folder Tab Drag-and-Drop Controller
- **Lines:** 406–442, 462–505, 557–1220 (**~815 lines total**)
- **Responsibilities:**
  - Initializing `Sortable.create` on `#bookmarks-grid` and `#bookmark-folder-tabs`.
  - Managing pointer move throttling and folder tab drop hover states (`.drop-target`).
  - Handling drag hover delay locking (`FOLDER_HOVER_DELAY_MS`) to prevent disruptive grid shifts.
  - Optimistic in-memory tree mutation (`moveItemInLocalTree`).
  - Moving items between folders via `browser.bookmarks.move({ parentId })`.
  - Reordering bookmarks and folder tabs via `browser.bookmarks.move({ index })`.
  - Syncing moves with the virtual grid (`syncVirtualizerMove`).
- **Destination Module:** `src/newtab/bookmarks/bookmark-drag-controller.js`
- **Why Extraction Improves Architecture:**
  - Extracts the largest remaining non-orchestration block in `new-tab.js`.
  - Reduces `src/new-tab.js` from 1,799 lines to under 1,000 lines (~984 lines).
  - Isolates third-party SortableJS dependency interactions to a dedicated bookmark domain controller.
- **Risk Level:** **HIGH**
  - Explicitly flagged as high-risk in `AGENTS.md` ("drag and reorder behavior").
  - Interacts directly with live DOM Sortable instances, Firefox and Chrome `browser.bookmarks.move` APIs, drag fallback ghosts, and virtual grid item synchronization.
  - Requires dedicated planning, extensive manual browser verification in Chrome and Firefox, and isolated unit test harnesses.

---

### Category C: DO NOT EXTRACT (Wiring, Glue & Compatibility)
1. **Bookmark Loader Compatibility Bridges [Lines 1222–1286] (~65 lines):**
   - `processBookmarks`, `loadBookmarks`, `loadBookmarkMetadata`, `loadFolderMetadata`, `loadLastUsedFolderId`, `setLastUsedFolderId`.
   - *Rationale:* These are thin 5-line wrappers delegating to `window.HomebaseBookmarkLoader` while maintaining global function references for legacy callers. Extracting them would only move boilerplate without architectural benefit.
2. **Context Menu Initializer Wiring [Lines 1694–1714] (~20 lines):**
   - Passes callbacks to `HomebaseContextMenuController.initialize({...})`.
   - *Rationale:* This is standard dependency injection glue at startup.
3. **Storage Dispatcher Router Hook [Lines 1739–1764] (~25 lines):**
   - Subscribes `new-tab.js` to wallpaper selection changes and `lastUsedBookmarkFolderId` updates.
   - *Rationale:* Thin subscription handler connecting the application bootstrapper to `HomebaseStorageDispatcher`.

---

## 4. Current State of Boundaries & Ownership

### Remaining Event Listeners in `src/new-tab.js`:
1. `window.addEventListener('pointermove', ...)` [Line 416]: Throttles pointer coordinates to `requestAnimationFrame` during active grid drag.
2. `document.addEventListener('DOMContentLoaded', ...)` [Line 1766]: Triggers `renderTipOfDay()` and `initAddonStoreDockLink()`.
3. `window.addEventListener('load', ...)` [Line 1778]: Performance benchmark timing mark (when `DEBUG_STARTUP_PERF` is enabled).
4. *Sortable Callbacks:* `onStart`, `onEnd`, `onMove`, `onClone` inside `setupGridSortable` and `setupTabsSortable`.

*(Note: Click delegation on `#bookmarks-grid` has been 100% removed and resides in `bookmark-grid-controller.js`.)*

### Remaining DOM Ownership in `src/new-tab.js`:
- Query selectors for panels (`#google-apps-panel`, `#search-results-panel`, `#search-form`, `#bookmark-tabs-track`).
- Document `body` classes:
  - Preload flip: `body.classList.remove('preload'); body.classList.add('ready')`.
  - Dragging classes: `body.classList.add('is-dragging-active')`, `body.classList.add('is-tab-dragging')`.
- Drop highlight classes: `.drop-target` on folder tabs, `.drag-over` on folder tiles.

### Remaining Global Bridges in `src/new-tab.js`:
- `window.browser` (browser extension API shim).
- `window.isGridDragging` (getter/setter bridge for modular drag awareness).
- `window.ensureFaviconObserver`, `window.getDomainKeyFromUrl`, `window.getFaviconUrlForRawUrl`, `window.resolveFaviconForImageTarget` (Favicon pipeline bridge).
- `window.loadBookmarks`, `window.processBookmarks`, `window.loadBookmarkMetadata`, `window.loadFolderMetadata`, `window.loadLastUsedFolderId`, `window.setLastUsedFolderId` (Bookmark loader bridge).
- `window.lastUsedBookmarkFolderId` (synchronized across storage events).

---

## 5. Final Recommendation

### **Recommendation: STOP refactoring and move to the next development phase (Cycle #12)**

### Key Factors Supporting This Decision:
1. **Cycle #11 Goals Completely Satisfied:**
   - Checkpoint 14-A (Search Setup Ownership): Completed, verified, pushed.
   - Checkpoint 14-B (Quick Actions DOM Ownership): Completed, verified, pushed.
   - Checkpoint 14-C (Architecture Audit): Completed.
   - Checkpoint 14-D-A (Storage Dispatcher Foundation): Completed, verified, pushed.
   - Checkpoint 14-D-B (Bookmark Storage Ownership): Completed, verified, pushed.
   - Checkpoint 14-E (Bookmark Grid Click Delegation): Completed, verified, pushed.
2. **Current Monolith Health:**
   - `src/new-tab.js` has reached a stable, well-organized state at 1,799 lines (down from 4,341 lines).
   - What remains in `new-tab.js` is **strictly startup orchestration, idle scheduling, and Sortable drag-and-drop**.
3. **High-Risk Boundary for Remaining Logic:**
   - The remaining ~815 lines of drag/drop logic represent the highest-risk runtime subsystem in Homebase (`AGENTS.md` explicitly flags drag/reorder as a high-risk area).
   - Tackling drag/drop requires dedicated, isolated cycle planning (Cycle #12), comprehensive test harnesses for SortableJS events, and extensive dual-browser manual verification in Chrome and Firefox.
   - It should NOT be rushed as an incremental checkpoint of Cycle #11 Phase 5.
4. **Clean Baseline:**
   - All 367 automated tests pass (100% green).
   - Chrome build and Firefox build pass with zero errors.
   - Zero diff against protected files.
   - Remote repository is fully synchronized on `origin/development`.

---

## 6. Next Steps for Cycle #12 Planning

If the owner chooses to proceed with further modularization in Cycle #12, the recommended roadmap is:
1. **Cycle #12 Phase 1 (Audit & Plan):**
   - Create `docs/202-cycle12-phase1-bookmark-drag-audit.md`.
   - Analyze SortableJS lifecycle, optimistic tree mutations, and virtualizer move synchronization.
2. **Cycle #12 Phase 2 (Grid Drag Extraction):**
   - Extract `setupGridSortable`, `handleGridMove`, and `handleGridDrop` into `src/newtab/bookmarks/bookmark-drag-controller.js`.
3. **Cycle #12 Phase 3 (Tabs Drag Extraction):**
   - Extract `setupTabsSortable` and `handleTabDrop` into `src/newtab/bookmarks/bookmark-drag-controller.js`.
4. **Cycle #12 Phase 4 (Final Cleanup):**
   - Reduce `src/new-tab.js` below 1,000 lines, finalizing its transition to a pure bootstrapper and orchestrator.
