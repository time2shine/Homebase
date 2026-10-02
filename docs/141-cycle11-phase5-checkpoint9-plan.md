# Checkpoint 9 Implementation Plan

**Cycle**: Cycle #11  
**Phase**: Phase 5 — Subsystem Isolation & State Ownership Consolidation  
**Checkpoint**: Checkpoint 9 — Dynamic Asset Loader Service Extraction  
**Date**: October 2, 2026  
**Status**: Ready for Owner Review  
**Audit Reference**: [`docs/140-cycle11-phase5-checkpoint9-audit.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/140-cycle11-phase5-checkpoint9-audit.md)  
**Target Source**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (lines 355–420)  
**Destination Module**: [`src/newtab/core/asset-loader.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/asset-loader.js)  

---

## 1. Goal

Extract the dynamic script and stylesheet loading infrastructure from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into a standalone core service module:  
[`src/newtab/core/asset-loader.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/asset-loader.js).

This extraction:
1. Resolves an architectural **inverted dependency** where extracted first-party modules (`settings-ui.js`, `bookmark-editor-adapter.js`, `dock-navigation.js`, `wallpaper-controller.js`) call back into `src/new-tab.js` for fundamental resource loading.
2. Establishes the canonical `window.HomebaseAssetLoader` service while maintaining strict backward-compatibility bridges (`window.loadScriptOnce`, `window.loadStylesheetOnce`).
3. Retains identical promise deduplication, DOM injection semantics, and error handling.
4. Safely removes ~66 lines from the monolith without touching any protected startup or drag/drop subsystems.

---

## 2. Current Ownership in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) (currently 2,469 lines), dynamic asset loading logic is located at lines 356–420:

| Symbol | Current Lines | Lines Count | Description |
|---|:---:|:---:|---|
| `scriptLoadPromises` | L356 | 1 line | `Map` storing in-flight and completed script load promises keyed by `src`. |
| `stylesheetLoadPromises` | L357 | 1 line | `Map` storing in-flight and completed stylesheet load promises keyed by `href`. |
| `loadScriptOnce(src)` | L359–L384 | 26 lines | Creates dynamic `<script async>`, deduplicates concurrent requests, handles errors, and prunes rejected promises from cache. |
| `loadStylesheetOnce(href)` | L386–L419 | 34 lines | Scans DOM for existing `<link rel="stylesheet">`, creates dynamic `<link>` if missing, deduplicates requests, and handles rejection recovery. |

---

## 3. Dependency & Caller Map

A static audit across all files in `src/` identifies the following active callers depending on dynamic asset loading:

```text
loadScriptOnce / loadStylesheetOnce:
  ├── src/newtab/core/dock-navigation.js
  │     ├── loadStylesheetOnce('assets/css/settings.css')
  │     └── loadScriptOnce('newtab/settings/settings-ui.js')
  ├── src/newtab/settings/settings-ui.js
  │     ├── loadScriptOnce('assets/js/settings-data.js')
  │     └── loadScriptOnce('newtab/wallpaper/gallery-ui.js')
  ├── src/newtab/bookmarks/bookmark-editor-adapter.js
  │     └── loadScriptOnce('assets/js/bookmark-editor.js')
  ├── src/newtab/wallpaper/wallpaper-controller.js
  │     └── loadScriptOnce('assets/js/Sortable.min.js')
  └── src/new-tab.js
        └── openBookmarkIconPicker() -> loadScriptOnce('assets/js/icon-picker.js')
```

### Script Ordering Rationale
Because `src/newtab/core/dock-navigation.js` and other early modules execute before `src/new-tab.js`, placing `asset-loader.js` near the top of the core script list in `src/new-tab.html` ensures that `window.loadScriptOnce` and `window.loadStylesheetOnce` are guaranteed to exist before any feature controller attempts lazy loading.

---

## 4. New Module Specification: `asset-loader.js`

### 4.1 Module Path
`src/newtab/core/asset-loader.js`

### 4.2 Script Format & AGENTS.md Compliance
- Classic `<script defer>` execution (no ES modules, no bundler).
- Deferred scripts share global lexical declarative scope; top-level `const scriptLoadPromises` must only exist in `asset-loader.js`.
- Strict backward compatibility via `window.HomebaseAssetLoader`, `window.loadScriptOnce`, and `window.loadStylesheetOnce`.

### 4.3 Proposed Implementation
```javascript
// =============================================================================
// Homebase Dynamic Asset Loader Service
// Module: src/newtab/core/asset-loader.js
// Handles deduplicated dynamic script and stylesheet loading with error recovery.
// =============================================================================

const scriptLoadPromises = new Map();
const stylesheetLoadPromises = new Map();

function loadScriptOnce(src) {
  if (!src) {
    return Promise.reject(new Error('Script src is required'));
  }

  if (scriptLoadPromises.has(src)) {
    return scriptLoadPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err || new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  scriptLoadPromises.set(src, promise);

  promise.catch(() => {
    scriptLoadPromises.delete(src);
  });

  return promise;
}

function loadStylesheetOnce(href) {
  if (!href) {
    return Promise.reject(new Error('Stylesheet href is required'));
  }

  if (stylesheetLoadPromises.has(href)) {
    return stylesheetLoadPromises.get(href);
  }

  const promise = new Promise((resolve, reject) => {
    const existingLink = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => link.getAttribute('href') === href);

    if (existingLink) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = (err) => reject(err || new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });

  stylesheetLoadPromises.set(href, promise);

  promise.catch(() => {
    stylesheetLoadPromises.delete(href);
  });

  return promise;
}

const HomebaseAssetLoader = {
  loadScriptOnce,
  loadStylesheetOnce,
  getScriptPromises: () => scriptLoadPromises,
  getStylesheetPromises: () => stylesheetLoadPromises
};

if (typeof window !== 'undefined') {
  window.HomebaseAssetLoader = HomebaseAssetLoader;
  window.loadScriptOnce = loadScriptOnce;
  window.loadStylesheetOnce = loadStylesheetOnce;
}
```

---

## 5. Script Registration Order in `src/new-tab.html`

In `src/new-tab.html`, register `<script src="newtab/core/asset-loader.js" defer></script>` in the early core infrastructure block immediately after `newtab/core/utils.js`:

```html
<script src="newtab/core/dialog-controller.js" defer></script>
<script src="newtab/core/context-menu-controller.js" defer></script>
<script src="newtab/core/utils.js" defer></script>
<script src="newtab/core/asset-loader.js" defer></script>
<script src="newtab/core/sortable-bridge.js" defer></script>
<script src="newtab/core/tab-lifecycle.js" defer></script>
```

This positions `asset-loader.js` before `dock-navigation.js`, `bookmark-editor-adapter.js`, `wallpaper-controller.js`, `settings-ui.js`, and `new-tab.js`.

---

## 6. Migration Steps

1. **Step 1: Create `src/newtab/core/asset-loader.js`**
   - Implement `loadScriptOnce`, `loadStylesheetOnce`, `scriptLoadPromises`, `stylesheetLoadPromises`.
   - Expose `window.HomebaseAssetLoader`, `window.loadScriptOnce`, and `window.loadStylesheetOnce`.
2. **Step 2: Update `src/new-tab.html`**
   - Insert `<script src="newtab/core/asset-loader.js" defer></script>` immediately following `newtab/core/utils.js`.
3. **Step 3: Update `scripts/check-newtab-static.mjs`**
   - Add `"newtab/core/asset-loader.js"` to `keyExtractedModulePaths`.
4. **Step 4: Prune `src/new-tab.js`**
   - Delete `scriptLoadPromises`, `stylesheetLoadPromises`, `loadScriptOnce`, and `loadStylesheetOnce` (lines 356–419).
5. **Step 5: Automated Verification Suite**
   - Run syntax validation: `node --check src/newtab/core/asset-loader.js` and `node --check src/new-tab.js`.
   - Run static scanner: `node scripts/check-newtab-static.mjs`.
   - Run unit test suite: `npm.cmd test`.
   - Run browser smoke test: `node scripts/smoke-newtab-file.mjs`.
   - Run extension packaging: `npm.cmd run build`.
   - Run real browser CDP test suite verifying asset loading, deduplication, and error recovery.

---

## 7. Protected Guardrails & Invariants

In strict adherence to [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
- **Protected Files**: `src/preload.js`, `src/instant_load.js`, `manifests/*`, and `dist/*` will remain 100% untouched (0 differences).
- **Sortable.js Drag & Drop**: Grid and tab drag handlers (`setupGridSortable`, `handleGridDrop`, `handleTabDrop`, etc.) will NOT be modified.
- **Startup Orchestration**: `initializePage()`, `scheduleStartupHydrationTasks()`, and startup guards remain in `src/new-tab.js`.
- **Idle Scheduler**: `processIdleTasks()`, `scheduleIdleTask()`, `scheduleIdleChunkedTask()` will NOT be touched.
- **Wallpaper Lifecycle**: `primeWallpaperBackground()` and video playback remain untouched.

---

## 8. Rollback Plan

If any regression occurs during implementation or verification:
```powershell
# Restore modified source and script registration
git checkout HEAD -- src/new-tab.js src/new-tab.html scripts/check-newtab-static.mjs

# Remove created asset loader file
if (Test-Path "src/newtab/core/asset-loader.js") { Remove-Item "src/newtab/core/asset-loader.js" }

# Re-run verification suite
npm.cmd test
npm.cmd run build
```

---

## 9. Verification Checklist

| Phase | Check | Command / Verification Target | Expected Result |
|---|---|---|---|
| **Syntax** | Node syntax check | `node --check src/newtab/core/asset-loader.js` | Exit code 0, no syntax errors. |
| **Syntax** | Node syntax check | `node --check src/new-tab.js` | Exit code 0, no syntax errors. |
| **Static** | Module existence & script order | `node scripts/check-newtab-static.mjs` | PASS: 59 deferred scripts, 39 key extracted modules, 0 identifier collisions. |
| **Unit Tests** | Full unit test suite | `npm.cmd test` | 343 / 343 tests pass across all stages. |
| **Smoke Test** | Edge/Chromium smoke test | `node scripts/smoke-newtab-file.mjs` | PASS: DOM, controllers, and startup perf clean. |
| **Build** | Distribution packaging | `npm.cmd run build` | PASS: `dist/chrome` and `dist/firefox` built cleanly. |
| **CDP Browser Suite** | Browser runtime verification | `scratch/verify-cycle11-phase5-cp9-browser.mjs` | PASS: `window.HomebaseAssetLoader` defined; `loadScriptOnce` and `loadStylesheetOnce` deduplicate calls; missing src/href rejects cleanly; failed loads delete promise from map; 0 console errors. |

---

## 10. Expected Outcome & Metrics

- **Files Modified**:
  - `src/newtab/core/asset-loader.js` (NEW, ~75 lines)
  - `src/new-tab.html` (+1 line)
  - `scripts/check-newtab-static.mjs` (+1 line)
  - `src/new-tab.js` (-66 lines)
- **Monolith Line Reduction**:
  - Before: 2,469 lines
  - After: **~2,403 lines** (net reduction of **~66 lines**)
- **Cumulative Phase 5 Reduction**:
  - Net: **-1,430 lines** (down from 3,833 lines; **-37.3% total reduction**)

---

## 11. Stop Condition

Plan created successfully. No source code has been edited. No commits have been created. Stopping here to await owner review and implementation authorization.
