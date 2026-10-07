# Homebase Cycle #11 Phase 5 — Checkpoint 14-D Architecture Audit
## `browser.storage.onChanged` Dispatcher Architecture & Ownership

**Date:** October 5, 2026  
**Auditor:** Antigravity  
**Target File:** `src/new-tab.js` (lines 1798–1863)  
**Related Modules:**  
- `src/newtab/core/host-storage-adapter.js`  
- `src/newtab/core/storage-service.js`  
- `src/newtab/search/search-ui-controller.js`  
- `src/newtab/settings/settings-preferences.js`  
- `src/newtab/widgets/todo.js`  
- `src/newtab/wallpaper/wallpaper-controller.js` & `wallpaper-storage.js`  
- `src/newtab/bookmarks/bookmark-grid-controller.js` & `bookmark-root-controller.js`  
**Scope:** Architecture Audit ONLY. Zero source code modifications, zero commits, zero pushes.

---

## 1. Executive Summary

This architecture audit analyzes the `browser.storage.onChanged` event listener residing in `src/new-tab.js` (lines 1798–1863, 66 lines). It examines the listener's responsibilities, consumers, subsystem coupling, and duplication across the codebase, and assesses whether extraction into a dedicated storage dispatcher improves architectural boundaries.

### Key Audit Findings:
1. **The Only Active Storage Listener in the Dashboard:**
   - Lines 1798–1863 contain the **only** active `browser.storage.onChanged.addListener` call in the running new-tab application. (The only other reference is in `host-storage-adapter.js`, which exposes an unused bridge registration utility for lazy bookmark editors).
2. **Hybrid Concern (Orchestrator + Misplaced Business Logic):**
   - For **Search**, **Settings**, and **Todo**, the listener acts purely as an orchestration router, forwarding `(changes, area)` directly to subsystem change handlers (`HomebaseSearchUiController.handleStorageChange`, `HomebaseSettingsPreferences.handleStorageChange`, `handleTodoStorageChange`).
   - For **Wallpaper** and **Bookmarks**, the listener embeds direct domain business logic: computing wallpaper fallbacks, diffing metadata changes via `getChangedMetadataIds`, patching the active grid via `patchActiveGridMetadataItems`, and directly mutating module-level variables (`folderMetadata`, `bookmarkMetadata`, `lastUsedBookmarkFolderId`).
3. **Existing Duplicate Handler in Bookmark Root Controller:**
   - `src/newtab/bookmarks/bookmark-root-controller.js` (lines 353–361) already implements and exports `handleStorageChange(changes, area)` which detects `HOMEBASE_BOOKMARK_ROOT_ID_KEY` and calls `loadBookmarks()`. `new-tab.js` duplicates this exact check inline (lines 1857–1859) instead of calling the existing controller method.
4. **Viable Extraction Path (Estimated Reduction: ~55–60 lines):**
   - Extracting this block into a dedicated `HomebaseStorageDispatcher` (e.g. `src/newtab/core/storage-dispatcher.js`) provides a clean, decoupled architecture.
   - To avoid cross-layer entanglement, the bookmark metadata patch logic and wallpaper sync logic should be cleanly encapsulated as subsystem delegates before or during extraction.
5. **Risk Assessment: MEDIUM:**
   - The storage listener operates asynchronously outside `initializePage()`, so it carries **zero startup critical path risk**.
   - However, it governs real-time cross-tab synchronization. Regressions could cause settings, wallpaper changes, or bookmark metadata edits made in one tab to fail to reflect in others.

---

## 2. Complete Inventory & Location of the Storage Listener

### 2.1 Code Block in `src/new-tab.js`
- **Location:** Lines 1798–1863 (66 lines)
- **Code:**
```javascript
if (browser?.storage?.onChanged) {

  browser.storage.onChanged.addListener((changes, area) => {

    if (area !== 'local') return;

    if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {

      const nextSelection = changes[WALLPAPER_SELECTION_KEY]
        ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
        : currentWallpaperSelection;
      const allowDailyRotation = changes[DAILY_ROTATION_KEY]
        ? changes[DAILY_ROTATION_KEY].newValue !== false
        : dailyRotationPreference !== false;

      syncWallpaperStartupState(nextSelection, allowDailyRotation);

    }



    if (window.HomebaseSearchUiController && typeof window.HomebaseSearchUiController.handleStorageChange === 'function') {
      window.HomebaseSearchUiController.handleStorageChange(changes, area);
    }

    if (window.HomebaseSettingsPreferences && typeof window.HomebaseSettingsPreferences.handleStorageChange === 'function') {
      window.HomebaseSettingsPreferences.handleStorageChange(changes, area);
    }

    handleTodoStorageChange(changes, area);

    let changedMetadataIds = null;

    if (changes[FOLDER_META_KEY]) {
      const nextFolderMetadata = changes[FOLDER_META_KEY].newValue || {};
      changedMetadataIds = getChangedMetadataIds(changes[FOLDER_META_KEY].oldValue, nextFolderMetadata);
      folderMetadata = nextFolderMetadata;
    }

    if (changes[BOOKMARK_META_KEY]) {
      const nextBookmarkMetadata = changes[BOOKMARK_META_KEY].newValue || {};
      const changedBookmarkIds = getChangedMetadataIds(changes[BOOKMARK_META_KEY].oldValue, nextBookmarkMetadata);
      changedMetadataIds = changedMetadataIds
        ? Array.from(new Set([...changedMetadataIds, ...changedBookmarkIds]))
        : changedBookmarkIds;
      bookmarkMetadata = nextBookmarkMetadata;
    }

    if (changedMetadataIds?.length && currentGridFolderNode && bookmarkTree && bookmarkTree[0]) {
      const activeNode = findBookmarkNodeById(bookmarkTree[0], currentGridFolderNode.id);
      if (activeNode && patchActiveGridMetadataItems(activeNode, changedMetadataIds)) {
        renderBookmarkGrid(activeNode);
      }
    }

    if (changes[LAST_USED_BOOKMARK_FOLDER_KEY]) {
      lastUsedBookmarkFolderId = changes[LAST_USED_BOOKMARK_FOLDER_KEY].newValue || null;
    }

    if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
      loadBookmarks();
    }

  });

}
```

---

## 3. Subsystem Breakdown & Coupling Analysis

The listener coordinates real-time synchronization for 5 distinct subsystems when storage changes occur in the `local` area:

| Subsystem | Storage Keys Monitored | Operations Performed | Coupling / Invocation Style | Existing Subsystem Handler Available? |
|---|---|---|---|---|
| **1. Wallpaper** | `WALLPAPER_SELECTION_KEY`<br>`DAILY_ROTATION_KEY` | Computes fallback selection & daily rotation flags; calls `syncWallpaperStartupState` | Reads globals `currentWallpaperSelection`, `dailyRotationPreference`; calls `syncWallpaperStartupState` | `wallpaper-storage.js:1225` has `syncWallpaperStartupState`, but no unified `handleStorageChange` method. |
| **2. Search** | `CUSTOM_ENGINES_KEY`<br>`DEFAULT_ENGINE_KEY`<br>`CUSTOM_ORDER_KEY`<br>`DISABLED_DEFAULT_ENGINES_KEY`<br>`currentSearchEngineId` | Rebuilds engine selector, updates engine icons, refreshes current engine | Clean delegation via `window.HomebaseSearchUiController.handleStorageChange(changes, area)` | **YES** (`search-ui-controller.js:895`). |
| **3. Settings** | ~15 keys (time format, dim, sidebar, dock toggles, quote/weather/news toggles, etc.) | Updates `settingsState`, sets `localStorage` fast-mirrors, invokes visual effect helpers | Clean delegation via `window.HomebaseSettingsPreferences.handleStorageChange(changes, area)` | **YES** (`settings-preferences.js:862`). |
| **4. Todo** | `TODO_ITEMS_KEY`<br>`TODO_HIDE_DONE_KEY` | Normalizes items, updates cache, calls `renderTodoList()` | Direct call to global `handleTodoStorageChange(changes, area)` | **YES** (`widgets/todo.js:339`). |
| **5. Bookmarks** | `FOLDER_META_KEY`<br>`BOOKMARK_META_KEY`<br>`LAST_USED_BOOKMARK_FOLDER_KEY`<br>`HOMEBASE_BOOKMARK_ROOT_ID_KEY` | 1. Diffs metadata IDs via `getChangedMetadataIds`<br>2. Updates local `folderMetadata` & `bookmarkMetadata`<br>3. Finds active node and patches DOM with `patchActiveGridMetadataItems`<br>4. Re-renders grid if patch returns true<br>5. Updates `lastUsedBookmarkFolderId`<br>6. Calls `loadBookmarks()` on root ID change | Directly reads and writes `new-tab.js` local variables (`folderMetadata`, `bookmarkMetadata`, `currentGridFolderNode`, `bookmarkTree`, `lastUsedBookmarkFolderId`). Calls global helpers. | **PARTIAL**: `bookmark-root-controller.js:353` implements `handleStorageChange` for `HOMEBASE_BOOKMARK_ROOT_ID_KEY`, but metadata patching is embedded inline. |

---

## 4. Comparison with Existing Storage Modules

### 4.1 `src/newtab/core/host-storage-adapter.js`
- **Role:** Compatibility bridge for lazy-loaded modules (`GalleryUI`, `BookmarkEditorUI`).
- **Current Relationship:**
  - Implements `bridgeStorageAddListener(listener)` (L168–187) to register listeners across Chrome and Firefox.
  - Does **not** inspect keys or route domain logic.
  - Used only when creating storage bridges for lazy editor modals.

### 4.2 `src/newtab/core/storage-service.js`
- **Role:** Primary CRUD storage abstraction (`HomebaseStorage`).
- **Current Relationship:**
  - Handles `get`, `getMany`, `set`, `setMany`, `remove`, and synchronous `localStorage` fast-mirrors.
  - Completely passive; does **not** register or listen to `browser.storage.onChanged`.

### 4.3 Subsystem Controllers
- Three subsystems already possess formal `handleStorageChange(changes, area)` signatures:
  1. `HomebaseSearchUiController.handleStorageChange`
  2. `HomebaseSettingsPreferences.handleStorageChange`
  3. `HomebaseBookmarkRootController.handleStorageChange` (and `handleTodoStorageChange` in `todo.js`)
- Two subsystems do not yet encapsulate their storage change handler:
  1. Wallpaper (currently 12 lines in `new-tab.js`)
  2. Bookmark Grid / Metadata Sync (currently 32 lines in `new-tab.js`)

---

## 5. Addressing Core Audit Questions (A – E)

### Question A: Is this dispatcher an orchestration layer or misplaced business logic?
- **It is an orchestration layer contaminated by misplaced business logic:**
  - The routing structure (`if (area !== 'local') return; dispatchToSubsystems(...)`) is legitimate top-level event orchestration.
  - However, performing metadata JSON diffing (`getChangedMetadataIds`), active tree searching (`findBookmarkNodeById`), DOM element patching (`patchActiveGridMetadataItems`), and fallback calculation directly inside the event listener callback violates separation of concerns. That logic belongs in the bookmark grid controller and wallpaper controller.

### Question B: Are there duplicate storage listeners elsewhere?
- **Platform listeners:** NO. There are zero other `storage.onChanged` listeners in the entire project.
- **Handler logic:** YES.
  - `bookmark-root-controller.js:353–361` defines:
    ```javascript
    function handleStorageChange(changes, area) {
      if (area && area !== 'local') return;
      const rootKey = (typeof window !== 'undefined' && window.HOMEBASE_BOOKMARK_ROOT_ID_KEY) || 'homebaseBookmarkRootId';
      if (changes && changes[rootKey]) {
        if (typeof loadBookmarks === 'function') {
          loadBookmarks();
        }
      }
    }
    ```
  - `new-tab.js:1857–1859` duplicates this exact check:
    ```javascript
    if (changes[HOMEBASE_BOOKMARK_ROOT_ID_KEY]) {
      loadBookmarks();
    }
    ```

### Question C: Would extracting it create a cleaner ownership boundary?
- **YES.**
  - Extracting the dispatcher frees `new-tab.js` from 66 lines of event handling and isolates cross-tab synchronization into an explicit, testable service.
  - It establishes a clean architectural pattern: every dashboard subsystem provides a `handleStorageChange(changes, area)` handler, and the central dispatcher simply loops through registered listeners or handlers.

### Question D: Architectural Pattern Options
1. **Option 1: Central `HomebaseStorageDispatcher` Module (`src/newtab/core/storage-dispatcher.js`)**
   - Creates a lightweight dispatcher that binds `browser.storage.onChanged` once.
   - Subsystems register their handlers (or the dispatcher calls known controller endpoints: Settings, Search, Todo, Wallpaper, Bookmarks).
   - *Advantage:* Highly cohesive, single responsibility, matches `HomebaseHostStorageAdapter` and `HomebaseStorage` design.
2. **Option 2: Remain inside `src/new-tab.js`**
   - Keeps the listener in `new-tab.js` to preserve direct access to `folderMetadata` and `bookmarkMetadata`.
   - *Disadvantage:* Leaves monolithic coupling in `new-tab.js`.
3. **Option 3: Two-Phase Progressive Extraction (RECOMMENDED)**
   - **Phase 1 (Domain Cleanup in Place):**
     - Delegate `HOMEBASE_BOOKMARK_ROOT_ID_KEY` to `HomebaseBookmarkRootController.handleStorageChange`.
     - Encapsulate the bookmark metadata diff and grid patch into a clean helper or method in `bookmark-grid-controller.js`.
     - Encapsulate the wallpaper sync into `wallpaper-storage.js` or `wallpaper-controller.js`.
   - **Phase 2 (Dispatcher Extraction):**
     - Extract the cleaned router into `src/newtab/core/storage-dispatcher.js` (`window.HomebaseStorageDispatcher`).

### Question E: Risk Assessment
- **Startup Sequence Risk:** **ZERO (0).**
  - The storage listener is purely reactive to runtime storage events. It does not run during critical startup hydration or layout.
- **Cross-Tab Synchronization Risk:** **MEDIUM.**
  - If any subsystem change handler is skipped, changes made in the Options page or another open tab (e.g., toggling 24-hour time, changing wallpaper, or editing bookmark tags) will not immediately reflect in the active new-tab dashboard until page reload.
- **State Mutation Risk (Bookmark Metadata):** **MEDIUM.**
  - `folderMetadata` and `bookmarkMetadata` are shared variables. Any extraction must ensure their references remain accurate across modules.

---

## 6. Metrics & Line Reduction Estimates

- **Current line footprint in `src/new-tab.js`:** 66 lines (L1798–1863).
- **Estimated lines removed from `src/new-tab.js`:** **~55–60 lines**.
- **Estimated lines added to `new-tab.js` (orchestration call):** **~4–6 lines** (e.g. `HomebaseStorageDispatcher.initialize(...)`).
- **New module size (`src/newtab/core/storage-dispatcher.js`):** **~60–80 lines** (including JSDoc and defensive guards).

---

## 7. Recommendation: EXTRACT (via Two-Phase Plan)

### Verdict: **EXTRACT**
Unlike Checkpoint 14-C (which touched sensitive startup orchestration with near-zero line savings), Checkpoint 14-D offers:
1. **High line reduction:** Eliminates ~60 lines from `src/new-tab.js`.
2. **Zero startup risk:** Operates completely outside `initializePage()`.
3. **High architectural value:** Converts ad-hoc inline mutations into a clean, uniform pub/sub or delegation architecture across all 5 dashboard subsystems.

### Recommended Implementation Plan for Future Checkpoint:
- **Step 1:** Add `handleStorageChange` to `wallpaper-controller.js` and `bookmark-grid-controller.js`.
- **Step 2:** Create `src/newtab/core/storage-dispatcher.js` exposing `window.HomebaseStorageDispatcher`.
- **Step 3:** Add script tag to `src/new-tab.html` in Core runtime section.
- **Step 4:** Replace lines 1798–1863 in `src/new-tab.js` with `HomebaseStorageDispatcher.initialize(...)`.
- **Step 5:** Verify with static checks and multi-tab storage smoke tests.

---

## 8. Status Confirmation

- **Source edits performed:** 0
- **Commits:** 0
- **Pushes:** 0
- **Audit complete.** Awaiting user review and direction.
