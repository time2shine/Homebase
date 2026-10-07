# Homebase Improvement Cycle #11 Phase 5 Checkpoint 1 — Implementation Plan

**Checkpoint**: 1 — Wallpaper Visibility & Media Lifecycle Cleanup  
**Target File**: [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js)  
**Source Monolith**: [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js)  
**Date**: October 1, 2026  
**Status**: DRAFT — Awaiting Owner Approval  
**Authority**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/104-cycle11-phase5-audit.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/104-cycle11-phase5-audit.md)  

---

## 1. Current State

In Cycle 11 Phase 2, the primary wallpaper subsystem (manifest caching, poster generation, video crossfade, canvas encoding, and gallery modal integration) was extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js).

However, during that migration, several secondary video lifecycle handlers, window event listeners, and obsolete extraction comments remained behind in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
1. **Document Visibility Listener** (lines 3751–3791, 41 lines):
   - Direct `document.addEventListener('visibilitychange', ...)` handler that queries `.background-video` elements.
   - Pauses all playing videos when `document.hidden` is true, recording `v.dataset.wasPlaying = 'true'`.
   - Resumes the active video when foregrounded (unless performance mode is active) and focuses `#search-input`.
2. **Dead Vertical Space & Obsolete Comments**:
   - Lines 74–78 (~5 lines): Historical extraction stubs for wallpaper constants.
   - Lines 3685–3750 (~65 lines): Empty lines and placeholder comments for wallpaper preference management.
   - Lines 3831–3833 (~3 lines): Video lifecycle extraction comments at EOF.

As a result, media playback pause/resume state management is split between `wallpaper-controller.js` and `new-tab.js`.

---

## 2. Extraction Boundary

### What Moves to `src/newtab/wallpaper/wallpaper-controller.js`
1. **`handleWallpaperVisibilityChange()`**:
   - Encapsulates the visibility change logic currently located at `src/new-tab.js:3751`.
   - Pauses background videos when tab is hidden, tagging `wasPlaying`.
   - Resumes active video when tab becomes visible (respecting `isPerformanceModeEnabled()`).
   - Re-focuses `#search-input` when tab returns to foreground and no modal is open.
2. **`setupWallpaperVisibilityListener()`**:
   - Attaches `visibilitychange` listener defensively (idempotent with flag check).
   - Automatically invoked during controller initialization or module evaluation.
3. **Controller & Window Exports**:
   - Expose `handleVisibilityChange` on `window.HomebaseWallpaperController`.
   - Expose `window.handleWallpaperVisibilityChange` for testability and backward compatibility.

### What Remains in `src/new-tab.js`
1. **`initializePage()`**: Startup orchestration remains completely intact.
2. **`scheduleIdleTask(() => updateDynamicAccent(), ...)`**: Startup idle task remains in `new-tab.js`.
3. **`openBookmarkInNewTab(bookmarkId)`** and **`openFolderFromContext(folderId)`**: Remain untouched for subsequent checkpoints.

### What is Removed from `src/new-tab.js`
1. The inline `document.addEventListener('visibilitychange', ...)` block (lines 3751–3791).
2. Obsolete historical extraction comment blocks and dead vertical padding (lines 74–78, 3685–3750, 3831–3833).

---

## 3. Migration Steps

### Step 1: Implement Visibility Handler in `wallpaper-controller.js`
Add `handleWallpaperVisibilityChange` and `setupWallpaperVisibilityListener` to [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js):

```javascript
/**
 * Handles document visibility changes to pause background video playback
 * when the tab is hidden and resume playback when foregrounded.
 */
function handleWallpaperVisibilityChange() {
  if (typeof document === 'undefined') return;

  const videos = document.querySelectorAll('.background-video');

  if (document.hidden) {
    videos.forEach((v) => {
      if (!v.paused) {
        v.dataset.wasPlaying = 'true';
        v.pause();
      }
    });
  } else {
    const isPerfMode = typeof isPerformanceModeEnabled === 'function'
      ? isPerformanceModeEnabled()
      : (typeof window !== 'undefined' && typeof window.isPerformanceModeEnabled === 'function'
          ? window.isPerformanceModeEnabled()
          : false);

    if (isPerfMode) return;

    const activeVideo = document.querySelector('.background-video.is-active') || videos[0];
    if (activeVideo) {
      activeVideo.play().catch(() => {});
    }

    if (!document.body.classList.contains('modal-open')) {
      const searchInput = document.getElementById('search-input');
      if (searchInput && typeof setTimeout === 'function') {
        setTimeout(() => searchInput.focus(), 50);
      }
    }
  }
}

function setupWallpaperVisibilityListener() {
  if (typeof document === 'undefined') return;
  if (document.dataset && document.dataset.wallpaperVisibilityAttached === 'true') return;
  if (document.dataset) {
    document.dataset.wallpaperVisibilityAttached = 'true';
  }
  document.addEventListener('visibilitychange', handleWallpaperVisibilityChange);
}
```

### Step 2: Bind to Controller and Window Exports
In [`src/newtab/wallpaper/wallpaper-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/wallpaper/wallpaper-controller.js):
- Add `handleVisibilityChange: handleWallpaperVisibilityChange` to `window.HomebaseWallpaperController`.
- Add `window.handleWallpaperVisibilityChange = handleWallpaperVisibilityChange;` in window export block.
- Execute `setupWallpaperVisibilityListener()` during module initialization.

### Step 3: Remove Inline Listener and Dead Comments from `new-tab.js`
In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
- Remove the inline `document.addEventListener('visibilitychange', ...)` handler.
- Clean up dead comments at lines 74–78, 3685–3750, and 3831–3833.

---

## 4. Compatibility Requirements

1. **Script Execution Order**:
   - `src/new-tab.html` order:
     - Line 3377: `newtab/wallpaper/wallpaper-controller.js`
     - Line 3389: `newtab/settings/performance-controller.js`
     - Line 3401: `new-tab.js`
   - `wallpaper-controller.js` loads before `new-tab.js`.
   - When `visibilitychange` fires after startup, all modules and `window.isPerformanceModeEnabled` are fully initialized.
2. **Search Input Focus**:
   - Preserves search input autofocus on tab return:
     `document.getElementById('search-input').focus()`.
3. **Modal Protection**:
   - Preserves `!document.body.classList.contains('modal-open')` check to avoid stealing focus from active dialogs.
4. **Performance Mode Integrity**:
   - Does not play background videos when performance mode is active.

---

## 5. Verification Checklist

### Automated Commands
```powershell
node --check src/new-tab.js
node --check src/newtab/wallpaper/wallpaper-controller.js
node scripts/check-newtab-static.mjs
node scripts/smoke-newtab-file.mjs
npm.cmd test
npm.cmd run build
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```

### Real-Browser CDP Verification Plan
Create `scratch/verify-cycle11-phase5-cp1-browser.mjs`:
1. **Test 1**: Verify `window.HomebaseWallpaperController.handleVisibilityChange` and `window.handleWallpaperVisibilityChange` exist and are callable functions.
2. **Test 2**: Simulate `document.hidden = true` -> dispatch `visibilitychange` -> verify background video elements are paused and `v.dataset.wasPlaying === 'true'`.
3. **Test 3**: Simulate `document.hidden = false` -> dispatch `visibilitychange` -> verify active background video calls `.play()` and search input receives focus.
4. **Test 4**: Verify 0 `ReferenceError`, 0 `TypeError`, and 0 severe console errors via CDP.

---

## 6. Expected Impact

| Metric | Before Checkpoint 1 | After Checkpoint 1 | Delta |
|---|:---:|:---:|:---:|
| `src/new-tab.js` lines | 3,833 lines | ~3,719 lines | **-114 lines** |
| `src/newtab/wallpaper/wallpaper-controller.js` lines | 1,936 lines | ~1,976 lines | +40 lines |
| Net Codebase Line Delta | — | — | **-74 lines net** |

---

## 7. No-Code-Change Confirmation

As required by Homebase development rules:
- **No source code files modified**
- **No commits created**
- **No pushes performed**
- **Working tree verified clean**

---

## 8. Next Step

Awaiting owner review and explicit approval of [`docs/105-cycle11-phase5-checkpoint1-plan.md`](file:///c:/Users/Administrator/Desktop/Homebase/docs/105-cycle11-phase5-checkpoint1-plan.md) before starting implementation.
