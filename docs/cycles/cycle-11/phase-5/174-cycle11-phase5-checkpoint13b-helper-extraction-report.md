# Homebase Cycle #11 Phase 5 — Checkpoint 13-B Helper Extraction Report

**Phase**: Cycle #11 Phase 5  
**Checkpoint**: 13-B (Helper Function Extraction)  
**Status**: Verification Completed (STOPPED awaiting approval before commit)

---

## 1. Executive Summary

Checkpoint 13-B extracts two remaining utility/helper functions out of `src/new-tab.js` into their respective canonical domain modules:
1. `revealWidget(selector)` moved to [src/newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js)
2. `openBookmarkIconPicker(context = {})` moved to [src/newtab/bookmarks/bookmark-editor-adapter.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js)

Both extractions preserve exact defensive behavior and provide backward-compatible global bridges on `window`.

---

## 2. Ownership Audit

### A. `revealWidget(selector)`
- **Previous Owner**: `src/new-tab.js` (loaded last at script index 61).
- **New Canonical Owner**: [src/newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js) (loaded at script index 22, well ahead of all consumer widgets).
- **Callers Identified**:
  - `src/newtab/widgets/weather.js` (lines 164, 204, 597)
  - `src/newtab/widgets/todo.js` (line 130)
  - `src/newtab/widgets/time.js` (line 27)
  - `src/newtab/widgets/quote.js` (line 142)
  - `src/newtab/widgets/news.js` (lines 502, 541, 551, 578)
  - `src/newtab/search/search-ui-controller.js` (lines 721-722)
- **Script Order Alignment**: In [src/new-tab.html](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), `widget-visibility.js` is loaded prior to `time.js`, `todo.js`, `quote.js`, `weather.js`, and `news.js`. Making `widget-visibility.js` the canonical owner resolves any deferred initialization dependency ordering issues.
- **Defensive Behavior**: Preserved exact DOM null checks: `const el = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector(selector) : null; if (!el) return;`.

### B. `openBookmarkIconPicker(context = {})`
- **Previous Owner**: `src/new-tab.js`.
- **New Canonical Owner**: [src/newtab/bookmarks/bookmark-editor-adapter.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js).
- **Callers Identified**:
  - `src/newtab/bookmarks/bookmark-editor-adapter.js` (internal context factory `createBookmarkEditorContext`)
  - `src/assets/js/bookmark-editor.js` (dialog callback `context.openBookmarkIconPicker(...)`)
- **Script Order Alignment**: `newtab/core/asset-loader.js` (providing `loadScriptOnce`) loads at line 3329, before `bookmark-editor-adapter.js` at line 3361.
- **Defensive Behavior**: Includes primary `loadScriptOnce`, secondary `window.loadScriptOnce`, and dynamic `<script>` tag insertion fallback, matching `ensureBookmarkEditor`.

---

## 3. Files Changed & Line Reduction

### Files Changed:
1. [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)
2. [src/newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js)
3. [src/newtab/bookmarks/bookmark-editor-adapter.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/bookmarks/bookmark-editor-adapter.js)

### Line Metrics:

| File | Before Checkpoint 13-B | After Checkpoint 13-B | Net Change |
|---|---|---|---|
| `src/new-tab.js` | 1,978 lines | **1,948 lines** | **-30 lines** |
| `src/newtab/widgets/widget-visibility.js` | 231 lines | **242 lines** | **+11 lines** |
| `src/newtab/bookmarks/bookmark-editor-adapter.js` | 278 lines | **316 lines** | **+38 lines** |

---

## 4. Compatibility Bridges

### A. Widget Visibility (`widget-visibility.js`):
- Top-level function `revealWidget(selector)` for classic global deferred script scope.
- Global attachment:
  ```javascript
  if (typeof window !== 'undefined') {
    window.revealWidget = revealWidget;
  }
  ```

### B. Bookmark Editor Adapter (`bookmark-editor-adapter.js`):
- Controller exposure:
  `window.HomebaseBookmarkEditorAdapter.openBookmarkIconPicker = openBookmarkIconPicker;`
- Global compatibility bridge:
  `window.openBookmarkIconPicker = openBookmarkIconPicker;`
- CommonJS export:
  `module.exports.openBookmarkIconPicker = openBookmarkIconPicker;`

---

## 5. Verification Results

All automated verification commands succeeded cleanly:

1. **Syntax Validation**:
   ```powershell
   node --check src/new-tab.js src/newtab/widgets/widget-visibility.js src/newtab/bookmarks/bookmark-editor-adapter.js
   # Output: Exit code 0 (PASS)
   ```

2. **Static Invariants & Collision Scanner**:
   ```powershell
   node scripts/check-newtab-static.mjs
   # Output:
   # PASS deferred local script files exist - 61 deferred local scripts checked
   # PASS preload.js script tag exists once - 1 found
   # PASS preload.js remains in head - head script preserved
   # PASS preload.js remains synchronous - no defer/async/module
   # PASS preload.js file exists - src\preload.js
   # PASS new-tab.js is last deferred runtime script - last deferred script: new-tab.js
   # PASS key extracted module paths exist - 41 module paths checked
   # PASS no old flat newtab/*.js path references - none found
   # PASS no root-level src/newtab/*.js module files - none found
   # PASS no stale moved lazy-load path references - none found
   # PASS no cross-script top-level declaration collisions - 912 unique top-level declarations verified across 61 deferred scripts
   ```

3. **Browser Smoke Test (CDP Harness)**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   # Output:
   # PASS browser launched - msedge.exe
   # PASS loaded page - http://127.0.0.1:49951/new-tab.html
   # PASS required DOM surfaces exist
   # PASS core controllers are available
   # PASS startup perf helpers are available
   # PASS fast-widget-order preload applied - order: news > todo > quote > weather
   # PASS no ReferenceError or severe runtime errors
   ```

4. **Unit Test Suite (node:test)**:
   ```powershell
   npm.cmd test
   # Output:
   # Total: 4/4 stages passed.
   # 350 / 350 unit tests passed (0 failures, 0 skipped).
   ```

5. **Extension Build**:
   ```powershell
   npm.cmd run build
   # Output:
   # Built chrome -> dist\chrome
   # Built firefox -> dist\firefox
   ```

6. **Whitespace & Formatting Integrity**:
   ```powershell
   git diff --check
   # Output: 0 whitespace/indentation errors
   ```

---

## 6. Protected Subsystem Confirmation

Diff check against protected files:
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
# Output: (empty / 0 diff)
```
- `src/preload.js`: **UNTOUCHED**
- `src/instant_load.js`: **UNTOUCHED**
- `manifests/*`: **UNTOUCHED**
- `dist/*`: **UNTOUCHED**

---

## 7. Status & Next Steps

All changes are staged in the working tree. No commit or push has been performed.

Awaiting owner approval to stage and commit Checkpoint 13-B.
