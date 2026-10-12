# Cycle #18 Phase 2 — Canonical Widget Lifecycle Service Completion Summary

## 1. Executive Summary

In Cycle #18 Phase 2, the foundation for standardized widget lifecycle management was established with the creation of `src/newtab/widgets/widget-lifecycle.js`, exporting `window.HomebaseWidgetLifecycle`.

This module serves as the single canonical owner for:
1. **Widget Registration & State Tracking**: Registration, unregistration, and status tracking (`isInitialized`, `isVisible`, `isDestroyed`).
2. **Idempotent Initialization & Bulk Teardown**: Guaranteed single-execution `initializeAll()` and clean, fault-tolerant `destroyAll()`.
3. **Scoped Listener Registry**: A reusable helper (`createListenerRegistry()`) providing tracked event binding and idempotent bulk teardown (`removeAll()`).
4. **Cooperative Tab Visibility Coordination**: Centralized `document.visibilitychange` subscription (`onVisibilityChange`) and state lookup (`isTabVisible()`).

Existing widget controllers (`weather.js`, `news.js`, `quote.js`, `time.js`, `todo.js`) were **not** modified in this phase, adhering strictly to the incremental migration strategy.

---

## 2. Architecture & Ownership Boundaries

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Widgets Subsystem (Phase 2)                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Lifecycle Coordination Layer                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     HomebaseWidgetLifecycle                      │  │
│  │  - registerWidget(id, ctrl)         - initializeAll()            │  │
│  │  - unregisterWidget(id)             - destroyAll()               │  │
│  │  - createListenerRegistry()         - onVisibilityChange()       │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ coordinates                      │
│                                     ▼                                  │
│  Widget Controllers (To be migrated in Phase 3)                        │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────────┐  │
│  │ weather.js │   │  news.js   │   │  quote.js  │   │ time / todo   │  │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └───────┬───────┘  │
│        │                │                │                  │          │
│        ▼                ▼                ▼                  │          │
│  Presentation Layer (Phase 4 of Cycle 17)                   │          │
│  ┌────────────────────────────────────────────────────────┐ │          │
│  │ HomebaseWeatherCardRenderer / News / Quote Renderers   │ │          │
│  └────────────────────────────────────────────────────────┘ │          │
│                                                             │          │
│  Persistence Layer (Phase 2 of Cycle 17)                    │          │
│  ┌────────────────────────────────────────────────────────┐ │          │
│  │                 HomebaseWidgetStorage                  │◄┘          │
│  └────────────────────────────────────────────────────────┘            │
└────────────────────────────────────────────────────────────────────────┘
```

### Strict Ownership Invariants
- `widget-storage.js`: Storage and fast mirrors only. Zero lifecycle or presentation logic.
- `weather-card-renderer.js`, `news-card-renderer.js`, `quote-card-renderer.js`: Pure DOM presentation only. Zero storage or lifecycle timers.
- `widget-lifecycle.js`: Lifecycle registry, teardown, listener tracking, and tab visibility coordination only. Zero storage calls and zero DOM rendering.

---

## 3. Public API Surface

### `window.HomebaseWidgetLifecycle`

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `registerWidget` | `widgetId: string, controller: object\|function` | `WidgetRecord` | Registers a controller and initializes status tracking (`isInitialized: false, isVisible: false, isDestroyed: false`). If existing controller is replaced, automatically destroys previous instance. |
| `unregisterWidget` | `widgetId: string` | `boolean` | Calls `destroy()` on controller if present, marks destroyed, and removes from registry. |
| `getWidget` | `widgetId: string` | `WidgetRecord \| null` | Returns tracked widget record or `null` if not found. |
| `getAllWidgets` | None | `WidgetRecord[]` | Returns all registered widget records. |
| `setWidgetVisibility` | `widgetId: string, isVisible: boolean` | `void` | Updates the tracked visibility state for the specified widget. |
| `initializeAll` | None | `Promise<void>` | Initializes all registered widgets via `init()`, `initialize()`, or function call. Guarantees idempotency (skips already-initialized widgets). Fault-tolerant against individual failures. |
| `destroyAll` | None | `void` | Calls `destroy()` on all active registered widgets, marks all destroyed, and clears registry. |
| `createListenerRegistry` | None | `ListenerRegistry` | Factory creating an isolated listener registry with `on(target, type, handler, options)`, `off(target, type, handler)`, and idempotent `removeAll()`. |
| `onVisibilityChange` | `callback: (isVisible: boolean) => void` | `() => void` | Subscribes to document visibility changes through a single global listener. Returns unsubscribe function. |
| `isTabVisible` | None | `boolean` | Returns `true` if `document.visibilityState === 'visible'`. |

---

## 4. Script Registration & Static Checks

1. **`src/new-tab.html`**:
   - Registered `<script src="newtab/widgets/widget-lifecycle.js" defer></script>` immediately after `widget-storage.js` (line 3363) and before all widget controllers (`time.js`, `todo.js`, `quote.js`, `weather.js`, `news.js`).
2. **`scripts/check-newtab-static.mjs`**:
   - Added `"newtab/widgets/widget-lifecycle.js"` to `keyExtractedModulePaths`.
   - Verified 73 deferred scripts, 58 extracted module paths, and 813 unique declarations with **0 naming collisions**.

---

## 5. Test Suite & Verification Results

### Unit Test Specification: `tests/unit/widget-lifecycle.test.mjs`
9 dedicated unit tests covering:
- Complete API export on `window.HomebaseWidgetLifecycle`.
- Registration, validation, and unregistration with automatic `destroy()` invocation.
- Re-registering existing widget cleans up prior controller.
- `initializeAll` idempotency across async and sync controllers.
- Fault tolerance when an individual widget fails during initialization.
- Bulk teardown via `destroyAll()`.
- Widget visibility tracking via `setWidgetVisibility()`.
- `createListenerRegistry` add, remove, and idempotent `removeAll()`.
- Centralized `onVisibilityChange` subscription, execution, and unsubscribing.

**Total Unit Test Count**: Increased from 446 to **455 tests** across 43 test suites (100% passing).

---

## 6. Migration Readiness for Phase 3

With `HomebaseWidgetLifecycle` implemented, registered, and verified, the repository is fully prepared for Phase 3:
1. **Weather Controller Migration**: Add `init()` and `destroy()` to `weather.js`, register with `HomebaseWidgetLifecycle`, wrap listeners with `createListenerRegistry()`, and remove dead elements (`#settings-btn`, `#set-location-btn`).
2. **News Controller Migration**: Add `init()` and `destroy()` to `news.js`, register with `HomebaseWidgetLifecycle`, and wrap `window: resize` and `document: scroll` in listener registry for safe teardown.
3. **Quote Controller Migration**: Add `init()` and `destroy()` to `quote.js`, register with `HomebaseWidgetLifecycle`.
4. **Todo Controller Migration**: Standardize `todo.js` into the lifecycle registry.
5. **Time Controller Migration**: Encapsulate clock timer inside `time.js` with lifecycle start/stop rather than raw `setInterval` in `new-tab.js`.
