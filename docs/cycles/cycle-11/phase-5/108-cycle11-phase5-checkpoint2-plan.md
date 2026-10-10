# Checkpoint 2 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Checkpoint**: Checkpoint 2 — Responsive Layout & Sidebar/Dock Collapse Extraction  
**Date**: October 1, 2026  
**Status**: Ready for Review  

---

## Migration Strategy

### 1. Architectural Goal
Extract all remaining responsive layout, viewport sizing, collapse threshold, and window `resize` handling logic from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js).

### 2. Extraction Boundary
The following functional units will move to `src/newtab/core/dock-navigation.js`:
- `SIDEBAR_COLLAPSE_RATIO` constant (`0.49`)
- `DOCK_COLLAPSE_RATIO` constant (`0.32`)
- `updateSidebarCollapseState()` function:
  - Width ratio calculation against `window.screen.availWidth` or `window.innerWidth`
  - Toggle `sidebar-collapsed` body class
  - Toggle `dock-collapsed` body class
  - Dynamic `.widget-time` DOM relocation between `.sidebar` and `#collapsed-clock-slot`
- `setupResponsiveLayoutListener()`:
  - 100ms debounced window `resize` event listener
  - `beforeunload` cancellation cleanup
  - Invocation of `updateBookmarkTabOverflow()` to maintain tab scroll arrow visibility
  - Initial `updateSidebarCollapseState()` trigger
- Global and controller exports:
  - `window.HomebaseDockNavigation` controller interface
  - `window.updateSidebarCollapseState` compatibility bridge

### 3. Preserved Areas (Untouched)
- Bookmark grid rendering, grid items, and folder management
- Sortable.js bridge, drag-and-drop, and pointermove throttle
- Bookmark tabs scrolling (`bookmark-tabs-scroll.js`, `initTabsScrollController()`, left/right scroll click handlers)
- Startup orchestration in `initializePage()`
- Wallpaper and video lifecycle logic

---

## Files Changed

| File | Role | Planned Changes |
|---|---|---|
| [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | Destination | Add collapse ratio constants, `updateSidebarCollapseState()`, `setupResponsiveLayoutListener()`, auto-init invocation, and `window.HomebaseDockNavigation` controller exports. |
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | Source | Remove dead selectors (`dock`, `sidebar`, `collapsedClockSlot`, `timeWidget`), ratio constants, `updateSidebarCollapseState()`, and inline `resize` listener. Add lightweight delegation wrapper if needed. |

---

## Dependency Analysis

1. **Script Order in `src/new-tab.html`**:
   - Line 3328: `newtab/core/utils.js` (provides `debounce`)
   - Line 3339: `newtab/bookmarks/bookmark-tabs-scroll.js` (provides `updateBookmarkTabOverflow`)
   - Line 3343: `newtab/widgets/widget-visibility.js` (calls `updateSidebarCollapseState`)
   - Line 3346: `newtab/core/dock-navigation.js` (**Destination**)
   - Line 3380: `newtab/settings/settings-preferences.js` (calls `applySidebarVisibility`)
   - Line 3401: `new-tab.js` (Source monolith)

2. **Cross-Script Invariants**:
   - `debounce` is defined in `utils.js` (loaded at line 3328, earlier than `dock-navigation.js`).
   - `updateBookmarkTabOverflow` is defined in `bookmark-tabs-scroll.js` (loaded at line 3339, earlier than `dock-navigation.js`).
   - `dock-navigation.js` loads before callers in `settings-preferences.js` and `new-tab.js`.

3. **DOM Availability**:
   - All scripts are `<script defer>`, executing after DOM parsing. Elements `.sidebar`, `#collapsed-clock-slot`, and `.widget-time` exist in the document structure. Safe null checks will be maintained for all DOM queries.

---

## Implementation Steps

### Phase A: Add Responsive Layout Methods to `dock-navigation.js`
1. Define constants:
   ```javascript
   const SIDEBAR_COLLAPSE_RATIO = 0.49;
   const DOCK_COLLAPSE_RATIO = 0.32;
   ```
2. Implement `updateSidebarCollapseState()`:
   ```javascript
   function updateSidebarCollapseState() {
     if (typeof document === 'undefined') return;
     const sidebarHiddenPref = document.body.classList.contains('sidebar-hidden');
     const referenceWidth = (window.screen && window.screen.availWidth) ? window.screen.availWidth : window.innerWidth;
     if (!referenceWidth) return;

     const widthRatio = window.innerWidth / referenceWidth;
     const shouldCollapseSidebar = !sidebarHiddenPref && widthRatio <= SIDEBAR_COLLAPSE_RATIO;
     const shouldCollapseDock = widthRatio <= DOCK_COLLAPSE_RATIO;

     document.body.classList.toggle('sidebar-collapsed', shouldCollapseSidebar);
     document.body.classList.toggle('dock-collapsed', shouldCollapseDock);

     const sidebar = document.querySelector('.sidebar');
     const collapsedClockSlot = document.getElementById('collapsed-clock-slot');
     const timeWidget = document.querySelector('.widget-time');

     if (shouldCollapseSidebar && !sidebarHiddenPref) {
       if (collapsedClockSlot && timeWidget && timeWidget.parentElement !== collapsedClockSlot) {
         collapsedClockSlot.appendChild(timeWidget);
       }
     } else {
       if (sidebar && timeWidget && timeWidget.parentElement !== sidebar) {
         const firstSidebarChild = sidebar.firstElementChild;
         if (firstSidebarChild) {
           sidebar.insertBefore(timeWidget, firstSidebarChild);
         } else {
           sidebar.appendChild(timeWidget);
         }
       }
     }
   }
   ```
3. Implement `setupResponsiveLayoutListener()`:
   ```javascript
   let responsiveLayoutListenerAttached = false;
   let debouncedResizeHandler = null;

   function setupResponsiveLayoutListener() {
     if (typeof window === 'undefined' || typeof document === 'undefined') return;
     if (responsiveLayoutListenerAttached) return;
     responsiveLayoutListenerAttached = true;

     const runResize = () => {
       updateSidebarCollapseState();
       if (typeof updateBookmarkTabOverflow === 'function') {
         updateBookmarkTabOverflow();
       } else if (typeof window !== 'undefined' && typeof window.updateBookmarkTabOverflow === 'function') {
         window.updateBookmarkTabOverflow();
       }
     };

     if (typeof debounce === 'function') {
       debouncedResizeHandler = debounce(runResize, 100);
     } else {
       debouncedResizeHandler = runResize;
     }

     window.addEventListener('resize', debouncedResizeHandler);
     window.addEventListener('beforeunload', () => {
       debouncedResizeHandler?.cancel?.();
     });

     updateSidebarCollapseState();
   }
   ```

### Phase B: Expose Controller APIs
1. Expose on `window.HomebaseDockNavigation`:
   ```javascript
   if (typeof window !== 'undefined') {
     window.updateSidebarCollapseState = updateSidebarCollapseState;
     window.setupResponsiveLayoutListener = setupResponsiveLayoutListener;

     window.HomebaseDockNavigation = {
       SIDEBAR_COLLAPSE_RATIO,
       DOCK_COLLAPSE_RATIO,
       updateSidebarCollapseState,
       setupResponsiveLayoutListener,
       setupDockNavigation,
       setupLazySettingsButton,
       initAddonStoreDockLink
     };
   }

   setupResponsiveLayoutListener();
   ```

### Phase C: Replace `new-tab.js` Implementation with Delegation
1. Replace lines 547–613 in `src/new-tab.js` with lightweight delegation wrapper:
   ```javascript
   function updateSidebarCollapseState() {
     if (typeof window !== 'undefined' && window.HomebaseDockNavigation?.updateSidebarCollapseState) {
       return window.HomebaseDockNavigation.updateSidebarCollapseState();
     }
   }
   ```
2. Remove redundant initial call `updateSidebarCollapseState();` at line 616 (handled by `setupResponsiveLayoutListener()`).
3. Preserve `tabsScrollController = initTabsScrollController();`, `updateBookmarkTabOverflow();`, and scroll button click handlers at lines 614–632.

### Phase D: Remove Unused Constants/Selectors/Dead Variables
1. In `src/new-tab.js` lines 27–33, remove:
   - `const sidebar = document.querySelector('.sidebar');`
   - `const collapsedClockSlot = document.getElementById('collapsed-clock-slot');`
   - `const timeWidget = document.querySelector('.widget-time');`
   - `const dock = document.querySelector('.dock');`
2. In `src/new-tab.js` lines 70–72, remove:
   - `const SIDEBAR_COLLAPSE_RATIO = 0.49;`
   - `const DOCK_COLLAPSE_RATIO = 0.32;`
3. Verify with dynamic collision scanner that no duplicate declarations remain.

### Phase E: Verification
Execute full test suite and custom CDP browser test.

---

## Compatibility Bridges

| API | Owner | Purpose |
|---|---|---|
| `window.HomebaseDockNavigation` | `dock-navigation.js` | Controller surface for dock navigation and responsive collapse. |
| `window.updateSidebarCollapseState` | `dock-navigation.js` | Global compatibility bridge used by `widget-visibility.js` and external settings. |
| `updateSidebarCollapseState()` | `new-tab.js` | Local delegation wrapper for any lingering internal callers. |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|:---:|---|
| **Resize Event Flooding** | Low | Retain 100ms debounce interval with `.cancel?.()` on beforeunload. |
| **Element Query Null Reference** | Low | Dynamic lookup with null guards handles DOM elements if rendered asynchronously. |
| **Top-Level Variable Collision** | Medium | Remove constants from `src/new-tab.js` simultaneously to avoid lexical scope clashes. |
| **Bookmark Tab Overflow Sync** | Low | Explicitly invoke `updateBookmarkTabOverflow()` inside resize handler. |
| **Protected Files** | Zero | `src/preload.js`, `src/instant_load.js`, `manifests/`, `dist/` remain untouched. |

---

## Expected Line Impact

| File | Current Lines | Expected Lines | Net Delta |
|---|:---:|:---:|:---:|
| [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) | 3,716 | ~3,640 | **-76 lines** |
| [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | 145 | ~215 | +70 lines |
| **Net Codebase Delta** | — | — | **-6 lines net** |

---

## Verification Checklist

### Automated Commands
```powershell
node --check src/new-tab.js
node --check src/newtab/core/dock-navigation.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```

### Real-Browser CDP Verification Plan
Create `scratch/verify-cycle11-phase5-cp2-browser.mjs` using EdgeCore:
1. Verify new tab loads with `ready` class and 0 errors.
2. Verify `window.HomebaseDockNavigation` exists with `updateSidebarCollapseState` and `setupResponsiveLayoutListener`.
3. Test small viewport (width ratio <= 0.49):
   - `document.body.classList.contains('sidebar-collapsed')` === `true`.
   - `.widget-time` relocated to `#collapsed-clock-slot`.
4. Test extra-small viewport (width ratio <= 0.32):
   - `document.body.classList.contains('dock-collapsed')` === `true`.
5. Test normal viewport (width ratio > 0.49):
   - `sidebar-collapsed` and `dock-collapsed` removed.
   - `.widget-time` restored to `.sidebar`.
6. Test resize event listener dispatch without exceptions.
7. Verify 0 CDP runtime errors or severe console exceptions.

---

## Confirmation

- **No implementation files modified**
- **No git commits created**
- **No git pushes performed**
- **Working tree clean**

*Awaiting owner review and explicit approval of [`docs/108-cycle11-phase5-checkpoint2-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/108-cycle11-phase5-checkpoint2-plan.md) before starting implementation.*
