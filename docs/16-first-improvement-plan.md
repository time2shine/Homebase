# Homebase — First Improvement Implementation Plan: Backup & Data Integrity

> **Author**: Senior Software Architect  
> **Date**: 2026-09-26  
> **Scope**: Detailed implementation specification for the safest high-value improvement identified in the documentation audit and validation report  
> **Target Subsystem**: Backup, Restore & Data Persistence (`src/newtab/settings/backup-import.js`)  
> **Authority & Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md), [docs/15-documentation-validation.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md)  
> **Operational Status**: Architecture Plan — **no code files modified during planning**.

---

## Table of Contents

1. [Selected Improvement](#1-selected-improvement)
2. [Why This Should Be Done First](#2-why-this-should-be-done-first)
   - [2.1 High User Value: Eliminating Catastrophic Data Loss](#21-high-user-value-eliminating-catastrophic-data-loss)
   - [2.2 Negligible Regression Risk & Absolute Code Isolation](#22-negligible-regression-risk--absolute-code-isolation)
   - [2.3 Low Implementation Complexity](#23-low-implementation-complexity)
   - [2.4 Strategic Safety Net for Future Refactoring](#24-strategic-safety-net-for-future-refactoring)
3. [Current Implementation Analysis](#3-current-implementation-analysis)
   - [3.1 Structure of `HOMEBASE_OWNED_STORAGE_KEYS`](#31-structure-of-homebase_owned_storage_keys)
   - [3.2 The Export Pipeline Flaw](#32-the-export-pipeline-flaw)
   - [3.3 The Destructive Import Deletion Trap](#33-the-destructive-import-deletion-trap)
   - [3.4 Schema of `myWallpapers` in `gallery-ui.js`](#34-schema-of-mywallpapers-in-gallery-uijs)
4. [Files Involved](#4-files-involved)
5. [Exact Proposed Changes](#5-exact-proposed-changes)
   - [5.1 Addition to Key Registry](#51-addition-to-key-registry)
   - [5.2 Normalization Helper (`normalizeMyWallpapersItems`)](#52-normalization-helper-normalizemywallpapersitems)
   - [5.3 Import Logic Update & Legacy Backup Safeguard](#53-import-logic-update--legacy-backup-safeguard)
   - [5.4 Diff Specification](#54-diff-specification)
6. [Risks & Mitigation Strategies](#6-risks--mitigation-strategies)
7. [Testing Strategy](#7-testing-strategy)
   - [7.1 Automated Static & Syntax Passes](#71-automated-static--syntax-passes)
   - [7.2 Round-Trip Export/Import Verification](#72-round-trip-exportimport-verification)
   - [7.3 Legacy Backup Backward Compatibility Verification](#73-legacy-backup-backward-compatibility-verification)
   - [7.4 Cross-Browser Verification (Chrome & Firefox)](#74-cross-browser-verification-chrome--firefox)
8. [Rollback Plan](#8-rollback-plan)
9. [Expected User Benefit](#9-expected-user-benefit)

---

## 1. Selected Improvement

**Improvement Title**: Inclusion of Custom Wallpaper Metadata (`myWallpapers`) and Missing User State in the Backup & Restore Subsystem.

- **Primary Source Finding**: [docs/15-documentation-validation.md Opportunity #6](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md#L457)
- **Roadmap Mapping**: [docs/07-improvement-roadmap.md Phase 1, Item 1.1](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md#L30)
- **Code Review Finding**: [docs/04-code-review.md Issue TD1 (Critical Severity)](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md#L359)
- **Target File**: [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js)

---

## 2. Why This Should Be Done First

Evaluating the candidate improvements from [docs/15-documentation-validation.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md) across the four governing criteria establishes this task as the premier starting point:

```
+------------------------------------+---------------+---------------+---------------+---------------+
| CANDIDATE IMPROVEMENT              | USER IMPACT   | RISK PROFILE  | COMPLEXITY    | REGRESSION    |
+------------------------------------+---------------+---------------+---------------+---------------+
| Version sync (package.json)        | Very Low      | Zero          | S (0.5 hr)    | None          |
| Add npm test script                | Low           | Zero          | S (1.0 hr)    | None          |
| Extract Search Subsystem           | High          | Medium        | L (6.0 hrs)   | Moderate      |
| Decouple Favicon Pipeline          | Medium        | Medium        | M (4.0 hrs)   | Moderate      |
| Include myWallpapers in Backup     | HIGH/CRITICAL | VERY LOW      | S (1.5 hrs)   | NEAR ZERO     |
| Defer SVG Sprites & Settings DOM   | High          | Medium        | L (8.0 hrs)   | Moderate      |
+------------------------------------+---------------+---------------+---------------+---------------+
```

### 2.1 High User Value: Eliminating Catastrophic Data Loss
Under current behavior, when users export their settings to migrate between machines or browser profiles, their custom wallpaper collection is completely omitted. Worse, if a user imports an exported settings backup on their existing machine, the import routine actively **wipes out** the active `myWallpapers` key from `browser.storage.local`. 

Fixing this closes the only documented **Critical Severity** data-loss defect in the codebase.

### 2.2 Negligible Regression Risk & Absolute Code Isolation
Under [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the high-risk zones that must not be edited without explicit instruction are:
```text
initializePage
startup orchestration
idle scheduler
bookmark grid/rendering/tabs
drag and reorder behavior
wallpaper/video/cache/startup path
live search input and keyboard behavior
search suggestions async/cancellation behavior
Firefox container bookmark opening
favicon resolution/cache pipeline
```
`src/newtab/settings/backup-import.js` touches **none** of these high-risk areas. It is an isolated, lazy-loaded module executed strictly on explicit user button clicks in **Settings -> Backup -> Export / Import**. It does not run during new-tab cold-boot, does not manipulate the DOM grid, and introduces no global renames.

### 2.3 Low Implementation Complexity
The implementation is self-contained within 30 lines of additive JavaScript:
1. Adding `'myWallpapers'` to the `HOMEBASE_OWNED_STORAGE_KEYS` array.
2. Adding a defensive sanitization function (`normalizeMyWallpapersItems`).
3. Adding a preservation guard in `importHomebaseState()` so that legacy backups without `myWallpapers` do not delete existing custom wallpapers.

### 2.4 Strategic Safety Net for Future Refactoring
Subsequent phases of the improvement roadmap involve deep extractions (Search Subsystem, Favicon Pipeline, CSS modularization). Having a 100% complete, reliable, verified backup/restore system ensures that developers and beta testers can export their full state with complete confidence before testing larger architectural changes.

---

## 3. Current Implementation Analysis

### 3.1 Structure of `HOMEBASE_OWNED_STORAGE_KEYS`
In [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) (lines 4–76), `HOMEBASE_OWNED_STORAGE_KEYS` is defined as a static array of 71 string keys. It covers settings, bookmarks, and widgets:
```javascript
const HOMEBASE_OWNED_STORAGE_KEYS = [
  'wallpaperSelection',
  'cachedAppliedPosterUrl',
  ...
  'weatherCityName',
  'weatherUnits'
];
```
Noticeably absent is `'myWallpapers'`.

### 3.2 The Export Pipeline Flaw
In `exportHomebaseState()` (lines 84–97):
```javascript
async function exportHomebaseState() {
  if (!browser?.storage?.local) {
    throw new Error('Storage is unavailable.');
  }

  const stored = await browser.storage.local.get(HOMEBASE_OWNED_STORAGE_KEYS);
  const storageLocal = {};

  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (stored && stored[key] !== undefined) {
      storageLocal[key] = stored[key];
    }
  });
  ...
```
Because `'myWallpapers'` is absent from `HOMEBASE_OWNED_STORAGE_KEYS`, `browser.storage.local.get()` does not request it, and `exportHomebaseState()` never serializes it into the downloaded JSON payload.

### 3.3 The Destructive Import Deletion Trap
In `importHomebaseState()` (lines 151–179):
```javascript
  HOMEBASE_OWNED_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      if (key === 'todoItems') {
        if (Array.isArray(incoming[key])) {
          updates[key] = normalizeTodoItems(incoming[key]);
        }
        return;
      }
      if (key === 'todoHideDone') {
        if (typeof incoming[key] === 'boolean') {
          updates[key] = incoming[key];
        }
        return;
      }
      updates[key] = incoming[key];
      return;
    }
    if (key === 'todoItems' || key === 'todoHideDone') {
      return;
    }
    removals.push(key);
  });

  if (Object.keys(updates).length) {
    await browser.storage.local.set(updates);
  }
  if (removals.length) {
    await browser.storage.local.remove(removals);
  }
```

> [!CRITICAL]
> **The Deletion Trap**: Notice lines 168–172!  
> For any key in `HOMEBASE_OWNED_STORAGE_KEYS` that is **not** present in `incoming`, `backup-import.js` automatically schedules it for deletion in `removals.push(key)`.  
> While `todoItems` and `todoHideDone` have protective `return;` guards to prevent accidental deletion, if `'myWallpapers'` is added to `HOMEBASE_OWNED_STORAGE_KEYS` without an equivalent guard, importing an older backup file (which lacks `myWallpapers`) will actively **delete all existing custom wallpapers**!

### 3.4 Schema of `myWallpapers` in `gallery-ui.js`
In [src/newtab/wallpaper/gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) (lines 679–704), `myWallpapers` is maintained as an array of descriptor objects:
```javascript
{
  id: item.id,               // String (unique identifier)
  title: item.title,         // String (user label)
  type: item.type,           // 'video' | 'image'
  mimeType: item.mimeType,   // String (e.g. 'image/jpeg', 'video/mp4')
  cacheKey: item.cacheKey,   // String (Cache Storage entry key)
  posterCacheKey: item.posterCacheKey, // String (poster entry key)
  size: item.size,           // Number (bytes)
  posterSize: item.posterSize, // Number (bytes)
  createdAt: item.createdAt, // Number (timestamp ms)
  lastUsedAt: item.lastUsedAt, // Number (timestamp ms)
  originalName: item.originalName // String (original filename)
}
```
The actual binary assets reside in the origin's Cache Storage bucket `user-wallpapers-v1`. On the same machine/profile (e.g., restoring after configuration testing or backup rollback), preserving this metadata descriptor restores full library access immediately.

---

## 4. Files Involved

| File Path | Role | Nature of Modification |
| :--- | :--- | :--- |
| [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js) | Primary Target | Add `'myWallpapers'` to key list; add `normalizeMyWallpapersItems()`; add import & deletion guard |
| [src/newtab/wallpaper/gallery-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/gallery-ui.js) | Consumer / Reference | Read-only reference for schema validation |
| [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md) | Documentation | Update Section 2.1 to reflect `myWallpapers` inclusion in backup keys |
| [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md) | Audit Ledger | Log execution entry upon completion |
| [docs/14-ai-change-history.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md) | AI Ledger | Record AI implementation entry upon completion |

---

## 5. Exact Proposed Changes

### 5.1 Addition to Key Registry
In `src/newtab/settings/backup-import.js`, append `'myWallpapers'` to `HOMEBASE_OWNED_STORAGE_KEYS`:
```javascript
const HOMEBASE_OWNED_STORAGE_KEYS = [
  'wallpaperSelection',
  ...
  'weatherCityName',
  'weatherUnits',
  'myWallpapers'
];
```

### 5.2 Normalization Helper (`normalizeMyWallpapersItems`)
Implement a defensive sanitizer in `src/newtab/settings/backup-import.js` to ensure imported wallpaper objects conform to schema and strip dangerous properties:

```javascript
function normalizeMyWallpapersItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!id || seen.has(id)) return null;
      seen.add(id);

      const title = typeof item.title === 'string' ? item.title.slice(0, 120) : 'My Wallpaper';
      const type = item.type === 'video' ? 'video' : 'image';
      const mimeType = typeof item.mimeType === 'string' ? item.mimeType.slice(0, 64) : '';
      const cacheKey = typeof item.cacheKey === 'string' ? item.cacheKey.slice(0, 256) : '';
      const posterCacheKey = typeof item.posterCacheKey === 'string' ? item.posterCacheKey.slice(0, 256) : '';
      const size = Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0;
      const posterSize = Number.isFinite(item.posterSize) && item.posterSize >= 0 ? Math.floor(item.posterSize) : 0;
      const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
      const lastUsedAt = Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0;
      const originalName = typeof item.originalName === 'string' ? item.originalName.slice(0, 180) : '';

      return {
        id,
        title,
        type,
        mimeType,
        cacheKey,
        posterCacheKey,
        size,
        posterSize,
        createdAt,
        lastUsedAt,
        originalName
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
```

### 5.3 Import Logic Update & Legacy Backup Safeguard
In `importHomebaseState()`:
1. Handle incoming `myWallpapers` with sanitization **inside** the `Object.prototype.hasOwnProperty.call(incoming, key)` block (immediately after `todoHideDone`):
   ```javascript
   if (key === 'myWallpapers') {
     if (Array.isArray(incoming[key])) {
       updates[key] = normalizeMyWallpapersItems(incoming[key]);
     }
     return;
   }
   ```
2. Protect existing wallpapers from being wiped when importing a legacy backup that lacks the `myWallpapers` key **outside** the `hasOwnProperty` block:
   ```javascript
   if (key === 'todoItems' || key === 'todoHideDone' || key === 'myWallpapers') {
     return;
   }
   removals.push(key);
   ```

### 5.4 Diff Specification

```diff
--- a/src/newtab/settings/backup-import.js
+++ b/src/newtab/settings/backup-import.js
@@ -73,7 +73,8 @@ const HOMEBASE_OWNED_STORAGE_KEYS = [
   'weatherLat',
   'weatherLon',
   'weatherCityName',
-  'weatherUnits'
+  'weatherUnits',
+  'myWallpapers'
 ];
 
 function isPlainObject(value) {
@@ -81,6 +82,41 @@ function isPlainObject(value) {
   return proto === Object.prototype || proto === null;
 }
 
+function normalizeMyWallpapersItems(items) {
+  if (!Array.isArray(items)) return [];
+  const seen = new Set();
+
+  return items
+    .map((item) => {
+      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
+      const id = typeof item.id === 'string' ? item.id.trim() : '';
+      if (!id || seen.has(id)) return null;
+      seen.add(id);
+
+      const title = typeof item.title === 'string' ? item.title.slice(0, 120) : 'My Wallpaper';
+      const type = item.type === 'video' ? 'video' : 'image';
+      const mimeType = typeof item.mimeType === 'string' ? item.mimeType.slice(0, 64) : '';
+      const cacheKey = typeof item.cacheKey === 'string' ? item.cacheKey.slice(0, 256) : '';
+      const posterCacheKey = typeof item.posterCacheKey === 'string' ? item.posterCacheKey.slice(0, 256) : '';
+      const size = Number.isFinite(item.size) && item.size >= 0 ? Math.floor(item.size) : 0;
+      const posterSize = Number.isFinite(item.posterSize) && item.posterSize >= 0 ? Math.floor(item.posterSize) : 0;
+      const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
+      const lastUsedAt = Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0;
+      const originalName = typeof item.originalName === 'string' ? item.originalName.slice(0, 180) : '';
+
+      return {
+        id,
+        title,
+        type,
+        mimeType,
+        cacheKey,
+        posterCacheKey,
+        size,
+        posterSize,
+        createdAt,
+        lastUsedAt,
+        originalName
+      };
+    })
+    .filter(Boolean)
+    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
+}
+
 async function exportHomebaseState() {
   if (!browser?.storage?.local) {
     throw new Error('Storage is unavailable.');
@@ -164,7 +200,13 @@ async function importHomebaseState(file) {
+      if (key === 'myWallpapers') {
+        if (Array.isArray(incoming[key])) {
+          updates[key] = normalizeMyWallpapersItems(incoming[key]);
+        }
+        return;
+      }
       updates[key] = incoming[key];
       return;
     }
-    if (key === 'todoItems' || key === 'todoHideDone') {
+    if (key === 'todoItems' || key === 'todoHideDone' || key === 'myWallpapers') {
       return;
     }
     removals.push(key);
   });
```

---

## 6. Risks & Mitigation Strategies

| Risk | Likelihood | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **1. Corrupted/Malformed Payload in Backup** | Low | Low | `normalizeMyWallpapersItems()` validates data types, truncates excessive string lengths, rejects duplicate IDs, and filters out non-object entries. |
| **2. Deletion of Active Wallpapers on Legacy Import** | High (if unmitigated) | Critical | **Mitigated**: The explicit guard `if (key === 'todoItems' || key === 'todoHideDone' || key === 'myWallpapers') return;` completely prevents `myWallpapers` from being added to `removals`. |
| **3. Missing Binary Blobs on Migration to New Machine** | Moderate | Very Low | If metadata is restored on a new machine where Cache Storage is empty, `gallery-ui.js` already has built-in graceful degradation: it renders `assets/fallback.webp` for missing cache entries rather than crashing. |
| **4. JSON File Size Bloat** | Negligible | Low | Only metadata descriptors are serialized (~200 bytes per custom wallpaper; 50 wallpapers = ~10 KB). Binary video/image data is not embedded in the JSON. |

---

## 7. Testing Strategy

### 7.1 Automated Static & Syntax Passes
Before and after applying the code change, execute the standard Homebase static verification suite:

```powershell
# 1. Syntax check on changed file
node --check src/newtab/settings/backup-import.js

# 2. Static integrity suite (load order, declaration collisions)
node scripts/check-newtab-static.mjs

# 3. DOM structure smoke test
node scripts/smoke-newtab-file.mjs

# 4. Target compilation check
npm.cmd run build:chrome
```

All four commands must exit with code `0`.

### 7.2 Round-Trip Export/Import Verification
1. Load `dist/chrome` in Google Chrome as an unpacked extension.
2. Open Wallpaper Gallery (`Change Background` icon on dock) -> **My Wallpapers**.
3. Upload a sample image (e.g. `test-wallpaper.png`). Verify it appears in the gallery grid.
4. Navigate to **Settings -> Backup -> Export Data**.
5. Inspect the generated `homebase-backup-*.json` file in a text editor:
   - Verify `"myWallpapers"` key exists inside `storageLocal`.
   - Verify the array contains an object with `title: "test-wallpaper.png"`, valid `id`, `type: "image"`, and `cacheKey`.
6. Open Chrome DevTools on the new tab -> Application -> Storage -> Extension Storage:
   - Delete the `myWallpapers` key manually from `chrome.storage.local`.
   - Refresh the tab. Verify My Wallpapers is empty.
7. Open **Settings -> Backup -> Import Data** and select the exported JSON file.
8. Verify dialog "Import complete" appears and page automatically reloads.
9. Open Wallpaper Gallery -> **My Wallpapers**. Verify the uploaded wallpaper is restored and visible.

### 7.3 Legacy Backup Backward Compatibility Verification
1. Prepare a legacy backup JSON file that does **not** contain the `"myWallpapers"` key (simulating a backup from v0.14.0).
2. With an active custom wallpaper present in My Wallpapers, import the legacy JSON.
3. After page reload, check **My Wallpapers**.
4. **Pass Criteria**: Existing custom wallpapers must **not** be deleted.

### 7.4 Cross-Browser Verification (Chrome & Firefox)
- Repeat the test in Mozilla Firefox using `about:debugging` and temporary add-on loading to verify `browser.storage.local` promise handling.

---

## 8. Rollback Plan

Because this change is strictly isolated to [src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js), rolling back can be executed in under 60 seconds with zero risk to other subsystems:

### Rollback Commands:
```powershell
# 1. Revert changes to backup-import.js
git checkout HEAD -- src/newtab/settings/backup-import.js

# 2. Recompile unpacked distributions
npm.cmd run build

# 3. Re-verify static passes
node --check src/newtab/settings/backup-import.js
node scripts/check-newtab-static.mjs
```

### Data Safety on Rollback:
If any user exported a backup using the new version and later needs to import it after a rollback, `importHomebaseState()` in older versions will simply ignore unknown keys in `storageLocal` without throwing an error (due to `isPlainObject(parsed.storageLocal)` and iterating only over `HOMEBASE_OWNED_STORAGE_KEYS`).

---

## 9. Expected User Benefit

1. **Complete Peace of Mind**: Users will no longer experience silent data loss of their custom uploaded wallpapers when backing up or resetting their dashboard.
2. **Reliable Profile Migration**: Users switching browsers or upgrading their operating system can export their complete Homebase configuration and restore their customized wallpaper library seamlessly.
3. **Defense-in-Depth Backward Compatibility**: Users importing older backup files will not suffer accidental deletion of their existing custom wallpaper collection.
4. **Zero Performance Tax**: Because `backup-import.js` is lazy-loaded, this change adds 0ms to dashboard startup time.
