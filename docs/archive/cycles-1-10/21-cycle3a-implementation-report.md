# Homebase — Improvement Cycle #3A Implementation Report
## Backup Completeness & Storage Key Alignment

> **Author**: Core Extension Architect & Systems Engineer  
> **Date**: 2026-09-27  
> **Cycle ID**: Cycle #3A  
> **Target Release**: Homebase v0.15.1  
> **Reference Issues**: [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md) (Issues S1, S2, S3), [docs/20-third-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md)  
> **Status**: COMPLETED & VERIFIED

---

## 1. Executive Summary

Homebase Improvement Cycle #3A resolves three critical storage layer vulnerabilities identified during the comprehensive storage audit in [docs/20-third-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md):

1. **Issue S1 — Destructive Backup Import**: Importing partial, targeted, or older backups previously deleted any unrepresented storage key via an aggressive `browser.storage.local.remove(removals)` pass. This has been completely eliminated; backup restoration is now strictly non-destructive.
2. **Issue S2 — Missing Owned Storage Keys**: `homebaseRecentSaveFolders` (recent bookmark save folders in the action popup) and `lastUsedBookmarkFolderId` were missing or misaligned in `HOMEBASE_OWNED_STORAGE_KEYS`. Both are now registered as owned keys with input sanitization.
3. **Issue S3 — Action Popup Key Mismatch**: `src/action-popup/action-popup.js` utilized `homebaseLastUsedFolderId` while the new tab dashboard utilized `lastUsedBookmarkFolderId`. A bidirectional, backward-compatible migration path has been deployed featuring fallback resolution, startup migration, dual-write on persist, and automatic backup import mapping.

All changes adhere strictly to the project rules defined in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md): zero external dependencies, classic `<script defer>` architecture preserved, zero edits to `new-tab.js`, CSS, HTML, manifests, or `dist/`.

---

## 2. Technical Modifications

### 2.1 Non-Destructive Backup Import (`src/newtab/settings/backup-import.js`)

#### Previous Vulnerability:
The previous implementation accumulated all owned keys not explicitly present in `incoming` into a `removals` array, except for three hardcoded exceptions (`todoItems`, `todoHideDone`, `myWallpapers`):
```js
// PREVIOUS VULNERABLE CODE:
HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
  if (Object.prototype.hasOwnProperty.call(incoming, key)) {
    // updates[key] = ...
    return;
  }
  if (key === 'todoItems' || key === 'todoHideDone' || key === 'myWallpapers') {
    return;
  }
  removals.push(key);
});
// ...
if (removals.length) {
  await browser.storage.local.remove(removals); // <-- Wiped user data
}
```
Furthermore, the `localStorage` fast mirror synchronization indiscriminately called `localStorage.removeItem(...)` for omitted keys like `appBackgroundDim`.

#### Implemented Solution:
- Completely eliminated the `removals` array and `browser.storage.local.remove(removals)`.
- Replaced with a non-destructive, selective update pattern: only keys explicitly present in the imported backup payload are validated, sanitized, and passed to `browser.storage.local.set(updates)`.
- Added defensive guards around `localStorage` fast mirror updates: mirrors are only updated if their corresponding key exists in `incoming`; no removals are executed for omitted keys.

### 2.2 Storage Key Registration & Sanitization

- Added `'homebaseRecentSaveFolders'` to `HOMEBASE_OWNED_STORAGE_KEYS`.
- Confirmed `'lastUsedBookmarkFolderId'` is registered in `HOMEBASE_OWNED_STORAGE_KEYS`.
- Added array and string sanitization for `homebaseRecentSaveFolders` during import:
```js
if (key === 'homebaseRecentSaveFolders') {
  if (Array.isArray(incoming[key])) {
    updates[key] = incoming[key]
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
      .slice(0, 6);
  }
  return;
}
```

### 2.3 Action Popup Key Alignment (`src/action-popup/action-popup.js`)

To bridge the gap between `homebaseLastUsedFolderId` (action popup) and `lastUsedBookmarkFolderId` (dashboard):

1. **Canonical Key Definition**:
   ```js
   const LAST_USED_FOLDER_KEY = 'lastUsedBookmarkFolderId';
   const LEGACY_LAST_USED_FOLDER_KEY = 'homebaseLastUsedFolderId';
   ```
2. **Fallback Resolver**:
   ```js
   function resolveLastUsedFolderId(stored) {
     if (typeof stored?.[LAST_USED_FOLDER_KEY] === 'string' && stored[LAST_USED_FOLDER_KEY].trim()) {
       return stored[LAST_USED_FOLDER_KEY].trim();
     }
     if (typeof stored?.[LEGACY_LAST_USED_FOLDER_KEY] === 'string' && stored[LEGACY_LAST_USED_FOLDER_KEY].trim()) {
       return stored[LEGACY_LAST_USED_FOLDER_KEY].trim();
     }
     return '';
   }
   ```
3. **Startup Migration**:
   On popup initialization, `loadPopupStorageState()` queries both `[LAST_USED_FOLDER_KEY, LEGACY_LAST_USED_FOLDER_KEY]`. If the legacy key is present but the canonical key is empty, the popup automatically writes `lastUsedBookmarkFolderId` to `browser.storage.local`.
4. **Dual-Write on Persist**:
   When the user selects a bookmark folder, `persistLastUsedFolderId()` persists to both keys:
   ```js
   await browser.storage.local.set({
     [LAST_USED_FOLDER_KEY]: folderId,
     [LEGACY_LAST_USED_FOLDER_KEY]: folderId
   });
   ```
5. **Backup Import Backward Compatibility**:
   In `src/newtab/settings/backup-import.js`, if an imported backup contains `homebaseLastUsedFolderId` but lacks `lastUsedBookmarkFolderId`, it automatically maps the legacy value to the canonical key:
   ```js
   if (
     Object.prototype.hasOwnProperty.call(incoming, 'homebaseLastUsedFolderId') &&
     !Object.prototype.hasOwnProperty.call(incoming, 'lastUsedBookmarkFolderId')
   ) {
     if (typeof incoming['homebaseLastUsedFolderId'] === 'string') {
       incoming['lastUsedBookmarkFolderId'] = incoming['homebaseLastUsedFolderId'];
     }
   }
   ```

---

## 3. Unit Test Suite Expansion (`tests/unit/backup-validation.test.mjs`)

The native Node.js test suite was expanded with 5 comprehensive test specifications:

1. **`partial backup does not delete missing keys during import`**:
   - Seeds mock storage with pre-existing metadata (`bookmarkCustomMetadata`, `folderCustomMetadata`, `domainIconMap`, `appBackgroundDim`, `widgetOrder`, `homebaseRecentSaveFolders`, `myWallpapers`).
   - Imports a partial backup containing only `todoItems` and `appShowWeather: false`.
   - Asserts that `storage.local.remove` was invoked 0 times.
   - Asserts that all pre-existing unrepresented keys remain intact with original values.
   - Asserts that explicitly provided keys were updated accurately.
2. **`action popup legacy key migration - resolveLastUsedFolderId fallback`**:
   - Verifies fallback precedence: canonical key takes priority over legacy; legacy key is utilized when canonical is absent; returns empty string if both missing.
3. **`action popup legacy key migration - backup import migrates homebaseLastUsedFolderId`**:
   - Imports a legacy backup containing only `homebaseLastUsedFolderId: 'folder-99'`.
   - Asserts that `storage.local.set` receives `lastUsedBookmarkFolderId: 'folder-99'`.
4. **`missing optional keys are preserved during backup restoration`**:
   - Sets pre-existing wallpaper pool, favorites, and custom metadata.
   - Imports a settings-only backup without wallpaper keys.
   - Asserts that wallpaper data is untouched in storage.
5. **`homebaseRecentSaveFolders is sanitized on backup import`**:
   - Verifies trimming, filtering of empty strings, rejection of non-string values, and capping at 6 recent folders.

---

## 4. Verification Results

All automated checks and build scripts pass cleanly:

```powershell
# Stage 1: Syntax Validation
node --check src/newtab/settings/backup-import.js
node --check src/action-popup/action-popup.js
node --check tests/unit/backup-validation.test.mjs
# Status: 0 errors (PASS)

# Stage 2: Static Invariants & Script Order
node scripts/check-newtab-static.mjs
# Status: PASS (37 deferred scripts, 33 module paths, 87 declarations checked)

# Stage 3: Unified Test Runner
npm.cmd test
# Status: 4/4 stages passed, 32 unit tests pass (PASS)

# Stage 4: Distribution Build
npm.cmd run build
# Status: Chrome & Firefox builds generated cleanly in dist/ (PASS)
```

### Complete Test Output:
```text
--- [Stage 1] Syntax Validation (node --check) ---
  Checked 51 JavaScript files. All syntax valid.
[PASS] Syntax Validation (node --check) (1.80s)

--- [Stage 2] Static Invariants (check-newtab-static.mjs) ---
Homebase new-tab static check
PASS deferred local script files exist - 37 deferred local scripts checked
PASS preload.js script tag exists once - 1 found
PASS preload.js remains in head - head script preserved
PASS preload.js remains synchronous - no defer/async/module
PASS preload.js file exists - src\preload.js
PASS new-tab.js is last deferred runtime script - last deferred script: new-tab.js
PASS key extracted module paths exist - 33 module paths checked
PASS no old flat newtab/*.js path references - none found
PASS no root-level src/newtab/*.js module files - none found
PASS no stale moved lazy-load path references - none found
PASS common moved declarations are not duplicated - 87 declaration names checked
[PASS] Static Invariants (check-newtab-static.mjs) (0.19s)

--- [Stage 3] Unit Tests (node:test) ---
✔ isPlainObject() - validates plain objects correctly (1.9319ms)
✔ HOMEBASE_OWNED_STORAGE_KEYS contains myWallpapers and critical keys (0.714ms)
✔ normalizeMyWallpapersItems() - sanitizes and sorts custom wallpapers (0.9228ms)
✔ normalizeMyWallpapersItems() - handles empty and non-array inputs (0.693ms)
✔ normalizeTodoItems() - sanitizes and deduplicates todo list (3.5481ms)
✔ normalizeTodoItems() - handles empty and non-array inputs (0.6859ms)
✔ partial backup does not delete missing keys during import (2.6536ms)
✔ action popup legacy key migration - resolveLastUsedFolderId fallback (1.2842ms)
✔ action popup legacy key migration - backup import migrates homebaseLastUsedFolderId (0.9089ms)
✔ missing optional keys are preserved during backup restoration (0.8823ms)
✔ homebaseRecentSaveFolders is sanitized on backup import (0.6823ms)
✔ escapeHtml() - properly escapes dangerous HTML characters (1.9072ms)
✔ shuffleArray() - preserves array length and all elements (0.7929ms)
✔ debounce() - delays invocation and debounces rapid calls (81.2415ms)
✔ debounce() - flush and cancel behavior (121.5874ms)
✔ throttle() - throttles rapid calls within interval (71.3032ms)
✔ evaluateMath() - basic arithmetic operations (2.1542ms)
✔ evaluateMath() - operator precedence (0.6872ms)
✔ evaluateMath() - leading equals sign (0.7037ms)
✔ evaluateMath() - division by zero protection (0.6583ms)
✔ evaluateMath() - invalid and non-math queries return null (0.678ms)
✔ evaluateUnits() - temperature conversions (1.3067ms)
✔ evaluateUnits() - length conversions (0.6697ms)
✔ evaluateUnits() - weight conversions (0.6477ms)
✔ evaluateUnits() - invalid or mismatched units return null (0.7125ms)
✔ isLikelyUrl() - explicit schemes (1.3774ms)
✔ isLikelyUrl() - domain names and intranet shortcuts (0.8549ms)
✔ isLikelyUrl() - search queries return false (0.5204ms)
✔ normalizeWidgetOrder() - preserves valid complete order (5.4204ms)
✔ normalizeWidgetOrder() - deduplicates and appends missing widgets (0.6159ms)
✔ normalizeWidgetOrder() - handles non-array input by returning default order (0.6435ms)
✔ areWidgetOrdersEqual() - correctly compares widget order arrays (0.5755ms)
ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
```

---

## 5. Invariants Maintained

The following files and areas were strictly left untouched:
- `src/new-tab.js`: Unmodified.
- `src/css/*`: All styles unmodified.
- `src/*.html`: All HTML structures unmodified.
- `manifests/*`: Extension permissions and manifest files unmodified.
- `dist/*`: Generated output uncommitted and excluded from source control.

---

## 6. Scope Deferred to Improvement Cycle #3B

Per the scoped instructions:
- Schema versioning (`homebase_schema_version`) and automated multi-version migration pipelines remain deferred to **Cycle #3B** as outlined in [docs/20-third-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/20-third-improvement-plan.md).
- Custom wallpaper binary storage migration remains documented for evaluation in future cycles.
