# Phase 5 Checkpoint 2 Architecture Audit

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Checkpoint**: Checkpoint 2 — Responsive Layout & Sidebar/Dock Collapse Extraction  
**Date**: October 1, 2026  
**Status**: Completed — Awaiting Owner Approval  

---

## Current Responsive/Layout State

An in-depth architecture audit of [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) was conducted to identify all responsive layout, viewport sizing, collapse threshold, and resize event handling responsibilities.

### 1. Responsibilities Found in `src/new-tab.js`

1. **Top-Level DOM Selectors** (Lines 27–33):
   - `const sidebar = document.querySelector('.sidebar');`
   - `const collapsedClockSlot = document.getElementById('collapsed-clock-slot');`
   - `const timeWidget = document.querySelector('.widget-time');`
   - `const dock = document.querySelector('.dock');` *(Dead code: never read or referenced anywhere in `src/new-tab.js`)*.

2. **Collapse Threshold Constants** (Lines 70–72):
   - `const SIDEBAR_COLLAPSE_RATIO = 0.49;`
   - `const DOCK_COLLAPSE_RATIO = 0.32;`

3. **Core Responsive Collapse Function** (Lines 547–595, ~48 lines):
   - `function updateSidebarCollapseState()`:
     - Reads preference: `document.body.classList.contains('sidebar-hidden')`.
     - Calculates viewport width ratio against screen available width:
       ```javascript
       const referenceWidth = (window.screen && window.screen.availWidth) ? window.screen.availWidth : window.innerWidth;
       const widthRatio = window.innerWidth / referenceWidth;
       ```
     - Computes conditions:
       - `shouldCollapseSidebar = !sidebarHiddenPref && widthRatio <= SIDEBAR_COLLAPSE_RATIO`
       - `shouldCollapseDock = widthRatio <= DOCK_COLLAPSE_RATIO`
     - Toggles body classes:
       - `document.body.classList.toggle('sidebar-collapsed', shouldCollapseSidebar)`
       - `document.body.classList.toggle('dock-collapsed', shouldCollapseDock)`
     - Dynamic clock relocation:
       - If collapsed: relocates `timeWidget` (`.widget-time`) into `collapsedClockSlot` (`#collapsed-clock-slot`).
       - If expanded: restores `timeWidget` into `sidebar` (`.sidebar.firstElementChild` or append).

4. **Resize Event Debouncer & Lifecycle** (Lines 599–612, ~14 lines):
   - `const debouncedResize = debounce(() => { updateSidebarCollapseState(); updateBookmarkTabOverflow(); }, 100);`
   - `window.addEventListener('resize', debouncedResize);`
   - `window.addEventListener('beforeunload', () => { debouncedResize.cancel?.(); });`

5. **Initial Script-Evaluation Calls** (Lines 616–618):
   - `updateSidebarCollapseState();`
   - `updateBookmarkTabOverflow();`

---

## Extraction Candidates

### Primary Destination: `src/newtab/core/dock-navigation.js`

| Dimension | Details |
|---|---|
| **File Path** | [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) |
| **Current Line Count** | 145 lines (4,478 bytes) |
| **Current Domain** | Dock item clicks (`bookmarks`, `history`, `downloads`, `extensions`), store links, lazy settings button wiring. |
| **Architectural Fit** | **High**. Dock collapse (`body.dock-collapsed .dock`) and sidebar collapse directly relate to the dock's presence and the dock's clock relocation boundary. Consolidating responsive collapse into `dock-navigation.js` avoids introducing a new file or modifying `src/new-tab.html` script tags. |
| **Controller Export** | Expose `window.HomebaseDockNavigation` (or `window.HomebaseDockNavigationController`) along with legacy compatibility bridge `window.updateSidebarCollapseState`. |

---

## Dependency Analysis

1. **Script Order in `src/new-tab.html`**:
   - Line 3328: `newtab/core/utils.js` (provides `debounce`)
   - Line 3339: `newtab/bookmarks/bookmark-tabs-scroll.js` (provides `updateBookmarkTabOverflow`)
   - Line 3343: `newtab/widgets/widget-visibility.js` (calls `updateSidebarCollapseState()` on preference changes)
   - Line 3346: `newtab/core/dock-navigation.js` (destination)
   - Line 3380: `newtab/settings/settings-preferences.js` (calls `applySidebarVisibility`)
   - Line 3401: `new-tab.js` (final runtime script)

2. **Availability of Dependencies**:
   - `debounce` is defined in `utils.js` and is already in the global lexical scope when `dock-navigation.js` executes.
   - `updateBookmarkTabOverflow` is defined in `bookmark-tabs-scroll.js` and is in the global lexical scope.
   - When `dock-navigation.js` defines `updateSidebarCollapseState`, any subsequent calls from `widget-visibility.js` or `settings-preferences.js` resolve cleanly without timing races.

3. **DOM Element Resolution**:
   - Deferred scripts execute after HTML parsing is complete. All relevant DOM surfaces (`.sidebar`, `#collapsed-clock-slot`, `.dock`, `.widget-time`) exist in the initial document markup.
   - Lazy DOM querying or cached lookups with null guards will ensure stability across test harnesses and browser runtimes.

---

## Recommended Migration Plan

### Step 1: Destination Implementation ([`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js))
1. Move constants:
   - `SIDEBAR_COLLAPSE_RATIO = 0.49;`
   - `DOCK_COLLAPSE_RATIO = 0.32;`
2. Implement:
   - `updateSidebarCollapseState()`
   - `setupResponsiveLayoutListener()` (encapsulating `debouncedResize`, `window.addEventListener('resize', ...)`, and `beforeunload` cleanup)
3. Expose controller interface:
   - `window.HomebaseDockNavigation = { ... }`
   - `window.updateSidebarCollapseState = updateSidebarCollapseState;`
4. Automatically initialize `setupResponsiveLayoutListener()` and trigger initial `updateSidebarCollapseState()`.

### Step 2: Clean Up Source ([`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js))
1. Remove dead/obsolete variable declarations at lines 27–33:
   - `const sidebar = document.querySelector('.sidebar');`
   - `const collapsedClockSlot = document.getElementById('collapsed-clock-slot');`
   - `const timeWidget = document.querySelector('.widget-time');`
   - `const dock = document.querySelector('.dock');`
2. Remove ratio constants at lines 70–72:
   - `SIDEBAR_COLLAPSE_RATIO`, `DOCK_COLLAPSE_RATIO`
3. Remove `updateSidebarCollapseState()` definition (lines 547–595).
4. Remove `debouncedResize` and `resize`/`beforeunload` event listeners (lines 599–612).
5. Remove redundant `updateSidebarCollapseState()` invocation (line 616).
6. Keep `tabsScrollController = initTabsScrollController();`, `updateBookmarkTabOverflow();`, and tab scroll button click listeners intact (protected domain).

---

## Risk Assessment

| Risk Category | Level | Mitigation Strategy |
|---|:---:|---|
| **DOM Element Lookup Timing** | Low | Query `.sidebar`, `#collapsed-clock-slot`, and `.widget-time` with safe fallback guards. |
| **Resize Performance & Thrashing** | Low | Preserve exact 100ms debounce interval with `.cancel?.()` on beforeunload. |
| **Cross-Script Declaration Collisions** | Low | Verify with `node scripts/check-newtab-static.mjs` (dynamic AST collision checker). |
| **External Callers** | None | Maintain `window.updateSidebarCollapseState` global bridge for any third-party or legacy caller. |
| **Bookmark/Grid Protection** | None | No bookmark layout, Sortable, or drag-and-drop code will be modified. |

---

## Expected Impact

| Metric | Current | Expected Checkpoint 2 | Delta |
|---|:---:|:---:|:---:|
| `src/new-tab.js` lines | 3,716 lines | ~3,636 lines | **-80 lines** |
| `src/newtab/core/dock-navigation.js` lines | 145 lines | ~205 lines | +60 lines |
| Net Codebase Line Delta | — | — | **-20 lines net** |

---

## No-Code-Change Confirmation

In strict compliance with the Homebase Codex workflow instructions:
- **No source code files modified**
- **No git commits created**
- **No git pushes performed**
- **Working tree verified clean**

---

## Next Steps

Awaiting owner review and approval of this audit before generating [`docs/108-cycle11-phase5-checkpoint2-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/108-cycle11-phase5-checkpoint2-plan.md).
