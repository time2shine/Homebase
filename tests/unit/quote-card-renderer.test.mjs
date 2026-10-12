import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rendererScriptPath = path.join(rootDir, 'src/newtab/widgets/quote-card-renderer.js');
const rendererScriptCode = fs.readFileSync(rendererScriptPath, 'utf8');

function createMockClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((n) => classes.add(n)),
    remove: (...names) => names.forEach((n) => classes.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      } else if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return classes.has(name);
    },
    contains: (name) => classes.has(name)
  };
}

function createDummyEl(tagName = 'div') {
  const attrs = new Map();
  const children = [];
  const listeners = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    classList: createMockClassList(),
    textContent: '',
    innerHTML: '',
    children,
    childNodes: children,
    dataset: {},
    style: {},
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    replaceChildren: (...newChildren) => {
      children.length = 0;
      newChildren.forEach((c) => children.push(c));
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) || null,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent: (event) => {
      const fns = listeners.get(event.type) || [];
      fns.forEach((fn) => fn(event));
    },
    click: () => {
      const fns = listeners.get('click') || [];
      fns.forEach((fn) => fn({ type: 'click' }));
    },
    cloneNode: () => {
      const copy = createDummyEl(tagName);
      copy.textContent = el.textContent;
      return copy;
    }
  };
  return el;
}

function createRendererContext() {
  const elements = new Map();
  const getOrCreateEl = (id) => {
    if (!elements.has(id)) elements.set(id, createDummyEl());
    return elements.get(id);
  };

  const sandbox = {
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    Date,
    JSON,
    Math,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    document: {
      getElementById: (id) => getOrCreateEl(id),
      createElement: (tag) => createDummyEl(tag),
      createElementNS: (ns, tag) => createDummyEl(tag)
    },
    window: null,
    revealWidget: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(rendererScriptCode, context);
  return { context, elements };
}

test('quote-card-renderer: window.HomebaseQuoteCardRenderer exports complete API', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;
  assert.ok(renderer, 'HomebaseQuoteCardRenderer must exist');
  assert.strictEqual(typeof renderer.formatQuoteText, 'function');
  assert.strictEqual(typeof renderer.formatQuoteAuthor, 'function');
  assert.strictEqual(typeof renderer.renderQuoteCard, 'function');
  assert.strictEqual(typeof renderer.createCategoryPill, 'function');
  assert.strictEqual(typeof renderer.renderCategoryPills, 'function');
  assert.strictEqual(typeof renderer.renderCopySuccess, 'function');
});

test('quote-card-renderer: formatQuoteText wraps text in quotes and trims whitespace', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  assert.strictEqual(renderer.formatQuoteText('Hello world'), '"Hello world"');
  assert.strictEqual(renderer.formatQuoteText('  Keep going  '), '"Keep going"');
  assert.strictEqual(renderer.formatQuoteText(''), '');
  assert.strictEqual(renderer.formatQuoteText(null), '');
});

test('quote-card-renderer: formatQuoteAuthor formats author with dash prefix', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  assert.strictEqual(renderer.formatQuoteAuthor('Marcus Aurelius'), '- Marcus Aurelius');
  assert.strictEqual(renderer.formatQuoteAuthor('  Seneca  '), '- Seneca');
  assert.strictEqual(renderer.formatQuoteAuthor(''), '');
  assert.strictEqual(renderer.formatQuoteAuthor(null), '');
});

test('quote-card-renderer: renderQuoteCard sets quote text and author elements', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  const textEl = createDummyEl();
  const authorEl = createDummyEl();

  const rendered = renderer.renderQuoteCard(
    { text: 'Wisdom begins in wonder.', author: 'Socrates' },
    { quoteText: textEl, quoteAuthor: authorEl }
  );

  assert.strictEqual(rendered, true);
  assert.strictEqual(textEl.textContent, '"Wisdom begins in wonder."');
  assert.strictEqual(authorEl.textContent, '- Socrates');

  // Empty quote returns false
  assert.strictEqual(renderer.renderQuoteCard(null), false);
  assert.strictEqual(renderer.renderQuoteCard({ text: '' }), false);
});

test('quote-card-renderer: createCategoryPill sets attributes and classes', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  const pill = renderer.createCategoryPill('Philosophy', 'philosophy', false);
  assert.strictEqual(pill.className, 'quote-category-pill');
  assert.strictEqual(pill.textContent, 'Philosophy');
  assert.strictEqual(pill.dataset.value, 'philosophy');

  const allPill = renderer.createCategoryPill('All Categories', '__all__', true);
  assert.strictEqual(allPill.id, 'quote-categories-all-btn');
  assert.strictEqual(allPill.style.fontWeight, '600');
});

test('quote-card-renderer: renderCategoryPills manages category selection state', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  const container = createDummyEl();
  const tags = ['life', 'wisdom', 'success'];

  let selected = null;
  renderer.renderCategoryPills(container, tags, new Set(['wisdom']), (sel) => {
    selected = sel;
  });

  // container has: [All, life, wisdom, success]
  assert.strictEqual(container.children.length, 4);
  const allPill = container.children[0];
  const wisdomPill = container.children[2];

  assert.strictEqual(allPill.classList.contains('selected'), false);
  assert.strictEqual(wisdomPill.classList.contains('selected'), true);

  // Click 'All' pill
  allPill.click();
  assert.strictEqual(allPill.classList.contains('selected'), true);
  assert.strictEqual(wisdomPill.classList.contains('selected'), false);
  assert.deepStrictEqual([...selected], []);
});

test('quote-card-renderer: renderCopySuccess renders checkmark and restores nodes', async () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseQuoteCardRenderer;

  const button = createDummyEl('button');
  const initialText = createDummyEl('span');
  initialText.textContent = 'Copy';
  button.appendChild(initialText);

  renderer.renderCopySuccess(button, 10);
  assert.strictEqual(button.children.length, 1);
  assert.strictEqual(button.children[0].tagName, 'SVG');

  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(button.children.length, 1);
  assert.strictEqual(button.children[0].tagName, 'SPAN');
  assert.strictEqual(button.children[0].textContent, 'Copy');
});
