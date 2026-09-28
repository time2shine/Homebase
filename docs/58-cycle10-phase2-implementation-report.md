# Homebase Improvement Cycle #10 Phase 2 Implementation Report: Dialog and Context Menu Controller Extraction

**Date:** September 29, 2026  
**Cycle ID:** Cycle #10 — Phase 2 (Context Menu and Dialog/Modal Lifecycle Extraction)  
**Target Release:** Homebase v0.17.0  
**Authority:** [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/56-cycle10-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/56-cycle10-plan.md)  
**Status:** Implemented & Verified (Awaiting User Review / Pre-Commit State)  

---

## 1. Overview & Objectives

In Phase 2 of Cycle #10, the **Dialog/Modal Lifecycle** and **Context Menu** responsibilities were extracted from [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) into dedicated, modular domain controllers:
- **[`src/newtab/core/dialog-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dialog-controller.js)** (`window.HomebaseDialogController`)
- **[`src/newtab/core/context-menu-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/context-menu-controller.js)** (`window.HomebaseContextMenuController`)

### Core Goals:
1. Provide unified, stack-aware modal management (open/close, LIFO active dialog tracking, Escape key handling, and fallback confirmation/alert dialogs) backed by the existing `dialogs.js` library.
2. Provide resilient context menu lifecycle management (viewport-clamped positioning, show/hide orchestration, outside-click and window-blur dismissal, DOM body re-parenting, and centralized action routing).
3. Preserve all existing DOM selectors, CSS classes (`.modal-overlay`, `.hidden`, `.closing`, `.context-menu`, `.active`), and animation lifecycles.
4. Replace extracted implementations in [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) with delegating wrappers to maintain 100% backward compatibility for internal callers.
5. Maintain classic `<script defer>` script architecture, zero ES modules, zero bundlers, and zero new dependencies.
6. Guarantee that protected files ([`src/preload.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js), [`src/instant_load.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/instant_load.js), `manifests/*`, `dist/*`) remain 100% untouched.

---

## 2. Audit Findings

Before refactoring, an audit of dialog and context menu responsibilities across [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js) was performed:

### A. Dialog & Modal Responsibilities
- **Modal Lifecycle**: Modals (`#settings-modal`, `#gallery-modal`, `#bookmark-modal`, `#confirm-dialog`, etc.) use overlay elements with `.modal-overlay` and `.hidden` classes.
- **Escape Key Handling**: Escape key listener was registered globally on `window` inside `initializePage()`, checking for open modals and dismissing them in LIFO sequence while ignoring rename inputs (`#bookmark-rename-input`).
- **Underlying Primitives**: Handled by `src/assets/js/dialogs.js` (`window.openModal`, `window.closeModal`, `window.closeModalWithAnimation`, `window.showConfirmDialog`, `window.showAlertDialog`).
- **Callers**: Settings button, gallery button, bookmark context actions, hotkey listener (`Escape`), and backdrop click listeners.

### B. Context Menu Responsibilities
- **Context Menus**: Rendered via `.context-menu` elements (e.g. `#bookmark-context-menu`, `#space-context-menu`).
- **DOM Reparenting**: `ensureMenuMountedToBody(menuEl)` moved nested menus to `document.body` to evade `overflow: hidden` / CSS transform clipping on parent cards and containers.
- **Positioning**: `positionContextMenuInViewport(menuEl, clientX, clientY, opts)` calculated viewport bounds and clamped `left` / `top` coordinates with an 8px boundary margin against `document.documentElement.clientWidth/clientHeight`.
- **Dismissal**: Handled by `hideAllContextMenus()`, listening to global `window` `pointerdown` / `click` and `blur` events.
- **Callers**: Right-click `contextmenu` handlers on bookmark tiles, space tabs, and widgets.

---

## 3. Extracted Functions & Responsibilities

The following responsibilities were extracted into their respective controllers:

| Original Function / Responsibility | Location in `src/new-tab.js` | Extracted Controller | Extracted Function |
| :--- | :---: | :--- | :--- |
| `ensureMenuMountedToBody` | Lines 5302–5311 | `HomebaseContextMenuController` | `ensureMenuMountedToBody(menuEl)` |
| `hideAllContextMenus` | Lines 5313–5328 | `HomebaseContextMenuController` | `hide(options)` |
| `positionContextMenuInViewport` | Lines 5330–5367 | `HomebaseContextMenuController` | `reposition(menuEl, clientX, clientY, options)` |
| Context Data & Action Dispatch | Embedded in handlers | `HomebaseContextMenuController` | `handleAction`, `getContextData`, `setContextData` |
| Modal Stack & Escape Handling | Lines 5821–5839 | `HomebaseDialogController` | `handleEscapeKey(event)`, `closeActiveDialog()` |
| Modal Open / Close Integration | Delegated via `dialogs.js` | `HomebaseDialogController` | `openDialog`, `closeDialog`, `showConfirmDialog`, `showAlertDialog` |

---

## 4. New Controller APIs

### A. `window.HomebaseDialogController`
Implemented in [`src/newtab/core/dialog-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/dialog-controller.js):

```javascript
window.HomebaseDialogController = {
  // Lifecycle & configuration
  initialize(options = {}),
  openDialog(modalId, triggerSource = null),
  closeDialog(modalId),
  closeActiveDialog(),

  // Dialog helpers
  showConfirmDialog(title, message, onConfirm, onCancel = null, options = {}),
  showAlertDialog(title, message, onClose = null, options = {}),

  // Keyboard navigation & state inspection
  handleEscapeKey(event),
  getActiveDialog(),
  isDialogOpen(modalId),
  resetStack()
};
```

**Key Invariants:**
- Maintains a reactive LIFO active dialog stack (`activeDialogStack`) to cleanly handle nested dialogs (e.g. alert or confirmation opened from settings or gallery modals).
- Respects active inputs during Escape: skips closing when `#bookmark-rename-input` or elements with `data-ignore-dialog-escape` are active.
- Seamlessly falls back to `dialogs.js` or direct DOM manipulation (`classList.add('hidden')`, `aria-hidden`) when running in varied environments.

### B. `window.HomebaseContextMenuController`
Implemented in [`src/newtab/core/context-menu-controller.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/context-menu-controller.js):

```javascript
window.HomebaseContextMenuController = {
  // Lifecycle & mounting
  initialize(options = {}),
  ensureMenuMountedToBody(menuEl),
  show(menuEl, clientX, clientY, contextData = null, options = {}),
  hide(options = {}),
  reposition(menuEl, clientX, clientY, options = {}),

  // Action handling & context
  handleAction(actionName, targetData = null, context = {}),
  registerActionHandler(handler),
  getContextData(menuEl),
  setContextData(menuEl, data),
  getActiveMenu()
};
```

**Key Invariants:**
- Viewport clamping with configurable boundary margins (default 8px) against `clientWidth`/`clientHeight` and scroll offsets (`pageXOffset`/`pageYOffset`).
- Automatic re-parenting of menu elements to `document.body` if not already direct children.
- Global dismissal wiring for window `pointerdown`, `click`, and `blur` events without interfering with menu item clicks.
- WeakMap/DOM-backed context association for robust data binding across asynchronous context actions.

---

## 5. Changes in `src/new-tab.js`

In [`src/new-tab.js`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.js):
1. **Delegating Implementations**:
   - `ensureMenuMountedToBody(menuEl)`: Delegates to `window.HomebaseContextMenuController.ensureMenuMountedToBody(menuEl)`.
   - `hideAllContextMenus()`: Delegates to `window.HomebaseContextMenuController.hide()`.
   - `positionContextMenuInViewport(menuEl, clientX, clientY, opts)`: Delegates to `window.HomebaseContextMenuController.reposition(menuEl, clientX, clientY, opts)`.
2. **Startup Wiring**:
   - In `initializePage()`:
     ```javascript
     if (window.HomebaseDialogController && typeof window.HomebaseDialogController.initialize === 'function') {
       window.HomebaseDialogController.initialize();
     }
     if (window.HomebaseContextMenuController && typeof window.HomebaseContextMenuController.initialize === 'function') {
       window.HomebaseContextMenuController.initialize();
     }
     ```
   - Existing caller signatures remain 100% intact, guaranteeing that bookmark managers, space switchers, and settings modules operate without disruption.

---

## 6. Script Loading Order

In [`src/new-tab.html`](file:///c:/Users/Administrator/Desktop/Homebase/src/new-tab.html), the two controllers are loaded immediately after `src/assets/js/dialogs.js` and before downstream domain controllers and `src/new-tab.js`:

```html
<!-- Line 3325: Dialogs library -->
<script src="assets/js/dialogs.js" defer></script>
<!-- Line 3326: New Dialog Controller -->
<script src="newtab/core/dialog-controller.js" defer></script>
<!-- Line 3327: New Context Menu Controller -->
<script src="newtab/core/context-menu-controller.js" defer></script>
...
<!-- Line 3374: Main runtime entry point -->
<script src="new-tab.js" defer></script>
```

- Total deferred scripts checked: **49** (increased from 47).
- `src/preload.js` remains synchronous in `<head>`.
- `src/new-tab.js` remains the final deferred script.

---

## 7. Verification & Test Results

### A. Syntax Validation (`node --check`)
Passed with zero errors across all affected files:
```powershell
node --check src/newtab/core/dialog-controller.js src/newtab/core/context-menu-controller.js src/new-tab.js tests/unit/dialog-controller.test.mjs tests/unit/context-menu-controller.test.mjs
```

### B. Static Invariants Check (`scripts/check-newtab-static.mjs`)
Passed all checks:
- 49 deferred local script files verified.
- `preload.js` intact in head without defer/async/module.
- `new-tab.js` confirmed as the final deferred runtime script.
- 33 extracted module paths checked.
- 0 duplicate declarations across 87 checked names.

### C. Unit Test Suite (`npm.cmd test`)
All **299 / 299** tests passed:
- `tests/unit/dialog-controller.test.mjs`: 7 tests passed (exports, open/close, LIFO stack dismissal, Escape key handling, rename input guard, missing DOM safety, listener binding).
- `tests/unit/context-menu-controller.test.mjs`: 7 tests passed (exports, viewport boundary clamping, show/hide lifecycle, action routing, DOM body mounting, missing DOM safety, blur/click dismissal).
- Existing test suites: 285 tests passed without regressions.

### D. Build Verification (`npm.cmd run build`)
```text
> homebase-extension@0.15.0 build
> node scripts/build.mjs

Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

---

## 8. Protected Boundaries Check

Ran:
```powershell
git diff --check
git diff src/preload.js src/instant_load.js manifests/ dist/
```
**Result:** ZERO changes to protected files.

---

## 9. Risk Assessment & Rollback Strategy

### Risk Assessment
- **Risk Level:** Low.
- **Compatibility:** Controllers preserve exact DOM class names (`.hidden`, `.modal-overlay`, `.context-menu`, `.active`) and styling attributes.
- **Backward Compatibility:** All existing global functions (`hideAllContextMenus`, `positionContextMenuInViewport`, `ensureMenuMountedToBody`, `openModal`, `closeModal`) remain available and delegate directly to the new controllers.
- **Defensive Design:** Both controllers degrade gracefully in headless or test environments where DOM APIs (`document.body`, `getComputedStyle`, `requestAnimationFrame`) are stubbed or absent.

### Rollback Strategy
If any regression occurs:
1. Revert changes in `src/new-tab.html` (remove script tags for `dialog-controller.js` and `context-menu-controller.js`).
2. Revert delegation in `src/new-tab.js` to restore inline positioning and dismissal routines.
3. Remove `src/newtab/core/dialog-controller.js`, `src/newtab/core/context-menu-controller.js`, and their test files.
4. Run `npm.cmd test` and `npm.cmd run build` to confirm restoration.
