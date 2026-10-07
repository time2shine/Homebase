import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const utilsScriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const dialogsScriptPath = path.join(rootDir, 'src/newtab/core/dialogs.js');
const dialogControllerScriptPath = path.join(rootDir, 'src/newtab/core/dialog-controller.js');

const utilsScriptCode = fs.readFileSync(utilsScriptPath, 'utf8');
const dialogsScriptCode = fs.readFileSync(dialogsScriptPath, 'utf8');
const dialogControllerScriptCode = fs.readFileSync(dialogControllerScriptPath, 'utf8');

function createDialogTestEnvironment(options = {}) {
  const elementsById = {};
  const classListSet = new Set();
  const documentListeners = [];

  const documentMock = {
    body: {
      classList: {
        add: (cls) => classListSet.add(cls),
        remove: (cls) => classListSet.delete(cls),
        contains: (cls) => classListSet.has(cls)
      }
    },
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      id: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      }
    }),
    getElementById: (id) => elementsById[id] || null,
    querySelectorAll: (selector) => {
      if (selector === '.modal-overlay:not(.hidden)') {
        return Object.values(elementsById).filter(el =>
          el.classList && el.classList.contains('modal-overlay') && !el.classList.contains('hidden')
        );
      }
      return [];
    },
    addEventListener: (type, handler) => {
      documentListeners.push({ type, handler });
    }
  };

  class MockElement {}

  const sandbox = {
    console,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    window: null,
    document: documentMock,
    Element: MockElement,
    getComputedStyle: () => ({
      animationName: 'none',
      animationDuration: '0s',
      animationDelay: '0s'
    })
  };

  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);

  vm.runInContext(utilsScriptCode, context);
  vm.runInContext(dialogsScriptCode, context);
  vm.runInContext(dialogControllerScriptCode, context);

  function createMockModal(modalId) {
    const modalClasses = new Set(['modal-overlay', 'hidden']);
    const dialogEl = {
      tagName: 'DIV',
      className: 'dialog-content',
      style: {},
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const modalEl = {
      id: modalId,
      style: { display: 'none' },
      classList: {
        add: (cls) => modalClasses.add(cls),
        remove: (cls) => modalClasses.delete(cls),
        contains: (cls) => modalClasses.has(cls)
      },
      querySelector: (selector) => (selector === '.dialog-content' ? dialogEl : null)
    };

    elementsById[modalId] = modalEl;
    return { modalEl, dialogEl };
  }

  return {
    context,
    sandbox,
    elementsById,
    classListSet,
    documentListeners,
    createMockModal
  };
}

test('Dialog Controller - exports check', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;

  assert.ok(ctrl, 'HomebaseDialogController exists on window');
  assert.equal(typeof ctrl.initialize, 'function');
  assert.equal(typeof ctrl.openDialog, 'function');
  assert.equal(typeof ctrl.closeDialog, 'function');
  assert.equal(typeof ctrl.closeActiveDialog, 'function');
  assert.equal(typeof ctrl.showConfirmDialog, 'function');
  assert.equal(typeof ctrl.showAlertDialog, 'function');
  assert.equal(typeof ctrl.handleEscapeKey, 'function');
});

test('Dialog Controller - openDialog and closeDialog lifecycle', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;
  const { modalEl } = env.createMockModal('test-modal');

  let cleanedUp = false;
  const descriptor = ctrl.openDialog('test-modal', null, '.dialog-content');

  assert.ok(descriptor, 'Descriptor returned');
  assert.equal(ctrl.isDialogOpen('test-modal'), true);
  assert.equal(env.classListSet.has('modal-open'), true);
  assert.equal(modalEl.classList.contains('hidden'), false);

  ctrl.closeDialog('test-modal', '.dialog-content', () => { cleanedUp = true; });

  assert.equal(ctrl.isDialogOpen('test-modal'), false);
  assert.equal(cleanedUp, true);
  assert.equal(env.classListSet.has('modal-open'), false);
  assert.equal(modalEl.classList.contains('hidden'), true);
});

test('Dialog Controller - closeActiveDialog LIFO dismissal', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;
  env.createMockModal('modal-first');
  env.createMockModal('modal-second');

  ctrl.openDialog('modal-first');
  ctrl.openDialog('modal-second');

  assert.equal(ctrl.getActiveDialog().modalId, 'modal-second');

  const closedTop = ctrl.closeActiveDialog();
  assert.equal(closedTop, true);
  assert.equal(ctrl.isDialogOpen('modal-second'), false);
  assert.equal(ctrl.isDialogOpen('modal-first'), true);
  assert.equal(ctrl.getActiveDialog().modalId, 'modal-first');

  const closedFirst = ctrl.closeActiveDialog();
  assert.equal(closedFirst, true);
  assert.equal(ctrl.isDialogOpen('modal-first'), false);
  assert.equal(ctrl.getActiveDialog(), null);
});

test('Dialog Controller - handleEscapeKey closes top active dialog', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;
  env.createMockModal('modal-escape');

  ctrl.openDialog('modal-escape');
  assert.equal(ctrl.isDialogOpen('modal-escape'), true);

  const handled = ctrl.handleEscapeKey({ key: 'Escape', target: {} });
  assert.equal(handled, true);
  assert.equal(ctrl.isDialogOpen('modal-escape'), false);
});

test('Dialog Controller - handleEscapeKey ignores non-Escape or rename input target', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;
  env.createMockModal('modal-rename');

  ctrl.openDialog('modal-rename');

  const renameTarget = {
    classList: { contains: (cls) => cls === 'grid-item-rename-input' }
  };
  const ignoredForRename = ctrl.handleEscapeKey({ key: 'Escape', target: renameTarget });
  assert.equal(ignoredForRename, false);
  assert.equal(ctrl.isDialogOpen('modal-rename'), true);

  const ignoredNonEscape = ctrl.handleEscapeKey({ key: 'Enter', target: {} });
  assert.equal(ignoredNonEscape, false);
  assert.equal(ctrl.isDialogOpen('modal-rename'), true);
});

test('Dialog Controller - missing DOM safety', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;

  assert.doesNotThrow(() => {
    ctrl.openDialog('non-existent-modal');
    ctrl.closeDialog('non-existent-modal');
    ctrl.closeActiveDialog();
  });
});

test('Dialog Controller - initialize binds escape listener', () => {
  const env = createDialogTestEnvironment();
  const ctrl = env.sandbox.window.HomebaseDialogController;

  ctrl.initialize();
  const keydownListener = env.documentListeners.find(l => l.type === 'keydown');
  assert.ok(keydownListener, 'Keydown listener attached');
});
