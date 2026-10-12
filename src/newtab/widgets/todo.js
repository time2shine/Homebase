// ===============================================
// --- TO-DO WIDGET CONTROLLER ---
// ===============================================

(function () {
  'use strict';

  // Storage keys
  const TODO_ITEMS_KEY = 'todoItems';
  const TODO_HIDE_DONE_KEY = 'todoHideDone';

  // Private state
  let todoItems = [];
  let todoHideDone = false;
  let todoListenerRegistry = null;
  let todoInitialized = false;

  // Private DOM reference cache
  let domElements = null;

  function resolveDomElements() {
    if (typeof document === 'undefined') {
      return {
        todoWidget: null,
        todoInput: null,
        todoAddBtn: null,
        todoList: null,
        todoClearBtn: null,
        todoFilterAllBtn: null,
        todoFilterActiveBtn: null
      };
    }
    return {
      todoWidget: document.querySelector('.widget-todo'),
      todoInput: document.getElementById('todo-input'),
      todoAddBtn: document.getElementById('todo-add-btn'),
      todoList: document.getElementById('todo-list'),
      todoClearBtn: document.getElementById('todo-clear-btn'),
      todoFilterAllBtn: document.getElementById('todo-filter-all'),
      todoFilterActiveBtn: document.getElementById('todo-filter-active')
    };
  }

  function getDomElements() {
    if (!domElements) {
      domElements = resolveDomElements();
    }
    return domElements;
  }

  function generateTodoId() {
    return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function generateUniqueTodoId(usedIds) {
    let id = generateTodoId();
    while (usedIds.has(id)) {
      id = generateTodoId();
    }
    return id;
  }

  function normalizeTodoItems(items) {
    const list = Array.isArray(items) ? items : [];
    const normalized = [];
    const seen = new Set();
    list.forEach((item) => {
      if (!item || typeof item.text !== 'string') return;
      const text = item.text.trim();
      if (!text) return;
      let id = typeof item.id === 'string' && item.id.trim() ? item.id : '';
      if (!id || seen.has(id)) {
        id = generateUniqueTodoId(seen);
      }
      seen.add(id);
      const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
      normalized.push({
        id,
        text,
        done: item.done === true,
        createdAt
      });
    });
    return normalized;
  }

  function getVisibleTodoItems() {
    if (!todoHideDone) return todoItems.slice();
    return todoItems.filter((item) => !item.done);
  }

  function syncTodoFilterUI() {
    const dom = getDomElements();
    const showActiveOnly = todoHideDone === true;
    if (dom.todoFilterAllBtn) {
      dom.todoFilterAllBtn.classList.toggle('is-selected', !showActiveOnly);
      dom.todoFilterAllBtn.setAttribute('aria-pressed', (!showActiveOnly).toString());
    }
    if (dom.todoFilterActiveBtn) {
      dom.todoFilterActiveBtn.classList.toggle('is-selected', showActiveOnly);
      dom.todoFilterActiveBtn.setAttribute('aria-pressed', showActiveOnly.toString());
    }
  }

  function renderTodoList() {
    const dom = getDomElements();
    if (!dom.todoList) return;
    const visibleItems = getVisibleTodoItems();
    dom.todoList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    if (visibleItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'todo-empty';
      empty.textContent = (todoItems.length > 0 && todoHideDone) ? 'No active tasks' : 'No tasks yet';
      fragment.appendChild(empty);
    } else {
      visibleItems.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        if (item.done) li.classList.add('done');

        const label = document.createElement('label');
        label.className = 'todo-item-main';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'todo-toggle';
        toggle.checked = item.done === true;
        toggle.dataset.todoId = item.id;

        const text = document.createElement('span');
        text.className = 'todo-text';
        text.textContent = item.text;

        label.appendChild(toggle);
        label.appendChild(text);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'todo-delete-btn';
        delBtn.dataset.todoId = item.id;
        delBtn.setAttribute('aria-label', 'Delete task');
        delBtn.textContent = 'Delete';

        li.appendChild(label);
        li.appendChild(delBtn);
        fragment.appendChild(li);
      });
    }
    dom.todoList.appendChild(fragment);

    syncTodoFilterUI();

    if (typeof revealWidget === 'function') {
      revealWidget('.widget-todo');
    }
  }

  function updateTodoCache() {
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setFastMirror === 'function') {
      try {
        const payload = {
          items: todoItems.map((item) => ({
            id: item.id,
            text: item.text,
            done: item.done === true,
            createdAt: item.createdAt
          })),
          hideDone: todoHideDone,
          __timestamp: Date.now()
        };
        HomebaseWidgetStorage.setFastMirror('fast-todo', JSON.stringify(payload));
      } catch (err) {
        // Fast cache is best-effort only
      }
    }
  }

  function persistTodoState() {
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setTodoState === 'function') {
      HomebaseWidgetStorage.setTodoState({ items: todoItems, hideDone: todoHideDone }).catch((err) => {
        console.warn('[HomebaseWidgetTodo] Failed to save todo items', err);
      });
    }
  }

  function commitTodoState(options = {}) {
    renderTodoList();
    updateTodoCache();
    if (options.persist !== false) {
      persistTodoState();
    }
  }

  async function loadTodoState() {
    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.getTodoState === 'function') {
      try {
        const stored = await HomebaseWidgetStorage.getTodoState();
        if (stored) {
          todoItems = normalizeTodoItems(stored.items);
          todoHideDone = stored.hideDone === true;
        }
      } catch (err) {
        console.warn('[HomebaseWidgetTodo] Failed to load todo items', err);
      }
    }
    commitTodoState({ persist: false });
  }

  function addTodoFromInput() {
    const dom = getDomElements();
    if (!dom.todoInput) return;
    const text = dom.todoInput.value.trim();
    if (!text) return;
    todoItems.push({
      id: generateTodoId(),
      text,
      done: false,
      createdAt: Date.now()
    });
    dom.todoInput.value = '';
    commitTodoState();
  }

  function clearCompletedTodos() {
    const nextItems = todoItems.filter((item) => !item.done);
    if (nextItems.length === todoItems.length) return;
    todoItems = nextItems;
    commitTodoState();
  }

  function handleTodoToggle(event) {
    const target = event.target;
    if (!target || !target.classList || !target.classList.contains('todo-toggle')) return;
    const id = target.dataset.todoId;
    if (!id) return;
    const item = todoItems.find((entry) => entry.id === id);
    if (!item) return;
    item.done = target.checked;
    commitTodoState();
  }

  function handleTodoDelete(event) {
    const dom = getDomElements();
    if (!dom.todoList) return;
    const btn = event.target.closest('.todo-delete-btn');
    if (!btn || !dom.todoList.contains(btn)) return;
    const id = btn.dataset.todoId;
    if (!id) return;
    const nextItems = todoItems.filter((entry) => entry.id !== id);
    if (nextItems.length === todoItems.length) return;
    todoItems = nextItems;
    commitTodoState();
  }

  function setTodoHideDone(nextHideDone) {
    const nextValue = nextHideDone === true;
    if (todoHideDone === nextValue) {
      syncTodoFilterUI();
      return;
    }
    todoHideDone = nextValue;
    commitTodoState();
  }

  async function initialize() {
    domElements = resolveDomElements();
    const dom = domElements;
    if (!dom.todoWidget || !dom.todoList || !dom.todoInput) return;
    if (todoInitialized) return;
    todoInitialized = true;

    if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.createListenerRegistry === 'function') {
      todoListenerRegistry = HomebaseWidgetLifecycle.createListenerRegistry();
    } else {
      todoListenerRegistry = {
        on(target, type, fn, opt) { target?.addEventListener(type, fn, opt); },
        removeAll() {}
      };
    }

    if (dom.todoAddBtn) {
      todoListenerRegistry.on(dom.todoAddBtn, 'click', addTodoFromInput);
    }

    if (dom.todoInput) {
      todoListenerRegistry.on(dom.todoInput, 'keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addTodoFromInput();
        }
      });
    }

    if (dom.todoList) {
      todoListenerRegistry.on(dom.todoList, 'change', handleTodoToggle);
      todoListenerRegistry.on(dom.todoList, 'click', handleTodoDelete);
    }

    if (dom.todoClearBtn) {
      todoListenerRegistry.on(dom.todoClearBtn, 'click', clearCompletedTodos);
    }

    if (dom.todoFilterAllBtn) {
      todoListenerRegistry.on(dom.todoFilterAllBtn, 'click', () => {
        setTodoHideDone(false);
      });
    }

    if (dom.todoFilterActiveBtn) {
      todoListenerRegistry.on(dom.todoFilterActiveBtn, 'click', () => {
        setTodoHideDone(true);
      });
    }

    await loadTodoState();
  }

  function destroy() {
    if (todoListenerRegistry) {
      todoListenerRegistry.removeAll();
      todoListenerRegistry = null;
    }
    todoInitialized = false;
    domElements = null;
  }

  function onShow() {
    if (!todoInitialized) {
      initialize();
      return;
    }
    renderTodoList();
  }

  function onHide() {}

  function pause() {}

  function resume() {
    if (!todoInitialized) return;
    renderTodoList();
  }

  async function setupTodoWidget() {
    return HomebaseWidgetTodo.initialize();
  }

  function setTodoPreference(show = true, options = {}) {
    const shouldShow = show !== false;
    if (typeof appShowTodoPreference !== 'undefined') {
      appShowTodoPreference = shouldShow;
    }
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (globalScope && 'appShowTodoPreference' in globalScope) {
      globalScope.appShowTodoPreference = shouldShow;
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('todo-hidden', !shouldShow);
    }

    if (typeof HomebaseWidgetStorage !== 'undefined' && typeof HomebaseWidgetStorage.setFastMirror === 'function') {
      HomebaseWidgetStorage.setFastMirror('fast-show-todo', shouldShow ? '1' : '0');
    }

    if (options.applyVisibility !== false && typeof applyWidgetVisibility === 'function') {
      applyWidgetVisibility();
    }

    if (options.updateUI !== false && typeof updateWidgetSettingsUI === 'function') {
      updateWidgetSettingsUI();
    }
  }

  function handleTodoStorageChange(changes, area) {
    if (area !== 'local') return;

    let shouldRenderTodo = false;

    if (changes[TODO_ITEMS_KEY]) {
      todoItems = normalizeTodoItems(changes[TODO_ITEMS_KEY].newValue);
      shouldRenderTodo = true;
    }

    if (changes[TODO_HIDE_DONE_KEY]) {
      todoHideDone = changes[TODO_HIDE_DONE_KEY].newValue === true;
      shouldRenderTodo = true;
    }

    if (shouldRenderTodo) {
      updateTodoCache();
      renderTodoList();
    }
  }

  const HomebaseWidgetTodo = {
    initialize,
    init: initialize,
    destroy,
    onShow,
    onHide,
    pause,
    resume,
    normalizeTodoItems,
    setupTodoWidget,
    setPreference: setTodoPreference,
    setTodoPreference,
    handleStorageChange: handleTodoStorageChange,
    handleTodoStorageChange,
    persistState: persistTodoState,
    persistTodoState,
    loadState: loadTodoState,
    loadTodoState
  };

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (globalScope) {
    globalScope.HomebaseWidgetTodo = HomebaseWidgetTodo;
    globalScope.HomebaseTodoWidgetController = HomebaseWidgetTodo;
    globalScope.setupTodoWidget = setupTodoWidget;
    globalScope.setTodoPreference = setTodoPreference;
    globalScope.handleTodoStorageChange = handleTodoStorageChange;
    globalScope.persistTodoState = persistTodoState;
    globalScope.loadTodoState = loadTodoState;
    globalScope.normalizeTodoItems = normalizeTodoItems;
  }
  if (typeof window !== 'undefined' && globalScope !== window) {
    window.HomebaseWidgetTodo = HomebaseWidgetTodo;
    window.HomebaseTodoWidgetController = HomebaseWidgetTodo;
    window.setupTodoWidget = setupTodoWidget;
    window.setTodoPreference = setTodoPreference;
    window.handleTodoStorageChange = handleTodoStorageChange;
    window.persistTodoState = persistTodoState;
    window.loadTodoState = loadTodoState;
    window.normalizeTodoItems = normalizeTodoItems;
  }

  if (typeof HomebaseWidgetLifecycle !== 'undefined' && typeof HomebaseWidgetLifecycle.registerWidget === 'function') {
    HomebaseWidgetLifecycle.registerWidget('todo', HomebaseWidgetTodo);
  }
})();
