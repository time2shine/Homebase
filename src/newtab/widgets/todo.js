// ===============================================

// --- TO-DO WIDGET ---

// ===============================================

const TODO_ITEMS_KEY = 'todoItems';

const TODO_HIDE_DONE_KEY = 'todoHideDone';

const todoWidget = document.querySelector('.widget-todo');

const todoInput = document.getElementById('todo-input');

const todoAddBtn = document.getElementById('todo-add-btn');

const todoList = document.getElementById('todo-list');

const todoClearBtn = document.getElementById('todo-clear-btn');

const todoFilterAllBtn = document.getElementById('todo-filter-all');

const todoFilterActiveBtn = document.getElementById('todo-filter-active');

let todoItems = [];

let todoHideDone = false;

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
  const showActiveOnly = todoHideDone === true;
  if (todoFilterAllBtn) {
    todoFilterAllBtn.classList.toggle('is-selected', !showActiveOnly);
    todoFilterAllBtn.setAttribute('aria-pressed', (!showActiveOnly).toString());
  }
  if (todoFilterActiveBtn) {
    todoFilterActiveBtn.classList.toggle('is-selected', showActiveOnly);
    todoFilterActiveBtn.setAttribute('aria-pressed', showActiveOnly.toString());
  }
}

function renderTodoList() {
  if (!todoList) return;
  const visibleItems = getVisibleTodoItems();
  todoList.innerHTML = '';
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
  todoList.appendChild(fragment);

  syncTodoFilterUI();

  revealWidget('.widget-todo');
}

function updateTodoCache() {
  try {
    if (!window.localStorage) return;
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
    localStorage.setItem('fast-todo', JSON.stringify(payload));
  } catch (err) {
    // Ignore; fast cache is best-effort only
  }
}

function persistTodoState() {
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.setMany) {
    HomebaseStorage.setMany({
      [TODO_ITEMS_KEY]: todoItems,
      [TODO_HIDE_DONE_KEY]: todoHideDone
    }).catch((err) => {
      console.warn('Failed to save todo items', err);
    });
    return;
  }
  if (!browser || !browser.storage || !browser.storage.local) return;
  browser.storage.local
    .set({ [TODO_ITEMS_KEY]: todoItems, [TODO_HIDE_DONE_KEY]: todoHideDone })
    .catch((err) => {
      console.warn('Failed to save todo items', err);
    });
}

function commitTodoState(options = {}) {
  renderTodoList();
  updateTodoCache();
  if (options.persist !== false) {
    persistTodoState();
  }
}

async function loadTodoState() {
  if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.getMany) {
    try {
      const stored = await HomebaseStorage.getMany([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY]);
      todoItems = normalizeTodoItems(stored[TODO_ITEMS_KEY]);
      todoHideDone = stored[TODO_HIDE_DONE_KEY] === true;
    } catch (err) {
      console.warn('Failed to load todo items', err);
    }
    commitTodoState({ persist: false });
    return;
  }
  if (!browser || !browser.storage || !browser.storage.local) {
    commitTodoState({ persist: false });
    return;
  }
  try {
    const stored = await browser.storage.local.get([TODO_ITEMS_KEY, TODO_HIDE_DONE_KEY]);
    todoItems = normalizeTodoItems(stored[TODO_ITEMS_KEY]);
    todoHideDone = stored[TODO_HIDE_DONE_KEY] === true;
  } catch (err) {
    console.warn('Failed to load todo items', err);
  }
  commitTodoState({ persist: false });
}

function addTodoFromInput() {
  if (!todoInput) return;
  const text = todoInput.value.trim();
  if (!text) return;
  todoItems.push({
    id: generateTodoId(),
    text,
    done: false,
    createdAt: Date.now()
  });
  todoInput.value = '';
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
  if (!todoList) return;
  const btn = event.target.closest('.todo-delete-btn');
  if (!btn || !todoList.contains(btn)) return;
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

async function setupTodoWidget() {
  if (!todoWidget || !todoList || !todoInput) return;
  if (todoWidget.dataset.ready === '1') return;
  todoWidget.dataset.ready = '1';

  if (todoAddBtn) {
    todoAddBtn.addEventListener('click', addTodoFromInput);
  }

  if (todoInput) {
    todoInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTodoFromInput();
      }
    });
  }

  if (todoList) {
    todoList.addEventListener('change', handleTodoToggle);
    todoList.addEventListener('click', handleTodoDelete);
  }

  if (todoClearBtn) {
    todoClearBtn.addEventListener('click', clearCompletedTodos);
  }

  if (todoFilterAllBtn) {
    todoFilterAllBtn.addEventListener('click', () => {
      setTodoHideDone(false);
    });
  }

  if (todoFilterActiveBtn) {
    todoFilterActiveBtn.addEventListener('click', () => {
      setTodoHideDone(true);
    });
  }

  await loadTodoState();
}

function setTodoPreference(show = true, options = {}) {
  const shouldShow = show !== false;
  appShowTodoPreference = shouldShow;

  if (document.documentElement) {
    document.documentElement.classList.toggle('todo-hidden', !shouldShow);
  }

  try {
    if (window.localStorage) {
      localStorage.setItem('fast-show-todo', shouldShow ? '1' : '0');
    }
  } catch (e) {
    // Ignore; instant mirror is best-effort only
  }

  if (options.persist !== false) {
    if (typeof HomebaseStorage !== 'undefined' && HomebaseStorage.set) {
      HomebaseStorage.set(APP_SHOW_TODO_KEY, shouldShow).catch((err) => {
        console.warn('Failed to save todo visibility preference', err);
      });
    } else if (browser && browser.storage && browser.storage.local) {
      browser.storage.local
        .set({ [APP_SHOW_TODO_KEY]: shouldShow })
        .catch((err) => {
          console.warn('Failed to save todo visibility preference', err);
        });
    }
  }

  if (options.applyVisibility !== false) {
    applyWidgetVisibility();
  }

  if (options.updateUI !== false) {
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
