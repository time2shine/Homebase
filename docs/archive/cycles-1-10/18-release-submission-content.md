# Homebase v0.15.0 — Release & Store Submission Content

> **Document**: Store Submission Packages & Release Notes  
> **Target Version**: `0.15.0`  
> **Previous Version**: `0.14.0`  
> **Date**: 2026-09-26  
> **Source Baseline**: Commit `7c8d80b` + verified metadata updates  
> **Governing Standards**: [AGENTS.md](file:///c:/Users/Administrator/Desktop/Homebase/AGENTS.md), [docs/12-release-process.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/12-release-process.md), [docs/17-release-plan.md](file:///c:/Users/Administrator/Desktop/Homebase/docs/17-release-plan.md)

---

# 1. Firefox Release Notes

*User-facing release notes for Mozilla Add-ons (AMO) listing.*

### What's new in Homebase 0.15.0

- **Custom Wallpaper Metadata Backup**: Exporting your settings backup now includes metadata for your custom uploaded wallpaper collection (titles, timestamps, and settings). Note that underlying image and video binary files remain stored in your local browser cache and are not serialized into the JSON backup file.
- **Wallpaper Import Protection**: Restoring older backup files that lack wallpaper entries will no longer delete your current custom wallpaper listings.
- **Settings Modal Styling**: Improved layout and smoother drag-and-drop reordering for custom search engines in Settings.
- **Wallpaper Gallery Refinement**: Cleaner thumbnail grid presentation and improved contrast in the "My Wallpapers" panel.
- **Startup Reliability**: Added automated static verification to validate script loading order and prevent duplicate global declarations on new-tab startup.

---

# 2. Firefox Notes to Reviewer

*Technical submission notes for Mozilla Add-ons review staff.*

## Release Scope
Homebase v0.15.0 is a minor maintenance and reliability update from v0.14.0. The release addresses data integrity in the settings backup/import subsystem (specifically including custom wallpaper metadata descriptors and guarding against unintended deletion on restore), modular styling extraction for the settings and gallery modals, and internal static integrity verification tooling.

The application architecture is unchanged: Homebase continues to execute as classic deferred `<script defer>` scripts without runtime ES modules, bundlers, or third-party runtime dependencies.

## Key Functional Changes
1. **Backup Subsystem Metadata Inclusion (`src/newtab/settings/backup-import.js`)**:
   - Added `'myWallpapers'` to `HOMEBASE_OWNED_STORAGE_KEYS`.
   - Added `normalizeMyWallpapersItems()` sanitization and deduplication helper function for imported custom wallpaper descriptors.
   - Added a preservation guard in `importHomebaseState()` ensuring that if an imported backup lacks the `myWallpapers` key, current custom wallpaper metadata is not removed.
2. **Search Engine Reordering & Settings UI (`src/newtab/styles/settings.css`)**:
   - Extracted settings modal styles into a dedicated stylesheet with visual drag handles and responsive cards for search engine ordering.
3. **Gallery UI Modular Styling (`src/newtab/styles/gallery.css`)**:
   - Extracted wallpaper gallery styles into a dedicated stylesheet for category filter tabs and thumbnail grids.
4. **Action Popup Organization (`src/action-popup/`)**:
   - Moved toolbar popup assets into a self-contained folder (`action-popup/action-popup.html`, `.css`, `.js`) and updated `default_popup` path in `manifest.json`.

## Permissions
The extension requests the following permissions in `manifests/manifest.firefox.json`:

| Permission | Category | Purpose in Homebase (Source-Verified) |
| :--- | :--- | :--- |
| `storage` | Standard | Persisting user dashboard preferences, bookmark metadata, widget states, and custom wallpaper descriptors in `browser.storage.local`. |
| `bookmarks` | Sensitive | Reading, displaying, searching, and modifying bookmark trees and folder structures in the dashboard grid and dock. |
| `tabs` | Standard | Creating tabs for bookmarks, detecting current tab state when adding bookmarks, and opening tabs in specific containers. |
| `history` | Sensitive | Providing optional autocomplete results in the dashboard search overlay when user enables browser history search. |
| `cookies` | Sensitive | Required by Firefox's `browser.tabs.create({ url, cookieStoreId })` API to open bookmarks in user-selected Multi-Account Containers (`src/newtab/integrations/firefox-containers.js`). Homebase does not read, write, modify, or transmit any HTTP cookie data. |
| `clipboardRead` | Sensitive | Supporting one-click URL pasting when adding a bookmark via the bookmark modal. |
| `contextualIdentities` | Gecko-only | Querying Firefox Multi-Account Containers (`browser.contextualIdentities.query`) to populate container context menus for bookmarks. |

### Permission Change Audit
- **Git diff vs v0.14.0**: A full check of `git diff v0.14.0 manifests/manifest.firefox.json` confirms that **zero new permissions** and **zero new host permissions** were added in v0.15.0.
- All 7 permissions and 17 host permissions are identical to v0.14.0.

## External Network Requests
All network communications are initiated directly from the client browser and are strictly limited to declared host permissions. Homebase does not operate an intermediary server:

| Remote Host Pattern | Service / Endpoint | Technical Purpose |
| :--- | :--- | :--- |
| `https://api.open-meteo.com/*`<br>`https://geocoding-api.open-meteo.com/*` | Open-Meteo Weather API | Fetches weather forecasts and reverse-geocodes city names according to coordinates configured by the user. Requests are sent directly from the browser; Homebase does not operate an intermediary server. |
| `https://completion.amazon.com/*`<br>`https://duckduckgo.com/ac/*`<br>`https://suggestqueries.google.com/*`<br>`https://api.bing.com/osjson.aspx*`<br>`https://ff.search.yahoo.com/*`<br>`https://suggest.yandex.com/*` | Public Search Suggestion APIs | Fetches live search query completions as the user types into the dashboard search bar. Requests are fired directly from the browser only to the provider selected by the user. |
| `https://t2.gstatic.com/*` | Google Favicon Service | Resolves website favicons for bookmark shortcuts. |
| `https://pub-552ebdc4e1414c8594cec0ac58404459.r2.dev/*` | Curated Wallpaper CDN (Cloudflare R2) | Delivers official curated static wallpaper images and background video loops chosen by the user from the wallpaper gallery. |
| `https://feeds.bbci.co.uk/*`<br>`https://www.aljazeera.com/*`<br>`https://feeds.feedburner.com/*`<br>`https://www.espn.com/*`<br>`https://www.espncricinfo.com/*` | Public RSS & Sports Feeds | Fetches public headline summaries and sports scores for optional sidebar widgets when enabled by the user. |

## Data & Privacy
- **Storage Location**: All user settings, bookmarks metadata, custom wallpaper descriptors, and task lists are stored locally in the browser's sandbox using `browser.storage.local`.
- **No Analytics/Telemetry Backend**: Homebase does not operate any analytics server, tracking service, telemetry beacon, or user account backend. `manifest.firefox.json` declares `"data_collection_permissions": { "required": ["none"], "optional": [] }`.
- **Settings Backup File Generation**: Settings exports are assembled locally in-memory as a plain JSON Blob (`homebase-backup-YYYY-MM-DD.json`) and saved using browser object URLs. No data is transmitted externally.

## Custom Wallpaper Backup Change
The custom wallpaper subsystem divides data into two layers:
1. **Metadata Descriptors (`myWallpapers` in `browser.storage.local`)**: An array of lightweight objects describing each user-uploaded wallpaper (`id`, `title`, `type`, `mimeType`, `cacheKey`, `posterCacheKey`, `size`, `createdAt`).
2. **Binary Media Files (`user-wallpapers-v1` in Cache Storage API)**: High-resolution image/video binary blobs stored locally in the browser's native `caches` API.

**Technical Scope and Limitations**:
- In v0.15.0, `exportHomebaseState()` now includes the `myWallpapers` metadata array in the exported JSON file.
- **Important Limitation**: The backup JSON contains **only metadata descriptors**; it does **not** contain or serialize heavy image or video binary files from the Cache Storage API. Restoring a backup on the same browser profile preserves custom wallpaper cards and cache references. If a backup is imported into a fresh profile where the local Cache Storage is empty, the metadata entries will restore, but binary media files will not display until re-uploaded or re-cached.
- **Import Preservation Guard**: In `importHomebaseState()`, `myWallpapers` was added alongside pre-existing guards (`todoItems`, `todoHideDone`) to prevent older backup files lacking wallpaper data from deleting the user's existing custom wallpaper metadata.

## Testing Performed
In accordance with repository maintenance logs (`docs/13-maintenance-log.md` and `docs/14-ai-change-history.md`), the following tests have been executed:

- `node --check src/newtab/settings/backup-import.js`: Passed (Code 0)
- `node --check src/data.js`: Passed (Code 0)
- `node --check dist/firefox/new-tab.js`: Passed (Code 0)
- `node scripts/check-newtab-static.mjs`: Passed (Code 0; 11/11 tests passed, verifying 37 deferred scripts, 33 module paths, script order, and 87 declaration names)
- `node scripts/smoke-newtab-file.mjs`: Passed (Code 0)
- `npm.cmd run build`: Passed (Code 0; compiled `dist/firefox` and `dist/chrome`)
- `npm.cmd run zip:firefox`: Passed (Code 0; built `dist/homebase-firefox-0.15.0.zip`)
- Custom wallpaper unit tests (backup key registration, sanitization, legacy preservation guard): 5/5 passed.

> [!IMPORTANT]
> **Manual Firefox Testing Status**: Automated static verification and syntax checks are complete. Manual cross-browser testing on a physical Firefox profile (specifically testing temporary add-on loading and Gecko Multi-Account Container menu actions) has not yet been completed and requires maintainer verification prior to store submission.

## Reviewer Test Steps
To verify the primary changes in v0.15.0:

1. **Load Extension in Firefox**:
   - Navigate to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...** and select `dist/firefox/manifest.json`.
2. **Open New Tab**:
   - Open a new tab (`Ctrl + T`). Dashboard should load immediately without console errors.
3. **Verify Settings & Reordering**:
   - Open Settings (gear icon) -> **Search Engine**. Verify search engine items can be reordered using drag handles.
4. **Verify Wallpaper Backup Export**:
   - Navigate to Settings -> **Backup & Import**.
   - Click **Export Data**. A file named `homebase-backup-YYYY-MM-DD.json` will download.
   - Open the JSON file in an editor and confirm `"myWallpapers"` key is present inside `storageLocal`.
5. **Verify Import Protection**:
   - In Settings -> **Backup & Import**, import a backup file that does not contain a `myWallpapers` key.
   - Confirm that existing custom wallpaper metadata entries remain intact.

## Build Information
- **Source Directory**: `src/`
- **Firefox Manifest**: `manifests/manifest.firefox.json` (`strict_min_version`: `142.0`)
- **Firefox Output Directory**: `dist/firefox/`
- **Firefox ZIP Archive**: `dist/homebase-firefox-0.15.0.zip`
- **Build Commands** (reproducible with Node.js 18+ on Windows/macOS/Linux):
  ```bash
  # Compile Firefox unpacked build:
  node scripts/build.mjs firefox

  # Or via npm script:
  npm run build:firefox

  # Package production Firefox ZIP:
  node scripts/build.mjs zip firefox
  # Output: dist/homebase-firefox-0.15.0.zip
  ```

---

# 3. GitHub Release Title

### Recommended Title
**Homebase v0.15.0 — Wallpaper Metadata Backup and Settings Styling**

### Optional Alternatives
1. *Homebase v0.15.0 — Custom Wallpaper Backup Support and UI Polish*
2. *Homebase v0.15.0 — Wallpaper Backup Metadata, Modular Styling, and Static Verification*

---

# 4. GitHub Release Notes

# Homebase v0.15.0

Homebase v0.15.0 brings data integrity improvements to settings backup and restore, dedicated modular styling for settings and gallery modals, and automated static verification tooling to ensure reliable startup performance across Google Chrome and Mozilla Firefox.

## Highlights
- **Custom Wallpaper Metadata Backup**: Settings backup export now preserves metadata for your custom uploaded wallpaper collection (titles, timestamps, and display preferences).
- **Wallpaper Import Protection**: Restoring older backup files that lack wallpaper entries will no longer delete your current custom wallpaper listings.
- **Smoother Settings Experience**: Polished settings modal layout with visual drag handles for custom search engine reordering.

## What's New
- **Custom Wallpaper Metadata Export**: The backup subsystem now tracks `'myWallpapers'` in `browser.storage.local`. Uploaded wallpaper titles, timestamps, and cache references are preserved in your backup JSON files.
- **Sanitized Wallpaper Import**: Added sanitization and deduplication routines for custom wallpaper descriptors during import to prevent invalid data structures.

## Fixes
- **Custom Wallpaper Deletion on Restore**: Fixed an issue where restoring older backup files that lacked wallpaper keys would remove existing custom wallpaper listings.

## Improvements
- **Modular Stylesheets**: Extracted settings modal styles into `src/newtab/styles/settings.css` and wallpaper gallery styles into `src/newtab/styles/gallery.css`.
- **Search Reordering**: Added visual drag handles and responsive card styling for search engine reordering in Settings.
- **Gallery Contrast**: Enhanced thumbnail card spacing and empty-state contrast in the "My Wallpapers" panel.

## Under the Hood
- **Automated Static Verification Suite**: Integrated `scripts/check-newtab-static.mjs` into pre-release validation, checking 37 deferred local scripts, 33 module paths, script load order, and 87 global declaration names.
- **Self-Contained Action Popup**: Reorganized toolbar action popup assets into `src/action-popup/` for cleaner project structure.
- **Dual-Manifest Packaging**: Build automation (`scripts/build.mjs`) generates clean Manifest V3 distribution directories and packages for Chrome and Firefox targets.

## Browser Support
- **Chrome / Chromium MV3**: Built for Chromium-based browsers running Manifest V3 (`dist/chrome`, `dist/homebase-chrome-0.15.0.zip`).
- **Firefox MV3**: Built for Mozilla Firefox 142.0+ running Manifest V3 (`dist/firefox`, `dist/homebase-firefox-0.15.0.zip`).

## Upgrade Notes
- **Storage Compatibility**: Upgrading to v0.15.0 requires no data migration. All existing bookmarks, settings, and custom wallpapers remain intact.
- **Backup Scope**: Settings backup files contain wallpaper metadata. Because raw image and video binary files are stored in the browser's local Cache Storage API (`user-wallpapers-v1`), moving a backup to a completely fresh profile preserves wallpaper metadata cards, but physical binary media files should be re-uploaded if local cache is cleared.

## Downloads
- **Google Chrome**: `<attach dist/homebase-chrome-0.15.0.zip>`
- **Mozilla Firefox**: `<attach dist/homebase-firefox-0.15.0.zip>`
