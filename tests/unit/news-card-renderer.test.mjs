import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rendererScriptPath = path.join(rootDir, 'src/newtab/widgets/news-card-renderer.js');
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
  const el = {
    tagName: tagName.toUpperCase(),
    classList: createMockClassList(),
    textContent: '',
    innerHTML: '',
    children,
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
    removeAttribute: (k) => attrs.delete(k),
    querySelector: (sel) => {
      if (sel.includes('img') || sel.includes('image')) return createDummyEl('img');
      return createDummyEl('div');
    },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 110, bottom: 60, width: 100, height: 40 })
  };
  return el;
}

function createRendererContext() {
  const docBody = createDummyEl('body');
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
    document: {
      body: docBody,
      createElement: (tag) => createDummyEl(tag),
      getElementById: () => null,
      createDocumentFragment: () => {
        const fragChildren = [];
        return {
          children: fragChildren,
          appendChild: (c) => fragChildren.push(c)
        };
      }
    },
    window: null,
    innerWidth: 1024,
    innerHeight: 768,
    requestAnimationFrame: (fn) => fn(),
    setText: (el, val) => { if (el) el.textContent = val; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(rendererScriptCode, context);
  return { context, docBody };
}

test('news-card-renderer: window.HomebaseNewsCardRenderer exports complete API', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;
  assert.ok(renderer, 'HomebaseNewsCardRenderer must exist');
  assert.strictEqual(typeof renderer.formatTimeAgo, 'function');
  assert.strictEqual(typeof renderer.formatNewsUpdated, 'function');
  assert.strictEqual(typeof renderer.updateNewsUpdated, 'function');
  assert.strictEqual(typeof renderer.createNewsItem, 'function');
  assert.strictEqual(typeof renderer.createEmptyNewsItem, 'function');
  assert.strictEqual(typeof renderer.renderNewsList, 'function');
  assert.strictEqual(typeof renderer.ensureNewsHoverPreview, 'function');
  assert.strictEqual(typeof renderer.positionNewsHoverPreview, 'function');
  assert.strictEqual(typeof renderer.showNewsHoverPreview, 'function');
  assert.strictEqual(typeof renderer.hideNewsHoverPreview, 'function');
});

test('news-card-renderer: formatTimeAgo calculates human readable relative intervals', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;

  const now = Date.now();
  assert.strictEqual(renderer.formatTimeAgo(now - 10 * 1000), 'just now');
  assert.strictEqual(renderer.formatTimeAgo(now - 5 * 60 * 1000), '5m ago');
  assert.strictEqual(renderer.formatTimeAgo(now - 3 * 3600 * 1000), '3h ago');
  assert.strictEqual(renderer.formatTimeAgo(now - 2 * 86400 * 1000), '2d ago');
  assert.strictEqual(renderer.formatTimeAgo(null), '');
  assert.strictEqual(renderer.formatTimeAgo('invalid'), '');
});

test('news-card-renderer: formatNewsUpdated formats timestamps correctly', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;

  const timestamp = new Date('2026-10-12T14:30:00Z').getTime();
  const label = renderer.formatNewsUpdated(timestamp);
  assert.ok(label.startsWith('Updated: '));
  assert.strictEqual(renderer.formatNewsUpdated(null), '');
  assert.strictEqual(renderer.formatNewsUpdated('invalid'), '');
});

test('news-card-renderer: createNewsItem creates article element with datasets and links', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;

  const item = {
    title: 'Breakthrough in AI Research',
    link: 'https://example.com/ai-news',
    description: 'Scientists discover new neural architectures.',
    image: 'https://example.com/thumb.jpg',
    publishedAt: Date.now() - 3600 * 1000
  };

  const li = renderer.createNewsItem(item);
  assert.ok(li);
  assert.strictEqual(li.className, 'news-item');
  assert.strictEqual(li.dataset.newsTitle, item.title);
  assert.strictEqual(li.dataset.newsDesc, item.description);
  assert.strictEqual(li.dataset.newsImage, item.image);
  assert.strictEqual(li.dataset.newsLink, item.link);
  assert.strictEqual(li.children.length, 2); // anchor + meta
  assert.strictEqual(li.children[0].className, 'news-title');
  assert.strictEqual(li.children[0].href, item.link);
  assert.strictEqual(li.children[0].textContent, item.title);
});

test('news-card-renderer: createEmptyNewsItem creates empty state with optional hint', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;

  const emptyDefault = renderer.createEmptyNewsItem();
  assert.strictEqual(emptyDefault.className, 'news-empty');
  assert.strictEqual(emptyDefault.textContent, 'No headlines available right now.');

  const emptyWithHint = renderer.createEmptyNewsItem({
    emptyMessage: 'Custom empty message',
    emptyHint: 'Try refreshing'
  });
  assert.strictEqual(emptyWithHint.textContent, 'Custom empty message');
  assert.strictEqual(emptyWithHint.children.length, 1);
  assert.strictEqual(emptyWithHint.children[0].className, 'news-empty-hint');
  assert.strictEqual(emptyWithHint.children[0].textContent, 'Try refreshing');
});

test('news-card-renderer: renderNewsList renders items and replaces container content', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;
  const container = createDummyEl('ul');

  const items = [
    { title: 'Item 1', link: 'https://example.com/1' },
    { title: 'Item 2', link: 'https://example.com/2' }
  ];

  renderer.renderNewsList(container, items);
  assert.strictEqual(container.children.length, 1); // DocumentFragment was passed

  // Empty list renders empty placeholder
  renderer.renderNewsList(container, []);
  assert.strictEqual(container.children.length, 1);
  assert.strictEqual(container.children[0].className, 'news-empty');
});

test('news-card-renderer: hover preview lifecycle methods manage popup visibility', () => {
  const { context } = createRendererContext();
  const renderer = context.HomebaseNewsCardRenderer;

  const preview = renderer.ensureNewsHoverPreview();
  assert.ok(preview);
  assert.strictEqual(preview.id, 'news-hover-preview');

  const itemEl = createDummyEl('li');
  itemEl.dataset.newsTitle = 'Hover Article Title';
  itemEl.dataset.newsDesc = 'Hover description';
  itemEl.dataset.newsImage = 'https://example.com/pic.png';

  renderer.showNewsHoverPreview(itemEl, preview);
  assert.strictEqual(preview.classList.contains('is-visible'), true);

  renderer.hideNewsHoverPreview(preview);
  assert.strictEqual(preview.classList.contains('is-visible'), false);
});
