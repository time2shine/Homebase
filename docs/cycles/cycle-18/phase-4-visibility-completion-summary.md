# Cycle #18 Phase 4 — Widget Visibility Synchronization Completion Summary

## 1. Executive Summary

In Cycle #18 Phase 4, `HomebaseWidgetLifecycle` was established as the single canonical coordinator of widget visibility and active state across Homebase.

Key outcomes achieved:
1. **Two-Tier Visibility Model**: Integrated widget UI visibility (`isVisible`, determined by user preferences in `widget-visibility.js`) with document/tab visibility (`isTabVisible`, derived from `document.visibilityState`).
2. **Unified Callback Lifecycle**: Standardized optional visibility hooks across widget controllers:
   - `onShow()`: Dispatched when a widget UI transitions from hidden to visible.
   - `onHide()`: Dispatched when a widget UI transitions from visible to hidden.
   - `pause()`: Dispatched when the browser tab becomes hidden OR when the widget UI is hidden.
   - `resume()`: Dispatched when the browser tab becomes visible AND the widget UI is visible.
3. **Bridge Integration**: `applyWidgetVisibility()` in `src/newtab/widgets/widget-visibility.js` now forwards calculated visibility states directly into `HomebaseWidgetLifecycle.setWidgetVisibility(widgetId, isVisible)` while preserving existing DOM styling (`.force-hidden`).
4. **Power & Resource Optimization**:
   - `time.js`: The 60-second time interval is paused when the tab is hidden, preventing timer executions in background tabs. On resume, the clock updates immediately and restarts the interval without duplication.
   - `weather.js`: In-flight reverse geocoding requests, debounced search timeouts, and fetch operations are aborted via `AbortController` on hide. On resume, stale weather caches (>30min) are refreshed.
   - `news.js`: Active fetch operations are aborted on hide/pause. `IntersectionObserver` disconnects on hide and re-arms when the widget is shown again.
   - `quote.js`: Rotation and copy feedback timeouts are cleared on hide/pause, and quote state is re-validated on show/resume.
   - `todo.js`: Clean state re-rendering on show/resume.
5. **Comprehensive Testing**: 7 new unit tests in `tests/unit/widget-visibility-lifecycle.test.mjs` verify all transitions, tab backgrounding/foregrounding, and network/timer teardowns.

---

## 2. Before vs. After Architecture

### Before Architecture
```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Startup & Preference Handlers                        │
│  - applyWidgetVisibility(): toggles .force-hidden on DOM nodes only    │
│  - applySidebarVisibility(): toggles .sidebar-hidden                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (no connection to lifecycle service)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      HomebaseWidgetLifecycle                           │
│  - setWidgetVisibility(): boolean stub on record only                  │
│  - Zero callbacks to controllers                                       │
│  - Zero coordination with tab visibility                               │
└────────────────────────────────────────────────────────────────────────┘
```

### After Architecture
```text
┌────────────────────────────────────────────────────────────────────────┐
│                 User Preferences & DOM Layout Bridge                   │
│                    (src/newtab/widgets/widget-visibility.js)           │
│  - applyWidgetVisibility(): toggles .force-hidden                      │
│  - calls HomebaseWidgetLifecycle.setWidgetVisibility(id, shouldShow)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        HomebaseWidgetLifecycle                         │
│  - record.isVisible (UI enabled)                                       │
│  - record.isActive  (UI enabled && tab foregrounded)                  │
│  - document 'visibilitychange' global subscription                     │
│  - Transition dispatcher: onShow, onHide, pause, resume                │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
         UI Visibility State Change          Tab Inactivity / Foreground
         (onShow / onHide)                   (pause / resume)
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           Widget Controllers                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   time.js    │  │  weather.js  │  │   news.js    │  │  quote.js  │  │
│  │ - pause()    │  │ - onShow()   │  │ - onShow()   │  │ - onShow() │  │
│  │ - resume()   │  │ - onHide()   │  │ - onHide()   │  │ - onHide() │  │
│  │              │  │ - pause()    │  │ - pause()    │  │ - pause()  │  │
│  │              │  │ - resume()   │  │ - resume()   │  │ - resume() │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Controller Visibility Matrix

| Controller | Widget ID | `onShow()` | `onHide()` | `pause()` | `resume()` |
|---|---|---|---|---|---|
| `HomebaseTimeWidgetController` | `"time"` | N/A (always UI visible) | N/A (always UI visible) | Clears `timeIntervalId` (stops 60s background timer) | Updates clock immediately and restarts interval |
| `HomebaseWeatherWidgetController` | `"weather"` | Initializes or resumes; refreshes stale cache | Clears search debounce; aborts `geoAbortController` and `weatherFetchAbortController` | Clears search debounce | Refreshes data if cache is stale (>30min) |
| `HomebaseNewsWidgetController` | `"news"` | Re-arms `IntersectionObserver` or loads news | Disconnects observer; aborts active `newsFetchAbortController` | Aborts in-flight non-critical fetch | Re-arms `IntersectionObserver` if news was not loaded |
| `HomebaseQuoteWidgetController` | `"quote"` | Ensures cached quote is rendered | Clears rotation & copy timeouts | Clears rotation & copy timeouts | Ensures cached quote is rendered |
| `HomebaseTodoWidgetController` | `"todo"` | Re-renders todo list if needed | No-op | No-op | Re-renders todo list if needed |

---

## 4. Verification Results

### 1. Syntax Validation
```powershell
node --check src/newtab/widgets/widget-lifecycle.js src/newtab/widgets/widget-visibility.js src/newtab/widgets/time.js src/newtab/widgets/weather.js src/newtab/widgets/news.js src/newtab/widgets/quote.js src/newtab/widgets/todo.js
```
- **Result**: PASS (0 syntax errors).

### 2. Static Invariants Check
```powershell
node scripts/check-newtab-static.mjs
```
- **Result**: PASS (73 deferred scripts, 58 extracted modules, 828 declarations, 0 collisions).

### 3. Unit & Integration Test Suite
```powershell
npm.cmd test
```
- **Result**: PASS (4/4 stages passed, 467/467 unit tests passed, 0 failures).

### 4. Headless Browser Smoke Test
- **Result**: PASS (`smoke-newtab-file.mjs` completed with 0 errors).

### 5. Production Extension Build
```powershell
npm.cmd run build
```
- **Result**: PASS (Clean builds in `dist/chrome` and `dist/firefox`).

### 6. Protected Files Diff
```powershell
git diff src/preload.js src/instant_load.js manifests/ dist/
```
- **Result**: Clean empty output (0 modifications).
