# Homebase Cycle #11 Phase 5 — Checkpoint 14-D-A Implementation Report
## Canonical Storage Event Dispatcher Extraction

**Date:** October 5, 2026  
**Phase:** Cycle #11 Phase 5 — Checkpoint 14-D-A  
**Status:** Verification Passed. No commit, no push.

---

## 1. Overview & Objectives

In Checkpoint 14-D-A, the first phase of storage dispatcher extraction was implemented.
The monolithic platform storage listener in `src/new-tab.js` was replaced with a centralized, canonical storage event router: `src/newtab/core/storage-dispatcher.js` (`window.HomebaseStorageDispatcher`).

### Objectives Met:
1. Created `src/newtab/core/storage-dispatcher.js` to serve as the dashboard's single platform `browser.storage.onChanged` listener.
2. Canonicalized event routing to active controllers:
   - **Search:** `HomebaseSearchUiController.handleStorageChange(changes, areaName)`
   - **Settings:** `HomebaseSettingsPreferences.handleStorageChange(changes, areaName)`
   - **Todo:** `handleTodoStorageChange(changes, areaName)`
3. Preserved existing bookmark and wallpaper synchronization logic in `src/new-tab.js` (`handleNewTabStorageChange`) and registered it as an active delegate via `HomebaseStorageDispatcher.initialize({ onStorageChange })`.
4. Registered `storage-dispatcher.js` in `src/new-tab.html` under Core Runtime and added static protection in `scripts/check-newtab-static.mjs`.
5. Added unit test suite `tests/unit/storage-dispatcher.test.mjs` verifying normalization, multi-controller routing, error resilience, and subscriber lifecycle.
6. Zero modifications to `initializePage()`, startup performance, drag/drop, or protected subsystems.

---

## 2. Files Changed

| File | Status | Description |
|---|---|---|
| `src/newtab/core/storage-dispatcher.js` | **Created** | Canonical storage event dispatcher (`window.HomebaseStorageDispatcher`). |
| `tests/unit/storage-dispatcher.test.mjs` | **Created** | Comprehensive unit test suite (7 tests) for storage dispatcher. |
| `src/new-tab.html` | **Modified** | Added deferred `<script src="newtab/core/storage-dispatcher.js" defer></script>` in Core Runtime. |
| `scripts/check-newtab-static.mjs` | **Modified** | Added `"newtab/core/storage-dispatcher.js"` to `keyExtractedModulePaths`. |
| `src/new-tab.js` | **Modified** | Replaced inline `browser.storage.onChanged.addListener` with `HomebaseStorageDispatcher.initialize()`. |

---

## 3. Architecture & Ownership Details

### Functions Moved / Modified:
- **`src/newtab/core/storage-dispatcher.js`:**
  - `getStorageOnChangedApi()`: Resolves `browser.storage.onChanged` or `chrome.storage.onChanged` cross-browser.
  - `addListener(listener)`: Registers a custom subscriber callback.
  - `removeListener(listener)`: Unregisters a custom subscriber callback.
  - `dispatch(changes, areaName)`: Filters to `'local'` storage, routes to Search, Settings, and Todo controllers with try/catch isolation, then dispatches to custom subscribers.
  - `initialize(options)`: Idempotently binds platform listener and registers delegate options.
  - `isInitialized()`, `getSubscribersCount()`, `resetForTesting()`: Diagnostic & testing helpers.
- **`src/new-tab.js`:**
  - Removed direct `browser.storage.onChanged.addListener` platform registration.
  - Removed direct calls to `HomebaseSearchUiController.handleStorageChange`, `HomebaseSettingsPreferences.handleStorageChange`, and `handleTodoStorageChange`.
  - Encapsulated remaining bookmark and wallpaper synchronization into `handleNewTabStorageChange(changes, area)`.
  - Added delegation call: `HomebaseStorageDispatcher.initialize({ onStorageChange: handleNewTabStorageChange })`.

### Functions Intentionally Left in Place:
- `handleNewTabStorageChange` in `src/new-tab.js`: Kept in `new-tab.js` temporarily to avoid disturbing `folderMetadata`, `bookmarkMetadata`, and `currentGridFolderNode` until bookmark metadata extraction in Phase 2.
- `initializePage()` in `src/new-tab.js`: Untouched.
- Startup performance markers & measures: Untouched.
- Drag/drop & bookmark grid listeners: Untouched.

### Globals & Dependencies:
- Exported: `window.HomebaseStorageDispatcher`
- Consumed:
  - `window.HomebaseSearchUiController.handleStorageChange`
  - `window.HomebaseSettingsPreferences.handleStorageChange`
  - `window.handleTodoStorageChange` / `handleTodoStorageChange`
  - `browser.storage.onChanged` / `chrome.storage.onChanged`

---

## 4. Full Code for Modified/Extracted Blocks

### `src/newtab/core/storage-dispatcher.js` (Full Implementation)
```javascript
// ===================================================================
// Homebase — Storage Event Dispatcher
//
// Canonical listener for browser.storage.onChanged events.
// Normalizes platform events and dispatches storage deltas across
// active dashboard controllers (Search, Settings, Todo) and registered
// subsystem delegates (Wallpaper, Bookmarks).
// ===================================================================

(function() {
  'use strict';

  let _initialized = false;
  const _subscribers = new Set();

  /**
   * Resolves the active browser storage.onChanged event across Chrome and Firefox.
   *
   * @returns {Object|null}
   */
  function getStorageOnChangedApi() {
    if (typeof window !== 'undefined') {
      if (window.browser?.storage?.onChanged?.addListener) {
        return window.browser.storage.onChanged;
      }
      if (window.chrome?.storage?.onChanged?.addListener) {
        return window.chrome.storage.onChanged;
      }
    }

    if (typeof browser !== 'undefined' && browser?.storage?.onChanged?.addListener) {
      return browser.storage.onChanged;
    }
    if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged?.addListener) {
      return chrome.storage.onChanged;
    }

    return null;
  }

  /**
   * Subscribes a custom listener to receive dispatched storage changes.
   *
   * @param {Function} listener
   */
  function addListener(listener) {
    if (typeof listener === 'function') {
      _subscribers.add(listener);
    }
  }

  /**
   * Unsubscribes a custom listener.
   *
   * @param {Function} listener
   */
  function removeListener(listener) {
    _subscribers.delete(listener);
  }

  /**
   * Dispatches storage changes to registered controllers and custom subscribers.
   * Only processes changes originating from the 'local' storage area.
   *
   * @param {Object} changes - Key-value map of storage change objects { oldValue, newValue }
   * @param {string} areaName - Storage area name ('local', 'sync', 'managed')
   */
  function dispatch(changes, areaName) {
    if (areaName !== 'local') return;
    if (!changes || typeof changes !== 'object') return;

    // 1. Search UI Controller
    if (
      typeof window !== 'undefined' &&
      window.HomebaseSearchUiController &&
      typeof window.HomebaseSearchUiController.handleStorageChange === 'function'
    ) {
      try {
        window.HomebaseSearchUiController.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Search storage handler error:', err);
      }
    }

    // 2. Settings Preferences Controller
    if (
      typeof window !== 'undefined' &&
      window.HomebaseSettingsPreferences &&
      typeof window.HomebaseSettingsPreferences.handleStorageChange === 'function'
    ) {
      try {
        window.HomebaseSettingsPreferences.handleStorageChange(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Settings storage handler error:', err);
      }
    }

    // 3. Todo Widget Handler
    const todoHandler =
      (typeof window !== 'undefined' && typeof window.handleTodoStorageChange === 'function')
        ? window.handleTodoStorageChange
        : (typeof handleTodoStorageChange === 'function' ? handleTodoStorageChange : null);

    if (typeof todoHandler === 'function') {
      try {
        todoHandler(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Todo storage handler error:', err);
      }
    }

    // 4. Custom Subscriber Delegates (e.g. Bookmarks & Wallpaper in new-tab.js)
    _subscribers.forEach((listener) => {
      try {
        listener(changes, areaName);
      } catch (err) {
        console.warn('[storage-dispatcher] Subscriber storage handler error:', err);
      }
    });
  }

  /**
   * Initializes the storage dispatcher by binding the platform storage.onChanged event.
   *
   * @param {Object|Function} [options] - Optional configuration or direct listener callback
   */
  function initialize(options = {}) {
    if (options) {
      if (typeof options === 'function') {
        addListener(options);
      } else if (typeof options.onStorageChange === 'function') {
        addListener(options.onStorageChange);
      } else if (typeof options.onStorageChanged === 'function') {
        addListener(options.onStorageChanged);
      }
    }

    if (_initialized) return;

    const storageApi = getStorageOnChangedApi();
    if (storageApi && typeof storageApi.addListener === 'function') {
      storageApi.addListener(dispatch);
      _initialized = true;
    }
  }

  const dispatcher = {
    initialize,
    addListener,
    removeListener,
    dispatch,
    isInitialized: () => _initialized,
    getSubscribersCount: () => _subscribers.size,
    resetForTesting: () => {
      _subscribers.clear();
      _initialized = false;
    }
  };

  if (typeof window !== 'undefined') {
    window.HomebaseStorageDispatcher = dispatcher;
  }
})();
```

### Delegation in `src/new-tab.js` (Lines 1798–1848)
```javascript
function handleNewTabStorageChange(changes, area) {
  if (changes[WALLPAPER_SELECTION_KEY] || changes[DAILY_ROTATION_KEY]) {
    const nextSelection = changes[WALLPAPER_SELECTION_KEY]
      ? (changes[WALLPAPER_SELECTION_KEY].newValue || null)
      : currentWallpaperSelection;
    const allowDailyRotation = changes[DAILY_ROTATION_KEY]
      ? changes[DAILY_ROTATION_KEY].newValue !== false
      : dailyRotationPreference !== false;

    syncWallpaperStartupState(nextSelection, allowDailyRotation);
  }

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
}

if (window.HomebaseStorageDispatcher && typeof window.HomebaseStorageDispatcher.initialize === 'function') {
  window.HomebaseStorageDispatcher.initialize({
    onStorageChange: handleNewTabStorageChange
  });
}
```

---

## 5. Verification Results

1. **Syntax Validation (`node --check`):**
   - `node --check src/newtab/core/storage-dispatcher.js` $\rightarrow$ **PASS**
   - `node --check src/new-tab.js` $\rightarrow$ **PASS**
   - `node --check tests/unit/storage-dispatcher.test.mjs` $\rightarrow$ **PASS**
2. **Static Invariants (`node scripts/check-newtab-static.mjs`):**
   - 62 deferred local scripts verified.
   - 42 key extracted module paths verified.
   - 911 unique top-level declarations verified across all scripts with **0 collisions**. $\rightarrow$ **PASS**
3. **Headless Browser Smoke Test (`node scripts/smoke-newtab-file.mjs`):**
   - Browser launched (Edge/Chrome CDP), page loaded, required DOM surfaces verified, core controllers and perf helpers available, **0 runtime errors**. $\rightarrow$ **PASS**
4. **Full Test Suite (`npm.cmd test`):**
   - 357 unit tests passed across 31 test files.
   - Stage 1 (Syntax): PASS (3.25s)
   - Stage 2 (Static): PASS (0.12s)
   - Stage 3 (Unit): PASS (2.77s)
   - Stage 4 (Smoke): PASS (0.88s)
   - Total: **4/4 stages passed**.
5. **Production Build (`npm.cmd run build`):**
   - Chrome build: `dist/chrome` $\rightarrow$ **PASS**
   - Firefox build: `dist/firefox` $\rightarrow$ **PASS**
6. **Git Whitespace & Format (`git diff --check`):**
   - **0 warnings / 0 errors**.
7. **Protected Subsystems Check (`git diff src/preload.js src/instant_load.js manifests/ dist/`):**
   - **0 differences** (completely untouched).

---

## 6. Items Not Verified / Manual Testing Requirements

- **Automated Validation:** Fully verified by unit test suite and headless smoke test.
- **Manual Firefox Testing Requirement:**
  - Because `browser.storage.onChanged` is an asynchronous browser extension API handling multi-tab storage persistence, manual Firefox verification is recommended before release:
    1. Open Homebase in two separate Firefox tabs.
    2. In Tab 1, toggle 24-hour time or change wallpaper in Settings.
    3. Verify that Tab 2 immediately synchronizes the change.
    4. Check console for any errors or warnings.

---

## 7. Status Confirmation

- **Edits performed:** Isolated to Checkpoint 14-D-A scope.
- **Protected files:** 100% clean.
- **Commits:** 0.
- **Pushes:** 0.
- **STOPPED per instruction.** Awaiting approval to proceed to commit preparation.
