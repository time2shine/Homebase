# Cycle #11 Phase 5 Regression Fix — Sidebar ReferenceError

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Wallpaper System Consolidation & Subsystem Isolation  
**Target**: Fix `ReferenceError: sidebar is not defined` regression  
**Date**: October 2, 2026  
**Status**: Fixed & Verified  

---

## 1. Problem Description

During initialization, `loadAppSettingsFromStorage()` in [`src/newtab/settings/settings-preferences.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) caught a runtime error at line 223:
```text
Failed to load app settings ReferenceError: sidebar is not defined
```

### Root Cause
In Cycle #11 Phase 5 Checkpoint 2 (`6abb63c`), sidebar and dock collapse logic was extracted from `src/new-tab.js` into [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js). The previous global `sidebar` variable (`const sidebar = document.querySelector('.sidebar');`) was moved into local scope inside `updateSidebarCollapseState()`.

However, [`src/newtab/widgets/widget-visibility.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js) line 58 had retained a bare reference to `sidebar`:
```javascript
function applyWidgetOrderToSidebar(order = widgetOrderPreference) {
  const sidebarEl = sidebar || document.querySelector('.sidebar');
  if (!sidebarEl) return;
```
When `loadAppSettingsFromStorage()` called `setWidgetOrderPreference(normalizedWidgetOrder, { persist: shouldPersistWidgetOrder })`, `applyWidgetOrderToSidebar` was invoked with `options.apply = true`. Evaluating the undeclared identifier `sidebar` threw `ReferenceError: sidebar is not defined`.

---

## 2. Architecture Fix

Rather than reintroducing global DOM variables into `src/new-tab.js`, the layout element access was formalized on the layout controller [`window.HomebaseDockNavigation`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js):

### A. Added Element Getters to `src/newtab/core/dock-navigation.js`
```javascript
function getSidebarElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.sidebar');
}

function getCollapsedClockSlotElement() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('collapsed-clock-slot');
}

function getTimeWidgetElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.widget-time');
}
```

Exposed on `window.HomebaseDockNavigation`:
- `HomebaseDockNavigation.getSidebarElement()`
- `HomebaseDockNavigation.getCollapsedClockSlotElement()`
- `HomebaseDockNavigation.getTimeWidgetElement()`
- Compatibility bridges: `window.getSidebarElement`, `window.getCollapsedClockSlotElement`, `window.getTimeWidgetElement`

Updated `updateSidebarCollapseState()` to use these helpers internally.

### B. Updated `src/newtab/widgets/widget-visibility.js`
Refactored `applyWidgetOrderToSidebar` to safely retrieve the sidebar element through `HomebaseDockNavigation` with defensive fallback:
```javascript
function applyWidgetOrderToSidebar(order = widgetOrderPreference) {
  const sidebarEl = (typeof window !== 'undefined' && window.HomebaseDockNavigation && typeof window.HomebaseDockNavigation.getSidebarElement === 'function')
    ? window.HomebaseDockNavigation.getSidebarElement()
    : (typeof getSidebarElement === 'function'
      ? getSidebarElement()
      : (typeof document !== 'undefined' ? document.querySelector('.sidebar') : null));
  if (!sidebarEl) return;
```

---

## 3. Verification Results

### A. Syntax Validation
```powershell
node --check src/newtab/settings/settings-preferences.js
node --check src/newtab/core/dock-navigation.js
node --check src/newtab/widgets/widget-visibility.js
# All exit code 0 (PASS)
```

### B. Static Invariants Check
```powershell
node scripts/check-newtab-static.mjs
# PASS: 978 unique top-level declarations verified across 55 deferred scripts (0 collisions)
```

### C. Browser Smoke Test
```powershell
node scripts/smoke-newtab-file.mjs
# PASS: required DOM surfaces exist, core controllers available, 0 ReferenceError
```

### D. Unit Tests
```powershell
npm.cmd test
# PASS: 343 / 343 tests passed across all 4 stages
```

### E. Build & Protected Files
```powershell
npm.cmd run build
# PASS: Chrome and Firefox distributions built successfully
git diff --check
# PASS: Clean whitespace
git diff src/preload.js src/instant_load.js manifests/ dist/
# PASS: Zero modifications to protected files
```

### F. Real-Browser CDP Verification
Executed dedicated headless browser CDP test suite:
- `Test 1 (Dock Navigation Getters)`: `hasGetSidebarElement: true`, `sidebarFound: true`, `clockSlotFound: true`, `timeWidgetFound: true`
- `Test 2 (loadAppSettingsFromStorage)`: `success: true`
- `Test 3 (applyWidgetOrderToSidebar)`: `success: true`
- `Test 4 (updateSidebarCollapseState)`: `success: true`
- `Test 5 (Console Logs Inspection)`: `hasSidebarReferenceError: false`, `cdpIssuesCount: 0`
- `Result`: **ALL TESTS PASSED**

---

## 4. Summary of Files Changed

| File | Status | Description |
|---|:---:|---|
| [`src/newtab/core/dock-navigation.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dock-navigation.js) | Modified | Added `getSidebarElement`, `getCollapsedClockSlotElement`, and `getTimeWidgetElement` methods and controller exports. |
| [`src/newtab/widgets/widget-visibility.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js) | Modified | Replaced bare `sidebar` access in `applyWidgetOrderToSidebar` with `HomebaseDockNavigation.getSidebarElement()`. |
| [`docs/114-cycle11-phase5-regression-fix-sidebar.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/114-cycle11-phase5-regression-fix-sidebar.md) | Created | Regression audit and resolution report. |

---

## 5. Status Confirmation

- Checkpoint 3 commit (`f970ac5`) remains intact.
- Fix changes staged and committed in a separate commit.
- No push performed.
