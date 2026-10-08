# Homebase — Release Process & Deployment Guide

> **Author**: Senior Browser Extension Release Engineer  
> **Date**: 2026-09-25  
> **Scope**: Development release workflows, production store releases, pre-release checklists, browser store submission protocols, versioning invariants, and emergency rollback procedures  
> **Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/00-project-baseline.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/00-project-baseline.md), [docs/01-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/01-architecture.md), [docs/03-data-architecture.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/03-data-architecture.md), [docs/08-development-guidelines.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/08-development-guidelines.md), [docs/09-architecture-decisions.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/09-architecture-decisions.md), [docs/10-testing-strategy.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/10-testing-strategy.md)

---

## Table of Contents

1. [Executive Summary & Release Philosophy](#1-executive-summary--release-philosophy)
2. [Release Architecture & Artifact Pipeline](#2-release-architecture--artifact-pipeline)
   - [2.1 Dual-Manifest Architecture](#21-dual-manifest-architecture)
   - [2.2 In-House Zero-Dependency Build Engine (`scripts/build.mjs`)](#22-in-house-zero-dependency-build-engine-scriptsbuildmjs)
   - [2.3 Artifact Topography & Distribution Boundaries](#23-artifact-topography--distribution-boundaries)
   - [2.4 Version Synchronization Topology (The 4-File Invariant)](#24-version-synchronization-topology-the-4-file-invariant)
3. [Development Release](#3-development-release)
   - [3.1 Purpose & Guardrails](#31-purpose--guardrails)
   - [3.2 Development Release Steps](#32-development-release-steps)
     - [Step 1: Workspace Pre-Flight & Syntax Validation](#step-1-workspace-pre-flight--syntax-validation)
     - [Step 2: Incremental Target Build Compilation](#step-2-incremental-target-build-compilation)
     - [Step 3: Loading Unpacked Development Extensions](#step-3-loading-unpacked-development-extensions)
     - [Step 4: Live Development Iteration & Extension Reloading](#step-4-live-development-iteration--extension-reloading)
     - [Step 5: Automated Firefox Debugging Harness (`web-ext`)](#step-5-automated-firefox-debugging-harness-web-ext)
     - [Step 6: Packaging Local Inspection Archives](#step-6-packaging-local-inspection-archives)
4. [Production Release](#4-production-release)
   - [4.1 Production Invariants & Release Rules](#41-production-invariants--release-rules)
   - [4.2 Production Release Steps](#42-production-release-steps)
     - [Step 1: Release Branching & Working Tree Sanitization](#step-1-release-branching--working-tree-sanitization)
     - [Step 2: Semantic Version Evaluation & Impact Audit](#step-2-semantic-version-evaluation--impact-audit)
     - [Step 3: Synchronized Version Bump (The 4 Critical Files)](#step-3-synchronized-version-bump-the-4-critical-files)
     - [Step 4: Formal Changelog & `WHATS_NEW` Authoring](#step-4-formal-changelog--whats_new-authoring)
     - [Step 5: Clean Target Compilation (`dist/chrome` & `dist/firefox`)](#step-5-clean-target-compilation-distchrome--distfirefox)
     - [Step 6: Automated Manifest Security & Conformance Verification](#step-6-automated-manifest-security--conformance-verification)
     - [Step 7: Production ZIP Archive Packaging](#step-7-production-zip-archive-packaging)
     - [Step 8: Archive Structural & Payload Verification](#step-8-archive-structural--payload-verification)
     - [Step 9: Git Release Commit Creation & Cryptographic Tagging](#step-9-git-release-commit-creation--cryptographic-tagging)
     - [Step 10: Store Publishing & Submission Protocols](#step-10-store-publishing--submission-protocols)
       - [10.A Chrome Web Store (CWS) Publishing](#10a-chrome-web-store-cws-publishing)
       - [10.B Mozilla Add-ons (AMO) Publishing](#10b-mozilla-add-ons-amo-publishing)
       - [10.C Microsoft Edge Add-ons Catalog Publishing](#10c-microsoft-edge-add-ons-catalog-publishing)
     - [Step 11: Post-Submission Store Monitoring & Verification](#step-11-post-submission-store-monitoring--verification)
5. [Release Checklists](#5-release-checklists)
   - [5.1 Pre-Release Checklist (Comprehensive Gatekeeper)](#51-pre-release-checklist-comprehensive-gatekeeper)
     - [Build Verification](#build-verification)
     - [Automated Testing Pass](#automated-testing-pass)
     - [Version Synchronization Matrix](#version-synchronization-matrix)
     - [Changelog & In-App UI Documentation](#changelog--in-app-ui-documentation)
     - [Cross-Browser Manual Verification](#cross-browser-manual-verification)
     - [Git Repository & Tagging Hygiene](#git-repository--tagging-hygiene)
   - [5.2 Store Review Disclosures Checklist](#52-store-review-disclosures-checklist)
6. [Rollback Process](#6-rollback-process)
   - [6.1 Store Ecosystem Realities: The Roll-Forward Invariant](#61-store-ecosystem-realities-the-roll-forward-invariant)
   - [6.2 Incident Classification Matrix](#62-incident-classification-matrix)
   - [6.3 Phase 1: Local / Pre-Submission Rollback](#63-phase-1-local--pre-submission-rollback)
   - [6.4 Phase 2: In-Review / Pending Submission Rollback](#64-phase-2-in-review--pending-submission-rollback)
   - [6.5 Phase 3: Live Production Emergency Rollback (Hotfix Roll-Forward)](#65-phase-3-live-production-emergency-rollback-hotfix-roll-forward)
   - [6.6 Critical Storage Migration & Data Salvage Safeguards](#66-critical-storage-migration--data-salvage-safeguards)
7. [AI Agent Release Protocols (Codex & Antigravity)](#7-ai-agent-release-protocols-codex--antigravity)
   - [7.1 Release Rules from `AGENTS.md`](#71-release-rules-from-agentsmd)
   - [7.2 Release Manager Prompt Template](#72-release-manager-prompt-template)
   - [7.3 Post-Release Verification Audit Report](#73-post-release-verification-audit-report)

---

## 1. Executive Summary & Release Philosophy

Homebase operates as a dual-browser, high-performance new-tab replacement dashboard built for Manifest V3 on Google Chrome and Mozilla Firefox (with full runtime compatibility across Microsoft Edge and Brave). Delivering sub-50ms perceived dashboard startup requires architectural discipline: zero runtime package dependencies, pure native ES syntax checked via Node's native parser, classic `<script defer>` script inclusion order, and an in-house packaging engine that constructs production ZIP packages without third-party bundlers or archiving tools.

Because browser extensions execute entirely inside client browser environments and cannot be dynamically patched or hot-swapped like web applications, **extension releases are irreversible events once published to live users**. Once a store approves an update, it propagates automatically to active browser instances worldwide. A broken script load order, an unhandled storage migration defect, or a corrupted manifest halts new tabs completely or causes data loss.

Therefore, the Homebase release process is governed by four core tenets:
1. **Zero Runtime Bundling**: The exact code authored in `src/` is copied directly into `dist/`. What is written is what executes.
2. **Dual-Manifest Parity**: Chrome and Firefox run from a shared, identical application codebase (`src/`), separated only by their target-specific manifests (`manifests/manifest.chrome.json` vs `manifests/manifest.firefox.json`).
3. **Four-File Version Invariant**: Every release must atomically synchronize the version string across `manifest.chrome.json`, `manifest.firefox.json`, `package.json`, and the in-app `src/data.js` `WHATS_NEW` metadata object.
4. **The Roll-Forward Imperative**: Modern browser extension stores (Chrome Web Store, Mozilla AMO) do not support 1-click package downgrades. Every production defect rollback must be executed as an expedited roll-forward hotfix with a strictly incremented Semantic Version number.

---

## 2. Release Architecture & Artifact Pipeline

```
                                 +-----------------------+
                                 |  Source Code (src/)   |
                                 |   38 JS, CSS, HTML    |
                                 +-----------+-----------+
                                             |
                   +-------------------------+-------------------------+
                   |                                                   |
                   v                                                   v
       +-----------------------+                           +-----------------------+
       | manifests/            |                           | manifests/            |
       | manifest.chrome.json  |                           | manifest.firefox.json |
       +-----------+-----------+                           +-----------+-----------+
                   |                                                   |
                   +-------------------------+-------------------------+
                                             |
                                             v
                             +-------------------------------+
                             |      scripts/build.mjs        |
                             |  - Directory purge & copy     |
                             |  - Manifest overlay & audit   |
                             |  - Native deflateRawSync ZIP  |
                             +---------------+---------------+
                                             |
                   +-------------------------+-------------------------+
                   |                                                   |
                   v                                                   v
     +---------------------------+                       +---------------------------+
     |   dist/chrome/            |                       |   dist/firefox/           |
     |   - Full src/ copy        |                       |   - Full src/ copy        |
     |   - Chrome manifest.json  |                       |   - Firefox manifest.json |
     +-------------+-------------+                       +-------------+-------------+
                   |                                                   |
                   v                                                   v
+-------------------------------------+             +-------------------------------------+
| dist/homebase-chrome-{version}.zip  |             | dist/homebase-firefox-{version}.zip |
| (CWS / Edge Add-ons Catalog)        |             | (Mozilla AMO Store Catalog)         |
+-------------------------------------+             +-------------------------------------+
```

### 2.1 Dual-Manifest Architecture

Homebase maintains two distinct manifest blueprints in `manifests/`:
- `manifests/manifest.chrome.json`: Targets Google Chrome, Microsoft Edge, Brave, and other Chromium browsers.
  - Strict MV3 conformance: uses `chrome_url_overrides.newtab`.
  - Prohibits Firefox-specific keys (`browser_specific_settings`).
  - Prohibits Gecko-only permissions (`contextualIdentities`).
- `manifests/manifest.firefox.json`: Targets Mozilla Firefox.
  - Declares `browser_specific_settings.gecko.id` (`rokonmagura@gmail.com`) and `strict_min_version` (`142.0`).
  - Declares `contextualIdentities` permission to support Multi-Account Container bookmark launching.

### 2.2 In-House Zero-Dependency Build Engine (`scripts/build.mjs`)

The Homebase build engine is contained in a single 202-line script [scripts/build.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/build.mjs). It uses only Node.js core modules (`node:fs`, `node:path`, `node:url`, `node:zlib`) and achieves:
- **Clean Output Directory Generation**: Recursively purges and creates `dist/<target>/`.
- **Source Mirroring**: Recursively copies `src/` to `dist/<target>/` via `fs.cp`.
- **Manifest Overlay**: Copies the target manifest from `manifests/manifest.<target>.json` to `dist/<target>/manifest.json`.
- **Chrome Manifest Security Audit**: Programmatically parses the generated Chrome manifest and throws fatal build errors if `browser_specific_settings` or `contextualIdentities` are detected.
- **RFC 1951 Deflate Packaging**: Implements an in-memory ZIP builder using `deflateRawSync` and an IEEE 802.3 32-bit Cyclic Redundancy Check (`crc32`) table. The resulting ZIP files (`dist/homebase-<target>-<version>.zip`) have root-level manifests and standard MS-DOS timestamp headers compatible with store submission scanners.

### 2.3 Artifact Topography & Distribution Boundaries

| Artifact Path | Generation Command | Purpose | Git Tracking Status |
| :--- | :--- | :--- | :--- |
| `src/` | N/A (Source files) | Primary runtime code and static assets | Tracked in Git |
| `manifests/` | N/A (Source manifests) | Manifest source blueprints | Tracked in Git |
| `dist/chrome/` | `npm.cmd run build:chrome` | Unpacked Chromium extension directory | **Ignored** (`.gitignore`) |
| `dist/firefox/` | `npm.cmd run build:firefox` | Unpacked Firefox extension directory | **Ignored** (`.gitignore`) |
| `dist/homebase-chrome-*.zip` | `npm.cmd run zip:chrome` | Chrome Web Store / Edge upload archive | **Ignored** (`.gitignore`) |
| `dist/homebase-firefox-*.zip` | `npm.cmd run zip:firefox` | Mozilla AMO upload archive | **Ignored** (`.gitignore`) |

> [!CAUTION]
> **Never commit files in `dist/` or generated `*.zip` archives.**  
> `.gitignore` explicitly excludes `dist/` and `*.zip`. Staging or committing compiled artifacts pollutes repository history, inflates clone size, and violates [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) project rules.

### 2.4 Version Synchronization Topology (The 4-File Invariant)

A release is invalid if version numbers diverge. The release engineer or agent must atomically align the version string across four files:

```
                                 [Release Version vX.Y.Z]
                                             |
             +-------------------------------+-------------------------------+
             |                               |                               |
             v                               v                               v
+--------------------------+   +---------------------------+   +---------------------------+
| package.json             |   | manifests/                |   | manifests/                |
| "version": "X.Y.Z"       |   | manifest.chrome.json      |   | manifest.firefox.json     |
| (Repo metadata)          |   | "version": "X.Y.Z"        |   | "version": "X.Y.Z"        |
+--------------------------+   +---------------------------+   +---------------------------+
                                             |
                                             v
                               +---------------------------+
                               | src/data.js               |
                               | WHATS_NEW.version: 'X.Y.Z'|
                               | WHATS_NEW.date: 'YYYY-...'|
                               +---------------------------+
```

1. [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json) (line 3): `"version": "X.Y.Z"` *(Note: Historically lagged at 0.8.0; must be kept in sync with manifests).*
2. [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json) (line 4): `"version": "X.Y.Z"`
3. [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json) (line 4): `"version": "X.Y.Z"`
4. [src/data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) (lines 147–150): `WHATS_NEW.version: 'X.Y.Z'` and `WHATS_NEW.date: 'YYYY-MM-DD'`

---

## 3. Development Release

### 3.1 Purpose & Guardrails

A Development Release compiles the raw working tree into unpacked browser builds for rapid interactive debugging, manual verification, and test execution. It does **not** alter version strings, update changelogs, create git tags, or submit packages to store portals.

**Development Guardrails**:
- On Windows, always use `npm.cmd` rather than `npm` to ensure shell executable resolution within PowerShell.
- Do not run packaging commands (`zip:chrome` / `zip:firefox`) during iterative UI editing; test directly against `dist/<target>/`.
- Do not edit files inside `dist/`. All modifications must be made in `src/`, followed by re-running the build command.

### 3.2 Development Release Steps

#### Step 1: Workspace Pre-Flight & Syntax Validation
Before compiling, verify that all modified JavaScript files pass ECMAScript parsing checks. This prevents runtime syntax crashes inside the browser harness:

```powershell
# Check changed or critical JavaScript files
node --check src/new-tab.js
node --check src/data.js
node --check src/settings-ui.js

# Run static integrity scanner (validates load order, duplicate declarations, and missing assets)
node scripts/check-newtab-static.mjs

# Run DOM structure smoke test
node scripts/smoke-newtab-file.mjs
```

#### Step 2: Incremental Target Build Compilation
Run target-specific builds depending on which browser is being debugged, or build both simultaneously:

```powershell
# Build both Chrome and Firefox targets
npm.cmd run build

# Or compile Chrome only
npm.cmd run build:chrome

# Or compile Firefox only
npm.cmd run build:firefox
```

Build outputs will be emitted to:
- `dist/chrome/`
- `dist/firefox/`

#### Step 3: Loading Unpacked Development Extensions

##### A. Google Chrome / Microsoft Edge / Chromium Derivatives
1. Launch Google Chrome or Microsoft Edge.
2. Navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable the **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** (top left).
5. In the file picker, select: `c:\Users\Administrator\Desktop\Homebase\dist\chrome`.
6. Open a new tab (`Ctrl + T`). Homebase should render immediately.
7. Open DevTools (`F12`) on the new tab. Verify that the Console has **zero red errors**, zero `ReferenceError` warnings, and clean startup telemetry.

##### B. Mozilla Firefox
1. Launch Mozilla Firefox.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. In the file picker, select: `c:\Users\Administrator\Desktop\Homebase\dist\firefox\manifest.json`.
5. Open a new tab (`Ctrl + T`). Verify dashboard initialization and container context menu actions.
6. Open Browser Console (`Ctrl + Shift + J`) to check for Gecko-specific warnings or CSP violations.

#### Step 4: Live Development Iteration & Extension Reloading
When source files in `src/` are edited:
1. Re-run compilation in PowerShell:
   ```powershell
   npm.cmd run build:chrome
   ```
2. Navigate back to `chrome://extensions`.
3. Click the circular **Reload** icon on the Homebase extension card.
4. Re-open or refresh the new tab page (`Ctrl + R`) to test your changes.

#### Step 5: Automated Firefox Debugging Harness (`web-ext`)
For automated Firefox debugging with a persistent developer profile, Homebase provides a pre-configured VS Code task executing `web-ext` via PowerShell:

```powershell
npx.cmd web-ext run --firefox "C:\Program Files\Mozilla Firefox\firefox.exe" --source-dir "dist\firefox" --verbose --keep-profile-changes
```
*(Alternatively, execute the VS Code Task: `Terminal -> Run Task -> Run Homebase (Dev Profile)`).*

#### Step 6: Packaging Local Inspection Archives
To test the packaging pipeline locally and inspect archive structure without publishing:

```powershell
npm.cmd run zip:chrome
npm.cmd run zip:firefox
```

Inspect generated archives in `dist/`:
- `dist/homebase-chrome-<version>.zip`
- `dist/homebase-firefox-<version>.zip`

Verify with PowerShell that the manifest is positioned at the root level of the ZIP:
```powershell
tar -tf dist/homebase-chrome-0.14.0.zip | Select-Object -First 10
```

---

## 4. Production Release

### 4.1 Production Invariants & Release Rules

In accordance with [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and enterprise release governance:
- **No In-Flight Feature Development**: Release preparation is exclusively for version bumping, changelog authoring, compiling, testing, and packaging. **Do not modify source or UI logic during release prep**.
- **No Fabricated Notes**: Every item listed in release notes and changelogs must map to actual code changes merged into `main`.
- **No Fake Success Claims**: Never report build, packaging, or release success unless the command exited with code `0` and artifacts were physically verified on disk.
- **Combined Commit Rule**: All release metadata updates (`manifests`, `package.json`, `CHANGELOG.md`, `data.js`) must be committed together in a single release commit.

### 4.2 Production Release Steps

```
+-------------------------------------------------------------------------------+
|                        PRODUCTION RELEASE EXECUTION                           |
+-------------------------------------------------------------------------------+
| 1. Branch Sync & Git Status Verification (Clean working tree)                 |
| 2. Semantic Version Determination (Major / Minor / Patch)                     |
| 3. Synchronized Version Bump (manifest.chrome, manifest.firefox, pkg, data)   |
| 4. Author CHANGELOG.md & WHATS_NEW Object in src/data.js                      |
| 5. Clean Compilation: npm.cmd run build                                       |
| 6. Validation Pass: node --check + static tests + smoke test                  |
| 7. ZIP Packaging: npm.cmd run zip:chrome & npm.cmd run zip:firefox            |
| 8. Archive Structure & Security Verification (No forbidden Gecko keys)        |
| 9. Cross-Browser Manual Sanity Pass (Chrome + Firefox + Edge)                 |
| 10. Commit & Tag: feat(release): prepare vX.Y.Z -> git tag -a vX.Y.Z          |
| 11. Store Submission (CWS Dashboard + Mozilla AMO + Edge Partner Center)      |
| 12. Post-Submission Telemetry & Propagation Monitoring                        |
+-------------------------------------------------------------------------------+
```

#### Step 1: Release Branching & Working Tree Sanitization
Ensure the working tree is clean and synchronized with upstream `main`:

```powershell
git checkout main
git pull origin main
git status
```
*Requirement*: `git status` must report `nothing to commit, working tree clean`. If unstaged or untracked changes exist, investigate and stash or discard them before proceeding.

#### Step 2: Semantic Version Evaluation & Impact Audit
Audit git commits since the last release tag to determine the next version number under [Semantic Versioning 2.0.0](https://semver.org/):

```powershell
# View commits since the last release tag (e.g., v0.14.0)
git log v0.14.0..HEAD --oneline
```

**SemVer Evaluation Guidelines**:
- **PATCH (`v0.14.X -> v0.14.(X+1)`)**: Backward-compatible bug fixes, performance optimizations, styling adjustments, or minor internal refactors.
- **MINOR (`v0.14.X -> v0.15.0`)**: New user-facing features, new widgets, additional settings, new permissions, or backward-compatible schema enhancements.
- **MAJOR (`v0.X.X -> v1.0.0`)**: Breaking architectural changes, massive storage schema rewrites, backward-incompatible bookmark migrations, or manifest version transitions.

#### Step 3: Synchronized Version Bump (The 4 Critical Files)
Atomically update the version string `X.Y.Z` across all four required files:

1. **`manifests/manifest.chrome.json`**:
   ```json
   "version": "0.15.0",
   ```
2. **`manifests/manifest.firefox.json`**:
   ```json
   "version": "0.15.0",
   ```
3. **`package.json`**:
   ```json
   "version": "0.15.0",
   ```
4. **`src/data.js`**:
   ```javascript
   const WHATS_NEW = {
     version: '0.15.0',
     date: '2026-09-25',
     items: [
       // 3-5 curated user highlights
     ]
   };
   ```

#### Step 4: Formal Changelog & `WHATS_NEW` Authoring
1. Edit [src/CHANGELOG.md](file:///c:/Users/Administrator/Desktop/Homebase/src/CHANGELOG.md). Prepend a new release section immediately under `# Changelog`:

```markdown
## v0.15.0 — 2026-09-25
### Added
- Concise summary of new user-facing features.

### Improved
- Concise summary of performance or workflow enhancements.

### Fixed
- Concise summary of bugs resolved and edge cases handled.
```

2. Synchronize [src/data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js) `WHATS_NEW.items`:
```javascript
const WHATS_NEW = {
  version: '0.15.0',
  date: '2026-09-25',
  items: [
    {
      type: 'NEW',
      title: 'Short Title',
      desc: 'Clear, concise sentence describing the user benefit.'
    },
    {
      type: 'IMPROVED',
      title: 'Short Title',
      desc: 'Clear, concise sentence describing the improvement.'
    },
    {
      type: 'FIX',
      title: 'Short Title',
      desc: 'Clear, concise sentence describing the fix.'
    }
  ]
};
```

#### Step 5: Clean Target Compilation (`dist/chrome` & `dist/firefox`)
Clean old artifacts and execute a full clean build:

```powershell
# Remove old dist folder if necessary
if (Test-Path dist) { Remove-Item -Recurse -Force dist }

# Run production build
npm.cmd run build
```

Expected output:
```text
Built chrome -> dist\chrome
Built firefox -> dist\firefox
```

#### Step 6: Automated Manifest Security & Conformance Verification
Execute the project's static verification harness:

```powershell
# 1. Verify JavaScript syntax of all modified source files
node --check src/data.js
node --check src/new-tab.js

# 2. Run static architecture and manifest verification
node scripts/check-newtab-static.mjs

# 3. Run DOM smoke test
node scripts/smoke-newtab-file.mjs
```

Verify that `check-newtab-static.mjs` outputs:
- All script references in `src/new-tab.html` exist.
- Script execution order adheres to dependency tree (data providers first).
- Zero duplicate global identifier declarations.
- Chrome manifest contains zero forbidden Gecko keys (`browser_specific_settings`, `contextualIdentities`).

#### Step 7: Production ZIP Archive Packaging
Run native archive generation for both targets:

```powershell
npm.cmd run zip:chrome
npm.cmd run zip:firefox
```

Expected output:
```text
Created dist\homebase-chrome-0.15.0.zip
Created dist\homebase-firefox-0.15.0.zip
```

#### Step 8: Archive Structural & Payload Verification
Inspect the compiled archives using PowerShell:

```powershell
# Verify files exist and check their byte sizes
Get-Item dist\homebase-*.zip | Select-Object Name, Length, LastWriteTime

# Verify Chrome archive does not wrap files in a subfolder and has manifest at root
tar -tf dist\homebase-chrome-0.15.0.zip | Select-Object -First 5

# Confirm absence of disallowed files (.git, node_modules, tests, markdown docs)
tar -tf dist\homebase-chrome-0.15.0.zip | Where-Object { $_ -match "\.git" -or $_ -match "node_modules" -or $_ -match "\.md$" }
```
*(Only `src/CHANGELOG.md` is bundled if referenced by settings UI; ensure no markdown files from `docs/` leaked into the archive).*

#### Step 9: Git Release Commit Creation & Cryptographic Tagging
Commit only the release metadata files and generate an annotated Git tag:

```powershell
# Stage exactly the 5 modified metadata files
git add manifests/manifest.chrome.json manifests/manifest.firefox.json package.json src/CHANGELOG.md src/data.js

# Review staged diff
git diff --cached

# Commit release
git commit -m "feat(release): prepare v0.15.0"

# Create annotated release tag
git tag -a v0.15.0 -m "Release v0.15.0"

# Push commit and tag to remote
git push origin main
git push origin v0.15.0
```

#### Step 10: Store Publishing & Submission Protocols

##### 10.A Chrome Web Store (CWS) Publishing
1. Navigate to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Select the **Homebase** extension listing.
3. Click **Package** in the left sidebar navigation.
4. Click **Upload new package**.
5. Upload: `dist/homebase-chrome-0.15.0.zip`.
6. Inspect the automated verification report:
   - Manifest V3: Verified.
   - Host Permissions: Verify matches `manifest.chrome.json` (Open-Meteo, ESPN, BBC, Al Jazeera, etc.).
   - Chrome Permissions: `tabs`, `cookies`, `storage`, `history`, `bookmarks`, `clipboardRead`.
7. Navigate to **Store Listing**:
   - In **Version Notes / What's New in this Version**, paste the markdown text from `src/CHANGELOG.md` for this release.
8. Navigate to **Privacy**:
   - Confirm Single Purpose Description is up to date: *"Replaces the default new tab with a fast, customizable dashboard for search, weather, news, bookmarks, and daily productivity."*
   - Confirm Data Usage declarations remain accurate (No personal data sold or transferred; local storage only).
9. Click **Submit for review**.

##### 10.B Mozilla Add-ons (AMO) Publishing
1. Navigate to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Select **Homebase** from the dashboard.
3. Click **Upload New Version** in the left sidebar.
4. Upload: `dist/homebase-firefox-0.15.0.zip`.
5. Review the automated linter report:
   - Automated compatibility warnings: Ensure zero fatal errors.
   - Note: Warning regarding `innerHTML` usage in legacy templates is expected; verify no unsanitized user inputs.
6. Provide **Source Code Submission** note if requested:
   - *"Homebase is written in plain vanilla JavaScript (classic script architecture) without a bundler, minifier, or transpiler. The files in the uploaded ZIP are the exact human-readable source code. The repository is publicly inspectable at https://github.com/..."*
7. Enter release notes from `src/CHANGELOG.md`.
8. Click **Submit Version**.

##### 10.C Microsoft Edge Add-ons Catalog Publishing
1. Navigate to the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
2. Select **Homebase Extension**.
3. Click **Package** -> **Update Package**.
4. Upload the identical Chrome package: `dist/homebase-chrome-0.15.0.zip`.
5. Update release notes and submit for certification.

#### Step 11: Post-Submission Store Monitoring & Verification
- **Store Review Timelines**:
  - Chrome Web Store: Typically 12 to 48 hours for standard updates; up to 7 days if permissions change.
  - Mozilla AMO: Typically 2 to 24 hours for automated review; up to 48 hours if flagged for human audit.
  - Microsoft Edge: Typically 24 to 72 hours.
- **Propagation Verification**:
  - Once marked "Published" in CWS, launch a clean Chrome profile.
  - Install Homebase from the web store.
  - Verify that the version displayed in `chrome://extensions` and in Homebase **Settings -> About** reflects `0.15.0`.
  - Verify that the in-app **What's New** modal displays the new features without crashing or visual glitching.

---

## 5. Release Checklists

### 5.1 Pre-Release Checklist (Comprehensive Gatekeeper)

Every checkbox below must be explicitly verified before creating a production git tag or uploading archives to web stores:

#### Build Verification
- [ ] Working tree is clean (`git status` reports zero unstaged or untracked changes).
- [ ] Node environment is verified (`node --version` >= 20.x, Windows PowerShell using `npm.cmd`).
- [ ] Existing `dist/` directory was cleaned before compiling.
- [ ] `npm.cmd run build` exited with code `0`.
- [ ] `dist/chrome/manifest.json` does **not** contain `browser_specific_settings`.
- [ ] `dist/chrome/manifest.json` does **not** contain `contextualIdentities`.
- [ ] `dist/firefox/manifest.json` contains `browser_specific_settings.gecko.id: "rokonmagura@gmail.com"`.
- [ ] `dist/firefox/manifest.json` contains `permissions: ["contextualIdentities", ...]`.
- [ ] `npm.cmd run zip:chrome` produced `dist/homebase-chrome-<version>.zip`.
- [ ] `npm.cmd run zip:firefox` produced `dist/homebase-firefox-<version>.zip`.
- [ ] ZIP archives contain `manifest.json` at the root (not wrapped in a directory).
- [ ] ZIP archives contain zero `.git/`, `node_modules/`, or intermediate build files.

#### Automated Testing Pass
- [ ] `node --check` executed across all modified JavaScript files with zero syntax errors.
- [ ] `node scripts/check-newtab-static.mjs` executed with exit code `0` (Zero missing scripts, zero load-order errors).
- [ ] `node scripts/smoke-newtab-file.mjs` executed with exit code `0` (DOM contract intact).
- [ ] Chrome/CDP automated test harness ran without `ReferenceError` or unhandled promise rejections (capped at 10–15 min per [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md)).

#### Version Synchronization Matrix
- [ ] `manifests/manifest.chrome.json` version equals `X.Y.Z`.
- [ ] `manifests/manifest.firefox.json` version equals `X.Y.Z`.
- [ ] `package.json` version equals `X.Y.Z`.
- [ ] `src/data.js` `WHATS_NEW.version` equals `X.Y.Z`.
- [ ] `src/data.js` `WHATS_NEW.date` matches today's date (`YYYY-MM-DD`).
- [ ] All four version strings match identically.

#### Changelog & In-App UI Documentation
- [ ] `src/CHANGELOG.md` updated with `## vX.Y.Z — YYYY-MM-DD` header.
- [ ] Release items categorized under `### Added`, `### Improved`, `### Fixed`.
- [ ] All changelog items verified against actual git commit history (no fabricated entries).
- [ ] `WHATS_NEW.items` in `src/data.js` contains 3–5 highlights with valid `type` (`'NEW'`, `'IMPROVED'`, `'FIX'`).
- [ ] What's New badge in Settings UI displays unread status on first tab load after update.

#### Cross-Browser Manual Verification
- [ ] **Chrome (Blink)**: Unpacked load succeeds; new tab loads in <50ms; zero console errors.
- [ ] **Chrome (Blink)**: Bookmarks render, drag-and-drop reorders correctly, bookmark search functions.
- [ ] **Chrome (Blink)**: Live wallpaper video loads poster, crossfades smoothly, falls back cleanly.
- [ ] **Chrome (Blink)**: Weather widget fetches or displays cached forecast; News headlines populate.
- [ ] **Firefox (Gecko)**: Unpacked load succeeds via `about:debugging`.
- [ ] **Firefox (Gecko)**: Container bookmark launch operates; right-click menu shows container list.
- [ ] **Firefox (Gecko)**: Storage persistence verified (settings and todos survive browser restart).
- [ ] **Microsoft Edge**: Unpacked load succeeds; search bar and bang shortcuts operate correctly.
- [ ] **Incognito / Private Window**: Extension behaves predictably with storage fallback.

#### Git Repository & Tagging Hygiene
- [ ] Release commit contains **only** metadata files (`manifests`, `package.json`, `CHANGELOG.md`, `data.js`).
- [ ] No source or UI files were edited as part of release prep.
- [ ] Commit message formatted strictly: `feat(release): prepare vX.Y.Z` or `chore(release): prepare vX.Y.Z`.
- [ ] Annotated git tag created: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
- [ ] Generated `dist/` outputs and `*.zip` archives were **not** staged or committed.
- [ ] Commit and tag pushed to remote repository (`git push origin main --tags`).

---

### 5.2 Store Review Disclosures Checklist

When submitting updates to the Chrome Web Store and Mozilla Add-ons, verify that store listing disclosures remain compliant:

| Disclosure Field | Homebase Requirement / Status |
| :--- | :--- |
| **Permissions Justification: `bookmarks`** | Required to display, search, create, and organize bookmarks directly on the dashboard grid. |
| **Permissions Justification: `history`** | Required for omnibox search autocomplete and recently visited tab integration. |
| **Permissions Justification: `tabs`** | Required to open bookmarks in new tabs, manage container tabs in Firefox, and support popup actions. |
| **Permissions Justification: `cookies`** | Required in Firefox to support Multi-Account Container cookie isolation. |
| **Permissions Justification: `clipboardRead`** | Required to allow users to quickly paste URLs and create bookmarks via keyboard shortcut. |
| **Host Permissions Justification** | Declared host permissions (`open-meteo.com`, `feeds.bbci.co.uk`, search suggestion endpoints) are required for live widgets and suggestion fetches. |
| **Remote Code Execution** | **Zero remote code execution**. No `eval()`, no external script injection, no remote WebAssembly. |
| **User Data Collection** | Zero telemetry, zero analytics tracking, zero third-party monetization trackers. All preferences stored locally in `chrome.storage.local`. |

---

## 6. Rollback Process

### 6.1 Store Ecosystem Realities: The Roll-Forward Invariant

In standard web service deployments, a rollback involves pointing DNS or load balancers back to a prior server image. In browser extension ecosystems, **stores do not support rolling back to a previous ZIP version**.

Key store constraints:
1. **Chrome Web Store**: Does not provide a "Rollback" button. Once a version is published, uploading an older version requires incrementing the version string (e.g., if `v0.15.0` is broken, you cannot re-upload `v0.14.0`; you must submit `v0.15.1` containing the rolled-back code).
2. **Mozilla AMO**: Allows disabling a version, but doing so leaves users stranded on the broken version until a higher version is approved and distributed.
3. **Client Auto-Update**: Browsers check for extension updates periodically (every few hours). An emergency patch must be reviewed and published by store operators before end users receive it.

> [!IMPORTANT]
> **All production rollbacks must be executed as an expedited roll-forward hotfix (`vX.Y.(Z+1)`).**

---

### 6.2 Incident Classification Matrix

| Incident Severity | Trigger Criteria | Action Protocol |
| :--- | :--- | :--- |
| **P0: Catastrophic Emergency** | New tab crashes completely (blank screen); user bookmarks deleted; infinite loop pegs CPU at 100%; store blocks extension. | **Immediate Hotfix Roll-Forward**: Revert faulty commits, bump patch version, package, and request expedited store review. |
| **P1: Major Feature Broken** | Wallpaper video playback fails; weather widget crashes; search bangs non-functional; Firefox containers disabled. | **Targeted Hotfix Roll-Forward**: Fix root cause in isolated patch commit, bump patch version, and release within 24 hours. |
| **P2: Minor / Visual Defect** | Alignment glitch in settings modal; subtle FOUC on dark mode; typo in tip card; icon padding offset. | **Normal Release Cycle**: Fix in `main` branch; deploy in the next scheduled minor/patch release. |

---

### 6.3 Phase 1: Local / Pre-Submission Rollback
*Scenario: A release commit and git tag were created locally or pushed to GitHub, but the ZIP packages have NOT yet been uploaded to Chrome Web Store or Mozilla AMO.*

#### Rollback Procedure:
1. Delete the local Git tag:
   ```powershell
   git tag -d v0.15.0
   ```
2. Delete the remote Git tag:
   ```powershell
   git push origin :refs/tags/v0.15.0
   ```
3. Revert the release commit on `main`:
   ```powershell
   git reset --hard HEAD~1
   git push origin main --force-with-lease
   ```
   *(Alternatively, use `git revert HEAD` if branch protection prevents force-pushing).*
4. Purge generated ZIP archives and `dist/`:
   ```powershell
   Remove-Item -Recurse -Force dist
   ```

---

### 6.4 Phase 2: In-Review / Pending Submission Rollback
*Scenario: The ZIP package was uploaded to Chrome Web Store or Mozilla AMO, but is currently in the review queue and has NOT yet been approved or published to users.*

#### Rollback Procedure:
1. **Chrome Web Store Developer Dashboard**:
   - Navigate to the **Homebase** listing.
   - Locate the pending submission.
   - Click **Cancel submission** or **Withdraw from review**.
   - Confirm cancellation. The store will immediately halt review of the package.
2. **Mozilla Add-ons Developer Hub**:
   - Navigate to the version listing.
   - Click **Delete** or **Cancel** on the pending version in the queue.
3. Execute the Phase 1 git cleanup steps to align the repository state with the cancellation.

---

### 6.5 Phase 3: Live Production Emergency Rollback (Hotfix Roll-Forward)
*Scenario: Version `v0.15.0` was approved by web stores, published, and users are actively updating to it. A critical defect (P0/P1) is identified in production.*

```
+-------------------------------------------------------------------------------+
|                    EMERGENCY HOTFIX ROLL-FORWARD WORKFLOW                     |
+-------------------------------------------------------------------------------+
| 1. Identify breaking commit SHA(s) from v0.15.0                               |
| 2. Revert faulty code commit(s) via git revert                                |
| 3. Increment patch version: 0.15.0 -> 0.15.1 across all 4 metadata files     |
| 4. Update src/CHANGELOG.md & src/data.js (Document emergency hotfix)          |
| 5. Verify local data salvage & migration safety                               |
| 6. Rebuild & Test: npm.cmd run build -> check-static -> smoke test             |
| 7. Package: npm.cmd run zip:chrome -> npm.cmd run zip:firefox                 |
| 8. Commit & Tag: feat(release): prepare v0.15.1 emergency hotfix              |
| 9. Upload v0.15.1 ZIPs to CWS & AMO; mark "Critical Bugfix" for fast review   |
+-------------------------------------------------------------------------------+
```

#### Step-by-Step Hotfix Execution:

1. **Revert Faulty Commit(s)**:
   ```powershell
   # Create emergency hotfix branch
   git checkout -b hotfix/v0.15.1 main

   # Revert the specific commit that introduced the bug
   git revert <faulty-commit-sha> --no-edit
   ```

2. **Increment Patch Version to `0.15.1`**:
   Update all four version locations:
   - `manifests/manifest.chrome.json`: `"version": "0.15.1"`
   - `manifests/manifest.firefox.json`: `"version": "0.15.1"`
   - `package.json`: `"version": "0.15.1"`
   - `src/data.js`: `WHATS_NEW.version = '0.15.1'`, `WHATS_NEW.date = '2026-09-25'`

3. **Update Changelog**:
   In `src/CHANGELOG.md`, prepend:
   ```markdown
   ## v0.15.1 — 2026-09-25
   ### Fixed
   - Emergency fix: Resolved startup crash caused by ...
   - Restored stability for ...
   ```

4. **Verify Storage Salvage & Migration Safety**:
   If `v0.15.0` corrupted or modified any keys in `chrome.storage.local`, verify that the reverted code includes a defensive recovery check to heal user state without resetting preferences (see Section 6.6).

5. **Clean Compile & Full Verification**:
   ```powershell
   Remove-Item -Recurse -Force dist
   npm.cmd run build
   node --check src/new-tab.js
   node scripts/check-newtab-static.mjs
   node scripts/smoke-newtab-file.mjs
   npm.cmd run zip:chrome
   npm.cmd run zip:firefox
   ```

6. **Commit & Tag Hotfix**:
   ```powershell
   git add manifests/ package.json src/CHANGELOG.md src/data.js
   git commit -m "chore(release): prepare v0.15.1 hotfix"
   git tag -a v0.15.1 -m "Release v0.15.1 (Emergency hotfix)"
   git checkout main
   git merge hotfix/v0.15.1
   git push origin main --tags
   ```

7. **Expedited Store Submission**:
   - Upload `dist/homebase-chrome-0.15.1.zip` to Chrome Web Store. In review comments, specify: *"CRITICAL HOTFIX: Resolves dashboard crash on new-tab startup. Requesting expedited review."*
   - Upload `dist/homebase-firefox-0.15.1.zip` to Mozilla AMO.

---

### 6.6 Critical Storage Migration & Data Salvage Safeguards

When rolling back or hotfixing a release, **the most dangerous trap is user storage corruption**. If `v0.15.0` introduced a new schema key or altered existing bookmark/settings formats in `localStorage` or `chrome.storage.local`, simply reverting the JavaScript code may cause the older code to crash when reading the newly modified data structures.

#### Storage Salvage Principles:
1. **Never Wipe User Data**: A hotfix must never call `chrome.storage.local.clear()` or delete user bookmarks.
2. **Defensive Schema Parsing**: Any code reading complex objects from storage must wrap the access in fallback guards:
   ```javascript
   // Safe storage read pattern during rollback recovery
   try {
     const rawSettings = localStorage.getItem('homebase_settings');
     const parsed = rawSettings ? JSON.parse(rawSettings) : null;
     if (parsed && typeof parsed === 'object') {
       // Validate essential fields before applying
       applySettings(parsed);
     } else {
       applyDefaultSettings();
     }
   } catch (e) {
     console.warn('Recovered from corrupted settings payload:', e);
     applyDefaultSettings();
   }
   ```
3. **Backup Export Accessibility**: Always preserve access to the **Settings -> Backup -> Export Data** feature, ensuring users can extract their bookmarks and notes even if a widget fails to render.

---

## 7. AI Agent Release Protocols (Codex & Antigravity)

### 7.1 Release Rules from `AGENTS.md`

All AI coding assistants (including Codex, Antigravity, and Claude) operating in this repository must adhere to the strict release constraints defined in [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md):

- **Use the Full Release-Manager Prompt**: Never use abbreviated implementation prompts for releases.
- **Edit Only Release Metadata Files**: During release prep, modify **only** `manifests/manifest.chrome.json`, `manifests/manifest.firefox.json`, `package.json`, `src/CHANGELOG.md`, and `src/data.js`.
- **Do Not Edit Source or UI Files**: Do not refactor code, fix typos in unrelated components, or alter styles during release preparation.
- **Single Combined Commit**: Never create separate feature and release commits if the release prompt requests a combined release.
- **Do Not Invent Release Notes**: Base every changelog bullet on verified repository git history.
- **Do Not Claim False Success**: Never state that builds, packaging, or store submissions succeeded without physical verification.

---

### 7.2 Release Manager Prompt Template

When instructing an AI coding agent to execute a Homebase release, use the following strict prompt specification:

```text
Follow AGENTS.md.

Act as the Homebase Release Manager.

Task: Prepare release v<TARGET_VERSION>

Scope:
- Version bump: <OLD_VERSION> -> <TARGET_VERSION>
- Type: <patch | minor | major>

Files to modify:
- manifests/manifest.chrome.json (bump "version" to "<TARGET_VERSION>")
- manifests/manifest.firefox.json (bump "version" to "<TARGET_VERSION>")
- package.json (bump "version" to "<TARGET_VERSION>")
- src/CHANGELOG.md (add ## v<TARGET_VERSION> section with Added/Improved/Fixed)
- src/data.js (update WHATS_NEW.version and WHATS_NEW.date, curate 3-5 items)

DO NOT MODIFY:
- Any other file in src/
- Any file in docs/
- Any file in scripts/
- Do not edit generated files in dist/
- Do not commit generated ZIP files

Verification required:
1. node --check src/data.js
2. node scripts/check-newtab-static.mjs
3. node scripts/smoke-newtab-file.mjs
4. npm.cmd run build
5. npm.cmd run zip:chrome
6. npm.cmd run zip:firefox
7. Verify ZIP files exist and have manifest.json at the root

Provide post-edit verification report as specified in AGENTS.md.
```

---

### 7.3 Post-Release Verification Audit Report

After completing a release preparation task, the release manager or agent must generate the following standardized report:

```markdown
### Release Verification Audit Report: vX.Y.Z

- **Files Changed**:
  - `manifests/manifest.chrome.json` (version bump: X.Y.Z)
  - `manifests/manifest.firefox.json` (version bump: X.Y.Z)
  - `package.json` (version bump: X.Y.Z)
  - `src/CHANGELOG.md` (release notes authored for vX.Y.Z)
  - `src/data.js` (WHATS_NEW updated: version X.Y.Z, date YYYY-MM-DD)

- **Source / UI Files Modified**: None (Adhered strictly to release metadata isolation).

- **Static Verification Results**:
  - `node --check src/data.js`: Exit Code 0 (Clean)
  - `node scripts/check-newtab-static.mjs`: Exit Code 0 (Zero errors)
  - `node scripts/smoke-newtab-file.mjs`: Exit Code 0 (DOM contract valid)

- **Compilation Results**:
  - `npm.cmd run build`: Success (`dist/chrome` and `dist/firefox` built)
  - Chrome Manifest Conformance: Validated (No `browser_specific_settings`, no `contextualIdentities`)
  - Firefox Manifest Conformance: Validated (Gecko ID `rokonmagura@gmail.com` preserved)

- **Packaging Results**:
  - `dist/homebase-chrome-X.Y.Z.zip`: Created (Size: ~XXX KB)
  - `dist/homebase-firefox-X.Y.Z.zip`: Created (Size: ~XXX KB)
  - Archive Root Structure: Verified (`manifest.json` present at archive root)

- **Git Status**:
  - Release Commit: `feat(release): prepare vX.Y.Z`
  - Release Tag: `vX.Y.Z` (Annotated)
  - Staged Artifacts: Zero generated files or ZIP archives staged.

- **Items Requiring Manual Verification**:
  - Physical testing on Mozilla Firefox for container bookmark launch and storage persistence.
  - Final upload to Chrome Web Store and Mozilla Add-ons Developer Hub.
```
