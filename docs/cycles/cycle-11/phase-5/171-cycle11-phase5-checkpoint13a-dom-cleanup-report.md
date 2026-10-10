# Homebase Cycle #11 Phase 5 — Checkpoint 13-A DOM Cleanup Report

**Subsystem**: Stale Unused DOM Handle Cleanup  
**Primary File**: `src/new-tab.js`  
**Supporting Files**:
- `src/newtab/bookmarks/folder-picker.js`
- `src/newtab/core/dock-navigation.js`
- `src/newtab/settings/settings-ui.js`

**Status**: Implemented & Verified (STOPPED before commit/push per instructions)

---

## 1. Executive Summary

Checkpoint 13-A removes 19 stale, unused top-level DOM constants from `src/new-tab.js`. These variables were legacy leftovers that were either completely unreferenced in `src/new-tab.js` or solely consumed by extracted modules (`folder-picker.js`, `search-interaction-controller.js`, `bookmark-ui-state.js`, `dock-navigation.js`, and `settings-ui.js`).

With this cleanup, `src/new-tab.js` has broken below the 2,000-line milestone, shrinking from **2,017 lines** to **1,977 lines**.

### Key Metrics
* **`src/new-tab.js` line count before**: 2,017 lines
* **`src/new-tab.js` line count after**: **1,977 lines**
* **Net reduction in `src/new-tab.js`**: **40 lines removed** (-1.98%)
* **Top-level declarations in `src/new-tab.js`**: Reduced by **19 declarations**
* **Cross-script unique declarations**: Reduced from **923** to **912 declarations** (-11 global declarations permanently eliminated) with **0 collisions**
* **Protected files**: 0 lines modified in `src/preload.js`, `src/instant_load.js`, `manifests/`, or `dist/`

---

## 2. Removed Top-Level DOM Handles (19 Total)

Prior to removal, exhaustive reference scans across `src/`, `tests/`, and `scripts/` confirmed that each identifier appeared exactly **1 time** in `src/new-tab.js` (its own declaration line).

| Category | Identifier | Previous Line | Owning Module / Resolution |
|---|---|---|---|
| **Folder Picker** | `folderPickerModal` | L37 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerPanel` | L39 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerSearchInput` | L41 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerList` | L43 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerBreadcrumb` | L45 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerConfirmBtn` | L47 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerCancelBtn` | L49 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Folder Picker** | `folderPickerError` | L51 | Moved to `src/newtab/bookmarks/folder-picker.js` |
| **Search** | `bookmarkResultsContainer` | L19 | Already guarded by fallback in `search-interaction-controller.js` |
| **Search** | `suggestionResultsContainer` | L21 | Already guarded by fallback in `search-interaction-controller.js` |
| **Search** | `searchAreaWrapper` | L25 | Already queried locally in `search-ui-controller.js` & guarded in `search-interaction-controller.js` |
| **Bookmark UI** | `bookmarkBarWrapper` | L29 | Already guarded by fallback in `bookmark-ui-state.js` |
| **Bookmark UI** | `bookmarksGridEl` | L31 | Already guarded by fallback in `bookmark-ui-state.js` and `search-interaction-controller.js` |
| **Bookmark UI** | `bookmarksEmptyState` | L33 | Already guarded by fallback in `bookmark-ui-state.js` |
| **Bookmark UI** | `bookmarksEmptyMessage` | L35 | Already guarded by fallback in `bookmark-ui-state.js` |
| **Dock / Settings** | `nextWallpaperBtn` | L581 | Queried directly inside `setupDockNavigation()` in `dock-navigation.js` |
| **Dock / Settings** | `mainSettingsBtn` | L583 | Queried directly inside `setupLazySettingsButton()` in `dock-navigation.js` & `settings-ui.js` |
| **Dock / Settings** | `appSettingsModal` | L585 | Queried directly inside closure in `settings-ui.js` |
| **Dock / Settings** | `appSettingsNav` | L587 | Queried directly inside closure in `settings-ui.js` |

---

## 3. Supporting Module Adjustments

To maintain complete runtime safety and prevent `ReferenceError` / TDZ issues when global declarations were removed from `new-tab.js`:

1. **`src/newtab/bookmarks/folder-picker.js`**:
   - Added declarations for `folderPickerModal`, `folderPickerPanel`, `folderPickerSearchInput`, `folderPickerList`, `folderPickerBreadcrumb`, `folderPickerConfirmBtn`, `folderPickerCancelBtn`, and `folderPickerError` directly at the top of the module.
   - Preserves single, unique declaration ownership without collisions across deferred scripts.

2. **`src/newtab/core/dock-navigation.js`**:
   - Resolved `mainSettingsBtn = document.getElementById('main-settings-btn')` directly inside `setupLazySettingsButton()`.
   - Resolved `nextWallpaperBtn = document.getElementById('dock-next-wallpaper-btn')` directly inside `setupDockNavigation()`.

3. **`src/newtab/settings/settings-ui.js`**:
   - Resolved `appSettingsModal`, `appSettingsNav`, and `mainSettingsBtn` directly inside the `window.SettingsUI = (() => { ... })();` closure.

---

## 4. Invariant & Safety Confirmation

The following subsystems were strictly preserved and NOT modified:
* `initializePage()` startup orchestration: **Untouched**
* Sortable drag/drop handlers (`setupGridSortable`, `handleGridMove`, `handleGridDrop`, `setupTabsSortable`, `handleTabDrop`): **Untouched**
* Idle scheduler (`runWhenIdle`, `processIdleTasks`, `scheduleIdleTask`): **Untouched**
* Wallpaper lifecycle & prime logic: **Untouched**
* `src/preload.js`: **Untouched** (0 diff)
* `src/instant_load.js`: **Untouched** (0 diff)
* `manifests/*`: **Untouched** (0 diff)

---

## 5. Verification Results

| Test Step | Command | Result |
|---|---|---|
| **Syntax Check** | `node --check src/new-tab.js src/newtab/bookmarks/folder-picker.js src/newtab/core/dock-navigation.js src/newtab/settings/settings-ui.js` | **PASS** (0 errors) |
| **Static Invariants** | `node scripts/check-newtab-static.mjs` | **PASS** (61 deferred scripts, 912 unique declarations, 0 collisions) |
| **Browser Smoke Test** | `node scripts/smoke-newtab-file.mjs` | **PASS** (MS Edge CDP, all controllers verified, 0 ReferenceErrors) |
| **Unit Tests Suite** | `npm.cmd test` | **PASS** (350 / 350 unit tests across 4 stages passed) |
| **Production Build** | `npm.cmd run build` | **PASS** (Built `dist/chrome` and `dist/firefox`) |
| **Whitespace & Formatting** | `git diff --check` | **PASS** (0 issues) |
| **Protected Files Diff** | `git diff src/preload.js src/instant_load.js manifests/ dist/` | **PASS** (Zero differences) |

---

## 6. Next Steps

1. Stop execution per workflow instructions.
2. Await owner review and approval before staging and committing Checkpoint 13-A.
