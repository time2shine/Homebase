# Homebase Improvement Cycle #11 Phase 4 Checkpoint 5 — Implementation Plan
## Performance Mode & UI Runtime Delegation Extraction

> **Cycle ID**: Homebase Improvement Cycle #11 — Phase 4 Checkpoint 5  
> **Target Release**: Homebase v0.19.0  
> **Baseline Commit**: `3c6c0b6` ("Extract search preference, storage, and engine configuration")  
> **Baseline Size**: 4,029 lines in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
> **Target Size**: ~3,700–3,780 lines  
> **Status**: Planning Complete — Awaiting Owner Approval  
> **Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/99-cycle11-phase4-checkpoint5-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/99-cycle11-phase4-checkpoint5-audit.md)

---

## 1. Current Architecture State

Following the completion of Checkpoints 1 through 4, [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) stands at **4,029 lines** (down from 5,160 lines, a net reduction of -1,131 lines).
The search subsystem, context menu routing, and settings controls have been successfully modularized into dedicated controllers under `src/newtab/`.

However, [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) still retains several low-risk non-bookmark domains:
1. **Performance Mode Delegation Boilerplate (127 lines)**: A cluster of 7 functions and helpers (`applyPerformanceModeState`, `isPerformanceModeEnabled`, etc.) that duplicate logic already natively implemented in [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js).
2. **Favicon Forwarding Wrappers & Unused Constants (40 lines)**: 6 forwarding stubs (`revokeFaviconObjectUrl`, `getDomainKeyFromUrl`, etc.) and dead observer constants that duplicate [src/newtab/core/favicon-pipeline.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/favicon-pipeline.js).
3. **Multi-Tab / Container Action (`openFolderAll`, 39 lines)**: A bulk tab creation function that logically belongs in the container/tab integration controller [src/newtab/integrations/firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js).
4. **Dead Historical Placeholders & Shadow Variables (~160 lines)**: Legacy extraction comments from earlier wallpaper and dock refactorings, plus shadowed search preference variables.

All of these areas are completely independent of the high-risk bookmark storage, Sortable.js drag-and-drop, and startup scheduler engines.

---

## 2. Exact Functions Moving / Being Consolidated

### A. Primary Extraction: Performance Mode & Visual Runtime

#### 1. `applyPerformanceModeState(enabled)`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3074–3125 (52 lines).
- **Target Destination**: Consolidated into [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (as `applyPerformanceMode` / `applyPerformanceModeState`).
- **Callers**:
  - [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js) (lines 67, 439, 442)
  - [src/newtab/settings/settings-ui.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-ui.js) (line 1250)
  - `initializePage()` in `src/new-tab.js`
- **Dependencies**: `appGlassStylePreference`, `appGridAnimationPreference`, `appGridAnimationSpeedPreference`, `appGridAnimationEnabledPreference`, `cleanupBackgroundPlayback()`, `clearBackgroundVideos()`.
- **Browser APIs**: None directly (localStorage mirror via `syncFastPerformanceModeMirror`).
- **DOM Dependencies**: `document.body.classList.toggle('performance-mode')`, `#app-performance-mode-toggle`.
- **Risk Level**: **Lowest** (`performance-controller.js` already implements `applyPerformanceMode` and is covered by unit tests).

#### 2. `readFastPerformanceModePreference()`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3005–3015 (11 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 32–39; expose on `window`).
- **Callers**: `performance-controller.js`, `new-tab.js` startup variable initialization.
- **Dependencies**: `window.localStorage`.
- **Browser APIs**: `localStorage.getItem('fast-performance-mode')`.
- **DOM Dependencies**: None.
- **Risk Level**: **Lowest**.

#### 3. `syncFastPerformanceModeMirror(enabled)`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3017–3025 (9 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 41–46; expose on `window`).
- **Callers**: `settings-preferences.js`, `performance-controller.js`.
- **Dependencies**: `window.localStorage`.
- **Browser APIs**: `localStorage.setItem('fast-performance-mode', ...)`.
- **DOM Dependencies**: None.
- **Risk Level**: **Lowest**.

#### 4. `isPerformanceModeEnabled()`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3027–3032 (6 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 48–50; exposed on `window`).
- **Callers**: `wallpaper-controller.js`, `cinema-mode-runtime.js`, `visual-effects-runtime.js`, `visual-effects-settings.js`, `gallery-ui.js`, `dynamic-accent.js`.
- **Dependencies**: `_performanceMode` internal state.
- **Browser APIs**: None.
- **DOM Dependencies**: None.
- **Risk Level**: **Lowest**.

#### 5. `disableGridAnimationRuntime()`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3034–3046 (13 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 52–78; expose on `window`).
- **Callers**: `performance-controller.js`, `applyPerformanceMode`.
- **Dependencies**: None.
- **Browser APIs**: None.
- **DOM Dependencies**: `document.body.classList.remove('grid-animation-enabled')`, `#dynamic-grid-animation`.
- **Risk Level**: **Lowest**.

#### 6. `disableGlassRuntime()`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3048–3062 (15 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 80–96; expose on `window`).
- **Callers**: `performance-controller.js`, `applyPerformanceMode`.
- **Dependencies**: None.
- **Browser APIs**: None.
- **DOM Dependencies**: `document.documentElement.style.setProperty(...)`, `#dynamic-glass-style`.
- **Risk Level**: **Lowest**.

#### 7. `enableGlassRuntimeFromPreference()`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3064–3072 (9 lines).
- **Target Destination**: [src/newtab/settings/performance-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/performance-controller.js) (already implemented at lines 98–111; expose on `window`).
- **Callers**: `performance-controller.js`, `applyPerformanceMode`.
- **Dependencies**: `applyGlassStyle`.
- **Browser APIs**: None.
- **DOM Dependencies**: CSS property removals on `document.documentElement`.
- **Risk Level**: **Lowest**.

---

### B. Secondary Extraction: Multi-Tab & Container Actions

#### 8. `openFolderAll(folderId)`
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 3222–3260 (39 lines).
- **Target Destination**: [src/newtab/integrations/firefox-containers.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/integrations/firefox-containers.js).
- **Callers**:
  - [src/newtab/core/context-menu-controller.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/context-menu-controller.js) (lines 198, 214, 231)
  - Global `window.openFolderAll`
- **Dependencies**: `findBookmarkNodeById`, `bookmarkTree` (accessed defensively via `window.bookmarkTree` or `HomebaseBookmarkGridController.getBookmarkTreeState()`).
- **Browser APIs**: `browser.tabs.create({ url, active: false })` (with fallback to `chrome.tabs.create`).
- **DOM Dependencies**: None (`alert()`, `confirm()`).
- **Risk Level**: **Low** (isolated tab creation helper; container and standard tab opening preserved).

---

### C. Secondary Cleanup: Favicon Forwarding Wrappers & Unused Constants

#### 9. Unused Favicon Observer Constants & Variable
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 975–978 (4 lines).
- **Items**:
  - `const FAVICON_OBSERVER_ROOT_MARGIN = '250px';`
  - `const FAVICON_OBSERVER_THRESHOLD = 0.01;`
  - `let faviconIntersectionObserver = null;`
- **Action**: Remove from `src/new-tab.js`. [src/newtab/core/favicon-pipeline.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/favicon-pipeline.js) already owns these natively inside its IIFE (lines 15, 16, 25).
- **Risk Level**: **Lowest** (Verified 0 references in `src/new-tab.js`).

#### 10. Favicon Forwarding Wrappers
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 980–1018 (39 lines).
- **Functions**:
  - `revokeFaviconObjectUrl(img)`
  - `setFaviconImageSrc(img, url)`
  - `ensureFaviconObserver()`
  - `getDomainKeyFromUrl(rawUrl)`
  - `buildFaviconCandidates(rawUrl)`
  - `getFaviconUrlForRawUrl(rawUrl)`
- **Action**:
  - Export these 6 functions on `window` in [src/newtab/core/favicon-pipeline.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/favicon-pipeline.js) lines 844–846.
  - Prune the duplicate implementations in [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) while keeping lightweight 1-line fallbacks if needed.
- **Risk Level**: **Lowest**.

---

### D. Secondary Cleanup: Dead Placeholders & Shadow Variables

#### 11. Dead Comment Headers & Historical Extraction Placeholders
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
  - Lines 465–471 (7 lines): Wallpaper gallery extracted comments
  - Lines 487–493 (7 lines): Fallback selection extracted comments
  - Lines 623–735 (113 lines): Videos manifest cache historical notes
  - Lines 1025–1027 (3 lines): Wallpaper selection extracted comments
  - Lines 1090–1097 (8 lines): Wallpaper button extracted comments
  - Lines 3198–3221 (24 lines): Empty dock/container headers
- **Action**: Prune these dead historical comments.
- **Risk Level**: **Zero**.

#### 12. Shadow Search Preference Variables
- **Current Location**: [src/new-tab.js](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) lines 1048–1058 (11 lines).
- **Items**:
  - `let appSearchOpenNewTabPreference = false;`
  - `let appSearchRememberEnginePreference = true;`
  - `let appSearchDefaultEnginePreference = 'google';`
  - `let appSearchMathPreference = true;`
  - `let appSearchShowHistoryPreference = false;`
  - `let appSearchSuggestionsPreference = true;`
- **Action**: Prune from `src/new-tab.js`. These variables are already loaded and maintained globally by [src/newtab/settings/settings-preferences.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/settings-preferences.js).
- **Risk Level**: **Lowest**.

---

## 3. Migration Sequence

The implementation will proceed in 5 strict, isolated steps:

```text
Step 1: Enhance performance-controller.js
        ├── Expose applyPerformanceModeState, readFastPerformanceModePreference,
        │   syncFastPerformanceModeMirror, disableGridAnimationRuntime,
        │   disableGlassRuntime, enableGlassRuntimeFromPreference on window
        └── Add defensive option fallbacks

Step 2: Enhance favicon-pipeline.js & firefox-containers.js
        ├── Expose 6 global favicon functions on window in favicon-pipeline.js
        └── Add openFolderAll(folderId) to firefox-containers.js with window bridge

Step 3: Prune src/new-tab.js
        ├── Replace performance wrappers with lightweight calls to HomebasePerformanceController
        ├── Remove openFolderAll from new-tab.js
        ├── Remove duplicate favicon forwarding functions and dead constants
        ├── Remove dead extraction comment blocks
        └── Remove shadow search preference variables

Step 4: Update Unit Tests
        ├── Add tests in tests/unit/performance-controller.test.mjs
        └── Add tests in tests/unit/favicon-pipeline.test.mjs / firefox-containers.test.mjs

Step 5: Full Verification Suite
        ├── node --check on all modified files
        ├── node scripts/check-newtab-static.mjs
        ├── node scripts/smoke-newtab-file.mjs
        ├── npm.cmd test (all 343+ unit tests)
        ├── npm.cmd run build (Chrome + Firefox)
        ├── CDP real-browser verification
        └── git diff protected files check
```

---

## 4. Compatibility Strategy

### A. Window Namespace Bridges
To maintain 100% backward compatibility with all existing callers in `src/`, `tests/`, and external extensions:
1. **Performance Controller**:
   ```javascript
   if (typeof window !== 'undefined') {
     window.HomebasePerformanceController = HomebasePerformanceController;
     window.isPerformanceModeEnabled = isPerformanceModeEnabled;
     window.applyPerformanceModeState = applyPerformanceMode;
     window.readFastPerformanceModePreference = readFastPerformanceModePreference;
     window.syncFastPerformanceModeMirror = syncFastPerformanceModeMirror;
     window.disableGridAnimationRuntime = disableGridAnimationRuntime;
     window.disableGlassRuntime = disableGlassRuntime;
     window.enableGlassRuntimeFromPreference = enableGlassRuntimeFromPreference;
   }
   ```
2. **Favicon Pipeline**:
   ```javascript
   if (typeof window !== 'undefined') {
     window.HomebaseFaviconPipeline = pipeline;
     window.revokeFaviconObjectUrl = pipeline.revokeObjectUrl;
     window.setFaviconImageSrc = pipeline.setImageSrc;
     window.ensureFaviconObserver = pipeline.ensureObserver;
     window.getDomainKeyFromUrl = pipeline.getDomainKey;
     window.buildFaviconCandidates = pipeline.buildCandidates;
     window.getFaviconUrlForRawUrl = pipeline.getUrlForRawUrl;
   }
   ```
3. **Firefox Containers**:
   ```javascript
   if (typeof window !== 'undefined') {
     window.openFolderAll = openFolderAll;
     if (window.HomebaseFirefoxContainers) {
       window.HomebaseFirefoxContainers.openFolderAll = openFolderAll;
     }
   }
   ```

### B. Script Loading Order in `src/new-tab.html`
Script loading order is already optimal:
- Line 3352: `newtab/core/favicon-pipeline.js` (evaluates before bookmark grid and new-tab.js)
- Line 3389: `newtab/settings/performance-controller.js` (evaluates before settings-ui and new-tab.js)
- Line 3393: `newtab/integrations/firefox-containers.js` (evaluates before new-tab.js)
- Line 3401: `new-tab.js` (evaluates last)

Consumers will always find provider functions defined and attached before `new-tab.js` or `initializePage()` runs.

---

## 5. Verification Checklist

Before any commit or completion decision, the following automated checks will be executed:

1. **Syntax Validation**:
   ```powershell
   node --check src/new-tab.js
   node --check src/newtab/settings/performance-controller.js
   node --check src/newtab/core/favicon-pipeline.js
   node --check src/newtab/integrations/firefox-containers.js
   ```
2. **Static AST Invariants**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
   - Verifies 0 cross-script top-level declaration collisions across 54 deferred scripts.
   - Verifies 0 stale path references.
3. **Browser Smoke Test**:
   ```powershell
   node scripts/smoke-newtab-file.mjs
   ```
   - Verifies headless Chromium/Edge boots cleanly without `ReferenceError` or `TypeError`.
4. **Unit Test Suite**:
   ```powershell
   npm.cmd test
   ```
   - Verifies all 343+ tests pass (0 failures).
5. **Extension Release Builds**:
   ```powershell
   npm.cmd run build
   ```
   - Verifies `dist/chrome` and `dist/firefox` build with 0 bundle/packaging errors.
6. **CDP Real-Browser Checklist**:
   - Verify performance mode toggle applies `performance-mode` CSS class and disables glass/grid animations.
   - Verify toggling performance mode off restores glass style and grid animation.
   - Verify `openFolderAll` executes tabs creation.
   - Verify favicon resolution and lazy loading work without error.
   - Verify 0 console errors (`ReferenceError`, `TypeError`, unhandled rejections).
7. **Protected Files Integrity**:
   ```powershell
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```
   - Verifies 0 lines modified in protected files.

---

## 6. Expected Metrics

| Metric | Before Checkpoint 5 | After Checkpoint 5 | Difference |
| :--- | :--- | :--- | :--- |
| **`src/new-tab.js` Lines** | ~4,029 lines | ~**3,695–3,750 lines** | **-280 to -334 lines** |
| **`performance-controller.js` Lines** | 341 lines | ~360 lines | +19 lines |
| **`favicon-pipeline.js` Lines** | 848 lines | ~858 lines | +10 lines |
| **`firefox-containers.js` Lines** | 518 lines | ~565 lines | +47 lines |
| **Protected Areas Touched** | 0 lines | 0 lines | 0 lines |
| **Cumulative Cycle #11 Reduction** | -1,131 lines | ~**-1,430 lines** | **~28% reduction of monolith** |

---

## 7. Protected Areas & Boundaries

The following areas are strictly **protected** and will **NOT** be modified in Checkpoint 5:
- `initializePage()` startup orchestration logic (lines 3281–3780)
- `primeWallpaperBackground()` (lines 495–559)
- Idle task scheduler (`processIdleTasks`, `scheduleIdleTask`, `scheduleIdleChunkedTask`) (lines 113–380)
- Bookmark Sortable.js drag-and-drop & grid virtualizer (lines 1371–2155)
- Bookmark CRUD / tree mutation operations (lines 2156–2998)
- Protected files: `src/preload.js`, `src/instant_load.js`, `manifests/*`, `dist/*`

---

## 8. Conclusion

This plan isolates four low-risk extraction and cleanup targets that collectively yield **~300 lines of monolith reduction** without touching the bookmark engine or startup flow.

*Awaiting owner approval before proceeding to implementation.*
