import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "src");
const newTabHtmlPath = path.join(srcDir, "new-tab.html");
const newTabRuntimePath = path.join(srcDir, "new-tab.js");
const newtabModulesDir = path.join(srcDir, "newtab");

const keyExtractedModulePaths = [
  "newtab/core/perf-report.js",
  "newtab/core/startup-perf-runtime.js",
  "newtab/core/idle-scheduler.js",
  "newtab/core/dialogs.js",
  "newtab/core/utils.js",
  "newtab/core/asset-loader.js",
  "newtab/core/sortable-bridge.js",
  "newtab/core/tab-lifecycle.js",
  "newtab/core/dock-navigation.js",
  "newtab/core/storage-dispatcher.js",
  "newtab/settings/sub-settings-ui.js",
  "newtab/settings/search-engine-settings.js",
  "newtab/settings/settings-storage.js",
  "newtab/settings/settings-preferences.js",
  "newtab/settings/material-color-picker.js",
  "newtab/settings/backup-import.js",
  "newtab/settings/visual-effects-runtime.js",
  "newtab/settings/visual-effects-settings.js",
  "newtab/settings/cinema-mode-runtime.js",
  "newtab/settings/settings-ui.js",
  "newtab/bookmarks/bookmark-style-runtime.js",
  "newtab/bookmarks/grid-reorder-animation.js",
  "newtab/bookmarks/quick-actions.js",
  "newtab/bookmarks/bookmark-tabs-scroll.js",
  "newtab/bookmarks/folder-picker.js",
  "newtab/bookmarks/bookmark-grid-controller.js",
  "newtab/bookmarks/bookmark-drag-controller.js",
  "newtab/bookmarks/bookmark-editor-adapter.js",
  "newtab/bookmarks/bookmark-root-controller.js",
  "newtab/bookmarks/bookmark-action-controller.js",
  "newtab/bookmarks/bookmark-loader-service.js",
  "newtab/bookmarks/bookmark-tree-service.js",
  "newtab/bookmarks/bookmark-ui-state.js",
  "newtab/widgets/widget-visibility.js",
  "newtab/widgets/time.js",
  "newtab/widgets/todo.js",
  "newtab/widgets/quote.js",
  "newtab/widgets/weather.js",
  "newtab/widgets/news.js",
  "newtab/integrations/app-launcher.js",
  "newtab/integrations/firefox-containers.js",
  "newtab/search/search-utils.js",
  "newtab/search/search-suggestion-cache.js",
  "newtab/tips/homebase-tips-ui.js",
  "newtab/wallpaper/dynamic-accent.js"
];

const movedPathChecks = [
  {
    oldPath: "settings-ui.js",
    newPath: "newtab/settings/settings-ui.js"
  }
];
// movedDeclarationNames replaced by dynamic cross-script top-level declaration collision scanner

const results = [];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await runChecks();
  } catch (error) {
    record(false, "unexpected static check error", error.stack || error.message);
  }

  printReport();

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

async function runChecks() {
  const html = await fs.readFile(newTabHtmlPath, "utf8");
  const scriptTags = parseScriptTags(html);
  const deferredLocalScripts = scriptTags.filter((tag) => tag.defer && isLocalPath(tag.src));

  await verifyDeferredScriptsExist(deferredLocalScripts);
  await verifyPreloadPlacement(html, scriptTags);
  verifyNewTabRuntimeLast(deferredLocalScripts);
  await verifyKeyExtractedModules();
  await verifyNoOldFlatNewtabReferences();
  await verifyMovedPathReferences();
  await verifyCrossScriptDeclarationCollisions(deferredLocalScripts);
}

async function verifyDeferredScriptsExist(deferredLocalScripts) {
  const missingScripts = [];

  for (const tag of deferredLocalScripts) {
    const scriptPath = path.join(srcDir, normalizeWebPath(tag.src));
    if (!await fileExists(scriptPath)) {
      missingScripts.push(tag.src);
    }
  }

  record(
    missingScripts.length === 0,
    "deferred local script files exist",
    missingScripts.length === 0
      ? `${deferredLocalScripts.length} deferred local scripts checked`
      : `missing: ${missingScripts.join(", ")}`
  );
}

async function verifyPreloadPlacement(html, scriptTags) {
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const headEndIndex = headMatch ? headMatch.index + headMatch[0].length : -1;
  const preloadTags = scriptTags.filter((tag) => tag.src === "preload.js");
  const preloadInHead = preloadTags.some((tag) => headEndIndex >= 0 && tag.index < headEndIndex);
  const preloadWithoutDefer = preloadTags.some((tag) => (
    tag.src === "preload.js" &&
    !tag.defer &&
    !tag.async &&
    !/module/i.test(tag.type || "")
  ));
  const preloadPath = path.join(srcDir, "preload.js");

  record(preloadTags.length === 1, "preload.js script tag exists once", `${preloadTags.length} found`);
  record(preloadInHead, "preload.js remains in head", preloadInHead ? "head script preserved" : "not found in head");
  record(preloadWithoutDefer, "preload.js remains synchronous", preloadWithoutDefer ? "no defer/async/module" : "defer/async/module detected");
  record(await fileExists(preloadPath), "preload.js file exists", path.relative(rootDir, preloadPath));
}

function verifyNewTabRuntimeLast(deferredLocalScripts) {
  const lastDeferred = deferredLocalScripts.at(-1);

  record(
    lastDeferred?.src === "new-tab.js",
    "new-tab.js is last deferred runtime script",
    lastDeferred ? `last deferred script: ${lastDeferred.src}` : "no deferred local scripts found"
  );
}

async function verifyKeyExtractedModules() {
  const missingModules = [];

  for (const modulePath of keyExtractedModulePaths) {
    const absolutePath = path.join(srcDir, normalizeWebPath(modulePath));
    if (!await fileExists(absolutePath)) {
      missingModules.push(modulePath);
    }
  }

  record(
    missingModules.length === 0,
    "key extracted module paths exist",
    missingModules.length === 0
      ? `${keyExtractedModulePaths.length} module paths checked`
      : `missing: ${missingModules.join(", ")}`
  );
}

async function verifyNoOldFlatNewtabReferences() {
  const sourceFiles = await collectSourceTextFiles(srcDir);
  const flatReferencePattern = /["'=(]\s*(newtab\/[^/"')\s]+\.js)/g;
  const flatReferences = [];
  const rootNewtabFiles = await collectFiles(newtabModulesDir, [".js"], { recursive: false });

  for (const filePath of sourceFiles) {
    const text = await fs.readFile(filePath, "utf8");
    const relativeFile = toRepoPath(filePath);
    for (const match of text.matchAll(flatReferencePattern)) {
      flatReferences.push(`${relativeFile}: ${match[1]}`);
    }
  }

  record(
    flatReferences.length === 0,
    "no old flat newtab/*.js path references",
    flatReferences.length === 0 ? "none found" : flatReferences.join("; ")
  );

  record(
    rootNewtabFiles.length === 0,
    "no root-level src/newtab/*.js module files",
    rootNewtabFiles.length === 0 ? "none found" : rootNewtabFiles.map(toRepoPath).join(", ")
  );
}

async function verifyMovedPathReferences() {
  const sourceFiles = await collectSourceTextFiles(srcDir);
  const staleReferences = [];

  for (const filePath of sourceFiles) {
    const text = await fs.readFile(filePath, "utf8");
    const relativeFile = toRepoPath(filePath);

    for (const { oldPath, newPath } of movedPathChecks) {
      const oldPattern = new RegExp(`["']${escapeRegExp(oldPath)}["']`, "g");
      const newPathExists = await fileExists(path.join(srcDir, normalizeWebPath(newPath)));

      if (!newPathExists) {
        staleReferences.push(`${newPath} is missing`);
      }

      for (const match of text.matchAll(oldPattern)) {
        staleReferences.push(`${relativeFile}: ${match[0]}`);
      }
    }
  }

  record(
    staleReferences.length === 0,
    "no stale moved lazy-load path references",
    staleReferences.length === 0 ? "none found" : staleReferences.join("; ")
  );
}

async function verifyCrossScriptDeclarationCollisions(deferredLocalScripts) {
  const entries = [];
  for (const tag of deferredLocalScripts) {
    const scriptPath = path.join(srcDir, normalizeWebPath(tag.src));
    if (!await fileExists(scriptPath)) continue;
    const text = await fs.readFile(scriptPath, "utf8");
    entries.push({ src: tag.src, text });
  }

  const { allDecls, duplicates } = findDeclarationCollisions(entries);

  const formatted = duplicates.map(({ name, occurrences }) => {
    const details = occurrences.map((o) => `${o.file}:${o.line} (${o.type})`).join(" vs ");
    return `${name} [${details}]`;
  });

  record(
    duplicates.length === 0,
    "no cross-script top-level declaration collisions",
    duplicates.length === 0
      ? `${allDecls.size} unique top-level declarations verified across ${deferredLocalScripts.length} deferred scripts`
      : `collisions detected: ${formatted.join("; ")}`
  );
}

function findDeclarationCollisions(entries) {
  const allDecls = new Map();

  for (const { src, text } of entries) {
    const decls = parseTopLevelDeclarations(text, src);
    for (const d of decls) {
      if (!allDecls.has(d.name)) allDecls.set(d.name, []);
      allDecls.get(d.name).push(d);
    }
  }

  const duplicates = [];
  for (const [name, occurrences] of allDecls.entries()) {
    const files = new Set(occurrences.map((o) => o.file));
    if (files.size > 1) {
      duplicates.push({ name, occurrences });
    }
  }

  return { allDecls, duplicates };
}

function parseTopLevelDeclarations(sourceText, filename) {
  const decls = [];
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  const templateStack = [];
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  let line = 1;

  for (let i = 0; i < sourceText.length; i++) {
    const ch = sourceText[i];
    const next = sourceText[i + 1];

    if (ch === "\n") {
      line++;
      inLineComment = false;
      inRegex = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (ch === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "\\") { i++; continue; }
      if (ch === "\x27") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === "\\") { i++; continue; }
      if (ch === "\"") inDoubleQuote = false;
      continue;
    }

    if (inRegex) {
      if (ch === "\\") { i++; continue; }
      if (ch === "/") inRegex = false;
      continue;
    }

    if (inTemplate) {
      if (ch === "\\") { i++; continue; }
      if (ch === "$" && next === "{") {
        templateStack.push(depth);
        depth++;
        inTemplate = false;
        i++;
        continue;
      }
      if (ch === "`") {
        inTemplate = false;
        continue;
      }
      continue;
    }

    if (templateStack.length > 0 && ch === "}" && depth === templateStack[templateStack.length - 1] + 1) {
      depth = templateStack.pop();
      inTemplate = true;
      continue;
    }

    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }

    if (ch === "\x27") { inSingleQuote = true; continue; }
    if (ch === "\"") { inDoubleQuote = true; continue; }
    if (ch === "`") { inTemplate = true; continue; }

    if (ch === "/") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(sourceText[j])) j--;
      const prevChar = j >= 0 ? sourceText[j] : "\n";
      if (/[\(=,;:!?\[&|~^%*+<>-]/.test(prevChar) || (j >= 5 && sourceText.substring(j - 5, j + 1) === "return")) {
        inRegex = true;
        continue;
      }
    }

    if (ch === "{") { depth++; continue; }
    if (ch === "}") { if (depth > 0) depth--; continue; }

    if (depth === 0) {
      const prev = i > 0 ? sourceText[i - 1] : "\n";
      if (/[\s;({]/.test(prev) || i === 0) {
        const sub = sourceText.substring(i);
        const m = sub.match(/^(?:(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(|class\s+([a-zA-Z0-9_$]+)\b|(const|let|var)\s+([a-zA-Z0-9_$]+)\b)/);
        if (m) {
          const name = m[2] || m[3] || m[5];
          const type = m[2] ? "function" : (m[3] ? "class" : m[4]);
          decls.push({ name, type, line, file: filename });
          i += m[0].length - 1;
        }
      }
    }
  }

  return decls;
}

function parseScriptTags(html) {
  const tags = [];
  const scriptPattern = /<script\b([^>]*)>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const attrs = parseAttributes(match[1]);
    tags.push({
      index: match.index,
      src: normalizeWebPath(attrs.get("src") || ""),
      defer: attrs.has("defer"),
      async: attrs.has("async"),
      type: attrs.get("type") || "",
      attrs
    });
  }

  return tags.filter((tag) => tag.src);
}

function parseAttributes(attributeText) {
  const attrs = new Map();
  const attributePattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of attributeText.matchAll(attributePattern)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function isLocalPath(src) {
  return !!src && !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src) && !/^(?:data|blob):/i.test(src);
}

function normalizeWebPath(webPath) {
  return webPath.split(/[?#]/, 1)[0].replace(/^\/+/, "").replaceAll("/", path.sep);
}

async function collectSourceTextFiles(dir) {
  const files = await collectFiles(dir, [".html", ".js"]);
  return files.filter((filePath) => !filePath.includes(`${path.sep}assets${path.sep}quotes.json`));
}

async function collectFiles(dir, extensions, options = {}) {
  const recursive = options.recursive !== false;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...await collectFiles(absolutePath, extensions, options));
      }
    } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

// hasDeclaration removed; replaced by parseTopLevelDeclarations

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    return false;
  }
}

function record(ok, label, detail = "") {
  results.push({ ok, label, detail });
}

function printReport() {
  console.log("Homebase new-tab static check");

  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    const detail = result.detail ? ` - ${result.detail}` : "";
    console.log(`${status} ${result.label}${detail}`);
  }
}

function toRepoPath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export {
  parseTopLevelDeclarations,
  findDeclarationCollisions,
  verifyCrossScriptDeclarationCollisions
};
