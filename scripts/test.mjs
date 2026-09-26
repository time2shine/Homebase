/**
 * Homebase Unified Test Runner
 * Orchestrates multi-tier verification:
 *   Stage 1: Syntax Validation (node --check across source, scripts & test files)
 *   Stage 2: Static Architectural Invariants (scripts/check-newtab-static.mjs)
 *   Stage 3: Automated Unit Tests (node --test tests/unit/*.test.mjs)
 *   Stage 4: Headless Browser Smoke Test (scripts/smoke-newtab-file.mjs)
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  console.log(`\n--- [Stage ${totalStages}] ${name} ---`);

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
  try {
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
  } catch (err) {
    // Directory might not exist yet
  }
  return results;
}

// Stage 1: Syntax Validation
if (runSyntax) {
  runStage('Syntax Validation (node --check)', () => {
    const srcFiles = getAllJsFiles(path.join(rootDir, 'src'));
    const scriptFiles = getAllJsFiles(path.join(rootDir, 'scripts'));
    const testFiles = getAllJsFiles(path.join(rootDir, 'tests'));
    const allFiles = [...srcFiles, ...scriptFiles, ...testFiles];
    let failedCount = 0;

    for (const file of allFiles) {
      const relPath = path.relative(rootDir, file);
      const res = spawnSync(nodeCmd, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
      if (res.status !== 0) {
        console.error(`  FAIL ${relPath}: ${res.stderr ? res.stderr.trim() : 'Syntax check failed'}`);
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
      cwd: rootDir,
      stdio: 'inherit'
    });
    return res.status === 0;
  });
}

// Stage 3: Automated Unit Tests
if (runUnit) {
  runStage('Unit Tests (node:test)', () => {
    const unitTestDir = path.join(rootDir, 'tests', 'unit');
    const unitFiles = getAllJsFiles(unitTestDir).filter((f) => f.endsWith('.test.mjs') || f.endsWith('.test.js'));

    if (unitFiles.length === 0) {
      console.log('  No unit test files found in tests/unit/');
      return true;
    }

    const relFiles = unitFiles.map((f) => path.relative(rootDir, f));
    const res = spawnSync(nodeCmd, ['--test', ...relFiles], {
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
