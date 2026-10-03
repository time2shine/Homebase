import { spawn } from "node:child_process";
import { statSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.join(rootDir, "src");
const severeRuntimePattern = /\b(?:ReferenceError|TypeError|SyntaxError|RangeError)\b|is not defined|Cannot read|Cannot set|undefined is not|Uncaught/i;
const expectedWidgetOrder = ["news", "todo", "quote", "weather"];
const smokeTimeoutMs = 12000;

let server = null;
let browserProcess = null;
let tempUserDataDir = "";

async function main() {
  const smokeRoot = resolveSmokeRoot();
  const browserPath = findBrowserExecutable();

  try {
    if (!browserPath) {
      console.warn("Homebase new-tab browser smoke: No supported browser executable detected in standard system paths.");
      console.warn("To run browser smoke testing, set HOMEBASE_SMOKE_BROWSER, CHROME_PATH, or EDGE_PATH to your browser executable.");
      skip("no browser executable found; set HOMEBASE_SMOKE_BROWSER to run the browser smoke test");
    } else if (typeof WebSocket !== "function") {
      skip("this Node runtime does not expose global WebSocket, which is needed for dependency-free CDP control");
    } else {
      await runSmoke(smokeRoot, browserPath);
    }
  } catch (error) {
    console.error("Homebase new-tab browser smoke");
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.warn(`WARN smoke cleanup failed: ${error.message}`);
    }
  }
}

async function runSmoke(smokeRoot, browserPath) {
  const htmlPath = path.join(smokeRoot, "new-tab.html");
  const html = await fs.readFile(htmlPath, "utf8");
  const smokeHtml = injectSmokeHarness(html);
  const staticServer = await startStaticServer(smokeRoot, smokeHtml);
  server = staticServer.server;

  const pageUrl = `${staticServer.origin}/new-tab.html`;
  const cdpPort = await getFreePort();
  tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "homebase-smoke-"));

  const launchResult = await launchBrowser(browserPath, cdpPort, tempUserDataDir);
  if (launchResult.skipped) {
    skip(launchResult.reason);
    return;
  }

  const browserWsUrl = await waitForBrowserWebSocket(cdpPort);
  const browserClient = new CdpClient(browserWsUrl);
  await browserClient.connect();

  const { targetId } = await browserClient.send("Target.createTarget", { url: "about:blank" });
  const pageWsUrl = await waitForPageWebSocket(cdpPort, targetId);
  const pageClient = new CdpClient(pageWsUrl);
  const cdpIssues = [];

  await pageClient.connect();
  pageClient.on("Runtime.exceptionThrown", (event) => {
    cdpIssues.push(formatRuntimeException(event));
  });
  pageClient.on("Runtime.consoleAPICalled", (event) => {
    if (event.type !== "error") return;
    const text = (event.args || []).map((arg) => arg.value || arg.description || "").join(" ");
    if (severeRuntimePattern.test(text)) {
      cdpIssues.push(`console.error: ${text}`);
    }
  });

  await pageClient.send("Runtime.enable");
  await pageClient.send("Page.enable");
  await pageClient.send("Page.navigate", { url: pageUrl });
  await waitForPageLoad(pageClient);
  try {
    await waitForSmokeReady(pageClient);
  } catch (err) {
    if (cdpIssues.length > 0) {
      console.error("CDP Issues caught during startup:");
      cdpIssues.forEach((issue) => console.error("  " + issue));
    }
    const pageErrors = await evaluate(pageClient, "window.__homebaseSmokeConsoleErrors || []").catch(() => []);
    if (pageErrors.length > 0) {
      console.error("Page console errors:");
      pageErrors.forEach((e) => console.error("  " + JSON.stringify(e)));
    }
    throw err;
  }

  const smokeResult = await evaluate(pageClient, getSmokeCheckExpression());
  const failures = analyzeSmokeResult(smokeResult, cdpIssues);

  console.log("Homebase new-tab browser smoke");
  console.log(`PASS browser launched - ${path.basename(browserPath)}`);
  console.log(`PASS loaded page - ${pageUrl}`);
  printSmokeCheck("required DOM surfaces exist", failures.dom.length === 0, failures.dom.join(", "));
  printSmokeCheck("core controllers are available", failures.controllers.length === 0, failures.controllers.join(", "));
  printSmokeCheck("startup perf helpers are available", failures.perf.length === 0, failures.perf.join(", "));
  printSmokeCheck("fast-widget-order preload applied", failures.fastWidgetOrder.length === 0, `order: ${smokeResult.fastWidgetOrder.join(" > ")}`);
  printSmokeCheck("no ReferenceError or severe runtime errors", failures.runtime.length === 0, failures.runtime.join("; "));

  await pageClient.close();
  await browserClient.close();

  if (Object.values(failures).some((group) => group.length > 0)) {
    process.exitCode = 1;
  }
}

function analyzeSmokeResult(smokeResult, cdpIssues) {
  const domFailures = [];
  const perfFailures = [];
  const orderFailures = [];
  const runtimeFailures = [...cdpIssues];

  const requiredDom = {
    "search input": smokeResult.dom.searchInput,
    sidebar: smokeResult.dom.sidebar,
    "weather widget": smokeResult.dom.weatherWidget,
    "quote widget": smokeResult.dom.quoteWidget,
    "todo widget": smokeResult.dom.todoWidget,
    "news widget": smokeResult.dom.newsWidget,
    "bookmark grid": smokeResult.dom.bookmarkGrid,
    "settings button": smokeResult.dom.settingsButton,
    "body ready class": smokeResult.dom.bodyReady
  };

  for (const [label, ok] of Object.entries(requiredDom)) {
    if (!ok) domFailures.push(label);
  }

  const expectedControllers = {
    HomebaseDialogController: smokeResult.controllers?.dialog,
    HomebaseContextMenuController: smokeResult.controllers?.contextMenu,
    HomebaseSearchUIController: smokeResult.controllers?.searchUI,
    HomebaseSearchInteractionController: smokeResult.controllers?.searchInteraction,
    HomebaseFaviconPipeline: smokeResult.controllers?.faviconPipeline,
    HomebaseWallpaperController: smokeResult.controllers?.wallpaper,
    HomebaseBookmarkGridController: smokeResult.controllers?.bookmarkGrid,
    HomebaseBookmarkLoader: smokeResult.controllers?.bookmarkLoader,
    HomebaseStorage: smokeResult.controllers?.storage
  };

  const controllerFailures = [];
  for (const [label, ok] of Object.entries(expectedControllers)) {
    if (!ok) controllerFailures.push(label);
  }

  const expectedPerfHelpers = {
    "__HB_STARTUP_PERF": smokeResult.perf.startupStore,
    hbPerfMark: smokeResult.perf.hbPerfMark,
    hbPerfMeasure: smokeResult.perf.hbPerfMeasure,
    recordStartupPerfEvent: smokeResult.perf.recordStartupPerfEvent
  };

  for (const [label, ok] of Object.entries(expectedPerfHelpers)) {
    if (!ok) perfFailures.push(label);
  }

  if (!arraysEqual(smokeResult.fastWidgetOrder, expectedWidgetOrder)) {
    orderFailures.push(`expected ${expectedWidgetOrder.join(" > ")}, got ${smokeResult.fastWidgetOrder.join(" > ") || "(none)"}`);
  }

  for (const entry of smokeResult.smokeErrors) {
    const text = entry && entry.message ? entry.message : String(entry);
    if (severeRuntimePattern.test(text)) {
      runtimeFailures.push(text);
    }
  }

  for (const entry of smokeResult.smokeConsoleErrors) {
    const text = String(entry || "");
    if (severeRuntimePattern.test(text)) {
      runtimeFailures.push(text);
    }
  }

  return {
    dom: domFailures,
    controllers: controllerFailures,
    perf: perfFailures,
    fastWidgetOrder: orderFailures,
    runtime: [...new Set(runtimeFailures.filter(Boolean))]
  };
}

function getSmokeCheckExpression() {
  return `(() => {
    const widgetOrder = Array.from(document.querySelectorAll('.sidebar > .widget-weather, .sidebar > .widget-quote, .sidebar > #todo-widget, .sidebar > .widget-news')).map((el) => {
      if (el.id === 'todo-widget' || el.classList.contains('widget-todo')) return 'todo';
      if (el.classList.contains('widget-weather')) return 'weather';
      if (el.classList.contains('widget-quote')) return 'quote';
      if (el.classList.contains('widget-news')) return 'news';
      return '';
    }).filter(Boolean);

    return {
      readyState: document.readyState,
      dom: {
        searchInput: !!document.querySelector('#search-input'),
        sidebar: !!document.querySelector('.sidebar'),
        weatherWidget: !!document.querySelector('.sidebar .widget-weather'),
        quoteWidget: !!document.querySelector('.sidebar .widget-quote'),
        todoWidget: !!document.querySelector('.sidebar #todo-widget, .sidebar .widget-todo'),
        newsWidget: !!document.querySelector('.sidebar .widget-news'),
        bookmarkGrid: !!document.querySelector('#bookmarks-grid'),
        settingsButton: !!document.querySelector('#main-settings-btn'),
        bodyReady: !!document.body && document.body.classList.contains('ready')
      },
      controllers: {
        dialog: typeof window.HomebaseDialogController === 'object' && window.HomebaseDialogController !== null,
        contextMenu: typeof window.HomebaseContextMenuController === 'object' && window.HomebaseContextMenuController !== null,
        searchUI: typeof (window.HomebaseSearchUiController || window.HomebaseSearchUIController) === 'object' && (window.HomebaseSearchUiController || window.HomebaseSearchUIController) !== null,
        searchInteraction: typeof window.HomebaseSearchInteractionController === 'object' && window.HomebaseSearchInteractionController !== null,
        faviconPipeline: typeof window.HomebaseFaviconPipeline === 'object' && window.HomebaseFaviconPipeline !== null,
        wallpaper: typeof window.HomebaseWallpaperController === 'object' && window.HomebaseWallpaperController !== null,
        bookmarkGrid: typeof window.HomebaseBookmarkGridController === 'object' && window.HomebaseBookmarkGridController !== null,
        bookmarkLoader: typeof window.HomebaseBookmarkLoader === 'object' && window.HomebaseBookmarkLoader !== null,
        storage: typeof window.HomebaseStorage === 'object' && window.HomebaseStorage !== null
      },
      perf: {
        startupStore: Array.isArray(window.__HB_STARTUP_PERF),
        hbPerfMark: typeof window.hbPerfMark === 'function',
        hbPerfMeasure: typeof window.hbPerfMeasure === 'function',
        recordStartupPerfEvent: typeof window.recordStartupPerfEvent === 'function'
      },
      startupEvents: Array.isArray(window.__HB_STARTUP_PERF) ? window.__HB_STARTUP_PERF.map((entry) => entry.name) : [],
      fastWidgetOrder: widgetOrder,
      smokeErrors: window.__homebaseSmokeErrors || [],
      smokeConsoleErrors: window.__homebaseSmokeConsoleErrors || []
    };
  })()`;
}

async function waitForSmokeReady(client) {
  await waitForCondition(async () => {
    const result = await evaluate(client, `(() => ({
      readyState: document.readyState,
      hasDom: !!document.querySelector('#search-input') && !!document.querySelector('#bookmarks-grid') && !!document.querySelector('#main-settings-btn'),
      bodyReady: !!document.body && document.body.classList.contains('ready')
    }))()`);

    return result.readyState === "complete" && result.hasDom && result.bodyReady;
  }, smokeTimeoutMs, "new-tab page did not reach smoke-ready state");
}

async function waitForPageLoad(client) {
  await waitForCondition(async () => {
    const readyState = await evaluate(client, "document.readyState");
    return readyState === "complete";
  }, smokeTimeoutMs, "new-tab page did not finish loading");
}

async function launchBrowser(browserPath, cdpPort, userDataDir) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];

  try {
    browserProcess = spawn(browserPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    return { skipped: true, reason: `failed to start browser: ${error.message}` };
  }

  let stderr = "";
  browserProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  browserProcess.once("exit", (code) => {
    if (code !== null && code !== 0) {
      stderr += `\nBrowser exited with code ${code}.`;
    }
  });

  try {
    await waitForCondition(async () => {
      if (browserProcess.exitCode !== null) {
        throw new Error(stderr.trim() || "browser exited before CDP became available");
      }

      return await canReachCdp(cdpPort);
    }, smokeTimeoutMs, "browser CDP endpoint did not become available");
  } catch (error) {
    return { skipped: true, reason: error.message };
  }

  return { skipped: false };
}

async function canReachCdp(cdpPort) {
  try {
    await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`);
    return true;
  } catch (error) {
    return false;
  }
}

async function waitForBrowserWebSocket(cdpPort) {
  const version = await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`);

  if (!version.webSocketDebuggerUrl) {
    throw new Error("browser CDP endpoint did not provide a WebSocket URL");
  }

  return version.webSocketDebuggerUrl;
}

async function waitForPageWebSocket(cdpPort, targetId) {
  return await waitForCondition(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const target = targets.find((entry) => entry.id === targetId);
    return target?.webSocketDebuggerUrl || false;
  }, smokeTimeoutMs, "created page target did not expose a WebSocket URL");
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (response.exceptionDetails) {
    throw new Error(formatEvaluateException(response.exceptionDetails));
  }

  return response.result?.value;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out connecting to ${this.wsUrl}`)), smokeTimeoutMs);

      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });

      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`failed to connect to ${this.wsUrl}`));
      }, { once: true });
    });

    this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    this.ws.addEventListener("close", () => this.rejectPending(new Error("CDP WebSocket closed")));
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  async send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const payload = JSON.stringify({ id, method, params });

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, smokeTimeoutMs);

      this.pending.set(id, { resolve, reject, timer, method });
    });

    this.ws.send(payload);
    return await resultPromise;
  }

  handleMessage(rawData) {
    const text = typeof rawData === "string" ? rawData : Buffer.from(rawData).toString("utf8");
    const message = JSON.parse(text);

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result || {});
      }

      return;
    }

    const listeners = this.listeners.get(message.method) || [];
    listeners.forEach((listener) => listener(message.params || {}));
  }

  rejectPending(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async close() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.close();
  }
}

function injectSmokeHarness(html) {
  const injectedScript = `<script>${getMockScript()}</script>`;

  if (!/<head\b[^>]*>/i.test(html)) {
    throw new Error("new-tab.html does not contain a <head> tag");
  }

  return html.replace(/<head\b([^>]*)>/i, `<head$1>\n${injectedScript}`);
}

function getMockScript() {
  return `(() => {
  const expectedWidgetOrder = ['news', 'todo', 'quote', 'weather'];
  const now = Date.now();
  const storageState = {
    widgetOrder: expectedWidgetOrder.slice(),
    appShowSidebar: true,
    appShowWeather: true,
    appShowQuote: true,
    appShowNews: false,
    appShowTodo: true,
    appPerformanceMode: true,
    appSearchSuggestionsEnabled: false,
    appSearchShowHistory: false,
    appContainerMode: true,
    appContainerNewTab: true,
    wallpaperTypePreference: 'static',
    dailyWallpaperEnabled: false,
    weatherUnits: 'celsius',
    quoteUpdateFrequency: 'daily'
  };

  window.__homebaseSmokeErrors = [];
  window.__homebaseSmokeConsoleErrors = [];
  window.__homebaseSmokeStorage = storageState;

  try {
    localStorage.setItem('fast-widget-order', JSON.stringify(expectedWidgetOrder));
    localStorage.setItem('fast-show-sidebar', '1');
    localStorage.setItem('fast-show-weather', '1');
    localStorage.setItem('fast-show-quote', '1');
    localStorage.setItem('fast-show-news', '0');
    localStorage.setItem('fast-show-todo', '1');
    localStorage.setItem('fast-performance-mode', '1');
    localStorage.setItem('fast-quote-state', JSON.stringify({
      current: {
        id: 'smoke-quote',
        text: 'Homebase smoke quote',
        author: 'Homebase'
      },
      next: null,
      config: {
        frequency: 'daily',
        lastShown: now
      }
    }));
  } catch (error) {}

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    try {
      window.__homebaseSmokeConsoleErrors.push(args.map((arg) => {
        if (arg instanceof Error) return arg.name + ': ' + arg.message;
        if (typeof arg === 'string') return arg;
        return JSON.stringify(arg);
      }).join(' '));
    } catch (error) {}
    originalConsoleError(...args);
  };

  window.addEventListener('error', (event) => {
    if (event.target && event.target !== window && !event.message) return;
    window.__homebaseSmokeErrors.push({
      type: 'error',
      message: event.message || (event.error && event.error.message) || 'unknown error',
      source: event.filename || '',
      line: event.lineno || 0
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    window.__homebaseSmokeErrors.push({
      type: 'unhandledrejection',
      message: reason && reason.message ? reason.message : String(reason)
    });
  });

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function createEvent() {
    const listeners = [];
    return {
      addListener(listener) {
        if (typeof listener === 'function' && !listeners.includes(listener)) listeners.push(listener);
      },
      removeListener(listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
      hasListener(listener) {
        return listeners.includes(listener);
      },
      _emit(...args) {
        listeners.slice().forEach((listener) => listener(...args));
      }
    };
  }

  const storageOnChanged = createEvent();
  const bookmarkEvents = {
    onCreated: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent(),
    onRemoved: createEvent()
  };

  const bookmarkTree = [{
    id: '0',
    title: '',
    children: [{
      id: '1',
      title: 'Bookmarks Bar',
      children: [{
        id: '10',
        title: 'Homebase Smoke',
        children: [
          { id: '11', parentId: '10', title: 'Example', url: 'https://example.com/' },
          { id: '12', parentId: '10', title: 'OpenAI', url: 'https://openai.com/' }
        ]
      }]
    }]
  }];
  let nextBookmarkId = 100;

  function findBookmarkNode(id, node = bookmarkTree[0], parent = null) {
    if (!node) return null;
    if (node.id === String(id)) return { node, parent };
    const children = node.children || [];
    for (const child of children) {
      const found = findBookmarkNode(id, child, node);
      if (found) return found;
    }
    return null;
  }

  function getStorage(keys) {
    if (keys == null) return Promise.resolve(clone(storageState));
    if (typeof keys === 'string') return Promise.resolve({ [keys]: clone(storageState[keys]) });
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(storageState, key)) result[key] = clone(storageState[key]);
      });
      return Promise.resolve(result);
    }
    if (keys && typeof keys === 'object') {
      const result = {};
      Object.keys(keys).forEach((key) => {
        result[key] = Object.prototype.hasOwnProperty.call(storageState, key) ? clone(storageState[key]) : keys[key];
      });
      return Promise.resolve(result);
    }
    return Promise.resolve({});
  }

  function setStorage(items) {
    const changes = {};
    Object.keys(items || {}).forEach((key) => {
      changes[key] = { oldValue: clone(storageState[key]), newValue: clone(items[key]) };
      storageState[key] = clone(items[key]);
    });
    storageOnChanged._emit(changes, 'local');
    return Promise.resolve();
  }

  function removeStorage(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    keyList.filter(Boolean).forEach((key) => {
      changes[key] = { oldValue: clone(storageState[key]) };
      delete storageState[key];
    });
    storageOnChanged._emit(changes, 'local');
    return Promise.resolve();
  }

  const api = {
    storage: {
      local: {
        get: getStorage,
        set: setStorage,
        remove: removeStorage,
        clear() {
          Object.keys(storageState).forEach((key) => delete storageState[key]);
          storageOnChanged._emit({}, 'local');
          return Promise.resolve();
        }
      },
      onChanged: storageOnChanged
    },
    bookmarks: {
      ...bookmarkEvents,
      getTree() {
        return Promise.resolve(clone(bookmarkTree));
      },
      getSubTree(id) {
        const found = findBookmarkNode(id);
        return Promise.resolve(found ? [clone(found.node)] : []);
      },
      get(id) {
        const found = findBookmarkNode(id);
        return Promise.resolve(found ? [clone(found.node)] : []);
      },
      getChildren(id) {
        const found = findBookmarkNode(id);
        return Promise.resolve(found && found.node.children ? clone(found.node.children) : []);
      },
      create(details = {}) {
        const parentId = String(details.parentId || '1');
        const found = findBookmarkNode(parentId) || findBookmarkNode('1');
        const node = {
          id: String(nextBookmarkId++),
          parentId: found.node.id,
          title: details.title || ''
        };
        if (details.url) node.url = details.url;
        if (!details.url) node.children = [];
        found.node.children = found.node.children || [];
        found.node.children.push(node);
        bookmarkEvents.onCreated._emit(node.id, clone(node));
        return Promise.resolve(clone(node));
      },
      update(id, changes = {}) {
        const found = findBookmarkNode(id);
        if (!found) return Promise.resolve(null);
        Object.assign(found.node, changes);
        bookmarkEvents.onChanged._emit(String(id), clone(changes));
        return Promise.resolve(clone(found.node));
      },
      move(id, changes = {}) {
        const found = findBookmarkNode(id);
        if (!found || !found.parent) return Promise.resolve(null);
        const oldParent = found.parent;
        const oldIndex = oldParent.children.indexOf(found.node);
        oldParent.children.splice(oldIndex, 1);
        const nextParent = changes.parentId ? findBookmarkNode(changes.parentId)?.node : oldParent;
        const targetParent = nextParent || oldParent;
        targetParent.children = targetParent.children || [];
        const index = Number.isInteger(changes.index) ? changes.index : targetParent.children.length;
        targetParent.children.splice(index, 0, found.node);
        found.node.parentId = targetParent.id;
        bookmarkEvents.onMoved._emit(String(id), { parentId: targetParent.id, oldParentId: oldParent.id, index, oldIndex });
        return Promise.resolve(clone(found.node));
      },
      remove(id) {
        return this.removeTree(id);
      },
      removeTree(id) {
        const found = findBookmarkNode(id);
        if (found && found.parent) {
          found.parent.children = (found.parent.children || []).filter((child) => child.id !== String(id));
          bookmarkEvents.onRemoved._emit(String(id), { parentId: found.parent.id });
        }
        return Promise.resolve();
      }
    },
    tabs: {
      create(tab = {}) {
        return Promise.resolve({ id: Math.floor(Math.random() * 100000), active: tab.active !== false, url: tab.url || location.href, cookieStoreId: tab.cookieStoreId || 'firefox-default' });
      },
      query() {
        return Promise.resolve([{ id: 1, active: true, url: location.href, cookieStoreId: 'firefox-default', lastAccessed: Date.now() }]);
      },
      update(idOrProps, props) {
        const details = props || idOrProps || {};
        return Promise.resolve({ id: typeof idOrProps === 'number' ? idOrProps : 1, active: details.active !== false, url: details.url || location.href, cookieStoreId: 'firefox-default' });
      },
      remove() {
        return Promise.resolve();
      },
      getCurrent() {
        return Promise.resolve({ id: 1, active: true, url: location.href, cookieStoreId: 'firefox-default', index: 0, lastAccessed: Date.now() });
      }
    },
    permissions: {
      contains() {
        return Promise.resolve(false);
      },
      request() {
        return Promise.resolve(false);
      }
    },
    history: {
      search() {
        return Promise.resolve([]);
      }
    },
    runtime: {
      getURL(resourcePath) {
        return new URL(String(resourcePath || '').replace(/^\\/+/, ''), location.origin + '/').href;
      },
      getManifest() {
        return { name: 'Homebase Smoke', version: '0.0.0-smoke' };
      },
      getBrowserInfo() {
        return Promise.resolve({ name: 'Chrome', vendor: 'Homebase Smoke' });
      },
      lastError: null
    }
  };

  window.browser = api;
  window.chrome = api;
})();`;
}

async function startStaticServer(rootPath, smokeHtml) {
  const normalizedRoot = path.resolve(rootPath);
  const staticServer = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === "/" || pathname === "/new-tab.html") {
        sendResponse(response, 200, "text/html; charset=utf-8", smokeHtml);
        return;
      }

      const relativePath = pathname.replace(/^\/+/, "");
      const absolutePath = path.resolve(normalizedRoot, relativePath);

      if (!isPathInside(absolutePath, normalizedRoot)) {
        sendResponse(response, 403, "text/plain; charset=utf-8", "Forbidden");
        return;
      }

      const data = await fs.readFile(absolutePath);
      sendResponse(response, 200, getContentType(absolutePath), data);
    } catch (error) {
      sendResponse(response, 404, "text/plain; charset=utf-8", "Not found");
    }
  });

  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(0, "127.0.0.1", resolve);
  });

  const address = staticServer.address();
  return {
    server: staticServer,
    origin: `http://127.0.0.1:${address.port}`
  };
}

function sendResponse(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(body);
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function resolveSmokeRoot() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  if (rootArg) {
    return path.resolve(rootArg.slice("--root=".length));
  }

  const distArg = process.argv.find((arg) => arg.startsWith("--dist="));
  if (distArg) {
    return path.join(rootDir, "dist", distArg.slice("--dist=".length));
  }

  return defaultSourceRoot;
}

function findBrowserExecutable() {
  const envCandidates = [
    process.env.HOMEBASE_SMOKE_BROWSER,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.env.BROWSER
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    if (fileExistsSync(candidate)) return candidate;
  }

  const standardCandidates = [];

  if (process.platform === "win32") {
    const pf = process.env.PROGRAMFILES || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";

    standardCandidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf, "Microsoft", "EdgeWebView", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "EdgeWebView", "Application", "msedge.exe"),
      path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(pf86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    );

    for (const base of [pf, pf86]) {
      const edgeCoreDir = path.join(base, "Microsoft", "EdgeCore");
      try {
        if (statSync(edgeCoreDir).isDirectory()) {
          const versions = readdirSync(edgeCoreDir);
          for (const ver of versions) {
            standardCandidates.push(path.join(edgeCoreDir, ver, "msedge.exe"));
          }
        }
      } catch (e) {}
    }
  } else if (process.platform === "darwin") {
    standardCandidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    standardCandidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/brave-browser",
      "/snap/bin/chromium"
    );
  }

  return standardCandidates.find((candidate) => fileExistsSync(candidate)) || "";
}

function fileExistsSync(filePath) {
  try {
    return !!filePath && statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

async function getFreePort() {
  const probe = net.createServer();

  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });

  const { port } = probe.address();

  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return await response.json();
}

async function waitForCondition(check, timeoutMs, failureMessage) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(lastError ? `${failureMessage}: ${lastError.message}` : failureMessage);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRuntimeException(event) {
  const details = event.exceptionDetails || {};
  const exception = details.exception || {};
  return exception.description || details.text || "runtime exception";
}

function formatEvaluateException(details) {
  return details.exception?.description || details.text || "Runtime.evaluate failed";
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function printSmokeCheck(label, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status} ${label}${suffix}`);
}

function skip(reason) {
  console.log("Homebase new-tab browser smoke");
  console.log(`SKIP ${reason}`);
}

async function cleanup() {
  if (browserProcess && browserProcess.exitCode === null) {
    browserProcess.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      browserProcess.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (tempUserDataDir) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await fs.rm(tempUserDataDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        await delay(200);
      }
    }
  }
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

await main();
