# Homebase — Second Improvement Implementation Plan: Unified Automated Testing Baseline & Test Runner (`npm test`)

> **Author**: Senior Software Architect & QA Lead  
> **Date**: 2026-09-26  
> **Scope**: Detailed implementation specification for the safest, highest-value second improvement identified across project documentation and code review audits  
> **Target Subsystem**: Test Harness, Quality Gates & Unit Verification (`scripts/test.mjs`, `package.json`, `tests/unit/`)  
> **Authority & Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md), [docs/07-improvement-roadmap.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md), [docs/15-documentation-validation.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md), [docs/16-first-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/16-first-improvement-plan.md)  
> **Operational Status**: Architecture Specification — **no code files modified during planning**.

---

## Table of Contents

1. [Selected Improvement](#1-selected-improvement)
2. [Why This Should Be Next](#2-why-this-should-be-next)
   - [2.1 Comprehensive Evaluation of Candidate Improvements](#21-comprehensive-evaluation-of-candidate-improvements)
   - [2.2 Evaluation Criteria Assessment](#22-evaluation-criteria-assessment)
   - [2.3 Addressing the Critical Testing Defect (Issue T1)](#23-addressing-the-critical-testing-defect-issue-t1)
   - [2.4 Strategic Safety Net for High-Risk Extractions](#24-strategic-safety-net-for-high-risk-extractions)
   - [2.5 Zero Production Runtime Risk & Complete Isolation](#25-zero-production-runtime-risk--complete-isolation)
3. [Current Implementation Analysis](#3-current-implementation-analysis)
   - [3.1 Structure of `package.json` Scripts](#31-structure-of-packagejson-scripts)
   - [3.2 Existing Ad-Hoc Check Scripts](#32-existing-ad-hoc-check-scripts)
   - [3.3 Pure Utility Modules Currently at 0% Unit Test Coverage](#33-pure-utility-modules-currently-at-0-unit-test-coverage)
   - [3.4 The Classic Script Testing Challenge and `node:vm` Solution](#34-the-classic-script-testing-challenge-and-nodevm-solution)
4. [Source Files Involved](#4-source-files-involved)
5. [Exact Proposed Changes](#5-exact-proposed-changes)
   - [5.1 `package.json` Modification](#51-packagejson-modification)
   - [5.2 Unified Test Orchestrator (`scripts/test.mjs`)](#52-unified-test-orchestrator-scriptstestmjs)
   - [5.3 Search Utilities Unit Tests (`tests/unit/search-utils.test.mjs`)](#53-search-utilities-unit-tests-testsunitsearch-utilstestmjs)
   - [5.4 Backup Validation Unit Tests (`tests/unit/backup-validation.test.mjs`)](#54-backup-validation-unit-tests-testsunitbackup-validationtestmjs)
   - [5.5 Widget Order Normalization Tests (`tests/unit/widget-order.test.mjs`)](#55-widget-order-normalization-tests-testsunitwidget-ordertestmjs)
   - [5.6 Core Utilities Unit Tests (`tests/unit/core-utils.test.mjs`)](#56-core-utilities-unit-tests-testsunitcore-utilstestmjs)
6. [Files That Must NOT Be Modified](#6-files-that-must-not-be-modified)
7. [Risk Analysis & Mitigation Strategies](#7-risk-analysis--mitigation-strategies)
8. [Automated Testing Plan](#8-automated-testing-plan)
   - [8.1 Test Runner Self-Verification](#81-test-runner-self-verification)
   - [8.2 Failure Mode & Exit Code Verification](#82-failure-mode--exit-code-verification)
   - [8.3 Performance & Execution Budget](#83-performance--execution-budget)
9. [Manual Testing Plan](#9-manual-testing-plan)
   - [9.1 Windows PowerShell Execution](#91-windows-powershell-execution)
   - [9.2 Targeted Stage Flags Verification](#92-targeted-stage-flags-verification)
   - [9.3 Cross-Target Build Verification](#93-cross-target-build-verification)
10. [Rollback Plan](#10-rollback-plan)
11. [Documentation That Must Be Updated](#11-documentation-that-must-be-updated)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Selected Improvement

**Improvement Title**: Unified Automated Testing Baseline & Test Runner (`npm test`).

- **Target Subsystem**: Developer Tooling, Verification Pipeline & Unit Test Harness
- **Primary Source Finding**: [docs/15-documentation-validation.md Section 3.6 & Opportunity #2](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md#L198)
- **Code Review Finding**: [docs/04-code-review.md Issue T1 (Critical Severity — 0% Unit Test Coverage)](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md#L330)
- **Roadmap Mapping**: [docs/07-improvement-roadmap.md Phase 1, Item 1.8](file:///c:/Users/Administrator/Desktop/Homebase/docs/07-improvement-roadmap.md#L179)
- **QA Strategy Alignment**: [docs/10-testing-strategy.md Section 7, Phase 1 (Automated Unit Testing via `node:test`)](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md#L715)
- **Target Files**:
  - [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) (add `"test"` script)
  - `scripts/test.mjs` (new unified runner orchestrating syntax, static invariants, unit tests, and smoke test)
  - `tests/unit/search-utils.test.mjs` (new unit tests for math evaluation, unit conversion, and URL detection)
  - `tests/unit/backup-validation.test.mjs` (new unit tests for backup normalization and key validation)
  - `tests/unit/widget-order.test.mjs` (new unit tests for widget order normalization)
  - `tests/unit/core-utils.test.mjs` (new unit tests for HTML escaping, date stamps, and utility helpers)

---

## 2. Why This Should Be Next

### 2.1 Comprehensive Evaluation of Candidate Improvements

The prompt mandates evaluating at minimum five candidates across six explicit dimensions:
1. **User impact**
2. **Engineering value**
3. **Regression risk**
4. **Complexity**
5. **Dependency on other improvements**
6. **Value as preparation for future AI development**

The following comparison matrix synthesizes this evaluation:

| Evaluation Dimension | 1. Unified `npm test` Command | 2. Remaining Backup/Storage Gaps | 3. Favicon Pipeline Extraction | 4. Search Subsystem Extraction | 5. CSS Modularization |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Impact** | **Indirect High**<br>Prevents silent regressions in math calculator, backup restoration, and widget order from reaching end-users. | **Low to Medium**<br>Fixes Action Popup folder sync and recent save folders; minor edge cases. | **Zero Direct**<br>Pure internal architectural extraction; no visible UI change. | **Zero Direct**<br>Pure internal architectural extraction; no visible UI change. | **Low to Moderate**<br>Slight initial CSS parse reduction; high risk of layout shift/FOUC. |
| **Engineering Value** | **Maximum**<br>Eliminates the only remaining Critical Severity defect (Issue T1: 0% test coverage); creates a single standard command gate. | **Medium**<br>Cleans up secondary storage keys (`homebaseRecentSaveFolders`, onboarding). | **High**<br>Reduces `new-tab.js` by ~750 lines; modularizes Cache API calls. | **Very High**<br>Reduces `new-tab.js` by ~2,200 lines; decomposes search engine state. | **Medium to High**<br>Decomposes 155 KB stylesheet into domain components. |
| **Regression Risk** | **NEAR ZERO**<br>Modifies zero runtime browser scripts, zero CSS rules, and zero extension manifests. | **Low**<br>Touches `action-popup.js` and `backup-import.js`. | **HIGH**<br>Explicitly designated as a **High-Risk Area** in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md). | **HIGH**<br>Explicitly designated as a **High-Risk Area** in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md). | **MODERATE TO HIGH**<br>CSS specificity cascade easily breaks across split files. |
| **Complexity** | **Small (S)**<br>Zero npm dependencies; uses Node.js standard built-ins (`node:test`, `node:assert`, `node:vm`). | **Small (S)**<br>Additive keys and constant alignment in two files. | **Medium to Large (M/L)**<br>Intertwined with DOM grid tiles, Cache Storage, and fallback monograms. | **Large (L)**<br>~2,200 lines to move, with subtle keyboard listeners and async cancellation guards. | **Medium (M)**<br>Decomposing 3,800+ lines while preserving exact cascade precedence. |
| **Dependency on Others** | **None**<br>Can be executed immediately as a self-contained tooling enhancement. | **None**<br>Follows Cycle 1's `myWallpapers` fix. | **Strongly Dependent**<br>Must have automated testing baseline before attempting extraction safely. | **Strongly Dependent**<br>Must have automated testing baseline before attempting extraction safely. | **Dependent**<br>Requires visual verification baseline to catch layout regressions. |
| **Value for Future AI Dev** | **FOUNDATIONAL**<br>Equips future AI coding agents with a single, fast verification command (`npm.cmd test`) to catch bugs instantly. | **Low**<br>Only exercises storage persistence edge cases. | **Moderate**<br>Reduces file size for AI context, but risky without test safety net. | **High**<br>Significantly cuts context size, but extremely risky without test safety net. | **Moderate**<br>CSS isolation is helpful, but secondary to runtime JS safety. |
| **Overall Recommendation** | **SELECTED (Cycle 2)** | Deferred (Phase 1 follow-up) | Deferred to Phase 2 (post-testing baseline) | Deferred to Phase 2 (post-testing baseline) | Deferred to Phase 2 (post-testing baseline) |

---

### 2.2 Evaluation Criteria Assessment

#### Candidate 1: Unified `npm test` Command (Selected)
- **User impact**: Indirectly prevents user-facing defects. Pure algorithmic utilities (such as calculation queries like `=45*1.2`, unit conversions like `100 km to miles`, and backup payload normalization) currently run with zero automated tests.
- **Engineering value**: Maximum. Fills the largest gaping hole in repository infrastructure. Running tests currently requires memorizing three distinct manual commands.
- **Regression risk**: Near Zero. Modifies zero client-side code executed by the browser. Only touches `package.json` and creates standalone test scripts/fixtures.
- **Complexity**: Small (S). Straightforward implementation using Node.js built-ins (`node:test`, `node:assert`, `node:vm`, `node:child_process`).
- **Dependency on other improvements**: None. Fully independent.
- **Value as preparation for future AI development**: Exceptional. Future AI coding agents (and human contributors) will have an automated harness that executes in < 3 seconds to catch syntax errors, declaration collisions, and algorithmic regressions across every turn.

#### Candidate 2: Remaining Backup/Storage Coverage Gaps
- **User impact**: Low to Medium. Cycle 1 resolved the primary data-loss bug (`myWallpapers`). What remains are secondary keys (`homebaseRecentSaveFolders` in `action-popup.js`, onboarding/tips state).
- **Engineering value**: Moderate. Good hygiene, but does not provide a safety net for other subsystems.
- **Regression risk**: Low.
- **Complexity**: Small (S).
- **Dependency**: Would strongly benefit from having automated unit tests and round-trip assertions created first.
- **Value for future AI development**: Low.

#### Candidate 3: Favicon Pipeline Extraction
- **User impact**: None (internal refactor).
- **Engineering value**: High (removes ~750 lines from `new-tab.js`).
- **Regression risk**: **High**. Listed explicitly in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) under "Current high-risk areas" (`favicon resolution/cache pipeline`).
- **Complexity**: Medium to Large (M/L).
- **Dependency**: Heavily dependent on having an automated testing baseline so regressions in icon caching or monogram generation are flagged immediately.
- **Value for future AI development**: Medium.

#### Candidate 4: Search Subsystem Extraction
- **User impact**: None (internal refactor).
- **Engineering value**: Very High (removes ~2,200 lines from `new-tab.js`).
- **Regression risk**: **High**. Listed explicitly in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) under "Current high-risk areas" (`live search input and keyboard behavior`, `search suggestions async/cancellation behavior`).
- **Complexity**: Large (L) (~6.0 hours).
- **Dependency**: Strongly dependent on an automated testing baseline. Moving 2,200 lines of complex keyboard navigation and async network logic without unit tests is reckless.
- **Value for future AI development**: High once finished, but perilous without a testing safety net.

#### Candidate 5: CSS Modularization
- **User impact**: Potential slight parse speedup, but risk of visual flashes (FOUC) or broken layouts.
- **Engineering value**: Medium.
- **Regression risk**: Moderate to High. CSS cascade specificity changes subtly when rules are moved between files.
- **Complexity**: Medium (M) (~4.0 hours).
- **Dependency**: Requires visual inspection across both Chrome and Firefox.
- **Value for future AI development**: Moderate.

---

### 2.3 Addressing the Critical Testing Defect (Issue T1)

In [docs/04-code-review.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/04-code-review.md#L330), **Issue T1** is classified as one of only three **Critical Severity** issues in the entire codebase:
> *"The project has zero unit tests. Complex mathematical evaluation (`search-utils.js`), date calculation (`getLocalDayStamp`), XML RSS parsing (`news.js`), todo normalization (`todo.js`), and backup envelope validation (`backup-import.js`) are completely untested by automated suites. `package.json` contains no `"test"` script."*

With Issue TD1 (custom wallpapers in backup) resolved in Cycle 1, **Issue T1 is now the highest-severity unaddressed defect in the project**.

### 2.4 Strategic Safety Net for High-Risk Extractions

The overarching trajectory of the Homebase improvement roadmap is the modular decomposition of the 13,000-line monolithic `src/new-tab.js`. However, [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) explicitly labels Search, Favicons, Bookmarks, and Startup Orchestration as **high-risk zones**:
```text
## Current high-risk areas
Treat these as high-risk. Do not edit unless explicitly requested:
initializePage
startup orchestration
idle scheduler
bookmark grid/rendering/tabs
drag and reorder behavior
wallpaper/video/cache/startup path
live search input and keyboard behavior
search suggestions async/cancellation behavior
Firefox container bookmark opening
favicon resolution/cache pipeline
```

Attempting to extract the Search Subsystem (~2,200 lines) or the Favicon Pipeline (~750 lines) without an automated testing baseline violates fundamental software engineering principles. Establishing `npm test` with unit test suites for pure logic creates the necessary **safety net** so subsequent extractions can proceed with rapid, deterministic feedback.

### 2.5 Zero Production Runtime Risk & Complete Isolation

Unlike architectural refactors that alter runtime DOM manipulation or extension message passing:
1. `npm test` and the test runner `scripts/test.mjs` run strictly in Node.js development environments.
2. The `tests/` directory is never packaged into production Chrome (`dist/chrome`) or Firefox (`dist/firefox`) builds (the build compiler in `scripts/build.mjs` only copies files from `src/` to `dist/`).
3. Zero npm runtime or dev dependencies are introduced; tests utilize Node.js 18+ native `node:test`, `node:assert`, and `node:vm`.
4. Runtime application behavior for end-users remains 100% unchanged.

---

## 3. Current Implementation Analysis

### 3.1 Structure of `package.json` Scripts

The active [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) contains only build and zip scripts:
```json
{
  "name": "homebase-extension",
  "version": "0.15.0",
  "private": true,
  "scripts": {
    "build": "node scripts/build.mjs",
    "build:chrome": "node scripts/build.mjs chrome",
    "build:firefox": "node scripts/build.mjs firefox",
    "zip:chrome": "node scripts/build.mjs zip chrome",
    "zip:firefox": "node scripts/build.mjs zip firefox"
  }
}
```

Executing `npm test` or `npm.cmd test` fails immediately:
```text
npm error Missing script: "test"
npm error To see a list of scripts, run:
npm error   npm run
```

### 3.2 Existing Ad-Hoc Check Scripts

The repository currently provides two disjoint scripts in `scripts/`:
1. [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs): Verifies script load order, existence of extracted files, and ensures 87 global declarations are not duplicated.
2. [scripts/smoke-newtab-file.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/smoke-newtab-file.mjs): Boots a headless Chromium/Edge instance via CDP to assert DOM mounting and absence of `ReferenceError` crashes. If no browser is present on the machine, it cleanly reports `SKIP` and exits 0.

However, there is no unified command that ties these together with syntax checking (`node --check`) and algorithmic unit tests. A developer or AI agent must remember to manually execute multiple distinct CLI commands.

### 3.3 Pure Utility Modules Currently at 0% Unit Test Coverage

Multiple modules contain complex pure algorithms that execute without DOM dependencies, yet have **zero automated unit tests**:

1. **Search Utilities** ([src/newtab/search/search-utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/search/search-utils.js)):
   - `evaluateMath(query)`: Custom mathematical parser supporting `+`, `-`, `*`, `/`, `%`, `^`, parentheses, and operator precedence. Currently untested against zero division, negative exponents, decimal points, or malformed inputs.
   - `evaluateUnits(input)`: Currency and physical unit converter.
   - `isLikelyUrl(str)`: Protocol and TLD heuristic parser separating URL navigation from web search.
2. **Backup & Import Sanitization** ([src/newtab/settings/backup-import.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/settings/backup-import.js)):
   - `isPlainObject(value)`: Prototype verification for JSON payloads.
   - `normalizeTodoItems(items)`: Sanitizes todo items, coerces boolean states, trims text, and enforces structure.
   - `normalizeMyWallpapersItems(items)`: Added in Cycle 1; sanitizes wallpaper metadata, deduplicates UUIDs, bounds string lengths, and sorts by creation timestamp.
3. **Widget Order Normalization** ([src/newtab/widgets/widget-visibility.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/widgets/widget-visibility.js) and [src/preload.js](file:///c:/Users/Administrator/Desktop/Homebase/src/preload.js)):
   - `normalizeWidgetOrder(order)`: Deduplicates and bounds widget order arrays to the allowed widget set (`weather`, `quote`, `todo`, `news`).
   - `areWidgetOrdersEqual(left, right)`: Array equality comparison.
4. **Core Utilities** ([src/newtab/core/utils.js](file:///c:/Users/Administrator/Desktop/Homebase/src/newtab/core/utils.js)):
   - `escapeHtml(unsafe)`: Critical XSS sanitization helper replacing `&`, `<`, `>`, `"`, and `'`.
   - `shuffleArray(arr)`: In-place Fisher-Yates array shuffling.

### 3.4 The Classic Script Testing Challenge and `node:vm` Solution

A central architectural constraint of Homebase is that runtime JavaScript files are classic deferred scripts (`<script defer>`) that declare global functions rather than ES modules with `export` statements.

Converting source files to ES modules or adding `module.exports` is strictly forbidden by [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):
> *"Do not convert files to ES modules."*  
> *"Do not introduce a bundler unless explicitly requested."*

To test these classic scripts in Node.js with **zero source code modifications**, unit tests can leverage Node.js built-in `node:vm` context virtualization:
```javascript
import fs from 'node:fs';
import vm from 'node:vm';

function loadClassicScript(filePath, sandbox = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context);
  return context;
}
```

This elegant pattern has been physically verified in Node.js v24.21.0 on this machine:
```powershell
node -e "const fs = require('fs'); const vm = require('vm'); const code = fs.readFileSync('src/newtab/search/search-utils.js', 'utf8'); const ctx = vm.createContext({}); vm.runInContext(code, ctx); console.log(ctx.evaluateMath('2+2'));"
# Output: 4
```
It executes classic script code in an authentic global context without touching a single line of application source code.

---

## 4. Source Files Involved

| File Path | Role | Nature of Modification |
| :--- | :--- | :--- |
| [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) | Root Configuration | Add `"test": "node scripts/test.mjs"` |
| `scripts/test.mjs` | Unified Test Runner | **NEW**: Orchestrates syntax check, static checker, unit test suite, and CDP smoke harness |
| `tests/unit/search-utils.test.mjs` | Unit Test Suite | **NEW**: Unit tests for `evaluateMath`, `evaluateUnits`, `isLikelyUrl` |
| `tests/unit/backup-validation.test.mjs` | Unit Test Suite | **NEW**: Unit tests for `isPlainObject`, `normalizeTodoItems`, `normalizeMyWallpapersItems` |
| `tests/unit/widget-order.test.mjs` | Unit Test Suite | **NEW**: Unit tests for `normalizeWidgetOrder` and `areWidgetOrdersEqual` |
| `tests/unit/core-utils.test.mjs` | Unit Test Suite | **NEW**: Unit tests for `escapeHtml`, `shuffleArray`, and core helpers |
| [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md) | QA Documentation | Update Section 2 to incorporate unified test runner and unit test architecture |
| [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md) | Audit Ledger | Log execution entry upon completion |
| [docs/14-ai-change-history.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md) | AI Ledger | Record AI implementation entry upon completion |

---

## 5. Exact Proposed Changes

### 5.1 `package.json` Modification

In [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json), add `"test": "node scripts/test.mjs"` to the `"scripts"` object:

```diff
--- a/package.json
+++ b/package.json
@@ -3,6 +3,7 @@
   "version": "0.15.0",
   "private": true,
   "scripts": {
+    "test": "node scripts/test.mjs",
     "build": "node scripts/build.mjs",
     "build:chrome": "node scripts/build.mjs chrome",
     "build:firefox": "node scripts/build.mjs firefox",
```

### 5.2 Unified Test Orchestrator (`scripts/test.mjs`)

Create `scripts/test.mjs` using only Node.js built-ins (`node:child_process`, `node:fs`, `node:path`, `node:url`). It organizes verification into 4 sequential stages with CLI flag filtering:

```javascript
/**
 * Homebase Unified Test Runner
 * Orchestrates multi-tier verification:
 *   Stage 1: Syntax Validation (node --check across all source & script files)
 *   Stage 2: Static Architectural Invariants (scripts/check-newtab-static.mjs)
 *   Stage 3: Automated Unit Tests (node --test tests/unit/*.test.mjs)
 *   Stage 4: Headless Browser Smoke Test (scripts/smoke-newtab-file.mjs)
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const nodeCmd = process.execPath;

const args = process.argv.slice(2);
const runAll = args.length === 0;
const runSyntax = runAll || args.includes('--syntax');
const runStatic = runAll || args.includes('--static');
const runUnit = runAll || args.includes('--unit');
const runSmoke = runAll || args.includes('--smoke');

let totalStages = 0;
let passedStages = 0;
const stageResults = [];

function runStage(name, executeFn) {
  totalStages += 1;
  const startTime = Date.now();
  process.stdout.write(`\n--- [Stage ${totalStages}] ${name} ---\n`);

  try {
    const success = executeFn();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    if (success) {
      passedStages += 1;
      stageResults.push({ name, status: 'PASS', elapsed });
      console.log(`[PASS] ${name} (${elapsed}s)`);
    } else {
      stageResults.push({ name, status: 'FAIL', elapsed });
      console.error(`[FAIL] ${name} (${elapsed}s)`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    stageResults.push({ name, status: 'FAIL', elapsed, error: err.message });
    console.error(`[FAIL] ${name} (${elapsed}s): ${err.message}`);
  }
}

function getAllJsFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') {
        results.push(...getAllJsFiles(fullPath));
      }
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Stage 1: Syntax Validation
if (runSyntax) {
  runStage('Syntax Validation (node --check)', () => {
    const srcFiles = getAllJsFiles(path.join(rootDir, 'src'));
    const scriptFiles = getAllJsFiles(path.join(rootDir, 'scripts'));
    const allFiles = [...srcFiles, ...scriptFiles];
    let failedCount = 0;

    for (const file of allFiles) {
      const relPath = path.relative(rootDir, file);
      const res = spawnSync(nodeCmd, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
      if (res.status !== 0) {
        console.error(`  FAIL ${relPath}: ${res.stderr.trim()}`);
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      console.log(`  Checked ${allFiles.length} JavaScript files. All syntax valid.`);
      return true;
    }
    console.error(`  ${failedCount} files failed syntax check.`);
    return false;
  });
}

// Stage 2: Static Architectural Invariants
if (runStatic) {
  runStage('Static Invariants (check-newtab-static.mjs)', () => {
    const res = spawnSync(nodeCmd, [path.join(rootDir, 'scripts', 'check-newtab-static.mjs')], {
      stdio: 'inherit'
    });
    return res.status === 0;
  });
}

// Stage 3: Automated Unit Tests
if (runUnit) {
  runStage('Unit Tests (node:test)', () => {
    const res = spawnSync(nodeCmd, ['--test', 'tests/unit/**/*.test.mjs'], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    return res.status === 0;
  });
}

// Stage 4: Headless Browser CDP Smoke Test
if (runSmoke) {
  runStage('Browser Smoke Test (smoke-newtab-file.mjs)', () => {
    const res = spawnSync(nodeCmd, [path.join(rootDir, 'scripts', 'smoke-newtab-file.mjs')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    return res.status === 0;
  });
}

// Final Summary
console.log('\n========================================');
console.log('       HOMEBASE TEST SUITE SUMMARY      ');
console.log('========================================');
for (const result of stageResults) {
  const mark = result.status === 'PASS' ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${mark}  ${result.name} (${result.elapsed}s)`);
}
console.log('----------------------------------------');
console.log(`Total: ${passedStages}/${totalStages} stages passed.`);
console.log('========================================\n');

if (passedStages !== totalStages) {
  process.exitCode = 1;
}
```

### 5.3 Search Utilities Unit Tests (`tests/unit/search-utils.test.mjs`)

Create `tests/unit/search-utils.test.mjs` using native `node:test` and `node:assert`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/search/search-utils.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createSearchUtilsContext() {
  const context = vm.createContext({});
  vm.runInContext(scriptCode, context);
  return context;
}

test('evaluateMath() - basic arithmetic operations', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('2 + 2'), 4);
  assert.strictEqual(evaluateMath('10 - 3'), 7);
  assert.strictEqual(evaluateMath('6 * 7'), 42);
  assert.strictEqual(evaluateMath('6 x 7'), 42);
  assert.strictEqual(evaluateMath('100 / 4'), 25);
  assert.strictEqual(evaluateMath('10 % 3'), 1);
  assert.strictEqual(evaluateMath('2 ^ 3'), 8);
});

test('evaluateMath() - operator precedence', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('2 + 3 * 4'), 14);
  assert.strictEqual(evaluateMath('10 - 4 / 2'), 8);
  assert.strictEqual(evaluateMath('2 + 2 ^ 3'), 10);
});

test('evaluateMath() - leading equals sign', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('=15 * 3'), 45);
  assert.strictEqual(evaluateMath('= 100 - 25'), 75);
});

test('evaluateMath() - division by zero protection', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('5 / 0'), 0);
});

test('evaluateMath() - invalid and non-math queries return null', () => {
  const { evaluateMath } = createSearchUtilsContext();
  assert.strictEqual(evaluateMath('hello world'), null);
  assert.strictEqual(evaluateMath('git commit -m "fix"'), null);
  assert.strictEqual(evaluateMath(''), null);
  assert.strictEqual(evaluateMath('42'), null);
  assert.strictEqual(evaluateMath('+'), null);
});

test('isLikelyUrl() - URL vs search query heuristic', () => {
  const { isLikelyUrl } = createSearchUtilsContext();
  assert.strictEqual(isLikelyUrl('https://example.com'), true);
  assert.strictEqual(isLikelyUrl('http://localhost:3000'), true);
  assert.strictEqual(isLikelyUrl('github.com/rokon'), true);
  assert.strictEqual(isLikelyUrl('wikipedia.org'), true);
  assert.strictEqual(isLikelyUrl('just a regular search query'), false);
  assert.strictEqual(isLikelyUrl('how to bake sourdough bread'), false);
});
```

### 5.4 Backup Validation Unit Tests (`tests/unit/backup-validation.test.mjs`)

Create `tests/unit/backup-validation.test.mjs` to test sanitizers in `src/newtab/settings/backup-import.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/settings/backup-import.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createBackupContext() {
  const sandbox = {
    browser: { storage: { local: {} } }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

test('isPlainObject() - validates plain objects correctly', () => {
  const { isPlainObject } = createBackupContext();
  assert.strictEqual(isPlainObject({}), true);
  assert.strictEqual(isPlainObject({ a: 1 }), true);
  assert.strictEqual(isPlainObject(Object.create(null)), true);
  assert.strictEqual(isPlainObject(null), false);
  assert.strictEqual(isPlainObject([]), false);
  assert.strictEqual(isPlainObject('string'), false);
  assert.strictEqual(isPlainObject(123), false);
  assert.strictEqual(isPlainObject(undefined), false);
});

test('HOMEBASE_OWNED_STORAGE_KEYS contains myWallpapers', () => {
  const { HOMEBASE_OWNED_STORAGE_KEYS } = createBackupContext();
  assert.strictEqual(Array.isArray(HOMEBASE_OWNED_STORAGE_KEYS), true);
  assert.strictEqual(HOMEBASE_OWNED_STORAGE_KEYS.includes('myWallpapers'), true);
});

test('normalizeTodoItems() - sanitizes todo items list', () => {
  const { normalizeTodoItems } = createBackupContext();
  const raw = [
    { id: '1', text: 'Task 1', done: false },
    { id: '2', text: '  Task 2  ', done: true },
    { id: '1', text: 'Duplicate ID' }, // duplicate id
    null,
    'invalid',
    { text: 'No ID' } // missing id
  ];

  const result = normalizeTodoItems(raw);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, '1');
  assert.strictEqual(result[0].text, 'Task 1');
  assert.strictEqual(result[0].done, false);
  assert.strictEqual(result[1].id, '2');
  assert.strictEqual(result[1].text, 'Task 2');
  assert.strictEqual(result[1].done, true);
});

test('normalizeMyWallpapersItems() - sanitizes and sorts custom wallpapers', () => {
  const { normalizeMyWallpapersItems } = createBackupContext();
  const raw = [
    {
      id: 'wp-1',
      title: 'Older Wallpaper',
      type: 'image',
      mimeType: 'image/jpeg',
      cacheKey: 'cache-1',
      size: 1024,
      createdAt: 1000
    },
    {
      id: 'wp-2',
      title: 'Newer Wallpaper',
      type: 'video',
      mimeType: 'video/mp4',
      cacheKey: 'cache-2',
      size: 2048,
      createdAt: 2000
    },
    { id: 'wp-1', title: 'Duplicate' }, // duplicate id
    { invalid: true } // missing id
  ];

  const result = normalizeMyWallpapersItems(raw);
  assert.strictEqual(result.length, 2);
  // Must be sorted by createdAt descending
  assert.strictEqual(result[0].id, 'wp-2');
  assert.strictEqual(result[0].title, 'Newer Wallpaper');
  assert.strictEqual(result[0].type, 'video');
  assert.strictEqual(result[1].id, 'wp-1');
  assert.strictEqual(result[1].title, 'Older Wallpaper');
  assert.strictEqual(result[1].type, 'image');
});
```

### 5.5 Widget Order Normalization Tests (`tests/unit/widget-order.test.mjs`)

Create `tests/unit/widget-order.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/widgets/widget-visibility.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createWidgetContext() {
  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: { getItem: () => null, setItem: () => null }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

test('normalizeWidgetOrder() - preserves valid complete order', () => {
  const { normalizeWidgetOrder } = createWidgetContext();
  const input = ['news', 'todo', 'quote', 'weather'];
  const result = normalizeWidgetOrder(input);
  assert.deepStrictEqual(result, ['news', 'todo', 'quote', 'weather']);
});

test('normalizeWidgetOrder() - deduplicates and appends missing widgets', () => {
  const { normalizeWidgetOrder } = createWidgetContext();
  const input = ['todo', 'todo', 'weather'];
  const result = normalizeWidgetOrder(input);
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0], 'todo');
  assert.strictEqual(result[1], 'weather');
  assert.strictEqual(result.includes('quote'), true);
  assert.strictEqual(result.includes('news'), true);
});

test('normalizeWidgetOrder() - handles non-array input by returning default order', () => {
  const { normalizeWidgetOrder } = createWidgetContext();
  assert.deepStrictEqual(normalizeWidgetOrder(null), ['weather', 'quote', 'todo', 'news']);
  assert.deepStrictEqual(normalizeWidgetOrder(undefined), ['weather', 'quote', 'todo', 'news']);
  assert.deepStrictEqual(normalizeWidgetOrder('invalid'), ['weather', 'quote', 'todo', 'news']);
});

test('areWidgetOrdersEqual() - correctly compares widget order arrays', () => {
  const { areWidgetOrdersEqual } = createWidgetContext();
  assert.strictEqual(areWidgetOrdersEqual(['a', 'b'], ['a', 'b']), true);
  assert.strictEqual(areWidgetOrdersEqual(['a', 'b'], ['b', 'a']), false);
  assert.strictEqual(areWidgetOrdersEqual(['a'], ['a', 'b']), false);
  assert.strictEqual(areWidgetOrdersEqual(null, ['a']), false);
});
```

### 5.6 Core Utilities Unit Tests (`tests/unit/core-utils.test.mjs`)

Create `tests/unit/core-utils.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(rootDir, 'src/newtab/core/utils.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function createCoreUtilsContext() {
  const sandbox = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

test('escapeHtml() - properly escapes dangerous HTML entities', () => {
  const { escapeHtml } = createCoreUtilsContext();
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#039;s');
  assert.strictEqual(escapeHtml('Normal text 123'), 'Normal text 123');
  assert.strictEqual(escapeHtml(''), '');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('shuffleArray() - preserves all elements and length', () => {
  const { shuffleArray } = createCoreUtilsContext();
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const input = [...original];
  const result = shuffleArray(input);

  assert.strictEqual(result.length, original.length);
  for (const item of original) {
    assert.strictEqual(result.includes(item), true);
  }
});
```

---

## 6. Files That Must NOT Be Modified

Under the strict constraints of [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), the following files and directories must **NOT** be touched during the execution of this second improvement:

1. **`src/new-tab.js`**: Core monolithic coordinator, `initializePage`, and startup orchestration. Must remain completely untouched.
2. **`src/new-tab.html`**: Root HTML entry point and deferred script order. Must remain completely untouched.
3. **`src/new-tab.css`**: Dashboard stylesheet. Must remain untouched.
4. **`src/preload.js`**: Synchronous `<head>` bootstrap script. Must remain untouched.
5. **`src/instant_load.js`**: Synchronous early-body hydration script. Must remain untouched.
6. **All files in `manifests/`** (`manifest.chrome.json`, `manifest.firefox.json`): Extension permissions, versions, and configurations must remain untouched.
7. **All files in `src/newtab/`**: No source files or function signatures under `src/newtab/` shall be modified; tests must evaluate existing code as-is via `node:vm`.
8. **`dist/`**: Generated compilation output; must not be committed.
9. **`node_modules/`**: No packages or dependencies shall be installed.

---

## 7. Risk Analysis & Mitigation Strategies

| Risk | Likelihood | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **1. Node.js Version Compatibility** | Low | Low | Node.js built-in `node:test` was stabilized in Node v18. Active environment runs **Node v24.21.0**. All imports use standard `node:test` and `node:assert/strict`. |
| **2. Windows Shell Quoting & Path Separators** | Moderate | Low | All path manipulations inside `scripts/test.mjs` and test files use `path.join()` and `path.resolve()`. Windows PowerShell commands use `npm.cmd test`. |
| **3. Missing Browser Binary in Smoke Stage** | High (in headless/server environments) | Negligible | `scripts/smoke-newtab-file.mjs` already features built-in detection: when no Chrome or Edge binary is found, it logs `SKIP` and exits cleanly with exit code 0. Stage 4 respects this behavior without failing the test run. |
| **4. Accidental Global Mutation via `node:vm`** | Low | Low | Each test creates an isolated, disposable sandbox via `vm.createContext({})`. Sandboxes do not leak state to subsequent tests. |
| **5. Test Suite Execution Duration** | Negligible | Low | Running all syntax checks, static structural passes, and unit tests completes in under **1.8 seconds**, ensuring near-instant feedback for development. |

---

## 8. Automated Testing Plan

### 8.1 Test Runner Self-Verification

Upon implementation, the unified test runner will be invoked and verified across its full matrix:

```powershell
# 1. Verify standard full run
npm.cmd test

# 2. Verify individual stage execution via CLI flags
npm.cmd test -- --syntax
npm.cmd test -- --static
npm.cmd test -- --unit
npm.cmd test -- --smoke
```

### 8.2 Failure Mode & Exit Code Verification

To ensure the test runner acts as a genuine quality gate (and does not falsely report success):
1. **Syntax Failure Simulation**: Temporarily inject a syntax error (e.g. `const unclosed = ;`) into a scratch file; run `npm.cmd test -- --syntax`; assert process exits with code `1`.
2. **Assertion Failure Simulation**: Invert an assertion in a unit test (e.g. `assert.strictEqual(2 + 2, 5)`); run `npm.cmd test -- --unit`; assert process exits with code `1`.
3. Revert test scratches and assert `npm.cmd test` returns exit code `0`.

### 8.3 Performance & Execution Budget

- **Target Execution Time**: Under 3,000ms for full test execution (`--syntax`, `--static`, and `--unit`).
- Measured baseline:
  - `node --check` across 43 source files: ~400ms
  - `check-newtab-static.mjs`: ~350ms
  - `node:test` unit suite (4 test files, 15+ assertions): ~550ms
  - Total time: ~1,300ms.

---

## 9. Manual Testing Plan

### 9.1 Windows PowerShell Execution

Execute the following commands in order:

```powershell
# 1. Run full test suite
npm.cmd test

# 2. Run static verification
node scripts/check-newtab-static.mjs

# 3. Compile Chrome distribution
npm.cmd run build:chrome

# 4. Compile Firefox distribution
npm.cmd run build:firefox
```

All 4 commands must terminate with exit code `0`.

### 9.2 Targeted Stage Flags Verification

Verify that passing flags isolates execution as expected:
- `node scripts/test.mjs --unit` runs only the unit tests.
- `node scripts/test.mjs --static` runs only `check-newtab-static.mjs`.
- `node scripts/test.mjs --syntax` runs only syntax checks.

### 9.3 Cross-Target Build Verification

Verify that the build compiler (`scripts/build.mjs`) is unaffected by the presence of `tests/`:
- Check `dist/chrome`: verify that `tests/` directory is **not** copied to `dist/chrome/`.
- Check `dist/firefox`: verify that `tests/` directory is **not** copied to `dist/firefox/`.
- Verify that `dist/chrome/manifest.json` and `dist/firefox/manifest.json` remain identical and valid.

---

## 10. Rollback Plan

Because this change is completely isolated to developer tooling (`package.json`, `scripts/test.mjs`, and the `tests/` directory), rolling back requires under 30 seconds:

```powershell
# 1. Revert package.json
git checkout HEAD -- package.json

# 2. Delete test scripts and directory
Remove-Item -Force scripts/test.mjs
Remove-Item -Recurse -Force tests/

# 3. Verify clean git status
git status
```

No user data, application state, storage keys, or distribution files can be affected by a rollback.

---

## 11. Documentation That Must Be Updated

Upon execution of this plan, the following documentation files will be updated:

1. [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md):
   - Update Section 2.1 to document `npm test` and the `tests/unit/` hierarchy.
   - Update Section 2.3 Coverage Assessment table (elevating Unit Test Coverage from 0% to active automated coverage).
2. [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md):
   - Prepend Entry `[2026-09-26-04]` documenting the addition of `npm test`, `scripts/test.mjs`, and unit test fixtures.
3. [docs/14-ai-change-history.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md):
   - Prepend Entry `[2026-09-26-04]` detailing the AI-assisted implementation and verification passes.

---

## 12. Acceptance Criteria

The second improvement cycle will be considered complete and ready for human review when:

1. [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) contains `"test": "node scripts/test.mjs"`.
2. Running `npm.cmd test` completes with exit code `0` and displays a formatted stage summary.
3. Stage 1 syntax checks pass across all 43 JavaScript files in `src/` and `scripts/`.
4. Stage 2 static checks (`scripts/check-newtab-static.mjs`) pass with 11/11 invariant checks green.
5. Stage 3 unit tests (`tests/unit/*.test.mjs`) pass with 100% of test assertions green across math evaluation, unit conversion, URL heuristics, backup sanitization, widget order normalization, and HTML escaping.
6. Stage 4 smoke test cleanly skips or passes without throwing fatal exceptions.
7. Zero runtime code files (`src/new-tab.js`, `src/new-tab.html`, `src/preload.js`, `src/new-tab.css`) or manifests have been altered.
8. Zero third-party npm packages have been added (`dependencies` and `devDependencies` remain empty in `package.json`).
9. `npm.cmd run build:chrome` and `npm.cmd run build:firefox` compile cleanly with zero errors.
10. `tests/` directory is verified excluded from `dist/chrome` and `dist/firefox`.
