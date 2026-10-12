# Cycle #19 Phase 1 — Widget Controller Full Encapsulation Migration Plan

## 1. Executive Summary & Goals

The objective of Cycle #19 is the **complete modular encapsulation** of all widget controllers. Building on the foundation established in Cycles #17 and #18, each widget controller will be converted into a strictly scoped IIFE module, eliminating top-level lexical collisions, removing eager DOM lookups, stripping out legacy storage fallback ladders, and standardizing public interfaces under canonical `window.HomebaseWidget<Name>` facades.

### Primary Goals
1. **Zero Global Leakage**: Wrap every widget controller in a strict IIFE (`(function () { 'use strict'; ... })();`), leaving 0 top-level variable or helper function leaks in the global lexical scope.
2. **Standardized Controller Interface**:
   Every widget controller will implement the complete 6-hook lifecycle contract:
   ```javascript
   window.HomebaseWidget<Name> = {
     init(),       // or initialize()
     destroy(),
     onShow(),
     onHide(),
     pause(),
     resume()
   };
   ```
   (With backward-compatible aliases preserved to prevent regressions with existing tests or startup orchestrators).
3. **Lazy DOM Element Resolution**: Move eager DOM node lookups (`document.getElementById`, `document.querySelector`) into controller `initialize()` methods or element accessors.
4. **Clean Persistence Boundaries**: Eliminate duplicated 30-line fallback ladders (`HomebaseStorage` -> `browser.storage.local` -> `localStorage`), routing all widget storage exclusively through `HomebaseWidgetStorage`.
5. **Preserve Dual-Browser & Backward Compatibility**: Ensure instant cached hydration, Sortable drag ordering, settings panel bindings, and unit tests continue to function with 100% pass rates.

---

## 2. Target Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Startup Bootstrapping                           │
│  src/new-tab.js ──> src/newtab/core/startup-hydration.js              │
│  (Orchestrates startup sequence; zero widget business logic)           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ registers & boots
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Lifecycle & Visibility Layer                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     HomebaseWidgetLifecycle                      │  │
│  │  - Single owner of active/visible state tracking                 │  │
│  │  - Central document visibility listener                         │  │
│  │  - Dispatches onShow, onHide, pause, resume                      │  │
│  └────────────────┬────────────────────────────────┬────────────────┘  │
└───────────────────┼────────────────────────────────┼───────────────────┘
                    │ coordinates                    │ coordinates
                    ▼                                ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│        widget-visibility.js          │ │ Encapsulated Controllers      │
│  - Owns Sortable drag-and-drop       │ │ (Strict IIFE Scoping)         │
│  - Owns sidebar reordering DOM       │ │ - HomebaseWidgetTime          │
│  - Bridges visibility preferences    │ │ - HomebaseWidgetTodo          │
│                                      │ │ - HomebaseWidgetQuote         │
│                                      │ │ - HomebaseWidgetNews          │
│                                      │ │ - HomebaseWidgetWeather       │
└───────────────────┬──────────────────┘ └───────────────┬───────────────┘
                    │ persists order                     │ persists data
                    ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         HomebaseWidgetStorage                          │
│  - Single canonical persistence facade for all widgets                 │
│  - Coordinates HomebaseStorage, browser.storage.local, fast mirrors   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Standardized Controller Contract

Every widget module will follow this structure:

```javascript
(function () {
  'use strict';

  // Private module state & cache
  let isInitialized = false;
  let listenerRegistry = null;
  let domElements = null;

  function resolveDomElements() {
    if (!domElements) {
      domElements = {
        root: document.querySelector('.widget-<name>'),
        // ...cached element references
      };
    }
    return domElements;
  }

  const HomebaseWidget<Name> = {
    async initialize() {
      if (isInitialized) return;
      isInitialized = true;
      resolveDomElements();
      // Setup listeners via HomebaseWidgetLifecycle.createListenerRegistry()
      // Hydrate from HomebaseWidgetStorage
    },

    destroy() {
      if (listenerRegistry) {
        listenerRegistry.removeAll();
        listenerRegistry = null;
      }
      // Cancel timers, abort active requests
      domElements = null;
      isInitialized = false;
    },

    onShow() {
      // Refresh or ensure rendered state when widget UI becomes visible
    },

    onHide() {
      // Abort in-flight network activity or debounced timers
    },

    pause() {
      // Clear timers or non-critical background polling when tab hidden
    },

    resume() {
      // Restart timers and refresh stale data when tab returns to foreground
    }
  };

  // Backwards-compatible init alias
  HomebaseWidget<Name>.init = HomebaseWidget<Name>.initialize;

  // Global exports & lifecycle registration
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  globalScope.HomebaseWidget<Name> = HomebaseWidget<Name>;
  globalScope.Homebase<Name>WidgetController = HomebaseWidget<Name>; // Legacy alias

  if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
    HomebaseWidgetLifecycle.registerWidget('<name>', HomebaseWidget<Name>);
  }
})();
```

---

## 4. Phased Migration Breakdown

### Phase 2: Encapsulate Time & Todo Controllers
- **Files**: `src/newtab/widgets/time.js`, `src/newtab/widgets/todo.js`
- **Scope**:
  - Wrap both files in strict IIFEs.
  - Export canonical `window.HomebaseWidgetTime` and `window.HomebaseWidgetTodo` (with aliases `HomebaseTimeWidgetController` and `HomebaseTodoWidgetController`).
  - Move DOM queries into lazy accessors.
  - Remove direct `localStorage` and `browser.storage.local` fallback ladders in favor of clean `HomebaseWidgetStorage` calls.
  - Add/update unit tests in `tests/unit/widget-controller-lifecycle.test.mjs`.

### Phase 3: Encapsulate Quote & News Controllers
- **Files**: `src/newtab/widgets/quote.js`, `src/newtab/widgets/news.js`
- **Scope**:
  - Wrap both files in strict IIFEs.
  - Export `window.HomebaseWidgetQuote` and `window.HomebaseWidgetNews` (with legacy aliases).
  - Lazy-resolve all DOM elements (modal controls, list containers, tooltip portal).
  - Strip redundant direct storage mutations and delegate exclusively to `HomebaseWidgetStorage`.
  - Ensure XML parsing, quote indexing, and hover preview tools are completely private to their respective closures.
  - Add/update unit tests.

### Phase 4: Encapsulate Weather Controller
- **Files**: `src/newtab/widgets/weather.js`
- **Scope**:
  - Wrap `weather.js` (1,300 lines) in a strict IIFE.
  - Export `window.HomebaseWidgetWeather` (with alias `HomebaseWeatherWidgetController`).
  - Encapsulate 21 eager DOM lookups into lazy resolution.
  - Eliminate 30+ top-level helper functions from global lexical scope (`weatherStorageGet`, `weatherStorageSet`, `getWeatherEmoji`, `normalizeWeatherDisplay`, etc.).
  - Route all weather cache and unit persistence exclusively through `HomebaseWidgetStorage`.
  - Add/update unit tests.

### Phase 5: Visibility & Layout Consolidation (`widget-visibility.js`)
- **Files**: `src/newtab/widgets/widget-visibility.js`
- **Scope**:
  - Wrap `widget-visibility.js` in a strict IIFE exporting `window.HomebaseWidgetVisibility`.
  - Centralize widget preference setters (`setWeatherPreference`, `setNewsPreference`, etc.) into clean delegates.
  - Verify SortableJS lifecycle management and clean drag handle teardown.
  - Final end-to-end static checks, unit tests, and browser smoke validation.

---

## 5. Risk Analysis & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Collision with legacy test sandboxes** | Existing unit tests expecting top-level functions (e.g. `setupWeather()`, `updateTime()`) could fail | Export backward-compatible wrapper functions onto `window` inside the IIFE. |
| **Startup hydration ordering** | Eager DOM resolution converted to lazy could access elements before DOM is injected | Use safe accessor functions that query the DOM on demand and memoize references. |
| **Storage fallback regression** | Removing fallback ladders could fail if `HomebaseWidgetStorage` is missing | `HomebaseWidgetStorage` is loaded synchronously before all widget scripts in `new-tab.html` (line 3362); add defensive null-checks. |
| **Top-level declaration collision regression** | Modifying script wrappers could trigger syntax errors | Run `node scripts/check-newtab-static.mjs` before every commit boundary. |

---

## 6. Verification Plan

Every phase of Cycle #19 must pass:
1. **Syntax Checks**:
   ```powershell
   node --check <modified-files>
   ```
2. **Static Invariants**:
   ```powershell
   node scripts/check-newtab-static.mjs
   ```
3. **Automated Test Suite**:
   ```powershell
   npm.cmd test
   ```
4. **Dual Extension Build**:
   ```powershell
   npm.cmd run build
   ```
5. **Protected Files Verification**:
   ```powershell
   git diff src/preload.js src/instant_load.js manifests/ dist/
   ```
   (Must strictly output 0 diff).
