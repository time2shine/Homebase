# Cycle #18 Phase 1 — Widget Lifecycle & Performance Architecture Plan

## 1. Overview & Objectives

**Cycle #18 Goal**: Transform the widget subsystem from loosely coupled, unencapsulated script functions into a hardened, lifecycle-managed architecture with clean teardown, idempotency guarantees, tab visibility coordination, and elimination of idle startup redundancies.

### Primary Objectives
1. **Lifecycle Hardening**: Standardize `initialize()` and `destroy()` lifecycle contracts across all widget controllers (`weather.js`, `news.js`, `quote.js`, `time.js`, `todo.js`).
2. **Idempotency Protection**: Ensure that calling setup/init methods multiple times is safe and never creates duplicate event listeners.
3. **Deterministic Teardown**: Remove event listeners from `window`, `document`, and DOM buttons when a widget is disabled or destroyed.
4. **Tab Visibility Coordination**: Add cooperative handling for `document.visibilitychange` to pause unnecessary background processing (clock, animations) and intelligently revalidate stale data (weather cache expiration) when the tab regains focus.
5. **Startup Streamlining**: Eliminate redundant cache-read and render passes between `startup:loadCachedWeather` and `startup:setupWeather` in `startup-hydration.js`.
6. **Zero Regressions**: Maintain sub-50ms instant hydration via `src/instant_load.js`, preserve all storage contracts in `HomebaseWidgetStorage`, and keep protected files untouched.

---

## 2. Cycle #18 Phase Breakdown

```text
Phase 1: Architecture & Lifecycle Audit (Complete)
   │
   ▼
Phase 2: Canonical Widget Lifecycle Service (`HomebaseWidgetLifecycle`)
   │
   ▼
Phase 3: Widget Controller Lifecycle Standard & Idempotency Hardening
   │
   ▼
Phase 4: Tab Visibility & Background Revalidation Synchronization
   │
   ▼
Phase 5: Stabilization, Verification & Performance Review
```

### Phase 2: Canonical Widget Lifecycle Service
- **Objective**: Create `src/newtab/widgets/widget-lifecycle.js` exporting `window.HomebaseWidgetLifecycle`.
- **Responsibilities**:
  - Unified registry of active widgets.
  - State tracking (`isInitialized`, `isVisible`, `isDestroyed`).
  - Standardized listener registration helper with automatic unbinding tracking (`registerListener(target, type, handler, options)`).
  - Centralized visibility coordinator (`document.addEventListener('visibilitychange')`).
- **Tests**: `tests/unit/widget-lifecycle.test.mjs`.

### Phase 3: Widget Controller Migration & Idempotency Hardening
- **Objective**: Refactor `weather.js`, `news.js`, `quote.js`, `time.js`, and `todo.js` to implement standard lifecycle contracts.
- **Tasks**:
  1. Add explicit `destroy()` and idempotency guards to:
     - `setupWeather()` / `destroyWeather()`
     - `setupNewsWidget()` / `destroyNewsWidget()`
     - `setupQuoteWidget()` / `destroyQuoteWidget()`
     - `setupTodoWidget()` / `destroyTodoWidget()`
     - `initTimeWidget()` / `destroyTimeWidget()` (moving 60s timer from `new-tab.js` into canonical owner).
  2. Remove dead DOM queries in `weather.js` (`#settings-btn`, `#set-location-btn`).
  3. Cleanly manage `window: resize` and `document: scroll` listeners in `news.js`.
- **Tests**: Add unit test coverage for `init()` and `destroy()` idempotency.

### Phase 4: Tab Visibility Management & Stale Cache Revalidation
- **Objective**: Implement smart tab visibility handling.
- **Tasks**:
  1. Pause the 60s clock timer when `document.hidden === true`; resume and immediately update on `visibilitychange` when active.
  2. When tab becomes visible after being backgrounded for >30 minutes, check `isWeatherCacheStale()` and refresh weather data in the background without blocking UI.
  3. Streamline `startup-hydration.js`: unify `startup:loadCachedWeather` and `startup:setupWeather` to avoid duplicate storage and render cycles.

### Phase 5: Stabilization & Performance Verification
- **Objective**: Full static invariant checks, test execution across all 4 stages, dual builds, and memory leak analysis.

---

## 3. Technical Specifications: `HomebaseWidgetLifecycle`

### API Blueprint
```javascript
window.HomebaseWidgetLifecycle = {
  // Registration and state
  registerWidget(widgetId, controller): void,
  unregisterWidget(widgetId): void,
  getWidget(widgetId): object | null,
  
  // Lifecycle invocation
  initializeAll(): Promise<void>,
  destroyAll(): void,
  
  // Scoped Event Cleanup Helper
  createListenerRegistry(): {
    on(target, eventType, handler, options): void,
    off(target, eventType, handler): void,
    removeAll(): void
  },
  
  // Centralized Visibility Hook
  onVisibilityChange(callback): () => void,
  isTabVisible(): boolean
};
```

---

## 4. Invariant Guarantees & Constraints

1. **Protected Files Invariant**:
   - `src/preload.js` — STRICTLY PROTECTED (0 diff).
   - `src/instant_load.js` — STRICTLY PROTECTED (0 diff).
   - `manifests/*` — STRICTLY PROTECTED (0 diff).
   - `dist/*` — STRICTLY PROTECTED (0 diff).
2. **Script Load Order & Execution Model**:
   - Classic `<script defer>` execution model in shared lexical declarative scope.
   - Zero declaration collisions across all deferred scripts.
   - New `widget-lifecycle.js` must be registered in `src/new-tab.html` prior to consumer widget scripts and added to `scripts/check-newtab-static.mjs`.
3. **Decoupled Architecture**:
   - Renderers (`weather-card-renderer.js`, `news-card-renderer.js`, `quote-card-renderer.js`) remain presentation-only (no lifecycle timers or storage).
   - Storage service (`widget-storage.js`) remains storage-only.
   - Lifecycle service (`widget-lifecycle.js`) coordinates startup, teardown, and visibility events.

---

## 5. Verification & Testing Strategy

1. **Syntax Checks**: `node --check` across all modified files.
2. **Static Invariants**: `node scripts/check-newtab-static.mjs` verifying script order and 0 declaration collisions.
3. **Automated Unit Tests**:
   - `tests/unit/widget-lifecycle.test.mjs`
   - Existing 446 unit tests must continue to pass 100%.
4. **Browser Smoke Tests**: `smoke-newtab-file.mjs` verifying startup in headless Edge/Chromium.
5. **Dual Production Build**: `npm.cmd run build` building clean `dist/chrome` and `dist/firefox`.
