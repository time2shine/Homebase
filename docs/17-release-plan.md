# Homebase — Production Release Plan: v0.15.0

> **Author**: Homebase Release Manager  
> **Date**: 2026-09-26  
> **Scope**: Comprehensive release specification, version analysis, semantic versioning recommendation, change audit, migration assessment, and execution checklist for the upcoming production release  
> **Target Version**: `v0.15.0` (Recommended) / `v0.14.1` (Conservative Alternative)  
> **Authority & Prerequisites**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md), [docs/13-maintenance-log.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/13-maintenance-log.md), [docs/14-ai-change-history.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/14-ai-change-history.md), [docs/16-first-improvement-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/16-first-improvement-plan.md)  
> **Operational Status**: Proposed Plan — **Awaiting Maintainer Approval Before Code/Version Modification**.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Version Analysis](#2-current-version-analysis)
   - [2.1 Audit of Version Identifiers Across Repository](#21-audit-of-version-identifiers-across-repository)
   - [2.2 Root `package.json` Version Drift](#22-root-packagejson-version-drift)
   - [2.3 Git Tag & Commit History Since Last Release](#23-git-tag--commit-history-since-last-release)
3. [Target Version Recommendation & SemVer Justification](#3-target-version-recommendation--semver-justification)
   - [3.1 Primary Recommendation: v0.15.0 (Minor Bump)](#31-primary-recommendation-v0150-minor-bump)
   - [3.2 Alternative Option: v0.14.1 (Patch Bump)](#32-alternative-option-v0141-patch-bump)
   - [3.3 Decision Matrix](#33-decision-matrix)
4. [Changes Included in This Release](#4-changes-included-in-this-release)
   - [4.1 Feature & Data Integrity Improvements](#41-feature--data-integrity-improvements)
   - [4.2 UI & Styling Enhancements](#42-ui--styling-enhancements)
   - [4.3 Architecture & Modular Extractions](#43-architecture--modular-extractions)
   - [4.4 Quality Assurance & Testing Infrastructure](#44-quality-assurance--testing-infrastructure)
5. [User-Facing Improvements & Release Notes](#5-user-facing-improvements--release-notes)
   - [5.1 User Highlights](#51-user-highlights)
   - [5.2 Draft `WHATS_NEW` Data Object](#52-draft-whats_new-data-object)
   - [5.3 Draft `CHANGELOG.md` Entry](#53-draft-changelogmd-entry)
6. [Migration Concerns & Backward Compatibility](#6-migration-concerns--backward-compatibility)
   - [6.1 Storage Schema Impact](#61-storage-schema-impact)
   - [6.2 Backward Compatibility with Legacy Backups](#62-backward-compatibility-with-legacy-backups)
   - [6.3 Extension Permissions & Store Review Posture](#63-extension-permissions--store-review-posture)
7. [Release Execution Checklist](#7-release-execution-checklist)
   - [Phase 1: Pre-Release Verification](#phase-1-pre-release-verification)
   - [Phase 2: Synchronized Metadata Updates](#phase-2-synchronized-metadata-updates)
   - [Phase 3: Clean Compilation & Packaging](#phase-3-clean-compilation--packaging)
   - [Phase 4: Archive Structural Inspection](#phase-4-archive-structural-inspection)
   - [Phase 5: Cross-Browser Manual Sanity Pass](#phase-5-cross-browser-manual-sanity-pass)
   - [Phase 6: Git Commit & Tagging](#phase-6-git-commit--tagging)
   - [Phase 7: Store Submissions](#phase-7-store-submissions)
   - [Phase 8: Post-Release Propagation Verification](#phase-8-post-release-propagation-verification)

---

## 1. Executive Summary

This document presents the official Release Plan for the next production distribution of the Homebase new-tab dashboard extension for Google Chrome and Mozilla Firefox.

Since the release of **v0.14.0** (commit `df4d62e` on 2026-05-25), the codebase has accumulated key architectural extractions, styling enhancements, automated static verification harnesses, and a critical data integrity enhancement resolving custom wallpaper data loss during backup/restore operations.

This plan details:
1. An exhaustive audit of existing version numbers and root configuration drift.
2. A Semantic Versioning (SemVer 2.0.0) analysis recommending **`v0.15.0`** as the target release version.
3. The exact inventory of changes and draft release notes.
4. An end-to-end release execution checklist conforming strictly to [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md) and [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md).

---

## 2. Current Version Analysis

### 2.1 Audit of Version Identifiers Across Repository

A comprehensive inspection of all version strings in the repository reveals the following state:

| File Location | Line | Current Version String | Purpose / Context |
| :--- | :---: | :---: | :--- |
| [manifests/manifest.chrome.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.chrome.json#L4) | 4 | `"0.14.0"` | Canonical Chrome / Chromium distribution manifest |
| [manifests/manifest.firefox.json](file:///c:/Users/Administrator/Desktop/Homebase/manifests/manifest.firefox.json#L4) | 4 | `"0.14.0"` | Canonical Mozilla Firefox distribution manifest |
| [src/data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js#L148) | 148 | `'0.14.0'` | In-app `WHATS_NEW` metadata object |
| [src/CHANGELOG.md](file:///c:/Users/Administrator/Desktop/Homebase/src/CHANGELOG.md#L5) | 5 | `## v0.14.0 — 2026-05-25` | User-facing markdown changelog |
| [package.json](file:///c:/Users/Administrator/Desktop/Homebase/package.json#L3) | 3 | `"0.8.0"` | Root npm project metadata (**Known Drift**) |
| Git Tag History | N/A | `v0.14.0` | Latest release tag in Git repository |

### 2.2 Root `package.json` Version Drift
As documented in [docs/15-documentation-validation.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/15-documentation-validation.md#L94), `package.json` has remained pinned at `"0.8.0"` across six previous release cycles (`v0.9.0` through `v0.14.0`). 

**Release Action Required**: In this release, `package.json` line 3 must be atomically updated to match the manifests, establishing the **4-File Version Invariant** mandated by [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md#L107):
1. `manifests/manifest.chrome.json`
2. `manifests/manifest.firefox.json`
3. `package.json`
4. `src/data.js` (`WHATS_NEW.version`)

### 2.3 Git Tag & Commit History Since Last Release
Git history since tag `v0.14.0` consists of the following commits and working changes:

```text
7c8d80b docs: add comprehensive project documentation, architecture guides, and technical specifications
fe88eb8 Add styles for settings modal and related components
612dcba Refactor code structure for improved readability and maintainability
[WORKING] feat(backup): add myWallpapers metadata support and legacy preservation guard
```

---

## 3. Target Version Recommendation & SemVer Justification

Under [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR** (`X.0.0`): Incompatible API changes, manifest specification overhauls, or breaking storage migrations.
- **MINOR** (`0.X.0`): Backward-compatible new functionality, significant user-facing features, or architectural enhancements.
- **PATCH** (`0.0.X`): Backward-compatible bug fixes and internal maintenance.

### 3.1 Primary Recommendation: `v0.15.0` (Minor Bump)

**Recommendation**: Bump from `0.14.0` to **`0.15.0`**.

**Justification**:
1. **New User-Facing Capability**: Users can now export and restore their custom uploaded wallpaper collections via Settings -> Backup & Import. This resolves a critical functional gap where custom wallpapers were permanently lost.
2. **Settings UI & Style Polish**: Introduces dedicated modular styles for the settings modal (`newtab/styles/settings.css`), gallery layout (`newtab/styles/gallery.css`), and search engine drag-and-drop reordering.
3. **Repository Precedent**: All previous feature additions in Homebase (e.g. `v0.12.0` for Performance Mode, `v0.13.0` for Help & Feedback settings, `v0.14.0` for bookmark folder picker and text backgrounds) used **minor version bumps**.
4. **Tooling & Architectural Milestone**: Includes the new static test harness (`scripts/check-newtab-static.mjs`, `smoke-newtab-file.mjs`), module folder reorganization (`src/newtab/`), and complete synchronization of `package.json`.

### 3.2 Alternative Option: `v0.14.1` (Patch Bump)

**Alternative**: Bump from `0.14.0` to **`0.14.1`**.

**Consideration**:
If the maintainer wishes to reserve `v0.15.0` strictly for Phase 2 architectural extractions (e.g. decoupling the Search Subsystem or CSS decomposition), this release can be categorized as a patch release focusing on data integrity, style bug fixes, and testing harnesses.

### 3.3 Decision Matrix

| Evaluation Dimension | `v0.15.0` (Recommended) | `v0.14.1` (Alternative) |
| :--- | :--- | :--- |
| **Semantic Accuracy** | **High** (Adds new backup capability, new UI styles) | Moderate (Treats changes as bug fixes) |
| **Consistency with History** | **High** (Matches cadence of 0.12.0 -> 0.13.0 -> 0.14.0) | Moderate |
| **User Perception** | Communicates notable reliability and styling upgrade | Communicates minor patch |
| **Web Store Review Impact** | Normal review cycle (no new permissions requested) | Normal review cycle |

---

## 4. Changes Included in This Release

### 4.1 Feature & Data Integrity Improvements
- **Custom Wallpaper Backup Support**:
  - Registered `myWallpapers` key in `HOMEBASE_OWNED_STORAGE_KEYS`.
  - Implemented `normalizeMyWallpapersItems()` sanitization helper to validate uploaded wallpaper descriptors.
  - Added legacy backup preservation guard in `importHomebaseState()`, ensuring older backups missing `myWallpapers` never delete existing custom wallpapers.
  - Eliminates Critical Issue TD1 and closes the data-loss gap identified in audit.

### 4.2 UI & Styling Enhancements
- **Settings Modal Styling Modularization**:
  - Extracted settings modal and widget settings styles into `src/newtab/styles/settings.css`.
  - Added drag-and-drop visual indicators and grab handles for search engine reordering.
  - Refined responsive layout for feedback cards and settings grid.
- **Gallery Styling Separation**:
  - Extracted wallpaper gallery styles into `src/newtab/styles/gallery.css`.
  - Improved contrast and thumbnail grid spacing in My Wallpapers panel.

### 4.3 Architecture & Modular Extractions
- **Domain Structure Organization**:
  - Cleanly isolated `action-popup/` into its own self-contained folder.
  - Moved lazy-loaded UI modules (`settings-ui.js`, `gallery-ui.js`) into domain-specific paths under `src/newtab/settings/` and `src/newtab/wallpaper/`.
  - Cleaned up obsolete path references in build scripts.

### 4.4 Quality Assurance & Testing Infrastructure
- **Automated Static Verification Suite**:
  - Integrated [scripts/check-newtab-static.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/check-newtab-static.mjs) checking 37 deferred scripts, 33 module paths, script load order, and 87 global declaration names.
- **Browser Smoke Harness**:
  - Integrated [scripts/smoke-newtab-file.mjs](file:///c:/Users/Administrator/Desktop/Homebase/scripts/smoke-newtab-file.mjs) validating DOM structure, modal presence, and element contracts.
- **Dual-Manifest Validation**:
  - Automated manifest validation in `scripts/build.mjs` verifying zero forbidden Gecko keys in Chrome packages.

---

## 5. User-Facing Improvements & Release Notes

### 5.1 User Highlights
1. **Custom Wallpaper Portability**: Your uploaded wallpaper collection is now fully preserved when exporting and restoring dashboard settings or migrating to a new machine.
2. **Refined Settings & Search Customization**: Polished settings modal layout with smooth drag-and-drop reordering for search engines.
3. **Rock-Solid Backup Safety**: Restoring older backup files will no longer reset or delete your active custom wallpapers or task items.

---

### 5.2 Draft `WHATS_NEW` Data Object
To be updated in [src/data.js](file:///c:/Users/Administrator/Desktop/Homebase/src/data.js#L147-L175):

```javascript
const WHATS_NEW = {
  version: '0.15.0',
  date: '2026-09-26',
  items: [
    {
      type: 'NEW',
      title: 'Wallpaper backup',
      desc: 'Settings backup and export now preserves your custom uploaded wallpaper collection across profiles.'
    },
    {
      type: 'IMPROVED',
      title: 'Settings styling',
      desc: 'Settings modals now feature smoother search engine reordering and refined responsive layout.'
    },
    {
      type: 'FIX',
      title: 'Import protection',
      desc: 'Importing settings backups now protects your active custom wallpapers and tasks from accidental deletion.'
    },
    {
      type: 'IMPROVED',
      title: 'Module architecture',
      desc: 'Core settings and gallery systems load from streamlined, verified first-party modules.'
    }
  ]
};
```

---

### 5.3 Draft `CHANGELOG.md` Entry
To be prepended in [src/CHANGELOG.md](file:///c:/Users/Administrator/Desktop/Homebase/src/CHANGELOG.md#L5):

```markdown
## v0.15.0 — 2026-09-26
### Added
- Custom wallpaper collections in "My Wallpapers" are now included in Settings backup export and restore.
- Added sanitization and deduplication for custom wallpaper metadata on import.

### Improved
- Settings modal and wallpaper gallery styling now load through dedicated first-party stylesheets.
- Search engine reordering in settings features clearer drag handles and responsive layout polish.
- Added comprehensive static verification suite to validate script load order and declaration safety.

### Fixed
- Restoring legacy backup files no longer removes existing custom wallpaper collections or todo items.
- Harmonized repository package metadata with active extension manifests.
```

---

## 6. Migration Concerns & Backward Compatibility

### 6.1 Storage Schema Impact
- **Key Added**: `'myWallpapers'` in `browser.storage.local`.
- **Nature of Change**: Additive. The key was already written by `src/newtab/wallpaper/gallery-ui.js`; it is now officially tracked in `HOMEBASE_OWNED_STORAGE_KEYS`.
- **Migration Required**: **None**. Existing users with custom wallpapers already have this key populated; it will seamlessly be included in their next backup export.

### 6.2 Backward Compatibility with Legacy Backups
- **Older Backups on v0.15.0**: When a user imports a backup JSON generated on v0.14.0 or older (which lacks `myWallpapers`), the import guard explicitly skips `removals.push('myWallpapers')`. Existing custom wallpapers remain completely intact.
- **v0.15.0 Backups on Older Versions**: If a user imports a v0.15.0 backup JSON on an older Homebase installation, older versions simply ignore unknown keys in `storageLocal` without throwing errors.

### 6.3 Extension Permissions & Store Review Posture
- **Permissions Changed**: **None**.
  - Chrome: `tabs`, `cookies`, `storage`, `history`, `bookmarks`, `clipboardRead`.
  - Firefox: `tabs`, `cookies`, `storage`, `history`, `bookmarks`, `clipboardRead`, `contextualIdentities`.
- **Host Permissions Changed**: **None**.
- **Review Speed**: Because zero permissions were added, Chrome Web Store and Mozilla AMO reviews will proceed under standard automated expedited pipelines (typically 12–24 hours).

---

## 7. Release Execution Checklist

When approval is granted to prepare the release, execute the following phased sequence:

```
+-------------------------------------------------------------------------------+
|                       v0.15.0 RELEASE GATEKEEPER PHASES                       |
+-------------------------------------------------------------------------------+
| [ ] Phase 1: Pre-Release Verification (Static checks, syntax, clean builds)   |
| [ ] Phase 2: Metadata Updates (manifest.chrome, manifest.firefox, pkg, data)  |
| [ ] Phase 3: Clean Target Compilation (npm.cmd run build)                     |
| [ ] Phase 4: Production Packaging (npm.cmd run zip:chrome & zip:firefox)      |
| [ ] Phase 5: Production Archive Inspection (tar -tf, root manifest check)     |
| [ ] Phase 6: Cross-Browser Manual Sanity Pass (Chrome & Firefox dev load)     |
| [ ] Phase 7: Atomic Release Commit & Git Tagging (feat(release): prepare ...) |
| [ ] Phase 8: Store Submissions (CWS Developer Dashboard & Mozilla AMO)        |
+-------------------------------------------------------------------------------+
```

### Phase 1: Pre-Release Verification
- [ ] Confirm working directory is clean: `git status` reports zero unintended modifications.
- [ ] Run syntax check across all JavaScript files: `node --check src/newtab/settings/backup-import.js`.
- [ ] Run static integrity checks: `node scripts/check-newtab-static.mjs` (must pass 11/11 checks).
- [ ] Run DOM structure smoke test: `node scripts/smoke-newtab-file.mjs`.

### Phase 2: Synchronized Metadata Updates
Update exactly the 5 release metadata files:
- [ ] `manifests/manifest.chrome.json` (line 4): `"version": "0.15.0"`
- [ ] `manifests/manifest.firefox.json` (line 4): `"version": "0.15.0"`
- [ ] `package.json` (line 3): `"version": "0.15.0"`
- [ ] `src/data.js` (lines 147–175): update `WHATS_NEW` version to `'0.15.0'`, date to `'2026-09-26'`, and items array.
- [ ] `src/CHANGELOG.md` (line 5): prepend `## v0.15.0 — 2026-09-26` release notes.
- [ ] *Invariant*: Confirm **zero** application source code or UI logic is modified during metadata update.

### Phase 3: Clean Compilation & Packaging
- [ ] Clean prior build artifacts: `if (Test-Path dist) { Remove-Item -Recurse -Force dist }`.
- [ ] Compile both targets: `npm.cmd run build`.
- [ ] Package Chrome upload archive: `npm.cmd run zip:chrome` -> produces `dist/homebase-chrome-0.15.0.zip`.
- [ ] Package Firefox upload archive: `npm.cmd run zip:firefox` -> produces `dist/homebase-firefox-0.15.0.zip`.

### Phase 4: Archive Structural Inspection
- [ ] Confirm `dist/homebase-chrome-0.15.0.zip` contains `manifest.json` at root:
  `tar -tf dist/homebase-chrome-0.15.0.zip | Select-Object -First 5`.
- [ ] Confirm Chrome package excludes `browser_specific_settings` and `contextualIdentities`.
- [ ] Confirm Firefox package preserves `browser_specific_settings.gecko.id: "rokonmagura@gmail.com"`.
- [ ] Confirm zero `.git`, `node_modules`, or root markdown files leaked into the ZIP archives.

### Phase 5: Cross-Browser Manual Sanity Pass
- [ ] **Google Chrome**: Load unpacked `dist/chrome`. Verify zero console errors, new-tab instant load, and What's New badge unread state.
- [ ] **Chrome Backup Test**: Navigate to Settings -> Backup -> Export Data. Verify `homebase-backup-*.json` contains `"myWallpapers"` key.
- [ ] **Mozilla Firefox**: Load temporary add-on `dist/firefox/manifest.json`. Verify container context menu on bookmarks and storage persistence.

### Phase 6: Git Commit & Tagging
- [ ] Stage only the release metadata files:
  `git add manifests/manifest.chrome.json manifests/manifest.firefox.json package.json src/data.js src/CHANGELOG.md docs/`
- [ ] Verify `dist/` and `*.zip` are **not** staged: `git status`.
- [ ] Create release commit:
  `git commit -m "feat(release): prepare v0.15.0"`
- [ ] Create annotated release tag:
  `git tag -a v0.15.0 -m "Release v0.15.0"`
- [ ] Note: Wait for explicit user instruction before pushing to remote repository (`git push origin main --tags`).

### Phase 7: Store Submissions
- [ ] Upload `dist/homebase-chrome-0.15.0.zip` to Chrome Web Store Developer Console.
- [ ] Upload `dist/homebase-firefox-0.15.0.zip` to Mozilla Add-ons Developer Hub (AMO).
- [ ] Paste release notes from `src/CHANGELOG.md` into store version listings.

### Phase 8: Post-Release Propagation Verification
- [ ] Verify store approval notifications.
- [ ] Confirm extension auto-updates cleanly on production user profiles.
